/**
 * Mutability required by an Azure DevOps operation.
 */
export type OperationRisk = "read" | "write" | "destructive";

/**
 * Operator-selected permission boundary for mutating MCP tools.
 */
export type WritePolicyName = "read-only" | "write" | "full";

/**
 * Enforces the configured mutation boundary independently from MCP clients.
 */
export class WritePolicy {
  /**
   * Selected policy.
   */
  private readonly name: WritePolicyName;

  /**
   * Creates a write policy.
   *
   * @param name - Policy name.
   */
  public constructor(name: WritePolicyName) {
    this.name = name;
  }

  /**
   * Parses a policy supplied by configuration.
   *
   * @param rawValue - Untrusted configuration value.
   * @returns Parsed write policy.
   * @throws {Error} When the value is unsupported.
   */
  public static parse(rawValue: string | undefined): WritePolicy {
    const normalizedValue: string = (rawValue ?? "read-only").trim().toLowerCase();
    if (
      normalizedValue !== "read-only" &&
      normalizedValue !== "write" &&
      normalizedValue !== "full"
    ) {
      throw new Error("ENRIAZURE_WRITE_POLICY debe ser read-only, write o full.");
    }

    return new WritePolicy(normalizedValue);
  }

  /**
   * Returns the configured policy name.
   *
   * @returns Policy name.
   */
  public getName(): WritePolicyName {
    return this.name;
  }

  /**
   * Verifies that an operation is permitted.
   *
   * @param risk - Operation risk.
   * @throws {Error} When the operation exceeds the selected policy.
   */
  public assertAllowed(risk: OperationRisk): void {
    if (risk === "read") {
      return;
    }

    if (risk === "write" && (this.name === "write" || this.name === "full")) {
      return;
    }

    if (risk === "destructive" && this.name === "full") {
      return;
    }

    if (risk === "destructive") {
      throw new Error(
        `La operación elimina o quita estado y requiere ENRIAZURE_WRITE_POLICY=full; la política actual es '${this.name}'.`,
      );
    }

    throw new Error(
      `La operación requiere acceso '${risk}', pero ENRIAZURE_WRITE_POLICY es '${this.name}'.`,
    );
  }
}
