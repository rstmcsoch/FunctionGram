import {missingConfiguration} from '@/lib/config';
import {ensureSchema,getPool} from '@/lib/postgres';
export const dynamic='force-dynamic';
export async function GET(){const missing=missingConfiguration();if(missing.length)return Response.json({status:'setup_required',missing},{status:503});try{await ensureSchema();await getPool().query('SELECT 1');return Response.json({status:'ready'});}catch(error){console.error('FunctionGram database health check failed',error);return Response.json({status:'database_unavailable'},{status:503});}}
