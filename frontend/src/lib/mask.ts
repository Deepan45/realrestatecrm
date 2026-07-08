/** Cosmetic fallback mirror of the backend mask (backend already masks partner-facing API
 * responses) — kept in sync in case a component ever renders a number the API didn't mask. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 5) return "•".repeat(phone.length);
  const prefix = phone.slice(0, phone.length - digits.length) + digits.slice(0, 4);
  const suffix = digits.slice(-2);
  const maskedLength = digits.length - 6;
  return `${prefix}${"•".repeat(Math.max(maskedLength, 2))}${suffix}`;
}
