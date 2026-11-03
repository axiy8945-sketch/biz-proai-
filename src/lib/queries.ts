import 'server-only';
import type { AppContext } from './context';
import { supabaseServer } from './supabase/server';
import type {
  DataQuality, EmployeeSales, ExpenseBreakdown, FinanceSummary, InventoryStatus, Product, ProductionSummary, SalesOverview, SeriesPoint, TopProduct,
} from './types';

type Supa = Awaited<ReturnType<typeof supabaseServer>>;

async function rpc<T>(sb: Supa, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Typed wrappers around the deterministic SQL analytics, scoped to the active business. */
export async function queries(ctx: AppContext) {
  const sb = await supabaseServer();
  const b = ctx.business.id;
  const range = (from: string, to: string) => ({ p_business: b, p_from: from, p_to: to });
  return {
    sb,
    finance: (from: string, to: string) => rpc<FinanceSummary>(sb, 'fn_finance_summary', range(from, to)),
    overview: (from: string, to: string) => rpc<SalesOverview>(sb, 'fn_sales_overview', range(from, to)),
    series: (from: string, to: string) => rpc<SeriesPoint[]>(sb, 'fn_sales_series', range(from, to)),
    top: (from: string, to: string, limit = 5) => rpc<TopProduct[]>(sb, 'fn_top_products', { ...range(from, to), p_limit: limit }),
    employees: (from: string, to: string) => rpc<EmployeeSales[]>(sb, 'fn_employee_sales', range(from, to)),
    expenses: (from: string, to: string) => rpc<ExpenseBreakdown>(sb, 'fn_expense_breakdown', range(from, to)),
    inventory: () => rpc<InventoryStatus>(sb, 'fn_inventory_status', { p_business: b }),
    production: (from: string, to: string) => rpc<ProductionSummary>(sb, 'fn_production_summary', range(from, to)),
    quality: (from: string, to: string) => rpc<DataQuality>(sb, 'fn_data_quality', range(from, to)),
    products: async (includeInactive = false) => (await rpc<Product[]>(sb, 'list_products', { p_business: b, p_include_inactive: includeInactive }))
      .map((p) => ({ ...p, sale_price: Number(p.sale_price), stock: Number(p.stock), min_stock: Number(p.min_stock), cost_price: p.cost_price === null ? null : Number(p.cost_price), serials_in_stock: Number(p.serials_in_stock) })),
  };
}
