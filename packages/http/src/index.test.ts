import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  createHttpFixtureInterceptor,
  createHttpInterceptor,
  createHttpReplayInterceptor,
  executeHttpWithReplay,
  getReplayMetadataFromHttpResponse,
  httpFixture,
  unhandledHttpResponse,
  type HttpInterceptRequest,
  type HttpRecording,
} from "./index";

let replayDir: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (replayDir) {
    rmSync(replayDir, { recursive: true, force: true });
    replayDir = undefined;
  }
});

function httpInput() {
  const upstreamUrl = new URL("https://api.example.test/v1/search?q=first");
  return {
    provider: "example",
    engine: "unit-test",
    upstreamUrl,
    request: new Request(upstreamUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "first" }),
    }),
    metadata: {
      scenario: "search",
    },
  };
}

test("composes HTTP interceptors and gives each one a fresh request clone", async () => {
  const first = vi.fn(async (input: HttpInterceptRequest) => {
    await input.request.text();
    return undefined;
  });
  const second = vi.fn(async (input: HttpInterceptRequest) => {
    return Response.json({
      provider: input.provider,
      body: await input.request.json(),
    });
  });
  const interceptHttp = createHttpInterceptor([first, second], {
    unhandled: unhandledHttpResponse,
  });

  const response = await interceptHttp(httpInput());

  expect(response?.status).toBe(200);
  await expect(response?.json()).resolves.toEqual({
    provider: "example",
    body: { query: "first" },
  });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
});

test("returns a deterministic response for unhandled HTTP traffic", async () => {
  const response = unhandledHttpResponse(httpInput());

  expect(response.status).toBe(599);
  await expect(response.text()).resolves.toContain(
    "POST https://api.example.test/v1/search?q=first",
  );
});

test("creates interceptors from direct HTTP fixtures", async () => {
  const fixture = createHttpFixtureInterceptor([
    {
      name: "user",
      match: (input) =>
        input.request.method === "POST" &&
        input.upstreamUrl.hostname === "api.example.test",
      response: async (input) =>
        Response.json({
          provider: input.provider,
          body: await input.request.json(),
        }),
    },
  ]);

  const response = await fixture(httpInput());

  expect(response?.status).toBe(200);
  await expect(response?.json()).resolves.toEqual({
    provider: "example",
    body: { query: "first" },
  });
});

test("supports route-style direct HTTP fixtures", async () => {
  const fixture = createHttpFixtureInterceptor([
    httpFixture.get("/v1/search", Response.json({ method: "get" })),
    httpFixture.post(
      {
        hostname: "api.example.test",
        pathname: "/v1/search",
        provider: "example",
      },
      async (input) =>
        Response.json({
          method: "post",
          body: await input.request.json(),
        }),
    ),
  ]);

  await expect(
    (
      await fixture({
        ...httpInput(),
        request: new Request("https://api.example.test/v1/search?q=first"),
      })
    )?.json(),
  ).resolves.toEqual({ method: "get" });
  await expect((await fixture(httpInput()))?.json()).resolves.toEqual({
    method: "post",
    body: { query: "first" },
  });
});

test("supports host and regex direct HTTP fixture routes", async () => {
  const fixture = createHttpFixtureInterceptor([
    httpFixture.get("api.example.test", Response.json({ host: true })),
    httpFixture.all(/other\.example\.test\/v1/, Response.json({ regex: true })),
  ]);

  await expect(
    (
      await fixture({
        ...httpInput(),
        request: new Request("https://api.example.test/anything"),
        upstreamUrl: new URL("https://api.example.test/anything"),
      })
    )?.json(),
  ).resolves.toEqual({ host: true });
  await expect(
    (
      await fixture({
        ...httpInput(),
        request: new Request("https://other.example.test/v1/user"),
        upstreamUrl: new URL("https://other.example.test/v1/user"),
      })
    )?.json(),
  ).resolves.toEqual({ regex: true });
});

test("clones static direct fixture responses", async () => {
  const fixture = createHttpFixtureInterceptor([
    {
      match: () => true,
      response: Response.json({ ok: true }),
    },
  ]);

  await expect((await fixture(httpInput()))?.json()).resolves.toEqual({
    ok: true,
  });
  await expect((await fixture(httpInput()))?.json()).resolves.toEqual({
    ok: true,
  });
});

