<?php
require __DIR__ . '/config.php';

session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'path' => '/']);
session_start();

// ---------- أدوات ----------
function db(): PDO {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    }
    return $pdo;
}

function out($data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): never { out(['error' => $msg], $code); }

function body(): array {
    $d = json_decode(file_get_contents('php://input') ?: '', true);
    return is_array($d) ? $d : [];
}

function require_post(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('method not allowed', 405);
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') fail('bad request', 403); 
}

function require_admin(): void {
    if (empty($_SESSION['admin_id'])) fail('غير مصرح', 401);
}

function save_image(string $dataUrl, string $dir, int $maxBytes = 1_000_000): string {
    if (!preg_match('#^data:image/(?:jpeg|png|webp);base64,(.+)$#s', $dataUrl, $m)) fail('صورة غير صالحة');
    $bin = base64_decode($m[1], true);
    if ($bin === false || strlen($bin) > $maxBytes) fail('الصورة كبيرة جداً');
    $info = @getimagesizefromstring($bin);
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($types[$info[2]])) fail('صورة غير صالحة');
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = bin2hex(random_bytes(16)) . '.' . $types[$info[2]];
    file_put_contents($dir . '/' . $name, $bin);
    return $name;
}

function delete_file(?string $dir, ?string $name): void {
    if (!$name) return;
    $path = $dir . '/' . basename($name);
    if (is_file($path)) @unlink($path);
}

function product_row(array $r): array {
    return [
        'id'        => (string)$r['id'],
        'name'      => $r['name'],
        'cat'       => $r['cat'],
        'cond'      => $r['cond_type'],
        'price'     => (float)$r['price'],
        'desc'      => (string)$r['description'],
        'img'       => $r['img'] ? PRODUCT_IMG_URL . $r['img'] : '',
        'available' => (bool)$r['available'],
        'createdAt' => (int)$r['ts'] * 1000,
    ];
}

function order_row(array $r): array {
    return [
        'id'          => (string)$r['id'],
        'time'        => (int)$r['ts'] * 1000,
        'productId'   => $r['product_id'] !== null ? (string)$r['product_id'] : '',
        'productName' => $r['product_name'],
        'price'       => (float)$r['price'],
        'name'        => $r['name'],
        'phone'       => $r['phone'],
        'altPhone'    => $r['alt_phone'],
        'gov'         => $r['gov'],
        'city'        => $r['city'],
        'address'     => $r['address'],
        'pay'         => $r['pay'],
        'payTo'       => $r['pay_to'],
        'receipt'     => $r['receipt_file'] ? 'api.php?action=receipt&id=' . $r['id'] : '',
        'done'        => (bool)$r['done'],
    ];
}

$action = $_GET['action'] ?? '';

