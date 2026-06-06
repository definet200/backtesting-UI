# HyperSignals — Strategy Studio (chat → DSL → backtest)

Chat UI + thin BFF/orchestrator that sits between the user and the **hs-compute**
backtest engine. The user describes a strategy in plain English; the BFF turns it
into a validated **DSL v2.3** strategy and runs it on the engine's `POST /backtest`
(port **8000**), then renders the equity curve, per-leg breakdown, trade log, and a
portfolio dashboard.

```
Frontend (React)  →  BFF / Orchestrator (Express)  →  hs-compute engine
  chat UI              Anthropic key, prompt→DSL,        POST :8000/backtest
  :5173 / served       validate-repair, portfolio        (validation + execution)
```

The browser only ever talks to the BFF. The **Anthropic key lives only in the BFF**
(`.env`), never in the browser. The BFF holds no market data — **validation and
execution both happen in the engine at `:8000`**; the BFF just generates DSL and
relays the result.

## Run

```bash
# 1. install (root = BFF, web = React UI)
npm install
npm run web:install

# 2. configure — copy and edit .env (engine URL + optional Anthropic key)
cp .env.example .env        # ENGINE_BASE_URL=http://localhost:8000, ANTHROPIC_API_KEY=...

# 3a. production: build the UI and serve everything from the BFF on :3000
npm run web:build
npm start                   # → http://localhost:3000

# 3b. dev: BFF on :3000 + Vite HMR on :5173 (proxies /api → BFF)
npm run dev                 # terminal 1 (BFF)
npm run web:dev             # terminal 2 (UI at http://localhost:5173)
```

`npm run setup` does install + web install + build in one shot.

### Agent modes
- **`ANTHROPIC_API_KEY` set** → Claude emits the DSL via forced tool use, with a
  validate-and-repair loop (engine `422` errors are fed back to Claude, max 2 retries).
- **key unset** → a deterministic rule-based generator builds the DSL, so the demo
  works end-to-end with no key.

## BFF API (what the frontend calls)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | BFF + engine liveness, agent mode |
| GET | `/api/catalog` | capabilities + templates for the pickers (engine, else fallback) |
| GET | `/api/strategies` | pre-built templates |
| GET | `/api/data-range?symbol=BTC` | proxy to the engine's OHLCV availability |
| POST | `/api/chat/strategy` | `{prompt, asset_class, skills[], data_points[]}` → `{dsl, summary, valid, validationErrors}` |
| POST | `/api/chat/backtest` | `{dsl, date_range?}` → engine `{combined, legs, baseline}` (date range auto-clamped to available data) |
| POST | `/api/portfolio/finalize` | `{dsl, capital}` → save to portfolio |
| GET | `/api/portfolio` | saved strategies |
| GET | `/api/portfolio/backtest` | aggregated portfolio dashboard |
| DELETE | `/api/portfolio/:id` | remove a saved strategy |

## DSL correctness

The DSL builders in [`server/dsl.js`](server/dsl.js) emit the exact **v2.3 Portfolio
Strategy** schema the engine validates (top level → allocation → legs → entry/exit →
conditions → atoms → operands). Both the templates ([`server/catalog.js`](server/catalog.js))
and the agent ([`server/agent.js`](server/agent.js)) build through it, so they can't
drift from the engine's validator. All shipped templates pass the engine's validator.

## Notes / engine dependencies
- The engine performs both **validation** (`422 invalid_dsl`) and **execution**
  (`200 {combined,legs,baseline}`). A valid DSL that returns `internal_error` means
  the engine couldn't reach its own market-data DB — that's an engine-side issue,
  surfaced cleanly through the API; re-run once it's restored (the UI has a
  **Re-run last strategy** button for exactly this).
- `GET /capabilities` is not built on the engine yet — see
  [`docs/capabilities-shape.md`](docs/capabilities-shape.md) for the proposed shape.
  Until then the BFF derives indicators from `/health` + a fallback list.
