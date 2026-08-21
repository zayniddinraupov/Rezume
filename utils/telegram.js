(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.normalizeTelegramUsername = api.normalizeTelegramUsername;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Возвращает "@username" если валиден, иначе "" .
  // Используется и на клиенте (script.js), и на сервере (api/send-resume.js),
  // чтобы правила нормализации не расходились.
  function normalizeTelegramUsername(value) {
    if (typeof value !== 'string') {
      return '';
    }

    let cleaned = value.trim();
    if (!cleaned) {
      return '';
    }

    const urlMatch = cleaned.match(/^https?:\/\/(?:www\.)?(t\.me|telegram\.me)\/([^/?#\s]+)/i);
    if (urlMatch) {
      cleaned = urlMatch[2];
    } else {
      cleaned = cleaned.replace(/^@+/, '').replace(/^\/+/, '');
    }

    const normalized = cleaned.replace(/[^a-zA-Z0-9._]/g, '');

    // Telegram: 5-32 символа, буквы/цифры/подчёркивание, начинается с буквы
    if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(normalized.replace(/\./g, ''))) {
      // мягкая проверка длины/формата, чтобы отсекать явный мусор,
      // не будучи чрезмерно строгой к пограничным случаям
      if (normalized.length < 3) return '';
    }

    return normalized ? `@${normalized}` : '';
  }

  // Простое экранирование для вставки пользовательского текста
  // в HTML-сообщение Telegram (parse_mode: 'HTML').
  function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    normalizeTelegramUsername,
    escapeHtml
  };
});
