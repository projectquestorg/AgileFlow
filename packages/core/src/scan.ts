import type { TreeFile } from './fs';
import { parseSidecar, parseSkillMarkdown, SIDECAR_FILE, SKILL_FILE } from './skill';
import { EVALS_DIR, MANAGED_NOTICE_PREFIX } from './render';

/**
 * Static review of a skill package before it reaches an agent.
 *
 * Skills are instructions for agents that can run shell commands, so the
 * interesting risks are what the text asks the agent to do, not only what
 * the scripts contain. The scanner is a reviewer's aid, not a verdict: it
 * reports patterns worth reading before trusting third-party content and
 * never blocks on its own.
 */
export type RiskSeverity = 'high' | 'medium' | 'low';

export interface RiskFinding {
  severity: RiskSeverity;
  rule: string;
  file: string;
  line?: number;
  message: string;
  excerpt?: string;
}

interface LineRule {
  rule: string;
  severity: RiskSeverity;
  pattern: RegExp;
  message: string;
  /** The pattern is itself a negation ("do not tell the user"): a prohibition line does not soften it. */
  negated?: boolean;
}

const LINE_RULES: LineRule[] = [
  {
    rule: 'pipe-to-shell',
    severity: 'high',
    pattern: /\b(?:curl|wget|fetch|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|fish|python3?|node|perl|ruby|pwsh|powershell|iex|Invoke-Expression)\b/i,
    message: 'downloads code and pipes it straight into an interpreter',
  },
  {
    rule: 'pipe-to-shell',
    severity: 'high',
    pattern: /\b(?:bash|sh|zsh)\s+<\(\s*(?:curl|wget)\b|\biex\s*\(\s*(?:irm|iwr|New-Object\s+Net\.WebClient)/i,
    message: 'executes code fetched from the network',
  },
  {
    rule: 'destructive-command',
    severity: 'high',
    pattern: /\brm\s+-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)[a-z]*\s+(?:--no-preserve-root\s+)?(?:\/(?:\s|$|\*)|~\/?(?:\s|$)|\$HOME\b|\/\*)/i,
    message: 'recursively deletes the root or home directory',
  },
  {
    rule: 'destructive-command',
    severity: 'medium',
    pattern: /\b(?:git\s+push\s+(?:[^\n]*\s)?(?:--force|-f)\b(?!-with-lease)|git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f[a-z]*d|mkfs(?:\.\w+)?\s|dd\s+if=|chmod\s+-R\s+0?777|format\s+[a-z]:)/i,
    message: 'runs a destructive or history-rewriting command',
  },
  {
    rule: 'privilege-escalation',
    severity: 'medium',
    pattern: /(?:^|[\s;&|`(])sudo\s+\S/,
    message: 'runs commands with sudo',
  },
  {
    rule: 'credential-access',
    severity: 'high',
    pattern: /(?:~|\$HOME|%USERPROFILE%)[\\/](?:\.ssh|\.aws|\.gnupg|\.config\/gh|\.docker\/config\.json|\.netrc|\.npmrc|\.pypirc|\.kube)\b|\bid_(?:rsa|ed25519|ecdsa)\b|\baws_secret_access_key\b|\bGITHUB_TOKEN\b|\bNPM_TOKEN\b|\bANTHROPIC_API_KEY\b|\bOPENAI_API_KEY\b/i,
    message: 'refers to credentials or secret files',
  },
  {
    rule: 'data-exfiltration',
    severity: 'high',
    pattern: /\b(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*(?:-d\s|--data|--upload-file|-T\s|-F\s|-Body\b)[^\n]*(?:\$\{?\w*(?:KEY|TOKEN|SECRET|PASSWORD)\w*|\benv\b|printenv|\.env\b|\.ssh)/i,
    message: 'sends secrets or environment data over the network',
  },
  {
    rule: 'prompt-injection',
    severity: 'high',
    pattern: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier|system|other)\s+(?:instructions|rules|prompts?|guidelines|directions)\b/i,
    message: 'tells the agent to ignore its other instructions',
  },
  {
    rule: 'prompt-injection',
    severity: 'high',
    pattern: /\b(?:do\s+not|don't|never)\s+(?:tell|inform|show|mention\s+(?:this\s+)?to|alert|notify)\s+(?:the\s+)?user\b|\bhide\s+(?:this|it)\s+from\s+the\s+user\b/i,
    message: 'asks the agent to act without the user knowing',
    negated: true,
  },
  {
    rule: 'prompt-injection',
    severity: 'high',
    pattern: /\bwithout\s+(?:telling|informing|asking|notifying)\s+the\s+user\b/i,
    message: 'asks the agent to act without the user knowing',
  },
  {
    rule: 'approval-bypass',
    severity: 'medium',
    pattern: /--dangerously-skip-permissions|--yolo\b|--dangerously-bypass-approvals-and-sandbox|approval_policy\s*=\s*["']never["']|sandbox_mode\s*=\s*["']danger-full-access["']|--no-verify\b/i,
    message: 'disables agent permission prompts, sandboxing, or safety checks',
  },
  {
    rule: 'network',
    severity: 'low',
    pattern: /\b(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod|nc|ncat|scp|rsync)\s+[^\n]*(?:https?:\/\/|\w+@[\w.-]+:)|\bhttps?:\/\/(?!(?:github\.com|docs\.|developer\.|www\.w3\.org|semver\.org|agentskills\.io|example\.(?:com|org)))[\w.-]+\.[a-z]{2,}\/[^\s)'"`]*\.(?:sh|ps1|py|js|exe|bin)\b/i,
    message: 'contacts the network or downloads a script',
  },
];

/** Bidirectional overrides and zero-width characters can hide text from a human reviewer. */
const HIDDEN_CHARS_RE = /[‪-‮⁦-⁩​-‍⁠­᠎]|(?!^)﻿/;
const LONG_BASE64_RE = /[A-Za-z0-9+/]{200,}={0,2}/;
const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;

/**
 * A line phrased as a prohibition ("Do not run `git reset --hard` without
 * permission"). Such lines usually make a skill safer, but negation is easy
 * to fake, so findings on them are downgraded to low rather than dropped.
 */
const PROHIBITION_RE =
  /^\s*(?:[-*]\s+|\d+\.\s+)?(?:\*\*)?(?:do not|don't|never|avoid|must not|should not|refuse to)\b|\bwithout (?:the user's |explicit |their )?(?:permission|approval|confirmation|consent)\b/i;

function isText(content: Buffer): boolean {
  return !content.includes(0);
}

function excerptOf(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

/** Scan the files an agent would read (evals are not installed and are skipped). */
export function scanSkill(files: TreeFile[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const seen = new Set<string>();
  const add = (f: RiskFinding) => {
    const key = `${f.rule}\0${f.file}\0${f.line ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };
  let declaredNetwork: 'none' | 'optional' | 'required' | null = null;
  const sidecar = files.find((f) => f.path === SIDECAR_FILE);
  if (sidecar) {
    try {
      declaredNetwork = parseSidecar(sidecar.content.toString('utf8')).requirements?.network ?? 'none';
    } catch {
      declaredNetwork = null;
    }
  }

  for (const file of files) {
    if (file.path.startsWith(`${EVALS_DIR}/`)) continue;
    if (file.executable || file.path.startsWith('scripts/')) {
      add({ severity: 'low', rule: 'script', file: file.path, message: 'executable script the agent may run' });
    }
    if (!isText(file.content)) {
      add({ severity: 'low', rule: 'binary', file: file.path, message: 'binary file (cannot be reviewed as text)' });
      continue;
    }
    const text = file.content.toString('utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const prohibitionLine = PROHIBITION_RE.test(line);
      for (const rule of LINE_RULES) {
        if (rule.pattern.test(line)) {
          const prohibition = prohibitionLine && !rule.negated;
          add({
            severity: prohibition && rule.rule !== 'network' ? 'low' : rule.severity,
            rule: rule.rule,
            file: file.path,
            line: i + 1,
            message: prohibition ? `${rule.message} (stated as a prohibition)` : rule.message,
            excerpt: excerptOf(line),
          });
        }
      }
      if (HIDDEN_CHARS_RE.test(line)) {
        add({
          severity: 'high',
          rule: 'hidden-text',
          file: file.path,
          line: i + 1,
          message: 'contains invisible or bidirectional-override characters that can hide instructions',
        });
      }
      if (LONG_BASE64_RE.test(line)) {
        add({ severity: 'medium', rule: 'encoded-payload', file: file.path, line: i + 1, message: 'contains a long encoded blob' });
      }
    });
    if (file.path === SKILL_FILE || file.path.endsWith('.md')) {
      for (const m of text.matchAll(HTML_COMMENT_RE)) {
        const body = m[1] ?? '';
        if (m[0].startsWith(MANAGED_NOTICE_PREFIX) || !/[a-z]{3,}\s+[a-z]{3,}/i.test(body)) continue;
        const line = text.slice(0, m.index).split(/\r?\n/).length;
        add({
          severity: 'medium',
          rule: 'hidden-text',
          file: file.path,
          line,
          message: 'HTML comment with text: invisible when rendered, but the agent reads it',
          excerpt: excerptOf(body),
        });
      }
    }
    if (file.path === SKILL_FILE) {
      try {
        const fm = parseSkillMarkdown(text).frontmatter;
        const tools = fm['allowed-tools'];
        const list = Array.isArray(tools) ? tools.map(String) : typeof tools === 'string' ? tools.split(/[\s,]+/) : [];
        const broad = list.filter((t) => /^(?:Bash|Shell|shell|bash)(?:\(\*\))?$/.test(t.trim()));
        if (broad.length) {
          add({
            severity: 'medium',
            rule: 'allowed-tools',
            file: file.path,
            message: `pre-approves unrestricted ${broad.join(', ')} for this skill (allowed-tools)`,
          });
        }
      } catch {
        // invalid frontmatter is reported by validation
      }
    }
  }

  if (declaredNetwork === 'none') {
    const uses = findings.filter((f) => f.rule === 'network' || f.rule === 'pipe-to-shell' || f.rule === 'data-exfiltration');
    if (uses.length) {
      add({
        severity: 'medium',
        rule: 'undeclared-network',
        file: SIDECAR_FILE,
        message: `declares requirements.network: none but uses the network (${uses.map((u) => `${u.file}:${u.line ?? ''}`).join(', ')})`,
      });
    }
  }
  const order: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
  return findings.sort(
    (a, b) => order[a.severity] - order[b.severity] || (a.file < b.file ? -1 : a.file > b.file ? 1 : (a.line ?? 0) - (b.line ?? 0)),
  );
}

export function riskCounts(findings: RiskFinding[]): Record<RiskSeverity, number> {
  return {
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };
}
