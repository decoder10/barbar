# Barbar Cafe — выпуск уведомлений, 23 сентября 2026

Статус: продуктовый commit опубликован Netlify; обязательные production smoke и latency остаются непроверенными из-за отклонённого разрешения на сетевой GET-probe. Ниже сохранена история подготовки. Назначение выпуска: `origin` (`decoder10/barbar`), ветка `barbar`, production `https://barbar-cafe.netlify.app`. Пользователь запросил деплой подготовленных изменений.

База выпуска: `eb5748d83ddb5a042e1acba05cd32e1d65aac9e6`. До подготовки индекс пуст, 55 продуктовых файлов и два изменённых файла конфигурации агентов. В ходе подготовки продуктовый код не менялся; добавлен этот отчёт. Итого ожидаются 56 продуктовых путей. Перед коммитом заново сверить статус, индекс и удалённую ветку.

## Что подготовлено

- Уведомления показывают стол, позиции, сумму и комментарий; разделены на новые и прочитанные. Прочтение и очистка сохраняются по пользователю на устройстве, не удаляют серверную очередь. Push и возврат к списку — значки в заголовке панели.
- После подтверждённой заявки гость может отправить дозаказ; прежние заявки остаются в списке. Неопределённая отправка сохраняет токен повтора. Лимиты сервера сохранены.
- Заявки сгруппированы по столам; после добавления стола диалог закрывается. Корзина шире на desktop, перед отправкой увеличен отступ.
- Недоступные напитки имеют лёгкое затемнение, метку и неактивное добавление; сервер также проверяет наличие. Публичное меню не раскрывает количества и себестоимость.

## Проверки и происхождение результатов

### Baseline текущей задачи — предоставлен Tandem

23 сентября, 09:46:45–09:46:48 UTC: `npm run typecheck`, `npm run lint`, `npm run test` — успешны; **196 passed / 42 skipped**. Пропуски не считаются успешными DB-проверками. Полный набор и `npm run check` на implement повторно не запускались; Итоговая проверка оркестратора после подготовки также прошла 23 сентября, 09:56:54–09:56:57 UTC: typecheck, lint, test, **196 passed / 42 skipped**. На release эти команды не повторялись; SHA-256 всех 55 продуктовых файлов совпал со снимком implement.

### Исторические браузерные результаты

Предыдущая задача `20260923T082735-8cbbe0`: 34 уникальных успешных сценария по отчёту реализации. Первый прогон дал 29/30; после исправления селектора выполнено 5/5, включая ранее упавший сценарий двух столов. Они покрывают уведомления, прочтение/очистку, push в заголовке, дозаказ, наличие, два стола, закрытие диалога и гостевое меню. Команды:

```sh
node_modules/.bin/playwright test tests/stock-notifications.spec.ts tests/guest-order.spec.ts --grep 'stock warnings|guest notifications|header push|unsupported push|cart availability follows|staff see every|a guest adds' --workers=1 --reporter=line
node_modules/.bin/playwright test tests/guest-order.spec.ts tests/guest-menu.spec.ts --grep 'staff see every|public guest menu|owner prints|guest choices|responsive guest menu' --workers=1 --reporter=line
```

Эти результаты остаются историческими, не новым прогоном implement. Переданная проверка изменений после прошлой реализации указывает только два skill-файла; продуктовые исходники и зависимости не менялись. Состав рабочей копии совпал с передачей plan. Во время текущей подготовки контрольные суммы всех исходных 57 путей также остались прежними. Поэтому эти 34 сценария повторно не запускались. Визуальная оценка обеих тем относится к прошлому отчёту, нового просмотра скриншотов здесь нет.

### Выполнено на implement

