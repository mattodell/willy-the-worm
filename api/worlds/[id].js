// PUT    /api/worlds/<id>   create (no token needed; the reply includes the edit token, shown once)
//                           or update (needs "Authorization: Bearer <token>")
// DELETE /api/worlds/<id>   needs the token
const L = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'PUT' && req.method !== 'DELETE') return L.send(res, 405, { error: 'method not allowed' });
  if (!L.configured()) return L.send(res, 503, { error: 'storage not configured' });
  const id = req.query && req.query.id;
  if (!L.validId(id)) return L.send(res, 400, { error: 'bad world id' });
  if (!L.sameSite(req)) return L.send(res, 403, { error: 'forbidden' });
  try {
    const cur = await L.redis('GET', L.KEY(id));
    const old = cur ? JSON.parse(cur) : null;
    if (old && !L.tokenOk(req, old.th)) return L.send(res, 403, { error: 'this world belongs to someone else' });
    if (!old && req.method === 'DELETE') return L.send(res, 404, { error: 'no such world' });
    if (await L.rateLimited(req)) return L.send(res, 429, { error: 'too many saves, try again later' });

    if (req.method === 'DELETE') {
      await L.redis('DEL', L.KEY(id)); await L.redis('SREM', L.IDS, id);
      return L.send(res, 200, { deleted: id });
    }
    const ct = String(req.headers['content-type'] || '');
    if (!ct.includes('application/json')) return L.send(res, 415, { error: 'send application/json' });
    const { body, error } = L.readBody(req);
    if (error) return L.send(res, error === 'too large' ? 413 : 400, { error });
    const bad = L.validateWorld(body); if (bad) return L.send(res, 400, { error: bad });

    const world = L.clean(id, body, Date.now());
    if (old) {
      await L.redis('SET', L.KEY(id), JSON.stringify({ ...world, th: old.th }));
      return L.send(res, 200, world);
    }
    if ((await L.redis('SCARD', L.IDS)) >= L.MAX_WORLDS) return L.send(res, 507, { error: 'the world library is full' });
    const token = L.newToken();
    const ok = await L.redis('SET', L.KEY(id), JSON.stringify({ ...world, th: L.hash(token) }), 'NX');   // NX: never overwrite a race winner
    if (ok !== 'OK') return L.send(res, 409, { error: 'that world id was just taken, try again' });
    await L.redis('SADD', L.IDS, id);
    L.send(res, 200, { ...world, token });
  } catch (e) { L.send(res, 502, { error: 'storage unavailable' }); }
};
