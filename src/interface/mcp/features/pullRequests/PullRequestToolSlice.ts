import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { AzureDevOpsRequest } from "../../../../application/ports/AzureDevOpsGateway.js";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import {
  collectionProjectScopeSchema,
  requestBodySchema,
  skipSchema,
  topSchema,
} from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const pullRequestReadSchema = z.object({
  action: z
    .enum([
      "list",
      "get",
      "list_threads",
      "get_thread",
      "list_comments",
      "get_comment",
      "list_reviewers",
      "get_reviewer",
      "list_commits",
      "list_iterations",
      "get_iteration_changes",
    ])
    .describe(
      "Acción de lectura. list devuelve pull_request_id; list_threads devuelve thread_id; list_comments devuelve comment_id; list_iterations devuelve iteration_id; list_reviewers devuelve reviewer_id. Usa esos valores en las acciones get o en pull_request_write.",
    ),
  ...collectionProjectScopeSchema,
  repository: z.string().min(1).optional().describe("Nombre o ID obtenido con repository list."),
  pull_request_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID numérico positivo devuelto por pull_request list o pull_request_write create."),
  thread_id: z.number().int().positive().optional().describe("ID devuelto por list_threads."),
  comment_id: z.number().int().positive().optional().describe("ID devuelto por list_comments."),
  iteration_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_iterations; requerido para get_iteration_changes."),
  status: z
    .enum(["active", "abandoned", "completed", "all"])
    .optional()
    .describe(
      "Filtro de list: active, abandoned, completed o all; por defecto depende del servidor.",
    ),
  source_ref: z
    .string()
    .min(1)
    .optional()
    .describe("Ref completa de origen para list, por ejemplo refs/heads/feature/login."),
  target_ref: z
    .string()
    .min(1)
    .optional()
    .describe("Ref completa de destino para list, por ejemplo refs/heads/main."),
  creator_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID de identidad del creador; obtén identidades con official_ims."),
  reviewer_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID de identidad del revisor devuelto por list_reviewers u official_ims."),
  top: topSchema,
  skip: skipSchema,
});

const pullRequestWriteSchema = z.object({
  action: z
    .enum([
      "create",
      "update",
      "create_thread",
      "update_thread",
      "add_comment",
      "update_comment",
      "delete_comment",
      "add_reviewer",
      "update_reviewer",
      "remove_reviewer",
    ])
    .describe(
      "Acción de cambio. create devuelve pull_request_id; create_thread devuelve thread_id; add_comment devuelve comment_id; list_reviewers proporciona reviewer_id. update puede completar o abandonar. delete_comment y remove_reviewer requieren full.",
    ),
  ...collectionProjectScopeSchema,
  repository: z.string().min(1).optional().describe("Nombre o ID obtenido con repository list."),
  pull_request_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con pull_request list o create."),
  thread_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con list_threads/create_thread."),
  comment_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con list_comments/add_comment."),
  reviewer_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID de identidad obtenido con list_reviewers u official_ims."),
  body: requestBodySchema.optional(),
});

type PullRequestReadArguments = z.infer<typeof pullRequestReadSchema>;
type PullRequestWriteArguments = z.infer<typeof pullRequestWriteSchema>;

/**
 * Pull request vertical slice.
 */
export class PullRequestToolSlice implements McpToolSlice {
  /**
   * Read-only tool.
   */
  private readonly readTool: CatalogRestToolSlice<PullRequestReadArguments>;

  /**
   * Mutation tool.
   */
  private readonly writeTool: CatalogRestToolSlice<PullRequestWriteArguments>;

