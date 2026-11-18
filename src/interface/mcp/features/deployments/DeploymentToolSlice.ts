import type { McpServer } from "@modelcontextprotocol/server";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";
import {
  type DeploymentReadArguments,
  type DeploymentWriteArguments,
  deploymentReadSchema,
  deploymentWriteSchema,
} from "./DeploymentToolSchemas.js";

/**
 * Deployment environments, deployment groups, checks, approvals, and resource permissions.
 */
export class DeploymentToolSlice implements McpToolSlice {
  private static readonly PIPELINE_PERMISSIONS_API_VERSION: string = "7.1-preview.1";
  private static readonly UPDATE_2_CHECKS_API_VERSION: string = "7.2-preview.1";
  private static readonly UPDATE_2_APPROVALS_API_VERSION: string = "7.2-preview.2";

  private readonly readTool: CatalogRestToolSlice<DeploymentReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<DeploymentWriteArguments>;

  /**
   * Creates the deployment administration slice.
   *
   * @param executor - Guarded operation executor.
   * @param presenter - Safe MCP presenter.
   * @param scope - Route scope resolver.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    scope: RequestScope,
  ) {
    this.readTool = new CatalogRestToolSlice(executor, presenter, {
      name: "deployment",
      title: "Consultar recursos de despliegue",
      description:
        "Consulta environments, deployment groups/targets, permisos de pipeline sobre recursos protegidos, checks y approvals. Las acciones list proporcionan environment_id, group/target_id, check_id y approval_id para lecturas y cambios posteriores.",
      source: "Azure DevOps deployment",
      inputSchema: deploymentReadSchema,
      annotations: readOnlyAnnotations,
      operations: DeploymentToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "deployment_write",
      title: "Administrar recursos de despliegue",
      description:
        "Administra environments, deployment groups/targets, permisos de recursos, checks y approvals. Lee primero el recurso y conserva IDs/estado. Las eliminaciones requieren ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps deployment",
      inputSchema: deploymentWriteSchema,
      annotations: destructiveAnnotations,
      operations: DeploymentToolSlice.createWriteOperations(scope),
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<DeploymentReadArguments>[] {
    const environmentPath = (args: DeploymentReadArguments): string =>
      scope.project(
        args,
        `_apis/distributedtask/environments/${scope.requiredSegment(args.environment_id, "environment_id")}`,
      );
    const deploymentGroupPath = (args: DeploymentReadArguments): string =>
      scope.project(
        args,
        `_apis/distributedtask/deploymentgroups/${scope.requiredSegment(args.deployment_group_id, "deployment_group_id")}`,
      );
    return [
      new RestOperationDefinition("list_environments", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/distributedtask/environments"),
        query: { name: args.name, top: args.top, continuationToken: args.continuation_token },
      })),
      new RestOperationDefinition("get_environment", "read", (args) => ({
        method: "GET",
        path: environmentPath(args),
      })),
      new RestOperationDefinition("list_environment_deployments", "read", (args) => ({
        method: "GET",
        path: `${environmentPath(args)}/environmentdeploymentrecords`,
        query: { top: args.top, continuationToken: args.continuation_token },
      })),
      new RestOperationDefinition("list_deployment_groups", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/distributedtask/deploymentgroups"),
        query: { name: args.name, top: args.top, continuationToken: args.continuation_token },
      })),
      new RestOperationDefinition("get_deployment_group", "read", (args) => ({
        method: "GET",
        path: deploymentGroupPath(args),
      })),
      new RestOperationDefinition("list_deployment_targets", "read", (args) => ({
        method: "GET",
        path: `${deploymentGroupPath(args)}/targets`,
        query: { top: args.top, continuationToken: args.continuation_token },
      })),
      new RestOperationDefinition("get_deployment_target", "read", (args) => ({
        method: "GET",
        path: `${deploymentGroupPath(args)}/targets/${scope.requiredSegment(args.target_id, "target_id")}`,
      })),
      new RestOperationDefinition("get_pipeline_permissions", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/pipelinepermissions/${scope.requiredSegment(args.resource_type, "resource_type")}/${scope.requiredSegment(args.resource_id, "resource_id")}`,
        ),
        apiVersion: DeploymentToolSlice.PIPELINE_PERMISSIONS_API_VERSION,
      })),
      new RestOperationDefinition("list_check_configurations", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/pipelines/checks/configurations"),
        query: { resourceType: args.resource_type, resourceId: args.resource_id },
        apiVersion: DeploymentToolSlice.UPDATE_2_CHECKS_API_VERSION,
      })),
      new RestOperationDefinition("get_check_configuration", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/checks/configurations/${scope.requiredSegment(args.check_id, "check_id")}`,
        ),
        apiVersion: DeploymentToolSlice.UPDATE_2_CHECKS_API_VERSION,
      })),
      new RestOperationDefinition("get_check_evaluation", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/checks/runs/${scope.requiredSegment(args.check_suite_id, "check_suite_id")}`,
        ),
        query: { $expand: args.check_expand },
        apiVersion: DeploymentToolSlice.UPDATE_2_CHECKS_API_VERSION,
      })),
      new RestOperationDefinition("list_approvals", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/pipelines/approvals"),
        query: {
          approvalIds: args.approval_ids?.join(","),
          $expand: args.approval_expand,
          assignedTo: args.assigned_to?.join(","),
          state: args.approval_state,
          top: args.top,
        },
        apiVersion: DeploymentToolSlice.UPDATE_2_APPROVALS_API_VERSION,
      })),
      new RestOperationDefinition("get_approval", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/pipelines/approvals/${scope.requiredSegment(args.approval_id, "approval_id")}`,
        ),
        query: { $expand: args.approval_expand },
        apiVersion: DeploymentToolSlice.UPDATE_2_APPROVALS_API_VERSION,
      })),
    ];
  }

  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<DeploymentWriteArguments>[] {
    const environmentPath = (args: DeploymentWriteArguments): string =>
      scope.project(
        args,
        `_apis/distributedtask/environments/${scope.requiredSegment(args.environment_id, "environment_id")}`,
      );
    const deploymentGroupPath = (args: DeploymentWriteArguments): string =>
      scope.project(
        args,
        `_apis/distributedtask/deploymentgroups/${scope.requiredSegment(args.deployment_group_id, "deployment_group_id")}`,
      );
    return [
      new RestOperationDefinition("create_environment", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/distributedtask/environments"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_environment", "write", (args) => ({
        method: "PATCH",
        path: environmentPath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_environment", "destructive", (args) => ({
        method: "DELETE",
        path: environmentPath(args),
      })),
      new RestOperationDefinition("create_deployment_group", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/distributedtask/deploymentgroups"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_deployment_group", "write", (args) => ({
        method: "PATCH",
        path: deploymentGroupPath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_deployment_group", "destructive", (args) => ({
        method: "DELETE",
        path: deploymentGroupPath(args),
      })),
      new RestOperationDefinition("update_deployment_targets", "write", (args) => ({
        method: "PATCH",
        path: `${deploymentGroupPath(args)}/targets`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_deployment_target", "destructive", (args) => ({
        method: "DELETE",
        path: `${deploymentGroupPath(args)}/targets/${scope.requiredSegment(args.target_id, "target_id")}`,
      })),
      new RestOperationDefinition("update_pipeline_permissions", "write", (args) => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/pipelines/pipelinepermissions/${scope.requiredSegment(args.resource_type, "resource_type")}/${scope.requiredSegment(args.resource_id, "resource_id")}`,
        ),
        body: requireRequestBody(args.body),
        apiVersion: DeploymentToolSlice.PIPELINE_PERMISSIONS_API_VERSION,
      })),
      new RestOperationDefinition("update_pipeline_permissions_for_resources", "write", (args) => ({
        method: "PATCH",
        path: scope.project(args, "_apis/pipelines/pipelinepermissions"),
        body: requireRequestBody(args.body),
        apiVersion: DeploymentToolSlice.PIPELINE_PERMISSIONS_API_VERSION,
      })),
      new RestOperationDefinition("create_check_configuration", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/pipelines/checks/configurations"),
        body: requireRequestBody(args.body),
        apiVersion: DeploymentToolSlice.UPDATE_2_CHECKS_API_VERSION,
      })),
      new RestOperationDefinition("update_check_configuration", "write", (args) => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/pipelines/checks/configurations/${scope.requiredSegment(args.check_id, "check_id")}`,
        ),
        body: requireRequestBody(args.body),
        apiVersion: DeploymentToolSlice.UPDATE_2_CHECKS_API_VERSION,
      })),
      new RestOperationDefinition("delete_check_configuration", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/pipelines/checks/configurations/${scope.requiredSegment(args.check_id, "check_id")}`,
        ),
        apiVersion: DeploymentToolSlice.UPDATE_2_CHECKS_API_VERSION,
      })),
      new RestOperationDefinition("evaluate_checks", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/pipelines/checks/runs"),
        body: requireRequestBody(args.body),
        apiVersion: DeploymentToolSlice.UPDATE_2_CHECKS_API_VERSION,
      })),
      new RestOperationDefinition("update_check_evaluation", "write", (args) => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/pipelines/checks/runs/${scope.requiredSegment(args.check_suite_id, "check_suite_id")}`,
        ),
        body: {
          action: scope.requiredSegment(args.check_update_action, "check_update_action"),
          checkId: scope.requiredSegment(args.check_run_id, "check_run_id"),
        },
        apiVersion: DeploymentToolSlice.UPDATE_2_CHECKS_API_VERSION,
      })),
      new RestOperationDefinition("update_approvals", "write", (args) => ({
        method: "PATCH",
        path: scope.project(args, "_apis/pipelines/approvals"),
        body: requireRequestBody(args.body),
        apiVersion: DeploymentToolSlice.UPDATE_2_APPROVALS_API_VERSION,
      })),
    ];
  }
}
