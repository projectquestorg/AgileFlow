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
        "relative h-full w-full overflow-hidden rounded-[18px] border border-[rgba(15,23,42,0.06)]",
        "bg-[radial-gradient(circle_at_top,rgba(232,104,58,0.12),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))]",
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-x-6 top-3 h-px bg-[linear-gradient(90deg,transparent,rgba(232,104,58,0.3),transparent)]" />
      <div className="relative h-full w-full p-3 sm:p-4">
        <SvgSceneByName scene={scene} />
      </div>
    </div>
  );
}
