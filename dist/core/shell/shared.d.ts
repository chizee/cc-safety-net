import type { ParseEntry } from 'shell-quote';
export declare const ENV_PROXY: {};
export interface QuoteScanState {
    inSingle: boolean;
    inDouble: boolean;
    escaped: boolean;
}
export declare function advanceQuoteScanState(char: string, state: QuoteScanState): boolean;
export declare function hasUnclosedQuotes(command: string): boolean;
export declare function getCommandTokenText(token: ParseEntry | undefined): string | null;
