const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const packageJson = require('./package.json');

const APP_NAME = 'AccademIA Admin Desktop';
const APP_ID = 'com.robpac.accademiaadmindesktop';
const STATE_DIR_NAME = 'storage';
const STATE_FILE_NAME = 'admin-state.json';

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, 'build', 'icon.ico'),
    path.join(__dirname, 'build', 'icon.png'),
    path.join(__dirname, 'src', 'assets', 'accademia-logo.png')
  ];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function getStateDirectory() {
  return path.join(app.getPath('userData'), STATE_DIR_NAME);
}

function getStateFilePath() {
  return path.join(getStateDirectory(), STATE_FILE_NAME);
}

async function ensureStateDirectory() {
  await fs.mkdir(getStateDirectory(), { recursive: true });
}

async function readStateFile() {
  const stateFilePath = getStateFilePath();
  try {
    const raw = await fs.readFile(stateFilePath, 'utf8');
    return { ok: true, raw, stateFilePath, source: 'file' };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ok: true, raw: null, stateFilePath, source: 'missing' };
    }
    return {
      ok: false,
      raw: null,
      stateFilePath,
      source: 'error',
      error: error?.message || 'Impossibile leggere il file di stato locale.'
    };
  }
}

function buildTimestampStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function buildBackupDefaultFileName() {
  return `accademia-admin-backup-${buildTimestampStamp()}.json`;
}

function buildExportDefaultFileName(extension = 'txt') {
  return `accademia-admin-export-${buildTimestampStamp()}.${extension}`;
}

function buildPreflightChecks() {
  const checks = [];

  const pushCheck = (id, label, status, detail) => {
    checks.push({ id, label, status, detail });
  };

  const pathExists = (targetPath) => fsSync.existsSync(targetPath);

  const logoPath = path.join(__dirname, 'src', 'assets', 'accademia-logo.png');
  pushCheck(
    'logo-source',
    'Logo ufficiale desktop',
    pathExists(logoPath) ? 'ok' : 'error',
    pathExists(logoPath) ? logoPath : 'File mancante: src/assets/accademia-logo.png'
  );

  const iconIcoPath = path.join(__dirname, 'build', 'icon.ico');
  pushCheck(
    'icon-ico',
    'Icona Windows .ico',
    pathExists(iconIcoPath) ? 'ok' : 'error',
    pathExists(iconIcoPath) ? iconIcoPath : 'File mancante: build/icon.ico'
  );

  const iconPngPath = path.join(__dirname, 'build', 'icon.png');
  pushCheck(
    'icon-png',
    'Icona packaging .png',
    pathExists(iconPngPath) ? 'ok' : 'warning',
    pathExists(iconPngPath) ? iconPngPath : 'File facoltativo mancante: build/icon.png'
  );

  const hasStartScript = Boolean(packageJson?.scripts?.start);
  pushCheck(
    'script-start',
    'Script avvio desktop',
    hasStartScript ? 'ok' : 'error',
    hasStartScript ? packageJson.scripts.start : 'Script start mancante in package.json'
  );

  const hasDistScript = Boolean(packageJson?.scripts?.dist);
  pushCheck(
    'script-dist',
    'Script packaging Windows',
    hasDistScript ? 'ok' : 'warning',
    hasDistScript ? packageJson.scripts.dist : 'Script dist mancante in package.json'
  );

  const hasBuilderConfig = Boolean(packageJson?.build?.win?.icon);
  pushCheck(
    'builder-config',
    'Configurazione electron-builder',
    hasBuilderConfig ? 'ok' : 'warning',
    hasBuilderConfig ? `Icona build: ${packageJson.build.win.icon}` : 'Configurazione win.icon non rilevata in package.json'
  );

  const hasDocxDependency = Boolean(packageJson?.dependencies?.docx);
  pushCheck(
    'dependency-docx',
    'Dipendenza export DOCX',
    hasDocxDependency ? 'ok' : 'warning',
    hasDocxDependency ? `docx ${packageJson.dependencies.docx}` : 'Dipendenza docx non rilevata'
  );

  const hasBuilderDependency = Boolean(packageJson?.devDependencies?.['electron-builder']);
  pushCheck(
    'dependency-builder',
    'Dipendenza packaging',
    hasBuilderDependency ? 'ok' : 'warning',
    hasBuilderDependency ? `electron-builder ${packageJson.devDependencies['electron-builder']}` : 'Dipendenza electron-builder non rilevata'
  );

  try {
    fsSync.mkdirSync(getStateDirectory(), { recursive: true });
    const probePath = path.join(getStateDirectory(), `preflight-${Date.now()}.tmp`);
    fsSync.writeFileSync(probePath, 'ok', 'utf8');
    fsSync.unlinkSync(probePath);
    pushCheck('storage-write', 'Scrittura archivio locale', 'ok', getStateDirectory());
  } catch (error) {
    pushCheck('storage-write', 'Scrittura archivio locale', 'error', error?.message || 'Cartella dati non scrivibile');
  }

  return checks;
}


