/**
 * Format a number for people: round half away from zero, ignoring floating-point dust
 * (37.4999999 -> "37.5" at 1 digit, "38" at 0; 3.1249999 -> "3.13"), and never print "-0".
 */
export const fmt = (n: number, digits = 0) => {
  const k = 10 ** digits;
  const r = (Math.sign(n) * Math.round(Math.abs(n) * k + 1e-7)) / k;
  return (Object.is(r, -0) ? 0 : r).toFixed(digits);
};
