import type {
  OfficialApiCatalog,
  OfficialApiOperationDefinition,
  OfficialApiSchemaDefinition,
  OfficialApiSearch,
} from "../ports/OfficialApiCatalog.js";

const DEFAULT_RESULT_LIMIT: number = 50;
const MAXIMUM_RESULT_LIMIT: number = 200;

/**
 * Immutable indexed catalog of generated on-premises REST operations.
 */
export class InMemoryOfficialApiCatalog implements OfficialApiCatalog {
  private readonly operations: readonly OfficialApiOperationDefinition[];
  private readonly operationsByKey: ReadonlyMap<string, OfficialApiOperationDefinition>;
  private readonly schemasByKey: ReadonlyMap<string, OfficialApiSchemaDefinition>;
  private readonly areas: readonly string[];
  private readonly specificationCount: number;

  /**
   * Builds and validates the catalog indexes.
   *
   * @param operations - Generated official operations.
   * @param schemas - Generated reusable schema definitions.
   */
  public constructor(
    operations: readonly OfficialApiOperationDefinition[],
    schemas: readonly OfficialApiSchemaDefinition[],
  ) {
    const operationsByKey = new Map<string, OfficialApiOperationDefinition>();
    for (const operation of operations) {
      if (operationsByKey.has(operation.key)) {
        throw new Error(`La clave de operación oficial '${operation.key}' está duplicada.`);
      }
      operationsByKey.set(operation.key, operation);
    }
    const schemasByKey = new Map<string, OfficialApiSchemaDefinition>();
    for (const schema of schemas) {
      const key: string = InMemoryOfficialApiCatalog.schemaKey(
        schema.area,
        schema.specification,
        schema.reference,
      );
      if (schemasByKey.has(key)) {
        throw new Error(`La definición oficial '${key}' está duplicada.`);
      }
      schemasByKey.set(key, schema);
    }
    this.operations = [...operations].sort((left, right): number =>
      left.key.localeCompare(right.key),
    );
    this.operationsByKey = operationsByKey;
    this.schemasByKey = schemasByKey;
    this.areas = [...new Set(this.operations.map((operation) => operation.area))].sort();
    this.specificationCount = new Set(
      this.operations.map((operation): string => `${operation.area}/${operation.specification}`),
    ).size;
  }

  /** @inheritdoc */
  public getSpecificationCount(): number {
    return this.specificationCount;
  }

  /** @inheritdoc */
  public getOperationCount(): number {
    return this.operations.length;
  }

  /** @inheritdoc */
  public getSchemaCount(): number {
    return this.schemasByKey.size;
  }

  /** @inheritdoc */
  public listAreas(): readonly string[] {
    return this.areas;
  }

  /** @inheritdoc */
  public get(key: string): OfficialApiOperationDefinition {
    const operation: OfficialApiOperationDefinition | undefined = this.operationsByKey.get(key);
    if (operation === undefined) {
      throw new Error(
        `La operación oficial de Azure DevOps Server '${key}' no existe. Busca primero en official_api_catalog.`,
      );
    }
    return operation;
  }

  /** @inheritdoc */
  public getSchemaBundle(
    operationKey: string,
    schemaReference: string | undefined,
    includeDependencies: boolean,
  ): readonly OfficialApiSchemaDefinition[] {
    const operation: OfficialApiOperationDefinition = this.get(operationKey);
    const roots: readonly string[] =
      schemaReference === undefined
        ? InMemoryOfficialApiCatalog.bodySchemaReferences(operation)
        : [schemaReference];
    if (roots.length === 0) {
      throw new Error(
        `La operación '${operationKey}' no declara un esquema de cuerpo reutilizable.`,
      );
    }

    const result: OfficialApiSchemaDefinition[] = [];
    const pending: string[] = [...roots].reverse();
    const visited = new Set<string>();
    while (pending.length > 0) {
      const reference: string | undefined = pending.pop();
      if (reference === undefined) {
        break;
      }
      if (visited.has(reference)) {
        continue;
      }
      visited.add(reference);
      const schema: OfficialApiSchemaDefinition = this.requireSchema(operation, reference);
      result.push(schema);
      if (includeDependencies) {
        const dependencies: readonly string[] = InMemoryOfficialApiCatalog.localReferences(
          schema.schema,
        );
        for (const dependency of [...dependencies].reverse()) {
          if (!visited.has(dependency)) {
            pending.push(dependency);
          }
        }
      }
    }
    return result;
  }

  /** @inheritdoc */
  public search(filters: OfficialApiSearch): readonly OfficialApiOperationDefinition[] {
    const normalizedText: string | undefined = filters.text?.trim().toLowerCase();
    const limit: number = Math.min(
      Math.max(filters.top ?? DEFAULT_RESULT_LIMIT, 1),
      MAXIMUM_RESULT_LIMIT,
    );
    return this.operations
      .filter((operation): boolean => {
        if (filters.area !== undefined && operation.area !== filters.area) {
          return false;
        }
        if (filters.method !== undefined && operation.method !== filters.method) {
          return false;
        }
        if (filters.access !== undefined && this.accessName(operation) !== filters.access) {
          return false;
        }
        if (normalizedText === undefined || normalizedText.length === 0) {
          return true;
        }
        const searchable: string = [
          operation.key,
          operation.operationId,
          operation.pathTemplate,
          operation.description,
          ...operation.tags,
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedText);
      })
      .slice(0, limit);
  }

  private accessName(operation: OfficialApiOperationDefinition): "full" | "read" | "write" {
    if (operation.risk === "read") {
      return "read";
    }
    return operation.risk === "write" ? "write" : "full";
  }

  private requireSchema(
    operation: OfficialApiOperationDefinition,
    reference: string,
  ): OfficialApiSchemaDefinition {
    if (!reference.startsWith("#/definitions/")) {
      throw new Error(
        `La referencia '${reference}' no pertenece a definitions del contrato oficial.`,
      );
    }
    const key: string = InMemoryOfficialApiCatalog.schemaKey(
      operation.area,
      operation.specification,
      reference,
    );
    const schema: OfficialApiSchemaDefinition | undefined = this.schemasByKey.get(key);
    if (schema === undefined) {
      throw new Error(
        `La referencia '${reference}' no existe en el contrato de '${operation.key}'.`,
      );
    }
    return schema;
  }

  private static bodySchemaReferences(
    operation: OfficialApiOperationDefinition,
  ): readonly string[] {
    const references = new Set<string>();
    for (const parameter of operation.parameters) {
      if (parameter.location !== "body") {
        continue;
      }
      if (parameter.schemaReference !== undefined) {
        references.add(parameter.schemaReference);
      }
      for (const reference of InMemoryOfficialApiCatalog.localReferences(parameter.schema)) {
        references.add(reference);
      }
    }
    return [...references];
  }

  private static localReferences(value: unknown): readonly string[] {
    const references = new Set<string>();
    const visit = (candidate: unknown): void => {
      if (Array.isArray(candidate)) {
        candidate.forEach(visit);
        return;
      }
      if (typeof candidate !== "object" || candidate === null) {
        return;
      }
      for (const [key, item] of Object.entries(candidate)) {
        if (key === "$ref" && typeof item === "string" && item.startsWith("#/definitions/")) {
          references.add(item);
        } else {
          visit(item);
        }
      }
    };
    visit(value);
    return [...references].sort();
  }

  private static schemaKey(area: string, specification: string, reference: string): string {
    return `${area}.${specification}.${reference}`;
  }
}
