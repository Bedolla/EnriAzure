import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { AzureDevOpsRequest } from "../../../../application/ports/AzureDevOpsGateway.js";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { AbstractRestToolSlice } from "../../AbstractRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import {
  collectionProjectScopeSchema,
  requestBodySchema,
  skipSchema,
  topSchema,
} from "../../SharedSchemas.js";

const projectReadSchema = z.object({
  action: z
    .enum(["list", "get", "list_teams", "get_team", "list_team_members"])
    .describe(
      "Acción de lectura. list devuelve nombre/ID de proyecto; list_teams usa el proyecto y devuelve nombre/ID de team; list_team_members usa ambos. Esos valores alimentan todas las tools con collection/project/team.",
    ),
  ...collectionProjectScopeSchema,
  team: z.string().min(1).optional().describe("Nombre o ID obtenido con project list_teams."),
  state_filter: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Filtro de estado de proyecto publicado por Server, por ejemplo wellFormed, creating o deleting.",
    ),
  include_capabilities: z
    .boolean()
    .optional()
    .describe(
      "true incluye capabilities del proyecto en get; omite/false si sólo necesitas metadata.",
    ),
  top: topSchema,
  skip: skipSchema,
});

const projectWriteSchema = z.object({
  action: z
    .enum(["create", "update", "delete", "create_team", "update_team", "delete_team"])
    .describe(
      "Acción de cambio. create devuelve proyecto ID; create_team requiere proyecto y devuelve team ID. update usa el recurso actual; delete/delete_team requieren full.",
    ),
  ...collectionProjectScopeSchema,
  team: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre o ID obtenido con project list_teams o create_team."),
  body: requestBodySchema.optional(),
});

type ProjectReadArguments = z.infer<typeof projectReadSchema>;
type ProjectWriteArguments = z.infer<typeof projectWriteSchema>;

/**
 * Project and team vertical slice.
 */
export class ProjectToolSlice extends AbstractRestToolSlice implements McpToolSlice {
  /**
   * Route scope builder.
   */
  private readonly scope: RequestScope;

  /**
   * Creates the project slice.
   *
   * @param executor - Guarded operation executor.
   * @param presenter - Safe result presenter.
   * @param scope - Route scope builder.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    scope: RequestScope,
  ) {
    super(executor, presenter);
    this.scope = scope;
  }

  /**
   * Registers project read and write tools.
   *
   * @param server - MCP server.
   */
  public register(server: McpServer): void {
    /* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
    server.registerTool(
      "project",
      {
        title: "Consultar proyectos, equipos y miembros",
        description:
          "Lista o consulta proyectos, equipos y miembros dentro de una colección. Empieza aquí para obtener project/team IDs válidos que consumen boards, pipelines y casi todas las tools con scope.",
        inputSchema: projectReadSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: ProjectReadArguments): Promise<CallToolResult> => this.handleRead(args),
    );

    /* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
    server.registerTool(
      "project_write",
      {
        title: "Modificar proyectos y equipos",
        description:
          "Crea, actualiza o elimina proyectos y equipos de Azure DevOps Server. Lee primero colección/proyecto/equipo y usa el body oficial. Crear/editar requiere write o full; eliminar requiere ENRIAZURE_WRITE_POLICY=full.",
        inputSchema: projectWriteSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async (args: ProjectWriteArguments): Promise<CallToolResult> => this.handleWrite(args),
    );
  }

  /**
   * Dispatches project reads.
   *
   * @param args - Validated arguments.
   * @returns MCP result.
   */
  private async handleRead(args: ProjectReadArguments): Promise<CallToolResult> {
    let request: AzureDevOpsRequest;
    switch (args.action) {
      case "list":
        request = {
          method: "GET",
          path: this.scope.collection(args, "_apis/projects"),
          query: {
            stateFilter: args.state_filter,
            getDefaultTeamImageUrl: false,
            $top: args.top,
            $skip: args.skip,
          },
        };
        break;
      case "get":
        request = {
          method: "GET",
          path: this.scope.collection(
            args,
            `_apis/projects/${this.scope.projectSegment(args.project)}`,
          ),
          query: { includeCapabilities: args.include_capabilities },
        };
        break;
      case "list_teams":
        request = {
          method: "GET",
          path: this.scope.collection(
            args,
            `_apis/projects/${this.scope.projectSegment(args.project)}/teams`,
          ),
          query: { $top: args.top, $skip: args.skip },
        };
        break;
      case "get_team":
        request = {
          method: "GET",
          path: this.scope.collection(
            args,
            `_apis/projects/${this.scope.projectSegment(args.project)}/teams/${this.scope.requiredSegment(args.team, "team")}`,
          ),
        };
        break;
      case "list_team_members":
        request = {
          method: "GET",
          path: this.scope.collection(
            args,
            `_apis/projects/${this.scope.projectSegment(args.project)}/teams/${this.scope.requiredSegment(args.team, "team")}/members`,
          ),
          query: { $top: args.top, $skip: args.skip },
        };
        break;
    }
    return this.execute("read", request, "Azure DevOps project");
  }

  /**
   * Dispatches project mutations.
   *
   * @param args - Validated arguments.
   * @returns MCP result.
   */
  private async handleWrite(args: ProjectWriteArguments): Promise<CallToolResult> {
    let request: AzureDevOpsRequest;
    let destructive: boolean = false;
    switch (args.action) {
      case "create":
        request = {
          method: "POST",
          path: this.scope.collection(args, "_apis/projects"),
          body: this.requireBody(args.body),
        };
        break;
      case "update":
        request = {
          method: "PATCH",
          path: this.scope.collection(
            args,
            `_apis/projects/${this.scope.projectSegment(args.project)}`,
          ),
          body: this.requireBody(args.body),
        };
        break;
      case "delete":
        destructive = true;
        request = {
          method: "DELETE",
          path: this.scope.collection(
            args,
            `_apis/projects/${this.scope.projectSegment(args.project)}`,
          ),
        };
        break;
      case "create_team":
        request = {
          method: "POST",
          path: this.scope.collection(
            args,
            `_apis/projects/${this.scope.projectSegment(args.project)}/teams`,
          ),
          body: this.requireBody(args.body),
        };
        break;
      case "update_team":
        request = {
          method: "PATCH",
          path: this.scope.collection(
            args,
            `_apis/projects/${this.scope.projectSegment(args.project)}/teams/${this.scope.requiredSegment(args.team, "team")}`,
          ),
          body: this.requireBody(args.body),
        };
        break;
      case "delete_team":
        destructive = true;
        request = {
          method: "DELETE",
          path: this.scope.collection(
            args,
            `_apis/projects/${this.scope.projectSegment(args.project)}/teams/${this.scope.requiredSegment(args.team, "team")}`,
          ),
        };
        break;
    }
    return this.execute(destructive ? "destructive" : "write", request, "Azure DevOps project");
  }

  /**
   * Requires a mutation body.
   *
   * @param body - Optional body.
   * @returns Required body.
   */
  private requireBody(body: Record<string, unknown> | undefined): Record<string, unknown> {
    if (body === undefined) {
      throw new Error("body es obligatorio para esta acción.");
    }
    return body;
  }
}
