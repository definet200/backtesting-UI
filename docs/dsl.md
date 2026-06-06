# Trading Strategy DSL — Specification

**Status:** v2 — 2.3 macro operands (additive over 2.2; adds the `macro` operand + macro registry — §3.6, §3.8, §4.11)
**Date:** 2026-06-03
**DSL version:** 2.3

This document specifies a JSON-based DSL for defining algorithmic trading strategies on crypto perpetual futures. As of **2.2** a strategy is a **Portfolio Strategy** — 1..N single-asset **Legs** under an **Allocation** and an optional **Portfolio Exit** (§3.1). As of **2.3** an atom may reference **macro indicators** (CPI, NFP, Fed Funds Rate, …) alongside price and technical-indicator operands, so a strategy can gate or trigger on the macro regime (§3.6, §3.8, §4.11). The DSL is the source of truth for strategy intent: it is authored from natural-language strategy descriptions and consumed by evaluation engines that backtest and live-run strategies against OHLCV market data.

> **2.2 propagation status.** The **normative** 2.2 definition is fully in place: capabilities map (§2), top-level schema (§3.1), sizing (§3.2), versioning (§1.5, incl. the 2.1 → 2.2 breaking-change exception), per-Leg leverage/sizing semantics (§4.5, §4.6), Portfolio Exit semantics + joint-simulation requirement (§4.10), and validator error codes + cross-field rules for allocation/leg/portfolio-exit (§5.1, §5.2). **Legacy prose carries in-body 2.2 notes rather than a line-by-line rewrite:** §4.1–§4.9 are scoped per-Leg by the lead-in note at the top of §4 (where that prose says "the strategy" / `percent_equity` / strategy-level `leverage`, the note maps it to the Leg-level reading); the decision log (§7.2, §7.4, §7.6, §7.7) and open questions (§8.1, §8.7) keep their historical 2.1 wording with a 2.2 caveat in each; and worked examples §6.1–§6.6 are retained as single-Leg illustrations in 2.1 shape (see the §6 note) — only §6.7 is a complete 2.2 strategy. A final line-by-line consistency pass over this legacy prose is part of the freeze (roadmap #8).

The DSL is purely declarative. It describes what a strategy does — asset, signals, sizing, brackets, exits — without prescribing how an engine evaluates it. Multiple engines may consume the same DSL and must agree on its meaning.

The DSL is intentionally bounded. Strategies that require runtime state machines, pattern recognition, pair trading, or arbitrary computation fall outside this DSL.

---

## Table of contents

- [1. Motivation and goals](#1-motivation-and-goals)
  - [1.1 Limitations of v1 (the diagnosis)](#11-limitations-of-v1-the-diagnosis)
  - [1.2 Goals (what v2 must deliver)](#12-goals-what-v2-must-deliver)
  - [1.3 Non-goals (deferred)](#13-non-goals-deferred)
  - [1.4 Strategy scope vs execution runtime](#14-strategy-scope-vs-execution-runtime)
  - [1.5 Versioning policy](#15-versioning-policy)
- [2. Capabilities and limits](#2-capabilities-and-limits)
  - [2.1 What can be expressed](#21-what-can-be-expressed)
  - [2.2 What cannot be expressed](#22-what-cannot-be-expressed)
- [3. Schema](#3-schema)
  - [3.1 Top level](#31-top-level)
  - [3.2 Entry rule](#32-entry-rule)
  - [3.3 Exit rule](#33-exit-rule)
  - [3.4 Conditions — boolean expression tree](#34-conditions--boolean-expression-tree)
  - [3.5 Atom](#35-atom)
  - [3.6 Operands](#36-operands)
  - [3.7 Indicator registry](#37-indicator-registry)
  - [3.8 Macro indicator registry (2.3)](#38-macro-indicator-registry-23)
- [4. Semantics](#4-semantics)
  - [4.1 Effective trigger](#41-effective-trigger)
  - [4.2 Entry semantics](#42-entry-semantics)
  - [4.3 Exit semantics](#43-exit-semantics)
  - [4.4 Bracket semantics](#44-bracket-semantics)
  - [4.5 Position invariant](#45-position-invariant)
  - [4.6 Leverage and sizing](#46-leverage-and-sizing)
  - [4.7 Same-candle event ordering](#47-same-candle-event-ordering)
  - [4.8 Crossover semantics](#48-crossover-semantics)
  - [4.9 Undefined-operand semantics](#49-undefined-operand-semantics)
  - [4.10 Portfolio Exit semantics (2.2)](#410-portfolio-exit-semantics-22)
  - [4.11 Macro operand semantics (2.3)](#411-macro-operand-semantics-23)
- [5. Validator contract](#5-validator-contract)
  - [5.1 Error codes](#51-error-codes)
  - [5.2 Cross-field semantic rules](#52-cross-field-semantic-rules)
- [6. Worked examples](#6-worked-examples)
  - [6.1 Long+short mean reversion](#61-longshort-mean-reversion)
  - [6.2 Multi-timeframe — daily trend filter + 1h entry signal](#62-multi-timeframe--daily-trend-filter--1h-entry-signal)
  - [6.3 OR within a rule (DNF in one entry)](#63-or-within-a-rule-dnf-in-one-entry)
  - [6.4 Conditional exit without reversal](#64-conditional-exit-without-reversal)
  - [6.5 Depth-3 mixed DNF — oversold-bounce OR breakout, both with confirmation](#65-depth-3-mixed-dnf--oversold-bounce-or-breakout-both-with-confirmation)
  - [6.6 Pyramiding / staged entry using tranches](#66-pyramiding--staged-entry-using-tranches)
  - [6.7 Multi-leg Portfolio Strategy with allocation + Portfolio Exit (2.2)](#67-multi-leg-portfolio-strategy-with-allocation--portfolio-exit-22)
  - [6.8 Macro-gated entry (2.3)](#68-macro-gated-entry-23)
- [7. Decisions and rationale](#7-decisions-and-rationale)
  - [7.1 Position lifecycle — auto-reverse on opposite-side entry](#71-position-lifecycle--auto-reverse-on-opposite-side-entry)
  - [7.2 Conditional exits — strategy-level, per-side](#72-conditional-exits--strategy-level-per-side)
  - [7.3 Boolean logic — recursive tree, depth ≤ 3](#73-boolean-logic--recursive-tree-depth--3)
  - [7.4 Leverage — strategy-level single knob](#74-leverage--strategy-level-single-knob)
  - [7.5 Support pyramiding and staged entries via Tranches](#75-support-pyramiding-and-staged-entries-via-tranches)
  - [7.6 No risk block in the DSL](#76-no-risk-block-in-the-dsl)
  - [7.7 Single asset](#77-single-asset)
  - [7.8 At most one entry and one exit per side](#78-at-most-one-entry-and-one-exit-per-side)
  - [7.9 Trailing stop deferred](#79-trailing-stop-deferred)
- [8. Open questions and future capabilities](#8-open-questions-and-future-capabilities)
  - [8.1 Aggregate risk caps](#81-aggregate-risk-caps)
  - [8.2 Volume-derived indicators](#82-volume-derived-indicators)
  - [8.3 Risk-percent sizing](#83-risk-percent-sizing)
  - [8.4 Point-in-time historical operand (divergence)](#84-point-in-time-historical-operand-divergence)
  - [8.5 Auto-reverse default behaviour](#85-auto-reverse-default-behaviour)
  - [8.6 Normative indicator registry per DSL version](#86-normative-indicator-registry-per-dsl-version)
  - [8.7 Multiple strategies on the same account](#87-multiple-strategies-on-the-same-account)

---

## 1. Motivation and goals

### 1.1 Limitations of v1 (the diagnosis)

The current v1 DSL was scoped to validate the smallest viable LLM-generated trading strategy. It works for simple long-only setups but blocks several classes of real strategies. v2 addresses each limitation directly.

**Structural / expressive:**

1. **Direction is implicit.** No `side` / `direction` field anywhere. v1 reads as long-only; a short-only strategy must invert conditions by convention. There is no way to say "go long if X, go short if Y" in one DSL.
2. **AND-only boolean logic.** v1's `entry.conditions` is a flat array — no `OR`, no nesting. Cannot express "RSI<30 OR price<lower_BB."
3. **Position model is one knob.** v1 has only `position.size_pct`. No leverage, no risk-based sizing, no per-rule sizing variation.
4. **Stops are percent-only and live on the strategy, not the entry.** v1 cannot have different bracket profiles for different entries — a single global TP/SL applies to whatever fires.
5. **Single trigger timeframe.** Higher-TF filters (e.g., "1d uptrend + 1h entry") are inexpressible in v1.
6. **Indicator registry is fragmented across four touchpoints.** v1 defines each indicator across (a) a per-indicator Zod schema, (b) a union of all those schemas in the operand definition, (c) a string-enum list of indicator names, and (d) a metadata table mapping name → attribute requirements. Adding a new indicator (VWAP, Supertrend, Donchian, Keltner, OBV) means coordinating changes in all four places.
7. **MACD is hardcoded.** v1's MACD operand has empty params and the schema doesn't allow custom parameterization.

**Concretely banned by v1, demanded by real strategies:**

- One DSL with both long and short entries (e.g., a mean-reversion strategy that goes long oversold and short overbought)
- `(RSI<30 OR price below lower BB) AND volume > average`
- 1d trend filter combined with a 1h entry signal in a single rule
- Different TP/SL brackets per entry rule (a tight scalp entry vs. a wide swing entry)

### 1.2 Goals (what v2 must deliver)

1. **Long and short coexist in one strategy** via per-rule `side` tagging.
2. **Recursive boolean logic** via `all_of` / `any_of` expression trees, depth-bounded.
3. **Per-rule TP / SL brackets** that map to exchange-native bracket orders. (Trailing stop is deferred — see §7.9.)
4. **Multi-timeframe** via per-atom `timeframe`. Trigger is derived, not declared.
5. **Data-driven indicator registry** so adding a new indicator is a one-line registry entry.
6. **Pure validator** — pure function `(strategy) → {ok, strategy: same instance} | {ok: false, errors}`. No normalization, no enrichment.

### 1.3 Non-goals (deferred)

These are real needs but out of scope for v2. The escape hatch for everything in this list is a code-based authoring surface (e.g., Python).

> **Note.** Pyramiding and staged entries were on this list in earlier v2 drafts but are now **in scope** via the `tranches` construct (§3.2, §4.2.2, §6.6, §7.5). The items below remain deferred for v2.

- **Partial close / scale-out.** Multiple TPs that close fractions of an existing position.
- **Time-based stops.** Exit-after-N-bars regardless of price.
- **Hedge mode.** Simultaneous long + short on the same asset.
- **Cross-asset signals.** A 2.2 Portfolio Strategy holds multiple single-asset **Legs** (§3.1), but each Leg's conditions reference only its own asset. *Cross-asset* signals (e.g., "BTC up AND ETH up → trade BTC", pairs, relative strength) would require explicit cross-asset operands which the DSL does not have, and remain out of scope. *(Updated in 2.2 — multi-asset-as-independent-legs is now in scope; cross-asset composition is not.)*
- **Rebalancing as a separate construct.** Considered and **rejected**: there is no dedicated rebalance trigger/action in the DSL. Rebalancing-style behaviour (trimming a leg, rotating capital between assets) is already expressible through each Leg's entry/exit conditions and the Allocation — adding a separate construct would duplicate what the existing rules already cover.
- **Order types beyond market.** No limit / stop-limit entries.
- **Aggregate risk caps in the DSL.** Fields like `max_drawdown_pct` are legitimate strategy intent (the author declares "this strategy is designed to risk no more than X% drawdown") but deferred for v2 simplicity — see §8.1 for future-work notes. `max_daily_loss_pct` is more problematic: "daily" is wall-clock, but the DSL is candle-driven, so it would need a definition of "daily" that fits multi-TF strategies before it can be added.
- **Backtest params in the DSL.** `fee_bps`, `slippage_bps` — environmental, not strategy intent.
- **`required_history` in the DSL.** Warmup bars (the minimum number of historical candles each indicator needs before producing a meaningful first value) are a consumer concern, not strategy intent. The DSL does not declare them and the validator does not produce them.
- **Error policy in the DSL.** `on_error` was an early v2 draft field for "what to do when a condition can't be evaluated" but has been removed. Error policy is a deployer concern (the deployer's money is at risk), not strategy intent — symmetric with `fee_bps`/`slippage_bps`/`required_history`. The deployment-level `on_error` column on `strategy_deployments` (see `architecture-docs.md §3.1.5`) is now the sole error-policy knob. In-strategy undefinedness (NaN operands, indicator warmup) is handled deterministically — see §4.9.

### 1.4 Strategy scope vs execution runtime

The DSL is the source of truth for **strategy intent** — signal evaluation, position lifecycle, bracket declaration, sizing math. An evaluation engine (backtest, live, or both) implements that intent against a specific data feed and venue. The two layers have different agreement obligations.

**Strategy scope — engines MUST agree:**

- Boolean condition evaluation: operators, operand catalogue, indicator outputs.
- Multi-timeframe semantics: atom-level timeframe; every atom evaluated at every `effective_trigger` close, with higher-TF atoms reading the most-recent-closed candle of their own timeframe (§4.1).
- Position lifecycle: side-exclusivity invariant (net direction is always long, short, or flat — never both sides simultaneously), auto-reverse on opposite-side entry, and per-side accumulation rules in tranches mode (§4.2, §4.5).
- Same-candle event ordering for strategy-affecting events (§4.7).
- Bracket *declaration*: TP/SL `pct` anchored from entry fill price (§3.2, §4.4).
- Sizing math: notional formula and leverage application (§4.6).
- Validator-rejected strategies: any strategy that fails validation MUST fail equally on every engine (§5).

**Execution runtime scope — engines MAY differ, with each engine documenting its own choice:**

- **Time zone** for daily-candle close boundaries.
- **Candle source**: which exchange's OHLCV stream the engine consumes; sampling cadence; gap handling.
- **Asset → venue pair mapping**: the DSL declares `asset: "BTC"`; each engine maps to whatever pair / market identifier it executes on (`BTC-USD-PERP` on Hyperliquid, `BTCUSDT` on Binance, etc).
- **Bracket trigger price source**: mark price vs contract price; venue-default applies unless the engine documents an override.
- **Cancel-then-place sequencing on auto-reverse**: atomic reverse-with-bracket primitive (where the venue offers one) vs explicit cancel-then-place. Strategy intent is unchanged either way.
- **Intrabar TP/SL fill convention** (backtest only): pessimistic (SL-first when both thresholds inside one OHLC bar) vs optimistic vs other policies.
- **Order entry type**: market by default; engines may offer limit-with-slippage-cap as a venue-specific option.

Two engines running the same DSL on the same input candles MUST produce equivalent **strategy-scope** outcomes — signal timestamps, position transitions, bracket fire conditions. They MAY produce different fills, latencies, and intrabar paths; those are runtime properties, not strategy intent.

The DSL describes a single strategy in isolation. Whether and how multiple strategies coexist on a shared venue account is a deployment-layer concern — see §8.7.

### 1.5 Versioning policy

`dsl_version` is a two-component `major.minor` version string (semver-style, but **without** a patch component — values like `"2.1.0"` are rejected). Emit and consume are asymmetric — the spec at HEAD pins emission to one (major, minor) pair, while engines accept a small set of minors on their supported major.

**Emit constraint.** Any strategy emitted against this spec MUST declare `dsl_version: "2.3"`. The spec at HEAD always defines exactly one valid (major, minor) pair for emit; emitting a different (major, minor) fails validation.

**Consume constraint.**

- Engines MUST reject strategies whose `dsl_version` major does not match the engine's supported major (`unsupported_dsl_version`).
- On a matching major, engines MUST accept strategies declaring an **earlier or equal** minor (e.g., a 2.1 engine MUST consume both `"2.0"` and `"2.1"` strategies unchanged — additive-only minor bumps guarantee this). **Exception — the 2.1 → 2.2 structural break:** 2.2 is *not* additive (it restructures the top level into the Portfolio Strategy envelope), so this consume-unchanged guarantee does **not** extend across it. A 2.2 engine does **not** consume raw `"2.0"` / `"2.1"` payloads in place; such payloads are first mechanically migrated to one-Leg 2.2 form (see the 2.1 → 2.2 note below and §5.1 `unsupported_dsl_version`). A future strictly-additive `"2.3"` would again be consumable in place by a 2.2 engine under this rule. *(Keeping a breaking change inside major 2 is itself a wart — see the §1.5 note: a stricter reading would make this 3.0; recorded as accepted for now.)*
- On a matching major but **newer** minor than the engine supports (e.g., a 2.0 engine reading a `"2.1"` strategy), the strategy MUST be rejected. Engines have two valid rejection paths and MAY choose either, but both paths MUST guarantee rejection of every newer-minor payload — not just those that happen to use a newer-minor field:
  - **Version-level rejection (eager):** reject the strategy immediately at version-check time with `unsupported_dsl_version`. The engine never inspects fields. This path trivially rejects every newer-minor payload, including a "2.1" strategy that uses no `tranches`-like fields.
  - **Field-level rejection (lazy):** accept the `dsl_version` string, walk the strategy looking for unrecognized newer-minor fields, and reject the first one encountered with `unknown_field` from the closed §5.1 set. If the walk completes without finding any unrecognized field (e.g., a "2.1" strategy that doesn't actually use `tranches`), the engine MUST still reject the strategy by emitting `unsupported_dsl_version` at the end of the walk — the version string itself is the rejection trigger when no more specific code applies.
  - Both paths produce a rejected strategy; the difference is only the granularity of the error code surfaced (`unknown_field` is more diagnostic when the strategy actually uses a newer-minor feature). Engines MUST NOT silently accept newer-minor payloads — that would let a "2.1" emitter run on a 2.0 engine without either side knowing the version contract was violated. There is no non-fatal warning channel in the validator contract.

**2.2 → 2.3 (this revision — macro operands).** Adds the **`macro` operand** (§3.6) and the **macro indicator registry** (§3.8), with release-time evaluation semantics (§4.11) and validator codes `macro_indicator_not_available` / `invalid_macro_operand` (§5.1, §5.2). The change is **additive** at the field level: a 2.3 strategy that uses no `macro` operand is field-for-field identical to the equivalent 2.2 strategy — only the `dsl_version` string differs.

> **Implementation note — `"2.3"` is the only accepted version.** This engine validates and runs **only** `dsl_version: "2.3"`; `"2.2"` (and all older minors) are rejected with `unsupported_dsl_version`. Because 2.2 → 2.3 is purely additive, migrating an existing 2.2 strategy is a one-character change — bump the version string to `"2.3"`. We deliberately do **not** keep multi-minor consume support: a single accepted version keeps validation, the engine, and the agent's emit target in lockstep.

**2.1 → 2.2 (prior revision — multi-asset).** Introduces the **Portfolio Strategy** top level (§3.1.1): the former top level becomes a **Leg** (§3.1.2), wrapped in `{ allocation, legs[], portfolio_exit? }`. `leverage` moves from strategy-level to per-Leg (§7.4). Leg sizing changes from `percent_equity` / `fixed_notional` to `percent_allocation` (§3.2). This is a **breaking, structural** change — unlike the additive 2.0 → 2.1, a 2.1 engine cannot consume a 2.2 strategy (the top-level shape differs). Existing 2.1 strategies migrate mechanically to one-Leg 2.2 portfolios (`allocation.strategy_fraction: 100`, `weights: [{asset, pct: 100}]`, no `portfolio_exit`). Resolves the §8.7 multi-strategy-per-account and the §8.1 aggregate-equity-cap open questions for the portfolio case.

**2.0 → 2.1 (prior revision).** Adds the `tranches` construct on `EntryRule` (§3.2) and the per-side accumulation semantics that go with it (§4.2.2, §4.7 step 3a–c + step 4 tranches branch, §5.1 / §5.2 tranches error codes). The change is additive at the field level: a 2.1 strategy that does *not* use `tranches` shares its field-by-field shape with the equivalent 2.0 strategy — only the `dsl_version` string differs. A 2.1 engine consumes both `"2.0"` and `"2.1"` strategies unchanged. A 2.0 engine reading a `"2.1"` strategy follows the consume constraint above.

---

## 2. Capabilities and limits

This section is an at-a-glance map of what v2 can and cannot express.

### 2.1 What can be expressed

**By directional model:**

- Long-only
- Short-only
- Long+short with auto-reverse on opposite-side signal

**By signal style:**

- Threshold (`RSI<30`, `price>X`)
- Crossover (`EMA9 crossed above EMA21`, `MACD bullish cross`)
- Breakout (`price crossed above N-bar high`)
- Mean reversion (RSI extremes, Bollinger bounce)
- Trend following (MA crossovers, regime filters)
- Range trading (Bollinger touch, support/resistance via lookback)
- Volatility filtering (ATR-based regime gates)

**By structural complexity:**

- Single-condition entries
- Multi-condition entries (AND of N conditions, depth 1)
- DNF entries: `(A∧B) ∨ (C∧D)` — multiple setups in one rule (depth 2)
- CNF entries: `(A∨B) ∧ (C∨D)` — multiple OR-groups required together (depth 2)
- Mixed: atom AND OR-group, etc.

**By timeframe:**

- Single-TF strategies
- Multi-TF strategies — different atoms in the same strategy may use different timeframes (e.g., a 1d trend filter combined with a 1h entry signal)

**By macro context (2.3):**

- Macro-gated entries/exits — condition on a macroeconomic series (CPI, NFP, Fed Funds Rate, GDP, PMI, …) via the `macro` operand (§3.6, §3.8), e.g. "long only while CPI(YoY) < 3% and Fed Funds Rate ≤ 4.5%"
- Macro crossovers — `macro` is a series, so it can `crossed_above` / `crossed_below` another operand at release boundaries (§4.11)

**By exit style:**

- Pure-bracket exits (TP / SL only, no exit conditions)
- Conditional exits (indicator-based close without reversing)
- Reversal exits (opposite-side entry auto-closes existing position)
- Mixed (bracket + conditional + reversal in one strategy)

**By sizing:**

- Percent of allocation — a Leg's order size as a fraction of that Leg's allocated capital (`percent_allocation`, §4.6)

**By portfolio composition (2.2):**

- Multi-asset **Portfolio Strategy** — 1..N single-asset **Legs**, each with its own entry/exit rules, brackets, leverage, and margin mode (§3.1)
- **Allocation** — per-Leg equity weights plus the fraction of account equity the whole strategy uses
- **Portfolio Exit** — an equity-only, strategy-wide take-profit / stop-loss that flattens all Legs and terminates the deployment (§4.10)
- Per-Leg parameterization — the same signal style tuned differently per asset across Legs

**By position accumulation:**

- Pyramiding / scale-in (via multiple entry tranches)
- Staged entries / scaling-in (different sizes and conditions per tranche)

### 2.2 What cannot be expressed

**Lifecycle / position complexity:**

- Partial close / scale-out (multiple TPs, fractional closes)
- Time-based stops (exit after N bars regardless of price)
- Hedge mode (simultaneous long + short on the same asset)

**Conditional logic limits:**

- Boolean trees deeper than 3 levels of grouping
- Risk-percent sizing (size derived from stop-loss distance)
- Mixed-timeframe within a single atom (each atom uses one timeframe; both operands of an atom share that timeframe)

**Pattern / data needs:**

- Volume-derived indicators beyond raw volume — OBV, AD, MFI, VWAP, etc. (raw `volume` is supported as a day-1 indicator; see §3.7)
- Divergence detection (no point-in-time historical reference operand)
- Candlestick / chart patterns (no pattern recognition primitives)
- Time-of-day / session filters
- News / sentiment triggers (macro *economic* series **are** expressible via the `macro` operand as of 2.3 — §3.6, §3.8; news/sentiment feeds are not)
- ML-based features

**Cross-instrument (still not expressible in 2.2):**

- Cross-asset signals — a single condition referencing more than one asset (e.g., "BTC up AND ETH up → trade BTC"); each Leg's conditions reference only its own asset (§1.3, §7.7)
- Pairs trading / spreads / relative-strength — a different authoring surface

> Multi-asset strategies, per-Leg parameterization, and basket / portfolio-level rules **are** expressible in 2.2 via Portfolio Strategies (§2.1, §3.1). Only *cross-asset composition* (one condition spanning multiple assets) remains out of scope.

**Order types:**

- Limit orders / stop-limit entries (entries are market-only)
- Trailing stops (declarative or simulated) — not in v2's bracket schema; revisit when an exchange that supports them natively is added (see §7.9)

**Strategy-level state:**

- Conditional cooldowns ("skip entries for 1h after a stop-loss")
- Win-streak / loss-streak adjustments
- Other internal state machines

**Risk / portfolio:**

- Running aggregate risk caps (e.g., `max_drawdown_pct` that tracks peak equity) — deferred; see §8.1. *(A one-shot aggregate-equity take-profit / stop-loss **is** expressible via the Portfolio Exit, §4.10 — only running drawdown-from-peak remains deferred.)*

---

## 3. Schema

The schema is a closed type definition. All field types are explicit; no open objects, no arbitrary extension points. This rigidity bounds the authoring surface and the engine's interpretation surface.

### 3.1 Top level

> **2.2 — multi-asset (Portfolio Strategy).** As of `dsl_version: "2.2"` a strategy is a **Portfolio Strategy**: a container of 1..N **Legs** plus an **Allocation** and an optional **Portfolio Exit**. A single-asset strategy is just `legs: [oneLeg]` at 100% allocation — there is no separate single-asset entity. Everything the 2.1 spec called "the top level" (asset, leverage, margin_mode, entry, exit) is now the shape of one **Leg** (§3.1.2). DSL §7.7 (single asset per unit) and §7.8 (one entry/exit per side) still hold — **at the Leg level**. See [`CONTEXT.md`](./CONTEXT.md) for the canonical terms.

#### 3.1.1 Portfolio Strategy (the new top level)

```ts
{
  dsl_version: '2.2',                         // two-component "major.minor" string (no patch); see §1.5
  name: string,                               // short title
  description: string,                        // prose explanation of the strategy

  allocation: {
    strategy_fraction: number,                // integer in (0, 100] — % of account equity this whole strategy uses
    weights: { asset: string, pct: number }[] // per-Leg equity weights; each pct an integer in (0, 100], summing to exactly 100 (validator rule §5.2; feeds leg_capital §4.6)
  },

  legs: Leg[],                                // 1..N; assets distinct across legs (§5.2, §8.7)

  portfolio_exit?: {                          // optional, equity-only, strategy-wide; overrides leg exits (§4.10)
    equity_take_profit?: { pct?: number, usd?: number },   // distinct from a Leg's price-move take_profit (§3.2); accepts usd
    equity_stop_loss?:   { pct?: number, usd?: number },   // distinct from a Leg's price-move stop_loss (§3.2); accepts usd
  },
}
```

The **Allocation** is the single source of capital truth: a Leg's capital is `leg_capital`, defined authoritatively in **§4.6** (shown here for orientation: `leg_capital = (leg_weight / 100) × (strategy_fraction / 100) × account_equity`; §4.6 is the formula's single source — keep edits there). This resolves the §8.7 "percent_equity denominator sharing" problem at the **sizing** level — no two Legs size against the same equity slice. (This is sizing-denominator partitioning only: under cross margin, Legs still share account collateral and the common `account_equity` input, so operational margin contention across Legs can remain — see §8.7 cross-margin contagion.) The **Portfolio Exit** is equity-only (no indicators); when its take-profit or stop-loss threshold on *aggregate* allocated equity is crossed, the engine flattens **all** legs and **terminates the deployment** (it does not recycle), overriding each leg's own exit. Because every Leg sizes against the **shared** `account_equity` (§4.6), a multi-leg backtest is **always** a joint simulation of all legs on one clock — never a sum of independent per-leg backtests, with or without a Portfolio Exit (§4.10).

#### 3.1.2 Leg

```ts
type Leg = {
  asset: string,                              // single asset symbol (e.g., "BTC"); engine maps to venue pair (§1.4)
  leverage: number,                           // integer ≥ 1; applied to every order on THIS leg (per-leg, was strategy-level in 2.1 — §7.4)
  margin_mode: 'cross' | 'isolated',          // strategy intent — required for HIP-3 markets on Hyperliquid (§4.6)

  entry: {
    long?:  EntryRule,                        // at most one long entry rule
    short?: EntryRule,                        // at most one short entry rule
  },                                          // at least one of long/short must be present

  exit: {
    long?:  ExitRule,                         // at most one long exit rule (optional)
    short?: ExitRule,                         // at most one short exit rule (optional)
  },                                          // entire `exit` object can be empty (bracket-only); overridden by portfolio_exit when it fires
}
```

A **Leg** has at most one entry rule per side and at most one exit rule per side. The structural cap (object keys, not array entries) makes multi-setup-in-one-Leg impossible by construction. Users who want multiple setups on the same asset (e.g., "scalp on RSI + swing on EMA cross") use separate strategies (Legs must be distinct-asset, §5.2 `duplicate_leg_asset`), each with its own backtest history and marketplace identity. **Leverage is per-Leg** (reverses 2.1's strategy-level single knob — §7.4): different assets in one portfolio carry different risk. Leg capital comes from the **Allocation**, not a leg-internal sizing percentage — see the SizingMode note in §3.2.

### 3.2 Entry rule

```ts
// EntryRule is a structural discriminated union — the presence of `tranches`
// (and the absence of the classic per-firing fields) chooses the branch.
// Encoding style is unchanged from 2.0 (object-based, no explicit `mode` tag);
// `tranches` is a new optional field added in 2.1. The union expresses the
// mode-exclusivity rule directly in the type rather than relying on the
// validator alone.
type EntryRule = ClassicEntryRule | TranchesEntryRule;

type ClassicEntryRule = {
  conditions: Expr,                           // see §3.4
  size: SizingMode,                           // see §3.6
  take_profit?: { pct: number },              // optional bracket
  stop_loss?: { pct: number },                // optional bracket
  tranches?: never,                           // forbidden on this branch — structural exclusion
  // trailing_stop deferred for v2 — see §7.9 for rationale
}

type TranchesEntryRule = {
  tranches: Tranche[],                        // ≥ 2 entries; see §4.2.2 for runtime semantics
  // The four classic per-firing fields are structurally forbidden — brackets
  // in tranches mode live per-tranche, not on the parent rule.
  conditions?: never,
  size?: never,
  take_profit?: never,
  stop_loss?: never,
}

type Tranche = {
  conditions: Expr,
  size: SizingMode,
  take_profit?: { pct: number },              // optional per-tranche target
  stop_loss?: { pct: number },                // optional per-tranche stop
}

type SizingMode =
  | { type: 'percent_allocation', pct: number } // (0, 100] — % of THIS leg's allocated capital
```

> **2.2 sizing change.** `percent_equity` (% of account equity) and `fixed_notional` (absolute USD) are **removed**. Capital is now governed by the **Allocation** (§3.1.1): a leg's pool (`leg_capital`) is computed by the §4.6 formula from its allocation weight, the strategy fraction, and account equity. Intra-leg sizing is expressed as **`percent_allocation`** — a fraction of that leg's pool. A classic single-entry rule typically uses `pct: 100` (deploy the whole leg slice); tranches split the leg's pool across firings (e.g. `30 / 30 / 40`). This keeps Allocation the single source of capital truth and removes the §8.7 denominator-contention problem.

An entry rule supports two distinct modes, and the two are **mutually exclusive at the field level**:

1. **Classic single-entry mode.** Requires `conditions` and `size` directly on the entry rule. Optional top-level `take_profit` / `stop_loss` apply to the single position opened by the rule. `tranches` is absent.
2. **Tranches mode.** `tranches` is an array of at least 2 tranche entries. The entry rule itself carries **no** top-level `conditions`, `size`, `take_profit`, or `stop_loss` — every per-firing field lives on the individual `Tranche`. Each tranche is an independent entry block with its own conditions, size, and optional bracket. See §4.2.2 for runtime semantics.

Mixing the two — e.g., providing `tranches` together with a top-level `take_profit` (which would have ambiguous semantics: apply to all tranches? act as a default? be ignored?) — is rejected by the validator with `entry_mode_conflict` (§5.2).

A strategy has at most one long entry rule (`entry.long`) and at most one short entry rule (`entry.short`). The side is the object key in the parent `entry` map, not a field on the rule itself.

**In classic single-entry mode**, when the entry rule's `conditions` evaluate true, the engine opens a position on the corresponding side (the key) with the rule's `size`, attaching the optional bracket (`take_profit` / `stop_loss`) to the entry order.

**In tranches mode**, the entry rule has no top-level `conditions` or `size`; instead, each `Tranche` is evaluated independently — when a tranche's `conditions` evaluate true and that tranche has not yet entered in the current sequence, the engine opens a position on the rule's side using that tranche's `size` and bracket. See §4.2.2 for the full lifecycle.

**Bracket `pct` semantics are identical in both modes** — `take_profit.pct` and `stop_loss.pct` describe price-threshold intent against the position's entry fill price (detailed below). The mapping from that intent to the venue / wire format differs by mode: classic-mode brackets are **exchange-native** (child orders attached to the parent entry), while tranches-mode brackets may be **app-layer simulated** on venues that maintain a single position per `(account, asset)`. See §4.4 for the full bracket-semantics contract and the tranches-mode portability divergence.

`take_profit.pct` and `stop_loss.pct` are both **positive percentages, applied in opposite directions from entry**. For a long position: TP fires when price moves up by `tp.pct`, SL fires when price moves down by `sl.pct`. For a short position: TP fires when price moves down by `tp.pct`, SL fires when price moves up by `sl.pct`. The two values are independent — `tp = 3, sl = 3` is a valid 1:1 risk-reward strategy; `tp = 1, sl = 10` is a valid scalp-style strategy (small target, wide stop). The validator only enforces per-field positivity, not any relationship between TP and SL.

### 3.3 Exit rule

```ts
type ExitRule = {
  conditions: Expr,
}
```

A strategy has at most one long exit rule (`exit.long`) and at most one short exit rule (`exit.short`). The side is the object key in the parent `exit` map, not a field on the rule itself.

When the exit rule's `conditions` evaluate true and a position on the corresponding side (the key) is open, the engine closes that position. Exit rules do not carry brackets — those live on the entry rule that opened the position. Exit rules do not reverse — to reverse, the strategy must include an opposite-side entry rule (auto-reverse on opposite entry handles closing the current position).

There is no shared "any-side" exit. To close any open position on a given condition, declare both `exit.long` and `exit.short` with the same conditions.

### 3.4 Conditions — boolean expression tree

```ts
type Expr = Atom | { all_of: Expr[] } | { any_of: Expr[] };
```

**Constraints (semantic, enforced by validator):**

- **Tree depth ≤ 3** (formal definition below).
- **No single-child groups.** `{ all_of: [atom] }` and `{ any_of: [atom] }` are rejected. The atom alone is the canonical form.
- **No empty groups.** `{ all_of: [] }` and `{ any_of: [] }` are rejected.
- **Group children minimum 2.** Each `all_of` and `any_of` must contain at least 2 children.
- **Exactly one group key per group node.** A node carrying both `all_of` and `any_of` (e.g., `{ all_of: [...], any_of: [...] }`) is rejected with `mixed_group_keys`. The node must commit to one logical operator. Authors who need both must nest: an outer `all_of` containing an inner `any_of`, or vice versa.

**Depth-counting algorithm (formal):**

```
depth(atom) = 0
depth({ all_of: cs }) = 1 + max(depth(c) for c in cs)
depth({ any_of: cs }) = 1 + max(depth(c) for c in cs)
```

A strategy is valid only if `depth(conditions) ≤ 3` for **every** `conditions` field in the schema — that is, every entry-rule `conditions` (classic mode), every tranche `conditions` (tranches mode, §3.2), and every exit-rule `conditions`. The cap is uniform; tranches do not get a deeper budget.

Example (allowed, depth 3 — nested DNF where each disjunct has an OR sub-group):

```json
{
  "any_of": [
    { "all_of": [ { /* atom A */ }, { "any_of": [ { /* atom B */ }, { /* atom C */ } ] } ] },
    { "all_of": [ { /* atom D */ }, { "any_of": [ { /* atom E */ }, { /* atom F */ } ] } ] }
  ]
}
```

Example (rejected, depth 4):

```json
{
  "all_of": [
    {
      "any_of": [
        { "all_of": [ { "any_of": [ { /* atom */ }, { /* atom */ } ] }, { /* atom */ } ] },
        { /* atom */ }
      ]
    },
    { /* atom */ }
  ]
}
```

Depth ≤ 3 covers DNF, CNF, mixed atom-and-group expressions, and nested-DNF patterns like `((A∨B)∧C) ∨ ((D∨E)∧F)`. Strategies that need deeper nesting belong to a code-mode escape hatch (Python authoring).

### 3.5 Atom

```ts
type Atom = {
  left: Operand,
  operator: Operator,
  right: Operand,
  timeframe: Timeframe,                       // required — no defaults
}

type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d'

type Operator =
  | 'less_than' | 'greater_than'
  | 'less_than_or_equal' | 'greater_than_or_equal'
  | 'crossed_above' | 'crossed_below'
```

Both operands of an atom evaluate at the atom's `timeframe`. The TF is required on every atom — there is no inheritance or default.

Atom-level (rather than operand-level) timeframe means a single comparison cannot mix timeframes. To express multi-timeframe logic, use multiple atoms in the same conditions tree, each with its own timeframe.

Crossover operators (`crossed_above`, `crossed_below`) are mutually exclusive but not exhaustive (most bars satisfy neither — no cross occurred on most bars). See §4.8 for the precise crossover semantics.

### 3.6 Operands

Five operand types, discriminated by `type` (`macro` added in 2.3):

```ts
type Operand =
  | { type: 'indicator', name: string, params: Record<string, number>, attribute?: string }
  | { type: 'price', field: 'open' | 'high' | 'low' | 'close' }
  | { type: 'lookback', function: 'highest' | 'lowest', source: 'open' | 'high' | 'low' | 'close', period: number, multiplier: number }
  | { type: 'macro', key: string }                // 2.3 — macro indicator series (§3.8, §4.11)
  | { type: 'value', value: number };
```

**`indicator`** — refers to a technical indicator output. `name` must be in the indicator registry (§3.7). `params` must validate against the registry's per-indicator `paramSchema`. `attribute` is required for multi-output indicators (e.g., MACD has `macd_line`, `signal`, `histogram`); omitted for single-output indicators (e.g., RSI).

**`price`** — refers to a price field of the current candle on the atom's timeframe.

**`lookback`** — refers to a reduction over a window of candles: `function` is `highest` or `lowest`; `source` is the bar field; `period` is the window size in bars (must be > 0); `multiplier` scales the result (e.g., `0.95` = "5% below the lookback value"; must be > 0). The window is **exclusive of the current bar** — see §4.8 for the precise definition.

**`macro`** *(2.3)* — refers to the latest released value of a macroeconomic series (CPI, NFP, Fed Funds Rate, …). `key` must be in the macro registry (§3.8). A macro operand has **no `params` and no `attribute`** — each `key` names a single scalar series. Macro series are released on their own cadence (monthly / quarterly / weekly), independent of the atom's `timeframe`; at every evaluation the operand resolves to the **most-recent-released** value as of that close (§4.11). A macro series is **exogenous and global** — it is not tied to any asset, so it does not introduce a cross-asset dependency (§1.3, §7.7): every Leg may read the same macro series. Example: `macro:cpi_yy greater_than value:3` ("annual CPI above 3%").

**`value`** — a constant numeric literal.

Volume is not exposed as a `price.field` value. Bar volume is accessed via the `volume` indicator in the registry (§3.7) — keeping it on the indicator side leaves room for OBV / AD / MFI / VWAP-style derived indicators to register alongside raw volume without a second access pattern.

### 3.7 Indicator registry

The indicator catalog is data-driven. Each indicator is one entry in a registry keyed by name:

```ts
type IndicatorRegistryEntry = {
  name: string;
  paramSchema: ZodType;                         // closed param shape
  attributes: readonly string[];                // empty = no attribute required
};
```

A strategy's indicator references resolve against this registry. The validator looks up an indicator by `name`, validates `params` against `paramSchema`, and gates `attribute`:

- If the registry entry has a **non-empty** `attributes` list, the operand's `attribute` is **required** and must be one of the listed values; otherwise `invalid_attribute` fires.
- If the registry entry has an **empty** `attributes` list (single-output indicators like `rsi`, `volume`), the operand's `attribute` MUST be omitted; setting it fires `invalid_attribute`.

Adding a new indicator is one new registry entry — the DSL surface (the `indicator` operand shape) does not change. Each indicator's `paramSchema` is **closed** (strict): unknown keys in `params` are rejected with `invalid_indicator_params`.

Common indicators expected in any reasonable runtime:

| Name | Params | Attributes |
|---|---|---|
| `rsi` | `{ period: int > 0 }` | (none) |
| `ema` | `{ period: int > 0 }` | (none) |
| `sma` | `{ period: int > 0 }` | (none) |
| `atr` | `{ period: int > 0 }` | (none) |
| `macd` | `{ fast, slow, signal: int > 0 each }` | `macd_line`, `signal`, `histogram` |
| `bollinger` | `{ period: int > 0, num_std: number > 0 }` | `upper`, `middle`, `lower` |
| `supertrend` | `{ period: int > 0, multiplier: number > 0 }` | (none) — single-output trend line |
| `volume` | `{}` (must be empty) | (none) |

`volume` returns the bar's volume on the atom's timeframe; it has no parameters and no attributes. The `params` object MUST be exactly `{}` — extra keys are rejected with `invalid_indicator_params`. Use it like any other indicator operand (e.g., `volume > value:1_000_000` as a threshold filter). Volume-derived indicators (OBV, AD, MFI, VWAP, SMA-of-volume) are deferred to §8.2.

`supertrend` is computed at runtime from OHLC (Wilder `atr(period)` → `hl2 ± multiplier·atr` → carried-forward final bands → the trend line). It is **single-output** — the line value, no `attribute`. Idiomatic use: `price.close crossed_above supertrend` is the bullish flip, `price.close crossed_below supertrend` the bearish flip, and `price.close > supertrend` means "in an uptrend". Typical params: `{ period: 10, multiplier: 3 }`.

The data-driven registry replaces v1's per-indicator-schema pattern with a single source of truth.

The DSL spec does not enumerate which indicators are available at runtime — that's a per-deployment runtime catalog. The validator may be invoked with an `indicatorsAvailable` whitelist to enforce per-deployment availability.

### 3.8 Macro indicator registry (2.3)

The macro catalog is data-driven, like the indicator registry (§3.7), but simpler: each entry is one scalar series keyed by a stable `key`. There are no params and no attributes.

```ts
type MacroRegistryEntry = {
  key: string;            // stable registry key, e.g. 'cpi_yy', 'nfp', 'interest_rate'
  name: string;           // human-readable label, e.g. 'CPI (YoY)'
  category: string;       // broad macro group: 'inflation' | 'labor_market' | 'money' | …
  frequency: string;      // release cadence: 'weekly' | 'monthly' | 'quarterly'
  unit?: string;          // display unit, if any ('%', 'K', 'M', 'B')
};
```

A `macro` operand (§3.6) resolves by `key` against this registry. Macro-key validation is **whitelist-driven**: the validator is pure (no DB), so it only checks `key` when invoked with a `macroIndicatorsAvailable` whitelist — a `key` absent from that list fires `macro_indicator_not_available`. With no whitelist supplied, any non-empty string `key` is accepted at validate time and an unknown/unavailable series surfaces at run time as an undefined operand (atom FALSE, §4.9). (A static in-validator registry check that fires a deployment-independent `unknown_macro_indicator` is deliberately **not** part of this spec — see §5.1.)

The canonical key set is maintained out-of-band and snapshotted in [`macro-indicators.md`](./macro-indicators.md) (83 keys across 8 categories as of 2026-06-03). Representative keys:

| Key | Name | Category | Frequency | Unit |
|---|---|---|---|---|
| `cpi_yy` | CPI (YoY) | inflation | monthly | % |
| `core_cpi_yy` | Core CPI (YoY) | inflation | monthly | % |
| `core_pce_yy` | Core PCE (YoY) | inflation | monthly | % |
| `nfp` | Non-Farm Payrolls | labor_market | monthly | K |
| `unemployment_rate` | Unemployment Rate | labor_market | monthly | % |
| `interest_rate` | Fed Funds Rate | money | monthly | % |
| `fed_balance_sheet` | Fed Balance Sheet | money | monthly | - |
| `gdp_yoy_final` | GDP YoY Final | gdp | monthly | % |
| `ism_manufacturing_pmi` | ISM Manufacturing PMI | business | monthly | - |
| `michigan_consumer_expectations` | Michigan Consumer Expectations | consumer | monthly | % |

Adding a macro series is one new registry entry — the DSL surface (the `macro` operand shape) does not change. The full enumerated catalogue is **not** part of this spec; engines load it from the macro database and surface it through the `macroIndicatorsAvailable` whitelist.

---

## 4. Semantics

This section defines what a DSL strategy means — its declarative interpretation. Strategy-affecting event ordering on a single close is mandated in §4.7. Runtime-scope details that engines may differ on (cancel/place sequencing, intrabar fill convention, mark-vs-contract trigger price) are listed in §1.4.

> **2.2 — these semantics are per Leg.** §4.1–§4.9 describe the behaviour of a **single Leg** (§3.1.2); a Portfolio Strategy applies them independently to each Leg. Where the prose below says **"the strategy"** / **"the position"**, read *"the Leg"*; where it says **`percent_equity`** / **`equity`** as a *sizing* basis, read **`percent_allocation`** against the Leg's allocated capital (`leg_capital`, §4.6); where it says strategy-level **`leverage`** or **`margin_mode`**, read the **Leg's** `leverage` / `margin_mode` (§3.1.2). The §4.2.2 once-per-close snapshot is of `account_equity` (from which each Leg's `leg_capital` is derived). The cross-Leg semantics — the ones the per-Leg reading below cannot express — are the **Portfolio Exit** (§4.10) and the **cross-Leg sizing-order rule** (§4.6, "Cross-Leg sizing on a shared close"); both sit above the per-Leg pipeline.

### 4.1 Effective trigger

The strategy's effective evaluation cadence is the smallest (most granular) timeframe among all atoms in the strategy:

```
effective_trigger = min(atom.timeframe for atom in strategy)
```

Re-evaluation fires on every closed candle of `effective_trigger`. **Every atom — regardless of its declared timeframe — is evaluated at every `effective_trigger` close.** A higher-TF atom reads the most-recent-closed candle of its own timeframe; the underlying candle data changes only at higher-TF closes, but the atom itself is re-evaluated on every effective trigger tick.

### 4.2 Entry semantics

#### 4.2.1 Classic single-entry semantics

When an entry rule's `conditions` evaluate true at an `effective_trigger` close (the rule's side is determined by its key in the parent `entry` map — `entry.long` or `entry.short`):

- **No position open** → open a position on the rule's side with the rule's `size`, attaching the optional bracket (TP / SL).
- **Same-side position open** → ignore (no pyramiding in classic mode).
- **Opposite-side position open** → close the existing position and open a new position on the rule's side with the rule's `size` and bracket (auto-reverse).

**Below-minimum order (classic mode).** When the §4.6 notional for a classic entry rounds **below the venue's minimum order size** (e.g. a small-weight Leg on a small account: `leg_capital × (pct / 100) × leverage` is ~$1), the engine places **no order** and the entry remains eligible to fire on the next `effective_trigger` close. This mirrors the tranches-mode **Skip** outcome (§4.2.2): it MUST be logged as a named, non-fatal runtime event — **`entry_skipped_below_minimum`**, the classic analog of `tranche_skipped_insufficient_budget` — and MUST NOT raise `evaluation_failed` or stop the strategy. Without this rule a small-weight Leg would validate clean, deploy, and silently never open — especially misleading in a portfolio, where the *other* Legs trade and the user assumes all Legs are live. This is **not** a validate-time rejection: the pure validator (§5) cannot see runtime equity. Instead, at **deploy time** (equity known) engines SHOULD surface a non-fatal **`leg_unfundable_warning`** diagnostic for any Leg whose `leg_capital` is structurally too small to ever meet the venue minimum, so the author can correct the allocation before the dead Leg goes unnoticed.

#### 4.2.2 Tranches mode semantics (pyramiding / scaling-in)

When the entry rule uses `tranches`, multiple independent positions (scaling tranches) can accumulate on a given side:

- **Sequence definition.** A **tranche sequence** on a given side is the lifespan from the first tranche firing on a previously-flat side until that side next returns to flat (via exit rule, all open tranche brackets fired, or opposite-side auto-reverse). The `entered` registry described below is per-side, per-sequence. The phrase "the current sequence" elsewhere in this section means the sequence that is currently in progress on the rule's side.
- **Independent firing.** Each tranche in the `tranches` array evaluates its own `conditions` at every `effective_trigger` close. When a tranche's conditions are met and that tranche has not yet entered in the current sequence, it fires.
- **Tranche evaluation order within a single close.** When multiple tranches on the same side are eligible to fire at the same `effective_trigger` close, engines MUST evaluate them in **`tranches[]` array order**. The available margin budget seen by each tranche is an **effective budget** computed locally for the duration of the close (see capital-allocation bullet below): the engine reads the venue's free collateral **once** at the start of the close, then debits that effective budget by the initial margin committed by each tranche as the engine commits its fill / skip decision and *before* the next tranche is evaluated. Engines MUST NOT re-query the venue between tranche evaluations within the same close — venue latency and pending-fill propagation make that approach non-deterministic.
- **Capital allocation.** A tranche allocates its specified `size` using the §4.6 notional formula — `percent_allocation` resolves against the Leg's `leg_capital` (§4.6), which is derived from `account_equity` **at the close on which the tranche fires** (not portfolio-initial equity, and not the equity at the moment the first tranche of the sequence fired). When multiple tranches fire on the same `effective_trigger` close, engines MUST snapshot `account_equity` **once per close** — after §4.7 steps 1–2 (so bracket fires and exit rules have already changed `account_equity`) but **before** any tranche in step 3 evaluates — and hold that snapshot (and the `leg_capital` derived from it) constant across all tranche evaluations in step 3a's array-order walk. Per-tranche fees, fills, or other within-close mutations do NOT update the `account_equity` snapshot during the same close; the next venue read happens on the next close. This matches the once-per-close treatment of free collateral / the available margin budget below — both are seeded once per close and held constant through step 3. The resulting notional is then capped by the Leg's **available margin budget**, converted into notional space via the Leg's `leverage`:
  - **available margin budget** = an effective budget the engine maintains for the duration of each `effective_trigger` close. It is seeded **once per close** from the venue-reported **free collateral** (also referred to in some venue APIs as **available margin**; the two terms are synonymous here) on the (sub)account the strategy executes on, then debited by the initial margin of each committed tranche before the next tranche in `tranches[]` order is evaluated. New venue reads happen on subsequent closes, not within the current close.
    - Under **cross margin**, the venue's free-collateral figure reflects the *entire* account: any positions opened by other strategies sharing the account naturally reduce the budget, so contention with co-located strategies is handled automatically.
    - Under **isolated margin**, the venue's free-collateral figure for the strategy's isolated wallet / sub-account reflects only the strategy's own committed margin.
  - **available notional budget** = available margin budget × `leverage`.
  - The §4.6 desired notional is compared against the available notional budget; equivalently, the required initial margin (= notional / `leverage`) is compared against the available margin budget. The two formulations are arithmetically identical and engines MAY implement either, but MUST NOT compare raw notional against raw margin (the units differ by `leverage`×).
- **Budget-cap outcomes (deterministic).** When the budget cap is applied, the tranche resolves into exactly one of three deterministic outcomes — engines MUST agree on which outcome occurs (where "fits the budget" means *desired notional ≤ available notional budget*, equivalently *required initial margin ≤ available margin budget*):
  1. **Full fill** — the §4.6 desired notional fits the budget. The tranche fills at the requested notional and is marked `entered`.
  2. **Capped partial fill** — the budget binds but the capped notional is still ≥ the venue's minimum order size. The tranche fills at the capped notional (= available notional budget) and is marked `entered` (the registry tracks intent to enter, not fill size).
  3. **Skip** — the capped notional is below the venue's minimum order size (including the degenerate "available margin budget ≤ 0" case — equivalently "available notional budget ≤ 0", since they differ only by the strategy's `leverage`). No order is placed and the tranche is **NOT** marked `entered`, so it remains eligible to fire again on the next `effective_trigger` close if its conditions still hold. The skip MUST be logged as a runtime event (e.g., `tranche_skipped_insufficient_budget`) but is not a strategy-scope error; it does not trigger `evaluation_failed` and the strategy continues.
- **Registry reset.** The engine maintains an `entered` registry **per side** (i.e., `{ long: bool[N_long_tranches], short: bool[N_short_tranches] }`), tracking which tranches have fired in the current sequence on that side. The registry for a given side resets to all `false` on **any non-flat → flat transition on that side** — whether triggered by the exit rule, by the last open tranche's bracket firing, or by an opposite-side auto-reverse close. A new sequence begins on the next tranche fire on that side; the opposite side's registry is unaffected.
- **No mid-sequence re-entry.** A tranche that has already fired and closed within the current sequence (e.g., its bracket hit and the side is *still* non-flat because other tranches in the same sequence remain open) does **not** re-fire even if its `conditions` become true again on a later close. The `entered` bit stays `true` for the duration of the sequence; re-entry only becomes possible after a full registry reset.
- **Opposite-side interaction.** If an opposite-side entry fires, **all open tranches on the current side are closed simultaneously**, and the opposite-side entry / tranches begin executing.

### 4.3 Exit semantics

When an exit rule's `conditions` evaluate true at an `effective_trigger` close and a position on the rule's side (`exit.long` or `exit.short`) is open: close the position. Exit rules do not open new positions and do not reverse.

In **Tranches mode**, the exit rule closes **all open tranches** on that side simultaneously.

### 4.4 Bracket semantics

Brackets (`take_profit`, `stop_loss`) are declared on the entry that opens a position and describe the strategy's TP/SL **intent** for that position. The mapping from intent to venue mechanics depends on the entry mode:

**In classic single-entry mode**, the bracket attaches directly to the entry order and maps to exchange-native bracket-order semantics: when the parent entry order fills, child orders go live at price thresholds derived from the entry fill price and the bracket pcts. When any close event occurs (bracket trigger, exit rule, opposite-side entry), all child orders for that position are cancelled. This mapping is the exchange-native portability contract spelled out below.

**In tranches mode**, take-profits and stop-losses evaluate independently per tranche. Firing a tranche's bracket closes **only that specific tranche position**, with two distinct flows at the venue level:

- The tranche's **initial margin** is released back to **free collateral** (the venue-reported quantity that the engine reads to seed the available margin budget on each close; see §4.2.2). On the next `effective_trigger` close, the venue-read step picks that increased free collateral up, and the resulting available margin budget makes the released margin available to subsequent tranche firings.
- The trade's **realized P&L** is added to (or subtracted from) **`account_equity`** (per §4.6). `account_equity` is the account-level accounting quantity; the Leg's `leg_capital` — the basis its `percent_allocation` sizing resolves against — is recomputed from `account_equity` (§4.6). The spec maintains **no separate per-Leg equity ledger**. Free collateral is the venue-side quantity that gates whether a tranche can fire (via the available margin budget computed per close).

A profitable bracket fire therefore touches both quantities (margin released and P&L added to equity); a losing bracket fire releases margin but subtracts P&L from equity. Engines MUST NOT conflate the two — they are separately reported by venues and feed different parts of the capital-allocation rule in §4.2.2.

On venues that maintain a single position per `(account, asset)`, the per-tranche isolation is reconstructed by the engine (app-layer simulated) per the divergence note below — the strategy-scope intent is unchanged, but the path from intent to wire is no longer purely "attach a child order to the parent entry".

> **Tranches-mode portability divergence.** Per-tranche bracket isolation is **not** an exchange-native primitive on venues that maintain a single position per `(account, asset)` in one-way mode (Hyperliquid one-way, Binance Futures one-way) — same-side orders merge into a single position with a weighted-average entry price at the venue. On those venues, per-tranche isolation is **app-layer simulated**: the engine tracks per-tranche fill state and emits reduce-only orders sized to each tranche's fill on bracket trigger. This is a **deliberate, scoped divergence** from the "no client-side simulation" rule below — accepted because the alternative (refusing tranches mode on every one-way venue) would make the feature unusable on the current supported venues. The classic-mode bracket semantics remain purely exchange-native. Engines that ship tranches mode MUST document their per-tranche reconstruction approach.

**Exchange-native portability** (classic mode). Bracket fields describe strategy *intent*, but in classic single-entry mode they are defined as **exchange-native features**: the DSL does not include client-side simulation of bracket types. If the target exchange does not natively support a bracket, strategies declaring that bracket are not executable on that exchange.

| Bracket | Hyperliquid (classic) | Binance Futures (classic) | Tranches mode |
|---|---|---|---|
| `take_profit` | Native (TP order, attached to parent entry as OCO child) | Native | App-layer simulated on one-way venues — see the divergence note above |
| `stop_loss` | Native (SL order, attached to parent entry as OCO child) | Native | App-layer simulated on one-way venues — see the divergence note above |

For Hyperliquid in **classic mode** specifically (i.e., when the bracket is an exchange-native child order attached to the parent entry): TP/SL children fire only when the parent entry fully fills, or partially fills followed by cancellation due to insufficient margin. Cancelling a partially-filled parent cancels the children as well. (Sources: [Hyperliquid order types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types), [Hyperliquid TP/SL](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl).) **This venue-level child-order detail does not apply to tranches mode** on Hyperliquid (or any one-way venue), where per-tranche brackets are app-layer simulated per the divergence note above — the engine emits reduce-only orders per tranche fill and is responsible for its own partial-fill / cancellation handling.

The trigger-price source for TP/SL (mark price vs contract price) and the cancel/place sequence on auto-reverse are execution-runtime concerns — see §1.4. Each engine documents its choices; the DSL does not declare them.

Trailing stops are not in the v2 bracket schema — see §7.9 for rationale.

### 4.5 Position invariant

> **2.2.** This invariant is **per Leg**. Each Leg holds at most one net direction on its own asset; Legs are independent (distinct assets, §5.2), so a strategy holds up to one net position per Leg. The Portfolio Exit (§4.10) is the only construct that acts across Legs.

A Leg never holds positions on **both** sides of its asset at the same time — net direction is always `long`, `short`, or `flat`. Opposite-side entries auto-reverse (close everything currently open, then open the new side).

**In classic single-entry mode**, the strategy holds at most one position on its asset at any time.

**In tranches mode**, the strategy may hold up to one position per tranche on the currently active side (i.e. multiple co-existing positions, all on the same side, one per fired tranche). The §1.4 strategy-scope **side-exclusivity invariant** stated above subsumes the older "one-position-per-strategy" framing from pre-tranches drafts; engines MUST treat the per-side accumulation as in-scope strategy behaviour, not as an engine-runtime extension.

### 4.6 Leverage and sizing

> **2.2.** Leverage and sizing operate **per Leg**, and a Leg's capital comes from the **Allocation** (§3.1.1), not from account equity directly. The contract below is the per-Leg contract; it holds independently for each Leg in a Portfolio Strategy.

**Leverage** is a per-Leg integer ≥ 1 (§3.1.2) applied to every order placed by that Leg's entry rules. Different Legs in one strategy may carry different leverage (e.g. 3× on a BTC Leg, 1× on a smaller-cap Leg).

**Allocated capital per Leg.** Before sizing, each Leg has an explicit capital pool derived from the Allocation:

```
leg_capital = (leg_weight / 100) × (strategy_fraction / 100) × account_equity
```

where `leg_weight` is the Leg's weight in `allocation.weights[]`, `strategy_fraction` is `allocation.strategy_fraction`, and `account_equity` is the account equity at entry time as reported by the venue. Capital is partitioned across Legs at the **sizing-denominator** level — this resolves the §8.7 denominator-sharing problem (no two Legs size against the same equity slice). It does **not** isolate Legs operationally: under cross margin they still share account collateral and the common `account_equity` input that `leg_capital` is recomputed from, so margin contention across Legs can remain (§8.7 cross-margin contagion).

**Sizing-basis isolation (for strategy-scope determinism).** §1.4 makes sizing math strategy-scope — two engines, *and* backtest vs. live, MUST agree on the notional from a given rule firing. For that to hold, `account_equity` here is the **strategy's own (sub)account equity**, not a shared multi-strategy account balance: in a **backtest** it is the simulated strategy account seeded at `initial_equity` (`architecture-docs.md §4.1.2`) and moved only by *this* strategy's Legs; **live**, it equals the strategy's own equity only when the strategy runs in an isolated venue sub-account (§8.7 option B, the recommended default). On a shared cross-margin account the live `account_equity` also reflects other strategies, so backtest and live can diverge — sizing determinism then degrades to that isolation caveat (§8.7), it is not restored by the Allocation alone.

**No auto-rebalancing (intended).** `leg_capital` is recomputed from *live* `account_equity` at each fill against the **static** `weights[]`; the spec does **not** rebalance realized P&L back toward the target split, so the realized capital split drifts from the target weights as Legs perform differently. This is deliberate — a dedicated rebalance construct was considered and rejected (§1.3); trimming/rotation is expressible through each Leg's own entry/exit conditions.

**Notional formula** uses the Leg's `size` mode against its allocated capital:

- `{ type: 'percent_allocation', pct: P }` → notional = `leg_capital × (P / 100) × leverage`

A classic single-entry rule typically uses `pct: 100` (deploy the whole Leg slice); tranches split the Leg's pool across firings (e.g. 30 / 30 / 40). Two engines running the same DSL on the same equity curve MUST produce the same notional from the same rule firing.

**Cross-Leg sizing on a shared close (2.2).** When more than one Leg has a candle closing at the same timestamp, sizing across Legs MUST be deterministic the same way §4.2.2 makes it deterministic *within* a Leg. Engines process the Legs in **`legs[]` array order**, snapshot `account_equity` **once** for that close — after that close's §4.7 step-1 bracket fires and step-2 exits, before any Leg's step-3 entry sizes — and hold that snapshot (and every `leg_capital` derived from it) **constant** across all Legs sizing on that close. A Leg's fill earlier in the array does **not** re-bump `account_equity` for a later Leg within the same close; the next snapshot is taken on the next close. Without this rule, two engines re-reading `account_equity` at different points in the array walk would compute different `leg_capital` → different notionals, breaking the MUST above. (This is the cross-Leg analog of §4.2.2's once-per-close snapshot; it is a cross-Leg semantic, like the Portfolio Exit, and is therefore specified here rather than left to the per-Leg reading of §4.)

**Margin mode** is declared **per Leg** (`margin_mode: 'cross' | 'isolated'` on each Leg — §3.1.2; was strategy-level in 2.1):

- **Cross margin** — the position shares collateral with the rest of the account; liquidation price is independent of the leverage knob (which only sets the initial margin requirement at open time). Once open, the position's liquidation trigger is determined by total account equity vs. maintenance margin on the notional. (Source: Hyperliquid docs — "The actual liquidation price is independent on the leverage set for cross margin positions.")
- **Isolated margin** — the released initial margin is the only collateral for that position; liquidation price *does* depend on leverage. Strategies declaring isolated margin signal that the liquidation buffer is part of intent.

**Why this is in v2 (motivation: HIP-3 assets on Hyperliquid).** HIP-3 enables permissionless / builder-deployed perp markets on Hyperliquid; different HIP-3 markets can require different margin treatments, and a strategy targeting an HIP-3 asset must declare its mode unambiguously rather than rely on a venue default. With this field present, the same DSL can express isolated-margin strategies (where liquidation distance is part of intent) and cross-margin strategies on the same venue.

Auto-reverse interaction with isolated margin is a runtime concern: the venue-side cancel-then-place sequence may transiently undercollateralise the new position relative to the leverage knob (see §1.4). The DSL strategy intent is unchanged — reverse with new bracket — but the venue may reject the order or auto-deleverage. Engines should document their handling.

### 4.7 Same-candle event ordering

When multiple strategy-affecting events evaluate true within a single `effective_trigger` bar, engines MUST resolve them in the following deterministic order. Two engines running the same DSL on the same input data MUST produce equivalent position transitions; runtime-scope details (cancel/place sequencing, intrabar fill convention) listed in §1.4 may differ.

1. **Bracket fires on tick price between closes.** TP and SL triggers fire on the price tick that crosses the threshold, intra-bar. By the time the close-of-bar evaluation runs, the affected position has already been closed by the bracket fire — no further engine action is needed at the close for that event. **In classic mode**, "affected position" means the strategy's single position (so a bracket fire takes the side flat). **In tranches mode**, "affected position" means *only the specific tranche position* whose bracket fired (per §4.4); the side may remain non-flat if other tranches on the same side are still open, and steps 2–3 see that updated remaining-open-tranches state. The side goes flat only when the last open tranche's bracket fires (or via step 2 / step 3 paths), which is the trigger for the §4.2.2 registry reset.
2. **At the close, exit rules evaluate first.** If a position is open on the rule's side and the rule's `conditions` are true, close the position. Exit rules do not open new positions and do not reverse.
3. **Then entry rules evaluate.** Against whatever position state results from steps 1–2:
   - **Classic mode (§4.2.1).** If flat, evaluate `entry.long` and `entry.short`; if a position is already open, follow §4.2.1 (same-side ignored — no pyramiding in classic mode; opposite-side auto-reverses).
   - **Tranches mode (§4.2.2).** Same-side **is not ignored**: every tranche whose conditions are true and whose `entered` bit is `false` fires, subject to the budget-cap outcomes in §4.2.2. Opposite-side entry / tranches still auto-reverse — they close all open same-side tranches before the opposite-side entry evaluates.

   **Tranches-mode sub-ordering (within step 3).** When `entry.<side>` is a tranches rule:
   - **a.** Tranches evaluate in `tranches[]` array order (§4.2.2). Each tranche's fill / skip decision is committed and the available margin budget is updated before the next tranche is evaluated.
   - **b.** When an opposite-side entry fires on the same close as same-side eligible entries (a classic-mode entry firing on a side that already holds a position, or one-or-more tranches eligible on a side that already holds tranches), the **opposite-side auto-reverse close always runs first** — regardless of whether each side is classic or tranches:
     1. Close everything currently held on the existing side (a classic single position or a tranche stack), releasing margin and — if that side was tranches — resetting its `entered` registry per §4.2.2.
     2. Then evaluate the opposite-side entry against the resulting flat state. The opposite side's entry sees the same flat state it would have seen if the strategy had started the close already flat on that side, whether that entry is a classic single-fire or a `tranches[]` array evaluated in array order per **a** above.
     3. Same-side entries that would have fired this close on the *closing* side (e.g., another eligible tranche on the long side that was already open) are **dropped** — the auto-reverse takes precedence, and those tranches would have to refire on a later close once the new (opposite) sequence eventually returns to flat.
     4. This rule applies symmetrically across all four mode combinations: classic/classic, tranches/tranches, classic/tranches, and tranches/classic.
   - **c.** A registry reset triggered earlier in the same bar's processing (by a step-1 bracket fire intra-bar, by step 2's exit rule at the close, or by step 3b's opposite-side auto-reverse close earlier in step 3) takes effect **before** any tranche on that side is evaluated in step 3. Equivalently: every tranche evaluation sees the most-recent committed registry state — there is no point at which a tranche reads a stale snapshot.

4. **Simultaneous long-eligible and short-eligible on flat is undefined behaviour.** Authors are responsible for designing condition trees so this is naturally impossible (e.g., paired threshold operators on the same indicator: `RSI < 30` for long and `RSI > 70` for short). The rule fires when a **long-eligible** condition and a **short-eligible** condition are simultaneously true at the same close on a flat strategy, defined per side as follows:

   - **Classic side** is long-eligible (resp. short-eligible) iff `entry.long.conditions` (resp. `entry.short.conditions`) evaluates true.
   - **Tranches side** is long-eligible (resp. short-eligible) iff **any** tranche on `entry.long.tranches` (resp. `entry.short.tranches`) has its `conditions` true at this close. A single eligible tranche is sufficient; the engine MUST NOT silently prefer the side with more eligible tranches, the side declared first in the DSL, or any similar heuristic.

   This generalizes across all four mode combinations (classic/classic, tranches/tranches, classic/tranches, tranches/classic). Equivalently: define `eligible(side)` once per the rules above and apply it symmetrically — the rule fires when both sides are eligible on a flat strategy, regardless of which mode each side uses.

   If the rule fires at runtime, the engine MUST report this as a system-level error (`evaluation_failed` in the consumer's error code set; see `architecture-docs.md §4.1.4`) so that the deployment's `on_error` policy (skip-and-notify vs pause) decides the runtime response. The engine MUST NOT silently pick a side.

There is no "bracket vs entry" race: brackets always resolve chronologically before the close evaluation, so steps 2–3 see whatever flat / open state results from step 1.

### 4.8 Crossover semantics

Crossover operators (`crossed_above`, `crossed_below`) are part of strategy scope (§1.4): two engines evaluating the same DSL on the same input series MUST produce identical crossover truth values. The semantics below are mandatory.

**Bar-level definition.** An atom with operator `crossed_above` is true at the close of bar `t` (on the atom's `timeframe`) iff:

```
left(t-1) ≤ right(t-1)   AND   left(t) > right(t)
```

Symmetrically, `crossed_below` is true at the close of bar `t` iff:

```
left(t-1) ≥ right(t-1)   AND   left(t) < right(t)
```

The boundary uses non-strict inequality on the previous bar and strict inequality on the current bar — equal values on bar `t` do not fire a cross. Both operands are sampled at the same close on the atom's timeframe.

**First-bar handling.** If `t-1` does not exist, or either operand is NaN at `t-1` or `t` (e.g., during indicator warmup), the cross is false.

**Multi-timeframe.** A crossover atom on a higher timeframe than `effective_trigger` is re-evaluated on every `effective_trigger` close (consistent with §4.1), but the cross-detection compares the same `t-1`/`t` candles of the higher TF until the next higher-TF close. The crossover is a single-bar event tied to the higher-TF candle close: it is true at the close of the higher-TF bar where the cross occurred, and on subsequent `effective_trigger` ticks within the same higher-TF bar it remains true (the same `t`/`t-1` pair satisfies the cross condition); at the next higher-TF close, `t` advances and a new cross test runs.

**Lookback inclusivity.** A `lookback` operand at bar `t` evaluates over the **prior** `period` bars, exclusive of bar `t`:

```
lookback(fn, source, period) at bar t  =  fn(source[t-period], source[t-period+1], …, source[t-1])
```

This applies to all uses of `lookback`, not only crossover operands. Rationale: the most common usage is breakout detection (`close crossed_above lookback(highest, high, 24)`), which only works as intended when the current bar is excluded — otherwise the current bar's high is in the lookback window, making `close > lookback` essentially impossible. Strategies that need "is current close at/above the recent range" should compare against `price.field: high` directly, or wait for the §8.4 historical-operand work.

### 4.9 Undefined-operand semantics

An atom whose `left` or `right` operand is **undefined** at the evaluation timestamp evaluates to **FALSE** for every operator (`less_than`, `greater_than`, `less_than_or_equal`, `greater_than_or_equal`, `crossed_above`, `crossed_below`). An operand is undefined when:

- An indicator is still in its warmup window and has not yet produced a meaningful value (e.g., `RSI(14)` on bar 5 of the data feed).
- An indicator computation legitimately produces NaN (e.g., division-by-zero in an internal formula, undefined for the current input).
- A `lookback` window references bars that don't exist (`lookback(highest, high, 24)` at bar 10).
- A prior-bar value referenced by a crossover (`t-1`) does not exist.

Boolean tree composition proceeds normally on the resulting FALSE: `all_of` containing a FALSE-from-undefined atom returns FALSE; `any_of` falls through to its remaining atoms. The undefinedness does **not** propagate as a third truth value.

This generalizes the crossover-specific rule already stated in §4.8 ("If `t-1` does not exist, or either operand is NaN at `t-1` or `t`, the cross is false") to apply uniformly across all six operators.

**This rule replaces the v2 DSL `on_error: skip | halt` field that has been removed (see §1.3).** Strategy authors do not configure undefinedness behaviour; the rule is fixed, deterministic, and engine-invariant.

**Engines MUST NOT** report undefinedness as a system-level error. An evaluation where every atom is FALSE due to undefined operands returns `status: ok` with empty `decisions` — the same shape as any other "no conditions met" cycle. Genuine system failures (indicator implementation raised an exception, data fetch from the candle store failed, etc.) remain in the consumer's error-code space (`evaluation_failed`, `data_unavailable` — see `architecture-docs.md §4.1.4`).

### 4.10 Portfolio Exit semantics (2.2)

The optional `portfolio_exit` (§3.1.1) is a strategy-wide, **equity-only** halt that sits above the Legs. It is part of **strategy scope** (§1.4) — two engines evaluating the same Portfolio Strategy on the same input series MUST produce the same Portfolio-Exit fire timestamp and the same resulting flat state.

**What it reads.** Let `C0` = the strategy's **allocated capital at deploy** = `(strategy_fraction / 100) × account_equity_at_deploy`, captured **once** when the deployment starts. In a **backtest** there is no live deploy moment, so `C0 = (strategy_fraction / 100) × initial_equity`, where `initial_equity` is the starting equity supplied in the `/backtest` request.

**Deploy precondition.** The capital base MUST be `> 0` — `account_equity_at_deploy` (live) or `initial_equity` (backtest). Deploying onto, or backtesting against, a zero or negative base is refused with `deploy_equity_nonpositive` — a **deploy-time precondition** enforced by the deployment layer when a strategy is deployed or a backtest is requested. It is distinct from both the pure validator's codes (§5; the validator cannot see runtime equity) and the engine's *evaluation-time* system errors (`architecture-docs.md §4.1.4` — `evaluation_failed`, `data_unavailable`, etc., which fire while a deployed strategy is running, not at deploy admission). The code is introduced here and is owned by the deployment layer, not §4.1.4. The refusal is needed because `C0 ≤ 0` makes every threshold degenerate (a take-profit fires immediately, a stop-loss never can) and `leg_capital = 0` makes every Leg dead. `C0` capture is undefined for a non-positive base.

The Portfolio Exit reads a single running figure, the **PE shadow equity**: `E(t) = C0 + Σ(realized P&L of closed Leg trades) + Σ(unrealized P&L of open Leg positions)`, summed across every Leg and valued entirely at **closed-candle prices** (see Pricing basis). It reads **only** `E(t)` against the fixed baseline `C0` — no indicators.

**Pricing basis (PE shadow equity — for strategy-scope determinism).** So that two engines on the same input candles fire the Portfolio Exit at the same timestamp, `E(t)` is computed from **closed-candle prices only**, on **both** legs of every P&L term — it uses **no** real (runtime-scope) fill price. Each P&L term is `mark/exit − cost_basis`; both ends must be closed-candle, or the runtime-scope fill leaks back in. For each Leg position the shadow accounting therefore values:

- the **cost basis** at the **`close` of the bar on which that position's entry decision fired** (an `effective_trigger` close, §4.1 — deterministic) — **not** the real entry fill price (the intrabar fill convention is runtime-scope, §1.4);
- the **current mark** (open position) or **exit** (a position closed *during* the current bar, including via a bracket fire) at the **most-recent closed-candle `close`** on that Leg's **`effective_trigger` timeframe** (§4.1) — **not** `(high+low)/2`, the intrabar mark, the bracket trigger level, or the real fill price;

both taken **gross of fees and funding** (fees/funding are runtime-scope, §1.3). In short, `E(t)` re-prices the whole portfolio at closed candles **as if every entry and exit had transacted at the relevant candle `close`** — making it a pure function of closed OHLCV.

Consequently the **PE shadow equity `E(t)` deliberately differs from the strategy's actually-booked equity**: the fire *decision* runs on the closed-candle shadow figure so it is identical across compliant engines, while each Leg's own booked equity curve still reflects real intrabar fills, bracket levels, and fees. The Portfolio Exit fire is therefore strategy-scope at **closed-candle granularity** — it reacts at most one candle after a threshold is crossed intra-bar. This ≤1-candle reaction lag, and the shadow-vs-booked gap, are the deliberate trade for engine-invariance: there is **no** runtime-scope input in the fire decision.

> **Reconciliation with §4.6.** `C0` is fixed at deploy so the Portfolio Exit's percentage is a stable P&L measure over the strategy's life. This is deliberately distinct from §4.6's per-entry `leg_capital`, which is recomputed against *current* account equity at each fill to size the next order. Two quantities, two jobs: `C0` measures aggregate P&L for the halt; `leg_capital` sizes individual entries.
>
> **`equity_stop_loss.pct` is measured from deploy capital, not peak or current.** Because `C0` is fixed at deploy, an `equity_stop_loss.pct` is drawdown from **deploy** capital. After the strategy is up +40% (`E ≈ 1.4·C0`, e.g. $14k on a $10k deploy), an `equity_stop_loss.pct: 10` still only fires at `E ≤ 0.9·C0` ($9k) — i.e. it will calmly tolerate giving back the entire +40% gain *plus* 10% of deploy capital (a −36% drawdown from the $14k peak) before halting. A peak / high-water baseline is **deferred** (§8.1); 2.2 measures from deploy only, with no implicit alternative.

**Thresholds.** `equity_take_profit` and `equity_stop_loss` each accept `pct` (relative to `C0`) and/or `usd` (absolute P&L), with explicit fire conditions:

- `equity_take_profit.pct = P` → fires when `E(t) ≥ C0 × (1 + P/100)`.
- `equity_take_profit.usd = U` → fires when `E(t) − C0 ≥ U`.
- `equity_stop_loss.pct = P` → fires when `E(t) ≤ C0 × (1 − P/100)`.
- `equity_stop_loss.usd = U` → fires when `E(t) − C0 ≤ −U`.

At least one of the two blocks must be present, and a present block must declare at least one of `pct` / `usd` (§5.2). If a block gives both `pct` and `usd`, whichever threshold is reached first fires.

> **Distinct from Leg brackets — different name on purpose.** The Portfolio Exit's `equity_take_profit` / `equity_stop_loss` are **equity-P&L** thresholds on aggregate `E(t)` and accept `pct` (of `C0`) **and/or** `usd` (absolute P&L). A Leg's `take_profit` / `stop_loss` (§3.2, §4.4) is a **price-move** bracket on that Leg's own position and accepts only `pct` (against entry fill price), **never** `usd`. The `equity_` prefix is deliberate (2.2): it keeps the two constructs from sharing a name, so a `pct` is unambiguously an *equity* move at the portfolio level vs a *price* move at the Leg level, and `usd` is valid only on the `equity_*` blocks.

**Effect when it fires (overrides Leg exits).**
1. **Flatten all Legs** — close each Leg's **entire** open exposure, regardless of each Leg's own exit state. On a Leg in tranches mode this means the **whole tranche stack** (a Leg may hold multiple open positions, §4.5), not a single position; engines MAY implement it as one net reduce-only close per Leg or as per-tranche closes. This overrides any Leg-level exit rule or bracket that had not yet fired.
2. **Terminate the deployment** — it does not recycle. Legs do not re-enter afterward (this avoids the §8.1 running-drawdown state the spec defers).

Engines MUST emit a named **`portfolio_exit_fired`** runtime event when the Portfolio Exit fires, carrying at minimum `{ t, C0, E_t, threshold_kind (equity_take_profit | equity_stop_loss), threshold_value }` (and, where available, each Leg's realized / unrealized P&L at `t`). This is the cross-Leg analog of the §4.2.2 `tranche_skipped_insufficient_budget` event — the flatten-all + terminate is the most consequential 2.2 runtime action and must be observable, not silent.

**When it is evaluated.** At **closed candles only** — the **union of all Legs' `effective_trigger` closes** (§4.1). The intra-bar bracket-fire tick is deliberately **not** a Portfolio-Exit evaluation event; that is precisely what makes the fire closed-candle-deterministic (see Pricing basis). At a timestamp `t`, the engine **advances every Leg whose candle closes at `t`** (any intrabar bracket fires on those Legs are booked per §4.7 step 1; for `E(t)` the affected positions are re-priced at the candle `close` — Pricing basis), then computes `E(t)` **exactly once** and tests the thresholds. Because `E(t)` is a single sum across Legs, the order in which coincident-closing Legs are folded into it is irrelevant — there is no fold-order ambiguity. The Portfolio Exit fires at the **first** closed-candle `t` at which a threshold is crossed. Engines MUST NOT defer the check to a single Leg's timeframe (a higher-frequency Leg's close can be the crossing event) and MUST NOT add continuous intra-bar monitoring; the cadence is exactly the §4.1 closes, which keeps §4.10 engine-invariant (strategy scope) with no dependence on venue fill timing.

**Cross-Leg evaluation order on a close (normative).** §4.7 specifies ordering *within* one Leg; the Portfolio Exit adds a cross-Leg phase the per-Leg pipeline cannot express, so it is mandated here as an explicit ordered procedure rather than left to the §4 lead-in's "read it per-Leg" remap. On each closed-candle evaluation event `t`:

1. **Apply step-1 bracket fires on every Leg** whose candle closes at `t` (§4.7 step 1) to that Leg's real booking; for the test below, those positions enter `E(t)` re-priced at the candle `close` (Pricing basis), not the bracket level.
2. **Compute the aggregate `E(t)`** (the PE shadow equity above) **once**.
3. **Test the Portfolio Exit.** If a threshold is crossed → **flatten all Legs and terminate** (the Effect above); do **NOT** run §4.7 steps 2–3 (exit rules, entries) on **any** Leg this cycle.
4. **Otherwise**, run §4.7 steps 2–3 in the **two-phase cross-Leg order** §4.6 requires — **not** a per-Leg interleave: **(4a)** run §4.7 step-2 **exits** on every Leg; **(4b)** take the **single** §4.6 `account_equity` snapshot for this close; **(4c)** run §4.7 step-3 **entries** on every Leg in `legs[]` order, all sizing against that one snapshot.

Stating this explicitly closes the gap that prose precedence leaves: an implementer following the per-Leg pipeline literally could otherwise open a new Leg-B entry (step 3) on the very bar the Portfolio Exit should have short-circuited.

**Backtest is always a joint simulation.** A multi-Leg strategy is **never** a sum of independent per-Leg backtests — even with **no** `portfolio_exit`. Each Leg's `leg_capital` sizes against the **shared** `account_equity` (§4.6), so one Leg's realized/unrealized P&L changes another Leg's order sizes; independent per-Leg sims (each seeing only its own equity) would size, fill, and report differently from the joint sim the user actually deploys on. A backtest therefore MUST run all Legs on one shared clock against one running `account_equity`; when a `portfolio_exit` is present it additionally maintains `E(t)` and flattens every Leg at the bar a threshold is crossed. (`N = 1` is trivially joint.) See `architecture-docs.md §4.1.2`.

### 4.11 Macro operand semantics (2.3)

A `macro` operand (§3.6) reads a macroeconomic series by `key` (§3.8). Macro evaluation is part of **strategy scope** (§1.4): two engines evaluating the same DSL on the same released macro data MUST produce identical macro operand values and therefore identical truth values.

**Release-time / most-recent-released value.** A macro series is a step function that changes only on its release dates (monthly, quarterly, or weekly per the registry `frequency`). At an `effective_trigger` close `t`, a `macro` operand resolves to the value of the **most-recently-released** observation whose release timestamp is `≤ t`. This is the direct analogue of the §4.1 multi-timeframe rule ("a higher-TF atom reads the most-recent-closed candle of its own timeframe"): the macro series is just a very-low-frequency series read at its last release. The macro value does **not** look ahead — an observation is visible only on or after its release date, never on the date the period it measures began.

**Independent of the atom's timeframe.** The atom's `timeframe` still governs the evaluation cadence of the comparison (and which candle a `price` / `indicator` operand on the same atom reads). The `macro` operand ignores that timeframe for its own value: it always reads its latest release. So `macro:cpi_yy greater_than value:3` on a `1h` atom is re-evaluated every hour but only changes when a new CPI print is released.

**Undefined before first release (§4.9).** If no observation of the series has been released as of `t` (e.g., the backtest window starts before the first available print), the `macro` operand is **undefined**, and per §4.9 the atom evaluates to **FALSE** for every operator — exactly like an indicator still in warmup. The undefinedness does not propagate as a third truth value.

**Crossovers.** A `macro` operand is a time-varying series, so it MAY participate in `crossed_above` / `crossed_below` (unlike a `value` constant — §5.2 `crossover_requires_series`). Because the series is a step function, a cross fires on the first `effective_trigger` close after a release that moves the comparison across the boundary, following the §4.8 bar-level definition with the macro value held constant between releases.

**Pricing/runtime note.** The macro release calendar (which observation is "released" at which timestamp) is part of strategy scope and MUST be agreed by all engines; the source files / vendor feed that populate the series are a runtime concern (§1.4), like the candle source.

---

## 5. Validator contract

The validator is a pure function:

```ts
function validateStrategy(strategy: Strategy, opts?: ValidateOptions): ValidationResult;

type ValidationResult =
  | { ok: true, strategy: Strategy }            // result.strategy === input (reference-equal)
  | { ok: false, errors: ValidationError[] };

type ValidationError = {
  path: string;          // JSON pointer to the offending field, e.g. "/entry/long/take_profit/pct"
  code: string;          // closed code from §5.1
  message: string;       // human-readable explanation
  expected?: string;     // structured constraint, e.g. "integer >= 1"
  received?: unknown;    // the offending value, JSON-serializable
};
```

The validator inspects but does not mutate. The strategy passed in is the strategy returned out — **reference-equal** on success: `result.strategy === input` (in TypeScript) or the equivalent in another implementation language. The validator does not add derived fields, does not normalize redundant structures, does not coerce types, does not produce a structurally-cloned copy.

**Implementation note.** A naïve validator using `Zod.parse(input)` (or any schema library that walks-and-rebuilds) returns a structurally cloned object, breaking the reference-equal contract. Validators MUST validate input against the schema (e.g., `safeParse`) but return the **original input reference** on success — not the parsed (cloned) value. The schema MUST NOT carry transforms, defaults, or coercions; if a future schema needs them, the validator's contract becomes "structurally equal" instead of "reference-equal" and §5 must be updated. Tests should assert reference equality (`result.strategy === input`), not deep equality.

**Error payload.** `ValidationError.expected` and `received` are optional. Set them when the error has a single offending value — most numeric-range errors (`leverage_out_of_range`, `pct_out_of_range`, `period_out_of_range`, etc.) and enum violations (`unsupported_timeframe`, `unsupported_margin_mode`, etc.). Omit when an error has no single offending value (e.g., `crossover_requires_series`, `entry_required`). For `tree_too_deep`, set `received: <actual_depth>` and `expected: "depth <= 3"`. The fields exist primarily so an LLM author receiving the error can self-correct without re-deriving the rule from the message text.

Canonical form is the author's responsibility. Redundant or non-canonical structures are rejected with stable error codes; the author corrects on the next iteration.

### 5.1 Error codes

The error code set is closed. Each error has a `path` (JSON pointer-ish), a `code` (machine-readable identifier), and a `message` (human-readable explanation):

| Code | Where it fires |
|---|---|
| `unsupported_dsl_version` | Fires for any of: (1) **malformed format** — `dsl_version` does not parse as a strict two-component `major.minor` string with non-negative integer parts (so `"2"`, `"2.1.0"`, `"2.x"`, `"v2.1"`, `""`, non-string types, etc. are all rejected); (2) **unsupported major** — the parsed major does not match the engine's supported major; (3) **unsupported newer minor (eager / version-level path)** — the parsed minor exceeds the engine's supported minor on a matching major and the engine rejects at version-check time without inspecting fields; (4) **unsupported newer minor (lazy / field-level path, end-of-walk fallback)** — the parsed minor exceeds the engine's supported minor on a matching major, the engine has chosen the lazy path, and the field walk completed without finding any unrecognized newer-minor field (so no `unknown_field` was emitted during the walk). See §1.5 consume constraint for the eager-vs-lazy choice. The spec at HEAD requires *emit* to use the literal `'2.2'`. Note 2.1 → 2.2 is **structurally breaking** (§1.5): a 2.2 engine consumes `'2.2'` strategies, and older `'2.0'` / `'2.1'` strategies are migrated to one-Leg 2.2 form (§1.5) rather than consumed in place. |
| `entry_required` | a Leg's `entry` object has neither `long` nor `short` (at least one entry rule per Leg) |
| `leverage_out_of_range` | a Leg's `leverage` is not an integer ≥ 1 (per-Leg in 2.2; `path` points at the offending Leg) |
| `legs_empty` | **(2.2)** `legs` array is empty — a Portfolio Strategy needs ≥ 1 Leg |
| `duplicate_leg_asset` | **(2.2)** two Legs target the same `asset` — Legs must be distinct-asset (§8.7) |
| `strategy_fraction_out_of_range` | **(2.2)** `allocation.strategy_fraction` is not an **integer** in (0, 100] (integrality folded into the range check, as with `leverage_out_of_range`) |
| `allocation_weights_sum_invalid` | **(2.2)** the (integer) `allocation.weights[]` pcts do not sum to exactly 100 — integer weights make this an exact integer comparison, with no floating-point tolerance question |
| `allocation_weight_out_of_range` | **(2.2)** an individual `allocation.weights[].pct` is not an **integer** in (0, 100] — checked per element, independently of the sum rule (a negative or >100 weight can still sum to 100 with a sibling, but yields undefined/negative `leg_capital`) |
| `allocation_weights_mismatch` | **(2.2)** a weight references an asset absent from `legs`, or a Leg has no corresponding weight (weights and Legs must correspond 1:1) |
| `portfolio_exit_empty` | **(2.2)** `portfolio_exit` is present but declares neither `equity_take_profit` nor `equity_stop_loss`, or a declared block has neither `pct` nor `usd` |
| `portfolio_exit_threshold_out_of_range` | **(2.2)** a `portfolio_exit` `pct` or `usd` threshold is ≤ 0, **or** an `equity_stop_loss.pct` ≥ 100 (a portfolio stop at ≥ 100% can never fire — it requires `E(t) ≤ 0`, i.e. the account is already liquidated — so it is an inert control, not a valid stop). `equity_take_profit.pct` has no upper bound |
| `period_out_of_range` | indicator or lookback `period` ≤ 0 |
| `numstd_out_of_range` | Bollinger `num_std` ≤ 0 |
| `multiplier_out_of_range` | lookback `multiplier` ≤ 0 |
| `size_pct_out_of_range` | a `percent_allocation` size's `pct` field ∉ (0, 100] (the `pct` inside `size: { type: 'percent_allocation', pct }`) (2.2 — `percent_equity` / `fixed_notional` removed; `notional_out_of_range` retired with them) |
| `pct_out_of_range` | bracket `pct` (TP or SL) ≤ 0 |
| `tranches_too_few` | `tranches` array contains fewer than 2 entries |
| `tranche_missing_fields` | a tranche entry is missing a required field (`conditions` or `size`) |
| `entry_mode_conflict` | an entry rule mixes the two modes — `tranches` is present **and** the rule also carries **any** of the top-level per-firing fields (`conditions`, `size`, `take_profit`, `stop_loss`). The two modes are mutually exclusive; brackets in tranches mode live per-tranche, never on the parent rule. See §5.2. |
| `entry_mode_missing` | an entry rule has neither classic-mode (`conditions` + `size`) nor tranches-mode (`tranches`) — the rule is empty of intent |
| `non_finite_number` | a numeric field is `NaN` or `±Infinity` |
| `unsupported_margin_mode` | `margin_mode` is not `'cross'` or `'isolated'` |
| `unknown_indicator` | indicator `name` not in the registry |
| `indicator_not_available` | indicator `name` not in the runtime `indicatorsAvailable` list (when provided) |
| `invalid_attribute` | indicator's `attribute` is missing when required, or not in the indicator's allowed set |
| `invalid_indicator_params` | indicator's `params` fail the registry's `paramSchema` |
| `cross_param_invariant` | indicator params violate a per-indicator semantic constraint (e.g., MACD `slow ≤ fast`) |
| `macro_indicator_not_available` | **(2.3)** `macro` operand `key` not in the runtime `macroIndicatorsAvailable` whitelist (only checked when that whitelist is supplied — macro validation is whitelist-driven, §3.8) |
| `invalid_macro_operand` | **(2.3)** a `macro` operand is malformed — a non-string/empty `key`, or any field other than `type` + `key` (a stray `params`/`attribute`/`value`) |
| `redundant_group` | `all_of` or `any_of` with a single child |
| `empty_group` | `all_of: []` or `any_of: []` |
| `tree_too_deep` | conditions tree depth > 3 |
| `missing_timeframe` | atom missing the required `timeframe` field |
| `unsupported_timeframe` | timeframe not in the canonical 7-value enum |
| `unsupported_operator` | atom's `operator` not in the canonical 6-value set (§3.5) |
| `crossover_requires_series` | a `crossed_above` or `crossed_below` atom has a `value` operand on either side (constants cannot cross) |
| `unknown_field` | strict-mode rejection: an object carries a key the closed schema doesn't recognize (e.g., `entry.long.bonus_field`) |
| `mixed_group_keys` | an `Expr` group node carries both `all_of` and `any_of` keys (§3.4) |
| `invalid_dsl_shape` | structural failure that doesn't fit any more specific code (missing required field, wrong-shaped union, etc.) |

### 5.2 Cross-field semantic rules

These rules require traversal beyond structural parsing:

- **Expr-validation rules apply uniformly to every `conditions` location.** The depth cap (§3.4), atom-shape rules (`unsupported_operator`, `missing_timeframe`), operand rules (`crossover_requires_series`), indicator-registry rules (`unknown_indicator`, `invalid_attribute`, `invalid_indicator_params`, `cross_param_invariant`), and group-cardinality rules (`redundant_group`, `empty_group`, `mixed_group_keys`) MUST be applied identically to every `Expr` in the schema — entry-rule `conditions`, exit-rule `conditions`, and `tranches[i].conditions` (§3.2). Tranche-conditions are not a separate validator domain; they walk the same Expr tree and emit the same error codes.
- **Indicator params validate against the registry's per-indicator schema.** Per-indicator semantic invariants (e.g., MACD `slow > fast`) are encoded in the registry's `paramSchema` or surfaced via a separate registry-defined invariant check.
- **Crossover requires series.** `crossed_above` and `crossed_below` require both operands to be time-varying series. Operands of `type: 'value'` are constants and cannot participate in a crossover. `indicator`, `price`, `lookback`, and **`macro`** (2.3) are all series and may cross.
- **(2.3) Macro operand shape + registry.** A `macro` operand must carry exactly `{ type: 'macro', key }` and nothing else — any extra field (`params`, `attribute`, `value`, …), or a non-string/empty `key`, fires `invalid_macro_operand`. Macro-key registry validation is **whitelist-driven** (the validator is pure): only when a `macroIndicatorsAvailable` whitelist is supplied is the `key` checked, and an absent key fires `macro_indicator_not_available`; with no whitelist any non-empty `key` is accepted and an unknown series surfaces at run time as undefined (§4.9). These checks apply to every `Expr` location (entry / exit / tranche `conditions`), exactly like the indicator-registry rules.
- **Non-finite numbers.** Any numeric field that is `NaN` or `±Infinity` is rejected (`non_finite_number`). This applies to **every** numeric field, including the 2.2 additions: `allocation.strategy_fraction`, every `allocation.weights[].pct`, and every `portfolio_exit` `pct` / `usd`. The `portfolio_exit` `usd` thresholds are **absolute P&L in the account settlement currency (USD)**.
- **Crossover same-TF.** Structurally enforced — both operands of a `crossed_above` or `crossed_below` atom share the atom's timeframe. No additional check needed.
- **Entry rule mode is exclusive (classic XOR tranches).** Each entry rule must commit to exactly one mode:
  - *Classic single-entry mode* — top-level `conditions` and `size` are both present, `tranches` is absent, and optional top-level `take_profit` / `stop_loss` apply to the single position the rule opens.
  - *Tranches mode* — `tranches` is present (with ≥ 2 entries) and **all four** top-level per-firing fields are absent: `conditions`, `size`, `take_profit`, `stop_loss`. Brackets in tranches mode live on each `Tranche`, not on the parent rule.
  - A rule that carries `tranches` together with **any** of top-level `conditions`, `size`, `take_profit`, or `stop_loss` is rejected with `entry_mode_conflict`. (The `path` on the error points at the conflicting top-level field, so authors can fix the specific offender.)
  - A rule that carries neither classic-mode fields nor `tranches` is rejected with `entry_mode_missing`.
  - A `tranches` array with fewer than 2 entries is rejected with `tranches_too_few`; a tranche missing its own `conditions` or `size` is rejected with `tranche_missing_fields` (these are structural-shape errors, raised in addition to / instead of the mode-exclusivity codes above).
- **(2.2) Per-Leg scope.** All entry/exit/tranche rules above (mode exclusivity, Expr validation, bracket and indicator-registry rules) apply **independently to each Leg** in `legs[]`. A Leg is structurally identical to a 2.1 single-asset strategy body (§3.1.2), so the validator walks each Leg with the same rule set and reports errors with a `path` rooted at that Leg (e.g. `/legs/1/entry/long/size/pct`).
- **(2.2) Legs.** `legs` must contain ≥ 1 entry (`legs_empty`), and every Leg's `asset` must be distinct (`duplicate_leg_asset`) — the venue maintains at most one position per `(account, asset)`, so two Legs on one asset would corrupt each other's lifecycle (§8.7).
- **(2.2) Allocation.** `allocation.strategy_fraction` must be an **integer** in (0, 100] (`strategy_fraction_out_of_range`); each individual `allocation.weights[].pct` must be an **integer** in (0, 100] (`allocation_weight_out_of_range`), checked **per element and independently of the sum** — a negative or >100 weight that still sums to 100 with a sibling otherwise produces an undefined/negative `leg_capital` (§4.6); the integer `allocation.weights[]` pcts must sum to **exactly** 100 (`allocation_weights_sum_invalid`). Integer weights are deliberate: they remove the IEEE-754 "does `33.33 × 3` equal `100.0`?" non-determinism (different summation orders / float widths across the JS validator, Python compute, and Rust core could otherwise disagree on the same input) and are friendlier for the LLM author to emit. Finally, the set of weight assets must correspond 1:1 with `legs[].asset` — no weight without a Leg, no Leg without a weight, **and no asset appearing in `weights[]` more than once** (a duplicate weight asset breaks the 1:1 correspondence and fires `allocation_weights_mismatch`).
- **(2.2) Portfolio Exit.** If `portfolio_exit` is present it must declare at least one of `equity_take_profit` / `equity_stop_loss`, and each present block at least one of `pct` / `usd` (`portfolio_exit_empty`); every declared threshold must be > 0, and `equity_stop_loss.pct` must additionally be < 100 (`portfolio_exit_threshold_out_of_range`) — a stop at ≥ 100% requires `E(t) ≤ 0` and so can never fire before liquidation. `equity_take_profit.pct` has no upper bound. It references no indicators — it is equity-only by construction (§4.10).

---

## 6. Worked examples

> **Reading these under 2.2.** Examples 6.1–6.6 are single-asset strategies in **2.1 shape**. The **Leg** schema (§3.1.2) is only the `{ asset, leverage, margin_mode, entry, exit }` subset of each block — the top-level `dsl_version`, `name`, and `description` are **strategy-level** (envelope) fields, *not* Leg fields, and `size: { type: "percent_equity" }` is the retired 2.1 sizing. To turn one of these into a complete **2.2 Portfolio Strategy**: lift `name` / `description` to the envelope (set `dsl_version: "2.2"` there), move the `{ asset, leverage, margin_mode, entry, exit }` subset into one entry of `legs[]`, change each `size` to `percent_allocation`, and add `allocation` (+ optional `portfolio_exit`) — i.e. `{ dsl_version: "2.2", name, description, allocation, legs: [ { asset, leverage, margin_mode, entry, exit } ], portfolio_exit? }`. **§6.7 shows a complete, idiomatic 2.2 multi-leg strategy** with allocation and a Portfolio Exit.

### 6.1 Long+short mean reversion

Long when 1h RSI is oversold; short when 1h RSI is overbought. Auto-reverse on opposite-side signal handles position flips. This is the canonical use case for v2's side-tagged entries, which v1 cannot express in a single DSL.

```json
{
  "dsl_version": "2.1",
  "name": "BTC RSI Mean Reversion (long+short)",
  "description": "Long when RSI(14) < 30 on 1h. Short when RSI(14) > 70 on 1h.",
  "asset": "BTC",
  "leverage": 3,
  "margin_mode": "cross",
  "entry": {
    "long": {
      "conditions": {
        "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
        "operator": "less_than",
        "right": { "type": "value", "value": 30 },
        "timeframe": "1h"
      },
      "size": { "type": "percent_equity", "pct": 100 },
      "take_profit": { "pct": 3 },
      "stop_loss": { "pct": 2 }
    },
    "short": {
      "conditions": {
        "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
        "operator": "greater_than",
        "right": { "type": "value", "value": 70 },
        "timeframe": "1h"
      },
      "size": { "type": "percent_equity", "pct": 100 },
      "take_profit": { "pct": 3 },
      "stop_loss": { "pct": 2 }
    }
  },

  "exit": {}
}
```

### 6.2 Multi-timeframe — daily trend filter + 1h entry signal

Long when 1h RSI is oversold, gated by a daily-resolution trend filter. The 1h atom evaluates on every 1h close. The 1d atom reads the most-recent-closed 1d candle; its truth value changes only at daily candle closes. v1 cannot express this — its single `trigger` field forces a single timeframe across the whole strategy.

```json
{
  "dsl_version": "2.1",
  "name": "Trend-Filtered RSI Bounce",
  "description": "Long on 1h RSI<30 only when the most recent daily close is above the 1d 200-SMA.",
  "asset": "BTC",
  "leverage": 5,
  "margin_mode": "cross",
  "entry": {
    "long": {
      "conditions": {
        "all_of": [
          {
            "left": { "type": "price", "field": "close" },
            "operator": "greater_than",
            "right": { "type": "indicator", "name": "sma", "params": { "period": 200 } },
            "timeframe": "1d"
          },
          {
            "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
            "operator": "less_than",
            "right": { "type": "value", "value": 30 },
            "timeframe": "1h"
          }
        ]
      },
      "size": { "type": "percent_equity", "pct": 50 },
      "take_profit": { "pct": 4 },
      "stop_loss": { "pct": 2 }
    }
  },

  "exit": {}
}
```

Effective trigger: `min(1d, 1h) = 1h`. The strategy re-evaluates every 1h close. The 1d filter atom uses the daily candle's most-recent close and its 200-day SMA — both evaluated at daily resolution. The filter changes once per day; the 1h signal changes every hour.

### 6.3 OR within a rule (DNF in one entry)

Two entry pathways combined with OR — each pathway is its own AND-group. Single rule, depth-2 conditions tree. v1's flat AND-only conditions cannot express this without splitting into two strategies.

```json
{
  "dsl_version": "2.1",
  "name": "Two-Signal Long Entry",
  "description": "Long when (RSI oversold AND short-term volatility expanding) OR (price breaks above 24-bar high AND MACD bullish).",
  "asset": "BTC",
  "leverage": 2,
  "margin_mode": "cross",
  "entry": {
    "long": {
      "conditions": {
        "any_of": [
          {
            "all_of": [
              {
                "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
                "operator": "less_than",
                "right": { "type": "value", "value": 30 },
                "timeframe": "1h"
              },
              {
                "left": { "type": "indicator", "name": "atr", "params": { "period": 14 } },
                "operator": "crossed_above",
                "right": { "type": "indicator", "name": "atr", "params": { "period": 28 } },
                "timeframe": "1h"
              }
            ]
          },
          {
            "all_of": [
              {
                "left": { "type": "price", "field": "close" },
                "operator": "crossed_above",
                "right": {
                  "type": "lookback",
                  "function": "highest",
                  "source": "high",
                  "period": 24,
                  "multiplier": 1.0
                },
                "timeframe": "1h"
              },
              {
                "left": {
                  "type": "indicator",
                  "name": "macd",
                  "params": { "fast": 12, "slow": 26, "signal": 9 },
                  "attribute": "histogram"
                },
                "operator": "greater_than",
                "right": { "type": "value", "value": 0 },
                "timeframe": "1h"
              }
            ]
          }
        ]
      },
      "size": { "type": "percent_equity", "pct": 100 },
      "stop_loss": { "pct": 3 }
    }
  },

  "exit": {}
}
```

### 6.4 Conditional exit without reversal

Enter long on EMA crossover. Close the long when RSI gets overbought — without going short. v1's exit conditions apply to the only direction, so this works in v1 in spirit, but v2 makes the side semantics explicit.

```json
{
  "dsl_version": "2.1",
  "name": "EMA Cross with Conditional Exit",
  "description": "Long on EMA(9) crossing above EMA(21). Close long on RSI>70 (no reversal).",
  "asset": "ETH",
  "leverage": 3,
  "margin_mode": "cross",
  "entry": {
    "long": {
      "conditions": {
        "left": { "type": "indicator", "name": "ema", "params": { "period": 9 } },
        "operator": "crossed_above",
        "right": { "type": "indicator", "name": "ema", "params": { "period": 21 } },
        "timeframe": "1h"
      },
      "size": { "type": "percent_equity", "pct": 100 },
      "stop_loss": { "pct": 4 }
    }
  },

  "exit": {
    "long": {
      "conditions": {
        "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
        "operator": "greater_than",
        "right": { "type": "value", "value": 70 },
        "timeframe": "1h"
      }
    }
  }
}
```

The `exit.long` rule closes the long without opening a short. To make this a reversal strategy, add an `entry.short` rule with the same conditions; the auto-reverse machinery handles closing the long and opening the short in one tick.

### 6.5 Depth-3 mixed DNF — oversold-bounce OR breakout, both with confirmation

Two pathways to long entry, each requiring a confirmation signal: (oversold: RSI extreme OR price below Bollinger lower) confirmed by uptrend (close above 200-EMA), OR (breakout: price above 24-bar high OR MACD bullish histogram) confirmed by expanding volatility (ATR(14) crossed above ATR(28)). The whole tree is depth 3 — top `any_of`, each disjunct an `all_of`, each `all_of`'s first child is itself an `any_of`. This is the canonical case the §3.4 depth-3 cap was raised to express.

```json
{
  "dsl_version": "2.1",
  "name": "Two-Setup Long with Confirmation",
  "description": "Long when (oversold: RSI<30 OR price<BB lower) AND uptrend (close>EMA200), OR when (breakout: price>24-bar high OR MACD bullish) AND expanding volatility.",
  "asset": "BTC",
  "leverage": 3,
  "margin_mode": "cross",
  "entry": {
    "long": {
      "conditions": {
        "any_of": [
          {
            "all_of": [
              {
                "any_of": [
                  {
                    "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
                    "operator": "less_than",
                    "right": { "type": "value", "value": 30 },
                    "timeframe": "1h"
                  },
                  {
                    "left": { "type": "price", "field": "close" },
                    "operator": "less_than",
                    "right": {
                      "type": "indicator",
                      "name": "bollinger",
                      "params": { "period": 20, "num_std": 2 },
                      "attribute": "lower"
                    },
                    "timeframe": "1h"
                  }
                ]
              },
              {
                "left": { "type": "price", "field": "close" },
                "operator": "greater_than",
                "right": { "type": "indicator", "name": "ema", "params": { "period": 200 } },
                "timeframe": "1h"
              }
            ]
          },
          {
            "all_of": [
              {
                "any_of": [
                  {
                    "left": { "type": "price", "field": "close" },
                    "operator": "crossed_above",
                    "right": {
                      "type": "lookback",
                      "function": "highest",
                      "source": "high",
                      "period": 24,
                      "multiplier": 1.0
                    },
                    "timeframe": "1h"
                  },
                  {
                    "left": {
                      "type": "indicator",
                      "name": "macd",
                      "params": { "fast": 12, "slow": 26, "signal": 9 },
                      "attribute": "histogram"
                    },
                    "operator": "greater_than",
                    "right": { "type": "value", "value": 0 },
                    "timeframe": "1h"
                  }
                ]
              },
              {
                "left": { "type": "indicator", "name": "atr", "params": { "period": 14 } },
                "operator": "crossed_above",
                "right": { "type": "indicator", "name": "atr", "params": { "period": 28 } },
                "timeframe": "1h"
              }
            ]
          }
        ]
      },
      "size": { "type": "percent_equity", "pct": 100 },
      "take_profit": { "pct": 4 },
      "stop_loss": { "pct": 2 }
    }
  },

  "exit": {}
}
```

Depth check: each inner `any_of` has depth 1 (atoms are depth 0). Each `all_of` has depth `1 + max(0, 1) = 2`. Top `any_of` has depth `1 + 2 = 3` — at the cap.

### 6.6 Pyramiding / staged entry using tranches

Scales into a long position via two independent tranches, each with its own entry threshold and independent take-profit / stop-loss bracket.

```json
{
  "dsl_version": "2.1",
  "name": "Staged RSI pyramiding long",
  "description": "Scales into BTC long positions using two independent tranches on RSI oversold signals.",
  "asset": "BTC",
  "leverage": 3,
  "margin_mode": "cross",
  "entry": {
    "long": {
      "tranches": [
        {
          "conditions": {
            "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
            "operator": "less_than",
            "right": { "type": "value", "value": 35 },
            "timeframe": "1h"
          },
          "size": { "type": "percent_equity", "pct": 30 },
          "take_profit": { "pct": 5 },
          "stop_loss": { "pct": 1.5 }
        },
        {
          "conditions": {
            "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
            "operator": "less_than",
            "right": { "type": "value", "value": 25 },
            "timeframe": "1h"
          },
          "size": { "type": "percent_equity", "pct": 70 },
          "take_profit": { "pct": 10 },
          "stop_loss": { "pct": 2 }
        }
      ]
    }
  },
  "exit": {
    "long": {
      "conditions": {
        "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
        "operator": "greater_than",
        "right": { "type": "value", "value": 70 },
        "timeframe": "1h"
      }
    }
  }
}
```

### 6.7 Multi-leg Portfolio Strategy with allocation + Portfolio Exit (2.2)

A two-Leg crypto portfolio: a BTC RSI mean-reversion Leg and an ETH EMA-crossover trend Leg. The strategy uses 50% of account equity, split 60/40 BTC/ETH. A Portfolio Exit closes everything and terminates the deployment when aggregate allocated equity gains 5% or loses 10%. Because the majority allocated-capital class is crypto, the backtest **Baseline** is BTC buy-and-hold (`architecture-docs.md §4.1.2`). Each Leg's `size` is `percent_allocation` against that Leg's own slice; `100` means "deploy the whole Leg slice on a fill."

```json
{
  "dsl_version": "2.2",
  "name": "BTC/ETH dual-signal portfolio",
  "description": "BTC RSI mean-reversion (60%) + ETH EMA-cross trend (40%), 50% of account, exit all at +5% / -10% aggregate.",
  "allocation": {
    "strategy_fraction": 50,
    "weights": [
      { "asset": "BTC", "pct": 60 },
      { "asset": "ETH", "pct": 40 }
    ]
  },
  "legs": [
    {
      "asset": "BTC",
      "leverage": 3,
      "margin_mode": "cross",
      "entry": {
        "long": {
          "conditions": {
            "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
            "operator": "less_than",
            "right": { "type": "value", "value": 30 },
            "timeframe": "1h"
          },
          "size": { "type": "percent_allocation", "pct": 100 },
          "take_profit": { "pct": 4 },
          "stop_loss": { "pct": 3 }
        }
      },
      "exit": {}
    },
    {
      "asset": "ETH",
      "leverage": 2,
      "margin_mode": "cross",
      "entry": {
        "long": {
          "conditions": {
            "left": { "type": "indicator", "name": "ema", "params": { "period": 9 } },
            "operator": "crossed_above",
            "right": { "type": "indicator", "name": "ema", "params": { "period": 21 } },
            "timeframe": "4h"
          },
          "size": { "type": "percent_allocation", "pct": 100 }
        }
      },
      "exit": {
        "long": {
          "conditions": {
            "left": { "type": "indicator", "name": "ema", "params": { "period": 9 } },
            "operator": "crossed_below",
            "right": { "type": "indicator", "name": "ema", "params": { "period": 21 } },
            "timeframe": "4h"
          }
        }
      }
    }
  ],
  "portfolio_exit": {
    "equity_take_profit": { "pct": 5 },
    "equity_stop_loss": { "pct": 10 }
  }
}
```

This single strategy replaces what 2.1 would have expressed as two unrelated single-asset strategies with no shared capital plan and no combined exit. The BTC Leg uses a bracket (TP/SL on its own position); the ETH Leg uses a conditional exit (EMA cross-down). The Portfolio Exit sits above both: if combined equity hits +5% or −10% it flattens both Legs at that bar and stops the deployment, overriding the BTC bracket and the ETH exit rule (§4.10).

### 6.8 Macro-gated entry (2.3)

Long BTC on a 1h RSI bounce, but **only while the macro regime is risk-on**: annual CPI cooling below 3% **and** the Fed Funds Rate at or below 4.5%. The two macro atoms read the most-recent-released CPI and rate prints (§4.11); the RSI atom drives the 1h entry timing. v2.2 could not express any macro gate.

```json
{
  "dsl_version": "2.3",
  "name": "BTC RSI bounce, macro risk-on gate",
  "description": "Long BTC on 1h RSI<30 only when CPI(YoY) < 3% and Fed Funds Rate <= 4.5%.",
  "allocation": {
    "strategy_fraction": 100,
    "weights": [{ "asset": "BTC", "pct": 100 }]
  },
  "legs": [
    {
      "asset": "BTC",
      "leverage": 3,
      "margin_mode": "cross",
      "entry": {
        "long": {
          "conditions": {
            "all_of": [
              {
                "left": { "type": "indicator", "name": "rsi", "params": { "period": 14 } },
                "operator": "less_than",
                "right": { "type": "value", "value": 30 },
                "timeframe": "1h"
              },
              {
                "left": { "type": "macro", "key": "cpi_yy" },
                "operator": "less_than",
                "right": { "type": "value", "value": 3 },
                "timeframe": "1h"
              },
              {
                "left": { "type": "macro", "key": "interest_rate" },
                "operator": "less_than_or_equal",
                "right": { "type": "value", "value": 4.5 },
                "timeframe": "1h"
              }
            ]
          },
          "size": { "type": "percent_allocation", "pct": 100 },
          "take_profit": { "pct": 5 },
          "stop_loss": { "pct": 3 }
        }
      },
      "exit": {}
    }
  ]
}
```

Effective trigger: `min(1h) = 1h`. The RSI atom re-evaluates every 1h close; the two `macro` atoms re-evaluate every hour too but their values only step when a new CPI / rate print is released (§4.11). Before the first CPI or rate release in the backtest window the corresponding macro atom is undefined → the `all_of` is FALSE (no entry), per §4.9. The macro series are exogenous and shared — the same gate could be applied identically to every Leg of a multi-asset portfolio without introducing a cross-asset dependency (§3.6, §7.7).

---

## 7. Decisions and rationale

This section captures the design choices that shape the schema, including the alternatives considered and why each was rejected. Where v1 made a different choice, the rationale explicitly references it.

**Summary (quick reference). For the full reasoning behind each decision, see the corresponding subsection.**

| # | Decision | Section |
|---|---|---|
| 1 | Auto-reverse on opposite-side entry | §7.1 |
| 2 | Per-Leg conditional `exit` per side, no shared "any-side" (per-Leg in 2.2) | §7.2 |
| 3 | Recursive boolean tree, depth ≤ 3 | §7.3 |
| 4 | Per-Leg `leverage` (one knob per Leg; strategy-level in 2.1, revised in 2.2) | §7.4 |
| 5 | Support pyramiding and staged entries via Tranches; defer partial close, time stops, hedge mode | §7.5 |
| 6 | No per-trade risk block; aggregate one-shot equity cap via Portfolio Exit (§4.10), running caps out of scope | §7.6 |
| 7 | Single asset **per Leg**; a Strategy holds 1..N Legs (single-asset-only in 2.1, revised in 2.2) | §7.7 |
| 8 | At most one entry rule per side, at most one exit rule per side (`entry: { long?, short? }`, `exit: { long?, short? }`) | §7.8 |
| 9 | Trailing stop deferred (not in v2 bracket schema) | §7.9 |

### 7.1 Position lifecycle — auto-reverse on opposite-side entry

**Question:** When a long position is open and a `side: short` entry rule fires, what happens?

**Options considered:**

- **A. Auto-reverse** — engine closes long and opens short in the same tick; opposite-side entry IS the exit.
- **B. Strict — opposite entry ignored while in position** — author must explicitly exit long first.
- **C. Explicit per-side exits** — no auto-close; author writes a long_exit rule with the same conditions as the short_entry rule.
- **D. Hybrid + config flag** — auto-reverse with `on_opposite_entry: 'reverse' | 'ignore'`.

**Chose A.**

**Why over v1:** v1 has a single direction; the question doesn't arise. v2 introduces it because side-tagged entries make opposite-side transitions explicit.

**Why A over B:** B forces every reversal strategy to write redundant exit logic. Natural-language descriptions like "go long when X, go short when Y" *imply* reversal; B makes the user invent a separate exit condition that almost always restates the entry condition.

**Why A over C:** Same reason — duplication. C is the most explicit but doubles the LLM's burden when a strategy is a simple reversal pair.

**Why A over D:** Adds surface area without proven need. A future "ignore" mode can be added as a config flag without breaking existing strategies.

**Trade-off accepted:** A loses the "close without reversing" capability *via opposite entries*. That capability is preserved through the conditional `exit` map (§7.2).

### 7.2 Conditional exits — strategy-level, per-side

> **Revised in 2.2 — now per-Leg.** The "strategy-level" framing below is the 2.1 decision; under 2.2 a strategy is a Portfolio Strategy of Legs, so the `exit` object and its per-side conditional exits live **on each Leg** (§3.1.2). The strategy-wide exit construct in 2.2 is the equity-only **Portfolio Exit** (§4.10), which is distinct from these indicator-based per-Leg conditional exits.

**Question:** With per-rule brackets handling price-based exits and auto-reverse handling opposite-side flips, how do users express "close without reversing" conditions (e.g., "exit long when RSI > 50, but don't go short")?

**Options considered:**

- **A. Drop conditional exits entirely.** All non-bracket closes must be opposite-side entries. Doesn't work — "close without going short" is inexpressible.
- **B. Strategy-level per-side `exit` map: `{ long?, short? }`.** One conditional exit per side at most.
- **C. Per-entry `exit_conditions` inside each entry rule.** Most precise, most verbose.

**Chose B.**

**Why over v1:** v1 has `exit.conditions` as a flat AND list applied uniformly to whatever direction the strategy supports. v2's per-side exit map cleanly pairs the long entry with a long exit and the short entry with a short exit — symmetric with the entry shape.

**Why B over C:** Under the cap of one rule per side (§7.8), the rule and the side are the same unit — there's no "different long_entry rules" for an exit to specialize on. Per-side at the strategy level is the natural granularity.

**No "any-side" exit:** Considered for symmetric closes ("close any open position when X") but dropped. Time-of-day exits are out of scope, and the few real symmetric cases can be expressed by declaring both `exit.long` and `exit.short` with the same conditions.

### 7.3 Boolean logic — recursive tree, depth ≤ 3

**Question:** How should condition logic be structured?

**Options considered:**

- **A. Flat AND-only** — each rule's conditions is a flat AND list; multiple `entries` with the same `side` = OR. (v1's model.)
- **B. Recursive boolean expression tree** with `all_of` / `any_of`, unbounded depth.
- **C. Two-level: top AND, leaves can be `any_of`** (CNF-only, no DNF in one rule).
- **B with depth ≤ 3** — recursive `all_of` / `any_of`, depth bounded.

**Chose B with depth ≤ 3.**

**Why over v1 (option A):** A explodes combinatorially. `(A∨B) ∧ C` needs 2 rules; `(A∨B) ∧ (C∨D)` needs 4. Repetitive JSON; the rule abstraction loses meaning (each rule becomes a synonym for "term in DNF").

**Why bounded recursive over C:** C is asymmetric (top AND, leaves OR-only) and cannot express DNF in a single rule. `(A∧B) ∨ (C∧D)` requires two separate rules under C, forcing the multi-rule duplication pattern again.

**Why bounded depth (≤ 3):** Unbounded recursion is a foot-gun for both authors and validators. Depth 3 covers DNF, CNF, mixed atom-and-group expressions, and nested-DNF patterns like `((A∨B)∧C) ∨ ((D∨E)∧F)` — empirically every threshold/crossover/filter strategy this DSL targets. Strategies that need deeper nesting are advanced enough to warrant a code-mode escape hatch (Python authoring). See §6.5 for a depth-3 worked example.

**Industry precedent:** Recursive expression trees are standard across MongoDB (`$and` / `$or`), Elasticsearch (`bool: { must, should }`), Hasura/PostgREST (`_and` / `_or`), JSONLogic, and GraphQL. Bounded depth in practice is a recognized validator pattern.

### 7.4 Leverage — strategy-level single knob

> **Revised in 2.2 — now per-Leg.** The single-knob rationale below was correct for a single-asset strategy but does not survive multi-leg: different assets in one portfolio carry different risk (e.g. 3× on BTC, 1× on a memecoin leg). `leverage` moves to the **Leg** (§3.1.2). It remains a single knob *within* a Leg — still one value applied to every order on that Leg, not per-rule.

**Question:** Should leverage be per-rule or strategy-level?

**Chose strategy-level.**

**Why over v1:** v1 has no `leverage` field at all — exchange interactions assume the deployment's leverage. v2 makes leverage explicit so the strategy declares its risk intent.

**Why strategy-level vs per-rule:** Under the locked invariants (§4.5 side-exclusivity — never both long and short simultaneously — combined with classic mode's single-position-per-side and tranches mode's per-side accumulation against a *shared* margin budget), per-rule leverage is a redundant degree of freedom. Two configurations with the same notional differ only in the amount of collateral tied up as initial margin — they are otherwise economically identical.

Worked example. Compare Config A: 10% of $1,000 equity at 10× leverage ($100 margin, $1,000 notional) vs. Config B: 20% of $1,000 equity at 5× leverage ($200 margin, $1,000 notional):

| | Config A (10×) | Config B (5×) |
|---|---|---|
| Notional | $1,000 | $1,000 |
| P&L per 1% adverse move | -$10 | -$10 |
| Funding paid | same | same |
| Fees paid | same | same |
| Liquidation price (cross margin) | same | same |
| Initial margin tied up | $100 | $200 |

The only difference is collateral usage (how much equity is reserved as initial margin). In the single-asset framing of this 2.1 decision, the strategy was the only consumer of that equity, so collateral efficiency was operationally moot. *(2.2 note: a Portfolio Strategy's Legs share one account, so collateral is no longer single-consumer — under cross margin Legs contend for it, §3.1.1/§4.6/§8.7. The per-Leg-leverage decision, §7.4 banner, supersedes the single-knob conclusion below.)*

**Why liquidation is the same (cross margin):** On Hyperliquid (cross margin) the liquidation price is independent of the leverage setting for a position with a given notional. The leverage parameter only affects the initial margin requirement at open time; once open, the position's liquidation trigger is determined by total account equity vs. maintenance margin on the notional. (Source: Hyperliquid docs — "The actual liquidation price is independent on the leverage set for cross margin positions. A cross margin position at lower leverage simply uses more collateral.")

**Under isolated margin**, leverage *does* affect liquidation distance: the released initial margin is the only collateral, so higher leverage tightens the liquidation buffer. Strategies that need this mode (e.g., HIP-3 markets that require it) declare it via the per-Leg `margin_mode` field (§3.1.2, §4.6); the same `leverage` knob then carries strategy intent end-to-end.

**Why one knob still suffices** — under either margin mode:

- **Under cross margin**, per-rule leverage is fully redundant. Liquidation is independent of leverage, so any `(size, leverage)` pair with the same notional is economically identical. Adjusting `size` reproduces any per-rule leverage choice.
- **Under isolated margin**, per-rule leverage is *not* strictly redundant — leverage affects liquidation distance independently of `size`. But the §4.5 side-exclusivity invariant and §7.8 (one entry rule per side) already mean a strategy is only ever long-or-short-or-flat at any moment (in classic mode: exactly one position; in tranches mode: a stack of same-side positions sharing the strategy's leverage), and the dominant long+short pattern (reversal pairs sharing the same edge) naturally wants symmetric leverage. Strategies that *genuinely* require asymmetric per-side leverage are different strategies — same argument as §7.8 — and deploy as separate strategies, each with its own backtest history and marketplace identity.

Per-rule leverage would therefore add a knob with marginal expressive power, validator gating on `margin_mode`, and awkward auto-reverse semantics ("reverse from 10× long to 3× short" — what does that mean for the cancel-then-place sequence?). Collapsing to one strategy-level knob is simpler and aligns with the §7.8 "different risk profile = different strategy" cap.

**Field name:** `leverage`, not `max_leverage`. The strategy declares the leverage every order uses.

### 7.5 Support pyramiding and staged entries via Tranches

**Question:** How should the DSL support pyramiding, staged entries, and multi-position accumulation?

**Chose: implement Tranches mode; defer partial-close / scale-out, time stops, and hedge mode.**

**Why:**

- **Tranches mode** adds per-side multi-entry semantics: each tranche has independent entry conditions and an independent bracket (TP/SL), so engines avoid weighted-average position arithmetic and treat each tranche as a self-contained order block on the entry side. The cost is new state (an `entered` registry per side, per-tranche position accounting per §4.2.2) and new same-candle ordering rules (§4.7). **The exit rule remains per-side and closes all open tranches simultaneously (§4.3)** — the simplification is on the entry and bracket sides, not on the exit side; this preserves the existing side-level exit contract.
- **Partial close / scale-out** requires a fractional-quantity decision model and breaks the single-bracket invariant. Multiple TPs with size fractions is a different runtime model and is deferred.
- **Time stops** require timer state per position (separate from candle close), which doesn't fit the candle-driven evaluation model and is deferred.
- **Hedge mode** (simultaneous long + short on the same asset) breaks the §4.5 side-exclusivity invariant and venue-side margining assumptions; deferred.

For everything still deferred, the escape hatch is code mode.

### 7.6 No risk block in the DSL

> **2.2 note.** `leverage` is now per-Leg (§7.4), and 2.2 *does* add one aggregate risk control the 2.1 decision below excluded: the equity-only **Portfolio Exit** (§4.10), a one-shot strategy-wide TP/SL. Running risk caps (e.g. `max_drawdown_pct`) remain deferred (§8.1). The "no risk block" reasoning below otherwise stands.

**Question:** What goes in a strategy-level risk block beyond `leverage`?

**Options considered:**

- **A. Only `leverage` (at top level, not in a `risk` block).**
- **B. DSL declares strategy-level intent — `leverage`, `max_daily_loss_pct`, `max_drawdown_pct`.**
- **C. Everything — including `fee_bps`, `slippage_bps`.**

**Chose A — no risk block. `leverage` lives at top level.**

**Why per-trade risk doesn't need explicit fields:** Per-trade risk is fully captured by existing fields:
```
risk_per_trade = size × leverage × stop_loss.pct
```
All three are in the schema. Adding a `max_loss_per_trade` field would be redundant.

**Why aggregate caps are deferred:**

Aggregate caps (e.g., `max_drawdown_pct`, `max_daily_loss_pct`) are legitimate strategy intent — the author can reasonably want to declare "this strategy targets no more than X% drawdown." They're not in v2 because:

1. **Scope.** Aggregate caps are meta-rules over *streams of trades*, not derivable from any single trade's parameters. Adding them requires runtime state tracking (running drawdown, day-bucketed P&L) that's a layer above the per-tick rule evaluation v2 specifies.
2. **`max_daily_loss_pct` has a definitional problem.** "Daily" is wall-clock, but the DSL is candle-driven. A 1m strategy and a 1d strategy mean very different things by "daily" — until "daily" is resolved against the strategy's timeframe model, the field can't be added cleanly.
3. **`max_drawdown_pct` is more tractable** but still requires running-state semantics that v2 deliberately avoids.

Both are tracked as future work in §8.1. v2 ships without them to keep the schema and runtime contract minimal.

**Why `fee_bps` / `slippage_bps` are dropped:** They describe the *venue*, not the *strategy*. Environmental backtest params, not strategy intent.

### 7.7 Single asset

> **Superseded in 2.2 — but only at the wrapper level.** This decision still holds *per Leg*: a Leg declares one `asset: string`, and the "single position lineage per unit" invariant is preserved. What changed: a **Strategy** now wraps 1..N Legs (§3.1.1). Crucially, the original rejection rationale still stands — multi-asset arrays buy *no expressive power* (no cross-asset operands; cross-asset signals remain a separate future surface, per the trade-off note below). The 2.2 reversal is justified on a *different* axis: portfolio-level product UX (one strategy, one combined backtest, one Baseline) and explicit cross-leg capital Allocation — not expressiveness.

**Question:** Should the DSL declare one asset (`asset: string`) or a list of assets (`assets: string[]`)?

**Chose single string.**

**Why over v1:** v1 has `assets: string[]` (an array). v2 narrows to a single asset.

**Why single over array:**

1. **The "single position at a time" invariant becomes truly single-axis.** With an array, the invariant would be per-(strategy, asset) — multiplying state and complicating audit, brackets, and reversal lineage. With a string, the invariant is per-strategy.
2. **An array doesn't enable cross-asset signals.** Multi-asset arrays are "apply the same logic N times," not "compose signals across assets." Cross-asset rules would require explicit cross-asset operands, which the DSL doesn't have. So arrays bought no expressive power — only deployment-time convenience.
3. **One strategy = one asset = one position lineage** is a cleaner mental model. Users who want the same logic across N assets duplicate the strategy N times.

**Trade-off accepted:** Real strategy patterns that are inherently multi-asset (relative strength, basket rebalancing, pairs trading) are inexpressible. These belong to a different authoring surface.

### 7.8 At most one entry and one exit per side

**Question:** Should a strategy be allowed to declare multiple entry rules per side (e.g., 3 different long entries with different brackets)?

**Options considered:**

- **A. Allow multiple per side.** `entries: EntryRule[]`, side-tagged; multiple long entries with different brackets in one DSL.
- **B. Cap to one per side.** `entry: { long?, short? }` and `exit: { long?, short? }` as object maps. Side is the key, not a field on the rule.

**Chose B.**

**Why B over A:** The multi-rule shape pairs poorly with the conditional-exit shape. With multiple long entries and one long exit, the exit has no per-rule correspondence — it closes whatever long is open, regardless of which entry rule opened it. Different brackets per entry rule were the main reason to allow multiple, but that flexibility creates ambiguity: when entry rule A opens a position with one bracket and entry rule B's conditions later become true, the LLM and the user both have to reason about which bracket is active and why.

The cap restores a clean correspondence:
- One long entry rule pairs with one long exit rule (or none).
- One short entry rule pairs with one short exit rule (or none).
- The bracket on the entry is the bracket for that side's position. No ambiguity.

**Why structural enforcement (object map) over a validator rule:** The cap is about strategy mental model, not just a numeric limit. Encoding it as object keys (`entry.long` / `entry.short`) makes the constraint visual: there's no place to put a duplicate. A validator rule on an array would catch violations but the schema would still suggest multiplicity is allowed. The object map communicates "one strategy = one setup per side" at a glance.

**Trade-off accepted:** Multi-setup users (e.g., "scalp on RSI<25 + swing on EMA crossover, both long, both targeting BTC") must deploy two strategies instead of combining them in one DSL. This is correct friction — different setups have different risk profiles, deserve separate backtest histories, and align with the marketplace fork-per-blueprint model. The cap pushes "complex multi-setup compositions" out of the DSL into the deployment layer, where it belongs.

**What this changes from earlier drafts:** Earlier drafts had `entries: EntryRule[]` with a side-tag field on each rule, allowing multiple per side. That flexibility was costing more than it bought once "multi-setup with different brackets" was examined as a real authoring pattern. The cap simplifies the schema, the LLM authoring surface, and the runtime contract simultaneously.

**Tranches mode (§7.5) is the structured exception.** Multiple entries per side are allowed *when bundled inside a single entry rule's `tranches[]` array* with explicit per-tranche bracket scope. The "which bracket is active?" ambiguity from option A above does not arise because each tranche's bracket is locally scoped to that tranche's own fill (§4.4): there is no global side-level question of which bracket applies. Independent entry-rule blocks on the same side (`entries: [...]` with two long rules) remain forbidden — the entry-rule-as-unit cap is preserved; the new flexibility lives one level down, inside a single rule's `tranches[]`.

### 7.9 Trailing stop deferred

**Chose: not in v2's bracket schema.**

**Why:** The hard requirement is exchange-native bracket execution (§4.4). Hyperliquid — the currently-supported venue — does not natively support trailing stops ([Hyperliquid order types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types)). Shipping the field anyway would mean strategies pass validation but fail at deploy time. **Re-add when** an exchange that supports trailing stops natively is added (e.g., Binance Futures' `TRAILING_STOP_MARKET`, which takes `activatePrice` + `callbackRate`); the right schema then is a discriminated union carrying both parameters with venue-aware validator gating.

**Trade-off accepted:** Strategies wanting trailing-style behaviour today fall back to fixed `stop_loss`. Real cost; acceptable for v2.

---

## 8. Open questions and future capabilities

These are deferred capabilities, tracked but not in v2 scope. Each can be added without breaking existing v2 strategies.

### 8.1 Aggregate risk caps

> **Partially addressed in 2.2.** The **Portfolio Exit** (§3.1.1) introduces a strategy-wide, equity-only cap (take-profit / stop-loss on aggregate allocated equity) that flattens all Legs and terminates the deployment. This is the simplest aggregate cap: a one-shot threshold, not a running drawdown-from-peak. `max_drawdown_pct` (running peak tracking) and `max_daily_loss_pct` (the "what is daily?" question) remain deferred as below.

Strategy-level caps over streams of trades — `max_drawdown_pct`, and possibly `max_daily_loss_pct` — are deferred for v2.

`max_drawdown_pct` is the more tractable of the two: it's a running-state metric over realized + unrealized P&L from a peak. Adding it requires the runtime to track per-strategy peak equity and trigger a halt when drawdown exceeds the declared cap. This is straightforward to specify but introduces a new class of runtime state that v2 deliberately avoids.

`max_daily_loss_pct` has an open semantic question: "daily" is a wall-clock concept, but the DSL is candle-driven. The same strategy logic can run on 1m candles or 1d candles; a "daily loss cap" means very different things in each case. Before the field can be added, the spec needs to define what "daily" means — UTC midnight bucketing, rolling 24h, candle-day, or something else. v2 punts on this.

Both fields are reasonable future additions and would not break existing strategies (each is an optional new field on the top level).

### 8.2 Volume-derived indicators

Raw bar volume is supported in v2 via the `volume` indicator (§3.7). Volume-derived indicators — OBV, AD, MFI, VWAP, and indicator-of-indicator compositions like `sma(volume, period=20)` — are deferred. They will be added as named indicators in the registry alongside `volume`, keeping access uniform; volume-as-a-bar-field-operand was considered and rejected in favor of indicator-mediated access. Adding any of these later is non-breaking — they are new registry entries, not new operand types.

### 8.3 Risk-percent sizing

A `risk_pct` sizing mode (size derived from stop-loss distance: `size = risk_amount / sl_distance`) was considered for v2 but deferred. It's a textbook position-sizing rule ("risk 1% of equity per trade"), but it requires a forced cross-field validation — `risk_pct` only makes sense when paired with a `stop_loss`, and without one the engine has no way to compute size.

Adding it later would extend `SizingMode` with a new variant: `{ type: 'risk_pct', pct: number }`, plus a validator rule rejecting `risk_pct` sizing on rules that lack `stop_loss`. No breaking change to existing strategies.

### 8.4 Point-in-time historical operand (divergence)

A `bars_ago` parameter on `indicator` and `price` operands would unblock divergence-style strategies (e.g., "RSI today < RSI 5 bars ago AND price today > price 5 bars ago"). The current operand catalog covers threshold, crossover, breakout, mean-reversion, and regime patterns; divergence is a real but advanced pattern that's not in the v2 scope.

Adding it later would extend the relevant operand types with an optional `bars_ago: number` field (validator-capped, e.g., `≤ 50`, to keep warmup-bar requirements bounded). No breaking change.

### 8.5 Auto-reverse default behaviour

v2 ships with auto-reverse as the only behaviour on opposite-side entry: an opposite-side rule firing closes any open position and opens the new side (§4.2, §7.1). This is correct for explicit-reversal strategies ("go long when X, go short when Y" where reversal is the intent) but surprising for two-independent-setups strategies ("long the dip, short the rip — hold whatever's already open").

**Question:** Should the default be `reverse` (current behaviour) or `ignore` (opposite-side entry skipped while a position is open)? Should there be an explicit `on_opposite_signal: 'reverse' | 'ignore'` field at the strategy level so authors can opt out?

**Recommendation pending usage data.** Track which authoring intent dominates in the first cohort of real strategies; pick the default empirically. Adding the field as additive (default = current behaviour) is non-breaking.

### 8.6 Normative indicator registry per DSL version

§3.7's data-driven registry specifies the param shape and attribute names for each indicator, but does NOT specify the formula (e.g., RSI's averaging method — Wilder vs SMA-of-Δ vs EMA-of-Δ), warmup behaviour during the initial bars, or NaN policy on missing data. Two engines complying with §3.7 can both accept `rsi(14)` and produce different values, which would violate the strategy-scope agreement set in §1.4.

**Future work:** Publish a normative closed indicator registry per DSL version. Each indicator entry includes:

- Formula reference (textbook citation, or a canonical pseudocode block in the spec).
- Closed parameter schema (already in §3.7).
- Output names (already in §3.7).
- Missing-value / NaN policy (e.g., propagate-NaN vs skip-bar).
- First-valid-bar definition (e.g., "RSI first valid at bar `period`; prior bars are NaN").

**When:** After this design is finalized. v2's first iteration ships with the data-driven registry shape (§3.7) and a small canonical indicator set (RSI, EMA, SMA, ATR, MACD, Bollinger, volume). Promoting that set to fully normative — formulas + warmup + NaN — is a follow-up doc and the precondition for adding any new indicator beyond the original seven.

### 8.7 Multiple strategies on the same account

> **Largely resolved in 2.2 (within one Strategy).** The Portfolio Strategy makes multi-asset coexistence a *first-class, intra-strategy* construct: Legs are distinct-asset by validator rule (§5.2), and the **Allocation** partitions capital explicitly, killing the `percent_equity` denominator-sharing problem below. The cross-margin contagion point still stands at the account level. Running multiple *separate* Strategies on one account remains the open part of this question.

**Question:** Should the deployment model support running multiple strategies concurrently on a single venue account? If so, how — and what guarantees does the DSL still hold?

**Working assumption (locked):** If multi-strategy is supported, it is restricted to **distinct assets per strategy** on the same account. Two strategies targeting the same asset on the same account is forbidden by construction — at the venue level, Hyperliquid in one-way mode maintains at most one position per (account, asset), so two strategies attempting to take opposite sides or to overlap their tranche stacks on the same asset would corrupt each other's position lifecycles regardless of which §4.5 mode (classic single-position or tranches per-side accumulation) each one uses.

**What the asset-distinct constraint resolves:**

- Asset conflict — no position-slot competition.
- Margin-mode collision per asset — each asset has at most one strategy.
- Auto-reverse ambiguity — auto-reverse stays within a single strategy.

**What survives the constraint.** Two account-level couplings still apply because they live at the account level, not the asset level:

- **Cross-margin contagion (under cross margin).** All cross-margin positions on the same account share collateral. Strategy A's losing BTC long can liquidate Strategy B's unrelated ETH long. Each strategy's declared `leverage` is non-binding at the account level — realized liquidation depends on aggregate exposure across all live strategies.
- **Account-equity denominator sharing (the former `percent_equity` mode).** Account equity is shared. Three *separate* strategies each sizing 50% of account equity collectively try to size against 150%; one will fail to open, or open at a smaller size than declared. 2.2's **Allocation** solves this *within* one strategy (Legs partition `strategy_fraction`), but across separate strategies on the same account the denominator is still shared — their notional intent is non-binding when account margin is contested.

**Options:**

- **A. Don't support multi-strategy.** One strategy per account, period. Cleanest mental model; per-strategy guarantees hold by construction. Forecloses portfolio-of-strategies authoring (e.g., uncorrelated single-asset strategies sharing one funding source).
- **B. Support via sub-account isolation — one venue sub-account per strategy.** Restores every per-strategy guarantee at the venue level: each sub-account has its own equity, its own margin pool, its own per-asset margin mode. Hyperliquid supports sub-accounts natively, so this is operationally cheap. Recommended default when multi-strategy is supported.
- **C. Support on a flat account with deployment-layer constraints + app-layer accounting.** Acceptable when either:
  - All strategies use `margin_mode: isolated` AND their `strategy_fraction`s are partitioned so they don't share a denominator (the flat account then behaves like sub-accounts), OR
  - The deployment layer performs explicit accounting: enforces `Σ strategy_fraction ≤ 100%` across all active strategies, monitors cross-margin headroom, and accepts the residual contagion risk.
- **D. Encode multi-strategy coordination in the DSL itself.** A new top-level "portfolio strategy" construct that declares cross-strategy invariants (asset disjointness, aggregate equity caps, joint risk rules). Significant scope expansion; out of scope for v2.

**Recommendation pending.** B is the default if multi-strategy is supported. C only when sub-accounts are operationally unavailable and the deployment can do app-layer accounting. A is the conservative fallback. D is deferred indefinitely.

**No DSL change needed for A, B, or C.** The DSL is correctly scoped to "strategy intent in isolation" per §1.4 — multi-strategy coordination lives in the deployment layer regardless of which option is picked. Only D would change the DSL surface.
