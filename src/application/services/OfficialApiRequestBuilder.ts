import type {
  AzureDevOpsQuery,
  AzureDevOpsRequest,
  AzureDevOpsRequestHeaderName,
} from "../ports/AzureDevOpsGateway.js";
import type {
  OfficialApiCatalog,
  OfficialApiExecutionInput,
  OfficialApiOperationDefinition,
  OfficialApiParameterDefinition,
  OfficialApiScalar,
} from "../ports/OfficialApiCatalog.js";
import { Base64PayloadDecoder } from "./Base64PayloadDecoder.js";
import { OfficialApiContractValidator } from "./OfficialApiContractValidator.js";
import { RequestScope } from "./RequestScope.js";

const MAXIMUM_BASE64_CHARACTERS: number = 20_000_000;

/**
 * Converts one generated official operation and caller values into a
 * same-authority Azure DevOps Server request.
 */
export class OfficialApiRequestBuilder {
  private readonly catalog: OfficialApiCatalog;
  private readonly scope: RequestScope;
  private readonly base64Decoder: Base64PayloadDecoder;
  private readonly contractValidator: OfficialApiContractValidator;

  /**
   * Creates the request builder.
   *
   * @param catalog - Official operation catalog.
   * @param scope - Configured scope resolver.
   */
  public constructor(catalog: OfficialApiCatalog, scope: RequestScope) {
    this.catalog = catalog;
    this.scope = scope;
    this.base64Decoder = new Base64PayloadDecoder();
    this.contractValidator = new OfficialApiContractValidator();
  }

  /**
   * Builds a constrained request for one exact catalog operation.
   *
   * @param input - Caller input.
   * @returns Transport request.
   */
  public build(input: OfficialApiExecutionInput): AzureDevOpsRequest {
    const operation: OfficialApiOperationDefinition = this.catalog.get(input.operation);
    const body: unknown = this.buildBody(operation, input);
    const accept: string | undefined = this.selectAccept(operation, input.accept);
    return {
      method: operation.method,
      path: this.buildPath(operation, input),
      apiVersion: operation.apiVersion,
      query: this.buildQuery(operation, input),
      ...(body === undefined ? {} : { body }),
      ...(body === undefined ? {} : { contentType: this.selectContentType(operation, input) }),
      ...(accept === undefined ? {} : { accept }),
      ...this.buildHeaders(operation, input),
      ...(accept !== undefined && this.contractValidator.isBinaryMediaType(accept)
        ? { responseMode: "base64" as const }
        : {}),
    };
  }

