export function missingConfiguration(){return [
 !(process.env.DATABASE_URL||process.env.POSTGRES_URL)&&'DATABASE_URL',
 !process.env.BLOB_READ_WRITE_TOKEN&&'BLOB_READ_WRITE_TOKEN',
 (!process.env.BETTER_AUTH_SECRET||process.env.BETTER_AUTH_SECRET.length<32)&&'BETTER_AUTH_SECRET',
 !process.env.BREVO_API_KEY?.trim()&&'BREVO_API_KEY',
 !process.env.BREVO_SENDER_EMAIL?.trim()&&'BREVO_SENDER_EMAIL'
].filter(Boolean) as string[];}
