import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { RestOperationExecutor } from "../../../../application/services/RestOperationExecutor.js";
import { RequestScope } from "../../../../application/services/RequestScope.js";
import { CatalogRestToolSlice, RestOperationDefinition } from "../../CatalogRestToolSlice.js";
import type { McpToolSlice } from "../../McpToolSlice.js";
import { McpResultPresenter } from "../../McpResultPresenter.js";
import { requireRequestBody } from "../../RequestBodyGuard.js";
import { collectionProjectScopeSchema, requestBodySchema, topSchema } from "../../SharedSchemas.js";
import { destructiveAnnotations, readOnlyAnnotations } from "../../ToolAnnotationsCatalog.js";

const testReadSchema = z.object({
  action: z
    .enum([
      "list_plans",
      "get_plan",
      "list_suites",
      "get_suite",
      "list_test_cases",
      "list_runs",
      "get_run",
      "list_results",
      "get_result",
    ])
    .describe(
      "Acción de lectura. list_plans devuelve plan_id; list_suites devuelve suite_id; list_runs devuelve run_id; list_results devuelve result_id. list_test_cases devuelve IDs de work items de caso de prueba.",
    ),
  ...collectionProjectScopeSchema,
  plan_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_plans/create_plan."),
  suite_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_suites/create_suite."),
  run_id: z.number().int().positive().optional().describe("ID devuelto por list_runs/create_run."),
  result_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_results/add_results."),
  top: topSchema,
});

const testWriteSchema = z.object({
  action: z
    .enum([
      "create_plan",
      "update_plan",
      "delete_plan",
      "create_suite",
      "update_suite",
      "delete_suite",
      "add_test_cases",
      "remove_test_cases",
      "create_run",
      "update_run",
      "delete_run",
      "add_results",
      "update_results",
    ])
    .describe(
      "Acción de cambio. create_plan devuelve plan_id; create_suite usa plan_id y devuelve suite_id; create_run devuelve run_id; add_results devuelve result_id. remove/delete requieren full.",
    ),
  ...collectionProjectScopeSchema,
  plan_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con test list_plans/create_plan."),
  suite_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con test list_suites/create_suite."),
  run_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con test list_runs/create_run."),
  test_case_ids: z
    .array(z.number().int().positive())
    .optional()
    .describe("IDs de work items tipo Test Case obtenidos con work_item o test list_test_cases."),
  body: z
    .union([requestBodySchema, z.array(z.unknown())])
    .optional()
    .describe(
      "Objeto o arreglo exacto para la action; resultados suelen ser arreglo. Consulta official_test_plan/official_test_results get_schema para campos y estados válidos.",
    ),
});

type TestReadArguments = z.infer<typeof testReadSchema>;
type TestWriteArguments = z.infer<typeof testWriteSchema>;

/**
 * Test plans and test results vertical slice.
 */
export class TestToolSlice implements McpToolSlice {
  private readonly readTool: CatalogRestToolSlice<TestReadArguments>;
  private readonly writeTool: CatalogRestToolSlice<TestWriteArguments>;

  /**
   * Creates the test slice.
   *
   * @param executor - Guarded executor.
   * @param presenter - Safe presenter.
   * @param scope - Route scope builder.
   */
  public constructor(
    executor: RestOperationExecutor,
    presenter: McpResultPresenter,
    scope: RequestScope,
  ) {
    this.readTool = new CatalogRestToolSlice(executor, presenter, {
      name: "test",
      title: "Consultar planes, suites, runs y resultados de pruebas",
      description:
        "Consulta recursos de prueba disponibles en Azure DevOps Server: planes, suites, casos, runs y resultados. Las acciones list proporcionan plan_id, suite_id, run_id y result_id para lecturas o cambios posteriores.",
      source: "Azure DevOps test",
      inputSchema: testReadSchema,
      annotations: readOnlyAnnotations,
      operations: TestToolSlice.createReadOperations(scope),
    });
    this.writeTool = new CatalogRestToolSlice(executor, presenter, {
      name: "test_write",
      title: "Modificar planes, suites, runs y resultados de pruebas",
      description:
        "Administra planes, suites, membresía de casos, runs y resultados en Server. Lee primero los recursos y usa IDs reales. Las operaciones de eliminación o retiro requieren ENRIAZURE_WRITE_POLICY=full.",
      source: "Azure DevOps test",
      inputSchema: testWriteSchema,
      annotations: destructiveAnnotations,
      operations: TestToolSlice.createWriteOperations(scope),
    });
  }

