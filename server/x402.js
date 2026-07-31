/**
 * x402 helpers for Hedera exact scheme (testnet).
 * Spec: https://docs.hedera.com/solutions/ai/x402
 * Facilitator example: https://api.testnet.blocky402.com
 */

const TINYBARS = 100_000_000;

export const USDC = {
  mainnet: '0.0.456858',
  testnet: '0.0.429274',
};

export function env(name, fallback = '') {
  return (process.env[name] || fallback).trim();
}

/** Treat placeholders / empty as unset so fallbacks work */
function accountEnv(name) {
  const v = env(name, '');
  if (!v) return '';
  if (/YOUR_|PLACEHOLDER|TODO|xxx/i.test(v)) return '';
  if (!/^0\.0\.\d+$/.test(v)) return '';
  return v;
}

export function payTo() {
  return (
    accountEnv('REPORT_PAY_TO') ||
    accountEnv('HEDERA_ACCOUNT_ID') ||
    '0.0.5823639'
  );
}

export function network() {
  return env('HEDERA_NETWORK', 'testnet') === 'mainnet' ? 'mainnet' : 'testnet';
}

export function caipNetwork() {
  return env('X402_NETWORK', `hedera:${network()}`);
}

export function facilitator() {
  return env(
    'X402_FACILITATOR_URL',
    network() === 'mainnet'
      ? 'https://api.blocky402.com'
      : 'https://api.testnet.blocky402.com'
  ).replace(/\/$/, '');
}

export function feePayer() {
  return env('X402_FEE_PAYER', '0.0.7162784');
}

export function mirrorBase() {
  return network() === 'mainnet'
    ? 'https://mainnet-public.mirrornode.hedera.com'
    : 'https://testnet.mirrornode.hedera.com';
}

export function hashscanTx(txId) {
  const net = network();
  // HashScan accepts @ form in paths when encoded
  return `https://hashscan.io/${net}/transaction/${encodeURIComponent(txId)}`;
}

export function hashscanAccount(accountId) {
  return `https://hashscan.io/${network()}/account/${accountId}`;
}

let hbarUsdCache = { t: 0, usd: 0.068 };

export async function hbarUsd() {
  const now = Date.now();
  if (now - hbarUsdCache.t < 10 * 60 * 1000 && hbarUsdCache.usd > 0) {
    return hbarUsdCache.usd;
  }
  const fallback = Number(env('HBAR_USD_PRICE', '0.068'));
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd',
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const j = await res.json();
      const usd = Number(j?.['hedera-hashgraph']?.usd);
      if (usd > 0) {
        hbarUsdCache = { t: now, usd };
        return usd;
      }
    }
  } catch {
    /* fallback */
  }
  hbarUsdCache = { t: now, usd: fallback };
  return fallback;
}

/**
 * List price: 1 USDC.
 * Testnet settlement: HBAR stand-in (faucet-friendly).
 * Mainnet path: Circle USDC HTS when HEDERA_NETWORK=mainnet.
 */
export async function buildPricing() {
  const listUsdc = Number(env('REPORT_PRICE_USDC', '1'));
  const usd = await hbarUsd();
  const hbarEq = listUsdc / usd;
  const net = network();
  const settleUsdc = net === 'mainnet' && env('REPORT_SETTLE_ASSET', '') !== 'HBAR';

  if (settleUsdc) {
    const units = String(Math.round(listUsdc * 1e6));
    return {
      list_price_usdc: listUsdc,
      list_price_label: `${listUsdc} USDC`,
      settlement_mode: 'usdc',
      settlement_asset: USDC.mainnet,
      settlement_asset_symbol: 'USDC',
      settlement_amount: units,
      settlement_amount_display: `${listUsdc} USDC`,
      hbar_usd: usd,
      hbar_equivalent: hbarEq,
      network: caipNetwork(),
      hedera_network: net,
      pay_to: payTo(),
      fee_payer: feePayer(),
      facilitator: facilitator(),
      scheme: 'exact',
      x402_version: 2,
      hashscan_base: `https://hashscan.io/${net}`,
    };
  }

  const tiny = String(Math.round(hbarEq * TINYBARS));
  return {
    list_price_usdc: listUsdc,
    list_price_label: `${listUsdc} USDC`,
    settlement_mode: 'hbar_standin',
    settlement_asset: '0.0.0',
    settlement_asset_symbol: 'HBAR',
    settlement_amount: tiny,
    settlement_amount_display: `${hbarEq.toFixed(4)} HBAR`,
    hbar_usd: usd,
    hbar_equivalent: hbarEq,
    tinybars: tiny,
    network: caipNetwork(),
    hedera_network: net,
    pay_to: payTo(),
    fee_payer: feePayer(),
    facilitator: facilitator(),
    scheme: 'exact',
    x402_version: 2,
    hashscan_base: `https://hashscan.io/${net}`,
  };
}

