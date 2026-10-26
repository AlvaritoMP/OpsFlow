/** Fórmulas editables de la liquidación.
 * Lenguaje acotado: números, nombres, + - * /, comparaciones, paréntesis y max, min, if.
 * No ejecuta código libre.
 */

export type BillingFormulaGroup = 'remuneracion' | 'cargas' | 'costo' | 'liquidacion';

export interface BillingFormulaDefinition {
  id: string;
  label: string;
  group: BillingFormulaGroup;
  expression: string;
}

export interface BillingFormulaInput {
  id: string;
  label: string;
  scope: 'worker' | 'billing';
}

export type BillingFormulaSet = Record<string, string>;

export const FORMULA_GROUP_LABELS: Record<BillingFormulaGroup, string> = {
  remuneracion: 'Remuneración',
  cargas: 'Cargas',
  costo: 'Costo del trabajador',
  liquidacion: 'Liquidación',
};

export const BILLING_FORMULA_INPUTS: BillingFormulaInput[] = [
  { id: 'sueldo', label: 'sueldo establecido', scope: 'worker' },
  { id: 'dias', label: 'días trabajados', scope: 'worker' },
  { id: 'diasVacaciones', label: 'días de vacaciones gozadas', scope: 'worker' },
  { id: 'asignacion', label: 'asignación familiar', scope: 'worker' },
  { id: 'condicionTrabajo', label: 'condición de trabajo', scope: 'worker' },
  { id: 'bonos', label: 'bonos', scope: 'worker' },
  { id: 'factor', label: 'factor', scope: 'worker' },
  { id: 'he25Horas', label: 'horas extra diurnas 25%', scope: 'worker' },
  { id: 'he25Manual', label: 'monto manual de hora extra diurna 25%', scope: 'worker' },
  { id: 'he25ManualActivo', label: 'hora extra diurna 25% escrita a mano', scope: 'worker' },
  { id: 'he35Horas', label: 'horas extra diurnas 35%', scope: 'worker' },
  { id: 'he35Manual', label: 'monto manual de hora extra diurna 35%', scope: 'worker' },
  { id: 'he35ManualActivo', label: 'hora extra diurna 35% escrita a mano', scope: 'worker' },
  { id: 'heNoche25Horas', label: 'horas extra nocturnas 25%', scope: 'worker' },
  { id: 'heNoche25Manual', label: 'monto manual de hora extra nocturna 25%', scope: 'worker' },
  { id: 'heNoche25ManualActivo', label: 'hora extra nocturna 25% escrita a mano', scope: 'worker' },
  { id: 'heNoche35Horas', label: 'horas extra nocturnas 35%', scope: 'worker' },
  { id: 'heNoche35Manual', label: 'monto manual de hora extra nocturna 35%', scope: 'worker' },
  { id: 'heNoche35ManualActivo', label: 'hora extra nocturna 35% escrita a mano', scope: 'worker' },
  { id: 'bonoHoras', label: 'horas de bono nocturno', scope: 'worker' },
  { id: 'bonoManual', label: 'monto manual del bono nocturno', scope: 'worker' },
  { id: 'bonoManualActivo', label: 'bono nocturno escrito a mano', scope: 'worker' },
  { id: 'diasMes', label: 'días del mes', scope: 'worker' },
  { id: 'horasDia', label: 'horas por día', scope: 'worker' },
  { id: 'tasaVacaciones', label: 'tasa de vacaciones', scope: 'worker' },
  { id: 'tasaGratificacion', label: 'tasa de gratificación', scope: 'worker' },
  { id: 'factorBonificacion', label: 'factor de bonificación extraordinaria', scope: 'worker' },
  { id: 'tasaCts', label: 'tasa de CTS', scope: 'worker' },
  { id: 'tasaFeriado', label: 'tasa de feriados', scope: 'worker' },
  { id: 'aplicaFeriado', label: 'se incluyen feriados', scope: 'worker' },
  { id: 'tasaEssalud', label: 'tasa de EsSalud', scope: 'worker' },
  { id: 'essaludFijo', label: 'EsSalud en monto fijo', scope: 'worker' },
  { id: 'montoEssalud', label: 'monto fijo de EsSalud', scope: 'worker' },
  { id: 'rmv', label: 'remuneración mínima vital', scope: 'worker' },
  { id: 'tasaVidaLey', label: 'tasa de Vida Ley', scope: 'worker' },
  { id: 'aplicaVidaLey', label: 'se incluye Vida Ley', scope: 'worker' },
  { id: 'tasaSctr', label: 'tasa de SCTR', scope: 'worker' },
  { id: 'aplicaSctr', label: 'se incluye SCTR', scope: 'worker' },
  { id: 'factorHe25', label: 'factor de hora extra 25%', scope: 'worker' },
  { id: 'factorHe35', label: 'factor de hora extra 35%', scope: 'worker' },
  { id: 'recargoNocturno', label: 'recargo nocturno', scope: 'worker' },
  { id: 'heDiaConAsignacion', label: 'asignación familiar en la hora extra diurna', scope: 'worker' },
  { id: 'heNocheConAsignacion', label: 'asignación familiar en la hora extra nocturna', scope: 'worker' },
  { id: 'heNocheConRecargo', label: 'recargo nocturno en la hora extra nocturna', scope: 'worker' },
  { id: 'bonoConAsignacion', label: 'asignación familiar en el bono nocturno', scope: 'worker' },
  { id: 'ajusteBasico', label: 'ajuste de remuneración básica', scope: 'worker' },
  { id: 'ajusteHe25', label: 'ajuste de hora extra diurna 25%', scope: 'worker' },
  { id: 'ajusteHe35', label: 'ajuste de hora extra diurna 35%', scope: 'worker' },
  { id: 'ajusteHeNoche25', label: 'ajuste de hora extra nocturna 25%', scope: 'worker' },
  { id: 'ajusteHeNoche35', label: 'ajuste de hora extra nocturna 35%', scope: 'worker' },
  { id: 'ajusteBono', label: 'ajuste de bono nocturno', scope: 'worker' },
  { id: 'ajusteVacaciones', label: 'ajuste de vacaciones', scope: 'worker' },
  { id: 'ajusteGratificacion', label: 'ajuste de gratificación', scope: 'worker' },
  { id: 'ajusteCts', label: 'ajuste de CTS', scope: 'worker' },
  { id: 'ajusteFeriado', label: 'ajuste de feriados', scope: 'worker' },
  { id: 'ajusteEssalud', label: 'ajuste de EsSalud', scope: 'worker' },
  { id: 'ajusteVidaLey', label: 'ajuste de Vida Ley', scope: 'worker' },
  { id: 'ajusteSctr', label: 'ajuste de SCTR', scope: 'worker' },
  { id: 'costoLaboral', label: 'costo laboral', scope: 'billing' },
  { id: 'costoOperativo', label: 'costo operativo', scope: 'billing' },
  { id: 'costoAdministrativo', label: 'gastos administrativos', scope: 'billing' },
  { id: 'tasaFinanciera', label: 'tasa financiera anual', scope: 'billing' },
  { id: 'diasFinanciados', label: 'días financiados', scope: 'billing' },
  { id: 'utilidadSoloLaboral', label: 'utilidad solo sobre el costo laboral', scope: 'billing' },
  { id: 'margenSobrePrecio', label: 'margen sobre el precio', scope: 'billing' },
  { id: 'tasaUtilidad', label: 'tasa de utilidad', scope: 'billing' },
  { id: 'tasaIgv', label: 'tasa de IGV', scope: 'billing' },
];

