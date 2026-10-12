// Exact integer cents for local fixture presentation, never a production calculator.
export function cents(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  return (
    (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))) *
    (negative ? -BigInt(1) : BigInt(1))
  );
}
export function decimal(value: bigint): string {
  const magnitude = value < BigInt(0) ? -value : value;
  return `${value < BigInt(0) ? "-" : ""}${magnitude / BigInt(100)}.${String(magnitude % BigInt(100)).padStart(2, "0")}`;
}
export function percent(value: string, total: string): string {
  if (cents(total) === BigInt(0)) return "0";
  return decimal((cents(value) * BigInt(10000)) / cents(total));
}
export function validMoney(value: string, signed = false, zero = false) {
  if (
    !(
      signed
        ? /^-?(0|[1-9]\d{0,8})(\.\d{1,2})?$/
        : /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/
    ).test(value)
  )
    return false;
  return !value.startsWith("-0") || cents(value) !== BigInt(0)
    ? signed || (zero ? cents(value) >= BigInt(0) : cents(value) > BigInt(0))
    : false;
}
