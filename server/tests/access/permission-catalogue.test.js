'use strict';

/**
 * The permission vocabulary, and the drift this stops.
 *
 * The list an admin picks from used to live hardcoded in the web page. It had
 * already fallen behind the code: `mentee.transfer` and `feedback.manage` were
 * missing from it, so neither could be granted to a custom role through the one
 * screen that grants them, and nothing anywhere said so.
 *
 * A list of permissions kept next to a screen drifts from the list kept next to
 * the code. These assertions are what make that impossible: add a permission
 * and forget to group it, and this fails.
 */

const { ALL_PERMISSIONS, PERMISSION_GROUPS } = require('../../src/config/permissions');

const listed = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((p) => p.key));

describe('the permission catalogue', () => {
  test('accounts for every permission that exists', () => {
    expect(listed.sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  test('puts each one in exactly one group', () => {
    const seen = listed.filter((key, index) => listed.indexOf(key) !== index);
    expect(seen).toEqual([]);
  });

  test('describes nothing that is not a real permission', () => {
    // A typo here would offer an admin a permission that authorises nothing,
    // and the role would look right and do less than it says.
    expect(listed.every((key) => ALL_PERMISSIONS.includes(key))).toBe(true);
  });

  test('says what each one allows, in words rather than the key', () => {
    for (const group of PERMISSION_GROUPS) {
      expect(group.label).toBeTruthy();
      for (const permission of group.permissions) {
        expect(permission.label).toBeTruthy();
        // "program manage" is the key with the dots taken out, not a sentence.
        expect(permission.label).not.toBe(permission.key.replace(/[._]/g, ' '));
      }
    }
  });

  test('leaves no group empty', () => {
    expect(PERMISSION_GROUPS.every((group) => group.permissions.length > 0)).toBe(true);
  });
});
