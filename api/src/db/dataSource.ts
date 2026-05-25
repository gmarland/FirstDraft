import "reflect-metadata";
import { DataSource } from "typeorm";
import { entities } from "./entities/index.js";
import { V1InitialSchema1710000000000 } from "./migrations/1710000000000-V1InitialSchema.js";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    entities,
    migrations: [V1InitialSchema1710000000000],
    synchronize: false,
    migrationsRun: false,
  });
}
