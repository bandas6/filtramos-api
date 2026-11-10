// Disponibilidad que ve el cliente (PLAN.md §0 y diseno/Disponibilidad.png).
//   disponible = stock − reservado
//   > mínimo (o sin mínimo) -> "disponible"
//   bajo el mínimo          -> "ultimas"   ("Quedan N" solo si N ≤ 5)
//   en cero o menos         -> "bajo-pedido" (nunca "agotado")
const QUEDAN_MAXIMO = 5;

function estadoDe(disponible, minimo = 0) {
  if (disponible <= 0) return { estado: 'bajo-pedido', quedan: null };
  if (minimo > 0 && disponible < minimo) {
    return { estado: 'ultimas', quedan: disponible <= QUEDAN_MAXIMO ? disponible : null };
  }
  return { estado: 'disponible', quedan: null };
}

const disponibleDe = (p) => (p.stock || 0) - (p.reservado || 0);

// Producto simple: { disponible, estado, quedan }
function disponibilidadProducto(p) {
  const disponible = disponibleDe(p);
  return { disponible, ...estadoDe(disponible, p.stockMinimo || 0) };
}

// Kit: unidades armables con los componentes (mínimo entre ellos) y el peor estado de sus componentes.
// componentes: [{ producto: {stock, reservado, stockMinimo}, cantidad }]
function disponibilidadKit(componentes) {
  if (!componentes.length || componentes.some((c) => !c.producto)) {
    return { disponible: 0, estado: 'bajo-pedido', quedan: null };
  }
  const disponible = Math.max(0, Math.min(...componentes.map((c) =>
    Math.floor(Math.max(0, disponibleDe(c.producto)) / (c.cantidad || 1)))));
  if (disponible <= 0) return { disponible: 0, estado: 'bajo-pedido', quedan: null };
  const algunoBajo = componentes.some((c) => disponibilidadProducto(c.producto).estado !== 'disponible');
  if (algunoBajo) return { disponible, estado: 'ultimas', quedan: disponible <= QUEDAN_MAXIMO ? disponible : null };
  return { disponible, estado: 'disponible', quedan: null };
}

module.exports = { estadoDe, disponibilidadProducto, disponibilidadKit, QUEDAN_MAXIMO };
