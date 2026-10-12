
var i=f=>{let m;return()=>m??=(m={exports:{}},f(m.exports,m),m.exports)};
var r1=i((e=>{e.createElement=function(){return'el'},e.cloneElement=function(){},e.isValidElement=function(){},e.createContext=function(){},
  e.useContext=function(){},e.useState=function(){},e.useRef=function(){},e.useEffect=function(){},e.version=`19.2.7`}));
var r2=i(((e,t)=>{t.exports=r1()}));
var d1=i((e=>{var n=r2();if(n.version!==`19.2.7`)throw Error('mismatch');var p={rendererPackageName:`react-dom`};e.createRoot=function(){return{render(){}}}}));
function q1(e){let n=useCtx.useContext(z);if(e.disabled||e.tooltipContent==null)return e.children;return e.delayDuration??n}
function k3(e,t){if(!t.startsWith(`codex:thread:`))return e.get(w).localKeyByCloudKey.get(t)??t;let n=t.slice(13);return n?t:t}
function r3(e,t,n,r){if(r?.kind===`remove`)return;return t}
function u3(e,t,n){r3(e,e=>e,null,{kind:`details`,sectionId:t})}
function m3(e,t,n,r,{wasPinned:i=!1,threadHostId:s}={}){let c=k3(e,n);r3(e,e=>e,void 0,{kind:`move`,itemKey:c,wasPinned:i,threadHostId:s})}
function x3(e,t,n,r=`placement`){let a=k3(e,t);r3(e,e=>e,void 0,{kind:`remove`,itemKey:a,reason:r})}
function c3(e,t,n=[]){let a=crypto.randomUUID();return r3(e,t=>({...t,sections:[{id:a,name:t,itemKeys:n.map(t=>k3(e,t))}],order:t.sectionOrder}))}
function Fk(e,t,n,r){let o=r==null?1:void 0,s={chain:t,get:()=>1,node:n,query:()=>1,scope:e};function c(){}return s.set=c,s}
function go(e){return e.get(NAV).navigate('/')}
var AS,N1,NAV,G1,L1,S1,S2,O3,P1,P2,I1,I2,F0;
function init(){AS=mk(`AppScope`),N1={navigate:o,navigateToLocalConversation:o,prepareNavigation:o},NAV=Uk(AS,N1),
G1=Jk(AS,(e,{get:t})=>t(c)?.getFeatureGate(e,{disableExposureLog:!0}).value??!1,{onMount:()=>{}}),
L1=J(AS,({get:e})=>e(G1,`3085093835`)),O3=J(AS,({get:e})=>e(p)),S1=J(AS,({get:e})=>e(O3).sections),S2=J(AS,({get:e})=>e(S1).length>0),
I1=Z({name:`pin-light-16`,canvas:{}}),I2=Z({name:`pin-fill-light-16`,canvas:{}}),P1=$(I1),P2=$(I2),F0=J(AS,()=>0),F1=J(AS,()=>1),F2=J(AS,()=>2),F3=J(AS,()=>3),F4=J(AS,()=>4),F5=J(AS,()=>5),F6=J(AS,()=>6),F7=J(AS,()=>7),F8=J(AS,()=>8),F9=J(AS,()=>9),F10=J(AS,()=>10),F11=J(AS,()=>11),F12=J(AS,()=>12),F13=J(AS,()=>13),F14=J(AS,()=>14),F15=J(AS,()=>15),F16=J(AS,()=>16),F17=J(AS,()=>17),F18=J(AS,()=>18),F19=J(AS,()=>19),Y0=Z({name:`icon-0`,canvas:{}}),W0=$(Y0),Y1=Z({name:`icon-1`,canvas:{}}),W1=$(Y1),Y2=Z({name:`icon-2`,canvas:{}}),W2=$(Y2),Y3=Z({name:`icon-3`,canvas:{}}),W3=$(Y3),Y4=Z({name:`icon-4`,canvas:{}}),W4=$(Y4),Y5=Z({name:`icon-5`,canvas:{}}),W5=$(Y5),Y6=Z({name:`icon-6`,canvas:{}}),W6=$(Y6),Y7=Z({name:`icon-7`,canvas:{}}),W7=$(Y7),Y8=Z({name:`icon-8`,canvas:{}}),W8=$(Y8),Y9=Z({name:`icon-9`,canvas:{}}),W9=$(Y9),Y10=Z({name:`icon-10`,canvas:{}}),W10=$(Y10),Y11=Z({name:`icon-11`,canvas:{}}),W11=$(Y11),Y12=Z({name:`icon-12`,canvas:{}}),W12=$(Y12),Y13=Z({name:`icon-13`,canvas:{}}),W13=$(Y13),Y14=Z({name:`icon-14`,canvas:{}}),W14=$(Y14),Y15=Z({name:`icon-15`,canvas:{}}),W15=$(Y15),Y16=Z({name:`icon-16`,canvas:{}}),W16=$(Y16),Y17=Z({name:`icon-17`,canvas:{}}),W17=$(Y17),Y18=Z({name:`icon-18`,canvas:{}}),W18=$(Y18),Y19=Z({name:`icon-19`,canvas:{}}),W19=$(Y19)}
function view(){return [jsx(q1,{tooltipContent:'a'}),jsx(q1,{tooltipContent:'b'}),jsx(q1,{tooltipContent:'c'})]}

var t1=i((e=>{e.createRoot=function(){return{render(){}}}}));
var r9=i((e=>{e.createElement=function(){},e.cloneElement=function(){},e.isValidElement=function(){},e.useState=function(){},e.useRef=function(){}}));
function q9(e){useCtx.useContext(z);return e.tooltipContent&&e.delayDuration&&e.children}
function other(e,t,n,r){return n}
function m9(e,t,n,r,{wasPinned:i=!1}={}){other(e,e=>e,void 0,{kind:`move`,itemKey:n,wasPinned:i})}
function u9(e,t,n){r3(e,e=>e,null,{kind:`details`,sectionId:n})}
function k9(e,t){if(!t.startsWith(`codex:thread:`))return e.localKeyByCloudKey;return t}
var NAV9,S9,G9,X9;
function init9(){X9=mk(`AppScope`),NAV9=Uk(AS,N1),S9=J(X9,({get:e})=>e(O3).sections),
G9=Jk(AS,(e,{get:t})=>t(c)?.getFeatureGate(e,{disableExposureLog:!0}).value)}
export{r1 as A};
