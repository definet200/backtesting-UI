import React, { useState } from 'react';
import EquityChart from './EquityChart.jsx';
import Metrics from './Metrics.jsx';
import { pct, num, pretty, sign } from '../format.js';

export default function BacktestResult({ result, onFinalize }) {
  const [capital, setCapital] = useState(10000);
  if (!result) return <div className="empty">Run a strategy to see results here.</div>;

  const { combined, legs = [], baseline } = result;
  const stratPts = (combined?.equity_snapshots || []).map((s) => s.equity);
  const basePts = (baseline?.equity_snapshots || []).map((s) => s.equity);

  const series = [
    { points: stratPts, color: '#5b8cff', width: 2 },
    ...(basePts.length ? [{ points: basePts, color: '#8b97ac', width: 1.5, dashed: true }] : []),
  ];

  // Flatten trade logs across legs.
  const trades = legs.flatMap((l) => (l.trade_log || []).map((t) => ({ ...t, _leg: l.asset })));

  const win = result.date_range_used;

  return (
    <div>
      {win && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
          Window: {String(win.start).slice(0, 10)} → {String(win.end).slice(0, 10)}{win.clamped ? ' (clamped to available data)' : ''}
        </div>
      )}
      <Metrics metrics={combined?.metrics || {}} />

      <div className="chart-wrap">
        <div className="chart-head">
          <span>Equity curve</span>
          <span className="legend">
            <span><i className="l-strat" />Strategy</span>
            {basePts.length > 0 && <span><i className="l-base" />Buy &amp; hold {baseline?.asset ? `(${pretty(baseline.asset)})` : ''}</span>}
          </span>
        </div>
        <EquityChart series={series} />
        {combined?.portfolio_exit_fired && (
          <div style={{ color: 'var(--warn)', fontSize: 12, marginTop: 6 }}>⚠ Portfolio exit fired during the run.</div>
        )}
      </div>

      <h4>Per-leg breakdown</h4>
      {legs.length === 0 && <div className="empty" style={{ padding: 20 }}>No legs returned.</div>}
      {legs.map((l, i) => (
        <div className="leg" key={i}>
          <div className="leg-head">
            <span>{pretty(l.asset)} <span className="pill">{l.weight_pct}%</span></span>
            <span className={`v ${sign(l.metrics?.total_return_pct)}`} style={{ fontSize: 14 }}>{pct(l.metrics?.total_return_pct)}</span>
          </div>
          <div className="leg-sub">
            <span>Trades: {l.metrics?.num_trades ?? '—'}</span>
            <span>Sharpe: {num(l.metrics?.sharpe_approx)}</span>
            <span>Max DD: {pct(l.metrics?.max_drawdown_pct)}</span>
            <span>PF: {num(l.metrics?.profit_factor)}</span>
          </div>
        </div>
      ))}

      <h4>Trade log <span className="pill">{trades.length}</span></h4>
      <div className="tradelog-wrap">
        <table>
          <thead>
            <tr>
              <th>Asset</th><th>Side</th><th>Entry</th><th>Exit</th>
              <th>Entry px</th><th>Exit px</th><th>PnL</th><th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--muted)' }}>No trades.</td></tr>}
            {trades.slice(0, 200).map((t, i) => (
              <tr key={i}>
                <td>{pretty(t.asset || t._leg)}</td>
                <td>{t.side}</td>
                <td>{fmtTime(t.entry_time)}</td>
                <td>{fmtTime(t.exit_time)}</td>
                <td>{num(t.entry_price)}</td>
                <td>{num(t.exit_price)}</td>
                <td className={sign(t.pnl_pct)}>{pct(t.pnl_pct)}</td>
                <td>{t.exit_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="finalize">
        <label>Capital <input type="number" min={100} step={100} value={capital} onChange={(e) => setCapital(Number(e.target.value))} /></label>
        <button onClick={() => onFinalize(capital)}>Add to portfolio</button>
      </div>
    </div>
  );
}

function fmtTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  if (isNaN(d)) return String(t).slice(0, 16);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
