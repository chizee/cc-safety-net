interface SecretProtectionRuleMetadata {
  id: string;
  category: string;
  label: string;
  description: string;
}

type SecretProtectionMatcherRule = SecretProtectionRuleMetadata & {
  basename?: string;
  extension?: string;
  pattern?: RegExp;
  prefix?: string;
  suffix?: string;
  suffixParts?: readonly string[];
};

export const SECRET_BASENAME_RULES = [
  {
    id: 'secret.basename.env',
    category: 'Basename',
    label: '.env',
    description: 'Blocks exact .env files.',
    basename: '.env',
  },
  {
    id: 'secret.basename.npmrc',
    category: 'Basename',
    label: '.npmrc',
    description: 'Blocks npm credential config files.',
    basename: '.npmrc',
  },
  {
    id: 'secret.basename.pypirc',
    category: 'Basename',
    label: '.pypirc',
    description: 'Blocks Python package index credential files.',
    basename: '.pypirc',
  },
  {
    id: 'secret.basename.netrc',
    category: 'Basename',
    label: '.netrc',
    description: 'Blocks machine login credential files.',
    basename: '.netrc',
  },
  {
    id: 'secret.basename.git-credentials',
    category: 'Basename',
    label: '.git-credentials',
    description: 'Blocks Git credential storage files.',
    basename: '.git-credentials',
  },
  {
    id: 'secret.basename.id-rsa',
    category: 'Basename',
    label: 'id_rsa',
    description: 'Blocks RSA private key basenames.',
    basename: 'id_rsa',
  },
  {
    id: 'secret.basename.id-ed25519',
    category: 'Basename',
    label: 'id_ed25519',
    description: 'Blocks Ed25519 private key basenames.',
    basename: 'id_ed25519',
  },
  {
    id: 'secret.basename.id-ecdsa',
    category: 'Basename',
    label: 'id_ecdsa',
    description: 'Blocks ECDSA private key basenames.',
    basename: 'id_ecdsa',
  },
  {
    id: 'secret.basename.credentials',
    category: 'Basename',
    label: 'credentials',
    description: 'Blocks generic credentials file basenames.',
    basename: 'credentials',
  },
] as const satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_ENV_VARIANT_RULE = {
  id: 'secret.pattern.env-variant',
  category: 'Pattern',
  label: '.env.*',
  description: 'Blocks environment-specific .env variants.',
} as const satisfies SecretProtectionRuleMetadata;

const SECRET_HOME_PATH_CONFIG_VARIANT_SUFFIXES = [
  '.bak',
  '.backup',
  '.copy',
  '.disabled',
  '.old',
  '.orig',
  '.save',
  '.tmp',
] as const;

const SECRET_HOME_PATH_CONFIG_VARIANT_BASES = [
  {
    idSlug: 'kube-config',
    label: '~/.kube/config',
    directoryParts: ['.kube'],
    basename: 'config',
  },
  {
    idSlug: 'docker-config',
    label: '~/.docker/config.json',
    directoryParts: ['.docker'],
    basename: 'config.json',
  },
] as const;

