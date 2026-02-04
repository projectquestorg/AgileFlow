"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// Types for xterm (using any to avoid SSR issues with type imports)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XTermType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FitAddonType = any;

interface IntegratedTerminalProps {
  terminalId: string | null;
  isConnected: boolean;
  onSpawn: () => void;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  // Incoming data from server
  output?: string;
  // Clear output after processing
  onOutputProcessed?: () => void;
}

export function IntegratedTerminal({
  terminalId,
  isConnected,
  onSpawn,
  onInput,
  onResize,
  output,
  onOutputProcessed,
}: IntegratedTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTermType | null>(null);
  const fitAddonRef = useRef<FitAddonType | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize xterm (dynamically import to avoid SSR issues)
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Dynamic import of xterm modules
    const initTerminal = async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);

      if (!terminalRef.current || xtermRef.current) return;

        const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: "JetBrains Mono, Menlo, Monaco, Courier New, monospace",
        fontSize: 13,
        lineHeight: 1.2,
        theme: {
          background: "#0a0a0a",
          foreground: "#e5e5e5",
          cursor: "#e8683a",
          cursorAccent: "#0a0a0a",
          selectionBackground: "#e8683a40",
          black: "#0a0a0a",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#e5e5e5",
          brightBlack: "#525252",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#facc15",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#ffffff",
        },
        allowTransparency: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      terminal.open(terminalRef.current!);

      // Fit to container
      setTimeout(() => {
        try {
          fitAddon.fit();
        } catch {
          // Ignore fit errors on initial render
        }
      }, 100);

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;
      setIsInitialized(true);

      // Handle user input
      terminal.onData((data) => {
        if (terminalId) {
          onInput(data);
        }
      });

      // Handle resize
      terminal.onResize(({ cols, rows }) => {
        if (terminalId) {
          onResize(cols, rows);
        }
      });
    };

    initTerminal();

    // Cleanup
    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
        setIsInitialized(false);
      }
    };
  }, [terminalId, onInput, onResize]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // Ignore fit errors
        }
      }
    };

    window.addEventListener("resize", handleResize);

    // Also fit when terminal becomes visible
    const observer = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      observer.observe(terminalRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
    };
  }, [isInitialized]);

  // Write incoming output to terminal
  useEffect(() => {
    if (output && xtermRef.current) {
      xtermRef.current.write(output);
      onOutputProcessed?.();
    }
  }, [output, onOutputProcessed]);

  // Spawn terminal when connected but no terminal ID
  useEffect(() => {
    if (isConnected && !terminalId && isInitialized) {
      // Auto-spawn terminal
      onSpawn();
    }
  }, [isConnected, terminalId, isInitialized, onSpawn]);

  // Focus terminal on click
  const handleClick = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.focus();
    }
  }, []);

  return (
    <div
      className="h-full w-full bg-[#0a0a0a] overflow-hidden"
      onClick={handleClick}
    >
      {!isConnected && (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          <div className="text-center">
            <p>Not connected to server</p>
            <p className="text-xs mt-1 opacity-60">
              Terminal requires WebSocket connection
            </p>
          </div>
        </div>
      )}
      {isConnected && !terminalId && (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          <div className="text-center">
            <div className="animate-pulse">Starting terminal...</div>
          </div>
        </div>
      )}
      <div
        ref={terminalRef}
        className={`h-full w-full ${!terminalId ? "hidden" : ""}`}
        style={{ padding: "8px" }}
      />
    </div>
  );
}
