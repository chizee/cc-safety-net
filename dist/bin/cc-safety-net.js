#!/usr/bin/env node
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/shell-quote/quote.js
var require_quote = __commonJS((exports, module) => {
  var OPS = [
    "||",
    "&&",
    ";;",
    "|&",
    "<(",
    "<<<",
    ">>",
    ">&",
    "<&",
    "&",
    ";",
    "(",
    ")",
    "|",
    "<",
    ">"
  ];
  var LINE_TERMINATORS = /[\n\r\u2028\u2029]/;
  var GLOB_SHELL_SPECIAL = /[\s#!"$&'():;<=>@\\^`|]/g;
  module.exports = function quote(xs) {
    return xs.map(function(s) {
      if (s === "") {
        return "''";
      }
      if (s && typeof s === "object") {
        if (s.op === "glob") {
          if (typeof s.pattern !== "string") {
            throw new TypeError("glob token requires a string `pattern`");
          }
          if (LINE_TERMINATORS.test(s.pattern)) {
            throw new TypeError("glob `pattern` must not contain line terminators");
          }
          return s.pattern.replace(GLOB_SHELL_SPECIAL, "\\$&");
        }
        if (typeof s.op === "string") {
          if (OPS.indexOf(s.op) < 0) {
            throw new TypeError("invalid `op` value: " + JSON.stringify(s.op));
          }
          return s.op.replace(/[\s\S]/g, "\\$&");
        }
        if (typeof s.comment === "string") {
          if (LINE_TERMINATORS.test(s.comment)) {
            throw new TypeError("`comment` must not contain line terminators");
          }
          return "#" + s.comment;
        }
        throw new TypeError("unrecognized object token shape");
      }
      if (/["\s\\]/.test(s) && !/'/.test(s)) {
        return "'" + s.replace(/(['])/g, "\\$1") + "'";
      }
      if (/["'\s]/.test(s)) {
        return '"' + s.replace(/(["\\$`!])/g, "\\$1") + '"';
      }
      return String(s).replace(/([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}])/g, "$1\\$2");
    }).join(" ");
  };
});

// node_modules/shell-quote/parse.js
var require_parse = __commonJS((exports, module) => {
  var CONTROL = "(?:" + [
    "\\|\\|",
    "\\&\\&",
    ";;",
    "\\|\\&",
    "\\<\\(",
    "\\<\\<\\<",
    ">>",
    ">\\&",
    "<\\&",
    "[&;()|<>]"
  ].join("|") + ")";
  var controlRE = new RegExp("^" + CONTROL + "$");
  var META = "|&;()<> \\t";
  var SINGLE_QUOTE = '"((\\\\"|[^"])*?)"';
  var DOUBLE_QUOTE = "'((\\\\'|[^'])*?)'";
  var hash = /^#$/;
  var SQ = "'";
  var DQ = '"';
  var DS = "$";
  var TOKEN = "";
  var mult = 4294967296;
  for (i = 0;i < 4; i++) {
    TOKEN += (mult * Math.random()).toString(16);
  }
  var i;
  var startsWithToken = new RegExp("^" + TOKEN);
  function matchAll(s, r) {
    var origIndex = r.lastIndex;
    var matches = [];
    var matchObj;
    while (matchObj = r.exec(s)) {
      matches.push(matchObj);
      if (r.lastIndex === matchObj.index) {
        r.lastIndex += 1;
      }
    }
    r.lastIndex = origIndex;
    return matches;
  }
  function getVar(env, pre, key) {
    var r = typeof env === "function" ? env(key) : env[key];
    if (typeof r === "undefined" && key != "") {
      r = "";
    } else if (typeof r === "undefined") {
      r = "$";
    }
    if (typeof r === "object") {
      return pre + TOKEN + JSON.stringify(r) + TOKEN;
    }
    return pre + r;
  }
  function parseInternal(string, env, opts) {
    if (!opts) {
      opts = {};
    }
    var BS = opts.escape || "\\";
    var BAREWORD = "(\\" + BS + `['"` + META + `]|[^\\s'"` + META + "])+";
    var chunker = new RegExp([
      "(" + CONTROL + ")",
      "(" + BAREWORD + "|" + SINGLE_QUOTE + "|" + DOUBLE_QUOTE + ")+"
    ].join("|"), "g");
    var matches = matchAll(string, chunker);
    if (matches.length === 0) {
      return [];
    }
    if (!env) {
      env = {};
    }
    var commented = false;
    return matches.map(function(match) {
      var s = match[0];
      if (!s || commented) {
        return;
      }
      if (controlRE.test(s)) {
        return { op: s };
      }
      var quote = false;
      var esc = false;
      var out = "";
      var isGlob = false;
      var i2;
      function parseEnvVar() {
        i2 += 1;
        var varend;
        var varname;
        var char = s.charAt(i2);
        if (char === "{") {
          i2 += 1;
          if (s.charAt(i2) === "}") {
            throw new Error("Bad substitution: " + s.slice(i2 - 2, i2 + 1));
          }
          varend = s.indexOf("}", i2);
          if (varend < 0) {
            throw new Error("Bad substitution: " + s.slice(i2));
          }
          varname = s.slice(i2, varend);
          i2 = varend;
        } else if (/[*@#?$!_-]/.test(char)) {
          varname = char;
          i2 += 1;
        } else {
          var slicedFromI = s.slice(i2);
          varend = slicedFromI.match(/[^\w\d_]/);
          if (!varend) {
            varname = slicedFromI;
            i2 = s.length;
          } else {
            varname = slicedFromI.slice(0, varend.index);
            i2 += varend.index - 1;
          }
        }
        return getVar(env, "", varname);
      }
      for (i2 = 0;i2 < s.length; i2++) {
        var c = s.charAt(i2);
        isGlob = isGlob || !quote && (c === "*" || c === "?");
        if (esc) {
          out += c;
          esc = false;
        } else if (quote) {
          if (c === quote) {
            quote = false;
          } else if (quote == SQ) {
            out += c;
          } else {
            if (c === BS) {
              i2 += 1;
              c = s.charAt(i2);
              if (c === DQ || c === BS || c === DS) {
                out += c;
              } else {
                out += BS + c;
              }
            } else if (c === DS) {
              out += parseEnvVar();
            } else {
              out += c;
            }
          }
        } else if (c === DQ || c === SQ) {
          quote = c;
        } else if (controlRE.test(c)) {
          return { op: s };
        } else if (hash.test(c)) {
          commented = true;
          var commentObj = { comment: string.slice(match.index + i2 + 1) };
          if (out.length) {
            return [out, commentObj];
          }
          return [commentObj];
        } else if (c === BS) {
          esc = true;
        } else if (c === DS) {
          out += parseEnvVar();
        } else {
          out += c;
        }
      }
      if (isGlob) {
        return { op: "glob", pattern: out };
      }
      return out;
    }).reduce(function(prev, arg) {
      return typeof arg === "undefined" ? prev : prev.concat(arg);
    }, []);
  }
  module.exports = function parse(s, env, opts) {
    var mapped = parseInternal(s, env, opts);
    if (typeof env !== "function") {
      return mapped;
    }
    return mapped.reduce(function(acc, s2) {
      if (typeof s2 === "object") {
        return acc.concat(s2);
      }
      var xs = s2.split(RegExp("(" + TOKEN + ".*?" + TOKEN + ")", "g"));
      if (xs.length === 1) {
        return acc.concat(xs[0]);
      }
      return acc.concat(xs.filter(Boolean).map(function(x) {
        if (startsWithToken.test(x)) {
          return JSON.parse(x.split(TOKEN)[1]);
        }
        return x;
      }));
    }, []);
  };
});

// src/bin/audit-log.ts
import { basename, dirname, resolve } from "node:path";

// src/core/audit.ts
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { isAbsolute, join } from "node:path";
function sanitizeSessionIdForFilename(sessionId) {
  const raw = sessionId.trim();
  if (!raw) {
    return null;
  }
  let safe = raw.replace(/[^A-Za-z0-9_.-]+/g, "_");
  safe = safe.replace(/^[._-]+|[._-]+$/g, "").slice(0, 128);
  if (!safe || safe === "." || safe === "..") {
    return null;
  }
  return safe;
}
function encodeCwdForLogDirname(cwd) {
  const encoded = (cwd ?? "").replace(/[^A-Za-z0-9]/g, "-").slice(0, 180);
  return encoded || "no-cwd";
}
function writeAuditLog(sessionId, command, segment, reason, cwd, options = {}) {
  const safeSessionId = sanitizeSessionIdForFilename(sessionId);
  if (!safeSessionId) {
    return;
  }
  const home = options.homeDir ?? getAuditLogHomeDir();
  if (!home) {
    return;
  }
  const logsDir = getAuditLogsDir(home);
  if (!logsDir) {
    return;
  }
  try {
    const ts = new Date().toISOString();
    const sessionDir = join(logsDir, encodeCwdForLogDirname(cwd), ts.slice(0, 7));
    mkdirSync(sessionDir, { recursive: true, mode: 448 });
    const logFile = join(sessionDir, `${ts.slice(0, 10)}-${safeSessionId}.jsonl`);
    const entry = {
      ts,
      sessionId: safeSessionId,
      decision: options.decision ?? "deny",
      agent: options.agent,
      command: redactSecrets(command).slice(0, 300),
      segment: redactSecrets(segment).slice(0, 300),
      reason,
      ruleId: options.ruleId,
      intent: options.intent,
      cwd
    };
    appendFileSync(logFile, `${JSON.stringify(entry)}
`, { encoding: "utf-8", mode: 384 });
  } catch {}
}
function getAuditLogHomeDir(homeFromEnv = process.env.CC_SAFETY_NET_AUDIT_HOME || process.env.HOME) {
  const home = homeFromEnv || homedir() || userInfo().homedir;
  return home && isAbsolute(home) ? home : null;
}
function getAuditLogsDir(homeDir = getAuditLogHomeDir()) {
  return homeDir ? join(homeDir, ".cc-safety-net", "logs") : null;
}
var PROVIDER_TOKENS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[abeprs]-[A-Za-z0-9-]{20,}\b/g,
  /\bnpm_[A-Za-z0-9_]{20,}\b/g,
  /\bpypi-[A-Za-z0-9_-]{20,}\b/g,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk_[A-Za-z0-9]{20,}\b/g,
  /\bgsk_[A-Za-z0-9]{52,}\b/g,
  /\bxai-[A-Za-z0-9_-]{80,}\b/g,
  /\bpplx-[A-Za-z0-9_-]{20,}\b/g,
  /\bbastn_[A-Za-z0-9]{16,}\b/g,
  /\btgp_v1_[A-Za-z0-9_-]{43,}\b/g,
  /\bflp_[A-Za-z0-9]{10,}\b/g,
  /\bwfr_[A-Za-z0-9]{20,}\b/g,
  /\bfwp?_[A-Za-z0-9_-]{20,}\b/g,
  /\btp-[A-Za-z0-9_-]{20,}\b/g,
  /\bpsk-[A-Za-z0-9_-]{8,}-[A-Za-z0-9_-]{8,}\b/g,
  /\b[a-f0-9]{32}\.[A-Za-z0-9]{16}\b/g
];
function redactSecrets(text) {
  let result = text;
  result = result.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "<redacted>");
  result = result.replace(/\b((?:DATABASE|POSTGRES|POSTGRESQL|MYSQL|MARIADB|REDIS|MONGO(?:DB)?|DB)_DSN|CONNECTION_STRING)=("[^"]*"|'[^']*'|[^\s]+(?:\s+[A-Z_][A-Z0-9_]*=[^\s]+)*)/gi, "$1=<redacted>");
  result = result.replace(/\b((?:DATABASE|POSTGRES|POSTGRESQL|MYSQL|MARIADB|REDIS|MONGO(?:DB)?|DB)_(?:URL|URI|CONNECTION_STRING))=("[^"]*"|'[^']*'|[^\s]+)/gi, "$1=<redacted>");
  result = result.replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIALS)[A-Z0-9_]*)=("[^"]*"|'[^']*'|[^\s]+)/gi, "$1=<redacted>");
  result = result.replace(/(['"]?\s*(?:authorization|cookie|x-api-key|api-key)\s*:\s*)([^'"\r\n]+)(['"]?)/gi, "$1<redacted>$3");
  result = result.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s@/]+)@/gi, "$1<redacted>:<redacted>@");
  result = result.replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+)@/gi, "$1<redacted>@");
  result = result.replace(/(^|\s)((?:-u|--user)(?:\s+|=))([^\s:]+):([^\s]+)/g, "$1$2<redacted>:<redacted>");
  for (const re of PROVIDER_TOKENS) {
    result = result.replace(re, "<redacted>");
  }
  result = result.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, "<redacted>");
  result = result.replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "<redacted>");
  return result;
}

// src/core/audit-scan.ts
import { readdirSync, readFileSync } from "node:fs";
import { join as join2 } from "node:path";
function listAuditLogFiles(logsDir) {
  try {
    return readdirSync(logsDir, { withFileTypes: true, encoding: "utf8" }).flatMap((entry) => {
      const filePath = join2(logsDir, entry.name);
      if (entry.isDirectory())
        return listAuditLogFiles(filePath);
      if (entry.name.endsWith(".jsonl"))
        return [filePath];
      return [];
    });
  } catch {
    return [];
  }
}
function readAuditLogEntries(filePath) {
  try {
    return readFileSync(filePath, "utf-8").split(`
`).filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

// src/bin/audit-log.ts
function parseLogsFlags(args) {
  const flags = {
    limit: 20,
    since: 30,
    all: false,
    json: false
  };
  for (let index = 0;index < args.length; index++) {
    const arg = args[index];
    if (arg === "--all") {
      flags.all = true;
      continue;
    }
    if (arg === "--json") {
      flags.json = true;
      continue;
    }
    if (arg === "--limit") {
      const limit = parsePositiveNumber(args[index + 1]);
      if (limit === null) {
        console.error("--limit must be a positive number");
        return null;
      }
      flags.limit = limit;
      index++;
      continue;
    }
    if (arg === "--since") {
      const since = parsePositiveNumber(args[index + 1]);
      if (since === null) {
        console.error("--since must be a positive number");
        return null;
      }
      flags.since = since;
      index++;
      continue;
    }
    if (arg === "--agent") {
      const value = parseStringValue(args[index + 1], "--agent");
      if (value === null)
        return null;
      flags.agent = value;
      index++;
      continue;
    }
    if (arg === "--rule") {
      const value = parseStringValue(args[index + 1], "--rule");
      if (value === null)
        return null;
      flags.rule = value;
      index++;
      continue;
    }
    if (arg === "--session") {
      const value = parseStringValue(args[index + 1], "--session");
      if (value === null)
        return null;
      flags.session = value;
      index++;
      continue;
    }
    if (arg === "--project") {
      const value = parseStringValue(args[index + 1], "--project");
      if (value === null)
        return null;
      flags.project = resolve(value);
      index++;
      continue;
    }
    console.error(`Unknown option: ${arg}`);
    return null;
  }
  return flags;
}
async function runLogsCommand(args, options = {}) {
  const flags = parseLogsFlags(args);
  if (!flags)
    return 1;
  const logsDir = options.logsDir ?? getAuditLogsDir();
  if (!logsDir) {
    console.log(flags.json ? "[]" : "No audit log entries found.");
    return 0;
  }
  const cutoff = Date.now() - flags.since * 24 * 60 * 60 * 1000;
  const entries = listAuditLogFiles(logsDir).flatMap((file) => readAuditLogEntries(file).map((entry) => ({ entry, file }))).filter((item) => matchesLogsFlags(item, flags, logsDir, cutoff)).sort((left, right) => Date.parse(right.entry.ts) - Date.parse(left.entry.ts)).slice(0, flags.limit);
  if (flags.json) {
    console.log(JSON.stringify(entries.map((item) => item.entry)));
    return 0;
  }
  if (entries.length === 0) {
    console.log("No audit log entries found.");
    return 0;
  }
  for (const item of entries) {
    console.log(formatLogEntry(item.entry));
  }
  return 0;
}
function matchesLogsFlags(item, flags, logsDir, cutoff) {
  if (!flags.all && item.entry.decision === "allow")
    return false;
  if (Date.parse(item.entry.ts) < cutoff)
    return false;
  if (flags.agent !== undefined && item.entry.agent !== flags.agent)
    return false;
  if (flags.rule !== undefined && item.entry.ruleId !== flags.rule)
    return false;
  if (flags.session !== undefined && !matchesSession(item, logsDir, flags.session))
    return false;
  if (flags.project !== undefined && !matchesProject(item.entry.cwd, flags.project))
    return false;
  return true;
}
function matchesSession(item, logsDir, session) {
  if (item.entry.sessionId === session)
    return true;
  return dirname(item.file) === logsDir && basename(item.file, ".jsonl") === session;
}
function matchesProject(cwd, project) {
  if (!cwd)
    return false;
  return cwd === project || cwd.startsWith(`${project}/`);
}
function formatLogEntry(entry) {
  const decision = renderTerminalText(entry.decision ?? "deny");
  const cwd = entry.cwd ? `  [${renderTerminalText(entry.cwd)}]` : "";
  return `${renderTerminalText(entry.ts.slice(0, 19))}Z  ${decision.padEnd(5)}  ${renderTerminalText(entry.agent ?? "-").padEnd(15)}  ${renderTerminalText(entry.ruleId ?? "-").padEnd(20)}  ${renderTerminalText(entry.command)}${cwd}`;
}
function renderTerminalText(value) {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    if (code <= 31 || code >= 127 && code <= 159) {
      return `\\x${code.toString(16).padStart(2, "0")}`;
    }
    return character;
  }).join("");
}
function parsePositiveNumber(value) {
  if (value === undefined)
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function parseStringValue(value, flag) {
  if (value === undefined || value.startsWith("-")) {
    console.error(`${flag} requires a value`);
    return null;
  }
  return value;
}

// src/bin/commands/doctor.ts
var doctorCommand = {
  name: "doctor",
  aliases: ["--doctor"],
  description: "Run diagnostic checks to verify installation and configuration",
  usage: "doctor [options]",
  options: [
    {
      flags: "--json",
      description: "Output diagnostics as JSON"
    },
    {
      flags: "--skip-update-check",
      description: "Skip npm registry version check"
    },
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: [
    "cc-safety-net doctor",
    "cc-safety-net doctor --json",
    "cc-safety-net doctor --skip-update-check"
  ]
};

// src/bin/commands/explain.ts
var explainCommand = {
  name: "explain",
  description: "Show step-by-step analysis trace of how a command would be analyzed",
  usage: "explain [options] <command>",
  argument: "<command>",
  options: [
    {
      flags: "--json",
      description: "Output analysis as JSON"
    },
    {
      flags: "--cwd",
      argument: "<path>",
      description: "Use custom working directory"
    },
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: [
    'cc-safety-net explain "git reset --hard"',
    'cc-safety-net explain --json "rm -rf /"',
    'cc-safety-net explain --cwd /tmp "git status"'
  ]
};

// src/bin/commands/gui.ts
var guiCommand = {
  name: "gui",
  description: "Open the local policy editor GUI",
  usage: "gui [options]",
  options: [
    { flags: "--no-open", description: "Print the URL without opening a browser" },
    { flags: "-h, --help", description: "Show this help" }
  ],
  examples: ["cc-safety-net gui", "cc-safety-net gui --no-open"]
};

// src/bin/hook/antigravity-cli.ts
import { isAbsolute as isAbsolute12, relative as relative4 } from "node:path";

// src/core/destructive-command-rules.ts
var DESTRUCTIVE_COMMAND_RULE_IDS = [
  "git.ssh-env",
  "git.alias-config",
  "git.checkout-force",
  "git.checkout-double-dash",
  "git.checkout-ref-path",
  "git.checkout-pathspec-from-file",
  "git.checkout-ambiguous",
  "git.switch-discard-changes",
  "git.switch-force",
  "git.restore-worktree",
  "git.restore-unstaged",
  "git.reset-hard",
  "git.reset-merge",
  "git.clean-force",
  "git.push-force",
  "git.push-delete",
  "git.push-mirror",
  "git.branch-force-delete",
  "git.rebase-abort",
  "git.merge-abort",
  "git.tag-delete",
  "git.reflog-delete",
  "git.stash-drop",
  "git.stash-clear",
  "git.worktree-remove-force",
  "rm.recursive-force-root-or-home",
  "rm.recursive-force-dynamic-target",
  "rm.recursive-force-home-cwd",
  "rm.recursive-force-cwd-self",
  "rm.recursive-force-outside-cwd",
  "rm.recursive-force-paranoid",
  "powershell.remove-item-root-or-home",
  "powershell.remove-item-recursive-force-root-or-home",
  "powershell.remove-item-recursive-force-dynamic-target",
  "powershell.remove-item-recursive-force-home-cwd",
  "powershell.remove-item-recursive-force-cwd-self",
  "powershell.remove-item-recursive-force-outside-cwd",
  "powershell.remove-item-recursive-force-paranoid",
  "powershell.remove-item-pipeline-dynamic-target",
  "find.delete",
  "find.exec-rm-recursive-force",
  "interpreter.dangerous-command",
  "interpreter.one-liner-paranoid",
  "awk.system-dynamic",
  "xargs.rm-recursive-force-dynamic",
  "xargs.shell-dynamic",
  "parallel.rm-recursive-force-dynamic",
  "parallel.shell-dynamic",
  "parallel.command-stream-dynamic",
  "shell.dynamic-executable",
  "raw-text.dangerous-command"
];
var DESTRUCTIVE_COMMAND_RULE_ID_SET = new Set(DESTRUCTIVE_COMMAND_RULE_IDS);
var DESTRUCTIVE_COMMAND_RULE_METADATA = [
  {
    id: "git.ssh-env",
    category: "Git",
    label: "Git SSH environment override",
    description: "Blocks Git network operations with SSH environment overrides.",
    intent: "manual_only"
  },
  {
    id: "git.alias-config",
    category: "Git",
    label: "Git command-line alias",
    description: "Blocks command-line Git aliases that cannot be safely resolved.",
    intent: "manual_only"
  },
  {
    id: "git.checkout-force",
    category: "Git",
    label: "Git checkout force",
    description: "Blocks forced checkout operations that discard local changes.",
    intent: "use_alternative"
  },
  {
    id: "git.checkout-double-dash",
    category: "Git",
    label: "Git checkout path restore",
    description: "Blocks checkout path restores after --.",
    intent: "use_alternative"
  },
  {
    id: "git.checkout-ref-path",
    category: "Git",
    label: "Git checkout ref and path",
    description: "Blocks checkout forms that mix a ref and path restore.",
    intent: "use_alternative"
  },
  {
    id: "git.checkout-pathspec-from-file",
    category: "Git",
    label: "Git checkout pathspec file",
    description: "Blocks checkout pathspec loading from a file.",
    intent: "use_alternative"
  },
  {
    id: "git.checkout-ambiguous",
    category: "Git",
    label: "Git checkout ambiguous targets",
    description: "Blocks ambiguous checkout arguments that may restore paths.",
    intent: "use_alternative"
  },
  {
    id: "git.switch-discard-changes",
    category: "Git",
    label: "Git switch discard changes",
    description: "Blocks branch switches that explicitly discard local changes.",
    intent: "use_alternative"
  },
  {
    id: "git.switch-force",
    category: "Git",
    label: "Git switch force",
    description: "Blocks forced branch switches.",
    intent: "use_alternative"
  },
  {
    id: "git.restore-worktree",
    category: "Git",
    label: "Git restore worktree",
    description: "Blocks worktree restore operations.",
    intent: "use_alternative"
  },
  {
    id: "git.restore-unstaged",
    category: "Git",
    label: "Git restore unstaged",
    description: "Blocks unstaged restore operations.",
    intent: "use_alternative"
  },
  {
    id: "git.reset-hard",
    category: "Git",
    label: "Git reset hard",
    description: "Blocks hard resets.",
    intent: "use_alternative"
  },
  {
    id: "git.reset-merge",
    category: "Git",
    label: "Git reset merge",
    description: "Blocks merge resets.",
    intent: "use_alternative"
  },
  {
    id: "git.clean-force",
    category: "Git",
    label: "Git clean force",
    description: "Blocks forced clean operations.",
    intent: "use_alternative"
  },
  {
    id: "git.push-force",
    category: "Git",
    label: "Git push force",
    description: "Blocks force pushes.",
    intent: "use_alternative"
  },
  {
    id: "git.push-delete",
    category: "Git",
    label: "Git push delete",
    description: "Blocks remote ref deletion through push.",
    intent: "manual_only"
  },
  {
    id: "git.push-mirror",
    category: "Git",
    label: "Git push mirror",
    description: "Blocks mirror pushes that can force-update or delete remote refs.",
    intent: "manual_only"
  },
  {
    id: "git.branch-force-delete",
    category: "Git",
    label: "Git branch force delete",
    description: "Blocks forced branch deletion.",
    intent: "use_alternative"
  },
  {
    id: "git.rebase-abort",
    category: "Git",
    label: "Git rebase abort",
    description: "Blocks rebase abort operations.",
    intent: "use_alternative"
  },
  {
    id: "git.merge-abort",
    category: "Git",
    label: "Git merge abort",
    description: "Blocks merge abort operations.",
    intent: "use_alternative"
  },
  {
    id: "git.tag-delete",
    category: "Git",
    label: "Git tag delete",
    description: "Blocks tag deletion.",
    intent: "manual_only"
  },
  {
    id: "git.reflog-delete",
    category: "Git",
    label: "Git reflog delete",
    description: "Blocks reflog deletion.",
    intent: "manual_only"
  },
  {
    id: "git.stash-drop",
    category: "Git",
    label: "Git stash drop",
    description: "Blocks dropping stash entries.",
    intent: "use_alternative"
  },
  {
    id: "git.stash-clear",
    category: "Git",
    label: "Git stash clear",
    description: "Blocks clearing all stash entries.",
    intent: "manual_only"
  },
  {
    id: "git.worktree-remove-force",
    category: "Git",
    label: "Git worktree force remove",
    description: "Blocks forced worktree removal.",
    intent: "use_alternative"
  },
  {
    id: "rm.recursive-force-root-or-home",
    category: "Filesystem",
    label: "rm -rf root or home",
    description: "Blocks recursive forced removal of root or home paths.",
    intent: "hard_stop"
  },
  {
    id: "rm.recursive-force-dynamic-target",
    category: "Filesystem",
    label: "rm -rf dynamic target",
    description: "Blocks recursive forced removal with dynamic targets.",
    intent: "scope_down"
  },
  {
    id: "rm.recursive-force-home-cwd",
    category: "Filesystem",
    label: "rm -rf from home cwd",
    description: "Blocks recursive forced removal while working in home.",
    intent: "scope_down"
  },
  {
    id: "rm.recursive-force-cwd-self",
    category: "Filesystem",
    label: "rm -rf current directory",
    description: "Blocks recursive forced removal of the current directory.",
    intent: "scope_down"
  },
  {
    id: "rm.recursive-force-outside-cwd",
    category: "Filesystem",
    label: "rm -rf outside cwd",
    description: "Blocks recursive forced removal outside the original cwd.",
    intent: "scope_down"
  },
  {
    id: "rm.recursive-force-paranoid",
    category: "Filesystem",
    label: "rm -rf paranoid mode",
    description: "Blocks non-temp recursive forced removal when paranoid rm is enabled.",
    intent: "scope_down"
  },
  {
    id: "powershell.remove-item-root-or-home",
    category: "PowerShell",
    label: "Remove-Item root or home",
    description: "Blocks PowerShell Remove-Item targeting root or home paths.",
    intent: "hard_stop"
  },
  {
    id: "powershell.remove-item-recursive-force-root-or-home",
    category: "PowerShell",
    label: "Remove-Item recursive force root or home",
    description: "Blocks recursive forced PowerShell removal of root or home paths.",
    intent: "hard_stop"
  },
  {
    id: "powershell.remove-item-recursive-force-dynamic-target",
    category: "PowerShell",
    label: "Remove-Item recursive force dynamic target",
    description: "Blocks recursive forced PowerShell removal with dynamic targets.",
    intent: "scope_down"
  },
  {
    id: "powershell.remove-item-recursive-force-home-cwd",
    category: "PowerShell",
    label: "Remove-Item recursive force from home cwd",
    description: "Blocks recursive forced PowerShell removal while working in home.",
    intent: "scope_down"
  },
  {
    id: "powershell.remove-item-recursive-force-cwd-self",
    category: "PowerShell",
    label: "Remove-Item recursive force current directory",
    description: "Blocks recursive forced PowerShell removal of the current directory.",
    intent: "scope_down"
  },
  {
    id: "powershell.remove-item-recursive-force-outside-cwd",
    category: "PowerShell",
    label: "Remove-Item recursive force outside cwd",
    description: "Blocks recursive forced PowerShell removal outside the original cwd.",
    intent: "scope_down"
  },
  {
    id: "powershell.remove-item-recursive-force-paranoid",
    category: "PowerShell",
    label: "Remove-Item recursive force paranoid mode",
    description: "Blocks non-temp recursive forced PowerShell removal when paranoid rm is enabled.",
    intent: "scope_down"
  },
  {
    id: "powershell.remove-item-pipeline-dynamic-target",
    category: "PowerShell",
    label: "Remove-Item pipeline dynamic target",
    description: "Blocks PowerShell Remove-Item with unverifiable pipeline input.",
    intent: "scope_down"
  },
  {
    id: "find.delete",
    category: "Filesystem",
    label: "find delete",
    description: "Blocks find -delete operations.",
    intent: "scope_down"
  },
  {
    id: "find.exec-rm-recursive-force",
    category: "Filesystem",
    label: "find exec rm -rf",
    description: "Blocks find -exec rm -rf operations.",
    intent: "scope_down"
  },
  {
    id: "interpreter.dangerous-command",
    category: "Execution",
    label: "Interpreter dangerous command",
    description: "Blocks interpreter one-liners containing dangerous commands.",
    intent: "use_alternative"
  },
  {
    id: "interpreter.one-liner-paranoid",
    category: "Execution",
    label: "Interpreter one-liner paranoid mode",
    description: "Blocks interpreter one-liners when paranoid interpreters is enabled.",
    intent: "use_alternative"
  },
  {
    id: "awk.system-dynamic",
    category: "Execution",
    label: "Awk dynamic system call",
    description: "Blocks awk system calls that cannot be safely analyzed.",
    intent: "stop_and_explain"
  },
  {
    id: "xargs.rm-recursive-force-dynamic",
    category: "Execution",
    label: "xargs dynamic rm -rf",
    description: "Blocks xargs rm -rf with dynamic input.",
    intent: "scope_down"
  },
  {
    id: "xargs.shell-dynamic",
    category: "Execution",
    label: "xargs dynamic shell",
    description: "Blocks xargs shell execution with dynamic input.",
    intent: "scope_down"
  },
  {
    id: "parallel.rm-recursive-force-dynamic",
    category: "Execution",
    label: "parallel dynamic rm -rf",
    description: "Blocks parallel rm -rf with dynamic input.",
    intent: "scope_down"
  },
  {
    id: "parallel.shell-dynamic",
    category: "Execution",
    label: "parallel dynamic shell",
    description: "Blocks parallel shell execution with dynamic input.",
    intent: "scope_down"
  },
  {
    id: "parallel.command-stream-dynamic",
    category: "Execution",
    label: "parallel dynamic command stream",
    description: "Blocks parallel command streams from dynamic input.",
    intent: "scope_down"
  },
  {
    id: "shell.dynamic-executable",
    category: "Execution",
    label: "Dynamic executable name",
    description: "Blocks executable names assembled from command substitution output.",
    intent: "manual_only"
  },
  {
    id: "raw-text.dangerous-command",
    category: "Execution",
    label: "Raw text dangerous command",
    description: "Blocks dangerous commands detected in raw command text.",
    intent: "stop_and_explain"
  }
];
var DESTRUCTIVE_COMMAND_RULE_INTENTS = new Map(DESTRUCTIVE_COMMAND_RULE_METADATA.map((rule) => [rule.id, rule.intent]));
function destructiveCommandMatch(id, reason, intent) {
  return {
    id,
    reason,
    intent: intent ?? DESTRUCTIVE_COMMAND_RULE_INTENTS.get(id) ?? "manual_only"
  };
}
function filterDestructiveCommandMatch(match, config) {
  if (!match)
    return null;
  if (config?.destructiveCommandProtectionEnabled === false)
    return null;
  return config?.disabledDestructiveCommandRules?.has(match.id) ? null : match;
}

// src/core/analyze/dangerous-text.ts
function dangerousInText(text) {
  return dangerousInTextMatch(text)?.reason ?? null;
}
function dangerousInTextMatch(text) {
  const t = text.toLowerCase();
  const stripped = t.trimStart();
  const isEchoOrRg = stripped.startsWith("echo ") || stripped.startsWith("rg ");
  const patterns = [
    {
      regex: /(^|[^\w])\\?r\\?m\s+(-[^\s]*r[^\s]*\s+-[^\s]*f|-[^\s]*f[^\s]*\s+-[^\s]*r|-[^\s]*rf|-[^\s]*fr|(?=[^\n;&|]*--recursive\b)(?=[^\n;&|]*--force\b)[^\n;&|]*)\b/,
      label: "rm -rf"
    },
    {
      regex: /\bgit\s+reset\s+--ha(?:r(?:d)?)?\b/,
      label: "git reset --hard"
    },
    {
      regex: /\bgit\s+reset\s+--me(?:r(?:g(?:e)?)?)?\b/,
      label: "git reset --merge"
    },
    {
      regex: /\bgit\s+clean\s+(-[^\s]*f[^\s]*|--fo(?:r(?:c(?:e)?)?)?)\b/,
      label: "git clean -f"
    },
    {
      regex: /\bgit\s+checkout\s+[^|;]*(--fo(?:r(?:c(?:e)?)?)?\b|-(?![bBU])[^\s]*f[^\s]*\b)/,
      label: "git checkout --force"
    },
    {
      regex: /\bgit\s+push\s+[^|;]*(-f\b|--fo(?:r(?:c(?:e)?)?)?\b)(?!-with-lease)/,
      label: "git push --force"
    },
    {
      regex: /\bgit\s+push\b[^\n;|&]*(?:\s\+[^\s;|&]+|[^\s;|&]*:\+[^\s;|&]*)/,
      label: "git push --force"
    },
    {
      regex: /\bgit\s+push\b[^\n;|&]*(?:--de(?:l(?:e(?:t(?:e)?)?)?)?\b|\s:[^\s;|&]+)/,
      label: "git push delete"
    },
    {
      regex: /\bgit\s+branch\b(?=[^\n;|&]*(?:-D\b|-[A-Za-z]*D[A-Za-z]*\b|--de(?:l(?:e(?:t(?:e)?)?)?)?\b|-[A-Za-z]*d[A-Za-z]*\b))(?=[^\n;|&]*(?:-D\b|-[A-Za-z]*D[A-Za-z]*\b|--fo(?:r(?:c(?:e)?)?)?\b|-[A-Za-z]*f[A-Za-z]*\b))/,
      label: "git branch -D",
      caseSensitive: true
    },
    {
      regex: /\bgit\s+tag\s+[^|;]*(-[^\s]*d[^\s]*|--de(?:l(?:e(?:t(?:e)?)?)?)?)\b/,
      label: "git tag -d"
    },
    {
      regex: /\bgit\s+stash\s+(drop|clear)\b/,
      label: "git stash drop/clear"
    },
    {
      regex: /\bgit\s+checkout\s+--\s/,
      label: "git checkout --"
    },
    {
      regex: /\bgit\s+restore\b(?!.*--(staged|help))/,
      label: "git restore without --staged"
    },
    {
      regex: /\bfind\b[^\n;|&]*\s-delete\b/,
      label: "find -delete",
      skipForEchoRg: true
    }
  ];
  for (const { regex, label, skipForEchoRg, caseSensitive } of patterns) {
    if (skipForEchoRg && isEchoOrRg)
      continue;
    const target = caseSensitive ? text : t;
    if (regex.test(target)) {
      return destructiveCommandMatch("raw-text.dangerous-command", `Unparseable command text contains a destructive pattern (${label}). Rewrite as a plain, parseable command so it can be analyzed.`);
    }
  }
  return null;
}

// src/core/analyze/powershell/tokenize.ts
function tokenizePowerShell(command) {
  const tokens = [];
  let text = "";
  let dynamic = false;
  const pushWord = () => {
    if (!text)
      return;
    tokens.push({
      kind: "word",
      text,
      dynamic: dynamic || isDynamicText(text)
    });
    text = "";
    dynamic = false;
  };
  let i = 0;
  while (i < command.length) {
    const char = command[i];
    if (!char)
      break;
    if (/\s/.test(char)) {
      pushWord();
      if (char === `
`) {
        tokens.push({ kind: "operator", text: ";" });
      }
      i++;
      continue;
    }
    if (char === ";") {
      pushWord();
      tokens.push({ kind: "operator", text: ";" });
      i++;
      continue;
    }
    if (char === ",") {
      pushWord();
      tokens.push({ kind: "word", text: ",", dynamic: false });
      i++;
      continue;
    }
    if ((char === "{" || char === "}") && !isPathLikeWord(text)) {
      pushWord();
      tokens.push({ kind: "operator", text: ";" });
      i++;
      continue;
    }
    if (char === "&" && command[i + 1] === "&") {
      pushWord();
      tokens.push({ kind: "operator", text: "&&" });
      i += 2;
      continue;
    }
    if (char === "|" && command[i + 1] === "|") {
      pushWord();
      tokens.push({ kind: "operator", text: "||" });
      i += 2;
      continue;
    }
    if (char === "|") {
      pushWord();
      tokens.push({ kind: "operator", text: "|" });
      i++;
      continue;
    }
    if (char === "'") {
      const result = readSingleQuoted(command, i + 1);
      text += result.text;
      i = result.nextIndex;
      continue;
    }
    if (char === '"') {
      const result = readDoubleQuoted(command, i + 1);
      text += result.text;
      dynamic = dynamic || result.dynamic;
      i = result.nextIndex;
      continue;
    }
    if (char === "`") {
      const next = command[i + 1];
      if (!next) {
        i++;
        continue;
      }
      text += next;
      i += 2;
      continue;
    }
    if (char === "$") {
      if (command[i + 1] === "{") {
        const result = readBracedVariable(command, i + 2);
        text += result.text;
        dynamic = true;
        i = result.nextIndex;
        continue;
      }
      dynamic = true;
    }
    text += char;
    i++;
  }
  pushWord();
  return tokens;
}
function readBracedVariable(command, start) {
  let text = "${";
  let i = start;
  while (i < command.length) {
    const char = command[i];
    text += char ?? "";
    i++;
    if (char === "}") {
      return { text, nextIndex: i };
    }
  }
  return { text, nextIndex: i };
}
function readSingleQuoted(command, start) {
  let text = "";
  let i = start;
  while (i < command.length) {
    const char = command[i];
    if (char === "'" && command[i + 1] === "'") {
      text += "'";
      i += 2;
      continue;
    }
    if (char === "'") {
      return { text, nextIndex: i + 1 };
    }
    text += char ?? "";
    i++;
  }
  return { text, nextIndex: i };
}
function readDoubleQuoted(command, start) {
  let text = "";
  let dynamic = false;
  let i = start;
  while (i < command.length) {
    const char = command[i];
    if (char === "`") {
      const next = command[i + 1];
      if (!next) {
        i++;
        continue;
      }
      text += next;
      i += 2;
      continue;
    }
    if (char === '"') {
      return { text, dynamic, nextIndex: i + 1 };
    }
    if (char === "$") {
      dynamic = true;
    }
    text += char ?? "";
    i++;
  }
  return { text, dynamic, nextIndex: i };
}
function isDynamicText(text) {
  return text.startsWith("$") || text.startsWith("@") || text.includes("$(") || text.includes("${") || text.includes("$_");
}
function isPathLikeWord(text) {
  return text.includes("/") || text.includes("\\") || text.startsWith("~");
}

// src/core/analyze/recursive-delete-targets.ts
import { realpathSync } from "node:fs";
import { homedir as homedir2, tmpdir } from "node:os";
import { normalize, resolve as resolve2, sep } from "node:path";
var IS_WINDOWS = process.platform === "win32";
function createRecursiveDeleteTargetContext(options = {}) {
  return {
    anchoredCwd: options.originalCwd ?? options.cwd ?? null,
    resolvedCwd: options.cwd ?? null,
    paranoid: options.paranoid ?? false,
    trustTmpdirVar: options.allowTmpdirVar ?? true,
    homeDir: getHomeDirForRmPolicy()
  };
}
function classifyRecursiveDeleteTarget(target, ctx) {
  if (isDangerousRootOrHomeTarget(target)) {
    return { kind: "root_or_home_target" };
  }
  if (isTempTarget(target, ctx.trustTmpdirVar)) {
    return { kind: "temp_target" };
  }
  if (isDynamicTarget(target)) {
    return { kind: "dynamic_target" };
  }
  const anchoredCwd = ctx.anchoredCwd;
  if (anchoredCwd) {
    if (isCwdHomeForRmPolicy(anchoredCwd, ctx.homeDir)) {
      return { kind: "home_cwd_target" };
    }
    if (isCwdSelfTarget(target, anchoredCwd)) {
      return { kind: "cwd_self_target" };
    }
    if (isTargetWithinCwd(target, anchoredCwd, ctx.resolvedCwd ?? anchoredCwd)) {
      return { kind: "within_anchored_cwd" };
    }
  }
  return { kind: "outside_anchored_cwd" };
}
function isDangerousRootOrHomeTarget(path) {
  const normalized = path.trim();
  if (normalized === "/" || normalized === "/*") {
    return true;
  }
  if (normalized === "~" || normalized === "~/" || normalized.startsWith("~/")) {
    if (normalized === "~" || normalized === "~/" || normalized === "~/*") {
      return true;
    }
  }
  if (normalized === "$HOME" || normalized === "$HOME/" || normalized === "$HOME/*") {
    return true;
  }
  if (normalized === "${HOME}" || normalized === "${HOME}/" || normalized === "${HOME}/*") {
    return true;
  }
  return false;
}
function normalizePathForComparison(p) {
  let normalized = normalize(p);
  if (IS_WINDOWS) {
    normalized = normalized.replace(/\//g, "\\").toLowerCase();
    if (normalized.length > 3 && normalized.endsWith("\\")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
function isTempTarget(path, allowTmpdirVar) {
  const normalized = path.trim();
  if (hasParentDirectoryComponent(normalized)) {
    return false;
  }
  if (normalized === "/tmp" || normalized.startsWith("/tmp/")) {
    return true;
  }
  if (normalized === "/var/tmp" || normalized.startsWith("/var/tmp/")) {
    return true;
  }
  const normalizedTmpdir = normalizePathForComparison(tmpdir());
  const pathToCompare = normalizePathForComparison(normalized);
  if (pathToCompare.startsWith(`${normalizedTmpdir}${sep}`) || pathToCompare === normalizedTmpdir) {
    return true;
  }
  if (allowTmpdirVar) {
    if (normalized === "$TMPDIR" || normalized.startsWith("$TMPDIR/")) {
      return true;
    }
    if (normalized === "${TMPDIR}" || normalized.startsWith("${TMPDIR}/")) {
      return true;
    }
  }
  return false;
}
function hasParentDirectoryComponent(path) {
  return path.split(/[\\/]+/).includes("..");
}
function getHomeDirForRmPolicy() {
  return process.env.HOME ?? homedir2();
}
function isDynamicTarget(target) {
  return target.includes("$") || target.includes("`") || hasShellGlobMetachar(target);
}
function hasShellGlobMetachar(target) {
  let escaped = false;
  for (const char of target) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "*" || char === "?" || char === "[") {
      return true;
    }
  }
  return false;
}
function isCwdHomeForRmPolicy(cwd, homeDir) {
  try {
    return normalizePathForComparison(realpathSync(cwd)) === normalizePathForComparison(realpathSync(homeDir));
  } catch {
    try {
      return normalizePathForComparison(cwd) === normalizePathForComparison(homeDir);
    } catch {
      return false;
    }
  }
}
function isCwdSelfTarget(target, cwd) {
  if (target === "." || target === "./" || target === ".\\") {
    return true;
  }
  try {
    return normalizePathForComparison(realpathSync(resolve2(cwd, target))) === normalizePathForComparison(realpathSync(cwd));
  } catch {
    try {
      return normalizePathForComparison(resolve2(cwd, target)) === normalizePathForComparison(cwd);
    } catch {
      return false;
    }
  }
}
function isTargetWithinCwd(target, originalCwd, effectiveCwd) {
  const resolveCwd = effectiveCwd ?? originalCwd;
  if (target.startsWith("~") || target.startsWith("$HOME") || target.startsWith("${HOME}")) {
    return false;
  }
  if (isDynamicTarget(target)) {
    return false;
  }
  if (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)) {
    try {
      return isResolvedPathWithinCwd(target, originalCwd);
    } catch {
      return false;
    }
  }
  if (target.startsWith("./") || target.startsWith(".\\") || !target.includes("/") && !target.includes("\\")) {
    try {
      return isResolvedPathWithinCwd(resolve2(resolveCwd, target), originalCwd);
    } catch {
      return false;
    }
  }
  if (target.startsWith("../")) {
    return false;
  }
  try {
    return isResolvedPathWithinCwd(resolve2(resolveCwd, target), originalCwd);
  } catch {
    return false;
  }
}
function isResolvedPathWithinCwd(resolvedTarget, cwd) {
  try {
    return isNormalizedPathWithin(realpathSync(resolvedTarget), realpathSync(cwd));
  } catch {
    return isNormalizedPathWithin(resolvedTarget, cwd);
  }
}
function isNormalizedPathWithin(target, cwd) {
  const normalizedTarget = normalizePathForComparison(target);
  const normalizedCwd = normalizePathForComparison(cwd);
  return normalizedTarget.startsWith(`${normalizedCwd}${sep}`) || normalizedTarget === normalizedCwd;
}

// src/core/env.ts
var ENV_FLAGS = {
  level: { name: "CC_SAFETY_NET_LEVEL" },
  strict: { name: "CC_SAFETY_NET_STRICT", legacyName: "SAFETY_NET_STRICT" },
  paranoid: { name: "CC_SAFETY_NET_PARANOID", legacyName: "SAFETY_NET_PARANOID" },
  paranoidRm: { name: "CC_SAFETY_NET_PARANOID_RM", legacyName: "SAFETY_NET_PARANOID_RM" },
  paranoidInterpreters: {
    name: "CC_SAFETY_NET_PARANOID_INTERPRETERS",
    legacyName: "SAFETY_NET_PARANOID_INTERPRETERS"
  },
  worktree: { name: "CC_SAFETY_NET_WORKTREE", legacyName: "SAFETY_NET_WORKTREE" },
  debug: { name: "CC_SAFETY_NET_DEBUG" }
};
var SAFETY_LEVELS = ["standard", "strict", "paranoid"];
function expandSafetyLevel(level) {
  return {
    failClosed: level === "strict" || level === "paranoid",
    paranoidRm: level === "paranoid",
    paranoidInterpreters: level === "paranoid"
  };
}
function maxSafetyLevel(policyLevel, envLevel) {
  if (!envLevel)
    return policyLevel;
  return SAFETY_LEVELS.indexOf(envLevel) > SAFETY_LEVELS.indexOf(policyLevel) ? envLevel : policyLevel;
}
function parseEnvLevel() {
  const value = getEnvFlagValue(ENV_FLAGS.level);
  if (value === undefined)
    return;
  if (SAFETY_LEVELS.includes(value))
    return value;
  if (envTruthy(ENV_FLAGS.debug)) {
    console.error(`CC Safety Net debug: invalid CC_SAFETY_NET_LEVEL=${JSON.stringify(value)}`);
  }
  return;
}
function deriveEffectiveLevel(values) {
  if (values.failClosed && values.paranoidRm && values.paranoidInterpreters)
    return "paranoid";
  if (values.failClosed && !values.paranoidRm && !values.paranoidInterpreters)
    return "strict";
  if (!values.failClosed && !values.paranoidRm && !values.paranoidInterpreters)
    return "standard";
  return "custom";
}
function getCCSafetyNetEnvModes(policy = {}) {
  const policyLevel = policy.safety?.level ?? "standard";
  const envLevel = parseEnvLevel();
  const baseLevel = maxSafetyLevel(policyLevel, envLevel);
  const values = expandSafetyLevel(baseLevel);
  const sources = {
    failClosed: [`policy safety.level=${policyLevel}`],
    paranoidRm: [`policy safety.level=${policyLevel}`],
    paranoidInterpreters: [`policy safety.level=${policyLevel}`],
    worktreeMode: []
  };
  if (envLevel && envLevel !== policyLevel) {
    sources.failClosed.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
    sources.paranoidRm.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
    sources.paranoidInterpreters.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
  }
  if (policy.safety?.overrides?.failClosed !== undefined) {
    values.failClosed = policy.safety.overrides.failClosed;
    sources.failClosed.push("policy safety.overrides.fail_closed");
  }
  if (policy.safety?.overrides?.paranoidRm !== undefined) {
    values.paranoidRm = policy.safety.overrides.paranoidRm;
    sources.paranoidRm.push("policy safety.overrides.paranoid_rm");
  }
  if (policy.safety?.overrides?.paranoidInterpreters !== undefined) {
    values.paranoidInterpreters = policy.safety.overrides.paranoidInterpreters;
    sources.paranoidInterpreters.push("policy safety.overrides.paranoid_interpreters");
  }
  if (envTruthy(ENV_FLAGS.strict)) {
    values.failClosed = true;
    sources.failClosed.push(`env ${ENV_FLAGS.strict.name}`);
  }
  if (envTruthy(ENV_FLAGS.paranoid)) {
    values.paranoidRm = true;
    values.paranoidInterpreters = true;
    sources.paranoidRm.push(`env ${ENV_FLAGS.paranoid.name}`);
    sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoid.name}`);
  }
  if (envTruthy(ENV_FLAGS.paranoidRm)) {
    values.paranoidRm = true;
    sources.paranoidRm.push(`env ${ENV_FLAGS.paranoidRm.name}`);
  }
  if (envTruthy(ENV_FLAGS.paranoidInterpreters)) {
    values.paranoidInterpreters = true;
    sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoidInterpreters.name}`);
  }
  const worktreeMode = !!policy.worktreeMode || envTruthy(ENV_FLAGS.worktree);
  if (policy.worktreeMode)
    sources.worktreeMode.push("policy workflow.worktree_mode");
  if (envTruthy(ENV_FLAGS.worktree))
    sources.worktreeMode.push(`env ${ENV_FLAGS.worktree.name}`);
  return {
    strict: values.failClosed,
    paranoidRm: values.paranoidRm,
    paranoidInterpreters: values.paranoidInterpreters,
    worktreeMode,
    effectiveLevel: deriveEffectiveLevel(values),
    sources
  };
}
function envTruthy(flag) {
  const value = typeof flag === "string" ? process.env[flag] : getEnvFlagValue(flag);
  return value === "1" || value?.toLowerCase() === "true";
}
function getEnvFlagValue(flag) {
  if (process.env[flag.name] !== undefined) {
    return process.env[flag.name];
  }
  if (flag.legacyName) {
    return process.env[flag.legacyName];
  }
  return;
}
function envFlagIsSet(flag) {
  return process.env[flag.name] !== undefined || !!flag.legacyName && process.env[flag.legacyName] !== undefined;
}

// src/core/analyze/powershell/remove-item.ts
var REMOVE_ITEM_ALIASES = new Set(["remove-item", "ri", "del", "erase", "rd", "rm", "rmdir"]);
var AUTO_REMOVE_ITEM_ALIASES = new Set(["remove-item", "ri", "del", "erase", "rd", "rmdir"]);
var REASON_REMOVE_ITEM_RF = "PowerShell Remove-Item -Recurse -Force outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.";
var REASON_REMOVE_ITEM_DYNAMIC_TARGET = "PowerShell Remove-Item target contains variables or pipeline input that cannot be verified safely. Use literal paths within cwd.";
var REASON_REMOVE_ITEM_ROOT_HOME = "PowerShell Remove-Item targeting root or home directory is extremely dangerous and always blocked.";
var REASON_REMOVE_ITEM_HOME_CWD = "PowerShell Remove-Item -Recurse -Force in home directory is dangerous. Change to a project directory first.";
var REASON_REMOVE_ITEM_PIPELINE = "PowerShell Remove-Item receives pipeline input that cannot be verified safely. Use explicit literal paths within cwd.";
function analyzePowerShellRemoveItemMatch(command, options = {}) {
  const ctx = createRecursiveDeleteTargetContext(options);
  let segment = [];
  let hasPipelineInput = false;
  for (const token of tokenizePowerShell(command)) {
    if (token.kind === "word") {
      segment.push(token);
      continue;
    }
    const match = analyzePowerShellSegment(segment, hasPipelineInput, ctx);
    if (match)
      return match;
    segment = [];
    hasPipelineInput = token.text === "|";
    if (token.text !== "|") {
      hasPipelineInput = false;
    }
  }
  return analyzePowerShellSegment(segment, hasPipelineInput, ctx);
}
function shouldAnalyzePowerShellRemoveItem(command) {
  const words = tokenizePowerShell(command).filter((token) => token.kind === "word");
  for (let i = 0;i < words.length; i++) {
    const token = words[i];
    if (!token || token.kind !== "word")
      continue;
    const normalized = normalizeCommandName(token.text);
    if (AUTO_REMOVE_ITEM_ALIASES.has(normalized))
      return true;
    if (normalized === "rm" && words.slice(i + 1).some((word) => isPowerShellSpecificRmParameter(word))) {
      return true;
    }
  }
  return false;
}
function analyzePowerShellSegment(segment, hasPipelineInput, ctx) {
  const words = segment.filter((token) => token.kind === "word");
  const commandIndex = getCommandIndex(words);
  const command = words[commandIndex];
  if (!command || !REMOVE_ITEM_ALIASES.has(normalizeCommandName(command.text))) {
    return null;
  }
  const parsed = parseRemoveItem(words.slice(commandIndex + 1));
  if (parsed.whatIfProtected) {
    return null;
  }
  if (hasPipelineInput && (parsed.targets.length === 0 || parsed.recursive)) {
    return destructiveCommandMatch("powershell.remove-item-pipeline-dynamic-target", REASON_REMOVE_ITEM_PIPELINE);
  }
  for (const target of parsed.targets) {
    if (isDangerousRootOrHomeTarget(powerShellTargetForPolicy(target.text))) {
      return destructiveCommandMatch(parsed.recursive && parsed.force ? "powershell.remove-item-recursive-force-root-or-home" : "powershell.remove-item-root-or-home", REASON_REMOVE_ITEM_ROOT_HOME);
    }
  }
  if (!parsed.recursive || !parsed.force) {
    return null;
  }
  if (parsed.hasDynamicTarget || parsed.targets.length === 0) {
    return destructiveCommandMatch("powershell.remove-item-recursive-force-dynamic-target", REASON_REMOVE_ITEM_DYNAMIC_TARGET);
  }
  for (const target of parsed.targets) {
    const match = matchForClassification(classifyRecursiveDeleteTarget(powerShellTargetForPolicy(target.text), ctx), ctx);
    if (match)
      return match;
  }
  return null;
}
function parseRemoveItem(args) {
  const targets = [];
  let recursive = false;
  let force = false;
  let whatIfProtected = false;
  let hasDynamicTarget = false;
  let pastEndOfParameters = false;
  for (let i = 0;i < args.length; i++) {
    const token = args[i];
    if (!token || token.kind !== "word")
      continue;
    if (isArraySeparator(token))
      continue;
    if (pastEndOfParameters) {
      targets.push(targetFromToken(token));
      hasDynamicTarget = hasDynamicTarget || token.dynamic;
      continue;
    }
    if (token.text === "--") {
      pastEndOfParameters = true;
      continue;
    }
    const parameter = parseParameter(token.text);
    if (!parameter) {
      targets.push(targetFromToken(token));
      hasDynamicTarget = hasDynamicTarget || token.dynamic;
      continue;
    }
    if (isPathParameter(parameter.name)) {
      const value = parameter.value ? parameterValueToken(parameter.value, token) : args[++i];
      if (value?.kind === "word") {
        targets.push(targetFromToken(value));
        hasDynamicTarget = hasDynamicTarget || value.dynamic;
      } else {
        hasDynamicTarget = true;
      }
      continue;
    }
    if (isRecurseParameter(parameter.name)) {
      recursive = true;
      continue;
    }
    if (isForceParameter(parameter.name)) {
      force = true;
      continue;
    }
    if (isWhatIfParameter(parameter.name)) {
      whatIfProtected = isProtectiveSwitchValue(parameter.value);
    }
  }
  return { targets, recursive, force, whatIfProtected, hasDynamicTarget };
}
function getCommandIndex(words) {
  const first = words[0];
  if (first?.kind === "word" && first.text === "&" || first?.text === ".") {
    return words.length > 1 ? 1 : 0;
  }
  return 0;
}
function targetFromToken(token) {
  return {
    text: token.kind === "word" ? token.text : "",
    dynamic: token.kind === "word" && token.dynamic
  };
}
function isArraySeparator(token) {
  return token.kind === "word" && token.text === ",";
}
function powerShellTargetForPolicy(target) {
  return target.replace(/\\/g, "/");
}
function parameterValueToken(value, source) {
  return {
    kind: "word",
    text: value,
    dynamic: source.kind === "word" && (source.dynamic || value.includes("$"))
  };
}
function parseParameter(text) {
  if (!text.startsWith("-") || text === "-") {
    return null;
  }
  const raw = text.slice(1);
  const colonIndex = raw.indexOf(":");
  if (colonIndex === -1) {
    return { name: raw.toLowerCase() };
  }
  return {
    name: raw.slice(0, colonIndex).toLowerCase(),
    value: raw.slice(colonIndex + 1)
  };
}
function isPathParameter(name) {
  return "path".startsWith(name) || "literalpath".startsWith(name);
}
function isRecurseParameter(name) {
  return "recurse".startsWith(name);
}
function isForceParameter(name) {
  return name.length >= 2 && "force".startsWith(name);
}
function isWhatIfParameter(name) {
  return name === "wi" || "whatif".startsWith(name);
}
function isProtectiveSwitchValue(value) {
  if (value === undefined || value === "") {
    return true;
  }
  const normalized = value.toLowerCase();
  return normalized === "$true" || normalized === "true";
}
function isPowerShellSpecificRmParameter(token) {
  if (token.kind !== "word")
    return false;
  const parameter = parseParameter(token.text);
  if (!parameter)
    return false;
  return isForceParameter(parameter.name) && parameter.name !== "f" || isRecurseParameter(parameter.name) && parameter.name !== "r" || isPathParameter(parameter.name) || isWhatIfParameter(parameter.name) || parameter.name === "confirm" || parameter.name === "cf";
}
function normalizeCommandName(name) {
  return name.toLowerCase();
}
function matchForClassification(classification, ctx) {
  switch (classification.kind) {
    case "root_or_home_target":
      return destructiveCommandMatch("powershell.remove-item-recursive-force-root-or-home", REASON_REMOVE_ITEM_ROOT_HOME);
    case "temp_target":
      return null;
    case "dynamic_target":
      return destructiveCommandMatch("powershell.remove-item-recursive-force-dynamic-target", REASON_REMOVE_ITEM_DYNAMIC_TARGET);
    case "home_cwd_target":
      return destructiveCommandMatch("powershell.remove-item-recursive-force-home-cwd", REASON_REMOVE_ITEM_HOME_CWD);
    case "cwd_self_target":
      return destructiveCommandMatch("powershell.remove-item-recursive-force-cwd-self", REASON_REMOVE_ITEM_RF);
    case "within_anchored_cwd":
      if (!ctx.paranoid)
        return null;
      return destructiveCommandMatch("powershell.remove-item-recursive-force-paranoid", `${REASON_REMOVE_ITEM_RF} (${ENV_FLAGS.paranoidRm.name} enabled)`);
    case "outside_anchored_cwd":
      return destructiveCommandMatch("powershell.remove-item-recursive-force-outside-cwd", REASON_REMOVE_ITEM_RF);
  }
}

// src/core/analyze/segment.ts
import { realpathSync as realpathSync6 } from "node:fs";
import { normalize as normalize3 } from "node:path";

// src/core/analyze/awk.ts
var AWK_INTERPRETERS = new Set(["awk", "gawk", "nawk", "mawk"]);
var REASON_AWK_SYSTEM_DYNAMIC = "Detected awk system(), pipe, or getline command with dynamic command that cannot be safely analyzed. Use a literal command or process the data without system(), pipes, or getline.";
function analyzeAwkSystemCalls(tokens, analyzeNested) {
  return analyzeAwkSystemCallMatch(tokens, (command) => {
    const reason = analyzeNested(command);
    return reason ? { id: "", reason, intent: "manual_only" } : null;
  })?.reason ?? null;
}
function analyzeAwkSystemCallMatch(tokens, analyzeNested) {
  for (const token of tokens.slice(1)) {
    const commands = extractAwkExternalCommands(token);
    if (!commands)
      continue;
    if (commands.dynamic)
      return destructiveCommandMatch("awk.system-dynamic", REASON_AWK_SYSTEM_DYNAMIC);
    for (const command of commands.commands) {
      const result = analyzeNested(command);
      if (result)
        return result;
    }
  }
  return null;
}
function extractAwkExternalCommands(code) {
  const systemCommands = code.includes("system") ? extractAwkSystemCommands(code) : null;
  const pipeCommands = extractAwkPipeCommands(code);
  if (!systemCommands && !pipeCommands)
    return null;
  return {
    dynamic: !!systemCommands?.dynamic || !!pipeCommands?.dynamic,
    commands: [...systemCommands?.commands ?? [], ...pipeCommands?.commands ?? []]
  };
}
function extractAwkSystemCommands(code) {
  const commands = [];
  let sawSystem = false;
  let searchIndex = 0;
  while (searchIndex < code.length) {
    const systemIndex = code.indexOf("system", searchIndex);
    if (systemIndex === -1)
      break;
    searchIndex = systemIndex + "system".length;
    if (isAwkIdentifierChar(code[systemIndex - 1]) || isAwkIdentifierChar(code[searchIndex])) {
      continue;
    }
    let i = skipAwkWhitespace(code, searchIndex);
    if (code[i] !== "(")
      continue;
    i = skipAwkWhitespace(code, i + 1);
    const quote = code[i];
    if (quote !== '"' && quote !== "'") {
      sawSystem = true;
      continue;
    }
    const parsed = readAwkStringLiteral(code, i, quote);
    if (!parsed) {
      sawSystem = true;
      continue;
    }
    i = skipAwkWhitespace(code, parsed.endIndex);
    sawSystem = true;
    if (code[i] !== ")") {
      return { dynamic: true, commands };
    }
    commands.push(parsed.value);
    searchIndex = i + 1;
  }
  if (!sawSystem)
    return null;
  return commands.length > 0 ? { dynamic: false, commands } : { dynamic: true, commands };
}
function extractAwkPipeCommands(code) {
  const commands = [];
  let dynamic = false;
  let sawPipeCommand = false;
  let i = 0;
  while (i < code.length) {
    const char = code[i];
    if (!char)
      break;
    if (char === '"' || char === "'") {
      const parsed = readAwkStringLiteral(code, i, char);
      i = parsed?.endIndex ?? i + 1;
      continue;
    }
    if (char === "#") {
      i = findAwkLineEnd(code, i + 1);
      continue;
    }
    if (char === "/" && isLikelyAwkRegexStart(code, i)) {
      i = findAwkRegexEnd(code, i + 1) ?? i + 1;
      continue;
    }
    if (char !== "|" || code[i - 1] === "|" || code[i + 1] === "|") {
      i++;
      continue;
    }
    const operatorEnd = code[i + 1] === "&" ? i + 2 : i + 1;
    const afterPipe = skipAwkWhitespace(code, operatorEnd);
    if (startsAwkKeyword(code, afterPipe, "getline")) {
      sawPipeCommand = true;
      const command = readAwkStringBeforePipe(code, i);
      if (command === null) {
        dynamic = true;
      } else {
        commands.push(command);
      }
      i = operatorEnd;
      continue;
    }
    if (isAwkPrintPipe(code, i)) {
      sawPipeCommand = true;
      const parsed = readAwkStringAt(code, afterPipe);
      if (!parsed) {
        dynamic = true;
        i = operatorEnd;
        continue;
      }
      commands.push(parsed.value);
      i = parsed.endIndex;
      continue;
    }
    i++;
  }
  if (!sawPipeCommand)
    return null;
  return { dynamic, commands };
}
function isAwkIdentifierChar(char) {
  return !!char && /[A-Za-z0-9_]/.test(char);
}
function skipAwkWhitespace(code, index) {
  let i = index;
  while (/\s/.test(code[i] ?? "")) {
    i++;
  }
  return i;
}
function readAwkStringLiteral(code, startIndex, quote) {
  let value = "";
  let escaped = false;
  for (let i = startIndex + 1;i < code.length; i++) {
    const char = code[i];
    if (!char)
      break;
    if (escaped) {
      const decoded = decodeAwkEscape(code, i);
      if (!decoded)
        return null;
      value += decoded.value;
      i = decoded.endIndex;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) {
      return { value, endIndex: i + 1 };
    }
    value += char;
  }
  return null;
}
function readAwkStringAt(code, index) {
  const quote = code[index];
  if (quote !== '"' && quote !== "'")
    return null;
  return readAwkStringLiteral(code, index, quote);
}
function readAwkStringBeforePipe(code, pipeIndex) {
  const endIndex = skipAwkWhitespaceBack(code, pipeIndex);
  const quote = code[endIndex - 1];
  if (quote !== '"' && quote !== "'")
    return null;
  for (let i = endIndex - 2;i >= 0; i--) {
    if (code[i] !== quote)
      continue;
    const parsed = readAwkStringLiteral(code, i, quote);
    if (parsed?.endIndex === endIndex) {
      return parsed.value;
    }
  }
  return null;
}
function decodeAwkEscape(code, index) {
  const char = code[index];
  if (!char)
    return null;
  if (char === "x") {
    const hex = code.slice(index + 1, index + 3);
    if (!/^[0-9A-Fa-f]{2}$/.test(hex))
      return null;
    return { value: String.fromCharCode(Number.parseInt(hex, 16)), endIndex: index + 2 };
  }
  if (/[0-7]/.test(char)) {
    const match = /^[0-7]{1,3}/.exec(code.slice(index));
    if (!match)
      return null;
    return {
      value: String.fromCharCode(Number.parseInt(match[0], 8)),
      endIndex: index + match[0].length - 1
    };
  }
  const simpleEscapes = {
    a: "\x07",
    b: "\b",
    f: "\f",
    n: `
`,
    r: "\r",
    t: "\t",
    v: "\v"
  };
  return { value: simpleEscapes[char] ?? char, endIndex: index };
}
function skipAwkWhitespaceBack(code, index) {
  let i = index;
  while (i > 0 && /\s/.test(code[i - 1] ?? "")) {
    i--;
  }
  return i;
}
function startsAwkKeyword(code, index, keyword) {
  return code.startsWith(keyword, index) && !isAwkIdentifierChar(code[index - 1]) && !isAwkIdentifierChar(code[index + keyword.length]);
}
function isAwkPrintPipe(code, pipeIndex) {
  return /\b(?:print|printf)\b/.test(code.slice(findAwkStatementStart(code, pipeIndex), pipeIndex));
}
function findAwkStatementStart(code, index) {
  const starts = [";", `
`, "{", "}"].map((marker) => code.lastIndexOf(marker, index - 1));
  return Math.max(...starts) + 1;
}
function findAwkLineEnd(code, index) {
  const lineEnd = code.indexOf(`
`, index);
  return lineEnd === -1 ? code.length : lineEnd + 1;
}
function isLikelyAwkRegexStart(code, index) {
  const previousIndex = findPreviousAwkNonWhitespace(code, index);
  if (previousIndex === -1)
    return true;
  return "{([,;!~".includes(code[previousIndex] ?? "");
}
function findPreviousAwkNonWhitespace(code, index) {
  for (let i = index - 1;i >= 0; i--) {
    if (!/\s/.test(code[i] ?? ""))
      return i;
  }
  return -1;
}
function findAwkRegexEnd(code, index) {
  let escaped = false;
  for (let i = index;i < code.length; i++) {
    const char = code[i];
    if (!char)
      break;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "/") {
      return i + 1;
    }
  }
  return null;
}

// src/core/analyze/constants.ts
var DISPLAY_COMMANDS = new Set([
  "echo",
  "printf",
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "grep",
  "rg",
  "ag",
  "ack",
  "sed",
  "awk",
  "cut",
  "tr",
  "sort",
  "uniq",
  "wc",
  "tee",
  "man",
  "help",
  "info",
  "type",
  "which",
  "whereis",
  "whatis",
  "apropos",
  "file",
  "stat",
  "ls",
  "ll",
  "dir",
  "tree",
  "pwd",
  "date",
  "cal",
  "uptime",
  "whoami",
  "id",
  "groups",
  "hostname",
  "uname",
  "env",
  "printenv",
  "set",
  "export",
  "alias",
  "history",
  "jobs",
  "fg",
  "bg",
  "test",
  "true",
  "false",
  "read",
  "return",
  "exit",
  "break",
  "continue",
  "shift",
  "wait",
  "trap",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "md5sum",
  "sha256sum",
  "base64",
  "xxd",
  "od",
  "hexdump",
  "strings",
  "diff",
  "cmp",
  "comm",
  "join",
  "paste",
  "column",
  "fmt",
  "fold",
  "nl",
  "pr",
  "expand",
  "unexpand",
  "rev",
  "tac",
  "shuf",
  "seq",
  "yes",
  "sleep",
  "logger",
  "write",
  "wall",
  "mesg",
  "notify-send"
]);

// src/core/analyze/rm-flags.ts
function hasRecursiveForceFlags(tokens) {
  let hasRecursive = false;
  let hasForce = false;
  for (const token of tokens) {
    if (token === "--")
      break;
    if (token === "-r" || token === "-R" || token === "--recursive") {
      hasRecursive = true;
    } else if (token === "-f" || token === "--force") {
      hasForce = true;
    } else if (token.startsWith("-") && !token.startsWith("--")) {
      if (token.includes("r") || token.includes("R"))
        hasRecursive = true;
      if (token.includes("f"))
        hasForce = true;
    }
  }
  return hasRecursive && hasForce;
}

// src/core/shell/command.ts
function normalizeCommandToken(token) {
  return getBasename(token).toLowerCase();
}
function getBasename(token) {
  return token.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? token;
}
// src/core/shell/options.ts
function extractShortOpts(tokens, options) {
  const opts = new Set;
  let pastDoubleDash = false;
  for (const token of tokens) {
    if (token === "--") {
      pastDoubleDash = true;
      continue;
    }
    if (pastDoubleDash)
      continue;
    if (token.startsWith("-") && !token.startsWith("--") && token.length > 1) {
      for (let i = 1;i < token.length; i++) {
        const char = token[i];
        if (!char || !/[a-zA-Z]/.test(char)) {
          break;
        }
        const shortOpt = `-${char}`;
        opts.add(shortOpt);
        if (options?.shortOptsWithValue?.has(shortOpt)) {
          break;
        }
      }
    }
  }
  return opts;
}
// node_modules/shell-quote/index.js
var $quote = require_quote();
var $parse = require_parse();

// src/domain/decision.ts
var BLOCK_INTENTS = [
  "hard_stop",
  "use_alternative",
  "scope_down",
  "manual_only",
  "stop_and_explain"
];

// src/types.ts
var MAX_RECURSION_DEPTH = 10;
var MAX_STRIP_ITERATIONS = 20;
var NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
var COMMAND_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
var MAX_REASON_LENGTH = 256;
var SHELL_OPERATORS = new Set(["&&", "||", "|&", "|", "&", ";", `
`]);
var SHELL_WRAPPERS = new Set(["bash", "sh", "zsh", "ksh", "dash", "fish", "csh", "tcsh"]);
var INTERPRETERS = new Set(["python", "python3", "python2", "node", "ruby", "perl"]);
var PYTHON_INTERPRETER_PATTERN = /^python(?:[23](?:\.\d+)*)?$/;
var RM_RECURSIVE_FORCE_PATTERN = /\brm[^\S\n]+(?=(?:(?!--(?=[^\S\n]|[;&|]|$))[^\s;&|]+[^\S\n]+)*(?:-(?!-)[^\s;&|]*[rR][^\s;&|]*|--recursive)(?=[^\S\n]|[;&|]|$))(?=(?:(?!--(?=[^\S\n]|[;&|]|$))[^\s;&|]+[^\S\n]+)*(?:-(?!-)[^\s;&|]*[fF][^\s;&|]*|--force)(?=[^\S\n]|[;&|]|$))[^\n;&|]*/;
var DANGEROUS_PATTERNS = [
  RM_RECURSIVE_FORCE_PATTERN,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\b/,
  /\bgit\s+clean\s+-f\b/,
  /\bgit\s+stash\s+(drop|clear)\b/,
  /\bdd\b[^\n;&|]*\bof=\/dev\/[^\s'"]+/,
  /\bmkfs(?:\.[A-Za-z0-9_-]+)?\s+\/dev\/[^\s'"]+/,
  /\bshred\b\s+/,
  /\bfind\b.*\s-delete\b/
];

// src/core/shell/shared.ts
var ENV_PROXY = new Proxy({}, {
  get: (_, name) => `$${String(name)}`
});
function advanceQuoteScanState(char, state) {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === "\\" && !state.inSingle) {
    state.escaped = true;
    return true;
  }
  if (char === "'" && !state.inDouble) {
    state.inSingle = !state.inSingle;
    return true;
  }
  if (char === '"' && !state.inSingle) {
    state.inDouble = !state.inDouble;
    return true;
  }
  return false;
}
function hasUnclosedQuotes(command) {
  const state = { inSingle: false, inDouble: false, escaped: false };
  for (const char of stripShellComments(command)) {
    advanceQuoteScanState(char, state);
  }
  return state.inSingle || state.inDouble;
}
function stripShellComments(command) {
  let result = "";
  const state = { inSingle: false, inDouble: false, escaped: false };
  let inComment = false;
  for (let i = 0;i < command.length; i++) {
    const char = command[i];
    if (!char)
      break;
    if (inComment) {
      if (char === `
` || char === "\r") {
        result += char;
        inComment = false;
        state.escaped = false;
      }
      continue;
    }
    if (char === "#" && !state.inSingle && !state.inDouble && startsShellComment(command, i)) {
      inComment = true;
      continue;
    }
    result += char;
    advanceQuoteScanState(char, state);
  }
  return result;
}
function startsShellComment(command, index) {
  return index === 0 || /\s/.test(command[index - 1] ?? "");
}
function getCommandTokenText(token) {
  if (typeof token === "string") {
    return token;
  }
  if (token && typeof token === "object" && "pattern" in token && typeof token.pattern === "string") {
    return token.pattern;
  }
  return null;
}

// src/core/shell/segments.ts
var ARITHMETIC_SENTINEL = "__CC_SAFETY_NET_ARITH_SENTINEL__";
var BACKTICK_ATTACHED_SUFFIX_SENTINEL = "__CC_SAFETY_NET_BACKTICK_SUFFIX__";
var SHELL_DYNAMIC_SUBSTITUTION_TOKEN = "$__CC_SAFETY_NET_DYNAMIC_SUBSTITUTION__";
function splitShellCommands(command) {
  return splitShellCommandsWithInfo(command).map((segment) => stripDynamicSubstitutionTokens(segment.tokens));
}
function stripDynamicSubstitutionTokens(tokens) {
  return tokens.map((token) => token.replaceAll(SHELL_DYNAMIC_SUBSTITUTION_TOKEN, "")).filter((token) => token !== "");
}
function splitShellCommandsWithInfo(command) {
  if (hasUnclosedQuotes(command)) {
    return [{ tokens: [command], hasDynamicSubstitution: false }];
  }
  const normalizedCommand = _stripAttachedIoNumbers(_normalizeAnsiCQuotes(stripShellComments(command)).replace(/\r?\n|\r/g, " ; "));
  const tokens = $parse(normalizedCommand, ENV_PROXY);
  const segments = [];
  let current = [];
  let currentHasDynamicSubstitution = false;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (isOperator(token)) {
      if (current.length > 0) {
        segments.push({
          tokens: current,
          hasDynamicSubstitution: currentHasDynamicSubstitution
        });
        current = [];
        currentHasDynamicSubstitution = false;
      }
      i++;
      continue;
    }
    if (_isProcessSubstitutionStart(tokens, i)) {
      if (current.length > 0) {
        segments.push({
          tokens: current,
          hasDynamicSubstitution: currentHasDynamicSubstitution
        });
        current = [];
        currentHasDynamicSubstitution = false;
      }
      const { innerSegments, endIndex } = extractProcessSubstitution(tokens, i);
      for (const seg of innerSegments) {
        segments.push({ tokens: seg, hasDynamicSubstitution: false });
      }
      i = endIndex + 1;
      continue;
    }
    if (_isRedirectOp(token)) {
      const { redirectTarget, advance } = _getRedirectTargetInfo(tokens, i);
      if (redirectTarget !== null) {
        _pushInlineSubstitutionSegmentInfos(segments, redirectTarget);
      }
      i += advance;
      continue;
    }
    if (_isCommandSubstitutionStart(tokens, i)) {
      const substitution = getCommandSubstitution(tokens, i);
      const hadCurrent = current.length > 0;
      if (hadCurrent) {
        currentHasDynamicSubstitution = true;
        current.push(SHELL_DYNAMIC_SUBSTITUTION_TOKEN);
        if (!substitution.shouldKeepCurrent) {
          segments.push({
            tokens: current,
            hasDynamicSubstitution: currentHasDynamicSubstitution
          });
          current = [];
          currentHasDynamicSubstitution = false;
        }
      }
      if (!hadCurrent) {
        current.push(SHELL_DYNAMIC_SUBSTITUTION_TOKEN);
        currentHasDynamicSubstitution = true;
      }
      for (const seg of substitution.innerSegments) {
        segments.push({ tokens: seg, hasDynamicSubstitution: false });
      }
      if (substitution.shouldKeepCurrent && substitution.attachedSuffix) {
        current.push(substitution.attachedSuffix);
      }
      i = substitution.endIndex + (substitution.attachedSuffix !== null ? 2 : 1);
      continue;
    }
    if (_isAttachedCommandSubstitutionStart(tokens, i)) {
      const tokenText2 = tokens[i];
      if (typeof tokenText2 === "string") {
        const prefix = tokenText2.slice(0, -1);
        if (prefix) {
          if (current.length === 0) {
            current.push(`${prefix}${SHELL_DYNAMIC_SUBSTITUTION_TOKEN}`);
          } else {
            current.push(prefix, SHELL_DYNAMIC_SUBSTITUTION_TOKEN);
          }
        } else {
          current.push(SHELL_DYNAMIC_SUBSTITUTION_TOKEN);
        }
      }
      currentHasDynamicSubstitution = true;
      const { innerSegments, endIndex } = extractCommandSubstitution(tokens, i + 2);
      for (const seg of innerSegments) {
        segments.push({ tokens: seg, hasDynamicSubstitution: false });
      }
      i = endIndex + 1;
      continue;
    }
    const tokenText = getCommandTokenText(token);
    if (tokenText === null) {
      if (token && typeof token === "object" && "op" in token && typeof token.op === "string") {
        _pushInlineSubstitutionSegmentInfos(segments, token.op);
      }
      i++;
      continue;
    }
    _pushInlineSubstitutionSegmentInfos(segments, tokenText);
    current.push(tokenText);
    i++;
  }
  if (current.length > 0) {
    segments.push({
      tokens: current,
      hasDynamicSubstitution: currentHasDynamicSubstitution
    });
  }
  return segments;
}
function extractInlineCommandSubstitutions(token) {
  const segments = [];
  let i = 0;
  const quoteState = { inSingle: false, inDouble: false, escaped: false };
  while (i < token.length) {
    const char = token[i];
    if (!char) {
      break;
    }
    if (advanceQuoteScanState(char, quoteState)) {
      i++;
      continue;
    }
    if (!quoteState.inSingle && char === "$" && token[i + 1] === "(" && token[i + 2] !== "(") {
      const end = _findInlineCommandSubstitutionEnd(token, i + 2);
      if (end === -1) {
        break;
      }
      const innerCommand = token.slice(i + 2, end);
      if (innerCommand.trim()) {
        const innerSegments = splitShellCommands(innerCommand);
        for (const seg of innerSegments) {
          segments.push(seg);
        }
      }
      i = end + 1;
      continue;
    }
    i++;
  }
  return segments;
}
function isParenOpen(token) {
  return typeof token === "object" && token !== null && "op" in token && token.op === "(";
}
function isParenClose(token) {
  return typeof token === "object" && token !== null && "op" in token && token.op === ")";
}
function getCommandSubstitution(tokens, index) {
  const { innerSegments, endIndex } = extractCommandSubstitution(tokens, index + 2);
  const attachedSuffix = _getBacktickAttachedSuffix(tokens[endIndex + 1]);
  return {
    innerSegments,
    endIndex,
    attachedSuffix,
    shouldKeepCurrent: attachedSuffix !== null && !_isRedirectOp(tokens[index - 1]) && !isOperatorToken(tokens[index - 1])
  };
}
function extractCommandSubstitution(tokens, startIndex) {
  if (tokens[startIndex] === ARITHMETIC_SENTINEL) {
    return _extractArithmeticSubstitution(tokens, startIndex);
  }
  const innerSegments = [];
  let currentSegment = [];
  let depth = 1;
  let i = startIndex;
  while (i < tokens.length && depth > 0) {
    const token = tokens[i];
    if (isParenOpen(token)) {
      depth++;
      i++;
      continue;
    }
    if (isParenClose(token)) {
      depth--;
      if (depth === 0)
        break;
      i++;
      continue;
    }
    if (depth === 1 && token && isOperator(token)) {
      if (currentSegment.length > 0) {
        innerSegments.push(currentSegment);
        currentSegment = [];
      }
      i++;
      continue;
    }
    if (depth === 1 && _isProcessSubstitutionStart(tokens, i)) {
      if (currentSegment.length > 0) {
        innerSegments.push(currentSegment);
        currentSegment = [];
      }
      const { innerSegments: nestedSegments, endIndex } = extractProcessSubstitution(tokens, i);
      for (const seg of nestedSegments) {
        innerSegments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }
    if (depth === 1 && _isRedirectOp(token)) {
      const { redirectTarget, advance } = _getRedirectTargetInfo(tokens, i);
      if (redirectTarget !== null) {
        _pushInlineSubstitutionSegments(innerSegments, redirectTarget);
      }
      i += advance;
      continue;
    }
    if (depth === 1 && _isCommandSubstitutionStart(tokens, i)) {
      const substitution = getCommandSubstitution(tokens, i);
      const hadCurrentSegment = currentSegment.length > 0;
      if (hadCurrentSegment) {
        currentSegment.push(SHELL_DYNAMIC_SUBSTITUTION_TOKEN);
      }
      if (!substitution.shouldKeepCurrent && hadCurrentSegment) {
        innerSegments.push(currentSegment);
        currentSegment = [];
      }
      if (!hadCurrentSegment) {
        currentSegment.push(SHELL_DYNAMIC_SUBSTITUTION_TOKEN);
      }
      for (const seg of substitution.innerSegments) {
        innerSegments.push(seg);
      }
      if (substitution.shouldKeepCurrent && substitution.attachedSuffix) {
        currentSegment.push(substitution.attachedSuffix);
      }
      i = substitution.endIndex + (substitution.attachedSuffix !== null ? 2 : 1);
      continue;
    }
    if (depth === 1 && _isAttachedCommandSubstitutionStart(tokens, i)) {
      if (typeof token === "string") {
        const prefix = token.slice(0, -1);
        if (prefix) {
          if (currentSegment.length === 0) {
            currentSegment.push(`${prefix}${SHELL_DYNAMIC_SUBSTITUTION_TOKEN}`);
          } else {
            currentSegment.push(prefix, SHELL_DYNAMIC_SUBSTITUTION_TOKEN);
          }
        } else {
          currentSegment.push(SHELL_DYNAMIC_SUBSTITUTION_TOKEN);
        }
      }
      const { innerSegments: nestedSegments, endIndex } = extractCommandSubstitution(tokens, i + 2);
      for (const seg of nestedSegments) {
        innerSegments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }
    const tokenText = getCommandTokenText(token);
    if (tokenText !== null) {
      currentSegment.push(tokenText);
    }
    i++;
  }
  if (currentSegment.length > 0) {
    innerSegments.push(currentSegment);
  }
  return { innerSegments, endIndex: i };
}
function _extractArithmeticSubstitution(tokens, startIndex) {
  const innerSegments = [];
  let expression = "";
  let depth = 1;
  let i = startIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (_isCommandSubstitutionStart(tokens, i)) {
      const nested = extractArithmeticNestedCommand(innerSegments, expression, tokens, i + 2);
      expression = nested.expression;
      i = nested.endIndex + 1;
      continue;
    }
    if (_isAttachedCommandSubstitutionStart(tokens, i)) {
      const tokenText = tokens[i];
      if (typeof tokenText === "string") {
        expression += tokenText.slice(0, -1);
      }
      const nested = extractArithmeticNestedCommand(innerSegments, expression, tokens, i + 2);
      expression = nested.expression;
      i = nested.endIndex + 1;
      continue;
    }
    if (isParenOpen(token)) {
      depth++;
      expression += "(";
      i++;
      continue;
    }
    if (isParenClose(token)) {
      depth--;
      if (depth === 0) {
        return {
          innerSegments: expression ? [...innerSegments, [expression]] : innerSegments,
          endIndex: i
        };
      }
      expression += ")";
      i++;
      continue;
    }
    if (typeof token === "string") {
      _pushInlineSubstitutionSegments(innerSegments, token);
      expression += token;
      i++;
      continue;
    }
    if (token && typeof token === "object") {
      if ("pattern" in token && typeof token.pattern === "string") {
        expression += token.pattern;
        i++;
        continue;
      }
      if ("op" in token) {
        expression += String(token.op);
      }
    }
    i++;
  }
  return {
    innerSegments: expression ? [...innerSegments, [expression]] : innerSegments,
    endIndex: i
  };
}
function extractArithmeticNestedCommand(innerSegments, expression, tokens, startIndex) {
  if (expression) {
    innerSegments.push([expression]);
  }
  const { innerSegments: nestedSegments, endIndex } = extractCommandSubstitution(tokens, startIndex);
  for (const seg of nestedSegments) {
    innerSegments.push(seg);
  }
  return { expression: "", endIndex };
}
function _pushInlineSubstitutionSegments(segments, token) {
  const inlineSegments = extractInlineCommandSubstitutions(token);
  for (const seg of inlineSegments) {
    segments.push(seg);
  }
}
function _pushInlineSubstitutionSegmentInfos(segments, token) {
  const inlineSegments = extractInlineCommandSubstitutions(token);
  for (const seg of inlineSegments) {
    segments.push({ tokens: seg, hasDynamicSubstitution: false });
  }
}
function _normalizeAnsiCQuotes(command) {
  let result = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0;i < command.length; ) {
    const char = command[i];
    if (!char)
      break;
    if (escaped) {
      result += char;
      escaped = false;
      i++;
      continue;
    }
    if (!inSingle && char === "\\") {
      result += char;
      escaped = true;
      i++;
      continue;
    }
    if (!inSingle && !inDouble && command.startsWith("$'", i)) {
      const parsed = _readAnsiCString(command, i + 2);
      if (!parsed) {
        result += char;
        i++;
        continue;
      }
      result += _singleQuoteShellToken(parsed.value);
      i = parsed.endIndex + 1;
      continue;
    }
    if (!inDouble && char === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && char === '"') {
      inDouble = !inDouble;
    }
    result += char;
    i++;
  }
  return result;
}
function _readAnsiCString(command, startIndex) {
  let value = "";
  for (let i = startIndex;i < command.length; i++) {
    const char = command[i];
    if (!char)
      break;
    if (char === "'") {
      return { value, endIndex: i };
    }
    if (char !== "\\") {
      value += char;
      continue;
    }
    const decoded = _readAnsiEscape(command, i + 1);
    value += decoded.value;
    i = decoded.endIndex;
  }
  return null;
}
function _readAnsiEscape(command, index) {
  const char = command[index];
  if (!char)
    return { value: "\\", endIndex: index };
  const simpleEscapes = {
    a: "\x07",
    b: "\b",
    e: "\x1B",
    E: "\x1B",
    f: "\f",
    n: `
`,
    r: "\r",
    t: "\t",
    v: "\v",
    "\\": "\\",
    "'": "'",
    '"': '"'
  };
  if (Object.hasOwn(simpleEscapes, char)) {
    return { value: simpleEscapes[char] ?? char, endIndex: index };
  }
  if (char === "x") {
    return _readFixedBaseEscape(command, index + 1, 16, 2, index);
  }
  if (char === "u") {
    return _readFixedBaseEscape(command, index + 1, 16, 4, index);
  }
  if (char === "U") {
    return _readFixedBaseEscape(command, index + 1, 16, 8, index);
  }
  if (/[0-7]/.test(char)) {
    return _readFixedBaseEscape(command, index, 8, 3, index - 1);
  }
  return { value: char, endIndex: index };
}
function _readFixedBaseEscape(command, startIndex, base, maxLength, fallbackEndIndex) {
  let digits = "";
  let endIndex = startIndex - 1;
  const digitRegex = base === 16 ? /[0-9a-fA-F]/ : /[0-7]/;
  for (let i = startIndex;i < command.length && digits.length < maxLength; i++) {
    const char = command[i];
    if (!char || !digitRegex.test(char))
      break;
    digits += char;
    endIndex = i;
  }
  if (!digits) {
    return { value: command[fallbackEndIndex] ?? "", endIndex: fallbackEndIndex };
  }
  return { value: String.fromCodePoint(Number.parseInt(digits, base)), endIndex };
}
function _singleQuoteShellToken(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
function _stripAttachedIoNumbers(command) {
  let result = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let atTokenBoundary = true;
  let arithmeticParenDepth = 0;
  for (let i = 0;i < command.length; ) {
    const char = command[i];
    if (!char) {
      break;
    }
    if (escaped) {
      result += char;
      escaped = false;
      atTokenBoundary = false;
      i++;
      continue;
    }
    if (!inSingle && char === "\\") {
      result += char;
      escaped = true;
      i++;
      continue;
    }
    if (!inDouble && char === "'") {
      result += char;
      inSingle = !inSingle;
      atTokenBoundary = false;
      i++;
      continue;
    }
    if (!inSingle && char === '"') {
      result += char;
      inDouble = !inDouble;
      atTokenBoundary = false;
      i++;
      continue;
    }
    if (!inSingle && char === "`") {
      const endIndex = _findBacktickEnd(command, i + 1);
      if (endIndex === -1) {
        result += char;
        atTokenBoundary = false;
        i++;
        continue;
      }
      result += `$(${command.slice(i + 1, endIndex)})`;
      if (atTokenBoundary && command[endIndex + 1] && _isPathLikeBacktickSuffix(command[endIndex + 1])) {
        result += BACKTICK_ATTACHED_SUFFIX_SENTINEL;
      }
      atTokenBoundary = false;
      i = endIndex + 1;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (arithmeticParenDepth === 0 && command.startsWith("$((", i)) {
        result += `$( ${ARITHMETIC_SENTINEL} `;
        arithmeticParenDepth = 1;
        atTokenBoundary = false;
        i += 3;
        continue;
      }
      if (arithmeticParenDepth > 0) {
        if (char === "(") {
          arithmeticParenDepth++;
          result += char;
        } else if (char === ")") {
          arithmeticParenDepth--;
          if (arithmeticParenDepth === 0) {
            result += ")";
            if (command[i + 1] === ")") {
              i += 2;
            } else {
              i++;
            }
            atTokenBoundary = false;
            continue;
          }
          result += char;
        } else {
          result += char;
        }
        atTokenBoundary = false;
        i++;
        continue;
      }
      if (_isWhitespaceChar(char)) {
        result += char;
        atTokenBoundary = true;
        i++;
        continue;
      }
      if (atTokenBoundary && _isAsciiDigit(char)) {
        let end = i + 1;
        while (end < command.length) {
          const nextChar = command[end];
          if (!nextChar || !_isAsciiDigit(nextChar)) {
            break;
          }
          end++;
        }
        const redirectOpLength = _getRawRedirectOpLength(command, end);
        if (redirectOpLength > 0) {
          i = end;
          atTokenBoundary = true;
          continue;
        }
      }
    }
    result += char;
    atTokenBoundary = _isShellTokenBoundaryChar(char);
    i++;
  }
  return result;
}
function isOperator(token) {
  return typeof token === "object" && token !== null && "op" in token && SHELL_OPERATORS.has(token.op);
}
function isOperatorToken(token) {
  return token !== undefined && isOperator(token);
}
var REDIRECT_OPS = new Set([">", ">>", "<", ">&", "<&", ">|"]);
var RAW_REDIRECT_OPS = [">>", ">&", "<&", ">|", ">", "<"];
function _isRedirectOp(token) {
  return typeof token === "object" && token !== null && "op" in token && REDIRECT_OPS.has(token.op);
}
function _isCommandSubstitutionStart(tokens, index) {
  return tokens[index] === "$" && isParenOpen(tokens[index + 1]);
}
function _isAttachedCommandSubstitutionStart(tokens, index) {
  const token = tokens[index];
  return typeof token === "string" && token !== "$" && token.endsWith("$") && isParenOpen(tokens[index + 1]);
}
function _getBacktickAttachedSuffix(token) {
  return typeof token === "string" && token.startsWith(BACKTICK_ATTACHED_SUFFIX_SENTINEL) ? token.slice(BACKTICK_ATTACHED_SUFFIX_SENTINEL.length) : null;
}
function _isProcessSubstitutionStart(tokens, index) {
  const token = tokens[index];
  return typeof token === "object" && token !== null && "op" in token && (token.op === "<(" || token.op === ">" && isParenOpen(tokens[index + 1]));
}
function extractProcessSubstitution(tokens, startIndex) {
  const token = tokens[startIndex];
  if (typeof token === "object" && token !== null && "op" in token && token.op === "<(") {
    return extractCommandSubstitution(tokens, startIndex + 1);
  }
  if (_isProcessSubstitutionStart(tokens, startIndex)) {
    return extractCommandSubstitution(tokens, startIndex + 2);
  }
  return { innerSegments: [], endIndex: startIndex };
}
function _getRedirectTargetInfo(tokens, index) {
  if (_isCommandSubstitutionStart(tokens, index + 1) || _isProcessSubstitutionStart(tokens, index + 1)) {
    return { redirectTarget: null, advance: 1 };
  }
  const firstTarget = tokens[index + 1];
  if (typeof firstTarget !== "string") {
    const isGlobTarget = firstTarget && typeof firstTarget === "object" && "pattern" in firstTarget && typeof firstTarget.pattern === "string";
    return { redirectTarget: null, advance: isGlobTarget ? 2 : 1 };
  }
  let redirectTarget = firstTarget;
  let nextIndex = index + 2;
  if (firstTarget.endsWith("$") && isParenOpen(tokens[nextIndex])) {
    const { text, consumed } = _collectParenthesizedTokens(tokens, nextIndex);
    if (consumed > 0) {
      redirectTarget += text;
      nextIndex += consumed;
    }
  }
  return {
    redirectTarget,
    advance: nextIndex - index
  };
}
function _findInlineCommandSubstitutionEnd(token, startIndex) {
  let depth = 1;
  const quoteState = { inSingle: false, inDouble: false, escaped: false };
  for (let i = startIndex;i < token.length; i++) {
    const char = token[i];
    if (!char) {
      break;
    }
    if (advanceQuoteScanState(char, quoteState)) {
      continue;
    }
    if (!quoteState.inSingle && !quoteState.inDouble) {
      if (char === "(") {
        depth++;
      } else if (char === ")") {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
  }
  return -1;
}
function _findBacktickEnd(command, startIndex) {
  let escaped = false;
  for (let i = startIndex;i < command.length; i++) {
    const char = command[i];
    if (!char) {
      break;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "`") {
      return i;
    }
  }
  return -1;
}
function _collectParenthesizedTokens(tokens, startIndex) {
  if (!isParenOpen(tokens[startIndex])) {
    return { text: "", consumed: 0 };
  }
  const parts = [];
  let depth = 0;
  let i = startIndex;
  while (i < tokens.length) {
    const token = tokens[i];
    if (isParenOpen(token)) {
      depth++;
    } else if (isParenClose(token)) {
      depth--;
    }
    const piece = _stringifyParseEntry(token);
    if (piece) {
      parts.push(piece);
    }
    i++;
    if (depth === 0) {
      break;
    }
  }
  return { text: parts.join(" "), consumed: i - startIndex };
}
function _stringifyParseEntry(token) {
  if (typeof token === "string") {
    return token;
  }
  if (token && typeof token === "object") {
    if ("pattern" in token && typeof token.pattern === "string") {
      return token.pattern;
    }
    if ("op" in token) {
      return String(token.op);
    }
  }
  return "";
}
function _getRawRedirectOpLength(command, index) {
  for (const op of RAW_REDIRECT_OPS) {
    if (command.startsWith(op, index)) {
      return op.length;
    }
  }
  return 0;
}
function _isWhitespaceChar(char) {
  return /\s/.test(char);
}
function _isAsciiDigit(char) {
  return char >= "0" && char <= "9";
}
function _isPathLikeBacktickSuffix(char) {
  return char === "/" || char === ".";
}
function _isShellTokenBoundaryChar(char) {
  return _isWhitespaceChar(char) || ";|&()<>".includes(char);
}
// src/core/shell/wrappers.ts
import { realpathSync as realpathSync3 } from "node:fs";
import { isAbsolute as isAbsolute3, parse as parsePath2 } from "node:path";

// src/core/git/env.ts
var GIT_CONTEXT_ENV_OVERRIDES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE"
];
var GIT_CONTEXT_ENV_OVERRIDE_NAMES = new Set(GIT_CONTEXT_ENV_OVERRIDES);
var GIT_CONFIG_AFFECTING_ENV_NAMES = new Set([
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_CONFIG_SYSTEM",
  "HOME",
  "XDG_CONFIG_HOME"
]);
var GIT_SSH_ENV_NAMES = new Set([
  "GIT_SSH_COMMAND",
  "GIT_SSH",
  "GIT_SSH_VARIANT"
]);
var GIT_CONTEXT_APPEND_ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)\+=/;
function isGitContextEnvOverrideName(name) {
  return GIT_CONTEXT_ENV_OVERRIDE_NAMES.has(name);
}
function isGitConfigEnvName(name) {
  return name === "GIT_CONFIG_COUNT" || name === "GIT_CONFIG_PARAMETERS" || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(name);
}
function isTrackedGitEnvName(name) {
  return isGitContextEnvOverrideName(name) || GIT_CONFIG_AFFECTING_ENV_NAMES.has(name) || GIT_SSH_ENV_NAMES.has(name) || isGitConfigEnvName(name);
}
function parseGitContextAppendEnvAssignment(token) {
  const match = token.match(GIT_CONTEXT_APPEND_ASSIGNMENT_RE);
  const name = match?.[1];
  if (!name || !isTrackedGitEnvName(name)) {
    return null;
  }
  const eqIdx = token.indexOf("=");
  return { name, value: token.slice(eqIdx + 1) };
}
function hasGitSshEnvAssignment(envAssignments) {
  return hasAnyEnvAssignment(envAssignments, GIT_SSH_ENV_NAMES);
}
function hasConfigAffectingEnvAssignment(envAssignments) {
  return hasAnyEnvAssignment(envAssignments, GIT_CONFIG_AFFECTING_ENV_NAMES);
}
function hasAnyEnvAssignment(envAssignments, names) {
  if (!envAssignments) {
    return false;
  }
  for (const key of envAssignments.keys()) {
    if (names.has(key)) {
      return true;
    }
  }
  return false;
}

// src/core/path.ts
import { lstatSync, realpathSync as realpathSync2 } from "node:fs";
import { dirname as dirname2, isAbsolute as isAbsolute2, parse as parsePath, sep as sep2 } from "node:path";
function resolveChdirTarget(baseCwd, target) {
  const root = isAbsolute2(target) ? getPathRoot(target) : "";
  let current = root || baseCwd;
  for (const component of getPathComponents(root ? target.slice(root.length) : target)) {
    if (component === "" || component === ".") {
      continue;
    }
    if (component === "..") {
      current = dirname2(current);
      continue;
    }
    const candidate = appendPathWithoutNormalizing(current, component);
    current = lstatSync(candidate).isSymbolicLink() ? realpathSync2(candidate) : candidate;
  }
  return current;
}
function appendPathWithoutNormalizing(base, target) {
  return base.endsWith("/") || base.endsWith("\\") ? `${base}${target}` : `${base}${sep2}${target}`;
}
function getPathRoot(target) {
  return parsePath(target).root;
}
function getPathComponents(target) {
  const separator = process.platform === "win32" ? /[\\/]+/ : /\/+/;
  return target.split(separator);
}

// src/core/shell/wrappers.ts
var ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
function parseEnvAssignment(token) {
  if (!ENV_ASSIGNMENT_RE.test(token)) {
    return null;
  }
  const eqIdx = token.indexOf("=");
  return { name: token.slice(0, eqIdx), value: token.slice(eqIdx + 1) };
}
function stripEnvAssignmentsWithInfo(tokens) {
  const envAssignments = new Map;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      break;
    }
    const assignment = parseEnvAssignment(token);
    if (!assignment) {
      break;
    }
    envAssignments.set(assignment.name, assignment.value);
    i++;
  }
  return { tokens: tokens.slice(i), envAssignments };
}
function stripWrappers(tokens, cwd) {
  return stripWrappersWithInfo(tokens, cwd).tokens;
}
function stripWrappersWithInfo(tokens, cwd) {
  let result = [...tokens];
  const allEnvAssignments = new Map;
  let currentCwd = cwd;
  for (let iteration = 0;iteration < MAX_STRIP_ITERATIONS; iteration++) {
    const before = result.join(" ");
    const { tokens: strippedTokens, envAssignments } = stripEnvAssignmentsWithInfo(result);
    for (const [k, v] of envAssignments) {
      allEnvAssignments.set(k, v);
    }
    result = strippedTokens;
    if (result.length === 0)
      break;
    while (result.length > 0 && result[0]?.includes("=") && !ENV_ASSIGNMENT_RE.test(result[0] ?? "")) {
      const appendAssignment = parseGitContextAppendEnvAssignment(result[0] ?? "");
      if (appendAssignment) {
        allEnvAssignments.set(appendAssignment.name, appendAssignment.value);
      }
      result = result.slice(1);
    }
    if (result.length === 0)
      break;
    const head = result[0]?.toLowerCase();
    if (head !== "sudo" && head !== "env" && head !== "command") {
      break;
    }
    if (head === "sudo") {
      const sudoResult = stripSudoWithInfo(result, currentCwd);
      result = sudoResult.tokens;
      if (sudoResult.cwd !== undefined) {
        currentCwd = sudoResult.cwd;
      }
    }
    if (head === "env") {
      const envResult = stripEnvWithInfo(result, currentCwd);
      result = envResult.tokens;
      if (envResult.cwd !== undefined) {
        currentCwd = envResult.cwd;
      }
      for (const [k, v] of envResult.envAssignments) {
        allEnvAssignments.set(k, v);
      }
    }
    if (head === "command") {
      result = stripCommand(result);
    }
    if (result.join(" ") === before)
      break;
  }
  const { tokens: finalTokens, envAssignments: finalAssignments } = stripEnvAssignmentsWithInfo(result);
  for (const [k, v] of finalAssignments) {
    allEnvAssignments.set(k, v);
  }
  return { tokens: finalTokens, envAssignments: allEnvAssignments, cwd: currentCwd };
}
var SUDO_OPTS_WITH_VALUE = new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-T", "-U"]);
function stripSudoWithInfo(tokens, cwd) {
  let i = 1;
  let currentCwd = cwd;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      return { tokens: tokens.slice(i + 1), cwd: currentCwd };
    }
    if (!token.startsWith("-")) {
      break;
    }
    if (token === "-D" || token === "--chdir") {
      const target = tokens[i + 1];
      currentCwd = target ? resolveWrapperCwd(currentCwd, target) : null;
      i += 2;
      continue;
    }
    if (token.startsWith("--chdir=")) {
      currentCwd = resolveWrapperCwd(currentCwd, token.slice("--chdir=".length));
      i++;
      continue;
    }
    if (token.startsWith("-D") && token.length > 2) {
      currentCwd = resolveWrapperCwd(currentCwd, token.slice(2));
      i++;
      continue;
    }
    if (token === "-i" || token === "--login") {
      currentCwd = null;
      i++;
      continue;
    }
    if (SUDO_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }
    i++;
  }
  return { tokens: tokens.slice(i), cwd: currentCwd };
}
var ENV_OPTS_NO_VALUE = new Set(["-i", "-0", "--null"]);
var ENV_OPTS_WITH_VALUE = new Set([
  "-u",
  "--unset",
  "-C",
  "--chdir",
  "-S",
  "--split-string",
  "-P"
]);
function stripEnvWithInfo(tokens, cwd) {
  const envAssignments = new Map;
  let currentCwd = cwd;
  let expandedTokens = tokens;
  let i = 1;
  while (i < expandedTokens.length) {
    const token = expandedTokens[i];
    if (!token)
      break;
    if (token === "--") {
      return { tokens: expandedTokens.slice(i + 1), envAssignments, cwd: currentCwd };
    }
    if (ENV_OPTS_NO_VALUE.has(token)) {
      i++;
      continue;
    }
    if (token === "-S" || token === "--split-string") {
      const splitValue = expandedTokens[i + 1];
      const splitTokens = splitValue !== undefined ? parseEnvSplitString(splitValue) : null;
      if (!splitTokens) {
        currentCwd = null;
        i += 2;
        continue;
      }
      expandedTokens = replaceEnvSplitTokens(expandedTokens, i, 2, splitTokens);
      continue;
    }
    if (token.startsWith("-S") && token.length > 2) {
      const splitTokens = parseEnvSplitString(token.slice("-S".length));
      if (!splitTokens) {
        currentCwd = null;
        i++;
        continue;
      }
      expandedTokens = replaceEnvSplitTokens(expandedTokens, i, 1, splitTokens);
      continue;
    }
    if (token.startsWith("--split-string=")) {
      const splitTokens = parseEnvSplitString(token.slice("--split-string=".length));
      if (!splitTokens) {
        currentCwd = null;
        i++;
        continue;
      }
      expandedTokens = replaceEnvSplitTokens(expandedTokens, i, 1, splitTokens);
      continue;
    }
    if (ENV_OPTS_WITH_VALUE.has(token)) {
      if (token === "-C" || token === "--chdir") {
        const target = expandedTokens[i + 1];
        currentCwd = target ? resolveWrapperCwd(currentCwd, target) : null;
      }
      i += 2;
      continue;
    }
    if (token.startsWith("-u=") || token.startsWith("--unset=")) {
      i++;
      continue;
    }
    if (token.startsWith("-C") && token.length > 2 || token.startsWith("--chdir=")) {
      const target = token.startsWith("--chdir=") ? token.slice("--chdir=".length) : token.startsWith("-C=") ? token.slice("-C=".length) : token.slice("-C".length);
      currentCwd = resolveWrapperCwd(currentCwd, target);
      i++;
      continue;
    }
    if (token.startsWith("-P")) {
      i++;
      continue;
    }
    if (token.startsWith("-")) {
      i++;
      continue;
    }
    const assignment = parseEnvAssignment(token);
    if (!assignment) {
      break;
    }
    envAssignments.set(assignment.name, assignment.value);
    i++;
  }
  return { tokens: expandedTokens.slice(i), envAssignments, cwd: currentCwd };
}
function parseEnvSplitString(value) {
  if (hasUnclosedQuotes(value)) {
    return null;
  }
  const parsed = $parse(value, ENV_PROXY);
  const result = [];
  for (const entry of parsed) {
    const token = getCommandTokenText(entry);
    if (token === null) {
      return null;
    }
    result.push(token);
  }
  return result;
}
function replaceEnvSplitTokens(tokens, index, consumed, splitTokens) {
  return [...tokens.slice(0, index), ...splitTokens, ...tokens.slice(index + consumed)];
}
function resolveWrapperCwd(cwd, target) {
  if (target === "") {
    return null;
  }
  try {
    if (!cwd && !isAbsolute3(target)) {
      return null;
    }
    const baseCwd = isAbsolute3(target) ? getPathRoot2(target) : realpathSync3(cwd ?? "/");
    return resolveChdirTarget(baseCwd, target);
  } catch {
    return null;
  }
}
function getPathRoot2(target) {
  return parsePath2(target).root;
}
function stripCommand(tokens) {
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "-p" || token === "-v" || token === "-V") {
      i++;
      continue;
    }
    if (token === "--") {
      return tokens.slice(i + 1);
    }
    if (token.startsWith("-") && !token.startsWith("--") && token.length > 1) {
      const chars = token.slice(1);
      if (!/^[pvV]+$/.test(chars)) {
        break;
      }
      i++;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}
// src/core/analyze/find.ts
var REASON_FIND_DELETE = "find -delete permanently removes files. Use -print first to preview.";
var REASON_FIND_EXEC_RM_RF = "find -exec rm -rf is dangerous. Use explicit file list instead.";
var FIND_PRIMARIES_WITH_VALUE = new Set([
  "-amin",
  "-anewer",
  "-atime",
  "-cmin",
  "-cnewer",
  "-context",
  "-ctime",
  "-exec",
  "-execdir",
  "-fprint",
  "-fprintf",
  "-fstype",
  "-gid",
  "-group",
  "-ilname",
  "-iname",
  "-inum",
  "-ipath",
  "-iwholename",
  "-iregex",
  "-links",
  "-lname",
  "-mmin",
  "-mtime",
  "-name",
  "-newer",
  "-newerXY",
  "-path",
  "-perm",
  "-printf",
  "-regex",
  "-samefile",
  "-size",
  "-type",
  "-uid",
  "-used",
  "-user",
  "-wholename",
  "-xtype"
]);
function analyzeFind(tokens, context = {}) {
  return analyzeFindMatch(tokens, context)?.reason ?? null;
}
function analyzeFindMatch(tokens, context = {}) {
  if (findHasDelete(tokens.slice(1))) {
    return destructiveCommandMatch("find.delete", REASON_FIND_DELETE);
  }
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "-exec" || token === "-execdir") {
      const execCommand = getFindExecCommand(tokens, i);
      const directReason = analyzeFindExecCommand(execCommand);
      if (directReason) {
        return directReason;
      }
      if (context.analyzeTokens) {
        const reason = context.analyzeTokens(execCommand, token === "-execdir" ? null : context.cwd);
        if (reason) {
          return reason;
        }
        continue;
      }
      if (context.analyzeNested) {
        const reason = context.analyzeNested(execCommand.join(" "), {
          effectiveCwd: token === "-execdir" ? undefined : context.cwd,
          envAssignments: context.envAssignments
        });
        if (reason) {
          return reason;
        }
        continue;
      }
      const fallbackReason = analyzeFindExecCommand(execCommand);
      if (fallbackReason)
        return fallbackReason;
    }
  }
  return null;
}
function analyzeFindExecCommand(tokens) {
  let execCommand = stripWrappers([...tokens]);
  if (execCommand.length === 0) {
    return null;
  }
  let head = getBasename(execCommand[0] ?? "");
  if (head === "busybox" && execCommand.length > 1) {
    execCommand = execCommand.slice(1);
    head = getBasename(execCommand[0] ?? "");
  }
  if (head === "rm" && hasRecursiveForceFlags(execCommand)) {
    return destructiveCommandMatch("find.exec-rm-recursive-force", REASON_FIND_EXEC_RM_RF);
  }
  return null;
}
function getFindExecCommand(tokens, execIndex) {
  const execTokens = tokens.slice(execIndex + 1);
  const semicolonIdx = execTokens.indexOf(";");
  const plusIdx = execTokens.indexOf("+");
  const endIdx = semicolonIdx !== -1 && plusIdx !== -1 ? Math.min(semicolonIdx, plusIdx) : semicolonIdx !== -1 ? semicolonIdx : plusIdx !== -1 ? plusIdx : execTokens.length;
  return execTokens.slice(0, endIdx);
}
function findHasDelete(tokens) {
  let i = 0;
  let insideExec = false;
  let execDepth = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i++;
      continue;
    }
    if (token === "-exec" || token === "-execdir") {
      insideExec = true;
      execDepth++;
      i++;
      continue;
    }
    if (insideExec && (token === ";" || token === "+")) {
      execDepth--;
      if (execDepth === 0) {
        insideExec = false;
      }
      i++;
      continue;
    }
    if (insideExec) {
      i++;
      continue;
    }
    if (findPrimaryTakesValue(token)) {
      i += 2;
      continue;
    }
    if (token === "-delete") {
      return true;
    }
    i++;
  }
  return false;
}
function findPrimaryTakesValue(token) {
  return FIND_PRIMARIES_WITH_VALUE.has(token) || /^-newer[A-Za-z]{2}$/.test(token);
}

// src/core/analyze/interpreters.ts
var REASON_INTERPRETER_DANGEROUS = "Interpreter code contains a dangerous command. Run the underlying command directly so it can be analyzed, or use the safer alternative for that command.";
var REASON_INTERPRETER_BLOCKED = "Interpreter one-liners are blocked in paranoid mode. Write the code to a script file and run it, or run the equivalent shell command directly. (Paranoid mode enabled.)";
var CODE_FLAGS = new Map([
  ["python", new Set(["-c"])],
  ["node", new Set(["-e", "--eval"])],
  ["ruby", new Set(["-e"])],
  ["perl", new Set(["-e", "-E"])]
]);
var CLUSTERED_CODE_FLAGS = new Map([
  ["python", new Set(["c"])],
  ["node", new Set(["e"])],
  ["ruby", new Set(["e"])],
  ["perl", new Set(["e", "E"])]
]);
function extractInterpreterCodeArg(tokens) {
  const interpreter = normalizeInterpreter(tokens[0] ?? "");
  for (let i = 1;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token)
      continue;
    if (isInterpreterCodeFlag(interpreter, token)) {
      return tokens[i + 1] || null;
    }
    const inlineEval = /^--eval=(.*)$/s.exec(token);
    if (supportsInlineEval(interpreter) && inlineEval?.[1]) {
      return inlineEval[1];
    }
    const shortCodeArg = extractShortCodeArg(interpreter, token, tokens[i + 1]);
    if (shortCodeArg)
      return shortCodeArg;
  }
  return null;
}
function isInterpreterCommand(command2) {
  return CODE_FLAGS.has(normalizeInterpreter(command2));
}
function normalizeInterpreter(command2) {
  const interpreter = getBasename(command2).toLowerCase();
  return PYTHON_INTERPRETER_PATTERN.test(interpreter) ? "python" : interpreter;
}
function isInterpreterCodeFlag(interpreter, token) {
  return CODE_FLAGS.get(interpreter)?.has(token) ?? false;
}
function supportsInlineEval(interpreter) {
  return CODE_FLAGS.get(interpreter)?.has("--eval") ?? false;
}
function extractShortCodeArg(interpreter, token, nextToken) {
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2) {
    return null;
  }
  const flags = CLUSTERED_CODE_FLAGS.get(interpreter);
  const codeFlagIndex = Array.from(token.slice(1)).findIndex((flag) => flags?.has(flag) ?? false);
  if (codeFlagIndex < 0)
    return null;
  return token.slice(codeFlagIndex + 2) || nextToken || null;
}
function containsDangerousCode(code) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return true;
    }
  }
  return false;
}

// src/core/analyze/rm.ts
var REASON_RM_RF = "rm -rf outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.";
var REASON_RM_RF_DYNAMIC_TARGET = "rm -rf target contains shell variables that cannot be verified safely. Use literal paths within cwd, /tmp, /var/tmp, or $TMPDIR.";
var REASON_RM_RF_ROOT_HOME = "rm -rf targeting root or home directory is extremely dangerous and always blocked.";
var REASON_RM_HOME_CWD = "rm -rf in home directory is dangerous. Change to a project directory first.";
function analyzeRm(tokens, options2 = {}) {
  return analyzeRmMatch(tokens, options2)?.reason ?? null;
}
function analyzeRmMatch(tokens, options2 = {}) {
  const ctx = createRecursiveDeleteTargetContext(options2);
  if (!hasRecursiveForceFlags(tokens)) {
    return null;
  }
  const targets = extractTargets(tokens);
  for (const target of targets) {
    const classification = classifyRecursiveDeleteTarget(target, ctx);
    const reason = reasonForClassification(classification, ctx);
    if (reason) {
      return reason;
    }
  }
  return null;
}
function extractTargets(tokens) {
  const targets = [];
  let pastDoubleDash = false;
  for (let i = 1;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token)
      continue;
    if (token === "--") {
      pastDoubleDash = true;
      continue;
    }
    if (pastDoubleDash) {
      targets.push(token);
      continue;
    }
    if (!token.startsWith("-")) {
      targets.push(token);
    }
  }
  return targets;
}
function reasonForClassification(classification, ctx) {
  switch (classification.kind) {
    case "root_or_home_target":
      return destructiveCommandMatch("rm.recursive-force-root-or-home", REASON_RM_RF_ROOT_HOME);
    case "temp_target":
      return null;
    case "dynamic_target":
      return destructiveCommandMatch("rm.recursive-force-dynamic-target", REASON_RM_RF_DYNAMIC_TARGET);
    case "home_cwd_target":
      return destructiveCommandMatch("rm.recursive-force-home-cwd", REASON_RM_HOME_CWD);
    case "cwd_self_target":
      return destructiveCommandMatch("rm.recursive-force-cwd-self", REASON_RM_RF);
    case "within_anchored_cwd":
      if (ctx.paranoid) {
        return destructiveCommandMatch("rm.recursive-force-paranoid", `${REASON_RM_RF} (${ENV_FLAGS.paranoidRm.name} enabled)`);
      }
      return null;
    case "outside_anchored_cwd":
      return destructiveCommandMatch("rm.recursive-force-outside-cwd", REASON_RM_RF);
  }
}

// src/core/analyze/shell-wrappers.ts
function extractDashCArg(tokens) {
  for (let i = 1;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token)
      continue;
    if (token === "-c") {
      return getCommandStringAfterDashC(tokens, i, true);
    }
    if (token.startsWith("-") && token.includes("c") && !token.startsWith("--")) {
      return getCommandStringAfterDashC(tokens, i, false);
    }
  }
  return null;
}
function getCommandStringAfterDashC(tokens, dashCIndex, allowDashCommand) {
  if (tokens[dashCIndex + 1] === "--") {
    return tokens[dashCIndex + 2] || null;
  }
  const commandString = tokens[dashCIndex + 1];
  if (!commandString || !allowDashCommand && commandString.startsWith("-")) {
    return null;
  }
  return commandString;
}

// src/core/git/worktree.ts
import { existsSync, lstatSync as lstatSync2, readFileSync as readFileSync2, realpathSync as realpathSync4, statSync } from "node:fs";
import { dirname as dirname3, isAbsolute as isAbsolute4, join as join3, resolve as resolve3 } from "node:path";
var GIT_GLOBAL_OPTS_WITH_VALUE = new Set([
  "-c",
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env"
]);
function hasGitContextEnvOverride(envAssignments) {
  for (const name of GIT_CONTEXT_ENV_OVERRIDES) {
    if (envAssignments?.has(name) || Object.hasOwn(process.env, name)) {
      return true;
    }
  }
  return false;
}
function getGitExecutionContext(tokens, cwd) {
  if (!cwd) {
    return { gitCwd: null, hasExplicitGitContext: false };
  }
  let gitCwd;
  try {
    gitCwd = realpathSync4(resolve3(cwd));
  } catch {
    return { gitCwd: null, hasExplicitGitContext: false };
  }
  if (!isDirectory(gitCwd)) {
    return { gitCwd: null, hasExplicitGitContext: false };
  }
  let hasExplicitGitContext = false;
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      break;
    }
    if (!token.startsWith("-")) {
      break;
    }
    if (token === "-C") {
      const target = tokens[i + 1];
      if (!target) {
        return { gitCwd: null, hasExplicitGitContext };
      }
      const resolvedCwd = resolveGitCwd(gitCwd, target);
      if (!resolvedCwd) {
        return { gitCwd: null, hasExplicitGitContext };
      }
      gitCwd = resolvedCwd;
      i += 2;
      continue;
    }
    if (token.startsWith("-C") && token.length > 2) {
      const resolvedCwd = resolveGitCwd(gitCwd, token.slice(2));
      if (!resolvedCwd) {
        return { gitCwd: null, hasExplicitGitContext };
      }
      gitCwd = resolvedCwd;
      i++;
      continue;
    }
    if (token === "--git-dir" || token === "--work-tree") {
      hasExplicitGitContext = true;
      i += 2;
      continue;
    }
    if (token.startsWith("--git-dir=") || token.startsWith("--work-tree=")) {
      hasExplicitGitContext = true;
      i++;
      continue;
    }
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
    } else if (token.startsWith("-c") && token.length > 2) {
      i++;
    } else {
      i++;
    }
  }
  return { gitCwd, hasExplicitGitContext };
}
function isLinkedWorktree(cwd) {
  const dotGitPath = findDotGit(cwd);
  if (!dotGitPath) {
    return false;
  }
  try {
    const stat = lstatSync2(dotGitPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return false;
    }
    const content = readFileSync2(dotGitPath, "utf-8");
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine.startsWith("gitdir:")) {
      return false;
    }
    const rawGitDir = firstLine.slice("gitdir:".length).trim();
    if (rawGitDir === "") {
      return false;
    }
    const gitDir = isAbsolute4(rawGitDir) ? rawGitDir : resolve3(dirname3(dotGitPath), rawGitDir);
    if (!existsSync(join3(gitDir, "commondir"))) {
      return false;
    }
    if (!worktreeGitdirBacklinkMatches(gitDir, dotGitPath)) {
      return false;
    }
    return worktreeConfigMatchesRoot(gitDir, dirname3(dotGitPath));
  } catch {
    return false;
  }
}
function worktreeGitdirBacklinkMatches(gitDir, dotGitPath) {
  const rawBacklink = readWorktreeGitdirBacklink(gitDir);
  return rawBacklink === null ? false : gitDirPathReferenceMatches(gitDir, rawBacklink, dotGitPath);
}
function worktreeConfigMatchesRoot(gitDir, worktreeRoot) {
  const configuredWorktree = readWorktreeConfigWorktree(gitDir);
  return configuredWorktree === null ? true : gitDirPathReferenceMatches(gitDir, configuredWorktree, worktreeRoot);
}
function readWorktreeGitdirBacklink(gitDir) {
  const backlinkPath = join3(gitDir, "gitdir");
  if (!existsSync(backlinkPath))
    return null;
  const rawBacklink = readFileSync2(backlinkPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
  return rawBacklink === "" ? null : rawBacklink;
}
function readWorktreeConfigWorktree(gitDir) {
  const configWorktreePath = join3(gitDir, "config.worktree");
  return existsSync(configWorktreePath) ? readCoreWorktree(configWorktreePath) : null;
}
function gitDirPathReferenceMatches(gitDir, target, expectedPath) {
  return sameFilesystemPathOrFalse(resolveGitDirPath(gitDir, target), expectedPath);
}
function resolveGitDirPath(gitDir, target) {
  return isAbsolute4(target) ? target : resolve3(gitDir, target);
}
function sameFilesystemPathOrFalse(left, right) {
  try {
    return sameFilesystemPath(left, right);
  } catch {
    return false;
  }
}
function sameFilesystemPath(left, right) {
  try {
    const leftStat = statSync(left);
    const rightStat = statSync(right);
    if (leftStat.ino !== 0 && rightStat.ino !== 0 && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino) {
      return true;
    }
  } catch {}
  return getCanonicalPathForComparison(left) === getCanonicalPathForComparison(right);
}
function getCanonicalPathForComparison(path) {
  return normalizePathForComparison2(realpathSync4.native(path));
}
function normalizePathForComparison2(path) {
  let normalized = path.replace(/^\\\\\?\\UNC\\/i, "//").replace(/^\\\\\?\\/i, "");
  normalized = normalized.replace(/\\/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function readCoreWorktree(configPath) {
  const content = readFileSync2(configPath, "utf-8");
  let inCore = false;
  let configuredWorktree = null;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }
    if (trimmed.startsWith("[")) {
      inCore = /^\[core\]$/i.test(trimmed);
      continue;
    }
    if (!inCore) {
      continue;
    }
    const match = trimmed.match(/^worktree\s*=\s*(.*)$/i);
    if (match) {
      configuredWorktree = parseGitConfigValue(match[1] ?? "");
    }
  }
  return configuredWorktree;
}
function parseGitConfigValue(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }
  return unescapeDoubleQuotedGitConfigValue(trimmed.slice(1, -1));
}
function unescapeDoubleQuotedGitConfigValue(value) {
  let result = "";
  for (let i = 0;i < value.length; i++) {
    const char = value[i];
    if (char !== "\\") {
      result += char;
      continue;
    }
    const next = value[i + 1];
    if (next === undefined) {
      result += char;
      continue;
    }
    switch (next) {
      case "\\":
      case '"':
        result += next;
        break;
      case "n":
        result += `
`;
        break;
      case "t":
        result += "\t";
        break;
      case "b":
        result += "\b";
        break;
      default:
        result += `\\${next}`;
        break;
    }
    i++;
  }
  return result;
}
function resolveGitCwd(baseCwd, target) {
  try {
    const resolved = resolveChdirTarget(baseCwd, target);
    return isDirectory(resolved) ? resolved : null;
  } catch {
    return null;
  }
}
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
function findDotGit(cwd) {
  try {
    return findDotGitInAncestors(realpathSync4(cwd));
  } catch {
    return null;
  }
}
function findDotGitInAncestors(cwd) {
  let current = cwd;
  while (true) {
    const dotGitPath = join3(current, ".git");
    if (existsSync(dotGitPath)) {
      return dotGitPath;
    }
    const parent = dirname3(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

// src/core/git/parse.ts
var MAX_GIT_ALIAS_EXPANSION_DEPTH = 5;
var REASON_GIT_ALIAS_CONFIG = "Git aliases supplied through command-line or environment config can hide or execute commands. Run git without Git alias overrides, or ask the user to run it manually.";
function splitAtDoubleDash(tokens) {
  const index = tokens.indexOf("--");
  if (index === -1) {
    return { index: -1, before: tokens, after: [] };
  }
  return {
    index,
    before: tokens.slice(0, index),
    after: tokens.slice(index + 1)
  };
}
function resolveGitCommandLineAliases(tokens, envAssignments) {
  const configEntries = getGitConfigEntries(tokens, envAssignments);
  if (configEntries.blockedReason) {
    return { blockedReason: configEntries.blockedReason, expanded: false, tokens };
  }
  const aliases = getGitConfigAliases(configEntries.entries);
  if (aliases.size === 0) {
    return { blockedReason: null, expanded: false, tokens };
  }
  let currentTokens = tokens;
  let expanded = false;
  for (let depth = 0;depth < MAX_GIT_ALIAS_EXPANSION_DEPTH; depth++) {
    const { subcommand, rest } = extractGitSubcommandAndRest(currentTokens);
    const aliasName = subcommand?.toLowerCase();
    if (!aliasName || !aliases.has(aliasName)) {
      return { blockedReason: null, expanded, tokens: currentTokens };
    }
    const aliasValue = aliases.get(aliasName);
    const aliasTokens = parseGitAliasValue(aliasValue);
    if (aliasTokens === null || aliasTokens.length === 0) {
      return { blockedReason: REASON_GIT_ALIAS_CONFIG, expanded: true, tokens: currentTokens };
    }
    currentTokens = ["git", ...aliasTokens, ...rest];
    expanded = true;
  }
  return { blockedReason: REASON_GIT_ALIAS_CONFIG, expanded: true, tokens: currentTokens };
}
function hasGitCommandLineSshCommandConfig(tokens, envAssignments) {
  return getGitConfigEntries(tokens, envAssignments).entries.some((entry) => entry.key.toLowerCase() === "core.sshcommand");
}
function extractGitSubcommandAndRest(tokens) {
  if (tokens.length === 0) {
    return { subcommand: null, rest: [] };
  }
  const firstToken = tokens[0];
  const command2 = firstToken ? getBasename(firstToken).toLowerCase() : null;
  if (command2 !== "git") {
    return { subcommand: null, rest: [] };
  }
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith("-")) {
        return { subcommand: nextToken, rest: tokens.slice(i + 2) };
      }
      return { subcommand: null, rest: tokens.slice(i + 1) };
    }
    if (token.startsWith("-")) {
      if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
        i += 2;
      } else if (token.startsWith("-c") && token.length > 2) {
        i++;
      } else if (token.startsWith("-C") && token.length > 2) {
        i++;
      } else {
        i++;
      }
    } else {
      return { subcommand: token, rest: tokens.slice(i + 1) };
    }
  }
  return { subcommand: null, rest: [] };
}
function getGitConfigAliases(entries) {
  const aliases = new Map;
  for (const entry of entries) {
    const key = entry.key.toLowerCase();
    if (!key.startsWith("alias.")) {
      continue;
    }
    const name = key.slice("alias.".length);
    if (name !== "") {
      aliases.set(name, entry.value);
    }
  }
  return aliases;
}
function getGitConfigEntries(tokens, envAssignments) {
  if (tokens.length === 0) {
    return { blockedReason: null, entries: [] };
  }
  const firstToken = tokens[0];
  const command2 = firstToken ? getBasename(firstToken).toLowerCase() : null;
  if (command2 !== "git") {
    return { blockedReason: null, entries: [] };
  }
  const envEntries = getGitEnvConfigEntries(envAssignments);
  if (envEntries.blockedReason) {
    return envEntries;
  }
  return {
    blockedReason: null,
    entries: [...envEntries.entries, ...getGitCommandLineConfigEntries(tokens, envAssignments)]
  };
}
function getGitCommandLineConfigEntries(tokens, envAssignments) {
  const entries = [];
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || token === "--" || !token.startsWith("-")) {
      return entries;
    }
    if (token === "-c") {
      const entry = parseGitConfigEntry(tokens[i + 1]);
      if (entry) {
        entries.push(entry);
      }
      i += 2;
      continue;
    }
    if (token.startsWith("-c") && token.length > 2) {
      const entry = parseGitConfigEntry(token.slice(2));
      if (entry) {
        entries.push(entry);
      }
      i++;
      continue;
    }
    if (token === "--config-env") {
      const entry = parseGitConfigEnvEntry(tokens[i + 1], envAssignments);
      if (entry) {
        entries.push(entry);
      }
      i += 2;
      continue;
    }
    if (token.startsWith("--config-env=")) {
      const entry = parseGitConfigEnvEntry(token.slice("--config-env=".length), envAssignments);
      if (entry) {
        entries.push(entry);
      }
      i++;
      continue;
    }
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }
    i++;
  }
  return entries;
}
function getGitEnvConfigEntries(envAssignments) {
  const parameterEntries = getGitConfigParameterEntries(envAssignments);
  if (parameterEntries === null) {
    return { blockedReason: REASON_GIT_ALIAS_CONFIG, entries: [] };
  }
  return {
    blockedReason: null,
    entries: [...parameterEntries, ...getGitConfigCountEntries(envAssignments)]
  };
}
function getGitConfigParameterEntries(envAssignments) {
  const parameters = getEnvConfigValue("GIT_CONFIG_PARAMETERS", envAssignments);
  if (parameters === undefined) {
    return [];
  }
  if (hasUnclosedQuotes(parameters)) {
    return null;
  }
  const entries = [];
  for (const entry of $parse(parameters, ENV_PROXY)) {
    const token = getCommandTokenText(entry);
    const configEntry = parseGitConfigEntry(token ?? undefined);
    if (!configEntry) {
      return null;
    }
    entries.push(configEntry);
  }
  return entries;
}
function getGitConfigCountEntries(envAssignments) {
  const countValue = getEnvConfigValue("GIT_CONFIG_COUNT", envAssignments);
  if (countValue === undefined) {
    return [];
  }
  if (!/^\d+$/.test(countValue)) {
    return [];
  }
  const count = Number.parseInt(countValue, 10);
  if (!Number.isSafeInteger(count)) {
    return [];
  }
  const entries = [];
  for (let i = 0;i < count; i++) {
    const key = getEnvConfigValue(`GIT_CONFIG_KEY_${i}`, envAssignments)?.trim();
    const value = getEnvConfigValue(`GIT_CONFIG_VALUE_${i}`, envAssignments);
    if (!key || value === undefined) {
      return [];
    }
    entries.push({ key, value });
  }
  return entries;
}
function parseGitConfigEntry(config) {
  if (!config) {
    return null;
  }
  const eqIdx = config.indexOf("=");
  return {
    key: (eqIdx === -1 ? config : config.slice(0, eqIdx)).trim(),
    value: eqIdx === -1 ? undefined : config.slice(eqIdx + 1)
  };
}
function parseGitConfigEnvEntry(configEnv, envAssignments) {
  const eqIdx = configEnv?.indexOf("=") ?? -1;
  if (!configEnv || eqIdx === -1) {
    return null;
  }
  return {
    key: configEnv.slice(0, eqIdx).trim(),
    value: getEnvConfigValue(configEnv.slice(eqIdx + 1), envAssignments)
  };
}
function getEnvConfigValue(name, envAssignments) {
  return envAssignments?.get(name) ?? process.env[name];
}
function parseGitAliasValue(value) {
  const trimmedValue = value?.trimStart();
  if (!trimmedValue || trimmedValue.startsWith("!") || hasUnclosedQuotes(trimmedValue)) {
    return null;
  }
  const result = [];
  for (const entry of $parse(trimmedValue, ENV_PROXY)) {
    const token = getCommandTokenText(entry);
    if (token === null) {
      return null;
    }
    result.push(token);
  }
  return result;
}

// src/core/git/rules.ts
var REASON_CHECKOUT_DOUBLE_DASH = "git checkout -- discards uncommitted changes permanently. Use 'git stash' first.";
var REASON_CHECKOUT_FORCE = "git checkout --force discards uncommitted changes. Use 'git stash' first.";
var REASON_CHECKOUT_REF_PATH = "git checkout <ref> -- <path> overwrites working tree with ref version. Use 'git stash' first.";
var REASON_CHECKOUT_PATHSPEC_FROM_FILE = "git checkout --pathspec-from-file can overwrite multiple files. Use 'git stash' first.";
var REASON_CHECKOUT_AMBIGUOUS = "git checkout with multiple positional args may overwrite files. Use 'git switch' for branches or 'git restore' for files.";
var REASON_SWITCH_DISCARD_CHANGES = "git switch --discard-changes discards uncommitted changes. Use 'git stash' first.";
var REASON_SWITCH_FORCE = "git switch --force discards uncommitted changes. Use 'git stash' first.";
var REASON_RESTORE = "git restore discards uncommitted changes. Use 'git stash' first, or use --staged to only unstage.";
var REASON_RESTORE_WORKTREE = "git restore --worktree explicitly discards working tree changes. Use 'git stash' first.";
var REASON_RESET_HARD = "git reset --hard destroys all uncommitted changes permanently. Use 'git stash' first.";
var REASON_RESET_MERGE = "git reset --merge can lose uncommitted changes. Use 'git stash' first.";
var REASON_CLEAN = "git clean -f removes untracked files permanently. Use 'git clean -n' to preview first.";
var REASON_PUSH_FORCE = "git push --force destroys remote history. Use --force-with-lease for safer force push.";
var REASON_PUSH_DELETE = "git push deletes remote refs. Ask the user to run it manually if deletion is intended.";
var REASON_PUSH_MIRROR = "git push " + "--mirror can force-update and delete remote refs. Ask the user to run it manually if mirror push is intended.";
var REASON_BRANCH_DELETE = "git branch -D force-deletes without merge check. Use -d for safe delete.";
var REASON_REBASE_ABORT = "git rebase --abort discards rebase conflict resolutions. Use 'git status' first.";
var REASON_MERGE_ABORT = "git merge --abort discards merge conflict resolutions. Use 'git status' first.";
var REASON_TAG_DELETE = "git tag -d permanently deletes tags. Ask the user to run it manually if deletion is intended.";
var REASON_REFLOG_DELETE = "git reflog delete removes recovery history. Ask the user to run it manually if deletion is intended.";
var REASON_STASH_DROP = "git stash drop permanently deletes stashed changes. Consider 'git stash list' first.";
var REASON_STASH_CLEAR = "git stash clear deletes ALL stashed changes permanently. Use 'git stash list' to review; ask the user to run it manually if intended.";
var REASON_WORKTREE_REMOVE_FORCE = "git worktree remove --force can delete uncommitted changes. Remove --force flag.";
var CHECKOUT_OPTS_WITH_VALUE = new Set([
  "-b",
  "-B",
  "--orphan",
  "--conflict",
  "--inter-hunk-context",
  "--pathspec-from-file",
  "--unified"
]);
var CHECKOUT_OPTS_WITH_OPTIONAL_VALUE = new Set(["--recurse-submodules", "--track", "-t"]);
var CHECKOUT_SHORT_OPTS_WITH_VALUE = new Set(["-b", "-B", "-U"]);
var SWITCH_SHORT_OPTS_WITH_VALUE = new Set(["-c", "-C"]);
var CHECKOUT_KNOWN_OPTS_NO_VALUE = new Set([
  "-q",
  "--quiet",
  "--no-quiet",
  "-f",
  "--force",
  "--no-force",
  "-d",
  "--detach",
  "--no-detach",
  "-m",
  "--merge",
  "--no-merge",
  "-p",
  "--patch",
  "--no-patch",
  "--guess",
  "--no-guess",
  "--overlay",
  "--no-overlay",
  "--ours",
  "--theirs",
  "--ignore-skip-worktree-bits",
  "--no-ignore-skip-worktree-bits",
  "--no-track",
  "--overwrite-ignore",
  "--no-overwrite-ignore",
  "--ignore-other-worktrees",
  "--no-ignore-other-worktrees",
  "--progress",
  "--no-progress",
  "--pathspec-file-nul",
  "--no-pathspec-file-nul",
  "--no-recurse-submodules"
]);
function matchesGitLongOption(token, option) {
  const optionName = token.split("=", 1)[0] ?? token;
  return optionName.length >= 4 && option.startsWith(optionName) && optionName.startsWith("--") && optionName.slice(2).length >= 2;
}
function analyzeGitRule(tokens) {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);
  if (!subcommand) {
    return null;
  }
  switch (subcommand.toLowerCase()) {
    case "checkout":
      return localDiscard(analyzeGitCheckout(rest));
    case "switch":
      return localDiscard(analyzeGitSwitch(rest));
    case "restore":
      return localDiscard(analyzeGitRestore(rest));
    case "reset":
      return analyzeGitReset(rest);
    case "clean":
      return localDiscard(analyzeGitClean(rest));
    case "push":
      return sharedState(analyzeGitPush(rest));
    case "branch":
      return sharedState(analyzeGitBranch(rest));
    case "stash":
      return sharedState(analyzeGitStash(rest));
    case "worktree":
      return sharedState(analyzeGitWorktree(rest));
    case "rebase":
      return localDiscard(analyzeGitRebase(rest));
    case "merge":
      return localDiscard(analyzeGitMerge(rest));
    case "tag":
      return sharedState(analyzeGitTag(rest));
    case "reflog":
      return sharedState(analyzeGitReflog(rest));
    default:
      return null;
  }
}
function localDiscard(match) {
  return match ? { ...match, localDiscard: true } : null;
}
function sharedState(match) {
  return match ? { ...match, localDiscard: false } : null;
}
function analyzeGitCheckout(tokens) {
  const { index: doubleDashIdx, before: beforeDash } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(beforeDash, {
    shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE
  });
  if (beforeDash.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f")) {
    return destructiveCommandMatch("git.checkout-force", REASON_CHECKOUT_FORCE);
  }
  for (const token of tokens) {
    if (token === "-b" || token === "-B" || token === "--orphan") {
      return null;
    }
    if (matchesGitLongOption(token, "--pathspec-from-file")) {
      return destructiveCommandMatch("git.checkout-pathspec-from-file", REASON_CHECKOUT_PATHSPEC_FROM_FILE);
    }
  }
  if (doubleDashIdx !== -1) {
    const hasRefBeforeDash = beforeDash.some((t) => !t.startsWith("-"));
    if (hasRefBeforeDash) {
      return destructiveCommandMatch("git.checkout-ref-path", REASON_CHECKOUT_REF_PATH);
    }
    return destructiveCommandMatch("git.checkout-double-dash", REASON_CHECKOUT_DOUBLE_DASH);
  }
  const positionalArgs = getCheckoutPositionalArgs(tokens);
  if (positionalArgs.length >= 2) {
    return destructiveCommandMatch("git.checkout-ambiguous", REASON_CHECKOUT_AMBIGUOUS);
  }
  return null;
}
function analyzeGitSwitch(tokens) {
  const { before } = splitAtDoubleDash(tokens);
  if (before.some((token) => matchesGitLongOption(token, "--discard-changes"))) {
    return destructiveCommandMatch("git.switch-discard-changes", REASON_SWITCH_DISCARD_CHANGES);
  }
  const shortOpts = extractShortOpts(before, {
    shortOptsWithValue: SWITCH_SHORT_OPTS_WITH_VALUE
  });
  if (before.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f")) {
    return destructiveCommandMatch("git.switch-force", REASON_SWITCH_FORCE);
  }
  return null;
}
function getCheckoutPositionalArgs(tokens) {
  const positional = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      break;
    }
    if (token.startsWith("-")) {
      if (CHECKOUT_OPTS_WITH_VALUE.has(token)) {
        i += 2;
      } else if (token.startsWith("--") && token.includes("=")) {
        i++;
      } else if (CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)) {
        const nextToken = tokens[i + 1];
        if (nextToken && !nextToken.startsWith("-") && (token === "--recurse-submodules" || token === "--track" || token === "-t")) {
          const validModes = token === "--recurse-submodules" ? ["checkout", "on-demand"] : ["direct", "inherit"];
          if (validModes.includes(nextToken)) {
            i += 2;
          } else {
            i++;
          }
        } else {
          i++;
        }
      } else if (token.startsWith("--") && !CHECKOUT_KNOWN_OPTS_NO_VALUE.has(token) && !CHECKOUT_OPTS_WITH_VALUE.has(token) && !CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)) {
        i++;
      } else {
        i++;
      }
    } else {
      positional.push(token);
      i++;
    }
  }
  return positional;
}
function analyzeGitRestore(tokens) {
  let hasStaged = false;
  for (const token of tokens) {
    if (token === "--help" || token === "--version") {
      return null;
    }
    if (token === "--worktree" || token === "-W") {
      return destructiveCommandMatch("git.restore-worktree", REASON_RESTORE_WORKTREE);
    }
    if (token === "--staged" || token === "-S") {
      hasStaged = true;
    }
  }
  return hasStaged ? null : destructiveCommandMatch("git.restore-unstaged", REASON_RESTORE);
}
function analyzeGitReset(tokens) {
  let match = null;
  for (const token of tokens) {
    if (matchesGitLongOption(token, "--hard")) {
      match = destructiveCommandMatch("git.reset-hard", REASON_RESET_HARD);
      break;
    }
    if (matchesGitLongOption(token, "--merge")) {
      match = destructiveCommandMatch("git.reset-merge", REASON_RESET_MERGE);
      break;
    }
  }
  if (!match) {
    return null;
  }
  return resetHasRef(tokens) ? sharedState(match) : localDiscard(match);
}
function resetHasRef(tokens) {
  for (const token of tokens) {
    if (token === "--") {
      return false;
    }
    if (!token.startsWith("-")) {
      return true;
    }
  }
  return false;
}
function analyzeGitClean(tokens) {
  for (const token of tokens) {
    if (token === "-n" || matchesGitLongOption(token, "--dry-run")) {
      return null;
    }
  }
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== "--"));
  if (tokens.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f")) {
    return destructiveCommandMatch("git.clean-force", REASON_CLEAN);
  }
  return null;
}
function analyzeGitPush(tokens) {
  const { before, after } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(before);
  if (before.some((token) => matchesGitLongOption(token, "--mirror"))) {
    return destructiveCommandMatch("git.push-mirror", REASON_PUSH_MIRROR);
  }
  const hasForce = before.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f") || getPushRefspecCandidates(before, after).some(isForcePushRefspec);
  if (hasForce) {
    return destructiveCommandMatch("git.push-force", REASON_PUSH_FORCE);
  }
  const hasDelete = before.some((token) => matchesGitLongOption(token, "--delete")) || shortOpts.has("-d") || getPushRefspecCandidates(before, after).some(isDeletePushRefspec);
  if (hasDelete) {
    return destructiveCommandMatch("git.push-delete", REASON_PUSH_DELETE);
  }
  return null;
}
function getPushRefspecCandidates(beforeDoubleDash, afterDoubleDash) {
  return [
    ...beforeDoubleDash.filter((token) => token !== "" && !token.startsWith("-")),
    ...afterDoubleDash
  ];
}
function isForcePushRefspec(token) {
  return token.startsWith("+") || token.includes(":+");
}
function isDeletePushRefspec(token) {
  return token.length > 1 && token.startsWith(":");
}
function analyzeGitBranch(tokens) {
  const { before } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(before);
  const hasDelete = shortOpts.has("-D") || shortOpts.has("-d") || before.some((token) => matchesGitLongOption(token, "--delete"));
  const hasForce = shortOpts.has("-D") || shortOpts.has("-f") || before.some((token) => matchesGitLongOption(token, "--force"));
  if (hasDelete && hasForce) {
    return destructiveCommandMatch("git.branch-force-delete", REASON_BRANCH_DELETE);
  }
  return null;
}
function analyzeGitRebase(tokens) {
  const { before } = splitAtDoubleDash(tokens);
  return before.some((token) => matchesGitLongOption(token, "--abort")) ? destructiveCommandMatch("git.rebase-abort", REASON_REBASE_ABORT) : null;
}
function analyzeGitMerge(tokens) {
  const { before } = splitAtDoubleDash(tokens);
  return before.some((token) => matchesGitLongOption(token, "--abort")) ? destructiveCommandMatch("git.merge-abort", REASON_MERGE_ABORT) : null;
}
function analyzeGitTag(tokens) {
  const { before } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(before);
  return shortOpts.has("-d") || before.some((token) => matchesGitLongOption(token, "--delete")) ? destructiveCommandMatch("git.tag-delete", REASON_TAG_DELETE) : null;
}
function analyzeGitReflog(tokens) {
  return tokens[0] === "delete" ? destructiveCommandMatch("git.reflog-delete", REASON_REFLOG_DELETE) : null;
}
function analyzeGitStash(tokens) {
  for (const token of tokens) {
    if (token === "drop") {
      return destructiveCommandMatch("git.stash-drop", REASON_STASH_DROP);
    }
    if (token === "clear") {
      return destructiveCommandMatch("git.stash-clear", REASON_STASH_CLEAR);
    }
  }
  return null;
}
function analyzeGitWorktree(tokens) {
  const { before } = splitAtDoubleDash(tokens);
  const hasRemove = before.includes("remove");
  if (!hasRemove)
    return null;
  const shortOpts = extractShortOpts(before);
  if (before.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f")) {
    return destructiveCommandMatch("git.worktree-remove-force", REASON_WORKTREE_REMOVE_FORCE);
  }
  return null;
}

// src/core/git/config.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2, readFileSync as readFileSync3 } from "node:fs";
import { dirname as dirname4, isAbsolute as isAbsolute5, join as join4, resolve as resolve4 } from "node:path";
var TRUSTED_GIT_BINARIES = [
  "/usr/bin/git",
  "/usr/local/bin/git",
  "/opt/homebrew/bin/git",
  "C:\\Program Files\\Git\\cmd\\git.exe",
  "C:\\Program Files\\Git\\bin\\git.exe"
];
function hasRecursiveSubmoduleConfig(tokens, envAssignments, gitCwd) {
  const commandLineConfig = commandLineRecursiveSubmoduleConfig(tokens, envAssignments);
  if (commandLineConfig !== null) {
    return commandLineConfig;
  }
  const envConfig = envRecursiveSubmoduleConfig(envAssignments);
  if (envConfig !== null) {
    return envConfig;
  }
  if (hasConfigAffectingEnvAssignment(envAssignments)) {
    return true;
  }
  return effectiveGitConfigEnablesRecursiveSubmodules(gitCwd);
}
function commandLineRecursiveSubmoduleConfig(tokens, envAssignments) {
  let recursiveSubmoduleConfig = null;
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || token === "--") {
      return recursiveSubmoduleConfig;
    }
    if (!token.startsWith("-")) {
      return recursiveSubmoduleConfig;
    }
    if (token === "-c") {
      const configValue = recursiveSubmoduleConfigValue(tokens[i + 1]);
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i += 2;
      continue;
    }
    if (token.startsWith("-c") && token.length > 2) {
      const configValue = recursiveSubmoduleConfigValue(token.slice(2));
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i++;
      continue;
    }
    if (token === "--config-env") {
      const configValue = recursiveSubmoduleConfigEnvValue(tokens[i + 1], envAssignments);
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i += 2;
      continue;
    }
    if (token.startsWith("--config-env=")) {
      const configValue = recursiveSubmoduleConfigEnvValue(token.slice("--config-env=".length), envAssignments);
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i++;
      continue;
    }
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
    } else {
      i++;
    }
  }
  return recursiveSubmoduleConfig;
}
function envRecursiveSubmoduleConfig(envAssignments) {
  if (getEnvConfigValue2("GIT_CONFIG_PARAMETERS", envAssignments) !== undefined) {
    return true;
  }
  const countValue = getEnvConfigValue2("GIT_CONFIG_COUNT", envAssignments);
  if (countValue === undefined) {
    return null;
  }
  const count = Number.parseInt(countValue, 10);
  if (!Number.isInteger(count) || count < 0) {
    return true;
  }
  let recursiveSubmoduleConfig = null;
  for (let i = 0;i < count; i++) {
    const key = getEnvConfigValue2(`GIT_CONFIG_KEY_${i}`, envAssignments)?.toLowerCase();
    if (key && isIncludeConfigKey(key)) {
      return true;
    }
    if (key !== "submodule.recurse") {
      continue;
    }
    const value = getEnvConfigValue2(`GIT_CONFIG_VALUE_${i}`, envAssignments);
    recursiveSubmoduleConfig = value === undefined || gitConfigValueEnablesRecursiveSubmodules(value);
  }
  return recursiveSubmoduleConfig;
}
function getEnvConfigValue2(name, envAssignments) {
  return envAssignments?.get(name) ?? process.env[name];
}
function effectiveGitConfigEnablesRecursiveSubmodules(cwd, gitBinary = getTrustedGitBinary()) {
  const localConfigResult = localGitConfigEnablesRecursiveSubmodules(cwd);
  if (localConfigResult === null || localConfigResult) {
    return true;
  }
  if (gitBinary === null) {
    return true;
  }
  try {
    const value = execFileSync(gitBinary, ["config", "--get", "submodule.recurse"], {
      cwd,
      encoding: "utf8",
      env: withoutGitConfigEnv(process.env),
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return gitConfigValueEnablesRecursiveSubmodules(value);
  } catch (error) {
    return !isGitConfigUnsetError(error);
  }
}
function localGitConfigEnablesRecursiveSubmodules(cwd) {
  const configPaths = getLocalGitConfigPaths(cwd);
  if (configPaths === null) {
    return null;
  }
  for (const configPath of configPaths) {
    if (!existsSync2(configPath)) {
      continue;
    }
    const result = gitConfigFileEnablesRecursiveSubmodules(configPath);
    if (result) {
      return true;
    }
  }
  return false;
}
function getTrustedGitBinary() {
  for (const gitBinary of TRUSTED_GIT_BINARIES) {
    if (existsSync2(gitBinary)) {
      return gitBinary;
    }
  }
  return null;
}
function withoutGitConfigEnv(env) {
  const nextEnv = { ...env };
  for (const key of Object.keys(nextEnv)) {
    if (isGitConfigEnvName(key)) {
      delete nextEnv[key];
    }
  }
  return nextEnv;
}
function isGitConfigUnsetError(error) {
  return typeof error === "object" && error !== null && "status" in error && error.status === 1;
}
function getLocalGitConfigPaths(cwd) {
  const dotGitPath = findDotGitInAncestors(cwd);
  if (dotGitPath === null) {
    return null;
  }
  const gitDir = resolveGitDirFromDotGit(dotGitPath);
  if (gitDir === null) {
    return null;
  }
  const commonDir = resolveCommonGitDir(gitDir);
  if (commonDir === null) {
    return null;
  }
  return [join4(commonDir, "config"), join4(gitDir, "config.worktree")];
}
function resolveGitDirFromDotGit(dotGitPath) {
  try {
    const content = readFileSync3(dotGitPath, "utf-8");
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine.startsWith("gitdir:")) {
      return dotGitPath;
    }
    const rawGitDir = firstLine.slice("gitdir:".length).trim();
    if (rawGitDir === "") {
      return null;
    }
    return isAbsolute5(rawGitDir) ? rawGitDir : resolve4(dirname4(dotGitPath), rawGitDir);
  } catch {
    return null;
  }
}
function resolveCommonGitDir(gitDir) {
  const commonDirPath = join4(gitDir, "commondir");
  if (!existsSync2(commonDirPath)) {
    return gitDir;
  }
  try {
    const rawCommonDir = readFileSync3(commonDirPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (rawCommonDir === "") {
      return null;
    }
    return isAbsolute5(rawCommonDir) ? rawCommonDir : resolve4(gitDir, rawCommonDir);
  } catch {
    return null;
  }
}
function gitConfigFileEnablesRecursiveSubmodules(configPath) {
  let content;
  try {
    content = readFileSync3(configPath, "utf-8");
  } catch {
    return true;
  }
  let section = "";
  let recursiveSubmoduleConfig = false;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue;
    }
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1]?.trim().toLowerCase() ?? "";
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    const key = (eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx)).trim().toLowerCase();
    const value = eqIdx === -1 ? "true" : trimmed.slice(eqIdx + 1).trim();
    if (isIncludeConfigSection(section) && key === "path") {
      return true;
    }
    if (section === "submodule" && key === "recurse") {
      recursiveSubmoduleConfig = gitConfigValueEnablesRecursiveSubmodules(value);
    }
  }
  return recursiveSubmoduleConfig;
}
function isIncludeConfigSection(section) {
  return section === "include" || section.startsWith("includeif ");
}
function recursiveSubmoduleConfigValue(config) {
  if (!config) {
    return null;
  }
  const eqIdx = config.indexOf("=");
  const key = (eqIdx === -1 ? config : config.slice(0, eqIdx)).toLowerCase();
  if (isIncludeConfigKey(key)) {
    return true;
  }
  if (key !== "submodule.recurse") {
    return null;
  }
  const value = eqIdx === -1 ? "true" : config.slice(eqIdx + 1).toLowerCase();
  return gitConfigValueEnablesRecursiveSubmodules(value);
}
function gitConfigValueEnablesRecursiveSubmodules(value) {
  const normalizedValue = value.toLowerCase();
  return normalizedValue !== "false" && normalizedValue !== "no" && normalizedValue !== "off" && normalizedValue !== "0";
}
function recursiveSubmoduleConfigEnvValue(configEnv, envAssignments) {
  const eqIdx = configEnv?.indexOf("=") ?? -1;
  if (!configEnv || eqIdx === -1) {
    return null;
  }
  const key = configEnv.slice(0, eqIdx).toLowerCase();
  if (isIncludeConfigKey(key)) {
    return true;
  }
  if (key !== "submodule.recurse") {
    return null;
  }
  const value = getEnvConfigValue2(configEnv.slice(eqIdx + 1), envAssignments);
  return value === undefined || gitConfigValueEnablesRecursiveSubmodules(value);
}
function isIncludeConfigKey(key) {
  return key === "include.path" || key.startsWith("includeif.") && key.endsWith(".path");
}

// src/core/git/worktree-relaxation.ts
function getGitWorktreeRelaxationForMatch(tokens, match, options2) {
  if (!match.localDiscard || !options2.worktreeMode || hasGitContextEnvOverride(options2.envAssignments)) {
    return null;
  }
  const context = getGitExecutionContext(tokens, options2.cwd);
  if (!context.gitCwd || context.hasExplicitGitContext) {
    return null;
  }
  if (!isLinkedWorktree(context.gitCwd)) {
    return null;
  }
  if (isNonRelaxableLocalDiscard(tokens, options2, context.gitCwd)) {
    return null;
  }
  return {
    originalReason: match.reason,
    gitCwd: context.gitCwd
  };
}
function isNonRelaxableLocalDiscard(tokens, options2, gitCwd) {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);
  const normalizedSubcommand = subcommand?.toLowerCase();
  if (hasDynamicGitArgument(rest) || hasRecursiveSubmoduleConfig(tokens, options2.envAssignments, gitCwd) || hasRecurseSubmodulesOption(rest) || isForcedBranchReset(normalizedSubcommand, rest)) {
    return true;
  }
  return normalizedSubcommand === "clean" && countCleanForceFlags(rest) > 1;
}
function hasDynamicGitArgument(tokens) {
  return tokens.some((token) => /[$*?[]/.test(token));
}
function isForcedBranchReset(subcommand, rest) {
  if (subcommand === "checkout") {
    const { before } = splitAtDoubleDash(rest);
    const shortOpts = extractShortOpts(before, {
      shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE
    });
    const hasForce = before.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f");
    const hasBranchReset = shortOpts.has("-B") || before.some((token) => token === "-B" || token.startsWith("-B"));
    return hasForce && hasBranchReset;
  }
  if (subcommand === "switch") {
    const { before } = splitAtDoubleDash(rest);
    const shortOpts = extractShortOpts(before, {
      shortOptsWithValue: SWITCH_SHORT_OPTS_WITH_VALUE
    });
    const hasForce = before.some((token) => matchesGitLongOption(token, "--force")) || before.some((token) => matchesGitLongOption(token, "--discard-changes")) || shortOpts.has("-f");
    const hasForceCreate = before.some((token) => token === "-C" || token.startsWith("-C") || isForceCreateOption(token)) || shortOpts.has("-C");
    return hasForce && hasForceCreate;
  }
  return false;
}
function isForceCreateOption(token) {
  const optionName = token.split("=", 1)[0] ?? token;
  return optionName === "--force-create" || optionName.length >= "--force-c".length && "--force-create".startsWith(optionName);
}
function hasRecurseSubmodulesOption(tokens) {
  return tokens.some((token) => token.startsWith("--recurse-sub"));
}
function countCleanForceFlags(tokens) {
  let count = 0;
  for (const token of tokens) {
    if (token === "--force") {
      count++;
      continue;
    }
    if (token.startsWith("-") && !token.startsWith("--")) {
      for (const opt of token.slice(1)) {
        if (opt === "f") {
          count++;
        }
      }
    }
  }
  return count;
}

// src/core/git/index.ts
var REASON_GIT_SSH_ENV = "Git SSH environment overrides can execute arbitrary commands during network operations. Run git without GIT_SSH/GIT_SSH_COMMAND overrides, or ask the user to run it manually.";
var GIT_NETWORK_SUBCOMMANDS = new Set([
  "clone",
  "fetch",
  "pull",
  "push",
  "ls-remote",
  "submodule"
]);
function analyzeGit(tokens, options2 = {}) {
  return analyzeGitMatch(tokens, options2)?.reason ?? null;
}
function analyzeGitMatch(tokens, options2 = {}) {
  const aliasResolution = resolveGitCommandLineAliases(tokens, options2.envAssignments);
  if (aliasResolution.blockedReason) {
    return destructiveCommandMatch("git.alias-config", aliasResolution.blockedReason);
  }
  const analysisTokens = aliasResolution.tokens;
  if ((hasGitSshEnvAssignment(options2.envAssignments) || hasGitCommandLineSshCommandConfig(tokens, options2.envAssignments)) && isGitNetworkOperation(analysisTokens)) {
    return destructiveCommandMatch("git.ssh-env", REASON_GIT_SSH_ENV);
  }
  const match = analyzeGitRule(analysisTokens);
  if (!match) {
    return null;
  }
  if (aliasResolution.expanded) {
    return match;
  }
  if (getGitWorktreeRelaxationForMatch(tokens, match, options2)) {
    return null;
  }
  return match;
}
function isGitNetworkOperation(tokens) {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);
  const subcommandName = subcommand?.toLowerCase();
  if (!subcommandName) {
    return false;
  }
  if (GIT_NETWORK_SUBCOMMANDS.has(subcommandName)) {
    return true;
  }
  if (subcommandName === "archive") {
    return splitAtDoubleDash(rest).before.some((token) => matchesGitLongOption(token, "--remote"));
  }
  return subcommandName === "remote" && isGitRemoteUpdateOperation(rest);
}
function isGitRemoteUpdateOperation(tokens) {
  return tokens.find((token) => !isGitRemotePrefixOption(token))?.toLowerCase() === "update";
}
function isGitRemotePrefixOption(token) {
  return token === "-v" || matchesGitLongOption(token, "--verbose") || matchesGitLongOption(token, "--no-verbose");
}
function getGitWorktreeRelaxation(tokens, options2 = {}) {
  const aliasResolution = resolveGitCommandLineAliases(tokens, options2.envAssignments);
  if (aliasResolution.blockedReason || aliasResolution.expanded) {
    return null;
  }
  const match = analyzeGitRule(aliasResolution.tokens);
  if (!match) {
    return null;
  }
  return getGitWorktreeRelaxationForMatch(tokens, match, options2);
}

// src/core/analyze/child-analyzer.ts
function analyzeChildCommandMatch(tokens, context, options2 = {}) {
  if (tokens.length === 0) {
    return null;
  }
  const head = tokens[0];
  if (!head) {
    return null;
  }
  const normalizedHead = normalizeCommandToken(head);
  if (SHELL_WRAPPERS.has(normalizedHead)) {
    const shellDynamicMatch = options2.shellDynamicMatch ?? (options2.shellDynamicReason ? { id: "", reason: options2.shellDynamicReason, intent: "manual_only" } : undefined);
    if (options2.dynamicInput && shellDynamicMatch) {
      return filterDestructiveCommandMatch(shellDynamicMatch, context.config);
    }
    const dashCArg = extractDashCArg(tokens);
    if (dashCArg && context.analyzeNested) {
      return context.analyzeNested(dashCArg, {
        effectiveCwd: context.cwd,
        envAssignments: context.envAssignments
      });
    }
    return null;
  }
  if (AWK_INTERPRETERS.has(normalizedHead)) {
    return filterDestructiveCommandMatch(analyzeAwkSystemCallMatch(tokens, (command2) => context.analyzeNested ? context.analyzeNested(command2, {
      effectiveCwd: context.cwd,
      envAssignments: context.envAssignments
    }) : null), context.config);
  }
  if (isInterpreterCommand(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(tokens);
    if (!codeArg) {
      return null;
    }
    if (context.paranoidInterpreters) {
      return filterDestructiveCommandMatch(destructiveCommandMatch("interpreter.one-liner-paranoid", REASON_INTERPRETER_BLOCKED), context.config);
    }
    const nestedResult = context.analyzeNested?.(codeArg, {
      effectiveCwd: context.cwd,
      envAssignments: context.envAssignments
    });
    if (nestedResult) {
      return nestedResult;
    }
    return containsDangerousCode(codeArg) ? filterDestructiveCommandMatch(destructiveCommandMatch("interpreter.dangerous-command", REASON_INTERPRETER_DANGEROUS), context.config) : null;
  }
  if (normalizedHead === "rm" && hasRecursiveForceFlags(tokens)) {
    return filterDestructiveCommandMatch(analyzeRmMatch([...tokens], {
      cwd: context.cwd,
      originalCwd: context.originalCwd,
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar
    }), context.config) ?? getDynamicRmReason(options2, context);
  }
  if (normalizedHead === "find") {
    return filterDestructiveCommandMatch(analyzeFindMatch(tokens, {
      ...context,
      analyzeTokens: (nestedTokens, cwd) => analyzeChildCommandMatch(nestedTokens, { ...context, cwd: cwd ?? undefined }, options2)
    }), context.config);
  }
  if (normalizedHead === "git") {
    return filterDestructiveCommandMatch(analyzeGitMatch(tokens, {
      cwd: context.cwd,
      envAssignments: context.envAssignments,
      worktreeMode: options2.dynamicInput ? false : context.worktreeMode
    }), context.config);
  }
  return null;
}
function getDynamicRmReason(options2, context) {
  const rmDynamicMatch = options2.rmDynamicMatch ?? (options2.rmDynamicReason ? { id: "", reason: options2.rmDynamicReason, intent: "manual_only" } : undefined);
  return options2.dynamicInput && rmDynamicMatch ? filterDestructiveCommandMatch(rmDynamicMatch, context.config) : null;
}

// src/core/analyze/transparent-wrappers.ts
var BUILTIN_ANALYZED_COMMANDS = new Set(["rm", "find", "xargs", "parallel"]);
var RESERVED_TRANSPARENT_WRAPPERS = new Set([
  "git",
  "busybox",
  ...BUILTIN_ANALYZED_COMMANDS,
  ...SHELL_WRAPPERS,
  ...INTERPRETERS,
  ...AWK_INTERPRETERS
]);
function unwrapTransparentWrapper(tokens, config) {
  const head = tokens[0];
  if (!head || !config.transparent_wrappers?.includes(getBasename(head))) {
    return null;
  }
  const wrapper = getBasename(head);
  const startIndex = tokens[1] === "--" ? 2 : 1;
  const childIndex = tokens.findIndex((child, index) => index >= startIndex && getBasename(child) !== wrapper && isProtectableCommand(child, config));
  if (childIndex < 0)
    return null;
  return { wrapper, tokens: [...tokens.slice(childIndex)] };
}
function isProtectableCommand(token, config) {
  const basename2 = getBasename(token);
  const normalized = normalizeCommandToken(token);
  return normalized === "git" || basename2 === "busybox" || BUILTIN_ANALYZED_COMMANDS.has(basename2) || config.transparent_wrappers?.includes(basename2) || SHELL_WRAPPERS.has(normalized) || token === "$SHELL" || isInterpreterCommand(normalized) || AWK_INTERPRETERS.has(normalized) || config.rules.some((rule) => rule.command === basename2);
}
function isReservedTransparentWrapper(command2) {
  const normalized = normalizeCommandToken(command2);
  return RESERVED_TRANSPARENT_WRAPPERS.has(normalized) || isInterpreterCommand(normalized);
}

// src/core/analyze/child-command.ts
function normalizeChildCommand(tokens, context) {
  const wrapperInfo = stripWrappersWithInfo([...tokens], context.cwd);
  const envAssignments = new Map(context.envAssignments ?? []);
  for (const [k, v] of wrapperInfo.envAssignments) {
    envAssignments.set(k, v);
  }
  const childTokens = unwrapTransparentWrappers(wrapperInfo.tokens, context.config ?? { rules: [] });
  return {
    tokens: childTokens,
    cwd: wrapperInfo.cwd === null ? undefined : wrapperInfo.cwd ?? context.cwd,
    wrapperCwd: wrapperInfo.cwd,
    envAssignments,
    head: getBasename(childTokens[0] ?? "").toLowerCase()
  };
}
function stripBusybox(tokens) {
  return getBasename(tokens[0] ?? "").toLowerCase() === "busybox" && tokens.length > 1 ? [...tokens.slice(1)] : [...tokens];
}
function unwrapTransparentWrappers(tokens, config) {
  const strippedTokens = stripBusybox(tokens);
  const transparentWrapper = unwrapTransparentWrapper(strippedTokens, config);
  if (!transparentWrapper) {
    return strippedTokens;
  }
  return unwrapTransparentWrappers(transparentWrapper.tokens, config);
}
function collectCommandTemplate(tokens, start) {
  const templateTokens = [];
  let i = start;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined || token === ":::")
      break;
    templateTokens.push(token);
    i++;
  }
  return {
    markerIndex: i < tokens.length && tokens[i] === ":::" ? i : -1,
    templateTokens
  };
}

// src/core/analyze/parallel.ts
var REASON_PARALLEL_RM = "parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.";
var REASON_PARALLEL_SHELL = "parallel with shell -c can execute arbitrary commands from dynamic input. Run the inner command directly on an explicit file list instead.";
var REASON_PARALLEL_COMMAND_STREAM = "parallel without a command reads executable commands from dynamic input. Use an explicit command template or ::: arguments instead.";
var PARALLEL_PLACEHOLDER_RE = /\{[^{}\s]*\}/;
function analyzeParallel(tokens, context) {
  const parseResult = parseParallelCommand(tokens);
  if (!parseResult) {
    return null;
  }
  const {
    template,
    args,
    templateHasPlaceholder,
    runsRemotely,
    usesStdin,
    envNames,
    readsCommandsFromInput
  } = parseResult;
  if (readsCommandsFromInput) {
    return parallelCommandStreamDynamicReason(context);
  }
  if (template.length === 0) {
    const nestedOverrides2 = buildCommandsModeOverrides(context, runsRemotely);
    for (const arg of args) {
      const reason = context.analyzeNested(arg, nestedOverrides2);
      if (reason) {
        return reason;
      }
    }
    return null;
  }
  const childCommand = normalizeChildCommand(template, context);
  const childTokens = childCommand.tokens;
  const dynamicEnvValues = getParallelDynamicEnvValues(envNames, context.envAssignments, childCommand.envAssignments);
  const envHasPlaceholder = dynamicEnvValues.some(hasParallelPlaceholder);
  const hasPlaceholder = templateHasPlaceholder || envHasPlaceholder;
  const hasDynamicStdinPlaceholder = usesStdin && hasPlaceholder;
  const nestedOverrides = buildNestedOverrides(childCommand.envAssignments, childCommand.wrapperCwd, runsRemotely || hasDynamicStdinPlaceholder);
  if (SHELL_WRAPPERS.has(childCommand.head)) {
    const dashCArg = extractDashCArg(childTokens);
    if (dashCArg) {
      if (isOnlyParallelPlaceholder(dashCArg)) {
        return parallelShellDynamicReason(context);
      }
      if (hasParallelPlaceholder(dashCArg)) {
        if (args.length > 0) {
          for (const arg of args) {
            const expandedScript = replaceParallelPlaceholder(dashCArg, arg);
            const reason3 = context.analyzeNested(expandedScript, nestedOverrides);
            if (reason3) {
              return reason3;
            }
          }
          return null;
        }
        const reason2 = context.analyzeNested(dashCArg, nestedOverrides);
        if (reason2) {
          return reason2;
        }
        return null;
      }
      const reason = context.analyzeNested(dashCArg, nestedOverrides);
      if (reason) {
        return reason;
      }
      const envReason = analyzeParallelDynamicEnvValues(dynamicEnvValues, args, context);
      if (envReason) {
        return envReason;
      }
      if (hasPlaceholder) {
        return parallelShellDynamicReason(context);
      }
      return null;
    }
    if (args.length > 0) {
      return parallelShellDynamicReason(context);
    }
    if (hasPlaceholder) {
      return parallelShellDynamicReason(context);
    }
    return null;
  }
  if (childCommand.head === "rm" && hasRecursiveForceFlags(childTokens)) {
    if (templateHasPlaceholder && args.length > 0) {
      return analyzeParallelRmExpansions(args.map((arg) => childTokens.map((t) => t.replace(/{}/g, arg))), childCommand.cwd, context);
    }
    if (args.length > 0) {
      return analyzeParallelRmExpansions(args.map((arg) => [...childTokens, arg]), childCommand.cwd, context);
    }
    return parallelRmDynamicReason(context);
  }
  const tokenSets = getParallelChildTokenSets(childTokens, templateHasPlaceholder, args);
  for (const tokens2 of tokenSets) {
    const result = analyzeChildCommandMatch(tokens2, {
      cwd: childCommand.cwd,
      originalCwd: context.originalCwd,
      paranoidRm: context.paranoidRm,
      paranoidInterpreters: context.paranoidInterpreters,
      allowTmpdirVar: context.allowTmpdirVar,
      envAssignments: childCommand.envAssignments,
      worktreeMode: runsRemotely || usesStdin || hasPlaceholder ? false : context.worktreeMode,
      analyzeNested: context.analyzeNested,
      config: context.config
    }, {
      dynamicInput: usesStdin || hasPlaceholder,
      shellDynamicMatch: destructiveCommandMatch("parallel.shell-dynamic", REASON_PARALLEL_SHELL),
      rmDynamicMatch: destructiveCommandMatch("parallel.rm-recursive-force-dynamic", REASON_PARALLEL_RM)
    });
    if (result) {
      return result;
    }
  }
  return null;
}
function parallelShellDynamicReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.shell-dynamic", REASON_PARALLEL_SHELL), context.config);
}
function parallelCommandStreamDynamicReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.command-stream-dynamic", REASON_PARALLEL_COMMAND_STREAM), context.config);
}
function parallelRmDynamicReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.rm-recursive-force-dynamic", REASON_PARALLEL_RM), context.config);
}
function analyzeParallelRmExpansions(tokenSets, cwd, context) {
  for (const tokens of tokenSets) {
    const rmResult = filterDestructiveCommandMatch(analyzeRmMatch(tokens, {
      cwd,
      originalCwd: context.originalCwd,
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar
    }), context.config);
    if (rmResult) {
      return rmResult;
    }
  }
  return null;
}
function getParallelChildTokenSets(childTokens, hasPlaceholder, args) {
  if (hasPlaceholder && args.length > 0) {
    return args.map((arg) => childTokens.map((token) => replaceParallelPlaceholder(token, arg)));
  }
  if (!hasPlaceholder && args.length > 0) {
    return args.map((arg) => [...childTokens, arg]);
  }
  return [[...childTokens]];
}
function getParallelDynamicEnvValues(envNames, contextEnvAssignments, childEnvAssignments) {
  return [
    ...envNames.flatMap((name) => {
      const value = childEnvAssignments.get(name) ?? contextEnvAssignments?.get(name);
      return value === undefined ? [] : [value];
    }),
    ...childEnvAssignments.values()
  ];
}
function analyzeParallelDynamicEnvValues(values, args, context) {
  for (const value of values) {
    if (!hasParallelPlaceholder(value)) {
      continue;
    }
    const commands = args.length > 0 ? args.map((arg) => replaceParallelPlaceholder(value, arg)) : [value];
    for (const command2 of commands) {
      const reason = context.analyzeNested(command2, {
        envAssignments: context.envAssignments,
        effectiveCwd: context.cwd
      });
      if (reason) {
        return reason;
      }
    }
  }
  return null;
}
function buildNestedOverrides(envAssignments, cwd, runsRemotely) {
  const overrides = { envAssignments };
  if (cwd !== undefined) {
    overrides.effectiveCwd = cwd;
  }
  if (runsRemotely) {
    overrides.worktreeMode = false;
  }
  return overrides;
}
function buildCommandsModeOverrides(context, runsRemotely) {
  const overrides = {};
  if (context.envAssignments) {
    overrides.envAssignments = context.envAssignments;
  }
  if (context.cwd !== undefined) {
    overrides.effectiveCwd = context.cwd;
  }
  if (runsRemotely) {
    overrides.worktreeMode = false;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
function replaceParallelPlaceholder(token, arg) {
  return token.replace(/\{[^{}\s]*\}/g, arg);
}
function hasParallelPlaceholder(token) {
  return PARALLEL_PLACEHOLDER_RE.test(token);
}
function isOnlyParallelPlaceholder(token) {
  return /^\{[^{}\s]*\}$/.test(token);
}
function parseParallelCommand(tokens) {
  const parallelOptsWithValue = new Set([
    "-a",
    "--arg-file",
    "--colsep",
    "-I",
    "--replace",
    "--results",
    "--result",
    "--res"
  ]);
  let i = 1;
  const templateTokens = [];
  let childCommandTokens = [];
  let markerIndex = -1;
  let runsRemotely = false;
  let usesPipe = false;
  const envNames = [];
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === ":::") {
      markerIndex = i;
      break;
    }
    if (token === "--") {
      const template = collectCommandTemplate(tokens, i + 1);
      templateTokens.push(...template.templateTokens);
      childCommandTokens = [...tokens.slice(i + 1)];
      markerIndex = template.markerIndex;
      break;
    }
    if (token.startsWith("-")) {
      if (token === "--pipe" || token === "--pipepart") {
        usesPipe = true;
        i++;
        continue;
      }
      if (token === "--env") {
        envNames.push(...splitParallelEnvNames(tokens[i + 1]));
        i += 2;
        continue;
      }
      if (token.startsWith("--env=")) {
        envNames.push(...splitParallelEnvNames(token.slice("--env=".length)));
        i++;
        continue;
      }
      if (token === "-S" || token === "--sshlogin" || token === "--slf" || token === "--sshloginfile") {
        runsRemotely = true;
        i += 2;
        continue;
      }
      if (token.startsWith("-S") && token.length > 2) {
        runsRemotely = true;
        i++;
        continue;
      }
      if (token.startsWith("--sshlogin=") || token.startsWith("--slf=") || token.startsWith("--sshloginfile=")) {
        runsRemotely = true;
        i++;
        continue;
      }
      if (token.startsWith("-j") && token.length > 2 && /^\d+$/.test(token.slice(2))) {
        i++;
        continue;
      }
      if (token.startsWith("--") && token.includes("=")) {
        i++;
        continue;
      }
      if (parallelOptsWithValue.has(token)) {
        i += 2;
        continue;
      }
      if (token === "-j" || token === "--jobs") {
        i += 2;
        continue;
      }
      i++;
    } else {
      const template = collectCommandTemplate(tokens, i);
      templateTokens.push(...template.templateTokens);
      childCommandTokens = [...tokens.slice(i)];
      markerIndex = template.markerIndex;
      break;
    }
  }
  const args = [];
  if (markerIndex !== -1) {
    for (let j = markerIndex + 1;j < tokens.length; j++) {
      const token = tokens[j];
      if (token && token !== ":::") {
        args.push(token);
      }
    }
  }
  const templateHasPlaceholder = templateTokens.some(hasParallelPlaceholder);
  if (templateTokens.length === 0 && markerIndex === -1) {
    return {
      template: [],
      args: [],
      childCommandTokens: [],
      templateHasPlaceholder: false,
      runsRemotely,
      usesStdin: true,
      envNames,
      readsCommandsFromInput: true
    };
  }
  return {
    template: templateTokens,
    args,
    childCommandTokens,
    templateHasPlaceholder,
    runsRemotely,
    usesStdin: usesPipe || markerIndex === -1,
    envNames,
    readsCommandsFromInput: false
  };
}
function splitParallelEnvNames(value) {
  return (value ?? "").split(",").map((name) => name.trim()).filter(Boolean);
}

// src/core/analyze/tmpdir.ts
import { existsSync as existsSync3, lstatSync as lstatSync3, realpathSync as realpathSync5 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { isAbsolute as isAbsolute6, join as join5, normalize as normalize2, parse as parsePath3, sep as sep3 } from "node:path";
var INITIAL_SYSTEM_TMPDIR = tmpdir2();
var TEMP_ROOTS = ["/tmp", "/var/tmp", "/private/tmp", "/private/var/tmp", "/var/folders"];
function isTmpdirOverriddenToNonTemp(envAssignments) {
  if (!envAssignments.has("TMPDIR")) {
    return false;
  }
  const tmpdirValue = envAssignments.get("TMPDIR") ?? "";
  if (tmpdirValue === "") {
    return true;
  }
  const normalizedTmpdirValue = tryResolveExistingPathComponents(tmpdirValue);
  if (normalizedTmpdirValue === null) {
    return true;
  }
  if (getTrustedTempRoots().some((root) => isPathOrSubpath(normalizedTmpdirValue, root))) {
    return false;
  }
  return true;
}
function getTrustedTempRoots() {
  const roots = TEMP_ROOTS.map((root) => tryResolveExistingPathComponents(root) ?? normalize2(root));
  const initialTmpdir = tryResolveExistingPathComponents(INITIAL_SYSTEM_TMPDIR);
  if (initialTmpdir && roots.some((root) => isPathOrSubpath(initialTmpdir, root))) {
    return [...roots, initialTmpdir];
  }
  return roots;
}
function tryResolveExistingPathComponents(path) {
  try {
    return resolveExistingPathComponents(path);
  } catch {
    return null;
  }
}
function resolveExistingPathComponents(path) {
  const normalized = normalize2(path);
  if (!isAbsolute6(normalized)) {
    return normalized;
  }
  const root = parsePath3(normalized).root;
  const components = normalized.slice(root.length).split(/[\\/]+/).filter(Boolean);
  let current = root;
  for (let i = 0;i < components.length; i++) {
    const candidate = join5(current, components[i] ?? "");
    if (!existsSync3(candidate)) {
      return join5(candidate, ...components.slice(i + 1));
    }
    current = lstatSync3(candidate).isSymbolicLink() ? realpathSync5(candidate) : candidate;
  }
  return current;
}
function isPathOrSubpath(path, basePath) {
  if (path === basePath) {
    return true;
  }
  const baseWithSlash = basePath.endsWith(sep3) ? basePath : `${basePath}${sep3}`;
  return path.startsWith(baseWithSlash);
}

// src/core/analyze/xargs.ts
var REASON_XARGS_RM = "xargs rm -rf with dynamic input is dangerous. Use explicit file list instead.";
var REASON_XARGS_SHELL = "xargs with shell -c can execute arbitrary commands from dynamic input. Run the inner command directly on an explicit file list instead.";
var XARGS_APPENDED_INPUT = "__CC_SAFETY_NET_XARGS_INPUT__";
function analyzeXargs(tokens, context) {
  const { childTokens: rawChildTokens, replacementToken } = extractXargsChildCommandWithInfo(tokens);
  const childCommand = normalizeChildCommand(rawChildTokens, context);
  const childTokens = childCommand.tokens;
  const childResult = analyzeChildCommandMatch(childTokens, {
    cwd: childCommand.cwd,
    originalCwd: context.originalCwd,
    paranoidRm: context.paranoidRm,
    paranoidInterpreters: context.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    envAssignments: childCommand.envAssignments,
    worktreeMode: context.worktreeMode,
    analyzeNested: context.analyzeNested,
    config: context.config
  }, {
    dynamicInput: childCommand.head !== "git",
    shellDynamicMatch: destructiveCommandMatch("xargs.shell-dynamic", REASON_XARGS_SHELL),
    rmDynamicMatch: destructiveCommandMatch("xargs.rm-recursive-force-dynamic", REASON_XARGS_RM)
  });
  if (childResult) {
    return childResult;
  }
  if (childCommand.head !== "git") {
    return null;
  }
  const gitTokens = replacementToken === null ? [...childTokens, XARGS_APPENDED_INPUT] : childTokens;
  const hasDynamicReplacement = replacementToken !== null && (childTokens.some((token) => token.includes(replacementToken)) || Array.from(childCommand.envAssignments.values()).some((value) => value.includes(replacementToken)));
  return analyzeChildCommandMatch(gitTokens, {
    cwd: childCommand.cwd,
    originalCwd: context.originalCwd,
    paranoidRm: context.paranoidRm,
    paranoidInterpreters: context.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    envAssignments: childCommand.envAssignments,
    worktreeMode: replacementToken === null || hasDynamicReplacement ? false : context.worktreeMode,
    analyzeNested: context.analyzeNested,
    config: context.config
  });
}
function extractXargsChildCommandWithInfo(tokens) {
  const xargsOptsWithValue = new Set([
    "-L",
    "-n",
    "-P",
    "-s",
    "-a",
    "-E",
    "-R",
    "-S",
    "-e",
    "-d",
    "-J",
    "--max-args",
    "--max-procs",
    "--max-chars",
    "--arg-file",
    "--eof",
    "--delimiter",
    "--max-lines",
    "--process-slot-var"
  ]);
  let replacementToken = null;
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      return { childTokens: [...tokens.slice(i + 1)], replacementToken };
    }
    if (token.startsWith("-")) {
      if (token === "-I") {
        replacementToken = tokens[i + 1] ?? "{}";
        i += 2;
        continue;
      }
      if (token.startsWith("-I") && token.length > 2) {
        replacementToken = token.slice(2);
        i++;
        continue;
      }
      if (token === "--replace") {
        replacementToken = "{}";
        i++;
        continue;
      }
      if (token.startsWith("--replace=")) {
        const value = token.slice("--replace=".length);
        replacementToken = value === "" ? "{}" : value;
        i++;
        continue;
      }
      if (token === "-J") {
        i += 2;
        continue;
      }
      if (xargsOptsWithValue.has(token)) {
        i += 2;
      } else if (token.startsWith("--") && token.includes("=")) {
        i++;
      } else if (token.startsWith("-L") || token.startsWith("-n") || token.startsWith("-P") || token.startsWith("-s")) {
        i++;
      } else {
        i++;
      }
    } else {
      return { childTokens: [...tokens.slice(i)], replacementToken };
    }
  }
  return { childTokens: [], replacementToken };
}

// src/core/rules/custom.ts
function checkCustomRules(tokens, rules) {
  return checkCustomRuleMatch(tokens, rules)?.reason ?? null;
}
function checkCustomRuleMatch(tokens, rules) {
  if (tokens.length === 0 || rules.length === 0) {
    return null;
  }
  const command2 = normalizeCommandToken(tokens[0] ?? "");
  const shortOpts = extractShortOpts(tokens);
  for (const rule of rules) {
    if (!matchesCommand(command2, rule.command)) {
      continue;
    }
    if (!matchesSubcommand(command2, tokens, rule.subcommand)) {
      continue;
    }
    if (matchesBlockArgs(tokens, rule.block_args, shortOpts)) {
      return {
        id: `custom.${rule.name}`,
        reason: `[${rule.name}] ${rule.reason}`,
        intent: rule.intent ?? "manual_only"
      };
    }
  }
  return null;
}
function matchesCommand(command2, ruleCommand) {
  return command2 === normalizeCommandToken(ruleCommand);
}
function matchesSubcommand(command2, tokens, ruleSubcommand) {
  if (!ruleSubcommand) {
    return true;
  }
  return matchesSubcommandFrom(tokens, 1, ruleSubcommand, getOptionsWithValues(command2));
}
var GIT_OPTIONS_WITH_VALUES = new Set([
  "-c",
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env"
]);
var DOCKER_OPTIONS_WITH_VALUES = new Set([
  "-c",
  "-H",
  "-l",
  "--config",
  "--context",
  "--host",
  "--log-level",
  "--tlscacert",
  "--tlscert",
  "--tlskey"
]);
var EMPTY_OPTIONS_WITH_VALUES = new Set;
function getOptionsWithValues(command2) {
  if (command2 === "git")
    return GIT_OPTIONS_WITH_VALUES;
  if (command2 === "docker")
    return DOCKER_OPTIONS_WITH_VALUES;
  return EMPTY_OPTIONS_WITH_VALUES;
}
function matchesSubcommandFrom(tokens, startIndex, expectedSubcommand, optionsWithValues) {
  let skipNext = false;
  for (let i = startIndex;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token)
      continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token === "--") {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith("-")) {
        return nextToken === expectedSubcommand;
      }
      return false;
    }
    if (optionsWithValues.has(token)) {
      skipNext = true;
      continue;
    }
    if (token.startsWith("-")) {
      if (!token.includes("=") && shouldSkipPossibleOptionValue(tokens, i, expectedSubcommand, optionsWithValues)) {
        return true;
      }
      continue;
    }
    return token === expectedSubcommand;
  }
  return false;
}
function shouldSkipPossibleOptionValue(tokens, optionIndex, expectedSubcommand, optionsWithValues) {
  const value = tokens[optionIndex + 1];
  if (!value || value.startsWith("-")) {
    return false;
  }
  return matchesSubcommandFrom(tokens, optionIndex + 2, expectedSubcommand, optionsWithValues);
}
function matchesBlockArgs(tokens, blockArgs, shortOpts) {
  const blockArgsSet = new Set(blockArgs);
  for (const token of tokens) {
    if (blockArgsSet.has(token)) {
      return true;
    }
  }
  for (const opt of shortOpts) {
    if (blockArgsSet.has(opt)) {
      return true;
    }
  }
  return false;
}

// src/core/analyze/segment.ts
var REASON_DYNAMIC_EXECUTABLE = "dynamic command name contains shell substitution output and cannot be verified safely. Use a literal executable name.";
var COMMAND_ANALYZERS = new Map([
  ["git", analyzeGitCommand],
  ["rm", analyzeRmCommand],
  ["find", analyzeFindCommand],
  ["xargs", analyzeXargsCommand],
  ["parallel", analyzeParallelCommand]
]);
function deriveCwdContext(options2) {
  const cwdUnknown = options2.effectiveCwd === null;
  const cwdForRm = cwdUnknown ? undefined : options2.effectiveCwd ?? options2.cwd;
  const originalCwd = cwdUnknown ? undefined : options2.cwd;
  return { cwdUnknown, cwdForRm, originalCwd };
}
function analyzeSegment(tokens, depth, options2) {
  if (tokens.length === 0) {
    return null;
  }
  const { cwdForRm: baseCwdForRm, originalCwd } = deriveCwdContext(options2);
  const { tokens: strippedEnv, envAssignments: leadingEnvAssignments } = stripEnvAssignmentsWithInfo(tokens);
  const {
    tokens: stripped,
    envAssignments: wrapperEnvAssignments,
    cwd: wrapperCwd
  } = stripWrappersWithInfo(strippedEnv, baseCwdForRm);
  const envAssignments = new Map(options2.envAssignments ?? []);
  for (const [k, v] of leadingEnvAssignments) {
    envAssignments.set(k, v);
  }
  for (const [k, v] of wrapperEnvAssignments) {
    envAssignments.set(k, v);
  }
  if (stripped.length === 0) {
    return null;
  }
  const head = stripped[0];
  if (!head) {
    return null;
  }
  if (options2.config.failClosedReason) {
    return { reason: options2.config.failClosedReason, intent: "stop_and_explain" };
  }
  const normalizedHead = normalizeCommandToken(head);
  const basename2 = getBasename(head);
  const cwdForRm = wrapperCwd === null ? undefined : wrapperCwd ?? baseCwdForRm;
  const originalCwdForRm = wrapperCwd === null ? undefined : originalCwd;
  const nestedEffectiveCwd = wrapperCwd === undefined ? options2.effectiveCwd : wrapperCwd;
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
  const dynamicExecutableMatch = filterDestructiveCommandMatch(analyzeDynamicExecutable(head), options2.config);
  if (dynamicExecutableMatch) {
    return blockResultFromMatch(dynamicExecutableMatch);
  }
  const transparentWrapper = unwrapTransparentWrapper(stripped, options2.config);
  if (transparentWrapper) {
    return analyzeSegment(transparentWrapper.tokens, depth, {
      ...options2,
      effectiveCwd: nestedEffectiveCwd,
      envAssignments
    });
  }
  if (isShellWrapperCommand(head, normalizedHead)) {
    const dashCArg = extractDashCArg(stripped);
    if (dashCArg) {
      return options2.analyzeNested(dashCArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments
      });
    }
  }
  if (AWK_INTERPRETERS.has(normalizedHead)) {
    const awkReason = filterDestructiveCommandMatch(analyzeAwkSystemCallMatch(stripped, (command2) => matchFromBlockResult(options2.analyzeNested(command2, {
      effectiveCwd: nestedEffectiveCwd,
      envAssignments
    }))), options2.config);
    if (awkReason) {
      return blockResultFromMatch(awkReason);
    }
  }
  if (isInterpreterCommand(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      if (options2.paranoidInterpreters) {
        const match = filterDestructiveCommandMatch(destructiveCommandMatch("interpreter.one-liner-paranoid", REASON_INTERPRETER_BLOCKED), options2.config);
        if (match)
          return blockResultFromMatch(match);
      }
      const innerReason = options2.analyzeNested(codeArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments
      });
      if (innerReason) {
        return innerReason;
      }
      if (containsDangerousCode(codeArg)) {
        const match = filterDestructiveCommandMatch(destructiveCommandMatch("interpreter.dangerous-command", REASON_INTERPRETER_DANGEROUS), options2.config);
        if (match)
          return blockResultFromMatch(match);
      }
    }
  }
  if (normalizedHead === "busybox" && stripped.length > 1) {
    return analyzeSegment(stripped.slice(1), depth, {
      ...options2,
      effectiveCwd: nestedEffectiveCwd,
      envAssignments
    });
  }
  const commandContext = {
    tokens: stripped,
    head,
    normalizedHead,
    basename: basename2,
    cwdForRm,
    originalCwd: originalCwdForRm,
    envAssignments,
    allowTmpdirVar,
    depth,
    effectiveCwd: nestedEffectiveCwd,
    options: options2
  };
  const commandAnalyzer = getCommandAnalyzer(commandContext);
  const commandResult = filterDestructiveCommandMatch(commandAnalyzer?.(commandContext) ?? null, options2.config);
  if (commandResult) {
    return blockResultFromMatch(commandResult);
  }
  const matchedKnown = commandAnalyzer !== undefined;
  if (!matchedKnown) {
    if (!DISPLAY_COMMANDS.has(normalizedHead)) {
      for (let i = 1;i < stripped.length; i++) {
        const token = stripped[i];
        if (!token)
          continue;
        const match = filterDestructiveCommandMatch(analyzeEmbeddedCommand(commandContext, i), options2.config);
        if (match)
          return blockResultFromMatch(match);
      }
    }
  }
  const customRulesTopLevelOnly = matchedKnown;
  if (depth === 0 || !customRulesTopLevelOnly) {
    const customResult = checkCustomRuleMatch(stripped, options2.config.rules);
    if (customResult) {
      return blockResultFromMatch(customResult);
    }
  }
  return null;
}
function blockResultFromMatch(match) {
  return { reason: match.reason, ruleId: match.id || undefined, intent: match.intent };
}
function analyzeDynamicExecutable(head) {
  return head.includes(SHELL_DYNAMIC_SUBSTITUTION_TOKEN) ? destructiveCommandMatch("shell.dynamic-executable", REASON_DYNAMIC_EXECUTABLE) : null;
}
function isShellWrapperCommand(head, normalizedHead) {
  return SHELL_WRAPPERS.has(normalizedHead) || head === "$SHELL" || SHELL_WRAPPERS.has(getBasename(normalizedHead));
}
function getCommandAnalyzer(context) {
  return COMMAND_ANALYZERS.get(context.normalizedHead);
}
function analyzeEmbeddedCommand(context, index) {
  const token = context.tokens[index];
  if (!token) {
    return null;
  }
  const cmd = normalizeCommandToken(token);
  if (isShellWrapperCommand(token, cmd)) {
    const dashCArg = extractDashCArg([token, ...context.tokens.slice(index + 1)]);
    if (!dashCArg) {
      return null;
    }
    const result = context.options.analyzeNested(dashCArg, {
      effectiveCwd: context.effectiveCwd,
      envAssignments: context.envAssignments
    });
    return result ? matchFromBlockResult(result) : null;
  }
  const analyzer = COMMAND_ANALYZERS.get(cmd);
  if (!analyzer || cmd === "xargs" || cmd === "parallel") {
    return null;
  }
  const embeddedContext = {
    ...context,
    tokens: [cmd, ...context.tokens.slice(index + 1)],
    head: cmd,
    normalizedHead: cmd,
    basename: cmd,
    options: cmd === "git" ? { ...context.options, worktreeMode: false } : context.options
  };
  return analyzer(embeddedContext);
}
function analyzeGitCommand(context) {
  return analyzeGitMatch(context.tokens, {
    cwd: context.cwdForRm,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode
  });
}
function analyzeRmCommand(context) {
  return analyzeRmMatch(context.tokens, {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    paranoid: context.options.paranoidRm,
    allowTmpdirVar: context.allowTmpdirVar
  });
}
function analyzeFindCommand(context) {
  return analyzeFindMatch(context.tokens, {
    cwd: context.cwdForRm,
    envAssignments: context.envAssignments,
    analyzeTokens: (tokens, cwd) => matchFromBlockResult(analyzeSegment([...tokens], context.depth + 1, {
      ...context.options,
      effectiveCwd: cwd,
      envAssignments: context.envAssignments
    })),
    analyzeNested: (command2, overrides) => matchFromBlockResult(context.options.analyzeNested(command2, overrides))
  });
}
function analyzeXargsCommand(context) {
  return analyzeXargs(context.tokens, {
    ...getNestedCommandAnalyzeContext(context),
    analyzeNested: (command2, overrides) => matchFromBlockResult(context.options.analyzeNested(command2, overrides))
  });
}
function analyzeParallelCommand(context) {
  return analyzeParallel(context.tokens, {
    ...getNestedCommandAnalyzeContext(context),
    analyzeNested: (command2, overrides) => matchFromBlockResult(context.options.analyzeNested(command2, overrides))
  });
}
function matchFromBlockResult(result) {
  return result ? {
    id: result.ruleId ?? "",
    reason: result.reason,
    intent: result.intent ?? "manual_only"
  } : null;
}
function getNestedCommandAnalyzeContext(context) {
  return {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    paranoidRm: context.options.paranoidRm,
    paranoidInterpreters: context.options.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode,
    config: context.options.config
  };
}
var CWD_CHANGE_REGEX = /^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/;
function segmentChangesCwd(segment) {
  const unwrapped = getCwdChangeTokens(segment);
  if (unwrapped.length === 0) {
    return false;
  }
  let head = unwrapped[0] ?? "";
  let headIndex = 0;
  if (head === "builtin" && unwrapped.length > 1) {
    head = unwrapped[1] ?? "";
    headIndex = 1;
  }
  if (head === "time") {
    head = getHeadAfterTimePrefix(unwrapped, headIndex + 1);
  }
  if (head === "cd" || head === "pushd" || head === "popd") {
    return true;
  }
  const joined = segment.join(" ");
  return CWD_CHANGE_REGEX.test(joined);
}
function resolveCwdAfterSegment(segment, cwd) {
  if (!segmentChangesCwd(segment)) {
    return;
  }
  if (!cwd) {
    return null;
  }
  const unwrapped = getCwdChangeTokens(segment, cwd);
  const cdIndex = getCdCommandIndex(unwrapped);
  if (cdIndex === -1 || unwrapped[cdIndex] !== "cd") {
    return null;
  }
  const target = unwrapped[cdIndex + 1];
  if (!target || target === "-" || target.includes("$") || target.includes("`")) {
    return null;
  }
  try {
    const resolved = resolveChdirTarget(cwd, target);
    if (samePath(resolved, cwd)) {
      return cwd;
    }
  } catch {
    return null;
  }
  return null;
}
function getHeadAfterTimePrefix(tokens, startIndex) {
  let i = startIndex;
  while (tokens[i]?.startsWith("-")) {
    i++;
  }
  return tokens[i] ?? "";
}
function getCdCommandIndex(tokens) {
  let headIndex = 0;
  if (tokens[0] === "builtin" && tokens.length > 1) {
    headIndex = 1;
  }
  if (tokens[headIndex] !== "time") {
    return headIndex;
  }
  let i = headIndex + 1;
  while (tokens[i]?.startsWith("-")) {
    i++;
  }
  return i;
}
function getCwdChangeTokens(segment, cwd) {
  const stripped = stripLeadingGrouping(segment);
  return stripWrappers([...stripped], cwd);
}
function samePath(a, b) {
  try {
    return normalize3(realpathSync6(a)) === normalize3(realpathSync6(b));
  } catch {
    return normalize3(a) === normalize3(b);
  }
}
function stripLeadingGrouping(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === "{" || token === "(" || token === "$(") {
      i++;
    } else {
      break;
    }
  }
  return tokens.slice(i);
}

// src/core/analyze/shell-git-env.ts
var TMPDIR_ENV_NAME = "TMPDIR";
function createShellGitContextEnvState(effectiveEnvAssignments) {
  const initialEffectiveEnvAssignments = getInitialEffectiveShellEnvAssignments(effectiveEnvAssignments);
  return {
    effectiveEnvAssignments: initialEffectiveEnvAssignments,
    shellAssignments: new Map,
    exportedNames: getInitiallyExportedShellEnvNames(initialEffectiveEnvAssignments),
    allexport: false,
    keywordExport: false
  };
}
function applyShellGitContextEnvSegment(tokens, state) {
  const commandInfo = getShellCommandInfo(tokens);
  if (!commandInfo) {
    return;
  }
  const { command: command2, commandIndex, leadingAssignments } = commandInfo;
  if (command2 === null) {
    for (const assignment of leadingAssignments.values()) {
      setShellGitContextAssignment(state, assignment);
    }
    return;
  }
  if (command2 === "set") {
    const changes = getSetOptionChanges(tokens, commandIndex);
    if (changes.allexport !== null) {
      state.allexport = changes.allexport;
    }
    if (changes.keywordExport !== null) {
      state.keywordExport = changes.keywordExport;
    }
    return;
  }
  if (command2 === "unset") {
    const operandsStart = getUnsetOperandsStart(tokens, commandIndex);
    if (operandsStart === null) {
      return;
    }
    for (const token of tokens.slice(operandsStart)) {
      unsetTrackedGitContextEnvName(state, token);
    }
    return;
  }
  if (command2 !== "export" && command2 !== "typeset" && command2 !== "declare" && command2 !== "readonly") {
    return;
  }
  for (const assignment of leadingAssignments.values()) {
    setShellGitContextAssignment(state, assignment);
  }
  if (command2 === "export") {
    const operandsStart = getExportOperandsStart(tokens, commandIndex);
    if (operandsStart === null) {
      return;
    }
    for (const token of tokens.slice(operandsStart)) {
      addExportedGitContextEnvAssignment(state, token);
    }
    return;
  }
  const operandsInfo = getTypesetOperandsInfo(tokens, commandIndex);
  if (operandsInfo === null) {
    return;
  }
  for (const token of tokens.slice(operandsInfo.operandsStart)) {
    addTypesetGitContextEnvAssignment(state, token, operandsInfo.exports, command2 === "readonly" ? leadingAssignments : undefined);
  }
}
function getSegmentGitContextEnvAssignments(tokens, state) {
  if (!state.keywordExport) {
    return state.effectiveEnvAssignments;
  }
  let nextEnvAssignments = null;
  for (const token of tokens) {
    const assignment = parseGitContextEnvAssignment(token);
    if (!assignment) {
      continue;
    }
    nextEnvAssignments ??= new Map(state.effectiveEnvAssignments ?? []);
    nextEnvAssignments.set(assignment.name, assignment.value);
  }
  return nextEnvAssignments ?? state.effectiveEnvAssignments;
}
function getShellCommandInfo(tokens) {
  const leadingAssignments = new Map;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    const assignment = parseShellAssignment(token);
    if (!assignment) {
      break;
    }
    if (isTrackedShellEnvName(assignment.name)) {
      leadingAssignments.set(assignment.name, assignment);
    }
    i++;
  }
  if (i >= tokens.length) {
    return { command: null, commandIndex: i, leadingAssignments };
  }
  let commandIndex = i;
  let command2 = tokens[commandIndex] ?? null;
  while (command2 === "builtin" || command2 === "command" || command2 === "time") {
    if (command2 === "builtin") {
      commandIndex++;
      if (tokens[commandIndex] === "--") {
        commandIndex++;
      }
      command2 = tokens[commandIndex] ?? null;
      continue;
    }
    if (command2 === "command") {
      const commandBuiltinInfo = getCommandBuiltinTarget(tokens, commandIndex);
      if (!commandBuiltinInfo) {
        return null;
      }
      commandIndex = commandBuiltinInfo.commandIndex;
      command2 = commandBuiltinInfo.command;
      continue;
    }
    const timePrefixInfo = getTimePrefixTarget(tokens, commandIndex);
    if (!timePrefixInfo) {
      return null;
    }
    commandIndex = timePrefixInfo.commandIndex;
    command2 = timePrefixInfo.command;
  }
  if (command2 === null) {
    return null;
  }
  return { command: command2, commandIndex, leadingAssignments };
}
function getCommandBuiltinTarget(tokens, commandIndex) {
  return getPrefixedCommandTarget(tokens, commandIndex, (token) => {
    if (token === "-p") {
      return "skip";
    }
    return token === "-v" || token === "-V" ? "abort" : "stop";
  });
}
function getTimePrefixTarget(tokens, commandIndex) {
  return getPrefixedCommandTarget(tokens, commandIndex, (token) => token.startsWith("-") ? "skip" : "stop");
}
function getPrefixedCommandTarget(tokens, commandIndex, optionAction) {
  let i = commandIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    if (token === "--") {
      i++;
      break;
    }
    const action = optionAction(token);
    if (action === "abort") {
      return null;
    }
    if (action === "skip") {
      i++;
      continue;
    }
    break;
  }
  const command2 = tokens[i];
  return command2 ? { command: command2, commandIndex: i } : null;
}
function parseShellAssignment(token) {
  return parseEnvAssignment(token) ?? parseGitContextAppendEnvAssignment(token);
}
function parseGitContextEnvAssignment(token) {
  const assignment = parseEnvAssignment(token) ?? parseGitContextAppendEnvAssignment(token);
  if (!assignment || !isTrackedShellEnvName(assignment.name)) {
    return null;
  }
  return assignment;
}
function isTrackedShellEnvName(name) {
  return name === TMPDIR_ENV_NAME || isTrackedGitEnvName(name);
}
function getInitialEffectiveShellEnvAssignments(effectiveEnvAssignments) {
  const inheritedAssignments = [...GIT_SSH_ENV_NAMES, TMPDIR_ENV_NAME].map((name) => {
    const value = process.env[name];
    return value === undefined ? null : [name, value];
  }).filter((assignment) => assignment !== null);
  if (inheritedAssignments.length === 0) {
    return effectiveEnvAssignments;
  }
  return new Map([...inheritedAssignments, ...effectiveEnvAssignments ?? []]);
}
function getInitiallyExportedShellEnvNames(effectiveEnvAssignments) {
  const exportedNames = new Set;
  for (const name of Object.keys(process.env)) {
    if (isTrackedShellEnvName(name)) {
      exportedNames.add(name);
    }
  }
  for (const name of effectiveEnvAssignments?.keys() ?? []) {
    if (isTrackedShellEnvName(name)) {
      exportedNames.add(name);
    }
  }
  return exportedNames;
}
function setShellGitContextAssignment(state, assignment) {
  state.shellAssignments.set(assignment.name, assignment.value);
  if (assignment.name === TMPDIR_ENV_NAME || state.allexport || state.exportedNames.has(assignment.name)) {
    setEffectiveGitContextAssignment(state, assignment);
  }
}
function setEffectiveGitContextAssignment(state, assignment) {
  const nextEnvAssignments = new Map(state.effectiveEnvAssignments ?? []);
  nextEnvAssignments.set(assignment.name, assignment.value);
  state.effectiveEnvAssignments = nextEnvAssignments;
}
function addExportedGitContextEnvAssignment(state, token) {
  const assignment = parseGitContextEnvAssignment(token);
  if (assignment) {
    state.shellAssignments.set(assignment.name, assignment.value);
    state.exportedNames.add(assignment.name);
    setEffectiveGitContextAssignment(state, assignment);
    return;
  }
  if (isTrackedShellEnvName(token)) {
    exportTrackedGitContextEnvName(state, token);
  }
}
function addTypesetGitContextEnvAssignment(state, token, exports, readonlyLeadingAssignments) {
  const assignment = parseGitContextEnvAssignment(token);
  if (assignment) {
    state.shellAssignments.set(assignment.name, assignment.value);
    if (exports) {
      state.exportedNames.add(assignment.name);
      setEffectiveGitContextAssignment(state, assignment);
    } else if (assignment.name === TMPDIR_ENV_NAME || state.allexport || state.exportedNames.has(assignment.name)) {
      setEffectiveGitContextAssignment(state, assignment);
    }
    return;
  }
  const readonlyAssignment = readonlyLeadingAssignments?.get(token);
  if (readonlyAssignment) {
    state.exportedNames.add(token);
    setEffectiveGitContextAssignment(state, readonlyAssignment);
    return;
  }
  if (exports && isTrackedShellEnvName(token)) {
    exportTrackedGitContextEnvName(state, token);
  }
}
function exportTrackedGitContextEnvName(state, name) {
  state.exportedNames.add(name);
  setEffectiveGitContextAssignment(state, {
    name,
    value: state.shellAssignments.get(name) ?? ""
  });
}
function unsetTrackedGitContextEnvName(state, name) {
  if (!isTrackedShellEnvName(name)) {
    return;
  }
  state.shellAssignments.delete(name);
  state.exportedNames.delete(name);
  if (name === TMPDIR_ENV_NAME) {
    setEffectiveGitContextAssignment(state, { name, value: "" });
    return;
  }
  if (!state.effectiveEnvAssignments?.has(name)) {
    return;
  }
  const nextEnvAssignments = new Map(state.effectiveEnvAssignments);
  nextEnvAssignments.delete(name);
  state.effectiveEnvAssignments = nextEnvAssignments.size === 0 ? undefined : nextEnvAssignments;
}
function getUnsetOperandsStart(tokens, commandIndex) {
  return getBuiltinOperandsStart(tokens, commandIndex, (token) => token === "-v");
}
function getExportOperandsStart(tokens, commandIndex) {
  return getBuiltinOperandsStart(tokens, commandIndex, (token) => token === "-p");
}
function getBuiltinOperandsStart(tokens, commandIndex, skipsOption) {
  let i = commandIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    if (token === "--") {
      return i + 1;
    }
    if (skipsOption(token)) {
      i++;
      continue;
    }
    if (token.startsWith("-")) {
      return null;
    }
    return i;
  }
  return i;
}
function getTypesetOperandsInfo(tokens, commandIndex) {
  let i = commandIndex + 1;
  let hasExportFlag = false;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    if (token === "--") {
      return { operandsStart: i + 1, exports: hasExportFlag };
    }
    if (token.startsWith("-")) {
      if (token.slice(1).includes("x")) {
        hasExportFlag = true;
      }
      i++;
      continue;
    }
    if (token.startsWith("+")) {
      if (token.slice(1).includes("x")) {
        hasExportFlag = false;
      }
      i++;
      continue;
    }
    return { operandsStart: i, exports: hasExportFlag };
  }
  return { operandsStart: i, exports: hasExportFlag };
}
function getSetOptionChanges(tokens, commandIndex) {
  const changes = { allexport: null, keywordExport: null };
  let i = commandIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return changes;
    }
    if (token === "--") {
      return changes;
    }
    if (token === "-o" || token === "+o") {
      if (tokens[i + 1] === "allexport") {
        changes.allexport = token === "-o";
      }
      if (tokens[i + 1] === "keyword") {
        changes.keywordExport = token === "-o";
      }
      i += 2;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const flags = token.slice(1);
      if (flags.includes("a")) {
        changes.allexport = true;
      }
      if (flags.includes("k")) {
        changes.keywordExport = true;
      }
      i++;
      continue;
    }
    if (token.startsWith("+") && token.length > 1) {
      const flags = token.slice(1);
      if (flags.includes("a")) {
        changes.allexport = false;
      }
      if (flags.includes("k")) {
        changes.keywordExport = false;
      }
      i++;
      continue;
    }
    return changes;
  }
  return changes;
}

// src/core/reasons.ts
var REASON_STRICT_UNPARSEABLE = "Command could not be safely analyzed (strict mode). Simplify the command and retry, or ask the user to verify.";
var REASON_RECURSION_LIMIT = "Command exceeds maximum recursion depth and cannot be safely analyzed. Flatten the nesting and retry.";
var REASON_SAFETY_NET_FAILED_CLOSED = "CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.";

// src/core/analyze/analyze-command.ts
function analyzeCommandInternal(command2, depth, options2) {
  if (depth >= MAX_RECURSION_DEPTH) {
    return { reason: REASON_RECURSION_LIMIT, segment: command2, intent: "stop_and_explain" };
  }
  const segments2 = splitShellCommandsWithInfo(command2);
  if (depth === 0 && options2.config.failClosedReason && isFailClosedRepairCommand(segments2)) {
    return null;
  }
  if (options2.strict && segments2.length === 1 && segments2[0]?.tokens.length === 1 && segments2[0].tokens[0] === command2 && command2.includes(" ")) {
    return { reason: REASON_STRICT_UNPARSEABLE, segment: command2, intent: "stop_and_explain" };
  }
  if (options2.shell === "powershell" && !options2.config.failClosedReason) {
    const result = analyzePowerShellRemoveItemCommand(command2, options2);
    if (result)
      return result;
  }
  const originalCwd = options2.cwd;
  let effectiveCwd = options2.effectiveCwd !== undefined ? options2.effectiveCwd : options2.cwd;
  const shellGitContextState = createShellGitContextEnvState(options2.envAssignments);
  for (const segmentInfo of segments2) {
    const segment = segmentInfo.hasDynamicSubstitution ? appendDynamicSubstitutionSentinelForGit(segmentInfo.tokens) : segmentInfo.tokens;
    const segmentStr = segment.join(" ");
    const segmentEnvAssignments = getSegmentGitContextEnvAssignments(segment, shellGitContextState);
    if (segment.length === 1 && segment[0]?.includes(" ")) {
      const textMatch = filterDestructiveCommandMatch(dangerousInTextMatch(segment[0]), options2.config);
      if (textMatch) {
        return {
          reason: textMatch.reason,
          segment: segmentStr,
          ruleId: textMatch.id,
          intent: textMatch.intent
        };
      }
      const nextCwd2 = resolveCwdAfterSegment(segment, effectiveCwd);
      if (nextCwd2 !== undefined) {
        effectiveCwd = nextCwd2;
      }
      continue;
    }
    const result = analyzeSegment(segment, depth, {
      ...options2,
      cwd: originalCwd,
      effectiveCwd,
      envAssignments: segmentEnvAssignments,
      analyzeNested: (nestedCommand, overrides) => {
        const nestedEffectiveCwd = overrides && Object.hasOwn(overrides, "effectiveCwd") ? overrides.effectiveCwd : effectiveCwd;
        const nestedResult = analyzeCommandInternal(nestedCommand, depth + 1, {
          ...options2,
          effectiveCwd: nestedEffectiveCwd,
          envAssignments: overrides?.envAssignments ?? segmentEnvAssignments,
          worktreeMode: overrides?.worktreeMode ?? options2.worktreeMode
        });
        return nestedResult ? {
          reason: nestedResult.reason,
          ruleId: nestedResult.ruleId,
          intent: nestedResult.intent,
          manualPermissionAdvice: nestedResult.manualPermissionAdvice
        } : null;
      }
    });
    if (result) {
      return { ...result, segment: segmentStr };
    }
    const nextCwd = resolveCwdAfterSegment(segment, effectiveCwd);
    if (nextCwd !== undefined) {
      effectiveCwd = nextCwd;
    }
    applyShellGitContextEnvSegment(segment, shellGitContextState);
  }
  if ((options2.shell === undefined || options2.shell === "auto") && !options2.config.failClosedReason && shouldAnalyzePowerShellRemoveItem(command2)) {
    const result = analyzePowerShellRemoveItemCommand(command2, options2);
    if (result)
      return result;
  }
  return null;
}
function analyzePowerShellRemoveItemCommand(command2, options2) {
  return resultFromCommandMatch(command2, filterDestructiveCommandMatch(analyzePowerShellRemoveItemMatch(command2, getPowerShellRemoveItemOptions(options2)), options2.config));
}
function resultFromCommandMatch(command2, match) {
  if (!match)
    return null;
  return {
    reason: match.reason,
    segment: command2,
    ruleId: match.id,
    intent: match.intent
  };
}
function getPowerShellRemoveItemOptions(options2) {
  const cwdUnknown = options2.effectiveCwd === null;
  return {
    cwd: cwdUnknown ? undefined : options2.effectiveCwd ?? options2.cwd,
    originalCwd: cwdUnknown ? undefined : options2.cwd,
    paranoid: options2.paranoidRm,
    allowTmpdirVar: options2.allowTmpdirVar
  };
}
function appendDynamicSubstitutionSentinelForGit(tokens) {
  if (!tokens.some((token) => getBasename(token).toLowerCase() === "git")) {
    return tokens;
  }
  if (tokens.some((token) => token.includes(SHELL_DYNAMIC_SUBSTITUTION_TOKEN))) {
    return tokens;
  }
  return [...tokens, SHELL_DYNAMIC_SUBSTITUTION_TOKEN];
}
function isFailClosedRepairCommand(segments2) {
  if (segments2.length !== 1 || segments2[0]?.hasDynamicSubstitution) {
    return false;
  }
  const segment = segments2[0];
  if (!segment) {
    return false;
  }
  const tokens = segment.tokens;
  if (tokens[0] === "cc-safety-net") {
    return tokens[1] === "rule" && isRuleSyncArgs(tokens.slice(2));
  }
  if (tokens[0] === "npx") {
    return (tokens[1] === "-y" || tokens[1] === "--yes") && isPackageRuleSyncRepair(tokens, 2);
  }
  if (tokens[0] === "bunx" || tokens[0] === "pnpx") {
    return isPackageRuleSyncRepair(tokens, 1);
  }
  if ((tokens[0] === "pnpm" || tokens[0] === "yarn") && tokens[1] === "dlx") {
    return isPackageRuleSyncRepair(tokens, 2);
  }
  return false;
}
function isPackageRuleSyncRepair(tokens, packageIndex) {
  return isCCSafetyNetPackage(tokens[packageIndex]) && tokens[packageIndex + 1] === "rule" && isRuleSyncArgs(tokens.slice(packageIndex + 2));
}
function isRuleSyncArgs(args) {
  return args.length >= 1 && args.length <= 2 && args.filter((arg) => arg === "sync").length === 1 && args.every((arg) => arg === "sync" || arg === "--global" || arg === "-g");
}
function isCCSafetyNetPackage(value) {
  return /^cc-safety-net(?:@[a-zA-Z0-9._-]+)?$/.test(value ?? "");
}

// src/core/config.ts
import { existsSync as existsSync10, readFileSync as readFileSync10 } from "node:fs";
import { resolve as resolve8 } from "node:path";

// src/core/policy.ts
import { chmodSync, existsSync as existsSync5, mkdirSync as mkdirSync3, readFileSync as readFileSync5 } from "node:fs";
import { dirname as dirname7, join as join7 } from "node:path";

// src/core/secret-protection-rules.ts
var SECRET_BASENAME_RULES = [
  {
    id: "secret.basename.env",
    category: "Basename",
    label: ".env",
    description: "Blocks exact .env files.",
    basename: ".env"
  },
  {
    id: "secret.basename.npmrc",
    category: "Basename",
    label: ".npmrc",
    description: "Blocks npm credential config files.",
    basename: ".npmrc"
  },
  {
    id: "secret.basename.pypirc",
    category: "Basename",
    label: ".pypirc",
    description: "Blocks Python package index credential files.",
    basename: ".pypirc"
  },
  {
    id: "secret.basename.netrc",
    category: "Basename",
    label: ".netrc",
    description: "Blocks machine login credential files.",
    basename: ".netrc"
  },
  {
    id: "secret.basename.git-credentials",
    category: "Basename",
    label: ".git-credentials",
    description: "Blocks Git credential storage files.",
    basename: ".git-credentials"
  },
  {
    id: "secret.basename.id-rsa",
    category: "Basename",
    label: "id_rsa",
    description: "Blocks RSA private key basenames.",
    basename: "id_rsa"
  },
  {
    id: "secret.basename.id-ed25519",
    category: "Basename",
    label: "id_ed25519",
    description: "Blocks Ed25519 private key basenames.",
    basename: "id_ed25519"
  },
  {
    id: "secret.basename.id-ecdsa",
    category: "Basename",
    label: "id_ecdsa",
    description: "Blocks ECDSA private key basenames.",
    basename: "id_ecdsa"
  },
  {
    id: "secret.basename.credentials",
    category: "Basename",
    label: "credentials",
    description: "Blocks generic credentials file basenames.",
    basename: "credentials"
  }
];
var SECRET_ENV_VARIANT_RULE = {
  id: "secret.pattern.env-variant",
  category: "Pattern",
  label: ".env.*",
  description: "Blocks environment-specific .env variants."
};
var SECRET_HOME_PATH_CONFIG_VARIANT_SUFFIXES = [
  ".bak",
  ".backup",
  ".copy",
  ".disabled",
  ".old",
  ".orig",
  ".save",
  ".tmp"
];
var SECRET_HOME_PATH_CONFIG_VARIANT_BASES = [
  {
    idSlug: "kube-config",
    label: "~/.kube/config",
    directoryParts: [".kube"],
    basename: "config"
  },
  {
    idSlug: "docker-config",
    label: "~/.docker/config.json",
    directoryParts: [".docker"],
    basename: "config.json"
  }
];
var SECRET_HOME_PATH_RULES = [
  {
    id: "secret.home.ssh",
    category: "Home path",
    label: "~/.ssh",
    description: "Blocks home SSH configuration and key paths.",
    suffixParts: [".ssh"]
  },
  {
    id: "secret.home.aws",
    category: "Home path",
    label: "~/.aws",
    description: "Blocks home AWS credential and config paths.",
    suffixParts: [".aws"]
  },
  {
    id: "secret.home.gcp",
    category: "Home path",
    label: "~/.gcp",
    description: "Blocks home GCP credential paths.",
    suffixParts: [".gcp"]
  },
  {
    id: "secret.home.gcloud-config",
    category: "Home path",
    label: "~/.config/gcloud",
    description: "Blocks home Google Cloud SDK credential paths.",
    suffixParts: [".config", "gcloud"]
  },
  {
    id: "secret.home.kube-config",
    category: "Home path",
    label: "~/.kube/config",
    description: "Blocks home Kubernetes config files.",
    suffixParts: [".kube", "config"]
  },
  {
    id: "secret.home.docker-config",
    category: "Home path",
    label: "~/.docker/config.json",
    description: "Blocks home Docker credential config files.",
    suffixParts: [".docker", "config.json"]
  },
  ...SECRET_HOME_PATH_CONFIG_VARIANT_BASES.flatMap((rule) => SECRET_HOME_PATH_CONFIG_VARIANT_SUFFIXES.map((suffix) => ({
    id: ["secret.home", rule.idSlug, suffix.slice(1)].join("."),
    category: "Home path",
    label: [rule.label, suffix].join(""),
    description: ["Blocks home ", rule.label, suffix, " credential backup files."].join(""),
    suffixParts: [...rule.directoryParts, [rule.basename, suffix].join("")]
  }))),
  {
    id: "secret.home.gh-hosts",
    category: "Home path",
    label: "~/.config/gh/hosts.yml",
    description: "Blocks GitHub CLI host credential files.",
    suffixParts: [".config", "gh", "hosts.yml"]
  }
];
var SECRET_CODING_CLI_RULES = [
  {
    id: "secret.cli.claude-code",
    category: "Coding CLI",
    label: "Claude Code credentials",
    description: "Blocks Claude Code settings and credential files, including CLAUDE_CONFIG_DIR relocations."
  },
  {
    id: "secret.cli.antigravity",
    category: "Coding CLI",
    label: "Antigravity CLI credentials",
    description: "Blocks Antigravity CLI hook config under the shared Gemini config directory."
  },
  {
    id: "secret.cli.codex",
    category: "Coding CLI",
    label: "Codex credentials",
    description: "Blocks Codex auth and config files, including CODEX_HOME relocations."
  },
  {
    id: "secret.cli.gemini",
    category: "Coding CLI",
    label: "Gemini CLI credentials",
    description: "Blocks Gemini CLI OAuth, account, settings, and keychain fallback files."
  },
  {
    id: "secret.cli.copilot-cli",
    category: "Coding CLI",
    label: "GitHub Copilot CLI credentials",
    description: "Blocks Copilot CLI auth config and MCP OAuth credential storage."
  },
  {
    id: "secret.cli.kimi-code",
    category: "Coding CLI",
    label: "Kimi Code credentials",
    description: "Blocks current and legacy Kimi Code config, OAuth, MCP, and server token files."
  },
  {
    id: "secret.cli.opencode",
    category: "Coding CLI",
    label: "OpenCode credentials",
    description: "Blocks OpenCode auth stores and credential-bearing global or managed config files."
  },
  {
    id: "secret.cli.pi",
    category: "Coding CLI",
    label: "Pi credentials",
    description: "Blocks Pi coding agent auth files, including PI_CODING_AGENT_DIR relocations."
  }
];
var SECRET_DIRECTORY_RULES = [
  {
    id: "secret.dir.secrets",
    category: "Directory",
    label: "secrets/",
    description: "Blocks paths inside directories named secrets.",
    basename: "secrets"
  }
];
var SECRET_VARIANT_PREFIXES = [
  { prefix: "id_rsa", slug: "id-rsa", label: "id_rsa" },
  { prefix: "id_dsa", slug: "id-dsa", label: "id_dsa" },
  { prefix: "id_ed25519", slug: "id-ed25519", label: "id_ed25519" },
  { prefix: "id_ecdsa", slug: "id-ecdsa", label: "id_ecdsa" },
  { prefix: "credentials", slug: "credentials", label: "credentials" }
];
var SECRET_DOT_VARIANT_SUFFIXES = [
  ".bak",
  ".backup",
  ".copy",
  ".disabled",
  ".key",
  ".old",
  ".orig",
  ".pem",
  ".save",
  ".tmp"
];
var SECRET_VARIANT_SEPARATOR_RULES = SECRET_VARIANT_PREFIXES.map((rule) => ({
  id: `secret.variant.${rule.slug}.separator`,
  category: "Variant",
  label: `${rule.label}-* / ${rule.label}_*`,
  description: `Blocks ${rule.label} variants with dash or underscore suffixes.`,
  prefix: rule.prefix
}));
var SECRET_VARIANT_DOT_SUFFIX_RULES = SECRET_VARIANT_PREFIXES.flatMap((rule) => SECRET_DOT_VARIANT_SUFFIXES.map((suffix) => ({
  id: `secret.variant.${rule.slug}.${suffix.slice(1)}`,
  category: "Variant",
  label: `${rule.label}${suffix}`,
  description: `Blocks ${rule.label}${suffix} private credential variants.`,
  prefix: rule.prefix,
  suffix
})));
var SECRET_BROAD_SSH_KEY_BASENAME_RULE = {
  id: "secret.pattern.ssh-key-basename",
  category: "Pattern",
  label: "*_(rsa|dsa|ed25519|ecdsa)",
  description: "Blocks extensionless SSH private key-like basenames.",
  pattern: /^.*_(rsa|dsa|ed25519|ecdsa)$/
};
var SECRET_EXTENSION_RULES = [
  "agilekeychain",
  "asc",
  "bek",
  "cscfg",
  "fve",
  "gnucash",
  "jks",
  "keychain",
  "kwallet",
  "mdf",
  "ovpn",
  "p12",
  "pcap",
  "pem",
  "pfx",
  "pkcs12",
  "psafe3",
  "rdp",
  "sdf",
  "sqlite",
  "tblk",
  "tpm"
].map((extension) => ({
  id: `secret.ext.${extension}`,
  category: "Extension",
  label: `.${extension}`,
  description: `Blocks files with the .${extension} extension.`,
  extension
}));
var SECRET_EXTENSION_PATTERN_RULES = [
  {
    id: "secret.ext-pattern.key",
    category: "Extension pattern",
    label: ".key / .keypair",
    description: "Blocks key and keypair extension patterns.",
    pattern: /^key(pair)?$/
  },
  {
    id: "secret.ext-pattern.keystore",
    category: "Extension pattern",
    label: ".keystore / .keyring",
    description: "Blocks keystore and keyring extension patterns.",
    pattern: /^key(store|ring)$/
  },
  {
    id: "secret.ext-pattern.kdbx",
    category: "Extension pattern",
    label: ".kdb / .kdbx",
    description: "Blocks KeePass database extension patterns.",
    pattern: /^kdbx?$/
  },
  {
    id: "secret.ext-pattern.sql",
    category: "Extension pattern",
    label: ".sql / .sqldump",
    description: "Blocks SQL dump extension patterns.",
    pattern: /^sql(dump)?$/
  }
];
var SECRET_PROTECTION_RULE_METADATA = [
  ...SECRET_BASENAME_RULES,
  SECRET_ENV_VARIANT_RULE,
  ...SECRET_HOME_PATH_RULES,
  ...SECRET_CODING_CLI_RULES,
  ...SECRET_DIRECTORY_RULES,
  ...SECRET_VARIANT_SEPARATOR_RULES,
  ...SECRET_VARIANT_DOT_SUFFIX_RULES,
  SECRET_BROAD_SSH_KEY_BASENAME_RULE,
  ...SECRET_EXTENSION_RULES,
  ...SECRET_EXTENSION_PATTERN_RULES
].map((rule) => ({
  id: rule.id,
  category: rule.category,
  label: rule.label,
  description: rule.description
}));
var SECRET_PROTECTION_RULE_IDS = SECRET_PROTECTION_RULE_METADATA.map((rule) => rule.id);
var SECRET_PROTECTION_RULE_ID_SET = new Set(SECRET_PROTECTION_RULE_IDS);
// src/core/rules/policy/config-file.ts
import { randomBytes } from "node:crypto";
import { existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync4, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname as dirname6 } from "node:path";

// src/core/rules/policy/paths.ts
import { homedir as homedir3 } from "node:os";
import { dirname as dirname5, join as join6, resolve as resolve5 } from "node:path";
var RULES_CONFIG_FILE = "rule.json";
var RULES_LOCK_FILE = "rule.lock";
var RULEBOOK_FILE = "rulebook.json";
var LEGACY_RULES_CONFIG_FILE = "config.json";
var SAFETY_NET_DIR = ".cc-safety-net";
var RULES_SUBDIR = "rules";
var CACHE_SUBDIR = "cache";
var RULES_DIR = `${SAFETY_NET_DIR}/${RULES_SUBDIR}`;
var CC_SAFETY_NET_HOME = "CC_SAFETY_NET_HOME";
var GITHUB_RULEBOOK_SOURCE_FORMAT = "owner/repo#ref/<rulebook-name>";
var RULE_SYNC_COMMAND = "`cc-safety-net rule sync`";
var RULE_MIGRATE_COMMAND = "`npx -y cc-safety-net rule migrate`";
function getProjectRulesDir(cwd) {
  return resolve5(cwd ?? process.cwd(), RULES_DIR);
}
function getProjectRulesConfigPath(cwd) {
  return join6(getProjectRulesDir(cwd), RULES_CONFIG_FILE);
}
function getUserRulesDir(options2) {
  return options2?.userConfigDir ?? (options2?.userConfigPath ? dirname5(options2.userConfigPath) : join6(getUserSafetyNetHome(), RULES_SUBDIR));
}
function getUserSafetyNetHome() {
  const home = process.env[CC_SAFETY_NET_HOME];
  return home ? resolve5(home) : join6(homedir3(), SAFETY_NET_DIR);
}
function getUserRulesConfigPath(options2) {
  return join6(getUserRulesDir(options2), RULES_CONFIG_FILE);
}
function getUserRulesLockPath(options2) {
  return join6(getUserRulesDir(options2), RULES_LOCK_FILE);
}
function getRulesLockPathForConfigPath(configPath) {
  return join6(dirname5(configPath), RULES_LOCK_FILE);
}
function getLegacyUserRulesConfigPath(options2 = {}) {
  return join6(dirname5(getUserRulesDir(options2)), LEGACY_RULES_CONFIG_FILE);
}
function getLegacyProjectRulesConfigPath(options2 = {}) {
  return resolve5(options2.cwd ?? process.cwd(), ".safety-net.json");
}
function getPolicyPaths(options2) {
  const userConfigPath = options2.userConfigPath ?? getUserRulesConfigPath(options2);
  const projectConfigPath = options2.projectConfigPath ?? getProjectRulesConfigPath(options2.cwd);
  return {
    userConfigPath,
    projectConfigPath,
    userLockPath: getRulesLockPathForConfigPath(userConfigPath),
    projectLockPath: getRulesLockPathForConfigPath(projectConfigPath)
  };
}
function getScopePaths(options2) {
  const configPath = options2.global ? options2.userConfigPath ?? getUserRulesConfigPath(options2) : options2.projectConfigPath ?? getProjectRulesConfigPath(options2.cwd);
  return {
    configDir: dirname5(configPath),
    configPath,
    lockPath: getRulesLockPathForConfigPath(configPath)
  };
}
function getRulebookDisplaySource(entry) {
  if (entry.kind === "github" && entry.display_ref) {
    return `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}`;
  }
  return entry.spec;
}
function getRulebookCachePath(entry, options2) {
  const digestHex = entry.digest.startsWith("sha256:") ? entry.digest.slice(7) : entry.digest;
  return join6(getRulesCacheDir(options2), "rulebooks", `${getRulebookCacheSlug(entry)}--${digestHex.slice(0, 12)}`, RULEBOOK_FILE);
}
function getRulebookCacheSlug(entry) {
  const source = entry.kind === "github" && entry.display_ref ? `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}` : entry.spec;
  return source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "rulebook";
}
function getRepositoryRulebookPath(name) {
  return `${RULES_DIR}/${name}/${RULEBOOK_FILE}`;
}
function getRulesCacheDir(options2) {
  return join6(dirname5(options2?.cacheConfigDir ?? getUserRulesDir(options2)), CACHE_SUBDIR);
}

// src/core/rules/policy/sources.ts
var GITHUB_SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(.+)$/;
var GITHUB_REPOSITORY_SOURCE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/;
var GITHUB_REPOSITORY_REF_SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([A-Za-z0-9._-]+)$/;
var GITHUB_REF_PATTERN = /^[A-Za-z0-9._-]+$/;
var RULES_DIR_RE = RULES_DIR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var RULEBOOK_FILE_RE = RULEBOOK_FILE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var GITHUB_RULEBOOK_PATH_RE = new RegExp(`^${RULES_DIR_RE}/(${NAME_PATTERN.source.slice(1, -1)})/${RULEBOOK_FILE_RE}$`);
function getRulebookSourceSyntaxError(source) {
  if (isGitHubRulebookSource(source)) {
    try {
      parseGitHubSource(source);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return NAME_PATTERN.test(source) ? null : `Local rulebook sources must be bare names matching ${NAME_PATTERN}: ${source}`;
}
function parseGitHubSource(spec) {
  if (spec.startsWith("github:")) {
    throw new Error(`Invalid rulebook source: ${spec}`);
  }
  const match = spec.match(GITHUB_SOURCE_RE);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Invalid GitHub rulebook source: ${spec}`);
  }
  const [ref, name, ...extraParts] = match[3].split("/");
  if (!ref || !GITHUB_REF_PATTERN.test(ref)) {
    throw new Error(`GitHub rulebook refs must be a single path segment: ${spec}`);
  }
  if (!name || extraParts.length > 0 || !NAME_PATTERN.test(name)) {
    throw new Error(`GitHub rulebook sources must be ${GITHUB_RULEBOOK_SOURCE_FORMAT}: ${spec}`);
  }
  return {
    owner: match[1],
    repo: match[2],
    ref,
    path: getRepositoryRulebookPath(name),
    name
  };
}
function isGitHubRepositorySource(source) {
  return GITHUB_REPOSITORY_SOURCE_RE.test(source);
}
function isGitHubRulebookSource(source) {
  return GITHUB_SOURCE_RE.test(source);
}
function assertBareRulebookName(source) {
  if (!NAME_PATTERN.test(source)) {
    throw new Error(`Local rulebook sources must be bare names matching ${NAME_PATTERN}: ${source}`);
  }
}
function getRulebookLockEntrySourceIdentityError(entry) {
  if (isGitHubRulebookSource(entry.spec)) {
    return getGitHubLockEntrySourceIdentityError(entry);
  }
  return getLocalLockEntrySourceIdentityError(entry);
}
function getLocalLockEntrySourceIdentityError(entry) {
  if (!NAME_PATTERN.test(entry.spec)) {
    return `Local rulebook sources must be bare names matching ${NAME_PATTERN}: ${entry.spec}`;
  }
  if (entry.kind !== "local-directory") {
    return `lock entry for ${entry.spec} must use local-directory kind`;
  }
  if (entry.path === entry.spec && entry.name === entry.spec) {
    return null;
  }
  return `lock entry for ${entry.spec} does not match local source identity`;
}
function getGitHubLockEntrySourceIdentityError(entry) {
  const syntaxError = getRulebookSourceSyntaxError(entry.spec);
  if (syntaxError)
    return syntaxError;
  const parsed = parseGitHubSource(entry.spec);
  if (entry.kind !== "github") {
    return `lock entry for ${entry.spec} must use github kind`;
  }
  if (entry.owner === parsed.owner && entry.repo === parsed.repo && entry.ref === parsed.ref && entry.path === parsed.path && entry.name === parsed.name) {
    return null;
  }
  return `lock entry for ${entry.spec} does not match GitHub source identity`;
}
function getSelectedUpdateSpecs(config, lock, match) {
  const exactMatches = getExactSpecMatches(config.rules, match);
  if (exactMatches.length > 0) {
    return { ok: true, specs: exactMatches };
  }
  if (!lock) {
    return {
      ok: false,
      result: {
        ok: false,
        errors: [
          `No lockfile available to match rulebook name ${match}; use the exact source or run ${RULE_SYNC_COMMAND}`
        ],
        warnings: [],
        entries: []
      }
    };
  }
  const configuredSpecs = new Set(config.rules);
  const nameMatches = lock.rulebooks.filter((entry) => entry.name === match && configuredSpecs.has(entry.spec)).map((entry) => entry.spec);
  if (nameMatches.length === 1) {
    return { ok: true, specs: nameMatches };
  }
  return noRulebookMatch(match, nameMatches);
}
function getRemoveMatches(rules, lock, match) {
  const exactMatches = getExactSpecMatches(rules, match);
  if (exactMatches.length > 0)
    return { ok: true, specs: exactMatches };
  const githubRefMatches = getGitHubRepositoryRefMatches(rules, match);
  if (githubRefMatches.length > 0)
    return { ok: true, specs: githubRefMatches };
  const githubRepositoryMatches = getGitHubRepositoryMatches(rules, match);
  if (!githubRepositoryMatches.ok)
    return githubRepositoryMatches;
  if (githubRepositoryMatches.specs.length > 0) {
    return { ok: true, specs: githubRepositoryMatches.specs };
  }
  const nameMatches = lock ? rules.filter((spec) => lock.rulebooks.find((entry) => entry.spec === spec)?.name === match) : [];
  if (nameMatches.length === 1)
    return { ok: true, specs: nameMatches };
  return noRulebookMatch(match, nameMatches);
}
function noRulebookMatch(match, nameMatches) {
  return {
    ok: false,
    result: {
      ok: false,
      errors: nameMatches.length === 0 ? [`No configured rulebook matches ${match}`] : [`Ambiguous rulebook match ${match}: ${nameMatches.join(", ")}`],
      warnings: [],
      entries: []
    }
  };
}
function getExactSpecMatches(rules, match) {
  return rules.filter((spec) => spec === match);
}
function getGitHubRepositoryRefMatches(rules, match) {
  const parsed = match.match(GITHUB_REPOSITORY_REF_SOURCE_RE);
  const owner = parsed?.[1];
  const repo = parsed?.[2];
  const ref = parsed?.[3];
  if (!owner || !repo || !ref)
    return [];
  return getConfiguredGitHubSourceMatches(rules, (source) => {
    return source.owner === owner && source.repo === repo && source.ref === ref;
  });
}
function getGitHubRepositoryMatches(rules, match) {
  if (!isGitHubRepositorySource(match))
    return { ok: true, specs: [] };
  const [owner, repo] = match.split("/");
  const specs = getConfiguredGitHubSourceMatches(rules, (source) => {
    return source.owner === owner && source.repo === repo;
  });
  const refs = new Set(specs.map((spec) => getConfiguredGitHubSource(spec)?.ref).filter((ref) => !!ref));
  if (refs.size < 2)
    return { ok: true, specs };
  return {
    ok: false,
    result: {
      ok: false,
      errors: [
        `Multiple refs are configured for ${match}. Use an explicit ref:`,
        `  cc-safety-net rule remove ${match}#<ref>`
      ],
      warnings: [],
      entries: []
    }
  };
}
function getConfiguredGitHubSource(spec) {
  try {
    return parseGitHubSource(spec);
  } catch {
    return null;
  }
}
function getConfiguredGitHubSourceMatches(rules, matches) {
  return rules.filter((spec) => {
    const source = getConfiguredGitHubSource(spec);
    return source ? matches(source) : false;
  });
}

// src/core/rules/policy/types.ts
var DEFAULT_CONFIG = {
  version: 1,
  rules: [],
  overrides: {},
  transparent_wrappers: []
};

// src/core/rules/policy/config-file.ts
function validateRulesConfig(config) {
  const errors = [];
  const sources = new Set;
  if (!config || typeof config !== "object") {
    return { errors: ["Config must be an object"], sources };
  }
  const cfg = config;
  if (cfg.version !== 1) {
    errors.push("version must be 1");
  }
  if (cfg.rules === undefined) {} else if (!Array.isArray(cfg.rules)) {
    errors.push("rules must be an array of rulebook source strings");
  } else {
    for (let i = 0;i < cfg.rules.length; i++) {
      if (typeof cfg.rules[i] !== "string") {
        errors.push(`rules[${i}]: must be a rulebook source string`);
        continue;
      }
      if (cfg.rules[i].trim() === "") {
        errors.push(`rules[${i}]: must be a non-empty rulebook source string`);
        continue;
      }
      if (sources.has(cfg.rules[i])) {
        errors.push(`rules[${i}]: duplicate rulebook source "${cfg.rules[i]}"`);
        continue;
      }
      const sourceError = getRulebookSourceSyntaxError(cfg.rules[i]);
      if (sourceError) {
        errors.push(`rules[${i}]: ${sourceError}`);
        continue;
      }
      sources.add(cfg.rules[i]);
    }
  }
  if (cfg.overrides !== undefined) {
    if (!cfg.overrides || typeof cfg.overrides !== "object" || Array.isArray(cfg.overrides)) {
      errors.push("overrides must be an object if provided");
    } else {
      for (const [key, value] of Object.entries(cfg.overrides)) {
        if (!/^[^/]+\/[^/]+$/.test(key)) {
          errors.push(`overrides.${key}: must use <rulebook-name>/<rule-name>`);
        }
        if (value === "off") {
          continue;
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          errors.push(`overrides.${key}: must be "off" or an object`);
          continue;
        }
        const reason = value.reason;
        if (typeof reason !== "string" || reason === "") {
          errors.push(`overrides.${key}.reason: required non-empty string`);
        } else if (reason.length > MAX_REASON_LENGTH) {
          errors.push(`overrides.${key}.reason: must be at most ${MAX_REASON_LENGTH} characters`);
        }
        const intent = value.intent;
        if (intent !== undefined && !isBlockIntent(intent)) {
          errors.push(`overrides.${key}.intent: must be one of ${BLOCK_INTENTS.join(", ")}`);
        }
      }
    }
  }
  if (cfg.transparent_wrappers !== undefined) {
    validateTransparentWrappers(cfg.transparent_wrappers, errors);
  }
  return { errors, sources };
}
function isBlockIntent(value) {
  return typeof value === "string" && BLOCK_INTENTS.includes(value);
}
function validateTransparentWrappers(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("transparent_wrappers must be an array of command strings");
    return;
  }
  const seen = new Set;
  for (let i = 0;i < value.length; i++) {
    const command2 = value[i];
    if (typeof command2 !== "string") {
      errors.push(`transparent_wrappers[${i}]: must be a command string`);
      continue;
    }
    if (!COMMAND_PATTERN.test(command2)) {
      errors.push(`transparent_wrappers[${i}]: must match command pattern`);
      continue;
    }
    if (seen.has(command2)) {
      errors.push(`transparent_wrappers[${i}]: duplicate command "${command2}"`);
      continue;
    }
    if (isReservedTransparentWrapper(command2)) {
      errors.push(`transparent_wrappers[${i}]: reserved command "${command2}" cannot be a wrapper`);
      continue;
    }
    seen.add(command2);
  }
}
function readRulesConfig(path) {
  if (!existsSync4(path)) {
    return { config: null, errors: [] };
  }
  try {
    const content = readFileSync4(path, "utf-8");
    if (!content.trim()) {
      return { config: null, errors: ["Config file is empty"] };
    }
    const parsed = JSON.parse(content);
    const validation = validateRulesConfig(parsed);
    if (validation.errors.length > 0) {
      return { config: null, errors: validation.errors };
    }
    const cfg = parsed;
    return {
      config: {
        version: 1,
        rules: cfg.rules ?? [],
        overrides: cfg.overrides ?? {},
        transparent_wrappers: cfg.transparent_wrappers ?? []
      },
      errors: []
    };
  } catch (error) {
    return {
      config: null,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}
function readScopeRulesConfig(path) {
  const loaded = readRulesConfig(path);
  if (loaded.errors.length > 0) {
    return { ok: false, result: { ok: false, errors: loaded.errors, warnings: [], entries: [] } };
  }
  return { ok: true, config: loaded.config ?? DEFAULT_CONFIG };
}
function writeDefaultRulesConfig(path, rules = []) {
  writeJsonAtomic(path, { version: 1, rules, overrides: {}, transparent_wrappers: [] });
}
function writeStarterRulebook(path, name = "project-rules") {
  writeJsonAtomic(path, {
    rulebook_version: 1,
    name,
    version: "1.0.0",
    description: name === "project-rules" ? "Project-specific CC Safety Net rules." : "User-specific CC Safety Net rules.",
    author: name === "project-rules" ? "project" : "user",
    allowed_commands: ["docker"],
    rules: [
      {
        name: "block-docker-system-prune",
        command: "docker",
        subcommand: "system",
        block_args: ["prune"],
        reason: "Use targeted cleanup instead."
      }
    ],
    tests: [
      {
        command: "docker system prune",
        expect: "blocked",
        rule: "block-docker-system-prune"
      }
    ]
  });
}
function createAtomicTempPath(path) {
  return `${path}.${randomBytes(8).toString("hex")}.tmp`;
}
function writeJsonAtomic(path, value, mode) {
  mkdirSync2(dirname6(path), { recursive: true });
  const tempPath = createAtomicTempPath(path);
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}
`, {
      encoding: "utf-8",
      flag: "wx",
      mode
    });
    renameSync(tempPath, path);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

// src/core/policy.ts
var POLICY_FILE = "policy.json";
var TOP_LEVEL_FIELDS = new Set([
  "version",
  "safety",
  "workflow",
  "destructive_command_protection",
  "secret_protection"
]);
var SAFETY_LEVELS2 = new Set(["standard", "strict", "paranoid"]);
var SAFETY_FIELDS = new Set(["level", "overrides"]);
var SAFETY_OVERRIDE_FIELDS = new Set(["fail_closed", "paranoid_rm", "paranoid_interpreters"]);
var WORKFLOW_FIELDS = new Set(["worktree_mode"]);
var DESTRUCTIVE_COMMAND_POLICY_FIELDS = new Set(["enabled", "overrides"]);
var SECRET_PROTECTION_FIELDS = new Set(["enabled", "overrides", "deny_paths"]);
var DEFAULT_GUI_POLICY = {
  version: 1,
  safety: {
    level: "standard",
    overrides: {}
  },
  workflow: {
    worktree_mode: false
  },
  destructive_command_protection: {
    enabled: true,
    overrides: {}
  },
  secret_protection: {
    enabled: true,
    overrides: {},
    deny_paths: []
  }
};
function getUserPolicyPath(options2) {
  return join7(dirname7(getUserRulesDir(options2)), POLICY_FILE);
}
function readUserPolicyForGui(options2 = {}) {
  const path = getUserPolicyPath(options2);
  if (!existsSync5(path)) {
    return {
      path,
      exists: false,
      raw: "",
      policy: createDefaultGuiPolicy(),
      errors: []
    };
  }
  const raw = readFileSync5(path, "utf-8");
  if (!raw.trim()) {
    return {
      path,
      exists: true,
      raw,
      policy: createDefaultGuiPolicy(),
      errors: ["Config file is empty"]
    };
  }
  try {
    const parsed = JSON.parse(raw);
    const errors = validatePolicyConfig(parsed);
    return {
      path,
      exists: true,
      raw,
      policy: errors.length > 0 ? createDefaultGuiPolicy() : normalizeGuiPolicy(parsed),
      errors
    };
  } catch (error) {
    return {
      path,
      exists: true,
      raw,
      policy: createDefaultGuiPolicy(),
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}
function writeUserPolicyFromGui(policy, options2 = {}) {
  const path = getUserPolicyPath(options2);
  const errors = validatePolicyConfig(policy);
  const normalizedPolicy = errors.length > 0 ? createDefaultGuiPolicy() : normalizeGuiPolicy(policy);
  if (errors.length > 0) {
    return { path, policy: normalizedPolicy, errors };
  }
  mkdirSync3(dirname7(path), { recursive: true, mode: 448 });
  writeJsonAtomic(path, normalizedPolicy, 384);
  chmodSync(path, 384);
  return { path, policy: normalizedPolicy, errors: [] };
}
function repairUserPolicyForGui(options2 = {}) {
  const path = getUserPolicyPath(options2);
  if (!existsSync5(path))
    return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options2);
  const raw = readFileSync5(path, "utf-8");
  if (!raw.trim())
    return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options2);
  try {
    return writeUserPolicyFromGui(repairPolicyConfig(JSON.parse(raw)), options2);
  } catch {
    return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options2);
  }
}
function loadPolicyConfig(options2 = {}) {
  const user = readPolicyConfig(getUserPolicyPath(options2));
  return {
    safety: user.policy.safety,
    worktreeMode: user.policy.worktreeMode,
    destructiveCommandProtectionEnabled: user.policy.destructiveCommandProtectionEnabled,
    disabledDestructiveCommandRules: new Set(user.policy.disabledDestructiveCommandRules),
    secretProtection: user.policy.secretProtection,
    errors: user.errors
  };
}
function repairPolicyConfig(value) {
  if (!isRecord(value))
    return createDefaultGuiPolicy();
  const safety = isRecord(value.safety) ? value.safety : {};
  const safetyOverrides = isRecord(safety.overrides) ? safety.overrides : {};
  const workflow = isRecord(value.workflow) ? value.workflow : {};
  const destructiveCommand = isRecord(value.destructive_command_protection) ? value.destructive_command_protection : {};
  const secret = isRecord(value.secret_protection) ? value.secret_protection : {};
  return {
    version: 1,
    safety: {
      level: SAFETY_LEVELS2.has(safety.level) ? safety.level : "standard",
      overrides: {
        ...typeof safetyOverrides.fail_closed === "boolean" ? { fail_closed: safetyOverrides.fail_closed } : {},
        ...typeof safetyOverrides.paranoid_rm === "boolean" ? { paranoid_rm: safetyOverrides.paranoid_rm } : {},
        ...typeof safetyOverrides.paranoid_interpreters === "boolean" ? { paranoid_interpreters: safetyOverrides.paranoid_interpreters } : {}
      }
    },
    workflow: {
      worktree_mode: typeof workflow.worktree_mode === "boolean" ? workflow.worktree_mode : false
    },
    destructive_command_protection: {
      enabled: typeof destructiveCommand.enabled === "boolean" ? destructiveCommand.enabled : true,
      overrides: repairOffOverrides(destructiveCommand.overrides, DESTRUCTIVE_COMMAND_RULE_ID_SET)
    },
    secret_protection: {
      enabled: typeof secret.enabled === "boolean" ? secret.enabled : true,
      overrides: repairOffOverrides(secret.overrides, SECRET_PROTECTION_RULE_ID_SET),
      deny_paths: repairDenyPaths(secret.deny_paths)
    }
  };
}
function repairOffOverrides(value, knownRuleIds) {
  if (!isRecord(value))
    return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, override]) => knownRuleIds.has(id) && override === "off" ? [[id, "off"]] : []));
}
function repairDenyPaths(value) {
  if (!Array.isArray(value))
    return [];
  return value.filter((path) => typeof path === "string" && path.trim() !== "");
}
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function createDefaultGuiPolicy() {
  return {
    version: 1,
    safety: {
      level: DEFAULT_GUI_POLICY.safety.level,
      overrides: {}
    },
    workflow: { ...DEFAULT_GUI_POLICY.workflow },
    destructive_command_protection: {
      enabled: DEFAULT_GUI_POLICY.destructive_command_protection.enabled,
      overrides: {}
    },
    secret_protection: {
      enabled: DEFAULT_GUI_POLICY.secret_protection.enabled,
      overrides: {},
      deny_paths: []
    }
  };
}
function normalizeGuiPolicy(policy) {
  const config = policy;
  const safety = config.safety ?? {};
  const safetyOverrides = safety.overrides ?? {};
  const workflow = config.workflow ?? {};
  const destructiveCommandPolicy = config.destructive_command_protection ?? {};
  const destructiveCommandOverrides = destructiveCommandPolicy.overrides ?? {};
  const secret = config.secret_protection ?? {};
  const secretOverrides = secret.overrides ?? {};
  return {
    version: 1,
    safety: {
      level: safety.level ?? "standard",
      overrides: {
        ...safetyOverrides.fail_closed !== undefined ? { fail_closed: safetyOverrides.fail_closed } : {},
        ...safetyOverrides.paranoid_rm !== undefined ? { paranoid_rm: safetyOverrides.paranoid_rm } : {},
        ...safetyOverrides.paranoid_interpreters !== undefined ? { paranoid_interpreters: safetyOverrides.paranoid_interpreters } : {}
      }
    },
    workflow: {
      worktree_mode: workflow.worktree_mode ?? false
    },
    destructive_command_protection: {
      enabled: destructiveCommandPolicy.enabled ?? true,
      overrides: Object.fromEntries(Object.entries(destructiveCommandOverrides).flatMap(([id, value]) => value === "off" ? [[id, "off"]] : []))
    },
    secret_protection: {
      enabled: secret.enabled ?? true,
      overrides: Object.fromEntries(Object.entries(secretOverrides).flatMap(([id, value]) => value === "off" ? [[id, "off"]] : [])),
      deny_paths: [...secret.deny_paths ?? []]
    }
  };
}
function readPolicyConfig(path) {
  const empty = createEmptyPolicy();
  if (!existsSync5(path))
    return { policy: empty, errors: [] };
  try {
    const content = readFileSync5(path, "utf-8");
    if (!content.trim()) {
      return { policy: empty, errors: [`${path}: Config file is empty`] };
    }
    const parsed = JSON.parse(content);
    const errors = validatePolicyConfig(parsed);
    if (errors.length > 0)
      return { policy: empty, errors: errors.map((error) => `${path}: ${error}`) };
    return { policy: normalizePolicyConfig(parsed), errors: [] };
  } catch {
    return {
      policy: empty,
      errors: [`${path}: Invalid JSON`]
    };
  }
}
function createEmptyPolicy() {
  return {
    safety: {},
    worktreeMode: false,
    destructiveCommandProtectionEnabled: true,
    disabledDestructiveCommandRules: [],
    secretProtection: { enabled: true, disabledRules: new Set, denyPaths: [] }
  };
}
function validatePolicyConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["Config must be an object"];
  }
  const cfg = config;
  addUnknownFieldErrors(cfg, TOP_LEVEL_FIELDS, errors);
  if (cfg.version !== 1)
    errors.push("version must be 1");
  validateSafety(cfg.safety, errors);
  validateWorkflow(cfg.workflow, errors);
  validateDestructiveCommandPolicy(cfg.destructive_command_protection, errors);
  validateSecretProtection(cfg.secret_protection, errors);
  return errors;
}
function validateSafety(value, errors) {
  if (value === undefined)
    return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("safety must be an object if provided");
    return;
  }
  const safety = value;
  addUnknownFieldErrors(safety, SAFETY_FIELDS, errors, "safety");
  if (safety.level !== undefined && !SAFETY_LEVELS2.has(safety.level)) {
    errors.push('safety.level must be "standard", "strict", or "paranoid"');
  }
  validateSafetyOverrides(safety.overrides, errors);
}
function validateSafetyOverrides(value, errors) {
  if (value === undefined)
    return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("safety.overrides must be an object if provided");
    return;
  }
  const overrides = value;
  addUnknownFieldErrors(overrides, SAFETY_OVERRIDE_FIELDS, errors, "safety.overrides");
  for (const [key, override] of Object.entries(overrides)) {
    if (typeof override !== "boolean")
      errors.push(`safety.overrides.${key} must be a boolean`);
  }
}
function validateWorkflow(value, errors) {
  if (value === undefined)
    return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("workflow must be an object if provided");
    return;
  }
  const workflow = value;
  addUnknownFieldErrors(workflow, WORKFLOW_FIELDS, errors, "workflow");
  if (workflow.worktree_mode !== undefined && typeof workflow.worktree_mode !== "boolean") {
    errors.push("workflow.worktree_mode must be a boolean");
  }
}
function validateDestructiveCommandPolicy(value, errors) {
  if (value === undefined)
    return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("destructive_command_protection must be an object if provided");
    return;
  }
  const destructiveCommandPolicy = value;
  addUnknownFieldErrors(destructiveCommandPolicy, DESTRUCTIVE_COMMAND_POLICY_FIELDS, errors, "destructive_command_protection");
  if (destructiveCommandPolicy.enabled !== undefined && typeof destructiveCommandPolicy.enabled !== "boolean") {
    errors.push("destructive_command_protection.enabled must be a boolean");
  }
  validateDestructiveCommandOverrides(destructiveCommandPolicy.overrides, errors);
}
function validateDestructiveCommandOverrides(value, errors) {
  if (value === undefined)
    return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("destructive_command_protection.overrides must be an object if provided");
    return;
  }
  for (const [id, override] of Object.entries(value)) {
    if (!DESTRUCTIVE_COMMAND_RULE_ID_SET.has(id)) {
      errors.push(`unknown destructive command rule id "${id}"`);
    }
    if (override !== "off") {
      errors.push(`destructive_command_protection.overrides.${id} must be "off"`);
    }
  }
}
function validateSecretProtection(value, errors) {
  if (value === undefined)
    return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("secret_protection must be an object if provided");
    return;
  }
  const secret = value;
  addUnknownFieldErrors(secret, SECRET_PROTECTION_FIELDS, errors, "secret_protection");
  if (secret.enabled !== undefined && typeof secret.enabled !== "boolean") {
    errors.push("secret_protection.enabled must be a boolean");
  }
  validateSecretOverrides(secret.overrides, errors);
  validatePathArray(secret.deny_paths, "secret_protection.deny_paths", errors);
}
function validateSecretOverrides(value, errors) {
  if (value === undefined)
    return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("secret_protection.overrides must be an object if provided");
    return;
  }
  for (const [id, override] of Object.entries(value)) {
    if (!SECRET_PROTECTION_RULE_ID_SET.has(id)) {
      errors.push(`unknown secret protection rule id "${id}"`);
    }
    if (override !== "off") {
      errors.push(`secret_protection.overrides.${id} must be "off"`);
    }
  }
}
function validatePathArray(value, field, errors) {
  if (value === undefined)
    return;
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array of paths`);
    return;
  }
  for (let i = 0;i < value.length; i++) {
    const path = value[i];
    if (typeof path !== "string" || path.trim() === "") {
      errors.push(`${field}[${i}] must be a non-empty path string`);
    }
  }
}
function normalizePolicyConfig(config) {
  const safety = normalizeSafety(config.safety);
  const workflow = config.workflow;
  const destructiveCommand = config.destructive_command_protection;
  const secret = config.secret_protection;
  return {
    safety,
    worktreeMode: workflow?.worktree_mode ?? false,
    destructiveCommandProtectionEnabled: destructiveCommand?.enabled ?? true,
    disabledDestructiveCommandRules: Object.entries(destructiveCommand?.overrides ?? {}).flatMap(([id, value]) => value === "off" ? [id] : []),
    secretProtection: {
      enabled: secret?.enabled ?? true,
      disabledRules: new Set(Object.entries(secret?.overrides ?? {}).flatMap(([id, value]) => value === "off" ? [id] : [])),
      denyPaths: [...secret?.deny_paths ?? []]
    }
  };
}
function normalizeSafety(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return {};
  const safety = value;
  const overrides = safety.overrides ?? {};
  return {
    level: safety.level,
    overrides: {
      failClosed: overrides.fail_closed,
      paranoidRm: overrides.paranoid_rm,
      paranoidInterpreters: overrides.paranoid_interpreters
    }
  };
}
function addUnknownFieldErrors(record, allowed, errors, prefix) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      errors.push(`${prefix ? `${prefix}.` : ""}unknown field "${key}"`);
    }
  }
}

// src/core/rules/custom-rule-validation.ts
function validateCustomRule(rule, index, ruleNames, options2 = {}) {
  const errors = [];
  const prefix = `rules[${index}]`;
  if (!rule || typeof rule !== "object") {
    errors.push(`${prefix}: must be an object`);
    return errors;
  }
  const r = rule;
  const messageStyle = options2.messageStyle ?? "legacy";
  if (typeof r.name !== "string") {
    errors.push(`${prefix}.name: required string`);
  } else {
    if (!NAME_PATTERN.test(r.name)) {
      errors.push(messageStyle === "rulebook" ? `${prefix}.name: must match rule name pattern` : `${prefix}.name: must match pattern (letters, numbers, hyphens, underscores; max 64 chars)`);
    }
    const lowerName = r.name.toLowerCase();
    if (ruleNames.has(lowerName)) {
      errors.push(`${prefix}.name: duplicate rule name "${r.name}"`);
    } else {
      ruleNames.add(lowerName);
    }
  }
  if (typeof r.command !== "string") {
    errors.push(messageStyle === "rulebook" ? `${prefix}.command: required string matching command pattern` : `${prefix}.command: required string`);
  } else if (!COMMAND_PATTERN.test(r.command)) {
    errors.push(messageStyle === "rulebook" ? `${prefix}.command: required string matching command pattern` : `${prefix}.command: must match pattern (letters, numbers, hyphens, underscores)`);
  }
  if (r.subcommand !== undefined) {
    if (typeof r.subcommand !== "string") {
      errors.push(messageStyle === "rulebook" ? `${prefix}.subcommand: must match command pattern` : `${prefix}.subcommand: must be a string if provided`);
    } else if (!COMMAND_PATTERN.test(r.subcommand)) {
      errors.push(messageStyle === "rulebook" ? `${prefix}.subcommand: must match command pattern` : `${prefix}.subcommand: must match pattern (letters, numbers, hyphens, underscores)`);
    }
  }
  if (!Array.isArray(r.block_args)) {
    errors.push(messageStyle === "rulebook" ? `${prefix}.block_args: required non-empty array` : `${prefix}.block_args: required array`);
  } else {
    if (r.block_args.length === 0) {
      errors.push(messageStyle === "rulebook" ? `${prefix}.block_args: required non-empty array` : `${prefix}.block_args: must have at least one element`);
    }
    for (let i = 0;i < r.block_args.length; i++) {
      const arg = r.block_args[i];
      if (typeof arg !== "string") {
        errors.push(messageStyle === "rulebook" ? `${prefix}.block_args[${i}]: must be a non-empty string` : `${prefix}.block_args[${i}]: must be a string`);
      } else if (arg === "") {
        errors.push(messageStyle === "rulebook" ? `${prefix}.block_args[${i}]: must be a non-empty string` : `${prefix}.block_args[${i}]: must not be empty`);
      }
    }
  }
  if (typeof r.reason !== "string") {
    errors.push(messageStyle === "rulebook" ? `${prefix}.reason: required non-empty string up to ${MAX_REASON_LENGTH} characters` : `${prefix}.reason: required string`);
  } else if (r.reason === "") {
    errors.push(messageStyle === "rulebook" ? `${prefix}.reason: required non-empty string up to ${MAX_REASON_LENGTH} characters` : `${prefix}.reason: must not be empty`);
  } else if (r.reason.length > MAX_REASON_LENGTH) {
    errors.push(messageStyle === "rulebook" ? `${prefix}.reason: required non-empty string up to ${MAX_REASON_LENGTH} characters` : `${prefix}.reason: must be at most ${MAX_REASON_LENGTH} characters`);
  }
  if (r.intent !== undefined && !isBlockIntent2(r.intent)) {
    errors.push(`${prefix}.intent: must be one of ${BLOCK_INTENTS.join(", ")}`);
  }
  return errors;
}
function isBlockIntent2(value) {
  return typeof value === "string" && BLOCK_INTENTS.includes(value);
}

// src/core/rules/policy/scope-policy.ts
import { existsSync as existsSync8, readFileSync as readFileSync8, realpathSync as realpathSync7 } from "node:fs";
import { dirname as dirname8, isAbsolute as isAbsolute7, join as join9, relative, resolve as resolve6, sep as sep4 } from "node:path";

// src/core/rules/rulebook.ts
function validateRulebook(rulebook) {
  const errors = [];
  const ruleNames = new Set;
  if (!rulebook || typeof rulebook !== "object") {
    return { errors: ["Rulebook must be an object"], ruleNames };
  }
  const rb = rulebook;
  if (rb.rulebook_version !== 1) {
    errors.push("rulebook_version must be 1");
  }
  if (typeof rb.name !== "string" || !NAME_PATTERN.test(rb.name)) {
    errors.push("name: required string matching rule name pattern");
  }
  if (typeof rb.version !== "string" || rb.version === "") {
    errors.push("version: required non-empty string");
  }
  if (!Array.isArray(rb.allowed_commands)) {
    errors.push("allowed_commands: required array");
  } else {
    validateAllowedCommands(rb.allowed_commands, errors);
  }
  if (!Array.isArray(rb.rules)) {
    errors.push("rules: required array");
  } else {
    for (let i = 0;i < rb.rules.length; i++) {
      errors.push(...validateCustomRule(rb.rules[i], i, ruleNames, { messageStyle: "rulebook" }));
    }
  }
  if (!Array.isArray(rb.tests)) {
    errors.push("tests: required array");
  } else {
    validateFixtures(rb.tests, rb.rules, errors);
  }
  if (Array.isArray(rb.allowed_commands) && Array.isArray(rb.rules)) {
    const allowed = new Set(rb.allowed_commands.filter((cmd) => typeof cmd === "string"));
    for (let i = 0;i < rb.rules.length; i++) {
      const rule = rb.rules[i];
      if (typeof rule.command === "string" && !allowed.has(rule.command)) {
        errors.push(`rules[${i}].command: "${rule.command}" must be listed in allowed_commands`);
      }
    }
  }
  return { errors, ruleNames };
}
function validateAllowedCommands(commands, errors) {
  const seen = new Set;
  for (let i = 0;i < commands.length; i++) {
    const command2 = commands[i];
    if (typeof command2 !== "string" || !COMMAND_PATTERN.test(command2)) {
      errors.push(`allowed_commands[${i}]: must match command pattern`);
      continue;
    }
    if (seen.has(command2)) {
      errors.push(`allowed_commands[${i}]: duplicate command "${command2}"`);
      continue;
    }
    seen.add(command2);
  }
}
function validateFixtures(tests, rules, errors) {
  const blockedFixtures = new Set;
  const ruleNames = new Set(Array.isArray(rules) ? rules.map((rule) => rule && typeof rule === "object" ? rule.name : null).filter((name) => typeof name === "string") : []);
  for (let i = 0;i < tests.length; i++) {
    const fixture = tests[i];
    if (!fixture || typeof fixture !== "object") {
      errors.push(`tests[${i}]: must be an object`);
      continue;
    }
    const f = fixture;
    if (typeof f.command !== "string" || f.command.trim() === "") {
      errors.push(`tests[${i}].command: required non-empty string`);
    }
    if (f.expect !== "blocked" && f.expect !== "allowed") {
      errors.push(`tests[${i}].expect: must be "blocked" or "allowed"`);
    }
    if (f.rule !== undefined && typeof f.rule !== "string") {
      errors.push(`tests[${i}].rule: must be a string if provided`);
    }
    if (f.expect === "blocked" && typeof f.rule !== "string") {
      errors.push(`tests[${i}].rule: required string for blocked fixtures`);
    }
    if (f.expect === "blocked" && typeof f.rule === "string") {
      blockedFixtures.add(f.rule);
    }
  }
  for (let i = 0;i < (Array.isArray(rules) ? rules.length : 0); i++) {
    const rule = rules[i];
    if (typeof rule.name === "string" && !blockedFixtures.has(rule.name)) {
      errors.push(`rules[${i}]: missing blocked fixture for rule "${rule.name}"`);
    }
  }
  for (const rule of blockedFixtures) {
    if (!ruleNames.has(rule)) {
      errors.push(`tests: blocked fixture references unknown rule "${rule}"`);
    }
  }
}
function runRulebookFixtures(rulebook) {
  const failures = rulebook.tests.flatMap((fixture) => {
    const segments2 = splitShellCommands(fixture.command).map((tokens) => {
      const result = checkCustomRuleMatch(tokens, rulebook.rules);
      return { tokens, result, matchedRule: result?.id.replace(/^custom\./, "") ?? null };
    });
    const firstSegment = segments2[0] ?? { tokens: [], result: null, matchedRule: null };
    if (fixture.expect === "allowed") {
      const blockedSegment = segments2.find((segment) => segment.result);
      return blockedSegment ? [
        {
          command: fixture.command,
          message: `expected allowed but matched ${blockedSegment.matchedRule ?? "a rule"}`,
          trace: traceRulebookFixture(blockedSegment.tokens, rulebook.rules)
        }
      ] : [];
    }
    const firstBlockedSegment = segments2.find((segment) => segment.result);
    if (!firstBlockedSegment) {
      return [
        {
          command: fixture.command,
          message: `expected blocked by ${fixture.rule ?? "a rule"} but command was allowed`,
          trace: traceRulebookFixture(firstSegment.tokens, rulebook.rules)
        }
      ];
    }
    if (!fixture.rule || firstBlockedSegment.matchedRule === fixture.rule)
      return [];
    return [
      {
        command: fixture.command,
        message: `expected blocked by ${fixture.rule} but matched ${firstBlockedSegment.matchedRule}`,
        trace: traceRulebookFixture(firstBlockedSegment.tokens, rulebook.rules)
      }
    ];
  });
  return { ok: failures.length === 0, failures };
}
function traceRulebookFixture(tokens, rules) {
  return rules.map((rule) => {
    const result = checkCustomRules([...tokens], [rule]);
    return `${result ? "matched" : "skipped"} ${rule.name}`;
  });
}
function assertValidRulebook(rulebook) {
  const result = validateRulebook(rulebook);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join("; "));
  }
  const parsed = rulebook;
  const fixtures = runRulebookFixtures(parsed);
  if (!fixtures.ok) {
    throw new Error(fixtures.failures.map((failure) => `${failure.command}: ${failure.message}`).join("; "));
  }
  return parsed;
}

// src/core/rules/policy/lockfile.ts
import { existsSync as existsSync6, readFileSync as readFileSync6 } from "node:fs";
var SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
var RULEBOOK_SOURCE_KINDS = new Set(["local-directory", "github"]);
function readLockfile(path) {
  if (!existsSync6(path)) {
    return { lock: null, errors: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync6(path, "utf-8"));
    if (!parsed || typeof parsed !== "object") {
      return { lock: null, errors: [`malformed lockfile ${path}: must be an object`] };
    }
    const lock = parsed;
    if (lock.version !== 1 || !Array.isArray(lock.rulebooks)) {
      return { lock: null, errors: [`malformed lockfile ${path}`] };
    }
    const parsedEntries = lock.rulebooks.map((entry, index) => parseLockEntry(entry, `${path}: rulebooks[${index}]`));
    const entryErrors = parsedEntries.flatMap((entry) => entry.errors);
    if (entryErrors.length > 0) {
      return { lock: null, errors: [`malformed lockfile ${path}`, ...entryErrors] };
    }
    return {
      lock: {
        version: 1,
        rulebooks: parsedEntries.flatMap((entry) => entry.entry ? [entry.entry] : [])
      },
      errors: []
    };
  } catch (error) {
    return {
      lock: null,
      errors: [
        `malformed lockfile ${path}: ${error instanceof Error ? error.message : String(error)}`
      ]
    };
  }
}
function parseLockEntry(entry, prefix) {
  if (!entry || typeof entry !== "object") {
    return { entry: null, errors: [`${prefix}: must be an object`] };
  }
  const candidate = entry;
  const errors = [
    ...validateRequiredString(candidate, prefix, "spec"),
    ...validateRequiredString(candidate, prefix, "name"),
    ...validateRequiredString(candidate, prefix, "version"),
    ...validateDigest(candidate, prefix),
    ...validateKind(candidate, prefix),
    ...validateKindFields(candidate, prefix)
  ];
  if (errors.length > 0)
    return { entry: null, errors };
  if (candidate.kind === "local-directory") {
    const localEntry = {
      spec: requiredString(candidate, "spec"),
      kind: "local-directory",
      path: requiredString(candidate, "path"),
      name: requiredString(candidate, "name"),
      version: requiredString(candidate, "version"),
      digest: requiredString(candidate, "digest")
    };
    const identityError2 = getLockEntrySourceIdentityError(localEntry, prefix);
    if (identityError2)
      return { entry: null, errors: [identityError2] };
    return {
      entry: localEntry,
      errors: []
    };
  }
  const githubEntry = {
    spec: requiredString(candidate, "spec"),
    kind: "github",
    owner: requiredString(candidate, "owner"),
    repo: requiredString(candidate, "repo"),
    ref: requiredString(candidate, "ref"),
    commit: requiredString(candidate, "commit"),
    path: requiredString(candidate, "path"),
    name: requiredString(candidate, "name"),
    version: requiredString(candidate, "version"),
    digest: requiredString(candidate, "digest")
  };
  const identityError = getLockEntrySourceIdentityError(githubEntry, prefix);
  if (identityError)
    return { entry: null, errors: [identityError] };
  return {
    entry: typeof candidate.display_ref === "string" && candidate.display_ref !== "" ? { ...githubEntry, display_ref: candidate.display_ref } : githubEntry,
    errors: []
  };
}
function validateRequiredString(candidate, prefix, field) {
  return typeof candidate[field] === "string" && candidate[field].trim() !== "" ? [] : [`${prefix}.${field}: required string`];
}
function validateDigest(candidate, prefix) {
  return typeof candidate.digest === "string" && SHA256_DIGEST_PATTERN.test(candidate.digest) ? [] : [`${prefix}.digest: required sha256 digest`];
}
function validateKind(candidate, prefix) {
  if (typeof candidate.kind !== "string") {
    return [`${prefix}.kind: required string`];
  }
  return RULEBOOK_SOURCE_KINDS.has(candidate.kind) ? [] : [`${prefix}.kind: unknown kind "${candidate.kind}"`];
}
function validateKindFields(candidate, prefix) {
  if (candidate.kind === "local-directory") {
    return validateRequiredString(candidate, prefix, "path");
  }
  if (candidate.kind === "github") {
    return ["owner", "repo", "ref", "commit", "path"].flatMap((field) => validateRequiredString(candidate, prefix, field));
  }
  return [];
}
function getLockEntrySourceIdentityError(entry, prefix) {
  const error = getRulebookLockEntrySourceIdentityError(entry);
  return error ? `${prefix}: ${error}` : null;
}
function requiredString(candidate, field) {
  const value = candidate[field];
  if (typeof value !== "string") {
    throw new Error(`Expected ${field} to be validated before reading`);
  }
  return value;
}

// src/core/rules/policy/resolver.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync7, readFileSync as readFileSync7 } from "node:fs";
import { join as join8 } from "node:path";
async function resolveRulebookSource(spec, configDir, options2) {
  if (isGitHubRulebookSource(spec)) {
    return resolveGitHubRulebook(spec);
  }
  return resolveLocalRulebook(spec, configDir, options2);
}
async function resolveRulebookSourceForSync(spec, configDir, options2, previousLock) {
  if (!isGitHubRulebookSource(spec) || options2.refresh) {
    return resolveRulebookSource(spec, configDir, options2);
  }
  const locked = previousLock?.rulebooks.find((entry) => entry.spec === spec);
  if (!locked || locked.kind !== "github") {
    return resolveRulebookSource(spec, configDir, options2);
  }
  return readLockedGitHubRulebook(locked, configDir, options2);
}
async function discoverGitHubRepositoryRulebooks(source) {
  const [owner, repo] = source.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository source: ${source}`);
  }
  const metadataResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!metadataResponse.ok) {
    throw new Error(`Failed to inspect ${source}: GitHub returned ${metadataResponse.status}`);
  }
  const metadata = await metadataResponse.json();
  if (!metadata.default_branch) {
    throw new Error(`Failed to inspect ${source}: missing default branch`);
  }
  const commit = await resolveGitHubCommit(owner, repo, metadata.default_branch, source);
  const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`);
  if (!treeResponse.ok) {
    throw new Error(`Failed to inspect ${source}: GitHub tree returned ${treeResponse.status}`);
  }
  const treeJson = await treeResponse.json();
  const names = (treeJson.tree ?? []).flatMap((entry) => {
    if (entry.type !== "blob" || typeof entry.path !== "string")
      return [];
    const match = entry.path.match(GITHUB_RULEBOOK_PATH_RE);
    return match?.[1] ? [match[1]] : [];
  }).sort();
  if (names.length === 0) {
    throw new Error(`No rulebooks found in ${source} under ${RULES_DIR}/`);
  }
  return names.map((name) => ({
    spec: `${owner}/${repo}#${commit}/${name}`,
    display_ref: metadata.default_branch
  }));
}
function resolveLocalRulebook(spec, configDir, _options) {
  assertBareRulebookName(spec);
  const path = getLocalRulebookPath(configDir, spec);
  if (!existsSync7(path)) {
    throw new Error(`Rulebook source not found: ${spec}`);
  }
  const content = readFileSync7(path, "utf-8");
  const rulebook = assertValidRulebook(JSON.parse(content));
  if (rulebook.name !== spec) {
    throw new Error(`rulebook name "${rulebook.name}" must match local source "${spec}"`);
  }
  return {
    rulebook,
    content,
    entry: {
      spec,
      kind: "local-directory",
      path: spec,
      name: rulebook.name,
      version: rulebook.version,
      digest: sha256Digest(content)
    }
  };
}
async function resolveGitHubRulebook(spec) {
  const parsed = parseGitHubSource(spec);
  const commit = await resolveGitHubCommit(parsed.owner, parsed.repo, parsed.ref, spec);
  const rawResponse = await fetch(`https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${commit}/${parsed.path}`);
  if (!rawResponse.ok) {
    throw new Error(`Failed to fetch ${spec}: GitHub raw returned ${rawResponse.status}`);
  }
  const content = await rawResponse.text();
  const rulebook = assertValidRulebook(JSON.parse(content));
  if (rulebook.name !== parsed.name) {
    throw new Error(`rulebook name "${rulebook.name}" must match GitHub source "${parsed.name}"`);
  }
  return {
    rulebook,
    content,
    entry: {
      spec,
      kind: "github",
      owner: parsed.owner,
      repo: parsed.repo,
      ref: parsed.ref,
      commit,
      path: parsed.path,
      name: rulebook.name,
      version: rulebook.version,
      digest: sha256Digest(content)
    }
  };
}
async function readLockedGitHubRulebook(entry, configDir, options2) {
  const identityError = getRulebookLockEntrySourceIdentityError(entry);
  if (identityError) {
    throw new Error(`${identityError}; run ${RULE_SYNC_COMMAND}`);
  }
  const cachePath = getRulebookCachePath(entry, { ...options2, cacheConfigDir: configDir });
  if (existsSync7(cachePath)) {
    const content = readFileSync7(cachePath, "utf-8");
    if (sha256Digest(content) === entry.digest) {
      return { entry, rulebook: assertRulebookMatchesLockEntry(content, entry), content };
    }
  }
  return fetchLockedGitHubRulebook(entry);
}
async function fetchLockedGitHubRulebook(entry) {
  const rawResponse = await fetch(`https://raw.githubusercontent.com/${entry.owner}/${entry.repo}/${entry.commit}/${entry.path}`);
  if (!rawResponse.ok) {
    throw new Error(`Failed to restore ${entry.spec}: GitHub raw returned ${rawResponse.status}`);
  }
  const content = await rawResponse.text();
  if (sha256Digest(content) !== entry.digest) {
    throw new Error(`locked GitHub digest mismatch for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
  }
  return { entry, rulebook: assertRulebookMatchesLockEntry(content, entry), content };
}
function assertRulebookMatchesLockEntry(content, entry) {
  const rulebook = assertValidRulebook(JSON.parse(content));
  if (rulebook.name !== entry.name) {
    throw new Error(`rulebook name "${rulebook.name}" must match lock entry "${entry.name}"`);
  }
  return rulebook;
}
async function resolveGitHubCommit(owner, repo, ref, source) {
  const commitResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  if (!commitResponse.ok) {
    throw new Error(`Failed to resolve ${source}: GitHub returned ${commitResponse.status}`);
  }
  const commitJson = await commitResponse.json();
  if (!commitJson.sha) {
    throw new Error(`Failed to resolve commit for ${source}`);
  }
  return commitJson.sha;
}
function getLocalRulebookPath(configDir, name) {
  return join8(configDir, name, RULEBOOK_FILE);
}
function sha256Digest(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

// src/core/rules/policy/scope-policy.ts
function loadRulesPolicy(options2 = {}) {
  const paths = getPolicyPaths(options2);
  const sameConfigPath = isSameConfigPath(paths.userConfigPath, paths.projectConfigPath);
  const user = readRulesConfig(paths.userConfigPath);
  const project = sameConfigPath ? { config: null, errors: [] } : readRulesConfig(paths.projectConfigPath);
  const errors = [
    ...getLegacyRulesConfigErrors(paths, options2),
    ...user.errors.map((error) => `${paths.userConfigPath}: ${error}`),
    ...project.errors.map((error) => `${paths.projectConfigPath}: ${error}`)
  ];
  const userPolicy = user.config ? loadScopePolicy(user.config, paths.userLockPath, dirname8(paths.userConfigPath), options2, "user") : emptyScopePolicy();
  const projectPolicy = project.config ? loadScopePolicy(project.config, paths.projectLockPath, dirname8(paths.projectConfigPath), options2, "project") : emptyScopePolicy();
  const duplicateNames = getDuplicateRulebookNames([
    ...user.config ? getConfiguredLockEntries(user.config, paths.userLockPath) : [],
    ...project.config ? getConfiguredLockEntries(project.config, paths.projectLockPath) : []
  ]);
  const userOverrides = user.config?.overrides ?? {};
  const projectOverrides = project.config?.overrides ?? {};
  return {
    rules: [
      ...applyOverrides(userPolicy.rules, userOverrides),
      ...applyOverrides(projectPolicy.rules, projectOverrides)
    ],
    transparent_wrappers: mergeTransparentWrappers(user.config, project.config),
    rulebooks: [...userPolicy.rulebooks, ...projectPolicy.rulebooks],
    errors: [
      ...errors,
      ...userPolicy.errors,
      ...projectPolicy.errors,
      ...duplicateNames.map((name) => `duplicate active rulebook name "${name}"`),
      ...userPolicy.canValidateOverrides ? getUnknownOverrideErrors(userOverrides, userPolicy.knownRuleIds) : [],
      ...userPolicy.canValidateOverrides ? getProjectOverrideUserRuleErrors(projectOverrides, userPolicy.knownRuleIds) : [],
      ...projectPolicy.canValidateOverrides ? getUnknownOverrideErrors(projectOverrides, projectPolicy.knownRuleIds) : []
    ],
    userConfig: user.config ?? undefined,
    projectConfig: project.config ?? undefined,
    ...paths
  };
}
function getRulesConfigSourceDisplayMap(configPath) {
  const config = readRulesConfig(configPath).config;
  const lock = readLockfile(getRulesLockPathForConfigPath(configPath)).lock;
  if (!config || !lock)
    return new Map;
  const configuredSources = new Set(config.rules);
  return new Map(lock.rulebooks.filter((entry) => configuredSources.has(entry.spec)).map((entry) => [entry.spec, getRulebookDisplaySource(entry)]));
}
function getRulesConfigRuntimeErrorsForConfig(configPath, lockPath, options2) {
  const loaded = loadScopePolicyForConfig(configPath, lockPath, options2);
  if (!loaded)
    return [];
  return [...loaded.scope.errors, ...getUnknownOverrideErrorsForScope(loaded.config, loaded.scope)];
}
function loadScopePolicyForConfig(configPath, lockPath, options2) {
  const config = readRulesConfig(configPath).config;
  if (!config) {
    return null;
  }
  return {
    config,
    scope: loadScopePolicy(config, lockPath, dirname8(configPath), options2, "project")
  };
}
function getUnknownOverrideErrorsForScope(config, scope) {
  return scope.canValidateOverrides ? getUnknownOverrideErrors(config.overrides ?? {}, scope.knownRuleIds) : [];
}
function loadScopePolicy(config, lockPath, configDir, options2, source) {
  const lockResult = readLockfile(lockPath);
  if (lockResult.errors.length > 0) {
    return { ...emptyScopePolicy(), errors: lockResult.errors, canValidateOverrides: false };
  }
  const lock = lockResult.lock;
  if (!lock && config.rules.length > 0) {
    return {
      ...emptyScopePolicy(),
      errors: [`missing lockfile ${lockPath}; run ${RULE_SYNC_COMMAND}`],
      canValidateOverrides: false
    };
  }
  const entries = lock?.rulebooks ?? [];
  const entriesBySpec = new Map(entries.map((entry) => [entry.spec, entry]));
  const errors = [];
  const loaded = config.rules.flatMap((spec) => {
    const entry = entriesBySpec.get(spec);
    if (!entry) {
      errors.push(`missing lock entry for ${spec}; run ${RULE_SYNC_COMMAND}`);
      return [];
    }
    const loadedRulebook = loadLockedRulebook(entry, configDir, options2);
    if (loadedRulebook.errors.length > 0 || !loadedRulebook.rulebook) {
      errors.push(...loadedRulebook.errors);
      return [];
    }
    const rulebook = loadedRulebook.rulebook;
    return [
      {
        rules: rulebook.rules.map((rule) => ({ ...rule, name: `${rulebook.name}/${rule.name}` })),
        rulebook: {
          source,
          spec: entry.spec,
          name: rulebook.name,
          version: rulebook.version,
          rules: rulebook.rules.map((rule) => `${rulebook.name}/${rule.name}`)
        }
      }
    ];
  });
  const rules = loaded.flatMap((item) => item.rules);
  return {
    rules,
    rulebooks: loaded.map((item) => item.rulebook),
    entries,
    knownRuleIds: new Set(rules.map((rule) => rule.name)),
    errors,
    canValidateOverrides: errors.length === 0
  };
}
function loadLockedRulebook(entry, configDir, options2) {
  const errors = [];
  const cachePath = getRulebookCachePath(entry, { ...options2, cacheConfigDir: configDir });
  if (!existsSync8(cachePath)) {
    return {
      rulebook: null,
      errors: [`missing cache entry for ${entry.spec}; run ${RULE_SYNC_COMMAND}`]
    };
  }
  let cacheContent;
  try {
    cacheContent = readFileSync8(cachePath, "utf-8");
  } catch (error) {
    return {
      rulebook: null,
      errors: [
        `failed to read cached rulebook for ${entry.spec}: ${error instanceof Error ? error.message : String(error)}`
      ]
    };
  }
  if (sha256Digest(cacheContent) !== entry.digest) {
    errors.push(`cache digest mismatch for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
  }
  let rulebook = null;
  try {
    const parsed = JSON.parse(cacheContent);
    assertValidRulebook(parsed);
    rulebook = parsed;
  } catch (error) {
    errors.push(`invalid cached rulebook for ${entry.spec}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (entry.kind === "local-directory") {
    const sourcePath = resolve6(configDir, entry.path);
    const sourceRelative = relative(resolve6(configDir), sourcePath);
    if (sourceRelative === ".." || sourceRelative.startsWith(`..${sep4}`) || isAbsolute7(sourceRelative)) {
      errors.push(`lockfile local source path for ${entry.spec} must stay within ${configDir}; run ${RULE_SYNC_COMMAND}`);
      return { rulebook: null, errors };
    }
    const localPath = join9(sourcePath, RULEBOOK_FILE);
    if (!existsSync8(localPath)) {
      errors.push(`missing local source for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
    } else {
      try {
        const localContent = readFileSync8(localPath, "utf-8");
        if (sha256Digest(localContent) !== entry.digest) {
          errors.push(getLocalSourceDriftError(entry.spec, localContent));
        }
      } catch (error) {
        errors.push(`failed to read local source for ${entry.spec}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { rulebook: errors.length === 0 ? rulebook : null, errors };
}
function rulesPolicyToConfig(policy) {
  if (policy.errors.length > 0) {
    return {
      version: 1,
      rules: [],
      transparent_wrappers: [],
      failClosedReason: withTerminalPeriod(policy.errors.join("; "))
    };
  }
  return { version: 1, rules: policy.rules, transparent_wrappers: policy.transparent_wrappers };
}
function mergeTransparentWrappers(userConfig, projectConfig) {
  return [
    ...new Set([
      ...userConfig?.transparent_wrappers ?? [],
      ...projectConfig?.transparent_wrappers ?? []
    ])
  ];
}
function isSameConfigPath(userConfigPath, projectConfigPath) {
  if (resolve6(userConfigPath) === resolve6(projectConfigPath)) {
    return true;
  }
  if (!existsSync8(userConfigPath) || !existsSync8(projectConfigPath)) {
    return false;
  }
  try {
    return realpathSync7(userConfigPath) === realpathSync7(projectConfigPath);
  } catch {
    return false;
  }
}
function getLegacyRulesConfigErrors(paths, options2) {
  return Array.from(new Set([
    ...getLegacyRulesConfigError(getLegacyUserRulesConfigPath(options2), paths.userConfigPath, "~/.cc-safety-net/config.json"),
    ...getLegacyRulesConfigError(getLegacyProjectRulesConfigPath(options2), paths.projectConfigPath, ".safety-net.json")
  ]));
}
function getLegacyRulesConfigError(legacyPath, configPath, migratedFrom) {
  if (!existsSync8(legacyPath))
    return [];
  if (hasMigrationEvidence(configPath, migratedFrom))
    return [];
  if (!legacyRulesConfigNeedsMigration(legacyPath))
    return [];
  return [
    `legacy rules config location is no longer used; ask the user to run ${RULE_MIGRATE_COMMAND}`
  ];
}
function legacyRulesConfigNeedsMigration(legacyPath) {
  try {
    const parsed = JSON.parse(readFileSync8(legacyPath, "utf-8"));
    if (!parsed || typeof parsed !== "object")
      return true;
    const config = parsed;
    if (config.version !== 1)
      return true;
    if (config.rules === undefined)
      return false;
    if (!Array.isArray(config.rules))
      return true;
    return config.rules.length > 0;
  } catch {
    return true;
  }
}
function hasMigrationEvidence(configPath, migratedFrom) {
  const config = readRulesConfig(configPath).config;
  if (!config)
    return false;
  return config.rules.some((source) => getRulebookMigratedFrom(dirname8(configPath), source) === migratedFrom);
}
function getRulebookMigratedFrom(configDir, source) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(source))
    return null;
  const path = join9(configDir, source, RULEBOOK_FILE);
  if (!existsSync8(path))
    return null;
  try {
    const rulebook = JSON.parse(readFileSync8(path, "utf-8"));
    return typeof rulebook.migrated_from === "string" ? rulebook.migrated_from : null;
  } catch {
    return null;
  }
}
function getLocalSourceDriftError(spec, content) {
  try {
    assertValidRulebook(JSON.parse(content));
  } catch (error) {
    return `invalid local rulebook for ${spec}: ${error instanceof Error ? error.message : String(error)}; fix the rulebook, then run ${RULE_SYNC_COMMAND}`;
  }
  return `local source digest mismatch for ${spec}; run ${RULE_SYNC_COMMAND}`;
}
function applyOverrides(rules, overrides) {
  return rules.flatMap((rule) => {
    const override = overrides[rule.name];
    if (override === "off") {
      return [];
    }
    if (override && typeof override === "object") {
      return [{ ...rule, intent: override.intent ?? rule.intent, reason: override.reason }];
    }
    return [rule];
  });
}
function getUnknownOverrideErrors(overrides, knownRuleIds) {
  return Object.keys(overrides).filter((key) => !knownRuleIds.has(key)).map((key) => `unknown override key "${key}"`);
}
function getProjectOverrideUserRuleErrors(projectOverrides, userRuleIds) {
  return Object.keys(projectOverrides).filter((key) => userRuleIds.has(key)).map((key) => `project override cannot target user-scoped rule "${key}"`);
}
function getDuplicateRulebookNames(entries) {
  const seen = new Set;
  const duplicates = new Set;
  for (const entry of entries) {
    if (seen.has(entry.name)) {
      duplicates.add(entry.name);
      continue;
    }
    seen.add(entry.name);
  }
  return [...duplicates];
}
function getConfiguredLockEntries(config, path) {
  return (readLockfile(path).lock?.rulebooks ?? []).filter((entry) => config.rules.includes(entry.spec));
}
function emptyScopePolicy() {
  return {
    rules: [],
    rulebooks: [],
    entries: [],
    knownRuleIds: new Set,
    errors: [],
    canValidateOverrides: true
  };
}
function withTerminalPeriod(message) {
  return /[.!?]$/.test(message) ? message : `${message}.`;
}

// src/core/rules/policy/sync.ts
import {
  existsSync as existsSync9,
  lstatSync as lstatSync4,
  mkdirSync as mkdirSync4,
  readdirSync as readdirSync2,
  readFileSync as readFileSync9,
  rmdirSync,
  rmSync as rmSync2,
  unlinkSync,
  writeFileSync as writeFileSync2
} from "node:fs";
import { dirname as dirname9, isAbsolute as isAbsolute8, join as join10, relative as relative2, resolve as resolve7, sep as sep5 } from "node:path";
async function syncRulesConfig(options2 = {}) {
  const internalOptions = options2;
  const scope = getScopePaths(options2);
  const scopeConfig = readScopeRulesConfig(scope.configPath);
  if (!scopeConfig.ok)
    return scopeConfig.result;
  const config = scopeConfig.config;
  if (options2.check) {
    return checkRulesConfig(config, scope.configDir, scope.lockPath, options2);
  }
  try {
    const existingLockResult = readLockfile(scope.lockPath);
    if (options2.only && existingLockResult.errors.length > 0) {
      return { ok: false, errors: existingLockResult.errors, warnings: [], entries: [] };
    }
    const previousLock = existingLockResult.errors.length > 0 ? null : existingLockResult.lock;
    const selectedSpecs = options2.only ? getSelectedUpdateSpecs(config, previousLock, options2.only) : { ok: true, specs: config.rules };
    if (!selectedSpecs.ok) {
      return selectedSpecs.result;
    }
    if (options2.only && !previousLock && selectedSpecs.specs.length < config.rules.length) {
      return {
        ok: false,
        errors: [`No lockfile available for partial update; run ${RULE_SYNC_COMMAND}`],
        warnings: [],
        entries: []
      };
    }
    const resolved = (await Promise.all(selectedSpecs.specs.map((spec) => resolveRulebookSourceForSync(spec, scope.configDir, options2, previousLock)))).map((item) => preserveDisplayRef(item, previousLock, internalOptions.discoveredDisplayRefs));
    for (const item of resolved) {
      writeCache(item.content, item.entry, scope.configDir, options2);
    }
    const entries = options2.only ? mergeSelectedLockEntries(config, previousLock, resolved) : resolved.map((item) => item.entry);
    writeJsonAtomic(scope.lockPath, { version: 1, rulebooks: entries });
    const ruleCountsBySpec = new Map(resolved.map((item) => [item.entry.spec, item.rulebook.rules.length]));
    const warnings = pruneUnreferencedRulebookCaches(entries, scope.configDir, options2);
    return {
      ok: true,
      errors: [],
      warnings,
      entries: entries.map((entry) => addRuleCount(entry, ruleCountsBySpec))
    };
  } catch (error) {
    return failWithError(error);
  }
}
async function testRulebookSources(sources, options2 = {}) {
  const scope = getScopePaths(options2);
  try {
    const resolved = await Promise.all(sources.map((spec) => resolveRulebookSource(spec, scope.configDir, options2)));
    const ruleCountsBySpec = new Map(resolved.map((item) => [item.entry.spec, item.rulebook.rules.length]));
    const testCountsBySpec = new Map(resolved.map((item) => [item.entry.spec, item.rulebook.tests.length]));
    const fixtureErrors = resolved.flatMap((item) => runRulebookFixtures(item.rulebook).failures.map((failure) => [
      `${item.entry.spec}: ${failure.command}: ${failure.message}`,
      ...failure.trace.map((line) => `  ${line}`)
    ].join(`
`)));
    return {
      ok: fixtureErrors.length === 0,
      errors: fixtureErrors,
      warnings: [],
      entries: resolved.map((item) => ({
        ...addRuleCount(item.entry, ruleCountsBySpec),
        testCount: testCountsBySpec.get(item.entry.spec)
      }))
    };
  } catch (error) {
    return failWithError(error);
  }
}
async function addRulebookSource(source, options2 = {}) {
  const scope = getScopePaths(options2);
  mkdirSync4(scope.configDir, { recursive: true });
  const before = existsSync9(scope.configPath) ? readFileSync9(scope.configPath, "utf-8") : null;
  const scopeConfig = readScopeRulesConfig(scope.configPath);
  if (!scopeConfig.ok)
    return scopeConfig.result;
  const config = scopeConfig.config;
  let discoveredSources;
  try {
    discoveredSources = isGitHubRepositorySource(source) ? await discoverGitHubRepositoryRulebooks(source) : [{ spec: source }];
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      entries: []
    };
  }
  const sources = discoveredSources.map((item) => item.spec);
  const nextRules = [...config.rules, ...sources.filter((item) => !config.rules.includes(item))];
  if (nextRules.length !== config.rules.length) {
    writeJsonAtomic(scope.configPath, {
      version: 1,
      rules: nextRules,
      overrides: config.overrides ?? {},
      transparent_wrappers: config.transparent_wrappers ?? []
    });
  }
  const result = await syncRulesConfig({
    ...options2,
    discoveredDisplayRefs: new Map(discoveredSources.filter((item) => !!item.display_ref).map((item) => [item.spec, item.display_ref]))
  });
  if (!result.ok) {
    restoreConfig(scope.configPath, before);
  }
  return result;
}
async function removeRulebookSource(match, options2 = {}) {
  const internalOptions = options2;
  const scope = getScopePaths(options2);
  const loaded = readRulesConfig(scope.configPath);
  if (loaded.errors.length > 0) {
    return { ok: false, errors: loaded.errors, warnings: [], entries: [] };
  }
  if (!loaded.config) {
    return {
      ok: false,
      errors: [`No config found at ${scope.configPath}`],
      warnings: [],
      entries: []
    };
  }
  const lockResult = readLockfile(scope.lockPath);
  if (lockResult.errors.length > 0) {
    return { ok: false, errors: lockResult.errors, warnings: [], entries: [] };
  }
  const matches = getRemoveMatches(loaded.config.rules, lockResult.lock, match);
  if (!matches.ok)
    return matches.result;
  const sourceDirs = options2.deleteSource ? getLocalSourceDirsForDelete(scope.configDir, matches.specs, lockResult.lock) : { ok: true, dirs: [] };
  if (!sourceDirs.ok)
    return sourceDirs.result;
  const before = readFileSync9(scope.configPath, "utf-8");
  writeJsonAtomic(scope.configPath, {
    version: 1,
    rules: loaded.config.rules.filter((spec) => !matches.specs.includes(spec)),
    overrides: loaded.config.overrides ?? {},
    transparent_wrappers: loaded.config.transparent_wrappers ?? []
  });
  const result = await syncRulesConfig(options2);
  if (!result.ok) {
    restoreConfig(scope.configPath, before);
    return result;
  }
  const deleteResult = deleteLocalSourceDirs(sourceDirs.dirs, internalOptions);
  if (!deleteResult.ok) {
    restoreConfig(scope.configPath, before);
    const rollback = await syncRulesConfig(options2);
    if (!rollback.ok) {
      return {
        ok: false,
        errors: [...deleteResult.result.errors, ...rollback.errors],
        warnings: rollback.warnings,
        entries: rollback.entries
      };
    }
    return deleteResult.result;
  }
  return result;
}
function repairLocalRulesPolicy(options2 = {}) {
  repairLocalRulesScope({ ...options2, global: true });
  repairLocalRulesScope({ ...options2, global: false });
}
async function checkRulesConfig(config, configDir, lockPath, options2) {
  const result = loadScopePolicy(config, lockPath, configDir, options2, "project");
  return {
    ok: result.errors.length === 0,
    errors: result.errors,
    warnings: [],
    entries: result.entries
  };
}
function repairLocalRulesScope(options2) {
  const scope = getScopePaths(options2);
  const loaded = readRulesConfig(scope.configPath);
  if (!loaded.config || loaded.errors.length > 0 || loaded.config.rules.length === 0) {
    return;
  }
  if (!loaded.config.rules.every((spec) => /^[a-zA-Z0-9_-]{1,64}$/.test(spec))) {
    return;
  }
  try {
    const resolved = loaded.config.rules.map((spec) => resolveLocalRulebook(spec, scope.configDir, options2));
    for (const item of resolved) {
      writeCache(item.content, item.entry, scope.configDir, options2);
    }
    writeJsonAtomic(scope.lockPath, {
      version: 1,
      rulebooks: resolved.map((item) => item.entry)
    });
  } catch {}
}
function preserveDisplayRef(item, previousLock, discoveredDisplayRefs) {
  const previousEntry = previousLock?.rulebooks.find((entry) => entry.spec === item.entry.spec && entry.kind === "github");
  const displayRef = discoveredDisplayRefs?.get(item.entry.spec) ?? (previousEntry?.kind === "github" ? previousEntry.display_ref : undefined);
  if (!displayRef || item.entry.kind !== "github")
    return item;
  return { ...item, entry: { ...item.entry, display_ref: displayRef } };
}
function mergeSelectedLockEntries(config, previousLock, resolved) {
  const configuredSpecs = new Set(config.rules);
  const previousSpecs = new Set(previousLock?.rulebooks.map((entry) => entry.spec) ?? []);
  const resolvedBySpec = new Map(resolved.map((item) => [item.entry.spec, item.entry]));
  return [
    ...(previousLock?.rulebooks.filter((entry) => configuredSpecs.has(entry.spec)) ?? []).map((entry) => resolvedBySpec.get(entry.spec) ?? entry),
    ...resolved.filter((item) => !previousSpecs.has(item.entry.spec)).map((item) => item.entry)
  ];
}
function addRuleCount(entry, ruleCountsBySpec) {
  return {
    ...entry,
    ruleCount: ruleCountsBySpec.get(entry.spec)
  };
}
function writeCache(content, entry, configDir, options2) {
  const path = getRulebookCachePath(entry, { ...options2, cacheConfigDir: configDir });
  mkdirSync4(dirname9(path), { recursive: true });
  writeFileSync2(path, content, "utf-8");
}
function pruneUnreferencedRulebookCaches(entries, configDir, options2) {
  const internalOptions = options2;
  const cacheRoot = join10(dirname9(configDir), "cache", "rulebooks");
  if (!existsSync9(cacheRoot))
    return [];
  const keep = new Set(entries.map((entry) => dirname9(getRulebookCachePath(entry, { ...options2, cacheConfigDir: configDir }))));
  return readdirSync2(cacheRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const path = join10(cacheRoot, entry.name);
    if (keep.has(path))
      return [];
    try {
      pruneRulebookCacheDir(path, internalOptions);
      return [];
    } catch (error) {
      return [
        `Failed to prune rulebook cache entry ${path}: ${error instanceof Error ? error.message : String(error)}`
      ];
    }
  });
}
function getLocalSourceDirsForDelete(configDir, specs, lock) {
  const entriesBySpec = new Map(lock?.rulebooks.map((entry) => [entry.spec, entry]) ?? []);
  const errors = specs.flatMap((spec) => {
    const entry = entriesBySpec.get(spec);
    if (!entry) {
      return NAME_PATTERN.test(spec) ? [] : ["--delete-source can only delete local rulebook sources"];
    }
    return entry.kind === "local-directory" ? [] : ["--delete-source can only delete local rulebook sources"];
  });
  const dirs = specs.map((spec) => {
    const entry = entriesBySpec.get(spec);
    return join10(configDir, entry?.kind === "local-directory" ? entry.path : spec);
  });
  const dirErrors = errors.length > 0 ? [] : dirs.flatMap((dir) => getLocalSourceDirDeleteError(configDir, dir));
  const allErrors = [...errors, ...dirErrors];
  return allErrors.length > 0 ? { ok: false, result: { ok: false, errors: allErrors, warnings: [], entries: [] } } : { ok: true, dirs };
}
function getLocalSourceDirDeleteError(configDir, dir) {
  const resolvedConfigDir = resolve7(configDir);
  const resolvedDir = resolve7(dir);
  const relativeDir = relative2(resolvedConfigDir, resolvedDir);
  if (relativeDir === "" || relativeDir === ".." || relativeDir.startsWith(`..${sep5}`) || isAbsolute8(relativeDir)) {
    return [`Refusing to delete local rulebook source outside ${configDir}: ${dir}`];
  }
  if (!existsSync9(resolvedDir))
    return [`Local rulebook source directory not found: ${dir}`];
  if (!lstatSync4(resolvedDir).isDirectory()) {
    return [`Local rulebook source is not a directory: ${dir}`];
  }
  const entries = readdirSync2(resolvedDir);
  if (!entries.includes("rulebook.json")) {
    return [`Local rulebook source directory is missing rulebook.json: ${dir}`];
  }
  if (!lstatSync4(join10(resolvedDir, "rulebook.json")).isFile()) {
    return [`Local rulebook source rulebook.json is not a file: ${dir}`];
  }
  if (entries.length > 1) {
    return [
      `Local rulebook source directory contains extra files: ${dir}. delete manually if you really want to remove the directory.`
    ];
  }
  return [];
}
function deleteLocalSourceDirs(dirs, options2) {
  const errors = dirs.flatMap((dir) => {
    try {
      deleteLocalSourceDir(dir, options2);
      return [];
    } catch (error) {
      return [
        `Failed to delete local rulebook source ${dir}: ${error instanceof Error ? error.message : String(error)}`
      ];
    }
  });
  return errors.length > 0 ? { ok: false, result: { ok: false, errors, warnings: [], entries: [] } } : { ok: true };
}
function pruneRulebookCacheDir(path, options2) {
  if (options2._testPruneRulebookCacheDir) {
    options2._testPruneRulebookCacheDir(path);
    return;
  }
  rmSync2(path, { recursive: true, force: true });
}
function deleteLocalSourceDir(dir, options2) {
  if (options2._testDeleteLocalSourceDir) {
    options2._testDeleteLocalSourceDir(dir);
    return;
  }
  unlinkSync(join10(dir, "rulebook.json"));
  rmdirSync(dir);
}
function restoreConfig(path, content) {
  if (content === null) {
    rmSync2(path, { force: true });
    return;
  }
  writeFileSync2(path, content, "utf-8");
}
function failWithError(error) {
  return {
    ok: false,
    errors: [error instanceof Error ? error.message : String(error)],
    warnings: [],
    entries: []
  };
}

// src/core/config.ts
function loadConfig(cwd, options2) {
  const safeCwd = typeof cwd === "string" ? cwd : process.cwd();
  if (options2?.repairLocalRulebooks) {
    repairLocalRulesPolicy({ cwd: safeCwd, userConfigDir: options2.userConfigDir });
  }
  const rulesConfig = rulesPolicyToConfig(loadRulesPolicy({ cwd: safeCwd, userConfigDir: options2?.userConfigDir }));
  const policyConfig = loadPolicyConfig({ cwd: safeCwd, userConfigDir: options2?.userConfigDir });
  return {
    ...rulesConfig,
    safety: policyConfig.safety,
    worktreeMode: policyConfig.worktreeMode,
    destructiveCommandProtectionEnabled: policyConfig.destructiveCommandProtectionEnabled,
    disabledDestructiveCommandRules: policyConfig.disabledDestructiveCommandRules,
    secretProtection: policyConfig.secretProtection,
    failClosedReason: combineFailClosedReasons(rulesConfig.failClosedReason, policyConfig.errors.length > 0 ? `invalid policy config: ${policyConfig.errors.join("; ")}. Fix or remove the policy file manually` : undefined)
  };
}
function validateConfig(config) {
  const errors = [];
  const ruleNames = new Set;
  if (!config || typeof config !== "object") {
    errors.push("Config must be an object");
    return { errors, ruleNames };
  }
  const cfg = config;
  if (cfg.version !== 1) {
    errors.push("version must be 1");
  }
  if (cfg.rules !== undefined) {
    if (!Array.isArray(cfg.rules)) {
      errors.push("rules must be an array");
    } else {
      for (let i = 0;i < cfg.rules.length; i++) {
        errors.push(...validateCustomRule(cfg.rules[i], i, ruleNames));
      }
    }
  }
  return { errors, ruleNames };
}
function validateConfigFile(path) {
  return validateParsedConfigFile(path, validateConfig);
}
function readConfigFileInput(path) {
  const errors = [];
  const ruleNames = new Set;
  if (!existsSync10(path)) {
    errors.push(`File not found: ${path}`);
    return { ok: false, result: { errors, ruleNames } };
  }
  try {
    const content = readFileSync10(path, "utf-8");
    if (!content.trim()) {
      errors.push("Config file is empty");
      return { ok: false, result: { errors, ruleNames } };
    }
    return { ok: true, parsed: JSON.parse(content) };
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, result: { errors, ruleNames } };
  }
}
function getLegacyProjectConfigPath(cwd) {
  return resolve8(cwd ?? process.cwd(), ".safety-net.json");
}
function validateRulesConfigFile(path) {
  const loaded = readConfigFileInput(path);
  if (!loaded.ok)
    return loaded.result;
  const result = validateRulesConfig(loaded.parsed);
  return { errors: result.errors, ruleNames: result.sources };
}
function validateParsedConfigFile(path, validate) {
  const loaded = readConfigFileInput(path);
  if (!loaded.ok)
    return loaded.result;
  return validate(loaded.parsed);
}
function combineFailClosedReasons(...reasons) {
  const present = reasons.filter((reason) => !!reason);
  if (present.length === 0)
    return;
  return withTerminalPeriod2(present.join("; "));
}
function withTerminalPeriod2(value) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

// src/core/analyze/index.ts
function analyzeCommand(command2, options2 = {}) {
  const config = options2.config ?? loadConfig(options2.cwd);
  const modes = getCCSafetyNetEnvModes(config);
  return analyzeCommandInternal(command2, 0, {
    ...options2,
    config,
    strict: options2.strict ?? modes.strict,
    paranoidRm: options2.paranoidRm ?? modes.paranoidRm,
    paranoidInterpreters: options2.paranoidInterpreters ?? modes.paranoidInterpreters,
    worktreeMode: options2.worktreeMode ?? modes.worktreeMode
  });
}

// src/core/cwd-containment.ts
import { realpathSync as realpathSync8, statSync as statSync2 } from "node:fs";
import { isAbsolute as isAbsolute9, relative as relative3, resolve as resolve9 } from "node:path";
function resolveContainedCwd(requestedCwd, trustedRoots) {
  const roots = trustedRoots.flatMap((root) => canonicalDirectory(root));
  if (!roots[0])
    return;
  const requested = canonicalDirectory(isAbsolute9(requestedCwd) ? requestedCwd : resolve9(roots[0], requestedCwd))[0];
  if (!requested)
    return;
  return roots.some((root) => isSameOrInside(requested, root)) ? requested : undefined;
}
function firstTrustedRoot(trustedRoots) {
  return trustedRoots.flatMap((root) => canonicalDirectory(root))[0];
}
function canonicalDirectory(path) {
  try {
    const realPath = realpathSync8(path);
    return statSync2(realPath).isDirectory() ? [realPath] : [];
  } catch {
    return [];
  }
}
function isSameOrInside(path, root) {
  const rel = relative3(root, path);
  return rel === "" || !rel.startsWith("..") && !isAbsolute9(rel);
}

// src/core/format.ts
function formatBlockedMessage(input) {
  const { reason, command: command2, segment, toolName } = input;
  const maxLen = input.maxLen ?? 200;
  const redact = input.redact ?? ((t) => t);
  let message = `BLOCKED by CC Safety Net

Reason: ${redact(reason)}`;
  if (input.ruleId) {
    message += `

Rule: ${input.ruleId}`;
  }
  if (toolName) {
    message += `

Tool: ${toolName}`;
  }
  if (command2) {
    const safeCommand = redact(command2);
    message += `

Command: ${excerpt(safeCommand, maxLen)}`;
  }
  if (segment && segment !== command2) {
    const safeSegment = redact(segment);
    message += `

Segment: ${excerpt(safeSegment, maxLen)}`;
  }
  message += `

${getFooter(input)}`;
  return message;
}
function getFooter(input) {
  const intent = input.manualPermissionAdvice === false ? "hard_stop" : input.intent ?? "manual_only";
  switch (intent) {
    case "hard_stop":
      return "Do not retry this operation or attempt any workaround (other tools, flags, or paths). Report the block to the user and continue with the rest of the task.";
    case "use_alternative":
      return "Do not retry the blocked form. Continue the task using the safer alternative described above.";
    case "scope_down":
      return "Retry with a narrower, explicit target as described above. Escalate to the user if the broad operation is truly required.";
    case "manual_only":
      return "If this operation is truly needed, ask the user for explicit permission and have them run the command manually.";
    case "stop_and_explain":
      return "Do not brute-force variants. Simplify or restructure the command so it can be analyzed, or report the block to the user.";
  }
}
function excerpt(text, maxLen) {
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

// src/core/policy-protection.ts
import { homedir as homedir5 } from "node:os";
import { dirname as dirname11, isAbsolute as isAbsolute10, join as join12, normalize as normalize4, resolve as resolve10 } from "node:path";

// src/core/path-canonicalization.ts
import { realpathSync as realpathSync9 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { basename as basename2, dirname as dirname10, join as join11 } from "node:path";
var SUPPORTED_PATH_ENV_NAMES = new Set([
  "CC_SAFETY_NET_HOME",
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "COPILOT_HOME",
  "GEMINI_CLI_HOME",
  "HOME",
  "KIMI_CODE_HOME",
  "KIMI_SHARE_DIR",
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_DIR",
  "PI_CODING_AGENT_DIR",
  "ProgramData",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME"
]);
function expandSupportedPathEnvironmentVariables(value) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::[-?+]|[-?+]|%[^}]*)[^}]*\}/g, (match, name) => getSupportedPathEnvironmentValue(name) ?? match).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => getSupportedPathEnvironmentValue(name) ?? match).replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => getSupportedPathEnvironmentValue(name) ?? match);
}
function resolveExistingPath(path) {
  if (!path)
    return path;
  try {
    return realpathSync9(path);
  } catch {
    const parent = dirname10(path);
    if (parent === path)
      return path;
    return join11(resolveExistingPath(parent), basename2(path));
  }
}
function getSupportedPathEnvironmentValue(name) {
  if (!SUPPORTED_PATH_ENV_NAMES.has(name))
    return null;
  if (name === "HOME")
    return process.env.HOME ?? homedir4();
  return process.env[name] ?? null;
}

// src/core/tool-input.ts
var PATCH_TOOL_NAMES = new Set(["applypatch", "patch"]);
var PATH_TOOL_NAMES = new Set([
  "create",
  "edit",
  "listdir",
  "listpermissions",
  "ls",
  "multiedit",
  "multireplacefilecontent",
  "notebookedit",
  "read",
  "readfile",
  "readurlcontent",
  "replacefilecontent",
  "searchweb",
  "strreplaceeditor",
  "view",
  "viewfile",
  "write",
  "writefile",
  "writetofile"
]);
var GREP_TOOL_NAMES = new Set(["grep", "grepsearch", "rg"]);
var GLOB_TOOL_NAMES = new Set(["findbyname", "glob"]);
var PATCH_TEXT_KEYS = new Set(["command", "diff", "input", "patch", "patchtext"]);
var UTF8_ENCODER = new TextEncoder;
var UTF8_DECODER = new TextDecoder;
function normalizeToolName(toolName) {
  return toolName.replace(/[-_\s]/g, "").toLowerCase();
}
function getNonCommandToolInputKind(toolName) {
  const normalized = normalizeToolName(toolName);
  if (PATCH_TOOL_NAMES.has(normalized))
    return "patch";
  if (GREP_TOOL_NAMES.has(normalized))
    return "grep";
  if (GLOB_TOOL_NAMES.has(normalized))
    return "glob";
  if (PATH_TOOL_NAMES.has(normalized))
    return "path";
  return "unknown";
}
function getCommandFromToolInput(input) {
  if (!input || typeof input !== "object")
    return;
  const command2 = input.command;
  return typeof command2 === "string" && command2 !== "" ? command2 : undefined;
}
function extractPathLikeToolValues(input, pathLikeKeys) {
  if (!input || typeof input !== "object")
    return [];
  if (Array.isArray(input)) {
    return input.flatMap((value) => extractPathLikeToolValues(value, pathLikeKeys));
  }
  return Object.entries(input).flatMap(([key, value]) => {
    if (typeof value === "string" && pathLikeKeys.has(normalizeToolInputKey(key)))
      return [value];
    if (value && typeof value === "object")
      return extractPathLikeToolValues(value, pathLikeKeys);
    return [];
  });
}
function normalizeToolInputKey(key) {
  return key.replace(/-/g, "_").toLowerCase();
}
function extractPatchTargetsFromToolInput(input) {
  return extractPatchTexts(input, true).flatMap(extractPatchTargetsFromText);
}
function extractPatchTexts(input, allowString) {
  if (typeof input === "string")
    return allowString ? [input] : [];
  if (!input || typeof input !== "object")
    return [];
  if (Array.isArray(input)) {
    return input.flatMap((value) => extractPatchTexts(value, allowString));
  }
  return Object.entries(input).flatMap(([key, value]) => {
    if (PATCH_TEXT_KEYS.has(normalizeToolInputKey(key)))
      return extractPatchTexts(value, true);
    if (value && typeof value === "object")
      return extractPatchTexts(value, false);
    return [];
  });
}
function extractPatchTargetsFromText(text) {
  const targets = [];
  const lines = text.split(/\r?\n/);
  let inApplyPatch = false;
  let inHunk = false;
  let oldHunkLinesRemaining = null;
  let newHunkLinesRemaining = null;
  const resetHunk = () => {
    inHunk = false;
    oldHunkLinesRemaining = null;
    newHunkLinesRemaining = null;
  };
  for (let index = 0;index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (line === "*** Begin Patch") {
      inApplyPatch = true;
      resetHunk();
      continue;
    }
    if (line === "*** End Patch") {
      inApplyPatch = false;
      resetHunk();
      continue;
    }
    if (line.startsWith("@@")) {
      const counts = parseUnifiedHunkLineCounts(line);
      inHunk = true;
      oldHunkLinesRemaining = counts?.oldLines ?? null;
      newHunkLinesRemaining = counts?.newLines ?? null;
      if (oldHunkLinesRemaining === 0 && newHunkLinesRemaining === 0)
        resetHunk();
      continue;
    }
    if (inHunk && oldHunkLinesRemaining !== null && newHunkLinesRemaining !== null) {
      const oldLineCount = line.startsWith(" ") || line.startsWith("-") ? 1 : 0;
      const newLineCount = line.startsWith(" ") || line.startsWith("+") ? 1 : 0;
      oldHunkLinesRemaining = Math.max(0, oldHunkLinesRemaining - oldLineCount);
      newHunkLinesRemaining = Math.max(0, newHunkLinesRemaining - newLineCount);
      if (oldHunkLinesRemaining === 0 && newHunkLinesRemaining === 0)
        resetHunk();
      continue;
    }
    if (line.startsWith("*** ")) {
      resetHunk();
      targets.push(...extractPatchTargetsFromMetadataLine(line));
      continue;
    }
    if (inHunk)
      continue;
    if (line.startsWith("diff --git ")) {
      targets.push(...extractPatchTargetsFromMetadataLine(line));
      continue;
    }
    if (line.startsWith("--- ")) {
      const nextLine = lines[index + 1] ?? "";
      if (!nextLine.startsWith("+++ "))
        continue;
      targets.push(...cleanGitTargetPair(decodeGitMetadataTarget(line.slice(4), true), decodeGitMetadataTarget(nextLine.slice(4), true)));
      index++;
      continue;
    }
    if (!inApplyPatch)
      targets.push(...extractPatchTargetsFromMetadataLine(line));
  }
  return targets;
}
function parseUnifiedHunkLineCounts(line) {
  const hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
  if (!hunkHeader)
    return null;
  return {
    oldLines: Number(hunkHeader[1] ?? 1),
    newLines: Number(hunkHeader[2] ?? 1)
  };
}
function extractPatchTargetsFromMetadataLine(line) {
  const applyPatchTarget = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
  if (applyPatchTarget?.[1])
    return cleanPatchTarget(applyPatchTarget[1]);
  const moveTarget = /^\*\*\* Move to: (.+)$/.exec(line);
  if (moveTarget?.[1])
    return cleanPatchTarget(moveTarget[1]);
  if (line.startsWith("diff --git "))
    return extractGitDiffTargets(line.slice(11));
  const oldTarget = /^--- (.+)$/.exec(line);
  if (oldTarget?.[1])
    return cleanUnifiedDiffTarget(oldTarget[1]);
  const newTarget = /^\+\+\+ (.+)$/.exec(line);
  if (newTarget?.[1])
    return cleanUnifiedDiffTarget(newTarget[1]);
  const extendedTarget = /^(?:rename|copy) (?:from|to) (.+)$/.exec(line);
  if (extendedTarget?.[1])
    return cleanExtendedGitTarget(extendedTarget[1]);
  return [];
}
function extractGitDiffTargets(header) {
  const fields = parseGitDiffFields(header);
  if (fields.length === 2 && fields[0] && fields[1]) {
    return cleanGitTargetPair(fields[0], fields[1]);
  }
  const matchingPair = [...header.matchAll(/\s+/g)].map((separator) => [
    header.slice(0, separator.index).trim(),
    header.slice((separator.index ?? 0) + separator[0].length).trim()
  ]).find(([oldTarget, newTarget]) => oldTarget === newTarget || getCommonGitPrefixRemainder(oldTarget, newTarget) !== null);
  return matchingPair?.[0] && matchingPair[1] ? cleanGitTargetPair(matchingPair[0], matchingPair[1]) : [];
}
function parseGitDiffFields(header) {
  const fields = [];
  let index = 0;
  while (index < header.length) {
    while (/\s/.test(header[index] ?? ""))
      index++;
    if (index >= header.length)
      break;
    const quote = header[index] === '"' || header[index] === "'" ? header[index] : undefined;
    if (!quote) {
      const end = header.slice(index).search(/\s/);
      fields.push(end === -1 ? header.slice(index) : header.slice(index, index + end));
      index = end === -1 ? header.length : index + end;
      continue;
    }
    const field = parseQuotedGitDiffField(header, index, quote);
    if (!field)
      return [];
    fields.push(field.value);
    index = field.end;
  }
  return fields;
}
function parseQuotedGitDiffField(header, start, quote) {
  const bytes = [];
  let index = start + 1;
  while (index < header.length) {
    const character = header[index] ?? "";
    if (character === quote) {
      return { value: UTF8_DECODER.decode(Uint8Array.from(bytes)), end: index + 1 };
    }
    if (character !== "\\" || quote === "'") {
      bytes.push(...UTF8_ENCODER.encode(character));
      index++;
      continue;
    }
    const escaped = header.slice(index + 1);
    const octal = /^[0-7]{1,3}/.exec(escaped)?.[0];
    if (octal) {
      bytes.push(Number.parseInt(octal, 8));
      index += octal.length + 1;
      continue;
    }
    bytes.push(...UTF8_ENCODER.encode(decodeGitDiffEscape(escaped[0] ?? "")));
    index += 2;
  }
  return null;
}
function decodeGitDiffEscape(character) {
  return {
    a: "\x07",
    b: "\b",
    f: "\f",
    n: `
`,
    r: "\r",
    t: "\t",
    v: "\v"
  }[character] ?? character;
}
function cleanGitDiffTarget(target) {
  return cleanExactPatchTarget(normalizeGitDiffTarget(target));
}
function cleanGitTargetPair(oldTarget, newTarget) {
  if (oldTarget === "/dev/null")
    return cleanSingleGitTarget(newTarget);
  if (newTarget === "/dev/null")
    return cleanSingleGitTarget(oldTarget);
  if (oldTarget.startsWith("a/") && newTarget.startsWith("b/")) {
    return [oldTarget.slice(2), newTarget.slice(2)].flatMap(cleanExactPatchTarget);
  }
  const commonRemainder = getCommonGitPrefixRemainder(oldTarget, newTarget) ?? (oldTarget === newTarget ? stripFirstGitPathComponent(oldTarget) : null);
  return [oldTarget, newTarget, ...commonRemainder ? [commonRemainder] : []].flatMap(cleanExactPatchTarget);
}
function cleanSingleGitTarget(target) {
  const stripped = stripFirstGitPathComponent(target);
  return [target, ...stripped ? [stripped] : []].flatMap(cleanExactPatchTarget);
}
function stripFirstGitPathComponent(target) {
  const separator = target.indexOf("/");
  return separator > 0 && separator < target.length - 1 ? target.slice(separator + 1) : null;
}
function getCommonGitPrefixRemainder(oldTarget, newTarget) {
  const oldSeparator = oldTarget.indexOf("/");
  const newSeparator = newTarget.indexOf("/");
  if (oldSeparator < 1 || newSeparator < 1)
    return null;
  if (oldTarget.slice(0, oldSeparator) === newTarget.slice(0, newSeparator))
    return null;
  const oldRemainder = oldTarget.slice(oldSeparator + 1);
  return oldRemainder === newTarget.slice(newSeparator + 1) ? oldRemainder : null;
}
function cleanUnifiedDiffTarget(target) {
  return cleanGitDiffTarget(decodeGitMetadataTarget(target, true));
}
function cleanExtendedGitTarget(target) {
  return cleanExactPatchTarget(decodeGitMetadataTarget(target, false));
}
function decodeGitMetadataTarget(target, allowTrailingMetadata) {
  const trimmed = target.trim();
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : undefined;
  if (quote) {
    const field = parseQuotedGitDiffField(trimmed, 0, quote);
    if (field && (allowTrailingMetadata || trimmed.slice(field.end).trim() === "")) {
      return field.value;
    }
  }
  return allowTrailingMetadata ? trimmed.split("\t", 1)[0]?.trim() ?? "" : trimmed;
}
function normalizeGitDiffTarget(target) {
  return target.startsWith("a/") || target.startsWith("b/") ? target.slice(2) : target;
}
function cleanExactPatchTarget(target) {
  return target === "" || target === "/dev/null" ? [] : [target];
}
function cleanPatchTarget(target) {
  const path = target.split("\t", 1)[0]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  return path === "" || path === "/dev/null" ? [] : [path];
}

// src/core/policy-protection.ts
var REASON_POLICY_CONFIG_PROTECTION = "Policy config is protected and you must not modify it.";
var READ_ONLY_TOOLS = new Set([
  "findbyname",
  "glob",
  "grep",
  "grepsearch",
  "listdir",
  "listpermissions",
  "ls",
  "read",
  "readfile",
  "readurlcontent",
  "searchweb",
  "view",
  "viewfile"
]);
var PATH_LIKE_KEYS = new Set([
  "absolutepath",
  "directorypath",
  "directory_path",
  "file",
  "file_path",
  "filepath",
  "notebook_path",
  "path",
  "searchdirectory",
  "search_directory",
  "searchpath",
  "targetfile",
  "target_file"
]);
var READ_ONLY_COMMANDS = new Set([
  "cat",
  "file",
  "grep",
  "head",
  "less",
  "ls",
  "more",
  "rg",
  "sed",
  "stat",
  "tail",
  "wc"
]);
var SHELL_OPERATORS2 = new Set(["&&", "||", "|&", "|", "&", ";"]);
var WRITE_REDIRECTS = new Set([">", ">>", "<>", ">&", "&>", "&>>"]);
var SHELL_SCRIPT_COMMANDS = new Set(["bash", "dash", "ksh", "sh", "zsh"]);
var SCRIPT_ARGUMENT_OPTIONS = new Map([
  ["bash", new Set(["-c"])],
  ["dash", new Set(["-c"])],
  ["ksh", new Set(["-c"])],
  ["sh", new Set(["-c"])],
  ["zsh", new Set(["-c"])],
  ["python", new Set(["-c"])],
  ["python3", new Set(["-c"])],
  ["node", new Set(["-e", "--eval"])],
  ["perl", new Set(["-e"])]
]);
var CLUSTERED_SCRIPT_ARGUMENT_OPTIONS = new Map([
  ["bash", new Set(["c"])],
  ["dash", new Set(["c"])],
  ["ksh", new Set(["c"])],
  ["sh", new Set(["c"])],
  ["zsh", new Set(["c"])],
  ["node", new Set(["e"])],
  ["perl", new Set(["e"])]
]);
var POLICY_ENV_PATH_NAMES = new Set(["CC_SAFETY_NET_HOME"]);
var SHELL_ENV_PROXY = new Proxy({}, {
  get: (_, name) => ["$", "{", String(name), "}"].join("")
});
function findPolicyConfigMutationTargetInToolInput(toolName, input, route, context) {
  for (const configCwd of new Set([context.configCwd, ...context.policyConfigCwds ?? []])) {
    const target = findPolicyConfigMutationTargetForContext(toolName, input, route, {
      configCwd,
      executionCwd: context.executionCwd
    });
    if (target)
      return target;
  }
  return null;
}
function findPolicyConfigMutationTargetForContext(toolName, input, route, context) {
  if (route.kind === "patch") {
    return findPolicyConfigMutationTargetInPaths([
      ...extractPathLikeToolValues(input, PATH_LIKE_KEYS),
      ...extractPatchTargetsFromToolInput(input)
    ], false, context);
  }
  const command2 = getCommandFromToolInput(input);
  if (route.kind === "command") {
    return command2 ? findPolicyConfigMutationTargetInCommand(command2, context) : null;
  }
  if (route.kind === "unknown" && command2) {
    const commandTarget = findPolicyConfigMutationTargetInCommand(command2, context);
    if (commandTarget)
      return commandTarget;
  }
  return findPolicyConfigMutationTargetInPaths(extractPathLikeToolValues(input, PATH_LIKE_KEYS), route.kind === "grep" || route.kind === "glob" || isReadOnlyTool(toolName), context);
}
function findPolicyConfigMutationTargetInPaths(paths, readOnly, context) {
  const target = paths.find((value) => isPolicyConfigPath(value, context.configCwd, context.executionCwd));
  if (!target)
    return null;
  return readOnly ? null : { target };
}
function findPolicyConfigMutationTargetInCommand(command2, context, variables = new Map) {
  if (hasUnclosedQuotes(command2)) {
    return findPolicyConfigTargetInText(command2, context);
  }
  let tokens;
  try {
    tokens = $parse(command2.replace(/\n/g, " ; "), SHELL_ENV_PROXY);
  } catch {
    return findPolicyConfigTargetInText(command2, context);
  }
  let state = { cwd: context.executionCwd, variables };
  let segment = [];
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (isOperator2(token)) {
      const target = findUnsafePolicyConfigSegmentTarget(segment, state, context.configCwd);
      if (target)
        return target;
      state = applyShellState(segment, state);
      segment = [];
      continue;
    }
    if (isRedirectOp(token)) {
      const targetIndex = getWriteRedirectTargetIndex(tokens, i);
      const target = getCommandTokenText(tokens[targetIndex ?? i + 1]);
      if (targetIndex !== null && target && isPolicyConfigPath(expandShellVariables(target, state.variables), context.configCwd, state.cwd)) {
        return { target: formatShellPolicyTarget(target) };
      }
      i = targetIndex ?? i + 1;
      continue;
    }
    const tokenText = getCommandTokenText(token);
    if (tokenText !== null)
      segment.push(tokenText);
  }
  return findUnsafePolicyConfigSegmentTarget(segment, state, context.configCwd);
}
function findUnsafePolicyConfigSegmentTarget(segment, state, configCwd) {
  if (isAssignmentOnlySegment(segment))
    return null;
  const scriptTarget = findScriptArgumentPolicyConfigTarget(segment, state, configCwd);
  if (scriptTarget)
    return scriptTarget;
  const sedWriteTarget = findSedScriptWritePolicyConfigTarget(segment, state, configCwd);
  if (sedWriteTarget)
    return sedWriteTarget;
  const target = segment.flatMap((token) => extractPolicyConfigPathCandidates(token).map((candidate) => expandShellVariables(candidate, state.variables))).find((token) => isPolicyConfigPath(token, configCwd, state.cwd));
  if (!target)
    return null;
  return isReadOnlySegment(segment) ? null : { target };
}
function findScriptArgumentPolicyConfigTarget(segment, state, configCwd) {
  const stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (stripped.length < 3)
    return null;
  const command2 = getBasename(stripped[0] ?? "").toLowerCase();
  if (!SCRIPT_ARGUMENT_OPTIONS.has(command2))
    return null;
  const optionIndex = stripped.findIndex((token) => isScriptArgumentOption(command2, token));
  if (optionIndex === -1)
    return null;
  const script = stripped[optionIndex + 1];
  if (!script)
    return null;
  if (SHELL_SCRIPT_COMMANDS.has(command2)) {
    return findPolicyConfigMutationTargetInCommand(script, { configCwd, executionCwd: state.cwd }, state.variables);
  }
  const target = extractPolicyConfigPathCandidates(script).flatMap((candidate) => [
    candidate,
    expandShellVariables(candidate, state.variables),
    ...extractConstructedPolicyPathCandidates(script)
  ]).find((candidate) => isPolicyConfigPath(candidate, configCwd, state.cwd));
  return target ? { target } : null;
}
function findSedScriptWritePolicyConfigTarget(segment, state, configCwd) {
  const stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (getBasename(stripped[0] ?? "").toLowerCase() !== "sed")
    return null;
  const target = extractSedScriptArguments(stripped.slice(1)).flatMap((script) => extractSedWritePathCandidates(script)).map((candidate) => expandShellVariables(candidate, state.variables)).find((candidate) => isPolicyConfigPath(candidate, configCwd, state.cwd));
  return target ? { target } : null;
}
function applyShellState(segment, state) {
  const variables = isAssignmentOnlySegment(segment) ? new Map([...state.variables, ...extractShellAssignments(segment, state.variables)]) : state.variables;
  return {
    cwd: getSegmentCwd(segment, { cwd: state.cwd, variables }),
    variables
  };
}
function extractShellAssignments(segment, variables) {
  return segment.flatMap((token) => {
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(token);
    return assignment?.[1] !== undefined && assignment[2] !== undefined ? [[assignment[1], expandShellVariables(assignment[2], variables)]] : [];
  });
}
function getSegmentCwd(segment, state) {
  const stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (getBasename(stripped[0] ?? "").toLowerCase() !== "cd")
    return state.cwd;
  const target = stripped[1];
  if (!target || target === "-")
    return state.cwd;
  return normalizeCandidatePath(expandShellVariables(target, state.variables), state.cwd);
}
function extractSedScriptArguments(tokens) {
  const scripts = [];
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined)
      break;
    if (token === "-e" || token === "--expression") {
      const script = tokens[i + 1];
      if (script !== undefined)
        scripts.push(script);
      i++;
      continue;
    }
    const expression = /^--expression=(.*)$/.exec(token);
    if (expression?.[1]) {
      scripts.push(expression[1]);
      continue;
    }
    if (token === "-f" || token === "--file") {
      i++;
      continue;
    }
    if (token.startsWith("-f") || token.startsWith("--file="))
      continue;
    if (token.startsWith("-"))
      continue;
    scripts.push(token);
    break;
  }
  return scripts;
}
function extractSedWritePathCandidates(script) {
  return Array.from(script.matchAll(/(?:^|[;\n])\s*(?:(?:\d+|\$|\/(?:\\.|[^/\\])*\/)(?:\s*,\s*(?:\d+|\$|\/(?:\\.|[^/\\])*\/))?\s*)?!?\s*w\s+([^;\n]+)/g)).flatMap((match) => extractPolicyConfigPathCandidates(match[1] ?? ""));
}
function isReadOnlySegment(tokens) {
  const stripped = stripEnvAssignments(stripWrappers([...tokens]));
  if (stripped.length === 0)
    return false;
  const command2 = getBasename(stripped[0] ?? "").toLowerCase();
  if (!READ_ONLY_COMMANDS.has(command2))
    return false;
  if (command2 !== "sed")
    return true;
  return !stripped.slice(1).some((token) => token.startsWith("-i") || token === "--in-place" || token.startsWith("--in-place="));
}
function stripEnvAssignments(tokens) {
  const firstCommandIndex = tokens.findIndex((token) => !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
  return firstCommandIndex === -1 ? [] : [...tokens.slice(firstCommandIndex)];
}
function isAssignmentOnlySegment(tokens) {
  return tokens.length > 0 && tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
}
function isScriptArgumentOption(command2, token) {
  if (SCRIPT_ARGUMENT_OPTIONS.get(command2)?.has(token))
    return true;
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2)
    return false;
  return CLUSTERED_SCRIPT_ARGUMENT_OPTIONS.get(command2)?.has(token[token.length - 1] ?? "") ?? false;
}
function isReadOnlyTool(toolName) {
  return READ_ONLY_TOOLS.has(normalizeToolName(toolName));
}
function isPolicyConfigPath(target, configCwd, executionCwd) {
  const normalized = normalizeCandidatePath(target, executionCwd).toLowerCase();
  return getPolicyConfigProtectedPaths(configCwd).some((path) => normalized === normalizeCandidatePath(path, configCwd).toLowerCase());
}
function getPolicyConfigProtectedPaths(cwd) {
  const paths = getPolicyPaths({ cwd });
  return [
    getUserPolicyPath(),
    ...getScopePolicyConfigProtectedPaths(paths.userConfigPath, paths.userLockPath),
    ...getScopePolicyConfigProtectedPaths(paths.projectConfigPath, paths.projectLockPath)
  ];
}
function getScopePolicyConfigProtectedPaths(configPath, lockPath) {
  const configDir = dirname11(configPath);
  const loaded = readRulesConfig(configPath);
  if (!loaded.config)
    return [dirname11(configDir), configDir, configPath, lockPath];
  const configuredSources = new Set(loaded.config.rules);
  return [
    dirname11(configDir),
    configDir,
    configPath,
    lockPath,
    ...loaded.config.rules.filter((source) => !isGitHubRulebookSource(source)).flatMap((source) => [join12(configDir, source), join12(configDir, source, RULEBOOK_FILE)]),
    ...(readLockfile(lockPath).lock?.rulebooks ?? []).filter((entry) => configuredSources.has(entry.spec)).flatMap((entry) => {
      const cachePath = getRulebookCachePath(entry, { cacheConfigDir: configDir });
      return [dirname11(cachePath), cachePath];
    })
  ];
}
function findPolicyConfigTargetInText(text, context) {
  const target = extractPolicyConfigPathCandidates(text).find((candidate) => isPolicyConfigPath(candidate, context.configCwd, context.executionCwd));
  return target ? { target } : null;
}
function formatShellPolicyTarget(target) {
  return target.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "$$$1");
}
function extractPolicyConfigPathCandidates(text) {
  return text.split(/[^A-Za-z0-9_./\\~:$-]+/).flatMap((part) => part.split("=")).filter((part) => part.length > 0);
}
function extractConstructedPolicyPathCandidates(text) {
  const envNames = Array.from(text.matchAll(/(?:process\.env\.|os\.environ\[['"])([A-Za-z_][A-Za-z0-9_]*)/g)).map((match) => match[1]).filter((name) => name !== undefined && POLICY_ENV_PATH_NAMES.has(name));
  if (envNames.length === 0)
    return [];
  const suffixes = Array.from(text.matchAll(/['"](\/[^'"]+)['"]/g)).map((match) => match[1]).filter((suffix) => suffix !== undefined);
  return envNames.flatMap((name) => suffixes.map((suffix) => `$${name}${suffix}`));
}
function expandShellVariables(text, variables) {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-+])([^}]*)\}/g, (match, name, operator, word) => {
    const value = variables.get(name);
    if (value === undefined)
      return match;
    const isUsable = operator.startsWith(":") ? value !== "" : true;
    if (operator.endsWith("-"))
      return isUsable ? value : expandShellVariables(word, variables);
    return isUsable ? expandShellVariables(word, variables) : "";
  }).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => variables.get(name) ?? match).replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => variables.get(name) ?? match);
}
function normalizeCandidatePath(target, cwd) {
  const unix = expandSupportedPathEnvironmentVariables(target.trim()).replace(/\\/g, "/");
  if (!unix)
    return "";
  const expanded = unix === "~" ? homedir5() : unix.startsWith("~/") ? resolve10(homedir5(), unix.slice(2)) : unix;
  return resolveExistingPath(normalize4(isAbsolute10(expanded) ? expanded : resolve10(cwd, expanded))).replace(/\\/g, "/");
}
function isOperator2(token) {
  const op = getParseOp(token);
  return op !== null && SHELL_OPERATORS2.has(op);
}
function isRedirectOp(token) {
  const op = getParseOp(token);
  return op !== null && /^(?:<|>|>>|<>|<&|>&|&>|&>>)$/.test(op);
}
function getWriteRedirectTargetIndex(tokens, index) {
  const op = getParseOp(tokens[index]);
  if (op === ">" && getParseOp(tokens[index + 1]) === "|")
    return index + 2;
  return op !== null && WRITE_REDIRECTS.has(op) ? index + 1 : null;
}
function getParseOp(token) {
  return typeof token === "object" && token !== null && "op" in token ? token.op : null;
}

// src/core/secret-protection.ts
import { homedir as homedir6 } from "node:os";
import { isAbsolute as isAbsolute11, resolve as resolve11 } from "node:path";
import { fileURLToPath } from "node:url";
var REASON_SECRET_PROTECTION = "Access to a sensitive path is not allowed.";
var NON_PATH_OPERAND_COMMANDS = new Set(["echo", "printf"]);
var PATH_ROOT_COMMANDS = new Set(["find"]);
var FIND_EXEC_PRIMARIES = new Set(["-exec", "-execdir"]);
var FIND_EXEC_TERMINATORS = new Set([";", "+"]);
var FIND_MATCH_PATH_PRIMARIES = new Set([
  "-name",
  "-iname",
  "-path",
  "-ipath",
  "-wholename",
  "-iwholename",
  "-samefile"
]);
var CODE_INTERPRETERS = new Set([
  "python",
  "python2",
  "python3",
  "node",
  "deno",
  "bun",
  "ruby",
  "perl",
  "php",
  "rscript",
  "osascript",
  "bash",
  "sh",
  "zsh",
  "dash",
  "ksh"
]);
var CODE_EVAL_FLAGS = new Set(["-c", "-e", "-r", "-E", "--eval", "--exec"]);
var CLUSTERED_CODE_EVAL_FLAGS = new Map([
  ["bash", new Set(["c"])],
  ["sh", new Set(["c"])],
  ["zsh", new Set(["c"])],
  ["dash", new Set(["c"])],
  ["ksh", new Set(["c"])],
  ["python", new Set(["c"])],
  ["python2", new Set(["c"])],
  ["python3", new Set(["c"])],
  ["node", new Set(["e"])],
  ["deno", new Set(["e"])],
  ["bun", new Set(["e"])],
  ["ruby", new Set(["e"])],
  ["perl", new Set(["e", "E"])],
  ["php", new Set(["r"])],
  ["rscript", new Set(["e"])],
  ["osascript", new Set(["e"])]
]);
var PATTERN_FIRST_COMMANDS = new Set(["grep", "rg"]);
var PATTERN_FILE_SHORT = "f";
var PATTERN_FILE_LONG = "file";
var PATTERNLESS_FILES_LONG = "files";
var PATTERN_SUPPLY_SHORT = new Set(["e", "f"]);
var PATTERN_SUPPLY_LONG = new Set(["regexp", "file"]);
var PATTERN_ARG_SHORT = new Set(["e", "f", "A", "B", "C", "m"]);
var PATTERN_ARG_LONG = new Set([
  "regexp",
  "file",
  "after-context",
  "before-context",
  "context",
  "max-count"
]);
var PATH_TARGET_KEYS = new Set([
  "absolutepath",
  "directorypath",
  "directory_path",
  "file",
  "file_path",
  "filepath",
  "notebook_path",
  "path",
  "searchdirectory",
  "search_directory",
  "searchpath",
  "targetfile",
  "target_file"
]);
var GREP_TARGET_KEYS = new Set([...PATH_TARGET_KEYS, "glob"]);
var GLOB_TARGET_KEYS = new Set([...PATH_TARGET_KEYS, "glob", "pattern"]);
var SHELL_OPERATORS3 = new Set(["&&", "||", "|&", "|", "&", ";"]);
var PIPE_OPERATORS = new Set(["|", "|&"]);
var PIPE_INPUT_PATH_MARKER = "__CC_SAFETY_NET_PIPE_INPUT__";
var SHELL_STDIN_INTERPRETERS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
var PROGRAM_SELECTING_INTERPRETER_FLAGS = new Map([["python", new Set(["-m"])]]);
var VALUE_CONSUMING_INTERPRETER_FLAGS = new Map([
  ["bash", new Set(["-O"])],
  ["sh", new Set(["-O"])],
  ["zsh", new Set(["-o"])],
  ["dash", new Set(["-o"])],
  ["ksh", new Set(["-o"])],
  ["python", new Set(["-W", "-X"])],
  ["node", new Set(["-r", "--require", "--loader", "--import", "--input-type"])]
]);
function findSensitivePathTarget(targets, cwd = process.cwd(), config, configCwd = cwd) {
  for (const target of targets) {
    if (isDeniedByPolicy(target, cwd, config, configCwd)) {
      return { target, ruleId: "secret.deny-path" };
    }
    const ruleId = isSensitivePath(target, cwd, config);
    if (ruleId) {
      return { target, ruleId };
    }
  }
  return null;
}
function findSensitiveTargetInToolInput(input, route, executionCwd = process.cwd(), config, configCwd = executionCwd) {
  return findSensitivePathTarget(extractToolPathTargets(input, route), executionCwd, config, configCwd);
}
function extractToolPathTargets(input, route) {
  if (route.kind === "command") {
    const command3 = getCommandFromToolInput(input);
    return command3 ? extractCommandPathTargets(command3) : [];
  }
  if (route.kind === "grep")
    return extractPathLikeToolValues(input, GREP_TARGET_KEYS);
  if (route.kind === "glob")
    return extractPathLikeToolValues(input, GLOB_TARGET_KEYS);
  if (route.kind === "patch") {
    return [
      ...extractPathLikeToolValues(input, PATH_TARGET_KEYS),
      ...extractPatchTargetsFromToolInput(input)
    ];
  }
  if (route.kind === "path")
    return extractPathLikeToolValues(input, PATH_TARGET_KEYS);
  const command2 = getCommandFromToolInput(input);
  return [
    ...command2 ? extractCommandPathTargets(command2) : [],
    ...extractPathLikeToolValues(input, PATH_TARGET_KEYS)
  ];
}
function extractCommandPathTargets(command2) {
  if (hasUnclosedQuotes(command2)) {
    return [];
  }
  const expandedCommand = expandSupportedPathEnvironmentVariables(command2);
  const targets = extractCommandSubstitutionPathTargets(expandedCommand);
  const tokens = $parse(expandedCommand.replace(/\n/g, " ; "), ENV_PROXY);
  let segment = [];
  let pipeProducer = null;
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (isOperator3(token)) {
      if (segment.length > 0) {
        targets.push(...extractSegmentPathTargets(segment));
        if (pipeProducer !== null) {
          targets.push(...extractPipeCarrierPathTargets(pipeProducer, segment));
        }
        pipeProducer = isPipeOperator(token) ? segment : null;
        segment = [];
      } else {
        pipeProducer = null;
      }
      continue;
    }
    if (isRedirectOp2(token)) {
      const target = getCommandTokenText(tokens[i + 1]);
      if (target)
        targets.push(target);
      i++;
      continue;
    }
    const tokenText = getCommandTokenText(token);
    if (tokenText !== null) {
      segment.push(tokenText);
    }
  }
  if (segment.length > 0) {
    targets.push(...extractSegmentPathTargets(segment));
    if (pipeProducer !== null) {
      targets.push(...extractPipeCarrierPathTargets(pipeProducer, segment));
    }
  }
  return targets;
}
function extractSegmentPathTargets(tokens) {
  const assignmentValues = extractLeadingAssignmentValues(tokens);
  const stripped = stripLeadingWrappersAndEnvAssignments(tokens);
  const commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1) {
    return assignmentValues;
  }
  const command2 = basename3(stripped[commandIndex] ?? "").toLowerCase();
  const post = stripped.slice(commandIndex + 1);
  if (NON_PATH_OPERAND_COMMANDS.has(command2)) {
    return assignmentValues;
  }
  if (PATTERN_FIRST_COMMANDS.has(command2)) {
    return [...assignmentValues, ...extractPatternCommandTargets(post)];
  }
  if (PATH_ROOT_COMMANDS.has(command2)) {
    return [...assignmentValues, ...extractFindCommandTargets(post)];
  }
  if (AWK_INTERPRETERS.has(command2)) {
    return [...assignmentValues, ...extractAwkPathTargets(post)];
  }
  if (isCodeInterpreter(command2)) {
    return [...assignmentValues, ...extractInterpreterPathTargets(command2, post)];
  }
  return [
    ...assignmentValues,
    ...post.flatMap((token) => extractOperandPathCandidates(command2, token))
  ];
}
function extractPipeCarrierPathTargets(producer, consumer) {
  if (xargsReadsPipeInputAsPath(consumer)) {
    return extractDisplayCommandOperands(producer);
  }
  const stdinInterpreter = getStdinScriptInterpreter(consumer);
  if (stdinInterpreter === null) {
    return [];
  }
  return extractDisplayCommandBodies(producer).flatMap((body) => SHELL_STDIN_INTERPRETERS.has(stdinInterpreter) ? extractCommandPathTargets(body) : extractPathLiteralsFromCode(body));
}
function extractDisplayCommandOperands(tokens) {
  const stripped = stripLeadingWrappersAndEnvAssignments(tokens);
  const commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1) {
    return [];
  }
  const command2 = basename3(stripped[commandIndex] ?? "").toLowerCase();
  if (!NON_PATH_OPERAND_COMMANDS.has(command2)) {
    return [];
  }
  return stripped.slice(commandIndex + 1);
}
function extractDisplayCommandBodies(tokens) {
  const stripped = stripLeadingWrappersAndEnvAssignments(tokens);
  const commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1) {
    return [];
  }
  const command2 = basename3(stripped[commandIndex] ?? "").toLowerCase();
  const args = stripped.slice(commandIndex + 1);
  if (command2 === "echo") {
    return [stripEchoDisplayOptions(args).join(" ")];
  }
  if (command2 === "printf") {
    return extractPrintfDisplayBodies(args);
  }
  return [];
}
function stripEchoDisplayOptions(tokens) {
  const optionEnd = tokens.findIndex((token) => !/^-[neE]+$/.test(token));
  return optionEnd === -1 ? [] : tokens.slice(optionEnd);
}
function extractPrintfDisplayBodies(tokens) {
  const format = tokens[0];
  if (format === undefined) {
    return [];
  }
  const valuesPerFormat = getPrintfStringConversionCount(format);
  if (valuesPerFormat === 0 || tokens.length === 1) {
    return [decodePrintfEscapes(format)];
  }
  const values = tokens.slice(1);
  return Array.from({ length: Math.ceil(values.length / valuesPerFormat) }, (_, index) => applyPrintfStringArguments(format, values.slice(index * valuesPerFormat, (index + 1) * valuesPerFormat)));
}
function getPrintfStringConversionCount(format) {
  return (format.match(/%%|%[bqs]/g) ?? []).filter((specifier) => specifier !== "%%").length;
}
function applyPrintfStringArguments(format, values) {
  let valueIndex = 0;
  return decodePrintfEscapes(format.replace(/%%|%[bqs]/g, (specifier) => {
    if (specifier === "%%") {
      return "%";
    }
    const value = values[valueIndex] ?? "";
    valueIndex++;
    return value;
  }));
}
function decodePrintfEscapes(value) {
  return value.replace(/\\n/g, `
`).replace(/\\t/g, "\t").replace(/\\r/g, "\r");
}
function xargsReadsPipeInputAsPath(tokens) {
  const stripped = stripLeadingWrappersAndEnvAssignments(tokens);
  const commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1 || basename3(stripped[commandIndex] ?? "").toLowerCase() !== "xargs") {
    return false;
  }
  const xargs = extractXargsChildCommandWithInfo(stripped.slice(commandIndex));
  if (xargs.childTokens.length === 0) {
    return false;
  }
  if (xargs.replacementToken === "") {
    return false;
  }
  const replacementToken = xargs.replacementToken;
  const childTokens = replacementToken === null ? [...xargs.childTokens, PIPE_INPUT_PATH_MARKER] : xargs.childTokens.map((token) => token.split(replacementToken).join(PIPE_INPUT_PATH_MARKER));
  return extractSegmentPathTargets(childTokens).some((target) => target.includes(PIPE_INPUT_PATH_MARKER));
}
function getStdinScriptInterpreter(tokens) {
  const stripped = stripLeadingWrappersAndEnvAssignments(tokens);
  const commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1) {
    return null;
  }
  const command2 = basename3(stripped[commandIndex] ?? "").toLowerCase();
  if (!isCodeInterpreter(command2)) {
    return null;
  }
  return interpreterReadsStdinScript(command2, stripped.slice(commandIndex + 1)) ? command2 : null;
}
function interpreterReadsStdinScript(command2, tokens) {
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined)
      break;
    if (CODE_EVAL_FLAGS.has(token) || isClusteredCodeEvalFlag(command2, token) || /^--(?:eval|exec)=/.test(token)) {
      return false;
    }
    if (token === "-") {
      return true;
    }
    if (token.startsWith("-")) {
      if (interpreterFlagSelectsProgram(command2, token)) {
        return false;
      }
      if (interpreterFlagConsumesValue(command2, token)) {
        i++;
      }
      continue;
    }
    return false;
  }
  return true;
}
function interpreterFlagSelectsProgram(command2, token) {
  return PROGRAM_SELECTING_INTERPRETER_FLAGS.get(normalizeInterpreterName(command2))?.has(token) ?? false;
}
function interpreterFlagConsumesValue(command2, token) {
  return VALUE_CONSUMING_INTERPRETER_FLAGS.get(normalizeInterpreterName(command2))?.has(token) ?? false;
}
function normalizeInterpreterName(command2) {
  return /^python\d/.test(command2) ? "python" : command2;
}
function extractLeadingAssignmentValues(tokens) {
  const values = [];
  for (const token of tokens) {
    if (isWrapperToken(token)) {
      continue;
    }
    const assignment = /^[A-Za-z_][A-Za-z0-9_]*=(.*)$/.exec(token);
    if (assignment === null) {
      break;
    }
    if (assignment[1] !== undefined && assignment[1] !== "") {
      values.push(assignment[1]);
    }
  }
  return values;
}
function extractOperandPathCandidates(command2, token) {
  if (token === "--") {
    return [];
  }
  const candidates = [];
  const equals = token.indexOf("=");
  if (equals > 0 && equals < token.length - 1) {
    candidates.push(token.slice(equals + 1));
  }
  if (isFileOperand(command2, token)) {
    candidates.push(token);
  }
  return candidates;
}
function extractPathRootTargets(tokens) {
  const roots = [];
  for (const token of tokens) {
    if (token.startsWith("-") || token === "(" || token === "!" || token === ";") {
      break;
    }
    roots.push(token);
  }
  return roots;
}
function extractFindCommandTargets(tokens) {
  const targets = extractPathRootTargets(tokens);
  for (let i = 0;i < tokens.length; i++) {
    if (!FIND_EXEC_PRIMARIES.has(tokens[i] ?? ""))
      continue;
    const execCommand = getFindExecCommand2(tokens, i);
    targets.push(...extractSegmentPathTargets(execCommand).filter((target) => target !== "{}"));
    if (findExecConsumesPlaceholder(execCommand)) {
      targets.push(...extractFindMatchedPathTargets(tokens.slice(0, i)));
    }
  }
  return targets;
}
function getFindExecCommand2(tokens, execIndex) {
  const execTokens = tokens.slice(execIndex + 1);
  const terminatorIndex = execTokens.findIndex((token) => FIND_EXEC_TERMINATORS.has(token));
  return terminatorIndex === -1 ? execTokens : execTokens.slice(0, terminatorIndex);
}
function findExecConsumesPlaceholder(tokens) {
  return extractSegmentPathTargets(tokens).includes("{}");
}
function extractFindMatchedPathTargets(tokens) {
  return tokens.flatMap((token, index) => {
    if (!FIND_MATCH_PATH_PRIMARIES.has(token))
      return [];
    const value = tokens[index + 1];
    return value === undefined ? [] : [value, normalizeFindPathPattern(value)];
  });
}
function normalizeFindPathPattern(pattern) {
  return pattern.replace(/^\*+\//, "").replace(/\/\*+$/g, "").replace(/^\*+/, "").replace(/\*+$/g, "");
}
function isCodeInterpreter(command2) {
  return CODE_INTERPRETERS.has(command2) || /^python\d/.test(command2);
}
function extractInterpreterPathTargets(command2, tokens) {
  const candidates = [];
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined)
      break;
    if (CODE_EVAL_FLAGS.has(token) || isClusteredCodeEvalFlag(command2, token)) {
      const code = tokens[i + 1];
      if (code !== undefined) {
        candidates.push(...extractPathLiteralsFromCode(code));
        i++;
      }
      continue;
    }
    const inlineEval = /^--(?:eval|exec)=(.*)$/.exec(token);
    if (inlineEval !== null && inlineEval[1] !== undefined) {
      candidates.push(...extractPathLiteralsFromCode(inlineEval[1]));
      continue;
    }
    if (!token.startsWith("-")) {
      candidates.push(token);
    }
  }
  return candidates;
}
function isClusteredCodeEvalFlag(command2, token) {
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2)
    return false;
  const evalFlags = /^python\d/.test(command2) ? CLUSTERED_CODE_EVAL_FLAGS.get("python") : CLUSTERED_CODE_EVAL_FLAGS.get(command2);
  return evalFlags?.has(token[token.length - 1] ?? "") ?? false;
}
function extractAwkPathTargets(tokens) {
  return [
    ...tokens.flatMap((token) => extractOperandPathCandidates("awk", token)),
    ...tokens.flatMap(extractAwkSystemCommandTargets),
    ...tokens.flatMap(extractAwkGetlineRedirectTargets)
  ];
}
function extractAwkSystemCommandTargets(code) {
  if (!code.includes("system"))
    return [];
  return extractAwkSystemCommands(code)?.commands.flatMap(extractCommandPathTargets) ?? [];
}
function extractAwkGetlineRedirectTargets(code) {
  return Array.from(code.matchAll(/\bgetline(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*<\s*"((?:\\.|[^"\\])*)"/g)).map((match) => match[1]).filter((value) => value !== undefined && value !== "");
}
function extractPathLiteralsFromCode(code) {
  const quoted = Array.from(code.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)).map((match) => match[2]).filter((value) => value !== undefined && value !== "");
  const bare = code.match(/[\w./~@+-]*[./~][\w./~@+-]*/g) ?? [];
  return [...quoted, ...quoted.flatMap(decodeBase64PathCandidate), ...bare];
}
function extractCommandSubstitutionPathTargets(command2) {
  return extractCommandSubstitutionBodies(command2).flatMap((body) => [
    ...extractCommandPathTargets(body),
    ...commandSubstitutionDecodesBase64(body) ? extractBase64DecodedPathCandidates($parse(body.replace(/\n/g, " ; "), ENV_PROXY)) : []
  ]);
}
function commandSubstitutionDecodesBase64(command2) {
  const tokens = $parse(command2.replace(/\n/g, " ; "), ENV_PROXY);
  for (let i = 0;i < tokens.length; i++) {
    const token = getCommandTokenText(tokens[i]);
    if (token === null || basename3(token).toLowerCase() !== "base64") {
      continue;
    }
    for (let j = i + 1;j < tokens.length; j++) {
      if (isOperator3(tokens[j]))
        break;
      const flag = getCommandTokenText(tokens[j]);
      if (flag && isBase64DecodeFlag(flag))
        return true;
    }
  }
  return false;
}
function extractBase64DecodedPathCandidates(tokens) {
  return tokens.flatMap((token) => {
    const tokenText = getCommandTokenText(token);
    return tokenText === null ? [] : [tokenText];
  }).flatMap(decodeBase64PathCandidate);
}
function decodeBase64PathCandidate(token) {
  const normalized = normalizeBase64Token(token);
  if (normalized === null)
    return [];
  const decoded = Buffer.from(normalized, "base64").toString("utf8");
  if (decoded === "" || hasControlCharacter(decoded))
    return [];
  const canonical = Buffer.from(decoded, "utf8").toString("base64").replace(/=+$/g, "");
  return canonical === normalized.replace(/=+$/g, "") ? [decoded] : [];
}
function hasControlCharacter(value) {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
function normalizeBase64Token(token) {
  if (token.length < 8 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(token))
    return null;
  if (/=/.test(token.replace(/=+$/g, "")))
    return null;
  const unpadded = token.replace(/=+$/g, "");
  if (unpadded.length % 4 === 1)
    return null;
  return `${unpadded.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - unpadded.length % 4) % 4)}`;
}
function isBase64DecodeFlag(flag) {
  return flag === "--decode" || !flag.startsWith("--") && flag.startsWith("-") && /[dD]/.test(flag);
}
function extractCommandSubstitutionBodies(command2) {
  const bodies = [];
  const quoteState = { inSingle: false, inDouble: false, escaped: false };
  for (let i = 0;i < command2.length; i++) {
    const char = command2[i];
    if (!char)
      break;
    if (advanceQuoteScanState(char, quoteState))
      continue;
    if (startsCommandSubstitution(command2, i, quoteState)) {
      const substitution = readCommandSubstitutionBody(command2, i + 1);
      if (substitution !== null) {
        bodies.push(substitution.body);
        i = substitution.endIndex;
      }
      continue;
    }
    if (!quoteState.inSingle && char === "`") {
      const substitution = readBacktickCommandSubstitutionBody(command2, i);
      if (substitution !== null) {
        bodies.push(substitution.body);
        i = substitution.endIndex;
      }
    }
  }
  return bodies;
}
function readCommandSubstitutionBody(command2, startIndex) {
  const quoteState = { inSingle: false, inDouble: false, escaped: false };
  let depth = 1;
  for (let i = startIndex + 1;i < command2.length; i++) {
    const char = command2[i];
    if (!char)
      break;
    if (advanceQuoteScanState(char, quoteState))
      continue;
    if (startsCommandSubstitution(command2, i, quoteState)) {
      depth++;
      i++;
      continue;
    }
    if (!quoteState.inSingle && !quoteState.inDouble && char === ")") {
      depth--;
      if (depth === 0) {
        return { body: command2.slice(startIndex + 1, i), endIndex: i };
      }
    }
  }
  return null;
}
function readBacktickCommandSubstitutionBody(command2, startIndex) {
  let escaped = false;
  for (let i = startIndex + 1;i < command2.length; i++) {
    const char = command2[i];
    if (!char)
      break;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "`") {
      return { body: command2.slice(startIndex + 1, i), endIndex: i };
    }
  }
  return null;
}
function startsCommandSubstitution(command2, index, state) {
  return !state.inSingle && command2[index] === "$" && command2[index + 1] === "(" && command2[index + 2] !== "(";
}
function extractPatternCommandTargets(tokens) {
  const optionFileTargets = [];
  const positionals = [];
  let patternFromOption = false;
  let patternlessMode = false;
  let afterDashDash = false;
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined)
      break;
    if (!afterDashDash && token === "--") {
      afterDashDash = true;
      continue;
    }
    if (afterDashDash) {
      positionals.push(token);
      continue;
    }
    const longOption = /^--([^=]+)(?:=(.*))?$/.exec(token);
    if (longOption !== null) {
      const name = longOption[1] ?? "";
      const inlineValue = longOption[2];
      if (name === PATTERNLESS_FILES_LONG)
        patternlessMode = true;
      if (PATTERN_SUPPLY_LONG.has(name))
        patternFromOption = true;
      if (inlineValue !== undefined) {
        if (name === PATTERN_FILE_LONG)
          optionFileTargets.push(inlineValue);
        continue;
      }
      if (PATTERN_ARG_LONG.has(name)) {
        const next = tokens[i + 1];
        if (name === PATTERN_FILE_LONG && next !== undefined)
          optionFileTargets.push(next);
        i++;
      }
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const flags = token.slice(1);
      let consumerChar = "";
      let consumerInline = "";
      for (let j = 0;j < flags.length; j++) {
        const flag = flags[j] ?? "";
        if (PATTERN_SUPPLY_SHORT.has(flag))
          patternFromOption = true;
        if (PATTERN_ARG_SHORT.has(flag)) {
          consumerChar = flag;
          consumerInline = flags.slice(j + 1);
          break;
        }
      }
      if (consumerChar !== "") {
        if (consumerInline.length > 0) {
          if (consumerChar === PATTERN_FILE_SHORT)
            optionFileTargets.push(consumerInline);
        } else {
          const next = tokens[i + 1];
          if (consumerChar === PATTERN_FILE_SHORT && next !== undefined) {
            optionFileTargets.push(next);
          }
          i++;
        }
      }
      continue;
    }
    positionals.push(token);
  }
  const dropFirstPositional = !patternFromOption && !patternlessMode;
  const positionalFiles = dropFirstPositional ? positionals.slice(1) : positionals;
  return [...optionFileTargets, ...positionalFiles];
}
function stripLeadingWrappersAndEnvAssignments(tokens) {
  const firstCommandIndex = tokens.findIndex((token) => !isWrapperToken(token) && !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
  return firstCommandIndex === -1 ? [] : [...tokens.slice(firstCommandIndex)];
}
function isWrapperToken(token) {
  return token === "env" || token === "command" || token === "builtin" || token === "sudo";
}
function isFileOperand(command2, token) {
  if (token === "--") {
    return false;
  }
  if (command2 === "tar") {
    return !token.startsWith("-") && !/\.(?:tar|tgz|tar\.gz|zip)$/i.test(token);
  }
  if (command2 === "zip") {
    return !token.startsWith("-") && !/\.zip$/i.test(token);
  }
  return !token.startsWith("-");
}
var PUBLIC_KEY_BASENAMES = new Set(["id_rsa.pub", "id_ed25519.pub", "id_ecdsa.pub"]);
var ENV_PREFIX = ".env.";
var ENV_EXEMPTION_BASENAMES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.defaults"
]);
var ENV_EXEMPTION_PREFIXES = [".env.example.", ".env.sample."];
var SKIPPABLE_PATH_SEGMENTS = new Set(["node_modules", ".git", "__pycache__"]);
var SKIPPABLE_PATH_SEGMENT_PAIRS = [
  ["vendor", "bundle"],
  ["vendor", "cache"]
];
function isSensitivePath(target, cwd, config) {
  const normalized = normalizeCandidatePath2(target, cwd);
  if (!normalized) {
    return null;
  }
  const comparableName = comparable(normalized.split("/").pop() ?? "");
  const comparablePath = comparable(normalized);
  if (isAllowedSensitiveTemplate(comparableName))
    return null;
  for (const rule of SECRET_HOME_PATH_RULES) {
    if (matchesHomePathSuffix(comparablePath, rule.suffixParts.join("/")) && isSecretRuleEnabled(rule.id, config)) {
      return rule.id;
    }
  }
  const codingCliRuleId = matchesCodingCliPath(normalized, cwd, config);
  if (codingCliRuleId)
    return codingCliRuleId;
  for (const rule of SECRET_DIRECTORY_RULES) {
    if (isSensitiveDirSegment(comparablePath, rule.basename) && isSecretRuleEnabled(rule.id, config)) {
      return rule.id;
    }
  }
  if (PUBLIC_KEY_BASENAMES.has(comparableName))
    return null;
  for (const rule of SECRET_BASENAME_RULES) {
    if (comparableName === rule.basename && isSecretRuleEnabled(rule.id, config))
      return rule.id;
  }
  if (comparableName.startsWith(ENV_PREFIX) && isSecretRuleEnabled(SECRET_ENV_VARIANT_RULE.id, config)) {
    return SECRET_ENV_VARIANT_RULE.id;
  }
  for (const rule of SECRET_VARIANT_SEPARATOR_RULES) {
    if (comparableName.length > rule.prefix.length && comparableName.startsWith(rule.prefix)) {
      const next = comparableName.slice(rule.prefix.length)[0];
      if ((next === "-" || next === "_") && isSecretRuleEnabled(rule.id, config))
        return rule.id;
    }
  }
  for (const rule of SECRET_VARIANT_DOT_SUFFIX_RULES) {
    if (comparableName.length > rule.prefix.length && comparableName.startsWith(rule.prefix)) {
      if (comparableName.slice(rule.prefix.length) === rule.suffix && isSecretRuleEnabled(rule.id, config)) {
        return rule.id;
      }
    }
  }
  if (isSkippablePathForBroadSignatures(comparablePath))
    return null;
  if (hasBroadSshKeyBasename(comparableName) && isSecretRuleEnabled(SECRET_BROAD_SSH_KEY_BASENAME_RULE.id, config)) {
    return SECRET_BROAD_SSH_KEY_BASENAME_RULE.id;
  }
  const extensionRuleId = hasSensitiveExtension(comparableName, config);
  if (extensionRuleId)
    return extensionRuleId;
  return null;
}
function matchesHomePathSuffix(comparablePath, suffix) {
  return comparablePath === `~/${suffix}` || comparablePath.startsWith(`~/${suffix}/`);
}
function matchesCodingCliPath(normalized, cwd, config) {
  return SECRET_CODING_CLI_RULES.find((rule) => {
    if (!isSecretRuleEnabled(rule.id, config))
      return false;
    if (rule.id === "secret.cli.claude-code")
      return matchesClaudeCodePath(normalized, cwd);
    if (rule.id === "secret.cli.antigravity")
      return matchesAntigravityPath(normalized, cwd);
    if (rule.id === "secret.cli.codex")
      return matchesCodexPath(normalized, cwd);
    if (rule.id === "secret.cli.gemini")
      return matchesGeminiPath(normalized, cwd);
    if (rule.id === "secret.cli.copilot-cli")
      return matchesCopilotCliPath(normalized, cwd);
    if (rule.id === "secret.cli.kimi-code")
      return matchesKimiCodePath(normalized, cwd);
    if (rule.id === "secret.cli.opencode")
      return matchesOpenCodePath(normalized, cwd);
    if (rule.id === "secret.cli.pi")
      return matchesPiPath(normalized, cwd);
    return false;
  })?.id ?? null;
}
function matchesClaudeCodePath(normalized, cwd) {
  return matchesFileInRoot(normalized, codingCliRoot(process.env.CLAUDE_CONFIG_DIR, "~/.claude", cwd), [
    "settings.json",
    "settings.local.json",
    ".credentials.json"
  ]) || matchesExactPath(normalized, "~/.claude.json", cwd);
}
function matchesAntigravityPath(normalized, cwd) {
  return matchesExactPath(normalized, "~/.gemini/config/hooks.json", cwd);
}
function matchesCodexPath(normalized, cwd) {
  return matchesFileInRoot(normalized, codingCliRoot(process.env.CODEX_HOME, "~/.codex", cwd), [
    "config.toml",
    "auth.json",
    ".credentials.json"
  ]);
}
function matchesGeminiPath(normalized, cwd) {
  return matchesFileInRoot(normalized, appendPath(codingCliRoot(process.env.GEMINI_CLI_HOME, "~", cwd), ".gemini"), [
    "oauth_creds.json",
    "mcp-oauth-tokens.json",
    "a2a-oauth-tokens.json",
    "google_accounts.json",
    "settings.json",
    "gemini-credentials.json"
  ]);
}
function matchesCopilotCliPath(normalized, cwd) {
  const root = codingCliRoot(process.env.COPILOT_HOME, "~/.copilot", cwd);
  return matchesFileInRoot(normalized, root, ["config.json"]) || matchesDirInRoot(normalized, root, ["mcp-oauth-config"]);
}
function matchesKimiCodePath(normalized, cwd) {
  const currentRoot = codingCliRoot(process.env.KIMI_CODE_HOME, "~/.kimi-code", cwd);
  const legacyRoot = codingCliRoot(process.env.KIMI_SHARE_DIR, "~/.kimi", cwd);
  return matchesFileInRoot(normalized, currentRoot, ["config.toml", "mcp.json", "server.token"]) || matchesDirInRoot(normalized, currentRoot, ["credentials"]) || matchesFileInRoot(normalized, legacyRoot, ["config.toml", "mcp.json"]) || matchesDirInRoot(normalized, legacyRoot, ["credentials", "mcp-oauth"]);
}
function matchesOpenCodePath(normalized, cwd) {
  const dataRoot = appendPath(codingCliRoot(process.env.XDG_DATA_HOME, "~/.local/share", cwd), "opencode");
  const configRoot = process.env.OPENCODE_CONFIG_DIR ? codingCliRoot(process.env.OPENCODE_CONFIG_DIR, "~/.config/opencode", cwd) : appendPath(codingCliRoot(process.env.XDG_CONFIG_HOME, "~/.config", cwd), "opencode");
  const programDataConfig = process.env.ProgramData ? [appendPath(codingCliRoot(process.env.ProgramData, "", cwd), "opencode")] : [];
  return matchesFileInRoot(normalized, dataRoot, ["auth.json", "mcp-auth.json"]) || matchesFileInRoot(normalized, configRoot, ["opencode.json", "opencode.jsonc"]) || matchesOptionalExactPath(normalized, process.env.OPENCODE_CONFIG, cwd) || ["/Library/Application Support/opencode", "/etc/opencode", ...programDataConfig].some((root) => matchesFileInRoot(normalized, normalizeCandidatePath2(root, cwd), [
    "opencode.json",
    "opencode.jsonc"
  ]));
}
function matchesPiPath(normalized, cwd) {
  return matchesFileInRoot(normalized, codingCliRoot(process.env.PI_CODING_AGENT_DIR, "~/.pi/agent", cwd), ["auth.json"]);
}
function codingCliRoot(envValue, fallback, cwd) {
  return normalizeCandidatePath2(envValue?.trim() ? envValue : fallback, cwd);
}
function matchesFileInRoot(normalized, root, files) {
  return files.some((file) => sameComparablePath(normalized, appendPath(root, file)));
}
function matchesDirInRoot(normalized, root, dirs) {
  return dirs.some((dir) => isSameOrChildPath(comparable(normalized), comparable(appendPath(root, dir))));
}
function matchesExactPath(normalized, path, cwd) {
  return sameComparablePath(normalized, normalizeCandidatePath2(path, cwd));
}
function matchesOptionalExactPath(normalized, path, cwd) {
  return path?.trim() ? matchesExactPath(normalized, path, cwd) : false;
}
function sameComparablePath(a, b) {
  return comparable(a) === comparable(b);
}
function appendPath(root, ...parts) {
  return normalizePathText([root, ...parts].filter(Boolean).join("/"));
}
function isSensitiveDirSegment(comparablePath, dirName) {
  return comparablePath === dirName || comparablePath.startsWith(`${dirName}/`) || comparablePath.includes(`/${dirName}/`);
}
function isAllowedSensitiveTemplate(comparableName) {
  return ENV_EXEMPTION_BASENAMES.has(comparableName) || ENV_EXEMPTION_PREFIXES.some((prefix) => comparableName.startsWith(prefix));
}
function isDeniedByPolicy(target, cwd, config, configCwd) {
  return matchesPolicyPath(target, cwd, config?.denyPaths ?? [], configCwd);
}
function matchesPolicyPath(target, cwd, paths, configCwd) {
  if (paths.length === 0)
    return false;
  const normalized = comparable(normalizeAbsoluteCandidatePath(target, cwd));
  return paths.some((path) => comparable(normalizeAbsoluteCandidatePath(path, configCwd)) === normalized);
}
function isSkippablePathForBroadSignatures(comparablePath) {
  const parts = comparablePath.split("/");
  return parts.some((part) => SKIPPABLE_PATH_SEGMENTS.has(part)) || SKIPPABLE_PATH_SEGMENT_PAIRS.some(([parent, child]) => parts.some((part, index) => part === parent && parts[index + 1] === child));
}
function hasBroadSshKeyBasename(comparableName) {
  return !comparableName.includes(".") && SECRET_BROAD_SSH_KEY_BASENAME_RULE.pattern.test(comparableName);
}
function hasSensitiveExtension(comparableName, config) {
  const extension = getExtension(comparableName);
  if (extension === "")
    return null;
  for (const rule of SECRET_EXTENSION_RULES) {
    if (extension === rule.extension && isSecretRuleEnabled(rule.id, config))
      return rule.id;
  }
  for (const rule of SECRET_EXTENSION_PATTERN_RULES) {
    if (rule.pattern.test(extension) && isSecretRuleEnabled(rule.id, config))
      return rule.id;
  }
  return null;
}
function getExtension(comparableName) {
  const index = comparableName.lastIndexOf(".");
  return index > 0 && index < comparableName.length - 1 ? comparableName.slice(index + 1) : "";
}
function comparable(value) {
  return value.toLowerCase();
}
function isSecretRuleEnabled(id, config) {
  return !config?.disabledRules?.has(id);
}
function normalizeCandidatePath2(target, cwd) {
  const homeValue = process.env.HOME ?? homedir6();
  const home = homeValue ? normalizePathText(resolveExistingPath(homeValue)) : "";
  const normalized = normalizePathText(normalizeFileUriPath(expandSupportedPathEnvironmentVariables(target)));
  if (!normalized) {
    return "";
  }
  if (!home) {
    return normalized;
  }
  const expanded = expandHomePath(normalized, home);
  const absolute = isAbsolute11(expanded) ? expanded : normalizePathText(resolve11(cwd, expanded));
  const canonicalAbsolute = normalizePathText(resolveExistingPath(absolute));
  if (!isSameOrChildPath(canonicalAbsolute, home)) {
    if (isAbsolute11(expanded))
      return canonicalAbsolute;
    return canonicalAbsolute === absolute ? normalized : canonicalAbsolute;
  }
  const relativeHomePath = canonicalAbsolute.slice(home.length);
  return relativeHomePath ? `~${relativeHomePath}` : "~";
}
function normalizeAbsoluteCandidatePath(target, cwd) {
  const homeValue = process.env.HOME ?? homedir6();
  const home = homeValue ? normalizePathText(resolveExistingPath(homeValue)) : "";
  const normalized = normalizePathText(normalizeFileUriPath(expandSupportedPathEnvironmentVariables(target)));
  if (!normalized)
    return "";
  const expanded = home ? expandHomePath(normalized, home) : normalized;
  return normalizePathText(resolveExistingPath(isAbsolute11(expanded) ? expanded : resolve11(cwd, expanded)));
}
function normalizeFileUriPath(value) {
  if (!value.trim().toLowerCase().startsWith("file:"))
    return value;
  try {
    return fileURLToPath(value);
  } catch {
    return value;
  }
}
function expandHomePath(path, home) {
  if (path === "~")
    return home;
  if (path.startsWith("~/"))
    return appendPath(home, path.slice(2));
  return path;
}
function normalizePathText(value) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "");
  if (normalized === "/") {
    return normalized;
  }
  return normalized.replace(/\/+$/g, "");
}
function isSameOrChildPath(path, parent) {
  return path === parent || path.startsWith(`${parent}/`);
}
function basename3(token) {
  return token.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? token;
}
function isOperator3(token) {
  return typeof token === "object" && token !== null && "op" in token && SHELL_OPERATORS3.has(token.op);
}
function isPipeOperator(token) {
  return typeof token === "object" && token !== null && "op" in token && PIPE_OPERATORS.has(token.op);
}
function isRedirectOp2(token) {
  return typeof token === "object" && token !== null && "op" in token && /^(?:<|>|>>|<>|<&|>&|&>|&>>)$/.test(token.op);
}

// src/bin/hook/common.ts
function outputHookDeny(createDenyOutput, reason, command2, segment, manualPermissionAdvice, toolName, ruleId, intent) {
  console.log(JSON.stringify(createDenyOutput(formatBlockedMessage({
    reason,
    ruleId,
    intent,
    command: command2,
    segment,
    toolName,
    redact: redactSecrets,
    manualPermissionAdvice
  }))));
}
async function readHookInput(outputDeny) {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const inputText = Buffer.concat(chunks).toString("utf-8").trim();
  if (!inputText) {
    outputDeny("Missing hook input JSON.");
    return;
  }
  return parseHookJson(inputText, outputDeny, "Failed to parse hook input JSON.");
}
function parseHookJson(inputText, outputDeny, strictReason) {
  try {
    return JSON.parse(inputText);
  } catch {
    outputDeny(strictReason);
    return;
  }
}
function getToolRoute(toolName, commandTools) {
  const shell = commandTools.get(toolName);
  return shell ? { kind: "command", shell } : { kind: getNonCommandToolInputKind(toolName) };
}
function resolveStandardHookContext(cwdInput, toolInput, toolName, outputDeny) {
  const requestedCwd = cwdInput === undefined ? process.cwd() : cwdInput;
  const cwd = typeof requestedCwd === "string" && requestedCwd.trim() !== "" ? firstTrustedRoot([requestedCwd]) : undefined;
  if (cwd)
    return { configCwd: cwd, executionCwd: cwd };
  outputFailedClosed(outputDeny, toolInput, toolName, stringField(requestedCwd));
  return null;
}
function outputFailedClosed(outputDeny, toolInput, toolName, segment) {
  const command2 = getCommandFromToolInput(toolInput);
  outputDeny(REASON_SAFETY_NET_FAILED_CLOSED, command2, segment ?? command2, undefined, toolName, undefined, "stop_and_explain");
}
function analyzeHookCommand(command2, cwd, config, shell) {
  return analyzeCommand(command2, {
    cwd,
    shell,
    config: config ?? loadConfig(cwd, { repairLocalRulebooks: true })
  });
}
function handleSecretProtection(toolInput, route, configCwd, executionCwd, config, sessionId, toolName, agent, outputDeny) {
  if (config.secretProtection?.enabled === false) {
    return false;
  }
  const match = findSensitiveTargetInToolInput(toolInput, route, executionCwd, config.secretProtection, configCwd);
  if (!match) {
    return false;
  }
  const command2 = getCommandFromToolInput(toolInput) ?? match.target;
  if (sessionId) {
    writeAuditLog(sessionId, command2, match.target, REASON_SECRET_PROTECTION, executionCwd, {
      agent,
      ruleId: match.ruleId,
      intent: "hard_stop"
    });
  }
  outputDeny(REASON_SECRET_PROTECTION, command2, match.target, false, toolName, match.ruleId, "hard_stop");
  return true;
}
function handleBlockedHookCommand(command2, cwd, sessionId, outputDeny, config, agent, shell) {
  let result;
  try {
    result = analyzeHookCommand(command2, cwd, config, shell);
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(`CC Safety Net debug: hook analysis failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`);
    }
    outputDeny(REASON_SAFETY_NET_FAILED_CLOSED, command2, command2, undefined, undefined, undefined, "stop_and_explain");
    return;
  }
  if (!result) {
    if (sessionId && envTruthy(ENV_FLAGS.debug)) {
      writeAuditLog(sessionId, command2, command2, "allowed", cwd, { decision: "allow", agent });
    }
    return;
  }
  if (sessionId) {
    writeAuditLog(sessionId, command2, result.segment, result.reason, cwd, {
      ruleId: result.ruleId,
      intent: result.intent,
      agent
    });
  }
  outputDeny(result.reason, command2, result.segment, result.manualPermissionAdvice, undefined, result.ruleId, result.intent);
}
async function runHookAdapter(adapter) {
  const input = await readHookInput(adapter.outputDeny);
  if (input === undefined) {
    return;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    outputFailedClosed(adapter.outputDeny);
    return;
  }
  if (!adapter.isSupported(input)) {
    return;
  }
  const toolNameInput = adapter.getToolName(input);
  if (typeof toolNameInput !== "string" || toolNameInput.trim() === "") {
    outputFailedClosed(adapter.outputDeny);
    return;
  }
  const toolName = toolNameInput;
  const toolInputResult = adapter.getToolInput(input, toolName, adapter.outputDeny);
  if (!toolInputResult.ok)
    return;
  const context = adapter.getContext(input, toolInputResult.input, toolName, adapter.outputDeny);
  if (!context)
    return;
  let policyTarget;
  try {
    policyTarget = findPolicyConfigMutationTargetInToolInput(toolName, toolInputResult.input, toolInputResult.route, context);
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(`CC Safety Net debug: hook policy protection failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`);
    }
    outputFailedClosed(adapter.outputDeny, toolInputResult.input, toolName);
    return;
  }
  if (policyTarget) {
    const command3 = getCommandFromToolInput(toolInputResult.input) ?? policyTarget.target;
    adapter.outputDeny(REASON_POLICY_CONFIG_PROTECTION, command3, policyTarget.target, false, toolName);
    return;
  }
  let config;
  try {
    config = loadConfig(context.configCwd, { repairLocalRulebooks: true });
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(`CC Safety Net debug: hook config loading failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`);
    }
    outputFailedClosed(adapter.outputDeny, toolInputResult.input, toolName);
    return;
  }
  let blockedBySecretProtection;
  try {
    blockedBySecretProtection = handleSecretProtection(toolInputResult.input, toolInputResult.route, context.configCwd, context.executionCwd, config, adapter.getSessionId(input), toolName, adapter.agent, adapter.outputDeny);
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(`CC Safety Net debug: hook secret protection failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`);
    }
    outputFailedClosed(adapter.outputDeny, toolInputResult.input, toolName);
    return;
  }
  if (blockedBySecretProtection) {
    return;
  }
  const command2 = getCommandFromToolInput(toolInputResult.input);
  if (toolInputResult.route.kind !== "command") {
    if (config.failClosedReason) {
      adapter.outputDeny(config.failClosedReason, command2, command2, undefined, toolName, undefined, "stop_and_explain");
    }
    return;
  }
  if (!command2 || command2.trim() === "") {
    outputFailedClosed(adapter.outputDeny, toolInputResult.input, toolName);
    return;
  }
  handleBlockedHookCommand(command2, context.executionCwd, adapter.getSessionId(input), adapter.outputDeny, config, adapter.agent, toolInputResult.route.shell);
}
function stringField(value) {
  return typeof value === "string" ? value : undefined;
}
async function runConfiguredHookAdapter(adapter) {
  const outputDeny = (reason, command2, segment, manualPermissionAdvice, toolName, ruleId, intent) => outputHookDeny(adapter.createDenyOutput, reason, command2, segment, manualPermissionAdvice, toolName, ruleId, intent);
  await runHookAdapter({
    agent: adapter.agent,
    outputDeny,
    isSupported: adapter.isSupported,
    getToolName: adapter.getToolName,
    getToolInput: adapter.getToolInput,
    getContext: adapter.getContext,
    getSessionId: adapter.getSessionId
  });
}

// src/bin/hook/antigravity-cli.ts
var ANTIGRAVITY_CLI_COMMAND_TOOLS = new Map([["run_command", "auto"]]);
var ANTIGRAVITY_PATH_KEYS = new Set([
  "absolutepath",
  "directorypath",
  "file_path",
  "filepath",
  "path",
  "searchdirectory",
  "searchpath",
  "target_file",
  "targetfile"
]);
function getAntigravityCliToolRoute(toolName) {
  return getToolRoute(toolName, ANTIGRAVITY_CLI_COMMAND_TOOLS);
}
async function runAntigravityCliHook() {
  await runConfiguredHookAdapter({
    agent: "antigravity-cli",
    createDenyOutput: (message) => ({
      decision: "deny",
      reason: message
    }),
    isSupported: () => true,
    getToolName: (input) => input.toolCall?.name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: normalizeAntigravityToolArgs(input.toolCall?.args, toolName),
      route: getAntigravityCliToolRoute(toolName)
    }),
    getContext: resolveAntigravityContext,
    getSessionId: (input) => input.conversationId
  });
}
function resolveAntigravityContext(input, toolInput, toolName, outputDeny) {
  const trustedRoots = usableWorkspacePaths(input);
  const configRoots = trustedRoots.flatMap((root) => {
    const canonicalRoot = firstTrustedRoot([root]);
    return canonicalRoot ? [canonicalRoot] : [];
  });
  if (!configRoots[0]) {
    outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
    return null;
  }
  if (toolName !== "run_command") {
    const targetRoot = resolveAntigravityTargetRoot(toolInput, toolName, configRoots);
    if (!targetRoot) {
      outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
      return null;
    }
    return {
      configCwd: targetRoot,
      executionCwd: targetRoot,
      policyConfigCwds: configRoots
    };
  }
  const args = input.toolCall?.args;
  if (!args || !Object.hasOwn(args, "Cwd")) {
    return {
      configCwd: configRoots[0],
      executionCwd: configRoots[0],
      policyConfigCwds: configRoots
    };
  }
  const cwd = args.Cwd;
  if (typeof cwd !== "string" || cwd.trim() === "") {
    outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
    return null;
  }
  const containedCwd = resolveContainedCwd(cwd, configRoots);
  if (containedCwd) {
    const configCwd = mostSpecificContainingRoot(containedCwd, configRoots);
    if (!configCwd) {
      outputAntigravityCwdDeny(outputDeny, toolInput, toolName, cwd);
      return null;
    }
    return { configCwd, executionCwd: containedCwd, policyConfigCwds: configRoots };
  }
  outputAntigravityCwdDeny(outputDeny, toolInput, toolName, cwd);
  return null;
}
function resolveAntigravityTargetRoot(toolInput, toolName, configRoots) {
  const route = getAntigravityCliToolRoute(toolName);
  const targets = [
    ...extractPathLikeToolValues(toolInput, ANTIGRAVITY_PATH_KEYS),
    ...route.kind === "patch" ? extractPatchTargetsFromToolInput(toolInput) : []
  ].filter(isAbsolute12);
  const targetRoots = new Set(targets.flatMap((target) => {
    const root = mostSpecificContainingRoot(resolveExistingPath(target), configRoots);
    return root ? [root] : [];
  }));
  if (targetRoots.size > 1)
    return null;
  return [...targetRoots][0] ?? configRoots[0] ?? null;
}
function mostSpecificContainingRoot(path, roots) {
  return roots.filter((root) => isSameOrInside2(path, root)).reduce((best, root) => root.length > best.length ? root : best, "") || null;
}
function isSameOrInside2(path, root) {
  const rel = relative4(root, path);
  return rel === "" || !rel.startsWith("..") && !isAbsolute12(rel);
}
function outputAntigravityCwdDeny(outputDeny, toolInput, toolName, cwd) {
  const command2 = toolInput && typeof toolInput === "object" ? toolInput.command : undefined;
  outputDeny(REASON_SAFETY_NET_FAILED_CLOSED, typeof command2 === "string" ? command2 : undefined, cwd, undefined, toolName, undefined, "stop_and_explain");
}
function usableWorkspacePaths(input) {
  if (input.workspacePaths === undefined)
    return [process.cwd()];
  const workspacePaths = Array.isArray(input.workspacePaths) ? input.workspacePaths.filter((path) => typeof path === "string" && path.trim() !== "") : [];
  return firstTrustedRoot(workspacePaths) ? workspacePaths : [];
}
function normalizeAntigravityToolArgs(args, toolName) {
  if (!args)
    return;
  if (toolName !== "run_command")
    return args;
  return {
    ...args,
    command: typeof args.CommandLine === "string" && args.CommandLine !== "" ? args.CommandLine : undefined
  };
}

// src/bin/hook/constants.ts
var CLAUDE_CODE_HOOK_EVENT = "PreToolUse";
var GEMINI_CLI_HOOK_EVENT = "BeforeTool";
var KIMI_CODE_HOOK_EVENT = "PreToolUse";

// src/bin/hook/claude-code.ts
var CLAUDE_CODE_COMMAND_TOOLS = new Map([
  ["Bash", "posix"],
  ["PowerShell", "powershell"]
]);
function getClaudeCodeToolRoute(toolName) {
  return getToolRoute(toolName, CLAUDE_CODE_COMMAND_TOOLS);
}
async function runClaudeCodeHook() {
  await runConfiguredHookAdapter({
    agent: "claude-code",
    createDenyOutput: (message) => ({
      hookSpecificOutput: {
        hookEventName: CLAUDE_CODE_HOOK_EVENT,
        permissionDecision: "deny",
        permissionDecisionReason: message
      }
    }),
    isSupported: (input) => input.hook_event_name === CLAUDE_CODE_HOOK_EVENT,
    getToolName: (input) => input.tool_name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: getClaudeCodeToolRoute(toolName)
    }),
    getContext: (input, toolInput, toolName, outputDeny) => resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => input.session_id
  });
}

// src/bin/hook/copilot-cli.ts
var COPILOT_CLI_COMMAND_TOOLS = new Map([
  ["bash", "auto"],
  ["Bash", "auto"]
]);
function getCopilotCliToolRoute(toolName) {
  return getToolRoute(toolName, COPILOT_CLI_COMMAND_TOOLS);
}
async function runCopilotCliHook() {
  await runConfiguredHookAdapter({
    agent: "copilot-cli",
    createDenyOutput: (message) => ({
      permissionDecision: "deny",
      permissionDecisionReason: message
    }),
    isSupported: () => true,
    getToolName: (input) => input.toolName,
    getToolInput: (input, toolName, outputDeny) => {
      if (typeof input.toolArgs !== "string") {
        outputDeny("Failed to parse toolArgs JSON.");
        return { ok: false };
      }
      const toolInput = parseHookJson(input.toolArgs, outputDeny, "Failed to parse toolArgs JSON.");
      if (toolInput === undefined)
        return { ok: false };
      return { ok: true, input: toolInput, route: getCopilotCliToolRoute(toolName) };
    },
    getContext: (input, toolInput, toolName, outputDeny) => resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => `copilot-${input.timestamp ?? Date.now()}`
  });
}

// src/bin/hook/gemini-cli.ts
var GEMINI_CLI_COMMAND_TOOLS = new Map([["run_shell_command", "auto"]]);
function getGeminiCliToolRoute(toolName) {
  return getToolRoute(toolName, GEMINI_CLI_COMMAND_TOOLS);
}
async function runGeminiCLIHook() {
  await runConfiguredHookAdapter({
    agent: "gemini-cli",
    createDenyOutput: (message) => ({
      decision: "deny",
      reason: message,
      systemMessage: message
    }),
    isSupported: (input) => input.hook_event_name === GEMINI_CLI_HOOK_EVENT,
    getToolName: (input) => input.tool_name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: getGeminiCliToolRoute(toolName)
    }),
    getContext: (input, toolInput, toolName, outputDeny) => resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => input.session_id
  });
}

// src/bin/hook/kimi-code.ts
var KIMI_CODE_COMMAND_TOOLS = new Map([["Bash", "posix"]]);
function getKimiCodeToolRoute(toolName) {
  return getToolRoute(toolName, KIMI_CODE_COMMAND_TOOLS);
}
async function runKimiCodeHook() {
  await runConfiguredHookAdapter({
    agent: "kimi-code",
    createDenyOutput: (message) => ({
      hookSpecificOutput: {
        hookEventName: KIMI_CODE_HOOK_EVENT,
        permissionDecision: "deny",
        permissionDecisionReason: message
      }
    }),
    isSupported: (input) => input.hook_event_name === KIMI_CODE_HOOK_EVENT,
    getToolName: (input) => input.tool_name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: getKimiCodeToolRoute(toolName)
    }),
    getContext: (input, toolInput, toolName, outputDeny) => resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => input.session_id
  });
}

// src/bin/integration-metadata.ts
var integrationMetadata = [
  {
    id: "claude-code",
    displayName: "Claude Code",
    doctorVisible: true,
    runtimeHook: {
      flags: ["-cc", "--claude-code"],
      description: "Run as Claude Code PreToolUse hook",
      legacyTopLevel: true,
      order: 2
    }
  },
  {
    id: "antigravity-cli",
    displayName: "Antigravity CLI",
    doctorVisible: true,
    runtimeHook: {
      flags: ["-ac", "--agy-cli"],
      description: "Run as Antigravity CLI PreToolUse hook",
      legacyTopLevel: false,
      order: 1
    }
  },
  {
    id: "codex",
    displayName: "Codex",
    doctorVisible: true
  },
  {
    id: "copilot-cli",
    displayName: "Copilot CLI",
    doctorVisible: true,
    runtimeHook: {
      flags: ["-cp", "--copilot-cli"],
      description: "Run as Copilot CLI PreToolUse hook",
      legacyTopLevel: true,
      order: 3
    }
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    doctorVisible: true,
    runtimeHook: {
      flags: ["-gc", "--gemini-cli"],
      description: "Run as Gemini CLI BeforeTool hook",
      legacyTopLevel: true,
      order: 4
    }
  },
  {
    id: "kimi-code",
    displayName: "Kimi Code",
    doctorVisible: true,
    runtimeHook: {
      flags: ["-kc", "--kimi-code"],
      description: "Run as Kimi Code PreToolUse hook",
      legacyTopLevel: false,
      order: 5
    }
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    doctorVisible: true
  },
  {
    id: "pi",
    displayName: "Pi",
    doctorVisible: true
  }
];
var doctorIntegrationOrder = integrationMetadata.filter((integration) => integration.doctorVisible).map((integration) => integration.id);
var runtimeHookIntegrationMetadata = integrationMetadata.filter((integration) => ("runtimeHook" in integration)).toSorted((a, b) => a.runtimeHook.order - b.runtimeHook.order).map((integration) => ({
  id: integration.id,
  displayName: integration.displayName,
  flags: integration.runtimeHook.flags,
  description: integration.runtimeHook.description,
  legacyTopLevel: integration.runtimeHook.legacyTopLevel
}));
function getIntegrationDisplayName(id) {
  return integrationMetadata.find((integration) => integration.id === id)?.displayName ?? id;
}

// src/bin/hook/integrations.ts
var hookRunners = {
  "antigravity-cli": runAntigravityCliHook,
  "claude-code": runClaudeCodeHook,
  "copilot-cli": runCopilotCliHook,
  "gemini-cli": runGeminiCLIHook,
  "kimi-code": runKimiCodeHook
};
var hookIntegrations = runtimeHookIntegrationMetadata.map((integration) => ({
  ...integration,
  run: hookRunners[integration.id]
}));
function findHookIntegrationByFlag(args) {
  return hookIntegrations.find((integration) => integration.flags.some((flag) => args.includes(flag)));
}
function findLegacyTopLevelHookIntegration(flag) {
  return hookIntegrations.find((integration) => integration.legacyTopLevel && integration.flags.some((integrationFlag) => integrationFlag === flag));
}

// src/bin/commands/hook.ts
var platformOptions = hookIntegrations.map((integration) => ({
  flags: integration.flags.join(", "),
  description: integration.description
}));
var platformExamples = hookIntegrations.flatMap((integration) => integration.flags.map((flag) => `cc-safety-net hook ${flag}`));
var hookCommand = {
  name: "hook",
  description: "Run as an agent CLI hook (reads JSON from stdin)",
  usage: "hook <coding cli>",
  options: [
    ...platformOptions,
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: platformExamples
};

// src/bin/commands/install.ts
var installTargetOptions = [
  { flags: "--codex", description: "Install Codex plugin" },
  { flags: "--claude-code", description: "Install Claude Code plugin" },
  { flags: "--agy-cli", description: "Install Antigravity CLI hook config" },
  { flags: "--gemini-cli", description: "Install Gemini CLI extension" },
  { flags: "--copilot-cli", description: "Install GitHub Copilot CLI plugin" },
  { flags: "--kimi-code", description: "Install Kimi Code hook config" },
  { flags: "--opencode", description: "Install OpenCode plugin" },
  { flags: "--pi", description: "Install Pi package" },
  { flags: "-h, --help", description: "Show this help" }
];
var installCommand = {
  name: "install",
  description: "Install CC Safety Net into a coding agent CLI",
  usage: "install [coding cli]",
  options: installTargetOptions,
  examples: [
    "cc-safety-net install",
    "cc-safety-net install --codex",
    "cc-safety-net install --claude-code",
    "cc-safety-net install --agy-cli",
    "cc-safety-net install --gemini-cli",
    "cc-safety-net install --copilot-cli",
    "cc-safety-net install --kimi-code",
    "cc-safety-net install --opencode",
    "cc-safety-net install --pi"
  ]
};
var uninstallCommand = {
  name: "uninstall",
  description: "Uninstall CC Safety Net from a coding agent CLI",
  usage: "uninstall [coding cli]",
  options: [
    { flags: "--codex", description: "Uninstall Codex plugin" },
    { flags: "--claude-code", description: "Uninstall Claude Code plugin" },
    { flags: "--agy-cli", description: "Uninstall Antigravity CLI hook config" },
    { flags: "--gemini-cli", description: "Uninstall Gemini CLI extension" },
    { flags: "--copilot-cli", description: "Uninstall GitHub Copilot CLI plugin" },
    { flags: "--kimi-code", description: "Uninstall Kimi Code hook config" },
    { flags: "--opencode", description: "Uninstall OpenCode plugin" },
    { flags: "--pi", description: "Uninstall Pi package" },
    { flags: "-h, --help", description: "Show this help" }
  ],
  examples: [
    "cc-safety-net uninstall",
    "cc-safety-net uninstall --codex",
    "cc-safety-net uninstall --claude-code",
    "cc-safety-net uninstall --agy-cli",
    "cc-safety-net uninstall --gemini-cli",
    "cc-safety-net uninstall --copilot-cli",
    "cc-safety-net uninstall --kimi-code",
    "cc-safety-net uninstall --opencode",
    "cc-safety-net uninstall --pi"
  ]
};

// src/bin/commands/logs.ts
var logsCommand = {
  name: "logs",
  description: "Browse audit log entries recorded by hooks",
  usage: "logs [options]",
  options: [
    {
      flags: "--limit",
      argument: "<n>",
      description: "Maximum entries to print",
      default: "20"
    },
    {
      flags: "--since",
      argument: "<days>",
      description: "Only include entries newer than this many days",
      default: "30"
    },
    {
      flags: "--agent",
      argument: "<name>",
      description: "Filter by agent name"
    },
    {
      flags: "--rule",
      argument: "<ruleId>",
      description: "Filter by rule id"
    },
    {
      flags: "--session",
      argument: "<id>",
      description: "Filter by session id"
    },
    {
      flags: "--project",
      argument: "<path>",
      description: "Filter by project path"
    },
    {
      flags: "--all",
      description: "Include allow entries"
    },
    {
      flags: "--json",
      description: "Output entries as JSON"
    },
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: [
    "cc-safety-net logs --agent claude-code",
    "cc-safety-net logs --project . --since 7",
    "cc-safety-net logs --json"
  ]
};

// src/bin/commands/rule.ts
var ruleCommand = {
  name: "rule",
  description: "Manage CC Safety Net rule config and rulebook sources",
  usage: "rule <subcommand>",
  subcommands: [
    { usage: "init [--example]", description: "Create inert rule config" },
    { usage: "add <source>", description: "Add a rulebook source and sync" },
    { usage: "remove <source>", description: "Remove a rulebook source and sync" },
    { usage: "update [source]", description: "Refresh rulebook lock/cache state" },
    { usage: "sync", description: "Sync configured rulebooks" },
    { usage: "list", description: "List active rulebooks" },
    { usage: "wrapper add <command>", description: "Trust a transparent command wrapper" },
    { usage: "wrapper remove <command>", description: "Remove a transparent command wrapper" },
    { usage: "wrapper list", description: "List transparent command wrappers" },
    { usage: "test [source]", description: "Run rulebook fixtures" },
    { usage: "migrate [--cleanup]", description: "Migrate legacy inline rules" },
    { usage: "doc", description: "Print the rulebook authoring guide" },
    { usage: "verify", description: "Validate rule config files" }
  ],
  options: [
    { flags: "-g, --global", description: "Use user-scope rule config" },
    { flags: "--check", description: "Check without changing lock/cache state" },
    { flags: "--cleanup", description: "Delete legacy files after rule migrate verifies them" },
    { flags: "--delete-source", description: "Delete clean local source directory on remove" },
    { flags: "--example", description: "Create an inactive example rulebook with rule init" },
    { flags: "-h, --help", description: "Show this help" }
  ],
  examples: [
    "cc-safety-net rule init",
    "cc-safety-net rule init --example",
    "cc-safety-net rule wrapper add rtk",
    "cc-safety-net rule add project-rules",
    "cc-safety-net rule sync",
    "cc-safety-net rule migrate --cleanup",
    "cc-safety-net rule verify"
  ]
};

// src/bin/commands/statusline.ts
var statuslineCommand = {
  name: "statusline",
  description: "Print status line with mode indicators for shell integration",
  usage: "statusline <coding cli>",
  options: [
    {
      flags: "-cc, --claude-code",
      description: "Print status line for Claude Code"
    },
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: ["cc-safety-net statusline -cc", "cc-safety-net statusline --claude-code"]
};

// src/bin/commands/index.ts
var commands = [
  doctorCommand,
  logsCommand,
  explainCommand,
  ruleCommand,
  installCommand,
  uninstallCommand,
  hookCommand,
  guiCommand,
  statuslineCommand
];
function getCommandAliases(command2) {
  return command2.aliases ?? [];
}
function isVisibleCommand(command2) {
  return !command2.hidden;
}
function findCommand(nameOrAlias) {
  const normalized = nameOrAlias.toLowerCase();
  return commands.find((cmd) => cmd.name.toLowerCase() === normalized || getCommandAliases(cmd).some((alias) => alias.toLowerCase() === normalized));
}
function getVisibleCommands() {
  return commands.filter(isVisibleCommand);
}

// src/bin/doctor/activity.ts
import { readFileSync as readFileSync11 } from "node:fs";
import { basename as basename4 } from "node:path";
function formatRelativeTime(date) {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0)
    return `${days}d ago`;
  if (hours > 0)
    return `${hours}h ago`;
  if (minutes > 0)
    return `${minutes}m ago`;
  return "just now";
}
function getActivitySummary(days = 7, logsDir = getAuditLogsDir()) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recentEntries = [];
  const recentSessions = new Set;
  let totalBlocked = 0;
  let oldestEntry;
  let oldestEntryTs;
  let newestEntry;
  let newestEntryTs;
  const files = logsDir ? listAuditLogFiles(logsDir) : [];
  for (const file of files) {
    try {
      const content = readFileSync11(file, "utf-8");
      const lines = content.trim().split(`
`).filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.decision === "allow") {
            continue;
          }
          const ts = new Date(entry.ts).getTime();
          if (ts >= cutoff) {
            totalBlocked++;
            recentSessions.add(entry.sessionId ?? basename4(file, ".jsonl"));
            if (oldestEntryTs === undefined || ts <= oldestEntryTs) {
              oldestEntry = entry.ts;
              oldestEntryTs = ts;
            }
            if (newestEntryTs === undefined || ts > newestEntryTs) {
              newestEntry = entry.ts;
              newestEntryTs = ts;
            }
            insertRecentEntry(recentEntries, entry, ts);
          }
        } catch {}
      }
    } catch {}
  }
  const displayEntries = recentEntries.map((e) => ({
    timestamp: e.ts,
    command: e.command,
    reason: e.reason,
    relativeTime: formatRelativeTime(new Date(e.ts))
  }));
  return {
    totalBlocked,
    sessionCount: recentSessions.size,
    recentEntries: displayEntries,
    oldestEntry,
    newestEntry
  };
}
function insertRecentEntry(entries, entry, ts) {
  const index = entries.findIndex((existing) => ts > new Date(existing.ts).getTime());
  if (index === -1) {
    if (entries.length < 3) {
      entries.push(entry);
    }
    return;
  }
  entries.splice(index, 0, entry);
  if (entries.length > 3) {
    entries.pop();
  }
}

// src/bin/doctor/config.ts
import { existsSync as existsSync11 } from "node:fs";
import { dirname as dirname12 } from "node:path";
function getConfigSourceInfo(path, lockPath, userConfigDir) {
  if (!existsSync11(path)) {
    return { path, exists: false, valid: false, ruleCount: 0 };
  }
  const validation = validateRulesConfigFile(path);
  validation.errors.push(...getRulesConfigRuntimeErrorsForConfig(path, lockPath, { userConfigDir }));
  return {
    path,
    exists: true,
    valid: validation.errors.length === 0,
    ruleCount: validation.ruleNames.size,
    ...validation.errors.length > 0 ? { errors: validation.errors } : {}
  };
}
function toEffectiveRule(rule, source) {
  return {
    source,
    name: rule.name,
    command: rule.command,
    subcommand: rule.subcommand,
    blockArgs: rule.block_args,
    reason: rule.reason
  };
}
function getConfigInfo(cwd, options2) {
  const userPath = options2?.userConfigPath ?? getUserRulesConfigPath();
  const projectPath = options2?.projectConfigPath ?? getProjectRulesConfigPath(cwd);
  const userConfigDir = dirname12(userPath);
  const policy = loadRulesPolicy({
    cwd,
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    userConfigDir
  });
  const rulebookSources = new Map(policy.rulebooks.flatMap((rulebook) => rulebook.rules.map((rule) => [rule, rulebook.source])));
  return {
    userConfig: getConfigSourceInfo(userPath, getUserRulesLockPath({ userConfigPath: userPath }), userConfigDir),
    projectConfig: getConfigSourceInfo(projectPath, getRulesLockPathForConfigPath(projectPath), userConfigDir),
    effectiveRules: policy.rules.map((rule) => toEffectiveRule(rule, rulebookSources.get(rule.name) ?? "project")),
    shadowedRules: []
  };
}

// src/bin/doctor/environment.ts
var ENV_VARS = [
  {
    flag: ENV_FLAGS.level,
    description: "Safety level preset: standard, strict, or paranoid",
    defaultBehavior: "standard"
  },
  {
    flag: ENV_FLAGS.strict,
    description: "Legacy; equivalent to safety.overrides.fail_closed",
    defaultBehavior: "permissive"
  },
  {
    flag: ENV_FLAGS.paranoid,
    description: "Legacy; equivalent to safety.overrides.paranoid_rm and paranoid_interpreters",
    defaultBehavior: "off"
  },
  {
    flag: ENV_FLAGS.paranoidRm,
    description: "Legacy; equivalent to safety.overrides.paranoid_rm",
    defaultBehavior: "off"
  },
  {
    flag: ENV_FLAGS.paranoidInterpreters,
    description: "Legacy; equivalent to safety.overrides.paranoid_interpreters",
    defaultBehavior: "off"
  },
  {
    flag: ENV_FLAGS.worktree,
    description: "Allow local git discards in linked worktrees",
    defaultBehavior: "off"
  },
  {
    flag: ENV_FLAGS.debug,
    description: "Log allowed hook commands for debugging",
    defaultBehavior: "off"
  }
];
function getEnvironmentInfo() {
  return [
    ...ENV_VARS.map((v) => ({
      name: v.flag.name,
      value: getEnvFlagValue(v.flag),
      isSet: envFlagIsSet(v.flag),
      legacyName: v.flag.legacyName,
      legacyValue: v.flag.legacyName ? process.env[v.flag.legacyName] : undefined,
      legacyIsSet: v.flag.legacyName ? process.env[v.flag.legacyName] !== undefined : undefined,
      description: v.description,
      defaultBehavior: v.defaultBehavior
    })),
    {
      name: "CC_SAFETY_NET_HOME",
      value: process.env.CC_SAFETY_NET_HOME,
      isSet: process.env.CC_SAFETY_NET_HOME !== undefined,
      description: "Override user-scope config/cache directory",
      defaultBehavior: "~/.cc-safety-net"
    }
  ];
}

// src/bin/utils/colors.ts
function shouldUseColor() {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
}
var green = (s) => shouldUseColor() ? `\x1B[32m${s}\x1B[0m` : s;
var yellow = (s) => shouldUseColor() ? `\x1B[33m${s}\x1B[0m` : s;
var blue = (s) => shouldUseColor() ? `\x1B[34m${s}\x1B[0m` : s;
var magenta = (s) => shouldUseColor() ? `\x1B[35m${s}\x1B[0m` : s;
var cyan = (s) => shouldUseColor() ? `\x1B[36m${s}\x1B[0m` : s;
var red = (s) => shouldUseColor() ? `\x1B[31m${s}\x1B[0m` : s;
var dim = (s) => shouldUseColor() ? `\x1B[2m${s}\x1B[0m` : s;
var bold = (s) => shouldUseColor() ? `\x1B[1m${s}\x1B[0m` : s;
var colors = {
  green,
  yellow,
  blue,
  magenta,
  cyan,
  red,
  dim,
  bold
};
var ANSI_RESET = "\x1B[0m";
var DISTINCT_COLORS = [
  39,
  82,
  198,
  226,
  208,
  51,
  196,
  46,
  201,
  214,
  93,
  154,
  220,
  27,
  49,
  190,
  200,
  33,
  129,
  227,
  45,
  160,
  63,
  118,
  123,
  202
];
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
function getShuffledPalette(seed) {
  const palette = [...DISTINCT_COLORS];
  const random = createRandom(seed);
  for (let i = palette.length - 1;i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = palette[i];
    palette[i] = palette[j];
    palette[j] = temp;
  }
  return palette;
}
function generateDistinctColor(index, seed = 0) {
  if (!shouldUseColor())
    return "";
  const palette = getShuffledPalette(seed);
  const colorCode = palette[index % palette.length];
  return `\x1B[38;5;${colorCode}m`;
}
function colorizeToken(token, index, seed = 0) {
  if (!shouldUseColor())
    return `"${token}"`;
  const colorCode = generateDistinctColor(index, seed);
  return `${colorCode}"${token}"${ANSI_RESET}`;
}

// src/bin/doctor/format.ts
function formatAsciiTable(options2) {
  const rawRows = options2.rawRows ?? options2.rows;
  const colWidths = (options2.headers ?? rawRows[0] ?? []).map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });
  const pad = (s, w, raw) => s + " ".repeat(Math.max(0, w - raw.length));
  const line = (char, corners) => corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];
  const formatRow = (cells, rawCells) => `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? "")).join(" │ ")} │`;
  const headerLines = options2.headers ? [`   ${formatRow(options2.headers, options2.headers)}`, `   ${line("─", ["├", "┼", "┤"])}`] : [];
  return [
    `   ${line("─", ["┌", "┬", "┐"])}`,
    ...headerLines,
    ...options2.rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line("─", ["└", "┴", "┘"])}`
  ].join(`
`);
}
function formatHooksSection(hooks) {
  const lines = [];
  lines.push("Hook Integration");
  lines.push(formatHooksTable(hooks));
  const failures = [];
  const warnings = [];
  const errors = [];
  for (const hook of hooks) {
    const platformName = getIntegrationDisplayName(hook.platform);
    if (hook.selfTest) {
      for (const result of hook.selfTest.results) {
        if (!result.passed) {
          failures.push({ platform: platformName, result });
        }
      }
    }
    if (hook.errors && hook.errors.length > 0) {
      for (const err of hook.errors) {
        if (hook.status === "configured") {
          warnings.push({ platform: platformName, message: err });
        } else {
          errors.push({ platform: platformName, message: err });
        }
      }
    }
  }
  if (failures.length > 0) {
    lines.push("");
    lines.push(colors.red("   Failures:"));
    for (const f of failures) {
      lines.push(colors.red(`   • ${f.platform}: ${f.result.description}`));
      lines.push(colors.red(`     expected ${f.result.expected}, got ${f.result.actual}`));
    }
  }
  for (const w of warnings) {
    lines.push(`   Warning (${w.platform}): ${w.message}`);
  }
  for (const e of errors) {
    lines.push(colors.red(`   Error (${e.platform}): ${e.message}`));
  }
  return lines.join(`
`);
}
function formatHooksTable(hooks) {
  const headers = ["Platform", "Status", "Tests"];
  const getStatusDisplay = (h) => {
    switch (h.status) {
      case "configured":
        return { text: "Configured", colored: colors.green("Configured") };
      case "disabled":
        return { text: "Disabled", colored: colors.yellow("Disabled") };
      case "n/a":
        return { text: "N/A", colored: colors.dim("N/A") };
    }
  };
  const rowData = hooks.map((h) => {
    const platformName = getIntegrationDisplayName(h.platform);
    const statusDisplay = getStatusDisplay(h);
    let testsText = "-";
    if (h.status === "configured" && h.selfTest) {
      const label = h.selfTest.failed > 0 ? "FAIL" : "OK";
      testsText = `${h.selfTest.passed}/${h.selfTest.total} ${label}`;
    }
    return {
      colored: [platformName, statusDisplay.colored, testsText],
      raw: [platformName, statusDisplay.text, testsText]
    };
  });
  const rows = rowData.map((r) => r.colored);
  const rawRows = rowData.map((r) => r.raw);
  return formatAsciiTable({ headers, rows, rawRows });
}
function formatRulesTable(rules) {
  if (rules.length === 0) {
    return "   (no custom rules)";
  }
  const headers = ["Source", "Name", "Command", "Block Args"];
  const rows = rules.map((r) => [
    r.source,
    r.name,
    r.subcommand ? `${r.command} ${r.subcommand}` : r.command,
    r.blockArgs.join(", ")
  ]);
  return formatAsciiTable({ headers, rows });
}
function formatConfigSection(report) {
  const lines = [];
  lines.push("Configuration");
  lines.push(formatConfigTable(report.userConfig, report.projectConfig));
  lines.push("");
  if (report.effectiveRules.length > 0) {
    lines.push(`   Effective rules (${report.effectiveRules.length} total):`);
    lines.push(formatRulesTable(report.effectiveRules));
  } else {
    lines.push("   Effective rules: (none - using built-in rules only)");
  }
  for (const shadow of report.shadowedRules) {
    lines.push("");
    lines.push(`   Note: Project rule "${shadow.name}" shadows user rule with same name`);
  }
  return lines.join(`
`);
}
function formatConfigTable(userConfig, projectConfig) {
  const headers = ["Scope", "Status"];
  const getStatusDisplay = (config) => {
    if (!config.exists) {
      return { text: "N/A", colored: colors.dim("N/A") };
    }
    if (!config.valid) {
      const errMsg = config.errors?.[0] ?? "unknown error";
      const text = `Invalid (${errMsg})`;
      return { text, colored: colors.red(text) };
    }
    return { text: "Configured", colored: colors.green("Configured") };
  };
  const userStatus = getStatusDisplay(userConfig);
  const projectStatus = getStatusDisplay(projectConfig);
  const rows = [
    ["User", userStatus.colored],
    ["Project", projectStatus.colored]
  ];
  const rawRows = [
    ["User", userStatus.text],
    ["Project", projectStatus.text]
  ];
  return formatAsciiTable({ headers, rows, rawRows });
}
function formatEnvironmentSection(envVars) {
  const lines = [];
  lines.push("Environment");
  lines.push(formatEnvironmentTable(envVars));
  return lines.join(`
`);
}
function formatEffectiveSafetySection(report) {
  const lines = [`Effective Safety`, `   Effective: ${report.effectiveSafety.level}`];
  const capabilityLabels = [
    ["fail_closed", "fail_closed"],
    ["paranoid_rm", "paranoid_rm"],
    ["paranoid_interpreters", "paranoid_interpreters"]
  ];
  for (const [key, label] of capabilityLabels) {
    const capability = report.effectiveSafety.capabilities[key];
    const state = capability.enabled ? colors.green("ON") : colors.dim("OFF");
    const sources = capability.sources.length > 0 ? ` (${capability.sources.join(", ")})` : "";
    lines.push(`   ${label}: ${state}${sources}`);
  }
  return lines.join(`
`);
}
function formatEnvironmentTable(envVars) {
  const headers = ["Variable", "Status", "Legacy"];
  const rows = envVars.map((v) => {
    const statusIcon = v.isSet ? colors.green("✓") : colors.dim("✗");
    const legacyStatus = v.legacyName && v.legacyIsSet ? `${v.legacyName} ${colors.green("✓")}` : v.legacyName ?? "";
    return [v.name, statusIcon, legacyStatus];
  });
  const rawRows = envVars.map((v) => [
    v.name,
    v.isSet ? "✓" : "✗",
    v.legacyName && v.legacyIsSet ? `${v.legacyName} ✓` : v.legacyName ?? ""
  ]);
  return formatAsciiTable({ headers, rows, rawRows });
}
function formatActivitySection(activity) {
  const lines = [];
  if (activity.totalBlocked === 0) {
    lines.push("Recent Activity");
    lines.push("   No blocked commands in the last 7 days");
    lines.push("   Tip: This is normal for new installations");
  } else {
    lines.push(`Recent Activity (${activity.totalBlocked} blocked / ${activity.sessionCount} sessions)`);
    lines.push(formatActivityTable(activity.recentEntries));
  }
  return lines.join(`
`);
}
function formatActivityTable(entries) {
  const headers = ["Time", "Command"];
  const rows = entries.map((e) => {
    const cmd = e.command.length > 40 ? `${e.command.slice(0, 37)}...` : e.command;
    return [e.relativeTime, cmd];
  });
  return formatAsciiTable({ headers, rows });
}
function formatUpdateSection(update) {
  const lines = [];
  lines.push("Update Check");
  const rowData = [];
  if (update.latestVersion === null && !update.error) {
    rowData.push({
      label: "Status",
      value: colors.dim("Skipped"),
      rawValue: "Skipped"
    });
    rowData.push({
      label: "Installed",
      value: update.currentVersion,
      rawValue: update.currentVersion
    });
    lines.push(formatUpdateTable(rowData));
    return lines.join(`
`);
  }
  if (update.error) {
    rowData.push({
      label: "Status",
      value: `${colors.yellow("⚠")} Error`,
      rawValue: "⚠ Error"
    });
    rowData.push({
      label: "Installed",
      value: update.currentVersion,
      rawValue: update.currentVersion
    });
    rowData.push({
      label: "Error",
      value: colors.dim(update.error),
      rawValue: update.error
    });
    lines.push(formatUpdateTable(rowData));
    return lines.join(`
`);
  }
  if (update.updateAvailable) {
    rowData.push({
      label: "Status",
      value: `${colors.yellow("⚠")} Update Available`,
      rawValue: "⚠ Update Available"
    });
    rowData.push({
      label: "Current",
      value: update.currentVersion,
      rawValue: update.currentVersion
    });
    rowData.push({
      label: "Latest",
      value: colors.green(update.latestVersion ?? ""),
      rawValue: update.latestVersion ?? ""
    });
    lines.push(formatUpdateTable(rowData));
    lines.push("");
    lines.push("   Run: bunx cc-safety-net@latest doctor");
    lines.push("   Or:  npx cc-safety-net@latest doctor");
    return lines.join(`
`);
  }
  rowData.push({
    label: "Status",
    value: `${colors.green("✓")} Up to date`,
    rawValue: "✓ Up to date"
  });
  rowData.push({
    label: "Version",
    value: update.currentVersion,
    rawValue: update.currentVersion
  });
  lines.push(formatUpdateTable(rowData));
  return lines.join(`
`);
}
function formatUpdateTable(rowData) {
  const rows = rowData.map((r) => [r.label, r.value]);
  const rawRows = rowData.map((r) => [r.label, r.rawValue]);
  return formatAsciiTable({ rows, rawRows });
}
function formatSystemInfoSection(system) {
  const lines = [];
  lines.push("System Info");
  lines.push(formatSystemInfoTable(system));
  return lines.join(`
`);
}
function formatSystemInfoTable(system) {
  const headers = ["Component", "Version"];
  const formatValue = (value) => {
    if (value === null)
      return colors.dim("not found");
    return value;
  };
  const rawValue = (value) => {
    return value ?? "not found";
  };
  const rowData = [
    { label: "cc-safety-net", value: system.version },
    { label: "Claude Code", value: system.claudeCodeVersion },
    { label: "Antigravity CLI", value: system.antigravityCliVersion },
    { label: "Codex", value: system.codexCliVersion },
    { label: "Copilot CLI", value: system.copilotCliVersion },
    { label: "Gemini CLI", value: system.geminiCliVersion },
    { label: "Kimi Code", value: system.kimiCodeVersion },
    { label: "OpenCode", value: system.openCodeVersion },
    { label: "Pi", value: system.piCliVersion },
    { label: "Node.js", value: system.nodeVersion },
    { label: "npm", value: system.npmVersion },
    { label: "Bun", value: system.bunVersion },
    { label: "Platform", value: system.platform }
  ];
  const rows = rowData.map((r) => [r.label, formatValue(r.value)]);
  const rawRows = rowData.map((r) => [r.label, rawValue(r.value)]);
  return formatAsciiTable({ headers, rows, rawRows });
}
function formatSummary(report) {
  const hooksFailed = report.hooks.every((h) => h.status !== "configured");
  const selfTestFailed = report.hooks.some((h) => h.selfTest && h.selfTest.failed > 0);
  const configFailed = (report.userConfig.errors?.length ?? 0) > 0 || (report.projectConfig.errors?.length ?? 0) > 0;
  const failures = [hooksFailed, selfTestFailed, configFailed].filter(Boolean).length;
  let warnings = 0;
  if (report.update.updateAvailable)
    warnings++;
  if (report.activity.totalBlocked === 0)
    warnings++;
  warnings += report.shadowedRules.length;
  if (failures > 0) {
    return colors.red(`
${failures} check(s) failed.`);
  }
  if (warnings > 0) {
    return colors.yellow(`
All checks passed with ${warnings} warning(s).`);
  }
  return colors.green(`
All checks passed.`);
}

// src/bin/doctor/hooks.ts
import { existsSync as existsSync12, readdirSync as readdirSync3, readFileSync as readFileSync12 } from "node:fs";
import { homedir as homedir7, tmpdir as tmpdir3 } from "node:os";
import { join as join14 } from "node:path";

// src/bin/hook/antigravity.ts
import { join as join13 } from "node:path";
function getAntigravityHooksPath(homeDir) {
  return join13(homeDir, ".gemini", "config", "hooks.json");
}

// src/bin/doctor/hooks.ts
var COPILOT_PLUGIN_CONFIG_PATH = "copilot-plugin";
var CLAUDE_PLUGIN_LIST_CONFIG_PATH = "claude plugin list";
var CLAUDE_SAFETY_NET_PLUGIN_ID = "safety-net@cc-marketplace";
var CODEX_PLUGIN_LIST_CONFIG_PATH = "codex plugin list";
var CODEX_SAFETY_NET_SOURCE = "https://github.com/kenryu42/cc-safety-net.git";
var GEMINI_EXTENSIONS_LIST_CONFIG_PATH = "gemini extensions list";
var GEMINI_SAFETY_NET_SOURCE = "https://github.com/kenryu42/gemini-safety-net";
var ANTIGRAVITY_HOOK_COMMAND_PATTERN = /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/;
var KIMI_HOOK_COMMAND_PATTERN = /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;
var SELF_TEST_CASES = [
  { command: "git reset --hard", description: "git reset --hard", expectBlocked: true },
  { command: "rm -rf /", description: "rm -rf /", expectBlocked: true },
  { command: "rm -rf ./node_modules", description: "rm in cwd (safe)", expectBlocked: false }
];
var SELF_TEST_CONFIG = { version: 1, rules: [] };
function runSelfTest() {
  const selfTestCwd = join14(tmpdir3(), "cc-safety-net-self-test");
  const results = SELF_TEST_CASES.map((tc) => {
    const result = analyzeCommand(tc.command, {
      cwd: selfTestCwd,
      config: SELF_TEST_CONFIG,
      strict: false,
      paranoidRm: false,
      paranoidInterpreters: false
    });
    const wasBlocked = result !== null;
    const expected = tc.expectBlocked ? "blocked" : "allowed";
    const actual = wasBlocked ? "blocked" : "allowed";
    return {
      command: tc.command,
      description: tc.description,
      expected,
      actual,
      passed: expected === actual,
      reason: result?.reason
    };
  });
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  return { passed, failed, total: results.length, results };
}
function stripJsonComments(content) {
  let result = "";
  let i = 0;
  let inString = false;
  let isEscaped = false;
  let lastCommaIndex = -1;
  while (i < content.length) {
    const char = content[i];
    const next = content[i + 1];
    if (isEscaped) {
      result += char;
      isEscaped = false;
      i++;
      continue;
    }
    if (char === '"' && !inString) {
      inString = true;
      lastCommaIndex = -1;
      result += char;
      i++;
      continue;
    }
    if (char === '"' && inString) {
      inString = false;
      result += char;
      i++;
      continue;
    }
    if (char === "\\" && inString) {
      isEscaped = true;
      result += char;
      i++;
      continue;
    }
    if (inString) {
      result += char;
      i++;
      continue;
    }
    if (char === "/" && next === "/") {
      while (i < content.length && content[i] !== `
`) {
        i++;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      while (i < content.length - 1) {
        if (content[i] === "*" && content[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }
    if (char === ",") {
      lastCommaIndex = result.length;
      result += char;
      i++;
      continue;
    }
    if (char === "}" || char === "]") {
      if (lastCommaIndex !== -1) {
        const between = result.slice(lastCommaIndex + 1);
        if (/^\s*$/.test(between)) {
          result = result.slice(0, lastCommaIndex) + between;
        }
      }
      lastCommaIndex = -1;
      result += char;
      i++;
      continue;
    }
    if (!/\s/.test(char)) {
      lastCommaIndex = -1;
    }
    result += char;
    i++;
  }
  return result;
}
function detectClaudeCode(pluginListOutput) {
  if (!pluginListOutput) {
    return { platform: "claude-code", status: "n/a" };
  }
  const pluginBlock = _findClaudeSafetyNetPluginBlock(pluginListOutput);
  if (!pluginBlock) {
    return { platform: "claude-code", status: "n/a" };
  }
  if (/^\s*Status:\s*.*\bdisabled\b\s*$/im.test(pluginBlock)) {
    return {
      platform: "claude-code",
      status: "disabled",
      method: "plugin list",
      configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH
    };
  }
  if (/^\s*Status:\s*.*\benabled\b\s*$/im.test(pluginBlock)) {
    return {
      platform: "claude-code",
      status: "configured",
      method: "plugin list",
      configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
      selfTest: runSelfTest()
    };
  }
  return {
    platform: "claude-code",
    status: "disabled",
    method: "plugin list",
    configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
    errors: ["Status is not enabled"]
  };
}
function _findClaudeSafetyNetPluginBlock(output) {
  const pluginLinePattern = new RegExp(`^\\s*(?:[^\\w\\s@]+\\s+)?${_escapeRegExp(CLAUDE_SAFETY_NET_PLUGIN_ID)}\\s*$`);
  const pluginStartPattern = /^\s*(?:[^\w\s@]+\s+)?\S+@\S+\s*$/;
  const lines = output.split(`
`);
  const startIndex = lines.findIndex((line) => pluginLinePattern.test(line));
  if (startIndex === -1)
    return;
  const endIndex = lines.findIndex((line, index) => index > startIndex && pluginStartPattern.test(line));
  return lines.slice(startIndex, endIndex === -1 ? undefined : endIndex).join(`
`);
}
function _escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function detectOpenCode(homeDir) {
  const errors = [];
  const configDir = join14(homeDir, ".config", "opencode");
  const candidates = ["opencode.json", "opencode.jsonc"];
  for (const filename of candidates) {
    const configPath = join14(configDir, filename);
    if (existsSync12(configPath)) {
      try {
        const content = readFileSync12(configPath, "utf-8");
        const json = stripJsonComments(content);
        const config = JSON.parse(json);
        const plugins = config.plugin ?? [];
        const hasSafetyNet = plugins.some((p) => p.includes("cc-safety-net"));
        if (hasSafetyNet) {
          return {
            platform: "opencode",
            status: "configured",
            method: "plugin array",
            configPath,
            selfTest: runSelfTest(),
            errors: errors.length > 0 ? errors : undefined
          };
        }
      } catch (e) {
        errors.push(`Failed to parse ${filename}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return {
    platform: "opencode",
    status: "n/a",
    errors: errors.length > 0 ? errors : undefined
  };
}
function detectGeminiCLI(extensionsListOutput) {
  if (!extensionsListOutput) {
    return { platform: "gemini-cli", status: "n/a" };
  }
  const extension = _parseGeminiExtensionsList(extensionsListOutput).find((item) => item.source?.includes(GEMINI_SAFETY_NET_SOURCE));
  if (!extension) {
    return { platform: "gemini-cli", status: "n/a" };
  }
  const effectiveEnabled = extension.enabledWorkspace ?? extension.enabledUser ?? true;
  const errors = effectiveEnabled ? [] : [
    extension.enabledWorkspace === false ? "Enabled (Workspace) is false" : "Enabled (User) is false"
  ];
  if (errors.length > 0) {
    return {
      platform: "gemini-cli",
      status: "disabled",
      method: "extension list",
      configPath: GEMINI_EXTENSIONS_LIST_CONFIG_PATH,
      errors
    };
  }
  return {
    platform: "gemini-cli",
    status: "configured",
    method: "extension list",
    configPath: GEMINI_EXTENSIONS_LIST_CONFIG_PATH,
    selfTest: runSelfTest()
  };
}
function _getKimiConfigPath(homeDir) {
  return join14(process.env.KIMI_CODE_HOME || join14(homeDir, ".kimi-code"), "config.toml");
}
function _findAntigravitySafetyNetHooks(config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    return [];
  return Object.values(config).flatMap((definition) => {
    if (!definition || typeof definition !== "object" || Array.isArray(definition))
      return [];
    const record = definition;
    const preToolUse = record.PreToolUse;
    if (!Array.isArray(preToolUse))
      return [];
    return preToolUse.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return [];
      const hooks = entry.hooks;
      if (!Array.isArray(hooks))
        return [];
      return hooks.flatMap((hook) => {
        if (!hook || typeof hook !== "object" || Array.isArray(hook))
          return [];
        const command2 = hook.command;
        if (typeof command2 !== "string" || !ANTIGRAVITY_HOOK_COMMAND_PATTERN.test(command2)) {
          return [];
        }
        return [{ command: command2, enabled: record.enabled !== false }];
      });
    });
  });
}
function detectAntigravityCli(homeDir) {
  const configPath = getAntigravityHooksPath(homeDir);
  if (!existsSync12(configPath)) {
    return { platform: "antigravity-cli", status: "n/a", configPath };
  }
  let matches;
  try {
    matches = _findAntigravitySafetyNetHooks(JSON.parse(readFileSync12(configPath, "utf-8")));
  } catch (e) {
    return {
      platform: "antigravity-cli",
      status: "n/a",
      configPath,
      errors: [
        `Failed to parse Antigravity hooks config ${configPath}: ${e instanceof Error ? e.message : String(e)}`
      ]
    };
  }
  if (matches.some((match) => match.enabled)) {
    return {
      platform: "antigravity-cli",
      status: "configured",
      method: "hook config",
      configPath,
      selfTest: runSelfTest()
    };
  }
  if (matches.length > 0) {
    return {
      platform: "antigravity-cli",
      status: "disabled",
      method: "hook config",
      configPath
    };
  }
  return { platform: "antigravity-cli", status: "n/a", configPath };
}
function detectKimiCode(homeDir) {
  const configPath = _getKimiConfigPath(homeDir);
  if (!existsSync12(configPath)) {
    return { platform: "kimi-code", status: "n/a", configPath };
  }
  try {
    if (!KIMI_HOOK_COMMAND_PATTERN.test(readFileSync12(configPath, "utf-8"))) {
      return { platform: "kimi-code", status: "n/a", configPath };
    }
  } catch (e) {
    return {
      platform: "kimi-code",
      status: "n/a",
      configPath,
      errors: [`Failed to read ${configPath}: ${e instanceof Error ? e.message : String(e)}`]
    };
  }
  return {
    platform: "kimi-code",
    status: "configured",
    method: "hook config",
    configPath,
    selfTest: runSelfTest()
  };
}
function detectPi(probe) {
  if (!probe || probe.status === "unavailable") {
    return { platform: "pi", status: "n/a" };
  }
  if (probe.status === "error") {
    return {
      platform: "pi",
      status: "n/a",
      method: "pi probe",
      errors: [probe.error ?? "Pi probe failed"]
    };
  }
  if (!probe.installedAndEnabled) {
    return { platform: "pi", status: "n/a", method: "pi probe" };
  }
  const configPaths = probe.matched.map((resource) => resource.path).filter((path) => typeof path === "string");
  return {
    platform: "pi",
    status: "configured",
    method: "pi probe",
    configPath: configPaths[0],
    configPaths: configPaths.length > 0 ? configPaths : undefined,
    selfTest: runSelfTest()
  };
}
function _parseGeminiExtensionsList(output) {
  const blocks = output.split(`
`).reduce((result, line) => {
    if (/^\S/.test(line) || result.length === 0) {
      result.push(line);
      return result;
    }
    const index = result.length - 1;
    result[index] = `${result[index]}
${line}`;
    return result;
  }, []);
  return blocks.map((block) => ({
    source: /^\s*Source:\s*(.+)$/m.exec(block)?.[1],
    enabledUser: _parseGeminiEnabledValue(block, "User"),
    enabledWorkspace: _parseGeminiEnabledValue(block, "Workspace")
  }));
}
function _parseGeminiEnabledValue(block, scope) {
  const match = new RegExp(`^\\s*Enabled \\(${scope}\\):\\s*(true|false)\\s*$`, "im").exec(block);
  if (!match)
    return;
  return match[1] === "true";
}
function detectCodex(pluginListOutput) {
  if (!pluginListOutput) {
    return { platform: "codex", status: "n/a" };
  }
  const pluginLine = pluginListOutput.split(`
`).find((line) => line.includes(CODEX_SAFETY_NET_SOURCE));
  if (!pluginLine) {
    return { platform: "codex", status: "n/a" };
  }
  if (!pluginLine.includes("installed, enabled")) {
    return {
      platform: "codex",
      status: "disabled",
      method: CODEX_PLUGIN_LIST_CONFIG_PATH,
      configPath: CODEX_PLUGIN_LIST_CONFIG_PATH,
      errors: [`Codex plugin line for ${CODEX_SAFETY_NET_SOURCE} must contain installed, enabled.`]
    };
  }
  return {
    platform: "codex",
    status: "configured",
    method: CODEX_PLUGIN_LIST_CONFIG_PATH,
    configPath: CODEX_PLUGIN_LIST_CONFIG_PATH,
    selfTest: runSelfTest()
  };
}
function _isSafetyNetCopilotCommand(command2) {
  if (!command2?.includes("cc-safety-net"))
    return false;
  return /(^|\s)hook\s+(?:[^\s]+\s+)*(--copilot-cli|-cp)(\s|$)/.test(command2);
}
function _parseSemver(version) {
  if (!version)
    return null;
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match)
    return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function _compareSemver(version, threshold) {
  const parsed = _parseSemver(version);
  if (!parsed)
    return null;
  for (let index = 0;index < threshold.length; index++) {
    const left = parsed[index] ?? 0;
    const right = threshold[index] ?? 0;
    if (left > right)
      return 1;
    if (left < right)
      return -1;
  }
  return 0;
}
function _supportsCopilotUserHookFiles(version) {
  const comparison = _compareSemver(version, [0, 0, 422]);
  if (comparison === null)
    return null;
  return comparison >= 0;
}
function _supportsCopilotInlineHooks(version) {
  const comparison = _compareSemver(version, [1, 0, 8]);
  if (comparison === null)
    return null;
  return comparison >= 0;
}
function _getCopilotConfigHome(homeDir) {
  return process.env.COPILOT_HOME || join14(homeDir, ".copilot");
}
function _hasSafetyNetCopilotHook(config) {
  const preToolUseHooks = config.hooks?.preToolUse ?? [];
  return preToolUseHooks.some((hook) => {
    if (hook.type !== "command")
      return false;
    return _isSafetyNetCopilotCommand(hook.command) || _isSafetyNetCopilotCommand(hook.bash) || _isSafetyNetCopilotCommand(hook.powershell);
  });
}
function _readCopilotConfigFile(configPath, errors) {
  try {
    return JSON.parse(stripJsonComments(readFileSync12(configPath, "utf-8")));
  } catch (e) {
    errors?.push(`Failed to parse ${configPath}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
}
function _listJsonFiles(dirPath, errors) {
  try {
    return readdirSync3(dirPath).filter((name) => name.endsWith(".json")).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    errors?.push(`Failed to read ${dirPath}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
function _collectSafetyNetCopilotHookFiles(dirPath, errors) {
  if (!existsSync12(dirPath))
    return [];
  const matches = [];
  for (const filename of _listJsonFiles(dirPath, errors)) {
    const configPath = join14(dirPath, filename);
    const config = _readCopilotConfigFile(configPath, errors);
    if (config && _hasSafetyNetCopilotHook(config)) {
      matches.push(configPath);
    }
  }
  return matches;
}
function _collectCopilotInlineConfig(configPath, errors) {
  if (!existsSync12(configPath))
    return;
  const config = _readCopilotConfigFile(configPath, errors);
  if (!config)
    return;
  return { path: configPath, config };
}
function _warnOnUnsupportedCopilotSource(errors, version, sourceDescription, requiredVersion) {
  if (version) {
    errors.push(`Copilot CLI ${version} does not support ${sourceDescription}; requires ${requiredVersion}+`);
    return;
  }
  errors.push(`Copilot CLI version unavailable; skipping ${sourceDescription} because it requires ${requiredVersion}+`);
}
function _resolveCopilotInlineDisableSource(inlineSources) {
  const precedence = [
    inlineSources.localSettings,
    inlineSources.repoSettings,
    inlineSources.userConfig
  ];
  for (const source of precedence) {
    if (source?.config.disableAllHooks === true)
      return source.path;
    if (source?.config.disableAllHooks === false)
      return;
  }
  return;
}
function _checkCopilotEnabled(homeDir, cwd, copilotCliVersion, errors) {
  const configHome = _getCopilotConfigHome(homeDir);
  const repoHookDir = join14(cwd, ".github", "hooks");
  const userHookDir = join14(configHome, "hooks");
  const repoConfigDir = join14(cwd, ".github", "copilot");
  const inlineSupport = _supportsCopilotInlineHooks(copilotCliVersion);
  const inlineErrors = inlineSupport === true ? errors : undefined;
  const inlineSources = {
    userConfig: _collectCopilotInlineConfig(join14(configHome, "config.json"), inlineErrors),
    repoSettings: _collectCopilotInlineConfig(join14(repoConfigDir, "settings.json"), inlineErrors),
    localSettings: _collectCopilotInlineConfig(join14(repoConfigDir, "settings.local.json"), inlineErrors)
  };
  if (inlineSupport !== false) {
    const disableSource = _resolveCopilotInlineDisableSource(inlineSources);
    if (disableSource) {
      if (inlineSupport === null) {
        errors.push(`Copilot CLI version unavailable; treating disableAllHooks in ${disableSource} as active`);
      }
      return { activeConfigPaths: [], disabledBy: disableSource };
    }
  }
  const repoHookPaths = _collectSafetyNetCopilotHookFiles(repoHookDir, errors);
  const userHookSupport = _supportsCopilotUserHookFiles(copilotCliVersion);
  const userHookErrors = userHookSupport === true ? errors : undefined;
  const userHookFiles = existsSync12(userHookDir) ? _listJsonFiles(userHookDir, userHookErrors) : [];
  const userHookPaths = [];
  for (const filename of userHookFiles) {
    const configPath = join14(userHookDir, filename);
    const config = _readCopilotConfigFile(configPath, userHookErrors);
    if (config && _hasSafetyNetCopilotHook(config)) {
      userHookPaths.push(configPath);
    }
  }
  if (userHookSupport !== true && userHookPaths.length > 0) {
    _warnOnUnsupportedCopilotSource(errors, copilotCliVersion, `user hook files in ${userHookDir}`, "0.0.422");
    userHookPaths.length = 0;
  }
  const inlinePaths = [];
  const inlineSourcesByPrecedence = [
    inlineSources.localSettings,
    inlineSources.repoSettings,
    inlineSources.userConfig
  ];
  for (const source of inlineSourcesByPrecedence) {
    if (!source)
      continue;
    if (!_hasSafetyNetCopilotHook(source.config))
      continue;
    if (inlineSupport === true) {
      inlinePaths.push(source.path);
      continue;
    }
    _warnOnUnsupportedCopilotSource(errors, copilotCliVersion, "inline hook definitions in Copilot config files", "1.0.8");
    break;
  }
  return {
    activeConfigPaths: [
      ...inlinePaths.filter((path) => path.endsWith("settings.local.json")),
      ...inlinePaths.filter((path) => path.endsWith("settings.json")),
      ...repoHookPaths,
      ...inlinePaths.filter((path) => path.endsWith("config.json")),
      ...userHookPaths
    ]
  };
}
function detectAllHooks(cwd, options2) {
  const homeDir = options2?.homeDir ?? homedir7();
  const detectCopilotCLI = () => {
    const errors = [];
    const hooksCheck = _checkCopilotEnabled(homeDir, cwd, options2?.copilotCliVersion, errors);
    if (hooksCheck.disabledBy) {
      return {
        platform: "copilot-cli",
        status: "disabled",
        method: "hook config",
        configPath: hooksCheck.disabledBy,
        configPaths: [hooksCheck.disabledBy],
        errors: errors.length > 0 ? errors : undefined
      };
    }
    if (options2?.copilotPluginInstalled === true || hooksCheck.activeConfigPaths.length > 0) {
      const viaPlugin = options2?.copilotPluginInstalled === true;
      const primaryConfigPath = hooksCheck.activeConfigPaths[0];
      return {
        platform: "copilot-cli",
        status: "configured",
        method: viaPlugin ? "plugin list" : "hook config",
        configPath: primaryConfigPath ?? (viaPlugin ? COPILOT_PLUGIN_CONFIG_PATH : undefined),
        configPaths: hooksCheck.activeConfigPaths.length > 0 ? hooksCheck.activeConfigPaths : undefined,
        selfTest: runSelfTest(),
        errors: errors.length > 0 ? errors : undefined
      };
    }
    return {
      platform: "copilot-cli",
      status: "n/a",
      errors: errors.length > 0 ? errors : undefined
    };
  };
  return doctorIntegrationOrder.map((platform) => {
    switch (platform) {
      case "claude-code":
        return detectClaudeCode(options2?.claudePluginListOutput);
      case "antigravity-cli":
        return detectAntigravityCli(homeDir);
      case "opencode":
        return detectOpenCode(homeDir);
      case "gemini-cli":
        return detectGeminiCLI(options2?.geminiExtensionsListOutput);
      case "copilot-cli":
        return detectCopilotCLI();
      case "kimi-code":
        return detectKimiCode(homeDir);
      case "pi":
        return detectPi(options2?.piSafetyNetProbe);
      case "codex":
        return detectCodex(options2?.codexPluginListOutput);
    }
    return platform;
  });
}

// src/bin/doctor/system-info.ts
import { spawn } from "node:child_process";
import { existsSync as existsSync13 } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir as tmpdir4 } from "node:os";
import { delimiter, extname, join as join15 } from "node:path";
var CURRENT_VERSION = "1.0.6";
var VERSION_FETCH_TIMEOUT_MS = 2000;
var PI_PROBE_TIMEOUT_MS = 5000;
var PI_SENTINEL_COMMAND = "cc-safety-net";
var PI_PROBE_COMMAND = "__cc_safety_net_probe";
var TEST_SPAWN_PLATFORM_ENV = "_CC_SAFETY_NET_TEST_SPAWN_PLATFORM";
var PI_PROBE_UNAVAILABLE = {
  status: "unavailable",
  installedAndEnabled: false,
  matched: []
};
function getPackageVersion() {
  return CURRENT_VERSION;
}
var COPILOT_PLUGIN_ID = "copilot-safety-net";
function getEnvValue(env, name) {
  const direct = env[name];
  if (direct)
    return direct;
  const matchingName = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase() && !!env[key]);
  return matchingName ? env[matchingName] : direct;
}
function getWindowsExecutableExtensions(env) {
  return (getEnvValue(env, "PATHEXT") || ".COM;.EXE;.BAT;.CMD").split(";").filter((extension) => extension.length > 0);
}
function resolveWindowsCommand(command2, env) {
  const candidates = extname(command2) ? [command2] : [
    ...getWindowsExecutableExtensions(env).map((extension) => `${command2}${extension}`),
    command2
  ];
  if (command2.includes("/") || command2.includes("\\")) {
    return candidates.find((candidate) => existsSync13(candidate)) ?? command2;
  }
  return (getEnvValue(env, "PATH") ?? "").split(delimiter).flatMap((dir) => candidates.map((candidate) => join15(dir, candidate))).find((candidate) => existsSync13(candidate)) ?? command2;
}
function quoteWindowsCommandArg(value) {
  if (!/[\s"&|<>^]/.test(value))
    return value;
  return `"${value.replace(/"/g, '""')}"`;
}
function getSpawnCommand(args, env) {
  const [command2, ...rest] = args;
  const platform = env[TEST_SPAWN_PLATFORM_ENV] === "win32" ? "win32" : process.platform;
  if (!command2 || platform !== "win32")
    return { cmd: command2 ?? "", args: rest };
  const resolved = resolveWindowsCommand(command2, env);
  if (!/\.(?:bat|cmd)$/i.test(resolved))
    return { cmd: resolved, args: rest };
  return {
    cmd: getEnvValue(env, "COMSPEC") ?? "cmd.exe",
    args: [
      "/d",
      "/c",
      ["call", quoteWindowsCommandArg(resolved), ...rest.map(quoteWindowsCommandArg)].join(" ")
    ]
  };
}
var defaultVersionFetcher = async (args) => {
  const [cmd, ...rest] = args;
  if (!cmd)
    return null;
  return new Promise((resolve12) => {
    try {
      const spawnCommand = getSpawnCommand([cmd, ...rest], process.env);
      const proc = spawn(spawnCommand.cmd, spawnCommand.args, {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let isSettled = false;
      let output = "";
      let errorOutput = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
      });
      proc.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });
      const finish = (value) => {
        if (isSettled)
          return;
        isSettled = true;
        clearTimeout(timeoutId);
        resolve12(value);
      };
      const timeoutId = setTimeout(() => {
        proc.kill();
        finish(null);
      }, VERSION_FETCH_TIMEOUT_MS);
      proc.on("close", (code) => {
        finish(code === 0 ? output.trim() || errorOutput.trim() || null : null);
      });
      proc.on("error", () => {
        finish(null);
      });
    } catch {
      resolve12(null);
    }
  });
};
var PI_PROBE_EXTENSION = `
import { writeFileSync } from "node:fs";

export default function (pi) {
  pi.registerCommand("${PI_PROBE_COMMAND}", {
    description: "Probe loaded CC Safety Net Pi resources",
    handler: async (args, ctx) => {
      const needle = args.trim();
      const commands = typeof pi.getCommands === "function"
        ? pi.getCommands().map((command) => ({
            kind: "command",
            name: command.name,
            path: command.sourceInfo?.path,
            source: command.sourceInfo?.source,
          }))
        : [];
      const tools = typeof pi.getAllTools === "function"
        ? pi.getAllTools().map((tool) => ({
            kind: "tool",
            name: tool.name,
            path: tool.sourceInfo?.path,
            source: tool.sourceInfo?.source,
          }))
        : [];
      const resources = [...commands, ...tools];
      const matched = resources.filter(
        (resource) => resource.name === needle || resource.path === needle,
      );

      writeFileSync(
        process.env.PI_PROBE_OUT,
        JSON.stringify({
          installedAndEnabled: matched.length > 0,
          matched,
        }),
      );

      ctx.shutdown?.();
    },
  });
}
`.trimStart();
function runCommand(args, options2) {
  const [cmd, ...rest] = args;
  if (!cmd) {
    return Promise.resolve({ code: null, stdout: "", stderr: "", timedOut: false });
  }
  return new Promise((resolve12) => {
    try {
      const env = { ...process.env, ...options2.env ?? {} };
      const spawnCommand = getSpawnCommand([cmd, ...rest], env);
      const proc = spawn(spawnCommand.cmd, spawnCommand.args, {
        cwd: options2.cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let isSettled = false;
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      const finish = (result) => {
        if (isSettled)
          return;
        isSettled = true;
        clearTimeout(timeoutId);
        resolve12(result);
      };
      const timeoutId = setTimeout(() => {
        proc.kill();
        finish({ code: null, stdout, stderr, timedOut: true });
      }, options2.timeoutMs);
      proc.on("close", (code) => {
        finish({ code, stdout, stderr, timedOut: false });
      });
      proc.on("error", (error) => {
        finish({ code: null, stdout, stderr, timedOut: false, error: error.message });
      });
    } catch (error) {
      resolve12({
        code: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
var defaultPiProbeRunner = async (cwd) => {
  const tempDir = await mkdtemp(join15(tmpdir4(), "cc-safety-net-pi-probe-"));
  const probePath = join15(tempDir, "pi-extension-probe.ts");
  const resultPath = join15(tempDir, "result.json");
  const stdoutPath = join15(tempDir, "stdout.jsonl");
  try {
    await writeFile(probePath, PI_PROBE_EXTENSION);
    const result = await runCommand(["pi", "-e", probePath, "--mode", "json", `/${PI_PROBE_COMMAND} ${PI_SENTINEL_COMMAND}`], {
      cwd,
      env: { PI_PROBE_OUT: resultPath },
      timeoutMs: PI_PROBE_TIMEOUT_MS
    });
    await writeFile(stdoutPath, result.stdout);
    if (result.timedOut) {
      return {
        status: "error",
        installedAndEnabled: false,
        matched: [],
        error: "Pi probe timed out"
      };
    }
    if (result.error) {
      return {
        status: "error",
        installedAndEnabled: false,
        matched: [],
        error: `Pi probe failed: ${result.error}`
      };
    }
    if (result.code !== 0) {
      return {
        status: "error",
        installedAndEnabled: false,
        matched: [],
        error: `Pi probe exited with code ${result.code ?? "unknown"}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`
      };
    }
    return parsePiProbeResult(await readFile(resultPath, "utf-8"));
  } catch (error) {
    return {
      status: "error",
      installedAndEnabled: false,
      matched: [],
      error: `Pi probe failed: ${error instanceof Error ? error.message : String(error)}`
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};
function parsePiProbeResult(content) {
  try {
    const parsed = JSON.parse(content);
    if (!isObject(parsed)) {
      return {
        status: "error",
        installedAndEnabled: false,
        matched: [],
        error: "Pi probe result was not an object"
      };
    }
    const matched = Array.isArray(parsed.matched) ? parsed.matched.map(parsePiProbeResource).filter((resource) => resource !== null) : [];
    const installedAndEnabled = parsed.installedAndEnabled === true;
    return {
      status: installedAndEnabled ? "configured" : "not-found",
      installedAndEnabled,
      matched
    };
  } catch (error) {
    return {
      status: "error",
      installedAndEnabled: false,
      matched: [],
      error: `Failed to parse Pi probe result: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
function parsePiProbeResource(value) {
  if (!isObject(value))
    return null;
  if (value.kind !== "command" && value.kind !== "tool")
    return null;
  if (typeof value.name !== "string")
    return null;
  return {
    kind: value.kind,
    name: value.name,
    ...typeof value.path === "string" ? { path: value.path } : {},
    ...typeof value.source === "string" ? { source: value.source } : {}
  };
}
function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function parseVersion(output) {
  if (!output)
    return null;
  const claudeMatch = /Claude Code\s+(\d+\.\d+\.\d+)/i.exec(output);
  if (claudeMatch)
    return claudeMatch[1] ?? null;
  const versionMatch = /v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i.exec(output);
  if (versionMatch)
    return versionMatch[1] ?? null;
  const firstLine = output.split(`
`)[0]?.trim();
  return firstLine || null;
}
function hasCopilotSafetyNetPlugin(output) {
  if (!output)
    return false;
  const pluginPattern = new RegExp(`(^|[^a-z0-9-])${COPILOT_PLUGIN_ID}([^a-z0-9-]|$)`, "m");
  return pluginPattern.test(output);
}
async function getSystemInfo(fetcher = defaultVersionFetcher, options2 = {}) {
  const piRawPromise = fetcher(["pi", "--version"]);
  const piProbeRunner = options2.piProbeRunner ?? defaultPiProbeRunner;
  const shouldRunPiProbe = !!options2.piProbeRunner || fetcher === defaultVersionFetcher;
  const piProbePromise = piRawPromise.then((piRaw2) => {
    if (!piRaw2)
      return PI_PROBE_UNAVAILABLE;
    if (!shouldRunPiProbe)
      return PI_PROBE_UNAVAILABLE;
    return piProbeRunner(options2.cwd ?? process.cwd());
  });
  const fetchCopilotVersion = async () => {
    const binaryVersionPromise = fetcher(["copilot", "--binary-version"]);
    const fallbackVersionPromise = fetcher(["copilot", "--version"]);
    const binaryVersion = await binaryVersionPromise;
    if (binaryVersion) {
      return binaryVersion;
    }
    return fallbackVersionPromise;
  };
  const [
    claudeRaw,
    claudePluginListOutput,
    antigravityRaw,
    openCodeRaw,
    codexRaw,
    codexPluginListOutput,
    geminiRaw,
    geminiExtensionsListOutput,
    copilotRaw,
    kimiRaw,
    piRaw,
    nodeRaw,
    npmRaw,
    bunRaw,
    pluginListRaw,
    piSafetyNetProbe
  ] = await Promise.all([
    fetcher(["claude", "--version"]),
    fetcher(["claude", "plugin", "list"]),
    fetcher(["agy", "--version"]),
    fetcher(["opencode", "--version"]),
    fetcher(["codex", "--version"]),
    fetcher(["codex", "plugin", "list"]),
    fetcher(["gemini", "--version"]),
    fetcher(["gemini", "extensions", "list"]),
    fetchCopilotVersion(),
    fetcher(["kimi", "--version"]),
    piRawPromise,
    fetcher(["node", "--version"]),
    fetcher(["npm", "--version"]),
    fetcher(["bun", "--version"]),
    fetcher(["copilot", "plugin", "list"]),
    piProbePromise
  ]);
  return {
    version: CURRENT_VERSION,
    claudeCodeVersion: parseVersion(claudeRaw),
    claudePluginListOutput,
    antigravityCliVersion: parseVersion(antigravityRaw),
    openCodeVersion: parseVersion(openCodeRaw),
    codexCliVersion: parseVersion(codexRaw),
    codexPluginListOutput,
    geminiCliVersion: parseVersion(geminiRaw),
    geminiExtensionsListOutput,
    copilotCliVersion: parseVersion(copilotRaw),
    kimiCodeVersion: parseVersion(kimiRaw),
    piCliVersion: parseVersion(piRaw),
    nodeVersion: parseVersion(nodeRaw),
    npmVersion: parseVersion(npmRaw),
    bunVersion: parseVersion(bunRaw),
    copilotPluginInstalled: hasCopilotSafetyNetPlugin(pluginListRaw),
    piSafetyNetProbe,
    platform: `${process.platform} ${process.arch}`
  };
}

// src/bin/doctor/updates.ts
function isNewerVersion(latest, current) {
  if (current === "dev")
    return false;
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  const [latestMajor = 0, latestMinor = 0, latestPatch = 0] = latestParts;
  const [currentMajor = 0, currentMinor = 0, currentPatch = 0] = currentParts;
  if (latestMajor !== currentMajor)
    return latestMajor > currentMajor;
  if (latestMinor !== currentMinor)
    return latestMinor > currentMinor;
  return latestPatch > currentPatch;
}
async function checkForUpdates() {
  const currentVersion = getPackageVersion();
  const controller = new AbortController;
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch("https://registry.npmjs.org/cc-safety-net/latest", {
      signal: controller.signal
    });
    if (!res.ok) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        error: `npm registry returned ${res.status}`
      };
    }
    const data = await res.json();
    const updateAvailable = isNewerVersion(data.version, currentVersion);
    return {
      currentVersion,
      latestVersion: data.version,
      updateAvailable
    };
  } catch (e) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      error: e instanceof Error ? e.message : "Network error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

// src/bin/hook/install/banner.ts
import * as readline from "node:readline";

// src/bin/utils/lolcat.ts
var ANSI_RESET2 = "\x1B[0m";
var ANSI_RESET_FOREGROUND = "\x1B[39m";
var DEFAULT_DURATION = 12;
var DEFAULT_FREQUENCY = 0.1;
var DEFAULT_SPEED = 40;
var DEFAULT_SPREAD = 3;
var FRAME_RATE = 30;
var CURSOR_DOWN = (rows) => `\x1B[${rows}B`;
var HIDE_CURSOR = "\x1B[?25l";
var RESTORE_CURSOR = "\x1B8";
var SAVE_CURSOR = "\x1B7";
var SHOW_CURSOR = "\x1B[?25h";
function wait(milliseconds) {
  return new Promise((resolve12) => setTimeout(resolve12, milliseconds));
}
function waitForAnimationFrame(milliseconds, sleep, signal) {
  if (!signal)
    return sleep(milliseconds);
  if (signal.aborted)
    return Promise.resolve();
  return new Promise((resolve12, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      resolve12();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    sleep(milliseconds).then(() => {
      cleanup();
      resolve12();
    }, (error) => {
      cleanup();
      reject(error);
    });
  });
}
function positiveOrDefault(value, fallback) {
  return value && value > 0 ? value : fallback;
}
function byte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
function rainbow(frequency, offset) {
  return {
    blue: byte(Math.sin(frequency * offset + 4 * Math.PI / 3) * 127 + 128),
    green: byte(Math.sin(frequency * offset + 2 * Math.PI / 3) * 127 + 128),
    red: byte(Math.sin(frequency * offset) * 127 + 128)
  };
}
function colorizeCharacter(character, frequency, offset) {
  const color = rainbow(frequency, offset);
  return `\x1B[38;2;${color.red};${color.green};${color.blue}m${character}${ANSI_RESET_FOREGROUND}`;
}
function renderLolcat(text, options2 = {}) {
  if (!text)
    return "";
  const frequency = positiveOrDefault(options2.frequency, DEFAULT_FREQUENCY);
  const seed = options2.seed ?? 0;
  const spread = positiveOrDefault(options2.spread, DEFAULT_SPREAD);
  return `${text.split(`
`).map((line, lineIndex) => Array.from(line).map((character, characterIndex) => colorizeCharacter(character, frequency, seed + lineIndex + characterIndex / spread)).join("")).join(`
`)}${ANSI_RESET2}`;
}
async function writeAnimatedLolcat(text, options2 = {}) {
  if (!text)
    return;
  const output = options2.output ?? process.stdout;
  const sleep = options2.sleep ?? wait;
  const speed = positiveOrDefault(options2.speed, DEFAULT_SPEED);
  const duration = Math.max(1, Math.floor(positiveOrDefault(options2.duration, DEFAULT_DURATION)));
  const spread = positiveOrDefault(options2.spread, DEFAULT_SPREAD);
  const lines = text.split(`
`).map((line) => Array.from(line));
  const width = Math.max(...lines.map((line) => line.length));
  const totalDuration = 1000 * duration * lines.filter((line) => line.length > 0).length / speed;
  const frameCount = width > 0 ? Math.max(1, Math.ceil(totalDuration / (1000 / FRAME_RATE))) : 0;
  const frameDelay = frameCount > 0 ? totalDuration / frameCount : 0;
  const renderFrame = (visibleColumns, seedOffset) => lines.map((line, lineIndex) => [
    RESTORE_CURSOR,
    lineIndex > 0 ? CURSOR_DOWN(lineIndex) : "",
    renderLolcat(line.slice(0, visibleColumns).join(""), {
      frequency: options2.frequency,
      seed: (options2.seed ?? 0) + lineIndex + seedOffset,
      spread
    })
  ].join("")).join("");
  output.write(`${HIDE_CURSOR}${SAVE_CURSOR}`);
  try {
    for (let frameIndex = 1;frameIndex <= frameCount; frameIndex += 1) {
      if (options2.signal?.aborted)
        break;
      const progress = frameIndex / frameCount;
      const easedProgress = (1 - Math.cos(Math.PI * progress)) / 2;
      output.write(renderFrame(Math.max(1, Math.ceil(width * easedProgress)), (1 - easedProgress) * spread * 2));
      await waitForAnimationFrame(frameDelay, sleep, options2.signal);
    }
  } finally {
    output.write(renderFrame(width, 0));
    output.write(RESTORE_CURSOR);
    if (lines.length > 1)
      output.write(CURSOR_DOWN(lines.length - 1));
    output.write(`
${ANSI_RESET2}${SHOW_CURSOR}`);
  }
}

// src/bin/hook/install/banner.ts
var INSTALL_ASCII_ART = [
  "┏━┛┏━┛  ┏━┛┏━┃┏━┛┏━┛━┏┛┃ ┃  ┏━ ┏━┛━┏┛",
  "┃  ┃    ━━┃┏━┃┏━┛┏━┛ ┃ ━┏┛  ┃ ┃┏━┛ ┃ ",
  "━━┛━━┛  ━━┛┛ ┛┛  ━━┛ ┛  ┛   ┛ ┛━━┛ ┛ "
].join(`
`);
function shouldPrintInstallBanner(output) {
  return Boolean(output.isTTY);
}
async function printInstallBanner(options2 = {}) {
  const output = options2.output ?? process.stdout;
  if (!shouldPrintInstallBanner(output))
    return;
  const input = options2.input ?? process.stdin;
  const animationOptions = {
    duration: options2.duration,
    frequency: options2.frequency,
    output,
    seed: options2.seed ?? Math.random() * 8192,
    sleep: options2.sleep,
    speed: options2.speed,
    spread: options2.spread
  };
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    await writeAnimatedLolcat(INSTALL_ASCII_ART, animationOptions);
    return;
  }
  const controller = new AbortController;
  const wasFlowing = input.readableFlowing === true;
  const wasRaw = input.isRaw === true;
  let interrupted = false;
  const onKeyPress = (_inputValue, key) => {
    if (key.ctrl && key.name === "c")
      interrupted = true;
    if (interrupted || key.name === "return" || key.name === "enter")
      controller.abort();
  };
  readline.emitKeypressEvents(input);
  input.on("keypress", onKeyPress);
  input.setRawMode(true);
  input.resume();
  try {
    await writeAnimatedLolcat(INSTALL_ASCII_ART, {
      ...animationOptions,
      signal: controller.signal
    });
  } finally {
    input.off("keypress", onKeyPress);
    input.setRawMode(wasRaw);
    if (!wasFlowing)
      input.pause();
  }
  if (!interrupted)
    return;
  if (options2.onInterrupt) {
    options2.onInterrupt();
    return;
  }
  process.kill(process.pid, "SIGINT");
}

// src/bin/startup/banner.ts
var CLEAR_LINE = "\r\x1B[2K";
var HIDE_CURSOR2 = "\x1B[?25l";
var SHOW_CURSOR2 = "\x1B[?25h";
var SPINNER_DELAY = 100;
var SPINNER_INTERVAL = 80;
var SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
function wait2(milliseconds) {
  return new Promise((resolve12) => setTimeout(resolve12, milliseconds));
}
async function waitForReady(ready, options2) {
  const output = options2.output ?? process.stdout;
  if (!output.isTTY) {
    await ready;
    return;
  }
  const sleep = options2.sleep ?? wait2;
  let settled = false;
  const trackedReady = ready.then((value) => {
    settled = true;
    return value;
  }, (error) => {
    settled = true;
    throw error;
  });
  const readyBeforeSpinner = await Promise.race([
    trackedReady.then(() => true),
    sleep(SPINNER_DELAY).then(() => false)
  ]);
  if (readyBeforeSpinner)
    return;
  output.write(HIDE_CURSOR2);
  try {
    for (let frameIndex = 0;!settled; frameIndex += 1) {
      output.write(`${CLEAR_LINE}${SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]} ${options2.loadingMessage ?? "Loading…"}`);
      await Promise.race([trackedReady, sleep(SPINNER_INTERVAL)]);
    }
    await trackedReady;
  } finally {
    output.write(`${CLEAR_LINE}${SHOW_CURSOR2}`);
  }
}
async function resolveAfterOptionalBanner(showBanner, startWork, printBanner, options2 = {}) {
  const work = startWork();
  if (showBanner)
    await printBanner();
  if (showBanner && work.ready)
    await waitForReady(work.ready, options2);
  return work.finish();
}

// src/bin/doctor/flags.ts
function parseDoctorFlags(args) {
  return {
    json: args.includes("--json"),
    skipUpdateCheck: args.includes("--skip-update-check")
  };
}

// src/bin/doctor/index.ts
async function runDoctor(options2 = {}) {
  const report = await resolveAfterOptionalBanner(!options2.json, () => {
    const reportPromise = collectDoctorReport(options2);
    return {
      ready: reportPromise,
      finish: () => reportPromise
    };
  }, () => printInstallBanner(), { loadingMessage: "Checking system status…" });
  if (options2.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  return doctorHasFailure(report.hooks, {
    userConfig: report.userConfig,
    projectConfig: report.projectConfig
  }) ? 1 : 0;
}
async function collectDoctorReport(options2) {
  const cwd = options2.cwd ?? process.cwd();
  const system = await getSystemInfo(undefined, { cwd });
  const hooks = detectAllHooks(cwd, {
    claudePluginListOutput: system.claudePluginListOutput,
    codexPluginListOutput: system.codexPluginListOutput,
    geminiExtensionsListOutput: system.geminiExtensionsListOutput,
    copilotCliVersion: system.copilotCliVersion,
    copilotPluginInstalled: system.copilotPluginInstalled,
    piSafetyNetProbe: system.piSafetyNetProbe
  });
  const configInfo = getConfigInfo(cwd);
  const environment = getEnvironmentInfo();
  const modes = getCCSafetyNetEnvModes(loadConfig(cwd));
  const activity = getActivitySummary(7);
  const update = options2.skipUpdateCheck ? {
    currentVersion: getPackageVersion(),
    latestVersion: null,
    updateAvailable: false
  } : await checkForUpdates();
  const report = {
    hooks,
    userConfig: configInfo.userConfig,
    projectConfig: configInfo.projectConfig,
    effectiveRules: configInfo.effectiveRules,
    shadowedRules: configInfo.shadowedRules,
    environment,
    effectiveSafety: {
      level: modes.effectiveLevel,
      capabilities: {
        fail_closed: { enabled: modes.strict, sources: modes.sources.failClosed },
        paranoid_rm: { enabled: modes.paranoidRm, sources: modes.sources.paranoidRm },
        paranoid_interpreters: {
          enabled: modes.paranoidInterpreters,
          sources: modes.sources.paranoidInterpreters
        }
      }
    },
    activity,
    update,
    system
  };
  return report;
}
function doctorHasFailure(hooks, configInfo) {
  return hooks.length > 0 && hooks.every((h) => h.status !== "configured") || hooks.some((h) => h.selfTest && h.selfTest.failed > 0) || configInfo.userConfig.exists && !configInfo.userConfig.valid || configInfo.projectConfig.exists && !configInfo.projectConfig.valid;
}
function printReport(report) {
  console.log();
  console.log(formatHooksSection(report.hooks));
  console.log();
  console.log(formatConfigSection(report));
  console.log();
  console.log(formatEnvironmentSection(report.environment));
  console.log();
  console.log(formatEffectiveSafetySection(report));
  console.log();
  console.log(formatActivitySection(report.activity));
  console.log();
  console.log(formatSystemInfoSection(report.system));
  console.log();
  console.log(formatUpdateSection(report.update));
  console.log(formatSummary(report));
}

// src/bin/explain/config.ts
import { existsSync as existsSync14 } from "node:fs";
import { resolve as resolve12 } from "node:path";
function getConfigSource(options2) {
  const projectPath = getProjectRulesConfigPath(options2?.cwd);
  if (existsSync14(projectPath)) {
    const validation = validateRulesConfigFile(projectPath);
    if (validation.errors.length === 0) {
      return { configSource: projectPath, configValid: true };
    }
    return { configSource: projectPath, configValid: false };
  }
  const userPath = options2?.userConfigPath ?? getUserRulesConfigPath(options2);
  if (existsSync14(userPath)) {
    const validation = validateRulesConfigFile(userPath);
    return { configSource: userPath, configValid: validation.errors.length === 0 };
  }
  return { configSource: null, configValid: true };
}
function buildAnalyzeOptions(explainOptions) {
  const cwd = resolve12(explainOptions?.cwd ?? process.cwd());
  const config = explainOptions?.config ?? loadConfig(cwd, { userConfigDir: explainOptions?.userConfigDir });
  const modes = getCCSafetyNetEnvModes(config);
  return {
    cwd,
    effectiveCwd: cwd,
    config,
    strict: explainOptions?.strict ?? modes.strict,
    paranoidRm: modes.paranoidRm,
    paranoidInterpreters: modes.paranoidInterpreters,
    worktreeMode: modes.worktreeMode
  };
}

// src/bin/explain/redact.ts
var ENV_ASSIGNMENT_RE2 = /^[A-Za-z_][A-Za-z0-9_]*=/;
function redactEnvVars(envMap) {
  const result = {};
  for (const key of envMap.keys()) {
    result[key] = "<redacted>";
  }
  return result;
}
function redactEnvAssignmentsInString(str) {
  return str.replace(/\b([A-Za-z_][A-Za-z0-9_]*)=\$\([^)]*\)/g, "$1=<redacted>").replace(/\b([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g, "$1=<redacted>");
}
function redactEnvAssignmentTokens(tokens) {
  return tokens.map((token) => {
    if (ENV_ASSIGNMENT_RE2.test(token)) {
      const eqIdx = token.indexOf("=");
      return `${token.slice(0, eqIdx)}=<redacted>`;
    }
    return token;
  });
}

// src/bin/explain/segment.ts
function isUnparseableCommand(command2, segments2) {
  return segments2.length === 1 && segments2[0]?.length === 1 && segments2[0][0] === command2 && command2.includes(" ");
}
function explainInnerSegments(innerCmd, depth, options2, steps) {
  if (depth + 1 >= MAX_RECURSION_DEPTH) {
    steps.push({
      type: "error",
      message: REASON_RECURSION_LIMIT
    });
    return { reason: REASON_RECURSION_LIMIT };
  }
  const innerSegments = splitShellCommands(innerCmd);
  if (options2.strict && isUnparseableCommand(innerCmd, innerSegments)) {
    steps.push({
      type: "strict-unparseable",
      rawCommand: redactEnvAssignmentsInString(innerCmd),
      reason: REASON_STRICT_UNPARSEABLE
    });
    return { reason: REASON_STRICT_UNPARSEABLE };
  }
  let effectiveCwd = options2.effectiveCwd === undefined ? options2.cwd : options2.effectiveCwd;
  const shellGitContextState = createShellGitContextEnvState(options2.envAssignments);
  for (const segment of innerSegments) {
    if (segment.length === 1 && segment[0]?.includes(" ")) {
      const textReason = dangerousInText(segment[0]);
      if (textReason) {
        steps.push({
          type: "dangerous-text",
          token: redactEnvAssignmentsInString(segment[0]),
          matched: true,
          reason: textReason
        });
        return { reason: textReason };
      }
      steps.push({
        type: "dangerous-text",
        token: redactEnvAssignmentsInString(segment[0]),
        matched: false
      });
      if (segmentChangesCwd(segment)) {
        steps.push({
          type: "cwd-change",
          segment: redactEnvAssignmentsInString(segment.join(" ")),
          effectiveCwdNowUnknown: true
        });
        effectiveCwd = null;
      }
      continue;
    }
    const result = explainSegment(segment, depth + 1, {
      ...options2,
      effectiveCwd,
      envAssignments: getSegmentGitContextEnvAssignments(segment, shellGitContextState)
    }, steps);
    if (result)
      return result;
    if (segmentChangesCwd(segment)) {
      steps.push({
        type: "cwd-change",
        segment: redactEnvAssignmentsInString(segment.join(" ")),
        effectiveCwdNowUnknown: true
      });
      effectiveCwd = null;
    }
    applyShellGitContextEnvSegment(segment, shellGitContextState);
  }
  return null;
}
function explainSegment(tokens, depth, options2, steps) {
  if (depth >= MAX_RECURSION_DEPTH) {
    steps.push({
      type: "error",
      message: REASON_RECURSION_LIMIT
    });
    return { reason: REASON_RECURSION_LIMIT };
  }
  const envResult = stripEnvAssignmentsWithInfo(tokens);
  if (envResult.envAssignments.size > 0) {
    steps.push({
      type: "env-strip",
      input: redactEnvAssignmentTokens(tokens),
      envVars: redactEnvVars(envResult.envAssignments),
      output: envResult.tokens
    });
  }
  const effectiveCwd = options2.effectiveCwd === undefined ? options2.cwd : options2.effectiveCwd;
  const cwdUnknown = effectiveCwd === null;
  const baseCwdForRm = cwdUnknown ? undefined : effectiveCwd ?? options2.cwd;
  const originalCwd = cwdUnknown ? undefined : options2.cwd;
  const wrapperResult = stripWrappersWithInfo(envResult.tokens, baseCwdForRm);
  const removed = envResult.tokens.slice(0, envResult.tokens.length - wrapperResult.tokens.length);
  if (removed.length > 0) {
    steps.push({
      type: "leading-tokens-stripped",
      input: redactEnvAssignmentTokens(envResult.tokens),
      removed: redactEnvAssignmentTokens(removed),
      output: wrapperResult.tokens
    });
  }
  let strippedTokens = wrapperResult.tokens;
  const envAssignments = new Map(options2.envAssignments ?? []);
  for (const [k, v] of envResult.envAssignments) {
    envAssignments.set(k, v);
  }
  for (const [k, v] of wrapperResult.envAssignments) {
    envAssignments.set(k, v);
  }
  const cwdForRm = wrapperResult.cwd === null ? undefined : wrapperResult.cwd ?? baseCwdForRm;
  const nestedEffectiveCwd = wrapperResult.cwd === undefined ? options2.effectiveCwd : wrapperResult.cwd;
  const nestedOptions = {
    ...options2,
    effectiveCwd: nestedEffectiveCwd,
    envAssignments
  };
  if (strippedTokens.length === 0) {
    return null;
  }
  const config = options2.config ?? { version: 1, rules: [] };
  let head = strippedTokens[0];
  if (!head)
    return null;
  const transparentWrapper = unwrapTransparentWrapper(strippedTokens, config);
  if (transparentWrapper) {
    steps.push({
      type: "transparent-wrapper",
      wrapper: transparentWrapper.wrapper,
      output: transparentWrapper.tokens
    });
    strippedTokens = transparentWrapper.tokens;
    head = strippedTokens[0];
    if (!head)
      return null;
  }
  const baseName = head.split("/").pop() ?? head;
  const baseNameLower = baseName.toLowerCase();
  if (isShellWrapperCommand2(head, baseNameLower)) {
    const innerCmd = extractDashCArg(strippedTokens);
    if (innerCmd) {
      const redactedInnerCmd = redactEnvAssignmentsInString(innerCmd);
      steps.push({
        type: "shell-wrapper",
        wrapper: baseNameLower,
        innerCommand: redactedInnerCmd
      });
      steps.push({
        type: "recurse",
        reason: "shell-wrapper",
        innerCommand: redactedInnerCmd,
        depth: depth + 1
      });
      return explainInnerSegments(innerCmd, depth, nestedOptions, steps);
    }
  }
  if (AWK_INTERPRETERS.has(baseNameLower)) {
    const awkReason = analyzeAwkSystemCalls(strippedTokens, (command2) => {
      const nestedResult = explainInnerSegments(command2, depth, nestedOptions, steps);
      return nestedResult?.reason ?? null;
    });
    if (awkReason) {
      steps.push({
        type: "rule-check",
        ruleModule: "awk",
        ruleFunction: "analyzeAwkSystemCalls",
        matched: true,
        reason: awkReason
      });
      return {
        reason: awkReason === REASON_AWK_SYSTEM_DYNAMIC ? REASON_AWK_SYSTEM_DYNAMIC : awkReason
      };
    }
  }
  if (isInterpreterCommand(baseNameLower)) {
    const codeArg = extractInterpreterCodeArg(strippedTokens);
    if (codeArg) {
      const paranoidBlocked = !!options2.paranoidInterpreters;
      const redactedCodeArg = redactEnvAssignmentsInString(codeArg);
      steps.push({
        type: "interpreter",
        interpreter: baseNameLower,
        codeArg: redactedCodeArg,
        paranoidBlocked
      });
      if (paranoidBlocked) {
        return { reason: REASON_INTERPRETER_BLOCKED };
      }
      steps.push({
        type: "recurse",
        reason: "interpreter",
        innerCommand: redactedCodeArg,
        depth: depth + 1
      });
      const nestedResult = explainInnerSegments(codeArg, depth, nestedOptions, steps);
      if (nestedResult)
        return nestedResult;
      if (containsDangerousCode(codeArg)) {
        steps.push({
          type: "dangerous-text",
          token: redactedCodeArg,
          matched: true,
          reason: REASON_INTERPRETER_DANGEROUS
        });
        return { reason: REASON_INTERPRETER_DANGEROUS };
      }
      return null;
    }
  }
  if (baseNameLower === "busybox" && strippedTokens.length > 1) {
    const subcommand = strippedTokens[1] ?? "unknown";
    steps.push({
      type: "busybox",
      subcommand
    });
    const busyboxInnerCmd = strippedTokens.slice(1).join(" ");
    steps.push({
      type: "recurse",
      reason: "busybox",
      innerCommand: redactEnvAssignmentsInString(busyboxInnerCmd),
      depth: depth + 1
    });
    return explainSegment(strippedTokens.slice(1), depth + 1, nestedOptions, steps);
  }
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
  const tmpdirValue = envAssignments.get("TMPDIR") ?? process.env.TMPDIR ?? null;
  const analyzeNested = (cmd, overrides) => {
    const overriddenOptions = {
      ...nestedOptions,
      effectiveCwd: overrides && Object.hasOwn(overrides, "effectiveCwd") ? overrides.effectiveCwd : nestedOptions.effectiveCwd,
      envAssignments: overrides?.envAssignments ?? nestedOptions.envAssignments,
      worktreeMode: overrides?.worktreeMode ?? nestedOptions.worktreeMode
    };
    const result = explainInnerSegments(cmd, depth, overriddenOptions, steps);
    return result ? { id: "", reason: result.reason, intent: "manual_only" } : null;
  };
  const nestedCommandContext = {
    cwd: cwdForRm,
    originalCwd,
    paranoidRm: options2.paranoidRm,
    paranoidInterpreters: options2.paranoidInterpreters,
    allowTmpdirVar,
    envAssignments,
    worktreeMode: options2.worktreeMode,
    config,
    analyzeNested
  };
  const isGit = baseNameLower === "git";
  const isRm = baseName === "rm";
  const isFind = baseName === "find";
  const isXargs = baseName === "xargs";
  const isParallel = baseName === "parallel";
  if (isRm || isXargs || isParallel) {
    steps.push({
      type: "tmpdir-check",
      tmpdirValue,
      isOverriddenToNonTemp: !allowTmpdirVar,
      allowTmpdirVar
    });
  }
  if (isGit) {
    const gitOptions = {
      cwd: cwdForRm,
      envAssignments,
      worktreeMode: options2.worktreeMode
    };
    const relaxation = getGitWorktreeRelaxation(strippedTokens, gitOptions);
    const reason = analyzeGit(strippedTokens, gitOptions);
    steps.push({
      type: "rule-check",
      ruleModule: "git",
      ruleFunction: "analyzeGit",
      matched: !!reason || !!relaxation,
      reason: reason ?? relaxation?.originalReason
    });
    if (relaxation) {
      steps.push({
        type: "worktree-relaxation",
        originalReason: relaxation.originalReason,
        gitCwd: relaxation.gitCwd
      });
    }
    if (reason)
      return { reason };
  }
  if (isRm) {
    const reason = analyzeRm(strippedTokens, {
      cwd: cwdForRm,
      originalCwd,
      paranoid: options2.paranoidRm,
      allowTmpdirVar
    });
    steps.push({
      type: "rule-check",
      ruleModule: "analyze/rm.ts",
      ruleFunction: "analyzeRm",
      matched: !!reason,
      reason: reason ?? undefined
    });
    if (reason)
      return { reason };
  }
  if (isFind) {
    const reason = analyzeFind(strippedTokens);
    steps.push({
      type: "rule-check",
      ruleModule: "analyze/find.ts",
      ruleFunction: "analyzeFind",
      matched: !!reason,
      reason: reason ?? undefined
    });
    if (reason)
      return { reason };
  }
  if (isXargs) {
    const match = analyzeXargs(strippedTokens, nestedCommandContext);
    steps.push({
      type: "rule-check",
      ruleModule: "analyze/xargs.ts",
      ruleFunction: "analyzeXargs",
      matched: !!match,
      reason: match?.reason
    });
    if (match)
      return { reason: match.reason };
  }
  if (isParallel) {
    const match = analyzeParallel(strippedTokens, nestedCommandContext);
    steps.push({
      type: "rule-check",
      ruleModule: "analyze/parallel.ts",
      ruleFunction: "analyzeParallel",
      matched: !!match,
      reason: match?.reason
    });
    if (match)
      return { reason: match.reason };
  }
  const matchedKnown = isGit || isRm || isFind || isXargs || isParallel;
  const tokensScanned = [];
  let fallbackReason = null;
  let fallbackRelaxation = null;
  let embeddedCommandFound;
  if (!matchedKnown && !DISPLAY_COMMANDS.has(normalizeCommandToken(head))) {
    for (let i = 1;i < strippedTokens.length && !fallbackReason; i++) {
      const token = strippedTokens[i];
      if (!token)
        continue;
      tokensScanned.push(token);
      const cmd = normalizeCommandToken(token);
      if (isShellWrapperCommand2(token, cmd)) {
        const innerCmd = extractDashCArg([token, ...strippedTokens.slice(i + 1)]);
        if (innerCmd) {
          embeddedCommandFound = cmd;
          const redactedInnerCmd = redactEnvAssignmentsInString(innerCmd);
          steps.push({
            type: "shell-wrapper",
            wrapper: cmd,
            innerCommand: redactedInnerCmd
          });
          steps.push({
            type: "recurse",
            reason: "shell-wrapper",
            innerCommand: redactedInnerCmd,
            depth: depth + 1
          });
          fallbackReason = explainInnerSegments(innerCmd, depth, nestedOptions, steps)?.reason ?? null;
        }
      }
      if (!fallbackReason && cmd === "rm") {
        embeddedCommandFound = "rm";
        const rmTokens = ["rm", ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeRm(rmTokens, {
          cwd: cwdForRm,
          originalCwd,
          paranoid: options2.paranoidRm,
          allowTmpdirVar
        });
      }
      if (!fallbackReason && cmd === "git") {
        embeddedCommandFound = "git";
        const gitTokens = ["git", ...strippedTokens.slice(i + 1)];
        const gitOptions = {
          cwd: cwdForRm,
          envAssignments,
          worktreeMode: false
        };
        fallbackRelaxation = getGitWorktreeRelaxation(gitTokens, gitOptions);
        fallbackReason = analyzeGit(gitTokens, gitOptions);
      }
      if (!fallbackReason && cmd === "find") {
        embeddedCommandFound = "find";
        const findTokens = ["find", ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeFind(findTokens);
      }
    }
  }
  steps.push({
    type: "fallback-scan",
    tokensScanned,
    embeddedCommandFound
  });
  if (fallbackRelaxation) {
    steps.push({
      type: "worktree-relaxation",
      originalReason: fallbackRelaxation.originalReason,
      gitCwd: fallbackRelaxation.gitCwd
    });
  }
  if (fallbackReason)
    return { reason: fallbackReason };
  const shouldCheckCustomRules = depth === 0 || !matchedKnown;
  const hasRules = options2.config?.rules && options2.config.rules.length > 0;
  if (shouldCheckCustomRules && hasRules && options2.config) {
    const customResult = checkCustomRuleMatch(strippedTokens, options2.config.rules);
    steps.push({
      type: "custom-rules-check",
      rulesChecked: true,
      matched: !!customResult,
      reason: customResult?.reason
    });
    if (customResult)
      return { reason: customResult.reason };
  } else {
    steps.push({
      type: "custom-rules-check",
      rulesChecked: false,
      matched: false
    });
  }
  return null;
}
function isShellWrapperCommand2(head, baseNameLower) {
  return SHELL_WRAPPERS.has(baseNameLower) || head === "$SHELL";
}

// src/bin/explain/analyze.ts
function explainCommand2(command2, options2) {
  const trace = { steps: [], segments: [] };
  const analyzeOpts = buildAnalyzeOptions(options2);
  const effectiveLevel = getCCSafetyNetEnvModes(analyzeOpts.config).effectiveLevel;
  const { configSource, configValid } = getConfigSource({
    cwd: options2?.cwd,
    userConfigDir: options2?.userConfigDir
  });
  if (!command2 || !command2.trim()) {
    trace.steps.push({ type: "error", message: "No command provided" });
    return {
      trace,
      result: "allowed",
      configSource,
      configValid,
      effectiveLevel
    };
  }
  const segments2 = splitShellCommands(command2);
  const redactedInput = redactEnvAssignmentsInString(command2);
  const redactedSegments = splitShellCommands(redactedInput).map((seg) => redactEnvAssignmentTokens(seg));
  trace.steps.push({
    type: "parse",
    input: redactedInput,
    segments: redactedSegments
  });
  if (analyzeOpts.strict && isUnparseableCommand(command2, segments2)) {
    trace.steps.push({
      type: "strict-unparseable",
      rawCommand: redactedInput,
      reason: REASON_STRICT_UNPARSEABLE
    });
    return {
      trace,
      result: "blocked",
      reason: REASON_STRICT_UNPARSEABLE,
      segment: redactEnvAssignmentsInString(command2),
      configSource,
      configValid,
      effectiveLevel
    };
  }
  let blocked = false;
  let blockReason;
  let blockSegment;
  let effectiveCwd = analyzeOpts.effectiveCwd;
  const shellGitContextState = createShellGitContextEnvState(analyzeOpts.envAssignments);
  for (let i = 0;i < segments2.length; i++) {
    const segment = segments2[i];
    if (!segment)
      continue;
    const segmentSteps = [];
    if (blocked) {
      segmentSteps.push({
        type: "segment-skipped",
        index: i,
        reason: "prior-segment-blocked"
      });
      trace.segments.push({ index: i, steps: segmentSteps });
      continue;
    }
    if (segment.length === 1 && segment[0]?.includes(" ")) {
      const textReason = dangerousInText(segment[0]);
      if (textReason) {
        segmentSteps.push({
          type: "dangerous-text",
          token: redactEnvAssignmentsInString(segment[0]),
          matched: true,
          reason: textReason
        });
        trace.segments.push({ index: i, steps: segmentSteps });
        blocked = true;
        blockReason = textReason;
        blockSegment = redactEnvAssignmentsInString(segment.join(" "));
        continue;
      }
      segmentSteps.push({
        type: "dangerous-text",
        token: redactEnvAssignmentsInString(segment[0]),
        matched: false
      });
      const nextCwd2 = resolveCwdAfterSegment(segment, effectiveCwd);
      if (nextCwd2 !== undefined) {
        if (nextCwd2 !== null) {
          effectiveCwd = nextCwd2;
          trace.segments.push({ index: i, steps: segmentSteps });
          continue;
        }
        segmentSteps.push(cwdChangeStep(segment));
        effectiveCwd = null;
      }
      trace.segments.push({ index: i, steps: segmentSteps });
      continue;
    }
    const result = explainSegment(segment, 0, {
      ...analyzeOpts,
      effectiveCwd,
      envAssignments: getSegmentGitContextEnvAssignments(segment, shellGitContextState)
    }, segmentSteps);
    if (result) {
      blocked = true;
      blockReason = result.reason;
      blockSegment = redactEnvAssignmentsInString(segment.join(" "));
    }
    const nextCwd = resolveCwdAfterSegment(segment, effectiveCwd);
    if (nextCwd !== undefined) {
      if (nextCwd !== null) {
        effectiveCwd = nextCwd;
        applyShellGitContextEnvSegment(segment, shellGitContextState);
        trace.segments.push({ index: i, steps: segmentSteps });
        continue;
      }
      segmentSteps.push(cwdChangeStep(segment));
      effectiveCwd = null;
    }
    applyShellGitContextEnvSegment(segment, shellGitContextState);
    trace.segments.push({ index: i, steps: segmentSteps });
  }
  if (!blocked && !analyzeOpts.config?.failClosedReason && shouldAnalyzePowerShellRemoveItem(command2)) {
    const match = filterDestructiveCommandMatch(analyzePowerShellRemoveItemMatch(command2, {
      cwd: analyzeOpts.effectiveCwd ?? analyzeOpts.cwd,
      originalCwd: analyzeOpts.cwd,
      paranoid: analyzeOpts.paranoidRm,
      allowTmpdirVar: analyzeOpts.allowTmpdirVar
    }), analyzeOpts.config);
    const step = {
      type: "rule-check",
      ruleModule: "analyze/powershell/remove-item.ts",
      ruleFunction: "analyzePowerShellRemoveItemMatch",
      matched: !!match,
      reason: match?.reason
    };
    const lastSegment = trace.segments[trace.segments.length - 1];
    if (lastSegment) {
      lastSegment.steps.push(step);
    } else {
      trace.segments.push({ index: 0, steps: [step] });
    }
    if (match) {
      blocked = true;
      blockReason = match.reason;
      blockSegment = redactEnvAssignmentsInString(command2);
    }
  }
  return {
    trace,
    result: blocked ? "blocked" : "allowed",
    reason: blockReason,
    segment: blockSegment,
    customRule: getCustomRuleMetadata(blockReason, options2, analyzeOpts.cwd ?? process.cwd()),
    configSource,
    configValid,
    effectiveLevel
  };
}
function cwdChangeStep(segment) {
  return {
    type: "cwd-change",
    segment: redactEnvAssignmentsInString(segment.join(" ")),
    effectiveCwdNowUnknown: true
  };
}
function getCustomRuleMetadata(reason, options2, cwd) {
  const id = reason?.match(/^\[([^\]]+)]/)?.[1];
  if (!id)
    return;
  if (options2?.config) {
    return options2.config.rules.some((rule) => rule.name === id) ? { id } : undefined;
  }
  const policy = loadRulesPolicy({ cwd, userConfigDir: options2?.userConfigDir });
  if (!policy.rules.some((rule) => rule.name === id))
    return;
  const rulebook = policy.rulebooks.find((item) => item.rules.includes(id));
  const override = {
    ...policy.userConfig?.overrides ?? {},
    ...policy.projectConfig?.overrides ?? {}
  }[id];
  return {
    id,
    ...rulebook ? {
      rulebook: { name: rulebook.name, version: rulebook.version },
      source: rulebook.spec
    } : {},
    ...override && typeof override === "object" ? { override: { type: "reason", reason: override.reason } } : {}
  };
}
// src/bin/explain/flags.ts
function parseExplainFlags(args) {
  let json = false;
  let cwd;
  const remaining = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      i++;
      continue;
    }
    if (arg === "--") {
      remaining.push(...args.slice(i + 1));
      break;
    }
    if (!arg?.startsWith("--")) {
      remaining.push(...args.slice(i));
      break;
    }
    if (arg === "--json") {
      json = true;
      i++;
    } else if (arg === "--cwd") {
      i++;
      if (i >= args.length || args[i]?.startsWith("--")) {
        console.error("Error: --cwd requires a path");
        return null;
      }
      cwd = args[i];
      i++;
    } else {
      remaining.push(...args.slice(i));
      break;
    }
  }
  const command2 = remaining.length === 1 ? remaining[0] : $quote(remaining);
  if (!command2) {
    console.error("Error: No command provided");
    console.error("Usage: cc-safety-net explain [--json] [--cwd <path>] <command>");
    return null;
  }
  return { json, cwd, command: command2 };
}
// src/bin/explain/format-helpers.ts
function getBoxChars(asciiOnly) {
  if (asciiOnly) {
    return {
      dh: "=",
      dv: "|",
      dtl: "+",
      dtr: "+",
      dbl: "+",
      dbr: "+",
      h: "-",
      v: "|",
      tl: "+",
      tr: "+",
      bl: "+",
      br: "+",
      sh: "="
    };
  }
  return {
    dh: "═",
    dv: "║",
    dtl: "╔",
    dtr: "╗",
    dbl: "╚",
    dbr: "╝",
    h: "─",
    v: "│",
    tl: "┌",
    tr: "┐",
    bl: "└",
    br: "┘",
    sh: "━"
  };
}
function formatHeader(box, width) {
  const title = "  Command Analysis";
  const padding = width - title.length;
  return [
    `${box.dtl}${box.dh.repeat(width)}${box.dtr}`,
    `${box.dv}${title}${" ".repeat(padding)}${box.dv}`,
    `${box.dbl}${box.dh.repeat(width)}${box.dbr}`
  ];
}
function formatTokenArray(tokens) {
  return JSON.stringify(tokens);
}
function formatColoredTokenArray(tokens, seed = 0) {
  const coloredTokens = tokens.map((token, index) => colorizeToken(token, index, seed));
  return `[${coloredTokens.join(",")}]`;
}
function wrapReason(reason, indent, maxWidth = 70) {
  const words = reason.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current)
    lines.push(current);
  return lines.map((line, i) => i === 0 ? line : `${indent}${line}`);
}
function formatStepStyleD(step, stepNum, box) {
  const lines = [];
  switch (step.type) {
    case "parse":
      return null;
    case "env-strip": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Strip environment variables`);
      const envKeys = Object.keys(step.envVars);
      lines.push(`  Removed: ${envKeys.map((k) => `${k}=<redacted>`).join(", ")}`);
      lines.push(`  Tokens:  ${formatTokenArray(step.output)}`);
      return { lines, incrementStep: true };
    }
    case "leading-tokens-stripped": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Strip wrappers`);
      lines.push(`  Removed: ${step.removed.join(", ")}`);
      lines.push(`  Tokens:  ${formatTokenArray(step.output)}`);
      return { lines, incrementStep: true };
    }
    case "shell-wrapper": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Detect shell wrapper`);
      lines.push(`  Wrapper: ${step.wrapper} -c`);
      lines.push(`  Inner:   ${step.innerCommand}`);
      return { lines, incrementStep: true };
    }
    case "interpreter": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Detect interpreter`);
      lines.push(`  Interpreter: ${step.interpreter}`);
      lines.push(`  Code:        ${step.codeArg}`);
      if (step.paranoidBlocked) {
        lines.push(`  Result:      ✗ BLOCKED (paranoid mode)`);
      }
      return { lines, incrementStep: true };
    }
    case "busybox": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Busybox wrapper`);
      lines.push(`  Subcommand: ${step.subcommand}`);
      return { lines, incrementStep: true };
    }
    case "transparent-wrapper": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Transparent wrapper`);
      lines.push(`  Wrapper: ${step.wrapper}`);
      lines.push(`  Tokens:  ${formatTokenArray(step.output)}`);
      return { lines, incrementStep: true };
    }
    case "recurse":
      return { lines: [], incrementStep: false };
    case "rule-check": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Match rules`);
      const ruleRef = `${step.ruleModule}:${step.ruleFunction}()`;
      lines.push(`  Rule:   ${ruleRef}`);
      if (step.matched) {
        lines.push(`  Result: MATCHED`);
      } else {
        lines.push(`  Result: No match`);
      }
      return { lines, incrementStep: true };
    }
    case "worktree-relaxation": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Worktree relaxation`);
      lines.push(`  Mode:   ${ENV_FLAGS.worktree.name}`);
      lines.push(`  Git cwd: ${step.gitCwd}`);
      lines.push(`  Result: Allowed local discard in linked worktree`);
      return { lines, incrementStep: true };
    }
    case "tmpdir-check":
      return null;
    case "fallback-scan": {
      if (step.embeddedCommandFound) {
        lines.push("");
        lines.push(`STEP ${stepNum} ${box.h} Fallback scan`);
        lines.push(`  Found: ${step.embeddedCommandFound}`);
        return { lines, incrementStep: true };
      }
      return null;
    }
    case "custom-rules-check": {
      if (step.rulesChecked) {
        lines.push("");
        lines.push(`STEP ${stepNum} ${box.h} Custom rules`);
        if (step.matched) {
          lines.push(`  Result: MATCHED`);
        } else {
          lines.push(`  Result: No match`);
        }
        return { lines, incrementStep: true };
      }
      return null;
    }
    case "cwd-change":
      return null;
    case "dangerous-text": {
      if (step.matched) {
        lines.push("");
        lines.push(`STEP ${stepNum} ${box.h} Dangerous text check`);
        lines.push(`  Token:  ${step.token}`);
        lines.push(`  Result: MATCHED`);
        return { lines, incrementStep: true };
      }
      return null;
    }
    case "strict-unparseable": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Strict mode check`);
      lines.push(`  Command: ${step.rawCommand}`);
      lines.push(`  Result:  ✗ UNPARSEABLE`);
      return { lines, incrementStep: true };
    }
    case "segment-skipped":
      return null;
    case "error": {
      lines.push("");
      lines.push(`ERROR: ${step.message}`);
      return { lines, incrementStep: false };
    }
    default:
      return null;
  }
}

// src/bin/explain/format.ts
function formatTraceHuman(result, options2) {
  const box = getBoxChars(options2?.asciiOnly ?? false);
  const width = 58;
  const lines = [];
  let stepNum = 1;
  lines.push(...formatHeader(box, width));
  lines.push("");
  const errorStep = result.trace.steps.find((s) => s.type === "error");
  if (errorStep && errorStep.type === "error") {
    lines.push("ERROR");
    lines.push(`  ${errorStep.message}`);
    lines.push("");
    lines.push("RESULT");
    lines.push(`  Status: ${result.result === "blocked" ? colors.red("BLOCKED") : colors.green("ALLOWED")}`);
    lines.push("");
    lines.push("CONFIG");
    const configPath2 = result.configSource ?? "none";
    lines.push(`  Path: ${configPath2}`);
    return lines.join(`
`);
  }
  const parseStep = result.trace.steps.find((s) => s.type === "parse");
  if (parseStep && parseStep.type === "parse") {
    lines.push("INPUT");
    lines.push(`  ${parseStep.input}`);
    lines.push("");
    lines.push(`STEP ${stepNum} ${box.h} Split shell commands`);
    stepNum++;
    for (let i = 0;i < parseStep.segments.length; i++) {
      const seg = parseStep.segments[i];
      if (seg) {
        const seed = Math.random();
        lines.push(`  Segment ${i + 1}: ${formatColoredTokenArray(seg, seed)}`);
      }
    }
  }
  const segments2 = result.trace.segments;
  const hasMultipleSegments = segments2.length > 1;
  for (const seg of segments2) {
    if (hasMultipleSegments) {
      lines.push("");
      let segCommand = "";
      if (parseStep && parseStep.type === "parse") {
        const tokens = parseStep.segments[seg.index];
        if (tokens) {
          segCommand = tokens.join(" ");
        }
      }
      const maxLabelLen = width - 4;
      let displayCommand = segCommand;
      const baseLabel = ` Segment ${seg.index + 1}: `;
      const suffix = " ";
      if (segCommand) {
        const totalLen = baseLabel.length + segCommand.length + suffix.length;
        if (totalLen > maxLabelLen) {
          const availableForCmd = maxLabelLen - baseLabel.length - suffix.length;
          displayCommand = `${segCommand.substring(0, availableForCmd - 1)}…`;
        }
      }
      const labelContent = segCommand ? `${baseLabel}${displayCommand}${suffix}` : ` Segment ${seg.index + 1} `;
      const coloredContent = segCommand ? `${baseLabel}${colors.cyan(displayCommand)}${suffix}` : labelContent;
      const segLineLen = width - labelContent.length;
      const leftLen = Math.floor(segLineLen / 2);
      const rightLen = segLineLen - leftLen;
      lines.push(`${box.sh.repeat(leftLen)}${coloredContent}${box.sh.repeat(rightLen)}`);
    }
    const skippedStep = seg.steps.find((s) => s.type === "segment-skipped");
    if (skippedStep) {
      lines.push("");
      lines.push("  (skipped — prior segment blocked)");
      continue;
    }
    let inRecursion = false;
    let hasVisibleSteps = false;
    for (const step of seg.steps) {
      const formattedStep = formatStepStyleD(step, stepNum, box);
      if (formattedStep) {
        hasVisibleSteps = true;
        if (step.type === "recurse") {
          lines.push("");
          const recurseLabel = " RECURSING ";
          const recurseLineLen = width - recurseLabel.length - 4;
          lines.push(`  ${box.tl}${box.h}${recurseLabel}${box.h.repeat(recurseLineLen)}`);
          lines.push(`  ${box.v}`);
          inRecursion = true;
          continue;
        }
        for (const line of formattedStep.lines) {
          if (inRecursion) {
            lines.push(`  ${box.v} ${line}`);
          } else {
            lines.push(line);
          }
        }
        if (formattedStep.incrementStep) {
          stepNum++;
        }
      }
    }
    if (inRecursion) {
      lines.push(`  ${box.v}`);
      lines.push(`  ${box.bl}${box.h.repeat(width - 2)}`);
      inRecursion = false;
    }
    if (!hasVisibleSteps) {
      lines.push("");
      lines.push(`  ${colors.green("✓")} Allowed (no matching rules)`);
    }
  }
  lines.push("");
  lines.push("RESULT");
  if (result.result === "blocked") {
    lines.push(`  Status: ${colors.red("BLOCKED")}`);
    if (result.customRule) {
      lines.push(`  Rule: ${result.customRule.id}`);
      if (result.customRule.rulebook) {
        lines.push(`  Rulebook: ${result.customRule.rulebook.name} ${result.customRule.rulebook.version}`);
      }
      if (result.customRule.source) {
        lines.push(`  Source: ${result.customRule.source}`);
      }
      if (result.customRule.override) {
        lines.push(`  Override: reason ${result.customRule.override.reason}`);
      }
    }
    if (result.reason) {
      const reasonLines = wrapReason(result.reason, "          ");
      lines.push(`  Reason: ${reasonLines[0]}`);
      for (let i = 1;i < reasonLines.length; i++) {
        lines.push(reasonLines[i] ?? "");
      }
    }
  } else {
    lines.push(`  Status: ${colors.green("ALLOWED")}`);
  }
  lines.push("");
  lines.push("CONFIG");
  const configPath = result.configSource ?? "none";
  const configStatus = result.configValid ? "" : " (invalid)";
  lines.push(`  Path: ${configPath}${configStatus}`);
  return lines.join(`
`);
}
function formatTraceJson(result) {
  return JSON.stringify(result, null, 2);
}
// src/bin/gui/index.ts
import { spawn as spawn2 } from "node:child_process";
import { randomBytes as randomBytes2 } from "node:crypto";
import { createServer } from "node:http";

// src/bin/gui/custom.css
var custom_default = `/* cc-safety-net-gui-custom-css */
:root {
  color-scheme: light dark;

  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --bg: light-dark(#f3f4f6, #0c0e11);
  --surface: light-dark(#ffffff, #16191d);
  --surface-2: light-dark(#f6f7f9, #1c2025);
  --field-bg: light-dark(#ffffff, #101317);

  --ink: light-dark(#171a1f, #e7eaed);
  --muted: light-dark(#5b626c, #99a1ac);
  --meta: light-dark(#6b7280, #838b95);

  --border: light-dark(#e3e6ea, #292d33);
  --border-strong: light-dark(#cfd4da, #363b42);

  --switch-track: light-dark(#c2c8d0, #3a3f47);
  --switch-track-hover: light-dark(#aab1bb, #474d56);
  --switch-knob: #ffffff;

  --accent: light-dark(#166534, #3fb950);
  --safe: #14532d;
  --safe-hover: #0f3d20;
  --danger: #7f1d1d;
  --danger-hover: #641414;

  --star: light-dark(#b7791f, #f2c94c);

  --ok-fg: light-dark(#15803d, #4ade80);
  --ok-bg: light-dark(#edfaf1, #10251a);
  --ok-border: light-dark(#b7e4c7, #1f5133);

  --err-fg: light-dark(#b42318, #ff8078);
  --err-bg: light-dark(#fef2f1, #2b1512);
  --err-border: light-dark(#f2c9c4, #5c2620);

  --master: light-dark(#1d4ed8, #4c8dff);
  --master-fg: light-dark(#1e40af, #9ec3ff);
  --master-bg: light-dark(#eef4fe, #101a2b);
  --master-border: light-dark(#c5d6f6, #23446e);

  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;

  font-family: var(--font-sans);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-size: 13px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

.appbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.appbar-inner {
  max-width: 1040px;
  margin: 0 auto;
  padding: 12px 28px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.titlewrap {
  flex: 1 1 300px;
  min-width: 0;
}

h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

#policy-path {
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--meta);
  word-break: break-all;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: none;
}

.app-status {
  flex: 1 0 100%;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  text-align: left;
  white-space: nowrap;
}

.app-status.ok {
  color: var(--ok-fg);
  border-color: var(--ok-border);
  background: var(--ok-bg);
}

.app-status.error {
  color: var(--err-fg);
  border-color: var(--err-border);
  background: var(--err-bg);
}

.app-status.dirty {
  color: var(--ink);
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.appbar-search {
  display: flex;
  align-items: center;
  flex: 1 1 240px;
  min-width: 180px;
  max-width: 380px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

button {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 8px 14px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

button:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--muted);
}

button:disabled {
  opacity: 0.6;
  cursor: progress;
}

button.primary {
  background: var(--safe);
  border-color: var(--safe);
  color: #fff;
}

button.primary:hover:not(:disabled) {
  background: var(--safe-hover);
  border-color: var(--safe-hover);
}

button.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

button.danger:hover:not(:disabled) {
  background: var(--danger-hover);
  border-color: var(--danger-hover);
}

#theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
}

#theme-toggle:hover {
  color: var(--ink);
}

#theme-toggle svg {
  width: 15px;
  height: 15px;
}

button.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--muted);
}

button.icon-button:hover:not(:disabled) {
  color: var(--ink);
}

button.icon-button.copied {
  color: var(--ok-fg);
}

button.icon-button.copied:hover:not(:disabled) {
  color: var(--ok-fg);
}

button.icon-button svg {
  width: 16px;
  height: 16px;
}

:where(button, input, textarea):focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

main {
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 28px 48px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.status {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.status:empty {
  display: none;
}

.status.ok {
  color: var(--ok-fg);
  background: var(--ok-bg);
  border-color: var(--ok-border);
}

.status.error {
  color: var(--err-fg);
  background: var(--err-bg);
  border-color: var(--err-border);
}

.recovery {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid var(--err-border);
  border-radius: var(--radius);
  background: var(--surface);
}

.recovery[hidden] {
  display: none;
}

.recovery strong {
  display: block;
  font-size: 13px;
}

.recovery p {
  margin: 4px 0 0;
}

.muted {
  color: var(--muted);
  line-height: 1.45;
}

.confirm-dialog {
  width: min(420px, calc(100vw - 32px));
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
}

.confirm-dialog::backdrop {
  background: rgb(0 0 0 / 48%);
}

.confirm-dialog form {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.confirm-dialog h2 {
  margin: 0;
}

.confirm-dialog p {
  margin: 0;
}

.dialog-detail {
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  overflow-wrap: anywhere;
}

.dialog-detail code {
  font-family: var(--font-mono);
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.panel-title {
  min-width: 0;
}

.raw-json-head {
  flex-wrap: nowrap;
}

.raw-json-head .panel-title {
  flex: 1 1 auto;
}

.raw-json-head #raw-copy {
  flex: none;
}

.panel-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: -4px 0;
  padding: 4px 6px 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
}

.panel-toggle:hover {
  background: transparent;
  color: var(--ink);
}

.panel-chevron {
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform 0.15s ease;
}

.panel-toggle[aria-expanded="false"] .panel-chevron {
  transform: rotate(-45deg);
}

h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.panel-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}

label.row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

label.row:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

label.row.row-disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

label.row.row-disabled:hover {
  border-color: var(--border);
  background: var(--surface);
}

label.row input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  margin: 1px 0 0;
  width: 34px;
  height: 20px;
  flex: none;
  border: 1px solid var(--switch-track);
  border-radius: 999px;
  background: var(--switch-track);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;
}

label.row input[type="checkbox"]::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--switch-knob);
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
  transition: transform 0.18s ease;
}

label.row input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}

label.row input[type="checkbox"]:checked::before {
  transform: translateX(14px);
}

label.row:hover input[type="checkbox"]:not(:checked) {
  border-color: var(--switch-track-hover);
  background: var(--switch-track-hover);
}

label.row.safety-override-row {
  display: grid;
  gap: 8px;
}

label.row.safety-override-row select {
  width: 100%;
}

label.row span {
  display: block;
  min-width: 0;
}

label.row strong {
  font-weight: 650;
  font-size: 13px;
}

label.row .rule-id {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
  word-break: break-all;
}

label.row small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  line-height: 1.45;
}

#destructive-command > label.row {
  margin-bottom: 16px;
}

label.row.master {
  align-items: center;
  padding: 12px 14px;
  border-color: var(--err-border);
  background: color-mix(in srgb, var(--err-bg) 60%, var(--surface));
}

label.row.master:hover {
  border-color: color-mix(in srgb, var(--err-fg) 34%, var(--err-border));
  background: var(--err-bg);
}

label.row.master:has(input:checked) {
  border-color: var(--master-border);
  background: color-mix(in srgb, var(--master-bg) 72%, var(--surface));
}

label.row.master:has(input:checked):hover {
  border-color: color-mix(in srgb, var(--master) 42%, var(--master-border));
  background: var(--master-bg);
}

label.row.master strong {
  font-size: 14px;
}

label.row.master input[type="checkbox"] {
  margin: 0;
  width: 44px;
  height: 24px;
}

label.row.master input[type="checkbox"]:checked {
  background: var(--master);
  border-color: var(--master);
}

label.row.master input[type="checkbox"]::before {
  width: 18px;
  height: 18px;
}

label.row.master input[type="checkbox"]:checked::before {
  transform: translateX(20px);
}

.master-badge {
  flex: none;
  margin-left: auto;
  padding: 2px 9px;
  border: 1px solid var(--err-border);
  border-radius: 999px;
  background: var(--err-bg);
  color: var(--err-fg);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.master-badge::before {
  content: "Off";
}

label.row.master:has(input:checked) .master-badge {
  border-color: var(--master-border);
  background: var(--master-bg);
  color: var(--master-fg);
}

label.row.master:has(input:checked) .master-badge::before {
  content: "On";
}

.state-active {
  color: var(--ok-fg);
  font-weight: 700;
}

.state-disabled {
  color: var(--err-fg);
  font-weight: 700;
}

.destructive-command-group + .destructive-command-group {
  margin-top: 24px;
}

.destructive-command-group h3 {
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.empty {
  margin: 0;
  padding: 16px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--muted);
  text-align: center;
}

#secret {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 4px;
}

.field-toggle .panel-toggle {
  justify-self: start;
  margin: -2px 0;
  padding: 2px 6px 2px 0;
  font-weight: 650;
}

#safety-level + .field,
.foldable-field-content + .field {
  margin-top: 14px;
}

#safety-overrides,
#workflow {
  margin-top: 4px;
}

.foldable-field-content {
  display: grid;
  gap: 4px;
}

.foldable-field-content > p {
  margin: 0;
  font-size: 12px;
}

.field > span {
  font-size: 13px;
  font-weight: 650;
}

.field small {
  color: var(--muted);
  font-weight: 400;
  line-height: 1.45;
}

input[type="search"],
input[type="text"],
textarea {
  width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 9px 11px;
  background: var(--field-bg);
  color: var(--ink);
  font: inherit;
  transition: border-color 0.15s ease;
}

input[type="search"]:hover,
input[type="text"]:hover,
textarea:hover {
  border-color: var(--muted);
}

input[type="text"]:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.deny-paths-add {
  display: flex;
  gap: 8px;
}

.deny-paths-add input[type="text"] {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.deny-paths-add button {
  flex: none;
  align-self: center;
}

.deny-paths-hint {
  margin: -6px 0 0;
  color: var(--err-fg);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.deny-paths-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.deny-path-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.deny-path-item code {
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}

.deny-path-item button:hover:not(:disabled) {
  color: var(--err-fg);
  border-color: var(--err-border);
  background: var(--err-bg);
}

.deny-path-item.row-disabled {
  opacity: 0.62;
}

.deny-path-item.row-disabled button {
  cursor: not-allowed;
}

.deny-path-item button {
  flex: none;
}

textarea {
  min-height: 96px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
}

#raw {
  min-height: 280px;
}

.star-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 0 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.star-pitch {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--ink);
  font-size: 12.5px;
  line-height: 1.45;
}

.star-pitch strong {
  font-variant-numeric: tabular-nums;
}

.star-mechanism {
  display: block;
  margin-top: 2px;
  color: var(--meta);
  font-size: 11.5px;
}

#star-slot {
  display: inline-flex;
  flex: none;
}

.star-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: none;
  white-space: nowrap;
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.star-cta:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--star) 45%, var(--border-strong));
  background: var(--surface-2);
  color: var(--ink);
}

.star-cta:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

.star-icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
  color: var(--star);
}

.star-icon svg {
  width: 15px;
  height: 15px;
}

.star-count {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  border-left: 1px solid var(--border-strong);
  padding-left: 8px;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.star-cta.starred:disabled {
  opacity: 1;
  cursor: default;
}

.page-footer {
  max-width: 1040px;
  margin: 0 auto;
  padding: 0 28px 28px;
  display: flex;
  justify-content: center;
  gap: 18px;
  color: var(--meta);
  font-size: 12px;
}

.page-footer a {
  color: inherit;
  text-decoration: none;
}

.page-footer a:hover {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.page-footer a:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none;
  }
}

@media (max-width: 640px) {
  .appbar-inner {
    padding: 14px 16px;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .titlewrap {
    flex: none;
  }

  main {
    padding: 18px 16px 40px;
  }

  .page-footer {
    padding: 0 16px 24px;
  }

  .actions {
    width: 100%;
  }

  .actions button {
    flex: 1 1 0;
  }

  .appbar-search {
    flex: none;
    max-width: none;
  }

  .panel {
    padding: 16px;
  }

  .star-row {
    flex-wrap: wrap;
  }

  .star-row .star-cta,
  .star-row #star-slot {
    flex: 1 1 100%;
    justify-content: center;
  }

  .panel-head {
    flex-direction: column;
  }

  .raw-json-head {
    flex-direction: row;
  }

  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

[hidden] {
  display: none;
}
`;

// src/bin/gui/page.html
var page_default = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CC Safety Net Policy</title>
  <script>
    (() => {
      const stored = localStorage.getItem('cc-safety-net-theme');
      if (stored === 'light' || stored === 'dark') document.documentElement.style.colorScheme = stored;
    })();
  </script>
  <style>
/* __CC_SAFETY_NET_CUSTOM_CSS__ */
  </style>
</head>
<body>
  <header class="appbar">
    <div class="appbar-inner">
      <div class="titlewrap">
        <h1>CC Safety Net Policy</h1>
        <div id="policy-path"></div>
      </div>
      <label class="appbar-search">
        <span class="sr-only">Search all protections</span>
        <input type="search" id="policy-search" autocomplete="off" placeholder="Filter by name, category, or rule ID">
      </label>
      <div class="actions">
        <button type="button" id="theme-toggle"></button>
        <button class="primary" id="save">Save</button>
        <button class="danger" id="reset">Reset</button>
      </div>
      <div class="star-row" id="star-row" hidden>
        <p class="star-pitch"><span id="star-pitch-text"></span> <span class="star-mechanism" id="star-mechanism" hidden>One click via your GitHub CLI. No redirect.</span></p>
        <span id="star-slot"></span>
      </div>
      <div class="app-status" id="app-status" role="status" aria-live="polite">Loading...</div>
    </div>
  </header>
  <main>
    <div class="status" id="status" role="status" aria-live="polite"></div>
    <div class="recovery" id="recovery" hidden>
      <div>
        <strong>Policy repair available</strong>
        <p class="muted">Repair writes canonical JSON by preserving valid settings. If the JSON cannot be parsed, defaults are restored.</p>
      </div>
      <button class="primary" id="repair" type="button">Repair</button>
    </div>
    <section class="panel">
      <div class="panel-head">
        <div class="panel-title">
          <h2>Modes</h2>
          <p class="panel-sub muted">Choose a safety level, then override individual capabilities only when needed.</p>
        </div>
      </div>
      <div id="environment-overrides" class="status" hidden></div>
      <div class="grid" id="safety-level"></div>
      <div class="field field-toggle">
        <button class="panel-toggle" type="button" aria-expanded="false" aria-controls="safety-overrides-content"><span class="panel-chevron" aria-hidden="true"></span><span>Advanced overrides</span></button>
      </div>
      <div class="foldable-field-content" id="safety-overrides-content" hidden>
        <p class="muted">Inherit from the selected level unless a capability needs an explicit exception.</p>
        <div class="grid" id="safety-overrides"></div>
      </div>
      <div class="field">
        <span>Workflow</span>
        <small>Workflow exceptions are separate from safety level.</small>
      </div>
      <div class="grid" id="workflow"></div>
    </section>
    <section class="panel foldable">
      <div class="panel-head">
        <div class="panel-title">
          <h2><button class="panel-toggle" type="button" aria-expanded="false" aria-controls="destructive-command-panel-content"><span class="panel-chevron" aria-hidden="true"></span><span>Destructive Command Protection</span></button></h2>
          <p class="panel-sub muted" id="destructive-command-summary"></p>
        </div>
      </div>
      <div id="destructive-command-panel-content" hidden>
        <div id="destructive-command"></div>
      </div>
    </section>
    <section class="panel foldable">
      <header class="panel-head">
        <div class="panel-title">
          <h2><button class="panel-toggle" type="button" aria-expanded="false" aria-controls="secret-panel-content"><span class="panel-chevron" aria-hidden="true"></span><span>Secret Protection</span></button></h2>
          <p class="panel-sub muted" id="secret-summary">Default sensitive paths and coding CLI credential locations can be disabled individually. Deny paths are blocked while Secret protection is on.</p>
        </div>
      </header>
      <div id="secret-panel-content" hidden>
        <div id="secret"></div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head raw-json-head">
        <div class="panel-title">
          <h2>Raw JSON</h2>
          <p class="panel-sub muted" id="raw-source">Read-only mirror of the controls.</p>
        </div>
        <button class="icon-button" id="raw-copy" type="button" aria-label="Copy raw JSON to clipboard"></button>
      </div>
      <textarea id="raw" aria-label="Raw policy JSON" aria-describedby="raw-source" readonly></textarea>
    </section>
  </main>
  <footer class="page-footer">
    <a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>
    <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>
  </footer>
  <dialog class="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-body confirm-dialog-detail">
    <form method="dialog">
      <h2 id="confirm-dialog-title"></h2>
      <p class="muted" id="confirm-dialog-body"></p>
      <p class="dialog-detail"><code id="confirm-dialog-detail"></code></p>
      <div class="dialog-actions">
        <button type="submit" id="confirm-dialog-cancel" value="cancel">Cancel</button>
        <button type="submit" class="danger" id="confirm-dialog-confirm" value="confirm"></button>
      </div>
    </form>
  </dialog>
  <script>
    const token = __CC_SAFETY_NET_TOKEN__;
    const fallbackRepoUrl = 'https://github.com/kenryu42/cc-safety-net';
    const safetyLevels = {
      standard: ['Standard', 'Blocks destructive git and filesystem commands. Recommended for most people.'],
      strict: ['Strict', "Standard, plus blocks anything the parser can't fully understand. Occasional false positives on exotic shell."],
      paranoid: ['Paranoid', 'Strict, plus blocks rm -rf inside your project and interpreter one-liners. Expect friction; for untrusted agents or high-stakes repos.']
    };
    const safetyOverrides = {
      fail_closed: ['Fail closed', 'Block commands the parser cannot fully understand.'],
      paranoid_rm: ['Paranoid rm -rf checks', 'Block non-temp rm -rf inside the project.'],
      paranoid_interpreters: ['Paranoid interpreters', 'Block interpreter one-liners.']
    };
    const rawCopyIcons = {
      copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"></path></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>'
    };
    const starIcons = {
      outline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
      filled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>'
    };
    const denyPathIcons = {
      add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
      remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6M14 11v6"></path></svg>'
    };
    let state;
    let draftPolicy;
    let dirty = false;
    let rawCopyResetTimer = null;
    let activeStarContext = { starred: null, starCount: null, blockedTotal: 0 };
    const api = (path, init = {}) => fetch(\`\${path}?token=\${encodeURIComponent(token)}\`, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-cc-safety-net-token': token, ...(init.headers || {}) }
    });
    const requestJson = async (path, init) => {
      try {
        const response = await api(path, init);
        const text = await response.text();
        return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : {} };
      } catch (error) {
        return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
      }
    };
    const errorText = (result) =>
      result.error
      ?? (Array.isArray(result.data?.errors) && result.data.errors.length ? result.data.errors.join('\\n') : null)
      ?? result.data?.error
      ?? \`Request failed (status \${result.status}).\`;
    const isWriteSuccess = (result) =>
      result.ok && !(Array.isArray(result.data?.errors) && result.data.errors.length > 0);
    const isPolicyState = (value) =>
      !!value && typeof value === 'object'
      && !!value.policy && typeof value.policy === 'object'
      && !!value.policy.safety && !!value.policy.workflow && !!value.policy.secret_protection
      && Array.isArray(value.destructiveCommandRules) && Array.isArray(value.secretPatterns)
      && Array.isArray(value.errors);
    const qs = (id) => document.getElementById(id);
    const setDetailStatus = (text, kind = '') => {
      qs('status').textContent = text;
      qs('status').className = \`status \${kind}\`;
    };
    const setAppStatus = (text, kind = '') => {
      qs('app-status').textContent = text;
      qs('app-status').className = \`app-status \${kind}\`;
    };
    let busy = false;
    const updateActions = () => {
      const hasErrors = (state?.errors.length ?? 0) > 0;
      qs('save').disabled = busy || !state || hasErrors;
      qs('reset').disabled = busy || !state;
      qs('repair').disabled = busy || !hasErrors;
    };
    const runExclusive = async (pendingText, fn) => {
      if (busy) return;
      busy = true;
      updateActions();
      setAppStatus(pendingText);
      setDetailStatus('');
      try {
        await fn();
      } finally {
        busy = false;
        updateActions();
      }
    };
    const checkbox = (checked) => checked ? 'checked' : '';
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
    const clonePolicy = (policy) => JSON.parse(JSON.stringify(policy));
    const pathLines = (value) => value.split('\\n').map((line) => line.trim()).filter(Boolean);
    const formatPolicy = (policy) => \`\${JSON.stringify(policy, null, 2)}\\n\`;
    const collectFormPolicy = () => ({
      version: 1,
      safety: {
        level: draftPolicy.safety.level,
        overrides: Object.fromEntries(Object.entries(draftPolicy.safety.overrides)
          .filter(([, value]) => typeof value === 'boolean'))
      },
      workflow: draftPolicy.workflow,
      destructive_command_protection: draftPolicy.destructive_command_protection,
      secret_protection: {
        enabled: draftPolicy.secret_protection.enabled,
        overrides: draftPolicy.secret_protection.overrides,
        deny_paths: draftPolicy.secret_protection.deny_paths
      }
    });
    const confirmDialog = (() => {
      const dialog = qs('confirm-dialog');
      const confirm = qs('confirm-dialog-confirm');
      const cancel = qs('confirm-dialog-cancel');
      let resolvePending = null;
      dialog.addEventListener('close', () => {
        if (!resolvePending) return;
        resolvePending(dialog.returnValue === 'confirm');
        resolvePending = null;
      });
      dialog.addEventListener('cancel', () => {
        dialog.returnValue = 'cancel';
      });
      return (options) => new Promise((resolve) => {
        if (resolvePending) {
          resolve(false);
          return;
        }
        qs('confirm-dialog-title').textContent = options.title;
        qs('confirm-dialog-body').textContent = options.body;
        qs('confirm-dialog-detail').textContent = options.detail ?? '';
        qs('confirm-dialog-detail').parentElement.hidden = !options.detail;
        confirm.textContent = options.confirmLabel;
        confirm.className = options.confirmClass ?? 'danger';
        dialog.returnValue = 'cancel';
        resolvePending = resolve;
        dialog.showModal();
        cancel.focus();
      });
    })();
    const confirmProtectionDisable = (options) => confirmDialog({
      title: options.title,
      body: options.body,
      detail: options.detail,
      confirmLabel: 'Disable protection'
    });
    const togglePanel = (button) => {
      const content = qs(button.getAttribute('aria-controls'));
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      content.hidden = expanded;
    };
    const updateRawSource = () => {
      qs('raw-source').textContent = state?.errors.length
        ? 'Read-only original policy JSON. Repair preserves valid settings and writes canonical JSON.'
        : 'Read-only mirror of the controls.';
    };
    const setRawCopyCopied = (copied) => {
      qs('raw-copy').innerHTML = copied ? rawCopyIcons.check : rawCopyIcons.copy;
      qs('raw-copy').classList.toggle('copied', copied);
      qs('raw-copy').setAttribute('aria-label', copied ? 'Copied raw JSON' : 'Copy raw JSON to clipboard');
    };
    const copyRawToClipboard = async () => {
      qs('raw-copy').disabled = true;
      try {
        await navigator.clipboard.writeText(qs('raw').value);
        setRawCopyCopied(true);
        if (rawCopyResetTimer) clearTimeout(rawCopyResetTimer);
        rawCopyResetTimer = setTimeout(() => setRawCopyCopied(false), 2000);
      } catch (error) {
        setAppStatus('Copy failed', 'error');
        setDetailStatus(\`Error: Could not copy Raw JSON: \${error instanceof Error ? error.message : String(error)}\`, 'error');
      } finally {
        qs('raw-copy').disabled = false;
      }
    };
    const formatStarCount = (count) => {
      if (typeof count !== 'number') return '';
      if (count >= 1000) return \`\${(count / 1000).toFixed(1).replace(/\\.0$/, '')}k\`;
      return String(count);
    };
    const starCountHtml = (count) => {
      const formatted = formatStarCount(count);
      return formatted ? \`<span class="star-count">\${escapeHtml(formatted)}</span>\` : '';
    };
    const hideStarCta = () => {
      qs('star-row').hidden = true;
      qs('star-slot').innerHTML = '';
    };
    const renderStarPitch = (context, starred = false) => {
      const evidence = context.blockedTotal > 0
        ? \`CC Safety Net has blocked <strong>\${escapeHtml(context.blockedTotal.toLocaleString('en-US'))}</strong> risky command\${context.blockedTotal === 1 ? '' : 's'} on this machine.\`
        : '';
      if (starred) {
        qs('star-pitch-text').innerHTML = evidence;
        return;
      }
      qs('star-pitch-text').innerHTML = evidence
        ? \`\${evidence} If it saved your work, star it on GitHub.\`
        : 'If CC Safety Net is useful to you, star it on GitHub.';
    };
    const renderStarLink = (context, href = fallbackRepoUrl) => {
      qs('star-slot').innerHTML = \`<a class="star-cta" href="\${escapeHtml(href)}" target="_blank" rel="noopener" aria-label="Star CC Safety Net on GitHub (opens github.com)">
          <span class="star-icon" aria-hidden="true">\${starIcons.outline}</span>
          <span class="star-label">Star on GitHub</span>
          \${starCountHtml(context.starCount)}
        </a>\`;
      qs('star-row').hidden = false;
    };
    const renderStarCta = (context) => {
      activeStarContext = context;
      if (context.starred === true) {
        hideStarCta();
        return;
      }
      renderStarPitch(context);
      qs('star-mechanism').hidden = context.starred !== false;
      if (context.starred === null) {
        renderStarLink(context);
        return;
      }
      qs('star-slot').innerHTML = \`<button type="button" class="star-cta" aria-label="Star CC Safety Net on GitHub. One click via your GitHub CLI.">
          <span class="star-icon" aria-hidden="true">\${starIcons.outline}</span>
          <span class="star-label">Star on GitHub</span>
          \${starCountHtml(context.starCount)}
        </button>\`;
      qs('star-row').hidden = false;
    };
    const starRepo = async (button) => {
      button.disabled = true;
      const result = await requestJson('/api/star', { method: 'POST' });
      if (result.ok && result.data?.ok === true) {
        button.querySelector('.star-icon').innerHTML = starIcons.filled;
        button.querySelector('.star-label').textContent = 'Starred. Thank you.';
        button.setAttribute('aria-label', 'CC Safety Net starred on GitHub');
        button.classList.add('starred');
        qs('star-mechanism').hidden = true;
        renderStarPitch(activeStarContext, true);
        setAppStatus('Starred on GitHub', 'ok');
        setDetailStatus('');
        return;
      }
      qs('star-mechanism').hidden = true;
      renderStarLink(activeStarContext, result.data?.fallbackUrl ?? fallbackRepoUrl);
    };
    const loadStarContext = async () => {
      const result = await requestJson('/api/star/context');
      renderStarCta(result.ok && result.data ? result.data : { starred: null, starCount: null, blockedTotal: 0 });
    };
    const syncRawFromForm = () => {
      if (state?.errors.length) return;
      qs('raw').value = formatPolicy(collectFormPolicy());
      updateRawSource();
    };
    const updateDirtyStatus = () => {
      if (state?.errors.length) return;
      dirty = JSON.stringify(collectFormPolicy()) !== JSON.stringify(state.policy);
      setAppStatus(dirty ? 'Unsaved changes. Click Save to apply.' : 'Loaded', dirty ? 'dirty' : 'ok');
      setDetailStatus('');
      updateActions();
    };
    const setDenyPathsHint = (text) => {
      qs('deny-paths-hint').textContent = text;
      qs('deny-paths-hint').hidden = !text;
    };
    const renderDenyPaths = () => {
      const paths = draftPolicy.secret_protection.deny_paths;
      const disabled = !draftPolicy.secret_protection.enabled;
      qs('deny-paths-label').textContent = \`Deny paths (\${paths.length})\`;
      qs('deny-paths-input').disabled = disabled;
      qs('deny-paths-add-button').disabled = disabled;
      qs('deny-paths-list').innerHTML = paths.length === 0
        ? '<li class="empty">No deny paths configured.</li>'
        : paths.map((path, index) => \`<li class="deny-path-item \${disabled ? 'row-disabled' : ''}">
            <code>\${escapeHtml(path)}</code>
            <button type="button" class="icon-button" data-deny-path-remove="\${index}" \${disabled ? 'disabled' : ''} aria-label="Remove deny path \${escapeHtml(path)}">\${denyPathIcons.remove}</button>
          </li>\`).join('');
    };
    const addDenyPaths = (value) => {
      const entries = [...new Set(pathLines(value))];
      if (entries.length === 0) return;
      const existing = draftPolicy.secret_protection.deny_paths;
      const duplicates = entries.filter((entry) => existing.includes(entry));
      draftPolicy.secret_protection.deny_paths = [
        ...existing,
        ...entries.filter((entry) => !existing.includes(entry))
      ];
      qs('deny-paths-input').value = '';
      setDenyPathsHint(duplicates.length ? \`Already listed: \${duplicates.join(', ')}\` : '');
      renderDenyPaths();
      syncRawFromForm();
      updateDirtyStatus();
      qs('deny-paths-input').focus();
    };
    const removeDenyPath = (index) => {
      draftPolicy.secret_protection.deny_paths = draftPolicy.secret_protection.deny_paths
        .filter((_, position) => position !== index);
      setDenyPathsHint('');
      renderDenyPaths();
      syncRawFromForm();
      updateDirtyStatus();
    };
    const groupRules = (rules) => rules.reduce((groups, rule) => {
      const group = groups.find((item) => item.category === rule.category);
      if (group) {
        group.rules.push(rule);
        return groups;
      }
      groups.push({ category: rule.category, rules: [rule] });
      return groups;
    }, []);
    const ruleState = (active, sectionDisabled) => {
      if (active && !sectionDisabled) return { label: 'Active', className: 'state-active' };
      return { label: 'Disabled', className: 'state-disabled' };
    };
    const renderRuleToggles = (options) => {
      const query = qs('policy-search').value.trim().toLowerCase();
      const rules = options.rules.filter((rule) =>
        [rule.category, rule.label, rule.id, rule.description].join(' ').toLowerCase().includes(query)
      );
      const disabledCount = Object.keys(options.overrides).length;
      qs(options.summaryId).textContent = options.summaryText(disabledCount);
      qs(options.targetId).innerHTML = rules.length === 0
        ? \`<p class="empty">\${escapeHtml(options.emptyText)}</p>\`
        : groupRules(rules).map((group) => \`
          <section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules.map((rule) => {
              const active = options.overrides[rule.id] !== 'off';
              const state = ruleState(active, options.disabled);
              const disabled = options.disabled ? 'disabled' : '';
              return \`<label class="row \${options.disabled ? 'row-disabled' : ''}">
                <input type="checkbox" \${options.dataAttribute}="\${escapeHtml(rule.id)}" \${checkbox(active)} \${disabled}>
                <span>
                  <strong>\${escapeHtml(rule.label)}</strong>
                  <code class="rule-id">\${escapeHtml(rule.id)}</code>
                  <small><span class="\${state.className}">\${state.label}</span> \${escapeHtml(rule.description)}</small>
                </span>
              </label>\`;
            }).join('')}</div>
          </section>
        \`).join('');
    };
    const destructiveCommandSummaryText = (disabledCount) =>
      draftPolicy.destructive_command_protection.enabled
        ? \`\${state.destructiveCommandRules.length - disabledCount} active, \${disabledCount} disabled\`
        : 'Protection disabled. Saved rule settings are preserved. Custom rules and secret protection still apply.';
    const secretSummaryText = (disabledCount) =>
      draftPolicy.secret_protection.enabled
        ? \`\${state.secretPatterns.length - disabledCount} active, \${disabledCount} disabled\`
        : 'Protection disabled. Saved rule settings and deny paths are preserved.';
    const levelCapabilities = (level) => ({
      fail_closed: level === 'strict' || level === 'paranoid',
      paranoid_rm: level === 'paranoid',
      paranoid_interpreters: level === 'paranoid'
    });
    const renderSafety = () => {
      qs('environment-overrides').hidden = !state.environmentOverrides?.length;
      qs('environment-overrides').textContent = state.environmentOverrides?.length
        ? \`Environment overrides active: \${state.environmentOverrides.join(', ')}\`
        : '';
      qs('safety-level').innerHTML = Object.entries(safetyLevels).map(([level, meta]) =>
        \`<label class="row"><input type="radio" name="safety-level" value="\${level}" \${checkbox(draftPolicy.safety.level === level)}><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span></label>\`
      ).join('');
      const inherited = levelCapabilities(draftPolicy.safety.level);
      qs('safety-overrides').innerHTML = Object.entries(safetyOverrides).map(([key, meta]) => {
        const value = draftPolicy.safety.overrides[key];
        const inheritedText = inherited[key] ? 'on' : 'off';
        return \`<label class="row safety-override-row"><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span><select data-safety-override="\${key}">
          <option value="inherit" \${value === undefined ? 'selected' : ''}>Inherit from level (\${inheritedText})</option>
          <option value="true" \${value === true ? 'selected' : ''}>Force on</option>
          <option value="false" \${value === false ? 'selected' : ''}>Force off</option>
        </select></label>\`;
      }).join('');
      qs('workflow').innerHTML =
        \`<label class="row"><input type="checkbox" data-workflow-worktree \${checkbox(draftPolicy.workflow.worktree_mode)}><span><strong>Allow discarding local changes in linked git worktrees</strong><small>Only relaxes linked worktree discard checks.</small></span></label>\`;
    };
    const updateRuleRow = (input, active, summaryId, overrides, summaryText) => {
      const stateLabel = input.closest('.row')?.querySelector('small span');
      if (stateLabel) {
        const state = ruleState(active, false);
        stateLabel.textContent = state.label;
        stateLabel.className = state.className;
      }
      qs(summaryId).textContent = summaryText(Object.keys(overrides).length);
    };
    const renderDestructiveCommands = () => renderRuleToggles({
      rules: state.destructiveCommandRules,
      overrides: draftPolicy.destructive_command_protection.overrides,
      summaryId: 'destructive-command-summary',
      targetId: 'destructive-command-rules',
      dataAttribute: 'data-destructive-command-active',
      emptyText: 'No built-in protections match the search.',
      summaryText: destructiveCommandSummaryText,
      disabled: !draftPolicy.destructive_command_protection.enabled
    });
    const renderSecretPatterns = () => {
      renderRuleToggles({
        rules: state.secretPatterns,
        overrides: draftPolicy.secret_protection.overrides,
        summaryId: 'secret-summary',
        targetId: 'secret-patterns',
        dataAttribute: 'data-secret-active',
        emptyText: 'No secret protections match the search.',
        summaryText: secretSummaryText,
        disabled: !draftPolicy.secret_protection.enabled
      });
    };
    function render() {
      draftPolicy = clonePolicy(state.policy);
      dirty = false;
      qs('policy-path').textContent = state.path + (state.exists ? '' : ' (not created yet)');
      renderSafety();
      qs('destructive-command').innerHTML =
        '<label class="row master"><input type="checkbox" data-destructive-command-enabled ' + checkbox(state.policy.destructive_command_protection.enabled) + '><span><strong>Destructive command protection</strong><small>Block built-in destructive git, filesystem, and execution patterns. Custom rules remain active when disabled.</small></span><span class="master-badge" aria-hidden="true"></span></label>' +
        '<div id="destructive-command-rules"></div>';
      qs('secret').innerHTML =
        '<label class="row master"><input type="checkbox" id="secret-enabled" ' + checkbox(state.policy.secret_protection.enabled) + '><span><strong>Secret protection</strong><small>Block default sensitive paths, coding CLI credential locations, and configured deny paths.</small></span><span class="master-badge" aria-hidden="true"></span></label>' +
        '<div id="secret-patterns"></div>' +
        '<div class="field"><span id="deny-paths-label">Deny paths</span><small>Exact normalized paths are blocked while Secret protection is on. Paste multiple lines to add several paths at once.</small></div>' +
        '<div class="deny-paths-add"><input type="text" id="deny-paths-input" autocomplete="off" spellcheck="false" placeholder="path/to/protect" aria-labelledby="deny-paths-label"><button type="button" class="icon-button" id="deny-paths-add-button" aria-label="Add deny path">' + denyPathIcons.add + '</button></div>' +
        '<p class="deny-paths-hint" id="deny-paths-hint" hidden></p>' +
        '<ul class="deny-paths-list" id="deny-paths-list"></ul>';
      qs('raw').value = state.errors.length ? state.raw : formatPolicy(draftPolicy);
      qs('policy-search').value = '';
      renderDestructiveCommands();
      renderSecretPatterns();
      renderDenyPaths();
      updateRawSource();
      qs('recovery').hidden = state.errors.length === 0;
      updateActions();
      if (state.errors.length) {
        setAppStatus('Repair required', 'error');
        setDetailStatus(\`Error: \${state.errors.join('\\n')}\`, 'error');
        return;
      }
      setAppStatus('Loaded', 'ok');
      setDetailStatus('');
    }
    async function load() {
      const result = await requestJson('/api/policy');
      if (!isPolicyState(result.data)) {
        setAppStatus('Load failed', 'error');
        setDetailStatus(\`Error: Could not load policy: \${errorText(result)}\`, 'error');
        return false;
      }
      state = result.data;
      render();
      return true;
    }
    document.addEventListener('input', (event) => {
      const input = event.target;
      if (input.id === 'policy-search') {
        renderDestructiveCommands();
        renderSecretPatterns();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.target?.id !== 'deny-paths-input' || event.key !== 'Enter') return;
      event.preventDefault();
      addDenyPaths(event.target.value);
    });
    document.addEventListener('paste', (event) => {
      if (event.target?.id !== 'deny-paths-input') return;
      const text = event.clipboardData?.getData('text') ?? '';
      if (!text.includes('\\n')) return;
      event.preventDefault();
      addDenyPaths(\`\${event.target.value}\\n\${text}\`);
    });
    document.addEventListener('change', (event) => {
      const input = event.target;
      if (input.name === 'safety-level') {
        draftPolicy.safety.level = input.value;
        renderSafety();
        syncRawFromForm();
        updateDirtyStatus();
        return;
      }
      if (input.dataset?.safetyOverride) {
        if (input.value === 'inherit') delete draftPolicy.safety.overrides[input.dataset.safetyOverride];
        if (input.value === 'true') draftPolicy.safety.overrides[input.dataset.safetyOverride] = true;
        if (input.value === 'false') draftPolicy.safety.overrides[input.dataset.safetyOverride] = false;
        syncRawFromForm();
        updateDirtyStatus();
        return;
      }
      if ('workflowWorktree' in input.dataset) {
        draftPolicy.workflow.worktree_mode = input.checked;
        syncRawFromForm();
        updateDirtyStatus();
        return;
      }
      if ('destructiveCommandEnabled' in input.dataset) {
        void (async () => {
          if (!input.checked && !(await confirmProtectionDisable({
            title: 'Disable destructive command protection?',
            body: 'Built-in destructive git, filesystem, and execution protections will stop blocking commands until you turn this back on.',
            detail: 'Custom rules remain active.'
          }))) {
            input.checked = true;
            return;
          }
          draftPolicy.destructive_command_protection.enabled = input.checked;
          renderDestructiveCommands();
          syncRawFromForm();
          updateDirtyStatus();
        })();
        return;
      }
      if (input.dataset?.destructiveCommandActive) {
        if (input.checked) {
          delete draftPolicy.destructive_command_protection.overrides[input.dataset.destructiveCommandActive];
        }
        if (!input.checked) {
          draftPolicy.destructive_command_protection.overrides[input.dataset.destructiveCommandActive] = 'off';
        }
        updateRuleRow(input, input.checked, 'destructive-command-summary', draftPolicy.destructive_command_protection.overrides, destructiveCommandSummaryText);
        syncRawFromForm();
        updateDirtyStatus();
        return;
      }
      if (input.dataset?.secretActive) {
        if (input.checked) delete draftPolicy.secret_protection.overrides[input.dataset.secretActive];
        else draftPolicy.secret_protection.overrides[input.dataset.secretActive] = 'off';
        updateRuleRow(input, input.checked, 'secret-summary', draftPolicy.secret_protection.overrides, secretSummaryText);
        syncRawFromForm();
        updateDirtyStatus();
        return;
      }
      if (input.id === 'secret-enabled') {
        void (async () => {
          if (!input.checked && !(await confirmProtectionDisable({
            title: 'Disable secret protection?',
            body: 'Default sensitive paths, coding CLI credential locations, and deny paths will stop blocking access until you turn this back on.'
          }))) {
            input.checked = true;
            return;
          }
          draftPolicy.secret_protection.enabled = input.checked;
          renderSecretPatterns();
          renderDenyPaths();
          syncRawFromForm();
          updateDirtyStatus();
        })();
      }
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('.panel-toggle');
      if (button) {
        togglePanel(button);
        return;
      }
      if (event.target.closest?.('#deny-paths-add-button')) {
        addDenyPaths(qs('deny-paths-input').value);
        return;
      }
      const removeButton = event.target.closest?.('[data-deny-path-remove]');
      if (removeButton) removeDenyPath(Number(removeButton.dataset.denyPathRemove));
      const starButton = event.target.closest?.('.star-cta');
      if (starButton?.tagName === 'BUTTON') {
        void starRepo(starButton);
        return;
      }
    });
    qs('save').onclick = () => {
      if (!state) { setAppStatus('Load failed', 'error'); setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error'); return; }
      if (state.errors.length) { setAppStatus('Repair required', 'error'); setDetailStatus('Error: Repair policy before saving changes.', 'error'); return; }
      if (!dirty) { setAppStatus('No changes to save', 'ok'); setDetailStatus(''); return; }
      const policy = collectFormPolicy();
      void runExclusive('Saving...', async () => {
        const result = await requestJson('/api/policy', { method: 'POST', body: JSON.stringify(policy) });
        if (!isWriteSuccess(result)) { setAppStatus('Save failed', 'error'); setDetailStatus(\`Error: \${errorText(result)}\`, 'error'); return; }
        const savedPath = result.data.path;
        if (await load()) { dirty = false; setAppStatus(\`Saved \${savedPath}.\`, 'ok'); setDetailStatus(''); }
      });
    };
    qs('repair').onclick = async () => {
      if (!state) { setAppStatus('Load failed', 'error'); setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error'); return; }
      if (state.errors.length === 0) { setAppStatus('Loaded', 'ok'); setDetailStatus(''); return; }
      if (!(await confirmDialog({
        title: 'Repair policy?',
        body: 'This will write canonical policy JSON. Valid settings are preserved; invalid fields are discarded. If the JSON cannot be parsed, defaults are restored.',
        detail: state.path,
        confirmLabel: 'Repair',
        confirmClass: 'primary'
      }))) {
        return;
      }
      void runExclusive('Repairing...', async () => {
        const result = await requestJson('/api/repair', { method: 'POST', body: '{}' });
        if (!isWriteSuccess(result)) { setAppStatus('Repair failed', 'error'); setDetailStatus(\`Error: \${errorText(result)}\`, 'error'); return; }
        const repairedPath = result.data.path;
        if (await load()) { dirty = false; setAppStatus(\`Repaired \${repairedPath}.\`, 'ok'); setDetailStatus(''); }
      });
    };
    qs('reset').onclick = async () => {
      if (!state) { setAppStatus('Load failed', 'error'); setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error'); return; }
      if (!(await confirmDialog({
        title: 'Reset policy?',
        body: 'This will restore the default policy JSON at this path.',
        detail: state.path,
        confirmLabel: 'Reset policy'
      }))) {
        return;
      }
      void runExclusive('Resetting...', async () => {
        const result = await requestJson('/api/reset', { method: 'POST', body: '{}' });
        if (!isWriteSuccess(result)) { setAppStatus('Reset failed', 'error'); setDetailStatus(\`Error: \${errorText(result)}\`, 'error'); return; }
        const resetPath = result.data.path;
        if (await load()) { dirty = false; setAppStatus(\`Reset \${resetPath} to defaults.\`, 'ok'); setDetailStatus(''); }
      });
    };
    setRawCopyCopied(false);
    qs('raw-copy').onclick = () => {
      void copyRawToClipboard();
    };
    const themeOrder = ['auto', 'light', 'dark'];
    const themeIcons = {
      auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"></rect><path d="M8 20h8M12 16v4"></path></svg>',
      light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></svg>',
      dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>'
    };
    const themeLabels = { auto: 'Auto', light: 'Light', dark: 'Dark' };
    const applyTheme = (pref) => {
      document.documentElement.style.colorScheme = pref === 'auto' ? 'light dark' : pref;
      qs('theme-toggle').innerHTML = \`\${themeIcons[pref]}<span>\${themeLabels[pref]}</span>\`;
      qs('theme-toggle').setAttribute('aria-label', \`Color theme: \${themeLabels[pref]}. Click to change.\`);
    };
    let themePref = themeOrder.includes(localStorage.getItem('cc-safety-net-theme'))
      ? localStorage.getItem('cc-safety-net-theme')
      : 'auto';
    applyTheme(themePref);
    qs('theme-toggle').onclick = () => {
      themePref = themeOrder[(themeOrder.indexOf(themePref) + 1) % themeOrder.length];
      if (themePref === 'auto') localStorage.removeItem('cc-safety-net-theme');
      else localStorage.setItem('cc-safety-net-theme', themePref);
      applyTheme(themePref);
    };
    load().then((loaded) => {
      if (loaded) void loadStarContext();
    }).catch((error) => {
      setAppStatus('Load failed', 'error');
      setDetailStatus(String(error), 'error');
    });
  </script>
</body>
</html>
`;

// src/bin/gui/page.ts
function renderPolicyGuiHtml(token) {
  return page_default.replace("/* __CC_SAFETY_NET_CUSTOM_CSS__ */", custom_default).replace("__CC_SAFETY_NET_TOKEN__", JSON.stringify(token));
}

// src/bin/gui/index.ts
var REPO = "kenryu42/cc-safety-net";
var REPO_URL = `https://github.com/${REPO}`;
var STAR_TIMEOUT_MS = 1e4;
async function runGuiCommand(args, options2 = {}) {
  const flags = parseGuiArgs(args);
  const log = options2.log ?? console.log;
  const error = options2.error ?? console.error;
  if (!flags) {
    error("Usage: cc-safety-net gui [--no-open]");
    return 1;
  }
  const server = await createPolicyGuiServer(options2);
  log(`CC Safety Net policy GUI: ${server.url}`);
  if (!flags.noOpen) {
    try {
      await (options2.openBrowser ?? openBrowser)(server.url);
    } catch (openError) {
      error(`Failed to open browser: ${openError instanceof Error ? openError.message : String(openError)}`);
      error(`Open this URL manually: ${server.url}`);
    }
  }
  if (options2.keepAlive === false) {
    await server.close();
    return 0;
  }
  await waitForShutdown(server);
  return 0;
}
async function createPolicyGuiServer(options2 = {}) {
  const token = options2.token ?? randomBytes2(24).toString("base64url");
  const server = createServer((request, response) => {
    handleRequest(request, response, token, options2);
  });
  await new Promise((resolve13, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve13();
    });
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    token,
    url: `${origin}/?token=${encodeURIComponent(token)}`,
    close: () => closeServer(server)
  };
}
function parseGuiArgs(args) {
  if (args.some((arg) => arg !== "--no-open"))
    return null;
  return { noOpen: args.includes("--no-open") };
}
async function handleRequest(request, response, token, options2) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/favicon.ico") {
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }
  if (!requestHasValidToken(request, url, token)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }
  if (request.method === "GET" && url.pathname === "/") {
    sendHtml(response, renderPolicyGuiHtml(token));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/policy") {
    sendJson(response, 200, {
      ...readUserPolicyForGui(options2),
      destructiveCommandRules: DESTRUCTIVE_COMMAND_RULE_METADATA,
      secretPatterns: SECRET_PROTECTION_RULE_METADATA,
      environmentOverrides: getActiveEnvironmentOverrides()
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/policy") {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, 400, { errors: [body.error] });
      return;
    }
    const result = writeUserPolicyFromGui(body.value, options2);
    sendJson(response, result.errors.length > 0 ? 400 : 200, result);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/reset") {
    sendJson(response, 200, writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options2));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/repair") {
    sendJson(response, 200, repairUserPolicyForGui(options2));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/star/context") {
    sendJson(response, 200, await (options2.fetchStarContext ?? (() => fetchStarContext({ logsDir: options2.activityLogsDir })))());
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/star") {
    const result = await (options2.starRepo ?? starRepo)();
    sendJson(response, 200, result.ok ? { ok: true } : { ok: false, fallbackUrl: REPO_URL });
    return;
  }
  sendJson(response, 404, { error: "Not found" });
}
function getActiveEnvironmentOverrides() {
  return [
    ENV_FLAGS.strict,
    ENV_FLAGS.paranoid,
    ENV_FLAGS.paranoidRm,
    ENV_FLAGS.paranoidInterpreters
  ].flatMap((flag) => envTruthy(flag) ? [flag.name] : []);
}
function requestHasValidToken(request, url, token) {
  if (url.searchParams.get("token") !== token)
    return false;
  if (request.method !== "POST")
    return true;
  return request.headers["x-cc-safety-net-token"] === token;
}
async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}") };
  } catch (error) {
    return {
      ok: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
function sendHtml(response, html) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}
function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}
function closeServer(server) {
  return new Promise((resolve13, reject) => {
    server.close((error) => error ? reject(error) : resolve13());
  });
}
function waitForShutdown(server) {
  return new Promise((resolve13) => {
    const cleanup = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
    };
    const shutdown = () => {
      cleanup();
      server.close().then(resolve13);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}
function openBrowser(url) {
  const command2 = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  return new Promise((resolve13, reject) => {
    const child = spawn2(command2, args, { detached: true, stdio: "ignore" });
    const handleError = (error) => {
      child.off("spawn", handleSpawn);
      reject(error);
    };
    const handleSpawn = () => {
      child.off("error", handleError);
      child.unref();
      resolve13();
    };
    child.once("error", handleError);
    child.once("spawn", handleSpawn);
  });
}
async function starRepo(command2 = "gh", timeoutMs = STAR_TIMEOUT_MS) {
  return {
    ok: await runGhCommand(command2, ["api", "-X", "PUT", `/user/starred/${REPO}`], timeoutMs) === 0
  };
}
async function fetchStarContext(options2 = {}) {
  const [starred, starCount, blockedTotal] = await Promise.all([
    userHasStarredRepo(options2.command),
    fetchStarCount(options2.fetchRepo),
    Promise.resolve(getActivitySummary(36500, options2.logsDir).totalBlocked)
  ]);
  return { starred, starCount, blockedTotal };
}
async function userHasStarredRepo(command2 = "gh", timeoutMs = STAR_TIMEOUT_MS) {
  if (await runGhCommand(command2, ["auth", "status"], timeoutMs) !== 0)
    return null;
  const starredExitCode = await runGhCommand(command2, ["api", `/user/starred/${REPO}`], timeoutMs);
  if (starredExitCode === 0)
    return true;
  if (starredExitCode === null)
    return null;
  return false;
}
function runGhCommand(command2, args, timeoutMs) {
  return new Promise((resolve13) => {
    const child = spawn2(command2, args, {
      stdio: "ignore",
      windowsHide: true
    });
    let settled = false;
    let timeout;
    const finish = (code) => {
      if (settled)
        return;
      settled = true;
      if (timeout)
        clearTimeout(timeout);
      resolve13(code);
    };
    child.once("error", () => finish(null));
    child.once("close", finish);
    timeout = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
  });
}
async function fetchStarCount(fetchRepo = fetch) {
  try {
    const response = await fetchRepo(`https://api.github.com/repos/${REPO}`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(STAR_TIMEOUT_MS)
    });
    if (!response.ok)
      return null;
    const body = await response.json();
    return typeof body.stargazers_count === "number" ? body.stargazers_count : null;
  } catch {
    return null;
  }
}

// src/bin/help.ts
var version = "1.0.6";
var INDENT = "  ";
var PROGRAM_NAME = "cc-safety-net";
function formatOptionFlags(option) {
  return option.argument ? `${option.flags} ${option.argument}` : option.flags;
}
function getOptionsColumnWidth(options2) {
  return Math.max(...options2.map((opt) => formatOptionFlags(opt).length));
}
function getSubcommandsColumnWidth(subcommands) {
  return Math.max(...subcommands.map((subcommand) => subcommand.usage.length));
}
function getCommandSummaryWidth(commands2) {
  return Math.max(...commands2.map((cmd) => `${PROGRAM_NAME} ${cmd.usage}`.length));
}
function formatCommandSummary(cmd, maxUsageWidth) {
  const usage = `${PROGRAM_NAME} ${cmd.usage}`;
  return `${INDENT}${usage.padEnd(maxUsageWidth + 2)}${cmd.description}`;
}
function formatEnvironmentVariable(name, description) {
  return `${INDENT}${name.padEnd(Math.max(40, name.length + 2))}${description}`;
}
function printCommandHelp(command2) {
  const lines = [];
  lines.push(`${PROGRAM_NAME} ${command2.name}`);
  lines.push("");
  lines.push(`${INDENT}${command2.description}`);
  lines.push("");
  lines.push("USAGE:");
  lines.push(`${INDENT}${PROGRAM_NAME} ${command2.usage}`);
  lines.push("");
  if (command2.subcommands && command2.subcommands.length > 0) {
    lines.push("SUBCOMMANDS:");
    const subcommandWidth = getSubcommandsColumnWidth(command2.subcommands);
    for (const subcommand of command2.subcommands) {
      lines.push(`${INDENT}${subcommand.usage.padEnd(subcommandWidth + 2)}${subcommand.description}`);
    }
    lines.push("");
  }
  if (command2.options.length > 0) {
    lines.push("OPTIONS:");
    const optWidth = getOptionsColumnWidth(command2.options);
    for (const opt of command2.options) {
      const flags = formatOptionFlags(opt);
      lines.push(`${INDENT}${flags.padEnd(optWidth + 2)}${opt.description}`);
    }
    lines.push("");
  }
  if (command2.examples && command2.examples.length > 0) {
    lines.push("EXAMPLES:");
    for (const example of command2.examples) {
      lines.push(`${INDENT}${example}`);
    }
  }
  console.log(lines.join(`
`));
}
function printHelp() {
  const visibleCommands = getVisibleCommands();
  const maxUsageWidth = getCommandSummaryWidth(visibleCommands);
  const lines = [];
  lines.push(`${PROGRAM_NAME} v${version}`);
  lines.push("");
  lines.push("Blocks destructive git and filesystem commands before execution.");
  lines.push("");
  lines.push("COMMANDS:");
  for (const cmd of visibleCommands) {
    lines.push(formatCommandSummary(cmd, maxUsageWidth));
  }
  lines.push("");
  lines.push("GLOBAL OPTIONS:");
  lines.push(`${INDENT}-h, --help       Show help (use with command for command-specific help)`);
  lines.push(`${INDENT}-V, --version    Show version`);
  lines.push("");
  lines.push("HELP:");
  lines.push(`${INDENT}${PROGRAM_NAME} help <command>     Show help for a specific command`);
  lines.push(`${INDENT}${PROGRAM_NAME} <command> --help   Show help for a specific command`);
  lines.push("");
  lines.push("ENVIRONMENT VARIABLES:");
  lines.push(formatEnvironmentVariable(`${ENV_FLAGS.level.name}=standard|strict|paranoid`, "Set session safety level"));
  lines.push(formatEnvironmentVariable(`${ENV_FLAGS.worktree.name}=1`, "Allow local git discards in linked worktrees"));
  lines.push(formatEnvironmentVariable(`${ENV_FLAGS.debug.name}=1`, "Log allowed hook commands for debugging"));
  lines.push(formatEnvironmentVariable("CC_SAFETY_NET_HOME", "Override rule config home directory"));
  lines.push("");
  lines.push("LEGACY ENVIRONMENT VARIABLES (STILL SUPPORTED):");
  lines.push(formatEnvironmentVariable(`${ENV_FLAGS.strict.name}=1`, "Force safety.overrides.fail_closed on"));
  lines.push(formatEnvironmentVariable(`${ENV_FLAGS.paranoid.name}=1`, "Force paranoid_rm and paranoid_interpreters on"));
  lines.push(formatEnvironmentVariable(`${ENV_FLAGS.paranoidRm.name}=1`, "Force safety.overrides.paranoid_rm on"));
  lines.push(formatEnvironmentVariable(`${ENV_FLAGS.paranoidInterpreters.name}=1`, "Force safety.overrides.paranoid_interpreters on"));
  console.log(lines.join(`
`));
}
function printVersion() {
  console.log(version);
}
function showCommandHelp(commandName) {
  const command2 = findCommand(commandName);
  if (!command2) {
    return false;
  }
  if (command2.hidden || command2.name.toLowerCase() !== commandName.toLowerCase()) {
    return false;
  }
  printCommandHelp(command2);
  return true;
}

// src/bin/hook/install.ts
import { homedir as homedir8 } from "node:os";

// src/bin/hook/install/antigravity-cli.ts
import { existsSync as existsSync15, mkdirSync as mkdirSync5, readFileSync as readFileSync13, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname13 } from "node:path";
var ANTIGRAVITY_HOOK_COMMAND = "npx -y cc-safety-net hook --agy-cli";
var MANAGED_HOOK_NAME = "cc-safety-net";
function managedHookEntry() {
  return {
    PreToolUse: [
      {
        hooks: [
          {
            type: "command",
            command: ANTIGRAVITY_HOOK_COMMAND,
            timeout: 30
          }
        ]
      }
    ]
  };
}
function parseAntigravityHooksConfig(configPath) {
  try {
    const config = JSON.parse(readFileSync13(configPath, "utf-8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("Antigravity hooks config must be a JSON object");
    }
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse Antigravity hooks config ${configPath}: ${error.message}`);
    }
    throw error;
  }
}
function getManagedHookDefinition(config) {
  const existing = config[MANAGED_HOOK_NAME];
  if (existing === undefined) {
    config[MANAGED_HOOK_NAME] = managedHookEntry();
    return config[MANAGED_HOOK_NAME];
  }
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    throw new Error(`Antigravity hooks config entry "${MANAGED_HOOK_NAME}" must be an object`);
  }
  if (!Array.isArray(existing.PreToolUse)) {
    existing.PreToolUse = [];
  }
  return existing;
}
function hasManagedHookCommand(definition) {
  return definition.PreToolUse?.some((entry) => entry.hooks?.some((hook) => hook.command === ANTIGRAVITY_HOOK_COMMAND)) ?? false;
}
function hasActiveManagedHook(config) {
  return Object.values(config).some((definition) => definition.enabled !== false && hasManagedHookCommand(definition));
}
function enableManagedHookDefinition(config) {
  if (config[MANAGED_HOOK_NAME] === undefined)
    return false;
  const definition = getManagedHookDefinition(config);
  if (definition.enabled !== false || !hasManagedHookCommand(definition))
    return false;
  definition.enabled = true;
  return true;
}
function appendManagedHook(config) {
  if (config[MANAGED_HOOK_NAME] === undefined) {
    config[MANAGED_HOOK_NAME] = managedHookEntry();
    return;
  }
  const definition = getManagedHookDefinition(config);
  definition.PreToolUse ??= [];
  definition.enabled = true;
  definition.PreToolUse.push(managedHookEntry().PreToolUse?.[0] ?? { hooks: [] });
}
function removeManagedHook(config) {
  let removed = false;
  for (const definition of Object.values(config)) {
    if (!Array.isArray(definition.PreToolUse))
      continue;
    definition.PreToolUse = definition.PreToolUse.flatMap((entry) => {
      if (!Array.isArray(entry.hooks))
        return [entry];
      const hooks = entry.hooks.filter((hook) => hook.command !== ANTIGRAVITY_HOOK_COMMAND);
      if (hooks.length !== entry.hooks.length)
        removed = true;
      return hooks.length === 0 ? [] : [{ ...entry, hooks }];
    });
  }
  return removed;
}
function writeAntigravityHooksConfig(configPath, config) {
  writeFileSync3(configPath, `${JSON.stringify(config, null, 2)}
`);
}
function installAntigravityCli(homeDir) {
  const configPath = getAntigravityHooksPath(homeDir);
  mkdirSync5(dirname13(configPath), { recursive: true });
  if (!existsSync15(configPath)) {
    writeAntigravityHooksConfig(configPath, { [MANAGED_HOOK_NAME]: managedHookEntry() });
    return { path: configPath, alreadyInstalled: false };
  }
  const config = parseAntigravityHooksConfig(configPath);
  if (hasActiveManagedHook(config))
    return { path: configPath, alreadyInstalled: true };
  if (enableManagedHookDefinition(config)) {
    writeAntigravityHooksConfig(configPath, config);
    return { path: configPath, alreadyInstalled: false };
  }
  appendManagedHook(config);
  writeAntigravityHooksConfig(configPath, config);
  return { path: configPath, alreadyInstalled: false };
}
function uninstallAntigravityCli(homeDir) {
  const configPath = getAntigravityHooksPath(homeDir);
  if (!existsSync15(configPath))
    return { path: configPath, alreadyInstalled: false };
  const config = parseAntigravityHooksConfig(configPath);
  const removed = removeManagedHook(config);
  if (!removed)
    return { path: configPath, alreadyInstalled: false };
  writeAntigravityHooksConfig(configPath, config);
  return { path: configPath, alreadyInstalled: true };
}

// src/bin/hook/install/kimi-code.ts
import { existsSync as existsSync16, mkdirSync as mkdirSync6, readFileSync as readFileSync14, writeFileSync as writeFileSync4 } from "node:fs";
import { dirname as dirname14, join as join16 } from "node:path";

// src/bin/hook/config-edit.ts
function isWhitespace(char) {
  return char !== undefined && /\s/.test(char);
}
function skipString(content, index, errorMessage) {
  let current = index + 1;
  let isEscaped = false;
  while (current < content.length) {
    const char = content[current];
    if (isEscaped) {
      isEscaped = false;
      current++;
      continue;
    }
    if (char === "\\") {
      isEscaped = true;
      current++;
      continue;
    }
    if (char === '"')
      return current + 1;
    current++;
  }
  throw new Error(errorMessage);
}
function findMatchingBracket(content, openIndex, options2) {
  const open = content[openIndex];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let index = openIndex;
  while (index < content.length) {
    const nextIndex = options2.skipComment?.(content, index) ?? index;
    if (nextIndex !== index) {
      index = nextIndex;
      continue;
    }
    if (content[index] === '"') {
      index = skipString(content, index, options2.stringError);
      continue;
    }
    if (content[index] === open)
      depth++;
    if (content[index] === close) {
      depth--;
      if (depth === 0)
        return index;
    }
    index++;
  }
  throw new Error(options2.bracketError);
}
function getLineIndent(content, index) {
  const lineStart = content.lastIndexOf(`
`, index) + 1;
  const match = /^[ \t]*/.exec(content.slice(lineStart));
  return match?.[0] ?? "";
}
function removeArrayRangeItem(content, item) {
  let removeStart = item.start;
  let removeEnd = item.end;
  let index = item.end;
  while (isWhitespace(content[index]))
    index++;
  if (content[index] === ",") {
    removeEnd = index + 1;
    if (content[removeEnd] === `
`)
      removeEnd++;
    return `${content.slice(0, removeStart)}${content.slice(removeEnd)}`;
  }
  index = item.start - 1;
  while (isWhitespace(content[index]))
    index--;
  if (content[index] === ",") {
    removeStart = index;
    const lineStart = content.lastIndexOf(`
`, removeStart - 1);
    if (lineStart !== -1 && /^\s*$/.test(content.slice(lineStart + 1, removeStart))) {
      removeStart = lineStart;
    }
  }
  return `${content.slice(0, removeStart)}${content.slice(removeEnd)}`;
}

// src/bin/hook/install/kimi-code.ts
var KIMI_HOOK_COMMAND = "npx -y cc-safety-net hook --kimi-code";
var KIMI_HOOK_BLOCK = `[[hooks]]
event = "PreToolUse"
command = "${KIMI_HOOK_COMMAND}"`;
var KIMI_INLINE_HOOK = `{ event = "PreToolUse", command = "${KIMI_HOOK_COMMAND}" }`;
function getKimiConfigPath(homeDir) {
  return join16(process.env.KIMI_CODE_HOME ?? join16(homeDir, ".kimi-code"), "config.toml");
}
function removeTopLevelEmptyHooksArray(content) {
  const result = content.split(`
`).reduce((state, line) => {
    if (/^\s*\[/.test(line)) {
      state.activeTable = true;
      state.lines.push(line);
      return state;
    }
    if (!state.activeTable && /^\s*hooks\s*=\s*\[\s*]\s*(?:#.*)?$/.test(line))
      return state;
    state.lines.push(line);
    return state;
  }, { activeTable: false, lines: [] });
  return result.lines.join(`
`);
}
function skipTomlComment(content, index) {
  if (content[index] !== "#")
    return index;
  const newlineIndex = content.indexOf(`
`, index + 1);
  return newlineIndex === -1 ? content.length : newlineIndex + 1;
}
function findTomlArrayClose(content, openIndex) {
  return findMatchingBracket(content, openIndex, {
    skipComment: skipTomlComment,
    stringError: "Unterminated string in Kimi Code config",
    bracketError: "Unmatched hooks array in Kimi Code config"
  });
}
function findTopLevelInlineHooksArray(content) {
  let activeTable = false;
  let index = 0;
  while (index < content.length) {
    const lineEnd = content.indexOf(`
`, index);
    const end = lineEnd === -1 ? content.length : lineEnd;
    const line = content.slice(index, end);
    if (/^\s*\[/.test(line))
      activeTable = true;
    if (!activeTable) {
      const match = /^(\s*)hooks\s*=\s*\[/.exec(line);
      if (match) {
        const arrayStart = index + match[0].lastIndexOf("[");
        return { start: arrayStart, end: findTomlArrayClose(content, arrayStart) };
      }
    }
    index = lineEnd === -1 ? content.length : lineEnd + 1;
  }
  return;
}
function appendKimiInlineHook(content, hooksRange) {
  const beforeClose = content.slice(0, hooksRange.end).trimEnd();
  const closingIndent = getLineIndent(content, hooksRange.end);
  const itemIndent = closingIndent === "" ? "     " : `${closingIndent}  `;
  const needsComma = !beforeClose.endsWith("[") && !beforeClose.endsWith(",");
  return `${beforeClose}${needsComma ? "," : ""}
${itemIndent}${KIMI_INLINE_HOOK}${content.slice(hooksRange.end)}`;
}
function appendKimiHook(content) {
  const inlineHooksRange = findTopLevelInlineHooksArray(content);
  if (inlineHooksRange && content.slice(inlineHooksRange.start + 1, inlineHooksRange.end).trim()) {
    return appendKimiInlineHook(content, inlineHooksRange);
  }
  const trimmed = removeTopLevelEmptyHooksArray(content).trimEnd();
  if (trimmed === "")
    return `${KIMI_HOOK_BLOCK}
`;
  return `${trimmed}

${KIMI_HOOK_BLOCK}
`;
}
function removeKimiTableHookBlocks(content) {
  const blocks = content.split(/(?=^\s*\[\[hooks]]\s*$)/m);
  return blocks.filter((block) => !/^\s*\[\[hooks]]\s*$/m.test(block) || !block.includes(KIMI_HOOK_COMMAND)).join("").trimEnd();
}
function removeKimiInlineHook(content, hooksRange) {
  const itemStart = content.indexOf(KIMI_INLINE_HOOK, hooksRange.start);
  if (itemStart === -1 || itemStart > hooksRange.end)
    return content;
  return removeArrayRangeItem(content, {
    start: itemStart,
    end: itemStart + KIMI_INLINE_HOOK.length
  });
}
function installKimiCode(homeDir) {
  const configPath = getKimiConfigPath(homeDir);
  mkdirSync6(dirname14(configPath), { recursive: true });
  if (!existsSync16(configPath)) {
    writeFileSync4(configPath, `${KIMI_HOOK_BLOCK}
`);
    return { path: configPath, alreadyInstalled: false };
  }
  const content = readFileSync14(configPath, "utf-8");
  if (content.includes(KIMI_HOOK_COMMAND))
    return { path: configPath, alreadyInstalled: true };
  writeFileSync4(configPath, appendKimiHook(content));
  return { path: configPath, alreadyInstalled: false };
}
function uninstallKimiCode(homeDir) {
  const configPath = getKimiConfigPath(homeDir);
  if (!existsSync16(configPath))
    return { path: configPath, alreadyInstalled: false };
  const content = readFileSync14(configPath, "utf-8");
  if (!content.includes(KIMI_HOOK_COMMAND))
    return { path: configPath, alreadyInstalled: false };
  const inlineHooksRange = findTopLevelInlineHooksArray(content);
  const updated = inlineHooksRange ? removeKimiInlineHook(content, inlineHooksRange) : `${removeKimiTableHookBlocks(content)}
`;
  writeFileSync4(configPath, updated);
  return { path: configPath, alreadyInstalled: true };
}

// src/bin/hook/install/native.ts
import { spawnSync } from "node:child_process";
function formatNativeCommand(command2) {
  return command2.join(" ");
}
function formatCommandFailure(command2, status, output) {
  return [
    `Failed to run ${formatNativeCommand(command2)}${status === null ? "" : ` (exit ${status})`}.`,
    output.trim()
  ].filter(Boolean).join(`
`);
}
function runNativeCommands(commands2) {
  commands2.forEach((command2) => {
    const result = spawnSync(command2[0], command2.slice(1), {
      encoding: "utf-8",
      stdio: "pipe"
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join(`
`);
    if (result.error) {
      throw new Error(formatCommandFailure(command2, null, `${result.error.message}
${output}`.trim()));
    }
    if (result.status !== 0) {
      throw new Error(formatCommandFailure(command2, result.status, output));
    }
  });
}

// src/bin/hook/install/opencode.ts
import { existsSync as existsSync17, readFileSync as readFileSync15, rmSync as rmSync3, writeFileSync as writeFileSync5 } from "node:fs";
import { join as join17 } from "node:path";
var OPENCODE_PACKAGE = "cc-safety-net";
var OPENCODE_CACHE_PACKAGE = `${OPENCODE_PACKAGE}@latest`;
var OPENCODE_CONFIG_FILES = ["opencode.json", "opencode.jsonc"];
function getDefaultOpenCodeConfigPath(homeDir) {
  return join17(homeDir, ".config", "opencode", OPENCODE_CONFIG_FILES[0]);
}
function getOpenCodeConfigPaths(homeDir) {
  return OPENCODE_CONFIG_FILES.map((filename) => join17(homeDir, ".config", "opencode", filename));
}
function getOpenCodeCachePath(homeDir) {
  return join17(homeDir, ".cache", "opencode", "packages", OPENCODE_CACHE_PACKAGE);
}
function clearOpenCodeCache(homeDir) {
  rmSync3(getOpenCodeCachePath(homeDir), { recursive: true, force: true });
}
function skipJsonComment(content, index) {
  if (content[index] === "/" && content[index + 1] === "/") {
    const newlineIndex = content.indexOf(`
`, index + 2);
    return newlineIndex === -1 ? content.length : newlineIndex + 1;
  }
  if (content[index] === "/" && content[index + 1] === "*") {
    const closeIndex = content.indexOf("*/", index + 2);
    return closeIndex === -1 ? content.length : closeIndex + 2;
  }
  return index;
}
function skipJsonTrivia(content, index) {
  let current = index;
  while (current < content.length) {
    if (/\s/.test(content[current] ?? "")) {
      current++;
      continue;
    }
    const next = skipJsonComment(content, current);
    if (next === current)
      return current;
    current = next;
  }
  return current;
}
function findJsonStringEnd(content, index) {
  let current = index + 1;
  let isEscaped = false;
  while (current < content.length) {
    if (isEscaped) {
      isEscaped = false;
      current++;
      continue;
    }
    if (content[current] === "\\") {
      isEscaped = true;
      current++;
      continue;
    }
    if (content[current] === '"')
      return current + 1;
    current++;
  }
  throw new Error("Unterminated string in OpenCode config");
}
function readJsonString(content, start, end) {
  return JSON.parse(content.slice(start, end));
}
function findJsonArrayClose(content, openIndex) {
  return findMatchingBracket(content, openIndex, {
    skipComment: skipJsonComment,
    stringError: "Unterminated string in OpenCode config",
    bracketError: "Unmatched plugin array in OpenCode config"
  });
}
function findOpenCodePluginArray(content) {
  let depth = 0;
  let index = 0;
  while (index < content.length) {
    const next = skipJsonComment(content, index);
    if (next !== index) {
      index = next;
      continue;
    }
    if (content[index] === '"') {
      const end = findJsonStringEnd(content, index);
      if (depth === 1 && readJsonString(content, index, end) === "plugin") {
        const colonIndex = skipJsonTrivia(content, end);
        const arrayStart = skipJsonTrivia(content, colonIndex + 1);
        if (content[colonIndex] === ":" && content[arrayStart] === "[") {
          return { start: arrayStart, end: findJsonArrayClose(content, arrayStart) };
        }
      }
      index = end;
      continue;
    }
    if (content[index] === "{" || content[index] === "[")
      depth++;
    if (content[index] === "}" || content[index] === "]")
      depth--;
    index++;
  }
  return;
}
function findManagedPluginItems(content, pluginArray) {
  const ranges = [];
  let index = pluginArray.start + 1;
  while (index < pluginArray.end) {
    const next = skipJsonComment(content, index);
    if (next !== index) {
      index = next;
      continue;
    }
    if (content[index] === '"') {
      const end = findJsonStringEnd(content, index);
      const value = readJsonString(content, index, end);
      if (typeof value === "string" && value.includes(OPENCODE_PACKAGE)) {
        ranges.push({ start: index, end });
      }
      index = end;
      continue;
    }
    index++;
  }
  return ranges;
}
function parseOpenCodeConfig(content, configPath) {
  try {
    return JSON.parse(stripJsonComments(content));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse OpenCode config ${configPath}: ${error.message}`);
    }
    throw error;
  }
}
function hasManagedPlugin(config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    return false;
  const plugins = config.plugin;
  if (!Array.isArray(plugins))
    return false;
  return plugins.some((plugin) => typeof plugin === "string" && plugin.includes(OPENCODE_PACKAGE));
}
function removeManagedPlugins(content, configPath) {
  const pluginArray = findOpenCodePluginArray(content);
  if (!pluginArray)
    throw new Error(`Failed to locate OpenCode plugin array in ${configPath}`);
  const updated = [...findManagedPluginItems(content, pluginArray)].reverse().reduce(removeArrayRangeItem, content);
  parseOpenCodeConfig(updated, configPath);
  return updated;
}
function uninstallOpenCode(homeDir) {
  clearOpenCodeCache(homeDir);
  const configPaths = getOpenCodeConfigPaths(homeDir);
  const existingConfigPath = configPaths.find((configPath) => existsSync17(configPath));
  const errors = [];
  for (const configPath of configPaths) {
    if (!existsSync17(configPath))
      continue;
    try {
      const content = readFileSync15(configPath, "utf-8");
      if (!hasManagedPlugin(parseOpenCodeConfig(content, configPath)))
        continue;
      writeFileSync5(configPath, removeManagedPlugins(content, configPath));
      return { path: configPath, alreadyInstalled: true };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length > 0)
    throw new Error(errors.join(`
`));
  return {
    path: existingConfigPath ?? getDefaultOpenCodeConfigPath(homeDir),
    alreadyInstalled: false
  };
}

// src/bin/hook/install/selection.ts
import { spawn as spawn3, spawnSync as spawnSync2 } from "node:child_process";
import * as readline2 from "node:readline";

// src/bin/hook/install/targets.ts
var INSTALL_TARGETS = [
  {
    target: "antigravity-cli",
    flag: "--agy-cli",
    label: "Antigravity CLI",
    probeCommand: ["agy", "--version"]
  },
  {
    target: "claude-code",
    flag: "--claude-code",
    label: "Claude Code",
    probeCommand: ["claude", "--version"]
  },
  { target: "codex", flag: "--codex", label: "Codex", probeCommand: ["codex", "--version"] },
  {
    target: "gemini-cli",
    flag: "--gemini-cli",
    label: "Gemini CLI",
    probeCommand: ["gemini", "--version"]
  },
  {
    target: "copilot-cli",
    flag: "--copilot-cli",
    label: "GitHub Copilot CLI",
    probeCommand: ["copilot", "--binary-version"]
  },
  {
    target: "kimi-code",
    flag: "--kimi-code",
    label: "Kimi Code",
    probeCommand: ["kimi", "--version"]
  },
  {
    target: "opencode",
    flag: "--opencode",
    label: "OpenCode",
    probeCommand: ["opencode", "--version"]
  },
  { target: "pi", flag: "--pi", label: "Pi", probeCommand: ["pi", "--version"] }
];
var TARGET_FLAGS = new Map(INSTALL_TARGETS.map((target) => [target.flag, target.target]));
function orderInstallTargets(targets) {
  const selectedTargets = new Set(targets);
  return INSTALL_TARGETS.map((target) => target.target).filter((target) => selectedTargets.has(target));
}
function runInstallTargetsInOrder(targets, runTarget) {
  targets.forEach(runTarget);
}

// src/bin/hook/install/selection.ts
var PROBE_TIMEOUT_MS = 2000;
var ASYNC_PROBE_TIMEOUT_MS = 1000;
function titleCaseAction(action) {
  return action === "install" ? "Install" : "Uninstall";
}
function activeVerb(action) {
  return action === "install" ? "Installing" : "Uninstalling";
}
function targetPreposition(action) {
  return action === "install" ? "into" : "from";
}
function isAvailable(choice) {
  return choice?.available === true;
}
function selectedInChoiceOrder(choices, selected) {
  const selectedTargets = new Set(selected);
  return choices.filter((choice) => selectedTargets.has(choice.target)).map((choice) => choice.target);
}
function nextSelectableCursor(choices, cursor, direction) {
  if (choices.length === 0 || choices.every((choice) => !choice.available))
    return 0;
  return Array.from({ length: choices.length }, (_, index) => index + 1).map((offset) => (cursor + offset * direction + choices.length) % choices.length).find((index) => isAvailable(choices[index]));
}
function mapKeyPress(input, key) {
  if (key.ctrl && key.name === "c")
    return "abort";
  if (key.name === "escape" || input === "q")
    return "abort";
  if (key.name === "up" || input === "k")
    return "up";
  if (key.name === "down" || input === "j")
    return "down";
  if (key.name === "space" || input === " ")
    return "toggle";
  if (key.name === "return" || key.name === "enter")
    return "confirm";
  return null;
}
function defaultInstallTargetProbe(command2) {
  const result = spawnSync2(command2[0], command2.slice(1), {
    env: process.env,
    stdio: "ignore",
    timeout: PROBE_TIMEOUT_MS
  });
  return !result.error && result.status === 0;
}
function defaultAsyncInstallTargetProbe(command2) {
  return new Promise((resolve13) => {
    const proc = spawn3(command2[0], command2.slice(1), {
      env: process.env,
      stdio: "ignore"
    });
    let settled = false;
    const finish = (available) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timeoutId);
      resolve13(available);
    };
    const timeoutId = setTimeout(() => {
      proc.kill();
      finish(false);
    }, ASYNC_PROBE_TIMEOUT_MS);
    proc.on("error", () => finish(false));
    proc.on("close", (code) => finish(code === 0));
  });
}
function buildInstallTargetChoices(probe = defaultInstallTargetProbe, options2 = {}) {
  const configuredTargets = new Set(options2.configuredTargets ?? []);
  if (options2.async) {
    return Promise.all(INSTALL_TARGETS.map(async (target) => ({
      target: target.target,
      flag: target.flag,
      label: target.label,
      ...getChoiceAvailability(options2.action, await probe(target.probeCommand), configuredTargets.has(target.target))
    })));
  }
  const syncProbe = probe;
  return INSTALL_TARGETS.map((target) => ({
    target: target.target,
    flag: target.flag,
    label: target.label,
    ...getChoiceAvailability(options2.action, syncProbe(target.probeCommand), configuredTargets.has(target.target))
  }));
}
function buildInstallTargetChoicesAsync(probe = defaultAsyncInstallTargetProbe, options2 = {}) {
  return buildInstallTargetChoices(probe, { ...options2, async: true });
}
function applyInstallTargetState(choices, options2) {
  const configuredTargets = new Set(options2.configuredTargets ?? []);
  return choices.map((choice) => ({
    ...choice,
    ...getChoiceAvailability(options2.action, choice.available, configuredTargets.has(choice.target))
  }));
}
function getChoiceAvailability(action, cliAvailable, configured) {
  if (!cliAvailable)
    return { available: false, unavailableReason: "CLI not installed" };
  if (action === "install" && configured)
    return { available: false, unavailableReason: "already installed" };
  if (action === "uninstall" && !configured)
    return { available: false, unavailableReason: "not installed" };
  return { available: true };
}
function createInstallSelectionState(choices) {
  return {
    cursor: choices.findIndex((choice) => choice.available),
    selected: []
  };
}
function reduceInstallSelectionState(state, choices, key) {
  if (key === "confirm" || key === "abort")
    return { state, done: key };
  if (key === "up") {
    return { state: { ...state, cursor: nextSelectableCursor(choices, state.cursor, -1) } };
  }
  if (key === "down") {
    return { state: { ...state, cursor: nextSelectableCursor(choices, state.cursor, 1) } };
  }
  const choice = choices[state.cursor];
  if (!isAvailable(choice))
    return { state };
  const selected = state.selected.includes(choice.target) ? state.selected.filter((target) => target !== choice.target) : selectedInChoiceOrder(choices, [...state.selected, choice.target]);
  return { state: { ...state, selected } };
}
var CHECKBOX_ON = "◉";
var CHECKBOX_OFF = "◯";
var CURSOR_ON = ">";
var CURSOR_OFF = " ";
function renderInstallSelection(action, choices, state, options2 = {}) {
  const useColor = options2.color !== false;
  const formatDim = useColor ? colors.dim : (value) => value;
  const formatCheckboxOn = useColor ? colors.green : (value) => value;
  const formatFocus = useColor ? colors.bold : (value) => value;
  return [
    "",
    `${titleCaseAction(action)} CC Safety Net ${targetPreposition(action)}:`,
    "",
    ...choices.map((choice, index) => {
      const selected = state.selected.includes(choice.target);
      const focused = index === state.cursor;
      const marker = selected ? CHECKBOX_ON : CHECKBOX_OFF;
      const cursor = focused ? CURSOR_ON : CURSOR_OFF;
      const suffix = choice.available ? "" : ` (${choice.unavailableReason ?? "not installed"})`;
      const rowBody = `${marker} ${choice.label}${suffix}`;
      const formatted = !choice.available ? formatDim(rowBody) : selected ? formatCheckboxOn(rowBody) : focused ? formatFocus(rowBody) : rowBody;
      return `${cursor} ${formatted}`;
    }),
    "",
    "Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel"
  ].join(`
`);
}
function canPromptInstallTargets(input = process.stdin, output = process.stdout) {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === "function");
}
function promptInstallTargets(action, choices, options2 = {}) {
  const input = options2.input ?? process.stdin;
  const output = options2.output ?? process.stdout;
  let state = createInstallSelectionState(choices);
  if (choices.every((choice) => !choice.available)) {
    output.write(`${renderInstallSelection(action, choices, state)}
`);
    output.write(`No selectable integrations found for ${action}.
`);
    return Promise.resolve(null);
  }
  readline2.emitKeypressEvents(input);
  const wasRaw = input.isRaw === true;
  input.setRawMode(true);
  input.resume();
  let renderedLines = 0;
  const clearFrame = () => {
    if (renderedLines === 0)
      return;
    readline2.moveCursor(output, 0, -renderedLines);
    readline2.cursorTo(output, 0);
    readline2.clearScreenDown(output);
  };
  const draw = () => {
    clearFrame();
    const frame = renderInstallSelection(action, choices, state);
    output.write(`${frame}
`);
    renderedLines = frame.split(`
`).length;
  };
  return new Promise((resolve13) => {
    const cleanup = () => {
      input.off("keypress", onKeyPress);
      input.setRawMode(wasRaw);
      input.pause();
      clearFrame();
    };
    const finish = (targets) => {
      cleanup();
      if (targets && targets.length > 0) {
        output.write(`${activeVerb(action)} selected integrations...
`);
      }
      resolve13(targets);
    };
    function onKeyPress(inputValue, key) {
      const mappedKey = mapKeyPress(inputValue, key);
      if (!mappedKey)
        return;
      const next = reduceInstallSelectionState(state, choices, mappedKey);
      state = next.state;
      if (next.done === "abort") {
        finish(null);
        return;
      }
      if (next.done === "confirm") {
        if (state.selected.length === 0) {
          output.write("\x07");
          draw();
          return;
        }
        finish(state.selected);
        return;
      }
      draw();
    }
    input.on("keypress", onKeyPress);
    draw();
  });
}

// src/bin/hook/install.ts
var NATIVE_INSTALLS = {
  "claude-code": {
    name: "Claude Code",
    installCommands: [
      ["claude", "plugin", "marketplace", "add", "kenryu42/cc-marketplace"],
      ["claude", "plugin", "install", "safety-net@cc-marketplace"]
    ],
    uninstallCommands: [
      ["claude", "plugin", "uninstall", "safety-net@cc-marketplace"],
      ["claude", "plugin", "marketplace", "remove", "cc-marketplace"]
    ]
  },
  codex: {
    name: "Codex",
    installCommands: [
      ["codex", "plugin", "marketplace", "add", "kenryu42/cc-marketplace"],
      ["codex", "plugin", "add", "safety-net@cc-marketplace"]
    ],
    uninstallCommands: [
      ["codex", "plugin", "remove", "safety-net@cc-marketplace"],
      ["codex", "plugin", "marketplace", "remove", "cc-marketplace"]
    ],
    postInstallMessage: "Start Codex, open `/hooks`, select the safety-net PreToolUse hook, and press `t` to trust it."
  },
  "copilot-cli": {
    name: "GitHub Copilot CLI",
    installCommands: [
      ["copilot", "plugin", "marketplace", "add", "kenryu42/cc-marketplace"],
      ["copilot", "plugin", "install", "safety-net@cc-marketplace"]
    ],
    uninstallCommands: [
      ["copilot", "plugin", "uninstall", "safety-net@cc-marketplace"],
      ["copilot", "plugin", "marketplace", "remove", "cc-marketplace"]
    ]
  },
  "gemini-cli": {
    name: "Gemini CLI",
    installCommands: [
      ["gemini", "extensions", "install", "https://github.com/kenryu42/gemini-safety-net"]
    ],
    uninstallCommands: [["gemini", "extensions", "uninstall", "gemini-safety-net"]]
  },
  opencode: {
    name: "OpenCode",
    beforeInstall: clearOpenCodeCache,
    installCommands: [["opencode", "plugin", "-g", "-f", "cc-safety-net@latest"]]
  },
  pi: {
    name: "Pi",
    installCommands: [["pi", "install", "npm:cc-safety-net"]],
    uninstallCommands: [["pi", "uninstall", "npm:cc-safety-net"]]
  }
};
function getHomeDir() {
  return process.env.HOME ?? homedir8();
}
function parseInstallTarget(args, action) {
  const unknownOption = args.find((arg) => arg.startsWith("-") && !TARGET_FLAGS.has(arg));
  if (unknownOption)
    throw new Error(`Unknown ${action} option: ${unknownOption}`);
  const unexpectedArg = args.find((arg) => !arg.startsWith("-"));
  if (unexpectedArg)
    throw new Error(`Unexpected argument for ${action}: ${unexpectedArg}`);
  const targets = args.flatMap((arg) => {
    const target = TARGET_FLAGS.get(arg);
    return target ? [target] : [];
  });
  if (targets.length !== 1)
    throw new Error(`Choose exactly one ${action} target: ${[...TARGET_FLAGS.keys()].join(", ")}`);
  return targets[0];
}
async function settle(promise) {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}
function unwrapSettled(result) {
  if (result.ok)
    return result.value;
  throw result.error;
}
async function detectConfiguredInstallTargets() {
  const piRawPromise = defaultVersionFetcher(["pi", "--version"]);
  const copilotBinaryVersionPromise = defaultVersionFetcher(["copilot", "--binary-version"]);
  const copilotFallbackVersionPromise = defaultVersionFetcher(["copilot", "--version"]);
  const piProbePromise = piRawPromise.then((piRaw) => {
    if (!piRaw)
      return { status: "unavailable", installedAndEnabled: false, matched: [] };
    return defaultPiProbeRunner(process.cwd());
  });
  const [
    claudePluginListOutput,
    codexPluginListOutput,
    geminiExtensionsListOutput,
    copilotBinaryVersion,
    copilotFallbackVersion,
    copilotPluginListOutput,
    piSafetyNetProbe
  ] = await Promise.all([
    defaultVersionFetcher(["claude", "plugin", "list"]),
    defaultVersionFetcher(["codex", "plugin", "list"]),
    defaultVersionFetcher(["gemini", "extensions", "list"]),
    copilotBinaryVersionPromise,
    copilotFallbackVersionPromise,
    defaultVersionFetcher(["copilot", "plugin", "list"]),
    piProbePromise
  ]);
  return detectAllHooks(process.cwd(), {
    claudePluginListOutput,
    codexPluginListOutput,
    geminiExtensionsListOutput,
    copilotCliVersion: copilotBinaryVersion ?? copilotFallbackVersion,
    copilotPluginInstalled: hasCopilotSafetyNetPlugin2(copilotPluginListOutput),
    piSafetyNetProbe
  }).filter((hook) => hook.status !== "n/a").map((hook) => hook.platform);
}
function hasCopilotSafetyNetPlugin2(output) {
  return /(^|[^a-z0-9-])copilot-safety-net([^a-z0-9-]|$)/m.test(output ?? "");
}
function startResolveInstallTargets(action, args, options2) {
  if (args.length > 0)
    return {
      finish: async () => [parseInstallTarget(args, action)]
    };
  if (!options2.selectTargets && !canPromptInstallTargets(options2.input, options2.output)) {
    return {
      finish: async () => [parseInstallTarget(args, action)]
    };
  }
  const detectConfiguredTargets = options2.detectConfiguredTargets ?? detectConfiguredInstallTargets;
  const configuredTargetsPromise = settle(detectConfiguredTargets());
  const choicesPromise = settle(buildInstallTargetChoicesAsync(options2.probeTargets));
  const ready = Promise.all([choicesPromise, configuredTargetsPromise]);
  return {
    ready,
    finish: async () => {
      const [choices, configuredTargets] = await ready;
      const targetChoices = applyInstallTargetState(unwrapSettled(choices), {
        action,
        configuredTargets: unwrapSettled(configuredTargets)
      });
      const selected = options2.selectTargets ? await options2.selectTargets(action, targetChoices) : await promptInstallTargets(action, targetChoices, {
        input: options2.input,
        output: options2.output
      });
      if (!selected || selected.length === 0)
        return null;
      return orderInstallTargets(selected);
    }
  };
}
function isNativeInstallTarget(target) {
  return target in NATIVE_INSTALLS;
}
function installNativeTarget(target, homeDir) {
  const definition = NATIVE_INSTALLS[target];
  definition.beforeInstall?.(homeDir);
  runNativeCommands(definition.installCommands);
  console.log([`Installed ${definition.name} integration`, definition.postInstallMessage].filter(Boolean).join(`
`));
}
function uninstallNativeTarget(target) {
  const definition = NATIVE_INSTALLS[target];
  if (!definition.uninstallCommands)
    throw new Error(`${definition.name} uninstall is not supported`);
  runNativeCommands(definition.uninstallCommands);
  console.log(`Uninstalled ${definition.name} integration`);
}
function uninstallOpenCodeTarget(homeDir) {
  const result = uninstallOpenCode(homeDir);
  console.log(result.alreadyInstalled ? `Uninstalled OpenCode plugin from ${result.path}` : `OpenCode plugin not installed in ${result.path}`);
}
function runSingleInstallTarget(action, target, homeDir) {
  if (action === "install" && isNativeInstallTarget(target)) {
    installNativeTarget(target, homeDir);
    return;
  }
  if (action === "uninstall" && target === "opencode") {
    uninstallOpenCodeTarget(homeDir);
    return;
  }
  if (action === "uninstall" && isNativeInstallTarget(target) && target !== "opencode") {
    uninstallNativeTarget(target);
    return;
  }
  const result = target === "kimi-code" ? action === "install" ? installKimiCode(homeDir) : uninstallKimiCode(homeDir) : action === "install" ? installAntigravityCli(homeDir) : uninstallAntigravityCli(homeDir);
  const name = target === "kimi-code" ? "Kimi Code" : "Antigravity CLI";
  const pastTense = action === "install" ? "Installed" : "Uninstalled";
  console.log(action === "install" && result.alreadyInstalled ? `${name} hook already installed in ${result.path}` : action === "uninstall" && !result.alreadyInstalled ? `${name} hook not installed in ${result.path}` : `${pastTense} ${name} hook ${action === "install" ? "in" : "from"} ${result.path}`);
}
async function runInstallCommand(action, args, options2 = {}) {
  try {
    const targets = await resolveAfterOptionalBanner(true, () => startResolveInstallTargets(action, args, options2), () => printInstallBanner({
      input: options2.input ?? process.stdin,
      output: options2.output ?? process.stdout
    }), {
      loadingMessage: action === "install" ? "Checking available integrations…" : "Checking installed integrations…",
      output: options2.output ?? process.stdout
    });
    if (!targets)
      return 1;
    const homeDir = getHomeDir();
    runInstallTargetsInOrder(targets, (target) => runSingleInstallTarget(action, target, homeDir));
    return 0;
  } catch (e) {
    console.error(formatInstallError(e));
    return 1;
  }
}
function formatInstallError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  if (code === "EACCES" || code === "EPERM") {
    return `${message}
Check file permissions for the target config file and parent directory.`;
  }
  if (code === "ENOENT") {
    return `${message}
Check that the target config path and parent directory exist.`;
  }
  if (code === "ENOTDIR") {
    return `${message}
Check that every parent path component is a directory.`;
  }
  return message;
}

// src/bin/rule/index.ts
import { existsSync as existsSync20, mkdirSync as mkdirSync7 } from "node:fs";
import { dirname as dirname17, join as join20 } from "node:path";

// src/bin/rule/doc.ts
var RULE_DOC = `# Custom Rules Reference

Agent reference for generating CC Safety Net rulebook configuration.

## Config Locations

| Scope | Config path | Rulebook path | Cache path | Priority |
|-------|-------------|---------------|------------|----------|
| User | \`~/.cc-safety-net/rules/rule.json\` | \`~/.cc-safety-net/rules/<rulebook-name>/rulebook.json\` | \`~/.cc-safety-net/cache/rulebooks/\` | Lower |
| Project | \`.cc-safety-net/rules/rule.json\` | \`.cc-safety-net/rules/<rulebook-name>/rulebook.json\` | \`.cc-safety-net/cache/rulebooks/\` | Higher |
| GitHub source | Listed in a local \`rule.json\` | \`.cc-safety-net/rules/<rulebook-name>/rulebook.json\` in the source repository | Consumer local cache | Source order |

Use \`cc-safety-net rule init\` to create an inert local config. Use \`--global\` for user scope. Use \`cc-safety-net rule init --example\` to also create an inactive example rulebook.

Legacy inline \`.safety-net.json\` and \`~/.cc-safety-net/config.json\` files are not loaded at runtime. Convert them with \`cc-safety-net rule migrate\`.

## rule.json Schema

\`\`\`json
{
  "version": 1,
  "rules": ["project-rules", "owner/repo#main/team-rules"],
  "overrides": {
    "project-rules/block-docker-system-prune": {
      "reason": "Use targeted Docker cleanup commands."
    },
    "team-rules/block-npm-global": "off"
  },
  "transparent_wrappers": ["rtk"]
}
\`\`\`

- \`version\`: Required. Must be \`1\`.
- \`rules\`: Optional array of rulebook source strings. Missing \`rules\` is treated as \`[]\`.
- \`overrides\`: Optional object keyed by \`<rulebook-name>/<rule-name>\`.
- Override values are either \`"off"\` to disable a rule or \`{ "reason": "..." }\` to replace the rule reason.
- Project overrides cannot disable or rewrite user-scoped rules; such configs fail closed.
- \`transparent_wrappers\`: Optional array of command names that transparently execute a visible child command.
- Transparent wrappers have no built-in defaults. Configure only wrappers you intentionally trust, such as \`"rtk"\`.
- Use \`cc-safety-net rule wrapper add rtk\` to configure RTK without manually editing \`rule.json\`.

## Rulebook Sources

- Local sources are bare rulebook names such as \`project-rules\`; the rulebook file is \`.cc-safety-net/rules/project-rules/rulebook.json\`.
- GitHub sources use \`owner/repo#ref/<rulebook-name>\`.
- GitHub refs must be one path segment, such as a tag, SHA, or branch name without \`/\`.
- Rulebook source names must be unique in a config.

## rulebook.json Schema

\`\`\`json
{
  "rulebook_version": 1,
  "name": "project-rules",
  "version": "1.0.0",
  "description": "Project-specific CC Safety Net rules.",
  "author": "project",
  "allowed_commands": ["docker"],
  "rules": [
    {
      "name": "block-docker-system-prune",
      "command": "docker",
      "subcommand": "system",
      "block_args": ["prune"],
      "reason": "Use targeted cleanup instead."
    }
  ],
  "tests": [
    {
      "command": "docker system prune",
      "expect": "blocked",
      "rule": "block-docker-system-prune"
    },
    {
      "command": "docker ps",
      "expect": "allowed"
    }
  ]
}
\`\`\`

### Rulebook Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| \`rulebook_version\` | Yes | Must be \`1\` |
| \`name\` | Yes | \`^[a-zA-Z][a-zA-Z0-9_-]{0,63}$\` |
| \`version\` | Yes | Non-empty string |
| \`description\` | No | String |
| \`author\` | No | String |
| \`allowed_commands\` | Yes | Unique command names matching \`^[a-zA-Z][a-zA-Z0-9_-]*$\` |
| \`rules\` | Yes | Array of rule objects |
| \`tests\` | Yes | Array of fixtures |

### Rule Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| \`name\` | Yes | Unique within the rulebook; same pattern as rulebook \`name\` |
| \`command\` | Yes | Must be listed in \`allowed_commands\`; basename only, not path |
| \`subcommand\` | No | Same pattern as \`command\`; omit to match any subcommand |
| \`block_args\` | Yes | Non-empty array of non-empty strings |
| \`reason\` | Yes | Non-empty string, max 256 chars |

### Test Fixture Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| \`command\` | Yes | Non-empty shell command string |
| \`expect\` | Yes | \`"blocked"\` or \`"allowed"\` |
| \`rule\` | Required for blocked fixtures | Rule name expected to block the command |

Every rule must have at least one blocked fixture. Add allowed fixtures for close-but-safe commands.

## Matching Behavior

- **Command**: Normalized to basename (\`/usr/bin/git\` → \`git\`).
- **Subcommand**: First non-option argument after command.
- **Arguments**: Matched literally. Command blocked if **any** \`block_args\` item is present.
- **Short options**: Expanded (\`-Ap\` matches \`-A\`).
- **Long options**: Exact match (\`--all-files\` does not match \`--all\`).
- **Execution order**: Built-in rules first, then custom rulebooks. Custom rules only add restrictions.
- **Transparent wrappers**: A configured wrapper such as \`rtk\` lets \`rtk git commit\` be analyzed as \`git commit\` only when \`git\` is protected by built-in analyzers or active custom rules. \`rtk -- git commit\` is also supported.

## Workflow

1. Run \`cc-safety-net rule init\` or create \`rule.json\` manually.
2. Optionally run \`cc-safety-net rule init --example\` to create an inactive example rulebook.
3. Use \`cc-safety-net rule wrapper add rtk\` for trusted transparent wrappers.
4. Run \`cc-safety-net rule add <source>\` after creating or choosing a rulebook source.
5. Run \`cc-safety-net rule sync\` after adding or changing rulebook sources.
6. Run \`cc-safety-net rule verify\` to validate config, lock/cache state, local rulebooks, and GitHub source rulebooks.
7. Run \`cc-safety-net rule test\` to execute rulebook fixtures.
8. Run \`cc-safety-net rule list\` to inspect active rulebooks and transparent wrappers.

Invalid rule config, corrupt cache, invalid local rulebooks, or remote rulebook repair failures fail closed until repaired with \`cc-safety-net rule sync\`.
`;

// src/bin/rule/format.ts
function printRuleChangeResult(result, action) {
  if (!result.ok) {
    printResultErrors(result);
    return;
  }
  printResultWarnings(result);
  console.log(action);
  console.log("Rule config synced.");
  console.log("");
  printActiveRulebookSummary(result.entries);
}
function printActiveRulebookSummary(entries) {
  if (entries.length === 0) {
    console.log("Active rulebooks: (none)");
    return;
  }
  console.log(`Active rulebooks (${entries.length}):`);
  for (const entry of entries) {
    console.log(`  - ${entry.name} ${entry.version} (${formatRuleCount(entry.ruleCount ?? 0)})`);
    console.log(`    Source: ${formatRulebookSource(entry, new Map)}`);
  }
}
function formatRuleCount(count) {
  return `${count} ${count === 1 ? "rule" : "rules"}`;
}
function formatRulebookSource(entry, sourceDisplayMap) {
  return sourceDisplayMap.get(entry.spec) ?? getRulebookDisplaySource(entry);
}
function printRulesTestResult(result, sourceDisplayMap = new Map) {
  if (!result.ok) {
    printResultErrors(result);
    return;
  }
  printResultWarnings(result);
  console.log("Rulebook tests passed.");
  console.log("");
  for (const entry of result.entries) {
    console.log(`  ${entry.name} ${entry.version}`);
    console.log(`    Source: ${formatRulebookSource(entry, sourceDisplayMap)}`);
    console.log(`    Rules: ${entry.ruleCount ?? 0}`);
    console.log(`    Tests: ${entry.testCount ?? 0}`);
  }
  if (result.entries.length < 2)
    return;
  console.log("");
  console.log(`Tested ${result.entries.length} rulebooks, ${sumStats(result.entries, "ruleCount")} rules, ${sumStats(result.entries, "testCount")} tests.`);
}
function printRulesListReport(policy, sourceDisplayMaps) {
  printListSection("Active sources", policy.rulebooks, (rulebook) => [
    `[${rulebook.source}] ${rulebook.name} ${rulebook.version}`,
    `  Source: ${sourceDisplayMaps[rulebook.source].get(rulebook.spec) ?? rulebook.spec}`
  ]);
  printListSection("Active rules", policy.rules, (rule) => [
    `[${getRuleSource(policy, rule.name)}] ${rule.name}`,
    `  Command: ${rule.subcommand ? `${rule.command} ${rule.subcommand}` : rule.command}`,
    `  Block args: ${rule.block_args.join(", ")}`,
    `  Reason: ${rule.reason}`
  ]);
  printListSection("Disabled rules", getMergedOverrides(policy, "off"), (override) => [
    override.key
  ]);
  printListSection("Reason overrides", getMergedOverrides(policy, "reason"), (override) => [
    override.key,
    `  Reason: ${override.value.reason}`
  ]);
  printListSection("Transparent wrappers", policy.transparent_wrappers, (wrapper) => [wrapper]);
  printListSection("Issues", policy.errors, (error) => [error]);
}
function printListSection(title, items, format) {
  if (items.length === 0) {
    console.log(`${title}: (none)`);
    return;
  }
  console.log(`${title} (${items.length}):`);
  for (const item of items) {
    const [firstLine, ...detailLines] = format(item);
    console.log(`  - ${firstLine}`);
    for (const line of detailLines)
      console.log(`    ${line}`);
  }
}
function getRuleSource(policy, ruleName) {
  return policy.rulebooks.find((rulebook) => rulebook.rules.includes(ruleName))?.source ?? "project";
}
function getMergedOverrides(policy, kind) {
  return Object.entries({
    ...policy.userConfig?.overrides ?? {},
    ...policy.projectConfig?.overrides ?? {}
  }).filter((entry) => {
    if (kind === "off")
      return entry[1] === "off";
    return !!entry[1] && typeof entry[1] === "object";
  }).map(([key, value]) => ({ key, value }));
}
function sumStats(entries, key) {
  return entries.reduce((total, entry) => total + (entry[key] ?? 0), 0);
}
function printResultErrors(result) {
  for (const error of result.errors)
    console.error(error);
}
function printResultWarnings(result) {
  if (!result.warnings || result.warnings.length === 0)
    return;
  for (const warning of result.warnings)
    console.warn(warning);
}

// src/bin/rule/migrate.ts
import { existsSync as existsSync18, readFileSync as readFileSync16, rmSync as rmSync4, writeFileSync as writeFileSync6 } from "node:fs";
import { dirname as dirname15, join as join18 } from "node:path";
var PROJECT_MIGRATED_FROM = ".safety-net.json";
var USER_MIGRATED_FROM = "~/.cc-safety-net/config.json";
async function runRulesMigrate(options2) {
  const results = [
    await migrateRulesScope({
      legacyPath: getLegacyProjectRulesConfigPath({ cwd: options2.cwd }),
      configPath: getProjectRulesConfigPath(options2.cwd),
      defaultRulebookName: "project-rules",
      migratedFrom: PROJECT_MIGRATED_FROM,
      cleanup: options2.cleanup,
      syncOptions: { cwd: options2.cwd }
    }),
    await migrateRulesScope({
      legacyPath: getLegacyUserRulesConfigPath(),
      configPath: getUserRulesConfigPath(),
      defaultRulebookName: "user-rules",
      migratedFrom: USER_MIGRATED_FROM,
      cleanup: options2.cleanup,
      syncOptions: { cwd: options2.cwd, global: true }
    })
  ];
  return results.every((result) => result) ? 0 : 1;
}
async function migrateRulesScope(options2) {
  if (!existsSync18(options2.legacyPath)) {
    console.log(`No legacy config found at ${options2.legacyPath}`);
    return true;
  }
  const legacy = readLegacyRulesConfig(options2.legacyPath);
  if (!legacy.ok) {
    for (const error of legacy.errors)
      console.error(error);
    return false;
  }
  const loaded = readRulesConfig(options2.configPath);
  if (loaded.errors.length > 0) {
    for (const error of loaded.errors)
      console.error(error);
    return false;
  }
  const config = loaded.config ?? { version: 1, rules: [], overrides: {} };
  const rulebookName = getMigratedRulebookName(dirname15(options2.configPath), config.rules, options2.defaultRulebookName, options2.migratedFrom);
  const rulebookPath = join18(dirname15(options2.configPath), rulebookName, "rulebook.json");
  const snapshots = [
    snapshotFile(options2.configPath),
    snapshotFile(rulebookPath),
    snapshotFile(getRulesLockPathForConfigPath(options2.configPath))
  ];
  const result = await writeAndSyncMigratedRulebook(options2, rulebookPath, rulebookName, legacy.config.rules, config.rules.includes(rulebookName) ? config.rules : [...config.rules, rulebookName], config.overrides ?? {}, config.transparent_wrappers ?? []);
  if (!result.ok) {
    restoreFiles(snapshots);
    for (const error of result.errors)
      console.error(error);
    return false;
  }
  if (!options2.cleanup) {
    console.log(`Migrated legacy config at ${options2.legacyPath}. Legacy file is no longer used.`);
    return true;
  }
  if (!isCleanupVerified(options2.configPath, rulebookPath, rulebookName, options2.migratedFrom, legacy.config.rules)) {
    console.error(`Migration cleanup verification failed for ${options2.legacyPath}`);
    return false;
  }
  rmSync4(options2.legacyPath, { force: true });
  console.log(`Deleted legacy config at ${options2.legacyPath}`);
  return true;
}
async function writeAndSyncMigratedRulebook(options2, rulebookPath, rulebookName, rules, configRules, overrides, transparentWrappers) {
  try {
    writeJsonAtomic(options2.configPath, {
      version: 1,
      rules: configRules,
      overrides,
      transparent_wrappers: transparentWrappers
    });
    writeJsonAtomic(rulebookPath, getMigratedRulebook(rulebookName, options2.migratedFrom, rules));
    return await syncRulesConfig(options2.syncOptions);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
function readLegacyRulesConfig(path) {
  try {
    const parsed = JSON.parse(readFileSync16(path, "utf-8"));
    const validation = validateConfig(parsed);
    if (validation.errors.length > 0)
      return { ok: false, errors: validation.errors };
    return {
      ok: true,
      config: {
        version: 1,
        rules: parsed.rules ?? []
      }
    };
  } catch (error) {
    return {
      ok: false,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}
function getMigratedRulebookName(configDir, sources, defaultRulebookName, migratedFrom) {
  const existing = sources.find((source) => getRulebookMigratedFrom(configDir, source) === migratedFrom);
  if (existing)
    return existing;
  if (!existsSync18(join18(configDir, defaultRulebookName, "rulebook.json")))
    return defaultRulebookName;
  for (let i = 2;; i++) {
    const name = `${defaultRulebookName}-${i}`;
    if (!existsSync18(join18(configDir, name, "rulebook.json")))
      return name;
  }
}
function getMigratedRulebook(name, migratedFrom, rules) {
  return {
    rulebook_version: 1,
    name,
    version: "1.0.0",
    description: "Migrated CC Safety Net rules.",
    author: "project",
    migrated_from: migratedFrom,
    allowed_commands: [...new Set(rules.map((rule) => rule.command))],
    rules,
    tests: rules.map((rule) => ({
      command: [rule.command, rule.subcommand, rule.block_args[0]].filter(Boolean).join(" "),
      expect: "blocked",
      rule: rule.name
    }))
  };
}
function isCleanupVerified(configPath, rulebookPath, rulebookName, migratedFrom, legacyRules) {
  const config = readRulesConfig(configPath).config;
  if (!config?.rules.includes(rulebookName) || !existsSync18(rulebookPath))
    return false;
  try {
    const rulebook = JSON.parse(readFileSync16(rulebookPath, "utf-8"));
    return rulebook.migrated_from === migratedFrom && JSON.stringify(rulebook.rules) === JSON.stringify(legacyRules);
  } catch {
    return false;
  }
}
function snapshotFile(path) {
  return { path, content: existsSync18(path) ? readFileSync16(path, "utf-8") : null };
}
function restoreFiles(snapshots) {
  for (const snapshot of snapshots) {
    if (snapshot.content === null) {
      rmSync4(snapshot.path, { force: true });
      continue;
    }
    writeFileSync6(snapshot.path, snapshot.content, "utf-8");
  }
}

// src/bin/rule/verify.ts
import { existsSync as existsSync19, readdirSync as readdirSync4, readFileSync as readFileSync17, statSync as statSync3, writeFileSync as writeFileSync7 } from "node:fs";
import { dirname as dirname16, join as join19, resolve as resolve13 } from "node:path";
var VERIFY_HEADER = "CC Safety Net Config";
var VERIFY_SEPARATOR = "═".repeat(VERIFY_HEADER.length);
var RULES_SCHEMA_URL = "https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json";
var RULES_DIR_RESERVED_ENTRIES = new Set(["rule.json", "rule.lock", "cache"]);
function runRulesVerify(options2 = {}) {
  const cwd = options2.cwd ?? process.cwd();
  const userConfig = options2.userConfigPath ?? getUserRulesConfigPath();
  const projectConfig = options2.projectConfigPath ?? getProjectRulesConfigPath(cwd);
  const legacyUserConfig = options2.legacyUserConfigPath ?? getLegacyUserRulesConfigPath();
  const legacyProjectConfig = options2.legacyProjectConfigPath ?? getLegacyProjectConfigPath(cwd);
  const githubSourceRulesDir = resolve13(cwd, RULES_DIR);
  const userConfigDir = dirname16(userConfig);
  let hasErrors = false;
  let hasWarnings = false;
  const configsChecked = [];
  const warnings = [];
  const githubSourceRules = getGitHubSourceRulesValidation(githubSourceRulesDir);
  printRulesVerifyHeader();
  if (existsSync19(userConfig)) {
    const result = validateRulesConfigFile(userConfig);
    result.errors.push(...getRulesConfigRuntimeErrorsForConfig(userConfig, getUserRulesLockPath({ userConfigDir }), {
      userConfigDir
    }));
    configsChecked.push({
      scope: "User",
      path: userConfig,
      result,
      schema: "rules",
      sourceDisplayMap: getRulesConfigSourceDisplayMap(userConfig)
    });
    if (result.errors.length > 0)
      hasErrors = true;
  }
  if (existsSync19(legacyUserConfig)) {
    hasWarnings = true;
    if (existsSync19(userConfig)) {
      warnings.push(getLegacyRulesConfigWarning("user", "cleanup"));
    } else {
      const result = validateConfigFile(legacyUserConfig);
      configsChecked.push({
        scope: "User",
        path: legacyUserConfig,
        result,
        schema: "legacy",
        sourceDisplayMap: new Map,
        inactive: true
      });
      warnings.push(getLegacyRulesConfigWarning("user", result.errors.length > 0 ? "fix-or-delete" : "migrate"));
      if (result.errors.length > 0)
        hasErrors = true;
    }
  }
  if (existsSync19(projectConfig)) {
    const result = validateRulesConfigFile(projectConfig);
    result.errors.push(...getRulesConfigRuntimeErrorsForConfig(projectConfig, getRulesLockPathForConfigPath(projectConfig), {
      userConfigDir
    }));
    configsChecked.push({
      scope: "Project",
      path: resolve13(projectConfig),
      result,
      schema: "rules",
      sourceDisplayMap: getRulesConfigSourceDisplayMap(projectConfig)
    });
    if (result.errors.length > 0)
      hasErrors = true;
    if (existsSync19(legacyProjectConfig)) {
      hasWarnings = true;
      warnings.push(getLegacyRulesConfigWarning("project", "cleanup"));
    }
  } else if (existsSync19(legacyProjectConfig)) {
    hasWarnings = true;
    hasErrors = true;
    const result = validateConfigFile(legacyProjectConfig);
    configsChecked.push({
      scope: "Project",
      path: resolve13(legacyProjectConfig),
      result,
      schema: "legacy",
      sourceDisplayMap: new Map,
      inactive: true
    });
    warnings.push(getLegacyRulesConfigWarning("project", result.errors.length > 0 ? "fix-or-delete" : "migrate"));
  }
  if (githubSourceRules?.result.errors.length)
    hasErrors = true;
  if (configsChecked.length === 0 && !githubSourceRules) {
    console.log(`
No config files found. Using built-in rules only.`);
    return 0;
  }
  for (const config of configsChecked) {
    if (config.inactive) {
      printInactiveLegacyRulesConfig(config.scope, config.path, config.result, config.sourceDisplayMap);
    } else if (config.result.errors.length > 0) {
      printInvalidRulesConfig(config.scope, config.path, config.result.errors);
    } else {
      if (config.schema === "rules" && addRulesSchemaIfMissing(config.path)) {
        console.log(`
Added $schema to ${config.scope.toLowerCase()} config.`);
      }
      printValidRulesConfig(config.scope, config.path, config.result, config.schema, config.sourceDisplayMap);
    }
  }
  for (const warning of warnings)
    console.error(`
${colors.red(warning)}`);
  if (githubSourceRules) {
    if (githubSourceRules.result.errors.length > 0) {
      printInvalidGitHubSourceRules(githubSourceRules.path, githubSourceRules.result.errors);
    } else {
      printValidGitHubSourceRules(githubSourceRules.path, githubSourceRules.result);
    }
  }
  if (hasErrors) {
    console.error(`
Config validation failed.`);
    return 1;
  }
  console.log(hasWarnings ? `
Configs valid with warnings.` : `
All configs valid.`);
  return 0;
}
function getLegacyRulesConfigWarning(scope, action) {
  const label = `legacy ${scope} config`;
  if (action === "cleanup") {
    return `Warning: Legacy ${scope} config is no longer needed. Run \`npx -y cc-safety-net rule migrate --cleanup\` to clean it up safely.`;
  }
  if (action === "migrate") {
    return `Warning: Legacy ${scope} config is ignored by CC Safety Net. Run \`npx -y cc-safety-net rule migrate\`.`;
  }
  return `Warning: Legacy ${scope} config is no longer supported. Fix or delete the ${label}, then run \`npx -y cc-safety-net rule migrate\`.`;
}
function getGitHubSourceRulesValidation(path) {
  if (!existsSync19(path))
    return null;
  const result = validateGitHubSourceRules(path);
  if (result.ruleNames.size === 0 && result.errors.length === 0)
    return null;
  return { path, result };
}
function validateGitHubSourceRules(path) {
  const errors = [];
  const ruleNames = new Set;
  try {
    if (!statSync3(path).isDirectory()) {
      return { errors: [`${RULES_DIR} must be a directory`], ruleNames };
    }
  } catch (error) {
    return {
      errors: [
        error instanceof Error ? `Failed to inspect ${RULES_DIR}: ${error.message}` : `Failed to inspect ${RULES_DIR}: ${String(error)}`
      ],
      ruleNames
    };
  }
  const entries = readdirSync4(path, { withFileTypes: true }).filter((entry) => !RULES_DIR_RESERVED_ENTRIES.has(entry.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0) {
    return { errors, ruleNames };
  }
  for (const entry of entries) {
    if (!NAME_PATTERN.test(entry.name)) {
      errors.push(`rulebook directory names must match ${NAME_PATTERN}: ${entry.name}`);
      continue;
    }
    if (!entry.isDirectory()) {
      errors.push(`${entry.name} must be a rulebook directory`);
      continue;
    }
    const rulebookPath = join19(path, entry.name, "rulebook.json");
    if (!existsSync19(rulebookPath)) {
      errors.push(`${entry.name}/rulebook.json is required`);
      continue;
    }
    try {
      const rulebook = assertValidRulebook(JSON.parse(readFileSync17(rulebookPath, "utf-8")));
      if (rulebook.name !== entry.name) {
        errors.push(`rulebook name "${rulebook.name}" must match folder "${entry.name}"`);
        continue;
      }
      ruleNames.add(entry.name);
    } catch (error) {
      errors.push(error instanceof Error ? `${entry.name}/rulebook.json: ${error.message}` : `${entry.name}/rulebook.json: ${String(error)}`);
    }
  }
  return { errors, ruleNames };
}
function printRulesVerifyHeader() {
  console.log(VERIFY_HEADER);
  console.log(VERIFY_SEPARATOR);
}
function printValidRulesConfig(scope, path, result, schema, sourceDisplayMap) {
  console.log(`
✓ ${scope} config: ${path}`);
  console.log(`  Schema: ${schema === "rules" ? "rulebook sources" : "legacy inline rules"}`);
  if (result.ruleNames.size > 0) {
    console.log(`  ${schema === "rules" ? "Sources" : "Rules"}:`);
    let i = 1;
    for (const name of result.ruleNames) {
      console.log(`    ${i}. ${sourceDisplayMap.get(name) ?? name}`);
      i++;
    }
  } else {
    console.log(`  ${schema === "rules" ? "Sources" : "Rules"}: (none)`);
  }
}
function printInactiveLegacyRulesConfig(scope, path, result, sourceDisplayMap) {
  console.error(`
✗ Legacy ${scope.toLowerCase()} config: ${path}`);
  console.error("  Schema: legacy inline rules");
  console.error("  Status: ignored by CC Safety Net");
  if (result.errors.length > 0) {
    console.error("  Errors:");
    let errorNum = 1;
    for (const error of result.errors) {
      for (const part of error.split("; ")) {
        console.error(`    ${errorNum}. ${part}`);
        errorNum++;
      }
    }
    return;
  }
  if (result.ruleNames.size > 0) {
    console.error("  Rules:");
    let i = 1;
    for (const name of result.ruleNames) {
      console.error(`    ${i}. ${sourceDisplayMap.get(name) ?? name}`);
      i++;
    }
    return;
  }
  console.error("  Rules: (none)");
}
function printInvalidRulesConfig(scope, path, errors) {
  printInvalidVerifyTarget(`${scope} config`, path, errors);
}
function printValidGitHubSourceRules(path, result) {
  console.log(`
✓ GitHub source rules: ${path}`);
  console.log("  Rulebooks:");
  let i = 1;
  for (const name of result.ruleNames) {
    console.log(`    ${i}. ${name}`);
    i++;
  }
}
function printInvalidGitHubSourceRules(path, errors) {
  printInvalidVerifyTarget("GitHub source rules", path, errors);
}
function printInvalidVerifyTarget(label, path, errors) {
  console.error(`
✗ ${label}: ${path}`);
  console.error("  Errors:");
  let errorNum = 1;
  for (const error of errors) {
    for (const part of error.split("; ")) {
      console.error(`    ${errorNum}. ${part}`);
      errorNum++;
    }
  }
}
function addRulesSchemaIfMissing(path) {
  try {
    const content = readFileSync17(path, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.$schema)
      return false;
    writeFileSync7(path, JSON.stringify({ $schema: RULES_SCHEMA_URL, ...parsed }, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

// src/bin/rule/index.ts
var RULE_SUBCOMMANDS = new Set([
  "init",
  "add",
  "remove",
  "update",
  "sync",
  "list",
  "wrapper",
  "test",
  "migrate",
  "doc",
  "verify"
]);
var RULE_WRAPPER_ACTIONS = new Set(["add", "remove", "list"]);
async function runRuleCommand(args) {
  const flags = parseRuleFlags(args);
  if (flags.errors.length > 0) {
    for (const error of flags.errors)
      console.error(error);
    return 1;
  }
  const subcommand = flags.positionals[0];
  if (flags.help) {
    printCommandHelp(ruleCommand);
    return 0;
  }
  if (!subcommand) {
    printCommandHelp(ruleCommand);
    return 1;
  }
  const value = flags.positionals[1];
  const options2 = { global: flags.global, check: flags.check };
  if (subcommand === "init") {
    const dir = flags.global ? getUserRulesDir() : getProjectRulesDir();
    const configPath = flags.global ? getUserRulesConfigPath() : getProjectRulesConfigPath();
    ensureRulesConfig(configPath);
    mkdirSync7(join20(dirname17(dir), "cache", "rulebooks"), { recursive: true });
    const rulebookPath = join20(dir, "example-rules", "rulebook.json");
    if (flags.example && !existsSync20(rulebookPath))
      writeStarterRulebook(rulebookPath, "example-rules");
    const result = await syncRulesConfig(options2);
    printRuleChangeResult(result, "Rule config initialized.");
    return result.ok ? 0 : 1;
  }
  if (subcommand === "add") {
    if (!value) {
      console.error("rule add requires a source");
      return 1;
    }
    const result = await addRulebookSource(value, options2);
    printRuleChangeResult(result, `Added rulebook source: ${value}`);
    return result.ok ? 0 : 1;
  }
  if (subcommand === "remove") {
    if (!value) {
      console.error("rule remove requires a source");
      return 1;
    }
    const result = await removeRulebookSource(value, {
      ...options2,
      deleteSource: flags.deleteSource
    });
    printRuleChangeResult(result, `Removed rulebook source: ${value}`);
    return result.ok ? 0 : 1;
  }
  if (subcommand === "update" || subcommand === "sync") {
    const result = await syncRulesConfig({
      ...options2,
      only: subcommand === "update" ? value : undefined
    });
    printRuleChangeResult(result, flags.check ? "Rule config checked." : "Rule config synced.");
    return result.ok ? 0 : 1;
  }
  if (subcommand === "list") {
    const policy = loadRulesPolicy();
    printRulesListReport(policy, {
      user: getRulesConfigSourceDisplayMap(policy.userConfigPath),
      project: getRulesConfigSourceDisplayMap(policy.projectConfigPath)
    });
    return policy.errors.length > 0 ? 1 : 0;
  }
  if (subcommand === "wrapper") {
    return runRuleWrapperCommand(flags);
  }
  if (subcommand === "test") {
    const sources = value ? [value] : [];
    const result = await testRulebookSources(sources, options2);
    printRulesTestResult(result);
    return result.ok ? 0 : 1;
  }
  if (subcommand === "migrate") {
    return runRulesMigrate({ cleanup: flags.cleanup, cwd: process.cwd() });
  }
  if (subcommand === "doc") {
    console.log(RULE_DOC);
    return 0;
  }
  if (subcommand === "verify") {
    return runRulesVerify();
  }
  return 1;
}
function parseRuleFlags(args) {
  const flags = {
    global: false,
    check: false,
    cleanup: false,
    deleteSource: false,
    example: false,
    help: false,
    positionals: [],
    errors: []
  };
  for (const arg of args) {
    if (arg === "-g" || arg === "--global") {
      flags.global = true;
    } else if (arg === "--check") {
      flags.check = true;
    } else if (arg === "--delete-source") {
      flags.deleteSource = true;
    } else if (arg === "--cleanup") {
      flags.cleanup = true;
    } else if (arg === "--example") {
      flags.example = true;
    } else if (arg === "-h" || arg === "--help") {
      flags.help = true;
    } else if (arg.startsWith("-")) {
      flags.errors.push(unknownRuleOption(flags.positionals[0], arg));
    } else {
      flags.positionals.push(arg);
    }
  }
  validateRuleFlags(flags);
  return flags;
}
function validateRuleFlags(flags) {
  const [subcommand] = flags.positionals;
  if (subcommand && !RULE_SUBCOMMANDS.has(subcommand)) {
    flags.errors.push(`Unknown rule subcommand: ${subcommand}`);
  }
  if (flags.deleteSource && subcommand !== "remove") {
    if (subcommand && RULE_SUBCOMMANDS.has(subcommand)) {
      flags.errors.push(`Unknown option for rule ${subcommand}: --delete-source`);
    } else {
      flags.errors.push("--delete-source is only valid with 'rule remove'");
    }
  }
  if (flags.cleanup && subcommand !== "migrate") {
    flags.errors.push(unknownRuleOption(subcommand, "--cleanup"));
  }
  if (flags.example && subcommand !== "init") {
    flags.errors.push(unknownRuleOption(subcommand, "--example"));
  }
  if (subcommand === "migrate") {
    if (flags.global)
      flags.errors.push("Unknown option for rule migrate: --global");
    if (flags.check)
      flags.errors.push("Unknown option for rule migrate: --check");
    if (flags.positionals.length > 1) {
      flags.errors.push(`Unexpected rule migrate argument: ${flags.positionals[1]}`);
    }
  } else if (subcommand === "wrapper") {
    validateRuleWrapperFlags(flags);
  } else if (flags.positionals.length > 2) {
    flags.errors.push(`Unexpected rule argument: ${flags.positionals[2]}`);
  }
  if (subcommand === "list" && flags.global) {
    flags.errors.push("Unknown option for rule list: --global");
  }
}
function unknownRuleOption(subcommand, option) {
  if (subcommand === "migrate")
    return `Unknown option for rule migrate: ${option}`;
  return `Unknown rule option: ${option}`;
}
function validateRuleWrapperFlags(flags) {
  const action = flags.positionals[1];
  const command2 = flags.positionals[2];
  if (!action) {
    flags.errors.push("rule wrapper requires add, remove, or list");
    return;
  }
  if (!RULE_WRAPPER_ACTIONS.has(action)) {
    flags.errors.push(`Unknown rule wrapper action: ${action}`);
    return;
  }
  if (action === "list") {
    if (command2)
      flags.errors.push(`Unexpected rule wrapper argument: ${command2}`);
    return;
  }
  if (!command2) {
    flags.errors.push(`rule wrapper ${action} requires a command`);
    return;
  }
  if (flags.positionals.length > 3) {
    flags.errors.push(`Unexpected rule wrapper argument: ${flags.positionals[3]}`);
  }
}
function ensureRulesConfig(configPath) {
  if (!existsSync20(configPath)) {
    writeDefaultRulesConfig(configPath);
    return;
  }
  const loaded = readRulesConfig(configPath);
  if (!loaded.config)
    return;
  writeJsonAtomic(configPath, {
    version: 1,
    rules: loaded.config.rules,
    overrides: loaded.config.overrides ?? {},
    transparent_wrappers: loaded.config.transparent_wrappers ?? []
  });
}
async function runRuleWrapperCommand(flags) {
  const action = flags.positionals[1];
  const command2 = flags.positionals[2];
  const configPath = flags.global ? getUserRulesConfigPath() : getProjectRulesConfigPath();
  if (action === "list") {
    const loaded2 = readRulesConfig(configPath);
    if (loaded2.errors.length > 0) {
      for (const error of loaded2.errors)
        console.error(error);
      return 1;
    }
    printTransparentWrappers(loaded2.config?.transparent_wrappers ?? []);
    return 0;
  }
  if (!command2 || !COMMAND_PATTERN.test(command2)) {
    console.error("transparent wrapper must match command pattern");
    return 1;
  }
  if (isReservedTransparentWrapper(command2)) {
    console.error(`reserved command "${command2}" cannot be a wrapper`);
    return 1;
  }
  const loaded = readRulesConfig(configPath);
  if (loaded.errors.length > 0) {
    for (const error of loaded.errors)
      console.error(error);
    return 1;
  }
  const config = loaded.config ?? {
    version: 1,
    rules: [],
    overrides: {},
    transparent_wrappers: []
  };
  const wrappers2 = action === "add" ? [...new Set([...config.transparent_wrappers ?? [], command2])] : (config.transparent_wrappers ?? []).filter((wrapper) => wrapper !== command2);
  writeJsonAtomic(configPath, {
    version: 1,
    rules: config.rules,
    overrides: config.overrides ?? {},
    transparent_wrappers: wrappers2
  });
  console.log(action === "add" ? `Added transparent wrapper: ${command2}` : `Removed transparent wrapper: ${command2}`);
  return 0;
}
function printTransparentWrappers(wrappers2) {
  if (wrappers2.length === 0) {
    console.log("Transparent wrappers: (none)");
    return;
  }
  console.log(`Transparent wrappers (${wrappers2.length}):`);
  for (const wrapper of wrappers2)
    console.log(`  - ${wrapper}`);
}

// src/bin/statusline.ts
import { existsSync as existsSync21, readFileSync as readFileSync18 } from "node:fs";
import { homedir as homedir9 } from "node:os";
import { join as join21 } from "node:path";
async function readStdinAsync() {
  if (process.stdin.isTTY) {
    return null;
  }
  return new Promise((resolve14) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      const trimmed = data.trim();
      resolve14(trimmed || null);
    });
    process.stdin.on("error", () => {
      resolve14(null);
    });
  });
}
function getSettingsPath() {
  if (process.env.CLAUDE_SETTINGS_PATH) {
    return process.env.CLAUDE_SETTINGS_PATH;
  }
  return join21(homedir9(), ".claude", "settings.json");
}
function isPluginEnabled() {
  const settingsPath = getSettingsPath();
  if (!existsSync21(settingsPath)) {
    return false;
  }
  try {
    const content = readFileSync18(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    if (!settings.enabledPlugins) {
      return false;
    }
    const pluginKey = "safety-net@cc-marketplace";
    if (!(pluginKey in settings.enabledPlugins)) {
      return false;
    }
    return settings.enabledPlugins[pluginKey] === true;
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(`CC Safety Net debug: failed to read Claude settings: ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }
}
async function printStatusline() {
  const enabled = isPluginEnabled();
  let status;
  if (!enabled) {
    status = "\uD83D\uDEE1️ CC Safety Net ❌";
  } else {
    const modes = getCCSafetyNetEnvModes();
    const levelEmoji = {
      standard: "✅",
      strict: "\uD83D\uDD12",
      paranoid: "\uD83D\uDC41️",
      custom: "\uD83D\uDD27"
    }[modes.effectiveLevel];
    if (modes.worktreeMode) {
      status = `\uD83D\uDEE1️ CC Safety Net ${levelEmoji}\uD83C\uDF33`;
    } else {
      status = `\uD83D\uDEE1️ CC Safety Net ${levelEmoji}`;
    }
  }
  const stdinInput = await readStdinAsync();
  if (stdinInput && !stdinInput.startsWith("{")) {
    console.log(`${stdinInput} | ${status}`);
  } else {
    console.log(status);
  }
}

// src/bin/cc-safety-net.ts
function hasHelpFlag(args) {
  return args.includes("--help") || args.includes("-h");
}
function handleHelpCommand(args) {
  if (args[0] !== "help") {
    return false;
  }
  const commandName = args[1];
  if (!commandName) {
    printHelp();
    process.exit(0);
  }
  if (showCommandHelp(commandName)) {
    process.exit(0);
  }
  console.error(`Unknown command: ${commandName}`);
  console.error("Run 'cc-safety-net --help' for available commands.");
  process.exit(1);
}
function handleCommandHelp(args) {
  if (!hasHelpFlag(args)) {
    return false;
  }
  const commandName = args[0];
  if (!commandName || commandName.startsWith("-")) {
    return false;
  }
  const command2 = findCommand(commandName);
  if (command2) {
    showCommandHelp(commandName);
    process.exit(0);
  }
  return false;
}
var commandParsers = {
  explain: (args) => ({ mode: "explain", args }),
  rule: (args) => ({ mode: "rule", args }),
  statusline: (args) => {
    if (args.includes("--claude-code") || args.includes("-cc"))
      return { mode: "statusline" };
    console.error("statusline requires --claude-code (-cc)");
    showCommandHelp("statusline");
    process.exit(1);
  },
  hook: (args) => {
    const integration = findHookIntegrationByFlag(args);
    if (integration)
      return { mode: "hook", integration };
    console.error("hook requires an integration flag. Try: cc-safety-net hook --kimi-code");
    showCommandHelp("hook");
    process.exit(1);
  },
  install: (args) => ({ mode: "install", args }),
  uninstall: (args) => ({ mode: "uninstall", args }),
  doctor: (args) => ({ mode: "doctor", args }),
  logs: (args) => ({ mode: "logs", args }),
  gui: (args) => ({ mode: "gui", args })
};
function parseCliArgs(args) {
  if (handleHelpCommand(args)) {
    return null;
  }
  if (handleCommandHelp(args)) {
    return null;
  }
  if (args.length === 0 || hasHelpFlag(args)) {
    printHelp();
    process.exit(0);
  }
  if (args.includes("--version") || args.includes("-V")) {
    printVersion();
    process.exit(0);
  }
  const commandName = args[0];
  if (!commandName) {
    printHelp();
    process.exit(0);
  }
  const command2 = findCommand(commandName);
  if (command2) {
    return commandParsers[command2.name](args.slice(1));
  }
  const legacyIntegration = findLegacyTopLevelHookIntegration(commandName);
  if (legacyIntegration)
    return { mode: "hook", integration: legacyIntegration };
  if (commandName === "--statusline")
    return { mode: "statusline" };
  console.error(`Unknown option: ${commandName}`);
  console.error("Run 'cc-safety-net --help' for usage.");
  process.exit(1);
}
var commandHandlers = {
  hook: async (command2) => {
    await command2.integration.run();
  },
  install: async (command2) => {
    process.exit(await runInstallCommand("install", command2.args));
  },
  uninstall: async (command2) => {
    process.exit(await runInstallCommand("uninstall", command2.args));
  },
  rule: async (command2) => {
    process.exit(await runRuleCommand(command2.args));
  },
  statusline: async (_command) => {
    await printStatusline();
  },
  doctor: async (command2) => {
    const flags = parseDoctorFlags(command2.args);
    const exitCode = await runDoctor({
      json: flags.json,
      skipUpdateCheck: flags.skipUpdateCheck
    });
    process.exit(exitCode);
  },
  logs: async (command2) => {
    process.exit(await runLogsCommand(command2.args));
  },
  gui: async (command2) => {
    process.exit(await runGuiCommand(command2.args));
  },
  explain: async (command2) => {
    if (hasHelpFlag(command2.args) || command2.args.length === 0) {
      showCommandHelp("explain");
      process.exit(0);
    }
    const flags = parseExplainFlags(command2.args);
    if (!flags) {
      process.exit(1);
    }
    const result = explainCommand2(flags.command, { cwd: flags.cwd });
    const asciiOnly = !!process.env.NO_COLOR || !process.stdout.isTTY;
    if (flags.json) {
      console.log(formatTraceJson(result));
    } else {
      console.log(formatTraceHuman(result, { asciiOnly }));
    }
    process.exit(0);
  }
};
function assertNever(command2) {
  throw new Error(`Unhandled command mode: ${JSON.stringify(command2)}`);
}
async function runParsedCommand(command2) {
  switch (command2.mode) {
    case "hook":
      await commandHandlers.hook(command2);
      return;
    case "install":
      await commandHandlers.install(command2);
      return;
    case "uninstall":
      await commandHandlers.uninstall(command2);
      return;
    case "rule":
      await commandHandlers.rule(command2);
      return;
    case "statusline":
      await commandHandlers.statusline(command2);
      return;
    case "doctor":
      await commandHandlers.doctor(command2);
      return;
    case "logs":
      await commandHandlers.logs(command2);
      return;
    case "gui":
      await commandHandlers.gui(command2);
      return;
    case "explain":
      await commandHandlers.explain(command2);
      return;
    default:
      assertNever(command2);
  }
}
async function main() {
  const command2 = parseCliArgs(process.argv.slice(2));
  if (command2)
    await runParsedCommand(command2);
}
main().catch((error) => {
  console.error("CC Safety Net error:", error);
  process.exit(1);
});
