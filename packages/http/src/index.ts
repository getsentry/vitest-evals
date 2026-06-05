import { Buffer } from "node:buffer";
import type { JsonValue } from "vitest-evals";
import {
  executeWithReplay,
  getReplayMetadataFromError,
  type ReplayMetadata,
  type ToolRecording,
  type ToolReplayConfig,
} from "vitest-evals/replay";

type MaybePromise<T> = T | Promise<T>;

const HTTP_REPLAY_RESPONSE_METADATA = "vitestEvalsReplay";

/** Header names redacted from HTTP replay recordings by default. */
export const DEFAULT_HTTP_REPLAY_REDACTED_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-csrf-token",
  "x-xsrf-token",
] as const;

/** HTTP request observed by a proxy, browser route, fetch shim, or sandbox engine. */
export interface HttpInterceptRequest {
  /** Engine-specific request normalized into the Fetch API shape. */
  request: Request;
  /** Original upstream URL the system under test attempted to call. */
  upstreamUrl: URL;
  /** Optional provider label such as `github`, `sentry`, or `slack`. */
  provider?: string;
  /** Optional engine label such as `vercel-sandbox`, `docker`, or `msw`. */
  engine?: string;
  /** Extra JSON-safe metadata recorded with HTTP replay cassettes. */
  metadata?: Record<string, JsonValue | undefined>;
}

/** HTTP interceptor that may return a mocked/replayed response or pass through. */
export type HttpInterceptor = (
  input: HttpInterceptRequest,
) => MaybePromise<Response | undefined>;

/** Options for composing several HTTP interceptors into one handler. */
export interface CreateHttpInterceptorOptions {
  /** Optional handler invoked when no interceptor returned a response. */
  unhandled?: HttpInterceptor;
}

/** Options for creating a deterministic unhandled HTTP response. */
export interface UnhandledHttpResponseOptions {
  /** HTTP status used for the unhandled response. Defaults to `599`. */
  status?: number;
}

/** Static or dynamic response returned by a direct HTTP fixture. */
export type HttpFixtureResponse =
  | Response
  | ((input: HttpInterceptRequest) => MaybePromise<Response>);

/** Direct HTTP fixture used for deterministic request-specific injection. */
export interface HttpFixture {
  /** Optional human-readable fixture name for test diagnostics. */
  name?: string;
  /** Return whether this fixture should handle the intercepted request. */
  match: (input: HttpInterceptRequest) => MaybePromise<boolean>;
  /** Static response or callback response returned when `match` succeeds. */
  response: HttpFixtureResponse;
}

/** String, URL, regex, callback, or object matcher for direct HTTP fixtures. */
export type HttpFixtureRoute =
  | string
  | URL
  | RegExp
  | ((input: HttpInterceptRequest) => MaybePromise<boolean>)
  | {
      /** Full URL matcher. */
      url?: string | URL | RegExp;
      /** Hostname matcher such as `api.github.com`. */
      hostname?: string | RegExp;
      /** Pathname matcher without query string. */
      pathname?: string | RegExp;
      /** Path plus query-string matcher. */
      path?: string | RegExp;
      /** Provider label matcher. */
      provider?: string | RegExp;
      /** Engine label matcher. */
      engine?: string | RegExp;
    };

/** Options for route-style direct HTTP fixtures. */
export interface HttpFixtureRouteOptions {
  /** Optional human-readable fixture name for test diagnostics. */
  name?: string;
}

/** Recorded HTTP body representation stored in JSON replay cassettes. */
export type SerializedHttpBody =
  | {
      /** Body is stored as UTF-8 text for reviewable fixtures. */
      encoding: "utf8";
      /** Encoded body content. */
      value: string;
    }
  | {
      /** Body is stored as base64 when it does not look text-like. */
      encoding: "base64";
      /** Encoded body content. */
      value: string;
    };

/** Recorded HTTP header map stored in JSON replay cassettes. */
export type SerializedHttpHeaders = Record<string, string>;

