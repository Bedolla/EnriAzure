import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  AzureDevOpsQuery,
  AzureDevOpsQueryValue,
  AzureDevOpsRequest,
  AzureDevOpsRequestHeaderName,
} from "../../../../application/ports/AzureDevOpsGateway.js";
import { Base64PayloadDecoder } from "../../../../application/services/Base64PayloadDecoder.js";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";
import {
  MAXIMUM_RAW_BASE64_CHARACTERS,
  type RawArguments,
  type RawReadArguments,
  type RawWriteArguments,
  rawReadSchema,
  rawWriteSchema,
} from "./RawRestToolSchemas.js";

/**
 * Guarded escape hatch for documented on-premises REST operations not yet
 * represented by a high-level slice.
 */
export class RawRestToolSlice implements McpToolSlice {
  private readonly readTool: CatalogRestToolSlice<RawReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<RawWriteArguments>;
  private static readonly base64Decoder: Base64PayloadDecoder = new Base64PayloadDecoder();

  /**
   * Creates the raw REST slice.
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
      name: "raw_rest",
      title: "Consultar un endpoint REST de Azure DevOps Server",
      description:
        "Escape hatch avanzado on-premises para una ruta _apis GET o HEAD documentada que no tenga una tool explícita. Elige scope de forma intencional, copia ruta/versión/query de la documentación de Server y usa IDs devueltos por tools list/get. No permite reemplazar el host configurado, usar URLs de Azure Cloud ni proporcionar headers de autorización.",
      source: "Azure DevOps raw REST",
      inputSchema: rawReadSchema,
      annotations: readOnlyAnnotations,
      operations: [
        new RestOperationDefinition("get", "read", (args) =>
          RawRestToolSlice.buildRequest(args, scope, "GET"),
        ),
        new RestOperationDefinition("head", "read", (args) =>
          RawRestToolSlice.buildRequest(args, scope, "HEAD"),
        ),
      ],
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "raw_rest_write",
      title: "Modificar un endpoint REST de Azure DevOps Server",
      description:
        "Escape hatch avanzado on-premises para una ruta _apis POST, PUT, PATCH o DELETE documentada que no tenga una tool explícita. Primero descubre IDs con una tool de lectura/catálogo, usa verbo/body/versión exactos, conserva secretos enmascarados cuando aplique e inspecciona el objetivo antes de modificar. DELETE requiere ENRIAZURE_WRITE_POLICY=full; las demás mutaciones requieren write o full. No permite reemplazar host ni autorización.",
      source: "Azure DevOps raw REST",
      inputSchema: rawWriteSchema,
      annotations: destructiveAnnotations,
      operations: [
        new RestOperationDefinition("post", "write", (args) =>
          RawRestToolSlice.buildRequest(args, scope, "POST"),
        ),
        new RestOperationDefinition("put", "write", (args) =>
          RawRestToolSlice.buildRequest(args, scope, "PUT"),
        ),
        new RestOperationDefinition("patch", "write", (args) =>
          RawRestToolSlice.buildRequest(args, scope, "PATCH"),
        ),
        new RestOperationDefinition("delete", "destructive", (args) =>
          RawRestToolSlice.buildRequest(args, scope, "DELETE"),
        ),
      ],
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  /**
   * Builds a constrained raw request.
   *
   * @param args - Validated raw arguments.
   * @param scope - Route scope builder.
   * @param method - HTTP method.
   * @returns Safe request contract.
   */
  private static buildRequest(
    args: RawArguments,
    scope: RequestScope,
    method: AzureDevOpsRequest["method"],
  ): AzureDevOpsRequest {
    const apiPath: string = RawRestToolSlice.validateApiPath(args.api_path);
    let path: string;
    switch (args.scope) {
      case "instance":
        path = scope.instance(apiPath);
        break;
      case "collection":
        path = scope.collection(args, apiPath);
        break;
      case "project":
        path = scope.project(args, apiPath);
        break;
      case "team":
        path = scope.team(args, apiPath);
        break;
    }

    const query: AzureDevOpsQuery | undefined =
      args.query === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(args.query).map(([key, value]): [string, AzureDevOpsQueryValue] => [
              key,
              Array.isArray(value) ? value.join(",") : value,
            ]),
          );
    const writeArgs: RawWriteArguments | undefined =
      args.action === "post" ||
      args.action === "put" ||
      args.action === "patch" ||
      args.action === "delete"
        ? args
        : undefined;
    const binaryBody: Uint8Array | undefined =
      writeArgs?.body_base64 === undefined
        ? undefined
        : RawRestToolSlice.base64Decoder.decode(
            writeArgs.body_base64,
            MAXIMUM_RAW_BASE64_CHARACTERS,
            "body_base64",
          );
    const body: unknown = binaryBody ?? writeArgs?.body;
    const headers: Readonly<Partial<Record<AzureDevOpsRequestHeaderName, string>>> | undefined =
      RawRestToolSlice.buildHeaders(args.headers);
    return {
      method,
      path,
      ...(args.api_version === undefined ? {} : { apiVersion: args.api_version }),
      ...(query === undefined ? {} : { query }),
      ...(body === undefined ? {} : { body }),
      ...(body === undefined
        ? {}
        : {
            contentType:
              binaryBody === undefined
                ? (writeArgs?.content_type ?? "application/json")
                : ("application/octet-stream" as const),
          }),
      ...(args.accept === undefined ? {} : { accept: args.accept }),
      ...(args.response_mode === undefined ? {} : { responseMode: args.response_mode }),
      ...(headers === undefined ? {} : { headers }),
    };
  }

  private static buildHeaders(
    input: RawArguments["headers"],
  ): Readonly<Partial<Record<AzureDevOpsRequestHeaderName, string>>> | undefined {
    if (input === undefined) {
      return undefined;
    }
    return {
      ...(input.if_match === undefined ? {} : { "If-Match": input.if_match }),
      ...(input.if_none_match === undefined ? {} : { "If-None-Match": input.if_none_match }),
      ...(input.range === undefined ? {} : { Range: input.range }),
      ...(input.content_range === undefined ? {} : { "Content-Range": input.content_range }),
      ...(input.etag === undefined ? {} : { ETag: input.etag }),
      ...(input.continuation_token === undefined
        ? {}
        : { continuationToken: input.continuation_token }),
    };
  }

  /**
   * Restricts the caller to Azure DevOps REST paths.
   *
   * @param rawPath - Untrusted path.
   * @returns Normalized path.
   */
  private static validateApiPath(rawPath: string): string {
    const path: string = rawPath.replace(/^\/+/, "");
    if (!path.toLowerCase().startsWith("_apis/")) {
      throw new Error("api_path debe iniciar con _apis/.");
    }
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(path);
    } catch {
      throw new Error("api_path contiene una codificación de porcentaje inválida.");
    }
    if (decodedPath.split("/").includes("..") || path.includes("?") || path.includes("#")) {
      throw new Error(
        "api_path no debe contener navegación al directorio padre, fragmento ni query string.",
      );
    }
    return path;
  }
}
