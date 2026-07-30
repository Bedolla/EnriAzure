import type { AzureDevOpsRequest, AzureDevOpsResponse } from "../ports/AzureDevOpsGateway.js";
import type {
  OfficialApiCatalog,
  OfficialApiExecutionInput,
  OfficialApiOperationDefinition,
  OfficialApiOperationExecutor,
} from "../ports/OfficialApiCatalog.js";
import { OfficialApiRequestBuilder } from "./OfficialApiRequestBuilder.js";
import { RestOperationExecutor } from "./RestOperationExecutor.js";

/**
 * Executes only operations present in the generated on-premises catalog.
 */
export class OfficialApiService implements OfficialApiOperationExecutor {
  private readonly catalog: OfficialApiCatalog;
  private readonly requestBuilder: OfficialApiRequestBuilder;
  private readonly executor: RestOperationExecutor;

  /**
   * Creates the catalog operation service.
   *
   * @param catalog - Generated operation catalog.
   * @param requestBuilder - Safe request builder.
   * @param executor - Policy-enforcing REST executor.
   */
  public constructor(
    catalog: OfficialApiCatalog,
    requestBuilder: OfficialApiRequestBuilder,
    executor: RestOperationExecutor,
  ) {
    this.catalog = catalog;
    this.requestBuilder = requestBuilder;
    this.executor = executor;
  }

  /** @inheritdoc */
  public execute(input: OfficialApiExecutionInput): Promise<AzureDevOpsResponse> {
    const operation: OfficialApiOperationDefinition = this.catalog.get(input.operation);
    return this.executor.execute(operation.risk, this.requestBuilder.build(input));
  }

  /** @inheritdoc */
  public buildRequest(input: OfficialApiExecutionInput): AzureDevOpsRequest {
    return this.requestBuilder.build(input);
  }
}
