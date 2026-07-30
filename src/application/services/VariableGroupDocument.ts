import type { AzureDevOpsResponse } from "../ports/AzureDevOpsGateway.js";
import type { VariableGroupVariableInput } from "./VariableGroupContracts.js";

/**
 * Validates, clones, and redacts Azure DevOps Variable Group JSON documents.
 */
export class VariableGroupDocument {
  /**
   * Converts caller variables to the Azure DevOps REST representation.
   *
   * @param variables - Caller variable map.
   * @returns Native REST variable map.
   */
  public static serializeVariables(
    variables: Readonly<Record<string, VariableGroupVariableInput>>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(variables).map(([name, variable]): [string, unknown] => [
        name,
        {
          value: variable.value ?? "",
          isSecret: variable.isSecret ?? false,
          isReadOnly: variable.isReadOnly ?? false,
        },
      ]),
    );
  }

  /**
   * Clones the variable map from a group response.
   *
   * @param group - Variable Group JSON.
   * @returns Mutable deep clone used to build an update.
   */
  public readVariables(group: Record<string, unknown>): Record<string, unknown> {
    const variables: Record<string, unknown> | undefined = VariableGroupDocument.optionalRecord(
      group["variables"],
    );
    return variables === undefined ? {} : structuredClone(variables);
  }

  /**
   * Determines whether caller input contains an explicitly secret value.
   *
   * @param variables - Optional caller variables.
   * @returns `true` when any variable is secret.
   */
  public static containsSecret(
    variables: Readonly<Record<string, VariableGroupVariableInput>> | undefined,
  ): boolean {
    return Object.values(variables ?? {}).some(
      (variable: VariableGroupVariableInput): boolean => variable.isSecret === true,
    );
  }

  /**
   * Redacts every secret variable value in an Azure DevOps response.
   *
   * @param response - Raw response.
   * @returns Response with secret values replaced by `null`.
   */
  public static redactSecretValues(response: AzureDevOpsResponse): AzureDevOpsResponse {
    return {
      ...response,
      data: this.redactValue(response.data),
    };
  }

  /**
   * Requires a JSON object.
   *
   * @param value - Unknown value.
   * @param name - Diagnostic name.
   * @returns JSON object.
   */
  public static requireRecord(value: unknown, name: string): Record<string, unknown> {
    const record: Record<string, unknown> | undefined = this.optionalRecord(value);
    if (record === undefined) {
      throw new Error(`${name} no es un objeto JSON.`);
    }
    return record;
  }

  /**
   * Attempts to read a JSON object.
   *
   * @param value - Unknown value.
   * @returns Record or `undefined`.
   */
  public static optionalRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  /**
   * Requires a non-empty response string.
   *
   * @param value - Unknown value.
   * @param name - Diagnostic name.
   * @returns String value.
   */
  public static requireString(value: unknown, name: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${name} no está presente en la respuesta de Azure DevOps.`);
    }
    return value;
  }

  private static redactValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry: unknown): unknown => this.redactValue(entry));
    }
    const record: Record<string, unknown> | undefined = this.optionalRecord(value);
    if (record === undefined) {
      return value;
    }
    const redacted: Record<string, unknown> = Object.fromEntries(
      Object.entries(record).map(([key, entry]): [string, unknown] => [
        key,
        this.redactValue(entry),
      ]),
    );
    if (redacted["isSecret"] === true && "value" in redacted) {
      redacted["value"] = null;
    }
    return redacted;
  }
}
