export declare const SECRET_BASENAME_RULES: readonly [{
    readonly id: "secret.basename.env";
    readonly category: "Basename";
    readonly label: ".env";
    readonly description: "Blocks exact .env files.";
    readonly basename: ".env";
}, {
    readonly id: "secret.basename.npmrc";
    readonly category: "Basename";
    readonly label: ".npmrc";
    readonly description: "Blocks npm credential config files.";
    readonly basename: ".npmrc";
}, {
    readonly id: "secret.basename.pypirc";
    readonly category: "Basename";
    readonly label: ".pypirc";
    readonly description: "Blocks Python package index credential files.";
    readonly basename: ".pypirc";
}, {
    readonly id: "secret.basename.netrc";
    readonly category: "Basename";
    readonly label: ".netrc";
    readonly description: "Blocks machine login credential files.";
    readonly basename: ".netrc";
}, {
    readonly id: "secret.basename.git-credentials";
    readonly category: "Basename";
    readonly label: ".git-credentials";
    readonly description: "Blocks Git credential storage files.";
    readonly basename: ".git-credentials";
}, {
    readonly id: "secret.basename.id-rsa";
    readonly category: "Basename";
    readonly label: "id_rsa";
    readonly description: "Blocks RSA private key basenames.";
    readonly basename: "id_rsa";
}, {
    readonly id: "secret.basename.id-ed25519";
    readonly category: "Basename";
    readonly label: "id_ed25519";
    readonly description: "Blocks Ed25519 private key basenames.";
    readonly basename: "id_ed25519";
}, {
    readonly id: "secret.basename.id-ecdsa";
    readonly category: "Basename";
    readonly label: "id_ecdsa";
    readonly description: "Blocks ECDSA private key basenames.";
    readonly basename: "id_ecdsa";
}, {
    readonly id: "secret.basename.credentials";
    readonly category: "Basename";
    readonly label: "credentials";
    readonly description: "Blocks generic credentials file basenames.";
    readonly basename: "credentials";
}];
export declare const SECRET_ENV_VARIANT_RULE: {
    readonly id: "secret.pattern.env-variant";
    readonly category: "Pattern";
    readonly label: ".env.*";
    readonly description: "Blocks environment-specific .env variants.";
};
export declare const SECRET_HOME_PATH_RULES: readonly [{
    readonly id: "secret.home.ssh";
    readonly category: "Home path";
    readonly label: "~/.ssh";
    readonly description: "Blocks home SSH configuration and key paths.";
    readonly suffixParts: readonly [".ssh"];
}, {
    readonly id: "secret.home.aws";
    readonly category: "Home path";
    readonly label: "~/.aws";
    readonly description: "Blocks home AWS credential and config paths.";
    readonly suffixParts: readonly [".aws"];
}, {
    readonly id: "secret.home.gcp";
    readonly category: "Home path";
    readonly label: "~/.gcp";
    readonly description: "Blocks home GCP credential paths.";
    readonly suffixParts: readonly [".gcp"];
}, {
    readonly id: "secret.home.gcloud-config";
    readonly category: "Home path";
    readonly label: "~/.config/gcloud";
    readonly description: "Blocks home Google Cloud SDK credential paths.";
    readonly suffixParts: readonly [".config", "gcloud"];
}, {
    readonly id: "secret.home.kube-config";
    readonly category: "Home path";
    readonly label: "~/.kube/config";
    readonly description: "Blocks home Kubernetes config files.";
    readonly suffixParts: readonly [".kube", "config"];
}, {
    readonly id: "secret.home.docker-config";
    readonly category: "Home path";
    readonly label: "~/.docker/config.json";
    readonly description: "Blocks home Docker credential config files.";
    readonly suffixParts: readonly [".docker", "config.json"];
}, {
    readonly id: "secret.home.gh-hosts";
    readonly category: "Home path";
    readonly label: "~/.config/gh/hosts.yml";
    readonly description: "Blocks GitHub CLI host credential files.";
    readonly suffixParts: readonly [".config", "gh", "hosts.yml"];
}];
export declare const SECRET_DIRECTORY_RULES: readonly [{
    readonly id: "secret.dir.secrets";
    readonly category: "Directory";
    readonly label: "secrets/";
    readonly description: "Blocks paths inside directories named secrets.";
    readonly basename: "secrets";
}];
export declare const SECRET_VARIANT_SEPARATOR_RULES: {
    id: string;
    category: string;
    label: string;
    description: string;
    prefix: "id_rsa" | "id_ed25519" | "id_ecdsa" | "credentials";
}[];
export declare const SECRET_VARIANT_DOT_SUFFIX_RULES: {
    id: string;
    category: string;
    label: string;
    description: string;
    prefix: "id_rsa" | "id_ed25519" | "id_ecdsa" | "credentials";
    suffix: ".bak" | ".backup" | ".copy" | ".disabled" | ".key" | ".old" | ".orig" | ".pem" | ".save" | ".tmp";
}[];
export declare const SECRET_BROAD_SSH_KEY_BASENAME_RULE: {
    readonly id: "secret.pattern.ssh-key-basename";
    readonly category: "Pattern";
    readonly label: "*_(rsa|dsa|ed25519|ecdsa)";
    readonly description: "Blocks extensionless SSH private key-like basenames.";
    readonly pattern: RegExp;
};
export declare const SECRET_EXTENSION_RULES: {
    id: string;
    category: string;
    label: string;
    description: string;
    extension: string;
}[];
export declare const SECRET_EXTENSION_PATTERN_RULES: readonly [{
    readonly id: "secret.ext-pattern.key";
    readonly category: "Extension pattern";
    readonly label: ".key / .keypair";
    readonly description: "Blocks key and keypair extension patterns.";
    readonly pattern: RegExp;
}, {
    readonly id: "secret.ext-pattern.keystore";
    readonly category: "Extension pattern";
    readonly label: ".keystore / .keyring";
    readonly description: "Blocks keystore and keyring extension patterns.";
    readonly pattern: RegExp;
}, {
    readonly id: "secret.ext-pattern.kdbx";
    readonly category: "Extension pattern";
    readonly label: ".kdb / .kdbx";
    readonly description: "Blocks KeePass database extension patterns.";
    readonly pattern: RegExp;
}, {
    readonly id: "secret.ext-pattern.sql";
    readonly category: "Extension pattern";
    readonly label: ".sql / .sqldump";
    readonly description: "Blocks SQL dump extension patterns.";
    readonly pattern: RegExp;
}];
export declare const SECRET_PROTECTION_RULE_METADATA: {
    id: string;
    category: string;
    label: string;
    description: string;
}[];
/** @internal */
export declare const SECRET_PROTECTION_RULE_IDS: string[];
export declare const SECRET_PROTECTION_RULE_ID_SET: Set<string>;
