export type CliOptions = {
  resultPatterns: string[];
  summaryPath?: string;
  summaryEnabled: boolean;
  annotations: boolean;
  checkRun: boolean;
  failOnFailures: boolean;
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

type MutableCliOptions = Omit<CliOptions, "resultPatterns"> & {
  resultPatterns: string[];
};

/** Parses GitHub reporter CLI arguments, with explicit arguments taking precedence over environment defaults. */
export function parseCliArgs(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): CliOptions {
  const options: MutableCliOptions = {
    summaryPath: env.GITHUB_STEP_SUMMARY,
    summaryEnabled: true,
    annotations: env.GITHUB_ACTIONS === "true",
    checkRun: false,
    failOnFailures: false,
    failOnCheckError: false,
    resultPatterns: [],
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--json":
        options.resultPatterns.push(readValue(args, ++index, arg));
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
      case "--fail-on-failures":
        options.failOnFailures = true;
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
        return withDefaultJsonPath(options, env);
      default:
        if (!arg.startsWith("-")) {
          options.resultPatterns.push(arg);
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return withDefaultJsonPath(options, env);
}

function withDefaultJsonPath(
  options: MutableCliOptions,
  env: NodeJS.ProcessEnv,
): CliOptions {
  return {
    ...options,
    resultPatterns:
      options.resultPatterns.length > 0
        ? options.resultPatterns
        : [env.VITEST_EVALS_JSON_REPORT || "vitest-results.json"],
  };
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readInteger(args: string[], index: number, flag: string) {
  const rawValue = readValue(args, index, flag);
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`Invalid integer for ${flag}`);
  }
  return Number(rawValue);
}