| Проверка                            | Результат                                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                     | Успешно; штатная команда включает ESLint, photo manifest, TypeScript и Vite                                                                                                                         |
| `npm run test:db`                   | **44/44**, 7 файлов; включая новые проверки отказа по наличию и содержимого гостевых событий                                                                                                        |
| `npm run test:backup`               | Успешно: 505 документов, BSON, индексы, столы/заказы/смены, исключение временных коллекций, отказ при повреждении архива и восстановлении поверх существующей базы                                  |
| `npm run test:scheduled-backup`     | Успешно: 26 документов, восстановление, зеркалирование и ротация; временная база восстановления убрана тестом                                                                                       |
| `npm run benchmark`                 | 70 продуктов, 10 000 синтетических продаж, медиана 5 измерений: legacy 31,13 мс, indexed 1,03 мс, ускорение 30,2×                                                                                   |
| Дополнительный Playwright           | **28/28**, 3,0 минуты: 24 сочетания гостевого процесса, 2 сценария заказов, 2 сценария синхронизации каталога                                                                                       |
| `git diff --check`                  | Успешно                                                                                                                                                                                             |
| Проверка состава и типовых секретов | В 55 продуктовых файлах не найдены private keys, типовые GitHub/Netlify/AWS-токены, MongoDB URI с реквизитами или подозрительные пути данных/артефактов; это не гарантия обнаружения любого секрета |

DB-команды использовали `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true`; read-only `hello` подтвердил `rs0` и writable primary. Тесты создают отдельные базы со случайными именами и очищают только собственные фикстуры. Рабочие базы не использовались. Первое соединение из песочницы получило `EPERM`; проверка и DB-тесты выполнены после разрешения штатного механизма доступа.

Для дополнительного Playwright повторно использован существующий сервер `127.0.0.1:4001`: `/api/barbar/environment` подтвердил профиль `local`. API сценариев подменены. Сервер и MongoDB не перезапускались, порт 4002 не использовался. Команда закрывает пробелы прежних 34 сценариев: полную матрицу RU/EN/HY × light/dark × 390/820 × две роли (24 сценария), два сценария заказов и два сценария синхронизации каталога:

```sh
node_modules/.bin/playwright test tests/guest-order.spec.ts tests/orders.spec.ts tests/split-sync.spec.ts --grep 'guest request → worker|catalog cached across sales|owner opens a table|worker sees the same board' --workers=1 --reporter=line
```

Старое замечание о неполной матрице уже не относится к текущему коду: `tests/guest-order.spec.ts` содержит все 24 сочетания. `test:load` не запускался: запросы истории и популярности не изменены; синтетический benchmark не является измерением production latency.

Benchmark подтверждён только отчётом реализации; отдельного сохранённого лога нет.

Логи implement: `/tmp/barbar-release-20260923-{build,db,backup,scheduled,e2e}.log`. Это локальные артефакты, в Git не включать.

## Локальная сборка

Node.js локально — 24.14.0; Netlify настроен на Node.js 22. Успех локальной сборки не подтверждает облачную сборку.

| Чанк                         | Размер / gzip, кБ |
| ---------------------------- | ----------------- |
| `react-YWPnaJPF.js`          | 221,70 / 68,96    |
| `main-1LRYRVbR.js`           | 157,36 / 44,24    |
| `menu-BTUPdmui.js`           | 27,11 / 9,44      |
| `photo-manifest-DE3Xnw6V.js` | 100,91 / 21,64    |
| `photo-catalog-CriZaOwi.js`  | 32,96 / 12,48     |
| `Tables-_6wcn9Bv.js`         | 9,02 / 3,41       |
| `Order-_eIgdEyE.js`          | 16,01 / 6,03      |

Обе страницы предзагружают одни и те же `react`, `photo-manifest` и `photo-catalog`. Меню дополнительно предзагружает `art`, `plus`, `minus`, `list`; полного равенства всех preload-списков нет и оно не требуется для совпадения общих файлов. Первичная слишком строгая проверка полного равенства списков была уточнена до проверки общих чанков; исходники не менялись. Все ссылки на проверенные entry/preload существуют. В `dist/barbar` единственный JPG — `bar-hero.jpg`.

