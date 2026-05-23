import { MigrationInterface, QueryRunner } from "typeorm";

export class RepositoryConfiguration1710000000001 implements MigrationInterface {
  public readonly name = "RepositoryConfiguration1710000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table user_git_repositories
        add column if not exists default_target_branch text not null default 'main',
        add column if not exists enabled boolean not null default true,
        add column if not exists created_at timestamptz not null default now(),
        add column if not exists updated_at timestamptz not null default now();

      update user_git_repositories
      set default_target_branch = coalesce(nullif(default_target_branch, ''), default_source_branch, 'main'),
          updated_at = now();

      drop table if exists user_git_repository_branches;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table user_git_repositories
        drop column if exists updated_at,
        drop column if exists created_at,
        drop column if exists enabled,
        drop column if exists default_target_branch;
    `);
  }
}
