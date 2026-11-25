import type { NodeKind, Path } from "aep-node";

export type HarnessProviderName =
  | "gemini"
  | "openai"
  | "anthropic"
  | "ollama"
  | "openai-compatible"
  | "none";

export type HarnessAgentAction =
  | {
      action: "invoke";
      path: Path;
      method: string;
      params?: Record<string, unknown>;
      expectedRevision?: number;
      leaseId?: string;
      grantId?: string;
      reason?: string;
    }
  | {
      action: "get_tree";
      path?: Path;
      maxDepth?: number;
      reason?: string;
    }
  | {
      action: "get_node";
      path: Path;
      maxDepth?: number;
      reason?: string;
    }
  | {
      action: "load_children";
      path: Path;
      limit?: number;
      cursor?: string;
      reason?: string;
    }
  | {
      action: "query_tree";
      rootPath?: Path;
      kinds?: NodeKind[];
      types?: string[];
      hasMethod?: string;
      textContains?: string;
      maxDepth?: number;
      limit?: number;
      reason?: string;
    }
  | {
      action: "render";
      path: Path;
      mode?: "renderMinimal" | "renderExpress" | "renderFull";
      reason?: string;
    }
  | {
      action: "get_binary";
      refId: string;
      reason?: string;
    }
  | {
      action: "wait";
      ms?: number;
      reason?: string;
    }
  | {
      action: "done";
      summary: string;
      reason?: string;
    }
  | {
      action: "fail";
      reason: string;
    };

export interface HarnessLlmInput {
  systemPrompt: string;
  userPrompt: string;
  imageBase64?: string;
  imageMediaType?: string;
  signal?: AbortSignal;
}

export interface HarnessLlmResponse {
  action: HarnessAgentAction;
  rawText: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface HarnessLlmProvider {
  readonly name: HarnessProviderName;
  readonly model: string;
  readonly configured: boolean;
  readonly baseUrl?: string;
  decideAction(input: HarnessLlmInput): Promise<HarnessLlmResponse>;
}

export interface ResolveHarnessProviderOptions {
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

const VALID_NODE_KINDS = new Set<NodeKind>([
  "ou",
  "interface",
  "api",
  "endpoint",
  "channel",
  "structure",
  "component",
  "document",
  "view",
  "editable",
  "control",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractFirstJsonObject(raw: string): string {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(withoutThink);
  const candidate = fenced?.[1]?.trim() ?? withoutThink;

  const start = candidate.indexOf("{");
  if (start === -1) {
    throw new Error("Model output did not contain a JSON object");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(start, i + 1);
      }
    }
  }

  throw new Error("Unterminated JSON object in model output");
}

function reqString(obj: Record<string, unknown>, key: string, action: string): string {
  const val = obj[key];
  if (typeof val !== "string" || val.trim().length === 0) {
    throw new Error(`Action "${action}" requires non-empty string "${key}"`);
  }
  return val;
}

function optString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === "string" && val.length > 0 ? val : undefined;
}

function optInt(obj: Record<string, unknown>, key: string, action: string): number | undefined {
  const val = obj[key];
  if (val === undefined) {
    return undefined;
  }
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new Error(`Action "${action}" field "${key}" must be a finite number`);
  }
  return Math.round(val);
}

