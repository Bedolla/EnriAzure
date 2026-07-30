import type { OfficialApiOperationDefinition, OfficialApiSchemaDefinition } from "../../../application/ports/OfficialApiCatalog.js";
import { approvalsAndChecksPipelinePermissionsSchemas, approvalsAndChecksPipelinePermissionsOperations } from "./approvals-and-checks-pipeline-permissions.generated.js";
import { approvalsAndChecksPipelinesChecksSchemas, approvalsAndChecksPipelinesChecksOperations } from "./approvals-and-checks-pipelines-checks.generated.js";
import { approvalsAndChecksPipelinesapprovalSchemas, approvalsAndChecksPipelinesapprovalOperations } from "./approvals-and-checks-pipelinesapproval.generated.js";
import { artifactsFeedSchemas, artifactsFeedOperations } from "./artifacts-feed.generated.js";
import { artifactsPackageTypesMavenSchemas, artifactsPackageTypesMavenOperations } from "./artifacts-package-types-maven.generated.js";
import { artifactsPackageTypesNpmSchemas, artifactsPackageTypesNpmOperations } from "./artifacts-package-types-npm.generated.js";
import { artifactsPackageTypesNuGetSchemas, artifactsPackageTypesNuGetOperations } from "./artifacts-package-types-nu-get.generated.js";
import { buildBuildSchemas, buildBuildOperations } from "./build-build.generated.js";
import { coreCoreSchemas, coreCoreOperations } from "./core-core.generated.js";
import { dashboardDashboardSchemas, dashboardDashboardOperations } from "./dashboard-dashboard.generated.js";
import { distributedTaskTaskSchemas, distributedTaskTaskOperations } from "./distributed-task-task.generated.js";
import { distributedTaskTaskAgentSchemas, distributedTaskTaskAgentOperations } from "./distributed-task-task-agent.generated.js";
import { extensionManagementExtensionManagementSchemas, extensionManagementExtensionManagementOperations } from "./extension-management-extension-management.generated.js";
import { favoriteFavoriteSchemas, favoriteFavoriteOperations } from "./favorite-favorite.generated.js";
import { gitGitSchemas, gitGitOperations } from "./git-git.generated.js";
import { hooksServiceHooksSchemas, hooksServiceHooksOperations } from "./hooks-service-hooks.generated.js";
import { imsIdentitiesSchemas, imsIdentitiesOperations } from "./ims-identities.generated.js";
import { notificationNotificationSchemas, notificationNotificationOperations } from "./notification-notification.generated.js";
import { operationsOperationsSchemas, operationsOperationsOperations } from "./operations-operations.generated.js";
import { pipelinesPipelinesSchemas, pipelinesPipelinesOperations } from "./pipelines-pipelines.generated.js";
import { policyPolicySchemas, policyPolicyOperations } from "./policy-policy.generated.js";
import { processadminWorkItemTrackingProcessTemplateSchemas, processadminWorkItemTrackingProcessTemplateOperations } from "./processadmin-work-item-tracking-process-template.generated.js";
import { processesWorkItemTrackingProcessSchemas, processesWorkItemTrackingProcessOperations } from "./processes-work-item-tracking-process.generated.js";
import { releaseReleaseSchemas, releaseReleaseOperations } from "./release-release.generated.js";
import { searchSearchSchemas, searchSearchOperations } from "./search-search.generated.js";
import { securitySecuritySchemas, securitySecurityOperations } from "./security-security.generated.js";
import { securityRolesSecurityRolesSchemas, securityRolesSecurityRolesOperations } from "./security-roles-security-roles.generated.js";
import { serviceEndpointServiceEndpointSchemas, serviceEndpointServiceEndpointOperations } from "./service-endpoint-service-endpoint.generated.js";
import { testTestSchemas, testTestOperations } from "./test-test.generated.js";
import { testPlanTestPlanSchemas, testPlanTestPlanOperations } from "./test-plan-test-plan.generated.js";
import { testResultsTestResultsSchemas, testResultsTestResultsOperations } from "./test-results-test-results.generated.js";
import { tfvcTfvcSchemas, tfvcTfvcOperations } from "./tfvc-tfvc.generated.js";
import { wikiWikiSchemas, wikiWikiOperations } from "./wiki-wiki.generated.js";
import { witWorkItemTrackingSchemas, witWorkItemTrackingOperations } from "./wit-work-item-tracking.generated.js";
import { workWorkSchemas, workWorkOperations } from "./work-work.generated.js";