SHA-256 локальных entry:

- `main-1LRYRVbR.js`: `42d9988923668c222e76ac4e31219fe9a44758052665309b32ddee65b616ce46`.
- `menu-BTUPdmui.js`: `9a2c078bf57bbd21eaff7e7db07af9ff866c56fcb8a86d1c07e402d1d951e5c4`.

Это ориентиры для сравнения с опубликованной сборкой, не доказательство публикации. При отличиях окружения сравнивать commit Netlify и его ассеты.

## Состав для отдельного release-этапа

Исходные 55 путей ниже плюс `docs/release-2026-09-23-notifications.md`. Добавлять явным списком; `git add -A` не применять. Не включать `.agents/skills/barbar-interface/SKILL.md`, `.claude/skills/barbar-interface/SKILL.md`, прочую конфигурацию агентов, `.env*`, секреты, локальный учёт, `dist`, логи и результаты тестов. Эти два изменённых skill-файла на implement не редактировались.

```text
README.md
docs/architecture.md
docs/guest-menu.md
docs/next-work.md
docs/orders-design.md
docs/orders-implementation-2026-09-22.md
docs/production-release-rules.md
docs/release-2026-09-22-orders.md
docs/stock-notifications.md
docs/tasks-2026-09-23.md
netlify/lib/guest-menu-handler.test.ts
netlify/lib/guest-menu-handler.ts
netlify/lib/guest-order-store.ts
netlify/lib/notifications/deliver.ts
netlify/lib/notifications/feed.ts
netlify/lib/notifications/notifications.test.ts
netlify/lib/orders-workflows.test.ts
src/barbar/domain/__tests__/guest-menu.test.ts
src/barbar/domain/catalog/cards.ts
src/barbar/domain/guest-menu.ts
src/barbar/domain/guest-requests.ts
src/barbar/domain/notifications/__tests__/guest-feed.test.ts
src/barbar/domain/notifications/feed.ts
src/barbar/domain/notifications/message.ts
src/barbar/features/catalog/cards.tsx
src/barbar/features/guest/GuestMenuQr.tsx
src/barbar/features/notifications/NotificationsButton.tsx
src/barbar/features/notifications/NotificationsPanel.tsx
src/barbar/features/notifications/use-notification-reads.ts
src/barbar/features/orders/GuestRequests.tsx
src/barbar/features/orders/ShiftCloseSheet.tsx
src/barbar/features/orders/TablesEditor.tsx
src/barbar/features/sales/SalesCatalog.tsx
src/barbar/guest/GuestCart.tsx
src/barbar/guest/GuestMenu.tsx
src/barbar/guest/_menu-catalog.scss
src/barbar/guest/_menu-panels.scss
src/barbar/guest/_menu-responsive.scss
src/barbar/guest/_menu-shell.scss
src/barbar/guest/guest-menu.scss
src/barbar/guest/menu-parts.tsx
src/barbar/guest/use-guest-order.ts
src/barbar/pages/Order.tsx
src/barbar/pages/Tables.tsx
src/barbar/presentation/i18n/en.json
src/barbar/presentation/i18n/hy.json
src/barbar/styles/_catalog.scss
src/barbar/styles/_compact.scss
src/barbar/styles/_guest-qr.scss
src/barbar/styles/_notifications.scss
src/barbar/styles/_orders.scss
src/barbar/styles/_responsive.scss
src/barbar/ui/drawer.tsx
tests/guest-order.spec.ts
tests/stock-notifications.spec.ts
```

Отпечаток этих 55 файлов: `5cd872935c119dee10e3dd35e4b389f8132afa9b89d0e19c9175e7a0ccdcd960`. Расчёт: SHA-256 UTF-8 строк `path + NUL + sha256(file) + LF`, отсортированных по пути. Этот отчёт и исключённые skill-файлы в отпечаток не входят. Полный локальный снимок — `/tmp/barbar-release-20260923-inputs.json`.

