// import type { RunnerTask, RunnerTestFile } from "vitest";
import { DefaultReporter } from "vitest/reporters";
import c from "tinyrainbow";

export default class DefaultEvalReporter extends DefaultReporter {
  protected override printTestCase(moduleState: any, test: any): void {
    const meta = test.meta();
    const testResult = test.result();

    if (!meta.eval || testResult.state === "failed") {
      super.printTestCase(moduleState, test);
      return;
    }

    const padding = this.getTestIndentation(test.task);
    const colorFn =
      meta.eval.avgScore < 0.5
        ? c.red
        : meta.eval.avgScore < 0.75
          ? c.yellow
          : c.green;
    this.log(
      `${padding}  ${this.getTestName(test.task, c.dim(" > "))} [${colorFn(meta.eval.avgScore.toFixed(2))}]`,
    );
  }
}
