import { EntitySchema } from "typeorm";

export type UserEntity = {
  id: string;
  email: string;
  passwordHash?: string | null;
  googleSub?: string | null;
  name?: string | null;
  role: string;
  createdAt: Date;
  disabledAt?: Date | null;
};

export const UserSchema = new EntitySchema<UserEntity>({
  name: "User",
  tableName: "users",
  columns: {
    id: { type: "uuid", primary: true },
    email: { type: "text" },
    passwordHash: { type: "text", name: "password_hash", nullable: true },
    googleSub: { type: "text", name: "google_sub", nullable: true },
    name: { type: "text", nullable: true },
    role: { type: "text", default: "'user'" },
    createdAt: { type: "timestamptz", name: "created_at", createDate: true },
    disabledAt: { type: "timestamptz", name: "disabled_at", nullable: true }
  }
});
