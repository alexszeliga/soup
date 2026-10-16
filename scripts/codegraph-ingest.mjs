#!/usr/bin/env node
/**
 * Bulk-ingest the soup codebase into the central codegraph service.
 *
 * Usage:
 *   node scripts/codegraph-ingest.mjs [--dry-run] [--project soup] [--concurrency 3]
 *
 * Re-running is idempotent: re-ingesting a file overwrites its entry.
 * Reads CODEGRAPH_BASE_URL / CODEGRAPH_API_TOKEN from env, falling back
 * to ~/.pi/pi.env (dotenv KEY=VALUE lines).
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

// ── Args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const arg = (name) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const project = arg("--project") ?? "soup";
const concurrency = Number(arg("--concurrency") ?? 3);

const ROOT = resolve(new URL("..", import.meta.url).pathname);

// ── Config ────────────────────────────────────────────────────────────────

function envFileValue(file, key) {
	try {
		const content = readFileSync(file, "utf8");
		const re = new RegExp(
			`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s#][^#]*?))\\s*$`,
			"m",
			);
		const m = content.match(re);
		return m ? (m[1] ?? m[2] ?? m[3]).trim() : "";
	} catch {
		return "";
	}
}

const base =
	(process.env.CODEGRAPH_BASE_URL || envFileValue(`${homedir()}/.pi/pi.env`, "CODEGRAPH_BASE_URL") || "http://192.168.0.117:8082").replace(/\/+$/, "");
const token =
	process.env.CODEGRAPH_API_TOKEN || envFileValue(`${homedir()}/.pi/pi.env`, "CODEGRAPH_API_TOKEN");

if (!token) {
	console.error("FATAL: CODEGRAPH_API_TOKEN not found in env or ~/.pi/pi.env");
	process.exit(1);
}

// ── File list ─────────────────────────────────────────────────────────────

const EXCLUDE = /(node_modules|\.git|dist|coverage|\.next|\.turbo)/;
const EXTS = new Set([".ts", ".tsx", ".go", ".js", ".mjs"]);

const all = execSync(
	`find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.go' -o -name '*.js' -o -name '*.mjs' \\) -print`,
	{ cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
)
	.trim()
	.split("\n")
	.filter((p) => !EXCLUDE.test(p) && EXTS.has(p.slice(p.lastIndexOf("."))))
	.sort();

if (dryRun) {
	console.log(`${all.length} files for project "${project}":`);
	for (const p of all) console.log(" ", p);
	process.exit(0);
}

// ── Ingest ────────────────────────────────────────────────────────────────

async function ingest(relPath) {
	const abs = resolve(ROOT, relPath);
	const content = readFileSync(abs, "utf8");
	const res = await fetch(`${base}/ingest`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ project, path: relPath, content }),
		signal: AbortSignal.timeout(120_000),
	});
	const body = await res.text();
	if (!res.ok) throw new Error(`${relPath}: HTTP ${res.status} — ${body.slice(0, 200)}`);
	return relPath;
}

const results = { ok: [], failed: [] };
const queue = [...all];
const workers = Array.from({ length: concurrency }, async () => {
	while (queue.length > 0) {
		const relPath = queue.shift();
		if (relPath === undefined) break;
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				await ingest(relPath);
				results.ok.push(relPath);
				console.log(`  ok ${results.ok.length}/${all.length}  ${relPath}`);
				break;
			} catch (err) {
				if (attempt === 3) {
					results.failed.push({ relPath, error: String(err.message ?? err) });
					console.error(`  FAIL ${relPath}: ${err.message}`);
				} else {
					await new Promise((r) => setTimeout(r, 1000 * attempt));
				}
			}
		}
	}
});

await Promise.all(workers);

console.log(`\nDone: ${results.ok.length} ingested, ${results.failed.length} failed (project "${project}", concurrency ${concurrency}).`);
for (const f of results.failed) console.log(`  FAILED: ${f.relPath} — ${f.error}`);
process.exit(results.failed.length > 0 ? 1 : 0);
