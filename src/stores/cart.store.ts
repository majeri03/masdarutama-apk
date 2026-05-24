/**
 * Cart Store - Zustand state for POS cart management
 */
import { create } from 'zustand';
import type { CartItem, Product, CartCalculation } from '../types';

interface CartState {
  items: CartItem[];
  selectedCustomerId: string | null;
  discount: number;
  notes: string;
  tax: number;

  // Actions
  addItem: (product: Product, unitId: string) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  updateItemDiscount: (cartItemId: string, discount: number) => void;
  updateItemUnit: (cartItemId: string, unitId: string) => void;
  setCustomer: (customerId: string | null) => void;
  setDiscount: (discount: number) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;
  getCalculation: () => CartCalculation;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  selectedCustomerId: null,
  discount: 0,
  notes: '',
  tax: 0,

  addItem: (product: Product, unitId: string) => {
    const state = get();
    const selectedUnit = product.productUnits.find((pu) => pu.unitId === unitId);
    if (!selectedUnit) return;

    // Check if the same product + unit combo already exists
    const existingIndex = state.items.findIndex(
      (item) => item.productId === product.id && item.unitId === unitId
    );

    if (existingIndex >= 0) {
      // Increment quantity
      const updated = [...state.items];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + 1,
        subtotal:
          (updated[existingIndex].quantity + 1) * updated[existingIndex].unitPrice -
          updated[existingIndex].discount,
      };
      set({ items: updated });
      return;
    }

    const availableUnits = product.productUnits.map((pu) => ({
      id: pu.id,
      unitId: pu.unitId,
      unitName: pu.unit.name,
      conversionFactor: pu.conversionValue,
      price: pu.sellPrice,
      isBase: pu.isPrimary,
    }));

    const newItem: CartItem = {
      id: `${product.id}-${unitId}-${Date.now()}`,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      productUnitId: selectedUnit.id,
      unitId: unitId,
      unitName: selectedUnit.unit.name,
      quantity: 1,
      unitPrice: selectedUnit.sellPrice,
      discount: 0,
      subtotal: selectedUnit.sellPrice,
      originalPrice: selectedUnit.sellPrice,
      availableUnits,
    };

    set({ items: [...state.items, newItem] });
  },

  removeItem: (cartItemId: string) => {
    set({ items: get().items.filter((item) => item.id !== cartItemId) });
  },

  updateQuantity: (cartItemId: string, quantity: number) => {
    if (quantity < 1) return;
    set({
      items: get().items.map((item) =>
        item.id === cartItemId
          ? {
              ...item,
              quantity,
              subtotal: quantity * item.unitPrice - item.discount,
            }
          : item
      ),
    });
  },

  updateItemDiscount: (cartItemId: string, discount: number) => {
    set({
      items: get().items.map((item) =>
        item.id === cartItemId
          ? {
              ...item,
              discount,
              subtotal: item.quantity * item.unitPrice - discount,
            }
          : item
      ),
    });
  },

  updateItemUnit: (cartItemId: string, unitId: string) => {
    set({
      items: get().items.map((item) => {
        if (item.id !== cartItemId) return item;
        const newUnit = item.availableUnits.find((u) => u.unitId === unitId);
        if (!newUnit) return item;
        return {
          ...item,
          unitId: newUnit.unitId,
          unitName: newUnit.unitName,
          productUnitId: newUnit.id,
          unitPrice: newUnit.price,
          originalPrice: newUnit.price,
          subtotal: item.quantity * newUnit.price - item.discount,
        };
      }),
    });
  },

  setCustomer: (customerId) => set({ selectedCustomerId: customerId }),
  setDiscount: (discount) => set({ discount }),
  setNotes: (notes) => set({ notes }),

  clearCart: () =>
    set({
      items: [],
      selectedCustomerId: null,
      discount: 0,
      notes: '',
      tax: 0,
    }),

  getCalculation: () => {
    const state = get();
    const subtotal = state.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const itemDiscount = state.items.reduce((sum, item) => sum + item.discount, 0);
    const totalDiscount = itemDiscount + state.discount;
    const tax = state.tax;
    const grandTotal = subtotal - totalDiscount + tax;

    return {
      subtotal,
      itemDiscount,
      totalDiscount,
      customerDiscount: state.discount,
      tax,
      grandTotal: Math.max(0, grandTotal),
    };
  },
}));
