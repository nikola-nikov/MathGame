(function () {
  "use strict";

  const { QUESTION_COUNT, generateChoices, getScore, REWARDS, validateSettings, createSession, submitAnswer, getResults } = window.MathGame;
  const { getLevel, visibleLevels, unlockedLevel, createLevelSession, recordLevel, readProgress, recoverProgress } = window.Campaign;
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
  let resultTimeout = null;
  let audioContext = null;
  let soundEnabled = true;
  let jungleVoices = [];
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
  rankings = Array.isArray(savedRankings) ? savedRankings.filter(r => r && Number.isInteger(r.points) && r.points >= 0 && r.points <= 100 && Number.isInteger(r.correct) && r.correct >= 0 && r.correct <= 10 && Number.isInteger(r.seconds) && r.seconds >= 0 && ["+", "-", "mixed"].includes(r.operation) && (r.levelId === null || Number.isSafeInteger(r.levelId) && r.levelId >= 1)).slice(0, 50) : [];
  progress = recoverProgress(progress, rankings);
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
    if (resultTimeout !== null) window.clearTimeout(resultTimeout);
    resultTimeout = null;
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

function renderWelcome(focus = false, awardedLevel = null) {
 document.body.dataset.screen = homeMode === "levels" ? "levels" : "custom";
 document.body.classList.remove("is-playing");
 phase='welcome';stopTimer();cancelFeedback();setLocked(false);homeControls.hidden=false;settingsPanel.hidden=homeMode!=='custom';
 document.querySelector('#mode-levels').setAttribute('aria-pressed',String(homeMode==='levels'));document.querySelector('#mode-custom').setAttribute('aria-pressed',String(homeMode==='custom'));
 const next=unlockedLevel(progress), completed=Object.values(progress).filter(record=>record.passed).length;if(selectedLevel>next)selectedLevel=next;const level=getLevel(selectedLevel);
 card.innerHTML=`<div class="home-body"><div class="home-intro"><div><p class="eyebrow">${homeMode==='levels'?completed+' ПРЕМИНАТИ НИВА':'ТИ ИЗБИРАШ ЗАДАЧИТЕ'}</p><h2>${homeMode==='levels'?'Една стъпка по-нагоре!':'Да потренираме!'}</h2></div><img src="assets/lion.svg" alt="" width="82" height="72"></div><div class="home-actions"><button class="primary-button" type="button" id="start-button">Играя</button><button class="secondary-button" type="button" id="rankings-button" aria-label="Класация" title="Класация"><img src="assets/podium.svg" alt="" width="92" height="48"></button></div>${homeMode==='levels'?`<p class="level-summary">Ниво ${level.id} · резултати до ${level.max} · ${10-level.subtractionCount} събирания и ${level.subtractionCount} изваждания</p><div class="levels-grid" role="group" aria-label="Избери ниво">${visibleLevels(progress).map(item=>{const record=progress[item.id],locked=item.id>next,reward=record?REWARDS.find(r=>record.points>=r.min):null;return `<button type="button" class="level-tile${item.id === awardedLevel ? " reward-arrival" : ""} ${record?.passed?'level-passed':''} ${item.id===selectedLevel?'level-selected':''}" data-level="${item.id}" aria-pressed="${item.id===selectedLevel}" aria-label="Ниво ${item.id}, ${locked?'заключено':record?.passed?'преминато, '+record.points+' точки, '+reward.name:'достъпно'}" ${locked?'disabled':''}><strong>${item.id}</strong>${record?.passed?`<img class="level-animal" src="assets/${reward.file}.svg" alt="Най-добро животно: ${reward.name}" title="${reward.name} · ${record.points} точки" width="44" height="38">`:`<span class="level-state">${locked?'🔒':'Играй'}</span>`}</button>`;}).join('')}</div><p class="home-help">Завърши 10-те задачи, за да отключиш следващото ниво. Зелените нива могат да се играят отново за по-добро животно.</p>`:'<p class="home-help">10 задачи според твоите настройки. Избери числата и операциите по-горе.</p>'}<p class="storage-note">${storageAvailable?'Напредъкът и класацията се пазят на това устройство.':'Запазването е недостъпно. Напредъкът остава само до затваряне на страницата.'}</p></div>`;
 card.querySelector('#start-button').addEventListener('click',()=>{if(homeMode==='levels')startSession(null,selectedLevel);else settingsForm.requestSubmit();});
 card.querySelector('#rankings-button').addEventListener('click',renderRankings);
 card.querySelectorAll('[data-level]').forEach(button=>button.addEventListener('click',()=>{const id=Number(button.dataset.level);if(id>unlockedLevel(progress))return;selectedLevel=id;renderWelcome();card.querySelector('[data-level="'+id+'"]').focus();}));
 if(focus)card.querySelector('#start-button').focus();
}
function renderRankings(){document.body.dataset.screen='rankings';phase='rankings';homeControls.hidden=true;settingsPanel.hidden=true;const sorted=rankings.slice().sort((a,b)=>b.points-a.points||b.correct-a.correct||a.seconds-b.seconds).slice(0,20);card.innerHTML=`<div class="home-body"><p class="eyebrow">НА ТОВА УСТРОЙСТВО</p><h2 tabindex="-1" id="rankings-title">Класация</h2><p class="home-help">Твоите 20 най-добри игри. При равни точки и верни отговори по-бързото време е напред.</p>${sorted.length?'<ol class="ranking-list">'+sorted.map((r,i)=>`<li><strong>${i+1}</strong><img src="assets/${REWARDS.find(reward=>r.points>=reward.min).file}.svg" alt="" width="44" height="40"><div><b>${r.levelId?'Ниво '+r.levelId:'По избор · '+operationLabel(r.operation)}</b><span>${r.correct}/10 верни · ${Math.floor(r.seconds/60)} мин ${r.seconds%60} сек</span></div><strong>${r.points}<small> т.</small></strong></li>`).join('')+'</ol>':'<div class="empty-ranking"><img src="assets/rabbit.svg" alt="Зайче" width="140" height="120"><p>Твоето първо постижение те очаква!</p></div>'}<button class="primary-button" type="button" id="back-home">Към играта ${icon('arrow')}</button></div>`;card.querySelector('#back-home').addEventListener('click',()=>renderWelcome(true));card.querySelector('#rankings-title').focus();}
  function progressMarkup(currentIndex) {
    return `<div class="progress-track" role="img" aria-label="Решени ${session.answers.length} от ${QUESTION_COUNT} задачи">${session.questions.map((_, index) => {
      const answer = session.answers[index];
      const status = answer ? (answer.correct ? "is-correct" : "is-incorrect") : index === currentIndex ? "is-current" : "";
      return `<span class="progress-step ${status}"></span>`;
    }).join("")}</div>`;
  }

  function gameTop(index) {
    return `<div class="game-top quiz-top"><span class="game-badge">${session.levelId ? "Ниво " + session.levelId + " · " : ""}${index + 1} / ${QUESTION_COUNT}</span><div class="timer-display"><span class="timer-caption">ВРЕМЕ</span><span id="timer" role="timer" aria-label="Изминало време">${clockText(getResults(session))}</span></div><button class="sound-toggle" type="button" data-sound-toggle aria-pressed="${soundEnabled}" aria-label="${soundEnabled ? "Изключи звука" : "Включи звука"}">${soundEnabled ? "Звук: вкл." : "Звук: изкл."}</button></div>${progressMarkup(index)}`;
  }

  function renderQuestion() {
    phase = "question";
    document.body.dataset.screen = "question";
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
    if (session.finishedAt !== null) {
      stopTimer();
      recordFinishedSession();
    }
    playFeedback(session.answers[session.answers.length - 1].correct);
    renderFeedback();
  }

  function stopJungleSound() {
    for (const oscillator of jungleVoices) { try { oscillator.stop(); } catch {} }
    jungleVoices = [];
  }

  function playJungleSound(animal = "welcome") {
    if (!soundEnabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audioContext) audioContext = new Audio();
      const context = audioContext;
      const play = () => {
        if (context.state !== "running") return;
        stopJungleSound();
        // Soft cartoon calls: monkey-like hoots, bird chirps and an elephant flourish.
        const calls = {
          lion: [[0,160,75,.3,"triangle"],[.3,130,65,.35,"triangle"],[.7,220,110,.3,"triangle"]],
          elephant: [[0,210,650,.35,"sawtooth"],[.38,430,200,.3,"triangle"],[.75,300,520,.35,"triangle"]],
          dolphin: [[0,900,1600,.15,"sine"],[.2,1100,750,.16,"sine"],[.45,1000,1700,.22,"sine"]],
          fox: [[0,440,740,.13,"triangle"],[.18,660,880,.13,"triangle"],[.4,520,260,.25,"sine"]],
          rabbit: [[0,500,900,.14,"sine"],[.22,600,1100,.14,"sine"],[.46,700,1300,.18,"sine"]],
          turtle: [[0,220,165,.3,"sine"],[.36,196,146,.35,"sine"],[.78,262,330,.25,"sine"]],
          welcome: [[0,230,150,.17,"triangle"],[.2,260,170,.17,"triangle"],[.44,420,580,.16,"triangle"],[.65,520,340,.17,"triangle"],[.87,650,310,.22,"triangle"],[1.15,260,175,.22,"triangle"]]
        };
        const now = context.currentTime;
        for (const [offset, from, to, duration, type] of calls[animal] || calls.welcome) {
          const oscillator = context.createOscillator(), gain = context.createGain();
          const begin = now + offset;
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(from, begin);
          oscillator.frequency.exponentialRampToValueAtTime(to, begin + duration);
          gain.gain.setValueAtTime(0, begin);
          gain.gain.linearRampToValueAtTime(type === "sawtooth" ? 0.035 : 0.09, begin + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, begin + duration);
          oscillator.connect(gain); gain.connect(context.destination);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          jungleVoices.push(oscillator);
          oscillator.start(begin); oscillator.stop(begin + duration + 0.02);
        }
      };
      if (context.state === "suspended") context.resume().then(play).catch(() => {});
      else play();
    } catch { /* Play remains available when sound is unsupported or blocked. */ }
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
    }, answer.correct ? 750 : 1300);
  }

  function recordFinishedSession() {
    if (!session || session.recorded || session.finishedAt === null || session.answers.length !== QUESTION_COUNT) return;
    const results = getResults(session);
    const score = getScore(session);
    progress = recordLevel(progress, session);
    rankings.push({points:score.points,correct:results.correct,seconds:results.elapsedSeconds,levelId:session.levelId || null,operation:session.settings.operation});
    rankings.sort((a,b)=>b.points-a.points || b.correct-a.correct || a.seconds-b.seconds);
    rankings = rankings.slice(0,50);
    saveProgress();
    session.recorded = true;
  }

  function confettiMarkup() {
    const colors = ["#e8b64d", "#4b9868", "#f3cf75", "#83b9a0", "#df8b55"];
    return '<div class="confetti" aria-hidden="true">' + Array.from({length: 42}, (_, i) => '<span style="--x:' + ((i * 37) % 101) + '%;--delay:' + ((i * 71) % 600) + 'ms;--drift:' + (((i * 29) % 140) - 70) + 'px;--spin:' + (180 + (i * 53) % 540) + 'deg;--color:' + colors[i % colors.length] + '"></span>').join("") + '</div>';
  }

  function finishResults() {
    if (phase !== "results") return;
    const finishedLevel = session.levelId || null;
    if (finishedLevel) homeMode = "levels";
    selectedLevel = unlockedLevel(progress);
    session = null;
    renderWelcome(true, finishedLevel);
    if (finishedLevel) card.querySelector('[data-level="' + finishedLevel + '"]')?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  function renderResults() {
    phase = "results";
    document.body.dataset.screen = "results";
    stopTimer();
    recordFinishedSession();
    const score = getScore(session);
    card.innerHTML = `${score.reward.file === "lion" ? confettiMarkup() : ""}<section class="reward-screen" aria-labelledby="results-title"><img class="earned-animal" src="assets/${score.reward.file}.svg" alt="${score.reward.name}" width="240" height="210"><h2 class="earned-points" id="results-title" tabindex="-1">${score.points}<span>точки</span></h2><p class="earned-name">${score.reward.name}</p></section>`;
    document.querySelector("#results-title").focus();
    resultTimeout = window.setTimeout(() => { resultTimeout = null; finishResults(); }, 2800);
  }

  function stopTimer() {
    if (timerId !== null) window.clearInterval(timerId);
    timerId = null;
  }

  function startSession(settings, levelId = null) {
    if (resultTimeout !== null) window.clearTimeout(resultTimeout);
    resultTimeout = null;
    stopTimer();
    if (feedbackTimeout !== null) window.clearTimeout(feedbackTimeout);
    feedbackTimeout = null;
    card.classList.remove("flash-correct", "flash-incorrect");
    session = levelId ? createLevelSession(levelId, progress) : createSession(settings);
    homeControls.hidden = true;
    settingsPanel.hidden = true;
    playJungleSound();
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
    if (!soundEnabled) stopJungleSound();
    toggle.setAttribute("aria-pressed", String(soundEnabled));
    toggle.setAttribute("aria-label", soundEnabled ? "Изключи звука" : "Включи звука");
    toggle.textContent = soundEnabled ? "Звук: вкл." : "Звук: изкл.";
  });

  document.querySelector("#reset-button").addEventListener("click", () => {
    if (!window.confirm("Да започнем ли отначало? Всички преминати нива, спечелени животни, класацията и настройките ще бъдат изтрити на това устройство.")) return;
    stopTimer();
    cancelFeedback();
    stopJungleSound();
    if (animalTimeout !== null) window.clearTimeout(animalTimeout);
    animalTimeout = null;
    if (dancingAnimal) dancingAnimal.classList.remove("animal-dancing");
    dancingAnimal = null;
    session = null;
    progress = {};
    rankings = [];
    homeMode = "levels";
    selectedLevel = 1;
    settingsForm.elements.min.value = 0;
    settingsForm.elements.max.value = 10;
    settingsForm.elements.operation.value = "+";
    settingsError.hidden = true;
    document.querySelector("#animal-joke").textContent = "";
    let failed = false;
    for (const key of [storageKey, "smetni.progress.v1", "smetni.rankings.v1"]) {
      try { localStorage.removeItem(key); } catch { failed = true; }
    }
    storageAvailable = !failed;
    renderWelcome(true);
    if (failed) window.alert("Играта е нулирана за тази сесия, но браузърът не разрешава изтриване на запазените данни. При презареждане старият напредък може да се върне.");
  });

  document.querySelector("#mode-levels").addEventListener("click",()=>{homeMode="levels";renderWelcome();});
  document.querySelector("#mode-custom").addEventListener("click",()=>{homeMode="custom";renderWelcome();});
  document.querySelector("#home-button").addEventListener("click",()=>{
    if (phase === "results") { finishResults(); return; }
    if ((phase==="question" || phase==="feedback") && session?.finishedAt === null && !window.confirm("Да прекратим ли тази игра и да се върнем в началото?")) return;
    recordFinishedSession();
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
  const animalLines = {
    lion: "Лъвът: Ррр… кой скри моите числа?",
    elephant: "Слонът: С хобот смятам по-добре!",
    dolphin: "Делфинът: Пльос! Още една вълна от задачи!",
    fox: "Лисицата: Хитро, нали? Аз пак опитвам!",
    rabbit: "Зайчето: Скок-подскок, числата са тук!",
    turtle: "Костенурката: Бавно, славно… и с усмивка!"
  };
  let dancingAnimal = null, animalTimeout = null;
  document.querySelector("#jungle-animals").addEventListener("click", event => {
    const button = event.target.closest("[data-animal]");
    if (!button || !animalLines[button.dataset.animal]) return;
    if (animalTimeout !== null) window.clearTimeout(animalTimeout);
    if (dancingAnimal) dancingAnimal.classList.remove("animal-dancing");
    button.classList.remove("animal-dancing");
    void button.offsetWidth;
    button.classList.add("animal-dancing");
    dancingAnimal = button;
    document.querySelector("#animal-joke").textContent = animalLines[button.dataset.animal];
    playJungleSound(button.dataset.animal);
    animalTimeout = window.setTimeout(() => { button.classList.remove("animal-dancing"); dancingAnimal = null; animalTimeout = null; }, 1400);
  });
  restoreSettings();
  renderWelcome();
})();
