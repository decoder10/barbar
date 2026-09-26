# Barbar Cafe — `/menu` без HTTP 500, 26 сентября 2026

Статус: публикуется в `origin`, ветка `barbar`, production `https://barbar-cafe.netlify.app` (Netlify собирает по push). Результат проверки на проде после публикации указывается в отчёте о выпуске.

База выпуска: `a633063`. В коммит входят только файлы функции `/menu`, её тесты и этот документ. Незакоммиченные правки интерфейса в рабочей копии (`src/barbar/pages/*`, `src/barbar/styles/*`, `src/barbar/ui/layout.tsx`), `tests/zz-tmp-heading.spec.ts`, `.env*`, локальные данные и артефакты тестов в коммит не входят.

## Что было не так

- С выпуска `1438c29` (серверный рендер гостевого меню) `GET /menu` и `POST /menu` на проде отвечают HTTP 500 с пустым телом за ~0,4 с. Обработчик целиком обёрнут в `try/catch` с переходом на `/menu.html?static=1`, а `POST` должен давать 405 — значит, функция `barbar-menu-page` падает до запуска обработчика: при загрузке модуля или в загрузчике Netlify.
- Локально причина не воспроизводится: бандл функции (esbuild и `@netlify/zip-it-and-ship-it` v16) загружается и работает на Node 20/22/24 (macOS и Docker Linux). `netlify dev --offline` (netlify-cli, без входа и без `.env`, в отдельной копии рабочего дерева) отвечает на `GET /menu` и `POST /menu` кодом 302 на `/menu.html?static=1`, а не 500. Логи функции на Netlify с этой машины недоступны (нет входа в Netlify CLI и токена).

## Что изменилось

- `netlify/functions/barbar-menu-page.ts`: на верхнем уровне только лёгкий модуль `netlify/lib/guest-menu-entry.ts`. Рендер (`../lib/guest-menu-page` — React, `react-dom/server`, `GuestMenu`) и репозиторий каталога загружаются через `import()` внутри `try` при запросе. Кеш шаблона `builtPage`, `config` (пути `/menu`, `/menu/`, `rateLimit`) и `observe` сохранены.
- Не `GET`/`HEAD` → 405 сразу, без загрузки рендера. После публикации `POST /menu` = 405 показывает, что функция на Netlify запускается.
- Ошибка загрузки или рендера пишется в лог функции одной строкой `{"metric":"barbar.error","route":"/menu","stage":"load"|"render"|"template","message":…,"stack":…}` (до 6 строк стека; без тела запроса, cookie и данных гостя) — `logError` в `netlify/lib/observability.ts`.
- Резервный ответ: собранный `menu.html` со статусом 200, `Cache-Control: no-store` и заголовками сайта (меню строится в браузере, как до серверного рендера) — гость получает страницу одним запросом. Если сам шаблон недоступен — прежний 302 на `/menu.html?static=1`; при уже заданном `static` — 503 с `Retry-After: 60` (защита от цикла сохранена).
- Заголовки сайта вынесены в `netlify/lib/site-headers.ts` (резервный ответ не загружает React); `guest-menu-page.tsx` реэкспортирует `siteHeaders`, тест сверки с `netlify.toml` не менялся.
- `netlify.toml`, CSP, кеширование `/api/menu` и `/menu` на CDN (`guest-menu-handler.ts`) и гостевой интерфейс не менялись. Миграций нет.

## Проверки до публикации

- `npm run check` (ESLint, `tsc -b`, Vitest): прошла — 52 файла, 283 теста пройдено, 61 пропущен (наборы MongoDB без `test:db`).
- Новый `netlify/lib/guest-menu-entry.test.ts`: успешный рендер проходит без изменений; при ошибке загрузки или рендера — 200 с `menu.html`, `no-store`, заголовки сайта, одна строка `barbar.error` без cookie; `HEAD` без тела; без шаблона — 302 с `static=1`, повторно — 503; `POST` — 405 без загрузки рендера. Время не подменяется.
- `npm run build`: прошла. Ассеты гостевой страницы не изменились (`assets/menu-D9WEXUyK.js`, как на проде), поэтому публикация подтверждается поведением `/menu`, а не хешами.
- Бандл новой функции через `@netlify/zip-it-and-ship-it` (Netlify выбирает `nft`, runtime API v2, маршруты `/menu`, `/menu/`) без `BARBAR_MONGODB_URI`: `GET` — 200 с шаблоном и строкой `barbar.error` (`stage: render`), `POST` — 405.
- Не запускались: `test:db`, `test:backup`, `test:scheduled-backup`, e2e — изменение не касается базы, резервных копий и интерфейса.

Состояние прода перед push (26.09.2026): `/` — 200, `/menu.html` — 200, `/api/menu` — 200, `GET /menu` и `POST /menu` — **500**.

## Ограничения и что сделать владельцу

- Первопричина 500 не установлена. Сборщик Netlify (`nft`) оставляет пакеты `react`, `react-dom/server`, `lucide-react`, `mongodb` внешними и подключает их статически при загрузке модуля даже при `import()` внутри обработчика. Если сбой именно в разрешении этих пакетов на Netlify, `/menu` может по-прежнему отдавать 500 — тогда `POST /menu` тоже не будет давать 405.
- Если после публикации `/menu` отдаёт резервную страницу (200, `Cache-Control: no-store`, без `<script type="application/json" id="guest-menu-data">`), серверный рендер по-прежнему не работает, но гости видят меню. Причину нужно взять из лога: Netlify → сайт → Logs → Functions → `barbar-menu-page`, строка `barbar.error` (поля `stage`, `message`, `stack`), и по ней завершить исправление.
