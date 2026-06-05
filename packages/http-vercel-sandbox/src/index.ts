import {
  createHttpFixtureInterceptor,
  type HttpFixture,
  type HttpInterceptRequest,
  type HttpInterceptor,
} from "@vitest-evals/http";

type MaybePromise<T> = T | Promise<T>;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const DECODED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
]);

/** Header Vercel Sandbox sends with the upstream target host. */
export const VERCEL_FORWARDED_HOST_HEADER = "vercel-forwarded-host";

/** Header Vercel Sandbox sends with the upstream target scheme. */
export const VERCEL_FORWARDED_SCHEME_HEADER = "vercel-forwarded-scheme";

/** Header Vercel Sandbox sends with the upstream target port when present. */
export const VERCEL_FORWARDED_PORT_HEADER = "vercel-forwarded-port";

/** Header Vercel Sandbox sends with the upstream target path and query. */
export const VERCEL_FORWARDED_PATH_HEADER = "vercel-forwarded-path";

/** Header Vercel Sandbox sends with the sandbox OIDC token. */
export const VERCEL_SANDBOX_OIDC_TOKEN_HEADER = "vercel-sandbox-oidc-token";

/** Headers used only by Vercel's forwarding layer, not the upstream request. */
export const VERCEL_SANDBOX_PROXY_HEADERS = [
  VERCEL_FORWARDED_HOST_HEADER,
  VERCEL_FORWARDED_SCHEME_HEADER,
  VERCEL_FORWARDED_PORT_HEADER,
  VERCEL_FORWARDED_PATH_HEADER,
  VERCEL_SANDBOX_OIDC_TOKEN_HEADER,
] as const;

type AdapterContext = {
  request: Request;
  upstreamUrl: URL;
  provider?: string;
  headers: Headers;
};

/** Provider label or resolver for a Vercel Sandbox upstream request. */
export type VercelSandboxHttpProvider =
  | string
  | ((input: {
      request: Request;
      upstreamUrl: URL;
    }) => MaybePromise<string | undefined>);

/** Header overrides or resolver for a Vercel Sandbox upstream request. */
export type VercelSandboxHttpHeaders =
  | HeadersInit
  | ((input: AdapterContext) => MaybePromise<HeadersInit | undefined>);

/** Metadata or resolver attached to the generic HTTP intercept request. */
export type VercelSandboxHttpMetadata =
  | Record<string, string | number | boolean | null | undefined>
  | ((
      input: AdapterContext,
    ) => MaybePromise<
      Record<string, string | number | boolean | null | undefined> | undefined
    >);

/** Options for adapting Vercel Sandbox forwarded requests to HTTP intercepts. */
export interface CreateVercelSandboxHttpInterceptRequestOptions {
  /** Provider label used by fixtures and recordings. */
  provider?: VercelSandboxHttpProvider;
  /** Headers to set after copied proxy headers are stripped. */
  headers?: VercelSandboxHttpHeaders;
  /** Extra metadata attached to HTTP recordings. */
  metadata?: VercelSandboxHttpMetadata;
}

/** Shared options for routing a Vercel Sandbox request through HTTP fixtures/interceptors. */
export interface VercelSandboxHttpRoutingOptions
  extends CreateVercelSandboxHttpInterceptRequestOptions {
  /** Direct request/response fixtures checked before `interceptHttp`. */
  fixtures?: readonly HttpFixture[];
  /** HTTP interceptor chain created by `@vitest-evals/http`. */
  interceptHttp?: HttpInterceptor;
}

/** Options for routing a Vercel Sandbox forwarded request through interceptors. */
export interface InterceptVercelSandboxHttpOptions
  extends VercelSandboxHttpRoutingOptions {}

/** Options for proxying a Vercel Sandbox request with live-fetch fallback. */
export interface ProxyVercelSandboxHttpOptions
  extends VercelSandboxHttpRoutingOptions {
  /** Live fetch implementation used when no interceptor handles the request. */
  fetch?: typeof fetch;
}

