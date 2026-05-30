import { CloseableDbClient } from "../../db/dbClient.js";
import { ApiKey, User } from "../../types.js";
import { ApiKeyStore } from "../tenantApiKeys/tenantApiKeyStore.js";
import { UserStore } from "../tenantUsers/tenantUserStore.js";
import { SchemaMigrator } from "./tenantSchemaMigrator.js";
import { AuthenticatedApiKey, CreateApiKeyInput, CreateApiKeyResult, CreateUserInput, UpdateUserInput, AppStore } from "./tenantStoreTypes.js";

export class PostgresAppStore implements AppStore {
  public constructor(
    private readonly db: CloseableDbClient,
    private readonly schema: SchemaMigrator,
    private readonly apiKeys: ApiKeyStore,
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

  public async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const user = await this.users.getUser(input.userId);
    if (!user || user.disabledAt) {
      throw new Error("user not found");
    }

    return this.apiKeys.createApiKey(input);
  }

  public listApiKeys(): Promise<ApiKey[]> {
    return this.apiKeys.listApiKeys();
  }

  public listApiKeysForUser(userId: string): Promise<ApiKey[]> {
    return this.apiKeys.listApiKeysForUser(userId);
  }

  public authenticateApiKey(apiKey: string, apiSecret: string): Promise<AuthenticatedApiKey | undefined> {
    return this.apiKeys.authenticateApiKey(apiKey, apiSecret);
  }

  public revokeApiKey(keyId: string): Promise<ApiKey | undefined> {
    return this.apiKeys.revokeApiKey(keyId);
  }

  public revokeApiKeyForUser(userId: string, keyId: string): Promise<ApiKey | undefined> {
    return this.apiKeys.revokeApiKeyForUser(userId, keyId);
  }

  public close(): Promise<void> {
    return this.db.close();
  }
}
