(function () {
  "use strict";

  const { QUESTION_COUNT, generateChoices, getScore, REWARDS, validateSettings, createSession, submitAnswer, getResults } = window.MathGame;
  const { LEVELS, PASS_COUNT, unlockedLevel, createLevelSession, recordLevel, readProgress } = window.Campaign;
  const card = document.querySelector("#game-card");
  const settingsForm = document.querySelector("#settings-form");
  const settingsFields = document.querySelector("#settings-fields");
  const settingsError = document.querySelector("#settings-error");
  const settingsNote = document.querySelector("#settings-note p");
  const settingsPanel = document.querySelector(".settings-panel");
  const storageKey = "smetni.settings.v1";
  let session = null;
  let timerId = null;
  let phase = "welcome";
  let feedbackTimeout = null;
  let audioContext = null;
  let soundEnabled = true;
  let homeMode = "levels";
  let selectedLevel = 1;
  let progress = {};
  let rankings = [];
  let storageAvailable = true;
  const homeControls = document.querySelector("#home-controls");

  function readStorage(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { storageAvailable = false; return fallback; }
  }
  progress = readProgress(readStorage("smetni.progress.v1", {}));
  const savedRankings = readStorage("smetni.rankings.v1", []);
  rankings = Array.isArray(savedRankings) ? savedRankings.filter(r => r && Number.isInteger(r.points) && r.points >= 0 && r.points <= 100 && Number.isInteger(r.correct) && r.correct >= 0 && r.correct <= 10 && Number.isInteger(r.seconds) && r.seconds >= 0 && ["+", "-", "mixed"].includes(r.operation) && (r.levelId === null || Number.isInteger(r.levelId) && r.levelId >= 1 && r.levelId <= 20)).slice(0, 50) : [];
  selectedLevel = unlockedLevel(progress);

  function saveProgress() {
    try { localStorage.setItem("smetni.progress.v1", JSON.stringify(progress)); localStorage.setItem("smetni.rankings.v1", JSON.stringify(rankings)); }
    catch { storageAvailable = false; }
  }

  function enterFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      const target = document.documentElement;
      const request = target.requestFullscreen || target.webkitRequestFullscreen;
      if (request) Promise.resolve(request.call(target)).catch(showScreenHint);
      else showScreenHint();
    } catch { showScreenHint(); }
  }

  function showScreenHint() {
    const hint = document.querySelector("#screen-hint");
    hint.hidden = false;
    hint.textContent = "Ако браузърът не поддържа цял екран: добави играта към началния екран на телефона. На iPhone: Споделяне → Добави към началния екран.";
  }

  function cancelFeedback() {
    if (feedbackTimeout !== null) window.clearTimeout(feedbackTimeout);
    feedbackTimeout = null;
    card.classList.remove("flash-correct", "flash-incorrect");
  }

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
  const operationLabel = (operation) => operation === "mixed" ? "Събиране и изваждане" : operation === "+" ? "Събиране" : "Изваждане";
  const operationSymbol = (operation) => operation === "+" ? "+" : "−";
  const equationText = (question) => `${question.left} ${operationSymbol(question.operation)} ${question.right} = ${question.answer}`;
  const clockText = (results) => `${String(results.minutes).padStart(2, "0")}:${String(results.seconds).padStart(2, "0")}`;
  const timeText = (results) => `${results.minutes} мин ${String(results.seconds).padStart(2, "0")} сек`;

  function readSettings() {
    const values = new FormData(settingsForm);
    return validateSettings({ min: values.get("min"), max: values.get("max"), operation: values.get("operation") });
  }

  function restoreSettings() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const settings = validateSettings(JSON.parse(saved));
      settingsForm.elements.min.value = settings.min;
      settingsForm.elements.max.value = settings.max;
      settingsForm.elements.operation.value = settings.operation;
    } catch { /* The game also works when browser storage is unavailable. */ }
  }

  function setLocked(locked) {
    settingsFields.disabled = locked;
    settingsPanel.classList.toggle("is-locked", locked);
    settingsNote.textContent = locked
      ? "Сега смятаме! Можеш да смениш настройките след играта."
      : "Всяка задача е малка стъпка напред.";
  }

