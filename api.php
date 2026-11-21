<?php
/*
 * Серверная часть сайта «Клуб Барберов».
 * PHP 7.4+ и MySQL 5.7+ (хостинг Beget). Доступы к базе берутся из config.php.
 *
 * Публичные действия (с сайта):  event, lead, status
 * Вход администратора:           register (только самый первый раз), login, logout, change_password
 * Только для администратора:     partners, leads, payments, stats
 */
ini_set('display_errors', '0');
error_reporting(E_ALL);
date_default_timezone_set('Europe/Moscow');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

/* ---------- ответы и ошибки ---------- */
function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail($msg, $code = 400, $extra = array()) {
    out(array_merge(array('error' => $msg), $extra), $code);
}
set_exception_handler(function ($e) {
    error_log('[kb-api] ' . get_class($e) . ': ' . $e->getMessage());
    fail('Ошибка сервера. Попробуйте позже.', 500);
});

/* ---------- настройки и база ---------- */
function config() {
    static $c = null;
    if ($c === null) {
        $f = __DIR__ . '/config.php';
        if (!is_file($f)) {
            fail('Не найден config.php. Скопируйте config.php.example в config.php и впишите доступы к базе.', 500);
        }
        $c = require $f;
        if (!is_array($c) || empty($c['db_name'])) {
            fail('config.php заполнен неверно.', 500);
        }
    }
    return $c;
}
function db() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $c = config();
    try {
        $pdo = new PDO(
            'mysql:host=' . $c['db_host'] . ';dbname=' . $c['db_name'] . ';charset=utf8mb4',
            $c['db_user'],
            $c['db_pass'],
            array(
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            )
        );
    } catch (Throwable $e) {
        error_log('[kb-api] db connect: ' . $e->getMessage());
        fail('Не удалось подключиться к MySQL. Проверьте config.php.', 500);
    }
    return $pdo;
}

/* ---------- вспомогательное ---------- */
function clean($v, $n = 255) {
    if (is_array($v) || is_object($v)) {
        return '';
    }
    $s = trim((string)$v);
    return function_exists('mb_substr') ? mb_substr($s, 0, $n, 'UTF-8') : substr($s, 0, $n);
}
function clean_or_null($v, $n) {
    $s = clean($v, $n);
    return $s === '' ? null : $s;
}
function str_len($s) {
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}
function body() {
    static $b = null;
    if ($b === null) {
        $raw = file_get_contents('php://input');
        $v = json_decode($raw === false ? '' : $raw, true);
        $b = is_array($v) ? $v : array();
    }
    return $b;
}
function valid_slug($s) {
    return (bool)preg_match('/^[a-z0-9_-]{2,40}$/', $s);
}
function since_datetime($days) {
    if ($days === null || $days === 'all' || $days === '') {
        return null;
    }
    $d = (int)$days;
    return $d > 0 ? date('Y-m-d H:i:s', time() - $d * 86400) : null;
}
function iso($dt) {
    $t = strtotime((string)$dt);
    return $t ? date('c', $t) : (string)$dt;
}
function limit_param($default = 300, $max = 1000) {
    $l = isset($_GET['limit']) ? (int)$_GET['limit'] : $default;
    return max(1, min($max, $l));
}

/* ---------- защита запросов, меняющих данные ---------- */
$method = strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET');
$action = isset($_GET['action']) ? (string)$_GET['action'] : '';

if ($method !== 'GET' && $method !== 'HEAD') {
    // Сайт всегда шлёт заголовок X-KB: чужая страница так сделать не может (браузер запретит без разрешения сервера).
    if ((isset($_SERVER['HTTP_X_KB']) ? $_SERVER['HTTP_X_KB'] : '') !== '1') {
        fail('Запрос отклонён.', 403);
    }
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
    if ($origin !== '') {
        $originHost = parse_url($origin, PHP_URL_HOST);
        $host = preg_replace('/:\d+$/', '', (string)(isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : ''));
        if (!$originHost || strcasecmp((string)$originHost, $host) !== 0) {
            fail('Запрос отклонён.', 403);
        }
    }
}

