/**
 * Defaults used to resolve optional collection and project arguments.
 */
export interface RequestScopeDefaults {
  /**
   * Default collection name.
   */
  readonly collection?: string | undefined;

  /**
   * Default project name or identifier.
   */
  readonly project?: string | undefined;
}

/**
 * Common optional scope supplied by MCP tools.
 */
export interface OptionalRequestScope {
  /**
   * Collection name.
   */
  readonly collection?: string | undefined;

  /**
   * Project name or identifier.
   */
  readonly project?: string | undefined;

  /**
   * Team name or identifier.
   */
  readonly team?: string | undefined;
}

/**
 * Resolves configured defaults and safely encodes Azure DevOps route segments.
 */
export class RequestScope {
  /**
   * Configured defaults.
   */
  private readonly defaults: RequestScopeDefaults;

  /**
   * Creates a scope resolver.
   *
   * @param defaults - Optional collection and project defaults.
   */
  public constructor(defaults: RequestScopeDefaults) {
    this.defaults = defaults;
  }

  /**
   * Builds an instance-level API path.
   *
   * @param apiPath - Path below the instance root.
   * @returns Safe request path.
   */
  public instance(apiPath: string): string {
    return RequestScope.join(apiPath);
  }

  /**
   * Builds a collection-level API path.
   *
   * @param scope - Request scope.
   * @param apiPath - Path below the collection.
   * @returns Safe request path.
   */
  public collection(scope: OptionalRequestScope, apiPath: string): string {
    const collection: string = this.requireValue(
      scope.collection ?? this.defaults.collection,
      "collection",
    );
    return RequestScope.join(RequestScope.segment(collection), apiPath);
  }

  /**
   * Builds a project-level API path.
   *
   * @param scope - Request scope.
   * @param apiPath - Path below the project.
   * @returns Safe request path.
   */
  public project(scope: OptionalRequestScope, apiPath: string): string {
    const project: string = this.requireValue(scope.project ?? this.defaults.project, "project");
    return RequestScope.join(
      RequestScope.segment(
        this.requireValue(scope.collection ?? this.defaults.collection, "collection"),
      ),
      RequestScope.segment(project),
      apiPath,
    );
  }

  /**
   * Builds a team-level API path.
   *
   * @param scope - Request scope.
   * @param apiPath - Path below the team.
   * @returns Safe request path.
   */
  public team(scope: OptionalRequestScope, apiPath: string): string {
    return RequestScope.join(
      RequestScope.segment(
        this.requireValue(scope.collection ?? this.defaults.collection, "collection"),
      ),
      RequestScope.segment(this.requireValue(scope.project ?? this.defaults.project, "project")),
      RequestScope.segment(this.requireValue(scope.team, "team")),
      apiPath,
    );
  }

  /**
   * Encodes one required route value.
   *
   * @param value - Raw value.
   * @param name - Argument name for errors.
   * @returns Encoded route segment.
   */
  public requiredSegment(value: string | number | undefined, name: string): string {
    const stringValue: string | undefined = typeof value === "number" ? value.toString() : value;
    return RequestScope.segment(this.requireValue(stringValue, name));
  }

  /**
   * Resolves and encodes a project argument with the configured default.
   *
   * @param value - Optional project name or identifier.
   * @returns Encoded project route segment.
   */
  public projectSegment(value: string | undefined): string {
    return RequestScope.segment(this.requireValue(value ?? this.defaults.project, "project"));
  }

  /**
   * Encodes a caller-supplied hierarchy path one segment at a time.
   *
   * @param value - Slash- or backslash-separated hierarchy path.
   * @param name - Argument name used in validation errors.
   * @returns Safe route fragment retaining hierarchy separators.
   */
  public hierarchySegments(value: string | undefined, name: string): string {
    const path: string = this.requireValue(value, name);
    const segments: readonly string[] = path
      .split(/[\\/]+/)
      .map((segment: string): string => segment.trim())
      .filter((segment: string): boolean => segment.length > 0);
    if (
      segments.length === 0 ||
      segments.some((segment: string): boolean => segment === "." || segment === "..")
    ) {
      throw new Error(`${name} debe contener segmentos de jerarquía seguros.`);
    }
    return segments.map((segment: string): string => RequestScope.segment(segment)).join("/");
  }

  /**
   * Ensures that a value is non-empty.
   *
   * @param value - Optional value.
   * @param name - Argument name.
   * @returns Trimmed value.
   */
  private requireValue(value: string | undefined, name: string): string {
    const trimmedValue: string = value?.trim() ?? "";
    if (trimmedValue.length === 0) {
      throw new Error(`${name} es obligatorio y no hay un default configurado.`);
    }
    return trimmedValue;
  }

  /**
   * Encodes one route segment.
   *
   * @param value - Raw segment.
   * @returns Percent-encoded segment.
   */
  private static segment(value: string): string {
    return encodeURIComponent(value);
  }

  /**
   * Joins route fragments without allowing absolute URL replacement.
   *
   * @param parts - Route fragments.
   * @returns Single-leading-slash path.
   */
  private static join(...parts: readonly string[]): string {
    const joinedPath: string = parts
      .map((part: string): string => part.replace(/^\/+|\/+$/g, ""))
      .filter((part: string): boolean => part.length > 0)
      .join("/");
    return `/${joinedPath}`;
  }
}
