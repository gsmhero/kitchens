<?php
/* A small SMTP client (TLS on port 465, or STARTTLS on 587): shared hosting has no mail program.
   send_mail() returns [true, ''] or [false, 'reason'], and never throws. */
declare(strict_types=1);

function send_mail(string $to, string $subject, string $text): array {
    $host = (string) cfg('smtp_host');
    if ($host === '') return [false, 'SMTP is not configured'];
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return [false, 'bad recipient address'];
    $port = (int) cfg('smtp_port', 465);
    $user = (string) cfg('smtp_user'); $pass = (string) cfg('smtp_pass');
    $from = (string) cfg('smtp_from', $user);
    $fromName = (string) cfg('smtp_from_name', 'Kitchens');
    $subject = str_replace(["\r", "\n"], ' ', $subject);

    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
    $s = @stream_socket_client(($port === 465 ? 'ssl://' : 'tcp://') . $host . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$s) return [false, 'cannot connect to the mail server: ' . $errstr];
    stream_set_timeout($s, 20);

    $read = function () use ($s): string {
        $out = '';
        while (($line = fgets($s, 1024)) !== false) { $out .= $line; if (strlen($line) < 4 || $line[3] === ' ') break; }
        return $out;
    };
    $cmd = function (string $c, array $ok) use ($s, $read): string {
        fwrite($s, $c . "\r\n");
        $r = $read();
        if (!in_array(substr($r, 0, 3), $ok, true)) throw new RuntimeException(trim(preg_replace('/\s+/', ' ', $r)));
        return $r;
    };
    try {
        $greet = $read();
        if (substr($greet, 0, 3) !== '220') throw new RuntimeException('unexpected greeting: ' . trim($greet));
        $cmd('EHLO kitchens.local', ['250']);
        if ($port !== 465) {
            $cmd('STARTTLS', ['220']);
            if (!stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('TLS failed');
            $cmd('EHLO kitchens.local', ['250']);
        }
        $cmd('AUTH LOGIN', ['334']);
        $cmd(base64_encode($user), ['334']);
        $cmd(base64_encode($pass), ['235']);
        $cmd('MAIL FROM:<' . $from . '>', ['250']);
        $cmd('RCPT TO:<' . $to . '>', ['250', '251']);
        $cmd('DATA', ['354']);

        $domain = substr(strrchr($from, '@') ?: '@localhost', 1);
        $headers = [
            'Date: ' . date('r'),
            'From: =?UTF-8?B?' . base64_encode($fromName) . '?= <' . $from . '>',
            'To: <' . $to . '>',
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'Message-ID: <' . bin2hex(random_bytes(10)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            'Auto-Submitted: auto-generated',
        ];
        $body = chunk_split(base64_encode($text), 76, "\r\n");
        $cmd(implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.", ['250']);
        try { fwrite($s, "QUIT\r\n"); } catch (Throwable $e) { /* ignore */ }
        fclose($s);
        return [true, ''];
    } catch (Throwable $e) {
        @fclose($s);
        error_log('[kitchens mail] ' . $e->getMessage());
        return [false, $e->getMessage()];
    }
}
