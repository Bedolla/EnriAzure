/**
 * Strict base64 decoding for binary MCP request bodies.
 */
export class Base64PayloadDecoder {
  /**
   * Decodes a bounded canonical or padded base64 string.
   *
   * @param value - Encoded input.
   * @param maximumCharacters - Input character limit.
   * @param fieldName - Public field name used in safe errors.
   * @returns Decoded bytes.
   */
  public decode(value: string, maximumCharacters: number, fieldName: string): Uint8Array {
    if (value.length > maximumCharacters) {
      throw new Error(`${fieldName} excede el límite de ${maximumCharacters} caracteres.`);
    }
    const normalized: string = value.replace(/\s+/gu, "");
    if (
      normalized.length % 4 === 1 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(normalized)
    ) {
      throw new Error(`${fieldName} debe contener base64 válido.`);
    }
    const bytes: Buffer = Buffer.from(normalized, "base64");
    const canonicalInput: string = normalized.replace(/=+$/u, "");
    const canonicalDecoded: string = bytes.toString("base64").replace(/=+$/u, "");
    if (canonicalInput !== canonicalDecoded) {
      throw new Error(`${fieldName} debe contener base64 válido.`);
    }
    return Uint8Array.from(bytes);
  }
}
