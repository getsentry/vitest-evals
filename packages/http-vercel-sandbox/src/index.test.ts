import { createHttpInterceptor } from "@vitest-evals/http";
import { expect, test, vi } from "vitest";
import {
  createVercelSandboxHttpInterceptRequest,
  createVercelSandboxUpstreamUrl,
  interceptVercelSandboxHttp,
  isVercelSandboxForwardedRequest,
  proxyVercelSandboxHttp,
  VERCEL_FORWARDED_HOST_HEADER,
  VERCEL_FORWARDED_PATH_HEADER,
  VERCEL_FORWARDED_PORT_HEADER,
  VERCEL_FORWARDED_SCHEME_HEADER,
  VERCEL_SANDBOX_OIDC_TOKEN_HEADER,
  VercelSandboxForwardedRequestError,
} from "./index";

function forwardedRequest(
  options: {
    body?: BodyInit;
    headers?: Record<string, string>;
    method?: string;
    path?: string;
  } = {},
) {
  return new Request("https://app.example.test/api/internal/sandbox-egress", {
    method: options.method ?? (options.body ? "POST" : "GET"),
    ...(options.body ? { body: options.body } : {}),
    headers: {
      [VERCEL_FORWARDED_HOST_HEADER]: "API.Example.Test",
      [VERCEL_FORWARDED_SCHEME_HEADER]: "https",
      [VERCEL_FORWARDED_PATH_HEADER]: options.path ?? "/v1/search?q=first",
      [VERCEL_SANDBOX_OIDC_TOKEN_HEADER]: "signed-vercel-token",
      "content-type": "application/json",
      connection: "keep-alive",
      host: "app.example.test",
      ...(options.headers ?? {}),
    },
  });
}

test("detects Vercel Sandbox forwarded requests", () => {
  expect(isVercelSandboxForwardedRequest(forwardedRequest())).toBe(true);
  expect(
    isVercelSandboxForwardedRequest(new Request("https://example.test")),
  ).toBe(false);
});

test("creates upstream URLs from Vercel forwarded headers", () => {
  const request = forwardedRequest({
    headers: {
      [VERCEL_FORWARDED_PORT_HEADER]: "8443",
    },
    path: "/v1/repos?query=first",
  });

  expect(createVercelSandboxUpstreamUrl(request).toString()).toBe(
    "https://api.example.test:8443/v1/repos?query=first",
  );
});

test("rejects unsafe forwarded paths", () => {
  expect(() =>
    createVercelSandboxUpstreamUrl(forwardedRequest({ path: "//evil.test" })),
  ).toThrow(VercelSandboxForwardedRequestError);
});

test("normalizes Vercel Sandbox requests into generic HTTP intercept requests", async () => {
  const input = await createVercelSandboxHttpInterceptRequest(
    forwardedRequest({
      body: JSON.stringify({ query: "first" }),
    }),
    {
      provider: ({ upstreamUrl }) =>
        upstreamUrl.hostname === "api.example.test" ? "example" : undefined,
      headers: ({ headers, provider }) => {
        expect(headers.get("content-type")).toBe("application/json");
        expect(headers.get(VERCEL_SANDBOX_OIDC_TOKEN_HEADER)).toBeNull();
        return {
          authorization: `Bearer ${provider}-token`,
        };
      },
      metadata: {
        scenario: "search",
      },
    },
  );

  expect(input.engine).toBe("vercel-sandbox");
  expect(input.provider).toBe("example");
  expect(input.upstreamUrl.toString()).toBe(
    "https://api.example.test/v1/search?q=first",
  );
  expect(input.metadata).toMatchObject({
    "vercel.forwarded_host": "api.example.test",
    "vercel.forwarded_path": "/v1/search?q=first",
    scenario: "search",
  });
  expect(input.request.headers.get("authorization")).toBe(
    "Bearer example-token",
  );
  expect(
    input.request.headers.get(VERCEL_SANDBOX_OIDC_TOKEN_HEADER),
  ).toBeNull();
  expect(input.request.headers.get("connection")).toBeNull();
  await expect(input.request.json()).resolves.toEqual({ query: "first" });
});

test("routes Vercel Sandbox requests through HTTP interceptors", async () => {
  const interceptHttp = createHttpInterceptor([
    async (input) => {
      expect(input.engine).toBe("vercel-sandbox");
      return Response.json({ ok: true });
    },
  ]);

  const response = await interceptVercelSandboxHttp(forwardedRequest(), {
    interceptHttp,
    provider: "example",
  });

  expect(response?.status).toBe(200);
  await expect(response?.json()).resolves.toEqual({ ok: true });
});

test("routes Vercel Sandbox requests through direct fixtures", async () => {
  const response = await interceptVercelSandboxHttp(forwardedRequest(), {
    provider: "example",
    fixtures: [
      {
        name: "search",
        match: (input) =>
          input.provider === "example" &&
          input.upstreamUrl.pathname === "/v1/search",
        response: Response.json({ fixture: true }),
      },
    ],
  });

  expect(response?.status).toBe(200);
  await expect(response?.json()).resolves.toEqual({ fixture: true });
});

test("checks direct fixtures before fallback interceptors", async () => {
  const interceptHttp = vi.fn(async () => Response.json({ replay: true }));

  const response = await interceptVercelSandboxHttp(forwardedRequest(), {
    interceptHttp,
    fixtures: [
      {
        match: () => true,
        response: Response.json({ fixture: true }),
      },
    ],
  });

  await expect(response?.json()).resolves.toEqual({ fixture: true });
  expect(interceptHttp).not.toHaveBeenCalled();
});

test("proxies Vercel Sandbox requests to live fetch when no interceptor handles them", async () => {
  const fetchHttp = vi.fn(async (request: Request) => {
    expect(request.url).toBe("https://api.example.test/v1/search?q=first");
    return new Response("live", {
      status: 203,
      headers: {
        "content-length": "4",
        "x-request-id": "req_123",
      },
    });
  });

  const response = await proxyVercelSandboxHttp(forwardedRequest(), {
    interceptHttp: async () => undefined,
    fetch: fetchHttp as typeof fetch,
  });

  expect(response.status).toBe(203);
  expect(response.headers.get("content-length")).toBeNull();
  expect(response.headers.get("x-request-id")).toBe("req_123");
  await expect(response.text()).resolves.toBe("live");
  expect(fetchHttp).toHaveBeenCalledTimes(1);
});