async function writeStateFile(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Contenuto stato non valido o vuoto.');
  }

  await ensureStateDirectory();
  const stateFilePath = getStateFilePath();
  const tempFilePath = `${stateFilePath}.tmp`;
  await fs.writeFile(tempFilePath, raw, 'utf8');
  try {
    await fs.rename(tempFilePath, stateFilePath);
  } catch (_) {
    // fallback: scrittura diretta se rename fallisce (es. Windows file lock)
    await fs.writeFile(stateFilePath, raw, 'utf8');
    try { await fs.unlink(tempFilePath); } catch (_) {}
  }
  return { ok: true, stateFilePath };
}

function writeStateFileSync(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Contenuto stato non valido o vuoto.');
  }

  fsSync.mkdirSync(getStateDirectory(), { recursive: true });
  const stateFilePath = getStateFilePath();
  const tempFilePath = `${stateFilePath}.tmp`;
  try {
    fsSync.writeFileSync(tempFilePath, raw, 'utf8');
    fsSync.renameSync(tempFilePath, stateFilePath);
  } catch (_) {
    fsSync.writeFileSync(stateFilePath, raw, 'utf8');
    try { fsSync.unlinkSync(tempFilePath); } catch (_) {}
  }
  return { ok: true, stateFilePath };
}

