import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentPatProvider } from "../../src/infrastructure/authentication/EnvironmentPatProvider.js";

describe("EnvironmentPatProvider", (): void => {
  afterEach((): void => {
    vi.unstubAllEnvs();
  });

  it("returns a PAT configured directly in ENRIAZURE_PAT", (): void => {
    vi.stubEnv("ENRIAZURE_PAT", "direct-test-token");
    const provider = new EnvironmentPatProvider();

    expect(provider.getToken()).toBe("direct-test-token");
  });

  it("resolves an exact environment variable reference", (): void => {
    vi.stubEnv("ENRIAZURE_PAT", "${AZURE_DEVOPS_SERVER_PAT}");
    vi.stubEnv("AZURE_DEVOPS_SERVER_PAT", "referenced-test-token");
    const provider = new EnvironmentPatProvider();

    expect(provider.getToken()).toBe("referenced-test-token");
  });

  it("reads the referenced environment variable for every request", (): void => {
    vi.stubEnv("ENRIAZURE_PAT", "${AZURE_DEVOPS_SERVER_PAT}");
    vi.stubEnv("AZURE_DEVOPS_SERVER_PAT", "first-test-token");
    const provider = new EnvironmentPatProvider();

    expect(provider.getToken()).toBe("first-test-token");

    vi.stubEnv("AZURE_DEVOPS_SERVER_PAT", "rotated-test-token");

    expect(provider.getToken()).toBe("rotated-test-token");
  });

  it("rejects an unset referenced environment variable without exposing a token", (): void => {
    vi.stubEnv("ENRIAZURE_PAT", "${MISSING_AZURE_DEVOPS_SERVER_PAT}");
    vi.stubEnv("MISSING_AZURE_DEVOPS_SERVER_PAT", "");
    const provider = new EnvironmentPatProvider();

    expect((): string => provider.getToken()).toThrow(
      "ENRIAZURE_PAT referencia MISSING_AZURE_DEVOPS_SERVER_PAT, pero esa variable de entorno no existe o está vacía.",
    );
  });
});
