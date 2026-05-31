import { CloseableDbClient } from "../../db/dbClient.js";
import { User } from "../../types.js";
import { UserStore } from "../tenantUsers/tenantUserStore.js";
import { SchemaMigrator } from "./tenantSchemaMigrator.js";
import { CreateUserInput, UpdateUserInput, AppStore } from "./tenantStoreTypes.js";

export class PostgresAppStore implements AppStore {
  public constructor(
    private readonly db: CloseableDbClient,
    private readonly schema: SchemaMigrator,
    private readonly users: UserStore
  ) {}

  public migrate(): Promise<void> {
    return this.schema.migrate();
  }

  public createUser(input: CreateUserInput): Promise<User> {
    return this.users.createUser(input);
  }

  public listUsers(): Promise<User[]> {
    return this.users.listUsers();
  }

  public getUser(userId: string): Promise<User | undefined> {
    return this.users.getUser(userId);
  }

  public getUserByEmail(email: string): Promise<User | undefined> {
    return this.users.getUserByEmail(email);
  }

  public updateUser(userId: string, input: UpdateUserInput): Promise<User | undefined> {
    return this.users.updateUser(userId, input);
  }

  public async listCommandOutputObjectKeysForUser(userId: string): Promise<string[]> {
    const result = await this.db.query<{ output_object_key: string }>(
      `
        select output_object_key
        from client_commands
        where user_id = $1
          and output_object_key is not null
      `,
      [userId]
    );

    return result.rows.map((row) => row.output_object_key);
  }

  public async deleteUser(userId: string): Promise<boolean> {
    const result = await this.db.query<{ deleted_user_id: string }>(
      `
        with deleted_workers as (
          delete from client_workers
          where user_id = $1
          returning worker_id
        ),
        deleted_commands as (
          delete from client_commands
          where user_id = $1
          returning transaction_id
        ),
        deleted_user as (
          delete from users
          where id = $1
            and (select count(*) from deleted_workers) >= 0
            and (select count(*) from deleted_commands) >= 0
          returning id
        )
        select id as deleted_user_id
        from deleted_user
      `,
      [userId]
    );

    return result.rowCount === 1;
  }

  public authenticateUser(email: string, password: string): Promise<User | undefined> {
    return this.users.authenticateUser(email, password);
  }

  public disableUser(userId: string): Promise<User | undefined> {
    return this.users.disableUser(userId);
  }

  public close(): Promise<void> {
    return this.db.close();
  }
}
