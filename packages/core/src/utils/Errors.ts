/**
 * Base class for all domain-specific errors in the Soup project.
 */
export class SoupError extends Error {
  /**
   * Creates an instance of SoupError.
   * 
   * @param message - Error message.
   * @param code - Optional error code.
   */
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when a metadata provider (e.g. TMDB) fails.
 */
export class ProviderError extends SoupError {
  /**
   * Creates an instance of ProviderError.
   * 
   * @param message - Error message.
   * @param code - Optional provider-specific error code.
   */
  constructor(message: string, code?: string) {
    super(message, code);
  }
}

/**
 * Error thrown when qBittorrent client operations fail.
 */
export class ClientError extends SoupError {
  /**
   * Creates an instance of ClientError.
   * 
   * @param message - Error message.
   * @param code - Optional client-specific error code.
   */
  constructor(message: string, code?: string) {
    super(message, code);
  }
}

/**
 * Error thrown when storage or filesystem operations fail.
 */
export class StorageError extends SoupError {
  /**
   * Creates an instance of StorageError.
   * 
   * @param message - Error message.
   * @param code - Optional filesystem error code.
   */
  constructor(message: string, code?: string) {
    super(message, code);
  }
}

/**
 * Error thrown when an item is not found (e.g. torrent hash doesn't exist).
 */
export class NotFoundError extends SoupError {
  /**
   * Creates an instance of NotFoundError.
   * 
   * @param message - Error message.
   */
  constructor(message: string) {
    super(message, 'NOT_FOUND');
  }
}
