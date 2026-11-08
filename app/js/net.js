// Socket.IO client wrapper. `io` is the global from /socket.io/socket.io.js
export class Net {
  constructor() { this.s = null; this.h = {}; this.slot = 0; this.code = ''; }
  on(ev, fn) { this.h[ev] = fn; }
  connect(url) {
    return new Promise((res, rej) => {
      this.close();
      let u = url && url.trim() ? (/^https?:\/\//.test(url.trim()) ? url.trim() : (/\.onrender\.com|\.app|\.dev|\.io/.test(url) ? 'https://' : 'http://') + url.trim()) : undefined;
      if (u) { try { u = new URL(u).origin; } catch (e) {} }
      const s = this.s = u ? io(u, { transports: ['websocket', 'polling'], timeout: 70000, reconnection: false }) : io({ reconnection: false });
      const to = setTimeout(() => { rej(new Error('Cannot reach server')); s.close(); }, 75000);
      s.on('connect', () => { clearTimeout(to); res(); });
      s.on('connect_error', () => { clearTimeout(to); rej(new Error('Cannot reach server')); });
      for (const ev of ['start', 'state', 'strike', 'outcome', 'dead', 'rematch', 'round', 'peerleft']) s.on(ev, d => this.h[ev] && this.h[ev](d));
      s.on('disconnect', () => this.h.peerleft && this.h.peerleft());
    });
  }
  create() { return new Promise(r => this.s.emit('create', a => { this.slot = a.slot; this.code = a.code; r(a); })); }
  join(code) { return new Promise(r => this.s.emit('join', code, a => { if (a.ok) { this.slot = a.slot; this.code = a.code; } r(a); })); }
  send(ev, d) { if (this.s && this.s.connected) this.s.emit(ev, d); }
  close() { if (this.s) { this.s.removeAllListeners(); this.s.close(); this.s = null; } }
}
