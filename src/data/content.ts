import {
  Zap, DoorOpen, Waves, GitFork, Lock,
  Home, Plane, Mountain, PartyPopper,
  MessageCircle, Wand2, CircleCheck,
  type LucideIcon,
} from "lucide-react";

export const BRAND = { name: "Rivulet", tagline: "The group trip, paid for." } as const;

export interface Feature {
  icon: LucideIcon;
  tone: string;
  title: string;
  text: string;
}

export const FEATURES: Feature[] = [
  { icon: Zap, tone: "bg-ultra/10 text-ultra", title: "Say the trip", text: "Describe it in a sentence: who is going, what it costs, and when everyone has to pay." },
  { icon: DoorOpen, tone: "bg-coral/15 text-coral", title: "One link", text: "Friends pay their share through PayPal. No app, no chasing people in the group chat." },
  { icon: Waves, tone: "bg-mint/25 text-emerald-700", title: "See who is in", text: "Watch shares come in, with what is still outstanding and the days left to pay." },
  { icon: GitFork, tone: "bg-saffron/30 text-amber-700", title: "Pay the vendors", text: "When the pot is full, the villa, the flights and the dinner are paid straight from it." },
  { icon: Lock, tone: "bg-ink/10 text-ink", title: "Money back", text: "If the trip falls through or the deadline passes, everyone is refunded through PayPal." },
];

export interface UseCase {
  icon: LucideIcon;
  title: string;
  text: string;
  fallback: string;
}

export const USE_CASES: UseCase[] = [
  { icon: Home, title: "House rentals", text: "Deposit now, balance later.", fallback: "from-emerald-600 to-saffron" },
  { icon: Mountain, title: "Ski & road trips", text: "Lodging, lifts and fuel.", fallback: "from-ink to-ultra" },
  { icon: Plane, title: "Group flights", text: "Reimburse whoever booked.", fallback: "from-coral to-ultra" },
  { icon: PartyPopper, title: "Party weekends", text: "Hotel, activities, dinner.", fallback: "from-ultra to-mint" },
];

export interface Step {
  icon: LucideIcon;
  title: string;
  text: string;
}

export const STEPS: Step[] = [
  { icon: MessageCircle, title: "Say what you need", text: "“Lisbon for 6 friends: $1,800 for flights and $2,400 for the villa, everyone pays by March 1.”" },
  { icon: Wand2, title: "Review the flow", text: "AI works out each person’s share, who gets paid and the deadline. Adjust anything." },
  { icon: CircleCheck, title: "Watch it run", text: "Share the link, watch shares come in, and payouts go out when the pot is full." },
];
