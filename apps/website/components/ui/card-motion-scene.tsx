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
      className={cn("relative h-full w-full overflow-hidden", className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0">
        <SvgSceneByName scene={scene} />
      </div>
      {/* Text-area readability: gentle top fade using warm paper color */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[45%]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(253,252,249,0.92) 0%, rgba(253,252,249,0.55) 45%, rgba(253,252,249,0) 100%)",
        }}
      />
    </div>
  );
}
