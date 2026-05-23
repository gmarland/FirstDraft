import { Response } from "express";
import { isSupportedImageMimeType } from "../../integrations/jira/jiraIntakeService.js";
import { JiraAttachmentMetadata } from "./workerAuthRequests.js";

export const maxJiraAttachmentBytes = 10 * 1024 * 1024;

export function sendJiraAttachment(
  res: Response,
  attachment: JiraAttachmentMetadata,
  content: { body: Buffer; contentType?: string | null }
): boolean {
  if (content.body.length > maxJiraAttachmentBytes) {
    res.status(413).json({ error: "attachment is too large" });
    return false;
  }

  const contentType =
    normalizeImageContentType(content.contentType ?? "") ??
    normalizeImageContentType(attachment.mimeType);
  if (!contentType) {
    res.status(415).json({ error: "attachment is not a supported image" });
    return false;
  }

  res.setHeader("content-type", contentType);
  res.setHeader("content-length", String(content.body.length));
  res.setHeader("content-disposition", `attachment; filename="${escapeHeaderValue(attachment.filename)}"`);
  res.send(content.body);
  return true;
}

function normalizeImageContentType(value: string): string | undefined {
  const contentType = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return isSupportedImageMimeType(contentType) ? contentType : undefined;
}

function escapeHeaderValue(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}
