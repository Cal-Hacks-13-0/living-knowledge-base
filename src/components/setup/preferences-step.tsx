"use client";

import { Chip } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export interface WizardPreferences {
  monitoringFrequency: "DAILY" | "WEEKLY" | "MONTHLY";
  sourceTypes: string[];
  additionalNotes: string;
}

const FREQUENCIES: Array<{ value: WizardPreferences["monitoringFrequency"]; label: string }> = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

const SOURCE_TYPES = [
  "Official documentation",
  "Tech blogs",
  "GitHub releases",
  "Research papers",
  "News & newsletters",
  "Video content",
];

export function PreferencesStep({
  value,
  onChange,
}: {
  value: WizardPreferences;
  onChange: (value: WizardPreferences) => void;
}) {
  function toggleSourceType(type: string) {
    const selected = value.sourceTypes.includes(type);
    onChange({
      ...value,
      sourceTypes: selected ? value.sourceTypes.filter((t) => t !== type) : [...value.sourceTypes, type],
    });
  }

  return (
    <div className="flex flex-col gap-6">
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

      <div className="flex flex-col gap-2">
        <Label>What types of sources are you interested in?</Label>
        <div className="grid grid-cols-2 gap-2">
          {SOURCE_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={value.sourceTypes.includes(type)} onChange={() => toggleSourceType(type)} />
              {type}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="additionalNotes">Additional preferences (optional)</Label>
        <Textarea
          id="additionalNotes"
          rows={3}
          placeholder="e.g. Focus on practical tutorials, avoid beginner content…"
          value={value.additionalNotes}
          onChange={(e) => onChange({ ...value, additionalNotes: e.target.value })}
        />
      </div>
    </div>
  );
}
