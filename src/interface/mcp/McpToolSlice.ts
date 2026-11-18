import type { McpServer } from "@modelcontextprotocol/server";

/**
 * One independently registered vertical MCP feature slice.
 */
export interface McpToolSlice {
  /**
   * Registers the slice tools on an MCP server.
   *
   * @param server - MCP server instance.
   */
  register(server: McpServer): void;
}
