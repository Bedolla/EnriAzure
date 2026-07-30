import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import { collectionProjectScopeSchema, requestBodySchema, topSchema } from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const releaseReadSchema = z.object({
  action: z
    .enum([
      "list_definitions",
      "get_definition",
      "list_definition_revisions",
      "list_releases",
      "get_release",
      "list_deployments",
      "list_approvals",
      "get_release_environment",
      "list_manual_interventions",
      "get_manual_intervention",
    ])
    .describe(
      "Acción de lectura. list_definitions obtiene definition_id; list_releases obtiene release_id; get_release/list_deployments proporcionan environment_id; list_approvals proporciona approval_id; list_manual_interventions proporciona manual_intervention_id.",
    ),
  ...collectionProjectScopeSchema,
  definition_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_definitions."),
  release_id: z.number().int().positive().optional().describe("ID devuelto por list_releases."),
  environment_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "ID del environment dentro de un release, obtenido con get_release o list_deployments.",
    ),
  manual_intervention_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_manual_interventions para el release elegido."),
  top: topSchema,
});

const releaseWriteSchema = z.object({
  action: z
    .enum([
      "create_definition",
      "update_definition",
      "delete_definition",
      "create_release",
      "update_release",
      "update_release_resource",
      "update_release_environment",
      "update_approval",
      "update_manual_intervention",
    ])
    .describe(
      "Acción de cambio. create_definition devuelve definition_id; create_release usa esa definición y devuelve release_id; environments/approvals/interventions se obtienen leyendo el release. delete_definition requiere full.",
    ),
  ...collectionProjectScopeSchema,
  definition_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con release list_definitions o create_definition."),
  release_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con release list_releases o create_release."),
  environment_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "ID del environment dentro del release, obtenido con release get_release/list_deployments.",
    ),
  approval_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con release list_approvals para actualizar una aprobación."),
  manual_intervention_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con release list_manual_interventions."),
  body: requestBodySchema.optional(),
});

type ReleaseReadArguments = z.infer<typeof releaseReadSchema>;
type ReleaseWriteArguments = z.infer<typeof releaseWriteSchema>;

/**
 * Classic release definition, release, deployment, and approval vertical slice.
 */
export class ReleaseToolSlice implements McpToolSlice {
  private readonly readTool: CatalogRestToolSlice<ReleaseReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<ReleaseWriteArguments>;

  /**
   * Creates the classic release slice.
   *
   * @param executor - Guarded operation executor.
   * @param presenter - Safe MCP presenter.
   * @param scope - Route scope resolver.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    scope: RequestScope,
  ) {
    this.readTool = new CatalogRestToolSlice(executor, presenter, {
      name: "release",
      title: "Consultar releases clásicos",
      description:
        "Consulta definiciones y revisiones de Release clásico, releases, deployments, approvals, environments e intervenciones manuales. Flujo: list_definitions → list_releases/get_release → approvals/interventions.",
      source: "Azure DevOps classic release",
      inputSchema: releaseReadSchema,
      annotations: readOnlyAnnotations,
      operations: ReleaseToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "release_write",
      title: "Administrar releases clásicos",
      description:
        "Crea/actualiza/elimina definiciones, crea/actualiza releases, despliega environments y resuelve approvals o intervenciones manuales. Lee primero definición/release y usa sus IDs. Eliminar requiere ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps classic release",
      inputSchema: releaseWriteSchema,
      annotations: destructiveAnnotations,
      operations: ReleaseToolSlice.createWriteOperations(scope),
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<ReleaseReadArguments>[] {
    const releasePath = (args: ReleaseReadArguments): string =>
      scope.project(
        args,
        `_apis/release/releases/${scope.requiredSegment(args.release_id, "release_id")}`,
      );
    return [
      new RestOperationDefinition("list_definitions", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/release/definitions"),
        query: { $top: args.top },
      })),
      new RestOperationDefinition("get_definition", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/release/definitions/${scope.requiredSegment(args.definition_id, "definition_id")}`,
        ),
      })),
      new RestOperationDefinition("list_definition_revisions", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/release/definitions/${scope.requiredSegment(args.definition_id, "definition_id")}/revisions`,
        ),
      })),
      new RestOperationDefinition("list_releases", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/release/releases"),
        query: { definitionId: args.definition_id, $top: args.top },
      })),
      new RestOperationDefinition("get_release", "read", (args) => ({
        method: "GET",
        path: releasePath(args),
      })),
      new RestOperationDefinition("list_deployments", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/release/deployments"),
        query: { definitionId: args.definition_id, $top: args.top },
      })),
      new RestOperationDefinition("list_approvals", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/release/approvals"),
        query: { $top: args.top },
      })),
      new RestOperationDefinition("get_release_environment", "read", (args) => ({
        method: "GET",
        path: `${releasePath(args)}/environments/${scope.requiredSegment(args.environment_id, "environment_id")}`,
      })),
      new RestOperationDefinition("list_manual_interventions", "read", (args) => ({
        method: "GET",
        path: `${releasePath(args)}/manualinterventions`,
      })),
      new RestOperationDefinition("get_manual_intervention", "read", (args) => ({
        method: "GET",
        path: `${releasePath(args)}/manualinterventions/${scope.requiredSegment(args.manual_intervention_id, "manual_intervention_id")}`,
      })),
    ];
  }

  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<ReleaseWriteArguments>[] {
    const releasePath = (args: ReleaseWriteArguments): string =>
      scope.project(
        args,
        `_apis/release/releases/${scope.requiredSegment(args.release_id, "release_id")}`,
      );
    return [
      new RestOperationDefinition("create_definition", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/release/definitions"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_definition", "write", (args) => ({
        method: "PUT",
        path: scope.project(args, "_apis/release/definitions"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_definition", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/release/definitions/${scope.requiredSegment(args.definition_id, "definition_id")}`,
        ),
      })),
      new RestOperationDefinition("create_release", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/release/releases"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_release", "write", (args) => ({
        method: "PUT",
        path: releasePath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_release_resource", "write", (args) => ({
        method: "PATCH",
        path: releasePath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_release_environment", "write", (args) => ({
        method: "PATCH",
        path: `${releasePath(args)}/environments/${scope.requiredSegment(args.environment_id, "environment_id")}`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_approval", "write", (args) => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/release/approvals/${scope.requiredSegment(args.approval_id, "approval_id")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_manual_intervention", "write", (args) => ({
        method: "PATCH",
        path: `${releasePath(args)}/manualinterventions/${scope.requiredSegment(args.manual_intervention_id, "manual_intervention_id")}`,
        body: requireRequestBody(args.body),
      })),
    ];
  }
}
