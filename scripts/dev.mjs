// Single entry point for local dev: `npm run dev` or double-click dev.bat on
// Windows. Before starting anything it runs a preflight pass that:
//   - makes sure apps/api/.venv exists and its deps are installed/up to date
//   - makes sure apps/web/node_modules exists and is up to date
//   - makes sure a root .env exists (seeded from .env.example if missing)
//   - checks whether DATABASE_URL points at something reachable
//   - checks whether AI_API_KEY looks configured (skipped in mock mode)
// Every check prints a clear PASS/WARN/FAIL line — nothing fails silently,
// and a broken DB or API key never looks like a mysterious crash later.
//
// IMPORTANT FOR FUTURE CHANGES: this file (and dev.bat, which just calls it)
// is the single source of truth for "what does a fresh dev machine need."
// Any change with consequences for it — a new dependency, a new required
// env var, a new service, a renamed script — must be reflected here in the
// same change, not left for someone to discover manually. See
// the design notes D023 and the contributing guide's "Development constraints".

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(rootDir, "apps", "api");
const webDir = path.join(rootDir, "apps", "web");
const isWindows = process.platform === "win32";

const COLOR = {
  api: "\x1b[35m",
  web: "\x1b[36m",
  pass: "\x1b[32m",
  warn: "\x1b[33m",
  fail: "\x1b[31m",
  info: "\x1b[90m",
  reset: "\x1b[0m"
};

function status(kind, message) {
  const tag = { pass: "OK  ", warn: "WARN", fail: "FAIL", info: "....", }[kind] ?? "    ";
  const color = COLOR[kind] ?? "";
  console.log(`${color}[${tag}]${COLOR.reset} ${message}`);
}

function log(name, chunk) {
  const text = chunk.toString();
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    console.log(`${COLOR[name]}[${name}]${COLOR.reset} ${line}`);
  }
}

// ---------------------------------------------------------------------------
// .env handling
// ---------------------------------------------------------------------------

function parseEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function ensureEnvFile() {
  const envPath = path.join(rootDir, ".env");
  const examplePath = path.join(rootDir, ".env.example");
  if (existsSync(envPath)) {
    status("pass", ".env exists");
    return parseEnvFile(envPath);
  }
  if (!existsSync(examplePath)) {
    status("fail", "no .env and no .env.example to copy from — cannot continue");
    return {};
  }
  copyFileSync(examplePath, envPath);
  status("warn", ".env was missing — created from .env.example. Fill in AI_API_KEY (and DATABASE_URL if not using docker-compose defaults) before real (non-mock) analyses will work.");
  return parseEnvFile(envPath);
}

// ---------------------------------------------------------------------------
// Dependency install, gated by a content hash so re-runs are fast when
// nothing changed, but automatic the moment pyproject.toml / package-lock
// change.
// ---------------------------------------------------------------------------

function hashFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readStamp(stampPath) {
  try {
    return readFileSync(stampPath, "utf8").trim();
  } catch {
    return null;
  }
}

function findPython() {
  const candidates = isWindows
    ? [["py", ["-3.11"]], ["py", ["-3"]], ["python", []], ["python3", []]]
    : [["python3.11", []], ["python3", []], ["python", []]];
  for (const [command, args] of candidates) {
    const result = spawnSync(command, [...args, "--version"], { encoding: "utf8" });
    if (result.status === 0) {
      return { command, baseArgs: args, version: (result.stdout || result.stderr).trim() };
    }
  }
  return null;
}

