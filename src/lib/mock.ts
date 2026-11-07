import type { ActivityItem, Stat } from "@/data/dashboard";

/**
 * Returned by the API routes when PayPal credentials are absent or the
 * sandbox returns no transactions yet. Shows zeros — not fake numbers.
 */
export const MOCK_ACTIVITY: ActivityItem[] = [];

export const MOCK_STATS: Stat[] = [
  { label: "Available balance",    value: "$0.00", note: "Connect PayPal to see live data"  },
  { label: "Collected this month", value: "$0",    note: "No transactions yet"              },
  { label: "Paid out",             value: "$0",    note: "No payouts yet"                   },
  { label: "Active flows",         value: "0",     note: "Create your first flow below"     },
];
