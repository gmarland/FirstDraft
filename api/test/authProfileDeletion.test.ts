import assert from "node:assert/strict";
import { AuthController } from "../src/controllers/auth/authController.js";
import type { JwtConfig } from "../src/auth/passport.js";
import type { CommandOutputStorage } from "../src/storage/commandOutputStorage.js";
import type { AppStore } from "../src/store/tenantStore.js";
import { UserPasswordHasher } from "../src/store/tenantUsers/tenantUserPasswordHasher.js";
import { UserStore } from "../src/store/tenantUsers/tenantUserStore.js";
import type { User } from "../src/types.js";

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    sent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      this.sent = true;
      return this;
    },
    send() {
      this.sent = true;
      return this;
    }
  };
}

async function testDeleteMeDeletesOutputBeforeUserData(): Promise<void> {
  const order: string[] = [];
  const tenants = {
    async listCommandOutputObjectKeys(userId: string) {
      order.push(`list:${userId}`);
      return ["output-one", "output-two"];
    },
    async deleteUser(userId: string) {
      order.push(`delete-user:${userId}`);
      return true;
    }
  } as Partial<AppStore> as AppStore;
  const outputStorage = {
    async deleteOutput(objectKey: string) {
      order.push(`delete-output:${objectKey}`);
    }
  } as Partial<CommandOutputStorage> as CommandOutputStorage;
  const controller = new AuthController({} as JwtConfig, tenants, outputStorage);
  const user = {
    userId: "user-1",
    email: "user@example.com",
    role: "user",
    createdAt: "2026-05-24T00:00:00.000Z"
  } satisfies User;
  const response = createResponse();

  await controller.deleteMe({ user } as never, response as never, (error?: unknown) => {
    if (error) throw error;
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.sent, true);
  assert.deepEqual(order, [
    "list:user-1",
    "delete-output:output-one",
    "delete-output:output-two",
    "delete-user:user-1"
  ]);
}

async function testDeleteMeReturnsNotFoundWhenUserAlreadyGone(): Promise<void> {
  const tenants = {
    async listCommandOutputObjectKeys() {
      return [];
    },
    async deleteUser() {
      return false;
    }
  } as Partial<AppStore> as AppStore;
  const controller = new AuthController({} as JwtConfig, tenants);
  const response = createResponse();

  await controller.deleteMe(
    {
      user: {
        userId: "missing-user",
        email: "missing@example.com",
        role: "user",
        createdAt: "2026-05-24T00:00:00.000Z"
      }
    } as never,
    response as never,
    (error?: unknown) => {
      if (error) throw error;
    }
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "user not found" });
}

async function testUserStoreDeletionQueries(): Promise<void> {
  const queries: string[] = [];
  const db = {
    repository() {
      return {};
    },
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("select output_object_key")) {
        return { rows: [{ output_object_key: "output-one" }], rowCount: 1 };
      }

      return { rows: [{ deleted: true }], rowCount: 1 };
    }
  };
  const store = new UserStore(db as never, new UserPasswordHasher());

  assert.deepEqual(await store.listCommandOutputObjectKeys("user-1"), ["output-one"]);
  assert.equal(await store.deleteUser("user-1"), true);

  const deleteSql = queries[1];
  assert.ok(deleteSql.includes("delete from client_workers"));
  assert.ok(deleteSql.includes("delete from client_commands"));
  assert.ok(deleteSql.includes("delete from users"));
  assert.ok(deleteSql.indexOf("delete from client_workers") < deleteSql.indexOf("delete from client_commands"));
  assert.ok(deleteSql.indexOf("delete from client_commands") < deleteSql.indexOf("delete from users"));
}

await testDeleteMeDeletesOutputBeforeUserData();
await testDeleteMeReturnsNotFoundWhenUserAlreadyGone();
await testUserStoreDeletionQueries();

console.log("auth profile deletion tests passed");