/* ---------- сессия администратора ---------- */
function start_session() {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? $_SERVER['HTTP_X_FORWARDED_PROTO'] : '') === 'https');
    session_name('kbadm');
    session_set_cookie_params(array(
        'lifetime' => 0,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Strict',
    ));
    session_start();
}
function admin_id() {
    start_session();
    $id = isset($_SESSION['admin_id']) ? (int)$_SESSION['admin_id'] : 0;
    if ($id > 0) {
        $last = isset($_SESSION['last']) ? (int)$_SESSION['last'] : 0;
        if (time() - $last > 43200) {          // 12 часов без действий — выход
            $_SESSION = array();
            session_destroy();
            return 0;
        }
        $_SESSION['last'] = time();
    }
    return $id;
}
function require_admin() {
    if (admin_id() <= 0) {
        fail('Требуется вход администратора', 401);
    }
}
function login_session($adminId) {
    start_session();
    session_regenerate_id(true);
    $_SESSION['admin_id'] = (int)$adminId;
    $_SESSION['last'] = time();
}

/* ---------- ограничение частоты (защита от подбора пароля и спама) ---------- */
function client_key() {
    $c = config();
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0';
    $salt = isset($c['db_pass']) ? $c['db_pass'] : '';
    return substr(hash('sha256', $ip . '|' . $salt . '|kb'), 0, 20);
}
function rate_ok($bucket, $max, $window) {
    try {
        $st = db()->prepare('SELECT COUNT(*) FROM rate_limits WHERE k = ? AND ts > ?');
        $st->execute(array($bucket . ':' . client_key(), time() - $window));
        return (int)$st->fetchColumn() < $max;
    } catch (Throwable $e) {
        return true;   // если таблицы ещё нет, сайт продолжает работать
    }
}
function rate_add($bucket) {
    try {
        $pdo = db();
        $pdo->prepare('INSERT INTO rate_limits (k, ts) VALUES (?, ?)')->execute(array($bucket . ':' . client_key(), time()));
        if (mt_rand(1, 200) === 1) {
            $pdo->prepare('DELETE FROM rate_limits WHERE ts < ?')->execute(array(time() - 86400));
        }
    } catch (Throwable $e) {
        // не критично
    }
}

/* ---------- статистика ---------- */
function source_sql() {
    return "COALESCE(NULLIF(ref, ''), NULLIF(LOWER(utm_source), ''), 'direct')";
}
function funnel_rows($days) {
    $pdo = db();
    $since = since_datetime($days);
    $map = array();
    $blank = function ($src) {
        return array('src' => $src, 'visits' => 0, 'visitors' => 0, 'clickers' => 0, 'payclickers' => 0, 'leads' => 0, 'buyers' => 0, 'revenue' => 0.0);
    };

    $sql = 'SELECT ' . source_sql() . " AS src,
        SUM(CASE WHEN event = 'pageview' THEN 1 ELSE 0 END) AS visits,
        COUNT(DISTINCT CASE WHEN event = 'pageview' THEN visitor_id END) AS visitors,
        COUNT(DISTINCT CASE WHEN event IN ('join_click','plan_select','pay_click','free_review_click') THEN visitor_id END) AS clickers,
        COUNT(DISTINCT CASE WHEN event = 'pay_click' THEN visitor_id END) AS payclickers
        FROM events" . ($since ? ' WHERE created_at >= ?' : '') . ' GROUP BY src';
    $st = $pdo->prepare($sql);
    $st->execute($since ? array($since) : array());
    foreach ($st->fetchAll() as $r) {
        $x = $blank($r['src']);
        $x['visits'] = (int)$r['visits'];
        $x['visitors'] = (int)$r['visitors'];
        $x['clickers'] = (int)$r['clickers'];
        $x['payclickers'] = (int)$r['payclickers'];
        $map[$r['src']] = $x;
    }

    $sql = 'SELECT ' . source_sql() . ' AS src, COUNT(*) AS leads FROM leads' . ($since ? ' WHERE created_at >= ?' : '') . ' GROUP BY src';
    $st = $pdo->prepare($sql);
    $st->execute($since ? array($since) : array());
    foreach ($st->fetchAll() as $r) {
        if (!isset($map[$r['src']])) {
            $map[$r['src']] = $blank($r['src']);
        }
        $map[$r['src']]['leads'] = (int)$r['leads'];
    }

    $sinceDate = $since ? substr($since, 0, 10) : null;
    $sql = "SELECT COALESCE(NULLIF(LOWER(source), ''), 'direct') AS src, COUNT(*) AS buyers, COALESCE(SUM(amount), 0) AS revenue FROM payments"
        . ($sinceDate ? ' WHERE paid_at >= ?' : '') . ' GROUP BY src';
    $st = $pdo->prepare($sql);
    $st->execute($sinceDate ? array($sinceDate) : array());
    foreach ($st->fetchAll() as $r) {
        if (!isset($map[$r['src']])) {
            $map[$r['src']] = $blank($r['src']);
        }
        $map[$r['src']]['buyers'] = (int)$r['buyers'];
        $map[$r['src']]['revenue'] = (float)$r['revenue'];
    }

    $rows = array_values($map);
    usort($rows, function ($a, $b) {
        if ($a['visitors'] === $b['visitors']) {
            return strcmp($a['src'], $b['src']);
        }
        return $b['visitors'] - $a['visitors'];
    });
    return $rows;
}
function partner_stats_rows($days) {
    $funnel = array();
    foreach (funnel_rows($days) as $r) {
        $funnel[$r['src']] = $r;
    }
    $out = array();
    foreach (db()->query('SELECT slug FROM partners')->fetchAll() as $p) {
        $f = isset($funnel[$p['slug']]) ? $funnel[$p['slug']] : null;
        $out[] = array(
            'slug' => $p['slug'],
            'visits' => $f ? $f['visits'] : 0,
            'visitors' => $f ? $f['visitors'] : 0,
            'clickers' => $f ? $f['clickers'] : 0,
            'leads' => $f ? $f['leads'] : 0,
            'buyers' => $f ? $f['buyers'] : 0,
            'revenue' => $f ? $f['revenue'] : 0,
        );
    }
    return $out;
}
function partner_daily_rows($days) {
    $since = since_datetime($days === null ? 30 : $days);
    $sql = "SELECT COALESCE(NULLIF(ref, ''), NULLIF(LOWER(utm_source), '')) AS slug, DATE(created_at) AS day, COUNT(*) AS visits
        FROM events
        WHERE event = 'pageview' AND COALESCE(NULLIF(ref, ''), NULLIF(LOWER(utm_source), '')) IS NOT NULL"
        . ($since ? ' AND created_at >= ?' : '') . ' GROUP BY slug, day';
    $st = db()->prepare($sql);
    $st->execute($since ? array($since) : array());
    $out = array();
    foreach ($st->fetchAll() as $r) {
        $out[] = array('slug' => $r['slug'], 'day' => (string)$r['day'], 'visits' => (int)$r['visits']);
    }
    return $out;
}

