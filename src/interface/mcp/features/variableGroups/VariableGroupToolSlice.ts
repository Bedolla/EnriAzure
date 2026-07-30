import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AzureDevOpsResponse } from "../../../../application/ports/AzureDevOpsGateway.js";
import {
  type CreateVariableGroupCommand,
  type ExistingVariableGroupScope,
  type SetVariableCommand,
  type UpdateVariableGroupCommand,
  type VariableGroupVariableInput,
} from "../../../../application/services/VariableGroupContracts.js";
import { VariableGroupManager } from "../../../../application/services/VariableGroupManager.js";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { AbstractRestToolSlice } from "../../AbstractRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { collectionProjectScopeSchema } from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const variableSchema = z.object({
  value: z
    .string()
    .optional()
    .describe(
      "Valor inicial. Al crear una variable secreta debes proporcionarlo; nunca copies null/asteriscos de una lectura como si fueran el valor real.",
    ),
  is_secret: z
    .boolean()
    .optional()
    .describe(
      "true cifra el valor en Azure DevOps y hace que futuras lecturas devuelvan value=null.",
    ),
  is_read_only: z
    .boolean()
    .optional()
    .describe("true evita que scripts del pipeline sobrescriban la variable durante la ejecución."),
});

const variableGroupReadSchema = z.object({
  action: z
    .enum(["list", "get"])
    .describe(
      "list encuentra grupos y devuelve group_id; get devuelve un grupo completo. En variables secretas value=null significa valor protegido/no visible, no que el secreto almacenado esté vacío.",
    ),
  ...collectionProjectScopeSchema,
  group_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID numérico positivo devuelto por list o por create_group; requerido para get."),
  group_name: z
    .string()
    .min(1)
    .optional()
    .describe("Filtro por nombre exacto para list; omite para listar todos los grupos accesibles."),
  action_filter: z
    .enum(["none", "manage", "use"])
    .optional()
    .describe(
      "Filtro de permiso para list: none no filtra, manage exige administración, use exige uso en pipelines.",
    ),
});

const variableGroupWriteSchema = z.object({
  action: z
    .enum([
      "create_group",
      "update_group",
      "delete_group",
      "share_group",
      "set_variable",
      "delete_variable",
    ])
    .describe(
      "Acción de cambio. create_group devuelve group_id; update_group cambia sólo metadata y conserva variables; share_group agrega referencias de proyecto; set_variable crea/edita una sola variable y conserva hermanas/secretos; delete_variable elimina sólo una; delete_group desasocia/elimina y requiere full.",
    ),
  ...collectionProjectScopeSchema,
  group_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con variable_group list/get o create_group."),
  name: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre para create_group o nuevo nombre opcional para update_group."),
  description: z
    .string()
    .optional()
    .describe("Descripción para create_group/update_group; string vacío borra la descripción."),
  variables: z
    .record(z.string().min(1), variableSchema)
    .optional()
    .describe(
      "Mapa inicial nombre→{value,is_secret,is_read_only}, usado sólo por create_group. Para editar un grupo existente usa set_variable una por una; así no reemplazas hermanas ni secretos.",
    ),
  project_references: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .optional()
    .describe(
      "Referencias nativas requeridas sólo por share_group; cada elemento incluye projectReference con id/name obtenidos mediante project list.",
    ),
  variable_name: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre exacto de una variable; requerido para set_variable y delete_variable."),
  value: z
    .string()
    .optional()
    .describe(
      "Nuevo valor para set_variable. Omítelo para conservar el valor existente, incluso si la lectura mostró null por ser secreto. Es obligatorio al crear una variable nueva; enviar string vacío sí reemplaza por vacío.",
    ),
  is_secret: z
    .boolean()
    .optional()
    .describe(
      "Clasificación para set_variable. Omite para conservarla; true cifra/enmascara. Para cambiar de secreta a no secreta debes proporcionar value explícito.",
    ),
  is_read_only: z
    .boolean()
    .optional()
    .describe(
      "Inmutabilidad durante pipeline para set_variable; omite para conservar el valor actual.",
    ),
});

type VariableGroupReadArguments = z.infer<typeof variableGroupReadSchema>;
type VariableGroupWriteArguments = z.infer<typeof variableGroupWriteSchema>;

/**
 * Complete native Variable Group and individual variable vertical slice.
 */
export class VariableGroupToolSlice extends AbstractRestToolSlice implements McpToolSlice {
  private readonly manager: VariableGroupManager;

