import { cn } from "@/lib/cn";
import { sceneFromSrc, SvgSceneByName } from "@/components/ui/animated-svg-scenes";

export function CardMotionScene({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const scene = sceneFromSrc(src);
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-0">
        <SvgSceneByName scene={scene} />
      </div>
      {/* Top-edge fade so composition melts into card text above */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/90 via-white/30 to-transparent" />
      {/* Side vignette */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white/40 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white/40 to-transparent" />
    </div>
  );
}
