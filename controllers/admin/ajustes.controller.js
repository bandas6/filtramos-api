const Configuracion = require('../../models/configuracion.models');
const { AJUSTES, PUBLICOS, validarAjuste } = require('../../utils/ajustes');

const faltantes = (conf) => AJUSTES.filter((a) => a.obligatorio && !conf[a.clave]).map((a) => a.clave);

const valores = (conf, claves) => Object.fromEntries(claves.filter((c) => conf[c]).map((c) => [c, conf[c]]));

// GET /api/admin/ajustes (admin): definición de campos + valores
const obtener = async (req, res) => {
  const conf = await Configuracion.general();
  res.json({
    ok: true,
    campos: AJUSTES,
    valores: valores(conf, AJUSTES.map((a) => a.clave)),
    faltantes: faltantes(conf),
    actualizado: conf.updatedAt || null
  });
};

// PUT /api/admin/ajustes (admin): { clave: valor, ... }. Vacío = borrar.
const guardar = async (req, res) => {
  const conf = await Configuracion.general();
  const errores = [];
  for (const def of AJUSTES) {
    if (!req.body || !(def.clave in req.body)) continue;
    try {
      conf.set(def.clave, validarAjuste(def, req.body[def.clave]));
    } catch (e) {
      errores.push(e.message);
    }
  }
  if (errores.length) return res.status(400).json({ ok: false, error: errores.join('. ') });
  conf.actualizadoPor = req.usuario._id;
  await conf.save();
  res.json({ ok: true, valores: valores(conf, AJUSTES.map((a) => a.clave)), faltantes: faltantes(conf) });
};

// GET /api/admin/ajustes/estado (cualquier rol con sesión): para el aviso del panel
const estado = async (req, res) => {
  const conf = await Configuracion.general();
  res.json({ ok: true, faltantes: faltantes(conf) });
};

// GET /api/public/ajustes: solo los ajustes públicos que tienen valor
const publicos = async (req, res) => {
  const conf = await Configuracion.general();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ ok: true, ajustes: valores(conf, PUBLICOS) });
};

module.exports = { obtener, guardar, estado, publicos };
