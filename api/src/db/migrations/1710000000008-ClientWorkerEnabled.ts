import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientWorkerEnabled1710000000008 implements MigrationInterface {
  public readonly name = "ClientWorkerEnabled1710000000008";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        add column if not exists enabled boolean not null default true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_workers
        drop column if exists enabled;
    `);
  }
}
