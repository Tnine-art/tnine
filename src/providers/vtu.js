const { config } = require('../config');
const { ApiError } = require('../lib/http');

class MockVtuProvider {
  async purchase({ reference }) { return { successful: true, providerReference: `mock_${reference}` }; }
  async queryStatus({ reference }) { return { successful: true, providerReference: `mock_${reference}` }; }
}

class VtpassProvider {
  async purchase({ reference, network, phone, amountKobo, planCode, kind }) {
    const serviceID = kind === 'DATA' ? network.toLowerCase() + '-data' : network.toLowerCase();
    const payload = { request_id: reference, serviceID, billersCode: phone, phone };
    if (kind === 'DATA') payload.variation_code = planCode;
    else payload.amount = amountKobo / 100;
    const response = await fetch(`${config.vtpassBaseUrl}/pay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': config.vtpassApiKey, 'public-key': config.vtpassPublicKey }, body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok) throw new ApiError(502, 'VTU_PROVIDER_ERROR', 'The service provider is temporarily unavailable.');
    const code = String(body.code || body.response_description || '');
    return { successful: code === '000' || code === '0000', pending: code === '099', providerReference: body.requestId || reference, rawCode: code };
  }

  async queryStatus({ reference }) {
    const response = await fetch(`${config.vtpassBaseUrl}/requery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': config.vtpassApiKey, 'public-key': config.vtpassPublicKey },
      body: JSON.stringify({ request_id: reference })
    });
    const body = await response.json();
    if (!response.ok) throw new ApiError(502, 'VTU_PROVIDER_ERROR', 'Could not query the provider transaction.');
    const code = String(body.code || body.response_description || '');
    return {
      successful: code === '000' || code === '0000',
      pending: code === '099' || code === '0990',
      failed: ['016', '018', '040'].includes(code),
      providerReference: body.requestId || reference,
      rawCode: code
    };
  }
}

function vtuProvider() {
  if (config.vtuProvider === 'vtpass') {
    if (!config.vtpassApiKey || !config.vtpassPublicKey) throw new Error('VTpass credentials are required.');
    return new VtpassProvider();
  }
  return new MockVtuProvider();
}
module.exports = { vtuProvider };
