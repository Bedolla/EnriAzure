import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type {
  OfficialApiCatalog,
  OfficialApiOperationDefinition,
  OfficialApiOperationExecutor,
} from "../../../../application/ports/OfficialApiCatalog.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import {
  destructiveAnnotations,
  readOnlyAnnotations,
  writeAnnotations,
} from "../../ToolAnnotationsCatalog.js";
import {
  mapOfficialApiExecutionInput,
  type OfficialApiExecutionArguments,
  officialApiExecutionSchema,
} from "./OfficialApiToolSlice.js";

/**
 * Produces a stable MCP tool name for an official specification area.
 *
 * @param area - Official camel-case area name.
 * @returns Lower-snake-case MCP name.
 */
export function officialAreaToolName(area: string): string {
  return `official_${area
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/gu, "_")
    .toLowerCase()}`;
}

/**
 * Registers one read tool and, when applicable, one mutation tool for a single
 * official Azure DevOps Server specification area.
 */
export class OfficialAreaToolSlice implements McpToolSlice {
  private readonly area: string;
  private readonly catalog: OfficialApiCatalog;
  private readonly operationExecutor: OfficialApiOperationExecutor;
  private readonly presenter: McpResultPresenter;

  /**
   * Creates an area-specific operation slice.
   *
   * @param area - Exact official area name.
   * @param catalog - Generated operation catalog.
   * @param operationExecutor - Policy-enforcing operation executor.
   * @param presenter - Safe response presenter.
   */
  public constructor(
    area: string,
    catalog: OfficialApiCatalog,
    operationExecutor: OfficialApiOperationExecutor,
    presenter: McpResultPresenter,
  ) {
    this.area = area;
    this.catalog = catalog;
    this.operationExecutor = operationExecutor;
    this.presenter = presenter;
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    const reads: readonly OfficialApiOperationDefinition[] = this.catalog.search({
      area: this.area,
      access: "read",
      top: 200,
    });
    const writes: readonly OfficialApiOperationDefinition[] = [
      ...this.catalog.search({ area: this.area, access: "write", top: 200 }),
      ...this.catalog.search({ area: this.area, access: "full", top: 200 }),
    ].sort((left, right): number => left.key.localeCompare(right.key));
    const baseName: string = officialAreaToolName(this.area);

    if (reads.length > 0) {
      const readKeys = reads.map((operation): string => operation.key);
      server.registerTool(
        baseName,
        {
          title: `Consultar APIs oficiales del área ${this.area}`,
          description: `Ejecuta lecturas documentadas del área técnica ${this.area} de Azure DevOps Server 2022. Secuencia obligatoria cuando no conozcas el contrato: official_api_catalog search con area=${this.area} → get con la operation elegida → get_schema si declara body → esta tool. Reutiliza IDs, nombres, tokens de continuación y ETags devueltos por lecturas; no los inventes.`,
          inputSchema: officialApiExecutionSchema.extend({
            operation: OfficialAreaToolSlice.operationEnum(readKeys).describe(
              `Clave exacta de una operación oficial de lectura del área ${this.area}. Obtén la clave y sus parámetros con official_api_catalog; el enum contiene todos los valores válidos.`,
            ),
          }),
          annotations: readOnlyAnnotations,
        },
        async (args: OfficialApiExecutionArguments): Promise<CallToolResult> =>
          this.execute(args, "read"),
      );
    }

    if (writes.length > 0) {
      const writeKeys = writes.map((operation): string => operation.key);
      const includesDelete: boolean = writes.some(
        (operation): boolean => operation.risk === "destructive",
      );
      server.registerTool(
        `${baseName}_write`,
        {
          title: `Modificar recursos oficiales del área ${this.area}`,
          description: includesDelete
            ? `Ejecuta creaciones, ediciones, transiciones y eliminaciones documentadas del área técnica ${this.area}. Antes: official_api_catalog search/get/get_schema, después una lectura del recurso objetivo; usa los IDs y ETags obtenidos. Crear o editar requiere write/full; las operaciones de eliminación o retiro requieren ENRIAZURE_WRITE_POLICY=full.`
            : `Ejecuta creaciones, ediciones o transiciones documentadas —sin DELETE— del área técnica ${this.area}. Antes: official_api_catalog search/get/get_schema y una lectura del recurso objetivo; usa los IDs y ETags obtenidos. Requiere ENRIAZURE_WRITE_POLICY=write o full.`,
          inputSchema: officialApiExecutionSchema.extend({
            operation: OfficialAreaToolSlice.operationEnum(writeKeys).describe(
              `Clave exacta de una operación oficial que modifica el área ${this.area}. Obtén la clave, nivel de acceso, parámetros y esquema con official_api_catalog; el enum contiene todos los valores válidos.`,
            ),
          }),
          annotations: includesDelete ? destructiveAnnotations : writeAnnotations,
        },
        async (args: OfficialApiExecutionArguments): Promise<CallToolResult> =>
          this.execute(args, "write"),
      );
    }
  }

  private async execute(
    args: OfficialApiExecutionArguments,
    expected: "read" | "write",
  ): Promise<CallToolResult> {
    try {
      const operation: OfficialApiOperationDefinition = this.catalog.get(args.operation);
      if (operation.area !== this.area) {
        throw new Error(
          `La operación '${operation.key}' pertenece al área '${operation.area}', no a '${this.area}'.`,
        );
      }
      const actual: "read" | "write" = operation.risk === "read" ? "read" : "write";
      if (actual !== expected) {
        throw new Error(
          `La operación '${operation.key}' debe usar la tool correspondiente a su área y nivel de acceso.`,
        );
      }
      const response = await this.operationExecutor.execute(mapOfficialApiExecutionInput(args));
      return this.presenter.success(response, `official ${this.area} API`);
    } catch (error: unknown) {
      return this.presenter.error(error);
    }
  }

  private static operationEnum(values: readonly string[]): z.ZodEnum<Record<string, string>> {
    const first: string | undefined = values[0];
    if (first === undefined) {
      throw new Error("Una tool de área oficial requiere por lo menos una operación.");
    }
    return z.enum([first, ...values.slice(1)]);
  }
}
