import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  AllowedFactor,
  ElevationLevel,
  LeaseMode,
  NodeKind,
  RenderMode,
  SessionRole,
  TreeQueryParams,
} from "aep-node";
import type { WebSocketTransportMode } from "aep-node/transport";
import { AepHarnessAgent } from "../core/agent-runner.js";
import { executeSlashCommand } from "../core/commands.js";
import {
  resolveHarnessProvider,
  type HarnessLlmProvider,
  type ResolveHarnessProviderOptions,
} from "../core/llm-provider.js";
import { AepHarnessHub } from "../core/session-hub.js";
import { renderHarnessAppHtml } from "./webapp.js";

export interface AepHarnessWebServerOptions {
  host?: string;
  port?: number;
  hub?: AepHarnessHub;
  agent?: AepHarnessAgent;
  provider?: HarnessLlmProvider;
  providerOptions?: ResolveHarnessProviderOptions;
  maxSteps?: number;
}

export interface AepHarnessWebStartResult {
  httpUrl: string;
  host: string;
  port: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.byteLength;
    if (total > 8 * 1024 * 1024) {
      throw new Error("Request body too large");
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks, total).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error("Request JSON body must be an object");
  }
  return parsed;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

export class AepHarnessWebServer {
  private readonly host: string;
  private readonly requestedPort: number;
  readonly hub: AepHarnessHub;
  readonly agent: AepHarnessAgent;
  private readonly ownsHub: boolean;
  private readonly httpServer: http.Server;
  private readonly sseClients = new Set<ServerResponse>();
  private readonly unsubscribers: Array<() => void> = [];
  private providerOverrides: ResolveHarnessProviderOptions;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private boundPort?: number;
  private closed = false;

  constructor(options: AepHarnessWebServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 8790;
    this.ownsHub = !options.hub;
    this.hub = options.hub ?? new AepHarnessHub();
    this.providerOverrides = { ...(options.providerOptions ?? {}) };

    const initialProvider =
      options.provider ?? resolveHarnessProvider(this.providerOverrides);
    this.agent =
      options.agent ??
      new AepHarnessAgent(this.hub, initialProvider, {
        ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
      });

    this.httpServer = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    this.unsubscribers.push(
      this.hub.onChange(() => this.scheduleBroadcast()),
      this.hub.onLog(() => this.scheduleBroadcast()),
      this.agent.onUpdate(() => this.scheduleBroadcast()),
    );
  }

  get port(): number | undefined {
    return this.boundPort;
  }

