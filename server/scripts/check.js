import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(process.cwd());
const files = ["src/server.js", "src/app.js"];
for (const folder of [
  "src/routes",
  "src/models",
  "src/middleware",
  "src/config",
  "src/scripts",
  "src/utils",
]) {
  for (const name of readdirSync(join(root, folder)))
    if (name.endsWith(".js")) files.push(join(folder, name));
}
for (const file of ["../extension/background.js", "../extension/popup.js"])
  if (existsSync(join(root, file))) files.push(file);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`FAIL ${file}\n${result.stderr || result.stdout}`);
  } else process.stdout.write(`PASS ${file}\n`);
}
if (failed) process.exit(1);
process.stdout.write(
  `\nSyntax checks passed for ${files.length} JavaScript files.\n`,
);
