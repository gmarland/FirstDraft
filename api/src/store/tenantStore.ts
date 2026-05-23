import { TypeOrmStoreContext } from "../db/typeOrmStoreContext.js";
import { TenantCrypto } from "../security/tenantCrypto.js";
import { ApiKeyStore } from "./tenantApiKeys/tenantApiKeyStore.js";
import { UserPasswordHasher } from "./tenantUsers/tenantUserPasswordHasher.js";
import { UserStore } from "./tenantUsers/tenantUserStore.js";
import { PostgresAppStore } from "./tenants/postgresTenantStore.js";
import { SchemaMigrator } from "./tenants/tenantSchemaMigrator.js";
import { AppStore } from "./tenants/tenantStoreTypes.js";

export type {
  CreateApiKeyResult,
  CreateUserInput,
  AppStore,
} from "./tenants/tenantStoreTypes.js";

export function createAppStore(
  db: TypeOrmStoreContext,
  crypto: TenantCrypto,
): AppStore {
  return new PostgresAppStore(
    db,
    new SchemaMigrator(db),
    new ApiKeyStore(db, crypto),
    new UserStore(db, new UserPasswordHasher()),
  );
}
