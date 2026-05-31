import { randomBytes, randomUUID, createHash } from "crypto";
import { IsNull, Repository } from "typeorm";
import { UserEntity, UserSchema } from "../../db/entities/user.js";
import { WorkerRefreshTokenEntity, WorkerRefreshTokenSchema } from "../../db/entities/workerRefreshToken.js";
import { TypeOrmStoreContext } from "../../db/typeOrmStoreContext.js";

export type IssuedRefreshToken = {
  id: string;
  refreshToken: string;
  workerId: string;
  userId: string;
  expiresAt: Date;
};

export type ConsumedRefreshToken = {
  id: string;
  workerId: string;
  userId: string;
};

export class WorkerRefreshTokenStore {
  private readonly users: Repository<UserEntity>;
  private readonly refreshTokens: Repository<WorkerRefreshTokenEntity>;

  public constructor(db: TypeOrmStoreContext) {
    this.users = db.repository(UserSchema);
    this.refreshTokens = db.repository(WorkerRefreshTokenSchema);
  }

  public async issue(workerId: string, userId: string, ttlSeconds: number): Promise<IssuedRefreshToken> {
    const id = randomUUID();
    const refreshToken = `swr_${randomBytes(48).toString("base64url")}`;
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.refreshTokens.insert({ id, workerId, userId, refreshTokenHash, expiresAt });

    return { id, refreshToken, workerId, userId, expiresAt };
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
          from users
          where users.id = user_id
            and users.disabled_at is null
        )
      `)
      .returning(["id", "workerId", "userId"])
      .execute();

    const consumed = readConsumedRefreshToken(result.raw?.[0], result.generatedMaps?.[0]);
    if (!consumed) return undefined;

    const user = await this.users.findOneBy({ id: consumed.userId, disabledAt: IsNull() });
    if (!user) return undefined;

    return consumed;
  }

  public async markReplaced(id: string, replacementId: string): Promise<void> {
    await this.refreshTokens.update({ id }, { replacedBy: replacementId });
  }

  public async isActiveUser(userId: string): Promise<boolean> {
    return await this.users.existsBy({ id: userId, disabledAt: IsNull() });
  }
}

function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("base64url");
}

type RefreshTokenUpdateRow = {
  id?: unknown;
  worker_id?: unknown;
  workerId?: unknown;
  user_id?: unknown;
  userId?: unknown;
};

function readConsumedRefreshToken(rawRow: unknown, generatedMap: unknown): ConsumedRefreshToken | undefined {
  const raw = rawRow as RefreshTokenUpdateRow | undefined;
  const mapped = generatedMap as RefreshTokenUpdateRow | undefined;
  const id = readRequiredString(raw?.id, mapped?.id);
  const workerId = readRequiredString(raw?.worker_id, raw?.workerId, mapped?.worker_id, mapped?.workerId);
  const userId = readRequiredString(raw?.user_id, raw?.userId, mapped?.user_id, mapped?.userId);

  return id && workerId && userId ? { id, workerId, userId } : undefined;
}

function readRequiredString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }

  return undefined;
}