  /**
   * Creates the pull request slice.
   *
   * @param executor - Guarded executor.
   * @param presenter - Safe presenter.
   * @param scope - Route scope builder.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    scope: RequestScope,
  ) {
    this.readTool = new CatalogRestToolSlice(executor, presenter, {
      name: "pull_request",
      title: "Consultar pull requests",
      description:
        "Lista e inspecciona pull requests, hilos, comentarios, revisores, commits e iteraciones. Flujo: repository list → pull_request list → list_threads/list_reviewers/list_iterations; reutiliza los IDs devueltos en acciones get y en pull_request_write.",
      source: "Azure DevOps pull request",
      inputSchema: pullRequestReadSchema,
      annotations: readOnlyAnnotations,
      operations: PullRequestToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "pull_request_write",
      title: "Modificar pull requests",
      description:
        "Crea o actualiza pull requests, hilos, comentarios y revisores. Consulta primero el PR y sus hijos; usa refs completas e IDs reales. Quitar comentarios o revisores requiere ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps pull request",
      inputSchema: pullRequestWriteSchema,
      annotations: destructiveAnnotations,
      operations: PullRequestToolSlice.createWriteOperations(scope),
    });
  }

  /**
   * Registers pull request tools.
   *
   * @param server - MCP server.
   */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  /**
   * Builds read operations.
   *
   * @param scope - Route scope builder.
   * @returns Read operation catalog.
   */
  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<PullRequestReadArguments>[] {
    const repositoryPath = (args: PullRequestReadArguments): string =>
      scope.project(
        args,
        `_apis/git/repositories/${scope.requiredSegment(args.repository, "repository")}`,
      );
    const pullRequestPath = (args: PullRequestReadArguments): string =>
      `${repositoryPath(args)}/pullRequests/${scope.requiredSegment(args.pull_request_id, "pull_request_id")}`;
    return [
      new RestOperationDefinition("list", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${repositoryPath(args)}/pullRequests`,
        query: {
          "searchCriteria.status": args.status,
          "searchCriteria.sourceRefName": args.source_ref,
          "searchCriteria.targetRefName": args.target_ref,
          "searchCriteria.creatorId": args.creator_id,
          "searchCriteria.reviewerId": args.reviewer_id,
          $top: args.top,
          $skip: args.skip,
        },
      })),
      new RestOperationDefinition("get", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: pullRequestPath(args),
        query: { includeCommits: true, includeWorkItemRefs: true },
      })),
      new RestOperationDefinition("list_threads", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${pullRequestPath(args)}/threads`,
      })),
      new RestOperationDefinition("get_thread", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${pullRequestPath(args)}/threads/${scope.requiredSegment(args.thread_id, "thread_id")}`,
      })),
      new RestOperationDefinition("list_comments", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${pullRequestPath(args)}/threads/${scope.requiredSegment(args.thread_id, "thread_id")}/comments`,
      })),
      new RestOperationDefinition("get_comment", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${pullRequestPath(args)}/threads/${scope.requiredSegment(args.thread_id, "thread_id")}/comments/${scope.requiredSegment(args.comment_id, "comment_id")}`,
      })),
      new RestOperationDefinition("list_reviewers", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${pullRequestPath(args)}/reviewers`,
      })),
      new RestOperationDefinition("get_reviewer", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${pullRequestPath(args)}/reviewers/${scope.requiredSegment(args.reviewer_id, "reviewer_id")}`,
      })),
      new RestOperationDefinition("list_commits", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${pullRequestPath(args)}/commits`,
        query: { $top: args.top },
      })),
      new RestOperationDefinition("list_iterations", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${pullRequestPath(args)}/iterations`,
      })),
      new RestOperationDefinition("get_iteration_changes", "read", (args): AzureDevOpsRequest => ({
        method: "GET",
        path: `${pullRequestPath(args)}/iterations/${scope.requiredSegment(args.iteration_id, "iteration_id")}/changes`,
        query: { $top: args.top },
      })),
    ];
  }

  /**
   * Builds mutation operations.
   *
   * @param scope - Route scope builder.
   * @returns Mutation operation catalog.
   */
  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<PullRequestWriteArguments>[] {
    const repositoryPath = (args: PullRequestWriteArguments): string =>
      scope.project(
        args,
        `_apis/git/repositories/${scope.requiredSegment(args.repository, "repository")}`,
      );
    const pullRequestPath = (args: PullRequestWriteArguments): string =>
      `${repositoryPath(args)}/pullRequests/${scope.requiredSegment(args.pull_request_id, "pull_request_id")}`;
    return [
      new RestOperationDefinition("create", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: `${repositoryPath(args)}/pullRequests`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: pullRequestPath(args),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("create_thread", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: `${pullRequestPath(args)}/threads`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_thread", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: `${pullRequestPath(args)}/threads/${scope.requiredSegment(args.thread_id, "thread_id")}`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("add_comment", "write", (args): AzureDevOpsRequest => ({
        method: "POST",
        path: `${pullRequestPath(args)}/threads/${scope.requiredSegment(args.thread_id, "thread_id")}/comments`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_comment", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: `${pullRequestPath(args)}/threads/${scope.requiredSegment(args.thread_id, "thread_id")}/comments/${scope.requiredSegment(args.comment_id, "comment_id")}`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_comment", "destructive", (args): AzureDevOpsRequest => ({
        method: "DELETE",
        path: `${pullRequestPath(args)}/threads/${scope.requiredSegment(args.thread_id, "thread_id")}/comments/${scope.requiredSegment(args.comment_id, "comment_id")}`,
      })),
      new RestOperationDefinition("add_reviewer", "write", (args): AzureDevOpsRequest => ({
        method: "PUT",
        path: `${pullRequestPath(args)}/reviewers/${scope.requiredSegment(args.reviewer_id, "reviewer_id")}`,
        body: args.body ?? {},
      })),
      new RestOperationDefinition("update_reviewer", "write", (args): AzureDevOpsRequest => ({
        method: "PATCH",
        path: `${pullRequestPath(args)}/reviewers/${scope.requiredSegment(args.reviewer_id, "reviewer_id")}`,
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("remove_reviewer", "destructive", (args): AzureDevOpsRequest => ({
        method: "DELETE",
        path: `${pullRequestPath(args)}/reviewers/${scope.requiredSegment(args.reviewer_id, "reviewer_id")}`,
      })),
    ];
  }
}
