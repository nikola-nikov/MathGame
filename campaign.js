(function (root) {
  "use strict";
  const math = typeof module !== "undefined" && module.exports ? require("./math.js") : root.MathGame;
  const PASS_COUNT = 7;
  const limits = [5, 7, 8, 8, 10, 10, 12, 15, 18, 20, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
  const subtractionCounts = [0, 2, 4, 5, 3, 5, 4, 5, 5, 5, 7, 5, 6, 5, 6, 5, 6, 5, 6, 5];
  const LEVELS = limits.map((max, i) => Object.freeze({ id: i + 1, max, subtractionCount: subtractionCounts[i] }));

  function unlockedLevel(progress) {
    let next = 1;
    while (next < LEVELS.length && progress[next]?.passed === true) next += 1;
    return next;
  }

  function shuffled(items, random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function createLevelSession(id, progress = {}, now = Date.now(), random = Math.random) {
    if (!Number.isInteger(id) || id < 1 || id > LEVELS.length || id > unlockedLevel(progress)) throw new Error("Първо премини предишното ниво.");
    const level = LEVELS[id - 1];
    const session = math.createSession({ min: 0, max: level.max, operation: level.subtractionCount ? "mixed" : "+" }, now, random);
    const questions = [];
    for (const operation of ["+", "-"]) {
      const needed = operation === "-" ? level.subtractionCount : 10 - level.subtractionCount;
      const pool = [];
      for (let left = 0; left <= level.max; left += 1) {
        for (let right = 0; right <= left; right += 1) {
          const answer = operation === "+" ? left + right : left - right;
          if (answer <= level.max) pool.push({ left, right, operation, answer });
        }
      }
      for (let count = 0; count < needed;) {
        for (const question of shuffled(pool, random)) {
          questions.push({ ...question });
          if (++count === needed) break;
        }
      }
    }
    return { ...session, levelId: id, questions: shuffled(questions, random) };
  }

  function recordLevel(progress, session) {
    if (!session.levelId || session.answers.length !== 10 || session.finishedAt === null) return progress;
    const id = session.levelId;
    const results = math.getResults(session);
    const points = math.getScore(session).points;
    const previous = progress[id];
    return { ...progress, [id]: { passed: previous?.passed === true || results.correct >= PASS_COUNT, points: Math.max(previous?.points || 0, points) } };
  }

  function readProgress(raw) {
    const result = {};
    if (!raw || typeof raw !== "object") return result;
    for (const level of LEVELS) {
      const entry = raw[level.id];
      if (entry && typeof entry.passed === "boolean" && Number.isInteger(entry.points) && entry.points >= 0 && entry.points <= 100) {
        result[level.id] = { passed: entry.passed, points: entry.points };
      }
    }
    // Only a contiguous chain can unlock later levels, even with damaged stored data.
    const next = unlockedLevel(result);
    for (const id of Object.keys(result)) if (Number(id) > next) delete result[id];
    return result;
  }

  function recoverProgress(raw, rankings) {
    let progress = readProgress(raw);
    const records = Array.isArray(rankings) ? rankings.filter(r => r && Number.isInteger(r.levelId) && r.levelId >= 1 && r.levelId <= LEVELS.length && Number.isInteger(r.points) && r.points >= 0 && r.points <= 100 && Number.isInteger(r.correct) && r.correct >= 0 && r.correct <= 10).sort((a, b) => a.levelId - b.levelId) : [];
    for (const record of records) {
      if (record.levelId > unlockedLevel(progress)) continue;
      const previous = progress[record.levelId];
      progress[record.levelId] = { passed: previous?.passed === true || record.correct >= PASS_COUNT, points: Math.max(previous?.points || 0, record.points) };
    }
    return progress;
  }

  const api = Object.freeze({ LEVELS: Object.freeze(LEVELS), PASS_COUNT, unlockedLevel, createLevelSession, recordLevel, readProgress, recoverProgress });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Campaign = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
