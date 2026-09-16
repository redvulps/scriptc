import { spawn } from "node:child_process";

const child = spawn("node", []);
child.stdin.write("x", "utf8");
child.stdin.end("x");
child.stdin.destroy(new Error("stop"));
