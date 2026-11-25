import path from "node:path";
import { loadEnvFile } from "./core/env.js";
import { AepHarnessWebServer } from "./web/server.js";

interface HarnessCliArgs {
  host: string;
  port: number;
  connectUrls: string[];
  envFile?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  maxSteps?: number;
  jsonReady: boolean;
  exitOnStdinEof: boolean;
}

function parseIntArg(raw: string | undefined, flag: string): number {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`Invalid integer for ${flag}: "${raw ?? ""}"`);
  }
  return num;
}

function parseCliArgs(argv: string[]): HarnessCliArgs {
  const args: HarnessCliArgs = {
    host: "127.0.0.1",
    port: 8790,
    connectUrls: [],
    jsonReady: false,
    exitOnStdinEof: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i]!;
    switch (tok) {
      case "--host":
        args.host = argv[++i] ?? args.host;
        break;
      case "--port":
        args.port = parseIntArg(argv[++i], "--port");
        break;
      case "--connect":
      case "-c": {
        const u = argv[++i];
        if (!u) {
          throw new Error("--connect requires an endpoint URL");
        }
        args.connectUrls.push(u);
        break;
      }
      case "--env":
        args.envFile = argv[++i];
        break;
      case "--provider":
        args.provider = argv[++i];
        break;
      case "--model":
        args.model = argv[++i];
        break;
      case "--base-url":
        args.baseUrl = argv[++i];
        break;
      case "--api-key":
        args.apiKey = argv[++i];
        break;
      case "--steps":
        args.maxSteps = parseIntArg(argv[++i], "--steps");
        break;
      case "--json-ready":
        args.jsonReady = true;
        break;
      case "--exit-on-stdin-eof":
        args.exitOnStdinEof = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown flag: ${tok}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log(`AEP Harness (Web Prototype)

Usage:
  node dist/cli.js [options]

Options:
  --host <ip>            Bind host (default: 127.0.0.1)
  --port <port>          HTTP port (default: 8790; 0 = ephemeral)
  -c, --connect <url>    Auto-connect & mount an AEP endpoint on startup (repeatable)
  --env <path>           Load environment variables from a specific .env file
  --provider <name>      LLM provider (auto, gemini, openai, anthropic, ollama, openai-compatible, none)
  --model <model>        Override LLM model name (e.g. gpt-6-luna)
  --base-url <url>       Override provider API base URL
  --api-key <key>        Override provider API key
  --steps <n>            Max autonomous agent steps (default: 25)
  --json-ready           Print single-line AEP_HARNESS_READY JSON on stdout
  --exit-on-stdin-eof    Shut down cleanly when stdin closes
  -h, --help             Show help`);
}

async function main(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.envFile) {
    loadEnvFile(path.resolve(process.cwd(), opts.envFile));
  }
  loadEnvFile();

  const server = new AepHarnessWebServer({
    host: opts.host,
    port: opts.port,
    providerOptions: {
      ...(opts.provider !== undefined ? { provider: opts.provider } : {}),
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
      ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
    },
    ...(opts.maxSteps !== undefined ? { maxSteps: opts.maxSteps } : {}),
  });

  let shuttingDown = false;
  const shutdown = async (signal?: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (!opts.jsonReady && signal) {
      console.error(`\n[${signal}] Shutting down AEP Harness...`);
    }
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  if (opts.exitOnStdinEof) {
    process.stdin.resume();
    process.stdin.on("end", () => void shutdown("STDIN_EOF"));
    process.stdin.on("close", () => void shutdown("STDIN_CLOSE"));
  }

  for (const url of opts.connectUrls) {
    try {
      const ep = await server.hub.connectEndpoint({ url });
      if (!opts.jsonReady) {
        console.log(`Mounted ${ep.anchorPath} <- ${ep.resolvedEndpoint}`);
      }
    } catch (err) {
      console.error(
        `Warning: could not auto-connect "${url}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const started = await server.start();
  if (opts.jsonReady) {
    console.log(`AEP_HARNESS_READY ${JSON.stringify(started)}`);
  } else {
    const p = server.agent.currentProvider;
    console.log(`AEP Web Harness:    ${started.httpUrl}`);
    console.log(`LLM Provider:       ${p.name} (${p.model}, configured=${p.configured})`);
    console.log("Press Ctrl+C to shut down.");
  }
}

main().catch((err) => {
  console.error("Failed to start AEP Harness:", err instanceof Error ? err.message : err);
  process.exit(1);
});
