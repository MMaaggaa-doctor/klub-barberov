# Клуб Барберов — Netlify + Supabase

Проект использует Netlify Functions в качестве API и Supabase (Postgres) для хранения данных. PHP/Beget не требуется.

## Deploy
Подробная инструкция находится в `README_NETLIFY_SUPABASE.md`.

**Netlify environment variables:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_TOKEN_SECRET`.
**SQL:** выполните `supabase-schema.sql` в Supabase SQL Editor.
**Admin:** `/admin.html`, первый администратор регистрируется один раз.

