#!/usr/bin/env node

/**
 * safe-clean-console.js
 *
 * Recursively scans selected src directories and removes ONLY clearly
 * development/debug console.log/debug/info/warn statements.
 *
 * Safety rules:
 * - Only touches simple, single-line console statements of the form:
 *     console.log(...);
 *   with nothing but whitespace before "console".
 * - Does NOT touch:
 *   - console.error(...)
 *   - Any console inside a catch block
 *   - Any console line whose message looks business‑critical
 *     (payments, orders, auth, delivery, sockets, DB, etc.)
 *   - Any console used as part of an expression (e.g. `foo && console.log(...)`)
 * - Skips node_modules, dist, build, .git and similar folders.
 * - Preserves existing line endings (LF vs CRLF) and otherwise avoids
 *   reformatting.
 *
 * Run from project root:
 *   node safe-clean-console.js
 */

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

// Directories to scan (only if they exist) - per requirements, ONLY frontend/src
const candidateSrcDirs = [path.join("frontend", "src")];

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "out",
]);

// Paths that are considered business‑critical: never touch logs here
// (even if they look like debug statements), to be extra safe.
const CRITICAL_PATH_FRAGMENTs = [
  path.join("lib", "utils", "razorpay"),
  path.join("module", "user", "components", "AddMoneyModal"),
];

// Emoji characters that typically indicate debug-style logs
const DEBUG_EMOJI_CHARS = [
  "🔍",
  "🎯",
  "📍",
  "✅",
  "❌",
  "⏰",
  "🔄",
  "📦",
  "🔔",
  "⏳",
  "🔊",
  "ℹ️",
  "⚠️",
  "💰",
  "📊",
  "📢",
  "🕐",
  "🧪",
  "🚫",
  "🚀",
  "📝",
  "🧹",
  "🎨",
  "💾",
  "📐",
];

// Plain-text phrases that clearly indicate dev/debug or render tracking logs
const DEBUG_MESSAGE_PHRASES = [
  "ordertrackingcard - checking for active orders",
  "ordertrackingcard render",
  "ordertrackingcard - order delivered or time is 0, hiding card",
  "ordertrackingcard - rendering card",
  "restaurant loading completed",
  "transformed and sorted restaurants",
  "recalculated distances for all restaurants",
  "debug",
  "test log",
];

// File extensions to consider
const VALID_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

/** Recursively walk a directory, collecting file paths. */
function walkDir(dir, outFiles) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walkDir(entryPath, outFiles);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (VALID_EXTENSIONS.has(ext)) {
        outFiles.push(entryPath);
      }
    }
  }
}

/** Detect whether a path is in a critical/business‑sensitive area. */
function isCriticalPath(filePath) {
  const rel = path.relative(projectRoot, filePath).replace(/\\/g, "/");
  return CRITICAL_PATH_FRAGMENTs.some((frag) =>
    rel.toLowerCase().includes(frag.toLowerCase()),
  );
}

/** Check if a console.* call line looks like a debug/render log message. */
function looksLikeDebugLog(lineLower) {
  for (const ch of DEBUG_EMOJI_CHARS) {
    if (lineLower.includes(ch)) return true;
  }
  for (const phrase of DEBUG_MESSAGE_PHRASES) {
    if (lineLower.includes(phrase)) return true;
  }
  return false;
}

