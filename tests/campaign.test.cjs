"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {LEVELS,unlockedLevel,createLevelSession,recordLevel,readProgress}=require("../campaign.js");
const {submitAnswer}=require("../math.js");
function finished(id,progress,correct=10){let s=createLevelSession(id,progress,0);for(let i=0;i<10;i++)s=submitAnswer(s,String(s.questions[i].answer+(i<correct?0:1)),1000*(i+1));return s;}
test("20 levels follow the requested introduction and bounded results",()=>{
 assert.equal(LEVELS.length,20);assert.deepEqual(LEVELS.slice(0,4).map(l=>[l.max,l.subtractionCount]),[[5,0],[7,2],[8,4],[8,5]]);
 let progress={};
 for(const level of LEVELS){
  const s=createLevelSession(level.id,progress);
  assert.equal(s.questions.length,10);assert.equal(s.questions.filter(q=>q.operation==="-").length,level.subtractionCount);
  const keys=new Set();for(const q of s.questions){assert.ok(q.left>=0&&q.left<=level.max);assert.ok(q.right>=0&&q.right<=level.max);assert.ok(q.answer>=0&&q.answer<=level.max);assert.equal(q.answer,q.operation==="+"?q.left+q.right:q.left-q.right);keys.add([q.operation,q.left,q.right].join(","));}assert.equal(keys.size,10);
  progress=recordLevel(progress,finished(level.id,progress));
 }
 assert.equal(unlockedLevel(progress),20);assert.equal(Object.values(progress).filter(r=>r.passed).length,20);
});
test("all 10 answers unlock the next level regardless of score, but unfinished levels cannot be skipped",()=>{
 assert.equal(unlockedLevel({}),1);
 for(const id of [0,2,20,21,1.5])assert.throws(()=>createLevelSession(id,{}));
 assert.equal(unlockedLevel(recordLevel({},createLevelSession(1,{}))),1);
 for(const correct of [0,6,7,10]) {
  const p=recordLevel({},finished(1,{},correct));assert.equal(p[1].passed,true);assert.equal(unlockedLevel(p),2);assert.equal(createLevelSession(2,p).levelId,2);
 }
});
test("a worse replay never removes completion or the best animal score",()=>{
 const first=recordLevel({},finished(1,{},10));const replay=recordLevel(first,finished(1,first,0));assert.equal(replay[1].passed,true);assert.equal(replay[1].points,first[1].points);assert.equal(unlockedLevel(replay),2);
});
test("unfinished games cannot record progress and malformed storage is ignored",()=>{
 assert.deepEqual(recordLevel({},createLevelSession(1,{})),{});assert.deepEqual(readProgress(null),{});assert.deepEqual(readProgress({1:{passed:true,points:101},2:{passed:true,points:100}}),{});
 assert.deepEqual(readProgress(JSON.parse(JSON.stringify({1:{passed:true,points:97},2:{passed:false,points:40}}))),{1:{passed:true,points:97},2:{passed:true,points:40}});
});


test("stored completed ranking recovers unlock and best reward without skipping levels",()=>{
 const {recoverProgress}=require("../campaign.js");
 const p=recoverProgress({},[{levelId:1,correct:10,points:100},{levelId:1,correct:7,points:68},{levelId:3,correct:10,points:100}]);
 assert.equal(p[1].passed,true);assert.equal(p[1].points,100);assert.equal(unlockedLevel(p),2);assert.equal(p[3],undefined);
});


test("completed attempts from the old seven-answer rule are migrated without losing the best animal",()=>{
 const p=readProgress({1:{passed:false,points:38}});assert.equal(p[1].passed,true);assert.equal(p[1].points,38);assert.equal(unlockedLevel(p),2);
 const {recoverProgress}=require("../campaign.js");const r=recoverProgress({},[{levelId:1,correct:2,points:20}]);assert.equal(unlockedLevel(r),2);
});
