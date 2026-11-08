"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSettings, generateQuestions, createSession, submitAnswer, getResults } = require("../math.js");

test("all modes create 10 distinct questions inside the operand range", () => {
  for (const operation of ["+", "-", "mixed"]) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const questions = generateQuestions({ min: 3, max: 12, operation });
      assert.equal(questions.length, 10);
      const identities = questions.map((question) => [question.operation, Math.max(question.left, question.right), Math.min(question.left, question.right)].join(","));
      assert.equal(new Set(identities).size, 10);
      if (operation === "mixed") {
        assert.equal(questions.filter((question) => question.operation === "+").length, 5);
        assert.equal(questions.filter((question) => question.operation === "-").length, 5);
      }
      for (const question of questions) {
        assert.ok(question.left >= 3 && question.left <= 12);
        assert.ok(question.right >= 3 && question.right <= 12);
        if (operation === "mixed") assert.ok(["+", "-"].includes(question.operation));
        else assert.equal(question.operation, operation);
        assert.equal(question.answer, question.operation === "+" ? question.left + question.right : question.left - question.right);
        assert.ok(question.answer >= 0);
      }
    }
  }
});

test("single-value ranges and tiny pools still provide exactly 10 questions", () => {
  for (const operation of ["+", "-"]) {
    const questions = generateQuestions({ min: 5, max: 5, operation });
    assert.equal(questions.length, 10);
    assert.ok(questions.every((question) => question.left === 5 && question.right === 5 && question.answer === (operation === "+" ? 10 : 0)));
  }
  const tiny = generateQuestions({ min: 0, max: 1, operation: "-" });
  for (let index = 1; index < tiny.length; index += 1) {
    assert.notDeepEqual(tiny[index], tiny[index - 1]);
  }
});

test("invalid settings cannot start a session", () => {
  for (const settings of [
    { min: "", max: 10, operation: "+" },
    { min: 11, max: 10, operation: "+" },
    { min: -1, max: 10, operation: "+" },
    { min: 0, max: 101, operation: "+" },
    { min: 0.5, max: 10, operation: "+" },
    { min: 0, max: 10, operation: "*" },
  ]) assert.throws(() => createSession(settings));
  assert.deepEqual(validateSettings({ min: "0", max: "100", operation: "-" }), { min: 0, max: 100, operation: "-" });
  assert.deepEqual(validateSettings({ min: "0", max: "10", operation: "mixed" }), { min: 0, max: 10, operation: "mixed" });
});

test("mixed mode works with tiny ranges, exhausting combinations before repeating", () => {
  for (const [min, max] of [[0, 0], [5, 5], [0, 1], [99, 100]]) {
    const poolSize = (max - min + 1) * (max - min + 2);
    for (const random of [Math.random, () => 0, () => 0.999]) {
      const questions = generateQuestions({ min, max, operation: "mixed" }, random);
      assert.equal(questions.length, 10);
      assert.equal(questions.filter((question) => question.operation === "+").length, 5);
      assert.equal(questions.filter((question) => question.operation === "-").length, 5);
      for (const question of questions) {
        assert.ok(question.left >= min && question.left <= max);
        assert.ok(question.right >= min && question.right <= max);
        assert.equal(question.answer, question.operation === "+" ? question.left + question.right : question.left - question.right);
        assert.ok(question.answer >= 0);
      }
      for (let offset = 0; offset < questions.length; offset += poolSize) {
        const batch = questions.slice(offset, offset + poolSize);
        const keys = batch.map((question) => [question.operation, Math.max(question.left, question.right), Math.min(question.left, question.right)].join(","));
        assert.equal(new Set(keys).size, batch.length);
      }
    }
  }
});

test("mixed sessions score both operations and preserve the selected mode", () => {
  let session = createSession({ min: 0, max: 10, operation: "mixed" }, 1000);
  for (let index = 0; index < 10; index += 1) {
    const question = session.questions[index];
    session = submitAnswer(session, String(question.answer + (question.operation === "+" ? 0 : 1)), 1000 + (index + 1) * 6000);
  }
  assert.deepEqual(getResults(session), { correct: 5, total: 10, elapsedSeconds: 60, minutes: 1, seconds: 0 });
  assert.equal(session.settings.operation, "mixed");
  const replay = createSession(session.settings);
  assert.equal(replay.settings.operation, "mixed");
  assert.equal(replay.answers.length, 0);
  assert.equal(replay.questions.filter((question) => question.operation === "+").length, 5);
});

test("answers are scored once, 10th answer stops the clock, later result views keep the time", () => {
  let session = createSession({ min: 0, max: 10, operation: "+" }, 1000);
  const initial = session;
  for (let index = 0; index < 10; index += 1) {
    const value = session.questions[index].answer + (index < 7 ? 0 : 1);
    session = submitAnswer(session, String(value), 1000 + (index + 1) * 8000);
  }
  assert.equal(initial.answers.length, 0);
  assert.deepEqual(getResults(session, 999999), { correct: 7, total: 10, elapsedSeconds: 80, minutes: 1, seconds: 20 });
  assert.equal(session.finishedAt, 81000);
  assert.throws(() => submitAnswer(session, "1", 90000));
});

