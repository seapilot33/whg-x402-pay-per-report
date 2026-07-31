/**
 * Minimal sample PDF for the open-source demo.
 * Production WorldHashGraph generates richer portfolio PDFs.
 */
import PDFDocument from 'pdfkit';

export function renderSamplePdf({
  paymentRef,
  payTo,
  settlementDisplay,
  listPrice,
  hashscan,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'LETTER' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, doc.page.width, 56).fill('#0c0c0e');
    doc.fillColor('#f5a524').fontSize(16).text('WorldHashGraph', 48, 20);
    doc
      .fillColor('#ffffff')
      .fontSize(9)
      .text('x402 PAY-PER-REPORT DEMO', doc.page.width - 200, 24, {
        width: 150,
        align: 'right',
      });

    doc.fillColor('#111').fontSize(18).text('Follow Intelligence Report', 48, 80);
    doc
      .fontSize(10)
      .fillColor('#555')
      .text(
        'Pay-per-request content unlocked via HTTP 402 / x402 exact scheme on Hedera.',
        48,
        108,
        { width: 500 }
      );

    doc.moveDown(2);
    doc.fillColor('#111').fontSize(12).text('Payment receipt', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#222');
    doc.text(`List price: ${listPrice}`);
    doc.text(`Settlement: ${settlementDisplay}`);
    doc.text(`Merchant (payTo): ${payTo}`);
    doc.text(`Payment ref: ${paymentRef || 'n/a'}`);
    if (hashscan) {
      doc.fillColor('#1d4ed8').text(hashscan, { link: hashscan, underline: true });
    }

    doc.moveDown();
    doc.fillColor('#111').fontSize(12).text('What this demonstrates', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#333');
    const bullets = [
      'Resource server returns HTTP 402 with x402 PaymentRequirements (exact scheme).',
      'Client pays on Hedera testnet (HBAR stand-in for 1 USDC list price).',
      'Server verifies on-chain credit to merchant via mirror node (or facilitator).',
      'Only then is the protected PDF resource returned — classic pay-per-read.',
    ];
    for (const b of bullets) {
      doc.text(`• ${b}`, { width: 500 });
      doc.moveDown(0.3);
    }

    doc.moveDown();
    doc
      .fontSize(9)
      .fillColor('#666')
      .text(
        'Demo PDF for the Hedera x402 pay-per-request pattern: HTTP 402 unlocks this file only after on-chain settlement.',
        { width: 500 }
      );

    doc.end();
  });
}
