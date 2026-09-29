'use client';
import {createContext,useContext,useMemo} from 'react';
import {createTranslator,defaultTranslator,type LabelOverrides} from '@/lib/admin/labels';
const LabelsContext=createContext(defaultTranslator);
export function LabelsProvider({labels,children}:{labels:LabelOverrides;children?:React.ReactNode}) {
 const t=useMemo(()=>createTranslator(labels),[labels]);
 return <LabelsContext value={t}>{children}</LabelsContext>;
}
export const useLabels=()=>useContext(LabelsContext);
