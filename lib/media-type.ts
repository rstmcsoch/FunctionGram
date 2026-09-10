export const mediaTypes=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];
export function detectMediaType(bytes:Uint8Array){
 const ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes[0]===137&&ascii(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
 if(ascii(0,6)==='GIF87a'||ascii(0,6)==='GIF89a')return 'image/gif';
 if(ascii(4,8)==='ftyp')return 'video/mp4';
 if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return 'video/webm';
 return '';
}