export function parseHarnessAgentAction(rawText: string): HarnessAgentAction {
  const jsonText = extractFirstJsonObject(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `Invalid JSON in model action: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Model action JSON must be an object");
  }

  const rawAction = parsed["action"];
  if (typeof rawAction !== "string") {
    throw new Error('Model action JSON requires string field "action"');
  }
  const reason = optString(parsed, "reason");

  switch (rawAction) {
    case "invoke":
    case "aep_invoke": {
      const path = reqString(parsed, "path", rawAction);
      const method = reqString(parsed, "method", rawAction);
      const rawParams = parsed["params"];
      if (rawParams !== undefined && !isPlainObject(rawParams)) {
        throw new Error(`Action "${rawAction}" field "params" must be a JSON object`);
      }
      const expectedRevision = optInt(parsed, "expectedRevision", rawAction);
      const leaseId = optString(parsed, "leaseId");
      const grantId = optString(parsed, "grantId");
      return {
        action: "invoke",
        path,
        method,
        ...(rawParams !== undefined ? { params: rawParams } : {}),
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        ...(leaseId !== undefined ? { leaseId } : {}),
        ...(grantId !== undefined ? { grantId } : {}),
        ...(reason !== undefined ? { reason } : {}),
      };
    }

    case "get_tree": {
      const path = optString(parsed, "path");
      const maxDepth = optInt(parsed, "maxDepth", rawAction);
      return {
        action: "get_tree",
        ...(path !== undefined ? { path } : {}),
        ...(maxDepth !== undefined ? { maxDepth: Math.max(0, maxDepth) } : {}),
        ...(reason !== undefined ? { reason } : {}),
      };
    }

    case "get_node":
    case "aep_read": {
      const path = reqString(parsed, "path", rawAction);
      const maxDepth = optInt(parsed, "maxDepth", rawAction);
      return {
        action: "get_node",
        path,
        ...(maxDepth !== undefined ? { maxDepth: Math.max(0, maxDepth) } : {}),
        ...(reason !== undefined ? { reason } : {}),
      };
    }

    case "load_children": {
      const path = reqString(parsed, "path", rawAction);
      const limit = optInt(parsed, "limit", rawAction);
      const cursor = optString(parsed, "cursor");
      return {
        action: "load_children",
        path,
        ...(limit !== undefined ? { limit: Math.max(1, limit) } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
        ...(reason !== undefined ? { reason } : {}),
      };
    }

    case "query_tree": {
      const rootPath = optString(parsed, "rootPath") ?? optString(parsed, "path");
      const rawKinds = parsed["kinds"] ?? (typeof parsed["kind"] === "string" ? [parsed["kind"]] : undefined);
      const kinds = Array.isArray(rawKinds)
        ? rawKinds.filter((k): k is NodeKind => typeof k === "string" && VALID_NODE_KINDS.has(k as NodeKind))
        : undefined;
      const rawTypes = parsed["types"] ?? (typeof parsed["type"] === "string" ? [parsed["type"]] : undefined);
      const types = Array.isArray(rawTypes)
        ? rawTypes.filter((t): t is string => typeof t === "string" && t.length > 0)
        : undefined;
      const hasMethod = optString(parsed, "hasMethod");
      const textContains = optString(parsed, "textContains") ?? optString(parsed, "text");
      const maxDepth = optInt(parsed, "maxDepth", rawAction);
      const limit = optInt(parsed, "limit", rawAction);
      return {
        action: "query_tree",
        ...(rootPath !== undefined ? { rootPath } : {}),
        ...(kinds && kinds.length > 0 ? { kinds } : {}),
        ...(types && types.length > 0 ? { types } : {}),
        ...(hasMethod !== undefined ? { hasMethod } : {}),
        ...(textContains !== undefined ? { textContains } : {}),
        ...(maxDepth !== undefined ? { maxDepth: Math.max(0, maxDepth) } : {}),
        ...(limit !== undefined ? { limit: Math.max(1, limit) } : {}),
        ...(reason !== undefined ? { reason } : {}),
      };
    }

    case "render": {
      const path = reqString(parsed, "path", rawAction);
      const rawMode = optString(parsed, "mode");
      const mode =
        rawMode === "renderMinimal" || rawMode === "renderExpress" || rawMode === "renderFull"
          ? rawMode
          : undefined;
      return {
        action: "render",
        path,
        ...(mode !== undefined ? { mode } : {}),
        ...(reason !== undefined ? { reason } : {}),
      };
    }

    case "get_binary": {
      const refId = reqString(parsed, "refId", rawAction);
      return {
        action: "get_binary",
        refId,
        ...(reason !== undefined ? { reason } : {}),
      };
    }

    case "wait": {
      const ms = optInt(parsed, "ms", rawAction);
      return {
        action: "wait",
        ...(ms !== undefined ? { ms: Math.min(10_000, Math.max(50, ms)) } : {}),
        ...(reason !== undefined ? { reason } : {}),
      };
    }

    case "done": {
      const summary = optString(parsed, "summary") ?? reason ?? "Completed goal";
      return {
        action: "done",
        summary,
        ...(reason !== undefined ? { reason } : {}),
      };
    }

    case "fail": {
      const failReason = reason ?? optString(parsed, "summary") ?? "Agent reported failure";
      return {
        action: "fail",
        reason: failReason,
      };
    }

    default:
      throw new Error(`Unsupported agent action "${rawAction}"`);
  }
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function apiKeyNonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

class GeminiHarnessProvider implements HarnessLlmProvider {
  readonly name = "gemini" as const;
  readonly model: string;
  readonly configured: boolean;
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: { model: string; baseUrl: string; apiKey: string; fetchImpl?: typeof fetch }) {
    this.model = opts.model;
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.apiKey = opts.apiKey;
    this.configured = apiKeyNonEmpty(opts.apiKey);
    this.fetchFn = opts.fetchImpl ?? fetch;
  }

  async decideAction(input: HarnessLlmInput): Promise<HarnessLlmResponse> {
    if (!this.configured) {
      throw new Error(
        'Provider "gemini" requires GEMINI_API_KEY or GOOGLE_API_KEY (configure in .env or Provider Settings).',
      );
    }

    const parts: Array<Record<string, unknown>> = [{ text: input.userPrompt }];
    if (input.imageBase64 && input.imageMediaType) {
      parts.push({
        inlineData: {
          mimeType: input.imageMediaType,
          data: input.imageBase64,
        },
      });
    }

    const endpoint = `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const res = await this.fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: input.systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: "application/json",
        },
      }),
      signal: input.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`gemini API error (${res.status}): ${errText.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const rawText = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();

    if (!rawText) {
      throw new Error("gemini returned an empty response");
    }

    return {
      action: parseHarnessAgentAction(rawText),
      rawText,
      ...(data.usageMetadata
        ? {
            usage: {
              inputTokens: data.usageMetadata.promptTokenCount,
              outputTokens: data.usageMetadata.candidatesTokenCount,
            },
          }
        : {}),
    };
  }
}

class OpenAiResponsesHarnessProvider implements HarnessLlmProvider {
  readonly name = "openai" as const;
  readonly model: string;
  readonly configured: boolean;
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly reasoningEffort?: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: {
    model: string;
    baseUrl: string;
    apiKey: string;
    reasoningEffort?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.model = opts.model;
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.apiKey = opts.apiKey;
    this.configured = apiKeyNonEmpty(opts.apiKey);
    this.reasoningEffort = opts.reasoningEffort?.trim() || undefined;
    this.fetchFn = opts.fetchImpl ?? fetch;
  }

  async decideAction(input: HarnessLlmInput): Promise<HarnessLlmResponse> {
    if (!this.configured) {
      throw new Error(
        'Provider "openai" requires OPENAI_API_KEY (configure in .env or Provider Settings).',
      );
    }

    const content: Array<Record<string, unknown>> = [
      { type: "input_text", text: input.userPrompt },
    ];
    if (input.imageBase64 && input.imageMediaType) {
      content.push({
        type: "input_image",
        image_url: `data:${input.imageMediaType};base64,${input.imageBase64}`,
      });
    }

    const reqBody: Record<string, unknown> = {
      model: this.model,
      instructions: input.systemPrompt,
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } },
    };
    if (this.reasoningEffort) {
      reqBody["reasoning"] = { effort: this.reasoningEffort };
    }

    const res = await this.fetchFn(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(reqBody),
      signal: input.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`openai API error (${res.status}): ${errText.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      output_text?: string;
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    let rawText =
      typeof data.output_text === "string" && data.output_text.trim().length > 0
        ? data.output_text
        : "";
    if (!rawText && Array.isArray(data.output)) {
      const chunks: string[] = [];
      for (const item of data.output) {
        if (item.type !== "message" || !Array.isArray(item.content)) {
          continue;
        }
        for (const block of item.content) {
          if (typeof block.text === "string") {
            chunks.push(block.text);
          }
        }
      }
      rawText = chunks.join("\n").trim();
    }

    if (!rawText) {
      throw new Error("openai returned an empty response");
    }

    return {
      action: parseHarnessAgentAction(rawText),
      rawText,
      ...(data.usage
        ? {
            usage: {
              inputTokens: data.usage.input_tokens,
              outputTokens: data.usage.output_tokens,
            },
          }
        : {}),
    };
  }
}

