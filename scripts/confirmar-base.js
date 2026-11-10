// Protección para scripts que escriben en la base.
// Muestra el nombre de la base conectada. Si no termina en _dev ni en _test (por ejemplo, la de
// producción "filtramos"), exige escribir el nombre exacto de la base para continuar.
// Sin terminal interactiva (CI, tuberías) se niega, salvo CONFIRMAR_BASE=<nombre exacto>.
const readline = require('readline');
const mongoose = require('mongoose');

const esSegura = (nombre) => /_(dev|test)$/.test(nombre);

async function confirmarBase(accion) {
  const nombre = mongoose.connection.db.databaseName;
  console.log(`Base de datos: ${nombre}`);
  if (esSegura(nombre)) return;

  console.log(`⚠ "${nombre}" no es una base de desarrollo ni de pruebas. Acción: ${accion}.`);
  if (process.env.CONFIRMAR_BASE !== undefined) {
    if (process.env.CONFIRMAR_BASE === nombre) return;
    throw new Error('CONFIRMAR_BASE no coincide con el nombre de la base. No se hizo nada.');
  }
  if (!process.stdin.isTTY) {
    throw new Error('Se necesita confirmación escrita y no hay terminal interactiva. No se hizo nada.');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await new Promise((r) => rl.question(`Escriba el nombre de la base (${nombre}) para continuar: `, r));
  rl.close();
  if (respuesta.trim() !== nombre) throw new Error('Confirmación incorrecta. No se hizo nada.');
}

module.exports = { confirmarBase, esSegura };
