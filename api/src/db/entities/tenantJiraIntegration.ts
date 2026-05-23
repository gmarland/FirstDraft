import { EntitySchema } from "typeorm";

export type TenantJiraIntegrationEntity = {
  id: string;
  userId: string;
  siteUrl?: string | null;
  email?: string | null;
  apiTokenEncrypted?: string | null;
  boardId?: number | null;
  boardName?: string | null;
  boardType?: string | null;
  boardFilterId?: number | null;
  readyStatusId?: string | null;
  readyStatusName?: string | null;
  processingStatusId?: string | null;
  processingStatusName?: string | null;
  processedStatusId?: string | null;
  processedStatusName?: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const TenantJiraIntegrationSchema = new EntitySchema<TenantJiraIntegrationEntity>({
  name: "TenantJiraIntegration",
  tableName: "tenant_jira_integration",
  columns: {
    id: { type: "uuid", primary: true },
    userId: { type: "uuid", name: "user_id" },
    siteUrl: { type: "text", name: "site_url", nullable: true },
    email: { type: "text", nullable: true },
    apiTokenEncrypted: { type: "text", name: "api_token_encrypted", nullable: true },
    boardId: { type: "integer", name: "board_id", nullable: true },
    boardName: { type: "text", name: "board_name", nullable: true },
    boardType: { type: "text", name: "board_type", nullable: true },
    boardFilterId: { type: "integer", name: "board_filter_id", nullable: true },
    readyStatusId: { type: "text", name: "ready_status_id", nullable: true },
    readyStatusName: { type: "text", name: "ready_status_name", nullable: true },
    processingStatusId: { type: "text", name: "processing_status_id", nullable: true },
    processingStatusName: { type: "text", name: "processing_status_name", nullable: true },
    processedStatusId: { type: "text", name: "processed_status_id", nullable: true },
    processedStatusName: { type: "text", name: "processed_status_name", nullable: true },
    enabled: { type: "boolean", default: false },
    createdAt: { type: "timestamptz", name: "created_at", createDate: true },
    updatedAt: { type: "timestamptz", name: "updated_at", updateDate: true }
  }
});
