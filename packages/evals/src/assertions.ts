import { runProcess, type Transcript } from './providers';

export interface RubricItemResult {
  criterion: string;
  pass: boolean;
  reason: string;
}

export interface RubricResult {
  judge: string;
  items: RubricItemResult[];
  score: number;
}

/** Compact, judge-readable summary of what the agent did. */
export function summarizeTranscript(t: Transcript, limit = 12000): string {
  const calls = t.toolCalls.map((c, i) => `${i + 1}. ${c.name} ${c.input.slice(0, 300)}`).join('\n');
  const text = `Tool calls (in order):\n${calls || '(none)'}\n\nFinal response:\n${t.finalText || '(empty)'}`;
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;
}

export function buildJudgePrompt(prompt: string, rubric: string[], transcript: Transcript): string {
  return [
    'You are grading a coding agent transcript against a rubric. Judge only observable behavior in the transcript.',
    '',
    'User request given to the agent:',
    prompt.trim(),
    '',
    'Transcript summary:',
    summarizeTranscript(transcript),
    '',
    'Rubric (grade each criterion independently):',
    ...rubric.map((r, i) => `${i + 1}. ${r}`),
    '',
    'Respond with ONLY a JSON object, no prose, in this exact shape:',
    '{"items":[{"criterion":"<criterion text>","pass":true,"reason":"<one sentence>"}]}',
  ].join('\n');
}

/** Extract the first JSON object containing `items` from model output. */
export function parseJudgeOutput(text: string, rubric: string[]): RubricItemResult[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('judge returned no JSON');
  const parsed = JSON.parse(text.slice(start, end + 1)) as { items?: Array<Partial<RubricItemResult>> };
  if (!Array.isArray(parsed.items)) throw new Error('judge JSON has no items');
  return rubric.map((criterion, i) => {
    const item = parsed.items![i] ?? parsed.items!.find((x) => x.criterion === criterion);
    return { criterion, pass: item?.pass === true, reason: String(item?.reason ?? 'not graded') };
  });
}

export interface Judge {
  id: string;
  grade(prompt: string, rubric: string[], transcript: Transcript): Promise<RubricResult>;
}

/** Judge backed by the Claude CLI (`claude -p --output-format json`). */
export function claudeJudge(options: { cwd: string; env: Record<string, string | undefined>; model?: string; timeoutMs?: number }): Judge {
  return {
    id: 'claude',
    async grade(prompt, rubric, transcript) {
      const args = ['-p', buildJudgePrompt(prompt, rubric, transcript), '--output-format', 'json', '--max-turns', '1'];
      if (options.model) args.push('--model', options.model);
      const res = await runProcess('claude', args, {
        cwd: options.cwd,
        env: options.env,
        timeoutMs: options.timeoutMs ?? 180000,
      });
      let resultText = res.stdout;
      try {
        resultText = String((JSON.parse(res.stdout) as { result?: unknown }).result ?? res.stdout);
      } catch {
        // plain output
      }
      const items = parseJudgeOutput(resultText, rubric);
      return { judge: 'claude', items, score: items.filter((i) => i.pass).length / Math.max(items.length, 1) };
    },
  };
}
