"use client";
import {useEffect,useRef,useState,type CSSProperties,type TouchEvent} from 'react';
import {ChevronLeft,ChevronRight,ImageOff,Maximize2,Pause,Play,Volume2,VolumeX,Film} from 'lucide-react';
import {Busy,IconButton} from './common';
import type {Post} from '@/lib/types';

type VideoProps={src:string;label:string;autoPlay?:boolean;active?:boolean;className?:string};
export function VideoPlayer({src,label,autoPlay=false,active=true,className=''}:VideoProps){
  const frame=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null);
  const [near,setNear]=useState(false),[visible,setVisible]=useState(false),[playing,setPlaying]=useState(false),[muted,setMuted]=useState(true),[loading,setLoading]=useState(true),[error,setError]=useState(false),[duration,setDuration]=useState(0),[time,setTime]=useState(0);
  useEffect(()=>{const node=frame.current;if(!node)return;const preload=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){setNear(true);preload.disconnect();}},{rootMargin:'220px 0px'});const playback=new IntersectionObserver(entries=>setVisible(entries[0].intersectionRatio>=.45),{threshold:[0,.45]});preload.observe(node);playback.observe(node);return()=>{preload.disconnect();playback.disconnect();};},[]);
  useEffect(()=>{const el=video.current;if(!el)return;const sync=()=>{if(!active||!visible||document.visibilityState==='hidden')el.pause();else if(autoPlay&&near)void el.play().catch(()=>setPlaying(false));};sync();document.addEventListener('visibilitychange',sync);return()=>{document.removeEventListener('visibilitychange',sync);el.pause();};},[active,autoPlay,near,visible,src]);
  const toggle=()=>{const el=video.current;if(!el)return;if(el.paused){setNear(true);void el.play().catch(()=>setPlaying(false));}else el.pause();};
  const fullscreen=()=>{const el=video.current as (HTMLVideoElement & {webkitEnterFullscreen?:()=>void})|null;if(!el)return;if(el.requestFullscreen)void el.requestFullscreen().catch(()=>{});else el.webkitEnterFullscreen?.();};
  return <div ref={frame} className={'video-player '+className}>
    {near&&<video ref={video} src={src} aria-label={label} playsInline muted={muted} loop={autoPlay} preload="metadata" onLoadedMetadata={e=>{setDuration(e.currentTarget.duration);setLoading(false);}} onCanPlay={()=>setLoading(false)} onWaiting={()=>setLoading(true)} onPlaying={()=>{setPlaying(true);setLoading(false);}} onPause={()=>setPlaying(false)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onError={()=>{setLoading(false);setError(true);}} onClick={toggle}/>}
    {!near&&<div className="video-placeholder"><Film size={32}/><span>Video</span></div>}
    {loading&&near&&!error&&<span className="video-loading"><Busy/></span>}
    {error?<div className="video-error" role="alert">Couldn’t load this video.<button onClick={()=>{setError(false);setLoading(true);video.current?.load();}}>Retry</button></div>:<>
      {!playing&&near&&!loading&&<button className="video-play" type="button" aria-label="Play video" onClick={toggle}><Play size={32} fill="currentColor"/></button>}
      <div className="video-controls" onClick={e=>e.stopPropagation()}><IconButton label={playing?'Pause video':'Play video'} onClick={toggle}>{playing?<Pause size={18}/>:<Play size={18}/>}</IconButton><span className="video-time">{formatTime(time)} / {formatTime(duration)}</span><IconButton label={muted?'Unmute video':'Mute video'} onClick={()=>setMuted(v=>!v)}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</IconButton><IconButton label="Fullscreen video" onClick={fullscreen}><Maximize2 size={18}/></IconButton></div>
      <input className="video-progress" aria-label="Video progress" type="range" min={0} max={duration||1} step="0.1" value={time} onChange={e=>{if(video.current)video.current.currentTime=Number(e.target.value);}} style={{'--progress':`${duration?time/duration*100:0}%`} as CSSProperties}/>
    </>}
  </div>;
}
function formatTime(seconds:number){if(!Number.isFinite(seconds))return '0:00';return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;}

export function MediaCarousel({post,detail=false,onDoubleLike}:{post:Post;detail?:boolean;onDoubleLike?:()=>void}){
  const [index,setIndex]=useState(0),[failed,setFailed]=useState<number[]>([]);const touch=useRef<{x:number;y:number;time:number}|null>(null),lastTap=useRef(0);
  const total=post.media.length,option=post.media_options?.[index];
  const move=(direction:number)=>setIndex(i=>Math.min(total-1,Math.max(0,i+direction)));
  const endTouch=(event:TouchEvent)=>{if(!touch.current)return;const dx=event.changedTouches[0].clientX-touch.current.x,dy=event.changedTouches[0].clientY-touch.current.y;if(total>1&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25){move(dx<0?1:-1);lastTap.current=0;}else if(Math.abs(dx)<12&&Math.abs(dy)<12&&onDoubleLike){const now=Date.now();if(now-lastTap.current<320){onDoubleLike();lastTap.current=0;}else lastTap.current=now;}touch.current=null;};
  const ratio=option?.ratio==='original'||!option?.ratio?undefined:option.ratio.replace(':',' / ');
  return <div className={'media-carousel '+(detail?'is-detail':'')} role="group" aria-label={'Media by '+post.author.username} tabIndex={total>1?0:undefined} onKeyDown={e=>{if(total<2)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();move(e.key==='ArrowRight'?1:-1);}}} onTouchStart={e=>{touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY,time:Date.now()};}} onTouchEnd={endTouch} onDoubleClick={onDoubleLike}>
    <div className={'media-frame '+(ratio&&!detail?'is-framed ':'')+(post.media_type==='video'?'has-video':'')} style={ratio&&!detail?{'--media-ratio':ratio,'--media-fit':option?.fit||'contain'} as CSSProperties:undefined}>
      {post.media_type==='video'?<VideoPlayer src={post.media[0]} label={post.caption||'Video by '+post.author.username}/>:failed.includes(index)?<div className="media-failed"><ImageOff/><p>Photo unavailable</p></div>:<img key={post.media[index]} src={post.media[index]} alt={option?.alt||post.caption||'Photo by '+post.author.username} loading={detail?'eager':'lazy'} decoding="async" onError={()=>setFailed(f=>[...f,index])}/>}
    </div>
    {total>1&&<><span className="media-number" aria-live="polite">{index+1} / {total}</span><IconButton className="media-prev" label="Previous photo" disabled={index===0} onClick={()=>move(-1)}><ChevronLeft size={21}/></IconButton><IconButton className="media-next" label="Next photo" disabled={index===total-1} onClick={()=>move(1)}><ChevronRight size={21}/></IconButton><div className="media-dots" aria-label="Carousel pages">{post.media.map((_,i)=><button key={i} type="button" className={i===index?'active':''} aria-label={'Show photo '+(i+1)} aria-current={i===index?'true':undefined} onClick={()=>setIndex(i)}/>)}</div></>}
  </div>;
}
