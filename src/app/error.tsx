"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">An unexpected error occurred. Please try again.</p>
        <Button className="mt-6" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
