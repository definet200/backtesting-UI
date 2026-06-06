// Aggregate saved portfolio members (each carries its own backtest RESULT,
// captured at save time) into a combined equity curve + headline metrics —
// entirely on the frontend, no engine re-run.
export function aggregatePortfolio(members) {
  const withResult = members.filter((m) => m.result?.combined?.equity_snapshots?.length);
  if (withResult.length === 0) {
    return { combined: null, aggregate: null, items: members.map(toItem) };
  }

  const curves = withResult.map((m) => m.result.combined.equity_snapshots.map((s) => s.equity || 0));
  const n = Math.max(...curves.map((c) => c.length));
  const snaps = [];
  for (let k = 0; k < n; k++) {
    let equity = 0;
    for (const c of curves) equity += c[Math.min(k, c.length - 1)] || 0;
    snaps.push({ equity });
  }
  // Drawdown on the summed curve.
  let peak = -Infinity;
  for (const s of snaps) { peak = Math.max(peak, s.equity); s.drawdown_pct = peak > 0 ? ((s.equity - peak) / peak) * 100 : 0; }

  const totalCapital = withResult.reduce((a, m) => a + (Number(m.capital) || 0), 0);
  const finalEquity = snaps.at(-1)?.equity ?? totalCapital;
  const aggregate = {
    total_capital: totalCapital,
    final_equity: finalEquity,
    total_return_pct: totalCapital ? ((finalEquity - totalCapital) / totalCapital) * 100 : 0,
    max_drawdown_pct: Math.min(0, ...snaps.map((s) => s.drawdown_pct)),
    num_strategies: withResult.length,
  };
  return { source: 'saved', combined: { equity_snapshots: snaps }, aggregate, items: members.map(toItem) };
}

function toItem(m) {
  const c = m.result?.combined;
  return {
    id: m.id,
    name: m.name || m.dsl?.name,
    capital: m.capital,
    dsl: m.dsl,
    metrics: c?.metrics,
    baseline: m.result?.baseline ? { asset: m.result.baseline.asset, metrics: m.result.baseline.metrics } : null,
    legs: (m.result?.legs || []).map((l) => ({ asset: l.asset, weight_pct: l.weight_pct, metrics: l.metrics })),
    range: m.range,
    savedAt: m.savedAt,
  };
}
