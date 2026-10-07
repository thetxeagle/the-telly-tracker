import { cn } from "@/lib/utils"

const seedBackdropClasses: Record<string, string> = {
  aurora: "backdrop-aurora",
  horizon: "backdrop-horizon",
  ridge: "backdrop-ridge",
  deep: "backdrop-deep",
  harbor: "backdrop-harbor",
}

type MediaArtworkProps = {
  backdrop: string
  className?: string
  title?: string
}

export function MediaArtwork({ backdrop, className, title }: MediaArtworkProps) {
  const remote = backdrop.startsWith("https://")
  return (
    <div
      className={cn(className, !remote && seedBackdropClasses[backdrop])}
      style={remote ? { backgroundImage: `url(${JSON.stringify(backdrop).slice(1, -1)})` } : undefined}
      role={title ? "img" : undefined}
      aria-label={title ? `${title} artwork` : undefined}
      aria-hidden={title ? undefined : "true"}
    />
  )
}
