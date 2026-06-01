import { EntitySchema } from "typeorm";

export type ClientWorkerEntity = {
  workerId: string;
  userId: string;
  firstRegisteredAt: Date;
  lastRegisteredAt: Date;
  lastSeenAt?: Date | null;
  lastConnectionId?: string | null;
  paths: string[];
  skills: string[];
  enabledTaskTypes: string[];
  maxConcurrentTasks: number | null;
  state: string;
  stateUpdatedAt?: Date | null;
  stoppedAt?: Date | null;
};

export const ClientWorkerSchema = new EntitySchema<ClientWorkerEntity>({
  name: "ClientWorker",
  tableName: "client_workers",
  columns: {
    workerId: { type: "text", name: "worker_id", primary: true },
    userId: { type: "uuid", name: "user_id" },
    firstRegisteredAt: { type: "timestamptz", name: "first_registered_at", createDate: true },
    lastRegisteredAt: { type: "timestamptz", name: "last_registered_at", createDate: true },
    lastSeenAt: { type: "timestamptz", name: "last_seen_at", nullable: true },
    lastConnectionId: { type: "text", name: "last_connection_id", nullable: true },
    paths: { type: "text", array: true, default: "'{}'" },
    skills: { type: "text", array: true, default: "'{}'" },
    enabledTaskTypes: { type: "text", name: "enabled_task_types", array: true, default: "'{gitflow}'" },
    maxConcurrentTasks: { type: "integer", name: "max_concurrent_tasks", nullable: true, default: 1 },
    state: { type: "text", default: "'stopped'" },
    stateUpdatedAt: { type: "timestamptz", name: "state_updated_at", nullable: true },
    stoppedAt: { type: "timestamptz", name: "stopped_at", nullable: true }
  }
});
