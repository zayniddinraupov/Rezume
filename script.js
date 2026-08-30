document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('resumeForm');
    const phoneInput = document.getElementById('phone');
    const birthInput = document.getElementById('birthdate');
    const telegramInput = document.getElementById('telegram');
    const skillInput = document.getElementById('skillInput');

    // ---------- Cloudflare Turnstile (явный рендер) ----------
    // api.js подключён с defer (без async) и ?render=explicit, поэтому
    // к моменту DOMContentLoaded глобальный объект `turnstile` уже
    // гарантированно готов — рендерим виджет сами и сохраняем его
    // настоящий widgetId (а не DOM-id контейнера) для дальнейших вызовов.
    let turnstileWidgetId = null;
    const turnstileContainer = document.getElementById('turnstileWidget');
    if (typeof turnstile !== 'undefined' && turnstileContainer) {
        try {
            turnstileWidgetId = turnstile.render(turnstileContainer, {
                sitekey: turnstileContainer.dataset.sitekey,
                theme: 'auto',
                language: 'ru',
                size: 'flexible'
            });
        } catch (err) {
            console.error('Turnstile render failed:', err);
        }
    }

    // ---------- Модалка "Подробнее о вакансии" ----------
    const vacancyBtn = document.getElementById('vacancyBtn');
    const vacancyModalOverlay = document.getElementById('vacancyModalOverlay');
    const vacancyModalClose = document.getElementById('vacancyModalClose');
    const vacancyModalCta = document.getElementById('vacancyModalCta');

    function openVacancyModal() {
        vacancyModalOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        vacancyModalClose.focus();
    }

    function closeVacancyModal() {
        vacancyModalOverlay.classList.add('hidden');
        document.body.style.overflow = '';
        vacancyBtn.focus();
    }

    vacancyBtn?.addEventListener('click', openVacancyModal);
    vacancyModalClose?.addEventListener('click', closeVacancyModal);
    vacancyModalOverlay?.addEventListener('click', (e) => {
        if (e.target === vacancyModalOverlay) closeVacancyModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !vacancyModalOverlay.classList.contains('hidden')) closeVacancyModal();
    });
    vacancyModalCta?.addEventListener('click', () => {
        closeVacancyModal();
        document.getElementById('formWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Показываем информацию о вакансии первым делом при заходе на страницу.
    // sessionStorage — чтобы при повторной отправке анкеты в этой же вкладке
    // окно не выскакивало заново поверх экрана благодарности.
    try {
        if (!sessionStorage.getItem('ft_vacancy_seen')) {
            openVacancyModal();
            sessionStorage.setItem('ft_vacancy_seen', '1');
        }
    } catch (e) {
        // sessionStorage недоступен (приватный режим) — просто открываем один раз
        openVacancyModal();
    }

    // ---------- Тёмная/светлая тема ----------
    const themeToggle = document.getElementById('themeToggle');
    function applyThemeIcon(theme) {
        themeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
    applyThemeIcon(document.documentElement.getAttribute('data-theme') || 'light');

    themeToggle?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('ft_theme', next); } catch (e) { /* localStorage недоступен - просто не сохраняем */ }
        applyThemeIcon(next);
    });

    // ---------- Возрастные ограничения календаря 18-35 лет ----------
    const today = new Date();
    birthInput.max = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()).toISOString().split("T")[0];
    birthInput.min = new Date(today.getFullYear() - 35, today.getMonth(), today.getDate()).toISOString().split("T")[0];

    // ---------- Телефон: только цифры и + ----------
    phoneInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/[^\d+]/g, '');
        if (value.length > 13) value = value.substring(0, 13);
        e.target.value = value;
    });

    // ---------- Telegram username ----------
    if (telegramInput) {
        telegramInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9._]/g, '');
        });

        telegramInput.addEventListener('blur', () => {
            const normalized = normalizeTelegramUsername(telegramInput.value);
            telegramInput.classList.remove('input-valid', 'input-invalid');
            if (normalized) {
                telegramInput.value = normalized;
                telegramInput.classList.add('input-valid');
            } else if (telegramInput.value.length > 0) {
                telegramInput.classList.add('input-invalid');
            }
        });
    }

    // ---------- Счётчики символов ----------
    document.querySelectorAll('[data-counter]').forEach(field => {
        const counter = document.getElementById(field.dataset.counter);
        const max = parseInt(field.getAttribute('maxlength'), 10);
        const update = () => {
            counter.textContent = `${field.value.length} / ${max}`;
            counter.classList.toggle('near-limit', field.value.length > max * 0.9);
        };
        field.addEventListener('input', update);
        update();
    });

    // ---------- Инлайн-ошибки под полями ----------
    function setFieldError(fieldName, message) {
        const errorEl = document.getElementById(`err-${fieldName}`);
        const inputEl = document.getElementById(fieldName);
        if (errorEl) errorEl.textContent = message || '';
        if (inputEl) {
            inputEl.setAttribute('aria-invalid', message ? 'true' : 'false');
            inputEl.classList.toggle('input-invalid', Boolean(message));
        }
    }

    function clearAllFieldErrors() {
        document.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; });
    }

    // ---------- Прогресс-бар ----------
    function updateProgress() {
        const requiredInputs = form.querySelectorAll('input[required]');
        let filled = 0;
        requiredInputs.forEach(input => { if (input.value.trim()) filled++; });
        const percent = Math.round((filled / requiredInputs.length) * 100);
        document.getElementById('progressFill').style.width = percent + '%';
        document.getElementById('progressLabel').textContent = percent + '%';
    }

    form.querySelectorAll('input, textarea, select').forEach(el => {
        el.addEventListener('input', updateProgress);
    });

    // ---------- Языки: показать/скрыть уровень ----------
    document.querySelectorAll('[data-toggle-lang]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const lang = checkbox.getAttribute('data-toggle-lang');
            const levelDiv = document.getElementById(`level-${lang}`);
            if (levelDiv) levelDiv.classList.toggle('hidden', !checkbox.checked);
        });
    });

    const otherLang = document.getElementById('otherLang');
    const otherLangField = document.getElementById('otherLangField');
    if (otherLang && otherLangField) {
        otherLang.addEventListener('change', () => {
            otherLangField.classList.toggle('hidden', !otherLang.checked);
        });
    }

    // ---------- Навыки-теги ----------
    let skills = [];

    function renderSkills() {
        const container = document.getElementById('skillsContainer');
        container.innerHTML = '';
        skills.forEach(skill => {
            const tag = document.createElement('span');
            tag.className = 'skill-tag';

            const text = document.createElement('span');
            text.textContent = skill;
            tag.appendChild(text);

            const removeIcon = document.createElement('i');
            removeIcon.className = 'fas fa-times';
            removeIcon.addEventListener('click', () => {
                skills = skills.filter(s => s !== skill);
                renderSkills();
            });
            tag.appendChild(removeIcon);

            container.appendChild(tag);
        });
    }

    if (skillInput) {
        skillInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const skill = skillInput.value.trim();
                if (skill && !skills.includes(skill) && skills.length < 30) {
                    skills.push(skill);
                    renderSkills();
                }
                skillInput.value = '';
            }
        });
    }

    // ---------- Drag-and-drop загрузка файла ----------
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const dropzoneContent = document.getElementById('dropzoneContent');
    const dropzoneFile = document.getElementById('dropzoneFile');
    const fileNameEl = document.getElementById('fileName');
    const fileSizeEl = document.getElementById('fileSize');
    const removeFileBtn = document.getElementById('removeFileBtn');

    const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 МБ
    const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
    let selectedFile = null; // { name, type, size, base64 }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' Б';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' КБ';
        return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result || '';
                const base64 = String(result).split(',')[1] || '';
                resolve(base64);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    async function handleFile(file) {
        setFieldError('file', '');
        dropzone.classList.remove('dropzone-invalid');

        if (!file) return;

        if (!ALLOWED_FILE_TYPES.includes(file.type)) {
            setFieldError('file', 'Допустимы только PDF, JPG или PNG');
            dropzone.classList.add('dropzone-invalid');
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            setFieldError('file', 'Файл слишком большой — максимум 3 МБ');
            dropzone.classList.add('dropzone-invalid');
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            selectedFile = { name: file.name, type: file.type, size: file.size, base64 };
            fileNameEl.textContent = file.name;
            fileSizeEl.textContent = formatFileSize(file.size);
            dropzoneContent.classList.add('hidden');
            dropzoneFile.classList.remove('hidden');
            updateSectionNav();
        } catch (err) {
            console.error(err);
            setFieldError('file', 'Не удалось прочитать файл. Попробуйте ещё раз');
        }
    }

    function clearFile() {
        selectedFile = null;
        fileInput.value = '';
        dropzoneContent.classList.remove('hidden');
        dropzoneFile.classList.add('hidden');
        setFieldError('file', '');
        dropzone.classList.remove('dropzone-invalid');
        updateSectionNav();
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
        });

        ['dragenter', 'dragover'].forEach(evt => {
            dropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(evt => {
            dropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const file = e.dataTransfer?.files?.[0];
            if (file) handleFile(file);
        });

        removeFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearFile();
        });
    }

    // ---------- Секции: анимация появления + навигация ----------
    const sections = Array.from(document.querySelectorAll('.form-section'));
    const nav = document.getElementById('sectionNav');

    sections.forEach(section => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.target = section.id;

        const tip = document.createElement('span');
        tip.className = 'nav-tip';
        tip.textContent = section.dataset.title || '';
        btn.appendChild(tip);

        btn.addEventListener('click', () => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        nav.appendChild(btn);
    });

    const navButtons = Array.from(nav.querySelectorAll('button'));

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
            }
        });
    }, { threshold: 0.12 });

    const activeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const btn = navButtons.find(b => b.dataset.target === entry.target.id);
            if (!btn) return;
            if (entry.isIntersecting) {
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
        });
    }, { rootMargin: '-45% 0px -45% 0px' });

    sections.forEach(section => {
        revealObserver.observe(section);
        activeObserver.observe(section);
    });

    // Секция считается заполненной: если в ней есть обязательные поля —
    // когда все они заполнены; если обязательных нет — когда хотя бы
    // одно поле в секции содержит значение (пользователь её "затронул").
    function isSectionComplete(section) {
        const requiredFields = Array.from(section.querySelectorAll('input[required]'));
        if (requiredFields.length) {
            return requiredFields.every(f => f.value.trim().length > 0);
        }
        const fields = Array.from(section.querySelectorAll('input, textarea, select'));
        return fields.some(f => {
            if (f.type === 'checkbox' || f.type === 'radio') return f.checked;
            if (f.type === 'file') return f.files && f.files.length > 0;
            return f.value && f.value.trim().length > 0;
        });
    }

    function updateSectionNav() {
        sections.forEach(section => {
            const btn = navButtons.find(b => b.dataset.target === section.id);
            if (btn) btn.classList.toggle('complete', isSectionComplete(section));
        });
    }

    form.querySelectorAll('input, textarea, select').forEach(el => {
        el.addEventListener('input', updateSectionNav);
        el.addEventListener('change', updateSectionNav);
    });
    updateSectionNav();

    // ---------- Отправка формы ----------
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        clearAllFieldErrors();
        const btn = document.getElementById('submitBtn');
        const loader = document.getElementById('loader');

        const formData = new FormData(form);

        // Honeypot: если заполнено ботом - тихо "успех", запрос не шлём
        if ((formData.get('company_site') || '').trim()) {
            showThankYou();
            form.reset();
            return;
        }

        let languagesList = [];
        if (document.querySelector('input[name="languages"][value="Русский"]')?.checked) {
            const level = document.querySelector('input[name="level_russian"]:checked');
            languagesList.push('Русский' + (level ? ` (${level.value})` : ''));
        }
        if (document.querySelector('input[name="languages"][value="Узбекский"]')?.checked) {
            const level = document.querySelector('input[name="level_uzbek"]:checked');
            languagesList.push('Узбекский' + (level ? ` (${level.value})` : ''));
        }
        if (document.querySelector('input[name="languages"][value="Английский"]')?.checked) {
            const level = document.querySelector('input[name="level_english"]:checked');
            languagesList.push('Английский' + (level ? ` (${level.value})` : ''));
        }
        if (document.querySelector('input[name="languages"][value="Другие"]')?.checked) {
            const other = formData.get('other_languages');
            if (other) languagesList.push(other);
        }

        let hasError = false;

        const telegramValue = formData.get('telegram') || '';
        const normalizedTelegram = normalizeTelegramUsername(telegramValue);
        if (!normalizedTelegram) {
            setFieldError('telegram', 'Введите корректный Telegram-username без ссылок и лишних символов');
            hasError = true;
        }

        const fullname = (formData.get('fullname') || '').trim();
        if (!fullname) {
            setFieldError('fullname', 'Пожалуйста, введите ФИО');
            hasError = true;
        }

        const birthdateValue = formData.get('birthdate');
        if (!birthdateValue) {
            setFieldError('birthdate', 'Укажите дату рождения');
            hasError = true;
        }

        const phoneValue = (formData.get('phone') || '').trim();
        if (!phoneValue || !/^\+?\d{7,15}$/.test(phoneValue)) {
            setFieldError('phone', 'Введите корректный номер телефона');
            hasError = true;
        }

        const turnstileToken = (typeof turnstile !== 'undefined' && turnstileWidgetId !== null)
            ? turnstile.getResponse(turnstileWidgetId)
            : formData.get('cf-turnstile-response');

        if (!turnstileToken) {
            setFieldError('turnstile', 'Подтвердите, что вы не робот');
            hasError = true;
        }

        if (hasError) {
            const firstError = form.querySelector('.field-error:not(:empty)');
            if (firstError) firstError.closest('.form-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const data = {
            fullname,
            birthdate: formData.get('birthdate'),
            gender: formData.get('gender'),
            phone: formData.get('phone'),
            city: formData.get('city'),
            citizenship: formData.get('citizenship'),
            marital: formData.get('marital'),
            salary: formData.get('salary'),
            work_schedule: formData.get('work_schedule'),
            telegram: normalizedTelegram,
            education_level: formData.get('education_level'),
            education_details: formData.get('education_details'),
            experience: formData.get('experience'),
            courses: formData.get('courses'),
            skills: skills.join(', '),
            languages: languagesList.join(', '),
            army: formData.get('army'),
            personal_qualities: formData.get('personal_qualities'),
            professional_skills: formData.get('professional_skills'),
            about: formData.get('about'),
            company_site: formData.get('company_site') || '',
            file: selectedFile ? { name: selectedFile.name, type: selectedFile.type, base64: selectedFile.base64 } : null,
            turnstileToken
        };

        telegramInput.value = normalizedTelegram;
        btn.disabled = true;
        loader.style.display = 'inline-block';
        const formWrap = document.getElementById('formWrap');
        const submitOverlay = document.getElementById('submitOverlay');
        formWrap.classList.add('is-submitting');
        submitOverlay.classList.remove('hidden');

        try {
            const response = await fetch('/api/send-resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json().catch(() => null);

            if (response.ok) {
                if (result?.fileWarning) {
                    showToast('✅ Анкета отправлена. Файл прикрепить не удалось — отправьте его отдельно в Telegram.', true);
                }
                showThankYou();
                form.reset();
                document.querySelectorAll('.lang-level').forEach(el => el.classList.add('hidden'));
                otherLangField.classList.add('hidden');
                skills = [];
                renderSkills();
                clearFile();
                document.getElementById('progressFill').style.width = '0%';
                document.getElementById('progressLabel').textContent = '0%';
                document.querySelectorAll('[data-counter]').forEach(f => f.dispatchEvent(new Event('input')));
            } else if (response.status === 400 && result?.field) {
                setFieldError(result.field, result.error);
                document.getElementById(result.field)?.closest('.form-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                showToast('❌ ' + (result?.error || 'Ошибка сервера'), false);
            }
        } catch (err) {
            console.error(err);
            showToast('❌ Ошибка соединения. Проверьте подключение.', false);
        } finally {
            btn.disabled = false;
            loader.style.display = 'none';
            formWrap.classList.remove('is-submitting');
            submitOverlay.classList.add('hidden');
            if (typeof turnstile !== 'undefined' && turnstileWidgetId !== null) turnstile.reset(turnstileWidgetId);
        }
    });

    function showToast(message, success = true) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden', 'toast-error');
        if (!success) toast.classList.add('toast-error');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => toast.classList.add('hidden'), 3500);
    }

    // ---------- Экран благодарности (crossfade) ----------
    function showThankYou() {
        const formWrap = document.getElementById('formWrap');
        const thankYou = document.getElementById('thankYou');
        const hero = document.querySelector('.hero');

        formWrap.classList.add('fade-out');
        hero?.classList.add('fade-out');

        setTimeout(() => {
            formWrap.classList.add('hidden');
            hero?.classList.add('hidden');
            formWrap.classList.remove('fade-out');
            hero?.classList.remove('fade-out');

            thankYou.classList.remove('hidden');
            thankYou.classList.add('fade-in');
            thankYou.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => thankYou.classList.remove('fade-in'), 450);
        }, 300);
    }

    function hideThankYou() {
        const formWrap = document.getElementById('formWrap');
        const thankYou = document.getElementById('thankYou');
        const hero = document.querySelector('.hero');

        thankYou.classList.add('fade-out');

        setTimeout(() => {
            thankYou.classList.add('hidden');
            thankYou.classList.remove('fade-out');

            hero?.classList.remove('hidden');
            formWrap.classList.remove('hidden');
            formWrap.classList.add('fade-in');
            setTimeout(() => formWrap.classList.remove('fade-in'), 450);
            formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }

    document.getElementById('sendAnotherBtn')?.addEventListener('click', hideThankYou);
});