try {
    switch ($action) {

    case 'products': {
        $rows = db()->query('SELECT *, UNIX_TIMESTAMP(created_at) AS ts FROM products ORDER BY created_at DESC, id DESC')->fetchAll();
        out(array_map('product_row', $rows));
    }

    case 'pay_accounts':
        out(PAY_ACCOUNTS);

    case 'me':
        out(['admin' => !empty($_SESSION['admin_id']), 'email' => $_SESSION['admin_email'] ?? null]);

    case 'create_order': {
        require_post();
        $d = body();

        $name    = trim(preg_replace('/\s+/u', ' ', (string)($d['name'] ?? '')));
        $phone   = (string)($d['phone'] ?? '');
        $alt     = (string)($d['altPhone'] ?? '');
        $gov     = (string)($d['gov'] ?? '');
        $city    = trim(preg_replace('/\s+/u', ' ', (string)($d['city'] ?? '')));
        $address = trim((string)($d['address'] ?? ''));
        $pay     = (string)($d['pay'] ?? '');
        $receipt = (string)($d['receipt'] ?? '');
        $pid     = (int)($d['productId'] ?? 0);

        if (count(explode(' ', $name)) < 4 || mb_strlen($name) > 200) fail('اكتب الاسم رباعي');
        if (!preg_match('/^01[0125]\d{8}$/', $phone)) fail('رقم التليفون غير صحيح');
        if (!preg_match('/^01[0125]\d{8}$/', $alt)) fail('رقم التليفون البديل غير صحيح');
        if ($alt === $phone) fail('الرقم البديل لازم يكون مختلف عن الأساسي');
        if (!in_array($gov, GOVERNORATES, true)) fail('اختار المحافظة');
        if (mb_strlen($city) < 3 || mb_strlen($city) > 120) fail('اكتب اسم المدينة أو المركز');
        if (mb_strlen($address) < 10 || mb_strlen($address) > 500) fail('اكتب العنوان بالتفصيل');
        if (!isset(PAY_ACCOUNTS[$pay])) fail('اختار طريقة الدفع');
        if ($receipt === '') fail('ارفع صورة إيصال التحويل');

        $st = db()->prepare('SELECT * FROM products WHERE id = ?');
        $st->execute([$pid]);
        $p = $st->fetch();
        if (!$p || !$p['available']) fail('المنتج ده بقى غير متاح حالياً');

        
        $ip = substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45);
        $st = db()->prepare('SELECT COUNT(*) FROM orders WHERE ip = ? AND created_at > (NOW() - INTERVAL 10 MINUTE)');
        $st->execute([$ip]);
        if ((int)$st->fetchColumn() >= 5) fail('طلبات كتير في وقت قصير، جرّب بعد شوية', 429);

        $file = save_image($receipt, RECEIPT_DIR);

        $st = db()->prepare(
            'INSERT INTO orders (product_id, product_name, price, name, phone, alt_phone, gov, city, address, pay, pay_to, receipt_file, ip)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
        );
        $st->execute([$p['id'], $p['name'], $p['price'], $name, $phone, $alt, $gov, $city, $address,
                      $pay, PAY_ACCOUNTS[$pay]['number'], $file, $ip]);
        out(['ok' => true]);
    }

    case 'login': {
        require_post();
        $d = body();
        $st = db()->prepare('SELECT * FROM admins WHERE email = ?');
        $st->execute([trim((string)($d['email'] ?? ''))]);
        $a = $st->fetch();
        if (!$a || !password_verify((string)($d['pass'] ?? ''), $a['password_hash'])) {
            usleep(700000);
            fail('الإيميل أو كلمة السر غلط', 401);
        }
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int)$a['id'];
        $_SESSION['admin_email'] = $a['email'];
        out(['ok' => true, 'email' => $a['email']]);
    }

    case 'logout':
        require_post();
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);

    case 'add_product': {
        require_post(); require_admin();
        $d = body();
        $name  = trim((string)($d['name'] ?? ''));
        $cat   = (string)($d['cat'] ?? '');
        $cond  = (string)($d['cond'] ?? '');
        $price = (float)($d['price'] ?? 0);
        $desc  = trim((string)($d['desc'] ?? ''));
        $img   = (string)($d['img'] ?? '');

        if ($name === '' || mb_strlen($name) > 255) fail('اكتب اسم المنتج');
        if (!in_array($cat, CATEGORIES, true)) fail('فئة غير صحيحة');
        if (!in_array($cond, ['new', 'used', 'refurb'], true)) fail('حالة غير صحيحة');
        if ($price <= 0 || $price > 99999999) fail('اكتب سعر صحيح');

        $file = $img !== '' ? save_image($img, PRODUCT_IMG_DIR) : null;
        $st = db()->prepare('INSERT INTO products (name, cat, cond_type, price, description, img) VALUES (?,?,?,?,?,?)');
        $st->execute([$name, $cat, $cond, $price, $desc, $file]);
        out(['ok' => true, 'id' => (string)db()->lastInsertId()]);
    }

    case 'update_product': {
        require_post(); require_admin();
        $d = body();
        $st = db()->prepare('UPDATE products SET available = ? WHERE id = ?');
        $st->execute([!empty($d['available']) ? 1 : 0, (int)($d['id'] ?? 0)]);
        out(['ok' => true]);
    }

    case 'delete_product': {
        require_post(); require_admin();
        $id = (int)(body()['id'] ?? 0);
        $st = db()->prepare('SELECT img FROM products WHERE id = ?');
        $st->execute([$id]);
        $img = $st->fetchColumn();
        db()->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);
        delete_file(PRODUCT_IMG_DIR, $img ?: null);
        out(['ok' => true]);
    }

    case 'orders': {
        require_admin();
        $rows = db()->query('SELECT *, UNIX_TIMESTAMP(created_at) AS ts FROM orders ORDER BY created_at DESC, id DESC')->fetchAll();
        out(array_map('order_row', $rows));
    }

    case 'receipt': {
        require_admin();
        $st = db()->prepare('SELECT receipt_file FROM orders WHERE id = ?');
        $st->execute([(int)($_GET['id'] ?? 0)]);
        $f = $st->fetchColumn();
        $path = $f ? RECEIPT_DIR . '/' . basename($f) : '';
        if (!$path || !is_file($path)) { http_response_code(404); exit; }
        $mime = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][pathinfo($path, PATHINFO_EXTENSION)] ?? 'application/octet-stream';
        header('Content-Type: ' . $mime);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=3600');
        readfile($path);
        exit;
    }

    case 'update_order': {
        require_post(); require_admin();
        $d = body();
        $st = db()->prepare('UPDATE orders SET done = ? WHERE id = ?');
        $st->execute([!empty($d['done']) ? 1 : 0, (int)($d['id'] ?? 0)]);
        out(['ok' => true]);
    }

    case 'delete_order': {
        require_post(); require_admin();
        $id = (int)(body()['id'] ?? 0);
        $st = db()->prepare('SELECT receipt_file, done FROM orders WHERE id = ?');
        $st->execute([$id]);
        $o = $st->fetch();
        if (!$o) out(['ok' => true]);
        if (!$o['done']) fail('علّم الطلب إنه اتنفذ الأول');
        db()->prepare('DELETE FROM orders WHERE id = ?')->execute([$id]);
        delete_file(RECEIPT_DIR, $o['receipt_file']);
        out(['ok' => true]);
    }

    default:
        fail('unknown action', 404);
    }
} catch (PDOException $e) {
    error_log($e->getMessage());
    fail('خطأ في قاعدة البيانات', 500);
}
