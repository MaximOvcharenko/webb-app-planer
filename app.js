(() => {
  'use strict';

  // --- КЛЮЧИ ХРАНИЛИЩА ---
  const STORAGE_KEYS = {
    SITES: 'geojournal_sites_v1',
    TAGS: 'geojournal_tags_v1',
    ENTRIES: 'geojournal_entries_v1',
    TIMER: 'geojournal_active_timer_v1',
    THEME: 'geojournal_theme_v1'
  };

  const DEFAULT_TAGS = [
    'Tartunnatей',
    'Väliseinät',
    'Antura',
    'PV seinät',
    'Katto krs ',
    'Weld',
    'Kaivot',
    'Tarket',
    'Alakatto',
    'Parvekkeet',
    'Korko',
    'Lattia korko',
    'Talo nurkka',
  ];

  // --- СОСТОЯНИЕ ПРИЛОЖЕНИЯ ---
  let sites = [];
  let tags = [];
  let entries = [];
  let activeTimer = {
    isRunning: false,
    startTimestamp: null,
    selectedSiteId: '',
    selectedTags: [],
    note: ''
  };

  // Текущее состояние формы записи
  let currentWorkMode = 'timer'; // 'timer' | 'manual'
  let manualSubMode = 'duration'; // 'duration' | 'interval'
  let selectedSiteId = '';
  let selectedTags = [];

  // Текущее состояние фильтров журнала
  let currentPeriod = 'week'; // 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'
  let currentFilterSiteId = 'all';
  let reportGroupBy = 'date'; // 'date' | 'site'

  // Состояние модального окна записи
  let modalMode = 'edit'; // 'edit' | 'finish-timer'
  let modalSelectedTags = [];

  let timerIntervalId = null;
  let toastTimeoutId = null;

  // --- УТИЛИТЫ ДАТЫ И ВРЕМЕНИ ---
  function getTodayISO() {
    const now = new Date();
    return formatDateISO(now);
  }

  function formatDateISO(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatTimeHHMM(dateObj) {
    const h = String(dateObj.getHours()).padStart(2, '0');
    const m = String(dateObj.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function formatDurationHuman(totalMinutes) {
    const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} мин`;
    if (m === 0) return `${h} ч`;
    return `${h} ч ${String(m).padStart(2, '0')} м`;
  }

  function formatDurationClock(totalMinutes) {
    const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} ч ${String(m).padStart(2, '0')} м`;
  }

  function formatDurationHHMM(totalMinutes) {
    const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatDecimalHours(totalMinutes) {
    const mins = Math.max(0, Number(totalMinutes) || 0);
    return (mins / 60).toFixed(1);
  }

  function formatElapsedHMS(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }

  function calcMinutesBetweenTimes(startHHMM, endHHMM) {
    if (!startHHMM || !endHHMM) return 0;
    const [sh, sm] = startHHMM.split(':').map(Number);
    const [eh, em] = endHHMM.split(':').map(Number);
    if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return 0;
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) {
      diff += 24 * 60; // переход через полночь
    }
    return diff;
  }

  function formatRussianDateTitle(isoDate) {
    if (!isoDate) return '';
    const today = getTodayISO();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = formatDateISO(yesterdayDate);

    const [y, m, d] = isoDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formatted = dateObj.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });

    if (isoDate === today) return `Сегодня, ${formatted}`;
    if (isoDate === yesterday) return `Вчера, ${formatted}`;
    return formatted;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // --- ЗАГРУЗКА И СОХРАНЕНИЕ ДАННЫХ ---
  function loadState() {
    try {
      const rawSites = localStorage.getItem(STORAGE_KEYS.SITES);
      sites = rawSites ? JSON.parse(rawSites) : [];
    } catch {
      sites = [];
    }

    try {
      const rawTags = localStorage.getItem(STORAGE_KEYS.TAGS);
      tags = rawTags ? JSON.parse(rawTags) : [...DEFAULT_TAGS];
    } catch {
      tags = [...DEFAULT_TAGS];
    }

    try {
      const rawEntries = localStorage.getItem(STORAGE_KEYS.ENTRIES);
      entries = rawEntries ? JSON.parse(rawEntries) : [];
    } catch {
      entries = [];
    }

    try {
      const rawTimer = localStorage.getItem(STORAGE_KEYS.TIMER);
      if (rawTimer) {
        const parsed = JSON.parse(rawTimer);
        activeTimer = {
          isRunning: Boolean(parsed.isRunning && parsed.startTimestamp),
          startTimestamp: parsed.startTimestamp || null,
          selectedSiteId: parsed.selectedSiteId || '',
          selectedTags: Array.isArray(parsed.selectedTags) ? parsed.selectedTags : [],
          note: parsed.note || ''
        };
      }
    } catch {
      // ignore
    }

    // Если таймер был запущен, восстанавливаем выбранный объект, теги и комментарий
    if (activeTimer.isRunning) {
      selectedSiteId = activeTimer.selectedSiteId || (sites[0] ? sites[0].id : '');
      selectedTags = [...activeTimer.selectedTags];
    } else if (sites.length > 0) {
      // Выбираем последний использованный объект по умолчанию
      const sorted = [...sites].sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
      selectedSiteId = sorted[0].id;
    }
  }

  function saveSites() {
    localStorage.setItem(STORAGE_KEYS.SITES, JSON.stringify(sites));
  }

  function saveTags() {
    localStorage.setItem(STORAGE_KEYS.TAGS, JSON.stringify(tags));
  }

  function saveEntries() {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
  }

  function saveActiveTimer() {
    activeTimer.selectedSiteId = selectedSiteId;
    activeTimer.selectedTags = [...selectedTags];
    const noteEl = document.getElementById('work-note-input');
    if (noteEl) {
      activeTimer.note = noteEl.value;
    }
    localStorage.setItem(STORAGE_KEYS.TIMER, JSON.stringify(activeTimer));
  }

  // --- ТЕМА ОФОРМЛЕНИЯ ---
  function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    applyTheme(savedTheme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    const icon = document.getElementById('theme-icon');
    const metaTheme = document.getElementById('meta-theme-color');
    if (icon) {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0b1120' : '#f1f5f9');
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    showToast(next === 'light' ? '☀️ Светлая тема (для яркого солнца)' : '🌙 Тёмная тема');
  }

  // --- УВЕДОМЛЕНИЯ (TOAST) ---
  function showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    if (toastTimeoutId) clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  // --- ШАПКА И СВОДКА ЗА СЕГОДНЯ ---
  function updateHeader() {
    const now = new Date();
    const dateLabel = document.getElementById('header-date-label');
    if (dateLabel) {
      dateLabel.textContent = now.toLocaleDateString('ru-RU', {
        weekday: 'short',
        day: 'numeric',
        month: 'long'
      });
    }

    const todayISO = getTodayISO();
    const todayMins = entries
      .filter((e) => e.date === todayISO)
      .reduce((acc, e) => acc + (Number(e.durationMins) || 0), 0);

    const todayTotalEl = document.getElementById('header-today-total');
    if (todayTotalEl) {
      todayTotalEl.textContent = formatDurationClock(todayMins);
    }
  }

  // --- РЕНДЕР ОБЪЕКТОВ (БЫСТРЫЕ КНОПКИ) ---
  function getSiteNameById(siteId, fallbackName) {
    const found = sites.find((s) => s.id === siteId);
    return found ? found.name : (fallbackName || 'Без названия');
  }

  function renderQuickSiteChips() {
    const container = document.getElementById('quick-site-chips');
    if (!container) return;

    if (sites.length === 0) {
      container.innerHTML = `
        <div class="empty-hint-box">
          Список объектов пока пуст. Нажмите <strong>«+ Новый объект»</strong> выше, чтобы добавить первый строительный объект.
        </div>
      `;
      return;
    }

    const sortedSites = [...sites].sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));

    container.innerHTML = sortedSites
      .map((site) => {
        const isActive = site.id === selectedSiteId;
        return `
          <button type="button" class="site-chip ${isActive ? 'active' : ''}" data-site-id="${escapeHtml(site.id)}">
            <span>🏗️</span>
            <span>${escapeHtml(site.name)}</span>
          </button>
        `;
      })
      .join('');

    container.querySelectorAll('.site-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedSiteId = btn.getAttribute('data-site-id');
        if (activeTimer.isRunning) {
          saveActiveTimer();
          updateTimerUI();
        }
        renderQuickSiteChips();
      });
    });
  }

  // --- РЕНДЕР ТЕГОВ ВИДОВ РАБОТ ---
  function renderWorkTags() {
    const container = document.getElementById('work-tags-container');
    if (!container) return;

    if (tags.length === 0) {
      container.innerHTML = `<p class="card-desc">Шаблоны не добавлены.</p>`;
      return;
    }

    container.innerHTML = tags
      .map((tag) => {
        const isActive = selectedTags.includes(tag);
        return `
          <button type="button" class="work-tag ${isActive ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
            ${isActive ? '✓ ' : ''}${escapeHtml(tag)}
          </button>
        `;
      })
      .join('');

    container.querySelectorAll('.work-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-tag');
        if (selectedTags.includes(tag)) {
          selectedTags = selectedTags.filter((t) => t !== tag);
        } else {
          selectedTags.push(tag);
        }
        if (activeTimer.isRunning) {
          saveActiveTimer();
        }
        renderWorkTags();
      });
    });
  }

  // --- ЖИВОЙ ТАЙМЕР ---
  function startTimer() {
    if (!selectedSiteId && sites.length === 0) {
      // Открываем форму создания объекта, если ещё нет ни одного
      const newSiteBox = document.getElementById('inline-new-site-box');
      if (newSiteBox) newSiteBox.classList.remove('hidden');
      const nameInput = document.getElementById('new-site-name-input');
      if (nameInput) nameInput.focus();
      showToast('Сначала укажите название объекта');
      return;
    }

    if (!selectedSiteId && sites.length > 0) {
      selectedSiteId = sites[0].id;
    }

    activeTimer.isRunning = true;
    activeTimer.startTimestamp = Date.now();
    saveActiveTimer();
    TouchSiteLastUsed(selectedSiteId);

    startTimerLoop();
    updateTimerUI();
    showToast('⏱ Таймер запущен! Удачной работы на объекте');
  }

  function startTimerLoop() {
    if (timerIntervalId) clearInterval(timerIntervalId);
    if (!activeTimer.isRunning || !activeTimer.startTimestamp) return;

    const tick = () => {
      if (!activeTimer.isRunning || !activeTimer.startTimestamp) return;
      const elapsed = Date.now() - activeTimer.startTimestamp;
      const formatted = formatElapsedHMS(elapsed);

      const digitsEl = document.getElementById('timer-digits');
      if (digitsEl) digitsEl.textContent = formatted;

      const floatingClockEl = document.getElementById('floating-timer-clock');
      if (floatingClockEl) floatingClockEl.textContent = formatted;
    };

    tick();
    timerIntervalId = setInterval(tick, 1000);
  }

  function updateTimerUI() {
    const displayBox = document.getElementById('timer-display-box');
    const badge = document.getElementById('timer-status-badge');
    const meta = document.getElementById('timer-meta');
    const startLabel = document.getElementById('timer-start-label');
    const btnStart = document.getElementById('btn-start-timer');
    const runningActions = document.getElementById('timer-running-actions');
    const floatingBar = document.getElementById('floating-timer-bar');
    const floatingSite = document.getElementById('floating-timer-site');
    const digitsEl = document.getElementById('timer-digits');

    const activeTab = document.querySelector('.tab-view.active');
    const isOnWorkTab = activeTab && activeTab.id === 'view-work';

    if (activeTimer.isRunning && activeTimer.startTimestamp) {
      displayBox?.classList.add('running');
      if (badge) {
        badge.textContent = 'Идёт запись на объекте';
        badge.classList.add('running');
      }
      meta?.classList.remove('hidden');
      if (startLabel) {
        startLabel.textContent = formatTimeHHMM(new Date(activeTimer.startTimestamp));
      }
      btnStart?.classList.add('hidden');
      runningActions?.classList.remove('hidden');

      if (floatingSite) {
        floatingSite.textContent = getSiteNameById(selectedSiteId, 'Объект не выбран');
      }

      if (!isOnWorkTab || currentWorkMode !== 'timer') {
        floatingBar?.classList.remove('hidden');
      } else {
        floatingBar?.classList.add('hidden');
      }
    } else {
      displayBox?.classList.remove('running');
      if (badge) {
        badge.textContent = 'Ожидание старта';
        badge.classList.remove('running');
      }
      meta?.classList.add('hidden');
      document.getElementById('timer-start-adjust-box')?.classList.add('hidden');
      btnStart?.classList.remove('hidden');
      runningActions?.classList.add('hidden');
      floatingBar?.classList.add('hidden');
      if (digitsEl) digitsEl.textContent = '00:00:00';
    }
  }

  function openStopTimerModal() {
    if (!activeTimer.isRunning || !activeTimer.startTimestamp) return;

    const startDate = new Date(activeTimer.startTimestamp);
    const endDate = new Date();
    const diffMs = Math.max(60000, endDate.getTime() - startDate.getTime()); // минимум 1 минута
    const totalMins = Math.round(diffMs / 60000);

    const noteEl = document.getElementById('work-note-input');
    const currentNote = noteEl ? noteEl.value.trim() : activeTimer.note;

    openEntryModal({
      mode: 'finish-timer',
      id: '',
      siteId: selectedSiteId || (sites[0] ? sites[0].id : ''),
      date: formatDateISO(startDate),
      startTime: formatTimeHHMM(startDate),
      endTime: formatTimeHHMM(endDate),
      durationMins: totalMins,
      tags: [...selectedTags],
      note: currentNote
    });
  }

  function resetActiveTimer() {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    activeTimer = {
      isRunning: false,
      startTimestamp: null,
      selectedSiteId: selectedSiteId,
      selectedTags: [],
      note: ''
    };
    localStorage.removeItem(STORAGE_KEYS.TIMER);
    updateTimerUI();
  }

  // --- РУЧНОЙ ВВОД ВЫЕЗДА ---
  function updateManualIntervalCalc() {
    const startVal = document.getElementById('manual-start-time')?.value;
    const endVal = document.getElementById('manual-end-time')?.value;
    const hintEl = document.getElementById('interval-calc-hint');
    if (!hintEl) return;

    const mins = calcMinutesBetweenTimes(startVal, endVal);
    hintEl.innerHTML = `Итого: <strong>${formatDurationClock(mins)}</strong> (${formatDecimalHours(mins)} ч)`;
  }

  function saveManualEntry() {
    if (!selectedSiteId) {
      const newSiteBox = document.getElementById('inline-new-site-box');
      if (newSiteBox) newSiteBox.classList.remove('hidden');
      document.getElementById('new-site-name-input')?.focus();
      showToast('Выберите или добавьте объект');
      return;
    }

    const dateVal = document.getElementById('manual-date-input')?.value || getTodayISO();
    let durationMins = 0;
    let startTime = '';
    let endTime = '';

    if (manualSubMode === 'duration') {
      const h = parseInt(document.getElementById('manual-hours-input')?.value || '0', 10) || 0;
      const m = parseInt(document.getElementById('manual-mins-input')?.value || '0', 10) || 0;
      durationMins = h * 60 + m;
    } else {
      startTime = document.getElementById('manual-start-time')?.value || '';
      endTime = document.getElementById('manual-end-time')?.value || '';
      durationMins = calcMinutesBetweenTimes(startTime, endTime);
    }

    if (durationMins <= 0) {
      showToast('Укажите время больше 0 минут');
      return;
    }

    const noteVal = document.getElementById('work-note-input')?.value.trim() || '';
    const siteName = getSiteNameById(selectedSiteId);

    const newEntry = {
      id: generateId(),
      siteId: selectedSiteId,
      siteName,
      date: dateVal,
      startTime,
      endTime,
      durationMins,
      tags: [...selectedTags],
      note: noteVal,
      createdAt: Date.now()
    };

    entries.unshift(newEntry);
    saveEntries();
    TouchSiteLastUsed(selectedSiteId);

    // Очищаем теги и комментарий для следующей записи
    selectedTags = [];
    const noteInput = document.getElementById('work-note-input');
    if (noteInput) noteInput.value = '';

    renderAll();
    showToast(`✅ Записано: ${siteName} (${formatDurationHuman(durationMins)})`);
  }

  function TouchSiteLastUsed(siteId) {
    const site = sites.find((s) => s.id === siteId);
    if (site) {
      site.lastUsedAt = Date.now();
      saveSites();
    }
  }

  // --- СПИСОК ВЫЕЗДОВ ЗА СЕГОДНЯ (НА ГЛАВНОЙ) ---
  function renderTodayEntries() {
    const todayISO = getTodayISO();
    const todayList = entries
      .filter((e) => e.date === todayISO)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const countEl = document.getElementById('today-entries-count');
    if (countEl) {
      countEl.textContent = `${todayList.length} ${pluralize(todayList.length, 'выезд', 'выезда', 'выездов')}`;
    }

    const container = document.getElementById('today-entries-list');
    if (!container) return;

    if (todayList.length === 0) {
      container.innerHTML = `
        <div class="empty-hint-box">
          За сегодня записей пока нет. Запустите таймер по приезду на объект или добавьте выезд вручную.
        </div>
      `;
      return;
    }

    container.innerHTML = todayList.map((entry) => renderEntryCardHTML(entry)).join('');
    bindEntryCardActions(container);
  }

  function renderEntryCardHTML(entry) {
    const siteTitle = getSiteNameById(entry.siteId, entry.siteName);
    const timeRange =
      entry.startTime && entry.endTime
        ? `<div class="entry-time-range">🕒 ${escapeHtml(entry.startTime)} — ${escapeHtml(entry.endTime)}</div>`
        : '';

    const tagsHTML =
      Array.isArray(entry.tags) && entry.tags.length > 0
        ? `<div class="entry-tags-row">${entry.tags
            .map((t) => `<span class="entry-tag-pill">${escapeHtml(t)}</span>`)
            .join('')}</div>`
        : '';

    const noteHTML = entry.note
      ? `<div class="entry-note">${escapeHtml(entry.note)}</div>`
      : '';

    return `
      <article class="entry-card" data-entry-id="${escapeHtml(entry.id)}">
        <div class="entry-top">
          <div>
            <div class="entry-site-title">🏗️ ${escapeHtml(siteTitle)}</div>
            ${timeRange}
          </div>
          <span class="entry-duration-badge">${formatDurationHuman(entry.durationMins)}</span>
        </div>
        ${tagsHTML}
        ${noteHTML}
        <div class="entry-actions">
          <button type="button" class="btn-entry-action edit" data-id="${escapeHtml(entry.id)}">✏️ Изменить</button>
          <button type="button" class="btn-entry-action delete" data-id="${escapeHtml(entry.id)}">🗑 Удалить</button>
        </div>
      </article>
    `;
  }

  function bindEntryCardActions(container) {
    container.querySelectorAll('.btn-entry-action.edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const entry = entries.find((e) => e.id === id);
        if (!entry) return;
        openEntryModal({
          mode: 'edit',
          id: entry.id,
          siteId: entry.siteId,
          date: entry.date,
          startTime: entry.startTime || '',
          endTime: entry.endTime || '',
          durationMins: entry.durationMins,
          tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
          note: entry.note || ''
        });
      });
    });

    container.querySelectorAll('.btn-entry-action.delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const entry = entries.find((e) => e.id === id);
        if (!entry) return;
        const siteTitle = getSiteNameById(entry.siteId, entry.siteName);
        if (window.confirm(`Удалить запись по объекту «${siteTitle}» (${formatDurationHuman(entry.durationMins)})?`)) {
          entries = entries.filter((e) => e.id !== id);
          saveEntries();
          renderAll();
          showToast('🗑 Запись удалена');
        }
      });
    });
  }

  // --- МОДАЛЬНОЕ ОКНО СОХРАНЕНИЯ ТАЙМЕРА / РЕДАКТИРОВАНИЯ ЗАПИСИ ---
  function openEntryModal(data) {
    modalMode = data.mode;
    modalSelectedTags = [...(data.tags || [])];

    const modal = document.getElementById('entry-modal');
    const titleEl = document.getElementById('modal-title');
    if (titleEl) {
      titleEl.textContent =
        data.mode === 'finish-timer' ? 'Завершение работы на объекте' : 'Редактирование записи';
    }

    document.getElementById('modal-entry-id').value = data.id || '';

    // Заполняем селект объектов
    const siteSelect = document.getElementById('modal-site-select');
    if (siteSelect) {
      siteSelect.innerHTML = sites
        .map(
          (s) =>
            `<option value="${escapeHtml(s.id)}" ${s.id === data.siteId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
        )
        .join('');
    }

    document.getElementById('modal-date-input').value = data.date || getTodayISO();
    document.getElementById('modal-start-time').value = data.startTime || '';
    document.getElementById('modal-end-time').value = data.endTime || '';

    const mins = Math.max(1, Math.round(Number(data.durationMins) || 0));
    document.getElementById('modal-hours-input').value = Math.floor(mins / 60);
    document.getElementById('modal-mins-input').value = mins % 60;
    document.getElementById('modal-note-input').value = data.note || '';

    renderModalTags();
    modal?.classList.remove('hidden');
  }

  function renderModalTags() {
    const container = document.getElementById('modal-tags-container');
    if (!container) return;

    container.innerHTML = tags
      .map((tag) => {
        const isActive = modalSelectedTags.includes(tag);
        return `
          <button type="button" class="work-tag ${isActive ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
            ${isActive ? '✓ ' : ''}${escapeHtml(tag)}
          </button>
        `;
      })
      .join('');

    container.querySelectorAll('.work-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-tag');
        if (modalSelectedTags.includes(tag)) {
          modalSelectedTags = modalSelectedTags.filter((t) => t !== tag);
        } else {
          modalSelectedTags.push(tag);
        }
        renderModalTags();
      });
    });
  }

  function closeEntryModal() {
    document.getElementById('entry-modal')?.classList.add('hidden');
  }

  function confirmEntryModal() {
    const entryId = document.getElementById('modal-entry-id').value;
    const siteId = document.getElementById('modal-site-select').value;
    const dateVal = document.getElementById('modal-date-input').value || getTodayISO();
    const startTime = document.getElementById('modal-start-time').value || '';
    const endTime = document.getElementById('modal-end-time').value || '';
    const h = parseInt(document.getElementById('modal-hours-input').value || '0', 10) || 0;
    const m = parseInt(document.getElementById('modal-mins-input').value || '0', 10) || 0;
    const durationMins = h * 60 + m;
    const note = document.getElementById('modal-note-input').value.trim();

    if (!siteId) {
      showToast('Выберите объект');
      return;
    }
    if (durationMins <= 0) {
      showToast('Время на объекте должно быть больше 0');
      return;
    }

    const siteName = getSiteNameById(siteId);

    if (modalMode === 'finish-timer') {
      entries.unshift({
        id: generateId(),
        siteId,
        siteName,
        date: dateVal,
        startTime,
        endTime,
        durationMins,
        tags: [...modalSelectedTags],
        note,
        createdAt: Date.now()
      });

      resetActiveTimer();
      selectedTags = [];
      const workNoteEl = document.getElementById('work-note-input');
      if (workNoteEl) workNoteEl.value = '';
      TouchSiteLastUsed(siteId);
      showToast(`✅ Выезд завершён: ${siteName} (${formatDurationHuman(durationMins)})`);
    } else {
      const idx = entries.findIndex((e) => e.id === entryId);
      if (idx !== -1) {
        entries[idx] = {
          ...entries[idx],
          siteId,
          siteName,
          date: dateVal,
          startTime,
          endTime,
          durationMins,
          tags: [...modalSelectedTags],
          note
        };
        showToast('✅ Изменения сохранены');
      }
    }

    saveEntries();
    closeEntryModal();
    renderAll();
  }

  // --- ВКЛАДКА 2: ФИЛЬТРАЦИЯ И ЖУРНАЛ ---
  function getPeriodDateRange() {
    const today = new Date();
    const todayISO = formatDateISO(today);

    if (currentPeriod === 'today') {
      return { from: todayISO, to: todayISO, label: 'За сегодня' };
    }
    if (currentPeriod === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yISO = formatDateISO(y);
      return { from: yISO, to: yISO, label: 'За вчера' };
    }
    if (currentPeriod === 'week') {
      const d = new Date(today);
      const day = d.getDay() || 7; // Понедельник = 1
      d.setDate(d.getDate() - day + 1);
      return { from: formatDateISO(d), to: todayISO, label: 'За текущую неделю' };
    }
    if (currentPeriod === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: formatDateISO(firstDay), to: todayISO, label: 'За текущий месяц' };
    }
    if (currentPeriod === 'custom') {
      const fromVal = document.getElementById('filter-date-from')?.value || '2000-01-01';
      const toVal = document.getElementById('filter-date-to')?.value || '2099-12-31';
      return { from: fromVal, to: toVal, label: `За период ${fromVal} — ${toVal}` };
    }
    return { from: '2000-01-01', to: '2099-12-31', label: 'За всё время' };
  }

  function getFilteredEntries() {
    const { from, to } = getPeriodDateRange();
    return entries
      .filter((e) => {
        if (e.date < from || e.date > to) return false;
        if (currentFilterSiteId !== 'all' && e.siteId !== currentFilterSiteId) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  function renderHistoryTab() {
    // Обновляем селект фильтра по объекту
    const filterSelect = document.getElementById('filter-site-select');
    if (filterSelect) {
      const prevVal = currentFilterSiteId;
      filterSelect.innerHTML =
        `<option value="all">Все объекты</option>` +
        sites
          .map(
            (s) =>
              `<option value="${escapeHtml(s.id)}" ${s.id === prevVal ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
          )
          .join('');
    }

    const filtered = getFilteredEntries();
    const totalMins = filtered.reduce((acc, e) => acc + (Number(e.durationMins) || 0), 0);
    const uniqueSitesCount = new Set(filtered.map((e) => e.siteId || e.siteName)).size;

    const statTime = document.getElementById('stat-total-time');
    const statDec = document.getElementById('stat-total-decimal');
    const statVisits = document.getElementById('stat-total-visits');
    const statSites = document.getElementById('stat-total-sites');

    if (statTime) statTime.textContent = formatDurationClock(totalMins);
    if (statDec) statDec.textContent = `${formatDecimalHours(totalMins)} ч`;
    if (statVisits) statVisits.textContent = String(filtered.length);
    if (statSites) statSites.textContent = String(uniqueSitesCount);

    // Сводка распределения по объектам
    const breakdownCard = document.getElementById('period-sites-breakdown-card');
    const breakdownList = document.getElementById('period-sites-breakdown');
    if (breakdownCard && breakdownList) {
      if (filtered.length === 0) {
        breakdownCard.classList.add('hidden');
      } else {
        breakdownCard.classList.remove('hidden');
        const mapBySite = new Map();
        filtered.forEach((e) => {
          const title = getSiteNameById(e.siteId, e.siteName);
          const cur = mapBySite.get(title) || { mins: 0, visits: 0 };
          cur.mins += Number(e.durationMins) || 0;
          cur.visits += 1;
          mapBySite.set(title, cur);
        });

        const sortedBreakdown = [...mapBySite.entries()].sort((a, b) => b[1].mins - a[1].mins);
        breakdownList.innerHTML = sortedBreakdown
          .map(([siteTitle, info]) => {
            const pct = totalMins > 0 ? Math.max(4, Math.round((info.mins / totalMins) * 100)) : 0;
            return `
              <div class="breakdown-item">
                <div class="breakdown-top">
                  <span>🏗️ ${escapeHtml(siteTitle)} <small style="color:var(--text-muted)">(${info.visits})</small></span>
                  <span>${formatDurationHuman(info.mins)}</span>
                </div>
                <div class="breakdown-bar-wrap">
                  <div class="breakdown-bar" style="width: ${pct}%"></div>
                </div>
              </div>
            `;
          })
          .join('');
      }
    }

    // Список записей, сгруппированный по дням
    const countEl = document.getElementById('history-entries-count');
    if (countEl) {
      countEl.textContent = `${filtered.length} ${pluralize(filtered.length, 'запись', 'записи', 'записей')}`;
    }

    const listContainer = document.getElementById('history-entries-list');
    if (!listContainer) return;

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-hint-box">
          За выбранный период записей не найдено.
        </div>
      `;
      return;
    }

    const groupedByDate = new Map();
    filtered.forEach((e) => {
      if (!groupedByDate.has(e.date)) groupedByDate.set(e.date, []);
      groupedByDate.get(e.date).push(e);
    });

    let html = '';
    for (const [dateISO, dayEntries] of groupedByDate.entries()) {
      const dayMins = dayEntries.reduce((s, e) => s + (Number(e.durationMins) || 0), 0);
      html += `
        <div class="date-group-header">
          <span>📅 ${escapeHtml(formatRussianDateTitle(dateISO))}</span>
          <span>Итого: ${formatDurationHuman(dayMins)}</span>
        </div>
      `;
      html += dayEntries.map((e) => renderEntryCardHTML(e)).join('');
    }

    listContainer.innerHTML = html;
    bindEntryCardActions(listContainer);
  }

  // --- ГЕНЕРАЦИЯ ТЕКСТОВОГО ОТЧЁТА ДЛЯ WHATSAPP / TELEGRAM ---
  function generateTextReport() {
    const filtered = getFilteredEntries();
    const { label } = getPeriodDateRange();
    if (filtered.length === 0) {
      return 'За выбранный период записей нет.';
    }

    const totalMins = filtered.reduce((acc, e) => acc + (Number(e.durationMins) || 0), 0);
    const lines = [];
    lines.push(`📐 ОТЧЁТ ГЕОДЕЗИСТА (${label})`);
    lines.push('══════════════════════');

    if (reportGroupBy === 'date') {
      const byDate = new Map();
      filtered.forEach((e) => {
        if (!byDate.has(e.date)) byDate.set(e.date, []);
        byDate.get(e.date).push(e);
      });

      for (const [dateISO, list] of byDate.entries()) {
        const dayMins = list.reduce((s, e) => s + (Number(e.durationMins) || 0), 0);
        lines.push(`\n📅 ${formatRussianDateTitle(dateISO)} (${formatDurationHuman(dayMins)}):`);
        list.forEach((e) => {
          const siteTitle = getSiteNameById(e.siteId, e.siteName);
          const intervalStr = e.startTime && e.endTime ? ` [${e.startTime}–${e.endTime}]` : '';
          const works = [...(e.tags || [])];
          if (e.note) works.push(e.note);
          const worksStr = works.length > 0 ? ` — ${works.join(', ')}` : '';
          lines.push(`• ${siteTitle}: ${formatDurationHuman(e.durationMins)}${intervalStr}${worksStr}`);
        });
      }
    } else {
      const bySite = new Map();
      filtered.forEach((e) => {
        const siteTitle = getSiteNameById(e.siteId, e.siteName);
        if (!bySite.has(siteTitle)) bySite.set(siteTitle, []);
        bySite.get(siteTitle).push(e);
      });

      for (const [siteTitle, list] of bySite.entries()) {
        const siteMins = list.reduce((s, e) => s + (Number(e.durationMins) || 0), 0);
        lines.push(`\n🏗️ ${siteTitle} — всего ${formatDurationHuman(siteMins)} (${list.length} выезд.):`);
        list.forEach((e) => {
          const works = [...(e.tags || [])];
          if (e.note) works.push(e.note);
          const worksStr = works.length > 0 ? `: ${works.join(', ')}` : '';
          lines.push(`• ${e.date} (${formatDurationHuman(e.durationMins)})${worksStr}`);
        });
      }
    }

    lines.push('\n══════════════════════');
    lines.push(`⏱ ВСЕГО ЧАСОВ: ${formatDurationClock(totalMins)} (${formatDecimalHours(totalMins)} ч)`);
    lines.push(`🚗 Выездов: ${filtered.length}`);

    return lines.join('\n');
  }

  function openTextReportModal() {
    const modal = document.getElementById('report-modal');
    const preview = document.getElementById('report-preview-text');
    if (preview) {
      preview.value = generateTextReport();
    }
    modal?.classList.remove('hidden');
  }

  async function copyReportToClipboard() {
    const preview = document.getElementById('report-preview-text');
    if (!preview) return;
    const text = preview.value;
    try {
      await navigator.clipboard.writeText(text);
      showToast('📋 Отчёт скопирован! Можно вставить в WhatsApp / Telegram');
    } catch {
      preview.select();
      document.execCommand('copy');
      showToast('📋 Отчёт скопирован в буфер обмена!');
    }
  }

  // --- ВЫГРУЗКА В EXCEL (CSV С UTF-8 BOM) ---
  function exportFilteredToCSV() {
    const filtered = getFilteredEntries();
    if (filtered.length === 0) {
      showToast('Нет записей за выбранный период для выгрузки');
      return;
    }

    const headers = [
      'Дата',
      'Объект',
      'Примечание к объекту',
      'Приезд (С)',
      'Отъезд (До)',
      'Время (ЧЧ:ММ)',
      'Часы (десятичные)',
      'Виды работ',
      'Комментарий'
    ];

    const escapeCSV = (val) => {
      const str = String(val ?? '').replace(/\r?\n/g, ' ');
      if (str.includes(';') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filtered.map((e) => {
      const siteObj = sites.find((s) => s.id === e.siteId);
      const siteTitle = siteObj ? siteObj.name : (e.siteName || '');
      const siteNote = siteObj ? (siteObj.note || '') : '';
      const decimalHours = formatDecimalHours(e.durationMins).replace('.', ',');
      const worksStr = Array.isArray(e.tags) ? e.tags.join(', ') : '';

      return [
        e.date,
        siteTitle,
        siteNote,
        e.startTime || '',
        e.endTime || '',
        formatDurationHHMM(e.durationMins),
        decimalHours,
        worksStr,
        e.note || ''
      ]
        .map(escapeCSV)
        .join(';');
    });

    // Итоговая строка
    const totalMins = filtered.reduce((acc, e) => acc + (Number(e.durationMins) || 0), 0);
    rows.push(
      [
        'ИТОГО',
        `Выездов: ${filtered.length}`,
        '',
        '',
        '',
        formatDurationHHMM(totalMins),
        formatDecimalHours(totalMins).replace('.', ','),
        '',
        ''
      ]
        .map(escapeCSV)
        .join(';')
    );

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `geojournal_${getTodayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('📊 Таблица CSV (для Excel) скачана!');
  }

  // --- ВКЛАДКА 3: СПРАВОЧНИК ОБЪЕКТОВ, ШАБЛОНОВ И РЕЗЕРВНАЯ КОПИЯ ---
  function renderDirectoryTab() {
    const countEl = document.getElementById('sites-total-count');
    if (countEl) {
      countEl.textContent = `${sites.length} ${pluralize(sites.length, 'объект', 'объекта', 'объектов')}`;
    }

    const dirList = document.getElementById('directory-sites-list');
    if (dirList) {
      if (sites.length === 0) {
        dirList.innerHTML = `<div class="empty-hint-box">Вы ещё не добавили ни одного объекта.</div>`;
      } else {
        const sorted = [...sites].sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
        dirList.innerHTML = sorted
          .map((site) => {
            const siteEntries = entries.filter((e) => e.siteId === site.id);
            const totalMins = siteEntries.reduce((s, e) => s + (Number(e.durationMins) || 0), 0);
            return `
              <div class="dir-site-card">
                <div class="dir-site-header">
                  <div>
                    <div class="dir-site-name">🏗️ ${escapeHtml(site.name)}</div>
                    ${site.note ? `<div class="dir-site-note">${escapeHtml(site.note)}</div>` : ''}
                  </div>
                  <span class="dir-site-stats">${siteEntries.length} выезд. • ${formatDurationHuman(totalMins)}</span>
                </div>
                <div class="dir-site-actions">
                  <button type="button" class="btn-entry-action select-site" data-id="${escapeHtml(site.id)}">▶ Выбрать для записи</button>
                  <button type="button" class="btn-entry-action edit-site" data-id="${escapeHtml(site.id)}">✏️ Изменить</button>
                  <button type="button" class="btn-entry-action delete delete-site" data-id="${escapeHtml(site.id)}">🗑</button>
                </div>
              </div>
            `;
          })
          .join('');

        dirList.querySelectorAll('.select-site').forEach((btn) => {
          btn.addEventListener('click', () => {
            selectedSiteId = btn.getAttribute('data-id');
            TouchSiteLastUsed(selectedSiteId);
            switchTab('view-work');
            renderAll();
            showToast(`Выбран объект: ${getSiteNameById(selectedSiteId)}`);
          });
        });

        dirList.querySelectorAll('.edit-site').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const site = sites.find((s) => s.id === id);
            if (!site) return;
            const newName = window.prompt('Название объекта:', site.name);
            if (newName === null) return;
            const trimmed = newName.trim();
            if (!trimmed) return;
            const newNote = window.prompt('Адрес / прораб / примечание:', site.note || '');
            site.name = trimmed;
            if (newNote !== null) site.note = newNote.trim();
            saveSites();
            renderAll();
            showToast('✅ Объект обновлён');
          });
        });

        dirList.querySelectorAll('.delete-site').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const site = sites.find((s) => s.id === id);
            if (!site) return;
            if (
              window.confirm(
                `Удалить объект «${site.name}» из справочника? (Прошлые записи в журнале сохранятся)`
              )
            ) {
              sites = sites.filter((s) => s.id !== id);
              if (selectedSiteId === id) {
                selectedSiteId = sites[0] ? sites[0].id : '';
              }
              saveSites();
              renderAll();
              showToast('🗑 Объект удалён из справочника');
            }
          });
        });
      }
    }

    // Список шаблонов видов работ
    const tagsManageList = document.getElementById('directory-tags-list');
    if (tagsManageList) {
      tagsManageList.innerHTML = tags
        .map(
          (tag) => `
          <span class="manage-tag-item">
            <span>${escapeHtml(tag)}</span>
            <button type="button" class="btn-remove-tag" data-tag="${escapeHtml(tag)}" title="Удалить шаблон">✕</button>
          </span>
        `
        )
        .join('');

      tagsManageList.querySelectorAll('.btn-remove-tag').forEach((btn) => {
        btn.addEventListener('click', () => {
          const t = btn.getAttribute('data-tag');
          tags = tags.filter((item) => item !== t);
          selectedTags = selectedTags.filter((item) => item !== t);
          saveTags();
          renderAll();
        });
      });
    }
  }

  function addNewSite(name, note) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      showToast('Введите название объекта');
      return null;
    }

    const existing = sites.find((s) => s.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      selectedSiteId = existing.id;
      existing.lastUsedAt = Date.now();
      if (note && !existing.note) existing.note = note.trim();
      saveSites();
      renderAll();
      return existing;
    }

    const newSite = {
      id: generateId(),
      name: trimmedName,
      note: (note || '').trim(),
      lastUsedAt: Date.now(),
      createdAt: Date.now()
    };

    sites.unshift(newSite);
    selectedSiteId = newSite.id;
    saveSites();
    renderAll();
    showToast(`🏗️ Добавлен объект: ${newSite.name}`);
    return newSite;
  }

  function addNewTag(tagName) {
    const trimmed = (tagName || '').trim();
    if (!trimmed) return false;
    if (!tags.includes(trimmed)) {
      tags.push(trimmed);
      saveTags();
    }
    if (!selectedTags.includes(trimmed)) {
      selectedTags.push(trimmed);
    }
    renderAll();
    showToast(`Добавлен вид работ: ${trimmed}`);
    return true;
  }

  // --- РЕЗЕРВНОЕ КОПИРОВАНИЕ (JSON) ---
  function exportBackupJSON() {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sites,
      tags,
      entries
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `geojournal_backup_${getTodayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('⬇️ Файл резервной копии сохранён');
  }

  function importBackupJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || '{}'));
        if (!Array.isArray(parsed.entries) && !Array.isArray(parsed.sites)) {
          showToast('❌ Некорректный файл резервной копии');
          return;
        }
        if (Array.isArray(parsed.sites)) sites = parsed.sites;
        if (Array.isArray(parsed.tags)) tags = parsed.tags;
        if (Array.isArray(parsed.entries)) entries = parsed.entries;

        saveSites();
        saveTags();
        saveEntries();
        if (sites.length > 0 && !selectedSiteId) {
          selectedSiteId = sites[0].id;
        }
        renderAll();
        showToast(`✅ Восстановлено записей: ${entries.length}`);
      } catch {
        showToast('❌ Ошибка чтения файла копии');
      }
    };
    reader.readAsText(file);
  }

  // --- НАВИГАЦИЯ ПО ВКЛАДКАМ ---
  function switchTab(targetId) {
    document.querySelectorAll('.tab-view').forEach((sec) => {
      sec.classList.toggle('active', sec.id === targetId);
    });
    document.querySelectorAll('.bottom-nav .nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
    });
    updateTimerUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function switchWorkMode(mode) {
    currentWorkMode = mode;
    const btnTimer = document.getElementById('mode-btn-timer');
    const btnManual = document.getElementById('mode-btn-manual');
    const timerSec = document.getElementById('timer-section');
    const manualSec = document.getElementById('manual-time-section');
    const btnSaveManual = document.getElementById('btn-save-manual');

    if (mode === 'timer') {
      btnTimer?.classList.add('active');
      btnTimer?.setAttribute('aria-selected', 'true');
      btnManual?.classList.remove('active');
      btnManual?.setAttribute('aria-selected', 'false');
      timerSec?.classList.remove('hidden');
      manualSec?.classList.add('hidden');
      btnSaveManual?.classList.add('hidden');
    } else {
      btnManual?.classList.add('active');
      btnManual?.setAttribute('aria-selected', 'true');
      btnTimer?.classList.remove('active');
      btnTimer?.setAttribute('aria-selected', 'false');
      timerSec?.classList.add('hidden');
      manualSec?.classList.remove('hidden');
      btnSaveManual?.classList.remove('hidden');
    }
    updateTimerUI();
  }

  // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pluralize(count, one, few, many) {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  function renderAll() {
    updateHeader();
    renderQuickSiteChips();
    renderWorkTags();
    updateTimerUI();
    renderTodayEntries();
    renderHistoryTab();
    renderDirectoryTab();
  }

  // --- ПРИВЯЗКА СОБЫТИЙ ---
  function bindEvents() {
    // Переключение темы
    document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

    // Клик по пилюле «Сегодня» в шапке открывает журнал за сегодня
    document.getElementById('header-today-pill')?.addEventListener('click', () => {
      currentPeriod = 'today';
      document.querySelectorAll('#period-chips .period-chip').forEach((c) => {
        c.classList.toggle('active', c.getAttribute('data-period') === 'today');
      });
      document.getElementById('custom-dates-row')?.classList.add('hidden');
      renderHistoryTab();
      switchTab('view-history');
    });

    // Нижняя навигация
    document.querySelectorAll('.bottom-nav .nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        if (target) switchTab(target);
      });
    });

    // Плавающая плашка таймера
    document.getElementById('floating-timer-click')?.addEventListener('click', () => {
      switchWorkMode('timer');
      switchTab('view-work');
    });
    document.getElementById('btn-floating-stop')?.addEventListener('click', openStopTimerModal);

    // Режим Таймер / Вручную
    document.getElementById('mode-btn-timer')?.addEventListener('click', () => switchWorkMode('timer'));
    document.getElementById('mode-btn-manual')?.addEventListener('click', () => switchWorkMode('manual'));

    // Добавление нового объекта на главной
    document.getElementById('btn-toggle-new-site')?.addEventListener('click', () => {
      const box = document.getElementById('inline-new-site-box');
      box?.classList.toggle('hidden');
      if (!box?.classList.contains('hidden')) {
        document.getElementById('new-site-name-input')?.focus();
      }
    });
    document.getElementById('btn-cancel-new-site')?.addEventListener('click', () => {
      document.getElementById('inline-new-site-box')?.classList.add('hidden');
    });
    document.getElementById('btn-save-new-site')?.addEventListener('click', () => {
      const nameInput = document.getElementById('new-site-name-input');
      const noteInput = document.getElementById('new-site-note-input');
      const created = addNewSite(nameInput?.value, noteInput?.value);
      if (created) {
        if (nameInput) nameInput.value = '';
        if (noteInput) noteInput.value = '';
        document.getElementById('inline-new-site-box')?.classList.add('hidden');
      }
    });

    // Управление живым таймером
    document.getElementById('btn-start-timer')?.addEventListener('click', startTimer);
    document.getElementById('btn-stop-timer')?.addEventListener('click', openStopTimerModal);
    document.getElementById('btn-cancel-timer')?.addEventListener('click', () => {
      if (window.confirm('Сбросить текущий таймер без сохранения записи?')) {
        resetActiveTimer();
        showToast('Таймер сброшен');
      }
    });

    // Корректировка времени старта активного таймера
    document.getElementById('btn-edit-timer-start')?.addEventListener('click', () => {
      const box = document.getElementById('timer-start-adjust-box');
      const input = document.getElementById('timer-custom-start-time');
      if (box && input && activeTimer.startTimestamp) {
        input.value = formatTimeHHMM(new Date(activeTimer.startTimestamp));
        box.classList.toggle('hidden');
      }
    });

    document.getElementById('btn-apply-timer-start')?.addEventListener('click', () => {
      const val = document.getElementById('timer-custom-start-time')?.value;
      if (!val || !activeTimer.startTimestamp) return;
      const [h, m] = val.split(':').map(Number);
      const adjusted = new Date(activeTimer.startTimestamp);
      adjusted.setHours(h, m, 0, 0);
      if (adjusted.getTime() > Date.now()) {
        adjusted.setDate(adjusted.getDate() - 1);
      }
      activeTimer.startTimestamp = adjusted.getTime();
      saveActiveTimer();
      startTimerLoop();
      updateTimerUI();
      document.getElementById('timer-start-adjust-box')?.classList.add('hidden');
      showToast(`Время начала изменено на ${val}`);
    });

    // Ручной режим: дата Сегодня / Вчера
    const manualDateInput = document.getElementById('manual-date-input');
    if (manualDateInput) {
      manualDateInput.value = getTodayISO();
    }
    document.getElementById('btn-date-today')?.addEventListener('click', () => {
      if (manualDateInput) manualDateInput.value = getTodayISO();
      document.getElementById('btn-date-today')?.classList.add('active');
      document.getElementById('btn-date-yesterday')?.classList.remove('active');
    });
    document.getElementById('btn-date-yesterday')?.addEventListener('click', () => {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      if (manualDateInput) manualDateInput.value = formatDateISO(y);
      document.getElementById('btn-date-yesterday')?.classList.add('active');
      document.getElementById('btn-date-today')?.classList.remove('active');
    });

    // Подрежим ручного ввода: Длительность / Интервал С—До
    document.getElementById('subtab-duration')?.addEventListener('click', () => {
      manualSubMode = 'duration';
      document.getElementById('subtab-duration')?.classList.add('active');
      document.getElementById('subtab-interval')?.classList.remove('active');
      document.getElementById('manual-duration-box')?.classList.remove('hidden');
      document.getElementById('manual-interval-box')?.classList.add('hidden');
    });
    document.getElementById('subtab-interval')?.addEventListener('click', () => {
      manualSubMode = 'interval';
      document.getElementById('subtab-interval')?.classList.add('active');
      document.getElementById('subtab-duration')?.classList.remove('active');
      document.getElementById('manual-interval-box')?.classList.remove('hidden');
      document.getElementById('manual-duration-box')?.classList.add('hidden');
      updateManualIntervalCalc();
    });

    // Быстрые пресеты часов (0.5 ч ... 8 ч)
    document.querySelectorAll('#duration-presets .preset-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#duration-presets .preset-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const mins = parseInt(chip.getAttribute('data-mins') || '120', 10);
        const hInput = document.getElementById('manual-hours-input');
        const mInput = document.getElementById('manual-mins-input');
        if (hInput) hInput.value = String(Math.floor(mins / 60));
        if (mInput) mInput.value = String(mins % 60);
      });
    });

    document.getElementById('manual-start-time')?.addEventListener('input', updateManualIntervalCalc);
    document.getElementById('manual-end-time')?.addEventListener('input', updateManualIntervalCalc);

    // Добавление своего шаблона работы на главной
    document.getElementById('btn-toggle-new-tag')?.addEventListener('click', () => {
      const box = document.getElementById('inline-new-tag-box');
      box?.classList.toggle('hidden');
      if (!box?.classList.contains('hidden')) {
        document.getElementById('new-tag-input')?.focus();
      }
    });
    document.getElementById('btn-save-new-tag')?.addEventListener('click', () => {
      const input = document.getElementById('new-tag-input');
      if (addNewTag(input?.value)) {
        if (input) input.value = '';
        document.getElementById('inline-new-tag-box')?.classList.add('hidden');
      }
    });

    // Автосохранение заметки при работающем таймере
    document.getElementById('work-note-input')?.addEventListener('input', () => {
      if (activeTimer.isRunning) {
        saveActiveTimer();
      }
    });

    // Кнопка сохранения ручной записи
    document.getElementById('btn-save-manual')?.addEventListener('click', saveManualEntry);

    // Модальное окно редактирования / завершения таймера
    document.getElementById('btn-close-entry-modal')?.addEventListener('click', closeEntryModal);
    document.getElementById('btn-cancel-entry-modal')?.addEventListener('click', closeEntryModal);
    document.getElementById('btn-confirm-entry-modal')?.addEventListener('click', confirmEntryModal);

    // Пересчёт длительности в модальном окне при изменении времени С / До
    const recalcModalDuration = () => {
      const s = document.getElementById('modal-start-time')?.value;
      const e = document.getElementById('modal-end-time')?.value;
      if (s && e) {
        const mins = calcMinutesBetweenTimes(s, e);
        document.getElementById('modal-hours-input').value = Math.floor(mins / 60);
        document.getElementById('modal-mins-input').value = mins % 60;
      }
    };
    document.getElementById('modal-start-time')?.addEventListener('input', recalcModalDuration);
    document.getElementById('modal-end-time')?.addEventListener('input', recalcModalDuration);

    // Фильтры на вкладке 2 (Журнал)
    const todayISO = getTodayISO();
    const firstOfMonth = `${todayISO.slice(0, 8)}01`;
    const fromInput = document.getElementById('filter-date-from');
    const toInput = document.getElementById('filter-date-to');
    if (fromInput) fromInput.value = firstOfMonth;
    if (toInput) toInput.value = todayISO;

    document.querySelectorAll('#period-chips .period-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#period-chips .period-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        currentPeriod = chip.getAttribute('data-period') || 'week';
        const customRow = document.getElementById('custom-dates-row');
        if (currentPeriod === 'custom') {
          customRow?.classList.remove('hidden');
        } else {
          customRow?.classList.add('hidden');
        }
        renderHistoryTab();
      });
    });

    fromInput?.addEventListener('change', renderHistoryTab);
    toInput?.addEventListener('change', renderHistoryTab);

    document.getElementById('filter-site-select')?.addEventListener('change', (e) => {
      currentFilterSiteId = e.target.value;
      renderHistoryTab();
    });

    // Модальное окно текстового отчёта и экспорт CSV
    document.getElementById('btn-open-text-report')?.addEventListener('click', openTextReportModal);
    document.getElementById('btn-close-report-modal')?.addEventListener('click', () => {
      document.getElementById('report-modal')?.classList.add('hidden');
    });
    document.getElementById('btn-close-report-footer')?.addEventListener('click', () => {
      document.getElementById('report-modal')?.classList.add('hidden');
    });
    document.getElementById('btn-copy-report-text')?.addEventListener('click', copyReportToClipboard);

    document.getElementById('report-group-date')?.addEventListener('click', () => {
      reportGroupBy = 'date';
      document.getElementById('report-group-date')?.classList.add('active');
      document.getElementById('report-group-site')?.classList.remove('active');
      const preview = document.getElementById('report-preview-text');
      if (preview) preview.value = generateTextReport();
    });
    document.getElementById('report-group-site')?.addEventListener('click', () => {
      reportGroupBy = 'site';
      document.getElementById('report-group-site')?.classList.add('active');
      document.getElementById('report-group-date')?.classList.remove('active');
      const preview = document.getElementById('report-preview-text');
      if (preview) preview.value = generateTextReport();
    });

    document.getElementById('btn-export-csv')?.addEventListener('click', exportFilteredToCSV);

    // Вкладка 3: добавление объекта и тегов в справочнике
    document.getElementById('btn-dir-add-site')?.addEventListener('click', () => {
      const nameEl = document.getElementById('dir-site-name');
      const noteEl = document.getElementById('dir-site-note');
      if (addNewSite(nameEl?.value, noteEl?.value)) {
        if (nameEl) nameEl.value = '';
        if (noteEl) noteEl.value = '';
      }
    });

    document.getElementById('btn-dir-add-tag')?.addEventListener('click', () => {
      const tagEl = document.getElementById('dir-tag-name');
      if (addNewTag(tagEl?.value)) {
        if (tagEl) tagEl.value = '';
      }
    });

    document.getElementById('btn-reset-default-tags')?.addEventListener('click', () => {
      if (window.confirm('Восстановить стандартный набор геодезических видов работ?')) {
        DEFAULT_TAGS.forEach((t) => {
          if (!tags.includes(t)) tags.push(t);
        });
        saveTags();
        renderAll();
        showToast('✅ Стандартные шаблоны восстановлены');
      }
    });

    // Резервное копирование
    document.getElementById('btn-backup-export')?.addEventListener('click', exportBackupJSON);
    document.getElementById('input-backup-import')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        importBackupJSON(file);
        e.target.value = '';
      }
    });
  }

  // --- РЕГИСТРАЦИЯ SERVICE WORKER ДЛЯ ОФЛАЙН-РАБОТЫ ---
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  // --- ИНИЦИАЛИЗАЦИЯ ---
  function init() {
    initTheme();
    loadState();

    // Восстанавливаем текст заметки, если таймер был активен
    const noteEl = document.getElementById('work-note-input');
    if (noteEl && activeTimer.isRunning && activeTimer.note) {
      noteEl.value = activeTimer.note;
    }

    bindEvents();
    renderAll();

    if (activeTimer.isRunning) {
      startTimerLoop();
    }

    registerServiceWorker();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
