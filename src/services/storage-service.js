import { createInitialAdminState, normalizeAdminState } from '../core/admin-state.js';

const STATE_KEY = 'accademia-admin-desktop-state-v2';
const LEGACY_KEYS = [
  'accademia_admin_desktop_state_v1',
  'accademia-admin-desktop-state-v1'
];

function parseState(raw) {
  if (!raw) return null;
  try {
    return normalizeAdminState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function tryLoadFromKey(key) {
  return parseState(window.localStorage.getItem(key));
}

function loadFromLocalStorage() {
  const current = tryLoadFromKey(STATE_KEY);
  if (current) return current;

  for (const legacyKey of LEGACY_KEYS) {
    const legacy = tryLoadFromKey(legacyKey);
    if (legacy) {
      return legacy;
    }
  }

  return null;
}

function saveToLocalStorage(state) {
  const normalized = normalizeAdminState(state);
  const raw = JSON.stringify(normalized);
  try {
    window.localStorage.setItem(STATE_KEY, raw);
  } catch (e) {
    console.warn('AccademIA: localStorage quota superata sulla chiave principale.', e);
  }
  for (const legacyKey of LEGACY_KEYS) {
    try {
      window.localStorage.setItem(legacyKey, raw);
    } catch (_) {
      // legacy keys opzionali — fallimento silenzioso
    }
  }
  return raw;
}

export async function loadAdminState() {
  const desktopStorage = window.accademiaAdmin?.storage;

  if (desktopStorage?.loadState) {
    const result = await desktopStorage.loadState();
    if (result?.ok && result.raw) {
      const fromFile = parseState(result.raw);
      if (fromFile) {
        saveToLocalStorage(fromFile);
        return fromFile;
      }
    }
  }

  const localState = loadFromLocalStorage();
  if (localState) {
    if (desktopStorage?.saveState) {
      try {
        await desktopStorage.saveState(JSON.stringify(normalizeAdminState(localState)));
      } catch {
        // fallback silenzioso: resta valido il localStorage
      }
    }
    saveToLocalStorage(localState);
    return localState;
  }

  const initialState = createInitialAdminState();
  await saveAdminState(initialState);
  return initialState;
}

function buildTimestampStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function buildBackupFileName() {
  return `accademia-admin-backup-${buildTimestampStamp()}.json`;
}

function downloadBlobFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugify(text) {
  return String(text || 'file')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file';
}

export function buildThesisExportBaseName(title) {
  return slugify(title || 'tesi-admin');
}

export async function saveAdminState(state) {
  const normalized = normalizeAdminState(state);
  const raw = saveToLocalStorage(normalized);

  const desktopStorage = window.accademiaAdmin?.storage;
  if (desktopStorage?.saveState) {
    const result = await desktopStorage.saveState(raw);
    if (!result?.ok) {
      throw new Error(result?.error || 'Impossibile salvare il file di stato locale.');
    }
  }

  return normalized;
}

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlobFile(filename, blob);
}

export async function copyText(content) {
  const text = String(content || '');
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  return ok;
}

export async function exportAdminBackup(state) {
  const normalized = normalizeAdminState(state);
  const raw = JSON.stringify(normalized, null, 2);
  const desktopStorage = window.accademiaAdmin?.storage;

  if (desktopStorage?.exportBackup) {
    const result = await desktopStorage.exportBackup(raw, buildBackupFileName());
    if (!result?.ok) {
      if (result?.canceled) return { ok: false, canceled: true };
      throw new Error(result?.error || 'Impossibile esportare il backup JSON.');
    }
    return result;
  }

  downloadTextFile(buildBackupFileName(), raw);
  return { ok: true, filePath: buildBackupFileName(), fallback: 'download' };
}

export async function importAdminBackup() {
  const desktopStorage = window.accademiaAdmin?.storage;
  if (!desktopStorage?.importBackup) {
    throw new Error('Import backup disponibile solo nella desktop Electron.');
  }

  const result = await desktopStorage.importBackup();
  if (!result?.ok) {
    if (result?.canceled) return { ok: false, canceled: true };
    throw new Error(result?.error || 'Impossibile importare il backup JSON.');
  }

  const state = parseState(result.raw);
  if (!state) {
    throw new Error('Il file selezionato non contiene un backup AccademIA valido.');
  }

  return { ok: true, filePath: result.filePath, state };
}

export async function openAdminDataFolder() {
  const desktopStorage = window.accademiaAdmin?.storage;
  if (!desktopStorage?.revealStateFolder) {
    throw new Error('Apertura cartella dati disponibile solo nella desktop Electron.');
  }
  const result = await desktopStorage.revealStateFolder();
  if (!result?.ok) {
    throw new Error(result?.error || 'Impossibile aprire la cartella dati locale.');
  }
  return result;
}

export async function saveAdminExportFile({ raw, defaultFileName, title, filters, mimeType = 'text/plain;charset=utf-8', encoding = 'utf8' }) {
  const content = typeof raw === 'string' ? raw : '';
  if (!content.trim()) {
    throw new Error('Contenuto export vuoto o non valido.');
  }

  const desktopStorage = window.accademiaAdmin?.storage;
  if (desktopStorage?.saveExportFile) {
    const result = await desktopStorage.saveExportFile({ raw: content, defaultFileName, title, filters, encoding });
    if (!result?.ok) {
      if (result?.canceled) return { ok: false, canceled: true };
      throw new Error(result?.error || 'Impossibile esportare il file richiesto.');
    }
    return result;
  }

  downloadBlobFile(defaultFileName || 'export.txt', new Blob([content], { type: mimeType }));
  return { ok: true, filePath: defaultFileName || 'export.txt', fallback: 'download' };
}

export async function exportThesisDocx(thesis, defaultFileName) {
  const desktopStorage = window.accademiaAdmin?.storage;
  if (!desktopStorage?.exportDocx) {
    throw new Error('Export DOCX disponibile solo nella desktop Electron.');
  }

  const result = await desktopStorage.exportDocx({
    thesis,
    defaultFileName,
    title: 'Esporta tesi in DOCX'
  });

  if (!result?.ok) {
    if (result?.canceled) return { ok: false, canceled: true };
    throw new Error(result?.error || 'Impossibile esportare il DOCX.');
  }

  return result;
}

export async function exportThesisPdf(thesis, html, defaultFileName) {
  const desktopStorage = window.accademiaAdmin?.storage;
  if (!desktopStorage?.exportPdf) {
    throw new Error('Export PDF disponibile solo nella desktop Electron.');
  }

  const result = await desktopStorage.exportPdf({
    thesis,
    html,
    defaultFileName,
    title: 'Esporta tesi in PDF'
  });

  if (!result?.ok) {
    if (result?.canceled) return { ok: false, canceled: true };
    throw new Error(result?.error || 'Impossibile esportare il PDF.');
  }

  return result;
}
