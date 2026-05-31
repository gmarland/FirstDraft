import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkerLocalRepositories1730000000000 implements MigrationInterface {
  public readonly name = "WorkerLocalRepositories1730000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table worker_git_repositories
        add column if not exists source_branch text,
        add column if not exists target_branch text;

      update worker_git_repositories
      set source_branch = coalesce(source_branch, last_source_branch, 'main'),
        target_branch = coalesce(target_branch, source_branch, last_source_branch, 'main');

      alter table worker_git_repositories
        alter column source_branch set not null,
        alter column target_branch set not null;

      drop index if exists user_git_repositories_user_last_used_idx;
      drop table if exists user_git_repositories;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists user_git_repositories (
        user_id uuid not null references users(id) on delete cascade,
        repository_url text not null,
        normalized_repository_url text not null,
        default_source_branch text not null,
        default_target_branch text not null default 'main',
        last_source_branch text not null,
        enabled boolean not null default true,
        first_used_at timestamptz not null default now(),
        last_used_at timestamptz not null default now(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (user_id, normalized_repository_url)
      );

      create index if not exists user_git_repositories_user_last_used_idx
        on user_git_repositories(user_id, last_used_at desc);

      alter table worker_git_repositories
        drop column if exists target_branch,
        drop column if exists source_branch;
    `);
  }
}
