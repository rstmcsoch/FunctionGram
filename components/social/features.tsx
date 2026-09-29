'use client';
import {createContext,useContext} from 'react';
import {ALL_FEATURES,type Feature,type Flags} from '@/lib/features';
export const FeatureContext=createContext<Flags>(ALL_FEATURES);
export const useFeatures=()=>useContext(FeatureContext);
export function Feature({name,children}:{name:Feature;children?:React.ReactNode}){return useFeatures()[name]?children:null;}
