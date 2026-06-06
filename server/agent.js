// The agent layer: natural-language prompt -> validated DSL v2.3 strategy.
//
// Uses the Anthropic Messages API with forced tool use when ANTHROPIC_API_KEY is
// set (the key lives ONLY here, server-side). Otherwise falls back to a
// deterministic rule-based generator so the demo works end-to-end without a key.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { op, atom, allOf, classicEntry, leg, strategy, evenWeights } from './dsl.js';

// Load the authoritative DSL spec (docs/dsl.md) once and extract the sections
// the agent needs to emit valid, well-valued strategies: the schema (§3), the
// validator error codes (§5), and the worked examples (§6). These are embedded
// (prompt-cached) so Claude grounds its output on the real grammar, not a guess.
const DSL_SPEC = (() => {
  try {
    const md = fs.readFileSync(path.join(config.root, 'docs', 'dsl.md'), 'utf8');
    const slice = (from, to) => {
      const i = md.indexOf(from);
      if (i < 0) return '';
      const j = to ? md.indexOf(to, i + from.length) : md.length;
      return md.slice(i, j > i ? j : md.length);
    };
    const schema = slice('## 3. Schema', '## 4. Semantics');
    const validator = slice('### 5.1 Error codes', '### 5.2');
    const examples = slice('## 6. Worked examples', '## 7.');
    return [schema, validator, examples].filter(Boolean).join('\n\n---\n\n');
  } catch {
    return '';
  }
})();

// Concrete, backtest-ready value guidance so the model picks sensible numbers
// (periods, thresholds, leverage, brackets) rather than placeholders.
const VALUE_GUIDANCE = [
  'VALUE GUIDANCE — pick sensible, backtest-ready values, not placeholders:',
  '- RSI(14): dip-buy long entry < 30–35; exit/overbought > 60–70; short entry > 65–70.',
  '- EMA/SMA crossovers: fast/slow pairs 9/21 (responsive) or 20/50, 50/200 (trend). Enter on crossed_above, exit on crossed_below.',
  "- MACD(12,26,9): use attribute 'histogram' > 0 (bullish) / < 0 (bearish), or macd_line crossed_above 'signal'. Never omit the attribute.",
  '- Bollinger(20, num_std 2): mean-reversion — long when price.close < lower band; exit near middle band.',
  '- Supertrend(10, multiplier 3): long when price.close crossed_above supertrend; exit on crossed_below.',
  '- ATR(14): a volatility filter, not a standalone entry trigger.',
  "- Leverage: Crypto 2–3×, Indices/Commodities 1–2×. margin_mode 'cross' unless deliberately isolating a leg.",
  '- Brackets: take_profit 4–10%, stop_loss 3–5%; keep reward:risk ≥ 1:1 unless the user asks for a scalp.',
  '- Timeframes: crypto entries 1h–4h; trend filters 4h–1d; macro atoms may use the entry timeframe (resolved point-in-time).',
  '- Macro gating (risk-on): cpi_yy < 3–4%, interest_rate ≤ 4.5–5%. LOOSEN bands (e.g. CPI < 5%) so the regime gate stays open long enough for the technical trigger to actually fire — over-tight gates produce 0 trades.',
  '- Allocation: strategy_fraction 100 (or lower for conservative). weights are integers summing to 100; for multi-asset weight by conviction (e.g. 60/40).',
  '- Use a conditional exit and/or brackets. Keep every conditions tree depth ≤ 3.',
  '',
  'STRATEGY PATTERNS — map the user intent to structure:',
  '- "Mean reversion": enter long when oversold (RSI < 30–35, or price.close < Bollinger lower band); exit on reversion (RSI > 55–60, or price.close ≥ Bollinger middle). Optionally also a short side at the overbought extreme.',
  '- "Trend following": EMA/SMA crossovers or Supertrend flips.',
  '- "Long X and short Y" / long+short: populate BOTH entry.long and entry.short on the same leg, each with its own trigger (e.g. long on Supertrend flip up, short on RSI > 70). The engine auto-reverses on the opposite signal.',
  '- "Use technical skills" = OHLCV indicators (rsi, ema, sma, atr, macd, bollinger, supertrend, volume). "Macro skill / data points" = the macro operands. "Subscribe both" = you may use indicators AND macro operands together.',
  '- "Adjust exposure / gate on macro": add macro atoms to the entry conditions (e.g. only go long while cpi_yy is falling / interest_rate is not restrictive). Macro can gate long vs short regimes.',
  '- "Use all / many data points": the strategy MUST still trade — ANDing many strict macro conditions yields 0 trades and is wrong. Use ONE primary regime gate that actually toggles over the window as the long entry (e.g. interest_rate ≤ 5, or cpi_yy < 4), and put a SECOND set of risk-off signals in an any_of EXIT (e.g. cpi_yy > 4 OR unemployment_rate > 5 OR ism_manufacturing_pmi < 50). You may reference several data points across categories this way while keeping each tree depth ≤ 3. Mention in the description that ANDing all 83 would never trade, so a representative regime model was used.',
  '- Macro-ONLY strategy (no indicators): the entry is a pure regime gate — keep it to 1–3 macro conditions with thresholds near recent values so it opens for a meaningful part of the window, and give an exit that flips on the opposite regime. Verify the logic can plausibly fire (never emit gates that can never all be true together).',
  '- "Profitable, low drawdown": ALWAYS include a stop_loss (3–5%), keep leverage modest (1–2×), add a macro regime filter to sit out hostile periods, and prefer a conditional exit so winners are taken. Consider a portfolio_exit equity stop (e.g. −10%). Aim to actually take trades — a 0-trade strategy is never "profitable".',
  '- "Best strategy / try permutations": you cannot run backtests yourself, so emit ONE well-reasoned, diversified strategy that combines the strongest technical trigger with a sensible macro regime gate and proper risk management — and note in the description that it is a strong baseline the user can iterate on.',
].join('\n');

