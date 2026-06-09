export type WorkerTokenRequest = {
  workerId?: string;
  apiKey?: string;
  apiSecret?: string;
};

export function parseWorkerTokenRequest(body: unknown): WorkerTokenRequest {
  return body as WorkerTokenRequest;
}

export function validateWorkerTokenRequest(input: WorkerTokenRequest): string | undefined {
  if (!input.workerId?.trim()) return "workerId is required";
  return undefined;
}

export function readRefreshToken(body: unknown): string | undefined {
  const { refreshToken } = body as { refreshToken?: string };
  return refreshToken;
}

export function readBearerToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1];
}
