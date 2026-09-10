import {identity,sameOrigin,fail,readBody,clean,json} from '@/lib/server';
import {finishUpload} from '@/lib/uploads';
export async function POST(request:Request){try{sameOrigin(request);const owner=(await identity(true))!;const body=await readBody(request);return json(await finishUpload(clean(body.key,36,true),owner));}catch(error){return fail(error);}}