const DAY_HOUR = '/ diasMes / horasDia';

export const BILLING_FORMULA_DEFS: BillingFormulaDefinition[] = [
  { id: 'basico', label: 'remuneración básica', group: 'remuneracion', expression: 'sueldo / diasMes * dias' },
  {
    id: 'he25',
    label: 'hora extra diurna 25%',
    group: 'remuneracion',
    expression: `if(he25ManualActivo, he25Manual, (sueldo + if(heDiaConAsignacion, asignacion, 0)) ${DAY_HOUR} * factorHe25 * he25Horas)`,
  },
  {
    id: 'he35',
    label: 'hora extra diurna 35%',
    group: 'remuneracion',
    expression: `if(he35ManualActivo, he35Manual, (sueldo + if(heDiaConAsignacion, asignacion, 0)) ${DAY_HOUR} * factorHe35 * he35Horas)`,
  },
  {
    id: 'heNoche25',
    label: 'hora extra nocturna 25%',
    group: 'remuneracion',
    expression: `if(heNoche25ManualActivo, heNoche25Manual, (sueldo + if(heNocheConRecargo, sueldo * recargoNocturno, 0) + if(heNocheConAsignacion, asignacion, 0)) ${DAY_HOUR} * factorHe25 * heNoche25Horas)`,
  },
  {
    id: 'heNoche35',
    label: 'hora extra nocturna 35%',
    group: 'remuneracion',
    expression: `if(heNoche35ManualActivo, heNoche35Manual, (sueldo + if(heNocheConRecargo, sueldo * recargoNocturno, 0) + if(heNocheConAsignacion, asignacion, 0)) ${DAY_HOUR} * factorHe35 * heNoche35Horas)`,
  },
  {
    id: 'bonoNocturno',
    label: 'bono nocturno',
    group: 'remuneracion',
    expression: `if(bonoManualActivo, bonoManual, (sueldo + if(bonoConAsignacion, asignacion, 0)) ${DAY_HOUR} * recargoNocturno * bonoHoras)`,
  },
  {
    id: 'sueldoVacaciones',
    label: 'sueldo de vacaciones gozadas',
    group: 'remuneracion',
    expression: 'if(diasVacaciones, min(max(0, sueldo / diasMes * diasVacaciones), max(0, sueldo - basico)), 0)',
  },
  {
    id: 'remCargas',
    label: 'remuneración para cargas',
    group: 'remuneracion',
    expression: 'basico + asignacion + he25 + he35 + heNoche25 + heNoche35 + bonoNocturno + sueldoVacaciones',
  },
  {
    id: 'remTotal',
    label: 'remuneración total',
    group: 'remuneracion',
    expression: 'basico + asignacion + he25 + he35 + heNoche25 + heNoche35 + bonoNocturno + condicionTrabajo + bonos',
  },
  { id: 'vacaciones', label: 'vacaciones', group: 'cargas', expression: 'remCargas * tasaVacaciones' },
  { id: 'gratificacion', label: 'gratificación', group: 'cargas', expression: 'remCargas * factorBonificacion * tasaGratificacion' },
  { id: 'cts', label: 'CTS', group: 'cargas', expression: 'remCargas * tasaCts' },
  { id: 'feriado', label: 'feriados', group: 'cargas', expression: 'if(aplicaFeriado, remCargas * tasaFeriado, 0)' },
  { id: 'baseEssalud', label: 'base de EsSalud', group: 'cargas', expression: 'max(remCargas + vacaciones + feriado, rmv)' },
  { id: 'essalud', label: 'EsSalud', group: 'cargas', expression: 'if(essaludFijo, montoEssalud, baseEssalud * tasaEssalud)' },
  { id: 'vidaLey', label: 'Vida Ley', group: 'cargas', expression: 'if(aplicaVidaLey, (sueldo + asignacion) * tasaVidaLey, 0)' },
  { id: 'sctr', label: 'SCTR', group: 'cargas', expression: 'if(aplicaSctr, (sueldo + asignacion) * tasaSctr, 0)' },
  {
    id: 'costoMes',
    label: 'costo del mes',
    group: 'costo',
    expression:
      'remTotal + ajusteBasico + ajusteHe25 + ajusteHe35 + ajusteHeNoche25 + ajusteHeNoche35 + ajusteBono + vacaciones + ajusteVacaciones + gratificacion + ajusteGratificacion + cts + ajusteCts + feriado + ajusteFeriado + essalud + ajusteEssalud + vidaLey + ajusteVidaLey + sctr + ajusteSctr',
  },
  { id: 'costoTotal', label: 'costo total', group: 'costo', expression: 'costoMes * factor' },
  {
    id: 'financiero',
    label: 'costo financiero',
    group: 'liquidacion',
    expression: '(costoLaboral + costoOperativo) * (tasaFinanciera / 365) * diasFinanciados',
  },
  {
    id: 'baseUtilidad',
    label: 'base de utilidad',
    group: 'liquidacion',
    expression: 'if(utilidadSoloLaboral, costoLaboral, costoLaboral + costoOperativo + costoAdministrativo)',
  },
  {
    id: 'utilidad',
    label: 'utilidad',
    group: 'liquidacion',
    expression:
      'if(baseUtilidad > 0, if(tasaUtilidad > 0, if(margenSobrePrecio, baseUtilidad / (1 - min(tasaUtilidad, 0.95)) * min(tasaUtilidad, 0.95), baseUtilidad * tasaUtilidad), 0), 0)',
  },
  { id: 'igv', label: 'IGV', group: 'liquidacion', expression: '(costoLaboral + costoOperativo + costoAdministrativo + utilidad) * tasaIgv' },
];

