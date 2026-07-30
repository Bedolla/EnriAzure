import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageName, packageVersion } from "../../src/package-info.js";

interface PackageManifest {
  readonly name: string;
  readonly version: string;
}

describe("package metadata", (): void => {
  it("keeps runtime metadata synchronized with package.json", async (): Promise<void> => {
    const manifestText = await readFile(join(process.cwd(), "package.json"), "utf8");
    const manifest = JSON.parse(manifestText) as PackageManifest;

    expect(packageName).toBe(manifest.name);
    expect(packageVersion).toBe(manifest.version);
  });
});
