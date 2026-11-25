export function renderHarnessAppHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AEP Harness</title>
    <style>
      :root {
        --bg: #0b1120;
        --panel: #111827;
        --panel-alt: #1e293b;
        --panel-hover: #263349;
        --border: #334155;
        --text: #e2e8f0;
        --muted: #94a3b8;
        --accent: #6366f1;
        --accent-hover: #818cf8;
        --ok: #22c55e;
        --warn: #f59e0b;
        --danger: #ef4444;
        --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        overflow: hidden;
      }
      .shell {
        display: grid;
        grid-template-rows: 54px 1fr;
        width: 100vw;
        height: 100vh;
      }
      .topbar {
        background: var(--panel);
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 14px;
        gap: 12px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        white-space: nowrap;
      }
      .brand h1 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 7px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(99, 102, 241, 0.16);
        color: #c7d2fe;
        border: 1px solid rgba(99, 102, 241, 0.35);
      }
      .connect-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        max-width: 820px;
      }
      input, select, textarea {
        background: var(--bg);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 6px 9px;
        font-size: 12.5px;
        font-family: inherit;
      }
      input:focus, select:focus, textarea:focus {
        outline: none;
        border-color: var(--accent);
      }
      .connect-bar .url-input {
        flex: 1;
        min-width: 180px;
        font-family: var(--mono);
        font-size: 12px;
      }
      .connect-bar .mount-input {
        width: 115px;
        font-family: var(--mono);
        font-size: 12px;
      }
      .preset-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .chip {
        background: rgba(148, 163, 184, 0.12);
        color: var(--muted);
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 11px;
        cursor: pointer;
        white-space: nowrap;
      }
      .chip:hover {
        color: var(--text);
        background: rgba(99, 102, 241, 0.2);
        border-color: rgba(99, 102, 241, 0.5);
      }
      button {
        background: var(--accent);
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 6px 11px;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      button:hover { background: var(--accent-hover); }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      button.secondary {
        background: var(--panel-alt);
        color: var(--text);
        border: 1px solid var(--border);
      }
      button.secondary:hover { background: var(--panel-hover); }
      button.danger {
        background: rgba(239, 68, 68, 0.18);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.4);
      }
      button.danger:hover { background: rgba(239, 68, 68, 0.3); }
      button.sm {
        padding: 3px 8px;
        font-size: 11.5px;
      }
      .top-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
        background: var(--ok);
      }
      .dot.warn { background: var(--warn); }
      .dot.off { background: var(--danger); }

      .workspace {
        display: grid;
        grid-template-columns: 330px 1fr 410px;
        min-height: 0;
        height: 100%;
      }
      .pane {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        border-right: 1px solid var(--border);
      }
      .pane:last-child { border-right: none; }
      .pane-header {
        padding: 9px 12px;
        background: var(--panel);
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .pane-title {
        font-size: 11.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--muted);
      }
      .scroll-y {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }

      /* Endpoints list */
      .endpoints-box {
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
        background: rgba(17, 24, 39, 0.65);
        max-height: 195px;
        overflow-y: auto;
      }
      .ep-card {
        padding: 7px 9px;
        border: 1px solid var(--border);
        border-radius: 7px;
        background: var(--panel);
        margin-bottom: 6px;
      }
      .ep-card:last-child { margin-bottom: 0; }
      .ep-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .ep-anchor {
        font-family: var(--mono);
        font-weight: 700;
        color: #c7d2fe;
        cursor: pointer;
      }
      .ep-anchor:hover { text-decoration: underline; }
      .ep-sub {
        margin-top: 3px;
        font-size: 11px;
        color: var(--muted);
        word-break: break-all;
      }

      /* Tree explorer */
      .tree-toolbar {
        padding: 7px 10px;
        border-bottom: 1px solid var(--border);
        display: flex;
        gap: 6px;
      }
      .tree-toolbar input { flex: 1; min-width: 0; padding: 5px 8px; font-size: 12px; }
      .tree-container { padding: 6px 6px 18px 6px; }
      .tree-row {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 4px 6px;
        border-radius: 5px;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        overflow: hidden;
      }
      .tree-row:hover { background: rgba(148, 163, 184, 0.1); }
      .tree-row.selected {
        background: rgba(99, 102, 241, 0.24);
        outline: 1px solid rgba(99, 102, 241, 0.55);
      }
      .caret {
        width: 14px;
        text-align: center;
        color: var(--muted);
        font-size: 10px;
        flex-shrink: 0;
      }
      .kind-pill {
        font-family: var(--mono);
        font-size: 10px;
        padding: 1px 5px;
        border-radius: 4px;
        flex-shrink: 0;
        font-weight: 600;
      }
      .k-interface { background: rgba(168, 85, 247, 0.2); color: #e9d5ff; }
      .k-structure { background: rgba(100, 116, 139, 0.25); color: #cbd5e1; }
      .k-editable  { background: rgba(34, 197, 94, 0.2); color: #bbf7d0; }
      .k-control   { background: rgba(99, 102, 241, 0.25); color: #c7d2fe; }
      .k-view      { background: rgba(14, 165, 233, 0.2); color: #bae6fd; }
      .k-ou        { background: rgba(245, 158, 11, 0.2); color: #fde68a; }
      .k-channel   { background: rgba(244, 63, 94, 0.2); color: #fecdd3; }
      .k-document, .k-component, .k-api, .k-endpoint {
        background: rgba(20, 184, 166, 0.2); color: #99f6e4;
      }
      .node-id { font-family: var(--mono); font-size: 12px; font-weight: 600; }
      .node-type { color: var(--muted); font-size: 11px; }
      .node-val {
        color: #86efac;
        font-family: var(--mono);
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .method-count {
        margin-left: auto;
        font-size: 10px;
        color: #fde68a;
        background: rgba(245, 158, 11, 0.14);
        padding: 1px 5px;
        border-radius: 999px;
        flex-shrink: 0;
      }

      /* Tabs */
      .tabs {
        display: flex;
        gap: 4px;
      }
      .tab-btn {
        background: transparent;
        color: var(--muted);
        border: 1px solid transparent;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
      }
      .tab-btn:hover { background: rgba(148, 163, 184, 0.1); color: var(--text); }
      .tab-btn.active {
        background: rgba(99, 102, 241, 0.2);
        color: #fff;
        border-color: rgba(99, 102, 241, 0.45);
      }

      /* Inspector */
      .inspector-body { padding: 14px; }
      .path-banner {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 12px;
      }
      .path-code {
        font-family: var(--mono);
        font-size: 13px;
        font-weight: 700;
        color: #e0e7ff;
        word-break: break-all;
      }
      .meta-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }
      .section-card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 11px 12px;
        margin-bottom: 12px;
      }
      .section-card h3 {
        margin: 0 0 9px 0;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: var(--muted);
      }
      .method-card {
        border: 1px solid var(--border);
        border-radius: 7px;
        padding: 10px;
        margin-bottom: 10px;
        background: rgba(15, 23, 42, 0.65);
      }
      .method-card:last-child { margin-bottom: 0; }
      .method-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .method-name {
        font-family: var(--mono);
        font-size: 13px;
        font-weight: 700;
        color: #c7d2fe;
      }
      .method-desc {
        margin: 5px 0 8px 0;
        color: var(--muted);
        font-size: 12px;
      }
      .field-grid {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 6px 10px;
        align-items: center;
        margin-bottom: 8px;
      }
      .field-label {
        font-family: var(--mono);
        font-size: 11.5px;
        color: #cbd5e1;
      }
      .field-label .req { color: var(--danger); margin-left: 2px; }
      .json-box {
        width: 100%;
        min-height: 64px;
        font-family: var(--mono);
        font-size: 11.5px;
        resize: vertical;
      }
      pre.code-view {
        margin: 0;
        padding: 9px;
        background: #070b14;
        border: 1px solid var(--border);
        border-radius: 6px;
        font-family: var(--mono);
        font-size: 11.5px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        color: #cbd5e1;
      }
      .invoke-result {
        margin-top: 8px;
      }

      /* Render preview */
      .render-surface {
        background: #070b14;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px;
        overflow: auto;
        max-height: 480px;
      }
      .render-surface svg, .render-surface img {
        max-width: 100%;
        height: auto;
        display: block;
      }

      /* Right pane: Console & Agent */
      .feed {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .run-card {
        background: var(--panel);
        border: 1px solid rgba(99, 102, 241, 0.45);
        border-radius: 8px;
        padding: 10px;
      }
      .run-goal {
        font-weight: 700;
        color: #e0e7ff;
        margin-bottom: 6px;
      }
      .step-item {
        border-left: 2px solid var(--border);
        padding-left: 8px;
        margin-top: 6px;
        font-size: 11.5px;
      }
      .step-item.ok { border-left-color: var(--ok); }
      .step-item.err { border-left-color: var(--danger); }
      .log-item {
        padding: 7px 9px;
        border-radius: 6px;
        background: var(--panel);
        border: 1px solid var(--border);
        font-size: 11.5px;
      }
      .log-item.error { border-color: rgba(239, 68, 68, 0.5); }
      .log-item.ok { border-color: rgba(34, 197, 94, 0.35); }
      .log-head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-family: var(--mono);
        font-weight: 600;
      }
      .log-time { color: var(--muted); font-size: 10.5px; font-weight: 400; }
      .log-detail {
        margin-top: 4px;
        color: var(--muted);
        white-space: pre-wrap;
        word-break: break-word;
        font-family: var(--mono);
        font-size: 11px;
      }
      .prompt-dock {
        border-top: 1px solid var(--border);
        background: var(--panel);
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .quick-cmds {
        display: flex;
        gap: 5px;
        overflow-x: auto;
        padding-bottom: 2px;
      }
      .prompt-row {
        display: flex;
        gap: 6px;
        align-items: flex-end;
      }
      .prompt-row textarea {
        flex: 1;
        min-height: 38px;
        max-height: 110px;
        resize: vertical;
        font-size: 12.5px;
      }
      .empty-hint {
        padding: 24px 16px;
        text-align: center;
        color: var(--muted);
        line-height: 1.5;
      }

      /* Modal */
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 50;
      }
      .modal-backdrop.open { display: flex; }
      .modal {
        width: 440px;
        max-width: 94vw;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 16px;
      }
      .modal h2 { margin: 0 0 12px 0; font-size: 15px; }
      .form-row { margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px; }
      .form-row label { font-size: 11.5px; color: var(--muted); font-weight: 600; }
      .toast {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: #1e293b;
        border: 1px solid var(--accent);
        color: #fff;
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 12.5px;
        display: none;
        z-index: 100;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <h1>AEP Harness</h1>
          <span class="badge">Web Prototype</span>
        </div>

        <form id="connectForm" class="connect-bar">
          <input
            id="connectUrl"
            class="url-input"
            type="text"
            placeholder="http://127.0.0.1:8781 or ws://127.0.0.1:8781/aep"
            value="http://127.0.0.1:8781"
          />
          <input id="connectMountId" class="mount-input" type="text" placeholder="mountId (auto)" />
          <select id="connectRole" title="Session Role">
            <option value="controller">controller</option>
            <option value="observer">observer</option>
          </select>
          <button type="submit" id="connectBtn">Connect</button>
          <div class="preset-group">
            <span class="chip" data-preset="http://127.0.0.1:8781" title="AEP Tables App">:8781 Tables</span>
            <span class="chip" data-preset="http://127.0.0.1:8780" title="AEP Docs App">:8780 Docs</span>
            <span class="chip" data-preset="ws://127.0.0.1:8765/aep" title="AEP Browser Server">:8765 Browser</span>
          </div>
        </form>

        <div class="top-actions">
          <button type="button" class="secondary sm" id="refreshBtn">Refresh Tree</button>
          <button type="button" class="secondary sm" id="providerBtn">
            <span id="providerDot" class="dot warn"></span>
            <span id="providerLabel">LLM: checking…</span>
          </button>
        </div>
      </header>

      <main class="workspace">
        <!-- Left Pane: Endpoints & Tree -->
        <section class="pane">
          <div class="pane-header">
            <span class="pane-title">Body of Senses (Endpoints & Tree)</span>
            <span id="epCountBadge" class="badge">0 mounted</span>
          </div>
          <div id="endpointsBox" class="endpoints-box"></div>
          <div class="tree-toolbar">
            <input id="treeFilter" type="text" placeholder="Filter path, kind, value, method…" />
            <button type="button" class="secondary sm" id="expandAllBtn" title="Expand all">＋</button>
            <button type="button" class="secondary sm" id="collapseAllBtn" title="Collapse">－</button>
          </div>
          <div id="treeContainer" class="scroll-y tree-container"></div>
        </section>

        <!-- Center Pane: Node Inspector, Query & Render -->
        <section class="pane">
          <div class="pane-header">
            <div class="tabs">
              <button type="button" class="tab-btn active" data-tab="inspector">Inspector & Methods</button>
              <button type="button" class="tab-btn" data-tab="query">Tree Query</button>
              <button type="button" class="tab-btn" data-tab="render">Visual Preview</button>
            </div>
            <span id="selectedPathHint" style="font-family:var(--mono);font-size:11px;color:var(--muted);">/</span>
          </div>
          <div id="centerContent" class="scroll-y inspector-body"></div>
        </section>

        <!-- Right Pane: AI Agent & Command Console -->
        <section class="pane">
          <div class="pane-header">
            <div class="tabs" id="feedTabs">
              <button type="button" class="tab-btn active" data-feed="all">All</button>
              <button type="button" class="tab-btn" data-feed="ops">Agent & Cmds</button>
              <button type="button" class="tab-btn" data-feed="events">AEP Events</button>
            </div>
            <div style="display:flex;gap:6px;">
              <button type="button" class="danger sm" id="stopAgentBtn" style="display:none;">Stop</button>
              <button type="button" class="secondary sm" id="clearLogsBtn">Clear</button>
            </div>
          </div>
          <div id="feedContainer" class="scroll-y feed"></div>
          <div class="prompt-dock">
            <div class="quick-cmds">
              <span class="chip" data-cmd="/help">/help</span>
              <span class="chip" data-cmd="/tree">/tree</span>
              <span class="chip" data-cmd="/endpoints">/endpoints</span>
              <span class="chip" data-cmd="/query hasMethod=setValue">/query setValue</span>
              <span class="chip" data-cmd="/render /tables">/render</span>
            </div>
            <form id="promptForm" class="prompt-row">
              <textarea
                id="promptInput"
                rows="2"
                placeholder="Enter a natural-language goal for the AI agent, or /command (e.g. /invoke /tables listTables {})…"
              ></textarea>
              <button type="submit" id="sendPromptBtn">Run</button>
            </form>
          </div>
        </section>
      </main>
    </div>

    <!-- Provider Settings Modal -->
    <div id="providerModal" class="modal-backdrop">
      <div class="modal">
        <h2>LLM Provider Settings</h2>
        <form id="providerForm">
          <div class="form-row">
            <label>Provider</label>
            <select id="cfgProvider">
              <option value="auto">auto (detect from API key / .env)</option>
              <option value="gemini">gemini</option>
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
              <option value="ollama">ollama (local)</option>
              <option value="openai-compatible">openai-compatible</option>
              <option value="none">none (manual mode only)</option>
            </select>
          </div>
          <div class="form-row">
            <label>Model (optional override)</label>
            <input id="cfgModel" type="text" placeholder="e.g. gemini-2.5-flash, gpt-4.1-mini, claude-sonnet-4-20250514" />
          </div>
          <div class="form-row">
            <label>API Key (stored in server memory only; leave blank to keep current/.env)</label>
            <input id="cfgApiKey" type="password" placeholder="Paste API key…" autocomplete="off" />
          </div>
          <div class="form-row">
            <label>Custom Base URL (optional)</label>
            <input id="cfgBaseUrl" type="text" placeholder="e.g. http://127.0.0.1:11434/v1" />
          </div>
          <div class="form-row">
            <label>Max Autonomous Steps</label>
            <input id="cfgMaxSteps" type="number" min="1" max="200" value="25" />
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
            <button type="button" class="secondary" id="closeModalBtn">Cancel</button>
            <button type="submit">Save Settings</button>
          </div>
        </form>
      </div>
    </div>

    <div id="toast" class="toast"></div>

    <script>
      const state = {
        endpoints: [],
        head: {},
        tree: { path: "/", kind: "body", children: [] },
        provider: { name: "none", model: "manual", configured: false, maxSteps: 25 },
        agent: { isRunning: false, runs: [] },
        logs: [],
        selectedPath: "/",
        centerTab: "inspector",
        feedFilter: "all",
        treeFilter: "",
        collapsedPaths: new Set(),
        methodDrafts: {},
        methodRawMode: {},
        methodResults: {},
        commandOutputs: [],
        cmdHistory: [],
        cmdHistoryIdx: -1,
        queryForm: { rootPath: "/", kind: "", type: "", hasMethod: "", textContains: "", limit: 50 },
        queryResult: null,
        renderForm: { path: "", mode: "renderMinimal" },
        renderResult: null,
        binaryResult: null,
        lastInspectorSignature: "",
      };

      function esc(val) {
        return String(val ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      let toastTimer = null;
      function showToast(msg) {
        const el = document.getElementById("toast");
        el.textContent = msg;
        el.style.display = "block";
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.style.display = "none"; }, 3200);
      }

      async function api(url, method = "GET", body) {
        const res = await fetch(url, {
          method,
          headers: body !== undefined ? { "Content-Type": "application/json" } : {},
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || ("HTTP " + res.status));
        }
        return data;
      }

      function findNodeByPath(root, targetPath) {
        if (!root) return null;
        if (targetPath === "/" || !targetPath) return root;
        const segments = targetPath.split("/").filter(Boolean);
        let cur = root;
        for (const seg of segments) {
          const children = cur.children || [];
          const next = children.find((c) => c.id === seg);
          if (!next) return null;
          cur = next;
        }
        return cur;
      }

      function applyServerState(next) {
        state.endpoints = next.endpoints || [];
        state.head = next.head || {};
        state.tree = next.tree || { path: "/", kind: "body", children: [] };
        state.provider = next.provider || state.provider;
        state.agent = next.agent || { isRunning: false, runs: [] };
        state.logs = next.logs || [];

        if (
          state.selectedPath === "/" &&
          state.tree &&
          Array.isArray(state.tree.children) &&
          state.tree.children.length > 0
        ) {
          state.selectedPath = "/" + state.tree.children[0].id;
        } else if (state.selectedPath !== "/" && !findNodeByPath(state.tree, state.selectedPath)) {
          state.selectedPath =
            state.tree.children && state.tree.children[0]
              ? "/" + state.tree.children[0].id
              : "/";
        }

        renderHeader();
        renderEndpoints();
        renderTree();
        renderCenter(false);
        renderFeed();
      }

      function renderHeader() {
        const dot = document.getElementById("providerDot");
        const lbl = document.getElementById("providerLabel");
        dot.className = "dot " + (state.provider.configured ? "" : "warn");
        lbl.textContent = state.provider.configured
          ? state.provider.name + " · " + state.provider.model
          : "LLM: manual mode";

        const stopBtn = document.getElementById("stopAgentBtn");
        stopBtn.style.display = state.agent.isRunning ? "inline-block" : "none";
      }

      function renderEndpoints() {
        const badge = document.getElementById("epCountBadge");
        badge.textContent = state.endpoints.length + " mounted";
        const box = document.getElementById("endpointsBox");
        if (state.endpoints.length === 0) {
          box.innerHTML = '<div style="color:var(--muted);font-size:11.5px;padding:4px 2px;">No AEP endpoints connected yet. Enter a URL above and click <b>Connect</b>.</div>';
          return;
        }
        box.innerHTML = state.endpoints
          .map((ep) => {
            const sName = ep.serverInfo ? ep.serverInfo.name + " v" + ep.serverInfo.version : "AEP Server";
            return \`
              <div class="ep-card">
                <div class="ep-row">
                  <span class="ep-anchor" data-select-path="\${esc(ep.anchorPath)}">
                    <span class="dot \${ep.connected ? "" : "off"}"></span>
                    \${esc(ep.anchorPath)}
                  </span>
                  <div style="display:flex;gap:4px;align-items:center;">
                    <span class="badge" style="font-size:10px;">\${esc(ep.role)}</span>
                    <button type="button" class="secondary sm" data-render-ep="\${esc(ep.anchorPath)}" title="Render wireframe">Wireframe</button>
                    <button type="button" class="danger sm" data-disconnect="\${esc(ep.mountId)}" title="Disconnect">×</button>
                  </div>
                </div>
                <div class="ep-sub">\${esc(sName)} · \${esc(ep.resolvedEndpoint)}</div>
              </div>\`;
          })
          .join("");
      }

      function nodeMatchesFilter(node, path, q) {
        if (!q) return true;
        const hay = [
          path,
          node.kind,
          node.type || "",
          node.properties?.title || "",
          node.properties?.label || "",
          node.state?.value !== undefined ? JSON.stringify(node.state.value) : "",
          ...(node.methods || []).map((m) => m.name),
        ]
          .join(" ")
          .toLowerCase();
        if (hay.includes(q)) return true;
        if (Array.isArray(node.children)) {
          return node.children.some((c) =>
            nodeMatchesFilter(c, path === "/" ? "/" + c.id : path + "/" + c.id, q),
          );
        }
        return false;
      }

      function renderTree() {
        const container = document.getElementById("treeContainer");
        const children = state.tree?.children || [];
        if (children.length === 0) {
          container.innerHTML = '<div class="empty-hint">Connect an AEP endpoint (such as <code>http://127.0.0.1:8781</code>) to browse its live I/O tree and invoke commands.</div>';
          return;
        }
        const q = state.treeFilter.trim().toLowerCase();
        const html = [];

        function walk(node, path, depth) {
          if (!nodeMatchesFilter(node, path, q)) return;
          const hasKids = Array.isArray(node.children) && node.children.length > 0;
          const isLazy = Boolean(node.hasChildren) && !hasKids;
          const collapsed = !q && state.collapsedPaths.has(path);
          const isSelected = state.selectedPath === path;
          const pad = depth * 13 + 4;
          const caretChar = hasKids ? (collapsed ? "▶" : "▼") : isLazy ? "…" : "";
          const valPreview =
            node.state && node.state.value !== undefined
              ? node.type === "passwordField"
                ? '"••••"'
                : JSON.stringify(node.state.value)
              : "";
          const mCount = Array.isArray(node.methods) ? node.methods.length : 0;

          html.push(\`
            <div class="tree-row \${isSelected ? "selected" : ""}" style="padding-left:\${pad}px" data-tree-path="\${esc(path)}">
              <span class="caret" data-toggle-path="\${hasKids ? esc(path) : ""}">\${caretChar}</span>
              <span class="kind-pill k-\${esc(node.kind)}">\${esc(node.kind)}</span>
              <span class="node-id">\${esc(node.id)}</span>
              \${node.type ? \`<span class="node-type">:\${esc(node.type)}</span>\` : ""}
              \${valPreview ? \`<span class="node-val">= \${esc(valPreview.slice(0, 36))}</span>\` : ""}
              \${isLazy ? \`<button type="button" class="secondary sm" data-lazy-path="\${esc(path)}" style="padding:1px 5px;font-size:10px;">Load</button>\` : ""}
              \${mCount > 0 ? \`<span class="method-count" title="\${mCount} callable method(s)">⚡\${mCount}</span>\` : ""}
            </div>\`);

          if (hasKids && !collapsed) {
            for (const child of node.children) {
              walk(child, path + "/" + child.id, depth + 1);
            }
          }
        }

        for (const top of children) {
          walk(top, "/" + top.id, 0);
        }
        container.innerHTML = html.join("");
      }

      function computeInspectorSignature(node, path) {
        if (!node) return "empty:" + path;
        return JSON.stringify({
          path,
          tab: state.centerTab,
          rev: node.revision,
          kind: node.kind,
          type: node.type,
          state: node.state,
          props: node.properties,
          methods: (node.methods || []).map((m) => m.name),
          resKeys: Object.keys(state.methodResults).filter((k) => k.startsWith(path + "::")).map((k) => state.methodResults[k]?.ts),
          binRef: state.binaryResult?.refId,
        });
      }

      function renderCenter(force = true) {
        document.getElementById("selectedPathHint").textContent = state.selectedPath;
        document.querySelectorAll("[data-tab]").forEach((btn) => {
          btn.classList.toggle("active", btn.getAttribute("data-tab") === state.centerTab);
        });

        const container = document.getElementById("centerContent");

        if (state.centerTab === "query") {
          if (!force && container.dataset.renderedTab === "query") return;
          container.dataset.renderedTab = "query";
          renderQueryTab(container);
          return;
        }

        if (state.centerTab === "render") {
          if (!force && container.dataset.renderedTab === "render") return;
          container.dataset.renderedTab = "render";
          renderPreviewTab(container);
          return;
        }

        const node = findNodeByPath(state.tree, state.selectedPath);
        const sig = computeInspectorSignature(node, state.selectedPath);
        const activeEl = document.activeElement;
        const editingInsideCenter = activeEl && container.contains(activeEl) && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT");
        if (!force && editingInsideCenter && container.dataset.sig === sig) {
          return;
        }
        if (!force && container.dataset.sig === sig && container.dataset.renderedTab === "inspector") {
          return;
        }
        container.dataset.renderedTab = "inspector";
        container.dataset.sig = sig;
        renderInspectorTab(container, node);
      }

      function renderInspectorTab(container, node) {
        if (!node || state.selectedPath === "/" || node.kind === "body") {
          container.innerHTML = '<div class="empty-hint">Select any node in the AEP Tree on the left to inspect its properties, live state, events, and invoke methods.</div>';
          return;
        }

        const path = state.selectedPath;
        const methods = node.methods || [];
        const hasSetValue = node.kind === "editable" && methods.some((m) => m.name === "setValue");
        const curVal = node.state?.value;

        let quickEditHtml = "";
        if (hasSetValue) {
          let inputControl = "";
          if (node.type === "checkbox" || node.type === "switch" || typeof curVal === "boolean") {
            inputControl = \`<select id="quickSetValInput"><option value="true" \${curVal === true ? "selected" : ""}>true</option><option value="false" \${curVal === false ? "selected" : ""}>false</option></select>\`;
          } else if (node.type === "numberField" || typeof curVal === "number") {
            inputControl = \`<input id="quickSetValInput" type="number" step="any" value="\${esc(curVal ?? "")}" style="flex:1;" />\`;
          } else if (node.type === "dateField") {
            inputControl = \`<input id="quickSetValInput" type="date" value="\${esc(curVal ?? "")}" style="flex:1;" />\`;
          } else {
            inputControl = \`<input id="quickSetValInput" type="text" value="\${esc(typeof curVal === "string" ? curVal : curVal !== undefined ? JSON.stringify(curVal) : "")}" style="flex:1;" />\`;
          }
          quickEditHtml = \`
            <div class="section-card">
              <h3>Quick Editable Value</h3>
              <form id="quickSetValForm" style="display:flex;gap:8px;align-items:center;" data-node-type="\${esc(node.type || "")}">
                \${inputControl}
                <button type="submit">Set Value</button>
              </form>
            </div>\`;
        }

        const methodsHtml =
          methods.length === 0
            ? '<div style="color:var(--muted);font-size:12px;">No callable methods declared on this node.</div>'
            : methods.map((m) => renderMethodCard(path, node, m)).join("");

        const binaryBtnHtml = node.state?.binaryRef
          ? \`<div style="margin-top:8px;"><button type="button" class="secondary sm" data-fetch-binary="\${esc(node.state.binaryRef.refId)}">Fetch Binary (\${esc(node.state.binaryRef.refId)} · \${esc(node.state.binaryRef.mediaType)})</button></div>\`
          : "";

        const binPreviewHtml =
          state.binaryResult && node.state?.binaryRef?.refId === state.binaryResult.refId
            ? state.binaryResult.mediaType.startsWith("image/")
              ? \`<div class="render-surface" style="margin-top:8px;"><img src="data:\${esc(state.binaryResult.mediaType)};base64,\${state.binaryResult.base64Data}" alt="binaryRef" /></div>\`
              : \`<pre class="code-view" style="margin-top:8px;">\${esc(state.binaryResult.textPreview || ("Binary " + state.binaryResult.byteLength + " bytes"))}</pre>\`
            : "";

        container.innerHTML = \`
          <div class="path-banner">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <div class="path-code">\${esc(path)}</div>
              <div style="display:flex;gap:6px;">
                <button type="button" class="secondary sm" data-copy-path="\${esc(path)}">Copy</button>
                <button type="button" class="secondary sm" data-render-ep="\${esc(path)}">Render</button>
              </div>
            </div>
            <div class="meta-pills">
              <span class="kind-pill k-\${esc(node.kind)}">\${esc(node.kind)}</span>
              \${node.type ? \`<span class="badge">type: \${esc(node.type)}</span>\` : ""}
              \${node.revision !== undefined ? \`<span class="badge">rev: \${esc(node.revision)}</span>\` : ""}
              \${node.uid ? \`<span class="badge">uid: \${esc(node.uid)}</span>\` : ""}
              \${(node.properties?.elevation?.level && node.properties.elevation.level !== "none") ? \`<span class="badge" style="color:#fde68a;">elev: \${esc(node.properties.elevation.level)}</span>\` : ""}
            </div>
          </div>

          \${quickEditHtml}

          <div class="section-card">
            <h3>Methods (\${methods.length})</h3>
            \${methodsHtml}
          </div>

          <div class="section-card">
            <h3>State</h3>
            <pre class="code-view">\${esc(JSON.stringify(node.state || {}, null, 2))}</pre>
            \${binaryBtnHtml}
            \${binPreviewHtml}
          </div>

          <div class="section-card">
            <h3>Properties</h3>
            <pre class="code-view">\${esc(JSON.stringify(node.properties || {}, null, 2))}</pre>
          </div>

          \${node.events && node.events.length > 0 ? \`
          <div class="section-card">
            <h3>Declared Events (\${node.events.length})</h3>
            <pre class="code-view">\${esc(JSON.stringify(node.events, null, 2))}</pre>
          </div>\` : ""}

          <div class="section-card">
            <h3>Session Controls (Lease & Elevation)</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="secondary sm" data-acquire-lease="\${esc(path)}">Acquire Exclusive Lease</button>
              <button type="button" class="secondary sm" data-elevate-path="\${esc(path)}">Request Confirm Elevation</button>
            </div>
          </div>
        \`;
      }

      function renderMethodCard(path, node, m) {
        const key = path + "::" + m.name;
        const props = m.inputSchema && typeof m.inputSchema.properties === "object" && !Array.isArray(m.inputSchema.properties)
          ? m.inputSchema.properties
          : null;
        const propEntries = props ? Object.entries(props) : [];
        const reqSet = new Set(Array.isArray(m.inputSchema?.required) ? m.inputSchema.required : []);
        const rawMode = Boolean(state.methodRawMode[key]) || propEntries.length === 0;

        if (!state.methodDrafts[key]) {
          state.methodDrafts[key] = { fields: {}, raw: "{}" };
        }
        const draft = state.methodDrafts[key];

        let formBody = "";
        if (!rawMode && propEntries.length > 0) {
          const rows = propEntries.map(([field, def]) => {
            const d = def && typeof def === "object" ? def : {};
            const isReq = reqSet.has(field);
            const cur = draft.fields[field] ?? "";
            let inputEl = "";
            if (Array.isArray(d.enum) && d.enum.length > 0) {
              const opts = ['<option value="">(select)</option>'].concat(
                d.enum.map((ev) => \`<option value="\${esc(JSON.stringify(ev))}" \${cur === JSON.stringify(ev) ? "selected" : ""}>\${esc(ev)}</option>\`),
              );
              inputEl = \`<select data-mkey="\${esc(key)}" data-mfield="\${esc(field)}" data-mtype="enum">\${opts.join("")}</select>\`;
            } else if (d.type === "boolean") {
              inputEl = \`<select data-mkey="\${esc(key)}" data-mfield="\${esc(field)}" data-mtype="boolean">
                <option value="" \${cur === "" ? "selected" : ""}>(unset)</option>
                <option value="true" \${cur === "true" ? "selected" : ""}>true</option>
                <option value="false" \${cur === "false" ? "selected" : ""}>false</option>
              </select>\`;
            } else if (d.type === "number" || d.type === "integer") {
              inputEl = \`<input type="number" step="\${d.type === "integer" ? "1" : "any"}" value="\${esc(cur)}" placeholder="\${esc(d.description || d.type)}" data-mkey="\${esc(key)}" data-mfield="\${esc(field)}" data-mtype="number" />\`;
            } else if (d.type === "object" || d.type === "array") {
              inputEl = \`<textarea class="json-box" style="min-height:46px;" placeholder='\${d.type === "array" ? "[]" : "{}"}' data-mkey="\${esc(key)}" data-mfield="\${esc(field)}" data-mtype="json">\${esc(cur)}</textarea>\`;
            } else {
              inputEl = \`<input type="text" value="\${esc(cur)}" placeholder="\${esc(d.description || "string")}" data-mkey="\${esc(key)}" data-mfield="\${esc(field)}" data-mtype="string" />\`;
            }
            return \`
              <div class="field-label">\${esc(field)}\${isReq ? '<span class="req">*</span>' : ""}</div>
              <div>\${inputEl}</div>\`;
          });
          formBody = \`<div class="field-grid">\${rows.join("")}</div>\`;
        } else if (m.inputSchema) {
          formBody = \`<textarea class="json-box" data-mraw="\${esc(key)}" placeholder='{"key": "value"}'>\${esc(draft.raw)}</textarea>\`;
        }

        const resEntry = state.methodResults[key];
        const resHtml = resEntry
          ? \`<div class="invoke-result">
              <pre class="code-view" style="border-color:\${resEntry.ok ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.55)"};">\${esc(resEntry.text)}</pre>
            </div>\`
          : "";

        return \`
          <div class="method-card">
            <div class="method-head">
              <div>
                <span class="method-name">\${esc(m.name)}</span>
                \${m.sideEffects ? \`<span class="badge" style="margin-left:6px;font-size:10px;">\${esc(m.sideEffects)}</span>\` : ""}
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                \${propEntries.length > 0 ? \`<button type="button" class="secondary sm" data-toggle-raw="\${esc(key)}">\${rawMode ? "Form" : "JSON"}</button>\` : ""}
                <button type="button" class="sm" data-invoke-key="\${esc(key)}" data-invoke-path="\${esc(path)}" data-invoke-method="\${esc(m.name)}">Invoke</button>
              </div>
            </div>
            \${m.description ? \`<div class="method-desc">\${esc(m.description)}</div>\` : '<div style="height:6px;"></div>'}
            \${formBody}
            \${resHtml}
          </div>\`;
      }

      function renderQueryTab(container) {
        const qf = state.queryForm;
        const matches = state.queryResult?.matches || [];
        const listHtml = state.queryResult
          ? matches.length === 0
            ? '<div style="color:var(--muted);margin-top:10px;">No matching nodes found.</div>'
            : matches
                .map(
                  (m) => \`
                  <div class="ep-card" style="cursor:pointer;" data-select-path="\${esc(m.path)}">
                    <div class="ep-row">
                      <span class="ep-anchor">\${esc(m.path)}</span>
                      <span class="kind-pill k-\${esc(m.node.kind)}">\${esc(m.node.kind)}\${m.node.type ? ":" + esc(m.node.type) : ""}</span>
                    </div>
                    <div class="ep-sub">methods: \${esc((m.node.methods || []).map((x) => x.name).join(", ") || "(none)")}</div>
                  </div>\`,
                )
                .join("")
          : "";

        container.innerHTML = \`
          <div class="section-card">
            <h3>Search Composite Tree (tree.query)</h3>
            <form id="queryFormEl">
              <div class="field-grid">
                <div class="field-label">rootPath</div>
                <input id="qRootPath" type="text" value="\${esc(qf.rootPath)}" placeholder="/" />
                <div class="field-label">kind</div>
                <select id="qKind">
                  <option value="">(any)</option>
                  \${["ou","interface","structure","editable","control","view","document","component","api","endpoint","channel"].map((k) => \`<option value="\${k}" \${qf.kind === k ? "selected" : ""}>\${k}</option>\`).join("")}
                </select>
                <div class="field-label">type</div>
                <input id="qType" type="text" value="\${esc(qf.type)}" placeholder="e.g. button, textField, row" />
                <div class="field-label">hasMethod</div>
                <input id="qMethod" type="text" value="\${esc(qf.hasMethod)}" placeholder="e.g. setValue, addRecord" />
                <div class="field-label">textContains</div>
                <input id="qText" type="text" value="\${esc(qf.textContains)}" placeholder="Search labels, titles, values…" />
              </div>
              <button type="submit">Run Query</button>
            </form>
          </div>
          \${state.queryResult ? \`<div class="section-card"><h3>Results (\${matches.length} / \${state.queryResult.totalCount})</h3>\${listHtml}</div>\` : ""}
        \`;
      }

      function renderPreviewTab(container) {
        const defaultPath =
          state.renderForm.path ||
          (state.selectedPath !== "/" ? state.selectedPath : state.endpoints[0]?.anchorPath || "/tables");
        const rr = state.renderResult;
        let previewBody = '<div style="color:var(--muted);">Click <b>Render Subtree</b> to synthesize an interactive AEP wireframe or fetch server render output.</div>';
        if (rr) {
          const surface = rr.svgText
            ? rr.svgText
            : rr.base64Data
              ? \`<img src="data:\${esc(rr.mediaType)};base64,\${rr.base64Data}" alt="render" />\`
              : "";
          const mapEntries = Object.entries(rr.pathMap || {});
          const mapChips = mapEntries.length
            ? \`<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:5px;">
                \${mapEntries.map(([marker, p]) => \`<span class="chip" data-select-path="\${esc(p)}">\${esc(marker)} → \${esc(p)}</span>\`).join("")}
              </div>\`
            : "";
          previewBody = \`
            <div style="margin-bottom:8px;font-size:11.5px;color:var(--muted);">
              \${esc(rr.path)} · \${esc(rr.mode)} · \${esc(rr.mediaType)} (\${rr.byteLength} bytes\${rr.synthesizedFallback ? ", synthesized client-side" : ""})
            </div>
            <div class="render-surface">\${surface}</div>
            \${mapChips}
          \`;
        }

        container.innerHTML = \`
          <div class="section-card">
            <h3>Visual Wireframe & Surface Render</h3>
            <form id="renderFormEl" style="display:flex;gap:8px;margin-bottom:12px;">
              <input id="rPathInput" type="text" value="\${esc(defaultPath)}" style="flex:1;font-family:var(--mono);" />
              <select id="rModeSelect">
                <option value="renderMinimal" \${state.renderForm.mode === "renderMinimal" ? "selected" : ""}>renderMinimal</option>
                <option value="renderExpress" \${state.renderForm.mode === "renderExpress" ? "selected" : ""}>renderExpress</option>
                <option value="renderFull" \${state.renderForm.mode === "renderFull" ? "selected" : ""}>renderFull</option>
              </select>
              <button type="submit">Render Subtree</button>
            </form>
            \${previewBody}
          </div>
        \`;
      }

      function renderFeed() {
        document.querySelectorAll("#feedTabs .tab-btn").forEach((b) => {
          b.classList.toggle("active", b.getAttribute("data-feed") === state.feedFilter);
        });
        const feed = document.getElementById("feedContainer");
        const items = [];

        if (state.feedFilter !== "events") {
          for (const run of state.agent.runs) {
            const stepsHtml = (run.steps || [])
              .map((s) => {
                const actDesc = s.action
                  ? s.action.action === "invoke"
                    ? \`invoke \${s.action.path} :: \${s.action.method}(\${JSON.stringify(s.action.params || {})})\`
                    : JSON.stringify(s.action)
                  : "thinking…";
                const cls = s.phase === "error" ? "err" : s.phase === "acted" ? "ok" : "";
                return \`
                  <div class="step-item \${cls}">
                    <div style="font-family:var(--mono);font-weight:600;">Step \${s.step}: \${esc(actDesc)}</div>
                    \${s.action?.reason ? \`<div style="color:var(--muted);">\${esc(s.action.reason)}</div>\` : ""}
                    \${s.outcomeSummary ? \`<div style="color:#86efac;font-family:var(--mono);">↳ \${esc(s.outcomeSummary.slice(0, 260))}</div>\` : ""}
                    \${s.error ? \`<div style="color:#fca5a5;">↳ \${esc(s.error)}</div>\` : ""}
                  </div>\`;
              })
              .join("");

            items.push({
              ts: run.startedAt,
              html: \`
                <div class="run-card">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span class="badge">\${esc(run.provider)} · \${esc(run.status.toUpperCase())}</span>
                    <span class="log-time">\${esc(new Date(run.startedAt).toLocaleTimeString())}</span>
                  </div>
                  <div class="run-goal">\${esc(run.goal)}</div>
                  \${stepsHtml}
                  \${run.summary ? \`<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border);color:#c7d2fe;">\${esc(run.summary)}</div>\` : ""}
                </div>\`,
            });
          }

          for (const cmdOut of state.commandOutputs) {
            items.push({
              ts: cmdOut.ts,
              html: \`
                <div class="log-item \${cmdOut.ok ? "ok" : "error"}">
                  <div class="log-head">
                    <span>\${esc(cmdOut.command)}</span>
                    <span class="log-time">\${esc(new Date(cmdOut.ts).toLocaleTimeString())}</span>
                  </div>
                  <div class="log-detail">\${esc(cmdOut.output)}</div>
                </div>\`,
            });
          }
        }

        for (const log of state.logs) {
          if (state.feedFilter === "ops" && log.kind === "notification") continue;
          if (state.feedFilter === "events" && log.kind !== "notification") continue;
          if (state.feedFilter === "all" && log.kind === "agent") continue;
          items.push({
            ts: log.timestamp,
            html: \`
              <div class="log-item \${esc(log.level)}">
                <div class="log-head">
                  <span>\${esc(log.title)}</span>
                  <span class="log-time">\${esc(new Date(log.timestamp).toLocaleTimeString())}</span>
                </div>
                \${log.detail ? \`<div class="log-detail">\${esc(log.detail)}</div>\` : ""}
              </div>\`,
          });
        }

        items.sort((a, b) => a.ts.localeCompare(b.ts));
        if (items.length === 0) {
          feed.innerHTML = '<div class="empty-hint">Activity, command outputs, and autonomous agent runs appear here in real time.</div>';
          return;
        }
        const wasNearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
        feed.innerHTML = items.map((x) => x.html).join("");
        if (wasNearBottom) {
          feed.scrollTop = feed.scrollHeight;
        }
      }

      // Event Delegation & Handlers
      document.getElementById("connectForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const url = document.getElementById("connectUrl").value.trim();
        const mountId = document.getElementById("connectMountId").value.trim();
        const role = document.getElementById("connectRole").value;
        if (!url) return;
        const btn = document.getElementById("connectBtn");
        btn.disabled = true;
        try {
          const ep = await api("/api/endpoints", "POST", {
            url,
            ...(mountId ? { mountId } : {}),
            role,
          });
          state.selectedPath = ep.anchorPath;
          document.getElementById("connectMountId").value = "";
          showToast("Mounted " + ep.anchorPath);
          const next = await api("/api/state");
          applyServerState(next);
        } catch (err) {
          showToast("Connect failed: " + err.message);
        } finally {
          btn.disabled = false;
        }
      });

      document.querySelectorAll("[data-preset]").forEach((chip) => {
        chip.addEventListener("click", () => {
          document.getElementById("connectUrl").value = chip.getAttribute("data-preset");
          document.getElementById("connectForm").requestSubmit();
        });
      });

      document.getElementById("refreshBtn").addEventListener("click", async () => {
        try {
          const next = await api("/api/state");
          applyServerState(next);
          showToast("Tree refreshed");
        } catch (err) {
          showToast(err.message);
        }
      });

      document.getElementById("treeFilter").addEventListener("input", (e) => {
        state.treeFilter = e.target.value;
        renderTree();
      });

      document.getElementById("expandAllBtn").addEventListener("click", () => {
        state.collapsedPaths.clear();
        renderTree();
      });

      document.getElementById("collapseAllBtn").addEventListener("click", () => {
        function collect(node, path) {
          if (Array.isArray(node.children) && node.children.length > 0) {
            state.collapsedPaths.add(path);
            for (const c of node.children) collect(c, path + "/" + c.id);
          }
        }
        for (const top of state.tree?.children || []) collect(top, "/" + top.id);
        renderTree();
      });

      document.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.centerTab = btn.getAttribute("data-tab");
          renderCenter(true);
        });
      });

      document.querySelectorAll("#feedTabs .tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.feedFilter = btn.getAttribute("data-feed");
          renderFeed();
        });
      });

      document.getElementById("stopAgentBtn").addEventListener("click", async () => {
        await api("/api/agent/stop", "POST", {});
        showToast("Stopping agent…");
      });

      document.getElementById("clearLogsBtn").addEventListener("click", async () => {
        state.commandOutputs = [];
        await api("/api/logs/clear", "POST", {});
        renderFeed();
      });

      document.querySelectorAll("[data-cmd]").forEach((chip) => {
        chip.addEventListener("click", () => {
          const input = document.getElementById("promptInput");
          input.value = chip.getAttribute("data-cmd");
          input.focus();
        });
      });

      document.getElementById("promptInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          document.getElementById("promptForm").requestSubmit();
        } else if (e.key === "ArrowUp" && !e.target.value && state.cmdHistory.length > 0) {
          state.cmdHistoryIdx = Math.max(0, state.cmdHistoryIdx - 1);
          e.target.value = state.cmdHistory[state.cmdHistoryIdx] || "";
        }
      });

      document.getElementById("promptForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const inputEl = document.getElementById("promptInput");
        const text = inputEl.value.trim();
        if (!text) return;
        state.cmdHistory.push(text);
        state.cmdHistoryIdx = state.cmdHistory.length;
        inputEl.value = "";

        try {
          const res = await api("/api/command", "POST", { input: text });
          if (res.kind === "command" && res.result) {
            state.commandOutputs.push({
              ts: new Date().toISOString(),
              command: res.result.command,
              ok: res.result.ok,
              output: res.result.output,
            });
            if (res.result.selectPath) {
              state.selectedPath = res.result.selectPath;
            }
            if (res.result.render) {
              state.renderResult = res.result.render;
              state.centerTab = "render";
            }
            if (res.result.binary) {
              state.binaryResult = res.result.binary;
            }
            renderTree();
            renderCenter(true);
            renderFeed();
          } else if (res.kind === "agent_started") {
            showToast("Agent started");
          }
        } catch (err) {
          state.commandOutputs.push({
            ts: new Date().toISOString(),
            command: text,
            ok: false,
            output: "Error: " + err.message,
          });
          renderFeed();
        }
      });

      // Provider Modal
      document.getElementById("providerBtn").addEventListener("click", () => {
        document.getElementById("cfgProvider").value = state.provider.name || "auto";
        document.getElementById("cfgModel").value =
          state.provider.model && state.provider.model !== "manual" ? state.provider.model : "";
        document.getElementById("cfgBaseUrl").value = state.provider.baseUrl || "";
        document.getElementById("cfgMaxSteps").value = state.provider.maxSteps || 25;
        document.getElementById("providerModal").classList.add("open");
      });
      document.getElementById("closeModalBtn").addEventListener("click", () => {
        document.getElementById("providerModal").classList.remove("open");
      });
      document.getElementById("providerForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          const provider = document.getElementById("cfgProvider").value;
          const model = document.getElementById("cfgModel").value.trim();
          const apiKey = document.getElementById("cfgApiKey").value.trim();
          const baseUrl = document.getElementById("cfgBaseUrl").value.trim();
          const maxSteps = Number(document.getElementById("cfgMaxSteps").value);
          await api("/api/provider", "POST", {
            provider,
            ...(model ? { model } : {}),
            ...(apiKey ? { apiKey } : {}),
            ...(baseUrl ? { baseUrl } : {}),
            ...(Number.isFinite(maxSteps) ? { maxSteps } : {}),
          });
          document.getElementById("cfgApiKey").value = "";
          document.getElementById("providerModal").classList.remove("open");
          showToast("Updated provider settings");
        } catch (err) {
          showToast(err.message);
        }
      });

      // Delegated clicks & inputs inside workspace
      document.body.addEventListener("input", (e) => {
        const t = e.target;
        const mkey = t.getAttribute("data-mkey");
        if (mkey) {
          const field = t.getAttribute("data-mfield");
          if (!state.methodDrafts[mkey]) state.methodDrafts[mkey] = { fields: {}, raw: "{}" };
          state.methodDrafts[mkey].fields[field] = t.value;
          return;
        }
        const mraw = t.getAttribute("data-mraw");
        if (mraw) {
          if (!state.methodDrafts[mraw]) state.methodDrafts[mraw] = { fields: {}, raw: "{}" };
          state.methodDrafts[mraw].raw = t.value;
        }
      });

      document.body.addEventListener("submit", async (e) => {
        if (e.target.id === "quickSetValForm") {
          e.preventDefault();
          const rawVal = document.getElementById("quickSetValInput").value;
          const nType = e.target.getAttribute("data-node-type");
          let value = rawVal;
          if (nType === "checkbox" || nType === "switch") value = rawVal === "true";
          else if (nType === "numberField") value = rawVal === "" ? null : Number(rawVal);
          try {
            await api("/api/invoke", "POST", {
              path: state.selectedPath,
              method: "setValue",
              params: { value },
            });
            showToast("Updated value");
          } catch (err) {
            showToast("setValue failed: " + err.message);
          }
          return;
        }

        if (e.target.id === "queryFormEl") {
          e.preventDefault();
          state.queryForm = {
            rootPath: document.getElementById("qRootPath").value.trim() || "/",
            kind: document.getElementById("qKind").value,
            type: document.getElementById("qType").value.trim(),
            hasMethod: document.getElementById("qMethod").value.trim(),
            textContains: document.getElementById("qText").value.trim(),
            limit: 50,
          };
          try {
            state.queryResult = await api("/api/query", "POST", {
              rootPath: state.queryForm.rootPath,
              ...(state.queryForm.kind ? { kinds: [state.queryForm.kind] } : {}),
              ...(state.queryForm.type ? { types: [state.queryForm.type] } : {}),
              ...(state.queryForm.hasMethod ? { hasMethod: state.queryForm.hasMethod } : {}),
              ...(state.queryForm.textContains ? { textContains: state.queryForm.textContains } : {}),
              limit: 50,
            });
            renderCenter(true);
          } catch (err) {
            showToast("Query failed: " + err.message);
          }
          return;
        }

        if (e.target.id === "renderFormEl") {
          e.preventDefault();
          state.renderForm.path = document.getElementById("rPathInput").value.trim();
          state.renderForm.mode = document.getElementById("rModeSelect").value;
          try {
            state.renderResult = await api("/api/render", "POST", {
              path: state.renderForm.path,
              mode: state.renderForm.mode,
            });
            renderCenter(true);
          } catch (err) {
            showToast("Render failed: " + err.message);
          }
        }
      });

      document.body.addEventListener("click", async (e) => {
        const toggleEl = e.target.closest("[data-toggle-path]");
        if (toggleEl && toggleEl.getAttribute("data-toggle-path")) {
          e.stopPropagation();
          const p = toggleEl.getAttribute("data-toggle-path");
          if (state.collapsedPaths.has(p)) state.collapsedPaths.delete(p);
          else state.collapsedPaths.add(p);
          renderTree();
          return;
        }

        const lazyBtn = e.target.closest("[data-lazy-path]");
        if (lazyBtn) {
          e.stopPropagation();
          const p = lazyBtn.getAttribute("data-lazy-path");
          try {
            await api("/api/children", "POST", { path: p, limit: 100 });
            showToast("Loaded children for " + p);
          } catch (err) {
            showToast(err.message);
          }
          return;
        }

        const treeRow = e.target.closest("[data-tree-path]");
        if (treeRow) {
          state.selectedPath = treeRow.getAttribute("data-tree-path");
          if (state.centerTab !== "inspector") state.centerTab = "inspector";
          renderTree();
          renderCenter(true);
          return;
        }

        const selEl = e.target.closest("[data-select-path]");
        if (selEl) {
          state.selectedPath = selEl.getAttribute("data-select-path");
          state.centerTab = "inspector";
          renderTree();
          renderCenter(true);
          return;
        }

        const discBtn = e.target.closest("[data-disconnect]");
        if (discBtn) {
          const mid = discBtn.getAttribute("data-disconnect");
          try {
            await api("/api/endpoints/" + encodeURIComponent(mid), "DELETE");
            showToast("Disconnected " + mid);
          } catch (err) {
            showToast(err.message);
          }
          return;
        }

        const renderBtn = e.target.closest("[data-render-ep]");
        if (renderBtn) {
          const p = renderBtn.getAttribute("data-render-ep");
          state.renderForm.path = p;
          state.centerTab = "render";
          try {
            state.renderResult = await api("/api/render", "POST", {
              path: p,
              mode: state.renderForm.mode,
            });
          } catch (err) {
            showToast("Render failed: " + err.message);
          }
          renderCenter(true);
          return;
        }

        const copyBtn = e.target.closest("[data-copy-path]");
        if (copyBtn) {
          navigator.clipboard?.writeText(copyBtn.getAttribute("data-copy-path"));
          showToast("Copied path");
          return;
        }

        const rawToggle = e.target.closest("[data-toggle-raw]");
        if (rawToggle) {
          const k = rawToggle.getAttribute("data-toggle-raw");
          state.methodRawMode[k] = !state.methodRawMode[k];
          renderCenter(true);
          return;
        }

        const invokeBtn = e.target.closest("[data-invoke-key]");
        if (invokeBtn) {
          const key = invokeBtn.getAttribute("data-invoke-key");
          const path = invokeBtn.getAttribute("data-invoke-path");
          const method = invokeBtn.getAttribute("data-invoke-method");
          const node = findNodeByPath(state.tree, path);
          const mDecl = (node?.methods || []).find((x) => x.name === method);
          const props = mDecl?.inputSchema?.properties;
          const useRaw = Boolean(state.methodRawMode[key]) || !props || Object.keys(props).length === 0;
          const draft = state.methodDrafts[key] || { fields: {}, raw: "{}" };

          let params = {};
          try {
            if (useRaw) {
              params = draft.raw.trim() ? JSON.parse(draft.raw) : {};
            } else {
              for (const [f, def] of Object.entries(props)) {
                const rawV = draft.fields[f];
                if (rawV === undefined || rawV === "") continue;
                const d = def || {};
                if (Array.isArray(d.enum) && d.enum.length > 0) params[f] = JSON.parse(rawV);
                else if (d.type === "boolean") params[f] = rawV === "true";
                else if (d.type === "number" || d.type === "integer") params[f] = Number(rawV);
                else if (d.type === "object" || d.type === "array") params[f] = JSON.parse(rawV);
                else params[f] = rawV;
              }
            }
          } catch (err) {
            state.methodResults[key] = { ok: false, ts: Date.now(), text: "Invalid JSON parameter: " + err.message };
            renderCenter(true);
            return;
          }

          invokeBtn.disabled = true;
          try {
            const res = await api("/api/invoke", "POST", { path, method, params });
            state.methodResults[key] = {
              ok: true,
              ts: Date.now(),
              text: JSON.stringify(res.result ?? { ok: true }, null, 2),
            };
            showToast("Invoked " + method);
          } catch (err) {
            state.methodResults[key] = {
              ok: false,
              ts: Date.now(),
              text: "Error: " + err.message,
            };
          } finally {
            invokeBtn.disabled = false;
            renderCenter(true);
          }
          return;
        }

        const binBtn = e.target.closest("[data-fetch-binary]");
        if (binBtn) {
          const refId = binBtn.getAttribute("data-fetch-binary");
          try {
            state.binaryResult = await api("/api/binary", "POST", { refId });
            renderCenter(true);
          } catch (err) {
            showToast("Binary fetch failed: " + err.message);
          }
          return;
        }

        const leaseBtn = e.target.closest("[data-acquire-lease]");
        if (leaseBtn) {
          const p = leaseBtn.getAttribute("data-acquire-lease");
          try {
            const r = await api("/api/lease", "POST", { path: p });
            showToast("Acquired lease " + r.leaseId);
          } catch (err) {
            showToast("Lease failed: " + err.message);
          }
          return;
        }

        const elevBtn = e.target.closest("[data-elevate-path]");
        if (elevBtn) {
          const p = elevBtn.getAttribute("data-elevate-path");
          try {
            const r = await api("/api/elevate", "POST", {
              targetPath: p,
              level: "confirm",
              reason: "Operator elevation in Web Harness",
            });
            showToast("Elevation " + r.status + " (" + r.grantId + ")");
          } catch (err) {
            showToast("Elevation failed: " + err.message);
          }
        }
      });

      // Boot SSE stream
      function connectSse() {
        const es = new EventSource("/api/events");
        es.addEventListener("state", (ev) => {
          try {
            applyServerState(JSON.parse(ev.data));
          } catch {}
        });
        es.onerror = () => {
          es.close();
          setTimeout(connectSse, 1500);
        };
      }

      api("/api/state").then(applyServerState).catch(() => {});
      connectSse();
    </script>
  </body>
</html>`;
}
