++ b/scripts/content-check.mts
/** Isolated HTTP checks. Run after scripts/admin-check.mts, never against real accounts. */
import assert from 'node:assert/strict';
import type {Post} from '../lib/types';
import {readFile} from 'node:fs/promises';
const origin=process.env.ADMIN_TEST_ORIGIN||'http://localhost:3000';
const cookies=JSON.parse(await readFile('.local/admin-check.json','utf8')) as Record<string,string>;
if(process.env.ADMIN_TEST_SECURE_COOKIES==='1')for(const key of Object.keys(cookies))cookies[key]='__Secure-'+cookies[key];
const get=(query:string)=>fetch(origin+'/api/social'+query).then(r=>r.json() as Promise<Post[]>);
const action=(operation:string,extra:Record<string,unknown>={},who='admin',requestOrigin=origin)=>fetch(origin+'/api/admin',{method:'POST',headers:{origin:requestOrigin,cookie:cookies[who]||'','content-type':'application/json'},body:JSON.stringify({action:'moderateContent',resource:'posts',operation,ids:['demo_coast'],confirmation:'demo_coast',reason:'Isolated phase three regression',...extra})});
for(const who of ['guest','regular','banned','unverified','forged'])assert.ok([401,403].includes((await action('hide',{},who)).status));
assert.equal((await action('hide',{},'admin','https://foreign.example.test')).status,403);
assert.equal((await action('hide',{confirmation:'wrong'})).status,400);
assert.equal((await action('hide')).status,200);
assert.equal((await get('?post=demo_coast')).length,0);
assert.equal((await fetch(origin+'/api/social?comments=demo_coast')).status,404);
assert.equal((await action('unhide')).status,200);assert.equal((await get('?post=demo_coast')).length,1);
assert.equal((await action('delete')).status,200);assert.equal((await get('?post=demo_coast')).length,0);
assert.equal((await action('purge')).status,403,'bootstrap admin cannot purge');
assert.equal((await action('restore')).status,200);assert.equal((await get('?post=demo_coast')).length,1);
assert.equal((await action('edit',{caption:'Phase three HTTP edit'})).status,200);
assert.equal((await get('?post=demo_coast'))[0].caption,'Phase three HTTP edit');
const setting=(key:string,value:unknown)=>action('',{action:'contentSetting',key,value});
assert.equal((await setting('content.storyHours',169)).status,400);
assert.equal((await setting('brand.name','not content')).status,400);
assert.equal((await setting('content.reelsEnabled',false)).status,200);assert.equal((await get('?post=demo_flowers')).length,0);
assert.equal((await setting('content.reelsEnabled',true)).status,200);
assert.equal((await setting('content.reelCredit','Phase three original credit')).status,200);
assert.equal((await get('?post=demo_flowers'))[0].reel_credit,'Phase three original credit');
assert.equal((await setting('content.reelCredit','')).status,200);
// Keep demo fixtures intact for browser QA. Permanent purge and rollback are covered by isolated unit databases.
console.log('Content HTTP checks passed: denial, origin, typed confirmation, hide/restore, settings and immediate public visibility.');
