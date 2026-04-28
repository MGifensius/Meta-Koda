export class ActionError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'ActionError';
  }
}

export class ForbiddenError extends ActionError {
  constructor(reason: string) {
    super('FORBIDDEN', reason);
    this.name = 'ForbiddenError';
  }
}
