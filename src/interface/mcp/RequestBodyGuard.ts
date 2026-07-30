/**
 * Requires an opaque JSON body for a mutation.
 *
 * @param body - Optional request body.
 * @returns Required request body.
 * @throws {Error} When the caller omitted the body.
 */
export function requireRequestBody(
  body: Record<string, unknown> | readonly unknown[] | undefined,
): Record<string, unknown> | readonly unknown[] {
  if (body === undefined) {
    throw new Error("body es obligatorio para esta acción.");
  }
  return body;
}
