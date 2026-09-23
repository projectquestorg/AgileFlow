---
name: simplifying-explanations
description: Re-explain code, a concept, an error, or a previous answer at a simpler level for someone less familiar with it, using plain language, one core idea at a time, and concrete examples from the user's own context. Use only when the user explicitly asks for a simpler explanation, such as "explain it simply", "ELI5", "explain like I'm new to this", "dumb it down", or "I don't follow, simplify". Do not activate for ordinary explanation requests.
---

# Simplifying explanations

Make the idea understandable to someone without the background, without making it wrong.

## Workflow

1. **Find the target.** Identify exactly what needs simplifying: a piece of code, an error message, a concept, or your own previous answer. If it is code or an error in this repository, read it first so the explanation matches reality.
2. **Pick the level.** Use the user's cues ("I'm not a developer", "I know Python but not Rust"). If there are no cues, assume a smart reader new to this specific topic. Ask about level only if a wrong guess would make the answer useless; when structured user-question tooling is available, prefer it for that choice, otherwise ask in one short sentence.
3. **Lead with the one-sentence version:** what it is or does, and why it matters to the user.
4. **Then build up in small steps,** one idea per step, each depending only on what came before.
5. **Use concrete anchors:** a small example with real names from their code or situation, or one analogy that genuinely fits. Say where the analogy breaks if that could mislead.
6. **Check for leftover jargon.** Replace or define every term the reader may not know, the first time it appears.

## Constraints

- Simpler is not less accurate. Omit detail, but do not state things that are false. If a simplification hides an important exception, add one line noting it.
- Keep it short. A simpler explanation that is three times longer usually is not simpler.
- Do not change code, run fixes, or continue the prior task while explaining unless asked.
- Do not be condescending; no "simply", "just", or "obviously".
- Offer, in one line at the end, to go one level deeper or simpler.

## Done when

The user has a plain-language explanation of the specific thing they asked about, pitched at their level, with jargon defined and at least one concrete example, and nothing in it is factually wrong.
