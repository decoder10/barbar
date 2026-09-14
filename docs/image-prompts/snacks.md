# Изображения закусок · 14 сентября 2026

Созданы встроенным imagegen как примеры подачи. Изображения не подтверждают фактический состав блюда или размер порции. Данные меню и рецепты не менялись.

Файлы: `public/barbar/photos/snack-*.webp`; авторство и версия URL формируются через `npm run photos:manifest`.

Проверено: 20 отдельных изображений загружаются в карточках с `contain`, каждая исходная позиция имеет собственное изображение. Режим рабочего не показывает цены. Выполнены `npm run check`, `npm run build` и два сценария Playwright для каталога/отчётов. Изменений схемы, рецептов и операций БД нет.

## Общий промпт

Use case: product-mockup. Generate ONE photorealistic premium bar menu food catalog asset, landscape 3:2. Subject: SUBJECT. Clean appetizing realistic food photography. Isolated on pure white seamless background (#ffffff), very faint natural contact shadow only, three-quarter elevated camera view. Entire bowl or plate fully in frame, centered, subject fills 78% width, generous clean margins, no cropping. Soft diffused studio light from upper left, rich natural food colors and detailed textures. Modern restrained presentation. No table scene, no hands, no cutlery, no drinks, no text, no logos, no collage, no inset, no decorative scattered ingredients. This is an illustrative serving, not actual venue documentation.

## Подстановка SUBJECT по позициям

- **Chips** (`snack-chips.webp`): A shallow ivory ceramic bowl filled with crisp golden potato chips, delicately curled thin slices.
- **Nuts** (`snack-nuts.webp`): A small shallow ivory ceramic bowl filled with roasted mixed peanuts, almonds and cashews.
- **Jerky** (`snack-jerky.webp`): A small ivory ceramic plate of richly textured dry cured beef jerky strips, dark reddish brown, thin irregular slices.
- **Crackers** (`snack-crackers.webp`): A shallow ivory ceramic bowl of crunchy golden rye bread croutons, small rustic rectangular bread crackers.
- **Sujuck** (`snack-sujuck.webp`): An ivory plate of thin round slices of Armenian dry cured sujuk sausage, rich burgundy red with visible spices, neatly overlapping.
- **Anchovy** (`snack-anchovy.webp`): An ivory oval plate of small golden dried salted anchovies, neatly piled, appetizing beer snack.
- **Pistachios** (`snack-pistachios.webp`): A shallow ivory bowl of roasted pistachios in naturally split beige shells, green nut kernels visible.
- **Lemon** (`snack-lemon.webp`): An ivory small plate of fresh juicy lemon wedges and thin lemon rounds, bright yellow and translucent pulp.
- **Honey** (`snack-honey.webp`): A small clear glass ramekin filled with amber honey, one small piece of honeycomb resting on an ivory saucer underneath. No dripper.
- **Olives green/black** (`snack-olives.webp`): A shallow ivory bowl with plump green and black olives, subtle natural gloss.
- **Mini sausages and pickles** (`snack-sausages-pickles.webp`): A small ivory oval platter with browned grilled miniature sausages beside crisp green pickled gherkins, arranged in two tidy groups.
- **Brtuch** (`snack-brtuch.webp`): Two halves of an Armenian lavash wrap, thin lightly toasted lavash enclosing fresh green herbs, white cheese and tomato, angled cross sections visible on an ivory plate.
- **Snack set** (`snack-assortment.webp`): A modest round ivory divided platter containing separate groups of golden potato chips, roasted mixed nuts, rye bread croutons, green and black olives. Four appealing distinct groups.
- **Beer set** (`snack-beer-set.webp`): An oval ivory appetizer platter containing distinct groups of sliced sujuk, dark beef jerky strips, golden rye croutons, pistachios and green pickled gherkins. No beer glass.
- **Sandwich** (`snack-sandwich.webp`): Two triangular halves of a toasted sandwich with sliced cheese, tomato and green lettuce, golden crust, stacked at a slight angle on an ivory plate.
- **Sandwich with sujuck** (`snack-sujuck-sandwich.webp`): Two triangular halves of a toasted sandwich filled with visible thin burgundy Armenian sujuk slices and melted cheese, cut faces facing camera, on an ivory plate.
- **BarBar sandwich** (`snack-barbar-sandwich.webp`): A generous cafe club sandwich cut into two tall triangular halves with cheese, grilled chicken, lettuce and tomato, lightly toasted bread, neatly arranged on an ivory plate. An illustrative club sandwich, no logo.
- **Cheese set with honey** (`snack-cheese-honey.webp`): A tasteful small ivory platter with several groups of sliced aged yellow cheese, white brined cheese cubes, soft cheese wedges and a small glass ramekin of golden honey, only cheese and honey.
- **Mikayelyan cheese with honey small set** (`snack-cheese-small.webp`): A compact ivory cheese tasting plate with four small distinct groups of artisanal cheeses: aged golden slices, pale white cheese, herb-flecked cheese, soft cheese wedges, with a small glass ramekin of amber honey. No branding.
- **Mikayelyan cheese with honey large set** (`snack-cheese-large.webp`): A generous wide oval ivory cheese tasting platter, six abundant distinct groups of artisanal cheeses in wedges, cubes and slices, aged golden, creamy white, herb-flecked and blue-veined varieties, two small glass ramekins of amber honey. Elegant varied arrangement, no branding.