/** JSON-serializable HTTP request stored as replay input. */
export type SerializedHttpRequest = {
  /** HTTP method used for the upstream request. */
  method: string;
  /** Absolute upstream URL called by the system under test. */
  url: string;
  /** Request headers after engine normalization and default redaction. */
  headers: SerializedHttpHeaders;
  /** Optional buffered request body. */
  body?: SerializedHttpBody;
};

/** JSON-serializable HTTP response stored as replay output. */
export type SerializedHttpResponse = {
  /** HTTP status code returned by the upstream service or fixture. */
  status: number;
  /** HTTP status text returned by the upstream service when available. */
  statusText?: string;
  /** Response headers after default redaction. */
  headers: SerializedHttpHeaders;
  /** Optional buffered response body. */
  body?: SerializedHttpBody;
};

/** Replay context passed to HTTP cache-key and live-fetch callbacks. */
export interface HttpReplayContext<TContext = undefined> {
  /** Original upstream URL the system under test attempted to call. */
  upstreamUrl: URL;
  /** Optional provider label such as `github`, `sentry`, or `slack`. */
  provider?: string;
  /** Optional engine label such as `vercel-sandbox`, `docker`, or `msw`. */
  engine?: string;
  /** Extra JSON-safe metadata supplied by the engine adapter. */
  metadata?: Record<string, JsonValue | undefined>;
  /** Caller-provided context for adapter-specific state. */
  context: TContext;
}

/** HTTP replay recording shape stored by `executeHttpWithReplay(...)`. */
export type HttpRecording = ToolRecording<
  SerializedHttpRequest,
  SerializedHttpResponse
>;

/** HTTP replay configuration for keying and sanitizing request/response cassettes. */
export interface HttpReplayConfig<TContext = undefined>
  extends ToolReplayConfig<
    SerializedHttpRequest,
    SerializedHttpResponse,
    HttpReplayContext<TContext>
  > {
  /** Header names redacted after `sanitize`; use `false` to preserve headers exactly. */
  redactHeaders?: readonly string[] | false;
}

/** HTTP replay policy accepted by replay-enabled HTTP primitives. */
export type HttpReplayPolicy<TContext = undefined> =
  | boolean
  | HttpReplayConfig<TContext>;

/** Live HTTP fetch function used when replay records a cache miss. */
export type HttpFetch<TContext = undefined> = (
  request: Request,
  context: HttpReplayContext<TContext>,
) => MaybePromise<Response>;

/** Options for executing one HTTP request through replay-aware fetching. */
export interface ExecuteHttpWithReplayOptions<TContext = undefined> {
  /** Stable cassette namespace. Defaults to `http`. */
  name?: string;
  /** Intercepted HTTP request details from the engine adapter. */
  input: HttpInterceptRequest;
  /** Live fetch implementation used when replay does not return a recording. */
  fetch?: HttpFetch<TContext>;
  /** Replay policy. `true` uses the default request key and redaction rules. */
  replay?: HttpReplayPolicy<TContext>;
  /** Caller-provided context forwarded to key, sanitize, and fetch callbacks. */
  context?: TContext;
}

/** Result of executing one HTTP request through replay-aware fetching. */
export interface HttpReplayExecution {
  /** HTTP response returned from a recording or live fetch. */
  response: Response;
  /** Replay metadata when a cassette was recorded or replayed. */
  replay?: ReplayMetadata;
}

/** Options for creating an interceptor that records or replays HTTP traffic. */
export interface CreateHttpReplayInterceptorOptions<TContext = undefined> {
  /** Stable cassette namespace. Defaults to `http`. */
  name?: string;
  /** Live fetch implementation used when replay does not return a recording. */
  fetch?: HttpFetch<TContext>;
  /** Replay policy. Defaults to `true` because creating this interceptor opts in. */
  replay?: HttpReplayPolicy<TContext>;
  /** Caller-provided context forwarded to replay and fetch callbacks. */
  context?: TContext;
}

/** Compose HTTP interceptors, returning the first response produced. */
export function createHttpInterceptor(
  interceptors: readonly HttpInterceptor[],
  options: CreateHttpInterceptorOptions = {},
): HttpInterceptor {
  return async (input) => {
    for (const interceptor of interceptors) {
      const response = await interceptor(cloneHttpInterceptRequest(input));
      if (response) {
        return response;
      }
    }

    return await options.unhandled?.(cloneHttpInterceptRequest(input));
  };
}

