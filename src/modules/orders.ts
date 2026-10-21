import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { HttpError } from "../lib/http.js";
import {
  IngredientModel,
  PurchaseOrderModel,
  SupplierModel,
  SupplierProductModel,
  StockMovementModel,
  type PurchaseOrderLine,
} from "../models/index.js";
import { receiveStock } from "./stock.js";

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const isoDay = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
export const draftSchema = z.object({
  supplierId: z.string().min(1),
  lines: z
    .array(
      z.object({
        supplierProductId: z.string().min(1),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
});
export const receiptSchema = z.object({
  lines: z
    .array(
      z.object({
        orderLineId: z.string(),
        quantity: z.number().positive(),
        expiryDate: z.iso.date().nullable(),
      }),
    )
    .min(1),
});

export async function createDraft(body: z.infer<typeof draftSchema>) {
  return mongoose.connection.transaction(async (session) => {
    const supplier = await SupplierModel.findOne({ id: body.supplierId })
      .session(session)
      .lean();
    if (!supplier) throw new HttpError(404, "Supplier not found");
    if (
      new Set(body.lines.map((l) => l.supplierProductId)).size !==
      body.lines.length
    )
      throw new HttpError(400, "Duplicate products");
    const existing = await PurchaseOrderModel.exists({
      supplierId: supplier.id,
      status: "draft",
    }).session(session);
    if (existing) throw new HttpError(409, "Supplier already has a draft");
    const lines: PurchaseOrderLine[] = [];
    for (const request of body.lines) {
      const product = await SupplierProductModel.findOne({
        id: request.supplierProductId,
        supplierId: supplier.id,
      })
        .session(session)
        .lean();
      if (!product)
        throw new HttpError(400, "Product does not belong to supplier");
      const ingredient = await IngredientModel.findOne({
        id: product.ingredientId,
      })
        .session(session)
        .lean();
      if (!ingredient || ingredient.unit !== product.unit)
        throw new HttpError(400, "Ingredient unit mismatch");
      const packs = request.quantity / product.packSize;
      if (
        request.quantity + 1e-8 < product.minimumQuantity ||
        Math.abs(packs - Math.round(packs)) > 1e-7
      )
        throw new HttpError(
          400,
          `Invalid pack quantity for ${ingredient.name}`,
        );
      if (product.unit === "pcs" && !Number.isInteger(request.quantity))
        throw new HttpError(400, "Pieces must be whole numbers");
      lines.push({
        id: randomUUID(),
        ingredientId: product.ingredientId,
        supplierProductId: product.id,
        quantity: round(request.quantity),
        unitPrice: product.pricePerUnit,
        unit: product.unit,
      });
    }
    const id = randomUUID();
    const [order] = await PurchaseOrderModel.create(
      [
        {
          id,
          orderNumber: `PO-${Date.now()}-${id.slice(0, 6)}`,
          supplierId: supplier.id,
          status: "draft",
          createdAt: new Date(),
          expectedDeliveryDate: plusDays(supplier.leadTimeDays),
          orderedAt: null,
          receivedAt: null,
          lines,
        },
      ],
      { session },
    );
    return order;
  });
}

export async function changeOrderStatus(
  id: string,
  status: "ordered" | "cancelled",
) {
  return mongoose.connection.transaction(async (session) => {
    const order = await PurchaseOrderModel.findOne({ id }).session(session);
    if (!order) throw new HttpError(404, "Order not found");
    if (status === "ordered" && order.status !== "draft")
      throw new HttpError(409, "Only drafts may be ordered");
    if (status === "cancelled" && !["draft", "ordered"].includes(order.status))
      throw new HttpError(409, "Order cannot be cancelled");
    if (status === "ordered") {
      const supplier = await SupplierModel.findOne({ id: order.supplierId })
        .session(session)
        .lean();
      if (!supplier) throw new HttpError(404, "Supplier not found");
      const total = order.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice,
        0,
      );
      if (total + 1e-8 < supplier.minimumOrderValue)
        throw new HttpError(409, "Below supplier minimum order value");
      order.orderedAt = new Date();
      order.expectedDeliveryDate = plusDays(supplier.leadTimeDays);
    }
    order.status = status;
    await order.save({ session });
    return order;
  });
}

export async function receiveOrder(
  id: string,
  body: z.infer<typeof receiptSchema>,
) {
  return mongoose.connection.transaction(async (session) => {
    // Claim using a conditional update so concurrent receive attempts cannot both succeed.
    const claimed = await PurchaseOrderModel.findOneAndUpdate(
      { id, status: "ordered" },
      { $set: { status: "received", receivedAt: new Date() } },
      { new: true, session },
    );
    if (!claimed)
      throw new HttpError(409, "Order is missing or is not awaiting receipt");
    if (
      body.lines.length !== claimed.lines.length ||
      new Set(body.lines.map((l) => l.orderLineId)).size !==
        claimed.lines.length
    )
      throw new HttpError(
        400,
        "Exactly one receipt entry per order line is required",
      );
    for (const line of claimed.lines) {
      const received = body.lines.find((row) => row.orderLineId === line.id);
      if (!received || Math.abs(received.quantity - line.quantity) > 1e-8)
        throw new HttpError(400, "Full-order receiving only");
      if (received.expiryDate && received.expiryDate < isoDay())
        throw new HttpError(400, "Expiry date cannot be in the past");
      // Guard against a legacy receipt if order and inventory got out of sync.
      const duplicate = await StockMovementModel.exists({
        purchaseOrderId: id,
        purchaseOrderLineId: line.id,
      }).session(session);
      if (duplicate)
        throw new HttpError(409, "Delivery has already been applied");
      await receiveStock(
        line.ingredientId,
        received.quantity,
        received.expiryDate,
        "received",
        `Purchase order ${claimed.orderNumber}`,
        session,
        id,
        line.id,
      );
    }
    return claimed;
  });
}