/* =====================================================================
   ПУБЛИЧНЫЕ ДЕЙСТВИЯ
   ===================================================================== */

/* Состояние: есть ли уже администратор и вошёл ли текущий посетитель */
if ($action === 'status') {
    $n = (int)db()->query('SELECT COUNT(*) FROM admins')->fetchColumn();
    out(array('ok' => true, 'first' => $n === 0, 'logged' => admin_id() > 0));
}

/* Событие аналитики с сайта */
if ($action === 'event' && $method === 'POST') {
    $allowed = array('pageview', 'join_click', 'plan_select', 'pay_click', 'free_review_click', 'lead_submit', 'view_pricing', 'view_cases', 'cta_click');
    $b = body();
    $ev = clean(isset($b['event']) ? $b['event'] : '', 40);
    if (!in_array($ev, $allowed, true)) {
        out(array('ok' => true));
    }
    if (!rate_ok('ev', 400, 600)) {
        out(array('ok' => true));
    }
    $visitor = clean(isset($b['visitor_id']) ? $b['visitor_id'] : '', 80);
    if (str_len($visitor) < 8) {
        out(array('ok' => true));
    }
    $ref = strtolower(clean(isset($b['ref']) ? $b['ref'] : '', 40));
    if ($ref !== '') {
        if (!valid_slug($ref)) {
            $ref = '';
        } else {
            $st = db()->prepare('SELECT active FROM partners WHERE slug = ?');
            $st->execute(array($ref));
            $row = $st->fetch();
            if (!$row || (int)$row['active'] !== 1) {
                out(array('ok' => true));          // неизвестная или отключённая ссылка не считается
            }
        }
    }
    $plan = clean(isset($b['plan']) ? $b['plan'] : '', 30);
    if (!in_array($plan, array('month', 'year', 'trial'), true)) {
        $plan = '';
    }
    $meta = null;
    if (isset($b['meta']) && is_array($b['meta']) && isset($b['meta']['target'])) {
        $meta = json_encode(array('target' => clean($b['meta']['target'], 80)), JSON_UNESCAPED_UNICODE);
    }
    $st = db()->prepare('INSERT INTO events (visitor_id, session_id, event, plan, click_id, ref, utm_source, utm_medium, utm_campaign, utm_content, utm_term, path, referrer, meta)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $st->execute(array(
        $visitor,
        clean_or_null(isset($b['session_id']) ? $b['session_id'] : '', 80),
        $ev,
        $plan === '' ? null : $plan,
        clean_or_null(isset($b['click_id']) ? $b['click_id'] : '', 40),
        $ref === '' ? null : $ref,
        clean_or_null(isset($b['utm_source']) ? $b['utm_source'] : '', 80),
        clean_or_null(isset($b['utm_medium']) ? $b['utm_medium'] : '', 80),
        clean_or_null(isset($b['utm_campaign']) ? $b['utm_campaign'] : '', 80),
        clean_or_null(isset($b['utm_content']) ? $b['utm_content'] : '', 80),
        clean_or_null(isset($b['utm_term']) ? $b['utm_term'] : '', 80),
        clean_or_null(isset($b['path']) ? $b['path'] : '', 200),
        clean_or_null(isset($b['referrer']) ? $b['referrer'] : '', 200),
        $meta,
    ));
    rate_add('ev');
    out(array('ok' => true));
}

