-- Клуб Барберов — база MySQL.
-- Выполните этот файл в phpMyAdmin Beget (вкладка «SQL») после создания пустой базы.
-- Его можно запускать повторно: уже созданные таблицы и данные не затрагиваются.

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS partners (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(40) NOT NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  contact VARCHAR(190) NOT NULL,
  source VARCHAR(200) NULL,
  visitor_id VARCHAR(80) NULL,
  ref VARCHAR(80) NULL,
  utm_source VARCHAR(80) NULL,
  utm_medium VARCHAR(80) NULL,
  utm_campaign VARCHAR(80) NULL,
  utm_content VARCHAR(80) NULL,
  utm_term VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_leads_created (created_at),
  INDEX idx_leads_ref (ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(80) NULL,
  plan VARCHAR(30) NOT NULL DEFAULT 'other',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  comment VARCHAR(300) NULL,
  paid_at DATE NOT NULL,
  lead_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payments_paid (paid_at),
  INDEX idx_payments_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  visitor_id VARCHAR(80) NULL,
  session_id VARCHAR(80) NULL,
  event VARCHAR(40) NOT NULL,
  plan VARCHAR(30) NULL,
  click_id VARCHAR(40) NULL,
  ref VARCHAR(80) NULL,
  utm_source VARCHAR(80) NULL,
  utm_medium VARCHAR(80) NULL,
  utm_campaign VARCHAR(80) NULL,
  utm_content VARCHAR(80) NULL,
  utm_term VARCHAR(80) NULL,
  path VARCHAR(200) NULL,
  referrer VARCHAR(200) NULL,
  meta JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_created (created_at),
  INDEX idx_events_ref (ref),
  INDEX idx_events_event (event)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Счётчик попыток: защита входа от подбора пароля и форм от спама (хранит только обезличенные ключи).
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  k VARCHAR(120) NOT NULL,
  ts INT UNSIGNED NOT NULL,
  INDEX idx_rate_k (k, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Если потеряли пароль администратора: выполните две строки ниже и зарегистрируйтесь заново на admin.html
-- DELETE FROM admins;
-- DELETE FROM rate_limits;