const FORMULA_BY_ID = new Map(BILLING_FORMULA_DEFS.map((item) => [item.id, item]));
const INPUT_BY_ID = new Map(BILLING_FORMULA_INPUTS.map((item) => [item.id, item]));
const LABEL_BY_ID = new Map<string, string>([
  ...BILLING_FORMULA_INPUTS.map((item) => [item.id, item.label] as const),
  ...BILLING_FORMULA_DEFS.map((item) => [item.id, item.label] as const),
]);

export const WORKER_FORMULA_IDS = BILLING_FORMULA_DEFS.filter((item) => item.group !== 'liquidacion').map((item) => item.id);
export const BILLING_FORMULA_IDS = BILLING_FORMULA_DEFS.filter((item) => item.group === 'liquidacion').map((item) => item.id);

const WORKER_NAMES = new Set<string>([
  ...BILLING_FORMULA_INPUTS.filter((item) => item.scope === 'worker').map((item) => item.id),
  ...WORKER_FORMULA_IDS,
]);
const BILLING_NAMES = new Set<string>([
  ...BILLING_FORMULA_INPUTS.filter((item) => item.scope === 'billing').map((item) => item.id),
  ...BILLING_FORMULA_IDS,
]);

export function defaultBillingFormulas(): BillingFormulaSet {
  return Object.fromEntries(BILLING_FORMULA_DEFS.map((item) => [item.id, item.expression]));
}

