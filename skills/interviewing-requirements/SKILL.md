---
name: interviewing-requirements
description: Interview the user in small rounds of high-value questions to pin down requirements and stress-test a plan before implementation, after first checking the repository for facts it can answer. Use only when the user explicitly asks to be interviewed, questioned, or grilled about a plan, or says things like "ask me questions", "stress-test this plan", "help me decide", or "question me about this". Do not activate for ordinary implementation requests.
---

# Interviewing requirements

Reach a shared, actionable understanding with as few questions as possible. The user asked to be questioned; make each question count.

## Workflow

1. **Inspect repository facts yourself first.** Read the relevant code, config, docs, and existing patterns so you understand what already exists and what constraints apply.
2. **Do not ask what files or tools can answer.** Framework, existing conventions, current behavior, where something lives: look these up. Mention what you found so the user can correct it.
3. **Identify decisions that materially change the design:** scope boundaries, behavior in edge cases, data shape and ownership, compatibility with existing users, performance or security constraints, what "done" looks like. Ignore questions whose answer would not change what you build.
4. **Ask a small group of high-value questions,** usually two to four per round. For each, offer concrete options with a short note on the consequence of each, and mark the one you recommend and why.
5. **Choose the question format:** when structured user-question tooling is available, prefer it for meaningful multi-option decisions. Otherwise ask concisely in normal text, for example as a numbered list with lettered options. Never stop or fail because structured question UI is unavailable.
6. **Incorporate the responses.** Restate what was decided in one or two lines and update your understanding of the plan. Point out any answer that conflicts with repository facts or an earlier answer.
7. **Continue another round only if material uncertainty remains.** Each round should be smaller than the last. If the user says "you decide" or defers, take your recommended option and move on.
8. **Stop once there is a shared actionable understanding.**

If the project's `agileflow.yaml` has `interaction.questionPreference: minimize`, keep rounds especially small and prefer stating assumptions over asking.

## Constraints

- Do not start implementing during the interview unless the user asks to.
- Do not ask open-ended "anything else?" questions as a substitute for identifying real decisions.
- Do not re-ask questions that were already answered, including in earlier conversation.
- When challenging a plan, name the specific risk and the evidence for it, not generic caution.

## Wrap-up

End with a short summary the user can confirm or correct:

- **Goal:** one or two sentences.
- **Decisions:** each decision and the chosen option.
- **Assumptions:** what you are assuming without asking.
- **Open items:** anything deliberately deferred.

## Done when

The material design decisions are answered or explicitly deferred, the user has seen the summary of goal, decisions, and assumptions, and the next step (usually implementation) is clear.
