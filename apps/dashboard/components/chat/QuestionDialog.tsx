"use client";

import { useState } from "react";
import { X, Check, MessageCircleQuestion } from "lucide-react";
import type { PendingQuestion } from "@/hooks/useDashboard";

interface QuestionDialogProps {
  question: PendingQuestion;
  onAnswer: (answers: Record<string, string | string[]>) => void;
  onDismiss: () => void;
}

export function QuestionDialog({ question, onAnswer, onDismiss }: QuestionDialogProps) {
  // Track selected answers for each question
  const [selections, setSelections] = useState<Record<number, string | string[]>>({});
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<number, boolean>>({});

  const handleSelect = (questionIndex: number, optionLabel: string, isMultiSelect: boolean) => {
    setSelections((prev) => {
      if (isMultiSelect) {
        const current = (prev[questionIndex] as string[]) || [];
        if (current.includes(optionLabel)) {
          return { ...prev, [questionIndex]: current.filter((l) => l !== optionLabel) };
        }
        return { ...prev, [questionIndex]: [...current, optionLabel] };
      }
      return { ...prev, [questionIndex]: optionLabel };
    });
    // Hide custom input if selecting a predefined option
    if (optionLabel !== "Other") {
      setShowCustomInput((prev) => ({ ...prev, [questionIndex]: false }));
    }
  };

  const handleCustomSelect = (questionIndex: number) => {
    setShowCustomInput((prev) => ({ ...prev, [questionIndex]: true }));
    setSelections((prev) => ({ ...prev, [questionIndex]: "Other" }));
  };

  const handleSubmit = () => {
    const answers: Record<string, string | string[]> = {};

    question.questions.forEach((q, idx) => {
      const selection = selections[idx];
      if (selection === "Other" && customInputs[idx]) {
        answers[q.header || `q${idx}`] = customInputs[idx];
      } else if (selection) {
        answers[q.header || `q${idx}`] = selection;
      }
    });

    onAnswer(answers);
  };

  const isComplete = question.questions.every((q, idx) => {
    const selection = selections[idx];
    if (!selection) return false;
    if (selection === "Other" && !customInputs[idx]) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion className="h-5 w-5 text-primary" />
            <span className="font-medium">Claude needs your input</span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {question.questions.map((q, qIdx) => (
            <div key={qIdx} className="space-y-3">
              {/* Question header */}
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-primary font-medium">
                  {q.header}
                </span>
                <p className="text-sm">{q.question}</p>
              </div>

              {/* Options */}
              <div className="space-y-2">
                {q.options.map((opt, optIdx) => {
                  const isSelected = q.multiSelect
                    ? ((selections[qIdx] as string[]) || []).includes(opt.label)
                    : selections[qIdx] === opt.label;

                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleSelect(qIdx, opt.label, q.multiSelect)}
                      className={`w-full text-left p-3 border transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 h-4 w-4 border flex items-center justify-center flex-shrink-0 ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/50"
                          } ${q.multiSelect ? "" : "rounded-full"}`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{opt.label}</div>
                          {opt.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {opt.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Other option */}
                <button
                  onClick={() => handleCustomSelect(qIdx)}
                  className={`w-full text-left p-3 border transition-colors ${
                    showCustomInput[qIdx]
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 h-4 w-4 border flex items-center justify-center flex-shrink-0 ${
                        showCustomInput[qIdx]
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/50"
                      } ${q.multiSelect ? "" : "rounded-full"}`}
                    >
                      {showCustomInput[qIdx] && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">Other</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Provide a custom answer
                      </div>
                    </div>
                  </div>
                </button>

                {/* Custom input field */}
                {showCustomInput[qIdx] && (
                  <input
                    type="text"
                    value={customInputs[qIdx] || ""}
                    onChange={(e) =>
                      setCustomInputs((prev) => ({ ...prev, [qIdx]: e.target.value }))
                    }
                    placeholder="Type your answer..."
                    className="w-full bg-muted border-0 px-3 py-3 text-base focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/30">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isComplete}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
