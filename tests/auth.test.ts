import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {betterAuth} from 'better-auth';
import {createEmailVerificationToken} from 'better-auth/api';
import type {Pool} from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {schemaStatements} from '../lib/postgres-schema';
import {authConfiguration} from '../lib/auth-config';
import {createVerificationEmailSender} from '../lib/email';

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

test('Brevo verification gates real Better Auth signup, login, and sessions against PostgreSQL',async()=>{
 const db=new PGlite();
 try{
  for(const sql of schemaStatements)await db.exec(sql);
  // Kysely uses the pg Pool interface; PGlite executes the same SQL in an isolated PostgreSQL engine.
  const client={query:async(text:string,values?:unknown[])=>{const result=await db.query(text,values);return {...result,rowCount:result.affectedRows};},release(){}};
  const pool={connect:async()=>client,end:async()=>{},query:client.query} as unknown as Pool;
  const secret=randomBytes(32).toString('hex');
  const deliveries:{to:{email:string}[];textContent:string;htmlContent:string}[]=[];
  const sendEmail=createVerificationEmailSender({BREVO_API_KEY:'test-only-key',BREVO_SENDER_EMAIL:'noreply@example.test'},async (_url,options)=>{
   deliveries.push(JSON.parse(String(options?.body)));
   return Response.json({messageId:'test-message'},{status:201});
  });
  const options=config();
  const auth=betterAuth({...options,database:pool,secret,logger:{level:'error'},emailVerification:{...options.emailVerification,sendVerificationEmail:sendEmail}});
  async function call(path:string,body?:unknown,cookie='',origin=production){
   return auth.handler(new Request(origin+'/api/auth/'+path,{method:body?'POST':'GET',headers:{host:new URL(origin).host,origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
  }
  const email='auth-regression@example.test',password='Example-password-123!';
  const signup=await call('sign-up/email',{email,password,name:'Regression User',callbackURL:'/'});
  assert.equal(signup.status,200,await signup.clone().text());
  assert.ok(!signup.headers.get('set-cookie')?.includes('session_token'),'Signup must not grant a session before verification');
  assert.equal(deliveries.length,1);
  assert.equal(deliveries[0].to[0].email,email);
  assert.match(deliveries[0].textContent,/15 minutes/);
  assert.equal((await signup.json() as {user:{emailVerified:boolean}}).user.emailVerified,false);
  const blocked=await call('sign-in/email',{email,password,callbackURL:'/'});
  assert.equal(blocked.status,403);
  assert.equal((await blocked.json() as {code:string}).code,'EMAIL_NOT_VERIFIED');
  assert.equal(deliveries.length,2,'Existing unverified users receive a link at sign-in');
  const invalid=await call('verify-email?token=invalid&callbackURL='+encodeURIComponent(production+'/verify-email?verified=1'));
  assert.match(invalid.headers.get('location')||'',/error=INVALID_TOKEN/);
  const expired=await createEmailVerificationToken(secret,email,undefined,-60);
  const expiredResponse=await call('verify-email?token='+expired+'&callbackURL='+encodeURIComponent(production+'/verify-email?verified=1'));
  assert.match(expiredResponse.headers.get('location')||'',/error=TOKEN_EXPIRED/);
  assert.equal((await db.query<{emailVerified:boolean}>('SELECT "emailVerified" FROM "user"')).rows[0].emailVerified,false);
  assert.equal((await call('send-verification-email',{email,callbackURL:'/'})).status,200);
  assert.equal(deliveries.length,3);
  const unknown=await call('send-verification-email',{email:'missing@example.test',callbackURL:'/'});
  assert.equal(unknown.status,200,'Resend must not disclose whether an email exists');
  assert.equal(deliveries.length,3);
  const verificationUrl=new URL(deliveries[2].textContent.split('\n').find(line=>line.startsWith('https://'))!);
  const token=verificationUrl.searchParams.get('token')!;
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  assert.equal(claims.exp-claims.iat,900);
  const verified=await auth.handler(new Request(verificationUrl,{headers:{host:verificationUrl.host}}));
  assert.equal(verified.status,302);
  assert.equal(verified.headers.get('location'),production+'/verify-email?verified=1');
  assert.ok(!verified.headers.get('set-cookie')?.includes('session_token'),'Verification still requires manual password sign-in');
  assert.equal((await db.query<{emailVerified:boolean}>('SELECT "emailVerified" FROM "user"')).rows[0].emailVerified,true);
  assert.equal((await call('send-verification-email',{email,callbackURL:'/'})).status,429,'Repeated resend requests are rate limited');
  // Simulate the request window passing in this isolated database.
  await db.query('UPDATE "rateLimit" SET "lastRequest"=0');
  assert.equal((await call('send-verification-email',{email,callbackURL:'/'})).status,200);
  assert.equal(deliveries.length,3,'Already verified users are not emailed again');
  const accounts=await db.query<{password:string;providerId:string}>('SELECT password,"providerId" FROM account');
  assert.equal(accounts.rows[0].providerId,'credential');
  assert.notEqual(accounts.rows[0].password,password);
  assert.equal((await call('sign-in/email',{email,password:'Incorrect-password-123!'})).status,401);
  const signin=await call('sign-in/email',{email,password,callbackURL:'/'},'',preview);
  assert.equal(signin.status,200,await signin.clone().text());
  const result=await signin.json() as {url?:string};
  assert.ok(!result.url||result.url==='/'||result.url.startsWith(preview));
  const loginCookie=signin.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.ok(loginCookie.includes('session_token'));
  assert.match(signin.headers.get('set-cookie')||'',/HttpOnly/i);
  assert.match(signin.headers.get('set-cookie')||'',/Secure/i);
  assert.equal((await (await call('get-session',undefined,loginCookie,preview)).json() as {user:{email:string}}).user.email,email);
  assert.equal((await call('sign-out',{},loginCookie,preview)).status,200);
  assert.equal(await (await call('get-session',undefined,loginCookie,preview)).json(),null);
  const short=await call('sign-up/email',{email:'short@example.test',password:'short',name:'Short'});
  assert.ok(short.status>=400);
  const duplicate=await call('sign-up/email',{email,password,name:'Duplicate'});
  assert.equal(duplicate.status,200,'Verified-only signup returns a generic duplicate response');
  assert.ok(!duplicate.headers.get('set-cookie')?.includes('session_token'));
  assert.equal((await db.query('SELECT id FROM "user"')).rows.length,1,'Duplicate signup must not create another account');
  const cross=await auth.handler(new Request(production+'/api/auth/sign-in/email',{method:'POST',headers:{host:new URL(production).host,origin:'https://unrelated.vercel.app','content-type':'application/json'},body:JSON.stringify({email,password})}));
  assert.equal(cross.status,403);
  const unsafeResend=await call('send-verification-email',{email,callbackURL:'https://unrelated.vercel.app'});
  assert.equal(unsafeResend.status,403);
  const oauth=await call('sign-in/social',{provider:'google',callbackURL:'/'});
  assert.ok(oauth.status>=400,'No social sign-in provider is enabled');
 }finally{await db.close();}
});
