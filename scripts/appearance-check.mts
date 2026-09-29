/** Optional HTTP QA. Use only isolated fixtures from scripts/admin-check.mts. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_APPEARANCE} from '../lib/appearance';
const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';
const cookies=JSON.parse(await readFile('.local/admin-check.json','utf8')) as Record<string,string>;
if(process.env.ADMIN_TEST_SECURE_COOKIES==='1')for(const id of Object.keys(cookies))cookies[id]='__Secure-'+cookies[id];
await fetch(origin+'/api/social');
for(const [who,status]of [['guest',401],['regular',403],['unverified',401],['banned',403],['revoked',401],['expired',401],['admin',200]] as const){
 for(const path of ['/rstmcadmin/appearance','/api/admin/appearance']){const res=await fetch(origin+path,{headers:{cookie:cookies[who]||''}});assert.equal(res.status,status,who+' '+path);assert.match(res.headers.get('cache-control')||'',/no-store|no-cache/);}
}
const save=(value:unknown,who='admin',from=origin)=>fetch(origin+'/api/admin/appearance',{method:'POST',headers:{cookie:cookies[who]||'',origin:from,'content-type':'application/json'},body:JSON.stringify({value})});
for(const who of ['guest','regular'])assert.equal((await save(DEFAULT_APPEARANCE,who)).status,who==='guest'?401:403);
assert.equal((await save(DEFAULT_APPEARANCE,'admin','https://foreign.test')).status,403);
const invalid=structuredClone(DEFAULT_APPEARANCE);invalid.light.primary='red;</style>';assert.equal((await save(invalid)).status,400);
const a=structuredClone(DEFAULT_APPEARANCE);a.name='Appearance HTTP test';a.wordmark='Our space';a.light.primary='#123456';a.defaultTheme='dark';a.announcement={enabled:true,text:'New community announcement',label:'Home',url:'/#/home'};
assert.equal((await save(a)).status,200);const html=await fetch(origin).then(r=>r.text());assert.match(html,/Appearance HTTP test/);assert.match(html,/--primary:#123456/);assert.match(html,/data-theme="dark"/);assert.match(html,/New community announcement/);
assert.equal((await save(DEFAULT_APPEARANCE)).status,200);
console.log('Appearance HTTP checks passed: page/API roles, CSRF, validation, SSR theme/branding/banner and cache invalidation.');
