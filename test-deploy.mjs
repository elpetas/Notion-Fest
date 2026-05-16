// Run: node test-deploy.mjs
// Reads DEPLOY_TRIGGER_SECRET from .env automatically.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env manually (no extra deps needed)
function loadEnv() {
  const envPath = join(__dirname, ".env");
  const lines = readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = loadEnv();
const secret = env.DEPLOY_TRIGGER_SECRET;

if (!secret) {
  console.error("❌  DEPLOY_TRIGGER_SECRET not found in .env");
  process.exit(1);
}

const url = process.argv[2] ?? "https://notion-fest.vercel.app/api/deploy-notion-worker";

console.log(`→  POST ${url}`);
console.log("   (this spins up a Sandbox VM — may take 1-3 minutes)\n");

const start = Date.now();

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  },
});

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const body = await res.json();

console.log(`HTTP ${res.status}  (${elapsed}s)\n`);

if (body.ok) {
  console.log("✅  Worker deployed successfully!\n");
} else {
  console.log("❌  Deploy failed:", body.error, "\n");
}

if (Array.isArray(body.steps)) {
  for (const step of body.steps) {
    const icon = step.exitCode === 0 ? "✓" : "✗";
    console.log(`${icon}  [${step.name}]  exit=${step.exitCode}`);
    if (step.stdout) console.log("   stdout:", step.stdout.slice(-500));
    if (step.stderr && step.exitCode !== 0) console.log("   stderr:", step.stderr.slice(-500));
  }
}