// ── Vocabulary derived from capabilities ───────────────────────────────────
function allowedAssets(capabilities) {
  const out = [];
  for (const c of capabilities.asset_classes || []) {
    if (!c.available) continue;
    for (const a of c.assets || []) out.push(a.symbol);
  }
  return out;
}

// Map common user aliases -> engine symbols.
const ALIASES = {
  btc: 'BTC', bitcoin: 'BTC',
  gold: 'xyz:GOLD', xau: 'xyz:GOLD',
  sp500: 'xyz:SP500', spx: 'xyz:SP500', 's&p': 'xyz:SP500', 'sp 500': 'xyz:SP500',
};

const INDICATOR_DEFAULTS = {
  rsi: { period: 14 }, ema: { period: 9 }, sma: { period: 50 },
  atr: { period: 14 }, macd: { fast: 12, slow: 26, signal: 9 },
  bollinger: { period: 20, num_std: 2 }, supertrend: { period: 10, multiplier: 3 }, volume: {},
};

const MACRO_ALIASES = {
  cpi: 'cpi_yy', inflation: 'cpi_yy', ppi: 'ppi_yy',
  'interest rate': 'interest_rate', 'fed funds': 'interest_rate', rate: 'interest_rate',
  nfp: 'nfp', payroll: 'nfp', unemployment: 'unemployment_rate', pmi: 'ism_manufacturing_pmi',
  gdp: 'gdp_qq', 'retail sales': 'retail_sales_mm',
};

