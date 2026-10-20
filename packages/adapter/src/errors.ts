export class ParseError extends Error {
  override readonly name = 'ParseError';
  readonly parser: string;

  constructor(parser: string, message: string, options?: { cause?: unknown }) {
    super(`${parser}: ${message}`, options);
    this.parser = parser;
  }
}
