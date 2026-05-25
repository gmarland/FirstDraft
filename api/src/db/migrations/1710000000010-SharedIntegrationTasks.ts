import { MigrationInterface, QueryRunner } from "typeorm";

export class SharedIntegrationTasks1710000000010 implements MigrationInterface {
  public readonly name = "SharedIntegrationTasks1710000000010";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists client_command_users (
        transaction_id text not null references client_commands(transaction_id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        created_at timestamptz not null default now(),
        primary key (transaction_id, user_id)
      );

      insert into client_command_users (transaction_id, user_id)
      select transaction_id, user_id
      from client_commands
      on conflict do nothing;

      create index if not exists client_command_users_user_idx
        on client_command_users(user_id, transaction_id);

      create table if not exists integration_intake_event_users (
        event_id uuid not null references integration_intake_events(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        integration_id uuid not null,
        created_at timestamptz not null default now(),
        primary key (event_id, user_id, integration_id)
      );

      insert into integration_intake_event_users (event_id, user_id, integration_id)
      select id, user_id, integration_id
      from integration_intake_events
      on conflict do nothing;

      create index if not exists integration_intake_event_users_user_idx
        on integration_intake_event_users(user_id, event_id);

      drop index if exists integration_intake_events_active_source_item_idx;

      with ranked as (
        select
          id,
          user_id,
          transaction_id,
          first_value(transaction_id) over (
            partition by provider, source_item_url
            order by created_at asc, id asc
          ) as shared_transaction_id,
          row_number() over (
            partition by provider, source_item_url
            order by created_at asc, id asc
          ) as duplicate_rank
        from integration_intake_events
        where source_item_url is not null
          and status in ('queueing', 'queued', 'processing')
      )
      insert into client_command_users (transaction_id, user_id)
      select shared_transaction_id, user_id
      from ranked
      where duplicate_rank > 1
        and shared_transaction_id is not null
      on conflict do nothing;

      with ranked as (
        select
          id,
          user_id,
          integration_id,
          first_value(id) over (
            partition by provider, source_item_url
            order by created_at asc, id asc
          ) as shared_event_id,
          row_number() over (
            partition by provider, source_item_url
            order by created_at asc, id asc
          ) as duplicate_rank
        from integration_intake_events
        where source_item_url is not null
          and status in ('queueing', 'queued', 'processing')
      )
      insert into integration_intake_event_users (event_id, user_id, integration_id)
      select shared_event_id, user_id, integration_id
      from ranked
      where duplicate_rank > 1
      on conflict do nothing;

      with ranked as (
        select
          id,
          first_value(transaction_id) over (
            partition by provider, source_item_url
            order by created_at asc, id asc
          ) as shared_transaction_id,
          row_number() over (
            partition by provider, source_item_url
            order by created_at asc, id asc
          ) as duplicate_rank
        from integration_intake_events
        where source_item_url is not null
          and status in ('queueing', 'queued', 'processing')
      )
      update integration_intake_events events
      set status = 'skipped',
        error_message = 'duplicate active intake joined to shared task',
        transaction_id = coalesce(ranked.shared_transaction_id, events.transaction_id),
        updated_at = now()
      from ranked
      where events.id = ranked.id
        and ranked.duplicate_rank > 1;

      create unique index if not exists integration_intake_events_active_source_item_idx
        on integration_intake_events(provider, source_item_url)
        where source_item_url is not null
          and status in ('queueing', 'queued', 'processing');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop index if exists integration_intake_events_active_source_item_idx;

      create unique index if not exists integration_intake_events_active_source_item_idx
        on integration_intake_events(provider, integration_id, source_item_key)
        where status in ('queueing', 'queued', 'processing');

      drop table if exists integration_intake_event_users;
      drop table if exists client_command_users;
    `);
  }
}
