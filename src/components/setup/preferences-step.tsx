"use client";

import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";

export interface WizardPreferences {
  monitoringFrequency: "DAILY" | "WEEKLY" | "MONTHLY";
}

const FREQUENCIES: Array<{ value: WizardPreferences["monitoringFrequency"]; label: string }> = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

export function PreferencesStep({
  value,
  onChange,
}: {
  value: WizardPreferences;
  onChange: (value: WizardPreferences) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>How often should we check for updates?</Label>
      <div className="flex gap-2">
        {FREQUENCIES.map((f) => (
          <Chip
            key={f.value}
            selected={value.monitoringFrequency === f.value}
            onClick={() => onChange({ ...value, monitoringFrequency: f.value })}
          >
            {f.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
