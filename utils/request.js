// Определение IP клиента для rate-limit.
// На Vercel заголовок x-vercel-forwarded-for выставляет сама платформа,
// клиент подделать его не может — поэтому он в приоритете.
// В x-forwarded-for клиент может сам дописать любые значения слева, а
// доверенный прокси добавляет настоящий адрес справа, поэтому берём
// ПОСЛЕДНЕЕ значение, а не первое.
function firstOf(value) {
    return typeof value === 'string' && value.trim() ? value.split(',')[0].trim() : '';
}

function lastOf(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const parts = value.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

function getClientIp(req) {
    const headers = (req && req.headers) || {};
    return (
        firstOf(headers['x-vercel-forwarded-for']) ||
        firstOf(headers['x-real-ip']) ||
        lastOf(headers['x-forwarded-for']) ||
        req?.socket?.remoteAddress ||
        'unknown'
    );
}

module.exports = { getClientIp };
