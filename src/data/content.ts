import {
  Zap, DoorOpen, Waves, GitFork, Lock,
  Users, Music2, Plane, Heart,
  MessageCircle, Wand2, CircleCheck,
  type LucideIcon,
} from "lucide-react";

export const BRAND = { name: "Rivulet", tagline: "Let money find its way." } as const;

export interface Feature {
  icon: LucideIcon;
  tone: string;
  title: string;
  text: string;
}

export const FEATURES: Feature[] = [
  { icon: Zap, tone: "bg-ultra/10 text-ultra", title: "Skip", text: "Send money to anyone, even if they have no account." },
  { icon: DoorOpen, tone: "bg-coral/15 text-coral", title: "Doorway", text: "Turn a link or QR code into a place people can pay." },
  { icon: Waves, tone: "bg-mint/25 text-emerald-700", title: "Trickle", text: "Pay a little at a time, from minutes to milestones." },
  { icon: GitFork, tone: "bg-saffron/30 text-amber-700", title: "Fork", text: "Split one payment into several payouts automatically." },
  { icon: Lock, tone: "bg-ink/10 text-ink", title: "Hold", text: "Set conditions. Release funds only when they’re met." },
];

export interface UseCase {
  icon: LucideIcon;
  title: string;
  text: string;
  img: string;
  fallback: string;
}

export const USE_CASES: UseCase[] = [
  { icon: Users, title: "Community events", text: "Fund, organize, and reward.", img: "/images/community.jpg", fallback: "from-emerald-600 to-saffron" },
  { icon: Music2, title: "Creators & artists", text: "Split earnings, grow together.", img: "/images/creators.jpg", fallback: "from-ink to-ultra" },
  { icon: Plane, title: "Travel groups", text: "Collect, split, and book.", img: "/images/travel.jpg", fallback: "from-coral to-ultra" },
  { icon: Heart, title: "Charity & impact", text: "Automate donations.", img: "/images/charity.jpg", fallback: "from-ultra to-mint" },
];

export interface Step {
  icon: LucideIcon;
  title: string;
  text: string;
}

export const STEPS: Step[] = [
  { icon: MessageCircle, title: "Say what you need", text: "“Collect $1,000 for a neighborhood cleanup and reward volunteers.”" },
  { icon: Wand2, title: "Review the flow", text: "AI maps who pays, who gets paid, and when. Adjust anything." },
  { icon: CircleCheck, title: "Watch it run", text: "Track every payment and payout as the flow executes." },
];
