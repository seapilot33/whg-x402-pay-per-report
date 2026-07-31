const $ = (id) => document.getElementById(id);
const msg = (text, ok) => {
  const el = $('msg');
  el.textContent = text;
  el.className = ok ? 'ok' : 'err';
};

let pricing = null;

async function loadPricing() {
  const res = await fetch('/api/pricing');
  pricing = await res.json();
  $('price').innerHTML = `
    <strong class="spark" style="font-size:1.1rem">${pricing.list_price_label}</strong>
    ≈ <strong>${Number(pricing.hbar_equivalent).toFixed(4)} HBAR</strong>
    at $${Number(pricing.hbar_usd).toFixed(4)}/ℏ<br/>
    <span style="color:var(--muted);font-size:0.8rem">
      Settlement: ${pricing.settlement_amount_display} · network ${pricing.network} ·
      scheme <code>${pricing.scheme}</code><br/>
      Send this amount on <strong>testnet</strong> to the merchant account below.
    </span>`;
  const link = $('merchantLink');
  link.href = pricing.merchant_hashscan || '#';
  link.textContent = pricing.pay_to || '(set REPORT_PAY_TO in .env and restart)';
}

$('btn402').onclick = async () => {
  const res = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  $('out402').textContent = `HTTP ${res.status}\n` + JSON.stringify(data, null, 2);
};

$('btnHashscan').onclick = () => {
  if (pricing?.merchant_hashscan) window.open(pricing.merchant_hashscan, '_blank');
};

$('btnPay').onclick = async () => {
  const transactionId = $('tx').value.trim();
  if (!transactionId) {
    msg('Paste a transaction id first', false);
    return;
  }
  msg('Verifying on-chain payment…', true);
  const res = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    msg(data.mirror_error || data.message || data.error || `HTTP ${res.status}`, false);
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `whg-x402-report-${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.open(url, '_blank');
  msg(`Unlocked PDF (${Math.round(blob.size / 1024)} KB)`, true);
};

loadPricing().catch((e) => {
  $('price').textContent = 'Failed to load pricing: ' + e.message;
});
