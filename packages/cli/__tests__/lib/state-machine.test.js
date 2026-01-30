/**
 * Tests for state-machine.js
 *
 * Tests the generic StateMachine class and pre-configured machines
 * for story status and session thread type transitions.
 */

const {
  StateMachine,
  storyStatusMachine,
  sessionThreadMachine,
} = require('../../lib/state-machine');

describe('StateMachine', () => {
  describe('constructor', () => {
    test('creates state machine with valid config', () => {
      const machine = new StateMachine({
        states: ['a', 'b', 'c'],
        transitions: {
          a: ['b'],
          b: ['c'],
          c: [],
        },
      });

      expect(machine.getStates()).toEqual(['a', 'b', 'c']);
      expect(machine.getInitialState()).toBe('a');
    });

    test('uses first state as initial if not specified', () => {
      const machine = new StateMachine({
        states: ['start', 'middle', 'end'],
        transitions: { start: ['middle'], middle: ['end'], end: [] },
      });

      expect(machine.getInitialState()).toBe('start');
    });

    test('uses specified initial state', () => {
      const machine = new StateMachine({
        states: ['a', 'b', 'c'],
        transitions: { a: ['b'], b: ['c'], c: [] },
        initial: 'b',
      });

      expect(machine.getInitialState()).toBe('b');
    });

    test('throws on empty states array', () => {
      expect(() => {
        new StateMachine({ states: [], transitions: {} });
      }).toThrow('non-empty states array');
    });

    test('throws on missing states', () => {
      expect(() => {
        new StateMachine({ transitions: {} });
      }).toThrow('non-empty states array');
    });

    test('throws on missing transitions', () => {
      expect(() => {
        new StateMachine({ states: ['a', 'b'] });
      }).toThrow('transitions object');
    });

    test('throws on invalid transition source state', () => {
      expect(() => {
        new StateMachine({
          states: ['a', 'b'],
          transitions: { a: ['b'], invalid: ['a'] },
        });
      }).toThrow('Invalid transition source state: invalid');
    });

    test('throws on invalid transition target state', () => {
      expect(() => {
        new StateMachine({
          states: ['a', 'b'],
          transitions: { a: ['b', 'invalid'], b: [] },
        });
      }).toThrow('Invalid transition target state: invalid');
    });
  });

  describe('isValidState', () => {
    const machine = new StateMachine({
      states: ['ready', 'done'],
      transitions: { ready: ['done'], done: [] },
    });

    test('returns true for valid state', () => {
      expect(machine.isValidState('ready')).toBe(true);
      expect(machine.isValidState('done')).toBe(true);
    });

    test('returns false for invalid state', () => {
      expect(machine.isValidState('invalid')).toBe(false);
      expect(machine.isValidState('')).toBe(false);
      expect(machine.isValidState(null)).toBe(false);
    });
  });

  describe('isValidTransition', () => {
    const machine = new StateMachine({
      states: ['a', 'b', 'c'],
      transitions: {
        a: ['b'],
        b: ['c', 'a'],
        c: [],
      },
    });

    test('returns true for valid transition', () => {
      expect(machine.isValidTransition('a', 'b')).toBe(true);
      expect(machine.isValidTransition('b', 'c')).toBe(true);
      expect(machine.isValidTransition('b', 'a')).toBe(true);
    });

    test('returns true for same state (no-op)', () => {
      expect(machine.isValidTransition('a', 'a')).toBe(true);
      expect(machine.isValidTransition('c', 'c')).toBe(true);
    });

    test('returns false for invalid transition', () => {
      expect(machine.isValidTransition('a', 'c')).toBe(false);
      expect(machine.isValidTransition('c', 'a')).toBe(false);
      expect(machine.isValidTransition('c', 'b')).toBe(false);
    });

    test('returns false for unknown source state', () => {
      expect(machine.isValidTransition('unknown', 'a')).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    const machine = new StateMachine({
      states: ['a', 'b', 'c'],
      transitions: {
        a: ['b', 'c'],
        b: ['c'],
        c: [],
      },
    });

    test('returns valid transitions for state', () => {
      expect(machine.getValidTransitions('a')).toEqual(['b', 'c']);
      expect(machine.getValidTransitions('b')).toEqual(['c']);
    });

    test('returns empty array for terminal state', () => {
      expect(machine.getValidTransitions('c')).toEqual([]);
    });

    test('returns empty array for unknown state', () => {
      expect(machine.getValidTransitions('unknown')).toEqual([]);
    });
  });

  describe('transition', () => {
    const machine = new StateMachine({
      name: 'status',
      states: ['ready', 'active', 'done'],
      transitions: {
        ready: ['active'],
        active: ['done', 'ready'],
        done: [],
      },
    });

    test('succeeds for valid transition', () => {
      const result = machine.transition('ready', 'active');
      expect(result.success).toBe(true);
      expect(result.from).toBe('ready');
      expect(result.to).toBe('active');
      expect(result.error).toBeUndefined();
    });

    test('succeeds for same state (noop)', () => {
      const result = machine.transition('ready', 'ready');
      expect(result.success).toBe(true);
      expect(result.noop).toBe(true);
    });

    test('fails for invalid transition', () => {
      const result = machine.transition('ready', 'done');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(result.error).toContain('ready → done');
      expect(result.error).toContain('active'); // valid target
    });

    test('fails for invalid target state', () => {
      const result = machine.transition('ready', 'invalid');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid status');
      expect(result.error).toContain('invalid');
    });

    test('fails for invalid source state', () => {
      const result = machine.transition('invalid', 'ready');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid source status');
    });

    test('force mode allows invalid transition', () => {
      const result = machine.transition('ready', 'done', { force: true });
      expect(result.success).toBe(true);
      expect(result.forced).toBe(true);
    });

    test('force mode does not set forced flag for valid transition', () => {
      const result = machine.transition('ready', 'active', { force: true });
      expect(result.success).toBe(true);
      expect(result.forced).toBe(false);
    });
  });

  describe('toMermaidDiagram', () => {
    test('generates valid Mermaid diagram', () => {
      const machine = new StateMachine({
        states: ['start', 'middle', 'end'],
        transitions: {
          start: ['middle'],
          middle: ['end'],
          end: [],
        },
        initial: 'start',
      });

      const diagram = machine.toMermaidDiagram();
      expect(diagram).toContain('stateDiagram-v2');
      expect(diagram).toContain('[*] --> start');
      expect(diagram).toContain('start --> middle');
      expect(diagram).toContain('middle --> end');
      expect(diagram).toContain('end --> [*]'); // terminal state
    });
  });
});

describe('storyStatusMachine', () => {
  test('has correct states', () => {
    const states = storyStatusMachine.getStates();
    expect(states).toContain('ready');
    expect(states).toContain('in_progress');
    expect(states).toContain('in_review');
    expect(states).toContain('blocked');
    expect(states).toContain('completed');
    expect(states).toContain('archived');
  });

  test('initial state is ready', () => {
    expect(storyStatusMachine.getInitialState()).toBe('ready');
  });

  describe('valid transitions', () => {
    test('ready → in_progress', () => {
      expect(storyStatusMachine.isValidTransition('ready', 'in_progress')).toBe(true);
    });

    test('ready → blocked', () => {
      expect(storyStatusMachine.isValidTransition('ready', 'blocked')).toBe(true);
    });

    test('in_progress → in_review', () => {
      expect(storyStatusMachine.isValidTransition('in_progress', 'in_review')).toBe(true);
    });

    test('in_review → completed', () => {
      expect(storyStatusMachine.isValidTransition('in_review', 'completed')).toBe(true);
    });

    test('completed → archived', () => {
      expect(storyStatusMachine.isValidTransition('completed', 'archived')).toBe(true);
    });

    test('completed → in_progress (reopen)', () => {
      expect(storyStatusMachine.isValidTransition('completed', 'in_progress')).toBe(true);
    });

    test('blocked can transition to multiple states', () => {
      expect(storyStatusMachine.isValidTransition('blocked', 'ready')).toBe(true);
      expect(storyStatusMachine.isValidTransition('blocked', 'in_progress')).toBe(true);
      expect(storyStatusMachine.isValidTransition('blocked', 'in_review')).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    test('ready cannot go directly to completed', () => {
      expect(storyStatusMachine.isValidTransition('ready', 'completed')).toBe(false);
    });

    test('archived is terminal', () => {
      expect(storyStatusMachine.getValidTransitions('archived')).toEqual([]);
      expect(storyStatusMachine.isValidTransition('archived', 'ready')).toBe(false);
    });
  });
});

describe('sessionThreadMachine', () => {
  test('has correct states', () => {
    const states = sessionThreadMachine.getStates();
    expect(states).toContain('base');
    expect(states).toContain('parallel');
    expect(states).toContain('chained');
    expect(states).toContain('fusion');
    expect(states).toContain('big');
    expect(states).toContain('long');
  });

  test('initial state is base', () => {
    expect(sessionThreadMachine.getInitialState()).toBe('base');
  });

  describe('valid transitions', () => {
    test('base → parallel (spawn worktree)', () => {
      expect(sessionThreadMachine.isValidTransition('base', 'parallel')).toBe(true);
    });

    test('parallel → base (merge to main)', () => {
      expect(sessionThreadMachine.isValidTransition('parallel', 'base')).toBe(true);
    });

    test('parallel → fusion (merge multiple)', () => {
      expect(sessionThreadMachine.isValidTransition('parallel', 'fusion')).toBe(true);
    });

    test('fusion → base (merge to main)', () => {
      expect(sessionThreadMachine.isValidTransition('fusion', 'base')).toBe(true);
    });

    test('big → parallel (split)', () => {
      expect(sessionThreadMachine.isValidTransition('big', 'parallel')).toBe(true);
    });

    test('long → base (complete)', () => {
      expect(sessionThreadMachine.isValidTransition('long', 'base')).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    test('chained cannot go directly to base', () => {
      expect(sessionThreadMachine.isValidTransition('chained', 'base')).toBe(false);
    });

    test('fusion cannot go to parallel', () => {
      expect(sessionThreadMachine.isValidTransition('fusion', 'parallel')).toBe(false);
    });
  });

  test('generates Mermaid diagram', () => {
    const diagram = sessionThreadMachine.toMermaidDiagram();
    expect(diagram).toContain('stateDiagram-v2');
    expect(diagram).toContain('[*] --> base');
    expect(diagram).toContain('base --> parallel');
    expect(diagram).toContain('parallel --> fusion');
  });
});
