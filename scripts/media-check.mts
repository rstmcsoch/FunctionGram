/** HTTP QA only against isolated scripts/admin-check.mts fixtures. No real Blob/email services. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {validateMedia,MIB} from '../lib/media-config';
const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';
const cookies=JSON.parse(await readFile(process.env.ADMIN_TEST_FIXTURE||'.local/admin-check.json','utf8')) as Record<string,string>;
if(process.env.ADMIN_TEST_SECURE_COOKIES==='1')for(const id of Object.keys(cookies))cookies[id]='__Secure-'+cookies[id];
const headers=(who='admin')=>({cookie:cookies[who]||'',origin});
const get=(url:string,who='admin')=>fetch(origin+url,{headers:headers(who)});
const post=(url:string,value:unknown,who='admin',from=origin)=>fetch(origin+url,{method:'POST',headers:{...headers(who),origin:from,'content-type':'application/json'},body:JSON.stringify(value)});
await get('/api/social','regular');
for(const [who,status] of [['guest',401],['regular',403],['unverified',401],['banned',403],['expired',401],['revoked',401],['admin',200]] as const)for(const path of ['/rstmcadmin/media','/api/admin/media'])assert.equal((await get(path,who)).status,status,who+' '+path);
const initial=await get('/api/admin/media').then(r=>r.json()) as {config:unknown};const original=validateMedia(initial.config);
const save=(value:unknown)=>post('/api/admin/media',{action:'settings',value});
const upload=async(bytes:Buffer,type:string)=>{const form=new FormData();form.set('key',crypto.randomUUID());form.set('file',new Blob([new Uint8Array(bytes)],{type}),'fixture');return fetch(origin+'/api/dev-upload',{method:'POST',headers:headers('regular'),body:form});};
const action=(key:string,action:string,who='admin')=>post('/api/admin/media',{action,key,confirmation:key,reason:'HTTP QA'},who);
try{
 assert.equal((await post('/api/admin/media',{action:'settings',value:original},'admin','https://foreign.test')).status,403);
 assert.equal((await save({...original,maxFileMb:101})).status,400);
 assert.equal((await post('/api/admin/media',{action:'settings',value:original},'regular')).status,403);
 let config={...original,maxFileMb:50,dailyQuotaMb:250,enabled:true,imageFormat:'webp' as const,imageMaxDimension:640,videoMaxSeconds:0};assert.equal((await save(config)).status,200);
 // A real multipart 40 MiB request passes through the live route, not just a unit validator.
 const video=Buffer.alloc(40*MIB);(await readFile('public/media/flowers.mp4')).copy(video);const accepted=await upload(video,'video/mp4');assert.equal(accepted.status,200,await accepted.clone().text());const media=await accepted.json() as {url:string;type:string};const key=media.url.slice(11);
 const served=await fetch(origin+media.url,{headers:{range:'bytes=0-15'}});assert.equal(served.status,206);assert.equal((await served.arrayBuffer()).byteLength,16);assert.equal(served.headers.get('cache-control'),'private, no-store');
 assert.equal((await upload(Buffer.alloc(50*MIB+1),'video/mp4')).status,400);
 config={...config,maxFileMb:20};await save(config);assert.equal((await post('/api/social',{action:'create_post',kind:'post',media:[media.url]},'regular')).status,400,'cached large asset must be denied');
 config={...config,maxFileMb:50};await save(config);const created=await post('/api/social',{action:'create_post',kind:'post',media:[media.url],caption:'Phase 7 isolated QA'},'regular');assert.equal(created.status,200,await created.clone().text());assert.equal((await action(key,'trash')).status,400,'referenced asset protected');
 assert.equal((await action(key,'quarantine')).status,200);assert.equal((await get(media.url,'regular')).status,404);assert.equal((await action(key,'release')).status,200);
 const image=await sharp({create:{width:2000,height:1000,channels:3,background:'#ff0000'}}).jpeg().toBuffer();const resized=await upload(image,'image/jpeg');assert.equal(resized.status,200,await resized.clone().text());const photo=await resized.json() as {url:string;type:string;aspect:number};assert.equal(photo.type,'image/webp');assert.equal(photo.aspect,2);const response=await get(photo.url);const encoded=await response.arrayBuffer();const info=await sharp(Buffer.from(encoded as ArrayBuffer)).metadata();assert.equal(info.width,640);assert.equal(info.format,'webp');
 const photoKey=photo.url.slice(11);assert.equal((await action(photoKey,'trash')).status,200);assert.equal((await get(photo.url)).status,404);assert.equal((await action(photoKey,'restore')).status,200);assert.equal((await action(photoKey,'trash')).status,200);assert.equal((await action(photoKey,'purge')).status,403);assert.equal((await action(photoKey,'purge','owner')).status,200);assert.equal((await get(photo.url)).status,404);
 config={...config,videoMaxSeconds:1};await save(config);assert.equal((await upload(await readFile('public/media/flowers.mp4'),'video/mp4')).status,400);
 config={...config,dailyQuotaMb:1,videoMaxSeconds:0};await save(config);assert.equal((await upload(image,'image/jpeg')).status,429,'original 40 MiB transfer still consumes quota');
 config={...config,enabled:false};await save(config);assert.equal((await upload(image,'image/jpeg')).status,403);
 console.log('Media HTTP QA passed: guards, CSRF, actual 40 MiB upload at 50 MiB, over-limit denial, cached reuse denial, byte range serving, image re-encode, duration/quota/disable controls, reference protection, quarantine, restore and owner-only physical purge.');
}finally{assert.equal((await save(original)).status,200);}
