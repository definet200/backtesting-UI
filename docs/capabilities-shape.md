# Proposed `GET /capabilities` shape (request to the engine team)

This is the shape the BFF + UI want from `GET /capabilities`. It drives (a) the
agent's system prompt (the allow-list of assets / indicators / macro keys) and
(b) the frontend pickers (asset-class chips, skill chips, data-point chips).
Today the BFF falls back to a hard-coded list + `/health`; this endpoint would
make the pickers and the agent's allow-list 100% engine-driven so the agent can
never invent an unsupported asset.

```jsonc
{
  "version": "0.2.1",

  // Assets grouped by class. `available:false` classes are shown greyed-out
  // in the picker so users see the roadmap but can't select them.
  "asset_classes": [
    {
      "class": "Crypto",
      "available": true,
      "assets": [
        { "symbol": "BTC", "name": "Bitcoin",
          "date_range": { "start": "2017-01-01", "end": "2026-05-31" } }
      ]
    },
    {
      "class": "Commodities",
      "available": true,
      "assets": [
        { "symbol": "xyz:GOLD", "name": "Gold",
          "date_range": { "start": "2026-01-01", "end": "2026-05-31" } }
      ]
    },
    {
      "class": "Indices",
      "available": true,
      "assets": [
        { "symbol": "xyz:SP500", "name": "S&P 500",
          "date_range": { "start": "2026-01-01", "end": "2026-05-31" } }
      ]
    },
    { "class": "US Stocks", "available": false, "assets": [], "note": "no data yet" },
    { "class": "Bonds",     "available": false, "assets": [], "note": "no data yet" }
  ],

  // The indicator registry (§3.7), with the param schema + multi-output
  // attributes so the agent knows MACD needs `attribute`, volume needs `{}`, etc.
  "indicators": [
    { "name": "rsi",        "params": { "period": "int>0" },                    "attributes": [] },
    { "name": "ema",        "params": { "period": "int>0" },                    "attributes": [] },
    { "name": "sma",        "params": { "period": "int>0" },                    "attributes": [] },
    { "name": "atr",        "params": { "period": "int>0" },                    "attributes": [] },
    { "name": "macd",       "params": { "fast": "int>0", "slow": "int>0", "signal": "int>0" }, "attributes": ["macd_line", "signal", "histogram"] },
    { "name": "bollinger",  "params": { "period": "int>0", "num_std": "number>0" }, "attributes": ["upper", "middle", "lower"] },
    { "name": "supertrend", "params": { "period": "int>0", "multiplier": "number>0" }, "attributes": [] },
    { "name": "volume",     "params": {},                                       "attributes": [] }
  ],

  // Supported atom enums (so the agent never emits an unknown operator/timeframe).
  "operators":  ["less_than", "greater_than", "less_than_or_equal", "greater_than_or_equal", "crossed_above", "crossed_below"],
  "timeframes": ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],

  // Macro registry (§3.8) — the `macroIndicatorsAvailable` whitelist, surfaced.
  "macro_keys": [
    { "key": "cpi_yy",                "name": "CPI (YoY)",            "category": "inflation",   "frequency": "monthly",   "unit": "%",
      "date_range": { "start": "2015-01-01", "end": "2026-05-31" } },
    { "key": "interest_rate",         "name": "Fed Funds Rate",       "category": "money",       "frequency": "monthly",   "unit": "%" },
    { "key": "nfp",                   "name": "Non-Farm Payrolls",    "category": "labor_market","frequency": "monthly",   "unit": "K" }
    // … the full 83-key set from macro-indicators.md
  ]
}
```

## Why each field

| Field | Used by | Why |
|---|---|---|
| `asset_classes[].available` + `assets[]` | FE picker + agent allow-list | Only offer/emit assets that can actually be backtested. |
| `assets[].date_range` | BFF | Clamp `date_range` up-front (today we call `GET /api/data-range` per symbol — fine, but having it here saves N calls). |
| `indicators[].params` + `attributes` | agent | Emit valid `params` and required `attribute` (MACD/Bollinger) so we avoid `invalid_attribute` / `invalid_indicator_params`. |
| `operators`, `timeframes` | agent | Stop the model inventing enums. |
| `macro_keys[]` | FE data-point chips + agent | Whitelist so macro operands never fire `macro_indicator_not_available`. |

Until this exists, the BFF keeps using `GET /health` (`available_indicators` + `version`) plus a built-in fallback list — so nothing is blocked, this just removes the hard-coding.