/** Error thrown when Vercel forwarded headers cannot form a safe upstream URL. */
export class VercelSandboxForwardedRequestError extends Error {
  /** HTTP status code suitable for a proxy handler response. */
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "VercelSandboxForwardedRequestError";
    this.status = status;
  }
}

/** Return whether a request carries Vercel Sandbox forwarded HTTP headers. */
export function isVercelSandboxForwardedRequest(request: Request): boolean {
  return Boolean(
    request.headers.get(VERCEL_SANDBOX_OIDC_TOKEN_HEADER)?.trim() &&
      request.headers.get(VERCEL_FORWARDED_HOST_HEADER)?.trim() &&
      request.headers.get(VERCEL_FORWARDED_SCHEME_HEADER)?.trim() &&
      request.headers.get(VERCEL_FORWARDED_PATH_HEADER)?.trim(),
  );
}

/** Convert a Vercel Sandbox forwarded request into a generic HTTP intercept request. */
export async function createVercelSandboxHttpInterceptRequest(
  request: Request,
  options: CreateVercelSandboxHttpInterceptRequestOptions = {},
): Promise<HttpInterceptRequest> {
  const upstreamUrl = createVercelSandboxUpstreamUrl(request);
  const provider = await resolveProvider(options.provider, {
    request,
    upstreamUrl,
  });
  const baseHeaders = copyRequestHeaders(request);
  const adapterContext = {
    request,
    upstreamUrl,
    provider,
    headers: new Headers(baseHeaders),
  };
  const overrides = await resolveHeaders(options.headers, adapterContext);
  if (overrides) {
    new Headers(overrides).forEach((value, key) => {
      baseHeaders.set(key, value);
    });
  }
  const body = await requestBodyBytes(request);
  const metadata = await resolveMetadata(options.metadata, adapterContext);

  return {
    request: new Request(upstreamUrl, {
      method: request.method,
      headers: baseHeaders,
      ...(body ? { body } : {}),
    }),
    upstreamUrl,
    engine: "vercel-sandbox",
    ...(provider ? { provider } : {}),
    metadata: {
      "vercel.forwarded_host": upstreamUrl.hostname,
      "vercel.forwarded_path": `${upstreamUrl.pathname}${upstreamUrl.search}`,
      ...(metadata ?? {}),
    },
  };
}

/** Route a Vercel Sandbox forwarded request through an HTTP interceptor chain. */
export async function interceptVercelSandboxHttp(
  request: Request,
  options: InterceptVercelSandboxHttpOptions,
): Promise<Response | undefined> {
  return await interceptVercelSandboxInput(
    await createVercelSandboxHttpInterceptRequest(request, options),
    options,
  );
}

/** Proxy a Vercel Sandbox forwarded request through interceptors before live fetch. */
export async function proxyVercelSandboxHttp(
  request: Request,
  options: ProxyVercelSandboxHttpOptions = {},
): Promise<Response> {
  const input = await createVercelSandboxHttpInterceptRequest(request, options);
  const intercepted = await interceptVercelSandboxInput(input, options);
  if (intercepted) {
    return intercepted;
  }

  const upstream = await (options.fetch ?? fetch)(input.request);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders(upstream),
  });
}

async function interceptVercelSandboxInput(
  input: HttpInterceptRequest,
  options: VercelSandboxHttpRoutingOptions,
): Promise<Response | undefined> {
  if (options.fixtures) {
    const response = await createHttpFixtureInterceptor(options.fixtures)(
      cloneHttpInterceptRequest(input),
    );
    if (response) {
      return response;
    }
  }

  return await options.interceptHttp?.(cloneHttpInterceptRequest(input));
}

function cloneHttpInterceptRequest(
  input: HttpInterceptRequest,
): HttpInterceptRequest {
  return {
    request: input.request.clone(),
    upstreamUrl: new URL(input.upstreamUrl.toString()),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.engine ? { engine: input.engine } : {}),
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
  };
}

