// Client for the hs-compute backtest engine (port 8000).
// The BFF is the ONLY thing that talks to the engine; the browser never does.
import { config } from './config.js';

const BASE = config.engineBaseUrl;

async function call(pathname, { method = 'GET', body, timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${pathname}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, body: json };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : (err.cause?.code || err.message);
    return { ok: false, status: 0, body: null, networkError: reason };
  } finally {
    clearTimeout(timer);
  }
}

export const engine = {
  baseUrl: BASE,

  health() {
    return call('/health', { timeoutMs: 5000 });
  },

  capabilities() {
    return call('/capabilities', { timeoutMs: 5000 });
  },

  strategies() {
    return call('/strategies', { timeoutMs: 5000 });
  },

  // GET /api/data-range?symbol=BTC — OHLCV availability per symbol.
  // Returns { min_date, max_date, total_candles } (1h range) when the DB is up.
  dataRange(symbol) {
    return call(`/api/data-range?symbol=${encodeURIComponent(symbol)}`, { timeoutMs: 5000 });
  },

  // POST /backtest — per the integration guide §3.
  backtest({ strategy, date_range, initial_equity, fee_bps, slippage_bps }) {
    return call('/backtest', {
      method: 'POST',
      timeoutMs: 60000,
      body: {
        deployment_id: null,
        mode: 'backtest',
        strategy,
        date_range,
        initial_equity: initial_equity ?? config.defaults.initialEquity,
        fee_bps: fee_bps ?? config.defaults.feeBps,
        slippage_bps: slippage_bps ?? config.defaults.slippageBps,
      },
    });
  },

  // POST /portfolio/backtest — §7 (not built yet on the engine; BFF falls back).
  portfolioBacktest(payload) {
    return call('/portfolio/backtest', { method: 'POST', timeoutMs: 90000, body: payload });
  },
};
