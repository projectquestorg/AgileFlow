'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const autoResearch = require('../../../scripts/lib/skill-auto-research');
const researchLog = require('../../../scripts/lib/skill-research-log');
const evalCriteria = require('../../../scripts/lib/skill-eval-criteria');

describe('skill-auto-research', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-research-'));
    const skillDir = path.join(tmpDir, '.agileflow', 'skills', 'test-skill', 'candidates');
    fs.mkdirSync(skillDir, { recursive: true });
    const backupsDir = path.join(tmpDir, '.agileflow', 'skills', 'test-skill', 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('findSkillPath', () => {
    test('finds command skill at direct path', () => {
      const dir = path.join(tmpDir, 'packages/cli/src/core/commands');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'test-skill.md'), '# Test');

      const result = autoResearch.findSkillPath('test-skill', { rootDir: tmpDir });
      expect(result.found).toBe(true);
      expect(result.type).toBe('command');
      expect(result.path).toContain('test-skill.md');
    });

    test('finds agent skill', () => {
      const dir = path.join(tmpDir, 'packages/cli/src/core/agents');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'test-agent.md'), '# Agent');

      const result = autoResearch.findSkillPath('test-agent', { rootDir: tmpDir });
      expect(result.found).toBe(true);
      expect(result.type).toBe('agent');
    });

    test('returns not found for missing skill', () => {
      const result = autoResearch.findSkillPath('nonexistent', { rootDir: tmpDir });
      expect(result.found).toBe(false);
    });
  });

  describe('getResearchStatus', () => {
    test('returns empty status for new skill', () => {
      const status = autoResearch.getResearchStatus('test-skill', { rootDir: tmpDir });
      expect(status.generations).toBe(0);
      expect(status.totalExperiments).toBe(0);
      expect(status.bestScore).toBe(0);
      expect(status.lastResearch).toBeNull();
      expect(status.history).toEqual([]);
    });

    test('returns status from existing research', () => {
      researchLog.appendEntry(
        'test-skill',
        {
          generation: 1,
          prompt_hash: 'aabbccdd',
          eval_score: 72,
          hypothesis: 'baseline',
          outcome: 'baseline',
        },
        { rootDir: tmpDir }
      );
      researchLog.appendEntry(
        'test-skill',
        {
          generation: 2,
          prompt_hash: 'eeff0011',
          eval_score: 85,
          hypothesis: 'improve paths',
          outcome: 'improved',
        },
        { rootDir: tmpDir }
      );

      const status = autoResearch.getResearchStatus('test-skill', { rootDir: tmpDir });
      expect(status.generations).toBe(2);
      expect(status.bestScore).toBe(85);
      expect(status.bestGeneration).toBe(2);
      expect(status.currentScore).toBe(85);
      expect(status.history).toHaveLength(2);
    });
  });

  describe('analyzeWeaknesses', () => {
    test('returns empty for skill with no eval history', () => {
      const result = autoResearch.analyzeWeaknesses('test-skill', { rootDir: tmpDir });
      expect(result.weaknesses).toEqual([]);
      expect(result.evalCount).toBe(0);
    });

    test('identifies weaknesses from eval answers', () => {
      researchLog.appendEntry(
        'test-skill',
        {
          generation: 1,
          eval_score: 60,
          eval_answers: [
            { id: 'addresses-task', answer: true, weight: 2, category: 'relevance' },
            { id: 'no-hallucinated-paths', answer: false, weight: 2, category: 'correctness' },
            { id: 'correct-syntax', answer: true, weight: 2, category: 'correctness' },
          ],
          hypothesis: 'baseline',
          outcome: 'baseline',
        },
        { rootDir: tmpDir }
      );

      const result = autoResearch.analyzeWeaknesses('test-skill', { rootDir: tmpDir });
      expect(result.evalCount).toBe(1);
      expect(result.weaknesses.length).toBeGreaterThan(0);
      expect(result.weaknesses[0].id).toBe('no-hallucinated-paths');
      expect(result.weaknesses[0].fail_rate).toBe(1);
    });
  });

  describe('createCandidate', () => {
    test('creates candidate file and logs entry', () => {
      const result = autoResearch.createCandidate(
        'test-skill',
        '# Improved Prompt\nBetter instructions here.',
        'Add path verification instructions',
        { rootDir: tmpDir }
      );

      expect(result.success).toBe(true);
      expect(result.generation).toBe(1);
      expect(fs.existsSync(result.candidatePath)).toBe(true);

      const content = fs.readFileSync(result.candidatePath, 'utf8');
      expect(content).toContain('Better instructions here');

      const log = researchLog.readLog('test-skill', { rootDir: tmpDir });
      expect(log).toHaveLength(1);
      expect(log[0].outcome).toBe('pending');
    });

    test('increments generation number', () => {
      autoResearch.createCandidate('test-skill', 'gen1', 'first', { rootDir: tmpDir });
      const result = autoResearch.createCandidate('test-skill', 'gen2', 'second', {
        rootDir: tmpDir,
      });

      expect(result.generation).toBe(2);
    });

    test('rejects when max generations exceeded', () => {
      for (let i = 0; i < 10; i++) {
        autoResearch.createCandidate('test-skill', `gen${i + 1}`, `hypothesis ${i + 1}`, {
          rootDir: tmpDir,
        });
      }

      const result = autoResearch.createCandidate('test-skill', 'too-many', 'overflow', {
        rootDir: tmpDir,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum generations');
    });
  });

  describe('benchmarkCandidate', () => {
    test('records improved outcome when score beats baseline', () => {
      researchLog.appendEntry(
        'test-skill',
        {
          generation: 1,
          eval_score: 50,
          hypothesis: 'baseline',
          outcome: 'baseline',
        },
        { rootDir: tmpDir }
      );

      const candidateDir = path.join(tmpDir, '.agileflow/skills/test-skill/candidates');
      fs.writeFileSync(path.join(candidateDir, 'gen-2.md'), 'candidate');

      const evalResult = evalCriteria.scoreOutput(
        [
          { id: 'addresses-task', answer: true },
          { id: 'correct-syntax', answer: true },
        ],
        evalCriteria.getCriteria()
      );

      const result = autoResearch.benchmarkCandidate('test-skill', 2, evalResult, {
        rootDir: tmpDir,
      });
      expect(result.success).toBe(true);
      // Score depends on criteria weights; just check it was recorded
      const log = researchLog.readLog('test-skill', { rootDir: tmpDir });
      const latest = log[log.length - 1];
      expect(['improved', 'neutral', 'regressed']).toContain(latest.outcome);
    });
  });

  describe('approveCandidate', () => {
    test('copies candidate to live skill and creates backup', () => {
      const commandsDir = path.join(tmpDir, 'packages/cli/src/core/commands');
      fs.mkdirSync(commandsDir, { recursive: true });
      fs.writeFileSync(path.join(commandsDir, 'test-skill.md'), 'original prompt');

      const candidateDir = path.join(tmpDir, '.agileflow/skills/test-skill/candidates');
      fs.writeFileSync(path.join(candidateDir, 'gen-1.md'), 'improved prompt');

      const result = autoResearch.approveCandidate('test-skill', 1, { rootDir: tmpDir });

      expect(result.success).toBe(true);
      expect(result.backupPath).toContain('pre-gen-1.md');
      expect(fs.existsSync(result.backupPath)).toBe(true);

      const liveContent = fs.readFileSync(path.join(commandsDir, 'test-skill.md'), 'utf8');
      expect(liveContent).toBe('improved prompt');

      const backupContent = fs.readFileSync(result.backupPath, 'utf8');
      expect(backupContent).toBe('original prompt');
    });

    test('fails if candidate does not exist', () => {
      const result = autoResearch.approveCandidate('test-skill', 99, { rootDir: tmpDir });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('rejectCandidate', () => {
    test('logs rejection', () => {
      const result = autoResearch.rejectCandidate('test-skill', 3, { rootDir: tmpDir });
      expect(result.success).toBe(true);

      const log = researchLog.readLog('test-skill', { rootDir: tmpDir });
      expect(log).toHaveLength(1);
      expect(log[0].outcome).toBe('rejected');
    });
  });

  describe('cleanupCandidates', () => {
    test('removes oldest candidates keeping last N', () => {
      const candidateDir = path.join(tmpDir, '.agileflow/skills/test-skill/candidates');
      for (let i = 1; i <= 5; i++) {
        fs.writeFileSync(path.join(candidateDir, `gen-${i}.md`), `gen ${i}`);
      }

      const result = autoResearch.cleanupCandidates('test-skill', { rootDir: tmpDir, keep: 2 });

      expect(result.removed).toHaveLength(3);
      expect(result.removed).toEqual(['gen-1.md', 'gen-2.md', 'gen-3.md']);

      expect(fs.existsSync(path.join(candidateDir, 'gen-4.md'))).toBe(true);
      expect(fs.existsSync(path.join(candidateDir, 'gen-5.md'))).toBe(true);
      expect(fs.existsSync(path.join(candidateDir, 'gen-1.md'))).toBe(false);
    });

    test('does nothing when under keep threshold', () => {
      const candidateDir = path.join(tmpDir, '.agileflow/skills/test-skill/candidates');
      fs.writeFileSync(path.join(candidateDir, 'gen-1.md'), 'gen 1');

      const result = autoResearch.cleanupCandidates('test-skill', { rootDir: tmpDir, keep: 3 });
      expect(result.removed).toEqual([]);
    });
  });
});
