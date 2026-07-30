const SENSITIVE_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  "accesstoken",
  "apikey",
  "authkey",
  "clientsecret",
  "password",
  "pat",
  "personalaccesstoken",
  "privatekey",
  "refreshtoken",
  "secret",
  "secretvalue",
]);

/**
 * Recursively removes common credential fields and Azure DevOps masked
 * Variable Group values from external response data.
 */
export class SecretRedactor {
  /**
   * Returns a redacted deep clone.
   *
   * @param value - External Azure DevOps value.
   * @returns Safe clone.
   */
  public redact(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry: unknown): unknown => this.redact(entry));
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }

    const source: Record<string, unknown> = value as Record<string, unknown>;
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) {
      redacted[key] = SecretRedactor.isSensitiveProperty(key) ? "[REDACTED]" : this.redact(entry);
    }
    if (source["isSecret"] === true && Object.hasOwn(source, "value")) {
      redacted["value"] = null;
    }
    return redacted;
  }

  private static isSensitiveProperty(name: string): boolean {
    const normalized: string = name.replace(/[^a-zA-Z0-9]/gu, "").toLowerCase();
    return SENSITIVE_PROPERTY_NAMES.has(normalized);
  }
}
