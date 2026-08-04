/**
 * The one argument parser behind every CLI command. A command declares the flags
 * it accepts and what it does with positionals; the parser reports what it found
 * and what it could not place, and the command validates the values it asked for.
 */

const HELP_FLAGS = ['-h', '--help'];

/**
 * Parse `argv` against one command's flag spec.
 *
 * `-h`/`--help` is accepted for every command and reported as `help` instead of an
 * unknown option, because every command documents it. Everything after a bare `--`
 * is positional input. A flag that takes a value never consumes a token starting
 * with `-`: it reports the missing value instead, so `--cwd --json` cannot silently
 * mean `cwd=--json`.
 */
export function parseCommandArgs<Flag extends string, Valued extends string>(
  spec: {
    /** Names the command in error text: `Unknown option for <label>: --x`. */
    label: string;
    /** Flag name to every spelling that sets it, mirroring the command's help entry. */
    booleans?: Readonly<Record<Flag, readonly string[]>>;
    /** Same, for flags that take the next token as their value. */
    values?: Readonly<Record<Valued, readonly string[]>>;
    /** `none` rejects positionals, `list` keeps them, `tail` ends option parsing at the first one. */
    positionals?: 'none' | 'list' | 'tail';
  },
  argv: readonly string[],
) {
  const booleanEntries = Object.entries(spec.booleans ?? {}) as [Flag, readonly string[]][];
  const valueEntries = Object.entries(spec.values ?? {}) as [Valued, readonly string[]][];
  const flags = Object.fromEntries(booleanEntries.map(([name]) => [name, false])) as Record<
    Flag,
    boolean
  >;
  const values: Partial<Record<Valued, string>> = {};
  const positionals: string[] = [];
  const errors: string[] = [];
  let help = false;
  let consumedIndex = -1;

  for (const [index, arg] of argv.entries()) {
    if (index <= consumedIndex) continue;
    if (arg === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (HELP_FLAGS.includes(arg)) {
      help = true;
      continue;
    }
    const booleanEntry = booleanEntries.find(([, spellings]) => spellings.includes(arg));
    if (booleanEntry) {
      flags[booleanEntry[0]] = true;
      continue;
    }
    const valueEntry = valueEntries.find(([, spellings]) => spellings.includes(arg));
    if (valueEntry) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) {
        errors.push(`${arg} requires a value`);
        continue;
      }
      values[valueEntry[0]] = value;
      consumedIndex = index + 1;
      continue;
    }
    if (arg.startsWith('-')) {
      errors.push(`Unknown option for ${spec.label}: ${arg}`);
      continue;
    }
    if (spec.positionals === 'tail') {
      positionals.push(...argv.slice(index));
      break;
    }
    positionals.push(arg);
  }

  if (spec.positionals !== 'list' && spec.positionals !== 'tail') {
    errors.push(
      ...positionals.map((positional) => `Unexpected argument for ${spec.label}: ${positional}`),
    );
  }

  return { flags, values, positionals, help, errors };
}

/**
 * Print every parse error a command cannot proceed past. Returns whether any were
 * reported so callers stay a single `if` away from their own failure exit.
 */
export function reportCommandArgErrors(errors: readonly string[]): boolean {
  for (const error of errors) console.error(error);
  return errors.length > 0;
}
