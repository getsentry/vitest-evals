import { readFile, stat } from "node:fs/promises";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReportWorkspace } from "@vitest-evals/core";
import { readReportWorkspace } from "@vitest-evals/core/node";
import { FALLBACK_PRICING, type ReportUiMeta } from "./app/pricing.js";
import type { RerunApiResult } from "./app/rerun.js";
import { currentModuleUrl } from "./esm-runtime.js";
import { loadPricingTable } from "./pricing-catalog.js";
import { findEvalConfig } from "./rerun-exec.js";
import { createRerunHub } from "./rerun-hub.js";

/** Options for serving a report UI from one or more JSON result inputs. */
export type ServeReportUiOptions = {
  inputs: string[];
  cwd?: string;
  workspace?: string;
  host?: string;
  port?: number;
  assetsDir?: string;
};

/** Options for serving a report UI from an already collected workspace. */
export type ServeReportWorkspaceOptions = {
  host?: string;
  port?: number;
  assetsDir?: string;
  workspaceRoot?: string;
  pricing?: ReportUiMeta["pricing"];
};

/** Handle returned by the local report UI server. */
export type ReportUiServer = {
  url: string;
  workspace: ReportWorkspace;
  resultFiles: string[];
  server: Server;
  close: () => Promise<void>;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 0;
const MAX_JSON_BODY_BYTES = 64 * 1024;
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** Collects JSON result inputs and serves the report UI. */
export async function serveReportUi(
  options: ServeReportUiOptions,
): Promise<ReportUiServer> {
  const { workspace, resultFiles } = await readReportWorkspace(options.inputs, {
    cwd: options.cwd,
    workspace: options.workspace,
  });

  return serveReportWorkspace(workspace, {
    assetsDir: options.assetsDir,
    host: options.host,
    port: options.port,
    pricing: await loadPricingTable(),
    resultFiles,
    workspaceRoot: resolve(options.workspace ?? options.cwd ?? process.cwd()),
  });
}

/** Serves the report UI for an already collected report workspace. */
export async function serveReportWorkspace(
  workspace: ReportWorkspace,
  options: ServeReportWorkspaceOptions & { resultFiles?: string[] } = {},
): Promise<ReportUiServer> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const assetsDir = resolve(options.assetsDir ?? defaultAssetsDir());
  const loopback = LOOPBACK_HOSTNAMES.has(host);
  const meta: ReportUiMeta = {
    pricing: options.pricing ?? FALLBACK_PRICING,
    workspaceRoot: options.workspaceRoot,
    evalConfig: options.workspaceRoot
      ? await findEvalConfig(options.workspaceRoot)
      : undefined,
    rerunEnabled: loopback && Boolean(options.workspaceRoot),
  };
  const handler = createRequestHandler(workspace, assetsDir, meta, {
    loopback,
    resultFiles: options.resultFiles ?? [],
  });
  const server = createServer(handler.handle);

  await listen(server, port, host);

  return {
    url: serverUrl(server, host),
    workspace,
    resultFiles: options.resultFiles ?? [],
    server,
    close: async () => {
      handler.close();
      await close(server);
    },
  };
}

function createRequestHandler(
  workspace: ReportWorkspace,
  assetsDir: string,
  meta: ReportUiMeta,
  options: { loopback: boolean; resultFiles: string[] },
) {
  let currentWorkspace = workspace;
  const hub = createRerunHub({
    resultFiles: options.resultFiles,
    getWorkspace: () => currentWorkspace,
    setWorkspace: (next) => {
      currentWorkspace = next;
    },
    workspaceRoot: meta.workspaceRoot,
  });

  return {
    close: () => hub.close(),
    handle: async (request: IncomingMessage, response: ServerResponse) => {
      try {
        const requestUrl = new URL(
          request.url ?? "/",
          `http://${request.headers.host ?? "localhost"}`,
        );

        // A page on another site must not read the report through a
        // rebound DNS name pointing at this loopback server.
        if (options.loopback && !isLoopbackHostHeader(request.headers.host)) {
          sendText(response, 403, "Forbidden\n", "text/plain; charset=utf-8");
          return;
        }

        const action = API_ACTIONS[requestUrl.pathname];
        if (action) {
          const rejection = rejectApiRequest(request, meta);
          if (rejection) {
            sendJson(
              response,
              { ok: false, error: rejection.error },
              rejection.status,
            );
            return;
          }
          let body: unknown;
          try {
            body = await readJsonBody(request);
          } catch (error) {
            const tooLarge = error instanceof BodyTooLargeError;
            sendJson(
              response,
              {
                ok: false,
                error: tooLarge ? "Body too large" : "Invalid JSON",
              },
              tooLarge ? 413 : 400,
            );
            return;
          }
          const result = await action(hub, body);
          sendJson(response, result, result.status);
          return;
        }

        if (requestUrl.pathname === "/api/events") {
          hub.subscribe(response);
          return;
        }

        if (requestUrl.pathname === "/data/workspace.json") {
          sendJson(response, currentWorkspace);
          return;
        }

        if (requestUrl.pathname === "/data/meta.json") {
          sendJson(response, meta);
          return;
        }

        if (requestUrl.pathname === "/healthz") {
          sendText(response, 200, "ok\n", "text/plain; charset=utf-8");
          return;
        }

        await serveAsset(requestUrl.pathname, assetsDir, response);
      } catch (error) {
        sendInternalServerError(response, error);
      }
    },
  };
}

