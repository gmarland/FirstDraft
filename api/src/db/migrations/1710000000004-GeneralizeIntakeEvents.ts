import { MigrationInterface, QueryRunner } from "typeorm";

export class GeneralizeIntakeEvents1710000000004 implements MigrationInterface {
  public readonly name = "GeneralizeIntakeEvents1710000000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table if exists jira_intake_events
        rename to integration_intake_events;

      alter table if exists integration_intake_events
        rename column issue_id to source_item_id;

      alter table if exists integration_intake_events
        rename column issue_key to source_item_key;

      alter index if exists jira_intake_events_user_status_idx
        rename to integration_intake_events_user_status_idx;

      alter index if exists jira_intake_events_repository_idx
        rename to integration_intake_events_repository_idx;

      do $$
      declare
        constraint_name text;
      begin
        for constraint_name in
          select c.conname
          from pg_constraint c
          join pg_attribute a
            on a.attrelid = c.conrelid
           and a.attnum = any(c.conkey)
          where c.conrelid = 'integration_intake_events'::regclass
            and c.contype = 'f'
            and a.attname = 'integration_id'
        loop
          execute format('alter table integration_intake_events drop constraint %I', constraint_name);
        end loop;
      end $$;

      alter table integration_intake_events
        drop constraint if exists jira_intake_events_integration_id_issue_key_key,
        add column if not exists provider text,
        add column if not exists source_item_url text,
        add column if not exists metadata jsonb not null default '{}'::jsonb;

      update integration_intake_events
      set provider = 'jira'
      where provider is null;

      alter table integration_intake_events
        alter column provider set not null;

      create unique index if not exists integration_intake_events_provider_source_item_key_idx
        on integration_intake_events(provider, integration_id, source_item_key);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop index if exists integration_intake_events_provider_source_item_key_idx;

      delete from integration_intake_events
      where provider <> 'jira';

      alter table integration_intake_events
        add constraint jira_intake_events_integration_id_issue_key_key unique (integration_id, source_item_key);

      alter table integration_intake_events
        add constraint jira_intake_events_integration_id_fkey
        foreign key (integration_id) references tenant_jira_integration(id) on delete cascade;

      alter table integration_intake_events
        drop column if exists metadata,
        drop column if exists source_item_url,
        drop column if exists provider;

      alter index if exists integration_intake_events_user_status_idx
        rename to jira_intake_events_user_status_idx;

      alter index if exists integration_intake_events_repository_idx
        rename to jira_intake_events_repository_idx;

      alter table if exists integration_intake_events
        rename column source_item_key to issue_key;

      alter table if exists integration_intake_events
        rename column source_item_id to issue_id;

      alter table if exists integration_intake_events
        rename to jira_intake_events;
    `);
  }
}
