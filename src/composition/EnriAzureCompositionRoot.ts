import { RestOperationExecutor } from "../application/services/RestOperationExecutor.js";
import { RequestScope } from "../application/services/RequestScope.js";
import { InMemoryOfficialApiCatalog } from "../application/services/InMemoryOfficialApiCatalog.js";
import { OfficialApiRequestBuilder } from "../application/services/OfficialApiRequestBuilder.js";
import { OfficialApiService } from "../application/services/OfficialApiService.js";
import { EnvironmentPatProvider } from "../infrastructure/authentication/EnvironmentPatProvider.js";
import {
  EnvironmentConfiguration,
  type EnriAzureConfiguration,
} from "../infrastructure/configuration/EnvironmentConfiguration.js";
import { FetchAzureDevOpsGateway } from "../infrastructure/http/FetchAzureDevOpsGateway.js";
import {
  officialApiOperations,
  officialApiSchemas,
} from "../infrastructure/officialApi/catalog/index.generated.js";
import { EnriAzureMcpServer } from "../interface/mcp/EnriAzureMcpServer.js";
import { McpResultPresenter } from "../interface/mcp/McpResultPresenter.js";
import type { McpToolSlice } from "../interface/mcp/McpToolSlice.js";
import { AdministrationToolSlice } from "../interface/mcp/features/administration/AdministrationToolSlice.js";
import { AgentPoolToolSlice } from "../interface/mcp/features/agents/AgentPoolToolSlice.js";
import { ArtifactFeedToolSlice } from "../interface/mcp/features/artifacts/ArtifactFeedToolSlice.js";
import { BoardToolSlice } from "../interface/mcp/features/boards/BoardToolSlice.js";
import { DeploymentToolSlice } from "../interface/mcp/features/deployments/DeploymentToolSlice.js";
import { PipelineToolSlice } from "../interface/mcp/features/pipelines/PipelineToolSlice.js";
import { OfficialAreaToolSlice } from "../interface/mcp/features/officialApi/OfficialAreaToolSlice.js";
import { OfficialApiToolSlice } from "../interface/mcp/features/officialApi/OfficialApiToolSlice.js";
import { ProjectToolSlice } from "../interface/mcp/features/projects/ProjectToolSlice.js";
import { PullRequestToolSlice } from "../interface/mcp/features/pullRequests/PullRequestToolSlice.js";
import { RawRestToolSlice } from "../interface/mcp/features/rawRest/RawRestToolSlice.js";
import { ReleaseToolSlice } from "../interface/mcp/features/releases/ReleaseToolSlice.js";
import { RepositoryToolSlice } from "../interface/mcp/features/repositories/RepositoryToolSlice.js";
import { SearchToolSlice } from "../interface/mcp/features/search/SearchToolSlice.js";
import { SecureFileToolSlice } from "../interface/mcp/features/secureFiles/SecureFileToolSlice.js";
import { ServerToolSlice } from "../interface/mcp/features/server/ServerToolSlice.js";
import { TestToolSlice } from "../interface/mcp/features/tests/TestToolSlice.js";
import { VariableGroupToolSlice } from "../interface/mcp/features/variableGroups/VariableGroupToolSlice.js";
import { WikiToolSlice } from "../interface/mcp/features/wikis/WikiToolSlice.js";
import { WorkItemToolSlice } from "../interface/mcp/features/workItems/WorkItemToolSlice.js";
import { packageName, packageVersion } from "../package-info.js";

/**
 * Constructs the complete EnriAzure object graph.
 */
export class EnriAzureCompositionRoot {
  /**
   * Creates a configured MCP server.
   *
   * @returns Ready-to-run MCP server.
   */
  public createServer(): EnriAzureMcpServer {
    const configuration: EnriAzureConfiguration = new EnvironmentConfiguration().load();
    const patProvider: EnvironmentPatProvider = new EnvironmentPatProvider();
    patProvider.getToken();

    const gateway: FetchAzureDevOpsGateway = new FetchAzureDevOpsGateway(
      configuration.serverUrl,
      patProvider,
      {
        timeoutMs: configuration.requestTimeoutMs,
        maxResponseBytes: configuration.maxResponseBytes,
        userAgent: `${packageName}/${packageVersion}`,
      },
    );
    const executor: RestOperationExecutor = new RestOperationExecutor(
      gateway,
      configuration.writePolicy,
    );
    const scope: RequestScope = new RequestScope(configuration.scopeDefaults);
    const presenter: McpResultPresenter = new McpResultPresenter();
    const officialCatalog: InMemoryOfficialApiCatalog = new InMemoryOfficialApiCatalog(
      officialApiOperations,
      officialApiSchemas,
    );
    const officialApiService: OfficialApiService = new OfficialApiService(
      officialCatalog,
      new OfficialApiRequestBuilder(officialCatalog, scope),
      executor,
    );
    const officialAreaSlices: readonly McpToolSlice[] = officialCatalog
      .listAreas()
      .map(
        (area: string): McpToolSlice =>
          new OfficialAreaToolSlice(area, officialCatalog, officialApiService, presenter),
      );
    const slices: readonly McpToolSlice[] = [
      new ServerToolSlice(executor, presenter, scope, configuration.serverUrl.toString()),
      new OfficialApiToolSlice(officialCatalog, officialApiService, presenter),
      ...officialAreaSlices,
      new ProjectToolSlice(executor, presenter, scope),
      new AgentPoolToolSlice(executor, presenter, scope),
      new ArtifactFeedToolSlice(executor, presenter, scope),
      new RepositoryToolSlice(executor, presenter, scope),
      new PullRequestToolSlice(executor, presenter, scope),
      new WorkItemToolSlice(executor, presenter, scope),
      new BoardToolSlice(executor, presenter, scope),
      new PipelineToolSlice(executor, presenter, scope),
      new DeploymentToolSlice(executor, presenter, scope),
      new ReleaseToolSlice(executor, presenter, scope),
      new VariableGroupToolSlice(executor, presenter, scope),
      new WikiToolSlice(executor, presenter, scope),
      new TestToolSlice(executor, presenter, scope),
      new SearchToolSlice(executor, presenter, scope),
      new SecureFileToolSlice(executor, presenter, scope),
      new AdministrationToolSlice(executor, presenter, scope),
      new RawRestToolSlice(executor, presenter, scope),
    ];
    return new EnriAzureMcpServer(slices);
  }
}
