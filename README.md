# SmartPrep API — Express + TypeScript + MongoDB

Initial transactional backend for **Ingredients, Stock Batches, Stock Movements, Suppliers, Supplier Products, and Purchase Orders**.

## Prerequisites
- Node.js 22+
- Docker with Compose
- npm

## Start

```bash
cp .env.example .env
npm install
docker compose up -d
# First boot may take a few seconds for replica-set initialization
npm run seed
npm run dev
```

API is at `http://localhost:4000/api`. Check `GET /api/health`.

MongoDB multi-document transactions require a replica set or a sharded cluster; the Compose file configures a local **single-node replica set**, suitable for development only. Production needs auth, a managed replica set, backups, monitoring, HTTPS, rate-limiting, and per-restaurant tenancy.

**Data caveat:** MongoDB development timestamps use UTC date strings. For a real restaurant account, date calculations must use its configured IANA time zone and business calendar.

## REST API

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/health` | Health |
| GET | `/api/ingredients` | Ingredient list with computed stock/expiry |
| POST | `/api/ingredients` | Add ingredient |
| PUT | `/api/ingredients/:id` | Edit ingredient (unit immutable) |
| GET | `/api/stock-batches?ingredientId=buns` | On-hand batches |
| GET | `/api/stock-movements?ingredientId=buns` | Latest 200 movements |
| POST | `/api/ingredients/:id/stock-adjustments` | Receive / consume / waste / correction |
| GET | `/api/suppliers` | Suppliers |
| GET | `/api/supplier-products` | Catalog |
| GET | `/api/purchase-orders` | Orders |
| POST | `/api/purchase-orders` | Create draft from catalog items |
| PATCH | `/api/purchase-orders/:id/status` | Place / cancel |
| POST | `/api/purchase-orders/:id/receive` | Receive in transaction |

API examples:

```bash
curl http://localhost:4000/api/ingredients

curl -X POST http://localhost:4000/api/ingredients/buns/stock-adjustments \
 -H 'Content-Type: application/json' \
 -d '{"type":"receive","quantity":40,"expiryDate":"2026-12-31","note":"Delivery"}'

curl -X POST http://localhost:4000/api/purchase-orders \
 -H 'Content-Type: application/json' \
 -d '{"supplierId":"supplier-general","lines":[{"supplierProductId":"sp-buns","quantity":240}]}'

curl -X PATCH http://localhost:4000/api/purchase-orders/ORDER_ID/status \
 -H 'Content-Type: application/json' -d '{"status":"ordered"}'

# The response to GET /api/purchase-orders includes each order line's ID:
curl -X POST http://localhost:4000/api/purchase-orders/ORDER_ID/receive \
 -H 'Content-Type: application/json' \
 -d '{"lines":[{"orderLineId":"LINE_ID","quantity":240,"expiryDate":"2026-12-31"}]}'
```

## Guarantees and constraints
- Receiving an order and creating batches/movements happen in **one MongoDB transaction**.
- Receipt status is conditionally claimed and movement receipt keys have a unique compound index.
- FEFO batch deductions are transactional and use conditional quantity updates.
- Ingredient piece quantities must be integers.
- Order lines are validated against supplier catalog prices, units, pack sizes and minimum quantities.
- Supplier minimum **order value** is checked at placement.
- Only full deliveries are supported; no partial receipts.
- Supplier/catalog endpoints are seeded read-only at this stage.
- Forecast and recipe logic is still implemented in React; a later backend phase can add sales/recipes/forecast endpoints.
- Drafts are not treated as confirmed incoming stock; ordered purchases are.
- Expired batches cannot be used for kitchen consumption, but corrections/waste are allowed.
- No authentication, roles, restaurant isolation, or retry-safe HTTP idempotency keys yet. Do not expose this service publicly.

## Frontend migration
See `FRONTEND_INTEGRATION.md`. Keep your current React components, replace Zustand mutations with HTTP calls and refetch server-derived data. **Do not write both localStorage inventory and the API** or you will duplicate stock.

## Verify
```bash
npm run typecheck
npm run build
```
