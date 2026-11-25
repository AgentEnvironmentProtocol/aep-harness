import { randomUUID } from "node:crypto";
import type { HarnessAgentAction, HarnessLlmProvider } from "./llm-provider.js";
import type { AepHarnessHub } from "./session-hub.js";
import { formatTreeDigest } from "./tree-formatter.js";

export type HarnessAgentStatus = "idle" | "running" | "done" | "failed" | "max_steps" | "aborted";

export interface HarnessAgentStep {
  step: number;
  timestamp: string;
  phase: "thinking" | "acted" | "error";
  action?: HarnessAgentAction;
  outcomeSummary?: string;
  durationMs?: number;
  error?: string;
}

export interface HarnessAgentRun {
  id: string;
  goal: string;
  provider: string;
  model: string;
  status: Exclude<HarnessAgentStatus, "idle">;
  maxSteps: number;
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  steps: HarnessAgentStep[];
}

export interface AepHarnessAgentOptions {
  maxSteps?: number;
  settleDelayMs?: number;
  includeImages?: boolean;
}

function buildHarnessSystemPrompt(): string {
  return `You are an autonomous agent operating through the Agent Environment Protocol (AEP) Harness.
You observe a unified composite AEP I/O tree ("Body of Senses") representing one or more connected target apps, workspaces, browsers, or devices, and you act strictly by issuing AEP control/data plane actions.

Available JSON actions (respond with ONLY a single valid JSON object and no extra prose):
- {"action":"invoke","path":"/tables/active-table","method":"addRecord","params":{"values":{"title":"Buy milk"}},"reason":"Why you are invoking this method"}
- {"action":"get_tree","path":"/tables","maxDepth":6,"reason":"Inspect a subtree in greater depth"}
- {"action":"get_node","path":"/tables/active-table","maxDepth":3,"reason":"Read a specific node and its properties/state/methods"}
- {"action":"load_children","path":"/some/lazy-node","limit":50,"reason":"Load lazy child nodes"}
- {"action":"query_tree","rootPath":"/","kinds":["editable","control"],"hasMethod":"setValue","textContains":"search","limit":30,"reason":"Search the AEP tree"}
- {"action":"render","path":"/tables","mode":"renderMinimal","reason":"Synthesize a layout wireframe and path map"}
- {"action":"get_binary","refId":"mount::binary-id","reason":"Fetch binary data or image snapshot"}
- {"action":"wait","ms":500,"reason":"Wait briefly for asynchronous state to settle"}
- {"action":"done","summary":"Clear summary of what was accomplished and current state","reason":"Goal is complete"}
- {"action":"fail","reason":"Clear explanation of why the goal cannot be completed"}

Rules:
1. Read each node's path, current state, and -> method signatures carefully. Pass "params" matching the method's parameter names and types.
2. Prefer high-level semantic methods on interface/structure/document/endpoint nodes (such as createTable, addField, addRecord, setCell, queryRecords, updateBlock) when available, or invoke "setValue" / "invoke" on editable/control leaf nodes when appropriate.
3. After mutating state, inspect the updated AEP tree in the next step to verify your change took effect before returning "done".
4. Never invent paths or method names that do not exist in the AEP tree; if part of the tree was truncated, call "get_tree", "get_node", or "query_tree" first.`;
}

