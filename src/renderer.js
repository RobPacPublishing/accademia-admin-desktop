import { createInitialAdminState, normalizeAdminState, pushAdminEvent, createVersion } from './core/admin-state.js';
import {
  createThesisFromForm,
  cloneThesis,
  ensureChapterCount,
  applyOutlineToThesis,
  applyAbstractToThesis,
  applyChapterToThesis,
  appendVersion,
  restoreVersion,
  restoreChapterVersion,
  buildStructuredTaskInput,
  promptOutline,
  promptOutlineRevision,
  promptAbstract,
  promptAbstractRevision,
  promptChapter,
  promptChapterRevision,
  promptTutorRevision,
  buildChapterNotes,
  promptChapterOpening,
  promptChapterSubsection,
  getExpectedSubsections,
  parseChapterTitles,
  resolveChapterTitle
} from './core/thesis-engine.js';
import { loadAdminState, saveAdminState, copyText, saveAdminExportFile, buildThesisExportBaseName, exportThesisDocx, exportThesisPdf } from './services/storage-service.js';
import { callTaskApi, testApiConnection } from './services/provider-service.js';

const viewMeta = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Desktop admin separata dall\'app utenti, con gestione e generazione tesi complete.'
  },
  theses: {
    title: 'Gestione Tesi',
    subtitle: 'Creazione, apertura, duplicazione, archiviazione ed eliminazione reale delle tesi admin.'
  },
  workspace: {
    title: 'Workspace',
    subtitle: 'Indice, abstract, capitoli, revisioni, osservazioni relatore e versioni senza limiti commerciali.'
  },
  events: {
    title: 'Eventi e Diagnostica',
    subtitle: 'Storico locale delle operazioni svolte nella desktop admin.'
  },
  providers: {
    title: 'Provider e Prompt',
    subtitle: 'Configurazione dell\'endpoint remoto AccademIA usato dalla desktop admin.'
  },
  tools: {
    title: 'Strumenti Admin',
    subtitle: 'Azioni rapide sulla tesi corrente e strumenti operativi interni.'
  }
};

let state = createInitialAdminState();
let autosaveTimer = null;
let heartbeatTimer = null;
let currentOperation = null;
let operationTicker = null;
let pendingAutosaveAfterOperation = false;
let appMeta = null;
let latestPreflightReport = null;

const titleEl = document.getElementById('view-title');
const subtitleEl = document.getElementById('view-subtitle');
const appInfoEl = document.getElementById('app-info');
const buttons = Array.from(document.querySelectorAll('.nav-item'));
const views = Array.from(document.querySelectorAll('.view'));
const toastEl = document.getElementById('toast');
const saveStateEl = document.getElementById('workspace-save-state');
const statusLogEl = document.getElementById('workspace-status-log');
const runtimeStripEl = document.getElementById('workspace-runtime-strip');
const runtimeDirtyEl = document.getElementById('runtime-dirty-indicator');
const runtimeSaveEl = document.getElementById('runtime-save-indicator');
const runtimeOpEl = document.getElementById('runtime-op-indicator');
const recoveryBannerEl = document.getElementById('workspace-recovery-banner');
const recoveryMessageEl = document.getElementById('workspace-recovery-message');
const recoveryOpenBtnEl = document.getElementById('workspace-recovery-open-btn');
const recoveryDismissBtnEl = document.getElementById('workspace-recovery-dismiss-btn');

const thesisForm = document.getElementById('thesis-form');
const thesisListEl = document.getElementById('thesis-list');
const thesisEmptyEl = document.getElementById('thesis-empty-state');
const thesisCountBadgeEl = document.getElementById('thesis-count-badge');
const thesisSearchEl = document.getElementById('thesis-search');
const thesisFilterEl = document.getElementById('thesis-filter-status');
const thesisSortEl = document.getElementById('thesis-sort-mode');
const workspaceEmptyEl = document.getElementById('workspace-empty');
const workspacePanelEl = document.getElementById('workspace-panel');
const workspaceTitleEl = document.getElementById('workspace-title');
const workspaceSubtitleEl = document.getElementById('workspace-subtitle');
const workspaceThesisBadgeEl = document.getElementById('workspace-thesis-badge');
const eventsListEl = document.getElementById('events-list');
const settingsStatusEl = document.getElementById('settings-status');
const toolAppVersionEl = document.getElementById('tool-app-version');
const toolAppPlatformEl = document.getElementById('tool-app-platform');
const toolAppElectronEl = document.getElementById('tool-app-electron');
const toolAppStorageStatusEl = document.getElementById('tool-app-storage-status');
const toolRunPreflightBtnEl = document.getElementById('tool-run-preflight-btn');
const toolCopyAppSummaryBtnEl = document.getElementById('tool-copy-app-summary-btn');
const toolOpenStateFolderBtnEl = document.getElementById('tool-open-state-folder-btn');
const toolsSystemReportEl = document.getElementById('tools-system-report');

const eventsSearchEl = document.getElementById('events-search');
const eventsSeverityFilterEl = document.getElementById('events-filter-severity');
const eventsTypeFilterEl = document.getElementById('events-filter-type');
const eventsExportTxtBtnEl = document.getElementById('events-export-txt-btn');
const eventsExportJsonBtnEl = document.getElementById('events-export-json-btn');
const eventsCopySummaryBtnEl = document.getElementById('events-copy-summary-btn');
const diagTotalCountEl = document.getElementById('diag-total-count');
const diagErrorCountEl = document.getElementById('diag-error-count');
const diagWarningCountEl = document.getElementById('diag-warning-count');
const diagLastEventEl = document.getElementById('diag-last-event');

const dashboardMetrics = {
  total: document.getElementById('metric-theses-total'),
  active: document.getElementById('metric-theses-active'),
  events: document.getElementById('metric-events-total'),
  critical: document.getElementById('metric-events-critical')
};

const createFacultySelectEl = document.getElementById('field-faculty');
const createFacultyCustomWrapEl = document.getElementById('field-faculty-custom-wrap');
const createFacultyCustomEl = document.getElementById('field-faculty-custom');
const workspaceFacultySelectEl = document.getElementById('workspace-field-faculty');
const workspaceFacultyCustomWrapEl = document.getElementById('workspace-faculty-custom-wrap');
const workspaceFacultyCustomEl = document.getElementById('workspace-field-faculty-custom');

const createFields = {
  title: document.getElementById('field-title'),
  course: document.getElementById('field-course'),
  degreeType: document.getElementById('field-degree-type'),
  topic: document.getElementById('field-topic'),
  method: document.getElementById('field-method'),
  notes: document.getElementById('field-notes')
};

const workspaceFields = {
  title: document.getElementById('workspace-field-title'),
  course: document.getElementById('workspace-field-course'),
  degreeType: document.getElementById('workspace-field-degree-type'),
  method: document.getElementById('workspace-field-method'),
  topic: document.getElementById('workspace-field-topic'),
  notes: document.getElementById('workspace-field-notes')
};

const chapterSelectEl = document.getElementById('workspace-chapter-select');
const chapterTitleEl = document.getElementById('workspace-chapter-title');
const chapterContentEl = document.getElementById('workspace-chapter-content');
const outlineEl = document.getElementById('workspace-outline');
const abstractEl = document.getElementById('workspace-abstract');
const outlineVersionSelectEl = document.getElementById('outline-version-select');
const abstractVersionSelectEl = document.getElementById('abstract-version-select');
const chapterVersionSelectEl = document.getElementById('chapter-version-select');
const outlineVersionMetaEl = document.getElementById('outline-version-meta');
const abstractVersionMetaEl = document.getElementById('abstract-version-meta');
const chapterVersionMetaEl = document.getElementById('chapter-version-meta');
const settingsApiBaseEl = document.getElementById('settings-api-base');
const settingsTimeoutEl = document.getElementById('settings-timeout');

const outlineReviewBox = document.getElementById('outline-review-box');
const abstractReviewBox = document.getElementById('abstract-review-box');
const chapterReviewBox = document.getElementById('chapter-review-box');
const chapterTutorBox = document.getElementById('chapter-tutor-box');
const outlineReviewNotesEl = document.getElementById('outline-review-notes');
const abstractReviewNotesEl = document.getElementById('abstract-review-notes');
const chapterReviewNotesEl = document.getElementById('chapter-review-notes');
const chapterTutorNotesEl = document.getElementById('chapter-tutor-notes');
const chapterIncludeNotesEl = document.getElementById('chapter-include-notes');
const chapterIncludeOpeningEl = document.getElementById('chapter-include-opening');


function hasOption(selectEl, value) {
  return Array.from(selectEl?.options || []).some((option) => option.value === value);
}

function toggleCustomFaculty(selectEl, customWrapEl, customInputEl) {
  const isCustom = selectEl?.value === '__custom__';
  customWrapEl?.classList.toggle('hidden', !isCustom);
  if (!isCustom && customInputEl) customInputEl.value = '';
}

function syncFacultyField(selectEl, customWrapEl, customInputEl, value = '') {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    if (selectEl) selectEl.value = '';
    if (customWrapEl) customWrapEl.classList.add('hidden');
    if (customInputEl) customInputEl.value = '';
    return;
  }

  if (hasOption(selectEl, normalizedValue) && normalizedValue !== '__custom__') {
    selectEl.value = normalizedValue;
    customWrapEl?.classList.add('hidden');
    if (customInputEl) customInputEl.value = '';
    return;
  }

  if (selectEl) selectEl.value = '__custom__';
  customWrapEl?.classList.remove('hidden');
  if (customInputEl) customInputEl.value = normalizedValue;
}

function getFacultyValue(selectEl, customInputEl) {
  if (!selectEl) return '';
  if (selectEl.value === '__custom__') return String(customInputEl?.value || '').trim();
  return String(selectEl.value || '').trim();
}

function setView(viewName) {
  buttons.forEach((button) => button.classList.toggle('active', button.dataset.view === viewName));
  views.forEach((view) => view.classList.toggle('active-view', view.id === `view-${viewName}`));
  const meta = viewMeta[viewName];
  titleEl.textContent = meta.title;
  subtitleEl.textContent = meta.subtitle;
}

function getCurrentThesis() {
  return state.theses.find((thesis) => thesis.id === state.currentThesisId) || null;
}

function getRuntimeState() {
  state.workspaceRuntime = state.workspaceRuntime || {
    dirty: false,
    dirtyAt: null,
    lastSavedAt: null,
    heartbeatAt: null,
    lastClosedAt: null,
    pendingOperation: null,
    recoveryNotice: null
  };
  return state.workspaceRuntime;
}

function formatCompactDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return value;
  }
}

function markWorkspaceDirty(reason = 'Modifiche locali') {
  const runtime = getRuntimeState();
  runtime.dirty = true;
  runtime.dirtyAt = new Date().toISOString();
  setSaveState('Modifiche non salvate', 'pending');
  renderRuntimeState(reason);
}

