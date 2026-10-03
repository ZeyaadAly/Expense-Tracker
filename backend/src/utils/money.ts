// String operations preserve exact amounts and totals of arbitrary size.
export function formatDecimal(value: string): string {
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value)) {
    throw new Error("Invalid database decimal representation");
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}
