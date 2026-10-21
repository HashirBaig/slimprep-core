import { Schema, model } from "mongoose";

export const CATEGORIES = [
  "Bakery",
  "Meat",
  "Vegetables",
  "Dairy",
  "Pantry",
] as const;
export const UNITS = ["pcs", "kg", "L"] as const;
export type Unit = (typeof UNITS)[number];

export interface Ingredient {
  id: string;
  name: string;
  emoji: string;
  category: string;
  unit: Unit;
  unitCost: number;
  minimumStock: number;
}
const ingredientSchema = new Schema<Ingredient>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: "📦" },
    category: { type: String, enum: CATEGORIES, required: true },
    unit: { type: String, enum: UNITS, required: true },
    unitCost: { type: Number, required: true, min: 0 },
    minimumStock: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, versionKey: false },
);
export const IngredientModel = model<Ingredient>(
  "Ingredient",
  ingredientSchema,
);

export interface StockBatch {
  id: string;
  ingredientId: string;
  quantity: number;
  expiryDate: string | null;
  receivedAt: Date;
}
const batchSchema = new Schema<StockBatch>(
  {
    id: { type: String, required: true, unique: true },
    ingredientId: { type: String, required: true, index: true },
    quantity: { type: Number, required: true, min: 0 },
    expiryDate: { type: String, default: null },
    receivedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
batchSchema.index({ ingredientId: 1, expiryDate: 1, receivedAt: 1 });
export const StockBatchModel = model<StockBatch>("StockBatch", batchSchema);

export type MovementType = "received" | "used" | "wasted" | "adjusted";
export interface StockMovement {
  id: string;
  ingredientId: string;
  batchId: string | null;
  type: MovementType;
  quantity: number;
  note: string;
  createdAt: Date;
  purchaseOrderId?: string;
  purchaseOrderLineId?: string;
}
const movementSchema = new Schema<StockMovement>(
  {
    id: { type: String, required: true, unique: true },
    ingredientId: { type: String, required: true, index: true },
    batchId: { type: String, default: null },
    type: {
      type: String,
      enum: ["received", "used", "wasted", "adjusted"],
      required: true,
    },
    quantity: { type: Number, required: true },
    note: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    purchaseOrderId: String,
    purchaseOrderLineId: String,
  },
  { versionKey: false },
);
movementSchema.index(
  { purchaseOrderId: 1, purchaseOrderLineId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      purchaseOrderId: { $type: "string" },
      purchaseOrderLineId: { $type: "string" },
    },
  },
);
export const StockMovementModel = model<StockMovement>(
  "StockMovement",
  movementSchema,
);

export interface Supplier {
  id: string;
  name: string;
  contactEmail: string;
  leadTimeDays: number;
  minimumOrderValue: number;
}
const supplierSchema = new Schema<Supplier>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    contactEmail: { type: String, required: true },
    leadTimeDays: { type: Number, required: true, min: 0 },
    minimumOrderValue: { type: Number, required: true, min: 0 },
  },
  { versionKey: false },
);
export const SupplierModel = model<Supplier>("Supplier", supplierSchema);

export interface SupplierProduct {
  id: string;
  supplierId: string;
  ingredientId: string;
  unit: Unit;
  pricePerUnit: number;
  minimumQuantity: number;
  packSize: number;
}
const productSchema = new Schema<SupplierProduct>(
  {
    id: { type: String, required: true, unique: true },
    supplierId: { type: String, required: true, index: true },
    ingredientId: { type: String, required: true, index: true },
    unit: { type: String, enum: UNITS, required: true },
    pricePerUnit: { type: Number, required: true, min: 0 },
    minimumQuantity: { type: Number, required: true, min: 0 },
    packSize: { type: Number, required: true, min: 0.000001 },
  },
  { versionKey: false },
);
export const SupplierProductModel = model<SupplierProduct>(
  "SupplierProduct",
  productSchema,
);

export type OrderStatus = "draft" | "ordered" | "received" | "cancelled";
export interface PurchaseOrderLine {
  id: string;
  ingredientId: string;
  supplierProductId: string;
  quantity: number;
  unitPrice: number;
  unit: Unit;
}
export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  status: OrderStatus;
  createdAt: Date;
  expectedDeliveryDate: string;
  orderedAt: Date | null;
  receivedAt: Date | null;
  lines: PurchaseOrderLine[];
}
const orderLineSchema = new Schema<PurchaseOrderLine>(
  {
    id: { type: String, required: true },
    ingredientId: { type: String, required: true },
    supplierProductId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.000001 },
    unitPrice: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: UNITS, required: true },
  },
  { _id: false },
);
const orderSchema = new Schema<PurchaseOrder>(
  {
    id: { type: String, required: true, unique: true },
    orderNumber: { type: String, required: true, unique: true },
    supplierId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["draft", "ordered", "received", "cancelled"],
      required: true,
    },
    createdAt: { type: Date, required: true },
    expectedDeliveryDate: { type: String, required: true },
    orderedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    lines: { type: [orderLineSchema], default: [] },
  },
  { versionKey: false },
);
export const PurchaseOrderModel = model<PurchaseOrder>(
  "PurchaseOrder",
  orderSchema,
);
