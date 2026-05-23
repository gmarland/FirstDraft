import { EntitySchema } from "typeorm";

export type WorkerRefreshTokenEntity = {
  id: string;
  workerId: string;
  apiKeyId: string;
  refreshTokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedBy?: string | null;
};

export const WorkerRefreshTokenSchema = new EntitySchema<WorkerRefreshTokenEntity>({
  name: "WorkerRefreshToken",
  tableName: "worker_refresh_tokens",
  columns: {
    id: { type: "uuid", primary: true },
    workerId: { type: "text", name: "worker_id" },
    apiKeyId: { type: "uuid", name: "api_key_id" },
    refreshTokenHash: { type: "text", name: "refresh_token_hash", unique: true },
    issuedAt: { type: "timestamptz", name: "issued_at", createDate: true },
    expiresAt: { type: "timestamptz", name: "expires_at" },
    revokedAt: { type: "timestamptz", name: "revoked_at", nullable: true },
    replacedBy: { type: "uuid", name: "replaced_by", nullable: true }
  }
});
