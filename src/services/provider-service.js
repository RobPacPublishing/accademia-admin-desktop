function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function normalizeApiTaskEndpoint(apiBaseUrl) {
  const base = normalizeBaseUrl(apiBaseUrl);
  if (!base) throw new Error('Configura l\'endpoint API nella sezione Provider e Prompt.');
  return base.endsWith('/api/task') ? base : `${base}/api/task`;
}

function normalizeProviderProfile(profile = {}) {
  return {
    id: profile.id || `profile-${Date.now()}`,
    name: profile.name || 'Profilo provider',
    apiBaseUrl: String(profile.apiBaseUrl || '').trim(),
    fallbackApiBaseUrl: String(profile.fallbackApiBaseUrl || '').trim(),
    timeoutMs: Number(profile.timeoutMs || 180000) || 180000,
    pingTimeoutMs: Number(profile.pingTimeoutMs || 10000) || 10000
  };
}

export function getProviderProfiles(settings = {}) {
  const profiles = Array.isArray(settings.profiles) ? settings.profiles.map((profile) => normalizeProviderProfile(profile)) : [];
  if (profiles.length) return profiles;
  return [normalizeProviderProfile({
    id: 'profile-produzione',
    name: 'Produzione',
    apiBaseUrl: settings.apiBaseUrl || 'https://www.accademia-tesi.it',
    fallbackApiBaseUrl: settings.fallbackApiBaseUrl || '',
    timeoutMs: settings.timeoutMs || 180000,
    pingTimeoutMs: settings.pingTimeoutMs || 10000
  })];
}

export function getActiveProviderProfile(settings = {}) {
  const profiles = getProviderProfiles(settings);
  const requestedId = settings.activeProfileId;
  return profiles.find((profile) => profile.id === requestedId) || profiles[0];
}

function shouldRetryWithFallback(primaryAttempt) {
  if (!primaryAttempt) return false;
  if (!primaryAttempt.ok && !primaryAttempt.status) return true;
  return Number(primaryAttempt.status || 0) >= 500;
}

async function postJson(endpoint, body, timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      status: res.status,
      data,
      details: data?.details || data?.error || (res.ok ? 'OK' : `Errore API (${res.status})`)
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, status: 0, data: {}, details: 'Timeout connessione API desktop admin.' };
    }
    return { ok: false, status: 0, data: {}, details: error?.message || 'Endpoint non raggiungibile.' };
  } finally {
    window.clearTimeout(timer);
  }
}

export function buildProviderPlan(settings = {}, taskName = 'generic', taskOptions = {}) {
  const activeProfile = getActiveProviderProfile(settings);
  const timeoutMs = Number(taskOptions.timeoutMs || activeProfile.timeoutMs || settings.timeoutMs || 180000) || 180000;
  const pingTimeoutMs = Number(taskOptions.pingTimeoutMs || activeProfile.pingTimeoutMs || settings.pingTimeoutMs || 10000) || 10000;

  return {
    taskName,
    timeoutMs,
    pingTimeoutMs,
    activeProfile,
    primary: {
      label: 'primary',
      endpoint: normalizeApiTaskEndpoint(activeProfile.apiBaseUrl)
    },
    fallback: activeProfile.fallbackApiBaseUrl
      ? {
          label: 'fallback',
          endpoint: normalizeApiTaskEndpoint(activeProfile.fallbackApiBaseUrl)
        }
      : null
  };
}

function decorateResponse(data, meta) {
  return {
    ...data,
    _providerMeta: meta
  };
}

