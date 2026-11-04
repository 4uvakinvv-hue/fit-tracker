# Forma (fit-tracker)

Фитнес-приложение: учёт любых активностей (зал, вело, бег, ходьба, фланирование), лента, рейтинг и баллы, тренер по подписке с отдельным экраном «Тренировка от тренера».

**Стек:** React 19 + Vite, Capacitor (Android), Supabase (Auth, Postgres с RLS, Edge Functions). Проект Supabase: `osxxmmutwehabkvylkki`.

## С чего начать (людям и ИИ)

1. `AGENTS.md` — обязательные правила работы с репозиторием, публикации и интеграциями.
2. `docs/FORMA_PRODUCT_RULES.md` — единый контракт продукта: баллы, тоннаж, экран тренировки от тренера (§5), GPS.
3. `docs/COACH_KNOWLEDGE.md` — база знаний ИИ-тренера: видение владельца, научная база, методика женского тренинга.
4. `docs/AI_COACH.md` — как ИИ-тренер читает данные, составляет и публикует планы; контракт плана; подключение другого ИИ.
5. Настройка интеграций: `TRAINER_SETUP.md`, `GYM_TRAINER_SETUP.md`, `AUTH_SETUP.md`, `FATSECRET_SETUP.md`, `STEPS_SETUP.md`, `PROFILE_NAME_SETUP.md`, `SPRINTHOST.md`.
6. Схема базы и серверная логика: `supabase/*.sql`, `supabase/functions/`.

Репозиторий публичный: личные данные и индивидуальные правила тренировок хранятся только в базе.

## Разработка

```bash
npm install
npm run dev
npm test
npm run build
```

## Публикация

Каждый push в `main` запускает GitHub Actions:

- проверка сборки;
- веб-версия на GitHub Pages;
- архив для Sprinthost — релиз `web-current` (загружается на хостинг вручную, см. `SPRINTHOST.md`);
- Android APK — релиз `android-current`.

Версия приложения — `major.minor` (сейчас `2.1`), см. `AGENTS.md`. Веб-публикация не обновляет функции Supabase и схему базы — их применяют отдельно.
