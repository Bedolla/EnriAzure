import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { Base64PayloadDecoder } from "../../../../application/services/Base64PayloadDecoder.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import { collectionProjectScopeSchema, requestBodySchema } from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const SECURE_FILES_API_VERSION: string = "7.2-preview.1";
const MAX_BASE64_CHARACTERS: number = 20_000_000;

const base64ContentSchema = z
  .string()
  .min(4)
  .max(MAX_BASE64_CHARACTERS)
  .refine(
    (value: string): boolean =>
      value.length % 4 === 0 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),
    "content_base64 debe ser base64 canónico.",
  );

const secureFileReadSchema = z.object({
  action: z
    .enum(["list", "get"])
    .describe(
      "list devuelve secure_file_id y metadata; get inspecciona un archivo por ID. Nunca descarga contenido ni tickets.",
    ),
  ...collectionProjectScopeSchema,
  secure_file_id: z
    .string()
    .min(1)
    .optional()
    .describe("GUID devuelto por secure_file list o upload."),
  name_pattern: z
    .string()
    .min(1)
    .optional()
    .describe("Patrón de nombre para list, por ejemplo *.pfx o production."),
  action_filter: z
    .enum(["none", "manage", "use"])
    .optional()
    .describe(
      "Filtro de permiso: none no filtra, manage exige administración, use exige uso en pipeline.",
    ),
});

const secureFileWriteSchema = z.object({
  action: z
    .enum(["upload", "update_metadata", "delete"])
    .describe(
      "upload carga bytes y devuelve secure_file_id; update_metadata usa ese ID; delete elimina y requiere full.",
    ),
  ...collectionProjectScopeSchema,
  secure_file_id: z
    .string()
    .min(1)
    .optional()
    .describe("GUID obtenido con secure_file list/get o upload."),
  name: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre del archivo al hacer upload, por ejemplo deployment.pfx."),
  authorize_pipelines: z
    .boolean()
    .optional()
    .describe(
      "En upload, true autoriza uso amplio por pipelines; omite/false para administrar permisos explícitamente.",
    ),
  content_base64: base64ContentSchema
    .optional()
    .describe(
      "Contenido completo codificado en base64 canónico para upload; se decodifica antes de enviarse y nunca se devuelve.",
    ),
  body: requestBodySchema.optional(),
});

type SecureFileReadArguments = z.infer<typeof secureFileReadSchema>;
type SecureFileWriteArguments = z.infer<typeof secureFileWriteSchema>;

/**
 * Secure File metadata and lifecycle vertical slice.
 *
 * @remarks
 * File content may be uploaded but is intentionally never downloaded into an
 * MCP result. Reads expose metadata only and never request download tickets.
 */
export class SecureFileToolSlice implements McpToolSlice {
  private readonly readTool: CatalogRestToolSlice<SecureFileReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<SecureFileWriteArguments>;

  /**
   * Creates the Secure File slice.
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
      name: "secure_file",
      title: "Consultar metadata de Secure Files",
      description:
        "Lista o inspecciona metadata de Secure Files en Pipelines > Library sin descargar contenido ni tickets. list devuelve secure_file_id para get, update_metadata o delete; los bytes secretos nunca llegan al modelo.",
      source: "Azure DevOps Secure File",
      inputSchema: secureFileReadSchema,
      annotations: readOnlyAnnotations,
      operations: SecureFileToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "secure_file_write",
      title: "Administrar Secure Files",
      description:
        "Carga contenido base64, actualiza metadata o elimina Secure Files. Consulta primero la lista para evitar duplicados y usa el secure_file_id real. El contenido nunca se devuelve; delete requiere ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps Secure File",
      inputSchema: secureFileWriteSchema,
      annotations: destructiveAnnotations,
      operations: SecureFileToolSlice.createWriteOperations(scope),
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<SecureFileReadArguments>[] {
    return [
      new RestOperationDefinition("list", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/distributedtask/securefiles"),
        apiVersion: SECURE_FILES_API_VERSION,
        query: {
          namePattern: args.name_pattern,
          includeDownloadTickets: false,
          actionFilter: args.action_filter,
        },
      })),
      new RestOperationDefinition("get", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/distributedtask/securefiles/${scope.requiredSegment(args.secure_file_id, "secure_file_id")}`,
        ),
        apiVersion: SECURE_FILES_API_VERSION,
        query: { includeDownloadTicket: false, actionFilter: args.action_filter },
      })),
    ];
  }

  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<SecureFileWriteArguments>[] {
    return [
      new RestOperationDefinition("upload", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/distributedtask/securefiles"),
        apiVersion: SECURE_FILES_API_VERSION,
        query: {
          name: SecureFileToolSlice.requireString(args.name, "name"),
          authorizePipelines: args.authorize_pipelines ?? false,
        },
        body: SecureFileToolSlice.decodeBase64(args.content_base64),
        contentType: "application/octet-stream",
      })),
      new RestOperationDefinition("update_metadata", "write", (args) => ({
        method: "PUT",
        path: scope.project(
          args,
          `_apis/distributedtask/securefiles/${scope.requiredSegment(args.secure_file_id, "secure_file_id")}`,
        ),
        apiVersion: SECURE_FILES_API_VERSION,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/distributedtask/securefiles/${scope.requiredSegment(args.secure_file_id, "secure_file_id")}`,
        ),
        apiVersion: SECURE_FILES_API_VERSION,
      })),
    ];
  }

  private static decodeBase64(value: string | undefined): Uint8Array {
    if (value === undefined) {
      throw new Error("content_base64 es obligatorio para upload.");
    }
    return new Base64PayloadDecoder().decode(value, MAX_BASE64_CHARACTERS, "content_base64");
  }

  private static requireString(value: string | undefined, name: string): string {
    if (value === undefined || value.trim().length === 0) {
      throw new Error(`${name} es obligatorio para esta acción.`);
    }
    return value;
  }
}
