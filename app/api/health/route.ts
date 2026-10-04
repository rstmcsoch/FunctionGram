import {missingConfiguration} from '@/lib/config';
import {ensureSchema,getPool} from '@/lib/postgres';
export const dynamic='force-dynamic';
export async function GET(){
  const missing=missingConfiguration();
  if(missing.length){
    // Names stay in the server log. The public body must not list secret or
    // integration keys for View Source / DevTools.
    console.error('FunctionGram configuration incomplete', missing.join(','));
    return Response.json({status:'setup_required'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
  try{
    await ensureSchema();
    await (await getPool()).query('SELECT 1');
    return Response.json({status:'ready'},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('FunctionGram database health check failed', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({status:'database_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