  async start(): Promise<AepHarnessWebStartResult> {
    if (this.boundPort !== undefined) {
      return {
        httpUrl: `http://${this.host}:${this.boundPort}`,
        host: this.host,
        port: this.boundPort,
      };
    }

    const addr = await new Promise<AddressInfo>((resolve, reject) => {
      const onError = (err: Error) => {
        this.httpServer.off("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        this.httpServer.off("error", onError);
        const info = this.httpServer.address();
        if (info && typeof info === "object") {
          resolve(info);
        } else {
          reject(new Error("HTTP server did not return an AddressInfo"));
        }
      };
      this.httpServer.once("error", onError);
      this.httpServer.once("listening", onListening);
      this.httpServer.listen(this.requestedPort, this.host);
    });

    this.boundPort = addr.port;
    return {
      httpUrl: `http://${this.host}:${addr.port}`,
      host: this.host,
      port: addr.port,
    };
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    this.agent.stop();

    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;

    for (const client of this.sseClients) {
      if (!client.writableEnded) {
        client.end();
      }
    }
    this.sseClients.clear();

    if (this.httpServer.listening) {
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => resolve());
      });
    }

    if (this.ownsHub) {
      await this.hub.closeAll();
    }
  }

  configureProvider(next: ResolveHarnessProviderOptions & { maxSteps?: number }): void {
    const merged: ResolveHarnessProviderOptions = {
      ...this.providerOverrides,
      ...(next.provider !== undefined ? { provider: next.provider } : {}),
      ...(next.model !== undefined ? { model: next.model } : {}),
      ...(next.baseUrl !== undefined ? { baseUrl: next.baseUrl } : {}),
      ...(next.apiKey !== undefined && next.apiKey.trim().length > 0
        ? { apiKey: next.apiKey.trim() }
        : {}),
    };
    this.providerOverrides = merged;
    this.agent.setProvider(resolveHarnessProvider(merged));
    if (next.maxSteps !== undefined) {
      this.agent.setMaxSteps(next.maxSteps);
    }
    this.scheduleBroadcast();
  }

  private scheduleBroadcast(): void {
    if (this.closed || this.sseClients.size === 0 || this.broadcastTimer) {
      return;
    }
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      void this.broadcastState();
    }, 35);
  }

  private async buildStatePayload(): Promise<Record<string, unknown>> {
    const endpoints = this.hub.listEndpoints();
    let tree: unknown = { path: "/", kind: "body", children: [] };
    let head: unknown = {};
    let treeError: string | undefined;

    if (endpoints.length > 0) {
      try {
        const res = await this.hub.getTree({ path: "/", maxDepth: 8, includeHead: true });
        tree = res.node;
        head = res.head ?? {};
      } catch (err) {
        treeError = err instanceof Error ? err.message : String(err);
      }
    }

    const provider = this.agent.currentProvider;
    return {
      endpoints,
      head,
      tree,
      ...(treeError ? { treeError } : {}),
      provider: {
        name: provider.name,
        model: provider.model,
        configured: provider.configured,
        ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
        maxSteps: this.agent.currentMaxSteps,
      },
      agent: {
        isRunning: this.agent.isRunning,
        runs: this.agent.getRuns(),
      },
      logs: this.hub.getLogs(),
    };
  }

  private async broadcastState(): Promise<void> {
    if (this.sseClients.size === 0) {
      return;
    }
    try {
      const payload = await this.buildStatePayload();
      const frame = `event: state\ndata: ${JSON.stringify(payload)}\n\n`;
      for (const client of this.sseClients) {
        if (!client.writableEnded) {
          client.write(frame);
        }
      }
    } catch {
      // Ignore transient broadcast serialization errors
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    const parsedUrl = new URL(
      req.url ?? "/",
      `http://${this.host}:${this.boundPort ?? this.requestedPort}`,
    );
    const pathname = parsedUrl.pathname;

    try {
      if (method === "GET" && pathname === "/") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(renderHarnessAppHtml());
        return;
      }

      if (method === "GET" && pathname === "/api/state") {
        const state = await this.buildStatePayload();
        sendJson(res, 200, state);
        return;
      }

      if (method === "GET" && pathname === "/api/events") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        this.sseClients.add(res);
        const initial = await this.buildStatePayload();
        res.write(`event: state\ndata: ${JSON.stringify(initial)}\n\n`);
        req.on("close", () => {
          this.sseClients.delete(res);
        });
        return;
      }

      if (method === "GET" && pathname === "/api/endpoints") {
        sendJson(res, 200, { endpoints: this.hub.listEndpoints() });
        return;
      }

      if (method === "POST" && pathname === "/api/endpoints") {
        const body = await readJsonBody(req);
        const url = typeof body["url"] === "string" ? body["url"].trim() : "";
        if (!url) {
          throw new Error('Request body requires non-empty string "url"');
        }
        const mountId =
          typeof body["mountId"] === "string" && body["mountId"].trim().length > 0
            ? body["mountId"].trim()
            : undefined;
        const role =
          body["role"] === "observer" || body["role"] === "controller"
            ? (body["role"] as SessionRole)
            : undefined;
        const mode =
          body["mode"] === "json" || body["mode"] === "binary"
            ? (body["mode"] as WebSocketTransportMode)
            : undefined;
        const sourcePath =
          typeof body["sourcePath"] === "string" && body["sourcePath"].trim().length > 0
            ? body["sourcePath"].trim()
            : undefined;

        let auth: { mode: "bearer" | "api-key"; token?: string; apiKey?: string } | undefined;
        if (isPlainObject(body["auth"])) {
          const authObj = body["auth"];
          if (authObj["mode"] === "bearer" && typeof authObj["token"] === "string") {
            auth = { mode: "bearer", token: authObj["token"] };
          } else if (authObj["mode"] === "api-key" && typeof authObj["apiKey"] === "string") {
            auth = { mode: "api-key", apiKey: authObj["apiKey"] };
          }
        }

        const summary = await this.hub.connectEndpoint({
          url,
          ...(mountId !== undefined ? { mountId } : {}),
          ...(role !== undefined ? { role } : {}),
          ...(mode !== undefined ? { mode } : {}),
          ...(sourcePath !== undefined ? { sourcePath } : {}),
          ...(auth !== undefined ? { auth } : {}),
        });
        sendJson(res, 201, summary);
        return;
      }

      const epDeleteMatch = /^\/api\/endpoints\/([^/]+)$/.exec(pathname);
      if (method === "DELETE" && epDeleteMatch?.[1]) {
        const mountId = decodeURIComponent(epDeleteMatch[1]);
        await this.hub.disconnectEndpoint(mountId);
        sendJson(res, 200, { disconnected: true, mountId });
        return;
      }

      if (method === "GET" && pathname === "/api/tree") {
        const targetPath = parsedUrl.searchParams.get("path") ?? "/";
        const rawDepth = parsedUrl.searchParams.get("maxDepth");
        const maxDepth = rawDepth !== null ? Number(rawDepth) : 8;
        const treeRes = await this.hub.getTree({
          path: targetPath,
          ...(Number.isFinite(maxDepth) ? { maxDepth } : {}),
          includeHead: true,
        });
        sendJson(res, 200, treeRes);
        return;
      }

      if (method === "GET" && pathname === "/api/node") {
        const targetPath = parsedUrl.searchParams.get("path");
        if (!targetPath) {
          throw new Error('Query parameter "path" is required');
        }
        const rawDepth = parsedUrl.searchParams.get("maxDepth");
        const maxDepth = rawDepth !== null ? Number(rawDepth) : 3;
        const nodeRes = await this.hub.getNode(targetPath, {
          ...(Number.isFinite(maxDepth) ? { maxDepth } : {}),
        });
        sendJson(res, 200, nodeRes);
        return;
      }

      if (method === "POST" && pathname === "/api/children") {
        const body = await readJsonBody(req);
        if (typeof body["path"] !== "string") {
          throw new Error('Request body requires string "path"');
        }
        const resChildren = await this.hub.loadChildren(body["path"], {
          ...(typeof body["limit"] === "number" ? { limit: body["limit"] } : {}),
          ...(typeof body["cursor"] === "string" ? { cursor: body["cursor"] } : {}),
        });
        sendJson(res, 200, resChildren);
        return;
      }

      if (method === "POST" && pathname === "/api/query") {
        const body = await readJsonBody(req);
        const queryParams: TreeQueryParams = {
          ...(typeof body["rootPath"] === "string" && body["rootPath"].trim()
            ? { rootPath: body["rootPath"].trim() }
            : {}),
          ...(Array.isArray(body["kinds"])
            ? { kinds: body["kinds"].filter((k): k is NodeKind => typeof k === "string") }
            : {}),
          ...(Array.isArray(body["types"])
            ? { types: body["types"].filter((t): t is string => typeof t === "string") }
            : {}),
          ...(typeof body["hasMethod"] === "string" && body["hasMethod"].trim()
            ? { hasMethod: body["hasMethod"].trim() }
            : {}),
          ...(typeof body["textContains"] === "string" && body["textContains"].trim()
            ? { textContains: body["textContains"].trim() }
            : {}),
          ...(typeof body["maxDepth"] === "number" ? { maxDepth: body["maxDepth"] } : {}),
          ...(typeof body["limit"] === "number" ? { limit: body["limit"] } : {}),
          ...(typeof body["cursor"] === "string" ? { cursor: body["cursor"] } : {}),
        };
        const matches = await this.hub.queryTree(queryParams);
        sendJson(res, 200, matches);
        return;
      }

      if (method === "POST" && pathname === "/api/invoke") {
        const body = await readJsonBody(req);
        if (typeof body["path"] !== "string" || typeof body["method"] !== "string") {
          throw new Error('Request body requires string "path" and string "method"');
        }
        const result = await this.hub.invoke(body["path"], body["method"], body["params"] ?? {}, {
          ...(typeof body["expectedRevision"] === "number"
            ? { expectedRevision: body["expectedRevision"] }
            : {}),
          ...(typeof body["leaseId"] === "string" && body["leaseId"]
            ? { leaseId: body["leaseId"] }
            : {}),
          ...(typeof body["grantId"] === "string" && body["grantId"]
            ? { grantId: body["grantId"] }
            : {}),
        });
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && pathname === "/api/render") {
        const body = await readJsonBody(req);
        if (typeof body["path"] !== "string") {
          throw new Error('Request body requires string "path"');
        }
        const mode: RenderMode =
          body["mode"] === "renderExpress" || body["mode"] === "renderFull"
            ? body["mode"]
            : "renderMinimal";
        const rendered = await this.hub.renderSubtree(
          body["path"],
          mode,
          isPlainObject(body["params"]) ? body["params"] : undefined,
        );
        sendJson(res, 200, rendered);
        return;
      }

      if (method === "POST" && pathname === "/api/binary") {
        const body = await readJsonBody(req);
        if (typeof body["refId"] !== "string") {
          throw new Error('Request body requires string "refId"');
        }
        const binary = await this.hub.getBinary(
          body["refId"],
          isPlainObject(body["params"]) ? body["params"] : undefined,
        );
        sendJson(res, 200, binary);
        return;
      }

      if (method === "POST" && pathname === "/api/elevate") {
        const body = await readJsonBody(req);
        if (typeof body["targetPath"] !== "string" || typeof body["level"] !== "string") {
          throw new Error('Request body requires "targetPath" and "level"');
        }
        const elevRes = await this.hub.elevate({
          targetPath: body["targetPath"],
          level: body["level"] as ElevationLevel,
          reason:
            typeof body["reason"] === "string" && body["reason"].trim()
              ? body["reason"].trim()
              : "Operator elevation via AEP Web Harness",
          ...(Array.isArray(body["scopes"])
            ? { scopes: body["scopes"].filter((s): s is string => typeof s === "string") }
            : {}),
          ...(typeof body["singleUse"] === "boolean" ? { singleUse: body["singleUse"] } : {}),
          ...(typeof body["durationMs"] === "number" ? { durationMs: body["durationMs"] } : {}),
          ...(typeof body["factorType"] === "string"
            ? { factorType: body["factorType"] as AllowedFactor }
            : {}),
          ...(typeof body["proof"] === "string" ? { proof: body["proof"] } : {}),
        });
        sendJson(res, 200, elevRes);
        return;
      }

      if (method === "POST" && pathname === "/api/drop-elevation") {
        const body = await readJsonBody(req);
        if (typeof body["mountIdOrPath"] !== "string") {
          throw new Error('Request body requires string "mountIdOrPath"');
        }
        const dropRes = await this.hub.dropElevation(
          body["mountIdOrPath"],
          typeof body["grantId"] === "string" ? body["grantId"] : undefined,
        );
        sendJson(res, 200, dropRes);
        return;
      }

      if (method === "POST" && pathname === "/api/lease") {
        const body = await readJsonBody(req);
        if (typeof body["path"] !== "string") {
          throw new Error('Request body requires string "path"');
        }
        const leaseRes = await this.hub.acquireLease({
          path: body["path"],
          ...(body["mode"] === "exclusive-write" || body["mode"] === "shared-read"
            ? { mode: body["mode"] as LeaseMode }
            : {}),
          ...(typeof body["durationMs"] === "number" ? { durationMs: body["durationMs"] } : {}),
          ...(typeof body["holderName"] === "string" ? { holderName: body["holderName"] } : {}),
        });
        sendJson(res, 200, leaseRes);
        return;
      }

      if (method === "POST" && pathname === "/api/release-lease") {
        const body = await readJsonBody(req);
        if (typeof body["mountIdOrPath"] !== "string" || typeof body["leaseId"] !== "string") {
          throw new Error('Request body requires "mountIdOrPath" and "leaseId"');
        }
        const relRes = await this.hub.releaseLease(body["mountIdOrPath"], body["leaseId"]);
        sendJson(res, 200, relRes);
        return;
      }

      if (method === "POST" && pathname === "/api/command") {
        const body = await readJsonBody(req);
        const input = typeof body["input"] === "string" ? body["input"].trim() : "";
        if (!input) {
          throw new Error('Request body requires non-empty string "input"');
        }

        if (input.startsWith("/")) {
          const cmdRes = await executeSlashCommand(input, {
            hub: this.hub,
            agent: this.agent,
            onConfigureProvider: (opts) => this.configureProvider(opts),
          });
          sendJson(res, 200, { kind: "command", result: cmdRes });
          return;
        }

        if (body["wait"] === true) {
          const run = await this.agent.runGoal(input);
          sendJson(res, 200, { kind: "agent_completed", run });
          return;
        }

        if (this.agent.isRunning) {
          throw new Error("An agent run is already active. Stop it before submitting a new goal.");
        }
        if (this.hub.listEndpoints().length === 0) {
          throw new Error(
            "Connect at least one AEP endpoint first (e.g. http://127.0.0.1:8781), or run a slash command like /help.",
          );
        }

        void this.agent.runGoal(input).catch(() => {});
        sendJson(res, 202, { kind: "agent_started", goal: input });
        return;
      }

      if (method === "POST" && pathname === "/api/agent/run") {
        const body = await readJsonBody(req);
        const goal = typeof body["goal"] === "string" ? body["goal"].trim() : "";
        if (!goal) {
          throw new Error('Request body requires non-empty string "goal"');
        }
        if (body["wait"] === true) {
          const run = await this.agent.runGoal(goal);
          sendJson(res, 200, run);
          return;
        }
        if (this.agent.isRunning) {
          throw new Error("An agent run is already active.");
        }
        void this.agent.runGoal(goal).catch(() => {});
        sendJson(res, 202, { started: true, goal });
        return;
      }

      if (method === "POST" && pathname === "/api/agent/stop") {
        const stopped = this.agent.stop();
        sendJson(res, 200, { stopped });
        return;
      }

      if (method === "POST" && pathname === "/api/provider") {
        const body = await readJsonBody(req);
        this.configureProvider({
          ...(typeof body["provider"] === "string" ? { provider: body["provider"] } : {}),
          ...(typeof body["model"] === "string" && body["model"].trim()
            ? { model: body["model"].trim() }
            : {}),
          ...(typeof body["baseUrl"] === "string" && body["baseUrl"].trim()
            ? { baseUrl: body["baseUrl"].trim() }
            : {}),
          ...(typeof body["apiKey"] === "string" ? { apiKey: body["apiKey"] } : {}),
          ...(typeof body["maxSteps"] === "number" ? { maxSteps: body["maxSteps"] } : {}),
        });
        const p = this.agent.currentProvider;
        sendJson(res, 200, {
          name: p.name,
          model: p.model,
          configured: p.configured,
          ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
          maxSteps: this.agent.currentMaxSteps,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/logs/clear") {
        this.hub.clearLogs();
        this.agent.clearRuns();
        sendJson(res, 200, { cleared: true });
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      sendJson(res, status, { error: message });
    }
  }
}
