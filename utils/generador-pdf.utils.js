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
      .text(`Equivalencias: ${(product.equivalencias || []).join(', ') || 'N/A'}`)
      .text(`Aplicaciones: ${(product.aplicaciones || []).join(', ') || 'N/A'}`)
      .moveDown();
  });

  doc.end();
  await terminado;
  return Buffer.concat(buffers);
};

// utils/pdfGenerator.js

async function generatePdfFromHtml(html) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
    executablePath: puppeteer.executablePath() // fuerza a usar el binario “quisquilloso” que Puppeteer descargó
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 0 });
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return pdfBuffer;
}

module.exports = {
  generatePdf,
  generatePdfFromHtml
}

