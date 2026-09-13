#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerMcpTools } from "./tools/mcp.js";
import { registerSkillsTools } from "./tools/skills.js";
import { registerSessionTools } from "./tools/sessions.js";

const server = new McpServer({
  name: "psymem",
  version: "1.0.0",
});

// Register all tool modules
registerMemoryTools(server);
registerMcpTools(server);
registerSkillsTools(server);
registerSessionTools(server);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PsyMem MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
