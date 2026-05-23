import { QueryResultRow } from "pg";
import { ApiKeyEntity } from "../../db/entities/apiKey.js";
import { ApiKey } from "../../types.js";
import { toIsoString } from "../tenants/tenantRowMappers.js";

export function mapApiKey(row: QueryResultRow): ApiKey {
  const revokedAt = row.revoked_at ? toIsoString(row.revoked_at) : undefined;

  return {
    keyId: String(row.id),
    userId: String(row.user_id),
    apiKey: String(row.api_key),
    name: typeof row.name === "string" ? row.name : undefined,
    createdAt: toIsoString(row.created_at),
    revokedAt
  };
}

export function mapApiKeyEntity(entity: ApiKeyEntity, apiKey: string): ApiKey {
  return {
    keyId: entity.id,
    userId: entity.userId,
    apiKey,
    name: entity.name ?? undefined,
    createdAt: toIsoString(entity.createdAt),
    revokedAt: entity.revokedAt ? toIsoString(entity.revokedAt) : undefined
  };
}