function renderRuntimeState(reason = '') {
  const runtime = getRuntimeState();
  const thesis = getCurrentThesis();
  runtimeStripEl.classList.toggle('hidden', !thesis);

  runtimeDirtyEl.className = 'runtime-chip';
  runtimeSaveEl.className = 'runtime-chip';
  runtimeOpEl.className = 'runtime-chip';

  if (!thesis) {
    runtimeDirtyEl.textContent = 'Stato bozza: —';
    runtimeSaveEl.textContent = 'Ultimo salvataggio: —';
    runtimeOpEl.textContent = 'Operazioni: nessuna';
    recoveryBannerEl.classList.add('hidden');
    return;
  }

  runtimeDirtyEl.textContent = runtime.dirty
    ? `Stato bozza: modifiche locali${reason ? ` · ${reason}` : ''}`
    : 'Stato bozza: stabile';
  if (runtime.dirty) runtimeDirtyEl.classList.add('warning');

  runtimeSaveEl.textContent = `Ultimo salvataggio: ${formatCompactDate(runtime.lastSavedAt)}`;
  if (!runtime.lastSavedAt) runtimeSaveEl.classList.add('warning');

  if (runtime.pendingOperation) {
    runtimeOpEl.textContent = `Operazioni: ${runtime.pendingOperation.label} · avviata ${formatCompactDate(runtime.pendingOperation.startedAt)}`;
    runtimeOpEl.classList.add('warning');
  } else {
    runtimeOpEl.textContent = 'Operazioni: nessuna';
  }

  if (runtime.recoveryNotice?.message) {
    recoveryMessageEl.textContent = runtime.recoveryNotice.message;
    recoveryBannerEl.classList.remove('hidden');
    recoveryOpenBtnEl.disabled = !runtime.recoveryNotice.thesisId;
  } else {
    recoveryBannerEl.classList.add('hidden');
  }
}

function renderVersionMeta(el, versions) {
  if (!el) return;
  if (!versions.length) {
    el.textContent = 'Nessuna versione salvata.';
    return;
  }
  const latest = versions[0];
  el.textContent = `${versions.length} versioni disponibili · ultima ${formatCompactDate(latest.createdAt)}`;
}

function detectRecoveryState() {
  const runtime = getRuntimeState();
  const heartbeat = runtime.heartbeatAt ? new Date(runtime.heartbeatAt).getTime() : 0;
  const closed = runtime.lastClosedAt ? new Date(runtime.lastClosedAt).getTime() : 0;

  if (runtime.pendingOperation) {
    runtime.recoveryNotice = {
      thesisId: runtime.pendingOperation.thesisId || null,
      kind: 'operation-interrupted',
      createdAt: new Date().toISOString(),
      message: `La sessione precedente si è chiusa durante "${runtime.pendingOperation.label}". Ho ripristinato l'ultimo stato locale disponibile.`
    };
    runtime.pendingOperation = null;
    runtime.dirty = false;
    runtime.dirtyAt = null;
    return true;
  }

  if (runtime.dirty && heartbeat && (!closed || closed + 1500 < heartbeat)) {
    runtime.recoveryNotice = {
      thesisId: state.currentThesisId || null,
      kind: 'unclean-close',
      createdAt: new Date().toISOString(),
      message: 'La desktop non risulta chiusa in modo pulito. Ho riaperto l’ultimo stato locale disponibile del workspace.'
    };
    runtime.dirty = false;
    runtime.dirtyAt = null;
    return true;
  }

  return false;
}

async function persistHeartbeat() {
  const runtime = getRuntimeState();
  runtime.heartbeatAt = new Date().toISOString();
  // P1.3: salva solo se ci sono modifiche o operazioni pendenti
  if (!runtime.dirty && !runtime.pendingOperation) return;
  try {
    await saveAdminState(state);
  } catch (_) {
    // best effort silenzioso
  }
}

function startHeartbeat() {
  if (heartbeatTimer) window.clearInterval(heartbeatTimer);
  persistHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    persistHeartbeat();
  }, 20000);
}

function setSessionClosedMarker() {
  const runtime = getRuntimeState();
  runtime.lastClosedAt = new Date().toISOString();
  try {
    window.localStorage.setItem('accademia-admin-desktop-last-closed', runtime.lastClosedAt);
  } catch (_) {
    // ignore
  }
  try {
    const raw = JSON.stringify(normalizeAdminState(state));
    window.accademiaAdmin?.storage?.saveStateSync?.(raw);
  } catch (_) {
    // fallback silenzioso: resta almeno il marker locale
  }
}

async function persistState(mode = 'saved') {
  try {
    const runtime = getRuntimeState();
    runtime.lastSavedAt = new Date().toISOString();
    runtime.lastClosedAt = null;
    if (mode !== 'pending') {
      runtime.dirty = false;
      runtime.dirtyAt = null;
    }
    await saveAdminState(state);
    const saveLabel = mode === 'pending' ? 'Salvataggio in corso…' : `Salvato · ${formatCompactDate(runtime.lastSavedAt)}`;
    setSaveState(saveLabel, mode);
    renderMetrics();
    renderRuntimeState();
  } catch (error) {
    console.error('Persistenza locale non riuscita:', error);
    setSaveState('Errore salvataggio', 'error');
    renderRuntimeState();
    showToast(error?.message || 'Errore nel salvataggio locale.', true);
  }
}

function setSaveState(message, mode = 'saved') {
  saveStateEl.textContent = message;
  saveStateEl.dataset.mode = mode;
}

