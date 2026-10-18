/**
 * Workout Planner page ("Today's Routine"): planned sets from the sheet's
 * separate Planner tab, grouped by day, checked off one set at a time.
 *
 * Completing a set (1) restarts the rest timer, (2) queues the set into the
 * normal log through the log sync outbox, and (3) marks the Planner row done.
 * Planned sets are never part of useUserLiftingData's parsed rows, so they
 * cannot reach e1RM, PR, tonnage or volume stats.
 */

import { useCallback, useMemo, useState } from "react";
import { NextSeo } from "next-seo";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { useIsClient } from "usehooks-ts";

import { PageContainer } from "@/components/page-header";
import { PlannedExerciseCard } from "@/components/planner/planned-exercise-card";
import { useLogSheetSync } from "@/components/log/use-log-sheet-sync";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAthleteBio } from "@/hooks/use-athlete-biodata";
import { useTimer } from "@/hooks/use-timer";
import { useToast } from "@/hooks/use-toast";
import { useUserLiftingData } from "@/hooks/use-userlift-data";
import { formatDateToYmdLocal } from "@/lib/date-utils";
import { getSheetWriteColumns } from "@/lib/import/parsers/strength-journeys-parser";

const PAGE_TITLE = "Workout Planner | Strength Journeys";

async function fetchPlanner(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load the Planner.");
  return res.json();
}

export default function PlanPage() {
  const { status: authStatus } = useSession();
  const isClient = useIsClient();
  const { toast } = useToast();
  const { handleRestart } = useTimer();
  const { isMetric, sex } = useAthleteBio();
  const {
    parsedData,
    sheetInfo,
    mutate,
    dataSource,
    parsedDataReadAt,
    sheetLayout,
  } = useUserLiftingData();

  const ssid = sheetInfo?.ssid ?? null;
  const canPlan = authStatus === "authenticated" && dataSource === "sheet";
  const unitType = isMetric ? "kg" : "lb";
  const today = useMemo(
    () => (isClient ? formatDateToYmdLocal(new Date()) : ""),
    [isClient],
  );
  const sheetColumns = useMemo(
    () => getSheetWriteColumns(sheetLayout),
    [sheetLayout],
  );

  const { addSet } = useLogSheetSync({
    ssid:
      authStatus === "loading" ||
      dataSource === "loading" ||
      dataSource === "restoring"
        ? undefined
        : authStatus === "authenticated"
          ? ssid
          : null,
    canWrite: canPlan,
    parsedData,
    parsedDataReadAt,
    sheetColumns,
    sessionDate: today,
    isMetric,
    sex,
    mutate,
    toast,
  });

  const {
    data,
    error,
    isLoading,
    mutate: mutatePlanner,
  } = useSWR(
    canPlan && ssid ? `/api/planner?ssid=${encodeURIComponent(ssid)}` : null,
    fetchPlanner,
    { revalidateOnFocus: false },
  );

  const [repeatable, setRepeatable] = useState(false);
  const [completedKeys, setCompletedKeys] = useState(() => new Set());

  const days = useMemo(() => groupByDay(data?.items ?? []), [data]);

  const completeSet = useCallback(
    async (set, { weight, reps }) => {
      handleRestart();
      addSet(set.exercise, { reps, weight, unitType });
      setCompletedKeys((prev) => new Set(prev).add(set.rowIndex));
      if (navigator.vibrate) navigator.vibrate(40);

      try {
        const res = await fetch("/api/planner/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ssid,
            rowIndex: set.rowIndex,
            exercise: set.exercise,
            repeatable,
          }),
        });
        if (!res.ok) throw new Error("Planner update failed");
        if (!repeatable) mutatePlanner();
      } catch {
        toast({
          title: "Set logged, Planner not updated",
          description:
            "Your set is in the log. The Planner row could not be marked done.",
          variant: "destructive",
        });
      }
    },
    [handleRestart, addSet, unitType, ssid, repeatable, mutatePlanner, toast],
  );

  return (
    <PageContainer className="max-w-3xl py-6">
      <NextSeo title={PAGE_TITLE} noindex />
      <h1 className="text-3xl font-bold">Today&apos;s Routine</h1>
      <p className="text-muted-foreground mt-1">
        Planned sets live in the Planner tab of your sheet, apart from your log.
        Complete a set and it is logged for today.
      </p>

      {!canPlan ? (
        <p className="mt-6">
          Sign in and link a Google Sheet to use the Workout Planner.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2">
            <Switch
              id="planner-repeatable"
              checked={repeatable}
              onCheckedChange={setRepeatable}
            />
            <Label htmlFor="planner-repeatable">
              Keep as a template (don&apos;t mark sets done in the Planner)
            </Label>
          </div>
          {isLoading && <p className="mt-6">Loading your plan…</p>}
          {error && (
            <p className="text-destructive mt-6">
              Could not load the Planner. Try again shortly.
            </p>
          )}
          {data && days.length === 0 && (
            <p className="mt-6">
              Your Planner tab is empty. Add rows with Day, Exercise,
              TargetReps, TargetWeight, SetOrder, TargetRPE, Notes and Status
              columns, then reload.
            </p>
          )}
          <div className="mt-6 space-y-8">
            {days.map(({ day, exercises }) => (
              <section key={day} className="space-y-3">
                <h2 className="text-xl font-semibold">{day}</h2>
                {exercises.map(({ exercise, sets }) => (
                  <PlannedExerciseCard
                    key={exercise}
                    exercise={exercise}
                    sets={sets}
                    unitLabel={unitType}
                    completedKeys={completedKeys}
                    onComplete={completeSet}
                  />
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}

// Day and exercise order follow the first appearance in the sheet; sets within
// an exercise follow SetOrder.
function groupByDay(items) {
  const days = new Map();
  for (const item of items) {
    if (!days.has(item.day)) days.set(item.day, new Map());
    const exercises = days.get(item.day);
    if (!exercises.has(item.exercise)) exercises.set(item.exercise, []);
    exercises.get(item.exercise).push(item);
  }
  return [...days].map(([day, exercises]) => ({
    day,
    exercises: [...exercises].map(([exercise, sets]) => ({
      exercise,
      sets: sets.sort((a, b) => a.setOrder - b.setOrder),
    })),
  }));
}
