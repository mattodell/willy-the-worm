// GET /api/worlds -> { remote: true, worlds: [...] }   (public: everyone can play every world)
const L = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return L.send(res, 405, { error: 'method not allowed' });
  if (!L.configured()) return L.send(res, 503, { error: 'storage not configured' });
  try {
    const ids = (await L.redis('SMEMBERS', L.IDS)) || [];
    const raw = ids.length ? await L.redis('MGET', ...ids.map(L.KEY)) : [];
    let worlds = [];
    for (const s of raw) {
      if (!s) continue;
      try { const { th, ...w } = JSON.parse(s); worlds.push(w); } catch (e) {}
    }
    worlds.sort((a, b) => b.updated - a.updated);
    let bytes = 0;                                   // stay under the response size limit
    worlds = worlds.filter(w => (bytes += JSON.stringify(w).length) <= L.LIST_BYTES);
    L.send(res, 200, { remote: true, worlds });
  } catch (e) { L.send(res, 502, { error: 'storage unavailable' }); }
};
