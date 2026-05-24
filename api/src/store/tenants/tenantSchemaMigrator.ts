import { DbClient } from "../../db/dbClient.js";

export class SchemaMigrator {
  public constructor(private readonly pool: DbClient) {}

  public async migrate(): Promise<void> {
    await this.pool.query(`
      create table if not exists users (
        id uuid primary key,
        email text not null,
        password_hash text not null,
        name text,
        role text not null default 'user',
        created_at timestamptz not null default now(),
        disabled_at timestamptz
      );

      create unique index if not exists users_lower_email_key
        on users (lower(email));

      create table if not exists tenant_settings (
        key text primary key,
        value text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists api_keys (
        id uuid primary key,
        user_id uuid not null references users(id) on delete cascade,
        api_key_encrypted text not null,
        api_secret_encrypted text not null,
        name text,
        created_at timestamptz not null default now(),
        revoked_at timestamptz
      );

      create index if not exists api_keys_user_id_idx
        on api_keys(user_id);

      create table if not exists worker_refresh_tokens (
        id uuid primary key,
        worker_id text not null,
        api_key_id uuid not null references api_keys(id) on delete cascade,
        refresh_token_hash text not null unique,
        issued_at timestamptz not null default now(),
        expires_at timestamptz not null,
        revoked_at timestamptz,
        replaced_by uuid
      );

      create index if not exists worker_refresh_tokens_api_key_idx
        on worker_refresh_tokens(api_key_id);

      create index if not exists worker_refresh_tokens_worker_idx
        on worker_refresh_tokens(worker_id);

      create table if not exists client_workers (
        worker_id text primary key,
        api_key_id uuid references api_keys(id) on delete set null,
        first_registered_at timestamptz not null default now(),
        last_registered_at timestamptz not null default now(),
        last_seen_at timestamptz,
        last_connection_id text,
        paths text[] not null default '{}',
        skills text[] not null default '{}',
        enabled_task_types text[] not null default '{ai,shell,gitflow}',
        max_concurrent_tasks integer not null default 1
      );

      alter table client_workers
        add column if not exists enabled_task_types text[] not null default '{ai,shell,gitflow}',
        add column if not exists max_concurrent_tasks integer not null default 1;

      create index if not exists client_workers_last_seen_idx
        on client_workers(last_seen_at desc);

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

      alter table user_git_repositories
        add column if not exists default_target_branch text not null default 'main',
        add column if not exists enabled boolean not null default true,
        add column if not exists created_at timestamptz not null default now(),
        add column if not exists updated_at timestamptz not null default now();

      create index if not exists user_git_repositories_user_last_used_idx
        on user_git_repositories(user_id, last_used_at desc);

      create table if not exists worker_git_repositories (
        worker_id text not null references client_workers(worker_id) on delete cascade,
        normalized_repository_url text not null,
        repository_url text not null,
        local_path text,
        last_source_branch text,
        first_used_at timestamptz not null default now(),
        last_used_at timestamptz not null default now(),
        primary key (worker_id, normalized_repository_url)
      );

      create index if not exists worker_git_repositories_worker_last_used_idx
        on worker_git_repositories(worker_id, last_used_at desc);

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

      alter table tenant_jira_integration
        drop constraint if exists tenant_jira_integration_singleton;

      do $$
      declare
        generated_id text;
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_name = 'tenant_jira_integration'
            and column_name = 'id'
            and data_type <> 'uuid'
        ) then
          select format(
            '%s-%s-%s-%s-%s',
            substr(seed, 1, 8),
            substr(seed, 9, 4),
            substr(seed, 13, 4),
            substr(seed, 17, 4),
            substr(seed, 21, 12)
          )
          into generated_id
          from (select md5(random()::text || clock_timestamp()::text) as seed) generated;

          alter table tenant_jira_integration
            alter column id drop default;

          update tenant_jira_integration
          set id = generated_id
          where id = 'default';

          alter table tenant_jira_integration
            alter column id type uuid using id::uuid;
        end if;
      end $$;

      drop index if exists tenant_jira_integration_singleton_idx;

      alter table tenant_jira_integration
        add column if not exists user_id uuid;

      update tenant_jira_integration
      set user_id = coalesce(user_id, (select id from users order by created_at asc limit 1))
      where user_id is null;

      delete from tenant_jira_integration
      where user_id is null;

      alter table tenant_jira_integration
        alter column user_id set not null;

      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'tenant_jira_integration_user_id_fkey'
        ) then
          alter table tenant_jira_integration
            add constraint tenant_jira_integration_user_id_fkey
            foreign key (user_id) references users(id) on delete cascade;
        end if;
      end $$;

      create index if not exists tenant_jira_integration_user_id_idx
        on tenant_jira_integration(user_id);

      create index if not exists tenant_jira_integration_user_enabled_idx
        on tenant_jira_integration(user_id, enabled);

      alter table tenant_jira_integration
        add column if not exists board_id integer;

      alter table tenant_jira_integration
        add column if not exists board_name text;

      alter table tenant_jira_integration
        add column if not exists board_type text;

      alter table tenant_jira_integration
        add column if not exists board_filter_id integer;

      alter table tenant_jira_integration
        add column if not exists ready_status_id text;

      alter table tenant_jira_integration
        add column if not exists ready_status_name text;

      alter table tenant_jira_integration
        drop column if exists ready_jql;

      alter table tenant_jira_integration
        add column if not exists processing_status_id text;

      alter table tenant_jira_integration
        add column if not exists processing_status_name text;

      alter table tenant_jira_integration
        add column if not exists processed_status_id text;

      alter table tenant_jira_integration
        add column if not exists processed_status_name text;

      alter table tenant_jira_integration
        drop column if exists processed_transition_id;

      alter table tenant_jira_integration
        drop column if exists processed_transition_name;

      create table if not exists client_commands (
        transaction_id text primary key,
        user_id uuid not null references users(id),
        worker_id text not null,
        command text not null,
        execution_command text,
        command_mode text not null default 'ai',
        status text not null,
        result text,
        agent_response text,
        error_message text,
        output_object_key text,
        output_bytes bigint,
        output_started_at timestamptz,
        output_updated_at timestamptz,
        created_at timestamptz not null default now(),
        claimed_at timestamptz,
        completed_at timestamptz
      );

      alter table client_commands
        add column if not exists result text;

      alter table client_commands
        add column if not exists execution_command text;

      alter table client_commands
        add column if not exists agent_response text;

      alter table client_commands
        drop column if exists task_id;

      drop table if exists client_task_gitflow_state;

      drop table if exists client_tasks;

      create index if not exists client_commands_worker_created_idx
        on client_commands(worker_id, created_at);

      create index if not exists client_commands_status_idx
        on client_commands(status);
    `);
  }
}
