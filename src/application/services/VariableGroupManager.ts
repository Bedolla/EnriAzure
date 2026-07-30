import type { AzureDevOpsResponse } from "../ports/AzureDevOpsGateway.js";
import type { OperationRisk } from "../../domain/configuration/WritePolicy.js";
import { RequestScope, type OptionalRequestScope } from "./RequestScope.js";
import { RestOperationExecutor } from "./RestOperationExecutor.js";
import type {
  CreateVariableGroupCommand,
  ExistingVariableGroupScope,
  SetVariableCommand,
  UpdateVariableGroupCommand,
  VariableGroupProjectIdentity,
} from "./VariableGroupContracts.js";
import { VariableGroupDocument } from "./VariableGroupDocument.js";

/**
 * Coordinates safe multi-request Variable Group mutations.
 *
 * @remarks
 * Azure DevOps exposes whole-group updates only. This service reads and merges
 * the current group so a one-variable action cannot silently remove siblings.
 */
export class VariableGroupManager {
  private readonly executor: RestOperationExecutor;
  private readonly scope: RequestScope;
  private readonly document: VariableGroupDocument;

  /**
   * Creates the Variable Group application service.
   *
   * @param executor - Policy-enforcing REST executor.
   * @param scope - Route scope resolver.
   */
  public constructor(executor: RestOperationExecutor, scope: RequestScope) {
    this.executor = executor;
    this.scope = scope;
    this.document = new VariableGroupDocument();
  }

  /**
   * Lists project Variable Groups with optional server-side filters.
   *
   * @param scope - Project scope.
   * @param groupName - Optional exact group name.
   * @param actionFilter - Optional permission action filter.
   * @returns Sanitized Azure DevOps response.
   */
  public async list(
    scope: OptionalRequestScope,
    groupName?: string,
    actionFilter?: string,
  ): Promise<AzureDevOpsResponse> {
    const response: AzureDevOpsResponse = await this.executor.execute("read", {
      method: "GET",
      path: this.scope.project(scope, "_apis/distributedtask/variablegroups"),
      query: { groupName, actionFilter },
    });
    return VariableGroupDocument.redactSecretValues(response);
  }

  /**
   * Gets one project Variable Group.
   *
   * @param scope - Existing group scope.
   * @returns Sanitized Azure DevOps response.
   */
  public async get(scope: ExistingVariableGroupScope): Promise<AzureDevOpsResponse> {
    return VariableGroupDocument.redactSecretValues(await this.loadGroup("read", scope));
  }

  /**
   * Creates one native Variable Group and attaches it to the selected project.
   *
   * @param command - Creation command.
   * @returns Sanitized created group.
   */
  public async create(command: CreateVariableGroupCommand): Promise<AzureDevOpsResponse> {
    const project: VariableGroupProjectIdentity = await this.resolveProject("write", command);
    const description: string = command.description ?? "";
    const body: Record<string, unknown> = {
      name: command.name,
      description,
      type: "Vsts",
      providerData: null,
      variables: VariableGroupDocument.serializeVariables(command.variables ?? {}),
      variableGroupProjectReferences: [
        {
          name: command.name,
          description,
          projectReference: project,
        },
      ],
    };
    return this.executeMutation(
      "write",
      {
        method: "POST",
        path: this.scope.collection(command, "_apis/distributedtask/variablegroups"),
        body,
      },
      VariableGroupDocument.containsSecret(command.variables),
    );
  }

  /**
   * Updates a group's name or description while preserving all variables.
   *
   * @param command - Metadata update command.
   * @returns Sanitized updated group.
   */
  public async update(command: UpdateVariableGroupCommand): Promise<AzureDevOpsResponse> {
    const current: Record<string, unknown> = await this.loadNativeGroup("write", command);
    const body: Record<string, unknown> = await this.buildUpdateBody(current, command);
    return this.putGroup("write", command, body, false);
  }

  /**
   * Creates or edits one variable without removing other group variables.
   *
   * @param command - Variable upsert command.
   * @returns Sanitized updated group.
   */
  public async setVariable(command: SetVariableCommand): Promise<AzureDevOpsResponse> {
    const current: Record<string, unknown> = await this.loadNativeGroup("write", command);
    const variables: Record<string, unknown> = this.document.readVariables(current);
    const existing: Record<string, unknown> | undefined = VariableGroupDocument.optionalRecord(
      variables[command.variableName],
    );

    if (existing === undefined && command.value === undefined) {
      throw new Error("value es obligatorio al crear una variable.");
    }

    const existingIsSecret: boolean = existing?.["isSecret"] === true;
    const isSecret: boolean = command.isSecret ?? existingIsSecret;
    if (existingIsSecret && !isSecret && command.value === undefined) {
      throw new Error("value es obligatorio al cambiar una variable secreta a no secreta.");
    }

    variables[command.variableName] = {
      ...(existing ?? {}),
      value: command.value ?? existing?.["value"] ?? null,
      isSecret,
      isReadOnly: command.isReadOnly ?? existing?.["isReadOnly"] === true,
    };
    const body: Record<string, unknown> = await this.buildUpdateBody(current, command, variables);
    return this.putGroup("write", command, body, isSecret && command.value !== undefined);
  }

  /**
   * Shares an existing Variable Group with one or more project references.
   *
   * @param command - Group identity and native project reference bodies.
   * @returns Successful Azure DevOps response.
   */
  public async share(
    command: ExistingVariableGroupScope & {
      readonly projectReferences: readonly Record<string, unknown>[];
    },
  ): Promise<AzureDevOpsResponse> {
    return this.executor.execute("write", {
      method: "PATCH",
      path: this.scope.collection(command, "_apis/distributedtask/variablegroups"),
      query: { variableGroupId: command.groupId },
      body: command.projectReferences,
    });
  }