export function normalizeBillingFormulas(input?: BillingFormulaSet | null): BillingFormulaSet {
  const defaults = defaultBillingFormulas();
  const source = input || {};
  const next: BillingFormulaSet = {};
  BILLING_FORMULA_DEFS.forEach((item) => {
    const raw = source[item.id];
    next[item.id] = typeof raw === 'string' && raw.trim() ? raw.trim() : defaults[item.id];
  });
  return next;
}

export function formulaLabel(id: string): string {
  return FORMULA_BY_ID.get(id)?.label || INPUT_BY_ID.get(id)?.label || id;
}

export interface FormulaIssue {
  id: string;
  message: string;
}

export function validateBillingFormulas(input?: BillingFormulaSet | null): FormulaIssue[] {
  const formulas = normalizeBillingFormulas(input);
  const issues: FormulaIssue[] = [];
  BILLING_FORMULA_DEFS.forEach((item) => {
    const expression = formulas[item.id];
    if (expression.length > 1200) {
      issues.push({ id: item.id, message: `La fórmula de ${item.label} es demasiado larga.` });
      return;
    }
    let deps: string[] = [];
    try {
      deps = referencedNames(parseFormula(expression));
    } catch (error) {
      issues.push({ id: item.id, message: `Fórmula de ${item.label}: ${error instanceof Error ? error.message : 'no se pudo leer'}.` });
      return;
    }
    const allowed = item.group === 'liquidacion' ? BILLING_NAMES : WORKER_NAMES;
    deps.forEach((name) => {
      if (!allowed.has(name)) {
        const known = LABEL_BY_ID.has(name);
        issues.push({
          id: item.id,
          message: known
            ? `La fórmula de ${item.label} no puede usar ${formulaLabel(name)}.`
            : `La fórmula de ${item.label} no reconoce «${name}».`,
        });
      }
    });
  });
  if (!issues.length) {
    try {
      assertAcyclic(formulas, WORKER_FORMULA_IDS);
      assertAcyclic(formulas, BILLING_FORMULA_IDS);
    } catch (error) {
      issues.push({ id: 'basico', message: error instanceof Error ? error.message : 'Hay una referencia circular.' });
    }
  }
  return issues;
}

