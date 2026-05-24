import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkerRuntimeState1710000000006 implements MigrationInterface {
  public readonly name = "WorkerRuntimeState1710000000006";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        add column if not exists state text not null default 'stopped',
        add column if not exists state_updated_at timestamptz,
        add column if not exists stopped_at timestamptz;

      update client_workers
      set state_updated_at = coalesce(state_updated_at, last_seen_at, last_registered_at, first_registered_at);

      update client_workers
      set stopped_at = coalesce(stopped_at, state_updated_at, last_seen_at, last_registered_at, first_registered_at)
      where state = 'stopped';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        drop column if exists stopped_at,
        drop column if exists state_updated_at,
        drop column if exists state;
    `);
  }
}
