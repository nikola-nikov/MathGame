(function (root) {
  "use strict";
  const math = typeof module !== "undefined" && module.exports ? require("./math.js") : root.MathGame;
  const limits = [5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 11, 11, 12];
  const subtractionCounts = [0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5];
  const LEVELS = limits.map((max, i) => Object.freeze({ id: i + 1, max, subtractionCount: subtractionCounts[i] }));

  function unlockedLevel(progress) {
    let next = 1;
    while (progress[next]?.passed === true) next += 1;
    return next;
  }

  function getLevel(id) {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Невалидно ниво.");
    return LEVELS[id - 1] || { id, max: 12 + Math.ceil((id - 20) / 5), subtractionCount: 5 };
  }

  function visibleLevels(progress) {
    const count = Math.max(10, Math.ceil(unlockedLevel(progress) / 5) * 5);
    return Array.from({ length: count }, (_, i) => getLevel(i + 1));
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
    const level = getLevel(id);
    if (id > unlockedLevel(progress)) throw new Error("Първо премини предишното ниво.");
    const session = { settings: { min: 0, max: level.max, operation: level.subtractionCount ? "mixed" : "+" }, answers: [], startedAt: now, questionStartedAt: now, finishedAt: null };
    const questions = [];
    for (const operation of ["+", "-"]) {
      const needed = operation === "-" ? level.subtractionCount : 10 - level.subtractionCount;
      const pool = [], seen = new Set();
      function add(left, right) {
        const answer = operation === "+" ? left + right : left - right;
        const key = left + "," + right;
        if (answer <= level.max && !seen.has(key)) { seen.add(key); pool.push({ left, right, operation, answer }); }
      }
      // Sample a bounded number of candidates instead of allocating a quadratic pool.
      for (let attempt = 0; attempt < needed * 12 && pool.length < needed; attempt += 1) {
        const left = Math.floor(random() * (level.max + 1));
        const rightMax = operation === "+" ? Math.min(left, level.max - left) : left;
        add(left, Math.floor(random() * (rightMax + 1)));
      }
      for (let left = 0; pool.length < needed && left <= level.max; left += 1) {
        for (let right = 0; right <= left; right += 1) {
          add(left, right);
          if (pool.length === needed) break;
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
    const points = math.getScore(session).points;
    const previous = progress[id];
    return { ...progress, [id]: { passed: true, points: Math.max(previous?.points || 0, points) } };
  }

  function readProgress(raw) {
    const result = {};
    if (!raw || typeof raw !== "object") return result;
    for (let id = 1; Object.prototype.hasOwnProperty.call(raw, id); id += 1) {
      const entry = raw[id];
      if (entry && typeof entry.passed === "boolean" && Number.isInteger(entry.points) && entry.points >= 0 && entry.points <= 100) {
        result[id] = { passed: true, points: entry.points };
      } else break;
    }
    // Only a contiguous chain can unlock later levels, even with damaged stored data.
    const next = unlockedLevel(result);
    for (const id of Object.keys(result)) if (Number(id) > next) delete result[id];
    return result;
  }

  function recoverProgress(raw, rankings) {
    let progress = readProgress(raw);
    const records = Array.isArray(rankings) ? rankings.filter(r => r && Number.isSafeInteger(r.levelId) && r.levelId >= 1 && Number.isInteger(r.points) && r.points >= 0 && r.points <= 100 && Number.isInteger(r.correct) && r.correct >= 0 && r.correct <= 10).sort((a, b) => a.levelId - b.levelId) : [];
    for (const record of records) {
      if (record.levelId > unlockedLevel(progress)) continue;
      const previous = progress[record.levelId];
      progress[record.levelId] = { passed: true, points: Math.max(previous?.points || 0, record.points) };
    }
    return progress;
  }

  const api = Object.freeze({ LEVELS: Object.freeze(LEVELS), getLevel, visibleLevels, unlockedLevel, createLevelSession, recordLevel, readProgress, recoverProgress });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Campaign = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
