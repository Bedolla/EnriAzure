import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import { collectionProjectScopeSchema, requestBodySchema, topSchema } from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const administrationReadSchema = z.object({
  action: z
    .enum([
      "list_feeds",
      "list_packages",
      "list_pools",
      "list_agents",
      "list_queues",
      "list_variable_groups",
      "list_service_endpoints",
      "get_service_endpoint",
      "list_policy_types",
      "list_policy_configurations",
      "list_service_hooks",
      "list_release_definitions",
      "list_releases",
    ])
    .describe(
      "Lecturas administrativas agrupadas. Cada list devuelve el ID que necesita su get o administration_write: feed, pool_id/agent_id, endpoint_id, policy_id, subscription_id o definition_id/release_id. Prefiere la tool especializada cuando necesites más filtros.",
    ),
  ...collectionProjectScopeSchema,
  feed: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre o ID devuelto por list_feeds; requerido para list_packages."),
  pool_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_pools; requerido para list_agents."),
  endpoint_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID/GUID devuelto por list_service_endpoints."),
  definition_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_release_definitions; puede filtrar list_releases."),
  top: topSchema,
});

const administrationWriteSchema = z.object({
  action: z
    .enum([
      "update_agent",
      "create_service_endpoint",
      "update_service_endpoint",
      "delete_service_endpoint",
      "create_policy",
      "update_policy",
      "delete_policy",
      "create_service_hook",
      "update_service_hook",
      "delete_service_hook",
      "create_release",
    ])
    .describe(
      "Acción administrativa. Obtén primero pool_id/agent_id, endpoint_id, policy_id, subscription_id o definition_id con administration/agent_pool/deployment/release. create devuelve un ID para cambios futuros. delete requiere full.",
    ),
  ...collectionProjectScopeSchema,
  pool_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con administration/agent_pool list_pools."),
  agent_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con administration/agent_pool list_agents."),
  endpoint_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID obtenido con administration list_service_endpoints."),
  policy_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con administration list_policy_configurations u official_policy."),
  subscription_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID obtenido con administration list_service_hooks u official_hooks."),
  body: requestBodySchema.optional(),
});

type AdministrationReadArguments = z.infer<typeof administrationReadSchema>;
type AdministrationWriteArguments = z.infer<typeof administrationWriteSchema>;

/**
 * Cross-cutting on-premises administration vertical slice.
 */
export class AdministrationToolSlice implements McpToolSlice {
  private readonly readTool: CatalogRestToolSlice<AdministrationReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<AdministrationWriteArguments>;

  /**
   * Creates the administration slice.
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
      name: "administration",
      title: "Consultar recursos administrativos del servidor",
      description:
        "Vista rápida de feeds/paquetes, pools/colas, Variable Groups, service endpoints, policies, service hooks y releases clásicos. Las listas proporcionan IDs para acciones get/write; usa la tool especializada para contratos y filtros completos.",
      source: "Azure DevOps administration",
      inputSchema: administrationReadSchema,
      annotations: readOnlyAnnotations,
      operations: AdministrationToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "administration_write",
      title: "Modificar recursos administrativos del servidor",
      description:
        "Actualiza agentes y administra service endpoints, policies, service hooks y releases clásicos. Inspecciona el recurso y su esquema primero; los secretos de endpoints no se registran ni se revelan. Las eliminaciones requieren ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps administration",
      inputSchema: administrationWriteSchema,
      annotations: destructiveAnnotations,
      operations: AdministrationToolSlice.createWriteOperations(scope),
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<AdministrationReadArguments>[] {
    return [
      new RestOperationDefinition("list_feeds", "read", (args) => ({
        method: "GET",
        path: scope.collection(args, "_apis/packaging/feeds"),
      })),
      new RestOperationDefinition("list_packages", "read", (args) => ({
        method: "GET",
        path: scope.collection(
          args,
          `_apis/packaging/feeds/${scope.requiredSegment(args.feed, "feed")}/packages`,
        ),
        query: { top: args.top },
      })),
      new RestOperationDefinition("list_pools", "read", (args) => ({
        method: "GET",
        path: scope.collection(args, "_apis/distributedtask/pools"),
      })),
      new RestOperationDefinition("list_agents", "read", (args) => ({
        method: "GET",
        path: scope.collection(
          args,
          `_apis/distributedtask/pools/${scope.requiredSegment(args.pool_id, "pool_id")}/agents`,
        ),
        query: { includeCapabilities: true, includeAssignedRequest: true },
      })),
      new RestOperationDefinition("list_queues", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/distributedtask/queues"),
      })),
      new RestOperationDefinition("list_variable_groups", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/distributedtask/variablegroups"),
      })),
      new RestOperationDefinition("list_service_endpoints", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/serviceendpoint/endpoints"),
        query: { includeDetails: false },
      })),
      new RestOperationDefinition("get_service_endpoint", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/serviceendpoint/endpoints/${scope.requiredSegment(args.endpoint_id, "endpoint_id")}`,
        ),
      })),
      new RestOperationDefinition("list_policy_types", "read", (args) => ({
        method: "GET",
        path: scope.collection(args, "_apis/policy/types"),
      })),
      new RestOperationDefinition("list_policy_configurations", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/policy/configurations"),
      })),
      new RestOperationDefinition("list_service_hooks", "read", (args) => ({
        method: "GET",
        path: scope.collection(args, "_apis/hooks/subscriptions"),
      })),
      new RestOperationDefinition("list_release_definitions", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/release/definitions"),
        query: { $top: args.top },
      })),
      new RestOperationDefinition("list_releases", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/release/releases"),
        query: { definitionId: args.definition_id, $top: args.top },
      })),
    ];
  }

  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<AdministrationWriteArguments>[] {
    return [
      new RestOperationDefinition("update_agent", "write", (args) => ({
        method: "PATCH",
        path: scope.collection(
          args,
          `_apis/distributedtask/pools/${scope.requiredSegment(args.pool_id, "pool_id")}/agents/${scope.requiredSegment(args.agent_id, "agent_id")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("create_service_endpoint", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/serviceendpoint/endpoints"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_service_endpoint", "write", (args) => ({
        method: "PUT",
        path: scope.project(
          args,
          `_apis/serviceendpoint/endpoints/${scope.requiredSegment(args.endpoint_id, "endpoint_id")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_service_endpoint", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/serviceendpoint/endpoints/${scope.requiredSegment(args.endpoint_id, "endpoint_id")}`,
        ),
      })),
      new RestOperationDefinition("create_policy", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/policy/configurations"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_policy", "write", (args) => ({
        method: "PUT",
        path: scope.project(
          args,
          `_apis/policy/configurations/${scope.requiredSegment(args.policy_id, "policy_id")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_policy", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/policy/configurations/${scope.requiredSegment(args.policy_id, "policy_id")}`,
        ),
      })),
      new RestOperationDefinition("create_service_hook", "write", (args) => ({
        method: "POST",
        path: scope.collection(args, "_apis/hooks/subscriptions"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_service_hook", "write", (args) => ({
        method: "PUT",
        path: scope.collection(
          args,
          `_apis/hooks/subscriptions/${scope.requiredSegment(args.subscription_id, "subscription_id")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_service_hook", "destructive", (args) => ({
        method: "DELETE",
        path: scope.collection(
          args,
          `_apis/hooks/subscriptions/${scope.requiredSegment(args.subscription_id, "subscription_id")}`,
        ),
      })),
      new RestOperationDefinition("create_release", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/release/releases"),
        body: requireRequestBody(args.body),
      })),
    ];
  }
}
