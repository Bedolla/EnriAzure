import { describe, expect, it } from "vitest";
import type {
  AzureDevOpsGateway,
  AzureDevOpsRequest,
  AzureDevOpsResponse,
} from "../../src/application/ports/AzureDevOpsGateway.js";
import type {
  OfficialApiExecutionInput,
  OfficialApiParameterDefinition,
  OfficialApiScalar,
} from "../../src/application/ports/OfficialApiCatalog.js";
import { InMemoryOfficialApiCatalog } from "../../src/application/services/InMemoryOfficialApiCatalog.js";
import { OfficialApiRequestBuilder } from "../../src/application/services/OfficialApiRequestBuilder.js";
import { OfficialApiService } from "../../src/application/services/OfficialApiService.js";
import { RequestScope } from "../../src/application/services/RequestScope.js";
import { RestOperationExecutor } from "../../src/application/services/RestOperationExecutor.js";
import { WritePolicy } from "../../src/domain/configuration/WritePolicy.js";
import {
  officialApiOperations,
  officialApiSchemas,
  officialApiSpecificationCommit,
} from "../../src/infrastructure/officialApi/catalog/index.generated.js";

class RecordingGateway implements AzureDevOpsGateway {
  public readonly requests: AzureDevOpsRequest[] = [];

  /** @inheritdoc */
  public send(request: AzureDevOpsRequest): Promise<AzureDevOpsResponse> {
    this.requests.push(request);
    return Promise.resolve({
      statusCode: 200,
      data: {},
      contentType: "application/json",
      headers: {},
    });
  }
}

function createCatalog(): InMemoryOfficialApiCatalog {
  return new InMemoryOfficialApiCatalog(officialApiOperations, officialApiSchemas);
}

function createBuilder(): OfficialApiRequestBuilder {
  return new OfficialApiRequestBuilder(
    createCatalog(),
    new RequestScope({ collection: "Collection", project: "Project" }),
  );
}

function representativeValue(
  parameter: OfficialApiParameterDefinition,
): OfficialApiScalar | readonly OfficialApiScalar[] {
  const allowed: OfficialApiScalar | undefined = parameter.allowedValues?.[0];
  if (allowed !== undefined) {
    return allowed;
  }
  if (parameter.format === "uuid") {
    return "00000000-0000-4000-8000-000000000001";
  }
  if (parameter.format === "date-time") {
    return "2026-07-29T00:00:00Z";
  }
  switch (parameter.type) {
    case "array":
      return ["value"];
    case "boolean":
      return true;
    case "integer":
      return 1;
    default:
      return "value";
  }
}

function isScalarArray(
  value: OfficialApiScalar | readonly OfficialApiScalar[],
): value is readonly OfficialApiScalar[] {
  return Array.isArray(value);
}

