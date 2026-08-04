export const REASON_STRICT_UNPARSEABLE =
  'Command could not be safely analyzed (strict mode). Simplify the command and retry, or ask the user to verify.';

export const REASON_RECURSION_LIMIT =
  'Command exceeds maximum recursion depth and cannot be safely analyzed. Flatten the nesting and retry.';

export const REASON_STRUCTURAL_COMMAND_VALIDATION_LIMIT =
  'CC Safety Net could not validate the command because its structure exceeds safe analysis limits.';

export const REASON_SAFETY_NET_FAILED_CLOSED =
  'CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.';
