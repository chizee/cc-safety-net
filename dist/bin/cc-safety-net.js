#!/usr/bin/env node
import{$ as cr,$a as _e,A as pn,Aa as Ye,B as l3,Ba as sr,C as N,Ca as Se,D as T,Da as He,E as Pt,Ea as _,F as Kt,Fa as Ut,G as Wn,Ga as It,H as Vt,Ha as Nt,I as U2,Ia as E,J as g2,Ja as F3,K as nr,Ka as bn,L as L2,La as B3,M as h1,Ma as we,N as dr,Na as J3,O as An,Oa as Z3,P as w1,Pa as Q3,Q as x1,Qa as ft,R as Vn,Ra as X3,S as Mn,Sa as Y3,T as yn,Ta as l1,U as hn,Ua as s1,V as Ie,Va as d1,W as un,Wa as c1,X as D2,Xa as L3,Y as tr,Ya as Oe,Z as C2,Za as Te,_ as $1,_a as Ct,aa as D1,ab as Ee,b as De,ba as k1,bb as f2,c as ke,ca as Ne,cb as m2,d as A,da as Be,db as d2,e as qe,ea as n1,eb as Pe,f as Ht,fa as t1,fb as K,g as X,ga as r1,gb as fn,h as D,ha as rr,hb as vn,i as dn,ia as Je,ib as g1,j as m,ja as k,jb as q2,k as $2,ka as er,kb as i2,l as Ke,la as m1,lb as Z1,m as W2,ma as c2,mb as Kn,n as cn,na as on,o as o3,oa as ar,p as At,pa as lr,q as Ve,qa as e1,r as Ln,ra as a1,s as Me,sa as Ze,t as Et,ta as M2,u as Ge,ua as Mt,v as Ue,va as Gt,w as P,wa as Ce,x as I,xa as H2,y as K2,ya as z3,z as V2,za as Xe}from"../chunks/index-1phktaxx.js";var K3=["-h","--help"];function B(n,t){let r=Object.entries(n.booleans??{}),e=Object.entries(n.values??{}),a=Object.fromEntries(r.map(([i])=>[i,!1])),l={},s=[],d=[],c=!1,L=-1;for(let[i,u]of t.entries()){if(i<=L)continue;if(u==="--"){s.push(...t.slice(i+1));break}if(K3.includes(u)){c=!0;continue}let o=r.find(([,f])=>f.includes(u));if(o){a[o[0]]=!0;continue}let p=e.find(([,f])=>f.includes(u));if(p){let f=t[i+1];if(f===void 0||f.startsWith("-")){d.push(`${u} requires a value`);continue}l[p[0]]=f,L=i+1;continue}if(u.startsWith("-")){d.push(`Unknown option for ${n.label}: ${u}`);continue}if(n.positionals==="tail"){s.push(...t.slice(i));break}s.push(u)}if(n.positionals!=="list"&&n.positionals!=="tail")d.push(...s.map((i)=>`Unexpected argument for ${n.label}: ${i}`));return{flags:a,values:l,positionals:s,help:c,errors:d}}function l2(n){for(let t of n)console.error(t);return n.length>0}import{readdirSync as qs,statSync as i1,unlinkSync as js}from"node:fs";import{basename as p1,dirname as zs,join as Fs,resolve as Bs}from"node:path";function J(n){return Array.from(n,(t)=>{let r=t.charCodeAt(0);if(r<=31||r>=127&&r<=159)return`\\x${r.toString(16).padStart(2,"0")}`;return t}).join("")}var Qt=(n)=>{let t=Date.now()-new Date(n).getTime();if(!Number.isFinite(t))return"";let r=Math.floor(t/60000),e=Math.floor(r/60),a=Math.floor(e/24);if(a>0)return`${a}d ago`;if(e>0)return`${e}h ago`;if(r>0)return`${r}m ago`;return"just now"},X2=(n)=>{let t=(n??"").trim().split(/\s+/).filter((a)=>a&&!/^[A-Za-z_][A-Za-z0-9_]*=/.test(a)),r=t[0]?.split("/").pop();if(!r)return null;let e=t[1];return e&&/^[a-z][a-z0-9-]*$/.test(e)?`${r} ${e}`:r};import{existsSync as V3,readdirSync as M3,readFileSync as G3}from"node:fs";import{join as U3}from"node:path";function b2(n,t){try{return M3(n,{withFileTypes:!0,encoding:"utf8"}).flatMap((r)=>{let e=U3(n,r.name);if(r.isDirectory())return b2(e,t);if(r.name.endsWith(".jsonl"))return[e];return[]})}catch{if(t&&V3(n))t.count++;return[]}}function Xt(n){let t=(a)=>`${a.sessionId}
${X2(a.segment||a.command)}`,r=n.filter((a)=>a.decision!=="allow"),e=r.filter((a)=>a.sessionId).reduce((a,l)=>a.set(t(l),(a.get(t(l))??0)+1),new Map);return new Set(r.filter((a)=>a.failureStage||(e.get(t(a))??0)>=2))}function sn(n,t){try{return G3(n,"utf-8").split(`
`).filter(Boolean).flatMap((r)=>{try{return[JSON.parse(r)]}catch{if(t)t.count++;return[]}})}catch{if(t)t.count++;return[]}}import{resolve as hs}from"node:path";var C3=["AKIA","ASIA","ghp_","gho_","ghu_","ghs_","ghr_","github_pat_","glpat-","xox","npm_","pypi-","rk_","sk-","sk_","gsk_","xai-","pplx-","bastn_","tgp_v1_","flp_","wfr_","fw_","fwp_","tp-","psk-"];function je(n){let t=0,r={allocateSegment(){return t++},getNextSegmentIndex(){return t},recordGlobal(e){n.record({kind:"step",scope:"global",step:e})},recordSegment(e,a=r.currentSegmentIndex){if(a===void 0)return;n.record({kind:"step",scope:"segment",segmentIndex:a,step:e})}};return r}function ze(n={}){let t=[],r=n.maxEvents??512,e={maxTextLength:n.maxTextLength??2048,maxListLength:n.maxListLength??128,maxObjectProperties:n.maxObjectProperties??n.maxListLength??128,maxDepth:n.maxDepth??16},a=0,l,s=new Set;return{record(d){if(l)return;try{if(!d||t.length>=r){a++;return}t.push(St(O3(d,e,s)))}catch{a++}},finish(d){if(l)return l;try{l=St({events:Object.freeze(t),droppedEvents:a,terminal:T3(d,e,s)})}catch{a++,l=Object.freeze({events:Object.freeze(t),droppedEvents:a,terminal:Object.freeze({result:"blocked",reason:"trace unavailable".slice(0,e.maxTextLength),segment:"trace unavailable".slice(0,e.maxTextLength)})})}return l}}}function O3(n,t,r){if(n.kind!=="step")throw TypeError("invalid trace event");let{scope:e,step:a}=n;Sn(a,r,t);let l=Y2(a,t,r);if(e==="global")return{kind:"step",scope:"global",step:l};if(e!=="segment")throw TypeError("invalid trace event scope");return{kind:"step",scope:"segment",segmentIndex:n.segmentIndex,step:l}}function T3(n,t,r){let e=n.result;if(e==="allowed")return Object.freeze({result:"allowed"});if(e!=="blocked")throw TypeError("invalid trace terminal");let a=n.ruleId;return Object.freeze({result:"blocked",reason:Y2(n.reason,t,r),segment:Y2(n.segment,t,r),...a?{ruleId:Y2(a,t,r)}:{}})}function Sn(n,t,r,e=0,a=new WeakSet){if(typeof n==="string"){let d=n.slice(0,r.maxTextLength);if(!Ht(d))return;for(let c of qe(d))for(let L of c.match(/[^\s"'()$]+/g)??[])t.add(Fe(L));return}if(!n||typeof n!=="object"||e>=r.maxDepth||a.has(n))return;if(a.add(n),Array.isArray(n)){let d=Math.min(n.length,r.maxListLength);for(let c=0;c<d;c++)Sn(n[c],t,r,e+1,a);return}let l=0,s=new Set;for(let d in n){if(!Object.hasOwn(n,d))continue;if(l>=r.maxObjectProperties)break;l++,Sn(d,t,r);let c=Yt(d,r,t);if(s.has(c))continue;s.add(c),Sn(n[d],t,r,e+1,a)}}function Y2(n,t,r,e=0,a=new WeakSet){if(typeof n==="string")return Yt(n,t,r);if(!n||typeof n!=="object")return n;if(e>=t.maxDepth)return;if(a.has(n))return;if(a.add(n),Array.isArray(n)){let d=[],c=Math.min(n.length,t.maxListLength);for(let L=0;L<c;L++)d.push(Y2(n[L],t,r,e+1,a));return d}let l={},s=0;for(let d in n){if(!Object.hasOwn(n,d))continue;if(s>=t.maxObjectProperties)break;s++;let c=Yt(d,t,r);if(Object.hasOwn(l,c))continue;Object.defineProperty(l,c,{value:Y2(n[d],t,r,e+1,a),enumerable:!0,configurable:!0,writable:!0})}return l}function Yt(n,t,r){let e=n.slice(0,t.maxTextLength),a=Ht(e)?ke(e):e,l=r.size>0?E3(a,r):a;return(_3(l)?De(l):l).slice(0,t.maxTextLength)}function _3(n){return n.includes("PRIVATE KEY")||n.includes("://")||n.includes("eyJ")||n.includes(":")&&/(?:authorization|cookie|x-api-key|api-key|(?:^|\s)(?:-u|--user)(?:\s|=))/i.test(n)||n.length>=14&&C3.some((t)=>n.includes(t))||n.length>=49&&/\b[a-f0-9]{32}\.[A-Za-z0-9]{16}\b/.test(n)}function E3(n,t){return n.replace(/[^\s"'()$]+/g,(r)=>t.has(Fe(r))?"<redacted>":r)}function Fe(n){let t=2166136261,r=2166136261;for(let e=0;e<n.length;e++)t=Math.imul(t^n.charCodeAt(e),16777619),r=Math.imul(r^n.charCodeAt(n.length-e-1),16777619);return`${t>>>0}:${r>>>0}:${n.length}`}function St(n){if(n&&typeof n==="object"&&!Object.isFrozen(n)){for(let t of Object.values(n))St(t);Object.freeze(n)}return n}function Qe(n,t,r){let e=r??Be(),a=e.getCommandProgram(n,t.shell??"auto"),l=ze(),s=je(l),d=a.dialect==="powershell"?e.getCommandProgram(n,"posix"):a,c=Je(d);s.recordGlobal({type:"parse",input:n,segments:c.map((u)=>[...u])});let L=Ze(n,{...t,analyzePartialProgram:!0,trace:s},a,e),i=s.getNextSegmentIndex();if(L&&i>0&&i<c.length)s.recordSegment({type:"segment-skipped",index:i,reason:"prior-segment-blocked"},i);return Object.freeze({decision:L,trace:l.finish(L?{result:"blocked",reason:L.reason,segment:L.evidence.find((u)=>u.kind==="command")?.segment??n,...L.ruleId?{ruleId:L.ruleId}:{}}:{result:"allowed"}),program:a})}import{resolve as P3}from"node:path";function Rt(n){let t=Xe().safeParse(n);return{errors:t.success?[]:Se(t.error.issues),ruleNames:new Set(Ye(n).map((r)=>r.toLowerCase()))}}function Wt(n){let t=Re(n);if(!t.ok)return t.result;return Rt(t.parsed)}function Re(n){let t=[],r=new Set;try{let e=typeof n==="string"?dn(n):n,a=m(e);if(a===null)return t.push(`File not found: ${e.path}`),{ok:!1,result:{errors:t,ruleNames:r}};if(!a.trim())return t.push("Config file is empty"),{ok:!1,result:{errors:t,ruleNames:r}};return{ok:!0,parsed:JSON.parse(a)}}catch(e){if(e instanceof X)return t.push(e.message),{ok:!1,result:{errors:t,ruleNames:r}};let a=e instanceof Error?e.message:String(e);return t.push(e instanceof SyntaxError?"Invalid JSON":a),{ok:!1,result:{errors:t,ruleNames:r}}}}function We(n){return P3(n??process.cwd(),".safety-net.json")}function s2(n){let t=Re(n);if(!t.ok)return t.result;let r=He(t.parsed);return{errors:r.errors,ruleNames:r.sources}}import{isAbsolute as I3,join as Hn,relative as N3,resolve as Ae,sep as ns}from"node:path";async function A2(n={}){let t=Tt(n);return ts(t,await Rn(t,H2()))}function ts(n,t){if(!t.ok)return t;let r=T(n),e=[...new Set(d2(r.configPath,r.lockPath,n,r.filesystemScope))];if(e.length===0)return t;return{ok:!1,errors:e,warnings:t.warnings,entries:t.entries}}async function Rn(n,t,r,e={}){let a=null,l=!1;try{let s=T(n),d=Ut(s.configTarget);if(!d.ok)return d.result;let c=d.config;if(n.check)return ds(c,s,n);a={target:s.lockTarget,content:m(s.lockTarget)};let L=Ct(s.lockTarget);if(L.errors.some((h)=>h.startsWith("Unable to access ")))return{ok:!1,errors:L.errors,warnings:[],entries:[]};if(n.only&&L.errors.length>0)return{ok:!1,errors:L.errors,warnings:[],entries:[]};let i=L.errors.length>0?null:L.lock,u=n.only?Oe(c,i,n.only):{ok:!0,specs:c.rules};if(!u.ok)return u.result;if(n.only&&!i&&u.specs.length<c.rules.length)return{ok:!1,errors:[`No lockfile available for partial update; run ${Ue}`],warnings:[],entries:[]};let o=(await es(u.specs,(h)=>_e(h,s.configDir,n,i,s.filesystemScope,t),t)).map((h)=>cs(h,i,r));for(let h of o)ps(h.content,h.entry,s.configDir,n,s.filesystemScope);let p=n.only?Ls(c,i,o):o.map((h)=>h.entry);l=!0,E(s.lockTarget,{version:1,rulebooks:p},void 0,e._testAfterPolicyRename);let f=new Map(o.map((h)=>[h.entry.spec,h.rulebook.rules.length])),v=us(p,s.configDir,n,s.filesystemScope,e);return{ok:!0,errors:[],warnings:v,entries:p.map((h)=>is(h,f))}}catch(s){if(l&&a)try{S2(a.target,a.content)}catch(d){return R2(d)}return R2(s)}}async function Ot(n,t={}){return rs(n,Tt(t),H2())}async function rs(n,t,r,e={}){let a=null,l=!1;try{let s=T(t),d=m(s.configTarget);a={target:s.configTarget,content:d};let c=Ut(s.configTarget);if(!c.ok)return c.result;let L=c.config,i=Ge(n)?await Ee(n,r):[{spec:n}],u=i.map((f)=>f.spec),o=[...new Set([...L.rules,...u])];if(o.length>Mt)return as();if(o.length!==L.rules.length)l=!0,E(s.configTarget,{version:1,rules:o,overrides:L.overrides??{},transparent_wrappers:L.transparent_wrappers??[]},void 0,e._testAfterPolicyRename);let p=await Rn(t,r,new Map(i.filter((f)=>!!f.display_ref).map((f)=>[f.spec,f.display_ref])),e);if(!p.ok)S2(s.configTarget,d);return p}catch(s){if(l&&a)try{S2(a.target,a.content)}catch(d){return R2(d)}return R2(s)}}async function es(n,t,r=H2()){if(n.length>Mt)throw Error(Gt);let e=Array(n.length),a=0,l,s=Array.from({length:Math.min(n.length,Ce.concurrency)},async()=>{while(!l){let d=a;if(d>=n.length)return;a++;try{e[d]=await t(n[d],d,r.controller.signal)}catch(c){if(!l)l={value:c},a=n.length,r.controller.abort(c);return}}});if(await Promise.all(s),l)throw l.value;return e}function as(){return{ok:!1,errors:[Gt],warnings:[],entries:[]}}function Tt(n){return{cwd:n.cwd,cacheConfigDir:n.cacheConfigDir,userConfigDir:n.userConfigDir,userConfigPath:n.userConfigPath,projectConfigPath:n.projectConfigPath,global:n.global,check:n.check,only:n.only,refresh:n.refresh}}function ls(n){return{...Tt(n),deleteSource:n.deleteSource}}async function _t(n,t={}){try{return await ss(n,ls(t),{})}catch(r){return R2(r)}}async function ss(n,t,r){let e=T(t),a=_(e.configTarget);if(a.errors.length>0)return{ok:!1,errors:a.errors,warnings:[],entries:[]};if(!a.config)return{ok:!1,errors:[`No config found at ${e.configPath}`],warnings:[],entries:[]};let l=Ct(e.lockTarget);if(l.errors.length>0)return{ok:!1,errors:l.errors,warnings:[],entries:[]};let s=Te(a.config.rules,l.lock,n);if(!s.ok)return s.result;let d=t.deleteSource?vs(e.configDir,s.specs,l.lock,e.filesystemScope):{ok:!0,dirs:[]};if(!d.ok)return d.result;let c=m(e.configTarget);if(c===null)return R2(Error("Rules config is unavailable."));try{E(e.configTarget,{version:1,rules:a.config.rules.filter((u)=>!s.specs.includes(u)),overrides:a.config.overrides??{},transparent_wrappers:a.config.transparent_wrappers??[]},void 0,r._testAfterPolicyRename)}catch(u){throw S2(e.configTarget,c),u}let L=await Rn(t,H2(),void 0,r);if(!L.ok)return S2(e.configTarget,c),L;let i=bs(d.dirs,r,e.filesystemScope);if(!i.ok){S2(e.configTarget,c);let u=await Rn(t,H2(),void 0,r);if(!u.ok)return{ok:!1,errors:[...i.result.errors,...u.errors],warnings:u.warnings,entries:u.entries};return i.result}return L}async function ds(n,t,r){let e=Pe(n,t.lockPath,t.configDir,r,r.global?"user":"project",t.filesystemScope);return{ok:e.errors.length===0&&e.warnings.length===0,errors:[...e.errors,...e.warnings],warnings:[],entries:e.entries}}function cs(n,t,r){let e=t?.rulebooks.find((l)=>l.spec===n.entry.spec&&l.kind==="github"),a=r?.get(n.entry.spec)??(e?.kind==="github"?e.display_ref:void 0);if(!a||n.entry.kind!=="github")return n;return{...n,entry:{...n.entry,display_ref:a}}}function Ls(n,t,r){let e=new Set(n.rules),a=new Set(t?.rulebooks.map((s)=>s.spec)??[]),l=new Map(r.map((s)=>[s.entry.spec,s.entry]));return[...(t?.rulebooks.filter((s)=>e.has(s.spec))??[]).map((s)=>l.get(s.spec)??s),...r.filter((s)=>!a.has(s.entry.spec)).map((s)=>s.entry)]}function is(n,t){return{...n,ruleCount:t.get(n.spec)}}function ps(n,t,r,e,a){let l=Kt(t,Vt(r,e));$2(D(a,l),n)}function us(n,t,r,e,a){let l=Vt(t,r),s=Wn(l),d=D(e,s),c=W2(d);if(!c)return[];let L=n.map((u)=>D(e,Kt(u,l))),i=c.filter((u)=>u.kind==="directory").map((u)=>({directory:D(e,Hn(s,u.name)),identity:D(e,Hn(s,u.name,Me))})).filter((u)=>!L.some((o)=>Ke(u.identity,o))).map((u)=>u.directory);for(let u of i)Ve(u);return i.flatMap((u)=>{try{return fs(u,a),[]}catch{return["Unable to prune rules policy cache safely."]}})}function vs(n,t,r,e){let a=new Map(r?.rulebooks.map((L)=>[L.spec,L])??[]),l=t.flatMap((L)=>{let i=a.get(L);if(!i)return Ln.test(L)?[]:["--delete-source can only delete local rulebook sources"];return i.kind==="local-directory"?[]:["--delete-source can only delete local rulebook sources"]}),s=t.map((L)=>{let i=a.get(L);return Hn(n,i?.kind==="local-directory"?i.path:L)}),d=l.length>0?[]:s.flatMap((L)=>os(n,L,e)),c=[...l,...d];return c.length>0?{ok:!1,result:{ok:!1,errors:c,warnings:[],entries:[]}}:{ok:!0,dirs:s}}function os(n,t,r){let e=Ae(n),a=Ae(t),l=N3(e,a);if(l===""||l===".."||l.startsWith(`..${ns}`)||I3(l))return[`Refusing to delete local rulebook source outside ${n}: ${t}`];let s=D(r,a),d=W2(s);if(!d)return[`Local rulebook source directory not found: ${t}`];let c=d.find((L)=>L.name==="rulebook.json");if(!c)return[`Local rulebook source directory is missing rulebook.json: ${t}`];if(c.kind!=="file")throw new X(r.label);if(m(D(r,Hn(a,"rulebook.json"))),d.length>1)return[`Local rulebook source directory contains extra files: ${t}. delete manually if you really want to remove the directory.`];return[]}function bs(n,t,r){let e=n.flatMap((a)=>{try{return ys(D(r,a),t),[]}catch(l){return[`Failed to delete local rulebook source ${a}: ${l instanceof Error?l.message:String(l)}`]}});return e.length>0?{ok:!1,result:{ok:!1,errors:e,warnings:[],entries:[]}}:{ok:!0}}function fs(n,t){if(t._testPruneRulebookCacheDir){t._testPruneRulebookCacheDir(n.path);return}At(n)}function ys(n,t){if(t._testDeleteLocalSourceDir){t._testDeleteLocalSourceDir(n.path);return}At(n)}function S2(n,t){if(t===null){cn(n);return}$2(n,t)}function R2(n){return{ok:!1,errors:[n instanceof Error?n.message:String(n)],warnings:[],entries:[]}}function G2(n,t){let r=xs(t),e=e1(r),a={effectiveLevel:e.effectiveLevel,selectedPreset:r.policySnapshot.policy.safety.level??"standard",effectiveCapabilities:e.effectiveCapabilities,destructiveCommandRuleOverrides:r.policySnapshot.policy.destructiveCommandRuleOverrides},{configSource:l,configValid:s}=ws({cwd:t?.cwd,userConfigDir:t?.userConfigDir});if(!n||!n.trim())return{trace:{steps:[{type:"error",message:"No command provided"}],segments:[]},result:"allowed",configSource:l,configValid:s,...a};let d=$s(n,r);if(d)return{trace:{steps:[],segments:[{index:0,steps:[{type:"rule-check",rule:d.rule,matched:!0,reason:d.reason}]}]},result:"blocked",reason:A(d.reason),segment:A(d.target),...d.ruleId?{ruleId:A(d.ruleId)}:{},configSource:l,configValid:s,...a};let c=Qe(n,r),L=c.decision,i=L?.ruleId??ms(n,r),u=un.find((p)=>p.id===i&&p.activationCapability),o=u?e.policy.effectiveDestructiveCommandRules[u.id]:void 0;return{trace:Ds(c.trace),result:L?"blocked":"allowed",reason:L?A(L.reason):void 0,segment:L?A(L.evidence.find((p)=>p.kind==="command")?.segment??n):void 0,ruleId:L?.ruleId?A(L.ruleId):void 0,customRule:gs(ks(L?.ruleId,r.policySnapshot)),configSource:l,configValid:s,...a,...u&&o?{ruleActivation:{id:u.id,...o}}:{}}}function ws(n){let t=P(n?.cwd),r=n?.userConfigPath??I(n),e=N({cwd:n?.cwd,userConfigDir:n?.userConfigDir,userConfigPath:n?.userConfigPath});try{if(m(e.projectConfigTarget)!==null){if(s2(e.projectConfigTarget).errors.length===0)return{configSource:t,configValid:!0};return{configSource:t,configValid:!1}}}catch(a){if(a instanceof X)return{configSource:t,configValid:!1};throw a}try{if(m(e.userConfigTarget)!==null){let a=s2(e.userConfigTarget);return{configSource:r,configValid:a.errors.length===0}}return{configSource:null,configValid:!0}}catch(a){if(a instanceof X)return{configSource:r,configValid:!1};throw a}}function xs(n){let t=hs(n?.cwd??process.cwd()),r=n?.policySnapshot??K({cwd:t,userConfigDir:n?.userConfigDir}),e=c2(r.policy);return{cwd:t,effectiveCwd:t,policySnapshot:r,environment:Ie(),protectedGitMetadata:r1(t),effectiveCapabilities:e.capabilities,strict:n?.strict??e.strict,paranoidRm:e.paranoidRm,paranoidInterpreters:e.paranoidInterpreters,worktreeMode:e.worktreeMode}}function $s(n,t){let r=t.cwd??process.cwd(),e=Ne(M2("",{command:n},{kind:"command",shell:"posix"},{executionCwd:r,configCwd:r},n)),a=s1(e);if(a)return{reason:l1,target:a.target,ruleId:"policy-protection",rule:"policy-protection:findPolicyConfigMutationTarget"};let l=t1(e,t.protectedGitMetadata);if(l)return{reason:n1,target:l.target,ruleId:"git-metadata-protection",rule:"git-metadata-protection:findGitMetadataMutationTarget"};let s=t.policySnapshot.policy,d=s.secretProtection.enabled===!1?null:c1(e,s.secretProtection,{strict:t.strict});if(d)return{reason:d1,target:d.target,ruleId:d.ruleId,rule:"secret-protection:findSensitiveTarget"};return null}function ms(n,t){let r=t.policySnapshot.policy,e=vn({...r,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:{...r.destructiveCommandRuleOverrides,...Object.fromEntries(un.flatMap((a)=>a.activationCapability?[[a.id,"on"]]:[]))}},t.policySnapshot.state==="degraded"?{diagnostics:t.policySnapshot.diagnostics,reason:t.policySnapshot.reason}:void 0);return a1(n,{...t,policySnapshot:e,strict:!0,paranoidRm:!0,paranoidInterpreters:!0})?.ruleId}function gs(n){if(!n)return;return{id:A(n.id),...n.rulebook?{rulebook:{name:A(n.rulebook.name),version:A(n.rulebook.version)}}:{},...n.source?{source:A(n.source)}:{},...n.override?{override:{type:"reason",reason:A(n.override.reason)}}:{}}}function Ds(n){let t=n.events.flatMap((e)=>e.kind==="step"&&e.scope==="global"?[e.step]:[]),r=new Map;for(let e of n.events){if(e.kind!=="step"||e.scope!=="segment")continue;let a=r.get(e.segmentIndex)??{index:e.segmentIndex,steps:[]};a.steps.push(e.step),r.set(e.segmentIndex,a)}return{steps:t,segments:[...r.values()]}}function ks(n,t){let r=n?.replace(/^custom\./,"");if(!r||!t.policy.rules.some((e)=>e.name===r))return;return t.ruleMetadata[r]??Object.freeze({id:r})}function Js(n){let t=U2(),r=B({label:"logs",booleans:{all:["--all"],suspect:["--suspect"],json:["--json"],pruneLegacy:["--prune-legacy"],dryRun:["--dry-run"]},values:{id:["--id"],limit:["--limit"],since:["--since"],agent:["--agent"],rule:["--rule"],session:["--session"],project:["--project"]}},n);if(l2(r.errors))return null;if(r.values.id!==void 0&&!/^[a-f0-9]{16}$/.test(r.values.id))return console.error("--id must be 16 hexadecimal characters"),null;let e=r.values.limit===void 0?20:L1(r.values.limit);if(e===null)return console.error("--limit must be a positive number"),null;let a=r.values.since===void 0?Math.min(30,t):L1(r.values.since);if(a===null||a>t)return console.error(`--since must be a positive number of days no greater than ${t}`),null;let l={limit:e,limitExplicit:r.values.limit!==void 0,since:a,sinceExplicit:r.values.since!==void 0,all:r.flags.all,json:r.flags.json,suspect:r.flags.suspect,pruneLegacy:r.flags.pruneLegacy,dryRun:r.flags.dryRun,id:r.values.id,agent:r.values.agent,rule:r.values.rule,session:r.values.session,project:r.values.project===void 0?void 0:Bs(r.values.project)};if(l.id&&(l.agent!==void 0||l.rule!==void 0||l.session!==void 0||l.project!==void 0||l.suspect||l.sinceExplicit||l.limitExplicit))return console.error("--id cannot be combined with --agent, --rule, --session, --project, --suspect, --since, or --limit"),null;if(l.pruneLegacy&&(l.id!==void 0||l.agent!==void 0||l.rule!==void 0||l.session!==void 0||l.project!==void 0||l.suspect||l.all||l.sinceExplicit||l.limitExplicit))return console.error("--prune-legacy cannot be combined with --id, --agent, --rule, --session, --project, --suspect, --all, --since, or --limit"),null;if(l.dryRun&&!l.pruneLegacy)return console.error("--dry-run requires --prune-legacy"),null;return l}async function u1(n,t={}){let r=Js(n);if(!r)return 1;let e=t.logsDir??L2();if(r.pruneLegacy)return Zs(e,r.json,r.dryRun);if(!e)return console.log(r.json?"[]":r.id?`No retained audit log entry found for id ${J(r.id)}.`:"No audit log entries found."),0;g2(e);let a={count:0},l=b2(e,a).flatMap((i)=>sn(i,a).map((u)=>({entry:u,file:i})));if(a.count>0)console.error(`warning: ${a.count} audit log ${a.count===1?"source":"sources"} could not be read; these results are incomplete`);if(r.id)return Ss(l,r,t.timeZone);let s=Date.now()-r.since*24*60*60*1000,d=l.filter((i)=>Hs(i,r,e,s)),c=r.suspect?Xt(d.map((i)=>i.entry)):null,L=(c?d.filter((i)=>c.has(i.entry)):d).sort((i,u)=>Date.parse(u.entry.ts)-Date.parse(i.entry.ts)).slice(0,r.limit);if(r.json)return console.log(JSON.stringify(L.map((i)=>i.entry),null,2)),0;if(L.length===0)return console.log("No audit log entries found."),0;for(let i of L)console.log(As(i.entry,t.timeZone));return 0}function Zs(n,t,r){let e=n?Xs(n).map((d)=>Fs(n,d)):[];if(r)return Qs(e,t);let a=[],l=0,s=0;for(let d of e){let c=i1(d,{throwIfNoEntry:!1})?.size??0,L=Ys(d);if(L){a.push(`${p1(d)}: ${L}`);continue}l++,s+=c}if(t)return console.log(JSON.stringify({removedFiles:l,removedBytes:s,failedFiles:a.length})),a.length===0?0:1;console.log(l===0&&a.length===0?"No legacy audit log files found.":`Removed ${l} legacy audit log ${l===1?"file":"files"} (${v1(s)}).`);for(let d of a)console.error(`Could not remove ${J(d)}`);if(console.log("Nested v2 audit logs were not changed."),l>0)console.log("This deletion cannot be undone.");return a.length===0?0:1}function Qs(n,t){let r=n.reduce((e,a)=>e+(i1(a,{throwIfNoEntry:!1})?.size??0),0);if(t)return console.log(JSON.stringify({dryRun:!0,files:n.length,bytes:r})),0;if(console.log(n.length===0?"No legacy audit log files found.":`Would remove ${n.length} legacy audit log ${n.length===1?"file":"files"} (${v1(r)}).`),console.log("Nested v2 audit logs are not included."),n.length>0)console.log("Run the same command without --dry-run to delete them.");return 0}function Xs(n){try{return qs(n,{withFileTypes:!0}).filter((t)=>t.isFile()&&t.name.endsWith(".jsonl")).map((t)=>t.name)}catch{return[]}}function Ys(n){try{return js(n),null}catch(t){return t instanceof Error?t.message:String(t)}}function v1(n){let t=["B","KiB","MiB","GiB"],r=Math.min(Math.floor(Math.log2(Math.max(n,1))/10),t.length-1);return`${Math.round(n/1024**r*10)/10} ${t[r]}`}function Ss(n,t,r){let e=n.filter((l)=>l.entry.id===t.id);if(e.length>1)return console.error(`Multiple audit log entries found for id ${J(t.id??"")}.`),1;if(t.json)return console.log(JSON.stringify(e.map((l)=>l.entry),null,2)),0;let a=e[0];if(!a)return console.log(`No retained audit log entry found for id ${J(t.id??"")}.`),0;return console.log(Ks(a.entry,r)),0}function Hs(n,t,r,e){if(!t.all&&n.entry.decision==="allow")return!1;if(Date.parse(n.entry.ts)<e)return!1;if(t.agent!==void 0&&n.entry.agent!==t.agent)return!1;if(t.rule!==void 0&&n.entry.ruleId!==t.rule)return!1;if(t.session!==void 0&&!Rs(n,r,t.session))return!1;if(t.project!==void 0&&!Ws(n.entry.cwd,t.project))return!1;return!0}function Rs(n,t,r){if(n.entry.sessionId===r)return!0;return zs(n.file)===t&&p1(n.file,".jsonl")===r}function Ws(n,t){if(!n)return!1;return n===t||n.startsWith(`${t}/`)}function As(n,t){let r=J(n.id??"-"),e=J(n.decision??"deny"),a=n.cwd?`  [${J(n.cwd)}]`:"",l=n.segment||n.command,s=l===n.command?"":"↳ ",d=l.length>50?`${l.slice(0,50)}…`:l;return`${r.padEnd(16)}  ${J(o1(n.ts,t))}  ${e.padEnd(5)}  ${J(n.agent??"-").padEnd(15)}  ${J(n.ruleId??"-").padEnd(20)}  ${s}${J(d)}${a}`}function Ks(n,t){let r=(a)=>J(a===void 0||a===null||a===""?"-":a),e=n.shape?`${n.agent??"-"} (shape: ${n.shape})`:n.agent??"-";return[`id:        ${r(n.id)}`,`ts:        ${r(o1(n.ts,t))}`,`decision:  ${r(n.decision)}`,`agent:     ${r(e)}`,`level:     ${r(n.level)}`,`tool:      ${r(n.toolName)}`,`rule:      ${r(n.ruleId)}`,`intent:    ${r(n.intent)}`,`stage:     ${r(n.failureStage)}`,`error:     ${r(n.errorCode)}`,`session:   ${r(n.sessionId)}`,`cwd:       ${r(n.cwd)}`,`version:   ${r(n.v)}`,`truncated: ${r(n.truncated===!0?"yes":void 0)}`,`reason:    ${r(n.reason)}`,`command:   ${r(n.command)}`,`segment:   ${r(n.segment)}`].join(`
`)}function o1(n,t){let r=new Date(n);if(Number.isNaN(r.getTime()))return n;return new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:t}).format(r)}function L1(n){let t=Number(n);return Number.isFinite(t)&&t>0?t:null}var b1={name:"doctor",aliases:["--doctor"],description:"Run diagnostic checks to verify installation and configuration",usage:"doctor [options]",options:[{flags:"--json",description:"Output diagnostics as JSON"},{flags:"--skip-update-check",description:"Skip npm registry version check"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net doctor","cc-safety-net doctor --json","cc-safety-net doctor --skip-update-check"]};var f1={name:"explain",description:"Show step-by-step analysis trace of how a command would be analyzed",usage:"explain [options] <command>",argument:"<command>",options:[{flags:"--json",description:"Output analysis as JSON"},{flags:"--cwd",argument:"<path>",description:"Use custom working directory"},{flags:"-h, --help",description:"Show this help"}],examples:['cc-safety-net explain "git reset --hard"','cc-safety-net explain --json "rm -rf /"','cc-safety-net explain --cwd /tmp "git status"']};var y1={name:"gui",description:"Open the local policy editor GUI",usage:"gui [options]",options:[{flags:"--no-open",description:"Print the URL without opening a browser"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net gui","cc-safety-net gui --no-open"]};import{isAbsolute as q1,relative as Is}from"node:path";var Vs=8388608;function Ms(n,t){console.log(JSON.stringify(n(w1(t))))}async function Gs(n){let t;try{t=(await Lr(process.stdin)).trim()}catch{n({reason:"Failed to parse hook input JSON."});return}if(!t){n({reason:"Missing hook input JSON."});return}return ir(t,n,"Failed to parse hook input JSON.")}async function Lr(n){let t=[],r=0;for await(let e of n){let a=typeof e==="string"?Buffer.from(e,"utf-8"):Buffer.from(e.buffer,e.byteOffset,e.byteLength);if(r+=a.byteLength,r>Vs)throw Us(n),Error("hook input byte limit exceeded");t.push(a)}return Buffer.concat(t,r).toString("utf-8")}function Us(n){let t=n.destroy??n.cancel;if(!t)return;try{Promise.resolve(t.call(n)).catch(()=>{})}catch{}}function ir(n,t,r){try{return JSON.parse(n)}catch{t({reason:r});return}}function H(n,t){let r=t.get(n);return r?{kind:"command",shell:r}:{kind:$1(n)}}function n2(n,t,r,e){let a=n===void 0?process.cwd():n,l=typeof a==="string"&&a.trim()!==""?i2([a]):void 0;if(l)return{configCwd:l,executionCwd:l};return Q(e,t,r,_s(a)),null}function Q(n,t,r,e){let a;try{a=cr(t)}catch(l){if(!(l instanceof C2))throw l}n(An({command:a,segment:e,toolName:r}))}async function Cs(n){let t=await Gs(n.outputDeny);if(t===void 0)return;if(!t||typeof t!=="object"||Array.isArray(t)){Q(n.outputDeny);return}if(!n.isSupported(t))return;let r=n.getAgent?.(t)??n.agent,e=n.agent===r?void 0:n.agent,a=Ps(t),l=(p,f)=>{h1(p,()=>n.getSessionId(t),{agent:r,shape:e,toolName:f,cwd:a}),n.outputDeny(p)},s=n.getToolName(t);if(typeof s!=="string"||s.trim()===""){Q((p)=>l(p),Es(t));return}let d=s,c=(p)=>l(p,d),L;try{L=n.getToolInput(t,d,c)}catch(p){if(!(p instanceof C2))throw p;Q(c,void 0,d);return}if(!L.ok)return;let i=n.getContext(t,L.input,d,c);if(!i)return;let u;try{u=cr(L.input)}catch(p){if(!(p instanceof C2))throw p;Q(c,void 0,d);return}let o=M2(d,L.input,L.route,i,u??null);try{let p=Kn(o,{guard:{auditAllowed:m1(),dependencies:n.guardDependencies},audit:{agent:r,shape:e,getSessionId:()=>n.getSessionId(t)}}),f=dr(p,{includeEvidence:!0,toolName:p.stage==="command-analysis"?void 0:d});if(f){n.outputDeny(f);return}n.outputAllow?.()}catch(p){if(!(p instanceof g1))throw p;Os(p);let f=dr(p.evaluation,{includeEvidence:!0,toolName:p.evaluation.stage==="command-analysis"?void 0:d});if(f)n.outputDeny(f);return}}function Os(n){if(!on(k.debug))return;console.error(`CC Safety Net debug: ${Ts(n.stage)}: ${x1(n.cause)}`)}function Ts(n){if(n==="policy-protection")return"hook policy protection failed";if(n==="config-load")return"hook config loading failed";if(n==="secret-protection")return"hook secret protection failed";return"hook analysis failed"}function _s(n){return typeof n==="string"?n:void 0}function Es(n){if(!n||typeof n!=="object"||Array.isArray(n))return;if(Object.hasOwn(n,"tool_input"))return n.tool_input;let t=n.toolCall;if(t&&typeof t==="object"&&!Array.isArray(t))return t.args;return}function Ps(n){if(!n||typeof n!=="object"||Array.isArray(n))return null;let t=n.cwd;if(typeof t==="string")return t;let r=n.toolCall;if(!r||typeof r!=="object"||Array.isArray(r))return null;let e=r.args;if(!e||typeof e!=="object"||Array.isArray(e))return null;let a=e.Cwd;return typeof a==="string"?a:null}async function R(n){let t=(a)=>Ms(n.createDenyOutput,a),r=n.createAllowOutput;await Cs({...n,outputDeny:t,outputAllow:r?()=>console.log(JSON.stringify(r())):void 0})}var Ns=new Map([["run_command","auto"]]),nd=new Set(["absolutepath","directorypath","file_path","filepath","path","searchdirectory","searchpath","target_file","targetfile"]);function j1(n){return H(n,Ns)}async function z1(){await R({agent:"antigravity-cli",createDenyOutput:(n)=>({decision:"deny",reason:n}),isSupported:()=>!0,getToolName:(n)=>n.toolCall?.name,getToolInput:(n,t)=>({ok:!0,input:ld(n.toolCall?.args,t),route:j1(t)}),getContext:td,getSessionId:(n)=>n.conversationId})}function td(n,t,r,e){let l=ad(n).flatMap((L)=>{let i=i2([L]);return i?[i]:[]});if(!l[0])return k2(e,t,r),null;if(r!=="run_command"){let L;try{L=rd(t,r,l)}catch(i){if(i instanceof C2)return k2(e,void 0,r),null;if(!(i instanceof Vn))throw i;return k2(e,t,r),null}if(!L)return k2(e,t,r),null;return{configCwd:L,executionCwd:L,policyConfigCwds:l}}let s=n.toolCall?.args;if(!s||!Object.hasOwn(s,"Cwd"))return{configCwd:l[0],executionCwd:l[0],policyConfigCwds:l};let d=s.Cwd;if(typeof d!=="string"||d.trim()==="")return k2(e,t,r),null;let c=q2(d,l);if(c){let L=F1(c,l);if(!L)return k2(e,t,r,d),null;return{configCwd:L,executionCwd:c,policyConfigCwds:l}}return k2(e,t,r,d),null}function rd(n,t,r){let e=j1(t),a=[...D1(n,nd),...e.kind==="patch"?k1(n):[]].filter(q1),l=Mn(),s=new Set(a.flatMap((d)=>{let c=F1(yn(d,hn,l),r);return c?[c]:[]}));if(s.size>1)return null;return[...s][0]??r[0]??null}function F1(n,t){return t.filter((r)=>ed(n,r)).reduce((r,e)=>e.length>r.length?e:r,"")||null}function ed(n,t){let r=Is(t,n);return r===""||!r.startsWith("..")&&!q1(r)}function k2(n,t,r,e){let a=t&&typeof t==="object"?t.command:void 0;n(An({command:typeof a==="string"?a:void 0,segment:e,toolName:r}))}function ad(n){if(n.workspacePaths===void 0)return[process.cwd()];let t=Array.isArray(n.workspacePaths)?n.workspacePaths.filter((r)=>typeof r==="string"&&r.trim()!==""):[];return i2(t)?t:[]}function ld(n,t){if(!n)return;if(t!=="run_command")return n;return{...n,command:typeof n.CommandLine==="string"&&n.CommandLine!==""?n.CommandLine:void 0}}var wn=[{id:"antigravity-cli",displayName:"Antigravity CLI",doctorOrder:3,runtime:{order:1,flags:["-ac","--agy-cli"],description:"Run as Antigravity CLI PreToolUse hook",legacyTopLevelFlags:[]},install:{order:2,flag:"--agy-cli",artifactKind:"hook config",probeCommand:["agy","--version"]}},{id:"claude-code",displayName:"Claude Code",doctorOrder:1,runtime:{order:2,displayName:"Coding CLI",flags:["-cc","--coding-cli"],legacyFlags:["--claude-code"],description:"Run as Coding CLI PreToolUse hook",legacyTopLevelFlags:["-cc","--claude-code"]},install:{order:3,flag:"--claude-code",artifactKind:"plugin",probeCommand:["claude","--version"]}},{id:"codex",displayName:"Codex",doctorOrder:4,install:{order:4,flag:"--codex",artifactKind:"plugin",probeCommand:["codex","--version"]}},{id:"copilot-cli",displayName:"GitHub Copilot CLI",doctorOrder:7,runtime:{order:5,flags:["-cp","--copilot-cli"],description:"Run as GitHub Copilot CLI PreToolUse hook",legacyTopLevelFlags:["-cp","--copilot-cli"]},install:{order:7,flag:"--copilot-cli",artifactKind:"plugin",probeCommand:["copilot","--binary-version"]}},{id:"gemini-cli",displayName:"Gemini CLI",doctorOrder:6,runtime:{order:4,flags:["-gc","--gemini-cli"],description:"Run as Gemini CLI BeforeTool hook",legacyTopLevelFlags:["-gc","--gemini-cli"]},install:{order:6,flag:"--gemini-cli",artifactKind:"extension",probeCommand:["gemini","--version"]}},{id:"hermes-agent",displayName:"Hermes Agent",doctorOrder:8,runtime:{order:6,flags:["-ha","--hermes-agent"],description:"Run as Hermes Agent pre_tool_call hook",legacyTopLevelFlags:[]},install:{order:8,flag:"--hermes-agent",artifactKind:"plugin",probeCommand:["hermes","--version"]}},{id:"kimi-code",displayName:"Kimi Code",doctorOrder:9,runtime:{order:7,flags:["-kc","--kimi-code"],description:"Run as Kimi Code PreToolUse hook",legacyTopLevelFlags:[]},install:{order:9,flag:"--kimi-code",artifactKind:"hook config",probeCommand:["kimi","--version"]}},{id:"openclaw",displayName:"OpenClaw",doctorOrder:10,install:{order:10,flag:"--openclaw",artifactKind:"plugin",probeCommand:["openclaw","--version"]}},{id:"opencode",displayName:"OpenCode",doctorOrder:11,install:{order:11,flag:"--opencode",artifactKind:"plugin",probeCommand:["opencode","--version"]}},{id:"pi",displayName:"Pi",doctorOrder:12,install:{order:12,flag:"--pi",artifactKind:"package",probeCommand:["pi","--version"]}},{id:"cursor",displayName:"Cursor",doctorOrder:5,runtime:{order:3,flags:["-cu","--cursor"],description:"Run as Cursor preToolUse hook",legacyTopLevelFlags:[]},install:{order:5,flag:"--cursor",artifactKind:"hook config",probeCommand:["cursor","--version"]}},{id:"amp",displayName:"Amp Code",doctorOrder:2,install:{order:1,flag:"--amp",artifactKind:"plugin",probeCommand:["amp","--version"]}}],Gn=wn.slice().sort((n,t)=>n.doctorOrder-t.doctorOrder).map((n)=>n.id),B1=wn.filter((n)=>("runtime"in n)).slice().sort((n,t)=>n.runtime.order-t.runtime.order).map((n)=>({id:n.id,displayName:"displayName"in n.runtime?n.runtime.displayName:n.displayName,flags:n.runtime.flags,legacyFlags:"legacyFlags"in n.runtime?n.runtime.legacyFlags:[],description:n.runtime.description,legacyTopLevelFlags:n.runtime.legacyTopLevelFlags})),M=wn.slice().sort((n,t)=>n.install.order-t.install.order).map((n)=>({id:n.id,...n.install})).map(({order:n,...t})=>t),Q6=Object.fromEntries(wn.map((n)=>[n.id,n.displayName]));function j(n){return wn.find((t)=>t.id===n)?.displayName??n}import{homedir as sd}from"node:os";import{isAbsolute as J1,join as pr}from"node:path";function Q1(n){if(n!==void 0&&n!==null&&!J1(n))return"unknown";try{let t=Mn(),r=n?yn(n,hn,t):void 0,e=process.env.HOME||sd(),a=[["codex",process.env.CODEX_HOME||pr(e,".codex")],["copilot-cli",process.env.COPILOT_HOME||pr(e,".copilot")],["claude-code",process.env.CLAUDE_CONFIG_DIR||pr(e,".claude")]],l=r?a.flatMap(([s,d])=>{if(!J1(d))return[];return Z1(r,yn(d,hn,t))?[s]:[]}):[];if(l.length===1)return l[0]??"unknown";if(l.length>1)return"unknown"}catch(t){if(t instanceof Vn)return"unknown";return"unknown"}if(process.env.CLAUDECODE==="1"||Boolean(process.env.CLAUDE_CODE_ENTRYPOINT))return"claude-code";return"unknown"}var ur="PreToolUse",X1="BeforeTool",Y1="pre_tool_call",vr="PreToolUse";var dd=new Map([["Bash","posix"],["PowerShell","powershell"]]);function cd(n){return H(n,dd)}async function S1(){await R({agent:"claude-code",getAgent:(n)=>Q1(n.transcript_path),createDenyOutput:(n)=>({hookSpecificOutput:{hookEventName:ur,permissionDecision:"deny",permissionDecisionReason:n}}),isSupported:(n)=>n.hook_event_name===ur,getToolName:(n)=>n.tool_name,getToolInput:(n,t)=>({ok:!0,input:n.tool_input,route:cd(t)}),getContext:(n,t,r,e)=>n2(n.cwd,t,r,e),getSessionId:(n)=>n.session_id})}var Ld=new Map([["bash","auto"],["Bash","auto"],["powershell","powershell"],["PowerShell","powershell"]]);function id(n){return H(n,Ld)}async function H1(){await R({agent:"copilot-cli",createDenyOutput:(n)=>({permissionDecision:"deny",permissionDecisionReason:n}),isSupported:()=>!0,getToolName:(n)=>n.toolName,getToolInput:(n,t,r)=>{if(typeof n.toolArgs!=="string")return r({reason:"Failed to parse toolArgs JSON."}),{ok:!1};let e=ir(n.toolArgs,r,"Failed to parse toolArgs JSON.");if(e===void 0)return{ok:!1};return{ok:!0,input:e,route:id(t)}},getContext:(n,t,r,e)=>n2(n.cwd,t,r,e),getSessionId:(n)=>typeof n.sessionId==="string"&&n.sessionId.trim()?n.sessionId:void 0})}var pd=new Map([["Shell","auto"]]);function ud(n){return H(n,pd)}async function R1(){await R({agent:"cursor",createDenyOutput:(n)=>({permission:"deny",user_message:n,agent_message:n}),createAllowOutput:()=>({permission:"allow"}),isSupported:()=>!0,getToolName:(n)=>n.tool_name,getToolInput:(n,t)=>({ok:!0,input:n.tool_input,route:ud(t)}),getContext:vd,getSessionId:(n)=>n.conversation_id})}function vd(n,t,r,e){let a=od(n);if(!a[0])return Q(e,t,r),null;let l=q2(fd(n.cwd),a);if(!l)return Q(e,t,r,typeof n.cwd==="string"?n.cwd:void 0),null;if(t===null||typeof t!=="object"||Array.isArray(t))return{configCwd:l,executionCwd:l,policyConfigCwds:a};if(!Object.hasOwn(t,"working_directory"))return{configCwd:l,executionCwd:l,policyConfigCwds:a};let s=t.working_directory;if(typeof s!=="string"||s.trim()==="")return Q(e,t,r),null;let d=q2(s,a);if(!d)return Q(e,t,r,s),null;return{configCwd:l,executionCwd:d,policyConfigCwds:a}}function od(n){return bd(n).flatMap((t)=>{let r=i2([t]);return r?[r]:[]})}function bd(n){if(n.workspace_roots===void 0)return typeof n.cwd==="string"&&n.cwd.trim()!==""?[n.cwd]:[];if(!Array.isArray(n.workspace_roots))return[];return n.workspace_roots.filter((t)=>typeof t==="string"&&t.trim()!=="")}function fd(n){return typeof n==="string"&&n.trim()!==""?n:"."}var yd=new Map([["run_shell_command","auto"]]);function hd(n){return H(n,yd)}async function W1(){await R({agent:"gemini-cli",createDenyOutput:(n)=>({decision:"deny",reason:n,systemMessage:n}),isSupported:(n)=>n.hook_event_name===X1,getToolName:(n)=>n.tool_name,getToolInput:(n,t)=>({ok:!0,input:n.tool_input,route:hd(t)}),getContext:(n,t,r,e)=>n2(n.cwd,t,r,e),getSessionId:(n)=>n.session_id})}import{resolve as wd}from"node:path";var xd=new Map([["terminal","posix"]]);async function A1(){await R({agent:"hermes-agent",createDenyOutput:(n)=>({action:"block",message:n}),isSupported:(n)=>n.hook_event_name===Y1,getToolName:(n)=>n.tool_name,getToolInput:(n,t)=>({ok:!0,input:n.tool_input,route:H(t,xd)}),getContext:$d,getSessionId:(n)=>n.session_id})}function $d(n,t,r,e){let a=n2(n.cwd,t,r,e);if(!a)return null;if(!t||typeof t!=="object"||Array.isArray(t))return a;if(!Object.hasOwn(t,"workdir"))return a;let l=t.workdir;if(typeof l!=="string"||l.trim()==="")return Q(e,t,r),null;let s=i2([wd(a.configCwd,l)]);if(!s)return Q(e,t,r,l),null;return{...a,executionCwd:s}}var K1=new Map([["Bash","posix"]]);function md(n){return H(n,K1)}async function V1(){await R({agent:"kimi-code",createDenyOutput:(n)=>({hookSpecificOutput:{hookEventName:vr,permissionDecision:"deny",permissionDecisionReason:n}}),isSupported:(n)=>n.hook_event_name===vr,getToolName:(n)=>n.tool_name,getToolInput:(n,t)=>({ok:!0,input:n.tool_input,route:md(t)}),getContext:(n,t,r,e)=>{let a=n2(n.cwd,t,r,e);if(!a)return null;let l=n.tool_input;if(!K1.has(r)||!l||!Object.hasOwn(l,"cwd"))return a;let s=l.cwd;if(typeof s!=="string"||s.trim()==="")return Q(e,t,r),null;let d=q2(s,[a.configCwd]);if(!d)return Q(e,t,r,s),null;return{configCwd:a.configCwd,executionCwd:d}},getSessionId:(n)=>n.session_id})}var gd={"antigravity-cli":z1,"claude-code":S1,"copilot-cli":H1,cursor:R1,"gemini-cli":W1,"hermes-agent":A1,"kimi-code":V1},O2=B1.map((n)=>({...n,run:gd[n.id]}));function M1(n){let t=B({label:"hook",booleans:Object.fromEntries(O2.map((e)=>[e.id,[...e.flags,...e.legacyFlags]]))},n);if(t.errors.length>0)return;let r=O2.filter((e)=>t.flags[e.id]);return r.length===1?r[0]:void 0}function G1(n){return O2.find((t)=>t.legacyTopLevelFlags.some((r)=>r===n))}var Dd=O2.map((n)=>({flags:n.flags.join(", "),description:n.description})),kd=O2.flatMap((n)=>n.flags.map((t)=>`cc-safety-net hook ${t}`)),U1={name:"hook",description:"Run as an agent CLI hook (reads JSON from stdin)",usage:"hook INTEGRATION_FLAG",options:[...Dd,{flags:"-h, --help",description:"Show this help"}],examples:kd};var C1={name:"install",description:"Install CC Safety Net into a coding agent CLI",usage:"install [TARGET_FLAG]",options:[...M.map((n)=>({flags:n.flag,description:`Install ${j(n.id)} ${n.artifactKind}`})),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net install",...M.map((n)=>`cc-safety-net install ${n.flag}`)]},O1={name:"uninstall",description:"Uninstall CC Safety Net from a coding agent CLI",usage:"uninstall [TARGET_FLAG]",options:[...M.map((n)=>({flags:n.flag,description:`Uninstall ${j(n.id)} ${n.artifactKind}`})),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net uninstall",...M.map((n)=>`cc-safety-net uninstall ${n.flag}`)]},T1={name:"update",description:"Update every installed CC Safety Net integration to the latest version",usage:"update",options:[{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net update"]};var _1={name:"logs",description:"Browse audit log entries recorded by hooks",usage:"logs [options]",options:[{flags:"--id",argument:"<id>",description:"Show one entry from retained history by its 16-character id (not guaranteed once it is older than the configured retention)"},{flags:"--limit",argument:"<n>",description:"Maximum entries to print",default:"20"},{flags:"--since",argument:"<days>",description:"Only include entries newer than this many days (max: the configured audit retention, 1-365)",default:"30"},{flags:"--agent",argument:"<name>",description:"Filter by agent name"},{flags:"--rule",argument:"<ruleId>",description:"Filter by rule id"},{flags:"--session",argument:"<id>",description:"Filter by session id"},{flags:"--project",argument:"<path>",description:"Filter by project path"},{flags:"--suspect",description:"Only denials that look like false positives"},{flags:"--all",description:"Include allow entries"},{flags:"--prune-legacy",description:"Permanently delete all legacy root-level logs; nested logs are untouched"},{flags:"--dry-run",description:"With --prune-legacy, report what would be deleted and delete nothing"},{flags:"--json",description:"Output entries as JSON"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net logs --id 3fa9c2d1a70e8b42","cc-safety-net logs --agent claude-code","cc-safety-net logs --project . --since 7","cc-safety-net logs --suspect --since 7","cc-safety-net logs --json","cc-safety-net logs --prune-legacy --dry-run","cc-safety-net logs --prune-legacy"]};var T2={name:"rule",description:"Manage CC Safety Net rule config and rulebook sources",usage:"rule <subcommand>",subcommands:[{usage:"init [--example]",description:"Create inert rule config"},{usage:"add <source>",description:"Add a rulebook source and sync"},{usage:"remove <source>",description:"Remove a rulebook source and sync"},{usage:"update [source]",description:"Refresh rulebook lock/cache state"},{usage:"sync",description:"Sync configured rulebooks"},{usage:"list",description:"List active rulebooks"},{usage:"wrapper add <command>",description:"Trust a transparent command wrapper"},{usage:"wrapper remove <command>",description:"Remove a transparent command wrapper"},{usage:"wrapper list",description:"List transparent command wrappers"},{usage:"migrate [--cleanup]",description:"Migrate legacy inline rules"},{usage:"doc",description:"Print the rulebook authoring guide"},{usage:"verify",description:"Validate rule config files"}],options:[{flags:"-g, --global",description:"Use user-scope rule config"},{flags:"--check",description:"Check without changing lock/cache state"},{flags:"--cleanup",description:"Delete legacy files after rule migrate verifies them"},{flags:"--delete-source",description:"Delete clean local source directory on remove"},{flags:"--example",description:"Create an inactive example rulebook with rule init"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net rule init","cc-safety-net rule init --example","cc-safety-net rule wrapper add rtk","cc-safety-net rule add project-rules","cc-safety-net rule sync","cc-safety-net rule migrate --cleanup","cc-safety-net rule verify"]};var E1={name:"status",description:"Show what the runtime is enforcing right now",usage:"status",options:[{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net status"]};var P1={name:"statusline",description:"Print status line with mode indicators for shell integration",usage:"statusline --claude-code",options:[{flags:"-cc, --claude-code",description:"Print status line for Claude Code"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net statusline -cc","cc-safety-net statusline --claude-code"]};var I1=[E1,b1,_1,f1,T2,C1,T1,O1,U1,y1,P1];function qd(n){return n.aliases??[]}function jd(n){return!n.hidden}function Un(n){let t=n.toLowerCase();return I1.find((r)=>r.name.toLowerCase()===t||qd(r).some((e)=>e.toLowerCase()===t))}function N1(){return I1.filter(jd)}import{readFileSync as zd}from"node:fs";import{basename as Fd}from"node:path";function Cn(n=7,t=L2()){let r=Date.now()-n*24*60*60*1000,e=[],a=new Set,l=0,s,d,c,L;if(t)g2(t);let i={count:0},u=t?b2(t,i):[];for(let p of u)try{let v=zd(p,"utf-8").trim().split(`
`).filter(Boolean);for(let h of v)try{let w=JSON.parse(h);if(w.decision==="allow")continue;let $=new Date(w.ts).getTime();if($>=r){if(l++,a.add(w.sessionId??Fd(p,".jsonl")),d===void 0||$<=d)s=w.ts,d=$;if(L===void 0||$>L)c=w.ts,L=$;Bd(e,w,$)}}catch{i.count++}}catch{i.count++}let o=e.map((p)=>({timestamp:p.ts,command:p.command,reason:p.reason,relativeTime:Qt(new Date(p.ts))}));return{totalBlocked:l,sessionCount:a.size,recentEntries:o,oldestEntry:s,newestEntry:c,unreadable:i.count}}function Bd(n,t,r){let e=n.findIndex((a)=>r>new Date(a.ts).getTime());if(e===-1){if(n.length<3)n.push(t);return}if(n.splice(e,0,t),n.length>3)n.pop()}import{dirname as Jd}from"node:path";function na(n,t,r,e,a){let l;try{if(m(e)===null)return{path:n,exists:!1,valid:!1,ruleCount:0};l=s2(e),l.errors.push(...d2(n,t,{userConfigDir:r},a))}catch(s){if(!(s instanceof X))throw s;l={errors:[s.message],ruleNames:new Set}}return{path:n,exists:!0,valid:l.errors.length===0,ruleCount:l.ruleNames.size,...l.errors.length>0?{errors:l.errors}:{}}}function Zd(n,t){return{source:t,name:n.name,command:n.command,subcommand:n.subcommand,blockArgs:[...n.block_args],reason:n.reason}}function ta(n,t){let r=t?.userConfigPath??I(),e=t?.projectConfigPath??P(n),a=Jd(r),l=f2({cwd:n,userConfigPath:r,projectConfigPath:e,userConfigDir:a}),s=N({cwd:n,userConfigPath:r,projectConfigPath:e,userConfigDir:a}),d=new Map(l.rulebooks.flatMap((c)=>c.rules.map((L)=>[L,c.source])));return{userConfig:na(r,K2({userConfigPath:r}),a,s.userConfigTarget,s.userScope),projectConfig:na(e,V2(e),a,s.projectConfigTarget,s.projectScope),effectiveRules:l.rules.map((c)=>Zd(c,d.get(c.name)??"project")),shadowedRules:[]}}var Qd=[{flag:k.level,description:"Safety level preset: standard, strict, or paranoid",defaultBehavior:"standard"},{flag:k.strict,description:"Legacy; equivalent to safety.overrides.fail_closed",defaultBehavior:"permissive"},{flag:k.paranoid,description:"Legacy; equivalent to safety.overrides.paranoid_rm and paranoid_interpreters",defaultBehavior:"off"},{flag:k.paranoidRm,description:"Legacy; equivalent to safety.overrides.paranoid_rm",defaultBehavior:"off"},{flag:k.paranoidInterpreters,description:"Legacy; equivalent to safety.overrides.paranoid_interpreters",defaultBehavior:"off"},{flag:k.worktree,description:"Allow local git discards in linked worktrees",defaultBehavior:"off"},{flag:k.debug,description:"Print diagnostic messages to stderr",defaultBehavior:"off"},{flag:k.auditScope,description:"Command decisions recorded: all, or blocked (privacy-minimizing, denials only)",defaultBehavior:"all"}];function ra(){return[...Qd.map((n)=>({name:n.flag.name,value:ar(n.flag),isSet:lr(n.flag),legacyName:n.flag.legacyName,legacyValue:n.flag.legacyName?process.env[n.flag.legacyName]:void 0,legacyIsSet:n.flag.legacyName?process.env[n.flag.legacyName]!==void 0:void 0,description:n.description,defaultBehavior:n.defaultBehavior})),{name:"CC_SAFETY_NET_HOME",value:process.env.CC_SAFETY_NET_HOME,isSet:process.env.CC_SAFETY_NET_HOME!==void 0,description:"Override user-scope config/cache directory",defaultBehavior:"~/.cc-safety-net"}]}var ea={error:0,warning:1,info:2},Xd=["policy","config","audit"];function Yd(n){return n.map((t)=>{if(t==="ownership")return"is not owned by the current user";if(t==="permissions")return"has unsafe permissions";if(t==="symlink")return"is a symbolic link";return"is not a directory"}).join(" and ")}var Sd=[{derive:(n)=>n.hooks.length>0&&n.hooks.every((t)=>!t.configured)?[{checkId:"integration.none-configured",severity:"error",title:"No integration configured",detail:"CC Safety Net is not connected to any supported coding-agent integration.",fixHint:"Run `cc-safety-net install` and configure at least one integration."}]:[]},{derive:(n)=>n.hooks.filter((t)=>t.inspectionStatus==="failed").map((t)=>{let r=j(t.platform);return{checkId:"integration.inspection-failed",severity:"error",title:`${r} inspection failed`,detail:`Doctor could not verify the ${r} integration configuration.`,fixHint:`Correct the reported ${r} configuration error, then run \`cc-safety-net doctor\` again.`,integration:t.platform}})},{derive:(n)=>n.userConfig.exists&&!n.userConfig.valid?[{checkId:"config.user-invalid",severity:"error",title:"User configuration is invalid",detail:"Doctor could not load a valid user rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:n.userConfig.path}]:[]},{derive:(n)=>n.projectConfig.exists&&!n.projectConfig.valid?[{checkId:"config.project-invalid",severity:"error",title:"Project configuration is invalid",detail:"Doctor could not load a valid project rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:n.projectConfig.path}]:[]},{derive:(n)=>n.configState.state==="degraded"?[{checkId:"config.runtime-degraded",severity:"warning",title:"Runtime is enforcing a fallback configuration",detail:`The rejected candidate configuration is not active: ${n.configState.reason}`,fixHint:"Correct the named source, run `cc-safety-net rule sync` for a rule source, then rerun doctor."}]:[]},{derive:(n)=>{let t=n.environment.find((r)=>r.name==="CC_SAFETY_NET_AUDIT_SCOPE");return er(t?.value)==="invalid"?[{checkId:"environment.audit-scope-invalid",severity:"warning",title:"Audit scope value is invalid",detail:"CC_SAFETY_NET_AUDIT_SCOPE is not `all` or `blocked`, so allowed command decisions are not recorded.",fixHint:"Set CC_SAFETY_NET_AUDIT_SCOPE to `all` or `blocked`, then restart the integration."}]:[]}},...Xd.map((n)=>({derive:(t)=>t.posture.directories.filter((r)=>r.kind===n&&r.status==="unsafe").map((r)=>({checkId:`posture.${n}-directory-unsafe`,severity:"error",title:`${n[0]?.toUpperCase()}${n.slice(1)} directory is unsafe`,detail:`The ${n} directory ${Yd(r.issues)}.`,fixHint:"Ensure this is a real directory owned by the current user with no group or other write access, then rerun doctor.",...r.path?{path:r.path}:{}}))})),{derive:(n)=>{let t=[...n.effectiveSafety.weakenedRuleOverrides].sort();return t.length>0?[{checkId:"posture.rule-overrides-weaken-preset",severity:"warning",title:"Rule overrides weaken the selected preset",detail:`Explicit overrides disable rules the resolved preset would enable: ${t.join(", ")}.`,fixHint:`Remove these \`off\` overrides or set them to \`on\`: ${t.join(", ")}.`}]:[]}}];function aa(n){return Sd.flatMap((t,r)=>t.derive(n).map((e,a)=>({finding:e,catalogOrder:r,occurrence:a}))).sort((t,r)=>ea[t.finding.severity]-ea[r.finding.severity]||t.catalogOrder-r.catalogOrder||t.occurrence-r.occurrence).map((t)=>t.finding)}function t2(){return Boolean(process.stdout.isTTY&&!process.env.NO_COLOR)}var Hd=(n)=>t2()?`\x1B[32m${n}\x1B[0m`:n,Rd=(n)=>t2()?`\x1B[33m${n}\x1B[0m`:n,Wd=(n)=>t2()?`\x1B[34m${n}\x1B[0m`:n,Ad=(n)=>t2()?`\x1B[35m${n}\x1B[0m`:n,Kd=(n)=>t2()?`\x1B[36m${n}\x1B[0m`:n,Vd=(n)=>t2()?`\x1B[31m${n}\x1B[0m`:n,Md=(n)=>t2()?`\x1B[2m${n}\x1B[0m`:n,Gd=(n)=>t2()?`\x1B[1m${n}\x1B[0m`:n,b={green:Hd,yellow:Rd,blue:Wd,magenta:Ad,cyan:Kd,red:Vd,dim:Md,bold:Gd},Ud="\x1B[0m",Cd=[39,82,198,226,208,51,196,46,201,214,93,154,220,27,49,190,200,33,129,227,45,160,63,118,123,202];function Od(n){let t=n;return()=>{return t=(t*1664525+1013904223)%4294967296,t/4294967296}}function Td(n){let t=[...Cd],r=Od(n);for(let e=t.length-1;e>0;e--){let a=Math.floor(r()*(e+1)),l=t[e];t[e]=t[a],t[a]=l}return t}function _d(n,t=0){if(!t2())return"";let r=Td(t);return`\x1B[38;5;${r[n%r.length]}m`}function la(n,t,r=0){if(!t2())return`"${n}"`;return`${_d(t,r)}"${n}"${Ud}`}var Ed=new RegExp("\x1B\\[[0-9;]*m","g"),or=(n)=>n.replace(Ed,"").length;function j2(n){let t=(n.headers??n.rows[0]??[]).map((s,d)=>{let c=Math.max(...n.rows.map((L)=>or(L[d]??"")));return Math.max(or(s),c)}),r=(s,d)=>s+" ".repeat(Math.max(0,d-or(s))),e=(s,d)=>d[0]+t.map((c)=>s.repeat(c+2)).join(d[1])+d[2],a=(s)=>`│ ${s.map((d,c)=>r(d,t[c]??0)).join(" │ ")} │`,l=n.headers?[`   ${a(n.headers)}`,`   ${e("─",["├","┼","┤"])}`]:[];return[`   ${e("─",["┌","┬","┐"])}`,...l,...n.rows.map((s)=>`   ${a(s)}`),`   ${e("─",["└","┴","┘"])}`].join(`
`)}function sa(n){let t=[];t.push("Hook Integration"),t.push(Pd(n));let r=[],e=[];for(let a of n){let l=j(a.platform);if(a.errors&&a.errors.length>0)for(let s of a.errors)if(a.configured)r.push({platform:l,message:s});else e.push({platform:l,message:s})}for(let a of r)t.push(`   Warning (${a.platform}): ${a.message}`);for(let a of e)t.push(b.red(`   Error (${a.platform}): ${a.message}`));return t.join(`
`)}function Pd(n){let t=["Platform","Discovery","Configuration","Inspection"],r=n.map((e)=>{let a=j(e.platform);if(e.inspectionStatus==="not-inspected"){let c=b.dim("Not inspected");return[a,c,c,c]}let l=e.detected?b.green("Detected"):e.inspectionStatus==="failed"?b.red("Unknown"):b.dim("Not detected"),s=e.configured?b.green("Configured"):e.detected?b.yellow("Not configured"):e.inspectionStatus==="failed"?b.red("Unknown"):b.dim("Not applicable"),d=e.inspectionStatus==="verified"?b.green("Verified"):e.inspectionStatus==="failed"?b.red("Failed"):b.dim("Not applicable");return[a,l,s,d]});return j2({headers:t,rows:r})}function da(n){let r=["Guard Engine Verification",`   Synthetic self-test: ${n.failed>0?b.red(`${n.passed}/${n.total} FAIL`):b.green(`${n.passed}/${n.total} passed`)}`],e=n.results.filter((a)=>!a.passed);if(e.length>0){r.push(""),r.push(b.red("   Failures:"));for(let a of e)r.push(b.red(`   • ${a.description}`)),r.push(b.red(`     expected ${a.expected}, got ${a.actual}`))}return r.join(`
`)}function Id(n){if(n.length===0)return"   (no custom rules)";let t=["Source","Name","Command","Block Args"],r=n.map((e)=>[e.source,e.name,e.subcommand?`${e.command} ${e.subcommand}`:e.command,e.blockArgs.join(", ")]);return j2({headers:t,rows:r})}function ca(n){let t=[];if(t.push("Configuration"),t.push(Nd(n.userConfig,n.projectConfig)),t.push(""),n.effectiveRules.length>0)t.push(`   Effective rules (${n.effectiveRules.length} total):`),t.push(Id(n.effectiveRules));else t.push("   Effective rules: (none - using built-in rules only)");for(let r of n.shadowedRules)t.push(""),t.push(`   Note: Project rule "${r.name}" shadows user rule with same name`);return t.join(`
`)}function Nd(n,t){let r=["Scope","Status"],e=(l)=>{if(!l.exists)return b.dim("N/A");if(!l.valid)return b.red(`Invalid (${l.errors?.[0]??"unknown error"})`);return b.green("Configured")},a=[["User",e(n)],["Project",e(t)]];return j2({headers:r,rows:a})}function La(n){let t=[];return t.push("Environment"),t.push(nc(n)),t.join(`
`)}function ia(n){let t=["Effective Safety",`   Selected preset: ${n.effectiveSafety.selectedPreset}`,`   Effective: ${n.effectiveSafety.level}`],r=[["fail_closed","fail_closed"],["paranoid_rm","paranoid_rm"],["paranoid_interpreters","paranoid_interpreters"]];for(let[e,a]of r){let l=n.effectiveSafety.capabilities[e],s=l.enabled?b.green("ON"):b.dim("OFF"),d=l.sources.length>0?` (${l.sources.join(", ")})`:"";t.push(`   ${a}: ${s} via ${l.source}${d}`)}t.push(`   Stored rule customizations: ${n.effectiveSafety.ruleCounts.stored}`),t.push(`   Effective rule customizations: ${n.effectiveSafety.ruleCounts.effective}`);for(let[e,a]of Object.entries(n.effectiveSafety.ruleOverrides))t.push(`   ${e}: ${a}`);return t.join(`
`)}function pa(n){let t=["Findings"];if(n.length===0)return t.push("   No findings from inspected doctor facts."),t.join(`
`);for(let r of n){let e=`[${r.severity.toUpperCase()}] ${r.checkId}: ${J(r.title)}`,a=r.severity==="error"?b.red:r.severity==="warning"?b.yellow:b.blue;if(t.push(`   ${a(e)}`),t.push(`      ${J(r.detail)}`),r.path)t.push(`      Path: ${J(r.path)}`);if(r.fixHint)t.push(`      Fix: ${J(r.fixHint)}`)}return t.join(`
`)}function nc(n){let t=["Variable","Status","Legacy"],r=n.map((e)=>{let a=e.isSet?b.green("✓"):b.dim("✗"),l=e.legacyName&&e.legacyIsSet?`${e.legacyName} ${b.green("✓")}`:e.legacyName??"";return[e.name,a,l]});return j2({headers:t,rows:r})}function ua(n){let t=[];if(n.totalBlocked===0)t.push("Recent Activity"),t.push("   No blocked commands in the last 7 days"),t.push("   Tip: This is normal for new installations");else t.push(`Recent Activity · last 7 days (${n.totalBlocked} blocked / ${n.sessionCount} sessions)`),t.push(tc(n.recentEntries));if(n.unreadable>0)t.push(`   Warning: ${n.unreadable} audit log ${n.unreadable===1?"source":"sources"} could not be read; this summary is incomplete`);return t.join(`
`)}function tc(n){let t=["Time","Command"],r=n.map((e)=>{let a=J(e.command.replace(/\r\n|\r|\n/g," ↵ ").replace(/\t/g," ")),l=a.length>40?`${a.slice(0,37)}...`:a;return[e.relativeTime,l]});return j2({headers:t,rows:r})}function va(n){let t=[];if(t.push("Update Check"),n.latestVersion===null&&!n.error)return t.push(On([["Status",b.dim("Skipped")],["Installed",n.currentVersion]])),t.join(`
`);if(n.error)return t.push(On([["Status",`${b.yellow("⚠")} Error`],["Installed",n.currentVersion],["Error",b.dim(n.error)]])),t.join(`
`);if(n.updateAvailable)return t.push(On([["Status",`${b.yellow("⚠")} Update Available`],["Current",n.currentVersion],["Latest",b.green(n.latestVersion??"")]])),t.push(""),t.push("   Run: bunx cc-safety-net@latest doctor"),t.push("   Or:  npx cc-safety-net@latest doctor"),t.join(`
`);return t.push(On([["Status",`${b.green("✓")} Up to date`],["Version",n.currentVersion]])),t.join(`
`)}function On(n){return j2({rows:n})}function oa(n){let t=[];return t.push("System Info"),t.push(rc(n)),t.join(`
`)}function rc(n){let t=["Component","Version"],r=(l)=>{if(l===null)return b.dim("not found");return l},a=[{label:"cc-safety-net",value:n.version},...Gn.map((l)=>({label:j(l),value:n.versions[l]??null})),{label:"Node.js",value:n.nodeVersion},{label:"npm",value:n.npmVersion},{label:"Bun",value:n.bunVersion},{label:"Platform",value:n.platform}].map((l)=>[l.label,r(l.value)]);return j2({headers:t,rows:a})}function ba(n){if(n.findings.length===0)return b.green(`
No findings from inspected doctor facts.`);let t={error:n.findings.filter((l)=>l.severity==="error").length,warning:n.findings.filter((l)=>l.severity==="warning").length,info:n.findings.filter((l)=>l.severity==="info").length},r=["error","warning","info"].filter((l)=>t[l]>0).map((l)=>`${t[l]} ${l}`),e=n.findings.length===1?"finding":"findings",a=`
${n.findings.length} ${e}: ${r.join(", ")}.`;if(t.error>0)return b.red(a);if(t.warning>0)return b.yellow(a);return b.blue(a)}import{lstatSync as ec}from"node:fs";import{dirname as br}from"node:path";function fr(n,t){try{let r=ec(t);if(r.isSymbolicLink())return{kind:n,path:t,status:"unsafe",issues:["symlink"]};if(!r.isDirectory())return{kind:n,path:t,status:"unsafe",issues:["not-directory"]};if(process.platform==="win32"||typeof process.getuid!=="function")return{kind:n,path:t,status:"unknown",issues:[]};let e=[...r.uid!==process.getuid()?["ownership"]:[],...(r.mode&18)!==0?["permissions"]:[]];return{kind:n,path:t,status:e.length>0?"unsafe":"safe",issues:e}}catch(r){if(typeof r==="object"&&r!==null&&"code"in r&&r.code==="ENOENT")return{kind:n,path:t,status:"not-applicable",issues:[]};return{kind:n,path:t,status:"unknown",issues:[]}}}function fa(n){let t=L2();return{directories:[fr("policy",br(br(n))),fr("config",br(n)),...t?[fr("audit",t)]:[{kind:"audit",status:"unknown",issues:[]}]]}}import{spawn as ac}from"node:child_process";import{existsSync as ya}from"node:fs";import{delimiter as lc,extname as sc,join as dc}from"node:path";import{stripVTControlCharacters as ha}from"node:util";var xa="2.0.6",cc=5000,Lc="_CC_SAFETY_NET_TEST_SPAWN_PLATFORM";function F(){return xa}function yr(n,t){let r=n[t];if(r)return r;let e=Object.keys(n).find((a)=>a.toLowerCase()===t.toLowerCase()&&!!n[a]);return e?n[e]:r}function ic(n){return(yr(n,"PATHEXT")||".COM;.EXE;.BAT;.CMD").split(";").filter((t)=>t.length>0)}function pc(n,t){let r=sc(n)?[n]:[...ic(t).map((e)=>`${n}${e}`),n];if(n.includes("/")||n.includes("\\"))return r.find((e)=>ya(e))??n;return(yr(t,"PATH")??"").split(lc).flatMap((e)=>r.map((a)=>dc(e,a))).find((e)=>ya(e))??n}function wa(n){if(!/[\s"&|<>^]/.test(n))return n;return`"${n.replace(/"/g,'""')}"`}function y2(n,t){let[r,...e]=n,a=t[Lc]==="win32"?"win32":process.platform;if(!r||a!=="win32")return{cmd:r??"",args:e};let l=pc(r,t);if(!/\.(?:bat|cmd)$/i.test(l))return{cmd:l,args:e};return{cmd:yr(t,"COMSPEC")??"cmd.exe",args:["/d","/c",["call",wa(l),...e.map(wa)].join(" ")]}}var _2=async(n,t=cc)=>{let r=await uc(n,{timeoutMs:t});if(r.code!==0)return null;return ha(r.stdout).trim()||ha(r.stderr).trim()||null};function uc(n,t){let[r,...e]=n;if(!r)return Promise.resolve({code:null,stdout:"",stderr:""});return new Promise((a)=>{try{let l=y2([r,...e],process.env),s=ac(l.cmd,l.args,{stdio:["ignore","pipe","pipe"]}),d=!1,c="",L="";s.stdout.on("data",(o)=>{c+=o.toString()}),s.stderr.on("data",(o)=>{L+=o.toString()});let i=(o)=>{if(d)return;d=!0,clearTimeout(u),a(o)},u=setTimeout(()=>{s.kill(),i({code:null,stdout:c,stderr:L})},t.timeoutMs);s.on("close",(o)=>{i({code:o,stdout:c,stderr:L})}),s.on("error",()=>{i({code:null,stdout:c,stderr:L})})}catch{a({code:null,stdout:"",stderr:""})}})}function Tn(n){if(!n)return null;let t=/Claude Code\s+(\d+\.\d+\.\d+)/i.exec(n);if(t)return t[1]??null;let r=/v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i.exec(n);if(r)return r[1]??null;return n.split(`
`)[0]?.trim()||null}async function xn(n=_2){let[t,r,e,a,l,s]=await Promise.all([Promise.all(M.map(async(d)=>[d.id,Tn(await n([...d.probeCommand]))])),n(["codex","plugin","list"],30000),n(["amp","plugins","list"],30000),n(["node","--version"]),n(["npm","--version"]),n(["bun","--version"])]);return{version:xa,versions:Object.fromEntries(t),codexPluginListOutput:r,ampPluginListOutput:e,nodeVersion:Tn(a),npmVersion:Tn(l),bunVersion:Tn(s),platform:`${process.platform} ${process.arch}`}}function hr(n,t){if(t==="dev")return!1;let r=n.split(".").map(Number),e=t.split(".").map(Number),[a=0,l=0,s=0]=r,[d=0,c=0,L=0]=e;if(a!==d)return a>d;if(l!==c)return l>c;return s>L}async function E2(){let n=F(),t=new AbortController,r=setTimeout(()=>t.abort(),3000);try{let e=await fetch("https://registry.npmjs.org/cc-safety-net/latest",{signal:t.signal});if(!e.ok)return{currentVersion:n,latestVersion:null,updateAvailable:!1,error:`npm registry returned ${e.status}`};let a=await e.json(),l=hr(a.version,n);return{currentVersion:n,latestVersion:a.version,updateAvailable:l}}catch(e){return{currentVersion:n,latestVersion:null,updateAvailable:!1,error:e instanceof Error?e.message:"Network error"}}finally{clearTimeout(r)}}import*as za from"node:readline";var Da=(n)=>`\x1B[${n}B`,vc=(n)=>`\x1B[${n}A`;var $a=["░","▒","▓","╱","╲","┃","━","┏","┓","┗","┛","╋"];function oc(n){return new Promise((t)=>setTimeout(t,n))}function bc(n,t,r){if(!r)return t(n);if(r.aborted)return Promise.resolve();return new Promise((e,a)=>{let l=()=>r.removeEventListener("abort",s),s=()=>{l(),e()};r.addEventListener("abort",s,{once:!0}),t(n).then(()=>{l(),e()},(d)=>{l(),a(d)})})}function $n(n,t){return n&&n>0?n:t}function _n(n){return Math.max(0,Math.min(1,n))}function P2(n){return Math.max(0,Math.min(255,Math.round(n)))}function wr(n){return n<=0.0031308?12.92*n:1.055*n**0.4166666666666667-0.055}function fc(n,t,r){let e=r*Math.PI/180,a=t*Math.cos(e),l=t*Math.sin(e),s=(n+0.3963377774*a+0.2158037573*l)**3,d=(n-0.1055613458*a-0.0638541728*l)**3,c=(n-0.0894841775*a-1.291485548*l)**3;return{blue:P2(wr(_n(-0.0041960863*s-0.7034186147*d+1.707614701*c))*255),green:P2(wr(_n(-1.2684380046*s+2.6097574011*d-0.3413193965*c))*255),red:P2(wr(_n(4.0767416621*s-3.3077115913*d+0.2309699292*c))*255)}}function xr(n,t){let r=(t*n*180/Math.PI%360+360)%360;return fc(0.72,0.15,r)}function ka(n,t=0.1){let r=xr(t,n);return`\x1B[38;2;${r.red};${r.green};${r.blue}m`}function yc(n,t){return{blue:P2(n.blue+(255-n.blue)*t),green:P2(n.green+(255-n.green)*t),red:P2(n.red+(255-n.red)*t)}}function qa(n,t,r){let e=Math.imul(n+2654435769,2246822507)^Math.imul(t+3266489909,668265263)^Math.imul(r+374761393,2654435761),a=e^e>>>15,l=Math.imul(a,739982445),s=l^l>>>12,d=Math.imul(s,695872825);return((d^d>>>15)>>>0)/4294967296}function hc(n,t,r){let e=Math.floor(qa(n,t,r)*$a.length);return $a[e]??"░"}function ma(n){let t=_n(n);return t*t*t*(t*(t*6-15)+10)}function wc(n){if(n.length===0)return"";let t=[],r=!1,e="";for(let a of n){let l=`${a.red};${a.green};${a.blue}`;if(a.bold!==r)t.push(a.bold?"\x1B[1m":"\x1B[22m"),r=a.bold;if(l!==e)t.push(`\x1B[38;2;${l}m`),e=l;t.push(a.character)}return`${t.join("")}\x1B[22m\x1B[39m`}function xc(n,t,r,e,a){return n.map((l,s)=>({...xr(r,e+t+s/a),bold:!1,character:l}))}function $c(n,t,r,e,a,l,s,d){let c=Math.max(1,e*0.75),L=Math.min(1,r/c),i=a*ma(L),u=Math.max(0,(r-c)/Math.max(1,e-c)),o=(1-ma(r/e))*d*2,p=0.35*Math.max(0,1-u*2),f=L>=1,v=Math.min(n.length,Math.ceil(i+2+1));return n.slice(0,v).map((h,w)=>{let $=xr(l,s+t+w/d+o),y=w+qa(t,w,7919)*2-1;if(y>i+2)return{...$,bold:!1,character:" "};let g=i-y,S=0.8*Math.exp(-(g*g)/12.5),o2=Math.min(0.9,S+p),Jt=!f&&y>i-4;return{...yc($,o2),bold:o2>0.3,character:Jt?hc(t,w,r):h}})}function ga(n){return`\x1B[?2026h${n.map((t,r)=>`\x1B8${r>0?Da(r):""}${wc(t)}`).join("")}\x1B[?2026l`}async function $r(n,t={}){if(!n)return;let r=t.output??process.stdout,e=t.sleep??oc,a=$n(t.frequency,0.1),l=t.seed??0,s=$n(t.speed,40),d=$n(t.spread,3),c=$n(t.frameRate,60),L=Math.max(1,Math.floor($n(t.duration,12))),i=n.split(`
`).map((v)=>Array.from(v)),u=Math.max(...i.map((v)=>v.length)),o=1000*L*i.filter((v)=>v.length>0).length/s,p=u>0?Math.max(1,Math.ceil(o/(1000/c))):0,f=p>0?o/p:0;r.write(`\x1B[?25l${i.length>1?`${`
`.repeat(i.length-1)}${vc(i.length-1)}`:""}\x1B7`);try{for(let v=1;v<=p;v+=1){if(t.signal?.aborted)break;r.write(ga(i.map((h,w)=>$c(h,w,v,p,u,a,l,d)))),await bc(f,e,t.signal)}}finally{if(r.write(ga(i.map((v,h)=>xc(v,h,a,l,d)))),r.write("\x1B8"),i.length>1)r.write(Da(i.length-1));r.write(`
\x1B[0m\x1B[?25h`)}}var ja=["┏━┛┏━┛  ┏━┛┏━┃┏━┛┏━┛━┏┛┃ ┃  ┏━ ┏━┛━┏┛","┃  ┃    ━━┃┏━┃┏━┛┏━┛ ┃ ━┏┛  ┃ ┃┏━┛ ┃ ","━━┛━━┛  ━━┛┛ ┛┛  ━━┛ ┛  ┛   ┛ ┛━━┛ ┛ "].join(`
`);function mc(n){return Boolean(n.isTTY)}async function mn(n={}){let t=n.output??process.stdout;if(!mc(t))return;let r=n.input??process.stdin,e={duration:n.duration,frequency:n.frequency,output:t,seed:n.seed??Math.random()*8192,sleep:n.sleep,speed:n.speed,spread:n.spread};if(!r.isTTY||typeof r.setRawMode!=="function"){await $r(ja,e);return}let a=new AbortController,l=r.readableFlowing===!0,s=r.isRaw===!0,d=!1,c=(L,i)=>{if(i.ctrl&&i.name==="c")d=!0;if(d||i.name==="return"||i.name==="enter")a.abort()};za.emitKeypressEvents(r),r.on("keypress",c),r.setRawMode(!0),r.resume();try{await $r(ja,{...e,signal:a.signal})}finally{if(r.off("keypress",c),r.setRawMode(s),!l)r.pause()}if(!d)return;if(n.onInterrupt){n.onInterrupt();return}process.kill(process.pid,"SIGINT")}var Fa="\r\x1B[2K",gc="\x1B[?25l",Dc="\x1B[39m",kc="\x1B[?25h",qc=100,jc=0.55,zc=80,Ba=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function Fc(n){return new Promise((t)=>setTimeout(t,n))}async function En(n,t={}){let r=t.output??process.stdout;if(!r.isTTY)return n;let e=t.sleep??Fc,a=!1,l=n.then((d)=>{return a=!0,d},(d)=>{throw a=!0,d});if(await Promise.race([l.then(()=>!0),e(qc).then(()=>!1)]))return l;r.write(gc);try{for(let d=0;!a;d+=1)r.write(`${Fa}${ka(d*jc)}${Ba[d%Ba.length]}${Dc} ${t.loadingMessage??"Loading…"}`),await Promise.race([l,e(zc)]);return await l}finally{r.write(`${Fa}${kc}`)}}async function gn(n,t,r,e={}){let a=t();if(n)await r();if(n&&a.ready)await En(a.ready,e);return a.finish()}import{homedir as PL}from"node:os";import{stripVTControlCharacters as Bc}from"node:util";var Pn="amp plugins list",Jc=/^\s*[✓✗]\s+cc-safety-net(?:\.ts)?\s+\(User Plugins\)\s+(\S+)\s*$/;function Ja(n){if(!n.ampPluginListOutput)return{platform:"amp",status:"n/a"};let t=Bc(n.ampPluginListOutput).split(`
`).map((r)=>Jc.exec(r)?.[1]).find((r)=>r!==void 0);if(!t)return{platform:"amp",status:"n/a"};if(t!=="active")return{platform:"amp",status:"disabled",method:Pn,configPath:Pn,errors:[`Amp personal plugin cc-safety-net is ${t}; run "plugins: reload" in Amp or reinstall with install --amp`]};return{platform:"amp",status:"configured",method:Pn,configPath:Pn}}import{existsSync as Qc,readFileSync as Xc}from"node:fs";import{join as Zc}from"node:path";function Dn(n){return Zc(n,".gemini","config","hooks.json")}var Yc=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/;function Sc(n){if(!n||typeof n!=="object"||Array.isArray(n))return[];return Object.values(n).flatMap((t)=>{if(!t||typeof t!=="object"||Array.isArray(t))return[];let r=t,e=r.PreToolUse;if(!Array.isArray(e))return[];return e.flatMap((a)=>{if(!a||typeof a!=="object"||Array.isArray(a))return[];let l=a.hooks;if(!Array.isArray(l))return[];return l.flatMap((s)=>{if(!s||typeof s!=="object"||Array.isArray(s))return[];let d=s.command;if(typeof d!=="string"||!Yc.test(d))return[];return[{command:d,enabled:r.enabled!==!1}]})})})}function Za(n){let t=Dn(n.homeDir);if(!Qc(t))return{platform:"antigravity-cli",status:"n/a",configPath:t};let r;try{r=Sc(JSON.parse(Xc(t,"utf-8")))}catch(e){return{platform:"antigravity-cli",status:"n/a",configPath:t,errors:[`Failed to parse Antigravity hooks config ${t}: ${e instanceof Error?e.message:String(e)}`]}}if(r.some((e)=>e.enabled))return{platform:"antigravity-cli",status:"configured",method:"hook config",configPath:t};if(r.length>0)return{platform:"antigravity-cli",status:"disabled",method:"hook config",configPath:t};return{platform:"antigravity-cli",status:"n/a",configPath:t}}import{join as Qa}from"node:path";import{existsSync as Hc,lstatSync as Rc,readFileSync as Wc}from"node:fs";function r2(n,t=(r)=>r){if(!Hc(n))return{kind:"missing"};try{return{kind:"ok",value:JSON.parse(t(Wc(n,"utf-8")))}}catch{return{kind:"unreadable"}}}function W(n){try{return Rc(n)}catch{return}}function In(n,t){let r=W(t);if(!r)return{platform:n,status:"n/a",configPath:t};if(!r.isSymbolicLink()&&r.isDirectory())return;return{platform:n,status:"n/a",configPath:t,errors:[`${t} is a symlink or not a directory; move or remove it before installing`]}}function x(n,t){return typeof n==="object"&&n!==null?n[t]:void 0}var mr="cc-safety-net@cc-marketplace";function Xa(n){return Qa(n,".claude","plugins","installed_plugins.json")}function Ya(n,t){let r=x(x(n,"plugins"),t);return Array.isArray(r)&&r.length>0}function Nn(n,t){let r=r2(Xa(n));return r.kind==="ok"&&Ya(r.value,t)}function gr(n){let t=Xa(n),r=r2(t);if(r.kind==="unreadable")return{platform:"claude-code",status:"not-inspected"};if(r.kind==="missing")return{platform:"claude-code",status:"n/a"};if(!Ya(r.value,mr))return{platform:"claude-code",status:"n/a"};let e=Qa(n,".claude","settings.json"),a=r2(e);if(a.kind==="unreadable")return{platform:"claude-code",status:"not-inspected"};if(!(a.kind==="ok"&&x(x(a.value,"enabledPlugins"),mr)===!0))return{platform:"claude-code",status:"disabled",method:"plugin config",configPath:e,errors:[`${mr} is installed but not enabled in Claude Code`]};return{platform:"claude-code",status:"configured",method:"plugin config",configPath:t}}function Sa(n){return gr(n.homeDir)}function Ha(n){if(!n.codexPluginListOutput)return{platform:"codex",status:"n/a"};let t=n.codexPluginListOutput.split(`
`).find((r)=>r.includes("https://github.com/kenryu42/cc-safety-net.git"));if(!t)return{platform:"codex",status:"n/a"};if(!t.includes("installed,"))return{platform:"codex",status:"n/a"};if(!t.includes("installed, enabled"))return{platform:"codex",status:"disabled",method:"codex plugin list",configPath:"codex plugin list",errors:["Codex plugin line for https://github.com/kenryu42/cc-safety-net.git must contain installed, enabled."]};return{platform:"codex",status:"configured",method:"codex plugin list",configPath:"codex plugin list"}}import{existsSync as rt,readdirSync as Ac,readFileSync as Kc}from"node:fs";import{join as Y}from"node:path";var e2="cc-safety-net@cc-marketplace",nt=["cc-marketplace","cc-safety-net"],Ra=["_direct","copilot-safety-net"],Wa=["cc-marketplace","safety-net"],Aa="safety-net@cc-marketplace";function tt(n,t){let r=t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return new RegExp(`(^|[^a-z0-9-])${r}([^a-z0-9-]|$)`,"m").test(n??"")}function Ka(n){return tt(n,"cc-safety-net@cc-marketplace")}function Va(n){return tt(n,"cc-marketplace")}function Ma(n){return tt(n,"copilot-safety-net")}function Ga(n){return tt(n,"safety-net@cc-marketplace")}function V(n){let t="",r=0,e=!1,a=!1,l=-1;while(r<n.length){let s=n[r],d=n[r+1];if(a){t+=s,a=!1,r++;continue}if(s==='"'&&!e){e=!0,l=-1,t+=s,r++;continue}if(s==='"'&&e){e=!1,t+=s,r++;continue}if(s==="\\"&&e){a=!0,t+=s,r++;continue}if(e){t+=s,r++;continue}if(s==="/"&&d==="/"){while(r<n.length&&n[r]!==`
`)r++;continue}if(s==="/"&&d==="*"){r+=2;while(r<n.length-1){if(n[r]==="*"&&n[r+1]==="/"){r+=2;break}r++}continue}if(s===","){l=t.length,t+=s,r++;continue}if(s==="}"||s==="]"){if(l!==-1){let c=t.slice(l+1);if(/^\s*$/.test(c))t=t.slice(0,l)+c}l=-1,t+=s,r++;continue}if(!/\s/.test(s))l=-1;t+=s,r++}return t}function Dr(n){if(!n?.includes("cc-safety-net"))return!1;return/(^|\s)hook\s+(?:[^\s]+\s+)*(--copilot-cli|-cp)(\s|$)/.test(n)}function Ca(n,t){if(!n)return null;let r=n.match(/(\d+)\.(\d+)\.(\d+)/);if(!r)return null;let e=[Number(r[1]),Number(r[2]),Number(r[3])];for(let a=0;a<t.length;a++){let l=e[a]??0,s=t[a]??0;if(l!==s)return l>s}return!0}function Vc(n){return Ca(n,[0,0,422])}function Mc(n){return Ca(n,[1,0,8])}function kn(n){return process.env.COPILOT_HOME||Y(n,".copilot")}function kr(n){return(n.hooks?.preToolUse??[]).some((r)=>{if(r.type!=="command")return!1;return Dr(r.command)||Dr(r.bash)||Dr(r.powershell)})}function qr(n,t){try{return JSON.parse(V(Kc(n,"utf-8")))}catch(r){t?.push(`Failed to parse ${n}: ${r instanceof Error?r.message:String(r)}`);return}}function Oa(n,t){try{return Ac(n).filter((r)=>r.endsWith(".json")).sort((r,e)=>r.localeCompare(e))}catch(r){return t?.push(`Failed to read ${n}: ${r instanceof Error?r.message:String(r)}`),[]}}function Gc(n,t){if(!rt(n))return[];let r=[];for(let e of Oa(n,t)){let a=Y(n,e),l=qr(a,t);if(l&&kr(l))r.push(a)}return r}function I2(n,t){if(!rt(n))return;let r=qr(n,t);if(!r)return;return{path:n,config:r}}function Ua(n,t,r,e){if(t){n.push(`GitHub Copilot CLI ${t} does not support ${r}; requires ${e}+`);return}n.push(`GitHub Copilot CLI version unavailable; skipping ${r} because it requires ${e}+`)}function Uc(n){for(let t of n){if(t?.config.disableAllHooks===!0)return t.path;if(t?.config.disableAllHooks===!1)return}return}function Cc(n,t,r,e){let a=kn(n),l=Y(t,".github","hooks"),s=Y(a,"hooks"),d=Y(t,".github","copilot"),c=Y(t,".claude"),L=Mc(r),i=L===!0?e:void 0,u=[I2(Y(d,"settings.local.json"),i),I2(Y(d,"settings.json"),i),I2(Y(c,"settings.local.json"),i),I2(Y(c,"settings.json"),i)],o=[I2(Y(a,"settings.json"),i),I2(Y(a,"config.json"),i)];if(L!==!1){let g=Uc([...u,...o]);if(g){if(L===null)e.push(`GitHub Copilot CLI version unavailable; treating disableAllHooks in ${g} as active`);return{activeConfigPaths:[],disabledBy:g}}}let p=Gc(l,e),f=Vc(r),v=f===!0?e:void 0,h=rt(s)?Oa(s,v):[],w=[];for(let g of h){let S=Y(s,g),o2=qr(S,v);if(o2&&kr(o2))w.push(S)}if(f!==!0&&w.length>0)Ua(e,r,`user hook files in ${s}`,"0.0.422"),w.length=0;let $=[];for(let g of[...u,...o]){if(!g)continue;if(!kr(g.config))continue;if(L===!0){$.push(g);continue}Ua(e,r,"inline hook definitions in Copilot config files","1.0.8");break}let y=(g)=>g.filter((S)=>!!S&&$.includes(S)).map((S)=>S.path);return{activeConfigPaths:[...y(u),...p,...y(o),...w]}}function Ta(n){let t=[],r=Cc(n.homeDir,n.cwd,n.copilotCliVersion,t);if(r.disabledBy)return{platform:"copilot-cli",status:"disabled",method:"hook config",configPath:r.disabledBy,configPaths:[r.disabledBy],errors:t.length>0?t:void 0};let e=kn(n.homeDir),a=Y(e,"installed-plugins",...nt),l=rt(a),s=Y(e,"settings.json"),d=r2(s,V);if(l&&d.kind==="unreadable")return{platform:"copilot-cli",status:"not-inspected"};if(l&&d.kind==="ok"&&x(x(d.value,"enabledPlugins"),e2)===!1)return{platform:"copilot-cli",status:"disabled",method:"plugin config",configPath:s,errors:[`${e2} is installed but not enabled in Copilot CLI`]};if(l||r.activeConfigPaths.length>0){let c=l,L=r.activeConfigPaths[0];return{platform:"copilot-cli",status:"configured",method:c?"plugin config":"hook config",configPath:L??(c?a:void 0),configPaths:r.activeConfigPaths.length>0?r.activeConfigPaths:void 0,errors:t.length>0?t:void 0}}return{platform:"copilot-cli",status:"n/a",errors:t.length>0?t:void 0}}import{existsSync as rL,readFileSync as eL}from"node:fs";import{existsSync as _a,mkdirSync as _c,readFileSync as Ec}from"node:fs";import{dirname as Pc,join as Ic}from"node:path";import{renameSync as Oc,writeFileSync as Tc}from"node:fs";function Z(n,t){let r=`${n}.${process.pid}.tmp`;Tc(r,t),Oc(r,n)}var qn="npx -y cc-safety-net hook --cursor",Ea=30;function at(n){return Ic(n,".cursor","hooks.json")}function z2(n){return typeof n==="object"&&n!==null&&!Array.isArray(n)}function jr(){return{command:qn,timeout:Ea,failClosed:!0}}function et(n){return z2(n)&&n.command===qn}function Nc(n){return Object.keys(n).length===3&&n.command===qn&&n.timeout===Ea&&n.failClosed===!0}function nL(n){try{return JSON.parse(Ec(n,"utf-8"))}catch(t){if(t instanceof SyntaxError)throw Error(`Failed to parse Cursor hooks config ${n}: ${t.message}`);throw t}}function Pa(n){let t=nL(n);if(!z2(t))throw Error(`Cursor hooks config ${n} must be a JSON object`);if(t.version!==1)throw Error(`Cursor hooks config ${n} must set "version": 1`);if(t.hooks!==void 0&&!z2(t.hooks))throw Error(`Cursor hooks config ${n} "hooks" must be an object`);let r=z2(t.hooks)?t.hooks.preToolUse:void 0;if(r!==void 0&&!Array.isArray(r))throw Error(`Cursor hooks config ${n} "hooks.preToolUse" must be an array`);return t}function Ia(n){let t=z2(n.hooks)?n.hooks.preToolUse:void 0;return Array.isArray(t)?t:[]}function tL(n){if(!n.some(et))return[...n,jr()];return n.reduce((t,r)=>{if(!et(r))return t.result.push(r),t;if(!t.inserted)t.result.push(jr()),t.inserted=!0;return t},{result:[],inserted:!1}).result}function Na(n,t,r){let e=z2(t.hooks)?t.hooks:{},a={...t,hooks:{...e,preToolUse:r}};Z(n,`${JSON.stringify(a,null,2)}
`)}function n0(n){let t=at(n);if(!_a(t))return _c(Pc(t),{recursive:!0}),Z(t,`${JSON.stringify({version:1,hooks:{preToolUse:[jr()]}},null,2)}
`),{path:t,alreadyInstalled:!1};let r=Pa(t),e=Ia(r),a=e.filter(et);if(z2(r.hooks)&&Array.isArray(r.hooks.preToolUse)&&a.length===1&&a[0]!==void 0&&Nc(a[0]))return{path:t,alreadyInstalled:!0};return Na(t,r,tL(e)),{path:t,alreadyInstalled:!1}}function t0(n){let t=at(n);if(!_a(t))return{path:t,alreadyInstalled:!1};let r=Pa(t),e=Ia(r),a=e.filter((l)=>!et(l));if(a.length===e.length)return{path:t,alreadyInstalled:!1};return Na(t,r,a),{path:t,alreadyInstalled:!0}}function aL(n){if(!n||typeof n!=="object"||Array.isArray(n))return[];let t=n.hooks;if(!t||typeof t!=="object"||Array.isArray(t))return[];let r=t.preToolUse;if(!Array.isArray(r))return[];return r.filter((e)=>!!e&&typeof e==="object"&&!Array.isArray(e)&&e.command===qn)}function lL(n){let t=[];if(n.length>1)t.push("Multiple managed cc-safety-net hooks found; reinstall to collapse duplicates");let r=n[0];if(r&&r.failClosed!==!0)t.push('Managed hook is missing "failClosed": true; reinstall to repair');if(r&&r.timeout!==30)t.push('Managed hook "timeout" is not 30; reinstall to repair');return t}function r0(n){let t=at(n.homeDir);if(!rL(t))return{platform:"cursor",status:"n/a",configPath:t};let r;try{r=JSON.parse(eL(t,"utf-8"))}catch(l){return{platform:"cursor",status:"n/a",configPath:t,errors:[`Failed to parse Cursor hooks config ${t}: ${l instanceof Error?l.message:String(l)}`]}}let e=aL(r);if(e.length===0)return{platform:"cursor",status:"n/a",configPath:t};let a=lL(e);return{platform:"cursor",status:"configured",method:"hook config",configPath:t,errors:a.length>0?a:void 0}}import{existsSync as sL}from"node:fs";import{join as zr}from"node:path";var Fr="gemini-safety-net";function Br(n){let t=zr(n,".gemini","extensions"),r=zr(t,Fr);if(!sL(r))return{platform:"gemini-cli",status:"n/a"};let e=zr(t,"extension-enablement.json"),a=r2(e);if(a.kind==="unreadable")return{platform:"gemini-cli",status:"not-inspected"};let l=a.kind==="ok"?x(x(a.value,Fr),"overrides"):void 0;if(Array.isArray(l)&&l.some((d)=>typeof d==="string"&&d.startsWith("!")))return{platform:"gemini-cli",status:"disabled",method:"extension config",configPath:e,errors:[`${Fr} is disabled in Gemini CLI`]};return{platform:"gemini-cli",status:"configured",method:"extension config",configPath:r}}function e0(n){return Br(n.homeDir)}import{readFileSync as u0}from"node:fs";import{join as v0}from"node:path";var G="cc-safety-net",a0="# cc-safety-net managed Hermes Agent plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --hermes-agent";function l0(n){return`# cc-safety-net managed Hermes Agent plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --hermes-agent
# version: ${n}
`}function dL(n){return`${l0(n)}name: cc-safety-net
version: "${n}"
description: "Block destructive commands and secret-file access before Hermes runs a tool."
author: "cc-safety-net"
provides_hooks:
  - pre_tool_call
`}function cL(n){return`${l0(n)}"""CC Safety Net guard for Hermes Agent.

Registers pre_tool_call and forwards the tool call to the packaged CC Safety Net
adapter (cc-safety-net hook --hermes-agent) over JSON stdin. The adapter prints nothing
when the call is allowed and an {"action": "block", ...} directive when it is denied.
Hermes ignores a callback that raises, so every transport and analysis failure is turned
into an explicit block here instead.
"""

import json
import os
import shutil
import signal
import subprocess

HOOK_EVENT = "pre_tool_call"
SUPPORTED_TOOLS = ("patch", "read_file", "terminal", "write_file")
ANALYZER = ["npx", "-y", "cc-safety-net", "hook", "--hermes-agent"]
TIMEOUT_SECONDS = ${"30"}


def _block(detail):
    return {"action": "block", "message": "CC Safety Net failed closed: " + detail}


def _terminal_cwd(task_id, process_cwd):
    """Return the directory Hermes will run this terminal command in.

    A \`terminal\` call without \`workdir\` runs in the session's own cwd RECORD, not in the
    Hermes process directory: \`_resolve_command_cwd\` in tools/terminal_tool.py returns
    \`workdir or get_session_cwd(session_key) or default_cwd\`, and that record is rewritten
    after every completed command, so it IS the session's \`cd\` state. The session key is
    derived exactly as terminal_tool derives it: the contextvar when set, the raw task_id
    otherwise. No record yet (first command of a session) means \`default_cwd\`, which the local
    terminal backend reads from \`TERMINAL_CWD\` (\`hermes_cli/config.py\` bridges the configured
    \`terminal.cwd\` into it) and only then falls back to the process directory.
    """
    from tools.approval import get_current_session_key
    from tools.terminal_tool import get_session_cwd

    return (
        get_session_cwd(get_current_session_key(default="") or (task_id or ""))
        or os.environ.get("TERMINAL_CWD")
        or process_cwd
    )


def _pre_tool_call(tool_name="", args=None, session_id="", task_id="", **_):
    if tool_name not in SUPPORTED_TOOLS:
        return None

    executable = shutil.which(ANALYZER[0])
    if executable is None:
        return _block(ANALYZER[0] + " was not found on PATH.")

    try:
        cwd = os.getcwd()
    except OSError as error:
        return _block("the working directory could not be resolved (%s)." % error)

    if tool_name == "terminal":
        try:
            cwd = _terminal_cwd(task_id, cwd)
        except ImportError as error:
            # Without the session record we cannot tell which directory the command runs in,
            # and analysing the wrong one clears every path-scoped protection.
            return _block(
                "the Hermes session directory could not be read (%s). Update cc-safety-net and "
                "reinstall the plugin with: npx -y cc-safety-net install --hermes-agent." % error
            )

    payload = json.dumps(
        {
            "hook_event_name": HOOK_EVENT,
            "tool_name": tool_name,
            "tool_input": args if isinstance(args, dict) else None,
            "session_id": session_id if isinstance(session_id, str) else "",
            "cwd": cwd,
        }
    )

    try:
        process = subprocess.Popen(
            [executable] + ANALYZER[1:],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            # Decode explicitly: the analyzer writes UTF-8, and a locale decoder would raise
            # UnicodeDecodeError on output it cannot read — an exception Hermes swallows by
            # allowing the tool call. "replace" turns that into unreadable output, which blocks.
            encoding="utf-8",
            errors="replace",
            # Resolve the analyzer from a neutral directory: npx prefers a repository-local
            # node_modules/.bin/cc-safety-net, so inheriting Hermes' working directory would
            # let workspace contents stand in for the analyzer. The payload's "cwd" above is
            # still the real Hermes working directory, which the analysis needs.
            cwd=os.path.expanduser("~"),
            # Own process group so the timeout below can kill the whole tree: npx's descendants
            # outlive a kill aimed at npx alone and keep holding the pipes captured here.
            start_new_session=True,
        )
    except OSError as error:
        return _block("analysis could not start (%s)." % error)

    try:
        stdout, _ = process.communicate(payload, timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except OSError:
            pass
        try:
            process.communicate(timeout=TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            pass
        return _block("analysis timed out after %ss." % TIMEOUT_SECONDS)

    if process.returncode != 0:
        return _block("analysis exited with status %s." % process.returncode)

    directive = (stdout or "").strip()
    if not directive:
        return None

    try:
        parsed = json.loads(directive)
    except ValueError:
        return _block("analysis returned unreadable output.")

    if isinstance(parsed, dict) and parsed.get("action") == "block":
        message = parsed.get("message")
        if isinstance(message, str) and message:
            return parsed
    return _block("analysis returned an unexpected directive.")


def register(ctx):
    ctx.register_hook("pre_tool_call", _pre_tool_call)
`}function jn(n){return[{name:"__init__.py",content:cL(n)},{name:"plugin.yaml",content:dL(n)}]}import{mkdirSync as LL,readdirSync as iL,readFileSync as pL,rmSync as Jr}from"node:fs";import{join as F2}from"node:path";var uL="__pycache__";function Zr(n){let t=process.env.HERMES_HOME?.trim();return t?t:F2(n,".hermes")}function Qr(n){return F2(Zr(n),"plugins",G)}function Xr(n){return n.startsWith(a0)}function Yr(n,t){let r=Qr(n),e=W(r);if(e&&(e.isSymbolicLink()||!e.isDirectory()))throw Error(`Refusing to ${t} ${r}: not a regular directory. Move or remove it and rerun ${t==="install"?"install":"uninstall"} --hermes-agent.`);return r}function s0(n,t){let r=W(n);if(!r)return;if(r.isSymbolicLink()||!r.isFile())throw Error(`Refusing to ${t} ${n}: not a regular file. Move or remove it.`);let e=pL(n,"utf-8");if(!Xr(e))throw Error(`Refusing to ${t} unmanaged file at ${n}. Move or remove it.`);return e}function d0(n){let t=Yr(n,"install"),r=jn(F());if(r.map((a)=>s0(F2(t,a.name),"overwrite")).every((a,l)=>a===r[l]?.content))return{path:t,alreadyInstalled:!0};return LL(t,{recursive:!0}),r.forEach((a)=>{Z(F2(t,a.name),a.content)}),{path:t,alreadyInstalled:!1}}function Sr(n){let t=Yr(n,"remove");if(!W(t))return[];return jn(F()).filter((r)=>s0(F2(t,r.name),"remove")!==void 0)}function c0(n){let t=Yr(n,"remove");if(!W(t))return{path:t,alreadyInstalled:!1};let r=Sr(n);if(r.forEach((e)=>{Jr(F2(t,e.name))}),Jr(F2(t,uL),{recursive:!0,force:!0}),iL(t).length===0)Jr(t,{recursive:!0});return{path:t,alreadyInstalled:r.length>0}}var lt="hermes-agent",L0=/^([^\s#][^:]*):/,vL=/^\s+([A-Za-z_][\w-]*):/,i0=/^\s+-\s*(.*)$/;function oL(n){return n.trim().replace(/^(["'])(.*)\1$/,"$2")}function bL(n){let t=n.split(/\r?\n/),r=t.findIndex((l)=>L0.exec(l)?.[1]?.trim()==="plugins");if(r===-1)return[];let e=t.slice(r+1),a=e.findIndex((l)=>L0.test(l));return a===-1?e:e.slice(0,a)}function p0(n,t){let r=bL(n),e=r.findIndex((s)=>vL.exec(s)?.[1]===t);if(e===-1)return[];let a=r.slice(e+1),l=a.findIndex((s)=>!i0.test(s));return(l===-1?a:a.slice(0,l)).map((s)=>oL(i0.exec(s)?.[1]??""))}function fL(n){try{return u0(v0(Zr(n),"config.yaml"),"utf-8")}catch{return}}function Hr(n){let t=fL(n)??"";return p0(t,"enabled").includes(G)&&!p0(t,"disabled").includes(G)}function o0(n){return/^# version:\s*(.+)$/m.exec(n)?.[1]?.trim()}function yL(n,t){let r=W(n);if(!r)return{error:`${t.name} is missing from ${n}; run install --hermes-agent`};if(r.isSymbolicLink()||!r.isFile())return{error:`${n} is a symlink or not a regular file; move or remove it`};try{let e=u0(n,"utf-8");if(!Xr(e))return{error:`Unmanaged ${t.name} occupies ${n}; move or remove it`};if(o0(e)===F()&&e!==t.content)return{error:`Modified ${t.name} occupies ${n}; run install --hermes-agent to restore it`};return{content:e}}catch(e){return{error:`Failed to read ${n}: ${e instanceof Error?e.message:String(e)}`}}}function b0(n){let t=Qr(n.homeDir),r=In(lt,t);if(r)return r;let e=jn(F()).map((d)=>yL(v0(t,d.name),d)),a=e.flatMap((d)=>("error"in d)?[d.error]:[]);if(a.length>0)return{platform:lt,status:"n/a",configPath:t,errors:a};let l=e.some((d)=>("content"in d)&&o0(d.content)!==F()),s=l?["Installed Hermes Agent plugin is outdated; run install --hermes-agent to update"]:[];if(!Hr(n.homeDir))return{platform:lt,status:"disabled",method:"plugin directory",configPath:t,errors:[`${G} is not enabled in Hermes; run \`hermes plugins enable ${G}\``,...s]};return{platform:lt,status:"configured",method:"plugin directory",configPath:t,errors:l?s:void 0}}import{existsSync as hL,readFileSync as wL}from"node:fs";import{join as f0}from"node:path";var xL=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;function $L(n){return f0(process.env.KIMI_CODE_HOME||f0(n,".kimi-code"),"config.toml")}function zn(n){let t=$L(n.homeDir);if(!hL(t))return{platform:"kimi-code",status:"n/a",configPath:t};try{if(!xL.test(wL(t,"utf-8")))return{platform:"kimi-code",status:"n/a",configPath:t}}catch(r){return{platform:"kimi-code",status:"n/a",configPath:t,errors:[`Failed to read ${t}: ${r instanceof Error?r.message:String(r)}`]}}return{platform:"kimi-code",status:"configured",method:"hook config",configPath:t}}import{readFileSync as q0}from"node:fs";import{join as Bn}from"node:path";var z="cc-safety-net",U="index.js",N2="openclaw.plugin.json",nn="package.json";var st="// cc-safety-net managed OpenClaw plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --openclaw";import{existsSync as DL,lstatSync as kL,readdirSync as qL,readFileSync as jL}from"node:fs";import{dirname as w0,join as h2}from"node:path";import{fileURLToPath as zL}from"node:url";import{spawn as mL}from"node:child_process";function gL(n){return n.join(" ")}function Rr(n,t,r){return[`Failed to run ${gL(n)}${t===null?"":` (exit ${t})`}.`,r.trim()].filter(Boolean).join(`
`)}function Wr(n){let t={stdout:"",stderr:""};return n.stdout.setEncoding("utf-8"),n.stderr.setEncoding("utf-8"),n.stdout.on("data",(r)=>{t.stdout+=r}),n.stderr.on("data",(r)=>{t.stderr+=r}),t}function a2(n,t){return new Promise((r,e)=>{let a=y2([...n],process.env),l=mL(a.cmd,a.args,{stdio:["ignore","pipe","pipe"]}),s=Wr(l),d=()=>[s.stdout,s.stderr].filter(Boolean).join(`
`),c=t?.timeoutMs??120000,L=setTimeout(()=>{l.kill(),e(Error(Rr(n,null,`Timed out after ${c}ms.
${d()}`.trim())))},c);l.on("error",(i)=>{clearTimeout(L),e(Error(Rr(n,null,`${i.message}
${d()}`.trim())))}),l.on("close",(i)=>{if(clearTimeout(L),i!==0){e(Error(Rr(n,i,d())));return}r(t?.stdoutOnly?s.stdout:d())})})}async function Ar(n){for(let t of n)await a2(t)}async function y0(n){for(let t of n)try{await a2(t)}catch(r){console.warn(r instanceof Error?r.message:String(r))}}var h0=h2("openclaw",z),FL=[U,N2,nn];function Kr(n,t){if(n==="~")return t;if(n.startsWith("~/")||n.startsWith("~\\"))return h2(t,n.slice(2));return n}function x0(n){let t=process.env.OPENCLAW_STATE_DIR?.trim();if(t)return Kr(t,n);let r=process.env.OPENCLAW_CONFIG_PATH?.trim();return r?w0(Kr(r,n)):h2(n,".openclaw")}function $0(n){let t=process.env.OPENCLAW_CONFIG_PATH?.trim();return t?Kr(t,n):h2(x0(n),"openclaw.json")}function Vr(n){return h2(x0(n),"extensions",z)}function BL(n){let t=qL(n);if(t.length===0)return!0;if(t.some((a)=>!FL.includes(a)))return!1;let r=h2(n,U),e=W(r);return e!==void 0&&!e.isSymbolicLink()&&e.isFile()&&jL(r,"utf-8").startsWith(st)}function Mr(n){let t=Vr(n),r=W(t);if(!r)return;if(!r.isSymbolicLink()&&r.isDirectory()&&BL(t))return;throw Error(`Refusing to modify ${t}: it does not hold a cc-safety-net managed OpenClaw plugin. Move or remove it, then run the command again.`)}function m0(){let n=w0(zL(import.meta.url));return[h2(n,"..",h0),h2(n,"..","..","..","dist",h0)]}function Gr(n=m0()){return n.find((t)=>DL(t)&&kL(t).isDirectory())}function JL(n=m0()){let t=Gr(n);if(!t)throw Error("Packaged OpenClaw plugin directory not found. Reinstall cc-safety-net and try again.");return t}function g0(n=JL()){return[["openclaw","plugins","install",n,"--force"],["openclaw","plugins","enable",z]]}function ZL(n){let t=(()=>{try{return JSON.parse(n)}catch{return}})(),r=x(x(t,"plugin"),"status");return typeof r==="string"?r:void 0}async function D0(){let n=ZL(await a2(["openclaw","plugins","inspect",z,"--runtime","--json"],{stdoutOnly:!0}));if(n==="loaded")return;throw Error(`${n===void 0?`The ${z} plugin's load state could not be verified: OpenClaw's runtime inspect report was unreadable.`:`OpenClaw reports the ${z} plugin with status "${n}".`} Run \`openclaw plugins inspect ${z} --runtime\` for details.`)}var dt="openclaw",Fn=`run \`openclaw plugins enable ${z}\``;function tn(n,t){let r=Bn(n,t),e=W(r);if(!e)return{error:`${t} is missing from ${r}; run install --openclaw`};if(e.isSymbolicLink()||!e.isFile())return{error:`${r} is a symlink or not a regular file; move or remove it`};try{return{content:q0(r,"utf-8")}}catch(a){return{error:`Failed to read ${r}: ${a instanceof Error?a.message:String(a)}`}}}function j0(n){try{return JSON.parse(V(n))}catch{return}}function QL(n){let t=tn(n,N2);if("error"in t)return t.error;if(x(j0(t.content),"id")===z)return;return`${Bn(n,N2)} is not a valid ${z} manifest; run install --openclaw`}function XL(n){let t=tn(n,nn);if("error"in t)return t.error;let r=x(x(j0(t.content),"openclaw"),"extensions");if(Array.isArray(r)&&r.includes(`./${U}`))return;return`${Bn(n,nn)} does not point OpenClaw at ${U}; run install --openclaw`}function k0(n){return Array.isArray(n)?n.filter((t)=>typeof t==="string"):[]}function YL(n){let t=$0(n);if(!W(t))return`${z} is not enabled; ${Fn}`;let r=(()=>{try{return JSON.parse(V(q0(t,"utf-8")))}catch{return}})();if(r===void 0)return`Failed to read ${t}; fix it, then ${Fn}`;let e=x(r,"plugins");if(x(e,"enabled")===!1)return`plugins.enabled is false in ${t}; no OpenClaw plugin loads`;let a=x(x(x(e,"entries"),z),"enabled");if(k0(x(e,"deny")).includes(z)||a===!1)return`${z} is disabled in ${t}; ${Fn}`;let l=k0(x(e,"allow"));if(l.length>0&&!l.includes(z))return`plugins.allow in ${t} does not list ${z}; add it, then ${Fn}`;if(l.includes(z)||a===!0)return;return`${z} is not enabled; ${Fn}`}function z0(n){return/^\/\/ version:\s*(.+)$/m.exec(n)?.[1]?.trim()}function SL(n,t,r){if(r===void 0)return[];let e=tn(r,U);if("error"in e||z0(e.content)!==t)return[];return[U,N2,nn].flatMap((a)=>{let l=tn(n,a),s=tn(r,a);if("error"in l||"error"in s||l.content===s.content)return[];return[`Modified ${a} occupies ${Bn(n,a)}; run install --openclaw to restore it`]})}function F0(n){let t=Vr(n.homeDir),r=In(dt,t);if(r)return r;let e=tn(t,U),l=["error"in e?e.error:e.content.startsWith(st)?void 0:`Unmanaged ${U} occupies ${Bn(t,U)}; move or remove it`,QL(t),XL(t)].filter((i)=>i!==void 0),s="content"in e?z0(e.content):void 0,d=l.length>0?l:SL(t,s,Gr());if(d.length>0)return{platform:dt,status:"n/a",configPath:t,errors:d};let c=s===F()?[]:["Installed OpenClaw plugin is outdated; run install --openclaw to update"],L=YL(n.homeDir);if(L)return{platform:dt,status:"disabled",method:"plugin directory",configPath:t,errors:[L,...c]};return{platform:dt,status:"configured",method:"plugin directory",configPath:t,errors:c.length>0?c:void 0}}import{existsSync as OL,readFileSync as TL}from"node:fs";import{join as _L}from"node:path";import{existsSync as Ur,readFileSync as X0,rmSync as RL}from"node:fs";import{join as p2}from"node:path";import{pathToFileURL as WL}from"node:url";function B0(n){return n!==void 0&&/\s/.test(n)}function HL(n,t,r){let e=t+1,a=!1;while(e<n.length){let l=n[e];if(a){a=!1,e++;continue}if(l==="\\"){a=!0,e++;continue}if(l==='"')return e+1;e++}throw Error(r)}function ct(n,t,r){let e=n[t],a=e==="["?"]":"}",l=0,s=t;while(s<n.length){let d=r.skipComment?.(n,s)??s;if(d!==s){s=d;continue}if(n[s]==='"'){s=HL(n,s,r.stringError);continue}if(n[s]===e)l++;if(n[s]===a){if(l--,l===0)return s}s++}throw Error(r.bracketError)}function J0(n,t){let r=n.lastIndexOf(`
`,t)+1;return/^[ \t]*/.exec(n.slice(r))?.[0]??""}function Lt(n,t){let{start:r,end:e,end:a}=t;while(B0(n[a]))a++;if(n[a]===","){if(e=a+1,n[e]===`
`)e++;return`${n.slice(0,r)}${n.slice(e)}`}a=t.start-1;while(B0(n[a]))a--;if(n[a]===","){r=a;let l=n.lastIndexOf(`
`,r-1);if(l!==-1&&/^\s*$/.test(n.slice(l+1,r)))r=l}return`${n.slice(0,r)}${n.slice(e)}`}var it="cc-safety-net",Y0=`${it}@latest`,S0=["opencode.json","opencode.jsonc"],Z0="CCSafetyNetPlugin";function pt(n){return p2(process.env.XDG_CONFIG_HOME||p2(n,".config"),"opencode")}function AL(n){return p2(pt(n),S0[0])}function KL(n){return S0.map((t)=>p2(pt(n),t))}function H0(n){return p2(process.env.XDG_CACHE_HOME||p2(n,".cache"),"opencode","packages",Y0)}function Cr(n){RL(H0(n),{recursive:!0,force:!0})}async function R0(n){let t=p2(H0(n),"node_modules",it),r=p2(t,"package.json");if(!Ur(r))throw Error(`The OpenCode plugin cache at ${t} is missing its package, so OpenCode would load nothing and fail open. Run \`opencode plugin -g -f ${Y0}\` for details.`);let e=x(JSON.parse(X0(r,"utf-8")),"main");if(typeof e!=="string")throw Error(`The cached OpenCode plugin at ${t} declares no "main" entry.`);let a=p2(t,e);if(typeof(await import(WL(a).href))[Z0]==="function")return;throw Error(`The cached OpenCode plugin at ${a} does not export a callable ${Z0}, so OpenCode would load nothing and fail open.`)}function ut(n,t){if(n[t]==="/"&&n[t+1]==="/"){let r=n.indexOf(`
`,t+2);return r===-1?n.length:r+1}if(n[t]==="/"&&n[t+1]==="*"){let r=n.indexOf("*/",t+2);return r===-1?n.length:r+2}return t}function Q0(n,t){let r=t;while(r<n.length){if(/\s/.test(n[r]??"")){r++;continue}let e=ut(n,r);if(e===r)return r;r=e}return r}function W0(n,t){let r=t+1,e=!1;while(r<n.length){if(e){e=!1,r++;continue}if(n[r]==="\\"){e=!0,r++;continue}if(n[r]==='"')return r+1;r++}throw Error("Unterminated string in OpenCode config")}function A0(n,t,r){return JSON.parse(n.slice(t,r))}function VL(n,t){return ct(n,t,{skipComment:ut,stringError:"Unterminated string in OpenCode config",bracketError:"Unmatched plugin array in OpenCode config"})}function ML(n){let t=0,r=0;while(r<n.length){let e=ut(n,r);if(e!==r){r=e;continue}if(n[r]==='"'){let a=W0(n,r);if(t===1&&A0(n,r,a)==="plugin"){let l=Q0(n,a),s=Q0(n,l+1);if(n[l]===":"&&n[s]==="[")return{start:s,end:VL(n,s)}}r=a;continue}if(n[r]==="{"||n[r]==="[")t++;if(n[r]==="}"||n[r]==="]")t--;r++}return}function GL(n,t){let r=[],e=t.start+1;while(e<t.end){let a=ut(n,e);if(a!==e){e=a;continue}if(n[e]==='"'){let l=W0(n,e),s=A0(n,e,l);if(typeof s==="string"&&s.includes(it))r.push({start:e,end:l});e=l;continue}e++}return r}function K0(n,t){try{return JSON.parse(V(n))}catch(r){if(r instanceof SyntaxError)throw Error(`Failed to parse OpenCode config ${t}: ${r.message}`);throw r}}function UL(n){if(!n||typeof n!=="object"||Array.isArray(n))return!1;let t=n.plugin;if(!Array.isArray(t))return!1;return t.some((r)=>typeof r==="string"&&r.includes(it))}function CL(n,t){let r=ML(n);if(!r)throw Error(`Failed to locate OpenCode plugin array in ${t}`);let e=[...GL(n,r)].reverse().reduce(Lt,n);return K0(e,t),e}function V0(n){Cr(n);let t=KL(n),r=t.find((a)=>Ur(a)),e=[];for(let a of t){if(!Ur(a))continue;try{let l=X0(a,"utf-8");if(!UL(K0(l,a)))continue;return Z(a,CL(l,a)),{path:a,alreadyInstalled:!0}}catch(l){e.push(l instanceof Error?l.message:String(l))}}if(e.length>0)throw Error(e.join(`
`));return{path:r??AL(n),alreadyInstalled:!1}}function M0(n){let t=[],r=pt(n.homeDir),e=["opencode.json","opencode.jsonc"];for(let a of e){let l=_L(r,a);if(OL(l))try{let s=TL(l,"utf-8"),d=V(s);if((JSON.parse(d).plugin??[]).some((u)=>u.includes("cc-safety-net")))return{platform:"opencode",status:"configured",method:"plugin array",configPath:l,errors:t.length>0?t:void 0}}catch(s){t.push(`Failed to parse ${a}: ${s instanceof Error?s.message:String(s)}`)}}return{platform:"opencode",status:"n/a",errors:t.length>0?t:void 0}}import{join as EL}from"node:path";function Or(n){return EL(n,".pi","agent","settings.json")}function Tr(n){if(typeof n!=="string")return!1;return n==="npm:cc-safety-net"||n.startsWith("npm:cc-safety-net@")}function G0(n){let t=Or(n.homeDir),r=r2(t);if(r.kind==="unreadable")return{platform:"pi",status:"not-inspected"};if(r.kind==="missing")return{platform:"pi",status:"n/a"};let e=x(r.value,"packages");if(!Array.isArray(e))return{platform:"pi",status:"n/a"};let a=e.find((d)=>Tr(typeof d==="string"?d:x(d,"source")));if(a===void 0)return{platform:"pi",status:"n/a"};let l=x(a,"extensions");if(Array.isArray(l)&&l.some((d)=>typeof d==="string"&&d.startsWith("-")))return{platform:"pi",status:"disabled",method:"package config",configPath:t,errors:["npm:cc-safety-net is installed but its extension is disabled in Pi settings"]};return{platform:"pi",status:"configured",method:"package config",configPath:t}}var IL={amp:Ja,"antigravity-cli":Za,"claude-code":Sa,codex:Ha,"copilot-cli":Ta,cursor:r0,"gemini-cli":e0,"hermes-agent":b0,"kimi-code":zn,openclaw:F0,opencode:M0,pi:G0};function rn(n,t){let r={...t,cwd:n,homeDir:t?.homeDir??PL()};return Gn.map((e)=>NL(IL[e](r)))}function NL(n){if(n.status==="not-inspected")return{platform:n.platform,detected:!1,configured:!1,inspectionStatus:"not-inspected"};return{platform:n.platform,detected:n.status!=="n/a",configured:n.status==="configured",inspectionStatus:n.status!=="n/a"?"verified":n.errors&&n.errors.length>0?"failed":"not-applicable",method:n.method,configPath:n.configPath,configPaths:n.configPaths,errors:n.errors}}import{tmpdir as ni}from"node:os";import{join as ti}from"node:path";var ri=Object.freeze([{command:"git reset --hard",description:"git reset --hard",expectBlocked:!0},{command:"rm -rf /",description:"rm -rf /",expectBlocked:!0},{command:"rm -rf ./node_modules",description:"rm in cwd (safe)",expectBlocked:!1}]),ei=Object.freeze({state:"ready",diagnostics:Object.freeze([]),ruleMetadata:Object.freeze({}),policy:Object.freeze({rules:Object.freeze([]),transparentWrappers:Object.freeze([]),safety:Object.freeze({}),worktreeMode:!1,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:Object.freeze({}),destructiveCommandAllowPaths:Object.freeze([]),secretProtection:Object.freeze({enabled:!0,disabledRules:Object.freeze([]),denyPaths:Object.freeze([]),allowPaths:Object.freeze([])})})}),ai={strict:!1,paranoidRm:!1,paranoidInterpreters:!1,worktreeMode:!1,effectiveLevel:"standard",capabilities:{fail_closed:{enabled:!1,source:"preset",sources:[]},paranoid_rm:{enabled:!1,source:"preset",sources:[]},paranoid_interpreters:{enabled:!1,source:"preset",sources:[]}}};function U0(){let n=ti(ni(),"cc-safety-net-self-test"),t=ri.map((r)=>{let e=Kn(M2("self-test",{command:r.command},{kind:"command",shell:"auto"},{configCwd:n,executionCwd:n},r.command),{guard:{dependencies:{loadPolicySnapshot:()=>ei,getModes:()=>ai,findPolicyMutation:()=>null}},audit:{agent:"self-test",getSessionId:()=>{return}}}),a=r.expectBlocked?"blocked":"allowed",l=e.decision.kind==="deny"?"blocked":"allowed";return{command:r.command,description:r.description,expected:a,actual:l,passed:a===l,reason:e.decision.kind==="deny"?e.decision.reason:void 0,ruleId:e.decision.kind==="deny"?e.decision.ruleId:void 0}});return{passed:t.filter((r)=>r.passed).length,failed:t.filter((r)=>!r.passed).length,total:t.length,results:t}}function _r(n){let t=B({label:"doctor",booleans:{json:["--json"],skipUpdateCheck:["--skip-update-check"]}},n);if(l2(t.errors))return null;return{json:t.flags.json,skipUpdateCheck:t.flags.skipUpdateCheck}}async function C0(n={}){let t=await gn(!n.json,()=>{let r=li(n);return{ready:r,finish:()=>r}},()=>mn(),{loadingMessage:"Checking system status…"});if(n.json)console.log(JSON.stringify(t,null,2));else di(t);return si(t.hooks,t.engineSelfTest,{userConfig:t.userConfig,projectConfig:t.projectConfig})?1:0}async function li(n){let t=n.cwd??process.cwd(),r=await xn(),e=rn(t,{ampPluginListOutput:r.ampPluginListOutput,codexPluginListOutput:r.codexPluginListOutput,copilotCliVersion:r.versions["copilot-cli"]}),a=ta(t),l=ra(),s=K({cwd:t}),d=s.policy,c=c2(d),L=D2(d,c.capabilities),i=Cn(7),u=n.skipUpdateCheck?{currentVersion:F(),latestVersion:null,updateAvailable:!1}:await E2(),o={hooks:e,engineSelfTest:U0(),userConfig:a.userConfig,projectConfig:a.projectConfig,configState:fn(s),effectiveRules:a.effectiveRules,shadowedRules:a.shadowedRules,environment:l,effectiveSafety:{selectedPreset:d.safety.level??"standard",level:c.effectiveLevel,capabilities:c.capabilities,ruleOverrides:d.destructiveCommandRuleOverrides,weakenedRuleOverrides:Object.entries(L).filter(([,p])=>p.source==="rule_override"&&p.override==="off"&&p.inheritedEnabled&&p.changesInherited).map(([p])=>p),ruleCounts:{stored:Object.keys(d.destructiveCommandRuleOverrides).length,effective:Object.values(L).filter((p)=>p.changesInherited).length}},posture:fa(a.userConfig.path),activity:i,update:u,system:r};return{...o,findings:aa(o)}}function si(n,t,r){return n.length>0&&n.every((e)=>!e.configured)||n.some((e)=>e.inspectionStatus==="failed")||t.failed>0||r.userConfig.exists&&!r.userConfig.valid||r.projectConfig.exists&&!r.projectConfig.valid}function di(n){console.log(),console.log(sa(n.hooks)),console.log(),console.log(da(n.engineSelfTest)),console.log(),console.log(ca(n)),console.log(),console.log(La(n.environment)),console.log(),console.log(ia(n)),console.log(),console.log(pa(n.findings)),console.log(),console.log(ua(n.activity)),console.log(),console.log(oa(n.system)),console.log(),console.log(va(n.update)),console.log(ba(n))}import{existsSync as ci}from"node:fs";var Li=/^[A-Za-z0-9_@%+=:,./-]+$/,O0="Usage: cc-safety-net explain [--json] [--cwd <path>] <command>";function Er(n){let t=B({label:"explain",booleans:{json:["--json"]},values:{cwd:["--cwd"]},positionals:"tail"},n);if(l2(t.errors))return console.error(O0),console.error("Pass -- before a command that starts with dashes."),null;if(t.values.cwd!==void 0&&!ci(t.values.cwd))return console.error(`Error: --cwd path does not exist: ${t.values.cwd}`),null;let r=t.positionals.length===1?t.positionals[0]:t.positionals.map((e)=>Li.test(e)?e:`'${e.replaceAll("'","'\\''")}'`).join(" ");if(!r)return console.error("Error: No command provided"),console.error(O0),null;return{json:t.flags.json,cwd:t.values.cwd,command:r}}function T0(n){if(n)return{dh:"=",dv:"|",dtl:"+",dtr:"+",dbl:"+",dbr:"+",h:"-",v:"|",tl:"+",tr:"+",bl:"+",br:"+",sh:"="};return{dh:"═",dv:"║",dtl:"╔",dtr:"╗",dbl:"╚",dbr:"╝",h:"─",v:"│",tl:"┌",tr:"┐",bl:"└",br:"┘",sh:"━"}}function _0(n,t){let e=t-18;return[`${n.dtl}${n.dh.repeat(t)}${n.dtr}`,`${n.dv}  Command Analysis${" ".repeat(e)}${n.dv}`,`${n.dbl}${n.dh.repeat(t)}${n.dbr}`]}function Pr(n){return JSON.stringify(n)}function E0(n,t=0){return`[${n.map((e,a)=>la(e,a,t)).join(",")}]`}function vt(n,t,r=70){let e=n.split(" "),a=[],l="";for(let s of e)if(l&&l.length+s.length+1>r)a.push(l),l=s;else l=l?`${l} ${s}`:s;if(l)a.push(l);return a.map((s,d)=>d===0?s:`${t}${s}`)}function P0(n,t,r){let e=[];switch(n.type){case"parse":return null;case"env-strip":return e.push(""),e.push(`STEP ${t} ${r.h} Strip environment variables`),e.push(`  Removed: ${n.envVars.map((a)=>`${a}=<redacted>`).join(", ")}`),e.push(`  Tokens:  ${Pr(n.output)}`),{lines:e,incrementStep:!0};case"leading-tokens-stripped":return e.push(""),e.push(`STEP ${t} ${r.h} Strip wrappers`),e.push(`  Removed: ${n.removed.join(", ")}`),e.push(`  Tokens:  ${Pr(n.output)}`),{lines:e,incrementStep:!0};case"shell-wrapper":return e.push(""),e.push(`STEP ${t} ${r.h} Detect shell wrapper`),e.push(`  Wrapper: ${n.wrapper} -c`),e.push(`  Inner:   ${n.innerCommand}`),{lines:e,incrementStep:!0};case"interpreter":{if(e.push(""),e.push(`STEP ${t} ${r.h} Detect interpreter`),e.push(`  Interpreter: ${n.interpreter}`),e.push(`  Code:        ${n.codeArg}`),n.paranoidBlocked)e.push("  Result:      ✗ BLOCKED (paranoid mode)");return{lines:e,incrementStep:!0}}case"busybox":return e.push(""),e.push(`STEP ${t} ${r.h} Busybox wrapper`),e.push(`  Subcommand: ${n.subcommand}`),{lines:e,incrementStep:!0};case"transparent-wrapper":return e.push(""),e.push(`STEP ${t} ${r.h} Transparent wrapper`),e.push(`  Wrapper: ${n.wrapper}`),e.push(`  Tokens:  ${Pr(n.output)}`),{lines:e,incrementStep:!0};case"recurse":return{lines:[],incrementStep:!1};case"rule-check":{if(e.push(""),e.push(`STEP ${t} ${r.h} Match rules`),e.push(`  Rule:   ${n.rule}()`),n.matched)e.push("  Result: MATCHED");else e.push("  Result: No match");return{lines:e,incrementStep:!0}}case"worktree-relaxation":return e.push(""),e.push(`STEP ${t} ${r.h} Worktree relaxation`),e.push(`  Mode:   ${k.worktree.name}`),e.push(`  Git cwd: ${n.gitCwd}`),e.push("  Result: Allowed local discard in linked worktree"),{lines:e,incrementStep:!0};case"tmpdir-check":return null;case"fallback-scan":{if(n.embeddedCommandFound)return e.push(""),e.push(`STEP ${t} ${r.h} Fallback scan`),e.push(`  Found: ${n.embeddedCommandFound}`),{lines:e,incrementStep:!0};return null}case"custom-rules-check":{if(n.rulesChecked){if(e.push(""),e.push(`STEP ${t} ${r.h} Custom rules`),n.matched)e.push("  Result: MATCHED");else e.push("  Result: No match");return{lines:e,incrementStep:!0}}return null}case"cwd-change":return null;case"dangerous-text":{if(n.matched)return e.push(""),e.push(`STEP ${t} ${r.h} Dangerous text check`),e.push(`  Token:  ${n.token}`),e.push("  Result: MATCHED"),{lines:e,incrementStep:!0};return null}case"strict-unparseable":return e.push(""),e.push(`STEP ${t} ${r.h} Strict mode check`),e.push(`  Command: ${n.rawCommand}`),e.push("  Result:  ✗ UNPARSEABLE"),{lines:e,incrementStep:!0};case"segment-skipped":return null;case"error":return e.push(""),e.push(`ERROR: ${n.message}`),{lines:e,incrementStep:!1};default:return null}}function Ir(n,t){let r=T0(t?.asciiOnly??!1),e=58,a=[],l=1;a.push(..._0(r,58)),a.push("");let s=n.trace.steps.find((p)=>p.type==="error");if(s&&s.type==="error"){a.push("ERROR"),a.push(`  ${s.message}`),a.push(""),a.push("RESULT"),a.push(`  Status: ${n.result==="blocked"?b.red("BLOCKED"):b.green("ALLOWED")}`),a.push(""),a.push("CONFIG");let p=n.configSource??"none";return a.push(`  Path: ${p}`),a.join(`
`)}let d=n.trace.steps.find((p)=>p.type==="parse");if(d&&d.type==="parse"){a.push("INPUT"),a.push(`  ${d.input}`),a.push(""),a.push(`STEP ${l} ${r.h} Split shell commands`),l++;for(let p=0;p<d.segments.length;p++){let f=d.segments[p];if(f){let v=Math.random();a.push(`  Segment ${p+1}: ${E0(f,v)}`)}}}let c=n.trace.segments,L=c.length>1;for(let p of c){if(L){a.push("");let w="";if(d&&d.type==="parse"){let Zt=d.segments[p.index];if(Zt)w=Zt.join(" ")}let $=54,y=w,g=` Segment ${p.index+1}: `,S=" ";if(w){if(g.length+w.length+S.length>$){let A3=$-g.length-S.length;y=`${w.substring(0,A3-1)}…`}}let o2=w?`${g}${y}${S}`:` Segment ${p.index+1} `,Jt=w?`${g}${b.cyan(y)}${S}`:o2,me=58-o2.length,ge=Math.floor(me/2),W3=me-ge;a.push(`${r.sh.repeat(ge)}${Jt}${r.sh.repeat(W3)}`)}if(p.steps.find((w)=>w.type==="segment-skipped")){a.push(""),a.push("  (skipped — prior segment blocked)");continue}let v=!1,h=!1;for(let w of p.steps){let $=P0(w,l,r);if($){if(h=!0,w.type==="recurse"){a.push("");let y=" RECURSING ",g=58-y.length-4;a.push(`  ${r.tl}${r.h}${y}${r.h.repeat(g)}`),a.push(`  ${r.v}`),v=!0;continue}for(let y of $.lines)if(v)a.push(`  ${r.v} ${y}`);else a.push(y);if($.incrementStep)l++}}if(v)a.push(`  ${r.v}`),a.push(`  ${r.bl}${r.h.repeat(56)}`),v=!1;if(!h)a.push(""),a.push(`  ${b.green("✓")} Allowed (no matching rules)`)}if(a.push(""),a.push("RESULT"),n.result==="blocked"){if(a.push(`  Status: ${b.red("BLOCKED")}`),n.customRule){if(a.push(`  Rule: ${n.customRule.id}`),n.customRule.rulebook)a.push(`  Rulebook: ${n.customRule.rulebook.name} ${n.customRule.rulebook.version}`);if(n.customRule.source)a.push(`  Source: ${n.customRule.source}`);if(n.customRule.override)a.push(`  Override: reason ${n.customRule.override.reason}`)}if(n.reason){let p=vt(n.reason,"          ");a.push(`  Reason: ${p[0]}`);for(let f=1;f<p.length;f++)a.push(p[f]??"")}}else a.push(`  Status: ${b.green("ALLOWED")}`);a.push(""),a.push("CONFIG");let i=n.configSource??"none",u=n.configValid?"":" (invalid)";a.push(`  Path: ${i}${u}`),a.push(`  Safety preset: ${n.selectedPreset??"standard"}`),a.push(`  Effective capabilities: ${n.effectiveLevel}`);let o=Object.entries(n.destructiveCommandRuleOverrides??{});if(a.push(`  Rule customizations: ${o.length}`),n.ruleActivation)a.push(`  Rule activation: ${n.ruleActivation.id} — ${n.ruleActivation.enabled?"on":"off"} via ${n.ruleActivation.source}`);return a.join(`
`)}function Nr(n){return JSON.stringify(n,null,2)}var I0="2.0.6",C="  ",B2="cc-safety-net";function N0(n){return n.argument?`${n.flags} ${n.argument}`:n.flags}function ii(n){return Math.max(...n.map((t)=>N0(t).length))}function pi(n){return Math.max(...n.map((t)=>t.usage.length))}function ui(n){return Math.max(...n.map((t)=>`${B2} ${t.usage}`.length))}function vi(n,t){let r=`${B2} ${n.usage}`;return`${C}${r.padEnd(t+2)}${n.description}`}function u2(n,t){return`${C}${n.padEnd(Math.max(40,n.length+2))}${t}`}function ot(n,t=console.log){let r=[];if(r.push(`${B2} ${n.name}`),r.push(""),r.push(`${C}${n.description}`),r.push(""),r.push("USAGE:"),r.push(`${C}${B2} ${n.usage}`),r.push(""),n.subcommands&&n.subcommands.length>0){r.push("SUBCOMMANDS:");let e=pi(n.subcommands);for(let a of n.subcommands)r.push(`${C}${a.usage.padEnd(e+2)}${a.description}`);r.push("")}if(n.options.length>0){r.push("OPTIONS:");let e=ii(n.options);for(let a of n.options){let l=N0(a),s=a.default?`${a.description} (default: ${a.default})`:a.description;r.push(`${C}${l.padEnd(e+2)}${s}`)}r.push("")}if(n.examples&&n.examples.length>0){r.push("EXAMPLES:");for(let e of n.examples)r.push(`${C}${e}`)}t(r.join(`
`))}function ne(){let n=N1(),t=ui(n),r=[];r.push(`${B2} v${I0}`),r.push(""),r.push("Blocks destructive commands and secret access."),r.push(""),r.push("COMMANDS:");for(let e of n)r.push(vi(e,t));r.push(""),r.push("GLOBAL OPTIONS:"),r.push(`${C}-h, --help       Show help (use with command for command-specific help)`),r.push(`${C}-V, --version    Show version`),r.push(""),r.push("HELP:"),r.push(`${C}${B2} help <command>     Show help for a specific command`),r.push(`${C}${B2} <command> --help   Show help for a specific command`),r.push(""),r.push("ENVIRONMENT VARIABLES:"),r.push(u2(`${k.level.name}=standard|strict|paranoid`,"Set session safety level")),r.push(u2(`${k.worktree.name}=1`,"Allow local git discards in linked worktrees")),r.push(u2(`${k.debug.name}=1`,"Print diagnostic messages to stderr")),r.push(u2(`${k.auditScope.name}=all|blocked`,"Record all command decisions, or denials only")),r.push(u2("CC_SAFETY_NET_HOME","Override rule config home directory")),r.push(""),r.push("LEGACY ENVIRONMENT VARIABLES (STILL SUPPORTED):"),r.push(u2(`${k.strict.name}=1`,"Force safety.overrides.fail_closed on")),r.push(u2(`${k.paranoid.name}=1`,"Force paranoid_rm and paranoid_interpreters on")),r.push(u2(`${k.paranoidRm.name}=1`,"Force safety.overrides.paranoid_rm on")),r.push(u2(`${k.paranoidInterpreters.name}=1`,"Force safety.overrides.paranoid_interpreters on")),r.push(""),r.push("Documentation:        https://ccsafetynet.com/docs"),console.log(r.join(`
`))}function nl(){console.log(I0)}function Jn(n,t=console.log){let r=Un(n);if(!r)return!1;if(r.hidden||r.name.toLowerCase()!==n.toLowerCase())return!1;return ot(r,t),!0}import{existsSync as ue,readFileSync as Tl}from"node:fs";import{homedir as n5}from"node:os";import{join as ie}from"node:path";import*as w2 from"node:readline";function oi(n){return n==="install"?"Install":"Uninstall"}function bi(n){return n==="install"?"Installing":"Uninstalling"}function fi(n){return n==="install"?"into":"from"}function el(n){return n?.available===!0}function yi(n,t){let r=new Set(t);return n.filter((e)=>r.has(e.target)).map((e)=>e.target)}function tl(n,t,r){if(n.length===0||n.every((e)=>!e.available))return t;return Array.from({length:n.length},(e,a)=>a+1).map((e)=>(t+e*r+n.length)%n.length).find((e)=>el(n[e]))}function hi(n,t,r){if(r.ctrl&&r.name==="c")return"interrupt";if(r.name==="escape"||t==="q")return"abort";if(n==="install"&&(t==="u"||t==="U"))return"update";if(r.name==="up"||t==="k")return"up";if(r.name==="down"||t==="j")return"down";if(r.name==="space"||t===" ")return"toggle";if(r.name==="return"||r.name==="enter")return"confirm";return null}function wi(n){return{cursor:n.findIndex((t)=>t.available),selected:[]}}function xi(n,t,r){if(r==="confirm"||r==="update"||r==="abort"||r==="interrupt")return{state:n,done:r};if(r==="up")return{state:{...n,cursor:tl(t,n.cursor,-1)}};if(r==="down")return{state:{...n,cursor:tl(t,n.cursor,1)}};let e=t[n.cursor];if(!el(e))return{state:n};let a=n.selected.includes(e.target)?n.selected.filter((l)=>l!==e.target):yi(t,[...n.selected,e.target]);return{state:{...n,selected:a}}}var al="◉",ll="◯",sl=">",dl=" ";function $i(n,t,r,e={}){let a=e.color!==!1,l=a?b.dim:(c)=>c,s=a?b.green:(c)=>c,d=a?b.bold:(c)=>c;return["",`${oi(n)} CC Safety Net ${fi(n)}:`,"",...t.map((c,L)=>{let i=r.selected.includes(c.target),u=L===r.cursor,o=i?al:ll,p=u?sl:dl,f=c.available?"":` (${c.unavailableReason??"not installed"})`,v=`${o} ${c.label}${f}`,h=!c.available?l(v):i?s(v):u?d(v):v;return`${p} ${h}`}),"",n==="install"?"Space: select  Enter: confirm  u: update installed  Up/Down: move  q/Esc: cancel":t.some((c)=>c.available)?"Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel":`No selectable integrations found for ${n}. q/Esc: close`].join(`
`)}var rl=["global-hook","plugin"];function mi(n,t,r={}){let e=r.color!==!1?b.bold:(l)=>l;return["","Install the Kimi Code integration as:","",...[`Global hook — ${t?"already installed; selecting it reports the current state":"write the hook into ~/.kimi-code/config.toml now"}`,"Native Kimi plugin — print the steps to run inside Kimi Code"].map((l,s)=>{let d=s===n,c=`${d?al:ll} ${l}`;return`${d?sl:dl} ${d?e(c):c}`}),"","Enter: confirm  Up/Down: move  q/Esc: cancel"].join(`
`)}function cl(n){let{input:t,output:r}=n;w2.emitKeypressEvents(t);let e=t.isRaw===!0;t.setRawMode(!0),t.resume();let a=0,l=()=>{if(a===0)return;w2.moveCursor(r,0,-a),w2.cursorTo(r,0),w2.clearScreenDown(r)},s=()=>{l();let d=n.render();r.write(`${d}
`),a=d.split(`
`).length};return new Promise((d)=>{let c=(i)=>{t.off("keypress",L),t.setRawMode(e),t.pause(),l(),d(i)};function L(i,u){n.onKey(i,u,{finish:c,draw:s})}t.on("keypress",L),s()})}function Ll(n={}){let t=0;return cl({input:n.input??process.stdin,output:n.output??process.stdout,render:()=>mi(t,n.globalHookInstalled===!0),onKey:(r,e,a)=>{if(e.ctrl&&e.name==="c"){a.finish(null),(n.onInterrupt??(()=>process.kill(process.pid,"SIGINT")))();return}if(e.name==="escape"||r==="q")return a.finish(null);if(e.name==="return"||e.name==="enter")return a.finish(rl[t]);if(e.name==="up"||e.name==="down"||r==="k"||r==="j")t=(t+1)%rl.length,a.draw()}})}function te(n=process.stdin,t=process.stdout){return Boolean(n.isTTY&&t.isTTY&&typeof n.setRawMode==="function")}function il(n,t,r={}){let e=r.output??process.stdout,a=wi(t);return cl({input:r.input??process.stdin,output:e,render:()=>$i(n,t,a),onKey:(l,s,d)=>{let c=hi(n,l,s);if(!c)return;let L=xi(a,t,c);if(a=L.state,L.done==="interrupt"){d.finish(null),(r.onInterrupt??(()=>process.kill(process.pid,"SIGINT")))();return}if(L.done==="abort")return d.finish(null);if(L.done==="update")return d.finish("update");if(L.done==="confirm"){if(a.selected.length===0){e.write("\x07"),d.draw();return}d.finish([...a.selected]),e.write(`${bi(n)} selected integrations...
`);return}d.draw()}})}import{existsSync as ul,lstatSync as vl,mkdtempSync as Di,readFileSync as yt,rmSync as ol}from"node:fs";import{tmpdir as ki}from"node:os";import{dirname as qi,join as J2}from"node:path";import{fileURLToPath as ji}from"node:url";var re="// cc-safety-net managed Amp plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --amp";import{spawn as gi}from"node:child_process";var ee=(n,t)=>{let r=y2([...n],process.env);return new Promise((e)=>{let a=gi(r.cmd,r.args,{cwd:t,stdio:["ignore","pipe","pipe"]}),l=Wr(a),s=!1,d=setTimeout(()=>{s=!0,a.kill()},120000);a.on("error",(c)=>{clearTimeout(d),e({status:null,errorCode:c.code,stdout:l.stdout,stderr:[c.message,l.stderr].filter(Boolean).join(`
`)})}),a.on("close",(c)=>{clearTimeout(d),e({status:s?null:c,errorCode:s?"ETIMEDOUT":void 0,stdout:l.stdout,stderr:l.stderr})})})};var pl=J2("amp","cc-safety-net.ts"),v2="cc-safety-net.ts";function zi(n){return J2(n,".config","amp","plugins",v2)}function Fi(){let n=qi(ji(import.meta.url));return[J2(n,"..",pl),J2(n,"..","..","..","dist",pl)]}function Bi(n=Fi()){let t=n.find((r)=>ul(r)&&vl(r).isFile());if(!t)throw Error("Packaged Amp plugin artifact not found. Reinstall cc-safety-net and try again.");return t}function bl(n){try{return vl(n)}catch{return}}function fl(n){try{return JSON.parse(n)}catch{return}}function yl(n){return n.subarray(0,Buffer.byteLength(re)).toString("utf-8")===re}async function Zn(n,t,r){let e=await n(t,r);if(e.status===0)return e;throw Error([`Failed to run ${t.join(" ")}${e.status===null?"":` (exit ${e.status})`}.`,[e.stdout,e.stderr].filter(Boolean).join(`
`).trim()].filter(Boolean).join(`
`))}async function hl(n){let t=await n(["amp","plugins","repositories","--json"]);if(t.status===null)throw Error(`${t.errorCode==="ENOENT"?'Amp CLI not found. Install the amp CLI, sign in with "amp login", and rerun install --amp.':`amp plugins repositories --json did not finish (${t.errorCode??"terminated"}). Check that the amp CLI responds and rerun install --amp.`}
${t.stderr}`.trim());if(t.status!==0)throw Error(`Failed to run amp plugins repositories --json (exit ${t.status}). Sign in with "amp login" and rerun install --amp.
${[t.stdout,t.stderr].filter(Boolean).join(`
`)}`.trim());let r=fl(t.stdout),e=(Array.isArray(r)?r:[]).filter((a)=>x(a,"scope")==="user"&&x(a,"exists")===!0&&x(a,"viewerCanWrite")===!0).map((a)=>x(a,"cloneRef")).find((a)=>typeof a==="string"&&a.length>0);if(!e)throw Error('Your Amp account has no writable Personal Plugins repository. Sign in with "amp login", open Amp once to create it, and rerun install --amp.');return e}async function wl(n,t){let r=Di(J2(ki(),"cc-safety-net-amp-"));try{return await Zn(n,["amp","clone","user-plugins",r]),await t(r)}finally{ol(r,{recursive:!0,force:!0})}}function xl(n,t){let r=J2(n,v2),e=bl(r);if(!e)return;if(e.isSymbolicLink()||!e.isFile())throw Error(`Refusing to ${t} ${v2} in your Amp personal plugins repository: not a regular file. Remove it there and rerun install --amp.`);let a=yt(r);if(yl(a))return a;throw Error(`Refusing to ${t} unmanaged file ${v2} in your Amp personal plugins repository. Remove it there and rerun install --amp.`)}async function $l(n,t,r,e){if(await Zn(n,r,t),(await Zn(n,["git","status","--porcelain"],t)).stdout.trim()==="")return!1;return await Zn(n,["git","-c","commit.gpgsign=false","-c","user.name=cc-safety-net","-c","user.email=cc-safety-net@localhost","commit","-m",e],t),await Zn(n,["git","push","origin","HEAD"],t),!0}function bt(n,t){let r=zi(n),e=bl(r);if(!e)return;if(!e.isSymbolicLink()&&e.isFile()&&yl(yt(r))){ol(r);return}if(t==="keep")return;throw Error(`Local Amp plugin ${r} is not a managed copy and masks the personal plugin. Remove it and rerun install --amp.`)}function Ji(){let n=bn();if(!ul(n))return"";let t=fl(yt(n,"utf-8"));if(!t||typeof t!=="object"||Array.isArray(t))return"";return`;globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__ = ${JSON.stringify(ft(t))};
`}async function ml(n,t=Bi(),r=ee){let e=Buffer.concat([yt(t),Buffer.from(Ji(),"utf-8")]),a=await hl(r);return wl(r,async(l)=>{let s=`${a}/${v2}`;if(xl(l,"overwrite")?.equals(e))return bt(n,"fail"),{path:s,alreadyInstalled:!0};Z(J2(l,v2),e);let d=await $l(r,l,["git","add",v2],`chore: update cc-safety-net plugin to v${F()}`);return bt(n,"fail"),{path:s,alreadyInstalled:!d}})}async function gl(n,t=ee){let r=await hl(t);return wl(t,async(e)=>{let a=`${r}/${v2}`;if(!xl(e,"remove"))return bt(n,"keep"),{path:a,alreadyInstalled:!1};return await $l(t,e,["git","rm",v2],`chore: remove cc-safety-net plugin v${F()}`),bt(n,"keep"),{path:a,alreadyInstalled:!0}})}import{existsSync as Dl,mkdirSync as Zi,readFileSync as Qi}from"node:fs";import{dirname as Xi}from"node:path";var ae="npx -y cc-safety-net hook --agy-cli",x2="cc-safety-net";function wt(){return{PreToolUse:[{hooks:[{type:"command",command:ae,timeout:30}]}]}}function kl(n){try{let t=JSON.parse(Qi(n,"utf-8"));if(!t||typeof t!=="object"||Array.isArray(t))throw Error("Antigravity hooks config must be a JSON object");return t}catch(t){if(t instanceof SyntaxError)throw Error(`Failed to parse Antigravity hooks config ${n}: ${t.message}`);throw t}}function ql(n){let t=n[x2];if(t===void 0)return n[x2]=wt(),n[x2];if(!t||typeof t!=="object"||Array.isArray(t))throw Error(`Antigravity hooks config entry "${x2}" must be an object`);if(!Array.isArray(t.PreToolUse))t.PreToolUse=[];return t}function jl(n){if(!Array.isArray(n.PreToolUse))return!1;return n.PreToolUse.some((t)=>Array.isArray(t.hooks)&&t.hooks.some((r)=>r.command===ae))}function Yi(n){return Object.values(n).some((t)=>t.enabled!==!1&&jl(t))}function Si(n){if(n[x2]===void 0)return!1;let t=ql(n);if(t.enabled!==!1||!jl(t))return!1;return t.enabled=!0,!0}function Hi(n){if(n[x2]===void 0){n[x2]=wt();return}let t=ql(n);t.PreToolUse??=[],t.enabled=!0,t.PreToolUse.push(wt().PreToolUse?.[0]??{hooks:[]})}function Ri(n){let t=!1;for(let r of Object.values(n)){if(!Array.isArray(r.PreToolUse))continue;r.PreToolUse=r.PreToolUse.flatMap((e)=>{if(!Array.isArray(e.hooks))return[e];let a=e.hooks.filter((l)=>l.command!==ae);if(a.length!==e.hooks.length)t=!0;return a.length===0?[]:[{...e,hooks:a}]})}return t}function ht(n,t){Z(n,`${JSON.stringify(t,null,2)}
`)}function zl(n){let t=Dn(n);if(Zi(Xi(t),{recursive:!0}),!Dl(t))return ht(t,{[x2]:wt()}),{path:t,alreadyInstalled:!1};let r=kl(t);if(Yi(r))return{path:t,alreadyInstalled:!0};if(Si(r))return ht(t,r),{path:t,alreadyInstalled:!1};return Hi(r),ht(t,r),{path:t,alreadyInstalled:!1}}function Fl(n){let t=Dn(n);if(!Dl(t))return{path:t,alreadyInstalled:!1};let r=kl(t);if(!Ri(r))return{path:t,alreadyInstalled:!1};return ht(t,r),{path:t,alreadyInstalled:!0}}import{spawn as Wi,spawnSync as Ai}from"node:child_process";var O=M.map((n)=>({target:n.id,flag:n.flag,label:j(n.id),probeCommand:n.probeCommand})),Bl=new Map(O.map((n)=>[n.flag,n.target]));function le(n){let t=new Set(n);return O.map((r)=>r.target).filter((r)=>t.has(r))}async function Jl(n,t){for(let r of n)await t(r)}var Zl=5000;function Ki(n){let t=y2([...n],process.env),r=Ai(t.cmd,t.args,{env:process.env,stdio:"ignore",timeout:Zl});return!r.error&&r.status===0}function de(n){return new Promise((t)=>{let r=y2([...n],process.env),e=Wi(r.cmd,r.args,{env:process.env,stdio:"ignore"}),a=!1,l=(d)=>{if(a)return;a=!0,clearTimeout(s),t(d)},s=setTimeout(()=>{e.kill(),l(!1)},Zl);e.on("error",()=>l(!1)),e.on("close",(d)=>l(d===0))})}function Vi(n=Ki,t={}){let r=new Set(t.configuredTargets??[]);if(t.async)return Promise.all(O.map(async(a)=>({target:a.target,flag:a.flag,label:a.label,...se(t.action,await n(a.probeCommand),r.has(a.target))})));let e=n;return O.map((a)=>({target:a.target,flag:a.flag,label:a.label,...se(t.action,e(a.probeCommand),r.has(a.target))}))}function Ql(n=de,t={}){return Vi(n,{...t,async:!0})}function Xl(n,t){let r=new Set(t.configuredTargets??[]);return n.map((e)=>({...e,...se(t.action,e.available,r.has(e.target))}))}function se(n,t,r){if(n==="uninstall")return r?{available:!0}:{available:!1,unavailableReason:"not installed"};if(n==="install"&&r)return{available:!1,unavailableReason:"already installed"};if(!t)return{available:!1,unavailableReason:"CLI not installed"};return{available:!0}}import{existsSync as Yl,readdirSync as Mi,rmSync as Gi}from"node:fs";import{join as en}from"node:path";function xt(n,t=process.platform){let r=en(process.env.npm_config_cache||(t==="win32"?en(process.env.LOCALAPPDATA||en(n,"AppData","Local"),"npm-cache"):en(n,".npm")),"_npx");if(!Yl(r))return;Mi(r).filter((e)=>Yl(en(r,e,"node_modules","cc-safety-net"))).forEach((e)=>{Gi(en(r,e),{recursive:!0,force:!0})})}import{existsSync as Hl,mkdirSync as Ui,readFileSync as Rl}from"node:fs";import{dirname as Ci,join as Sl}from"node:path";var Qn="npx -y cc-safety-net hook --kimi-code",ce=`[[hooks]]
event = "PreToolUse"
command = "${Qn}"`,Le=`{ event = "PreToolUse", command = "${Qn}" }`;function Wl(n){return Sl(process.env.KIMI_CODE_HOME??Sl(n,".kimi-code"),"config.toml")}function Oi(n){return n.split(`
`).reduce((r,e)=>{if(/^\s*\[/.test(e))return r.activeTable=!0,r.lines.push(e),r;if(!r.activeTable&&/^\s*hooks\s*=\s*\[\s*]\s*(?:#.*)?$/.test(e))return r;return r.lines.push(e),r},{activeTable:!1,lines:[]}).lines.join(`
`)}function Ti(n,t){if(n[t]!=="#")return t;let r=n.indexOf(`
`,t+1);return r===-1?n.length:r+1}function _i(n,t){return ct(n,t,{skipComment:Ti,stringError:"Unterminated string in Kimi Code config",bracketError:"Unmatched hooks array in Kimi Code config"})}function Al(n){let t=!1,r=0;while(r<n.length){let e=n.indexOf(`
`,r),a=e===-1?n.length:e,l=n.slice(r,a);if(/^\s*\[/.test(l))t=!0;if(!t){let s=/^(\s*)hooks\s*=\s*\[/.exec(l);if(s){let d=r+s[0].lastIndexOf("[");return{start:d,end:_i(n,d)}}}r=e===-1?n.length:e+1}return}function Ei(n,t){let r=n.slice(0,t.end).trimEnd(),e=J0(n,t.end),a=e===""?"     ":`${e}  `,l=!r.endsWith("[")&&!r.endsWith(",");return`${r}${l?",":""}
${a}${Le}${n.slice(t.end)}`}function Pi(n){let t=Al(n);if(t&&n.slice(t.start+1,t.end).trim())return Ei(n,t);let r=Oi(n).trimEnd();if(r==="")return`${ce}
`;return`${r}

${ce}
`}function Ii(n){return n.split(/(?=^\s*\[)/m).filter((r)=>!/^\s*\[\[hooks]]\s*$/m.test(r)||!r.includes(Qn)).join("").trimEnd()}function Ni(n,t){let r=n.indexOf(Le,t.start);if(r===-1||r>t.end)return n;return Lt(n,{start:r,end:r+Le.length})}function Kl(n){let t=Wl(n);if(Ui(Ci(t),{recursive:!0}),!Hl(t))return Z(t,`${ce}
`),{path:t,alreadyInstalled:!1};let r=Rl(t,"utf-8");if(r.includes(Qn))return{path:t,alreadyInstalled:!0};return Z(t,Pi(r)),{path:t,alreadyInstalled:!1}}function Vl(n){let t=Wl(n);if(!Hl(t))return{path:t,alreadyInstalled:!1};let r=Rl(t,"utf-8");if(!r.includes(Qn))return{path:t,alreadyInstalled:!1};let e=Al(r),a=e?Ni(r,e):`${Ii(r)}
`;return Z(t,a),{path:t,alreadyInstalled:!0}}var pe="safety-net@cc-marketplace",Ml=new Set(["claude-code","codex","copilot-cli","gemini-cli","hermes-agent","openclaw","opencode","pi"]),Gl=new Set(["antigravity-cli","cursor","hermes-agent","kimi-code"]);function ve(n){return/^\s*safety-net@cc-marketplace[^a-z0-9-][^\n]*installed,/m.test(n??"")}function _l(n){return/^\s*cc-safety-net[^a-z0-9-][^\n]*installed,/m.test(n??"")}function t5(n){return/^Marketplace `cc-marketplace`\s*$/m.test(n??"")}var El={"claude-code":{installCommands:(n)=>{let t=Nn(n,"cc-safety-net@cc-marketplace");return{commands:[...t?[["claude","plugin","marketplace","update","cc-marketplace"],["claude","plugin","update","cc-safety-net@cc-marketplace"]]:[["claude","plugin","marketplace","add","kenryu42/cc-marketplace"],["claude","plugin","marketplace","update","cc-marketplace"],["claude","plugin","install","cc-safety-net@cc-marketplace"]],...gr(n).status==="disabled"?[["claude","plugin","enable","cc-safety-net@cc-marketplace"]]:[]],cleanupCommands:Nn(n,pe)?[["claude","plugin","uninstall",pe]]:[],update:t}},uninstallCommands:[["claude","plugin","uninstall","cc-safety-net@cc-marketplace"],["claude","plugin","marketplace","remove","cc-marketplace"]]},codex:{installCommands:async(n,t)=>{let r=t??await a2(["codex","plugin","list"]),e=_l(r);return{commands:[e||t5(r)?["codex","plugin","marketplace","upgrade","cc-marketplace"]:["codex","plugin","marketplace","add","kenryu42/cc-marketplace"],["codex","plugin","add","cc-safety-net@cc-marketplace"]],cleanupCommands:ve(r)?[["codex","plugin","remove","safety-net@cc-marketplace"]]:[],update:e}},uninstallCommands:[["codex","plugin","remove","cc-safety-net@cc-marketplace"],["codex","plugin","marketplace","remove","cc-marketplace"]],postInstallMessage:"Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it."},"copilot-cli":{installCommands:async()=>{let n=await a2(["copilot","plugin","list"]),t=[...Ma(n)?[["copilot","plugin","uninstall","copilot-safety-net"]]:[],...Ga(n)?[["copilot","plugin","uninstall",Aa]]:[]];if(Ka(n))return{commands:[["copilot","plugin","marketplace","update","cc-marketplace"],["copilot","plugin","update",e2]],cleanupCommands:t,update:!0};return{commands:[Va(await a2(["copilot","plugin","marketplace","list"]))?["copilot","plugin","marketplace","update","cc-marketplace"]:["copilot","plugin","marketplace","add","kenryu42/cc-marketplace"],["copilot","plugin","install",e2]],cleanupCommands:t}},uninstallCommands:[["copilot","plugin","uninstall","cc-safety-net@cc-marketplace"],["copilot","plugin","marketplace","remove","cc-marketplace"]]},"gemini-cli":{installCommands:(n)=>{let t=Br(n);if(t.status==="configured")return{commands:[["gemini","extensions","update","gemini-safety-net"]],update:!0};if(t.status==="disabled")return{commands:[["gemini","extensions","update","gemini-safety-net"],["gemini","extensions","enable","gemini-safety-net"]],update:!0};return{commands:[["gemini","extensions","install","https://github.com/kenryu42/gemini-safety-net","--consent"]]}},uninstallCommands:[["gemini","extensions","uninstall","gemini-safety-net"]]},openclaw:{beforeInstall:Mr,installCommands:()=>({commands:g0()}),uninstallCommands:[["openclaw","plugins","uninstall",z,"--force"]],postInstallMessage:["Restart the OpenClaw Gateway to apply the change.","If plugins.allow is set in openclaw.json, it must also list cc-safety-net."].join(`
`)},opencode:{beforeInstall:Cr,installCommands:[["opencode","plugin","-g","-f","cc-safety-net@latest"]]},pi:{installCommands:[["pi","install","npm:cc-safety-net"]],uninstallCommands:[["pi","uninstall","npm:cc-safety-net"]]}};function gt(){return process.env.HOME??n5()}function Pl(n,t=(r)=>r){try{let r=JSON.parse(t(Tl(n,"utf-8")));if(!r||typeof r!=="object"||Array.isArray(r))throw Error(`Settings file ${n} must be a JSON object`);return r}catch(r){if(r instanceof SyntaxError)throw Error(`Failed to parse ${n}: ${r.message}`);throw r}}function r5(n){let t=ie(kn(n),"settings.json");if(!ue(t))return;let r=Pl(t,V),e=r.enabledPlugins;if(!e||typeof e!=="object"||Array.isArray(e))return;if(e[e2]!==!1)return;let a=Tl(t,"utf-8"),l=a.replace(new RegExp(`("${e2}"\\s*:\\s*)false`),"$1true");return e[e2]=!0,Z(t,l!==a?l:`${JSON.stringify(r,null,2)}
`),`Enabled ${e2} plugin in ${t}`}function e5(n){let t=Or(n);if(!ue(t))return;let r=Pl(t);if(!Array.isArray(r.packages))return;let e=r.packages.find((a)=>!!a&&typeof a==="object"&&!Array.isArray(a)&&Tr(a.source)&&("extensions"in a));if(!e)return;return delete e.extensions,Z(t,`${JSON.stringify(r,null,2)}
`),`Enabled npm:cc-safety-net extensions in ${t}`}function Ul(n,t){let r=B({label:t,booleans:Object.fromEntries(O.map((l)=>[l.target,[l.flag]]))},n),e=r.errors[0];if(e)throw Error(e);let a=O.filter((l)=>r.flags[l.target]).map((l)=>l.target);if(a.length!==1)throw Error(`Choose exactly one ${t} target: ${[...Bl.keys()].join(", ")}`);return a[0]}async function Il(n=gt(),t=_2){let[r,e,a]=await Promise.all([t(["amp","plugins","list"],30000),t(["codex","plugin","list"],30000),t(["copilot","--binary-version"])]);return{codexPluginListOutput:e,hooks:rn(process.cwd(),{homeDir:n,ampPluginListOutput:r,codexPluginListOutput:e,copilotCliVersion:a})}}async function a5(n,t=_2){let r=await Il(gt(),t);return r.hooks.filter((e)=>n==="install"?e.configured:e.detected||e.inspectionStatus==="not-inspected").filter((e)=>e.platform!=="codex"||!ve(r.codexPluginListOutput)||_l(r.codexPluginListOutput)).map((e)=>e.platform)}function l5(n,t,r){if(t.length>0)return{finish:async()=>[Ul(t,n)]};if(!r.selectTargets&&!te(r.input,r.output))return{finish:async()=>[Ul(t,n)]};let e=r.detectConfiguredTargets??(()=>a5(n,r.fetchVersion)),a=Promise.all([Ql(r.probeTargets),e()]);return{ready:a,finish:async()=>{let[l,s]=await a,d=Xl(l,{action:n,configuredTargets:s}),c=r.selectTargets?await r.selectTargets(n,Ol(n,d)):await il(n,Ol(n,d),{input:r.input,output:r.output});if(c==="update")return c;if(!c||c.length===0)return null;return le(c)}}}async function Z2(n,t,r=!1,e){let a=El[n];a.beforeInstall?.(t);let l=typeof a.installCommands==="function"?await a.installCommands(t,e):{commands:a.installCommands};return await Ar(l.commands),await y0(l.cleanupCommands??[]),[`${l.update||r?"Updated":"Installed"} ${j(n)} integration`,a.postInstallMessage].filter(Boolean).join(`
`)}async function an(n){let t=El[n];if(!t.uninstallCommands)throw Error(`${j(n)} uninstall is not supported`);return await Ar(t.uninstallCommands),`Uninstalled ${j(n)} integration`}function s5(n){let t=V0(n);return t.alreadyInstalled?`Uninstalled OpenCode plugin from ${t.path}`:`OpenCode plugin not installed in ${t.path}`}var d5={"antigravity-cli":{install:zl,uninstall:Fl},cursor:{install:n0,uninstall:t0},"kimi-code":{install:Kl,uninstall:Vl}};function ln(n,t,r,e=!1){if(n==="install"&&!e)xt(r);let a=d5[t][n](r),l=j(t),s=n!=="install"?"Uninstalled":e?"Updated":"Installed";return n==="install"&&a.alreadyInstalled?e?`${l} hook up to date in ${a.path}`:`${l} hook already installed in ${a.path}`:n==="uninstall"&&!a.alreadyInstalled?`${l} hook not installed in ${a.path}`:`${s} ${l} hook ${n==="install"?"in":"from"} ${a.path}`}var c5={amp:{install:ml,uninstall:gl,restartNote:'Amp personal plugins apply to every Amp session, including Orb threads. Restart Amp or run "plugins: reload" to apply the change.'},"hermes-agent":{install:d0,uninstall:c0,afterInstall:async(n)=>{let t=Hr(n);return await a2(["hermes","plugins","enable",G,"--no-allow-tool-override"]),!t},beforeUninstall:async(n)=>{Sr(n);try{await a2(["hermes","plugins","disable",G])}catch(t){console.warn(`${t instanceof Error?t.message:String(t)}
Removing the plugin files anyway; ${G} may still be listed in the Hermes config.`)}},restartNote:"Restart Hermes to apply the change."}};async function $t(n,t,r,e=!1){let a=c5[t];if(n==="uninstall")await a.beforeUninstall?.(r);let l=n==="install"?await a.install(r):await a.uninstall(r),s=n==="install"&&await a.afterInstall?.(r),d=j(t),c=!s&&(n==="install"&&l.alreadyInstalled||n==="uninstall"&&!l.alreadyInstalled);return[c?n==="install"?`${d} plugin ${e?"up to date":"already installed"} at ${l.path}`:`${d} plugin not installed at ${l.path}`:`${n!=="install"?"Uninstalled":e?"Updated":"Installed"} ${d} plugin ${n==="install"?"at":"from"} ${l.path}`,c?void 0:a.restartNote].filter(Boolean).join(`
`)}var L5={amp:{install:(n,t)=>$t("install","amp",n,t),uninstall:(n)=>$t("uninstall","amp",n)},"antigravity-cli":{install:(n,t)=>ln("install","antigravity-cli",n,t),uninstall:(n)=>ln("uninstall","antigravity-cli",n)},"claude-code":{install:(n,t)=>Z2("claude-code",n,t),uninstall:()=>an("claude-code")},codex:{install:(n,t,r)=>Z2("codex",n,t,r),uninstall:()=>an("codex")},"copilot-cli":{install:async(n,t)=>[await Z2("copilot-cli",n,t),r5(n)].filter(Boolean).join(`
`),uninstall:()=>an("copilot-cli")},cursor:{install:(n,t)=>ln("install","cursor",n,t),uninstall:(n)=>ln("uninstall","cursor",n)},"gemini-cli":{install:(n,t)=>Z2("gemini-cli",n,t),uninstall:()=>an("gemini-cli")},"hermes-agent":{install:(n,t)=>{if(!t)xt(n);return $t("install","hermes-agent",n,t)},uninstall:(n)=>$t("uninstall","hermes-agent",n)},"kimi-code":{install:(n,t)=>ln("install","kimi-code",n,t),uninstall:(n)=>ln("uninstall","kimi-code",n)},openclaw:{install:async(n,t)=>{let r=await Z2("openclaw",n,t);return await D0(),r},uninstall:(n)=>{return Mr(n),an("openclaw")}},opencode:{install:async(n,t)=>{let r=await Z2("opencode",n,t);return await R0(n),r},uninstall:(n)=>s5(n)},pi:{install:async(n,t)=>[await Z2("pi",n,t),e5(n)].filter(Boolean).join(`
`),uninstall:()=>an("pi")}},Cl=["Install CC Safety Net as a native Kimi Code plugin:","","  1. Start Kimi Code and run: /plugins install https://github.com/kenryu42/cc-safety-net","     Confirm the trust prompt; it defaults to cancel.","  2. Run /reload, or start a new session.","","Note: Kimi Code hooks are fail-open. When the hook process cannot start, crashes, or times","out, Kimi Code allows the tool call."].join(`
`);function i5(n){if(zn({homeDir:n,cwd:process.cwd()}).status!=="configured")return Cl;return[Cl,"",b.red(["CAUTION: the global Kimi Code hook is installed and will run alongside the plugin.","After the plugin is active, remove it with: cc-safety-net uninstall --kimi-code"].join(`
`))].join(`
`)}function Ol(n,t){return t.map((r)=>n==="install"&&r.target==="kimi-code"&&r.unavailableReason==="already installed"?{...r,available:!0,unavailableReason:void 0,label:`${r.label} (global hook installed)`}:r)}function p5(n,t){if(n.selectKimiInstallMethod)return n.selectKimiInstallMethod();if(!te(n.input,n.output))return Promise.resolve("global-hook");return Ll({input:n.input,output:n.output,globalHookInstalled:zn({homeDir:t,cwd:process.cwd()}).status==="configured"})}async function Nl(n,t,r,e=!1,a){return L5[t][n](r,e,a)}function u5(n){let t=B({label:"update"},n).errors[0];if(t)throw Error(t)}async function v5(n,t=_2){let r=await Il(n,t),e=ie(kn(n),"installed-plugins");return{targets:le([...r.hooks.filter((l)=>l.platform!=="copilot-cli"&&l.detected).map((l)=>l.platform),...[nt,Wa,Ra].flatMap((l)=>ue(ie(e,...l))?["copilot-cli"]:[]),...Nn(n,pe)?["claude-code"]:[],...ve(r.codexPluginListOutput)?["codex"]:[]]),codexPluginListOutput:r.codexPluginListOutput}}async function o5(n){let t=gt(),r=n.output??process.stdout,e=v5(t,n.fetchVersion??_2).then(async(d)=>{let c=new Set(d.targets);return{targets:d.targets,codexPluginListOutput:d.codexPluginListOutput,available:new Map(await Promise.all(O.filter((L)=>c.has(L.target)&&Ml.has(L.target)).map(async(L)=>[L.target,await de(L.probeCommand)])))}}),a=await gn(n.showBanner??!0,()=>({ready:e,finish:()=>e}),()=>mn({input:n.input??process.stdin,output:r}),{loadingMessage:"Checking installed integrations…",output:r});if(a.targets.length===0)return r.write("No installed integrations found. Run `cc-safety-net install` to set one up.\n"),0;let l=a.targets.some((d)=>Gl.has(d))?await Promise.resolve().then(()=>{return xt(t),null}).catch((d)=>mt(d)):null,s=await En(Promise.all(a.targets.map((d)=>{if(Ml.has(d)&&!a.available.get(d))return Promise.resolve({message:`${j(d)} not found; skipped`,failed:!1});if(l!==null&&Gl.has(d))return Promise.resolve({message:l,failed:!0});return Nl("install",d,t,!0,a.codexPluginListOutput).then((c)=>({message:c,failed:!1}),(c)=>({message:mt(c),failed:!0}))})),{loadingMessage:`Updating ${a.targets.length} integration${a.targets.length===1?"":"s"}…`,output:r});return s.forEach((d)=>{d.failed?console.error(d.message):r.write(`${d.message}
`)}),s.some((d)=>d.failed)?1:0}function oe(n,t={}){return Promise.resolve().then(()=>u5(n)).then(()=>o5(t)).catch((r)=>{return console.error(mt(r)),1})}async function Xn(n,t,r={}){try{let e=await gn(!0,()=>l5(n,t,r),()=>mn({input:r.input??process.stdin,output:r.output??process.stdout}),{loadingMessage:n==="install"?"Checking available integrations…":"Checking installed integrations…",output:r.output??process.stdout});if(!e)return(r.output??process.stdout).write(`Cancelled: nothing was ${n}ed.
`),0;if(e==="update")return(r.runUpdate??(()=>oe([],{fetchVersion:r.fetchVersion,input:r.input,output:r.output,showBanner:!1})))();let a=gt(),l=r.output??process.stdout;return await Jl(e,async(s)=>{if(s==="kimi-code"&&n==="install"){let c=await p5(r,a);if(c===null){l.write(`Cancelled: Kimi Code integration was not installed.
`);return}if(c==="plugin"){l.write(`${i5(a)}
`);return}}let d=await En(Nl(n,s,a),{loadingMessage:`${n==="install"?"Installing":"Uninstalling"} ${j(s)} integration…`,output:l});l.write(`${d}
`)}),0}catch(e){return console.error(mt(e)),1}}function mt(n){let t=n instanceof Error?n.message:String(n),r=typeof n==="object"&&n!==null&&"code"in n?n.code:null;if(r==="EACCES"||r==="EPERM")return`${t}
Check file permissions for the target config file and parent directory.`;if(r==="ENOENT")return`${t}
Check that the target config path and parent directory exist.`;if(r==="ENOTDIR")return`${t}
Check that every parent path component is a directory.`;return t}import{join as I5}from"node:path";var n3="# Custom Rules Reference\n\nAgent reference for generating CC Safety Net rulebook configuration.\n\n## Config Locations\n\n| Scope | Config path | Rulebook path | Cache path | Priority |\n|-------|-------------|---------------|------------|----------|\n| User | `~/.cc-safety-net/rules/rule.json` | `~/.cc-safety-net/rules/<rulebook-name>/rulebook.json` | `~/.cc-safety-net/cache/rulebooks/` | First |\n| Project | `.cc-safety-net/rules/rule.json` | `.cc-safety-net/rules/<rulebook-name>/rulebook.json` | `.cc-safety-net/cache/rulebooks/` | Second |\n| GitHub source | Listed in a local `rule.json` | `.cc-safety-net/rules/<rulebook-name>/rulebook.json` in the source repository | Consumer local cache | Source order |\n\nUser scope is evaluated before project scope; within a scope, sources apply in `rules` array order. A duplicate active rulebook name keeps the first claim and ignores the later rulebook with a warning, so a user-scoped name shadows a project-scoped one.\n\nUse `cc-safety-net rule init` to create an inert local config. Use `--global` for user scope. Use `cc-safety-net rule init --example` to also create an inactive example rulebook. `CC_SAFETY_NET_HOME` overrides the `~/.cc-safety-net` user root.\n\nLegacy inline `.safety-net.json` and `~/.cc-safety-net/config.json` files are not loaded at runtime. Convert them with `cc-safety-net rule migrate`.\n\n## rule.json Schema\n\n```json\n{\n  \"version\": 1,\n  \"rules\": [\"project-rules\", \"owner/repo#main/team-rules\"],\n  \"overrides\": {\n    \"project-rules/block-docker-system-prune\": {\n      \"reason\": \"Use targeted Docker cleanup commands.\"\n    },\n    \"team-rules/block-npm-global\": \"off\"\n  },\n  \"transparent_wrappers\": [\"rtk\"]\n}\n```\n\n- `version`: Required. Must be `1`.\n- `$schema`: Optional. `cc-safety-net rule verify` inserts it into a valid `rule.json` that lacks it.\n- `rules`: Optional array of rulebook source strings. Missing `rules` is treated as `[]`.\n- `overrides`: Optional object keyed by `<rulebook-name>/<rule-name>`.\n- `overrides` values are either `\"off\"` to disable a rule or an object with a required `reason` (replacement block reason) and an optional `intent` (one of `hard_stop`, `use_alternative`, `scope_down`, `manual_only`, `stop_and_explain`).\n- A project override cannot target a user-scoped rule: only that override is ignored, the user rule keeps its configured state, and `rule sync`/`rule verify` report the diagnostic as a failure.\n- `transparent_wrappers`: Optional array of command names that transparently execute a visible child command.\n- Transparent wrappers have no built-in defaults. Configure only wrappers you intentionally trust, such as `\"rtk\"`.\n- Use `cc-safety-net rule wrapper add rtk` to configure RTK without manually editing `rule.json`.\n\n## Rulebook Sources\n\n- Local sources are bare rulebook names such as `project-rules`; the rulebook file is `.cc-safety-net/rules/project-rules/rulebook.json`.\n- GitHub sources use `owner/repo#ref/<rulebook-name>`.\n- GitHub refs must be one path segment, such as a tag, SHA, or branch name without `/`.\n- The GitHub source name, the repository directory name, and the rulebook `name` must match exactly.\n- Rulebook source strings must be unique in a config.\n\n## rulebook.json Schema\n\n```json\n{\n  \"rulebook_version\": 1,\n  \"name\": \"project-rules\",\n  \"version\": \"1.0.0\",\n  \"description\": \"Project-specific CC Safety Net rules.\",\n  \"author\": \"project\",\n  \"allowed_commands\": [\"docker\"],\n  \"rules\": [\n    {\n      \"name\": \"block-docker-system-prune\",\n      \"command\": \"docker\",\n      \"subcommand\": \"system\",\n      \"block_args\": [\"prune\"],\n      \"reason\": \"Use targeted cleanup instead.\"\n    }\n  ],\n  \"tests\": [\n    {\n      \"command\": \"docker system prune\",\n      \"expect\": \"blocked\",\n      \"rule\": \"block-docker-system-prune\"\n    },\n    {\n      \"command\": \"docker ps\",\n      \"expect\": \"allowed\"\n    }\n  ]\n}\n```\n\n### Rulebook Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `rulebook_version` | Yes | Must be `1` |\n| `name` | Yes | `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$` |\n| `version` | Yes | Non-empty string |\n| `description` | No | Free text; not type-checked at runtime |\n| `author` | No | Free text; not type-checked at runtime |\n| `allowed_commands` | Yes | Unique command names matching `^[a-zA-Z][a-zA-Z0-9_-]*$` |\n| `rules` | Yes | Array of rule objects |\n| `tests` | No | Array of fixtures |\n\n### Rule Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `name` | Yes | Unique within the rulebook (case-insensitive); same pattern as rulebook `name` |\n| `command` | Yes | Must be listed in `allowed_commands`; basename only, not path |\n| `subcommand` | No | Same pattern as `command`; omit to match any subcommand |\n| `intent` | No | One of `hard_stop`, `use_alternative`, `scope_down`, `manual_only`, `stop_and_explain` |\n| `block_args` | Yes | Non-empty array of non-empty strings |\n| `reason` | Yes | Non-empty string, max 256 chars |\n\n### Test Fixture Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `command` | Yes | Non-empty shell command string |\n| `expect` | Yes | `\"blocked\"` or `\"allowed\"` |\n| `rule` | Required for blocked fixtures | Rule name expected to block the command |\n\nFixtures are optional documentation of intended behavior. Fixtures are shape-validated only; CC Safety Net does not execute them.\n\n## Matching Behavior\n\n- **Command**: Normalized to lowercase basename with any trailing `.exe` removed (`/usr/bin/git` → `git`).\n- **Subcommand**: The first command token after recognized Git and Docker global options and their values; `--` ends option parsing. An unrecognized option without `=` may consume the following token as its value.\n- **Arguments**: Each `block_args` value is compared literally against every command token, including expanded short options. The command is blocked if **any** item matches.\n- **Short options**: Expanded (`-Ap` matches `-A`).\n- **Long options**: Exact match (`--all-files` does not match `--all`).\n- **Execution order**: Built-in rules first, then custom rulebooks. Custom rules only add restrictions.\n- **Transparent wrappers**: A configured wrapper such as `rtk` lets `rtk git commit` be analyzed as `git commit` only when `git` is protected by built-in analyzers or active custom rules. `rtk -- git commit` is also supported.\n\n## Workflow\n\n1. Run `cc-safety-net rule init` or create `rule.json` manually.\n2. Optionally run `cc-safety-net rule init --example` to create an inactive example rulebook.\n3. Use `cc-safety-net rule wrapper add rtk` for trusted transparent wrappers.\n4. Run `cc-safety-net rule add <source>` after creating or choosing a rulebook source; it adds the source and syncs it.\n5. Run `cc-safety-net rule sync` after manual `rule.json` changes or local rulebook edits.\n6. Run `cc-safety-net rule verify` to validate config, lock/cache state, local rulebooks, and shareable GitHub-source rulebook directories in the current repository (it does not fetch remote content).\n7. Run `cc-safety-net rule list` to inspect active rulebooks and transparent wrappers.\n\nAn edited or invalid local rulebook keeps its last synced, digest-verified cached version enforced until `cc-safety-net rule sync` validates the edit. A missing lock entry or cache, a cache digest mismatch, or an invalid cached rulebook makes that source inactive; a missing lockfile or an unreadable or invalid `rule.json` makes every source in its scope inactive. Inactive sources stop applying their rules while other custom rules and all built-in protections stay active. Repair the reported condition, then run `cc-safety-net rule sync`. Run `cc-safety-net status` to see degraded sources.\n";function Yn(n,t){if(!n.ok){h5(n);return}w5(n),console.log(t),console.log("Rule config synced."),console.log(""),b5(n.entries)}function b5(n){if(n.length===0){console.log("Active rulebooks: (none)");return}console.log(`Active rulebooks (${n.length}):`);for(let t of n)console.log(`  - ${t.name} ${t.version} (${f5(t.ruleCount??0)})`),console.log(`    Source: ${Pt(t)}`)}function f5(n){return`${n} ${n===1?"rule":"rules"}`}function r3(n,t){Q2("Active sources",n.rulebooks,(r)=>[`[${r.source}] ${r.name} ${r.version}`,`  Source: ${t[r.source].get(r.spec)??r.spec}`]),Q2("Active rules",n.rules,(r)=>[`[${y5(n,r.name)}] ${r.name}`,`  Command: ${r.subcommand?`${r.command} ${r.subcommand}`:r.command}`,`  Block args: ${r.block_args.join(", ")}`,`  Reason: ${r.reason}`]),Q2("Disabled rules",t3(n,"off"),(r)=>[r.key]),Q2("Reason overrides",t3(n,"reason"),(r)=>[r.key,`  Reason: ${r.value.reason}`]),Q2("Transparent wrappers",n.transparent_wrappers,(r)=>[r]),Q2("Issues",n.errors,(r)=>[r]),Q2("Warnings",n.warnings,(r)=>[r])}function Q2(n,t,r){if(t.length===0){console.log(`${n}: (none)`);return}console.log(`${n} (${t.length}):`);for(let e of t){let[a,...l]=r(e);console.log(`  - ${a}`);for(let s of l)console.log(`    ${s}`)}}function y5(n,t){return n.rulebooks.find((r)=>r.rules.includes(t))?.source??"project"}function t3(n,t){return Object.entries({...n.userConfig?.overrides??{},...n.projectConfig?.overrides??{}}).filter((r)=>{if(t==="off")return r[1]==="off";return!!r[1]&&typeof r[1]==="object"}).map(([r,e])=>({key:r,value:e}))}function h5(n){for(let t of n.errors)console.error(t)}function w5(n){if(!n.warnings||n.warnings.length===0)return;for(let t of n.warnings)console.warn(t)}import{dirname as e3,join as Dt}from"node:path";var x5=".safety-net.json",$5="~/.cc-safety-net/config.json";async function s3(n){return[await a3({legacyPath:l3({cwd:n.cwd}),configPath:P(n.cwd),defaultRulebookName:"project-rules",migratedFrom:x5,cleanup:n.cleanup,syncOptions:{cwd:n.cwd}}),await a3({legacyPath:pn(),configPath:I(),defaultRulebookName:"user-rules",migratedFrom:$5,cleanup:n.cleanup,syncOptions:{cwd:n.cwd,global:!0}})].every((r)=>r)?0:1}async function a3(n){let t=T(n.syncOptions),r=D(t.filesystemScope,n.legacyPath),e=m(r);if(e===null)return console.log(`No legacy config found at ${n.legacyPath}`),!0;let a=g5(e);if(!a.ok){for(let o of a.errors)console.error(o);return!1}let l=_(t.configTarget);if(l.errors.length>0){for(let o of l.errors)console.error(o);return!1}let s=l.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},d=D5(e3(n.configPath),s.rules,n.defaultRulebookName,n.migratedFrom,t.filesystemScope),c=Dt(e3(n.configPath),d,"rulebook.json"),L=D(t.filesystemScope,c),i=[be(t.configTarget),be(L),be(t.lockTarget)],u=await m5(n,t.configTarget,L,d,a.config.rules,s.rules.includes(d)?s.rules:[...s.rules,d],s.overrides??{},s.transparent_wrappers??[]);if(!u.ok){j5(i);for(let o of u.errors)console.error(o);return!1}if(!n.cleanup)return console.log(`Migrated legacy config at ${n.legacyPath}. Legacy file is no longer used.`),!0;if(!q5(t.configTarget,L,d,n.migratedFrom,a.config.rules))return console.error(`Migration cleanup verification failed for ${n.legacyPath}`),!1;return cn(r),console.log(`Deleted legacy config at ${n.legacyPath}`),!0}async function m5(n,t,r,e,a,l,s,d){try{return E(t,{version:1,rules:l,overrides:s,transparent_wrappers:d}),E(r,k5(e,n.migratedFrom,a)),await A2(n.syncOptions)}catch(c){return{ok:!1,errors:[c instanceof Error?c.message:String(c)]}}}function g5(n){try{let t=JSON.parse(n),r=Rt(t);if(r.errors.length>0)return{ok:!1,errors:r.errors};return{ok:!0,config:{version:1,rules:t.rules??[]}}}catch{return{ok:!1,errors:["Invalid JSON"]}}}function D5(n,t,r,e,a){let l=t.find((s)=>z5(D(a,Dt(n,s,"rulebook.json")))===e);if(l)return l;if(m(D(a,Dt(n,r,"rulebook.json")))===null)return r;for(let s=2;;s++){let d=`${r}-${s}`;if(m(D(a,Dt(n,d,"rulebook.json")))===null)return d}}function k5(n,t,r){return{rulebook_version:1,name:n,version:"1.0.0",description:"Migrated CC Safety Net rules.",author:"project",migrated_from:t,allowed_commands:[...new Set(r.map((e)=>e.command))],rules:r,tests:r.map((e)=>({command:[e.command,e.subcommand,e.block_args[0]].filter(Boolean).join(" "),expect:"blocked",rule:e.name}))}}function q5(n,t,r,e,a){if(!_(n).config?.rules.includes(r))return!1;try{let s=m(t);if(s===null)return!1;let d=JSON.parse(s);return d.migrated_from===e&&JSON.stringify(d.rules)===JSON.stringify(a)}catch{return!1}}function be(n){return{target:n,content:m(n)}}function j5(n){for(let t of n){if(t.content===null){cn(t.target);continue}$2(t.target,t.content)}}function z5(n){let t=m(n);if(t===null)return null;try{let r=JSON.parse(t);return typeof r.migrated_from==="string"?r.migrated_from:null}catch{return null}}import{mkdir as F5,readFile as B5,writeFile as J5}from"node:fs/promises";import{dirname as Z5,join as Q5}from"node:path";var X5=86400000,Y5=604800000;async function c3(n=Date.now()){if(process.env.CC_SAFETY_NET_NO_UPDATE_CHECK)return null;let t=nr();if(!t)return null;let r=Q5(t,".cc-safety-net","update-check.json"),e=await S5(r,n);if(!e.lastCheck||n-e.lastCheck>X5){let s=await E2();if(e.lastCheck=n,s.latestVersion)e.latestVersion=s.latestVersion;if(!await d3(r,e))return null;if(s.error)return null}let a=e.latestVersion,l=F();if(!a||!hr(a,l))return null;if(e.notifiedVersion===a&&e.notifiedAt!==void 0&&n-e.notifiedAt<Y5)return null;if(e.notifiedVersion=a,e.notifiedAt=n,!await d3(r,e))return null;return`UPDATE_AVAILABLE: cc-safety-net v${a} is available (running v${l}). Ask the user once whether to run \`npx -y cc-safety-net@latest update\`; continue the current task either way and do not raise this again.`}async function S5(n,t){let r=await B5(n,"utf8").then((l)=>JSON.parse(l)).catch(()=>{return});if(!r||typeof r!=="object"||Array.isArray(r))return{};let e=r,a=(l)=>typeof l==="number"&&Number.isFinite(l)&&l<=t?l:void 0;return{lastCheck:a(e.lastCheck),latestVersion:typeof e.latestVersion==="string"?e.latestVersion:void 0,notifiedVersion:typeof e.notifiedVersion==="string"?e.notifiedVersion:void 0,notifiedAt:a(e.notifiedAt)}}async function d3(n,t){return F5(Z5(n),{recursive:!0,mode:448}).then(()=>J5(n,JSON.stringify(t),{mode:384})).then(()=>!0).catch(()=>!1)}import{dirname as H5,join as R5,resolve as fe}from"node:path";var i3="CC Safety Net Config",W5="═".repeat(i3.length),A5="https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json",K5=new Set(["rule.json","rule.lock","cache"]);function p3(n={}){try{return V5(n)}catch(t){if(t instanceof X)return console.error(t.message),1;throw t}}function V5(n){let t=n.cwd??process.cwd(),r=n.userConfigPath??I(),e=n.projectConfigPath??P(t),a=n.legacyUserConfigPath??pn(),l=n.legacyProjectConfigPath??We(t),s=fe(t,Et),d=H5(r),c=N({cwd:t,userConfigPath:r,projectConfigPath:e}),L=N({cwd:t}),i=D(c.userScope,r),u=D(c.projectScope,e),o=n.legacyUserConfigPath?dn(n.legacyUserConfigPath,"user policy"):D(L.userScope,a),p=n.legacyProjectConfigPath?dn(n.legacyProjectConfigPath,"project policy"):D(L.projectScope,l),f=!1,v=!1,h=[],w=[],$=M5(D(L.projectScope,s));if(U5(),m(i)!==null){let y=s2(i);if(y.errors.push(...d2(r,K2({userConfigDir:d}),{userConfigDir:d},c.userScope)),h.push({scope:"User",path:r,result:y,schema:"rules",sourceDisplayMap:m2(r,c.userScope),target:i}),y.errors.length>0)f=!0}if(m(o)!==null)if(v=!0,m(i)!==null)w.push(kt("user","cleanup"));else{let y=Wt(o);if(h.push({scope:"User",path:a,result:y,schema:"legacy",sourceDisplayMap:new Map,inactive:!0,target:o}),w.push(kt("user",y.errors.length>0?"fix-or-delete":"migrate")),y.errors.length>0)f=!0}if(m(u)!==null){let y=s2(u);if(y.errors.push(...d2(e,V2(e),{userConfigDir:d},c.projectScope)),h.push({scope:"Project",path:fe(e),result:y,schema:"rules",sourceDisplayMap:m2(e,c.projectScope),target:u}),y.errors.length>0)f=!0;if(m(p)!==null)v=!0,w.push(kt("project","cleanup"))}else if(m(p)!==null){v=!0,f=!0;let y=Wt(p);h.push({scope:"Project",path:fe(l),result:y,schema:"legacy",sourceDisplayMap:new Map,inactive:!0,target:p}),w.push(kt("project",y.errors.length>0?"fix-or-delete":"migrate"))}if($?.result.errors.length)f=!0;if(h.length===0&&!$)return console.log(`
No config files found. Using built-in rules only.`),0;for(let y of h)if(y.inactive)O5(y.scope,y.path,y.result,y.sourceDisplayMap);else if(y.result.errors.length>0)T5(y.scope,y.path,y.result.errors);else{if(y.schema==="rules"&&P5(y.target))console.log(`
Added $schema to ${y.scope.toLowerCase()} config.`);C5(y.scope,y.path,y.result,y.schema,y.sourceDisplayMap)}for(let y of w)console.error(`
${b.red(y)}`);if($)if($.result.errors.length>0)E5($.path,$.result.errors);else _5($.path,$.result);if(f)return console.error(`
Config validation failed.`),1;return console.log(v?`
Configs valid with warnings.`:`
All configs valid.`),0}function kt(n,t){let r=`legacy ${n} config`;if(t==="cleanup")return`Warning: Legacy ${n} config is no longer needed. Run \`npx -y cc-safety-net rule migrate --cleanup\` to clean it up safely.`;if(t==="migrate")return`Warning: Legacy ${n} config is ignored by CC Safety Net. Run \`npx -y cc-safety-net rule migrate\`.`;return`Warning: Legacy ${n} config is no longer supported. Fix or delete the ${r}, then run \`npx -y cc-safety-net rule migrate\`.`}function M5(n){if(W2(n)===null)return null;let t=G5(n);if(t.ruleNames.size===0&&t.errors.length===0)return null;return{path:n.path,result:t}}function G5(n){let t=[],r=new Set,e=(W2(n)??[]).filter((a)=>!K5.has(a.name)).sort((a,l)=>a.name.localeCompare(l.name));if(e.length===0)return{errors:t,ruleNames:r};for(let a of e){if(!Ln.test(a.name)){t.push(`rulebook directory names must match ${Ln}: ${a.name}`);continue}if(a.kind!=="directory"){t.push(`${a.name} must be a rulebook directory`);continue}let l=D(n.scope,R5(n.path,a.name,"rulebook.json")),s=m(l);if(s===null){t.push(`${a.name}/rulebook.json is required`);continue}try{let d;try{d=JSON.parse(s)}catch{t.push(`${a.name}/rulebook.json: invalid JSON`);continue}let c=L3(d);if(c.name!==a.name){t.push(`rulebook name "${c.name}" must match folder "${a.name}"`);continue}r.add(a.name)}catch(d){t.push(d instanceof Error?`${a.name}/rulebook.json: ${d.message}`:`${a.name}/rulebook.json: ${String(d)}`)}}return{errors:t,ruleNames:r}}function U5(){console.log(i3),console.log(W5)}function C5(n,t,r,e,a){if(console.log(`
✓ ${n} config: ${t}`),console.log(`  Schema: ${e==="rules"?"rulebook sources":"legacy inline rules"}`),r.ruleNames.size>0){console.log(`  ${e==="rules"?"Sources":"Rules"}:`);let l=1;for(let s of r.ruleNames)console.log(`    ${l}. ${a.get(s)??s}`),l++}else console.log(`  ${e==="rules"?"Sources":"Rules"}: (none)`)}function O5(n,t,r,e){if(console.error(`
✗ Legacy ${n.toLowerCase()} config: ${t}`),console.error("  Schema: legacy inline rules"),console.error("  Status: ignored by CC Safety Net"),r.errors.length>0){console.error("  Errors:");let a=1;for(let l of r.errors)for(let s of l.split("; "))console.error(`    ${a}. ${s}`),a++;return}if(r.ruleNames.size>0){console.error("  Rules:");let a=1;for(let l of r.ruleNames)console.error(`    ${a}. ${e.get(l)??l}`),a++;return}console.error("  Rules: (none)")}function T5(n,t,r){u3(`${n} config`,t,r)}function _5(n,t){console.log(`
✓ GitHub source rules: ${n}`),console.log("  Rulebooks:");let r=1;for(let e of t.ruleNames)console.log(`    ${r}. ${e}`),r++}function E5(n,t){u3("GitHub source rules",n,t)}function u3(n,t,r){console.error(`
✗ ${n}: ${t}`),console.error("  Errors:");let e=1;for(let a of r)for(let l of a.split("; "))console.error(`    ${e}. ${l}`),e++}function P5(n){try{let t=m(n);if(t===null)return!1;let r=JSON.parse(t);if(r.$schema)return!1;return $2(n,JSON.stringify({$schema:A5,...r},null,2)),!0}catch(t){if(t instanceof X)throw t;return!1}}var v3=new Set(["init","add","remove","update","sync","list","wrapper","migrate","doc","verify"]),N5=new Set(["add","remove","list"]);async function b3(n){try{return await n8(n)}catch(t){if(t instanceof X)return console.error(t.message),1;throw t}}async function n8(n){let t=r8(n),r=t.help?t8(t.positionals):null;if(r)return ot(r),0;if(t.errors.length>0){for(let s of t.errors)console.error(s);return 1}let e=t.positionals[0];if(!e)return ot(T2,console.error),1;let a=t.positionals[1],l={global:t.global,check:t.check};if(e==="init"){let s=T(l),d=s.configDir;l8(s.configTarget),o3(D(s.filesystemScope,Wn({...l,cacheConfigDir:d})));let c=I5(d,"example-rules","rulebook.json"),L=D(s.filesystemScope,c);if(t.example&&m(L)===null)Nt(L,"example-rules");let i=await A2(l);return Yn(i,"Rule config initialized."),i.ok?0:1}if(e==="add"){if(!a)return console.error("rule add requires a source"),1;let s=await Ot(a,l);return Yn(s,`Added rulebook source: ${a}`),s.ok?0:1}if(e==="remove"){if(!a)return console.error("rule remove requires a source"),1;let s=await _t(a,{...l,deleteSource:t.deleteSource});return Yn(s,`Removed rulebook source: ${a}`),s.ok?0:1}if(e==="update"||e==="sync"){let s=await A2({...l,only:e==="update"?a:void 0});return Yn(s,t.check?"Rule config checked.":"Rule config synced."),s.ok?0:1}if(e==="list"){let s=f2(),d=N({});return r3(s,{user:m2(s.userConfigPath,d.userScope),project:m2(s.projectConfigPath,d.projectScope)}),s.errors.length>0?1:0}if(e==="wrapper")return s8(t);if(e==="migrate")return s3({cleanup:t.cleanup,cwd:process.cwd()});if(e==="doc"){console.log(n3);let s=await c3();if(s)console.error(s);return 0}if(e==="verify")return p3();return 1}function t8(n){if(n.length===0)return T2;let t=T2.subcommands.filter((e)=>e.usage.split(" ")[0]===n[0]);if(t.length===0)return null;if(n.length===1&&t.length>1)return{name:`rule ${n[0]}`,description:`Subcommands of rule ${n[0]}`,usage:`rule ${n[0]} <subcommand>`,subcommands:t,options:[]};let r=n.length===1?t[0]:t.find((e)=>e.usage.split(" ")[1]===n[1]);if(!r)return null;return{name:`rule ${n[0]}`,description:r.description,usage:`rule ${r.usage}`,options:[]}}function r8(n){let t=B({label:"rule",booleans:{global:["-g","--global"],check:["--check"],cleanup:["--cleanup"],deleteSource:["--delete-source"],example:["--example"]},positionals:"list"},n),r={...t.flags,help:t.help,positionals:t.positionals,errors:t.errors};return e8(r),r}function e8(n){let[t]=n.positionals;if(t&&!v3.has(t))n.errors.push(`Unknown rule subcommand: ${t}`);if(n.deleteSource&&t!=="remove")if(t&&v3.has(t))n.errors.push(`Unknown option for rule ${t}: --delete-source`);else n.errors.push("--delete-source is only valid with 'rule remove'");if(n.cleanup&&t!=="migrate")n.errors.push(qt(t,"--cleanup"));if(n.example&&t!=="init")n.errors.push(qt(t,"--example"));if(t==="migrate"){if(n.global)n.errors.push(qt(t,"--global"));if(n.check)n.errors.push(qt(t,"--check"));if(n.positionals.length>1)n.errors.push(`Unexpected rule migrate argument: ${n.positionals[1]}`)}else if(t==="wrapper")a8(n);else if(n.positionals.length>2)n.errors.push(`Unexpected rule argument: ${n.positionals[2]}`);if(t==="list"&&n.global)n.errors.push("Unknown option for rule list: --global")}function qt(n,t){return n?`Unknown option for rule ${n}: ${t}`:`Unknown option for rule: ${t}`}function a8(n){let t=n.positionals[1],r=n.positionals[2];if(!t){n.errors.push("rule wrapper requires add, remove, or list");return}if(!N5.has(t)){n.errors.push(`Unknown rule wrapper action: ${t}`);return}if(t==="list"){if(r)n.errors.push(`Unexpected rule wrapper argument: ${r}`);return}if(!r){n.errors.push(`rule wrapper ${t} requires a command`);return}if(n.positionals.length>3)n.errors.push(`Unexpected rule wrapper argument: ${n.positionals[3]}`)}function l8(n){if(m(n)===null){It(n);return}let t=_(n);if(!t.config)return;E(n,{version:1,rules:t.config.rules,overrides:t.config.overrides??{},transparent_wrappers:t.config.transparent_wrappers??[]})}async function s8(n){let t=n.positionals[1],r=n.positionals[2],e=T({global:n.global}).configTarget;if(t==="list"){let d=_(e);if(d.errors.length>0){for(let c of d.errors)console.error(c);return 1}return d8(d.config?.transparent_wrappers??[]),0}if(!r||!tr.test(r))return console.error("transparent wrapper must match command pattern"),1;if(rr(r))return console.error(`reserved command "${r}" cannot be a wrapper`),1;let a=_(e);if(a.errors.length>0){for(let d of a.errors)console.error(d);return 1}let l=a.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},s=t==="add"?[...new Set([...l.transparent_wrappers??[],r])]:(l.transparent_wrappers??[]).filter((d)=>d!==r);return E(e,{version:1,rules:l.rules,overrides:l.overrides??{},transparent_wrappers:s}),console.log(t==="add"?`Added transparent wrapper: ${r}`:`Removed transparent wrapper: ${r}`),0}function d8(n){if(n.length===0){console.log("Transparent wrappers: (none)");return}console.log(`Transparent wrappers (${n.length}):`);for(let t of n)console.log(`  - ${t}`)}import{homedir as f3}from"node:os";import{existsSync as c8,readFileSync as L8}from"node:fs";import{homedir as i8}from"node:os";import{join as p8}from"node:path";async function u8(n){if(n.isTTY)return null;return(await Lr(n).catch(()=>null))?.trim()||null}function v8(){if(process.env.CLAUDE_SETTINGS_PATH)return process.env.CLAUDE_SETTINGS_PATH;return p8(i8(),".claude","settings.json")}function ye(){let n=v8();if(!c8(n))return!1;try{let t=L8(n,"utf-8"),r=JSON.parse(t);if(!r.enabledPlugins)return!1;let e="cc-safety-net@cc-marketplace";if(!(e in r.enabledPlugins))return!1;return r.enabledPlugins[e]===!0}catch(t){if(on(k.debug))console.error(`CC Safety Net debug: failed to read Claude settings: ${n}: ${t instanceof Error?t.message:String(t)}`);return!1}}async function he(n=process.stdin){let t=ye(),r;if(!t)r="\uD83D\uDEE1️ CC Safety Net ❌";else{let a=K({cwd:process.cwd()}),l=a.policy,s=c2(l),d=Object.values(D2(l,s.capabilities)).some((L)=>L.changesInherited);r=`\uD83D\uDEE1️ CC Safety Net ${{standard:"✅",strict:"\uD83D\uDD12",paranoid:"\uD83D\uDC41️",custom:"\uD83D\uDD27"}[d?"custom":s.effectiveLevel]}${s.worktreeMode?"\uD83C\uDF33":""}${a.state==="degraded"?"⚠️":""}`}let e=await u8(n);if(e&&!e.startsWith("{"))console.log(`${e} | ${r}`);else console.log(r)}function y3(){let n=K({cwd:process.cwd()}),t=n.policy,r=c2(t),e=!!process.env.NO_COLOR||!process.stdout.isTTY,a=Math.min(process.stdout.columns||80,100),l=e?"ok":"✔",s=e?"OFF":"✘",d=(p,f)=>{let v=`  ${p.padEnd(13)}${f}`;return(v.length>a?`${v.slice(0,a-1)}…`:v).replaceAll(s,b.red(s))},c=Object.values(D2(t,r.capabilities)).some((p)=>p.changesInherited),L=bn(),i={ready:b.green,degraded:b.yellow}[n.state],u=[...ye()?[]:["plugin cc-safety-net@cc-marketplace is disabled in Claude Code; nothing is enforced in Claude Code until it is re-enabled. Other integrations are not affected."],...n.diagnostics],o=e?"-":"·";console.log([`${e?"":"\uD83D\uDEE1️  "}CC Safety Net — ${i(n.state)}`,"",d("Protection",`destructive ${t.destructiveCommandProtectionEnabled?l:s}   secrets ${t.secretProtection.enabled?l:s}`),d("Level",c?`${r.effectiveLevel} (customised)`:r.effectiveLevel),d("Rules",t.rules.length===0?"none active":`${t.rules.length} active`),d("Policy",L.startsWith(f3())?`~${L.slice(f3().length)}`:L),...r.worktreeMode?[d("Worktree","relaxations active")]:[],"",...u.length===0?["  Everything configured is active."]:["  Not active",...u.flatMap((p)=>vt(p,"      ",a-6).map((f,v)=>v===0?`    ${o} ${f}`:f)),"","  Full report: cc-safety-net doctor"]].join(`
`))}import{spawn as S3}from"node:child_process";import{randomBytes as D8}from"node:crypto";import{createServer as k8}from"node:http";import{Writable as q8}from"node:stream";import{homedir as o8}from"node:os";var jt=500;function b8(n){let t=n.filter((a)=>a.decision!=="allow"),r=n.filter((a)=>a.decision==="allow"),e=Math.min(t.length,Math.max(jt-r.length,Math.ceil(jt/2)));return[...t.slice(0,e),...r.slice(0,jt-e)]}function h3(n,t=L2()){if(t)g2(t);let r=(v)=>new Date(v.getFullYear(),v.getMonth(),v.getDate()).getTime(),e=r(new Date),a=new Date(e);a.setDate(a.getDate()-(n-1));let l=a.getTime(),s=[],d={count:0};for(let v of t?b2(t,d):[])for(let h of sn(v,d)){if(!h||typeof h.ts!=="string"||typeof h.command!=="string")continue;let w=new Date(h.ts).getTime();if(!Number.isFinite(w))continue;if(w>=l)s.push(h)}s.sort((v,h)=>new Date(h.ts).getTime()-new Date(v.ts).getTime());let c=Array.from({length:n},()=>0),L=Array.from({length:n},()=>0),i={},u={},o={},p=0,f=0;for(let v of s){let h=v.agent||"unknown";i[h]=(i[h]??0)+1;let w=Math.round((e-r(new Date(v.ts)))/86400000),$=n-1-w,y=w>=0&&w<n;if(y)L[$]=(L[$]??0)+1;if(v.decision!=="allow"){if(p++,v.ruleId)u[v.ruleId]=(u[v.ruleId]??0)+1;let g=X2(v.segment||v.command);if(g)o[g]=(o[g]??0)+1;if(v.failureStage)f++;if(y)c[$]=(c[$]??0)+1}}return{days:n,logsDir:t,homeDir:o8(),totalInWindow:s.length,truncated:s.length>jt,unreadable:d.count,counts:{blocked:p,allowed:s.length-p,agents:i,blockedByDay:c,analyzedByDay:L,rules:u,commands:o,errors:f},entries:b8(s).sort((v,h)=>new Date(h.ts).getTime()-new Date(v.ts).getTime())}}import{spawn as f8}from"node:child_process";import{existsSync as w3,statSync as y8}from"node:fs";import{delimiter as h8,join as w8}from"node:path";var x8=120000,zt="Choose the project folder",$8=`try
  return POSIX path of (choose folder with prompt "${zt}")
on error number -128
  return ""
end try`,m8=`Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${zt}'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }`,x3=[{binary:"zenity",args:["--file-selection","--directory",`--title=${zt}`]},{binary:"kdialog",args:["--getexistingdirectory",".","--title",zt]}],$3=(n,t)=>(t.PATH??"").split(h8).some((r)=>r.length>0&&w3(w8(r,n)));function m3(n,t){if(n==="darwin"||n==="win32")return!0;if(n!=="linux")return!1;if(!t.DISPLAY&&!t.WAYLAND_DISPLAY)return!1;return x3.some((r)=>$3(r.binary,t))}function g8(n,t){if(n==="darwin")return{cmd:"osascript",args:["-e",$8]};if(n==="win32")return{cmd:"powershell.exe",args:["-NoProfile","-STA","-Command",m8]};let r=x3.find((e)=>$3(e.binary,t));return r?{cmd:r.binary,args:r.args}:null}function g3(n=process.platform,t=process.env){let r=g8(n,t);if(!r)return Promise.resolve({error:"No folder dialog is available on this system"});return new Promise((e)=>{let a=f8(r.cmd,r.args,{env:t,stdio:["ignore","pipe","pipe"]}),l="",s=!1,d=(L)=>{if(s)return;s=!0,clearTimeout(c),e(L)},c=setTimeout(()=>{a.kill(),d({error:"The folder dialog timed out"})},x8);a.stdout.on("data",(L)=>{l+=L.toString()}),a.on("error",()=>d({error:`Could not open the folder dialog (${r.cmd})`})),a.on("close",()=>{let L=l.trim().replace(/\/+$/,"");if(!L)return d({cancelled:!0});if(!w3(L)||!y8(L).isDirectory())return d({error:"That selection is not a folder on disk"});d({path:L})})})}var D3=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CC Safety Net</title>
  <link rel="icon" href="data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221254%22%20height%3D%221254%22%20viewBox%3D%2254%2023%201140%201140%22%20role%3D%22img%22%20aria-label%3D%22Safety%20net%20logo%20mesh%20variant%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-0%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23f8fafc%22%20stop-opacity%3D%220.68%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%23f8fafc%22%20stop-opacity%3D%220.29%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%23f8fafc%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-1%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%237dd3fc%22%20stop-opacity%3D%220.58%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%237dd3fc%22%20stop-opacity%3D%220.24%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%237dd3fc%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-2%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%2364748b%22%20stop-opacity%3D%220.7%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%2364748b%22%20stop-opacity%3D%220.29%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%2364748b%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-3%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%230f172a%22%20stop-opacity%3D%220.9%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%230f172a%22%20stop-opacity%3D%220.38%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%230f172a%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3ClinearGradient%20id%3D%22edge%22%20x1%3D%2214%25%22%20y1%3D%228%25%22%20x2%3D%2288%25%22%20y2%3D%2294%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220.7%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22%23bae6fd%22%20stop-opacity%3D%220.24%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%231e293b%22%20stop-opacity%3D%220.86%22%2F%3E%0A%20%20%20%20%3C%2FlinearGradient%3E%0A%20%20%20%20%3Cmask%20id%3D%22net-mask%22%20maskUnits%3D%22userSpaceOnUse%22%3E%0A%20%20%20%20%20%20%3Crect%20width%3D%221254%22%20height%3D%221254%22%20fill%3D%22black%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-46.32%22%20y%3D%22-47.38%22%20width%3D%2292.63%22%20height%3D%2294.75%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.75%20127.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-66.82%22%20y%3D%22-41.01%22%20width%3D%22133.64%22%20height%3D%2282.02%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(713.75%20230.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-134.00%22%20width%3D%2279.90%22%20height%3D%22267.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(588.00%20275.50)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-65.05%22%20width%3D%2279.20%22%20height%3D%22130.11%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(444.50%20320.50)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.29%22%20y%3D%22-40.31%22%20width%3D%22266.58%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(759.75%20369.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.07%22%20y%3D%22-39.24%22%20width%3D%22154.15%22%20height%3D%2278.49%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(533.25%20407.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.10%22%20y%3D%22-39.74%22%20width%3D%22134.21%22%20height%3D%2279.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(895.22%20413.86)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.84%22%20y%3D%22-134.04%22%20width%3D%2279.68%22%20height%3D%22268.08%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(401.36%20461.24)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-74.60%22%20width%3D%2279.20%22%20height%3D%22149.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(812.25%20500.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-77.43%22%20width%3D%2279.20%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(625.75%20500.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-67.18%22%20width%3D%2278.49%22%20height%3D%22134.35%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(263.25%20505.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.28%22%20y%3D%22-40.02%22%20width%3D%22266.56%22%20height%3D%2280.04%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(941.36%20551.76)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-54.80%22%20y%3D%22-53.74%22%20width%3D%22109.60%22%20height%3D%22107.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(1096.75%20593.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.43%22%20y%3D%22-40.31%22%20width%3D%22154.86%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(719.75%20594.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-51.97%22%20y%3D%22-54.45%22%20width%3D%22103.94%22%20height%3D%22108.89%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(155.25%20594.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-76.37%22%20y%3D%22-40.31%22%20width%3D%22152.74%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(534.50%20595.50)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-135.12%22%20y%3D%22-40.16%22%20width%3D%22270.23%22%20height%3D%2280.32%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(307.96%20634.94)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-70.64%22%20width%3D%2280.05%22%20height%3D%22141.27%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(989.66%20680.72)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-38.90%22%20y%3D%22-77.27%22%20width%3D%2277.80%22%20height%3D%22154.54%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(442.49%20687.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-77.43%22%20width%3D%2279.90%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.50%20689.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.40%22%20y%3D%22-134.46%22%20width%3D%2278.80%22%20height%3D%22268.92%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(853.69%20727.31)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-69.65%22%20y%3D%22-38.18%22%20width%3D%22139.30%22%20height%3D%2276.37%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(353.25%20771.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-78.44%22%20y%3D%22-39.44%22%20width%3D%22156.88%22%20height%3D%2278.88%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(720.61%20782.02)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.77%22%20y%3D%22-39.86%22%20width%3D%22267.53%22%20height%3D%2279.71%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(493.85%20820.81)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-66.82%22%20width%3D%2278.49%22%20height%3D%22133.64%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(806.50%20868.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-133.39%22%20width%3D%2280.05%22%20height%3D%22266.79%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(666.35%20914.10)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.18%22%20y%3D%22-39.60%22%20width%3D%22134.35%22%20height%3D%2279.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(540.00%20960.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-49.85%22%20y%3D%22-49.50%22%20width%3D%2299.70%22%20height%3D%2298.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(627.25%201064.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%3C%2Fmask%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Cg%3E%0A%20%20%20%20%3Cg%20mask%3D%22url(%23net-mask)%22%3E%0A%20%20%20%20%20%20%3Crect%20width%3D%221254%22%20height%3D%221254%22%20fill%3D%22%2307090d%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22360%22%20cy%3D%22240%22%20r%3D%22430%22%20fill%3D%22url(%23spot-0)%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22820%22%20cy%3D%22300%22%20r%3D%22430%22%20fill%3D%22url(%23spot-1)%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22760%22%20cy%3D%22830%22%20r%3D%22500%22%20fill%3D%22url(%23spot-2)%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22300%22%20cy%3D%22780%22%20r%3D%22390%22%20fill%3D%22url(%23spot-3)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20width%3D%221254%22%20height%3D%221254%22%20fill%3D%22url(%23edge)%22%20opacity%3D%220.18%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22url(%23edge)%22%20stroke-width%3D%2214%22%20stroke-linejoin%3D%22round%22%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-46.32%22%20y%3D%22-47.38%22%20width%3D%2292.63%22%20height%3D%2294.75%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.75%20127.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-66.82%22%20y%3D%22-41.01%22%20width%3D%22133.64%22%20height%3D%2282.02%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(713.75%20230.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-134.00%22%20width%3D%2279.90%22%20height%3D%22267.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(588.00%20275.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-65.05%22%20width%3D%2279.20%22%20height%3D%22130.11%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(444.50%20320.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.29%22%20y%3D%22-40.31%22%20width%3D%22266.58%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(759.75%20369.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.07%22%20y%3D%22-39.24%22%20width%3D%22154.15%22%20height%3D%2278.49%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(533.25%20407.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.10%22%20y%3D%22-39.74%22%20width%3D%22134.21%22%20height%3D%2279.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(895.22%20413.86)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.84%22%20y%3D%22-134.04%22%20width%3D%2279.68%22%20height%3D%22268.08%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(401.36%20461.24)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-74.60%22%20width%3D%2279.20%22%20height%3D%22149.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(812.25%20500.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-77.43%22%20width%3D%2279.20%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(625.75%20500.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-67.18%22%20width%3D%2278.49%22%20height%3D%22134.35%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(263.25%20505.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.28%22%20y%3D%22-40.02%22%20width%3D%22266.56%22%20height%3D%2280.04%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(941.36%20551.76)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-54.80%22%20y%3D%22-53.74%22%20width%3D%22109.60%22%20height%3D%22107.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(1096.75%20593.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.43%22%20y%3D%22-40.31%22%20width%3D%22154.86%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(719.75%20594.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-51.97%22%20y%3D%22-54.45%22%20width%3D%22103.94%22%20height%3D%22108.89%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(155.25%20594.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-76.37%22%20y%3D%22-40.31%22%20width%3D%22152.74%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(534.50%20595.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-135.12%22%20y%3D%22-40.16%22%20width%3D%22270.23%22%20height%3D%2280.32%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(307.96%20634.94)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-70.64%22%20width%3D%2280.05%22%20height%3D%22141.27%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(989.66%20680.72)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-38.90%22%20y%3D%22-77.27%22%20width%3D%2277.80%22%20height%3D%22154.54%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(442.49%20687.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-77.43%22%20width%3D%2279.90%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.50%20689.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.40%22%20y%3D%22-134.46%22%20width%3D%2278.80%22%20height%3D%22268.92%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(853.69%20727.31)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-69.65%22%20y%3D%22-38.18%22%20width%3D%22139.30%22%20height%3D%2276.37%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(353.25%20771.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-78.44%22%20y%3D%22-39.44%22%20width%3D%22156.88%22%20height%3D%2278.88%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(720.61%20782.02)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.77%22%20y%3D%22-39.86%22%20width%3D%22267.53%22%20height%3D%2279.71%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(493.85%20820.81)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-66.82%22%20width%3D%2278.49%22%20height%3D%22133.64%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(806.50%20868.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-133.39%22%20width%3D%2280.05%22%20height%3D%22266.79%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(666.35%20914.10)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.18%22%20y%3D%22-39.60%22%20width%3D%22134.35%22%20height%3D%2279.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(540.00%20960.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-49.85%22%20y%3D%22-49.50%22%20width%3D%2299.70%22%20height%3D%2298.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(627.25%201064.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-opacity%3D%220.2%22%20stroke-width%3D%225%22%20stroke-linejoin%3D%22round%22%20transform%3D%22translate(-10%20-14)%22%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-46.32%22%20y%3D%22-47.38%22%20width%3D%2292.63%22%20height%3D%2294.75%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.75%20127.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-66.82%22%20y%3D%22-41.01%22%20width%3D%22133.64%22%20height%3D%2282.02%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(713.75%20230.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-134.00%22%20width%3D%2279.90%22%20height%3D%22267.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(588.00%20275.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-65.05%22%20width%3D%2279.20%22%20height%3D%22130.11%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(444.50%20320.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.29%22%20y%3D%22-40.31%22%20width%3D%22266.58%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(759.75%20369.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.07%22%20y%3D%22-39.24%22%20width%3D%22154.15%22%20height%3D%2278.49%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(533.25%20407.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.10%22%20y%3D%22-39.74%22%20width%3D%22134.21%22%20height%3D%2279.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(895.22%20413.86)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.84%22%20y%3D%22-134.04%22%20width%3D%2279.68%22%20height%3D%22268.08%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(401.36%20461.24)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-74.60%22%20width%3D%2279.20%22%20height%3D%22149.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(812.25%20500.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-77.43%22%20width%3D%2279.20%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(625.75%20500.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-67.18%22%20width%3D%2278.49%22%20height%3D%22134.35%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(263.25%20505.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.28%22%20y%3D%22-40.02%22%20width%3D%22266.56%22%20height%3D%2280.04%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(941.36%20551.76)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-54.80%22%20y%3D%22-53.74%22%20width%3D%22109.60%22%20height%3D%22107.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(1096.75%20593.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.43%22%20y%3D%22-40.31%22%20width%3D%22154.86%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(719.75%20594.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-51.97%22%20y%3D%22-54.45%22%20width%3D%22103.94%22%20height%3D%22108.89%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(155.25%20594.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-76.37%22%20y%3D%22-40.31%22%20width%3D%22152.74%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(534.50%20595.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-135.12%22%20y%3D%22-40.16%22%20width%3D%22270.23%22%20height%3D%2280.32%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(307.96%20634.94)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-70.64%22%20width%3D%2280.05%22%20height%3D%22141.27%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(989.66%20680.72)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-38.90%22%20y%3D%22-77.27%22%20width%3D%2277.80%22%20height%3D%22154.54%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(442.49%20687.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-77.43%22%20width%3D%2279.90%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.50%20689.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.40%22%20y%3D%22-134.46%22%20width%3D%2278.80%22%20height%3D%22268.92%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(853.69%20727.31)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-69.65%22%20y%3D%22-38.18%22%20width%3D%22139.30%22%20height%3D%2276.37%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(353.25%20771.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-78.44%22%20y%3D%22-39.44%22%20width%3D%22156.88%22%20height%3D%2278.88%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(720.61%20782.02)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.77%22%20y%3D%22-39.86%22%20width%3D%22267.53%22%20height%3D%2279.71%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(493.85%20820.81)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-66.82%22%20width%3D%2278.49%22%20height%3D%22133.64%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(806.50%20868.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-133.39%22%20width%3D%2280.05%22%20height%3D%22266.79%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(666.35%20914.10)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.18%22%20y%3D%22-39.60%22%20width%3D%22134.35%22%20height%3D%2279.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(540.00%20960.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-49.85%22%20y%3D%22-49.50%22%20width%3D%2299.70%22%20height%3D%2298.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(627.25%201064.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E%0A">
  <script>
    (() => {
      const stored = localStorage.getItem('cc-safety-net-theme');
      if (stored === 'light' || stored === 'dark') document.documentElement.style.colorScheme = stored;
    })();
  </script>
  <style>
/* cc-safety-net-gui-custom-css */
:root {
  color-scheme: light dark;

  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --bg: light-dark(#f3f4f6, #0c0e11);
  --surface: light-dark(#ffffff, #16191d);
  --surface-2: light-dark(#f6f7f9, #1c2025);
  --btn-hover-fill: light-dark(#e9ebef, #282c33);
  --field-bg: light-dark(#ffffff, #101317);

  --ink: light-dark(#171a1f, #e7eaed);
  --muted: light-dark(#5b626c, #99a1ac);
  --meta: light-dark(#6b7280, #838b95);

  --border: light-dark(#e3e6ea, #292d33);
  --border-strong: light-dark(#cfd4da, #363b42);

  /* Both track tones clear 3:1 against --surface so an off switch, and the knob
     inside it, stay visible without relying on the accent. */
  --switch-track: light-dark(#8b929c, #626973);
  --switch-track-hover: #767d87;
  --switch-knob: #ffffff;

  /* Neutral, not accent-tinted: the ring is a position indicator, not a state.
     Solid rather than a translucent mix so its contrast does not depend on
     whichever surface the focused control happens to sit on. */
  --focus-ring: var(--ink);

  --accent: light-dark(#166534, #3fb950);
  --safe: #14532d;
  --safe-hover: #0f3d20;
  --danger: #7f1d1d;
  --danger-hover: #641414;

  --star: light-dark(#b7791f, #f2c94c);

  --ok-fg: light-dark(#15803d, #4ade80);
  --ok-bg: light-dark(#edfaf1, #10251a);
  --ok-border: light-dark(#b7e4c7, #1f5133);

  --err-fg: light-dark(#b42318, #ff8078);
  --err-bg: light-dark(#fef2f1, #2b1512);
  --err-border: light-dark(#f2c9c4, #5c2620);

  --warn-fg: light-dark(#b45309, #fbbf24);
  --warn-bg: light-dark(#fefaf0, #2a2008);
  --warn-border: light-dark(#f2ddb0, #5c4a1d);

  --master: light-dark(#1d4ed8, #4c8dff);
  --master-fg: light-dark(#1e40af, #9ec3ff);
  --master-bg: light-dark(#eef4fe, #101a2b);
  --master-border: light-dark(#c5d6f6, #23446e);

  --strict-fg: light-dark(#1e40af, #9ec3ff);
  --strict-bg: light-dark(#eef4fe, #101a2b);
  --strict-border: light-dark(#c5d6f6, #23446e);
  --paranoid-fg: light-dark(#6b21a8, #d8b4fe);
  --paranoid-bg: light-dark(#faf5ff, #21152c);
  --paranoid-border: light-dark(#e4ccf4, #513064);

  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;

  --topbar-h: 58px;

  font-family: var(--font-sans);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-size: 13px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

.app-shell {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 14px;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.brand {
  padding: 0 10px;
}

h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-logo {
  display: flex;
  color: var(--ink);
}

.brand-home {
  display: flex;
  color: inherit;
}

.brand-logo svg {
  width: auto;
  height: 30px;
}

.sidenav {
  display: grid;
  gap: 2px;
}

.sidenav a {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.sidenav a:hover {
  background: var(--surface-2);
  color: var(--ink);
}

/* One step above the hover fill, so the selected item stays readable while a
   sibling is hovered. */
.sidenav a[aria-current="page"] {
  background: var(--btn-hover-fill);
  color: var(--ink);
}

.sidenav svg {
  width: 15px;
  height: 15px;
  flex: none;
}

.sidebar-foot {
  margin-top: auto;
  display: grid;
  gap: 10px;
  padding: 0 10px;
}

.sidebar-links {
  display: grid;
  gap: 5px;
  font-size: 12px;
}

.sidebar-links a {
  color: var(--meta);
  text-decoration: none;
}

.sidebar-links a:hover {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.sidebar-links a:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

.content {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-foot {
  display: none;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  min-height: var(--topbar-h);
  padding: 12px 28px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
  max-width: 1040px;
  margin: 0 auto;
}

.topbar-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.app-status {
  display: inline-flex;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}

.app-status:empty {
  display: none;
}

.app-status.ok {
  color: var(--ok-fg);
  border-color: var(--ok-border);
  background: var(--ok-bg);
}

.app-status.error {
  color: var(--err-fg);
  border-color: var(--err-border);
  background: var(--err-bg);
}

.dirty-chip {
  padding: 6px 12px;
  border: 1px solid var(--warn-border);
  border-radius: 999px;
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.view-search {
  display: flex;
  align-items: center;
  flex: 1 1 240px;
  min-width: 180px;
  max-width: 380px;
}

.topbar-search {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 440px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Everything clickable gets the pointer cursor. Links already get it from the
   user agent; buttons, selects, and the label rows that wrap a control do not. */
button:not(:disabled),
select,
label.row:not(.row-disabled),
label.rule-control,
input[type="checkbox"]:not(:disabled),
input[type="radio"]:not(:disabled) {
  cursor: pointer;
}

button {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 8px 14px;
  background: var(--surface);
  color: var(--ink);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

button:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--muted);
}

/* Borderless ghost buttons with a soft filled-square hover. */
#theme-toggle,
#raw-copy,
#activity-refresh,
#integrations-refresh,
#rules-refresh,
#tester-run,
#reset-rule-customizations,
#reset-secret-customizations,
.rule-example-button {
  border-color: transparent;
}

#theme-toggle:hover:not(:disabled),
#raw-copy:hover:not(:disabled),
#activity-refresh:hover:not(:disabled),
#integrations-refresh:hover:not(:disabled),
#rules-refresh:hover:not(:disabled),
#tester-run:hover:not(:disabled),
#reset-rule-customizations:hover:not(:disabled),
#reset-secret-customizations:hover:not(:disabled),
.rule-example-button:hover:not(:disabled) {
  background: var(--btn-hover-fill);
  border-color: transparent;
}

button:disabled {
  opacity: 0.6;
  cursor: progress;
}

button.primary {
  background: var(--safe);
  border-color: var(--safe);
  color: #fff;
}

button.primary:hover:not(:disabled) {
  background: var(--safe-hover);
  border-color: var(--safe-hover);
}

button.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

button.danger:hover:not(:disabled) {
  background: var(--danger-hover);
  border-color: var(--danger-hover);
}

#theme-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-end;
  gap: 7px;
  color: var(--muted);
}

#theme-toggle:hover {
  color: var(--ink);
}

#theme-toggle svg {
  width: 15px;
  height: 15px;
}

button.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--muted);
}

button.icon-button:hover:not(:disabled) {
  color: var(--ink);
}

button.icon-button.copied {
  color: var(--ok-fg);
}

button.icon-button.copied:hover:not(:disabled) {
  color: var(--ok-fg);
}

button.icon-button svg {
  width: 16px;
  height: 16px;
}

:where(button, input, textarea):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

main {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 28px 48px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.view {
  display: grid;
  gap: 18px;
}

.view[hidden] {
  display: none;
}

.view-head .panel-sub {
  margin-top: 0;
}

.policy-savebar {
  position: sticky;
  top: var(--topbar-h);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.savebar-actions {
  display: flex;
  gap: 8px;
}

.retention-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12.5px;
  font-weight: 600;
}

.retention-row input {
  width: 84px;
  text-align: right;
}

.retention-note {
  margin: 8px 0 0;
  font-size: 12px;
}

/* States the window once for the row, so each tile label stays a single word. */
.tiles-window {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 600;
}

.tiles-window:empty {
  display: none;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.tiles:empty {
  display: none;
}

/* Count and label stack on the left, series on the right: seven bars stretched
   across a half-width tile read as blocks rather than a trend. */
.tile {
  display: grid;
  grid-template-columns: 1fr minmax(0, 168px);
  grid-template-areas:
    "value spark"
    "label spark";
  align-items: center;
  gap: 3px 16px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.tile strong {
  grid-area: value;
  align-self: end;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.tile span {
  grid-area: label;
  align-self: start;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
}

.view-all-link {
  align-self: center;
  padding: 8px 14px;
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.view-all-link:hover {
  background: var(--btn-hover-fill);
  color: var(--ink);
}

.protection-warning {
  border-color: var(--err-border);
  background: color-mix(in srgb, var(--err-bg) 60%, var(--surface));
}

.dual-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

@media (max-width: 720px) {
  .dual-panels {
    grid-template-columns: 1fr;
  }
}

/* minmax(0, 1fr), not the implicit auto track: rule IDs are nowrap, and their
   min-content would otherwise widen the whole Overview grid past the viewport. */
#top-rules,
#top-commands {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
}

.top-rule,
.top-command {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 7px 10px;
  border-color: transparent;
  background: transparent;
  border-radius: var(--radius-sm);
  text-align: left;
}

.top-rule:hover:not(:disabled),
.top-command:hover:not(:disabled) {
  background: var(--btn-hover-fill);
  border-color: transparent;
}

.top-rule .rule-id,
.top-command .rule-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guard-errors {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--warn-border);
  border-radius: var(--radius);
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
}

.activity-controls {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}

.activity-controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.activity-days {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--muted);
}

.activity-refresh {
  margin-left: auto;
}

@keyframes activity-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.activity-refresh.spinning svg {
  animation: activity-refresh-spin 0.6s linear infinite;
}

.integrations-refresh,
.rules-refresh {
  margin-left: auto;
}

.integrations-refresh.spinning svg,
.rules-refresh.spinning svg {
  animation: activity-refresh-spin 0.6s linear infinite;
}

#integrations-list {
  display: grid;
  gap: 8px;
}

.integration-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.integration-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.integration-row .status {
  grid-column: 1 / -1;
}

.integration-row button.primary,
.integration-row button.danger {
  min-width: 88px;
  background: transparent;
  border-color: transparent;
  color: var(--ink);
}

.integration-row button.primary:hover:not(:disabled),
.integration-row button.danger:hover:not(:disabled) {
  color: #fff;
}

/* The panel stacks bare .field blocks rather than wrapping them in a gapped
   grid, so each label would otherwise sit flush against the control above it. */
#rules-composer-panel .field + .field,
.rules-composer-actions {
  margin-top: 14px;
}

.rules-path-row {
  display: flex;
  gap: 8px;
}

.rules-path-row input {
  flex: 1 1 auto;
  min-width: 0;
}

.rules-path-row button {
  flex: none;
}

/* Picked, not typed: the value is a dialog result, so it reads as a fact rather
   than an editable field until the picker turns out to be unusable. */
#rules-project-path[readonly] {
  border-color: var(--border);
  color: var(--muted);
}

.rules-composer-actions {
  display: flex;
  justify-content: flex-end;
}

#rules-list,
#rules-diagnostics {
  display: grid;
  gap: 8px;
}

.rulebook-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.rulebook-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: var(--muted);
}

/* minmax(0, 1fr), not the implicit auto track: nowrap custom.<name> ids would
   otherwise widen the card past the viewport. */
.rulebook-rule {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.rulebook-head code,
.rulebook-rule code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.rulebook-rule .rule-id {
  color: var(--muted);
}

.rulebook-rule p {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

/* The jumped-to rule is scrolled to the middle of a list of near-identical
   rows, so the marker needs an edge, not just a surface shade. */
.rulebook-rule.rules-focus {
  margin: 0 -8px;
  padding: 10px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

select {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 8px 10px;
  background: var(--field-bg);
  color: var(--ink);
  font: inherit;
}

.chip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.chip-row:empty {
  display: none;
}

button.chip {
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

button.chip[aria-pressed="true"] {
  background: var(--master-bg);
  border-color: var(--master-border);
  color: var(--master-fg);
}

.chip-count {
  font-variant-numeric: tabular-nums;
}

button.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--master-bg);
  border-color: var(--master-border);
  color: var(--master-fg);
}

button.filter-pill code {
  font-family: var(--font-mono);
}

.filter-pill-x {
  opacity: 0.7;
}

.feed-list {
  display: grid;
  gap: 8px;
}

.feed-item {
  display: grid;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.feed-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--meta);
}

.feed-meta time {
  margin-left: auto;
  white-space: nowrap;
}

.feed-copy,
.feed-report {
  width: 26px;
  height: 26px;
  margin: -4px 0;
  border: 0;
  background: transparent;
}

.feed-copy:hover:not(:disabled),
.feed-report:hover:not(:disabled) {
  background: transparent;
}

.feed-copy svg,
.feed-report svg {
  width: 14px;
  height: 14px;
}

.feed-copy.copied svg {
  width: 12px;
  height: 12px;
}

.feed-meta .rule-id {
  font-family: var(--font-mono);
  color: var(--muted);
  overflow-wrap: anywhere;
}

/* button.rule-id drops to font: inherit, and the tester renders a custom rule
   id as a button next to a <code> built-in id, so the face has to be restored
   or the same slot changes typeface with the rule that fired. */
#tester-result .rule-id {
  font-family: var(--font-mono);
}

button.rule-id {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
}

button.rule-id:hover {
  color: var(--ink);
  text-decoration: underline;
}

.decision-badge {
  padding: 1px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.decision-badge.deny {
  color: var(--err-fg);
  background: var(--err-bg);
  border-color: var(--err-border);
}

.decision-badge.allow {
  color: var(--ok-fg);
  background: var(--ok-bg);
  border-color: var(--ok-border);
}

.decision-badge.error {
  color: var(--warn-fg);
  background: var(--warn-bg);
  border-color: var(--warn-border);
}

.agent-badge {
  padding: 1px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--muted);
  font-weight: 600;
}

.feed-command,
.rule-example-popover code {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.feed-command {
  padding: 8px 10px;
  max-width: 85ch;
  max-height: 7.2em;
  overflow: hidden;
}

.feed-command.clamped {
  mask-image: linear-gradient(180deg, #000 calc(100% - 1.6em), transparent);
}

.feed-command.expanded {
  max-height: none;
  mask-image: none;
}

.feed-toggle {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* .feed-toggle is sized for its usual slot below the command. In .feed-meta it
   has to drop to the row's 11px and stop overriding the row's centre alignment. */
.feed-block {
  align-self: center;
  font-size: 11px;
}

.feed-day-sep {
  padding-top: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.tile-spark {
  grid-area: spark;
  display: flex;
  align-items: stretch;
  gap: 2px;
  width: 100%;
  height: 40px;
}

/* Full-height hover column so short bars are easy to target; the visible bar
   sits at the bottom and the tooltip anchors at a consistent height. */
.spark-col {
  position: relative;
  display: flex;
  align-items: flex-end;
  flex: 1 1 0;
  min-width: 1px;
}

.spark-bar {
  width: 100%;
  background: var(--accent);
  border-radius: 1px;
}

.spark-bar.spark-zero {
  background: var(--border-strong);
}

.spark-col::after {
  content: attr(data-count);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  color: var(--ink);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.spark-col:hover::after,
.spark-col:focus-visible::after {
  opacity: 1;
}

.spark-col:focus-visible {
  border-radius: var(--radius-sm);
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.feed-reason {
  margin: 0;
  max-width: 85ch;
  font-size: 12px;
}

.activity-count {
  margin: 12px 0 0;
  font-size: 12px;
}

.activity-count:empty {
  display: none;
}

.info-rows {
  display: grid;
  gap: 10px;
}

.info-row {
  display: grid;
  gap: 3px;
}

.info-row > span {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
}

.info-row code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.danger-row strong {
  font-size: 13px;
}

.danger-row p {
  margin: 4px 0 0;
  font-size: 12px;
}

.status {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.status:empty {
  display: none;
}

.protection-banner {
  padding: 10px 14px;
  border: 1px solid var(--err-fg);
  border-radius: var(--radius);
  background: var(--err-bg);
  color: var(--err-fg);
  font-weight: 600;
}

.status.ok {
  color: var(--ok-fg);
  background: var(--ok-bg);
  border-color: var(--ok-border);
}

.status.error {
  color: var(--err-fg);
  background: var(--err-bg);
  border-color: var(--err-border);
}

.health-strip strong {
  color: var(--ink);
  font-weight: 650;
}

.recovery {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid var(--err-border);
  border-radius: var(--radius);
  background: var(--surface);
}

.recovery[hidden] {
  display: none;
}

.recovery strong {
  display: block;
  font-size: 13px;
}

.recovery p {
  margin: 4px 0 0;
}

.muted {
  color: var(--muted);
  line-height: 1.45;
}

.confirm-dialog {
  width: min(420px, calc(100vw - 32px));
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
}

.rule-example-popover {
  position: fixed;
  inset: auto;
  width: min(360px, calc(100vw - 24px));
  margin: 0;
  padding: 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 4px 8px rgb(0 0 0 / 18%);
}

.rule-example-popover::backdrop {
  background: transparent;
}

.rule-example-popover > * {
  display: block;
}

.rule-example-label {
  margin-bottom: 3px;
  color: var(--muted);
  font-size: 11px;
}

.rule-example-popover strong {
  margin-bottom: 10px;
  font-size: 13px;
}

.rule-example-popover code {
  padding: 9px 10px;
}

.confirm-dialog::backdrop {
  background: rgb(0 0 0 / 48%);
}

.confirm-dialog form {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.confirm-dialog h2 {
  margin: 0;
}

.confirm-dialog p {
  margin: 0;
}

.dialog-detail {
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  overflow-wrap: anywhere;
}

.dialog-detail code {
  font-family: var(--font-mono);
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.report-dialog {
  width: min(680px, calc(100vw - 32px));
}

.report-field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.panel-title {
  min-width: 0;
}

.raw-json-head {
  flex-wrap: nowrap;
}

.raw-json-head .panel-title {
  flex: 1 1 auto;
}

.raw-json-head #raw-copy {
  flex: none;
}

.panel-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: -4px 0;
  padding: 4px 6px 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
}

.panel-toggle:hover {
  background: transparent;
  color: var(--ink);
}

.panel-chevron {
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform 0.15s ease;
}

.panel-toggle[aria-expanded="false"] .panel-chevron,
:is(.rule-tier-head, .tier-collapse)[aria-expanded="false"] .panel-chevron {
  transform: rotate(-45deg);
}

h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.panel-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}

label.row {
  display: flex;
  gap: 12px;
}

label.row,
.rule-row {
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

label.row:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

label.row.row-disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

label.row.row-disabled:hover {
  border-color: var(--border);
  background: var(--surface);
}

:is(label.row, .rule-control) input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  margin: 1px 0 0;
  width: 34px;
  height: 20px;
  flex: none;
  border: 1px solid var(--switch-track);
  border-radius: 999px;
  background: var(--switch-track);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;
}

:is(label.row, .rule-control) input[type="checkbox"]::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--switch-knob);
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
  transition: transform 0.18s ease;
}

:is(label.row, .rule-control) input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}

:is(label.row, .rule-control) input[type="checkbox"]:checked::before {
  transform: translateX(14px);
}

:is(label.row, .rule-control):hover input[type="checkbox"]:not(:checked) {
  border-color: var(--switch-track-hover);
  background: var(--switch-track-hover);
}

label.row.safety-override-row {
  display: grid;
  gap: 8px;
}

label.row.safety-override-row select {
  width: 100%;
}

:is(label.row, .rule-control) span {
  display: block;
  min-width: 0;
}

:is(label.row, .rule-control) strong {
  font-weight: 650;
  font-size: 13px;
}

:is(label.row, .rule-control) .rule-id {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
  word-break: break-all;
}

:is(label.row, .rule-control) small {
  display: block;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.45;
}

#destructive-command > label.row {
  margin-bottom: 16px;
}

.preset-status {
  margin-bottom: 10px;
  font-weight: 700;
}

#safety-preset-status:empty {
  display: none;
}

.preset-status.customized {
  color: var(--master-fg);
}

/* The picker is the most consequential control in the console, and it named
   the same three tiers the rule sections below already color. The selected
   card now speaks that vocabulary; unselected cards stay neutral. */
.preset-standard {
  --preset-fg: var(--ok-fg);
  --preset-bg: var(--ok-bg);
  --preset-border: var(--ok-border);
}

.preset-strict {
  --preset-fg: var(--strict-fg);
  --preset-bg: var(--strict-bg);
  --preset-border: var(--strict-border);
}

.preset-paranoid {
  --preset-fg: var(--paranoid-fg);
  --preset-bg: var(--paranoid-bg);
  --preset-border: var(--paranoid-border);
}

#safety-level label.row:has(input:checked),
#safety-level label.row:has(input:checked):hover {
  border-color: var(--preset-border);
  background: var(--preset-bg);
  accent-color: var(--preset-fg);
}

#safety-level label.row:has(input:checked) strong {
  color: var(--preset-fg);
}

.panel-head-action {
  flex: none;
}

.rule-tier {
  overflow: clip;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
}

.rule-tier + .rule-tier,
#destructive-command-rules + .rule-tier {
  margin-top: 10px;
}

.rule-tier-enforced {
  border-color: var(--ok-border);
}

.rule-tier-strict {
  border-color: var(--strict-border);
}

.rule-tier-paranoid {
  border-color: var(--paranoid-border);
}

.rule-tier-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border: 0;
  border-radius: 0;
  background: var(--surface-2);
  color: var(--ink);
  text-align: left;
}

.rule-tier-head:hover:not(:disabled) {
  background: var(--surface-2);
}

/* The secret group head carries a bulk action, so the collapse control is a
   button inside the head rather than the head itself. The negative margin
   cancels the head's padding and the stretch spans the taller switch beside it,
   so the button covers the whole head band and the layout stays where it was;
   without them the head's padding is a dead zone. */
.tier-collapse {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  align-self: stretch;
  gap: 12px;
  margin: -9px -10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 0;
  background: none;
  color: inherit;
  text-align: left;
}

/* A thin track with a knob that overhangs it. The rule switches are a filled
   pill, so the group control does not read as one more rule. */
.tier-switch {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  width: 30px;
  height: 16px;
  flex: none;
  padding: 0;
  border: 0;
  background: none;
}

.tier-switch::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--switch-track);
  transition: background-color 0.18s ease;
}

/* Above the track, which paints later in the pseudo-element order. */
.tier-switch::before {
  content: "";
  position: absolute;
  z-index: 1;
  top: 0;
  left: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--switch-knob);
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
  transition: transform 0.18s ease;
}

.tier-switch:checked::after {
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}

.tier-switch:checked::before {
  transform: translateX(14px);
  background: var(--accent);
}

/* The tiers that can be switched off carried the only hues, leaving the tier
   that can never be switched off as the quietest thing on the panel. */
.rule-tier-enforced .rule-tier-head,
.rule-tier-enforced .rule-tier-head:hover:not(:disabled) {
  background: var(--ok-bg);
  color: var(--ok-fg);
}

.rule-tier-strict .rule-tier-head,
.rule-tier-strict .rule-tier-head:hover:not(:disabled) {
  background: var(--strict-bg);
  color: var(--strict-fg);
}

.rule-tier-paranoid .rule-tier-head,
.rule-tier-paranoid .rule-tier-head:hover:not(:disabled) {
  background: var(--paranoid-bg);
  color: var(--paranoid-fg);
}

.tier-label {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.tier-label small,
.tier-counts {
  color: inherit;
  font-size: 11px;
}

.tier-counts {
  flex: none;
  font-weight: 500;
  text-align: right;
}

.tier-counts .count-off {
  color: var(--warn-fg);
}

.tier-content {
  padding: 12px;
  border-top: 1px solid var(--border);
}

.rule-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.rule-row:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.rule-row.row-disabled {
  background: var(--surface);
}

.rule-control {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: flex-start;
  gap: 12px;
}

.rule-row.row-disabled .rule-control {
  cursor: not-allowed;
  opacity: 0.62;
}

.rule-example-button {
  position: relative;
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
}

.rule-example-button::before {
  content: "";
  position: absolute;
  inset: -9px;
}

.rule-example-button:hover:not(:disabled) {
  color: var(--ink);
}

.inherit-button {
  grid-column: 1 / -1;
  justify-self: end;
  padding: 5px 8px;
  font-size: 11px;
}

label.row.master {
  align-items: center;
  padding: 12px 14px;
  border-color: var(--err-border);
  background: color-mix(in srgb, var(--err-bg) 60%, var(--surface));
}

label.row.master:hover {
  border-color: color-mix(in srgb, var(--err-fg) 34%, var(--err-border));
  background: var(--err-bg);
}

label.row.master:not(:has(input:checked)) {
  border-left: 3px solid var(--err-fg);
}

label.row.master:has(input:checked) {
  border-color: var(--master-border);
  background: color-mix(in srgb, var(--master-bg) 72%, var(--surface));
}

label.row.master:has(input:checked):hover {
  border-color: color-mix(in srgb, var(--master) 42%, var(--master-border));
  background: var(--master-bg);
}

label.row.master strong {
  font-size: 15px;
}

label.row.master input[type="checkbox"] {
  margin: 0;
  width: 44px;
  height: 24px;
}

label.row.master input[type="checkbox"]:checked {
  background: var(--master);
  border-color: var(--master);
}

label.row.master input[type="checkbox"]::before {
  width: 18px;
  height: 18px;
}

label.row.master input[type="checkbox"]:checked::before {
  transform: translateX(20px);
}

.master-badge {
  flex: none;
  margin-left: auto;
  padding: 2px 9px;
  border: 1px solid var(--err-border);
  border-radius: 999px;
  background: var(--err-bg);
  color: var(--err-fg);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

label.row.master:has(input:checked) .master-badge {
  border-color: var(--master-border);
  background: var(--master-bg);
  color: var(--master-fg);
}

.state-active {
  color: var(--ok-fg);
  font-weight: 700;
}

.state-disabled {
  color: var(--err-fg);
  font-weight: 700;
}

.destructive-command-group + .destructive-command-group {
  margin-top: 24px;
}

.destructive-command-group h3 {
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.empty {
  margin: 0;
  padding: 16px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--muted);
  text-align: center;
}

#secret {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 4px;
}

.field-toggle .panel-toggle {
  justify-self: start;
  margin: -2px 0;
  padding: 2px 6px 2px 0;
  font-weight: 650;
}

#safety-level + .field,
.foldable-field-content + .field {
  margin-top: 14px;
}

#safety-overrides,
#workflow {
  margin-top: 4px;
}

.foldable-field-content {
  display: grid;
  gap: 4px;
}

.foldable-field-content > p {
  margin: 0;
  font-size: 12px;
}

.paths-content:not([hidden]) {
  display: grid;
  gap: 10px;
}

.paths-content > p.muted {
  margin: 0;
  font-size: 12px;
}

.field > span {
  font-size: 13px;
  font-weight: 650;
}

.field small {
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 400;
  line-height: 1.45;
}

input[type="search"],
input[type="text"],
textarea {
  width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 9px 11px;
  background: var(--field-bg);
  color: var(--ink);
  font: inherit;
  transition: border-color 0.15s ease;
}

input[type="search"]:hover,
input[type="text"]:hover,
textarea:hover {
  border-color: var(--muted);
}

/* Text fields carry no focus ring. \`outline: none\` is load-bearing rather than
   redundant: without it these fall back to the browser's default focus-visible
   outline. Buttons, links, and the sparkline columns keep theirs. */
input[type="search"]:focus,
input[type="text"]:focus,
textarea:focus {
  border-color: var(--muted);
  outline: none;
}

input[type="text"]:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.tester-row {
  display: flex;
  gap: 8px;
}

.tester-row input[type="text"] {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.tester-row button {
  flex: none;
  align-self: center;
}

#tester-result {
  margin-top: 12px;
}

.tester-segment {
  margin-top: 6px;
}

.paths-add {
  display: flex;
  gap: 8px;
}

.paths-add input[type="text"] {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.paths-add button {
  flex: none;
  align-self: center;
}

.paths-hint {
  margin: -6px 0 0;
  color: var(--err-fg);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.paths-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.path-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-item code {
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}

.path-item button:hover:not(:disabled) {
  color: var(--err-fg);
  border-color: var(--err-border);
  background: var(--err-bg);
}

.path-item.row-disabled {
  opacity: 0.62;
}

.path-item.row-disabled button {
  cursor: not-allowed;
}

.path-item button {
  flex: none;
}

textarea {
  min-height: 96px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
}

#raw {
  min-height: 280px;
}

.star-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 0 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.star-pitch {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--ink);
  font-size: 12.5px;
  line-height: 1.45;
}

.star-pitch strong {
  font-variant-numeric: tabular-nums;
}

.star-mechanism {
  display: block;
  margin-top: 2px;
  color: var(--meta);
  font-size: 11.5px;
}

#star-slot {
  display: inline-flex;
  flex: none;
}

.star-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: none;
  white-space: nowrap;
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.star-cta:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--star) 45%, var(--border-strong));
  background: var(--surface-2);
  color: var(--ink);
}

.star-cta:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.star-icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
  color: var(--star);
}

.star-icon svg {
  width: 15px;
  height: 15px;
}

.star-count {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  border-left: 1px solid var(--border-strong);
  padding-left: 8px;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.star-cta.starred:disabled {
  opacity: 1;
  cursor: default;
}

/* !important and the pseudo-element selectors are load-bearing: the universal
   selector loses to every class-level transition in this file, and does not
   match the switch knob's ::before at all. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    /* biome-ignore lint/complexity/noImportantStyles: reduced-motion must win over every class-level transition */
    transition: none !important;
  }

  .activity-refresh.spinning svg,
  .integrations-refresh.spinning svg,
  .rules-refresh.spinning svg {
    animation: none;
  }
}

@media (max-width: 900px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .app-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }

  .sidebar {
    z-index: 100;
    height: var(--topbar-h);
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 0 16px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  /* The bar's six nav items sit at their minimum width, so the wordmark is
     what has to give for the row to fit a 320px viewport. */
  .brand-logo svg {
    height: 20px;
  }

  .topbar {
    position: static;
    z-index: auto;
  }

  /* On views with a search, the top bar becomes a slim sticky search row
     pinned directly below the nav bar. */
  .topbar.has-search {
    position: sticky;
    top: var(--topbar-h);
    z-index: 95;
  }

  .policy-savebar {
    top: calc(var(--topbar-h) * 2);
  }

  .brand {
    flex: none;
    padding: 0;
  }

  main {
    flex: 1;
  }

  .app-foot {
    display: flex;
    justify-content: center;
    gap: 28px;
    padding: 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }

  .app-foot a {
    color: var(--meta);
    text-decoration: none;
  }

  .app-foot a:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .sidenav {
    display: flex;
    flex: 1;
    justify-content: flex-end;
    gap: 2px;
  }

  /* Vertical padding fills the bar for a taller touch target; the horizontal
     side stays tight because the row already has no width to spare at 320px. */
  .sidenav a {
    padding: 15px 7px;
  }

  .sr-only-collapse {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .sidebar-foot {
    display: none;
  }
}

@media (max-width: 640px) {
  .topbar {
    padding: 10px 16px;
  }

  .topbar-row {
    flex-wrap: wrap;
  }

  .topbar.has-search .topbar-row {
    flex-wrap: nowrap;
  }

  main {
    padding: 18px 16px 40px;
  }

  .topbar-search {
    max-width: none;
  }

  .panel {
    padding: 16px;
  }

  .star-row {
    flex-wrap: wrap;
  }

  .star-row .star-cta,
  .star-row #star-slot {
    flex: 1 1 100%;
    justify-content: center;
  }

  .panel-head {
    flex-direction: column;
  }

  .raw-json-head,
  .panel-head:has(.view-all-link) {
    flex-direction: row;
    align-items: center;
  }

  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  /* The counts wrap to their own line below the label. The destructive tiers
     and secret groups nest the label and counts inside .tier-collapse, so the
     wrap must be enabled there as well, not only on the head. */
  .rule-tier-head,
  .tier-collapse {
    flex-wrap: wrap;
  }

  .rule-row {
    align-items: start;
  }

  .tier-counts {
    flex: 1 1 100%;
    padding-left: 20px;
    text-align: left;
  }

  .inherit-button {
    align-self: flex-start;
  }
}

@media (min-width: 1440px) {
  body[data-view="overview"] main,
  body[data-view="overview"] .topbar-row {
    max-width: 1200px;
  }
}

[hidden] {
  display: none;
}

  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <h1 class="brand-logo"><a class="brand-home" href="#overview" title="Overview"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 512" role="img" aria-label="CC Safety Net">
  <path d="M 1439 165 L 1411 165 L 1409 166 L 1408 168 L 1403 173 L 1403 174 L 1398 179 L 1398 180 L 1395 183 L 1394 183 L 1394 184 L 1385 194 L 1385 195 L 1381 199 L 1381 200 L 1378 202 L 1378 203 L 1374 207 L 1374 208 L 1367 215 L 1367 216 L 1358 226 L 1358 227 L 1352 233 L 1352 234 L 1347 239 L 1347 240 L 1341 246 L 1341 247 L 1336 252 L 1336 253 L 1332 257 L 1332 258 L 1325 265 L 1325 266 L 1319 272 L 1319 273 L 1314 278 L 1314 279 L 1309 284 L 1309 285 L 1303 291 L 1303 292 L 1299 296 L 1299 297 L 1294 302 L 1291 299 L 1290 300 L 1290 301 L 1293 301 L 1294 302 L 1288 309 L 1287 308 L 1288 309 L 1286 312 L 1285 311 L 1285 306 L 1286 305 L 1286 303 L 1288 299 L 1288 296 L 1289 295 L 1289 292 L 1290 291 L 1290 287 L 1291 286 L 1291 284 L 1293 280 L 1293 277 L 1294 276 L 1294 272 L 1295 271 L 1295 269 L 1297 265 L 1297 262 L 1298 261 L 1298 258 L 1299 257 L 1299 253 L 1300 252 L 1300 250 L 1301 249 L 1301 247 L 1303 243 L 1303 238 L 1304 237 L 1304 235 L 1305 234 L 1305 232 L 1307 228 L 1307 224 L 1308 223 L 1308 221 L 1309 220 L 1309 217 L 1310 216 L 1310 214 L 1312 210 L 1312 205 L 1314 202 L 1314 199 L 1316 195 L 1317 188 L 1318 187 L 1318 185 L 1319 184 L 1319 182 L 1321 178 L 1321 173 L 1323 169 L 1323 166 L 1296 166 L 1296 168 L 1294 171 L 1294 174 L 1293 175 L 1293 178 L 1292 179 L 1291 186 L 1290 187 L 1290 189 L 1289 190 L 1289 192 L 1287 196 L 1287 200 L 1285 204 L 1285 207 L 1283 211 L 1283 215 L 1282 216 L 1282 218 L 1281 219 L 1281 222 L 1279 226 L 1279 229 L 1278 230 L 1278 234 L 1277 235 L 1277 237 L 1276 238 L 1276 240 L 1274 244 L 1274 249 L 1273 250 L 1273 252 L 1271 256 L 1271 259 L 1270 260 L 1270 263 L 1269 264 L 1269 268 L 1268 269 L 1268 271 L 1266 275 L 1266 278 L 1265 279 L 1265 284 L 1264 285 L 1264 287 L 1262 291 L 1262 294 L 1261 295 L 1261 298 L 1260 299 L 1259 306 L 1258 307 L 1258 309 L 1257 310 L 1257 313 L 1256 314 L 1256 318 L 1254 322 L 1254 325 L 1273 325 L 1274 327 L 1273 328 L 1272 327 L 1273 328 L 1269 332 L 1269 333 L 1265 337 L 1265 338 L 1261 341 L 1261 342 L 1252 352 L 1252 353 L 1247 358 L 1247 359 L 1242 364 L 1242 365 L 1239 367 L 1239 368 L 1224 385 L 1224 386 L 1220 390 L 1220 391 L 1216 395 L 1216 396 L 1214 397 L 1214 399 L 1247 399 L 1249 397 L 1249 396 L 1259 385 L 1259 384 L 1263 380 L 1263 379 L 1265 377 L 1266 377 L 1266 376 L 1271 371 L 1271 370 L 1278 363 L 1278 362 L 1283 357 L 1283 356 L 1294 344 L 1294 343 L 1298 339 L 1298 338 L 1305 331 L 1305 330 L 1309 326 L 1309 325 L 1312 323 L 1313 320 L 1315 319 L 1316 317 L 1321 312 L 1322 312 L 1321 311 L 1330 301 L 1330 300 L 1335 295 L 1335 294 L 1337 292 L 1338 292 L 1339 289 L 1342 287 L 1342 286 L 1346 282 L 1346 281 L 1352 275 L 1352 274 L 1361 264 L 1361 263 L 1370 253 L 1370 252 L 1375 247 L 1375 246 L 1380 241 L 1380 240 L 1387 233 L 1387 232 L 1402 215 L 1402 214 L 1406 210 L 1406 209 L 1408 207 L 1409 207 L 1409 206 L 1413 202 L 1413 201 L 1418 196 L 1418 195 L 1422 191 L 1422 190 L 1427 185 L 1427 184 L 1431 180 L 1431 179 L 1440 169 L 1441 167 Z
M 1129 179 L 1126 178 L 1125 176 L 1124 176 L 1116 170 L 1114 170 L 1107 166 L 1105 166 L 1104 165 L 1101 165 L 1100 164 L 1096 164 L 1095 163 L 1091 163 L 1090 162 L 1081 162 L 1080 161 L 1076 161 L 1075 162 L 1066 162 L 1065 163 L 1061 163 L 1060 164 L 1057 164 L 1056 165 L 1051 165 L 1050 166 L 1045 167 L 1040 170 L 1038 170 L 1028 175 L 1023 179 L 1021 179 L 1017 183 L 1016 183 L 1012 187 L 1011 187 L 999 199 L 999 200 L 996 203 L 996 204 L 994 205 L 993 208 L 990 211 L 981 229 L 981 231 L 980 232 L 980 234 L 979 235 L 979 237 L 977 241 L 977 244 L 976 245 L 976 254 L 975 255 L 975 265 L 976 266 L 976 273 L 977 274 L 977 277 L 980 283 L 981 288 L 984 292 L 985 295 L 988 298 L 989 301 L 998 310 L 1001 311 L 1004 314 L 1007 315 L 1009 317 L 1013 319 L 1015 319 L 1018 321 L 1020 321 L 1024 323 L 1027 323 L 1028 324 L 1035 324 L 1036 325 L 1054 325 L 1055 324 L 1062 324 L 1063 323 L 1067 323 L 1068 322 L 1071 322 L 1077 319 L 1080 319 L 1087 315 L 1089 315 L 1093 313 L 1095 311 L 1098 310 L 1103 306 L 1106 305 L 1116 296 L 1117 296 L 1115 292 L 1113 290 L 1112 290 L 1111 288 L 1109 286 L 1108 286 L 1107 284 L 1100 278 L 1098 279 L 1090 286 L 1089 286 L 1086 289 L 1074 295 L 1072 295 L 1068 297 L 1065 297 L 1064 298 L 1061 298 L 1060 299 L 1041 299 L 1040 298 L 1037 298 L 1036 297 L 1031 296 L 1028 294 L 1026 294 L 1024 292 L 1020 290 L 1010 280 L 1008 275 L 1006 273 L 1005 271 L 1005 268 L 1004 267 L 1004 264 L 1003 263 L 1003 248 L 1004 247 L 1005 238 L 1008 233 L 1008 231 L 1010 227 L 1012 225 L 1013 222 L 1018 216 L 1018 215 L 1030 203 L 1031 203 L 1044 194 L 1046 194 L 1053 190 L 1056 190 L 1057 189 L 1060 189 L 1061 188 L 1064 188 L 1065 187 L 1071 187 L 1072 186 L 1076 186 L 1077 187 L 1083 187 L 1084 188 L 1087 188 L 1088 189 L 1090 189 L 1091 190 L 1096 191 L 1100 194 L 1103 195 L 1106 198 L 1107 198 L 1109 200 L 1109 201 L 1114 206 L 1114 207 L 1116 209 L 1118 213 L 1118 216 L 1120 220 L 1120 225 L 1116 227 L 1111 227 L 1110 228 L 1103 228 L 1102 229 L 1097 229 L 1096 230 L 1091 230 L 1090 231 L 1086 231 L 1085 232 L 1077 232 L 1076 233 L 1072 233 L 1071 234 L 1066 234 L 1065 235 L 1061 235 L 1060 236 L 1053 236 L 1052 237 L 1047 237 L 1047 240 L 1046 241 L 1046 243 L 1045 244 L 1045 247 L 1044 248 L 1044 250 L 1043 251 L 1043 254 L 1042 255 L 1042 260 L 1041 261 L 1041 263 L 1044 263 L 1045 262 L 1050 262 L 1051 261 L 1058 261 L 1059 260 L 1063 260 L 1064 259 L 1068 259 L 1069 258 L 1073 258 L 1074 257 L 1080 257 L 1081 256 L 1086 256 L 1087 255 L 1092 255 L 1093 254 L 1097 254 L 1098 253 L 1103 253 L 1104 252 L 1111 252 L 1112 251 L 1116 251 L 1117 250 L 1121 250 L 1122 249 L 1126 249 L 1127 248 L 1133 248 L 1134 247 L 1139 247 L 1140 246 L 1144 246 L 1146 243 L 1146 240 L 1147 239 L 1147 231 L 1148 230 L 1148 220 L 1147 219 L 1147 211 L 1146 210 L 1146 207 L 1144 204 L 1144 202 L 1143 201 L 1143 199 L 1141 195 L 1139 193 L 1138 190 L 1134 186 L 1133 183 L 1132 183 L 1129 180 Z
M 1779 171 L 1767 165 L 1765 165 L 1764 164 L 1762 164 L 1758 162 L 1755 162 L 1754 161 L 1747 161 L 1746 160 L 1729 160 L 1728 161 L 1722 161 L 1721 162 L 1718 162 L 1717 163 L 1715 163 L 1711 165 L 1707 165 L 1687 175 L 1685 177 L 1681 179 L 1672 187 L 1671 187 L 1661 197 L 1661 198 L 1657 202 L 1657 203 L 1652 209 L 1651 212 L 1649 214 L 1644 224 L 1643 229 L 1640 235 L 1640 238 L 1639 239 L 1639 244 L 1638 245 L 1638 250 L 1637 251 L 1637 267 L 1638 268 L 1638 273 L 1639 274 L 1639 278 L 1640 279 L 1640 282 L 1648 298 L 1652 302 L 1652 303 L 1655 306 L 1657 307 L 1657 308 L 1659 310 L 1660 310 L 1663 313 L 1669 316 L 1671 318 L 1673 319 L 1675 319 L 1676 320 L 1678 320 L 1684 323 L 1688 323 L 1689 324 L 1696 324 L 1697 325 L 1715 325 L 1716 324 L 1723 324 L 1724 323 L 1728 323 L 1729 322 L 1732 322 L 1738 319 L 1741 319 L 1748 315 L 1750 315 L 1754 313 L 1758 310 L 1759 311 L 1760 309 L 1761 309 L 1764 306 L 1765 306 L 1771 301 L 1772 301 L 1778 295 L 1761 278 L 1760 278 L 1756 282 L 1755 282 L 1751 286 L 1750 286 L 1745 290 L 1737 294 L 1732 295 L 1729 297 L 1726 297 L 1725 298 L 1721 298 L 1720 299 L 1703 299 L 1702 298 L 1698 298 L 1697 297 L 1692 296 L 1684 292 L 1682 290 L 1681 290 L 1673 282 L 1671 278 L 1668 275 L 1668 273 L 1667 272 L 1667 270 L 1666 269 L 1666 267 L 1664 263 L 1664 246 L 1665 245 L 1665 242 L 1666 241 L 1666 239 L 1668 235 L 1668 232 L 1670 228 L 1672 226 L 1673 224 L 1673 222 L 1680 214 L 1680 213 L 1690 203 L 1691 203 L 1694 200 L 1695 200 L 1700 196 L 1712 190 L 1715 190 L 1716 189 L 1718 189 L 1722 187 L 1725 187 L 1726 186 L 1744 186 L 1745 187 L 1747 187 L 1748 188 L 1750 188 L 1751 189 L 1756 190 L 1758 191 L 1761 194 L 1764 195 L 1773 204 L 1773 205 L 1777 210 L 1777 212 L 1778 213 L 1778 215 L 1780 219 L 1780 223 L 1781 225 L 1780 226 L 1775 226 L 1774 227 L 1768 227 L 1767 228 L 1759 228 L 1758 229 L 1753 229 L 1752 230 L 1747 230 L 1746 231 L 1742 231 L 1741 232 L 1733 232 L 1732 233 L 1727 233 L 1726 234 L 1722 234 L 1721 235 L 1717 235 L 1716 236 L 1709 236 L 1707 238 L 1707 241 L 1706 242 L 1706 246 L 1705 247 L 1705 250 L 1703 254 L 1703 258 L 1702 259 L 1702 262 L 1706 262 L 1707 261 L 1714 261 L 1715 260 L 1724 259 L 1725 258 L 1728 258 L 1729 257 L 1735 257 L 1736 256 L 1742 256 L 1743 255 L 1747 255 L 1748 254 L 1752 254 L 1753 253 L 1757 253 L 1758 252 L 1765 252 L 1766 251 L 1771 251 L 1772 250 L 1776 250 L 1777 249 L 1781 249 L 1782 248 L 1789 248 L 1790 247 L 1794 247 L 1795 246 L 1804 245 L 1805 243 L 1805 240 L 1806 239 L 1807 240 L 1807 243 L 1809 244 L 1809 241 L 1808 241 L 1806 238 L 1806 232 L 1807 231 L 1807 217 L 1806 216 L 1806 210 L 1805 209 L 1805 206 L 1802 200 L 1802 198 L 1800 194 L 1798 192 L 1797 189 L 1790 181 L 1790 180 L 1788 179 Z
M 714 187 L 712 189 L 712 190 L 708 193 L 708 194 L 704 198 L 704 199 L 700 203 L 700 204 L 695 210 L 695 212 L 693 214 L 690 220 L 690 222 L 686 229 L 686 233 L 684 237 L 684 240 L 683 241 L 683 245 L 682 246 L 682 268 L 683 269 L 683 273 L 684 274 L 684 276 L 686 280 L 686 283 L 692 295 L 699 303 L 699 304 L 701 306 L 702 306 L 704 308 L 704 309 L 707 310 L 711 314 L 716 316 L 718 318 L 720 319 L 722 319 L 725 321 L 730 322 L 731 323 L 734 323 L 735 324 L 740 324 L 741 325 L 749 325 L 750 326 L 759 326 L 760 325 L 767 325 L 768 324 L 775 324 L 776 323 L 780 323 L 788 319 L 791 319 L 792 318 L 794 318 L 798 315 L 800 315 L 810 309 L 812 310 L 812 313 L 811 314 L 811 319 L 810 320 L 809 325 L 836 325 L 839 319 L 839 316 L 840 315 L 840 310 L 841 309 L 841 307 L 842 306 L 842 303 L 844 299 L 844 295 L 845 294 L 846 287 L 847 286 L 847 284 L 849 280 L 849 275 L 850 274 L 850 271 L 851 270 L 851 268 L 853 264 L 854 255 L 855 254 L 855 252 L 856 251 L 856 248 L 857 247 L 857 244 L 858 243 L 858 217 L 857 216 L 857 212 L 854 206 L 853 201 L 851 197 L 849 195 L 849 193 L 846 190 L 844 186 L 835 177 L 834 177 L 831 174 L 830 174 L 825 170 L 823 170 L 814 165 L 811 165 L 808 163 L 805 163 L 804 162 L 800 162 L 799 161 L 793 161 L 792 160 L 773 160 L 772 161 L 765 161 L 764 162 L 757 163 L 753 165 L 750 165 L 743 169 L 741 169 L 735 172 L 733 174 L 730 175 L 728 177 L 724 179 L 715 187 Z
M 806 192 L 808 194 L 811 195 L 815 199 L 816 199 L 822 206 L 822 207 L 824 209 L 827 215 L 827 217 L 829 221 L 829 226 L 830 227 L 830 240 L 829 241 L 829 246 L 828 247 L 828 250 L 827 251 L 827 253 L 825 256 L 825 258 L 823 262 L 821 264 L 820 267 L 817 270 L 817 271 L 808 281 L 807 281 L 803 285 L 799 287 L 796 290 L 794 290 L 788 294 L 786 294 L 785 295 L 783 295 L 782 296 L 780 296 L 776 298 L 773 298 L 772 299 L 748 299 L 747 298 L 744 298 L 743 297 L 738 296 L 735 294 L 733 294 L 731 292 L 727 290 L 717 280 L 717 279 L 715 277 L 712 271 L 712 269 L 710 265 L 710 262 L 709 261 L 709 245 L 710 244 L 710 240 L 711 239 L 711 237 L 712 236 L 713 231 L 717 223 L 719 221 L 720 218 L 724 214 L 724 213 L 734 203 L 735 203 L 739 199 L 742 198 L 744 196 L 756 190 L 758 190 L 762 188 L 765 188 L 766 187 L 769 187 L 770 186 L 788 186 L 789 187 L 792 187 L 796 189 L 799 189 L 800 190 L 802 190 Z
M 1192 121 L 1190 122 L 1190 124 L 1189 125 L 1189 129 L 1188 130 L 1188 132 L 1186 136 L 1186 139 L 1185 140 L 1184 147 L 1183 148 L 1183 150 L 1181 154 L 1181 157 L 1180 158 L 1180 162 L 1179 163 L 1179 165 L 1178 166 L 1178 168 L 1176 172 L 1176 176 L 1175 177 L 1175 179 L 1173 183 L 1173 186 L 1172 187 L 1171 194 L 1170 195 L 1170 197 L 1168 201 L 1168 204 L 1167 205 L 1167 209 L 1166 210 L 1166 212 L 1164 216 L 1164 219 L 1163 220 L 1162 227 L 1160 231 L 1160 234 L 1159 235 L 1158 242 L 1157 243 L 1157 245 L 1155 249 L 1155 252 L 1154 253 L 1154 259 L 1153 260 L 1153 276 L 1154 277 L 1154 282 L 1155 283 L 1155 286 L 1158 292 L 1158 294 L 1161 298 L 1162 301 L 1173 313 L 1174 313 L 1182 319 L 1184 319 L 1189 322 L 1191 322 L 1195 324 L 1199 324 L 1200 325 L 1236 325 L 1236 323 L 1237 322 L 1237 319 L 1238 318 L 1238 315 L 1239 314 L 1239 311 L 1240 310 L 1240 307 L 1241 306 L 1241 303 L 1242 302 L 1242 300 L 1241 299 L 1209 299 L 1208 298 L 1205 298 L 1195 293 L 1187 285 L 1186 282 L 1183 278 L 1183 275 L 1182 274 L 1182 271 L 1181 270 L 1181 257 L 1182 256 L 1182 253 L 1183 252 L 1183 248 L 1184 247 L 1184 245 L 1186 241 L 1186 238 L 1187 237 L 1187 233 L 1188 232 L 1188 230 L 1189 229 L 1189 227 L 1191 223 L 1191 220 L 1192 219 L 1192 215 L 1193 214 L 1193 211 L 1195 207 L 1195 204 L 1196 203 L 1196 199 L 1197 198 L 1197 195 L 1198 194 L 1198 192 L 1200 190 L 1278 190 L 1279 189 L 1279 187 L 1281 183 L 1281 180 L 1282 179 L 1282 177 L 1283 176 L 1283 174 L 1285 170 L 1285 166 L 1286 165 L 1285 164 L 1269 164 L 1268 165 L 1239 165 L 1238 164 L 1221 164 L 1220 165 L 1210 165 L 1209 164 L 1207 164 L 1206 163 L 1207 162 L 1207 159 L 1209 155 L 1209 152 L 1210 151 L 1210 147 L 1211 146 L 1211 144 L 1213 140 L 1214 133 L 1216 129 L 1217 122 L 1216 121 Z
M 997 121 L 978 121 L 977 122 L 960 122 L 959 123 L 952 124 L 948 126 L 945 126 L 938 130 L 936 130 L 931 134 L 928 135 L 925 138 L 922 139 L 917 144 L 916 144 L 907 153 L 907 154 L 903 158 L 903 159 L 897 166 L 888 184 L 888 186 L 886 190 L 886 193 L 884 197 L 884 200 L 882 204 L 882 209 L 881 210 L 881 213 L 880 214 L 880 216 L 878 220 L 878 224 L 877 225 L 876 232 L 875 233 L 875 235 L 873 239 L 873 244 L 871 248 L 871 251 L 869 255 L 869 259 L 868 260 L 868 263 L 867 264 L 867 266 L 866 267 L 866 270 L 864 274 L 864 279 L 863 280 L 863 282 L 862 283 L 862 285 L 860 289 L 860 294 L 859 295 L 859 298 L 857 301 L 857 304 L 856 305 L 856 308 L 855 309 L 855 313 L 854 314 L 854 316 L 853 317 L 853 320 L 851 324 L 852 325 L 878 325 L 879 324 L 879 322 L 880 321 L 880 317 L 881 316 L 881 314 L 883 310 L 883 307 L 884 306 L 885 299 L 887 295 L 887 292 L 888 291 L 889 284 L 891 280 L 891 277 L 892 276 L 892 273 L 893 272 L 894 265 L 896 261 L 896 258 L 897 257 L 897 254 L 898 253 L 898 249 L 899 248 L 899 246 L 901 242 L 901 239 L 902 238 L 903 231 L 905 227 L 905 224 L 906 223 L 906 219 L 907 218 L 908 211 L 910 207 L 910 204 L 911 203 L 911 199 L 912 198 L 912 196 L 914 194 L 980 194 L 982 192 L 982 188 L 983 187 L 984 180 L 986 176 L 986 173 L 988 172 L 987 170 L 987 168 L 930 168 L 929 167 L 937 159 L 938 159 L 941 156 L 942 156 L 944 154 L 946 154 L 948 152 L 952 150 L 955 150 L 956 149 L 959 149 L 960 148 L 964 148 L 965 147 L 992 147 L 993 146 L 993 144 L 995 140 L 995 136 L 996 135 L 996 130 L 998 126 L 998 122 Z
M 1844 120 L 1842 124 L 1842 127 L 1841 128 L 1841 131 L 1840 132 L 1840 136 L 1839 137 L 1839 140 L 1838 141 L 1838 144 L 1837 145 L 1837 149 L 1835 153 L 1835 157 L 1834 158 L 1834 161 L 1832 165 L 1832 168 L 1831 169 L 1831 173 L 1830 174 L 1830 177 L 1828 181 L 1828 184 L 1827 185 L 1827 188 L 1826 189 L 1826 193 L 1824 197 L 1824 200 L 1823 201 L 1823 204 L 1822 205 L 1822 209 L 1821 210 L 1821 213 L 1820 214 L 1820 216 L 1819 217 L 1819 220 L 1818 221 L 1818 224 L 1817 225 L 1817 230 L 1815 234 L 1815 237 L 1813 241 L 1813 245 L 1812 246 L 1812 249 L 1811 250 L 1811 253 L 1810 254 L 1810 259 L 1809 260 L 1809 275 L 1810 276 L 1810 280 L 1811 281 L 1811 284 L 1812 285 L 1812 287 L 1813 288 L 1814 293 L 1817 297 L 1818 300 L 1821 303 L 1821 304 L 1831 314 L 1834 315 L 1839 319 L 1841 319 L 1849 323 L 1852 323 L 1853 324 L 1858 324 L 1859 325 L 1890 325 L 1891 324 L 1891 321 L 1892 320 L 1892 317 L 1893 316 L 1893 313 L 1894 312 L 1894 309 L 1895 308 L 1896 299 L 1865 299 L 1864 298 L 1861 298 L 1854 294 L 1852 294 L 1848 290 L 1847 290 L 1846 288 L 1842 284 L 1841 281 L 1839 279 L 1837 275 L 1837 270 L 1836 269 L 1836 258 L 1837 257 L 1837 250 L 1838 249 L 1838 246 L 1840 242 L 1840 239 L 1841 238 L 1841 235 L 1842 234 L 1842 230 L 1844 226 L 1844 223 L 1845 222 L 1845 219 L 1846 218 L 1846 214 L 1847 213 L 1847 210 L 1848 209 L 1848 207 L 1849 206 L 1849 203 L 1850 202 L 1850 199 L 1851 198 L 1851 193 L 1853 189 L 1924 189 L 1925 188 L 1925 185 L 1926 184 L 1926 180 L 1927 179 L 1927 176 L 1928 175 L 1928 172 L 1929 171 L 1930 164 L 1929 163 L 1860 163 L 1859 162 L 1860 161 L 1861 154 L 1862 153 L 1862 151 L 1863 150 L 1863 147 L 1864 146 L 1864 141 L 1865 140 L 1865 138 L 1866 137 L 1866 134 L 1868 130 L 1868 126 L 1869 125 L 1869 120 Z
M 675 120 L 575 120 L 574 121 L 567 121 L 566 122 L 563 122 L 562 123 L 559 123 L 558 124 L 556 124 L 555 125 L 550 126 L 538 132 L 536 134 L 532 136 L 528 140 L 527 140 L 526 142 L 522 145 L 522 146 L 518 150 L 516 154 L 513 157 L 513 159 L 508 168 L 508 173 L 507 174 L 507 177 L 506 178 L 506 194 L 507 195 L 508 202 L 510 205 L 510 207 L 512 209 L 514 214 L 517 217 L 517 218 L 520 221 L 521 221 L 522 223 L 523 223 L 529 228 L 533 230 L 535 230 L 538 232 L 543 233 L 544 234 L 551 234 L 552 235 L 615 235 L 616 234 L 618 234 L 619 235 L 624 235 L 625 236 L 627 236 L 635 240 L 641 247 L 643 251 L 643 253 L 644 254 L 644 267 L 643 268 L 643 271 L 642 272 L 642 274 L 641 276 L 639 278 L 637 282 L 630 289 L 629 289 L 627 291 L 626 291 L 622 294 L 620 294 L 616 296 L 613 296 L 612 297 L 487 297 L 485 299 L 485 302 L 483 306 L 483 310 L 482 311 L 482 314 L 481 315 L 481 319 L 480 320 L 480 325 L 607 325 L 608 324 L 614 324 L 615 323 L 619 323 L 627 319 L 630 319 L 634 317 L 636 315 L 638 315 L 640 313 L 641 313 L 649 306 L 650 306 L 653 303 L 654 301 L 655 301 L 655 300 L 662 292 L 662 290 L 664 288 L 667 282 L 667 280 L 668 279 L 668 277 L 670 273 L 670 270 L 671 269 L 671 248 L 670 247 L 670 244 L 669 243 L 668 238 L 665 232 L 662 229 L 661 226 L 655 220 L 654 220 L 648 215 L 640 211 L 638 211 L 637 210 L 633 210 L 632 209 L 627 209 L 626 208 L 553 208 L 552 207 L 550 207 L 544 204 L 537 197 L 535 193 L 534 188 L 533 187 L 533 180 L 534 179 L 534 176 L 537 170 L 537 168 L 539 166 L 539 165 L 549 155 L 554 153 L 558 150 L 561 150 L 562 149 L 565 149 L 566 148 L 570 148 L 571 147 L 670 147 L 671 146 L 671 141 L 672 140 L 672 137 L 674 133 L 674 129 L 675 128 L 675 124 L 676 123 L 676 121 Z
M 333 132 L 331 134 L 328 135 L 326 137 L 321 139 L 311 148 L 310 148 L 296 163 L 296 164 L 290 172 L 288 177 L 286 179 L 286 181 L 282 188 L 281 193 L 279 196 L 279 198 L 277 202 L 277 206 L 276 207 L 276 212 L 275 213 L 275 220 L 274 221 L 274 237 L 275 238 L 275 244 L 276 245 L 277 254 L 278 255 L 279 260 L 281 263 L 282 268 L 286 276 L 288 278 L 289 281 L 294 287 L 294 288 L 305 300 L 306 300 L 311 305 L 315 307 L 318 310 L 320 310 L 323 313 L 327 315 L 329 315 L 336 319 L 339 319 L 340 320 L 342 320 L 343 321 L 345 321 L 349 323 L 353 323 L 354 324 L 363 324 L 364 325 L 434 325 L 435 324 L 435 319 L 436 318 L 436 309 L 437 308 L 437 301 L 438 300 L 438 298 L 437 297 L 364 297 L 363 296 L 354 295 L 348 292 L 346 292 L 340 289 L 338 287 L 335 286 L 332 283 L 331 283 L 322 275 L 322 274 L 315 266 L 312 260 L 310 258 L 310 256 L 306 249 L 306 245 L 305 244 L 305 241 L 304 240 L 304 237 L 303 236 L 303 216 L 304 215 L 304 211 L 305 210 L 306 203 L 315 185 L 317 183 L 319 179 L 324 174 L 324 173 L 326 172 L 329 168 L 330 168 L 334 164 L 337 163 L 340 160 L 345 158 L 347 156 L 351 154 L 356 153 L 359 151 L 361 151 L 362 150 L 367 150 L 368 149 L 373 149 L 374 148 L 445 148 L 447 144 L 447 136 L 448 135 L 448 124 L 449 122 L 447 120 L 378 120 L 377 121 L 367 121 L 366 122 L 362 122 L 361 123 L 358 123 L 357 124 L 350 125 L 342 129 L 340 129 L 337 131 L 335 131 Z
M 181 132 L 179 134 L 174 136 L 172 138 L 168 140 L 165 143 L 164 143 L 159 148 L 158 148 L 156 150 L 156 151 L 154 152 L 152 154 L 152 155 L 147 160 L 147 161 L 143 165 L 143 166 L 139 171 L 138 174 L 136 176 L 130 188 L 130 190 L 129 191 L 129 193 L 128 194 L 128 196 L 126 200 L 126 203 L 125 204 L 125 208 L 124 209 L 124 213 L 123 214 L 123 222 L 122 223 L 122 232 L 123 233 L 123 241 L 124 242 L 124 246 L 125 247 L 125 252 L 126 253 L 126 256 L 129 262 L 130 267 L 135 277 L 137 279 L 138 282 L 144 289 L 144 290 L 156 302 L 157 302 L 160 305 L 164 307 L 167 310 L 167 311 L 169 310 L 174 314 L 176 315 L 178 315 L 185 319 L 188 319 L 189 320 L 191 320 L 195 322 L 198 322 L 199 323 L 204 323 L 205 324 L 214 324 L 215 325 L 286 325 L 287 324 L 287 319 L 288 318 L 288 302 L 289 301 L 289 298 L 288 297 L 214 297 L 213 296 L 208 296 L 207 295 L 200 294 L 195 291 L 193 291 L 189 289 L 187 287 L 184 286 L 178 281 L 177 281 L 168 272 L 168 271 L 164 267 L 163 264 L 159 259 L 159 257 L 155 250 L 155 248 L 154 247 L 154 243 L 152 239 L 152 233 L 151 232 L 151 221 L 152 220 L 152 214 L 153 213 L 153 210 L 154 209 L 154 205 L 157 199 L 157 197 L 159 194 L 159 192 L 163 187 L 163 185 L 167 181 L 168 178 L 170 177 L 171 175 L 184 163 L 185 163 L 190 159 L 200 154 L 202 154 L 205 152 L 207 152 L 210 150 L 215 150 L 216 149 L 222 149 L 223 148 L 295 148 L 296 147 L 296 140 L 297 139 L 297 128 L 298 127 L 298 121 L 297 120 L 227 120 L 226 121 L 215 121 L 214 122 L 209 122 L 208 123 L 205 123 L 201 125 L 198 125 L 197 126 L 192 127 L 185 131 L 183 131 Z
M 1506 121 L 1499 127 L 1497 131 L 1497 138 L 1496 139 L 1496 143 L 1495 144 L 1495 147 L 1494 148 L 1494 151 L 1493 152 L 1493 155 L 1492 156 L 1491 163 L 1489 167 L 1489 170 L 1488 171 L 1488 175 L 1487 176 L 1487 179 L 1485 183 L 1485 186 L 1484 187 L 1484 190 L 1483 191 L 1483 195 L 1482 196 L 1482 199 L 1481 200 L 1481 202 L 1480 203 L 1480 206 L 1479 207 L 1479 212 L 1478 213 L 1478 216 L 1476 220 L 1476 223 L 1475 224 L 1475 227 L 1474 228 L 1474 232 L 1473 233 L 1472 240 L 1470 244 L 1470 249 L 1469 250 L 1468 257 L 1466 261 L 1466 265 L 1465 266 L 1465 270 L 1464 271 L 1464 274 L 1463 275 L 1463 277 L 1462 278 L 1462 281 L 1461 282 L 1461 287 L 1460 288 L 1460 290 L 1459 291 L 1459 294 L 1457 298 L 1456 307 L 1455 308 L 1455 311 L 1454 312 L 1454 314 L 1453 315 L 1453 318 L 1452 319 L 1452 325 L 1478 325 L 1479 324 L 1479 321 L 1481 317 L 1481 312 L 1482 311 L 1482 308 L 1483 307 L 1483 304 L 1484 303 L 1484 300 L 1485 299 L 1485 296 L 1486 295 L 1486 290 L 1488 286 L 1488 283 L 1489 282 L 1489 279 L 1490 278 L 1490 274 L 1491 273 L 1491 270 L 1492 269 L 1492 267 L 1493 266 L 1493 263 L 1494 262 L 1495 253 L 1496 252 L 1496 249 L 1497 248 L 1497 245 L 1498 244 L 1498 241 L 1499 240 L 1499 235 L 1500 234 L 1500 232 L 1502 228 L 1502 225 L 1503 224 L 1503 220 L 1504 219 L 1504 216 L 1506 212 L 1506 209 L 1507 208 L 1507 205 L 1508 204 L 1508 199 L 1509 198 L 1509 195 L 1511 191 L 1511 188 L 1512 187 L 1512 183 L 1513 182 L 1513 179 L 1515 175 L 1516 168 L 1517 167 L 1519 169 L 1519 171 L 1520 172 L 1521 170 L 1521 167 L 1519 165 L 1518 167 L 1517 166 L 1518 159 L 1520 156 L 1522 159 L 1522 162 L 1523 163 L 1524 170 L 1525 171 L 1525 173 L 1527 177 L 1527 180 L 1528 181 L 1528 183 L 1530 187 L 1530 190 L 1532 194 L 1532 197 L 1533 198 L 1533 200 L 1534 201 L 1534 203 L 1536 207 L 1536 211 L 1537 212 L 1537 215 L 1538 216 L 1538 218 L 1539 219 L 1539 221 L 1541 225 L 1541 229 L 1542 230 L 1542 232 L 1543 233 L 1543 235 L 1545 239 L 1546 246 L 1547 247 L 1547 249 L 1548 250 L 1548 252 L 1550 256 L 1550 261 L 1551 262 L 1551 264 L 1552 265 L 1552 267 L 1554 271 L 1555 278 L 1556 279 L 1556 281 L 1558 285 L 1558 288 L 1559 289 L 1560 296 L 1561 297 L 1561 299 L 1563 303 L 1563 307 L 1564 308 L 1564 310 L 1566 314 L 1568 316 L 1568 317 L 1570 319 L 1571 319 L 1573 321 L 1577 323 L 1579 323 L 1580 324 L 1595 324 L 1596 323 L 1598 323 L 1606 318 L 1610 310 L 1610 306 L 1612 302 L 1612 299 L 1613 298 L 1613 296 L 1614 295 L 1614 292 L 1615 291 L 1615 287 L 1616 286 L 1616 284 L 1617 283 L 1617 280 L 1619 276 L 1619 272 L 1620 271 L 1620 269 L 1621 268 L 1621 265 L 1623 261 L 1623 258 L 1624 257 L 1624 253 L 1625 252 L 1625 250 L 1627 246 L 1627 243 L 1628 242 L 1628 238 L 1629 237 L 1629 235 L 1631 231 L 1631 228 L 1632 227 L 1632 223 L 1633 222 L 1633 220 L 1634 219 L 1634 216 L 1635 215 L 1635 213 L 1637 209 L 1637 205 L 1638 204 L 1638 202 L 1639 201 L 1639 198 L 1641 194 L 1641 190 L 1642 189 L 1642 186 L 1643 185 L 1643 183 L 1645 179 L 1646 172 L 1647 171 L 1647 169 L 1648 168 L 1648 165 L 1650 161 L 1650 157 L 1651 156 L 1651 154 L 1652 153 L 1652 151 L 1654 147 L 1654 144 L 1655 143 L 1655 139 L 1656 138 L 1656 136 L 1657 135 L 1657 133 L 1659 129 L 1659 125 L 1661 122 L 1661 120 L 1660 119 L 1635 119 L 1632 123 L 1632 125 L 1631 126 L 1631 129 L 1630 130 L 1630 134 L 1629 135 L 1629 137 L 1627 141 L 1627 144 L 1626 145 L 1626 149 L 1625 150 L 1625 152 L 1624 153 L 1624 155 L 1622 159 L 1622 162 L 1621 163 L 1621 167 L 1620 168 L 1620 170 L 1618 174 L 1618 177 L 1617 178 L 1617 182 L 1616 183 L 1616 185 L 1614 189 L 1614 192 L 1612 196 L 1612 200 L 1611 201 L 1611 203 L 1610 204 L 1610 207 L 1608 211 L 1608 215 L 1606 219 L 1606 222 L 1604 226 L 1604 229 L 1603 230 L 1602 237 L 1600 241 L 1600 244 L 1599 245 L 1599 249 L 1598 250 L 1598 253 L 1597 254 L 1597 256 L 1595 260 L 1595 264 L 1594 265 L 1594 268 L 1592 272 L 1592 275 L 1590 278 L 1588 274 L 1587 274 L 1587 277 L 1590 281 L 1590 284 L 1588 288 L 1586 287 L 1586 285 L 1585 284 L 1585 281 L 1583 277 L 1583 273 L 1582 272 L 1582 270 L 1581 269 L 1581 267 L 1579 263 L 1579 260 L 1578 259 L 1578 256 L 1577 255 L 1577 253 L 1575 249 L 1575 246 L 1574 245 L 1573 238 L 1572 237 L 1572 235 L 1570 231 L 1569 224 L 1568 223 L 1568 221 L 1566 217 L 1565 210 L 1564 209 L 1564 207 L 1562 203 L 1562 200 L 1561 199 L 1560 192 L 1559 191 L 1559 189 L 1557 185 L 1557 182 L 1556 181 L 1556 179 L 1555 178 L 1555 176 L 1553 172 L 1552 165 L 1550 161 L 1550 158 L 1548 154 L 1548 151 L 1547 150 L 1547 147 L 1545 143 L 1545 140 L 1544 139 L 1543 134 L 1541 130 L 1534 123 L 1530 121 L 1528 121 L 1524 119 L 1513 119 L 1512 120 L 1509 120 L 1508 121 Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
</svg>
</a></h1>
      </div>
      <nav class="sidenav" aria-label="Sections">
        <a href="#overview" data-nav="overview" title="Overview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"></rect><rect x="14" y="3" width="7" height="5" rx="1.5"></rect><rect x="14" y="12" width="7" height="9" rx="1.5"></rect><rect x="3" y="16" width="7" height="5" rx="1.5"></rect></svg><span class="sr-only-collapse">Overview</span></a>
        <a href="#activity" data-nav="activity" title="Activity"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"></path></svg><span class="sr-only-collapse">Activity</span></a>
        <a href="#policy" data-nav="policy" title="Policy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6l-7-3Z"></path></svg><span class="sr-only-collapse">Policy</span></a>
        <a href="#rules" data-nav="rules" title="Rules"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"></path><path d="M15 3v4h4"></path><path d="M9 12h6M9 16h4"></path></svg><span class="sr-only-collapse">Rules</span></a>
        <a href="#integrations" data-nav="integrations" title="Integrations"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v5"></path></svg><span class="sr-only-collapse">Integrations</span></a>
        <a href="#settings" data-nav="settings" title="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"></path><circle cx="16" cy="8" r="2.2"></circle><circle cx="8" cy="16" r="2.2"></circle></svg><span class="sr-only-collapse">Settings</span></a>
      </nav>
      <div class="sidebar-foot">
        <div class="sidebar-links">
          <a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>
          <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>
        </div>
      </div>
    </aside>
    <div class="content">
      <header class="topbar" id="topbar">
        <div class="topbar-row">
          <h2 class="topbar-title" id="topbar-title">Overview</h2>
          <label class="view-search topbar-search" data-search-view="activity" hidden>
            <span class="sr-only">Filter activity</span>
            <input type="search" id="activity-search" autocomplete="off" placeholder="Filter by rule or command">
          </label>
          <label class="view-search topbar-search" data-search-view="policy" hidden>
            <span class="sr-only">Search all protections</span>
            <input type="search" id="policy-search" autocomplete="off" placeholder="Filter by name, category, or rule ID">
          </label>
          <div class="topbar-actions">
            <div class="app-status" id="app-status" role="status" aria-live="polite">Loading...</div>
            <button type="button" class="dirty-chip" id="dirty-chip" hidden>Unsaved policy changes · Review</button>
          </div>
        </div>
      </header>
      <main>
        <div class="protection-banner" id="protection-banner" role="alert" hidden></div>
        <div class="status" id="status" role="status" aria-live="polite"></div>

        <section class="view" data-view="overview">
          <div class="view-head">
            <p class="panel-sub muted">What CC Safety Net has been doing on this machine.</p>
          </div>
          <div class="status health-strip" id="health-strip" hidden></div>
          <p class="tiles-window" id="overview-window"></p>
          <div class="tiles" id="overview-tiles"></div>
          <div class="star-row" id="star-row" hidden>
            <p class="star-pitch"><span id="star-pitch-text"></span> <span class="star-mechanism" id="star-mechanism" hidden>One click via your GitHub CLI. No redirect.</span></p>
            <span id="star-slot"></span>
          </div>
          <section class="panel" id="protection-card" hidden></section>
          <div class="dual-panels">
            <section class="panel">
              <div class="panel-head">
                <div class="panel-title">
                  <h2>Top blocked commands</h2>
                </div>
              </div>
              <div id="top-commands"></div>
            </section>
            <section class="panel">
              <div class="panel-head">
                <div class="panel-title">
                  <h2>Top blocked rules</h2>
                </div>
              </div>
              <div id="top-rules"></div>
            </section>
          </div>
          <button type="button" class="guard-errors" id="guard-errors" hidden></button>
        </section>

        <section class="view" data-view="activity" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Audited commands from the local log, newest first. Commands are secret-redacted at write time.</p>
          </div>
          <section class="panel">
            <div class="activity-controls">
              <div class="activity-controls-row">
                <label class="activity-days"><span>Window</span>
                  <select id="activity-days"></select>
                </label>
                <button type="button" class="icon-button activity-refresh" id="activity-refresh" aria-label="Refresh activity" title="Refresh activity"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></button>
              </div>
              <div class="chip-row" id="activity-decision" role="group" aria-label="Filter by decision"></div>
              <div class="chip-row" id="activity-agents" role="group" aria-label="Filter by agent"></div>
              <div class="chip-row" id="activity-command-filter"></div>
            </div>
            <div id="activity-feed"></div>
            <p class="muted activity-count" id="activity-count"></p>
          </section>
        </section>

        <section class="view" data-view="policy" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Choose what CC Safety Net blocks. Changes apply after you save.</p>
          </div>
          <div class="policy-savebar" id="policy-savebar" hidden><span>Unsaved changes</span><div class="savebar-actions"><button type="button" id="discard-changes">Discard</button><button class="primary" id="save">Save</button></div></div>
          <div class="recovery" id="recovery" hidden>
            <div>
              <strong>Policy repair available</strong>
              <p class="muted">Repair writes canonical JSON by preserving valid settings. If the JSON cannot be parsed, defaults are restored.</p>
            </div>
            <button class="primary" id="repair" type="button">Repair</button>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2 id="tester-label">Test a command</h2>
                <p class="panel-sub muted">Paste a shell command to see whether it is blocked under your current unsaved edits. Custom rulebook rules are enforced here too.</p>
              </div>
            </div>
            <div class="tester-row">
              <input type="text" id="tester-input" autocomplete="off" spellcheck="false" placeholder="Paste a shell command and press Enter" aria-labelledby="tester-label">
              <button type="button" id="tester-run">Test</button>
            </div>
            <div id="tester-result" class="status" hidden></div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Safety preset</h2>
                <p class="panel-sub muted">Choose inherited protection defaults, then customize only what this workspace needs.</p>
              </div>
            </div>
            <div id="safety-preset-status" class="preset-status"></div>
            <div id="environment-overrides" class="status" hidden></div>
            <div class="grid" id="safety-level"></div>
            <div class="field field-toggle">
              <button class="panel-toggle" type="button" aria-expanded="false" aria-controls="safety-overrides-content"><span class="panel-chevron" aria-hidden="true"></span><span>Advanced overrides</span></button>
            </div>
            <div class="foldable-field-content" id="safety-overrides-content" hidden>
              <p class="muted">Inherit from the selected level unless a capability needs an explicit exception.</p>
              <div class="grid" id="safety-overrides"></div>
            </div>
            <div class="field">
              <span>Workflow</span>
              <small>Workflow exceptions are separate from safety level.</small>
            </div>
            <div class="grid" id="workflow"></div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Destructive Command Protection</h2>
                <p class="panel-sub muted" id="destructive-command-summary"></p>
              </div>
              <button type="button" id="reset-rule-customizations" class="panel-head-action">Restore defaults</button>
            </div>
            <div id="destructive-command"></div>
          </section>
          <section class="panel">
            <header class="panel-head">
              <div class="panel-title">
                <h2>Secret Protection</h2>
                <p class="panel-sub muted" id="secret-summary">Default sensitive paths and coding CLI credential locations can be disabled individually. Deny paths are blocked while Secret protection is on.</p>
              </div>
              <button type="button" id="reset-secret-customizations" class="panel-head-action">Restore defaults</button>
            </header>
            <div id="secret"></div>
          </section>
        </section>

        <section class="view" data-view="rules" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Custom rulebook rules enforced on this machine, and a prompt to hand rule authoring to your coding agent.</p>
          </div>
          <section class="panel" id="rules-composer-panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Create a rule</h2>
                <p class="panel-sub muted">CC Safety Net never writes rulebooks from here. Copy the prompt and paste it into your coding agent.</p>
              </div>
            </div>
            <div class="field">
              <span>Scope</span>
              <div class="chip-row" role="group" aria-label="Rule scope">
                <button type="button" class="chip" data-rules-scope="project" aria-pressed="true">Project</button>
                <button type="button" class="chip" data-rules-scope="user" aria-pressed="false">All projects</button>
              </div>
            </div>
            <div class="field" id="rules-project-path-field">
              <span id="rules-project-path-label">Project path</span>
              <div class="rules-path-row">
                <input type="text" id="rules-project-path" spellcheck="false" autocomplete="off" aria-labelledby="rules-project-path-label" aria-describedby="rules-project-path-hint">
                <button type="button" id="rules-choose-directory" hidden>Choose…</button>
              </div>
              <small id="rules-project-path-hint">Where the rulebook is written. Defaults to the directory this GUI was launched from.</small>
            </div>
            <div class="field">
              <span id="rules-composer-label">Request</span>
              <textarea id="rules-composer-input" spellcheck="false" placeholder="Describe the custom rules you want..." aria-labelledby="rules-composer-label" aria-describedby="rules-composer-hint"></textarea>
              <small id="rules-composer-hint">Rules match a command, an optional subcommand, and exact arguments - not file paths or patterns.</small>
            </div>
            <div class="field">
              <span>Examples</span>
              <div class="chip-row">
                <button type="button" class="chip" data-rules-example="read my package.json and suggest blocking rules">Suggest rules</button>
                <button type="button" class="chip" data-rules-example="set up rules to block all terraform destroy commands">Block a command</button>
                <button type="button" class="chip" data-rules-example="verify my rules and fix any errors">Verify rules</button>
              </div>
            </div>
            <div class="rules-composer-actions">
              <button type="button" class="primary" id="rules-copy-prompt">Copy prompt</button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Rulebooks</h2>
                <p class="panel-sub muted">Read-only. Rules are shown as enforced, after overrides.</p>
              </div>
              <button type="button" class="icon-button rules-refresh" id="rules-refresh" aria-label="Refresh rules" title="Refresh rules"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></button>
            </div>
            <div id="rules-list"><p class="empty">Loading rules…</p></div>
          </section>
          <section class="panel" id="rules-diagnostics-panel" hidden>
            <div class="panel-head">
              <div class="panel-title">
                <h2>Diagnostics</h2>
                <p class="panel-sub muted">Errors mean a rulebook was dropped and its rules are not enforced.</p>
              </div>
            </div>
            <div id="rules-diagnostics"></div>
          </section>
        </section>

        <section class="view" data-view="settings" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Appearance, file locations, and maintenance.</p>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Appearance</h2>
                <p class="panel-sub muted">Theme preference is stored in this browser.</p>
              </div>
              <button type="button" id="theme-toggle"></button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Files</h2>
                <p class="panel-sub muted">Where CC Safety Net reads and writes on this machine.</p>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><span>Policy file</span><code id="policy-path"></code></div>
              <div class="info-row"><span>Audit logs</span><code id="logs-path"></code></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Audit log retention</h2>
                <p class="panel-sub muted">How long decisions are kept before the sweep deletes them. Every analyzed command is recorded, so a long window grows the log.</p>
              </div>
            </div>
            <label class="retention-row">
              <span>Keep for</span>
              <input type="number" id="retention-days" min="1" max="365" step="1" inputmode="numeric" aria-describedby="retention-note">
              <span id="retention-unit">days</span>
            </label>
            <p class="muted retention-note" id="retention-note"></p>
          </section>
          <section class="panel">
            <div class="panel-head raw-json-head">
              <div class="panel-title">
                <h2>Policy JSON</h2>
                <p class="panel-sub muted" id="raw-source">Read-only mirror of the policy controls.</p>
              </div>
              <button class="icon-button" id="raw-copy" type="button" aria-label="Copy raw JSON to clipboard"></button>
            </div>
            <textarea id="raw" aria-label="Raw policy JSON" aria-describedby="raw-source" readonly></textarea>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Version</h2>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><code id="app-version"></code></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Danger zone</h2>
                <p class="panel-sub muted">Actions that discard saved configuration.</p>
              </div>
            </div>
            <div class="danger-row">
              <div>
                <strong>Reset policy</strong>
                <p class="muted">Restore the default policy JSON at the configured path.</p>
              </div>
              <button class="danger" id="reset">Reset</button>
            </div>
          </section>
        </section>

        <section class="view" data-view="integrations" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Install or remove the cc-safety-net hook for each coding agent on this machine.</p>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Agents</h2>
                <p class="panel-sub muted">Detected CLIs and hook status.</p>
              </div>
              <button type="button" class="icon-button integrations-refresh" id="integrations-refresh" aria-label="Refresh integrations" title="Refresh integrations"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></button>
            </div>
            <div id="integrations-list"><p class="empty">Checking integrations…</p></div>
          </section>
          <section class="panel" id="integrations-system" hidden>
            <div class="panel-head">
              <div class="panel-title">
                <h2>System</h2>
                <p class="panel-sub muted">Runtime detected on this machine.</p>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><span>cc-safety-net</span><code id="integrations-pkg-version"></code></div>
              <div class="info-row"><span>Node.js</span><code id="integrations-node-version"></code></div>
              <div class="info-row"><span>Platform</span><code id="integrations-platform"></code></div>
            </div>
          </section>
        </section>
      </main>
      <footer class="app-foot">
        <a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>
        <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>
      </footer>
    </div>
  </div>
  <div class="rule-example-popover" id="rule-example-popover" popover="auto" role="dialog" aria-labelledby="rule-example-title" aria-describedby="rule-example-command">
    <span class="rule-example-label" id="rule-example-label">Blocked command example</span>
    <strong id="rule-example-title"></strong>
    <code id="rule-example-command"></code>
  </div>
  <dialog class="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-body confirm-dialog-detail">
    <form method="dialog">
      <h2 id="confirm-dialog-title"></h2>
      <p class="muted" id="confirm-dialog-body"></p>
      <p class="dialog-detail"><code id="confirm-dialog-detail"></code></p>
      <div class="dialog-actions">
        <button type="submit" id="confirm-dialog-cancel" value="cancel">Cancel</button>
        <button type="submit" class="danger" id="confirm-dialog-confirm" value="confirm"></button>
      </div>
    </form>
  </dialog>
  <dialog class="confirm-dialog report-dialog" id="report-dialog" aria-labelledby="report-dialog-title" aria-describedby="report-dialog-body">
    <form method="dialog">
      <h2 id="report-dialog-title">Report false positive</h2>
      <p class="muted" id="report-dialog-body">This opens a prefilled GitHub issue form — it is public, and nothing is submitted until you submit it there. Paths were replaced with <code>&lt;project&gt;</code> and <code>~</code>; edit anything else you would rather not publish.</p>
      <label class="report-field"><span>Blocked command</span><textarea id="report-command" spellcheck="false"></textarea></label>
      <label class="report-field"><span>Audit log entry</span><textarea id="report-entry" spellcheck="false"></textarea></label>
      <div class="dialog-actions">
        <button type="submit" id="report-dialog-cancel" value="cancel">Cancel</button>
        <button type="submit" class="primary" id="report-dialog-open" value="report">Open GitHub form</button>
      </div>
    </form>
  </dialog>
  <script id="ccsn-data" type="application/json"></script>
  <script>
// src/engine/audit-display.ts
var formatRelativeTime = (value) => {
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff))
    return "";
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0)
    return \`\${days}d ago\`;
  if (hours > 0)
    return \`\${hours}h ago\`;
  if (minutes > 0)
    return \`\${minutes}m ago\`;
  return "just now";
};
var commandSignature = (source) => {
  const tokens = (source ?? "").trim().split(/\\s+/).filter((token) => token && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
  const binary = tokens[0]?.split("/").pop();
  if (!binary)
    return null;
  const next = tokens[1];
  return next && /^[a-z][a-z0-9-]*$/.test(next) ? \`\${binary} \${next}\` : binary;
};
// src/integrations/catalog.ts
var catalog = [
  {
    id: "antigravity-cli",
    displayName: "Antigravity CLI",
    doctorOrder: 3,
    runtime: {
      order: 1,
      flags: ["-ac", "--agy-cli"],
      description: "Run as Antigravity CLI PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 2,
      flag: "--agy-cli",
      artifactKind: "hook config",
      probeCommand: ["agy", "--version"]
    }
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    doctorOrder: 1,
    runtime: {
      order: 2,
      displayName: "Coding CLI",
      flags: ["-cc", "--coding-cli"],
      legacyFlags: ["--claude-code"],
      description: "Run as Coding CLI PreToolUse hook",
      legacyTopLevelFlags: ["-cc", "--claude-code"]
    },
    install: {
      order: 3,
      flag: "--claude-code",
      artifactKind: "plugin",
      probeCommand: ["claude", "--version"]
    }
  },
  {
    id: "codex",
    displayName: "Codex",
    doctorOrder: 4,
    install: {
      order: 4,
      flag: "--codex",
      artifactKind: "plugin",
      probeCommand: ["codex", "--version"]
    }
  },
  {
    id: "copilot-cli",
    displayName: "GitHub Copilot CLI",
    doctorOrder: 7,
    runtime: {
      order: 5,
      flags: ["-cp", "--copilot-cli"],
      description: "Run as GitHub Copilot CLI PreToolUse hook",
      legacyTopLevelFlags: ["-cp", "--copilot-cli"]
    },
    install: {
      order: 7,
      flag: "--copilot-cli",
      artifactKind: "plugin",
      probeCommand: ["copilot", "--binary-version"]
    }
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    doctorOrder: 6,
    runtime: {
      order: 4,
      flags: ["-gc", "--gemini-cli"],
      description: "Run as Gemini CLI BeforeTool hook",
      legacyTopLevelFlags: ["-gc", "--gemini-cli"]
    },
    install: {
      order: 6,
      flag: "--gemini-cli",
      artifactKind: "extension",
      probeCommand: ["gemini", "--version"]
    }
  },
  {
    id: "hermes-agent",
    displayName: "Hermes Agent",
    doctorOrder: 8,
    runtime: {
      order: 6,
      flags: ["-ha", "--hermes-agent"],
      description: "Run as Hermes Agent pre_tool_call hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 8,
      flag: "--hermes-agent",
      artifactKind: "plugin",
      probeCommand: ["hermes", "--version"]
    }
  },
  {
    id: "kimi-code",
    displayName: "Kimi Code",
    doctorOrder: 9,
    runtime: {
      order: 7,
      flags: ["-kc", "--kimi-code"],
      description: "Run as Kimi Code PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 9,
      flag: "--kimi-code",
      artifactKind: "hook config",
      probeCommand: ["kimi", "--version"]
    }
  },
  {
    id: "openclaw",
    displayName: "OpenClaw",
    doctorOrder: 10,
    install: {
      order: 10,
      flag: "--openclaw",
      artifactKind: "plugin",
      probeCommand: ["openclaw", "--version"]
    }
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    doctorOrder: 11,
    install: {
      order: 11,
      flag: "--opencode",
      artifactKind: "plugin",
      probeCommand: ["opencode", "--version"]
    }
  },
  {
    id: "pi",
    displayName: "Pi",
    doctorOrder: 12,
    install: {
      order: 12,
      flag: "--pi",
      artifactKind: "package",
      probeCommand: ["pi", "--version"]
    }
  },
  {
    id: "cursor",
    displayName: "Cursor",
    doctorOrder: 5,
    runtime: {
      order: 3,
      flags: ["-cu", "--cursor"],
      description: "Run as Cursor preToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 5,
      flag: "--cursor",
      artifactKind: "hook config",
      probeCommand: ["cursor", "--version"]
    }
  },
  {
    id: "amp",
    displayName: "Amp Code",
    doctorOrder: 2,
    install: {
      order: 1,
      flag: "--amp",
      artifactKind: "plugin",
      probeCommand: ["amp", "--version"]
    }
  }
];
var doctorIntegrationOrder = catalog.slice().sort((a, b) => a.doctorOrder - b.doctorOrder).map((integration) => integration.id);
var runtimeHookIntegrationMetadata = catalog.filter((integration) => ("runtime" in integration)).slice().sort((a, b) => a.runtime.order - b.runtime.order).map((integration) => ({
  id: integration.id,
  displayName: "displayName" in integration.runtime ? integration.runtime.displayName : integration.displayName,
  flags: integration.runtime.flags,
  legacyFlags: "legacyFlags" in integration.runtime ? integration.runtime.legacyFlags : [],
  description: integration.runtime.description,
  legacyTopLevelFlags: integration.runtime.legacyTopLevelFlags
}));
var installIntegrationMetadata = catalog.slice().sort((a, b) => a.install.order - b.install.order).map((integration) => ({ id: integration.id, ...integration.install })).map(({ order: _, ...integration }) => integration);
var integrationDisplayNames = Object.fromEntries(catalog.map((integration) => [integration.id, integration.displayName]));

// src/gui/frontend/main.ts
var token = JSON.parse(document.getElementById("ccsn-data").textContent).token;
var fallbackRepoUrl = "https://github.com/kenryu42/cc-safety-net";
var safetyLevels = {
  standard: [
    "Standard",
    "Blocks recognizable destructive commands and sensitive content access while allowing metadata-only sensitive-path checks. Recommended for normal coding."
  ],
  strict: [
    "Strict",
    "Standard, plus blocks dynamic or unparseable commands and metadata-only sensitive-path discovery. Occasional false positives on advanced shell."
  ],
  paranoid: [
    "Paranoid",
    "Strict, plus blocks rm -rf inside your project and interpreter one-liners. Expect friction; for untrusted agents or high-stakes repos."
  ]
};
var safetyOverrides = {
  fail_closed: ["Fail closed", "Block commands the parser cannot fully understand."],
  paranoid_rm: ["Paranoid rm -rf checks", "Block non-temp rm -rf inside the project."],
  paranoid_interpreters: ["Paranoid interpreters", "Block interpreter one-liners."]
};
var rawCopyIcons = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"></path></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>'
};
var starIcons = {
  outline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
  filled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>'
};
var reportIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><path d="M4 22v-7"></path></svg>';
var pathListIcons = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6M14 11v6"></path></svg>'
};
var state;
var draftPolicy;
var preview;
var previewRequestId = 0;
var dirty = false;
var searchActive = false;
var OVERVIEW_DAYS = 7;
var DEFAULT_RETENTION_DAYS = 30;
var MAX_RETENTION_DAYS = 365;
var overview = null;
var activity = null;
var knownRuleIds = new Set;
var activityFilters = { days: 7, decision: "all", agent: "all", query: "", command: "" };
var tierExpanded = new Map([
  ["enforced", false],
  ["normal", false],
  ["strict", false],
  ["paranoid", false]
]);
var searchCollapsedTiers = new Set;
var secretGroupExpanded = new Map;
var searchCollapsedSecretGroups = new Set;
var rawCopyResetTimer = null;
var feedCopyResetTimer = null;
var activityQueryTimer;
var renderedFeedEntries = [];
var suspects = new Set;
var activeStarContext = { starred: null, starCount: null, blockedTotal: 0 };
var integrations = null;
var integrationsRequested = false;
var integrationBusy = new Set;
var rulesData = null;
var rulesRequested = false;
var rulesScope = "project";
var pendingRuleFocus = null;
var directoryPickerFailed = false;
var api = (path, init = {}) => fetch(\`\${path}\${path.includes("?") ? "&" : "?"}token=\${encodeURIComponent(token)}\`, {
  ...init,
  headers: {
    "content-type": "application/json",
    "x-cc-safety-net-token": token,
    ...init.headers || {}
  }
});
var requestJson = async (path, init) => {
  try {
    const response = await api(path, init);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      data: text ? JSON.parse(text) : {},
      error: undefined
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
var errorText = (result) => result.error ?? (Array.isArray(result.data?.errors) && result.data.errors.length ? result.data.errors.join(\`
\`) : null) ?? result.data?.error ?? \`Request failed (status \${result.status}).\`;
var isWriteSuccess = (result) => result.ok && !(Array.isArray(result.data?.errors) && result.data.errors.length > 0);
var isPolicyState = (value) => !!value && typeof value === "object" && !!value.policy && typeof value.policy === "object" && !!value.policy.safety && !!value.policy.workflow && !!value.policy.secret_protection && Array.isArray(value.destructiveCommandRules) && Array.isArray(value.secretPatterns) && (value.preview === null || value.preview && typeof value.preview === "object") && Array.isArray(value.errors);
var qs = (id) => document.getElementById(id);
var setDetailStatus = (text, kind = "") => {
  qs("status").textContent = text;
  qs("status").className = \`status \${kind}\`;
};
var appStatusTimer;
var setAppStatus = (text, kind = "") => {
  qs("app-status").textContent = text;
  qs("app-status").className = \`app-status \${kind}\`;
  clearTimeout(appStatusTimer);
  if (kind === "ok")
    appStatusTimer = setTimeout(() => setAppStatus(""), 4000);
};
var busy = false;
var updateActions = () => {
  const hasErrors = (state?.errors.length ?? 0) > 0;
  qs("save").disabled = busy || !state || hasErrors;
  qs("reset").disabled = busy || !state;
  qs("repair").disabled = busy || !hasErrors;
};
var runExclusive = async (pendingText, fn) => {
  if (busy)
    return;
  busy = true;
  updateActions();
  setAppStatus(pendingText);
  setDetailStatus("");
  try {
    await fn();
  } finally {
    busy = false;
    updateActions();
  }
};
var checkbox = (checked) => checked ? "checked" : "";
var dayCount = (days) => \`\${days} day\${days === 1 ? "" : "s"}\`;
var syncMasterBadges = () => {
  document.querySelectorAll("label.row.master input").forEach((input) => {
    const badge = input.closest("label")?.querySelector(".master-badge");
    if (badge)
      badge.textContent = input.checked ? "On" : "Off";
  });
};
var escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[char] ?? char);
var clonePolicy = (policy) => JSON.parse(JSON.stringify(policy));
var pathLines = (value) => value.split(\`
\`).map((line) => line.trim()).filter(Boolean);
var formatPolicy = (policy) => \`\${JSON.stringify(policy, null, 2)}
\`;
var collectFormPolicy = () => ({
  version: 1,
  safety: {
    level: draftPolicy.safety.level,
    overrides: Object.fromEntries(Object.entries(draftPolicy.safety.overrides).filter(([, value]) => typeof value === "boolean"))
  },
  workflow: draftPolicy.workflow,
  destructive_command_protection: draftPolicy.destructive_command_protection,
  secret_protection: {
    enabled: draftPolicy.secret_protection.enabled,
    overrides: draftPolicy.secret_protection.overrides,
    deny_paths: draftPolicy.secret_protection.deny_paths,
    allow_paths: draftPolicy.secret_protection.allow_paths
  },
  audit: draftPolicy.audit
});
var requestPolicyPreview = (policy = collectFormPolicy()) => requestJson("/api/policy/preview", {
  method: "POST",
  body: JSON.stringify(policy)
});
var viewNames = ["overview", "activity", "policy", "rules", "integrations", "settings"];
var viewTitles = {
  overview: "Overview",
  activity: "Activity",
  policy: "Policy",
  rules: "Rules",
  integrations: "Integrations",
  settings: "Settings"
};
var currentView = () => {
  const hash = location.hash.replace("#", "");
  return viewNames.includes(hash) ? hash : "overview";
};
var applyView = () => {
  const view = currentView();
  document.body.dataset.view = view;
  const hasSearch = view === "activity" || view === "policy";
  qs("topbar-title").textContent = viewTitles[view];
  qs("topbar-title").classList.toggle("sr-only", hasSearch);
  document.querySelectorAll(".topbar-search").forEach((el) => {
    el.hidden = el.dataset.searchView !== view;
  });
  qs("topbar").classList.toggle("has-search", hasSearch);
  document.title = \`\${viewTitles[view]} · CC Safety Net\`;
  document.querySelectorAll("[data-view]").forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === view)
      link.setAttribute("aria-current", "page");
    else
      link.removeAttribute("aria-current");
  });
  qs("dirty-chip").hidden = !dirty || view === "policy";
  if (view === "activity")
    applyFeedClamps(qs("activity-feed"));
  if (view === "integrations" && !integrationsRequested) {
    integrationsRequested = true;
    loadIntegrations();
  }
  if (view === "rules" && !rulesRequested) {
    rulesRequested = true;
    loadRules();
  }
  if (view === "rules" && rulesData && pendingRuleFocus)
    renderRules();
};
var isActivityFeed = (value) => !!value && typeof value === "object" && Array.isArray(value.entries) && !!value.counts && typeof value.counts === "object";
var agentLabels = integrationDisplayNames;
var tierCountHtml = (segments) => {
  const parts = segments.filter(([count]) => count > 0).map(([count, label, tone]) => tone ? \`<span class="count-\${tone}">\${count} \${label}</span>\` : \`\${count} \${label}\`);
  return parts.length > 0 ? parts.join(" · ") : "0 on";
};
var feedItemHtml = (entry, index) => {
  const deny = entry.decision !== "allow";
  const badgeClass = entry.failureStage ? "error" : deny ? "deny" : "allow";
  const badgeLabel = entry.failureStage ? "Error" : deny ? "Blocked" : "Allowed";
  return \`<article class="feed-item">
    <div class="feed-meta">
      <span class="decision-badge \${badgeClass}">\${badgeLabel}</span>
      \${entry.agent && entry.agent !== "unknown" ? \`<span class="agent-badge">\${escapeHtml(agentLabels[entry.agent] ?? entry.agent)}</span>\` : ""}
      \${entry.ruleId ? knownRuleIds.has(entry.ruleId) ? \`<button type="button" class="rule-id" data-jump-rule="\${escapeHtml(entry.ruleId)}" title="Show this rule in Policy">\${escapeHtml(entry.ruleId)}</button>\` : \`<code class="rule-id">\${escapeHtml(entry.ruleId)}</code>\` : ""}
      <time datetime="\${escapeHtml(entry.ts)}" title="\${escapeHtml(entry.ts)}">\${formatRelativeTime(entry.ts)}</time>
      <button type="button" class="icon-button feed-copy" data-log-copy="\${index}" aria-label="Copy log entry as JSON">\${rawCopyIcons.copy}</button>
      \${deny ? \`<button type="button" class="icon-button feed-report" data-report-fp="\${index}" aria-label="Report false positive" title="Report false positive">\${reportIcon}</button>\` : \`<button type="button" class="feed-toggle feed-block" data-block-future="\${index}">Block this in future</button>\`}
    </div>
    <code class="feed-command">\${escapeHtml(entry.segment || entry.command || "(no command recorded)")}</code>
    \${entry.reason && entry.reason !== "allowed" ? \`<p class="feed-reason muted">\${escapeHtml(entry.reason)}</p>\` : ""}
  </article>\`;
};
var applyFeedClamps = (root) => {
  const overflowing = [...root.querySelectorAll(".feed-command")].filter((command) => !command.classList.contains("clamped") && command.scrollHeight > command.clientHeight + 1);
  overflowing.forEach((command) => {
    command.classList.add("clamped");
    command.insertAdjacentHTML("afterend", '<button type="button" class="feed-toggle" data-feed-toggle aria-expanded="false">Show more</button>');
  });
};
var dayLabel = (ts) => {
  const date = new Date(ts);
  if (date.toDateString() === new Date().toDateString())
    return "Today";
  if (date.toDateString() === new Date(Date.now() - 86400000).toDateString())
    return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
var renderOverviewActivity = () => {
  if (!overview)
    return;
  const tile = (value, label, extra) => \`<div class="tile"><strong>\${escapeHtml(value.toLocaleString("en-US"))}</strong><span>\${escapeHtml(label)}</span>\${extra}</div>\`;
  const dayAgoLabel = (daysAgo) => daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : \`\${daysAgo} days ago\`;
  const sparkline = (byDay, noun) => {
    const max = Math.max(...byDay, 1);
    return \`<div class="tile-spark" role="group" aria-label="Commands \${noun} per day, most recent \${dayCount(byDay.length)}">\${byDay.map((count, index) => {
      const label = \`\${dayAgoLabel(byDay.length - 1 - index)}: \${count.toLocaleString("en-US")} \${noun}\`;
      return \`<div class="spark-col" role="img" tabindex="0" data-count="\${count.toLocaleString("en-US")}" aria-label="\${escapeHtml(label)}"><div class="spark-bar\${count === 0 ? " spark-zero" : ""}" aria-hidden="true" style="height:\${count === 0 ? 2 : Math.max(2, Math.round(count / max * 40))}px"></div></div>\`;
    }).join("")}</div>\`;
  };
  qs("overview-window").textContent = \`Last \${dayCount(overview.days)}\`;
  qs("overview-tiles").innerHTML = [
    tile(overview.counts.blocked, "Blocked", sparkline(overview.counts.blockedByDay, "blocked")),
    tile(overview.totalInWindow, "Analyzed", sparkline(overview.counts.analyzedByDay, "analyzed"))
  ].join("");
};
var retentionDays = () => state?.policy?.audit?.retention_days ?? DEFAULT_RETENTION_DAYS;
var overviewDays = () => Math.min(OVERVIEW_DAYS, retentionDays());
var renderRetention = (loaded) => {
  qs("retention-days").value = String(loaded.policy.audit.retention_days);
  qs("retention-unit").textContent = loaded.policy.audit.retention_days === 1 ? "day" : "days";
  qs("retention-note").textContent = "Saved on change. Lowering this deletes anything already older than the new window; the Activity tab can only look back as far as it.";
};
var activityWindowOptions = () => {
  const retained = retentionDays();
  const windows = [7, 30, 90, 180, 365].filter((days) => days < retained);
  return [...windows, retained];
};
var configStateNotice = () => {
  const configState = state?.configState;
  if (!configState || configState.state === "ready")
    return null;
  return \`A fallback configuration is being enforced: \${configState.reason}\`;
};
var setProtectionBanner = (notices) => {
  const text = notices.filter(Boolean).join(" ");
  qs("protection-banner").textContent = text;
  qs("protection-banner").hidden = text === "";
};
var renderProtectionCard = () => {
  const configNotice = configStateNotice();
  if (!state?.preview) {
    qs("protection-card").hidden = true;
    setProtectionBanner([configNotice]);
    return;
  }
  const policy = state.policy;
  const customized = state.preview.counts.effectiveCustomizations > 0 || Object.entries(policy.safety.overrides).some(([key, value]) => value !== levelCapabilities(policy.safety.level)[key]);
  const commandsOn = policy.destructive_command_protection.enabled;
  const secretsOn = policy.secret_protection.enabled;
  const off = [
    commandsOn ? null : "Destructive command protection is off — configurable destructive command rules are not being enforced (catastrophic and custom rules remain active)",
    secretsOn ? null : "Secret protection is off — sensitive paths and deny paths are not being blocked"
  ].filter(Boolean);
  setProtectionBanner([
    off.length > 0 ? \`\${off.join(". ")}. Re-enable \${off.length > 1 ? "them" : "it"} in Policy.\` : null,
    configNotice
  ]);
  qs("protection-card").hidden = false;
  qs("protection-card").classList.toggle("protection-warning", !commandsOn || !secretsOn);
  qs("protection-card").innerHTML = \`<div class="panel-head"><div class="panel-title"><h2>Protection status</h2></div><a class="panel-head-action view-all-link" href="#policy">Configure</a></div>\` + \`<p>\${escapeHtml(safetyLevels[policy.safety.level][0])}\${customized ? " · Customized" : ""}</p>\` + \`<p\${commandsOn ? "" : ' class="state-disabled"'}>\${commandsOn ? \`\${state.preview.counts.enabled} rules active\` : "Destructive command protection is OFF"}</p>\` + \`<p\${secretsOn ? "" : ' class="state-disabled"'}>\${secretsOn ? "Secret protection on" : "Secret protection is OFF"}</p>\`;
};
var renderTopList = (containerId, counts, className, dataAttr) => {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  qs(containerId).innerHTML = top.length === 0 ? '<p class="empty">No blocked commands in this window.</p>' : top.map(([key, count]) => \`<button type="button" class="\${className}" \${dataAttr}="\${escapeHtml(key)}"><code class="rule-id">\${escapeHtml(key)}</code><span class="chip-count">\${count.toLocaleString("en-US")}</span></button>\`).join("");
};
var renderTopRules = () => {
  if (!overview)
    return;
  renderTopList("top-rules", overview.counts.rules, "top-rule", "data-rule-id");
};
var findSuspects = (entries) => {
  const signatureKey = (entry) => \`\${entry.sessionId}
\${commandSignature(entry.segment || entry.command)}\`;
  const repeats = entries.filter((entry) => entry.decision !== "allow" && entry.sessionId).reduce((counts, entry) => {
    const key = signatureKey(entry);
    return counts.set(key, (counts.get(key) ?? 0) + 1);
  }, new Map);
  return new Set(entries.filter((entry) => entry.decision !== "allow" && (entry.failureStage || (repeats.get(signatureKey(entry)) ?? 0) >= 2)));
};
var clearCommandFilter = () => {
  if (!activityFilters.command)
    return false;
  activityFilters.command = "";
  return true;
};
var jumpToActivityRule = (ruleId) => {
  activityFilters.command = "";
  activityFilters.query = ruleId.toLowerCase();
  qs("activity-search").value = ruleId;
  if (activity) {
    renderActivityControls();
    renderActivityFeed();
  }
  location.hash = "activity";
};
var renderTopCommands = () => {
  if (!overview)
    return;
  renderTopList("top-commands", overview.counts.commands, "top-command", "data-command");
};
var renderTopLists = () => {
  renderTopCommands();
  renderTopRules();
};
var renderGuardErrors = () => {
  if (!overview)
    return;
  qs("guard-errors").hidden = overview.counts.errors === 0;
  if (overview.counts.errors === 0)
    return;
  qs("guard-errors").textContent = \`\${overview.counts.errors.toLocaleString("en-US")} guard error\${overview.counts.errors === 1 ? "" : "s"} in the last \${dayCount(overview.days)} — commands blocked because evaluation failed, not by policy. Click to view.\`;
};
var renderActivityControls = () => {
  if (!activity)
    return;
  const agentCounts = activity.counts.agents;
  const chipHtml = (kind, value, label, count) => \`<button type="button" class="chip" data-activity-chip="\${kind}" data-chip-value="\${escapeHtml(value)}" aria-pressed="\${activityFilters[kind] === value}">\${escapeHtml(label)}\${count === undefined ? "" : \` <span class="chip-count">\${count.toLocaleString("en-US")}</span>\`}</button>\`;
  qs("activity-decision").innerHTML = [
    chipHtml("decision", "all", "All", activity.totalInWindow),
    chipHtml("decision", "deny", "Blocked", activity.counts.blocked),
    chipHtml("decision", "allow", "Allowed", activity.counts.allowed),
    ...activity.counts.errors > 0 ? [chipHtml("decision", "error", "Errors", activity.counts.errors)] : [],
    ...suspects.size > 0 ? [chipHtml("decision", "suspect", "Likely false positive", suspects.size)] : []
  ].join("");
  const agentNames = Object.keys(agentCounts).filter((name) => name !== "unknown").sort();
  qs("activity-agents").innerHTML = agentNames.length < 2 ? "" : [
    chipHtml("agent", "all", "All agents"),
    ...agentNames.map((name) => chipHtml("agent", name, agentLabels[name] ?? name, agentCounts[name]))
  ].join("");
  qs("activity-command-filter").innerHTML = activityFilters.command ? \`<button type="button" class="filter-pill" data-clear-command aria-label="Clear command filter">Command: <code>\${escapeHtml(activityFilters.command)}</code><span class="filter-pill-x" aria-hidden="true">✕</span></button>\` : "";
  qs("activity-days").innerHTML = activityWindowOptions().map((days) => \`<option value="\${days}">Last \${dayCount(days)}</option>\`).join("");
  qs("activity-days").value = String(activity.days);
};
var renderActivityFeed = () => {
  if (!activity)
    return;
  const matchesFilters = (entry) => {
    if (activityFilters.decision === "deny" && entry.decision === "allow")
      return false;
    if (activityFilters.decision === "allow" && entry.decision !== "allow")
      return false;
    if (activityFilters.decision === "error" && !entry.failureStage)
      return false;
    if (activityFilters.decision === "suspect" && !suspects.has(entry))
      return false;
    if (activityFilters.agent !== "all" && (entry.agent || "unknown") !== activityFilters.agent)
      return false;
    if (activityFilters.command) {
      if (entry.decision === "allow")
        return false;
      return commandSignature(entry.segment || entry.command) === activityFilters.command;
    }
    if (!activityFilters.query)
      return true;
    return [entry.ruleId, entry.segment || entry.command].filter(Boolean).join(" ").toLowerCase().includes(activityFilters.query);
  };
  const entries = activity.entries.filter(matchesFilters);
  renderedFeedEntries = entries;
  qs("activity-feed").innerHTML = entries.length === 0 ? '<p class="empty">No audit log entries match.</p>' : \`<div class="feed-list">\${entries.map((entry, index) => {
    const label = dayLabel(entry.ts);
    const previous = entries[index - 1];
    const separator = previous && label === dayLabel(previous.ts) ? "" : \`<div class="feed-day-sep">\${escapeHtml(label)}</div>\`;
    return separator + feedItemHtml(entry, index);
  }).join("")}</div>\`;
  applyFeedClamps(qs("activity-feed"));
  qs("activity-count").textContent = \`Showing \${entries.length.toLocaleString("en-US")} of \${activity.totalInWindow.toLocaleString("en-US")} entries from the last \${dayCount(activity.days)}\${activity.truncated ? " (capped at 500, newest of each decision)" : ""}.\${activity.unreadable > 0 ? \` \${activity.unreadable.toLocaleString("en-US")} audit log source\${activity.unreadable === 1 ? "" : "s"} could not be read, so this list is incomplete.\` : ""}\`;
};
var loadOverview = async () => {
  const result = await requestJson(\`/api/activity?days=\${overviewDays()}\`);
  if (!result.ok || !isActivityFeed(result.data)) {
    const message = \`<p class="empty">Could not load activity: \${escapeHtml(errorText(result))}</p>\`;
    qs("overview-window").textContent = "";
    qs("overview-tiles").innerHTML = "";
    qs("top-rules").innerHTML = message;
    qs("guard-errors").hidden = true;
    return;
  }
  overview = result.data;
  qs("logs-path").textContent = overview.logsDir ?? "Not available";
  renderOverviewActivity();
  renderTopLists();
  renderGuardErrors();
};
var loadActivity = async () => {
  const result = await requestJson(\`/api/activity?days=\${activityFilters.days}\`);
  if (!result.ok || !isActivityFeed(result.data)) {
    const message = \`<p class="empty">Could not load activity: \${escapeHtml(errorText(result))}</p>\`;
    qs("activity-feed").innerHTML = message;
    qs("activity-count").textContent = "";
    return;
  }
  activity = result.data;
  suspects = findSuspects(activity.entries);
  if (activityFilters.agent !== "all" && !(activityFilters.agent in activity.counts.agents)) {
    activityFilters.agent = "all";
  }
  if (activityFilters.decision === "error" && activity.counts.errors === 0) {
    activityFilters.decision = "all";
  }
  if (activityFilters.decision === "suspect" && suspects.size === 0) {
    activityFilters.decision = "all";
  }
  renderActivityControls();
  renderActivityFeed();
};
var refreshActivity = async () => {
  const button = qs("activity-refresh");
  if (button.disabled)
    return;
  button.disabled = true;
  button.classList.add("spinning");
  await Promise.all([
    loadOverview(),
    loadActivity(),
    new Promise((resolve) => setTimeout(resolve, 600))
  ]);
  button.classList.remove("spinning");
  button.disabled = false;
};
var renderIntegrations = () => {
  const loaded = integrations;
  if (!loaded)
    return;
  qs("integrations-list").innerHTML = loaded.targets.map((row) => {
    const busy2 = integrationBusy.has(row.target);
    const version = row.version === null ? '<span class="muted">not detected</span>' : \`<span class="agent-badge">v\${escapeHtml(row.version)}</span>\`;
    const status = row.status === "active" ? '<span class="state-active">Installed</span>' : row.status === "disabled" ? '<span class="state-disabled">Disabled</span>' : row.status === "not-inspected" ? \`<span class="muted" title="This runtime's state file could not be read, so its status is unknown.">Not inspected</span>\` : '<span class="muted">Not installed</span>';
    const uninstall = row.status === "active";
    const busyLabel = uninstall ? "Uninstalling…" : "Installing…";
    const action = row.version === null ? "" : \`<button type="button" class="\${uninstall ? "danger" : "primary"}" data-integration-action="\${uninstall ? "uninstall" : "install"}" data-integration-target="\${escapeHtml(row.target)}"\${busy2 ? " disabled" : ""}>\${busy2 ? busyLabel : uninstall ? "Uninstall" : row.status === "disabled" ? "Enable" : "Install"}</button>\`;
    const note = row.note ? \`<div class="status \${row.note.kind}">\${escapeHtml(row.note.text)}</div>\` : "";
    return \`<div class="integration-row">
        <span class="integration-info"><strong>\${escapeHtml(row.label)}</strong> \${version} \${status}</span>
        \${action}
        \${note}
      </div>\`;
  }).join("");
};
var loadHealth = async () => {
  const result = await requestJson("/api/health");
  if (!result.ok || !Array.isArray(result.data?.hooks))
    return;
  const active = result.data.hooks.filter((hook) => hook.configured);
  const inactive = result.data.hooks.filter((hook) => !hook.configured);
  const attention = inactive.length > 0 || active.length === 0;
  const parts = [];
  const labelHtml = (hook) => \`<strong>\${escapeHtml(hook.label)}</strong>\`;
  if (active.length)
    parts.push(\`Hook active in \${active.map(labelHtml).join(", ")}\`);
  if (inactive.length)
    parts.push(\`\${inactive.map(labelHtml).join(", ")} detected without an active hook\`);
  if (!parts.length)
    parts.push("No agent hooks detected");
  if (result.data.update?.updateAvailable)
    parts.push(\`v\${escapeHtml(result.data.update.latestVersion)} available\`);
  const link = attention ? ' <a class="view-all-link" href="#integrations">Fix in Integrations</a>' : "";
  const el = qs("health-strip");
  el.className = attention ? "status health-strip error" : "status health-strip ok";
  el.innerHTML = parts.join(" · ") + link;
  el.hidden = false;
};
var loadIntegrations = async () => {
  const result = await requestJson("/api/integrations");
  if (!result.ok || !Array.isArray(result.data?.targets)) {
    qs("integrations-list").innerHTML = \`<p class="empty">Could not load integrations: \${escapeHtml(errorText(result))}</p>\`;
    integrationsRequested = false;
    return;
  }
  integrations = result.data;
  renderIntegrations();
  qs("integrations-pkg-version").textContent = result.data.system.version;
  qs("integrations-node-version").textContent = result.data.system.nodeVersion ?? "unknown";
  qs("integrations-platform").textContent = result.data.system.platform;
  qs("integrations-system").hidden = false;
};
var refreshIntegrations = async () => {
  const button = qs("integrations-refresh");
  if (button.disabled)
    return;
  button.disabled = true;
  button.classList.add("spinning");
  integrationsRequested = true;
  await Promise.all([loadIntegrations(), new Promise((resolve) => setTimeout(resolve, 600))]);
  button.classList.remove("spinning");
  button.disabled = false;
};
var renderRules = () => {
  const loaded = rulesData;
  if (!loaded)
    return;
  if (!qs("rules-project-path").value)
    qs("rules-project-path").value = loaded.projectPath;
  const canPick = loaded.canPickDirectory && !directoryPickerFailed;
  qs("rules-project-path").readOnly = canPick;
  qs("rules-choose-directory").hidden = !canPick;
  qs("rules-list").innerHTML = loaded.rulebooks.length === 0 ? loaded.errors.length > 0 ? '<p class="empty">Every configured rulebook was dropped, so no custom rule is enforced. See Diagnostics below.</p>' : '<p class="empty">No custom rulebooks. Run <code>npx -y cc-safety-net rule init</code> to create one, or see the <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">documentation</a>.</p>' : loaded.rulebooks.map((rulebook) => \`<div class="rulebook-card">
    <div class="rulebook-head">
      <strong>\${escapeHtml(rulebook.name)}</strong>
      <span class="agent-badge">v\${escapeHtml(rulebook.version)}</span>
      \${rulebook.spec === rulebook.name ? "" : \`<code>\${escapeHtml(rulebook.spec)}</code>\`}
      <span>\${rulebook.source === "user" ? "All projects" : "This project"}</span>
      <span>\${rulebook.rules.length} rule\${rulebook.rules.length === 1 ? "" : "s"}</span>
    </div>
    \${rulebook.rules.map((rule) => \`<div class="rulebook-rule\${pendingRuleFocus === rule.name ? " rules-focus" : ""}">
      <code class="rule-id">custom.\${escapeHtml(rule.name)}</code>
      <code>\${escapeHtml([rule.command, rule.subcommand].filter(Boolean).join(" "))}</code>
      <p>Blocked arguments (any one matches): \${rule.block_args.map((arg) => \`<code>\${escapeHtml(arg)}</code>\`).join(" ")}</p>
      <p>\${escapeHtml(rule.reason)}</p>
    </div>\`).join("")}
  </div>\`).join("");
  const diagnostics = [
    ...loaded.errors.map((text) => \`<div class="status error">\${escapeHtml(text)}</div>\`),
    ...loaded.warnings.map((text) => \`<div class="status">\${escapeHtml(text)}</div>\`)
  ];
  qs("rules-diagnostics").innerHTML = diagnostics.join("");
  qs("rules-diagnostics-panel").hidden = diagnostics.length === 0;
  if (!pendingRuleFocus)
    return;
  const focused = qs("rules-list").querySelector(".rules-focus");
  if (focused)
    focused.scrollIntoView({ block: "center" });
  if (!focused)
    setAppStatus(\`custom.\${pendingRuleFocus} is not in any rulebook\`, "error");
  pendingRuleFocus = null;
};
var loadRules = async () => {
  const result = await requestJson("/api/rules");
  if (!result.ok || !Array.isArray(result.data?.rulebooks)) {
    qs("rules-list").innerHTML = \`<p class="empty">Could not load rules: \${escapeHtml(errorText(result))}</p>\`;
    rulesData = null;
    qs("rules-diagnostics-panel").hidden = true;
    rulesRequested = false;
    return;
  }
  rulesData = result.data;
  renderRules();
};
var refreshRules = async () => {
  const button = qs("rules-refresh");
  if (button.disabled)
    return;
  button.disabled = true;
  button.classList.add("spinning");
  rulesRequested = true;
  await Promise.all([loadRules(), new Promise((resolve) => setTimeout(resolve, 600))]);
  button.classList.remove("spinning");
  button.disabled = false;
};
var jumpToRulesRule = (ruleId) => {
  pendingRuleFocus = ruleId.replace(/^custom\\./, "");
  location.hash = "rules";
};
var openRuleComposer = (command) => {
  qs("rules-composer-input").value = command;
  location.hash = "rules";
};
var setRulesScope = (scope) => {
  rulesScope = scope;
  document.querySelectorAll("[data-rules-scope]").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.rulesScope === scope));
  });
  qs("rules-project-path-field").hidden = scope !== "project";
};
var rulePromptText = () => {
  const names = rulesData?.rulebooks.map((rulebook) => rulebook.name) ?? [];
  return [
    "Use the cc-safety-net skill for this request.",
    "If that skill is not available, run \`npx -y cc-safety-net rule doc\` first and treat its output as the source of truth for schema, paths, and validation.",
    "",
    rulesScope === "project" ? \`Scope: this project - \${qs("rules-project-path").value.trim()}\` : "Scope: all projects (user scope)",
    \`Existing rulebooks (names must stay unique across both scopes): \${names.length > 0 ? names.join(", ") : "none"}\`,
    "",
    qs("rules-composer-input").value.trim()
  ].join(\`
\`);
};
var chooseProjectDirectory = async () => {
  const button = qs("rules-choose-directory");
  if (button.disabled)
    return;
  button.disabled = true;
  const result = await requestJson("/api/rules/choose-directory", { method: "POST" });
  button.disabled = false;
  if (result.ok && result.data.path) {
    qs("rules-project-path").value = result.data.path;
    return;
  }
  if (result.ok && result.data.cancelled)
    return;
  directoryPickerFailed = true;
  qs("rules-project-path").readOnly = false;
  button.hidden = true;
  setAppStatus(\`\${result.ok ? result.data.error : errorText(result)} - type the project path instead\`, "error");
};
var copyRulePrompt = async () => {
  if (!rulesData) {
    setAppStatus("Rules have not loaded yet - refresh the Rulebooks panel", "error");
    return;
  }
  if (!qs("rules-composer-input").value.trim()) {
    setAppStatus("Describe what you want first", "error");
    return;
  }
  if (rulesScope === "project" && !qs("rules-project-path").value.trim()) {
    setAppStatus("Enter the project path the rule belongs to", "error");
    return;
  }
  qs("rules-copy-prompt").disabled = true;
  try {
    await navigator.clipboard.writeText(rulePromptText());
    qs("rules-composer-input").value = "";
    setAppStatus("Prompt copied - paste it into your coding CLI", "ok");
  } catch {
    setAppStatus("Copy failed", "error");
  } finally {
    qs("rules-copy-prompt").disabled = false;
  }
};
var runIntegrationAction = async (button) => {
  const target = button.dataset.integrationTarget;
  if (!target || integrationBusy.has(target))
    return;
  integrationBusy.add(target);
  const action = button.dataset.integrationAction;
  renderIntegrations();
  const result = await requestJson(\`/api/\${action}\`, {
    method: "POST",
    body: JSON.stringify({ target })
  });
  integrationBusy.delete(target);
  const row = integrations?.targets.find((entry) => entry.target === target);
  if (!row)
    return;
  const ok = result.ok && result.data.ok === true;
  if (ok)
    row.status = action === "install" ? "active" : "not-installed";
  row.note = {
    kind: ok ? "ok" : "error",
    text: ok ? result.data.output : result.data?.output || errorText(result)
  };
  if (!ok)
    setAppStatus(action === "install" ? "Install failed" : "Uninstall failed", "error");
  renderIntegrations();
};
var confirmDialog = (() => {
  const dialog = qs("confirm-dialog");
  const confirm = qs("confirm-dialog-confirm");
  const cancel = qs("confirm-dialog-cancel");
  let resolvePending = null;
  dialog.addEventListener("close", () => {
    if (!resolvePending)
      return;
    resolvePending(dialog.returnValue === "confirm");
    resolvePending = null;
  });
  dialog.addEventListener("cancel", () => {
    dialog.returnValue = "cancel";
  });
  return (options) => new Promise((resolve) => {
    if (resolvePending) {
      resolve(false);
      return;
    }
    qs("confirm-dialog-title").textContent = options.title;
    qs("confirm-dialog-body").textContent = options.body;
    qs("confirm-dialog-detail").textContent = options.detail ?? "";
    const detailRow = qs("confirm-dialog-detail").parentElement;
    if (detailRow)
      detailRow.hidden = !options.detail;
    confirm.textContent = options.confirmLabel;
    confirm.className = options.confirmClass ?? "danger";
    dialog.returnValue = "cancel";
    resolvePending = resolve;
    dialog.showModal();
    cancel.focus();
  });
})();
var confirmProtectionDisable = (options) => confirmDialog({
  title: options.title,
  body: options.body,
  detail: options.detail,
  confirmLabel: "Disable protection"
});
var togglePanel = (button) => {
  const controls = button.getAttribute("aria-controls");
  if (!controls)
    return;
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded));
  qs(controls).hidden = !expanded;
};
var syncSearchState = () => {
  const active = qs("policy-search").value.trim().length > 0;
  if (active === searchActive)
    return;
  searchActive = active;
  if (active)
    return;
  searchCollapsedTiers.clear();
  searchCollapsedSecretGroups.clear();
};
var updateRawSource = () => {
  qs("raw-source").textContent = state?.errors.length ? "Read-only original policy JSON. Repair preserves valid settings and writes canonical JSON." : "Read-only mirror of the controls.";
};
var setRawCopyCopied = (copied) => {
  qs("raw-copy").innerHTML = copied ? rawCopyIcons.check : rawCopyIcons.copy;
  qs("raw-copy").classList.toggle("copied", copied);
  qs("raw-copy").setAttribute("aria-label", copied ? "Copied raw JSON" : "Copy raw JSON to clipboard");
};
var resetFeedCopy = () => {
  document.querySelectorAll(".feed-copy.copied").forEach((button) => {
    button.classList.remove("copied");
    button.innerHTML = rawCopyIcons.copy;
    button.setAttribute("aria-label", "Copy log entry as JSON");
  });
};
var reportIssueUrl = "https://github.com/kenryu42/cc-safety-net/issues/new?template=false_positive.yml";
var reportUrlLimit = 8000;
var endsAtPathBoundary = (following) => following === "" || /^[/\\\\\\s'"]/.test(following);
var scrubReportPaths = (text, cwd, home) => [
  [cwd, "<project>"],
  [home, "~"]
].reduce((scrubbed, [from, to]) => from ? scrubbed.split(from).reduce((joined, part) => joined + (endsAtPathBoundary(part) ? to : from) + part) : scrubbed, text);
var buildReportUrl = (fields) => {
  const url = new URL(reportIssueUrl);
  Object.entries(fields).filter(([, value]) => value).forEach(([field, value]) => {
    url.searchParams.set(field, value);
  });
  return url.toString();
};
var buildReportRequest = (fields, dropped = []) => {
  const url = buildReportUrl(fields);
  if (url.length <= reportUrlLimit)
    return { url, dropped };
  const largest = Object.entries(fields).filter(([, value]) => value).sort((left, right) => right[1].length - left[1].length)[0];
  if (!largest)
    return { url, dropped };
  return buildReportRequest({ ...fields, [largest[0]]: "" }, [...dropped, largest[0]]);
};
var openReportDialog = (button) => {
  const entry = renderedFeedEntries[Number(button.dataset.reportFp)];
  if (!entry)
    return;
  const scrub = (text) => scrubReportPaths(text, entry.cwd, activity?.homeDir);
  qs("report-command").value = scrub(entry.command || entry.segment || "");
  qs("report-entry").value = JSON.stringify(entry, (_key, value) => typeof value === "string" ? scrub(value) : value, 2);
  qs("report-dialog").returnValue = "cancel";
  qs("report-dialog").showModal();
};
var openFalsePositiveForm = async () => {
  const fields = {
    command: qs("report-command").value,
    entry: qs("report-entry").value
  };
  const request = buildReportRequest(fields);
  const copying = request.dropped.length ? navigator.clipboard.writeText(request.dropped.map((field) => \`### \${field}
\${fields[field]}\`).join(\`

\`)) : null;
  window.open(request.url, "_blank", "noopener");
  if (!copying)
    return;
  const names = request.dropped.join(" and ");
  setAppStatus(await copying.then(() => true).catch(() => false) ? \`Report too long to prefill — \${names} copied to your clipboard. Paste into the form on GitHub.\` : \`Report too long to prefill — \${names} left out. Copy the entry from the feed and paste it into the form on GitHub.\`, "error");
};
qs("report-dialog").addEventListener("close", () => {
  if (qs("report-dialog").returnValue === "report")
    openFalsePositiveForm();
});
var copyFeedEntry = async (button) => {
  const entry = renderedFeedEntries[Number(button.dataset.logCopy)];
  if (!entry)
    return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    if (feedCopyResetTimer)
      clearTimeout(feedCopyResetTimer);
    resetFeedCopy();
    button.classList.add("copied");
    button.innerHTML = rawCopyIcons.check;
    button.setAttribute("aria-label", "Copied log entry");
    feedCopyResetTimer = setTimeout(resetFeedCopy, 2000);
  } catch {
    setAppStatus("Copy failed", "error");
  }
};
var copyRawToClipboard = async () => {
  qs("raw-copy").disabled = true;
  try {
    await navigator.clipboard.writeText(qs("raw").value);
    setRawCopyCopied(true);
    if (rawCopyResetTimer)
      clearTimeout(rawCopyResetTimer);
    rawCopyResetTimer = setTimeout(() => setRawCopyCopied(false), 2000);
  } catch (error) {
    setAppStatus("Copy failed", "error");
    setDetailStatus(\`Error: Could not copy Raw JSON: \${error instanceof Error ? error.message : String(error)}\`, "error");
  } finally {
    qs("raw-copy").disabled = false;
  }
};
var formatStarCount = (count) => {
  if (typeof count !== "number")
    return "";
  if (count >= 1000)
    return \`\${(count / 1000).toFixed(1).replace(/\\.0$/, "")}k\`;
  return String(count);
};
var starCountHtml = (count) => {
  const formatted = formatStarCount(count);
  return formatted ? \`<span class="star-count">\${escapeHtml(formatted)}</span>\` : "";
};
var hideStarCta = () => {
  qs("star-row").hidden = true;
  qs("star-slot").innerHTML = "";
};
var renderStarPitch = (context, starred = false) => {
  const evidence = context.blockedTotal > 0 ? \`CC Safety Net has blocked <strong>\${escapeHtml(context.blockedTotal.toLocaleString("en-US"))}</strong> risky command\${context.blockedTotal === 1 ? "" : "s"} on this machine in its retained \${escapeHtml(dayCount(retentionDays()))} history.\` : "";
  if (starred) {
    qs("star-pitch-text").innerHTML = evidence;
    return;
  }
  qs("star-pitch-text").innerHTML = evidence ? \`\${evidence} If it saved your work, star it on GitHub.\` : "If CC Safety Net is useful to you, star it on GitHub.";
};
var renderStarLink = (context, href = fallbackRepoUrl) => {
  qs("star-slot").innerHTML = \`<a class="star-cta" href="\${escapeHtml(href)}" target="_blank" rel="noopener" aria-label="Star CC Safety Net on GitHub (opens github.com)">
      <span class="star-icon" aria-hidden="true">\${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      \${starCountHtml(context.starCount)}
    </a>\`;
  qs("star-row").hidden = false;
};
var renderStarCta = (context) => {
  activeStarContext = context;
  if (context.starred === true) {
    hideStarCta();
    return;
  }
  renderStarPitch(context);
  qs("star-mechanism").hidden = context.starred !== false;
  if (context.starred === null) {
    renderStarLink(context);
    return;
  }
  qs("star-slot").innerHTML = \`<button type="button" class="star-cta" aria-label="Star CC Safety Net on GitHub. One click via your GitHub CLI.">
      <span class="star-icon" aria-hidden="true">\${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      \${starCountHtml(context.starCount)}
    </button>\`;
  qs("star-row").hidden = false;
};
var starRepo = async (button) => {
  button.disabled = true;
  const result = await requestJson("/api/star", { method: "POST" });
  if (result.ok && result.data?.ok === true) {
    const icon = button.querySelector(".star-icon");
    const label = button.querySelector(".star-label");
    if (icon)
      icon.innerHTML = starIcons.filled;
    if (label)
      label.textContent = "Starred. Thank you.";
    button.setAttribute("aria-label", "CC Safety Net starred on GitHub");
    button.classList.add("starred");
    qs("star-mechanism").hidden = true;
    renderStarPitch(activeStarContext, true);
    setAppStatus("Starred on GitHub", "ok");
    setDetailStatus("");
    return;
  }
  qs("star-mechanism").hidden = true;
  renderStarLink(activeStarContext, result.data?.fallbackUrl ?? fallbackRepoUrl);
};
var loadStarContext = async () => {
  const result = await requestJson("/api/star/context");
  renderStarCta(result.ok && result.data ? result.data : { starred: null, starCount: null, blockedTotal: 0 });
};
var syncRawFromForm = () => {
  if (state?.errors.length)
    return;
  qs("raw").value = formatPolicy(collectFormPolicy());
  updateRawSource();
};
var updateDirtyStatus = () => {
  if (!state || state.errors.length)
    return;
  const draftJson = JSON.stringify(collectFormPolicy());
  dirty = draftJson !== JSON.stringify(state.policy);
  qs("policy-savebar").hidden = !dirty;
  qs("dirty-chip").hidden = !dirty || currentView() === "policy";
  if (dirty)
    sessionStorage.setItem("cc-safety-net-draft", draftJson);
  if (!dirty)
    sessionStorage.removeItem("cc-safety-net-draft");
  setDetailStatus("");
  updateActions();
};
var createPathList = (prefix, config) => {
  const setHint = (text) => {
    qs(\`\${prefix}-hint\`).textContent = text;
    qs(\`\${prefix}-hint\`).hidden = !text;
  };
  const render = () => {
    const paths = config.getPaths();
    const disabled = config.isDisabled();
    qs(\`\${prefix}-count\`).textContent = \`\${paths.length} path\${paths.length === 1 ? "" : "s"}\`;
    qs(\`\${prefix}-input\`).disabled = disabled;
    qs(\`\${prefix}-add-button\`).disabled = disabled;
    qs(\`\${prefix}-list\`).innerHTML = paths.length === 0 ? \`<li class="empty">No \${config.itemLabel}s configured.</li>\` : paths.map((path, index) => \`<li class="path-item \${disabled ? "row-disabled" : ""}">
          <code>\${escapeHtml(path)}</code>
          <button type="button" class="icon-button" data-path-list="\${prefix}" data-path-remove="\${index}" \${disabled ? "disabled" : ""} aria-label="Remove \${config.itemLabel} \${escapeHtml(path)}">\${pathListIcons.remove}</button>
        </li>\`).join("");
  };
  let adding = false;
  const add = async (value) => {
    if (adding)
      return;
    const entries = [...new Set(pathLines(value))];
    if (entries.length === 0)
      return;
    const submitted = qs(\`\${prefix}-input\`).value;
    const additions = entries.filter((entry) => !config.getPaths().includes(entry));
    if (config.validateAdditions && additions.length) {
      adding = true;
      try {
        const error = await config.validateAdditions([...config.getPaths(), ...additions]);
        if (error) {
          setHint(\`Not added: \${additions.join(", ")} — \${error}\`);
          return;
        }
      } finally {
        adding = false;
      }
    }
    const current = config.getPaths();
    const duplicates = entries.filter((entry) => current.includes(entry));
    config.setPaths([...current, ...additions.filter((entry) => !current.includes(entry))]);
    if (qs(\`\${prefix}-input\`).value === submitted)
      qs(\`\${prefix}-input\`).value = "";
    setHint(duplicates.length ? \`Already listed: \${duplicates.join(", ")}\` : "");
    render();
    syncRawFromForm();
    updateDirtyStatus();
    qs(\`\${prefix}-input\`).focus();
  };
  const remove = (index) => {
    config.setPaths(config.getPaths().filter((_, position) => position !== index));
    setHint("");
    render();
    syncRawFromForm();
    updateDirtyStatus();
  };
  return { render, add, remove };
};
var pathLists = {
  "deny-paths": createPathList("deny-paths", {
    getPaths: () => draftPolicy.secret_protection.deny_paths,
    setPaths: (paths) => {
      draftPolicy.secret_protection.deny_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: "deny path",
    validateAdditions: async (paths) => {
      const candidate = collectFormPolicy();
      candidate.secret_protection = {
        ...candidate.secret_protection,
        deny_paths: paths
      };
      const result = await requestPolicyPreview(candidate);
      if (result.ok && result.data?.preview)
        return null;
      return errorText(result);
    }
  }),
  "secret-allow-paths": createPathList("secret-allow-paths", {
    getPaths: () => draftPolicy.secret_protection.allow_paths,
    setPaths: (paths) => {
      draftPolicy.secret_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: "allow path",
    validateAdditions: async (paths) => {
      const candidate = collectFormPolicy();
      candidate.secret_protection = {
        ...candidate.secret_protection,
        allow_paths: paths
      };
      const result = await requestPolicyPreview(candidate);
      if (result.ok && result.data?.preview)
        return null;
      return errorText(result);
    }
  }),
  "allow-paths": createPathList("allow-paths", {
    getPaths: () => draftPolicy.destructive_command_protection.allow_paths,
    setPaths: (paths) => {
      draftPolicy.destructive_command_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.destructive_command_protection.enabled,
    itemLabel: "allow path",
    validateAdditions: async (paths) => {
      const candidate = collectFormPolicy();
      candidate.destructive_command_protection = {
        ...candidate.destructive_command_protection,
        allow_paths: paths
      };
      const result = await requestPolicyPreview(candidate);
      if (result.ok && result.data?.preview)
        return null;
      return errorText(result);
    }
  })
};
var pathListFor = (name) => name === "deny-paths" || name === "allow-paths" || name === "secret-allow-paths" ? pathLists[name] : null;
var secretRuleIsActive = (rule, overrides) => overrides[rule.id] ? overrides[rule.id] === "on" : !rule.defaultOff;
var setSecretOverride = (rule, active) => {
  if (active === !rule.defaultOff) {
    delete draftPolicy.secret_protection.overrides[rule.id];
    return;
  }
  draftPolicy.secret_protection.overrides[rule.id] = active ? "on" : "off";
};
var groupRules = (rules) => rules.reduce((groups, rule) => {
  const group = groups.find((item) => item.category === rule.category);
  if (group) {
    group.rules.push(rule);
    return groups;
  }
  groups.push({ category: rule.category, rules: [rule] });
  return groups;
}, []);
var renderSecretPatterns = () => {
  if (!state)
    return;
  const loaded = state;
  const query = qs("policy-search").value.trim().toLowerCase();
  const rules = state.secretPatterns.filter((rule) => [rule.category, rule.label, rule.id, rule.description, ...rule.paths ?? []].join(" ").toLowerCase().includes(query));
  const overrides = draftPolicy.secret_protection.overrides;
  const disabled = !draftPolicy.secret_protection.enabled;
  const disabledCount = state.secretPatterns.filter((rule) => !secretRuleIsActive(rule, overrides)).length;
  qs("secret-summary").textContent = disabled ? "Protection disabled. Saved rule settings and deny paths are preserved." : \`\${state.secretPatterns.length - disabledCount} active, \${disabledCount} disabled\`;
  qs("secret-patterns").innerHTML = rules.length === 0 ? '<p class="empty">No secret protections match the search.</p>' : groupRules(rules).map((group) => {
    const expanded = secretGroupExpanded.get(group.category) || searchActive && !searchCollapsedSecretGroups.has(group.category);
    const contentId = \`secret-group-\${group.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\`;
    const allGroupRules = loaded.secretPatterns.filter((rule) => rule.category === group.category);
    const onCount = disabled ? 0 : allGroupRules.filter((rule) => secretRuleIsActive(rule, overrides)).length;
    return \`
      <section class="rule-tier">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-secret-group-toggle="\${escapeHtml(group.category)}" aria-expanded="\${expanded}" aria-controls="\${contentId}">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>\${escapeHtml(group.category)}</strong></span>
            <span class="tier-counts">\${tierCountHtml([
      [onCount, "on"],
      [allGroupRules.length - onCount, "off", "off"]
    ])}</span>
          </button>
          <input type="checkbox" class="tier-switch" data-secret-group-active="\${escapeHtml(group.category)}" \${checkbox(allGroupRules.some((rule) => secretRuleIsActive(rule, overrides)))} \${disabled ? "disabled" : ""} aria-label="\${escapeHtml(\`All \${group.category} protections\`)}">
        </div>
        <div id="\${contentId}" class="tier-content" \${expanded ? "" : "hidden"}>
        <div class="grid">\${group.rules.map((rule) => {
      const active = secretRuleIsActive(rule, overrides);
      const ruleState = active && !disabled ? { label: "Active", className: "state-active" } : { label: "Disabled", className: "state-disabled" };
      const control = \`<input type="checkbox" data-secret-active="\${escapeHtml(rule.id)}" \${checkbox(active)} \${disabled ? "disabled" : ""}>
            <span>
              <strong>\${escapeHtml(rule.label)}</strong>
              <button type="button" class="rule-id" data-rule-activity="\${escapeHtml(rule.id)}" title="Show recent blocks in Activity">\${escapeHtml(rule.id)}</button>
              <small><span class="\${ruleState.className}">\${ruleState.label}</span> \${escapeHtml(rule.description ?? "")}</small>
            </span>\`;
      if (!rule.paths) {
        return \`<label class="row \${disabled ? "row-disabled" : ""}">\${control}</label>\`;
      }
      return \`<div class="row rule-row \${disabled ? "row-disabled" : ""}">
            <label class="rule-control">\${control}</label>
            <button type="button" class="rule-example-button" data-secret-paths="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show protected paths for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
          </div>\`;
    }).join("")}</div>
        </div>
      </section>
    \`;
  }).join("");
};
var levelCapabilities = (level) => ({
  fail_closed: level === "strict" || level === "paranoid",
  paranoid_rm: level === "paranoid",
  paranoid_interpreters: level === "paranoid"
});
var presetName = () => safetyLevels[draftPolicy.safety.level][0];
var renderPresetStatus = () => {
  if (!preview)
    return;
  const customized = preview.counts.effectiveCustomizations > 0 || Object.entries(draftPolicy.safety.overrides).some(([key, value]) => value !== levelCapabilities(draftPolicy.safety.level)[key]);
  qs("safety-preset-status").textContent = customized ? \`\${presetName()} · Customized\` : "";
  qs("safety-preset-status").classList.toggle("customized", customized);
};
var renderSafety = () => {
  const environmentSources = preview ? [
    ...new Set(Object.values(preview.capabilities).filter((capability) => capability.source === "environment").flatMap((capability) => capability.sources.filter((source) => source.startsWith("env "))))
  ] : [];
  qs("environment-overrides").hidden = environmentSources.length === 0;
  qs("environment-overrides").textContent = environmentSources.length ? \`Environment-raised protection: \${environmentSources.join(", ")}\` : "";
  qs("safety-level").innerHTML = Object.entries(safetyLevels).map(([level, meta]) => \`<label class="row preset-\${level}"><input type="radio" name="safety-level" value="\${level}" \${checkbox(draftPolicy.safety.level === level)}><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span></label>\`).join("");
  const inherited = levelCapabilities(draftPolicy.safety.level);
  qs("safety-overrides").innerHTML = Object.entries(safetyOverrides).map(([key, meta]) => {
    const value = draftPolicy.safety.overrides[key];
    const inheritedText = inherited[key] ? "on" : "off";
    return \`<label class="row safety-override-row"><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span><select data-safety-override="\${key}">
      <option value="inherit" \${value === undefined ? "selected" : ""}>Inherit from preset (\${inheritedText})</option>
      <option value="true" \${value === true ? "selected" : ""}>Force on</option>
      <option value="false" \${value === false ? "selected" : ""}>Force off</option>
    </select></label>\`;
  }).join("");
  qs("workflow").innerHTML = \`<label class="row"><input type="checkbox" data-workflow-worktree \${checkbox(draftPolicy.workflow.worktree_mode)}><span><strong>Allow discarding local changes in linked git worktrees</strong><small>Only relaxes linked worktree discard checks.</small></span></label>\`;
  renderPresetStatus();
};
var tierForRule = (rule) => {
  if (!rule.activationCapability)
    return "normal";
  return rule.activationCapability === "fail_closed" ? "strict" : "paranoid";
};
var tierMeta = {
  normal: ["Available in every preset", "No additional capability required"],
  strict: ["Strict tier", "Inherits from Fail closed"],
  paranoid: ["Paranoid tier", "Inherits from Paranoid rm or Paranoid interpreters"]
};
var ruleStateText = (rule, effective, capabilities) => {
  const capability = rule.activationCapability;
  if (effective.source === "master_disabled")
    return "Off — destructive-command protection disabled";
  if (effective.source === "rule_override")
    return \`\${effective.enabled ? "On" : "Off"} — user rule override\`;
  if (effective.source === "built_in_default")
    return "On — available in every preset";
  if (effective.source === "environment") {
    const sources = capability ? capabilities[capability]?.sources ?? [] : [];
    const source = [...sources].reverse().find((item) => item.startsWith("env "));
    return \`\${effective.enabled ? "On" : "Off"} — environment\${source ? \`; \${source.slice(4)}\` : ""}\`;
  }
  if (effective.source === "capability_override" && capability) {
    return \`\${effective.enabled ? "On" : "Off"} — capability override; \${safetyOverrides[capability][0]} forced \${effective.enabled ? "on" : "off"}\`;
  }
  if (effective.enabled)
    return \`On — \${presetName()} preset\`;
  return \`Off — \${presetName()} preset; requires \${tierForRule(rule) === "strict" ? "Strict" : "Paranoid"}\`;
};
var showRulePopover = (button, label, title, body) => {
  const popover = qs("rule-example-popover");
  qs("rule-example-label").textContent = label;
  qs("rule-example-title").textContent = title;
  qs("rule-example-command").textContent = body;
  if (!popover.matches(":popover-open"))
    popover.showPopover();
  const buttonRect = button.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const gap = 8;
  const edge = 12;
  const below = buttonRect.bottom + gap;
  const top = below + popoverRect.height <= window.innerHeight - edge ? below : Math.max(edge, buttonRect.top - gap - popoverRect.height);
  const left = Math.min(window.innerWidth - popoverRect.width - edge, Math.max(edge, buttonRect.right - popoverRect.width));
  popover.style.top = \`\${top}px\`;
  popover.style.left = \`\${left}px\`;
};
var openRuleExample = (button) => {
  const rule = state?.destructiveCommandRules.find((item) => item.id === button.dataset.ruleExample);
  if (!rule)
    return;
  showRulePopover(button, "Blocked command example", rule.label, rule.example);
};
var openSecretPaths = (button) => {
  const rule = state?.secretPatterns.find((item) => item.id === button.dataset.secretPaths);
  if (!rule?.paths)
    return;
  showRulePopover(button, "Protected paths", rule.label, rule.paths.join(\`
\`));
};
var renderDestructiveCommands = () => {
  if (!state || !preview)
    return;
  const loaded = state;
  const effectiveState = preview;
  const query = qs("policy-search").value.trim().toLowerCase();
  const matchingRules = state.destructiveCommandRules.filter((rule) => [rule.category, rule.label, rule.id, rule.description, tierMeta[tierForRule(rule)][0]].join(" ").toLowerCase().includes(query));
  qs("destructive-command-summary").textContent = draftPolicy.destructive_command_protection.enabled ? \`\${preview.counts.enabled} active, \${preview.counts.disabled} disabled\` : "Configurable protection disabled. Catastrophic protections remain active; saved rule settings and allow paths are preserved.";
  const enforcedRules = matchingRules.filter((rule) => rule.catastrophic);
  const configurableRules = matchingRules.filter((rule) => !rule.catastrophic);
  const enforcedExpanded = tierExpanded.get("enforced") || searchActive && !searchCollapsedTiers.has("enforced");
  const enforcedSection = enforcedRules.length === 0 ? "" : \`<section class="rule-tier rule-tier-enforced">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-tier-toggle="enforced" aria-expanded="\${enforcedExpanded}" aria-controls="destructive-tier-enforced">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>Always enforced</strong><small>Cannot be disabled by any preset, rule override, or allow path</small></span>
            <span class="tier-counts">\${enforcedRules.length} protection\${enforcedRules.length === 1 ? "" : "s"}</span>
          </button>
        </div>
        <div id="destructive-tier-enforced" class="tier-content" \${enforcedExpanded ? "" : "hidden"}>
          \${groupRules(enforcedRules).map((group) => \`<section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules.map((rule) => \`<div class="row rule-row">
                <span class="rule-control">
                  <span>
                    <strong>\${escapeHtml(rule.label)}</strong>
                    <button type="button" class="rule-id" data-rule-activity="\${escapeHtml(rule.id)}" title="Show recent blocks in Activity">\${escapeHtml(rule.id)}</button>
                    <small><span class="state-active">Always enforced</span> \${escapeHtml(rule.description)}</small>
                  </span>
                </span>
                <button type="button" class="rule-example-button" data-rule-example="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show blocked example for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
              </div>\`).join("")}</div>
          </section>\`).join("")}
        </div>
      </section>\`;
  qs("destructive-command-rules").innerHTML = matchingRules.length === 0 ? '<p class="empty">No built-in protections match the search.</p>' : enforcedSection + Object.keys(tierMeta).map((tier) => {
    const rules = configurableRules.filter((rule) => tierForRule(rule) === tier);
    if (rules.length === 0)
      return "";
    const allTierRules = loaded.destructiveCommandRules.filter((rule) => !rule.catastrophic && tierForRule(rule) === tier);
    const tierStates = allTierRules.flatMap((rule) => effectiveState.rules[rule.id] ?? []);
    const expanded = tierExpanded.get(tier) || searchActive && !searchCollapsedTiers.has(tier);
    const contentId = \`destructive-tier-\${tier}\`;
    return \`<section class="rule-tier rule-tier-\${tier}">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-tier-toggle="\${tier}" aria-expanded="\${expanded}" aria-controls="\${contentId}">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>\${tierMeta[tier][0]}</strong><small>\${tierMeta[tier][1]}</small></span>
            <span class="tier-counts">\${tierCountHtml([
      [tierStates.filter((item) => item.enabled).length, "on"],
      [tierStates.filter((item) => !item.enabled).length, "off", "off"]
    ])}</span>
          </button>
          <input type="checkbox" class="tier-switch" data-destructive-tier-active="\${tier}" \${checkbox(tierStates.some((item) => item.enabled))} \${!draftPolicy.destructive_command_protection.enabled ? "disabled" : ""} aria-label="\${escapeHtml(\`All \${tierMeta[tier][0]} protections\`)}">
        </div>
        <div id="\${contentId}" class="tier-content" \${expanded ? "" : "hidden"}>
          \${groupRules(rules).map((group) => \`<section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules.map((rule) => {
      const effective = effectiveState.rules[rule.id];
      if (!effective)
        return "";
      const override = draftPolicy.destructive_command_protection.overrides[rule.id];
      const status = ruleStateText(rule, effective, effectiveState.capabilities);
      const disabled = !draftPolicy.destructive_command_protection.enabled;
      return \`<div class="row rule-row \${disabled ? "row-disabled" : ""}">
                <label class="rule-control">
                  <input type="checkbox" data-destructive-command-active="\${escapeHtml(rule.id)}" \${checkbox(effective.enabled)} \${disabled ? "disabled" : ""} aria-label="\${escapeHtml(\`\${rule.label}: \${status}\`)}">
                  <span>
                    <strong>\${escapeHtml(rule.label)}</strong>
                    <button type="button" class="rule-id" data-rule-activity="\${escapeHtml(rule.id)}" title="Show recent blocks in Activity">\${escapeHtml(rule.id)}</button>
                    <small><span class="\${effective.enabled ? "state-active" : "state-disabled"}">\${escapeHtml(status)}</span> \${escapeHtml(rule.description)}</small>
                  </span>
                </label>
                <button type="button" class="rule-example-button" data-rule-example="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show blocked example for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
                \${override && !effective.changesInherited ? \`<button type="button" class="inherit-button" data-use-inherited="\${escapeHtml(rule.id)}">Use inherited setting</button>\` : ""}
              </div>\`;
    }).join("")}</div>
          </section>\`).join("")}
        </div>
      </section>\`;
  }).join("");
};
var refreshPolicyPreview = async () => {
  const requestId = ++previewRequestId;
  const result = await requestPolicyPreview();
  if (requestId !== previewRequestId)
    return false;
  if (!result.ok || !result.data?.preview) {
    setAppStatus("Preview failed", "error");
    setDetailStatus(\`Error: \${errorText(result)}\`, "error");
    return false;
  }
  preview = result.data.preview;
  renderProtectionCard();
  renderSafety();
  renderDestructiveCommands();
  runCommandTest();
  return true;
};
var testerRequestId = 0;
var runCommandTest = async () => {
  const command = qs("tester-input").value.trim();
  if (!command) {
    qs("tester-result").hidden = true;
    return;
  }
  const requestId = ++testerRequestId;
  const result = await requestJson("/api/policy/explain", {
    method: "POST",
    body: JSON.stringify({ command, policy: collectFormPolicy() })
  });
  if (requestId !== testerRequestId)
    return;
  const el = qs("tester-result");
  el.hidden = false;
  if (!result.ok) {
    el.className = "status error";
    el.textContent = \`Could not evaluate: \${errorText(result)}\`;
    return;
  }
  if (result.data.result === "allowed") {
    el.className = "status ok";
    el.innerHTML = \`Allowed — no rule blocks this command under the current draft policy. <button type="button" class="feed-toggle" data-create-rule="\${escapeHtml(command)}">Create a rule for this</button>\`;
    return;
  }
  const ruleId = result.data.customRule?.id ?? result.data.ruleId;
  const ruleIdHtml = result.data.customRule ? \`<button type="button" class="rule-id" data-jump-custom-rule="\${escapeHtml(ruleId)}" title="Show this rule in Rules">\${escapeHtml(ruleId)}</button>\` : \`<code class="rule-id">\${escapeHtml(ruleId)}</code>\`;
  const segment = result.data.segment && result.data.segment !== command ? \`<div class="tester-segment">Segment: <code>\${escapeHtml(result.data.segment)}</code></div>\` : "";
  el.className = "status error";
  el.innerHTML = \`Blocked\${ruleId ? \` by \${ruleIdHtml}\` : ""} — \${escapeHtml(result.data.reason || "")}\${segment}\`;
};
function render() {
  if (!state)
    return;
  draftPolicy = clonePolicy(state.policy);
  preview = state.preview;
  knownRuleIds = new Set([...state.destructiveCommandRules, ...state.secretPatterns].map((rule) => rule.id));
  dirty = false;
  qs("policy-savebar").hidden = true;
  qs("dirty-chip").hidden = true;
  qs("policy-path").textContent = state.path + (state.exists ? "" : " (not created yet)");
  qs("app-version").textContent = state.version;
  renderSafety();
  qs("destructive-command").innerHTML = '<label class="row master"><input type="checkbox" data-destructive-command-enabled ' + checkbox(state.policy.destructive_command_protection.enabled) + '><span><strong>Destructive command protection</strong><small>Block configurable destructive git, filesystem, and execution patterns. Catastrophic and custom rules remain active when disabled.</small></span><span class="master-badge">' + (state.policy.destructive_command_protection.enabled ? "On" : "Off") + "</span></label>" + '<div id="destructive-command-rules"></div>' + '<section class="rule-tier">' + '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="allow-paths-label">Allow paths</strong><small>Recursive deletes targeting these paths are not blocked, like /tmp. The home directory, or any path containing it, is rejected.</small></span><span class="tier-counts" id="allow-paths-count"></span></button>' + '<div class="tier-content paths-content" id="allow-paths-content" hidden>' + '<p class="muted">Use an absolute path or a ~/ path. Paste multiple lines to add several paths at once.</p>' + '<div class="paths-add"><input type="text" id="allow-paths-input" data-path-input="allow-paths" autocomplete="off" spellcheck="false" placeholder="/absolute/path or ~/path" aria-labelledby="allow-paths-label"><button type="button" class="icon-button" id="allow-paths-add-button" data-path-add="allow-paths" aria-label="Add allow path">' + pathListIcons.add + "</button></div>" + '<p class="paths-hint" id="allow-paths-hint" hidden></p>' + '<ul class="paths-list" id="allow-paths-list"></ul>' + "</div></section>";
  qs("secret").innerHTML = '<label class="row master"><input type="checkbox" id="secret-enabled" ' + checkbox(state.policy.secret_protection.enabled) + '><span><strong>Secret protection</strong><small>Block default sensitive paths, coding CLI credential locations, and configured deny paths.</small></span><span class="master-badge">' + (state.policy.secret_protection.enabled ? "On" : "Off") + "</span></label>" + '<div id="secret-patterns"></div>' + '<section class="rule-tier">' + '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="deny-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="deny-paths-label">Deny paths</strong><small>Configured paths and everything inside them are blocked while Secret protection is on.</small></span><span class="tier-counts" id="deny-paths-count"></span></button>' + '<div class="tier-content paths-content" id="deny-paths-content" hidden>' + '<p class="muted">Paste multiple lines to add several paths at once.</p>' + '<div class="paths-add"><input type="text" id="deny-paths-input" data-path-input="deny-paths" autocomplete="off" spellcheck="false" placeholder="path/to/protect" aria-labelledby="deny-paths-label"><button type="button" class="icon-button" id="deny-paths-add-button" data-path-add="deny-paths" aria-label="Add deny path">' + pathListIcons.add + "</button></div>" + '<p class="paths-hint" id="deny-paths-hint" hidden></p>' + '<ul class="paths-list" id="deny-paths-list"></ul>' + "</div></section>" + '<section class="rule-tier">' + '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="secret-allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="secret-allow-paths-label">Allow paths</strong><small>Configured files and subtrees are exempt from the pattern rules. Deny paths and coding CLI protections still apply. Entries covering the home directory are rejected, and glob patterns are not supported.</small></span><span class="tier-counts" id="secret-allow-paths-count"></span></button>' + '<div class="tier-content paths-content" id="secret-allow-paths-content" hidden>' + '<p class="muted">Paste multiple lines to add several paths at once.</p>' + '<div class="paths-add"><input type="text" id="secret-allow-paths-input" data-path-input="secret-allow-paths" autocomplete="off" spellcheck="false" placeholder="~/project/.env.test or ~/project/fixtures" aria-labelledby="secret-allow-paths-label"><button type="button" class="icon-button" id="secret-allow-paths-add-button" data-path-add="secret-allow-paths" aria-label="Add allow path">' + pathListIcons.add + "</button></div>" + '<p class="paths-hint" id="secret-allow-paths-hint" hidden></p>' + '<ul class="paths-list" id="secret-allow-paths-list"></ul>' + "</div></section>";
  qs("raw").value = state.errors.length ? state.raw : formatPolicy(draftPolicy);
  qs("policy-search").value = "";
  syncSearchState();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists["deny-paths"].render();
  pathLists["secret-allow-paths"].render();
  pathLists["allow-paths"].render();
  updateRawSource();
  renderRetention(state);
  qs("recovery").hidden = state.errors.length === 0;
  updateActions();
  renderProtectionCard();
  if (state.errors.length) {
    if (currentView() !== "policy")
      location.hash = "policy";
    setAppStatus("Repair required", "error");
    setDetailStatus(\`Error: \${state.errors.join(\`
\`)}\`, "error");
    return;
  }
  setAppStatus("");
  setDetailStatus("");
}
var restoreDraft = () => {
  if (!state || state.errors.length)
    return;
  const stored = sessionStorage.getItem("cc-safety-net-draft");
  if (!stored)
    return;
  const parsed = (() => {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  })();
  const isPolicyShape = [
    "safety",
    "workflow",
    "destructive_command_protection",
    "secret_protection",
    "audit"
  ].every((key) => parsed && typeof parsed[key] === "object" && parsed[key] !== null);
  if (!isPolicyShape || stored === JSON.stringify(state.policy)) {
    sessionStorage.removeItem("cc-safety-net-draft");
    return;
  }
  parsed.secret_protection.allow_paths ??= [];
  draftPolicy = parsed;
  const masterToggle = document.querySelector("[data-destructive-command-enabled]");
  if (masterToggle)
    masterToggle.checked = draftPolicy.destructive_command_protection.enabled;
  qs("secret-enabled").checked = draftPolicy.secret_protection.enabled;
  syncMasterBadges();
  renderSafety();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists["deny-paths"].render();
  pathLists["secret-allow-paths"].render();
  pathLists["allow-paths"].render();
  syncRawFromForm();
  updateDirtyStatus();
  refreshPolicyPreview();
  setAppStatus("Restored unsaved draft", "ok");
};
async function load() {
  const result = await requestJson("/api/policy");
  if (!isPolicyState(result.data)) {
    setAppStatus("Load failed", "error");
    setDetailStatus(\`Error: Could not load policy: \${errorText(result)}\`, "error");
    return false;
  }
  state = result.data;
  render();
  restoreDraft();
  return true;
}
var targetInput = (event) => event.target instanceof HTMLInputElement ? event.target : null;
var targetElement = (event) => event.target instanceof Element ? event.target : null;
document.addEventListener("input", (event) => {
  const input = targetInput(event);
  if (!input)
    return;
  if (input.id === "policy-search") {
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    return;
  }
  if (input.id === "activity-search" && activity) {
    if (clearCommandFilter())
      renderActivityControls();
    activityFilters.query = input.value.trim().toLowerCase();
    clearTimeout(activityQueryTimer);
    activityQueryTimer = setTimeout(renderActivityFeed, 120);
  }
});
document.addEventListener("keydown", (event) => {
  const input = targetInput(event);
  if (!input)
    return;
  if (input.id === "tester-input" && event.key === "Enter") {
    event.preventDefault();
    runCommandTest();
    return;
  }
  const list = pathListFor(input.dataset.pathInput);
  if (!list || event.key !== "Enter")
    return;
  event.preventDefault();
  list.add(input.value);
});
document.addEventListener("paste", (event) => {
  const input = targetInput(event);
  if (!input)
    return;
  const list = pathListFor(input.dataset.pathInput);
  if (!list)
    return;
  const text = event.clipboardData?.getData("text") ?? "";
  if (!text.includes(\`
\`))
    return;
  event.preventDefault();
  list.add(\`\${input.value}
\${text}\`);
});
var saveRetentionDays = async (days) => {
  const saved = state;
  if (!saved)
    return;
  const current = saved.policy.audit.retention_days;
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) {
    qs("retention-days").value = String(current);
    setAppStatus("Retention unchanged", "error");
    setDetailStatus(\`Error: retention must be a whole number of days from 1 to \${MAX_RETENTION_DAYS}.\`, "error");
    return;
  }
  if (days === current)
    return;
  if (dirty) {
    qs("retention-days").value = String(current);
    setAppStatus("Retention unchanged", "error");
    setDetailStatus("Error: save or discard your unsaved Policy changes first.", "error");
    return;
  }
  if (days < current && !await confirmDialog({
    title: \`Shorten retention to \${dayCount(days)}?\`,
    body: \`Audit entries older than \${dayCount(days)} are deleted on the next sweep and cannot be recovered. The Activity tab will only look back \${dayCount(days)}.\`,
    detail: overview?.logsDir ?? "",
    confirmLabel: "Shorten",
    confirmClass: "danger"
  })) {
    qs("retention-days").value = String(current);
    return;
  }
  await runExclusive("Saving...", async () => {
    const policy = clonePolicy(saved.policy);
    policy.audit.retention_days = days;
    const result = await requestJson("/api/policy", {
      method: "POST",
      body: JSON.stringify(policy)
    });
    if (!isWriteSuccess(result)) {
      qs("retention-days").value = String(current);
      setAppStatus("Save failed", "error");
      setDetailStatus(\`Error: \${errorText(result)}\`, "error");
      return;
    }
    if (!await load())
      return;
    activityFilters.days = Math.min(activityFilters.days, days);
    await Promise.all([loadOverview(), loadActivity()]);
    setAppStatus(\`Retention set to \${dayCount(days)}.\`, "ok");
    setDetailStatus("");
  });
};
document.addEventListener("change", (event) => {
  const control = event.target;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement))
    return;
  if (control.id === "activity-days") {
    activityFilters.days = Number(control.value);
    loadActivity();
    return;
  }
  if (control.id === "retention-days") {
    saveRetentionDays(Number(control.value));
    return;
  }
  if (control.name === "safety-level") {
    draftPolicy.safety.level = control.value;
    renderSafety();
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (control.dataset?.safetyOverride) {
    if (control.value === "inherit")
      delete draftPolicy.safety.overrides[control.dataset.safetyOverride];
    if (control.value === "true")
      draftPolicy.safety.overrides[control.dataset.safetyOverride] = true;
    if (control.value === "false")
      draftPolicy.safety.overrides[control.dataset.safetyOverride] = false;
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  const input = control instanceof HTMLInputElement ? control : null;
  if (!input)
    return;
  if ("workflowWorktree" in input.dataset) {
    draftPolicy.workflow.worktree_mode = input.checked;
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if ("destructiveCommandEnabled" in input.dataset) {
    (async () => {
      if (!input.checked && !await confirmProtectionDisable({
        title: "Disable destructive command protection?",
        body: "Built-in destructive git, filesystem, and execution protections will stop blocking commands until you turn this back on.",
        detail: "Custom rules remain active."
      })) {
        input.checked = true;
        return;
      }
      draftPolicy.destructive_command_protection.enabled = input.checked;
      syncMasterBadges();
      pathLists["allow-paths"].render();
      syncRawFromForm();
      updateDirtyStatus();
      refreshPolicyPreview();
    })();
    return;
  }
  if (input.dataset?.destructiveTierActive) {
    const effectiveState = preview;
    if (!effectiveState)
      return;
    state?.destructiveCommandRules.filter((rule) => !rule.catastrophic && tierForRule(rule) === input.dataset.destructiveTierActive).forEach((rule) => {
      if (input.checked === effectiveState.rules[rule.id]?.inheritedEnabled) {
        delete draftPolicy.destructive_command_protection.overrides[rule.id];
        return;
      }
      draftPolicy.destructive_command_protection.overrides[rule.id] = input.checked ? "on" : "off";
    });
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (input.dataset?.destructiveCommandActive) {
    const ruleId = input.dataset.destructiveCommandActive;
    if (input.checked === preview?.rules[ruleId]?.inheritedEnabled)
      delete draftPolicy.destructive_command_protection.overrides[ruleId];
    else
      draftPolicy.destructive_command_protection.overrides[ruleId] = input.checked ? "on" : "off";
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (input.dataset?.secretGroupActive) {
    state?.secretPatterns.filter((rule) => rule.category === input.dataset.secretGroupActive).forEach((rule) => {
      setSecretOverride(rule, input.checked);
    });
    renderSecretPatterns();
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if (input.dataset?.secretActive) {
    const rule = state?.secretPatterns.find((item) => item.id === input.dataset.secretActive);
    if (!rule)
      return;
    setSecretOverride(rule, input.checked);
    renderSecretPatterns();
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if (input.id === "secret-enabled") {
    (async () => {
      if (!input.checked && !await confirmProtectionDisable({
        title: "Disable secret protection?",
        body: "Default sensitive paths, coding CLI credential locations, and deny paths will stop blocking access until you turn this back on."
      })) {
        input.checked = true;
        return;
      }
      draftPolicy.secret_protection.enabled = input.checked;
      syncMasterBadges();
      renderSecretPatterns();
      pathLists["deny-paths"].render();
      pathLists["secret-allow-paths"].render();
      syncRawFromForm();
      updateDirtyStatus();
    })();
  }
});
document.addEventListener("click", (event) => {
  const target = targetElement(event);
  if (!target)
    return;
  if (target.closest("#tester-run")) {
    runCommandTest();
    return;
  }
  const createRule = target.closest("[data-create-rule]");
  if (createRule) {
    openRuleComposer(createRule.dataset.createRule ?? "");
    return;
  }
  const feedToggle = target.closest("[data-feed-toggle]");
  if (feedToggle) {
    const command = feedToggle.previousElementSibling;
    if (!command)
      return;
    const expanded = command.classList.toggle("expanded");
    feedToggle.setAttribute("aria-expanded", String(expanded));
    feedToggle.textContent = expanded ? "Show less" : "Show more";
    return;
  }
  const feedCopy = target.closest("[data-log-copy]");
  if (feedCopy) {
    copyFeedEntry(feedCopy);
    return;
  }
  const feedReport = target.closest("[data-report-fp]");
  if (feedReport) {
    openReportDialog(feedReport);
    return;
  }
  const blockFuture = target.closest("[data-block-future]");
  if (blockFuture) {
    const entry = renderedFeedEntries[Number(blockFuture.dataset.blockFuture)];
    if (entry?.segment || entry?.command)
      openRuleComposer(entry.segment || entry.command || "");
    return;
  }
  const topRule = target.closest(".top-rule");
  if (topRule) {
    const ruleId = topRule.dataset.ruleId ?? "";
    (ruleId.startsWith("custom.") ? jumpToRulesRule : jumpToActivityRule)(ruleId);
    return;
  }
  const ruleActivity = target.closest("[data-rule-activity]");
  if (ruleActivity) {
    jumpToActivityRule(ruleActivity.dataset.ruleActivity ?? "");
    return;
  }
  const jumpRule = target.closest("[data-jump-rule]");
  if (jumpRule) {
    qs("policy-search").value = jumpRule.dataset.jumpRule ?? "";
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    location.hash = "policy";
    return;
  }
  const jumpCustom = target.closest("[data-jump-custom-rule]");
  if (jumpCustom) {
    jumpToRulesRule(jumpCustom.dataset.jumpCustomRule ?? "");
    return;
  }
  const topCommand = target.closest(".top-command");
  if (topCommand) {
    activityFilters.command = topCommand.dataset.command ?? "";
    activityFilters.decision = "deny";
    activityFilters.query = "";
    qs("activity-search").value = "";
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = "activity";
    return;
  }
  if (target.closest("[data-clear-command]")) {
    clearCommandFilter();
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (target.closest("#guard-errors")) {
    clearCommandFilter();
    activityFilters.decision = "error";
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = "activity";
    return;
  }
  const chip = target.closest("[data-activity-chip]");
  if (chip && activity) {
    clearCommandFilter();
    activityFilters[chip.dataset.activityChip] = chip.dataset.chipValue ?? "";
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (target.closest("#activity-refresh")) {
    refreshActivity();
    return;
  }
  if (target.closest("#integrations-refresh")) {
    refreshIntegrations();
    return;
  }
  if (target.closest("#rules-refresh")) {
    refreshRules();
    return;
  }
  const scopeChip = target.closest("[data-rules-scope]");
  if (scopeChip) {
    setRulesScope(scopeChip.dataset.rulesScope ?? "");
    return;
  }
  const exampleChip = target.closest("[data-rules-example]");
  if (exampleChip) {
    qs("rules-composer-input").value = exampleChip.dataset.rulesExample ?? "";
    return;
  }
  if (target.closest("#rules-choose-directory")) {
    chooseProjectDirectory();
    return;
  }
  if (target.closest("#rules-copy-prompt")) {
    copyRulePrompt();
    return;
  }
  const integrationButton = target.closest("[data-integration-action]");
  if (integrationButton) {
    runIntegrationAction(integrationButton);
    return;
  }
  const ruleExampleButton = target.closest("[data-rule-example]");
  if (ruleExampleButton) {
    openRuleExample(ruleExampleButton);
    return;
  }
  const secretPathsButton = target.closest("[data-secret-paths]");
  if (secretPathsButton) {
    openSecretPaths(secretPathsButton);
    return;
  }
  const tierButton = target.closest("[data-tier-toggle]");
  if (tierButton) {
    const tier = tierButton.dataset.tierToggle ?? "";
    const expanded = tierButton.getAttribute("aria-expanded") === "true";
    tierExpanded.set(tier, !expanded);
    if (searchActive && expanded)
      searchCollapsedTiers.add(tier);
    if (!expanded)
      searchCollapsedTiers.delete(tier);
    renderDestructiveCommands();
    return;
  }
  const secretGroupButton = target.closest("[data-secret-group-toggle]");
  if (secretGroupButton) {
    const category = secretGroupButton.dataset.secretGroupToggle ?? "";
    const expanded = secretGroupButton.getAttribute("aria-expanded") === "true";
    secretGroupExpanded.set(category, !expanded);
    if (searchActive && expanded)
      searchCollapsedSecretGroups.add(category);
    if (!expanded)
      searchCollapsedSecretGroups.delete(category);
    renderSecretPatterns();
    return;
  }
  if (target.closest("[data-secret-group-active], [data-destructive-tier-active]"))
    return;
  const button = target.closest(".panel-toggle, .rule-tier-head");
  if (button) {
    togglePanel(button);
    return;
  }
  const inheritedButton = target.closest("[data-use-inherited]");
  if (inheritedButton) {
    delete draftPolicy.destructive_command_protection.overrides[inheritedButton.dataset.useInherited ?? ""];
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (target.closest("#reset-rule-customizations")) {
    if (Object.keys(draftPolicy.destructive_command_protection.overrides).length === 0) {
      setAppStatus("No customizations to reset", "ok");
      return;
    }
    (async () => {
      if (!await confirmDialog({
        title: "Restore defaults?",
        body: "All built-in destructive-command rules will return to their inherited preset settings.",
        confirmLabel: "Restore defaults"
      }))
        return;
      draftPolicy.destructive_command_protection.overrides = {};
      syncRawFromForm();
      updateDirtyStatus();
      refreshPolicyPreview();
    })();
    return;
  }
  if (target.closest("#reset-secret-customizations")) {
    if (Object.keys(draftPolicy.secret_protection.overrides).length === 0) {
      setAppStatus("No customizations to reset", "ok");
      return;
    }
    (async () => {
      if (!await confirmDialog({
        title: "Restore defaults?",
        body: "All built-in secret rules will return to their inherited preset settings.",
        confirmLabel: "Restore defaults"
      }))
        return;
      draftPolicy.secret_protection.overrides = {};
      renderSecretPatterns();
      syncRawFromForm();
      updateDirtyStatus();
      refreshPolicyPreview();
    })();
    return;
  }
  if (target.closest("#discard-changes")) {
    (async () => {
      if (!await confirmDialog({
        title: "Discard unsaved changes?",
        body: "All changes since your last save will be reverted.",
        confirmLabel: "Discard changes",
        confirmClass: ""
      }))
        return;
      runExclusive("Discarding...", async () => {
        sessionStorage.removeItem("cc-safety-net-draft");
        if (await load())
          setAppStatus("Changes discarded.", "ok");
      });
    })();
    return;
  }
  const addButton = target.closest("[data-path-add]");
  if (addButton) {
    const list = pathListFor(addButton.dataset.pathAdd);
    if (list)
      list.add(qs(\`\${addButton.dataset.pathAdd}-input\`).value);
    return;
  }
  const removeButton = target.closest("[data-path-remove]");
  if (removeButton)
    pathListFor(removeButton.dataset.pathList)?.remove(Number(removeButton.dataset.pathRemove));
  const starButton = target.closest(".star-cta");
  if (starButton instanceof HTMLButtonElement) {
    starRepo(starButton);
    return;
  }
});
qs("dirty-chip").onclick = () => {
  location.hash = "policy";
};
qs("save").onclick = () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (state.errors.length) {
    setAppStatus("Repair required", "error");
    setDetailStatus("Error: Repair policy before saving changes.", "error");
    return;
  }
  if (!dirty) {
    setAppStatus("No changes to save", "ok");
    setDetailStatus("");
    return;
  }
  const policy = collectFormPolicy();
  runExclusive("Saving...", async () => {
    const result = await requestJson("/api/policy", {
      method: "POST",
      body: JSON.stringify(policy)
    });
    if (!isWriteSuccess(result)) {
      setAppStatus("Save failed", "error");
      setDetailStatus(\`Error: \${errorText(result)}\`, "error");
      return;
    }
    const savedPath = result.data.path;
    sessionStorage.removeItem("cc-safety-net-draft");
    if (await load()) {
      dirty = false;
      setAppStatus(\`Saved \${savedPath}.\`, "ok");
      setDetailStatus("");
    }
  });
};
qs("repair").onclick = async () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (state.errors.length === 0) {
    setAppStatus("");
    setDetailStatus("");
    return;
  }
  if (!await confirmDialog({
    title: "Repair policy?",
    body: "This will write canonical policy JSON. Valid settings are preserved; invalid fields are discarded. If the JSON cannot be parsed, defaults are restored.",
    detail: state.path,
    confirmLabel: "Repair",
    confirmClass: "primary"
  })) {
    return;
  }
  runExclusive("Repairing...", async () => {
    const result = await requestJson("/api/repair", { method: "POST", body: "{}" });
    if (!isWriteSuccess(result)) {
      setAppStatus("Repair failed", "error");
      setDetailStatus(\`Error: \${errorText(result)}\`, "error");
      return;
    }
    const repairedPath = result.data.path;
    sessionStorage.removeItem("cc-safety-net-draft");
    if (await load()) {
      dirty = false;
      setAppStatus(\`Repaired \${repairedPath}.\`, "ok");
      setDetailStatus("");
    }
  });
};
qs("reset").onclick = async () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (!await confirmDialog({
    title: "Reset policy?",
    body: "This will restore the default policy JSON at this path.",
    detail: state.path,
    confirmLabel: "Reset policy"
  })) {
    return;
  }
  runExclusive("Resetting...", async () => {
    const result = await requestJson("/api/reset", { method: "POST", body: "{}" });
    if (!isWriteSuccess(result)) {
      setAppStatus("Reset failed", "error");
      setDetailStatus(\`Error: \${errorText(result)}\`, "error");
      return;
    }
    const resetPath = result.data.path;
    sessionStorage.removeItem("cc-safety-net-draft");
    if (await load()) {
      dirty = false;
      setAppStatus(\`Reset \${resetPath} to defaults.\`, "ok");
      setDetailStatus("");
    }
  });
};
setRawCopyCopied(false);
qs("raw-copy").onclick = () => {
  copyRawToClipboard();
};
var themeOrder = ["auto", "light", "dark"];
var themeIcons = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"></rect><path d="M8 20h8M12 16v4"></path></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>'
};
var themeLabels = { auto: "Auto", light: "Light", dark: "Dark" };
var applyTheme = (pref) => {
  document.documentElement.style.colorScheme = pref === "auto" ? "light dark" : pref;
  qs("theme-toggle").innerHTML = \`\${themeIcons[pref]}<span>\${themeLabels[pref]}</span>\`;
  qs("theme-toggle").setAttribute("aria-label", \`Color theme: \${themeLabels[pref]}. Click to change.\`);
};
var themePref = themeOrder.includes(localStorage.getItem("cc-safety-net-theme")) ? localStorage.getItem("cc-safety-net-theme") : "auto";
applyTheme(themePref);
qs("theme-toggle").onclick = () => {
  themePref = themeOrder[(themeOrder.indexOf(themePref) + 1) % themeOrder.length] ?? "auto";
  if (themePref === "auto")
    localStorage.removeItem("cc-safety-net-theme");
  else
    localStorage.setItem("cc-safety-net-theme", themePref);
  applyTheme(themePref);
};
window.addEventListener("beforeunload", (event) => {
  if (!dirty)
    return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("hashchange", applyView);
applyView();
loadHealth();
load().then((loaded) => {
  if (loaded)
    loadStarContext();
  activityFilters.days = Math.min(activityFilters.days, retentionDays());
  loadOverview();
  loadActivity();
}).catch((error) => {
  setAppStatus("Load failed", "error");
  setDetailStatus(String(error), "error");
});

  </script>
</body>
</html>
`;var k3='<script id="ccsn-data" type="application/json">';function q3(n){return D3.replace(k3,()=>k3+JSON.stringify({token:n}).replaceAll("<","\\u003c"))}var Bt="kenryu42/cc-safety-net",j8=`https://github.com/${Bt}`,$e=1e4,z8=7;async function H3(n,t={}){let r=B({label:"gui",booleans:{noOpen:["--no-open"]}},n),e=t.log??console.log,a=t.error??console.error;if(r.errors.length>0){for(let s of r.errors)a(s);return a("Usage: cc-safety-net gui [--no-open]"),1}let l=await F8(t);if(e(`CC Safety Net policy GUI: ${l.url}`),!r.flags.noOpen)try{await(t.openBrowser??H8)(l.url)}catch(s){a(`Failed to open browser: ${s instanceof Error?s.message:String(s)}`),a(`Open this URL manually: ${l.url}`)}if(t.keepAlive===!1)return await l.close(),0;return await S8(l),0}async function F8(n={}){let t=n.token??D8(24).toString("base64url"),r=k8((l,s)=>{B8(l,s,t,n)});await new Promise((l,s)=>{r.once("error",s),r.listen(0,"127.0.0.1",()=>{r.off("error",s),l()})});let a=`http://127.0.0.1:${r.address().port}`;return{origin:a,token:t,url:`${a}/?token=${encodeURIComponent(t)}`,close:()=>Y8(r)}}async function B8(n,t,r,e){let a=new URL(n.url??"/","http://127.0.0.1");if(n.method==="GET"&&a.pathname==="/favicon.ico"){t.writeHead(204,{"cache-control":"no-store"}),t.end();return}if(!Q8(n,a,r)){q(t,403,{error:"Forbidden"});return}if(n.method==="GET"&&a.pathname==="/"){X8(t,q3(r));return}if(n.method==="GET"&&a.pathname==="/api/policy"){let l=B3(e);q(t,200,{...l,configState:fn(K(e)),destructiveCommandRules:un,secretPatterns:z3,version:F(),preview:l.errors.length>0?null:Z3(l.policy)});return}if(n.method==="POST"&&a.pathname==="/api/policy/preview"){let l=await Ft(n);if(!l.ok){q(t,400,{errors:[l.error]});return}let s=J3(l.value);q(t,s.errors.length>0?400:200,s);return}if(n.method==="POST"&&a.pathname==="/api/policy/explain"){let l=await Ft(n);if(!l.ok){q(t,400,{errors:[l.error]});return}let s=l.value;if(s===null||typeof s.command!=="string"){q(t,400,{errors:["command must be a string"]});return}let d=sr(s.policy);if(d.length>0){q(t,400,{errors:d});return}q(t,200,J8(s.command,s.policy,e));return}if(n.method==="POST"&&a.pathname==="/api/policy"){let l=await Ft(n);if(!l.ok){q(t,400,{errors:[l.error]});return}let s=we(l.value,e);q(t,s.errors.length>0?400:200,s);return}if(n.method==="POST"&&a.pathname==="/api/reset"){q(t,200,we(F3,e));return}if(n.method==="POST"&&a.pathname==="/api/repair"){q(t,200,Q3(e));return}if(n.method==="GET"&&a.pathname==="/api/activity"){let l=U2(e),s=Z8(a.searchParams.get("days"),l);if(s===null){q(t,400,{error:`days must be an integer between 1 and ${l}`});return}q(t,200,h3(s,e.activityLogsDir));return}if(n.method==="POST"&&a.pathname==="/api/rules/choose-directory"){q(t,200,await g3());return}if(n.method==="GET"&&a.pathname==="/api/rules"){let l=f2(e),s=new Map(l.rules.map((d)=>[d.name,d]));q(t,200,{projectPath:e.cwd??process.cwd(),canPickDirectory:m3(process.platform,process.env),rulebooks:l.rulebooks.map((d)=>({source:d.source,spec:d.spec,name:d.name,version:d.version,rules:d.rules.flatMap((c)=>{let L=s.get(c);if(!L)return[];return[{name:L.name,command:L.command,subcommand:L.subcommand,block_args:L.block_args,reason:L.reason}]})})),errors:l.errors,warnings:l.warnings});return}if(n.method==="GET"&&a.pathname==="/api/star/context"){q(t,200,await(e.fetchStarContext??(()=>V8({logsDir:e.activityLogsDir})))());return}if(n.method==="POST"&&a.pathname==="/api/star"){let l=await(e.starRepo??R8)();q(t,200,l.ok?{ok:!0}:{ok:!1,fallbackUrl:j8});return}if(n.method==="GET"&&a.pathname==="/api/integrations"){q(t,200,await(e.fetchIntegrations??W8)());return}if(n.method==="GET"&&a.pathname==="/api/health"){q(t,200,await(e.fetchHealth??A8)());return}if(n.method==="POST"&&(a.pathname==="/api/install"||a.pathname==="/api/uninstall")){let l=await Ft(n);if(!l.ok){q(t,400,{errors:[l.error]});return}let s=l.value?.target;if(typeof s!=="string"||!O.some((c)=>c.target===s)){q(t,400,{error:"unknown target"});return}let d=a.pathname==="/api/install"?"install":"uninstall";q(t,200,await(e.runIntegration??K8)(d,s));return}q(t,404,{error:"Not found"})}function J8(n,t,r){let e=ft(t),a=K(r),l=vn({rules:a.policy.rules,transparentWrappers:a.policy.transparentWrappers,safety:Y3(e.safety),worktreeMode:e.workflow.worktree_mode,destructiveCommandProtectionEnabled:e.destructive_command_protection.enabled,destructiveCommandRuleOverrides:e.destructive_command_protection.overrides,destructiveCommandAllowPaths:e.destructive_command_protection.allow_paths,secretProtection:{enabled:e.secret_protection.enabled,disabledRules:[...X3(e.secret_protection.overrides)],denyPaths:e.secret_protection.deny_paths,allowPaths:e.secret_protection.allow_paths}});return G2(n,{policySnapshot:l,cwd:r.cwd,userConfigDir:r.userConfigDir})}function Z8(n,t){if(n===null)return Math.min(z8,t);let r=Number(n);if(!Number.isInteger(r)||r<1||r>t)return null;return r}function Q8(n,t,r){if(t.searchParams.get("token")!==r)return!1;if(n.method!=="POST")return!0;return n.headers["x-cc-safety-net-token"]===r}async function Ft(n){let t=[];for await(let r of n)t.push(r);try{return{ok:!0,value:JSON.parse(Buffer.concat(t).toString("utf-8")||"{}")}}catch(r){return{ok:!1,error:`Invalid JSON: ${r instanceof Error?r.message:String(r)}`}}}function X8(n,t){n.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}),n.end(t)}function q(n,t,r){n.writeHead(t,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}),n.end(JSON.stringify(r))}function Y8(n){return new Promise((t,r)=>{n.close((e)=>e?r(e):t())})}function S8(n){return new Promise((t)=>{let r=()=>{process.off("SIGINT",e),process.off("SIGTERM",e)},e=()=>{r(),n.close().then(t)};process.once("SIGINT",e),process.once("SIGTERM",e)})}function H8(n){let t=process.platform==="darwin"?"open":process.platform==="win32"?"cmd":"xdg-open",r=process.platform==="win32"?["/c","start","",n]:[n];return new Promise((e,a)=>{let l=S3(t,r,{detached:!0,stdio:"ignore"}),s=(c)=>{l.off("spawn",d),a(c)},d=()=>{l.off("error",s),l.unref(),e()};l.once("error",s),l.once("spawn",d)})}async function R8(n="gh",t=$e){return{ok:await xe(n,["api","-X","PUT",`/user/starred/${Bt}`],t)===0}}async function W8(n={}){let t=await xn(n.fetcher),r=R3(t,n.homeDir);return{targets:M.map((e)=>{let a=r.find((l)=>l.platform===e.id);return{target:e.id,label:j(e.id),version:t.versions[e.id]??null,status:a?.configured?"active":a?.detected?"disabled":a?.inspectionStatus==="not-inspected"?"not-inspected":"not-installed"}}),system:{version:t.version,nodeVersion:t.nodeVersion,platform:t.platform}}}function R3(n,t){return rn(process.cwd(),{homeDir:t,ampPluginListOutput:n.ampPluginListOutput,codexPluginListOutput:n.codexPluginListOutput,copilotCliVersion:n.versions["copilot-cli"]})}async function A8(n={}){let[t,r]=await Promise.all([xn(n.fetcher),(n.checkUpdates??E2)()]);return{hooks:R3(t,n.homeDir).filter((e)=>e.detected).map((e)=>({platform:e.platform,label:j(e.platform),configured:e.configured})),update:{currentVersion:r.currentVersion,latestVersion:r.latestVersion??null,updateAvailable:r.updateAvailable}}}var j3=Promise.resolve();function K8(n,t,r={}){let e=async()=>{let l=[],s=console.log,d=console.error;console.log=(...c)=>l.push(c.map(String).join(" ")),console.error=console.log;try{return{ok:await Xn(n,[],{selectTargets:async()=>[t],output:new q8({write(L,i,u){l.push(String(L).replace(/\n$/,"")),u()}}),...r})===0,output:l.join(`
`)}}finally{console.log=s,console.error=d}},a=j3.then(e);return j3=a.then(()=>{return},()=>{return}),a}async function V8(n={}){let[t,r,e]=await Promise.all([M8(n.command),G8(n.fetchRepo),Promise.resolve(Cn(U2(),n.logsDir).totalBlocked)]);return{starred:t,starCount:r,blockedTotal:e}}async function M8(n="gh",t=$e){if(await xe(n,["auth","status"],t)!==0)return null;let r=await xe(n,["api",`/user/starred/${Bt}`],t);if(r===0)return!0;if(r===null)return null;return!1}function xe(n,t,r){return new Promise((e)=>{let a=S3(n,t,{stdio:"ignore",windowsHide:!0}),l=!1,s,d=(c)=>{if(l)return;if(l=!0,s)clearTimeout(s);e(c)};a.once("error",()=>d(null)),a.once("close",d),s=setTimeout(()=>{a.kill(),d(null)},r)})}async function G8(n=fetch){try{let t=await n(`https://api.github.com/repos/${Bt}`,{headers:{accept:"application/vnd.github+json"},signal:AbortSignal.timeout($e)});if(!t.ok)return null;let r=await t.json();return typeof r.stargazers_count==="number"?r.stargazers_count:null}catch{return null}}function U8(n){if(n[0]!=="help")return!1;let t=n[1];if(!t)ne(),process.exit(0);if(Jn(t))process.exit(0);console.error(`Unknown command: ${t}`),console.error("Run 'cc-safety-net --help' for available commands."),process.exit(1)}var C8={hook:async(n)=>{let t=M1(n);if(t){await t.run();return}console.error("hook requires exactly one integration flag. Try: cc-safety-net hook --kimi-code"),Jn("hook",console.error),process.exit(1)},install:async(n)=>{process.exit(await Xn("install",n))},update:async(n)=>{process.exit(await oe(n))},uninstall:async(n)=>{process.exit(await Xn("uninstall",n))},rule:async(n)=>{process.exit(await b3(n))},status:async(n)=>{if(l2(B({label:"status"},n).errors))process.exit(1);y3()},statusline:async(n)=>{let t=B({label:"statusline",booleans:{claudeCode:["-cc","--claude-code"]}},n);if(t.errors.length===0&&t.flags.claudeCode){await he();return}if(l2(t.errors),!t.flags.claudeCode)console.error("statusline requires --claude-code (-cc)");Jn("statusline",console.error),process.exit(1)},doctor:async(n)=>{let t=_r(n);if(!t)process.exit(1);let r=await C0({json:t.json,skipUpdateCheck:t.skipUpdateCheck});process.exit(r)},logs:async(n)=>{process.exit(await u1(n))},gui:async(n)=>{process.exit(await H3(n))},explain:async(n)=>{let t=Er(n);if(!t)process.exit(1);let r=G2(t.command,{cwd:t.cwd}),e=!!process.env.NO_COLOR||!process.stdout.isTTY;if(t.json)console.log(Nr(r));else console.log(Ir(r,{asciiOnly:e}));process.exit(0)}};async function O8(){let n=process.argv.slice(2),t=B({label:"cc-safety-net",booleans:{version:["-V","--version"]},positionals:"list"},n);if(U8(n))return;let r=n[0],e=r?Un(r):void 0;if(t.help&&e&&e.name!=="rule")Jn(e.name),process.exit(0);if(!r||t.help&&!e)ne(),process.exit(0);if(t.flags.version)nl(),process.exit(0);if(e){await C8[e.name](n.slice(1));return}let a=G1(r);if(a){await a.run();return}if(r==="--statusline"){await he();return}console.error(r.startsWith("-")?`Unknown option: ${r}`:`Unknown command: ${r}`),console.error("Run 'cc-safety-net --help' for usage."),process.exit(1)}O8().catch((n)=>{console.error("CC Safety Net error:",n),process.exit(1)});
