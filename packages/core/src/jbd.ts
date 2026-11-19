/**
 * JBD — emulação fiel de java.math.BigDecimal para paridade estrita.
 *
 * O Java BigDecimal carrega uma "escala" (número de casas decimais) que
 * propaga pelas operações e vaza para a saída via toString() — em
 * memoriaCalculo o original imprime "247.30000000" (escala 8) e "0.050000"
 * (escala 6). decimal.js NÃO preserva escala (remove zeros à direita), por
 * isso este wrapper rastreia escala explicitamente:
 *
 *   add/sub   → escala = max(s1, s2)          (Java: idem)
 *   mul       → escala = s1 + s2              (Java: idem)
 *   setScale  → escala = n
 *   div(n)    → escala = n (com HALF_EVEN)
 *   div128    → divisão com 34 dígitos significativos (MathContext.DECIMAL128)
 *   movePointRight(n) → escala = max(s - n, 0) (nunca negativa)
 *
 * O valor numérico é mantido exato por decimal.js (precisão 64 > qualquer
 * magnitude real do domínio), e o toString() implementa o algoritmo do Java
 * (notação científica apenas quando expoente ajustado < -6 ou escala < 0).
 */
import { Decimal } from "decimal.js";

Decimal.set({ precision: 64, rounding: Decimal.ROUND_HALF_EVEN });
const Dec128 = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

export type JBDInput = JBD | Decimal | number | string | null | undefined;

export class JBD {
  readonly dec: Decimal;
  readonly scale: number;

  constructor(value: Decimal, scale: number) {
    this.dec = value;
    this.scale = scale;
  }

  // ─── Construtores / parsing ───────────────────────────────────────────────

  /** Equivalente a new BigDecimal(String): aceita "200", "200.00", "1.3e2". */
  static parse(input: string): JBD {
    const s = input.trim();
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
    if (!m || (m[2] === "" && (m[3] === undefined || m[3] === ""))) {
      throw new Error(`Valor numérico inválido: ${input}`);
    }
    const int = m[2] ?? "0";
    const frac = m[3] ?? "";
    const exp = m[4] ? parseInt(m[4], 10) : 0;
    // escala = frac.length - exp  (sem reduzir zeros — como o Java)
    const scale = frac.length - exp;
    return new JBD(new Decimal(s), scale);
  }

  /** De número JSON: usa a forma decimal curta (String(n)) — igual a Jackson→BigDecimal. */
  static fromNumber(n: number): JBD {
    if (!Number.isFinite(n)) throw new Error(`Valor numérico inválido: ${n}`);
    return JBD.parse(String(n));
  }

  /** Aceita string, número, Decimal ou JBD. null/undefined → null. */
  static of(v: JBDInput): JBD | null {
    if (v === null || v === undefined) return null;
    if (v instanceof JBD) return v;
    if (v instanceof Decimal) return new JBD(v, v.decimalPlaces());
    if (typeof v === "number") return JBD.fromNumber(v);
    return JBD.parse(v);
  }

  static readonly ZERO = new JBD(new Decimal(0), 0);
  static readonly ONE = new JBD(new Decimal(1), 0);
  static readonly CEM = new JBD(new Decimal(100), 0);

  static zero(scale = 0): JBD {
    return new JBD(new Decimal(0), scale);
  }

  // ─── Operações (semântica Java) ───────────────────────────────────────────

  add(o: JBDInput): JBD {
    const b = JBD.of(o)!;
    return new JBD(this.dec.add(b.dec), Math.max(this.scale, b.scale));
  }

  subtract(o: JBDInput): JBD {
    const b = JBD.of(o)!;
    return new JBD(this.dec.sub(b.dec), Math.max(this.scale, b.scale));
  }

  multiply(o: JBDInput): JBD {
    const b = JBD.of(o)!;
    return new JBD(this.dec.mul(b.dec), this.scale + b.scale);
  }

