import { localDevDatabase } from './postgres';

export function missingConfiguration(){
  // The local preview runs entirely on the embedded dev database with its own
  // upload path, so no external services are required. Production deployments
  // (and production-mode builds) still validate every integration.
  if (localDevDatabase()) return [];
  return [
  !(process.env.DATABASE_URL||process.env.POSTGRES_URL)&&'DATABASE_URL',
  !process.env.BLOB_READ_WRITE_TOKEN&&'BLOB_READ_WRITE_TOKEN',
  (!process.env.BETTER_AUTH_SECRET||process.env.BETTER_AUTH_SECRET.length<32)&&'BETTER_AUTH_SECRET',
  !process.env.BREVO_API_KEY?.trim()&&'BREVO_API_KEY',
  !process.env.BREVO_SENDER_EMAIL?.trim()&&'BREVO_SENDER_EMAIL'
].filter(Boolean) as string[];}
