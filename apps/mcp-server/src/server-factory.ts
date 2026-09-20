import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

export function createNexusServer(): McpServer {
  const server = new McpServer({
    name: "nexus-home-guardian",
    version: "0.1.0",
  });
  registerTools(server);
  return server;
}
