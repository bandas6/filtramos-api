// Reglas del catálogo compartidas por el modelo, los controladores y (más adelante) el importador.

// Tipos de producto: valor guardado -> nombre visible
const TIPOS = {
  'aire-primario': 'Aire primario',
  'aire-seguridad': 'Aire seguridad',
  prefiltro: 'Prefiltro',
  compresor: 'Compresor',
  cabina: 'Cabina',
  kit: 'Kit de mantenimiento'
};

// Motivos por los que un producto queda en borrador (en este orden se muestran)
const MOTIVOS = {
  'sin-tipo': 'sin tipo',
  'sin-precio': 'sin precio',
  'sin-foto': 'sin foto',
  'sin-componentes': 'sin componentes',
  oculto: 'oculto'
};

// Un producto se publica solo con referencia, tipo, precio público y al menos una foto
// (y, si es kit, con al menos un componente). Si el admin lo oculta, queda en borrador.
function motivosDeBorrador(p) {
  const motivos = [];
  if (!p.tipo) motivos.push('sin-tipo');
  if (!(p.precios && p.precios.publico > 0)) motivos.push('sin-precio');
  if (!(p.imagesUrl && p.imagesUrl.length)) motivos.push('sin-foto');
  if (p.tipo === 'kit' && !(p.kit && p.kit.length)) motivos.push('sin-componentes');
  if (p.publicar === false) motivos.push('oculto');
  return motivos;
}

// "FT-AP 1021/B" -> "ft-ap-1021-b"
const slugDe = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

module.exports = { TIPOS, MOTIVOS, motivosDeBorrador, slugDe };
