const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarReferencia, claveDeBusqueda } = require('../utils/referencias');

test('normalizarReferencia: mayúsculas y sin espacios, conserva guiones', () => {
  assert.equal(normalizarReferencia('af-100'), 'AF-100');
  assert.equal(normalizarReferencia(' AF 100 '), 'AF100');
  assert.notEqual(normalizarReferencia('AF-100'), normalizarReferencia('AF100'));
  assert.equal(normalizarReferencia(null), '');
});

test('claveDeBusqueda: solo letras y números, sin tildes', () => {
  assert.equal(claveDeBusqueda('af-100'), 'AF100');
  assert.equal(claveDeBusqueda('AF 100'), 'AF100');
  assert.equal(claveDeBusqueda('Fleetguard P-181'), 'FLEETGUARDP181');
  assert.equal(claveDeBusqueda('Compresión'), 'COMPRESION');
  assert.equal(claveDeBusqueda(undefined), '');
});
