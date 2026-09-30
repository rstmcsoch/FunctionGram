import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {betterAuth} from 'better-auth';
import {twoFactor} from 'better-auth/plugins';
import {createOTP} from '@better-auth/utils/otp';
import {base32} from '@better-auth/utils/base32';
import type {Pool} from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {schemaStatements,socialUpgradeStatements,aspectUpgradeStatements,accountUpgradeStatements,adminUpgradeStatements,adminUsersUpgradeStatements} from '../lib/postgres-schema';
import {authConfiguration} from '../lib/auth-config';
import {accountSessionHooks} from '../lib/account-policy';
import {assertAdminTwoFactor} from '../lib/admin/session-policy';

const origin='http://localhost:3000';
test('Better Auth TOTP setup gates admin login, password alone yields no session, challenge restores access, and disable is rejected',async()=>{
 const db=new PGlite();
 try{
  for(const sql of [...schemaStatements,...socialUpgradeStatements,...aspectUpgradeStatements,...accountUpgradeStatements,...adminUpgradeStatements,...adminUsersUpgradeStatements])await db.exec(sql);
  const client={query:async(text:string,values?:unknown[])=>{const result=await db.query(text,values);return {...result,rowCount:result.affectedRows};},release(){}};
  const pool={connect:async()=>client,end:async()=>{},query:client.query} as unknown as Pool;
  const secret=randomBytes(32).toString('hex'),config=authConfiguration({BETTER_AUTH_URL:origin});
  const auth=betterAuth({...config,database:pool,secret,logger:{level:'error'},plugins:[twoFactor({issuer:'RSTMC',twoFactorCookieMaxAge:300,trustDeviceMaxAge:0})],databaseHooks:accountSessionHooks(pool),emailVerification:{...config.emailVerification,sendVerificationEmail:async()=>{}}});
  async function call(path:string,body?:unknown,cookie=''){
   return auth.handler(new Request(origin+'/api/auth/'+path,{method:body?'POST':'GET',headers:{host:'localhost:3000',origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
  }
  const email='phase9-admin@example.test',password='Example-password-123!';
  const signup=await call('sign-up/email',{email,password,name:'Phase Nine Admin'});
  assert.equal(signup.status,200,await signup.clone().text());
  await pool.query('UPDATE "user" SET "emailVerified"=true,role=\'admin\' WHERE email=$1',[email]);
  const firstSignin=await call('sign-in/email',{email,password,callbackURL:'/'});
  assert.equal(firstSignin.status,200,await firstSignin.clone().text());
  const firstCookies=firstSignin.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.ok(firstCookies.includes('session_token'),'A not-yet-enrolled admin can sign in only to complete setup.');
  const setupStatus=await pool.query('SELECT "twoFactorEnabled" FROM "user" WHERE email=$1',[email]);
  try{assertAdminTwoFactor(setupStatus.rows[0].twoFactorEnabled===true);assert.fail('Expected password-only admin session to be gated.');}catch(error){assert.equal((error as {status?:number}).status,428);}

  const enable=await call('two-factor/enable',{password,method:'totp',issuer:'RSTMC admin'},firstCookies);
  assert.equal(enable.status,200,await enable.clone().text());
  const enrollment=await enable.json() as {totpURI:string;backupCodes:string[]};
  assert.ok(enrollment.backupCodes.length>0);
  const setupUrl=new URL(enrollment.totpURI),setupSecret=setupUrl.searchParams.get('secret');assert.ok(setupSecret);
  const rawSecret=Buffer.from(base32.decode(setupSecret!)).toString('utf8');
  const setupCode=await createOTP(rawSecret).totp();
  const enabled=await call('two-factor/verify-totp',{code:setupCode},firstCookies);
  assert.equal(enabled.status,200,await enabled.clone().text());
  const sessionCookies=(current:string,response:Response)=>{
   const jar=new Map(current.split('; ').filter(Boolean).map(value=>{const i=value.indexOf('=');return [value.slice(0,i),value.slice(i+1)] as const;}));
   for(const item of response.headers.getSetCookie()){const cookie=item.split(';')[0],i=cookie.indexOf('='),name=cookie.slice(0,i),value=cookie.slice(i+1);if(/Max-Age=0/i.test(item)||!value)jar.delete(name);else jar.set(name,value);}
   return [...jar].map(([name,value])=>`${name}=${value}`).join('; ');
  };
  const enabledCookies=sessionCookies(firstCookies,enabled);
  const secured=await pool.query('SELECT "twoFactorEnabled" FROM "user" WHERE email=$1',[email]);
  assert.equal(secured.rows[0].twoFactorEnabled,true);assert.doesNotThrow(()=>assertAdminTwoFactor(true));
  assert.equal((await (await call('get-session',undefined,enabledCookies)).json() as {user:{email:string}}).user.email,email);

  await call('sign-out',{},enabledCookies);
  const challenge=await call('sign-in/email',{email,password,callbackURL:'/'});
  assert.equal(challenge.status,200,await challenge.clone().text());
  assert.equal((await challenge.json() as {twoFactorRedirect?:boolean}).twoFactorRedirect,true,'A correct password alone must produce only a pending 2FA challenge.');
  const challengeCookies=challenge.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.ok(challengeCookies.includes('two_factor'));
  assert.equal(await (await call('get-session',undefined,challengeCookies)).json(),null,'The challenge cookie is not an authenticated session.');
  const loginCode=await createOTP(rawSecret).totp();
  const verified=await call('two-factor/verify-totp',{code:loginCode},challengeCookies);
  assert.equal(verified.status,200,await verified.clone().text());
  const finalCookies=sessionCookies(challengeCookies,verified);
  assert.equal((await (await call('get-session',undefined,finalCookies)).json() as {user:{email:string}}).user.email,email);
  const disable=await call('two-factor/disable',{password},finalCookies);
  assert.equal(disable.status,403,'Administrator 2FA cannot be disabled through Better Auth.');
  assert.equal((await pool.query('SELECT "twoFactorEnabled" FROM "user" WHERE email=$1',[email])).rows[0].twoFactorEnabled,true);
 }finally{await db.close();}
});