  /**
   * Deletes one variable while preserving the rest of its group.
   *
   * @param command - Existing group scope plus variable name.
   * @returns Sanitized updated group.
   */
  public async deleteVariable(
    command: ExistingVariableGroupScope & { readonly variableName: string },
  ): Promise<AzureDevOpsResponse> {
    const current: Record<string, unknown> = await this.loadNativeGroup("destructive", command);
    const variables: Record<string, unknown> = this.document.readVariables(current);
    if (!Object.hasOwn(variables, command.variableName)) {
      throw new Error(`La variable '${command.variableName}' no existe en el grupo seleccionado.`);
    }
    const { [command.variableName]: removedVariable, ...remainingVariables } = variables;
    void removedVariable;
    const body: Record<string, unknown> = await this.buildUpdateBody(
      current,
      command,
      remainingVariables,
    );
    return this.putGroup("destructive", command, body, false);
  }

  /**
   * Deletes a Variable Group association from the selected project.
   *
   * @param command - Existing group scope.
   * @returns Empty successful Azure DevOps response.
   */
  public async delete(command: ExistingVariableGroupScope): Promise<AzureDevOpsResponse> {
    const project: VariableGroupProjectIdentity = await this.resolveProject("destructive", command);
    return this.executor.execute("destructive", {
      method: "DELETE",
      path: this.scope.collection(
        command,
        `_apis/distributedtask/variablegroups/${this.scope.requiredSegment(command.groupId, "group_id")}`,
      ),
      query: { projectIds: project.id },
    });
  }

  private async loadGroup(
    risk: OperationRisk,
    scope: ExistingVariableGroupScope,
  ): Promise<AzureDevOpsResponse> {
    return this.executor.execute(risk, {
      method: "GET",
      path: this.scope.project(
        scope,
        `_apis/distributedtask/variablegroups/${this.scope.requiredSegment(scope.groupId, "group_id")}`,
      ),
    });
  }

  private async loadNativeGroup(
    risk: OperationRisk,
    scope: ExistingVariableGroupScope,
  ): Promise<Record<string, unknown>> {
    const response: AzureDevOpsResponse = await this.loadGroup(risk, scope);
    const group: Record<string, unknown> = VariableGroupDocument.requireRecord(
      response.data,
      "Variable Group response",
    );
    if (group["type"] !== undefined && group["type"] !== "Vsts") {
      throw new Error("Esta acción sólo puede modificar Variable Groups nativos de tipo Vsts.");
    }
    return group;
  }

  private async buildUpdateBody(
    current: Record<string, unknown>,
    scope: OptionalRequestScope,
    variables: Record<string, unknown> = this.document.readVariables(current),
  ): Promise<Record<string, unknown>> {
    const nameOverride: unknown = "name" in scope ? scope["name"] : undefined;
    const descriptionOverride: unknown = "description" in scope ? scope["description"] : undefined;
    const name: string = VariableGroupDocument.requireString(
      nameOverride ?? current["name"],
      "Variable Group name",
    );
    const description: string =
      typeof descriptionOverride === "string"
        ? descriptionOverride
        : typeof current["description"] === "string"
          ? current["description"]
          : "";
    const references: unknown[] = Array.isArray(current["variableGroupProjectReferences"])
      ? current["variableGroupProjectReferences"].map((reference: unknown): unknown =>
          VariableGroupDocument.optionalRecord(reference) === undefined
            ? reference
            : {
                ...VariableGroupDocument.optionalRecord(reference),
                name,
                description,
              },
        )
      : [
          {
            name,
            description,
            projectReference: await this.resolveProject("write", scope),
          },
        ];
    return {
      name,
      description,
      type: "Vsts",
      providerData: null,
      variables,
      variableGroupProjectReferences: references,
    };
  }

  private async putGroup(
    risk: OperationRisk,
    scope: ExistingVariableGroupScope,
    body: Record<string, unknown>,
    containsSecret: boolean,
  ): Promise<AzureDevOpsResponse> {
    return this.executeMutation(
      risk,
      {
        method: "PUT",
        path: this.scope.collection(
          scope,
          `_apis/distributedtask/variablegroups/${this.scope.requiredSegment(scope.groupId, "group_id")}`,
        ),
        body,
      },
      containsSecret,
    );
  }

  private async resolveProject(
    risk: OperationRisk,
    scope: OptionalRequestScope,
  ): Promise<VariableGroupProjectIdentity> {
    const response: AzureDevOpsResponse = await this.executor.execute(risk, {
      method: "GET",
      path: this.scope.collection(
        scope,
        `_apis/projects/${this.scope.projectSegment(scope.project)}`,
      ),
    });
    const project: Record<string, unknown> = VariableGroupDocument.requireRecord(
      response.data,
      "Project response",
    );
    return {
      id: VariableGroupDocument.requireString(project["id"], "Project id"),
      name: VariableGroupDocument.requireString(project["name"], "Project name"),
    };
  }

  private async executeMutation(
    risk: OperationRisk,
    request: Parameters<RestOperationExecutor["execute"]>[1],
    containsSecret: boolean,
  ): Promise<AzureDevOpsResponse> {
    try {
      const response: AzureDevOpsResponse = await this.executor.execute(risk, request);
      return VariableGroupDocument.redactSecretValues(response);
    } catch (error: unknown) {
      if (containsSecret) {
        throw new Error(
          "Azure DevOps rechazó la operación del Variable Group; se ocultaron los detalles que podrían contener secretos.",
          { cause: error },
        );
      }
      throw error;
    }
  }
}
