import { AdminError } from './validation';

export const ADMIN_SESSION_TTL_MS=12*60*60*1000;
export function adminSessionIsFresh(createdAt:number,now=Date.now()){
 const age=now-createdAt;
 return Number.isFinite(age)&&age>=-60_000&&age<=ADMIN_SESSION_TTL_MS;
}
export function assertAdminSessionFresh(createdAt:number){
 if(!adminSessionIsFresh(createdAt))throw new AdminError('Administrator session expired. Sign in again to continue.',401);
}
export function assertAdminTwoFactor(enabled:boolean){
 if(!enabled)throw new AdminError('Set up two-factor authentication before using administrator tools.',428);
}

 // Two-factor belongs to the control room. A demoted account must sign in with
 // a password only; the factor is set up again if the role is granted later.
 export async function releaseAuthorityTwoFactor(db: QueryExecutor, userId: string) {
  await db.query('UPDATE "user" SET "twoFactorEnabled"=false,"updatedAt"=now() WHERE id=$1', [userId]);
  await db.query('DELETE FROM "twoFactor" WHERE "userId"=$1', [userId]);
 }
