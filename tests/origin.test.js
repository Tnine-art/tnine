const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

test('mutating browser requests reject foreign origins', async () => {
  const server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/register`, {
      method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: '{}'
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.error.code, 'INVALID_ORIGIN');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
