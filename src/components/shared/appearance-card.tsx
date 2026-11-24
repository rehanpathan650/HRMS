"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="grid grid-cols-3 gap-3 sm:max-w-md">
      {[
        { v: "light", l: "Light", I: Sun },
        { v: "dark", l: "Dark", I: Moon },
        { v: "system", l: "System", I: Monitor },
      ].map(({ v, l, I }) => (
        <button
          key={v}
          onClick={() => setTheme(v)}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border p-4 text-[13px] font-medium transition-colors hover:bg-muted/50",
            mounted && theme === v && "border-foreground/60 bg-muted/60 ring-1 ring-foreground/10",
          )}
        >
          <I className="size-5 text-muted-foreground" />
          {l}
        </button>
      ))}
    </div>
  );
}
