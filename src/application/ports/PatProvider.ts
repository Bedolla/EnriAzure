/**
 * Supplies the current Azure DevOps Server Personal Access Token.
 */
export interface PatProvider {
  /**
   * Reads the token without exposing it to logs or results.
   *
   * @returns Current raw PAT.
   */
  getToken(): string;
}
