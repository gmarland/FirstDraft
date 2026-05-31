import { DbClient } from "../../db/dbClient.js";
import { toIsoString } from "../tenants/tenantRowMappers.js";

type QueryResultRow = Record<string, unknown>;

export type WorkerGitRepository = {
  workerId: string;
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  sourceBranch: string;
  targetBranch: string;
  localPath?: string;
  firstUsedAt: string;
  lastUsedAt: string;
};

export type WorkerGitRepositoryInput = {
  repositoryUrl: string;
  normalizedRepositoryUrl?: string;
  sourceBranch: string;
  targetBranch: string;
  localPath?: string;
};

export type GitRepositorySuggestion = {
  repositoryUrl: string;
  normalizedRepositoryUrl: string;
  sourceBranch: string;
  targetBranch: string;
  lastUsedAt: string;
};

export class GitRepositoryStore {
  public constructor(private readonly pool: DbClient) {}

  public async syncWorkerRepositories(workerId: string, repositories: WorkerGitRepositoryInput[]): Promise<void> {
    const normalizedRepositories = normalizeWorkerRepositoryInputs(repositories);
    const normalizedUrls = normalizedRepositories.map((repository) => repository.normalizedRepositoryUrl);

    await this.pool.query(
      `
        delete from worker_git_repositories
        where worker_id = $1
          and not (normalized_repository_url = any($2::text[]))
      `,
      [workerId, normalizedUrls]
    );

    for (const repository of normalizedRepositories) {
      await this.pool.query(
        `
          insert into worker_git_repositories (
            worker_id,
            normalized_repository_url,
            repository_url,
            source_branch,
            target_branch,
            local_path,
            last_source_branch,
            last_used_at
          )
          values ($1, $2, $3, $4, $5, $6, $4, now())
          on conflict (worker_id, normalized_repository_url)
          do update set
            repository_url = excluded.repository_url,
            source_branch = excluded.source_branch,
            target_branch = excluded.target_branch,
            local_path = coalesce(excluded.local_path, worker_git_repositories.local_path),
            last_source_branch = excluded.source_branch,
            last_used_at = now()
        `,
        [
          workerId,
          repository.normalizedRepositoryUrl,
          repository.repositoryUrl,
          repository.sourceBranch,
          repository.targetBranch,
          repository.localPath ?? null
        ]
      );
    }
  }

  public async listGitflowSuggestions(workerId: string): Promise<GitRepositorySuggestion[]> {
    const result = await this.pool.query(
      `
        select
          repository_url,
          normalized_repository_url,
          source_branch,
          target_branch,
          last_used_at
        from worker_git_repositories
        where worker_id = $1
        order by last_used_at desc, repository_url asc
      `,
      [workerId]
    );

    return result.rows.map(mapGitRepositorySuggestion);
  }

  public async getWorkerRepository(workerId: string, repositoryUrlOrNormalized: string): Promise<WorkerGitRepository | undefined> {
    const normalizedRepositoryUrl = normalizeRepositoryUrl(repositoryUrlOrNormalized);
    const result = await this.pool.query(
      `
        select
          worker_id,
          repository_url,
          normalized_repository_url,
          source_branch,
          target_branch,
          local_path,
          first_used_at,
          last_used_at
        from worker_git_repositories
        where worker_id = $1
          and normalized_repository_url = $2
      `,
      [workerId, normalizedRepositoryUrl]
    );

    return result.rows[0] ? mapWorkerGitRepository(result.rows[0]) : undefined;
  }

  public async touchWorkerRepository(workerId: string, repositoryUrlOrNormalized: string): Promise<void> {
    await this.pool.query(
      `
        update worker_git_repositories
        set last_used_at = now()
        where worker_id = $1
          and normalized_repository_url = $2
      `,
      [workerId, normalizeRepositoryUrl(repositoryUrlOrNormalized)]
    );
  }
}

export function normalizeRepositoryUrl(repositoryUrl: string): string {
  const trimmed = repositoryUrl.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+)$/i);
  if (sshMatch) {
    return normalizeGitHubPath(sshMatch[1], sshMatch[2]);
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() === "github.com") {
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length >= 2) return normalizeGitHubPath(parts[0], parts[1]);
    }
  } catch {
    // Fall back to generic normalization below.
  }

  return stripGitSuffix(trimmed).toLowerCase();
}

export function cleanBranch(value: string | undefined): string {
  return clean(value).replace(/^refs\/heads\//, "");
}

function normalizeWorkerRepositoryInputs(repositories: WorkerGitRepositoryInput[]): WorkerGitRepositoryInput[] {
  const byNormalizedUrl = new Map<string, WorkerGitRepositoryInput>();

  for (const repository of repositories) {
    const repositoryUrl = clean(repository.repositoryUrl);
    const sourceBranch = cleanBranch(repository.sourceBranch) || "main";
    const targetBranch = cleanBranch(repository.targetBranch) || sourceBranch;
    if (!repositoryUrl) continue;

    const normalizedRepositoryUrl = clean(repository.normalizedRepositoryUrl) || normalizeRepositoryUrl(repositoryUrl);
    byNormalizedUrl.set(normalizedRepositoryUrl, {
      repositoryUrl,
      normalizedRepositoryUrl,
      sourceBranch,
      targetBranch,
      localPath: clean(repository.localPath) || undefined
    });
  }

  return [...byNormalizedUrl.values()];
}

function normalizeGitHubPath(owner: string, repo: string): string {
  return `github.com/${owner.toLowerCase()}/${stripGitSuffix(repo).toLowerCase()}`;
}

function stripGitSuffix(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function mapGitRepositorySuggestion(row: QueryResultRow): GitRepositorySuggestion {
  return {
    repositoryUrl: String(row.repository_url),
    normalizedRepositoryUrl: String(row.normalized_repository_url),
    sourceBranch: String(row.source_branch),
    targetBranch: String(row.target_branch),
    lastUsedAt: toIsoString(row.last_used_at)
  };
}

function mapWorkerGitRepository(row: QueryResultRow): WorkerGitRepository {
  return {
    workerId: String(row.worker_id),
    repositoryUrl: String(row.repository_url),
    normalizedRepositoryUrl: String(row.normalized_repository_url),
    sourceBranch: String(row.source_branch),
    targetBranch: String(row.target_branch),
    localPath: row.local_path ? String(row.local_path) : undefined,
    firstUsedAt: toIsoString(row.first_used_at),
    lastUsedAt: toIsoString(row.last_used_at)
  };
}

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
