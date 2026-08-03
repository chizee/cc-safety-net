import { describe, test } from 'bun:test';
import { assertAllowed, assertBlocked, assertStrictBlocked } from '../../helpers.ts';

const RM_RF_HOME = ['rm', '-rf', '~'].join(' ');
const ASSIGN = `W='${RM_RF_HOME}'`;
const SHELL_SOURCE_REASON = 'shell execution source cannot be verified';

describe('quoted-literal assignments with dangerous text', () => {
  describe('data-only references are allowed', () => {
    test('quoted reference as argument to an ordinary command', () => {
      assertAllowed(`${ASSIGN}; echo "$W"`);
    });

    test('compound quoted interpolation as argument', () => {
      assertAllowed(`${ASSIGN}; echo "before $W after"`);
    });

    test('assignment with heredoc-shaped quoted value passed as data', () => {
      const value = `cat > /tmp/x.sh <<'EOF'\n${RM_RF_HOME}\nEOF`;
      assertAllowed(`W="${value}"\nprobe "$W\necho hi" "label"`);
    });

    test('assignment without any later reference', () => {
      assertAllowed(`${ASSIGN}; echo done`);
    });
  });

  describe('risky references keep the assignment-time block', () => {
    test('unquoted expansion in command position', () => {
      assertBlocked(`${ASSIGN}; $W`, RM_RF_HOME.slice(0, 6));
    });

    test('quoted expansion in command position', () => {
      assertBlocked(`${ASSIGN}; "$W"`, RM_RF_HOME.slice(0, 6));
    });

    test('unquoted expansion as wrapper argument', () => {
      assertBlocked(`${ASSIGN}; env $W`, RM_RF_HOME.slice(0, 6));
    });

    test('reference inside a command substitution', () => {
      assertBlocked(`${ASSIGN}; echo "$(env $W)"`, RM_RF_HOME.slice(0, 6));
    });

    test('reference inside an expanding heredoc body', () => {
      assertBlocked(`${ASSIGN}; sh <<EOF\n$W\nEOF`, RM_RF_HOME.slice(0, 6));
    });

    test('strict mode keeps the assignment-time block', () => {
      assertStrictBlocked(`${ASSIGN}; echo "$W"`, RM_RF_HOME.slice(0, 6));
    });
  });

  describe('quoted references feeding shell sources stay blocked downstream', () => {
    test('eval of the quoted reference', () => {
      assertBlocked(`${ASSIGN}; eval "$W"`, SHELL_SOURCE_REASON);
    });

    test('shell -c with the quoted reference', () => {
      assertBlocked(`${ASSIGN}; bash -c "$W"`, SHELL_SOURCE_REASON);
    });

    test('pipe of the quoted reference into a shell', () => {
      assertBlocked(`${ASSIGN}; echo "$W" | sh`, SHELL_SOURCE_REASON);
    });
  });
});
