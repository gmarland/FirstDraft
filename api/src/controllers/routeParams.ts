export type RouteParams = Record<string, string | string[] | undefined>;

export function routeParam(params: RouteParams, name: string): string {
  const value = params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