function showToast(message, error = false) {
  toastEl.textContent = message;
  toastEl.className = `toast${error ? ' error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toastEl.className = 'toast hidden';
  }, 3200);
}

function setBusyUi(isBusy) {
  const controls = Array.from(document.querySelectorAll('.shell button, .shell input, .shell textarea, .shell select'));
  controls.forEach((el) => {
    if (isBusy) {
      el.dataset.prevDisabled = el.disabled ? '1' : '0';
      el.disabled = true;
      return;
    }
    if (Object.prototype.hasOwnProperty.call(el.dataset, 'prevDisabled')) {
      el.disabled = el.dataset.prevDisabled === '1';
      delete el.dataset.prevDisabled;
    }
  });
}

function logStatus(message, mode = 'idle', detail = '') {
  statusLogEl.classList.toggle('busy', mode === 'busy');
  statusLogEl.classList.toggle('error', mode === 'error');
  if (mode === 'busy') {
    statusLogEl.innerHTML = `<div class="status-line"><span class="status-spinner"></span><strong>${escapeHtml(message)}</strong></div>${detail ? `<div class="status-detail">${escapeHtml(detail)}</div>` : ''}`;
    return;
  }
  statusLogEl.innerHTML = `<strong>${escapeHtml(message)}</strong>${detail ? `<div class="status-detail">${escapeHtml(detail)}</div>` : ''}`;
}

function stopOperationTicker() {
  if (operationTicker) {
    window.clearInterval(operationTicker);
    operationTicker = null;
  }
}

async function startOperation(label, detail, taskName = null) {
  if (currentOperation) {
    showToast("È già in corso un'operazione. Attendi il completamento.", true);
    return false;
  }
  saveWorkspaceFieldsToState({ silent: true, immediate: true });
  await persistState('saved');
  stopOperationTicker();
  currentOperation = { label, startedAt: Date.now(), taskName };
  const runtime = getRuntimeState();
  runtime.pendingOperation = {
    label,
    taskName,
    thesisId: getCurrentThesis()?.id || null,
    startedAt: new Date().toISOString()
  };
  await persistState('saved');
  setBusyUi(true);
  setSaveState('Operazione in corso…', 'pending');
  renderRuntimeState();
  logStatus(label, 'busy', detail || 'Connessione al provider in corso…');
  operationTicker = window.setInterval(() => {
    if (!currentOperation) return;
    const seconds = Math.max(1, Math.floor((Date.now() - currentOperation.startedAt) / 1000));
    let stage = 'Richiesta inviata. Attendi il completamento della generazione…';
    if (seconds > 12) stage = 'Elaborazione ancora in corso. La richiesta non è bloccata.';
    if (seconds > 35) stage = 'Elaborazione estesa: il provider sta ancora lavorando sul contenuto.';
    logStatus(currentOperation.label, 'busy', `${stage} (${seconds}s)`);
    renderRuntimeState();
  }, 1200);
  return true;
}

async function finishOperation(message, mode = 'success', detail = '') {
  stopOperationTicker();
  currentOperation = null;
  const runtime = getRuntimeState();
  runtime.pendingOperation = null;
  setBusyUi(false);
  if (mode === 'error') {
    await persistState('saved');
    setSaveState('Errore operazione', 'error');
    renderRuntimeState();
    logStatus(message, 'error', detail);
    if (pendingAutosaveAfterOperation) {
      pendingAutosaveAfterOperation = false;
      scheduleAutosave();
    }
    return;
  }
  await persistState('saved');
  logStatus(message, 'idle', detail);
  if (pendingAutosaveAfterOperation) {
    pendingAutosaveAfterOperation = false;
    scheduleAutosave();
  }
}

function updateOperationDetail(detail) {
  logStatus(detail, 'busy', '');
}

function cleanMarkdown(text) {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/^___+$/gm, '')
    .replace(/\[(\d+)\]\s*:/g, '$1.')
    // Rimuovi heading "Capitolo X..." solo se immediatamente prima della sezione Note
    .replace(/\n+Capitolo\s+\d+[^\n]*\n+(?=Note\b)/gi, '\n\n')
    // Rimuovi backslash prima dei numeri nelle note (1\. → 1., Note1. → 1.)
    .replace(/^Note(\d+)\\?\.\s*/gm, '$1. ')
    .replace(/^(\d+)\\(\.\s)/gm, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function appendEvent(type, message, payload = {}) {
  pushAdminEvent(state, type, message, payload);
  persistState();
  renderEvents();
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString('it-IT');
  } catch (_) {
    return value || '';
  }
}
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getPreflightStatusLabel(status) {
  return {
    ok: 'OK',
    warning: 'Avviso',
    error: 'Errore'
  }[status] || 'Info';
}

function renderAppSystemInfo(info) {
  if (!info) return;
  if (toolAppVersionEl) toolAppVersionEl.textContent = `v${info.version || '—'}`;
  if (toolAppPlatformEl) toolAppPlatformEl.textContent = info.platform || '—';
  if (toolAppElectronEl) toolAppElectronEl.textContent = info.electronVersion || '—';
  if (toolAppStorageStatusEl) toolAppStorageStatusEl.textContent = info.stateDirectoryPath ? 'Pronto' : 'Non disponibile';
}

function renderPreflightReport(report) {
  if (!toolsSystemReportEl) return;
  if (!report) {
    toolsSystemReportEl.className = 'empty-state compact-empty-state';
    toolsSystemReportEl.textContent = 'Nessuna verifica eseguita.';
    return;
  }

  if (report.error && (!Array.isArray(report.checks) || !report.checks.length)) {
    toolsSystemReportEl.className = 'system-report';
    toolsSystemReportEl.innerHTML = `<div class="system-check-item"><div class="system-check-item-head"><span class="system-check-label">Verifica non riuscita</span><span class="system-check-status error">Errore</span></div><div class="system-check-detail">${escapeHtml(report.error)}</div></div>`;
    return;
  }

  const checks = Array.isArray(report.checks) ? report.checks : [];
  const counts = report.counts || {};
  const head = `
    <div class="system-report-head">
      <div class="system-report-title">Verifica app e packaging</div>
      <div class="system-report-meta">${formatDate(report.createdAt)} · OK ${counts.ok || 0} · Avvisi ${counts.warning || 0} · Errori ${counts.error || 0}</div>
    </div>
  `;
  const items = checks.map((check) => `
    <div class="system-check-item">
      <div class="system-check-item-head">
        <span class="system-check-label">${escapeHtml(check.label)}</span>
        <span class="system-check-status ${escapeHtml(check.status)}">${getPreflightStatusLabel(check.status)}</span>
      </div>
      <div class="system-check-detail">${escapeHtml(check.detail || '—')}</div>
    </div>
  `).join('');

  toolsSystemReportEl.className = 'system-report';
  toolsSystemReportEl.innerHTML = `${head}<div class="system-check-list">${items}</div>`;
}

function buildAppSummaryText() {
  const info = appMeta || {};
  const report = latestPreflightReport || {};
  const counts = report.counts || {};
  return [
    `App: ${info.appName || 'AccademIA Admin Desktop'}`,
    `Versione: ${info.version || '—'}`,
    `Piattaforma: ${info.platform || '—'}`,
    `Electron: ${info.electronVersion || '—'}`,
    `Node: ${info.nodeVersion || '—'}`,
    `Chrome: ${info.chromeVersion || '—'}`,
    `Cartella dati: ${info.stateDirectoryPath || '—'}`,
    `File stato: ${info.stateFilePath || '—'}`,
    `Ultima verifica: ${report.createdAt ? formatDate(report.createdAt) : 'mai eseguita'}`,
    `Esito verifica: OK ${counts.ok || 0} · Avvisi ${counts.warning || 0} · Errori ${counts.error || 0}`
  ].join('\n');
}

async function runPreflightCheck() {
  if (!window.accademiaAdmin?.diagnostics?.runPreflightCheck) {
    showToast('Controllo app non disponibile in questa build.', true);
    return;
  }
  if (toolsSystemReportEl) {
    toolsSystemReportEl.className = 'empty-state compact-empty-state';
    toolsSystemReportEl.textContent = 'Verifica app e packaging in corso…';
  }
  const report = await window.accademiaAdmin.diagnostics.runPreflightCheck();
  latestPreflightReport = report;
  renderPreflightReport(report);
  appendEvent(
    'preflight',
    report.ok ? 'Verifica app e packaging completata' : 'Verifica app e packaging con criticità',
    { severity: report.ok ? 'info' : 'warning', report }
  );
  showToast(report.ok ? 'Verifica completata.' : 'Verifica completata con criticità.');
}

async function copyAppSummary() {
  try {
    await copyText(buildAppSummaryText());
    showToast('Sintesi ambiente copiata.');
  } catch (error) {
    showToast(error?.message || 'Impossibile copiare la sintesi ambiente.', true);
  }
}

async function openStateFolderFromTools() {
  if (!window.accademiaAdmin?.storage?.revealStateFolder) {
    showToast('Funzione non disponibile in questa build.', true);
    return;
  }
  const result = await window.accademiaAdmin.storage.revealStateFolder();
  if (result?.ok) {
    appendEvent('storage', 'Aperta cartella dati locale desktop', { severity: 'info', path: result.path });
    showToast('Cartella dati locale aperta.');
    return;
  }
  showToast(result?.error || 'Impossibile aprire la cartella dati locale.', true);
}

function getEventSeverity(event) {
  const severity = String(event?.severity || event?.payload?.severity || '').toLowerCase();
  if (severity) return severity;
  const type = String(event?.type || '').toLowerCase();
  if (type.includes('error') || type.includes('fail')) return 'error';
  if (type === 'recovery' || type === 'archive' || type.includes('warning')) return 'warning';
  if (type === 'settings' || type === 'provider_test' || type === 'export') return 'info';
  return 'success';
}

function getSeverityLabel(severity) {
  return {
    error: 'Errore',
    warning: 'Avviso',
    info: 'Info',
    success: 'OK'
  }[severity] || 'Info';
}

function getThesisTitleById(thesisId) {
  if (!thesisId) return '';
  return state.theses.find((thesis) => thesis.id === thesisId)?.title || '';
}

function getEventRelatedThesis(event) {
  const thesisId = event?.payload?.thesisId || event?.payload?.recovery?.thesisId || null;
  if (!thesisId) return null;
  const thesis = state.theses.find((item) => item.id === thesisId);
  if (!thesis) return { id: thesisId, title: 'Tesi non più presente' };
  return { id: thesis.id, title: thesis.title || 'Tesi senza titolo' };
}

function buildEventSearchHaystack(event) {
  const thesis = getEventRelatedThesis(event);
  return [
    event.message,
    event.type,
    event.severity,
    thesis?.title,
    thesis?.id,
    event?.payload?.error,
    JSON.stringify(event.payload || {})
  ].join(' ').toLowerCase();
}

function getFilteredEvents() {
  const search = String(eventsSearchEl?.value || '').trim().toLowerCase();
  const severityFilter = eventsSeverityFilterEl?.value || 'all';
  const typeFilter = eventsTypeFilterEl?.value || 'all';

  return state.events.filter((event) => {
    const severity = getEventSeverity(event);
    if (severityFilter !== 'all' && severity !== severityFilter) return false;
    if (typeFilter !== 'all' && event.type !== typeFilter) return false;
    if (search && !buildEventSearchHaystack(event).includes(search)) return false;
    return true;
  });
}

function renderEventTypeFilterOptions() {
  if (!eventsTypeFilterEl) return;
  const previous = eventsTypeFilterEl.value || 'all';
  const types = Array.from(new Set(state.events.map((event) => event.type).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'it'));
  eventsTypeFilterEl.innerHTML = '<option value="all">Tutti i tipi evento</option>';
  for (const type of types) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    eventsTypeFilterEl.appendChild(option);
  }
  eventsTypeFilterEl.value = types.includes(previous) || previous === 'all' ? previous : 'all';
}

function buildDiagnosticsSummary(events) {
  const total = state.events.length;
  const errorCount = state.events.filter((event) => getEventSeverity(event) === 'error').length;
  const warningCount = state.events.filter((event) => getEventSeverity(event) === 'warning').length;
  const lastEvent = state.events[0];

  if (diagTotalCountEl) diagTotalCountEl.textContent = String(total);
  if (diagErrorCountEl) diagErrorCountEl.textContent = String(errorCount);
  if (diagWarningCountEl) diagWarningCountEl.textContent = String(warningCount);
  if (diagLastEventEl) diagLastEventEl.textContent = lastEvent ? formatCompactDate(lastEvent.createdAt) : '—';

  return {
    total,
    errorCount,
    warningCount,
    filteredCount: events.length,
    lastEventAt: lastEvent?.createdAt || null
  };
}

function buildEventsExportPayload(events) {
  return events.map((event) => ({
    ...event,
    severity: getEventSeverity(event),
    thesisTitle: getEventRelatedThesis(event)?.title || ''
  }));
}

function buildEventsSummaryText(events, summary) {
  const lines = [
    'ACCADEMIA ADMIN DESKTOP · DIAGNOSTICA',
    `Totale log: ${summary.total}`,
    `Eventi filtrati: ${summary.filteredCount}`,
    `Errori: ${summary.errorCount}`,
    `Avvisi: ${summary.warningCount}`,
    `Ultimo evento: ${summary.lastEventAt ? formatDate(summary.lastEventAt) : '—'}`,
    ''
  ];

  for (const event of events) {
    const severity = getSeverityLabel(getEventSeverity(event));
    const thesis = getEventRelatedThesis(event);
    lines.push(`[${formatDate(event.createdAt)}] [${severity}] ${event.type} · ${event.message}`);
    if (thesis?.title) lines.push(`Tesi: ${thesis.title}`);
    if (event?.payload?.error) lines.push(`Errore: ${event.payload.error}`);
    const payload = JSON.stringify(event.payload || {}, null, 2);
    if (payload && payload !== '{}') lines.push(payload);
    lines.push('');
  }

  return lines.join('\n');
}

function slugify(text) {
  return String(text || 'file')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tesi';
}

function renderMetrics() {
  dashboardMetrics.total.textContent = String(state.theses.length);
  dashboardMetrics.active.textContent = String(state.theses.filter((thesis) => !thesis.archived).length);
  dashboardMetrics.events.textContent = String(state.events.length);
  dashboardMetrics.critical.textContent = String(state.events.filter((event) => ['error', 'warning'].includes(getEventSeverity(event))).length);
}

function renderThesisList() {
  const search = String(thesisSearchEl.value || '').trim().toLowerCase();
  const filter = thesisFilterEl.value;
  const sort = thesisSortEl.value;
  let items = state.theses.slice();

  if (filter === 'active') items = items.filter((thesis) => !thesis.archived);
  if (filter === 'archived') items = items.filter((thesis) => thesis.archived);
  if (search) {
    items = items.filter((thesis) => [thesis.title, thesis.faculty, thesis.course, thesis.topic]
      .join(' ')
      .toLowerCase()
      .includes(search));
  }

  items.sort((a, b) => {
    if (sort === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sort === 'title') return a.title.localeCompare(b.title, 'it');
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  thesisCountBadgeEl.textContent = `${items.length} tesi`;
  thesisListEl.innerHTML = '';
  thesisEmptyEl.classList.toggle('hidden', items.length > 0);

  for (const thesis of items) {
    const item = document.createElement('article');
    item.className = `thesis-item${thesis.id === state.currentThesisId ? ' selected' : ''}`;
    item.innerHTML = `
      <div class="thesis-item-top">
        <div>
          <h3>${escapeHtml(thesis.title || 'Tesi senza titolo')}</h3>
          <p>${escapeHtml(thesis.faculty || 'Facoltà non indicata')} · ${escapeHtml(thesis.course || 'Corso non indicato')}</p>
        </div>
        <div class="item-badges">
          <span class="mini-badge${thesis.archived ? ' archived' : ''}">${thesis.archived ? 'Archiviata' : 'Attiva'}</span>
          <span class="mini-badge">${escapeHtml(thesis.method || 'Teorica')}</span>
        </div>
      </div>
      <p class="topic-preview">${escapeHtml(thesis.topic || 'Nessun argomento')}</p>
      <div class="thesis-item-footer">
        <span>Aggiornata: ${formatDate(thesis.updatedAt)}</span>
        <div class="row-actions">
          <button class="ghost-btn small-btn" data-action="open" data-id="${thesis.id}">Apri</button>
          <button class="ghost-btn small-btn" data-action="duplicate" data-id="${thesis.id}">Duplica</button>
          <button class="ghost-btn small-btn" data-action="archive" data-id="${thesis.id}">${thesis.archived ? 'Riattiva' : 'Archivia'}</button>
          <button class="danger-btn small-btn" data-action="delete" data-id="${thesis.id}">Elimina</button>
        </div>
      </div>`;
    thesisListEl.appendChild(item);
  }
}

function renderWorkspace() {
  const thesis = getCurrentThesis();
  const buttons = [
    document.getElementById('workspace-save-btn'),
    document.getElementById('workspace-duplicate-btn'),
    document.getElementById('workspace-archive-btn'),
    document.getElementById('workspace-delete-btn'),
    document.getElementById('outline-generate-btn'),
    document.getElementById('outline-revise-toggle-btn'),
    document.getElementById('abstract-generate-btn'),
    document.getElementById('abstract-revise-toggle-btn'),
    document.getElementById('chapter-generate-btn'),
    document.getElementById('chapter-revise-toggle-btn'),
    document.getElementById('chapter-tutor-toggle-btn'),
    document.getElementById('tool-export-thesis-btn'),
    document.getElementById('tool-export-thesis-html-btn'),
    document.getElementById('tool-export-thesis-json-btn'),
    document.getElementById('tool-export-thesis-docx-btn'),
    document.getElementById('tool-export-thesis-pdf-btn'),
    document.getElementById('tool-duplicate-current-btn'),
    document.getElementById('tool-archive-current-btn')
  ];

  if (!thesis) {
    workspaceEmptyEl.classList.remove('hidden');
    workspacePanelEl.classList.add('hidden');
    workspaceTitleEl.textContent = 'Workspace tesi';
    workspaceSubtitleEl.textContent = 'Apri una tesi dall\'archivio per generare e revisionare i contenuti.';
    workspaceThesisBadgeEl.textContent = 'Nessuna tesi';
    setSaveState('Nessuna tesi aperta', 'idle');
    buttons.forEach((button) => { if (button) button.disabled = true; });
    renderRuntimeState();
    syncFacultyField(workspaceFacultySelectEl, workspaceFacultyCustomWrapEl, workspaceFacultyCustomEl, '');
    chapterSelectEl.innerHTML = '';
    outlineVersionSelectEl.innerHTML = '';
    abstractVersionSelectEl.innerHTML = '';
    chapterVersionSelectEl.innerHTML = '';
    logStatus('Nessuna operazione eseguita.');
    return;
  }

  workspaceEmptyEl.classList.add('hidden');
  workspacePanelEl.classList.remove('hidden');
  buttons.forEach((button) => { if (button) button.disabled = false; });

  workspaceTitleEl.textContent = thesis.title || 'Tesi senza titolo';
  workspaceSubtitleEl.textContent = `${thesis.faculty || 'Facoltà'} · ${thesis.course || 'Corso'} · ${thesis.degreeType || ''}`;
  workspaceThesisBadgeEl.textContent = thesis.archived ? 'Tesi archiviata' : 'Tesi attiva';
  document.getElementById('workspace-archive-btn').textContent = thesis.archived ? 'Riattiva' : 'Archivia';
  document.getElementById('tool-archive-current-btn').textContent = thesis.archived ? 'Riattiva tesi corrente' : 'Archivia tesi corrente';

  Object.entries(workspaceFields).forEach(([key, field]) => {
    if (field && document.activeElement !== field) {
      field.value = thesis[key] || '';
    }
  });

  if (![workspaceFacultySelectEl, workspaceFacultyCustomEl].includes(document.activeElement)) {
    syncFacultyField(workspaceFacultySelectEl, workspaceFacultyCustomWrapEl, workspaceFacultyCustomEl, thesis.faculty || '');
  }

  outlineEl.value = thesis.outline || '';
  abstractEl.value = thesis.abstract || '';
  renderChapterSelect(thesis);
  renderCurrentChapter(thesis);
  renderVersionSelect(outlineVersionSelectEl, thesis.outlineVersions || []);
  renderVersionMeta(outlineVersionMetaEl, thesis.outlineVersions || []);
  renderVersionSelect(abstractVersionSelectEl, thesis.abstractVersions || []);
  renderVersionMeta(abstractVersionMetaEl, thesis.abstractVersions || []);
  const chapterVersions = (thesis.chapters[thesis.currentChapterIndex] || {}).versions || [];
  renderVersionSelect(chapterVersionSelectEl, chapterVersions);
  renderVersionMeta(chapterVersionMetaEl, chapterVersions);
  renderRuntimeState();
}

function renderChapterSelect(thesis) {
  chapterSelectEl.innerHTML = '';
  const total = Math.max(thesis.chapters.length, thesis.chapterTitles.length);
  ensureChapterCount(thesis, total || thesis.chapters.length || thesis.chapterTitles.length || 1);
  thesis.chapters.forEach((chapter, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    const realTitle = resolveChapterTitle(thesis, index);
    option.textContent = `Capitolo ${index + 1} — ${realTitle}`;
    if (index === thesis.currentChapterIndex) option.selected = true;
    chapterSelectEl.appendChild(option);
  });
}

function renderCurrentChapter(thesis) {
  const chapter = thesis.chapters[thesis.currentChapterIndex] || null;
  const approveBtn = document.getElementById('chapter-approve-btn');
  if (!chapter) {
    chapterTitleEl.value = '';
    chapterContentEl.value = '';
    renderVersionSelect(chapterVersionSelectEl, []);
    renderVersionMeta(chapterVersionMetaEl, []);
    if (approveBtn) approveBtn.classList.add('hidden');
    return;
  }
  chapterTitleEl.value = chapter.title || '';
  chapterContentEl.value = chapter.content || '';
  renderVersionSelect(chapterVersionSelectEl, chapter.versions || []);
  renderVersionMeta(chapterVersionMetaEl, chapter.versions || []);
  // Mostra approva solo se capitolo ha contenuto e non è l'ultimo
  const hasContent = !!String(chapter.content || '').trim();
  const plannedCount = parseChapterTitles(thesis.outline || '').length || (thesis.chapterTitles || []).length || thesis.chapters.length;
  const isLast = thesis.currentChapterIndex >= plannedCount - 1;
  if (approveBtn) approveBtn.classList.toggle('hidden', !hasContent || isLast);
}


function renderVersionSelect(selectEl, versions) {
  selectEl.innerHTML = '';
  if (!versions.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nessuna versione salvata';
    selectEl.appendChild(option);
    return;
  }
  versions.forEach((version) => {
    const option = document.createElement('option');
    option.value = version.id;
    option.textContent = `${version.label} · ${formatDate(version.createdAt)}`;
    selectEl.appendChild(option);
  });
}

function renderEvents() {
  renderEventTypeFilterOptions();
  const filteredEvents = getFilteredEvents();
  const summary = buildDiagnosticsSummary(filteredEvents);
  eventsListEl.innerHTML = '';
  if (!filteredEvents.length) {
    eventsListEl.innerHTML = '<div class="empty-state">Nessun evento corrisponde ai filtri impostati.</div>';
    return;
  }
  for (const event of filteredEvents) {
    const severity = getEventSeverity(event);
    const thesis = getEventRelatedThesis(event);
    const payloadText = JSON.stringify(event.payload || {}, null, 2);
    const item = document.createElement('article');
    item.className = 'event-item';
    item.innerHTML = `
      <div class="event-headline">
        <strong>${escapeHtml(event.message)}</strong>
        <span class="event-time">${escapeHtml(formatDate(event.createdAt))}</span>
      </div>
      <div class="event-badges-row">
        <span class="severity-badge ${escapeHtml(severity)}">${escapeHtml(getSeverityLabel(severity))}</span>
        <span class="event-type">${escapeHtml(event.type || 'generic')}</span>
        ${thesis?.title ? `<span class="event-thesis-label">${escapeHtml(thesis.title)}</span>` : ''}
      </div>
      ${event?.payload?.error ? `<div class="event-note">Errore: ${escapeHtml(event.payload.error)}</div>` : ''}
      <details class="event-details">
        <summary>Apri dettaglio evento</summary>
        <pre>${escapeHtml(payloadText)}</pre>
      </details>`;
    eventsListEl.appendChild(item);
  }
}

function scheduleAutosave() {
  if (currentOperation) {
    pendingAutosaveAfterOperation = true;
    return;
  }
  setSaveState('Salvataggio in corso…', 'pending');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    persistState('saved');
  }, 900);
}

function saveWorkspaceFieldsToState(options = {}) {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  Object.entries(workspaceFields).forEach(([key, field]) => {
    thesis[key] = field.value;
  });
  thesis.faculty = getFacultyValue(workspaceFacultySelectEl, workspaceFacultyCustomEl);
  thesis.outline = outlineEl.value;
  thesis.abstract = abstractEl.value;
  ensureChapterCount(thesis, Math.max(thesis.chapters.length, thesis.chapterTitles.length || 1));
  const currentChapter = thesis.chapters[thesis.currentChapterIndex];
  if (currentChapter) {
    currentChapter.content = chapterContentEl.value;
    // Aggiorna il titolo SOLO se il campo contiene un valore non generico.
    // Evita di sovrascrivere titoli reali con "Capitolo N" quando il campo
    // viene re-renderizzato prima che l'utente abbia digitato qualcosa.
    const fieldTitle = chapterTitleEl.value.trim();
    const isGenericTitle = /^Capitolo\s+\d+$/i.test(fieldTitle);
    if (fieldTitle && !isGenericTitle) {
      currentChapter.title = fieldTitle;
      thesis.chapterTitles[thesis.currentChapterIndex] = fieldTitle;
    } else if (!fieldTitle) {
      // Campo vuoto: mantieni il titolo già memorizzato, non cancellarlo
      chapterTitleEl.value = currentChapter.title || '';
    }
    // Se il titolo è generico, non aggiornare: l'indice approvato ha già
    // impostato un titolo reale tramite applyOutlineToThesis.
  }
  thesis.updatedAt = new Date().toISOString();
  renderThesisList();
  if (!options.silent) markWorkspaceDirty(options.reason || 'bozza aggiornata');
  if (options.immediate) {
    persistState('saved');
    return;
  }
  if (!options.silent) scheduleAutosave();
}

function openThesis(id) {
  const thesis = state.theses.find((item) => item.id === id);
  if (!thesis) return;
  state.currentThesisId = id;
  persistState();
  renderThesisList();
  renderWorkspace();
  setView('workspace');
  logStatus(`Aperta tesi: ${thesis.title || 'Senza titolo'}.`);
}

function createNewThesis() {
  const thesis = createThesisFromForm({
    title: createFields.title.value,
    faculty: getFacultyValue(createFacultySelectEl, createFacultyCustomEl),
    course: createFields.course.value,
    degreeType: createFields.degreeType.value,
    topic: createFields.topic.value,
    method: createFields.method.value,
    notes: createFields.notes.value
  });
  state.theses.unshift(thesis);
  state.currentThesisId = thesis.id;
  appendEvent('thesis_create', 'Creata nuova tesi admin', { thesisId: thesis.id, title: thesis.title });
  thesisForm.reset();
  createFields.degreeType.value = 'Triennale';
  createFields.method.value = 'Teorica';
  syncFacultyField(createFacultySelectEl, createFacultyCustomWrapEl, createFacultyCustomEl, '');
  renderThesisList();
  renderWorkspace();
  setView('workspace');
  showToast('Nuova tesi admin creata.');
}

function deleteThesis(id) {
  const thesis = state.theses.find((item) => item.id === id);
  if (!thesis) return;
  const ok = window.confirm(`Eliminare definitivamente la tesi "${thesis.title || 'Senza titolo'}"?`);
  if (!ok) return;
  state.theses = state.theses.filter((item) => item.id !== id);
  if (state.currentThesisId === id) state.currentThesisId = state.theses[0]?.id || null;
  appendEvent('thesis_delete', 'Eliminata tesi admin', { thesisId: id, title: thesis.title });
  renderThesisList();
  renderWorkspace();
  showToast('Tesi eliminata.');
}

function toggleArchiveThesis(id) {
  const thesis = state.theses.find((item) => item.id === id);
  if (!thesis) return;
  thesis.archived = !thesis.archived;
  thesis.updatedAt = new Date().toISOString();
  appendEvent('thesis_archive', thesis.archived ? 'Tesi archiviata' : 'Tesi riattivata', { thesisId: id, title: thesis.title, archived: thesis.archived });
  renderThesisList();
  renderWorkspace();
  showToast(thesis.archived ? 'Tesi archiviata.' : 'Tesi riattivata.');
}

function duplicateThesis(id) {
  const thesis = state.theses.find((item) => item.id === id);
  if (!thesis) return;
  const duplicate = cloneThesis(thesis);
  state.theses.unshift(duplicate);
  state.currentThesisId = duplicate.id;
  appendEvent('thesis_duplicate', 'Duplicata tesi admin', { sourceId: thesis.id, thesisId: duplicate.id, title: duplicate.title });
  renderThesisList();
  renderWorkspace();
  setView('workspace');
  showToast('Tesi duplicata.');
}

function buildThesisExportPayload(thesis) {
  const baseName = buildThesisExportBaseName(thesis?.title || 'tesi-admin');
  const chapters = Array.isArray(thesis?.chapters) ? thesis.chapters : [];
  const text = [
    thesis?.title || 'Tesi senza titolo',
    `${thesis?.faculty || '—'} · ${thesis?.course || '—'} · ${thesis?.degreeType || '—'}`,
    `Metodo: ${thesis?.method || '—'}`,
    '',
    'ARGOMENTO',
    thesis?.topic || '',
    '',
    'INDICE',
    thesis?.outline || '',
    '',
    'ABSTRACT',
    thesis?.abstract || '',
    '',
    ...chapters.flatMap((chapter, index) => [`CAPITOLO ${index + 1} — ${chapter?.title || `Capitolo ${index + 1}`}`, chapter?.content || '', ''])
  ].join('\n');

  return {
    baseName,
    text,
    json: JSON.stringify(thesis, null, 2)
  };
}

function buildAcademicHtmlExport(thesis) {
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const chapters = Array.isArray(thesis?.chapters) ? thesis.chapters : [];
  const chaptersHtml = chapters.map((chapter, index) => `
<section class="chapter-block">
  <h2>Capitolo ${index + 1} — ${escapeHtml(chapter?.title || `Capitolo ${index + 1}`)}</h2>
  <div class="chapter-text">${escapeHtml(chapter?.content || '').replace(/\n/g, '<br />')}</div>
</section>`).join('');

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(thesis?.title || 'Tesi')}</title>
  <style>
    @page { size: A4; margin: 2.3cm 2cm 2.3cm 2cm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111827; line-height: 1.68; font-size: 11.5pt; }
    h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; }
    h1 { text-align: center; font-size: 22pt; margin: 0 0 0.35cm 0; }
    h2 { font-size: 15pt; margin: 1cm 0 0.35cm 0; page-break-after: avoid; }
    .cover { text-align: center; margin-bottom: 1.2cm; }
    .meta { margin: 0.15cm 0; }
    .section-label { font-size: 9.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #4b5563; margin-top: 0.7cm; }
    .block { margin-top: 0.2cm; }
    .chapter-block { page-break-inside: avoid; margin-top: 0.8cm; }
    .chapter-text { margin-top: 0.2cm; text-align: justify; }
    .notes { margin-top: 0.4cm; color: #374151; }
  </style>
</head>
<body>
  <section class="cover">
    <div class="section-label">AccademIA Admin Desktop</div>
    <h1>${escapeHtml(thesis?.title || 'Tesi senza titolo')}</h1>
    <p class="meta"><strong>Facoltà:</strong> ${escapeHtml(thesis?.faculty || '—')}</p>
    <p class="meta"><strong>Corso di laurea:</strong> ${escapeHtml(thesis?.course || '—')}</p>
    <p class="meta"><strong>Tipo laurea:</strong> ${escapeHtml(thesis?.degreeType || '—')}</p>
    <p class="meta"><strong>Metodo:</strong> ${escapeHtml(thesis?.method || '—')}</p>
  </section>
  <div class="section-label">Argomento</div>
  <div class="block">${escapeHtml(thesis?.topic || '').replace(/\n/g, '<br />') || '—'}</div>
  <div class="section-label">Indice</div>
  <div class="block">${escapeHtml(thesis?.outline || '').replace(/\n/g, '<br />') || '—'}</div>
  <div class="section-label">Abstract</div>
  <div class="block">${escapeHtml(thesis?.abstract || '').replace(/\n/g, '<br />') || '—'}</div>
  ${chaptersHtml || '<div class="section-label">Capitoli</div><div class="block">Nessun capitolo disponibile.</div>'}
  ${thesis?.notes ? `<div class="section-label">Note admin</div><div class="notes">${escapeHtml(thesis.notes).replace(/\n/g, '<br />')}</div>` : ''}
</body>
</html>`;
}

