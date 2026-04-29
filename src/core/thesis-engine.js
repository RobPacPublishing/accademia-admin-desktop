import { createVersion } from './admin-state.js';

export const CHAPTER_POINT_MIN_WORDS = 700;
export const CHAPTER_POINT_TARGET_MIN_WORDS = 800;
export const CHAPTER_POINT_MAX_WORDS = 1000;
export const CHAPTER_POINT_MIN_SUBSTANTIAL_PARAGRAPHS = 5;

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

  thesis.chapters = thesis.chapters.slice(0, total).map((chapter, index) => {
    const fromTitles = thesis.chapterTitles[index];
    const isGeneric = (t) => !t || /^Capitolo\s+\d+$/i.test(String(t).trim());
    // Priorità: chapterTitles reale > chapter.title reale > generico
    const title = !isGeneric(fromTitles) ? fromTitles
      : !isGeneric(chapter.title) ? chapter.title
      : `Capitolo ${index + 1}`;
    return {
      ...chapter,
      id: chapter.id || `${thesis.id}-chapter-${index + 1}`,
      title,
      versions: Array.isArray(chapter.versions) ? chapter.versions : []
    };
  });

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
  } else {
    // Nessun titolo estratto col formato standard: aggiorna comunque i chapter.title
    // dai chapterTitles esistenti se non sono generici
    thesis.chapters = thesis.chapters.map((chapter, index) => ({
      ...chapter,
      title: (thesis.chapterTitles[index] && !/^Capitolo\s+\d+$/i.test(thesis.chapterTitles[index]))
        ? thesis.chapterTitles[index]
        : chapter.title || `Capitolo ${index + 1}`
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
  const cleaned = normalizeChapterForExport(thesis, chapterIndex, chapterText);
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
      const preview = text.length > 1200 ? `${text.slice(0, 1200)}\u2026` : text;
      return `Capitolo ${index + 1} \u2014 ${chapter.title || `Capitolo ${index + 1}`}\n${preview}`;
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
    adminNotes: thesis.notes || '',
    requestedChapters: chapterTitles.length || thesis.chapters.length || 0,
    approvedOutline: thesis.outline || '',
    approvedAbstract: thesis.abstract || '',
    chapterTitles,
    approvedChapters: (thesis.chapters || []).filter((chapter) => String(chapter.content || '').trim()).map((chapter) => ({ title: chapter.title, content: String(chapter.content || '').slice(0, 1200) + (String(chapter.content || '').length > 1200 ? '…' : '') })),
    previousChapters: summarizePreviousChapters(thesis, chapterIndex),
    currentChapterIndex: chapterIndex,
    currentChapterTitle: resolveChapterTitle(thesis, chapterIndex),
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

// Restituisce il titolo reale del capitolo, dando priorità all'indice approvato.
// Evita titoli generici ("Capitolo N") che causano heading errato nelle Note.
export function resolveChapterTitle(thesis, chapterIndex) {
  const fromOutline = parseChapterTitles(thesis.outline || '')[chapterIndex];
  if (fromOutline && !/^Capitolo\s+\d+$/i.test(fromOutline.trim())) return fromOutline;
  const fromTitles = Array.isArray(thesis.chapterTitles) ? thesis.chapterTitles[chapterIndex] : null;
  if (fromTitles && !/^Capitolo\s+\d+$/i.test(String(fromTitles).trim())) return fromTitles;
  const fromChapter = thesis.chapters?.[chapterIndex]?.title;
  if (fromChapter && !/^Capitolo\s+\d+$/i.test(String(fromChapter).trim())) return fromChapter;
  // Ultimo fallback: tenta di riestrarre dall'outline con regex più larga (formato "Capitolo N — Titolo")
  const outlineLines = String(thesis.outline || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const n = chapterIndex + 1;
  for (const line of outlineLines) {
    const m = line.match(new RegExp(`^(?:capitolo\\s+)?${n}[.\\s—\\-:]\\s*(.+)$`, 'i'));
    if (m && m[1] && !/^Capitolo\s+\d+$/i.test(m[1].trim())) return m[1].trim();
  }
  return `Capitolo ${n}`;
}

export function buildDisciplinaryWritingGuidance(thesis) {
  const faculty = String(thesis.faculty || '').toLowerCase();
  const course = String(thesis.course || '').toLowerCase();
  const methodology = String(thesis.method || '');
  const area = `${faculty} ${course}`;
  const has = (patterns) => patterns.some((p) => area.includes(p));
  const methodHint = methodology
    ? ` Integra sempre il ragionamento con coerenza rispetto alla metodologia dichiarata (${methodology}), esplicitando passaggi, limiti e portata delle inferenze.`
    : '';

  let profile = '';
  if (has(['comunicazione', 'media', 'sociologia', 'giornal', 'digitale', 'cultural'])) {
    profile = "Imposta l'argomentazione su media, pratiche discorsive, frame interpretativi, piattaforme, pubblico e visibilit\u00e0; collega ogni passaggio al contesto socioculturale evitando generalizzazioni astratte.";
  } else if (has(['psicologia', 'cognitiv', 'neurosc', 'comportament'])) {
    profile = 'Distingui chiaramente costrutti, modelli teorici e processi cognitivi/comportamentali; formula inferenze caute ed evita diagnosi o affermazioni cliniche non supportate.';
  } else if (has(['economia', 'management', 'aziendal', 'impresa', 'finance', 'mercato'])) {
    profile = 'Collega i concetti a modelli economici/organizzativi, incentivi, mercato, efficienza e governance; mantieni rigore comparativo ed evita numeri o stime non verificabili.';
  } else if (has(['giurisprud', 'diritto', 'legal', 'forense'])) {
    profile = 'Argomenta distinguendo norme, principi, orientamenti dottrinali e profili interpretativi; evita affermazioni giuridiche assolute quando il supporto teorico non \u00e8 esplicito.';
  } else if (has(['formazione', 'pedagog', 'didatt', 'educaz', 'insegn'])) {
    profile = 'Sviluppa il ragionamento su processi formativi, pratiche didattiche, contesti educativi e valutazione degli esiti; esplicita sempre implicazioni pedagogiche e limiti applicativi.';
  } else if (has(['informatica', 'computer', 'tecnolog', 'intelligenza artificiale', 'ai', 'data science', 'software'])) {
    profile = 'Struttura la trattazione in termini di modelli, architetture/processi, criteri di valutazione e trade-off; chiarisci assunzioni tecniche, vincoli e limiti di generalizzazione.';
  } else if (has(['medicina', 'sanitar', 'infermier', 'clinic', 'farmacia', 'biomedic'])) {
    profile = 'Usa massima prudenza: mantieni un taglio teorico-evidenziale, distingui risultati, limiti e livello di evidenza; non formulare indicazioni cliniche prescrittive.';
  } else if (has(['filosofia', 'storia', 'lettere', 'umanist', 'lingu', 'arte'])) {
    profile = 'Privilegia analisi concettuale e storico-interpretativa, chiarendo categorie, cornici teoriche e passaggi argomentativi; evita sintesi descrittive prive di problematizzazione critica.';
  } else if (has(['architettura', 'urbanist', 'design', 'pianificazione'])) {
    profile = 'Integra dimensione progettuale e critico-teorica: collega concetti a casi, contesti costruiti, processi spaziali e scelte progettuali; esplicita criteri compositivi, funzionali e relazionali.';
  } else if (has(['scienze politiche', 'politolog', 'relazioni internazionali', 'geopolit', 'pubblica amministrazione'])) {
    profile = 'Argomenta distinguendo istituzioni, attori, processi decisionali e contesti normativi; collega ogni passaggio a teorie politologiche o casi empirici specifici, evitando affermazioni prescrittive non fondate.';
  } else if (has(['servizio sociale', 'lavoro sociale', 'welfare'])) {
    profile = 'Sviluppa il ragionamento su politiche sociali, pratiche di intervento, contesti di vulnerabilit\u00e0 e modelli di welfare; esplicita sempre implicazioni operative e limiti applicativi.';
  } else if (has(['biologia', 'chimica', 'fisica', 'scienze natural', 'geologia', 'ambient'])) {
    profile = 'Mantieni rigore scientifico: distingui ipotesi, metodi, risultati e interpretazioni; esplicita livello di certezza, limiti sperimentali e portata delle conclusioni; evita affermazioni causali non supportate da evidenza.';
  } else if (faculty || course || methodology) {
    profile = "Mantieni un'impostazione accademica disciplinata: definizioni operative, argomentazione progressiva, nessi logici espliciti, cautele inferenziali e lessico coerente con l'area di studio.";
  }

  return profile ? `${profile}${methodHint}`.trim() : '';
}

export function buildChapterNotes(thesis, chapterText) {
  const disciplinary = buildDisciplinaryWritingGuidance(thesis);
  const chapterTitle = thesis.chapterTitles?.[thesis.currentChapterIndex] || 'Capitolo';
  return [
    'TASK: chapter_notes',
    `CAPITOLO: ${chapterTitle}`,
    `CONTESTO ACCADEMICO\nFacolt\u00e0: ${thesis.faculty}\nCorso: ${thesis.course}\nTipo laurea: ${thesis.degreeType}`,
    thesis.topic ? `ARGOMENTO: ${thesis.topic}` : '',
    disciplinary ? `PROFILO DISCIPLINARE:\n${disciplinary}` : '',
    `TESTO DEL CAPITOLO:\n${String(chapterText || '').slice(0, 5500)}`,
    [
      'REGOLE OBBLIGATORIE:',
      'Genera solo una sezione finale intitolata Note, da apporre in chiusura di capitolo.',
      'Scrivi da 3 a 6 note numerate (1., 2., 3. ...).',
      'Se nel testo del capitolo sono presenti rimandi numerati [1], [2], [3], le note DEVONO riprenderli con la stessa numerazione esatta.',
      'Se nel testo non sono presenti rimandi espliciti, genera da 3 a 6 note autonome pertinenti al capitolo.',
      'Ogni nota svolge una funzione specifica: precisazione concettuale, chiarimento terminologico, cautela metodologica, distinzione tra correnti teoriche.',
      'Non inventare fonti, autori, anni, pagine, citazioni dirette o dati empirici.',
      'Se richiami autori o tradizioni teoriche, fallo in modo generale senza riferimenti puntuali non verificabili.',
      'Non ripetere passaggi già presenti nel testo del capitolo.',
      'Formato: intestazione "Note" seguita da note numerate, testo in prosa continua.',
      'Restituisci solo la sezione Note, senza testo aggiuntivo prima o dopo.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function promptOutline(thesis) {
  const isMagistrale = String(thesis.degreeType || '').toLowerCase().includes('magistral');
  const structureRule = isMagistrale
    ? 'Determina una struttura di 4-6 capitoli con 3-4 sottosezioni per capitolo, impianto analitico-critico e sviluppo non meramente descrittivo.'
    : 'Determina una struttura di 3-4 capitoli con 3 sottosezioni per capitolo, progressione chiara dall\'inquadramento teorico alle conclusioni.';
  return [
    'TASK: outline_draft',
    `ARGOMENTO: ${thesis.topic}`,
    `CONTESTO ACCADEMICO\nFacolt\u00e0: ${thesis.faculty}\nCorso di laurea: ${thesis.course}\nTipo di laurea: ${thesis.degreeType}\nMetodologia: ${thesis.method}`,
    thesis.notes ? `ISTRUZIONI OPERATIVE:\n${thesis.notes}` : '',
    [
      'REGOLE OBBLIGATORIE:',
      structureRule,
      "Il primo capitolo svolge funzione teorico-fondativa: stato dell'arte, quadro concettuale, definizioni operative.",
      isMagistrale ? "Per tesi magistrali prevedi un impianto piu' profondo: stato dell'arte, gap o problema teorico e contributo analitico riconoscibile." : '',
      "L'ultimo capitolo chiude con sintesi critica, limiti, implicazioni o prospettive future - mai con un mero riepilogo descrittivo.",
      'Per tesi teoriche o di review non proporre un capitolo metodologico autonomo: integra la metodologia nel primo o secondo capitolo.',
      'I titoli di capitoli e sottosezioni devono essere informativi e specifici: evita titoli generici come "Introduzione al tema" o "Considerazioni finali" senza specificazione di contenuto.',
      "Se la facolta' ha convenzioni strutturali riconoscibili (es. Giurisprudenza: norma - dottrina - giurisprudenza; Psicologia: costrutti - modelli - implicazioni), rispettale.",
      'Includi solo la struttura della tesi: capitoli e sottosezioni numerati. Non aggiungere commenti, premesse, bibliografia descritta o spiegazioni esterne.',
      'Restituisci solo l\'indice numerato nel formato: "1. Titolo capitolo\\n   1.1 Titolo sottosezione\\n   1.2 Titolo sottosezione\\n2. ..." - nessun testo aggiuntivo prima o dopo.',
    ].filter(Boolean).join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function promptOutlineRevision(thesis, notes) {
  return [
    'TASK: outline_review',
    `ARGOMENTO: ${thesis.topic}`,
    `CONTESTO ACCADEMICO\nFacolt\u00e0: ${thesis.faculty}\nCorso: ${thesis.course}\nTipo laurea: ${thesis.degreeType}\nMetodologia: ${thesis.method}`,
    `INDICE ATTUALE:\n${thesis.outline}`,
    `OSSERVAZIONI DA RECEPIRE:\n${notes}`,
    [
      'REGOLE:',
      'Applica le osservazioni in modo riconoscibile e non cosmetico.',
      'Conserva la struttura generale salvo richiesta esplicita di cambiarla.',
      'Mantieni titoli informativi e specifici.',
      "Restituisci solo l'indice revisionato, stesso formato dell'originale.",
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function promptAbstract(thesis) {
  const isMagistrale = String(thesis.degreeType || '').toLowerCase().includes('magistral');
  const wordTarget = isMagistrale ? '250-300 parole' : '180-220 parole';
  return [
    'TASK: abstract_draft',
    `CONTESTO ACCADEMICO\nFacolt\u00e0: ${thesis.faculty}\nCorso: ${thesis.course}\nTipo laurea: ${thesis.degreeType}\nMetodologia: ${thesis.method}`,
    thesis.notes ? `ISTRUZIONI OPERATIVE:\n${thesis.notes}` : '',
    `ARGOMENTO: ${thesis.topic}`,
    `INDICE APPROVATO:\n${thesis.outline}`,
    [
      'REGOLE OBBLIGATORIE:',
      "Struttura l'abstract nelle seguenti componenti nell'ordine indicato: (1) contesto e motivazione, (2) obiettivo o domanda di ricerca, (3) metodologia adottata, (4) principali risultati o argomentazioni, (5) conclusioni e implicazioni.",
      `Lunghezza target: ${wordTarget}.`,
      "L'abstract deve essere autonomo: non rimandare a capitoli, non usare riferimenti numerici interni, non usare elenchi puntati.",
      'Tono: sintetico, impersonale, al presente o passato prossimo. Evita il futuro ("si analizzer\u00e0", "verranno trattati").',
      'Non inventare risultati o dati: se la tesi è teorica, descrivi il contributo argomentativo.',
      'Non usare formule di apertura banali come "Il presente lavoro si propone di" o "Questa tesi analizza".',
      'Inserisci una riga vuota prima della formula finale.',
      'Chiudi andando a capo con: "Parole chiave: [5-7 termini rilevanti separati da virgola]".',
      "Restituisci solo il testo dell'abstract, senza titolo, intestazioni o commenti aggiuntivi.",
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function promptAbstractRevision(thesis, notes) {
  return [
    'TASK: abstract_review',
    `ARGOMENTO: ${thesis.topic}`,
    `ABSTRACT ATTUALE:\n${thesis.abstract}`,
    `OSSERVAZIONI:\n${notes}`,
    [
      'REGOLE:',
      'Migliora struttura, precisione e tono senza stravolgere il contenuto.',
      'Mantieni le 5 componenti: contesto, obiettivo, metodologia, risultati/argomentazioni, conclusioni.',
      'Rendi i miglioramenti riconoscibili.',
      "Restituisci solo il testo dell'abstract revisionato.",
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function promptChapterOpening(thesis, chapterIndex) {
  const title = thesis.chapterTitles[chapterIndex] || thesis.chapters?.[chapterIndex]?.title || `Capitolo ${chapterIndex + 1}`;
  const expectedSubsections = getExpectedSubsections(thesis.outline, chapterIndex);
  const disciplinary = buildDisciplinaryWritingGuidance(thesis);
  return [
    'TASK: chapter_opening',
    `CAPITOLO: ${title}`,
    `CONTESTO ACCADEMICO\nFacolta': ${thesis.faculty}\nCorso: ${thesis.course}\nTipo laurea: ${thesis.degreeType}\nMetodologia: ${thesis.method}`,
    `ARGOMENTO: ${thesis.topic}`,
    thesis.notes ? `ISTRUZIONI OPERATIVE:\n${thesis.notes}` : '',
    `INDICE APPROVATO:\n${thesis.outline}`,
    thesis.abstract ? `ABSTRACT APPROVATO:\n${thesis.abstract}` : '',
    disciplinary ? `PROFILO DISCIPLINARE:\n${disciplinary}` : '',
    expectedSubsections.length ? `SOTTOSEZIONI DEL CAPITOLO:\n${expectedSubsections.join('\n')}` : '',
    [
      'REGOLE OBBLIGATORIE:',
      'Scrivi SOLO il paragrafo introduttivo del capitolo, che precede la prima sottosezione.',
      'Il paragrafo deve contestualizzare il capitolo nel quadro generale della tesi, anticipare la logica argomentativa e giustificare la struttura delle sottosezioni senza descriverle una per una.',
      'Lunghezza: 150-250 parole. Tono accademico, nessuna formula scolastica come "in questo capitolo si analizzeranno".',
      'Non includere titoli, sottotitoli o intestazioni.',
      'Non iniziare con il titolo del capitolo.',
      'NON aggiungere sezioni Note, riferimenti bibliografici o appendici.',
      'Restituisci solo il testo del paragrafo introduttivo.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function promptChapterSubsection(thesis, chapterIndex, subsection, subsectionIndex, totalSubsections, previousText) {
  const chapterTitle = thesis.chapterTitles[chapterIndex] || thesis.chapters?.[chapterIndex]?.title || `Capitolo ${chapterIndex + 1}`;
  const disciplinary = buildDisciplinaryWritingGuidance(thesis);
  const isFirst = subsectionIndex === 0;
  const isLast = subsectionIndex === totalSubsections - 1;
  return [
    'TASK: chapter_subsection',
    `CAPITOLO: ${chapterTitle}`,
    `SOTTOSEZIONE DA SVILUPPARE: ${subsection}`,
    `POSIZIONE: ${subsectionIndex + 1} di ${totalSubsections}`,
    `CONTESTO ACCADEMICO\nFacolta': ${thesis.faculty}\nCorso: ${thesis.course}\nTipo laurea: ${thesis.degreeType}\nMetodologia: ${thesis.method}`,
    `ARGOMENTO: ${thesis.topic}`,
    thesis.notes ? `ISTRUZIONI OPERATIVE:\n${thesis.notes}` : '',
    disciplinary ? `PROFILO DISCIPLINARE:\n${disciplinary}` : '',
    subsectionIndex > 0 ? `NOTA: questa e' la sottosezione ${subsectionIndex + 1} di ${totalSubsections}. Le sottosezioni precedenti sono gia' state generate. NON rigenerare le sottosezioni precedenti.` : '',
    [
      'REGOLE OBBLIGATORIE:',
      `Inizia esattamente con il titolo della sottosezione: ${subsection}`,
      'NON scrivere il titolo del capitolo prima del titolo della sottosezione.',
      'NON scrivere intestazioni come "Capitolo 1 —" o simili.',
      'Sviluppa SOLO questa sottosezione, completa e autonoma.',
      `Lunghezza obbligatoria: ${CHAPTER_POINT_TARGET_MIN_WORDS}-${CHAPTER_POINT_MAX_WORDS} parole; minimo assoluto ${CHAPTER_POINT_MIN_WORDS} parole.`,
      `Struttura minima: almeno ${CHAPTER_POINT_MIN_SUBSTANTIAL_PARAGRAPHS} paragrafi sostanziali, non frammenti brevi.`,
      'Progressione argomentativa esplicita: ogni paragrafo aggiunge un tassello teorico nuovo e contiene una giustificazione teorica.',
      'Evita descrizioni generiche o da manuale scolastico: mantieni taglio critico, analitico e tesi-centrico.',
      isFirst ? 'Questa e\' la prima sottosezione: non ripetere il paragrafo introduttivo del capitolo.' : 'Non riaprire il ragionamento dall\'inizio: prosegui con continuita\' da quanto gia\' sviluppato.',
      isLast ? 'Questa e\' l\'ultima sottosezione: chiudi con una micro-sintesi critica che prepara la transizione al capitolo successivo, senza formule come "in conclusione".' : 'Chiudi con una micro-sintesi critica (limite, implicazione o conseguenza teorica), senza anticipare la sottosezione successiva.',
      'Non inventare fonti, autori, anni o dati empirici.',
      'Dove opportuno inserisci rimandi numerati [1][2][3] - massimo 2 per sottosezione.',
      'Nessun elenco puntato, nessun markdown non richiesto.',
      'NON aggiungere sezioni Note, riferimenti bibliografici o appendici: le note saranno generate separatamente a fine capitolo.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function promptChapter(thesis, chapterIndex) {
  const title = thesis.chapterTitles[chapterIndex] || thesis.chapters?.[chapterIndex]?.title || `Capitolo ${chapterIndex + 1}`;
  const expectedSubsections = getExpectedSubsections(thesis.outline, chapterIndex);
  const subsectionBlock = expectedSubsections.length
    ? `SOTTOSEZIONI PREVISTE DALL'INDICE:\n${expectedSubsections.join('\n')}\nSviluppa tutte le sottosezioni con continuit\u00e0, senza fermarti a met\u00e0.`
    : "Se l'indice suggerisce sottosezioni implicite del capitolo, sviluppale tutte in modo coerente.";
  const prevSummary = summarizePreviousChapters(thesis, chapterIndex);
  const disciplinary = buildDisciplinaryWritingGuidance(thesis);
  return [
    'TASK: chapter_draft',
    `CAPITOLO: ${title}`,
    `CONTESTO ACCADEMICO\nFacolt\u00e0: ${thesis.faculty}\nCorso: ${thesis.course}\nTipo laurea: ${thesis.degreeType}\nMetodologia: ${thesis.method}`,
    `ARGOMENTO: ${thesis.topic}`,
    thesis.notes ? `ISTRUZIONI OPERATIVE:\n${thesis.notes}` : '',
    `INDICE APPROVATO:\n${thesis.outline}`,
    thesis.abstract ? `ABSTRACT APPROVATO:\n${thesis.abstract}` : '',
    prevSummary ? `CAPITOLI PRECEDENTI (SINTESI):\n${prevSummary}` : '',
    disciplinary ? `PROFILO DISCIPLINARE:\n${disciplinary}` : '',
    subsectionBlock,
    [
      'REGOLE OBBLIGATORIE:',
      'Scrivi in italiano accademico: formale, preciso, privo di tono giornalistico o divulgativo.',
      `Ogni sottosezione deve tendere a ${CHAPTER_POINT_TARGET_MIN_WORDS}-${CHAPTER_POINT_MAX_WORDS} parole, con minimo assoluto ${CHAPTER_POINT_MIN_WORDS} parole e almeno ${CHAPTER_POINT_MIN_SUBSTANTIAL_PARAGRAPHS} paragrafi sostanziali.`,
      'Sviluppa il contenuto con progressione argomentativa esplicita: ogni paragrafo aggiunge un tassello teorico nuovo rispetto al precedente.',
      "Ogni paragrafo deve contenere almeno un'affermazione concettuale chiara e la relativa giustificazione teorica.",
      'Evita descrizioni generiche o da manuale scolastico: mantieni taglio critico e analitico.',
      'Non ripetere definizioni o concetti già trattati nei capitoli precedenti.',
      'Non inventare fonti, autori, dati, anni di pubblicazione o risultati empirici.',
      "Non usare elenchi puntati, markdown, titoli non previsti dall'indice approvato.",
      "Non aprire il capitolo con riepilogo dell'indice o con meta-commenti sul testo.",
      'Non chiudere con formule scolastiche come "in conclusione" o anticipazioni del capitolo successivo.',
      'Dove opportuno inserisci rimandi numerati nel testo con formato [1], [2], [3] - massimo 3-6 per capitolo - solo per passaggi che richiedono una precisazione concettuale o metodologica.',
      'Restituisci solo il testo del capitolo, completo e utilizzabile.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function promptChapterRevision(thesis, chapterIndex, notes) {
  const title = thesis.chapterTitles[chapterIndex] || thesis.chapters?.[chapterIndex]?.title || `Capitolo ${chapterIndex + 1}`;
  const chapterContent = thesis.chapters?.[chapterIndex]?.content || '';
  const expectedSubsections = getExpectedSubsections(thesis.outline, chapterIndex);
  const subsectionBlock = expectedSubsections.length
    ? `Mantieni le sottosezioni previste dall'indice: ${expectedSubsections.join('; ')}.`
    : '';
  return [
    'TASK: chapter_review',
    `CAPITOLO: ${title}`,
    `CONTESTO ACCADEMICO\nFacolt\u00e0: ${thesis.faculty}\nCorso: ${thesis.course}\nTipo laurea: ${thesis.degreeType}`,
    `ARGOMENTO: ${thesis.topic}`,
    `INDICE APPROVATO:\n${thesis.outline}`,
    chapterContent ? `TESTO ATTUALE DEL CAPITOLO:\n${chapterContent.slice(0, 6000)}` : '',
    `OSSERVAZIONI:\n${notes}`,
    subsectionBlock,
    [
      'REGOLE OBBLIGATORIE:',
      'Intervieni in modo sostanziale secondo la richiesta: migliora profondit\u00e0 argomentativa, coerenza interna, precisione terminologica e stile.',
      'Elimina ripetizioni, passaggi generici, frasi deboli o ridondanti.',
      'Ogni sottosezione deve restare sostanziale: almeno 5 paragrafi pieni quando possibile, progressione teorica esplicita e chiusura argomentativa autonoma.',
      'Non ridurre la lunghezza del capitolo salvo richiesta esplicita; se il testo e\' debole, amplialo con contenuto analitico coerente anziche\' comprimerlo.',
      'Elimina formule da AI, chiuse scolastiche e frasi meta come "questo capitolo" o "nel prossimo capitolo".',
      'Non trasformare la revisione in una nuova generazione da zero salvo richiesta esplicita.',
      "Non introdurre argomenti fuori indice e mantieni continuit\u00e0 con abstract e parti gia' approvate.",
      'Non aggiungere citazioni puntuali, anni, pagine o bibliografia se non forniti in input.',
      'Non inventare dati, fonti o riferimenti.',
      'Produci il capitolo intero rivisto, non solo le parti modificate.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function promptTutorRevision(thesis, chapterIndex, tutorInput) {
  const title = thesis.chapterTitles[chapterIndex] || thesis.chapters?.[chapterIndex]?.title || `Capitolo ${chapterIndex + 1}`;
  const chapterContent = thesis.chapters?.[chapterIndex]?.content || '';
  const expectedSubsections = getExpectedSubsections(thesis.outline, chapterIndex);
  const subsectionBlock = expectedSubsections.length
    ? `Conserva e sviluppa coerentemente le sottosezioni gia' previste: ${expectedSubsections.join('; ')}.`
    : '';

  const notes = typeof tutorInput === 'string' ? tutorInput : (tutorInput?.notes || '');
  const extracts = typeof tutorInput === 'object' ? (tutorInput?.extracts || '') : '';
  const authors = typeof tutorInput === 'object' ? (tutorInput?.authors || '') : '';
  const sections = typeof tutorInput === 'object' ? (tutorInput?.sections || '') : '';

  return [
    'TASK: tutor_revision',
    `CAPITOLO: ${title}`,
    `CONTESTO ACCADEMICO\nFacolt\u00e0: ${thesis.faculty}\nCorso: ${thesis.course}\nTipo laurea: ${thesis.degreeType}\nMetodologia: ${thesis.method}`,
    `ARGOMENTO: ${thesis.topic}`,
    thesis.notes ? `ISTRUZIONI OPERATIVE:\n${thesis.notes}` : '',
    `INDICE APPROVATO:\n${thesis.outline}`,
    thesis.abstract ? `ABSTRACT APPROVATO:\n${thesis.abstract}` : '',
    chapterContent ? `CAPITOLO ATTUALE:\n${chapterContent.slice(0, 6000)}` : '',
    `OSSERVAZIONI DEL RELATORE:\n${notes}`,
    extracts ? `ESTRATTI DA INTEGRARE:\n${extracts}` : '',
    authors ? `AUTORI E TEORIE DA CONSIDERARE:\n${authors}` : '',
    sections ? `PARTI SPECIFICHE DA MODIFICARE:\n${sections}` : '',
    subsectionBlock,
    [
      'REGOLE OBBLIGATORIE:',
      'Ogni osservazione del relatore va applicata in modo riconoscibile e non cosmetico: il miglioramento deve essere visibile nel testo.',
      'Non ignorare nessuna richiesta specifica, anche se richiede riscrittura parziale di un paragrafo.',
      "Se un'osservazione e' ambigua, applicala nel modo piu' coerente con titolo, abstract e indice approvati.",
      'Tratta le osservazioni del relatore come vincolanti e prioritarie: la revisione deve essere sostanziale, riconoscibile e coerente punto per punto con i rilievi ricevuti.',
      'Ogni sottosezione deve compiere tre funzioni: definire con precisione il concetto, interpretarne il significato teorico, spiegare perche\' e\' rilevante per la domanda di ricerca.',
      'In ogni sottosezione inserisci almeno un passaggio interpretativo non ovvio e una frase finale che chiarisca il contributo specifico della sezione.',
      'Quando un passaggio potrebbe valere per qualunque elaborato, rendilo piu\' specifico, tesi-centrico e aderente al fenomeno studiato.',
      'Aumenta densita\' argomentativa, precisione terminologica, coesione tra paragrafi, gerarchia del ragionamento e qualita\' delle transizioni interne.',
      'Se sono forniti estratti da integrare, usali come materiale reale da incorporare nel ragionamento - non inventare fonti aggiuntive.',
      'Se sono indicati autori o teorie, rendili visibili nel testo in modo generale e coerente con la disciplina, senza inventare citazioni puntuali.',
      'Se sono indicate parti specifiche da modificare, intervieni su quelle con priorita\'.',
      "Conserva struttura, titoli e ordine del capitolo esistente: non aggiungere sezioni non previste dall'indice.",
      'Mantieni tono accademico, prudente e metodologicamente coerente con la disciplina.',
      'Non inventare fonti, dati o riferimenti bibliografici non forniti.',
      'Non accorciare il capitolo salvo richiesta esplicita del relatore.',
      'Produci il capitolo intero rivisto, non solo le parti modificate.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
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
  const validation = analyzeChapterCompleteness(thesis, chapterIndex, chapterText);
  if (!validation.hasText) throw new Error('Capitolo vuoto: il provider non ha restituito contenuto utilizzabile.');
  if (validation.missingSubsections.length) {
    throw new Error(`Capitolo incompleto: mancano sottosezioni previste (${validation.missingSubsections.map((item) => item.code).join(', ')}).`);
  }
  if (validation.shortSubsections.length) {
    throw new Error(`Capitolo incompleto: sottosezioni troppo brevi (${validation.shortSubsections.map((item) => `${item.code}: ${item.words} parole`).join(', ')}).`);
  }
  if (validation.substantialParagraphIssues.length) {
    throw new Error(`Capitolo incompleto: paragrafi sostanziali insufficienti (${validation.substantialParagraphIssues.map((item) => `${item.code}: ${item.paragraphs}`).join(', ')}).`);
  }
  if (validation.words < validation.minWords) {
    throw new Error(`Capitolo troppo breve: ${validation.words} parole, minimo atteso ${validation.minWords}.`);
  }
  if (validation.suspiciousEnding) throw new Error('Capitolo incompleto: chiusura monca o sintatticamente sospetta.');
  if (validation.artificialClosure) throw new Error('Capitolo incompleto: chiusura artificiale o meta-discorsiva da rifinire.');
}

export function analyzeChapterCompleteness(thesis, chapterIndex, chapterText) {
  const text = String(chapterText || '').replace(/\r\n/g, '\n').trim();
  const expectedSubsections = getExpectedSubsections(thesis?.outline || '', chapterIndex);
  const words = wordCount(text);
  const minWords = chapterWordFloorForValidation(thesis, expectedSubsections.length || 1);
  const missingSubsections = [];
  const shortSubsections = [];
  const substantialParagraphIssues = [];

  for (const line of expectedSubsections) {
    const code = (line.match(/^(\d+\.\d+)/) || [])[1];
    if (!code) continue;
    const sectionText = extractSubsectionText(text, expectedSubsections, line);
    if (!sectionText) {
      missingSubsections.push({ code, title: line.replace(/^(\d+\.\d+)\s+/, '') });
      continue;
    }
    const sectionWords = countSubsectionBodyWords(sectionText);
    if (sectionWords < CHAPTER_POINT_MIN_WORDS) shortSubsections.push({ code, words: sectionWords });
    const paragraphs = countSubstantialParagraphs(sectionText);
    if (paragraphs < CHAPTER_POINT_MIN_SUBSTANTIAL_PARAGRAPHS) substantialParagraphIssues.push({ code, paragraphs });
  }

  const suspiciousEnding = endsSuspiciously(text);
  const artificialClosure = hasArtificialAcademicClosure(text);
  return {
    hasText: !!text,
    words,
    minWords,
    expectedSubsections,
    missingSubsections,
    shortSubsections,
    substantialParagraphIssues,
    suspiciousEnding,
    artificialClosure,
    complete: !!text
      && !missingSubsections.length
      && !shortSubsections.length
      && !substantialParagraphIssues.length
      && words >= minWords
      && !suspiciousEnding
      && !artificialClosure,
  };
}

export function getThesisCompletionReport(thesis) {
  const issues = [];
  if (!String(thesis?.outline || '').trim()) issues.push('Indice mancante.');
  if (!String(thesis?.abstract || '').trim()) issues.push('Abstract mancante.');

  const expectedTitles = parseChapterTitles(thesis?.outline || '');
  const plannedCount = expectedTitles.length || thesis?.chapterTitles?.length || 0;
  const chapters = Array.isArray(thesis?.chapters) ? thesis.chapters : [];
  if (!plannedCount) issues.push('Numero capitoli non determinabile dall\'indice.');
  if (plannedCount && chapters.length < plannedCount) issues.push(`Capitoli presenti ${chapters.length}/${plannedCount}.`);

  const chapterReports = [];
  for (let index = 0; index < plannedCount; index += 1) {
    const report = analyzeChapterCompleteness(thesis, index, chapters[index]?.content || '');
    chapterReports.push(report);
    if (!report.complete) {
      const parts = [];
      if (!report.hasText) parts.push('testo mancante');
      if (report.missingSubsections.length) parts.push(`mancano ${report.missingSubsections.map((item) => item.code).join(', ')}`);
      if (report.shortSubsections.length) parts.push(`punti brevi ${report.shortSubsections.map((item) => item.code).join(', ')}`);
      if (report.substantialParagraphIssues.length) parts.push(`paragrafi insufficienti ${report.substantialParagraphIssues.map((item) => item.code).join(', ')}`);
      if (report.words < report.minWords) parts.push(`${report.words}/${report.minWords} parole`);
      if (report.suspiciousEnding) parts.push('chiusura monca');
      if (report.artificialClosure) parts.push('chiusura artificiale');
      issues.push(`Capitolo ${index + 1}: ${parts.join('; ') || 'non completo'}.`);
    }
  }

  return {
    complete: issues.length === 0,
    issues,
    plannedCount,
    chapterReports,
  };
}

export function normalizeChapterForExport(thesis, chapterIndex, chapterText) {
  const title = resolveChapterTitle(thesis, chapterIndex);
  const headingPatterns = [
    new RegExp(`^\\s*capitolo\\s+${chapterIndex + 1}\\s*[-:–—]?\\s*${escapeRegex(title)}\\s*\\n+`, 'i'),
    new RegExp(`^\\s*capitolo\\s+${chapterIndex + 1}\\b[^\\n]*\\n+`, 'i'),
    new RegExp(`^\\s*CAPITOLO\\s+${chapterIndex + 1}\\s*[-:–—]?\\s*${escapeRegex(title)}\\s*\\n+`, 'i'),
  ];
  let text = String(chapterText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of headingPatterns) {
      const next = text.replace(pattern, '').trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }
  return stripArtificialAcademicTail(text).trim();
}

export function prepareThesisForExport(thesis) {
  const normalized = structuredCloneSafe(thesis || {});
  const report = getThesisCompletionReport(normalized);
  normalized.exportStatus = report.complete ? 'complete' : 'draft';
  normalized.exportIssues = report.issues;
  normalized.chapters = (Array.isArray(normalized.chapters) ? normalized.chapters : []).map((chapter, index) => ({
    ...chapter,
    title: resolveChapterTitle(normalized, index),
    content: normalizeChapterForExport(normalized, index, chapter?.content || ''),
  }));
  return normalized;
}

export function promptFinalRevision(thesis) {
  const chapters = Array.isArray(thesis?.chapters) ? thesis.chapters : [];
  const compactChapters = chapters.map((chapter, index) => {
    const content = normalizeChapterForExport(thesis, index, chapter?.content || '');
    return `CAPITOLO ${index + 1} - ${resolveChapterTitle(thesis, index)}\n${content.slice(0, 7000)}`;
  }).join('\n\n');

  return [
    'TASK: thesis_final_revision',
    `ARGOMENTO: ${thesis.topic || thesis.title || ''}`,
    `CONTESTO ACCADEMICO\nFacolta: ${thesis.faculty || ''}\nCorso: ${thesis.course || ''}\nTipo laurea: ${thesis.degreeType || ''}\nMetodologia: ${thesis.method || ''}`,
    thesis.notes ? `ISTRUZIONI OPERATIVE / NOTE ADMIN:\n${thesis.notes}` : '',
    `INDICE APPROVATO:\n${thesis.outline || ''}`,
    `ABSTRACT APPROVATO:\n${thesis.abstract || ''}`,
    `CAPITOLI ATTUALI:\n${compactChapters}`,
    [
      'REGOLE OBBLIGATORIE:',
      'Esegui una revisione finale globale leggera ma sostanziale dell\'intera tesi.',
      'Mantieni titoli, ordine dei capitoli e sottosezioni dell\'indice approvato.',
      'Migliora continuita\' tra capitoli, stile accademico, precisione terminologica, coerenza disciplinare e profondita\' argomentativa.',
      'Elimina ripetizioni, formule artificiali, chiuse scolastiche, frasi meta e passaggi generici.',
      'Non inventare fonti, dati, anni, citazioni puntuali o bibliografia.',
      'Non accorciare il testo salvo duplicazioni evidenti.',
      'Restituisci la tesi completa in testo piano, con sezioni: INDICE, ABSTRACT, CAPITOLO 1, CAPITOLO 2, ecc.',
      'Non aggiungere commenti di servizio prima o dopo il documento.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

function extractSubsectionText(chapterText, expectedSubsections, subsectionLine) {
  const code = (String(subsectionLine || '').match(/^(\d+\.\d+)/) || [])[1];
  if (!code) return '';
  const startPattern = new RegExp(`(^|\\n)\\s*${escapeRegex(code)}\\s+`, 'm');
  const startMatch = startPattern.exec(chapterText);
  if (!startMatch) return '';
  const start = startMatch.index + (startMatch[1] ? 1 : 0);
  let end = chapterText.length;
  for (const other of expectedSubsections) {
    const otherCode = (String(other || '').match(/^(\d+\.\d+)/) || [])[1];
    if (!otherCode || otherCode === code) continue;
    const otherMatch = new RegExp(`(^|\\n)\\s*${escapeRegex(otherCode)}\\s+`, 'm').exec(chapterText.slice(start + 1));
    if (otherMatch) {
      const candidateEnd = start + 1 + otherMatch.index + (otherMatch[1] ? 1 : 0);
      if (candidateEnd > start && candidateEnd < end) end = candidateEnd;
    }
  }
  return chapterText.slice(start, end).trim();
}

function countSubsectionBodyWords(sectionText) {
  const body = String(sectionText || '').replace(/^\d+\.\d+\s+[^\n]+\n*/i, '').trim();
  return wordCount(body);
}

function countSubstantialParagraphs(sectionText) {
  const body = String(sectionText || '').replace(/^\d+\.\d+\s+[^\n]+\n*/i, '').trim();
  if (!body) return 0;
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => wordCount(p) >= 45).length;
}

function chapterWordFloorForValidation(thesis, subsectionCount) {
  const count = Math.max(1, Number(subsectionCount) || 0);
  const degree = String(thesis?.degreeType || '').toLowerCase();
  if (degree.includes('magistrale') && /2|biennale|post/.test(degree)) return Math.max(2600, count * 760);
  if (degree.includes('magistrale')) return Math.max(2200, count * 680);
  return Math.max(1800, count * 600);
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function endsSuspiciously(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  return /(?:\b(?:e|ed|o|oppure|ma|perche|perchÃ©|poiche|poichÃ©|mentre|quando|dove|come|con|senza|tra|fra|di|a|da|in|su|per)\s*$|[:;,\-–—]\s*$|\b(?:infatti|inoltre|tuttavia|pertanto|quindi)\s*$)$/i.test(s);
}

function hasArtificialAcademicClosure(text) {
  return /(nel prossimo capitolo|nei capitoli successivi|questo capitolo (ha analizzato|si e' proposto|si Ã¨ proposto|ha mostrato|ha evidenziato)|in conclusione,? questo capitolo)/i.test(String(text || '').slice(-520));
}

function stripArtificialAcademicTail(text) {
  return String(text || '')
    .replace(/\n(?:In conclusione,?\s*)?(?:nel|nei) prossim[oi] capitol[oi][\s\S]*$/i, '')
    .replace(/\n(?:In conclusione,?\s*)?questo capitolo (?:ha analizzato|si Ã¨ proposto(?: di)?|si e' proposto(?: di)?|ha mostrato|ha evidenziato|ha esaminato|ha consentito di)[\s\S]*$/i, '')
    .replace(/\n(?:Per concludere|In sintesi|In conclusione),?\s+(?:si puÃ² affermare|si puo' affermare|si puÃ² osservare|si puo' osservare|emerge che|si evidenzia che)[^\n]{0,260}$/i, '')
    .trim();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  return map[num] || `${num}\u00b0`;
}

function touchThesis(thesis) {
  thesis.updatedAt = new Date().toISOString();
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
