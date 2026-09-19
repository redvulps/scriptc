// tsc-clean misuses of the standard-library surface: each line below is
// valid TypeScript against the ambient declarations but outside the
// supported lowering (most library, island-backed, Math, string, and
// number functions have no value form; exact-arity path functions are the
// explicit exception; `process` itself is not a first-class value).
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const read = readFileSync; console.log(read);
const base = basename; console.log(base);
const joiner = join; console.log(joiner);
const cwd = process.cwd;
const p = process;
const env = process.env;
const flo = Math.floor;
const upper = "abc".toUpperCase;
const fix = (1.5).toFixed;
const pf = parseFloat;
