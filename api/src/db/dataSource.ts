import "reflect-metadata";
import { DataSource } from "typeorm";
import { entities } from "./entities/index.js";
import { BaselineSchema1710000000000 } from "./migrations/1710000000000-BaselineSchema.js";
import { RepositoryConfiguration1710000000001 } from "./migrations/1710000000001-RepositoryConfiguration.js";
import { DropRepositoryBranches1710000000002 } from "./migrations/1710000000002-DropRepositoryBranches.js";
import { JiraIntakeEvents1710000000003 } from "./migrations/1710000000003-JiraIntakeEvents.js";
import { GeneralizeIntakeEvents1710000000004 } from "./migrations/1710000000004-GeneralizeIntakeEvents.js";
import { AllowRepeatedIntegrationIntakeEvents1710000000005 } from "./migrations/1710000000005-AllowRepeatedIntegrationIntakeEvents.js";
import { WorkerRuntimeState1710000000006 } from "./migrations/1710000000006-WorkerRuntimeState.js";
import { WorkerTaskTypes1710000000007 } from "./migrations/1710000000007-WorkerTaskTypes.js";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    entities,
    migrations: [
      BaselineSchema1710000000000,
      RepositoryConfiguration1710000000001,
      DropRepositoryBranches1710000000002,
      JiraIntakeEvents1710000000003,
      GeneralizeIntakeEvents1710000000004,
      AllowRepeatedIntegrationIntakeEvents1710000000005,
      WorkerRuntimeState1710000000006,
      WorkerTaskTypes1710000000007
    ],
    synchronize: false,
    migrationsRun: false
  });
}
