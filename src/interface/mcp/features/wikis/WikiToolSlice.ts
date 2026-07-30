import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AzureDevOpsRequest } from "../../../../application/ports/AzureDevOpsGateway.js";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import { collectionProjectScopeSchema, requestBodySchema } from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const wikiReadSchema = z.object({
  action: z
    .enum(["list", "get", "get_page", "get_page_by_id", "get_page_stats", "list_pages"])
    .describe(
      "Acción de lectura. list devuelve wiki id/nombre; get_page y list_pages trabajan por page_path y devuelven page_id/ETag; get_page_by_id usa page_id; get_page_stats devuelve estadísticas.",
    ),
  ...collectionProjectScopeSchema,
  wiki: z.string().min(1).optional().describe("Nombre o ID exacto devuelto por wiki list."),
  page_path: z
    .string()
    .min(1)
    .optional()
    .describe("Ruta iniciada con /, por ejemplo /Despliegue/Producción."),
  page_id: z.number().int().positive().optional().describe("ID devuelto por get_page/list_pages."),
  recursion_level: z
    .enum(["none", "oneLevel", "full"])
    .optional()
    .describe(
      "Profundidad del árbol: none, oneLevel o full; evita full si sólo necesitas una página.",
    ),
  include_content: z
    .boolean()
    .optional()
    .describe(
      "true incluye Markdown; false devuelve metadata. Por defecto true en lecturas de página.",
    ),
});

const wikiWriteSchema = z.object({
  action: z
    .enum([
      "create",
      "update",
      "upsert_page",
      "update_page_by_id",
      "move_page",
      "delete_page",
      "delete_page_by_id",
      "delete",
    ])
    .describe(
      "Acción de cambio. create devuelve wiki; upsert_page crea/actualiza por path; update_page_by_id usa page_id; move_page usa version/ETag vigente; delete_page/delete_page_by_id/delete wiki requieren full.",
    ),
  ...collectionProjectScopeSchema,
  wiki: z.string().min(1).optional().describe("Nombre o ID obtenido con wiki list o create."),
  page_path: z
    .string()
    .min(1)
    .optional()
    .describe("Ruta iniciada con / obtenida con list_pages/get_page."),
  page_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con wiki get_page/list_pages."),
  version: z
    .string()
    .min(1)
    .optional()
    .describe("Versión de página requerida por move_page, obtenida de la lectura de la página."),
  etag: z
    .string()
    .min(1)
    .optional()
    .describe(
      "ETag exacto obtenido de headers.eTag en get_page; envíalo para evitar sobrescribir cambios concurrentes.",
    ),
  comment: z
    .string()
    .optional()
    .describe("Comentario de commit opcional para el cambio de página."),
  body: requestBodySchema.optional(),
});

type WikiReadArguments = z.infer<typeof wikiReadSchema>;
type WikiWriteArguments = z.infer<typeof wikiWriteSchema>;

/**
 * Project and code wiki vertical slice.
 */
export class WikiToolSlice implements McpToolSlice {
  private readonly readTool: CatalogRestToolSlice<WikiReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<WikiWriteArguments>;

  /**
   * Creates the wiki slice.
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
      name: "wiki",
      title: "Consultar wikis y páginas",
      description:
        "Lista wikis y consulta metadata, Markdown, estadísticas o árboles de páginas. Flujo: list → list_pages/get_page; conserva wiki, page_path, page_id, version y headers.eTag para cambios seguros.",
      source: "Azure DevOps wiki",
      inputSchema: wikiReadSchema,
      annotations: readOnlyAnnotations,
      operations: WikiToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "wiki_write",
      title: "Modificar wikis y páginas",
      description:
        "Crea/actualiza/elimina wikis y crea/actualiza/mueve/elimina páginas por ruta o ID. Lee primero la página y envía su ETag para no pisar cambios concurrentes. Las eliminaciones requieren ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps wiki",
      inputSchema: wikiWriteSchema,
      annotations: destructiveAnnotations,
      operations: WikiToolSlice.createWriteOperations(scope),
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<WikiReadArguments>[] {
    const wikiPath = (args: WikiReadArguments): string =>
      scope.project(args, `_apis/wiki/wikis/${scope.requiredSegment(args.wiki, "wiki")}`);
    return [
      new RestOperationDefinition("list", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/wiki/wikis"),
      })),
      new RestOperationDefinition("get", "read", (args) => ({
        method: "GET",
        path: wikiPath(args),
      })),
      new RestOperationDefinition("get_page", "read", (args) => ({
        method: "GET",
        path: `${wikiPath(args)}/pages`,
        query: {
          path: args.page_path,
          recursionLevel: args.recursion_level ?? "none",
          includeContent: args.include_content ?? true,
        },
      })),
      new RestOperationDefinition("get_page_by_id", "read", (args) => ({
        method: "GET",
        path: `${wikiPath(args)}/pages/${scope.requiredSegment(args.page_id, "page_id")}`,
        query: { includeContent: args.include_content ?? true },
      })),
      new RestOperationDefinition("get_page_stats", "read", (args) => ({
        method: "GET",
        path: `${wikiPath(args)}/pages/${scope.requiredSegment(args.page_id, "page_id")}/stats`,
      })),
      new RestOperationDefinition("list_pages", "read", (args) => ({
        method: "GET",
        path: `${wikiPath(args)}/pages`,
        query: {
          path: args.page_path ?? "/",
          recursionLevel: args.recursion_level ?? "full",
          includeContent: false,
        },
      })),
    ];
  }

  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<WikiWriteArguments>[] {
    const wikiPath = (args: WikiWriteArguments): string =>
      scope.project(args, `_apis/wiki/wikis/${scope.requiredSegment(args.wiki, "wiki")}`);
    return [
      new RestOperationDefinition("create", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/wiki/wikis"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update", "write", (args) => ({
        method: "PATCH",
        path: wikiPath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("upsert_page", "write", (args): AzureDevOpsRequest => {
        const ifMatch: string | undefined = args.etag ?? args.version;
        return {
          method: "PUT",
          path: `${wikiPath(args)}/pages`,
          query: { path: args.page_path, comment: args.comment },
          body: requireRequestBody(args.body),
          ...(ifMatch === undefined ? {} : { ifMatch }),
        };
      }),
      new RestOperationDefinition("update_page_by_id", "write", (args): AzureDevOpsRequest => {
        const ifMatch: string | undefined = args.etag ?? args.version;
        return {
          method: "PATCH",
          path: `${wikiPath(args)}/pages/${scope.requiredSegment(args.page_id, "page_id")}`,
          query: { comment: args.comment },
          body: requireRequestBody(args.body),
          ...(ifMatch === undefined ? {} : { ifMatch }),
        };
      }),
      new RestOperationDefinition("move_page", "write", (args) => ({
        method: "POST",
        path: `${wikiPath(args)}/pagemoves`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_page", "destructive", (args) => ({
        method: "DELETE",
        path: `${wikiPath(args)}/pages`,
        query: { path: args.page_path },
      })),
      new RestOperationDefinition("delete_page_by_id", "destructive", (args) => ({
        method: "DELETE",
        path: `${wikiPath(args)}/pages/${scope.requiredSegment(args.page_id, "page_id")}`,
      })),
      new RestOperationDefinition("delete", "destructive", (args) => ({
        method: "DELETE",
        path: wikiPath(args),
      })),
    ];
  }
}