async function exportCurrentThesis() {
  const thesis = getCurrentThesis();
  if (!thesis) {
    showToast('Apri prima una tesi.', true);
    return;
  }
  try {
    const payload = buildThesisExportPayload(thesis);
    const result = await saveAdminExportFile({
      raw: payload.text,
      defaultFileName: `${payload.baseName}.txt`,
      title: 'Esporta tesi corrente in TXT',
      filters: [{ name: 'Testo', extensions: ['txt'] }]
    });
    if (!result?.ok) return;
    appendEvent('export', 'Esportata tesi corrente in TXT', { thesisId: thesis.id, format: 'txt', filePath: result.filePath, severity: 'info' });
    showToast('Tesi esportata in TXT.');
  } catch (error) {
    showToast(error?.message || 'Errore export TXT.', true);
  }
}

async function exportCurrentThesisHtml() {
  const thesis = getCurrentThesis();
  if (!thesis) {
    showToast('Apri prima una tesi.', true);
    return;
  }
  try {
    const payload = buildThesisExportPayload(thesis);
    const html = buildAcademicHtmlExport(thesis);
    const result = await saveAdminExportFile({
      raw: html,
      defaultFileName: `${payload.baseName}.html`,
      title: 'Esporta tesi corrente in HTML',
      filters: [{ name: 'HTML', extensions: ['html'] }],
      mimeType: 'text/html;charset=utf-8'
    });
    if (!result?.ok) return;
    appendEvent('export', 'Esportata tesi corrente in HTML', { thesisId: thesis.id, format: 'html', filePath: result.filePath, severity: 'info' });
    showToast('Tesi esportata in HTML.');
  } catch (error) {
    showToast(error?.message || 'Errore export HTML.', true);
  }
}

