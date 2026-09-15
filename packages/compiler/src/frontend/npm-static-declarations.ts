/* Declaration-overload projection for --npm-static. The runtime program
 * still resolves to and compiles package JavaScript, but an authored .d.ts
 * can carry overloads inference cannot reproduce (the common getter/setter
 * shape `name(): string` / `name(value): this`). This string-bounded
 * TypeScript 5 parser island extracts only complete, representation-safe
 * groups and respells them as JSDoc immediately before the matching
 * exported JavaScript class method. TypeScript 7 then checks and lowers one
 * world: implementation bodies remain the runtime truth, while overload
 * calls get the package author's more precise signature. */

import ts from "typescript5";

export interface NpmStaticOverloadParameter {
  name: string;
  type: string;
  optional: boolean;
}

export interface NpmStaticOverloadSignature {
  parameters: readonly NpmStaticOverloadParameter[];
  returnType: string;
}

export type NpmStaticDeclarationOverloads = ReadonlyMap<
  string,
  ReadonlyMap<string, readonly NpmStaticOverloadSignature[]>
>;

export interface NpmStaticOverloadRewrite {
  text: string;
  insertions: readonly { offset: number; length: number }[];
}

const SAFE_KEYWORD_TYPES = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.NeverKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.UndefinedKeyword,
  ts.SyntaxKind.VoidKeyword,
]);

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
}

function safeTypeText(node: ts.TypeNode, sourceFile: ts.SourceFile, className: string): string | null {
  if (SAFE_KEYWORD_TYPES.has(node.kind) || ts.isThisTypeNode(node)) return node.getText(sourceFile);
  if (ts.isParenthesizedTypeNode(node)) {
    const inner = safeTypeText(node.type, sourceFile, className);
    return inner === null ? null : `(${inner})`;
  }
  if (ts.isArrayTypeNode(node)) {
    const element = safeTypeText(node.elementType, sourceFile, className);
    return element === null ? null : `${element}[]`;
  }
  if (ts.isUnionTypeNode(node)) {
    const arms = node.types.map((type) => safeTypeText(type, sourceFile, className));
    return arms.some((arm) => arm === null) ? null : arms.join(" | ");
  }
  return ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    node.typeName.text === className &&
    (node.typeArguments?.length ?? 0) === 0
    ? className
    : null;
}

function overloadSignature(
  sourceFile: ts.SourceFile,
  className: string,
  method: ts.MethodDeclaration,
): NpmStaticOverloadSignature | null {
  if (
    !ts.isIdentifier(method.name) ||
    method.type === undefined ||
    (method.typeParameters?.length ?? 0) !== 0 ||
    hasModifier(method, ts.SyntaxKind.StaticKeyword) ||
    hasModifier(method, ts.SyntaxKind.PrivateKeyword) ||
    hasModifier(method, ts.SyntaxKind.ProtectedKeyword)
  ) {
    return null;
  }
  const returnType = safeTypeText(method.type, sourceFile, className);
  if (returnType === null) return null;
  const parameters: NpmStaticOverloadParameter[] = [];
  for (const parameter of method.parameters) {
    if (
      !ts.isIdentifier(parameter.name) ||
      parameter.name.text === "this" ||
      parameter.type === undefined ||
      parameter.initializer !== undefined ||
      parameter.dotDotDotToken !== undefined
    ) {
      return null;
    }
    const type = safeTypeText(parameter.type, sourceFile, className);
    if (type === null) return null;
    parameters.push({
      name: parameter.name.text,
      type,
      optional: parameter.questionToken !== undefined,
    });
  }
  return { parameters, returnType };
}

/** Extracts complete safe overload groups from exported non-generic classes. */
export function parseNpmStaticDeclarationOverloads(
  declarationPath: string,
  source: string,
): NpmStaticDeclarationOverloads {
  const sourceFile = ts.createSourceFile(declarationPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classes = new Map<string, ReadonlyMap<string, readonly NpmStaticOverloadSignature[]>>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isClassDeclaration(statement) ||
      statement.name === undefined ||
      (statement.typeParameters?.length ?? 0) !== 0 ||
      !hasModifier(statement, ts.SyntaxKind.ExportKeyword) ||
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    ) {
      continue;
    }
    const className = statement.name.text;
    const groups = new Map<string, ts.MethodDeclaration[]>();
    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) continue;
      const group = groups.get(member.name.text) ?? [];
      group.push(member);
      groups.set(member.name.text, group);
    }
    const overloads = new Map<string, readonly NpmStaticOverloadSignature[]>();
    for (const [name, methods] of groups) {
      if (methods.length < 2) continue;
      const signatures = methods.map((method) => overloadSignature(sourceFile, className, method));
      // A partial set could select the wrong branch. Keep inference when
      // any authored signature is outside the projection's safe grammar.
      if (signatures.some((signature) => signature === null)) continue;
      overloads.set(name, signatures as NpmStaticOverloadSignature[]);
    }
    if (overloads.size > 0) classes.set(className, overloads);
  }
  return classes;
}