// ── Tool / output schema for Anthropic structured output ────────────────────
function emitStrategyTool(capabilities) {
  const assets = allowedAssets(capabilities);
  const operandSchema = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['indicator', 'price', 'lookback', 'macro', 'value'] },
      name: { type: 'string' }, params: { type: 'object' }, attribute: { type: 'string' },
      field: { type: 'string', enum: ['open', 'high', 'low', 'close'] },
      function: { type: 'string', enum: ['highest', 'lowest'] }, source: { type: 'string' },
      period: { type: 'number' }, multiplier: { type: 'number' },
      key: { type: 'string' }, value: { type: 'number' },
    },
    required: ['type'],
  };
  const atomSchema = {
    type: 'object',
    required: ['left', 'operator', 'right', 'timeframe'],
    properties: {
      left: operandSchema, right: operandSchema,
      operator: { type: 'string', enum: ['less_than', 'greater_than', 'less_than_or_equal', 'greater_than_or_equal', 'crossed_above', 'crossed_below'] },
      timeframe: { type: 'string', enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] },
    },
  };
  // Conditions can be an atom or an all_of/any_of group (depth <= 3). Modelled
  // loosely as an object; the validate-repair loop catches structural issues.
  const exprSchema = { type: 'object', description: 'An atom {left,operator,right,timeframe} OR a group {all_of:[...]} / {any_of:[...]} (groups need >=2 children, depth <= 3).' };
  const entryRule = {
    type: 'object',
    required: ['conditions', 'size'],
    properties: {
      conditions: exprSchema,
      size: { type: 'object', required: ['type', 'pct'], properties: { type: { const: 'percent_allocation' }, pct: { type: 'number' } } },
      take_profit: { type: 'object', properties: { pct: { type: 'number' } } },
      stop_loss: { type: 'object', properties: { pct: { type: 'number' } } },
    },
  };
  return {
    name: 'emit_strategy',
    description: 'Emit a single valid DSL v2.3 Portfolio Strategy. Use only allowed assets/indicators/macro keys. allocation.weights pct values are integers summing to 100.',
    input_schema: {
      type: 'object',
      required: ['dsl_version', 'name', 'description', 'allocation', 'legs'],
      properties: {
        dsl_version: { type: 'string', enum: ['2.3'] },
        name: { type: 'string' },
        description: { type: 'string', minLength: 1 },
        allocation: {
          type: 'object',
          required: ['strategy_fraction', 'weights'],
          properties: {
            strategy_fraction: { type: 'number', description: 'integer in (0,100]' },
            weights: { type: 'array', items: { type: 'object', required: ['asset', 'pct'], properties: { asset: { type: 'string', enum: assets }, pct: { type: 'number' } } } },
          },
        },
        legs: {
          type: 'array',
          items: {
            type: 'object',
            required: ['asset', 'leverage', 'margin_mode', 'entry', 'exit'],
            properties: {
              asset: { type: 'string', enum: assets },
              leverage: { type: 'number' },
              margin_mode: { type: 'string', enum: ['cross', 'isolated'] },
              entry: { type: 'object', properties: { long: entryRule, short: entryRule } },
              exit: { type: 'object', properties: { long: { type: 'object', required: ['conditions'], properties: { conditions: exprSchema } }, short: { type: 'object', properties: { conditions: exprSchema } } } },
            },
          },
        },
        portfolio_exit: { type: 'object' },
      },
    },
  };
}

function systemPrompt(capabilities, picks) {
  const assets = allowedAssets(capabilities);
  const indicators = (capabilities.indicators || []).map((i) => i.name).join(', ');
  const macroKeys = (capabilities.macro_keys || []).map((m) => m.key).join(', ');
  return [
    'You convert a trading idea into a DSL v2.3 Portfolio Strategy by calling the emit_strategy tool. Output JSON only via the tool.',
    'GRAMMAR (docs/dsl.md):',
    '- Top level: { dsl_version:"2.3", name, description(non-empty), allocation:{strategy_fraction:int(0,100], weights:[{asset,pct}]}, legs:[Leg], portfolio_exit? }.',
    '- weights pct are INTEGERS summing to exactly 100; each leg.asset must appear in weights.',
    '- Leg: { asset, leverage:int>=1, margin_mode:"cross"|"isolated", entry:{long?:EntryRule, short?:EntryRule}, exit:{long?:{conditions}, short?:{conditions}} }. At least one of entry.long/short.',
    '- EntryRule (classic): { conditions:Expr, size:{type:"percent_allocation", pct:(0,100]}, take_profit?:{pct}, stop_loss?:{pct} }.',
    '- Expr = Atom OR {all_of:[Expr,...]} OR {any_of:[Expr,...]}. Groups need >=2 children; depth <= 3. A single condition is just the Atom (do NOT wrap a single atom in a group).',
    '- Atom: { left:Operand, operator, right:Operand, timeframe }. operator in less_than|greater_than|less_than_or_equal|greater_than_or_equal|crossed_above|crossed_below. timeframe in 1m|5m|15m|30m|1h|4h|1d (REQUIRED on every atom).',
    '- Operand: {type:"indicator",name,params,attribute?} | {type:"price",field:"open|high|low|close"} | {type:"lookback",function,source,period,multiplier} | {type:"macro",key} | {type:"value",value}.',
    '- MACD is multi-output: it REQUIRES attribute in macd_line|signal|histogram. Single-output indicators (rsi, ema, sma, atr, supertrend, volume) must NOT set attribute. bollinger requires attribute upper|middle|lower. volume params must be {}.',
    'HARD RULES:',
    '- dsl_version must be exactly "2.3".',
    `- Only these assets exist: ${assets.join(', ')}. Never invent others. If the user names an unavailable asset (e.g. ETH), drop it and use what is available.`,
    `- Available indicators: ${indicators}.`,
    `- Available macro keys: ${macroKeys}.`,
    picks?.skills?.length ? `- The user has these skills enabled: ${picks.skills.join(', ')}.` : '',
    picks?.data_points?.length ? `- The user has these macro data points enabled: ${picks.data_points.join(', ')}.` : '',
    picks?.asset_class ? `- The user picked the asset class: ${picks.asset_class}. Prefer assets from that class.` : '',
    '',
    VALUE_GUIDANCE,
    DSL_SPEC ? `\nAUTHORITATIVE DSL SPEC (excerpts from docs/dsl.md — schema §3, validator codes §5.1, worked examples §6). Follow it exactly:\n\n${DSL_SPEC}` : '',
  ].filter(Boolean).join('\n');
}

