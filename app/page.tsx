import {bootstrap} from '@/lib/server';
import RstmcApp from '@/components/social/app';
export const dynamic='force-dynamic';
export default async function Home(){try{return <RstmcApp initial={await bootstrap()}/>;}catch(error){console.error('Feed unavailable',error);return <RstmcApp initial={null}/>;}}
