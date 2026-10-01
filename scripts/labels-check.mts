/** Optional HTTP QA: isolated fixtures created by scripts/admin-check.mts seed. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateLabels,LABEL_DEFAULTS,MAX_LABEL_BYTES} from '../lib/admin/labels';
const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';
const cookies=JSON.parse(await readFile('.local/admin-check.json','utf8')) as Record<string,string>;
if(process.env.ADMIN_TEST_SECURE_COOKIES==='1')for(const id of Object.keys(cookies))cookies[id]='__Secure-'+cookies[id];
await fetch(origin+'/api/social');
for(const [who,status]of [['guest',401],['regular',403],['unverified',401],['banned',403],['revoked',401],['expired',401],['admin',200]] as const){
 for(const path of ['/admin-panel/labels','/api/admin/labels']){const res=await fetch(origin+path,{headers:{cookie:cookies[who]||''}});assert.equal(res.status,status,who+' '+path);assert.match(res.headers.get('cache-control')||'',/no-store|no-cache/);}
}
const original=validateLabels(await fetch(origin+'/api/admin/labels',{headers:{cookie:cookies.admin}}).then(r=>r.json()));
const save=(value:unknown,who='admin',from=origin)=>fetch(origin+'/api/admin/labels',{method:'POST',headers:{cookie:cookies[who]||'',origin:from,'content-type':'application/json'},body:JSON.stringify({value})});
try{
 for(const who of ['guest','regular','unverified','banned'])assert.equal((await save({},who)).status,who==='guest'||who==='unverified'?401:403);
 assert.equal((await save({},'admin','https://foreign.test')).status,403);
 for(const invalid of [{'unknown.key':'text'},{'nav.reels':''},{'metadata.title':'Lost placeholder'},{'nav.reels':55}])assert.equal((await save(invalid)).status,400);
 assert.equal((await save({'nav.reels':'x'.repeat(MAX_LABEL_BYTES+8192)})).status,413);
 assert.equal((await save({'nav.reels':'Mini films','auth.signIn':'Enter community','metadata.title':'{site} — Label QA'})).status,200);
 const html=await fetch(origin).then(r=>r.text());assert.match(html,/<title>RSTMC\. — Label QA<\/title>/);assert.match(html,/aria-label="Mini films"/);assert.match(html,/>Enter community<\/button>/);assert.ok(!html.includes('aria-label="Reels"'));
 assert.equal((await save({'nav.reels':'<script>not executed</script>'})).status,200);const escaped=await fetch(origin).then(r=>r.text());assert.ok(!escaped.includes('<script>not executed</script>'));assert.match(escaped,/&lt;script&gt;/);
 assert.equal((await save({...LABEL_DEFAULTS})).status,200);assert.deepEqual(await fetch(origin+'/api/admin/labels',{headers:{cookie:cookies.admin}}).then(r=>r.json()),{});
 const defaults=await fetch(origin).then(r=>r.text());assert.match(defaults,/aria-label="Reels"/);
 console.log('Label HTTP QA passed: page/API role guards, CSRF, validation/size limits, escaped text, cache invalidation, SSR nav/auth/metadata and default reset.');
}finally{assert.equal((await save(original)).status,200);}
