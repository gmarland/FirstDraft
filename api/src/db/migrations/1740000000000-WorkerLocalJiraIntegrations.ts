import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkerLocalJiraIntegrations1740000000000 implements MigrationInterface {
  public readonly name = "WorkerLocalJiraIntegrations1740000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists worker_jira_integrations (
        worker_id text not null references client_workers(worker_id) on delete cascade,
        integration_id text not null,
        user_id uuid not null references users(id) on delete cascade,
        site_url text not null,
        email text not null,
        board_id integer not null,
        board_name text not null,
        board_type text not null,
        board_filter_id integer,
        ready_status_id text not null,
        ready_status_name text not null,
        processing_status_id text not null,
        processing_status_name text not null,
        processed_status_id text not null,
        processed_status_name text not null,
        assignee_account_ids text[] not null default '{}',
        assignee_display_names text[] not null default '{}',
        assignee_email_addresses text[] not null default '{}',
        enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (worker_id, integration_id)
      );

      create index if not exists worker_jira_integrations_user_enabled_idx
        on worker_jira_integrations(user_id, enabled);

      create index if not exists worker_jira_integrations_integration_idx
        on worker_jira_integrations(integration_id);

      drop table if exists tenant_jira_integration;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists tenant_jira_integration (
        id uuid primary key,
        user_id uuid not null references users(id) on delete cascade,
        site_url text,
        email text,
        api_token_encrypted text,
        board_id integer,
        board_name text,
        board_type text,
        board_filter_id integer,
        ready_status_id text,
        ready_status_name text,
        processing_status_id text,
        processing_status_name text,
        processed_status_id text,
        processed_status_name text,
        enabled boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists tenant_jira_integration_user_id_idx
        on tenant_jira_integration(user_id);

      create index if not exists tenant_jira_integration_user_enabled_idx
        on tenant_jira_integration(user_id, enabled);

      drop table if exists worker_jira_integrations;
    `);
  }
}
