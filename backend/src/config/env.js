import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  apiUrl: process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change_this_secret_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d'
  },
  whatsapp: {
    sessionPath: process.env.WHATSAPP_SESSION_PATH ?? 'storage/whatsapp',
    headless: process.env.WHATSAPP_HEADLESS !== 'false'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
    autoReply: process.env.OPENAI_AUTO_REPLY !== 'false'
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'ventas_ai_saas'
  }
};
