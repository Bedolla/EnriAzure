import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import { collectionProjectScopeSchema, requestBodySchema } from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const agentPoolReadSchema = z.object({
  action: z
    .enum(["list_pools", "get_pool", "list_agents", "get_agent", "list_queues", "get_queue"])
    .describe(
      "Acción de lectura: list_pools obtiene pool_id; get_pool lo inspecciona; list_agents obtiene agent_id dentro de pool_id; get_agent inspecciona ese agente; list_queues obtiene queue_id del proyecto; get_queue inspecciona esa cola.",
    ),
  ...collectionProjectScopeSchema,
  pool_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "ID numérico positivo devuelto por list_pools; requerido para acciones de pool/agente.",
    ),
  agent_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID numérico positivo devuelto por list_agents; requerido para get_agent."),
  queue_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID numérico positivo devuelto por list_queues; requerido para get_queue."),
});

const agentPoolWriteSchema = z.object({
  action: z
    .enum([
      "create_pool",
      "update_pool",
      "delete_pool",
      "add_agent",
      "replace_agent",
      "update_agent",
      "delete_agent",
      "create_queue",
      "delete_queue",
    ])
    .describe(
      "Acción de cambio. create_pool devuelve pool_id; update/delete_pool lo usan. add_agent devuelve agent_id; replace/update/delete_agent requieren pool_id y agent_id. create_queue vincula un pool al proyecto y devuelve queue_id; delete_queue usa queue_id. Los delete requieren full.",
    ),
  ...collectionProjectScopeSchema,
  pool_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de pool obtenido con agent_pool list_pools o create_pool."),
  agent_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de agente obtenido con agent_pool list_agents o add_agent."),
  queue_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de cola de proyecto obtenido con agent_pool list_queues o create_queue."),
  body: requestBodySchema.optional(),
});

type AgentPoolReadArguments = z.infer<typeof agentPoolReadSchema>;
type AgentPoolWriteArguments = z.infer<typeof agentPoolWriteSchema>;

/**
 * Self-hosted agent pool, agent, and project queue vertical slice.
 */
export class AgentPoolToolSlice implements McpToolSlice {
  private readonly readTool: CatalogRestToolSlice<AgentPoolReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<AgentPoolWriteArguments>;

  /**
   * Creates the agent administration slice.
   *
   * @param executor - Guarded operation executor.
   * @param presenter - Safe result presenter.
   * @param scope - Route scope resolver.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    scope: RequestScope,
  ) {
    this.readTool = new CatalogRestToolSlice(executor, presenter, {
      name: "agent_pool",
      title: "Consultar agentes self-hosted, pools y colas",
      description:
        "Consulta pools y agentes de una colección, además de colas de un proyecto. Flujo: list_pools → list_agents/get_agent; para colas usa list_queues → get_queue. Los IDs devueltos alimentan agent_pool_write y las definiciones de pipelines.",
      source: "Azure DevOps self-hosted agent",
      inputSchema: agentPoolReadSchema,
      annotations: readOnlyAnnotations,
      operations: AgentPoolToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "agent_pool_write",
      title: "Administrar agentes self-hosted, pools y colas",
      description:
        "Crea, actualiza o elimina pools; registra, reemplaza, actualiza o elimina registros de agentes; crea o elimina colas de proyecto. Consulta primero agent_pool para confirmar IDs y estado. Las eliminaciones requieren ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps self-hosted agent",
      inputSchema: agentPoolWriteSchema,
      annotations: destructiveAnnotations,
      operations: AgentPoolToolSlice.createWriteOperations(scope),
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<AgentPoolReadArguments>[] {
    const poolPath = (args: AgentPoolReadArguments): string =>
      scope.collection(
        args,
        `_apis/distributedtask/pools/${scope.requiredSegment(args.pool_id, "pool_id")}`,
      );
    return [
      new RestOperationDefinition("list_pools", "read", (args) => ({
        method: "GET",
        path: scope.collection(args, "_apis/distributedtask/pools"),
      })),
      new RestOperationDefinition("get_pool", "read", (args) => ({
        method: "GET",
        path: poolPath(args),
      })),
      new RestOperationDefinition("list_agents", "read", (args) => ({
        method: "GET",
        path: `${poolPath(args)}/agents`,
        query: { includeCapabilities: true, includeAssignedRequest: true },
      })),
      new RestOperationDefinition("get_agent", "read", (args) => ({
        method: "GET",
        path: `${poolPath(args)}/agents/${scope.requiredSegment(args.agent_id, "agent_id")}`,
        query: { includeCapabilities: true, includeAssignedRequest: true },
      })),
      new RestOperationDefinition("list_queues", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/distributedtask/queues"),
      })),
      new RestOperationDefinition("get_queue", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/distributedtask/queues/${scope.requiredSegment(args.queue_id, "queue_id")}`,
        ),
      })),
    ];
  }

  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<AgentPoolWriteArguments>[] {
    const poolPath = (args: AgentPoolWriteArguments): string =>
      scope.collection(
        args,
        `_apis/distributedtask/pools/${scope.requiredSegment(args.pool_id, "pool_id")}`,
      );
    const agentPath = (args: AgentPoolWriteArguments): string =>
      `${poolPath(args)}/agents/${scope.requiredSegment(args.agent_id, "agent_id")}`;
    return [
      new RestOperationDefinition("create_pool", "write", (args) => ({
        method: "POST",
        path: scope.collection(args, "_apis/distributedtask/pools"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_pool", "write", (args) => ({
        method: "PATCH",
        path: poolPath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_pool", "destructive", (args) => ({
        method: "DELETE",
        path: poolPath(args),
      })),
      new RestOperationDefinition("add_agent", "write", (args) => ({
        method: "POST",
        path: `${poolPath(args)}/agents`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("replace_agent", "write", (args) => ({
        method: "PUT",
        path: agentPath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_agent", "write", (args) => ({
        method: "PATCH",
        path: agentPath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_agent", "destructive", (args) => ({
        method: "DELETE",
        path: agentPath(args),
      })),
      new RestOperationDefinition("create_queue", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/distributedtask/queues"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_queue", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/distributedtask/queues/${scope.requiredSegment(args.queue_id, "queue_id")}`,
        ),
      })),
    ];
  }
}
