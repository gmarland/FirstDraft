import { randomBytes, randomUUID, createHash } from "crypto";
import { IsNull, Repository } from "typeorm";
import { ApiKeyEntity, ApiKeySchema } from "../../db/entities/apiKey.js";
import { WorkerRefreshTokenEntity, WorkerRefreshTokenSchema } from "../../db/entities/workerRefreshToken.js";
import { TypeOrmStoreContext } from "../../db/typeOrmStoreContext.js";

export type IssuedRefreshToken = {
  id: string;
  refreshToken: string;
  workerId: string;
  apiKeyId: string;
  expiresAt: Date;
};

export type ConsumedRefreshToken = {
  id: string;
  workerId: string;
  apiKeyId: string;
  userId: string;
};

export class WorkerRefreshTokenStore {
  private readonly apiKeys: Repository<ApiKeyEntity>;
  private readonly refreshTokens: Repository<WorkerRefreshTokenEntity>;

  public constructor(db: TypeOrmStoreContext) {
    this.apiKeys = db.repository(ApiKeySchema);
    this.refreshTokens = db.repository(WorkerRefreshTokenSchema);
  }

  public async issue(workerId: string, apiKeyId: string, ttlSeconds: number): Promise<IssuedRefreshToken> {
    const id = randomUUID();
    const refreshToken = `swr_${randomBytes(48).toString("base64url")}`;
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.refreshTokens.insert({ id, workerId, apiKeyId, refreshTokenHash, expiresAt });

    return { id, refreshToken, workerId, apiKeyId, expiresAt };
  }

  public async consume(refreshToken: string): Promise<ConsumedRefreshToken | undefined> {
    const result = await this.refreshTokens
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => "now()" })
      .where("refresh_token_hash = :refreshTokenHash", { refreshTokenHash: hashRefreshToken(refreshToken) })
      .andWhere("revoked_at is null")
      .andWhere("expires_at > now()")
      .andWhere(`
        exists (
          select 1
          from api_keys
          where api_keys.id = api_key_id
            and api_keys.revoked_at is null
        )
      `)
      .returning(["id", "worker_id", "api_key_id"])
      .execute();

    const row = result.raw[0] as { id?: unknown; worker_id?: unknown; api_key_id?: unknown } | undefined;
    if (!row) return undefined;

    const apiKeyId = String(row.api_key_id);
    const apiKey = await this.apiKeys.findOneBy({ id: apiKeyId });
    if (!apiKey) return undefined;

    return {
      id: String(row.id),
      workerId: String(row.worker_id),
      apiKeyId,
      userId: apiKey.userId
    };
  }

  public async markReplaced(id: string, replacementId: string): Promise<void> {
    await this.refreshTokens.update({ id }, { replacedBy: replacementId });
  }

  public async isActiveApiKey(apiKeyId: string): Promise<boolean> {
    return await this.apiKeys.existsBy({ id: apiKeyId, revokedAt: IsNull() });
  }
}

function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("base64url");
}
