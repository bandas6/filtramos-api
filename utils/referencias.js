// Normalización de referencias. Se usa en el modelo, el buscador y (más adelante) el importador.

// Para la unicidad: mayúsculas y sin espacios, conservando guiones y demás signos.
//   "af-100" -> "AF-100"   "AF 100" -> "AF100"   ("AF-100" y "AF100" son distintas)
const normalizarReferencia = (valor) =>
  String(valor ?? '').toUpperCase().replace(/\s+/g, '');

// Para buscar: solo letras y números, en mayúsculas y sin tildes.
//   "af100" encuentra "AF-100"; "fleet guard p-181" encuentra "Fleetguard P181"
const claveDeBusqueda = (valor) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

module.exports = { normalizarReferencia, claveDeBusqueda };
