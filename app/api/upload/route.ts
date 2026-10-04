import {adminBody} from '@/lib/admin/body';
import {handleUpload,type HandleUploadBody} from '@vercel/blob/client';
import {identity,sameOrigin,fail,AppError} from '@/lib/server';
import {reserveUpload} from '@/lib/uploads';
import {activeHold} from '@/lib/admin/roles';
import {getPool} from '@/lib/postgres';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const body=await adminBody(request,20000) as unknown as HandleUploadBody;
 const response=await handleUpload({body,request,
  onBeforeGenerateToken:async(pathname,clientPayload)=>{
   sameOrigin(request);const owner=(await identity(true))!;
   if(await activeHold(await getPool(),owner,'upload'))throw new AppError('Uploads are paused by moderation until the hold expires.',403);
   const input=await reserveUpload(pathname,owner,clientPayload);
   return {allowedContentTypes:[input.type],maximumSizeInBytes:input.size,addRandomSuffix:false,allowOverwrite:false,validUntil:Date.now()+15*60*1000,tokenPayload:JSON.stringify({owner,key:pathname})};
  },
  // The authenticated /complete request verifies and processes bytes. The signed
  // Blob callback only acknowledges transfer; it cannot publish unverified media.
  onUploadCompleted:async()=>{}
 });
 return Response.json(response);
}catch(error){return fail(error);}}