export const officialApiSpecificationCommit: string = "3785641890ef409f82134f5d2fcccb2b2631ab9c";

export const officialApiOperations: readonly OfficialApiOperationDefinition[] = [
  ...approvalsAndChecksPipelinePermissionsOperations,
  ...approvalsAndChecksPipelinesChecksOperations,
  ...approvalsAndChecksPipelinesapprovalOperations,
  ...artifactsFeedOperations,
  ...artifactsPackageTypesMavenOperations,
  ...artifactsPackageTypesNpmOperations,
  ...artifactsPackageTypesNuGetOperations,
  ...buildBuildOperations,
  ...coreCoreOperations,
  ...dashboardDashboardOperations,
  ...distributedTaskTaskOperations,
  ...distributedTaskTaskAgentOperations,
  ...extensionManagementExtensionManagementOperations,
  ...favoriteFavoriteOperations,
  ...gitGitOperations,
  ...hooksServiceHooksOperations,
  ...imsIdentitiesOperations,
  ...notificationNotificationOperations,
  ...operationsOperationsOperations,
  ...pipelinesPipelinesOperations,
  ...policyPolicyOperations,
  ...processadminWorkItemTrackingProcessTemplateOperations,
  ...processesWorkItemTrackingProcessOperations,
  ...releaseReleaseOperations,
  ...searchSearchOperations,
  ...securitySecurityOperations,
  ...securityRolesSecurityRolesOperations,
  ...serviceEndpointServiceEndpointOperations,
  ...testTestOperations,
  ...testPlanTestPlanOperations,
  ...testResultsTestResultsOperations,
  ...tfvcTfvcOperations,
  ...wikiWikiOperations,
  ...witWorkItemTrackingOperations,
  ...workWorkOperations,
];

export const officialApiSchemas: readonly OfficialApiSchemaDefinition[] = [
  ...approvalsAndChecksPipelinePermissionsSchemas,
  ...approvalsAndChecksPipelinesChecksSchemas,
  ...approvalsAndChecksPipelinesapprovalSchemas,
  ...artifactsFeedSchemas,
  ...artifactsPackageTypesMavenSchemas,
  ...artifactsPackageTypesNpmSchemas,
  ...artifactsPackageTypesNuGetSchemas,
  ...buildBuildSchemas,
  ...coreCoreSchemas,
  ...dashboardDashboardSchemas,
  ...distributedTaskTaskSchemas,
  ...distributedTaskTaskAgentSchemas,
  ...extensionManagementExtensionManagementSchemas,
  ...favoriteFavoriteSchemas,
  ...gitGitSchemas,
  ...hooksServiceHooksSchemas,
  ...imsIdentitiesSchemas,
  ...notificationNotificationSchemas,
  ...operationsOperationsSchemas,
  ...pipelinesPipelinesSchemas,
  ...policyPolicySchemas,
  ...processadminWorkItemTrackingProcessTemplateSchemas,
  ...processesWorkItemTrackingProcessSchemas,
  ...releaseReleaseSchemas,
  ...searchSearchSchemas,
  ...securitySecuritySchemas,
  ...securityRolesSecurityRolesSchemas,
  ...serviceEndpointServiceEndpointSchemas,
  ...testTestSchemas,
  ...testPlanTestPlanSchemas,
  ...testResultsTestResultsSchemas,
  ...tfvcTfvcSchemas,
  ...wikiWikiSchemas,
  ...witWorkItemTrackingSchemas,
  ...workWorkSchemas,
];
