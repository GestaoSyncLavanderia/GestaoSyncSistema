import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SCardProps {
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SCard({ title, badge, action, children, className }: SCardProps) {
  return (
    <div className={cn("bg-white border border-[#E5E7EB] rounded-[14px] overflow-hidden", className)}>
      <div className="px-5 py-4 flex items-center justify-between border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {badge}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