  /** @inheritdoc */
  public register(server: McpServer): void {
    this.readTool.register(server);
    this.writeTool.register(server);
  }

  private static createReadOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<TestReadArguments>[] {
    const plan = (args: TestReadArguments): string =>
      `_apis/testplan/plans/${scope.requiredSegment(args.plan_id, "plan_id")}`;
    const suite = (args: TestReadArguments): string =>
      `${plan(args)}/suites/${scope.requiredSegment(args.suite_id, "suite_id")}`;
    return [
      new RestOperationDefinition("list_plans", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/testplan/plans"),
        query: { $top: args.top },
      })),
      new RestOperationDefinition("get_plan", "read", (args) => ({
        method: "GET",
        path: scope.project(args, plan(args)),
      })),
      new RestOperationDefinition("list_suites", "read", (args) => ({
        method: "GET",
        path: scope.project(args, `${plan(args)}/suites`),
        query: { $expand: "children" },
      })),
      new RestOperationDefinition("get_suite", "read", (args) => ({
        method: "GET",
        path: scope.project(args, suite(args)),
      })),
      new RestOperationDefinition("list_test_cases", "read", (args) => ({
        method: "GET",
        path: scope.project(args, `${suite(args)}/testcase`),
      })),
      new RestOperationDefinition("list_runs", "read", (args) => ({
        method: "GET",
        path: scope.project(args, "_apis/testresults/runs"),
        query: { $top: args.top },
      })),
      new RestOperationDefinition("get_run", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/testresults/runs/${scope.requiredSegment(args.run_id, "run_id")}`,
        ),
      })),
      new RestOperationDefinition("list_results", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/testresults/runs/${scope.requiredSegment(args.run_id, "run_id")}/results`,
        ),
        query: { $top: args.top },
      })),
      new RestOperationDefinition("get_result", "read", (args) => ({
        method: "GET",
        path: scope.project(
          args,
          `_apis/testresults/runs/${scope.requiredSegment(args.run_id, "run_id")}/results/${scope.requiredSegment(args.result_id, "result_id")}`,
        ),
      })),
    ];
  }

  private static createWriteOperations(
    scope: RequestScope,
  ): readonly RestOperationDefinition<TestWriteArguments>[] {
    const plan = (args: TestWriteArguments): string =>
      `_apis/testplan/plans/${scope.requiredSegment(args.plan_id, "plan_id")}`;
    const suite = (args: TestWriteArguments): string =>
      `${plan(args)}/suites/${scope.requiredSegment(args.suite_id, "suite_id")}`;
    return [
      new RestOperationDefinition("create_plan", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/testplan/plans"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_plan", "write", (args) => ({
        method: "PATCH",
        path: scope.project(args, plan(args)),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_plan", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(args, plan(args)),
      })),
      new RestOperationDefinition("create_suite", "write", (args) => ({
        method: "POST",
        path: scope.project(args, `${plan(args)}/suites`),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_suite", "write", (args) => ({
        method: "PATCH",
        path: scope.project(args, suite(args)),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_suite", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(args, suite(args)),
      })),
      new RestOperationDefinition("add_test_cases", "write", (args) => ({
        method: "POST",
        path: scope.project(args, `${suite(args)}/testcase`),
        body: args.body ?? args.test_case_ids?.map((id: number) => ({ workItem: { id } })) ?? [],
      })),
      new RestOperationDefinition("remove_test_cases", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `${suite(args)}/testcase/${(args.test_case_ids ?? []).join(",")}`,
        ),
      })),
      new RestOperationDefinition("create_run", "write", (args) => ({
        method: "POST",
        path: scope.project(args, "_apis/testresults/runs"),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_run", "write", (args) => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/testresults/runs/${scope.requiredSegment(args.run_id, "run_id")}`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("delete_run", "destructive", (args) => ({
        method: "DELETE",
        path: scope.project(
          args,
          `_apis/testresults/runs/${scope.requiredSegment(args.run_id, "run_id")}`,
        ),
      })),
      new RestOperationDefinition("add_results", "write", (args) => ({
        method: "POST",
        path: scope.project(
          args,
          `_apis/testresults/runs/${scope.requiredSegment(args.run_id, "run_id")}/results`,
        ),
        body: requireRequestBody(args.body),
      })),
      new RestOperationDefinition("update_results", "write", (args) => ({
        method: "PATCH",
        path: scope.project(
          args,
          `_apis/testresults/runs/${scope.requiredSegment(args.run_id, "run_id")}/results`,
        ),
        body: requireRequestBody(args.body),
      })),
    ];
  }
}
