/**
 * Minimal x402 resource server — pay 1 USDC (HBAR stand-in on testnet) per PDF.
 *
 * Flow:
 *  1. GET  /api/pricing          → price + PaymentRequirements template
 *  2. POST /api/report           → without payment → 402 + accepts[]
 *  3. Client pays on Hedera (HashPack) or submits x402 payload
 *  4. POST /api/report { transactionId } → mirror verify → PDF
 *
 * Production WorldHashGraph uses the same pattern inside a larger API.
 */
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import {
  buildPricing,
  paymentRequirements,
  verifyMirrorPayment,
  settleViaFacilitator,
  hashscanAccount,
  hashscanTx,
  payTo,
  normalizeTxId,
} from './x402.js';
import { renderSamplePdf } from './pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4020);
/**
 * Replay protection: one on-chain payment → one unlock.
 * For public demos / bounty judges re-trying README example txs, default is OFF
 * (ALLOW_PAYMENT_REUSE=true). Set ALLOW_PAYMENT_REUSE=false for production-like behavior.
 */
const allowPaymentReuse = (() => {
  const v = (process.env.ALLOW_PAYMENT_REUSE || 'true').toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off';
})();
const usedPayments = new Set();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../client')));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'whg-x402-pay-per-report' });
});

app.get('/api/pricing', async (_req, res) => {
  try {
    const pricing = await buildPricing();
    const resource = `${_req.protocol}://${_req.get('host')}/api/report`;
    res.json({
      ...pricing,
      accepts: [paymentRequirements(pricing, resource)],
      merchant_hashscan: hashscanAccount(pricing.pay_to),
      docs: {
        x402: 'https://docs.hedera.com/solutions/ai/x402',
        bounty: 'https://hedera.com/x402-bounty/',
      },
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'pricing failed' });
  }
});

/**
 * Protected resource.
 * Headers:
 *   PAYMENT-SIGNATURE: base64 JSON x402 PaymentPayload (optional)
 * Body:
 *   transactionId: mirror-verified CRYPTO transfer (primary HashPack path)
 *   paymentPayload: object (optional facilitator path)
 */
app.post('/api/report', async (req, res) => {
  const pricing = await buildPricing();
  const resource = `${req.protocol}://${req.get('host')}/api/report`;
  const accepts = [paymentRequirements(pricing, resource)];

  let paymentMeta = { method: 'none', ref: null, hashscan: null };

  const sig =
    req.headers['payment-signature'] ||
    req.headers['x-payment'] ||
    '';
  const bodyPayload = req.body?.paymentPayload;
  const txId = String(req.body?.transactionId || req.body?.transaction_id || '').trim();

  let paid = false;

  if (sig || bodyPayload) {
    let payload = bodyPayload;
    if (!payload && sig) {
      try {
        payload = JSON.parse(Buffer.from(String(sig), 'base64').toString('utf8'));
      } catch {
        try {
          payload = JSON.parse(String(sig));
        } catch {
          payload = null;
        }
      }
    }
    if (payload) {
      if (!payload.accepted) payload.accepted = accepts[0];
      const settled = await settleViaFacilitator(payload);
      if (settled.ok) {
        const key = settled.transactionId || JSON.stringify(payload).slice(0, 64);
        if (!allowPaymentReuse && usedPayments.has(key)) {
          return res.status(409).json({ error: 'Payment already used' });
        }
        if (!allowPaymentReuse) usedPayments.add(key);
        paid = true;
        paymentMeta = {
          method: 'x402-facilitator',
          ref: settled.transactionId,
          hashscan: settled.transactionId ? hashscanTx(settled.transactionId) : null,
        };
      } else {
        return res.status(402).json({
          error: 'Payment Required',
          x402Version: 2,
          accepts,
          facilitator_error: settled.error,
          message: `Pay ${pricing.list_price_label} (~${pricing.settlement_amount_display})`,
        });
      }
    }
  } else if (txId) {
    const v = await verifyMirrorPayment(txId, pricing);
    const key = v.normalizedId || normalizeTxId(txId).id || txId;
    if (v.ok && !allowPaymentReuse && usedPayments.has(key)) {
      return res.status(409).json({
        error: 'Payment already used for a report',
        transactionId: key,
        hint: 'Set ALLOW_PAYMENT_REUSE=true (default in this demo) to re-unlock with the same tx for testing.',
      });
    }
    if (!v.ok) {
      return res.status(402).json({
        error: 'Payment verification failed',
        x402Version: 2,
        accepts,
        mirror_error: v.error,
        message: `Send ${pricing.settlement_amount_display} to ${pricing.pay_to} on ${pricing.hedera_network}, then resubmit transactionId.`,
        merchant_hashscan: hashscanAccount(pricing.pay_to),
      });
    }
    if (!allowPaymentReuse) usedPayments.add(key);
    paid = true;
    // Prefer human @ form for HashScan links when possible
    const displayId = txId.includes('@') ? txId : key;
    paymentMeta = {
      method: 'mirror-verified',
      ref: displayId,
      hashscan: hashscanTx(
        displayId.includes('@')
          ? displayId
          : key.replace(/^(\d+\.\d+\.\d+)-(\d+)-(\d+)$/, '$1@$2.$3')
      ),
    };
  }

  if (!paid) {
    return res.status(402).json({
      error: 'Payment Required',
      x402Version: 2,
      accepts,
      pricing: {
        list_price_usdc: pricing.list_price_usdc,
        settlement_amount_display: pricing.settlement_amount_display,
        pay_to: pricing.pay_to,
        network: pricing.network,
      },
      message: `Pay ${pricing.list_price_label} (~${pricing.settlement_amount_display}) via HashPack / x402 to unlock this report.`,
      merchant_hashscan: hashscanAccount(pricing.pay_to),
    });
  }

  try {
    const pdf = await renderSamplePdf({
      paymentRef: paymentMeta.ref,
      payTo: pricing.pay_to,
      settlementDisplay: pricing.settlement_amount_display,
      listPrice: pricing.list_price_label,
      hashscan: paymentMeta.hashscan,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="whg-x402-report-${Date.now()}.pdf"`
    );
    res.setHeader('X-WHG-Payment-Method', paymentMeta.method);
    if (paymentMeta.ref) res.setHeader('X-WHG-Payment-Ref', paymentMeta.ref);
    if (paymentMeta.hashscan) res.setHeader('X-WHG-HashScan', paymentMeta.hashscan);
    res.send(pdf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'PDF failed' });
  }
});

app.listen(PORT, () => {
  console.log(`whg-x402-pay-per-report on http://localhost:${PORT}`);
  console.log(`Merchant payTo: ${payTo()}`);
  console.log(
    `Payment reuse: ${allowPaymentReuse ? 'ALLOWED (demo default)' : 'BLOCKED (one unlock per tx)'}`
  );
  console.log(`Pricing: http://localhost:${PORT}/api/pricing`);
  console.log(`Demo UI:  http://localhost:${PORT}/`);
});
