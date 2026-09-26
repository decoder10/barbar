# Barbar Cafe — `/menu` без HTTP 500, 26 сентября 2026

Статус: публикуется в `origin`, ветка `barbar`, production `https://barbar-cafe.netlify.app` (Netlify собирает по push). Результат проверки на проде после публикации указывается в отчёте о выпуске.

База выпуска: `a633063`. Коммиты: `fea40fb` (ленивая загрузка рендера, лог `barbar.error`, резервная страница), `6606afb` (HTML вместо `text/plain` в резервных ответах), `237dfa3` (рендер собирается отдельным файлом) и последний — переименование шаблона, которое и устраняет 500. В коммиты входят только файлы функции `/menu`, шаблон, скрипты, настройки сборки, тесты, документы и две копии skill `barbar-release`. Незакоммиченные правки интерфейса других сессий (`src/barbar/**`, skills `barbar-interface`, `barbar-netlify-functions`), `.env*`, локальные данные и артефакты тестов в коммиты не входят.

## Что было не так

- С выпуска `1438c29` (серверный рендер гостевого меню, 25.09) `GET /menu` и `POST /menu` на проде отвечали HTTP 500 с пустым телом и `Content-Type: text/plain` за ~0,4 с.
- Симптом на телефонах: при открытии `/menu` (QR-ссылка из Telegram, Instagram и других приложений) скачивался файл `.txt`. Мобильные и встроенные браузеры сохраняют ответ `text/plain` как файл, а не показывают его; это и был пустой 500.
- **Причина:** путь функции `barbar-menu-page` (`config.path` = `/menu`) совпадал со статической страницей `dist/menu.html` (шаблон гостевого меню, вход Vite `menu.html`). В таком случае маршрутизация Netlify отвечает пустым 500 **до вызова функции**: код функции не запускается, в логах функции нет ни одной строки (у `barbar-menu` в то же время логируется каждый запрос `/api/menu`).
- Доказано черновыми деплоями (не production): простейшая функция, отвечающая `ok`, на пути `/menu` и на `/index` даёт 500, а на `/menus` или `/guest-menu` — 200; если убрать `dist/menu.html`, запрос `/menu` доходит до функции и `barbar-menu-page` появляется в логах. `rateLimit`, код функции и `pretty_urls` на результат не влияют.
- Поэтому локальные проверки (esbuild, `@netlify/zip-it-and-ship-it`, Docker `node:20/22`, `netlify dev --offline`) ошибку не воспроизводили: они проверяли бандл, а не маршрутизацию Netlify.

## Что изменилось

- **Исправление:** шаблон переименован `menu.html` → `guest-menu.html` (в корне и в `dist`). Ключ входа Vite остался `menu`, поэтому ассеты по-прежнему называются `assets/menu-*.js/css`. Функция берёт шаблон с `/guest-menu.html`; резервное перенаправление ведёт на `/guest-menu.html?static=1`. Публичный адрес для гостей не изменился: `/menu` (напечатанные QR-коды `/menu?table=<код>` работают). `/menu.html` больше не шаблон и попадает в общий обработчик приложения.
- Ссылки обновлены: `netlify/functions/barbar-menu-page.ts`, `netlify/lib/guest-menu-entry.ts`, `netlify/lib/guest-menu-page.tsx`, их тесты, `server/local-api.ts` (локально `/menu` рендерится из `guest-menu.html`), `scripts/guest-menu-stand.mjs`, `scripts/build-menu-renderer.mjs`, `tests/guest-menu-ssr.spec.ts`, комментарии `netlify.toml`.
- Защитный тест `netlify/lib/function-paths.test.ts`: ни один `config.path` функции из `netlify/functions` не совпадает со страницей `<path>.html` или `<path>/index.html` среди входов Vite и `public/`. На старом имени шаблона тест падает с `barbar-menu-page.ts: /menu collides with menu.html`.
- Сохранено из предыдущих коммитов этого выпуска:
  - `fea40fb`: не `GET`/`HEAD` → 405 без загрузки рендера; ошибка загрузки или рендера пишется одной строкой `{"metric":"barbar.error","route":"/menu","stage":"load"|"render"|"template","message":…,"stack":…}` (до 6 строк стека, без тела запроса, cookie и данных гостя); при сбое гость получает собранный шаблон (200, `Cache-Control: no-store`, заголовки сайта), без шаблона — 302 на `?static=1`, при уже заданном `static` — 503.
  - `6606afb`: все резервные ответы, которые видит гость, — `text/html; charset=utf-8`; 503 — короткая HTML-страница «Меню временно недоступно. Обновите страницу через минуту.» с `viewport`, `no-store`, `Retry-After: 60`.
  - `237dfa3`: рендер (React, `react-dom/server`, `lucide-react`, гостевой интерфейс) собирается `scripts/build-menu-renderer.mjs` при `npm run build` в `netlify/generated/guest-menu-renderer.mjs` (~2,3 МБ, в Git не хранится), поставляется через `included_files` и загружается при запросе по вычисляемому адресу. Причину 500 это не устраняло, но сбой рендера теперь не роняет функцию, а логируется.
- CSP, заголовки, кеширование `/api/menu` и `/menu` на CDN (`guest-menu-handler.ts`) и гостевой интерфейс не менялись. Миграций нет.

## Проверки до публикации

- `npm run check` (ESLint, `tsc -b`, Vitest) и `npm run build` — результаты в отчёте о выпуске; `dist/guest-menu.html` есть, `dist/menu.html` нет, `index.html` и `guest-menu.html` предзагружают одни и те же общие чанки.
- Бандл функции через `@netlify/zip-it-and-ship-it` (`nft`, runtime API v2) в Docker `node:22` (`237dfa3`): без базы `GET` — 200 `text/html` с шаблоном и `barbar.error`, без файла рендера — 200 и `barbar.error` `stage: load`, `POST` — 405; рендер из поставляемого файла выдаёт серверную разметку с `application/json`.
- Не запускались: `test:db`, `test:backup`, `test:scheduled-backup`, e2e — изменение не касается базы, резервных копий и интерфейса.

Состояние прода перед этим исправлением (26.09.2026, после `237dfa3`): `/`, `/menu.html`, `/api/menu` — 200; `GET /menu` и `POST /menu` — **500** `text/plain`.

## Ограничения и что сделать владельцу

- Если после публикации `/menu` отдаёт резервную страницу (200, `Cache-Control: no-store`, без `<script type="application/json" id="guest-menu-data">`), гости видят меню, но серверный рендер не сработал. Причина — в строке `barbar.error` лога: Netlify → сайт → Logs → Functions → `barbar-menu-page` (или `netlify logs --source functions --function barbar-menu-page`).
- Новым функциям нельзя давать путь, совпадающий со статической страницей (`<path>.html`); это проверяет `function-paths.test.ts`.
