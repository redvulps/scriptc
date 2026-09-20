// The exact-ABI node:fs functions are ordinary static values. Named,
// namespace, and CommonJS reads share identity; values flow through
// parameters, returns, arrays, and records without bypassing the direct
// calls' filesystem behavior.
import {
  appendFileSync,
  chmodSync,
  chownSync,
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const require = createRequire(import.meta.url);
const cjsFs = require("node:fs") as typeof import("node:fs");
const root = join(tmpdir(), `scriptc-fs-values-${process.pid}`);
if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });

function callPathBool(fn: (path: string) => boolean, path: string): boolean {
  return fn(path);
}

function callPathVoid(fn: (path: string) => void, path: string): void {
  fn(path);
}

function callPathPair(fn: (from: string, to: string) => void, from: string, to: string): void {
  fn(from, to);
}

function callPathStrings(fn: (path: string) => string[], path: string): string[] {
  return fn(path);
}

function callPathString(fn: (path: string) => string, path: string): string {
  return fn(path);
}

function callPathStats(fn: (path: string) => Stats, path: string): Stats {
  return fn(path);
}

function chooseExists(cjs: boolean): (path: string) => boolean {
  return cjs ? cjsFs.existsSync : existsSync;
}

console.log(
  existsSync === fs.existsSync,
  existsSync === cjsFs.existsSync,
  chownSync === fs.chownSync,
  typeof existsSync,
);
console.log(!callPathBool(chooseExists(false), root));

callPathVoid(mkdirSync, root);
const file = join(root, "source.txt");
const writers: ((path: string, data: string) => void)[] = [writeFileSync, appendFileSync];
writers[0]!(file, "alpha");
writers[1]!(file, "-beta");
console.log(fs.readFileSync(file, "utf8"));

const followed = callPathStats(statSync, file);
const unfollowed = callPathStats(lstatSync, file);
console.log(followed.isFile(), unfollowed.isFile(), followed.size);
const list = callPathStrings(readdirSync, root).sort();
console.log(list.join(","));
console.log(basename(callPathString(realpathSync, file)));

const copy = join(root, "copy.txt");
const moved = join(root, "moved.txt");
callPathPair(copyFileSync, file, copy);
callPathPair(renameSync, copy, moved);
console.log(callPathBool(existsSync, moved), !callPathBool(existsSync, copy));

const modes: ((path: string, mode: number) => void)[] = [chmodSync];
modes[0]!(moved, 0o600);
const fd = ((open: (path: string, flags: string) => number): number => open(file, "r"))(openSync);
((close: (fd: number) => void): void => close(fd))(closeSync);

const made = ((make: (prefix: string) => string): string => make(join(root, "made-")))(mkdtempSync);
console.log(basename(made).startsWith("made-"), callPathBool(existsSync, made));
callPathVoid(rmdirSync, made);

const deletions: ((path: string) => void)[] = [unlinkSync, rmSync];
deletions[0]!(moved);
const disposable = join(root, "disposable.txt");
writeFileSync(disposable, "gone");
deletions[1]!(disposable);
console.log(!existsSync(moved), !existsSync(disposable));

rmSync(root, { recursive: true, force: true });
console.log(!existsSync(root));
