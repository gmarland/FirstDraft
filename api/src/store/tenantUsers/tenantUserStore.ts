import { randomUUID } from "crypto";
import { Repository } from "typeorm";
import { UserEntity, UserSchema } from "../../db/entities/user.js";
import { User } from "../../types.js";
import { TypeOrmStoreContext } from "../../db/typeOrmStoreContext.js";
import { UserPasswordHasher } from "./tenantUserPasswordHasher.js";
import { mapUserEntity } from "./tenantUserRowMappers.js";
import { CreateUserInput } from "./tenantUserTypes.js";

export class UserStore {
  private readonly users: Repository<UserEntity>;

  public constructor(
    db: TypeOrmStoreContext,
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
