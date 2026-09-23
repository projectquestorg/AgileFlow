import * as clack from '@clack/prompts';

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * Everything interactive goes through a Prompter so commands can be driven
 * by tests (scripted answers) or run non-interactively (no prompts at all).
 */
export interface Prompter {
  readonly interactive: boolean;
  select<T extends string>(message: string, choices: Choice<T>[], initial?: T): Promise<T>;
  multiselect<T extends string>(message: string, choices: Choice<T>[], initial: T[], required?: boolean): Promise<T[]>;
  confirm(message: string, initial?: boolean): Promise<boolean>;
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

function unwrap<T>(value: T | symbol): T {
  if (clack.isCancel(value)) throw new CancelledError();
  return value as T;
}

export const clackPrompter: Prompter = {
  interactive: true,
  async select(message, choices, initial) {
    return unwrap(
      await clack.select({
        message,
        options: choices.map((c) => ({ value: c.value, label: c.label, hint: c.hint })) as never,
        initialValue: initial,
      }),
    ) as never;
  },
  async multiselect(message, choices, initial, required = false) {
    return unwrap(
      await clack.multiselect({
        message,
        options: choices.map((c) => ({ value: c.value, label: c.label, hint: c.hint })) as never,
        initialValues: initial,
        required,
      }),
    ) as never;
  },
  async confirm(message, initial = true) {
    return unwrap(await clack.confirm({ message, initialValue: initial }));
  },
};

/** Used with --yes / CI / no TTY: every question takes its default. */
export const defaultsPrompter: Prompter = {
  interactive: false,
  async select(_message, choices, initial) {
    return initial ?? choices[0]!.value;
  },
  async multiselect(_message, _choices, initial) {
    return initial;
  },
  async confirm(_message, initial = true) {
    return initial;
  },
};

/** Scripted answers for tests. Throws when a question has no queued answer. */
export function scriptedPrompter(answers: unknown[]): Prompter & { asked: string[] } {
  const queue = [...answers];
  const asked: string[] = [];
  const next = (message: string) => {
    asked.push(message);
    if (!queue.length) throw new Error(`Unexpected prompt: ${message}`);
    return queue.shift();
  };
  return {
    interactive: true,
    asked,
    async select(message) {
      return next(message) as never;
    },
    async multiselect(message) {
      return next(message) as never;
    },
    async confirm(message) {
      return next(message) as boolean;
    },
  };
}
