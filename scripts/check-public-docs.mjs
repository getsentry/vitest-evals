#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const packagesDir = join(root, "packages");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function packageSourceEntrypoints(packageJson) {
  const entries = [];

  function visit(value) {
    if (!value) {
      return;
    }

    if (typeof value === "string") {
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    if (typeof value.source === "string") {
      entries.push(value.source);
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  }

  visit(packageJson.exports);
  return [...new Set(entries)];
}

function resolveSourceModule(fromFile, specifier) {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];

  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

function parseSource(path) {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function collectPublicSources(entrypoints) {
  const seen = new Set();
  const queue = [...entrypoints];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || seen.has(file) || /\.test\.[cm]?tsx?$/.test(file)) {
      continue;
    }

    seen.add(file);
    const source = parseSource(file);

    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) {
        continue;
      }

      const moduleText = statement.moduleSpecifier.text;
      if (typeof moduleText !== "string") {
        continue;
      }

      const target = resolveSourceModule(file, moduleText);
      if (target) {
        queue.push(target);
      }
    }
  }

  return [...seen].sort();
}

function isExported(node) {
  return Boolean(
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ),
  );
}

function jsDocText(node) {
  return (node.jsDoc ?? [])
    .map((doc) => {
      const comment =
        typeof doc.comment === "string"
          ? doc.comment
          : Array.isArray(doc.comment)
            ? doc.comment.map((part) => part.text).join("")
            : "";
      const tags = doc.tags ? [...doc.tags].map((tag) => tag.getText()) : [];
      return [comment, ...tags].join(" ").trim();
    })
    .join(" ")
    .trim();
}

function hasUsableJsDoc(node) {
  return jsDocText(node).length >= 10;
}

function symbolName(name) {
  return name ? name.getText() : "<anonymous>";
}

function addExportedDeclaration(symbols, file, node, name, docNode = node) {
  const key = `${file}:${name}`;
  const existing = symbols.get(key);
  const documented = hasUsableJsDoc(docNode);

  if (existing) {
    existing.documented ||= documented;
    existing.line = Math.min(existing.line, lineOf(file, node));
    return;
  }

  symbols.set(key, {
    file,
    line: lineOf(file, node),
    name,
    documented,
  });
}

function lineOf(file, node) {
  const source = sourceByFile.get(file);
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

const sourceByFile = new Map();

function collectExportedSymbols(files) {
  const symbols = new Map();

  for (const file of files) {
    const source = parseSource(file);
    sourceByFile.set(file, source);

    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
        addExportedDeclaration(
          symbols,
          file,
          statement,
          symbolName(statement.name),
        );
      } else if (ts.isClassDeclaration(statement) && isExported(statement)) {
        addExportedDeclaration(
          symbols,
          file,
          statement,
          symbolName(statement.name),
        );
      } else if (
        ts.isInterfaceDeclaration(statement) &&
        isExported(statement)
      ) {
        addExportedDeclaration(
          symbols,
          file,
          statement,
          symbolName(statement.name),
        );
      } else if (
        ts.isTypeAliasDeclaration(statement) &&
        isExported(statement)
      ) {
        addExportedDeclaration(
          symbols,
          file,
          statement,
          symbolName(statement.name),
        );
      } else if (ts.isEnumDeclaration(statement) && isExported(statement)) {
        addExportedDeclaration(
          symbols,
          file,
          statement,
          symbolName(statement.name),
        );
      } else if (ts.isVariableStatement(statement) && isExported(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          addExportedDeclaration(
            symbols,
            file,
            declaration,
            symbolName(declaration.name),
            statement,
          );
        }
      }
    }
  }

  return [...symbols.values()].sort((left, right) =>
    left.file === right.file
      ? left.line - right.line
      : left.file.localeCompare(right.file),
  );
}

const packageEntrypoints = [];

for (const packageName of readdirSync(packagesDir)) {
  const packagePath = join(packagesDir, packageName);
  const packageJsonPath = join(packagePath, "package.json");
  if (!existsSync(packageJsonPath)) {
    continue;
  }

  const packageJson = readJson(packageJsonPath);
  for (const source of packageSourceEntrypoints(packageJson)) {
    packageEntrypoints.push(resolve(packagePath, source));
  }
}

const publicSources = collectPublicSources(packageEntrypoints);
const undocumented = collectExportedSymbols(publicSources).filter(
  (symbol) => !symbol.documented,
);

function directMdxFiles(dir) {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile() && path.endsWith(".mdx"));
}

function frontmatterFor(contents) {
  const match = contents.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    return undefined;
  }

  return match[1];
}

function hasFrontmatterField(frontmatter, field) {
  return new RegExp(`^${field}:\\s*.+$`, "m").test(frontmatter);
}

function hasFalseFrontmatterField(frontmatter, field) {
  return new RegExp(`^${field}:\\s*false\\s*$`, "m").test(frontmatter);
}

function markdownHeadings(contents) {
  return [...contents.matchAll(/^##\s+(.+)$/gm)].map((match) =>
    match[1].trim(),
  );
}

function collectStructuredDocsErrors() {
  const rules = [
    {
      label: "harness",
      dir: join(root, "packages/docs/src/content/docs/docs/harnesses"),
      template: "_TEMPLATE.md",
      requiredHeadings: ["Install", "App Shape", "Configure Harness", "Eval"],
    },
    {
      label: "judge",
      dir: join(root, "packages/docs/src/content/docs/docs/judges"),
      template: "_TEMPLATE.md",
      requiredHeadings: ["Configure", "Metadata", "Failure Behavior"],
    },
  ];
  const errors = [];

  for (const rule of rules) {
    const templatePath = join(rule.dir, rule.template);
    if (!existsSync(templatePath)) {
      errors.push(
        `${relative(root, rule.dir)} is missing ${rule.template} for ${rule.label} pages`,
      );
    }

    for (const file of directMdxFiles(rule.dir)) {
      const contents = readFileSync(file, "utf8");
      const frontmatter = frontmatterFor(contents);
      const relativeFile = relative(root, file);

      if (!frontmatter) {
        errors.push(`${relativeFile} is missing frontmatter`);
        continue;
      }

      for (const field of ["title", "description"]) {
        if (!hasFrontmatterField(frontmatter, field)) {
          errors.push(`${relativeFile} is missing frontmatter field ${field}`);
        }
      }

      if (!hasFalseFrontmatterField(frontmatter, "editUrl")) {
        errors.push(`${relativeFile} must set editUrl: false`);
      }

      const headings = new Set(markdownHeadings(contents));
      for (const heading of rule.requiredHeadings) {
        if (!headings.has(heading)) {
          errors.push(
            `${relativeFile} is missing required heading "${heading}"`,
          );
        }
      }
    }
  }

  return errors;
}

const structuredDocsErrors = collectStructuredDocsErrors();
let hasErrors = false;

if (undocumented.length > 0) {
  hasErrors = true;
  console.error("Missing JSDoc for exported public API symbols:");
  for (const symbol of undocumented) {
    console.error(
      `- ${relative(root, symbol.file)}:${symbol.line} ${symbol.name}`,
    );
  }
}

if (structuredDocsErrors.length > 0) {
  hasErrors = true;
  console.error("Structured docs checks failed:");
  for (const error of structuredDocsErrors) {
    console.error(`- ${error}`);
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log(
  `Checked JSDoc for ${publicSources.length} public source files from package exports.`,
);
