import { readFile, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReportWorkspace } from "@vitest-evals/core";
import { readReportWorkspace } from "@vitest-evals/core/node";
import { currentModuleUrl } from "./esm-runtime.js";

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
    resultFiles,
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
  const server = createServer(createRequestHandler(workspace, assetsDir));

  await listen(server, port, host);

  return {
    url: serverUrl(server, host),
    workspace,
    resultFiles: options.resultFiles ?? [],
    server,
    close: () => close(server),
  };
}

function createRequestHandler(workspace: ReportWorkspace, assetsDir: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const requestUrl = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "localhost"}`,
      );

      if (requestUrl.pathname === "/data/workspace.json") {
        sendJson(response, workspace);
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
  };
}

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

function sendJson(response: ServerResponse, value: unknown) {
  const body = `${JSON.stringify(value)}\n`;
  sendText(response, 200, body, "application/json; charset=utf-8");
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