export function describeFormula(id: string, formulas?: BillingFormulaSet | null): string {
  const expression = normalizeBillingFormulas(formulas)[id];
  if (!expression) return '';
  try {
    return describeExpression(expression);
  } catch {
    return '';
  }
}

export function describeExpression(expression: string): string {
  const text = describeNode(parseFormula(expression));
  if (!text) return '';
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return sentence.endsWith('.') ? sentence : `${sentence}.`;
}

export function evaluateFormulas(
  formulas: BillingFormulaSet | null | undefined,
  scope: Record<string, number>,
  ids: readonly string[]
): Record<string, number> {
  const normalized = normalizeBillingFormulas(formulas);
  try {
    return evaluateNormalized(normalized, scope, ids);
  } catch (error) {
    if (!formulas || formulas === normalized) throw error;
    return evaluateNormalized(defaultBillingFormulas(), scope, ids);
  }
}

type Ast =
  | { t: 'n'; v: number }
  | { t: 'id'; n: string }
  | { t: 'un'; v: Ast }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '>' | '<' | '>=' | '<=' | '='; l: Ast; r: Ast }
  | { t: 'call'; n: 'max' | 'min' | 'if'; a: Ast[] };

type Token =
  | { t: 'n'; v: number }
  | { t: 'id'; n: string }
  | { t: 'op'; v: string }
  | { t: 'p'; v: '(' | ')' | ',' };

