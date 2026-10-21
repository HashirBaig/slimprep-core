# React integration steps

## Step 1: API client

Create `src/lib/api.ts` in the existing Vite React app:

```ts
import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
  timeout: 15000,
});
```

In React `.env.local`:

```env
VITE_API_URL=http://localhost:5000/api
```

## Step 2: Read inventory

```ts
import { api } from "@/lib/api";
import type { Ingredient } from "@/types/dashboard";
import type { StockBatch, StockMovement } from "@/types/inventory";

export const inventoryApi = {
  listIngredients: async () =>
    (await api.get<Ingredient[]>("/ingredients")).data,
  listBatches: async () => (await api.get<StockBatch[]>("/stock-batches")).data,
  listMovements: async () =>
    (await api.get<StockMovement[]>("/stock-movements")).data,
  addIngredient: async (
    input: Omit<Ingredient, "id" | "stock" | "expiresInDays">,
  ) => (await api.post("/ingredients", input)).data,
  updateIngredient: async (
    id: string,
    input: Omit<Ingredient, "id" | "stock" | "expiresInDays">,
  ) => (await api.put(`/ingredients/${id}`, input)).data,
  adjustStock: async (
    id: string,
    input: {
      type: "receive" | "use" | "waste" | "adjust-in" | "adjust-out";
      quantity: number;
      expiryDate?: string | null;
      note: string;
    },
  ) => (await api.post(`/ingredients/${id}/stock-adjustments`, input)).data,
};
```

Note: backend `GET /ingredients` already includes derived `stock` and `expiresInDays`; do not recompute them from a stale Zustand cache.

## Step 3: Purchasing

```ts
export const purchaseApi = {
  listSuppliers: async () => (await api.get("/suppliers")).data,
  listProducts: async () => (await api.get("/supplier-products")).data,
  listOrders: async () => (await api.get("/purchase-orders")).data,
  createDraft: async (
    supplierId: string,
    lines: { supplierProductId: string; quantity: number }[],
  ) => (await api.post("/purchase-orders", { supplierId, lines })).data,
  updateStatus: async (id: string, status: "ordered" | "cancelled") =>
    (await api.patch(`/purchase-orders/${id}/status`, { status })).data,
  receive: async (
    id: string,
    lines: {
      orderLineId: string;
      quantity: number;
      expiryDate: string | null;
    }[],
  ) => (await api.post(`/purchase-orders/${id}/receive`, { lines })).data,
};
```

**Important:** The existing frontend `PurchaseSuggestion` has `ingredientId`, `supplierProductId`, price and cost fields. The API create-draft operation accepts **only** supplier ID and the catalog product ID + quantity, and re-prices/validates the lines server-side. Receiving updates backend inventory automatically; it must not also call `useInventoryStore.adjustStock()`.

## Step 4: Migrate views in stages

1. Introduce asynchronous loading/error states in `useInventoryData` or a new `useInventoryQuery` hook.
2. Convert `IngredientDialog` to `POST/PUT`; `StockDialog` to stock-adjustment API; then refetch ingredients/batches/movements.
3. Convert Purchase Orders components to GET/POST/PATCH endpoints and refetch after mutations.
4. Keep forecast engine frontend-only for now, using the fresh ingredient array returned by API.
5. Remove or disable persisted Zustand state for server-owned records once the API is enabled. Browser localStorage from the old demo should be cleared intentionally for testing.

For production, use TanStack Query or an equivalent caching layer and include authentication, restaurant scope, error display, optimistic concurrency, and request IDs.
