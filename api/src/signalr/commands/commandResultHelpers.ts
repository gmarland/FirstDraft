export function extractAgentResponse(commandMode: string, result: string): string {
  if (commandMode !== "gitflow") return result.trim();

  const marker = "AI summary:";
  const markerIndex = result.indexOf(marker);
  if (markerIndex < 0) return result.trim();

  return result.slice(markerIndex + marker.length).trim();
}
