const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = 'test-chat-id';

const handler = require('../api/send-resume');
const { normalizeTelegramUsername } = require('../utils/telegram');

test('preserves the complete Telegram username from a profile link', () => {
  assert.equal(
    normalizeTelegramUsername('https://t.me/ivan_test_three.123'),
    '@ivan_test_three.123'
  );
});

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

test('returns 502 when Telegram rejects the message', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ ok: false, description: 'Forbidden: bot is not a member of the group chat' })
  });

  const req = {
    method: 'POST',
    body: {
      fullname: 'Иван Иванов',
      birthdate: '2000-01-01',
      phone: '+998901234567',
      telegram: '@ivan_test_one'
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 502);
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
      birthdate: '2000-01-01',
      phone: '+998901234567',
      telegram: '@ivan_test_two'
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
      birthdate: '2000-01-01',
      phone: '+998901234567',
      telegram: 'https://t.me/ivan_test_three.123'
    }
  };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
});
