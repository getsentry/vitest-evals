# @vitest-evals/http-vercel-sandbox

Vercel Sandbox HTTP adapter for `@vitest-evals/http`.

## Install

```sh
npm install -D vitest-evals @vitest-evals/http @vitest-evals/http-vercel-sandbox
```

## Usage

```ts
import {
  createHttpInterceptor,
  createHttpReplayInterceptor,
  httpFixture,
} from "@vitest-evals/http";
import { proxyVercelSandboxHttp } from "@vitest-evals/http-vercel-sandbox";

const interceptHttp = createHttpInterceptor([
  createHttpReplayInterceptor({
    name: "sandbox-egress",
    replay: true,
  }),
]);

export async function ALL(request: Request): Promise<Response> {
  return await proxyVercelSandboxHttp(request, {
    fixtures: [
      httpFixture.get("/health", Response.json({ ok: true })),
    ],
    interceptHttp,
    provider: ({ upstreamUrl }) => providerForHost(upstreamUrl.hostname),
    headers: ({ provider, upstreamUrl }) =>
      credentialHeadersFor(provider, upstreamUrl),
  });
}
```

This package reconstructs Vercel Sandbox forwarded requests into the generic
`HttpInterceptRequest` shape. Your app remains responsible for OIDC
verification, requester authorization, and credential policy.

Direct `fixtures` run before `interceptHttp`, so Vercel Sandbox evals can mix
hand-authored responses with record/replay fallback.
