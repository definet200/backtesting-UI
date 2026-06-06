// BFF / Orchestrator. Sits between the chat UI and the hs-compute engine.
// - Holds the Anthropic key + engine base URL.
// - Runs the prompt -> DSL agent + validate-repair loop.
// - Owns portfolio state.
// The browser only ever talks to this server.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { engine } from './engine.js';
import { getCatalog } from './catalog.js';
import { generateStrategy } from './agent.js';
import { portfolio } from './portfolio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

// Identify the user from a header (the FE sends its email). Good enough for the demo.
function userOf(req) {
  return req.header('x-user') || 'demo@hypersignals.ai';
}

// Default backtest window — used when the engine's data-range isn't live yet.
const DEFAULT_RANGE = { start: '2026-01-01T00:00:00Z', end: '2026-05-31T00:00:00Z' };

function assetsOf(dsl) {
  const w = dsl?.allocation?.weights;
  if (Array.isArray(w)) return w.map((x) => x.asset).filter(Boolean);
  return (dsl?.legs || []).map((l) => l.asset).filter(Boolean);
}

const toIso = (d) => (typeof d === 'string' && d.includes('T') ? d : `${d}T00:00:00Z`);

// Clamp a requested window to the intersection of every asset's available
// OHLCV range (GET /api/data-range). If the engine's data-range endpoint isn't
// answering yet (its DB is down), fall back to the requested/default window so
// the request still reaches the engine and surfaces a real error.
async function clampedRange(dsl, requested) {
  const want = requested || DEFAULT_RANGE;
  const assets = assetsOf(dsl);
  if (assets.length === 0) return want;

  const ranges = await Promise.all(assets.map((a) => engine.dataRange(a)));
  let lo = -Infinity, hi = Infinity, any = false;
  for (const r of ranges) {
    const b = r.body || {};
    const min = b.min_date || b.start, max = b.max_date || b.end;
    if (!r.ok || !min || !max) continue;            // endpoint down or no data → skip
    any = true;
    lo = Math.max(lo, Date.parse(toIso(min)));
    hi = Math.min(hi, Date.parse(toIso(max)));
  }
  if (!any || !(lo <= hi)) return want;             // nothing usable → leave as-is

  const wantStart = Date.parse(toIso(want.start));
  const wantEnd = Date.parse(toIso(want.end));
  const start = new Date(Math.max(lo, isNaN(wantStart) ? lo : wantStart)).toISOString();
  const end = new Date(Math.min(hi, isNaN(wantEnd) ? hi : wantEnd)).toISOString();
  return { start, end, clamped: true };
}

// Validate a DSL by doing a dry POST /backtest and reading the 422 path.
// If the engine is unreachable, we treat the DSL as "structurally accepted"
// so the demo still flows (the real engine is the source of truth).
async function validateViaEngine(dsl) {
  const r = await engine.backtest({ strategy: dsl, date_range: DEFAULT_RANGE });
  if (r.networkError) return { ok: true, engineDown: true, errors: null };
  if (r.status === 422) return { ok: false, errors: r.body?.errors || [{ message: 'invalid_dsl' }] };
  if (r.ok) return { ok: true, errors: null, result: r.body };
  // 400/500 etc. — not a DSL-shape problem; let the caller surface it.
  return { ok: true, errors: null, engineError: { status: r.status, body: r.body } };
}

// ── Health / status ─────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const h = await engine.health();
  res.json({
    bff: 'ok',
    engine: h.ok ? 'healthy' : 'unreachable',
    engineBaseUrl: engine.baseUrl,
    engineDetail: h.ok ? h.body : (h.networkError || null),
    agentMode: config.anthropicKey ? 'anthropic' : 'fallback',
    model: config.anthropicKey ? config.anthropicModel : null,
  });
});

