import sharp from 'sharp';
import {detectMediaType} from './media-type';
import {AdminError} from './admin/validation';
import {checkUploadInput} from './media-policy';
import {MIB,type MediaConfig} from './media-config';
import {mediaDuration} from './reel-duration';
export type ProcessedMedia={bytes:Buffer;mime:string;width:number|null;height:number|null;duration:number|null};
export async function readBounded(body:ReadableStream<Uint8Array>,max:number){
 const reader=body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max)throw new AdminError('The file exceeds the current upload size limit.',413);chunks.push(part.value);}}finally{await reader.cancel();}
 return Buffer.concat(chunks);
}
export async function processMedia(bytes:Buffer,mime:string,config:MediaConfig):Promise<ProcessedMedia>{
 checkUploadInput(config,bytes.length,mime);
 if(detectMediaType(bytes.subarray(0,16))!==mime)throw new AdminError('The file contents do not match its photo or video type.');
 if(mime.startsWith('video/')){
  // Zero disables the duration cap, not server verification. The browser's
  // duration is never trusted, and completed uploads keep verified metadata.
  const duration=await mediaDuration(bytes);
  if(config.videoMaxSeconds&&duration>config.videoMaxSeconds)throw new AdminError('The video exceeds the current duration limit.');
  return {bytes,mime,width:null,height:null,duration};
 }
 try{
  const image=sharp(bytes,{limitInputPixels:40_000_000,failOn:'error'}).timeout({seconds:20});const meta=await image.metadata();
  if(!meta.width||!meta.height||(meta.pages||1)>200||meta.width*meta.height*(meta.pages||1)>80_000_000)throw new Error();
  // Animated GIFs remain animated (the previous client also preserved them).
  // Decode to verify integrity, but do not silently flatten an animation.
  if(mime==='image/gif'){const output=await sharp(bytes,{animated:true,limitInputPixels:80_000_000,failOn:'error'}).timeout({seconds:20}).rotate().resize({width:config.imageMaxDimension,height:config.imageMaxDimension,fit:'inside',withoutEnlargement:true}).gif({colours:Math.max(2,Math.round(config.imageQuality*2.55)),effort:3}).toBuffer({resolveWithObject:true});if(output.data.length>config.maxFileMb*MIB)throw new AdminError('The processed image exceeds the current upload size limit.');return {bytes:output.data,mime,width:output.info.width,height:output.info.pageHeight??output.info.height,duration:null};}
  const resized=image.rotate().resize({width:config.imageMaxDimension,height:config.imageMaxDimension,fit:'inside',withoutEnlargement:true});
  const output=await (config.imageFormat==='jpeg'?resized.flatten({background:'#fff'}).jpeg({quality:config.imageQuality}):config.imageFormat==='png'?resized.png({quality:config.imageQuality}):resized.webp({quality:config.imageQuality})).toBuffer({resolveWithObject:true});
  if(output.data.length>config.maxFileMb*MIB)throw new AdminError('The processed image exceeds the current upload size limit.');
  return {bytes:output.data,mime:'image/'+config.imageFormat,width:output.info.width,height:output.info.height,duration:null};
 }catch(error){if(error instanceof AdminError)throw error;throw new AdminError('This image could not be safely decoded.');}
}
