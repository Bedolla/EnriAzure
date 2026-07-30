import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AzureDevOpsRequest } from "../../../../application/ports/AzureDevOpsGateway.js";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import {
  collectionProjectScopeSchema,
  requestBodySchema,
  skipSchema,
  topSchema,
} from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const repositoryReadSchema = z.object({
  action: z
    .enum([
      "list",
      "get",
      "list_deleted",
      "list_branches",
      "get_item",
      "get_tree",
      "list_commits",
      "get_commit",
    ])
    .describe(
      "Acción de lectura: list obtiene nombre/ID de repositorio; list_branches devuelve refs/version; get_item lee un archivo; get_tree recorre rutas; list_commits devuelve commit_id para get_commit; list_deleted obtiene repositorios restaurables.",
    ),
  ...collectionProjectScopeSchema,
  repository: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre o ID exacto devuelto por repository action=list o list_deleted."),
  path: z
    .string()
    .min(1)
    .optional()
    .describe("Ruta absoluta dentro del repositorio, por ejemplo /src/app.ts o /docs."),
  commit_id: z
    .string()
    .min(1)
    .optional()
    .describe("SHA del commit devuelto por list_commits; requerido para get_commit."),
  version: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Nombre de rama/tag o SHA según version_type; list_branches/list_commits proporcionan valores.",
    ),
  version_type: z
    .enum(["branch", "tag", "commit"])
    .optional()
    .describe(
      "Tipo de version: branch para rama sin refs/heads/, tag sin refs/tags/, commit para SHA.",
    ),
  recursion_level: z
    .enum(["none", "oneLevel", "oneLevelPlusNestedEmptyFolders", "full"])
    .optional()
    .describe(
      "Profundidad de get_tree: none, oneLevel, oneLevelPlusNestedEmptyFolders o full. Usa full sólo cuando necesites todo el subárbol.",
    ),
  filter: z
    .string()
    .optional()
    .describe("Prefijo de ref para list_branches; por defecto heads/. Ejemplo: heads/release/."),
  include_content: z
    .boolean()
    .optional()
    .describe("En get_item, true incluye el contenido del archivo; por defecto true."),
  top: topSchema,
  skip: skipSchema,
});

const repositoryWriteSchema = z.object({
  action: z
    .enum(["create", "update", "delete", "restore", "purge", "update_refs", "push"])
    .describe(
      "Acción de cambio. create devuelve repository id; update modifica metadata; delete mueve a papelera; restore usa un ID de list_deleted; purge elimina permanentemente; update_refs crea/mueve ramas con oldObjectId/newObjectId; push crea commits/refs. delete y purge requieren full.",
    ),
  ...collectionProjectScopeSchema,
  repository: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre o ID obtenido con repository list/list_deleted o con create."),
  body: z
    .union([requestBodySchema, z.array(z.unknown())])
    .optional()
    .describe(
      "Objeto o arreglo JSON exacto para la action. update_refs requiere arreglo de cambios con name, oldObjectId y newObjectId; push requiere refUpdates y commits. Obtén esquemas completos con official_git.",
    ),
});

type RepositoryReadArguments = z.infer<typeof repositoryReadSchema>;
type RepositoryWriteArguments = z.infer<typeof repositoryWriteSchema>;

/**
 * Git repository vertical slice with separate read and mutation tools.
 */
export class RepositoryToolSlice implements McpToolSlice {
  /**
   * Read-only tool.
   */
  private readonly readTool: CatalogRestToolSlice<RepositoryReadArguments>;

  /**
   * Mutation tool.
   */
  private readonly writeTool: CatalogRestToolSlice<RepositoryWriteArguments>;

