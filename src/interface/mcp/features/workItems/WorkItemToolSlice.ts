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
  type WorkItemReadArguments,
  type WorkItemWriteArguments,
  workItemReadSchema,
  workItemWriteSchema,
} from "./WorkItemToolSchemas.js";

/**
 * Work item tracking vertical slice.
 */
export class WorkItemToolSlice implements McpToolSlice {
  /**
   * Read tool.
   */
  private readonly readTool: CatalogRestToolSlice<WorkItemReadArguments>;

  /**
   * Mutation tool.
   */
  private readonly writeTool: CatalogRestToolSlice<WorkItemWriteArguments>;

  /**
   * Creates the work item slice.
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
      name: "work_item",
      title: "Consultar work items",
      description:
        "Consulta work items activos o reciclados, ejecuta WIQL e inspecciona consultas guardadas, comentarios, revisiones, tipos y campos. Flujo: list_types/list_fields → query_wiql → get/get_batch; los IDs alimentan comentarios, actualizaciones y relaciones.",
      source: "Azure DevOps work item",
      inputSchema: workItemReadSchema,
      annotations: readOnlyAnnotations,
      operations: WorkItemToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "work_item_write",
      title: "Modificar work items",
      description:
        "Crea, actualiza, elimina o restaura work items; administra comentarios y consultas guardadas. Lee tipo/campos/revisión primero y usa JSON Patch exacto. Las eliminaciones, incluso a papelera, requieren ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps work item",
      inputSchema: workItemWriteSchema,
      annotations: destructiveAnnotations,
      operations: WorkItemToolSlice.createWriteOperations(scope),
    });
  }

  /**
   * Registers work item tools.
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
   * @returns Read operation catalog.
   */
  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<WorkItemReadArguments>[] {
    const workItemPath = (args: WorkItemReadArguments): string =>
      scope.project(
        args,
        `_apis/wit/workItems/${scope.requiredSegment(args.work_item_id, "work_item_id")}`,
      );
    return [
      new RestOperationDefinition("get", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: workItemPath(args),
        query: {
          fields: args.fields?.join(","),
          $expand: args.expand,
        },
      })),
      new RestOperationDefinition("get_batch", "read", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: scope.project(args, "_apis/wit/workitemsbatch"),
        body: {
          ids: args.ids ?? [],
          fields: args.fields,
          $expand: args.expand,
        },
      })),
      new RestOperationDefinition("query_wiql", "read", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: scope.project(args, "_apis/wit/wiql"),
        body: { query: args.wiql ?? "" },
        query: { $top: args.top },
      })),
      new RestOperationDefinition("list_queries", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(args, "_apis/wit/queries"),
        query: { $expand: "all", $depth: 2 },
      })),
      new RestOperationDefinition("get_query", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/wit/queries/${scope.requiredSegment(args.query_id_or_path, "query_id_or_path")}`,
        ),
        query: { $expand: "all", $depth: 2 },
      })),
      new RestOperationDefinition("list_comments", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${workItemPath(args)}/comments`,
        apiVersion: "7.1-preview.4",
        query: {
          $top: args.top,
          continuationToken: args.continuation_token,
          includeDeleted: false,
        },
      })),
      new RestOperationDefinition("list_revisions", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${workItemPath(args)}/revisions`,
        query: { $top: args.top },
      })),
      new RestOperationDefinition("list_types", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(args, "_apis/wit/workitemtypes"),
      })),
      new RestOperationDefinition("get_type", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/wit/workitemtypes/${scope.requiredSegment(args.work_item_type, "work_item_type")}`,
        ),
      })),
      new RestOperationDefinition("list_fields", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.collection(args, "_apis/wit/fields"),
        query: { $expand: "extensionFields" },
      })),
      new RestOperationDefinition("list_deleted", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(args, "_apis/wit/recyclebin"),
      })),
      new RestOperationDefinition("get_deleted", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/wit/recyclebin/${scope.requiredSegment(args.work_item_id, "work_item_id")}`,
        ),
      })),
    ];
  }

  /**
   * Creates mutation operations.
   *
   * @param scope - Route scope builder.
   * @returns Mutation operation catalog.
   */
  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<WorkItemWriteArguments>[] {
    const workItemPath = (args: WorkItemWriteArguments): string =>
      scope.project(
        args,
        `_apis/wit/workItems/${scope.requiredSegment(args.work_item_id, "work_item_id")}`,
      );
    return [
      new RestOperationDefinition("create", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: scope.project(
          args,
          `_apis/wit/workItems/$${scope.requiredSegment(args.work_item_type, "work_item_type")}`,
        ),
        body: requireRequestBody(args.body),
        contentType: "application/json-patch+json",
      })),
      new RestOperationDefinition("update", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: workItemPath(args),
        body: requireRequestBody(args.body),
        contentType: "application/json-patch+json",
      })),
      new RestOperationDefinition("delete", "destructive", (args): AzureDevOpsRequest => ({
        method: "DELETE",
        path: workItemPath(args),
        query: { destroy: args.destroy },
      })),
      new RestOperationDefinition("add_comment", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: `${workItemPath(args)}/comments`,
        apiVersion: "7.1-preview.4",
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_comment", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: `${workItemPath(args)}/comments/${scope.requiredSegment(args.comment_id, "comment_id")}`,
        apiVersion: "7.1-preview.4",
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_comment", "destructive", (args): AzureDevOpsRequest => ({
        method: "DELETE",
        path: `${workItemPath(args)}/comments/${scope.requiredSegment(args.comment_id, "comment_id")}`,
        apiVersion: "7.1-preview.4",
      })),
      new RestOperationDefinition("create_query", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: scope.project(
          args,
          `_apis/wit/queries/${scope.requiredSegment(args.query_id_or_path, "query_id_or_path")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_query", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/wit/queries/${scope.requiredSegment(args.query_id_or_path, "query_id_or_path")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_query", "destructive", (args): AzureDevOpsRequest => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/wit/queries/${scope.requiredSegment(args.query_id_or_path, "query_id_or_path")}`,
        ),
      })),
      new RestOperationDefinition("restore_deleted", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/wit/recyclebin/${scope.requiredSegment(args.work_item_id, "work_item_id")}`,
        ),
        body: args.body ?? {},
      })),
      new RestOperationDefinition("destroy_deleted", "destructive", (args): AzureDevOpsRequest => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/wit/recyclebin/${scope.requiredSegment(args.work_item_id, "work_item_id")}`,
        ),
      })),
    ];
  }
}
