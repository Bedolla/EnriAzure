#!/usr/bin/env node

import { EnriAzureCompositionRoot } from "./composition/EnriAzureCompositionRoot.js";

/**
 * Starts the EnriAzure stdio server.
 *
 * @returns Promise completed when the server exits.
 */
async function main(): Promise<void> {
  const server = new EnriAzureCompositionRoot().createServer();
  await server.run();
}

void main().catch((error: unknown): void => {
  const message: string = error instanceof Error ? error.message : "Error de inicio desconocido.";
  process.stderr.write(`EnriAzure no pudo iniciar: ${message}\n`);
  process.exitCode = 1;
});
