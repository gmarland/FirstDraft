import assert from "node:assert/strict";
import type { CloseableDbClient, DbQueryResult } from "../src/db/dbClient.js";
import { PostgresAppStore } from "../src/store/tenants/postgresTenantStore.js";

type QueryCall = {
  sql: string;
  parameters?: readonly unknown[];
};

class DeleteUserDbClient implements CloseableDbClient {
  public calls: QueryCall[] = [];

  public constructor(private readonly rowCount: number | null) {}

  public async query(sql: string, parameters?: readonly unknown[]): Promise<DbQueryResult<{ deleted_user_id: string }>> {
    this.calls.push({ sql, parameters });

    if (sql.includes("select output_object_key")) {
      return {
        rows: [
          { output_object_key: "workers/worker-1/commands/command-1/output.ndjson" },
          { output_object_key: "workers/worker-1/commands/command-2/output.ndjson" }
        ] as never,
        rowCount: 2
      };
    }

    return this.rowCount === 1
      ? { rows: [{ deleted_user_id: "user-1" }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }

  public async close(): Promise<void> {}
}

async function testDeleteUserDeletesDependentRecordsBeforeUser(): Promise<void> {
  const db = new DeleteUserDbClient(1);
  const store = new PostgresAppStore(db, undefined as never, undefined as never, undefined as never);

  const deleted = await store.deleteUser("user-1");

  assert.equal(deleted, true);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].parameters, ["user-1"]);
  assert.match(db.calls[0].sql, /delete from client_workers/);
  assert.match(db.calls[0].sql, /where user_id = \$1/);
  assert.match(db.calls[0].sql, /delete from client_commands/);
  assert.match(db.calls[0].sql, /where user_id = \$1/);
  assert.match(db.calls[0].sql, /delete from users/);
  assert.match(db.calls[0].sql, /select count\(\*\) from deleted_workers/);
  assert.match(db.calls[0].sql, /select count\(\*\) from deleted_commands/);
}

async function testListCommandOutputObjectKeysForUser(): Promise<void> {
  const db = new DeleteUserDbClient(1);
  const store = new PostgresAppStore(db, undefined as never, undefined as never, undefined as never);

  const objectKeys = await store.listCommandOutputObjectKeysForUser("user-1");

  assert.deepEqual(objectKeys, [
    "workers/worker-1/commands/command-1/output.ndjson",
    "workers/worker-1/commands/command-2/output.ndjson"
  ]);
  assert.deepEqual(db.calls[0].parameters, ["user-1"]);
  assert.match(db.calls[0].sql, /select output_object_key/);
  assert.match(db.calls[0].sql, /output_object_key is not null/);
}

async function testDeleteUserReturnsFalseWhenMissing(): Promise<void> {
  const db = new DeleteUserDbClient(0);
  const store = new PostgresAppStore(db, undefined as never, undefined as never, undefined as never);

  assert.equal(await store.deleteUser("missing-user"), false);
}

await testDeleteUserDeletesDependentRecordsBeforeUser();
await testListCommandOutputObjectKeysForUser();
await testDeleteUserReturnsFalseWhenMissing();

console.log("postgres tenant store tests passed");
