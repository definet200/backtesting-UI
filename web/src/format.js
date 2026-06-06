export const pct = (v) => (v == null || isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`);
export const num = (v) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(2));
export const money = (v) => (v == null || isNaN(v) ? '—' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
export const sign = (v) => (v == null || isNaN(v) ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');

export const ASSET_NAMES = { BTC: 'BTC', 'xyz:GOLD': 'Gold', 'xyz:SP500': 'S&P 500' };
export const pretty = (sym) => ASSET_NAMES[sym] || sym;

// The 8 metric fields the engine returns, in display order.
export const METRIC_FIELDS = [
  ['total_return_pct', 'Total return', pct, true],
  ['max_drawdown_pct', 'Max drawdown', pct, true],
  ['sharpe_approx', 'Sharpe', num, false],
  ['hit_rate', 'Hit rate', (v) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`), false],
  ['num_trades', 'Trades', (v) => (v == null ? '—' : v), false],
  ['profit_factor', 'Profit factor', num, false],
  ['avg_win_pct', 'Avg win', pct, true],
  ['avg_loss_pct', 'Avg loss', pct, true],
];