class OpenAiCompatibleHarnessProvider implements HarnessLlmProvider {
  readonly name: HarnessProviderName;
  readonly model: string;
  readonly configured: boolean;
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly useJsonResponseFormat: boolean;
  private readonly fetchFn: typeof fetch;

  constructor(opts: {
    name: HarnessProviderName;
    model: string;
    baseUrl: string;
    apiKey: string;
    configured: boolean;
    useJsonResponseFormat: boolean;
    fetchImpl?: typeof fetch;
  }) {
    this.name = opts.name;
    this.model = opts.model;
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.apiKey = opts.apiKey;
    this.configured = opts.configured;
    this.useJsonResponseFormat = opts.useJsonResponseFormat;
    this.fetchFn = opts.fetchImpl ?? fetch;
  }

  async decideAction(input: HarnessLlmInput): Promise<HarnessLlmResponse> {
    if (!this.configured) {
      throw new Error(`Provider "${this.name}" is not configured.`);
    }

    const userContent: unknown =
      input.imageBase64 && input.imageMediaType
        ? [
            { type: "text", text: input.userPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${input.imageMediaType};base64,${input.imageBase64}`,
              },
            },
          ]
        : input.userPrompt;

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: userContent },
      ],
    };
    if (this.useJsonResponseFormat) {
      body["response_format"] = { type: "json_object" };
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`${this.name} API error (${res.status}): ${errText.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const msgContent = data.choices?.[0]?.message?.content;
    const rawText =
      typeof msgContent === "string"
        ? msgContent
        : Array.isArray(msgContent)
          ? msgContent.map((part) => part.text ?? "").join("\n")
          : "";

    if (!rawText) {
      throw new Error(`${this.name} returned an empty response`);
    }

    return {
      action: parseHarnessAgentAction(rawText),
      rawText,
      ...(data.usage
        ? {
            usage: {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
            },
          }
        : {}),
    };
  }
}

class AnthropicHarnessProvider implements HarnessLlmProvider {
  readonly name = "anthropic" as const;
  readonly model: string;
  readonly configured: boolean;
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: { model: string; baseUrl: string; apiKey: string; fetchImpl?: typeof fetch }) {
    this.model = opts.model;
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.apiKey = opts.apiKey;
    this.configured = apiKeyNonEmpty(opts.apiKey);
    this.fetchFn = opts.fetchImpl ?? fetch;
  }

  async decideAction(input: HarnessLlmInput): Promise<HarnessLlmResponse> {
    if (!this.configured) {
      throw new Error(
        'Provider "anthropic" requires ANTHROPIC_API_KEY (configure in .env or Provider Settings).',
      );
    }

    const content: Array<Record<string, unknown>> = [];
    if (input.imageBase64 && input.imageMediaType) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: input.imageMediaType,
          data: input.imageBase64,
        },
      });
    }
    content.push({ type: "text", text: input.userPrompt });

    const res = await this.fetchFn(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1536,
        temperature: 0.15,
        system: input.systemPrompt,
        messages: [{ role: "user", content }],
      }),
      signal: input.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`anthropic API error (${res.status}): ${errText.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const rawText = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
      .join("\n")
      .trim();

    if (!rawText) {
      throw new Error("anthropic returned an empty response");
    }

    return {
      action: parseHarnessAgentAction(rawText),
      rawText,
      ...(data.usage
        ? {
            usage: {
              inputTokens: data.usage.input_tokens,
              outputTokens: data.usage.output_tokens,
            },
          }
        : {}),
    };
  }
}

class UnconfiguredHarnessProvider implements HarnessLlmProvider {
  readonly name = "none" as const;
  readonly model = "manual";
  readonly configured = false;

  async decideAction(): Promise<HarnessLlmResponse> {
    throw new Error(
      "No LLM provider is configured. Click Provider Settings in the top bar (or set GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_HOST in .env), or use slash commands like /help, /tree, /invoke.",
    );
  }
}

function detectProviderName(requested?: string): HarnessProviderName {
  const normalized = (requested ?? process.env["AEP_AGENT_PROVIDER"] ?? "auto").trim().toLowerCase();
  if (normalized === "none" || normalized === "manual") {
    return "none";
  }
  if (normalized === "gemini" || normalized === "google") {
    return "gemini";
  }
  if (normalized === "openai") {
    return "openai";
  }
  if (normalized === "anthropic") {
    return "anthropic";
  }
  if (normalized === "ollama") {
    return "ollama";
  }
  if (normalized === "openai-compatible" || normalized === "openai_compatible") {
    return "openai-compatible";
  }
  if (normalized !== "auto" && normalized !== "") {
    throw new Error(
      `Unknown provider "${requested}". Expected: auto, gemini, openai, anthropic, ollama, openai-compatible, none.`,
    );
  }

  if (apiKeyNonEmpty(process.env["GEMINI_API_KEY"]) || apiKeyNonEmpty(process.env["GOOGLE_API_KEY"])) {
    return "gemini";
  }
  if (apiKeyNonEmpty(process.env["OPENAI_API_KEY"])) {
    return "openai";
  }
  if (apiKeyNonEmpty(process.env["ANTHROPIC_API_KEY"])) {
    return "anthropic";
  }
  if (apiKeyNonEmpty(process.env["OLLAMA_HOST"]) || apiKeyNonEmpty(process.env["OLLAMA_MODEL"])) {
    return "ollama";
  }
  if (apiKeyNonEmpty(process.env["OPENAI_BASE_URL"])) {
    return "openai-compatible";
  }
  return "none";
}

export function resolveHarnessProvider(
  options: ResolveHarnessProviderOptions = {},
): HarnessLlmProvider {
  const providerName = detectProviderName(options.provider);
  const envModel = process.env["AEP_AGENT_MODEL"];

  switch (providerName) {
    case "gemini": {
      const apiKey =
        options.apiKey ?? process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"] ?? "";
      const model = options.model ?? envModel ?? process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash";
      const baseUrl =
        options.baseUrl ??
        process.env["GEMINI_BASE_URL"] ??
        "https://generativelanguage.googleapis.com";
      return new GeminiHarnessProvider({
        model,
        baseUrl,
        apiKey,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    }
    case "openai": {
      const apiKey = options.apiKey ?? process.env["OPENAI_API_KEY"] ?? "";
      const model = options.model ?? envModel ?? process.env["OPENAI_MODEL"] ?? "gpt-4.1-mini";
      const baseUrl =
        options.baseUrl ?? process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";
      const reasoningEffort = process.env["OPENAI_REASONING_EFFORT"];
      return new OpenAiResponsesHarnessProvider({
        model,
        baseUrl,
        apiKey,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    }
    case "anthropic": {
      const apiKey = options.apiKey ?? process.env["ANTHROPIC_API_KEY"] ?? "";
      const model =
        options.model ?? envModel ?? process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-20250514";
      const baseUrl =
        options.baseUrl ?? process.env["ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com";
      return new AnthropicHarnessProvider({
        model,
        baseUrl,
        apiKey,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    }
    case "ollama": {
      const host = normalizeBaseUrl(process.env["OLLAMA_HOST"] ?? "http://127.0.0.1:11434");
      const baseUrl = options.baseUrl ?? (host.endsWith("/v1") ? host : `${host}/v1`);
      const model = options.model ?? envModel ?? process.env["OLLAMA_MODEL"] ?? "llama3.2";
      const apiKey = options.apiKey ?? "ollama";
      return new OpenAiCompatibleHarnessProvider({
        name: "ollama",
        model,
        baseUrl,
        apiKey,
        configured: true,
        useJsonResponseFormat: false,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    }
    case "openai-compatible": {
      const baseUrl =
        options.baseUrl ?? process.env["OPENAI_BASE_URL"] ?? "http://127.0.0.1:8000/v1";
      const model = options.model ?? envModel ?? process.env["OPENAI_MODEL"] ?? "gpt-4o-mini";
      const apiKey = options.apiKey ?? process.env["OPENAI_API_KEY"] ?? "";
      return new OpenAiCompatibleHarnessProvider({
        name: "openai-compatible",
        model,
        baseUrl,
        apiKey,
        configured: Boolean(baseUrl),
        useJsonResponseFormat: false,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    }
    case "none":
    default:
      return new UnconfiguredHarnessProvider();
  }
}
