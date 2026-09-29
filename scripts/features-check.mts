/** Optional HTTP QA against isolated scripts/admin-check.mts fixtures only. */
import assert from 'node:assert/strict';
import {validateFeatures} from '../lib/features';
import {readFile} from 'node:fs/promises';
const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';
const cookies=JSON.parse(await readFile('.local/admin-check.json','utf8')) as Record<string,string>;
if(process.env.ADMIN_TEST_SECURE_COOKIES==='1')for(const id of Object.keys(cookies))cookies[id]='__Secure-'+cookies[id];
await fetch(origin+'/api/social');
for(const [who,status]of [['guest',401],['regular',403],['unverified',401],['banned',403],['revoked',401],['expired',401],['admin',200]] as const){
 for(const path of ['/rstmcadmin/features','/api/admin/features']){const res=await fetch(origin+path,{headers:{cookie:cookies[who]||''}});assert.equal(res.status,status,who+' '+path);}
}
const original=validateFeatures(await fetch(origin+'/api/admin/features',{headers:{cookie:cookies.admin}}).then(r=>r.json()));
const save=(value:unknown,confirmation='',from=origin)=>fetch(origin+'/api/admin/features',{method:'POST',headers:{cookie:cookies.admin,origin:from,'content-type':'application/json'},body:JSON.stringify({value,confirmation})});
try{
 assert.equal((await save(original,'','https://foreign.test')).status,403);
 const value=structuredClone(original);value.flags.likes.percent=101;assert.equal((await save(value)).status,400);value.flags.likes.percent=100;
 value.maintenance.enabled=true;value.maintenance.title='Feature QA maintenance';assert.equal((await save(value)).status,400);assert.equal((await save(value,'MAINTENANCE')).status,200);
 assert.match(await fetch(origin).then(r=>r.text()),/Feature QA maintenance/);
 assert.equal((await fetch(origin+'/api/social')).status,503);
 assert.equal((await fetch(origin+'/api/social',{headers:{cookie:cookies.regular}})).status,503);
 assert.equal((await fetch(origin+'/api/social',{headers:{cookie:cookies.admin}})).status,200);
 assert.equal((await fetch(origin+'/rstmcadmin/features',{headers:{cookie:cookies.admin}})).status,200);
 value.maintenance.enabled=false;value.flags.reels.enabled=false;value.flags.guestBrowsing.enabled=false;assert.equal((await save(value)).status,200);
 assert.equal((await fetch(origin+'/api/social')).status,401);
 assert.equal((await fetch(origin+'/api/social?reels=1',{headers:{cookie:cookies.admin}})).status,403);
 console.log('Feature HTTP QA passed: role guards, CSRF, validation, maintenance confirmation/SSR/admin bypass, guest and reel API denial.');
}finally{assert.equal((await save(original,original.maintenance.enabled?'MAINTENANCE':'')).status,200);}
