import { TypeOrmStoreContext } from "../db/typeOrmStoreContext.js";
import { UserPasswordHasher } from "./tenantUsers/tenantUserPasswordHasher.js";
import { UserStore } from "./tenantUsers/tenantUserStore.js";
import { PostgresAppStore } from "./tenants/postgresTenantStore.js";
import { SchemaMigrator } from "./tenants/tenantSchemaMigrator.js";
import { AppStore } from "./tenants/tenantStoreTypes.js";

export type {
  CreateUserInput,
  AppStore,
} from "./tenants/tenantStoreTypes.js";

export function createAppStore(db: TypeOrmStoreContext): AppStore {
  return new PostgresAppStore(
    db,
    new SchemaMigrator(db),
    new UserStore(db, new UserPasswordHasher()),
  );
}
