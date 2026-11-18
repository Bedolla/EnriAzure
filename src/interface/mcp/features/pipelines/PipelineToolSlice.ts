import type { McpServer } from "@modelcontextprotocol/server";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";
import {
  type PipelineReadArguments,
  type PipelineWriteArguments,
  pipelineReadSchema,
  pipelineWriteSchema,
} from "./PipelineToolSchemas.js";

/**
 * YAML pipeline and classic build vertical slice.
 */
export class PipelineToolSlice implements McpToolSlice {
  private readonly readTool: CatalogRestToolSlice<PipelineReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<PipelineWriteArguments>;

  /**
   * Creates the pipeline slice.
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
      name: "pipeline",
      title: "Consultar pipelines YAML y builds",
      description:
        "Consulta o previsualiza pipelines YAML, runs y sus salidas; también definiciones/builds clásicos, timelines, logs y artifacts. Distingue pipeline_id/run_id de definition_id/build_id; las acciones list proporcionan todos los IDs.",
      source: "Azure DevOps pipeline",
      inputSchema: pipelineReadSchema,
      annotations: readOnlyAnnotations,
      operations: PipelineToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "pipeline_write",
      title: "Ejecutar y modificar pipelines",
      description:
        "Crea o ejecuta pipelines YAML; encola, actualiza o cancela builds; administra definiciones clásicas. Inspecciona definición/pipeline y recursos protegidos antes de ejecutar. Las eliminaciones requieren ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps pipeline",
      inputSchema: pipelineWriteSchema,
      annotations: destructiveAnnotations,
      operations: PipelineToolSlice.createWriteOperations(scope),
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<PipelineReadArguments>[] {
    return [
      new RestOperationDefinition("list_pipelines", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/pipelines"),
        query: { $top: args.top },
      })),
      new RestOperationDefinition("get_pipeline", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/${scope.requiredSegment(args.pipeline_id, "pipeline_id")}`,
        ),
      })),
      new RestOperationDefinition("preview_pipeline", "read", (args) => ({
        method: "POST",
        path: scope.project(
          args,
          `_apis/pipelines/${scope.requiredSegment(args.pipeline_id, "pipeline_id")}/preview`,
        ),
        body: args.body ?? {},
      })),
      new RestOperationDefinition("list_runs", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/${scope.requiredSegment(args.pipeline_id, "pipeline_id")}/runs`,
        ),
        query: { $top: args.top },
      })),
      new RestOperationDefinition("get_run", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/${scope.requiredSegment(args.pipeline_id, "pipeline_id")}/runs/${scope.requiredSegment(args.run_id, "run_id")}`,
        ),
      })),
      new RestOperationDefinition("list_run_artifacts", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/${scope.requiredSegment(args.pipeline_id, "pipeline_id")}/runs/${scope.requiredSegment(args.run_id, "run_id")}/artifacts`,
        ),
      })),
      new RestOperationDefinition("list_run_logs", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/${scope.requiredSegment(args.pipeline_id, "pipeline_id")}/runs/${scope.requiredSegment(args.run_id, "run_id")}/logs`,
        ),
      })),
      new RestOperationDefinition("get_run_log", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/${scope.requiredSegment(args.pipeline_id, "pipeline_id")}/runs/${scope.requiredSegment(args.run_id, "run_id")}/logs/${scope.requiredSegment(args.log_id, "log_id")}`,
        ),
        accept: "text/plain",
      })),
      new RestOperationDefinition("list_definitions", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/build/definitions"),
        query: { $top: args.top },
      })),
      new RestOperationDefinition("get_definition", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/build/definitions/${scope.requiredSegment(args.definition_id, "definition_id")}`,
        ),
      })),
      new RestOperationDefinition("list_builds", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/build/builds"),
        query: {
          definitions: args.definition_id,
          branchName: args.branch_name,
          statusFilter: args.status_filter,
          resultFilter: args.result_filter,
          $top: args.top,
        },
      })),
      new RestOperationDefinition("get_build", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/build/builds/${scope.requiredSegment(args.build_id, "build_id")}`,
        ),
      })),
      new RestOperationDefinition("get_timeline", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/build/builds/${scope.requiredSegment(args.build_id, "build_id")}/timeline`,
        ),
      })),
      new RestOperationDefinition("get_log", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/build/builds/${scope.requiredSegment(args.build_id, "build_id")}/logs/${scope.requiredSegment(args.log_id, "log_id")}`,
        ),
        accept: "text/plain",
      })),
      new RestOperationDefinition("list_artifacts", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/build/builds/${scope.requiredSegment(args.build_id, "build_id")}/artifacts`,
        ),
      })),
      new RestOperationDefinition("get_artifact", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/build/builds/${scope.requiredSegment(args.build_id, "build_id")}/artifacts`,
        ),
        query: { artifactName: args.artifact_name },
      })),
    ];
  }

  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<PipelineWriteArguments>[] {
    return [
      new RestOperationDefinition("create_pipeline", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/pipelines"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("run_pipeline", "write", (args) => ({
        method: "POST",
        path: scope.project(
          args,
          `_apis/pipelines/${scope.requiredSegment(args.pipeline_id, "pipeline_id")}/runs`,
        ),
        body: args.body ?? {},
      })),
      new RestOperationDefinition("queue_build", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/build/builds"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("cancel_build", "write", (args) => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/build/builds/${scope.requiredSegment(args.build_id, "build_id")}`,
        ),
        body: { status: "cancelling" },
      })),
      new RestOperationDefinition("update_build", "write", (args) => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/build/builds/${scope.requiredSegment(args.build_id, "build_id")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_build", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/build/builds/${scope.requiredSegment(args.build_id, "build_id")}`,
        ),
      })),
      new RestOperationDefinition("create_definition", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/build/definitions"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_definition", "write", (args) => ({
        method: "PUT",
        path: scope.project(
          args,
          `_apis/build/definitions/${scope.requiredSegment(args.definition_id, "definition_id")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_definition", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/build/definitions/${scope.requiredSegment(args.definition_id, "definition_id")}`,
        ),
      })),
    ];
  }
}