function ensureApiEnv() {
  const pyprojectPath = path.join(apiDir, "pyproject.toml");
  if (!existsSync(pyprojectPath)) {
    status("fail", "apps/api/pyproject.toml not found — API cannot start");
    return { ready: false };
  }

  const venvDir = path.join(apiDir, ".venv");
  const venvPython = path.join(venvDir, isWindows ? "Scripts" : "bin", isWindows ? "python.exe" : "python");
  const stampPath = path.join(venvDir, ".deps-stamp");
  const currentHash = hashFile(pyprojectPath);

  if (!existsSync(venvPython)) {
    const python = findPython();
    if (!python) {
      status("fail", "no Python interpreter found (tried python3.11/python3/python) — cannot create apps/api/.venv. Install Python 3.11+ and re-run.");
      return { ready: false };
    }
    if (!python.version.includes("3.11") && !python.version.includes("3.12") && !python.version.includes("3.13")) {
      status("warn", `apps/api/pyproject.toml targets Python >=3.11, found ${python.version}. Creating the venv anyway — no 3.11-only syntax is used, but real deployment should use 3.11+.`);
    }
    status("info", `creating apps/api/.venv with ${python.command}...`);
    mkdirSync(venvDir, { recursive: true });
    const create = spawnSync(python.command, [...python.baseArgs, "-m", "venv", venvDir], { stdio: "inherit" });
    if (create.error) {
      status("fail", `could not run ${python.command} to create the venv: ${create.error.message}`);
      return { ready: false };
    }
    if (create.status !== 0 || !existsSync(venvPython)) {
      status("fail", "failed to create apps/api/.venv — see output above");
      return { ready: false };
    }
  }

  if (readStamp(stampPath) !== currentHash) {
    status("info", "installing/updating API dependencies (apps/api/pyproject.toml changed or venv is new)...");
    const install = spawnSync(venvPython, ["-m", "pip", "install", "-e", ".[dev]"], { cwd: apiDir, stdio: "inherit" });
    if (install.error) {
      status("fail", `could not run pip inside apps/api/.venv: ${install.error.message}`);
      return { ready: false };
    }
    if (install.status !== 0) {
      status("fail", `pip install exited with code ${install.status} — see output above. API will not start until this is fixed.`);
      return { ready: false };
    }
    writeFileSync(stampPath, currentHash);
    status("pass", "API dependencies installed");
  } else {
    status("pass", "API dependencies up to date");
  }

  return { ready: true, venvPython };
}

function ensureWebEnv() {
  const lockPath = path.join(webDir, "package-lock.json");
  if (!existsSync(lockPath)) {
    status("fail", "apps/web/package-lock.json not found — Web cannot start");
    return { ready: false };
  }

  const nodeModulesDir = path.join(webDir, "node_modules");
  const stampPath = path.join(nodeModulesDir, ".deps-stamp");
  const currentHash = hashFile(lockPath);

  if (!existsSync(nodeModulesDir) || readStamp(stampPath) !== currentHash) {
    status("info", existsSync(nodeModulesDir)
      ? "updating web dependencies (apps/web/package-lock.json changed)..."
      : "installing web dependencies (first run)...");
    const install = spawnSync(isWindows ? "npm.cmd" : "npm", ["install"], {
      cwd: webDir,
      stdio: "inherit",
      shell: isWindows // npm.cmd is a batch file — Windows refuses to spawn it directly without a shell
    });
    if (install.error) {
      status("fail", `could not run npm install: ${install.error.message}. Is Node/npm installed and on PATH?`);
      return { ready: false };
    }
    if (install.status !== 0) {
      status("fail", `npm install exited with code ${install.status} — see output above. Web will not start until this is fixed.`);
      return { ready: false };
    }
    mkdirSync(nodeModulesDir, { recursive: true });
    writeFileSync(stampPath, currentHash);
    status("pass", "Web dependencies installed");
  } else {
    status("pass", "Web dependencies up to date");
  }

  return { ready: true };
}

// ---------------------------------------------------------------------------
// DATABASE_URL / AI_API_KEY validation — never blocks startup, always prints
// a clear, specific reason when something looks wrong.
// ---------------------------------------------------------------------------

function tcpProbe(hostname, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, hostname);
  });
}

