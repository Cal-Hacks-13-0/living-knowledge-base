"use client";

import type { SetupQuestion } from "@/lib/ai/schemas";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";

const MAX_SUGGESTED_OPTIONS = 3;

/**
 * Renders one dynamically-generated onboarding question. Every question —
 * regardless of the AI's declared type — gets the same treatment: up to 3
 * suggested options as multi-selectable chips, plus a free-text field for
 * anything not listed. Answers are always a string[].
 */
export function QuestionField({
  question,
  value,
  onChange,
  error,
}: {
  question: SetupQuestion;
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={question.id}>{question.prompt}</Label>
      <TagInput
        value={value}
        onChange={onChange}
        suggestions={question.options?.slice(0, MAX_SUGGESTED_OPTIONS)}
        placeholder="Other — type your own…"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
