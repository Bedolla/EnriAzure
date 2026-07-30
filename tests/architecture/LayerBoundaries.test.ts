import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function listTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(path);
      }
      return entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return nested.flat();
}

describe("Clean Architecture boundaries", (): void => {
  it("keeps domain and application independent from MCP and infrastructure", async (): Promise<void> => {
    const roots = [join(process.cwd(), "src", "domain"), join(process.cwd(), "src", "application")];
    const files = (await Promise.all(roots.map(listTypeScriptFiles))).flat();

    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(
        /@modelcontextprotocol|\/infrastructure\/|process\.env|fetch\(/,
      );
    }
  });
});
