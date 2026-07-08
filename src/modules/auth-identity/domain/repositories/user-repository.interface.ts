import { User } from '../models/user.model';

export const USER_REPOSITORY_TOKEN = 'IUserRepository';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhoneNumber(phoneNumber: string): Promise<User | null>;
  findBySocialProvider(provider: string, providerId: string): Promise<User | null>;
  linkSocialAccount(userId: string, provider: string, providerId: string): Promise<void>;
  save(user: User): Promise<User>;
}