test("records and replays HTTP requests with redacted headers", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-http-replay-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const fetchHttp = vi.fn(async (request: Request) => {
    await expect(request.json()).resolves.toEqual({ query: "first" });
    return Response.json(
      { ok: true },
      {
        status: 202,
        headers: {
          "set-cookie": "session=secret",
          "x-request-id": "req_123",
        },
      },
    );
  });

  const first = await executeHttpWithReplay({
    name: "http.example",
    input: httpInput(),
    fetch: fetchHttp,
    replay: true,
  });

  expect(first.response.status).toBe(202);
  await expect(first.response.json()).resolves.toEqual({ ok: true });
  expect(first.replay).toMatchObject({ status: "recorded" });
  expect(getReplayMetadataFromHttpResponse(first.response)).toMatchObject({
    status: "recorded",
  });

  const recordingPath = first.replay?.recordingPath;
  expect(recordingPath).toBeTruthy();
  expect(existsSync(join(process.cwd(), recordingPath ?? ""))).toBe(true);
  const recording = JSON.parse(
    readFileSync(join(process.cwd(), recordingPath ?? ""), "utf8"),
  ) as HttpRecording;

  expect(recording.input).toMatchObject({
    method: "POST",
    url: "https://api.example.test/v1/search?q=first",
    headers: {
      authorization: "[redacted]",
      "content-type": "application/json",
    },
    body: {
      encoding: "utf8",
      value: JSON.stringify({ query: "first" }),
    },
  });
  expect(recording.output?.headers).toMatchObject({
    "set-cookie": "[redacted]",
    "x-request-id": "req_123",
  });
  expect(recording.metadata).toMatchObject({
    kind: "http",
    provider: "example",
    engine: "unit-test",
    scenario: "search",
  });

  fetchHttp.mockImplementationOnce(async () => {
    throw new Error("HTTP should replay from cassette");
  });

  const second = await executeHttpWithReplay({
    name: "http.example",
    input: httpInput(),
    fetch: fetchHttp,
    replay: true,
  });

  expect(second.replay).toMatchObject({ status: "replayed" });
  expect(second.response.status).toBe(202);
  await expect(second.response.json()).resolves.toEqual({ ok: true });
  expect(fetchHttp).toHaveBeenCalledTimes(1);
});

test("lets HTTP replay customize header redaction", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-http-redaction-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const first = await executeHttpWithReplay({
    name: "http.headers",
    input: httpInput(),
    fetch: async () =>
      new Response("ok", {
        headers: {
          "set-cookie": "session=test",
          "x-request-id": "req_456",
        },
      }),
    replay: {
      redactHeaders: ["authorization"],
    },
  });

  const recording = JSON.parse(
    readFileSync(
      join(process.cwd(), first.replay?.recordingPath ?? ""),
      "utf8",
    ),
  ) as HttpRecording;

  expect(recording.input.headers.authorization).toBe("[redacted]");
  expect(recording.output?.headers["set-cookie"]).toBe("session=test");
});

test("creates replay-backed HTTP interceptors", async () => {
  replayDir = mkdtempSync(join(process.cwd(), ".tmp-http-interceptor-"));
  vi.stubEnv("VITEST_EVALS_REPLAY_DIR", replayDir);

  const fetchHttp = vi.fn(async () => {
    return Response.json({ ok: true });
  });
  const interceptHttp = createHttpReplayInterceptor({
    name: "http.interceptor",
    fetch: fetchHttp,
  });

  const first = await interceptHttp(httpInput());
  const second = await interceptHttp(httpInput());

  expect(first?.status).toBe(200);
  expect(second?.status).toBe(200);
  expect(getReplayMetadataFromHttpResponse(first as Response)).toMatchObject({
    status: "recorded",
  });
  expect(getReplayMetadataFromHttpResponse(second as Response)).toMatchObject({
    status: "replayed",
  });
  expect(fetchHttp).toHaveBeenCalledTimes(1);
});
