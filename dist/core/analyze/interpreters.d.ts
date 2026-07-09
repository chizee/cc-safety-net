export declare const REASON_INTERPRETER_DANGEROUS = "Interpreter code contains a dangerous command. Run the underlying command directly so it can be analyzed, or use the safer alternative for that command.";
export declare const REASON_INTERPRETER_BLOCKED = "Interpreter one-liners are blocked in paranoid mode. Write the code to a script file and run it, or run the equivalent shell command directly. (Paranoid mode enabled.)";
export declare function extractInterpreterCodeArg(tokens: readonly string[]): string | null;
export declare function containsDangerousCode(code: string): boolean;
