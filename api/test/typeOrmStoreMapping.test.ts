import assert from "node:assert/strict";
import { UserEntity } from "../src/db/entities/user.js";
import { mergeWorkerState } from "../src/store/clientStore.js";
import { mapUserEntity } from "../src/store/tenantUsers/tenantUserRowMappers.js";
import { mapWorkerRecord } from "../src/store/workers/workerRecordStore.js";
import { canDispatchMoreCommands } from "../src/workers/workerState.js";

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

function testWorkerRecordMappingIncludesRuntimeState(): void {
  const row = {
    worker_id: "worker-1",
    user_id: "00000000-0000-0000-0000-000000000001",
    first_registered_at: new Date("2026-01-01T00:00:00.000Z"),
    last_registered_at: new Date("2026-01-02T00:00:00.000Z"),
    last_seen_at: new Date("2026-01-03T00:00:00.000Z"),
    last_connection_id: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    enabled_task_types: ["ai", "gitflow"],
    max_concurrent_tasks: 2,
    state: "started",
    state_updated_at: new Date("2026-01-03T00:01:00.000Z"),
    stopped_at: null
  };

  assert.deepEqual(mapWorkerRecord(row), {
    workerId: "worker-1",
    userId: "00000000-0000-0000-0000-000000000001",
    firstRegisteredAt: "2026-01-01T00:00:00.000Z",
    lastRegisteredAt: "2026-01-02T00:00:00.000Z",
    lastSeenAt: "2026-01-03T00:00:00.000Z",
    lastConnectionId: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    enabledTaskTypes: ["ai", "gitflow"],
    maxConcurrentTasks: 2,
    state: "started",
    stateUpdatedAt: "2026-01-03T00:01:00.000Z",
    stoppedAt: undefined
  });
}

function testWorkerRecordMappingNormalizesTaskTypes(): void {
  const worker = mapWorkerRecord({
    worker_id: "worker-1",
    user_id: "user-1",
    first_registered_at: "2026-01-01T00:00:00.000Z",
    last_registered_at: "2026-01-02T00:00:00.000Z",
    last_seen_at: "2026-01-03T00:00:00.000Z",
    last_connection_id: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    enabled_task_types: ["ai", "gitflow"],
    max_concurrent_tasks: 2,
    state: "started",
    state_updated_at: "2026-01-03T00:01:00.000Z"
  });

  assert.deepEqual(worker.enabledTaskTypes, ["ai", "gitflow"]);
}

function testWorkerRecordMappingPreservesUnlimitedCapacity(): void {
  const worker = mapWorkerRecord({
    worker_id: "worker-1",
    user_id: "user-1",
    first_registered_at: "2026-01-01T00:00:00.000Z",
    last_registered_at: "2026-01-02T00:00:00.000Z",
    last_seen_at: "2026-01-03T00:00:00.000Z",
    last_connection_id: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    enabled_task_types: ["gitflow"],
    max_concurrent_tasks: null,
    state: "started",
    state_updated_at: "2026-01-03T00:01:00.000Z"
  });

  assert.equal(worker.maxConcurrentTasks, null);
}

function testWorkerStateMergeUsesCommandsForLiveWorkers(): void {
  const worker = mergeWorkerState({
    workerId: "worker-1",
    userId: "user-1",
    firstRegisteredAt: "2026-01-01T00:00:00.000Z",
    lastRegisteredAt: "2026-01-02T00:00:00.000Z",
    lastSeenAt: "2026-01-03T00:00:00.000Z",
    lastConnectionId: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    enabledTaskTypes: ["ai", "shell", "gitflow"],
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
  assert.deepEqual(worker.enabledTaskTypes, ["ai", "shell", "gitflow"]);
}

function testWorkerStateMergeKeepsStoppedWorkersStopped(): void {
  const worker = mergeWorkerState({
    workerId: "worker-1",
    userId: "user-1",
    firstRegisteredAt: "2026-01-01T00:00:00.000Z",
    lastRegisteredAt: "2026-01-02T00:00:00.000Z",
    lastSeenAt: "2026-01-03T00:00:00.000Z",
    lastConnectionId: "connection-1",
    paths: ["/repo"],
    skills: ["git"],
    enabledTaskTypes: ["gitflow"],
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
  assert.deepEqual(worker.enabledTaskTypes, ["gitflow"]);
}

function testUnlimitedWorkerCapacityAllowsAdditionalDispatches(): void {
  assert.equal(canDispatchMoreCommands({
    workerId: "worker-1",
    userId: "user-1",
    connectionId: "connection-1",
    paths: [],
    skills: ["git"],
    enabledTaskTypes: ["gitflow"],
    state: "running_command",
    activeTransactionIds: Array.from({ length: 9 }, (_, index) => `command-${index}`),
    maxConcurrentTasks: null,
    registeredAt: "2026-01-01T00:00:00.000Z",
    firstRegisteredAt: "2026-01-01T00:00:00.000Z",
    lastRegisteredAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    stateUpdatedAt: "2026-01-01T00:00:00.000Z"
  }), true);
}

testUserEntityMapping();
testWorkerRecordMappingIncludesRuntimeState();
testWorkerRecordMappingNormalizesTaskTypes();
testWorkerRecordMappingPreservesUnlimitedCapacity();
testWorkerStateMergeUsesCommandsForLiveWorkers();
testWorkerStateMergeKeepsStoppedWorkersStopped();
testUnlimitedWorkerCapacityAllowsAdditionalDispatches();

console.log("typeorm store mapping tests passed");
