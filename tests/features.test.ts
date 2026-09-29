import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DEFAULT_FEATURES,FEATURE_KEYS,resolveFeatures,rolloutBucket,validateFeatures} from '../lib/features';
import {validateSetting} from '../lib/admin/validation';
import {requirePublic,requireFeature} from '../lib/feature-policy';
import {FeatureContext,Feature} from '../components/social/features';
import {counterSql} from '../lib/counters';
test('all feature defaults are on; rollouts have stable buckets and strict 0/100 boundaries',()=>{
 const c=structuredClone(DEFAULT_FEATURES);
 assert.ok(Object.values(resolveFeatures(c,null)).every(Boolean));
 for(const key of FEATURE_KEYS){c.flags[key].percent=0;assert.equal(resolveFeatures(c,'account')[key],false);c.flags[key].percent=100;assert.equal(resolveFeatures(c,'account')[key],true);c.flags[key].enabled=false;assert.equal(resolveFeatures(c,'account')[key],false);}
 assert.equal(rolloutBucket('reels','account'),rolloutBucket('reels','account'));
 const buckets=new Set(Array.from({length:1000},(_,i)=>rolloutBucket('reels','user'+i)));assert.ok(buckets.size>90);
});
test('feature configuration rejects invalid limits and strips unknown fields',()=>{
 const c=structuredClone(DEFAULT_FEATURES);
 for(const percent of [-1,101,1.5,NaN]){c.flags.likes.percent=percent;assert.throws(()=>validateFeatures(c));}
 c.flags.likes.percent=100;
 for(const multiplier of [-1,101,Infinity]){c.counters.multiplier=multiplier;assert.throws(()=>validateFeatures(c));}
 c.counters.multiplier=1;c.counters.jitter=1001;assert.throws(()=>validateFeatures(c));c.counters.jitter=0;
 assert.deepEqual(validateFeatures({...c,secret:'not persisted'}),c);
 assert.equal(validateSetting('features.config',JSON.stringify(c)),JSON.stringify(c));
 assert.throws(()=>validateSetting('features.config','{}'));
});
test('maintenance bypass is explicit and never bypasses a disabled feature; guest browsing requires login',()=>{
 const config=structuredClone(DEFAULT_FEATURES);config.maintenance.enabled=true;const policy={config,flags:resolveFeatures(config,null),admin:false};
 assert.throws(()=>requirePublic(policy,null),{status:503});assert.throws(()=>requirePublic(policy,'regular'),{status:503});
 policy.admin=true;assert.doesNotThrow(()=>requirePublic(policy,'verified-admin'));policy.flags.likes=false;assert.throws(()=>requireFeature(policy,'likes'),{status:403});
 config.maintenance.enabled=false;policy.flags.guestBrowsing=false;assert.throws(()=>requirePublic(policy,null),{status:401});assert.doesNotThrow(()=>requirePublic(policy,'regular'));
});
test('feature wrappers omit disabled controls from SSR rather than merely hiding them with CSS',()=>{
 const flags=resolveFeatures(DEFAULT_FEATURES,null);flags.likes=false;
 const html=renderToStaticMarkup(React.createElement(FeatureContext,{value:flags},React.createElement(Feature,{name:'likes'},React.createElement('button',null,'Like'))));
 assert.equal(html,'');
 assert.equal(counterSql('0','base_likes','likes',{multiplier:1,jitter:0,hide:true}),'NULL::bigint');
 assert.match(counterSql('0','base_likes','likes',{multiplier:2,jitter:10,hide:false}),/hashtext/);
});
