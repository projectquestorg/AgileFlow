"use client"

import * as React from "react"
import { Check, Copy, ChevronRight, RotateCcw, Zap, Rocket, Crown } from "lucide-react"

import { cn } from "@/lib/utils"
import { trackEvent } from "@/lib/events"
import { Button } from "@/registry/new-york-v4/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/registry/new-york-v4/ui/card"
import { Badge } from "@/registry/new-york-v4/ui/badge"

const STORAGE_KEY = "agileflow-tutorial-progress"

interface TutorialStep {
  id: string
  title: string
  description: string
  command: string
  successHint: string
  verification?: string
}

interface TutorialPath {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  steps: TutorialStep[]
}

const TUTORIAL_PATHS: TutorialPath[] = [
  {
    id: "beginner",
    title: "Beginner",
    description: "New to AgileFlow? Start here.",
    icon: <Zap className="size-4" />,
    steps: [
      {
        id: "install",
        title: "Install AgileFlow",
        description: "Add AgileFlow to your project with a single command.",
        command: "npx agileflow@latest setup",
        successHint: "You should see 'AgileFlow installed successfully!' message.",
        verification: "Check if .agileflow directory exists in your project.",
      },
      {
        id: "verify",
        title: "Verify Installation",
        description: "Confirm everything is set up correctly.",
        command: "/agileflow:help",
        successHint: "You should see the AgileFlow help menu with all commands.",
      },
      {
        id: "first-epic",
        title: "Create Your First Epic",
        description: "An epic is a large feature broken into smaller stories.",
        command: '/agileflow:epic EPIC=EP-0001 TITLE="My First Feature" GOAL="Learn AgileFlow basics"',
        successHint: "Check docs/05-epics/ for your new epic file.",
      },
      {
        id: "first-story",
        title: "Create a Story",
        description: "Stories are individual tasks within an epic.",
        command: '/agileflow:story EPIC=EP-0001 STORY=US-0001 TITLE="Hello World" OWNER=AG-UI',
        successHint: "Check docs/06-stories/ for your new story file.",
      },
      {
        id: "view-board",
        title: "View Your Board",
        description: "See your project status at a glance.",
        command: "/agileflow:board",
        successHint: "You should see your story in the Backlog column.",
      },
    ],
  },
  {
    id: "intermediate",
    title: "Intermediate",
    description: "Ready for AI-assisted development.",
    icon: <Rocket className="size-4" />,
    steps: [
      {
        id: "start-story",
        title: "Start Working on a Story",
        description: "Update the story status to track progress.",
        command: "/agileflow:status STORY=US-0001 STATUS=in-progress",
        successHint: "The status.json file will be updated.",
      },
      {
        id: "babysit",
        title: "Use AI Guidance",
        description: "Get step-by-step implementation help from the mentor agent.",
        command: "/agileflow:babysit",
        successHint: "The mentor agent will guide you through implementation.",
      },
      {
        id: "verify-story",
        title: "Verify Your Work",
        description: "Check that all acceptance criteria are met.",
        command: "/agileflow:verify US-0001",
        successHint: "You'll see a checklist of acceptance criteria.",
      },
      {
        id: "complete-story",
        title: "Complete the Story",
        description: "Mark the story as done when finished.",
        command: "/agileflow:status STORY=US-0001 STATUS=done",
        successHint: "The story moves to the Completed column on the board.",
      },
      {
        id: "generate-pr",
        title: "Generate a PR",
        description: "Create a pull request with all your changes.",
        command: "/agileflow:pr STORY=US-0001",
        successHint: "A PR description is generated based on your story.",
      },
    ],
  },
  {
    id: "advanced",
    title: "Advanced",
    description: "Power user features and automation.",
    icon: <Crown className="size-4" />,
    steps: [
      {
        id: "configure",
        title: "Configure AgileFlow",
        description: "Customize hooks, status line, and behavior.",
        command: "/agileflow:configure",
        successHint: "Interactive configuration wizard starts.",
      },
      {
        id: "multi-expert",
        title: "Use Multi-Expert Mode",
        description: "Get opinions from multiple domain experts.",
        command: '/agileflow:multi-expert QUESTION="How should I structure my database schema?"',
        successHint: "Multiple agents analyze and provide recommendations.",
      },
      {
        id: "research",
        title: "Research Best Practices",
        description: "Ask the research agent for guidance.",
        command: '/agileflow:research:ask TOPIC="authentication patterns"',
        successHint: "Research notes saved to docs/10-research/.",
      },
      {
        id: "adr",
        title: "Document Decisions",
        description: "Create Architecture Decision Records.",
        command: '/agileflow:adr ADR=ADR-0001 TITLE="Database Choice" DECISION="Use PostgreSQL" RATIONALE="ACID compliance"',
        successHint: "ADR file created in docs/03-decisions/.",
      },
      {
        id: "metrics",
        title: "View Metrics",
        description: "See project velocity and completion stats.",
        command: "/agileflow:metrics",
        successHint: "Displays velocity, burn rate, and predictions.",
      },
    ],
  },
]

interface TutorialProgress {
  currentPath: string
  completedSteps: Record<string, string[]>
}

function loadProgress(): TutorialProgress {
  if (typeof window === "undefined") {
    return { currentPath: "beginner", completedSteps: {} }
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch {
    // Ignore errors
  }
  return { currentPath: "beginner", completedSteps: {} }
}

function saveProgress(progress: TutorialProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Ignore errors
  }
}

