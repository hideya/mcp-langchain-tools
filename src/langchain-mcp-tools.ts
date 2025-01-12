import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { jsonSchemaToZod, JsonSchema } from '@n8n/json-schema-to-zod';
import { z } from 'zod';
import { Logger } from './logger.js';

// Base configuration types for MCP servers
interface McpServerConfig {
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
}

export interface McpServersConfig {
  [key: string]: McpServerConfig;
}

interface LogOptions {
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

interface MCPError extends Error {
  serverName: string;
  details?: unknown;
}

export interface McpServerCleanupFunction {
  (): Promise<void>;
}

// Custom error type for MCP server initialization failures
class MCPInitializationError extends Error implements MCPError {
  constructor(
    public serverName: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'MCPInitializationError';
  }
}

// Primary function to convert multiple MCP servers to LangChain tools
export async function convertMcpToLangchainTools(
  configs: McpServersConfig,
  options?: LogOptions
): Promise<{
  tools: DynamicStructuredTool[];
  cleanup: McpServerCleanupFunction;
}> {
  const allTools: DynamicStructuredTool[] = [];
  const cleanupCallbacks: McpServerCleanupFunction[] = [];
  const logger = new Logger({ level: options?.logLevel || 'info' });

  const serverInitPromises = Object.entries(configs).map(async ([name, config]) => {
    const result = await convertSingleMcpToLangchainTools(name, config, logger);
    return { name, result };
  });

  // Track server names alongside their promises
  const serverNames = Object.keys(configs);

  // Concurrently initialize all the MCP servers
  const results = await Promise.allSettled(
    serverInitPromises
  );

  // Process successful initializations and log failures
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { result: { tools, cleanup } } = result.value;
      allTools.push(...tools);
      cleanupCallbacks.push(cleanup);
    } else {
      logger.error(`MCP server "${serverNames[index]}": failed to initialize: ${result.reason.details}`);
      throw result.reason;
    }
  });

  async function cleanup(): Promise<void> {
    // Concurrently execute all the callbacks
    const results = await Promise.allSettled(cleanupCallbacks.map(callback => callback()));

    // Log any cleanup failures
    const failures = results.filter(result => result.status === 'rejected');
    failures.forEach((failure, index) => {
      logger.error(`MCP server "${serverNames[index]}": failed to close: ${failure.reason}`);
    });
  }

  logger.info(`MCP servers initialized: ${allTools.length} tool(s) available in total`);
  allTools.forEach((tool) => logger.debug(`- ${tool.name}`));

  return { tools: allTools, cleanup };
}

// Convert a single MCP server into LangChain tools
async function convertSingleMcpToLangchainTools(
  serverName: string,
  config: McpServerConfig,
  logger: Logger
): Promise<{
  tools: DynamicStructuredTool[];
  cleanup: McpServerCleanupFunction;
}> {
  let transport: StdioClientTransport | null = null;
  let client: Client | null = null;

  logger.info(`MCP server "${serverName}": initializing with: ${JSON.stringify(config)}`);

  // NOTE: Some servers (e.g. Brave) seem to require PATH to be set.
  // To avoid confusion, it was decided to automatically append it to the env
  // if not explicitly set by the config.
  const env = { ...config.env };
  if (!env.PATH) {
    env.PATH = process.env.PATH || '';
  }

  try {
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args as string[],
      env: env,
    });

    client = new Client(
      {
        name: "mcp-client",
        version: "0.0.1",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
    logger.info(`MCP server "${serverName}": connected`);

    const toolsResponse = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema
    );

    const tools = toolsResponse.tools.map((tool) => (
      new DynamicStructuredTool({
        name: tool.name,
        description: tool.description || '',
        // FIXME
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: jsonSchemaToZod(tool.inputSchema as JsonSchema) as z.ZodObject<any>,

        func: async (input) => {
          logger.info(`MCP tool "${serverName}"/"${tool.name}" received input:`, input);

          // Execute tool call
          const result = await client?.request(
            {
              method: "tools/call",
              params: {
                name: tool.name,
                arguments: input,
              },
            },
            CallToolResultSchema
          );

          const resultStringfied = JSON.stringify(result?.content)
          const roughLength = resultStringfied.length;
          logger.info(`MCP tool "${serverName}"/"${tool.name}" received result (length: ${roughLength})`);
          logger.debug('result:', result?.content);
          return resultStringfied;
        },
      })
    ));

    logger.info(`MCP server "${serverName}": ${tools.length} tool(s) available:`);
    tools.forEach((tool) => logger.info(`- ${tool.name}`));

    async function cleanup(): Promise<void> {
      if (transport) {
        await transport.close();
        logger.info(`MCP server "${serverName}": session closed`);
      }
    }

    return { tools, cleanup };
  } catch (error: unknown) {
    // Proper cleanup in case of initialization error
    if (transport) {
      try {
        await transport.close();
      } catch (cleanupError) {
        // Log cleanup error but don't let it override the original error
        logger.error(`Failed to cleanup during initialization error: ${cleanupError}`);
      }
    }
    throw new MCPInitializationError(
      serverName,
      `Failed to initialize MCP server: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}
