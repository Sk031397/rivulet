import type { Flow } from "@/data/dashboard";
import { DEMO_USER_ID } from "./session";
import { getAllFlows, saveFlow } from "./store";

const SAMPLE_ID = "sample-lisbon-trip";

/**
 * A PayPal SANDBOX personal account (not a real person). Using it as the sample
 * villa host makes the demo payout land somewhere real in the sandbox, and makes
 * it a known address, so a misread of it on the demo invoice is corrected.
 */
const DEMO_PAYEE = "sb-a6pl453848929@personal.example.com";

/** A clearly-labelled sample so the demo dashboard isn't blank. Nothing has been paid into it. */
function sampleFlow(now = new Date()): Flow {
  const deadline = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  return {
    id: SAMPLE_ID,
    ownerId: DEMO_USER_ID,
    name: "Sample: Lisbon trip for 4 friends",
    status: "Collecting",
    collected: 0,
    goal: 1600,
    currency: "USD",
    contributors: 0,
    participants: 4,
    roster: [
      { id: `${SAMPLE_ID}-m0`, name: "Alex" },
      { id: `${SAMPLE_ID}-m1`, name: "Sam" },
      { id: `${SAMPLE_ID}-m2`, name: "Priya" },
      { id: `${SAMPLE_ID}-m3`, name: "Jo" },
    ],
    deadline,
    contributions: [],
    payouts: [
      { id: `${SAMPLE_ID}-p0`, label: "Villa host", amount: 1000, state: "pending", note: "Sample payout", recipient: DEMO_PAYEE },
      { id: `${SAMPLE_ID}-p1`, label: "Flights", amount: 600, state: "pending", note: "Sample payout", recipient: "flights@example.com" },
    ],
  };
}

/** For the demo account only: if it has no flows yet, add the sample one. */
export async function ensureDemoSample(userId: string): Promise<void> {
  if (userId !== DEMO_USER_ID) return;
  if ((await getAllFlows(userId)).length > 0) return;
  await saveFlow(sampleFlow());
}
