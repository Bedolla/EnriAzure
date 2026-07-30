import type { PatProvider } from "../../application/ports/PatProvider.js";

/**
 * Reads the current PAT from the process environment for every request.
 *
 * @remarks
 * Reading on demand permits secret rotation without caching the token in an
 * application object.
 */
export class EnvironmentPatProvider implements PatProvider {
  /**
   * Environment variable containing the raw PAT.
   */
  private static readonly VARIABLE_NAME: string = "ENRIAZURE_PAT";

  /**
   * Exact syntax for delegating PAT storage to another environment variable.
   */
  private static readonly REFERENCE_PATTERN: RegExp = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

  /**
   * Reads the current PAT.
   *
   * @returns Current raw PAT.
   * @throws {Error} When the configured value or referenced variable is missing.
   */
  public getToken(): string {
    const configuredValue: string = process.env[EnvironmentPatProvider.VARIABLE_NAME]?.trim() ?? "";
    if (configuredValue.length === 0) {
      throw new Error(`${EnvironmentPatProvider.VARIABLE_NAME} es obligatorio.`);
    }

    const referenceMatch: RegExpExecArray | null =
      EnvironmentPatProvider.REFERENCE_PATTERN.exec(configuredValue);
    if (referenceMatch === null) {
      return configuredValue;
    }

    const referencedVariableName: string | undefined = referenceMatch[1];
    if (referencedVariableName === undefined) {
      throw new Error(`${EnvironmentPatProvider.VARIABLE_NAME} contiene una referencia inválida.`);
    }

    const referencedToken: string = process.env[referencedVariableName]?.trim() ?? "";
    if (referencedToken.length === 0) {
      throw new Error(
        `${EnvironmentPatProvider.VARIABLE_NAME} referencia ${referencedVariableName}, pero esa variable de entorno no existe o está vacía.`,
      );
    }
    return referencedToken;
  }
}
