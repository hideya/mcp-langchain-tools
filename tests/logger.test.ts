
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../src/logger.js';

describe('Logger', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should create logger with default INFO level', () => {
    const logger = new Logger();
    logger.info('test message');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should respect log levels', () => {
    const logger = new Logger({ level: 'warn' });
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(consoleSpy).toHaveBeenCalledTimes(2); // Only warn and error should be logged
  });

  it('should accept numeric log levels', () => {
    const logger = new Logger({ level: LogLevel.ERROR });
    logger.warn('warn message');
    logger.error('error message');
    logger.fatal('fatal message');

    expect(consoleSpy).toHaveBeenCalledTimes(2); // Only error and fatal should be logged
  });

  it('should format objects properly', () => {
    const logger = new Logger();
    const testObj = { test: 'value' };
    logger.info(testObj);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(testObj, null, 2)
    );
  });

  it('should handle null and undefined values', () => {
    const logger = new Logger();
    logger.info(null);
    logger.info(undefined);

    expect(consoleSpy).toHaveBeenCalledWith(expect.any(String), 'null');
    expect(consoleSpy).toHaveBeenCalledWith(expect.any(String), 'undefined');
  });
});
