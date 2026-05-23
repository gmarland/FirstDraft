export const signalRRecordSeparator = "\x1e";

export type SignalRInvocationMessage = {
  type: number;
  invocationId?: string;
  target?: string;
  arguments?: unknown[];
};

export function parseFrames(payload: string): string[] {
  return payload.split(signalRRecordSeparator).filter(Boolean);
}

export function handshakeResponse(): string {
  return JSON.stringify({}) + signalRRecordSeparator;
}

export function invocationMessage(target: string, args: unknown[]): string {
  return (
    JSON.stringify({
      type: 1,
      target,
      arguments: args
    }) + signalRRecordSeparator
  );
}

export function pingMessage(): string {
  return JSON.stringify({ type: 6 }) + signalRRecordSeparator;
}

export function completionMessage(invocationId: string, result?: unknown, error?: string): string {
  return (
    JSON.stringify({
      type: 3,
      invocationId,
      ...(error ? { error } : { result })
    }) + signalRRecordSeparator
  );
}