/** Create a direct HTTP fixture with route-style matching. */
export function createHttpFixture(
  method: string | undefined,
  route: HttpFixtureRoute,
  response: HttpFixtureResponse,
  options: HttpFixtureRouteOptions = {},
): HttpFixture {
  return {
    name: options.name,
    match: async (input) => {
      if (
        method &&
        input.request.method.toUpperCase() !== method.toUpperCase()
      ) {
        return false;
      }
      return await matchesHttpFixtureRoute(route, input);
    },
    response,
  };
}

/** Route-style helpers for direct HTTP fixtures. */
export const httpFixture = {
  /** Match any HTTP method for a route. */
  all: (
    route: HttpFixtureRoute,
    response: HttpFixtureResponse,
    options?: HttpFixtureRouteOptions,
  ) => createHttpFixture(undefined, route, response, options),
  /** Match `DELETE` requests for a route. */
  delete: (
    route: HttpFixtureRoute,
    response: HttpFixtureResponse,
    options?: HttpFixtureRouteOptions,
  ) => createHttpFixture("DELETE", route, response, options),
  /** Match `GET` requests for a route. */
  get: (
    route: HttpFixtureRoute,
    response: HttpFixtureResponse,
    options?: HttpFixtureRouteOptions,
  ) => createHttpFixture("GET", route, response, options),
  /** Match `PATCH` requests for a route. */
  patch: (
    route: HttpFixtureRoute,
    response: HttpFixtureResponse,
    options?: HttpFixtureRouteOptions,
  ) => createHttpFixture("PATCH", route, response, options),
  /** Match `POST` requests for a route. */
  post: (
    route: HttpFixtureRoute,
    response: HttpFixtureResponse,
    options?: HttpFixtureRouteOptions,
  ) => createHttpFixture("POST", route, response, options),
  /** Match `PUT` requests for a route. */
  put: (
    route: HttpFixtureRoute,
    response: HttpFixtureResponse,
    options?: HttpFixtureRouteOptions,
  ) => createHttpFixture("PUT", route, response, options),
} as const;

/** Create an interceptor from direct request/response fixtures. */
export function createHttpFixtureInterceptor(
  fixtures: readonly HttpFixture[],
): HttpInterceptor {
  return async (input) => {
    for (const fixture of fixtures) {
      const fixtureInput = cloneHttpInterceptRequest(input);
      if (!(await fixture.match(fixtureInput))) {
        continue;
      }

      const responseInput = cloneHttpInterceptRequest(input);
      return typeof fixture.response === "function"
        ? await fixture.response(responseInput)
        : fixture.response.clone();
    }

    return undefined;
  };
}

async function matchesHttpFixtureRoute(
  route: HttpFixtureRoute,
  input: HttpInterceptRequest,
): Promise<boolean> {
  if (typeof route === "function") {
    return await route(input);
  }

  if (typeof route === "string") {
    return matchRouteString(route, input.upstreamUrl);
  }

  if (route instanceof URL) {
    return input.upstreamUrl.toString() === route.toString();
  }

  if (route instanceof RegExp) {
    return route.test(input.upstreamUrl.toString());
  }

  return (
    matchOptionalRoutePart(route.url, input.upstreamUrl.toString()) &&
    matchOptionalRoutePart(route.hostname, input.upstreamUrl.hostname) &&
    matchOptionalRoutePart(route.pathname, input.upstreamUrl.pathname) &&
    matchOptionalRoutePart(
      route.path,
      `${input.upstreamUrl.pathname}${input.upstreamUrl.search}`,
    ) &&
    matchOptionalRoutePart(route.provider, input.provider ?? "") &&
    matchOptionalRoutePart(route.engine, input.engine ?? "")
  );
}

function matchRouteString(route: string, upstreamUrl: URL): boolean {
  if (route.startsWith("http://") || route.startsWith("https://")) {
    return upstreamUrl.toString() === route;
  }

  if (route.startsWith("/")) {
    const path = `${upstreamUrl.pathname}${upstreamUrl.search}`;
    return route.includes("?")
      ? path === route
      : upstreamUrl.pathname === route;
  }

  return upstreamUrl.hostname === route;
}

