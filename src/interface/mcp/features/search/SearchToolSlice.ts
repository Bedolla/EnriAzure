import { z } from "zod";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { collectionProjectScopeSchema } from "../../SharedSchemas.js";
import { readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const searchSchema = z.object({
  action: z
    .enum(["code", "work_items", "wiki"])
    .describe(
      "Índice a consultar: code busca archivos/código, work_items busca work items y wiki busca páginas.",
    ),
  ...collectionProjectScopeSchema,
  search_text: z
    .string()
    .min(1)
    .describe(
      "Texto a buscar, por ejemplo nombre de clase, error, título de work item o frase de wiki.",
    ),
  filters: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe(
      "Filtros del índice como mapa nombre→valores. Primero busca con include_facets=true para descubrir nombres/valores válidos; no reutilices facets de otro action.",
    ),
  top: z
    .number()
    .int()
    .positive()
    .max(1_000)
    .optional()
    .describe("Resultados por página, de 1 a 1,000; default 100."),
  skip: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Resultados a omitir para la siguiente página; default 0."),
  include_facets: z
    .boolean()
    .optional()
    .describe("true devuelve facets que después puedes reutilizar en filters; default false."),
});

type SearchArguments = z.infer<typeof searchSchema>;

/**
 * Azure DevOps Server Search vertical slice.
 */
export class SearchToolSlice extends CatalogRestToolSlice<SearchArguments> {
  /**
   * Creates the search slice.
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
    super(executor, presenter, {
      name: "search",
      title: "Buscar contenido en Azure DevOps Server",
      description:
        "Busca código indexado, work items o páginas wiki del servidor. Aunque usa POST, es una consulta de sólo lectura. Empieza sin filters y con include_facets=true; reutiliza las facets devueltas para afinar la siguiente búsqueda.",
      source: "Azure DevOps search",
      inputSchema: searchSchema,
      annotations: readOnlyAnnotations,
      operations: [
        new RestOperationDefinition("code", "read", (args) => ({
          method: "POST",
          path: scope.project(args, "_apis/search/codesearchresults"),
          body: SearchToolSlice.body(args),
        })),
        new RestOperationDefinition("work_items", "read", (args) => ({
          method: "POST",
          path: scope.project(args, "_apis/search/workitemsearchresults"),
          body: SearchToolSlice.body(args),
        })),
        new RestOperationDefinition("wiki", "read", (args) => ({
          method: "POST",
          path: scope.project(args, "_apis/search/wikisearchresults"),
          body: SearchToolSlice.body(args),
        })),
      ],
    });
  }

  private static body(args: SearchArguments): Record<string, unknown> {
    return {
      searchText: args.search_text,
      $skip: args.skip ?? 0,
      $top: args.top ?? 100,
      filters: args.filters,
      includeFacets: args.include_facets ?? false,
    };
  }
}
