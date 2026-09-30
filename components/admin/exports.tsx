'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';

type Resource = 'users'|'posts'|'reports'|'audit';
export function ExportManager(){
 const [resource,setResource]=useState<Resource>('users'),[format,setFormat]=useState<'csv'|'json'>('csv'),[q,setQ]=useState(''),[status,setStatus]=useState('all'),[role,setRole]=useState('all'),[kind,setKind]=useState(''),[action,setAction]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const run=async()=>{
  setBusy(true);setMessage('');
  const filters:Record<string,unknown>={};if(q.trim())filters.q=q.trim();
  if(resource==='users'){filters.status=status;filters.role=role;}
  if(resource==='posts'){filters.status=status;if(kind)filters.kind=kind;}
  if(resource==='reports')filters.status=status;
  if(resource==='audit'&&action.trim())filters.action=action.trim();
  try{
   const response=await fetch('/api/admin/exports',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({resource,format,filters})});
   if(!response.ok){const body=await response.json() as {error?:string};throw new Error(body.error||'Export failed.');}
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`functiongram-${resource}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   const matched=response.headers.get('X-Export-Matched-Rows')||'0',truncated=response.headers.get('X-Export-Truncated')==='true';
   setMessage(`Export started · ${matched} matching rows · capped at 1,000${truncated?' (truncated)':''}. The request was audited.`);
  }catch(error){setMessage(error instanceof Error?error.message:'Export failed.');}
  finally{setBusy(false);}
 };
 return <section className="admin-card export-manager"><span className="admin-icon-tile" aria-hidden="true"><Download /></span><h2>List export</h2><p>Exports are streamed from the server, capped at 1,000 rows, formula-neutralized for CSV, and audited. Choose only the data you need; user exports include email addresses and audit exports include client metadata.</p>
  <div className="admin-detail"><label>List<select value={resource} onChange={event=>{setResource(event.target.value as Resource);setStatus('all');}}><option value="users">Users</option><option value="posts">Posts</option><option value="reports">Reports</option><option value="audit">Audit</option></select></label><label>Format<select value={format} onChange={event=>setFormat(event.target.value as 'csv'|'json')}><option value="csv">CSV</option><option value="json">JSON</option></select></label>
  <label>Search{resource==='audit'?' (action, actor, target, reason)':' text'}<input maxLength={160} value={q} onChange={event=>setQ(event.target.value)}/></label>
  {resource==='users'&&<><label>User status<select value={status} onChange={event=>setStatus(event.target.value)}>{['all','active','banned','verified','unverified','deleted','demo','real'].map(item=><option key={item}>{item}</option>)}</select></label><label>Role<select value={role} onChange={event=>setRole(event.target.value)}>{['all','user','moderator','admin','owner'].map(item=><option key={item}>{item}</option>)}</select></label></>}
  {resource==='posts'&&<><label>Content state<select value={status} onChange={event=>setStatus(event.target.value)}>{['all','visible','hidden','trash','pinned'].map(item=><option key={item}>{item}</option>)}</select></label><label>Kind<select value={kind} onChange={event=>setKind(event.target.value)}><option value="">All</option><option value="post">Post</option><option value="reel">Reel</option><option value="story">Story</option></select></label></>}
  {resource==='reports'&&<label>Report status<select value={status} onChange={event=>setStatus(event.target.value)}>{['all','new','triage','actioned','dismissed'].map(item=><option key={item}>{item}</option>)}</select></label>}
  {resource==='audit'&&<label>Action filter<input maxLength={160} value={action} onChange={event=>setAction(event.target.value)}/></label>}
  </div><button className="admin-button admin-primary" type="button" disabled={busy} onClick={()=>void run()}>{busy?'Preparing export…':`Export ${resource} as ${format.toUpperCase()}`}</button>{message&&<p role="status">{message}</p>}
 </section>;
}
