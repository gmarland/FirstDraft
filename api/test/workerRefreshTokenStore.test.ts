import assert from "node:assert/strict";
import { UserSchema } from "../src/db/entities/user.js";
import { WorkerRefreshTokenSchema } from "../src/db/entities/workerRefreshToken.js";
import { WorkerRefreshTokenStore } from "../src/store/workerAuth/workerRefreshTokenStore.js";

async function testConsumeMapsSnakeCaseRawRow(): Promise<void> {
  const { store, calls } = createStore({
    raw: [{
      id: "00000000-0000-0000-0000-000000000101",
      worker_id: "worker-1",
      user_id: "00000000-0000-0000-0000-000000000001",
    }],
    generatedMaps: [],
  });

  const consumed = await store.consume("swr_test");

  assert.deepEqual(consumed, {
    id: "00000000-0000-0000-0000-000000000101",
    workerId: "worker-1",
    userId: "00000000-0000-0000-0000-000000000001",
  });
  assert.deepEqual(calls.returningColumns, ["id", "workerId", "userId"]);
  assert.equal(calls.findOneBy.length, 1);
  assert.equal(calls.findOneBy[0]?.id, "00000000-0000-0000-0000-000000000001");
}

async function testConsumeMapsCamelCaseGeneratedMap(): Promise<void> {
  const { store, calls } = createStore({
    raw: [],
    generatedMaps: [{
      id: "00000000-0000-0000-0000-000000000102",
      workerId: "worker-2",
      userId: "00000000-0000-0000-0000-000000000002",
    }],
  });

  const consumed = await store.consume("swr_test");

  assert.deepEqual(consumed, {
    id: "00000000-0000-0000-0000-000000000102",
    workerId: "worker-2",
    userId: "00000000-0000-0000-0000-000000000002",
  });
  assert.equal(calls.findOneBy.length, 1);
  assert.equal(calls.findOneBy[0]?.id, "00000000-0000-0000-0000-000000000002");
}

async function testConsumeReturnsUndefinedWhenNoTokenRowUpdated(): Promise<void> {
  const { store, calls } = createStore({
    raw: [],
    generatedMaps: [],
  });

  const consumed = await store.consume("swr_test");

  assert.equal(consumed, undefined);
  assert.equal(calls.findOneBy.length, 0);
}

async function testConsumeReturnsUndefinedForIncompleteReturnedIdentifiers(): Promise<void> {
  const { store, calls } = createStore({
    raw: [{
      id: "00000000-0000-0000-0000-000000000103",
      worker_id: "worker-3",
    }],
    generatedMaps: [],
  });

  const consumed = await store.consume("swr_test");

  assert.equal(consumed, undefined);
  assert.equal(calls.findOneBy.length, 0);
}

function createStore(updateResult: { raw?: unknown[]; generatedMaps?: unknown[] }): {
  store: WorkerRefreshTokenStore;
  calls: {
    returningColumns?: string[];
    findOneBy: Array<{ id?: unknown }>;
  };
} {
  const calls: {
    returningColumns?: string[];
    findOneBy: Array<{ id?: unknown }>;
  } = {
    findOneBy: [],
  };

  const users = {
    async findOneBy(criteria: { id?: unknown }) {
      calls.findOneBy.push(criteria);
      return { id: criteria.id };
    },
    async existsBy() {
      return true;
    },
  };
  const refreshTokens = {
    createQueryBuilder() {
      return createUpdateQueryBuilder(updateResult, calls);
    },
    async insert() {
      return undefined;
    },
    async update() {
      return undefined;
    },
  };
  const db = {
    repository(schema: unknown) {
      if (schema === UserSchema) return users;
      if (schema === WorkerRefreshTokenSchema) return refreshTokens;
      throw new Error("unexpected repository");
    },
  };

  return {
    store: new WorkerRefreshTokenStore(db as never),
    calls,
  };
}

function createUpdateQueryBuilder(
  updateResult: { raw?: unknown[]; generatedMaps?: unknown[] },
  calls: { returningColumns?: string[] },
) {
  return {
    update() {
      return this;
    },
    set() {
      return this;
    },
    where() {
      return this;
    },
    andWhere() {
      return this;
    },
    returning(columns: string[]) {
      calls.returningColumns = columns;
      return this;
    },
    async execute() {
      return updateResult;
    },
  };
}

await testConsumeMapsSnakeCaseRawRow();
await testConsumeMapsCamelCaseGeneratedMap();
await testConsumeReturnsUndefinedWhenNoTokenRowUpdated();
await testConsumeReturnsUndefinedForIncompleteReturnedIdentifiers();

console.log("worker refresh token store tests passed");
