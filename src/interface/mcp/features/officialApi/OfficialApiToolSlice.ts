import type { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type {
  OfficialApiCatalog,
  OfficialApiExecutionInput,
  OfficialApiOperationDefinition,
  OfficialApiOperationExecutor,
} from "../../../../application/ports/OfficialApiCatalog.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { collectionProjectScopeSchema } from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const methodSchema = z.enum(["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"]);
const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
export const officialApiExecutionSchema = z.object({
  operation: z
    .string()
    .min(1)
    .describe(
      "Clave exacta obtenida con official_api_catalog. Primero usa search, después get y, si hay body, get_schema; no inventes la clave.",
    ),
  ...collectionProjectScopeSchema,
  team: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Nombre o ID del equipo para rutas de equipo. Obtén valores válidos mediante operaciones de equipos en official_core.",
    ),
  scope_level: z
    .enum(["auto", "instance", "collection", "project", "team"])
    .optional()
    .describe(
      "Alcance exacto cuando la ruta oficial permite segmentos opcionales: instance omite colección/proyecto; collection omite proyecto; project usa colección y proyecto; team agrega equipo; auto usa los valores proporcionados o defaults. No limita alcances admitidos por el contrato y rechaza únicamente los que esa operación no publica.",
    ),
  path_parameters: z
    .record(z.string(), scalarSchema)
    .optional()
    .describe(
      "Parámetros de ruta no pertenecientes al scope, con los nombres exactos mostrados por official_api_catalog get. Usa IDs obtenidos con tools de lectura; no incluyas collection, project, team ni api-version.",
    ),
  query_parameters: z
    .record(z.string(), z.union([scalarSchema, z.array(scalarSchema)]))
    .optional()
    .describe(
      "Parámetros de consulta documentados, con nombre, tipo y valores permitidos mostrados por official_api_catalog get. Las listas se envían separadas por comas.",
    ),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Sólo headers documentados por la operación, con los nombres exactos del catálogo; por ejemplo contentRangeHeader para una carga por fragmentos. No acepta Authorization, Host ni headers arbitrarios.",
    ),
  body: z
    .unknown()
    .optional()
    .describe(
      "Cuerpo JSON que cumple exactamente el esquema obtenido con official_api_catalog action=get_schema. Es mutuamente excluyente con body_base64.",
    ),
  body_base64: z
    .string()
    .max(20_000_000)
    .optional()
    .describe(
      "Contenido base64 canónico únicamente para operaciones que documenten application/octet-stream. Se decodifica antes del envío y es mutuamente excluyente con body.",
    ),
  accept: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Media type de respuesta elegido entre produces del catálogo, por ejemplo application/json o application/octet-stream. Las respuestas binarias se devuelven en base64.",
    ),
});
const catalogSchema = z.object({
  action: z
    .enum(["list_areas", "search", "get", "get_schema"])
    .describe(
      "Flujo recomendado: list_areas descubre áreas; search encuentra claves; get devuelve ruta, versión y parámetros; get_schema devuelve el body y sus dependencias antes de ejecutar.",
    ),
  operation: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Clave exacta devuelta por search. Es obligatoria para get y get_schema; también identifica qué contrato contiene schema_reference.",
    ),
  area: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Filtro exacto de área devuelto por list_areas, por ejemplo git, build, distributedTask o wit. Se usa sólo con search.",
    ),
  method: methodSchema
    .optional()
    .describe(
      "Filtro de verbo REST para search. GET/HEAD consultan; POST/PUT/PATCH normalmente modifican; DELETE elimina.",
    ),
  access: z
    .enum(["read", "write", "full"])
    .optional()
    .describe(
      "Filtro de política para search: read no modifica; write crea o edita; full incluye eliminación. No es un valor de configuración adicional.",
    ),
  text: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Texto libre para search; se compara contra clave, operationId, tags, ruta y descripción oficial. Ejemplos: variable group, pull request, iteration o permission.",
    ),
  top: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Máximo de coincidencias de search, de 1 a 200; por defecto devuelve 50."),
  schema_reference: z
    .string()
    .startsWith("#/definitions/")
    .optional()
    .describe(
      "Referencia exacta mostrada por get o por otro esquema, por ejemplo #/definitions/GitPush. Si se omite, get_schema usa todos los esquemas del body de la operación.",
    ),
  include_dependencies: z
    .boolean()
    .optional()
    .describe(
      "En get_schema, incluye recursivamente todas las definiciones locales necesarias. Por defecto true; usa false sólo para inspeccionar una definición individual.",
    ),
});

