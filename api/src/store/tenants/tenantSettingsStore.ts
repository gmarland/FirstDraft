import { Repository } from "typeorm";
import { TenantSettingEntity, TenantSettingSchema } from "../../db/entities/tenantSetting.js";
import { TypeOrmStoreContext } from "../../db/typeOrmStoreContext.js";
import { generateTenantEncryptionKey } from "../../security/tenantCrypto.js";

const ENCRYPTION_KEY_SETTING = "tenant.encryption_key";

export class TenantSettingsStore {
  private readonly settings: Repository<TenantSettingEntity>;

  public constructor(db: TypeOrmStoreContext) {
    this.settings = db.repository(TenantSettingSchema);
  }

  public async ensureEncryptionKey(): Promise<string> {
    const existing = await this.getSetting(ENCRYPTION_KEY_SETTING);
    if (existing) return existing;

    const generated = generateTenantEncryptionKey();
    await this.settings
      .createQueryBuilder()
      .insert()
      .values({ key: ENCRYPTION_KEY_SETTING, value: generated })
      .orIgnore()
      .execute();

    const stored = await this.getSetting(ENCRYPTION_KEY_SETTING);
    if (!stored) throw new Error("failed to create tenant encryption key setting");
    return stored;
  }

  public async getSetting(key: string): Promise<string | undefined> {
    return (await this.settings.findOneBy({ key }))?.value;
  }

  public async setSetting(key: string, value: string): Promise<void> {
    await this.settings
      .createQueryBuilder()
      .insert()
      .values({ key, value })
      .orUpdate(["value", "updated_at"], ["key"])
      .execute();
  }
}
