import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// En desarrollo se lee el .env de la raíz del repo; en producción systemd inyecta EnvironmentFile.
for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(p)) {
    process.loadEnvFile(p);
    break;
  }
}

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().default('postgres://ceniza:ceniza@127.0.0.1:5432/ceniza'),
  APP_NAME: z.string().default('Los Juegos de la Ceniza'),
  PUBLIC_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  TRUST_PROXY: z.string().default('loopback'),
  UPLOAD_DIR: z.string().default('./var/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(50).default(12),
  MAX_PHOTOS_PER_USER: z.coerce.number().int().min(1).max(500).default(40),
  MAX_TEMPLATES_PER_USER: z.coerce.number().int().min(1).max(500).default(30),
  REGISTRATION_CODE: z.string().optional(),
  ADMIN_USERNAMES: z.string().default(''),
  SERVE_STATIC: bool.default(false),
  STATIC_DIR: z.string().default('../web/dist'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  EXTRA_ALLOWED_ORIGINS: z.string().default(''),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuración no válida:', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  process.exit(1);
}
const env = parsed.data;

function parseTrustProxy(v: string): boolean | string | number {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // 'loopback', '127.0.0.1', CIDR…
}

export const config = {
  ...env,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  uploadDir: resolve(env.UPLOAD_DIR),
  staticDir: resolve(env.STATIC_DIR),
  maxUploadBytes: Math.round(env.MAX_UPLOAD_MB * 1024 * 1024),
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
  registrationCode: env.REGISTRATION_CODE?.trim() || null,
  adminUsernames: new Set(env.ADMIN_USERNAMES.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
  extraOrigins: new Set(env.EXTRA_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)),
  sessionTtlMs: env.SESSION_TTL_DAYS * 24 * 3600 * 1000,
};
export type AppConfig = typeof config;
