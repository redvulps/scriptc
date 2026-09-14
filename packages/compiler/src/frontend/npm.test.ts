import { expect, test } from "vitest";
import { moduleSpecifiersOf } from "./npm.js";
import { NpmGraphBuilder } from "./npm.js";

test("collects import.meta.resolve literals as resolution-only edges", () => {
  const result = moduleSpecifiersOf(
    'export const relative = import.meta.resolve("./asset.js");\n' +
      'export const packageUrl = import.meta.resolve("example-package");\n',
    "/project/index.mjs",
  );
  expect(result.uses).toEqual([
    {
      specifier: "./asset.js",
      static: false,
      require: false,
      requireLocal: false,
      requireViaHelper: false,
      dynamicImport: false,
      importMetaResolve: true,
    },
    {
      specifier: "example-package",
      static: false,
      require: false,
      requireLocal: false,
      requireViaHelper: false,
      dynamicImport: false,
      importMetaResolve: true,
    },
  ]);
});

test("emits an import-condition edge for an embedded bare import.meta.resolve", () => {
  const root = new URL("../../../../tests/fixtures/npm/", import.meta.url).pathname;
  const entry = `${root}cases/dual-entry/main.ts`;
  const builder = new NpmGraphBuilder();
  builder.addImport(entry, "dual");
  const graph = builder.finish();
  const dual = graph.modules.find((module) => module.key.endsWith("/dual/index.mjs"));
  expect(dual).toBeDefined();
  expect(graph.edges).toContainEqual({
    from: dual!.key,
    specifier: "cjszoo",
    to: expect.stringMatching(/\/cjszoo\/index\.js$/),
    kind: "import",
  });
});

test("runtime introspection keeps import and require export conditions separate", () => {
  const root = new URL("../../../../tests/fixtures/npm/", import.meta.url).pathname;
  const entry = `${root}cases/dual-entry/main.ts`;
  const builder = new NpmGraphBuilder();
  expect(builder.resolveForIntrospection(entry, "dual", "import")).toMatch(/\/dual\/index\.mjs$/);
  expect(builder.resolveForIntrospection(entry, "dual", "require")).toMatch(/\/dual\/index\.cjs$/);
});
