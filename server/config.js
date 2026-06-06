// Tiny .env loader (avoids a dotenv dependency). Reads KEY=VALUE lines from
// a .env file in the project root, without overriding already-set env vars.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadDotEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv();

export const config = {
  root,
  port: Number(process.env.PORT || 3000),
  engineBaseUrl: (process.env.ENGINE_BASE_URL || 'http://localhost:8000').replace(/\/$/, ''),
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  defaults: {
    initialEquity: Number(process.env.DEFAULT_INITIAL_EQUITY || 10000),
    feeBps: Number(process.env.DEFAULT_FEE_BPS || 5),
    slippageBps: Number(process.env.DEFAULT_SLIPPAGE_BPS || 2),
  },
};
