"use client";

import type { SetupQuestion } from "@/lib/ai/schemas";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { TagInput } from "@/components/ui/tag-input";

/** Renders one dynamically-generated onboarding question based on its type. */
export function QuestionField({
  question,
  value,
  onChange,
  error,
}: {
  question: SetupQuestion;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={question.id}>{question.prompt}</Label>

      {question.type === "short_text" && (
        <Input
          id={question.id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your answer…"
        />
      )}

      {question.type === "single_select" && (
        <div className="flex flex-wrap gap-2">
          {question.options?.map((option) => (
            <Chip key={option} selected={value === option} onClick={() => onChange(option)}>
              {option}
            </Chip>
          ))}
        </div>
      )}

      {question.type === "multi_select" && (
        <TagInput
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          suggestions={question.options}
          placeholder="Add an option…"
        />
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