// ── GET /catalog — proxies capabilities + strategies for the pickers ─────────
app.get('/api/catalog', async (req, res) => {
  try {
    const catalog = await getCatalog(engine);
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /chat/strategy — prompt -> validated DSL + summary ──────────────────
app.post('/api/chat/strategy', async (req, res) => {
  const { prompt, asset_class, skills = [], data_points = [] } = req.body || {};
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'prompt is required' });
  try {
    const { capabilities } = await getCatalog(engine);
    const result = await generateStrategy({
      prompt,
      capabilities,
      picks: { asset_class, skills, data_points },
      validate: validateViaEngine,
    });
    res.json({
      dsl: result.dsl,
      summary: result.summary,
      mode: result.mode,
      valid: result.valid,
      validationErrors: result.validationErrors,
      meta: result.meta,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /chat/backtest — run a DSL through the engine ───────────────────────
app.post('/api/chat/backtest', async (req, res) => {
  const { dsl, date_range, initial_equity, fee_bps, slippage_bps } = req.body || {};
  if (!dsl) return res.status(400).json({ error: 'dsl is required' });
  const range = await clampedRange(dsl, date_range);
  const r = await engine.backtest({
    strategy: dsl,
    date_range: { start: range.start, end: range.end },
    initial_equity, fee_bps, slippage_bps,
  });
  if (r.networkError) {
    return res.status(503).json({
      error: 'engine_unreachable',
      detail: r.networkError,
      hint: `Start the backtest engine on ${engine.baseUrl} (POST /backtest).`,
    });
  }
  // Annotate the engine's own DB-offline case so the UI can explain it.
  const msg = r.body?.error_message || '';
  if (r.body?.status === 'error' && /5433|connection refused|connection to server/i.test(msg)) {
    r.body.hint = "Your DSL is valid (the engine's validator accepted it). The engine then failed to reach its own market-data DB. This is on the engine side — re-run once its DB connection is restored.";
  }
  if (r.body && typeof r.body === 'object') r.body.date_range_used = { start: range.start, end: range.end, clamped: !!range.clamped };
  res.status(r.status || 200).json(r.body);
});

// ── Data range proxy (GET /api/data-range?symbol=BTC) ────────────────────────
app.get('/api/data-range', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: 'symbol query param is required' });
  const r = await engine.dataRange(symbol);
  if (r.networkError) return res.status(503).json({ error: 'engine_unreachable', detail: r.networkError });
  res.status(r.status || 200).json(r.body);
});

// ── Templates ────────────────────────────────────────────────────────────────
app.get('/api/strategies', async (req, res) => {
  const { strategies } = await getCatalog(engine);
  res.json({ strategies });
});

// ── Portfolio ─────────────────────────────────────────────────────────────────
app.get('/api/portfolio', (req, res) => {
  res.json({ items: portfolio.list(userOf(req)) });
});

app.post('/api/portfolio/finalize', (req, res) => {
  const { dsl, capital } = req.body || {};
  if (!dsl) return res.status(400).json({ error: 'dsl is required' });
  const item = portfolio.add(userOf(req), { dsl, capital });
  res.json({ item });
});

app.delete('/api/portfolio/:id', (req, res) => {
  const removed = portfolio.remove(userOf(req), req.params.id);
  res.json({ removed });
});

// GET /portfolio dashboard — backtest each member and aggregate.
// Tries the engine's POST /portfolio/backtest (§7); falls back to summing
// per-strategy combined.equity_snapshots.
app.get('/api/portfolio/backtest', async (req, res) => {
  const user = userOf(req);
  const items = portfolio.list(user);
  if (items.length === 0) return res.json({ items: [], combined: null, aggregate: null });

  // Try the dedicated engine endpoint first.
  const dedicated = await engine.portfolioBacktest({
    mode: 'backtest',
    date_range: DEFAULT_RANGE,
    strategies: items.map((i) => ({ id: i.id, strategy: i.dsl, capital: i.capital })),
  });
  if (dedicated.ok && dedicated.body?.combined) {
    return res.json({ source: 'engine', ...dedicated.body });
  }

  // Fallback: run each member, sum the equity curves.
  const runs = await Promise.all(items.map(async (i) => {
    const r = await engine.backtest({
      strategy: i.dsl, date_range: DEFAULT_RANGE, initial_equity: i.capital,
    });
    return { item: i, ok: r.ok, body: r.body, networkError: r.networkError };
  }));

  const good = runs.filter((r) => r.ok && r.body?.combined);
  if (good.length === 0) {
    return res.status(503).json({
      error: 'engine_unreachable_or_failed',
      detail: runs.map((r) => r.networkError || r.body?.error_code || 'unknown'),
      hint: `Start the backtest engine on ${engine.baseUrl}.`,
    });
  }

  // Sum aligned-by-index equity snapshots.
  const curves = good.map((r) => r.body.combined.equity_snapshots || []);
  const n = Math.max(...curves.map((c) => c.length));
  const combinedSnaps = [];
  for (let k = 0; k < n; k++) {
    let equity = 0, pnl = 0, t = null;
    for (const c of curves) {
      const p = c[Math.min(k, c.length - 1)];
      if (!p) continue;
      equity += p.equity || 0;
      pnl += p.pnl || 0;
      t = p.t || t;
    }
    combinedSnaps.push({ t, equity, pnl, drawdown_pct: 0 });
  }
  // Compute drawdown on the summed curve.
  let peak = -Infinity;
  for (const s of combinedSnaps) {
    peak = Math.max(peak, s.equity);
    s.drawdown_pct = peak > 0 ? ((s.equity - peak) / peak) * 100 : 0;
  }

  const totalCapital = good.reduce((a, r) => a + r.item.capital, 0);
  const finalEquity = combinedSnaps.at(-1)?.equity ?? totalCapital;
  const aggregate = {
    total_capital: totalCapital,
    final_equity: finalEquity,
    total_return_pct: totalCapital ? ((finalEquity - totalCapital) / totalCapital) * 100 : 0,
    max_drawdown_pct: Math.min(0, ...combinedSnaps.map((s) => s.drawdown_pct)),
    num_strategies: good.length,
  };

  res.json({
    source: 'bff-aggregate',
    items: good.map((r) => ({
      id: r.item.id,
      name: r.item.dsl?.name,
      capital: r.item.capital,
      metrics: r.body.combined.metrics,
      dsl: r.item.dsl,
      baseline: r.body.baseline ? { asset: r.body.baseline.asset, metrics: r.body.baseline.metrics } : null,
      legs: (r.body.legs || []).map((l) => ({ asset: l.asset, weight_pct: l.weight_pct, metrics: l.metrics })),
    })),
    combined: { equity_snapshots: combinedSnaps },
    aggregate,
  });
});

// ── Static frontend (built React app) ────────────────────────────────────────
const webDist = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(webDist));
// SPA fallback for client-side routing (non-/api routes).
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Frontend not built yet. Run `npm run build` in /web.');
  });
});

const server = app.listen(config.port, () => {
  console.log(`\n  hs BFF + chat UI  →  http://localhost:${config.port}`);
  console.log(`  engine base url   →  ${engine.baseUrl}  (POST /backtest)`);
  console.log(`  agent mode        →  ${config.anthropicKey ? 'anthropic (' + config.anthropicModel + ')' : 'fallback (no ANTHROPIC_API_KEY)'}\n`);
});

// Friendly handling when the port is already taken (a BFF is already running).
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${config.port} is already in use — the BFF is probably already running.`);
    console.error(`    Stop it first:  Get-Process node | Stop-Process -Force   (PowerShell)`);
    console.error(`    or set a different PORT in .env, then restart.\n`);
    process.exit(1);
  }
  throw err;
});
