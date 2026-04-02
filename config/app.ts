export default {
  name: process.env.APP_NAME ?? 'archivolt',
  env: process.env.APP_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '3100', 10),
  debug: process.env.APP_DEBUG === 'true',
  url: process.env.APP_URL ?? 'http://localhost:3100',
} as const
