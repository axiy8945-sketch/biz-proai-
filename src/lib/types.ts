export type Lang = 'ky' | 'uz' | 'ru';
export const LANGS: Lang[] = ['ky', 'uz', 'ru'];

export type BusinessType = 'retail' | 'grocery' | 'smartphone' | 'somsa' | 'restaurant' | 'bakery' | 'custom';
export const BUSINESS_TYPES: BusinessType[] = ['retail', 'grocery', 'smartphone', 'somsa', 'restaurant', 'bakery', 'custom'];

export type ModuleId =
  | 'sales' | 'expenses' | 'inventory' | 'purchases' | 'serials' | 'production' | 'recipes'
  | 'employees' | 'reports' | 'stock_alerts';
export const ALL_MODULES: ModuleId[] = ['sales', 'expenses', 'inventory', 'purchases', 'serials', 'production', 'recipes', 'employees', 'reports', 'stock_alerts'];

export type Permission = 'add_expenses' | 'view_finance' | 'delete_records' | 'manage_inventory' | 'record_production' | 'edit_prices';
export const PERMISSIONS: Permission[] = ['add_expenses', 'view_finance', 'delete_records', 'manage_inventory', 'record_production', 'edit_prices'];
export type Permissions = Record<Permission, boolean>;

export type Role = 'owner' | 'employee';

export interface Business {
  id: string;
  name: string;
  type: BusinessType;
  modules: ModuleId[];
  currency: string;
  language: Lang;
  timezone: string;
  allow_negative_stock: boolean;
  report_time: string;
  report_channel: 'in_app' | 'telegram' | 'none';
  telegram_chat_id: string | null;
  agent_settings: AgentSettings;
}

export interface AgentSettings {
  disabled?: string[];
  analysis_depth?: 'short' | 'detailed';
}

export interface Membership {
  id: string;
  business_id: string;
  user_id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  permissions: Permissions;
  active: boolean;
}

export type ExpenseCategory = 'rent' | 'salary' | 'utilities' | 'supplies' | 'transport' | 'marketing' | 'taxes' | 'repair' | 'other';
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['rent', 'salary', 'utilities', 'supplies', 'transport', 'marketing', 'taxes', 'repair', 'other'];

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'credit';
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'credit'];

export type ProductKind = 'product' | 'ingredient' | 'finished' | 'device' | 'accessory';
export type Unit = 'pcs' | 'kg' | 'g' | 'l' | 'ml' | 'pack';
export const UNITS: Unit[] = ['pcs', 'kg', 'g', 'l', 'ml', 'pack'];

export interface Product {
  id: string;
  name: string;
  kind: ProductKind;
  category: string | null;
  sku: string | null;
  unit: Unit;
  sale_price: number;
  cost_price: number | null; // null when the viewer may not see finance
  stock: number;
  min_stock: number;
  track_serial: boolean;
  active: boolean;
  serials_in_stock: number;
}

// ---- analytics payloads (mirror SQL functions in 0004_analytics.sql)
export interface FinanceSummary {
  from: string; to: string;
  revenue: number; cogs: number; gross_profit: number; expenses: number; net_profit: number;
  gross_margin_pct: number | null; sales_count: number; items_sold: number; avg_ticket: number | null;
  sales_with_unknown_cost: number; expense_count: number; by_payment: Record<string, number>;
}
export interface SalesOverview {
  from: string; to: string; scope: 'business' | 'own';
  revenue: number; sales_count: number; avg_ticket: number | null; items_sold: number; by_payment: Record<string, number>;
}
export interface SeriesPoint { date: string; revenue: number; sales_count: number; gross_profit: number | null }
export interface TopProduct { product_id: string; name: string; unit: string; quantity: number; revenue: number; gross_profit: number | null; cost_known: boolean }
export interface EmployeeSales { user_id: string; full_name: string; role: Role; sales_count: number; revenue: number; avg_ticket: number | null }
export interface ExpenseBreakdown { scope: 'business' | 'own'; total: number; by_category: { category: ExpenseCategory; amount: number; count: number }[] }
export interface LowStockItem {
  product_id: string; name: string; kind: ProductKind; unit: Unit; stock: number; min_stock: number;
  avg_daily_use: number; days_left: number | null; suggested_reorder: number;
}
export interface InventoryStatus {
  product_count: number; out_of_stock: number; low_stock: LowStockItem[]; without_min_stock: number;
  without_cost: number; inventory_value: number | null; retail_value: number | null;
}
export interface ProductionSummary {
  batches: number;
  by_product: { name: string; quantity: number; batches: number; material_cost: number | null; unit_cost: number | null; cost_complete: boolean }[];
  consumption: { name: string; unit: string; quantity: number; cost: number | null }[];
  material_cost: number | null;
}
export interface EmployeeActivity { user_id: string; full_name: string; role: Role; active: boolean; created: number; updated: number; deleted: number; last_activity: string | null }
export interface DataQuality {
  days_in_period: number; days_with_sales: number; sales_with_unknown_cost: number; products_without_cost: number;
  products_without_min_stock: number; expense_records: number; has_products: boolean; first_sale_date: string | null;
}
export interface ProductLookup { product_id: string; name: string; kind: ProductKind; unit: Unit; stock: number; min_stock: number; sale_price: number; cost_price: number | null }
