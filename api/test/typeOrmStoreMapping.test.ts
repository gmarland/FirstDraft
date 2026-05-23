import assert from "node:assert/strict";
import { ApiKeyEntity } from "../src/db/entities/apiKey.js";
import { UserEntity } from "../src/db/entities/user.js";
import { mapApiKeyEntity } from "../src/store/tenantApiKeys/tenantApiKeyRowMappers.js";
import { mapUserEntity } from "../src/store/tenantUsers/tenantUserRowMappers.js";

function testUserEntityMapping(): void {
  const user: UserEntity = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "user@example.com",
    passwordHash: "hashed",
    name: null,
    role: "admin",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    disabledAt: new Date("2026-02-03T04:05:06.000Z")
  };

  assert.deepEqual(mapUserEntity(user), {
    userId: user.id,
    email: "user@example.com",
    name: undefined,
    role: "admin",
    createdAt: "2026-01-02T03:04:05.000Z",
    disabledAt: "2026-02-03T04:05:06.000Z"
  });
}

function testApiKeyEntityMapping(): void {
  const apiKey: ApiKeyEntity = {
    id: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000001",
    apiKeyEncrypted: "encrypted-key",
    apiSecretEncrypted: "encrypted-secret",
    name: "Deploy key",
    createdAt: new Date("2026-03-04T05:06:07.000Z"),
    revokedAt: null
  };

  assert.deepEqual(mapApiKeyEntity(apiKey, "firstdraft_public"), {
    keyId: apiKey.id,
    userId: apiKey.userId,
    apiKey: "firstdraft_public",
    name: "Deploy key",
    createdAt: "2026-03-04T05:06:07.000Z",
    revokedAt: undefined
  });
}

testUserEntityMapping();
testApiKeyEntityMapping();

console.log("typeorm store mapping tests passed");
