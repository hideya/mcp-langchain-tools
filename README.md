# MCP To LangChain Tools Conversion Utility / TypeScript [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/langchain-mcp-tools-ts/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/@h1deya/langchain-mcp-tools.svg)](https://www.npmjs.com/package/@h1deya/langchain-mcp-tools)

This package is intended to simplify the use of
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server tools with LangChain / TypeScript.

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/),
introduced by
[Anthropic](https://www.anthropic.com/news/model-context-protocol),
extends the capabilities of LLMs by enabling interaction with external tools and resources,
such as web search and database access.
Thanks to its open-source nature, MCP has gained significant traction in the developer community,
with over 400 MCP servers already developed and shared:

- [Smithery: MCP Server Registry](https://smithery.ai/)
- [Glama’s list of Open-Source MCP servers](https://glama.ai/mcp/servers)

In the MCP framework, external features are encapsulated in an MCP server
that runs in a separate process.
This clear decoupling allows for easy adoption and reuse of
any of the significant collections of MCP servers listed above.

To make it easy for LangChain to take advantage of such a vast resource base,
this package offers quick and seamless access from LangChain to MCP servers.

It contains a utility function `convertMcpToLangchainTools()`.  
This async function handles parallel initialization of specified multiple MCP servers
and converts their available tools into an array of LangChain-compatible tools.

A python equivalent of this utility library is available
[here](https://pypi.org/project/langchain-mcp-tools)

## Requirements

- Node.js 16+

## Installation

```bash
npm i @h1deya/langchain-mcp-tools
```

## Quick Start

`convertMcpToLangchainTools()` utility function accepts MCP server configurations
that follow the same structure as
[Claude for Desktop](https://modelcontextprotocol.io/quickstart/user),
but only the contents of the `mcpServers` property,
and is expressed as a JS Object, e.g.:

```ts
const mcpServers: McpServersConfig = {
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
  },
  fetch: {
    command: 'uvx',
    args: ['mcp-server-fetch']
  }
};

const { tools, cleanup } = await convertMcpToLangchainTools(mcpServers);
```

This utility function initializes all specified MCP servers in parallel,
and returns LangChain Tools
([`tools: StructuredTool[]`](https://api.js.langchain.com/classes/_langchain_core.tools.StructuredTool.html))
by gathering available MCP tools from the servers,
and by wrapping them into LangChain tools.
It also returns an async callback function (`cleanup: McpServerCleanupFn`)
to be invoked to close all MCP server sessions when finished.

The returned tools can be used with LangChain, e.g.:

```ts
// import { ChatAnthropic } from '@langchain/anthropic';
const llm = new ChatAnthropic({ model: 'claude-3-5-haiku-latest' });

// import { createReactAgent } from '@langchain/langgraph/prebuilt';
const agent = createReactAgent({
  llm,
  tools
});
```
A simple and experimentable usage example can be found
[here](https://github.com/hideya/langchain-mcp-tools-ts-usage/blob/main/src/index.ts)

A more realistic usage example can be found
[here](https://github.com/hideya/langchain-mcp-client-ts)

## Limitations

Currently, only text results of tool calls are supported.
