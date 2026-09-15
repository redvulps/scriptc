import * as ts from "../ts7/adapter.js";
import type { IrExpr, IrType } from "../../ir/ir.js";
import { typeEquals } from "../../ir/ir.js";
import type { Lowerer } from "./lowerer.js";
import { isSafeToDiscard } from "./expressions/evaluation-safety.js";

/** Lower an expression whose checker type is statically `undefined`/`void`. */
export function lowerStaticallyUndefinedArgument(lowerer: Lowerer, node: ts.Expression): IrExpr | null {
  const peelErasableWrappers = (value: ts.Expression): ts.Expression => {
    let expr = value;
    while (
      ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isTypeAssertion(expr) ||
      ts.isSatisfiesExpression(expr)
    ) {
      expr = expr.expression;
    }
    return expr;
  };
  let expr = node;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if ((lowerer.typeOf(expr).flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) === 0) return null;
  expr = peelErasableWrappers(expr);
  let sawVoid = false;
  while (ts.isVoidExpression(expr)) {
    sawVoid = true;
    expr = peelErasableWrappers(expr.expression);
  }
  return sawVoid ? lowerer.lowerExpr(expr) : lowerer.lowerExpr(node);
}

/** Preserve an explicitly undefined argument's effects, then use its default. */
export function defaultAfterUndefined(value: IrExpr, defaultValue: IrExpr): IrExpr {
  if (isSafeToDiscard(value)) return defaultValue;
  return {
    kind: "seqExpr",
    stmts: [{ kind: "exprStmt", expr: value, loc: value.loc }],
    result: defaultValue,
    type: defaultValue.type,
    loc: value.loc,
  };
}

/** Lower an optional argument, applying its default only to the undefined arm. */
export function lowerOptionalArgument(
  lowerer: Lowerer,
  node: ts.Expression,
  expected: IrType,
  defaultValue: IrExpr,
): IrExpr {
  const undefinedArg = lowerStaticallyUndefinedArgument(lowerer, node);
  if (undefinedArg) return defaultAfterUndefined(undefinedArg, defaultValue);
  const value = lowerer.lowerExpr(node);
  if (value.type.kind === "union") {
    const def = lowerer.unions.get(value.type.unionId);
    if (
      def?.arms.length === 2 &&
      def.arms.some((arm) => arm.kind === "undefinedT") &&
      def.arms.some((arm) => typeEquals(arm, expected))
    ) {
      return { kind: "nullish", left: value, right: defaultValue, type: expected, loc: value.loc };
    }
  }
  return lowerer.coerceInto(node, value, expected);
}
