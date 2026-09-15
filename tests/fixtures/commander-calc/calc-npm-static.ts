// The --npm-static commander probe: the same CLI shape as calc.ts, written
// against commander's INFERRED surface (no .d.ts in the program — the
// package declarations provide safe getter/setter overloads while action
// callbacks annotate their own params). npm-static.test.ts
// asserts the coverage numbers; the binary builds fully static and traps at
// the first driven runtime fence. Implicit-any monomorphization carried the
// typed-value → untyped-param boundary (_registerCommand and its local
// knownBy helper instantiate per argument types now); the frontier behind
// it, pinned: safe package-maintained overload groups refine calls such as
// `cmd.name()`, while implicit-any FIELD writes of class instances remain
// (`cmd.parent = this` — parent inferred `any` from its constructor null,
// and a Command cannot ride the checked-dynamic slot).
import { Command } from "commander";
const program = new Command();
program.name("calc");
const add = program.command("add <a> <b>");
add.description("add two numbers");
add.action((a: string, b: string) => {
  console.log(parseInt(a, 10) + parseInt(b, 10));
});
program.parse();
