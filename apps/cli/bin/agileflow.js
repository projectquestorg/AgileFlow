#!/usr/bin/env node
// AgileFlow CLI entry. All logic lives in the bundled dist/cli.js.
let cli;
try {
  cli = await import("../dist/cli.js");
} catch (err) {
  if (
    err &&
    err.code === "ERR_MODULE_NOT_FOUND" &&
    String(err.message).includes("dist/cli.js")
  ) {
    console.error(
      "AgileFlow CLI is not built. Run `npm run build` in apps/cli (or install the published package).",
    );
    process.exit(1);
  }
  throw err;
}

cli.run(process.argv).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  },
);
