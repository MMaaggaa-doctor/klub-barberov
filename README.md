# Клуб Барберов — сайт

Обычный статический сайт (HTML, CSS, JS). Сборка не нужна.

## Что заменить перед запуском
1. Фото Теймура: положить файл `assets/img/teymur.jpg` (квадратное). Пока файла нет, плашка с фото скрыта.
2. Логотип клуба: сейчас в шапке монограмма «КБ». Замена — в `index.html`, тег `<svg>` внутри `.logo`.
3. Адрес сайта: найти `YOUR-SITE.netlify.app` в `index.html`, `materials.html`, папке `materials/`, `sitemap.xml`, `robots.txt` и заменить на свой домен.
4. Новые 3D-модели: положить в `assets/3d/` с теми же именами (webp с прозрачным фоном) — на сайте обновятся сами.

## Заявки через Supabase
1. Создать проект на supabase.com.
2. SQL Editor → вставить содержимое `supabase/schema.sql` → Run.
3. Project Settings → API → скопировать Project URL и ключ `anon public`.
4. Вставить их в `js/config.js` (SUPABASE_URL и SUPABASE_ANON_KEY).
5. Заявки смотреть в Table Editor → leads. Читать их с сайта нельзя, только добавлять.

## Выкладка: GitHub + Netlify
1. Создать репозиторий на GitHub и загрузить в него все файлы из этой папки (index.html должен лежать в корне).
2. На netlify.com: Add new site → Import an existing project → GitHub → выбрать репозиторий.
3. Build command оставить пустым, Publish directory — `.` (точка). Deploy.
4. Каждое изменение в GitHub будет автоматически обновлять сайт.

## Новая статья
Скопировать любой файл из `materials/`, поменять текст и добавить карточку в `materials.html` и в `sitemap.xml`.
