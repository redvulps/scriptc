import { describe, expect, test } from "vitest";
import {
  applyNpmStaticDeclarationOverloads,
  npmStaticDeclarationReexports,
  npmStaticRuntimeClassTargets,
  parseNpmStaticDeclarationOverloads,
} from "./npm-static-declarations.js";

const declarations = `
export class Chainy {
  name(): string;
  name(value: string): this;
  tag(): string;
  tag(value: string): this;
  single(): string;
  unsafe(): string;
  unsafe(value: Date): this;
  generic<T>(value: T): T;
  generic(value: string): string;
}
`;

describe("npm-static declaration overload projection", () => {
  test("extracts only complete representation-safe overload groups", () => {
    const overloads = parseNpmStaticDeclarationOverloads("index.d.ts", declarations);
    expect([...overloads.keys()]).toEqual(["Chainy"]);
    expect([...overloads.get("Chainy")!.keys()]).toEqual(["name", "tag"]);
    expect(overloads.get("Chainy")!.get("name")).toEqual([
      { parameters: [], returnType: "string" },
      { parameters: [{ name: "value", type: "string", optional: false }], returnType: "this" },
    ]);
  });

  test("injects overload and implementation JSDoc only into exported matching classes", () => {
    const source = `
class Hidden {
  name(value) { return value === undefined ? "" : this; }
}
class Chainy {
  name(value) { return value === undefined ? "" : this; }
  tag(value) { return value === undefined ? "" : this; }
}
module.exports = { Chainy };
`;
    const rewritten = applyNpmStaticDeclarationOverloads(
      "index.js",
      source,
      parseNpmStaticDeclarationOverloads("index.d.ts", declarations),
    );
    expect(rewritten).not.toBeNull();
    expect(rewritten!.insertions).toHaveLength(2);
    expect(rewritten!.text.match(/@overload/g)).toHaveLength(4);
    expect(rewritten!.text).toContain("@param {string} [value] @returns {string | Chainy}");
    expect(rewritten!.text.slice(source.indexOf("class Hidden"), source.indexOf("class Chainy"))).not.toContain("@overload");
  });

  test("reports only relative declaration-barrel edges", () => {
    expect(npmStaticDeclarationReexports("esm.d.mts", `
      export * from "./index.js";
      export { Type } from "./types.js";
      export * from "other-package";
    `)).toEqual(["./index.js", "./types.js"]);
  });

  test("binds declaration classes to direct and one-hop runtime exports", () => {
    expect(npmStaticRuntimeClassTargets("index.js", `
      const { Command, Other: Alias } = require("./lib/command.js");
      class Local {}
      exports.Command = Command;
      exports.Alias = Alias;
      exports.Local = Local;
    `, new Set(["Command", "Alias", "Local"]))).toEqual(new Map([
      ["Command", "./lib/command.js"],
      ["Local", null],
    ]));
  });
});
