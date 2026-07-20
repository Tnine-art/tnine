const { config } = require('../config');

const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_REQUEST_ATTEMPTS = 2;
const DATA_SERVICES = [
  { serviceId: 'mtn-data', type: 'data', label: 'MTN' },
  { serviceId: 'airtel-data', type: 'data', label: 'Airtel' },
  { serviceId: 'glo-data', type: 'data', label: 'Glo' },
  { serviceId: 'etisalat-data', type: 'data', label: '9mobile' },
  { serviceId: 'spectranet', type: 'data', label: 'Spectranet' }
];
const DEFAULT_TV_SERVICES = [
  { serviceId: 'dstv', type: 'tv', label: 'DStv' },
  { serviceId: 'gotv', type: 'tv', label: 'GOtv' },
  { serviceId: 'startimes', type: 'tv', label: 'StarTimes' },
  { serviceId: 'showmax', type: 'tv', label: 'Showmax' }
];
const TV_LABELS = new Map(DEFAULT_TV_SERVICES.map(service => [service.serviceId, service.label]));

// These options keep local/demo development usable when the provider catalog is unavailable.
// Live mode never uses them.
const SANDBOX_DATA_PLANS = [
  { code: 'mtn-data:mtn-1gb-30d', variationCode: 'mtn-1gb-30d', serviceId: 'mtn-data', network: 'MTN', name: '1GB · 30 days', amountKobo: 50000 },
  { code: 'airtel-data:airtel-2gb-30d', variationCode: 'airtel-2gb-30d', serviceId: 'airtel-data', network: 'Airtel', name: '2GB · 30 days', amountKobo: 100000 },
  { code: 'glo-data:glo-5gb-30d', variationCode: 'glo-5gb-30d', serviceId: 'glo-data', network: 'Glo', name: '5GB · 30 days', amountKobo: 200000 },
  { code: 'etisalat-data:9mobile-1_5gb-30d', variationCode: '9mobile-1_5gb-30d', serviceId: 'etisalat-data', network: '9mobile', name: '1.5GB · 30 days', amountKobo: 120000 },
  { code: 'spectranet:vt-1000', variationCode: 'vt-1000', serviceId: 'spectranet', network: 'Spectranet', name: 'Spectranet ₦1,000 voucher', amountKobo: 100000 }
];
const SANDBOX_TV_PLANS = [
  { code: 'dstv:dstv-padi', variationCode: 'dstv-padi', serviceId: 'dstv', provider: 'DStv', name: 'DStv Padi', amountKobo: 440000 },
  { code: 'dstv:dstv-yanga', variationCode: 'dstv-yanga', serviceId: 'dstv', provider: 'DStv', name: 'DStv Yanga', amountKobo: 600000 },
  { code: 'gotv:gotv-jinja', variationCode: 'gotv-jinja', serviceId: 'gotv', provider: 'GOtv', name: 'GOtv Jinja', amountKobo: 390000 },
  { code: 'gotv:gotv-jolli', variationCode: 'gotv-jolli', serviceId: 'gotv', provider: 'GOtv', name: 'GOtv Jolli', amountKobo: 580000 },
  { code: 'startimes:startimes-basic', variationCode: 'startimes-basic', serviceId: 'startimes', provider: 'StarTimes', name: 'StarTimes Basic', amountKobo: 330000 },
  { code: 'startimes:startimes-classic', variationCode: 'startimes-classic', serviceId: 'startimes', provider: 'StarTimes', name: 'StarTimes Classic', amountKobo: 500000 },
  { code: 'showmax:mobile_only_1', variationCode: 'mobile_only_1', serviceId: 'showmax', provider: 'Showmax', name: 'Showmax Mobile Only · 1 month', amountKobo: 160000, customerReferenceType: 'phone' }
];

let cache;

function normalizeVariations(service, body) {
  const variations = body?.content?.variations || body?.content?.varations;
  if (!Array.isArray(variations)) return [];
  return variations.flatMap(variation => {
    const variationCode = String(variation.variation_code || '').trim();
    const amount = Number(variation.variation_amount);
    const name = String(variation.name || '').trim();
    if (!variationCode || !name || !Number.isFinite(amount) || amount <= 0) return [];
    const common = {
      code: `${service.serviceId}:${variationCode}`,
      variationCode,
      serviceId: service.serviceId,
      name,
      amountKobo: Math.round(amount * 100)
    };
    return [service.type === 'data'
      ? { ...common, network: service.label }
      : { ...common, provider: service.label, customerReferenceType: service.serviceId === 'showmax' ? 'phone' : 'smartcard' }];
  });
}

async function discoverTvServices() {
  const url = new URL(`${config.vtpassBaseUrl}/services`);
  url.searchParams.set('identifier', 'tv-subscription');
  const body = await fetchProviderJson(url, 'VTpass service directory');
  if (!Array.isArray(body.content) || !body.content.length) throw new Error('VTpass returned no TV services.');
  return body.content.flatMap(item => {
    const serviceId = String(item.serviceID || '').trim();
    if (!serviceId) return [];
    const label = TV_LABELS.get(serviceId) || String(item.name || serviceId).replace(/\s+(subscription|payment)$/i, '').trim();
    return [{ serviceId, type: 'tv', label }];
  });
}

async function fetchProviderJson(url, description) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`${description} returned HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_REQUEST_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw lastError;
}

async function fetchService(service) {
  const headers = {};
  if (config.vtpassApiKey) headers['api-key'] = config.vtpassApiKey;
  if (config.vtpassPublicKey) headers['public-key'] = config.vtpassPublicKey;
  const url = new URL(`${config.vtpassBaseUrl}/service-variations`);
  url.searchParams.set('serviceID', service.serviceId);
  let lastError;
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`VTpass catalog returned HTTP ${response.status}.`);
      const plans = normalizeVariations(service, await response.json());
      if (!plans.length) throw new Error(`VTpass returned no ${service.serviceId} variations.`);
      return plans;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_REQUEST_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw lastError;
}

async function getServiceCatalog({ forceRefresh = false } = {}) {
  if (!forceRefresh && cache && cache.expiresAt > Date.now()) return cache.value;
  let tvServices;
  let directoryAvailable = true;
  try { tvServices = await discoverTvServices(); }
  catch (_error) { tvServices = DEFAULT_TV_SERVICES; directoryAvailable = false; }
  const services = [...DATA_SERVICES, ...tvServices];
  const results = await Promise.allSettled(services.map(fetchService));
  const livePlans = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const plans = livePlans.filter(plan => 'network' in plan);
  const tvPlans = livePlans.filter(plan => 'provider' in plan);
  const complete = directoryAvailable && results.every(result => result.status === 'fulfilled') && plans.length && tvPlans.length;

  if (!complete && config.liveMode) {
    if (cache?.value?.source === 'vtpass') return { ...cache.value, stale: true };
    throw new Error('The live provider package catalog is temporarily unavailable.');
  }

  const value = {
    source: complete ? 'vtpass' : 'sandbox-fallback',
    stale: false,
    refreshedAt: new Date().toISOString(),
    plans: [...(plans.length ? plans : SANDBOX_DATA_PLANS)].sort((a, b) => a.amountKobo - b.amountKobo || a.name.localeCompare(b.name)),
    tvPlans: [...(tvPlans.length ? tvPlans : SANDBOX_TV_PLANS)].sort((a, b) => a.provider.localeCompare(b.provider) || a.amountKobo - b.amountKobo)
  };
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

module.exports = { getServiceCatalog, normalizeVariations, SANDBOX_DATA_PLANS, SANDBOX_TV_PLANS };
