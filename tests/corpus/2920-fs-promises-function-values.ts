// Exact-ABI node:fs/promises functions retain their Promise result when
// stored, returned, and passed through ordinary typed function slots.
import {
  chmod,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import * as fsp from "node:fs/promises";
import { existsSync, rmSync } from "node:fs";
import type { Stats } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const cjsFsp = require("node:fs/promises") as typeof import("node:fs/promises");
const root = join(tmpdir(), `scriptc-fsp-values-${process.pid}`);
if (existsSync(root)) rmSync(root, { recursive: true, force: true });

const writeText: (path: string, data: string) => Promise<void> = writeFile;
const namespaceWriteText: (path: string, data: string) => Promise<void> = fsp.writeFile;
const cjsWriteText: (path: string, data: string) => Promise<void> = cjsFsp.writeFile;
const makeDir: (path: string) => Promise<void> = mkdir;
const readNames: (path: string) => Promise<string[]> = readdir;
const readStat: (path: string) => Promise<Stats> = stat;
const removePath: (path: string) => Promise<void> = rm;
const unlinkPath: (path: string) => Promise<void> = unlink;
const changeMode: (path: string, mode: number) => Promise<void> = chmod;
const renamePath: (from: string, to: string) => Promise<void> = rename;

async function callPathVoid(fn: (path: string) => Promise<void>, path: string): Promise<void> {
  await fn(path);
}

async function callPathPair(
  fn: (from: string, to: string) => Promise<void>,
  from: string,
  to: string,
): Promise<void> {
  await fn(from, to);
}

function chooseWriter(cjs: boolean): (path: string, data: string) => Promise<void> {
  return cjs ? cjsWriteText : writeText;
}

console.log(
  writeText === namespaceWriteText,
  writeText === cjsWriteText,
  typeof writeText,
);

await callPathVoid(makeDir, root);
const first = join(root, "first.txt");
const second = join(root, "second.txt");
await chooseWriter(false)(first, "promise-value");
await ((writer: (path: string, data: string) => Promise<void>) => writer(second, "second"))(writeText);

const names = await readNames(root);
console.log(names.sort().join(","));
const snapshot = await readStat(first);
console.log(snapshot.isFile(), snapshot.size);

await changeMode(first, 0o600);
const renamed = join(root, "renamed.txt");
await callPathPair(renamePath, second, renamed);
console.log(existsSync(renamed), !existsSync(second));

await callPathVoid(unlinkPath, renamed);
const removable = join(root, "removable.txt");
await writeText(removable, "remove");
await callPathVoid(removePath, removable);
console.log(!existsSync(renamed), !existsSync(removable));

try {
  await readStat(join(root, "missing"));
} catch (error) {
  console.log(error instanceof Error, error instanceof Error && error.message.includes("ENOENT"));
}

rmSync(root, { recursive: true, force: true });
console.log(!existsSync(root));
