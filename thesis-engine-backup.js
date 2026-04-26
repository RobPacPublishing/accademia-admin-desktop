import { createVersion } from './admin-state.js';

export function createThesisFromForm(form) {
  return normalizeThesisShape({
    id: crypto.randomUUID(),
    title: String(form.title || '').trim(),
    faculty: String(form.faculty || '').trim(),
    course: String(form.course || '').trim(),
    degreeType: String(form.degreeType || 'Triennale').trim(),
    topic: String(form.topic || '').trim(),
    method: String(form.method || 'Teorica').trim(),
    notes: String(form.notes || '').trim(),
    archived: false,
    outline: '',
    abstract: '',
    chapterTitles: ['Capitolo 1'],
    chapters: [{
      id: crypto.randomUUID(),
      title: 'Capitolo 1',
      content: '',
      versions: []
    }],
    currentChapterIndex: 0,
    outlineVersions: [],
    abstractVersions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function normalizeThesisShape(raw) {
  const thesis = {
    id: raw?.id || crypto.randomUUID(),
    title: String(raw?.title || '').trim(),
    faculty: String(raw?.faculty || '').trim(),
    course: String(raw?.course || '').trim(),
    degreeType: String(raw?.degreeType || 'Triennale').trim(),
    topic: String(raw?.topic || '').trim(),
    method: String(raw?.method || 'Teorica').trim(),
    notes: String(raw?.notes || '').trim(),
    archived: Boolean(raw?.archived),
    outline: String(raw?.outline || ''),
    abstract: String(raw?.abstract || ''),
    chapterTitles: Array.isArray(raw?.chapterTitles) ? raw.chapterTitles.map((x) => String(x || '').trim()) : ['Capitolo 1'],
    chapters: Array.isArray(raw?.chapters) ? raw.chapters.map((chapter, index) => ({
      id: chapter?.id || crypto.randomUUID(),
      title: String(chapter?.title || raw?.chapterTitles?.[index] || `Capitolo ${index + 1}`).trim(),
      content: String(chapter?.content || ''),
      versions: Array.isArray(chapter?.versions) ? chapter.versions : []
    })) : [],
    currentChapterIndex: Number.isInteger(raw?.currentChapterIndex) ? raw.currentChapterIndex : 0,
    outlineVersions: Array.isArray(raw?.outlineVersions) ? raw.outlineVersions : [],
    abstractVersions: Array.isArray(raw?.abstractVersions) ? raw.abstractVersions : [],
    createdAt: raw?.createdAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt || new Date().toISOString()
  };

  if (!thesis.chapterTitles.length) thesis.chapterTitles = ['Capitolo 1'];
  if (!thesis.chapters.length) {
    thesis.chapters = thesis.chapterTitles.map((title, index) => ({
      id: crypto.randomUUID(),
      title: title || `Capitolo ${index + 1}`,
      content: '',
      versions: []
    }));
  }

  ensureChapterCount(thesis, Math.max(thesis.chapterTitles.length, thesis.chapters.length, 1));
  return thesis;
}

export function cloneThesis(thesis) {
  const copy = structuredCloneSafe(thesis);
  copy.id = crypto.randomUUID();
  copy.title = copy.title ? `${copy.title} (copia)` : 'Nuova tesi (copia)';
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = new Date().toISOString();
  copy.archived = false;
  copy.chapters = copy.chapters.map((chapter, index) => ({
    ...chapter,
    id: crypto.randomUUID(),
    title: copy.chapterTitles[index] || chapter.title || `Capitolo ${index + 1}`,
    versions: Array.isArray(chapter.versions) ? chapter.versions : []
  }));
  return normalizeThesisShape(copy);
}

export function ensureChapterCount(thesis, total) {
  thesis.chapterTitles = Array.isArray(thesis.chapterTitles) ? thesis.chapterTitles : [];
  thesis.chapters = Array.isArray(thesis.chapters) ? thesis.chapters : [];

  while (thesis.chapterTitles.length < total) {
    thesis.chapterTitles.push(`Capitolo ${thesis.chapterTitles.length + 1}`);
  }
  while (thesis.chapters.length < total) {
    const index = thesis.chapters.length;
    thesis.chapters.push({
      id: `${thesis.id}-chapter-${index + 1}`,
      title: thesis.chapterTitles[index] || `Capitolo ${index + 1}`,
      content: '',
      versions: []
    });
  }

  thesis.chapters = thesis.chapters.slice(0, total).map((chapter, index) => ({
    ...chapter,
    id: chapter.id || `${thesis.id}-chapter-${index + 1}`,
    title: thesis.chapterTitles[index] || chapter.title || `Capitolo ${index + 1}`,
    versions: Array.isArray(chapter.versions) ? chapter.versions : []
  }));

  thesis.currentChapterIndex = Math.min(thesis.currentChapterIndex || 0, Math.max(total - 1, 0));
  touchThesis(thesis);
  return thesis;
}

export function parseChapterTitles(outlineText) {
  const lines = String(outlineText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titles = [];
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (match) titles.push(match[2].trim());
  }
  return titles;
}

export function applyOutlineToThesis(thesis, outlineText, label = 'Indice generato') {
  thesis.outline = String(outlineText || '').trim();
  thesis.outlineVersions = appendVersion(thesis.outlineVersions, thesis.outline, label);
  const titles = parseChapterTitles(thesis.outline);
  if (titles.length) {
    thesis.chapterTitles = titles;
    ensureChapterCount(thesis, titles.length);
    thesis.chapters = thesis.chapters.map((chapter, index) => ({
      ...chapter,
      title: titles[index] || chapter.title || `Capitolo ${index + 1}`
    }));
  }
  touchThesis(thesis);
  return thesis;
}

export function applyAbstractToThesis(thesis, abstractText, label = 'Abstract generato') {
  thesis.abstract = String(abstractText || '').trim();
  thesis.abstractVersions = appendVersion(thesis.abstractVersions, thesis.abstract, label);
  touchThesis(thesis);
  return thesis;
}

export function applyChapterToThesis(thesis, chapterIndex, chapterText, label = 'Capitolo generato') {
  ensureChapterCount(thesis, Math.max(thesis.chapters.length, chapterIndex + 1));
  const cleaned = String(chapterText || '').trim();
  assertChapterCompleteness(thesis, chapterIndex, cleaned);
  const chapter = thesis.chapters[chapterIndex];
  chapter.content = cleaned;
  chapter.title = thesis.chapterTitles[chapterIndex] || chapter.title || `Capitolo ${chapterIndex + 1}`;
  chapter.versions = appendVersion(chapter.versions, chapter.content, label);
  touchThesis(thesis);
  return chapter;
}

export function appendVersion(list, content, label) {
  const versions = Array.isArray(list) ? list.slice() : [];
  if (!String(content || '').trim()) return versions;
  versions.unshift(createVersion(content, label));
  return versions.slice(0, 30);
}

export function restoreVersion(target, key, version) {
  if (!version?.content) return;
  target[key] = version.content;
  touchThesis(target);
}

export function restoreChapterVersion(thesis, chapterIndex, version) {
  const chapter = thesis.chapters[chapterIndex];
  if (!chapter || !version?.content) return;
  chapter.content = version.content;
  touchThesis(thesis);
}

export function summarizePreviousChapters(thesis, chapterIndex) {
  if (!Array.isArray(thesis.chapters) || chapterIndex <= 0) return '';
  return thesis.chapters
    .slice(0, chapterIndex)
    .map((chapter, index) => {
      const text = String(chapter.content || '').replace(/\s+/g, ' ').trim();
      const preview = text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
      return `Capitolo ${index + 1} — ${chapter.title || `Capitolo ${index + 1}`}\n${preview}`;
    })
    .join('\n\n');
}

export function buildStructuredTaskInput(thesis, taskName, prompt, extra = {}) {
  const chapterIndex = Number.isInteger(extra.chapterIndex) ? extra.chapterIndex : (thesis.currentChapterIndex || 0);
  const chapterTitles = Array.isArray(thesis.chapterTitles) ? thesis.chapterTitles : [];
  const expectedSubsections = getExpectedSubsections(thesis.outline, chapterIndex);

  return {
    prompt,
    taskName,
    theme: thesis.topic || '',
    faculty: thesis.faculty || '',
    degreeCourse: thesis.course || '',
    degreeType: thesis.degreeType || '',
    methodology: thesis.method || '',
    requestedChapters: chapterTitles.length || thesis.chapters.length || 0,
    approvedOutline: thesis.outline || '',
    approvedAbstract: thesis.abstract || '',
    chapterTitles,
    approvedChapters: (thesis.chapters || []).filter((chapter) => String(chapter.content || '').trim()).map((chapter) => ({ title: chapter.title, content: chapter.content })),
    previousChapters: summarizePreviousChapters(thesis, chapterIndex),
    currentChapterIndex: chapterIndex,
    currentChapterTitle: chapterTitles[chapterIndex] || thesis.chapters?.[chapterIndex]?.title || '',
    expectedSubsections,
    constraints: {
      noInventedSources: true,
      preserveAcademicTone: true,
      preferSobriety: true,
      adminUnlimitedMode: true,
      desktopShouldFollowUserBackendLogic: true
    },
    extra
  };
}

export function promptOutline(thesis) {
  return `Genera un indice universitario completo e credibile per una tesi ${methodLabel(thesis.method)} in ${thesis.faculty}, corso ${thesis.course}.
Tema: ${thesis.topic}.
Restituisci solo l'indice, con Introduzione, capitoli numerati con sottosezioni, Conclusioni e Bibliografia.`;
}

export function promptOutlineRevision(thesis, notes) {
  return `Revisiona l'indice della tesi mantenendo coerenza disciplinare, struttura accademica e pertinenza.
Tema: ${thesis.topic}.
Osservazioni da recepire: ${notes}.
Restituisci solo l'indice revisionato.`;
}

export function promptAbstract(thesis) {
  return `Scrivi l'abstract di una tesi ${methodLabel(thesis.method)} in ${thesis.faculty}, corso ${thesis.course}.
Titolo: ${thesis.title}.
Tema: ${thesis.topic}.
Indice approvato:
${thesis.outline}

Restituisci un abstract accademico in italiano, chiaro e formale.`;
}

export function promptAbstractRevision(thesis, notes) {
  return `Revisiona l'abstract della tesi recependo in modo riconoscibile queste osservazioni: ${notes}.
Titolo: ${thesis.title}.
Tema: ${thesis.topic}.
Restituisci solo l'abstract revisionato.`;
}

export function promptChapter(thesis, chapterIndex) {
  const title = thesis.chapterTitles[chapterIndex] || thesis.chapters?.[chapterIndex]?.title || `Capitolo ${chapterIndex + 1}`;
  const expectedSubsections = getExpectedSubsections(thesis.outline, chapterIndex);
  const subsectionBlock = expectedSubsections.length
    ? `\nSviluppa con continuità tutte le sottosezioni previste per questo capitolo, senza fermarti a metà:\n${expectedSubsections.join('\n')}\n`
    : '\nSe l’indice suggerisce sottosezioni implicite del capitolo, sviluppale tutte in modo coerente.\n';
  return `Scrivi il ${ordinal(chapterIndex + 1)} capitolo di una tesi ${methodLabel(thesis.method)} in ${thesis.faculty}, corso ${thesis.course}.
Titolo capitolo: ${title}.
Titolo tesi: ${thesis.title}.
Tema: ${thesis.topic}.
Mantieni piena coerenza con l'indice approvato e con gli eventuali capitoli precedenti.${subsectionBlock}
Restituisci solo il testo del capitolo, completo e utilizzabile.`;
}

export function promptChapterRevision(thesis, chapterIndex, notes) {
  const title = thesis.chapterTitles[chapterIndex] || thesis.chapters?.[chapterIndex]?.title || `Capitolo ${chapterIndex + 1}`;
  const expectedSubsections = getExpectedSubsections(thesis.outline, chapterIndex);
  const subsectionBlock = expectedSubsections.length
    ? `\nMantieni e completa, se presenti, queste sottosezioni del capitolo: ${expectedSubsections.join('; ')}.`
    : '';
  return `Revisiona il capitolo della tesi mantenendo tono accademico, rigore teorico e coerenza con l'indice.
Titolo capitolo: ${title}.
Osservazioni: ${notes}.${subsectionBlock}
Restituisci solo il capitolo revisionato.`;
}

export function promptTutorRevision(thesis, chapterIndex, notes) {
  const title = thesis.chapterTitles[chapterIndex] || thesis.chapters?.[chapterIndex]?.title || `Capitolo ${chapterIndex + 1}`;
  const expectedSubsections = getExpectedSubsections(thesis.outline, chapterIndex);
  const subsectionBlock = expectedSubsections.length
    ? `\nConserva e sviluppa coerentemente le sottosezioni già previste dal capitolo: ${expectedSubsections.join('; ')}.`
    : '';
  return `Applica le osservazioni del relatore al capitolo della tesi in modo sostanziale e riconoscibile.
Titolo capitolo: ${title}.
Osservazioni del relatore: ${notes}.
Rendi il testo più solido, analitico e rigoroso senza usare elenchi.${subsectionBlock}
Restituisci solo il capitolo revisionato.`;
}

export function getExpectedSubsections(outlineText, chapterIndex) {
  const lines = String(outlineText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const chapterNo = chapterIndex + 1;
  const subsectionRegex = new RegExp(`^${chapterNo}\\.\\d+\\s+`);
  return lines.filter((line) => subsectionRegex.test(line));
}

export function assertChapterCompleteness(thesis, chapterIndex, chapterText) {
  const text = String(chapterText || '').trim();
  if (!text) throw new Error('Capitolo vuoto: il provider non ha restituito contenuto utilizzabile.');
  if (text.length < 1400) {
    throw new Error('Capitolo troppo breve o incompleto: risposta non accettata.');
  }

  const expectedSubsections = getExpectedSubsections(thesis.outline, chapterIndex);
  if (expectedSubsections.length >= 2) {
    const presentMarkers = expectedSubsections.filter((line) => {
      const marker = (line.match(/^(\d+\.\d+)/) || [])[1];
      return marker && text.includes(marker);
    });

    const coverage = presentMarkers.length / expectedSubsections.length;

    // allineamento più vicino alla logica user: non chiedere copertura totale,
    // ma respingere solo se la risposta manca quasi tutte le sottosezioni attese.
    if (coverage < 0.5 && text.length < 3200) {
      throw new Error('Capitolo incompleto: copertura insufficiente delle sottosezioni previste.');
    }
  }

  // non bloccare più su una semplice frase finale non conclusa;
  // la versione desktop deve seguire più da vicino la logica della user,
  // evitando falsi negativi sul solo controllo del finale.
}

function methodLabel(method) {
  const map = {
    Teorica: 'teorica',
    Comparativa: 'comparativa',
    'Caso studio': 'basata su caso studio',
    'Revisione sistematica': 'di revisione della letteratura',
    Personalizzato: 'con approccio personalizzato'
  };
  return map[method] || 'teorica';
}

function ordinal(num) {
  const map = { 1: 'primo', 2: 'secondo', 3: 'terzo', 4: 'quarto', 5: 'quinto', 6: 'sesto' };
  return map[num] || `${num}°`;
}

function touchThesis(thesis) {
  thesis.updatedAt = new Date().toISOString();
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