export type OfficialApiExecutionArguments = z.infer<typeof officialApiExecutionSchema>;
type CatalogArguments = z.infer<typeof catalogSchema>;

/**
 * Maps MCP field names to the application execution contract.
 *
 * @param args - Validated MCP arguments.
 * @returns Application input.
 */
export function mapOfficialApiExecutionInput(
  args: OfficialApiExecutionArguments,
): OfficialApiExecutionInput {
  return {
    operation: args.operation,
    collection: args.collection,
    project: args.project,
    team: args.team,
    scopeLevel: args.scope_level,
    pathParameters: args.path_parameters,
    queryParameters: args.query_parameters,
    headers: args.headers,
    body: args.body,
    bodyBase64: args.body_base64,
    accept: args.accept,
  };
}

/**
 * Complete operation-keyed surface generated from all official on-premises
 * Azure DevOps Server 7.1 OpenAPI specifications.
 */
export class OfficialApiToolSlice implements McpToolSlice {
  private readonly catalog: OfficialApiCatalog;
  private readonly operationExecutor: OfficialApiOperationExecutor;
  private readonly presenter: McpResultPresenter;

  /**
   * Creates the official API catalog slice.
   *
   * @param catalog - Generated official catalog.
   * @param operationExecutor - Policy-enforcing operation executor.
   * @param presenter - Safe result presenter.
   */
  public constructor(
    catalog: OfficialApiCatalog,
    operationExecutor: OfficialApiOperationExecutor,
    presenter: McpResultPresenter,
  ) {
    this.catalog = catalog;
    this.operationExecutor = operationExecutor;
    this.presenter = presenter;
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    /* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
    server.registerTool(
      "official_api_catalog",
      {
        title: "Descubrir operaciones oficiales de Azure DevOps Server",
        description:
          "Descubre contratos oficiales de Azure DevOps Server 2022 on-premises. Flujo: list_areas → search → get → get_schema cuando exista body → ejecuta la tool oficial de lectura o escritura. Incluye las 35 especificaciones, 889 operaciones y 2,198 definiciones reutilizables; devuelve rutas, versiones, tipos, valores permitidos, media types y nivel de acceso exactos.",
        inputSchema: catalogSchema,
        annotations: readOnlyAnnotations,
      },
      (args: CatalogArguments): CallToolResult => this.handleCatalog(args),
    );
    /* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
    server.registerTool(
      "official_api",
      {
        title: "Ejecutar una consulta oficial de Azure DevOps Server",
        description:
          "Ejecuta una operación oficial de lectura seleccionada con official_api_catalog. Usa get para conocer parámetros y get_schema para cuerpos de consultas POST. Sólo acepta la ruta, scope, parámetros, headers, media types y versión publicados; los IDs deben provenir de tools de listado/lectura o de resultados anteriores.",
        inputSchema: officialApiExecutionSchema,
        annotations: readOnlyAnnotations,
      },
      async (args: OfficialApiExecutionArguments): Promise<CallToolResult> =>
        this.handleExecution(args, "read"),
    );
    /* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
    server.registerTool(
      "official_api_write",
      {
        title: "Ejecutar una modificación oficial de Azure DevOps Server",
        description:
          "Ejecuta una creación, edición, transición o eliminación oficial seleccionada con official_api_catalog. Inspecciona primero el recurso, usa get y get_schema para construir el contrato exacto y reutiliza los IDs/ETags devueltos por lecturas. Crear/editar requiere write o full; eliminar/quitar requiere ENRIAZURE_WRITE_POLICY=full.",
        inputSchema: officialApiExecutionSchema,
        annotations: destructiveAnnotations,
      },
      async (args: OfficialApiExecutionArguments): Promise<CallToolResult> =>
        this.handleExecution(args, "write"),
    );
  }

  private handleCatalog(args: CatalogArguments): CallToolResult {
    try {
      if (args.action === "list_areas") {
        return this.presenter.metadata({
          specificationCount: this.catalog.getSpecificationCount(),
          operationCount: this.catalog.getOperationCount(),
          schemaCount: this.catalog.getSchemaCount(),
          areas: this.catalog.listAreas(),
        });
      }
      if (args.action === "get") {
        return this.presenter.metadata(
          this.operationView(this.catalog.get(this.requireOperation(args.operation))),
        );
      }
      if (args.action === "get_schema") {
        const operation: string = this.requireOperation(args.operation);
        const schemas = this.catalog.getSchemaBundle(
          operation,
          args.schema_reference,
          args.include_dependencies ?? true,
        );
        return this.presenter.metadata({
          operation,
          includeDependencies: args.include_dependencies ?? true,
          schemaCount: schemas.length,
          schemas: schemas.map((schema) => ({
            reference: schema.reference,
            schema: schema.schema,
          })),
        });
      }
      return this.presenter.metadata(
        this.catalog
          .search({
            area: args.area,
            method: args.method,
            access: args.access,
            text: args.text,
            top: args.top,
          })
          .map((operation): Record<string, unknown> => this.operationView(operation)),
      );
    } catch (error: unknown) {
      return this.presenter.error(error);
    }
  }

  private async handleExecution(
    args: OfficialApiExecutionArguments,
    toolKind: "read" | "write",
  ): Promise<CallToolResult> {
    try {
      const operation: OfficialApiOperationDefinition = this.catalog.get(args.operation);
      const isRead: boolean = operation.risk === "read";
      if ((toolKind === "read") !== isRead) {
        throw new Error(
          isRead
            ? "Esta operación es de sólo lectura; llama official_api."
            : "Esta operación modifica el estado del servidor; llama official_api_write.",
        );
      }
      const response = await this.operationExecutor.execute(mapOfficialApiExecutionInput(args));
      return this.presenter.success(response, `official ${operation.area} API`);
    } catch (error: unknown) {
      return this.presenter.error(error);
    }
  }

  private operationView(operation: OfficialApiOperationDefinition): Record<string, unknown> {
    return {
      operation: operation.key,
      area: operation.area,
      specification: operation.specification,
      operationId: operation.operationId,
      access: operation.risk === "read" ? "read" : operation.risk === "write" ? "write" : "full",
      method: operation.method,
      path: operation.pathTemplate,
      apiVersion: operation.apiVersion,
      tags: operation.tags,
      description: operation.description,
      guidanceEsMx: this.operationGuidance(operation),
      parameters: operation.parameters,
      consumes: operation.consumes,
      produces: operation.produces,
    };
  }

  private requireOperation(value: string | undefined): string {
    if (value === undefined) {
      throw new Error("operation es obligatorio para las acciones get y get_schema del catálogo.");
    }
    return value;
  }

  private operationGuidance(operation: OfficialApiOperationDefinition): string {
    const effect: string =
      operation.risk === "read"
        ? "consulta datos y no debe modificar el servidor"
        : operation.risk === "write"
          ? "crea, edita o inicia un ciclo de vida y requiere política write o full"
          : "elimina o quita estado y requiere política full";
    const body: boolean = operation.parameters.some(
      (parameter): boolean => parameter.location === "body",
    );
    const scope: string = operation.pathTemplate.startsWith("/{collection}")
      ? "Elige scope_level de acuerdo con los segmentos opcionales que muestra path"
      : "La ruta no inicia con una colección opcional; no fuerces un scope que el contrato no publica";
    return `Esta operación ${effect}. ${scope}. Usa únicamente los nombres y valores permitidos de parameters.${body ? " Antes de enviar body, llama action=get_schema con esta operation." : ""} Los IDs, nombres y ETags deben provenir de una lectura o de un resultado anterior, no de una suposición.`;
  }
}
