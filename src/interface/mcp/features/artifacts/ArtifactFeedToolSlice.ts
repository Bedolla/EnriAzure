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

const artifactFeedReadSchema = z.object({
  action: z
    .enum([
      "list_feeds",
      "get_feed",
      "list_deleted_feeds",
      "list_packages",
      "get_package",
      "list_package_versions",
      "get_package_version",
      "list_permissions",
      "get_retention_policy",
      "list_views",
      "get_view",
    ])
    .describe(
      "Acción de lectura. list_feeds obtiene feed_id; list_packages obtiene package_id; list_package_versions obtiene package_version_id; list_views obtiene view_id. Las acciones get y de configuración reutilizan esos IDs.",
    ),
  ...collectionProjectScopeSchema,
  feed_id: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre o ID del feed devuelto por list_feeds o list_deleted_feeds."),
  package_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID del paquete devuelto por list_packages dentro del feed elegido."),
  package_version_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID de versión devuelto por list_package_versions para el package_id elegido."),
  view_id: z.string().min(1).optional().describe("Nombre o ID de vista devuelto por list_views."),
  protocol_type: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Filtro de protocolo publicado por el feed, por ejemplo npm, NuGet, Maven, PyPI o Universal; omite para todos.",
    ),
  top: topSchema,
});

const artifactFeedWriteSchema = z.object({
  action: z
    .enum([
      "create_feed",
      "update_feed",
      "delete_feed",
      "restore_feed",
      "purge_feed",
      "set_permissions",
      "set_retention_policy",
      "delete_retention_policy",
      "create_view",
      "update_view",
      "delete_view",
      "empty_package_recycle_bin",
    ])
    .describe(
      "Acción de cambio. create_feed devuelve feed_id; create_view devuelve view_id. restore_feed opera sobre list_deleted_feeds. delete/purge/delete_retention_policy/delete_view/empty_package_recycle_bin requieren full; purge y vaciar papelera son permanentes.",
    ),
  ...collectionProjectScopeSchema,
  feed_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Nombre o ID obtenido con artifact_feed list_feeds/list_deleted_feeds o create_feed.",
    ),
  view_id: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre o ID obtenido con artifact_feed list_views o create_view."),
  body: z
    .union([requestBodySchema, z.array(z.unknown())])
    .optional()
    .describe(
      "Objeto o arreglo JSON exacto para la action: permisos normalmente usan arreglo; feed, retención y vista usan objeto. Inspecciona primero el recurso y consulta official_artifacts cuando necesites el esquema completo.",
    ),
});

type ArtifactFeedReadArguments = z.infer<typeof artifactFeedReadSchema>;
type ArtifactFeedWriteArguments = z.infer<typeof artifactFeedWriteSchema>;

/**
 * Azure Artifacts feed, view, permission, and retention vertical slice.
 */
export class ArtifactFeedToolSlice implements McpToolSlice {
  private readonly readTool: CatalogRestToolSlice<ArtifactFeedReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<ArtifactFeedWriteArguments>;

