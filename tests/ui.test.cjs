"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const math=require("../math.js");
function boot(withAudio=false, options={}){
  const storage=options.storage || new Map();let current=null;let timeoutId=0;
  if(!options.noProfile&&!storage.has("smetni.players.v1"))storage.set("smetni.players.v1",JSON.stringify({activeId:"test",players:[{id:"test",name:"Тест",progress:JSON.parse(storage.get("smetni.progress.v1")||"{}"),rankings:JSON.parse(storage.get("smetni.rankings.v1")||"[]"),settings:{min:0,max:10,operation:"+"}}]}));
  const nodes=new Map(), timers=[], tones=[], stops=[], submissions=[], confirmations=[], alerts=[];
  function element(){const classes=new Set();return {listeners:{},dataset:{},attributes:{},textContent:"",disabled:false,classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),toggle:(v,on)=>on?classes.add(v):classes.delete(v),contains:v=>classes.has(v)},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(k,v){this.attributes[k]=v;},insertAdjacentHTML(){},focus(){},scrollIntoView(){},prepend(){},showModal(){this.open=true;},close(){this.open=false;}};}
  const get=key=>{if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);};
  const card=get("#game-card");let html="",buttons=[],steps=[];
  Object.defineProperty(card,"innerHTML",{get:()=>html,set:value=>{html=value;buttons=[...value.matchAll(/data-answer="(\d+)"/g)].map(m=>{const b=element();b.dataset.answer=m[1];return b;});steps=Array.from({length:10},element);for(const key of ["#answer-status",".question-mark",".progress-track"])nodes.set(key,element());}});
  card.querySelector=key=>get(key);card.querySelectorAll=key=>key==="[data-answer]"?buttons:steps;
  const form=get("#settings-form");form.elements={min:{value:0},max:{value:0},operation:{value:"+"}};form.querySelector=()=>element();
  const document={addEventListener(){},querySelector:get,body:element(),documentElement:element(),createElement:element};
  const window={Campaign:{...require("../campaign.js"),createLevelSession(...args){if(options.clock)args[2]=options.clock.now;current=require("../campaign.js").createLevelSession(...args);return current;}},confirm:message=>{confirmations.push(message);return options.confirm!==false;},alert:message=>alerts.push(message),MathGame:{...math,submitAnswer(...args){if(options.clock)args[2]=options.clock.now;const result=math.submitAnswer(...args);submissions.push(result);current=result;return result;}},setInterval:()=>1,clearInterval(){},setTimeout(fn,delay){const id=++timeoutId;timers.push({id,fn,delay});return id;},clearTimeout(id){const i=timers.findIndex(t=>t.id===id);if(i>=0)timers.splice(i,1);}};
  if(withAudio)window.AudioContext=class{constructor(){this.state=options.suspended?"suspended":"running";this.currentTime=0;this.destination={};}resume(){this.state="running";return Promise.resolve();}createOscillator(){return {frequency:{setValueAtTime:v=>tones.push(v),exponentialRampToValueAtTime(){}},connect(){},start(){},stop(time){if(time!==undefined)stops.push(time);},disconnect(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}};
  vm.runInNewContext(fs.readFileSync(require.resolve("../app.js"),"utf8"),{window,document,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>{if(options.failReset)throw Error("Storage denied");storage.delete(key);}},FormData:class{get(key){return {min:0,max:0,operation:"+"}[key];}},Date:class extends Date{static now(){return options.clock?options.clock.now:Date.now();}},console});
  if(options.home){}
  else if(options.level)get("#start-button").listeners.click();
  else {get("#mode-custom").listeners.click();form.listeners.submit({preventDefault(){}});}
  return {card,get,timers,tones,stops,submissions,storage,confirmations,alerts,correctAnswer:()=>current.questions[current.answers.length].answer,buttons:()=>buttons,answer(value){buttons.find(b=>Number(b.dataset.answer)===value).listeners.click();},next(){timers.shift().fn();}};
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
   assert.equal(ui.timers.length,1);assert.equal(ui.timers[0].delay,correct?750:1300);
   assert.ok(!ui.card.innerHTML.includes('id="next-button"'));
   ui.next();assert.ok(!ui.card.classList.contains("flash-correct"));assert.ok(!ui.card.classList.contains("flash-incorrect"));
 }
 assert.ok(ui.card.innerHTML.includes('class="reward-screen"'));
 assert.ok(!ui.card.innerHTML.includes("<details"));
 assert.ok(!ui.card.innerHTML.includes("Виж всички решения"));
 assert.ok(!ui.card.innerHTML.includes('class="confetti"'));
 assert.equal(ui.timers.length,1);assert.equal(ui.timers[0].delay,4000);ui.next();
 assert.ok(ui.card.innerHTML.includes('id="start-button"'));assert.equal(ui.timers.length,0);
});
test("feedback plays different sounds and the mute control silences subsequent answers",()=>{
 const ui=boot(true);const intro=ui.tones.length;ui.answer(0);assert.equal(ui.tones.length,intro+3);ui.next();
 const wrong=Number(ui.buttons().find(b=>b.dataset.answer!=="0").dataset.answer);ui.answer(wrong);assert.equal(ui.tones.length,intro+5);assert.equal(ui.tones[intro+3],220);ui.next();
 const toggle={setAttribute(){},textContent:""};ui.card.listeners.click({target:{closest:()=>toggle}});ui.answer(0);assert.equal(ui.tones.length,intro+5);
});


