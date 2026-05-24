import { randomUUID } from "crypto";
import { Repository } from "typeorm";
import { UserEntity, UserSchema } from "../../db/entities/user.js";
import { User } from "../../types.js";
import { TypeOrmStoreContext } from "../../db/typeOrmStoreContext.js";
import { UserPasswordHasher } from "./tenantUserPasswordHasher.js";
import { mapUserEntity } from "./tenantUserRowMappers.js";
import { CreateUserInput, UpdateUserInput } from "./tenantUserTypes.js";

export class UserStore {
  private readonly users: Repository<UserEntity>;

  public constructor(
    private readonly db: TypeOrmStoreContext,
    private readonly passwords: UserPasswordHasher
  ) {
    this.users = db.repository(UserSchema);
  }

  public async createUser(input: CreateUserInput): Promise<User> {
    const saved = await this.users.save(this.users.create({
      id: randomUUID(),
      email: normalizeEmail(input.email),
      passwordHash: await this.passwords.hashPassword(input.password),
      name: input.name ?? null,
      role: input.role ?? "user"
    }));

    return mapUserEntity(saved);
  }

  public async listUsers(): Promise<User[]> {
    return (await this.users.find({ order: { createdAt: "ASC" } })).map(mapUserEntity);
  }

  public async getUser(userId: string): Promise<User | undefined> {
    const user = await this.users.findOneBy({ id: userId });
    return user ? mapUserEntity(user) : undefined;
  }

  public async getUserByEmail(email: string): Promise<User | undefined> {
    const user = await this.findByEmail(email);
    return user ? mapUserEntity(user) : undefined;
  }

  public async updateUser(userId: string, input: UpdateUserInput): Promise<User | undefined> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) return undefined;

    if (input.email !== undefined) {
      user.email = normalizeEmail(input.email);
    }

    if (input.name !== undefined) {
      user.name = input.name.trim() || null;
    }

    if (input.password !== undefined) {
      user.passwordHash = await this.passwords.hashPassword(input.password);
    }

    return mapUserEntity(await this.users.save(user));
  }

  public async authenticateUser(email: string, password: string): Promise<User | undefined> {
    const user = await this.findByEmail(email);
    if (!user || user.disabledAt) return undefined;

    const valid = await this.passwords.verifyPassword(password, user.passwordHash);
    return valid ? mapUserEntity(user) : undefined;
  }

  public async disableUser(userId: string): Promise<User | undefined> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) return undefined;
    user.disabledAt ??= new Date();

    return mapUserEntity(await this.users.save(user));
  }

  public async listCommandOutputObjectKeys(userId: string): Promise<string[]> {
    const result = await this.db.query<{ output_object_key: string }>(
      `
        select output_object_key
        from client_commands
        where user_id = $1
          and output_object_key is not null
      `,
      [userId]
    );

    return result.rows.map((row) => String(row.output_object_key));
  }

  public async deleteUser(userId: string): Promise<boolean> {
    const result = await this.db.query<{ deleted: boolean }>(
      `
        with user_api_keys as (
          select id
          from api_keys
          where user_id = $1
        ),
        deleted_workers as (
          delete from client_workers
          where api_key_id in (select id from user_api_keys)
          returning worker_id
        ),
        deleted_commands as (
          delete from client_commands
          where user_id = $1
          returning transaction_id
        ),
        deleted_user as (
          delete from users
          where id = $1
          returning id
        )
        select exists(select 1 from deleted_user) as deleted
      `,
      [userId]
    );

    return result.rows[0]?.deleted === true;
  }

  private findByEmail(email: string): Promise<UserEntity | null> {
    return this.users
      .createQueryBuilder("user")
      .where("lower(user.email) = :email", { email: normalizeEmail(email) })
      .getOne();
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
