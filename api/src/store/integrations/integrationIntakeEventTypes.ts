export type IntegrationIntakeStatus =
  | "queueing"
  | "queued"
  | "processing"
  | "processed"
  | "skipped"
  | "failed";

export type IntegrationIntakeEvent = {
  id: string;
  provider: string;
  sourceItemId: string;
  sourceItemKey: string;
  sourceItemUrl?: string;
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  workerId?: string;
  transactionId?: string;
  status: IntegrationIntakeStatus;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationIntakeEventParticipant = {
  eventId: string;
  userId: string;
  integrationId: string;
};
