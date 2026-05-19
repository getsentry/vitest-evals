import { next, rewrite } from "@vercel/functions";

export const config = {
  matcher: "/",
};

export default function middleware(request: Request) {
  if (request.method !== "GET") {
    return next();
  }

  const accept = request.headers.get("accept") || "";
  const types = accept
    .split(",")
    .map((type) => type.trim().split(";")[0].trim());
  const markdownIndex = types.findIndex(
    (type) => type === "text/markdown" || type === "text/x-markdown",
  );
  const htmlIndex = types.findIndex((type) => type === "text/html");

  if (markdownIndex !== -1 && (htmlIndex === -1 || markdownIndex < htmlIndex)) {
    return rewrite(new URL("/llms.txt", request.url));
  }

  return next();
}
