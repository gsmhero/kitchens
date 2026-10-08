<?php
/* Shared data store ("kv"): the data the pages used to keep in the browser (profiles, blog, catalogue, offers, tasks, messages,
   notifications, requests …) lives here as one JSON document per key.
   - every key has access rules (who may read / write it); readers may get a filtered view (guests see only published things)
   - writes carry the value the writer started from ("base") so that two people editing at once are MERGED (by item id), not overwritten
   Keys: profiles blog catalogue forms formSubs stages offers costs tasks knowledge warehouse messages  notifs:<name>  request:<name>:form|subs */
declare(strict_types=1);

/* ---------- JSON helpers ---------- */
// An empty JSON object {} must stay {} (PHP arrays cannot tell it from []), so it is read as a JEmpty marker and written back as {}.
class JEmpty {}
function kv_conv($v) {
    if ($v instanceof stdClass) {
        $a = (array) $v;
        if (!$a) return new JEmpty();
        foreach ($a as $k => $x) $a[$k] = kv_conv($x);
        return $a;
    }
    if (is_array($v)) { foreach ($v as $k => $x) $v[$k] = kv_conv($x); }
    return $v;
}
function kv_decode(?string $s) { return ($s === null || $s === '') ? null : kv_conv(json_decode($s, false)); }
function kv_encode($v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION); }
function jeq($a, $b): bool { return $a === $b || kv_encode($a) === kv_encode($b); }
function has_ids($a): bool {
    if (!is_array($a) || !array_is_list($a)) return false;
    foreach ($a as $x) if (!is_array($x) || !isset($x['id']) || !is_scalar($x['id'])) return false;
    return true;
}
function arr($x): array { return is_array($x) ? $x : []; }
function by_id(array $a): array { $o = []; foreach ($a as $x) $o[(string) $x['id']] = $x; return $o; }

/* ---------- three-way merge: result = their current value + the changes I made since "base" ---------- */
function merge3($base, $mine, $theirs) {
    if (jeq($mine, $base)) return $theirs;          // I changed nothing
    if (jeq($theirs, $base)) return $mine;          // nobody else changed anything
    if (!is_array($mine) || !is_array($theirs)) return $mine;
    $b = is_array($base) ? $base : [];
    if (has_ids($mine) && has_ids($theirs) && (has_ids($b) || $b === [])) { // lists of items with ids: merge item by item
        $out = merge_map(by_id($b), by_id($mine), by_id($theirs));
        return array_values($out);
    }
    if (array_is_list($mine) || array_is_list($theirs)) return $mine; // other lists: my version
    $r = merge_map($b, $mine, $theirs);            // objects: key by key
    return $r ?: (object) [];
}
function merge_map(array $b, array $m, array $t): array {
    $out = [];
    $keys = array_unique([...array_keys($t), ...array_keys($m), ...array_keys($b)], SORT_REGULAR);
    foreach ($keys as $k) {
        $inB = array_key_exists($k, $b); $inM = array_key_exists($k, $m); $inT = array_key_exists($k, $t);
        if ($inM) {
            $changed = !$inB || !jeq($m[$k], $b[$k]);
            if ($changed) $out[$k] = $inT ? merge3($inB ? $b[$k] : null, $m[$k], $t[$k]) : $m[$k];
            elseif ($inT) $out[$k] = $t[$k];
        } elseif ($inB) {                           // I removed it
            if ($inT && !jeq($t[$k], $b[$k])) $out[$k] = $t[$k]; // ...but somebody changed it meanwhile: keep it
        } elseif ($inT) {
            $out[$k] = $t[$k];
        }
    }
    return $out;
}
// only add new items (by id) to a list; nothing existing is touched
function add_only($theirs, $mine) {
    $t = is_array($theirs) ? $theirs : []; $seen = has_ids($t) ? by_id($t) : [];
    if (is_array($mine) && has_ids($mine)) foreach ($mine as $x) if (!isset($seen[(string) $x['id']])) $t[] = $x;
    return array_values($t);
}
// a guest may add requests and write comments on a request page: nothing else changes
function guest_comments($theirs, $merged) {
    if (!is_array($theirs) || !is_array($merged)) return $theirs;
    if (array_is_list($theirs)) {
        if (!has_ids($theirs) || !has_ids($merged)) return $theirs;
        $mm = by_id($merged); $out = [];
        foreach ($theirs as $x) $out[] = isset($mm[(string) $x['id']]) ? guest_comments($x, $mm[(string) $x['id']]) : $x;
        return $out;
    }
    $out = $theirs;
    foreach ($theirs as $k => $v) {
        if (!array_key_exists($k, $merged)) continue;
        if ($k === 'comments' && is_array($v) && is_array($merged[$k])) {
            $seen = has_ids($v) ? by_id($v) : [];
            $add = [];
            if (has_ids($merged[$k])) foreach ($merged[$k] as $c) if (!isset($seen[(string) $c['id']]) && !empty($c['client'])) $add[] = $c;
            $out[$k] = array_values([...$v, ...$add]);
        } elseif (is_array($v)) $out[$k] = guest_comments($v, $merged[$k]);
    }
    return $out;
}