test("empty, decimal and malformed answers do not consume a question", () => {
  const session = createSession({ min: 0, max: 0, operation: "-" }, 0);
  for (const value of ["", " ", "1.5", "-1", "1e2", "abc", "9007199254740992"]) {
    assert.throws(() => submitAnswer(session, value));
  }
  assert.equal(session.answers.length, 0);
  assert.equal(submitAnswer(session, "0").answers[0].correct, true);
  assert.equal(submitAnswer(session, " 00 ").answers[0].correct, true);
});

test("timer handles minute rollover and never produces negative time", () => {
  const session = createSession({ min: 0, max: 100, operation: "+" }, 5000);
  assert.deepEqual(getResults(session, 64999), { correct: 0, total: 10, elapsedSeconds: 59, minutes: 0, seconds: 59 });
  assert.equal(getResults(session, 65000).minutes, 1);
  assert.equal(getResults(session, 65000).seconds, 0);
  assert.equal(getResults(session, 4000).elapsedSeconds, 0);
});


test("four choices are unique, nonnegative and contain exactly one correct answer", () => {
  const {generateChoices}=require("../math.js");
  for(const answer of [0,1,2,10,100,200]) for(const random of [Math.random,()=>0,()=>0.999]) {
    const choices=generateChoices({answer},random);
    assert.equal(choices.length,4); assert.equal(new Set(choices).size,4);
    assert.equal(choices.filter(n=>n===answer).length,1);
    assert.ok(choices.every(n=>Number.isInteger(n)&&n>=0));
  }
});
test("correct answers contribute 90 points and the total stopwatch contributes up to 10", () => {
  const {getScore,REWARDS}=require("../math.js");
  const make=(count,seconds)=>({startedAt:1000,finishedAt:1000+seconds*1000,answers:Array.from({length:10},(_,i)=>({correct:i<count,durationMs:1000}))});
  assert.equal(getScore(make(10,20)).points,100);
  assert.equal(getScore(make(10,60)).points,90);
  assert.equal(getScore(make(9,60)).points,81);
  assert.equal(getScore(make(8,45)).points,77);
  assert.equal(getScore(make(0,60)).points,0);
  assert.equal(getScore(make(0,20)).points,10);
  for(const [seconds,bonus] of [[0,10],[29,10],[30,10],[32,10],[32.999,10],[33,9],[35,9],[36,8],[39,7],[42,6],[45,5],[48,4],[51,3],[54,2],[57,1],[59.999,1],[60,0],[61,0],[120,0]]) {
    const score=getScore(make(10,seconds));assert.equal(score.accuracy,90);assert.equal(score.speed,bonus,"seconds: "+seconds);assert.equal(score.points,90+bonus);
  }
  assert.equal(getScore(make(10,20)).reward.file,"lion");
  assert.equal(getScore(make(10,60)).reward.file,"elephant");
  for(let correct=0;correct<=10;correct++) for(const seconds of [0,30,33,45,59,60,120]) {
    const score=getScore(make(correct,seconds));assert.ok(Number.isInteger(score.points));assert.ok(score.points>=0&&score.points<=100);assert.ok(score.reward);
  }
  for(let points=0;points<=100;points++)assert.ok(REWARDS.find(r=>points>=r.min));
});
test("speed bonus uses the full frozen stopwatch, including automatic feedback pauses",()=>{
 const {getScore}=require("../math.js");
 const s={startedAt:0,finishedAt:45000,answers:Array.from({length:10},()=>({correct:true,durationMs:1000}))};
 assert.equal(getScore(s).speed,5);assert.equal(getScore(s).points,95);
 const partial={...s,finishedAt:null,answers:s.answers.slice(0,5)};
 assert.equal(getScore(partial).speed,0);assert.equal(getScore(partial).accuracy,45);
});
test("feedback reading time is excluded from the next answer duration", () => {
  let session=createSession({min:0,max:0,operation:"+"},0);
  session=submitAnswer(session,"0",3000);
  session.questionStartedAt=60000;
  session=submitAnswer(session,"0",62000);
  assert.equal(session.answers[0].durationMs,3000);assert.equal(session.answers[1].durationMs,2000);
});


test("procedural levels can accept correct answers larger than three digits",()=>{
 const {createLevelSession}=require("../campaign.js");const progress={};for(let i=1;i<5000;i++)progress[i]={passed:true,points:90};
 let session=createLevelSession(5000,progress,0,()=>0.999);
 for(let i=0;i<10;i++){const q=session.questions[i];session=submitAnswer(session,String(q.answer),1000*(i+1));}
 assert.equal(getResults(session).correct,10);
});