function createWindow() {
  const iconPath = resolveAppIcon();
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeFilenamePart(value, fallback = 'tesi-admin') {
  const normalized = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || fallback;
}

function buildAcademicHtml(thesis = {}) {
  const chapters = Array.isArray(thesis.chapters) ? thesis.chapters : [];
  const outlineHtml = escapeHtml(thesis.outline || '').replace(/\n/g, '<br />');
  const abstractHtml = escapeHtml(thesis.abstract || '').replace(/\n/g, '<br />');
  const topicHtml = escapeHtml(thesis.topic || '').replace(/\n/g, '<br />');
  const notesHtml = escapeHtml(thesis.notes || '').replace(/\n/g, '<br />');

  const chaptersHtml = chapters.map((chapter, index) => `
    <section class="chapter-block">
      <h2>Capitolo ${index + 1} — ${escapeHtml(chapter?.title || `Capitolo ${index + 1}`)}</h2>
      <div class="chapter-text">${escapeHtml(chapter?.content || '').replace(/\n/g, '<br />')}</div>
    </section>
  `).join('\n');

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(thesis.title || 'Tesi')}</title>
  <style>
    @page { size: A4; margin: 2.3cm 2cm 2.3cm 2cm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111827; line-height: 1.68; font-size: 11.5pt; }
    h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; }
    h1 { text-align: center; font-size: 22pt; margin: 0 0 0.35cm 0; }
    h2 { font-size: 15pt; margin: 1cm 0 0.35cm 0; page-break-after: avoid; }
    .cover { text-align: center; margin-bottom: 1.2cm; }
    .meta { margin: 0.15cm 0; }
    .section-label { font-size: 9.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #4b5563; margin-top: 0.7cm; }
    .block { margin-top: 0.2cm; white-space: normal; }
    .chapter-block { page-break-inside: avoid; margin-top: 0.8cm; }
    .chapter-text { margin-top: 0.2cm; text-align: justify; }
    .notes { margin-top: 0.4cm; color: #374151; }
  </style>
</head>
<body>
  <section class="cover">
    <div class="section-label">AccademIA Admin Desktop</div>
    <h1>${escapeHtml(thesis.title || 'Tesi senza titolo')}</h1>
    <p class="meta"><strong>Facoltà:</strong> ${escapeHtml(thesis.faculty || '—')}</p>
    <p class="meta"><strong>Corso di laurea:</strong> ${escapeHtml(thesis.course || '—')}</p>
    <p class="meta"><strong>Tipo laurea:</strong> ${escapeHtml(thesis.degreeType || '—')}</p>
    <p class="meta"><strong>Metodo:</strong> ${escapeHtml(thesis.method || '—')}</p>
  </section>

  <div class="section-label">Argomento</div>
  <div class="block">${topicHtml || '—'}</div>

  <div class="section-label">Indice</div>
  <div class="block">${outlineHtml || '—'}</div>

  <div class="section-label">Abstract</div>
  <div class="block">${abstractHtml || '—'}</div>

  ${chaptersHtml || '<div class="section-label">Capitoli</div><div class="block">Nessun capitolo disponibile.</div>'}

  ${notesHtml ? `<div class="section-label">Note admin</div><div class="notes">${notesHtml}</div>` : ''}
</body>
</html>`;
}

function buildDocxParagraphsFromText(text, Paragraph) {
  const raw = String(text || '').replace(/\r/g, '');
  if (!raw.trim()) {
    return [new Paragraph({ text: '—' })];
  }

  const lines = raw.split('\n');
  return lines.map((line) => new Paragraph({ text: line || ' ' }));
}

async function buildDocxBufferFromThesis(thesis = {}) {
  let docxLib;
  try {
    docxLib = require('docx');
  } catch (error) {
    throw new Error('Dipendenza mancante: esegui npm install per installare anche il pacchetto docx.');
  }

  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageOrientation
  } = docxLib;

  const children = [];
  children.push(
    new Paragraph({
      children: [new TextRun({ text: thesis.title || 'Tesi senza titolo', bold: true, size: 32 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 }
    })
  );

  const metaRows = [
    ['Facoltà', thesis.faculty || '—'],
    ['Corso di laurea', thesis.course || '—'],
    ['Tipo laurea', thesis.degreeType || '—'],
    ['Metodo', thesis.method || '—']
  ];

  metaRows.forEach(([label, value]) => {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${label}: `, bold: true }),
        new TextRun({ text: value })
      ],
      spacing: { after: 120 }
    }));
  });

  children.push(new Paragraph({ text: 'Argomento', heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 160 } }));
  children.push(...buildDocxParagraphsFromText(thesis.topic || '', Paragraph));

  children.push(new Paragraph({ text: 'Indice', heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 } }));
  children.push(...buildDocxParagraphsFromText(thesis.outline || '', Paragraph));

  children.push(new Paragraph({ text: 'Abstract', heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 } }));
  children.push(...buildDocxParagraphsFromText(thesis.abstract || '', Paragraph));

  const chapters = Array.isArray(thesis.chapters) ? thesis.chapters : [];
  chapters.forEach((chapter, index) => {
    children.push(new Paragraph({
      text: `Capitolo ${index + 1} — ${chapter?.title || `Capitolo ${index + 1}`}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 180 }
    }));
    children.push(...buildDocxParagraphsFromText(chapter?.content || '', Paragraph));
  });

  if (thesis.notes) {
    children.push(new Paragraph({ text: 'Note admin', heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 160 } }));
    children.push(...buildDocxParagraphsFromText(thesis.notes, Paragraph));
  }

  const document = new Document({
    creator: APP_NAME,
    title: thesis.title || 'Tesi AccademIA',
    description: 'Esportazione tesi da AccademIA Admin Desktop',
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1134, bottom: 1440, left: 1134 },
          size: { orientation: PageOrientation.PORTRAIT }
        }
      },
      children
    }]
  });

  return Packer.toBuffer(document);
}

async function exportPdfFromHtml({ html, defaultFileName, title }) {
  const result = await dialog.showSaveDialog({
    title: title || 'Esporta PDF tesi',
    defaultPath: path.join(app.getPath('documents'), defaultFileName || buildExportDefaultFileName('pdf')),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  const pdfWindow = new BrowserWindow({
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: false,
      contextIsolation: true
    }
  });

  try {
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
    await fs.writeFile(result.filePath, pdfBuffer);
    return { ok: true, filePath: result.filePath };
  } finally {
    if (!pdfWindow.isDestroyed()) {
      pdfWindow.close();
    }
  }
}

function registerIpcHandlers() {
  ipcMain.handle('accademia-admin:get-app-info', () => ({
    appName: APP_NAME,
    version: packageJson.version || '1.6.0',
    mode: 'admin-desktop',
    platform: process.platform,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    userDataPath: app.getPath('userData'),
    stateFilePath: getStateFilePath(),
    stateDirectoryPath: getStateDirectory()
  }));

  ipcMain.handle('accademia-admin:load-state', async () => readStateFile());

  ipcMain.handle('accademia-admin:save-state', async (_event, payload = {}) => {
    try {
      const result = await writeStateFile(payload.raw);
      return result;
    } catch (error) {
      return {
        ok: false,
        stateFilePath: getStateFilePath(),
        error: error?.message || 'Impossibile salvare il file di stato locale.'
      };
    }
  });

  ipcMain.on('accademia-admin:save-state-sync', (event, payload = {}) => {
    try {
      event.returnValue = writeStateFileSync(payload.raw);
    } catch (error) {
      event.returnValue = {
        ok: false,
        stateFilePath: getStateFilePath(),
        error: error?.message || 'Impossibile salvare il file di stato locale.'
      };
    }
  });

  ipcMain.handle('accademia-admin:export-backup', async (_event, payload = {}) => {
    try {
      const raw = typeof payload.raw === 'string' ? payload.raw : '';
      if (!raw.trim()) {
        return { ok: false, error: 'Backup vuoto o non valido.' };
      }

      const result = await dialog.showSaveDialog({
        title: 'Esporta backup completo AccademIA Admin Desktop',
        defaultPath: path.join(app.getPath('documents'), payload.defaultFileName || buildBackupDefaultFileName()),
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }

      await fs.writeFile(result.filePath, raw, 'utf8');
      return { ok: true, filePath: result.filePath };
    } catch (error) {
      return { ok: false, error: error?.message || 'Impossibile esportare il backup.' };
    }
  });

  ipcMain.handle('accademia-admin:save-export-file', async (_event, payload = {}) => {
    try {
      const raw = typeof payload.raw === 'string' ? payload.raw : '';
      if (!raw.trim()) {
        return { ok: false, error: 'Contenuto export vuoto o non valido.' };
      }

      const filters = Array.isArray(payload.filters) && payload.filters.length
        ? payload.filters
        : [{ name: 'Testo', extensions: ['txt'] }];

      const primaryExtension = Array.isArray(filters[0]?.extensions) && filters[0].extensions[0]
        ? filters[0].extensions[0]
        : 'txt';

      const result = await dialog.showSaveDialog({
        title: payload.title || 'Esporta file',
        defaultPath: path.join(app.getPath('documents'), payload.defaultFileName || buildExportDefaultFileName(primaryExtension)),
        filters
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }

      await fs.writeFile(result.filePath, raw, payload.encoding || 'utf8');
      return { ok: true, filePath: result.filePath };
    } catch (error) {
      return { ok: false, error: error?.message || 'Impossibile esportare il file richiesto.' };
    }
  });

  ipcMain.handle('accademia-admin:import-backup', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Importa backup AccademIA Admin Desktop',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (result.canceled || !result.filePaths?.length) {
        return { ok: false, canceled: true };
      }

      const filePath = result.filePaths[0];
      const raw = await fs.readFile(filePath, 'utf8');
      return { ok: true, filePath, raw };
    } catch (error) {
      return { ok: false, error: error?.message || 'Impossibile importare il backup.' };
    }
  });

  ipcMain.handle('accademia-admin:reveal-state-folder', async () => {
    try {
      await ensureStateDirectory();
      const targetPath = getStateDirectory();
      const error = await shell.openPath(targetPath);
      if (error) {
        return { ok: false, error };
      }
      return { ok: true, path: targetPath };
    } catch (error) {
      return { ok: false, error: error?.message || 'Impossibile aprire la cartella dati locale.' };
    }
  });

  ipcMain.handle('accademia-admin:export-docx', async (_event, payload = {}) => {
    try {
      const thesis = payload?.thesis && typeof payload.thesis === 'object' ? payload.thesis : null;
      if (!thesis) {
        return { ok: false, error: 'Dati tesi mancanti per export DOCX.' };
      }

      const defaultFileName = payload.defaultFileName || `${normalizeFilenamePart(thesis.title)}.docx`;
      const result = await dialog.showSaveDialog({
        title: payload.title || 'Esporta tesi in DOCX',
        defaultPath: path.join(app.getPath('documents'), defaultFileName),
        filters: [{ name: 'Word', extensions: ['docx'] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }

      const docxBuffer = await buildDocxBufferFromThesis(thesis);
      await fs.writeFile(result.filePath, docxBuffer);
      return { ok: true, filePath: result.filePath };
    } catch (error) {
      return { ok: false, error: error?.message || 'Impossibile esportare il DOCX.' };
    }
  });


ipcMain.handle('accademia-admin:run-preflight-check', async () => {
  try {
    const checks = buildPreflightChecks();
    const counts = checks.reduce((acc, check) => {
      acc[check.status] = (acc[check.status] || 0) + 1;
      return acc;
    }, { ok: 0, warning: 0, error: 0 });

    return {
      ok: !counts.error,
      createdAt: new Date().toISOString(),
      appName: APP_NAME,
      version: packageJson.version || '1.6.0',
      checks,
      counts,
      stateDirectoryPath: getStateDirectory(),
      stateFilePath: getStateFilePath()
    };
  } catch (error) {
    return {
      ok: false,
      createdAt: new Date().toISOString(),
      appName: APP_NAME,
      version: packageJson.version || '1.6.0',
      checks: [],
      counts: { ok: 0, warning: 0, error: 1 },
      error: error?.message || 'Controllo app non riuscito.'
    };
  }
});

  ipcMain.handle('accademia-admin:export-pdf', async (_event, payload = {}) => {
    try {
      const thesis = payload?.thesis && typeof payload.thesis === 'object' ? payload.thesis : null;
      if (!thesis) {
        return { ok: false, error: 'Dati tesi mancanti per export PDF.' };
      }
      const html = typeof payload.html === 'string' && payload.html.trim()
        ? payload.html
        : buildAcademicHtml(thesis);
      const defaultFileName = payload.defaultFileName || `${normalizeFilenamePart(thesis.title)}.pdf`;
      return await exportPdfFromHtml({ html, defaultFileName, title: payload.title || 'Esporta tesi in PDF' });
    } catch (error) {
      return { ok: false, error: error?.message || 'Impossibile esportare il PDF.' };
    }
  });
}

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
