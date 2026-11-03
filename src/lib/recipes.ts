export interface RecipeFull {
  id: string; name: string; product_id: string; yield_qty: number; notes: string | null;
  items: { ingredient_id: string; quantity: number }[];
}
