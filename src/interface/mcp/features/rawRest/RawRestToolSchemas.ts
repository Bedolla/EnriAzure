import { z } from "zod";
import { collectionProjectScopeSchema } from "../../SharedSchemas.js";

const scalarQuerySchema = z.union([z.string(), z.number(), z.boolean()]);
const queryValueSchema = z.union([scalarQuerySchema, z.array(scalarQuerySchema).min(1)]);
export const MAXIMUM_RAW_BASE64_CHARACTERS: number = 20_000_000;

const rawScopeSchema = {
  scope: z
    .enum(["instance", "collection", "project", "team"])
    .describe(
      "Alcance exacto de la ruta: instance inicia en /_apis; collection en /{collection}/_apis; project en /{collection}/{project}/_apis; team en /{collection}/{project}/{team}/_apis.",
    ),
  ...collectionProjectScopeSchema,
  team: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Nombre o ID del equipo. Es obligatorio sólo con scope=team; obtén equipos válidos con official_core o con official_api_catalog search text=team.",
    ),
};

const rawTransportSchema = {
  api_path: z
    .string()
    .min(6)
    .describe(
      "Ruta relativa del servidor que inicia con _apis/, por ejemplo _apis/git/repositories. No incluyas colección/proyecto/equipo, api-version, query string, esquema, host ni navegación al directorio padre.",
    ),
  api_version: z
    .string()
    .regex(/^\d+\.\d+(?:-preview(?:\.\d+)?)?$/)
    .optional()
    .describe(
      "Versión REST exacta documentada por el endpoint on-premises, por ejemplo 7.1-preview.1. Omite para usar la versión estable 7.1. No inventes una versión mayor: una versión no admitida no habilita funciones y el Server puede rechazarla.",
    ),
  query: z
    .record(z.string(), queryValueSchema)
    .optional()
    .describe(
      "Parámetros de consulta sin api-version. Cada valor puede ser string, number, boolean o arreglo no vacío; los arreglos se envían separados por comas.",
    ),
  accept: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Media type esperado de la respuesta, por ejemplo application/json o application/octet-stream. Usa response_mode=base64 para contenido binario.",
    ),
  response_mode: z
    .enum(["auto", "base64", "text"])
    .optional()
    .describe(
      "Decodificación de respuesta: auto detecta media types binarios comunes y procesa JSON; base64 siempre devuelve {encoding,byteLength,content}; text evita interpretar JSON.",
    ),
  headers: z
    .object({
      if_match: z
        .string()
        .min(1)
        .optional()
        .describe(
          "ETag para control de concurrencia, normalmente obtenido de headers.eTag en una respuesta anterior.",
        ),
      if_none_match: z
        .string()
        .min(1)
        .optional()
        .describe(
          "ETag para lectura condicional, normalmente obtenido de headers.eTag en una respuesta anterior.",
        ),
      range: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Rango de bytes de respuesta, como bytes=0-1023, sólo para un endpoint que documente Range.",
        ),
      content_range: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Intervalo de bytes cargados, como bytes 0-1023/4096, sólo para un endpoint por fragmentos que documente Content-Range.",
        ),
      etag: z
        .string()
        .min(1)
        .optional()
        .describe(
          "ETag de solicitud sólo cuando el endpoint documente explícitamente ese header de entrada.",
        ),
      continuation_token: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Token de continuación obtenido de headers.continuationToken en una respuesta anterior, sólo si el endpoint documenta paginación por header.",
        ),
    })
    .strict()
    .optional()
    .describe(
      "Headers permitidos para concurrencia, rangos y paginación. Authorization, Host, Cookie y headers arbitrarios no se aceptan para proteger la autoridad configurada.",
    ),
};

export const rawReadSchema = z.object({
  action: z
    .enum(["get", "head"])
    .describe(
      "get devuelve datos del endpoint; head devuelve estado y headers sin cuerpo. Prefiere get salvo que el endpoint documente HEAD.",
    ),
  ...rawScopeSchema,
  ...rawTransportSchema,
});

export const rawWriteSchema = z
  .object({
    action: z
      .enum(["post", "put", "patch", "delete"])
      .describe(
        "Verbo HTTP documentado: post normalmente crea o encola; put reemplaza o crea en una ruta conocida; patch cambia campos seleccionados; delete elimina. Nunca adivines el verbo.",
      ),
    ...rawScopeSchema,
    ...rawTransportSchema,
    body: z
      .unknown()
      .optional()
      .describe(
        "Cuerpo JSON exactamente como lo documenta el endpoint. Es mutuamente excluyente con body_base64.",
      ),
    body_base64: z
      .string()
      .max(MAXIMUM_RAW_BASE64_CHARACTERS)
      .optional()
      .describe(
        "Contenido base64 canónico para endpoints de carga binaria. Se decodifica antes del envío, usa application/octet-stream y es mutuamente excluyente con body.",
      ),
    content_type: z
      .enum(["application/json", "application/json-patch+json", "application/octet-stream"])
      .optional()
      .describe(
        "Media type de solicitud documentado por el endpoint. Con body el default es application/json; body_base64 requiere application/octet-stream.",
      ),
  })
  .superRefine((value, context): void => {
    if (value.body !== undefined && value.body_base64 !== undefined) {
      context.addIssue({
        code: "custom",
        message: "body y body_base64 son mutuamente excluyentes.",
      });
    }
    if (
      value.body_base64 !== undefined &&
      value.content_type !== undefined &&
      value.content_type !== "application/octet-stream"
    ) {
      context.addIssue({
        code: "custom",
        message: "body_base64 requiere content_type=application/octet-stream.",
      });
    }
    if (value.body !== undefined && value.content_type === "application/octet-stream") {
      context.addIssue({
        code: "custom",
        message: "application/octet-stream requiere body_base64, no body.",
      });
    }
  });

export type RawReadArguments = z.infer<typeof rawReadSchema>;
export type RawWriteArguments = z.infer<typeof rawWriteSchema>;
export type RawArguments = RawReadArguments | RawWriteArguments;
