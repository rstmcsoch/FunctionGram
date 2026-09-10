export function missingConfiguration(){return [
 !(process.env.DATABASE_URL||process.env.POSTGRES_URL)&&'DATABASE_URL',
 !process.env.BLOB_READ_WRITE_TOKEN&&'BLOB_READ_WRITE_TOKEN',
 (!process.env.BETTER_AUTH_SECRET||process.env.BETTER_AUTH_SECRET.length<32)&&'BETTER_AUTH_SECRET'
].filter(Boolean) as string[];}
