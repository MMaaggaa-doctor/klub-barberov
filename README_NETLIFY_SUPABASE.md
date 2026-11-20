# Клуб Барберов — Netlify + Supabase

## 1. Supabase
1. Создайте проект Supabase.
2. Откройте SQL Editor → New query.
3. Вставьте содержимое `supabase-schema.sql` и нажмите Run.
4. Settings → API. Скопируйте Project URL и `service_role` key (секретный ключ).

## 2. Netlify
1. Импортируйте папку/репозиторий проекта в Netlify.
2. В Site configuration → Environment variables добавьте:
   - `SUPABASE_URL` — Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — service_role key
   - `ADMIN_TOKEN_SECRET` — длинный случайный секрет (не менее 32 символов)
3. Publish directory: `site` если репозиторий содержит папку `site`; если вы загружаете содержимое `site` как корень, publish directory `.`.
4. Functions directory: `netlify/functions`.
5. Deploy site.


## 3. Админка
Откройте `/admin.html`. Первый администратор регистрируется один раз. Пароль — минимум 10 символов. После первого администратора форма регистрации закрывается, вход доступен только ему. Не публикуйте секреты Supabase и не вставляйте service role key в HTML/JS.


## 4. Важно
- Секреты добавляются только в Netlify Environment variables, никогда в репозиторий.
- Изменения переменных окружения требуют повторного deploy.
- Текущий backend совместим с таблицами partners, leads, payments, events, admin_users.
- В текущей версии RPC `partner_daily` пока возвращает пустой массив; дневной график статистики не наполнен. Остальные базовые CRUD-запросы и вход/первичная регистрация предусмотрены.