  /**
   * Creates the repository slice.
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
    this.readTool = new CatalogRestToolSlice(executor, presenter, {
      name: "repository",
      title: "Consultar repositorios Git",
      description:
        "Lista repositorios/ramas, consulta metadata, lee archivos/árboles e inspecciona commits en Git de Azure DevOps Server. Flujo típico: list → list_branches/list_commits → get_item/get_commit; los nombres, IDs, refs y SHAs alimentan repository_write y pull_request.",
      source: "Azure DevOps Git",
      inputSchema: repositoryReadSchema,
      annotations: readOnlyAnnotations,
      operations: RepositoryToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "repository_write",
      title: "Modificar repositorios Git",
      description:
        "Crea, actualiza, elimina, restaura o purga repositorios; cambia refs/ramas y envía commits. Lee primero repository y usa IDs/SHAs actuales para concurrencia. delete y purge permanente requieren ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps Git",
      inputSchema: repositoryWriteSchema,
      annotations: destructiveAnnotations,
      operations: RepositoryToolSlice.createWriteOperations(scope),
    });
  }

  /**
   * Registers repository tools.
   *
   * @param server - MCP server.
   */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  /**
   * Builds explicit read operations.
   *
   * @param scope - Route scope builder.
   * @returns Read operation catalog.
   */
  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<RepositoryReadArguments>[] {
    const repositoryPath = (args: RepositoryReadArguments): string =>
      scope.project(
        args,
        `_apis/git/repositories/${scope.requiredSegment(args.repository, "repository")}`,
      );
    return [
      new RestOperationDefinition("list", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(args, "_apis/git/repositories"),
      })),
      new RestOperationDefinition("get", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: repositoryPath(args),
      })),
      new RestOperationDefinition("list_deleted", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: scope.project(args, "_apis/git/recycleBin/repositories"),
      })),
      new RestOperationDefinition("list_branches", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${repositoryPath(args)}/refs`,
        query: { filter: args.filter ?? "heads/", $top: args.top },
      })),
      new RestOperationDefinition("get_item", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${repositoryPath(args)}/items`,
        query: {
          path: args.path,
          includeContent: args.include_content ?? true,
          recursionLevel: "none",
          "versionDescriptor.version": args.version,
          "versionDescriptor.versionType": args.version_type,
        },
        accept: "application/json",
      })),
      new RestOperationDefinition("get_tree", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${repositoryPath(args)}/items`,
        query: {
          scopePath: args.path ?? "/",
          recursionLevel: args.recursion_level ?? "full",
          includeContentMetadata: true,
          "versionDescriptor.version": args.version,
          "versionDescriptor.versionType": args.version_type,
        },
      })),
      new RestOperationDefinition("list_commits", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${repositoryPath(args)}/commits`,
        query: {
          "searchCriteria.itemVersion.version": args.version,
          "searchCriteria.itemVersion.versionType": args.version_type,
          "searchCriteria.$top": args.top,
          "searchCriteria.$skip": args.skip,
        },
      })),
      new RestOperationDefinition("get_commit", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${repositoryPath(args)}/commits/${scope.requiredSegment(args.commit_id, "commit_id")}`,
        query: { changeCount: args.top },
      })),
    ];
  }

  /**
   * Builds explicit mutation operations.
   *
   * @param scope - Route scope builder.
   * @returns Mutation operation catalog.
   */
  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<RepositoryWriteArguments>[] {
    const repositoryPath = (args: RepositoryWriteArguments): string =>
      scope.project(
        args,
        `_apis/git/repositories/${scope.requiredSegment(args.repository, "repository")}`,
      );
    return [
      new RestOperationDefinition("create", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: scope.project(args, "_apis/git/repositories"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: repositoryPath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete", "destructive", (args): AzureDevOpsRequest => ({
        method: "DELETE",
        path: repositoryPath(args),
      })),
      new RestOperationDefinition("restore", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/git/recycleBin/repositories/${scope.requiredSegment(args.repository, "repository")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("purge", "destructive", (args): AzureDevOpsRequest => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/git/recycleBin/repositories/${scope.requiredSegment(args.repository, "repository")}`,
        ),
      })),
      new RestOperationDefinition("update_refs", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: `${repositoryPath(args)}/refs`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("push", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: `${repositoryPath(args)}/pushes`,
        body: requireRequestBody(args.body),
      })),
    ];
  }
}
