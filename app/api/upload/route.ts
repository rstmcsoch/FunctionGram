import {handleUpload,type HandleUploadBody} from '@vercel/blob/client';
import {identity,sameOrigin,fail} from '@/lib/server';
import {reserveUpload,finishUpload} from '@/lib/uploads';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const body=await request.json() as HandleUploadBody;
 const response=await handleUpload({body,request,
  onBeforeGenerateToken:async(pathname,clientPayload)=>{
   sameOrigin(request);const owner=(await identity(true))!;
   const input=await reserveUpload(pathname,owner,clientPayload);
   return {allowedContentTypes:[input.type],maximumSizeInBytes:input.size,addRandomSuffix:false,allowOverwrite:false,validUntil:Date.now()+15*60*1000,tokenPayload:JSON.stringify({owner,key:pathname})};
  },
  onUploadCompleted:async({tokenPayload})=>{const {owner,key}=JSON.parse(tokenPayload||'{}');if(typeof owner==='string'&&typeof key==='string')await finishUpload(key,owner);}
 });
 return Response.json(response);
}catch(error){return fail(error);}}
