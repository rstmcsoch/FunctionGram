import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {DEFAULT_APPEARANCE,validateAppearance,safeUrl,appearanceCss,appearanceFromSettings,targetEnabled,linkEnabled} from '../lib/appearance';
import {validateSetting} from '../lib/admin/validation';
import {serializedPool} from '../lib/serialized-pool';
import {saveAppearance} from '../lib/admin/appearance';
import {loadSettings} from '../lib/admin/core';
import * as schema from '../lib/postgres-schema';
import {adminBody} from '../lib/admin/body';
const copy=()=>structuredClone(DEFAULT_APPEARANCE);
test('appearance defaults round trip; legacy branding falls back safely; malformed persisted config is ignored',()=>{
 assert.deepEqual(validateAppearance(copy()),DEFAULT_APPEARANCE);
 assert.deepEqual(JSON.parse(String(validateSetting('appearance.config',JSON.stringify(copy())))),DEFAULT_APPEARANCE);
 assert.equal(appearanceFromSettings({'brand.name':'Legacy','theme.primary':'#123456'}).name,'Legacy');
 assert.deepEqual(appearanceFromSettings({'appearance.config':'{"nav":null}'}),DEFAULT_APPEARANCE);
 assert.ok(!appearanceCss(validateAppearance(copy())).includes('</style>'));
});
test('colours, CSS/script injection, unsafe URLs, image URLs and unbounded navigation are rejected',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','//evil.test','/\\evil.test','https://user:password@evil.test','http://example.com',' https://example.com','/path\n'])assert.equal(safeUrl(url),false,url);
 for(const url of ['/','/#/home','/legal','https://example.com/a?x=1'])assert.equal(safeUrl(url),true,url);
 for(const value of ['red','#fff','#12345g','red;}</style><script>evil</script>']){const a=copy();a.light.primary=value;assert.throws(()=>validateAppearance(a));}
 for(const value of [-1,33,NaN,1.5]){const a=copy();a.radius=value;assert.throws(()=>validateAppearance(a));}
 const a=copy();a.logoLight='https://unverified.test/image.png';assert.throws(()=>validateAppearance(a));
 a.logoLight='/media/avatar-1.jpg';a.nav[0].target='javascript:alert(1)';assert.throws(()=>validateAppearance(a));
 const dup=copy();dup.nav[1].id=dup.nav[0].id;assert.throws(()=>validateAppearance(dup));
 const tooMany=copy();tooMany.nav.forEach(n=>n.header=true);assert.throws(()=>validateAppearance(tooMany));
 const footer=copy();footer.footer.columns[0].links[0].url='data:text/html,evil';assert.throws(()=>validateAppearance(footer));
});
test('removing or hiding a built-in navigation target hides matching footer/banner links and marks direct targets unavailable',()=>{
 const a=copy();a.nav=a.nav.filter(n=>n.target!=='reels');
 assert.equal(targetEnabled(a,'reels'),false);assert.equal(linkEnabled(a,'/#/reels'),false);
 a.nav.push({...copy().nav[3],id:'alias',target:'/#/reels'});assert.equal(targetEnabled(a,'reels'),true);
 assert.equal(targetEnabled(a,'home'),true);assert.equal(linkEnabled(a,'https://example.com'),true);
 a.nav.find(n=>n.target==='profile')!.enabled=false;assert.equal(targetEnabled(a,'profile'),false);
});
test('appearance body has an explicit bounded size without raising the existing admin default limit',async()=>{
 const body=JSON.stringify({padding:'x'.repeat(9000)});
 await assert.rejects(adminBody(new Request('https://example.test',{method:'POST',body})),{status:413});
 assert.ok(await adminBody(new Request('https://example.test',{method:'POST',body}),16384));
 await assert.rejects(adminBody(new Request('https://example.test',{method:'POST',body:JSON.stringify({padding:'x'.repeat(17000)})}),16384),{status:413});
});
test('appearance save authorizes, verifies image ownership, audits atomically, and retains approved branding across admins',async()=>{
 const db=new PGlite();try{
 for(const sql of [...schema.schemaStatements,...schema.socialUpgradeStatements,...schema.aspectUpgradeStatements,...schema.accountUpgradeStatements,...schema.adminUpgradeStatements,...schema.adminUsersUpgradeStatements,...schema.adminContentUpgradeStatements,...schema.mediaUpgradeStatements])await db.exec(sql);
 const pool=serializedPool({async query(sql,values){const r=await db.query(sql,values);return{rows:r.rows as Record<string,unknown>[],rowCount:r.affectedRows??r.rows.length};}});
 for(const [id,role]of [['admin','admin'],['other','admin'],['user','user']]){await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified")VALUES($1,$1,$2,$3,true)',[id,id+'@test.example',role]);await pool.query('INSERT INTO profiles(id,username,name,created_at)VALUES($1,$1,$1,1)',[id]);}
 await assert.rejects(saveAppearance(pool,'user',copy()),{status:403});
 const key=crypto.randomUUID();await pool.query("INSERT INTO assets(key,owner_id,mime,size,created_at)VALUES($1,'admin','image/png',10,1)",[key]);
 const a=copy();a.logoLight='/api/media/'+key;
 await assert.rejects(saveAppearance(pool,'other',a),{status:400});
 await saveAppearance(pool,'admin',a);assert.equal(appearanceFromSettings(await loadSettings(pool)).logoLight,a.logoLight);
 a.name='Second admin';await saveAppearance(pool,'other',a);
 assert.equal((await pool.query('SELECT * FROM admin_audit_log')).rows.length,2);
 await db.exec("CREATE FUNCTION reject_appearance_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$; CREATE TRIGGER reject_appearance_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_appearance_audit()");
 a.name='Must roll back';await assert.rejects(saveAppearance(pool,'admin',a));assert.equal(appearanceFromSettings(await loadSettings(pool)).name,'Second admin');
 }finally{await db.close();}
});
