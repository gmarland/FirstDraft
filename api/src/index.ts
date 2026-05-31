import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./server/app.js";
import { createWorkerStore } from "./store/clientStore.js";
import { createAppStore } from "./store/tenantStore.js";
import { configurePassport, createJwtConfigFromEnv } from "./auth/passport.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createWorkerAuthRoutes } from "./routes/workerAuth.js";
import { createWorkerRoutes } from "./routes/workers.js";
import { createUserApiKeyRoutes } from "./routes/userApiKeys.js";
import { SignalRHub } from "./signalr/signalRHub.js";
import { createCommandOutputStorageFromEnv, getCommandOutputStorageProviderFromEnv } from "./storage/commandOutputStorage.js";
import { publicConfigEncryptionKey, TenantCrypto } from "./security/tenantCrypto.js";
import { CommandStore } from "./store/commands/commandStore.js";
import { WorkerRecordStore } from "./store/workers/workerRecordStore.js";
import { GitRepositoryStore } from "./store/gitRepositories/gitRepositoryStore.js";
import { ApiToWorkerTokenIssuer, createWorkerJwtConfigFromEnv, WorkerTokenService } from "./auth/workerTokens.js";
import { WorkerRefreshTokenStore } from "./store/workerAuth/workerRefreshTokenStore.js";
import { TenantSettingsStore } from "./store/tenants/tenantSettingsStore.js";
import { JiraIntegrationStore } from "./store/integrations/jiraIntegrationStore.js";
import { IntegrationIntakeEventStore } from "./store/integrations/integrationIntakeEventStore.js";
import { createDataSource } from "./db/dataSource.js";
import { TypeOrmStoreContext } from "./db/typeOrmStoreContext.js";
import { IntegrationLifecycleService } from "./integrations/integrationLifecycleService.js";

const port = Number(process.env.PORT ?? 5080);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const dataSource = createDataSource(databaseUrl);
await dataSource.initialize();
await dataSource.runMigrations();
const db = new TypeOrmStoreContext(dataSource);
const tenantEncryptionKey = await new TenantSettingsStore(db).ensureEncryptionKey();
const tenantCrypto = new TenantCrypto(tenantEncryptionKey);
const workerConfigEncryptionKey = publicConfigEncryptionKey(tenantEncryptionKey);
const commands = new CommandStore(db);
const workerRecords = new WorkerRecordStore(db);
const gitRepositories = new GitRepositoryStore(db);
const jiraIntegrations = new JiraIntegrationStore(db, tenantCrypto);
const integrationIntakeEvents = new IntegrationIntakeEventStore(db);
await workerRecords.markAllWorkersStopped();
const store = createWorkerStore(commands, workerRecords, gitRepositories);
const tenants = createAppStore(db, tenantCrypto);
const jwtConfig = createJwtConfigFromEnv();
configurePassport(tenants, jwtConfig);
const workerRefreshTokens = new WorkerRefreshTokenStore(db);
const workerTokenService = new WorkerTokenService(createWorkerJwtConfigFromEnv(), workerRefreshTokens);
const apiToWorkerTokens = new ApiToWorkerTokenIssuer();
const outputStorage = createCommandOutputStorageFromEnv();
const outputStorageProvider = outputStorage ? getCommandOutputStorageProviderFromEnv() : undefined;
const integrationLifecycle = new IntegrationLifecycleService(integrationIntakeEvents, jiraIntegrations, gitRepositories);
const signalRHub = new SignalRHub(store, workerTokenService, apiToWorkerTokens, outputStorage, integrationLifecycle, gitRepositories, jiraIntegrations);
const app = createApp({
  authRoutes: createAuthRoutes(jwtConfig, tenants, outputStorage),
  workerAuthRoutes: createWorkerAuthRoutes(
    tenants,
    workerTokenService,
    apiToWorkerTokens,
    workerConfigEncryptionKey,
    integrationIntakeEvents,
    jiraIntegrations
  ),
  workerRoutes: createWorkerRoutes(store, signalRHub, outputStorage, gitRepositories),
  userApiKeyRoutes: createUserApiKeyRoutes(tenants),
  negotiateHandler: signalRHub.negotiate
});
const server = createServer(app);

signalRHub.attach(server);

server.listen(port, () => {
  console.log(`firstdraft api listening on http://localhost:${port}`);
  console.log(`signalr hub listening on http://localhost:${port}/WorkerHub`);
  console.log("postgres connected");
  console.log(`command output storage ${outputStorage ? `enabled (${outputStorageProvider})` : "disabled: set COMMAND_OUTPUT_BUCKET to enable command output uploads"}`);
  console.log("tenant encryption settings loaded from postgres");
});

async function shutdown(): Promise<void> {
  server.close();
  await tenants.close();
}

process.on("SIGINT", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("shutdown failed", error);
      process.exit(1);
    });
});

process.on("SIGTERM", () => {
  shutdown()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("shutdown failed", error);
      process.exit(1);
    });
});