async function exportCurrentThesisJson() {
  const thesis = getCurrentThesis();
  if (!thesis) {
    showToast('Apri prima una tesi.', true);
    return;
  }
  try {
    const payload = buildThesisExportPayload(thesis);
    const result = await saveAdminExportFile({
      raw: payload.json,
      defaultFileName: `${payload.baseName}.json`,
      title: 'Esporta tesi corrente in JSON',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      mimeType: 'application/json;charset=utf-8'
    });
    if (!result?.ok) return;
    appendEvent('export', 'Esportata tesi corrente in JSON', { thesisId: thesis.id, format: 'json', filePath: result.filePath, severity: 'info' });
    showToast('Tesi esportata in JSON.');
  } catch (error) {
    showToast(error?.message || 'Errore export JSON.', true);
  }
}

async function exportCurrentThesisDocx() {
  const thesis = getCurrentThesis();
  if (!thesis) {
    showToast('Apri prima una tesi.', true);
    return;
  }
  try {
    const payload = buildThesisExportPayload(thesis);
    const result = await exportThesisDocx(thesis, `${payload.baseName}.docx`);
    if (!result?.ok) return;
    appendEvent('export', 'Esportata tesi corrente in DOCX', { thesisId: thesis.id, format: 'docx', filePath: result.filePath, severity: 'info' });
    showToast('Tesi esportata in DOCX.');
  } catch (error) {
    showToast(error?.message || 'Errore export DOCX.', true);
  }
}

async function exportCurrentThesisPdf() {
  const thesis = getCurrentThesis();
  if (!thesis) {
    showToast('Apri prima una tesi.', true);
    return;
  }
  try {
    const payload = buildThesisExportPayload(thesis);
    const html = buildAcademicHtmlExport(thesis);
    const result = await exportThesisPdf(thesis, html, `${payload.baseName}.pdf`);
    if (!result?.ok) return;
    appendEvent('export', 'Esportata tesi corrente in PDF', { thesisId: thesis.id, format: 'pdf', filePath: result.filePath, severity: 'info' });
    showToast('Tesi esportata in PDF.');
  } catch (error) {
    showToast(error?.message || 'Errore export PDF.', true);
  }
}

function getSelectedVersion(list, selectEl) {
  return list.find((version) => version.id === selectEl.value) || null;
}

function getTaskTimeout(taskName) {
  const baseTimeout = Number(state.settings.timeoutMs || 180000) || 180000;
  const heavyTasks = new Set(['chapter_draft', 'chapter_review', 'tutor_revision', 'revisione_relatore', 'revisione_capitolo']);
  if (heavyTasks.has(taskName)) return Math.max(baseTimeout, 240000);
  return Math.max(baseTimeout, 120000);
}

function ensureWritableChapter(thesis) {
  if (!Array.isArray(thesis.chapters) || !thesis.chapters.length) {
    ensureChapterCount(thesis, 1);
  }
  if (!thesis.chapterTitles[thesis.currentChapterIndex]) {
    thesis.chapterTitles[thesis.currentChapterIndex] = `Capitolo ${thesis.currentChapterIndex + 1}`;
  }
}

async function runTask(taskName, buildPromptFn, applyFn, options = {}) {
  const thesis = getCurrentThesis();
  if (!thesis) {
    showToast('Apri prima una tesi.', true);
    return;
  }
  try {
    if (taskName === 'chapter_draft' || taskName === 'chapter_review' || taskName === 'tutor_revision') {
      ensureWritableChapter(thesis);
    }
    const prompt = buildPromptFn(thesis);
    const started = await startOperation(options.statusLabel || `Operazione in corso: ${taskName}`, options.initialDetail || 'Connessione al provider in corso…', taskName);
    if (!started) return;
    const input = buildStructuredTaskInput(thesis, taskName, prompt, { chapterIndex: thesis.currentChapterIndex });
    const result = await callTaskApi(taskName, input, state.settings, { timeoutMs: getTaskTimeout(taskName) });
    applyFn(thesis, result.text || '');
    await persistState('saved');
    renderWorkspace();
    renderThesisList();
    appendEvent('generation', options.eventMessage || `Completata operazione ${taskName}`, { thesisId: thesis.id, task: taskName });
    await finishOperation(options.doneLabel || `Operazione completata: ${taskName}`, 'success', options.successDetail || 'Contenuto ricevuto e salvato correttamente.');
    showToast(options.toast || 'Operazione completata.');
  } catch (error) {
    const detail = error.message || 'Errore operazione.';
    appendEvent('generation_error', 'Errore operazione provider', { thesisId: thesis.id, task: taskName, error: detail });
    const hint = taskName === 'chapter_draft' && /timeout/i.test(detail)
      ? 'Il capitolo richiede più tempo del previsto. Prova ad aumentare il timeout base nella sezione Provider e Prompt.'
      : detail;
    await finishOperation('Errore operazione', 'error', hint);
    showToast(detail || 'Errore operazione.', true);
  }
}