function matchOptionalRoutePart(
  matcher: string | URL | RegExp | undefined,
  value: string,
): boolean {
  if (matcher === undefined) {
    return true;
  }

  if (matcher instanceof URL) {
    return value === matcher.toString();
  }

  if (matcher instanceof RegExp) {
    return matcher.test(value);
  }

  return value === matcher;
}

/** Create a deterministic error response for unhandled intercepted HTTP traffic. */
export function unhandledHttpResponse(
  input: HttpInterceptRequest,
  options: UnhandledHttpResponseOptions = {},
): Response {
  return new Response(
    `[HTTP INTERCEPT] Unhandled external request: ${input.request.method} ${input.upstreamUrl.toString()}\n`,
    {
      status: options.status ?? 599,
      headers: { "content-type": "text/plain; charset=utf-8" },
    },
  );
}

/** Execute an HTTP request using existing replay modes and cassette storage. */
export async function executeHttpWithReplay<TContext = undefined>({
  name = "http",
  input,
  fetch,
  replay,
  context,
}: ExecuteHttpWithReplayOptions<TContext>): Promise<HttpReplayExecution> {
  const serializedRequest = await serializeHttpRequest(input);
  const replayContext = createHttpReplayContext(input, context as TContext);
  const execution = await executeWithReplay<
    SerializedHttpRequest,
    SerializedHttpResponse,
    HttpReplayContext<TContext>
  >({
    toolName: name,
    args: serializedRequest,
    context: replayContext,
    execute: async (request, replayContext) => {
      const response = await (fetch ?? defaultHttpFetch)(
        deserializeHttpRequest(request),
        replayContext,
      );
      return await serializeHttpResponse(response);
    },
    replay: normalizeHttpReplayPolicy(replay),
    metadata: httpRecordingMetadata(input),
  });
  const response = deserializeHttpResponse(execution.result);

  if (execution.replay) {
    attachHttpReplayMetadata(response, execution.replay);
  }

  return {
    response,
    replay: execution.replay,
  };
}

/** Create an HTTP interceptor that records misses and replays existing cassettes. */
export function createHttpReplayInterceptor<TContext = undefined>(
  options: CreateHttpReplayInterceptorOptions<TContext> = {},
): HttpInterceptor {
  return async (input) => {
    const execution = await executeHttpWithReplay({
      name: options.name,
      input,
      fetch: options.fetch,
      replay: options.replay ?? true,
      context: options.context,
    });
    return execution.response;
  };
}

/** Read replay metadata attached to a response returned by HTTP replay helpers. */
export function getReplayMetadataFromHttpResponse(
  response: Response,
): ReplayMetadata | undefined {
  return getReplayMetadataFromError(response);
}

/** Redact sensitive request and response headers from an HTTP replay recording. */
export function redactHttpRecordingHeaders(
  recording: HttpRecording,
  headers: readonly string[] = DEFAULT_HTTP_REPLAY_REDACTED_HEADERS,
): HttpRecording {
  return {
    ...recording,
    input: {
      ...recording.input,
      headers: redactHeaders(recording.input.headers, headers),
    },
    ...(recording.output
      ? {
          output: {
            ...recording.output,
            headers: redactHeaders(recording.output.headers, headers),
          },
        }
      : {}),
  };
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

async function defaultHttpFetch<TContext>(
  request: Request,
  _context: HttpReplayContext<TContext>,
) {
  return await fetch(request);
}

function createHttpReplayContext<TContext>(
  input: HttpInterceptRequest,
  context: TContext,
): HttpReplayContext<TContext> {
  return {
    upstreamUrl: new URL(input.upstreamUrl.toString()),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.engine ? { engine: input.engine } : {}),
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    context,
  };
}

function httpRecordingMetadata(
  input: HttpInterceptRequest,
): Record<string, JsonValue | undefined> {
  return {
    kind: "http",
    provider: input.provider,
    engine: input.engine,
    ...(input.metadata ?? {}),
  };
}

