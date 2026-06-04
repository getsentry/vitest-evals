#!/usr/bin/env node

import("../dist/cli.mjs")
  .then(({ runVitestEvalsCli }) => runVitestEvalsCli(process.argv.slice(2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
