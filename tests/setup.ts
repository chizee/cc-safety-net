import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CC_SAFETY_NET_HOME ??= mkdtempSync(join(tmpdir(), 'cc-safety-net-test-home-'));
