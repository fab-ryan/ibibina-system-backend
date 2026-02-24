import { Module } from '@nestjs/common';
import { CommonModule } from './common';

@Module({
  imports: [CommonModule],
})
export class AppModule {}
