<?php
/* Kitchens API, phase 1: accounts, sessions, roles, branches, staff, invitations.
   One entry point: /api/index.php?a=<action>. Answers JSON only. */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/mail.php';

set_exception_handler(function (Throwable $e) {
    error_log('[kitchens] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail('Server error', 500);
});

$a = (string) ($_GET['a'] ?? '');
csrf_guard();
$b = body();

function valid_email(string $e): bool { return (bool) filter_var($e, FILTER_VALIDATE_EMAIL) && mb_strlen($e) <= 190; }
function valid_password(string $p): bool { return mb_strlen($p) >= 8 && mb_strlen($p) <= 200; }
function login_as(int $id): void { session_regenerate_id(true); $_SESSION['uid'] = $id; $_SESSION['csrf'] = bin2hex(random_bytes(24)); }
function snapshot(): array {
    $u = me();
    return ['user' => $u ? public_user($u) : null, 'levels' => my_levels($u), 'csrf' => $_SESSION['csrf'], 'permKeys' => perm_keys()];
}

switch ($a) {

/* ---------- session ---------- */
case 'me':
    out(snapshot());

case 'login': {
    $email = strtolower(str($b, 'email', 190)); $pw = (string) ($b['password'] ?? '');
    if (too_many_attempts($email)) fail('Too many attempts. Try again in 15 minutes.', 429);
    $row = q('SELECT id, pw_hash FROM users WHERE email = ? AND status = "active"', [$email])->fetch();
    if (!$row || !password_verify($pw, $row['pw_hash'])) { note_attempt($email); fail('Wrong email or password', 401); }
    if (password_needs_rehash($row['pw_hash'], PASSWORD_DEFAULT)) q('UPDATE users SET pw_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $row['id']]);
    login_as((int) $row['id']);
    out(snapshotFresh());
}

case 'register': {
    $name = str($b, 'name', 120); $email = strtolower(str($b, 'email', 190)); $pw = (string) ($b['password'] ?? '');
    if ($name === '' || !valid_email($email)) fail('Enter your name and a valid email');
    if (!valid_password($pw)) fail('The password must have at least 8 characters');
    if (too_many_attempts($email)) fail('Too many attempts. Try again in 15 minutes.', 429);
    note_attempt($email);
    if (q('SELECT 1 FROM users WHERE email = ?', [$email])->fetch()) fail('This email is already registered');
    if (q('SELECT 1 FROM users WHERE name = ?', [$name])->fetch()) fail('This name is taken, please choose another');
    $pdo = db(); $pdo->beginTransaction();
    // The very first account of the whole site becomes the owner (same rule as in the prototype).
    $hasOwner = (bool) q('SELECT 1 FROM users WHERE is_owner = 1 FOR UPDATE')->fetch();
    q('INSERT INTO users (email, name, pw_hash, is_owner) VALUES (?, ?, ?, ?)', [$email, $name, password_hash($pw, PASSWORD_DEFAULT), $hasOwner ? 0 : 1]);
    $id = (int) $pdo->lastInsertId();
    $pdo->commit();
    login_as($id);
    out(snapshotFresh());
}

case 'logout':
    $_SESSION = [];
    session_destroy();
    out(['ok' => true]);

/* ---------- roles and branches (owner only to change, everyone logged in may read the names) ---------- */
case 'roles': {
    require_login();
    $roles = q('SELECT id, name, locked FROM roles ORDER BY locked DESC, name')->fetchAll();
    $perms = [];
    foreach (q('SELECT role_id, perm_key, level FROM role_permissions')->fetchAll() as $p) $perms[(int) $p['role_id']][$p['perm_key']] = (int) $p['level'];
    foreach ($roles as &$r) { $r['id'] = (int) $r['id']; $r['locked'] = (bool) $r['locked']; $r['perms'] = (object) ($perms[$r['id']] ?? []); }
    out(['roles' => $roles]);
}
case 'role_save': {
    require_owner();
    $id = (int) ($b['id'] ?? 0); $name = str($b, 'name', 120);
    if ($name === '') fail('Enter a role name');
    if ($id) {
        $r = q('SELECT locked FROM roles WHERE id = ?', [$id])->fetch();
        if (!$r) fail('Role not found', 404);
        if ($r['locked']) fail('The Owner role cannot be changed');
        if (q('SELECT 1 FROM roles WHERE name = ? AND id <> ?', [$name, $id])->fetch()) fail('A role with this name already exists');
        q('UPDATE roles SET name = ? WHERE id = ?', [$name, $id]);
    } else {
        if (q('SELECT 1 FROM roles WHERE name = ?', [$name])->fetch()) fail('A role with this name already exists');
        q('INSERT INTO roles (name) VALUES (?)', [$name]);
        $id = (int) db()->lastInsertId();
    }
    if (isset($b['perms']) && is_array($b['perms'])) {
        $ok = perm_keys();
        foreach ($b['perms'] as $k => $lv) {
            if (!in_array($k, $ok, true)) continue;
            $lv = max(0, min(2, (int) $lv));
            q('INSERT INTO role_permissions (role_id, perm_key, level) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE level = VALUES(level)', [$id, $k, $lv]);
        }
    }
    out(['ok' => true, 'id' => $id]);
}
case 'role_delete': {
    require_owner();
    $id = (int) ($b['id'] ?? 0);
    $r = q('SELECT locked FROM roles WHERE id = ?', [$id])->fetch();
    if (!$r) fail('Role not found', 404);
    if ($r['locked']) fail('The Owner role cannot be deleted');
    if (q('SELECT COUNT(*) FROM users WHERE role_id = ?', [$id])->fetchColumn() > 0) fail('Some employees still have this role. Change their role first.');
    q('DELETE FROM roles WHERE id = ?', [$id]);
    out(['ok' => true]);
}
case 'branches': {
    require_login();
    $rows = q('SELECT id, name, city, address, phone, manager FROM branches ORDER BY name')->fetchAll();
    foreach ($rows as &$r) $r['id'] = (int) $r['id'];
    out(['branches' => $rows]);
}
case 'directory': { // names of the team (employees + owner), for pickers; any logged-in person may read it
    require_login();
    $rows = q('SELECT name, role_id, is_owner FROM users WHERE status = "active" AND (role_id IS NOT NULL OR is_owner = 1) ORDER BY name')->fetchAll();
    out(['people' => array_map(fn($r) => ['name' => $r['name'], 'roleId' => $r['role_id'] ? (int) $r['role_id'] : null, 'isOwner' => (bool) $r['is_owner']], $rows)]);
}
case 'branch_save': {
    require_owner();
    $id = (int) ($b['id'] ?? 0); $name = str($b, 'name', 160);
    $f = [$name, str($b, 'city', 120), str($b, 'address', 255), str($b, 'phone', 60), str($b, 'manager', 120)];
    if ($name === '') fail('Enter a branch name');
    if ($id) q('UPDATE branches SET name = ?, city = ?, address = ?, phone = ?, manager = ? WHERE id = ?', [...$f, $id]);
    else { q('INSERT INTO branches (name, city, address, phone, manager) VALUES (?, ?, ?, ?, ?)', $f); $id = (int) db()->lastInsertId(); }
    out(['ok' => true, 'id' => $id]);
}
case 'branch_delete': {
    require_owner();
    q('DELETE FROM branches WHERE id = ?', [(int) ($b['id'] ?? 0)]);
    out(['ok' => true]);
}

/* ---------- staff ---------- */
case 'staff': {
    require_level('Staff', 1);
    $rows = q('SELECT u.id, u.name, u.email, u.is_owner, u.role_id, u.branch_id, u.status, r.name AS role_name
               FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.role_id IS NOT NULL OR u.is_owner = 1 ORDER BY u.name')->fetchAll();
    $inv = q('SELECT id, name, email, role_id, branch_id, expires_at FROM invitations WHERE used_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY id DESC')->fetchAll();
    out(['staff' => $rows, 'invitations' => $inv]);
}
case 'staff_update': {
    $me = require_level('Staff', 2);
    $id = (int) ($b['id'] ?? 0);
    $t = q('SELECT id, is_owner FROM users WHERE id = ?', [$id])->fetch();
    if (!$t) fail('Person not found', 404);
    if ($t['is_owner']) fail('The owner cannot be changed here');
    $roleId = (int) ($b['roleId'] ?? 0);
    if ($roleId && !q('SELECT 1 FROM roles WHERE id = ? AND locked = 0', [$roleId])->fetch()) fail('Unknown role');
    $branchId = (int) ($b['branchId'] ?? 0);
    $status = ($b['status'] ?? 'active') === 'disabled' ? 'disabled' : 'active';
    q('UPDATE users SET role_id = ?, branch_id = ?, status = ? WHERE id = ?', [$roleId ?: null, $branchId ?: null, $status, $id]);
    out(['ok' => true]);
}
case 'staff_delete': {
    $me = require_level('Staff', 2);
    $id = (int) ($b['id'] ?? 0);
    $t = q('SELECT is_owner FROM users WHERE id = ?', [$id])->fetch();
    if (!$t) fail('Person not found', 404);
    if ($t['is_owner'] || $id === (int) $me['id']) fail('This person cannot be removed');
    q('DELETE FROM users WHERE id = ?', [$id]);
    out(['ok' => true]);
}
case 'invite': {
    $me = require_level('Staff', 2);
    $email = strtolower(str($b, 'email', 190)); $name = str($b, 'name', 120); $roleId = (int) ($b['roleId'] ?? 0); $branchId = (int) ($b['branchId'] ?? 0);
    if (!valid_email($email)) fail('Enter a valid email');
    if (!q('SELECT 1 FROM roles WHERE id = ? AND locked = 0', [$roleId])->fetch()) fail('Choose a role');
    if (q('SELECT 1 FROM users WHERE email = ?', [$email])->fetch()) fail('This email is already registered');
    q('UPDATE invitations SET used_at = UTC_TIMESTAMP() WHERE email = ? AND used_at IS NULL', [$email]); // a new invitation replaces older open ones
    [$token, $hash] = new_token();
    q('INSERT INTO invitations (token_hash, email, name, role_id, branch_id, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL 14 DAY)',
      [$hash, $email, $name, $roleId, $branchId ?: null, $me['id']]);
    $link = site_url() . '/#invite/' . $token;
    [$sent, $why] = send_mail($email, 'Invitation to Kitchens',
        ($name !== '' ? "Hello, $name!\n\n" : "Hello!\n\n") . "{$me['name']} invites you to join the team. Open this link, choose your password and start working:\n\n$link\n\nThe link is valid for 14 days.");
    out(['ok' => true, 'link' => $link, 'emailed' => $sent, 'emailError' => $sent ? '' : $why]);
}
case 'invite_cancel': {
    require_level('Staff', 2);
    q('UPDATE invitations SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL', [(int) ($b['id'] ?? 0)]);
    out(['ok' => true]);
}
case 'invite_info': {
    $token = (string) ($_GET['t'] ?? '');
    $r = q('SELECT i.email, i.name, r.name AS role_name FROM invitations i JOIN roles r ON r.id = i.role_id
            WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > UTC_TIMESTAMP()', [hash('sha256', $token)])->fetch();
    if (!$r) fail('This invitation link is not valid any more', 404);
    out($r);
}
case 'invite_accept': {
    $token = (string) ($b['token'] ?? ''); $pw = (string) ($b['password'] ?? ''); $name = str($b, 'name', 120);
    if (!valid_password($pw)) fail('The password must have at least 8 characters');
    $pdo = db(); $pdo->beginTransaction();
    $i = q('SELECT * FROM invitations WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [hash('sha256', $token)])->fetch();
    if (!$i) { $pdo->rollBack(); fail('This invitation link is not valid any more', 404); }
    $name = $name !== '' ? $name : $i['name'];
    if ($name === '') { $pdo->rollBack(); fail('Enter your name'); }
    if (q('SELECT 1 FROM users WHERE email = ?', [$i['email']])->fetch()) { $pdo->rollBack(); fail('This email is already registered'); }
    if (q('SELECT 1 FROM users WHERE name = ?', [$name])->fetch()) { $pdo->rollBack(); fail('This name is taken, please choose another'); }
    q('INSERT INTO users (email, name, pw_hash, role_id, branch_id) VALUES (?, ?, ?, ?, ?)', [$i['email'], $name, password_hash($pw, PASSWORD_DEFAULT), $i['role_id'], $i['branch_id']]);
    $id = (int) $pdo->lastInsertId();
    q('UPDATE invitations SET used_at = UTC_TIMESTAMP() WHERE id = ?', [$i['id']]);
    $pdo->commit();
    login_as($id);
    out(snapshotFresh());
}


/* ---------- editable site pages (the Home page): public to read, owner only to change ---------- */
case 'page_get': {
    $slug = preg_replace('/[^a-z0-9\-]/', '', strtolower((string) ($_GET['slug'] ?? '')));
    $r = q('SELECT content, updated_at FROM site_pages WHERE slug = ?', [$slug])->fetch();
    out(['blocks' => $r ? (json_decode($r['content'], true)['blocks'] ?? []) : [], 'updatedAt' => $r['updated_at'] ?? null]);
}
case 'page_save': {
    $me = require_owner();
    $slug = preg_replace('/[^a-z0-9\-]/', '', strtolower(str($b, 'slug', 60)));
    if ($slug !== 'home') fail('Unknown page');
    $blocks = $b['blocks'] ?? null;
    if (!is_array($blocks) || count($blocks) > 60) fail('Too many blocks');
    // images are kept as data: URLs (a regex on multi-megabyte strings can fail, so check the prefix and the alphabet instead)
    $okSrc = function ($s) {
        if (!is_string($s)) return false;
        if ($s === '') return true;
        if (preg_match('#^data:image/(jpeg|png|webp|gif);base64,#', $s, $m)) { $d = substr($s, strlen($m[0])); return strspn($d, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=') === strlen($d); }
        return (bool) preg_match('#^https?://\S+$#', $s);
    };
    $clean = [];
    foreach ($blocks as $k) {
        if (!is_array($k)) continue;
        $gallery = array_values(array_filter((array) ($k['gallery'] ?? []), $okSrc));
        $docs = [];
        foreach ((array) ($k['docs'] ?? []) as $d) {
            if (is_array($d) && is_string($d['data'] ?? null) && str_starts_with($d['data'], 'data:'))
                $docs[] = ['id' => substr((string) ($d['id'] ?? ''), 0, 40), 'name' => mb_substr((string) ($d['name'] ?? 'file'), 0, 200), 'size' => (int) ($d['size'] ?? 0), 'type' => mb_substr((string) ($d['type'] ?? ''), 0, 100), 'data' => $d['data']];
        }
        $hero = $okSrc($k['hero'] ?? '') ? (string) ($k['hero'] ?? '') : '';
        $clean[] = ['id' => substr(preg_replace('/[^A-Za-z0-9_\-]/', '', (string) ($k['id'] ?? '')), 0, 40) ?: bin2hex(random_bytes(4)),
            'title' => mb_substr((string) ($k['title'] ?? ''), 0, 200), 'html' => mb_substr((string) ($k['html'] ?? ''), 0, 200000),
            'hero' => $hero, 'gallery' => $gallery, 'docs' => $docs, 'video' => mb_substr((string) ($k['video'] ?? ''), 0, 300), 'visible' => !empty($k['visible'])];
    }
    $json = json_encode(['blocks' => $clean], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($json) > 12 * 1024 * 1024) fail('The page is too large. Remove some images.', 413);
    q('INSERT INTO site_pages (slug, content, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content), updated_by = VALUES(updated_by)', [$slug, $json, $me['id']]);
    out(['ok' => true]);
}
default:
    fail('Unknown action', 404);
}

/* me() caches its answer for the request, so after a login we read the user again. */
function snapshotFresh(): array {
    $row = q('SELECT u.id, u.email, u.name, u.is_owner, u.role_id, u.branch_id, r.name AS role_name, r.locked AS role_locked
              FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [$_SESSION['uid']])->fetch() ?: null;
    return ['user' => $row ? public_user($row) : null, 'levels' => my_levels($row), 'csrf' => $_SESSION['csrf'], 'permKeys' => perm_keys()];
}
