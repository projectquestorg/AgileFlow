"use client";

import {
  Children,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, MotionProps, useInView } from "framer-motion";

import { cn } from "@/lib/cn";

interface SequenceContextValue {
  completeItem: (index: number) => void;
  activeIndex: number;
  sequenceStarted: boolean;
}

const SequenceContext = createContext<SequenceContextValue | null>(null);

const useSequence = () => useContext(SequenceContext);

const ItemIndexContext = createContext<number | null>(null);
const useItemIndex = () => useContext(ItemIndexContext);

interface AnimatedSpanProps extends MotionProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  startOnView?: boolean;
}

export const AnimatedSpan = ({
  children,
  delay = 0,
  className,
  startOnView = false,
  ...props
}: AnimatedSpanProps) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(elementRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });

  const sequence = useSequence();
  const itemIndex = useItemIndex();
  const [hasStarted, setHasStarted] = useState(false);

  const sequenceRef = useRef(sequence);
  const itemIndexRef = useRef(itemIndex);

  useEffect(() => {
    sequenceRef.current = sequence;
    itemIndexRef.current = itemIndex;
  }, [sequence, itemIndex]);

  useEffect(() => {
    if (!sequence || itemIndex === null) return;
    if (!sequence.sequenceStarted) return;
    if (hasStarted) return;
    if (sequence.activeIndex === itemIndex) {
      setHasStarted(true);
    }
  }, [
    sequence,
    sequence?.activeIndex,
    sequence?.sequenceStarted,
    hasStarted,
    itemIndex,
  ]);

  const shouldAnimate = sequence ? hasStarted : startOnView ? isInView : true;

  return (
    <motion.div
      ref={elementRef}
      initial={{ opacity: 0, y: -5 }}
      animate={shouldAnimate ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }}
      transition={{ duration: 0.3, delay: sequence ? 0 : delay / 1000 }}
      className={cn(
        "block font-normal tracking-tight whitespace-pre",
        className,
      )}
      onAnimationComplete={() => {
        const seq = sequenceRef.current;
        const idx = itemIndexRef.current;
        if (!seq) return;
        if (idx === null) return;
        // Only call completeItem if this item actually animated (was visible)
        if (!hasStarted) {
          return;
        }
        seq.completeItem(idx);
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

interface TypingAnimationProps extends MotionProps {
  children: string;
  className?: string;
  duration?: number;
  delay?: number;
  as?: React.ElementType;
  startOnView?: boolean;
}

export const TypingAnimation = ({
  children,
  className,
  duration = 60,
  delay = 0,
  as: Component = "span",
  startOnView = true,
  ...props
}: TypingAnimationProps) => {
  if (typeof children !== "string") {
    throw new Error("TypingAnimation: children must be a string. Received:");
  }

  const MotionComponent = useMemo(
    () =>
      motion.create(Component, {
        forwardMotionProps: true,
      }),
    [Component],
  );

  const [displayedText, setDisplayedText] = useState<string>("");
  const [started, setStarted] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(elementRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });

  const sequence = useSequence();
  const itemIndex = useItemIndex();

  const sequenceRef = useRef(sequence);
  const itemIndexRef = useRef(itemIndex);

  useEffect(() => {
    sequenceRef.current = sequence;
    itemIndexRef.current = itemIndex;
  }, [sequence, itemIndex]);

  useEffect(() => {
    if (sequence && itemIndex !== null) {
      if (!sequence.sequenceStarted) return;
      if (started) return;
      if (sequence.activeIndex === itemIndex) {
        setStarted(true);
      }
      return;
    }

    if (!startOnView) {
      const startTimeout = setTimeout(() => setStarted(true), delay);
      return () => clearTimeout(startTimeout);
    }

    if (!isInView) return;

    const startTimeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(startTimeout);
  }, [
    delay,
    startOnView,
    isInView,
    started,
    sequence,
    sequence?.activeIndex,
    sequence?.sequenceStarted,
    itemIndex,
  ]);

  useEffect(() => {
    if (!started) return;

    let i = 0;
    const typingEffect = setInterval(() => {
      if (i < children.length) {
        setDisplayedText(children.substring(0, i + 1));
        i++;
      } else {
        clearInterval(typingEffect);
        const seq = sequenceRef.current;
        const idx = itemIndexRef.current;
        if (seq && idx !== null) {
          seq.completeItem(idx);
        }
      }
    }, duration);

    return () => {
      clearInterval(typingEffect);
    };
  }, [children, duration, started]);

  return (
    <MotionComponent
      ref={elementRef}
      className={cn("font-normal tracking-tight", className)}
      {...props}
    >
      {displayedText}
    </MotionComponent>
  );
};

interface TerminalProps {
  children: React.ReactNode;
  className?: string;
  sequence?: boolean;
  startOnView?: boolean;
}

export const Terminal = ({
  children,
  className,
  sequence = true,
  startOnView = true,
}: TerminalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLPreElement | null>(null);
  const isInView = useInView(containerRef as React.RefObject<Element>, {
    amount: 0.3,
    once: true,
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const sequenceHasStarted = sequence ? !startOnView || isInView : false;

  const contextValue = useMemo<SequenceContextValue | null>(() => {
    if (!sequence) return null;
    return {
      completeItem: (index: number) => {
        setActiveIndex((current) => {
          const next = index === current ? current + 1 : current;
          return next;
        });
      },
      activeIndex,
      sequenceStarted: sequenceHasStarted,
    };
  }, [sequence, activeIndex, sequenceHasStarted]);

  const wrappedChildren = useMemo(() => {
    if (!sequence) return children;
    const array = Children.toArray(children);
    return array.map((child, index) => (
      <ItemIndexContext.Provider key={index} value={index}>
        {child as React.ReactNode}
      </ItemIndexContext.Provider>
    ));
  }, [children, sequence]);

  // Get total number of children
  const totalChildren = useMemo(() => {
    if (!sequence) return 0;
    return Children.count(children);
  }, [children, sequence]);

  const isAnimationComplete = activeIndex >= totalChildren;

  // Scroll to show the latest animated item + 1 extra line (within terminal only)
  useEffect(() => {
    if (scrollRef.current && sequenceHasStarted) {
      // Find the currently active element
      const childElements = scrollRef.current.querySelectorAll("code > div");
      // Scroll to active + 1 for extra line visibility
      const targetIndex = Math.min(activeIndex + 1, childElements.length - 1);
      const targetElement = childElements[targetIndex] as HTMLElement;

      if (targetElement) {
        // Calculate position relative to the scrollable container
        const containerRect = scrollRef.current.getBoundingClientRect();
        const elementRect = targetElement.getBoundingClientRect();
        const relativeTop =
          elementRect.top - containerRect.top + scrollRef.current.scrollTop;

        // Scroll within the terminal container only
        scrollRef.current.scrollTo({
          top: relativeTop - containerRect.height + elementRect.height + 10,
          behavior: "smooth",
        });
      }
    }
  }, [activeIndex, sequenceHasStarted]);

  const content = (
    <div
      ref={containerRef}
      className={cn(
        "z-0 flex h-full max-h-[600px] w-full max-w-3xl flex-col rounded-xl border border-[var(--border-default)] bg-white/70 shadow-tile",
        className,
      )}
    >
      <div className="flex flex-row gap-x-2 border-b border-[var(--border-subtle)] p-4">
        <div className="h-3 w-3 rounded-full bg-red-500"></div>
        <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
        <div className="h-3 w-3 rounded-full bg-green-500"></div>
      </div>
      <pre
        ref={scrollRef}
        className="flex-1 p-6 font-mono"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "#cbd5e1 #f1f5f9",
          maxHeight: "calc(600px - 60px)",
          overflow: isAnimationComplete ? "auto" : "hidden",
          pointerEvents: isAnimationComplete ? "auto" : "none",
          fontFamily:
            'var(--font-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace',
        }}
      >
        <code className="block whitespace-pre text-[9px] leading-[1.3] text-[var(--text-primary)] overflow-x-hidden">
          {wrappedChildren}
        </code>
      </pre>
      <style jsx>{`
        pre::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        pre::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        pre::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        pre::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );

  if (!sequence) return content;

  return (
    <SequenceContext.Provider value={contextValue}>
      {content}
    </SequenceContext.Provider>
  );
};
