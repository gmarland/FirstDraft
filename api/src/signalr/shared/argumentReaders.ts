export function readRequiredString(value: unknown, name: string): string {
  const text = readString(value);
  if (!text) {
    throw new Error(`${name} is required`);
  }

  return text;
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function readRequiredNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function readOutputStream(value: unknown): "stdout" | "stderr" {
  if (value === "stdout" || value === "stderr") {
    return value;
  }

  throw new Error("stream must be stdout or stderr");
}
