"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowLeft, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StepSidebar, type WizardStep } from "./step-sidebar";
import { HowItWorksPanel } from "./how-it-works-panel";
import { QuestionField } from "./question-field";
import { PreferencesStep, type WizardPreferences } from "./preferences-step";
import { CategoryList } from "@/components/blueprint/category-list";
import { SourceList } from "@/components/blueprint/source-list";
import { StringListEditor } from "@/components/blueprint/string-list-editor";
import { apiPost, ApiError } from "@/lib/client/api";
import type {
  SetupQuestion,
  SetupQuestionsResponse,
  OnboardingAnswer,
  BlueprintResponse,
} from "@/lib/ai/schemas";

const STEPS: WizardStep[] = [
  { key: "goal", label: "Your goal" },
  { key: "preferences", label: "Preferences" },
  { key: "structure", label: "Knowledge structure" },
  { key: "sources", label: "Sources" },
  { key: "review", label: "Review & create" },
];

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Step 0: goal + dynamic questions
  const [goal, setGoal] = useState(searchParams.get("goal") ?? "");
  const [goalDraft, setGoalDraft] = useState(goal);
  const [questions, setQuestions] = useState<SetupQuestion[] | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Step 1: preferences
  const [preferences, setPreferences] = useState<WizardPreferences>({
    monitoringFrequency: "WEEKLY",
    sourceTypes: [],
    additionalNotes: "",
  });

  // Steps 2-4: the editable blueprint
  const [blueprint, setBlueprint] = useState<BlueprintResponse | null>(null);
  const [blueprintLoading, setBlueprintLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function fetchQuestions(forGoal: string) {
    setQuestionsLoading(true);
    setError(null);
    try {
      const result = await apiPost<SetupQuestionsResponse>("/api/setup/questions", {
        userGoal: forGoal,
        previousAnswers: [],
      });
      setQuestions(result.questions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate questions.");
      setGoal(""); // let the user retry the goal input
    } finally {
      setQuestionsLoading(false);
    }
  }

  useEffect(() => {
    // Fetches AI-generated questions whenever `goal` changes (set from the
    // Home hero's query param, or from the step-0 fallback form) — a
    // legitimate "sync with an external system" effect, not state derived
    // from other state.
    if (goal && questions === null && !questionsLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchQuestions(goal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  function handleGoalSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = goalDraft.trim();
    if (!value) return;
    setQuestions(null);
    setGoal(value);
  }

  function validateAnswers(): boolean {
    if (!questions) return false;
    const errors: Record<string, string> = {};
    for (const q of questions) {
      const a = answers[q.id];
      const empty = q.type === "multi_select" ? !Array.isArray(a) || a.length === 0 : !a || (typeof a === "string" && !a.trim());
      if (empty) errors[q.id] = "This field is required.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function goNext() {
    setError(null);

    if (stepIndex === 0) {
      if (!questions || !validateAnswers()) return;
      setStepIndex(1);
      return;
    }

    if (stepIndex === 1) {
      setBlueprintLoading(true);
      try {
        const onboardingAnswers: OnboardingAnswer[] = (questions ?? []).map((q) => ({
          questionId: q.id,
          prompt: q.prompt,
          answer: answers[q.id],
        }));
        const result = await apiPost<BlueprintResponse>("/api/blueprints/generate", {
          userGoal: goal,
          answers: onboardingAnswers,
          preferences,
        });
        // Preferences step always wins over the model's own frequency guess —
        // the user explicitly chose a cadence.
        setBlueprint({ ...result, monitoringFrequency: preferences.monitoringFrequency });
        setStepIndex(2);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to generate your blueprint.");
      } finally {
        setBlueprintLoading(false);
      }
      return;
    }

    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    if (stepIndex === 0) {
      router.push("/");
      return;
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleCreate() {
    if (!blueprint) return;
    setCreating(true);
    setError(null);
    try {
      const kb = await apiPost<{ id: string }>("/api/knowledge-bases", {
        userGoal: goal,
        name: blueprint.name,
        description: blueprint.description,
        preferences: {
          answers: Object.fromEntries((questions ?? []).map((q) => [q.id, answers[q.id]])),
          sourceTypes: preferences.sourceTypes,
          additionalNotes: preferences.additionalNotes,
        },
        monitoringFrequency: blueprint.monitoringFrequency,
        categories: blueprint.categories,
        sources: blueprint.sources,
      });
      router.push(`/kb/${kb.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create knowledge base.");
      setCreating(false);
    }
  }

  return (
    <div className="flex h-dvh">
      <StepSidebar steps={STEPS} currentIndex={stepIndex} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-10">
          {error && <Alert variant="danger">{error}</Alert>}

          {/* Step 0: Your goal */}
          {stepIndex === 0 && (
            <>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Step 1. Tell us about your knowledge base</h1>
                <p className="mt-1 text-sm text-muted">
                  We&apos;ll ask a few questions to understand your goals and generate a blueprint.
                </p>
              </div>

              {!goal ? (
                <form onSubmit={handleGoalSubmit} className="flex flex-col gap-3">
                  <Label htmlFor="goal">What do you want to build a knowledge base about?</Label>
                  <Textarea
                    id="goal"
                    rows={3}
                    value={goalDraft}
                    onChange={(e) => setGoalDraft(e.target.value)}
                    placeholder="I want to build a knowledge base about…"
                  />
                  <Button type="submit" disabled={!goalDraft.trim()} className="self-start">
                    <Sparkles className="h-4 w-4" /> Generate questions
                  </Button>
                </form>
              ) : questionsLoading || questions === null ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking of a few questions about &ldquo;{goal}&rdquo;…
                </div>
              ) : questions.length === 0 ? (
                <Alert>Your goal is already specific — no extra questions needed. Click Next to continue.</Alert>
              ) : (
                <div className="flex flex-col gap-5 rounded-xl border border-border p-5">
                  {questions.map((q) => (
                    <QuestionField
                      key={q.id}
                      question={q}
                      value={answers[q.id] ?? (q.type === "multi_select" ? [] : "")}
                      onChange={(value) => setAnswers((a) => ({ ...a, [q.id]: value }))}
                      error={fieldErrors[q.id]}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step 1: Preferences */}
          {stepIndex === 1 && (
            <>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Step 2. Set your preferences</h1>
                <p className="mt-1 text-sm text-muted">Help us customize the knowledge base to better fit your needs.</p>
              </div>
              <PreferencesStep value={preferences} onChange={setPreferences} />
            </>
          )}

          {/* Step 2: Knowledge structure */}
          {stepIndex === 2 && blueprint && (
            <>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Step 3. Review your knowledge structure</h1>
                <p className="mt-1 text-sm text-muted">Edit the name, description, and categories before continuing.</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Name</Label>
                  <Input value={blueprint.name} onChange={(e) => setBlueprint({ ...blueprint, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={blueprint.description}
                    onChange={(e) => setBlueprint({ ...blueprint, description: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
              <CategoryList categories={blueprint.categories} onChange={(categories) => setBlueprint({ ...blueprint, categories })} />
            </>
          )}

          {/* Step 3: Sources */}
          {stepIndex === 3 && blueprint && (
            <>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Step 4. Choose your sources</h1>
                <p className="mt-1 text-sm text-muted">
                  Sources marked <strong>Verified</strong> are confirmed reachable; others are AI suggestions to review.
                </p>
              </div>
              <SourceList sources={blueprint.sources} onChange={(sources) => setBlueprint({ ...blueprint, sources })} />
            </>
          )}

          {/* Step 4: Review & create */}
          {stepIndex === 4 && blueprint && (
            <>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Step 5. Review &amp; create</h1>
                <p className="mt-1 text-sm text-muted">Nothing is saved yet — confirm to create your knowledge base.</p>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold text-foreground">{blueprint.name}</p>
                <p className="mt-1 text-sm text-muted">{blueprint.description}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant="neutral">{blueprint.categories.length} categories</Badge>
                  <Badge variant="neutral">{blueprint.sources.length} sources</Badge>
                  <Badge variant="neutral">{blueprint.monitoringFrequency} monitoring</Badge>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <Label>Research priorities</Label>
                  <StringListEditor
                    items={blueprint.researchPriorities}
                    onChange={(researchPriorities) => setBlueprint({ ...blueprint, researchPriorities })}
                    placeholder="Add priority"
                  />
                </div>
                <div>
                  <Label>Maintenance rules</Label>
                  <StringListEditor
                    items={blueprint.maintenanceRules}
                    onChange={(maintenanceRules) => setBlueprint({ ...blueprint, maintenanceRules })}
                    placeholder="Add rule"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="ghost" onClick={goBack} disabled={creating || blueprintLoading}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>

            {stepIndex < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={goNext}
                disabled={
                  blueprintLoading ||
                  (stepIndex === 0 && (questionsLoading || !questions))
                }
              >
                {blueprintLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Drafting your blueprint…
                  </>
                ) : (
                  <>
                    Next <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            ) : (
              <Button type="button" onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm &amp; create knowledge base
              </Button>
            )}
          </div>
        </div>
      </div>

      {stepIndex === 0 && <HowItWorksPanel />}
    </div>
  );
}
