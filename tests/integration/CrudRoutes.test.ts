import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnriAzureCompositionRoot } from "../../src/composition/EnriAzureCompositionRoot.js";

interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly search: string;
  readonly headers: Headers;
  readonly body?: BodyInit | null | undefined;
}

describe("EnriAzure explicit CRUD routes", (): void => {
  afterEach((): void => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("routes representative CI/CD mutations through first-class tools", async (): Promise<void> => {
    vi.stubEnv("ENRIAZURE_SERVER_URL", "https://ado.example.test");
    vi.stubEnv("ENRIAZURE_PAT", "fake-test-token");
    vi.stubEnv("ENRIAZURE_DEFAULT_COLLECTION", "Collection");
    vi.stubEnv("ENRIAZURE_DEFAULT_PROJECT", "App");
    vi.stubEnv("ENRIAZURE_WRITE_POLICY", "full");

    const requests: RecordedRequest[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url: URL =
          input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
        requests.push({
          method: init?.method ?? "GET",
          path: url.pathname,
          search: url.search,
          headers: new Headers(init?.headers),
          body: init?.body,
        });
        return Promise.resolve(
          new Response(JSON.stringify({ id: 1 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new EnriAzureCompositionRoot().createServer();
    const client = new Client({ name: "EnriAzureCrudTests", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const calls: readonly {
        readonly name: string;
        readonly arguments: Record<string, unknown>;
      }[] = [
        {
          name: "pipeline_write",
          arguments: { action: "create_pipeline", body: { name: "Deploy" } },
        },
        {
          name: "board_write",
          arguments: { action: "create_iteration_node", body: { name: "Sprint 1" } },
        },
        {
          name: "deployment_write",
          arguments: {
            action: "update_pipeline_permissions",
            resource_type: "environment",
            resource_id: "10",
            body: { pipelines: [] },
          },
        },
        {
          name: "deployment",
          arguments: {
            action: "list_approvals",
            assigned_to: ["user-identity-id", "vssgp.group-descriptor"],
            approval_state: "pending",
            top: 25,
          },
        },
        {
          name: "deployment",
          arguments: {
            action: "get_check_evaluation",
            check_suite_id: "11111111-1111-4111-8111-111111111110",
            check_expand: "resources",
          },
        },
        {
          name: "deployment_write",
          arguments: {
            action: "evaluate_checks",
            body: {
              id: "11111111-1111-4111-8111-111111111110",
              context: { pipelineRunId: 42 },
              resources: [],
            },
          },
        },
        {
          name: "deployment_write",
          arguments: {
            action: "update_check_evaluation",
            check_suite_id: "11111111-1111-4111-8111-111111111110",
            check_run_id: "11111111-1111-4111-8111-111111111111",
            check_update_action: "rerun",
          },
        },
        {
          name: "agent_pool_write",
          arguments: { action: "create_queue", body: { pool: { id: 2 } } },
        },
        {
          name: "artifact_feed_write",
          arguments: { action: "create_feed", body: { name: "Packages" } },
        },
        {
          name: "release_write",
          arguments: { action: "create_definition", body: { name: "Production" } },
        },
        {
          name: "repository_write",
          arguments: { action: "update", repository: "Repo", body: { name: "Renamed" } },
        },
        {
          name: "work_item_write",
          arguments: { action: "restore_deleted", work_item_id: 42 },
        },
        {
          name: "test_write",
          arguments: { action: "add_results", run_id: 5, body: [{ outcome: "Passed" }] },
        },
        {
          name: "wiki_write",
          arguments: {
            action: "upsert_page",
            wiki: "Docs",
            page_path: "/Deploy",
            etag: '"page-version"',
            body: { content: "# Deploy" },
          },
        },
        {
          name: "secure_file_write",
          arguments: {
            action: "upload",
            name: "deployment.pfx",
            content_base64: "AQID",
          },
        },
        {
          name: "official_dashboard_write",
          arguments: {
            operation: "dashboard.dashboard.Dashboards_Create",
            team: "Delivery",
            body: { name: "Operations" },
          },
        },
        {
          name: "official_security_write",
          arguments: {
            operation: "security.security.Access Control Entries_Set Access Control Entries",
            path_parameters: {
              securityNamespaceId: "00000000-0000-0000-0000-000000000002",
            },
            body: { token: "project", merge: true, accessControlEntries: [] },
          },
        },
        {
          name: "official_processes_write",
          arguments: {
            operation: "processes.work-item-tracking-process.Processes_Create",
            body: { name: "Inherited process" },
          },
        },
        {
          name: "official_extension_management_write",
          arguments: {
            operation:
              "extensionManagement.extension-management.Installed Extensions_Install Extension By Name",
            path_parameters: {
              publisherName: "publisher",
              extensionName: "extension",
              version: "1.0.0",
            },
          },
        },
        {
          name: "official_tfvc",
          arguments: {
            operation: "tfvc.tfvc.Changesets_Get Changesets",
            query_parameters: { $top: 5 },
          },
        },
        {
          name: "official_notification",
          arguments: {
            operation: "notification.notification.Subscriptions_Query",
            body: { conditions: [] },
          },
        },
        {
          name: "official_wit_write",
          arguments: {
            operation: "wit.work-item-tracking.Attachments_Upload Chunk",
            path_parameters: { id: "00000000-0000-0000-0000-000000000001" },
            headers: { contentRangeHeader: "bytes 0-2/3" },
            body_base64: "AQID",
          },
        },
        {
          name: "raw_rest",
          arguments: {
            action: "get",
            scope: "instance",
            api_path: "_apis/resourceAreas",
            api_version: "7.1",
            query: { feature: ["git", "build"] },
            headers: { if_none_match: '"resource-version"' },
          },
        },
        {
          name: "raw_rest_write",
          arguments: {
            action: "put",
            scope: "collection",
            api_path: "_apis/custom/chunks",
            api_version: "7.1-preview.1",
            body_base64: "AQID",
            headers: { content_range: "bytes 0-2/3" },
            accept: "application/octet-stream",
            response_mode: "base64",
          },
        },
      ];

      for (const call of calls) {
        const result = await client.callTool(call);
        expect(result.isError, call.name).not.toBe(true);
      }
      expect(requests.map(({ method, path }): string => `${method} ${path}`)).toEqual([
        "POST /Collection/App/_apis/pipelines",
        "POST /Collection/App/_apis/wit/classificationnodes/iterations",
        "PATCH /Collection/App/_apis/pipelines/pipelinepermissions/environment/10",
        "GET /Collection/App/_apis/pipelines/approvals",
        "GET /Collection/App/_apis/pipelines/checks/runs/11111111-1111-4111-8111-111111111110",
        "POST /Collection/App/_apis/pipelines/checks/runs",
        "PATCH /Collection/App/_apis/pipelines/checks/runs/11111111-1111-4111-8111-111111111110",
        "POST /Collection/App/_apis/distributedtask/queues",
        "POST /Collection/App/_apis/packaging/feeds",
        "POST /Collection/App/_apis/release/definitions",
        "PATCH /Collection/App/_apis/git/repositories/Repo",
        "PATCH /Collection/App/_apis/wit/recyclebin/42",
        "POST /Collection/App/_apis/testresults/runs/5/results",
        "PUT /Collection/App/_apis/wiki/wikis/Docs/pages",
        "POST /Collection/App/_apis/distributedtask/securefiles",
        "POST /Collection/App/Delivery/_apis/dashboard/dashboards",
        "POST /Collection/_apis/accesscontrolentries/00000000-0000-0000-0000-000000000002",
        "POST /Collection/_apis/work/processes",
        "POST /Collection/_apis/extensionmanagement/installedextensionsbyname/publisher/extension/1.0.0",
        "GET /Collection/App/_apis/tfvc/changesets",
        "POST /Collection/_apis/notification/subscriptionquery",
        "PUT /Collection/App/_apis/wit/attachments/00000000-0000-0000-0000-000000000001",
        "GET /_apis/resourceAreas",
        "PUT /Collection/_apis/custom/chunks",
      ]);
      expect(requests[3]?.search).toContain("assignedTo=user-identity-id%2Cvssgp.group-descriptor");
      expect(requests[3]?.search).toContain("state=pending");
      expect(requests[3]?.search).toContain("api-version=7.2-preview.2");
      expect(requests[4]?.search).toContain("%24expand=resources");
      expect(requests[4]?.search).toContain("api-version=7.2-preview.1");
      expect(requests[5]?.search).toContain("api-version=7.2-preview.1");
      expect(requests[6]?.search).toContain("api-version=7.2-preview.1");
      const checkUpdateBody: BodyInit | null | undefined = requests[6]?.body;
      expect(typeof checkUpdateBody).toBe("string");
      if (typeof checkUpdateBody !== "string") {
        throw new Error("Expected a serialized check update body.");
      }
      expect(JSON.parse(checkUpdateBody)).toEqual({
        action: "rerun",
        checkId: "11111111-1111-4111-8111-111111111111",
      });
      expect(requests[13]?.headers.get("If-Match")).toBe('"page-version"');
      expect(requests[14]?.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(requests[21]?.headers.get("Content-Range")).toBe("bytes 0-2/3");
      expect(requests[22]?.headers.get("If-None-Match")).toBe('"resource-version"');
      expect(requests[22]?.search).toContain("feature=git%2Cbuild");
      expect(requests[23]?.headers.get("Content-Range")).toBe("bytes 0-2/3");
      expect(requests[23]?.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(requests[23]?.body).toBeInstanceOf(Uint8Array);
    } finally {
      await client.close();
      await serverTransport.close();
    }
  });
});
