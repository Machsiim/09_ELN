import { FormulaToken } from '../models/template-schema';

type OperatorSymbol = '+' | '-' | '*' | '/' | '(' | ')';

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

export function validateFormula(tokens: FormulaToken[]): string | null {
  if (tokens.length === 0) {
    return 'Formel ist leer.';
  }

  let depth = 0;
  let prev: FormulaToken | null = null;

  for (const t of tokens) {
    if (t.kind === 'operator') {
      if (t.op === '(') {
        depth++;
        if (prev && (prev.kind !== 'operator' || (prev.op !== '(' && !isBinaryOp(prev.op)))) {
          return 'Ungültige Klammersetzung.';
        }
      } else if (t.op === ')') {
        depth--;
        if (depth < 0) {
          return 'Klammer schließt ohne öffnende Klammer.';
        }
        if (!prev || (prev.kind === 'operator' && prev.op !== ')')) {
          return 'Vor ")" muss ein Wert stehen.';
        }
      } else {
        if (!prev || (prev.kind === 'operator' && prev.op !== ')')) {
          return 'Operator ohne vorangehenden Wert.';
        }
      }
    } else {
      if (prev && (prev.kind !== 'operator' || prev.op === ')')) {
        return 'Zwei Werte ohne Operator dazwischen.';
      }
    }
    prev = t;
  }

  if (depth !== 0) {
    return 'Klammern nicht ausgeglichen.';
  }
  if (prev && prev.kind === 'operator' && isBinaryOp(prev.op)) {
    return 'Formel endet mit einem Operator.';
  }
  return null;
}

function isBinaryOp(op: OperatorSymbol): boolean {
  return op === '+' || op === '-' || op === '*' || op === '/';
}

export function evaluateFormula(
  tokens: FormulaToken[],
  resolveField: (fieldId: string) => number | null
): number | null {
  if (validateFormula(tokens) !== null) {
    return null;
  }

  const output: (number | null)[] = [];
  const ops: OperatorSymbol[] = [];

  for (const t of tokens) {
    if (t.kind === 'number') {
      output.push(t.value);
    } else if (t.kind === 'field') {
      const value = resolveField(t.fieldId);
      output.push(value);
    } else {
      const op = t.op;
      if (op === '(') {
        ops.push(op);
      } else if (op === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') {
          if (!applyOp(output, ops.pop()!)) return null;
        }
        ops.pop();
      } else {
        while (
          ops.length &&
          ops[ops.length - 1] !== '(' &&
          PRECEDENCE[ops[ops.length - 1]] >= PRECEDENCE[op]
        ) {
          if (!applyOp(output, ops.pop()!)) return null;
        }
        ops.push(op);
      }
    }
  }

  while (ops.length) {
    if (!applyOp(output, ops.pop()!)) return null;
  }

  if (output.length !== 1) return null;
  const result = output[0];
  if (result === null || Number.isNaN(result) || !Number.isFinite(result)) return null;
  return result;
}

function applyOp(stack: (number | null)[], op: OperatorSymbol): boolean {
  const b = stack.pop();
  const a = stack.pop();
  if (a === undefined || b === undefined) return false;
  if (a === null || b === null) {
    stack.push(null);
    return true;
  }
  switch (op) {
    case '+': stack.push(a + b); return true;
    case '-': stack.push(a - b); return true;
    case '*': stack.push(a * b); return true;
    case '/':
      if (b === 0) { stack.push(null); return true; }
      stack.push(a / b); return true;
    default: return false;
  }
}

export function getReferencedFieldIds(tokens: FormulaToken[]): string[] {
  const ids = new Set<string>();
  for (const t of tokens) {
    if (t.kind === 'field') ids.add(t.fieldId);
  }
  return Array.from(ids);
}
