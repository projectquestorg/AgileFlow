/**
 * model-profiles.js - Model resolution for audit subagents
 *
 * Resolves which model (haiku/sonnet/opus) to use for agent subagents.
 * Models are specified inline via command arguments (MODEL=opus).
 *
 * Resolution order:
 *   1. Explicit MODEL= argument (highest priority)
 *   2. Agent frontmatter model (from .md file)
 *   3. Fallback: 'haiku'
 *
 * Usage:
 *   const { resolveModel, estimateCost } = require('./model-profiles');
 *   const model = resolveModel('opus', 'haiku');  // returns 'opus'
 *   const model2 = resolveModel(null, 'sonnet');  // returns 'sonnet'
 *   const model3 = resolveModel(null, null);       // returns 'haiku'
 */

const VALID_MODELS = ['haiku', 'sonnet', 'opus'];

/**
 * Resolve which model to use for a given agent.
 *
 * Resolution order:
 *   1. Explicit model argument (MODEL= from command)
 *   2. Agent frontmatter model
 *   3. Fallback: 'haiku'
 *
 * @param {string} [explicitModel] - MODEL= argument value
 * @param {string} [frontmatterModel] - Model from agent .md frontmatter
 * @returns {string} Model name: 'haiku', 'sonnet', or 'opus'
 */
function resolveModel(explicitModel, frontmatterModel) {
  // 1. Explicit MODEL= argument
  if (explicitModel && VALID_MODELS.includes(explicitModel.toLowerCase())) {
    return explicitModel.toLowerCase();
  }

  // 2. Frontmatter model
  if (frontmatterModel && VALID_MODELS.includes(frontmatterModel.toLowerCase())) {
    return frontmatterModel.toLowerCase();
  }

  // 3. Fallback
  return 'haiku';
}

/**
 * Validate a model name.
 *
 * @param {string} model - Model name to validate
 * @returns {boolean} True if valid
 */
function isValidModel(model) {
  return !!model && VALID_MODELS.includes(model.toLowerCase());
}

/**
 * Estimate cost multiplier for a model relative to haiku baseline.
 *
 * @param {string} model - Model name
 * @param {number} [analyzerCount=5] - Number of analyzers
 * @param {number} [partitions=1] - Number of partitions (extreme mode)
 * @returns {{ multiplier: number, model: string, perAnalyzerCost: string, totalEstimate: string, partitions?: number, totalSessions?: number }}
 */
function estimateCost(model, analyzerCount, partitions) {
  let MODEL_PRICING;
  try {
    MODEL_PRICING = require('./team-events').MODEL_PRICING;
  } catch (_) {
    MODEL_PRICING = {
      haiku: { input: 0.8, output: 4.0 },
      sonnet: { input: 3.0, output: 15.0 },
      opus: { input: 15.0, output: 75.0 },
    };
  }

  const count = analyzerCount || 5;
  const partCount = typeof partitions === 'number' && partitions > 1 ? partitions : 1;
  const resolved = resolveModel(model);
  const pricing = MODEL_PRICING[resolved] || MODEL_PRICING.haiku;
  const haikuPricing = MODEL_PRICING.haiku;

  const multiplier = pricing.output / haikuPricing.output;
  const perAnalyzerCostNum =
    (pricing.input * 50000) / 1_000_000 + (pricing.output * 10000) / 1_000_000;
  const perAnalyzer = `$${perAnalyzerCostNum.toFixed(3)}`;

  // For extreme mode: each partition has a coordinator + all analyzers as sub-agents
  // Estimated cost per partition coordinator session in USD (~10k input + 2k output at haiku rates)
  const coordinatorCostUSD = 0.05;
  const totalSessions = partCount * count;
  const totalCost =
    partCount > 1
      ? partCount * coordinatorCostUSD + totalSessions * perAnalyzerCostNum
      : count * perAnalyzerCostNum;

  const result = {
    multiplier: Math.round(multiplier * 100) / 100,
    model: resolved,
    perAnalyzerCost: perAnalyzer,
    totalEstimate: `~$${totalCost.toFixed(2)}`,
  };

  if (partCount > 1) {
    result.partitions = partCount;
    result.totalSessions = totalSessions;
  }

  return result;
}

module.exports = {
  VALID_MODELS,
  resolveModel,
  isValidModel,
  estimateCost,
};
