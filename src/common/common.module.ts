import { Global, Module } from '@nestjs/common';
import { I18nModule } from './modules';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [I18nModule],
  providers: [ConfigService],
  exports: [I18nModule, ConfigService],
})
export class CommonModule {}
