import { afterEach, describe, expect, it, vi } from "vitest";
import type { PatProvider } from "../../src/application/ports/PatProvider.js";
import { OnPremisesServerUrl } from "../../src/domain/configuration/OnPremisesServerUrl.js";
import { FetchAzureDevOpsGateway } from "../../src/infrastructure/http/FetchAzureDevOpsGateway.js";

class TestPatProvider implements PatProvider {
  /** @inheritdoc */
  public getToken(): string {
    return "fake-test-token";
  }
}

describe("FetchAzureDevOpsGateway", (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it("sends Basic PAT auth to the configured server and parses continuation data", async (): Promise<void> => {
    const fetchMock = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >((): Promise<Response> => {
      return Promise.resolve(
        new Response(JSON.stringify({ count: 1, value: [{ name: "Enri" }] }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-ms-continuationtoken": "next-page",
          },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new FetchAzureDevOpsGateway(
      new OnPremisesServerUrl("https://ado.example.test/tfs"),
      new TestPatProvider(),
      {
        timeoutMs: 1_000,
        maxResponseBytes: 10_000,
        userAgent: "EnriAzure/Test",
      },
    );

    const response = await gateway.send({
      method: "GET",
      path: "/Enri/_apis/projects",
      query: { $top: 10 },
    });

    expect(response.headers.continuationToken).toBe("next-page");
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBeInstanceOf(URL);
    expect((input as URL).toString()).toBe(
      "https://ado.example.test/tfs/Enri/_apis/projects?%24top=10&api-version=7.1",
    );
    const authorization = new Headers(init?.headers).get("Authorization");
    expect(authorization).toBe(`Basic ${Buffer.from(":fake-test-token").toString("base64")}`);
  });

  it("uses an operation's exact preview version instead of the stable profile", async (): Promise<void> => {
    let requestedUrl: URL | undefined;
    const fetchMock = vi.fn((input: string | URL | Request): Promise<Response> => {
      requestedUrl =
        input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
      return Promise.resolve(
        new Response(JSON.stringify({ value: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new FetchAzureDevOpsGateway(
      new OnPremisesServerUrl("https://ado.example.test"),
      new TestPatProvider(),
      {
        timeoutMs: 1_000,
        maxResponseBytes: 10_000,
        userAgent: "EnriAzure/Test",
      },
    );

    await gateway.send({
      method: "GET",
      path: "/Collection/Project/_apis/wit/workitems",
      apiVersion: "7.1-preview.4",
    });

    expect(requestedUrl?.searchParams.get("api-version")).toBe("7.1-preview.4");
  });

  it("rejects responses beyond the configured byte limit", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn((): Promise<Response> =>
        Promise.resolve(
          new Response("response that is too large", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
        ),
      ),
    );
    const gateway = new FetchAzureDevOpsGateway(
      new OnPremisesServerUrl("https://ado.example.test"),
      new TestPatProvider(),
      {
        timeoutMs: 1_000,
        maxResponseBytes: 8,
        userAgent: "EnriAzure/Test",
      },
    );

    await expect(gateway.send({ method: "GET", path: "/_apis/projects" })).rejects.toThrow(
      "excedió el límite de una respuesta configurado por ENRIAZURE_MAX_RESPONSE_SIZE_MB",
    );
  });

  it("sends explicit binary bodies without JSON serialization", async (): Promise<void> => {
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        expect(new Headers(init?.headers).get("Content-Type")).toBe("application/octet-stream");
        expect(init?.body).toBeInstanceOf(Uint8Array);
        expect(Array.from(init?.body as Uint8Array)).toEqual([1, 2, 3]);
        return Promise.resolve(
          new Response(JSON.stringify({ id: "secure-file" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new FetchAzureDevOpsGateway(
      new OnPremisesServerUrl("https://ado.example.test"),
      new TestPatProvider(),
      {
        timeoutMs: 1_000,
        maxResponseBytes: 10_000,
        userAgent: "EnriAzure/Test",
      },
    );

    await gateway.send({
      method: "POST",
      path: "/Collection/App/_apis/distributedtask/securefiles",
      body: Uint8Array.from([1, 2, 3]),
      contentType: "application/octet-stream",
      ifMatch: '"entity-version"',
      headers: {
        "Content-Range": "bytes 0-2/3",
        continuationToken: "continuation",
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("If-Match")).toBe('"entity-version"');
    expect(headers.get("Content-Range")).toBe("bytes 0-2/3");
    expect(headers.get("continuationToken")).toBe("continuation");
  });

  it("returns documented binary responses as bounded base64 data", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn((): Promise<Response> =>
        Promise.resolve(
          new Response(Uint8Array.from([1, 2, 3]), {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          }),
        ),
      ),
    );
    const gateway = new FetchAzureDevOpsGateway(
      new OnPremisesServerUrl("https://ado.example.test"),
      new TestPatProvider(),
      {
        timeoutMs: 1_000,
        maxResponseBytes: 10_000,
        userAgent: "EnriAzure/Test",
      },
    );

    const response = await gateway.send({
      method: "GET",
      path: "/Collection/App/_apis/wit/attachments/attachment-id",
      accept: "application/octet-stream",
      responseMode: "base64",
    });

    expect(response.data).toEqual({
      encoding: "base64",
      byteLength: 3,
      content: "AQID",
    });
  });
});
