import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from './server.js';

// stdio transport: the MCP client (Claude Code, Cursor, ...) starts this process and talks to it over stdin/stdout.
const server = createServer();
await server.connect(new StdioServerTransport());
