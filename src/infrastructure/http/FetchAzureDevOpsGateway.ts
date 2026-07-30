import type {
  AzureDevOpsGateway,
  AzureDevOpsQueryValue,
  AzureDevOpsRequest,
  AzureDevOpsResponse,
  AzureDevOpsResponseHeaders,
} from "../../application/ports/AzureDevOpsGateway.js";
import type { PatProvider } from "../../application/ports/PatProvider.js";
import { OnPremisesServerUrl } from "../../domain/configuration/OnPremisesServerUrl.js";
import { AzureDevOpsRequestError } from "./AzureDevOpsRequestError.js";

/**
 * Runtime settings for the fetch gateway.
 */
export interface FetchAzureDevOpsGatewayOptions {
  /**
   * Per-request timeout.
   */
  readonly timeoutMs: number;

  /**
   * Maximum response body accepted in memory.
   */
  readonly maxResponseBytes: number;

  /**
   * Product user agent.
   */
  readonly userAgent: string;
}

/**
 * Azure DevOps Server REST gateway implemented with the Node.js fetch API.
 */
export class FetchAzureDevOpsGateway implements AzureDevOpsGateway {
  /**
   * Stable REST profile documented for Azure DevOps Server 2022 Update 1 and
   * compatible newer 2022 updates.
   */
  private static readonly STABLE_API_VERSION: string = "7.1";

  /**
   * Validated server root.
   */
  private readonly serverUrl: OnPremisesServerUrl;

  /**
   * Secret provider.
   */
  private readonly patProvider: PatProvider;

  /**
   * Runtime settings.
   */
  private readonly options: FetchAzureDevOpsGatewayOptions;

  /**
   * Creates the REST gateway.
   *
   * @param serverUrl - Validated on-premises server root.
   * @param patProvider - Current PAT provider.
   * @param options - Timeout, response, version, and user-agent settings.
   */
  public constructor(
    serverUrl: OnPremisesServerUrl,
    patProvider: PatProvider,
    options: FetchAzureDevOpsGatewayOptions,
  ) {
    this.serverUrl = serverUrl;
    this.patProvider = patProvider;
    this.options = options;
  }

