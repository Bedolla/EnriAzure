/**
 * Package identity shared by MCP registration and outbound user agents.
 *
 * @remarks
 * The manifest is the single source of truth: this module reads `package.json`
 * at load time instead of duplicating its values, so a version bump can never
 * leave the runtime metadata stale. The read works from both `src/` (tests and
 * tooling) and `dist/` (published bundle) because both directories sit one
 * level below the package root, and npm always ships `package.json`.
 *
 * @module package-info
 */

import { readFileSync } from "node:fs";

/** Shape of the manifest fields this module consumes. */
interface PackageManifestIdentity {
  /** Published package name. */
  readonly name: string;

  /** Published package version. */
  readonly version: string;
}

/**
 * Resolves and validates the package manifest.
 *
 * @returns Name and version declared by `package.json`.
 * @throws If the manifest cannot be read, is not JSON, or lacks string `name`
 *   and `version` fields.
 */
function readManifestIdentity(): PackageManifestIdentity {
  const manifestUrl: URL = new URL("../package.json", import.meta.url);
  const manifestText: string = readFileSync(manifestUrl, "utf8");
  const manifest: unknown = JSON.parse(manifestText);

  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("name" in manifest) ||
    !("version" in manifest)
  ) {
    throw new Error(`Package manifest at ${manifestUrl.pathname} lacks 'name' and 'version'.`);
  }

  if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
    throw new Error(
      `Package manifest at ${manifestUrl.pathname} must declare string 'name' and 'version'.`,
    );
  }

  return { name: manifest.name, version: manifest.version };
}

const manifestIdentity: PackageManifestIdentity = readManifestIdentity();

/** Package name used by MCP metadata and outbound user agents. */
export const packageName: string = manifestIdentity.name;

/** Package version synchronized with package.json. */
export const packageVersion: string = manifestIdentity.version;
