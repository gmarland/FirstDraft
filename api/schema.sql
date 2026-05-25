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
  enabled boolean not null default true,
  enabled_task_types text[] not null default '{ai,shell,gitflow}',
  max_concurrent_tasks integer not null default 1,
  state text not null default 'stopped',
  state_updated_at timestamptz,
  stopped_at timestamptz
);

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

create index if not exists tenant_jira_integration_user_id_idx
  on tenant_jira_integration(user_id);

create index if not exists tenant_jira_integration_user_enabled_idx
  on tenant_jira_integration(user_id, enabled);

create table if not exists client_commands (
  transaction_id text primary key,
  user_id uuid not null references users(id),
  worker_id text,
  command text not null,
  task_summary text,
  execution_command text,
  command_mode text not null default 'ai',
  repository_url text,
  normalized_repository_url text,
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

create index if not exists client_commands_worker_created_idx
  on client_commands(worker_id, created_at);

create index if not exists client_commands_status_idx
  on client_commands(status);

create index if not exists client_commands_queue_idx
  on client_commands(status, worker_id, command_mode, created_at);

create index if not exists client_commands_queue_user_idx
  on client_commands(status, user_id, worker_id, command_mode, created_at);

create index if not exists client_commands_repository_idx
  on client_commands(normalized_repository_url);

create table if not exists client_command_users (
  transaction_id text not null references client_commands(transaction_id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (transaction_id, user_id)
);

create index if not exists client_command_users_user_idx
  on client_command_users(user_id, transaction_id);

create table if not exists integration_intake_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_item_id text not null,
  source_item_key text not null,
  source_item_url text,
  repository_url text not null,
  normalized_repository_url text not null,
  worker_id text references client_workers(worker_id) on delete set null,
  transaction_id text references client_commands(transaction_id) on delete set null,
  status text not null,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists integration_intake_event_users (
  event_id uuid not null references integration_intake_events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  integration_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, integration_id)
);

create index if not exists integration_intake_event_users_user_idx
  on integration_intake_event_users(user_id, event_id);

create index if not exists integration_intake_event_users_event_user_idx
  on integration_intake_event_users(event_id, user_id);

create unique index if not exists integration_intake_events_active_source_item_idx
  on integration_intake_events(provider, source_item_url)
  where source_item_url is not null
    and status in ('queueing', 'queued', 'processing');

create index if not exists integration_intake_events_repository_idx
  on integration_intake_events(normalized_repository_url);

create index if not exists integration_intake_events_transaction_created_idx
  on integration_intake_events(transaction_id, created_at, id)
  where transaction_id is not null;