/* Заявка с формы */
if ($action === 'lead' && $method === 'POST') {
    $b = body();
    $name = clean(isset($b['name']) ? $b['name'] : '', 120);
    $contact = clean(isset($b['contact']) ? $b['contact'] : '', 190);
    if (str_len($name) < 2 || str_len($contact) < 5) {
        fail('Проверьте имя и контакт.', 400);
    }
    if (!rate_ok('lead', 5, 600)) {
        fail('Слишком много заявок подряд. Попробуйте позже.', 429);
    }
    $ref = strtolower(clean(isset($b['ref']) ? $b['ref'] : '', 40));
    if ($ref !== '' && !valid_slug($ref)) {
        $ref = '';
    }
    $st = db()->prepare('INSERT INTO leads (name, contact, source, visitor_id, ref, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
        VALUES (?,?,?,?,?,?,?,?,?,?)');
    $st->execute(array(
        $name,
        $contact,
        clean_or_null(isset($b['source']) ? $b['source'] : '', 200),
        clean_or_null(isset($b['visitor_id']) ? $b['visitor_id'] : '', 80),
        $ref === '' ? null : $ref,
        clean_or_null(isset($b['utm_source']) ? $b['utm_source'] : '', 80),
        clean_or_null(isset($b['utm_medium']) ? $b['utm_medium'] : '', 80),
        clean_or_null(isset($b['utm_campaign']) ? $b['utm_campaign'] : '', 80),
        clean_or_null(isset($b['utm_content']) ? $b['utm_content'] : '', 80),
        clean_or_null(isset($b['utm_term']) ? $b['utm_term'] : '', 80),
    ));
    rate_add('lead');
    out(array('ok' => true));
}

/* =====================================================================
   ВХОД АДМИНИСТРАТОРА
   ===================================================================== */

/* Самый первый зарегистрировавшийся становится администратором. Дальше регистрация закрыта. */
if ($action === 'register' && $method === 'POST') {
    $b = body();
    $email = strtolower(clean(isset($b['email']) ? $b['email'] : '', 190));
    $pass = isset($b['password']) && is_string($b['password']) ? $b['password'] : '';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || str_len($pass) < 10) {
        fail('Проверьте почту и пароль (минимум 10 символов).', 400);
    }
    if (!rate_ok('reg', 10, 3600)) {
        fail('Слишком много попыток. Подождите немного.', 429);
    }
    rate_add('reg');
    $pdo = db();
    $got = (int)$pdo->query("SELECT GET_LOCK('kb_admin_register', 5)")->fetchColumn();
    if ($got !== 1) {
        fail('Сервер занят, повторите через минуту.', 503);
    }
    $count = (int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn();
    if ($count !== 0) {
        $pdo->query("SELECT RELEASE_LOCK('kb_admin_register')");
        fail('Администратор уже создан, регистрация закрыта. Войдите.', 403);
    }
    $st = $pdo->prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)');
    $st->execute(array($email, password_hash($pass, PASSWORD_DEFAULT)));
    $id = (int)$pdo->lastInsertId();
    $pdo->query("SELECT RELEASE_LOCK('kb_admin_register')");
    login_session($id);
    out(array('ok' => true));
}

