/** Keeps only what fits the ABC-123 shape: up to three letters (uppercased), then up to three digits. */
export function sanitizeCode(input: string) {
  let letters = ''
  let digits = ''
  for (const ch of input.toUpperCase()) {
    if (letters.length < 3) {
      if (ch >= 'A' && ch <= 'Z') letters += ch
    } else if (digits.length < 3 && ch >= '0' && ch <= '9') {
      digits += ch
    }
  }
  return letters + digits
}

/** "ABC123" -> "ABC-123" (partial values keep the dash only once a digit follows). */
export const formatCode = (raw: string) => (raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw)
