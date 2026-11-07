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
  for (const value of ["", " ", "1.5", "-1", "1e2", "abc", "1000"]) {
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
test("accuracy dominates speed, scores cover 0 to 100, and all rewards have a category", () => {
  const {getScore,REWARDS}=require("../math.js");
  const make=(count,time)=>({answers:Array.from({length:10},(_,i)=>({correct:i<count,durationMs:time}))});
  assert.equal(getScore(make(0,0)).points,0);
  assert.equal(getScore(make(10,1000)).points,100);
  assert.equal(getScore(make(10,20000)).points,95);
  assert.ok(getScore(make(9,20000)).points>getScore(make(8,0)).points);
  assert.equal(getScore(make(10,1000)).reward.file,"lion");
  assert.equal(getScore(make(9,1000)).reward.file,"elephant");
  for(let correct=0;correct<=10;correct++) for(const time of [0,5000,10000,20000,60000]) {
    const score=getScore(make(correct,time));assert.ok(score.points>=0&&score.points<=100);assert.ok(score.reward);
  }
  for(let points=0;points<=100;points++)assert.ok(REWARDS.find(r=>points>=r.min));
});
test("feedback reading time is excluded from the next answer duration", () => {
  let session=createSession({min:0,max:0,operation:"+"},0);
  session=submitAnswer(session,"0",3000);
  session.questionStartedAt=60000;
  session=submitAnswer(session,"0",62000);
  assert.equal(session.answers[0].durationMs,3000);assert.equal(session.answers[1].durationMs,2000);
});
