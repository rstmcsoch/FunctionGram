import {AdminError} from './admin/validation';
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
export function localAssetPath(key:string,url:string){
 if(!new RegExp('^'+uuid+'$').test(key))throw new AdminError('Invalid media key.');
 if(url==='local')return '.local/uploads/'+key;
 if(url==='local-source:'+key)return '.local/upload-staging/'+key;
 if(new RegExp('^local-processed:'+key+'-[0-9]{10,16}$').test(url))return '.local/uploads/'+url.slice(16);
 throw new AdminError('Invalid local media location.');
}