async function exportFilteredEventsAsJson() {
  const events = getFilteredEvents();
  const content = JSON.stringify(buildEventsExportPayload(events), null, 2);
  const result = await saveAdminExportFile({
    raw: content,
    defaultFileName: `accademia-diagnostica-${new Date().toISOString().slice(0, 10)}.json`,
    title: 'Esporta log diagnostica in JSON',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    mimeType: 'application/json;charset=utf-8'
  });
  if (!result?.ok) return;
  appendEvent('export', 'Esportato log diagnostica in JSON', { exportedCount: events.length, scope: 'diagnostics', format: 'json', severity: 'info' });
  showToast('Log diagnostica esportato in JSON.');
}

async function exportFilteredEventsAsTxt() {
  const events = getFilteredEvents();
  const summary = buildDiagnosticsSummary(events);
  const content = buildEventsSummaryText(events, summary);
  const result = await saveAdminExportFile({
    raw: content,
    defaultFileName: `accademia-diagnostica-${new Date().toISOString().slice(0, 10)}.txt`,
    title: 'Esporta log diagnostica in TXT',
    filters: [{ name: 'Testo', extensions: ['txt'] }]
  });
  if (!result?.ok) return;
  appendEvent('export', 'Esportato log diagnostica in TXT', { exportedCount: events.length, scope: 'diagnostics', format: 'txt', severity: 'info' });
  showToast('Log diagnostica esportato in TXT.');
}

async function copyDiagnosticsSummary() {
  const events = getFilteredEvents();
  const summary = buildDiagnosticsSummary(events);
  const ok = await copyText(buildEventsSummaryText(events, summary));
  showToast(ok ? 'Sintesi diagnostica copiata.' : 'Copia sintesi non riuscita.', !ok);
}

function bindWorkspaceAutosave() {
  [...Object.values(workspaceFields), outlineEl, abstractEl, chapterTitleEl, chapterContentEl, workspaceFacultyCustomEl].forEach((field) => {
    field.addEventListener('input', saveWorkspaceFieldsToState);
  });
  workspaceFacultySelectEl.addEventListener('change', () => {
    toggleCustomFaculty(workspaceFacultySelectEl, workspaceFacultyCustomWrapEl, workspaceFacultyCustomEl);
    saveWorkspaceFieldsToState({ silent: true, immediate: true });
  });
  chapterSelectEl.addEventListener('change', () => {
    const thesis = getCurrentThesis();
    if (!thesis) return;
    saveWorkspaceFieldsToState({ silent: true, immediate: true });
    thesis.currentChapterIndex = Number(chapterSelectEl.value) || 0;
    persistState();
    renderWorkspace();
  });
}

buttons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));

document.querySelectorAll('.quick-action').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.quickAction;
    if (action === 'go-create') setView('theses');
    if (action === 'open-latest') {
      const thesis = state.theses.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
      if (thesis) openThesis(thesis.id);
      else showToast('Nessuna tesi disponibile.', true);
    }
    if (action === 'go-providers') setView('providers');
  });
});

thesisForm.addEventListener('submit', (event) => {
  event.preventDefault();
  createNewThesis();
});

document.getElementById('reset-form-btn').addEventListener('click', () => {
  thesisForm.reset();
  createFields.degreeType.value = 'Triennale';
  createFields.method.value = 'Teorica';
  syncFacultyField(createFacultySelectEl, createFacultyCustomWrapEl, createFacultyCustomEl, '');
});

createFacultySelectEl.addEventListener('change', () => {
  toggleCustomFaculty(createFacultySelectEl, createFacultyCustomWrapEl, createFacultyCustomEl);
});

thesisListEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'open') openThesis(id);
  if (action === 'duplicate') duplicateThesis(id);
  if (action === 'archive') toggleArchiveThesis(id);
  if (action === 'delete') deleteThesis(id);
});

[thesisSearchEl, thesisFilterEl, thesisSortEl].forEach((control) => control.addEventListener('input', renderThesisList));
[thesisFilterEl, thesisSortEl].forEach((control) => control.addEventListener('change', renderThesisList));

document.getElementById('workspace-save-btn').addEventListener('click', () => {
  saveWorkspaceFieldsToState();
  persistState();
  showToast('Workspace salvato.');
});
document.getElementById('workspace-duplicate-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (thesis) duplicateThesis(thesis.id);
});
document.getElementById('workspace-archive-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (thesis) toggleArchiveThesis(thesis.id);
});
document.getElementById('workspace-delete-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (thesis) deleteThesis(thesis.id);
});

document.getElementById('outline-revise-toggle-btn').addEventListener('click', () => outlineReviewBox.classList.toggle('hidden'));
document.getElementById('outline-review-cancel-btn').addEventListener('click', () => outlineReviewBox.classList.add('hidden'));
document.getElementById('abstract-revise-toggle-btn').addEventListener('click', () => abstractReviewBox.classList.toggle('hidden'));
document.getElementById('abstract-review-cancel-btn').addEventListener('click', () => abstractReviewBox.classList.add('hidden'));
document.getElementById('chapter-revise-toggle-btn').addEventListener('click', () => chapterReviewBox.classList.toggle('hidden'));
document.getElementById('chapter-review-cancel-btn').addEventListener('click', () => chapterReviewBox.classList.add('hidden'));
document.getElementById('chapter-tutor-toggle-btn').addEventListener('click', () => chapterTutorBox.classList.toggle('hidden'));
document.getElementById('chapter-tutor-cancel-btn').addEventListener('click', () => chapterTutorBox.classList.add('hidden'));

document.getElementById('outline-generate-btn').addEventListener('click', () => runTask(
  'outline_draft',
  (thesis) => promptOutline(thesis),
  (thesis, text) => applyOutlineToThesis(thesis, text, 'Indice generato'),
  { toast: 'Indice generato.', doneLabel: 'Indice generato con successo.', eventMessage: 'Generato indice tesi', statusLabel: 'Generazione indice in corso', initialDetail: 'Preparazione richiesta e connessione al provider…' }
));

document.getElementById('outline-review-submit-btn').addEventListener('click', () => {
  const notes = outlineReviewNotesEl.value.trim();
  if (!notes) return showToast('Inserisci osservazioni per la revisione dell\'indice.', true);
  runTask(
    'outline_review',
    (thesis) => promptOutlineRevision(thesis, notes),
    (thesis, text) => {
      applyOutlineToThesis(thesis, text, 'Indice revisionato');
      outlineReviewNotesEl.value = '';
      outlineReviewBox.classList.add('hidden');
    },
    { toast: 'Indice revisionato.', doneLabel: 'Revisione indice completata.', eventMessage: 'Revisionato indice tesi', statusLabel: 'Revisione indice in corso', initialDetail: 'Invio osservazioni di revisione…' }
  );
});

document.getElementById('abstract-generate-btn').addEventListener('click', () => runTask(
  'abstract_draft',
  (thesis) => promptAbstract(thesis),
  (thesis, text) => applyAbstractToThesis(thesis, text, 'Abstract generato'),
  { toast: 'Abstract generato.', doneLabel: 'Abstract generato con successo.', eventMessage: 'Generato abstract tesi', statusLabel: 'Generazione abstract in corso', initialDetail: 'Preparazione abstract e connessione al provider…' }
));

document.getElementById('abstract-review-submit-btn').addEventListener('click', () => {
  const notes = abstractReviewNotesEl.value.trim();
  if (!notes) return showToast('Inserisci osservazioni per la revisione dell\'abstract.', true);
  runTask(
    'abstract_review',
    (thesis) => promptAbstractRevision(thesis, notes),
    (thesis, text) => {
      applyAbstractToThesis(thesis, text, 'Abstract revisionato');
      abstractReviewNotesEl.value = '';
      abstractReviewBox.classList.add('hidden');
    },
    { toast: 'Abstract revisionato.', doneLabel: 'Revisione abstract completata.', eventMessage: 'Revisionato abstract tesi', statusLabel: 'Revisione abstract in corso', initialDetail: "Invio osservazioni per la revisione dell'abstract…" }
  );
});

