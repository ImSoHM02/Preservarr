import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionLink?: string;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionLink,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("cmp-emptystate__layout", className)} data-testid="empty-state">
      <div className="cmp-emptystate__panel">
        <Icon className="cmp-emptystate__icon" aria-hidden="true" />
      </div>
      <h3 className="cmp-emptystate__title">{title}</h3>
      <p className="cmp-emptystate__description">{description}</p>
      {actionLabel && actionLink && (
        <Button size="lg" className="cmp-emptystate__font-semibold" asChild>
          <Link href={actionLink}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
