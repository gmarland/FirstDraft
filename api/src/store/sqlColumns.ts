export function selectColumns(columns: readonly string[], prefix?: string, aliasPrefix = ""): string {
  return columns
    .map((column) => {
      const selected = prefix ? `${prefix}.${column}` : column;
      return aliasPrefix ? `${selected} as ${aliasPrefix}${column}` : selected;
    })
    .join(", ");
}
