import { MigrationInterface, QueryRunner } from "typeorm";

export class JiraIntakeEvents1710000000003 implements MigrationInterface {
  public readonly name = "JiraIntakeEvents1710000000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists jira_intake_events (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        integration_id uuid not null references tenant_jira_integration(id) on delete cascade,
        issue_id text not null,
        issue_key text not null,
        repository_url text not null,
        normalized_repository_url text not null,
        worker_id text references client_workers(worker_id) on delete set null,
        transaction_id text references client_commands(transaction_id) on delete set null,
        status text not null,
        error_message text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (integration_id, issue_key)
      );

      create index if not exists jira_intake_events_user_status_idx
        on jira_intake_events(user_id, status, updated_at desc);

      create index if not exists jira_intake_events_repository_idx
        on jira_intake_events(normalized_repository_url);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("drop table if exists jira_intake_events;");
  }
}
