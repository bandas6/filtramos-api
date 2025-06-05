// utils/pdfGenerator.js
const PDFDocument = require('pdfkit');
const puppeteer = require('puppeteer');

const generatePdf = async (products) => {
  const doc = new PDFDocument();
  const buffers = [];

  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => { });

  doc.fontSize(18).text('Catálogo de Productos', { align: 'center' });

  products.forEach(product => {
    doc
      .fontSize(14)
      .text(`Nombre: ${product.name}`)
      .text(`Precio: $${product.price}`)
      .text(`Descripción: ${product.description}`)
      .moveDown();
  });

  doc.end();

  return new Promise(resolve => {
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });
  });
};

// utils/pdfGenerator.js


async function generatePdfFromHtml(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
    // ❌ NO PONGAS executablePath EN WINDOWS si usas puppeteer completo
  });

  const page = await browser.newPage();

  await page.setContent(html, {
    waitUntil: 'domcontentloaded',
    timeout: 0
  });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true
  });

  await browser.close();

  return pdfBuffer;
}


module.exports = {
  generatePdf,
  generatePdfFromHtml
}

