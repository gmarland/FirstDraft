import { MigrationInterface, QueryRunner } from "typeorm";

export class AllowRepeatedIntegrationIntakeEvents1710000000005 implements MigrationInterface {
  public readonly name = "AllowRepeatedIntegrationIntakeEvents1710000000005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop index if exists integration_intake_events_provider_source_item_key_idx;

      create unique index if not exists integration_intake_events_active_source_item_idx
        on integration_intake_events(provider, integration_id, source_item_key)
        where status in ('queueing', 'queued', 'processing');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      drop index if exists integration_intake_events_active_source_item_idx;

      create unique index if not exists integration_intake_events_provider_source_item_key_idx
        on integration_intake_events(provider, integration_id, source_item_key);
    `);
  }
}
