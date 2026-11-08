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
    app.use(express.static(opts.staticDir));
    if (opts.threeDir) {
      app.use('/vendor/three', express.static(path.join(opts.threeDir, 'build')));
      app.use('/vendor/addons', express.static(path.join(opts.threeDir, 'examples/jsm')));
    }
  }
  app.get('/health', (q, r) => r.send('ok'));
  app.get('/info', (q, r) => { r.set('Access-Control-Allow-Origin', '*'); r.json({ ips: lanIps(), port: srv.address().port }); });
  const srv = http.createServer(app);
  const io = new Server(srv, { cors: { origin: '*' } });
  const rooms = new Map();
  const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); } while (rooms.has(c)); return c; };

  io.on('connection', s => {
    const leave = () => {
      const c = s.data.room; if (!c) return;
      s.to(c).emit('peerleft'); rooms.delete(c); s.leave(c); s.data.room = null;
    };
    s.on('create', cb => { leave(); const c = newCode(); rooms.set(c, { n: 1 }); s.join(c); s.data.room = c; cb({ ok: true, code: c, slot: 0 }); });
    s.on('join', (c, cb) => {
      c = String(c || '').toUpperCase().trim(); const r = rooms.get(c);
      if (!r) return cb({ ok: false, err: 'Room not found' });
      if (r.n >= 2) return cb({ ok: false, err: 'Room is full' });
      leave(); r.n = 2; s.join(c); s.data.room = c; cb({ ok: true, code: c, slot: 1 }); io.to(c).emit('start');
    });
    for (const ev of ['state', 'strike', 'outcome', 'dead', 'rematch', 'round'])
      s.on(ev, d => { if (s.data.room) s.to(s.data.room).emit(ev, d); });
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
  start(port, { strict: true }).then(p => console.log('Katana Duel relay server on port ' + p));
}
