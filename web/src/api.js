// All calls go to the BFF (same origin via the Vite proxy / static serve).
// The browser never talks to the engine or Anthropic directly.
const USER = 'demo@hypersignals.ai';

async function req(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-user': USER, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  health: () => req('/health'),
  catalog: () => req('/catalog'),
  dataRange: (symbol) => req(`/data-range?symbol=${encodeURIComponent(symbol)}`),
  strategies: () => req('/strategies'),
  generate: (payload) => req('/chat/strategy', { method: 'POST', body: JSON.stringify(payload) }),
  backtest: (payload) => req('/chat/backtest', { method: 'POST', body: JSON.stringify(payload) }),
  portfolio: () => req('/portfolio'),
  portfolioBacktest: () => req('/portfolio/backtest'),
  finalize: (payload) => req('/portfolio/finalize', { method: 'POST', body: JSON.stringify(payload) }),
  removeFromPortfolio: (id) => req(`/portfolio/${id}`, { method: 'DELETE' }),
};