/** x402 PaymentRequirements (HTTP 402 body accepts[]) */
export function paymentRequirements(pricing, resourceUrl) {
  return {
    scheme: 'exact',
    network: pricing.network,
    amount: pricing.settlement_amount,
    asset: pricing.settlement_asset,
    payTo: pricing.pay_to,
    maxTimeoutSeconds: 300,
    resource: resourceUrl,
    description: `WHG Follow Intelligence Report — ${pricing.list_price_label}`,
    mimeType: 'application/pdf',
    extra: {
      feePayer: pricing.fee_payer,
      facilitator: pricing.facilitator,
      listPriceUsdc: pricing.list_price_usdc,
      settlementMode: pricing.settlement_mode,
      settlementAmountDisplay: pricing.settlement_amount_display,
      hbarUsd: pricing.hbar_usd,
      hbarEquivalent: pricing.hbar_equivalent,
      product: 'follow-intelligence-report',
      x402Bounty: true,
    },
  };
}

/**
 * Accepts:
 * - 0.0.x@seconds.nanos  (HashPack / many UIs)
 * - 0.0.x-seconds-nanos (mirror path form)
 * - seconds.nanos only (HashScan URL path often uses consensus timestamp)
 * - full HashScan URL
 */
export function normalizeTxId(raw) {
  let s = String(raw || '').trim();
  if (!s) return { id: '', kind: 'empty', variants: [] };
  try {
    if (s.startsWith('http')) {
      const u = new URL(s);
      const parts = u.pathname.split('/').filter(Boolean);
      const i = parts.findIndex((p) => p === 'transaction' || p === 'transactions');
      if (i >= 0 && parts[i + 1]) s = decodeURIComponent(parts[i + 1]);
    }
  } catch {
    /* keep */
  }
  s = s.split('?')[0].split('#')[0].trim();

  const variants = new Set([s]);
  const at = s.match(/^(0\.0\.\d+)@(\d+)\.(\d+)$/);
  if (at) {
    const dash = `${at[1]}-${at[2]}-${at[3]}`;
    variants.add(dash);
    variants.add(`${at[2]}.${at[3]}`); // consensus ts
    return { id: dash, kind: 'txid', variants: [...variants] };
  }
  const dash = s.match(/^(0\.0\.\d+)-(\d+)-(\d+)$/);
  if (dash) {
    variants.add(`${dash[1]}@${dash[2]}.${dash[3]}`);
    variants.add(`${dash[2]}.${dash[3]}`);
    return { id: s, kind: 'txid', variants: [...variants] };
  }
  // HashScan consensus timestamp only: 1785524623.823584002
  const ts = s.match(/^(\d+)\.(\d+)$/);
  if (ts) {
    return { id: s, kind: 'timestamp', variants: [s] };
  }
  return { id: s, kind: 'unknown', variants: [...variants] };
}

async function fetchMirrorTxById(tid) {
  const base = mirrorBase();
  const pathRes = await fetch(`${base}/api/v1/transactions/${encodeURIComponent(tid)}`);
  if (pathRes.ok) {
    const body = await pathRes.json();
    return body?.transactions?.[0] || body;
  }
  const qRes = await fetch(
    `${base}/api/v1/transactions?transactionid=${encodeURIComponent(tid)}&limit=1`
  );
  if (qRes.ok) {
    const list = await qRes.json();
    return list?.transactions?.[0] || null;
  }
  return null;
}

