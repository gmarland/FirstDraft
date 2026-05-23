import { EntitySchema } from "typeorm";

export type TenantSettingEntity = {
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
};

export const TenantSettingSchema = new EntitySchema<TenantSettingEntity>({
  name: "TenantSetting",
  tableName: "tenant_settings",
  columns: {
    key: { type: "text", primary: true },
    value: { type: "text" },
    createdAt: { type: "timestamptz", name: "created_at", createDate: true },
    updatedAt: { type: "timestamptz", name: "updated_at", updateDate: true }
  }
});
