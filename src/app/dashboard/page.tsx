"use client";

import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/dashboard/Topbar";
import PromptBox from "@/components/dashboard/PromptBox";
import StatCards from "@/components/dashboard/StatCards";
import FlowList from "@/components/dashboard/FlowList";
import FlowDetail from "@/components/dashboard/FlowDetail";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import { EMPTY_STATS, type Flow, type ActivityItem, type Stat } from "@/data/dashboard";

export default function OverviewPage() {
  const [flows, setFlows]           = useState<Flow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activity, setActivity]     = useState<ActivityItem[]>([]);
  const [stats, setStats]           = useState<Stat[]>(EMPTY_STATS);

  const selected = flows.find((f) => f.id === selectedId) ?? flows[0] ?? null;

  /** Fetch flows from the server store — picks up webhook updates. */
  const refreshFlows = useCallback(() => {
    fetch("/api/flows")
      .then((r) => r.json())
      .then((d: { flows?: Flow[] }) => {
        if (d.flows) {
          setFlows(d.flows);
          // Keep localStorage in sync for Topbar search
          try { localStorage.setItem("rivulet-flows", JSON.stringify(d.flows)); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, []);

  // Load flows + activity + stats on mount
  useEffect(() => {
    refreshFlows();

    fetch("/api/activity")
      .then((r) => r.json())
      .then((d: { items?: ActivityItem[] }) => { if (d.items) setActivity(d.items); })
      .catch(() => {});

    fetch("/api/stats")
      .then((r) => r.json())
      .then((d: { stats?: Stat[] }) => { if (d.stats) setStats(d.stats); })
      .catch(() => {});
  }, [refreshFlows]);

  // Poll every 10 seconds so webhook-driven updates appear automatically
  useEffect(() => {
    const id = setInterval(refreshFlows, 10_000);
    return () => clearInterval(id);
  }, [refreshFlows]);

  /** Called by PromptBox when a new flow is created. */
  const handleBuild = (flow: Flow) => {
    // Flow is already saved server-side by build-flow route.
    // Optimistically add it to local state immediately, then re-sync.
    setFlows((prev) => {
      const without = prev.filter((f) => f.id !== flow.id);
      return [flow, ...without];
    });
    setSelectedId(flow.id);
    try { localStorage.setItem("rivulet-flows", JSON.stringify([flow, ...flows])); } catch { /* ignore */ }
  };

  return (
    <>
      <Topbar />
      <PromptBox onBuild={handleBuild} />
      <StatCards stats={stats} />

      {flows.length === 0 ? (
        <div className="rounded-3xl bg-white p-12 text-center ring-1 ring-ink/5">
          <p className="text-2xl font-extrabold text-ink">No flows yet</p>
          <p className="mt-2 text-sm text-ink/55">
            Describe what you want above and hit <strong>Build flow</strong> to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <FlowList flows={flows} selectedId={selectedId ?? ""} onSelect={setSelectedId} />
          <div className="space-y-6">
            {selected && <FlowDetail flow={selected} />}
            {activity.length > 0 && <ActivityFeed items={activity} />}
          </div>
        </div>
      )}
    </>
  );
}
