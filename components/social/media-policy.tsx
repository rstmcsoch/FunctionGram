'use client';
import {createContext,useContext} from 'react';
import {DEFAULT_MEDIA,type MediaConfig} from '@/lib/media-config';
const MediaContext=createContext(DEFAULT_MEDIA);
export function MediaProvider({config,children}:{config:MediaConfig;children:React.ReactNode}){return <MediaContext value={config}>{children}</MediaContext>;}
export const useMediaPolicy=()=>useContext(MediaContext);