if ($action === 'login' && $method === 'POST') {
    $b = body();
    $email = strtolower(clean(isset($b['email']) ? $b['email'] : '', 190));
    $pass = isset($b['password']) && is_string($b['password']) ? $b['password'] : '';
    $bucket = 'login:' . substr(sha1($email), 0, 12);
    if (!rate_ok($bucket, 8, 900) || !rate_ok('loginip', 40, 900)) {
        fail('Слишком много попыток входа. Подождите 15 минут.', 429);
    }
    $st = db()->prepare('SELECT id, password_hash FROM admins WHERE email = ?');
    $st->execute(array($email));
    $u = $st->fetch();
    if (!$u || !password_verify($pass, $u['password_hash'])) {
        rate_add($bucket);
        rate_add('loginip');
        usleep(300000);
        fail('Неверная почта или пароль.', 401);
    }
    login_session($u['id']);
    out(array('ok' => true));
}

if ($action === 'logout' && $method === 'POST') {
    start_session();
    $_SESSION = array();
    session_destroy();
    out(array('ok' => true));
}

/* =====================================================================
   ТОЛЬКО ДЛЯ АДМИНИСТРАТОРА
   ===================================================================== */
require_admin();

if ($action === 'change_password' && $method === 'POST') {
    $b = body();
    $old = isset($b['old']) && is_string($b['old']) ? $b['old'] : '';
    $new = isset($b['new']) && is_string($b['new']) ? $b['new'] : '';
    if (str_len($new) < 10) {
        fail('Новый пароль: минимум 10 символов.', 400);
    }
    $id = admin_id();
    $st = db()->prepare('SELECT password_hash FROM admins WHERE id = ?');
    $st->execute(array($id));
    $u = $st->fetch();
    if (!$u || !password_verify($old, $u['password_hash'])) {
        usleep(300000);
        fail('Текущий пароль указан неверно.', 403);
    }
    db()->prepare('UPDATE admins SET password_hash = ? WHERE id = ?')->execute(array(password_hash($new, PASSWORD_DEFAULT), $id));
    login_session($id);
    out(array('ok' => true));
}

/* ---------- отчёты ---------- */
if ($action === 'stats') {
    $name = isset($_GET['name']) ? (string)$_GET['name'] : '';
    $b = body();
    $days = array_key_exists('p_days', $b) ? $b['p_days'] : 30;
    if ($name === 'is_admin') {
        out(true);
    }
    if ($name === 'partner_stats') {
        out(partner_stats_rows($days));
    }
    if ($name === 'funnel_by_source') {
        out(funnel_rows($days));
    }
    if ($name === 'partner_daily') {
        out(partner_daily_rows($days === null ? 30 : $days));
    }
    fail('Неизвестный отчёт.', 404);
}

/* ---------- партнёры ---------- */
if ($action === 'partners') {
    $pdo = db();
    if ($method === 'GET') {
        $rows = $pdo->query('SELECT id, name, slug, active, created_at FROM partners ORDER BY id DESC')->fetchAll();
        foreach ($rows as $i => $r) {
            $rows[$i]['id'] = (int)$r['id'];
            $rows[$i]['active'] = ((int)$r['active'] === 1);
            $rows[$i]['created_at'] = iso($r['created_at']);
        }
        out($rows);
    }
    if ($method === 'POST') {
        $b = body();
        $items = (isset($b[0]) && is_array($b[0])) ? $b : array($b);
        if (count($items) < 1 || count($items) > 100) {
            fail('Укажите от 1 до 100 партнёров.', 400);
        }
        $clean = array();
        foreach ($items as $it) {
            $name = clean(isset($it['name']) ? $it['name'] : '', 80);
            $slug = strtolower(clean(isset($it['slug']) ? $it['slug'] : '', 40));
            if ($name === '' || !valid_slug($slug)) {
                fail('Проверьте имя и метку: метка — от 2 до 40 латинских букв, цифр, дефисов.', 400);
            }
            $clean[] = array($name, $slug);
        }
        $created = array();
        try {
            $pdo->beginTransaction();
            $st = $pdo->prepare('INSERT INTO partners (name, slug) VALUES (?, ?)');
            foreach ($clean as $c) {
                $st->execute($c);
                $created[] = array('id' => (int)$pdo->lastInsertId(), 'name' => $c[0], 'slug' => $c[1], 'active' => true);
            }
            $pdo->commit();
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ((string)$e->getCode() === '23000') {
                fail('Такая метка уже есть. Выберите другую.', 409, array('code' => '23505'));
            }
            throw $e;
        }
        out($created, 201);
    }
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) {
        fail('Не указан партнёр.', 400);
    }
    if ($method === 'PATCH') {
        $b = body();
        $pdo->prepare('UPDATE partners SET active = ? WHERE id = ?')->execute(array(!empty($b['active']) ? 1 : 0, $id));
        out(array('ok' => true));
    }
    if ($method === 'DELETE') {
        $pdo->prepare('DELETE FROM partners WHERE id = ?')->execute(array($id));
        out(array('ok' => true));
    }
    fail('Метод не поддерживается.', 405);
}

