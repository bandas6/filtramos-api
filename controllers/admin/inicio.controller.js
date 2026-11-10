// GET /api/admin/inicio -> página de inicio del panel: primeros pasos y avisos del día.
// Los pasos se calculan con los datos; el usuario puede marcar alguno como "no aplica" (preferencias).
const Product = require('../../models/productos.models');
const Usuario = require('../../models/usuario.models');
const Files = require('../../models/files.models');
const Configuracion = require('../../models/configuracion.models');
const { Pedido, SolicitudMedida } = require('../../models/solicitudes.models');
const { PASOS } = require('../../models/usuario.models');
const { disponibilidadProducto } = require('../../utils/disponibilidad');
const { MOTIVOS } = require('../../utils/catalogo');

const LIMITE_LISTA = 5;

const inicio = async (req, res) => {
  const base = { estado: true };
  const [conf, usuarios, productos, imagenes, borradores, totalBorradores, simples, pedidosNuevos, medidaNuevas] = await Promise.all([
    Configuracion.general(),
    Usuario.countDocuments({ estado: true }),
    Product.countDocuments(base),
    Files.countDocuments({}),
    Product.find({ ...base, publicado: false }, { referencia: 1, tipo: 1, motivosBorrador: 1 })
      .sort({ updatedAt: -1 }).limit(LIMITE_LISTA).lean(),
    Product.countDocuments({ ...base, publicado: false }),
    Product.find({ ...base, tipo: { $ne: 'kit' } }, { referencia: 1, stock: 1, reservado: 1, stockMinimo: 1 }).lean(),
    Pedido.countDocuments({ estado: 'nuevo' }),
    SolicitudMedida.countDocuments({ estado: 'nuevo' })
  ]);

  // Pasos: hecho = los datos ya lo muestran
  const hechos = {
    whatsapp: !!conf.whatsappVentas,
    usuarios: usuarios > 1,
    importar: productos > 0,
    fotos: imagenes > 0,
    borradores: productos > 0 && totalBorradores === 0
  };
  const noAplica = new Set(req.usuario.preferencias?.pasosNoAplica || []);
  const pasos = PASOS.map((clave) => ({ clave, hecho: hechos[clave], noAplica: noAplica.has(clave) }));

  // Bajo el mínimo (o en cero), de menor a mayor disponible
  const bajos = simples
    .map((p) => ({ uid: p._id, referencia: p.referencia, minimo: p.stockMinimo || 0, ...disponibilidadProducto(p) }))
    .filter((p) => p.estado !== 'disponible')
    .sort((a, b) => a.disponible - b.disponible);

  res.json({
    ok: true,
    pasos,
    avisos: {
      stockBajo: { total: bajos.length, items: bajos.slice(0, LIMITE_LISTA).map(({ uid, referencia, disponible, minimo }) => ({ uid, referencia, disponible, minimo })) },
      pedidosNuevos,
      medidaNuevas,
      borradores: {
        total: totalBorradores,
        items: borradores.map((p) => ({ uid: p._id, referencia: p.referencia, motivos: (p.motivosBorrador || []).map((m) => ({ clave: m, texto: MOTIVOS[m] || m })) }))
      }
    }
  });
};

module.exports = { inicio };
