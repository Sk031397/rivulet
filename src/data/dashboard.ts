import {
  LayoutGrid, GitFork, ArrowLeftRight, Users, LayoutTemplate, Settings,
  Send, Plane, Music2, Wand2, Heart, MessageCircle,
  type LucideIcon,
} from "lucide-react";

/* ─── User ─────────────────────────────────────────────────────────── */
export interface User {
  name: string;
  full: string;
  plan: string;
  initials: string;
}

export const USER: User = { name: "Maya", full: "Maya Ortiz", plan: "Free plan", initials: "MO" };

/* ─── Sidebar ───────────────────────────────────────────────────────── */
export interface SidebarItem {
  icon: LucideIcon;
  label: string;
  path: string;
  badge?: string;
}

export const SIDEBAR: SidebarItem[] = [
  { icon: LayoutGrid,    label: "Overview",  path: "/dashboard"           },
  { icon: Send,          label: "Send",      path: "/dashboard/send"      },
  { icon: GitFork,       label: "Flows",     path: "/dashboard/flows"     },
  { icon: ArrowLeftRight,label: "Payments",  path: "/dashboard/payments"  },
  { icon: Users,         label: "People",    path: "/dashboard/people"    },
  { icon: LayoutTemplate,label: "Templates", path: "/dashboard/templates" },
  { icon: Settings,      label: "Settings",  path: "/dashboard/settings"  },
];

/* ─── Stats ─────────────────────────────────────────────────────────── */
export interface Stat {
  label: string;
  value: string;
  note: string;
}

export const EMPTY_STATS: Stat[] = [
  { label: "Available balance",    value: "$0.00", note: "No funds yet"          },
  { label: "Collected this month", value: "$0",    note: "Start a flow to collect"},
  { label: "Paid out",             value: "$0",    note: "No payouts yet"         },
  { label: "Active flows",         value: "0",     note: "Create your first flow" },
];

/* ─── Prompt suggestions ────────────────────────────────────────────── */
export const SUGGESTIONS: string[] = [
  "Split ticket sales 70/30 with my band",
  "Collect $120 each for a ski trip",
  "Pay a designer in 3 milestones",
];

/* ─── Flows ─────────────────────────────────────────────────────────── */
export type PayoutState = "paid" | "pending" | "locked";

export interface Payout {
  label: string;
  amount: number;
  state: PayoutState;
  note: string;
}

export interface FlowResource {
  kind: string;
  id?: string | null;
  link?: string | null;
  note: string;
}

export type FlowStatus = "Collecting" | "Needs approval" | "Paid out";

export interface Flow {
  id: string;
  name: string;
  status: FlowStatus;
  collected: number;
  goal: number;
  contributors: number;
  payouts: Payout[];
  resources?: FlowResource[];
}

/* ─── Activity ──────────────────────────────────────────────────────── */
export type ActivityTone = "mint" | "ultra" | "coral" | "saffron";

export interface ActivityItem {
  text: string;
  time: string;
  tone: ActivityTone;
}

/* ─── Payments ──────────────────────────────────────────────────────── */
export type PaymentDirection = "in" | "out";
export type PaymentStatus    = "completed" | "pending" | "failed";

export interface Payment {
  id: string;
  flow: string;
  who: string;
  direction: PaymentDirection;
  amount: number;
  date: string;
  method: string;
  status: PaymentStatus;
}

/* ─── People ────────────────────────────────────────────────────────── */
export type PersonRole = "Owner" | "Contributor" | "Recipient";

export interface Person {
  name: string;
  initials: string;
  role: PersonRole;
  flows: string[];
  contributed: number;
  received: number;
  since: string;
  tone: string;
}

/* ─── Templates (these are product copy, not user data) ─────────────── */
export interface Template {
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  tone: string;
  payouts: number;
}

export const TEMPLATES: Template[] = [
  { name: "Group trip pool",       description: "Collect per-person shares, then pay deposits and final costs.",   category: "Travel",    icon: Plane,        tone: "from-coral to-ultra",   payouts: 3 },
  { name: "Event with volunteers", description: "Fund an event and reward volunteers once tasks are verified.",    category: "Community", icon: Users,        tone: "from-mint to-ultra",    payouts: 3 },
  { name: "Creator revenue split", description: "Split earnings between collaborators on a fixed schedule.",       category: "Creators",  icon: Music2,       tone: "from-ink to-ultra",     payouts: 4 },
  { name: "Milestone project",     description: "Pay a freelancer in stages tied to deliverables.",               category: "Freelance", icon: Wand2,        tone: "from-ultra to-coral",   payouts: 3 },
  { name: "Charity drive",         description: "Collect donations and route them to causes automatically.",       category: "Impact",    icon: Heart,        tone: "from-saffron to-coral", payouts: 2 },
  { name: "Team celebration",      description: "Pool money from teammates and split the venue and food costs.",   category: "Community", icon: MessageCircle,tone: "from-mint to-saffron",  payouts: 2 },
];
