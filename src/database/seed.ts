import { NestFactory } from '@nestjs/core';
import { SeederModule } from './seeder.module';
import { UserSeeder } from '../modules/users/users.seeder';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SeederModule, {
    logger: ['log', 'error', 'warn'],
  });

  const userSeeder = app.get(UserSeeder);

  const command = process.argv[2];

  try {
    if (command === 'clear') {
      await userSeeder.clear();
    } else if (command === 'seed') {
      await userSeeder.seed();
    } else if (command === 'refresh') {
      await userSeeder.clear();
      await userSeeder.seed();
    } else {
      console.log(`
Usage:
  npm run seed          - Seed users (skip existing)
  npm run seed:clear    - Remove all users
  npm run seed:refresh  - Clear and re-seed users
      `);
    }
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

void bootstrap();
