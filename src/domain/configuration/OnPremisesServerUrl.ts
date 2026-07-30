/**
 * Known Azure DevOps Services and Microsoft-hosted API suffixes.
 */
const CLOUD_HOST_SUFFIXES: readonly string[] = [
  ".dev.azure.com",
  ".visualstudio.com",
  ".vssps.visualstudio.com",
];

/**
 * Known Azure DevOps Services and Azure management hosts.
 */
const CLOUD_HOSTS: ReadonlySet<string> = new Set<string>([
  "almsearch.dev.azure.com",
  "app.vssps.visualstudio.com",
  "auditservice.dev.azure.com",
  "dev.azure.com",
  "feeds.dev.azure.com",
  "management.azure.com",
  "marketplace.visualstudio.com",
  "vsaex.dev.azure.com",
  "vssps.dev.azure.com",
  "vsrm.dev.azure.com",
]);

/**
 * Validated root URL for an operator-controlled Azure DevOps Server instance.
 *
 * @remarks
 * The path may contain an instance prefix such as `/tfs`, but it must not
 * contain a collection. Collections remain explicit request scope.
 */
export class OnPremisesServerUrl {
  /**
   * Normalized server root.
   */
  private readonly value: URL;

  /**
   * Creates a validated server URL.
   *
   * @param rawValue - Absolute HTTP or HTTPS Azure DevOps Server root.
   * @throws {Error} When the URL is invalid or identifies a Microsoft-hosted service.
   */
  public constructor(rawValue: string) {
    const trimmedValue: string = rawValue.trim();
    if (trimmedValue.length === 0) {
      throw new Error("ENRIAZURE_SERVER_URL es obligatorio.");
    }

    let parsedValue: URL;
    try {
      parsedValue = new URL(trimmedValue);
    } catch {
      throw new Error("ENRIAZURE_SERVER_URL debe ser una URL HTTP o HTTPS absoluta.");
    }

    if (parsedValue.protocol !== "http:" && parsedValue.protocol !== "https:") {
      throw new Error("ENRIAZURE_SERVER_URL debe usar HTTP o HTTPS.");
    }

    if (parsedValue.username.length > 0 || parsedValue.password.length > 0) {
      throw new Error("ENRIAZURE_SERVER_URL no debe contener credenciales.");
    }

    if (OnPremisesServerUrl.isCloudHost(parsedValue.hostname)) {
      throw new Error(
        `EnriAzure sólo admite Azure DevOps Server; '${parsedValue.hostname}' es un host de Azure Cloud/Services.`,
      );
    }

    parsedValue.hash = "";
    parsedValue.search = "";
    parsedValue.pathname = OnPremisesServerUrl.normalizeRootPath(parsedValue.pathname);
    this.value = parsedValue;
  }

  /**
   * Returns the normalized public server root.
   *
   * @returns Normalized URL without credentials, query, or fragment.
   */
  public toString(): string {
    return this.value.toString().replace(/\/$/, "");
  }

  /**
   * Resolves an API path without allowing it to replace an instance prefix.
   *
   * @param relativePath - Server-relative path beginning with `/`.
   * @returns Absolute URL constrained to the configured host and instance path.
   * @throws {Error} When the path is not a safe relative API path.
   */
  public resolve(relativePath: string): URL {
    if (!relativePath.startsWith("/") || relativePath.startsWith("//")) {
      throw new Error("Las rutas de solicitud de Azure DevOps deben iniciar con una diagonal.");
    }

    const decodedPath: string = decodeURIComponent(relativePath);
    if (decodedPath.split("/").includes("..")) {
      throw new Error(
        "Las rutas de solicitud de Azure DevOps no deben navegar al directorio padre.",
      );
    }

    const result: URL = new URL(this.value.toString());
    const rootPath: string = this.value.pathname.replace(/\/$/, "");
    result.pathname = `${rootPath}${relativePath}`;
    return result;
  }

  /**
   * Determines whether a host belongs to Microsoft-hosted Azure services.
   *
   * @param hostname - Hostname to inspect.
   * @returns `true` for a known cloud host.
   */
  private static isCloudHost(hostname: string): boolean {
    const normalizedHostname: string = hostname.toLowerCase();
    return (
      CLOUD_HOSTS.has(normalizedHostname) ||
      CLOUD_HOST_SUFFIXES.some((suffix: string): boolean => normalizedHostname.endsWith(suffix))
    );
  }

  /**
   * Normalizes an optional instance path.
   *
   * @param pathname - URL pathname.
   * @returns Empty string or a single-leading-slash path without a trailing slash.
   */
  private static normalizeRootPath(pathname: string): string {
    const normalizedPath: string = pathname.replace(/\/+/g, "/").replace(/\/$/, "");
    return normalizedPath === "/" ? "" : normalizedPath;
  }
}
