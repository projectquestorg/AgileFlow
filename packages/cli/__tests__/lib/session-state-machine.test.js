/**
 * Tests for session-state-machine.js
 */

const {
  SessionState,
  SessionAction,
  TRANSITIONS,
  getValidStates,
  getValidActions,
  isValidState,
  isValidAction,
  getTransitionsFromState,
  getAvailableActions,
  canTransition,
  getNextState,
  StateMachineError,
  SessionStateMachine,
  createSessionStateMachine,
} = require('../../lib/session-state-machine');

describe('session-state-machine', () => {
  describe('SessionState enum', () => {
    it('has all expected states', () => {
      expect(SessionState.IDLE).toBe('idle');
      expect(SessionState.ACTIVE).toBe('active');
      expect(SessionState.PAUSED).toBe('paused');
      expect(SessionState.TERMINATED).toBe('terminated');
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(SessionState)).toBe(true);
    });
  });

  describe('SessionAction enum', () => {
    it('has all expected actions', () => {
      expect(SessionAction.START).toBe('start');
      expect(SessionAction.PAUSE).toBe('pause');
      expect(SessionAction.RESUME).toBe('resume');
      expect(SessionAction.STOP).toBe('stop');
      expect(SessionAction.RESTART).toBe('restart');
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(SessionAction)).toBe(true);
    });
  });

  describe('TRANSITIONS', () => {
    it('defines transitions from idle', () => {
      expect(TRANSITIONS.idle.start).toBe('active');
    });

    it('defines transitions from active', () => {
      expect(TRANSITIONS.active.pause).toBe('paused');
      expect(TRANSITIONS.active.stop).toBe('terminated');
      expect(TRANSITIONS.active.restart).toBe('active');
    });

    it('defines transitions from paused', () => {
      expect(TRANSITIONS.paused.resume).toBe('active');
      expect(TRANSITIONS.paused.stop).toBe('terminated');
    });

    it('defines no transitions from terminated', () => {
      expect(TRANSITIONS.terminated).toEqual({});
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(TRANSITIONS)).toBe(true);
    });
  });

  describe('Utility functions', () => {
    describe('getValidStates', () => {
      it('returns all valid states', () => {
        const states = getValidStates();
        expect(states).toContain('idle');
        expect(states).toContain('active');
        expect(states).toContain('paused');
        expect(states).toContain('terminated');
        expect(states).toHaveLength(4);
      });
    });

    describe('getValidActions', () => {
      it('returns all valid actions', () => {
        const actions = getValidActions();
        expect(actions).toContain('start');
        expect(actions).toContain('pause');
        expect(actions).toContain('resume');
        expect(actions).toContain('stop');
        expect(actions).toContain('restart');
        expect(actions).toHaveLength(5);
      });
    });

    describe('isValidState', () => {
      it('returns true for valid states', () => {
        expect(isValidState('idle')).toBe(true);
        expect(isValidState('active')).toBe(true);
        expect(isValidState('paused')).toBe(true);
        expect(isValidState('terminated')).toBe(true);
      });

      it('returns false for invalid states', () => {
        expect(isValidState('invalid')).toBe(false);
        expect(isValidState('')).toBe(false);
        expect(isValidState(null)).toBe(false);
      });
    });

    describe('isValidAction', () => {
      it('returns true for valid actions', () => {
        expect(isValidAction('start')).toBe(true);
        expect(isValidAction('stop')).toBe(true);
      });

      it('returns false for invalid actions', () => {
        expect(isValidAction('invalid')).toBe(false);
        expect(isValidAction('')).toBe(false);
      });
    });

    describe('getTransitionsFromState', () => {
      it('returns transitions for idle', () => {
        const trans = getTransitionsFromState('idle');
        expect(trans.start).toBe('active');
      });

      it('returns empty object for invalid state', () => {
        expect(getTransitionsFromState('invalid')).toEqual({});
      });
    });

    describe('getAvailableActions', () => {
      it('returns available actions from idle', () => {
        expect(getAvailableActions('idle')).toEqual(['start']);
      });

      it('returns available actions from active', () => {
        const actions = getAvailableActions('active');
        expect(actions).toContain('pause');
        expect(actions).toContain('stop');
        expect(actions).toContain('restart');
      });

      it('returns empty array from terminated', () => {
        expect(getAvailableActions('terminated')).toEqual([]);
      });
    });

    describe('canTransition', () => {
      it('returns true for valid transitions', () => {
        expect(canTransition('idle', 'start')).toBe(true);
        expect(canTransition('active', 'pause')).toBe(true);
        expect(canTransition('paused', 'resume')).toBe(true);
      });

      it('returns false for invalid transitions', () => {
        expect(canTransition('idle', 'pause')).toBe(false);
        expect(canTransition('terminated', 'start')).toBe(false);
      });
    });

    describe('getNextState', () => {
      it('returns next state for valid transitions', () => {
        expect(getNextState('idle', 'start')).toBe('active');
        expect(getNextState('active', 'pause')).toBe('paused');
      });

      it('returns null for invalid transitions', () => {
        expect(getNextState('idle', 'pause')).toBeNull();
        expect(getNextState('terminated', 'start')).toBeNull();
      });
    });
  });

  describe('StateMachineError', () => {
    it('extends Error', () => {
      const err = new StateMachineError('test');
      expect(err instanceof Error).toBe(true);
    });

    it('has name StateMachineError', () => {
      const err = new StateMachineError('test');
      expect(err.name).toBe('StateMachineError');
    });

    it('includes details', () => {
      const err = new StateMachineError('test', {
        currentState: 'idle',
        action: 'pause',
        code: 'INVALID_TRANSITION',
      });

      expect(err.currentState).toBe('idle');
      expect(err.action).toBe('pause');
      expect(err.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('SessionStateMachine', () => {
    let sm;

    beforeEach(() => {
      sm = new SessionStateMachine();
    });

    describe('constructor', () => {
      it('starts in idle state by default', () => {
        expect(sm.state).toBe('idle');
      });

      it('accepts custom initial state', () => {
        const sm2 = new SessionStateMachine('active');
        expect(sm2.state).toBe('active');
      });

      it('throws on invalid initial state', () => {
        expect(() => new SessionStateMachine('invalid')).toThrow(StateMachineError);
      });
    });

    describe('state property', () => {
      it('returns current state', () => {
        expect(sm.state).toBe('idle');
        sm.transition('start');
        expect(sm.state).toBe('active');
      });
    });

    describe('isFinal()', () => {
      it('returns false for non-final states', () => {
        expect(sm.isFinal()).toBe(false);
      });

      it('returns true for terminated state', () => {
        sm.transition('start');
        sm.transition('stop');
        expect(sm.isFinal()).toBe(true);
      });
    });

    describe('canTransition()', () => {
      it('returns true for valid transitions', () => {
        expect(sm.canTransition('start')).toBe(true);
      });

      it('returns false for invalid transitions', () => {
        expect(sm.canTransition('pause')).toBe(false);
      });
    });

    describe('getAvailableActions()', () => {
      it('returns available actions', () => {
        expect(sm.getAvailableActions()).toEqual(['start']);
      });
    });

    describe('transition()', () => {
      it('performs valid transitions', () => {
        const result = sm.transition('start');

        expect(result.ok).toBe(true);
        expect(result.from).toBe('idle');
        expect(result.to).toBe('active');
        expect(sm.state).toBe('active');
      });

      it('throws on invalid action in strict mode', () => {
        expect(() => sm.transition('invalid')).toThrow(StateMachineError);
      });

      it('throws on invalid transition in strict mode', () => {
        expect(() => sm.transition('pause')).toThrow(StateMachineError);
      });

      it('returns error in non-strict mode', () => {
        const sm2 = new SessionStateMachine('idle', { strict: false });
        const result = sm2.transition('pause');

        expect(result.ok).toBe(false);
        expect(result.error).toBeInstanceOf(StateMachineError);
      });

      it('emits transition event', () => {
        const handler = jest.fn();
        sm.on('transition', handler);

        sm.transition('start');

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 'idle',
            to: 'active',
            action: 'start',
          })
        );
      });

      it('emits stateChange event', () => {
        const handler = jest.fn();
        sm.on('stateChange', handler);

        sm.transition('start');

        expect(handler).toHaveBeenCalledWith({ state: 'active' });
      });

      it('emits invalidTransition event on failure', () => {
        const sm2 = new SessionStateMachine('idle', { strict: false });
        const handler = jest.fn();
        sm2.on('invalidTransition', handler);

        sm2.transition('pause');

        expect(handler).toHaveBeenCalled();
      });
    });

    describe('tryTransition()', () => {
      it('returns true on success', () => {
        expect(sm.tryTransition('start')).toBe(true);
      });

      it('returns false on failure', () => {
        expect(sm.tryTransition('pause')).toBe(false);
      });

      it('does not throw', () => {
        expect(() => sm.tryTransition('invalid')).not.toThrow();
      });
    });

    describe('reset()', () => {
      it('resets to idle by default', () => {
        sm.transition('start');
        sm.reset();
        expect(sm.state).toBe('idle');
      });

      it('resets to specified state', () => {
        sm.reset('active');
        expect(sm.state).toBe('active');
      });

      it('throws on invalid state', () => {
        expect(() => sm.reset('invalid')).toThrow(StateMachineError);
      });

      it('emits transition event', () => {
        const handler = jest.fn();
        sm.on('transition', handler);

        sm.transition('start');
        sm.reset();

        expect(handler).toHaveBeenLastCalledWith(
          expect.objectContaining({
            action: 'reset',
            to: 'idle',
          })
        );
      });
    });

    describe('is()', () => {
      it('returns true when state matches', () => {
        expect(sm.is('idle')).toBe(true);
      });

      it('returns false when state does not match', () => {
        expect(sm.is('active')).toBe(false);
      });
    });

    describe('isOneOf()', () => {
      it('returns true when state is in list', () => {
        expect(sm.isOneOf('idle', 'active')).toBe(true);
      });

      it('returns false when state is not in list', () => {
        expect(sm.isOneOf('active', 'paused')).toBe(false);
      });
    });

    describe('history', () => {
      it('is empty when disabled', () => {
        expect(sm.history).toEqual([]);
      });

      it('tracks transitions when enabled', () => {
        const sm2 = new SessionStateMachine('idle', { historyEnabled: true });
        sm2.transition('start');
        sm2.transition('pause');

        expect(sm2.history).toHaveLength(3); // initial + 2 transitions
        expect(sm2.history[1].action).toBe('start');
        expect(sm2.history[2].action).toBe('pause');
      });
    });

    describe('metadata', () => {
      it('is empty by default', () => {
        expect(sm.metadata).toEqual({});
      });

      it('can be set', () => {
        sm.setMetadata({ sessionId: 1 });
        expect(sm.metadata.sessionId).toBe(1);
      });

      it('merges with existing metadata', () => {
        sm.setMetadata({ a: 1 });
        sm.setMetadata({ b: 2 });
        expect(sm.metadata).toEqual({ a: 1, b: 2 });
      });
    });

    describe('serialize()', () => {
      it('serializes current state', () => {
        sm.transition('start');
        const data = sm.serialize();

        expect(data.state).toBe('active');
      });

      it('includes history when enabled', () => {
        const sm2 = new SessionStateMachine('idle', { historyEnabled: true });
        sm2.transition('start');
        const data = sm2.serialize();

        expect(data.history).toBeDefined();
        expect(data.history.length).toBeGreaterThan(0);
      });

      it('includes metadata when present', () => {
        sm.setMetadata({ test: true });
        const data = sm.serialize();

        expect(data.metadata).toEqual({ test: true });
      });
    });

    describe('deserialize()', () => {
      it('restores state machine from data', () => {
        const data = { state: 'active' };
        const restored = SessionStateMachine.deserialize(data);

        expect(restored.state).toBe('active');
      });

      it('restores history', () => {
        const data = {
          state: 'active',
          history: [
            { state: 'idle', timestamp: new Date().toISOString() },
            { state: 'active', action: 'start', timestamp: new Date().toISOString() },
          ],
        };

        const restored = SessionStateMachine.deserialize(data);

        expect(restored.history).toHaveLength(2);
      });

      it('restores metadata', () => {
        const data = {
          state: 'idle',
          metadata: { sessionId: 42 },
        };

        const restored = SessionStateMachine.deserialize(data);

        expect(restored.metadata.sessionId).toBe(42);
      });
    });

    describe('toMermaid()', () => {
      it('generates Mermaid diagram', () => {
        const diagram = SessionStateMachine.toMermaid();

        expect(diagram).toContain('stateDiagram-v2');
        expect(diagram).toContain('idle --> active: start');
        expect(diagram).toContain('active --> paused: pause');
        expect(diagram).toContain('terminated --> [*]');
      });
    });
  });

  describe('createSessionStateMachine()', () => {
    it('creates state machine in idle state', () => {
      const sm = createSessionStateMachine();
      expect(sm.state).toBe('idle');
    });

    it('passes options through', () => {
      const sm = createSessionStateMachine({ historyEnabled: true });
      sm.transition('start');
      expect(sm.history.length).toBeGreaterThan(0);
    });
  });

  describe('Full lifecycle', () => {
    it('completes full session lifecycle', () => {
      const sm = createSessionStateMachine({ historyEnabled: true });

      // Start session
      expect(sm.transition('start').ok).toBe(true);
      expect(sm.state).toBe('active');

      // Pause session
      expect(sm.transition('pause').ok).toBe(true);
      expect(sm.state).toBe('paused');

      // Resume session
      expect(sm.transition('resume').ok).toBe(true);
      expect(sm.state).toBe('active');

      // Stop session
      expect(sm.transition('stop').ok).toBe(true);
      expect(sm.state).toBe('terminated');
      expect(sm.isFinal()).toBe(true);

      // Cannot transition from terminated
      expect(sm.canTransition('start')).toBe(false);
    });

    it('tracks complete history', () => {
      const sm = createSessionStateMachine({ historyEnabled: true });

      sm.transition('start');
      sm.transition('pause');
      sm.transition('resume');
      sm.transition('stop');

      expect(sm.history).toHaveLength(5); // initial + 4 transitions
      expect(sm.history.map(h => h.state)).toEqual([
        'idle',
        'active',
        'paused',
        'active',
        'terminated',
      ]);
    });
  });
});
