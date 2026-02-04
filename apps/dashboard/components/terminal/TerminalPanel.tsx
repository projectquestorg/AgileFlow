"use client";

import { useState, useCallback } from "react";
import {
  Terminal,
  X,
  Plus,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { IntegratedTerminal } from "./IntegratedTerminal";

interface TerminalTab {
  id: string;
  name: string;
  terminalId: string | null;
}

interface TerminalPanelProps {
  isConnected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSpawn: () => Promise<string | null>;
  onInput: (terminalId: string, data: string) => void;
  onResize: (terminalId: string, cols: number, rows: number) => void;
  onClose: (terminalId: string) => void;
  // Incoming output keyed by terminalId
  terminalOutputs: Record<string, string>;
  onOutputProcessed: (terminalId: string) => void;
}

export function TerminalPanel({
  isConnected,
  isExpanded,
  onToggle,
  onSpawn,
  onInput,
  onResize,
  onClose,
  terminalOutputs,
  onOutputProcessed,
}: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: "1", name: "Terminal 1", terminalId: null },
  ]);
  const [activeTabId, setActiveTabId] = useState("1");
  const [isMaximized, setIsMaximized] = useState(false);
  const [tabCounter, setTabCounter] = useState(1);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Handle spawning terminal for active tab
  const handleSpawn = useCallback(async () => {
    const terminalId = await onSpawn();
    if (terminalId) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId ? { ...tab, terminalId } : tab
        )
      );
    }
    return terminalId;
  }, [activeTabId, onSpawn]);

  // Handle input for active tab
  const handleInput = useCallback(
    (data: string) => {
      if (activeTab?.terminalId) {
        onInput(activeTab.terminalId, data);
      }
    },
    [activeTab, onInput]
  );

  // Handle resize for active tab
  const handleResize = useCallback(
    (cols: number, rows: number) => {
      if (activeTab?.terminalId) {
        onResize(activeTab.terminalId, cols, rows);
      }
    },
    [activeTab, onResize]
  );

  // Add new tab
  const handleAddTab = useCallback(() => {
    const newTabNum = tabCounter + 1;
    setTabCounter(newTabNum);
    const newTab: TerminalTab = {
      id: `${newTabNum}`,
      name: `Terminal ${newTabNum}`,
      terminalId: null,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabCounter]);

  // Close tab
  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();

      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.terminalId) {
        onClose(tab.terminalId);
      }

      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== tabId);
        // If closing active tab, switch to another
        if (tabId === activeTabId && newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        }
        // If no tabs left, create a new one
        if (newTabs.length === 0) {
          const newTabNum = tabCounter + 1;
          setTabCounter(newTabNum);
          const newTab: TerminalTab = {
            id: `${newTabNum}`,
            name: `Terminal ${newTabNum}`,
            terminalId: null,
          };
          setActiveTabId(newTab.id);
          return [newTab];
        }
        return newTabs;
      });
    },
    [tabs, activeTabId, tabCounter, onClose]
  );

  // Get output for active tab
  const activeOutput = activeTab?.terminalId
    ? terminalOutputs[activeTab.terminalId]
    : undefined;

  // Handle output processed
  const handleOutputProcessed = useCallback(() => {
    if (activeTab?.terminalId) {
      onOutputProcessed(activeTab.terminalId);
    }
  }, [activeTab, onOutputProcessed]);

  if (!isExpanded) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 p-3 bg-card border border-border rounded-lg shadow-lg hover:bg-muted transition-colors z-50 flex items-center gap-2"
      >
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Terminal</span>
        <ChevronUp className="h-3 w-3 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div
      className={`bg-card border-t border-border flex flex-col ${
        isMaximized ? "fixed inset-0 z-50" : "h-64"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted/30">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-t transition-colors group ${
                tab.id === activeTabId
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              }`}
            >
              <Terminal className="h-3 w-3" />
              <span>{tab.name}</span>
              {tab.terminalId && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="ml-1 p-0.5 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </button>
          ))}
          <button
            onClick={handleAddTab}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title="New terminal"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onToggle}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title="Hide terminal"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 min-h-0">
        {activeTab && (
          <IntegratedTerminal
            key={activeTab.id}
            terminalId={activeTab.terminalId}
            isConnected={isConnected}
            onSpawn={handleSpawn}
            onInput={handleInput}
            onResize={handleResize}
            output={activeOutput}
            onOutputProcessed={handleOutputProcessed}
          />
        )}
      </div>
    </div>
  );
}
