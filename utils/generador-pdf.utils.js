// utils/pdfGenerator.js
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');

const generatePdf = async (products) => {
  const doc = new PDFDocument();
  const buffers = [];

  doc.on('data', buffers.push.bind(buffers));
  const terminado = new Promise(resolve => doc.on('end', resolve));

  doc.fontSize(18).text('Catálogo de Productos', { align: 'center' });

  products.forEach(product => {
    doc
      .fontSize(14)
      .text(`Referencia: ${product.referencia || 'N/A'}`)
      .fontSize(11)
      .text(`Diámetro externo: ${product.diametroExterno || 'N/A'} · Diámetro interno: ${product.diametroInterno || 'N/A'}`)
      .text(`Equivalencias: ${product.equivalenciasTexto || 'N/A'}`)
      .text(`Aplicaciones: ${(product.aplicaciones || []).join(', ') || 'N/A'}`)
      .moveDown();
  });

  doc.end();
  await terminado;
  return Buffer.concat(buffers);
};

// utils/pdfGenerator.js

// Una sola instancia de Chromium compartida entre peticiones; se relanza si se cae.
let navegador = null;

function obtenerNavegador() {
  if (!navegador) {
    navegador = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ],
      executablePath: puppeteer.executablePath() // fuerza a usar el binario que Puppeteer descargó
    }).then((browser) => {
      browser.on('disconnected', () => { navegador = null; });
      return browser;
    }).catch((err) => {
      navegador = null;
      throw err;
    });
  }
  return navegador;
}

async function generatePdfFromHtml(html) {
  const browser = await obtenerNavegador();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return await page.pdf({ format: 'A4', printBackground: true, timeout: 120000 });
  } finally {
    // Siempre se cierra la pestaña, aunque falle la generación
    await page.close().catch(() => {});
  }
}

module.exports = {
  generatePdf,
  generatePdfFromHtml
}

