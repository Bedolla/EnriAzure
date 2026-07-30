/**
 * HTTP methods used by supported Azure DevOps Server REST operations.
 */
export type AzureDevOpsHttpMethod = "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";

/**
 * Scalar query value accepted by the gateway.
 */
export type AzureDevOpsQueryValue = boolean | number | string | undefined;

/**
 * Query parameters for one Azure DevOps request.
 */
export type AzureDevOpsQuery = Readonly<Record<string, AzureDevOpsQueryValue>>;

/**
 * Additional request headers required by documented first-party operations.
 */
export type AzureDevOpsRequestHeaderName =
  "Content-Range" | "ETag" | "If-Match" | "If-None-Match" | "Range" | "continuationToken";

/**
 * Response decoding selected by a first-party operation.
 */
export type AzureDevOpsResponseMode = "auto" | "base64" | "text";

/**
 * Transport-independent Azure DevOps request.
 */
export interface AzureDevOpsRequest {
  /**
   * HTTP method.
   */
  readonly method: AzureDevOpsHttpMethod;

  /**
   * Server-relative path.
   */
  readonly path: string;

  /**
   * Optional API version override.
   */
  readonly apiVersion?: string;

  /**
   * Optional query values.
   */
  readonly query?: AzureDevOpsQuery;

  /**
   * Optional JSON-compatible request body.
   */
  readonly body?: unknown;

  /**
   * Request media type when a body is present.
   */
  readonly contentType?:
    "application/json" | "application/json-patch+json" | "application/octet-stream";

  /**
   * Expected response media type.
   */
  readonly accept?: string;

  /**
   * Optional entity tag for concurrency-aware first-party operations.
   */
  readonly ifMatch?: string;

  /**
   * Constrained first-party headers. Authentication and authority headers are
   * intentionally impossible to supply.
   */
  readonly headers?: Readonly<Partial<Record<AzureDevOpsRequestHeaderName, string>>>;

  /**
   * Response decoding for binary and explicitly textual operations.
   */
  readonly responseMode?: AzureDevOpsResponseMode;
}

/**
 * Selected response headers that are safe and useful to MCP callers.
 */
export interface AzureDevOpsResponseHeaders {
  /**
   * Continuation token for paged APIs.
   */
  readonly continuationToken?: string | undefined;

  /**
   * Entity version used by concurrency-aware APIs.
   */
  readonly eTag?: string | undefined;
}

/**
 * Transport-independent Azure DevOps response.
 */
export interface AzureDevOpsResponse {
  /**
   * HTTP status code.
   */
  readonly statusCode: number;

  /**
   * Parsed JSON, text, or `null` for an empty response.
   */
  readonly data: unknown;

  /**
   * Response media type.
   */
  readonly contentType: string;

  /**
   * Safe response headers.
   */
  readonly headers: AzureDevOpsResponseHeaders;
}

/**
 * Application port for Azure DevOps Server REST communication.
 */
export interface AzureDevOpsGateway {
  /**
   * Sends one authenticated request.
   *
   * @param request - Transport-independent request.
   * @returns Parsed response.
   */
  send(request: AzureDevOpsRequest): Promise<AzureDevOpsResponse>;
}
