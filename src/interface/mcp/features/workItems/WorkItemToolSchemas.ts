import { z } from "zod";
import { collectionProjectScopeSchema, requestBodySchema, topSchema } from "../../SharedSchemas.js";

export const workItemReadSchema = z.object({
  action: z
    .enum([
      "get",
      "get_batch",
      "query_wiql",
      "list_queries",
      "get_query",
      "list_comments",
      "list_revisions",
      "list_types",
      "get_type",
      "list_fields",
      "list_deleted",
      "get_deleted",
    ])
    .describe(
      "Acción de lectura. query_wiql/get_batch devuelven work_item_id; list_queries devuelve query_id_or_path; list_types devuelve work_item_type; list_comments devuelve comment_id; list_deleted devuelve IDs reciclados.",
    ),
  ...collectionProjectScopeSchema,
  work_item_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "ID numérico positivo devuelto por query_wiql, get_batch, list_deleted o una creación.",
    ),
  query_id_or_path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "GUID o ruta de consulta guardada devuelta por list_queries, por ejemplo Shared Queries/Activos.",
    ),
  work_item_type: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Nombre exacto del tipo devuelto por list_types, por ejemplo Bug, Task o User Story.",
    ),
  ids: z
    .array(z.number().int().positive())
    .max(200)
    .optional()
    .describe("Hasta 200 IDs obtenidos de query_wiql u otra lectura; requerido para get_batch."),
  wiql: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Consulta WIQL completa para query_wiql, por ejemplo SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject]=@project.",
    ),
  fields: z
    .array(z.string().min(1))
    .optional()
    .describe(
      "Nombres de referencia exactos devueltos por list_fields, por ejemplo System.Title y System.State.",
    ),
  expand: z
    .enum(["none", "relations", "fields", "links", "all"])
    .optional()
    .describe(
      "Expansión de get/get_batch: none, relations, fields, links o all; usa sólo lo necesario.",
    ),
  top: topSchema,
  continuation_token: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Token devuelto por una página anterior de comentarios; reenvíalo sin modificar para continuar.",
    ),
});

export const workItemWriteSchema = z.object({
  action: z
    .enum([
      "create",
      "update",
      "delete",
      "add_comment",
      "update_comment",
      "delete_comment",
      "create_query",
      "update_query",
      "delete_query",
      "restore_deleted",
      "destroy_deleted",
    ])
    .describe(
      "Acción de cambio. create devuelve work_item_id; add_comment devuelve comment_id; create_query devuelve query_id_or_path. delete mueve a papelera salvo destroy=true; restore_deleted recupera; destroy_deleted elimina permanentemente. Eliminaciones requieren full.",
    ),
  ...collectionProjectScopeSchema,
  work_item_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con work_item query/get/list_deleted o con create."),
  work_item_type: z
    .string()
    .min(1)
    .optional()
    .describe("Tipo exacto obtenido con work_item list_types; requerido para create."),
  comment_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("ID obtenido con work_item list_comments o add_comment."),
  query_id_or_path: z
    .string()
    .min(1)
    .optional()
    .describe("GUID o ruta obtenida con work_item list_queries o create_query."),
  destroy: z
    .boolean()
    .optional()
    .describe(
      "En delete, false/default mueve a papelera y permite restore_deleted; true solicita eliminación permanente y requiere full.",
    ),
  body: z
    .union([requestBodySchema, z.array(z.unknown())])
    .optional()
    .describe(
      "Cuerpo exacto para la action. create/update usan JSON Patch (arreglo de operaciones op/path/value); comentarios y consultas usan objeto. Consulta official_wit/get_schema para propiedades completas.",
    ),
});

export type WorkItemReadArguments = z.infer<typeof workItemReadSchema>;
export type WorkItemWriteArguments = z.infer<typeof workItemWriteSchema>;
