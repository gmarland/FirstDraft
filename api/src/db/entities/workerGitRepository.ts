import { EntitySchema } from "typeorm";

export type WorkerGitRepositoryEntity = {
  workerId: string;
  normalizedRepositoryUrl: string;
  repositoryUrl: string;
  localPath?: string | null;
  lastSourceBranch?: string | null;
  firstUsedAt: Date;
  lastUsedAt: Date;
};

export const WorkerGitRepositorySchema = new EntitySchema<WorkerGitRepositoryEntity>({
  name: "WorkerGitRepository",
  tableName: "worker_git_repositories",
  columns: {
    workerId: { type: "text", name: "worker_id", primary: true },
    normalizedRepositoryUrl: { type: "text", name: "normalized_repository_url", primary: true },
    repositoryUrl: { type: "text", name: "repository_url" },
    localPath: { type: "text", name: "local_path", nullable: true },
    lastSourceBranch: { type: "text", name: "last_source_branch", nullable: true },
    firstUsedAt: { type: "timestamptz", name: "first_used_at", createDate: true },
    lastUsedAt: { type: "timestamptz", name: "last_used_at", createDate: true }
  }
});
