import "reflect-metadata";
import { DataSource } from "typeorm";
import { entities } from "./entities/index.js";
import { V1InitialSchema1710000000000 } from "./migrations/1710000000000-V1InitialSchema.js";
import { UserOwnedWorkers1720000000000 } from "./migrations/1720000000000-UserOwnedWorkers.js";
import { WorkerLocalRepositories1730000000000 } from "./migrations/1730000000000-WorkerLocalRepositories.js";
import { WorkerLocalJiraIntegrations1740000000000 } from "./migrations/1740000000000-WorkerLocalJiraIntegrations.js";
import { ShortJiraIntegrationIds1750000000000 } from "./migrations/1750000000000-ShortJiraIntegrationIds.js";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    entities,
    migrations: [
      V1InitialSchema1710000000000,
      UserOwnedWorkers1720000000000,
      WorkerLocalRepositories1730000000000,
      WorkerLocalJiraIntegrations1740000000000,
      ShortJiraIntegrationIds1750000000000,
    ],
    synchronize: false,
    migrationsRun: false,
  });
}