  /** divide(divisor, escala, HALF_EVEN) — como ArredondamentoUtils.dividir. */
  divide(o: JBDInput, scale: number): JBD {
    const b = JBD.of(o)!;
    if (b.dec.isZero()) throw new Error("Division by zero");
    return new JBD(b === undefined ? this.dec : this.dec.div(b.dec).toDecimalPlaces(scale, Decimal.ROUND_HALF_EVEN), scale);
  }

  /** Divisão com MathContext.DECIMAL128 (34 dígitos, HALF_EVEN) — usada no avaliador. */
  divide128(o: JBDInput): JBD {
    const b = JBD.of(o)!;
    if (b.dec.isZero()) throw new Error("Division by zero");
    const r = new Dec128(this.dec).div(new Dec128(b.dec));
    // divisão exata → escala exata; inexata → 34 dígitos significativos
    // (o dp do resultado decimal.js sob precisão 34 já reflete isso)
    return new JBD(r, r.decimalPlaces());
  }

  negate(): JBD {
    return new JBD(this.dec.negated(), this.scale);
  }

  /** setScale(n, HALF_EVEN) — arredondamento interno. */
  setScale(scale: number): JBD {
    return new JBD(this.dec.toDecimalPlaces(scale, Decimal.ROUND_HALF_EVEN), scale);
  }

  /** movePointRight(n): desloca a vírgula n casas; escala nunca fica negativa. */
  movePointRight(n: number): JBD {
    return new JBD(this.dec.mul(Decimal.pow(10, n)), Math.max(this.scale - n, 0));
  }

  movePointLeft(n: number): JBD {
    return new JBD(this.dec.div(Decimal.pow(10, n)), this.scale + n);
  }

  /** stripTrailingZeros(): remove zeros à direita reduzindo a escala. */
  stripTrailingZeros(): JBD {
    if (this.dec.isZero()) return JBD.ZERO;
    const s = this.dec.toString(); // decimal.js já remove zeros à direita
    const dp = s.includes(".") ? s.split(".")[1]!.length : 0;
    return new JBD(this.dec, dp);
  }

  // ─── Comparações e consultas ──────────────────────────────────────────────

  compareTo(o: JBDInput): number {
    const b = JBD.of(o)!;
    return this.dec.comparedTo(b.dec);
  }

  signum(): number {
    if (this.dec.isZero()) return 0;
    return this.dec.isNegative() ? -1 : 1;
  }

  isZero(): boolean {
    return this.dec.isZero();
  }

  isNegative(): boolean {
    return this.dec.isNegative();
  }

  equalsValue(o: JBDInput): boolean {
    return this.compareTo(o) === 0;
  }

  /**intValue(): number {
    return this.dec.trunc().toNumber();
  }

  // ─── Serialização (algoritmo do Java) ─────────────────────────────────────

  /** BigDecimal.toString(): notação científica se expoente ajustado < -6 ou escala < 0. */
  toString(): string {
    return jbdToString(this);
  }

  /** decimal.js toFixed(n) — para testes/exibição com n casas. */
  toFixed(n: number): string {
    return this.dec.toFixed(n);
  }

  /** BigDecimal.toPlainString(): sempre sem notação científica. */
  toPlainString(): string {
    if (this.scale <= 0) {
      return this.dec.mul(Decimal.pow(10, -this.scale)).toFixed(0);
    }
    return this.dec.toFixed(this.scale);
  }
}

/**
 * Implementa exatamente o layout de BigDecimal.toString() do Java:
 * precisão conta TODOS os dígitos do valor escalado (zeros à direita incluídos);
 * notação científica quando escala < 0 ou expoente ajustado (= precisão-1-escala) < -6.
 */
