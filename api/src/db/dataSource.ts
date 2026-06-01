import "reflect-metadata";
import { DataSource } from "typeorm";
import { entities } from "./entities/index.js";
import { V1InitialSchema1710000000000 } from "./migrations/1710000000000-V1InitialSchema.js";
import { UserOwnedWorkers1720000000000 } from "./migrations/1720000000000-UserOwnedWorkers.js";
import { WorkerLocalRepositories1730000000000 } from "./migrations/1730000000000-WorkerLocalRepositories.js";
import { WorkerLocalJiraIntegrations1740000000000 } from "./migrations/1740000000000-WorkerLocalJiraIntegrations.js";
import { ShortJiraIntegrationIds1750000000000 } from "./migrations/1750000000000-ShortJiraIntegrationIds.js";
import { RemoveApiKeys1760000000000 } from "./migrations/1760000000000-RemoveApiKeys.js";
import { RemoveWorkerEnabled1770000000000 } from "./migrations/1770000000000-RemoveWorkerEnabled.js";
import { NullableWorkerMaxConcurrentTasks1780000000000 } from "./migrations/1780000000000-NullableWorkerMaxConcurrentTasks.js";
import { JiraIntegrationAssigneeFilters1790000000000 } from "./migrations/1790000000000-JiraIntegrationAssigneeFilters.js";
import { RemoveWorkerJiraIntegrationToken1800000000000 } from "./migrations/1800000000000-RemoveWorkerJiraIntegrationToken.js";

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
      RemoveApiKeys1760000000000,
      RemoveWorkerEnabled1770000000000,
      NullableWorkerMaxConcurrentTasks1780000000000,
      JiraIntegrationAssigneeFilters1790000000000,
      RemoveWorkerJiraIntegrationToken1800000000000,
    ],
    synchronize: false,
    migrationsRun: false,
  });
}
