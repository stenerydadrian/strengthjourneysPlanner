/**
 * One planned exercise: its sets as a checklist. Each row has editable weight
 * and reps (pre-filled from the plan) and a Complete Set button. Completing a
 * set is the page's job (onComplete); this card only collects the numbers.
 */

import { useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PlannedExerciseCard({
  exercise,
  sets,
  unitLabel,
  completedKeys,
  onComplete,
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{exercise}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sets.map((set, index) => (
          <PlannedSetRow
            key={set.rowIndex}
            set={set}
            number={index + 1}
            unitLabel={unitLabel}
            isDone={set.status === "Done" || completedKeys.has(set.rowIndex)}
            onComplete={onComplete}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PlannedSetRow({ set, number, unitLabel, isDone, onComplete }) {
  const [weight, setWeight] = useState(String(set.targetWeight ?? ""));
  const [reps, setReps] = useState(String(set.targetReps ?? ""));
  const repsValue = parseInt(reps, 10);
  const weightValue = parseFloat(weight);
  const canComplete =
    !isDone && Number.isFinite(repsValue) && repsValue > 0 && weightValue >= 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border p-2",
        isDone && "bg-muted/50 text-muted-foreground",
      )}
    >
      <span className="w-14 shrink-0 text-sm font-medium">Set {number}</span>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          inputMode="decimal"
          aria-label={`Set ${number} weight`}
          className={cn("h-9 w-20", isDone && "line-through")}
          value={weight}
          disabled={isDone}
          onChange={(event) => setWeight(event.target.value)}
        />
        <span className="text-sm">{unitLabel}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm">×</span>
        <Input
          type="number"
          inputMode="numeric"
          aria-label={`Set ${number} reps`}
          className={cn("h-9 w-16", isDone && "line-through")}
          value={reps}
          disabled={isDone}
          onChange={(event) => setReps(event.target.value)}
        />
      </div>
      {set.targetRpe !== null && (
        <span className="text-muted-foreground text-xs">
          RPE {set.targetRpe}
        </span>
      )}
      {set.notes && (
        <span className="text-muted-foreground text-xs">{set.notes}</span>
      )}
      <Button
        size="sm"
        variant={isDone ? "secondary" : "default"}
        className="ml-auto"
        disabled={!canComplete}
        onClick={() =>
          onComplete(set, { weight: weightValue, reps: repsValue })
        }
      >
        <Check className="h-4 w-4" />
        {isDone ? "Done" : "Complete Set"}
      </Button>
    </div>
  );
}
