// Socket.IO client wrapper. `io` is the global from /socket.io/socket.io.js
// Every server event is forwarded to the handler registered with on(); unknown events are ignored.
export class Net {
  constructor() { this.s = null; this.h = {}; this.slot = 0; this.code = ''; this.meta = {}; this.url = ''; }
  on(ev, fn) { this.h[ev] = fn; }
  off(ev) { delete this.h[ev]; }
  get connected() { return !!(this.s && this.s.connected); }
  connect(url) {
    return new Promise((res, rej) => {
      this.close(); this.url = url || '';
      let u = url && url.trim() ? (/^https?:\/\//.test(url.trim()) ? url.trim() : (/\.onrender\.com|\.app|\.dev|\.io/.test(url) ? 'https://' : 'http://') + url.trim()) : undefined;
      if (u) { try { u = new URL(u).origin; } catch (e) { } }
      const s = this.s = u ? io(u, { transports: ['websocket', 'polling'], timeout: 70000, reconnection: false }) : io({ reconnection: false });
      const to = setTimeout(() => { rej(new Error('Cannot reach server')); s.close(); }, 75000);
      s.on('connect', () => { clearTimeout(to); res(); });
      s.on('connect_error', () => { clearTimeout(to); rej(new Error('Cannot reach server')); });
      s.onAny((ev, d) => { const f = this.h[ev]; if (f) f(d); });
      s.on('disconnect', () => { const f = this.h.disconnected || this.h.peerleft; if (f) f({ self: true }); });
    });
  }
  create(meta = {}) { return new Promise(r => this.s.emit('create', meta, a => { this.slot = a.slot; this.code = a.code; this.meta = a.meta || {}; r(a); })); }
  join(code) { return new Promise(r => this.s.emit('join', code, a => { if (a.ok) { this.slot = a.slot; this.code = a.code; this.meta = a.meta || {}; } r(a); })); }
  send(ev, d) { if (this.s && this.s.connected) this.s.emit(ev, d); }
  close() { if (this.s) { this.s.removeAllListeners(); this.s.offAny(); this.s.close(); this.s = null; } }
}
