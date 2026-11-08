(function (root) {
  "use strict";

  const QUESTION_COUNT = 10;

  function validateSettings(settings) {
    const { min, max, operation } = settings;
    if (min === "" || max === "" || !Number.isInteger(Number(min)) || !Number.isInteger(Number(max))) {
      throw new Error("Въведи цели числа за началото и края на диапазона.");
    }
    if (Number(min) < 0 || Number(max) > 100 || Number(max) < 0 || Number(min) > 100) {
      throw new Error("Избери числа от 0 до 100.");
    }
    if (Number(min) > Number(max)) {
      throw new Error("Числото „От“ трябва да е по-малко или равно на „До“.");
    }
    if (operation !== "+" && operation !== "-" && operation !== "mixed") {
      throw new Error("Избери събиране, изваждане или събиране и изваждане.");
    }
    return { min: Number(min), max: Number(max), operation };
  }

  function shuffle(items, random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function generateQuestions(settings, random = Math.random) {
    const { min, max, operation } = validateSettings(settings);
    const operations = operation === "mixed" ? ["+", "-"] : [operation];
    const operationLimit = QUESTION_COUNT / operations.length;
    const operationCounts = { "+": 0, "-": 0 };
    const pool = [];
    for (let left = min; left <= max; left += 1) {
      for (let right = min; right <= left; right += 1) {
        for (const questionOperation of operations) {
          pool.push({ left, right, operation: questionOperation, answer: questionOperation === "+" ? left + right : left - right });
        }
      }
    }
    const questions = [];
    while (questions.length < QUESTION_COUNT) {
      const batch = shuffle(pool, random);
      const previous = questions[questions.length - 1];
      if (previous && batch.length > 1 && previous.left === batch[0].left && previous.right === batch[0].right && previous.operation === batch[0].operation) {
        [batch[0], batch[1]] = [batch[1], batch[0]];
      }
      for (const question of batch) {
        if (operationCounts[question.operation] >= operationLimit) continue;
        questions.push(question);
        operationCounts[question.operation] += 1;
        if (questions.length === QUESTION_COUNT) break;
      }
    }
    // Addition works in both directions; occasionally show the smaller number first.
    return questions.map((question) => question.operation === "+" && random() < 0.5
      ? { ...question, left: question.right, right: question.left }
      : { ...question });
  }

  function createSession(settings, now = Date.now(), random = Math.random) {
    const validated = validateSettings(settings);
    return { settings: validated, questions: generateQuestions(validated, random), answers: [], startedAt: now, questionStartedAt: now, finishedAt: null };
  }

  function submitAnswer(session, input, now = Date.now()) {
    if (session.finishedAt !== null || session.answers.length >= QUESTION_COUNT) {
      throw new Error("Тази игра вече е завършена.");
    }
    const value = String(input).trim();
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new Error("Напиши цяло число, например 7.");
    }
    const question = session.questions[session.answers.length];
    const answer = { ...question, durationMs: Math.max(0, now - (session.questionStartedAt ?? session.startedAt)), given: Number(value), correct: Number(value) === question.answer };
    const answers = [...session.answers, answer];
    return { ...session, answers, questionStartedAt: now, finishedAt: answers.length === QUESTION_COUNT ? now : null };
  }

  function getResults(session, now = Date.now()) {
    const elapsedSeconds = Math.max(0, Math.floor(((session.finishedAt ?? now) - session.startedAt) / 1000));
    return {
      correct: session.answers.filter((answer) => answer.correct).length,
      total: QUESTION_COUNT,
      elapsedSeconds,
      minutes: Math.floor(elapsedSeconds / 60),
      seconds: elapsedSeconds % 60,
    };
  }

  function generateChoices(question, random = Math.random) {
    const choices = new Set([question.answer]);
    const nearby = shuffle(Array.from({ length: 11 }, (_, i) => question.answer + i - 5).filter(n => n >= 0 && n !== question.answer), random);
    for (const value of nearby) { choices.add(value); if (choices.size === 4) break; }
    return shuffle([...choices], random);
  }

  const REWARDS = [
    { min: 95, name: "Лъв", file: "lion", message: "Лъвски успех! Ти си математически шампион!" },
    { min: 80, name: "Слон", file: "elephant", message: "Слонски напредък! Смяташ чудесно!" },
    { min: 65, name: "Делфин", file: "dolphin", message: "Браво, делфинче! Продължавай със същия устрем!" },
    { min: 45, name: "Лисица", file: "fox", message: "Хитро лисиче! Всяка задача те учи на нещо ново!" },
    { min: 25, name: "Зайче", file: "rabbit", message: "Скок напред! С всяка игра ставаш по-добър!" },
    { min: 0, name: "Костенурка", file: "turtle", message: "Стъпка по стъпка! Важното е, че опита!" },
  ];

  function getScore(session) {
    const results = getResults(session);
    const accuracy = Math.min(QUESTION_COUNT, results.correct) * 9;
    const complete = session.answers.length === QUESTION_COUNT && session.finishedAt !== null;
    // Award one time point per remaining three-second band; use the displayed stopwatch.
    const speed = complete ? Math.max(0, Math.min(10, 10 - Math.floor(Math.max(0, results.elapsedSeconds - 20) / 4))) : 0;
    const points = Math.max(0, Math.min(100, accuracy + speed));
    return { points, accuracy, speed, reward: REWARDS.find(reward => points >= reward.min) };
  }

  const api = Object.freeze({ QUESTION_COUNT, generateChoices, getScore, REWARDS, validateSettings, generateQuestions, createSession, submitAnswer, getResults });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MathGame = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