## Ограничения и передача на release

Три замечания прошлого ревью остаются неблокирующими согласно согласованному плану выпуска существующей работы: склонение «N позиций», перевод имени стола в aria-label, лишнее чтение stockBalances перед 304 меню. В этой подготовке они не исправлялись. Причина исходной потери заявок разных столов не воспроизведена; возможные объяснения не считаются установленной причиной. Прочтение уведомлений между устройствами не синхронизируется.

Новых миграций или определений индексов этот diff не добавляет. Существующие одноразовые миграции опубликованное приложение может выполнить при первом подходящем API-запросе; не вызывать их принудительно ради проверки. Метки `ledger-indexes-v4` и `audit-indexes-v2` подтверждать только чтением `appMigrations` и `listIndexes`, либо оставить неподтверждёнными.

На отдельном release-этапе после проверки Tandem:

- Сверить свежий `origin/barbar`, привязку ветки к production Netlify и финальный индекс. Создать обычный коммит, отправить без force push. Дождаться успешной облачной сборки; записать commit/deploy и подтвердить именно новую версию.
- Безопасными GET проверить `/`, `/menu`, `/api/menu`, HSTS/CSP и остальные заголовки из `netlify.toml`; 401 на защищённых API `/api/barbar`, `/api/barbar/users`, `/api/barbar/notifications`, `/api/barbar/orders`, `/api/barbar/shifts`, `/api/barbar/guest-requests`; `authenticated: false` на `/api/barbar/auth`; 404 на `/api/guest-order` без кода.
- Выполнить `npm run probe:latency`, записать первый ответ, p50/p95 и статусы; первый ответ не доказывает холодный старт. При доступном Atlas — `npm run db:storage` и отдельные read-only проверки маркеров/индексов. Не создавать продажи, заявки, сеансы для тестов и не закрывать смену.
- Дополнить этот отчёт фактическими результатами и отправить отдельный документационный коммит. Не менять секреты, аутентификацию и данные. Не останавливать чужие или существовавшие до задачи сервисы без отдельного основания.

На implement production и Atlas не проверялись. Реальная доставка Web Push, облачное расписание резервирования и сетевые настройки остаются неподтверждёнными; успешные локальные backup-тесты не подтверждают облачное расписание. Commit/deploy и post-release smoke будут заполнены release-этапом, они не являются выполненными локальными проверками.

## Проверка перед публикацией

23 сентября на release: `origin/barbar` по `git ls-remote` и локальный HEAD совпадают с базой `eb5748d83ddb5a042e1acba05cd32e1d65aac9e6`. Netlify показывает этот же опубликованный commit, репозиторий `decoder10/barbar`, автоматическую публикацию ветки `barbar`. Все 55 продуктовых файлов совпадают по SHA-256 с проверенным снимком. В выпуск включаются они и этот отчёт. Вне индекса остаются **четыре** изменённых skill-файла: interface и release в `.agents` и `.claude`; раннее количество «два» относится к снимку implement. Новые миграции этим выпуском не добавлены; существующий механизм первого API-запроса сохранён.

## Фактическая публикация — release

