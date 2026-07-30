import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentConfiguration } from "../../src/infrastructure/configuration/EnvironmentConfiguration.js";
import type { EnriAzureConfiguration } from "../../src/infrastructure/configuration/EnvironmentConfiguration.js";

describe("EnvironmentConfiguration", (): void => {
  afterEach((): void => {
    vi.unstubAllEnvs();
  });

  it("uses a three-minute timeout and 64-megabyte response limit by default", (): void => {
    vi.stubEnv("ENRIAZURE_SERVER_URL", "https://ado.example.test");

    const configuration: EnriAzureConfiguration = new EnvironmentConfiguration().load();

    expect(configuration.requestTimeoutMs).toBe(180_000);
    expect(configuration.maxResponseBytes).toBe(67_108_864);
  });

  it("converts configured seconds and megabytes to internal units", (): void => {
    vi.stubEnv("ENRIAZURE_SERVER_URL", "https://ado.example.test");
    vi.stubEnv("ENRIAZURE_REQUEST_TIMEOUT_SECONDS", "45");
    vi.stubEnv("ENRIAZURE_MAX_RESPONSE_SIZE_MB", "4");

    const configuration: EnriAzureConfiguration = new EnvironmentConfiguration().load();

    expect(configuration.requestTimeoutMs).toBe(45_000);
    expect(configuration.maxResponseBytes).toBe(4_194_304);
  });

  it.each([
    ["ENRIAZURE_REQUEST_TIMEOUT_SECONDS", "0"],
    ["ENRIAZURE_REQUEST_TIMEOUT_SECONDS", "1.5"],
    ["ENRIAZURE_MAX_RESPONSE_SIZE_MB", "-1"],
    ["ENRIAZURE_MAX_RESPONSE_SIZE_MB", "1.5"],
  ])("rejects invalid positive whole-number value %s=%s", (name: string, value: string): void => {
    vi.stubEnv("ENRIAZURE_SERVER_URL", "https://ado.example.test");
    vi.stubEnv(name, value);

    expect((): EnriAzureConfiguration => new EnvironmentConfiguration().load()).toThrow(
      `${name} debe ser un entero positivo seguro.`,
    );
  });

  it("rejects a configured value whose internal conversion is unsafe", (): void => {
    vi.stubEnv("ENRIAZURE_SERVER_URL", "https://ado.example.test");
    vi.stubEnv("ENRIAZURE_MAX_RESPONSE_SIZE_MB", Number.MAX_SAFE_INTEGER.toString());

    expect((): EnriAzureConfiguration => new EnvironmentConfiguration().load()).toThrow(
      "ENRIAZURE_MAX_RESPONSE_SIZE_MB es demasiado grande.",
    );
  });
});
