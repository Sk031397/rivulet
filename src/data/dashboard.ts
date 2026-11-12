import {
  LayoutGrid, GitFork, ArrowLeftRight, Users, LayoutTemplate,
  Plane, Home, Mountain, PartyPopper, Car, Utensils,
  type LucideIcon,
} from "lucide-react";

/* ─── Sidebar ───────────────────────────────────────────────────────── */
export interface SidebarItem {
  icon: LucideIcon;
  label: string;
  path: string;
  badge?: string;
}

export const SIDEBAR: SidebarItem[] = [
  { icon: LayoutGrid,    label: "Overview",  path: "/dashboard"           },
  { icon: GitFork,       label: "Flows",     path: "/dashboard/flows"     },
  { icon: ArrowLeftRight,label: "Payments",  path: "/dashboard/payments"  },
  { icon: Users,         label: "People",    path: "/dashboard/people"    },
  { icon: LayoutTemplate,label: "Templates", path: "/dashboard/templates" },
];

/* ─── Stats ─────────────────────────────────────────────────────────── */
export interface Stat {
  label: string;
  value: string;
  note: string;
}

/* ─── Prompt suggestions ────────────────────────────────────────────── */
export const SUGGESTIONS: string[] = [
  "Split ticket sales 70/30 with my band",
  "Collect $120 each for a ski trip",
  "Pay a designer in 3 milestones",
];

/* ─── Flows ─────────────────────────────────────────────────────────── */
export type PayoutState = "paid" | "pending" | "locked";

export interface Payout {
  /** Stable identifier, unique within the flow. Preferred key for updates. */
  id?: string;
  label: string;
  amount: number;
  state: PayoutState;
  note: string;
  /** ISO time the payout was actually sent. Absent on payouts paid before this was recorded. */
  paidAt?: string;
  /**
   * A release condition the organizer stated (for example "Tasks verified").
   * While any unpaid payout has one, reaching the goal HOLDS the flow for the
   * owner's approval instead of paying out automatically.
   */
  condition?: string;
  /** PayPal email of the recipient — required for real disbursement on approval. */
  recipient?: string;
  /**
   * ISO date (YYYY-MM-DD). A payout with a release date is paid automatically on
   * that day once the goal is met — no owner approval needed, because the
   * condition ("on March 3") can be checked by the app itself.
   */
  releaseOn?: string;
  /**
   * Set by the PayPal webhook when a payout that was sent did not land
   * (failed, returned, blocked, or unclaimed). Cleared when it is retried.
   */
  issue?: string;
  /** Last payout item status PayPal reported for this payout. */
  itemStatus?: string;
}

export interface FlowResource {
  kind: string;
  id?: string | null;
  link?: string | null;
  note: string;
}

export type FlowStatus = "Collecting" | "Needs approval" | "Scheduled" | "Paid out" | "Refunded";

/** One real, settled PayPal payment into a flow. */
export interface Contribution {
  /** PayPal capture id — unique per payment, used to make capture idempotent. */
  id: string;
  amount: number;
  /** ISO timestamp of when the payment was recorded. */
  at: string;
  /** Payer's display name or email as reported by PayPal (owner-only; never public). */
  payer?: string;
  /** PayPal refund id, once this payment has been returned to the contributor. */
  refundId?: string;
  /** ISO time the refund was issued. */
  refundedAt?: string;
  /** Roster member this payment was made for, when the payer picked their name. */
  memberId?: string;
  /** ISO time PayPal reversed or denied this payment; it no longer counts as collected. */
  reversedAt?: string;
  /** A problem PayPal reported with this payment (dispute, reversal). Owner-only. */
  issue?: string;
}

/** One person in a group flow. The email is owner-only and used for reminders. */
export interface RosterMember {
  id: string;
  name: string;
  email?: string;
  /** ISO time of the last reminder email sent to this person (rate-limits reminders). */
  remindedAt?: string;
}

export interface Flow {
  id: string;
  /** Clerk user id of the owner. Flows are scoped to their owner. */
  ownerId?: string;
  name: string;
  status: FlowStatus;
  collected: number;
  goal: number;
  /** ISO 4217 code every amount on this flow is in. Absent on older flows, which are USD. */
  currency?: "USD" | "EUR" | "GBP" | "CAD" | "AUD";
  contributors: number;
  /** Group size for a trip-style flow: each person's share is goal / participants. */
  participants?: number;
  /** The named people in the group, when the organizer listed them. */
  roster?: RosterMember[];
  /** ISO date (YYYY-MM-DD). After the end of this day no new contributions are accepted. */
  deadline?: string;
  /** Settled payments into this flow. Absent on flows created before this existed. */
  contributions?: Contribution[];
  /**
   * ISO time a payout run started. While recent, no other payout run may start
   * on this flow — prevents the auto-payout and the owner's Approve button (or
   * two tabs) from paying the same recipients twice.
   */
  disbursingAt?: string;
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
  /** Unique key (the recipient address), used as the grid's row id. */
  id?: string;
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
  { name: "Weekend house rental",  description: "Plan a weekend trip for 6 friends: collect $2,400 total. Pay a $600 deposit to the host now and the $1,800 balance after everyone has paid. Everyone must pay within 2 weeks.", category: "Trips", icon: Home, tone: "from-coral to-ultra", payouts: 2 },
  { name: "Group flights",         description: "Book flights for 4 friends: collect $1,840 total, $460 each. Reimburse the organizer who is booking the tickets. Everyone must pay within 10 days.", category: "Trips", icon: Plane, tone: "from-ultra to-coral", payouts: 1 },
  { name: "Ski trip",              description: "Ski weekend for 8 people at $120 each, $960 total. Pay $600 for the lodge and $360 for the lift tickets. Everyone must pay within 3 weeks.", category: "Trips", icon: Mountain, tone: "from-mint to-ultra", payouts: 2 },
  { name: "Bachelor/ette party",   description: "Party weekend for 10 people, $3,000 total. Pay $1,800 for the hotel, $700 for activities and $500 for the group dinner. Everyone must pay within a month.", category: "Celebrations", icon: PartyPopper, tone: "from-saffron to-coral", payouts: 3 },
  { name: "Road trip fund",        description: "Road trip for 5 friends, $1,000 total. Pay $550 to the car rental company and $450 into a shared fuel and campsite fund. Everyone must pay within 2 weeks.", category: "Trips", icon: Car, tone: "from-ink to-ultra", payouts: 2 },
  { name: "Group dinner",          description: "Dinner for 8 friends, $480 total. Pay the restaurant $480 once everyone has paid their $60 share. Everyone must pay within a week.", category: "Celebrations", icon: Utensils, tone: "from-mint to-saffron", payouts: 1 },
];
