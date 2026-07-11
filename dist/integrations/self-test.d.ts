interface SelfTestResult {
    command: string;
    description: string;
    expected: 'blocked' | 'allowed';
    actual: 'blocked' | 'allowed';
    passed: boolean;
    reason?: string;
}
export interface SelfTestSummary {
    passed: number;
    failed: number;
    total: number;
    results: SelfTestResult[];
}
/** @internal */
export declare function runIntegrationSelfTest(): SelfTestSummary;
export {};
