import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import type { InterfaceNode } from "aep-node";
import { AepServer } from "aep-node/server";
import { createMemoryTransportPair, WebSocketTransportServer } from "aep-node/transport";
import {
  AepHarnessAgent,
  AepHarnessHub,
  AepHarnessWebServer,
  executeSlashCommand,
  normalizeEndpointShorthand,
  parseHarnessAgentAction,
  resolveEndpointTarget,
  type HarnessLlmInput,
  type HarnessLlmProvider,
  type HarnessLlmResponse,
} from "../dist/index.js";

function createSampleTablesLikeServer(): {
  aepServer: AepServer;
  items: Array<{ id: string; title: string; done: boolean }>;
  getTitle: () => string;
} {
  let tableTitle = "Tasks";
  const items: Array<{ id: string; title: string; done: boolean }> = [
    { id: "r1", title: "Ship AEP Tables", done: true },
  ];

  const buildTablesNode = (): InterfaceNode => ({
    id: "tables",
    kind: "interface",
    type: "page",
    properties: { title: "AEP Tables" },
    state: { value: tableTitle },
    methods: [
      {
        name: "addRecord",
        description: "Add a row to the active table",
        sideEffects: "write",
        inputSchema: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            done: { type: "boolean" },
          },
        },
      },
      {
        name: "listRecords",
        description: "Return all records",
        sideEffects: "read",
      },
    ],
    children: [
      {
        id: "name",
        kind: "editable",
        type: "textField",
        properties: { label: "Table Name" },
        state: { value: tableTitle },
        methods: [
          {
            name: "setValue",
            sideEffects: "write",
            inputSchema: {
              type: "object",
              required: ["value"],
              properties: { value: { type: "string" } },
            },
          },
        ],
      },
      {
        id: "rows",
        kind: "structure",
        type: "list",
        children: items.map((item) => ({
          id: `row-${item.id}`,
          kind: "structure" as const,
          type: "listItem",
          properties: { label: item.title },
          state: { selected: item.done },
        })),
      },
    ],
  });

  const aepServer = new AepServer({
    serverInfo: { name: "mock-tables-app", version: "1.0.0-beta.0" },
    body: [buildTablesNode()],
  });

  aepServer.registerMethod("/tables", "listRecords", () => ({ records: [...items] }));
  aepServer.registerMethod("/tables", "addRecord", async (params) => {
    const p = (params ?? {}) as Record<string, unknown>;
    const rec = {
      id: `r${items.length + 1}`,
      title: String(p["title"] ?? "Untitled"),
      done: Boolean(p["done"] ?? false),
    };
    items.push(rec);
    await aepServer.updateNode("/tables", buildTablesNode());
    return rec;
  });
  aepServer.registerMethod("/tables/name", "setValue", async (params) => {
    const p = (params ?? {}) as Record<string, unknown>;
    tableTitle = String(p["value"] ?? "");
    await aepServer.updateNode("/tables", buildTablesNode());
    return { value: tableTitle };
  });

  return { aepServer, items, getTitle: () => tableTitle };
}

function createSecondaryNotesServer(): AepServer {
  let noteText = "Initial note";
  const server = new AepServer({
    serverInfo: { name: "mock-notes-app", version: "1.0.0-beta.0" },
    body: [
      {
        id: "notes",
        kind: "interface",
        type: "page",
        properties: { title: "Scratchpad" },
        children: [
          {
            id: "body",
            kind: "view",
            type: "text",
            properties: { mediaType: "text/plain", temporalMode: "dynamic" },
            state: { value: noteText },
          },
          {
            id: "preview",
            kind: "view",
            type: "text",
            properties: { mediaType: "text/plain", temporalMode: "dynamic" },
            state: {
              binaryRef: {
                refId: "note-preview-txt",
                mediaType: "text/plain",
              },
            },
          },
        ],
        methods: [
          {
            name: "append",
            sideEffects: "write",
            inputSchema: {
              type: "object",
              required: ["text"],
              properties: { text: { type: "string" } },
            },
          },
        ],
      },
    ],
  });

  server.registerBinary(
    { refId: "note-preview-txt", mediaType: "text/plain" },
    () => new TextEncoder().encode(noteText),
  );

  server.registerMethod("/notes", "append", async (params) => {
    const p = (params ?? {}) as Record<string, unknown>;
    noteText = `${noteText}\n${String(p["text"] ?? "")}`;
    await server.updateNode("/notes/body", (prev) => ({
      ...prev,
      state: { ...prev.state, value: noteText },
    }));
    return { value: noteText };
  });

  return server;
}

