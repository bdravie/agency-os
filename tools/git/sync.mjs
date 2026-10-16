#!/usr/bin/env node
// Commit every change and push to GitHub, without a system git install.
//
// Usage:  node tools/git/sync.mjs "commit message"
//         node tools/git/sync.mjs --status
//
// Needs GITHUB_TOKEN in .env (fine-grained token, Contents: read & write on this repo).
// .gitignore is respected, so .env and node_modules are never committed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REMOTE_URL = "https://github.com/bdravie/agency-os.git";
const BRANCH = "main";
const AUTHOR = {
  name: process.env.GIT_AUTHOR_NAME || "bdravie",
  email: process.env.GIT_AUTHOR_EMAIL || "78802976+bdravie@users.noreply.github.com",
};

// Read a single key from .env without printing anything.
function envValue(key) {
  if (process.env[key]) return process.env[key];
  const file = path.join(dir, ".env");
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^['"]|['"]$/g, "") || undefined;
  }
  return undefined;
}

// Files that must never be committed, even if .gitignore is edited by mistake.
const NEVER = [/^\.env$/, /^\.env\.(?!example$)/, /(^|\/)node_modules\//, /(^|\/)\.venv(\/|$)/, /(^|\/)\._/, /(^|\/)\.DS_Store$/];

async function ensureRepo() {
  if (!fs.existsSync(path.join(dir, ".git"))) {
    await git.init({ fs, dir, defaultBranch: BRANCH });
    console.log("Initialised repository.");
  }
  const remotes = await git.listRemotes({ fs, dir });
  if (!remotes.find((r) => r.remote === "origin")) {
    await git.addRemote({ fs, dir, remote: "origin", url: REMOTE_URL });
  }
}

async function stageAll() {
  const matrix = await git.statusMatrix({ fs, dir });
  const changed = [];
  for (const [filepath, head, workdir, stage] of matrix) {
    if (NEVER.some((re) => re.test(filepath))) continue;
    if (head === 1 && workdir === 1 && stage === 1) continue; // unchanged
    if (workdir === 0) {
      await git.remove({ fs, dir, filepath });
      changed.push(`deleted  ${filepath}`);
    } else {
      await git.add({ fs, dir, filepath });
      changed.push(`${head === 0 ? "added   " : "modified"} ${filepath}`);
    }
  }
  return changed;
}

async function main() {
  const args = process.argv.slice(2);
  await ensureRepo();
  const changed = await stageAll();

  if (args[0] === "--status") {
    console.log(changed.length ? changed.join("\n") : "Nothing to commit.");
    return;
  }

  const message = args.join(" ").trim() || "Update";
  if (changed.length) {
    console.log(changed.join("\n"));
    const sha = await git.commit({ fs, dir, message, author: AUTHOR });
    console.log(`Committed ${sha.slice(0, 7)}: ${message}`);
  } else {
    console.log("Nothing new to commit; pushing any unpushed commits.");
  }

  const token = envValue("GITHUB_TOKEN");
  if (!token) {
    console.error("Not pushed: add GITHUB_TOKEN to .env (see docs/SETUP.md).");
    process.exit(1);
  }
  const result = await git.push({
    fs,
    http,
    dir,
    remote: "origin",
    ref: BRANCH,
    onAuth: () => ({ username: "x-access-token", password: token }),
  });
  if (!result.ok) {
    console.error("Push failed:", JSON.stringify(result.refs));
    process.exit(1);
  }
  console.log(`Pushed to ${REMOTE_URL} (${BRANCH}).`);
}

main().catch((err) => {
  // Never echo the token; isomorphic-git errors don't include it.
  console.error(`git sync failed: ${err.code || err.name}: ${err.message}`);
  process.exit(1);
});
