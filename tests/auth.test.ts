import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {betterAuth} from 'better-auth';
import type {Pool} from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {schemaStatements} from '../lib/postgres-schema';
import {authConfiguration} from '../lib/auth-config';

const production='https://functiongram.vercel.app';
const preview='https://functiongram-git-fix-rstmc.vercel.app';
const config=()=>authConfiguration({VERCEL:'1',VERCEL_PROJECT_PRODUCTION_URL:'functiongram.vercel.app',VERCEL_URL:'functiongram-build-rstmc.vercel.app',VERCEL_BRANCH_URL:'functiongram-git-fix-rstmc.vercel.app'});

test('auth domains include exact production/deployment/branch URLs and reject unsafe configuration',()=>{
 assert.deepEqual(config().baseURL.allowedHosts,['functiongram.vercel.app','functiongram-build-rstmc.vercel.app','functiongram-git-fix-rstmc.vercel.app']);
 assert.deepEqual(authConfiguration({}).trustedOrigins,['http://localhost:3000']);
 assert.throws(()=>authConfiguration({VERCEL:'1',BETTER_AUTH_URL:'http://localhost:3000'}));
 assert.throws(()=>authConfiguration({BETTER_AUTH_URL:'https://name:secret@example.com'}));
 assert.throws(()=>authConfiguration({VERCEL:'1'}));
});

test('real Better Auth email/password signup, session, signout, and login against PostgreSQL schema',async()=>{
 const db=new PGlite();
 try{
  for(const sql of schemaStatements)await db.exec(sql);
  // Kysely uses the pg Pool interface; PGlite executes the same SQL in an isolated PostgreSQL engine.
  const client={query:async(text:string,values?:unknown[])=>{const result=await db.query(text,values);return {...result,rowCount:result.affectedRows};},release(){}};
  const pool={connect:async()=>client,end:async()=>{},query:client.query} as unknown as Pool;
  const auth=betterAuth({...config(),database:pool,secret:randomBytes(32).toString('hex'),logger:{level:'error'}});
  async function call(path:string,body?:unknown,cookie='',origin=production){
   return auth.handler(new Request(origin+'/api/auth/'+path,{method:body?'POST':'GET',headers:{host:new URL(origin).host,origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
  }
  const email='auth-regression@example.test',password='Example-password-123!';
  const signup=await call('sign-up/email',{email,password,name:'Regression User',callbackURL:'/'});
  assert.equal(signup.status,200,await signup.clone().text());
  const signupCookie=signup.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.ok(signupCookie.includes('session_token'));
  assert.match(signup.headers.get('set-cookie')||'',/HttpOnly/i);
  assert.match(signup.headers.get('set-cookie')||'',/Secure/i);
  const session=await (await call('get-session',undefined,signupCookie)).json() as {user:{email:string}};
  assert.equal(session.user.email,email);
  const accounts=await db.query<{password:string;providerId:string}>('SELECT password,"providerId" FROM account');
  assert.equal(accounts.rows[0].providerId,'credential');
  assert.notEqual(accounts.rows[0].password,password);
  assert.equal((await call('sign-out',{},signupCookie)).status,200);
  assert.equal(await (await call('get-session',undefined,signupCookie)).json(),null);
  assert.equal((await call('sign-in/email',{email,password:'Incorrect-password-123!'})).status,401);
  const signin=await call('sign-in/email',{email,password,callbackURL:'/'},'',preview);
  assert.equal(signin.status,200,await signin.clone().text());
  const result=await signin.json() as {url?:string};
  assert.ok(!result.url||result.url==='/'||result.url.startsWith(preview));
  const loginCookie=signin.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.equal((await (await call('get-session',undefined,loginCookie,preview)).json() as {user:{email:string}}).user.email,email);
  const short=await call('sign-up/email',{email:'short@example.test',password:'short',name:'Short'});
  assert.ok(short.status>=400);
  const duplicate=await call('sign-up/email',{email,password,name:'Duplicate'});
  assert.ok(duplicate.status>=400);
  const cross=await auth.handler(new Request(production+'/api/auth/sign-in/email',{method:'POST',headers:{host:new URL(production).host,origin:'https://unrelated.vercel.app','content-type':'application/json'},body:JSON.stringify({email,password})}));
  assert.equal(cross.status,403);
  const oauth=await call('sign-in/social',{provider:'google',callbackURL:'/'});
  assert.ok(oauth.status>=400,'No social sign-in provider is enabled');
 }finally{await db.close();}
});