function renderWelcome(focus = false) {
 document.body.classList.remove("is-playing");
 phase='welcome';stopTimer();cancelFeedback();setLocked(false);homeControls.hidden=false;settingsPanel.hidden=homeMode!=='custom';
 document.querySelector('#mode-levels').setAttribute('aria-pressed',String(homeMode==='levels'));document.querySelector('#mode-custom').setAttribute('aria-pressed',String(homeMode==='custom'));
 const next=unlockedLevel(progress), completed=LEVELS.filter(l=>progress[l.id]?.passed).length;if(selectedLevel>next)selectedLevel=next;const level=LEVELS[selectedLevel-1];
 card.innerHTML=`<div class="home-body"><div class="home-intro"><div><p class="eyebrow">${homeMode==='levels'?completed+' ОТ 20 ПРЕМИНАТИ НИВА':'ТИ ИЗБИРАШ ЗАДАЧИТЕ'}</p><h2>${homeMode==='levels'?'Една стъпка по-нагоре!':'Да потренираме!'}</h2></div><img src="assets/lion.svg" alt="" width="82" height="72"></div><div class="home-actions"><button class="primary-button" type="button" id="start-button">Нова игра ${icon('arrow')}</button><button class="secondary-button" type="button" id="rankings-button">★ Класация</button></div>${homeMode==='levels'?`<p class="level-summary">Ниво ${level.id} · резултати до ${level.max}<br>${10-level.subtractionCount} събирания и ${level.subtractionCount} изваждания</p><div class="levels-grid" role="group" aria-label="Избери ниво">${LEVELS.map(item=>{const record=progress[item.id],locked=item.id>next,reward=record?REWARDS.find(r=>record.points>=r.min):null;return `<button type="button" class="level-tile ${record?.passed?'level-passed':''} ${item.id===selectedLevel?'level-selected':''}" data-level="${item.id}" aria-pressed="${item.id===selectedLevel}" aria-label="Ниво ${item.id}, ${locked?'заключено':record?.passed?'преминато, '+record.points+' точки, '+reward.name:'достъпно'}" ${locked?'disabled':''}><strong>${item.id}</strong>${record?.passed?`<img src="assets/${reward.file}.svg" alt="" width="42" height="36">`:`<span class="level-state">${locked?'🔒':'Играй'}</span>`}</button>`;}).join('')}</div><p class="home-help">Премини ниво с поне ${PASS_COUNT} верни отговора от 10, за да отключиш следващото. Зелените нива могат да се играят отново за по-добро животно.</p>`:'<p class="home-help">10 задачи според твоите настройки. Избери числата и операциите по-горе.</p>'}<p class="storage-note">${storageAvailable?'Напредъкът и класацията се пазят на това устройство.':'Запазването е недостъпно. Напредъкът остава само до затваряне на страницата.'}</p></div>`;
 card.querySelector('#start-button').addEventListener('click',()=>{if(homeMode==='levels')startSession(null,selectedLevel);else settingsForm.requestSubmit();});
 card.querySelector('#rankings-button').addEventListener('click',renderRankings);
 card.querySelectorAll('[data-level]').forEach(button=>button.addEventListener('click',()=>{const id=Number(button.dataset.level);if(id>unlockedLevel(progress))return;selectedLevel=id;renderWelcome();card.querySelector('[data-level="'+id+'"]').focus();}));
 if(focus)card.querySelector('#start-button').focus();
}
function renderRankings(){phase='rankings';homeControls.hidden=true;settingsPanel.hidden=true;const sorted=rankings.slice().sort((a,b)=>b.points-a.points||b.correct-a.correct||a.seconds-b.seconds).slice(0,20);card.innerHTML=`<div class="home-body"><p class="eyebrow">НА ТОВА УСТРОЙСТВО</p><h2 tabindex="-1" id="rankings-title">Класация</h2><p class="home-help">Твоите 20 най-добри игри. При равни точки и верни отговори по-бързото време е напред.</p>${sorted.length?'<ol class="ranking-list">'+sorted.map((r,i)=>`<li><strong>${i+1}</strong><img src="assets/${REWARDS.find(reward=>r.points>=reward.min).file}.svg" alt="" width="44" height="40"><div><b>${r.levelId?'Ниво '+r.levelId:'По избор · '+operationLabel(r.operation)}</b><span>${r.correct}/10 верни · ${Math.floor(r.seconds/60)} мин ${r.seconds%60} сек</span></div><strong>${r.points}<small> т.</small></strong></li>`).join('')+'</ol>':'<div class="empty-ranking"><img src="assets/rabbit.svg" alt="Зайче" width="140" height="120"><p>Твоето първо постижение те очаква!</p></div>'}<button class="primary-button" type="button" id="back-home">Към играта ${icon('arrow')}</button></div>`;card.querySelector('#back-home').addEventListener('click',()=>renderWelcome(true));card.querySelector('#rankings-title').focus();}
  function progressMarkup(currentIndex) {
    return `<div class="progress-track" role="img" aria-label="Решени ${session.answers.length} от ${QUESTION_COUNT} задачи">${session.questions.map((_, index) => {
      const answer = session.answers[index];
      const status = answer ? (answer.correct ? "is-correct" : "is-incorrect") : index === currentIndex ? "is-current" : "";
      return `<span class="progress-step ${status}"></span>`;
    }).join("")}</div>`;
  }

  function gameTop(index) {
    return `<div class="game-top"><span class="game-badge">${session.levelId ? "Ниво " + session.levelId + " · " : ""}${index + 1} / ${QUESTION_COUNT}</span><span class="game-meta"><button class="sound-toggle" type="button" data-sound-toggle aria-pressed="${soundEnabled}" aria-label="${soundEnabled ? "Изключи звука" : "Включи звука"}">${soundEnabled ? "Звук: вкл." : "Звук: изкл."}</button>${icon("clock")}<span id="timer" role="timer" aria-label="Изминало време">${clockText(getResults(session))}</span></span></div>${progressMarkup(index)}`;
  }

  function renderQuestion() {
    phase = "question";
    const index = session.answers.length;
    const question = session.questions[index];
    session.questionStartedAt = Date.now();
    card.innerHTML = `${gameTop(index)}
      <div class="question-body">
        <p class="question-prompt">${operationLabel(question.operation)} · Колко се получава?</p>
        <h2 class="equation" id="question-equation"><span>${question.left}</span><span class="operator">${operationSymbol(question.operation)}</span><span>${question.right}</span><span class="operator">=</span><span class="question-mark">?</span></h2>
        <p class="choice-prompt" id="choice-label">Избери верния отговор</p>
        <div class="answer-choices" role="group" aria-labelledby="question-equation choice-label">${generateChoices(question).map((value, i) => `<button class="answer-choice" type="button" data-answer="${value}"><span class="choice-number" aria-hidden="true">${i + 1}</span>${value}</button>`).join("")}</div>
        <p class="answer-status" id="answer-status" role="status" aria-live="polite" aria-atomic="true"></p>
      </div>`;
    card.querySelectorAll("[data-answer]").forEach(button => button.addEventListener("click", () => handleAnswer(button.dataset.answer)));
  }

  function handleAnswer(value) {
    if (phase !== "question") return;
    session = submitAnswer(session, value);
    if (session.finishedAt !== null) stopTimer();
    playFeedback(session.answers[session.answers.length - 1].correct);
    renderFeedback();
  }

  function playFeedback(correct) {
    if (!soundEnabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audioContext) audioContext = new Audio();
      const context = audioContext;
      const play = () => {
        if (context.state !== "running") return;
        const tones = correct ? [523.25, 659.25, 783.99] : [220, 164.81];
        const now = context.currentTime;
        tones.forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const begin = now + index * 0.12;
          oscillator.type = correct ? "sine" : "triangle";
          oscillator.frequency.setValueAtTime(frequency, begin);
          gain.gain.setValueAtTime(0, begin);
          gain.gain.linearRampToValueAtTime(0.12, begin + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, begin + 0.19);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(begin);
          oscillator.stop(begin + 0.21);
        });
      };
      if (context.state === "suspended") context.resume().then(play).catch(() => {});
      else play();
    } catch { /* Visual feedback and progression also work without audio support. */ }
  }

  function renderFeedback() {
    phase = "feedback";
    const answer = session.answers[session.answers.length - 1];
    const lastQuestion = session.answers.length === QUESTION_COUNT;
    card.classList.add(answer.correct ? "flash-correct" : "flash-incorrect");
    card.querySelectorAll("[data-answer]").forEach(button => {
      const value = Number(button.dataset.answer);
      button.disabled = true;
      if (value === answer.answer) {
        button.classList.add("choice-correct");
        button.insertAdjacentHTML("beforeend", '<span class="choice-verdict" aria-hidden="true">✓</span>');
      } else if (value === answer.given) {
        button.classList.add("choice-incorrect");
        button.insertAdjacentHTML("beforeend", '<span class="choice-verdict" aria-hidden="true">✕</span>');
      }
    });
    card.querySelector(".question-mark").textContent = answer.answer;
    const status = card.querySelector("#answer-status");
    status.classList.add(answer.correct ? "status-correct" : "status-incorrect");
    status.textContent = (answer.correct ? "✓ Браво! " : "✕ Не съвсем. ") + equationText(answer) + (lastQuestion ? " · След малко: твоят резултат!" : " · Следва нова задача…");
    const steps = card.querySelectorAll(".progress-step");
    const step = steps[session.answers.length - 1];
    step.classList.remove("is-current");
    step.classList.add(answer.correct ? "is-correct" : "is-incorrect");
    card.querySelector(".progress-track").setAttribute("aria-label", `Решени ${session.answers.length} от ${QUESTION_COUNT} задачи`);
    feedbackTimeout = window.setTimeout(() => {
      feedbackTimeout = null;
      card.classList.remove("flash-correct", "flash-incorrect");
      if (phase !== "feedback") return;
      if (lastQuestion) renderResults();
      else renderQuestion();
    }, answer.correct ? 1500 : 2600);
  }

  function renderResults() {
    phase = "results";
    stopTimer();
    const results = getResults(session);
    const score = getScore(session);
    if (!session.recorded) {
      progress = recordLevel(progress, session);
      rankings.push({points:score.points,correct:results.correct,seconds:results.elapsedSeconds,levelId:session.levelId || null,operation:session.settings.operation});
      rankings.sort((a,b)=>b.points-a.points || b.correct-a.correct || a.seconds-b.seconds);
      rankings = rankings.slice(0,50);
      saveProgress();
      session.recorded = true;
    }
    const title = results.correct === QUESTION_COUNT ? "Уау, всичко е вярно!" : "Браво, справи се!";
    const message = results.correct === QUESTION_COUNT
      ? "Десет задачи, десет верни отговора. Имаш повод за голяма усмивка!"
      : results.correct >= 5
        ? "Всяка решена задача те прави по-добър. Да опитаме ли още веднъж?"
        : "Вече направи важната стъпка — опита! С всяка игра ще става по-лесно.";
    card.innerHTML = `<div class="game-top results-top"><span class="game-badge">${icon("check")} ИГРАТА Е ЗАВЪРШЕНА</span><span class="game-meta">${operationLabel(session.settings.operation)} · ${session.settings.min}–${session.settings.max}</span></div>
      <div class="results-body"><div class="animal-reward"><img src="assets/${score.reward.file}.svg" alt="${score.reward.name}" width="180" height="160"><p class="reward-name">Твоята награда: ${score.reward.name}</p></div><div class="points-total">${score.points}<small> / 100 точки</small></div><h2 id="results-title" tabindex="-1">${title}</h2><p class="results-message">${score.reward.message}</p><p class="score-explanation">Верните отговори носят до 95 точки, а бързината — до 5. Не бързай за сметка на верния отговор!</p>
        <div class="result-stats"><div class="result-stat"><strong>${results.correct} <small>/ ${QUESTION_COUNT}</small></strong><span>верни отговора</span></div><div class="result-stat"><strong>${timeText(results)}</strong><span>време за решаване</span></div></div>
        <p class="level-outcome">${session.levelId ? (results.correct >= PASS_COUNT ? "✓ Ниво " + session.levelId + " е преминато! " + (session.levelId < 20 ? "Следващото ниво е отключено." : "Поздравления! Премина всички 20 нива!") : "Още малко! За преминаване са нужни " + PASS_COUNT + " верни отговора.") : "Свободна тренировка — браво за усилието!"}</p><div class="result-actions"><button class="primary-button" type="button" id="replay-button">${icon("refresh")} Още една игра</button><button class="secondary-button" type="button" id="change-settings">${icon("sliders")} Към нивата и настройките</button></div>
        <details class="reward-guide"><summary>Всички животни и точки</summary><div class="reward-categories">${REWARDS.map((reward, i) => `<div><img src="assets/${reward.file}.svg" alt="" width="60" height="54"><strong>${reward.name}</strong><span>${reward.min}–${i === 0 ? 100 : REWARDS[i - 1].min - 1} точки</span></div>`).join("")}</div><p>Бонусът за бързина се дава само за верни отговори: пълен до 5 секунди за задача и постепенно намалява до 0 при 20 секунди. Времето между задачите не влияе.</p></details><details class="results-review"><summary>Виж всички решения</summary><ol class="review-list">${session.answers.map((answer, index) => `<li class="${answer.correct ? "" : "review-incorrect"}"><span class="review-number">${index + 1}.</span><span aria-hidden="true">${answer.correct ? "✓" : "↗"}</span><span class="review-equation">${equationText(answer)}</span><span class="review-answer">${answer.correct ? "Вярно" : `Твоят отговор: ${answer.given}`}</span></li>`).join("")}</ol></details>
      </div>`;
    document.querySelector("#replay-button").addEventListener("click", () => startSession(session.settings, session.levelId || null));
    document.querySelector("#change-settings").addEventListener("click", () => {
      session = null;
      selectedLevel = unlockedLevel(progress);
      renderWelcome(true);
    });
    if (session.levelId && results.correct >= PASS_COUNT && session.levelId < 20) {
      const next = document.createElement("button"); next.type="button"; next.className="primary-button"; next.textContent="Следващо ниво →"; next.addEventListener("click",()=>startSession(null,session.levelId+1)); card.querySelector(".result-actions").prepend(next);
    }
    document.querySelector("#results-title").focus();
  }

  function stopTimer() {
    if (timerId !== null) window.clearInterval(timerId);
    timerId = null;
  }

  function startSession(settings, levelId = null) {
    stopTimer();
    if (feedbackTimeout !== null) window.clearTimeout(feedbackTimeout);
    feedbackTimeout = null;
    card.classList.remove("flash-correct", "flash-incorrect");
    session = levelId ? createLevelSession(levelId, progress) : createSession(settings);
    homeControls.hidden = true;
    settingsPanel.hidden = true;
    document.body.classList.add("is-playing");
    enterFullscreen();
    setLocked(true);
    settingsError.hidden = true;
    try { if (!levelId) localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
    renderQuestion();
    timerId = window.setInterval(() => {
      const timer = document.querySelector("#timer");
      if (timer) timer.textContent = clockText(getResults(session));
    }, 250);
    card.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (phase !== "welcome") return;
    try {
      startSession(readSettings());
    } catch (error) {
      settingsError.textContent = error.message;
      settingsError.hidden = false;
      settingsForm.elements.min.focus();
    }
  });
  settingsForm.addEventListener("input", () => { settingsError.hidden = true; });

  card.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-sound-toggle]");
    if (!toggle) return;
    soundEnabled = !soundEnabled;
    toggle.setAttribute("aria-pressed", String(soundEnabled));
    toggle.setAttribute("aria-label", soundEnabled ? "Изключи звука" : "Включи звука");
    toggle.textContent = soundEnabled ? "Звук: вкл." : "Звук: изкл.";
  });

  document.querySelector("#mode-levels").addEventListener("click",()=>{homeMode="levels";renderWelcome();});
  document.querySelector("#mode-custom").addEventListener("click",()=>{homeMode="custom";renderWelcome();});
  document.querySelector("#home-button").addEventListener("click",()=>{
    if ((phase==="question" || phase==="feedback") && !window.confirm("Да прекратим ли тази игра и да се върнем в началото?")) return;
    selectedLevel=unlockedLevel(progress);renderWelcome(true);
  });
  document.querySelector("#fullscreen-button").addEventListener("click",()=>{
    if(document.fullscreenElement) Promise.resolve(document.exitFullscreen()).catch(showScreenHint);
    else enterFullscreen();
  });
  if (/^https?:$/.test(window.location?.protocol || "")) {
    const manifest = document.createElement("link"); manifest.rel="manifest"; manifest.href="manifest.webmanifest"; document.head.append(manifest);
  }
  document.querySelector(".brand").addEventListener("click",event=>{event.preventDefault();document.querySelector("#home-button").click();});
  restoreSettings();
  renderWelcome();
})();
