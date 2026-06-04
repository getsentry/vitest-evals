/** Parsed options for the local report UI CLI. */
export type ReportUiCliOptions = {
  inputs: string[];
  workspace?: string;
  host: string;
  port: number;
  help: boolean;
};

type MutableReportUiCliOptions = Omit<ReportUiCliOptions, "inputs"> & {
  inputs: string[];
};

/** Parses `vitest-evals serve` CLI arguments. */
export function parseCliArgs(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): ReportUiCliOptions {
  const options: MutableReportUiCliOptions = {
    inputs: [],
    host: "127.0.0.1",
    port: 0,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--json":
        options.inputs.push(readValue(args, ++index, arg));
        break;
      case "--workspace":
        options.workspace = readValue(args, ++index, arg);
        break;
      case "--host":
        options.host = readValue(args, ++index, arg);
        break;
      case "--port":
        options.port = readInteger(args, ++index, arg);
        break;
      case "--help":
      case "-h":
        options.help = true;
        return withDefaultInput(options, env);
      default:
        if (!arg.startsWith("-")) {
          options.inputs.push(arg);
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return withDefaultInput(options, env);
}

function withDefaultInput(
  options: MutableReportUiCliOptions,
  env: NodeJS.ProcessEnv,
): ReportUiCliOptions {
  return {
    ...options,
    inputs:
      options.inputs.length > 0
        ? options.inputs
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