/** HashScan links often use consensus timestamp, not transaction id */
async function fetchMirrorTxByTimestamp(ts) {
  const base = mirrorBase();
  for (const q of [`timestamp=eq:${ts}`, `timestamp=${ts}`]) {
    const res = await fetch(`${base}/api/v1/transactions?${q}&limit=5`);
    if (!res.ok) continue;
    const list = await res.json();
    const txs = list?.transactions || [];
    if (txs.length) {
      // Prefer CRYPTOTRANSFER success
      const prefer =
        txs.find(
          (t) =>
            String(t.result) === 'SUCCESS' &&
            String(t.name || '').toUpperCase().includes('TRANSFER')
        ) || txs.find((t) => String(t.result) === 'SUCCESS') || txs[0];
      return prefer;
    }
  }
  return null;
}

/**
 * Verify merchant received exact settlement (HBAR tinybars or USDC base units).
 * This is the resource-server gate after client pays on Hedera.
 */
export async function verifyMirrorPayment(txId, pricing) {
  const { id, kind, variants } = normalizeTxId(txId);
  if (!id) return { ok: false, error: 'Missing transaction id' };

  let tx = null;
  let used = id;

  if (kind === 'timestamp') {
    tx = await fetchMirrorTxByTimestamp(id);
    if (tx?.transaction_id) used = tx.transaction_id;
  } else {
    for (const v of variants) {
      if (v.includes('@')) continue;
      if (/^\d+\.\d+$/.test(v)) {
        tx = await fetchMirrorTxByTimestamp(v);
        if (tx) {
          used = tx.transaction_id || v;
          break;
        }
        continue;
      }
      tx = await fetchMirrorTxById(v);
      if (tx) {
        used = v;
        break;
      }
    }
    if (!tx) tx = await fetchMirrorTxById(id);
  }

  if (!tx) {
    return {
      ok: false,
      error: `Transaction not found on ${pricing.hedera_network} mirror: ${txId}`,
      normalizedId: id,
    };
  }

  const result = String(tx.result || tx.transaction_result || '');
  if (result && result !== 'SUCCESS') {
    return { ok: false, error: `Tx result ${result}`, normalizedId: used };
  }

  const payTo = pricing.pay_to;
  if (pricing.settlement_mode === 'hbar_standin') {
    const transfers = tx.transfers || [];
    const credited = transfers
      .filter((t) => t.account === payTo && Number(t.amount) > 0)
      .reduce((s, t) => s + Number(t.amount), 0);
    const need = Number(pricing.settlement_amount);
    if (credited < need * 0.95) {
      return {
        ok: false,
        error: `Need ~${pricing.settlement_amount_display} to ${payTo}; credited ${credited / TINYBARS} HBAR`,
        normalizedId: used,
      };
    }
    return {
      ok: true,
      normalizedId: used,
      paidHbar: credited / TINYBARS,
      hashscan: hashscanTx(used.includes('-') ? used.replace(/-(\d+)-/, '@$1.').replace(/-(\d+)$/, '.$1') : used),
    };
  }

  // USDC path
  const tokenTransfers = tx.token_transfers || [];
  const credited = tokenTransfers
    .filter(
      (t) =>
        String(t.token_id) === pricing.settlement_asset &&
        String(t.account) === payTo &&
        Number(t.amount) > 0
    )
    .reduce((s, t) => s + Number(t.amount), 0);
  if (credited < Number(pricing.settlement_amount)) {
    return { ok: false, error: `USDC credit too small: ${credited}`, normalizedId: used };
  }
  return { ok: true, normalizedId: used, hashscan: hashscanTx(used) };
}

/** Optional: forward x402 PaymentPayload to Blocky402 facilitator */
export async function settleViaFacilitator(paymentPayload) {
  const base = facilitator();
  try {
    const verifyRes = await fetch(`${base}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentPayload),
    });
    const verifyBody = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok) {
      return { ok: false, error: `verify ${verifyRes.status}`, raw: verifyBody };
    }
    const settleRes = await fetch(`${base}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentPayload),
    });
    const settleBody = await settleRes.json().catch(() => ({}));
    if (!settleRes.ok || settleBody?.success === false) {
      return { ok: false, error: `settle ${settleRes.status}`, raw: settleBody };
    }
    return {
      ok: true,
      transactionId: settleBody.transactionId || settleBody.transaction_id,
      raw: settleBody,
    };
  } catch (e) {
    return { ok: false, error: e?.message || 'facilitator unreachable' };
  }
}
