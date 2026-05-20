export const monochromeCodeTheme = {
  name: "vitest-evals-monochrome",
  displayName: "vitest-evals monochrome",
  type: "dark",
  semanticHighlighting: true,
  colors: {
    "editor.background": "#000000",
    "editor.foreground": "#f5f5f5",
    "editor.lineHighlightBackground": "#111111",
    "editor.selectionBackground": "#303030",
    "editorLineNumber.activeForeground": "#fafafa",
    "editorLineNumber.foreground": "#777777",
    "editorGroupHeader.tabsBackground": "#000000",
    "editorGroupHeader.tabsBorder": "#000000",
    focusBorder: "#ffffff",
    "menu.selectionBackground": "#222222",
    "menu.selectionForeground": "#ffffff",
    "scrollbarSlider.background": "#3a3a3a80",
    "scrollbarSlider.hoverBackground": "#62626299",
    "tab.activeBackground": "#000000",
    "tab.activeBorder": "#ffffff",
    "tab.activeForeground": "#fafafa",
    "tab.border": "#000000",
    "titleBar.activeBackground": "#000000",
    "titleBar.activeForeground": "#fafafa",
    "titleBar.border": "#000000",
  },
  tokenColors: [
    {
      name: "Default",
      settings: {
        foreground: "#f5f5f5",
      },
    },
    {
      name: "Comments",
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: {
        foreground: "#8a8a8a",
        fontStyle: "italic",
      },
    },
    {
      name: "Punctuation",
      scope: ["punctuation", "meta.brace", "meta.delimiter"],
      settings: {
        foreground: "#cfcfcf",
      },
    },
    {
      name: "Keywords",
      scope: [
        "keyword",
        "storage",
        "storage.type",
        "constant.language",
        "support.type.primitive",
      ],
      settings: {
        foreground: "#ffffff",
        fontStyle: "bold",
      },
    },
    {
      name: "Strings",
      scope: ["string", "constant.other.symbol", "markup.inline.raw"],
      settings: {
        foreground: "#ffd166",
      },
    },
    {
      name: "Numbers and constants",
      scope: [
        "constant.numeric",
        "constant.character",
        "variable.other.constant",
      ],
      settings: {
        foreground: "#ffb86c",
      },
    },
    {
      name: "Functions",
      scope: ["entity.name.function", "support.function", "meta.function-call"],
      settings: {
        foreground: "#9ae6b4",
      },
    },
    {
      name: "Types and classes",
      scope: [
        "entity.name.type",
        "entity.name.class",
        "entity.name.interface",
        "support.class",
        "support.type",
      ],
      settings: {
        foreground: "#f8f8f8",
        fontStyle: "bold",
      },
    },
    {
      name: "Variables and properties",
      scope: [
        "variable",
        "variable.parameter",
        "variable.other.property",
        "support.variable.property",
        "meta.object-literal.key",
      ],
      settings: {
        foreground: "#e8e8e8",
      },
    },
    {
      name: "Markup",
      scope: ["entity.name.tag", "markup.heading", "markup.bold"],
      settings: {
        foreground: "#ffffff",
      },
    },
    {
      name: "Inserted",
      scope: ["markup.inserted", "meta.diff.header.to-file"],
      settings: {
        foreground: "#9ae6b4",
      },
    },
    {
      name: "Deleted",
      scope: ["markup.deleted", "meta.diff.header.from-file"],
      settings: {
        foreground: "#ff9a9a",
      },
    },
  ],
};

export function vitestEvalsStarlightTheme() {
  return {
    name: "vitest-evals-starlight-theme",
    hooks: {
      "config:setup"({ config, updateConfig }) {
        const expressiveCode =
          typeof config.expressiveCode === "object" &&
          config.expressiveCode !== null
            ? config.expressiveCode
            : {};

        updateConfig({
          customCss: [
            ...new Set([
              ...(config.customCss ?? []),
              "./src/theme/vitest-evals-starlight.css",
            ]),
          ],
          expressiveCode: {
            ...expressiveCode,
            emitExternalStylesheet: false,
            minSyntaxHighlightingColorContrast: 7,
            themes: [monochromeCodeTheme],
            useStarlightDarkModeSwitch: false,
            useStarlightUiThemeColors: false,
            useThemedScrollbars: false,
            styleOverrides: {
              ...expressiveCode.styleOverrides,
              borderColor: "transparent",
              borderRadius: "8px",
              borderWidth: "0px",
              codeBackground: "#111111",
              codeForeground: "#f5f5f5",
              codeFontFamily: "var(--__sl-font-mono)",
              codeFontSize: "var(--sl-text-code)",
              codeLineHeight: "1.65",
              codePaddingBlock: "0.9rem",
              codePaddingInline: "1rem",
              focusBorder: "#ffffff",
              gutterBorderColor: "var(--ve-line)",
              gutterForeground: "var(--ve-text-tertiary)",
              gutterHighlightForeground: "var(--ve-text)",
              scrollbarThumbColor: "#3a3a3a",
              scrollbarThumbHoverColor: "#626262",
              uiFontFamily: "var(--__sl-font)",
              uiFontSize: "0.82rem",
              uiLineHeight: "1.4",
              uiPaddingBlock: "0.35rem",
              uiPaddingInline: "0.75rem",
              frames: {
                ...expressiveCode.styleOverrides?.frames,
                editorActiveTabBackground: "#000000",
                editorActiveTabBorderColor: "transparent",
                editorActiveTabIndicatorBottomColor: "transparent",
                editorActiveTabIndicatorHeight: "0px",
                editorActiveTabIndicatorTopColor: "transparent",
                editorBackground: "#111111",
                editorTabBarBackground: "#000000",
                editorTabBarBorderBottomColor: "transparent",
                editorTabBarBorderColor: "transparent",
                frameBoxShadowCssValue: "none",
                inlineButtonBackground: "transparent",
                inlineButtonBorder: "transparent",
                inlineButtonForeground: "var(--ve-text-secondary)",
                terminalBackground: "#111111",
                terminalTitlebarBackground: "#111111",
                terminalTitlebarBorderBottomColor: "transparent",
              },
            },
          },
        });
      },
    },
  };
}
