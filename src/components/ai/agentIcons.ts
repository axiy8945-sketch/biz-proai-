import type { AgentId } from '@/lib/ai/types';
import type { IconName } from '../icons';

/** Shared by server and client components (must not live in a 'use client' file). */
export const AGENT_ICON: Record<AgentId | 'coordinator', { icon: IconName; tone: string }> = {
  coordinator: { icon: 'sparkles', tone: 'ic-blue' },
  sales: { icon: 'cart', tone: 'ic-blue' },
  finance: { icon: 'coins', tone: 'ic-green' },
  inventory: { icon: 'box', tone: 'ic-amber' },
  employee: { icon: 'users', tone: 'ic-violet' },
  production: { icon: 'flame', tone: 'ic-red' },
  analyst: { icon: 'brain', tone: 'ic-violet' },
};