test("level completion is saved on answer 10 before feedback ends, home unlocks level 2 with the best animal, and reload preserves it",()=>{
 const ui=boot(false,{level:true});
 for(let i=0;i<10;i++){ui.answer(ui.correctAnswer());if(i<9)ui.next();}
 const saved=JSON.parse(ui.storage.get("smetni.progress.v1"));assert.equal(saved[1].passed,true);assert.ok(saved[1].points>=95);
 assert.equal(JSON.parse(ui.storage.get("smetni.rankings.v1")).length,1);
 ui.get("#home-button").listeners.click();

 assert.match(ui.card.innerHTML,/class="level-tile level-passed[^>]+data-level="1"/);
 assert.match(ui.card.innerHTML,/class="level-animal" src="assets\/lion.svg"/);
 const level2=ui.card.innerHTML.match(/<button[^>]+data-level="2"[^>]*>/)[0];assert.ok(!level2.includes("disabled"));
 const reload=boot(false,{level:true,storage:ui.storage});assert.ok(reload.card.innerHTML.includes("Ниво 2"));
});


test("a lion result includes a decorative confetti celebration",()=>{
 const ui=boot(false,{level:true});
 for(let i=0;i<10;i++){ui.answer(ui.correctAnswer());ui.next();}
 assert.ok(ui.card.innerHTML.includes('class="confetti" aria-hidden="true"'));
 assert.equal((ui.card.innerHTML.match(/--drift:/g)||[]).length,42);
 assert.ok(ui.card.innerHTML.includes('class="earned-name">Лъв'));
});


test("low-scoring level completion survives the results-to-home route and reload",()=>{
 const ui=boot(false,{level:true});
 for(let i=0;i<10;i++){const correct=ui.correctAnswer();const wrong=ui.buttons().find(b=>Number(b.dataset.answer)!==correct);ui.answer(Number(wrong.dataset.answer));ui.next();}
 assert.ok(ui.card.innerHTML.includes('class="reward-screen"'));
 assert.ok(!ui.card.innerHTML.includes('id="change-settings"'));
 ui.next();
 assert.match(ui.card.innerHTML,/level-tile reward-arrival level-passed[^>]+data-level="1"/);
 assert.match(ui.card.innerHTML,/class="level-animal" src="assets\/turtle.svg"/);
 assert.ok(!ui.card.innerHTML.match(/<button[^>]+data-level="2"[^>]*>/)[0].includes("disabled"));
 const reload=boot(false,{level:true,storage:ui.storage});assert.ok(reload.card.innerHTML.includes("Ниво 2"));
});


test("home has an accessible podium picture below the play button",()=>{
 const ui=boot(false,{home:true});assert.ok(ui.card.innerHTML.includes('id="start-button">Играй'));
 assert.match(ui.card.innerHTML,/id="rankings-button" aria-label="Класация"[^>]*><img src="assets\/podium.svg"/);
 assert.ok(ui.card.innerHTML.indexOf('class="levels-grid"')<ui.card.innerHTML.indexOf('id="rankings-button"'));
});
test("the start jingle lasts between two and three seconds and supports a suspended mobile audio context",async()=>{
 const ui=boot(true,{level:true,suspended:true});await Promise.resolve();assert.equal(ui.tones.length,9);
 assert.ok(Math.max(...ui.stops)>=2);assert.ok(Math.max(...ui.stops)<=3);
 assert.ok(ui.card.innerHTML.includes('Ниво 1'));
});
test("each animal button responds with a joke, animation and its own short sound",()=>{
 const ui=boot(true,{home:true});
 for(const animal of ['lion','elephant','parrot','tiger','monkey','turtle']){
  const button=ui.get('[test-animal-'+animal+']');button.dataset.animal=animal;
  const before=ui.tones.length;ui.get('#jungle-animals').listeners.click({target:{closest:()=>button}});
  assert.ok(button.classList.contains('animal-dancing'));assert.ok(ui.get('#animal-joke').textContent.length>10);
  assert.ok(ui.tones.length>before);ui.next();assert.ok(!button.classList.contains('animal-dancing'));
 }
});


test("the level animal is animated only on return, without duplicating the ranking",()=>{
 const ui=boot(false,{level:true});
 for(let i=0;i<10;i++){ui.answer(ui.correctAnswer());ui.next();}
 assert.ok(!ui.card.innerHTML.includes('Виж всички решения'));
 assert.ok(!ui.card.innerHTML.includes('class="result-actions"'));
 assert.equal(ui.timers[0].delay,4000);ui.next();
 assert.match(ui.card.innerHTML,/level-tile reward-arrival level-passed[^>]+data-level="1"/);
 assert.match(ui.card.innerHTML,/class="level-animal" src="assets\/lion.svg"/);
 assert.equal(JSON.parse(ui.storage.get('smetni.rankings.v1')).length,1);
 ui.get('#home-button').listeners.click();assert.ok(!ui.card.innerHTML.includes('reward-arrival'));
 assert.equal(ui.timers.length,0);
});
test("leaving the reward screen early cancels its pending automatic return",()=>{
 const ui=boot(false,{level:true});for(let i=0;i<10;i++){ui.answer(ui.correctAnswer());ui.next();}
 ui.get('#home-button').listeners.click();assert.equal(ui.timers.length,0);
 assert.match(ui.card.innerHTML,/reward-arrival/);
 ui.get('#start-button').listeners.click();assert.ok(ui.card.innerHTML.includes('Ниво 2'));
 assert.equal(ui.timers.length,0);
});


test("home reveals level 11 only after level 10 and retains progress past level 20",()=>{
 const empty=boot(false,{home:true});assert.equal((empty.card.innerHTML.match(/data-level="/g)||[]).length,10);
 for(const completed of [9,10,15,20,25]){
  const progress={};for(let i=1;i<=completed;i++)progress[i]={passed:true,points:90};
  const storage=new Map([["smetni.progress.v1",JSON.stringify(progress)]]);const ui=boot(false,{home:true,storage});
  const count=Math.max(10,Math.ceil((completed+1)/5)*5);assert.equal((ui.card.innerHTML.match(/data-level="/g)||[]).length,count);
  const next=ui.card.innerHTML.match(new RegExp('<button[^>]+data-level="'+(completed+1)+'"[^>]*>'))[0];assert.ok(!next.includes('disabled'));
 }
});


test("reset asks for confirmation and cancellation preserves progress and the active game",()=>{
 const storage=new Map([["smetni.progress.v1",JSON.stringify({1:{passed:true,points:100}})],["smetni.rankings.v1","[]"]]);
 const ui=boot(false,{level:true,storage,confirm:false});ui.answer(ui.correctAnswer());
 const html=ui.card.innerHTML;const saved=[...storage];const pending=ui.timers.length;
 ui.get('#reset-button').listeners.click();assert.equal(ui.confirmations.length,1);
 assert.deepEqual([...storage],saved);assert.equal(ui.card.innerHTML,html);assert.equal(ui.timers.length,pending);
 ui.next();assert.ok(ui.card.innerHTML.includes('Ниво 2'));
});
test("confirmed reset clears only game data, cancels transitions and returns to level 1",()=>{
 const storage=new Map([["unrelated-key","keep"],["smetni.progress.v1",JSON.stringify({1:{passed:true,points:100}})],["smetni.rankings.v1","[]"],["smetni.settings.v1",JSON.stringify({min:3,max:5,operation:"-"})]]);
 const ui=boot(false,{level:true,storage});for(let i=0;i<10;i++){ui.answer(ui.correctAnswer());ui.next();}
 assert.equal(ui.timers.length,1);ui.get('#reset-button').listeners.click();
 assert.equal(ui.timers.length,0);assert.equal(storage.get('unrelated-key'),'keep');
 for(const key of ['smetni.progress.v1','smetni.rankings.v1','smetni.settings.v1'])assert.ok(!storage.has(key));
 assert.ok(!ui.card.innerHTML.includes('level-passed'));assert.ok(!ui.card.innerHTML.includes('level-passed'));
 assert.ok(ui.card.innerHTML.match(/<button[^>]+data-level="2"[^>]*>/)[0].includes('disabled'));
 assert.equal(ui.get('#settings-form').elements.max.value,10);
 assert.match(ui.card.innerHTML,/id="start-button">Играй<\/button>/);
 const reload=boot(false,{level:true,storage});assert.ok(reload.card.innerHTML.includes('Ниво 1'));
});
test("failed storage deletion is explained without preventing a fresh in-memory game",()=>{
 const ui=boot(false,{level:true,failReset:true});ui.get('#reset-button').listeners.click();
 assert.equal(ui.alerts.length,1);assert.ok(ui.alerts[0].includes('При презареждане'));
 assert.ok(!ui.card.innerHTML.includes('level-passed'));
});


test("the final screen shows 10/10 answers, 29 seconds and a total of 98",()=>{
 const clock={now:0};const ui=boot(false,{level:true,clock});
 for(let i=1;i<=10;i++){clock.now=i*2900;ui.answer(ui.correctAnswer());ui.next();}
 assert.ok(ui.card.innerHTML.includes('10/10 отговора <strong>— 90 точки</strong>'));
 assert.ok(ui.card.innerHTML.includes('29 секунди <strong>— 8 точки</strong>'));
 assert.ok(ui.card.innerHTML.includes('ОБЩО</span>98<span>ТОЧКИ'));
 assert.equal(ui.timers[0].delay,4000);assert.ok(!ui.card.innerHTML.includes('Виж всички решения'));
});
test("lion and non-lion endings play distinct completion sounds",()=>{
 for(const lion of [true,false]){
  const ui=boot(true,{level:true});let before=0;
  for(let i=0;i<10;i++){const answer=lion?ui.correctAnswer():Number(ui.buttons().find(b=>Number(b.dataset.answer)!==ui.correctAnswer()).dataset.answer);ui.answer(answer);before=ui.tones.length;ui.next();}
  const ending=ui.tones.slice(before);assert.equal(ending.length,lion?6:3);assert.equal(ending[0],lion?523.25:392);
 }
});
test("muting also silences the completion sound",()=>{
 const ui=boot(true,{level:true});const toggle={setAttribute(){},textContent:''};ui.card.listeners.click({target:{closest:()=>toggle}});const before=ui.tones.length;
 for(let i=0;i<10;i++){ui.answer(ui.correctAnswer());ui.next();}assert.equal(ui.tones.length,before);
});


test("first play requires a name, then shows it persistently and preserves separate players",()=>{
 const ui=boot(false,{level:true,noProfile:true});assert.equal(ui.get('#player-dialog').open,true);assert.equal(ui.submissions.length,0);
 ui.get('#player-input').value='Ива';ui.get('#player-form').listeners.submit({preventDefault(){}});
 assert.equal(ui.get('#player-name').textContent,'Ива');assert.ok(ui.card.innerHTML.includes('Ниво 1'));
 for(let i=0;i<10;i++){ui.answer(ui.correctAnswer());ui.next();}ui.next();
 ui.get('#new-player').listeners.click();ui.get('#player-input').value='Боби';ui.get('#player-form').listeners.submit({preventDefault(){}});
 assert.equal(ui.get('#player-name').textContent,'Боби');assert.ok(!ui.card.innerHTML.includes('level-passed'));
 let data=JSON.parse(ui.storage.get('smetni.players.v1'));const iva=data.players.find(p=>p.name==='Ива');assert.ok(iva.progress[1].passed);
 ui.get('#profile-options').listeners.click({target:{closest:()=>({dataset:{player:iva.id}})}});
 assert.equal(ui.get('#player-name').textContent,'Ива');assert.match(ui.card.innerHTML,/level-passed/);
 const reload=boot(false,{home:true,storage:ui.storage});assert.equal(reload.get('#player-name').textContent,'Ива');
 reload.get('#reset-button').listeners.click();data=JSON.parse(ui.storage.get('smetni.players.v1'));assert.equal(data.players.length,2);assert.deepEqual(data.players.find(p=>p.name==='Ива').progress,{});
});
test("cancelling name entry never starts a game and the first player inherits existing progress",()=>{
 const storage=new Map([['smetni.progress.v1',JSON.stringify({1:{passed:true,points:90}})]]);
 const ui=boot(false,{level:true,noProfile:true,storage});ui.get('#player-cancel').listeners.click();assert.equal(ui.get('#player-dialog').open,false);assert.equal(ui.storage.has('smetni.players.v1'),false);
 ui.get('#start-button').listeners.click();ui.get('#player-input').value='Ани';ui.get('#player-form').listeners.submit({preventDefault(){}});
 assert.ok(ui.card.innerHTML.includes('Ниво 2'));const data=JSON.parse(storage.get('smetni.players.v1'));assert.equal(data.players[0].progress[1].points,90);
});
test("names are displayed as text and escaped in the player picker",()=>{
 const ui=boot(false,{home:true,noProfile:true});ui.get('#new-player').listeners.click();ui.get('#player-input').value='<b>Мая</b>';ui.get('#player-form').listeners.submit({preventDefault(){}});
 assert.equal(ui.get('#player-name').textContent,'<b>Мая</b>');assert.ok(ui.get('#profile-options').innerHTML.includes('&lt;b&gt;Мая&lt;/b&gt;'));
});
test("initial home omits progress counters, level descriptions and completion instructions",()=>{
 const ui=boot(false,{home:true});assert.ok(!ui.card.innerHTML.includes('ПРЕМИНАТИ НИВА'));assert.ok(!ui.card.innerHTML.includes('резултати до'));assert.ok(!ui.card.innerHTML.includes('Завърши 10-те задачи'));
});


test("reset affects only the selected player's saved game",()=>{
 const store={activeId:'one',players:[{id:'one',name:'Ана',settings:{min:0,max:10,operation:'+'},progress:{1:{passed:true,points:90}},rankings:[]},{id:'two',name:'Борис',settings:{min:0,max:5,operation:'-'},progress:{1:{passed:true,points:99},2:{passed:true,points:100}},rankings:[]}]};
 const storage=new Map([['smetni.players.v1',JSON.stringify(store)]]);const ui=boot(false,{home:true,storage});ui.get('#reset-button').listeners.click();
 const saved=JSON.parse(storage.get('smetni.players.v1'));assert.deepEqual(saved.players[0].progress,{});assert.equal(saved.players[1].progress[2].points,100);
 ui.get('#profile-options').listeners.click({target:{closest:()=>({dataset:{player:'two'}})}});
 assert.equal(ui.get('#player-name').textContent,'Борис');ui.get('#start-button').listeners.click();assert.ok(ui.card.innerHTML.includes('Ниво 3'));
});

test("profile deletion preserves other users and selects the remaining profile",()=>{
 const store={activeId:'one',players:[{id:'one',name:'Ана',settings:{min:0,max:10,operation:'+'},progress:{1:{passed:true,points:90}},rankings:[]},{id:'two',name:'Борис',settings:{min:0,max:5,operation:'-'},progress:{1:{passed:true,points:99}},rankings:[]}]};
 const ui=boot(false,{level:true,storage:new Map([['smetni.players.v1',JSON.stringify(store)]])});
 ui.answer(ui.correctAnswer());ui.get('#delete-player').listeners.click();
 const data=JSON.parse(ui.storage.get('smetni.players.v1'));
 assert.equal(data.players.length,1);assert.equal(data.activeId,'two');assert.equal(data.players[0].progress[1].points,99);
 assert.equal(ui.get('#player-name').textContent,'Борис');assert.equal(ui.timers.length,0);
});
test("deleting the last profile never transfers its progress to a new player",()=>{
 const ui=boot(false,{home:true});ui.get('#delete-player').listeners.click();
 assert.equal(JSON.parse(ui.storage.get('smetni.players.v1')).players.length,0);
 ui.get('#start-button').listeners.click();assert.equal(ui.get('#player-dialog').open,true);
 ui.get('#player-input').value='Нов';ui.get('#player-form').listeners.submit({preventDefault(){}});
 assert.ok(ui.card.innerHTML.includes('Ниво 1'));
});
test("cancelled deletion preserves the current game and saved users",()=>{
 const ui=boot(false,{level:true,confirm:false});const before=ui.storage.get('smetni.players.v1');
 ui.get('#delete-player').listeners.click();assert.equal(ui.storage.get('smetni.players.v1'),before);ui.answer(ui.correctAnswer());assert.equal(ui.submissions.length,1);
});
test("the name picker protects an unfinished game and sound switch mutes audio",()=>{
 const ui=boot(true,{level:true,confirm:false,storage:new Map([['smetni.players.v1',JSON.stringify({activeId:'a',players:['a','b'].map(id=>({id,name:id,settings:{min:0,max:5,operation:'+'},progress:{},rankings:[]}))})]])});
 ui.get('#profile-options').listeners.click({target:{closest:()=>({dataset:{player:'b'}})}});
 assert.equal(ui.get('#player-name').textContent,'a');assert.equal(ui.confirmations.length,1);
 ui.get('#menu-sound').listeners.click();assert.equal(ui.get('#menu-sound').attributes['aria-checked'],'false');
 const count=ui.tones.length;ui.answer(ui.correctAnswer());assert.equal(ui.tones.length,count);
});
