import { jest, describe, expect } from '@jest/globals';
// import type { Mock } from 'jest-mock';

// Create mock functions first
// NOTE: ESM imports are evaluated when the module is loaded and
// Once a module is loaded, it's cached and subsequent imports will use the cached version.
// Importing before mocking results in getting the real implementations instead of the mocks.
// This is specific to ESM - in CommonJS, jest.mock() is hoisted to the top of the file automatically,
// but with ESM we need to be explicit about the order.
const mockConnect = jest.fn();
const mockRequest = jest.fn();
const mockClose = jest.fn();
const mockStdioTransport = jest.fn().mockImplementation(() => ({
  close: mockClose
}));
const mockClient = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
  request: mockRequest
}));

// Mock the ESM modules
// Use jest.unstable_mockModule instead of jest.mock
await jest.unstable_mockModule('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: mockClient
}));

await jest.unstable_mockModule('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mockStdioTransport
}));

// Import after mocking
import { convertMCPServersToLangChainTools, MCPServersConfig } from '../src/mcp-langchain-tools.js';

describe('convertMCPServersToLangChainTools', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Default mock responses
    mockConnect.mockImplementation(() => Promise.resolve());
    mockRequest.mockImplementation((req) => {
      const request = req as { method: string; params?: any };
      if (request.method === 'tools/list') {
        return Promise.resolve({
          tools: [{
            name: 'testTool',
            description: 'A test tool',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' }
              }
            }
          }]
        });
      }
      if (request.method === 'tools/call') {
        return Promise.resolve({
          content: [{ type: 'text', text: 'Test result' }]
        });
      }
      return Promise.reject(new Error('Unknown method'));
    });
  });

  test('successfully initializes MCP servers and creates tools', async () => {
    const config: MCPServersConfig = {
      testServer: {
        command: 'test-command',
        args: ['--test']
      }
    };

    const { tools, cleanup } = await convertMCPServersToLangChainTools(config);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('testTool');
    expect(mockStdioTransport).toHaveBeenCalledWith({
      command: 'test-command',
      args: ['--test'],
      env: undefined
    });
    expect(mockConnect).toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledWith(
      { method: 'tools/list' },
      expect.any(Object)
    );

    // Test cleanup
    await cleanup();
    expect(mockClose).toHaveBeenCalled();
  });

  test('handles initialization errors gracefully', async () => {
    mockConnect.mockImplementation(() => Promise.reject(new Error('Connection failed')));

    const config: MCPServersConfig = {
      failingServer: {
        command: 'failing-command',
        args: []
      }
    };

    const { tools } = await convertMCPServersToLangChainTools(config);

    expect(tools).toHaveLength(0);
    expect(mockClose).toHaveBeenCalled();
  });

  test('tool execution returns expected results', async () => {
    const config: MCPServersConfig = {
      testServer: {
        command: 'test-command',
        args: []
      }
    };

    const { tools } = await convertMCPServersToLangChainTools(config);
    const result = await tools[0].func({ input: 'test' });

    expect(result).toBe('Test result');
    expect(mockRequest).toHaveBeenCalledWith(
      {
        method: 'tools/call',
        params: {
          name: 'testTool',
          arguments: { input: 'test' }
        }
      },
      expect.any(Object)
    );
  });
});
