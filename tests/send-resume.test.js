const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/send-resume');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('returns 500 when Telegram rejects the message', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ ok: false, description: 'Forbidden: bot is not a member of the group chat' })
  });

  const req = {
    method: 'POST',
    body: {
      fullname: 'Иван Иванов',
      phone: '+998901234567',
      telegram: '@ivan'
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /Telegram/i);
});

test('returns 200 when Telegram accepts the message', async () => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true })
  });

  const req = {
    method: 'POST',
    body: {
      fullname: 'Иван Иванов',
      phone: '+998901234567',
      telegram: '@ivan'
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
});

test('accepts Telegram username with underscore and dot', async () => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true })
  });

  const req = {
    method: 'POST',
    body: {
      fullname: 'Иван Иванов',
      phone: '+998901234567',
      telegram: 'https://t.me/ivan_ivan.123'
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
});