  /**
   * Sends one authenticated Azure DevOps Server request.
   *
   * @param request - Transport-independent request.
   * @returns Parsed response.
   */
  public async send(request: AzureDevOpsRequest): Promise<AzureDevOpsResponse> {
    const url: URL = this.buildUrl(request);
    const headers: Headers = this.buildHeaders(request);
    const body: BodyInit | undefined = this.serializeBody(request);

    let response: Response;
    try {
      response = await fetch(url, {
        method: request.method,
        headers,
        ...(body === undefined ? {} : { body }),
        redirect: "manual",
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error: unknown) {
      throw new AzureDevOpsRequestError(
        `Falló la solicitud a Azure DevOps Server: ${FetchAzureDevOpsGateway.safeNetworkMessage(error)}.`,
      );
    }

    const bytes: Uint8Array = await this.readLimitedBody(response);
    const contentType: string = response.headers.get("content-type") ?? "";
    const data: unknown = this.parseBody(bytes, contentType, request.responseMode ?? "auto");

    if (!response.ok) {
      throw new AzureDevOpsRequestError(
        `Azure DevOps Server devolvió HTTP ${response.status}: ${this.extractErrorMessage(data)}.`,
        response.status,
      );
    }

    const selectedHeaders: AzureDevOpsResponseHeaders = {
      ...(response.headers.get("x-ms-continuationtoken") === null
        ? {}
        : {
            continuationToken: response.headers.get("x-ms-continuationtoken") ?? undefined,
          }),
      ...(response.headers.get("etag") === null
        ? {}
        : { eTag: response.headers.get("etag") ?? undefined }),
    };

    return {
      statusCode: response.status,
      data,
      contentType,
      headers: selectedHeaders,
    };
  }

  /**
   * Builds a constrained request URL.
   *
   * @param request - Request contract.
   * @returns Absolute URL on the configured server.
   */
  private buildUrl(request: AzureDevOpsRequest): URL {
    const url: URL = this.serverUrl.resolve(request.path);
    const queryEntries: readonly [string, AzureDevOpsQueryValue][] = Object.entries(
      request.query ?? {},
    );

    for (const [name, value] of queryEntries) {
      if (value !== undefined) {
        url.searchParams.append(name, String(value));
      }
    }

    if (!url.searchParams.has("api-version")) {
      url.searchParams.set(
        "api-version",
        request.apiVersion ?? FetchAzureDevOpsGateway.STABLE_API_VERSION,
      );
    }
    return url;
  }

  /**
   * Creates request headers without retaining the PAT.
   *
   * @param request - Request contract.
   * @returns HTTP headers.
   */
  private buildHeaders(request: AzureDevOpsRequest): Headers {
    const basicCredential: string = Buffer.from(`:${this.patProvider.getToken()}`, "utf8").toString(
      "base64",
    );
    const headers: Headers = new Headers({
      Accept: request.accept ?? "application/json",
      Authorization: `Basic ${basicCredential}`,
      "User-Agent": this.options.userAgent,
    });

    if (request.body !== undefined) {
      headers.set("Content-Type", request.contentType ?? "application/json");
    }
    if (request.ifMatch !== undefined) {
      headers.set("If-Match", request.ifMatch);
    }
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      headers.set(name, value);
    }
    return headers;
  }

  /**
   * Serializes JSON requests and preserves explicit secure-file binary bodies.
   *
   * @param request - Request contract.
   * @returns Fetch-compatible body.
   */
  private serializeBody(request: AzureDevOpsRequest): BodyInit | undefined {
    if (request.body === undefined) {
      return undefined;
    }
    if (request.contentType === "application/octet-stream") {
      if (!(request.body instanceof Uint8Array)) {
        throw new AzureDevOpsRequestError(
          "Una solicitud application/octet-stream requiere un body Uint8Array.",
        );
      }
      return Uint8Array.from(request.body);
    }
    return JSON.stringify(request.body);
  }

  /**
   * Reads a response while enforcing a hard byte limit.
   *
   * @param response - Fetch response.
   * @returns Complete response body.
   */
  private async readLimitedBody(response: Response): Promise<Uint8Array> {
    if (response.body === null) {
      return new Uint8Array();
    }

    const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes: number = 0;

    let complete: boolean = false;
    try {
      while (!complete) {
        const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
        if (result.done) {
          complete = true;
          continue;
        }

        totalBytes += result.value.byteLength;
        if (totalBytes > this.options.maxResponseBytes) {
          await reader.cancel();
          throw new AzureDevOpsRequestError(
            "La respuesta de Azure DevOps excedió el límite de una respuesta configurado por ENRIAZURE_MAX_RESPONSE_SIZE_MB. Usa filtros o paginación, o aumenta ese valor si necesitas la respuesta completa.",
          );
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }

    const body: Uint8Array = new Uint8Array(totalBytes);
    let offset: number = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  }

  /**
   * Parses JSON and text response bodies.
   *
   * @param bytes - Response bytes.
   * @param contentType - Response media type.
   * @param responseMode - Requested decoding.
   * @returns Parsed data.
   */
  private parseBody(
    bytes: Uint8Array,
    contentType: string,
    responseMode: "auto" | "base64" | "text",
  ): unknown {
    if (bytes.byteLength === 0) {
      return null;
    }

    const normalizedContentType: string = contentType.toLowerCase();
    const binary: boolean =
      responseMode === "base64" ||
      (responseMode === "auto" &&
        (normalizedContentType.includes("application/octet-stream") ||
          normalizedContentType.includes("application/zip") ||
          normalizedContentType.startsWith("image/")));
    if (binary) {
      return {
        encoding: "base64",
        byteLength: bytes.byteLength,
        content: Buffer.from(bytes).toString("base64"),
      };
    }

    const text: string = new TextDecoder("utf-8").decode(bytes);
    if (responseMode !== "text" && normalizedContentType.includes("json")) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new AzureDevOpsRequestError("Azure DevOps Server devolvió JSON inválido.");
      }
    }
    return text;
  }

  /**
   * Extracts a concise Azure DevOps error message without copying headers.
   *
   * @param data - Parsed response data.
   * @returns Safe error message.
   */
  private extractErrorMessage(data: unknown): string {
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      const record: Record<string, unknown> = data as Record<string, unknown>;
      for (const key of ["message", "errorMessage", "typeName"]) {
        const candidate: unknown = record[key];
        if (typeof candidate === "string" && candidate.trim().length > 0) {
          return candidate.trim().slice(0, 1_000);
        }
      }
    }

    if (typeof data === "string" && data.trim().length > 0) {
      return data
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1_000);
    }
    return "el servidor no devolvió detalles del error";
  }

  /**
   * Produces a network error message that cannot contain request headers.
   *
   * @param error - Fetch failure.
   * @returns Safe short message.
   */
  private static safeNetworkMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === "TimeoutError") {
        return "la solicitud agotó su tiempo de espera";
      }
      return error.message.slice(0, 500);
    }
    return "error de red desconocido";
  }
}
