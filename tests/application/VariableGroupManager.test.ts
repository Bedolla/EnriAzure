import { describe, expect, it } from "vitest";
import type {
  AzureDevOpsGateway,
  AzureDevOpsRequest,
  AzureDevOpsResponse,
} from "../../src/application/ports/AzureDevOpsGateway.js";
import { RequestScope } from "../../src/application/services/RequestScope.js";
import { RestOperationExecutor } from "../../src/application/services/RestOperationExecutor.js";
import { VariableGroupManager } from "../../src/application/services/VariableGroupManager.js";
import { WritePolicy } from "../../src/domain/configuration/WritePolicy.js";

class RecordingGateway implements AzureDevOpsGateway {
  public readonly requests: AzureDevOpsRequest[] = [];
  private readonly responses: AzureDevOpsResponse[];

  public constructor(responses: readonly AzureDevOpsResponse[]) {
    this.responses = [...responses];
  }

  /** @inheritdoc */
  public send(request: AzureDevOpsRequest): Promise<AzureDevOpsResponse> {
    this.requests.push(structuredClone(request));
    const response: AzureDevOpsResponse | undefined = this.responses.shift();
    if (response === undefined) {
      throw new Error("The test gateway has no response for the request.");
    }
    return Promise.resolve(response);
  }
}

function jsonResponse(data: unknown, statusCode: number = 200): AzureDevOpsResponse {
  return {
    statusCode,
    data,
    contentType: "application/json",
    headers: {},
  };
}

function existingGroup(): Record<string, unknown> {
  return {
    id: 12,
    name: "Deployment",
    description: "Deployment variables",
    type: "Vsts",
    variables: {
      EXISTING: { value: "kept", isSecret: false },
      SECRET: { value: null, isSecret: true },
    },
    variableGroupProjectReferences: [
      {
        name: "Deployment",
        description: "Deployment variables",
        projectReference: { id: "00000000-0000-0000-0000-000000000001", name: "App" },
      },
    ],
  };
}

describe("VariableGroupManager", (): void => {
  it("sets one variable while preserving siblings and redacting secret responses", async (): Promise<void> => {
    const returnedGroup: Record<string, unknown> = existingGroup();
    returnedGroup["variables"] = {
      ...(returnedGroup["variables"] as Record<string, unknown>),
      SECRET: { value: "classified-test-value", isSecret: true },
      NEW_VARIABLE: { value: "new-value", isSecret: false },
    };
    const gateway = new RecordingGateway([
      jsonResponse(existingGroup()),
      jsonResponse(returnedGroup),
    ]);
    const manager = new VariableGroupManager(
      new RestOperationExecutor(gateway, new WritePolicy("write")),
      new RequestScope({ collection: "Collection", project: "App" }),
    );

    const response = await manager.setVariable({
      groupId: 12,
      variableName: "NEW_VARIABLE",
      value: "new-value",
    });

    expect(gateway.requests).toHaveLength(2);
    expect(gateway.requests[1]).toMatchObject({
      method: "PUT",
      path: "/Collection/_apis/distributedtask/variablegroups/12",
      body: {
        variables: {
          EXISTING: { value: "kept", isSecret: false },
          SECRET: { value: null, isSecret: true },
          NEW_VARIABLE: { value: "new-value", isSecret: false, isReadOnly: false },
        },
      },
    });
    expect(JSON.stringify(response.data)).not.toContain("classified-test-value");
    expect(response.data).toMatchObject({
      variables: {
        SECRET: { value: null, isSecret: true },
      },
    });
  });

  it("creates a project-linked native group through the collection endpoint", async (): Promise<void> => {
    const gateway = new RecordingGateway([
      jsonResponse({
        id: "00000000-0000-0000-0000-000000000001",
        name: "App",
      }),
      jsonResponse({
        id: 13,
        name: "Deployment",
        variables: { PASSWORD: { value: "classified-test-value", isSecret: true } },
      }),
    ]);
    const manager = new VariableGroupManager(
      new RestOperationExecutor(gateway, new WritePolicy("write")),
      new RequestScope({ collection: "Collection", project: "App" }),
    );

    const response = await manager.create({
      name: "Deployment",
      variables: {
        PASSWORD: { value: "classified-test-value", isSecret: true },
      },
    });

    expect(gateway.requests[0]?.path).toBe("/Collection/_apis/projects/App");
    expect(gateway.requests[1]).toMatchObject({
      method: "POST",
      path: "/Collection/_apis/distributedtask/variablegroups",
      body: {
        type: "Vsts",
        variableGroupProjectReferences: [
          {
            name: "Deployment",
            projectReference: {
              id: "00000000-0000-0000-0000-000000000001",
              name: "App",
            },
          },
        ],
      },
    });
    expect(JSON.stringify(response.data)).not.toContain("classified-test-value");
  });

  it("blocks a variable mutation before its preliminary read in read-only mode", async (): Promise<void> => {
    const gateway = new RecordingGateway([]);
    const manager = new VariableGroupManager(
      new RestOperationExecutor(gateway, new WritePolicy("read-only")),
      new RequestScope({ collection: "Collection", project: "App" }),
    );

    await expect(
      manager.setVariable({
        groupId: 12,
        variableName: "NEW_VARIABLE",
        value: "new-value",
      }),
    ).rejects.toThrow("read-only");
    expect(gateway.requests).toHaveLength(0);
  });
});