export const SECRET_HOME_PATH_RULES = [
  {
    id: 'secret.home.ssh',
    category: 'Home path',
    label: '~/.ssh',
    description: 'Blocks home SSH configuration and key paths.',
    suffixParts: ['.ssh'],
  },
  {
    id: 'secret.home.aws',
    category: 'Home path',
    label: '~/.aws',
    description: 'Blocks home AWS credential and config paths.',
    suffixParts: ['.aws'],
  },
  {
    id: 'secret.home.gcp',
    category: 'Home path',
    label: '~/.gcp',
    description: 'Blocks home GCP credential paths.',
    suffixParts: ['.gcp'],
  },
  {
    id: 'secret.home.gcloud-config',
    category: 'Home path',
    label: '~/.config/gcloud',
    description: 'Blocks home Google Cloud SDK credential paths.',
    suffixParts: ['.config', 'gcloud'],
  },
  {
    id: 'secret.home.kube-config',
    category: 'Home path',
    label: '~/.kube/config',
    description: 'Blocks home Kubernetes config files.',
    suffixParts: ['.kube', 'config'],
  },
  {
    id: 'secret.home.docker-config',
    category: 'Home path',
    label: '~/.docker/config.json',
    description: 'Blocks home Docker credential config files.',
    suffixParts: ['.docker', 'config.json'],
  },
  ...SECRET_HOME_PATH_CONFIG_VARIANT_BASES.flatMap((rule) =>
    SECRET_HOME_PATH_CONFIG_VARIANT_SUFFIXES.map((suffix) => ({
      id: ['secret.home', rule.idSlug, suffix.slice(1)].join('.'),
      category: 'Home path',
      label: [rule.label, suffix].join(''),
      description: ['Blocks home ', rule.label, suffix, ' credential backup files.'].join(''),
      suffixParts: [...rule.directoryParts, [rule.basename, suffix].join('')],
    })),
  ),
  {
    id: 'secret.home.gh-hosts',
    category: 'Home path',
    label: '~/.config/gh/hosts.yml',
    description: 'Blocks GitHub CLI host credential files.',
    suffixParts: ['.config', 'gh', 'hosts.yml'],
  },
] as const satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_CODING_CLI_RULES = [
  {
    id: 'secret.cli.claude-code',
    category: 'Coding CLI',
    label: 'Claude Code credentials',
    description:
      'Blocks Claude Code settings and credential files, including CLAUDE_CONFIG_DIR relocations.',
  },
  {
    id: 'secret.cli.antigravity',
    category: 'Coding CLI',
    label: 'Antigravity CLI credentials',
    description: 'Blocks Antigravity CLI hook config under the shared Gemini config directory.',
  },
  {
    id: 'secret.cli.codex',
    category: 'Coding CLI',
    label: 'Codex credentials',
    description: 'Blocks Codex auth and config files, including CODEX_HOME relocations.',
  },
  {
    id: 'secret.cli.gemini',
    category: 'Coding CLI',
    label: 'Gemini CLI credentials',
    description: 'Blocks Gemini CLI OAuth, account, settings, and keychain fallback files.',
  },
  {
    id: 'secret.cli.copilot-cli',
    category: 'Coding CLI',
    label: 'GitHub Copilot CLI credentials',
    description: 'Blocks Copilot CLI auth config and MCP OAuth credential storage.',
  },
  {
    id: 'secret.cli.kimi-code',
    category: 'Coding CLI',
    label: 'Kimi Code credentials',
    description: 'Blocks current and legacy Kimi Code config, OAuth, MCP, and server token files.',
  },
  {
    id: 'secret.cli.opencode',
    category: 'Coding CLI',
    label: 'OpenCode credentials',
    description:
      'Blocks OpenCode auth stores and credential-bearing global or managed config files.',
  },
  {
    id: 'secret.cli.pi',
    category: 'Coding CLI',
    label: 'Pi credentials',
    description: 'Blocks Pi coding agent auth files, including PI_CODING_AGENT_DIR relocations.',
  },
] as const satisfies readonly SecretProtectionRuleMetadata[];

export const SECRET_DIRECTORY_RULES = [
  {
    id: 'secret.dir.secrets',
    category: 'Directory',
    label: 'secrets/',
    description: 'Blocks paths inside directories named secrets.',
    basename: 'secrets',
  },
] as const satisfies readonly SecretProtectionMatcherRule[];

const SECRET_VARIANT_PREFIXES = [
  { prefix: 'id_rsa', slug: 'id-rsa', label: 'id_rsa' },
  { prefix: 'id_dsa', slug: 'id-dsa', label: 'id_dsa' },
  { prefix: 'id_ed25519', slug: 'id-ed25519', label: 'id_ed25519' },
  { prefix: 'id_ecdsa', slug: 'id-ecdsa', label: 'id_ecdsa' },
  { prefix: 'credentials', slug: 'credentials', label: 'credentials' },
] as const;

const SECRET_DOT_VARIANT_SUFFIXES = [
  '.bak',
  '.backup',
  '.copy',
  '.disabled',
  '.key',
  '.old',
  '.orig',
  '.pem',
  '.save',
  '.tmp',
] as const;

