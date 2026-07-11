import type * as Zod from 'zod';
declare function createSchemas(): {
    RulesConfigSchema: Zod.ZodObject<{
        $schema: Zod.ZodOptional<Zod.ZodUnknown>;
        version: Zod.ZodLiteral<1>;
        rules: Zod.ZodDefault<Zod.ZodArray<Zod.ZodString>>;
        overrides: Zod.ZodDefault<Zod.ZodRecord<Zod.ZodString, Zod.ZodUnion<readonly [Zod.ZodLiteral<"off">, Zod.ZodObject<{
            reason: Zod.ZodString;
            intent: Zod.ZodOptional<Zod.ZodEnum<{
                hard_stop: "hard_stop";
                use_alternative: "use_alternative";
                scope_down: "scope_down";
                manual_only: "manual_only";
                stop_and_explain: "stop_and_explain";
            }>>;
        }, Zod.z.core.$loose>]>>>;
        transparent_wrappers: Zod.ZodDefault<Zod.ZodArray<Zod.ZodString>>;
    }, Zod.z.core.$loose>;
    RuleOverrideSchema: Zod.ZodUnion<readonly [Zod.ZodLiteral<"off">, Zod.ZodObject<{
        reason: Zod.ZodString;
        intent: Zod.ZodOptional<Zod.ZodEnum<{
            hard_stop: "hard_stop";
            use_alternative: "use_alternative";
            scope_down: "scope_down";
            manual_only: "manual_only";
            stop_and_explain: "stop_and_explain";
        }>>;
    }, Zod.z.core.$loose>]>;
    UserPolicySchema: Zod.ZodObject<{
        version: Zod.ZodLiteral<1>;
        safety: Zod.ZodOptional<Zod.ZodObject<{
            level: Zod.ZodOptional<Zod.ZodEnum<{
                standard: "standard";
                strict: "strict";
                paranoid: "paranoid";
            }>>;
            overrides: Zod.ZodOptional<Zod.ZodObject<{
                fail_closed: Zod.ZodOptional<Zod.ZodBoolean>;
                paranoid_rm: Zod.ZodOptional<Zod.ZodBoolean>;
                paranoid_interpreters: Zod.ZodOptional<Zod.ZodBoolean>;
            }, Zod.z.core.$strict>>;
        }, Zod.z.core.$strict>>;
        workflow: Zod.ZodOptional<Zod.ZodObject<{
            worktree_mode: Zod.ZodOptional<Zod.ZodBoolean>;
        }, Zod.z.core.$strict>>;
        destructive_command_protection: Zod.ZodOptional<Zod.ZodObject<{
            enabled: Zod.ZodOptional<Zod.ZodBoolean>;
            overrides: Zod.ZodOptional<Zod.ZodRecord<Zod.ZodString, Zod.ZodLiteral<"off">>>;
        }, Zod.z.core.$strict>>;
        secret_protection: Zod.ZodOptional<Zod.ZodObject<{
            enabled: Zod.ZodOptional<Zod.ZodBoolean>;
            overrides: Zod.ZodOptional<Zod.ZodRecord<Zod.ZodString, Zod.ZodLiteral<"off">>>;
            deny_paths: Zod.ZodOptional<Zod.ZodArray<Zod.ZodString>>;
        }, Zod.z.core.$strict>>;
    }, Zod.z.core.$strict>;
};
export declare function getRulesConfigSchema(): Zod.ZodObject<{
    $schema: Zod.ZodOptional<Zod.ZodUnknown>;
    version: Zod.ZodLiteral<1>;
    rules: Zod.ZodDefault<Zod.ZodArray<Zod.ZodString>>;
    overrides: Zod.ZodDefault<Zod.ZodRecord<Zod.ZodString, Zod.ZodUnion<readonly [Zod.ZodLiteral<"off">, Zod.ZodObject<{
        reason: Zod.ZodString;
        intent: Zod.ZodOptional<Zod.ZodEnum<{
            hard_stop: "hard_stop";
            use_alternative: "use_alternative";
            scope_down: "scope_down";
            manual_only: "manual_only";
            stop_and_explain: "stop_and_explain";
        }>>;
    }, Zod.z.core.$loose>]>>>;
    transparent_wrappers: Zod.ZodDefault<Zod.ZodArray<Zod.ZodString>>;
}, Zod.z.core.$loose>;
export declare function getUserPolicySchema(): Zod.ZodObject<{
    version: Zod.ZodLiteral<1>;
    safety: Zod.ZodOptional<Zod.ZodObject<{
        level: Zod.ZodOptional<Zod.ZodEnum<{
            standard: "standard";
            strict: "strict";
            paranoid: "paranoid";
        }>>;
        overrides: Zod.ZodOptional<Zod.ZodObject<{
            fail_closed: Zod.ZodOptional<Zod.ZodBoolean>;
            paranoid_rm: Zod.ZodOptional<Zod.ZodBoolean>;
            paranoid_interpreters: Zod.ZodOptional<Zod.ZodBoolean>;
        }, Zod.z.core.$strict>>;
    }, Zod.z.core.$strict>>;
    workflow: Zod.ZodOptional<Zod.ZodObject<{
        worktree_mode: Zod.ZodOptional<Zod.ZodBoolean>;
    }, Zod.z.core.$strict>>;
    destructive_command_protection: Zod.ZodOptional<Zod.ZodObject<{
        enabled: Zod.ZodOptional<Zod.ZodBoolean>;
        overrides: Zod.ZodOptional<Zod.ZodRecord<Zod.ZodString, Zod.ZodLiteral<"off">>>;
    }, Zod.z.core.$strict>>;
    secret_protection: Zod.ZodOptional<Zod.ZodObject<{
        enabled: Zod.ZodOptional<Zod.ZodBoolean>;
        overrides: Zod.ZodOptional<Zod.ZodRecord<Zod.ZodString, Zod.ZodLiteral<"off">>>;
        deny_paths: Zod.ZodOptional<Zod.ZodArray<Zod.ZodString>>;
    }, Zod.z.core.$strict>>;
}, Zod.z.core.$strict>;
export type RulesConfig = Zod.output<ReturnType<typeof getRulesConfigSchema>>;
export type RuleOverride = Zod.output<ReturnType<typeof createSchemas>['RuleOverrideSchema']>;
export type UserPolicy = Zod.output<ReturnType<typeof getUserPolicySchema>>;
/** @internal */
export declare function getRulesConfigDiagnostics(config: unknown): string[];
/** @internal */
export declare function getRulesConfigValidation(config: unknown): {
    errors: string[];
    sources: Set<string>;
};
export declare function getUserPolicyDiagnostics(config: unknown): string[];
export {};
