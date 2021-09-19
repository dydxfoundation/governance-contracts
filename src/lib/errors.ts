/**
 * Base class for custom errors.
 */
export class CustomError extends Error {
  constructor(message: string) {
    super(message);
    // Set a more specific name. This will show up in e.g. console.log.
    this.name = this.constructor.name;
  }
}

export class ConfigError extends CustomError {}