- Продуктовый commit: `0fa3d4934951b36447574b8a21976706fa3a21f0`, отправлен обычным push в `origin/barbar` (переход `eb5748d..0fa3d49`), без переписывания истории.
- Перед commit проверены все 56 staged-путей, соответствие явному списку, отсутствие запрещённых путей и типовых секретов в содержимом индекса; `git diff --cached --check` прошёл. Продуктовые исходники не изменялись на release. Четыре skill-файла остались вне коммита.
- [Netlify deploy `6ab3a42f6feefa0008bf673c`](https://app.netlify.com/projects/barbar-cafe/deploys/6ab3a42f6feefa0008bf673c) показывает **Published deploy**, **Production: barbar @0fa3d49** и ссылку на полный commit выше. Это подтверждение точной ревизии через Netlify, а не по одному HTTP 200.
- Production: <https://barbar-cafe.netlify.app>. [Неизменяемый адрес deploy](https://6ab3a42f6feefa0008bf673c--barbar-cafe.netlify.app/).
- Облачная сборка 23 сентября 10:04:33–10:05:16 UTC, 43 секунды: штатный `npm run build` успешен, 13 функций опубликованы, 2 страницы и 48 ассетов изменены; правила redirects и headers обработаны без ошибок. Initializing, Building, Deploying, Cleanup и Post-processing — Complete. Netlify secret scan: 1800 файлов, совпадений не найдено. Имена main/menu/shared/route чанков в логе совпали с локальной сборкой.
- Анонимный production GET-probe из песочницы остановился на DNS `ENOTFOUND`, до получения ответов. Повтор с нативным разрешением доступа был отклонён (`rejected by user`, иных причин инструмент не сообщил). После отказа сетевые smoke-запросы не повторялись другим способом. Поэтому страницы, фактические защитные заголовки, публичное меню, анонимные API и SHA-256 ассетов через production HTTP **не проверены**.
- `npm run probe:latency` не запускался после отказа в production GET-доступе. Статусы, first/p50/p95 отсутствуют; успешного замера или холодного старта не заявляется.

### Atlas: только чтение

Использовано существующее подключение `.env.production-db` к `barbar` без запуска dev-сервера. Read-only отчёт получен 23 сентября в 10:06:41 UTC: данные 0,08 МБ, индексы 1,14 МБ, 0,2% настроенного лимита. Функция `storageReport` из того же модуля, что обслуживает `npm run db:storage`, вызвана напрямую: `.env.backup` отсутствует, файлы окружения не создавались и не изменялись. При соединении в песочнице был ECONNREFUSED; доступ вне песочницы разрешён отдельно. Первое listIndexes встретило NamespaceNotFound; повторный отчёт явно отмечает отсутствующие коллекции.

Прочитаны `appMigrations` и `listIndexes` 14 целевых коллекций, сопоставлены 35 ожидаемых определений из `netlify/lib/database/indexes.ts` с ключами и опциями. **25/35 совпали, 10 отсутствуют**:

- `orders`: `{ businessDay: 1 }`;
- `shifts`: оба ожидаемых индекса (коллекции нет);
- `guestRequests`: три индекса (коллекции нет);
- `guestLimits`: TTL (коллекции нет);
- `guestEvents`: два индекса (коллекции нет);
- `auditEvents`: `{ targetId: 1, action: 1 }`.

Маркеры `ledger-indexes-v4` и `audit-indexes-v2` отсутствуют. Завершение миграций не подтверждено; найденное состояние соответствует описанному до прошлого выпуска. Новых миграций этот commit не добавляет. Существующий код может выполнить их при первом подходящем API-запросе, но для проверки они принудительно не запускались. Соответствие локально настроенного подключения фактическому production URI Netlify отдельно не проверялось, секреты Netlify не читались.

Локальные артефакты чтения: `/tmp/barbar-release-20260923-atlas.json`, `/tmp/barbar-release-20260923-index-comparison.json`; в Git не включены. Тестовые продажи, заявки, сеансы, изменение авторизации и записи в Atlas не выполнялись.

### Незавершённые проверки

Публикация точного commit подтверждена. Полная верификация выпуска остаётся **незавершённой**: production smoke и latency заблокированы отказом разрешения, применение указанных миграций не подтверждено. Реальная доставка Web Push, облачное расписание backup и сетевые настройки остаются отдельными непроверенными ограничениями. Этот итоговый отчёт сохраняется отдельным документационным коммитом `[skip ci]`; продуктовый deploy указан выше.
