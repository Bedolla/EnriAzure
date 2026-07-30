import { z } from "zod";
import { collectionProjectScopeSchema, requestBodySchema, topSchema } from "../../SharedSchemas.js";

export const pipelineReadSchema = z.object({
  action: z
    .enum([
      "list_pipelines",
      "get_pipeline",
      "preview_pipeline",
      "list_runs",
      "get_run",
      "list_run_artifacts",
      "list_run_logs",
      "get_run_log",
      "list_definitions",
      "get_definition",
      "list_builds",
      "get_build",
      "get_timeline",
      "get_log",
      "list_artifacts",
      "get_artifact",
    ])
    .describe(
      "Acción de lectura. list_pipelines obtiene pipeline_id y list_runs obtiene run_id para YAML; list_definitions obtiene definition_id y list_builds obtiene build_id para Build clásico; logs proporcionan log_id y artifacts artifact_name.",
    ),
  ...collectionProjectScopeSchema,
  pipeline_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de pipeline YAML devuelto por list_pipelines o pipeline_write create_pipeline."),
  run_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de ejecución YAML devuelto por list_runs o pipeline_write run_pipeline."),
  definition_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de definición Build devuelto por list_definitions o create_definition."),
  build_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de build devuelto por list_builds o pipeline_write queue_build."),
  log_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_run_logs o por la timeline/lista de logs del build."),
  artifact_name: z
    .string()
    .min(1)
    .optional()
    .describe("Nombre exacto devuelto por list_run_artifacts o list_artifacts."),
  branch_name: z
    .string()
    .min(1)
    .optional()
    .describe("Ref completa para filtrar builds, por ejemplo refs/heads/main."),
  status_filter: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Filtro de estado documentado de Build, por ejemplo inProgress, completed o cancelling.",
    ),
  result_filter: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Filtro de resultado documentado, por ejemplo succeeded, partiallySucceeded, failed o canceled.",
    ),
  top: topSchema,
  body: requestBodySchema
    .optional()
    .describe(
      "Parámetros de preview_pipeline, como previewRun, yamlOverride, resources, stagesToSkip, templateParameters o variables. Consulta official_pipelines get_schema para el contrato exacto.",
    ),
});

export const pipelineWriteSchema = z.object({
  action: z
    .enum([
      "create_pipeline",
      "run_pipeline",
      "queue_build",
      "cancel_build",
      "update_build",
      "delete_build",
      "create_definition",
      "update_definition",
      "delete_definition",
    ])
    .describe(
      "Acción de cambio. create_pipeline devuelve pipeline_id y run_pipeline devuelve run_id. create_definition devuelve definition_id; queue_build lo usa y devuelve build_id. cancel/update/delete_build usan build_id. Las eliminaciones requieren full.",
    ),
  ...collectionProjectScopeSchema,
  pipeline_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de pipeline YAML obtenido con pipeline list_pipelines o create_pipeline."),
  build_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "ID obtenido con pipeline list_builds o queue_build; léelo antes de cancelar/actualizar/eliminar.",
    ),
  definition_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de definición Build obtenido con pipeline list_definitions o create_definition."),
  body: requestBodySchema
    .optional()
    .describe(
      "Objeto exacto para la action: create_pipeline define name/folder/configuration; run_pipeline usa resources/templateParameters/variables; queue_build referencia definition; update_definition requiere la revisión actual. Usa official_pipelines u official_build get_schema.",
    ),
});

export type PipelineReadArguments = z.infer<typeof pipelineReadSchema>;
export type PipelineWriteArguments = z.infer<typeof pipelineWriteSchema>;