function jbdToString(v: JBD): string {
  const neg = v.dec.isNegative();
  const sign = neg ? "-" : "";
  const scale = v.scale;

  // dígitos do valor não-escalado (valor * 10^scale como inteiro)
  const abs = v.dec.abs();
  const scaledStr = scale >= 0 ? abs.toFixed(scale).replace(".", "") : abs.toFixed(0) + "0".repeat(-scale);
  if (v.dec.isZero()) {
    // Java: zero é sempre plain (com a escala) quando scale >= 0
    if (scale === 0) return "0";
    if (scale > 0) return "0." + "0".repeat(scale);
    return "0E+" + (-scale);
  }
  const digits = scaledStr.replace(/^0+/, "") || "0";
  const p = digits === "0" ? 1 : digits.length;

  const adjusted = p - 1 - scale;
  if (scale === 0) return sign + digits;
  if (scale > 0 && adjusted >= -6) {
    if (p > scale) {
      const point = p - scale;
      return sign + digits.slice(0, point) + "." + digits.slice(point);
    }
    return sign + "0." + "0".repeat(scale - p) + digits;
  }
  const mant = digits.length > 1 ? digits[0] + "." + digits.slice(1) : digits;
  return sign + mant + "E" + (adjusted >= 0 ? "+" : "") + adjusted;
}

// ─── Utilitários de arredondamento (porte de ArredondamentoUtils) ────────────

export const PRECISAO_INTERNA = 8;

/** Aplica arredondamento interno (8 casas, HALF_EVEN). */
export function arredondarInterno(v: JBDInput): JBD | null {
  const a = JBD.of(v);
  return a === null ? null : a.setScale(PRECISAO_INTERNA);
}

export function dividirPorCem(v: JBDInput): JBD | null {
  const a = JBD.of(v);
  return a === null ? null : a.divide(JBD.CEM, PRECISAO_INTERNA);
}

export function dividir(a: JBDInput, b: JBDInput): JBD | null {
  const x = JBD.of(a);
  const y = JBD.of(b);
  return x === null || y === null ? null : x.divide(y, PRECISAO_INTERNA);
}

export function multiplicar(a: JBDInput, b: JBDInput): JBD | null {
  const x = JBD.of(a);
  const y = JBD.of(b);
  return x === null || y === null ? null : x.multiply(y).setScale(PRECISAO_INTERNA);
}

export function subtrair(a: JBDInput, b: JBDInput): JBD | null {
  const x = JBD.of(a);
  const y = JBD.of(b);
  return x === null || y === null ? null : x.subtract(y).setScale(PRECISAO_INTERNA);
}

export function multiplicarPorCem(v: JBDInput): JBD | null {
  const a = JBD.of(v);
  return a === null ? null : a.multiply(JBD.CEM);
}

export function totalizar(valores: Array<JBD | null | undefined>): JBD {
  return valores.reduce<JBD>((acc, v) => acc.add(v ?? JBD.ZERO), JBD.ZERO);
}

// ─── Formatação de apresentação (equivalentes aos Serializers Jackson) ──────

/** TDec1302: monetário, exatamente 2 casas. Rejeita negativo. */
export function formatarMoeda(v: JBDInput): string {
  const a = JBD.of(v)!;
  if (a.signum() < 0) throw new Error("Números negativos não são permitidos para TDec1302");
  return a.setScale(2).toPlainString();
}

/** TDec0302_04: alíquota 2–4 casas, remove zeros à direita respeitando mín. 2. Rejeita negativo. */
export function formatarAliquota(v: JBDInput): string {
  const a = JBD.of(v)!;
  if (a.signum() < 0) throw new Error("Números negativos não são permitidos para TDec_0302_04");
  const stripped = a.setScale(4).stripTrailingZeros();
  return stripped.scale < 2 ? a.setScale(4).setScale(2).toPlainString() : stripped.toPlainString();
}

/** TDec1104 (OpRTC): quantidade — inteiro quando possível, senão 4 casas. Rejeita negativo. */
export function formatarQuantidade(v: JBDInput): string {
  const a = JBD.of(v)!;
  if (a.signum() < 0) throw new Error("Números negativos não são permitidos para TDec_1104OpRTC");
  const stripped = a.stripTrailingZeros();
  if (stripped.scale <= 0) {
    return a.setScale(0).toPlainString();
  }
  return a.setScale(4).toPlainString();
}
