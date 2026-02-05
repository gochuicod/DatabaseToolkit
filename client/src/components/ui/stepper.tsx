import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepProps {
  number: number;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
}

export function Step({ number, title, isActive, isCompleted }: StepProps) {
  return (
    <div className="flex items-center gap-3 group">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors",
          isActive
            ? "bg-primary text-primary-foreground border-primary"
            : isCompleted
              ? "bg-green-500 border-green-500 text-white"
              : "bg-muted text-muted-foreground border-input",
        )}
      >
        {isCompleted ? <Check className="h-4 w-4" /> : number}
      </div>
      <span
        className={cn(
          "text-sm font-medium transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {title}
      </span>
    </div>
  );
}
