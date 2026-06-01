import { EntitySchema } from "typeorm";

export type ClientCommandEntity = {
  transactionId: string;
  userId: string;
  workerId?: string | null;
  command: string;
  taskSummary?: string | null;
  executionCommand?: string | null;
  commandMode: string;
  repositoryUrl?: string | null;
  normalizedRepositoryUrl?: string | null;
  status: string;
  result?: string | null;
  agentResponse?: string | null;
  errorMessage?: string | null;
  outputObjectKey?: string | null;
  outputBytes?: string | null;
  outputStartedAt?: Date | null;
  outputUpdatedAt?: Date | null;
  createdAt: Date;
  claimedAt?: Date | null;
  completedAt?: Date | null;
};

export const ClientCommandSchema = new EntitySchema<ClientCommandEntity>({
  name: "ClientCommand",
  tableName: "client_commands",
  columns: {
    transactionId: { type: "text", name: "transaction_id", primary: true },
    userId: { type: "uuid", name: "user_id" },
    workerId: { type: "text", name: "worker_id", nullable: true },
    command: { type: "text" },
    taskSummary: { type: "text", name: "task_summary", nullable: true },
    executionCommand: { type: "text", name: "execution_command", nullable: true },
    commandMode: { type: "text", name: "command_mode", default: "'gitflow'" },
    repositoryUrl: { type: "text", name: "repository_url", nullable: true },
    normalizedRepositoryUrl: { type: "text", name: "normalized_repository_url", nullable: true },
    status: { type: "text" },
    result: { type: "text", nullable: true },
    agentResponse: { type: "text", name: "agent_response", nullable: true },
    errorMessage: { type: "text", name: "error_message", nullable: true },
    outputObjectKey: { type: "text", name: "output_object_key", nullable: true },
    outputBytes: { type: "bigint", name: "output_bytes", nullable: true },
    outputStartedAt: { type: "timestamptz", name: "output_started_at", nullable: true },
    outputUpdatedAt: { type: "timestamptz", name: "output_updated_at", nullable: true },
    createdAt: { type: "timestamptz", name: "created_at", createDate: true },
    claimedAt: { type: "timestamptz", name: "claimed_at", nullable: true },
    completedAt: { type: "timestamptz", name: "completed_at", nullable: true }
  }
});