// Returns whether the database is actually usable right now (reachable
// Postgres, or SQLite which needs no network) — the caller uses this to
// decide whether it's worth even trying to run migrations.
async function validateDatabaseUrl(env) {
  const url = env.DATABASE_URL;
  if (!url) {
    status("warn", "DATABASE_URL is not set in .env — the API will fall back to a local SQLite file (apps/api/scopeforge.db). Fine for quick UI work, not representative of production.");
    return true; // sqlite fallback, migrations can still run against it
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    status("fail", `DATABASE_URL is not a valid URL: "${url}". Expected something like postgresql+psycopg://user:pass@host:5432/dbname.`);
    return false;
  }
  const hostname = parsed.hostname || "localhost";
  const port = Number(parsed.port) || 5432;
  if (!url.startsWith("postgresql") && !url.startsWith("sqlite")) {
    status("warn", `DATABASE_URL uses an unrecognized scheme "${parsed.protocol}" — the app expects postgresql+psycopg:// (or sqlite:// for local fallback).`);
  }
  if (url.startsWith("sqlite")) {
    status("pass", `DATABASE_URL points at SQLite (${url}) — no network check needed`);
    return true;
  }
  const reachable = await tcpProbe(hostname, port);
  if (reachable) {
    status("pass", `DATABASE_URL reachable (${hostname}:${port})`);
  } else {
    status("warn", `DATABASE_URL (${hostname}:${port}) is not reachable — is Postgres running? Try: docker compose up -d. The API will start, but any request touching the database (saving/reading an analysis) will fail until this is fixed.`);
  }
  return reachable;
}

