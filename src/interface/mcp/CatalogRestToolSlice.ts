import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodType } from "zod";
import type { AzureDevOpsRequest } from "../../application/ports/AzureDevOpsGateway.js";
import { RestOperationExecutor } from "../../application/services/RestOperationExecutor.js";
import type { OperationRisk } from "../../domain/configuration/WritePolicy.js";
import { AbstractRestToolSlice } from "./AbstractRestToolSlice.js";
import type { McpToolSlice } from "./McpToolSlice.js";
import { McpResultPresenter } from "./McpResultPresenter.js";

/**
 * Minimum contract required by a catalog-driven tool.
 */
export interface ActionArguments {
  /**
   * Action name.
   */
  readonly action: string;
}

/**
 * Builds one explicit Azure DevOps REST operation.
 */
export class RestOperationDefinition<TArguments extends ActionArguments> {
  /**
   * Public action name.
   */
  public readonly action: TArguments["action"];

  /**
   * Operation mutation risk.
   */
  public readonly risk: OperationRisk;

  /**
   * Request builder.
   */
  private readonly builder: (args: TArguments) => AzureDevOpsRequest;

  /**
   * Creates an operation definition.
   *
   * @param action - Public action name.
   * @param risk - Mutation risk.
   * @param builder - Explicit request builder.
   */
  public constructor(
    action: TArguments["action"],
    risk: OperationRisk,
    builder: (args: TArguments) => AzureDevOpsRequest,
  ) {
    this.action = action;
    this.risk = risk;
    this.builder = builder;
  }

  /**
   * Builds the operation request.
   *
   * @param args - Validated tool arguments.
   * @returns Transport-independent request.
   */
  public build(args: TArguments): AzureDevOpsRequest {
    return this.builder(args);
  }
}

/**
 * Registration metadata for a catalog-driven tool.
 */
export interface CatalogRestToolOptions<TArguments extends ActionArguments> {
  /**
   * MCP tool name.
   */
  readonly name: string;

  /**
   * Human-readable title.
   */
  readonly title: string;

  /**
   * Complete tool description.
   */
  readonly description: string;

  /**
   * Untrusted-content source label.
   */
  readonly source: string;

  /**
   * Validated input schema.
   */
  readonly inputSchema: ZodType<TArguments>;

  /**
   * Honest MCP annotations.
   */
  readonly annotations: ToolAnnotations;

  /**
   * Explicit supported operations.
   */
  readonly operations: readonly RestOperationDefinition<TArguments>[];
}

/**
 * Registers and dispatches one explicit catalog of related REST operations.
 */
export class CatalogRestToolSlice<TArguments extends ActionArguments>
  extends AbstractRestToolSlice
  implements McpToolSlice
{
  /**
   * Registration and operation catalog.
   */
  private readonly options: CatalogRestToolOptions<TArguments>;

  /**
   * Creates a catalog-driven tool slice.
   *
   * @param executor - Guarded operation executor.
   * @param presenter - Safe MCP result presenter.
   * @param options - Registration and operation catalog.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    options: CatalogRestToolOptions<TArguments>,
  ) {
    super(executor, presenter);
    this.options = options;
  }

  /**
   * Registers the catalog tool.
   *
   * @param server - MCP server.
   */
  public register(server: McpServer): void {
    server.registerTool(
      this.options.name,
      {
        title: this.options.title,
        description: this.options.description,
        inputSchema: this.options.inputSchema,
        annotations: this.options.annotations,
      },
      async (args: TArguments): Promise<CallToolResult> => this.handle(args),
    );
  }

  /**
   * Resolves and executes a catalog action.
   *
   * @param args - Validated tool arguments.
   * @returns MCP result.
   */
  private async handle(args: TArguments): Promise<CallToolResult> {
    const operation: RestOperationDefinition<TArguments> | undefined = this.options.operations.find(
      (candidate: RestOperationDefinition<TArguments>): boolean => candidate.action === args.action,
    );
    if (operation === undefined) {
      return {
        content: [{ type: "text", text: `La acción '${args.action}' no está soportada.` }],
        isError: true,
      };
    }

    return this.execute(operation.risk, operation.build(args), this.options.source);
  }
}
