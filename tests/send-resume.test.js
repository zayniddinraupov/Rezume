const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = 'test-chat-id';
delete process.env.TELEGRAM_GROUP_LINK;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.VERCEL_ENV;
delete process.env.NODE_ENV;
delete process.env.ADMIN_DEBUG_KEY;

const handler = require('../api/send-resume');
const getChatId = require('../api/get-chat-id');
const { normalizeTelegramUsername } = require('../utils/telegram');

// ---------- helpers ----------
let counter = 0;
function uniq() {
  counter += 1;
  return counter;
}

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

// Уникальный IP и Telegram на каждый тест — лимиты и защита от дублей
// хранятся в памяти процесса и иначе влияли бы друг на друга.
function makeReq(overrides = {}, ip) {
  const n = uniq();
  return {
    method: 'POST',
    headers: { 'x-forwarded-for': ip || `10.0.0.${n}` },
    body: {
      fullname: 'Иван Иванов',
      birthdate: '2000-01-01',
      phone: '+998901234567',
      telegram: `@ivan_test_${n}`,
      consent: true,
      ...overrides
    }
  };
}

function mockTelegram({ ok = true, calls = [] } = {}) {
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok,
      status: ok ? 200 : 400,
      json: async () => (ok
        ? { ok: true }
        : { ok: false, description: 'Forbidden: bot is not a member of the group chat' })
    };
  };
  return calls;
}

const PDF_BASE64 = Buffer.from('%PDF-1.4\n%test\n').toString('base64');

// ---------- базовое поведение ----------
test('preserves the complete Telegram username from a profile link', () => {
  assert.equal(
    normalizeTelegramUsername('https://t.me/ivan_test_three.123'),
    '@ivan_test_three.123'
  );
});

test('does not truncate usernames that contain underscores or dots', () => {
  assert.equal(normalizeTelegramUsername('@ivan_petrov'), '@ivan_petrov');
  assert.equal(normalizeTelegramUsername('ivan_petrov'), '@ivan_petrov');
  assert.equal(normalizeTelegramUsername('https://t.me/anna_k_2020'), '@anna_k_2020');
  assert.equal(normalizeTelegramUsername('t.me/name_x?start=1'), '@name_x');
  assert.equal(normalizeTelegramUsername('@john.smith'), '@john.smith');
});

test('rejects obviously invalid usernames', () => {
  assert.equal(normalizeTelegramUsername(''), '');
  assert.equal(normalizeTelegramUsername('@ab'), '');
  assert.equal(normalizeTelegramUsername('12345'), '');
  assert.equal(normalizeTelegramUsername('@ivan petrov'), '');
  assert.equal(normalizeTelegramUsername(null), '');
});

test('returns 502 with a generic message when Telegram rejects the message', async () => {
  mockTelegram({ ok: false });
  const res = createRes();

  await handler(makeReq(), res);

  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /Telegram/i);
  // внутренние детали Telegram клиенту не отдаём
  assert.doesNotMatch(res.body.error, /not a member/i);
});

test('returns 200 when Telegram accepts the message', async () => {
  mockTelegram();
  const res = createRes();

  await handler(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.fileWarning, false);
});

