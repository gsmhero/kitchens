<?php
/* Creates / updates the database tables. Safe to run on every deploy (everything is IF NOT EXISTS).
   Run from the command line only: php api/migrate.php */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/lib/bootstrap.php';

$T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
$sql = [
"CREATE TABLE IF NOT EXISTS branches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  address VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) $T",
"CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  locked TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_name (name)
) $T",
"CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  perm_key VARCHAR(80) NOT NULL,
  level TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (role_id, perm_key),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) $T",
"CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(120) NOT NULL,
  pw_hash VARCHAR(255) NOT NULL,
  is_owner TINYINT(1) NOT NULL DEFAULT 0,
  role_id INT UNSIGNED NULL,
  branch_id INT UNSIGNED NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_email (email),
  UNIQUE KEY uq_user_name (name),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) $T",
"CREATE TABLE IF NOT EXISTS invitations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT '',
  role_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NULL,
  invited_by INT UNSIGNED NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inv_token (token_hash),
  KEY ix_inv_email (email),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) $T",
"CREATE TABLE IF NOT EXISTS login_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(64) NOT NULL,
  email VARCHAR(190) NOT NULL,
  at DATETIME NOT NULL,
  KEY ix_la_at (at), KEY ix_la_ip (ip), KEY ix_la_email (email)
) $T",
"CREATE TABLE IF NOT EXISTS site_pages (
  slug VARCHAR(60) NOT NULL PRIMARY KEY,
  content LONGTEXT NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) $T",
"CREATE TABLE IF NOT EXISTS kv (
  k VARCHAR(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  v LONGTEXT NULL,
  rev BIGINT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_kv_rev (rev)
) $T",
"CREATE TABLE IF NOT EXISTS kv_counter (n BIGINT UNSIGNED NOT NULL) $T",
];
foreach ($sql as $s) db()->exec($s);

// columns added after the first release (checked first: MySQL has no ADD COLUMN IF NOT EXISTS)
function add_column(string $table, string $col, string $def): void {
    $has = q('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', [$table, $col])->fetch();
    if (!$has) db()->exec("ALTER TABLE `$table` ADD COLUMN `$col` $def");
}
add_column('branches', 'city', "VARCHAR(120) NOT NULL DEFAULT ''");
add_column('branches', 'phone', "VARCHAR(60) NOT NULL DEFAULT ''");
add_column('branches', 'manager', "VARCHAR(120) NOT NULL DEFAULT ''");

if (!q('SELECT 1 FROM kv_counter')->fetch()) q('INSERT INTO kv_counter (n) VALUES (0)');

// The built-in Owner role (full rights, cannot be edited or deleted).
if (!q('SELECT 1 FROM roles WHERE locked = 1 LIMIT 1')->fetch()) q('INSERT INTO roles (name, locked) VALUES ("Owner", 1)');
if (!q('SELECT 1 FROM branches LIMIT 1')->fetch()) q('INSERT INTO branches (name) VALUES ("Main branch")');

echo "Migration finished. Tables: " . db()->query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchColumn() . PHP_EOL;
