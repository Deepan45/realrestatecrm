/** Mask all but the first 3 and last 2 digits of a phone number, e.g. "+919876543210" → "+9198••••••10". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 5) return "•".repeat(phone.length);
  const prefix = phone.slice(0, phone.length - digits.length) + digits.slice(0, 4);
  const suffix = digits.slice(-2);
  const maskedLength = digits.length - 6;
  return `${prefix}${"•".repeat(Math.max(maskedLength, 2))}${suffix}`;
}
