import { MigrationInterface, QueryRunner } from "typeorm";

export class GoogleAuthUsers1710000000009 implements MigrationInterface {
  public readonly name = "GoogleAuthUsers1710000000009";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table users
        add column if not exists google_sub text,
        alter column password_hash drop not null;

      create unique index if not exists users_google_sub_key
        on users (google_sub)
        where google_sub is not null;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop index if exists users_google_sub_key;

      alter table users
        drop column if exists google_sub;
    `);
  }
}
