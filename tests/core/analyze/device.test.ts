import { describe, expect, test } from 'bun:test';
import { assertAllowed, assertBlocked, runGuard } from '../../helpers.ts';

const DD_REASON = 'dd writing to a /dev device';
const MKFS_REASON = 'mkfs formatting a /dev device';
const SHRED_REASON = 'shred permanently destroys';

describe('dd device write', () => {
  test('blocks dd writing to a /dev target', () => {
    assertBlocked('dd if=/dev/zero of=/dev/sda', DD_REASON);
  });

  test('blocks dd with reordered operands', () => {
    assertBlocked('dd of=/dev/nvme0n1 if=/dev/zero', DD_REASON);
  });

  test('blocks quoted /dev target stripped by the parser', () => {
    assertBlocked('dd if=/dev/zero of="/dev/sda"', DD_REASON);
  });

  test('allows dd reading a device into a file', () => {
    assertAllowed('dd if=/dev/sda of=./backup.img');
  });

  test('allows dd writing an image file', () => {
    assertAllowed('dd if=x.iso of=./out.img');
    assertAllowed('dd if=/dev/urandom of=random.dat');
  });
});

describe('mkfs device format', () => {
  test('blocks mkfs family formatting a /dev target', () => {
    assertBlocked('mkfs.ext4 /dev/sda1', MKFS_REASON);
    assertBlocked('mkfs.xfs -L data /dev/sdc1', MKFS_REASON);
  });

  test('blocks bare mkfs with -t and a reordered /dev target', () => {
    assertBlocked('mkfs -t ext4 /dev/sdb', MKFS_REASON);
  });

  test('allows mkfs on a file-backed image', () => {
    assertAllowed('mkfs.ext4 disk.img');
    assertAllowed('mkfs.ext4 ./loop.img');
  });
});

describe('shred target', () => {
  test('blocks shred with any target', () => {
    assertBlocked('shred /dev/sda', SHRED_REASON);
    assertBlocked('shred -u secret.txt', SHRED_REASON);
  });

  test('allows bare shred with no operand', () => {
    assertAllowed('shred');
  });
});

describe('word-boundary non-matches', () => {
  test('allows heads that merely contain dd or shred as a substring', () => {
    assertAllowed('ldd ./bin');
    assertAllowed('ddrescue if=/dev/sda of=./out.img');
  });
});

describe('wrapper and carrier coverage', () => {
  test('blocks inside bash -c', () => {
    assertBlocked('bash -c "dd if=/dev/zero of=/dev/sda"', DD_REASON);
  });

  test('blocks under sudo (transparent wrapper stripped)', () => {
    assertBlocked('sudo mkfs.ext4 /dev/sda', MKFS_REASON);
  });

  test('blocks under env (transparent wrapper stripped)', () => {
    assertBlocked('env dd of=/dev/sda if=/dev/zero', DD_REASON);
  });

  test('blocks inside eval', () => {
    assertBlocked('eval "shred secret"', SHRED_REASON);
  });
});

describe('overridability', () => {
  test('honors a per-rule override', () => {
    expect(
      runGuard('dd if=/dev/zero of=/dev/sda', undefined, {
        destructiveCommandRuleOverrides: { 'dd.device-write': 'off' },
      }),
    ).toBeNull();
  });

  test('honors master destructive-command protection disable (not catastrophic)', () => {
    expect(
      runGuard('mkfs.ext4 /dev/sda1', undefined, {
        destructiveCommandProtectionEnabled: false,
      }),
    ).toBeNull();
    expect(
      runGuard('shred -u secret.txt', undefined, {
        destructiveCommandProtectionEnabled: false,
      }),
    ).toBeNull();
  });
});

describe('raw-text parser-evasion fallback', () => {
  test('blocks unparseable dd/mkfs/shred device commands', () => {
    assertBlocked("dd if=/dev/zero of=/dev/sda 'oops", '(dd of=/dev/)');
    assertBlocked('mkfs.ext4 /dev/sda "oops', '(mkfs /dev/)');
    assertBlocked("shred secret 'x", '(shred)');
  });

  test('allows an unparseable dd writing to a file (no /dev target)', () => {
    assertAllowed("dd if=/dev/sda of=./x.img 'oops");
  });
});
