import { MigrationInterface, QueryRunner } from "typeorm";

export class UserOwnedWorkers1720000000000 implements MigrationInterface {
  public readonly name = "UserOwnedWorkers1720000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table worker_refresh_tokens
        add column if not exists user_id uuid references users(id) on delete cascade;

      do $$
      begin
        if to_regclass('api_keys') is not null
          and exists (
            select 1
            from information_schema.columns
            where table_name = 'worker_refresh_tokens'
              and column_name = 'api_key_id'
          )
        then
          update worker_refresh_tokens
          set user_id = api_keys.user_id
          from api_keys
          where worker_refresh_tokens.user_id is null
            and worker_refresh_tokens.api_key_id = api_keys.id;

          alter table worker_refresh_tokens
            alter column api_key_id drop not null;
        end if;
      end $$;

      create index if not exists worker_refresh_tokens_user_idx
        on worker_refresh_tokens(user_id);

      alter table client_workers
        add column if not exists user_id uuid references users(id) on delete cascade;

      do $$
      begin
        if to_regclass('api_keys') is not null
          and exists (
            select 1
            from information_schema.columns
            where table_name = 'client_workers'
              and column_name = 'api_key_id'
          )
        then
          update client_workers
          set user_id = api_keys.user_id
          from api_keys
          where client_workers.user_id is null
            and client_workers.api_key_id = api_keys.id;
        end if;
      end $$;

      create index if not exists client_workers_user_idx
        on client_workers(user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop index if exists client_workers_user_idx;
      drop index if exists worker_refresh_tokens_user_idx;
      alter table client_workers drop column if exists user_id;
      alter table worker_refresh_tokens drop column if exists user_id;
    `);
  }
}
