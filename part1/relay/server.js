const express = require('express'), http = require('http'), path = require('path'), os = require('os');
const { Server } = require('socket.io');

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

function start(port, opts = {}) {
  const app = express();
  if (opts.staticDir) {
    // list of optional sound samples (app/assets/sfx/*), used by the client's sample layer
    app.get('/sfx-list', (q, r) => { try { r.json(require('fs').readdirSync(path.join(opts.staticDir, 'assets', 'sfx')).filter(f => /\.(ogg|wav|mp3|m4a|flac)$/i.test(f))); } catch (e) { r.json([]); } });
    app.use(express.static(opts.staticDir));
    if (opts.threeDir) {
      app.use('/vendor/three', express.static(path.join(opts.threeDir, 'build')));
      app.use('/vendor/addons', express.static(path.join(opts.threeDir, 'examples/jsm')));
    }
  }
  if (opts.extend) opts.extend(app);
  app.get('/health', (q, r) => r.send('ok'));
  app.get('/info', (q, r) => { r.set('Access-Control-Allow-Origin', '*'); r.json({ ips: lanIps(), port: srv.address().port }); });
  const srv = http.createServer(app);
  const io = new Server(srv, { cors: { origin: '*' } });
  const rooms = new Map();
  const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); } while (rooms.has(c)); return c; };

  // Rooms: two slots + meta { mode, params, persist }. Persistent rooms (hunt / survival) survive a disconnect for
  // GRACE seconds so the same code can be used to rejoin; the remaining player receives 'peerleft' / 'peerback'.
  const GRACE = 45000;
  io.on('connection', s => {
    // never let a malformed message take the relay down
    const safe = fn => (...a) => { try { fn(...a); } catch (e) { console.error('handler error', e && e.message); } };
    const on0 = s.on.bind(s); s.on = (ev, fn) => on0(ev, safe(fn));
    const leave = () => {
      const c = s.data.room; if (!c) return; const r = rooms.get(c); s.leave(c); s.data.room = null;
      if (!r) return;
      r.slots[s.data.slot] = null;
      const left = r.slots.filter(Boolean).length;
      if (r.slots.length > 2) {   // team room (2 vs 2): the host (slot 0) runs the bots and the match; without it the room ends
        if (s.data.slot === 0 || left === 0) { s.to(c).emit('peergone'); clearTimeout(r.timer); rooms.delete(c); return; }
        io.to(c).emit('roster', { slots: r.slots.map(Boolean), left: s.data.slot }); return;
      }
      if (!r.meta.persist || !r.started || left === 0) { s.to(c).emit('peerleft', {}); clearTimeout(r.timer); rooms.delete(c); return; }
      s.to(c).emit('peerleft', { grace: GRACE / 1000 });
      clearTimeout(r.timer); r.timer = setTimeout(() => { io.to(c).emit('peergone'); rooms.delete(c); }, GRACE);
    };
    s.on('create', (meta, cb) => {
      if (typeof meta === 'function') { cb = meta; meta = {}; } if (typeof cb !== 'function') return;
      leave(); const c = newCode(); const size = Math.max(2, Math.min(4, (meta && +meta.size) || 2));
      const slots = Array(size).fill(null); slots[0] = s.id; rooms.set(c, { slots, meta: meta || {}, started: false });
      s.join(c); s.data.room = c; s.data.slot = 0; cb({ ok: true, code: c, slot: 0, meta: meta || {} });
    });
    s.on('join', (c, cb) => {
      if (typeof cb !== 'function') return; c = String(c || '').toUpperCase().trim(); const r = rooms.get(c);
      if (!r) return cb({ ok: false, err: 'Room not found' });
      if (r.slots.length > 2 && r.started) return cb({ ok: false, err: 'Match already started' });   // team rooms: no joining mid-match
      const slot = r.slots.indexOf(null);
      if (slot < 0) return cb({ ok: false, err: 'Room is full' });
      leave(); r.slots[slot] = s.id; s.join(c); s.data.room = c; s.data.slot = slot;
      const resume = r.started; clearTimeout(r.timer);
      cb({ ok: true, code: c, slot, meta: r.meta, resume, slots: r.slots.map(Boolean) });
      if (r.slots.length > 2) { io.to(c).emit('roster', { slots: r.slots.map(Boolean), joined: slot }); return; }   // team room: host starts
      if (resume) s.to(c).emit('peerback', { slot }); else { r.started = true; io.to(c).emit('start', { meta: r.meta }); }
    });
    // team rooms: host starts the match; 'tm' messages are relayed with the sender's slot (f) and an optional target slot (to)
    s.on('tmstart', () => { const r = s.data.room && rooms.get(s.data.room); if (!r || s.data.slot !== 0) return; r.started = true; io.to(s.data.room).emit('start', { meta: r.meta, slots: r.slots.map(Boolean) }); });
    s.on('tm', d => { const c = s.data.room, r = c && rooms.get(c); if (!r || !d || typeof d !== 'object') return; const m = { ...d, f: s.data.slot };
      if (typeof d.to === 'number' && r.slots[d.to]) io.to(r.slots[d.to]).emit('tm', m); else s.to(c).emit('tm', m); });
    s.on('meta', m => { const r = s.data.room && rooms.get(s.data.room); if (r && s.data.slot === 0) r.meta = { ...r.meta, ...m }; });
    // relay everything else to the other player in the room
    s.onAny((ev, d) => { if (ev === 'create' || ev === 'join' || ev === 'meta' || ev === 'tm' || ev === 'tmstart') return; if (s.data.room) s.to(s.data.room).emit(ev, d); });
    s.on('disconnect', leave);
  });

  return new Promise((resolve, reject) => {
    let p = port, tries = 0;
    srv.on('error', e => { if (e.code === 'EADDRINUSE' && tries++ < 20 && !opts.strict) srv.listen(++p, '0.0.0.0'); else reject(e); });
    srv.on('listening', () => resolve(srv.address().port));
    srv.listen(p, '0.0.0.0');
  });
}

module.exports = { start, lanIps };

if (require.main === module) {
  const port = +process.env.PORT || 3000;
  start(port, { strict: true, staticDir: path.join(__dirname, 'app') }).then(p => console.log('Katana Duel relay server on port ' + p));
}
