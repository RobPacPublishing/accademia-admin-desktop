function buildProviderProfileId(seed = '') {
  const normalized = String(seed || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized ? `profile-${normalized}` : `profile-${Date.now()}`;
}

export function createDefaultProviderProfile(overrides = {}) {
  return {
    id: overrides.id || buildProviderProfileId(overrides.name || 'produzione'),
    name: overrides.name || 'Produzione',
    apiBaseUrl: overrides.apiBaseUrl || 'https://www.accademia-tesi.it',
    fallbackApiBaseUrl: overrides.fallbackApiBaseUrl || '',
    timeoutMs: Number(overrides.timeoutMs || 180000) || 180000,
    pingTimeoutMs: Number(overrides.pingTimeoutMs || 10000) || 10000
  };
}

function normalizeProviderProfile(profile, index = 0, inherited = {}) {
  const item = profile && typeof profile === 'object' ? profile : {};
  const fallback = createDefaultProviderProfile({
    name: item.name || inherited.name || (index === 0 ? 'Produzione' : `Profilo ${index + 1}`),
    apiBaseUrl: item.apiBaseUrl || inherited.apiBaseUrl,
    fallbackApiBaseUrl: item.fallbackApiBaseUrl || inherited.fallbackApiBaseUrl,
    timeoutMs: item.timeoutMs || inherited.timeoutMs,
    pingTimeoutMs: item.pingTimeoutMs || inherited.pingTimeoutMs
  });

  return {
    id: item.id || buildProviderProfileId(item.name || fallback.name || `profilo-${index + 1}`),
    name: item.name || fallback.name,
    apiBaseUrl: item.apiBaseUrl || fallback.apiBaseUrl,
    fallbackApiBaseUrl: item.fallbackApiBaseUrl || '',
    timeoutMs: Number(item.timeoutMs || fallback.timeoutMs || 180000) || 180000,
    pingTimeoutMs: Number(item.pingTimeoutMs || fallback.pingTimeoutMs || 10000) || 10000
  };
}

function normalizeSettings(rawSettings = {}) {
  const baseProfile = createDefaultProviderProfile({
    apiBaseUrl: rawSettings.apiBaseUrl || 'https://www.accademia-tesi.it',
    fallbackApiBaseUrl: rawSettings.fallbackApiBaseUrl || '',
    timeoutMs: rawSettings.timeoutMs || 180000,
    pingTimeoutMs: rawSettings.pingTimeoutMs || 10000
  });

  const rawProfiles = Array.isArray(rawSettings.profiles) && rawSettings.profiles.length
    ? rawSettings.profiles
    : [baseProfile];

  const profiles = rawProfiles.map((profile, index) => normalizeProviderProfile(profile, index, baseProfile));
  const activeProfileId = profiles.some((profile) => profile.id === rawSettings.activeProfileId)
    ? rawSettings.activeProfileId
    : profiles[0].id;
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];

  return {
    apiBaseUrl: activeProfile.apiBaseUrl,
    fallbackApiBaseUrl: activeProfile.fallbackApiBaseUrl || '',
    timeoutMs: Number(activeProfile.timeoutMs || 180000) || 180000,
    pingTimeoutMs: Number(activeProfile.pingTimeoutMs || 10000) || 10000,
    activeProfileId,
    profiles
  };
}

export function createInitialAdminState() {
  return {
    currentThesisId: null,
    theses: [],
    users: [],
    licenses: [],
    events: [],
    settings: normalizeSettings({}),
    workspaceRuntime: {
      dirty: false,
      dirtyAt: null,
      lastSavedAt: null,
      heartbeatAt: null,
      lastClosedAt: null,
      pendingOperation: null,
      recoveryNotice: null
    }
  };
}

export function normalizeAdminState(rawState) {
  const base = createInitialAdminState();
  const state = rawState && typeof rawState === 'object' ? rawState : {};
  const theses = Array.isArray(state.theses) ? state.theses : [];
  const events = Array.isArray(state.events) ? state.events : [];
  return {
    ...base,
    ...state,
    currentThesisId: state.currentThesisId ?? null,
    theses: theses.map(normalizeThesisRecord),
    events: events.map(normalizeEventRecord),
    settings: normalizeSettings(state.settings && typeof state.settings === 'object' ? state.settings : {}),
    workspaceRuntime: normalizeWorkspaceRuntime(state.workspaceRuntime)
  };
}

export function normalizeWorkspaceRuntime(rawRuntime) {
  const base = createInitialAdminState().workspaceRuntime;
  const item = rawRuntime && typeof rawRuntime === 'object' ? rawRuntime : {};
  return {
    ...base,
    ...item,
    dirty: Boolean(item.dirty),
    dirtyAt: item.dirtyAt || null,
    lastSavedAt: item.lastSavedAt || null,
    heartbeatAt: item.heartbeatAt || null,
    lastClosedAt: item.lastClosedAt || null,
    pendingOperation: item.pendingOperation && typeof item.pendingOperation === 'object'
      ? {
          label: item.pendingOperation.label || 'Operazione in corso',
          taskName: item.pendingOperation.taskName || null,
          thesisId: item.pendingOperation.thesisId || null,
          startedAt: item.pendingOperation.startedAt || null
        }
      : null,
    recoveryNotice: item.recoveryNotice && typeof item.recoveryNotice === 'object'
      ? {
          thesisId: item.recoveryNotice.thesisId || null,
          message: item.recoveryNotice.message || '',
          createdAt: item.recoveryNotice.createdAt || new Date().toISOString(),
          kind: item.recoveryNotice.kind || 'generic'
        }
      : null
  };
}

