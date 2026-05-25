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
import { CentralCommandQueue1710000000007 } from "./migrations/1710000000007-CentralCommandQueue.js";
import { ClientWorkerEnabled1710000000008 } from "./migrations/1710000000008-ClientWorkerEnabled.js";
import { CommandQueueUserScope1710000000009 } from "./migrations/1710000000009-CommandQueueUserScope.js";
import { SharedIntegrationTasks1710000000010 } from "./migrations/1710000000010-SharedIntegrationTasks.js";
import { UserAgnosticIntegrationIntakeEvents1710000000011 } from "./migrations/1710000000011-UserAgnosticIntegrationIntakeEvents.js";
import { CommandTaskSummary1710000000012 } from "./migrations/1710000000012-CommandTaskSummary.js";

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
      WorkerTaskTypes1710000000007,
      CentralCommandQueue1710000000007,
      ClientWorkerEnabled1710000000008,
      CommandQueueUserScope1710000000009,
      SharedIntegrationTasks1710000000010,
      UserAgnosticIntegrationIntakeEvents1710000000011,
      CommandTaskSummary1710000000012,
    ],
    synchronize: false,
    migrationsRun: false,
  });
}
