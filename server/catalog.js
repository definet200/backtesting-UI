// Capabilities + pre-built strategy templates.
//
// GET /capabilities and GET /strategies are not built on the engine yet (§7 of
// the integration guide). The BFF tries the engine first and falls back to these
// built-in definitions so the FE pickers and templates work today. Everything
// here reflects the "data reality" note in §2: only BTC, xyz:GOLD, xyz:SP500
// have price data.

export const FALLBACK_CAPABILITIES = {
  source: 'bff-fallback',
  asset_classes: [
    {
      class: 'Crypto',
      available: true,
      assets: [
        { symbol: 'BTC', name: 'Bitcoin', date_range: { start: '2017-01-01', end: '2026-05-31' } },
      ],
    },
    {
      class: 'Commodities',
      available: true,
      assets: [
        { symbol: 'xyz:GOLD', name: 'Gold', date_range: { start: '2026-01-01', end: '2026-05-31' } },
      ],
    },
    {
      class: 'Indices',
      available: true,
      assets: [
        { symbol: 'xyz:SP500', name: 'S&P 500', date_range: { start: '2026-01-01', end: '2026-05-31' } },
      ],
    },
    { class: 'US Stocks', available: false, assets: [], note: 'No price data ingested yet.' },
    { class: 'Bonds', available: false, assets: [], note: 'No price data ingested yet.' },
  ],
  indicators: [
    { name: 'rsi', label: 'RSI', params: { period: 14 } },
    { name: 'ema', label: 'EMA', params: { period: 20 } },
    { name: 'sma', label: 'SMA', params: { period: 50 } },
    { name: 'atr', label: 'ATR', params: { period: 14 } },
    { name: 'macd', label: 'MACD', params: { fast: 12, slow: 26, signal: 9 } },
    { name: 'bollinger', label: 'Bollinger Bands', params: { period: 20, std: 2 } },
    { name: 'supertrend', label: 'Supertrend', params: { period: 10, multiplier: 3 } },
    { name: 'volume', label: 'Volume', params: {} },
  ],
  // Full 83-key macro registry (docs/macro-indicators.md).
  macro_keys: MACRO_KEYS.map((m) => ({ key: m.key, label: m.name, category: m.category, frequency: m.frequency, unit: m.unit })),
};

import { op, atom, allOf, anyOf, classicEntry, leg, strategy } from './dsl.js';
import { MACRO_KEYS } from './macro-catalog.js';

