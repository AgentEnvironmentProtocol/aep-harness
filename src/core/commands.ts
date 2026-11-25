import type { ElevationLevel, LeaseMode, NodeKind, RenderMode, SessionRole } from "aep-node";
import type { WebSocketTransportMode } from "aep-node/transport";
import type { AepHarnessAgent } from "./agent-runner.js";
import { resolveHarnessProvider, type ResolveHarnessProviderOptions } from "./llm-provider.js";
import type { AepHarnessHub, SerializedBinaryResult, SerializedRenderResult } from "./session-hub.js";
import { formatTreeDigest } from "./tree-formatter.js";

export interface CommandExecutionResult {
  command: string;
  ok: boolean;
  output: string;
  data?: unknown;
  render?: SerializedRenderResult;
  binary?: SerializedBinaryResult;
  selectPath?: string;
}

export interface CommandContext {
  hub: AepHarnessHub;
  agent: AepHarnessAgent;
  onConfigureProvider?: (opts: ResolveHarnessProviderOptions) => void;
}

export function formatSlashHelp(): string {
  return `AEP Harness Commands:
  <natural language>                        Run autonomous AI agent goal across connected AEP endpoints
  /help                                     Show this command reference
  /connect <url> [mountId] [--role observer|controller] [--mode binary|json] [--source /path]
                                            Connect & mount ws://, http:// (auto-discovers /.well-known/aep.json), or tcp://
  /disconnect <mountId>                     Disconnect and unmount an endpoint
  /endpoints                                List all mounted endpoints and session roles
  /tree [path] [maxDepth]                   Print formatted AEP tree digest (default: / depth 6)
  /node <path> [maxDepth]                   Read full JSON of a single AEP node
  /children <path> [limit] [cursor]         Lazy-load children via node.loadChildren
  /query [json | key=value ...]             Run tree.query (e.g. /query hasMethod=setValue kind=editable)
  /invoke <path> <method> [jsonParams]      Invoke any method on an AEP node
  /set <path> <valueOrJson>                 Shorthand for /invoke <path> setValue {"value": ...}
  /render <path> [renderMinimal|renderExpress|renderFull]
                                            Render subtree wireframe / surface and inspect pathMap
  /binary <refId>                           Fetch binary resource via data.getBinary
  /elevate <path> <confirm|elevated|admin> [reason...]
                                            Request session privilege elevation for a path
  /drop-elevation <mountIdOrPath> [grantId] Drop active elevation grant(s)
  /lease <path> [exclusive-write|shared-read] [durationMs]
                                            Acquire a cooperative subtree lease
  /release-lease <mountIdOrPath> <leaseId>  Release an active lease
  /provider [name] [model]                  Show or switch LLM provider (gemini, openai, anthropic, ollama, openai-compatible, none)
  /steps [maxSteps]                         Show or update max autonomous agent steps
  /stop                                     Abort a running autonomous agent loop
  /clear                                    Clear activity and command logs`;
}

function splitFirstTokens(input: string, count: number): { tokens: string[]; rest: string } {
  const tokens: string[] = [];
  let rest = input.trim();
  for (let i = 0; i < count; i += 1) {
    if (!rest) {
      break;
    }
    const match = /^(\S+)\s*([\s\S]*)$/.exec(rest);
    if (!match) {
      break;
    }
    tokens.push(match[1]!);
    rest = (match[2] ?? "").trim();
  }
  return { tokens, rest };
}

function parseLooseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export async function executeSlashCommand(
  rawInput: string,
  ctx: CommandContext,
): Promise<CommandExecutionResult> {
  const trimmed = rawInput.trim();
  if (!trimmed.startsWith("/")) {
    throw new Error('Slash commands must begin with "/"');
  }

  const { tokens: headTokens, rest: argsRaw } = splitFirstTokens(trimmed.slice(1), 1);
  const cmd = (headTokens[0] ?? "help").toLowerCase();

  try {
    switch (cmd) {
      case "help":
      case "?": {
        const text = formatSlashHelp();
        ctx.hub.pushLog({ kind: "command", level: "info", title: "/help", detail: "Displayed command list" });
        return { command: trimmed, ok: true, output: text };
      }

      case "connect":
      case "mount": {
        const parts = argsRaw.split(/\s+/).filter(Boolean);
        if (parts.length === 0) {
          throw new Error("Usage: /connect <url> [mountId] [--role controller|observer] [--mode binary|json] [--source /path]");
        }
        const url = parts[0]!;
        let mountId: string | undefined;
        let role: SessionRole | undefined;
        let mode: WebSocketTransportMode | undefined;
        let sourcePath: string | undefined;

        for (let i = 1; i < parts.length; i += 1) {
          const tok = parts[i]!;
          if (tok === "--role") {
            const val = parts[++i];
            if (val !== "controller" && val !== "observer") {
              throw new Error('--role must be "controller" or "observer"');
            }
            role = val;
          } else if (tok === "--mode") {
            const val = parts[++i];
            if (val !== "binary" && val !== "json") {
              throw new Error('--mode must be "binary" or "json"');
            }
            mode = val;
          } else if (tok === "--source") {
            sourcePath = parts[++i];
          } else if (!tok.startsWith("--") && mountId === undefined) {
            mountId = tok;
          } else {
            throw new Error(`Unknown /connect argument "${tok}"`);
          }
        }

        const summary = await ctx.hub.connectEndpoint({
          url,
          ...(mountId !== undefined ? { mountId } : {}),
          ...(role !== undefined ? { role } : {}),
          ...(mode !== undefined ? { mode } : {}),
          ...(sourcePath !== undefined ? { sourcePath } : {}),
        });
        const out = `Connected & mounted ${summary.anchorPath} <- ${summary.resolvedEndpoint} (${summary.serverInfo?.name ?? "AEP"}, role=${summary.role})`;
        return {
          command: trimmed,
          ok: true,
          output: out,
          data: summary,
          selectPath: summary.anchorPath,
        };
      }

      case "disconnect":
      case "unmount": {
        const target = argsRaw.trim();
        if (!target) {
          throw new Error("Usage: /disconnect <mountId>");
        }
        await ctx.hub.disconnectEndpoint(target);
        return {
          command: trimmed,
          ok: true,
          output: `Disconnected endpoint "${target.replace(/^\/+/, "")}"`,
        };
      }

      case "endpoints":
      case "mounts": {
        const list = ctx.hub.listEndpoints();
        if (list.length === 0) {
          return { command: trimmed, ok: true, output: "(no AEP endpoints connected)" };
        }
        const lines = list.map(
          (ep) =>
            `${ep.anchorPath} [mountId=${ep.mountId}] -> ${ep.resolvedEndpoint} (${ep.serverInfo?.name ?? "AEP"} v${ep.serverInfo?.version ?? "?"}, role=${ep.role}, connected=${ep.connected})`,
        );
        return { command: trimmed, ok: true, output: lines.join("\n"), data: list };
      }

      case "tree": {
        const { tokens } = splitFirstTokens(argsRaw, 2);
        const path = tokens[0] || "/";
        const maxDepth = tokens[1] !== undefined ? Number(tokens[1]) : 6;
        if (!Number.isInteger(maxDepth) || maxDepth < 0) {
          throw new Error("maxDepth must be a non-negative integer");
        }
        const res = await ctx.hub.getTree({ path, maxDepth, includeHead: true });
        const digest = formatTreeDigest(res.node, path, { maxDepth, maxNodes: 300 });
        ctx.hub.pushLog({ kind: "command", level: "ok", title: `/tree ${path}`, detail: `depth=${maxDepth}` });
        return {
          command: trimmed,
          ok: true,
          output: digest,
          data: res,
          ...(path !== "/" ? { selectPath: path } : {}),
        };
      }

      case "node": {
        const { tokens } = splitFirstTokens(argsRaw, 2);
        const path = tokens[0];
        if (!path) {
          throw new Error("Usage: /node <path> [maxDepth]");
        }
        const maxDepth = tokens[1] !== undefined ? Number(tokens[1]) : 2;
        const res = await ctx.hub.getNode(path, { maxDepth });
        const out = JSON.stringify(res.node, null, 2);
        ctx.hub.pushLog({ kind: "command", level: "ok", title: `/node ${path}` });
        return {
          command: trimmed,
          ok: true,
          output: out,
          data: res.node,
          selectPath: path,
        };
      }

      case "children": {
        const { tokens } = splitFirstTokens(argsRaw, 3);
        const path = tokens[0];
        if (!path) {
          throw new Error("Usage: /children <path> [limit] [cursor]");
        }
        const limit = tokens[1] !== undefined ? Number(tokens[1]) : undefined;
        const cursor = tokens[2];
        const res = await ctx.hub.loadChildren(path, {
          ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
          ...(cursor !== undefined ? { cursor } : {}),
        });
        const out = `Loaded ${res.children.length} child node(s) at ${path} (hasMore=${Boolean(res.hasMore)})\n${res.children.map((c) => `  - ${path}/${c.id} [${c.kind}]`).join("\n")}`;
        return { command: trimmed, ok: true, output: out, data: res, selectPath: path };
      }

      case "query": {
        let queryParams: Record<string, unknown> = {};
        if (argsRaw.startsWith("{")) {
          const parsed = JSON.parse(argsRaw) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("/query JSON argument must be an object");
          }
          queryParams = parsed as Record<string, unknown>;
        } else if (argsRaw.length > 0) {
          for (const token of argsRaw.split(/\s+/)) {
            const eq = token.indexOf("=");
            if (eq <= 0) {
              queryParams["textContains"] = token;
              continue;
            }
            const k = token.slice(0, eq);
            const v = token.slice(eq + 1);
            if (k === "kind" || k === "kinds") {
              queryParams["kinds"] = v.split(",") as NodeKind[];
            } else if (k === "type" || k === "types") {
              queryParams["types"] = v.split(",");
            } else if (k === "hasMethod" || k === "method") {
              queryParams["hasMethod"] = v;
            } else if (k === "text" || k === "textContains") {
              queryParams["textContains"] = v;
            } else if (k === "root" || k === "rootPath" || k === "path") {
              queryParams["rootPath"] = v;
            } else if (k === "limit") {
              queryParams["limit"] = Number(v);
            } else if (k === "maxDepth" || k === "depth") {
              queryParams["maxDepth"] = Number(v);
            }
          }
        }

        const res = await ctx.hub.queryTree(queryParams);
        const lines = res.matches.map(
          (m) =>
            `${m.path} [${m.node.kind}${"type" in m.node && m.node.type ? `:${m.node.type}` : ""}]`,
        );
        const out = `Matches (${res.matches.length}/${res.totalCount}):\n${lines.length > 0 ? lines.join("\n") : "(none)"}`;
        ctx.hub.pushLog({
          kind: "command",
          level: "ok",
          title: `/query (${res.matches.length} matches)`,
        });
        return { command: trimmed, ok: true, output: out, data: res };
      }

      case "invoke":
      case "call": {
        const { tokens, rest } = splitFirstTokens(argsRaw, 2);
        const path = tokens[0];
        const method = tokens[1];
        if (!path || !method) {
          throw new Error("Usage: /invoke <path> <method> [jsonParams]");
        }
        let params: unknown = {};
        if (rest.length > 0) {
          try {
            params = JSON.parse(rest);
          } catch (err) {
            throw new Error(
              `Invalid JSON params for /invoke: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
        const res = await ctx.hub.invoke(path, method, params);
        return {
          command: trimmed,
          ok: true,
          output: JSON.stringify(res.result ?? { ok: true }, null, 2),
          data: res,
          selectPath: path,
        };
      }

      case "set": {
        const { tokens, rest } = splitFirstTokens(argsRaw, 1);
        const path = tokens[0];
        if (!path || !rest) {
          throw new Error("Usage: /set <path> <valueOrJson>");
        }
        const value = parseLooseValue(rest);
        const res = await ctx.hub.invoke(path, "setValue", { value });
        return {
          command: trimmed,
          ok: true,
          output: JSON.stringify(res.result ?? { value }, null, 2),
          data: res,
          selectPath: path,
        };
      }

      case "render": {
        const { tokens } = splitFirstTokens(argsRaw, 2);
        const path = tokens[0];
        if (!path) {
          throw new Error("Usage: /render <path> [renderMinimal|renderExpress|renderFull]");
        }
        const rawMode = (tokens[1] ?? "renderMinimal") as RenderMode;
        if (
          rawMode !== "renderMinimal" &&
          rawMode !== "renderExpress" &&
          rawMode !== "renderFull"
        ) {
          throw new Error("mode must be renderMinimal, renderExpress, or renderFull");
        }
        const rendered = await ctx.hub.renderSubtree(path, rawMode);
        const mapLines = Object.entries(rendered.pathMap ?? {}).map(([k, v]) => `  ${k} -> ${v}`);
        const out = `Rendered ${rendered.path} (${rendered.mode}, ${rendered.mediaType}, ${rendered.byteLength} bytes${rendered.synthesizedFallback ? ", client-synthesized" : ""})${mapLines.length > 0 ? `\nPath Map:\n${mapLines.join("\n")}` : ""}`;
        ctx.hub.pushLog({ kind: "command", level: "ok", title: `/render ${path} (${rawMode})` });
        return {
          command: trimmed,
          ok: true,
          output: out,
          render: rendered,
          selectPath: path,
        };
      }

      case "binary": {
        const refId = argsRaw.trim();
        if (!refId) {
          throw new Error("Usage: /binary <refId>");
        }
        const bin = await ctx.hub.getBinary(refId);
        const out = `Binary ${bin.refId} (${bin.mediaType}, ${bin.byteLength} bytes)${bin.textPreview ? `\n\n${bin.textPreview}` : ""}`;
        return { command: trimmed, ok: true, output: out, binary: bin };
      }

      case "elevate": {
        const { tokens, rest } = splitFirstTokens(argsRaw, 2);
        const targetPath = tokens[0];
        const level = tokens[1] as ElevationLevel | undefined;
        if (!targetPath || !level || !["confirm", "elevated", "admin"].includes(level)) {
          throw new Error("Usage: /elevate <path> <confirm|elevated|admin> [reason]");
        }
        const reason = rest || "Interactive operator elevation in AEP Harness";
        const res = await ctx.hub.elevate({ targetPath, level, reason });
        return {
          command: trimmed,
          ok: true,
          output: JSON.stringify(res, null, 2),
          data: res,
        };
      }

      case "drop-elevation": {
        const { tokens } = splitFirstTokens(argsRaw, 2);
        const mountOrPath = tokens[0];
        if (!mountOrPath) {
          throw new Error("Usage: /drop-elevation <mountIdOrPath> [grantId]");
        }
        const res = await ctx.hub.dropElevation(mountOrPath, tokens[1]);
        return {
          command: trimmed,
          ok: true,
          output: `Dropped grants: ${res.dropped.join(", ") || "(none)"}`,
          data: res,
        };
      }

      case "lease": {
        const { tokens } = splitFirstTokens(argsRaw, 3);
        const path = tokens[0];
        if (!path) {
          throw new Error("Usage: /lease <path> [exclusive-write|shared-read] [durationMs]");
        }
        const mode = (tokens[1] as LeaseMode | undefined) ?? "exclusive-write";
        const durationMs = tokens[2] !== undefined ? Number(tokens[2]) : undefined;
        const res = await ctx.hub.acquireLease({
          path,
          mode,
          ...(durationMs !== undefined && Number.isFinite(durationMs) ? { durationMs } : {}),
        });
        return {
          command: trimmed,
          ok: true,
          output: JSON.stringify(res, null, 2),
          data: res,
        };
      }

      case "release-lease": {
        const { tokens } = splitFirstTokens(argsRaw, 2);
        if (!tokens[0] || !tokens[1]) {
          throw new Error("Usage: /release-lease <mountIdOrPath> <leaseId>");
        }
        const res = await ctx.hub.releaseLease(tokens[0], tokens[1]);
        return {
          command: trimmed,
          ok: true,
          output: JSON.stringify(res, null, 2),
          data: res,
        };
      }

      case "provider": {
        const { tokens } = splitFirstTokens(argsRaw, 2);
        if (tokens.length === 0) {
          const p = ctx.agent.currentProvider;
          return {
            command: trimmed,
            ok: true,
            output: `Active LLM Provider: ${p.name} (model=${p.model}, configured=${p.configured})`,
          };
        }
        const opts: ResolveHarnessProviderOptions = {
          provider: tokens[0]!,
          ...(tokens[1] !== undefined ? { model: tokens[1] } : {}),
        };
        if (ctx.onConfigureProvider) {
          ctx.onConfigureProvider(opts);
        } else {
          ctx.agent.setProvider(resolveHarnessProvider(opts));
        }
        const next = ctx.agent.currentProvider;
        return {
          command: trimmed,
          ok: true,
          output: `Switched LLM Provider -> ${next.name} (model=${next.model}, configured=${next.configured})`,
        };
      }

      case "steps": {
        const val = argsRaw.trim();
        if (!val) {
          return {
            command: trimmed,
            ok: true,
            output: `Max agent steps: ${ctx.agent.currentMaxSteps}`,
          };
        }
        const num = Number(val);
        ctx.agent.setMaxSteps(num);
        return {
          command: trimmed,
          ok: true,
          output: `Updated max agent steps -> ${ctx.agent.currentMaxSteps}`,
        };
      }

      case "stop": {
        const stopped = ctx.agent.stop();
        return {
          command: trimmed,
          ok: true,
          output: stopped ? "Sent stop signal to active agent run." : "No agent run is currently active.",
        };
      }

      case "clear": {
        ctx.hub.clearLogs();
        ctx.agent.clearRuns();
        return {
          command: trimmed,
          ok: true,
          output: "Cleared logs and completed agent runs.",
        };
      }

      default:
        throw new Error(`Unknown command "/${cmd}". Type /help for available commands.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.hub.pushLog({
      kind: "error",
      level: "error",
      title: `Command failed: /${cmd}`,
      detail: msg,
    });
    return {
      command: trimmed,
      ok: false,
      output: `Error: ${msg}`,
    };
  }
}
