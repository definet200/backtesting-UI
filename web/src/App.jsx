import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { aggregatePortfolio } from './aggregate.js';
import Sidebar from './components/Sidebar.jsx';
import BacktestResult from './components/BacktestResult.jsx';
import PortfolioPane from './components/PortfolioPane.jsx';
import StrategyExplain from './components/StrategyExplain.jsx';

let MSG_ID = 0;
const newId = () => ++MSG_ID;

export default function App() {
  const [status, setStatus] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [templates, setTemplates] = useState([]);

  // Guided chat flow: 'start' → click Create → 'asset' (pick class) → 'ready' (prompt).
  const [phase, setPhase] = useState('start');
  const [selectedAssetClass, setSelectedAssetClass] = useState(null);

  const [messages, setMessages] = useState([
    { id: newId(), role: 'bot', kind: 'intro', text: 'Hi! I can build, validate and backtest a trading strategy for you. Click “Create strategy” to start — or subscribe to a pre-built one on the left.' },
  ]);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState('result');
  const [result, setResult] = useState(null);
  const [backtesting, setBacktesting] = useState(false);
  const [currentDsl, setCurrentDsl] = useState(null);
  // User-chosen backtest window. The BFF still clamps to available data and
  // reports back what it actually used.
  const [dateStart, setDateStart] = useState('2026-01-01');
  const [dateEnd, setDateEnd] = useState('2026-05-31');
  // Live OHLCV windows from the engine's GET /api/data-range, keyed by symbol.
  const [dataRanges, setDataRanges] = useState({});
  // Last strategy actually sent to /backtest — persisted so it survives a refresh
  // and a "Re-run" works the moment the engine's DB comes back.
  const [lastRun, setLastRun] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hs:lastRun') || 'null'); } catch { return null; }
  });

  // Portfolio lives entirely in the frontend — each member stores the backtest
  // RESULT captured at save time, so the dashboard never re-runs the engine.
  const [portfolioItems, setPortfolioItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hs:portfolio') || '[]'); } catch { return []; }
  });
  const portfolioData = useMemo(() => aggregatePortfolio(portfolioItems), [portfolioItems]);

  const [toast, setToast] = useState(null);
  const messagesEnd = useRef(null);
  const promptRef = useRef(null);

  // ── Bootstrap ───────────────────────────────────────────────────────────
  useEffect(() => {
    api.health().then(setStatus).catch(() => setStatus({ engine: 'unreachable', agentMode: '?' }));
    api.catalog().then((c) => {
      setCatalog(c);
      setTemplates(c.strategies || []);
      // Fetch the real OHLCV window for every available asset (engine :8000).
      const symbols = (c.capabilities?.asset_classes || [])
        .filter((x) => x.available)
        .flatMap((x) => (x.assets || []).map((a) => a.symbol));
      symbols.forEach(async (s) => {
        try {
          const r = await api.dataRange(s);
          const min = r?.min_datetime || r?.min_date;
          const max = r?.max_datetime || r?.max_date;
          if (min && max) setDataRanges((p) => ({ ...p, [s]: { min: String(min).slice(0, 10), max: String(max).slice(0, 10) } }));
        } catch { /* engine/DB may not report this symbol; clamp handles it */ }
      });
    }).catch((e) => pushBot(`Couldn’t load capabilities: ${e.message}`, true));
  }, []);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  // Bound the date picker to the selected asset class's available window.
  const classAsset = (cls) => (catalog?.capabilities?.asset_classes || []).find((x) => x.class === cls)?.assets?.[0]?.symbol;
  const activeSymbol = classAsset(selectedAssetClass) || 'BTC';
  const bound = dataRanges[activeSymbol] || null;
  // When the available window is known (or the asset changes), snap the picker to it.
  useEffect(() => { if (bound) { setDateStart(bound.min); setDateEnd(bound.max); } }, [activeSymbol, bound?.min, bound?.max]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const showToast = (text, err = false) => { setToast({ text, err }); setTimeout(() => setToast(null), 2600); };
  const pushUser = (text) => setMessages((m) => [...m, { id: newId(), role: 'user', text }]);
  const pushBot = (text, err = false, extra = {}) => setMessages((m) => [...m, { id: newId(), role: 'bot', text, err, ...extra }]);

  function persistPortfolio(next) {
    setPortfolioItems(next);
    try { localStorage.setItem('hs:portfolio', JSON.stringify(next)); } catch {}
  }
  const sameDsl = (a, b) => a && b && JSON.stringify(a) === JSON.stringify(b);

  // ── Guided flow ─────────────────────────────────────────────────────────────
  // Step 1: user clicks "Create strategy" → bot asks which asset class.
  function startCreate() {
    setPhase('asset');
    setSelectedAssetClass(null);
    pushUser('Create a new strategy');
    pushBot('Which asset class do you want to trade?', false, { kind: 'assetPicker' });
  }

  // Step 2: user picks an asset class → bot confirms + unlocks the prompt.
  function chooseAsset(cls) {
    setSelectedAssetClass(cls);
    setPhase('ready');
    pushUser(`Asset class: ${cls}`);
    pushBot(
      `Great — **${cls}** selected. You have access to **all skills**: technical indicators (RSI, EMA, SMA, MACD, Bollinger, Supertrend, ATR, Volume) and **all 83 Macro data points** (CPI, PPI, interest rate, NFP, unemployment, PMI, GDP, …).\n\nNow describe your strategy below — e.g. “Give me a strategy on BTC and ETH which uses RSI, MACD indicators and CPI, PPI data points from the Macro skill.” — and pick your **backtest window** (the date range above the input).`,
    );
    setTimeout(() => promptRef.current?.focus(), 50);
  }

  // ── Chat: prompt -> DSL ────────────────────────────────────────────────────
  async function sendPrompt(e) {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    pushUser(text);
    setPrompt('');
    setBusy(true);
    if (phase !== 'ready') setPhase('ready');
    try {
      const gen = await api.generate({ prompt: text, asset_class: selectedAssetClass, skills: [], data_points: [] });
      const modePill = gen.mode === 'anthropic' ? 'Claude' : 'rule-based';
      if (gen.valid === false && gen.validationErrors) {
        pushBot(`${gen.summary}\n\n⚠ The engine rejected this DSL:\n${formatErrors(gen.validationErrors)}\nYou can still try running it.`, true, { dsl: gen.dsl, pill: modePill });
      } else {
        pushBot(gen.summary, false, { dsl: gen.dsl, pill: modePill });
      }
      setCurrentDsl(gen.dsl);
    } catch (err) {
      pushBot(`Couldn’t build that — ${err.message}. Try rephrasing.`, true);
    } finally {
      setBusy(false);
    }
  }

  // ── Run a backtest for a given DSL ─────────────────────────────────────────
  async function runBacktest(dsl, label, range) {
    setBusy(true);
    setBacktesting(true);
    setTab('result');           // surface the result pane immediately
    const date_range = range || { start: `${dateStart}T00:00:00Z`, end: `${dateEnd}T00:00:00Z` };
    // Remember this as the last attempt so "Re-run" can replay it unchanged.
    const run = { dsl, label: label || dsl?.name, range: date_range, at: new Date().toISOString() };
    setLastRun(run);
    try { localStorage.setItem('hs:lastRun', JSON.stringify(run)); } catch {}
    try {
      const res = await api.backtest({ dsl, date_range });
      if (res?.status === 'error') {
        const detail = res.hint || res.error_message || formatErrors(res.errors) || 'unknown error';
        pushBot(`Backtest error (${res.error_code || 'unknown'}).\n${detail}`, true);
        return;
      }
      setResult(res);
      setCurrentDsl(dsl);
      setTab('result');
      const ret = res?.combined?.metrics?.total_return_pct;
      pushBot(`Ran “${dsl.name}”. ${ret != null ? `Total return ${ret >= 0 ? '+' : ''}${Number(ret).toFixed(2)}%.` : ''} See the Backtest panel →`);
      return { res, range: date_range };
    } catch (err) {
      if (err.status === 503) {
        pushBot(`⚠ Backtest engine unreachable at ${status?.engineBaseUrl || 'port 8000'}. Start hs-compute (POST /backtest) and try again.`, true);
      } else {
        pushBot(`Backtest failed — ${err.message}.`, true);
      }
    } finally {
      setBusy(false);
      setBacktesting(false);
    }
  }

  // ── Subscribe to a pre-built template ──────────────────────────────────────
  async function subscribe(tpl) {
    pushUser(`Subscribe: ${tpl.name}`);
    pushBot(`Loading **${tpl.name}** — ${tpl.description}`, false, { dsl: tpl.dsl });
    await runBacktest(tpl.dsl, tpl.name);
  }

  // ── Save into portfolio (frontend-only, stores the captured result) ──────────
  function storeMember(dsl, capital, res, range) {
    const member = {
      id: `pf_${Date.now()}_${(dsl.name || 'strategy').replace(/\W+/g, '-').toLowerCase()}`,
      name: dsl.name,
      dsl,
      capital: Number(capital) || 10000,
      result: res ? { combined: res.combined, legs: res.legs, baseline: res.baseline } : null,
      range: range || null,
      savedAt: new Date().toISOString(),
    };
    persistPortfolio([...portfolioItems, member]);
    showToast(`Saved “${dsl.name}” to portfolio`);
  }

  // From the chat bubble: use the displayed result if it's for this DSL,
  // otherwise run it once to capture the result, then store it.
  async function saveToPortfolio(dsl, capital = 10000) {
    if (!dsl) return;
    if (sameDsl(currentDsl, dsl) && result && result.status !== 'error') {
      storeMember(dsl, capital, result, lastRun?.range);
      return;
    }
    showToast('Running once to capture the result…');
    const out = await runBacktest(dsl);
    if (out?.res && out.res.status !== 'error') storeMember(dsl, capital, out.res, out.range);
    else showToast('Couldn’t capture a result — run it first', true);
  }

  // From the results pane (current result is guaranteed present).
  const finalize = (capital) => {
    if (result && currentDsl) storeMember(currentDsl, capital, result, lastRun?.range);
    else showToast('Run a backtest first', true);
  };

  function removeMember(id) {
    persistPortfolio(portfolioItems.filter((m) => m.id !== id));
  }

  function switchTab(t) { setTab(t); }

  // ── Render ─────────────────────────────────────────────────────────────────
  const engineOk = status?.engine === 'healthy';
  const agentMode = status?.agentMode;

  return (
    <>
      <header className="topbar">
        <div className="brand"><span className="logo">◈</span><span>HyperSignals <em>Strategy Studio</em></span></div>
        <div className="status">
          <span className={`dot ${engineOk ? 'ok' : 'bad'}`} />
          <span>engine {engineOk ? 'healthy' : 'down'}</span>
          <span className="sep">·</span>
          <span className={`dot ${agentMode === 'anthropic' ? 'ok' : 'warn'}`} />
          <span>agent {agentMode === 'anthropic' ? 'Claude' : 'fallback'}</span>
        </div>
      </header>

      <main className="layout">
        <Sidebar catalog={catalog} templates={templates} onSubscribe={subscribe} onCreate={startCreate} />

        <section className="chat">
          <div className="messages">
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role} ${m.err ? 'err' : ''}`}>
                <Rendered text={m.text} />
                {m.pill && <span className="pill">{m.pill}</span>}
                {m.kind === 'intro' && (
                  <div className="actions">
                    <button className="primary" onClick={startCreate}>+ Create strategy</button>
                  </div>
                )}
                {m.kind === 'assetPicker' && (
                  <div className="asset-picker">
                    {(catalog?.capabilities?.asset_classes || []).map((c) => (
                      <button
                        key={c.class}
                        className={`asset-chip ${c.available ? '' : 'disabled'} ${selectedAssetClass === c.class ? 'sel' : ''}`}
                        disabled={!c.available}
                        title={c.available ? '' : (c.note || 'No data yet')}
                        onClick={() => c.available && chooseAsset(c.class)}
                      >{c.class}{c.available ? '' : ' · soon'}</button>
                    ))}
                  </div>
                )}
                {m.dsl && (
                  <>
                    <StrategyExplain dsl={m.dsl} />
                    <details className="dsl-view">
                      <summary>View DSL</summary>
                      <pre>{JSON.stringify(m.dsl, null, 2)}</pre>
                    </details>
                    <div className="actions">
                      <button className="primary" onClick={() => runBacktest(m.dsl)} disabled={busy}>
                        {backtesting ? <><span className="btn-spin" />Running…</> : 'Run backtest'}
                      </button>
                      <button onClick={() => saveToPortfolio(m.dsl)} disabled={busy}>Save to portfolio</button>
                      <button onClick={() => { navigator.clipboard?.writeText(JSON.stringify(m.dsl, null, 2)); showToast('DSL copied'); }}>Copy DSL</button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {busy && <div className="msg bot"><span className="typing"><i /><i /><i /></span></div>}
            <div ref={messagesEnd} />
          </div>
          <div className={`daterange ${phase === 'ready' ? '' : 'disabled'}`}>
            <span>Backtest window</span>
            <label>From <input type="date" disabled={phase !== 'ready'} value={dateStart} min={bound?.min} max={dateEnd || bound?.max} onChange={(e) => setDateStart(e.target.value)} /></label>
            <label>To <input type="date" disabled={phase !== 'ready'} value={dateEnd} min={dateStart || bound?.min} max={bound?.max} onChange={(e) => setDateEnd(e.target.value)} /></label>
            <span className="hint">
              {bound ? `${activeSymbol} data: ${bound.min} → ${bound.max}` : `${activeSymbol}: no range reported — engine will clamp`}
            </span>
          </div>
          <form className="composer" onSubmit={sendPrompt}>
            <input
              ref={promptRef}
              value={prompt}
              disabled={phase !== 'ready'}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={phase === 'start'
                ? 'Click “Create strategy” to begin…'
                : phase === 'asset'
                  ? 'Pick an asset class above first…'
                  : `Describe your ${selectedAssetClass} strategy — indicators + macro data points…`}
            />
            <button type="submit" disabled={busy || phase !== 'ready' || !prompt.trim()}>Send</button>
          </form>
        </section>

        <section className="results">
          <div className="tabs">
            <button className={`tab ${tab === 'result' ? 'active' : ''}`} onClick={() => switchTab('result')}>Backtest</button>
            <button className={`tab ${tab === 'portfolio' ? 'active' : ''}`} onClick={() => switchTab('portfolio')}>Portfolio {portfolioItems.length > 0 && <span className="pill">{portfolioItems.length}</span>}</button>
          </div>
          {tab === 'result' && lastRun && (
            <div className="rerun-bar">
              <span title={`Last sent ${new Date(lastRun.at).toLocaleString()}`}>Last: <b>{lastRun.label}</b></span>
              <button onClick={() => runBacktest(lastRun.dsl, lastRun.label, lastRun.range)} disabled={busy}>↻ Re-run last strategy</button>
            </div>
          )}
          <div className="tabpane">
            {tab === 'result'
              ? (backtesting
                  ? <div className="empty"><span className="typing"><i /><i /><i /></span><div style={{ marginTop: 10 }}>Running backtest{lastRun?.label ? ` — ${lastRun.label}` : ''}…</div></div>
                  : <BacktestResult key={lastRun?.at || 'none'} result={result} onFinalize={finalize} />)
              : <PortfolioPane data={portfolioData} items={portfolioItems} onRemove={removeMember} loading={false} />}
          </div>
        </section>
      </main>

      {toast && <div className={`toast show ${toast.err ? 'err' : ''}`}>{toast.text}</div>}
    </>
  );
}

// Minimal **bold** + newline rendering for chat bubbles.
function Rendered({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>)}</>;
}

function formatErrors(errors) {
  if (!errors) return '';
  if (Array.isArray(errors)) return errors.map((e) => `• ${e.path ? e.path + ': ' : ''}${e.message || e.code || JSON.stringify(e)}`).join('\n');
  return String(errors);
}
