// Copyright (C) 2024 Hideya Kawahara
// SPDX-License-Identifier: MIT

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { jsonSchemaToZod, JsonSchema } from '@n8n/json-schema-to-zod';
import { z } from 'zod';
import { Logger } from './logger.js';

interface MCPServerConfig {
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
}

export interface MCPServersConfig {
  [key: string]: MCPServerConfig;
}

interface LogOptions {
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

interface MCPError extends Error {
  serverName: string;
  details?: unknown;
}

export interface MCPServerCleanupFunction {
  (): Promise<void>;
}

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

export async function convertMCPServersToLangChainTools(
  configs: MCPServersConfig,
  options?: LogOptions
): Promise<{
  tools: DynamicStructuredTool[];
  cleanup: MCPServerCleanupFunction;
}> {
  const allTools: DynamicStructuredTool[] = [];
  const cleanupCallbacks: MCPServerCleanupFunction[] = [];
  const logger = new Logger({ level: options?.logLevel || 'info' });

  const serverInitPromises = Object.entries(configs).map(async ([name, config]) => {
    logger.info(`Initializing MCP server "${name}"`);
    logger.debug(`with config: `, config);
    const result = await convertMCPServerToLangChainTools(name, config, logger);
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

  logger.info(`MCP servers initialized and found ${allTools.length} tool(s) in total:`);
  allTools.forEach((tool) => logger.info(`- ${tool.name}`));

  return { tools: allTools, cleanup };
}

async function convertMCPServerToLangChainTools(
  serverName: string,
  config: MCPServerConfig,
  logger: Logger
): Promise<{
  tools: DynamicStructuredTool[];
  cleanup: MCPServerCleanupFunction;
}> {
  let transport: StdioClientTransport | null = null;
  let client: Client | null = null;

  try {
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args as string[],
      env: config.env,
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

    const toolsResponse = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema
    );

    logger.info(`MCP server "${serverName}": connected`);

    const tools = toolsResponse.tools.map((tool) => (
      new DynamicStructuredTool({
        name: tool.name,
        description: tool.description || '',
        // FIXME
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: jsonSchemaToZod(tool.inputSchema as JsonSchema) as z.ZodObject<any>,

        func: async (input) => {
          logger.info(`MCP Tool "${tool.name}" received input:`, input);

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

          const roughLength = JSON.stringify(result).length;
          logger.info(`MCP Tool "${tool.name}" received result (length: ${roughLength})`);
          logger.debug('result:', result);

          const filteredResult = result?.content
            .filter(content => content.type === 'text')
            .map(content => content.text)
            .join('\n\n');

          // return JSON.stringify(result.content);
          return filteredResult;
        },
      })
    ));

    logger.info(`MCP server "${serverName}": found ${tools.length} tool(s)`);
    tools.forEach((tool) => logger.debug(`- ${tool.name}`));

    async function cleanup(): Promise<void> {
      if (transport) {
        await transport.close();
        logger.info(`Closed MCP connection to "${serverName}"`);
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
