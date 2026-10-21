import mongoose from "mongoose";
import { env } from "../config/env.js";
import {
  IngredientModel,
  SupplierModel,
  SupplierProductModel,
  StockBatchModel,
} from "../models/index.js";

const ingredients = [
  ["buns", "Burger Buns", "🍔", "Bakery", "pcs", 0.18, 140, 120, 9],
  ["patties", "Beef Patties", "🥩", "Meat", "pcs", 1.2, 100, 85, 12],
  ["lettuce", "Lettuce", "🥬", "Vegetables", "kg", 2.5, 8, 6, 3],
  ["tomatoes", "Tomatoes", "🍅", "Vegetables", "kg", 2.2, 5, 8, 7],
  ["cheese", "Cheese", "🧀", "Dairy", "kg", 4.1, 2, 3, 5],
  ["olive-oil", "Olive Oil", "🫒", "Pantry", "L", 6, 1, 2, 180],
  ["milk", "Milk", "🥛", "Dairy", "L", 1.6, 3, 4, 2],
  ["flour", "Flour", "🌾", "Pantry", "kg", 1.1, 5, 12, 90],
] as const;
const suppliers = [
  {
    id: "supplier-fresh",
    name: "FreshFields Produce",
    contactEmail: "orders@freshfields.example",
    leadTimeDays: 1,
    minimumOrderValue: 25,
  },
  {
    id: "supplier-protein",
    name: "PrimeMeats Wholesale",
    contactEmail: "sales@primemeats.example",
    leadTimeDays: 2,
    minimumOrderValue: 100,
  },
  {
    id: "supplier-general",
    name: "KitchenSupply Direct",
    contactEmail: "orders@kitchensupply.example",
    leadTimeDays: 3,
    minimumOrderValue: 40,
  },
];
const products = [
  ["sp-lettuce", "supplier-fresh", "lettuce", "kg", 2.5, 2, 1],
  ["sp-tomatoes", "supplier-fresh", "tomatoes", "kg", 2.2, 2, 1],
  ["sp-patties", "supplier-protein", "patties", "pcs", 1.2, 50, 10],
  ["sp-buns", "supplier-general", "buns", "pcs", 0.18, 40, 20],
  ["sp-cheese", "supplier-general", "cheese", "kg", 4.1, 2, 1],
  ["sp-oil", "supplier-general", "olive-oil", "L", 6, 1, 1],
  ["sp-flour", "supplier-general", "flour", "kg", 1.1, 5, 5],
  ["sp-milk", "supplier-general", "milk", "L", 1.6, 6, 6],
] as const;

async function seed() {
  await mongoose.connect(env.MONGODB_URI);
  for (const [
    id,
    name,
    emoji,
    category,
    unit,
    unitCost,
    minimumStock,
    stock,
    expiryDays,
  ] of ingredients) {
    await IngredientModel.updateOne(
      { id },
      {
        $setOnInsert: {
          id,
          name,
          emoji,
          category,
          unit,
          unitCost,
          minimumStock,
        },
      },
      { upsert: true },
    );
    const batchId = `seed-${id}`;
    // Do not overwrite mutated batches on subsequent seed runs.
    await StockBatchModel.updateOne(
      { id: batchId },
      {
        $setOnInsert: {
          id: batchId,
          ingredientId: id,
          quantity: stock,
          expiryDate: new Date(Date.now() + expiryDays * 86400000)
            .toISOString()
            .slice(0, 10),
          receivedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
  for (const supplier of suppliers)
    await SupplierModel.updateOne(
      { id: supplier.id },
      { $setOnInsert: supplier },
      { upsert: true },
    );
  for (const [
    id,
    supplierId,
    ingredientId,
    unit,
    pricePerUnit,
    minimumQuantity,
    packSize,
  ] of products) {
    await SupplierProductModel.updateOne(
      { id },
      {
        $setOnInsert: {
          id,
          supplierId,
          ingredientId,
          unit,
          pricePerUnit,
          minimumQuantity,
          packSize,
        },
      },
      { upsert: true },
    );
  }
  console.log("Seed completed (existing records preserved)");
  await mongoose.disconnect();
}
seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
