# @vitest-evals/http

HTTP interception and replay helpers for `vitest-evals`.

## Install

```sh
npm install -D vitest-evals @vitest-evals/http
```

## Usage

```ts
import {
  createHttpFixtureInterceptor,
  createHttpInterceptor,
  createHttpReplayInterceptor,
  httpFixture,
  unhandledHttpResponse,
} from "@vitest-evals/http";

export const interceptHttp = createHttpInterceptor(
  [
    createHttpFixtureInterceptor([
      httpFixture.get("/health", Response.json({ ok: true })),
      httpFixture.post(
        {
          hostname: "api.github.com",
          pathname: "/graphql",
        },
        async (input) =>
          Response.json({
            data: {
              request: await input.request.json(),
              viewer: { login: "eval-user" },
            },
          }),
      ),
    ]),
    createHttpReplayInterceptor({
      name: "sandbox-egress",
      replay: true,
    }),
  ],
  {
    unhandled: unhandledHttpResponse,
  },
);
```

Use this package when eval traffic leaves the process through HTTP instead of a
local tool wrapper. It shares the same replay modes, cache keys, versions, and
sanitization model as tool replay.

Compose direct fixtures before replay when some endpoints should always use
hand-authored responses and the rest should record/replay.

For Vercel Sandbox forwarded egress traffic, use
`@vitest-evals/http-vercel-sandbox` with this package.
