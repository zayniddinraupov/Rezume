(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.normalizeTelegramUsername = api.normalizeTelegramUsername;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeTelegramUsername(value) {
    if (typeof value !== 'string') {
      return '';
    }

    let cleaned = value.trim();
    if (!cleaned) {
      return '';
    }

    cleaned = cleaned.replace(/^@+/, '');
    cleaned = cleaned.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '');
    cleaned = cleaned.replace(/^\/+/, '');

    const segments = cleaned.split(/[\/\s:?&=#]+/).filter(Boolean);
    const candidate = segments.length ? segments[segments.length - 1] : cleaned;
    const normalized = candidate.replace(/[^a-zA-Z0-9._]/g, '');

    return normalized ? `@${normalized}` : '';
  }

  return {
    normalizeTelegramUsername
  };
});
