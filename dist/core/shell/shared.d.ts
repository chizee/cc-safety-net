import type { ParseEntry } from 'shell-quote';
export interface QuoteScanState {
    inSingle: boolean;
    inDouble: boolean;
    escaped: boolean;
}
export declare function advanceQuoteScanState(char: string, state: QuoteScanState): boolean;
/** @internal */
export declare function hasUnclosedQuotes(command: string): boolean;
/** @internal */
export declare function getCommandTokenText(token: ParseEntry | undefined): string | null;
