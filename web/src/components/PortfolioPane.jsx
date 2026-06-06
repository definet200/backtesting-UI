import React, { useState } from 'react';
import EquityChart from './EquityChart.jsx';
import StrategyExplain from './StrategyExplain.jsx';
import { pct, num, money, sign, pretty } from '../format.js';

export default function PortfolioPane({ data, items, onRemove, loading }) {
  const [open, setOpen] = useState(null); // expanded member id
  if (loading) return <div className="empty">Aggregating portfolio…</div>;
  if (!items || items.length === 0) return <div className="empty">No saved strategies yet. Run a backtest and click “Save to portfolio”.</div>;

  const agg = data?.aggregate;
  const pts = (data?.combined?.equity_snapshots || []).map((s) => s.equity);
  // Prefer the backtested members (they carry metrics); fall back to the saved list.
  const backtested = data?.items || [];
  const members = items.map((saved) => {
    const bt = backtested.find((b) => b.id === saved.id) || {};
    return { id: saved.id, name: bt.name || saved.dsl?.name, capital: saved.capital, dsl: saved.dsl || bt.dsl, metrics: bt.metrics, baseline: bt.baseline, legs: bt.legs, range: saved.range || bt.range, savedAt: saved.savedAt };
  });

  return (
    <div>
      {agg && (
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="metric"><div className="k">Capital</div><div className="v">{money(agg.total_capital)}</div></div>
          <div className="metric"><div className="k">Value</div><div className="v">{money(agg.final_equity)}</div></div>
          <div className="metric"><div className="k">Return</div><div className={`v ${sign(agg.total_return_pct)}`}>{pct(agg.total_return_pct)}</div></div>
          <div className="metric"><div className="k">Max DD</div><div className="v">{pct(agg.max_drawdown_pct)}</div></div>
          <div className="metric"><div className="k">Strategies</div><div className="v">{agg.num_strategies}</div></div>
          <div className="metric"><div className="k">Source</div><div className="v" style={{ fontSize: 12 }}>{data?.source === 'engine' ? 'engine' : 'aggregated'}</div></div>
        </div>
      )}

      {pts.length > 1 && (
        <div className="chart-wrap">
          <div className="chart-head"><span>Portfolio equity</span></div>
          <EquityChart series={[{ points: pts, color: '#21d4a8', width: 2 }]} />
        </div>
      )}

      <h4>Members <span className="pill">{members.length}</span></h4>
      {members.map((m) => {
        const isOpen = open === m.id;
        return (
          <div className="pf-member-card" key={m.id}>
            <div className="pf-member-row" onClick={() => setOpen(isOpen ? null : m.id)}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  <span className="pf-caret">{isOpen ? '▾' : '▸'}</span> {m.name || 'Strategy'}
                </div>
                <div className="meta">
                  {money(m.capital)}
                  {m.metrics?.total_return_pct != null && <> · <span className={sign(m.metrics.total_return_pct)}>{pct(m.metrics.total_return_pct)}</span></>}
                  {m.metrics?.num_trades != null && <> · {m.metrics.num_trades} trades</>}
                </div>
              </div>
              <button className="pf-remove" onClick={(e) => { e.stopPropagation(); onRemove(m.id); }}>Remove</button>
            </div>

            {isOpen && (
              <div className="pf-member-detail">
                {m.range && (
                  <div className="meta" style={{ marginBottom: 8 }}>
                    Result captured on window {String(m.range.start).slice(0, 10)} → {String(m.range.end).slice(0, 10)}
                  </div>
                )}
                {/* Short result */}
                {m.metrics ? (
                  <div className="metrics" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 10 }}>
                    <div className="metric"><div className="k">Return</div><div className={`v ${sign(m.metrics.total_return_pct)}`}>{pct(m.metrics.total_return_pct)}</div></div>
                    <div className="metric"><div className="k">Max DD</div><div className="v">{pct(m.metrics.max_drawdown_pct)}</div></div>
                    <div className="metric"><div className="k">Sharpe</div><div className="v">{num(m.metrics.sharpe_approx)}</div></div>
                    <div className="metric"><div className="k">Trades</div><div className="v">{m.metrics.num_trades ?? '—'}</div></div>
                  </div>
                ) : (
                  <div className="meta" style={{ marginBottom: 8 }}>No backtest metrics — the engine may have been offline when aggregated.</div>
                )}

                {/* Per-leg (if multi-leg) */}
                {(m.legs || []).length > 1 && (
                  <div className="pf-legs">
                    {m.legs.map((l, i) => (
                      <span key={i} className="pf-leg-chip">{pretty(l.asset)} {l.weight_pct}% · <span className={sign(l.metrics?.total_return_pct)}>{pct(l.metrics?.total_return_pct)}</span></span>
                    ))}
                  </div>
                )}
                {m.baseline?.metrics && (
                  <div className="meta" style={{ margin: '6px 0' }}>vs buy &amp; hold {pretty(m.baseline.asset)}: <span className={sign(m.baseline.metrics.total_return_pct)}>{pct(m.baseline.metrics.total_return_pct)}</span></div>
                )}

                {/* What it does + DSL */}
                {m.dsl && <StrategyExplain dsl={m.dsl} />}
                {m.dsl && (
                  <details className="dsl-view">
                    <summary>View DSL</summary>
                    <pre>{JSON.stringify(m.dsl, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
