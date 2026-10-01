import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {requireAdminSetupPage} from '@/lib/admin/guard';
import {AdminTwoFactorSetup} from '@/components/admin/two-factor-setup';
import {ADMIN_BASE_PATH} from '@/lib/admin/config';
import '../../admin-panel/admin.css';

export const metadata:Metadata={title:'Secure administrator account · RSTMC',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function AdminTwoFactorSetupPage(){
 const {actor,twoFactorEnabled}=await requireAdminSetupPage();
 if(twoFactorEnabled)redirect(ADMIN_BASE_PATH);
 return <div className="admin-shell admin-two-factor-shell"><AdminTwoFactorSetup email={actor.email}/></div>;
}
