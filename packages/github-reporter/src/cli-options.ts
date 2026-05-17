export type CliOptions = {
  jsonPath?: string;
  summaryPath?: string;
  summaryEnabled: boolean;
  annotations: boolean;
  checkRun: boolean;
  failOnCheckError: boolean;
  maxAnnotations?: number;
  maxFailures?: number;
  checkRunId?: number;
  checkName?: string;
  token?: string;
  repository?: string;
  sha?: string;
  workspace?: string;
  help: boolean;
};

/** Parses GitHub reporter CLI arguments, with explicit arguments taking precedence over environment defaults. */
export function parseCliArgs(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): CliOptions {
  const options: CliOptions = {
    summaryPath: env.GITHUB_STEP_SUMMARY,
    summaryEnabled: true,
    annotations: env.GITHUB_ACTIONS === "true",
    checkRun: false,
    failOnCheckError: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--json":
        options.jsonPath = readValue(args, ++index, arg);
        break;
      case "--summary":
        options.summaryPath = readValue(args, ++index, arg);
        options.summaryEnabled = true;
        break;
      case "--no-summary":
        options.summaryEnabled = false;
        break;
      case "--annotations":
        options.annotations = true;
        break;
      case "--no-annotations":
        options.annotations = false;
        break;
      case "--check-run":
        options.checkRun = true;
        break;
      case "--fail-on-check-error":
        options.failOnCheckError = true;
        break;
      case "--max-annotations":
        options.maxAnnotations = readInteger(args, ++index, arg);
        break;
      case "--max-failures":
        options.maxFailures = readInteger(args, ++index, arg);
        break;
      case "--check-run-id":
        options.checkRunId = readInteger(args, ++index, arg);
        options.checkRun = true;
        break;
      case "--check-name":
        options.checkName = readValue(args, ++index, arg);
        break;
      case "--token":
        options.token = readValue(args, ++index, arg);
        break;
      case "--repo":
        options.repository = readValue(args, ++index, arg);
        break;
      case "--sha":
        options.sha = readValue(args, ++index, arg);
        break;
      case "--workspace":
        options.workspace = readValue(args, ++index, arg);
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        if (!arg.startsWith("-") && !options.jsonPath) {
          options.jsonPath = arg;
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.jsonPath ??= env.VITEST_EVALS_JSON_REPORT ?? "vitest-results.json";

  return options;
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readInteger(args: string[], index: number, flag: string) {
  const value = Number.parseInt(readValue(args, index, flag), 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid integer for ${flag}`);
  }
  return value;
}
