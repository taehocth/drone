import { cn } from "@/lib/commonUtils"

type BackgroundVariant =
  | "dashboard"
  | "flight-log"
  | "checklist"
  | "items"
  | "settings"
  | "simulation"
  | "admin"
  | "uav"

const variantLayers: Record<BackgroundVariant, string[]> = {
  dashboard: [
    "absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_55%)]",
    "absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(14,165,233,0.12),transparent_55%)]",
    "absolute left-[-20%] top-[-25%] h-[520px] w-[520px] rounded-full bg-blue-400/20 blur-[170px]",
  ],
  "flight-log": [
    "absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_55%)]",
    "absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(34,197,94,0.12),transparent_55%)]",
    "absolute right-[-15%] top-[-20%] h-[520px] w-[520px] rounded-full bg-emerald-400/20 blur-[170px]",
  ],
  checklist: [
    "absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.14),transparent_55%)]",
    "absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(251,191,36,0.12),transparent_55%)]",
    "absolute left-[-20%] top-[-25%] h-[520px] w-[520px] rounded-full bg-amber-300/25 blur-[170px]",
  ],
  items: [
    "absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.14),transparent_55%)]",
    "absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(139,92,246,0.12),transparent_55%)]",
    "absolute right-[-15%] top-[-20%] h-[520px] w-[520px] rounded-full bg-indigo-400/20 blur-[170px]",
  ],
  settings: [
    "absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(236,72,153,0.12),transparent_55%)]",
    "absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(129,140,248,0.12),transparent_55%)]",
    "absolute left-[-20%] top-[-25%] h-[520px] w-[520px] rounded-full bg-fuchsia-300/20 blur-[170px]",
  ],
  simulation: [
    "absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.14),transparent_55%)]",
    "absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.12),transparent_55%)]",
    "absolute right-[-15%] top-[-20%] h-[520px] w-[520px] rounded-full bg-cyan-300/25 blur-[170px]",
  ],
  admin: [
    "absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(248,113,113,0.12),transparent_55%)]",
    "absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(251,146,60,0.12),transparent_55%)]",
    "absolute left-[-20%] top-[-25%] h-[520px] w-[520px] rounded-full bg-rose-300/20 blur-[170px]",
  ],
  uav: [
    "absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_55%)]",
    "absolute inset-0 bg-[radial-gradient(circle_at_60%_30%,rgba(14,165,233,0.12),transparent_55%)]",
  ],
}

const baseLayers = [
  "absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:42px_42px] opacity-60",
]

type DashboardBackgroundProps = {
  variant: BackgroundVariant
  className?: string
  children: React.ReactNode
}

export function DashboardBackground({
  variant,
  className,
  children,
}: DashboardBackgroundProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen w-full overflow-hidden bg-slate-50 text-slate-900",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        {baseLayers.map((cls, idx) => (
          <div key={`base-${idx}`} className={cls} />
        ))}
        {variantLayers[variant].map((cls, idx) => (
          <div key={`${variant}-${idx}`} className={cls} />
        ))}
      </div>
      {children}
    </div>
  )
}
