import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * Standard annotations for internal read-only Azure DevOps tools.
 */
export const readOnlyAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/**
 * Standard annotations for Azure DevOps mutation tools containing no delete action.
 */
export const writeAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

/**
 * Standard annotations for Azure DevOps mutation tools containing delete actions.
 */
export const destructiveAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};
