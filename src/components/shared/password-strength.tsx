import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const RULES = [
  { test: (p: string) => p.length >= 10, label: "10+ characters" },
  { test: (p: string) => /[A-Z]/.test(p) && /[a-z]/.test(p), label: "Upper & lowercase" },
  { test: (p: string) => /[0-9]/.test(p), label: "A number" },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: "A symbol" },
];

export function PasswordStrength({ value }: { value: string }) {
  const passed = RULES.filter((r) => r.test(value)).length;
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-4 gap-1">
        {RULES.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 rounded-full bg-muted transition-colors",
              i < passed && (passed <= 2 ? "bg-danger" : passed === 3 ? "bg-warning" : "bg-success"),
            )}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {RULES.map((r) => (
          <li key={r.label} className={cn("flex items-center gap-1.5 text-xs", r.test(value) ? "text-foreground" : "text-muted-foreground")}>
            <Check className={cn("size-3", r.test(value) ? "text-success" : "opacity-30")} />
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
