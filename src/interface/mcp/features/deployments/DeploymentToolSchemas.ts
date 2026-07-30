import { z } from "zod";
import { collectionProjectScopeSchema, requestBodySchema, topSchema } from "../../SharedSchemas.js";

export const deploymentReadSchema = z.object({
  action: z
    .enum([
      "list_environments",
      "get_environment",
      "list_environment_deployments",
      "list_deployment_groups",
      "get_deployment_group",
      "list_deployment_targets",
      "get_deployment_target",
      "get_pipeline_permissions",
      "list_check_configurations",
      "get_check_configuration",
      "get_check_evaluation",
      "list_approvals",
      "get_approval",
    ])
    .describe(
      "Acción de lectura. list_environments obtiene environment_id; list_deployment_groups obtiene deployment_group_id y list_deployment_targets obtiene target_id; list_check_configurations obtiene check_id; get_check_evaluation inspecciona una ejecución de checks de Update 2; list_approvals obtiene approval_id y permite filtrar asignatarios.",
    ),
  ...collectionProjectScopeSchema,
  environment_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de environment devuelto por list_environments o create_environment."),
  deployment_group_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID devuelto por list_deployment_groups o create_deployment_group."),
  target_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID de máquina/target devuelto por list_deployment_targets."),
  resource_type: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Tipo técnico del recurso protegido que documenta Pipelines, por ejemplo environment, queue, repository o endpoint.",
    ),
  resource_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      "ID del recurso protegido obtenido con su tool de listado; se interpreta dentro de resource_type.",
    ),
  check_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "ID de configuración de check devuelto por list_check_configurations o create_check_configuration.",
    ),
  check_suite_id: z
    .uuid()
    .optional()
    .describe(
      "GUID de la ejecución de checks. Lo devuelve evaluate_checks o el contexto de checks de una ejecución de pipeline; úsalo con get_check_evaluation.",
    ),
  approval_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID de aprobación devuelto por list_approvals; normalmente GUID."),
  approval_ids: z
    .array(z.uuid())
    .min(1)
    .optional()
    .describe(
      "GUIDs exactos de aprobaciones que quieres consultar. Obténlos de una respuesta anterior de list_approvals.",
    ),
  assigned_to: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe(
      "Usuarios asignados a la aprobación en Server 2022 Update 2. Cada elemento puede ser ID, descriptor o correo reconocido por el Server.",
    ),
  approval_state: z
    .enum([
      "undefined",
      "uninitiated",
      "pending",
      "approved",
      "rejected",
      "skipped",
      "canceled",
      "timedOut",
      "failed",
      "completed",
      "all",
    ])
    .optional()
    .describe(
      "Estado exacto para list_approvals. Usa pending para aprobaciones pendientes o all para cualquier estado.",
    ),
  approval_expand: z
    .enum(["none", "steps", "permissions"])
    .optional()
    .describe(
      "Información adicional de la aprobación: none, steps o permissions. Aplica a list_approvals y get_approval.",
    ),
  check_expand: z
    .enum(["none", "resources"])
    .optional()
    .describe("Información adicional para get_check_evaluation: none o resources."),
  name: z
    .string()
    .min(1)
    .optional()
    .describe("Filtro exacto o parcial de nombre para listar environments o deployment groups."),
  continuation_token: z
    .string()
    .min(1)
    .optional()
    .describe("Token devuelto por la página anterior; reenvíalo sin modificar."),
  top: topSchema,
});

export const deploymentWriteSchema = z.object({
  action: z
    .enum([
      "create_environment",
      "update_environment",
      "delete_environment",
      "create_deployment_group",
      "update_deployment_group",
      "delete_deployment_group",
      "update_deployment_targets",
      "delete_deployment_target",
      "update_pipeline_permissions",
      "update_pipeline_permissions_for_resources",
      "create_check_configuration",
      "update_check_configuration",
      "delete_check_configuration",
      "evaluate_checks",
      "update_check_evaluation",
      "update_approvals",
    ])
    .describe(
      "Acción de cambio. Las create devuelven environment_id/deployment_group_id/check_id. Targets provienen de list_deployment_targets; permisos requieren resource_type/resource_id; evaluate_checks inicia una suite; update_check_evaluation permite rerun, bypass o defer en Update 2; aprobaciones usan IDs de list_approvals. Acciones delete requieren full.",
    ),
  ...collectionProjectScopeSchema,
  environment_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con deployment list_environments o create_environment."),
  deployment_group_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con deployment list_deployment_groups o create_deployment_group."),
  target_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con deployment list_deployment_targets."),
  resource_type: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Tipo técnico exacto del recurso protegido, por ejemplo environment; confirma con get_pipeline_permissions.",
    ),
  resource_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID real del recurso protegido obtenido con su tool de lectura."),
  check_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con deployment list_check_configurations o create_check_configuration."),
  check_suite_id: z
    .uuid()
    .optional()
    .describe(
      "GUID de la suite devuelto por evaluate_checks o por el contexto de checks del pipeline. Es obligatorio para update_check_evaluation.",
    ),
  check_run_id: z
    .uuid()
    .optional()
    .describe(
      "GUID del check individual dentro de la suite, obtenido con get_check_evaluation. Es obligatorio para update_check_evaluation.",
    ),
  check_update_action: z
    .enum(["rerun", "bypass", "defer"])
    .optional()
    .describe(
      "Acción de Server 2022 Update 2 para update_check_evaluation: rerun vuelve a ejecutar un check terminado que permite reintento; bypass omite uno pendiente cuando el usuario tiene permiso; defer lo aplaza.",
    ),
  body: z
    .union([requestBodySchema, z.array(z.unknown())])
    .optional()
    .describe(
      "Objeto o arreglo exacto para la action. Permisos por recursos y approvals suelen usar arreglos; environment/group/check usan objeto. evaluate_checks requiere un CheckSuiteRequest con id/context/resources. update_check_evaluation usa check_suite_id, check_run_id y check_update_action en lugar de body.",
    ),
});

export type DeploymentReadArguments = z.infer<typeof deploymentReadSchema>;
export type DeploymentWriteArguments = z.infer<typeof deploymentWriteSchema>;
