export function validateUserInput(email: string | undefined, password: string | undefined): string | undefined {
  if (!email?.trim()) return "email is required";
  if (!password) return "password is required";
  if (password.length < 8) return "password must be at least 8 characters";
  return undefined;
}

export type UpdateProfileInput = {
  email?: string;
  name?: string;
  password?: string;
};

export function readUpdateProfileInput(body: unknown): UpdateProfileInput {
  const payload = (typeof body === "object" && body !== null ? body : {}) as {
    email?: unknown;
    name?: unknown;
    password?: unknown;
  };

  return {
    email: typeof payload.email === "string" ? payload.email.trim() : undefined,
    name: typeof payload.name === "string" ? payload.name.trim() : undefined,
    password: typeof payload.password === "string" ? payload.password : undefined
  };
}

export function validateUpdateProfileInput(input: UpdateProfileInput): string | undefined {
  if (input.email !== undefined && !input.email.trim()) return "email is required";
  if (input.password !== undefined && input.password.length < 8) return "password must be at least 8 characters";
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
