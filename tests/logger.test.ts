import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Logger } from "../src/logger.js";

describe("Logger", () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("should create logger with default INFO level", () => {
    const logger = new Logger();
    logger.debug("test message");
    expect(consoleSpy).not.toHaveBeenCalled();

    logger.info("test message");
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should respect custom log level", () => {
    const logger = new Logger({ level: "debug" });
    logger.debug("test message");
    expect(consoleSpy).toHaveBeenCalled();
  });
});
