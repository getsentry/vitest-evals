import mdx from "@astrojs/mdx";
import starlight from "@astrojs/starlight";
import sentryStarlightTheme, {
  monochromeCodeTheme,
} from "@sentry/starlight-theme";
import { defineConfig } from "astro/config";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

export default defineConfig({
  site: "https://vitest-evals.sentry.dev",
  devToolbar: {
    enabled: false,
  },
  integrations: [
    starlight({
      title: "vitest-evals",
      description: "Harness-backed AI testing on top of Vitest.",
      pagination: false,
      sidebar: [
        {
          label: "Documentation",
          items: [
            { label: "Overview", link: "/docs" },
            { label: "Agent Skill", link: "/docs/agent-skill" },
            {
              label: "Harnesses",
              items: [
                { label: "Overview", link: "/docs/harnesses" },
                { label: "AI SDK", link: "/docs/harnesses/ai-sdk" },
                {
                  label: "OpenAI Agents",
                  link: "/docs/harnesses/openai-agents",
                },
                { label: "Pi", link: "/docs/harnesses/pi-ai" },
                {
                  label: "Custom Harnesses",
                  link: "/docs/harnesses/custom",
                },
              ],
            },
            {
              label: "Judges",
              items: [
                { label: "Overview", link: "/docs/judges" },
                { label: "FactualityJudge", link: "/docs/judges/factuality" },
                { label: "ToolCallJudge", link: "/docs/judges/tool-call" },
                {
                  label: "StructuredOutputJudge",
                  link: "/docs/judges/structured-output",
                },
                { label: "Custom Judges", link: "/docs/judges/custom" },
              ],
            },
            { label: "Tool Replay", link: "/docs/tool-replay" },
            { label: "GitHub Reporting", link: "/docs/github" },
          ],
        },
        {
          label: "API Reference",
          items: [{ label: "Overview", link: "/api" }, typeDocSidebarGroup],
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/getsentry/vitest-evals",
        },
      ],
      plugins: [
        sentryStarlightTheme(),
        starlightTypeDoc({
          entryPoints: ["../vitest-evals/src/index.ts"],
          tsconfig: "../vitest-evals/tsconfig.json",
          output: "api",
          pagination: false,
          sidebar: {
            label: "Exports",
          },
          typeDoc: {
            disableSources: true,
            entryPointStrategy: "resolve",
            intentionallyNotExported: [
              "OutputField",
              "JudgeAssertionArgs",
              "JudgeAssertionHarness",
              "JudgeAssertionInput",
              "JudgeAssertionMetadata",
              "JudgeAssertionOutput",
              "JudgeAssertionParams",
              "JudgeForReceived",
              "HarnessInput",
              "HarnessMetadataFor",
              "HarnessOutput",
            ],
          },
        }),
      ],
    }),
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      theme: monochromeCodeTheme,
    },
  },
});
