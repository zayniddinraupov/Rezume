// Простое key-value хранилище со счётчиком и TTL.
// Если заданы UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN — используется
// Upstash Redis (переживает холодные старты и работает across-инстансов).
// Иначе — in-memory Map (best-effort, сбрасывается при холодном старте
// serverless-функции). Оба режима работают через один и тот же интерфейс,
// так что остальной код не знает, что именно используется.

const memoryStore = new Map();

function memoryIncrWithTtl(key, ttlMs) {
    const now = Date.now();
    const entry = memoryStore.get(key);
    if (!entry || entry.expiresAt < now) {
        memoryStore.set(key, { count: 1, expiresAt: now + ttlMs });
        return 1;
    }
    entry.count += 1;
    return entry.count;
}

function memoryGetTtlRemaining(key) {
    const entry = memoryStore.get(key);
    if (!entry) return 0;
    return Math.max(0, entry.expiresAt - Date.now());
}

function memoryCleanup() {
    const now = Date.now();
    if (memoryStore.size < 5000) return;
    for (const [k, v] of memoryStore) {
        if (v.expiresAt < now) memoryStore.delete(k);
    }
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

async function redisCommand(parts) {
    const url = `${UPSTASH_URL}/${parts.map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    if (!response.ok) throw new Error(`Upstash error ${response.status}`);
    const data = await response.json();
    return data.result;
}

// Увеличивает счётчик на 1, выставляет TTL при первом создании ключа.
// Возвращает текущее значение счётчика после инкремента.
async function incrWithTtl(key, ttlMs) {
    if (!useRedis) {
        memoryCleanup();
        return memoryIncrWithTtl(key, ttlMs);
    }
    try {
        const count = await redisCommand(['INCR', key]);
        if (count === 1) {
            await redisCommand(['PEXPIRE', key, String(ttlMs)]);
        }
        return count;
    } catch (err) {
        console.error('Redis incrWithTtl failed, falling back to memory:', err.message);
        return memoryIncrWithTtl(key, ttlMs);
    }
}

module.exports = { incrWithTtl, useRedis };
