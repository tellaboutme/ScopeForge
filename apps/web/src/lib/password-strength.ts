// D042 — client-side mirror of apps/api/app/auth.py's check_password_strength().
// Intentionally duplicated rather than imported (frontend/backend are
// separate runtimes) but must stay in sync — this is a UX hint shown before
// submit, not the actual gate; the backend re-checks and is the source of
// truth. Any future rule change there should be mirrored here too.
const COMMON_WEAK_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789",
  "1234567890", "qwerty123", "qwertyuiop", "letmein123", "iloveyou1",
  "admin1234", "welcome123", "abc123456", "changeme1", "passw0rd"
]);

export const MIN_PASSWORD_LENGTH = 8;

export function checkPasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `At least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/[a-zA-Z]/.test(password)) return "Include at least one letter.";
  if (!/[0-9]/.test(password)) return "Include at least one number.";
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) return "This password is too common.";
  return null;
}

export interface PasswordStrength {
  /** 0 = nothing typed yet, 1 = fails checkPasswordStrength's gate, 2 =
   * passes the gate but only just, 3 = passes with real length/variety
   * margin. Purely a live-typing UX signal — never loosens or replaces
   * checkPasswordStrength() as the actual submit-time gate. */
  score: 0 | 1 | 2 | 3;
  message: string;
}

/** D044 — graduated, live strength feedback for the signup password field
 * (checkPasswordStrength() above is binary pass/fail, which is right for a
 * submit-time gate but not for "how am I doing" feedback while typing). */
export function getPasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return { score: 0, message: `At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.` };
  }

  const reason = checkPasswordStrength(password);
  if (reason) {
    return { score: 1, message: reason };
  }

  let variety = 0;
  if (/[a-z]/.test(password)) variety += 1;
  if (/[A-Z]/.test(password)) variety += 1;
  if (/[0-9]/.test(password)) variety += 1;
  if (/[^a-zA-Z0-9]/.test(password)) variety += 1;

  const strong = password.length >= 12 && variety >= 3;
  if (strong) return { score: 3, message: "Strong password." };
  return { score: 2, message: "Good password — could be longer or more varied." };
}