describe("official Azure DevOps Server operation catalog", (): void => {
  it("contains every operation from all 35 on-premises specifications", (): void => {
    expect(officialApiSpecificationCommit).toBe("3785641890ef409f82134f5d2fcccb2b2631ab9c");
    expect(officialApiOperations).toHaveLength(889);
    expect(new Set(officialApiOperations.map((operation) => operation.key)).size).toBe(889);
    expect(createCatalog().listAreas()).toHaveLength(30);

    for (const operation of officialApiOperations) {
      expect(operation.apiVersion).toMatch(/^7\.1(?:-preview\.[1-4])?$/);
      expect(operation.pathTemplate).toMatch(/^\/\{collection\}\//);
      expect(operation.key).toContain(operation.operationId);
      if (operation.method === "GET" || operation.method === "HEAD") {
        expect(operation.risk).toBe("read");
      } else if (operation.method === "DELETE") {
        expect(operation.risk).toBe("destructive");
      } else if (operation.risk === "read") {
        expect(operation.method).toBe("POST");
      } else {
        expect(operation.risk).toBe("write");
      }
    }
  });

  it("searches exact official operation metadata without exposing internal risk jargon", (): void => {
    const catalog = createCatalog();
    const matches = catalog.search({
      area: "security",
      method: "DELETE",
      access: "full",
      text: "access control entries",
    });

    expect(matches.map((operation) => operation.operationId)).toContain(
      "Access Control Entries_Remove Access Control Entries",
    );
  });

  it("builds a team-scoped dashboard request with its exact preview version", (): void => {
    const request = createBuilder().build({
      operation: "dashboard.dashboard.Dashboards_Create",
      team: "Delivery Team",
      body: { name: "Deployment" },
    });

    expect(request).toMatchObject({
      method: "POST",
      path: "/Collection/Project/Delivery%20Team/_apis/dashboard/dashboards",
      apiVersion: "7.1-preview.3",
      contentType: "application/json",
      body: { name: "Deployment" },
    });
  });

  it("supports explicitly omitting optional project or collection scopes despite defaults", (): void => {
    const builder = createBuilder();
    const collectionFeed = builder.build({
      operation: "artifacts.feed.Artifact  Details_Get Packages",
      scopeLevel: "collection",
      pathParameters: { feedId: "feed" },
    });
    const instanceIdentities = builder.build({
      operation: "ims.identities.Identities_Read Identities",
      scopeLevel: "instance",
      queryParameters: { searchFilter: "General", filterValue: "Fer" },
    });

    expect(collectionFeed.path).toBe("/Collection/_apis/packaging/Feeds/feed/packages");
    expect(instanceIdentities.path).toBe("/_apis/identities");
    expect((): AzureDevOpsRequest =>
      builder.build({
        operation: "dashboard.dashboard.Dashboards_Create",
        scopeLevel: "collection",
        body: { name: "Invalid scope" },
      }),
    ).toThrow("requiere alcance de proyecto");
  });

  it("maps official concurrency and chunk-upload headers safely", (): void => {
    const builder = createBuilder();
    const wikiRequest = builder.build({
      operation: "wiki.wiki.Pages_Update",
      pathParameters: { wikiIdentifier: "Project.wiki", id: 42 },
      headers: { Version: '"7"' },
      body: { content: "# Updated" },
    });
    const attachmentRequest = builder.build({
      operation: "wit.work-item-tracking.Attachments_Upload Chunk",
      pathParameters: { id: "00000000-0000-0000-0000-000000000001" },
      headers: { contentRangeHeader: "bytes 0-2/3" },
      bodyBase64: Buffer.from("abc").toString("base64"),
    });

    expect(wikiRequest.ifMatch).toBe('"7"');
    expect(attachmentRequest).toMatchObject({
      method: "PUT",
      headers: { "Content-Range": "bytes 0-2/3" },
      contentType: "application/octet-stream",
    });
    expect(attachmentRequest.body).toEqual(Uint8Array.from(Buffer.from("abc")));
  });

  it("rejects parameters absent from the selected official contract", (): void => {
    expect((): AzureDevOpsRequest =>
      createBuilder().build({
        operation: "dashboard.dashboard.Dashboards_Create",
        body: { name: "Deployment" },
        queryParameters: { invented: true },
      }),
    ).toThrow("no documenta parámetro de consulta 'invented'");
  });

  it("rejects malformed binary payloads instead of silently corrupting them", (): void => {
    expect((): AzureDevOpsRequest =>
      createBuilder().build({
        operation: "wit.work-item-tracking.Attachments_Upload Chunk",
        pathParameters: { id: "00000000-0000-0000-0000-000000000001" },
        headers: { contentRangeHeader: "bytes 0-2/3" },
        bodyBase64: "not-base64",
      }),
    ).toThrow("body_base64 debe contener base64 válido");
  });

  it("exposes every reusable body schema, including inline array dependencies", (): void => {
    const catalog = createCatalog();
    expect(catalog.getSchemaCount()).toBe(2_198);

    const pushSchemas = catalog.getSchemaBundle("git.git.Pushes_Create", undefined, true);
    expect(pushSchemas[0]?.reference).toBe("#/definitions/GitPush");
    expect(pushSchemas.length).toBeGreaterThan(5);
    expect(new Set(pushSchemas.map((schema) => schema.reference)).size).toBe(pushSchemas.length);

    const inlineArraySchemas = catalog.getSchemaBundle(
      "build.build.Builds_Update Builds",
      undefined,
      false,
    );
    expect(inlineArraySchemas.map((schema) => schema.reference)).toEqual(["#/definitions/Build"]);
  });

  it("enforces the full policy before an official delete reaches the gateway", async (): Promise<void> => {
    const gateway = new RecordingGateway();
    const catalog = createCatalog();
    const service = new OfficialApiService(
      catalog,
      new OfficialApiRequestBuilder(
        catalog,
        new RequestScope({ collection: "Collection", project: "Project" }),
      ),
      new RestOperationExecutor(gateway, new WritePolicy("write")),
    );

    await expect(
      service.execute({
        operation: "security.security.Access Control Entries_Remove Access Control Entries",
        pathParameters: {
          securityNamespaceId: "00000000-0000-0000-0000-000000000002",
        },
        queryParameters: { token: "project-token", descriptors: "identity-descriptor" },
      }),
    ).rejects.toThrow("ENRIAZURE_WRITE_POLICY=full");
    expect(gateway.requests).toHaveLength(0);
  });

  it("keeps every non-scope route placeholder represented by catalog metadata", (): void => {
    for (const operation of officialApiOperations) {
      const documentedNames: ReadonlySet<string> = new Set(
        operation.parameters
          .filter((parameter) => parameter.location === "path")
          .map((parameter) => parameter.name.toLowerCase()),
      );
      const placeholders: readonly string[] = [
        ...operation.pathTemplate.matchAll(/\{([^}]+)\}/gu),
      ].map((match): string => match[1] ?? "");
      expect(
        placeholders.every((placeholder): boolean =>
          documentedNames.has(placeholder.toLowerCase()),
        ),
        operation.key,
      ).toBe(true);
    }
  });

  it("can build a constrained representative request for all 889 operations", (): void => {
    const builder = createBuilder();
    for (const operation of officialApiOperations) {
      const scopeParameterNames: readonly string[] = operation.pathTemplate.startsWith(
        "/{collection}/{project}/{team}/",
      )
        ? ["collection", "project", "team"]
        : operation.pathTemplate.startsWith("/{collection}/{project}/")
          ? ["collection", "project"]
          : ["collection"];
      const pathParameters: Record<string, OfficialApiScalar> = {};
      const queryParameters: Record<string, OfficialApiScalar | readonly OfficialApiScalar[]> = {};
      const headers: Record<string, string> = {};
      let requiredBody: OfficialApiParameterDefinition | undefined;

      for (const parameter of operation.parameters) {
        if (parameter.location === "path") {
          if (!scopeParameterNames.includes(parameter.name)) {
            const value = representativeValue(parameter);
            pathParameters[parameter.name] =
              parameter.skipUrlEncoding === true
                ? "root/child"
                : isScalarArray(value)
                  ? "value"
                  : value;
          }
        } else if (parameter.location === "query" && parameter.required) {
          queryParameters[parameter.name] = representativeValue(parameter);
        } else if (parameter.location === "header" && parameter.required) {
          headers[parameter.name] = parameter.name === "contentRangeHeader" ? "bytes 0-0/1" : '"1"';
        } else if (parameter.location === "body" && parameter.required) {
          requiredBody = parameter;
        }
      }

      const input: OfficialApiExecutionInput = {
        operation: operation.key,
        team: "Team",
        pathParameters,
        queryParameters,
        headers,
        ...(requiredBody === undefined
          ? {}
          : operation.consumes.includes("application/octet-stream")
            ? { bodyBase64: "AQ==" }
            : { body: {} }),
      };
      const request: AzureDevOpsRequest = builder.build(input);
      expect(request.path, operation.key).not.toMatch(/\{[^}]+\}/u);
      expect(request.method, operation.key).toBe(operation.method);
      expect(request.apiVersion, operation.key).toBe(operation.apiVersion);
    }
  });
});
