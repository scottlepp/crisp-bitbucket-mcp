#!/usr/bin/env node
// Install the ultra-bitbucket-mcp skill file into the user's Claude Code
// skills directory so it can be auto-loaded by the assistant.
//
// Default target: $CLAUDE_HOME/skills/ultra-bitbucket-mcp/ (falls back to
// ~/.claude/skills/ultra-bitbucket-mcp/). Override with --dir=<path> or
// the CLAUDE_SKILLS_DIR env var.
//
// Idempotent: overwrites SKILL.md every time so updates land cleanly.

import { mkdir, copyFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, "..", "skill", "SKILL.md");

function parseTargetDir() {
  const flag = process.argv.find((a) => a.startsWith("--dir="));
  if (flag) return resolve(flag.slice("--dir=".length));
  if (process.env.CLAUDE_SKILLS_DIR) {
    return resolve(process.env.CLAUDE_SKILLS_DIR, "ultra-bitbucket-mcp");
  }
  const claudeHome = process.env.CLAUDE_HOME
    ? resolve(process.env.CLAUDE_HOME)
    : join(homedir(), ".claude");
  return join(claudeHome, "skills", "ultra-bitbucket-mcp");
}

async function main() {
  try {
    await stat(SOURCE);
  } catch {
    console.error(`install-skill: source file not found: ${SOURCE}`);
    process.exit(1);
  }

  const target = parseTargetDir();
  await mkdir(target, { recursive: true });
  const dest = join(target, "SKILL.md");
  await copyFile(SOURCE, dest);
  console.log(`ultra-bitbucket-mcp skill installed → ${dest}`);
  console.log("Restart Claude Code (or reload skills) to pick it up.");
}

main().catch((err) => {
  console.error(`install-skill: ${err.message}`);
  process.exit(1);
});
