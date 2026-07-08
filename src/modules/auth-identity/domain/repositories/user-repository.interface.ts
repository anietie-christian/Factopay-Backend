import { User } from '../models/user.model';

export const USER_REPOSITORY_TOKEN = 'IUserRepository';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhoneNumber(phoneNumber: string): Promise<User | null>;
  save(user: User): Promise<User>;
}
