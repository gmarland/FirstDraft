import { MigrationInterface, QueryRunner } from "typeorm";

export class UserAgnosticIntegrationIntakeEvents1710000000011 implements MigrationInterface {
  public readonly name = "UserAgnosticIntegrationIntakeEvents1710000000011";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
      where user_id is not null
        and integration_id is not null
      on conflict do nothing;

      create index if not exists integration_intake_event_users_user_idx
        on integration_intake_event_users(user_id, event_id);

      create index if not exists integration_intake_event_users_event_user_idx
        on integration_intake_event_users(event_id, user_id);

      drop index if exists integration_intake_events_user_status_idx;

      alter table integration_intake_events
        drop column if exists user_id,
        drop column if exists integration_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table integration_intake_events
        add column if not exists user_id uuid references users(id) on delete cascade,
        add column if not exists integration_id uuid;

      update integration_intake_events events
      set user_id = participants.user_id,
        integration_id = participants.integration_id
      from (
        select distinct on (event_id)
          event_id,
          user_id,
          integration_id
        from integration_intake_event_users
        order by event_id, created_at asc, user_id asc, integration_id asc
      ) participants
      where participants.event_id = events.id;

      alter table integration_intake_events
        alter column user_id set not null,
        alter column integration_id set not null;

      create index if not exists integration_intake_events_user_status_idx
        on integration_intake_events(user_id, status, updated_at desc);

      drop index if exists integration_intake_event_users_event_user_idx;
    `);
  }
}
