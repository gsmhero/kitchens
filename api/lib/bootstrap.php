<?php
/* Kitchens backend: shared helpers (settings, database, JSON in/out, sessions, rights).
   Settings come from kitchens.config.php, which sits ONE LEVEL ABOVE the public web folder and is written by the deploy workflow
   from the GitHub secrets. Nothing secret is in this repository. */
declare(strict_types=1);

date_default_timezone_set('UTC');

function config(): array {
    static $c = null;
    if ($c === null) {
        $f = __DIR__ . '/../../../kitchens.config.php';   // api/lib -> api -> public_html -> domain folder
        $c = is_file($f) ? (array) (include $f) : [];
    }
    return $c;
}
function cfg(string $key, $default = '') { $c = config(); return ($c[$key] ?? '') !== '' ? $c[$key] : $default; }

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $c = config();
        $pdo = new PDO(
            'mysql:host=' . ($c['db_host'] ?? 'localhost') . ';dbname=' . ($c['db_name'] ?? '') . ';charset=utf8mb4',
            $c['db_user'] ?? '', $c['db_pass'] ?? '',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
        );
        $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '+00:00'");
    }
    return $pdo;
}
function q(string $sql, array $args = []): PDOStatement { $s = db()->prepare($sql); $s->execute($args); return $s; }

/* ---------- JSON in / out ---------- */
function out($data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function fail(string $message, int $code = 400, array $extra = []): never { out(['error' => $message] + $extra, $code); }
function body(): array {
    static $b = null;
    if ($b === null) {
        $raw = file_get_contents('php://input');
        $b = $raw !== '' && $raw !== false ? json_decode($raw, true) : [];
        if (!is_array($b)) $b = [];
    }
    return $b;
}
function str(array $a, string $k, int $max = 255): string { return mb_substr(trim((string) ($a[$k] ?? '')), 0, $max); }

/* ---------- sessions and CSRF ---------- */
function is_https(): bool { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'); }
function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('kitchens_sid');
    session_set_cookie_params(['lifetime' => 14 * 86400, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    ini_set('session.use_strict_mode', '1');
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
}
function csrf_guard(): void {
    start_session();
    if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH', 'DELETE'], true)) return;
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') === false) fail('Content-Type must be application/json', 415);
    if (!hash_equals($_SESSION['csrf'], (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) fail('Session expired, please reload the page', 403);
}

/* ---------- people and rights ---------- */
// Permission rows of the roles table: every tab except "Branches and Roles" (owner only) plus one extra row.
const TABS = ['Dashboard', 'Flow', 'Archive', 'Stages', 'Forms', 'Staff', 'Knowledge', 'Warehouse', 'Product Catalogue', 'About Us', 'Blog', 'Price offers', 'Costs', 'ToDo', 'Agents'];
const COSTS_SIT = 'Costs: add situational';
function perm_keys(): array { return [...TABS, COSTS_SIT]; }

function me(): ?array {
    static $u = false;
    if ($u === false) {
        start_session();
        $u = null;
        if (!empty($_SESSION['uid'])) {
            $row = q('SELECT u.id, u.email, u.name, u.is_owner, u.role_id, u.branch_id, r.name AS role_name, r.locked AS role_locked
                      FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.status = "active"', [$_SESSION['uid']])->fetch();
            $u = $row ?: null;
            if (!$u) unset($_SESSION['uid']);
        }
    }
    return $u;
}
function require_login(): array { $u = me(); if (!$u) fail('Please log in', 401); return $u; }

function role_perms(int $roleId): array {
    static $cache = [];
    if (!isset($cache[$roleId])) {
        $cache[$roleId] = [];
        foreach (q('SELECT perm_key, level FROM role_permissions WHERE role_id = ?', [$roleId])->fetchAll() as $r) $cache[$roleId][$r['perm_key']] = (int) $r['level'];
    }
    return $cache[$roleId];
}
// 0 none, 1 view, 2 edit. The owner and locked roles (Owner) have full rights; a person without a role (customer) has none.
function level(?array $u, string $key): int {
    if (!$u) return 0;
    if ($u['is_owner']) return 2;
    if (empty($u['role_id'])) return 0;
    if ($u['role_locked']) return 2;
    return role_perms((int) $u['role_id'])[$key] ?? 0;
}
function require_level(string $key, int $min): array {
    $u = require_login();
    if (level($u, $key) < $min) fail('You do not have access to this', 403);
    return $u;
}
function require_owner(): array { $u = require_login(); if (!$u['is_owner']) fail('Only the owner can do this', 403); return $u; }

function public_user(array $u): array {
    return ['id' => (int) $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'isOwner' => (bool) $u['is_owner'],
        'roleId' => $u['role_id'] ? (int) $u['role_id'] : null, 'roleName' => $u['role_name'] ?? null, 'branchId' => $u['branch_id'] ? (int) $u['branch_id'] : null];
}
function my_levels(?array $u): array { $o = []; foreach (perm_keys() as $k) $o[$k] = level($u, $k); return $o; }

/* ---------- tokens and links ---------- */
function new_token(): array { $t = bin2hex(random_bytes(24)); return [$t, hash('sha256', $t)]; }
function site_url(): string {
    $u = rtrim((string) cfg('site_url'), '/');
    return $u !== '' ? $u : (is_https() ? 'https' : 'http') . '://' . preg_replace('/[^a-z0-9.\-:]/i', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
}

/* ---------- brute-force protection ---------- */
function too_many_attempts(string $email): bool {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    q('DELETE FROM login_attempts WHERE at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)');
    $n = q('SELECT COUNT(*) FROM login_attempts WHERE at > (UTC_TIMESTAMP() - INTERVAL 15 MINUTE) AND (ip = ? OR email = ?)', [$ip, strtolower($email)])->fetchColumn();
    return (int) $n >= 10;
}
function note_attempt(string $email): void { q('INSERT INTO login_attempts (ip, email, at) VALUES (?, ?, UTC_TIMESTAMP())', [$_SERVER['REMOTE_ADDR'] ?? '', strtolower($email)]); }
