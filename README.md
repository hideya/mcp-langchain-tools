# MCP Server To LangChain Tools Conversion Utility [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/mcp-langchain-tools/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@h1deya/mcp-langchain-tools.svg)](https://www.npmjs.com/package/@h1deya/mcp-langchain-tools)

This package is intended to simplify the use of MCP server tools within LangChain.

It contains a utility function `convertMCPServersToLangChainTools()`
that initializes specified MCP servers,
and returns [LangChain Tools](https://js.langchain.com/docs/how_to/tool_calling/)
that wrap all the available MCP server tools.

## Installation

```bash
npm i @h1deya/mcp-langchain-tool
```

## Quick Start

`convertMCPServersToLangChainTools()` utility function accepts MCP server configuration
in pretty much the same format as a JS Object interpretation of the JSON format used by
[Claude for Desktop](https://modelcontextprotocol.io/quickstart/user)
(it just needs the contents of the `mcpServers` property).
e.g.:

```ts
const mcpServers: MCPServersConfig = {
  filesystem: {
    command: 'npx',
    args: [
      '-y',
      '@modelcontextprotocol/server-filesystem',
      '/Users/username/Desktop'  // path to a directory to allow access to
    ]
  },
  fetch: {
    command: 'uvx',
    args: [
      'mcp-server-fetch'
    ]
  }
};

const { tools, cleanup } = await convertMCPServersToLangChainTools(mcpServers);
```

The utility functoin initializes all the MCP server connections concurrently,
and returns LangChain Tools (`tools: DynamicStructuredTool[]`)
by gathering all the available MCP server tools,
and by wrapping them into [LangChain Tools](https://js.langchain.com/docs/how_to/tool_calling/).
It also returns `cleanup` callback function
which is used to close all the connections to the MCP servers when finished.

The returned tools can be used with LangChain, e.g.:

```ts
const agent = createReactAgent({
  llm: llmModel,
  tools: tools,
  checkpointSaver: new MemorySaver()
});
```
A simple but complete usage example can be found in
[here](https://github.com/hideya/mcp-langchain-tools-usage/blob/main/src/index.ts)
