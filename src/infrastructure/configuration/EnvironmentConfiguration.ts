import { OnPremisesServerUrl } from "../../domain/configuration/OnPremisesServerUrl.js";
import { WritePolicy } from "../../domain/configuration/WritePolicy.js";
import type { RequestScopeDefaults } from "../../application/services/RequestScope.js";

/**
 * Complete immutable runtime configuration.
 */
export interface EnriAzureConfiguration {
  /**
   * Validated on-premises server root.
   */
  readonly serverUrl: OnPremisesServerUrl;

  /**
   * Optional default scope.
   */
  readonly scopeDefaults: RequestScopeDefaults;

  /**
   * Per-request timeout.
   */
  readonly requestTimeoutMs: number;

  /**
   * Maximum response body accepted in memory.
   */
  readonly maxResponseBytes: number;

  /**
   * Mutation boundary.
   */
  readonly writePolicy: WritePolicy;
}

/**
 * Parses and validates EnriAzure environment variables.
 */
export class EnvironmentConfiguration {
  /**
   * Number of milliseconds in one configured second.
   */
  private static readonly MILLISECONDS_PER_SECOND: number = 1_000;

  /**
   * Number of bytes in one configured megabyte.
   */
  private static readonly BYTES_PER_MEGABYTE: number = 1_048_576;

  /**
   * Default request timeout in user-facing seconds.
   */
  private static readonly DEFAULT_TIMEOUT_SECONDS: number = 180;

  /**
   * Default response limit in user-facing megabytes.
   */
  private static readonly DEFAULT_MAX_RESPONSE_MB: number = 64;

  /**
   * Loads the process environment.
   *
   * @returns Validated runtime configuration.
   */
  public load(): EnriAzureConfiguration {
    return {
      serverUrl: new OnPremisesServerUrl(process.env["ENRIAZURE_SERVER_URL"] ?? ""),
      scopeDefaults: {
        ...(EnvironmentConfiguration.optional("ENRIAZURE_DEFAULT_COLLECTION") === undefined
          ? {}
          : {
              collection: EnvironmentConfiguration.optional("ENRIAZURE_DEFAULT_COLLECTION"),
            }),
        ...(EnvironmentConfiguration.optional("ENRIAZURE_DEFAULT_PROJECT") === undefined
          ? {}
          : { project: EnvironmentConfiguration.optional("ENRIAZURE_DEFAULT_PROJECT") }),
      },
      requestTimeoutMs: this.parsePositiveScaledInteger(
        "ENRIAZURE_REQUEST_TIMEOUT_SECONDS",
        EnvironmentConfiguration.DEFAULT_TIMEOUT_SECONDS,
        EnvironmentConfiguration.MILLISECONDS_PER_SECOND,
      ),
      maxResponseBytes: this.parsePositiveScaledInteger(
        "ENRIAZURE_MAX_RESPONSE_SIZE_MB",
        EnvironmentConfiguration.DEFAULT_MAX_RESPONSE_MB,
        EnvironmentConfiguration.BYTES_PER_MEGABYTE,
      ),
      writePolicy: WritePolicy.parse(process.env["ENRIAZURE_WRITE_POLICY"]),
    };
  }

  /**
   * Reads a trimmed optional variable.
   *
   * @param name - Variable name.
   * @returns Trimmed value or `undefined`.
   */
  private static optional(name: string): string | undefined {
    const value: string = process.env[name]?.trim() ?? "";
    return value.length === 0 ? undefined : value;
  }

  /**
   * Parses a positive integer environment variable.
   *
   * @param name - Variable name.
   * @param defaultValue - Value used when the variable is absent.
   * @returns Parsed value.
   */
  private parsePositiveInteger(name: string, defaultValue: number): number {
    const rawValue: string | undefined = process.env[name];
    if (rawValue === undefined || rawValue.trim().length === 0) {
      return defaultValue;
    }

    const value: number = Number(rawValue);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} debe ser un entero positivo seguro.`);
    }
    return value;
  }

  /**
   * Parses a positive integer and converts it to an internal unit.
   *
   * @param name - Environment variable name.
   * @param defaultValue - User-facing value used when the variable is absent.
   * @param multiplier - Internal units represented by one configured unit.
   * @returns Safely converted internal value.
   */
  private parsePositiveScaledInteger(
    name: string,
    defaultValue: number,
    multiplier: number,
  ): number {
    const configuredValue: number = this.parsePositiveInteger(name, defaultValue);
    const convertedValue: number = configuredValue * multiplier;
    if (!Number.isSafeInteger(convertedValue)) {
      throw new Error(`${name} es demasiado grande.`);
    }
    return convertedValue;
  }
}
