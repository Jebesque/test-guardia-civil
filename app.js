(() => {
  const data = window.GC_QUIZ_DATA;
  const questions = data.questions;
  const meta = data.meta;

  const els = {
    setupScreen: document.getElementById('setupScreen'),
    quizScreen: document.getElementById('quizScreen'),
    resultScreen: document.getElementById('resultScreen'),
    totalQuestions: document.getElementById('totalQuestions'),
    totalThemes: document.getElementById('totalThemes'),
    mistakeCount: document.getElementById('mistakeCount'),
    themeChips: document.getElementById('themeChips'),
    selectAllThemes: document.getElementById('selectAllThemes'),
    clearThemes: document.getElementById('clearThemes'),
    modeSelect: document.getElementById('modeSelect'),
    modeHint: document.getElementById('modeHint'),
    questionCount: document.getElementById('questionCount'),
    startBtn: document.getElementById('startBtn'),
    startMistakesBtn: document.getElementById('startMistakesBtn'),
    examHistory: document.getElementById('examHistory'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    progressText: document.getElementById('progressText'),
    scoreLive: document.getElementById('scoreLive'),
    progressBar: document.getElementById('progressBar'),
    themeBadge: document.getElementById('themeBadge'),
    questionBadge: document.getElementById('questionBadge'),
    questionText: document.getElementById('questionText'),
    optionsList: document.getElementById('optionsList'),
    feedbackBox: document.getElementById('feedbackBox'),
    bookmarkBtn: document.getElementById('bookmarkBtn'),
    nextBtn: document.getElementById('nextBtn'),
    finalScore: document.getElementById('finalScore'),
    finalPercent: document.getElementById('finalPercent'),
    finalMistakes: document.getElementById('finalMistakes'),
    retryWrongBtn: document.getElementById('retryWrongBtn'),
    backHomeBtn: document.getElementById('backHomeBtn'),
    wrongList: document.getElementById('wrongList'),
    installBtn: document.getElementById('installBtn'),
  };

  const STORAGE_KEYS = {
    deviceId: 'gcQuizDeviceId',
    mistakes: 'gcQuizMistakes',
    bookmarks: 'gcQuizBookmarks',
    stats: 'gcQuizStats',
    examHistory: 'gcQuizExamHistory'
  };

  const generateDeviceId = () => {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `device-${Date.now().toString(36)}-${randomPart}`;
  };

  const getDeviceId = () => {
    const existing = localStorage.getItem(STORAGE_KEYS.deviceId);
    if (existing) return existing;
    const created = generateDeviceId();
    localStorage.setItem(STORAGE_KEYS.deviceId, created);
    return created;
  };

  const deviceId = getDeviceId();
  const scopedKey = (key) => `${key}:${deviceId}`;

  let deferredPrompt = null;
  let selectedThemes = new Set(meta.themes.map(t => t.id));
  let mode = 'exam';
  let session = null;

  const shuffle = arr => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const saveJSON = (key, value) => localStorage.setItem(scopedKey(key), JSON.stringify(value));
  const loadJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(scopedKey(key));
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const getMistakes = () => loadJSON(STORAGE_KEYS.mistakes, []);
  const setMistakes = (ids) => saveJSON(STORAGE_KEYS.mistakes, Array.from(new Set(ids)));
  const getBookmarks = () => loadJSON(STORAGE_KEYS.bookmarks, []);
  const setBookmarks = (ids) => saveJSON(STORAGE_KEYS.bookmarks, Array.from(new Set(ids)));
  const getStats = () => loadJSON(STORAGE_KEYS.stats, { played: 0, correct: 0, wrong: 0 });
  const getExamHistory = () => loadJSON(STORAGE_KEYS.examHistory, []);
  const setExamHistory = (history) => saveJSON(STORAGE_KEYS.examHistory, history.slice(0, 30));

  function updateTopStats() {
    els.totalQuestions.textContent = meta.totalQuestions;
    els.totalThemes.textContent = meta.themes.length;
    els.mistakeCount.textContent = getMistakes().length;
    renderExamHistory();
  }


  function modeLabel(value) {
    const labels = {
      exam: 'Examen',
      random: 'Aleatorio',
      mistakes: 'Fallos'
    };
    return labels[value] || value;
  }

  function explainAnswer(item, selectedLetter, isCorrect) {
    if (item.explanation) return item.explanation;
    const correctText = item.options[item.correct] || 'No disponible';
    const selectedText = item.options[selectedLetter] || 'No disponible';
    if (isCorrect) {
      return `La opción ${item.correct} es la adecuada porque coincide con el enunciado: ${correctText}`;
    }
    return `La opción ${item.correct} es correcta porque ${correctText}. Tu elección (${selectedLetter}: ${selectedText}) no encaja con lo que pide la pregunta.`;
  }

  function renderExamHistory() {
    if (!els.examHistory) return;
    const history = getExamHistory();
    els.examHistory.innerHTML = '';
    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'review-item small';
      empty.textContent = 'Aún no has hecho exámenes en este móvil.';
      els.examHistory.appendChild(empty);
      return;
    }

    history.slice(0, 5).forEach(entry => {
      const div = document.createElement('div');
      div.className = 'review-item';
      div.innerHTML = `
        <div><strong>${entry.dateText}</strong></div>
        <div class="small" style="margin-top:6px">Modo: ${modeLabel(entry.mode)} · Resultado: ${entry.correct}/${entry.total} (${entry.percent}%) · Fallos: ${entry.wrong}</div>
      `;
      els.examHistory.appendChild(div);
    });
  }

  function renderThemeChips() {
    els.themeChips.innerHTML = '';
    meta.themes.forEach(theme => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (selectedThemes.has(theme.id) ? ' active' : '');
      chip.textContent = `Tema ${theme.id} (${theme.count})`;
      chip.title = theme.title;
      chip.onclick = () => {
        if (selectedThemes.has(theme.id)) selectedThemes.delete(theme.id);
        else selectedThemes.add(theme.id);
        renderThemeChips();
        syncQuestionCount();
      };
      els.themeChips.appendChild(chip);
    });
  }

  function currentPool() {
    const base = questions.filter(q => selectedThemes.has(q.themeId));
    if (mode === 'mistakes') {
      const ids = new Set(getMistakes());
      return base.filter(q => ids.has(q.id));
    }
    return base;
  }

  function syncQuestionCount() {
    const pool = currentPool();
    if (mode === 'exam') els.questionCount.value = pool.length || '';
    if (mode === 'random') els.questionCount.value = Math.min(20, pool.length) || '';
    if (mode === 'mistakes') els.questionCount.value = pool.length || '';
    updateTopStats();
  }

  function setMode(newMode) {
    mode = newMode;
    [...els.modeSelect.querySelectorAll('button')].forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === newMode);
    });
    const hints = {
      exam: 'Recorre las preguntas elegidas en orden y muestra el resultado al final.',
      random: 'Mezcla preguntas de los temas seleccionados.',
      mistakes: 'Solo repasa las preguntas que has fallado anteriormente.'
    };
    els.modeHint.textContent = hints[newMode];
    syncQuestionCount();
  }

  function buildSession() {
    let pool = currentPool();
    if (!pool.length) {
      alert(mode === 'mistakes' ? 'No tienes fallos guardados todavía.' : 'Selecciona al menos un tema con preguntas.');
      return null;
    }

    let count = parseInt(els.questionCount.value, 10);
    if (!count || count < 1) count = pool.length;
    if (count > pool.length) count = pool.length;

    if (mode === 'random' || mode === 'mistakes') pool = shuffle(pool);
    if (mode === 'exam') pool = [...pool].sort((a,b) => a.themeId - b.themeId || a.number - b.number);
    pool = pool.slice(0, count);

    return {
      items: pool,
      index: 0,
      answers: [],
      correct: 0,
      wrongIds: [],
      currentSelected: null,
      currentBookmarked: false
    };
  }

  function show(screen) {
    els.setupScreen.classList.add('hidden');
    els.quizScreen.classList.add('hidden');
    els.resultScreen.classList.add('hidden');
    screen.classList.remove('hidden');
  }

  function renderQuestion() {
    const item = session.items[session.index];
    const progress = ((session.index) / session.items.length) * 100;

    els.progressText.textContent = `Pregunta ${session.index + 1}/${session.items.length}`;
    els.scoreLive.textContent = `${session.correct} aciertos`;
    els.progressBar.style.width = `${progress}%`;
    els.themeBadge.textContent = `Tema ${item.themeId}`;
    els.questionBadge.textContent = `Pregunta ${item.number}`;
    els.questionText.textContent = item.question;
    els.optionsList.innerHTML = '';
    els.feedbackBox.className = 'feedback hidden';
    els.feedbackBox.textContent = '';
    els.nextBtn.disabled = true;
    session.currentSelected = null;

    const optionEntries = Object.entries(item.options);
    optionEntries.forEach(([letter, text]) => {
      const btn = document.createElement('button');
      btn.className = 'option';
      btn.innerHTML = `<span class="letter">${letter}</span><span>${text}</span>`;
      btn.onclick = () => selectOption(letter);
      btn.dataset.letter = letter;
      els.optionsList.appendChild(btn);
    });

    const bookmarks = new Set(getBookmarks());
    session.currentBookmarked = bookmarks.has(item.id);
    els.bookmarkBtn.textContent = session.currentBookmarked ? 'Quitar marca' : 'Marcar para repasar';
  }

  function selectOption(letter) {
    if (session.currentSelected) return;

    const item = session.items[session.index];
    session.currentSelected = letter;

    const isCorrect = letter === item.correct;
    if (isCorrect) session.correct += 1;
    else session.wrongIds.push(item.id);

    session.answers.push({
      id: item.id,
      selected: letter,
      correct: item.correct,
      isCorrect
    });

    const stats = getStats();
    stats.played += 1;
    if (isCorrect) stats.correct += 1;
    else stats.wrong += 1;
    saveJSON(STORAGE_KEYS.stats, stats);

    const mistakes = new Set(getMistakes());
    if (isCorrect) mistakes.delete(item.id);
    else mistakes.add(item.id);
    setMistakes([...mistakes]);

    [...els.optionsList.children].forEach(node => {
      const nodeLetter = node.dataset.letter;
      if (nodeLetter === item.correct) node.classList.add('correct');
      if (nodeLetter === letter && nodeLetter !== item.correct) node.classList.add('wrong');
      node.disabled = true;
    });

    const explanation = explainAnswer(item, letter, isCorrect);
    els.feedbackBox.className = 'feedback ' + (isCorrect ? 'good' : 'bad');
    els.feedbackBox.innerHTML = isCorrect
      ? `Correcta. Respuesta: ${item.correct}.<span class="feedback-expl">${explanation}</span>`
      : `Incorrecta. La correcta es ${item.correct}.<span class="feedback-expl">${explanation}</span>`;
    els.nextBtn.disabled = false;
    els.scoreLive.textContent = `${session.correct} aciertos`;
    updateTopStats();
  }

  function nextQuestion() {
    if (!session.currentSelected) return;
    session.index += 1;
    if (session.index >= session.items.length) {
      showResults();
      return;
    }
    renderQuestion();
  }

  function showResults() {
    const total = session.items.length;
    const wrong = total - session.correct;
    const percent = total ? Math.round((session.correct / total) * 100) : 0;

    els.finalScore.textContent = `${session.correct}/${total}`;
    els.finalPercent.textContent = `${percent}%`;
    els.finalMistakes.textContent = wrong;
    els.wrongList.innerHTML = '';

    const history = getExamHistory();
    const now = new Date();
    history.unshift({
      at: now.toISOString(),
      dateText: now.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
      mode,
      total,
      correct: session.correct,
      wrong,
      percent
    });
    setExamHistory(history);

    const wrongItems = session.items.filter(item => session.wrongIds.includes(item.id));
    if (!wrongItems.length) {
      const div = document.createElement('div');
      div.className = 'review-item';
      div.textContent = 'No has fallado ninguna. Buen trabajo.';
      els.wrongList.appendChild(div);
    } else {
      wrongItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'review-item';
        div.innerHTML = `
          <div><strong>Tema ${item.themeId} - Pregunta ${item.number}</strong></div>
          <div class="small" style="margin-top:6px">${item.question}</div>
          <div class="small" style="margin-top:8px">Correcta: ${item.correct} - ${item.options[item.correct] || ''}</div>
        `;
        els.wrongList.appendChild(div);
      });
    }
    show(els.resultScreen);
    updateTopStats();
  }

  function startQuiz(forceMistakes = false) {
    if (forceMistakes) setMode('mistakes');
    session = buildSession();
    if (!session) return;
    show(els.quizScreen);
    renderQuestion();
  }

  function toggleBookmark() {
    if (!session) return;
    const item = session.items[session.index];
    const bookmarks = new Set(getBookmarks());
    if (bookmarks.has(item.id)) bookmarks.delete(item.id);
    else bookmarks.add(item.id);
    setBookmarks([...bookmarks]);
    session.currentBookmarked = bookmarks.has(item.id);
    els.bookmarkBtn.textContent = session.currentBookmarked ? 'Quitar marca' : 'Marcar para repasar';
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    els.installBtn.hidden = false;
  });

  els.installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    els.installBtn.hidden = true;
  });

  els.selectAllThemes.onclick = () => {
    selectedThemes = new Set(meta.themes.map(t => t.id));
    renderThemeChips();
    syncQuestionCount();
  };

  els.clearThemes.onclick = () => {
    selectedThemes = new Set();
    renderThemeChips();
    syncQuestionCount();
  };

  [...els.modeSelect.querySelectorAll('button')].forEach(btn => {
    btn.onclick = () => setMode(btn.dataset.mode);
  });

  els.startBtn.onclick = () => startQuiz(false);
  els.startMistakesBtn.onclick = () => startQuiz(true);
  els.nextBtn.onclick = nextQuestion;
  els.retryWrongBtn.onclick = () => startQuiz(true);
  els.backHomeBtn.onclick = () => show(els.setupScreen);
  els.bookmarkBtn.onclick = toggleBookmark;
  els.clearHistoryBtn.onclick = () => {
    localStorage.removeItem(scopedKey(STORAGE_KEYS.examHistory));
    renderExamHistory();
  };

  renderThemeChips();
  updateTopStats();
  syncQuestionCount();
  registerSW();
})();