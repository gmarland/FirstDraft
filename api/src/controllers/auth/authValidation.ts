export function validateUserInput(email: string | undefined, password: string | undefined): string | undefined {
  if (!email?.trim()) return "email is required";
  if (!password) return "password is required";
  if (password.length < 8) return "password must be at least 8 characters";
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
