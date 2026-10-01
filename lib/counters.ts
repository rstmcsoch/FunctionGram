import type {FeatureConfig} from './features';

/**
 * Counter display expressions are SQLite/libSQL compatible. Jitter is a
 * deterministic lightweight perturbation derived from the source id.
 */
export function counterSql(real:string,base:string,metric:string,c:FeatureConfig['counters'],alias='p'){
  if(c.hide)return 'NULL';
  const jitter=c.jitter
    ? `(abs(length(\${alias}.id || ':\${metric}') * 1103515245) % ${2*c.jitter+1} - ${c.jitter})`
    : '0';
  return `CAST(MIN(1000000000000,MAX(0,(\${real}+\${alias}.\${base})*\${c.multiplier}+\${jitter})) AS INTEGER)`;
}

export function displayCounterColumns(c:FeatureConfig['counters'],alias='p'){
  return [
    counterSql(`SELECT COUNT(*) FROM reactions WHERE post_id=\${alias}.id AND kind='like'`,'base_likes','likes',c,alias)+' AS display_likes',
    counterSql(`SELECT COUNT(*) FROM comments c JOIN profiles ca ON ca.id=c.author_id WHERE c.post_id=\${alias}.id AND c.hidden_at IS NULL AND c.deleted_at IS NULL AND ca.deleted_at IS NULL`,'base_comments','comments',c,alias)+' AS display_comments',
    counterSql(`SELECT COUNT(*) FROM reactions WHERE post_id=\${alias}.id AND kind='seen'`,'base_views','views',c,alias)+' AS display_views',
  ].join(',');
}
