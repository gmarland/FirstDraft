import { isSupportedImageMimeType } from "../../integrations/jira/jiraIntakeService.js";

export type WorkerTokenRequest = {
  workerId?: string;
  apiKey?: string;
  apiSecret?: string;
};

export type JiraAttachmentMetadata = {
  id: string;
  filename: string;
  mimeType: string;
  contentUrl: string;
};

export function parseWorkerTokenRequest(body: unknown): WorkerTokenRequest {
  return body as WorkerTokenRequest;
}

export function validateWorkerTokenRequest(input: WorkerTokenRequest): string | undefined {
  if (!input.workerId?.trim()) return "workerId is required";
  if (!input.apiKey?.trim()) return "apiKey is required";
  if (!input.apiSecret) return "apiSecret is required";
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

export function readImageAttachmentMetadata(
  metadata: Record<string, unknown>,
  attachmentId: string
): JiraAttachmentMetadata | undefined {
  const attachments = metadata.imageAttachments;
  if (!Array.isArray(attachments)) return undefined;

  for (const value of attachments) {
    if (!value || typeof value !== "object") continue;
    const attachment = value as Record<string, unknown>;
    const id = readString(attachment.id);
    const filename = readString(attachment.filename);
    const mimeType = readString(attachment.mimeType);
    const contentUrl = readString(attachment.contentUrl);
    if (id === attachmentId && filename && mimeType && contentUrl && isSupportedImageMimeType(mimeType)) {
      return { id, filename, mimeType, contentUrl };
    }
  }

  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