  private buildPath(
    operation: OfficialApiOperationDefinition,
    input: OfficialApiExecutionInput,
  ): string {
    const supplied: Readonly<Record<string, OfficialApiScalar>> = input.pathParameters ?? {};
    const scopeParameterNames: ReadonlySet<string> = OfficialApiRequestBuilder.scopeParameterNames(
      operation.pathTemplate,
    );
    const definitions: readonly OfficialApiParameterDefinition[] = operation.parameters.filter(
      (parameter): boolean =>
        parameter.location === "path" && !scopeParameterNames.has(parameter.name),
    );
    const allowedNames: ReadonlySet<string> = new Set(
      definitions.map((parameter): string => parameter.name),
    );
    this.contractValidator.rejectUnknownNames(
      Object.keys(supplied),
      allowedNames,
      "parámetro de ruta",
      operation.key,
    );

    let template: string = operation.pathTemplate;
    for (const definition of definitions) {
      const rawValue: OfficialApiScalar | undefined = supplied[definition.name];
      if (rawValue === undefined) {
        throw new Error(
          `La operación oficial '${operation.key}' requiere el parámetro de ruta '${definition.name}'.`,
        );
      }
      this.contractValidator.assertParameterType(definition, rawValue);
      const stringValue: string = String(rawValue);
      const encodedValue: string =
        definition.skipUrlEncoding === true
          ? this.scope.hierarchySegments(stringValue, definition.name)
          : this.scope.requiredSegment(stringValue, definition.name);
      template = template.replace(
        new RegExp(
          `\\{${OfficialApiRequestBuilder.escapeRegularExpression(definition.name)}\\}`,
          "giu",
        ),
        encodedValue,
      );
    }

    if (/\{[^}]+\}/u.test(template.replace(/\{collection\}|\{project\}|\{team\}/gu, ""))) {
      throw new Error(
        `La operación oficial '${operation.key}' tiene parámetros de ruta sin resolver.`,
      );
    }
    return this.applyScope(operation, template, input);
  }

  private applyScope(
    operation: OfficialApiOperationDefinition,
    template: string,
    input: OfficialApiExecutionInput,
  ): string {
    const requestedScope = input.scopeLevel ?? "auto";
    const teamPrefix: string = "/{collection}/{project}/{team}/";
    if (template.startsWith(teamPrefix)) {
      const apiPath: string = template.slice(teamPrefix.length);
      if (requestedScope === "instance" || requestedScope === "collection") {
        throw new Error(`La operación oficial '${operation.key}' requiere alcance de proyecto.`);
      }
      if (requestedScope === "team" || (requestedScope === "auto" && input.team !== undefined)) {
        return this.scope.team(input, apiPath);
      }
      return this.scope.project(input, apiPath);
    }
    const projectPrefix: string = "/{collection}/{project}/";
    if (template.startsWith(projectPrefix)) {
      const apiPath: string = template.slice(projectPrefix.length);
      if (requestedScope === "instance" || requestedScope === "team") {
        throw new Error(
          `La operación oficial '${operation.key}' no admite el alcance '${requestedScope}'.`,
        );
      }
      if (requestedScope === "collection") {
        this.assertOptionalScopeParameter(operation, "project");
        return this.scope.collection(input, apiPath);
      }
      return this.scope.project(input, apiPath);
    }
    const collectionPrefix: string = "/{collection}/";
    if (template.startsWith(collectionPrefix)) {
      const apiPath: string = template.slice(collectionPrefix.length);
      if (
        requestedScope === "project" ||
        requestedScope === "team" ||
        requestedScope === "collection"
      ) {
        if (requestedScope !== "collection") {
          throw new Error(
            `La operación oficial '${operation.key}' no admite el alcance '${requestedScope}'.`,
          );
        }
        return this.scope.collection(input, apiPath);
      }
      if (requestedScope === "instance") {
        this.assertOptionalScopeParameter(operation, "collection");
        return this.scope.instance(apiPath);
      }
      return this.scope.collection(input, apiPath);
    }
    if (template.startsWith("/_apis/")) {
      return this.scope.instance(template);
    }
    throw new Error(
      `La plantilla de ruta oficial '${template}' tiene un alcance on-premises no reconocido.`,
    );
  }

  private assertOptionalScopeParameter(
    operation: OfficialApiOperationDefinition,
    name: "collection" | "project",
  ): void {
    const definition: OfficialApiParameterDefinition | undefined = operation.parameters.find(
      (parameter): boolean => parameter.location === "path" && parameter.name === name,
    );
    if (definition?.required !== false) {
      throw new Error(
        `La operación oficial '${operation.key}' no permite omitir el alcance '${name}'.`,
      );
    }
  }

  private buildQuery(
    operation: OfficialApiOperationDefinition,
    input: OfficialApiExecutionInput,
  ): AzureDevOpsQuery {
    const supplied = input.queryParameters ?? {};
    const definitions: readonly OfficialApiParameterDefinition[] = operation.parameters.filter(
      (parameter): boolean => parameter.location === "query",
    );
    const allowedNames: ReadonlySet<string> = new Set(
      definitions.map((parameter): string => parameter.name),
    );
    this.contractValidator.rejectUnknownNames(
      Object.keys(supplied),
      allowedNames,
      "parámetro de consulta",
      operation.key,
    );

    const query: Record<string, boolean | number | string | undefined> = {};
    for (const definition of definitions) {
      const value = supplied[definition.name];
      if (value === undefined) {
        if (definition.required) {
          throw new Error(
            `La operación oficial '${operation.key}' requiere el parámetro de consulta '${definition.name}'.`,
          );
        }
        continue;
      }
      this.contractValidator.assertParameterType(definition, value);
      query[definition.name] = this.contractValidator.isScalarArray(value)
        ? value.map((entry: OfficialApiScalar): string => String(entry)).join(",")
        : value;
    }
    return query;
  }

  private buildHeaders(
    operation: OfficialApiOperationDefinition,
    input: OfficialApiExecutionInput,
  ): Pick<AzureDevOpsRequest, "headers" | "ifMatch"> {
    const supplied: Readonly<Record<string, string>> = input.headers ?? {};
    const definitions: readonly OfficialApiParameterDefinition[] = operation.parameters.filter(
      (parameter): boolean => parameter.location === "header",
    );
    const allowedNames: ReadonlySet<string> = new Set(
      definitions.map((parameter): string => parameter.name),
    );
    this.contractValidator.rejectUnknownNames(
      Object.keys(supplied),
      allowedNames,
      "header",
      operation.key,
    );

    const headers: Partial<Record<AzureDevOpsRequestHeaderName, string>> = {};
    let ifMatch: string | undefined;
    for (const definition of definitions) {
      const value: string | undefined = supplied[definition.name];
      if (value === undefined) {
        if (definition.required) {
          throw new Error(
            `La operación oficial '${operation.key}' requiere el header '${definition.name}'.`,
          );
        }
        continue;
      }
      switch (definition.name) {
        case "Version":
          ifMatch = value;
          break;
        case "contentRangeHeader":
          headers["Content-Range"] = value;
          break;
        case "continuationToken":
          headers["continuationToken"] = value;
          break;
        case "eTag":
          headers["ETag"] = value;
          break;
        default:
          throw new Error(
            `La operación oficial '${operation.key}' declara el header no permitido '${definition.name}'.`,
          );
      }
    }
    return {
      ...(Object.keys(headers).length === 0 ? {} : { headers }),
      ...(ifMatch === undefined ? {} : { ifMatch }),
    };
  }

  private buildBody(
    operation: OfficialApiOperationDefinition,
    input: OfficialApiExecutionInput,
  ): unknown {
    if (input.body !== undefined && input.bodyBase64 !== undefined) {
      throw new Error("Proporciona body o body_base64, pero no ambos.");
    }
    const definition: OfficialApiParameterDefinition | undefined = operation.parameters.find(
      (parameter): boolean => parameter.location === "body",
    );
    const hasBody: boolean = input.body !== undefined || input.bodyBase64 !== undefined;
    if (definition === undefined && hasBody) {
      throw new Error(`La operación oficial '${operation.key}' no acepta cuerpo de solicitud.`);
    }
    if (definition?.required === true && !hasBody) {
      throw new Error(`La operación oficial '${operation.key}' requiere un cuerpo de solicitud.`);
    }
    if (input.bodyBase64 === undefined) {
      return input.body;
    }
    if (!operation.consumes.includes("application/octet-stream")) {
      throw new Error(`La operación oficial '${operation.key}' no acepta un cuerpo binario.`);
    }
    return this.base64Decoder.decode(input.bodyBase64, MAXIMUM_BASE64_CHARACTERS, "body_base64");
  }
  private selectContentType(
    operation: OfficialApiOperationDefinition,
    input: OfficialApiExecutionInput,
  ): "application/json" | "application/json-patch+json" | "application/octet-stream" {
    if (input.bodyBase64 !== undefined) {
      return "application/octet-stream";
    }
    if (operation.consumes.includes("application/json-patch+json")) {
      return "application/json-patch+json";
    }
    return "application/json";
  }
  private selectAccept(
    operation: OfficialApiOperationDefinition,
    requested: string | undefined,
  ): string | undefined {
    if (requested !== undefined && !operation.produces.includes(requested)) {
      throw new Error(
        `La operación oficial '${operation.key}' no documenta el media type de respuesta '${requested}'.`,
      );
    }
    return requested ?? operation.produces[0];
  }
  private static scopeParameterNames(pathTemplate: string): ReadonlySet<string> {
    if (pathTemplate.startsWith("/{collection}/{project}/{team}/")) {
      return new Set(["collection", "project", "team"]);
    }
    if (pathTemplate.startsWith("/{collection}/{project}/")) {
      return new Set(["collection", "project"]);
    }
    if (pathTemplate.startsWith("/{collection}/")) {
      return new Set(["collection"]);
    }
    return new Set();
  }
  private static escapeRegularExpression(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  }
}