export async function callTaskApi(task, input, settings = {}, taskOptions = {}) {
  const plan = buildProviderPlan(settings, task, taskOptions);
  const attempts = [];

  const primaryAttempt = await postJson(plan.primary.endpoint, { task, input }, plan.timeoutMs);
  attempts.push({ route: 'primary', endpoint: plan.primary.endpoint, ok: primaryAttempt.ok, status: primaryAttempt.status, details: primaryAttempt.details });

  if (primaryAttempt.ok) {
    return decorateResponse(primaryAttempt.data, {
      profileId: plan.activeProfile.id,
      profileName: plan.activeProfile.name,
      usedRoute: 'primary',
      usedEndpoint: plan.primary.endpoint,
      fallbackUsed: false,
      attempts
    });
  }

  if (plan.fallback && shouldRetryWithFallback(primaryAttempt)) {
    const fallbackAttempt = await postJson(plan.fallback.endpoint, { task, input }, plan.timeoutMs);
    attempts.push({ route: 'fallback', endpoint: plan.fallback.endpoint, ok: fallbackAttempt.ok, status: fallbackAttempt.status, details: fallbackAttempt.details });

    if (fallbackAttempt.ok) {
      return decorateResponse(fallbackAttempt.data, {
        profileId: plan.activeProfile.id,
        profileName: plan.activeProfile.name,
        usedRoute: 'fallback',
        usedEndpoint: plan.fallback.endpoint,
        fallbackUsed: true,
        attempts
      });
    }

    throw new Error(`Primario: ${primaryAttempt.details} · Fallback: ${fallbackAttempt.details}`);
  }

  throw new Error(primaryAttempt.details || 'Errore provider non gestito.');
}

export async function testApiConnection(settings = {}, taskHint = 'general') {
  const plan = buildProviderPlan(settings, taskHint, { pingTimeoutMs: settings.pingTimeoutMs || 10000 });
  const body = {
    task: '__visit_ping',
    input: {
      page: 'admin-desktop',
      expectedTask: taskHint,
      probeMode: 'non-generative'
    }
  };

  const primaryAttempt = await postJson(plan.primary.endpoint, body, plan.pingTimeoutMs);
  if (primaryAttempt.ok) {
    return {
      ok: true,
      status: primaryAttempt.status,
      details: `Profilo ${plan.activeProfile.name}: ping ${taskHint} riuscito sul primario.`,
      taskHint,
      routeUsed: 'primary',
      endpointUsed: plan.primary.endpoint,
      fallbackAttempted: false,
      attempts: [{ route: 'primary', status: primaryAttempt.status, ok: true, details: primaryAttempt.details }]
    };
  }

  if (plan.fallback && shouldRetryWithFallback(primaryAttempt)) {
    const fallbackAttempt = await postJson(plan.fallback.endpoint, body, plan.pingTimeoutMs);
    if (fallbackAttempt.ok) {
      return {
        ok: true,
        status: fallbackAttempt.status,
        details: `Primario non disponibile per ${taskHint}; fallback raggiunto correttamente.`,
        taskHint,
        routeUsed: 'fallback',
        endpointUsed: plan.fallback.endpoint,
        fallbackAttempted: true,
        attempts: [
          { route: 'primary', status: primaryAttempt.status, ok: false, details: primaryAttempt.details },
          { route: 'fallback', status: fallbackAttempt.status, ok: true, details: fallbackAttempt.details }
        ]
      };
    }

    return {
      ok: false,
      status: fallbackAttempt.status,
      details: `Primario: ${primaryAttempt.details} · Fallback: ${fallbackAttempt.details}`,
      taskHint,
      routeUsed: 'none',
      endpointUsed: '',
      fallbackAttempted: true,
      attempts: [
        { route: 'primary', status: primaryAttempt.status, ok: false, details: primaryAttempt.details },
        { route: 'fallback', status: fallbackAttempt.status, ok: false, details: fallbackAttempt.details }
      ]
    };
  }

  return {
    ok: false,
    status: primaryAttempt.status,
    details: primaryAttempt.details || 'Endpoint non raggiungibile.',
    taskHint,
    routeUsed: 'none',
    endpointUsed: '',
    fallbackAttempted: false,
    attempts: [{ route: 'primary', status: primaryAttempt.status, ok: false, details: primaryAttempt.details }]
  };
}
