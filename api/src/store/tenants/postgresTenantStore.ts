import { CloseableDbClient } from "../../db/dbClient.js";
import { ApiKey, User } from "../../types.js";
import { ApiKeyStore } from "../tenantApiKeys/tenantApiKeyStore.js";
import { UserStore } from "../tenantUsers/tenantUserStore.js";
import { SchemaMigrator } from "./tenantSchemaMigrator.js";
import { AuthenticatedApiKey, CreateApiKeyInput, CreateApiKeyResult, CreateUserInput, AppStore } from "./tenantStoreTypes.js";

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
