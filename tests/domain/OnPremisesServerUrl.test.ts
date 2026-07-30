import { describe, expect, it } from "vitest";
import { OnPremisesServerUrl } from "../../src/domain/configuration/OnPremisesServerUrl.js";

describe("OnPremisesServerUrl", (): void => {
  it.each([
    "http://ado.example.test",
    "https://ado.example.test",
    "http://ado-server.example.test:8080/tfs",
    "http://localhost:8080/tfs",
  ])("accepts an absolute on-premises HTTP(S) root: %s", (value: string): void => {
    expect(new OnPremisesServerUrl(value).toString()).toBe(value);
  });

  it("preserves an on-premises instance prefix while resolving requests", (): void => {
    const serverUrl = new OnPremisesServerUrl("https://ado.example.test/tfs/");

    expect(serverUrl.toString()).toBe("https://ado.example.test/tfs");
    expect(serverUrl.resolve("/DefaultCollection/_apis/projects").toString()).toBe(
      "https://ado.example.test/tfs/DefaultCollection/_apis/projects",
    );
  });

  it.each([
    "https://dev.azure.com/example",
    "https://example.visualstudio.com",
    "https://vsrm.dev.azure.com/example",
    "https://management.azure.com",
  ])("rejects Microsoft-hosted cloud URL %s", (value: string): void => {
    expect((): OnPremisesServerUrl => new OnPremisesServerUrl(value)).toThrow(
      "sólo admite Azure DevOps Server",
    );
  });

  it("rejects credentials and traversal", (): void => {
    expect(
      (): OnPremisesServerUrl => new OnPremisesServerUrl("https://user:password@ado.example.test"),
    ).toThrow("no debe contener credenciales");

    const serverUrl = new OnPremisesServerUrl("https://ado.example.test");
    expect((): URL => serverUrl.resolve("/_apis/../secret")).toThrow(
      "no deben navegar al directorio padre",
    );
  });
});
