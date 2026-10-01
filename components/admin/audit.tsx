'use client';
import { ADMIN_BASE_PATH } from '@/lib/admin/config';
import {useState} from 'react';
import { Download } from 'lucide-react';
import type {AuditFilters,AuditRow} from '@/lib/admin/audit';
import { Avatar } from './avatar';
import { Badge, auditTone } from './badge';

export function AuditTools({filters}:{filters:AuditFilters}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <><form className="admin-search" action={ADMIN_BASE_PATH+'/audit'}>
  <label>Search<input name="q" maxLength={160} defaultValue={filters.q} placeholder="Action, actor, target, reason"/></label>
  <label>Action<input name="action" maxLength={160} defaultValue={filters.action}/></label>
  <label>Actor email or ID<input name="actor" maxLength={160} defaultValue={filters.actor}/></label>
  <label>Target type<input name="targetType" maxLength={160} defaultValue={filters.targetType}/></label>
  <label>Target ID<input name="targetId" maxLength={160} defaultValue={filters.targetId}/></label>
  <label>From (UTC)<input type="date" name="from" defaultValue={filters.from}/></label>
  <label>Through (UTC)<input type="date" name="to" defaultValue={filters.to}/></label>
  <div className="admin-filter-actions"><button className="admin-button admin-primary">Apply filters</button><a className="admin-button" data-tone="ghost" href={ADMIN_BASE_PATH+'/audit'}>Clear</a></div>
 </form><button className="admin-button admin-audit-export" disabled={busy} onClick={async()=>{
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/admin/audit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'export',filters})});
   if(!response.ok)throw new Error((await response.json() as {error?:string}).error||'Audit export failed.');
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='admin-audit.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(cause){setError(cause instanceof Error?cause.message:'Audit export failed.');}
  finally{setBusy(false);}
 }}><Download aria-hidden="true" size={16} strokeWidth={1.75}/>{busy?'Exporting…':'Export matching audit rows (CSV, max 5,000)'}</button>{error&&<p role="alert">{error}</p>}</>;
}

function pretty(value:string|null){if(!value)return '—';try{return JSON.stringify(JSON.parse(value),null,2);}catch{return value;}}
export function AuditTable({rows}:{rows:AuditRow[]}){
 return <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Read-only administrator audit log"><table className="admin-table--wide"><caption>Newest first · read-only historical records</caption><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Target</th><th>Reason</th><th>Before / after</th><th>Network / client</th></tr></thead><tbody>
  {rows.map(row=><tr key={row.id}><td className="admin-cell-time">{new Date(Number(row.created_at)).toISOString()}</td><td className="actor-cell"><div className="admin-actor-cell"><Avatar name={row.actor_email} email={row.actor_email} seed={String(row.actor_id||row.actor_email)} size={28} /><div className="admin-actor-info"><span className="admin-actor-name">{row.actor_email}</span><small className="admin-actor-email">{row.actor_id}</small></div></div></td><td className="action-cell"><Badge tone={auditTone(row.action)} className="admin-badge-mono">{row.action}</Badge></td><td className="target-cell">{row.target_type||'—'}<small><code>{row.target_id||'—'}</code></small></td><td className="reason-cell">{row.reason||'—'}</td><td className="snapshot-cell"><details><summary>View snapshot</summary><strong>Before</strong><pre>{pretty(row.before)}</pre><strong>After</strong><pre>{pretty(row.after)}</pre></details></td><td className="network-cell">{row.ip||'Not recorded'}<small>{row.user_agent||'Not recorded'}</small></td></tr>)}
  {!rows.length&&<tr><td colSpan={7}>No historical audit rows match these filters.</td></tr>}
 </tbody></table></div>;
}