document.getElementById('chapter-generate-btn').addEventListener('click', async () => {
  const thesis = getCurrentThesis();
  if (!thesis) { showToast('Apri prima una tesi.', true); return; }
  try {
    ensureWritableChapter(thesis);
    const chapterIndex = thesis.currentChapterIndex;
    const settings = state.settings;
    const timeout = getTaskTimeout('chapter_draft');
    const includeNotes = chapterIncludeNotesEl?.checked !== false;

    const started = await startOperation('Generazione capitolo in corso', 'Connessione al provider…', 'chapter_draft');
    if (!started) return;

    // Stato sezioni - gestito server-side come nel frontend online
    let chapterSections = {};
    let fullText = (thesis.chapters?.[chapterIndex]?.content || '').trim();
    let chapterOpeningText = ''; // paragrafo introduttivo pre-loop
    let iterCount = 0;
    const MAX_ITER = 12;

    const subsections = getExpectedSubsections(thesis.outline, chapterIndex);
    const logLines = subsections.map(s => `⏳ ${s}`);
    const renderLog = () => {
      statusLogEl.classList.add('busy');
      statusLogEl.innerHTML = `<strong>Generazione capitolo in corso</strong><div class="status-detail" style="white-space:pre-line;font-size:12px">${logLines.join('\n')}</div>`;
    };
    renderLog();

    // Paragrafo introduttivo opzionale (prima del loop sottosezioni)
    const includeOpening = chapterIncludeOpeningEl?.checked === true;
    if (includeOpening && !fullText && subsections.length) {
      try {
        logStatus('Generazione paragrafo introduttivo…', 'busy', '');
        const openingInput = buildStructuredTaskInput(thesis, 'chapter_draft', promptChapterOpening(thesis, chapterIndex), { chapterIndex });
        const openingResult = await callTaskApi('chapter_draft', openingInput, settings, { timeoutMs: 35000 });
        const openingText = (openingResult.text || '').trim();
        if (openingText) {
          // Salva nell'extra per passarlo al backend nel loop
          fullText = ''; // il testo opening non viene messo in fullText direttamente
          // viene passato come extra.chapterOpening al backend
          chapterOpeningText = openingText;
        }
      } catch (openingErr) {
        appendEvent('generation', 'Paragrafo introduttivo non generato (errore opzionale)', { thesisId: thesis.id, error: openingErr?.message });
      }
    }

    while (iterCount < MAX_ITER) {
      iterCount++;

      // Mostra quale sezione è in corso (prima pending)
      const pendingBefore = subsections.find((sub, i) => {
        const code = sub.match(/^(\d+\.\d+)/)?.[1];
        return code && (!chapterSections[code] || chapterSections[code]?.status === 'pending');
      });
      if (pendingBefore) {
        const pendingIdx = subsections.indexOf(pendingBefore);
        logLines[pendingIdx] = `⏳ ${pendingBefore} (in corso…)`;
        renderLog();
      }

      const input = buildStructuredTaskInput(thesis, 'chapter_draft', '', { chapterIndex });
      input.existingChapterContent = fullText;
      input.generationMode = fullText ? 'resume' : 'fresh';
      input.chapterSections = chapterSections;
      // Passa il paragrafo introduttivo al backend (usato da initializeChapterSectionsState)
      if (chapterOpeningText) {
        input.extra = { ...(input.extra || {}), chapterIndex, chapterOpening: chapterOpeningText };
      }

      const result = await callTaskApi('chapter_draft', input, settings, { timeoutMs: timeout });

      if (result.sections && typeof result.sections === 'object') {
        chapterSections = { ...chapterSections, ...result.sections };
      }

      const newText = (result.text || '').trim();
      if (newText) {
        fullText = newText;
        if (chapterContentEl) chapterContentEl.value = fullText;
      }

      // Aggiorna log con sezioni completate
      const doneSections = Object.entries(chapterSections)
        .filter(([, v]) => v?.status === 'done' || v?.locked)
        .map(([k]) => k);
      subsections.forEach((sub, i) => {
        const code = sub.match(/^(\d+\.\d+)/)?.[1];
        if (code && doneSections.includes(code)) logLines[i] = `✓ ${sub}`;
        else if (logLines[i].includes('in corso')) logLines[i] = `⏳ ${sub}`;
      });
      renderLog();

      if (result.done) break;
      if (result.partial === false && !result.done) {
        // Sottosezione completata ma capitolo non ancora finito — continua
        continue;
      }
      if (result.partial === true) continue; // sezione parziale — riprova
      break; // fallback sicuro
    }

    // P0.4: verifica completezza dopo loop
    const loopCompleted = iterCount < 12;
    if (!loopCompleted) {
      appendEvent('generation', 'Capitolo generato parzialmente (MAX_ITER raggiunto)', { thesisId: thesis.id });
      showToast('⚠️ Capitolo generato parzialmente. Premi "Genera capitolo" per continuare.', false);
    }

    fullText = cleanMarkdown(fullText);

    // Note finali
    if (includeNotes && fullText && !/\nNote\s*\n/i.test(fullText)) {
      try {
        logStatus('Generazione sezione Note…', 'busy', '');
        const notesInput = buildStructuredTaskInput(thesis, 'chapter_draft', buildChapterNotes(thesis, fullText), { chapterIndex });
        notesInput.adminUnlimitedMode = true;
        const notesResult = await callTaskApi('chapter_draft', notesInput, settings, { timeoutMs: 40000 });
        const notesText = cleanMarkdown((notesResult.text || '').trim());
        if (notesText) fullText = `${fullText}\n\n${notesText}`;
      } catch (notesErr) {
        appendEvent('generation', 'Note non generate (errore opzionale)', { thesisId: thesis.id, error: notesErr?.message });
        showToast('⚠️ Sezione Note non generata.', false);
      }
    }

    if (chapterContentEl) chapterContentEl.value = fullText;
    applyChapterToThesis(thesis, chapterIndex, fullText, 'Capitolo generato');
    await persistState('saved');
    renderWorkspace();
    renderThesisList();
    appendEvent('generation', 'Generato capitolo tesi', { thesisId: thesis.id, task: 'chapter_draft' });
    await finishOperation('Capitolo generato con successo.', 'success', logLines.join('\n'));
    showToast('Capitolo generato.');
  } catch (error) {
    const detail = error.message || 'Errore generazione capitolo.';
    appendEvent('generation_error', 'Errore generazione capitolo', { thesisId: thesis?.id, error: detail });
    await finishOperation('Errore generazione', 'error', detail);
    showToast(detail, true);
  }
});


document.getElementById('chapter-review-submit-btn').addEventListener('click', () => {
  const notes = chapterReviewNotesEl.value.trim();
  if (!notes) return showToast('Inserisci osservazioni per la revisione del capitolo.', true);
  runTask(
    'chapter_review',
    (thesis) => promptChapterRevision(thesis, thesis.currentChapterIndex, notes),
    (thesis, text) => {
      applyChapterToThesis(thesis, thesis.currentChapterIndex, text, 'Capitolo revisionato');
      chapterReviewNotesEl.value = '';
      chapterReviewBox.classList.add('hidden');
    },
    { toast: 'Capitolo revisionato.', doneLabel: 'Revisione capitolo completata.', eventMessage: 'Revisionato capitolo tesi', statusLabel: 'Revisione capitolo in corso', initialDetail: 'Invio note di revisione del capitolo al provider…' }
  );
});

document.getElementById('chapter-tutor-submit-btn').addEventListener('click', () => {
  const notes = chapterTutorNotesEl.value.trim();
  if (!notes) return showToast('Inserisci le osservazioni del relatore.', true);
  const extracts = (document.getElementById('chapter-tutor-extracts')?.value || '').trim();
  const authors = (document.getElementById('chapter-tutor-authors')?.value || '').trim();
  const sections = (document.getElementById('chapter-tutor-sections')?.value || '').trim();
  const tutorInput = { notes, extracts, authors, sections };
  runTask(
    'tutor_revision',
    (thesis) => promptTutorRevision(thesis, thesis.currentChapterIndex, tutorInput),
    (thesis, text) => {
      applyChapterToThesis(thesis, thesis.currentChapterIndex, text, 'Osservazioni relatore applicate');
      chapterTutorNotesEl.value = '';
      ['chapter-tutor-extracts', 'chapter-tutor-authors', 'chapter-tutor-sections'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      chapterTutorBox.classList.add('hidden');
    },
    { toast: 'Osservazioni relatore applicate.', doneLabel: 'Osservazioni relatore applicate al capitolo.', eventMessage: 'Applicate osservazioni relatore', statusLabel: 'Applicazione osservazioni relatore in corso', initialDetail: 'Il provider sta rielaborando il capitolo secondo le osservazioni inserite…' }
  );
});

document.getElementById('chapter-notes-btn').addEventListener('click', () => {
  const chapterContent = chapterContentEl?.value?.trim();
  if (!chapterContent) return showToast('Genera prima il capitolo.', true);
  runTask(
    'chapter_draft',
    (thesis) => buildChapterNotes(thesis, chapterContent),
    (thesis, text) => {
      const current = chapterContentEl?.value || '';
      const cleaned = current.replace(/\nNote\s*\n[\s\S]*$/i, '').trim();
      const newText = `${cleaned}\n\n${text}`;
      if (chapterContentEl) chapterContentEl.value = newText;
      applyChapterToThesis(thesis, thesis.currentChapterIndex, newText, 'Note aggiunte');
    },
    { toast: 'Sezione Note generata.', doneLabel: 'Note aggiunte al capitolo.', eventMessage: 'Note capitolo generate', statusLabel: 'Generazione sezione Note in corso', initialDetail: 'Generazione apparato note…' }
  );
});

document.getElementById('chapter-harmonize-btn').addEventListener('click', () => {
  const chapterContent = chapterContentEl?.value?.trim();
  if (!chapterContent) return showToast('Nessun testo da armonizzare.', true);
  runTask(
    'chapter_draft',
    (thesis) => [
      'TASK: chapter_harmonize_light',
      `CAPITOLO: ${thesis.chapterTitles?.[thesis.currentChapterIndex] || 'Capitolo'}`,
      'Esegui una sola passata leggera di armonizzazione stilistica del testo esistente.',
      'OBIETTIVI CONSENTITI:\n- migliora la continuità logica e le transizioni tra sottosezioni quando sono brusche o ridondanti;\n- uniforma stile e lessico accademico in modo coerente;\n- elimina ripetizioni di parole o strutture sintattiche ravvicinate.',
      'VINCOLI ASSOLUTI:\n- non aggiungere nuove sezioni, sottosezioni o contenuti non presenti nel testo originale;\n- non eliminare passaggi argomentativi, esempi o concetti già presenti;\n- non accorciare il testo in modo significativo: la lunghezza finale deve essere analoga all\'originale;\n- non cambiare la tesi argomentativa, le posizioni teoriche o le conclusioni di nessuna sezione;\n- non rigenerare da zero il capitolo;\n- conserva tutti i titoli delle sottosezioni esattamente come sono.',
      'Restituisci il capitolo intero armonizzato, non solo le parti modificate.',
      `TESTO ATTUALE:\n${chapterContent.slice(0, 9000)}`,
    ].join('\n\n'),
    (thesis, text) => {
      if (chapterContentEl) chapterContentEl.value = text;
      applyChapterToThesis(thesis, thesis.currentChapterIndex, text, 'Armonizzazione applicata');
    },
    { toast: 'Capitolo armonizzato.', doneLabel: 'Armonizzazione completata.', eventMessage: 'Capitolo armonizzato', statusLabel: 'Armonizzazione in corso', initialDetail: 'Uniformazione stile e transizioni…' }
  );
});

document.getElementById('outline-copy-btn').addEventListener('click', async () => {
  const ok = await copyText(outlineEl.value);
  showToast(ok ? 'Indice copiato.' : 'Copia non riuscita.', !ok);
});
document.getElementById('abstract-copy-btn').addEventListener('click', async () => {
  const ok = await copyText(abstractEl.value);
  showToast(ok ? 'Abstract copiato.' : 'Copia non riuscita.', !ok);
});
document.getElementById('chapter-copy-btn').addEventListener('click', async () => {
  const ok = await copyText(chapterContentEl.value);
  showToast(ok ? 'Capitolo copiato.' : 'Copia non riuscita.', !ok);
});

document.getElementById('outline-export-btn').addEventListener('click', async () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  const result = await saveAdminExportFile({
    raw: outlineEl.value,
    defaultFileName: `${buildThesisExportBaseName(thesis.title || 'tesi')}-indice.txt`,
    title: 'Esporta indice in TXT',
    filters: [{ name: 'Testo', extensions: ['txt'] }]
  });
  if (!result?.ok) return;
  showToast('Indice esportato in TXT.');
});
document.getElementById('abstract-export-btn').addEventListener('click', async () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  const result = await saveAdminExportFile({
    raw: abstractEl.value,
    defaultFileName: `${buildThesisExportBaseName(thesis.title || 'tesi')}-abstract.txt`,
    title: 'Esporta abstract in TXT',
    filters: [{ name: 'Testo', extensions: ['txt'] }]
  });
  if (!result?.ok) return;
  showToast('Abstract esportato in TXT.');
});
document.getElementById('chapter-export-btn').addEventListener('click', async () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  const chapter = thesis.chapters[thesis.currentChapterIndex];
  const result = await saveAdminExportFile({
    raw: chapter?.content || '',
    defaultFileName: `${buildThesisExportBaseName(thesis.title || 'tesi')}-capitolo-${thesis.currentChapterIndex + 1}.txt`,
    title: 'Esporta capitolo in TXT',
    filters: [{ name: 'Testo', extensions: ['txt'] }]
  });
  if (!result?.ok) return;
  showToast('Capitolo esportato in TXT.');
});

