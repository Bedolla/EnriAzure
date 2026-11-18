import type { McpServer } from "@modelcontextprotocol/server";
import type { AzureDevOpsRequest } from "../../../../application/ports/AzureDevOpsGateway.js";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";
import {
  type BoardReadArguments,
  type BoardWriteArguments,
  boardReadSchema,
  boardWriteSchema,
} from "./BoardToolSchemas.js";

/**
 * Boards, backlogs, iterations, and capacity vertical slice.
 */
export class BoardToolSlice implements McpToolSlice {
  /**
   * Read tool.
   */
  private readonly readTool: CatalogRestToolSlice<BoardReadArguments>;

  /**
   * Mutation tool.
   */
  private readonly writeTool: CatalogRestToolSlice<BoardWriteArguments>;

  /**
   * Creates the board slice.
   *
   * @param executor - Guarded executor.
   * @param presenter - Safe presenter.
   * @param scope - Route scope builder.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    scope: RequestScope,
  ) {
    this.readTool = new CatalogRestToolSlice(executor, presenter, {
      name: "board",
      title: "Consultar boards, sprints y áreas",
      description:
        "Consulta configuración de equipo, backlogs, work items, iteraciones asignadas, nodos de sprint/área, capacidad y boards. Distingue iteration_path del nodo y iteration_id de la asignación; las acciones list proporcionan los IDs para get y board_write.",
      source: "Azure DevOps boards",
      inputSchema: boardReadSchema,
      annotations: readOnlyAnnotations,
      operations: BoardToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "board_write",
      title: "Modificar boards, sprints y áreas",
      description:
        "Crea/actualiza/elimina nodos de sprint o área y administra asignaciones de equipo, capacidad y boards. Secuencia para sprint: create_iteration_node → list/get node → add_iteration al equipo. Eliminar nodos requiere ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps boards",
      inputSchema: boardWriteSchema,
      annotations: destructiveAnnotations,
      operations: BoardToolSlice.createWriteOperations(scope),
    });
  }

  /**
   * Registers board tools.
   *
   * @param server - MCP server.
   */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  /**
   * Creates read operations.
   *
   * @param scope - Route scope builder.
   * @returns Read catalog.
   */
  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<BoardReadArguments>[] {
    const teamPath = (args: BoardReadArguments, path: string): string =>
      scope.team(args, `_apis/work/${path}`);
    return [
      new RestOperationDefinition("get_team_settings", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: teamPath(args, "teamsettings"),
      })),
      new RestOperationDefinition("list_backlogs", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: teamPath(args, "backlogs"),
      })),
      new RestOperationDefinition("get_backlog", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: teamPath(args, `backlogs/${scope.requiredSegment(args.backlog_id, "backlog_id")}`),
      })),
      new RestOperationDefinition("list_backlog_items", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: teamPath(
          args,
          `backlogs/${scope.requiredSegment(args.backlog_id, "backlog_id")}/workItems`,
        ),
      })),
      new RestOperationDefinition("list_iterations", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: teamPath(args, "teamsettings/iterations"),
        query: { $timeframe: args.timeframe },
      })),
      new RestOperationDefinition("get_iteration", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: teamPath(
          args,
          `teamsettings/iterations/${scope.requiredSegment(args.iteration_id, "iteration_id")}`,
        ),
      })),
      new RestOperationDefinition(
        "get_iteration_work_items",
        "read",
        (args): AzureDevOpsRequest => ({
          method: "GET",
          path: teamPath(
            args,
            `teamsettings/iterations/${scope.requiredSegment(args.iteration_id, "iteration_id")}/workitems`,
          ),
        }),
      ),
      new RestOperationDefinition("list_iteration_nodes", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(args, "_apis/wit/classificationnodes/iterations"),
        query: { $depth: args.depth },
      })),
      new RestOperationDefinition("get_iteration_node", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/wit/classificationnodes/iterations/${scope.hierarchySegments(args.iteration_path, "iteration_path")}`,
        ),
        query: { $depth: args.depth },
      })),
      new RestOperationDefinition("list_area_nodes", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(args, "_apis/wit/classificationnodes/areas"),
        query: { $depth: args.depth },
      })),
      new RestOperationDefinition("get_area_node", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/wit/classificationnodes/areas/${scope.hierarchySegments(args.area_path, "area_path")}`,
        ),
        query: { $depth: args.depth },
      })),
      new RestOperationDefinition("get_capacities", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: teamPath(
          args,
          `teamsettings/iterations/${scope.requiredSegment(args.iteration_id, "iteration_id")}/capacities`,
        ),
      })),
      new RestOperationDefinition("list_boards", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: teamPath(args, "boards"),
      })),
      new RestOperationDefinition("get_board", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: teamPath(args, `boards/${scope.requiredSegment(args.board_id, "board_id")}`),
      })),
    ];
  }

  /**
   * Creates mutation operations.
   *
   * @param scope - Route scope builder.
   * @returns Mutation catalog.
   */
  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<BoardWriteArguments>[] {
    const teamPath = (args: BoardWriteArguments, path: string): string =>
      scope.team(args, `_apis/work/${path}`);
    return [
      new RestOperationDefinition("update_team_settings", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: teamPath(args, "teamsettings"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("add_iteration", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: teamPath(args, "teamsettings/iterations"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition(
        "remove_iteration",
        "destructive",
        (args): AzureDevOpsRequest => ({
          method: "DELETE",
          path: teamPath(
            args,
            `teamsettings/iterations/${scope.requiredSegment(args.iteration_id, "iteration_id")}`,
          ),
        }),
      ),
      new RestOperationDefinition("create_iteration_node", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: scope.project(
          args,
          args.iteration_path === undefined
            ? "_apis/wit/classificationnodes/iterations"
            : `_apis/wit/classificationnodes/iterations/${scope.hierarchySegments(args.iteration_path, "iteration_path")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_iteration_node", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/wit/classificationnodes/iterations/${scope.hierarchySegments(args.iteration_path, "iteration_path")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition(
        "delete_iteration_node",
        "destructive",
        (args): AzureDevOpsRequest => ({
          method: "DELETE",
          path: scope.project(
            args,
            `_apis/wit/classificationnodes/iterations/${scope.hierarchySegments(args.iteration_path, "iteration_path")}`,
          ),
        }),
      ),
      new RestOperationDefinition("create_area_node", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: scope.project(
          args,
          args.area_path === undefined
            ? "_apis/wit/classificationnodes/areas"
            : `_apis/wit/classificationnodes/areas/${scope.hierarchySegments(args.area_path, "area_path")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_area_node", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/wit/classificationnodes/areas/${scope.hierarchySegments(args.area_path, "area_path")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition(
        "delete_area_node",
        "destructive",
        (args): AzureDevOpsRequest => ({
          method: "DELETE",
          path: scope.project(
            args,
            `_apis/wit/classificationnodes/areas/${scope.hierarchySegments(args.area_path, "area_path")}`,
          ),
        }),
      ),
      new RestOperationDefinition("update_capacity", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: teamPath(
          args,
          `teamsettings/iterations/${scope.requiredSegment(args.iteration_id, "iteration_id")}/capacities/${scope.requiredSegment(args.user_id, "user_id")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("replace_capacities", "write", (args): AzureDevOpsRequest => ({
        method: "PUT",
        path: teamPath(
          args,
          `teamsettings/iterations/${scope.requiredSegment(args.iteration_id, "iteration_id")}/capacities`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_board", "write", (args): AzureDevOpsRequest => ({
        method: "PUT",
        path: teamPath(args, `boards/${scope.requiredSegment(args.board_id, "board_id")}`),
        body: requireRequestBody(args.body),
      })),
    ];
  }
}
