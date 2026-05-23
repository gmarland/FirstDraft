import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { IsNull, Repository } from "typeorm";
import { ApiKeyEntity, ApiKeySchema } from "../../db/entities/apiKey.js";
import { TypeOrmStoreContext } from "../../db/typeOrmStoreContext.js";
import { TenantCrypto } from "../../security/tenantCrypto.js";
import { ApiKey } from "../../types.js";
import { mapApiKeyEntity } from "./tenantApiKeyRowMappers.js";
import { AuthenticatedApiKey, CreateApiKeyInput, CreateApiKeyResult } from "./tenantApiKeyTypes.js";

export class ApiKeyStore {
  private readonly apiKeys: Repository<ApiKeyEntity>;

  public constructor(
    db: TypeOrmStoreContext,
    private readonly crypto: TenantCrypto
  ) {
    this.apiKeys = db.repository(ApiKeySchema);
  }

  public async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const keyId = randomUUID();
    const apiKey = `firstdraft_${randomBytes(18).toString("base64url")}`;
    const apiSecret = randomBytes(32).toString("base64url");
    const saved = await this.apiKeys.save(this.apiKeys.create({
      id: keyId,
      userId: input.userId,
      apiKeyEncrypted: this.crypto.encrypt(apiKey),
      apiSecretEncrypted: this.crypto.encrypt(apiSecret),
      name: input.name ?? null
    }));

    return {
      apiKey,
      apiSecret,
      record: this.mapApiKey(saved)
    };
  }

  public async listApiKeys(): Promise<ApiKey[]> {
    return (await this.apiKeys.find({ order: { createdAt: "ASC" } })).map((key) => this.mapApiKey(key));
  }

  public async listApiKeysForUser(userId: string): Promise<ApiKey[]> {
    return (await this.apiKeys.find({ where: { userId }, order: { createdAt: "ASC" } }))
      .map((key) => this.mapApiKey(key));
  }

  public async authenticateApiKey(apiKey: string, apiSecret: string): Promise<AuthenticatedApiKey | undefined> {
    const activeKeys = await this.apiKeys.find({ where: { revokedAt: IsNull() } });

    for (const key of activeKeys) {
      const storedApiKey = this.crypto.decrypt(key.apiKeyEncrypted);
      const storedApiSecret = this.crypto.decrypt(key.apiSecretEncrypted);
      if (safeStringEquals(storedApiKey, apiKey) && safeStringEquals(storedApiSecret, apiSecret)) {
        return {
          key: this.mapApiKey(key)
        };
      }
    }

    return undefined;
  }

  public async revokeApiKey(keyId: string): Promise<ApiKey | undefined> {
    const key = await this.apiKeys.findOneBy({ id: keyId });
    if (!key) return undefined;
    key.revokedAt ??= new Date();
    return this.mapApiKey(await this.apiKeys.save(key));
  }

  public async revokeApiKeyForUser(userId: string, keyId: string): Promise<ApiKey | undefined> {
    const key = await this.apiKeys.findOneBy({ id: keyId, userId });
    if (!key) return undefined;
    key.revokedAt ??= new Date();
    return this.mapApiKey(await this.apiKeys.save(key));
  }

  private mapApiKey(entity: ApiKeyEntity): ApiKey {
    return mapApiKeyEntity(entity, this.crypto.decrypt(entity.apiKeyEncrypted));
  }
}

function safeStringEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