document.getElementById('outline-save-version-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis || !outlineEl.value.trim()) return;
  thesis.outline = outlineEl.value;
  thesis.outlineVersions = appendVersion(thesis.outlineVersions, thesis.outline, 'Versione manuale indice');
  applyOutlineToThesis(thesis, thesis.outline, 'Indice approvato manualmente');
  persistState();
  renderWorkspace();
  showToast('Versione indice salvata.');
});

document.getElementById('abstract-save-version-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis || !abstractEl.value.trim()) return;
  thesis.abstract = abstractEl.value;
  thesis.abstractVersions = appendVersion(thesis.abstractVersions, thesis.abstract, 'Versione manuale abstract');
  persistState();
  renderWorkspace();
  showToast('Versione abstract salvata.');
});

document.getElementById('chapter-save-version-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  const chapter = thesis.chapters[thesis.currentChapterIndex];
  if (!chapter || !chapterContentEl.value.trim()) return;
  chapter.content = chapterContentEl.value;
  chapter.versions = appendVersion(chapter.versions, chapter.content, 'Versione manuale capitolo');
  persistState();
  renderWorkspace();
  showToast('Versione capitolo salvata.');
});

document.getElementById('outline-restore-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  const version = getSelectedVersion(thesis.outlineVersions || [], outlineVersionSelectEl);
  if (!version) return;
  thesis.outline = version.content;
  persistState();
  renderWorkspace();
  showToast('Indice ripristinato.');
});

document.getElementById('abstract-restore-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  const version = getSelectedVersion(thesis.abstractVersions || [], abstractVersionSelectEl);
  if (!version) return;
  thesis.abstract = version.content;
  persistState();
  renderWorkspace();
  showToast('Abstract ripristinato.');
});

document.getElementById('chapter-restore-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  const chapter = thesis.chapters[thesis.currentChapterIndex];
  const version = getSelectedVersion(chapter?.versions || [], chapterVersionSelectEl);
  if (!chapter || !version) return;
  chapter.content = version.content;
  persistState();
  renderWorkspace();
  showToast('Capitolo ripristinato.');
});

document.getElementById('chapter-add-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  ensureChapterCount(thesis, thesis.chapters.length + 1);
  thesis.currentChapterIndex = thesis.chapters.length - 1;
  persistState();
  renderWorkspace();
  showToast('Capitolo aggiunto.');
});

document.getElementById('chapter-remove-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis || !thesis.chapters.length) return;
  const ok = window.confirm('Eliminare il capitolo corrente?');
  if (!ok) return;
  thesis.chapters.splice(thesis.currentChapterIndex, 1);
  thesis.chapterTitles.splice(thesis.currentChapterIndex, 1);
  thesis.currentChapterIndex = Math.max(0, thesis.currentChapterIndex - 1);
  persistState();
  renderWorkspace();
  showToast('Capitolo eliminato.');
});

document.getElementById('outline-delete-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis || !thesis.outline.trim()) return;
  const ok = window.confirm('Eliminare indice e relative versioni salvate?');
  if (!ok) return;
  thesis.outline = '';
  thesis.outlineVersions = [];
  persistState();
  renderWorkspace();
  renderThesisList();
  appendEvent('outline_delete', 'Indice eliminato dal workspace admin', { thesisId: thesis.id });
  showToast('Indice eliminato.');
});

document.getElementById('abstract-delete-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis || !thesis.abstract.trim()) return;
  const ok = window.confirm('Eliminare abstract e relative versioni salvate?');
  if (!ok) return;
  thesis.abstract = '';
  thesis.abstractVersions = [];
  persistState();
  renderWorkspace();
  renderThesisList();
  appendEvent('abstract_delete', 'Abstract eliminato dal workspace admin', { thesisId: thesis.id });
  showToast('Abstract eliminato.');
});

document.getElementById('chapter-approve-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  const nextIndex = thesis.currentChapterIndex + 1;
  const plannedCount = parseChapterTitles(thesis.outline || '').length || thesis.chapterTitles.length;
  if (nextIndex >= plannedCount) {
    showToast('Tutti i capitoli sono stati completati.');
    return;
  }
  // Assicura che il capitolo successivo esista nell'array
  ensureChapterCount(thesis, nextIndex + 1);
  thesis.currentChapterIndex = nextIndex;
  persistState();
  renderWorkspace();
  showToast(`Capitolo ${nextIndex + 1} attivo.`);
});

document.getElementById('chapter-clear-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (!thesis) return;
  const chapter = thesis.chapters[thesis.currentChapterIndex];
  if (!chapter || !chapter.content.trim()) return;
  const ok = window.confirm('Svuotare il testo del capitolo corrente e le relative versioni salvate?');
  if (!ok) return;
  chapter.content = '';
  chapter.versions = [];
  persistState();
  renderWorkspace();
  renderThesisList();
  appendEvent('chapter_clear', 'Svuotato testo capitolo corrente', { thesisId: thesis.id, chapterId: chapter.id, chapterIndex: thesis.currentChapterIndex });
  showToast('Testo capitolo svuotato.');
});

document.getElementById('events-clear-btn').addEventListener('click', () => {
  const ok = window.confirm('Svuotare il log eventi locale?');
  if (!ok) return;
  state.events = [];
  persistState();
  renderEvents();
  renderMetrics();
  showToast('Log eventi svuotato.');
});

eventsExportTxtBtnEl?.addEventListener('click', exportFilteredEventsAsTxt);
eventsExportJsonBtnEl?.addEventListener('click', exportFilteredEventsAsJson);
eventsCopySummaryBtnEl?.addEventListener('click', copyDiagnosticsSummary);
[eventsSearchEl, eventsSeverityFilterEl, eventsTypeFilterEl].forEach((control) => {
  control?.addEventListener('input', renderEvents);
  control?.addEventListener('change', renderEvents);
});

document.getElementById('settings-save-btn').addEventListener('click', () => {
  const apiBaseUrl = settingsApiBaseEl.value.trim();
  const timeoutMs = Number(settingsTimeoutEl.value || 180000) || 180000;
  const activeProfileId = state.settings.activeProfileId;
  const profiles = Array.isArray(state.settings.profiles) ? state.settings.profiles.slice() : [];
  const activeIndex = profiles.findIndex((profile) => profile.id === activeProfileId);

  if (activeIndex >= 0) {
    profiles[activeIndex] = {
      ...profiles[activeIndex],
      apiBaseUrl,
      timeoutMs
    };
    state.settings.profiles = profiles;
  }

  state.settings.apiBaseUrl = apiBaseUrl;
  state.settings.timeoutMs = timeoutMs;
  persistState();
  settingsStatusEl.textContent = 'Impostazioni provider salvate.';
  appendEvent('settings', 'Salvate impostazioni provider desktop admin', { settings: state.settings });
  showToast('Impostazioni provider salvate.');
});

document.getElementById('settings-test-btn').addEventListener('click', async () => {
  settingsStatusEl.textContent = 'Test endpoint in corso…';
  const probe = await testApiConnection({ apiBaseUrl: settingsApiBaseEl.value.trim(), timeoutMs: Number(settingsTimeoutEl.value || 180000) });
  settingsStatusEl.textContent = probe.ok
    ? `Endpoint raggiunto. Stato ${probe.status}. ${probe.details}`
    : `Test non riuscito. ${probe.details}`;
  appendEvent('provider_test', probe.ok ? 'Test endpoint riuscito' : 'Test endpoint fallito', probe);
});

document.getElementById('tool-export-thesis-btn').addEventListener('click', exportCurrentThesis);
document.getElementById('tool-export-thesis-html-btn').addEventListener('click', exportCurrentThesisHtml);
document.getElementById('tool-export-thesis-json-btn').addEventListener('click', exportCurrentThesisJson);
document.getElementById('tool-export-thesis-docx-btn').addEventListener('click', exportCurrentThesisDocx);
document.getElementById('tool-export-thesis-pdf-btn').addEventListener('click', exportCurrentThesisPdf);
document.getElementById('tool-duplicate-current-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (thesis) duplicateThesis(thesis.id);
});
document.getElementById('tool-archive-current-btn').addEventListener('click', () => {
  const thesis = getCurrentThesis();
  if (thesis) toggleArchiveThesis(thesis.id);
});
toolRunPreflightBtnEl?.addEventListener('click', runPreflightCheck);
toolCopyAppSummaryBtnEl?.addEventListener('click', copyAppSummary);
toolOpenStateFolderBtnEl?.addEventListener('click', openStateFolderFromTools);

recoveryDismissBtnEl.addEventListener('click', async () => {
  const runtime = getRuntimeState();
  runtime.recoveryNotice = null;
  await persistState('saved');
  renderRuntimeState();
});

recoveryOpenBtnEl.addEventListener('click', async () => {
  const runtime = getRuntimeState();
  const thesisId = runtime.recoveryNotice?.thesisId;
  if (thesisId) openThesis(thesisId);
  runtime.recoveryNotice = null;
  await persistState('saved');
  renderRuntimeState();
});

window.addEventListener('beforeunload', () => {
  setSessionClosedMarker();
});

window.addEventListener('pagehide', () => {
  setSessionClosedMarker();
});

bindWorkspaceAutosave();
renderPreflightReport(null);
setView('dashboard');

async function bootstrapApp() {
  try {
    state = normalizeAdminState((await loadAdminState()) || createInitialAdminState());
  } catch (error) {
    console.error('Bootstrap renderer fallito:', error);
    state = createInitialAdminState();
    showToast('Avvio in modalità locale di emergenza.', true);
  }

  try {
    const appInfo = await window.accademiaAdmin?.getAppInfo?.();
    if (appInfo) {
      appMeta = appInfo;
      appInfoEl.textContent = `${appInfo.appName} · v${appInfo.version}`;
      renderAppSystemInfo(appInfo);
    }
    const recoveryDetected = detectRecoveryState();
    if (recoveryDetected) {
      appendEvent('recovery', 'Recupero sessione desktop rilevato', { recovery: getRuntimeState().recoveryNotice });
    }
    settingsApiBaseEl.value = state.settings.apiBaseUrl || '';
    settingsTimeoutEl.value = String(state.settings.timeoutMs || 180000);
    syncFacultyField(createFacultySelectEl, createFacultyCustomWrapEl, createFacultyCustomEl, '');
    syncFacultyField(workspaceFacultySelectEl, workspaceFacultyCustomWrapEl, workspaceFacultyCustomEl, '');
    renderMetrics();
    renderThesisList();
    renderWorkspace();
    renderEvents();
    renderRuntimeState();
    startHeartbeat();
    if (recoveryDetected) {
      persistState('saved');
    }
  } catch (error) {
    console.error('Render iniziale fallito:', error);
    showToast(error?.message || 'Errore avvio interfaccia.', true);
  }
}

bootstrapApp();
