import { DefaultReporter, VerboseReporter } from "vitest/node";
import c from "tinyrainbow";

const TEST_NAME_SEPARATOR = c.dim(" > ");

export default class DefaultEvalReporter extends VerboseReporter {
  override onTestCaseResult(test: any): void {
    const meta = test.meta();
    if (!meta.eval) {
      super.onTestCaseResult(test);
      return;
    }

    // Preserve DefaultReporter's bookkeeping without letting VerboseReporter
    // print the stock per-test line; eval cases need custom score output.
    DefaultReporter.prototype.onTestCaseResult.call(this, test);

    const testResult = test.result();
    if (
      this.ctx.config.hideSkippedTests &&
      testResult.state === "skipped" &&
      test.options?.mode !== "todo"
    ) {
      return;
    }

    this.logEvalTestCase(test, meta.eval.avgScore);

    if (testResult.state === "failed") {
      for (const error of testResult.errors) {
        this.log(c.red(`   → ${error.message}`));
      }
    }

    if (test.annotations().length) {
      this.log();
      this.printAnnotations(test, "log", 3);
      this.log();
    }
  }

  private logEvalTestCase(test: any, avgScore: number): void {
    const colorFn =
      avgScore < 0.5 ? c.red : avgScore < 0.75 ? c.yellow : c.green;

    let title = ` ${this.getEntityPrefix(test)} `;
    title += test.module.task.name;
    if (test.location) {
      title += c.dim(`:${test.location.line}:${test.location.column}`);
    }
    title += TEST_NAME_SEPARATOR;
    title += this.getTestName(test.task, TEST_NAME_SEPARATOR);
    title += ` [${colorFn(avgScore.toFixed(2))}]`;
    title += this.getTestCaseSuffix(test);

    this.log(title);
  }
}