// an empty "object" document must stay {} (PHP would write [])
function kv_norm(string $key, $v) { return ($key === 'profiles' && $v === []) ? (object) [] : $v; }

/* ---------- access rules ---------- */
function is_staff(?array $u): bool { return $u && ($u['is_owner'] || !empty($u['role_id'])); }
function key_name(string $key): string { return preg_match('/^(?:notifs|request):(.+?)(?::(?:form|subs))?$/u', $key, $m) ? rawurldecode($m[1]) : ''; }

// returns null when the key is not managed, else [readMode, writeMode]
//   readMode : 'none' | 'all' | 'filtered'      writeMode: 'none' | 'full' | 'addonly' | 'guest' | 'costs-own' | 'messages'
function kv_rules(string $key, ?array $u): ?array {
    $L = fn($k) => level($u, $k);
    $staff = is_staff($u);
    $name = $u['name'] ?? null;
    switch ($key) {
        case 'profiles':  return [$staff ? 'all' : 'filtered', $staff ? 'full' : 'none'];
        case 'blog':      return [$L('Blog') >= 1 ? 'all' : 'filtered', $L('Blog') >= 2 ? 'full' : 'none'];
        case 'catalogue': return [$L('Product Catalogue') >= 1 ? 'all' : 'filtered', $L('Product Catalogue') >= 2 ? 'full' : 'none'];
        case 'forms':     return [$staff ? 'all' : 'none', $L('Forms') >= 2 ? 'full' : 'none'];
        case 'formSubs':  return [$staff ? 'all' : 'none', $staff ? 'full' : 'none'];
        case 'stages':    return [$staff ? 'all' : 'none', $L('Stages') >= 2 ? 'full' : 'none'];
        case 'offers':    return [max($L('Price offers'), $L('Flow')) >= 1 ? 'all' : 'none', max($L('Price offers'), $L('Flow')) >= 2 ? 'full' : 'none'];
        case 'tasks':     return [$L('ToDo') >= 1 ? 'all' : 'none', $L('ToDo') >= 1 ? 'full' : 'none'];
        case 'knowledge': return [$L('Knowledge') >= 1 ? 'all' : 'none', $L('Knowledge') >= 2 ? 'full' : 'none'];
        case 'warehouse': return [$L('Warehouse') >= 1 ? 'all' : 'none', $L('Warehouse') >= 2 ? 'full' : 'none'];
        case 'costs':
            if ($L('Costs') >= 1) return ['all', $L('Costs') >= 2 ? 'full' : 'none'];
            if ($L(COSTS_SIT) >= 2) return ['filtered', 'costs-own'];
            return ['none', 'none'];
        case 'messages':  return [$u ? 'filtered' : 'none', $u ? 'messages' : 'none'];
    }
    if (preg_match('/^notifs:/', $key)) {
        $mine = $u && key_name($key) === $name;
        return [$mine ? 'all' : 'none', $mine ? 'full' : 'addonly'];
    }
    if (preg_match('/^request:.+:form$/', $key)) {
        $mine = $u && key_name($key) === $name;
        return ['all', ($mine || $L('Forms') >= 2) ? 'full' : 'none'];
    }
    if (preg_match('/^request:.+:subs$/', $key)) {
        $mine = $u && key_name($key) === $name;
        $flow = $L('Flow');
        return [($mine || $flow >= 1) ? 'all' : 'none', ($mine || $flow >= 2) ? 'full' : ($u ? 'addonly' : 'guest')];
    }
    return null;
}

