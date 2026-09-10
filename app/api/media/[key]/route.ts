import { bucket,db,fail,AppError } from '@/lib/server';
export async function GET(request:Request,{params}:{params:Promise<{key:string}>}){try{
 const {key}=await params;if(!/^[a-f0-9-]{36}$/.test(key))throw new AppError('Media not found.',404);
 const metadata=await db().prepare('SELECT mime,size FROM assets WHERE key=?').bind(key).first<{mime:string;size:number}>();if(!metadata)throw new AppError('Media not found.',404);
 const rangeHeader=request.headers.get('range');let range:{offset:number;length:number}|undefined;
 if(rangeHeader){const match=/^bytes=(\d*)-(\d*)$/.exec(rangeHeader);let start=0,end=metadata.size-1;
  if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${metadata.size}`}});
  if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}else start=Math.max(0,metadata.size-Number(match[2]));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=metadata.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${metadata.size}`}});
  range={offset:start,length:end-start+1};
 }
 const object=await bucket().get(key,range?{range}:undefined);if(!object)throw new AppError('Media not found.',404);
 const headers=new Headers({'Content-Type':metadata.mime,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes',ETag:object.httpEtag});
 if(range){headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${object.size}`);headers.set('Content-Length',String(range.length));return new Response(object.body,{status:206,headers});}
 headers.set('Content-Length',String(object.size));return new Response(object.body,{status:200,headers});
}catch(error){return fail(error);}}
