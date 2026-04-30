import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { promises as fs } from 'fs';
import * as crypto from 'crypto';

@Injectable()
export class SetupService {
  private readonly rootPath = process.cwd();
  private readonly envPath = join(this.rootPath, '.env');
  private readonly envExamplePath = join(this.rootPath, '.env.example');

  async setup(): Promise<void> {
    await this.createEnvFile();
  }

  async createEnvFile(): Promise<void> {
    try {
      await fs.access(this.envPath);
      console.log('.env file already exists.');
    } catch {
      await fs.copyFile(this.envExamplePath, this.envPath);
      console.log('.env file created successfully.');
    }
  }

  async validateEnvironmentVariables(): Promise<void> {
    const requiredVars = [
      'PORT',
      'DB_HOST',
      'DB_PORT',
      'DB_USERNAME',
      'DB_PASSWORD',
      'DB_DATABASE',
      'JWT_SECRET',
      'REFRESH_TOKEN_SECRET',
    ];

    const missingVars: string[] = [];

    for (const varName of requiredVars) {
      if (!process.env[varName] || process.env[varName].trim() === '') {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      console.warn(`⚠️  Missing required environment variables: ${missingVars.join(', ')}`);
      await this.promptForMissingVariables(missingVars);
    } else {
      console.log('✅ All required environment variables are present');
    }
  }

  private async promptForMissingVariables(missingVars: string[]): Promise<void> {
    // In a real implementation, you might want to use a proper CLI library like inquirer
    console.log('🔧 Auto-generating missing variables with defaults...');
    const defaults = this.getDefaultEnvironmentValues();
    await this.updateEnvFile(missingVars, defaults);
  }
  private getDefaultEnvironmentValues(): Record<string, string> {
    return {
      PREFIX: 'api',
      PORT: '3000',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'password',
      DB_DATABASE: 'semafara_db',
      DB_SYNCHRONIZE: 'true',
      I18N_WATCH: 'true',
      FALLBACK_LANGUAGE: 'en',
      I18N_LOGGING: 'false',
      BACKEND_DOMAIN: 'http://localhost:3000',
      JWT_SECRET: this.generateSecureSecret(),
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
      MAIL_HOST: 'smtp.gmail.com',
      MAIL_PORT: '587',
      MAIL_PASS: '',
      MAIL_USER: '',
      MAIL_FROM: 'noreply@fab-finder.com',
    };
  }
  private generateSecureSecret(length = 64): string {
    return crypto.randomBytes(length).toString('hex');
  }
  private async updateEnvFile(
    variables: string[],
    defaults: Record<string, string>,
  ): Promise<void> {
    let envContent = '';

    try {
      envContent = await fs.readFile(this.envPath, 'utf-8');
    } catch {
      // File doesn't exist, create it
      envContent = '';
    }

    for (const varName of variables) {
      const value = defaults[varName] || '';
      const regex = new RegExp(`^${varName}=.*$`, 'm');

      if (regex.test(envContent)) {
        // Update existing variable if it's empty
        const currentMatch = envContent.match(new RegExp(`^${varName}=(.*)$`, 'm'));
        if (currentMatch && currentMatch[1].trim() === '') {
          envContent = envContent.replace(regex, `${varName}=${value}`);
        }
      } else {
        // Add new variable
        envContent += `\n${varName}=${value}`;
      }
    }

    await fs.writeFile(this.envPath, envContent);
    console.log(`✅ Updated environment variables: ${variables.join(', ')}`);
  }
  async addEnvironmentVariable(key: string, value: string, description?: string): Promise<void> {
    try {
      let envContent = await fs.readFile(this.envPath, 'utf-8');
      const regex = new RegExp(`^${key}=.*$`, 'm');

      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
        console.log(`♻️  Updated environment variable: ${key}`);
      } else {
        envContent += `\n${key}=${value}`;
        console.log(`➕ Added new environment variable: ${key}`);
      }

      await fs.writeFile(this.envPath, envContent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to add/update environment variable: ${errorMessage}`);
    }
  }

  async removeEnvironmentVariable(key: string): Promise<void> {
    try {
      let envContent = await fs.readFile(this.envPath, 'utf-8');
      const regex = new RegExp(`^${key}=.*$\n?`, 'm');
      envContent = envContent.replace(regex, '');
      await fs.writeFile(this.envPath, envContent);
      console.log(`🗑️  Removed environment variable: ${key}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to remove environment variable: ${errorMessage}`);
    }
  }
}
