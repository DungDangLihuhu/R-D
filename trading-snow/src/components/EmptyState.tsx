import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="app-empty">
      {Icon && (
        <span className="app-empty-icon">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="font-medium text-app-text">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-app-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