// ── Anthropic call ──────────────────────────────────────────────────────────
async function callAnthropic({ messages, capabilities, picks }) {
  const tool = emitStrategyTool(capabilities);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 2000,
      system: [{ type: 'text', text: systemPrompt(capabilities, picks), cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'emit_strategy' },
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const toolUse = (data.content || []).find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('Model did not return a strategy.');
  return toolUse.input;
}

// ── Deterministic fallback generator (no key) ───────────────────────────────
function buildFallbackDSL(prompt, capabilities, picks) {
  const text = (prompt || '').toLowerCase();
  const assets = allowedAssets(capabilities);
  const dropped = [];

  // Detect requested assets.
  const requested = new Set();
  for (const [alias, sym] of Object.entries(ALIASES)) {
    if (text.includes(alias) && assets.includes(sym)) requested.add(sym);
  }
  for (const unsup of ['eth', 'ethereum', 'solana', 'sol', 'tesla', 'aapl', 'apple', 'bond']) {
    if (text.includes(unsup)) dropped.push(unsup.toUpperCase());
  }
  let chosen = [...requested];
  if (chosen.length === 0) {
    // Honour the asset-class pick, else default to BTC.
    const cls = (capabilities.asset_classes || []).find((c) => c.class === picks?.asset_class && c.available);
    if (cls?.assets?.length) chosen = [cls.assets[0].symbol];
    else chosen = assets.includes('BTC') ? ['BTC'] : assets.slice(0, 1);
  }

  // Detect indicators (from text + enabled skills).
  const indicators = new Set();
  const available = new Set((capabilities.indicators || []).map((i) => i.name));
  for (const name of Object.keys(INDICATOR_DEFAULTS)) {
    if (text.includes(name) && available.has(name)) indicators.add(name);
  }
  for (const s of picks?.skills || []) if (INDICATOR_DEFAULTS[s] && available.has(s)) indicators.add(s);
  if (indicators.size === 0) indicators.add('rsi');

  // Detect macro keys.
  const macros = [];
  const macroKeys = new Set((capabilities.macro_keys || []).map((m) => m.key));
  for (const [alias, key] of Object.entries(MACRO_ALIASES)) {
    if (text.includes(alias) && macroKeys.has(key) && !macros.includes(key)) macros.push(key);
  }
  for (const dp of picks?.data_points || []) if (macroKeys.has(dp) && !macros.includes(dp)) macros.push(dp);

  const tf = '1h';
  const ind = (n, attr) => op.indicator(n, INDICATOR_DEFAULTS[n], attr);

  // Build entry/exit atoms from the chosen indicators.
  function rulesFor() {
    const entryAtoms = [];
    let exitAtom = null;
    if (indicators.has('rsi')) {
      entryAtoms.push(atom(ind('rsi'), 'less_than', op.value(35), tf));
      exitAtom = atom(ind('rsi'), 'greater_than', op.value(60), tf);
    }
    if (indicators.has('macd')) {
      entryAtoms.push(atom(ind('macd', 'histogram'), 'greater_than', op.value(0), tf));
      exitAtom = exitAtom || atom(ind('macd', 'histogram'), 'less_than', op.value(0), tf);
    }
    if (indicators.has('ema') || indicators.has('sma')) {
      entryAtoms.push(atom(op.indicator('ema', { period: 9 }), 'crossed_above', op.indicator('ema', { period: 21 }), '4h'));
      exitAtom = exitAtom || atom(op.indicator('ema', { period: 9 }), 'crossed_below', op.indicator('ema', { period: 21 }), '4h');
    }
    if (indicators.has('supertrend')) {
      entryAtoms.push(atom(op.price('close'), 'crossed_above', ind('supertrend'), '4h'));
      exitAtom = exitAtom || atom(op.price('close'), 'crossed_below', ind('supertrend'), '4h');
    }
    if (indicators.has('bollinger')) {
      entryAtoms.push(atom(op.price('close'), 'less_than', op.indicator('bollinger', { period: 20, num_std: 2 }, 'lower'), tf));
      exitAtom = exitAtom || atom(op.price('close'), 'greater_than', op.indicator('bollinger', { period: 20, num_std: 2 }, 'middle'), tf);
    }
    if (entryAtoms.length === 0) {
      entryAtoms.push(atom(ind('rsi'), 'less_than', op.value(35), tf));
      exitAtom = atom(ind('rsi'), 'greater_than', op.value(60), tf);
    }
    // Macro gates on entry (point-in-time). CPI/PPI cooling thresholds.
    for (const key of macros) entryAtoms.push(atom(op.macro(key), 'less_than', op.value(4), tf));
    return { entry: allOf(entryAtoms), exit: exitAtom };
  }

  const weights = evenWeights(chosen);
  const legs = chosen.map((a) => {
    const { entry, exit } = rulesFor();
    return leg({
      asset: a,
      leverage: a === 'BTC' ? 2 : 1,
      entryLong: classicEntry(entry, { take_profit: { pct: 6 }, stop_loss: { pct: 4 } }),
      exitLong: exit,
    });
  });

  const indList = [...indicators];
  const dsl = strategy({
    name: `${chosen.map(prettyAsset).join(' / ')} ${indList.map((s) => s.toUpperCase()).join('+')} strategy`,
    description: (prompt && prompt.trim()) ? prompt.trim().slice(0, 200) : 'Generated strategy',
    weights,
    legs,
  });
  return { dsl, dropped, indicators: indList, macros };
}

// ── Plain-English summary for the chat (never expose raw DSL to the user) ────
export function summarize(dsl, extra = {}) {
  const legs = (dsl.allocation?.weights || []).map((w) => `${w.pct}% ${prettyAsset(w.asset)}`).join(', ');
  const parts = [`**${dsl.name}** — allocates ${legs}.`];
  if (extra.indicators?.length) parts.push(`Signals: ${extra.indicators.map((s) => s.toUpperCase()).join(', ')}.`);
  if (extra.macros?.length) parts.push(`Macro gates: ${extra.macros.join(', ')}.`);
  if (extra.dropped?.length) parts.push(`Note: ${extra.dropped.join(', ')} not available yet — dropped from the strategy.`);
  return parts.join(' ');
}

function prettyAsset(sym) {
  return ({ BTC: 'BTC', 'xyz:GOLD': 'Gold', 'xyz:SP500': 'S&P 500' })[sym] || sym;
}

// ── Public: generate DSL with a validate-repair loop ────────────────────────
export async function generateStrategy({ prompt, capabilities, picks, validate, maxRepairs = 2 }) {
  // Fallback path (no key): rule-based, then validate once.
  if (!config.anthropicKey) {
    const { dsl, dropped, indicators, macros } = buildFallbackDSL(prompt, capabilities, picks);
    const v = await validate(dsl);
    return {
      dsl,
      summary: summarize(dsl, { dropped, indicators, macros }),
      mode: 'fallback',
      valid: v.ok,
      validationErrors: v.ok ? null : v.errors,
      meta: { dropped, indicators, macros },
    };
  }

  // Anthropic path with repair loop.
  const messages = [{ role: 'user', content: prompt }];
  let lastDsl = null;
  let lastErrors = null;
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    lastDsl = await callAnthropic({ messages, capabilities, picks });
    const v = await validate(lastDsl);
    if (v.ok) {
      return { dsl: lastDsl, summary: summarize(lastDsl), mode: 'anthropic', valid: true, validationErrors: null, meta: {} };
    }
    lastErrors = v.errors;
    messages.push({ role: 'assistant', content: [{ type: 'text', text: 'emitted strategy' }] });
    messages.push({ role: 'user', content: `The strategy failed validation with these errors. Fix them and call emit_strategy again:\n${JSON.stringify(v.errors, null, 2)}` });
  }
  return { dsl: lastDsl, summary: summarize(lastDsl || { name: 'Strategy', allocation: { weights: [] } }), mode: 'anthropic', valid: false, validationErrors: lastErrors, meta: {} };
}

export { buildFallbackDSL, allowedAssets };
