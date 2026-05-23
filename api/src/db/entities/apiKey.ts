import { EntitySchema } from "typeorm";

export type ApiKeyEntity = {
  id: string;
  userId: string;
  apiKeyEncrypted: string;
  apiSecretEncrypted: string;
  name?: string | null;
  createdAt: Date;
  revokedAt?: Date | null;
};

export const ApiKeySchema = new EntitySchema<ApiKeyEntity>({
  name: "ApiKey",
  tableName: "api_keys",
  columns: {
    id: { type: "uuid", primary: true },
    userId: { type: "uuid", name: "user_id" },
    apiKeyEncrypted: { type: "text", name: "api_key_encrypted" },
    apiSecretEncrypted: { type: "text", name: "api_secret_encrypted" },
    name: { type: "text", nullable: true },
    createdAt: { type: "timestamptz", name: "created_at", createDate: true },
    revokedAt: { type: "timestamptz", name: "revoked_at", nullable: true }
  }
});
