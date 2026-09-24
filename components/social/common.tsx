"use client";
import {upload as uploadToBlob} from '@vercel/blob/client';
import { useState,type ReactNode } from 'react';
import { ArrowLeft,Camera,LoaderCircle } from 'lucide-react';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import type {Person} from '@/lib/types';

export function Avatar({person,size=42,ring=false,onClick}:{person:Partial<Person>|null;size?:number;ring?:boolean;onClick?:()=>void}){
  const [broken,setBroken]=useState(false);const content=<span className={'avatar '+(ring?'avatar-ring':'')} style={{width:size,height:size}}>{person?.avatar&&!broken?<img src={person.avatar} alt="" width={size} height={size} onError={()=>setBroken(true)}/>:<span className="avatar-initial">{(person?.name||'R').slice(0,1).toUpperCase()}</span>}</span>;
  return onClick?<button aria-label={'Open '+(person?.username||'your profile')} onClick={onClick} className="avatar-button">{content}</button>:content;
}
export function IconButton({children,label,onClick,active,disabled,className=''}:{children:ReactNode;label:string;onClick?:()=>void;active?:boolean;disabled?:boolean;className?:string}){return <button type="button" className={'icon-button '+(active?'is-active ':'')+className} aria-label={label} aria-pressed={active} title={label} onClick={onClick} disabled={disabled}>{children}</button>;}
export function Modal({open,onClose,title,description,children,className=''}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode;className?:string}){return <Dialog open={open} onOpenChange={v=>!v&&onClose()}><DialogContent className={'social-modal '+className}><div className="modal-heading"><DialogTitle>{title}</DialogTitle><DialogDescription className={description?'':'sr-only'}>{description||title}</DialogDescription></div>{children}</DialogContent></Dialog>;}
export function Empty({icon,heading,body,action}:{icon?:ReactNode;heading:string;body:string;action?:ReactNode}){return <div className="empty-state"><div className="empty-icon">{icon||<Camera/>}</div><h2>{heading}</h2><p>{body}</p>{action}</div>;}
export function Busy(){return <LoaderCircle className="spin" size={20} aria-label="Loading"/>;}
export function BackHeading({title,onBack}:{title:string;onBack:()=>void}){return <div className="view-heading"><IconButton label="Go back" onClick={onBack}><ArrowLeft/></IconButton><h1>{title}</h1></div>;}
export function timeAgo(time:number){const mins=Math.max(0,Math.floor((Date.now()-time)/60000));return mins<1?'just now':mins<60?mins+'m':mins<1440?Math.floor(mins/60)+'h':Math.floor(mins/1440)+'d';}
export function count(n:number){return new Intl.NumberFormat('en',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n);}
export async function request<T=unknown>(url:string,body?:unknown):Promise<T>{const isForm=typeof FormData!=='undefined'&&body instanceof FormData;const response=await fetch(url,{method:body?'POST':'GET',headers:body&&!isForm?{'Content-Type':'application/json'}:undefined,body:body?(isForm?body as FormData:JSON.stringify(body)):undefined,cache:'no-store'});let data;try{data=await response.json();}catch{throw new Error('Unable to connect. Please try again.');}if(!response.ok)throw new Error((data as {error?:string}).error||'Your change could not be saved. Please try again.');return data as T;}
// Local preview flag: bundled as a constant per environment. Production builds
// never define it, so the Vercel Blob upload path is the only one that ships.
export const devMode=process.env.NEXT_PUBLIC_DEV_MODE==='1';
export type UploadResult={url:string;type:string;aspect:number|null};
async function imageSize(file:File):Promise<number|null>{try{const bitmap=await createImageBitmap(file);const ratio=bitmap.width/bitmap.height;bitmap.close();return ratio>0&&Number.isFinite(ratio)?ratio:null;}catch{return null;}}
async function videoSize(file:File):Promise<number|null>{return new Promise(resolve=>{const url=URL.createObjectURL(file);const video=document.createElement('video');video.preload='metadata';video.muted=true;video.onloadedmetadata=()=>{URL.revokeObjectURL(url);const ratio=video.videoWidth/video.videoHeight;resolve(ratio>0&&Number.isFinite(ratio)?ratio:null);};video.onerror=()=>{URL.revokeObjectURL(url);resolve(null);};video.src=url;});}
export async function upload(file:File):Promise<UploadResult>{
  let output=file;let aspect:number|null=null;
  if(file.type.startsWith('image/')&&file.type!=='image/gif'){
    const bitmap=await createImageBitmap(file);aspect=bitmap.width/bitmap.height||null;
    const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d');if(!context)throw new Error('Your browser could not process this photo.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not process photo.')),'image/jpeg',.88));output=new File([blob],'photo.jpg',{type:'image/jpeg'});
  }else if(file.type.startsWith('image/'))aspect=await imageSize(file);
  else if(file.type.startsWith('video/'))aspect=await videoSize(file);
  if(output.size>20*1024*1024)throw new Error('Choose a file smaller than 20 MB.');
  if(devMode){
    const form=new FormData();form.append('key',crypto.randomUUID());form.append('file',output);
    const result=await request<{url:string;type:string}>('/api/dev-upload',form);
    return {...result,aspect};
  }
  const key=crypto.randomUUID();
  await uploadToBlob(key,output,{access:'public',handleUploadUrl:'/api/upload',contentType:output.type,clientPayload:JSON.stringify({size:output.size,type:output.type})});
  const completed=await request<{url:string;type:string}>('/api/upload/complete',{key});
  return {...completed,aspect};
}
