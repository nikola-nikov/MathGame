"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const math=require("../math.js");
function boot(withAudio=false){
  const nodes=new Map(), timers=[], tones=[], submissions=[];
  function element(){const classes=new Set();return {listeners:{},dataset:{},attributes:{},textContent:"",disabled:false,classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),toggle:(v,on)=>on?classes.add(v):classes.delete(v),contains:v=>classes.has(v)},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(k,v){this.attributes[k]=v;},insertAdjacentHTML(){},focus(){},scrollIntoView(){}};}
  const get=key=>{if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);};
  const card=get("#game-card");let html="",buttons=[],steps=[];
  Object.defineProperty(card,"innerHTML",{get:()=>html,set:value=>{html=value;buttons=[...value.matchAll(/data-answer="(\d+)"/g)].map(m=>{const b=element();b.dataset.answer=m[1];return b;});steps=Array.from({length:10},element);for(const key of ["#answer-status",".question-mark",".progress-track"])nodes.set(key,element());}});
  card.querySelector=key=>get(key);card.querySelectorAll=key=>key==="[data-answer]"?buttons:steps;
  const form=get("#settings-form");form.elements={min:{value:0},max:{value:0},operation:{value:"+"}};form.querySelector=()=>element();
  const document={querySelector:get,body:element(),documentElement:element()};
  const window={Campaign:require("../campaign.js"),confirm:()=>true,MathGame:{...math,submitAnswer(...args){const result=math.submitAnswer(...args);submissions.push(result);return result;}},setInterval:()=>1,clearInterval(){},setTimeout(fn,delay){timers.push({fn,delay});return timers.length;},clearTimeout(){}};
  if(withAudio)window.AudioContext=class{constructor(){this.state="running";this.currentTime=0;this.destination={};}createOscillator(){return {frequency:{setValueAtTime:v=>tones.push(v)},connect(){},start(){},stop(){},disconnect(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}};
  vm.runInNewContext(fs.readFileSync(require.resolve("../app.js"),"utf8"),{window,document,localStorage:{getItem:()=>null,setItem(){}},FormData:class{get(key){return {min:0,max:0,operation:"+"}[key];}},console});
  form.listeners.submit({preventDefault(){}});
  return {card,get,timers,tones,submissions,buttons:()=>buttons,answer(value){buttons.find(b=>Number(b.dataset.answer)===value).listeners.click();},next(){timers.shift().fn();}};
}
test("answers flash immediately, reject duplicate clicks, and advance through all 10 without another button",()=>{
 const ui=boot();
 for(let i=0;i<10;i++){
   const correct=i%2===0;const chosen=correct?0:Number(ui.buttons().find(b=>b.dataset.answer!=="0").dataset.answer);
   const oldButton=ui.buttons().find(b=>Number(b.dataset.answer)===chosen);
   ui.answer(chosen);
   assert.ok(ui.card.classList.contains(correct?"flash-correct":"flash-incorrect"));
   assert.ok(oldButton.classList.contains(correct?"choice-correct":"choice-incorrect"));
   assert.ok(ui.buttons().every(b=>b.disabled));
   assert.ok(ui.buttons().find(b=>b.dataset.answer==="0").classList.contains("choice-correct"));
   assert.ok(ui.get("#answer-status").textContent.includes("0 + 0 = 0"));
   oldButton.listeners.click();assert.equal(ui.submissions.length,i+1);
   assert.equal(ui.timers.length,1);assert.equal(ui.timers[0].delay,correct?1500:2600);
   assert.ok(!ui.card.innerHTML.includes('id="next-button"'));
   ui.next();assert.ok(!ui.card.classList.contains("flash-correct"));assert.ok(!ui.card.classList.contains("flash-incorrect"));
 }
 assert.ok(ui.card.innerHTML.includes("ИГРАТА Е ЗАВЪРШЕНА"));
 assert.equal(ui.timers.length,0);
});
test("feedback plays different sounds and the mute control silences subsequent answers",()=>{
 const ui=boot(true);ui.answer(0);assert.equal(ui.tones.length,3);ui.next();
 const wrong=Number(ui.buttons().find(b=>b.dataset.answer!=="0").dataset.answer);ui.answer(wrong);assert.equal(ui.tones.length,5);assert.equal(ui.tones[3],220);ui.next();
 const toggle={setAttribute(){},textContent:""};ui.card.listeners.click({target:{closest:()=>toggle}});ui.answer(0);assert.equal(ui.tones.length,5);
});