type RerunHub = ReturnType<typeof createRerunHub>;

const API_ACTIONS: Record<
  string,
  (hub: RerunHub, body: unknown) => Promise<RerunApiResult> | RerunApiResult
> = {
  "/api/rerun": (hub, body) => hub.startJob(body),
  "/api/rerun/cancel": (hub, body) => hub.cancelJob(body),
  "/api/reload": (hub) => hub.reloadDump(),
};

/**
 * Guards the endpoints that start processes. Requiring a JSON content type
 * forces a CORS preflight for cross-site pages, and the Origin check rejects
 * the rest, so only the report's own page can trigger a re-run.
 */
function rejectApiRequest(
  request: IncomingMessage,
  meta: ReportUiMeta,
): { status: number; error: string } | undefined {
  if (request.method !== "POST") {
    return { status: 405, error: "Method not allowed" };
  }
  if (!meta.rerunEnabled) {
    return {
      status: 403,
      error:
        "Re-run is only available when the report serves on localhost with a workspace root.",
    };
  }
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { status: 415, error: "Expected application/json" };
  }
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== `http://${request.headers.host}`) {
    return { status: 403, error: "Cross-origin request rejected" };
  }
  return undefined;
}

function isLoopbackHostHeader(hostHeader: string | undefined) {
  if (!hostHeader) {
    return false;
  }
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
}

class BodyTooLargeError extends Error {}

function sendInternalServerError(response: ServerResponse, error: unknown) {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }

  sendText(
    response,
    500,
    "Internal server error\n",
    "text/plain; charset=utf-8",
  );
}

async function serveAsset(
  pathname: string,
  assetsDir: string,
  response: ServerResponse,
) {
  const assetPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolveAssetPath(assetsDir, assetPath);
  if (!filePath) {
    sendText(response, 403, "Forbidden\n", "text/plain; charset=utf-8");
    return;
  }

  if (await isFile(filePath)) {
    await sendFile(response, filePath);
    return;
  }

  const fallbackPath = resolveAssetPath(assetsDir, "index.html");
  if (fallbackPath && (await isFile(fallbackPath))) {
    await sendFile(response, fallbackPath);
    return;
  }

  sendText(response, 404, "Not found\n", "text/plain; charset=utf-8");
}

function resolveAssetPath(assetsDir: string, assetPath: string) {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(assetPath);
  } catch {
    return undefined;
  }

  const resolved = resolve(assetsDir, decodedPath);
  if (resolved !== assetsDir && !resolved.startsWith(`${assetsDir}${sep}`)) {
    return undefined;
  }
  return resolved;
}

async function sendFile(response: ServerResponse, filePath: string) {
  const body = await readFile(filePath);
  response.writeHead(200, {
    "Cache-Control": cacheControlFor(filePath),
    "Content-Length": body.byteLength,
    "Content-Type": contentTypeFor(filePath),
  });
  response.end(body);
}

function sendJson(response: ServerResponse, value: unknown, statusCode = 200) {
  const body = `${JSON.stringify(value)}\n`;
  sendText(response, statusCode, body, "application/json; charset=utf-8");
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<unknown>((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_JSON_BODY_BYTES) {
        // Keep draining so the 413 reaches the client before the socket ends.
        rejectBody(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > MAX_JSON_BODY_BYTES) {
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolveBody(undefined);
        return;
      }
      try {
        resolveBody(JSON.parse(raw) as unknown);
      } catch (error) {
        rejectBody(error);
      }
    });
    request.on("error", rejectBody);
  });
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  body: string,
  contentType: string,
) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": contentType,
  });
  response.end(body);
}

async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function listen(server: Server, port: number, host: string) {
  return new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function close(server: Server) {
  return new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}

function serverUrl(server: Server, host: string) {
  const address = server.address();
  if (!address || typeof address === "string") {
    return `http://${host}`;
  }

  const displayHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return `http://${displayHost}:${address.port}`;
}

function contentTypeFor(filePath: string) {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}

function cacheControlFor(filePath: string) {
  return extname(filePath) === ".html"
    ? "no-store"
    : "public, max-age=31536000, immutable";
}

function defaultAssetsDir() {
  return resolve(dirname(fileURLToPath(currentModuleUrl())), "client");
}
