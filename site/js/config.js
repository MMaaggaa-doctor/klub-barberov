/* Настройки сайта. Ключ anon — публичный, его можно хранить в репозитории
   (безопасность обеспечивают правила RLS из supabase/schema.sql). */
window.APP_CONFIG = {
  SUPABASE_URL: '',        // например: https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: '',   // Project Settings → API → anon public
  LEADS_TABLE: 'leads',
  // Скриншоты чата для телефона в блоке «Закрытый чат». Пока список пуст — показывается анимированный пример.
  // Положите файлы в assets/chat/ и перечислите их так: ['./assets/chat/chat-01.jpg', './assets/chat/chat-02.jpg']
  CHAT_SHOTS: [],
  CLUB_PRICE: 3690,        // цена месячной подписки для калькулятора
  TELEGRAM_URL: 'https://t.me/teymur_barber/4397'
};
