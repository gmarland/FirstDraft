import { QueryResultRow } from "pg";
import { UserEntity } from "../../db/entities/user.js";
import { User, UserRole } from "../../types.js";
import { toIsoString } from "../tenants/tenantRowMappers.js";

export function mapUser(row: QueryResultRow): User {
  const disabledAt = row.disabled_at ? toIsoString(row.disabled_at) : undefined;

  return {
    userId: String(row.id),
    email: String(row.email),
    name: typeof row.name === "string" ? row.name : undefined,
    role: mapUserRole(row.role),
    createdAt: toIsoString(row.created_at),
    disabledAt
  };
}

export function mapUserEntity(entity: UserEntity): User {
  return {
    userId: entity.id,
    email: entity.email,
    name: entity.name ?? undefined,
    role: mapUserRole(entity.role),
    createdAt: toIsoString(entity.createdAt),
    disabledAt: entity.disabledAt ? toIsoString(entity.disabledAt) : undefined
  };
}

function mapUserRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}
