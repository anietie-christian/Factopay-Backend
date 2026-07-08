import { Module } from '@nestjs/common';
import { SharedModule } from './modules/shared/shared.module';
import { AuthIdentityModule } from './modules/auth-identity/auth-identity.module';

@Module({
  imports: [SharedModule, AuthIdentityModule],
  controllers: [],
  providers: [],
})
export class AppModule {}


