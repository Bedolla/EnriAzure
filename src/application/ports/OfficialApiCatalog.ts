import type {
  AzureDevOpsHttpMethod,
  AzureDevOpsRequest,
  AzureDevOpsResponse,
} from "./AzureDevOpsGateway.js";
import type { OperationRisk } from "../../domain/configuration/WritePolicy.js";

/**
 * Scalar value accepted by documented path and query parameters.
 */
export type OfficialApiScalar = boolean | number | string;

/**
 * Caller values for documented query parameters.
 */
export type OfficialApiQueryInput = Readonly<
  Record<string, OfficialApiScalar | readonly OfficialApiScalar[]>
>;

/**
 * Location of one parameter in an official REST operation.
 */
export type OfficialApiParameterLocation = "body" | "header" | "path" | "query";

/**
 * Parameter metadata retained from an official on-premises OpenAPI contract.
 */
export interface OfficialApiParameterDefinition {
  /**
   * Wire name from the official specification.
   */
  readonly name: string;

  /**
   * Request location.
   */
  readonly location: OfficialApiParameterLocation;

  /**
   * Whether the server contract requires the value.
   */
  readonly required: boolean;

  /**
   * OpenAPI primitive type when declared.
   */
  readonly type?: string | undefined;

  /**
   * OpenAPI scalar format when declared.
   */
  readonly format?: string | undefined;

  /**
   * Exact allowed scalar values when declared.
   */
  readonly allowedValues?: readonly OfficialApiScalar[] | undefined;

  /**
   * Referenced request-body schema when declared.
   */
  readonly schemaReference?: string | undefined;

  /**
   * Exact inline OpenAPI schema, including array item references.
   */
  readonly schema?: unknown;

  /**
   * Whether a path value intentionally retains hierarchy separators.
   */
  readonly skipUrlEncoding?: boolean | undefined;

  /**
   * Short official parameter description.
   */
  readonly description?: string | undefined;
}

/**
 * One operation from the official Azure DevOps Server 7.1 specifications.
 */
export interface OfficialApiOperationDefinition {
  /**
   * Globally unique operation key used by MCP callers.
   */
  readonly key: string;

  /**
   * Official specification area.
   */
  readonly area: string;

  /**
   * Source specification filename without the on-premises suffix.
   */
  readonly specification: string;

  /**
   * Official OpenAPI operation identifier.
   */
  readonly operationId: string;

  /**
   * HTTP method.
   */
  readonly method: AzureDevOpsHttpMethod;

  /**
   * Server-relative route template.
   */
  readonly pathTemplate: string;

  /**
   * Exact API version required by this operation.
   */
  readonly apiVersion: string;

  /**
   * Application policy boundary.
   */
  readonly risk: OperationRisk;

  /**
   * Official tags.
   */
  readonly tags: readonly string[];

  /**
   * Short official operation description.
   */
  readonly description: string;

  /**
   * Documented parameters excluding api-version.
   */
  readonly parameters: readonly OfficialApiParameterDefinition[];

  /**
   * Documented request media types.
   */
  readonly consumes: readonly string[];

  /**
   * Documented response media types.
   */
  readonly produces: readonly string[];
}

/**
 * One reusable OpenAPI definition from an official on-premises specification.
 */
export interface OfficialApiSchemaDefinition {
  /**
   * Official specification area.
   */
  readonly area: string;

  /**
   * Source specification filename without the on-premises suffix.
   */
  readonly specification: string;

  /**
   * Local OpenAPI reference, for example `#/definitions/GitRepository`.
   */
  readonly reference: string;

  /**
   * Exact OpenAPI schema object.
   */
  readonly schema: unknown;
}

/**
 * Input used to execute one catalog operation.
 */
export interface OfficialApiExecutionInput {
  /**
   * Operation key returned by the catalog tool.
   */
  readonly operation: string;

  /**
   * Optional collection override.
   */
  readonly collection?: string | undefined;

  /**
   * Optional project override.
   */
  readonly project?: string | undefined;

  /**
   * Optional team route value.
   */
  readonly team?: string | undefined;

  /**
   * Explicit route scope when an official path makes collection, project, or
   * team segments optional. Auto uses supplied/configured defaults.
   */
  readonly scopeLevel?: "auto" | "collection" | "instance" | "project" | "team" | undefined;

  /**
   * Non-scope path parameters keyed by their official names.
   */
  readonly pathParameters?: Readonly<Record<string, OfficialApiScalar>> | undefined;

  /**
   * Query parameters keyed by their official names.
   */
  readonly queryParameters?: OfficialApiQueryInput | undefined;

  /**
   * Documented request headers keyed by their official parameter names.
   */
  readonly headers?: Readonly<Record<string, string>> | undefined;

  /**
   * JSON-compatible body.
   */
  readonly body?: unknown;

  /**
   * Base64 body for official application/octet-stream operations.
   */
  readonly bodyBase64?: string | undefined;

  /**
   * Optional documented response media type.
   */
  readonly accept?: string | undefined;
}

/**
 * Search filters for the official operation catalog.
 */
export interface OfficialApiSearch {
  /**
   * Optional exact area.
   */
  readonly area?: string | undefined;

  /**
   * Optional HTTP method.
   */
  readonly method?: AzureDevOpsHttpMethod | undefined;

  /**
   * Optional public access level.
   */
  readonly access?: "full" | "read" | "write" | undefined;

  /**
   * Case-insensitive text matched against keys, identifiers, tags, routes, and descriptions.
   */
  readonly text?: string | undefined;

  /**
   * Maximum returned operations.
   */
  readonly top?: number | undefined;
}

/**
 * Catalog lookup abstraction for generated official operations.
 */
export interface OfficialApiCatalog {
  /**
   * Returns the number of generated specifications.
   */
  getSpecificationCount(): number;

  /**
   * Returns the number of generated operations.
   */
  getOperationCount(): number;

  /**
   * Returns the number of reusable OpenAPI definitions.
   */
  getSchemaCount(): number;

  /**
   * Returns every source area.
   */
  listAreas(): readonly string[];

  /**
   * Gets one exact operation.
   *
   * @param key - Generated operation key.
   * @returns Operation definition.
   */
  get(key: string): OfficialApiOperationDefinition;

  /**
   * Resolves the request schema for an operation and, optionally, all local
   * schema dependencies required to understand it.
   *
   * @param operationKey - Generated operation key.
   * @param schemaReference - Optional exact local reference. When omitted, all
   * request-body schema references from the operation are used.
   * @param includeDependencies - Whether to follow nested local `$ref` values.
   * @returns Root schemas followed by their unique dependencies.
   */
  getSchemaBundle(
    operationKey: string,
    schemaReference: string | undefined,
    includeDependencies: boolean,
  ): readonly OfficialApiSchemaDefinition[];

  /**
   * Searches operation metadata.
   *
   * @param filters - Optional filters.
   * @returns Matching operation definitions.
   */
  search(filters: OfficialApiSearch): readonly OfficialApiOperationDefinition[];
}

/**
 * Executes exact operations selected from an official catalog.
 */
export interface OfficialApiOperationExecutor {
  /**
   * Executes a catalog operation.
   *
   * @param input - Validated caller input.
   * @returns Azure DevOps response.
   */
  execute(input: OfficialApiExecutionInput): Promise<AzureDevOpsResponse>;

  /**
   * Builds a request without sending it.
   *
   * @param input - Validated caller input.
   * @returns Constrained request.
   */
  buildRequest(input: OfficialApiExecutionInput): AzureDevOpsRequest;
}