/** Relative declaration-barrel edges whose target stays subject to the
 * caller's package-bounded resolution. Bare type dependencies deliberately
 * do not inherit the opted package's declaration trust. */
export function npmStaticDeclarationReexports(
  declarationPath: string,
  source: string,
): readonly string[] {
  const sourceFile = ts.createSourceFile(declarationPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return sourceFile.statements.flatMap((statement) =>
    ts.isExportDeclaration(statement) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text.startsWith(".")
      ? [statement.moduleSpecifier.text]
      : []
  );
}

function requireSpecifier(expression: ts.Expression | undefined): string | null {
  const argument = expression !== undefined && ts.isCallExpression(expression) ? expression.arguments[0] : undefined;
  return expression !== undefined &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "require" &&
    expression.arguments.length === 1 &&
    argument !== undefined &&
    ts.isStringLiteralLike(argument)
    ? argument.text
    : null;
}

/** Maps declaration class names to their implementation edge from one
 * runtime package entry. Null means the class is declared in the entry;
 * a string is a relative re-export target. Multi-hop and aliased class
 * re-exports stay out of the first safe slice. */
export function npmStaticRuntimeClassTargets(
  sourcePath: string,
  source: string,
  classNames: ReadonlySet<string>,
): ReadonlyMap<string, string | null> {
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const localClasses = new Set(
    sourceFile.statements.flatMap((statement) =>
      ts.isClassDeclaration(statement) && statement.name !== undefined ? [statement.name.text] : []
    ),
  );
  const required = new Map<string, { imported: string; specifier: string }>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const specifier = requireSpecifier(declaration.initializer);
      if (specifier === null || !specifier.startsWith(".") || !ts.isObjectBindingPattern(declaration.name)) continue;
      for (const element of declaration.name.elements) {
        if (element.dotDotDotToken !== undefined || !ts.isIdentifier(element.name)) continue;
        const imported = element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
          ? element.propertyName.text
          : element.name.text;
        required.set(element.name.text, { imported, specifier });
      }
    }
  }
  const targets = new Map<string, string | null>();
  const record = (exported: string, local: string, specifier?: string): void => {
    if (!classNames.has(exported) || exported !== local || targets.has(exported)) return;
    if (specifier !== undefined) {
      targets.set(exported, specifier);
      return;
    }
    const imported = required.get(local);
    if (imported !== undefined && imported.imported === exported) targets.set(exported, imported.specifier);
    else if (localClasses.has(local)) targets.set(exported, null);
  };
  for (const statement of sourceFile.statements) {
    if (
      ts.isClassDeclaration(statement) &&
      statement.name !== undefined &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      record(statement.name.text, statement.name.text);
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      const specifier = statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;
      if (specifier !== undefined && !specifier.startsWith(".")) continue;
      for (const element of statement.exportClause.elements) {
        record(element.name.text, element.propertyName?.text ?? element.name.text, specifier);
      }
      continue;
    }
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) continue;
    const { left, right, operatorToken } = statement.expression;
    if (operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
    if (
      ts.isPropertyAccessExpression(left) &&
      ts.isIdentifier(right) &&
      ((ts.isIdentifier(left.expression) && left.expression.text === "exports") ||
        (ts.isPropertyAccessExpression(left.expression) &&
          ts.isIdentifier(left.expression.expression) &&
          left.expression.expression.text === "module" &&
          left.expression.name.text === "exports"))
    ) {
      record(left.name.text, right.text);
      continue;
    }
    if (
      ts.isPropertyAccessExpression(left) &&
      ts.isIdentifier(left.expression) &&
      left.expression.text === "module" &&
      left.name.text === "exports" &&
      ts.isObjectLiteralExpression(right)
    ) {
      for (const property of right.properties) {
        if (ts.isShorthandPropertyAssignment(property)) record(property.name.text, property.name.text);
        else if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          ts.isIdentifier(property.initializer)
        ) {
          record(property.name.text, property.initializer.text);
        }
      }
    }
  }
  return targets;
}

function exportedClassNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isClassDeclaration(statement) &&
      statement.name !== undefined &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      names.add(statement.name.text);
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) names.add(element.propertyName?.text ?? element.name.text);
      continue;
    }
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) continue;
    const { left, right, operatorToken } = statement.expression;
    if (operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
    if (
      ts.isPropertyAccessExpression(left) &&
      ts.isIdentifier(right) &&
      ((ts.isIdentifier(left.expression) && left.expression.text === "exports") ||
        (ts.isPropertyAccessExpression(left.expression) &&
          ts.isIdentifier(left.expression.expression) &&
          left.expression.expression.text === "module" &&
          left.expression.name.text === "exports")) &&
      left.name.text === right.text
    ) {
      names.add(right.text);
      continue;
    }
    if (
      ts.isPropertyAccessExpression(left) &&
      ts.isIdentifier(left.expression) &&
      left.expression.text === "module" &&
      left.name.text === "exports" &&
      ts.isObjectLiteralExpression(right)
    ) {
      for (const property of right.properties) {
        if (ts.isShorthandPropertyAssignment(property)) names.add(property.name.text);
        else if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          ts.isIdentifier(property.initializer) &&
          property.name.text === property.initializer.text
        ) {
          names.add(property.name.text);
        }
      }
    }
  }
  return names;
}

function overloadComment(signature: NpmStaticOverloadSignature): string {
  const params = signature.parameters.map((parameter) =>
    `@param {${parameter.type}} ${parameter.optional ? `[${parameter.name}]` : parameter.name}`
  );
  return `/** @overload ${params.join(" ")} @returns {${signature.returnType}} */`;
}

function implementationComment(
  className: string,
  method: ts.MethodDeclaration,
  signatures: readonly NpmStaticOverloadSignature[],
): string | null {
  if (method.parameters.some((parameter) => !ts.isIdentifier(parameter.name) || parameter.dotDotDotToken !== undefined)) return null;
  const maxParams = Math.max(...signatures.map((signature) => signature.parameters.length));
  if (method.parameters.length !== maxParams) return null;
  const params: string[] = [];
  for (let index = 0; index < maxParams; index++) {
    const types = [...new Set(signatures.flatMap((signature) => signature.parameters[index]?.type ?? []))];
    if (types.length === 0) return null;
    const parameter = method.parameters[index];
    if (parameter === undefined || !ts.isIdentifier(parameter.name)) return null;
    const name = parameter.name.text;
    const optional = signatures.some((signature) => {
      const candidate = signature.parameters[index];
      return candidate === undefined || candidate.optional;
    });
    params.push(`@param {${types.join(" | ")}} ${optional ? `[${name}]` : name}`);
  }
  const returns = [...new Set(signatures.map((signature) =>
    signature.returnType.replace(/\bthis\b/g, className)
  ))];
  return `/** ${params.join(" ")} @returns {${returns.join(" | ")}} */`;
}

/** Injects declaration overload JSDoc into matching exported JS classes. */
export function applyNpmStaticDeclarationOverloads(
  sourcePath: string,
  source: string,
  declarations: NpmStaticDeclarationOverloads,
): NpmStaticOverloadRewrite | null {
  if (declarations.size === 0) return null;
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const exported = exportedClassNames(sourceFile);
  const inserts: { offset: number; text: string }[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || statement.name === undefined || !exported.has(statement.name.text)) continue;
    const classOverloads = declarations.get(statement.name.text);
    if (classOverloads === undefined) continue;
    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name) || member.body === undefined) continue;
      const signatures = classOverloads.get(member.name.text);
      if (signatures === undefined) continue;
      const jsDocs = (member as ts.MethodDeclaration & { jsDoc?: readonly ts.JSDoc[] }).jsDoc ?? [];
      if (jsDocs.some((doc) => source.slice(doc.pos, doc.end).includes("@overload"))) continue;
      const implementation = jsDocs.length === 0 ? implementationComment(statement.name.text, member, signatures) : null;
      if (jsDocs.length === 0 && implementation === null) continue;
      const offset = jsDocs[0]?.getStart(sourceFile) ?? member.getStart(sourceFile);
      const text = `${signatures.map(overloadComment).join(" ")} ${implementation === null ? "" : implementation + " "}`;
      inserts.push({ offset, text });
    }
  }
  if (inserts.length === 0) return null;
  let text = source;
  for (const insert of [...inserts].sort((a, b) => b.offset - a.offset)) {
    text = text.slice(0, insert.offset) + insert.text + text.slice(insert.offset);
  }
  return {
    text,
    insertions: inserts
      .sort((a, b) => a.offset - b.offset)
      .map((insert) => ({ offset: insert.offset, length: insert.text.length })),
  };
}
