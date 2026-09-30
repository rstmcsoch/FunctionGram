import type {Metadata} from 'next';
import {TwoFactorChallenge} from '@/components/admin/two-factor-challenge';
import '../rstmcadmin/admin.css';
export const metadata:Metadata={title:'Two-factor verification · RSTMC',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function TwoFactorPage(){return <div className="admin-shell admin-two-factor-shell"><TwoFactorChallenge/></div>;}
