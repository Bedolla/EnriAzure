import { z } from "zod";

/**
 * Reusable optional collection and project MCP scope.
 */
export const collectionProjectScopeSchema = {
  collection: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Nombre o ID de la colección de Azure DevOps Server, por ejemplo DefaultCollection. Si se omite usa ENRIAZURE_DEFAULT_COLLECTION; una tool de listado de proyectos puede proporcionar colecciones válidas.",
    ),
  project: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Nombre o ID del proyecto, por ejemplo Restaurante. Si se omite usa ENRIAZURE_DEFAULT_PROJECT; project action=list devuelve proyectos e IDs válidos.",
    ),
};

/**
 * Reusable opaque JSON request body.
 */
export const requestBodySchema = z
  .record(z.string(), z.unknown())
  .describe(
    "Objeto JSON con las propiedades documentadas para la action elegida. No reutilices cuerpos de otra action ni incluyas secretos visibles obtenidos de respuestas enmascaradas.",
  );

/**
 * Reusable positive list limit.
 */
export const topSchema = z
  .number()
  .int()
  .positive()
  .max(10_000)
  .optional()
  .describe(
    "Cantidad máxima de elementos que solicitará Azure DevOps Server; entero de 1 a 10,000. Usa un valor pequeño para explorar y continúa con paginación cuando corresponda.",
  );

/**
 * Reusable non-negative list offset.
 */
export const skipSchema = z
  .number()
  .int()
  .nonnegative()
  .optional()
  .describe(
    "Cantidad de elementos que se omiten al paginar; entero desde 0. Combínalo con top sólo si la operación documenta paginación por desplazamiento.",
  );
