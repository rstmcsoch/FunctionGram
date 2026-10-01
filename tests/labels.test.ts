import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {readdirSync,readFileSync} from 'node:fs';
import {LABEL_DEFAULTS,MAX_LABEL_BYTES,MAX_LABEL_IMPORT_BYTES,parseLabelsImport,validateLabels,labelsFromSettings,createTranslator,navigationLabel,type LabelKey} from '../lib/admin/labels';
import {validateSetting} from '../lib/admin/validation';
import {LabelsProvider} from '../components/social/labels';
import {Reels} from '../components/social/reels';
import {Busy} from '../components/social/common';
import type {PostActions} from '../components/social/post-card';
test('labels default exactly to registry text, overrides are isolated and imports roundtrip',()=>{
 const t=createTranslator();for(const key of Object.keys(LABEL_DEFAULTS) as LabelKey[])assert.equal(t(key),LABEL_DEFAULTS[key]);
 const overrides=validateLabels({'nav.reels':'Short films','state.loading':'Working'});const a=createTranslator(overrides),b=createTranslator();
 assert.equal(a('nav.reels'),'Short films');assert.equal(b('nav.reels'),'Reels');assert.equal(a('state.loading'),'Working');
 assert.deepEqual(validateLabels({...LABEL_DEFAULTS,...overrides}),overrides);
 assert.deepEqual(labelsFromSettings({'labels.config':JSON.stringify(overrides)}),overrides);
 assert.equal(validateSetting('labels.config',JSON.stringify(overrides)),JSON.stringify(overrides));
 assert.deepEqual(validateLabels({}),{});assert.deepEqual(labelsFromSettings({'labels.config':'bad json'}),{});
});
test('label validation rejects unknown keys, nontext, control characters, oversize and missing placeholders',()=>{
 for(const input of [null,[],{'unknown.key':'Hi'},{'nav.reels':null},{'nav.reels':true},{'nav.reels':''},{'nav.reels':'  '},{'nav.reels':'x'.repeat(2001)},{'nav.reels':'a\u0000b'},{'metadata.title':'No site token'},JSON.parse('{"__proto__":"bad"}')])assert.throws(()=>validateLabels(input));
 assert.deepEqual(validateLabels({'metadata.title':'Welcome to {site}'}),{'metadata.title':'Welcome to {site}'});
 assert.throws(()=>validateLabels(Object.fromEntries(Object.entries(LABEL_DEFAULTS).filter(([,text])=>!text.includes('{')).map(([key])=>[key,'é'.repeat(2000)]))));
 assert.equal(createTranslator({'metadata.title':'Welcome to {site}'})('metadata.title',{site:'{site}'}),'Welcome to {site}');
});
test('explicit nav labels override appearance, resetting restores it; Reels rename reaches default copy',()=>{
 const t=createTranslator({'nav.reels':'Clips'});
 assert.equal(navigationLabel(t,'reels','Custom menu label'),'Clips');assert.equal(navigationLabel(t,'/#/reels','Custom label'),'Clips');
 assert.equal(navigationLabel(createTranslator(),'reels','Custom label'),'Custom label');
 assert.match(t('reels.share_a_short_video_and_start_the_reel_collection'),/Clips/);
 assert.equal(createTranslator({'nav.reels':'Clips','reels.share_a_short_video_and_start_the_reel_collection':'My custom empty state'})('reels.share_a_short_video_and_start_the_reel_collection'),'My custom empty state');
 assert.equal(t('metadata.sectionTitle',{section:t('nav.reels'),site:'Community'}),'Clips — Community');
});
test('SSR receives the same translator as hydration and escapes markup as plain text',()=>{
 const render=(labels:Parameters<typeof createTranslator>[0])=>renderToStaticMarkup(React.createElement(LabelsProvider,{labels:labels||{}},React.createElement(React.Fragment,null,React.createElement(Busy),React.createElement(Reels,{posts:[],actions:{} as PostActions,onCreate:()=>{}}))));
 assert.match(render({}),/Loading/);const html=render({'nav.reels':'Clips','state.loading':'<img src=x onerror=alert(1)>'});
 assert.match(html,/Clips/);assert.match(html,/&lt;img/);assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('aria-label="Loading"'));
});
test('migrated public surfaces contain no literal JSX copy, static text props or label templates',()=>{
 const paths=[...readdirSync('components/social').filter(n=>n.endsWith('.tsx')).map(n=>'components/social/'+n),'app/page.tsx','app/social-home.tsx','app/[username]/page.tsx','app/not-found.tsx','app/verify-email/page.tsx','app/reset-password/page.tsx','app/unauthorized.tsx','app/forbidden.tsx'];
 const problems:string[]=[];
 for(const file of paths){const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node:ts.Node){const at=file+':'+(source.getLineAndCharacterOfPosition(node.getStart(source)).line+1);
   if(ts.isJsxText(node)&&node.text.trim())problems.push(at+' literal JSX text');
   if(ts.isJsxAttribute(node)&&['title','label','aria-label','heading','body','placeholder','description','initialNotice'].includes(node.name.getText(source))&&node.initializer&&ts.isStringLiteral(node.initializer)&&node.initializer.text.trim())problems.push(at+' static text prop');
   if(ts.isTemplateExpression(node)&&node.parent&&ts.isJsxExpression(node.parent)&&node.getText(source).match(/[a-zA-Z]+ /))problems.push(at+' literal label template');
   ts.forEachChild(node,visit);
  }visit(source);
 }
 assert.deepEqual(problems,[]);
});

 test('full JSON backups near the overrides limit can be reimported without relaxing stored limits',()=>{
 const overrides: Record<string,string>={};
 for(const [key,text] of Object.entries(LABEL_DEFAULTS)){
  if(text.includes('{'))continue;
  const next={...overrides,[key]:'é'.repeat(900)};
  if(Buffer.byteLength(JSON.stringify(next))>MAX_LABEL_BYTES)break;
  overrides[key]=next[key];
 }
 const backup=JSON.stringify({...LABEL_DEFAULTS,...overrides},null,2);
 assert.ok(Buffer.byteLength(backup)>MAX_LABEL_BYTES);
 assert.ok(Buffer.byteLength(backup)<=MAX_LABEL_IMPORT_BYTES);
 assert.deepEqual(parseLabelsImport(backup),overrides);
 assert.throws(()=>parseLabelsImport(' '.repeat(MAX_LABEL_IMPORT_BYTES+1)));
 assert.throws(()=>parseLabelsImport(JSON.stringify(Object.fromEntries(Object.keys(overrides).map(key=>[key,'é'.repeat(1000)])))));
 });
