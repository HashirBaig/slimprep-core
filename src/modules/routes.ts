import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { validate, HttpError } from "../lib/http.js";
import {
  CATEGORIES,
  UNITS,
  IngredientModel,
  StockBatchModel,
  StockMovementModel,
  SupplierModel,
  SupplierProductModel,
  PurchaseOrderModel,
} from "../models/index.js";
import { adjustStock, stockSchema } from "./stock.js";
import {
  changeOrderStatus,
  createDraft,
  draftSchema,
  receiveOrder,
  receiptSchema,
} from "./orders.js";

const router = Router();
const ingredientBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    emoji: z.string().min(1).max(12).default("📦"),
    category: z.enum(CATEGORIES),
    unit: z.enum(UNITS),
    unitCost: z.number().nonnegative(),
    minimumStock: z.number().nonnegative(),
  })
  .strict();
const paramsId = (value: unknown) => {
  if (typeof value !== "string" || !value.trim())
    throw new HttpError(400, "Invalid ID");
  return value;
};

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
router.get("/ingredients", async (_req, res) => {
  const [items, batches] = await Promise.all([
    IngredientModel.find().sort({ name: 1 }).lean(),
    StockBatchModel.find({ quantity: { $gt: 0 } }).lean(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const list = items.map(({ _id, ...item }) => {
    const own = batches.filter((b) => b.ingredientId === item.id);
    const dated = own
      .map((b) => b.expiryDate)
      .filter((d): d is string => d !== null)
      .sort();
    const earliest = dated[0];
    const expiresInDays = earliest
      ? Math.round(
          (Date.parse(`${earliest}T00:00:00Z`) -
            Date.parse(`${today}T00:00:00Z`)) /
            86400000,
        )
      : null;
    return {
      ...item,
      stock:
        Math.round(own.reduce((sum, b) => sum + b.quantity, 0) * 1e6) / 1e6,
      expiresInDays,
    };
  });
  res.json(list);
});
router.post("/ingredients", validate(ingredientBody), async (req, res) => {
  const { unit, minimumStock } = req.body;
  if (unit === "pcs" && !Number.isInteger(minimumStock))
    throw new HttpError(400, "Piece threshold must be an integer");
  const item = await IngredientModel.create({ id: randomUUID(), ...req.body });
  res.status(201).json(item);
});
router.put("/ingredients/:id", validate(ingredientBody), async (req, res) => {
  const id = paramsId(req.params.id);
  const old = await IngredientModel.findOne({ id }).lean();
  if (!old) throw new HttpError(404, "Ingredient not found");
  if (old.unit !== req.body.unit)
    throw new HttpError(
      409,
      "Changing an established ingredient unit is not supported",
    );
  if (req.body.unit === "pcs" && !Number.isInteger(req.body.minimumStock))
    throw new HttpError(400, "Piece threshold must be an integer");
  const updated = await IngredientModel.findOneAndUpdate(
    { id },
    { $set: req.body },
    { new: true, runValidators: true },
  );
  res.json(updated);
});
router.get("/stock-batches", async (req, res) => {
  const ingredientId =
    typeof req.query.ingredientId === "string"
      ? req.query.ingredientId
      : undefined;
  res.json(
    await StockBatchModel.find(ingredientId ? { ingredientId } : {})
      .sort({ expiryDate: 1 })
      .lean(),
  );
});
router.get("/stock-movements", async (req, res) => {
  const ingredientId =
    typeof req.query.ingredientId === "string"
      ? req.query.ingredientId
      : undefined;
  res.json(
    await StockMovementModel.find(ingredientId ? { ingredientId } : {})
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  );
});
router.post(
  "/ingredients/:id/stock-adjustments",
  validate(stockSchema),
  async (req, res) => {
    await adjustStock(paramsId(req.params.id), req.body);
    res.status(201).json({ message: "Stock adjusted" });
  },
);
router.get("/suppliers", async (_req, res) => {
  res.json(await SupplierModel.find().lean());
});
router.get("/supplier-products", async (_req, res) => {
  res.json(await SupplierProductModel.find().lean());
});
router.get("/purchase-orders", async (_req, res) => {
  res.json(await PurchaseOrderModel.find().sort({ createdAt: -1 }).lean());
});
router.post("/purchase-orders", validate(draftSchema), async (req, res) => {
  res.status(201).json(await createDraft(req.body));
});
router.patch(
  "/purchase-orders/:id/status",
  validate(z.object({ status: z.enum(["ordered", "cancelled"]) })),
  async (req, res) => {
    res.json(await changeOrderStatus(paramsId(req.params.id), req.body.status));
  },
);
router.post(
  "/purchase-orders/:id/receive",
  validate(receiptSchema),
  async (req, res) => {
    res.json(await receiveOrder(paramsId(req.params.id), req.body));
  },
);
export default router;
