/**
 * skill-eval-criteria.js - Binary Eval Criteria for Skills
 *
 * Implements Karpathy's Auto Research key insight: binary yes/no eval questions
 * instead of subjective 1-10 scales. Each criterion is a simple yes/no question
 * that can be answered deterministically.
 *
 * Default criteria cover universal quality signals. Per-skill custom criteria
 * can be stored in metadata.json and override/extend defaults.
 *
 * NO EXTERNAL DEPENDENCIES - only Node.js built-ins
 */

'use strict';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default binary eval criteria applied to all skills.
 * Each question should be answerable with a clear yes/no.
 */
const DEFAULT_CRITERIA = [
  {
    id: 'addresses-task',
    question: 'Does the output directly address the task?',
    weight: 2,
    category: 'relevance',
  },
  {
    id: 'no-hallucinated-paths',
    question: 'Is the output free of hallucinated file paths or references?',
    weight: 2,
    category: 'correctness',
  },
  {
    id: 'accept-without-rework',
    question: 'Would a developer accept this output without significant rework?',
    weight: 3,
    category: 'quality',
  },
  {
    id: 'follows-conventions',
    question: 'Does the output follow the project conventions and patterns?',
    weight: 1,
    category: 'consistency',
  },
  {
    id: 'complete-response',
    question: 'Does the output cover all aspects of the task without missing parts?',
    weight: 2,
    category: 'completeness',
  },
  {
    id: 'no-unnecessary-changes',
    question: 'Is the output free of unnecessary changes or scope creep?',
    weight: 1,
    category: 'focus',
  },
  {
    id: 'correct-syntax',
    question: 'Is the output syntactically correct (no broken code, valid JSON, etc.)?',
    weight: 2,
    category: 'correctness',
  },
  {
    id: 'actionable',
    question: 'Is the output immediately actionable (not vague or hand-wavy)?',
    weight: 1,
    category: 'quality',
  },
];

// Valid categories for custom criteria
const VALID_CATEGORIES = [
  'relevance',
  'correctness',
  'quality',
  'completeness',
  'consistency',
  'focus',
  'custom',
];

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the effective eval criteria for a skill.
 * Merges default criteria with any per-skill custom criteria.
 *
 * @param {Object} [options] - Options
 * @param {Object[]} [options.customCriteria] - Per-skill custom criteria to merge
 * @param {boolean} [options.includeDefaults=true] - Whether to include default criteria
 * @returns {Object[]} Merged criteria list
 */
function getCriteria(options = {}) {
  const { customCriteria = [], includeDefaults = true } = options;

  if (!includeDefaults) {
    return validateCriteria(customCriteria);
  }

  // Start with defaults, then overlay custom
  const criteriaMap = new Map();
  for (const c of DEFAULT_CRITERIA) {
    criteriaMap.set(c.id, { ...c });
  }
  for (const c of validateCriteria(customCriteria)) {
    criteriaMap.set(c.id, { ...c });
  }

  return Array.from(criteriaMap.values());
}

/**
 * Validate and normalize criteria entries.
 *
 * @param {Object[]} criteria - Raw criteria to validate
 * @returns {Object[]} Validated criteria
 */
function validateCriteria(criteria) {
  if (!Array.isArray(criteria)) return [];

  return criteria
    .filter(c => c && typeof c === 'object' && c.id && c.question)
    .map(c => ({
      id: String(c.id)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-'),
      question: String(c.question),
      weight: Math.max(1, Math.min(5, Number(c.weight) || 1)),
      category: VALID_CATEGORIES.includes(c.category) ? c.category : 'custom',
    }));
}

/**
 * Score an output against binary eval criteria.
 *
 * @param {Object[]} answers - Array of { id, answer } where answer is boolean
 * @param {Object[]} criteria - Criteria used for evaluation
 * @returns {{ score: number, answers: Object[], total_weight: number, earned_weight: number }}
 */
function scoreOutput(answers, criteria) {
  if (!Array.isArray(answers) || !Array.isArray(criteria) || criteria.length === 0) {
    return { score: 0, answers: [], total_weight: 0, earned_weight: 0 };
  }

  const answerMap = new Map();
  for (const a of answers) {
    if (a && a.id != null) {
      answerMap.set(String(a.id), Boolean(a.answer));
    }
  }

  let totalWeight = 0;
  let earnedWeight = 0;
  const scoredAnswers = [];

  for (const criterion of criteria) {
    const answer = answerMap.get(criterion.id);
    const answered = answer !== undefined;

    totalWeight += criterion.weight;
    if (answered && answer) {
      earnedWeight += criterion.weight;
    }

    scoredAnswers.push({
      id: criterion.id,
      question: criterion.question,
      answer: answered ? answer : null,
      weight: criterion.weight,
      category: criterion.category,
    });
  }

  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  return {
    score,
    answers: scoredAnswers,
    total_weight: totalWeight,
    earned_weight: earnedWeight,
  };
}

/**
 * Identify which criteria are most commonly failed.
 * Used to generate hypotheses for improvement.
 *
 * @param {Object[]} evalHistory - Array of scoreOutput results
 * @returns {Object[]} Criteria sorted by failure rate (highest first)
 */
function identifyWeaknesses(evalHistory) {
  if (!Array.isArray(evalHistory) || evalHistory.length === 0) {
    return [];
  }

  const failCounts = new Map();
  const totalCounts = new Map();

  for (const result of evalHistory) {
    if (!result || !Array.isArray(result.answers)) continue;

    for (const answer of result.answers) {
      if (answer.answer === null) continue;

      const prev = totalCounts.get(answer.id) || 0;
      totalCounts.set(answer.id, prev + 1);

      if (!answer.answer) {
        const fails = failCounts.get(answer.id) || 0;
        failCounts.set(answer.id, fails + 1);
      }
    }
  }

  const weaknesses = [];
  for (const [id, total] of totalCounts) {
    const fails = failCounts.get(id) || 0;
    const failRate = total > 0 ? fails / total : 0;

    weaknesses.push({
      id,
      fail_rate: Math.round(failRate * 100) / 100,
      fail_count: fails,
      total_count: total,
    });
  }

  return weaknesses.sort((a, b) => b.fail_rate - a.fail_rate);
}

/**
 * Generate a grading prompt for an LLM to evaluate output against criteria.
 * Returns a structured prompt that asks for binary yes/no answers.
 *
 * @param {string} taskPrompt - The original task prompt
 * @param {string} output - The output to evaluate
 * @param {Object[]} criteria - Criteria to evaluate against
 * @returns {string} Evaluation prompt
 */
function generateEvalPrompt(taskPrompt, output, criteria) {
  const questions = criteria.map((c, i) => `${i + 1}. [${c.id}] ${c.question}`).join('\n');

  return `You are evaluating an AI output against binary quality criteria.

## Original Task
${taskPrompt}

## Output to Evaluate
${output}

## Criteria
Answer each question with ONLY "yes" or "no":

${questions}

## Response Format
Respond as JSON array:
[{"id": "criterion-id", "answer": true/false}]

Only output the JSON array, no other text.`;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  DEFAULT_CRITERIA,
  VALID_CATEGORIES,

  // Core functions
  getCriteria,
  validateCriteria,
  scoreOutput,
  identifyWeaknesses,
  generateEvalPrompt,
};
