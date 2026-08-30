(function () {
    try {
        var stored = localStorage.getItem('ft_theme');
        var theme = stored || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {
        // localStorage может быть недоступен (приватный режим и т.п.) — просто остаёмся на светлой теме
    }
})();
