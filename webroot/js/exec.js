function exec(cmd, timeout=5000) {
  const base = new Promise(r => {
    try {
      if (typeof ksu !== 'undefined' && ksu?.exec) {
        const x = ksu.exec(cmd);
        if (x && typeof x.then === 'function') { x.then(v => r((v.stdout||'').trim())).catch(()=>r('')); return; }
        if (x && x.stdout !== undefined) { r((x.stdout||'').trim()); return; }
        r(String(x||'').trim()); return;
      }
    } catch(_) {}
    try {
      if (typeof mmrl !== 'undefined' && mmrl?.exec) {
        mmrl.exec(cmd).then(v => r((v.stdout||'').trim())).catch(()=>r(''));
        return;
      }
    } catch(_) {}
    r('');
  });
  const timer = new Promise(r => setTimeout(() => r(''), timeout));
  return Promise.race([base, timer]);
}
