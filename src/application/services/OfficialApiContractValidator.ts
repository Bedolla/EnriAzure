import type {
  OfficialApiParameterDefinition,
  OfficialApiScalar,
} from "../ports/OfficialApiCatalog.js";

/**
 * Validates caller values against retained official OpenAPI metadata.
 */
export class OfficialApiContractValidator {
  /**
   * Validates one path or query parameter value.
   *
   * @param definition - Official parameter definition.
   * @param value - Caller-supplied scalar or scalar array.
   */
  public assertParameterType(
    definition: OfficialApiParameterDefinition,
    value: OfficialApiScalar | readonly OfficialApiScalar[],
  ): void {
    if (definition.type === "array") {
      if (!this.isScalarArray(value)) {
        throw new Error(
          `El parámetro ${definition.location} '${definition.name}' debe ser un arreglo.`,
        );
      }
      return;
    }
    if (this.isScalarArray(value)) {
      throw new Error(
        `El parámetro ${definition.location} '${definition.name}' no acepta un arreglo.`,
      );
    }
    if (definition.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`El parámetro ${definition.location} '${definition.name}' debe ser boolean.`);
    }
    if (definition.type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
      throw new Error(
        `El parámetro ${definition.location} '${definition.name}' debe ser un entero.`,
      );
    }
    if (definition.type === "number" && typeof value !== "number") {
      throw new Error(
        `El parámetro ${definition.location} '${definition.name}' debe ser numérico.`,
      );
    }
    if (definition.type === "string" && typeof value !== "string") {
      throw new Error(`El parámetro ${definition.location} '${definition.name}' debe ser string.`);
    }
    if (
      definition.allowedValues !== undefined &&
      !definition.allowedValues.some((allowed: OfficialApiScalar): boolean => allowed === value)
    ) {
      throw new Error(
        `El parámetro ${definition.location} '${definition.name}' debe usar uno de sus valores documentados.`,
      );
    }
    if (
      definition.format === "uuid" &&
      (typeof value !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value))
    ) {
      throw new Error(`El parámetro ${definition.location} '${definition.name}' debe ser un UUID.`);
    }
    if (
      definition.format === "date-time" &&
      (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    ) {
      throw new Error(
        `El parámetro ${definition.location} '${definition.name}' debe ser fecha y hora ISO.`,
      );
    }
  }

  /**
   * Rejects names absent from one operation contract.
   *
   * @param suppliedNames - Caller-supplied names.
   * @param allowedNames - Exact allowed names.
   * @param kind - Spanish diagnostic kind.
   * @param operationKey - Selected operation key.
   */
  public rejectUnknownNames(
    suppliedNames: readonly string[],
    allowedNames: ReadonlySet<string>,
    kind: string,
    operationKey: string,
  ): void {
    const unknown: string | undefined = suppliedNames.find(
      (name): boolean => !allowedNames.has(name),
    );
    if (unknown !== undefined) {
      throw new Error(`La operación oficial '${operationKey}' no documenta ${kind} '${unknown}'.`);
    }
  }

  /**
   * Determines whether one media type must be transported as binary.
   *
   * @param mediaType - Documented response media type.
   * @returns Whether base64 response serialization is required.
   */
  public isBinaryMediaType(mediaType: string): boolean {
    const normalized: string = mediaType.toLowerCase();
    return (
      normalized.includes("application/octet-stream") ||
      normalized.includes("application/zip") ||
      normalized.startsWith("image/")
    );
  }

  /**
   * Narrows a supported parameter value to an array.
   *
   * @param value - Scalar or array input.
   * @returns Whether the input is an array.
   */
  public isScalarArray(
    value: OfficialApiScalar | readonly OfficialApiScalar[],
  ): value is readonly OfficialApiScalar[] {
    return Array.isArray(value);
  }
}
