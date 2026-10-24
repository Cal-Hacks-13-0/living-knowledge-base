import { Suspense } from "react";
import { OnboardingWizard } from "@/components/setup/onboarding-wizard";

export default function NewKnowledgeBasePage() {
  return (
    <Suspense>
      <OnboardingWizard />
    </Suspense>
  );
}