export const SECRET_VARIANT_SEPARATOR_RULES = SECRET_VARIANT_PREFIXES.map((rule) => ({
  id: `secret.variant.${rule.slug}.separator`,
  category: 'Variant',
  label: `${rule.label}-* / ${rule.label}_*`,
  description: `Blocks ${rule.label} variants with dash or underscore suffixes.`,
  prefix: rule.prefix,
})) satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_VARIANT_DOT_SUFFIX_RULES = SECRET_VARIANT_PREFIXES.flatMap((rule) =>
  SECRET_DOT_VARIANT_SUFFIXES.map((suffix) => ({
    id: `secret.variant.${rule.slug}.${suffix.slice(1)}`,
    category: 'Variant',
    label: `${rule.label}${suffix}`,
    description: `Blocks ${rule.label}${suffix} private credential variants.`,
    prefix: rule.prefix,
    suffix,
  })),
) satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_BROAD_SSH_KEY_BASENAME_RULE = {
  id: 'secret.pattern.ssh-key-basename',
  category: 'Pattern',
  label: '*_(rsa|dsa|ed25519|ecdsa)',
  description: 'Blocks extensionless SSH private key-like basenames.',
  pattern: /^.*_(rsa|dsa|ed25519|ecdsa)$/,
} as const satisfies SecretProtectionMatcherRule;

export const SECRET_EXTENSION_RULES = [
  'agilekeychain',
  'asc',
  'bek',
  'cscfg',
  'fve',
  'gnucash',
  'jks',
  'keychain',
  'kwallet',
  'mdf',
  'ovpn',
  'p12',
  'pcap',
  'pem',
  'pfx',
  'pkcs12',
  'psafe3',
  'rdp',
  'sdf',
  'sqlite',
  'tblk',
  'tpm',
].map((extension) => ({
  id: `secret.ext.${extension}`,
  category: 'Extension',
  label: `.${extension}`,
  description: `Blocks files with the .${extension} extension.`,
  extension,
})) satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_EXTENSION_PATTERN_RULES = [
  {
    id: 'secret.ext-pattern.key',
    category: 'Extension pattern',
    label: '.key / .keypair',
    description: 'Blocks key and keypair extension patterns.',
    pattern: /^key(pair)?$/,
  },
  {
    id: 'secret.ext-pattern.keystore',
    category: 'Extension pattern',
    label: '.keystore / .keyring',
    description: 'Blocks keystore and keyring extension patterns.',
    pattern: /^key(store|ring)$/,
  },
  {
    id: 'secret.ext-pattern.kdbx',
    category: 'Extension pattern',
    label: '.kdb / .kdbx',
    description: 'Blocks KeePass database extension patterns.',
    pattern: /^kdbx?$/,
  },
  {
    id: 'secret.ext-pattern.sql',
    category: 'Extension pattern',
    label: '.sql / .sqldump',
    description: 'Blocks SQL dump extension patterns.',
    pattern: /^sql(dump)?$/,
  },
] as const satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_PROTECTION_RULE_METADATA = [
  ...SECRET_BASENAME_RULES,
  SECRET_ENV_VARIANT_RULE,
  ...SECRET_HOME_PATH_RULES,
  ...SECRET_CODING_CLI_RULES,
  ...SECRET_DIRECTORY_RULES,
  ...SECRET_VARIANT_SEPARATOR_RULES,
  ...SECRET_VARIANT_DOT_SUFFIX_RULES,
  SECRET_BROAD_SSH_KEY_BASENAME_RULE,
  ...SECRET_EXTENSION_RULES,
  ...SECRET_EXTENSION_PATTERN_RULES,
].map((rule) => ({
  id: rule.id,
  category: rule.category,
  label: rule.label,
  description: rule.description,
})) satisfies readonly SecretProtectionRuleMetadata[];

/** @internal */
export const SECRET_PROTECTION_RULE_IDS = SECRET_PROTECTION_RULE_METADATA.map((rule) => rule.id);
export const SECRET_PROTECTION_RULE_ID_SET = new Set<string>(SECRET_PROTECTION_RULE_IDS);