/* ---------- filtered views ---------- */
function kv_view(string $key, ?array $u, $val) {
    if ($val === null) return null;
    $today = gmdate('Y-m-d');
    switch ($key) {
        case 'profiles':
            return kv_norm('profiles', array_filter($val, fn($p) => is_array($p) && !empty($p['published'])));
        case 'blog':
            $val['posts'] = array_values(array_filter($val['posts'] ?? [], fn($p) => !empty($p['published']) && ($p['date'] ?? '9999') <= $today));
            return $val;
        case 'catalogue':
            $val['products'] = array_values(array_filter($val['products'] ?? [], fn($p) => !empty($p['published'])));
            return $val;
        case 'costs': // somebody who may only add situational costs sees just their own
            $val['constants'] = [];
            $val['situational'] = array_values(array_filter($val['situational'] ?? [], fn($s) => ($s['by'] ?? '') === ($u['name'] ?? '')));
            return $val;
        case 'messages':
            $val['convs'] = array_filter(arr($val['convs'] ?? []), fn($c, $id) => in_array($u['name'] ?? '', explode('|', (string) $id), true), ARRAY_FILTER_USE_BOTH);
            if (!$val['convs']) $val['convs'] = (object) [];
            return $val;
    }
    return $val;
}

/* ---------- storage ---------- */
function kv_row(string $key): ?array { return q('SELECT k, v, rev FROM kv WHERE k = ?', [$key])->fetch() ?: null; }
function kv_next_rev(): int { q('UPDATE kv_counter SET n = LAST_INSERT_ID(n + 1)'); return (int) db()->lastInsertId(); }

function kv_read(string $key, ?array $u): ?array { // [json string or null, rev]
    $rules = kv_rules($key, $u);
    if (!$rules || $rules[0] === 'none') return null;
    $row = kv_row($key);
    if (!$row || $row['v'] === null) return ['v' => null, 'rev' => $row ? (int) $row['rev'] : 0];
    $val = kv_decode($row['v']);
    if ($rules[0] === 'filtered') $val = kv_view($key, $u, $val);
    return ['v' => kv_encode($val), 'rev' => (int) $row['rev']];
}

// every key the person may read, changed after $since
function kv_changes(?array $u, int $since): array {
    $out = []; $max = $since;
    foreach (q('SELECT k, rev FROM kv WHERE rev > ? ORDER BY rev', [$since])->fetchAll() as $r) {
        $max = max($max, (int) $r['rev']);
        $res = kv_read($r['k'], $u);
        if ($res) $out[$r['k']] = $res;
    }
    return ['items' => (object) $out, 'rev' => $max];
}