// A reachable database with no migrations applied (very easy to hit on a
// fresh Postgres — this bit a real user: the model call succeeded, but saving
// the result 500'd because the `analyses` table didn't exist yet) is exactly
// the kind of thing "check everything, fix what's missing" should catch
// automatically rather than leaving as a manual `alembic upgrade head` step
// nobody's told about. Safe to run every time — a no-op when already current.
function ensureDatabaseMigrated(api, dbUsable) {
  if (!api.ready) {
    status("info", "skipping database migrations — API dependencies aren't installed");
    return;
  }
  if (!dbUsable) {
    status("info", "skipping database migrations — database isn't reachable (see DATABASE_URL check above)");
    return;
  }
  const result = spawnSync(api.venvPython, ["-m", "alembic", "upgrade", "head"], { cwd: apiDir, stdio: "pipe", encoding: "utf8" });
  if (result.error) {
    status("warn", `could not run migrations: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    status("fail", `alembic upgrade head failed — analyses will not be able to save until this is fixed. ${summarizeMigrationError(combined)}`);
    console.log("Full output (for debugging):");
    console.log(combined.trim());
    return;
  }
  status("pass", "database schema is up to date (alembic upgrade head)");
}

// A raw Python/alembic traceback is 100+ lines — useful for debugging but
// useless as the headline of a FAIL line in a console window someone is
// glancing at. Pull out the one line that actually says what's wrong:
// Postgres' own "FATAL:" message when there is one (auth/db-doesn't-exist
// errors are always this, and it's the clearest phrasing available), else
// the last "SomeError: ..." line, which is where Python puts the real
// exception message in an uncaught-traceback dump.
function summarizeMigrationError(output) {
  const fatalMatch = output.match(/FATAL:\s*(.+)/);
  if (fatalMatch) return `Reason: ${fatalMatch[1].trim()}`;
  const errorLines = output.split("\n").filter((line) => /\w+Error:/.test(line));
  if (errorLines.length > 0) return `Reason: ${errorLines[errorLines.length - 1].trim()}`;
  return "See full output below.";
}

function validateApiKey(env) {
  const mockMode = (env.ANALYSIS_MOCK_MODE ?? "true").trim().toLowerCase() === "true";
  if (mockMode) {
    status("pass", "ANALYSIS_MOCK_MODE=true — AI_API_KEY not required (deterministic mock responses)");
    return;
  }
  const key = env.AI_API_KEY;
  if (!key || key === "replace_me" || key.trim().length === 0) {
    status("fail", "ANALYSIS_MOCK_MODE=false but AI_API_KEY is missing or still the placeholder value. Real analysis requests will fail with a provider_error until a real key is set in .env, or set ANALYSIS_MOCK_MODE=true to use mock data.");
    return;
  }
  status("pass", "AI_API_KEY is set (mock mode off — calls will hit the real provider)");
}

// D042 — Turnstile CAPTCHA and Resend email are both optional (off/blank by
// default, see .env.example) so a fresh clone works with zero setup. This
// never fails the preflight — just tells the developer plainly which of the
// two optional systems is live right now, since a half-configured pair
// (e.g. TURNSTILE_ENABLED=true with no secret key) fails closed silently at
// request time otherwise (see apps/api/app/captcha.py).
function validateSecurityHardeningConfig(env) {
  const turnstileEnabled = (env.TURNSTILE_ENABLED ?? "false").trim().toLowerCase() === "true";
  if (!turnstileEnabled) {
    status("pass", "TURNSTILE_ENABLED=false — CAPTCHA is a no-op on register/login (fine for local dev)");
  } else if (!env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET_KEY.trim().length === 0) {
    status("fail", "TURNSTILE_ENABLED=true but TURNSTILE_SECRET_KEY is blank — register/login will fail closed (400 captcha_failed) on every request until this is set.");
  } else {
    status("pass", "Turnstile CAPTCHA configured (TURNSTILE_SECRET_KEY is set)");
  }

  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.trim().length === 0) {
    status("warn", "RESEND_API_KEY is not set — registration will succeed but no verification email will be sent (accounts stay usable, unverified — see the design notes D042). Get a free key at https://resend.com/api-keys to enable it.");
  } else {
    status("pass", "RESEND_API_KEY is set — verification emails will send via Resend");
  }
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

async function preflight() {
  console.log("ScopeForge dev — preflight\n");

  const env = ensureEnvFile();
  const api = ensureApiEnv();
  const web = ensureWebEnv();
  const dbUsable = await validateDatabaseUrl(env);
  ensureDatabaseMigrated(api, dbUsable);
  validateApiKey(env);
  validateSecurityHardeningConfig(env);

  console.log("");
  return { api, web, env };
}

// ---------------------------------------------------------------------------
// Run servers
// ---------------------------------------------------------------------------

const children = [];

function run(name, command, args, options) {
  const child = spawn(command, args, { shell: isWindows, ...options });
  child.stdout?.on("data", (chunk) => log(name, chunk));
  child.stderr?.on("data", (chunk) => log(name, chunk));
  child.on("exit", (code, signal) => {
    if (code !== null) log(name, `process exited with code ${code}`);
    else if (signal) log(name, `process stopped (${signal})`);
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const { api, web, env } = await preflight();

console.log("Starting ScopeForge dev servers (debug mode)...\n");

if (api.ready) {
  run("api", api.venvPython, ["-m", "uvicorn", "app.main:app", "--reload", "--log-level", "debug", "--port", "8000"], {
    cwd: apiDir
  });
} else {
  console.log("API: not starting — see FAIL lines above.\n");
}

if (web.ready) {
  run("web", isWindows ? "npm.cmd" : "npm", ["run", "dev"], {
    cwd: webDir,
    env: {
      ...process.env,
      NODE_OPTIONS: "--inspect",
      NEXT_TELEMETRY_DISABLED: "1",
      // D042 — Next.js only auto-loads .env files from apps/web itself, not
      // the monorepo root .env this preflight already parsed above (see
      // NEXT_PUBLIC_API_URL for the existing precedent of this gap). Forward
      // the one NEXT_PUBLIC_* var D042 added explicitly so the Turnstile
      // widget picks it up without requiring a second, duplicate .env file.
      ...(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? { NEXT_PUBLIC_TURNSTILE_SITE_KEY: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY } : {})
    }
  });
} else {
  console.log("Web: not starting — see FAIL lines above.\n");
}

if (!api.ready && !web.ready) {
  console.log("Nothing to start — fix the FAIL lines above and re-run.");
  process.exit(1);
}

console.log(
  "\n" +
    (api.ready ? "API      → http://localhost:8000  (docs at /docs, debug-level logs)\n" : "") +
    (web.ready ? "Web      → http://localhost:3000\n" : "") +
    (web.ready ? "Debugger → chrome://inspect, or VS Code \"Attach to Node Process\" (port 9229)\n" : "") +
    "\nPress Ctrl+C to stop.\n"
);
