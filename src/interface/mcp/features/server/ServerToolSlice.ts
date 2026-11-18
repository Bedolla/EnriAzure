import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { AzureDevOpsRequest } from "../../../../application/ports/AzureDevOpsGateway.js";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { AbstractRestToolSlice } from "../../AbstractRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";

const serverInputSchema = z.object({
  action: z
    .enum(["info", "list_collections", "list_resource_areas"])
    .describe(
      "Acción de descubrimiento: info valida conexión/identidad; list_collections devuelve nombres e IDs de colección; list_resource_areas devuelve áreas, URLs y versiones REST anunciadas por esta instalación.",
    ),
  collection: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Colección opcional para info/list_resource_areas. Usa un nombre o ID devuelto por list_collections; si se omite consulta el alcance de instancia.",
    ),
});

type ServerArguments = z.infer<typeof serverInputSchema>;

/**
 * Read-only Azure DevOps Server discovery slice.
 */
export class ServerToolSlice extends AbstractRestToolSlice implements McpToolSlice {
  /**
   * Route scope builder.
   */
  private readonly scope: RequestScope;

  /**
   * Public server root displayed in local metadata.
   */
  private readonly publicServerUrl: string;

  /**
   * Creates the server slice.
   *
   * @param executor - Guarded operation executor.
   * @param presenter - Safe result presenter.
   * @param scope - Route scope builder.
   * @param publicServerUrl - Normalized server root.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    scope: RequestScope,
    publicServerUrl: string,
  ) {
    super(executor, presenter);
    this.scope = scope;
    this.publicServerUrl = publicServerUrl;
  }

  /**
   * Registers the `server` tool.
   *
   * @param server - MCP server.
   */
  public register(server: McpServer): void {
    /* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
    server.registerTool(
      "server",
      {
        title: "Descubrir la instalación de Azure DevOps Server",
        description:
          "Inspecciona la instancia self-hosted configurada, lista colecciones o descubre áreas y versiones REST anunciadas. Empieza con info/list_collections; reutiliza collection en las demás tools. Los hosts de Azure DevOps Services/Cloud se rechazan al iniciar.",
        inputSchema: serverInputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: ServerArguments): Promise<CallToolResult> => this.handle(args),
    );
  }

  /**
   * Dispatches one discovery action.
   *
   * @param args - Validated tool arguments.
   * @returns MCP result.
   */
  private async handle(args: ServerArguments): Promise<CallToolResult> {
    let request: AzureDevOpsRequest;
    switch (args.action) {
      case "info": {
        const path: string =
          args.collection === undefined
            ? this.scope.instance("_apis/connectionData")
            : this.scope.collection(args, "_apis/connectionData");
        request = {
          method: "GET",
          path,
          apiVersion: "7.1-preview.1",
          query: {
            connectOptions: 1,
            lastChangeId: -1,
            lastChangeId64: -1,
          },
        };
        break;
      }
      case "list_collections":
        request = {
          method: "GET",
          path: this.scope.instance("_apis/projectCollections"),
        };
        break;
      case "list_resource_areas": {
        const path: string =
          args.collection === undefined
            ? this.scope.instance("_apis/resourceAreas")
            : this.scope.collection(args, "_apis/resourceAreas");
        request = { method: "GET", path };
        break;
      }
    }

    return this.execute("read", request, `servidor Azure DevOps ${this.publicServerUrl}`);
  }
}
