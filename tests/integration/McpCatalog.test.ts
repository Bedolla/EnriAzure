import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnriAzureCompositionRoot } from "../../src/composition/EnriAzureCompositionRoot.js";
import { officialApiOperations } from "../../src/infrastructure/officialApi/catalog/index.generated.js";
import { officialAreaToolName } from "../../src/interface/mcp/features/officialApi/OfficialAreaToolSlice.js";

describe("EnriAzure MCP catalog", (): void => {
  afterEach((): void => {
    vi.unstubAllEnvs();
  });

  it("publishes the complete read/write catalog and enforces read-only mode", async (): Promise<void> => {
    vi.stubEnv("ENRIAZURE_SERVER_URL", "https://ado.example.test");
    vi.stubEnv("ENRIAZURE_PAT", "fake-test-token");
    vi.stubEnv("ENRIAZURE_DEFAULT_COLLECTION", "Enri");
    vi.stubEnv("ENRIAZURE_DEFAULT_PROJECT", "Enri");
    vi.stubEnv("ENRIAZURE_WRITE_POLICY", "read-only");

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new EnriAzureCompositionRoot().createServer();
    const client = new Client({ name: "EnriAzureTests", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const catalog = await client.listTools();
      expect(catalog.tools.map((tool) => tool.name).sort()).toEqual([
        "administration",
        "administration_write",
        "agent_pool",
        "agent_pool_write",
        "artifact_feed",
        "artifact_feed_write",
        "board",
        "board_write",
        "deployment",
        "deployment_write",
        "official_api",
        "official_api_catalog",
        "official_api_write",
        "official_approvals_and_checks",
        "official_approvals_and_checks_write",
        "official_artifacts",
        "official_artifacts_package_types",
        "official_artifacts_package_types_write",
        "official_artifacts_write",
        "official_build",
        "official_build_write",
        "official_core",
        "official_core_write",
        "official_dashboard",
        "official_dashboard_write",
        "official_distributed_task",
        "official_distributed_task_write",
        "official_extension_management",
        "official_extension_management_write",
        "official_favorite",
        "official_favorite_write",
        "official_git",
        "official_git_write",
        "official_hooks",
        "official_hooks_write",
        "official_ims",
        "official_notification",
        "official_notification_write",
        "official_operations",
        "official_pipelines",
        "official_pipelines_write",
        "official_policy",
        "official_policy_write",
        "official_processadmin",
        "official_processadmin_write",
        "official_processes",
        "official_processes_write",
        "official_release",
        "official_release_write",
        "official_search",
        "official_security",
        "official_security_roles",
        "official_security_roles_write",
        "official_security_write",
        "official_service_endpoint",
        "official_service_endpoint_write",
        "official_test",
        "official_test_plan",
        "official_test_plan_write",
        "official_test_results",
        "official_test_results_write",
        "official_test_write",
        "official_tfvc",
        "official_tfvc_write",
        "official_wiki",
        "official_wiki_write",
        "official_wit",
        "official_wit_write",
        "official_work",
        "official_work_write",
        "pipeline",
        "pipeline_write",
        "project",
        "project_write",
        "pull_request",
        "pull_request_write",
        "raw_rest",
        "raw_rest_write",
        "release",
        "release_write",
        "repository",
        "repository_write",
        "search",
        "secure_file",
        "secure_file_write",
        "server",
        "test",
        "test_write",
        "variable_group",
        "variable_group_write",
        "wiki",
        "wiki_write",
        "work_item",
        "work_item_write",
      ]);
      const schemasByTool = new Map<string, string>(
        catalog.tools.map((tool): [string, string] => [
          tool.name,
          JSON.stringify(tool.inputSchema),
        ]),
      );
      for (const operation of officialApiOperations) {
        const baseName = officialAreaToolName(operation.area);
        const toolName = operation.risk === "read" ? baseName : `${baseName}_write`;
        expect(schemasByTool.get(toolName), operation.key).toContain(JSON.stringify(operation.key));
      }
      const spanishTitlePrefixes = [
        "Administrar ",
        "Buscar ",
        "Consultar ",
        "Descubrir ",
        "Ejecutar ",
        "Modificar ",
      ];
      const englishSentenceStart =
        /^(?:Read|Manage|Change|List|Get|Create|Delete|Inspect|Search|Server|Optional|Project|Team|Repository|Path|Value|Action|Maximum|Number|Exact|Expected|Request|Response)\b/u;
      for (const tool of catalog.tools) {
        expect(
          spanishTitlePrefixes.some((prefix): boolean => tool.title?.startsWith(prefix) === true),
          `${tool.name}: ${tool.title}`,
        ).toBe(true);
        expect(tool.description, tool.name).toBeTruthy();
        expect(tool.description, tool.name).not.toMatch(englishSentenceStart);
        for (const [parameter, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
          const parameterSchema = schema as { readonly description?: string | undefined };
          expect(parameterSchema.description, `${tool.name}.${parameter}`).toBeTruthy();
          expect(parameterSchema.description, `${tool.name}.${parameter}`).not.toMatch(
            englishSentenceStart,
          );
        }
      }

      const officialCatalog = await client.callTool({
        name: "official_api_catalog",
        arguments: { action: "list_areas" },
      });
      expect(officialCatalog.isError).not.toBe(true);
      expect(JSON.stringify(officialCatalog.content)).toContain("operationCount");
      expect(JSON.stringify(officialCatalog.content)).toContain("889");
      expect(JSON.stringify(officialCatalog.content)).toContain("2198");

      const officialSchema = await client.callTool({
        name: "official_api_catalog",
        arguments: {
          action: "get_schema",
          operation: "git.git.Pushes_Create",
        },
      });
      expect(officialSchema.isError).not.toBe(true);
      expect(JSON.stringify(officialSchema.content)).toContain("#/definitions/GitPush");

      const rawAuthorizationAttempt = await client.callTool({
        name: "raw_rest",
        arguments: {
          action: "get",
          scope: "instance",
          api_path: "_apis/connectionData",
          headers: { authorization: "Bearer forbidden" },
        },
      });
      expect(rawAuthorizationAttempt.isError).toBe(true);

      const result = await client.callTool({
        name: "project_write",
        arguments: {
          action: "delete",
          collection: "Enri",
          project: "DoNotDelete",
        },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("read-only");

      const officialDelete = await client.callTool({
        name: "official_api_write",
        arguments: {
          operation: "security.security.Access Control Entries_Remove Access Control Entries",
          path_parameters: {
            securityNamespaceId: "00000000-0000-0000-0000-000000000002",
          },
        },
      });
      expect(officialDelete.isError).toBe(true);
      expect(JSON.stringify(officialDelete.content)).toContain("read-only");
    } finally {
      await client.close();
      await serverTransport.close();
    }
  });
});
