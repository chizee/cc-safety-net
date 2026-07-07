export type PowerShellToken = {
    kind: 'word';
    text: string;
    dynamic: boolean;
} | {
    kind: 'operator';
    text: ';' | '&&' | '||' | '|';
};
export declare function tokenizePowerShell(command: string): PowerShellToken[];
