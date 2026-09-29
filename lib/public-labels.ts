import 'server-only';
import {readSettings} from './admin/settings';
import {labelsFromSettings,createTranslator} from './admin/labels';
import {missingConfiguration} from './config';
export async function getLabels(){
 if(missingConfiguration().length)return {};
 try{return labelsFromSettings(await readSettings());}catch{return {};}
}
export async function getTranslator(){return createTranslator(await getLabels());}