export const FALLBACK_STRATEGIES = [
  {
    id: 'btc-rsi-meanrev',
    name: 'BTC RSI Mean Reversion',
    description: 'Buy BTC when RSI is oversold (<30), exit when RSI recovers (>55).',
    asset_class: 'Crypto',
    required_skills: ['rsi'],
    dsl: strategy({
      name: 'BTC RSI Mean Reversion',
      description: 'Buy oversold BTC (RSI<30), exit on RSI recovery (>55).',
      weights: [{ asset: 'BTC', pct: 100 }],
      legs: [leg({
        asset: 'BTC', leverage: 2,
        entryLong: classicEntry(atom(op.indicator('rsi', { period: 14 }), 'less_than', op.value(30), '1h'), { take_profit: { pct: 6 }, stop_loss: { pct: 4 } }),
        exitLong: atom(op.indicator('rsi', { period: 14 }), 'greater_than', op.value(55), '1h'),
      })],
    }),
  },
  {
    id: 'btc-ema-trend',
    name: 'BTC EMA Trend Following',
    description: 'Long BTC when EMA(9) crosses above EMA(21); exit on the cross down.',
    asset_class: 'Crypto',
    required_skills: ['ema'],
    dsl: strategy({
      name: 'BTC EMA Trend Following',
      description: 'Trend-follow BTC on EMA(9)/EMA(21) crossover.',
      weights: [{ asset: 'BTC', pct: 100 }],
      legs: [leg({
        asset: 'BTC', leverage: 2,
        entryLong: classicEntry(atom(op.indicator('ema', { period: 9 }), 'crossed_above', op.indicator('ema', { period: 21 }), '4h')),
        exitLong: atom(op.indicator('ema', { period: 9 }), 'crossed_below', op.indicator('ema', { period: 21 }), '4h'),
      })],
    }),
  },
  {
    id: 'btc-gold-6040',
    name: 'BTC / Gold 60-40',
    description: 'Diversified 60% BTC (EMA trend) + 40% Gold (RSI mean-reversion).',
    asset_class: 'Mixed',
    required_skills: ['ema', 'rsi'],
    dsl: strategy({
      name: 'BTC / Gold 60-40',
      description: 'Two-leg diversified allocation: BTC EMA trend + Gold RSI dip-buy.',
      weights: [{ asset: 'BTC', pct: 60 }, { asset: 'xyz:GOLD', pct: 40 }],
      legs: [
        leg({
          asset: 'BTC', leverage: 2,
          entryLong: classicEntry(atom(op.indicator('ema', { period: 9 }), 'crossed_above', op.indicator('ema', { period: 21 }), '4h')),
          exitLong: atom(op.indicator('ema', { period: 9 }), 'crossed_below', op.indicator('ema', { period: 21 }), '4h'),
        }),
        leg({
          asset: 'xyz:GOLD', leverage: 1,
          entryLong: classicEntry(atom(op.indicator('rsi', { period: 14 }), 'less_than', op.value(40), '1d'), { take_profit: { pct: 5 }, stop_loss: { pct: 4 } }),
          exitLong: atom(op.indicator('rsi', { period: 14 }), 'greater_than', op.value(60), '1d'),
        }),
      ],
    }),
  },
  {
    id: 'btc-macro-cpi',
    name: 'BTC Macro (CPI-aware)',
    description: 'Long BTC on bullish MACD while CPI YoY is cooling (< 3.5%).',
    asset_class: 'Crypto',
    required_skills: ['macd'],
    dsl: strategy({
      name: 'BTC Macro (CPI-aware)',
      description: 'Macro-gated momentum: MACD histogram > 0 AND CPI(YoY) < 3.5%.',
      weights: [{ asset: 'BTC', pct: 100 }],
      legs: [leg({
        asset: 'BTC', leverage: 2,
        entryLong: classicEntry(allOf([
          atom(op.indicator('macd', { fast: 12, slow: 26, signal: 9 }, 'histogram'), 'greater_than', op.value(0), '1h'),
          atom(op.macro('cpi_yy'), 'less_than', op.value(3.5), '1h'),
        ])),
        exitLong: atom(op.indicator('macd', { fast: 12, slow: 26, signal: 9 }, 'histogram'), 'less_than', op.value(0), '1h'),
      })],
    }),
  },
  {
    id: 'macro-regime-btc-sp500',
    name: 'Macro Regime — BTC + S&P 500',
    description: 'Risk-on macro: long BTC (60%) + S&P 500 (40%) only while CPI YoY < 3.5% and Fed Funds Rate ≤ 5%.',
    asset_class: 'Mixed',
    required_skills: ['rsi', 'ema'],
    dsl: strategy({
      name: 'Macro Regime Long — BTC + S&P 500',
      description: 'Risk-on macro: long BTC and the S&P 500 only while inflation is cooling (CPI YoY < 3.5%) and the Fed Funds Rate is not restrictive (≤ 5%). BTC adds an RSI dip trigger; SP500 uses an EMA trend trigger.',
      strategyFraction: 100,
      weights: [{ asset: 'BTC', pct: 60 }, { asset: 'xyz:SP500', pct: 40 }],
      legs: [
        leg({
          asset: 'BTC', leverage: 2,
          entryLong: classicEntry(allOf([
            atom(op.indicator('rsi', { period: 14 }), 'less_than', op.value(40), '1h'),
            atom(op.macro('cpi_yy'), 'less_than', op.value(3.5), '1h'),
            atom(op.macro('interest_rate'), 'less_than_or_equal', op.value(5), '1h'),
          ]), { take_profit: { pct: 8 }, stop_loss: { pct: 5 } }),
          exitLong: anyOf([
            atom(op.indicator('rsi', { period: 14 }), 'greater_than', op.value(65), '1h'),
            atom(op.macro('cpi_yy'), 'greater_than', op.value(4), '1h'),
          ]),
        }),
        leg({
          asset: 'xyz:SP500', leverage: 1,
          entryLong: classicEntry(allOf([
            atom(op.indicator('ema', { period: 9 }), 'crossed_above', op.indicator('ema', { period: 21 }), '1d'),
            atom(op.macro('interest_rate'), 'less_than_or_equal', op.value(5), '1d'),
          ])),
          exitLong: atom(op.indicator('ema', { period: 9 }), 'crossed_below', op.indicator('ema', { period: 21 }), '1d'),
        }),
      ],
      portfolioExit: { equity_take_profit: { pct: 15 }, equity_stop_loss: { pct: 10 } },
    }),
  },
  {
    id: 'sp500-supertrend',
    name: 'S&P 500 Supertrend',
    description: 'Ride S&P 500 trend: long when close crosses above the Supertrend line.',
    asset_class: 'Indices',
    required_skills: ['supertrend'],
    dsl: strategy({
      name: 'S&P 500 Supertrend',
      description: 'Supertrend trend-following on the index.',
      weights: [{ asset: 'xyz:SP500', pct: 100 }],
      legs: [leg({
        asset: 'xyz:SP500', leverage: 1,
        entryLong: classicEntry(atom(op.price('close'), 'crossed_above', op.indicator('supertrend', { period: 10, multiplier: 3 }), '1d')),
        exitLong: atom(op.price('close'), 'crossed_below', op.indicator('supertrend', { period: 10, multiplier: 3 }), '1d'),
      })],
    }),
  },
];

// Normalize whatever the engine returns into the shape the FE expects, or fall back.
export async function getCatalog(engine) {
  const out = { capabilities: FALLBACK_CAPABILITIES, strategies: FALLBACK_STRATEGIES, engineLive: false };

  const cap = await engine.capabilities();
  if (cap.ok && cap.body && (cap.body.asset_classes || cap.body.indicators)) {
    out.capabilities = { source: 'engine', ...cap.body };
    out.engineLive = true;
  } else {
    // Derive indicator list from /health if /capabilities is missing.
    const h = await engine.health();
    if (h.ok && Array.isArray(h.body?.available_indicators)) {
      out.engineLive = true;
      out.capabilities = {
        ...FALLBACK_CAPABILITIES,
        source: 'health-derived',
        indicators: h.body.available_indicators.map((n) =>
          FALLBACK_CAPABILITIES.indicators.find((i) => i.name === n) || { name: n, label: n, params: {} },
        ),
      };
    }
  }

  const st = await engine.strategies();
  if (st.ok && Array.isArray(st.body?.strategies)) {
    out.strategies = st.body.strategies;
  } else if (st.ok && Array.isArray(st.body)) {
    out.strategies = st.body;
  }

  return out;
}
