import { ApiKeySchema } from "./apiKey.js";
import { ClientCommandSchema } from "./clientCommand.js";
import { ClientWorkerSchema } from "./clientWorker.js";
import { TenantJiraIntegrationSchema } from "./tenantJiraIntegration.js";
import { TenantSettingSchema } from "./tenantSetting.js";
import { UserSchema } from "./user.js";
import { WorkerGitRepositorySchema } from "./workerGitRepository.js";
import { WorkerRefreshTokenSchema } from "./workerRefreshToken.js";

export { ApiKeySchema } from "./apiKey.js";
export type { ApiKeyEntity } from "./apiKey.js";
export { ClientCommandSchema } from "./clientCommand.js";
export type { ClientCommandEntity } from "./clientCommand.js";
export { ClientWorkerSchema } from "./clientWorker.js";
export type { ClientWorkerEntity } from "./clientWorker.js";
export { TenantJiraIntegrationSchema } from "./tenantJiraIntegration.js";
export type { TenantJiraIntegrationEntity } from "./tenantJiraIntegration.js";
export { TenantSettingSchema } from "./tenantSetting.js";
export type { TenantSettingEntity } from "./tenantSetting.js";
export { UserSchema } from "./user.js";
export type { UserEntity } from "./user.js";
export { WorkerGitRepositorySchema } from "./workerGitRepository.js";
export type { WorkerGitRepositoryEntity } from "./workerGitRepository.js";
export { WorkerRefreshTokenSchema } from "./workerRefreshToken.js";
export type { WorkerRefreshTokenEntity } from "./workerRefreshToken.js";

export const entities = [
  UserSchema,
  TenantSettingSchema,
  ApiKeySchema,
  WorkerRefreshTokenSchema,
  ClientWorkerSchema,
  WorkerGitRepositorySchema,
  TenantJiraIntegrationSchema,
  ClientCommandSchema
];
