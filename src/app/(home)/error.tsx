"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function HomeError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4">
      <Alert variant="danger" className="w-full">
        Couldn&apos;t load your knowledge vaults.
      </Alert>
      <Button variant="secondary" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
