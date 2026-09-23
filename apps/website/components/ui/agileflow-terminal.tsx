'use client';

import Image from 'next/image';
import { Terminal, TypingAnimation, AnimatedSpan } from './terminal';

const PROMPT = <span className="text-[#4ec9b0]">user@DevMachine</span>;

export function AgileFlowTerminal() {
  return (
    <Terminal className="font-mono" sequence={true} startOnView={false}>
      <AnimatedSpan>
        {PROMPT} ~ % npm install -g agileflow
      </AnimatedSpan>
      <AnimatedSpan>
        <Image
          src="/banner.png"
          alt="AgileFlow"
          width={400}
          height={60}
          className="my-1"
          style={{ imageRendering: 'crisp-edges' }}
        />
      </AnimatedSpan>
      <AnimatedSpan className="text-gray-500">  Portable workflows for coding agents</AnimatedSpan>
      <AnimatedSpan> </AnimatedSpan>
      <AnimatedSpan>
        {PROMPT} my-project % <TypingAnimation duration={60}>agileflow init</TypingAnimation>
      </AnimatedSpan>
      <AnimatedSpan className="text-[#6a9955]">  created agileflow.yaml</AnimatedSpan>
      <AnimatedSpan className="text-[#6a9955]">  created agileflow.lock</AnimatedSpan>
      <AnimatedSpan> </AnimatedSpan>
      <AnimatedSpan>
        {PROMPT} my-project % <TypingAnimation duration={60}>agileflow add diagnosing-bugs</TypingAnimation>
      </AnimatedSpan>
      <AnimatedSpan className="text-gray-400">  Skill:    diagnosing-bugs</AnimatedSpan>
      <AnimatedSpan className="text-gray-400">  Source:   @agileflow/diagnosing-bugs</AnimatedSpan>
      <AnimatedSpan className="text-gray-400">  Contains: SKILL.md, 1 reference file, 0 executable scripts</AnimatedSpan>
      <AnimatedSpan className="text-[#6a9955]">  installed .agents/skills/diagnosing-bugs</AnimatedSpan>
      <AnimatedSpan className="text-[#6a9955]">  linked    .claude/skills/diagnosing-bugs</AnimatedSpan>
      <AnimatedSpan> </AnimatedSpan>
      <AnimatedSpan>
        {PROMPT} my-project % <TypingAnimation duration={60}>agileflow list</TypingAnimation>
      </AnimatedSpan>
      <AnimatedSpan className="text-[#e8683a] font-bold">Providers</AnimatedSpan>
      <AnimatedSpan className="text-gray-400">  Codex       native .agents/skills</AnimatedSpan>
      <AnimatedSpan className="text-gray-400">  Cursor      native .agents/skills</AnimatedSpan>
      <AnimatedSpan className="text-gray-400">  OpenCode    native .agents/skills</AnimatedSpan>
      <AnimatedSpan className="text-gray-400">  Gemini      native .agents/skills</AnimatedSpan>
      <AnimatedSpan className="text-gray-400">  Claude      linked</AnimatedSpan>
      <AnimatedSpan> </AnimatedSpan>
      <AnimatedSpan className="font-bold">Next:</AnimatedSpan>
      <AnimatedSpan className="text-gray-400">  Open Codex / Claude / Cursor as usual.</AnimatedSpan>
    </Terminal>
  );
}
