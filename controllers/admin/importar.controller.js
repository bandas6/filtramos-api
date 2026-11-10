const multer = require('multer');
const path = require('path');
const importador = require('../../services/importador');

// Excel en memoria, máximo 10 MB, solo .xlsx (el contenido se verifica al leerlo)
const subirExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.xlsx') return cb(null, true);
    const err = new Error('Suba un archivo de Excel .xlsx');
    err.status = 400;
    cb(err);
  }
}).single('archivo');

// Los parámetros llegan como campos del formulario multipart
function opciones(req) {
  const b = req.body || {};
  let asociacion;
  if (b.asociacion) {
    try { asociacion = JSON.parse(b.asociacion); } catch { const e = new Error('Asociación de columnas no válida'); e.status = 400; throw e; }
  }
  return {
    hoja: b.hoja || undefined,
    filaEncabezados: b.filaEncabezados ? Number(b.filaEncabezados) : undefined,
    asociacion,
    omitirErrores: b.omitirErrores === 'true' || b.omitirErrores === true
  };
}

const conArchivo = (fn) => async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Adjunte el archivo de Excel' });
  try {
    await fn(req, res, opciones(req));
  } catch (err) {
    if (err instanceof importador.ErrorImportacion || (err.status >= 400 && err.status < 500)) {
      return res.status(err.status).json({ ok: false, error: err.message });
    }
    throw err;
  }
};

const enviarExcel = (res, nombre, buffer) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.send(Buffer.from(buffer));
};

// POST /api/admin/importar/analizar   (archivo, hoja?, filaEncabezados?, asociacion?) -> no guarda nada
const analizar = conArchivo(async (req, res, o) => {
  res.json({ ok: true, nombreArchivo: req.file.originalname, ...(await importador.analizar(req.file.buffer, o)) });
});

// POST /api/admin/importar/confirmar  (archivo, hoja, filaEncabezados, asociacion, omitirErrores)
const confirmar = conArchivo(async (req, res, o) => {
  if (!o.asociacion) return res.status(400).json({ ok: false, error: 'Falta la asociación de columnas' });
  const r = await importador.confirmar(req.file.buffer, { ...o, usuario: req.usuario, nombreArchivo: req.file.originalname });
  res.json({ ok: true, ...r });
});

// POST /api/admin/importar/errores -> Excel con las filas que tienen errores
const errores = conArchivo(async (req, res, o) => {
  if (!o.asociacion) return res.status(400).json({ ok: false, error: 'Falta la asociación de columnas' });
  enviarExcel(res, 'filas-con-errores.xlsx', await importador.excelDeErrores(req.file.buffer, o));
});

const plantilla = async (req, res) => enviarExcel(res, 'plantilla-productos-filtramos.xlsx', await importador.plantilla());

const exportar = async (req, res) => {
  const fecha = new Date().toISOString().slice(0, 10);
  enviarExcel(res, `productos-filtramos-${fecha}.xlsx`, await importador.exportar());
};

module.exports = { subirExcel, analizar, confirmar, errores, plantilla, exportar };
