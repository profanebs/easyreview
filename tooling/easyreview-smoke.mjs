import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const bundle = resolve(process.argv[2]); const exe=process.env.EASYREVIEW_BUN||join(bundle,'bin/bun.exe'), cli=join(bundle,'src/scripts/easyreview-portable.ts');
mkdirSync('artifacts/tests',{recursive:true});
const root=mkdtempSync(resolve('artifacts/tests/compiled-')); const out=join(root,'审阅目录 含空格');
const run=(args)=>execFileSync(exe,[cli,...args],{encoding:'utf8',windowsHide:true,timeout:30000});
const results=[];
try {
  assert.match(run(['--version']),/1\.2/);
  for (const agent of ['codex','opencode','kiro','cursor','dsh']) {
    const md=join(root,`${agent} 方案.md`),text=`---\nschema: plan/v1\ntitle: ${agent} 冒烟测试\n---\n\n## T1: 验证\n【测试】不构成用户批准\n`;
    writeFileSync(md,text);
    const output=run(['render',md,'--out',out,'--agent',agent]);
    const html=join(out,basename(md,'.md')+'.review.html'); const page=readFileSync(html,'utf8');
    assert(page.includes(`window.__PN_AGENT__="${agent}"`)); assert(page.includes('window.__PN_DELIVERY__="local"')); assert(page.includes('Noto Serif SC Variable'));
    const registry=JSON.parse(readFileSync(join(out,'.easyreview-helper.json'),'utf8'));
    assert(output.includes('URL: '+registry.url));
    const info=await (await fetch(registry.url+'/health')).json(); assert.equal(info.root,out); assert.equal(info.delivery,'local');
    const docHash=createHash('sha256').update(text).digest('hex');
    const response=await fetch(registry.url+'/feedback',{method:'POST',headers:{'content-type':'application/json','x-easyreview-token':info.token},body:JSON.stringify({agent,artifact:html,source:md,docHash,text:'【测试】'+agent+' 本地回流',feedback:{taskStates:{T1:'approved'},annotations:[],note:'【测试】'}})});
    assert.equal(response.status,200); const receipt=await response.json(); assert.equal(receipt.saved,true); assert.equal(receipt.delivered,false);
    const record=JSON.parse(run(['feedback',html])); assert.equal(record.agent,agent); assert.equal(record.docHash,docHash); assert.equal(record.feedback.taskStates.T1,'approved');
    results.push({agent,rendered:true,archived:true,readBack:true,delivered:false});
  }
  const detect=(env)=>execFileSync(exe,[cli,'detect'],{encoding:'utf8',windowsHide:true,env:{...process.env,OPENCODE_SESSION_ID:'',CODEX_THREAD_ID:'',KIRO_SESSION_ID:'',EASYREVIEW_AGENT:'',...env}}).trim();
  assert.equal(detect({KIRO_SESSION_ID:'sess_x'}),'kiro'); assert.equal(detect({EASYREVIEW_AGENT:'dsh'}),'dsh'); assert.equal(detect({}),'manual');
  assert.equal(detect({OPENCODE_SESSION_ID:'ses_a',KIRO_SESSION_ID:'sess_x'}),'opencode');
  let dshErr=''; try{run(['install','--project',root,'--agent','dsh']);}catch(e){dshErr=String(e.stderr||e.message);} assert.match(dshErr,/dsh/);
  // Draft mirror round-trip (the renderer's overwrite guard reads this store).
  const live=JSON.parse(readFileSync(join(out,'.easyreview-helper.json'),'utf8'));
  const liveInfo=await (await fetch(live.url+'/health')).json();
  const draftUrl=live.url+'/draft', draftPage='D:/smoke/fake-page.md', auth={'content-type':'application/json','x-easyreview-token':liveInfo.token};
  assert.equal((await fetch(draftUrl,{method:'POST',headers:auth,body:JSON.stringify({pageId:draftPage,docHash:'a'.repeat(64),annotations:[{id:'x1',blockId:'b1'}],attachments:[]})})).status,200);
  const draftGet=await (await fetch(draftUrl+'?pageId='+encodeURIComponent(draftPage),{headers:auth})).json();
  assert.equal(draftGet.record.annotations.length,1);
  await fetch(draftUrl+'?pageId='+encodeURIComponent(draftPage),{method:'DELETE',headers:auth});
  assert.equal((await fetch(draftUrl+'?pageId='+encodeURIComponent(draftPage),{headers:auth})).status,404);
  // Overwrite guard: with an unsent draft mirrored for a page, a re-render must
  // write a NEW file next to it instead of replacing the existing page.
  const guardMd=join(root,'guard 方案.md'); writeFileSync(guardMd,'## T1: 护栏\n正文。\n');
  run(['render',guardMd,'--out',out,'--agent','codex']);
  await fetch(draftUrl,{method:'POST',headers:auth,body:JSON.stringify({pageId:resolve(guardMd),docHash:'b'.repeat(64),annotations:[{id:'g1',blockId:'b1'}],attachments:[]})});
  const guarded=run(['render',guardMd,'--out',out,'--agent','codex']);
  assert(guarded.includes('guard 方案-v2.review.html'));
  assert(existsSync(join(out,'guard 方案-v2.review.html')));
  await fetch(draftUrl+'?pageId='+encodeURIComponent(resolve(guardMd)),{method:'DELETE',headers:auth});
  const launcher=join(bundle,'bin/easyreview.cmd');
  assert.match(execFileSync('cmd.exe',['/c',launcher,'--version'],{encoding:'utf8',windowsHide:true,env:{...process.env,EASYREVIEW_BUN:''}}),/1\.2/);
  const project=join(root,'安装项目 含空格'); mkdirSync(project);
  const installed=JSON.parse(run(['install','--project',project,'--agent','all','--opencode-version','2'])); assert.equal(installed.installedFor.length,4);
  run(['install','--project',project,'--agent','all','--opencode-version','2']);
  assert.equal(installed.skills.length,3); assert.match(readFileSync(installed.opencodeV2Plugin,'utf8'),/easyreview_render/);
  const installedExe=process.env.EASYREVIEW_BUN||join(project,'tools/easyreview/bin/bun.exe'), installedCli=join(project,'tools/easyreview/src/scripts/easyreview-portable.ts'); assert.match(execFileSync(installedExe,[installedCli,'--version'],{encoding:'utf8',windowsHide:true}),/1\.2/);
  // Restart keeps BOTH the URL and the token: the stable port makes a revived
  // helper reachable at the page's own address, and the stable token keeps the
  // pages already rendered against it able to send back.
  const first=JSON.parse(readFileSync(join(out,'.easyreview-helper.json'),'utf8'));
  const firstInfo=await (await fetch(first.url+'/health')).json();
  run(['stop',out]);
  run(['render',join(root,'codex 方案.md'),'--out',out,'--agent','codex']);
  const second=JSON.parse(readFileSync(join(out,'.easyreview-helper.json'),'utf8'));
  assert.equal(first.url,second.url);
  const secondInfo=await (await fetch(second.url+'/health')).json();
  assert.equal(firstInfo.token,secondInfo.token);
  console.log(JSON.stringify({root,results,projectInstall:true,idempotent:true,installedBinary:true,restart:true,stableUrl:true,stableToken:true,draftMirror:true,guard:true},null,2));
} finally { try{run(['stop',out]);}catch{} }
