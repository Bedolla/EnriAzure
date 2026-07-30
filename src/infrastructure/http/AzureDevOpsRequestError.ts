/**
 * Safe error returned when Azure DevOps rejects or cannot complete a request.
 */
export class AzureDevOpsRequestError extends Error {
  /**
   * HTTP status when a response was received.
   */
  public readonly statusCode: number | undefined;

  /**
   * Creates a safe request error.
   *
   * @param message - Redacted human-readable message.
   * @param statusCode - Optional HTTP status.
   */
  public constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "AzureDevOpsRequestError";
    this.statusCode = statusCode;
  }
}
