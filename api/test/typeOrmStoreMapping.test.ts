import assert from "node:assert/strict";
import { ApiKeyEntity } from "../src/db/entities/apiKey.js";
import { UserEntity } from "../src/db/entities/user.js";
import { mergeWorkerState } from "../src/store/clientStore.js";
import { mapApiKeyEntity } from "../src/store/tenantApiKeys/tenantApiKeyRowMappers.js";
import { mapUserEntity } from "../src/store/tenantUsers/tenantUserRowMappers.js";
import { mapWorkerRecord } from "../src/store/workers/workerRecordStore.js";

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

function testWorkerRecordMappingIncludesRuntimeState(): void {
  const row = {
    worker_id: "worker-1",
    api_key_id: "00000000-0000-0000-0000-000000000002",
    first_registered_at: new Date("2026-01-01T00:00:00.000Z"),
    last_registered_at: new Date("2026-01-02T00:00:00.000Z"),
    last_seen_at: new Date("2026-01-03T00:00:00.000Z"),
    last_connection_id: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    max_concurrent_tasks: 2,
    state: "started",
    state_updated_at: new Date("2026-01-03T00:01:00.000Z"),
    stopped_at: null
  };

  assert.deepEqual(mapWorkerRecord(row), {
    workerId: "worker-1",
    apiKeyId: "00000000-0000-0000-0000-000000000002",
    firstRegisteredAt: "2026-01-01T00:00:00.000Z",
    lastRegisteredAt: "2026-01-02T00:00:00.000Z",
    lastSeenAt: "2026-01-03T00:00:00.000Z",
    lastConnectionId: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    maxConcurrentTasks: 2,
    state: "started",
    stateUpdatedAt: "2026-01-03T00:01:00.000Z",
    stoppedAt: undefined
  });
}

function testWorkerStateMergeUsesCommandsForLiveWorkers(): void {
  const worker = mergeWorkerState({
    workerId: "worker-1",
    apiKeyId: "api-key-1",
    firstRegisteredAt: "2026-01-01T00:00:00.000Z",
    lastRegisteredAt: "2026-01-02T00:00:00.000Z",
    lastSeenAt: "2026-01-03T00:00:00.000Z",
    lastConnectionId: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    maxConcurrentTasks: 2,
    state: "started",
    stateUpdatedAt: "2026-01-03T00:01:00.000Z"
  }, [{
    transactionId: "command-1",
    userId: "user-1",
    workerId: "worker-1",
    command: "do work",
    commandMode: "ai",
    status: "in_progress",
    createdAt: "2026-01-03T00:00:30.000Z"
  }]);

  assert.equal(worker.state, "running_command");
  assert.deepEqual(worker.activeTransactionIds, ["command-1"]);
  assert.equal(worker.activeTaskCount, 1);
  assert.equal(worker.currentTransactionId, "command-1");
}

function testWorkerStateMergeKeepsStoppedWorkersStopped(): void {
  const worker = mergeWorkerState({
    workerId: "worker-1",
    apiKeyId: "api-key-1",
    firstRegisteredAt: "2026-01-01T00:00:00.000Z",
    lastRegisteredAt: "2026-01-02T00:00:00.000Z",
    lastSeenAt: "2026-01-03T00:00:00.000Z",
    lastConnectionId: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    maxConcurrentTasks: 2,
    state: "stopped",
    stateUpdatedAt: "2026-01-03T00:01:00.000Z",
    stoppedAt: "2026-01-03T00:01:00.000Z"
  }, [{
    transactionId: "command-1",
    userId: "user-1",
    workerId: "worker-1",
    command: "do work",
    commandMode: "ai",
    status: "in_progress",
    createdAt: "2026-01-03T00:00:30.000Z"
  }]);

  assert.equal(worker.state, "stopped");
  assert.deepEqual(worker.activeTransactionIds, []);
  assert.equal(worker.activeTaskCount, 0);
  assert.equal(worker.currentTransactionId, undefined);
}

testUserEntityMapping();
testApiKeyEntityMapping();
testWorkerRecordMappingIncludesRuntimeState();
testWorkerStateMergeUsesCommandsForLiveWorkers();
testWorkerStateMergeKeepsStoppedWorkersStopped();

console.log("typeorm store mapping tests passed");
