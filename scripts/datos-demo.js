// Productos ficticios DEMO- para desarrollo, pruebas y capturas. Ningún valor es real:
// marcas "DEMO-MARCA-*", precios redondos de ejemplo y medidas inventadas.
const PREFIJO = 'DEMO-';

// fotoDemo: URL de una imagen de ejemplo ya guardada (o null para dejarlos sin foto)
function productosDemo(fotoDemo) {
  const foto = fotoDemo ? [fotoDemo] : [];
  return [
    { referencia: 'DEMO-AP-001', tipo: 'aire-primario', descripcion: 'Producto de demostración.',
      precios: { publico: 100000, volumen: [{ desde: 10, precio: 90000 }, { desde: 50, precio: 80000 }], distribuidor: 70000 },
      equivalencias: [{ marca: 'DEMO-MARCA-A', referencia: 'A-001' }, { marca: 'DEMO-MARCA-B', referencia: 'B-001' }],
      aplicaciones: ['Máquina de demostración 1'], diametroExterno: 300, diametroInterno: 180, alto: 400,
      intervaloCambio: '500 horas', imagesUrl: foto, stock: 40, stockMinimo: 10 },
    { referencia: 'DEMO-AS-001', tipo: 'aire-seguridad', precios: { publico: 50000 },
      equivalencias: [{ marca: 'DEMO-MARCA-A', referencia: 'A-101' }, { marca: 'DEMO-MARCA-C', referencia: 'C-101' }],
      diametroExterno: 170, diametroInterno: 120, alto: 380, imagesUrl: foto, stock: 12, stockMinimo: 5 },
    { referencia: 'DEMO-AP-002', tipo: 'aire-primario',
      equivalencias: [{ marca: 'DEMO-MARCA-B', referencia: 'B-002' }],
      diametroExterno: 260, diametroInterno: 150, alto: 350, imagesUrl: foto, stock: 3, stockMinimo: 10 },
    { referencia: 'DEMO-CO-001', tipo: 'compresor', precios: { publico: 30000 },
      equivalencias: [{ marca: 'DEMO-MARCA-C', referencia: 'C-055' }],
      diametroExterno: 140, diametroInterno: 80, alto: 200, stock: 0, stockMinimo: 4 },
    { referencia: 'DEMO-PF-001', tipo: 'prefiltro', precios: { publico: 20000 },
      diametroExterno: 320, alto: 100, imagesUrl: foto, stock: 25, stockMinimo: 5 },
    { referencia: 'DEMO-CA-001', tipo: 'cabina', precios: { publico: 25000 }, publicar: false,
      alto: 50, imagesUrl: foto, stock: 8, stockMinimo: 2 },
    { referencia: 'DEMO-KIT-001', tipo: 'kit', precios: { publico: 140000 },
      aplicaciones: ['Máquina de demostración 1'], imagesUrl: foto,
      kit: [{ ref: 'DEMO-AP-001', cantidad: 1 }, { ref: 'DEMO-AS-001', cantidad: 1 }] }
  ];
}

// Crea los que falten (idempotente). Devuelve cuántos creó.
async function crearDemo(Product, { fotoDemo = null, slugDe } = {}) {
  let creados = 0;
  for (const p of productosDemo(fotoDemo)) {
    if (await Product.exists({ referenciaNormalizada: p.referencia })) continue;
    const { kit, ...datos } = p;
    if (kit) {
      datos.kit = [];
      for (const c of kit) {
        const comp = await Product.findOne({ referenciaNormalizada: c.ref }, { _id: 1 });
        if (comp) datos.kit.push({ producto: comp._id, cantidad: c.cantidad });
      }
    }
    await new Product({ ...datos, slug: slugDe(p.referencia) }).save();
    creados++;
  }
  return creados;
}

module.exports = { PREFIJO, productosDemo, crearDemo };