function parseFormula(expression: string): Ast {
  const tokens = tokenize(expression);
  let index = 0;
  const peek = () => tokens[index];
  const eat = (value?: string) => {
    const token = tokens[index];
    if (!token || (value && (token.t !== 'op' && token.t !== 'p' ? false : token.v !== value))) {
      throw new Error('revise paréntesis, comas y operadores');
    }
    index += 1;
    return token;
  };

  const parseCmp = (): Ast => {
    let node = parseAdd();
    while (peek() && peek().t === 'op' && ['>', '<', '>=', '<=', '='].includes((peek() as { v: string }).v)) {
      const op = (eat() as { v: '>' | '<' | '>=' | '<=' | '=' }).v;
      node = { t: 'bin', op, l: node, r: parseAdd() };
    }
    return node;
  };
  const parseAdd = (): Ast => {
    let node = parseMul();
    while (peek() && peek().t === 'op' && ((peek() as { v: string }).v === '+' || (peek() as { v: string }).v === '-')) {
      const op = (eat() as { v: '+' | '-' }).v;
      node = { t: 'bin', op, l: node, r: parseMul() };
    }
    return node;
  };
  const parseMul = (): Ast => {
    let node = parseUnary();
    while (peek() && peek().t === 'op' && ((peek() as { v: string }).v === '*' || (peek() as { v: string }).v === '/')) {
      const op = (eat() as { v: '*' | '/' }).v;
      node = { t: 'bin', op, l: node, r: parseUnary() };
    }
    return node;
  };
  const parseUnary = (): Ast => {
    if (peek() && peek().t === 'op' && (peek() as { v: string }).v === '-') {
      eat('-');
      return { t: 'un', v: parseUnary() };
    }
    return parsePrimary();
  };
  const parsePrimary = (): Ast => {
    const token = peek();
    if (!token) throw new Error('la fórmula está incompleta');
    if (token.t === 'n') {
      index += 1;
      return { t: 'n', v: token.v };
    }
    if (token.t === 'id') {
      index += 1;
      if (peek() && peek().t === 'p' && (peek() as { v: string }).v === '(') {
        if (token.n !== 'max' && token.n !== 'min' && token.n !== 'if') throw new Error(`la función ${token.n} no existe`);
        eat('(');
        const args: Ast[] = [];
        if (!(peek() && peek().t === 'p' && (peek() as { v: string }).v === ')')) {
          args.push(parseCmp());
          while (peek() && peek().t === 'p' && (peek() as { v: string }).v === ',') {
            eat(',');
            args.push(parseCmp());
          }
        }
        eat(')');
        if (token.n === 'if' && args.length !== 3) throw new Error('if necesita condición, valor si se cumple y valor si no');
        if ((token.n === 'max' || token.n === 'min') && args.length < 2) throw new Error(`${token.n} necesita al menos dos valores`);
        return { t: 'call', n: token.n, a: args };
      }
      return { t: 'id', n: token.n };
    }
    if (token.t === 'p' && token.v === '(') {
      eat('(');
      const node = parseCmp();
      eat(')');
      return node;
    }
    throw new Error('hay un símbolo que no forma parte de la fórmula');
  };

  const ast = parseCmp();
  if (index < tokens.length) throw new Error('sobra texto al final de la fórmula');
  return ast;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const char = expression[i];
    if (char === ' ' || char === '\n' || char === '\t' || char === '\r') {
      i += 1;
      continue;
    }
    if (char >= '0' && char <= '9' || (char === '.' && expression[i + 1] >= '0' && expression[i + 1] <= '9')) {
      let end = i + 1;
      while (end < expression.length && expression[end] >= '0' && expression[end] <= '9') end += 1;
      if (expression[end] === '.') {
        end += 1;
        const start = end;
        while (end < expression.length && expression[end] >= '0' && expression[end] <= '9') end += 1;
        if (end === start) throw new Error('hay un número incompleto');
      }
      const value = Number(expression.slice(i, end));
      if (!Number.isFinite(value)) throw new Error('hay un número que no se puede leer');
      tokens.push({ t: 'n', v: value });
      i = end;
      continue;
    }
    if ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || char === '_') {
      let end = i + 1;
      while (end < expression.length) {
        const next = expression[end];
        if ((next >= 'A' && next <= 'Z') || (next >= 'a' && next <= 'z') || (next >= '0' && next <= '9') || next === '_') end += 1;
        else break;
      }
      tokens.push({ t: 'id', n: expression.slice(i, end) });
      i = end;
      continue;
    }
    const two = expression.slice(i, i + 2);
    if (two === '>=' || two === '<=') {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/><=()'.includes(char) || char === ',') {
      tokens.push(char === '(' || char === ')' || char === ',' ? { t: 'p', v: char } : { t: 'op', v: char });
      i += 1;
      continue;
    }
    throw new Error(`«${char}» no se usa en las fórmulas`);
  }
  return tokens;
}

function referencedNames(ast: Ast): string[] {
  const names = new Set<string>();
  const walk = (node: Ast) => {
    if (node.t === 'id') names.add(node.n);
    else if (node.t === 'un') walk(node.v);
    else if (node.t === 'bin') {
      walk(node.l);
      walk(node.r);
    } else if (node.t === 'call') node.a.forEach(walk);
  };
  walk(ast);
  return [...names];
}

function assertAcyclic(formulas: BillingFormulaSet, ids: readonly string[]) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`La fórmula de ${formulaLabel(id)} queda en círculo.`);
    visiting.add(id);
    referencedNames(parseFormula(formulas[id] || '')).forEach((name) => {
      if (ids.includes(name)) visit(name);
    });
    visiting.delete(id);
    visited.add(id);
  };
  ids.forEach(visit);
}

