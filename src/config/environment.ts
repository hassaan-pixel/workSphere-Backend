import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  apiPrefix: string;
  corsOrigin: string;
  databaseUrl: string;
  gemini: {
    apiKey?: string;
    model: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  adminSeed: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
}

export const config: Config = {
  env: (process.env.NODE_ENV as Config['env']) || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  apiPrefix: process.env.API_PREFIX || '/api',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'worksphere_development_fallback_secret_key_38f9b20e',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  adminSeed: {
    email: process.env.ADMIN_EMAIL || 'admin@worksphere.io',
    password: process.env.ADMIN_PASSWORD || 'Admin@WorkSphere2026!',
    firstName: process.env.ADMIN_FIRST_NAME || 'System',
    lastName: process.env.ADMIN_LAST_NAME || 'Administrator',
  },
};
