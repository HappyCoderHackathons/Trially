import Image from "next/image"

interface TriallyLogoProps {
  size?: "sm" | "md" | "lg"
}

export function TriallyLogo({ size = "md" }: TriallyLogoProps) {
  const dimensions = {
    sm: { width: 40, height: 40 },
    md: { width: 64, height: 64 },
    lg: { width: 96, height: 96 },
  }

  const { width, height } = dimensions[size]

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Image
          src="/trially-logo.jpg"
          alt="Trially Logo"
          width={width}
          height={height}
          className="rounded-full shadow-md"
          priority
        />
      </div>
      <h1 className="text-4xl md:text-5xl font-light tracking-wide text-primary">
        Trially
      </h1>
      <p className="text-muted-foreground text-sm tracking-wider">
        Connect with Medical Trials
      </p>
    </div>
  )
}
