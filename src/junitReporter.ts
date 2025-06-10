import type { RunnerTask } from "vitest";
import { JUnitReporter } from "vitest/reporters";

// Copied from https://github.com/vitest-dev/vitest/blob/67b401a3fa3a9cb5e21d0a35650959f9b7229bfc/packages/vitest/src/node/reporters/junit.ts#L14
interface ClassnameTemplateVariables {
  filename: string;
  filepath: string;
}

// Copied from https://github.com/vitest-dev/vitest/blob/67b401a3fa3a9cb5e21d0a35650959f9b7229bfc/packages/vitest/src/node/reporters/junit.ts#L19
interface JUnitOptions {
  outputFile?: string;
  /** @deprecated Use `classnameTemplate` instead. */
  classname?: string;

  /**
   * Template for the classname attribute. Can be either a string or a function. The string can contain placeholders {filename} and {filepath}.
   */
  classnameTemplate?:
    | string
    | ((classnameVariables: ClassnameTemplateVariables) => string);
  suiteName?: string;
  /**
   * Write <system-out> and <system-err> for console output
   * @default true
   */
  includeConsoleOutput?: boolean;
  /**
   * Add <testcase file="..."> attribute (validated on CIRCLE CI and GitLab CI)
   * @default false
   */
  addFileAttribute?: boolean;
}

// Copied from https://github.com/vitest-dev/vitest/blob/67b401a3fa3a9cb5e21d0a35650959f9b7229bfc/packages/vitest/src/node/reporters/junit.ts#L104
function executionTime(durationMS: number) {
  return (durationMS / 1000).toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 10,
  });
}

// Copied from https://github.com/vitest-dev/vitest/blob/67b401a3fa3a9cb5e21d0a35650959f9b7229bfc/packages/vitest/src/node/reporters/junit.ts#L111
function getDuration(task: RunnerTask): string | undefined {
  const duration = task.result?.duration ?? 0;
  return executionTime(duration);
}

export default class EvalJUnitReporter extends JUnitReporter {
  private options_copy: JUnitOptions;

  constructor(options: JUnitOptions) {
    super(options);
    this.options_copy = options;
  }

  private async formatEvalAsXML(task: RunnerTask): Promise<void> {
    if (!task.meta?.eval) {
      return;
    }

    await super.writeElement("properties", {}, async () => {
      await super.writeElement(
        "property",
        {
          name: "eval",
        },
        async () => {
          await super.writeElement(
            "scores",
            { avg: task.meta?.eval?.avgScore },
            async () => {
              for (const score of task.meta?.eval?.scores ?? []) {
                await super.writeElement(
                  "score",
                  {
                    name: score.name,
                    score: score.score,
                  },
                  async () => {
                    return;
                  },
                );
              }
            },
          );
        },
      );
    });
  }

  public override async writeTasks(
    tasks: RunnerTask[],
    filename: string,
  ): Promise<void> {
    // If we add task.annotations we can use the JUnitReporter to add <properties>
    // BUT it only creates <property> tags inside <properties>. These can have a 'type' and 'message'.
    // So we can't have our own tags inside a <property> tag.
    //
    // The other approach is to take control of the XML output, by overriding writeElement directly.
    // Which will give us a more content-rich output in the XML.
    for (const task of tasks) {
      if (task.name.includes("evals with expect.toEval")) {
        console.log("task", task);
      }
      if (task.meta?.eval) {
        // This is an eval, so we want custom tags.

        // skip / todo / fail use the logger directly.
        // We don't have access to the logger, so we can't do this.
        // This means that eval tags will only be written for successful tests.
        if (
          task.mode === "skip" ||
          task.mode === "todo" ||
          task.result?.state === "fail"
        ) {
          await super.writeTasks([task], filename);
          continue;
        }

        // We need to repeat the logic for the other tags.
        // From https://github.com/vitest-dev/vitest/blob/67b401a3fa3a9cb5e21d0a35650959f9b7229bfc/packages/vitest/src/node/reporters/junit.ts#L209
        let classname = filename;

        const templateVars: ClassnameTemplateVariables = {
          filename: task.file.name,
          filepath: task.file.filepath,
        };

        if (typeof this.options_copy.classnameTemplate === "function") {
          classname = this.options_copy.classnameTemplate(templateVars);
        } else if (typeof this.options_copy.classnameTemplate === "string") {
          classname = this.options_copy.classnameTemplate
            .replace(/\{filename\}/g, templateVars.filename)
            .replace(/\{filepath\}/g, templateVars.filepath);
        } else if (typeof this.options_copy.classname === "string") {
          classname = this.options_copy.classname;
        }

        await super.writeElement(
          "testcase",
          {
            classname,
            file: this.options_copy.addFileAttribute ? filename : undefined,
            name: task.name,
            time: getDuration(task),
          },
          async () => {
            if (this.options_copy.includeConsoleOutput) {
              await super.writeLogs(task, "out");
              await super.writeLogs(task, "err");
            }

            await this.formatEvalAsXML(task);
          },
        );
      } else {
        // This is a normal test, so we can use the JUnitReporter
        await super.writeTasks([task], filename);
      }
    }
  }
}
