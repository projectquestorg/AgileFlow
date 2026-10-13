/** A Work problem the user can act on (message plus optional hints). Runtime-neutral (no Node built-ins). */
export class WorkError extends Error {
  constructor(
    message: string,
    readonly hints: string[] = [],
  ) {
    super(message);
    this.name = 'WorkError';
  }
}