export function GettingStartedWizard() {
  const [progress, setProgress] = React.useState<TutorialProgress>(() => loadProgress())
  const [copiedCommand, setCopiedCommand] = React.useState<string | null>(null)

  const currentPath = TUTORIAL_PATHS.find((p) => p.id === progress.currentPath) || TUTORIAL_PATHS[0]
  const completedStepsForPath = progress.completedSteps[currentPath.id] || []

  const handleCopyCommand = async (command: string, stepId: string) => {
    try {
      await navigator.clipboard.writeText(command)
      setCopiedCommand(stepId)
      setTimeout(() => setCopiedCommand(null), 2000)
      trackEvent({ name: "copy_npm_command", properties: { command: command.substring(0, 50) } })
    } catch {
      // Ignore clipboard errors
    }
  }

  const handleMarkComplete = (stepId: string) => {
    const newCompleted = [...completedStepsForPath, stepId]
    const newProgress = {
      ...progress,
      completedSteps: {
        ...progress.completedSteps,
        [currentPath.id]: newCompleted,
      },
    }
    setProgress(newProgress)
    saveProgress(newProgress)

    // Track completion
    trackEvent({
      name: "create_app",
      properties: {
        path: currentPath.id,
        step: stepId,
        total_completed: newCompleted.length
      }
    })
  }

  const handleMarkIncomplete = (stepId: string) => {
    const newCompleted = completedStepsForPath.filter((s) => s !== stepId)
    const newProgress = {
      ...progress,
      completedSteps: {
        ...progress.completedSteps,
        [currentPath.id]: newCompleted,
      },
    }
    setProgress(newProgress)
    saveProgress(newProgress)
  }

  const handleChangePath = (pathId: string) => {
    const newProgress = { ...progress, currentPath: pathId }
    setProgress(newProgress)
    saveProgress(newProgress)
  }

  const handleReset = () => {
    const newProgress: TutorialProgress = { currentPath: "beginner", completedSteps: {} }
    setProgress(newProgress)
    saveProgress(newProgress)
  }

  const completionPercentage = Math.round(
    (completedStepsForPath.length / currentPath.steps.length) * 100
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Path Selector */}
      <div className="flex flex-wrap items-center gap-2">
        {TUTORIAL_PATHS.map((path) => {
          const pathCompleted = progress.completedSteps[path.id] || []
          const isComplete = pathCompleted.length === path.steps.length
          const isSelected = path.id === progress.currentPath

          return (
            <button
              key={path.id}
              onClick={() => handleChangePath(path.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50 hover:bg-muted"
              )}
            >
              {path.icon}
              <span>{path.title}</span>
              {isComplete && <Check className="size-3.5 text-green-500" />}
            </button>
          )
        })}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="mr-1 size-3.5" />
          Reset
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{currentPath.description}</span>
          <span className="font-medium">{completionPercentage}% complete</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {currentPath.steps.map((step, index) => {
          const isCompleted = completedStepsForPath.includes(step.id)
          const isPrevCompleted = index === 0 || completedStepsForPath.includes(currentPath.steps[index - 1].id)
          const isActive = !isCompleted && isPrevCompleted
          const isCopied = copiedCommand === step.id

          return (
            <Card
              key={step.id}
              className={cn(
                "transition-all duration-200",
                isCompleted && "border-green-500/50 bg-green-50/50 dark:bg-green-950/20",
                isActive && "ring-2 ring-primary ring-offset-2",
                !isActive && !isCompleted && "opacity-60"
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-medium",
                        isCompleted
                          ? "border-green-500 bg-green-500 text-white"
                          : isActive
                          ? "border-primary text-primary"
                          : "border-muted text-muted-foreground"
                      )}
                    >
                      {isCompleted ? <Check className="size-4" /> : index + 1}
                    </div>
                    <div>
                      <CardTitle className="text-base">{step.title}</CardTitle>
                      <CardDescription className="mt-1">{step.description}</CardDescription>
                    </div>
                  </div>
                  {isActive || isCompleted ? (
                    <Button
                      variant={isCompleted ? "outline" : "default"}
                      size="sm"
                      onClick={() =>
                        isCompleted
                          ? handleMarkIncomplete(step.id)
                          : handleMarkComplete(step.id)
                      }
                      className={cn(isCompleted && "text-green-600")}
                    >
                      {isCompleted ? "Undo" : "Mark Complete"}
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-12 text-sm">
                    <code>{step.command}</code>
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 size-7"
                    onClick={() => handleCopyCommand(step.command, step.id)}
                  >
                    {isCopied ? (
                      <Check className="size-3.5 text-green-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    <span className="sr-only">Copy command</span>
                  </Button>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ChevronRight className="mt-0.5 size-4 shrink-0" />
                  <span>{step.successHint}</span>
                </div>
                {step.verification && (
                  <Badge variant="outline" className="text-xs">
                    Verify: {step.verification}
                  </Badge>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Completion Message */}
      {completionPercentage === 100 && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/30">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-green-500 text-white">
              <Check className="size-6" />
            </div>
            <div>
              <h3 className="font-semibold text-green-700 dark:text-green-400">
                {currentPath.title} Tutorial Complete!
              </h3>
              <p className="text-sm text-green-600 dark:text-green-500">
                {currentPath.id === "advanced"
                  ? "You're now an AgileFlow power user. Happy shipping!"
                  : `Ready for more? Try the ${
                      currentPath.id === "beginner" ? "Intermediate" : "Advanced"
                    } tutorial.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