function summarizeActionResult(value: unknown, maxChars = 1600): string {
  if (value === undefined) {
    return "ok";
  }
  if (typeof value === "string") {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars)}…(truncated)`;
  }
  const serialized = JSON.stringify(value);
  if (!serialized) {
    return String(value);
  }
  return serialized.length <= maxChars
    ? serialized
    : `${serialized.slice(0, maxChars)}…(truncated)`;
}

export class AepHarnessAgent {
  private readonly hub: AepHarnessHub;
  private provider: HarnessLlmProvider;
  private maxSteps: number;
  private readonly settleDelayMs: number;
  private readonly includeImages: boolean;
  private activeAbortController: AbortController | null = null;
  private readonly runs: HarnessAgentRun[] = [];
  private readonly listeners = new Set<(run: HarnessAgentRun) => void>();

  constructor(
    hub: AepHarnessHub,
    provider: HarnessLlmProvider,
    options: AepHarnessAgentOptions = {},
  ) {
    this.hub = hub;
    this.provider = provider;
    this.maxSteps = options.maxSteps ?? 25;
    this.settleDelayMs = options.settleDelayMs ?? 120;
    this.includeImages = options.includeImages ?? true;
  }

  get currentProvider(): HarnessLlmProvider {
    return this.provider;
  }

  setProvider(provider: HarnessLlmProvider): void {
    this.provider = provider;
  }

  get currentMaxSteps(): number {
    return this.maxSteps;
  }

  setMaxSteps(steps: number): void {
    if (!Number.isInteger(steps) || steps < 1 || steps > 200) {
      throw new Error("maxSteps must be an integer between 1 and 200");
    }
    this.maxSteps = steps;
  }

  get isRunning(): boolean {
    return this.activeAbortController !== null;
  }

  getRuns(): HarnessAgentRun[] {
    return this.runs.map((r) => structuredClone(r));
  }

  clearRuns(): void {
    if (this.isRunning) {
      return;
    }
    this.runs.length = 0;
  }

  onUpdate(listener: (run: HarnessAgentRun) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(run: HarnessAgentRun): void {
    for (const listener of this.listeners) {
      listener(run);
    }
  }

  stop(): boolean {
    if (!this.activeAbortController) {
      return false;
    }
    this.activeAbortController.abort();
    return true;
  }

  async runGoal(goal: string, externalSignal?: AbortSignal): Promise<HarnessAgentRun> {
    const trimmedGoal = goal.trim();
    if (!trimmedGoal) {
      throw new Error("Goal must be a non-empty string");
    }
    if (this.activeAbortController) {
      throw new Error("An agent run is already in progress. Stop it first before starting another.");
    }

    const endpoints = this.hub.listEndpoints();
    if (endpoints.length === 0) {
      throw new Error(
        "No AEP endpoints are connected. Connect an endpoint first (e.g. ws://127.0.0.1:8781/aep or http://127.0.0.1:8781).",
      );
    }

    const controller = new AbortController();
    this.activeAbortController = controller;
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    const run: HarnessAgentRun = {
      id: `run-${randomUUID().slice(0, 8)}`,
      goal: trimmedGoal,
      provider: this.provider.name,
      model: this.provider.model,
      status: "running",
      maxSteps: this.maxSteps,
      startedAt: new Date().toISOString(),
      steps: [],
    };
    this.runs.push(run);
    if (this.runs.length > 30) {
      this.runs.splice(0, this.runs.length - 30);
    }

    this.hub.pushLog({
      kind: "agent",
      level: "info",
      title: `Agent started: "${trimmedGoal}"`,
      detail: `provider=${this.provider.name} model=${this.provider.model} maxSteps=${this.maxSteps}`,
    });
    this.notify(run);

    const historyLines: string[] = [];
    let focusedInspectionText = "";

    try {
      for (let stepNum = 1; stepNum <= this.maxSteps; stepNum += 1) {
        if (controller.signal.aborted) {
          run.status = "aborted";
          run.summary = "Stopped by user";
          run.finishedAt = new Date().toISOString();
          this.hub.pushLog({
            kind: "agent",
            level: "warn",
            title: `Agent aborted at step ${stepNum}`,
          });
          this.notify(run);
          return structuredClone(run);
        }

        const stepRecord: HarnessAgentStep = {
          step: stepNum,
          timestamp: new Date().toISOString(),
          phase: "thinking",
        };
        run.steps.push(stepRecord);
        this.notify(run);

        const treeSnap = await this.hub.getTree({ path: "/", maxDepth: 7, includeHead: true });
        const treeDigest = formatTreeDigest(treeSnap.node, "/", {
          maxDepth: 7,
          maxNodes: 220,
        });

        const imageShot = this.includeImages ? await this.hub.findFirstImageBinary() : null;

        const endpointsDesc = this.hub
          .listEndpoints()
          .map(
            (ep) =>
              `- ${ep.anchorPath} (${ep.serverInfo?.name ?? "AEP"} v${ep.serverInfo?.version ?? "?"}, role=${ep.role}, connected=${ep.connected})`,
          )
          .join("\n");

        const recentHistory =
          historyLines.length > 0
            ? historyLines.slice(-12).map((h) => `  ${h}`).join("\n")
            : "  (none yet)";

        const extraFocus = focusedInspectionText
          ? `\nFocused Inspection Output from Previous Step:\n${focusedInspectionText}\n`
          : "";

        const userPrompt = `Goal: ${trimmedGoal}
