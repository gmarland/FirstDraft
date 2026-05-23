import { EntitySchema } from "typeorm";

export type ClientWorkerEntity = {
  workerId: string;
  apiKeyId?: string | null;
  firstRegisteredAt: Date;
  lastRegisteredAt: Date;
  lastSeenAt?: Date | null;
  lastConnectionId?: string | null;
  paths: string[];
  skills: string[];
  maxConcurrentTasks: number;
};

export const ClientWorkerSchema = new EntitySchema<ClientWorkerEntity>({
  name: "ClientWorker",
  tableName: "client_workers",
  columns: {
    workerId: { type: "text", name: "worker_id", primary: true },
    apiKeyId: { type: "uuid", name: "api_key_id", nullable: true },
    firstRegisteredAt: { type: "timestamptz", name: "first_registered_at", createDate: true },
    lastRegisteredAt: { type: "timestamptz", name: "last_registered_at", createDate: true },
    lastSeenAt: { type: "timestamptz", name: "last_seen_at", nullable: true },
    lastConnectionId: { type: "text", name: "last_connection_id", nullable: true },
    paths: { type: "text", array: true, default: "'{}'" },
    skills: { type: "text", array: true, default: "'{}'" },
    maxConcurrentTasks: { type: "integer", name: "max_concurrent_tasks", default: 1 }
  }
});