  /**
   * Creates the Azure Artifacts slice.
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
      name: "artifact_feed",
      title: "Consultar feeds de Azure Artifacts Server",
      description:
        "Consulta feeds, paquetes, versiones, permisos, retención, vistas y feeds eliminados. Usa la secuencia list_feeds → list_packages → list_package_versions y reutiliza feed_id/package_id/package_version_id; list_views proporciona view_id para administración.",
      source: "Azure DevOps Artifacts",
      inputSchema: artifactFeedReadSchema,
      annotations: readOnlyAnnotations,
      operations: ArtifactFeedToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "artifact_feed_write",
      title: "Administrar feeds de Azure Artifacts Server",
      description:
        "Crea, actualiza, elimina, restaura o purga feeds y administra permisos, retención, vistas y papelera. Lee primero el recurso y reutiliza IDs de artifact_feed. Eliminar, purgar y quitar configuración requiere ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps Artifacts",
      inputSchema: artifactFeedWriteSchema,
      annotations: destructiveAnnotations,
      operations: ArtifactFeedToolSlice.createWriteOperations(scope),
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<ArtifactFeedReadArguments>[] {
    const feedPath = (args: ArtifactFeedReadArguments): string =>
      scope.project(
        args,
        `_apis/packaging/feeds/${scope.requiredSegment(args.feed_id, "feed_id")}`,
      );
    const packagePath = (args: ArtifactFeedReadArguments): string =>
      `${feedPath(args)}/packages/${scope.requiredSegment(args.package_id, "package_id")}`;
    const versionPath = (args: ArtifactFeedReadArguments): string =>
      `${packagePath(args)}/versions/${scope.requiredSegment(args.package_version_id, "package_version_id")}`;
    return [
      new RestOperationDefinition("list_feeds", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/packaging/feeds"),
      })),
      new RestOperationDefinition("get_feed", "read", (args) => ({
        method: "GET",
        path: feedPath(args),
      })),
      new RestOperationDefinition("list_deleted_feeds", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/packaging/feedrecyclebin"),
      })),
      new RestOperationDefinition("list_packages", "read", (args) => ({
        method: "GET",
        path: `${feedPath(args)}/packages`,
        query: { protocolType: args.protocol_type, $top: args.top },
      })),
      new RestOperationDefinition("get_package", "read", (args) => ({
        method: "GET",
        path: packagePath(args),
      })),
      new RestOperationDefinition("list_package_versions", "read", (args) => ({
        method: "GET",
        path: `${packagePath(args)}/versions`,
        query: { $top: args.top },
      })),
      new RestOperationDefinition("get_package_version", "read", (args) => ({
        method: "GET",
        path: versionPath(args),
      })),
      new RestOperationDefinition("list_permissions", "read", (args) => ({
        method: "GET",
        path: `${feedPath(args)}/permissions`,
      })),
      new RestOperationDefinition("get_retention_policy", "read", (args) => ({
        method: "GET",
        path: `${feedPath(args)}/retentionpolicies`,
      })),
      new RestOperationDefinition("list_views", "read", (args) => ({
        method: "GET",
        path: `${feedPath(args)}/views`,
      })),
      new RestOperationDefinition("get_view", "read", (args) => ({
        method: "GET",
        path: `${feedPath(args)}/views/${scope.requiredSegment(args.view_id, "view_id")}`,
      })),
    ];
  }

  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<ArtifactFeedWriteArguments>[] {
    const feedPath = (args: ArtifactFeedWriteArguments): string =>
      scope.project(
        args,
        `_apis/packaging/feeds/${scope.requiredSegment(args.feed_id, "feed_id")}`,
      );
    const deletedFeedPath = (args: ArtifactFeedWriteArguments): string =>
      scope.project(
        args,
        `_apis/packaging/feedrecyclebin/${scope.requiredSegment(args.feed_id, "feed_id")}`,
      );
    return [
      new RestOperationDefinition("create_feed", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/packaging/feeds"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_feed", "write", (args) => ({
        method: "PATCH",
        path: feedPath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_feed", "destructive", (args) => ({
        method: "DELETE",
        path: feedPath(args),
      })),
      new RestOperationDefinition("restore_feed", "write", (args) => ({
        method: "PATCH",
        path: deletedFeedPath(args),
        body: args.body ?? {},
      })),
      new RestOperationDefinition("purge_feed", "destructive", (args) => ({
        method: "DELETE",
        path: deletedFeedPath(args),
      })),
      new RestOperationDefinition("set_permissions", "write", (args) => ({
        method: "PATCH",
        path: `${feedPath(args)}/permissions`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("set_retention_policy", "write", (args) => ({
        method: "PUT",
        path: `${feedPath(args)}/retentionpolicies`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_retention_policy", "destructive", (args) => ({
        method: "DELETE",
        path: `${feedPath(args)}/retentionpolicies`,
      })),
      new RestOperationDefinition("create_view", "write", (args) => ({
        method: "POST",
        path: `${feedPath(args)}/views`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_view", "write", (args) => ({
        method: "PATCH",
        path: `${feedPath(args)}/views/${scope.requiredSegment(args.view_id, "view_id")}`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_view", "destructive", (args) => ({
        method: "DELETE",
        path: `${feedPath(args)}/views/${scope.requiredSegment(args.view_id, "view_id")}`,
      })),
      new RestOperationDefinition("empty_package_recycle_bin", "destructive", (args) => ({
        method: "DELETE",
        path: `${feedPath(args)}/recyclebin/packages`,
      })),
    ];
  }
}
