function initResumeForm() {
    const form = document.getElementById('resumeForm');
    const phoneInput = document.getElementById('phone');
    const birthInput = document.getElementById('birthdate');
    const telegramInput = document.getElementById('telegram');
    const skillInput = document.getElementById('skillInput');

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
            company_site: formData.get('company_site') || ''
        };

        telegramInput.value = normalizedTelegram;
        btn.disabled = true;
        loader.style.display = 'inline-block';

        try {
            const response = await fetch('/api/send-resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json().catch(() => null);

            if (response.ok) {
                showThankYou();
                form.reset();
                document.querySelectorAll('.lang-level').forEach(el => el.classList.add('hidden'));
                otherLangField.classList.add('hidden');
                skills = [];
                renderSkills();
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

    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.add('in-view');
    });

    // ---------- Экран благодарности ----------
    function showThankYou() {
        form.classList.add('hidden');
        document.querySelector('.hero')?.classList.add('hidden');
        document.getElementById('thankYou').classList.remove('hidden');
        document.getElementById('thankYou').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function hideThankYou() {
        document.getElementById('thankYou').classList.add('hidden');
        document.querySelector('.hero')?.classList.remove('hidden');
        form.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('sendAnotherBtn')?.addEventListener('click', hideThankYou);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResumeForm, { once: true });
} else {
    initResumeForm();
}