test('accepts Telegram username with underscore and dot', async () => {
  mockTelegram();
  const res = createRes();

  await handler(makeReq({ telegram: 'https://t.me/ivan_test_three.123' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('GET does not reveal internal endpoints', async () => {
  const res = createRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(JSON.stringify(res.body), /chat-id/i);
});

// ---------- согласие ----------
test('rejects submissions without consent', async () => {
  mockTelegram();
  const res = createRes();

  await handler(makeReq({ consent: false }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.field, 'consent');
});

// ---------- график работы ----------
test('accepts the new shift values and rejects old ones', async () => {
  mockTelegram();

  for (const shift of ['07:00 – 16:00', '18:00 – 03:00', '20:00 – 08:00']) {
    const res = createRes();
    await handler(makeReq({ work_schedule: shift }), res);
    assert.equal(res.statusCode, 200, shift);
  }

  const res = createRes();
  await handler(makeReq({ work_schedule: 'Сменный график' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.field, 'work_schedule');
});

// ---------- защита от дублей ----------
test('a failed Telegram delivery does not block the retry', async () => {
  const telegram = '@retry_candidate_1';

  mockTelegram({ ok: false });
  const first = createRes();
  await handler(makeReq({ telegram }), first);
  assert.equal(first.statusCode, 502);

  mockTelegram({ ok: true });
  const second = createRes();
  await handler(makeReq({ telegram }), second);
  assert.equal(second.statusCode, 200);
});

test('a second submission after success is blocked as a duplicate', async () => {
  const telegram = '@dup_candidate_1';
  mockTelegram();

  const first = createRes();
  await handler(makeReq({ telegram }), first);
  assert.equal(first.statusCode, 200);

  const second = createRes();
  await handler(makeReq({ telegram }), second);
  assert.equal(second.statusCode, 429);
});

test('rate limit by IP kicks in after 5 attempts', async () => {
  mockTelegram();
  const ip = '192.0.2.77';
  const codes = [];
  for (let i = 0; i < 7; i += 1) {
    const res = createRes();
    await handler(makeReq({}, ip), res);
    codes.push(res.statusCode);
  }
  assert.deepEqual(codes.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.equal(codes[5], 429);
});

// ---------- файл ----------
test('rejects a file whose content does not match its declared type', async () => {
  mockTelegram();
  const res = createRes();
  const fakePdf = Buffer.from('MZ this is not a pdf').toString('base64');

  await handler(makeReq({ file: { name: 'cv.pdf', type: 'application/pdf', base64: fakePdf } }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.field, 'file');
});

test('rejects malformed base64 and oversized payloads', async () => {
  mockTelegram();

  const bad = createRes();
  await handler(makeReq({ file: { name: 'cv.pdf', type: 'application/pdf', base64: '!!!not base64!!!' } }), bad);
  assert.equal(bad.statusCode, 400);

  const big = createRes();
  await handler(makeReq({ file: { name: 'cv.pdf', type: 'application/pdf', base64: 'A'.repeat(5 * 1024 * 1024) } }), big);
  assert.equal(big.statusCode, 400);
});

test('sends a valid PDF with a sanitized filename and correct extension', async () => {
  const calls = mockTelegram();
  const res = createRes();

  await handler(makeReq({
    file: { name: '../../etc/pass<wd>.exe', type: 'application/pdf', base64: PDF_BASE64 }
  }), res);

  assert.equal(res.statusCode, 200);
  const doc = calls.find(c => c.url.endsWith('/sendDocument'));
  assert.ok(doc, 'sendDocument was called');
  const sentName = doc.init.body.get('document').name;
  assert.match(sentName, /^[\p{L}\p{N} _-]+\.pdf$/u);
  assert.doesNotMatch(sentName, /[\\/<>]/);
});

// ---------- ссылка на группу ----------
test('does not attach a group button when TELEGRAM_GROUP_LINK is not set', async () => {
  const calls = mockTelegram();
  await handler(makeReq(), createRes());

  const msg = calls.find(c => c.url.endsWith('/sendMessage'));
  assert.equal(JSON.parse(msg.init.body).reply_markup, undefined);
});

test('attaches the group button from the environment only', async () => {
  process.env.TELEGRAM_GROUP_LINK = 'https://t.me/+example-from-env';
  try {
    const calls = mockTelegram();
    await handler(makeReq(), createRes());

    const msg = calls.find(c => c.url.endsWith('/sendMessage'));
    const markup = JSON.parse(msg.init.body).reply_markup;
    assert.equal(markup.inline_keyboard[0][0].url, 'https://t.me/+example-from-env');
  } finally {
    delete process.env.TELEGRAM_GROUP_LINK;
  }
});

// ---------- Turnstile ----------
test('blocks submissions in production when TURNSTILE_SECRET_KEY is missing', async () => {
  process.env.VERCEL_ENV = 'production';
  try {
    mockTelegram();
    const res = createRes();
    await handler(makeReq(), res);
    assert.equal(res.statusCode, 500);
  } finally {
    delete process.env.VERCEL_ENV;
  }
});

// ---------- get-chat-id ----------
function adminReq(key, ip) {
  return {
    method: 'GET',
    headers: { ...(key ? { 'x-admin-key': key } : {}), 'x-forwarded-for': ip || `172.16.0.${uniq()}` }
  };
}

test('get-chat-id is disabled (404) when ADMIN_DEBUG_KEY is not set', async () => {
  const res = createRes();
  await getChatId(adminReq(), res);
  assert.equal(res.statusCode, 404);
});

test('get-chat-id rejects a wrong or missing key and accepts the right one', async () => {
  process.env.ADMIN_DEBUG_KEY = 'secret-admin-key';
  try {
    const missing = createRes();
    await getChatId(adminReq(), missing);
    assert.equal(missing.statusCode, 403);

    const wrong = createRes();
    await getChatId(adminReq('nope'), wrong);
    assert.equal(wrong.statusCode, 403);

    global.fetch = async () => ({
      ok: true,
      json: async () => ({ ok: true, result: [{ message: { chat: { id: -100123 } } }] })
    });
    const good = createRes();
    await getChatId(adminReq('secret-admin-key'), good);
    assert.equal(good.statusCode, 200);
    assert.deepEqual(good.body.chatIds, [-100123]);
  } finally {
    delete process.env.ADMIN_DEBUG_KEY;
  }
});

test('get-chat-id limits brute-force attempts', async () => {
  process.env.ADMIN_DEBUG_KEY = 'secret-admin-key';
  try {
    const ip = '203.0.113.9';
    let last;
    for (let i = 0; i < 12; i += 1) {
      last = createRes();
      await getChatId(adminReq('wrong', ip), last);
    }
    assert.equal(last.statusCode, 429);
  } finally {
    delete process.env.ADMIN_DEBUG_KEY;
  }
});