// apply one change; returns the person's view of the stored value after the change
function kv_write(string $key, ?string $baseJson, ?string $mineJson, ?array $u): array {
    $rules = kv_rules($key, $u);
    if (!$rules) throw new RuntimeException('This data cannot be saved here');
    $mode = $rules[1];
    if ($mode === 'none') throw new RuntimeException('You do not have the right to change this');
    if (strlen((string) $mineJson) > 12 * 1024 * 1024) throw new RuntimeException('Too much data');
    $pdo = db(); $pdo->beginTransaction();
    try {
        $row = q('SELECT v, rev FROM kv WHERE k = ? FOR UPDATE', [$key])->fetch();
        $theirs = $row ? kv_decode($row['v']) : null;
        $base = kv_decode($baseJson); $mine = kv_decode($mineJson);
        if ($mineJson !== null && $mine === null && trim($mineJson) !== 'null') throw new RuntimeException('Bad data');
        $result = $theirs;
        switch ($mode) {
            case 'full':
                $result = $mineJson === null ? ($theirs === null ? null : merge3($base, null, $theirs)) : merge3($base, $mine, $theirs);
                if ($mineJson === null && $theirs !== null && jeq($base, $theirs)) $result = null; // plain delete of an untouched value
                if ($key === 'profiles' && is_array($result)) { // without the About Us Edit right a person changes only their own profile
                    if (level($u, 'About Us') < 2) foreach ($result as $slug => $p) {
                        $old = is_array($theirs) ? ($theirs[$slug] ?? null) : null;
                        if (!jeq($p, $old) && (($p['owner'] ?? null) !== ($u['name'] ?? ''))) { if ($old === null) unset($result[$slug]); else $result[$slug] = $old; }
                    }
                    if (level($u, 'About Us') < 2 && is_array($theirs)) foreach ($theirs as $slug => $p) if (!isset($result[$slug]) && ($p['owner'] ?? null) !== ($u['name'] ?? '')) $result[$slug] = $p;
                }
                break;
            case 'addonly': $result = add_only($theirs, $mine); break;
            case 'guest':
                $merged = merge3($base, $mine, $theirs);
                $result = guest_comments(add_only($theirs, $mine), $merged);
                break;
            case 'costs-own': {
                $result = is_array($theirs) ? $theirs : ['constants' => [], 'situational' => []];
                $seen = has_ids($result['situational'] ?? []) ? by_id($result['situational']) : [];
                foreach (($mine['situational'] ?? []) as $s) if (is_array($s) && isset($s['id']) && ($s['by'] ?? '') === $u['name'] && !isset($seen[(string) $s['id']])) $result['situational'][] = $s;
                break;
            }
            case 'messages': {
                $myConvs = array_filter(arr(is_array($mine) ? ($mine['convs'] ?? []) : []), fn($c, $id) => in_array($u['name'], explode('|', (string) $id), true), ARRAY_FILTER_USE_BOTH);
                $baseConvs = array_filter(arr(is_array($base) ? ($base['convs'] ?? []) : []), fn($c, $id) => in_array($u['name'], explode('|', (string) $id), true), ARRAY_FILTER_USE_BOTH);
                $tConvs = is_array($theirs) ? ($theirs['convs'] ?? []) : [];
                $result = is_array($theirs) ? $theirs : [];
                $result['convs'] = merge_map($baseConvs, $myConvs, is_array($tConvs) ? $tConvs : []);
                if (!$result['convs']) $result['convs'] = (object) [];
                break;
            }
        }
        $rev = kv_next_rev();
        $result = kv_norm($key, $result);
        $json = $result === null ? null : kv_encode($result);
        q('INSERT INTO kv (k, v, rev, updated_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), rev = VALUES(rev), updated_by = VALUES(updated_by)', [$key, $json, $rev, $u['id'] ?? null]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    $view = $json === null ? null : $result;
    if ($view !== null && $rules[0] === 'filtered') $view = kv_view($key, $u, $view);
    if ($rules[0] === 'none') $view = null;
    return ['rev' => $rev, 'v' => $view === null ? null : kv_encode($view)];
}

/* ---------- a client opens the link of its own request (#share/<id>) ---------- */
function kv_share(string $id): ?array {
    if ($id === '' || !preg_match('/^[A-Za-z0-9_\-]{3,60}$/', $id)) return null;
    foreach (q('SELECT k, v FROM kv WHERE k LIKE "request:%:subs" AND v LIKE ?', ['%' . $id . '%'])->fetchAll() as $r) {
        $subs = kv_decode($r['v']);
        if (!has_ids($subs ?? [])) continue;
        foreach ($subs as $s) {
            if ((string) $s['id'] !== $id) continue;
            $offerIds = [];
            array_walk_recursive($s, function ($v, $k) use (&$offerIds) { if ($k === 'offerId' && $v) $offerIds[] = (string) $v; });
            $offers = [];
            $row = kv_row('offers'); $all = $row ? kv_decode($row['v']) : null;
            if (is_array($all) && has_ids($all['offers'] ?? [])) foreach ($all['offers'] as $o) if (in_array((string) $o['id'], $offerIds, true)) $offers[] = $o;
            return ['key' => $r['k'], 'sub' => $s, 'offers' => $offers];
        }
    }
    return null;
}