export function normalizeThesisRecord(thesis) {
  const now = new Date().toISOString();
  const item = thesis && typeof thesis === 'object' ? thesis : {};
  // Ricalcola titoli dall'outline (sorgente autoritativa) per evitare troncamento
  const outlineLines = String(item.outline || '').split('\n');
  const titlesFromOutline = outlineLines
    .map(l => l.trim())
    .filter(l => /^\d+\.\s+/.test(l))
    .map(l => l.replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean);

  const chapterTitles = Array.isArray(item.chapterTitles) ? item.chapterTitles.filter(Boolean) : [];
  const chapters = Array.isArray(item.chapters)
    ? item.chapters.map((chapter, index) => normalizeChapterRecord(chapter, index, item.id || `thesis-${Date.now()}`))
    : [];

  // Priorità: outline > chapterTitles > chapter.title
  const titles = titlesFromOutline.length
    ? titlesFromOutline
    : chapterTitles.length
      ? chapterTitles
      : chapters.map((chapter, index) => chapter.title || `Capitolo ${index + 1}`);

  const normalizedChapters = titles.map((title, index) => {
    const existing = chapters[index] || normalizeChapterRecord({}, index, item.id || `thesis-${Date.now()}`);
    return {
      ...existing,
      title: title || existing.title || `Capitolo ${index + 1}`,
      versions: Array.isArray(existing.versions) && existing.versions.length
        ? existing.versions.map((version, versionIndex) => normalizeVersionRecord(version, `chapter-${index + 1}-v${versionIndex + 1}`))
        : existing.content
          ? [createVersion(existing.content, 'Versione iniziale')]
          : []
    };
  });

  return {
    id: item.id || `thesis-${Date.now()}`,
    title: item.title || '',
    faculty: item.faculty || '',
    course: item.course || '',
    degreeType: item.degreeType || 'Triennale',
    topic: item.topic || '',
    method: item.method || 'Teorica',
    notes: item.notes || '',
    outline: item.outline || '',
    outlineVersions: Array.isArray(item.outlineVersions) && item.outlineVersions.length
      ? item.outlineVersions.map((version, index) => normalizeVersionRecord(version, `outline-v${index + 1}`))
      : item.outline
        ? [createVersion(item.outline, 'Versione iniziale')]
        : [],
    abstract: item.abstract || '',
    abstractVersions: Array.isArray(item.abstractVersions) && item.abstractVersions.length
      ? item.abstractVersions.map((version, index) => normalizeVersionRecord(version, `abstract-v${index + 1}`))
      : item.abstract
        ? [createVersion(item.abstract, 'Versione iniziale')]
        : [],
    chapterTitles: titles,
    chapters: normalizedChapters,
    currentChapterIndex: Number.isInteger(item.currentChapterIndex) ? item.currentChapterIndex : 0,
    archived: Boolean(item.archived),
    completedAt: item.completedAt || null,
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now
  };
}

export function normalizeChapterRecord(chapter, index, thesisId) {
  const item = chapter && typeof chapter === 'object' ? chapter : {};
  return {
    id: item.id || `${thesisId}-chapter-${index + 1}`,
    title: item.title || `Capitolo ${index + 1}`,
    content: item.content || '',
    versions: Array.isArray(item.versions) ? item.versions.map((version, versionIndex) => normalizeVersionRecord(version, `chapter-${index + 1}-v${versionIndex + 1}`)) : []
  };
}

export function normalizeVersionRecord(version, fallbackId) {
  const item = version && typeof version === 'object' ? version : {};
  return {
    id: item.id || fallbackId || `ver-${Date.now()}`,
    label: item.label || 'Versione',
    content: item.content || '',
    createdAt: item.createdAt || new Date().toISOString()
  };
}

export function normalizeEventRecord(event) {
  const item = event && typeof event === 'object' ? event : {};
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  return {
    id: item.id || `evt-${Date.now()}`,
    type: item.type || 'generic',
    severity: item.severity || payload.severity || getEventSeverity(item.type || 'generic', payload),
    message: item.message || 'Evento',
    payload,
    createdAt: item.createdAt || new Date().toISOString()
  };
}

export function createVersion(content, label = 'Versione') {
  return {
    id: `ver-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    content: content || '',
    createdAt: new Date().toISOString()
  };
}

export function getEventSeverity(type = 'generic', payload = {}) {
  if (payload && typeof payload === 'object' && payload.severity) return payload.severity;
  if (String(type).includes('error') || String(type).includes('fail')) return 'error';
  if (['recovery', 'archive', 'warning'].includes(type)) return 'warning';
  if (['settings', 'provider_test', 'provider_profile', 'export', 'generation', 'thesis_create', 'thesis_duplicate', 'thesis_delete'].includes(type)) return 'info';
  return 'success';
}

export function pushAdminEvent(state, type, message, payload = {}) {
  state.events.unshift({
    id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type,
    severity: getEventSeverity(type, payload),
    message,
    payload,
    createdAt: new Date().toISOString()
  });
  state.events = state.events.slice(0, 1000);
  return state;
}
