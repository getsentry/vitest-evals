import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  stripSearchParams,
} from "@tanstack/react-router";
import { App } from "./App";
import { validateReportSearch } from "./search";

const rootRoute = createRootRoute({
  component: Outlet,
});

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) =>
    validateReportSearch(search),
  search: {
    middlewares: [
      stripSearchParams({
        q: "",
        status: "all",
        run: "all",
        dir: "asc",
        tab: "overview",
      }),
    ],
  },
  component: App,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
  trailingSlash: "never",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
