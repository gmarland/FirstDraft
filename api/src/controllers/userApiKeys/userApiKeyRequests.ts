export function readApiKeyName(body: unknown): string | undefined {
  const { name } = body as { name?: string };
  return name?.trim() || undefined;
}
