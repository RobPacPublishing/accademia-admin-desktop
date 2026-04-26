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
    ? 'Proponi 4-6 capitoli con 2-4 sottosezioni per capitolo, impianto analitico-critico.'
    : 'Proponi 3-4 capitoli con 2-3 sottosezioni per capitolo, impianto essenziale.';
  return [
    'TASK: outline_draft',
    `ARGOMENTO: ${thesis.topic}`,
    `CONTESTO ACCADEMICO\nFacolt\u00e0: ${thesis.faculty}\nCorso di laurea: ${thesis.course}\nTipo di laurea: ${thesis.degreeType}\nMetodologia: ${thesis.method}`,
    thesis.notes ? `ISTRUZIONI OPERATIVE:\n${thesis.notes}` : '',
    [
      'REGOLE OBBLIGATORIE:',
      structureRule,
      "Il primo capitolo svolge funzione teorico-fondativa: stato dell'arte, quadro concettuale, definizioni operative.",
      "L'ultimo capitolo chiude con sintesi critica, limiti, implicazioni o prospettive future - mai con un mero riepilogo descrittivo.",
      'Per tesi teoriche o di review non proporre un capitolo metodologico autonomo: integra la metodologia nel primo o secondo capitolo.',
      'I titoli di capitoli e sottosezioni devono essere informativi e specifici: evita titoli generici come "Introduzione al tema" o "Considerazioni finali" senza specificazione di contenuto.',
      "Se la facolta' ha convenzioni strutturali riconoscibili (es. Giurisprudenza: norma - dottrina - giurisprudenza; Psicologia: costrutti - modelli - implicazioni), rispettale.",
      'Restituisci solo l\'indice numerato nel formato: "1. Titolo capitolo\\n   1.1 Titolo sottosezione\\n   1.2 Titolo sottosezione\\n2. ..." - nessun testo aggiuntivo prima o dopo.',
    ].join('\n'),
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
  const wordTarget = isMagistrale ? '200-300 parole' : '150-250 parole';
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
    chapterContent ? `TESTO ATTUALE DEL CAPITOLO:\n${chapterContent}` : '',
    `OSSERVAZIONI:\n${notes}`,
    subsectionBlock,
    [
      'REGOLE OBBLIGATORIE:',
      'Intervieni in modo sostanziale secondo la richiesta: migliora profondit\u00e0 argomentativa, coerenza interna, precisione terminologica e stile.',
      'Elimina ripetizioni, passaggi generici, frasi deboli o ridondanti.',
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
    chapterContent ? `CAPITOLO ATTUALE:\n${chapterContent}` : '',
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

    if (coverage < 0.5 && text.length < 3200) {
      throw new Error('Capitolo incompleto: copertura insufficiente delle sottosezioni previste.');
    }
  }
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
