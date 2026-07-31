# WorldHashGraph × Hedera x402 — Pay-per-report

Open-source **pay-per-request** demo: unlock a sample intelligence PDF after an on-chain payment on **Hedera testnet**, using the [x402](https://www.x402.org/) pattern (HTTP **402 Payment Required** + exact settlement).

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## What it does

| Step | Behavior |
|------|----------|
| 1 | Client requests a protected PDF report |
| 2 | Server responds **HTTP 402 Payment Required** with x402 `accepts[]` (`scheme: exact`, `network: hedera:testnet`) |
| 3 | Client pays **1 USDC list price** as **HBAR stand-in** on testnet (faucet-friendly) to merchant `payTo` |
| 4 | Server **verifies on-chain** (Hedera mirror) — optional Blocky402 facilitator path |
| 5 | Server returns the PDF only after successful settlement |

This matches the bounty’s **pay-to-read** style architecture: discrete pay → unlock content on Hedera rails.

## Quick start (Path A — our merchant)

Uses WorldHashGraph merchant **`0.0.5823639`** and the **example HashScan settlements** below. No HashPack required. Payment reuse is on by default, so every judge can unlock repeatedly with the same links (txs are never “used up”).

```bash
git clone https://github.com/seapilot33/whg-x402-pay-per-report.git
cd whg-x402-pay-per-report
cp .env.example .env
# Merchant is already set for Path A:
# REPORT_PAY_TO=0.0.5823639
npm install
npm start
```

Open [http://localhost:4020](http://localhost:4020)

1. Confirm **Merchant** shows **`0.0.5823639`** (from `.env` — not typed in the browser)
2. Click **POST /api/report (expect 402)** — inspect PaymentRequirements
3. Paste any example settlement (full URL or timestamp id) → **Unlock PDF**:
   - `https://hashscan.io/testnet/transaction/1785524623.823584002`
   - `https://hashscan.io/testnet/transaction/1785524448.269824104`
   - `https://hashscan.io/testnet/transaction/1785520906.165578104`
4. Example path id only also works: `1785524623.823584002`

### Merchant account (`REPORT_PAY_TO`)

There is **no browser field** for the merchant id — the **resource server** owns `payTo` (so clients cannot redirect payments).

| Where | What |
|-------|------|
| `.env` / `.env.example` | `REPORT_PAY_TO=0.0.5823639` (our merchant — Path A) |
| UI | Displays merchant + HashScan link from `GET /api/pricing` |
| Restart | Required after changing `.env` |
| Reuse | `ALLOW_PAYMENT_REUSE=true` by default — sample txs never “block” for later judges |

Merchant HashScan:  
`https://hashscan.io/testnet/account/0.0.5823639`

Optional: to pay yourself with HashPack instead, set `REPORT_PAY_TO` to your own testnet account, restart, send the displayed HBAR to that account, then paste *your* new transaction id. Example settlements only verify against **`0.0.5823639`**.

## HTTP API

### `GET /api/pricing`

Returns list price (1 USDC), HBAR equivalent, merchant, facilitator, and `accepts[]`.

### `POST /api/report`

| Body / header | Result |
|---------------|--------|
| (none) | **402** + `x402Version` + `accepts` |
| `{ "transactionId": "0.0.x@s.n" }` | Mirror-verify → **PDF** |
| `PAYMENT-SIGNATURE` / `paymentPayload` | Facilitator verify/settle path → **PDF** |
| Reused payment | **409** only if `ALLOW_PAYMENT_REUSE=false` |

## Architecture

```
┌────────────┐   POST /api/report    ┌─────────────────────┐
│  Client    │ ───────────────────► │  Resource server    │
│ HashPack   │   (no payment)       │  Express            │
└─────┬──────┘                      │  → HTTP 402         │
      │                             │  accepts: exact     │
      │  Transfer HBAR/USDC         └──────────┬──────────┘
      │  to payTo                               │
      ▼                                         │ verify
┌────────────┐   transactionId                  │
│  Hedera    │ ◄────────────────────────────────┤
│  testnet   │   mirror / Blocky402             │
└────────────┘                                  ▼
                                         PDF resource
```

### Settlement policy

| Network | Asset | Notes |
|---------|--------|--------|
| **Testnet** | HBAR (`0.0.0`) | ≈ $1 at live HBAR/USD; easy faucet funding |
| **Mainnet** | Circle USDC `0.0.456858` | When `HEDERA_NETWORK=mainnet` |

## Example on-chain settlements (Hedera testnet)

Merchant (receives report payments):

- https://hashscan.io/testnet/account/0.0.5823639

Sample pay-per-report transfers (open each for full transfer details):

- https://hashscan.io/testnet/transaction/1785524623.823584002  
- https://hashscan.io/testnet/transaction/1785524448.269824104  
- https://hashscan.io/testnet/transaction/1785520906.165578104  

These links prove **on-chain settlement** (always viewable on HashScan). They are **safe for every judge to reuse** — this demo defaults to **`ALLOW_PAYMENT_REUSE=true`**, so unlocking with an example `transactionId` does **not** block the next person. Set `ALLOW_PAYMENT_REUSE=false` only if you want local one-payment → one-unlock testing.

Paste either the **full HashScan URL** or the path id (e.g. `1785524623.823584002`) into Unlock PDF — both work.  
Requires `REPORT_PAY_TO=0.0.5823639` (the `.env.example` default).

## References

- [Hedera x402 docs](https://docs.hedera.com/solutions/ai/x402)  
- [x402 standard](https://www.x402.org/)  
- [Blocky402 facilitator](https://blocky402.com/)  
- [Hedera WalletConnect](https://www.npmjs.com/package/@hashgraph/hedera-wallet-connect)  

## License

Apache-2.0 — see [LICENSE](LICENSE).

## Author

WorldHashGraph · Hedera · agent economy intelligence.
