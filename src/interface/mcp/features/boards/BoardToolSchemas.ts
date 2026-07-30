import { z } from "zod";
import { collectionProjectScopeSchema, requestBodySchema } from "../../SharedSchemas.js";

export const boardReadSchema = z.object({
  action: z
    .enum([
      "get_team_settings",
      "list_backlogs",
      "get_backlog",
      "list_backlog_items",
      "list_iterations",
      "get_iteration",
      "get_iteration_work_items",
      "list_iteration_nodes",
      "get_iteration_node",
      "list_area_nodes",
      "get_area_node",
      "get_capacities",
      "list_boards",
      "get_board",
    ])
    .describe(
      "Acción de lectura. list_backlogs obtiene backlog_id; list_iterations obtiene iteration_id; list_iteration_nodes/area_nodes obtienen iteration_path/area_path; list_boards obtiene board_id. Usa esos valores en acciones get y board_write.",
    ),
  ...collectionProjectScopeSchema,
  team: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Nombre o ID del equipo. Obtén valores válidos con official_core (Teams_Get Teams); es requerido por acciones de equipo.",
    ),
  backlog_id: z.string().min(1).optional().describe("ID devuelto por list_backlogs."),
  iteration_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      "GUID de iteración de equipo devuelto por list_iterations; no es lo mismo que iteration_path.",
    ),
  board_id: z.string().min(1).optional().describe("Nombre o ID devuelto por list_boards."),
  user_id: z
    .string()
    .min(1)
    .optional()
    .describe("ID de identidad para filtrar capacidad; obténlo de get_capacities u official_ims."),
  timeframe: z
    .enum(["past", "current", "future"])
    .optional()
    .describe("Filtro de list_iterations: past, current o future; omite para todas."),
  iteration_path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Ruta de clasificación devuelta por list_iteration_nodes, por ejemplo Proyecto\\Sprint 1.",
    ),
  area_path: z
    .string()
    .min(1)
    .optional()
    .describe("Ruta de clasificación devuelta por list_area_nodes, por ejemplo Proyecto\\Backend."),
  depth: z
    .number()
    .int()
    .nonnegative()
    .max(20)
    .optional()
    .describe("Profundidad de nodos hijos de 0 a 20; 0 devuelve sólo el nodo solicitado."),
});

export const boardWriteSchema = z.object({
  action: z
    .enum([
      "update_team_settings",
      "add_iteration",
      "remove_iteration",
      "create_iteration_node",
      "update_iteration_node",
      "delete_iteration_node",
      "create_area_node",
      "update_area_node",
      "delete_area_node",
      "update_capacity",
      "replace_capacities",
      "update_board",
    ])
    .describe(
      "Acción de cambio. Primero crea/obtén un iteration node y su identifier/path, luego add_iteration lo asigna al equipo; remove_iteration sólo desasigna. Capacidades usan user_id. delete de nodos requiere full.",
    ),
  ...collectionProjectScopeSchema,
  team: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Nombre o ID del equipo obtenido con official_core; requerido para settings, asignaciones, capacidad y board.",
    ),
  iteration_id: z
    .string()
    .min(1)
    .optional()
    .describe("GUID de iteración de equipo obtenido con board list_iterations/add_iteration."),
  user_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      "ID de identidad obtenido con board get_capacities u official_ims; requerido para update_capacity.",
    ),
  board_id: z.string().min(1).optional().describe("Nombre o ID obtenido con board list_boards."),
  iteration_path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Ruta existente obtenida con board list_iteration_nodes; requerida para actualizar o eliminar ese nodo.",
    ),
  area_path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Ruta existente obtenida con board list_area_nodes; requerida para actualizar o eliminar ese nodo.",
    ),
  body: z
    .union([requestBodySchema, z.array(z.unknown())])
    .optional()
    .describe(
      "Objeto o arreglo exacto para la action. create node usa {name}; add_iteration usa {id}; capacidades pueden ser objeto o arreglo. Consulta official_work/official_wit get_schema para el contrato completo.",
    ),
});

export type BoardReadArguments = z.infer<typeof boardReadSchema>;
export type BoardWriteArguments = z.infer<typeof boardWriteSchema>;
