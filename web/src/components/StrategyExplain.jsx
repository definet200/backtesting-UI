import React from 'react';
import { pretty } from '../format.js';

// Friendly labels for operands.
const MACRO_LABELS = {
  cpi_yy: 'CPI (YoY)', core_cpi_yy: 'Core CPI (YoY)', ppi_yy: 'PPI (YoY)',
  interest_rate: 'Fed Funds Rate', nfp: 'Non-Farm Payrolls', unemployment_rate: 'Unemployment Rate',
  ism_manufacturing_pmi: 'ISM Manufacturing PMI', gdp_qq: 'GDP (QoQ)', retail_sales_mm: 'Retail Sales (MoM)',
};
const OPS = {
  less_than: '<', greater_than: '>', less_than_or_equal: '≤', greater_than_or_equal: '≥',
  crossed_above: 'crosses above', crossed_below: 'crosses below',
};

function operandText(o) {
  if (!o || typeof o !== 'object') return '?';
  switch (o.type) {
    case 'indicator': {
      const params = Object.values(o.params || {});
      const attr = o.attribute ? ` ${o.attribute.replace('_', ' ')}` : '';
      return `${o.name.toUpperCase()}${params.length ? `(${params.join(', ')})` : ''}${attr}`;
    }
    case 'price': return `price (${o.field})`;
    case 'macro': return MACRO_LABELS[o.key] || o.key;
    case 'lookback': return `${o.function} ${o.source}(${o.period})${o.multiplier !== 1 ? ` ×${o.multiplier}` : ''}`;
    case 'value': return String(o.value);
    default: return o.type;
  }
}

function condText(expr) {
  if (!expr || typeof expr !== 'object') return '';
  if (Array.isArray(expr.all_of)) return expr.all_of.map(condText).join(' AND ');
  if (Array.isArray(expr.any_of)) return `(${expr.any_of.map(condText).join(' OR ')})`;
  // atom
  return `${operandText(expr.left)} ${OPS[expr.operator] || expr.operator} ${operandText(expr.right)}${expr.timeframe ? ` [${expr.timeframe}]` : ''}`;
}

function weightOf(dsl, asset) {
  const w = (dsl.allocation?.weights || []).find((x) => x.asset === asset);
  return w?.pct;
}

export default function StrategyExplain({ dsl }) {
  if (!dsl) return null;
  const legs = dsl.legs || [];
  const pe = dsl.portfolio_exit;

  return (
    <div className="explain">
      <div className="explain-title">What this strategy does</div>
      {dsl.description && <p className="explain-desc">{dsl.description}</p>}

      <ul className="explain-legs">
        {legs.map((leg, i) => {
          const pct = weightOf(dsl, leg.asset);
          const sides = ['long', 'short'];
          return (
            <li key={i}>
              <div className="explain-leg-head">
                {pct != null ? `${pct}% ` : ''}{pretty(leg.asset)}
                <span className="explain-meta"> · {leg.leverage || 1}× {leg.margin_mode || 'cross'}</span>
              </div>
              {sides.map((side) => {
                const entry = leg.entry?.[side];
                if (!entry) return null;
                const cond = entry.conditions ? condText(entry.conditions) : (entry.tranches ? 'staged tranche entries' : '');
                const tp = entry.take_profit?.pct, sl = entry.stop_loss?.pct;
                return (
                  <div className="explain-rule" key={side}>
                    <span className="explain-tag enter">Enter {side}</span> when {cond}
                    {(tp != null || sl != null) && (
                      <span className="explain-bracket">
                        {tp != null ? ` · take-profit +${tp}%` : ''}{sl != null ? ` · stop-loss −${sl}%` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
              {sides.map((side) => {
                const ex = leg.exit?.[side];
                if (!ex?.conditions) return null;
                return (
                  <div className="explain-rule" key={`x-${side}`}>
                    <span className="explain-tag exit">Exit {side}</span> when {condText(ex.conditions)}
                  </div>
                );
              })}
              {(!leg.exit || (!leg.exit.long && !leg.exit.short)) && (
                <div className="explain-rule muted">Exit: brackets only (take-profit / stop-loss)</div>
              )}
            </li>
          );
        })}
      </ul>

      {pe && (
        <div className="explain-pe">
          Portfolio-wide exit — flatten everything at
          {pe.equity_take_profit?.pct != null ? ` +${pe.equity_take_profit.pct}%` : ''}
          {pe.equity_take_profit?.pct != null && pe.equity_stop_loss?.pct != null ? ' /' : ''}
          {pe.equity_stop_loss?.pct != null ? ` −${pe.equity_stop_loss.pct}%` : ''} aggregate equity.
        </div>
      )}
    </div>
  );
}
