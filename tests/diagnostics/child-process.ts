// child_process support boundaries: what stays rejected at LOWERING with
// specific messages. The fallback declarations type the supported surface
// exactly, so most misuse is a type error before lowering; these are the
// forms that TYPECHECK and fence per site.

import { execFile, spawn } from "node:child_process";

// The default and explicit "pipe" forms use piped streams.
// Keep both adjacent to the remaining rejection cases.
const noOpts = spawn("/bin/echo");

// "inherit" and "ignore" remain process-only forms without child streams.
// All four supported modes must coexist with the fences below.
const piped = spawn("/bin/echo", [], { stdio: "pipe" });
const inherited = spawn("/bin/echo", [], { stdio: "inherit" });

// A variable options value must fence instead of being dropped.
const options: { stdio: "ignore"; detached: boolean } = { stdio: "ignore", detached: true };
spawn("true", [], options);
const c = spawn("true", [], { stdio: "ignore" });

// `() => 5` IS assignable to a void-returning listener slot and now ADOPTS
// the slot's void (JS ignores the value); an ANNOTATED value-returning
// listener keeps its word and stays fenced — the registry calls listeners
// as void.
c.on("exit", (): number => 5);
// Methods have no bound-value form — call on directly.
const f = c.on;
// The callback slice is deliberately narrower than Node's complete
// options/optional-callback overload family.
execFile("true");
execFile("true", [], { encoding: "utf8" }, () => {});
// Keep each fence on its own statement so diagnostics remain site-specific.
