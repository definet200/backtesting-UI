// Helpers to build correct DSL v2.3 Portfolio Strategies (docs/dsl.md §3.1).
// Centralised so templates (catalog.js) and the agent (agent.js) can't drift
// from the real schema the engine validates against.

export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
export const OPERATORS = [
  'less_than', 'greater_than', 'less_than_or_equal', 'greater_than_or_equal',
  'crossed_above', 'crossed_below',
];

// ── Operands (§3.6) ──────────────────────────────────────────────────────────
export const op = {
  indicator: (name, params = {}, attribute) =>
    attribute ? { type: 'indicator', name, params, attribute } : { type: 'indicator', name, params },
  price: (field = 'close') => ({ type: 'price', field }),
  value: (value) => ({ type: 'value', value }),
  macro: (key) => ({ type: 'macro', key }),
  lookback: (fn, source, period, multiplier = 1) => ({ type: 'lookback', function: fn, source, period, multiplier }),
};

// ── Atom (§3.5) ──────────────────────────────────────────────────────────────
export function atom(left, operator, right, timeframe = '1h') {
  return { left, operator, right, timeframe };
}

// ── Conditions tree (§3.4): single atom stands alone; 2+ wrap in all_of/any_of.
export function allOf(atoms) {
  const a = atoms.filter(Boolean);
  if (a.length === 0) return null;
  return a.length === 1 ? a[0] : { all_of: a };
}
export function anyOf(atoms) {
  const a = atoms.filter(Boolean);
  if (a.length === 0) return null;
  return a.length === 1 ? a[0] : { any_of: a };
}

// ── Entry / exit / leg / strategy ────────────────────────────────────────────
export function classicEntry(conditions, { pct = 100, take_profit, stop_loss } = {}) {
  const rule = { conditions, size: { type: 'percent_allocation', pct } };
  if (take_profit) rule.take_profit = take_profit;
  if (stop_loss) rule.stop_loss = stop_loss;
  return rule;
}

export function leg({ asset, leverage = 1, margin_mode = 'cross', entryLong, exitLong }) {
  const l = { asset, leverage, margin_mode, entry: {}, exit: {} };
  if (entryLong) l.entry.long = entryLong;
  if (exitLong) l.exit.long = { conditions: exitLong };
  return l;
}

export function strategy({ name, description, strategyFraction = 100, weights, legs, portfolioExit }) {
  const s = {
    dsl_version: '2.3',
    name,
    description: description || name,
    allocation: { strategy_fraction: strategyFraction, weights },
    legs,
  };
  if (portfolioExit) s.portfolio_exit = portfolioExit;
  return s;
}

// Build an integer weights array that sums to exactly 100 (validator §5.2).
export function evenWeights(assets) {
  const base = Math.floor(100 / assets.length);
  return assets.map((asset, i) => ({
    asset,
    pct: i === assets.length - 1 ? 100 - base * (assets.length - 1) : base,
  }));
}