function normalizeHttpReplayPolicy<TContext>(
  replay: HttpReplayPolicy<TContext> | undefined,
): HttpReplayPolicy<TContext> | undefined {
  if (!replay) {
    return replay;
  }

  const config = replay === true ? {} : replay;

  return {
    ...config,
    key: config.key ?? defaultHttpReplayKey,
    sanitize: async (recording) => {
      const sanitized = config.sanitize
        ? await config.sanitize(recording)
        : recording;
      return config.redactHeaders === false
        ? sanitized
        : redactHttpRecordingHeaders(
            sanitized,
            config.redactHeaders ?? DEFAULT_HTTP_REPLAY_REDACTED_HEADERS,
          );
    },
  };
}

function defaultHttpReplayKey(request: SerializedHttpRequest): JsonValue {
  return {
    method: request.method,
    url: request.url,
    body: request.body ?? null,
  };
}

async function serializeHttpRequest(
  input: HttpInterceptRequest,
): Promise<SerializedHttpRequest> {
  return {
    method: input.request.method.toUpperCase(),
    url: input.upstreamUrl.toString(),
    headers: serializeHeaders(input.request.headers),
    ...(await serializedRequestBody(input.request)),
  };
}

async function serializeHttpResponse(
  response: Response,
): Promise<SerializedHttpResponse> {
  return {
    status: response.status,
    ...(response.statusText ? { statusText: response.statusText } : {}),
    headers: serializeHeaders(response.headers),
    ...(await serializedResponseBody(response)),
  };
}

function serializeHeaders(headers: Headers): SerializedHttpHeaders {
  const record: SerializedHttpHeaders = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

async function serializedRequestBody(
  request: Request,
): Promise<Pick<SerializedHttpRequest, "body">> {
  if (
    request.body === null ||
    request.method.toUpperCase() === "GET" ||
    request.method.toUpperCase() === "HEAD"
  ) {
    return {};
  }

  return {
    body: serializeBody(
      await request.clone().arrayBuffer(),
      request.headers.get("content-type"),
    ),
  };
}

async function serializedResponseBody(
  response: Response,
): Promise<Pick<SerializedHttpResponse, "body">> {
  if (response.body === null) {
    return {};
  }

  return {
    body: serializeBody(
      await response.clone().arrayBuffer(),
      response.headers.get("content-type"),
    ),
  };
}

function serializeBody(
  body: ArrayBuffer,
  contentType: string | null,
): SerializedHttpBody {
  const bytes = new Uint8Array(body);
  if (isTextLikeContentType(contentType)) {
    return {
      encoding: "utf8",
      value: new TextDecoder().decode(bytes),
    };
  }

  return {
    encoding: "base64",
    value: Buffer.from(bytes).toString("base64"),
  };
}

function isTextLikeContentType(contentType: string | null): boolean {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized === "application/graphql" ||
    normalized === "application/javascript" ||
    normalized === "application/x-www-form-urlencoded" ||
    normalized.endsWith("+json") ||
    normalized.endsWith("+xml")
  );
}

function deserializeHttpRequest(request: SerializedHttpRequest): Request {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body && request.method !== "GET" && request.method !== "HEAD"
      ? { body: deserializeBody(request.body) }
      : {}),
  });
}

function deserializeHttpResponse(response: SerializedHttpResponse): Response {
  return new Response(
    response.body ? deserializeBody(response.body) : undefined,
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    },
  );
}

function deserializeBody(body: SerializedHttpBody): Uint8Array {
  if (body.encoding === "base64") {
    return Buffer.from(body.value, "base64");
  }

  return new TextEncoder().encode(body.value);
}

function redactHeaders(
  headers: SerializedHttpHeaders,
  redactedHeaders: readonly string[],
): SerializedHttpHeaders {
  const redacted = new Set(
    redactedHeaders.map((header) => header.toLowerCase()),
  );
  const next: SerializedHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    next[key] = redacted.has(key.toLowerCase()) ? "[redacted]" : value;
  }
  return next;
}

function attachHttpReplayMetadata(
  response: Response,
  replay: ReplayMetadata,
): void {
  Object.assign(response, {
    [HTTP_REPLAY_RESPONSE_METADATA]: replay,
  });
}
