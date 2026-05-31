import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveApiKeys1760000000000 implements MigrationInterface {
  public readonly name = "RemoveApiKeys1760000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop index if exists worker_refresh_tokens_api_key_idx;
      drop index if exists api_keys_user_id_idx;

      alter table worker_refresh_tokens
        drop column if exists api_key_id;

      alter table client_workers
        drop column if exists api_key_id;

      drop table if exists api_keys;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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

      alter table worker_refresh_tokens
        add column if not exists api_key_id uuid references api_keys(id) on delete set null;

      create index if not exists worker_refresh_tokens_api_key_idx
        on worker_refresh_tokens(api_key_id);

      alter table client_workers
        add column if not exists api_key_id uuid references api_keys(id) on delete set null;
    `);
  }
}
