import type {FeatureConfig} from './features';
/** Constants originate from the validated registry; expressions/alias are source-code only. */
export function counterSql(real:string,base:string,metric:string,c:FeatureConfig['counters'],alias='p'){
 if(c.hide)return 'NULL::bigint';
 const jitter=c.jitter?`(abs(hashtext(${alias}.id||':${metric}')::bigint)%${2*c.jitter+1}-${c.jitter})`:'0';
 return `LEAST(1000000000000,GREATEST(0,FLOOR(((${real})+${alias}.${base})*${c.multiplier}+${jitter})))::bigint`;
}
export function displayCounterColumns(c:FeatureConfig['counters'],alias='p'){
 return [counterSql(`SELECT COUNT(*) FROM reactions WHERE post_id=${alias}.id AND kind='like'`,'base_likes','likes',c,alias)+' AS display_likes',counterSql(`SELECT COUNT(*) FROM comments c JOIN profiles ca ON ca.id=c.author_id WHERE c.post_id=${alias}.id AND c.hidden_at IS NULL AND c.deleted_at IS NULL AND ca.deleted_at IS NULL`,'base_comments','comments',c,alias)+' AS display_comments',counterSql(`SELECT COUNT(*) FROM reactions WHERE post_id=${alias}.id AND kind='seen'`,'base_views','views',c,alias)+' AS display_views'].join(',');
}
