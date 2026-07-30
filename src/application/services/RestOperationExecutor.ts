import type {
  AzureDevOpsGateway,
  AzureDevOpsRequest,
  AzureDevOpsResponse,
} from "../ports/AzureDevOpsGateway.js";
import type { OperationRisk } from "../../domain/configuration/WritePolicy.js";
import { WritePolicy } from "../../domain/configuration/WritePolicy.js";

/**
 * Executes REST operations after enforcing the operator write boundary.
 */
export class RestOperationExecutor {
  /**
   * Azure DevOps transport.
   */
  private readonly gateway: AzureDevOpsGateway;

  /**
   * Mutation boundary.
   */
  private readonly writePolicy: WritePolicy;

  /**
   * Creates an operation executor.
   *
   * @param gateway - Azure DevOps gateway.
   * @param writePolicy - Operator-selected mutation boundary.
   */
  public constructor(gateway: AzureDevOpsGateway, writePolicy: WritePolicy) {
    this.gateway = gateway;
    this.writePolicy = writePolicy;
  }

  /**
   * Returns the active write policy.
   *
   * @returns Policy name.
   */
  public getWritePolicyName(): string {
    return this.writePolicy.getName();
  }

  /**
   * Executes an allowed request.
   *
   * @param risk - Operation risk.
   * @param request - Transport-independent request.
   * @returns Parsed Azure DevOps response.
   */
  public async execute(
    risk: OperationRisk,
    request: AzureDevOpsRequest,
  ): Promise<AzureDevOpsResponse> {
    this.writePolicy.assertAllowed(risk);
    return this.gateway.send(request);
  }
}
