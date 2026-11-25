# AEP Harness (`aep-harness`)

Prototype multi-endpoint **Agent Environment Protocol (AEP)** harness (`1.0.0-beta.0`) built with [`aep-node`](https://github.com/AgentEnvironmentProtocol/aep-node).

Designed with a transport/UI-agnostic core (`src/core`) that can power **Web**, **Desktop**, and **CLI** frontends, paired today with an interactive zero-bundler **Web Harness** (`src/web`).

## Features

- **Multi-Endpoint "Body of Senses"** — Connect and mount one or more AEP endpoints simultaneously via `AepCompositeClient`:
  - `http://` / `https://` URLs auto-discover `/.well-known/aep.json` (e.g. `http://127.0.0.1:8781` for `aep-tables-app`)
  - Direct `ws://` / `wss://` AEP WebSocket endpoints (`binary` or `json` envelope mode)
  - `tcp://host:port` stream endpoints
- **Interactive Tree Inspector & Method Runner** — Browse live AEP nodes, inspect `properties`, `state`, `events`, `revision`, and `elevation`, edit `editable` node values directly, and invoke any declared `MethodDecl` using schema-generated forms or raw JSON parameters.
- **Visual Wireframe & Surface Preview** — Synthesize annotated SVG wireframes (`renderMinimal` with interactive `pathMap` chips) or fetch `data.render` / `data.getBinary` payloads.
- **Unified Command Console** — Execute direct slash commands (`/connect`, `/tree`, `/node`, `/query`, `/invoke`, `/set`, `/render`, `/binary`, `/elevate`, `/lease`, `/provider`, `/stop`, `/help`).
- **Autonomous AI Agent Loop** — Enter any natural-language goal to run an Observe → Think → Act loop across all mounted AEP endpoints (supports **Gemini**, **OpenAI**, **Anthropic**, **Ollama**, and **OpenAI-compatible** providers via `.env` or live in-browser Provider Settings).

## Quick Start

```bash
npm install
npm start
```

Open `http://127.0.0.1:8790` in your browser.

### Auto-connect to [`aep-tables-app`](https://github.com/AgentEnvironmentProtocol/aep-tables-app) on launch

Terminal 1 — start `aep-tables-app`:

```bash
# In your aep-tables-app checkout:
npm start
```

Terminal 2 — start `aep-harness` connected to `:8781`:

```bash
npm start -- --connect http://127.0.0.1:8781
```

## Environment Variables (Optional `.env`)

| Provider | Environment Variables | Default Model |
| --- | --- | --- |
| **Gemini** | `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | `gemini-2.5-flash` |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4.1-mini` |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| **Ollama** | `OLLAMA_HOST=http://127.0.0.1:11434` (`OLLAMA_MODEL`) | `llama3.2` |
| **OpenAI-compatible** | `OPENAI_BASE_URL` (+ optional `OPENAI_API_KEY`) | `gpt-4o-mini` |

## Scripts

```bash
npm run build
npm run typecheck
npm test
```