function evaluateNormalized(formulas: BillingFormulaSet, scope: Record<string, number>, ids: readonly string[]): Record<string, number> {
  const values: Record<string, number> = { ...scope };
  const pending = new Set(ids);
  const stack: string[] = [];
  const evalId = (id: string): number => {
    if (!pending.has(id) && Object.prototype.hasOwnProperty.call(values, id)) return values[id];
    if (!formulas[id]) throw new Error(`Falta el dato «${id}».`);
    if (stack.includes(id)) throw new Error(`La fórmula de ${formulaLabel(id)} queda en círculo.`);
    stack.push(id);
    const value = evalAst(parseFormula(formulas[id]), (name) => (formulas[name] && (pending.has(name) || !Object.prototype.hasOwnProperty.call(values, name)) ? evalId(name) : readScope(values, name)));
    stack.pop();
    pending.delete(id);
    values[id] = value;
    return value;
  };
  const result: Record<string, number> = {};
  ids.forEach((id) => {
    result[id] = evalId(id);
  });
  return result;
}

function readScope(values: Record<string, number>, name: string): number {
  if (!Object.prototype.hasOwnProperty.call(values, name)) throw new Error(`Falta el dato «${name}».`);
  const value = values[name];
  return Number.isFinite(value) ? value : 0;
}

function evalAst(ast: Ast, lookup: (name: string) => number): number {
  const finish = (value: number) => (Number.isFinite(value) ? value : 0);
  if (ast.t === 'n') return ast.v;
  if (ast.t === 'id') return lookup(ast.n);
  if (ast.t === 'un') return finish(-evalAst(ast.v, lookup));
  if (ast.t === 'call') {
    const args = ast.a.map((item) => evalAst(item, lookup));
    if (ast.n === 'max') return finish(Math.max(...args));
    if (ast.n === 'min') return finish(Math.min(...args));
    return Math.abs(args[0]) > 1e-12 ? finish(args[1]) : finish(args[2]);
  }
  const left = evalAst(ast.l, lookup);
  const right = evalAst(ast.r, lookup);
  if (ast.op === '+') return finish(left + right);
  if (ast.op === '-') return finish(left - right);
  if (ast.op === '*') return finish(left * right);
  if (ast.op === '/') return right === 0 ? 0 : finish(left / right);
  if (ast.op === '>') return left > right ? 1 : 0;
  if (ast.op === '<') return left < right ? 1 : 0;
  if (ast.op === '>=') return left >= right ? 1 : 0;
  if (ast.op === '<=') return left <= right ? 1 : 0;
  return left === right ? 1 : 0;
}

function describeNode(ast: Ast): string {
  if (ast.t === 'n') return formatNumber(ast.v);
  if (ast.t === 'id') return LABEL_BY_ID.get(ast.n) || ast.n;
  if (ast.t === 'un') return `− ${describeNode(ast.v)}`;
  if (ast.t === 'call') {
    if (ast.n === 'if') return describeIf(ast.a[0], ast.a[1], ast.a[2]);
    const joiner = ast.n === 'max' ? 'el mayor entre' : 'el menor entre';
    return `${joiner} ${ast.a.map((item) => describeArg(item)).join(' y ')}`;
  }
  const op = ast.op === '*' ? '×' : ast.op === '/' ? '/' : ast.op === '-' ? '−' : ast.op;
  return `${describeArg(ast.l, ast.op)} ${op} ${describeArg(ast.r, ast.op)}`;
}

function describeIf(cond: Ast, yes: Ast, no: Ast): string {
  if (no.t === 'n' && no.v === 0) return `${describeNode(yes)} cuando ${describeNode(cond)}`;
  return `si ${describeNode(cond)}, ${describeNode(yes)}; si no, ${describeNode(no)}`;
}

function describeArg(ast: Ast, parentOp?: string): string {
  const text = describeNode(ast);
  if (ast.t === 'bin' && (parentOp === '+' || parentOp === '*') && ast.op === parentOp) return text;
  return ast.t === 'bin' || ast.t === 'un' || ast.t === 'call' ? `(${text})` : text;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}
