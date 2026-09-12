'use strict';

/**
 * Regression guard for the submission 500.
 *
 * `submissionUrls` is a Postgres text[]. Sequelize stringifies an array by
 * mapping over it, and multipart delivers a field sent once as a bare string.
 * So a mentee who attached exactly one link, which is what a mentee attaches,
 * got "values.map is not a function" and lost the submission. Everything here
 * is that bug and the ones next to it.
 */

const { toStringList, toBoolean, toNumber } = require('../../src/utils/multipartFields');

describe('toStringList', () => {
  // The exact shape that threw.
  it('wraps the single field multipart sends as a bare string', () => {
    expect(toStringList('https://github.com/noor/api')).toEqual(['https://github.com/noor/api']);
  });

  it('leaves a real array alone, which is what a JSON caller sends', () => {
    expect(toStringList(['https://a.com', 'https://b.com'])).toEqual([
      'https://a.com',
      'https://b.com'
    ]);
  });

  it('is empty when the field was not sent', () => {
    expect(toStringList(undefined)).toEqual([]);
    expect(toStringList(null)).toEqual([]);
  });

  it('drops blanks rather than writing an empty string into the column', () => {
    expect(toStringList(['https://a.com', '', '   '])).toEqual(['https://a.com']);
    expect(toStringList('   ')).toEqual([]);
  });

  it('trims, because a pasted link carries whitespace', () => {
    expect(toStringList('  https://a.com  ')).toEqual(['https://a.com']);
  });

  it('ignores anything that is not text', () => {
    expect(toStringList([1, {}, 'https://a.com'])).toEqual(['https://a.com']);
  });
});

describe('toBoolean', () => {
  // `submissionData.extensionRequested || false` set extensionStatus to
  // 'pending' for the string "false", which multipart is what sends.
  it('does not treat the string "false" as true', () => {
    expect(toBoolean('false')).toBe(false);
  });

  it('reads the strings multipart actually sends', () => {
    expect(toBoolean('true')).toBe(true);
    expect(toBoolean('1')).toBe(true);
    expect(toBoolean('0')).toBe(false);
    expect(toBoolean(undefined)).toBe(false);
  });

  it('leaves a real boolean alone', () => {
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean(false)).toBe(false);
  });
});

describe('toNumber', () => {
  it('reads a numeric field sent as text', () => {
    expect(toNumber('3.5')).toBe(3.5);
    expect(toNumber(3.5)).toBe(3.5);
  });

  it('is null rather than NaN when there is nothing to read', () => {
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber('later')).toBeNull();
  });
});