/** Create the upstream URL carried by Vercel Sandbox forwarding headers. */
export function createVercelSandboxUpstreamUrl(request: Request): URL {
  const forwardedHost = requiredHeader(request, VERCEL_FORWARDED_HOST_HEADER);
  const host = normalizeHost(forwardedHost);
  if (!host) {
    throw new VercelSandboxForwardedRequestError("Invalid forwarded host");
  }

  const forwardedScheme = requiredHeader(
    request,
    VERCEL_FORWARDED_SCHEME_HEADER,
  );
  const scheme = normalizeScheme(forwardedScheme);
  if (!scheme) {
    throw new VercelSandboxForwardedRequestError(
      "Forwarded scheme must be https",
    );
  }

  const forwardedPort = request.headers.get(VERCEL_FORWARDED_PORT_HEADER);
  const port = normalizePort(forwardedPort);
  if (forwardedPort && !port) {
    throw new VercelSandboxForwardedRequestError("Invalid forwarded port");
  }

  const path = normalizeForwardedPath(
    requiredHeader(request, VERCEL_FORWARDED_PATH_HEADER),
  );

  return new URL(`${scheme}://${host}${port ? `:${port}` : ""}${path}`);
}

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value) {
    throw new VercelSandboxForwardedRequestError(`Missing ${name}`);
  }
  return value;
}

function normalizeHost(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (
    !trimmed ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes(":")
  ) {
    return undefined;
  }
  return trimmed.replace(/\.$/, "");
}

function normalizeScheme(value: string): "https" | undefined {
  return value.trim().toLowerCase() === "https" ? "https" : undefined;
}

function normalizePort(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!/^\d{1,5}$/.test(trimmed)) {
    return undefined;
  }

  const port = Number.parseInt(trimmed, 10);
  return port >= 1 && port <= 65_535 ? trimmed : undefined;
}

function normalizeForwardedPath(value: string): string {
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("#") ||
    /[\r\n]/.test(trimmed)
  ) {
    throw new VercelSandboxForwardedRequestError("Invalid forwarded path");
  }

  try {
    const url = new URL(trimmed, "https://vitest-evals-forwarded.local");
    return `${url.pathname}${url.search}`;
  } catch {
    throw new VercelSandboxForwardedRequestError("Invalid forwarded path");
  }
}

function copyRequestHeaders(request: Request): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(normalized) ||
      VERCEL_SANDBOX_PROXY_HEADERS.includes(
        normalized as (typeof VERCEL_SANDBOX_PROXY_HEADERS)[number],
      )
    ) {
      return;
    }
    headers.append(key, value);
  });
  return headers;
}

async function requestBodyBytes(
  request: Request,
): Promise<ArrayBuffer | undefined> {
  if (
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.body === null
  ) {
    return undefined;
  }
  return await request.clone().arrayBuffer();
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (
      !HOP_BY_HOP_HEADERS.has(normalized) &&
      !DECODED_RESPONSE_HEADERS.has(normalized)
    ) {
      headers.append(key, value);
    }
  });
  return headers;
}

async function resolveProvider(
  provider: VercelSandboxHttpProvider | undefined,
  input: { request: Request; upstreamUrl: URL },
): Promise<string | undefined> {
  if (typeof provider === "function") {
    return await provider(input);
  }
  return provider;
}

async function resolveHeaders(
  headers: VercelSandboxHttpHeaders | undefined,
  input: AdapterContext,
): Promise<HeadersInit | undefined> {
  if (typeof headers === "function") {
    return await headers(input);
  }
  return headers;
}

async function resolveMetadata(
  metadata: VercelSandboxHttpMetadata | undefined,
  input: AdapterContext,
): Promise<Record<string, string | number | boolean | null> | undefined> {
  const resolved =
    typeof metadata === "function" ? await metadata(input) : metadata;
  if (!resolved) {
    return undefined;
  }

  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return normalized;
}
