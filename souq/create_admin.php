<?php
// شغّله مرة واحدة من المتصفح: http://localhost/souq/create_admin.php
// بيرفض يشتغل لو فيه أدمن موجود أصلاً.
require __DIR__ . '/config.php';
$pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

header('Content-Type: text/html; charset=utf-8');
$exists = (int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn() > 0;
$msg = '';

if ($exists) {
    $msg = 'فيه أدمن موجود بالفعل. امسح الملف ده من السيرفر.';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $pass  = $_POST['pass'] ?? '';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($pass) < 8) {
        $msg = 'إيميل غير صحيح أو كلمة السر أقل من 8 حروف.';
    } else {
        $st = $pdo->prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)');
        $st->execute([$email, password_hash($pass, PASSWORD_DEFAULT)]);
        $msg = 'تم إنشاء الأدمن ✔ امسح الملف ده دلوقتي.';
        $exists = true;
    }
}
?>
<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>إنشاء أدمن</title>
<body style="font-family:sans-serif;max-width:340px;margin:60px auto">
<h3>إنشاء حساب الأدمن</h3>
<?php if ($msg) echo '<p>' . htmlspecialchars($msg) . '</p>'; ?>
<?php if (!$exists): ?>
<form method="post">
  <input name="email" type="email" placeholder="الإيميل" required style="width:100%;padding:8px;margin:6px 0" dir="ltr">
  <input name="pass" type="password" placeholder="كلمة السر (8+ حروف)" required style="width:100%;padding:8px;margin:6px 0">
  <button style="padding:8px 16px">إنشاء</button>
</form>
<?php endif; ?>
</body></html>
