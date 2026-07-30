import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  AzureDevOpsRequest,
  AzureDevOpsResponse,
} from "../../application/ports/AzureDevOpsGateway.js";
import { RestOperationExecutor } from "../../application/services/RestOperationExecutor.js";
import type { OperationRisk } from "../../domain/configuration/WritePolicy.js";
import { McpResultPresenter } from "./McpResultPresenter.js";

/**
 * Shared safe execution boundary for REST-backed MCP slices.
 */
export abstract class AbstractRestToolSlice {
  /**
   * Guarded operation executor.
   */
  protected readonly executor: RestOperationExecutor;

  /**
   * MCP response presenter.
   */
  protected readonly presenter: McpResultPresenter;

  /**
   * Creates a REST-backed slice.
   *
   * @param executor - Guarded operation executor.
   * @param presenter - Safe result presenter.
   */
  protected constructor(executor: RestOperationExecutor, presenter: McpResultPresenter) {
    this.executor = executor;
    this.presenter = presenter;
  }

  /**
   * Executes and presents one request.
   *
   * @param risk - Operation risk.
   * @param request - Azure DevOps request.
   * @param source - Source label used by spotlighting.
   * @returns MCP tool result.
   */
  protected async execute(
    risk: OperationRisk,
    request: AzureDevOpsRequest,
    source: string,
  ): Promise<CallToolResult> {
    try {
      const response: AzureDevOpsResponse = await this.executor.execute(risk, request);
      return this.presenter.success(response, source);
    } catch (error: unknown) {
      return this.presenter.error(error);
    }
  }
}