describe("AEP Harness Core & Discovery", () => {
  it("normalizes endpoint shorthands and parses model JSON actions", () => {
    assert.equal(normalizeEndpointShorthand(":8781"), "http://127.0.0.1:8781");
    assert.equal(normalizeEndpointShorthand(":8781/aep"), "ws://127.0.0.1:8781/aep");
    assert.equal(normalizeEndpointShorthand("127.0.0.1:8781"), "http://127.0.0.1:8781");

    const parsed = parseHarnessAgentAction(
      '```json\n{"action":"invoke","path":"/tables","method":"addRecord","params":{"title":"Write harness tests"},"reason":"Add test task"}\n```',
    );
    assert.equal(parsed.action, "invoke");
    assert.equal(parsed.path, "/tables");
    assert.equal(parsed.method, "addRecord");
  });

  it("mounts multiple AEP endpoints, queries, renders wireframes, fetches binaries, and runs slash commands + agent loop", async () => {
    const { aepServer: tablesServer, items, getTitle } = createSampleTablesLikeServer();
    const notesServer = createSecondaryNotesServer();
    const hub = new AepHarnessHub();

    try {
      const [c1, s1] = createMemoryTransportPair();
      tablesServer.accept(s1);
      const ep1 = await hub.connectEndpoint({ transport: c1, url: "memory://tables" });
      assert.equal(ep1.anchorPath, "/tables");

      const [c2, s2] = createMemoryTransportPair();
      notesServer.accept(s2);
      const ep2 = await hub.connectEndpoint({ transport: c2, url: "memory://notes" });
      assert.equal(ep2.anchorPath, "/notes");

      assert.equal(hub.listEndpoints().length, 2);

      // Query across both mounted endpoints
      const queryRes = await hub.queryTree({ kinds: ["editable"] });
      assert.equal(queryRes.matches.length, 1);
      assert.equal(queryRes.matches[0]?.path, "/tables/name");

      // Synthesize renderMinimal SVG wireframe on /tables
      const rendered = await hub.renderSubtree("/tables", "renderMinimal");
      assert.equal(rendered.mediaType, "image/svg+xml");
      assert.ok(rendered.svgText?.includes("<svg"));
      assert.ok(rendered.pathMap && Object.values(rendered.pathMap).includes("/tables/name"));

      // Fetch binary from second endpoint via rewritten upstream refId
      const notesNode = await hub.getNode("/notes/preview");
      const binRefId = notesNode.node.state?.binaryRef?.refId;
      assert.ok(binRefId);
      const bin = await hub.getBinary(binRefId);
      assert.equal(bin.textPreview, "Initial note");

      // Lease acquisition & release
      const lease = await hub.acquireLease({ path: "/tables" });
      assert.ok(lease.leaseId);
      await hub.releaseLease("tables", lease.leaseId);

      // Mock LLM Provider that inspects the tree, adds a record, and finishes
      const scriptedResponses = [
        JSON.stringify({
          action: "invoke",
          path: "/tables",
          method: "addRecord",
          params: { title: "Prototype AEP Harness", done: true },
          reason: "Add the requested task",
        }),
        JSON.stringify({
          action: "done",
          summary: "Added Prototype AEP Harness to /tables",
        }),
      ];
      let callCount = 0;
      const mockProvider: HarnessLlmProvider = {
        name: "gemini",
        model: "mock-gemini",
        configured: true,
        async decideAction(input: HarnessLlmInput): Promise<HarnessLlmResponse> {
          assert.ok(input.userPrompt.includes("/tables"));
          assert.ok(input.userPrompt.includes("/notes"));
          const rawText = scriptedResponses[callCount++] ?? '{"action":"done","summary":"done"}';
          return {
            action: parseHarnessAgentAction(rawText),
            rawText,
          };
        },
      };

      const agent = new AepHarnessAgent(hub, mockProvider, { settleDelayMs: 0 });

      // Slash command execution (/set)
      const setCmd = await executeSlashCommand('/set /tables/name "Roadmap"', { hub, agent });
      assert.equal(setCmd.ok, true);
      assert.equal(getTitle(), "Roadmap");

      // Run autonomous agent goal
      const run = await agent.runGoal("Add Prototype AEP Harness as a completed task");
      assert.equal(run.status, "done");
      assert.equal(items.length, 2);
      assert.equal(items[1]?.title, "Prototype AEP Harness");
      assert.equal(items[1]?.done, true);
    } finally {
      await hub.closeAll();
      await tablesServer.close();
      await notesServer.close();
    }
  });

  it("discovers /.well-known/aep.json over HTTP and drives an endpoint end-to-end via AepHarnessWebServer", async () => {
    const { aepServer, items } = createSampleTablesLikeServer();

    const appHttp = http.createServer((req, res) => {
      if (req.url === "/.well-known/aep.json") {
        const addr = appHttp.address() as AddressInfo;
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            protocolVersion: "1.0.0-beta.0",
            name: "mock-tables-app",
            aepEndpoint: `ws://127.0.0.1:${addr.port}/aep`,
            transport: "websocket",
            mode: "binary",
            rootPath: "/tables",
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    const wsServer = new WebSocketTransportServer({
      server: appHttp,
      path: "/aep",
      mode: "binary",
    });
    wsServer.onConnection((t) => {
      aepServer.accept(t);
    });
    await new Promise<void>((resolve) => appHttp.listen(0, "127.0.0.1", () => resolve()));
    const appPort = (appHttp.address() as AddressInfo).port;
    const appHttpUrl = `http://127.0.0.1:${appPort}`;

    const resolved = await resolveEndpointTarget(appHttpUrl);
    assert.equal(resolved.transportKind, "websocket");
    if (resolved.transportKind === "websocket") {
      assert.equal(resolved.wsUrl, `ws://127.0.0.1:${appPort}/aep`);
      assert.equal(resolved.sourcePath, "/tables");
    }

    const webHarness = new AepHarnessWebServer({ host: "127.0.0.1", port: 0 });
    const started = await webHarness.start();

    try {
      const htmlRes = await fetch(started.httpUrl);
      assert.equal(htmlRes.status, 200);
      const html = await htmlRes.text();
      assert.ok(html.includes("AEP Harness"));

      const connectRes = await fetch(`${started.httpUrl}/api/endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: appHttpUrl }),
      });
      assert.equal(connectRes.status, 201);
      const epSummary = (await connectRes.json()) as { anchorPath: string; mountId: string };
      assert.equal(epSummary.anchorPath, "/tables");

      const invokeRes = await fetch(`${started.httpUrl}/api/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "/tables",
          method: "addRecord",
          params: { title: "Created from Web Harness API", done: false },
        }),
      });
      assert.equal(invokeRes.status, 200);
      assert.equal(items.length, 2);
      assert.equal(items[1]?.title, "Created from Web Harness API");

      const cmdRes = await fetch(`${started.httpUrl}/api/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "/tree /tables 4" }),
      });
      assert.equal(cmdRes.status, 200);
      const cmdJson = (await cmdRes.json()) as {
        kind: string;
        result: { ok: boolean; output: string };
      };
      assert.equal(cmdJson.kind, "command");
      assert.equal(cmdJson.result.ok, true);
      assert.ok(cmdJson.result.output.includes("Created from Web Harness API"));

      const renderRes = await fetch(`${started.httpUrl}/api/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/tables", mode: "renderMinimal" }),
      });
      assert.equal(renderRes.status, 200);
      const renderJson = (await renderRes.json()) as { svgText?: string };
      assert.ok(renderJson.svgText?.includes("<svg"));

      const delRes = await fetch(`${started.httpUrl}/api/endpoints/${epSummary.mountId}`, {
        method: "DELETE",
      });
      assert.equal(delRes.status, 200);
    } finally {
      await webHarness.close();
      await wsServer.close();
      await aepServer.close();
      await new Promise<void>((resolve) => appHttp.close(() => resolve()));
    }
  });
});