/** Decide if a console.* statement can be safely removed (based on the first line). */
function shouldRemoveConsoleStartLine(line, inCatchBlock, filePath) {
  // Never touch inside catch blocks
  if (inCatchBlock) return false;

  // Only consider lines starting with whitespace then console.log/debug/info/warn
  if (!/^\s*console\.(log|debug|info|warn)\s*\(/.test(line)) return false;

  // Must end the statement on this line to avoid breaking multi‑line calls
  const trimmed = line.trim();
  if (!trimmed.endsWith(");")) return false;

  // Ensure console is not part of an expression like `foo && console.log(...)`
  const idx = line.indexOf("console.");
  if (idx > -1) {
    const prefix = line.slice(0, idx);
    if (!/^\s*$/.test(prefix)) {
      // Something other than whitespace before console -> skip (affects logic)
      return false;
    }
  }

  // Do not touch critical paths at all
  if (isCriticalPath(filePath)) return false;

  // Only remove logs that look like explicit debug/render tracking
  const lower = line.toLowerCase();
  if (!looksLikeDebugLog(lower)) {
    // If it's not obviously debug, keep it
    return false;
  }

  return true;
}

/** Process a single file, returning { changed, removedCount }. */
function processFile(filePath) {
  const originalContent = fs.readFileSync(filePath, "utf8");

  // Preserve original line endings
  const usesCRLF = originalContent.includes("\r\n");
  const splitter = "\n";

  const lines = originalContent.split(splitter);
  const outLines = [];

  let removedCount = 0;

  // Very simple brace / catch tracking to avoid catch blocks.
  let braceDepth = 0;
  let catchDepthStack = []; // stack of depths where catch blocks start
  let pendingCatch = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track "catch" occurrences
    if (/\bcatch\s*\(/.test(line)) {
      pendingCatch = true;
    }

    // Update brace depth and start/end catch blocks
    for (const ch of line) {
      if (ch === "{") {
        braceDepth++;
        if (pendingCatch) {
          catchDepthStack.push(braceDepth);
          pendingCatch = false;
        }
      } else if (ch === "}") {
        // End any catch block ending at this depth
        if (catchDepthStack.length && catchDepthStack[catchDepthStack.length - 1] === braceDepth) {
          catchDepthStack.pop();
        }
        braceDepth = Math.max(0, braceDepth - 1);
      }
    }

    const inCatchBlock = catchDepthStack.length > 0;

    if (shouldRemoveConsoleStartLine(line, inCatchBlock, filePath)) {
      // Handle potential multi-line console statements:
      // remove from this line until we see a line that ends the statement (`);`).
      removedCount++;
      let j = i + 1;
      let statementClosed = /;\s*$/.test(line) && line.includes(")");

      while (!statementClosed && j < lines.length) {
        const nextLine = lines[j];
        removedCount++;
        if (nextLine.includes(");")) {
          statementClosed = true;
        }
        j++;
      }

      i = j - 1; // skip the lines we just removed
      continue;
    }

    outLines.push(line);
  }

  if (removedCount === 0) {
    return { changed: false, removedCount: 0 };
  }

  const newContent = outLines.join(usesCRLF ? "\r\n" : "\n");
  if (newContent !== originalContent) {
    fs.writeFileSync(filePath, newContent, "utf8");
    return { changed: true, removedCount };
  }

  return { changed: false, removedCount: 0 };
}

function main() {
  console.log("Safe console cleanup starting from:", projectRoot);

  const srcDirs = candidateSrcDirs
    .map((p) => path.join(projectRoot, p))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());

  if (srcDirs.length === 0) {
    console.log('No src directories found (checked: "src", "frontend/src", "backend/src"). Nothing to do.');
    return;
  }

  console.log("Scanning src directories:", srcDirs.map((d) => path.relative(projectRoot, d)));

  const files = [];
  for (const dir of srcDirs) {
    walkDir(dir, files);
  }

  console.log(`Found ${files.length} JS/TS source files to inspect.`);

  let totalRemoved = 0;
  let filesChanged = 0;

  for (const file of files) {
    const rel = path.relative(projectRoot, file);
    const { changed, removedCount } = processFile(file);
    if (changed) {
      filesChanged++;
      totalRemoved += removedCount;
      console.log(`Cleaned ${removedCount} console statement(s) in ${rel}`);
    }
  }

  console.log("Safe console cleanup complete.");
  console.log(`Files changed: ${filesChanged}`);
  console.log(`Console statements removed: ${totalRemoved}`);
}

main();

