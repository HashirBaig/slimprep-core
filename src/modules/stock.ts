import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";
import { HttpError } from "../lib/http.js";
import {
  IngredientModel,
  StockBatchModel,
  StockMovementModel,
  type MovementType,
} from "../models/index.js";

const dateString = z.iso.date();
export const stockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["receive", "adjust-in"]),
    quantity: z.number().positive(),
    expiryDate: dateString.nullable().optional(),
    note: z.string().max(500).default(""),
  }),
  z.object({
    type: z.enum(["use", "waste", "adjust-out"]),
    quantity: z.number().positive(),
    note: z.string().max(500).default(""),
  }),
]);

export type StockAction = z.infer<typeof stockSchema>;

async function receiveStock(
  ingredientId: string,
  quantity: number,
  expiryDate: string | null,
  type: MovementType,
  note: string,
  session: ClientSession,
  purchaseOrderId?: string,
  purchaseOrderLineId?: string,
) {
  const ingredient = await IngredientModel.findOne({ id: ingredientId })
    .session(session)
    .lean();
  if (!ingredient) throw new HttpError(404, "Ingredient not found");
  if (ingredient.unit === "pcs" && !Number.isInteger(quantity))
    throw new HttpError(400, "Pieces must be whole numbers");
  if (expiryDate && expiryDate < new Date().toISOString().slice(0, 10))
    throw new HttpError(400, "Expiry date cannot be in the past");
  const id = randomUUID();
  const now = new Date();
  await StockBatchModel.create(
    [{ id, ingredientId, quantity, expiryDate, receivedAt: now }],
    { session },
  );
  await StockMovementModel.create(
    [
      {
        id: randomUUID(),
        ingredientId,
        batchId: id,
        type,
        quantity,
        note,
        createdAt: now,
        purchaseOrderId,
        purchaseOrderLineId,
      },
    ],
    { session },
  );
}
export { receiveStock };

export async function adjustStock(ingredientId: string, action: StockAction) {
  await mongoose.connection.transaction(async (session) => {
    const ingredient = await IngredientModel.findOne({ id: ingredientId })
      .session(session)
      .lean();
    if (!ingredient) throw new HttpError(404, "Ingredient not found");
    if (ingredient.unit === "pcs" && !Number.isInteger(action.quantity))
      throw new HttpError(400, "Pieces must be whole numbers");
    if (action.type === "receive" || action.type === "adjust-in") {
      await receiveStock(
        ingredientId,
        action.quantity,
        action.expiryDate ?? null,
        action.type === "receive" ? "received" : "adjusted",
        action.note,
        session,
      );
      return;
    }
    const type: MovementType =
      action.type === "use"
        ? "used"
        : action.type === "waste"
          ? "wasted"
          : "adjusted";
    // FEFO: earliest expiry first; no-expiry last. Expired stock is not issued for kitchen use.
    const batches = await StockBatchModel.find({
      ingredientId,
      quantity: { $gt: 0 },
    })
      .session(session)
      .lean();
    const sorted = batches.sort(
      (a, b) =>
        (a.expiryDate ?? "9999-12-31").localeCompare(
          b.expiryDate ?? "9999-12-31",
        ) || +new Date(a.receivedAt) - +new Date(b.receivedAt),
    );
    const today = new Date().toISOString().slice(0, 10);
    const eligible =
      type === "used"
        ? sorted.filter((b) => !b.expiryDate || b.expiryDate >= today)
        : sorted;
    const available = eligible.reduce((sum, batch) => sum + batch.quantity, 0);
    if (available + 1e-9 < action.quantity)
      throw new HttpError(
        409,
        `Insufficient usable stock: ${available} ${ingredient.unit}`,
      );
    let remaining = action.quantity;
    for (const batch of eligible) {
      if (remaining <= 1e-9) break;
      const take = Math.min(remaining, batch.quantity);
      // Conditional update protects the batch against concurrent lost updates.
      const updated = await StockBatchModel.updateOne(
        { id: batch.id, quantity: { $gte: take } },
        { $inc: { quantity: -take } },
        { session },
      );
      if (updated.modifiedCount !== 1)
        throw new HttpError(409, "Concurrent stock change; retry");
      await StockMovementModel.create(
        [
          {
            id: randomUUID(),
            ingredientId,
            batchId: batch.id,
            type,
            quantity: -take,
            note: action.note,
            createdAt: new Date(),
          },
        ],
        { session },
      );
      remaining -= take;
    }
  });
}