Step: ${stepNum}/${this.maxSteps}

Mounted AEP Endpoints:
${endpointsDesc}

Live Composite AEP Tree:
${treeDigest}
${extraFocus}
Recent Step History:
${recentHistory}

Decide the single next JSON action to achieve the goal.`;

        focusedInspectionText = "";
        const stepStart = Date.now();

        let action: HarnessAgentAction;
        try {
          const llmRes = await this.provider.decideAction({
            systemPrompt: buildHarnessSystemPrompt(),
            userPrompt,
            ...(imageShot
              ? { imageBase64: imageShot.base64Data, imageMediaType: imageShot.mediaType }
              : {}),
            signal: controller.signal,
          });
          action = llmRes.action;
        } catch (err) {
          if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
            run.steps.pop();
            run.status = "aborted";
            run.summary = "Stopped by user";
            run.finishedAt = new Date().toISOString();
            this.notify(run);
            return structuredClone(run);
          }

          const errMsg = err instanceof Error ? err.message : String(err);
          stepRecord.phase = "error";
          stepRecord.error = errMsg;
          stepRecord.durationMs = Date.now() - stepStart;

          if (!this.provider.configured) {
            run.status = "failed";
            run.summary = errMsg;
            run.finishedAt = new Date().toISOString();
            this.hub.pushLog({
              kind: "agent",
              level: "error",
              title: "Agent cannot run: LLM provider not configured",
              detail: errMsg,
            });
            this.notify(run);
            return structuredClone(run);
          }

          historyLines.push(`[Step ${stepNum}] LLM output parse/API error: ${errMsg}`);
          this.notify(run);
          continue;
        }

        stepRecord.action = action;

        if (action.action === "done") {
          stepRecord.phase = "acted";
          stepRecord.outcomeSummary = action.summary;
          stepRecord.durationMs = Date.now() - stepStart;
          run.status = "done";
          run.summary = action.summary;
          run.finishedAt = new Date().toISOString();
          this.hub.pushLog({
            kind: "agent",
            level: "ok",
            title: `Agent completed in ${stepNum} step${stepNum === 1 ? "" : "s"}`,
            detail: action.summary,
          });
          this.notify(run);
          return structuredClone(run);
        }

        if (action.action === "fail") {
          stepRecord.phase = "error";
          stepRecord.error = action.reason;
          stepRecord.durationMs = Date.now() - stepStart;
          run.status = "failed";
          run.summary = action.reason;
          run.finishedAt = new Date().toISOString();
          this.hub.pushLog({
            kind: "agent",
            level: "error",
            title: `Agent reported failure at step ${stepNum}`,
            detail: action.reason,
          });
          this.notify(run);
          return structuredClone(run);
        }

        try {
          const execRes = await this.executeAction(action);
          stepRecord.phase = "acted";
          stepRecord.outcomeSummary = execRes.summary;
          stepRecord.durationMs = Date.now() - stepStart;
          if (execRes.focusedText) {
            focusedInspectionText = execRes.focusedText;
          }
          const { reason: _r, ...compactAction } = action;
          historyLines.push(
            `[Step ${stepNum}] ${JSON.stringify(compactAction)} => ${execRes.summary}`,
          );
          this.notify(run);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          stepRecord.phase = "error";
          stepRecord.error = errMsg;
          stepRecord.durationMs = Date.now() - stepStart;
          const { reason: _r, ...compactAction } = action;
          historyLines.push(
            `[Step ${stepNum}] ${JSON.stringify(compactAction)} => ERROR: ${errMsg}`,
          );
          this.notify(run);
        }

        if (this.settleDelayMs > 0 && !controller.signal.aborted) {
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, this.settleDelayMs);
            controller.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(t);
                resolve();
              },
              { once: true },
            );
          });
        }
      }

      const maxSummary = `Reached maxSteps (${this.maxSteps}) without completion`;
      run.status = "max_steps";
      run.summary = maxSummary;
      run.finishedAt = new Date().toISOString();
      this.hub.pushLog({
        kind: "agent",
        level: "warn",
        title: maxSummary,
      });
      this.notify(run);
      return structuredClone(run);
    } finally {
      this.activeAbortController = null;
    }
  }

  private async executeAction(
    action: HarnessAgentAction,
  ): Promise<{ summary: string; focusedText?: string }> {
    switch (action.action) {
      case "invoke": {
        const res = await this.hub.invoke(action.path, action.method, action.params ?? {}, {
          ...(action.expectedRevision !== undefined
            ? { expectedRevision: action.expectedRevision }
            : {}),
          ...(action.leaseId !== undefined ? { leaseId: action.leaseId } : {}),
          ...(action.grantId !== undefined ? { grantId: action.grantId } : {}),
        });
        return { summary: summarizeActionResult(res.result) };
      }
      case "get_tree": {
        const targetPath = action.path ?? "/";
        const res = await this.hub.getTree({
          path: targetPath,
          maxDepth: action.maxDepth ?? 6,
          includeHead: false,
        });
        const digest = formatTreeDigest(res.node, targetPath, {
          maxDepth: action.maxDepth ?? 6,
          maxNodes: 200,
        });
        return {
          summary: `Fetched subtree ${targetPath} (${digest.split("\n").length} lines)`,
          focusedText: digest,
        };
      }
      case "get_node": {
        const res = await this.hub.getNode(action.path, {
          ...(action.maxDepth !== undefined ? { maxDepth: action.maxDepth } : { maxDepth: 3 }),
        });
        const json = summarizeActionResult(res.node, 3000);
        return {
          summary: `Read node ${action.path} (${res.node.kind})`,
          focusedText: json,
        };
      }
      case "load_children": {
        const res = await this.hub.loadChildren(action.path, {
          ...(action.limit !== undefined ? { limit: action.limit } : {}),
          ...(action.cursor !== undefined ? { cursor: action.cursor } : {}),
        });
        return {
          summary: `Loaded ${res.children.length} children under ${action.path} (hasMore=${Boolean(res.hasMore)})`,
          focusedText: summarizeActionResult(
            res.children.map((c) => ({ id: c.id, kind: c.kind })),
            2000,
          ),
        };
      }
      case "query_tree": {
        const res = await this.hub.queryTree({
          ...(action.rootPath !== undefined ? { rootPath: action.rootPath } : {}),
          ...(action.kinds !== undefined ? { kinds: action.kinds } : {}),
          ...(action.types !== undefined ? { types: action.types } : {}),
          ...(action.hasMethod !== undefined ? { hasMethod: action.hasMethod } : {}),
          ...(action.textContains !== undefined ? { textContains: action.textContains } : {}),
          ...(action.maxDepth !== undefined ? { maxDepth: action.maxDepth } : {}),
          limit: action.limit ?? 30,
        });
        const lines = res.matches.map(
          (m) =>
            `${m.path} [${m.node.kind}${"type" in m.node && m.node.type ? `:${m.node.type}` : ""}]`,
        );
        return {
          summary: `Found ${res.matches.length} match(es) (total=${res.totalCount})`,
          focusedText: lines.join("\n") || "(no matches)",
        };
      }
      case "render": {
        const res = await this.hub.renderSubtree(action.path, action.mode ?? "renderMinimal");
        const mapSummary = res.pathMap ? summarizeActionResult(res.pathMap, 1500) : "(no pathMap)";
        return {
          summary: `Rendered ${action.path} (${res.mode}, ${res.mediaType}, ${res.byteLength} bytes)`,
          focusedText: `Path Map:\n${mapSummary}`,
        };
      }
      case "get_binary": {
        const res = await this.hub.getBinary(action.refId);
        return {
          summary: `Fetched binary ${res.refId} (${res.mediaType}, ${res.byteLength} bytes)`,
          ...(res.textPreview ? { focusedText: res.textPreview } : {}),
        };
      }
      case "wait": {
        const ms = action.ms ?? 500;
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { summary: `Waited ${ms}ms` };
      }
      case "done":
      case "fail":
        return { summary: "ok" };
    }
  }
}
