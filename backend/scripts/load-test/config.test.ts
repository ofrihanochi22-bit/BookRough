import { describe, expect, it } from 'vitest';

import {
  assertLoadTestDatabase,
  DEFAULT_ROUNDS,
  HOST_DATABASE_URL,
  parseRounds,
} from './config.js';

describe('assertLoadTestDatabase', () => {
  it('accepts the load-test database', () => {
    // Arrange
    const url = HOST_DATABASE_URL;

    // Act
    const check = () => assertLoadTestDatabase(url);

    // Assert
    expect(check).not.toThrow();
  });

  it.each([
    ['the dev database', 'postgresql://bookrough:bookrough@localhost:5433/music_app_dev'],
    ['the test database', 'postgresql://bookrough:bookrough@localhost:5433/music_app_test_db'],
    ['a look-alike name', 'postgresql://u:p@localhost:5433/music_app_loadtest_db_copy'],
  ])('refuses %s', (_label, url) => {
    // Act
    const check = () => assertLoadTestDatabase(url);

    // Assert
    expect(check).toThrow(/only against music_app_loadtest_db/);
  });

  it('refuses something that is not a URL', () => {
    // Act
    const check = () => assertLoadTestDatabase('music_app_loadtest_db');

    // Assert
    expect(check).toThrow(/Not a database URL/);
  });
});

describe('parseRounds', () => {
  it('defaults to 10, 20, 30, 40 and 50', () => {
    // Act
    const rounds = parseRounds([]);

    // Assert
    expect(rounds).toEqual([...DEFAULT_ROUNDS]);
    expect(rounds).toEqual([10, 20, 30, 40, 50]);
  });

  it('reads --rounds', () => {
    // Act
    const rounds = parseRounds(['--skip-build', '--rounds', '10, 20']);

    // Assert
    expect(rounds).toEqual([10, 20]);
  });

  it.each([['0'], ['51'], ['10,abc'], ['2.5'], ['']])('refuses --rounds %j', (value) => {
    // Act
    const parse = () => parseRounds(['--rounds', value]);

    // Assert
    expect(parse).toThrow(/--rounds takes sizes from 1 to 50/);
  });

  it('refuses --rounds with no value', () => {
    // Act
    const parse = () => parseRounds(['--rounds']);

    // Assert
    expect(parse).toThrow(/--rounds/);
  });
});
