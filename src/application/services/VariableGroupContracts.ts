import type { OptionalRequestScope } from "./RequestScope.js";

/**
 * One native Azure DevOps variable value supplied by a caller.
 */
export interface VariableGroupVariableInput {
  /**
   * Variable value. Omit it while editing to preserve an existing value.
   */
  readonly value?: string | undefined;

  /**
   * Whether Azure DevOps must encrypt the value at rest.
   */
  readonly isSecret?: boolean | undefined;

  /**
   * Whether pipeline scripts may overwrite the variable at runtime.
   */
  readonly isReadOnly?: boolean | undefined;
}

/**
 * Common identity for an existing Variable Group.
 */
export interface ExistingVariableGroupScope extends OptionalRequestScope {
  /**
   * Numeric Variable Group identifier.
   */
  readonly groupId: number;
}

/**
 * Creates a native Variable Group attached to one project.
 */
export interface CreateVariableGroupCommand extends OptionalRequestScope {
  /**
   * New group name.
   */
  readonly name: string;

  /**
   * Optional group description.
   */
  readonly description?: string | undefined;

  /**
   * Initial variables keyed by their Azure DevOps names.
   */
  readonly variables?: Readonly<Record<string, VariableGroupVariableInput>> | undefined;
}

/**
 * Updates Variable Group metadata without replacing its variables.
 */
export interface UpdateVariableGroupCommand extends ExistingVariableGroupScope {
  /**
   * Optional replacement name.
   */
  readonly name?: string | undefined;

  /**
   * Optional replacement description.
   */
  readonly description?: string | undefined;
}

/**
 * Creates or updates one variable while preserving the rest of the group.
 */
export interface SetVariableCommand extends ExistingVariableGroupScope {
  /**
   * Variable name.
   */
  readonly variableName: string;

  /**
   * New value. Omit only to preserve an existing variable value.
   */
  readonly value?: string | undefined;

  /**
   * Optional secret classification.
   */
  readonly isSecret?: boolean | undefined;

  /**
   * Optional pipeline runtime immutability.
   */
  readonly isReadOnly?: boolean | undefined;
}

/**
 * Stable project identity required by collection-level Variable Group APIs.
 */
export interface VariableGroupProjectIdentity {
  /**
   * Project UUID.
   */
  readonly id: string;

  /**
   * Project name.
   */
  readonly name: string;
}
