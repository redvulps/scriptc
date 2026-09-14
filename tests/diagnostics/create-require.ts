// node:module — createRequire's LOWERED shape is a const binding over
// createRequire(import.meta.url) (or __filename) whose require calls
// take STATIC string literals (builtins, relative .json documents,
// installed npm packages under --dynamic). Everything else fences by
// name: a base that is not "this file" keeps the member fence (the
// returned require would resolve from a directory the compiler is not
// standing in), a computed specifier cannot exist in a fixed module
// graph, and a relative non-.json target is a program module — a
// static import.
import { createRequire } from "node:module";

// The base names some OTHER file: unrecognized — the member fence.
const req = createRequire("/tmp/parent.js");
console.log(String(req("./config.cjs")));
// The supported base still fences dynamic require calls and program-module loads.
const require = createRequire(import.meta.url);

// A computed specifier: fenced by name.
const which = "left" + "-pad";
require(which);

// A relative non-.json target: program modules are static imports.
require("./helper.js");