/* ---------- заявки ---------- */
if ($action === 'leads') {
    $pdo = db();
    if ($method === 'GET') {
        $since = null;
        if (!empty($_GET['since'])) {
            $t = strtotime((string)$_GET['since']);
            $since = $t ? date('Y-m-d H:i:s', $t) : null;
        }
        $sql = 'SELECT * FROM leads' . ($since ? ' WHERE created_at >= ?' : '') . ' ORDER BY id DESC LIMIT ' . limit_param();
        $st = $pdo->prepare($sql);
        $st->execute($since ? array($since) : array());
        $rows = $st->fetchAll();
        foreach ($rows as $i => $r) {
            $rows[$i]['id'] = (int)$r['id'];
            $rows[$i]['created_at'] = iso($r['created_at']);
        }
        out($rows);
    }
    if ($method === 'DELETE') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            fail('Не указана заявка.', 400);
        }
        $pdo->prepare('DELETE FROM leads WHERE id = ?')->execute(array($id));
        out(array('ok' => true));
    }
    fail('Метод не поддерживается.', 405);
}

/* ---------- оплаты ---------- */
if ($action === 'payments') {
    $pdo = db();
    if ($method === 'GET') {
        $since = null;
        if (!empty($_GET['since']) && preg_match('/^\d{4}-\d{2}-\d{2}/', (string)$_GET['since'])) {
            $since = substr((string)$_GET['since'], 0, 10);
        }
        $sql = 'SELECT id, source, plan, amount, comment, paid_at, lead_id FROM payments' . ($since ? ' WHERE paid_at >= ?' : '')
            . ' ORDER BY paid_at DESC, id DESC LIMIT ' . limit_param();
        $st = $pdo->prepare($sql);
        $st->execute($since ? array($since) : array());
        $rows = $st->fetchAll();
        foreach ($rows as $i => $r) {
            $rows[$i]['id'] = (int)$r['id'];
            $rows[$i]['amount'] = (float)$r['amount'];
            $rows[$i]['lead_id'] = $r['lead_id'] === null ? null : (int)$r['lead_id'];
        }
        out($rows);
    }
    if ($method === 'POST') {
        $b = body();
        $amount = isset($b['amount']) && is_numeric($b['amount']) ? (float)$b['amount'] : -1;
        if ($amount < 0 || $amount > 10000000) {
            fail('Проверьте сумму.', 400);
        }
        $plan = clean(isset($b['plan']) ? $b['plan'] : 'other', 30);
        if (!in_array($plan, array('month', 'year', 'trial', 'other'), true)) {
            $plan = 'other';
        }
        $source = strtolower(clean(isset($b['source']) ? $b['source'] : '', 80));
        if ($source !== '' && !preg_match('/^[a-z0-9_-]{1,80}$/', $source)) {
            fail('Источник: только латинские буквы, цифры, дефис.', 400);
        }
        $paid = clean(isset($b['paid_at']) ? $b['paid_at'] : '', 10);
        if ($paid === '') {
            $paid = date('Y-m-d');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $paid)) {
            fail('Проверьте дату оплаты.', 400);
        }
        $leadId = isset($b['lead_id']) && (int)$b['lead_id'] > 0 ? (int)$b['lead_id'] : null;
        $st = $pdo->prepare('INSERT INTO payments (source, plan, amount, comment, paid_at, lead_id) VALUES (?,?,?,?,?,?)');
        $st->execute(array(
            $source === '' ? null : $source,
            $plan,
            $amount,
            clean_or_null(isset($b['comment']) ? $b['comment'] : '', 300),
            $paid,
            $leadId,
        ));
        out(array('ok' => true, 'id' => (int)$pdo->lastInsertId()), 201);
    }
    if ($method === 'DELETE') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            fail('Не указана оплата.', 400);
        }
        $pdo->prepare('DELETE FROM payments WHERE id = ?')->execute(array($id));
        out(array('ok' => true));
    }
    fail('Метод не поддерживается.', 405);
}

fail('Неизвестное действие.', 404);
