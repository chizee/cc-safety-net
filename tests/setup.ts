import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testHome = mkdtempSync(join(tmpdir(), 'cc-safety-net-test-home-'));
process.env.CC_SAFETY_NET_AUDIT_HOME = join(testHome, 'audit-home');
process.env.CC_SAFETY_NET_HOME ??= join(testHome, 'safety-net-home');
