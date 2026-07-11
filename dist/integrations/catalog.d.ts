type RuntimeMetadata = {
    order: number;
    flags: readonly [string, string];
    description: string;
    legacyTopLevel: boolean;
};
declare const catalog: readonly [{
    readonly id: "antigravity-cli";
    readonly displayName: "Antigravity CLI";
    readonly doctorOrder: 2;
    readonly runtime: {
        readonly order: 1;
        readonly flags: readonly ["-ac", "--agy-cli"];
        readonly description: "Run as Antigravity CLI PreToolUse hook";
        readonly legacyTopLevel: false;
    };
    readonly install: {
        readonly order: 1;
        readonly flag: "--agy-cli";
        readonly installLabel: "Antigravity CLI";
        readonly probeCommand: readonly ["agy", "--version"];
    };
}, {
    readonly id: "claude-code";
    readonly displayName: "Claude Code";
    readonly doctorOrder: 1;
    readonly runtime: {
        readonly order: 2;
        readonly flags: readonly ["-cc", "--claude-code"];
        readonly description: "Run as Claude Code PreToolUse hook";
        readonly legacyTopLevel: true;
    };
    readonly install: {
        readonly order: 2;
        readonly flag: "--claude-code";
        readonly installLabel: "Claude Code";
        readonly probeCommand: readonly ["claude", "--version"];
    };
}, {
    readonly id: "codex";
    readonly displayName: "Codex";
    readonly doctorOrder: 3;
    readonly install: {
        readonly order: 3;
        readonly flag: "--codex";
        readonly installLabel: "Codex";
        readonly probeCommand: readonly ["codex", "--version"];
    };
}, {
    readonly id: "copilot-cli";
    readonly displayName: "Copilot CLI";
    readonly doctorOrder: 4;
    readonly runtime: {
        readonly order: 3;
        readonly flags: readonly ["-cp", "--copilot-cli"];
        readonly description: "Run as Copilot CLI PreToolUse hook";
        readonly legacyTopLevel: true;
    };
    readonly install: {
        readonly order: 5;
        readonly flag: "--copilot-cli";
        readonly installLabel: "GitHub Copilot CLI";
        readonly probeCommand: readonly ["copilot", "--binary-version"];
    };
}, {
    readonly id: "gemini-cli";
    readonly displayName: "Gemini CLI";
    readonly doctorOrder: 5;
    readonly runtime: {
        readonly order: 4;
        readonly flags: readonly ["-gc", "--gemini-cli"];
        readonly description: "Run as Gemini CLI BeforeTool hook";
        readonly legacyTopLevel: true;
    };
    readonly install: {
        readonly order: 4;
        readonly flag: "--gemini-cli";
        readonly installLabel: "Gemini CLI";
        readonly probeCommand: readonly ["gemini", "--version"];
    };
}, {
    readonly id: "kimi-code";
    readonly displayName: "Kimi Code";
    readonly doctorOrder: 6;
    readonly runtime: {
        readonly order: 5;
        readonly flags: readonly ["-kc", "--kimi-code"];
        readonly description: "Run as Kimi Code PreToolUse hook";
        readonly legacyTopLevel: false;
    };
    readonly install: {
        readonly order: 6;
        readonly flag: "--kimi-code";
        readonly installLabel: "Kimi Code";
        readonly probeCommand: readonly ["kimi", "--version"];
    };
}, {
    readonly id: "opencode";
    readonly displayName: "OpenCode";
    readonly doctorOrder: 7;
    readonly install: {
        readonly order: 7;
        readonly flag: "--opencode";
        readonly installLabel: "OpenCode";
        readonly probeCommand: readonly ["opencode", "--version"];
    };
}, {
    readonly id: "pi";
    readonly displayName: "Pi";
    readonly doctorOrder: 8;
    readonly install: {
        readonly order: 8;
        readonly flag: "--pi";
        readonly installLabel: "Pi";
        readonly probeCommand: readonly ["pi", "--version"];
    };
}];
export type IntegrationId = (typeof catalog)[number]['id'];
type RuntimeEntry = Extract<(typeof catalog)[number], {
    runtime: RuntimeMetadata;
}>;
export type RuntimeHookIntegrationId = RuntimeEntry['id'];
export declare const doctorIntegrationOrder: ("opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi")[];
export declare const runtimeHookIntegrationMetadata: {
    id: "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code";
    displayName: "Antigravity CLI" | "Claude Code" | "Copilot CLI" | "Gemini CLI" | "Kimi Code";
    flags: readonly ["-ac", "--agy-cli"] | readonly ["-cc", "--claude-code"] | readonly ["-cp", "--copilot-cli"] | readonly ["-gc", "--gemini-cli"] | readonly ["-kc", "--kimi-code"];
    description: "Run as Antigravity CLI PreToolUse hook" | "Run as Claude Code PreToolUse hook" | "Run as Copilot CLI PreToolUse hook" | "Run as Gemini CLI BeforeTool hook" | "Run as Kimi Code PreToolUse hook";
    legacyTopLevel: boolean;
}[];
export declare const installIntegrationMetadata: ({
    flag: "--agy-cli";
    installLabel: "Antigravity CLI";
    probeCommand: readonly ["agy", "--version"];
    id: "opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi";
} | {
    flag: "--claude-code";
    installLabel: "Claude Code";
    probeCommand: readonly ["claude", "--version"];
    id: "opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi";
} | {
    flag: "--codex";
    installLabel: "Codex";
    probeCommand: readonly ["codex", "--version"];
    id: "opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi";
} | {
    flag: "--copilot-cli";
    installLabel: "GitHub Copilot CLI";
    probeCommand: readonly ["copilot", "--binary-version"];
    id: "opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi";
} | {
    flag: "--gemini-cli";
    installLabel: "Gemini CLI";
    probeCommand: readonly ["gemini", "--version"];
    id: "opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi";
} | {
    flag: "--kimi-code";
    installLabel: "Kimi Code";
    probeCommand: readonly ["kimi", "--version"];
    id: "opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi";
} | {
    flag: "--opencode";
    installLabel: "OpenCode";
    probeCommand: readonly ["opencode", "--version"];
    id: "opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi";
} | {
    flag: "--pi";
    installLabel: "Pi";
    probeCommand: readonly ["pi", "--version"];
    id: "opencode" | "antigravity-cli" | "claude-code" | "copilot-cli" | "gemini-cli" | "kimi-code" | "codex" | "pi";
})[];
export declare function getIntegrationDisplayName(id: IntegrationId): string;
export declare function getIntegrationInstallLabel(id: IntegrationId): string;
export {};