  /**
   * Creates the Variable Group slice.
   *
   * @param executor - Guarded operation executor.
   * @param presenter - Safe MCP presenter.
   * @param scope - Request scope resolver.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    scope: RequestScope,
  ) {
    super(executor, presenter);
    this.manager = new VariableGroupManager(executor, scope);
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    server.registerTool(
      "variable_group",
      {
        title: "Consultar Variable Groups y variables",
        description:
          "Lista o consulta Variable Groups nativos de Pipelines > Library. list proporciona group_id para get y variable_group_write. Los secretos siempre salen como value=null: es un marcador protegido, no el valor almacenado ni una instrucción para borrarlo.",
        inputSchema: variableGroupReadSchema,
        annotations: readOnlyAnnotations,
      },
      async (args: VariableGroupReadArguments): Promise<CallToolResult> => this.handleRead(args),
    );
    server.registerTool(
      "variable_group_write",
      {
        title: "Administrar Variable Groups y variables",
        description:
          "Crea, edita, comparte o elimina grupos nativos y cambia una variable individual sin reemplazar sus hermanas. La tool lee y fusiona el grupo completo; omitir value conserva un secreto existente aunque el servidor lo reporte null. Nunca devuelve secretos. Las eliminaciones requieren ENRIAZURE_WRITE_POLICY=full.",
        inputSchema: variableGroupWriteSchema,
        annotations: destructiveAnnotations,
      },
      async (args: VariableGroupWriteArguments): Promise<CallToolResult> => this.handleWrite(args),
    );
  }

  private async handleRead(args: VariableGroupReadArguments): Promise<CallToolResult> {
    try {
      const response =
        args.action === "list"
          ? await this.manager.list(args, args.group_name, args.action_filter)
          : await this.manager.get(this.existingScope(args));
      return this.presenter.success(response, "Azure DevOps Variable Group");
    } catch (error: unknown) {
      return this.presenter.error(error);
    }
  }

  private async handleWrite(args: VariableGroupWriteArguments): Promise<CallToolResult> {
    try {
      const response = await this.executeWriteAction(args);
      return this.presenter.success(response, "Azure DevOps Variable Group");
    } catch (error: unknown) {
      return this.presenter.error(error);
    }
  }

  private async executeWriteAction(
    args: VariableGroupWriteArguments,
  ): Promise<AzureDevOpsResponse> {
    switch (args.action) {
      case "create_group":
        return this.manager.create(this.createCommand(args));
      case "update_group":
        return this.manager.update(this.updateCommand(args));
      case "delete_group":
        return this.manager.delete(this.existingScope(args));
      case "share_group":
        return this.manager.share({
          ...this.existingScope(args),
          projectReferences: this.requireProjectReferences(args.project_references),
        });
      case "set_variable":
        return this.manager.setVariable(this.setVariableCommand(args));
      case "delete_variable":
        return this.manager.deleteVariable({
          ...this.existingScope(args),
          variableName: this.requireString(args.variable_name, "variable_name"),
        });
    }
  }

  private createCommand(args: VariableGroupWriteArguments): CreateVariableGroupCommand {
    return {
      collection: args.collection,
      project: args.project,
      name: this.requireString(args.name, "name"),
      description: args.description,
      variables: this.mapVariables(args.variables),
    };
  }

  private updateCommand(args: VariableGroupWriteArguments): UpdateVariableGroupCommand {
    if (args.name === undefined && args.description === undefined) {
      throw new Error("name o description es obligatorio para update_group.");
    }
    return {
      ...this.existingScope(args),
      name: args.name,
      description: args.description,
    };
  }

  private setVariableCommand(args: VariableGroupWriteArguments): SetVariableCommand {
    return {
      ...this.existingScope(args),
      variableName: this.requireString(args.variable_name, "variable_name"),
      value: args.value,
      isSecret: args.is_secret,
      isReadOnly: args.is_read_only,
    };
  }

  private existingScope(
    args: VariableGroupReadArguments | VariableGroupWriteArguments,
  ): ExistingVariableGroupScope {
    if (args.group_id === undefined) {
      throw new Error("group_id es obligatorio para esta acción.");
    }
    return {
      collection: args.collection,
      project: args.project,
      groupId: args.group_id,
    };
  }

  private mapVariables(
    variables:
      | Readonly<
          Record<
            string,
            {
              readonly value?: string | undefined;
              readonly is_secret?: boolean | undefined;
              readonly is_read_only?: boolean | undefined;
            }
          >
        >
      | undefined,
  ): Readonly<Record<string, VariableGroupVariableInput>> | undefined {
    if (variables === undefined) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(variables).map(([name, variable]): [string, VariableGroupVariableInput] => [
        name,
        {
          value: variable.value,
          isSecret: variable.is_secret,
          isReadOnly: variable.is_read_only,
        },
      ]),
    );
  }

  private requireProjectReferences(
    references: readonly Record<string, unknown>[] | undefined,
  ): readonly Record<string, unknown>[] {
    if (references === undefined || references.length === 0) {
      throw new Error("project_references es obligatorio para share_group.");
    }
    return references;
  }

  private requireString(value: string | undefined, name: string): string {
    if (value === undefined || value.trim().length === 0) {
      throw new Error(`${name} es obligatorio para esta acción.`);
    }
    return value;
  }
}
