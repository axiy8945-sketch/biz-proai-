import type { Period } from '../dates';
import type { Dict } from '../i18n';
import type { BusinessType, Lang, ModuleId, Permissions, Role } from '../types';

export type AgentId = 'sales' | 'finance' | 'inventory' | 'employee' | 'production' | 'analyst';
export const AGENT_IDS: AgentId[] = ['sales', 'finance', 'inventory', 'employee', 'production', 'analyst'];

export const INTENTS = {
  sales: ['revenue', 'trend', 'top_products'],
  finance: ['profit', 'expenses', 'summary'],
  inventory: ['low_stock', 'restock', 'product_stock', 'value'],
  employee: ['sales_by_employee', 'activity'],
  production: ['summary'],
  analyst: ['performance'],
} as const satisfies Record<AgentId, readonly string[]>;
export type Intent<A extends AgentId = AgentId> = (typeof INTENTS)[A][number];

export interface AgentTask {
  agent: AgentId;
  intent: string;
  period: Period;
  product?: string;
}

/** Whitelisted, parameterised analytics calls. Agents never run free-form SQL. */
export const ALLOWED_RPC = [
  'fn_finance_summary', 'fn_sales_overview', 'fn_sales_series', 'fn_top_products', 'fn_employee_sales',
  'fn_expense_breakdown', 'fn_inventory_status', 'fn_product_lookup', 'fn_production_summary',
  'fn_employee_activity', 'fn_data_quality',
] as const;
export type AllowedRpc = (typeof ALLOWED_RPC)[number];

export interface DataPort {
  call<T>(fn: AllowedRpc, args: Record<string, string | number | null>): Promise<T>;
}

export class DataError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}

export interface AgentContext {
  businessId: string;
  businessName: string;
  businessType: BusinessType;
  modules: ModuleId[];
  currency: string;
  lang: Lang;
  timezone: string;
  role: Role;
  perms: Permissions;
  disabledAgents: string[];
  data: DataPort;
  t: Dict;
  now?: Date;
}

export interface Fact { label: string; value: string; tone?: 'up' | 'down' | 'warn' | 'neutral' }

export type ReportStatus = 'ok' | 'empty' | 'denied' | 'disabled' | 'error';

export interface AgentReport {
  agent: AgentId;
  task: AgentTask;
  status: ReportStatus;
  /** Raw numbers exactly as calculated by the database — the only facts the LLM may use. */
  data: Record<string, unknown>;
  /** Display-ready key figures for the chat card. */
  facts: Fact[];
  /** Deterministic sentences in the user's language. */
  text: string[];
  /** Honest notes about missing / incomplete records. */
  warnings: string[];
  insights?: string[];
  recommendations?: string[];
}

export interface Agent {
  id: AgentId;
  /** Module that must be enabled for the business (if any). */
  module?: ModuleId;
  run(ctx: AgentContext, task: AgentTask, peers?: AgentReport[]): Promise<AgentReport>;
}

export interface CoordinatorResult {
  answer: string;
  lang: Lang;
  mode: 'llm' | 'rules';
  plan: AgentTask[];
  reports: AgentReport[];
  warnings: string[];
}
