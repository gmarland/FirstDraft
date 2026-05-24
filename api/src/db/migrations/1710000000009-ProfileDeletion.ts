import { MigrationInterface, QueryRunner } from "typeorm";

export class ProfileDeletion1710000000009 implements MigrationInterface {
  public readonly name = "ProfileDeletion1710000000009";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
          where c.conrelid = 'client_commands'::regclass
            and c.contype = 'f'
            and a.attname = 'user_id'
        loop
          execute format('alter table client_commands drop constraint %I', constraint_name);
        end loop;
      end $$;

      alter table client_commands
        add constraint client_commands_user_id_fkey
        foreign key (user_id) references users(id) on delete cascade;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      alter table client_commands
        drop constraint if exists client_commands_user_id_fkey;

      alter table client_commands
        add constraint client_commands_user_id_fkey
        foreign key (user_id) references users(id);
    `);
  }
}
