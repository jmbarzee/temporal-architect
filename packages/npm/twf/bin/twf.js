#!/usr/bin/env node
// Resolves the platform-specific @temporal-architect/twf-<platform> package,
// then execs its bundled binary with the wrapper's argv.
//
// Pattern: biome, esbuild, turbo. Each platform binary is shipped as a
// separate npm package; npm's native `os`/`cpu` resolution installs only
// the matching one via `optionalDependencies`.
"use strict";

const { spawn } = require("child_process");

const PLATFORM_PACKAGES = {
  "darwin-arm64": "@temporal-architect/twf-darwin-arm64",
  "darwin-x64":   "@temporal-architect/twf-darwin-x64",
  "linux-x64":    "@temporal-architect/twf-linux-x64",
  "linux-arm64":  "@temporal-architect/twf-linux-arm64",
  "win32-x64":    "@temporal-architect/twf-win32-x64",
};

const key = `${process.platform}-${process.arch}`;
const pkg = PLATFORM_PACKAGES[key];
if (!pkg) {
  console.error(
    `@temporal-architect/twf: unsupported platform ${key}. ` +
    `Supported: ${Object.keys(PLATFORM_PACKAGES).join(", ")}.`
  );
  process.exit(1);
}

const ext = process.platform === "win32" ? ".exe" : "";
let binary;
try {
  binary = require.resolve(`${pkg}/bin/twf${ext}`);
} catch {
  console.error(
    `@temporal-architect/twf: ${pkg} not installed. ` +
    `This usually means npm skipped the optional dependency. ` +
    `Try reinstalling without --no-optional or --omit=optional.`
  );
  process.exit(1);
}

const child = spawn(binary, process.argv.slice(2), { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
child.on("error", (err) => {
  console.error(`@temporal-architect/twf: failed to exec ${binary}: ${err.message}`);
  process.exit(1);
});
