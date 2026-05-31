import { EntitySchema } from "typeorm";

export type WorkerJiraIntegrationEntity = {
  workerId: string;
  integrationId: string;
  userId: string;
  siteUrl: string;
  email: string;
  apiTokenEncrypted: string;
  boardId: number;
  boardName: string;
  boardType: string;
  boardFilterId?: number | null;
  readyStatusId: string;
  readyStatusName: string;
  processingStatusId: string;
  processingStatusName: string;
  processedStatusId: string;
  processedStatusName: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const WorkerJiraIntegrationSchema = new EntitySchema<WorkerJiraIntegrationEntity>({
  name: "WorkerJiraIntegration",
  tableName: "worker_jira_integrations",
  columns: {
    workerId: { type: "text", name: "worker_id", primary: true },
    integrationId: { type: "text", name: "integration_id", primary: true },
    userId: { type: "uuid", name: "user_id" },
    siteUrl: { type: "text", name: "site_url" },
    email: { type: "text" },
    apiTokenEncrypted: { type: "text", name: "api_token_encrypted" },
    boardId: { type: "integer", name: "board_id" },
    boardName: { type: "text", name: "board_name" },
    boardType: { type: "text", name: "board_type" },
    boardFilterId: { type: "integer", name: "board_filter_id", nullable: true },
    readyStatusId: { type: "text", name: "ready_status_id" },
    readyStatusName: { type: "text", name: "ready_status_name" },
    processingStatusId: { type: "text", name: "processing_status_id" },
    processingStatusName: { type: "text", name: "processing_status_name" },
    processedStatusId: { type: "text", name: "processed_status_id" },
    processedStatusName: { type: "text", name: "processed_status_name" },
    enabled: { type: "boolean", default: true },
    createdAt: { type: "timestamptz", name: "created_at", createDate: true },
    updatedAt: { type: "timestamptz", name: "updated_at", updateDate: true }
  }
});
