import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { McpServer } from "@modelcontextprotocol/server";
import type { Transport } from "@modelcontextprotocol/server";
import type { McpToolSlice } from "./McpToolSlice.js";
import { packageName, packageVersion } from "../../package-info.js";

/**
 * Stdio Model Context Protocol server for EnriAzure.
 */
export class EnriAzureMcpServer {
  /**
   * MCP SDK server.
   */
  private readonly server: McpServer;

  /**
   * Feature slices.
   */
  private readonly slices: readonly McpToolSlice[];

  /**
   * Creates the MCP server.
   *
   * @param slices - Independently registered feature slices.
   */
  public constructor(slices: readonly McpToolSlice[]) {
    this.slices = slices;
    this.server = new McpServer({
      name: packageName,
      version: packageVersion,
      title: "EnriAzure - Azure DevOps Server MCP",
    });
  }

  /**
   * Registers all slices and connects the stdio transport.
   *
   * @returns Promise completed when the server disconnects.
   */
  public async run(): Promise<void> {
    await this.connect(new StdioServerTransport());
  }

  /**
   * Registers all slices and connects a supplied transport.
   *
   * @param transport - MCP transport, including in-memory test transports.
   * @returns Promise completed after connection.
   */
  public async connect(transport: Transport): Promise<void> {
    for (const slice of this.slices) {
      slice.register(this.server);
    }
    await this.server.connect(transport);
  }
}
