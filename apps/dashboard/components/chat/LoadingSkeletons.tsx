"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function MessageSkeleton() {
  return (
    <div className="flex gap-3">
      <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-20 mt-2" />
      </div>
    </div>
  );
}

export function MessageListSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* User message */}
      <div className="flex gap-3 justify-end">
        <div className="space-y-2 max-w-[80%]">
          <Skeleton className="h-12 w-64 rounded-2xl rounded-br-md" />
          <Skeleton className="h-3 w-12 ml-auto" />
        </div>
        <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
      </div>

      {/* Assistant message with tool call */}
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
        <div className="space-y-3 flex-1 max-w-[80%]">
          <Skeleton className="h-16 w-full rounded-2xl rounded-bl-md" />
          {/* Tool call skeleton */}
          <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      </div>

      {/* Another user message */}
      <div className="flex gap-3 justify-end">
        <div className="space-y-2 max-w-[80%]">
          <Skeleton className="h-10 w-48 rounded-2xl rounded-br-md" />
          <Skeleton className="h-3 w-12 ml-auto" />
        </div>
        <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
      </div>
    </div>
  );
}

export function TaskPanelSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
          <Skeleton className="h-5 w-5 rounded-md" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

export function GitStatusSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2 p-2 rounded-lg">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="p-4 space-y-6">
      {/* Sessions section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-6 rounded-lg" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>

      {/* Automations section */}
      <div>
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>

      {/* Inbox section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-5 w-6 rounded-full" />
        </div>
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}
