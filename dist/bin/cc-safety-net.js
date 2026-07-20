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
  ], LINE_TERMINATORS = /[\n\r\u2028\u2029]/, GLOB_SHELL_SPECIAL = /[\s#!"$&'():;<=>@\\^`|]/g;
  module.exports = function(xs) {
    return xs.map(function(s) {
      if (s === "")
        return "''";
      if (s && typeof s === "object") {
        if ("op" in s && s.op === "glob") {
          if (typeof s.pattern !== "string")
            throw TypeError("glob token requires a string `pattern`");
          if (LINE_TERMINATORS.test(s.pattern))
            throw TypeError("glob `pattern` must not contain line terminators");
          return s.pattern.replace(GLOB_SHELL_SPECIAL, "\\$&");
        }
        if ("op" in s && typeof s.op === "string") {
          if (OPS.indexOf(s.op) < 0)
            throw TypeError("invalid `op` value: " + JSON.stringify(s.op));
          return s.op.replace(/[\s\S]/g, "\\$&");
        }
        if ("comment" in s && typeof s.comment === "string") {
          if (LINE_TERMINATORS.test(s.comment))
            throw TypeError("`comment` must not contain line terminators");
          return "#" + s.comment;
        }
        throw TypeError("unrecognized object token shape");
      }
      if (/["\s\\]/.test(s) && !/'/.test(s))
        return "'" + s.replace(/(['])/g, "\\$1") + "'";
      if (/["'\s]/.test(s))
        return '"' + s.replace(/(["\\$`!])/g, "\\$1") + '"';
      return String(s).replace(/([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}~])/g, "$1\\$2");
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
  ].join("|") + ")", controlRE = new RegExp("^" + CONTROL + "$"), META = "|&;()<> \\t", SINGLE_QUOTE = "'([^']*?)'", DOUBLE_QUOTE = '"((\\\\"|[^"])*?)"', hash = /^#$/, SQ = "'", DQ = '"', DS = "$", TOKEN = "", mult = 4294967296;
  for (i = 0;i < 4; i++)
    TOKEN += (mult * Math.random()).toString(16);
  var i, startsWithToken = new RegExp("^" + TOKEN);
  function matchAll(s, r) {
    var origIndex = r.lastIndex, matches = [], matchObj;
    while (matchObj = r.exec(s))
      if (matches[matches.length] = matchObj, r.lastIndex === matchObj.index)
        r.lastIndex += 1;
    return r.lastIndex = origIndex, matches;
  }
  function getVar(env, pre, key) {
    var r = typeof env === "function" ? env(key) : env[key];
    if (typeof r > "u" && key != "")
      r = "";
    else if (typeof r > "u")
      r = "$";
    if (typeof r === "object")
      return pre + TOKEN + JSON.stringify(r) + TOKEN;
    return pre + r;
  }
  function parseInternal(string, env, opts) {
    if (!opts)
      opts = {};
    var BS = opts.escape || "\\", ifs = opts.splitUnquoted === !0 ? ` 	
` : typeof opts.splitUnquoted === "string" ? opts.splitUnquoted : "", BAREWORD = "(\\" + BS + `['"` + META + `]|[^\\s'"` + META + "])+", chunker = new RegExp([
      "(" + CONTROL + ")",
      "(" + BAREWORD + "|" + DOUBLE_QUOTE + "|" + SINGLE_QUOTE + ")+"
    ].join("|"), "g"), matches = matchAll(string, chunker);
    if (matches.length === 0)
      return [];
    if (!env)
      env = {};
    var commented = !1;
    return matches.map(function(match) {
      var s = match[0];
      if (!s || commented)
        return;
      if (controlRE.test(s))
        return { op: s };
      var quote = !1, esc = !1, out = "", words = [], sawQuote = !1, pendingNw = null, isGlob = !1, i2;
      function parseEnvVar() {
        i2 += 1;
        var varend, varname, char = s.charAt(i2);
        if (char === "{") {
          if (i2 += 1, s.charAt(i2) === "}")
            throw Error("Bad substitution: " + s.slice(i2 - 2, i2 + 1));
          var depth = 1;
          varend = i2;
          while (depth > 0 && varend < s.length) {
            if (s.charAt(varend) === "{" && s.charAt(varend - 1) === "$")
              depth += 1;
            else if (s.charAt(varend) === "}")
              depth -= 1;
            varend += 1;
          }
          if (depth !== 0)
            throw Error("Bad substitution: " + s.slice(i2));
          varend -= 1, varname = s.slice(i2, varend), i2 = varend;
        } else if (/[*@#?$!_-]/.test(char))
          varname = char, i2 += 1;
        else {
          var slicedFromI = s.slice(i2);
          if (varend = slicedFromI.match(/[^\w\d_]/), !varend)
            varname = slicedFromI, i2 = s.length;
          else
            varname = slicedFromI.slice(0, varend.index), i2 += varend.index - 1;
        }
        return getVar(env, "", varname);
      }
      function flushRun() {
        if (pendingNw === null)
          return;
        if (pendingNw === 0) {
          if (out !== "")
            words[words.length] = out, out = "";
        } else {
          words[words.length] = out, out = "";
          for (var fe = 1;fe < pendingNw; fe += 1)
            words[words.length] = "";
        }
        pendingNw = null;
      }
      for (i2 = 0;i2 < s.length; i2++) {
        var c = s.charAt(i2);
        if (ifs && c !== DS)
          flushRun();
        if (isGlob = isGlob || !quote && (c === "*" || c === "?"), esc)
          out += c, esc = !1;
        else if (quote)
          if (c === quote)
            quote = !1;
          else if (quote == SQ)
            out += c;
          else if (c === BS)
            if (i2 += 1, c = s.charAt(i2), c === DQ || c === BS || c === DS)
              out += c;
            else
              out += BS + c;
          else if (c === DS)
            out += parseEnvVar();
          else
            out += c;
        else if (c === DQ || c === SQ)
          quote = c, sawQuote = !0;
        else if (controlRE.test(c))
          return { op: s };
        else if (hash.test(c)) {
          commented = !0;
          var commentObj = { comment: string.slice(match.index + i2 + 1) };
          if (out.length)
            return [out, commentObj];
          return [commentObj];
        } else if (c === BS)
          esc = !0;
        else if (c === DS) {
          var value = parseEnvVar();
          if (!ifs)
            out += value;
          else
            for (var vi = 0;vi < value.length; vi += 1) {
              var vc = value.charAt(vi);
              if (ifs.indexOf(vc) < 0)
                flushRun(), out += vc;
              else if (pendingNw === null)
                pendingNw = vc === " " || vc === "\t" || vc === `
` ? 0 : 1;
              else if (vc !== " " && vc !== "\t" && vc !== `
`)
                pendingNw += 1;
            }
        } else
          out += c;
      }
      if (isGlob)
        return { op: "glob", pattern: out };
      if (ifs) {
        if (pendingNw !== null && pendingNw > 0) {
          words[words.length] = out, out = "";
          for (var te = 1;te < pendingNw; te += 1)
            words[words.length] = "";
        }
        if (out !== "" || sawQuote && words.length === 0)
          words[words.length] = out;
        return words;
      }
      return out;
    }).reduce(function(prev, arg) {
      if (typeof arg > "u")
        return prev;
      return [].concat(arg).forEach(function(entry) {
        prev[prev.length] = entry;
      }), prev;
    }, []);
  }
  module.exports = function(s, env, opts) {
    var mapped = parseInternal(s, env, opts);
    if (typeof env !== "function")
      return mapped;
    return mapped.reduce(function(acc, s2) {
      if (typeof s2 === "object")
        return acc[acc.length] = s2, acc;
      var xs = s2.split(RegExp("(" + TOKEN + ".*?" + TOKEN + ")", "g"));
      if (xs.length === 1)
        return acc[acc.length] = xs[0], acc;
      return xs.filter(Boolean).forEach(function(x) {
        acc[acc.length] = startsWithToken.test(x) ? JSON.parse(x.split(TOKEN)[1]) : x;
      }), acc;
    }, []);
  };
});

// src/bin/audit-log.ts
import { basename, dirname, resolve } from "node:path";

// src/core/audit.ts
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { isAbsolute, join } from "node:path";

// src/core/sanitize.ts
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
  let result = text.replace(/\b((?:DATABASE|POSTGRES|POSTGRESQL|MYSQL|MARIADB|REDIS|MONGO(?:DB)?|DB)_DSN|CONNECTION_STRING)=("[^"]*"|'[^']*'|[^\s]+(?:\s+[A-Z_][A-Z0-9_]*=[^\s]+)*)/gi, "$1=<redacted>").replace(/\b((?:DATABASE|POSTGRES|POSTGRESQL|MYSQL|MARIADB|REDIS|MONGO(?:DB)?|DB)_(?:URL|URI|CONNECTION_STRING))=("[^"]*"|'[^']*'|[^\s]+)/gi, "$1=<redacted>").replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIALS)[A-Z0-9_]*)=("[^"]*"|'[^']*'|[^\s]+)/gi, "$1=<redacted>");
  return redactNonAssignmentSecrets(result);
}
function redactNonAssignmentSecrets(text) {
  let result = text.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "<redacted>").replace(/((?:(['"])(?:authorization|cookie|x-api-key|api-key)\2|(?:authorization|cookie|x-api-key|api-key))\s*:\s*)(['"])(?:\\[^\r\n]|(?!\3)[^\\\r\n])*\3/gi, "$1$3<redacted>$3").replace(/(['"]?\s*(?:authorization|cookie|x-api-key|api-key)\s*:(?!\s*(?:"<redacted>"|'<redacted>'))\s*)([^'"\r\n]+)(['"]?)/gi, "$1<redacted>$3").replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s@/]+)@/gi, "$1<redacted>:<redacted>@").replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+)@/gi, "$1<redacted>@").replace(/(^|\s)((?:-u|--user)(?:\s+|=))([^\s:]+):([^\s]+)/g, "$1$2<redacted>:<redacted>");
  for (let pattern of PROVIDER_TOKENS)
    result = result.replace(pattern, "<redacted>");
  return result.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, "<redacted>").replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "<redacted>");
}
function redactEnvAssignmentValues(text) {
  return findEnvAssignments(text).reduceRight((value, assignment) => `${value.slice(0, assignment.valueStart)}<redacted>${value.slice(assignment.valueEnd)}`, text);
}
function sanitizeDiagnosticText(text) {
  return redactNonAssignmentSecrets(redactEnvAssignmentValues(text));
}
function getEnvAssignmentValues(text) {
  return findEnvAssignments(text).map((assignment) => text.slice(assignment.valueStart, assignment.valueEnd));
}
function mightContainEnvAssignment(text) {
  return /[A-Za-z_][A-Za-z0-9_]*=/.test(text);
}
function findEnvAssignments(text) {
  let assignments = [], pattern = /[A-Za-z_][A-Za-z0-9_]*=/g;
  for (let match of text.matchAll(pattern)) {
    let start = match.index, previous = text[start - 1];
    if (start > 0 && previous && !/[\s"'([{]/.test(previous))
      continue;
    let valueStart = start + match[0].length;
    if (valueStart >= text.length)
      continue;
    assignments.push({ valueStart, valueEnd: findAssignmentValueEnd(text, valueStart) });
  }
  return assignments;
}
function findAssignmentValueEnd(text, start) {
  if (text.startsWith("$(", start))
    return findBalancedCommandSubstitutionEnd(text, start);
  let quote = text[start];
  if (quote === '"' || quote === "'") {
    for (let index = start + 1;index < text.length; index++)
      if (quote === '"' && text[index] === "\\")
        index++;
      else if (text[index] === quote)
        return index + 1;
  }
  let end = start;
  while (end < text.length && !/\s/.test(text[end] ?? ""))
    end++;
  return end;
}
function findBalancedCommandSubstitutionEnd(text, start) {
  let depth = 0, quote;
  for (let index = start;index < text.length; index++) {
    let char = text[index];
    if (quote) {
      if (quote === '"' && char === "\\")
        index++;
      else if (char === quote)
        quote = void 0;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "$" && text[index + 1] === "(") {
      depth++, index++;
      continue;
    }
    if (char !== ")")
      continue;
    if (depth--, depth === 0)
      return index + 1;
  }
  return text.length;
}
// src/core/audit.ts
var AUDIT_LOG_VERSION = "1.0.6", COMMAND_MAX_LENGTH = 1e4, SEGMENT_MAX_LENGTH = 2000, TOOL_NAME_MAX_LENGTH = 256, CWD_MAX_LENGTH = 32768;
function sanitizeSessionIdForFilename(sessionId) {
  let raw = sessionId.trim();
  if (!raw)
    return null;
  let safe = raw.replace(/[^A-Za-z0-9_.-]+/g, "_");
  if (safe = safe.replace(/^[._-]+|[._-]+$/g, "").slice(0, 128), !safe || safe === "." || safe === "..")
    return null;
  return safe;
}
function encodeCwdForLogDirname(cwd) {
  return (cwd ?? "").replace(/[^A-Za-z0-9]/g, "-").slice(0, 180) || "no-cwd";
}
function writeAuditLog(sessionId, command, segment, reason, cwd, options = {}) {
  let safeSessionId = sanitizeSessionIdForFilename(sessionId);
  if (!safeSessionId)
    return;
  let home = options.homeDir ?? getAuditLogHomeDir();
  if (!home)
    return;
  let logsDir = getAuditLogsDir(home);
  if (!logsDir)
    return;
  try {
    let ts = (options.now ?? (() => /* @__PURE__ */ new Date))().toISOString(), cappedCommand = capField(redactSecrets(command), COMMAND_MAX_LENGTH), cappedSegment = capField(redactSecrets(segment), SEGMENT_MAX_LENGTH), cappedToolName = options.toolName ? capField(redactSecrets(options.toolName), TOOL_NAME_MAX_LENGTH) : void 0, cappedCwd = cwd === null ? void 0 : capField(redactSecrets(cwd), CWD_MAX_LENGTH), sessionDir = join(logsDir, encodeCwdForLogDirname(cappedCwd?.value ?? null), ts.slice(0, 7));
    mkdirSync(sessionDir, { recursive: !0, mode: 448 });
    let logFile = join(sessionDir, `${ts.slice(0, 10)}-${safeSessionId}.jsonl`), entry = {
      ts,
      id: (options.createId ?? (() => randomBytes(8).toString("hex")))(),
      v: AUDIT_LOG_VERSION,
      sessionId: safeSessionId,
      decision: options.decision ?? "deny",
      agent: options.agent,
      shape: options.shape,
      toolName: cappedToolName?.value,
      command: cappedCommand.value,
      segment: cappedSegment.value,
      ...cappedCommand.truncated || cappedSegment.truncated || cappedToolName?.truncated || cappedCwd?.truncated ? { truncated: !0 } : {},
      reason,
      ruleId: options.ruleId,
      intent: options.intent,
      failureStage: options.failureStage,
      errorCode: options.errorCode,
      cwd: cappedCwd?.value ?? null
    };
    appendFileSync(logFile, `${JSON.stringify(entry)}
`, { encoding: "utf-8", mode: 384 });
  } catch {}
}
function capField(value, maxLength) {
  return { value: value.slice(0, maxLength), truncated: value.length > maxLength };
}
function getAuditLogHomeDir(homeFromEnv = process.env.CC_SAFETY_NET_AUDIT_HOME || process.env.HOME) {
  let home = homeFromEnv || homedir() || userInfo().homedir;
  return home && isAbsolute(home) ? home : null;
}
function getAuditLogsDir(homeDir = getAuditLogHomeDir()) {
  return homeDir ? join(homeDir, ".cc-safety-net", "logs") : null;
}

// src/core/audit-scan.ts
import { readdirSync, readFileSync } from "node:fs";
import { join as join2 } from "node:path";
function listAuditLogFiles(logsDir) {
  try {
    return readdirSync(logsDir, { withFileTypes: !0, encoding: "utf8" }).flatMap((entry) => {
      let filePath = join2(logsDir, entry.name);
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
  let flags = {
    limit: 20,
    limitExplicit: !1,
    since: 30,
    sinceExplicit: !1,
    all: !1,
    json: !1
  };
  for (let index = 0;index < args.length; index++) {
    let arg = args[index];
    if (arg === "--all") {
      flags.all = !0;
      continue;
    }
    if (arg === "--json") {
      flags.json = !0;
      continue;
    }
    if (arg === "--id") {
      let value = parseStringValue(args[index + 1], "--id");
      if (value === null)
        return null;
      if (!/^[a-f0-9]{16}$/.test(value))
        return console.error("--id must be 16 hexadecimal characters"), null;
      flags.id = value, index++;
      continue;
    }
    if (arg === "--limit") {
      let limit = parsePositiveNumber(args[index + 1]);
      if (limit === null)
        return console.error("--limit must be a positive number"), null;
      flags.limit = limit, flags.limitExplicit = !0, index++;
      continue;
    }
    if (arg === "--since") {
      let since = parsePositiveNumber(args[index + 1]);
      if (since === null)
        return console.error("--since must be a positive number"), null;
      flags.since = since, flags.sinceExplicit = !0, index++;
      continue;
    }
    if (arg === "--agent") {
      let value = parseStringValue(args[index + 1], "--agent");
      if (value === null)
        return null;
      flags.agent = value, index++;
      continue;
    }
    if (arg === "--rule") {
      let value = parseStringValue(args[index + 1], "--rule");
      if (value === null)
        return null;
      flags.rule = value, index++;
      continue;
    }
    if (arg === "--session") {
      let value = parseStringValue(args[index + 1], "--session");
      if (value === null)
        return null;
      flags.session = value, index++;
      continue;
    }
    if (arg === "--project") {
      let value = parseStringValue(args[index + 1], "--project");
      if (value === null)
        return null;
      flags.project = resolve(value), index++;
      continue;
    }
    return console.error(`Unknown option: ${arg}`), null;
  }
  if (flags.id && (flags.agent !== void 0 || flags.rule !== void 0 || flags.session !== void 0 || flags.project !== void 0 || flags.sinceExplicit || flags.limitExplicit))
    return console.error("--id cannot be combined with --agent, --rule, --session, --project, --since, or --limit"), null;
  return flags;
}
async function runLogsCommand(args, options = {}) {
  let flags = parseLogsFlags(args);
  if (!flags)
    return 1;
  let logsDir = options.logsDir ?? getAuditLogsDir();
  if (!logsDir)
    return console.log(flags.json ? "[]" : flags.id ? `No audit log entry found for id ${renderTerminalText(flags.id)}.` : "No audit log entries found."), 0;
  let allEntries = listAuditLogFiles(logsDir).flatMap((file) => readAuditLogEntries(file).map((entry) => ({ entry, file })));
  if (flags.id)
    return outputIdLookup(allEntries, flags, options.timeZone);
  let cutoff = Date.now() - flags.since * 24 * 60 * 60 * 1000, entries = allEntries.filter((item) => matchesLogsFlags(item, flags, logsDir, cutoff)).sort((left, right) => Date.parse(right.entry.ts) - Date.parse(left.entry.ts)).slice(0, flags.limit);
  if (flags.json)
    return console.log(JSON.stringify(entries.map((item) => item.entry))), 0;
  if (entries.length === 0)
    return console.log("No audit log entries found."), 0;
  for (let item of entries)
    console.log(formatLogEntry(item.entry, options.timeZone));
  return 0;
}
function outputIdLookup(entries, flags, timeZone) {
  let matches = entries.filter((item) => item.entry.id === flags.id);
  if (matches.length > 1)
    return console.error(`Multiple audit log entries found for id ${renderTerminalText(flags.id ?? "")}.`), 1;
  if (flags.json)
    return console.log(JSON.stringify(matches.map((item) => item.entry))), 0;
  let match = matches[0];
  if (!match)
    return console.log(`No audit log entry found for id ${renderTerminalText(flags.id ?? "")}.`), 0;
  return console.log(formatLogEntryDetail(match.entry, timeZone)), 0;
}
function matchesLogsFlags(item, flags, logsDir, cutoff) {
  if (!flags.all && item.entry.decision === "allow")
    return !1;
  if (Date.parse(item.entry.ts) < cutoff)
    return !1;
  if (flags.agent !== void 0 && item.entry.agent !== flags.agent)
    return !1;
  if (flags.rule !== void 0 && item.entry.ruleId !== flags.rule)
    return !1;
  if (flags.session !== void 0 && !matchesSession(item, logsDir, flags.session))
    return !1;
  if (flags.project !== void 0 && !matchesProject(item.entry.cwd, flags.project))
    return !1;
  return !0;
}
function matchesSession(item, logsDir, session) {
  if (item.entry.sessionId === session)
    return !0;
  return dirname(item.file) === logsDir && basename(item.file, ".jsonl") === session;
}
function matchesProject(cwd, project) {
  if (!cwd)
    return !1;
  return cwd === project || cwd.startsWith(`${project}/`);
}
function formatLogEntry(entry, timeZone) {
  let id = renderTerminalText(entry.id ?? "-"), decision = renderTerminalText(entry.decision ?? "deny"), cwd = entry.cwd ? `  [${renderTerminalText(entry.cwd)}]` : "", command = entry.command.length > 50 ? `${entry.command.slice(0, 50)}…` : entry.command;
  return `${id.padEnd(16)}  ${renderTerminalText(formatHumanTimestamp(entry.ts, timeZone))}  ${decision.padEnd(5)}  ${renderTerminalText(entry.agent ?? "-").padEnd(15)}  ${renderTerminalText(entry.ruleId ?? "-").padEnd(20)}  ${renderTerminalText(command)}${cwd}`;
}
function formatLogEntryDetail(entry, timeZone) {
  let value = (input) => renderTerminalText(input === void 0 || input === null || input === "" ? "-" : input), agent = entry.shape ? `${entry.agent ?? "-"} (shape: ${entry.shape})` : entry.agent ?? "-";
  return [
    `id:        ${value(entry.id)}`,
    `ts:        ${value(formatHumanTimestamp(entry.ts, timeZone))}`,
    `decision:  ${value(entry.decision)}`,
    `agent:     ${value(agent)}`,
    `tool:      ${value(entry.toolName)}`,
    `rule:      ${value(entry.ruleId)}`,
    `intent:    ${value(entry.intent)}`,
    `stage:     ${value(entry.failureStage)}`,
    `error:     ${value(entry.errorCode)}`,
    `session:   ${value(entry.sessionId)}`,
    `cwd:       ${value(entry.cwd)}`,
    `version:   ${value(entry.v)}`,
    `truncated: ${value(entry.truncated === !0 ? "yes" : void 0)}`,
    `reason:    ${value(entry.reason)}`,
    `command:   ${value(entry.command)}`,
    `segment:   ${value(entry.segment)}`
  ].join(`
`);
}
function formatHumanTimestamp(timestamp, timeZone) {
  let date = new Date(timestamp);
  if (Number.isNaN(date.getTime()))
    return timestamp;
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone
  }).format(date);
}
function renderTerminalText(value) {
  return Array.from(value, (character) => {
    let code = character.charCodeAt(0);
    if (code <= 31 || code >= 127 && code <= 159)
      return `\\x${code.toString(16).padStart(2, "0")}`;
    return character;
  }).join("");
}
function parsePositiveNumber(value) {
  if (value === void 0)
    return null;
  let parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function parseStringValue(value, flag) {
  if (value === void 0 || value.startsWith("-"))
    return console.error(`${flag} requires a value`), null;
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
import { isAbsolute as isAbsolute15, relative as relative5 } from "node:path";

// src/core/cwd-containment.ts
import { realpathSync as realpathSync2, statSync } from "node:fs";
import { isAbsolute as isAbsolute3, relative, resolve as resolve2, sep as sep2 } from "node:path";

// src/core/path.ts
import { lstatSync, realpathSync } from "node:fs";
import { dirname as dirname2, isAbsolute as isAbsolute2, parse as parsePath, sep } from "node:path";
function isUnsupportedWindowsNamespacePath(target, platform = process.platform) {
  if (platform !== "win32")
    return !1;
  return (target[0] === "/" || target[0] === "\\") && (target[1] === "/" || target[1] === "\\");
}
function resolveChdirTarget(baseCwd, target) {
  if (isUnsupportedWindowsNamespacePath(target))
    throw Error("Unsupported Windows namespace path");
  let root = isAbsolute2(target) ? getPathRoot(target) : "", current = root || baseCwd;
  for (let component of getPathComponents(root ? target.slice(root.length) : target)) {
    if (component === "" || component === ".")
      continue;
    if (component === "..") {
      current = dirname2(current);
      continue;
    }
    let candidate = appendPathWithoutNormalizing(current, component);
    current = lstatSync(candidate).isSymbolicLink() ? realpathSync(candidate) : candidate;
  }
  return current;
}
function appendPathWithoutNormalizing(base, target) {
  return base.endsWith("/") || base.endsWith("\\") ? `${base}${target}` : `${base}${sep}${target}`;
}
function getPathRoot(target) {
  return parsePath(target).root;
}
function getPathComponents(target) {
  let separator = process.platform === "win32" ? /[\\/]+/ : /\/+/;
  return target.split(separator);
}

// src/core/cwd-containment.ts
function resolveContainedCwd(requestedCwd, trustedRoots) {
  if (isUnsupportedWindowsNamespacePath(requestedCwd))
    return;
  let roots = trustedRoots.flatMap((root) => canonicalDirectory(root));
  if (!roots[0])
    return;
  let requested = canonicalDirectory(isAbsolute3(requestedCwd) ? requestedCwd : resolve2(roots[0], requestedCwd))[0];
  if (!requested)
    return;
  return roots.some((root) => isSameOrInsidePath(requested, root)) ? requested : void 0;
}
function firstTrustedRoot(trustedRoots) {
  return trustedRoots.flatMap((root) => canonicalDirectory(root))[0];
}
function canonicalDirectory(path) {
  try {
    let realPath = realpathSync2(path);
    return statSync(realPath).isDirectory() ? [realPath] : [];
  } catch {
    return [];
  }
}
function isSameOrInsidePath(path, root) {
  let rel = relative(root, path);
  return rel === "" || rel !== ".." && !rel.startsWith(`..${sep2}`) && !isAbsolute3(rel);
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
}, SAFETY_LEVELS = ["standard", "strict", "paranoid"];
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
  let value = getEnvFlagValue(ENV_FLAGS.level);
  if (value === void 0)
    return;
  if (SAFETY_LEVELS.includes(value))
    return value;
  if (envTruthy(ENV_FLAGS.debug))
    console.error(`CC Safety Net debug: invalid CC_SAFETY_NET_LEVEL=${JSON.stringify(value)}`);
  return;
}
function deriveEffectiveSafetyLevel(values) {
  if (values.failClosed && values.paranoidRm && values.paranoidInterpreters)
    return "paranoid";
  if (values.failClosed && !values.paranoidRm && !values.paranoidInterpreters)
    return "strict";
  if (!values.failClosed && !values.paranoidRm && !values.paranoidInterpreters)
    return "standard";
  return "custom";
}
function getCCSafetyNetEnvModes(policy = {}) {
  let policyLevel = policy.safety?.level ?? "standard", envLevel = parseEnvLevel(), baseLevel = maxSafetyLevel(policyLevel, envLevel), values = expandSafetyLevel(baseLevel), capabilitySources = {
    failClosed: baseLevel === policyLevel ? "preset" : "environment",
    paranoidRm: baseLevel === policyLevel ? "preset" : "environment",
    paranoidInterpreters: baseLevel === policyLevel ? "preset" : "environment"
  }, sources = {
    failClosed: [`policy safety.level=${policyLevel}`],
    paranoidRm: [`policy safety.level=${policyLevel}`],
    paranoidInterpreters: [`policy safety.level=${policyLevel}`],
    worktreeMode: []
  };
  if (baseLevel !== policyLevel)
    sources.failClosed.push(`env ${ENV_FLAGS.level.name}=${envLevel}`), sources.paranoidRm.push(`env ${ENV_FLAGS.level.name}=${envLevel}`), sources.paranoidInterpreters.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
  if (policy.safety?.overrides?.failClosed !== void 0)
    values.failClosed = policy.safety.overrides.failClosed, capabilitySources.failClosed = "capability_override", sources.failClosed.push("policy safety.overrides.fail_closed");
  if (policy.safety?.overrides?.paranoidRm !== void 0)
    values.paranoidRm = policy.safety.overrides.paranoidRm, capabilitySources.paranoidRm = "capability_override", sources.paranoidRm.push("policy safety.overrides.paranoid_rm");
  if (policy.safety?.overrides?.paranoidInterpreters !== void 0)
    values.paranoidInterpreters = policy.safety.overrides.paranoidInterpreters, capabilitySources.paranoidInterpreters = "capability_override", sources.paranoidInterpreters.push("policy safety.overrides.paranoid_interpreters");
  if (envTruthy(ENV_FLAGS.strict))
    values.failClosed = !0, capabilitySources.failClosed = "environment", sources.failClosed.push(`env ${ENV_FLAGS.strict.name}`);
  if (envTruthy(ENV_FLAGS.paranoid))
    values.paranoidRm = !0, values.paranoidInterpreters = !0, capabilitySources.paranoidRm = "environment", capabilitySources.paranoidInterpreters = "environment", sources.paranoidRm.push(`env ${ENV_FLAGS.paranoid.name}`), sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoid.name}`);
  if (envTruthy(ENV_FLAGS.paranoidRm))
    values.paranoidRm = !0, capabilitySources.paranoidRm = "environment", sources.paranoidRm.push(`env ${ENV_FLAGS.paranoidRm.name}`);
  if (envTruthy(ENV_FLAGS.paranoidInterpreters))
    values.paranoidInterpreters = !0, capabilitySources.paranoidInterpreters = "environment", sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoidInterpreters.name}`);
  let worktreeMode = !!policy.worktreeMode || envTruthy(ENV_FLAGS.worktree);
  if (policy.worktreeMode)
    sources.worktreeMode.push("policy workflow.worktree_mode");
  if (envTruthy(ENV_FLAGS.worktree))
    sources.worktreeMode.push(`env ${ENV_FLAGS.worktree.name}`);
  return {
    strict: values.failClosed,
    paranoidRm: values.paranoidRm,
    paranoidInterpreters: values.paranoidInterpreters,
    worktreeMode,
    effectiveLevel: deriveEffectiveSafetyLevel(values),
    capabilities: {
      fail_closed: {
        enabled: values.failClosed,
        source: capabilitySources.failClosed,
        sources: sources.failClosed
      },
      paranoid_rm: {
        enabled: values.paranoidRm,
        source: capabilitySources.paranoidRm,
        sources: sources.paranoidRm
      },
      paranoid_interpreters: {
        enabled: values.paranoidInterpreters,
        source: capabilitySources.paranoidInterpreters,
        sources: sources.paranoidInterpreters
      }
    },
    sources
  };
}
function envTruthy(flag) {
  let value = typeof flag === "string" ? getOwnEnvValue(flag) : getEnvFlagValue(flag);
  return value === "1" || value?.toLowerCase() === "true";
}
function getOwnEnvValue(name) {
  return Object.hasOwn(process.env, name) ? process.env[name] : void 0;
}
function getEnvFlagValue(flag) {
  let value = getOwnEnvValue(flag.name);
  if (value !== void 0)
    return value;
  if (flag.legacyName)
    return getOwnEnvValue(flag.legacyName);
  return;
}
function envFlagIsSet(flag) {
  return getOwnEnvValue(flag.name) !== void 0 || !!flag.legacyName && getOwnEnvValue(flag.legacyName) !== void 0;
}

// src/core/tool-input.ts
import { types as utilTypes } from "node:util";
var PATCH_TOOL_NAMES = /* @__PURE__ */ new Set(["applypatch", "patch"]), PATH_TOOL_NAMES = /* @__PURE__ */ new Set([
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
]), GREP_TOOL_NAMES = /* @__PURE__ */ new Set(["grep", "grepsearch", "rg"]), GLOB_TOOL_NAMES = /* @__PURE__ */ new Set(["findbyname", "glob"]), PATCH_TEXT_KEYS = /* @__PURE__ */ new Set(["command", "diff", "input", "patch", "patchtext"]), UTF8_ENCODER = /* @__PURE__ */ new TextEncoder, UTF8_DECODER = /* @__PURE__ */ new TextDecoder, JS_WHITESPACE = /\s/, MAX_GIT_DIFF_FALLBACK_CANDIDATES = 64;

class ToolInputLimitError extends Error {
  name = "ToolInputLimitError";
  constructor() {
    super("tool input traversal limit exceeded");
  }
}
var TOOL_INPUT_LIMITS = Object.freeze({
  maxDepth: 64,
  maxNodes: 1e4,
  maxKeys: 1e4,
  maxStringBytes: 1048576,
  maxAggregateStringBytes: 4194304
});
function normalizeToolName(toolName) {
  return toolName.replace(/[-_\s]/g, "").toLowerCase();
}
function getNonCommandToolInputKind(toolName) {
  let normalized = normalizeToolName(toolName);
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
  assertSafeToolInputObject(input);
  let descriptor = Object.getOwnPropertyDescriptor(input, "command");
  if (!descriptor) {
    if ("command" in input)
      throwToolInputLimit();
    return;
  }
  if (descriptor.get || descriptor.set)
    throwToolInputLimit();
  let command = descriptor.value;
  return typeof command === "string" && command !== "" ? command : void 0;
}
function extractPathLikeToolValues(input, pathLikeKeys) {
  return extractPathLikeToolValuesAt(input, pathLikeKeys, { nodes: 0, keys: 0, stringBytes: 0, ancestors: /* @__PURE__ */ new Set }, 1);
}
function extractPathLikeToolValuesAt(input, pathLikeKeys, state, depth) {
  let snapshot = snapshotToolInputObject(input, state, depth);
  if (!snapshot)
    return [];
  let values = snapshot.entries.flatMap(([key, value]) => {
    let nested = extractPathLikeToolValuesAt(value, pathLikeKeys, state, depth + 1);
    return typeof value === "string" && pathLikeKeys.has(normalizeToolInputKey(key)) ? [value] : nested;
  });
  return state.ancestors.delete(snapshot.object), values;
}
function normalizeToolInputKey(key) {
  return key.replace(/-/g, "_").toLowerCase();
}
function extractPatchTargetsFromToolInput(input) {
  return extractPatchTexts(input, !0, { nodes: 0, keys: 0, stringBytes: 0, ancestors: /* @__PURE__ */ new Set }, 1).flatMap(extractPatchTargetsFromText);
}
function extractPatchTexts(input, allowString, state, depth) {
  let snapshot = snapshotToolInputObject(input, state, depth);
  if (typeof input === "string")
    return allowString ? [input] : [];
  if (!snapshot)
    return [];
  let texts = snapshot.entries.flatMap(([key, value]) => extractPatchTexts(value, snapshot.array ? allowString : PATCH_TEXT_KEYS.has(normalizeToolInputKey(key)), state, depth + 1));
  return state.ancestors.delete(snapshot.object), texts;
}
function enterToolInputValue(input, state, depth) {
  if (state.nodes++, input !== null && typeof input === "object" && depth > TOOL_INPUT_LIMITS.maxDepth || state.nodes > TOOL_INPUT_LIMITS.maxNodes)
    throwToolInputLimit();
  if (typeof input !== "string")
    return;
  let bytes = Buffer.byteLength(input);
  if (state.stringBytes += bytes, bytes > TOOL_INPUT_LIMITS.maxStringBytes || state.stringBytes > TOOL_INPUT_LIMITS.maxAggregateStringBytes)
    throwToolInputLimit();
}
function snapshotToolInputObject(input, state, depth) {
  if (enterToolInputValue(input, state, depth), !input || typeof input !== "object")
    return null;
  let array = assertSafeToolInputObject(input);
  if (state.ancestors.has(input))
    throwToolInputLimit();
  let keys = Reflect.ownKeys(input);
  if (state.keys += keys.length, state.keys > TOOL_INPUT_LIMITS.maxKeys)
    throwToolInputLimit();
  let entries = keys.flatMap((key) => {
    let descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || descriptor.get || descriptor.set)
      throwToolInputLimit();
    return typeof key === "string" && descriptor.enumerable ? [[key, descriptor.value]] : [];
  });
  return state.ancestors.add(input), { object: input, array, entries };
}
function assertSafeToolInputObject(input) {
  if (utilTypes.isProxy(input))
    throwToolInputLimit();
  let array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
  if (array && prototype !== Array.prototype || !array && prototype !== Object.prototype && prototype !== null)
    throwToolInputLimit();
  return array;
}
function throwToolInputLimit() {
  throw new ToolInputLimitError;
}
function extractPatchTargetsFromText(text) {
  let targets = [], lines = text.split(/\r?\n/), inApplyPatch = !1, inHunk = !1, oldHunkLinesRemaining = null, newHunkLinesRemaining = null, resetHunk = () => {
    inHunk = !1, oldHunkLinesRemaining = null, newHunkLinesRemaining = null;
  };
  for (let index = 0;index < lines.length; index++) {
    let line = lines[index] ?? "";
    if (line === "*** Begin Patch") {
      inApplyPatch = !0, resetHunk();
      continue;
    }
    if (line === "*** End Patch") {
      inApplyPatch = !1, resetHunk();
      continue;
    }
    if (line.startsWith("@@")) {
      let counts = parseUnifiedHunkLineCounts(line);
      if (inHunk = !0, oldHunkLinesRemaining = counts?.oldLines ?? null, newHunkLinesRemaining = counts?.newLines ?? null, oldHunkLinesRemaining === 0 && newHunkLinesRemaining === 0)
        resetHunk();
      continue;
    }
    if (inHunk && oldHunkLinesRemaining !== null && newHunkLinesRemaining !== null) {
      let oldLineCount = line.startsWith(" ") || line.startsWith("-") ? 1 : 0, newLineCount = line.startsWith(" ") || line.startsWith("+") ? 1 : 0;
      if (oldHunkLinesRemaining = Math.max(0, oldHunkLinesRemaining - oldLineCount), newHunkLinesRemaining = Math.max(0, newHunkLinesRemaining - newLineCount), oldHunkLinesRemaining === 0 && newHunkLinesRemaining === 0)
        resetHunk();
      continue;
    }
    if (line.startsWith("*** ")) {
      resetHunk(), targets.push(...extractPatchTargetsFromMetadataLine(line));
      continue;
    }
    if (inHunk)
      continue;
    if (line.startsWith("diff --git ")) {
      targets.push(...extractPatchTargetsFromMetadataLine(line));
      continue;
    }
    if (line.startsWith("--- ")) {
      let nextLine = lines[index + 1] ?? "";
      if (!nextLine.startsWith("+++ "))
        continue;
      targets.push(...cleanGitTargetPair(decodeGitMetadataTarget(line.slice(4), !0), decodeGitMetadataTarget(nextLine.slice(4), !0))), index++;
      continue;
    }
    if (!inApplyPatch)
      targets.push(...extractPatchTargetsFromMetadataLine(line));
  }
  return targets;
}
function parseUnifiedHunkLineCounts(line) {
  let hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
  if (!hunkHeader)
    return null;
  return {
    oldLines: Number(hunkHeader[1] ?? 1),
    newLines: Number(hunkHeader[2] ?? 1)
  };
}
function extractPatchTargetsFromMetadataLine(line) {
  let applyPatchTarget = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
  if (applyPatchTarget?.[1])
    return cleanPatchTarget(applyPatchTarget[1]);
  let moveTarget = /^\*\*\* Move to: (.+)$/.exec(line);
  if (moveTarget?.[1])
    return cleanPatchTarget(moveTarget[1]);
  if (line.startsWith("diff --git "))
    return extractGitDiffTargets(line.slice(11));
  let oldTarget = /^--- (.+)$/.exec(line);
  if (oldTarget?.[1])
    return cleanUnifiedDiffTarget(oldTarget[1]);
  let newTarget = /^\+\+\+ (.+)$/.exec(line);
  if (newTarget?.[1])
    return cleanUnifiedDiffTarget(newTarget[1]);
  let extendedTarget = /^(?:rename|copy) (?:from|to) (.+)$/.exec(line);
  if (extendedTarget?.[1])
    return cleanExtendedGitTarget(extendedTarget[1]);
  return [];
}
function extractGitDiffTargets(header) {
  let fields = parseGitDiffFields(header);
  if (fields.length === 2 && fields[0] && fields[1])
    return cleanGitTargetPair(fields[0], fields[1]);
  let matchingPair = findGitDiffFallbackPair(header);
  return matchingPair ? cleanGitTargetPair(header.slice(matchingPair.oldStart, matchingPair.oldEnd), header.slice(matchingPair.newStart, matchingPair.newEnd)) : [];
}
function parseGitDiffFields(header) {
  let fields = [], index = 0;
  while (index < header.length && fields.length < 2) {
    while (isJsWhitespace(header[index]))
      index++;
    if (index >= header.length)
      break;
    let quote = header[index] === '"' || header[index] === "'" ? header[index] : void 0;
    if (!quote) {
      let start = index;
      while (index < header.length && !isJsWhitespace(header[index]))
        index++;
      fields.push(header.slice(start, index));
      continue;
    }
    let field = parseQuotedGitDiffField(header, index, quote);
    if (!field)
      return [];
    fields.push(field.value), index = field.end;
  }
  while (isJsWhitespace(header[index]))
    index++;
  return index === header.length ? fields : [];
}
function findGitDiffFallbackPair(header) {
  let start = 0;
  while (start < header.length && isJsWhitespace(header[start]))
    start++;
  let end = header.length;
  while (end > start && isJsWhitespace(header[end - 1]))
    end--;
  let candidates = 0, index = start;
  while (index < end) {
    if (!isJsWhitespace(header[index])) {
      index++;
      continue;
    }
    let oldEnd = index;
    while (index < end && isJsWhitespace(header[index]))
      index++;
    if (oldEnd === start || index === end)
      continue;
    if (candidates++, candidates > MAX_GIT_DIFF_FALLBACK_CANDIDATES)
      throwToolInputLimit();
    if (gitDiffFallbackRangesMatch(header, start, oldEnd, index, end))
      return { oldStart: start, oldEnd, newStart: index, newEnd: end };
  }
  return null;
}
function gitDiffFallbackRangesMatch(header, oldStart, oldEnd, newStart, newEnd) {
  if (rangesEqual(header, oldStart, oldEnd, newStart, newEnd))
    return !0;
  let oldSlash = findCharacterInRange(header, "/", oldStart, oldEnd), newSlash = findCharacterInRange(header, "/", newStart, newEnd);
  if (oldSlash <= oldStart || newSlash <= newStart)
    return !1;
  if (rangesEqual(header, oldStart, oldSlash, newStart, newSlash))
    return !1;
  return rangesEqual(header, oldSlash + 1, oldEnd, newSlash + 1, newEnd);
}
function rangesEqual(value, leftStart, leftEnd, rightStart, rightEnd) {
  if (leftEnd - leftStart !== rightEnd - rightStart)
    return !1;
  for (let offset = 0;offset < leftEnd - leftStart; offset++)
    if (value[leftStart + offset] !== value[rightStart + offset])
      return !1;
  return !0;
}
function findCharacterInRange(value, character, start, end) {
  for (let index = start;index < end; index++)
    if (value[index] === character)
      return index;
  return -1;
}
function isJsWhitespace(character) {
  return character !== void 0 && JS_WHITESPACE.test(character);
}
function parseQuotedGitDiffField(header, start, quote) {
  let bytes = [], index = start + 1;
  while (index < header.length) {
    let character = header[index] ?? "";
    if (character === quote)
      return { value: UTF8_DECODER.decode(Uint8Array.from(bytes)), end: index + 1 };
    if (character !== "\\" || quote === "'") {
      bytes.push(...UTF8_ENCODER.encode(character)), index++;
      continue;
    }
    let escaped = header.slice(index + 1), octal = /^[0-7]{1,3}/.exec(escaped)?.[0];
    if (octal) {
      bytes.push(Number.parseInt(octal, 8)), index += octal.length + 1;
      continue;
    }
    bytes.push(...UTF8_ENCODER.encode(decodeGitDiffEscape(escaped[0] ?? ""))), index += 2;
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
  if (oldTarget.startsWith("a/") && newTarget.startsWith("b/"))
    return [oldTarget.slice(2), newTarget.slice(2)].flatMap(cleanExactPatchTarget);
  let commonRemainder = getCommonGitPrefixRemainder(oldTarget, newTarget) ?? (oldTarget === newTarget ? stripFirstGitPathComponent(oldTarget) : null);
  return [oldTarget, newTarget, ...commonRemainder ? [commonRemainder] : []].flatMap(cleanExactPatchTarget);
}
function cleanSingleGitTarget(target) {
  let stripped = stripFirstGitPathComponent(target);
  return [target, ...stripped ? [stripped] : []].flatMap(cleanExactPatchTarget);
}
function stripFirstGitPathComponent(target) {
  let separator = target.indexOf("/");
  return separator > 0 && separator < target.length - 1 ? target.slice(separator + 1) : null;
}
function getCommonGitPrefixRemainder(oldTarget, newTarget) {
  let oldSeparator = oldTarget.indexOf("/"), newSeparator = newTarget.indexOf("/");
  if (oldSeparator < 1 || newSeparator < 1)
    return null;
  if (oldTarget.slice(0, oldSeparator) === newTarget.slice(0, newSeparator))
    return null;
  let oldRemainder = oldTarget.slice(oldSeparator + 1);
  return oldRemainder === newTarget.slice(newSeparator + 1) ? oldRemainder : null;
}
function cleanUnifiedDiffTarget(target) {
  return cleanGitDiffTarget(decodeGitMetadataTarget(target, !0));
}
function cleanExtendedGitTarget(target) {
  return cleanExactPatchTarget(decodeGitMetadataTarget(target, !1));
}
function decodeGitMetadataTarget(target, allowTrailingMetadata) {
  let trimmed = target.trim(), quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : void 0;
  if (quote) {
    let field = parseQuotedGitDiffField(trimmed, 0, quote);
    if (field && (allowTrailingMetadata || trimmed.slice(field.end).trim() === ""))
      return field.value;
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
  let path = target.split("\t", 1)[0]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  return path === "" || path === "/dev/null" ? [] : [path];
}

// src/domain/invocation.ts
function createToolInvocation(toolName, input, route, context, command) {
  if (route.kind !== "command")
    return { toolName, input, route, context };
  return { toolName, input, route, context, command };
}

// src/integrations/audit.ts
function projectGuardAudit(invocation, evaluation, auditAllowed, includeInvocationCommand = !0, failure) {
  if (evaluation.decision.kind === "allow") {
    if (!auditAllowed || invocation.route.kind !== "command")
      return;
    let command2 = getInvocationCommand(invocation);
    return {
      decision: "allow",
      command: command2,
      segment: command2,
      reason: "allowed",
      cwd: invocation.context.executionCwd,
      toolName: invocation.toolName
    };
  }
  let evidence = evaluation.decision.evidence.find((item) => item.kind === "command"), command = evidence?.command ?? (includeInvocationCommand ? getInvocationCommand(invocation) : "");
  return {
    decision: "deny",
    command,
    segment: evidence?.segment ?? command,
    reason: evaluation.decision.reason,
    cwd: invocation.context.executionCwd,
    toolName: invocation.toolName,
    ruleId: evaluation.decision.ruleId,
    intent: evaluation.decision.intent,
    failureStage: failure?.stage,
    errorCode: failure?.errorCode
  };
}
function getInvocationCommand(invocation) {
  return "command" in invocation ? invocation.command ?? "" : "";
}
function writeGuardAudit(audit, getSessionId, options) {
  if (!audit)
    return;
  let sessionId;
  try {
    sessionId = getSessionId();
  } catch {
    return;
  }
  if (typeof sessionId !== "string" || !sessionId.trim())
    return;
  writeAuditLog(sessionId, audit.command, audit.segment, audit.reason, audit.cwd, {
    homeDir: options.homeDir,
    decision: audit.decision,
    agent: options.agent,
    shape: options.shape,
    toolName: audit.toolName,
    ruleId: audit.ruleId,
    intent: audit.intent,
    failureStage: audit.failureStage,
    errorCode: audit.errorCode
  });
}
function writeIntegrationDenialAudit(denial, getSessionId, options) {
  let sessionId;
  try {
    sessionId = getSessionId();
  } catch {
    return;
  }
  if (typeof sessionId !== "string" || !sessionId.trim())
    return;
  writeAuditLog(sessionId, denial.command ?? "", denial.segment ?? denial.command ?? "", denial.reason, options.cwd ?? null, {
    homeDir: options.homeDir,
    decision: "deny",
    agent: options.agent,
    shape: options.shape,
    toolName: options.toolName ?? denial.toolName,
    ruleId: denial.ruleId,
    intent: denial.intent
  });
}

// src/core/format.ts
function formatBlockedMessage(input) {
  let { reason, command, segment, toolName } = input, maxLen = input.maxLen ?? 200, redact = input.redact ?? ((t) => t), message = `BLOCKED by CC Safety Net

Reason: ${redact(reason)}`;
  if (input.ruleId)
    message += `

Rule: ${input.ruleId}`;
  if (toolName)
    message += `

Tool: ${toolName}`;
  if (command) {
    let safeCommand = redact(command);
    message += `

Command: ${excerpt(safeCommand, maxLen)}`;
  }
  if (segment && segment !== command) {
    let safeSegment = redact(segment);
    message += `

Segment: ${excerpt(safeSegment, maxLen)}`;
  }
  return message += `

${getFooter(input)}`, message;
}
function getFooter(input) {
  switch (input.manualPermissionAdvice === !1 ? "hard_stop" : input.intent ?? "manual_only") {
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

// src/core/reasons.ts
var REASON_STRICT_UNPARSEABLE = "Command could not be safely analyzed (strict mode). Simplify the command and retry, or ask the user to verify.", REASON_RECURSION_LIMIT = "Command exceeds maximum recursion depth and cannot be safely analyzed. Flatten the nesting and retry.", REASON_STRUCTURAL_COMMAND_VALIDATION_LIMIT = "CC Safety Net could not validate the command because its structure exceeds safe analysis limits.", REASON_SAFETY_NET_FAILED_CLOSED = "CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.";

// src/integrations/denial.ts
function projectGuardDenial(evaluation, options) {
  if (evaluation.decision.kind !== "deny")
    return;
  let evidence = options.includeEvidence ? evaluation.decision.evidence.find((item) => item.kind === "command") : void 0;
  return {
    reason: evaluation.decision.reason,
    ruleId: evaluation.decision.ruleId,
    intent: evaluation.decision.intent,
    command: evidence?.command,
    segment: evidence?.segment,
    toolName: options.toolName
  };
}
function createFailedClosedDenial(options = {}) {
  return {
    reason: REASON_SAFETY_NET_FAILED_CLOSED,
    intent: "stop_and_explain",
    command: options.command,
    segment: options.segment ?? options.command,
    toolName: options.toolName
  };
}
function formatDenial(denial) {
  return formatBlockedMessage({ ...denial, redact: redactSecrets });
}
function formatIntegrationError(cause) {
  return redactSecrets(cause instanceof Error ? cause.message : String(cause));
}

// src/core/path-canonicalization.ts
import { realpathSync as realpathSync3 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { basename as basename2, dirname as dirname3, join as join3 } from "node:path";
var PATH_CANONICALIZATION_LIMITS = Object.freeze({
  maxEnvironmentExpansionDepth: 64,
  maxMissingSuffixComponents: 256,
  maxRealpathAttempts: 1024,
  maxProcessedCandidateBytes: 4194304
});

class PathCanonicalizationLimitError extends Error {
  name = "PathCanonicalizationLimitError";
  constructor() {
    super("Path canonicalization work limit exceeded.");
  }
}
function createPathCanonicalizationBudget() {
  return { realpathAttempts: 0, processedCandidateBytes: 0, resolvedPaths: /* @__PURE__ */ new Map };
}
var SUPPORTED_PATH_ENV_NAMES = /* @__PURE__ */ new Set([
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
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME"
]);
function expandSupportedPathEnvironmentVariables(value) {
  return expandSupportedPathEnvironmentVariablesAtDepth(value, 0);
}
function expandSupportedPathEnvironmentVariablesAtDepth(value, depth) {
  let expanded = "", index = 0;
  while (index < value.length) {
    if (value[index] !== "$") {
      expanded += value[index], index++;
      continue;
    }
    if (value[index + 1] === "{") {
      let name2 = readPathEnvironmentName(value, index + 2), end = findParameterExpansionEnd(value, index, depth);
      if (end === null) {
        if (SUPPORTED_PATH_ENV_NAMES.has(name2))
          throw new PathCanonicalizationLimitError;
        expanded += value.slice(index);
        break;
      }
      let match = value.slice(index, end + 1);
      expanded += expandBracedPathEnvironmentVariable(match, depth), index = end + 1;
      continue;
    }
    let name = readPathEnvironmentName(value, index + 1);
    if (!name) {
      expanded += "$", index++;
      continue;
    }
    expanded += getSupportedPathEnvironmentValue(name) ?? `$${name}`, index += name.length + 1;
  }
  return expanded;
}
function findParameterExpansionEnd(value, start, depth) {
  let nesting = 1;
  for (let index = start + 2;index < value.length; index++) {
    if (value[index] === "\\") {
      index++;
      continue;
    }
    if (value[index] === "$" && value[index + 1] === "{") {
      if (nesting++, depth + nesting > PATH_CANONICALIZATION_LIMITS.maxEnvironmentExpansionDepth)
        throw new PathCanonicalizationLimitError;
      index++;
      continue;
    }
    if (value[index] !== "}")
      continue;
    if (nesting--, nesting === 0)
      return index;
  }
  return null;
}
function expandBracedPathEnvironmentVariable(match, depth) {
  let content = match.slice(2, -1), name = readPathEnvironmentName(content, 0);
  if (!name)
    return match;
  let suffix = content.slice(name.length);
  if (!suffix)
    return getSupportedPathEnvironmentValue(name) ?? match;
  let operator = [":-", ":+", ":=", ":?", "-", "+", "=", "?"].find((candidate) => suffix.startsWith(candidate));
  if (!operator) {
    if (SUPPORTED_PATH_ENV_NAMES.has(name))
      throw new PathCanonicalizationLimitError;
    return match;
  }
  if (operator.endsWith("="))
    throw new PathCanonicalizationLimitError;
  if (!SUPPORTED_PATH_ENV_NAMES.has(name))
    return match;
  let environmentValue = getSupportedPathEnvironmentValue(name), usable = operator.startsWith(":") ? environmentValue !== null && environmentValue !== "" : environmentValue !== null;
  if (operator.endsWith("?") && !usable)
    throw new PathCanonicalizationLimitError;
  if (operator.endsWith("-") || operator.endsWith("?"))
    return usable ? environmentValue ?? "" : expandSupportedPathEnvironmentVariablesAtDepth(suffix.slice(operator.length), depth + 1);
  return usable ? expandSupportedPathEnvironmentVariablesAtDepth(suffix.slice(operator.length), depth + 1) : "";
}
function readPathEnvironmentName(value, start) {
  if (!/[A-Za-z_]/.test(value[start] ?? ""))
    return "";
  let end = start + 1;
  while (/[A-Za-z0-9_]/.test(value[end] ?? ""))
    end++;
  return value.slice(start, end);
}
function resolveExistingPath(path, budget = createPathCanonicalizationBudget()) {
  if (!path)
    return path;
  let cached = budget.resolvedPaths.get(path);
  if (cached !== void 0)
    return cached;
  let suffixes = [], candidate = path;
  while (!0) {
    if (budget.realpathAttempts++, budget.processedCandidateBytes += Buffer.byteLength(candidate), budget.realpathAttempts > PATH_CANONICALIZATION_LIMITS.maxRealpathAttempts || budget.processedCandidateBytes > PATH_CANONICALIZATION_LIMITS.maxProcessedCandidateBytes)
      throw new PathCanonicalizationLimitError;
    try {
      let existing = realpathSync3(candidate), resolved = suffixes.length === 0 ? existing : join3(existing, ...suffixes.reverse());
      return budget.resolvedPaths.set(path, resolved), resolved;
    } catch {
      let parent = dirname3(candidate);
      if (parent === candidate) {
        let resolved = suffixes.length === 0 ? candidate : join3(candidate, ...suffixes.reverse());
        return budget.resolvedPaths.set(path, resolved), resolved;
      }
      if (suffixes.length >= PATH_CANONICALIZATION_LIMITS.maxMissingSuffixComponents)
        throw new PathCanonicalizationLimitError;
      suffixes.push(basename2(candidate)), candidate = parent;
    }
  }
}
function getSupportedPathEnvironmentValue(name) {
  if (!SUPPORTED_PATH_ENV_NAMES.has(name))
    return null;
  if (name === "HOME")
    return getOwnEnvValue("HOME") ?? homedir2();
  return getOwnEnvValue(name) ?? null;
}

// node_modules/shell-quote/index.js
var $quote = require_quote(), $parse = require_parse();

// src/core/shell/shared.ts
function advanceQuoteScanState(char, state) {
  if (state.escaped)
    return state.escaped = !1, !0;
  if (char === "\\" && !state.inSingle)
    return state.escaped = !0, !0;
  if (char === "'" && !state.inDouble)
    return state.inSingle = !state.inSingle, !0;
  if (char === '"' && !state.inSingle)
    return state.inDouble = !state.inDouble, !0;
  return !1;
}
function hasUnclosedQuotes(command) {
  let state = { inSingle: !1, inDouble: !1, escaped: !1 };
  for (let char of stripShellComments(command))
    advanceQuoteScanState(char, state);
  return state.inSingle || state.inDouble;
}
function stripShellComments(command) {
  let result = "", state = { inSingle: !1, inDouble: !1, escaped: !1 }, inComment = !1, atTokenStart = !0;
  for (let i = 0;i < command.length; i++) {
    let char = command[i];
    if (!char)
      break;
    if (inComment) {
      if (char === `
` || char === "\r")
        result += char, inComment = !1, state.escaped = !1;
      continue;
    }
    if (char === "#" && !state.inSingle && !state.inDouble && atTokenStart) {
      inComment = !0;
      continue;
    }
    if (result += char, !state.inSingle && !state.inDouble && !state.escaped)
      atTokenStart = /[\s;&|()<>]/.test(char);
    advanceQuoteScanState(char, state);
  }
  return result;
}
function getCommandTokenText(token) {
  if (typeof token === "string")
    return token;
  if (token && typeof token === "object" && "pattern" in token && typeof token.pattern === "string")
    return token.pattern;
  return null;
}

// src/parser/heredoc.ts
function readHeredocDelimiter(source, start, end) {
  if (start >= end || isBoundary(source[start] ?? ""))
    return null;
  let delimiter = "", quoted = !1, ambiguous = !1, i = start;
  while (i < end && !isBoundary(source[i] ?? "")) {
    let char = source[i] ?? "";
    if (char === "'") {
      quoted = !0;
      let result = readQuotedDelimiter(source, i + 1, end, "'");
      delimiter += result.text, ambiguous ||= !result.closed, i = result.next;
      continue;
    }
    if (char === '"') {
      quoted = !0;
      let result = readQuotedDelimiter(source, i + 1, end, '"');
      delimiter += result.text, ambiguous ||= !result.closed, i = result.next;
      continue;
    }
    if (char === "\\") {
      quoted = !0;
      let next = source[i + 1];
      if (!next || next === `
` || next === "\r") {
        ambiguous = !0;
        break;
      }
      delimiter += next, i += 2;
      continue;
    }
    if (char === "`" || source.startsWith("$(", i) || source.startsWith("${", i) || source.startsWith("<(", i) || source.startsWith(">(", i))
      ambiguous = !0;
    delimiter += char, i++;
  }
  return { delimiter, quoted, next: i, span: { start, end: i }, ambiguous };
}
function consumeHeredocBodies(source, start, end, pending) {
  let issues = [], cursor = start;
  for (let declaration of pending) {
    let bodyStart = cursor, terminated = !1;
    while (cursor < end) {
      let line = readLine(source, cursor, end);
      if ((declaration.stripTabs ? line.text.replace(/^\t+/, "") : line.text) === declaration.delimiter) {
        declaration.attach({
          body: declaration.stripTabs ? stripLeadingTabs(source.slice(bodyStart, cursor)) : source.slice(bodyStart, cursor),
          delimiter: declaration.delimiter,
          quotedDelimiter: declaration.quotedDelimiter,
          stripTabs: declaration.stripTabs,
          bodySpan: { start: bodyStart, end: cursor },
          terminatorSpan: { start: cursor, end: line.contentEnd }
        }), cursor = line.next, terminated = !0;
        break;
      }
      if (line.next <= cursor)
        break;
      cursor = line.next;
    }
    if (terminated)
      continue;
    return issues.push({
      code: "unterminated-heredoc",
      message: `heredoc delimiter ${declaration.delimiter} was not found`,
      span: declaration.declarationSpan
    }), { next: end, issues, terminated: !1 };
  }
  return { next: cursor, issues, terminated: !0 };
}
function readQuotedDelimiter(source, start, end, quote) {
  let text = "", i = start;
  while (i < end && source[i] !== `
` && source[i] !== "\r") {
    let char = source[i] ?? "";
    if (char === quote)
      return { text, next: i + 1, closed: !0 };
    if (quote === '"' && char === "\\" && source[i + 1]) {
      let next = source[i + 1] ?? "";
      text += ["$", "`", '"', "\\"].includes(next) ? next : `\\${next}`, i += 2;
      continue;
    }
    text += char, i++;
  }
  return { text, next: i, closed: !1 };
}
function isBoundary(char) {
  return /[\s;&|<>)]/u.test(char) || char === "`";
}
function readLine(source, start, end) {
  let contentEnd = start;
  while (contentEnd < end && source[contentEnd] !== `
` && source[contentEnd] !== "\r")
    contentEnd++;
  let next = contentEnd >= end ? end : source[contentEnd] === "\r" && source[contentEnd + 1] === `
` ? contentEnd + 2 : contentEnd + 1;
  return { text: source.slice(start, contentEnd), contentEnd, next };
}
function stripLeadingTabs(body) {
  return body.replace(/(^|\r\n?|\n)\t+/g, "$1");
}

// src/parser/immutable.ts
function createCommandNodes() {
  return [];
}
function createCommandIssues() {
  return [];
}
function createCommandAccumulator() {
  return {
    words: [],
    redirections: [],
    nested: [],
    start: -1,
    end: -1,
    reset() {
      this.words = [], this.redirections = [], this.nested = [], this.start = -1, this.end = -1;
    }
  };
}
function freezeCommandView(command) {
  return Object.freeze({
    ...command,
    span: Object.freeze(command.span),
    words: Object.freeze(command.words),
    tokens: Object.freeze(command.tokens),
    analysisTokens: Object.freeze(command.analysisTokens),
    redirections: Object.freeze(command.redirections.map((redirection) => Object.freeze({
      ...redirection,
      span: Object.freeze(redirection.span),
      ...redirection.heredoc ? {
        heredoc: Object.freeze({
          ...redirection.heredoc,
          bodySpan: Object.freeze(redirection.heredoc.bodySpan),
          terminatorSpan: Object.freeze(redirection.heredoc.terminatorSpan)
        })
      } : {}
    }))),
    nested: Object.freeze(command.nested.map((program) => freezeCommandProgram(program)))
  });
}
function appendAccumulatedCommand(nodes, accumulator, command) {
  nodes.push(command), accumulator.reset();
}
function appendCommandWordPart(parts, source, start, end, provenance) {
  if (end <= start)
    return;
  parts.push({ raw: source.slice(start, end), span: { start, end }, provenance });
}
function createCommandWordParts(source) {
  let parts = [];
  return {
    parts,
    push: (start, end, provenance) => appendCommandWordPart(parts, source, start, end, provenance)
  };
}
function freezeCommandWord(word) {
  let parts = word.parts ?? [
    {
      raw: word.raw,
      span: word.span,
      provenance: word.provenance
    }
  ];
  return Object.freeze({
    kind: "word",
    ...word,
    span: Object.freeze(word.span),
    parts: Object.freeze(parts.map((part) => Object.freeze({ ...part, span: Object.freeze(part.span) })))
  });
}
function freezeParsedCommandWord(source, start, end, text, provenance, quoted, parts) {
  return freezeCommandWord({
    text,
    raw: source.slice(start, end),
    span: { start, end },
    provenance,
    quoted,
    ...parts ? { parts } : {}
  });
}
function freezeCommandProgram(program) {
  return Object.freeze({
    ...program,
    span: Object.freeze(program.span),
    issues: Object.freeze(program.issues.map((issue) => Object.freeze({ ...issue, span: Object.freeze(issue.span) }))),
    nodes: Object.freeze(program.nodes.map((node) => {
      if (node.kind === "command")
        return freezeCommandView(node);
      if (node.kind === "group")
        return Object.freeze({
          ...node,
          span: Object.freeze(node.span),
          body: freezeCommandProgram(node.body)
        });
      return Object.freeze({ ...node, span: Object.freeze(node.span) });
    }))
  });
}

// src/parser/posix.ts
var CONTINUATION_CONNECTORS = /* @__PURE__ */ new Set(["&&", "||", "|", "|&"]);
function parsePosixCommand(source, dialect, limits) {
  let span = { start: 0, end: source.length };
  if (source.length > limits.maxInputLength)
    return freezeCommandProgram({
      kind: "program",
      dialect,
      source,
      span,
      status: "limited",
      issues: [
        {
          code: "input-limit",
          message: `command exceeds ${limits.maxInputLength} UTF-16 code units`,
          span
        }
      ],
      nodes: []
    });
  let result = scanSequence(source, 0, source.length, dialect, limits, {
    used: 0,
    max: limits.maxWords
  }, 0);
  return freezeCommandProgram({
    kind: "program",
    dialect,
    source,
    span,
    status: getParseStatus(result.issues, result.limited),
    issues: result.issues,
    nodes: result.nodes
  });
}
function scanSequence(source, start, end, dialect, limits, wordBudget, depth, closing) {
  let nodes = createCommandNodes(), issues = createCommandIssues(), accumulator = createCommandAccumulator(), pendingHeredocs = [], flushCommand = () => {
    if (accumulator.words.length === 0 && accumulator.redirections.length === 0)
      return;
    let span = { start: accumulator.start, end: accumulator.end }, tokens = accumulator.words.map((word) => word.text), analysisTokens = accumulator.words.map((word) => word.provenance === "command-substitution" ? word.raw : word.text);
    appendAccumulatedCommand(nodes, accumulator, {
      kind: "command",
      dialect,
      source: source.slice(span.start, span.end),
      span,
      words: accumulator.words,
      tokens,
      analysisTokens,
      redirections: accumulator.redirections,
      nested: accumulator.nested,
      dynamicExecutable: accumulator.words[0]?.provenance === "command-substitution",
      legacyNormalized: issues.length > 0 && nodes.length === 0 ? source.slice(start, end) : tokens.join(" ")
    });
  }, i = start;
  while (i < end) {
    let char = source[i];
    if (!char)
      break;
    if (closing && char === closing)
      return flushCommand(), appendMissingCommandIssue(nodes, issues), {
        nodes,
        issues,
        next: i + 1,
        closed: !0,
        limited: !1,
        pendingHeredocs
      };
    if (isShellWhitespace(char)) {
      if (char === `
` || char === "\r") {
        flushCommand();
        let connectorEnd = char === "\r" && source[i + 1] === `
` ? i + 2 : i + 1, previous = nodes.at(-1);
        if (previous?.kind !== "connector" || !CONTINUATION_CONNECTORS.has(previous.operator))
          nodes.push(Object.freeze({
            kind: "connector",
            operator: source.slice(i, connectorEnd),
            span: Object.freeze({ start: i, end: connectorEnd })
          }));
        if (pendingHeredocs.length > 0) {
          let bodies = consumeHeredocBodies(source, connectorEnd, end, pendingHeredocs.splice(0));
          issues.push(...bodies.issues), i = bodies.next;
          continue;
        }
        i = connectorEnd;
        continue;
      }
      i++;
      continue;
    }
    if (char === "#") {
      while (i < end && source[i] !== `
` && source[i] !== "\r")
        i++;
      continue;
    }
    let connector = readConnector(source, i);
    if (connector) {
      if (flushCommand(), !isExecutableNode(nodes.at(-1)))
        issues.push({
          code: "unexpected-connector",
          message: `connector ${connector} has no preceding command`,
          span: { start: i, end: i + connector.length }
        });
      nodes.push(Object.freeze({
        kind: "connector",
        operator: connector,
        span: Object.freeze({ start: i, end: i + connector.length })
      })), i += connector.length;
      continue;
    }
    if (char === ")") {
      flushCommand(), issues.push({
        code: "unexpected-closing-delimiter",
        message: "closing parenthesis has no matching opening parenthesis",
        span: { start: i, end: i + 1 }
      }), nodes.push({ kind: "unknown", source: char, span: { start: i, end: i + 1 } }), i++;
      continue;
    }
    if ((char === "(" || char === "{" && isBraceGroupOpening(source, i, end)) && accumulator.start === -1) {
      if (appendMissingConnectorIssue(nodes, issues, i), depth >= limits.maxDepth)
        return limitedResult(nodes, issues, i, "depth-limit", limits.maxDepth);
      let close = char === "(" ? ")" : "}", inner = scanSequence(source, i + 1, end, dialect, limits, wordBudget, depth + 1, close), groupEnd = inner.next, bodySpan = { start: i + 1, end: inner.closed ? groupEnd - 1 : groupEnd }, body = {
        kind: "program",
        dialect,
        source: source.slice(bodySpan.start, bodySpan.end),
        span: bodySpan,
        status: getParseStatus(inner.issues, inner.limited),
        issues: inner.issues,
        nodes: inner.nodes
      };
      if (nodes.push({
        kind: "group",
        style: char === "(" ? "subshell" : "brace",
        span: { start: i, end: groupEnd },
        body
      }), issues.push(...inner.issues), inner.pendingHeredocs.length > 0 || containsHeredoc(inner.nodes))
        issues.push({
          code: "unsupported-heredoc-context",
          message: "heredocs attached inside command groups are not supported safely",
          span: { start: i, end: groupEnd }
        });
      if (pendingHeredocs.push(...inner.pendingHeredocs), inner.limited)
        return propagatedLimitResult(nodes, issues, inner.next);
      if (!inner.closed)
        issues.push({
          code: char === "(" ? "unclosed-subshell" : "unclosed-brace-group",
          message: `${char} group is not closed`,
          span: { start: i, end: groupEnd }
        });
      i = groupEnd;
      continue;
    }
    let redirect = (char === "<" || char === ">") && source[i + 1] !== "(" ? readRedirect(source, i) : null;
    if (redirect) {
      let prior = accumulator.words.at(-1), attachedFd = prior && prior.span.end === i && /^[0-9]+$/.test(prior.raw) ? Number(prior.raw) : void 0;
      if (attachedFd !== void 0)
        accumulator.words.pop();
      let redirectStart = attachedFd === void 0 ? i : prior?.span.start ?? i;
      accumulator.start = accumulator.start === -1 ? i : accumulator.start;
      let targetStart = i + redirect.length;
      while (targetStart < end && /[ \t]/.test(source[targetStart] ?? ""))
        targetStart++;
      let targetChar = source[targetStart], targetStartsComment = targetStart > i + redirect.length && targetChar === "#", targetIsBoundary = !targetChar || isShellWhitespace(targetChar) || !!readConnector(source, targetStart) || targetChar === closing || targetChar === ")" || targetStartsComment || (targetChar === "<" || targetChar === ">") && source[targetStart + 1] !== "(", delimiter = redirect === "<<" || redirect === "<<-" ? readHeredocDelimiter(source, targetStart, end) : void 0, targetResult = delimiter ? {
        word: freezeParsedCommandWord(source, targetStart, delimiter.next, delimiter.delimiter, "literal", delimiter.quoted),
        nested: [],
        issues: [],
        next: delimiter.next,
        limited: !1
      } : !targetIsBoundary ? readWord(source, targetStart, end, dialect, limits, wordBudget, depth) : void 0;
      if (targetResult) {
        if (issues.push(...targetResult.issues), targetResult.limited)
          return propagatedLimitResult(nodes, issues, targetResult.next);
        if (!consumeWord(wordBudget))
          return limitedResult(nodes, issues, targetResult.next, "word-limit", limits.maxWords);
      }
      let redirectEnd = targetResult?.next ?? i + redirect.length, redirection = {
        kind: "redirection",
        operator: redirect,
        span: { start: redirectStart, end: redirectEnd },
        ...attachedFd === void 0 ? {} : { fd: attachedFd },
        ...targetResult ? { target: targetResult.word } : {}
      };
      if (accumulator.redirections.push(redirection), redirect === "<<" || redirect === "<<-")
        if (!delimiter)
          issues.push({
            code: "missing-heredoc-delimiter",
            message: "heredoc redirection requires a delimiter word",
            span: { start: i, end: i + redirect.length }
          });
        else {
          if (delimiter.ambiguous || delimiter.delimiter.length === 0)
            issues.push({
              code: "ambiguous-heredoc-delimiter",
              message: "heredoc delimiter cannot be determined safely",
              span: delimiter.span
            });
          pendingHeredocs.push({
            delimiter: delimiter.delimiter,
            quotedDelimiter: delimiter.quoted,
            stripTabs: redirect === "<<-",
            declarationSpan: { start: redirectStart, end: redirectEnd },
            attach: (heredoc) => {
              redirection.heredoc = heredoc;
            }
          });
        }
      else if (!targetResult)
        issues.push({
          code: "missing-redirection-target",
          message: `redirection ${redirect} requires a target word`,
          span: { start: i, end: i + redirect.length }
        });
      if (targetResult)
        accumulator.nested.push(...targetResult.nested);
      accumulator.end = redirectEnd, i = redirectEnd;
      continue;
    }
    if (accumulator.start === -1)
      appendMissingConnectorIssue(nodes, issues, i);
    let wordResult = readWord(source, i, end, dialect, limits, wordBudget, depth);
    if (issues.push(...wordResult.issues), wordResult.limited)
      return propagatedLimitResult(nodes, issues, wordResult.next);
    let expanded = isCommandWordPosition(accumulator.words) ? expandLiteralCommandWord(source, wordResult.word, wordBudget.max - wordBudget.used, limits.maxDepth, limits.maxInputLength) : void 0;
    if (expanded?.limitCode)
      return limitedResult(nodes, issues, wordResult.next, expanded.limitCode, expanded.limitCode === "word-limit" ? limits.maxWords : expanded.limitCode === "depth-limit" ? limits.maxDepth : limits.maxInputLength);
    let words = expanded?.words ?? [wordResult.word];
    for (let word of words) {
      if (!consumeWord(wordBudget))
        return limitedResult(nodes, issues, wordResult.next, "word-limit", limits.maxWords);
      accumulator.words.push(word);
    }
    accumulator.start = accumulator.start === -1 ? i : accumulator.start, accumulator.end = wordResult.next, accumulator.nested.push(...wordResult.nested), i = wordResult.next > i ? wordResult.next : i + 1;
  }
  return flushCommand(), appendMissingCommandIssue(nodes, issues), issues.push(...unterminatedHeredocIssues(pendingHeredocs)), {
    nodes,
    issues,
    next: i,
    closed: closing === void 0,
    limited: !1,
    pendingHeredocs: []
  };
}
function readWord(source, start, end, dialect, limits, wordBudget, depth) {
  let text = "", i = start, quoted = !1, provenance = "literal", nested = [], issues = [], limited = !1;
  while (i < end) {
    let char = source[i], processSubstitution = (char === "<" || char === ">") && source[i + 1] === "(";
    if (!char || isShellWhitespace(char) || (char === ";" || char === "|" || char === "&") && readConnector(source, i) || (char === "<" || char === ">") && !processSubstitution)
      break;
    if (char === ")")
      break;
    if (char === "'") {
      quoted = !0;
      let close = source.indexOf("'", i + 1);
      if (close === -1 || close >= end) {
        text += source.slice(i + 1, end), issues.push({
          code: "unclosed-single-quote",
          message: "single-quoted word is not closed",
          span: { start: i, end }
        }), i = end;
        break;
      }
      text += source.slice(i + 1, close), i = close + 1;
      continue;
    }
    if (char === '"') {
      quoted = !0;
      let result = readDoubleQuoted(source, i, end, dialect, limits, wordBudget, depth);
      if (text += result.text, nested.push(...result.nested), issues.push(...result.issues), limited ||= result.limited, provenance = mergeProvenance(provenance, result.provenance), i = result.next, limited)
        break;
      continue;
    }
    if (source.startsWith("$'", i)) {
      quoted = !0;
      let ansi = readAnsiCString(source, i + 2, end);
      if (text += ansi.text, issues.push(...ansi.issues), !ansi.closed)
        issues.push({
          code: "unclosed-ansi-c-quote",
          message: "ANSI-C quoted word is not closed",
          span: { start: i, end }
        });
      i = ansi.next;
      continue;
    }
    if (char === "\\") {
      let next = source[i + 1];
      if (!next) {
        issues.push({
          code: "trailing-escape",
          message: "escape has no following character",
          span: { start: i, end: i + 1 }
        }), i++;
        break;
      }
      if (next === `
`) {
        i += 2;
        continue;
      }
      text += next, i += 2;
      continue;
    }
    let substitution = char === "$" || char === "<" || char === ">" || char === "`" ? readSubstitution(source, i, end, dialect, limits, wordBudget, depth) : null;
    if (substitution) {
      let collected = collectSubstitution(substitution, nested, issues);
      if (limited ||= collected.limited, provenance = mergeProvenance(provenance, collected.provenance), i = collected.next, limited)
        break;
      continue;
    }
    if (char === "$") {
      let variable = appendVariable(source, i, end, text, provenance);
      text = variable.text, provenance = variable.provenance, i = variable.next;
      continue;
    }
    if (char === "*" || char === "?" || char === "[")
      provenance = mergeProvenance(provenance, "glob");
    text += char, i++;
  }
  return {
    word: freezeParsedCommandWord(source, start, i, text, provenance, quoted, provenance === "literal" ? void 0 : derivePosixWordParts(source, start, i)),
    nested,
    issues,
    next: i,
    limited
  };
}
function readDoubleQuoted(source, start, end, dialect, limits, wordBudget, depth) {
  let text = "", provenance = "literal", nested = [], issues = [], limited = !1, i = start + 1;
  while (i < end) {
    let char = source[i];
    if (char === '"')
      return { text, provenance, nested, issues, next: i + 1, limited };
    if (char === "\\" && source[i + 1]) {
      let escaped = source[i + 1] ?? "";
      if (escaped === `
`) {
        i += 2;
        continue;
      }
      if (escaped === "\r" && source[i + 2] === `
`) {
        i += 3;
        continue;
      }
      text += ["$", "`", '"', "\\"].includes(escaped) ? escaped : `\\${escaped}`, i += 2;
      continue;
    }
    if (source.startsWith("$((", i)) {
      let close = findSubstitutionEnd(source, i + 3, end, "))"), next = close === -1 ? end : close + 2;
      if (text += source.slice(i, next), close === -1)
        issues.push({
          code: "unclosed-arithmetic",
          message: "$(( substitution is not closed",
          span: { start: i, end: next }
        });
      i = next;
      continue;
    }
    let substitution = readSubstitution(source, i, end, dialect, limits, wordBudget, depth);
    if (substitution) {
      let collected = collectSubstitution(substitution, nested, issues);
      if (i = collected.next, limited ||= collected.limited, provenance = mergeProvenance(provenance, collected.provenance), limited)
        return { text, provenance, nested, issues, next: i, limited };
      continue;
    }
    if (char === "$") {
      let variable = appendVariable(source, i, end, text, provenance);
      text = variable.text, provenance = variable.provenance, i = variable.next;
      continue;
    }
    text += char ?? "", i++;
  }
  return issues.push({
    code: "unclosed-double-quote",
    message: "double-quoted word is not closed",
    span: { start, end }
  }), { text, provenance, nested, issues, next: end, limited };
}
function readSubstitution(source, start, end, dialect, limits, wordBudget, depth) {
  let arithmetic = source.startsWith("$((", start), command = source.startsWith("$(", start) && !arithmetic, process2 = (source.startsWith("<(", start) || source.startsWith(">(", start)) && !0, backtick = source[start] === "`";
  if (!arithmetic && !command && !process2 && !backtick)
    return null;
  let openLength = arithmetic ? 3 : backtick ? 1 : 2, closing = arithmetic ? "))" : backtick ? "`" : ")", close = findSubstitutionEnd(source, start + openLength, end, closing), innerEnd = close === -1 ? end : close, next = close === -1 ? end : close + closing.length;
  if (depth >= limits.maxDepth)
    return {
      program: limitedProgram(source, start + openLength, innerEnd, dialect, "depth-limit"),
      next,
      provenance: arithmetic ? "arithmetic" : "command-substitution"
    };
  if (arithmetic) {
    let arithmeticNodes = [], arithmeticIssues = [], arithmeticLimited = !1, cursor = start + openLength;
    while (cursor < innerEnd) {
      let nestedSubstitution = readSubstitution(source, cursor, innerEnd, dialect, limits, wordBudget, depth + 1);
      if (!nestedSubstitution) {
        cursor++;
        continue;
      }
      if (arithmeticNodes.push(...nestedSubstitution.program.nodes), arithmeticIssues.push(...nestedSubstitution.program.issues), arithmeticLimited ||= nestedSubstitution.program.status === "limited", cursor = nestedSubstitution.next, arithmeticLimited)
        break;
    }
    if (close === -1)
      arithmeticIssues.push({
        code: "unclosed-arithmetic",
        message: "$(( substitution is not closed",
        span: { start, end: next }
      });
    return {
      program: freezeCommandProgram({
        kind: "program",
        dialect,
        source: source.slice(start + openLength, innerEnd),
        span: { start: start + openLength, end: innerEnd },
        status: getParseStatus(arithmeticIssues, arithmeticLimited),
        issues: arithmeticIssues,
        nodes: arithmeticNodes
      }),
      next,
      provenance: "arithmetic"
    };
  }
  let inner = scanSequence(source, start + openLength, innerEnd, dialect, limits, wordBudget, depth + 1), substitutionIssue = close === -1 ? [
    {
      code: arithmetic ? "unclosed-arithmetic" : "unclosed-command-substitution",
      message: `${source.slice(start, start + openLength)} substitution is not closed`,
      span: { start, end: next }
    }
  ] : [], contextIssue = (backtick || process2) && containsHeredoc(inner.nodes) ? [
    {
      code: "unsupported-heredoc-context",
      message: "heredocs are supported only in ordinary commands and $(...) substitutions",
      span: { start, end: next }
    }
  ] : [];
  return {
    program: freezeCommandProgram({
      kind: "program",
      dialect,
      source: source.slice(start + openLength, innerEnd),
      span: { start: start + openLength, end: innerEnd },
      status: getParseStatus([...inner.issues, ...substitutionIssue, ...contextIssue], inner.limited),
      issues: [...inner.issues, ...substitutionIssue, ...contextIssue],
      nodes: inner.nodes
    }),
    next,
    provenance: arithmetic ? "arithmetic" : "command-substitution"
  };
}
function collectSubstitution(substitution, nested, issues) {
  return nested.push(substitution.program), issues.push(...substitution.program.issues), {
    provenance: substitution.provenance,
    next: substitution.next,
    limited: substitution.program.status === "limited"
  };
}
function findSubstitutionEnd(source, start, end, closing) {
  if (closing === "`") {
    for (let i = start;i < end; i++)
      if (source[i] === "\\")
        i++;
      else if (source[i] === "`")
        return i;
    return -1;
  }
  let depth = 1, single = !1, double = !1, pendingHeredocs = [];
  for (let i = start;i < end; i++) {
    let char = source[i];
    if (char === "\\" && !single) {
      i++;
      continue;
    }
    if ((char === `
` || char === "\r") && pendingHeredocs.length > 0) {
      let lineEnd = char === "\r" && source[i + 1] === `
` ? i + 2 : i + 1, bodies = consumeHeredocBodies(source, lineEnd, end, pendingHeredocs.splice(0));
      if (!bodies.terminated)
        return -1;
      i = bodies.next - 1;
      continue;
    }
    if (!double && char === "'")
      single = !single;
    if (!single && char === '"')
      double = !double;
    if (single)
      continue;
    if (!double && char === "#" && isCommentStart(source, i, start)) {
      while (i + 1 < end && source[i + 1] !== `
` && source[i + 1] !== "\r")
        i++;
      continue;
    }
    if (!double && source.startsWith("$((", i)) {
      let arithmeticClose = findArithmeticEnd(source, i + 3, end);
      if (arithmeticClose === -1)
        return -1;
      i = arithmeticClose + 1;
      continue;
    }
    if (closing === ")" && !double && char === "<" && source[i + 1] === "<" && source[i + 2] !== "<") {
      let stripTabs = source[i + 2] === "-", targetStart = i + (stripTabs ? 3 : 2);
      while (targetStart < end && /[ \t]/.test(source[targetStart] ?? ""))
        targetStart++;
      let delimiter = readHeredocDelimiter(source, targetStart, end);
      if (delimiter) {
        pendingHeredocs.push({
          delimiter: delimiter.delimiter,
          quotedDelimiter: delimiter.quoted,
          stripTabs,
          declarationSpan: { start: i, end: delimiter.next },
          attach: () => {
            return;
          }
        }), i = delimiter.next - 1;
        continue;
      }
    }
    if (source.startsWith("$(", i) && !source.startsWith("$((", i)) {
      depth++, i++;
      continue;
    }
    if (char === "(" && !double)
      depth++;
    if (char === ")" && !double) {
      if (depth--, depth === 0)
        return closing === "))" && source[i + 1] !== ")" ? -1 : i;
    }
  }
  return -1;
}
function findArithmeticEnd(source, start, end) {
  let depth = 1, single = !1, double = !1;
  for (let i = start;i < end; i++) {
    let char = source[i];
    if (char === "\\" && !single) {
      i++;
      continue;
    }
    if (!double && char === "'")
      single = !single;
    if (!single && char === '"')
      double = !double;
    if (single)
      continue;
    if (!double && char === "#" && isCommentStart(source, i, start)) {
      while (i + 1 < end && source[i + 1] !== `
` && source[i + 1] !== "\r")
        i++;
      continue;
    }
    if (source.startsWith("$(", i) && !source.startsWith("$((", i)) {
      depth++, i++;
      continue;
    }
    if (char === "(" && !double)
      depth++;
    if (char !== ")" || double)
      continue;
    if (depth--, depth === 0)
      return source[i + 1] === ")" ? i : -1;
  }
  return -1;
}
function readConnector(source, index) {
  let char = source[index];
  if (char === ";")
    return ";";
  if (char === "&")
    return source[index + 1] === "&" ? "&&" : "&";
  if (char === "|")
    return source[index + 1] === "|" ? "||" : source[index + 1] === "&" ? "|&" : "|";
  return null;
}
function readRedirect(source, index) {
  let char = source[index];
  if (char === ">") {
    if (source[index + 1] === ">")
      return ">>";
    if (source[index + 1] === "&")
      return ">&";
    return source[index + 1] === "|" ? ">|" : ">";
  }
  if (char !== "<")
    return null;
  if (source.startsWith("<<<", index))
    return "<<<";
  if (source.startsWith("<<-", index))
    return "<<-";
  if (source[index + 1] === "<")
    return "<<";
  if (source[index + 1] === "&")
    return "<&";
  if (source[index + 1] === ">")
    return "<>";
  return "<";
}
function isShellWhitespace(char) {
  let code = char.charCodeAt(0);
  if (code === 32 || code >= 9 && code <= 13)
    return !0;
  if (code < 128)
    return !1;
  return /\s/u.test(char);
}
function readVariableEnd(source, start, end) {
  if (source[start + 1] === "{") {
    let close = source.indexOf("}", start + 2);
    return close === -1 || close >= end ? end : close + 1;
  }
  let i = start + 1;
  while (i < end && /[A-Za-z0-9_?@#$!*-]/.test(source[i] ?? ""))
    i++;
  return i === start + 1 ? start + 1 : i;
}
function readAnsiCString(source, start, end) {
  let text = "", issues = [], i = start;
  while (i < end) {
    let char = source[i];
    if (char === "'")
      return { text, next: i + 1, closed: !0, issues };
    if (char !== "\\") {
      text += char ?? "", i++;
      continue;
    }
    let decoded = readAnsiEscape(source, i + 1, end);
    if (text += decoded.text, decoded.invalidCodePoint !== void 0)
      issues.push({
        code: "invalid-ansi-c-code-point",
        message: `ANSI-C escape is not a valid Unicode scalar value: ${decoded.invalidCodePoint}`,
        span: { start: i, end: decoded.next }
      });
    i = decoded.next;
  }
  return { text, next: end, closed: !1, issues };
}
function readAnsiEscape(source, start, end) {
  let char = source[start];
  if (!char || start >= end)
    return { text: "\\", next: start };
  let simple = /* @__PURE__ */ new Map([
    ["a", "\x07"],
    ["b", "\b"],
    ["e", "\x1B"],
    ["E", "\x1B"],
    ["f", "\f"],
    ["n", `
`],
    ["r", "\r"],
    ["t", "\t"],
    ["v", "\v"],
    ["\\", "\\"],
    ["'", "'"],
    ['"', '"']
  ]);
  if (simple.has(char))
    return { text: simple.get(char) ?? char, next: start + 1 };
  if (char === "x")
    return readFixedBaseEscape(source, start + 1, end, 16, 2, start + 1);
  if (char === "u")
    return readFixedBaseEscape(source, start + 1, end, 16, 4, start + 1);
  if (char === "U")
    return readFixedBaseEscape(source, start + 1, end, 16, 8, start + 1);
  if (/[0-7]/.test(char))
    return readFixedBaseEscape(source, start, end, 8, 3, start + 1);
  return { text: char, next: start + 1 };
}
function readFixedBaseEscape(source, start, end, base, maxLength, fallbackNext) {
  let digitPattern = base === 16 ? /[0-9a-fA-F]/ : /[0-7]/, digits = "", i = start;
  while (i < end && digits.length < maxLength && digitPattern.test(source[i] ?? ""))
    digits += source[i], i++;
  if (!digits)
    return { text: source[fallbackNext - 1] ?? "", next: fallbackNext };
  let codePoint = Number.parseInt(digits, base);
  return codePoint > 1114111 || codePoint >= 55296 && codePoint <= 57343 ? { text: "�", next: i, invalidCodePoint: codePoint } : { text: String.fromCodePoint(codePoint), next: i };
}
function getParseStatus(issues, limited = !1) {
  if (limited)
    return "limited";
  if (issues.some((issue) => issue.code === "invalid-ansi-c-code-point" || issue.code === "missing-heredoc-delimiter" || issue.code === "ambiguous-heredoc-delimiter" || issue.code === "unterminated-heredoc" || issue.code === "unsupported-heredoc-context"))
    return "invalid";
  return issues.length > 0 ? "partial" : "complete";
}
function appendVariable(source, start, end, text, provenance) {
  let next = readVariableEnd(source, start, end);
  return {
    text: text + source.slice(start, next),
    provenance: mergeProvenance(provenance, "variable"),
    next
  };
}
function derivePosixWordParts(source, start, end) {
  let collector = createCommandWordParts(source), literalStart = start, single = !1, double = !1, i = start;
  while (i < end) {
    let char = source[i];
    if (char === "\\" && !single) {
      i += 2;
      continue;
    }
    if (!double && char === "'") {
      single = !single, i++;
      continue;
    }
    if (!single && char === '"') {
      double = !double, i++;
      continue;
    }
    if (single) {
      i++;
      continue;
    }
    let arithmetic = source.startsWith("$((", i), command = source.startsWith("$(", i) && !arithmetic, process2 = !double && (source.startsWith("<(", i) || source.startsWith(">(", i)), backtick = char === "`";
    if (arithmetic || command || process2 || backtick) {
      let openLength = arithmetic ? 3 : backtick ? 1 : 2, closing = arithmetic ? "))" : backtick ? "`" : ")", close = findSubstitutionEnd(source, i + openLength, end, closing), next = close === -1 ? end : close + closing.length;
      collector.push(literalStart, i, "literal"), collector.push(i, next, arithmetic ? "arithmetic" : "command-substitution"), i = next, literalStart = next;
      continue;
    }
    if (char === "$") {
      let next = readVariableEnd(source, i, end);
      if (next > i + 1) {
        collector.push(literalStart, i, "literal"), collector.push(i, next, "variable"), i = next, literalStart = next;
        continue;
      }
    }
    if (!double && (char === "*" || char === "?" || char === "[")) {
      collector.push(literalStart, i, "literal"), collector.push(i, i + 1, "glob"), i++, literalStart = i;
      continue;
    }
    i++;
  }
  return collector.push(literalStart, end, "literal"), collector.parts;
}
function mergeProvenance(current, next) {
  if (next === "command-substitution" || current === "command-substitution")
    return "command-substitution";
  if (next === "arithmetic" || current === "arithmetic")
    return "arithmetic";
  if (next === "variable" || current === "variable")
    return "variable";
  if (next === "glob" || current === "glob")
    return "glob";
  return current;
}
function isBraceGroupOpening(source, start, end) {
  return start + 1 >= end || isShellWhitespace(source[start + 1] ?? "") || readConnector(source, start + 1) !== null;
}
var ENV_WRAPPER_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-u",
  "--unset",
  "-C",
  "--chdir",
  "-S",
  "--split-string",
  "-P"
]), SUDO_WRAPPER_OPTIONS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-u",
  "-g",
  "-C",
  "-D",
  "-h",
  "-p",
  "-r",
  "-t",
  "-T",
  "-U"
]);
function isCommandWordPosition(words) {
  let index = 0;
  while (index <= words.length) {
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.text ?? ""))
      index++;
    if (index === words.length)
      return !0;
    let next = getStandardWrapperPrefixEnd(words, index);
    if (next === void 0 || next === null)
      return !1;
    index = next;
  }
  return !1;
}
function getStandardWrapperPrefixEnd(words, start) {
  let wrapper = words[start]?.text.toLowerCase();
  if (wrapper === "command")
    return getCommandPrefixEnd(words, start);
  if (wrapper === "env")
    return getEnvPrefixEnd(words, start);
  if (wrapper === "sudo")
    return getSudoPrefixEnd(words, start);
  return;
}
function getCommandPrefixEnd(words, start) {
  if (words[start + 1]?.text === "-v")
    return null;
  for (let index = start + 1;index < words.length; index++) {
    let token = words[index]?.text ?? "";
    if (token === "--")
      return index + 1;
    if (token === "-p" || token === "-v" || token === "-V" || /^-[pvV]+$/.test(token))
      continue;
    return index;
  }
  return words.length;
}
function getEnvPrefixEnd(words, start) {
  for (let index = start + 1;index < words.length; index++) {
    let token = words[index]?.text ?? "";
    if (token === "--")
      return index + 1;
    if (ENV_WRAPPER_OPTIONS_WITH_VALUE.has(token)) {
      if (words[index + 1] === void 0)
        return null;
      index++;
      continue;
    }
    if (token.startsWith("-u=") || token.startsWith("--unset=") || token.startsWith("-C") && token.length > 2 || token.startsWith("--chdir=") || token.startsWith("-S") && token.length > 2 || token.startsWith("--split-string=") || token.startsWith("-P"))
      continue;
    if (token.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token))
      continue;
    return index;
  }
  return words.length;
}
function getSudoPrefixEnd(words, start) {
  for (let index = start + 1;index < words.length; index++) {
    let token = words[index]?.text ?? "";
    if (token === "--")
      return index + 1;
    if (SUDO_WRAPPER_OPTIONS_WITH_VALUE.has(token)) {
      if (words[index + 1] === void 0)
        return null;
      index++;
      continue;
    }
    if (token.startsWith("-"))
      continue;
    return index;
  }
  return words.length;
}
function expandPosixLiteralBraceWord(word, maxWords, maxExpansions, maxExpandedLength) {
  if (word.provenance !== "literal" || !word.raw.includes("{"))
    return;
  let values = [word.raw], totalLength = word.raw.length, expansions = 0;
  while (!0) {
    let valueIndex = values.findIndex((value2) => findActiveBraceExpansion(value2));
    if (valueIndex === -1)
      break;
    if (++expansions > maxExpansions)
      return { limited: !0 };
    let value = values[valueIndex] ?? "", expansion = findActiveBraceExpansion(value);
    if (!expansion || expansion.kind === "range")
      return { limited: !0 };
    let fixedLength = expansion.start + value.length - expansion.end, replacementsLength = expansion.alternatives.reduce((total, alternative) => total + fixedLength + alternative.length, 0);
    if (totalLength - value.length + replacementsLength > maxExpandedLength || values.length - 1 + expansion.alternatives.length > maxWords)
      return { limited: !0 };
    let replacements = expansion.alternatives.map((alternative) => `${value.slice(0, expansion.start)}${alternative}${value.slice(expansion.end)}`);
    values.splice(valueIndex, 1, ...replacements), totalLength += replacementsLength - value.length;
  }
  if (expansions === 0)
    return;
  let words = values.map((value) => decodePosixLiteralWord(value, maxExpansions));
  if (words.some((value) => value === null))
    return { limited: !0 };
  return {
    words: [...new Set(words.filter((value) => value !== null && value !== ""))]
  };
}
function expandLiteralCommandWord(source, word, maxWords, maxDepth, maxExpandedLength) {
  if (word.provenance !== "literal" || word.quoted || word.raw !== word.text || !word.raw.includes("{"))
    return;
  let values = [word.text], totalLength = word.text.length, expansions = 0;
  while (!0) {
    let valueIndex = values.findIndex((value2) => findBraceExpansion(value2));
    if (valueIndex === -1)
      break;
    if (++expansions > maxDepth)
      return { limitCode: "depth-limit" };
    let value = values[valueIndex] ?? "", expansion = findBraceExpansion(value);
    if (!expansion)
      break;
    let fixedLength = expansion.start + value.length - expansion.end, alternatives = expansion.alternatives.filter((alternative) => fixedLength + alternative.length > 0), replacementsLength = alternatives.reduce((total, alternative) => total + fixedLength + alternative.length, 0);
    if (totalLength - value.length + replacementsLength > maxExpandedLength)
      return { limitCode: "brace-expansion-limit" };
    if (values.length - 1 + alternatives.length > maxWords)
      return { limitCode: "word-limit" };
    let replacements = alternatives.map((alternative) => `${value.slice(0, expansion.start)}${alternative}${value.slice(expansion.end)}`);
    values.splice(valueIndex, 1, ...replacements), totalLength += replacementsLength - value.length;
  }
  let expanded = values.filter((value) => value.length > 0);
  if (expansions === 0)
    return;
  return {
    words: expanded.map((text) => freezeParsedCommandWord(source, word.span.start, word.span.end, text, "literal", !1))
  };
}
function findBraceExpansion(value) {
  let stack = [], selected;
  for (let i = 0;i < value.length; i++) {
    let char = value[i];
    if (char === "{") {
      stack.push({ start: i, commas: [] });
      continue;
    }
    if (char === "," && stack.length > 0) {
      stack.at(-1)?.commas.push(i);
      continue;
    }
    if (char !== "}" || stack.length === 0)
      continue;
    let frame = stack.pop();
    if (!frame || frame.commas.length === 0)
      continue;
    if (!selected || frame.start < selected.start)
      selected = { start: frame.start, end: i + 1, commas: frame.commas };
  }
  if (!selected)
    return;
  let boundaries = [selected.start, ...selected.commas, selected.end - 1];
  return {
    start: selected.start,
    end: selected.end,
    alternatives: boundaries.slice(0, -1).map((start, index) => value.slice(start + 1, boundaries[index + 1]))
  };
}
function findActiveBraceExpansion(value) {
  let stack = [], selected, quote = null, escaped = !1;
  for (let index = 0;index < value.length; index++) {
    let char = value[index];
    if (escaped) {
      escaped = !1;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = !0;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (quote === null && (char === "'" || char === '"')) {
      quote = char;
      continue;
    }
    if (quote !== null)
      continue;
    if (char === "{") {
      stack.push({ start: index, commas: [] });
      continue;
    }
    if (char === "," && stack.length > 0) {
      stack.at(-1)?.commas.push(index);
      continue;
    }
    if (char !== "}" || stack.length === 0)
      continue;
    let frame = stack.pop();
    if (!frame)
      continue;
    let candidate = frame.commas.length > 0 ? {
      kind: "alternatives",
      start: frame.start,
      end: index + 1,
      commas: frame.commas
    } : isActiveBraceRange(value.slice(frame.start + 1, index)) ? { kind: "range", start: frame.start, end: index + 1 } : void 0;
    if (candidate && (!selected || candidate.start < selected.start))
      selected = candidate;
  }
  if (!selected || selected.kind === "range")
    return selected;
  let boundaries = [selected.start, ...selected.commas, selected.end - 1];
  return {
    kind: selected.kind,
    start: selected.start,
    end: selected.end,
    alternatives: boundaries.slice(0, -1).map((start, index) => value.slice(start + 1, boundaries[index + 1]))
  };
}
function isActiveBraceRange(value) {
  return /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(value) || /^[A-Za-z]\.\.[A-Za-z](?:\.\.-?\d+)?$/.test(value);
}
function decodePosixLiteralWord(value, maxDepth) {
  let source = `x${value}`, result = readWord(source, 0, source.length, "posix", { maxInputLength: source.length, maxWords: 1, maxDepth }, { used: 0, max: 1 }, 0);
  if (result.limited || result.issues.length > 0 || result.next !== source.length || result.word.provenance !== "literal")
    return null;
  return result.word.text.slice(1);
}
function limitedProgram(source, start, end, dialect, code) {
  return freezeCommandProgram({
    kind: "program",
    dialect,
    source: source.slice(start, end),
    span: { start, end },
    status: "limited",
    issues: [{ code, message: "command structure exceeds parser limit", span: { start, end } }],
    nodes: []
  });
}
function limitedResult(nodes, issues, next, code, limit) {
  return {
    nodes,
    issues: [
      ...issues,
      {
        code,
        message: `command structure exceeds parser limit ${limit}`,
        span: { start: next, end: next }
      }
    ],
    next,
    closed: !1,
    limited: !0,
    pendingHeredocs: []
  };
}
function propagatedLimitResult(nodes, issues, next) {
  return { nodes, issues, next, closed: !1, limited: !0, pendingHeredocs: [] };
}
function consumeWord(budget) {
  return budget.used++, budget.used <= budget.max;
}
function containsHeredoc(nodes) {
  return nodes.some((node) => {
    if (node.kind === "command")
      return node.redirections.some((redirection) => redirection.heredoc) || node.nested.some((program) => containsHeredoc(program.nodes));
    return node.kind === "group" && containsHeredoc(node.body.nodes);
  });
}
function unterminatedHeredocIssues(pending) {
  return pending.map((declaration) => ({
    code: "unterminated-heredoc",
    message: `heredoc delimiter ${declaration.delimiter} was not found`,
    span: declaration.declarationSpan
  }));
}
function isExecutableNode(node) {
  return node?.kind === "command" || node?.kind === "group";
}
function appendMissingCommandIssue(nodes, issues) {
  let trailing = nodes.at(-1);
  if (trailing?.kind !== "connector" || !CONTINUATION_CONNECTORS.has(trailing.operator))
    return;
  issues.push({
    code: "missing-command-after-connector",
    message: `connector ${trailing.operator} requires a following command`,
    span: trailing.span
  });
}
function appendMissingConnectorIssue(nodes, issues, start) {
  if (!isExecutableNode(nodes.at(-1)))
    return;
  issues.push({
    code: "missing-command-connector",
    message: "adjacent commands require a connector",
    span: { start, end: start + 1 }
  });
}
function isCommentStart(source, index, start) {
  return index === start || /[\s;&|()]/u.test(source[index - 1] ?? "");
}

// src/parser/powershell.ts
var AUTO_POWERSHELL_HEADS = /* @__PURE__ */ new Set(["remove-item", "ri", "del", "erase", "rd", "rmdir"]), AUTO_POWERSHELL_PARAMETERS = ["-rec", "-for", "-path", "-literalpath", "-whatif"], SELECTOR_LIMITS = { maxInputLength: 131072, maxWords: 16384, maxDepth: 64 };
function shouldUsePowerShellParser(source) {
  let candidate = source.toLowerCase().replaceAll("`", "");
  if (![...AUTO_POWERSHELL_HEADS].some((head) => candidate.includes(head)) && !(candidate.includes("rm") && AUTO_POWERSHELL_PARAMETERS.some((word) => candidate.includes(word))) && !candidate.includes("<#"))
    return !1;
  let selector = scanSelectorCommands(source);
  return selector.invalidComment || selector.commands.some(isPowerShellSelectorCommand);
}
function isPowerShellSelectorCommand(words) {
  let headIndex = words[0] === "&" || words[0] === "." ? 1 : 0, head = words[headIndex]?.toLowerCase();
  if (head && AUTO_POWERSHELL_HEADS.has(head))
    return !0;
  if (head !== "rm")
    return !1;
  return words.slice(headIndex + 1).some((word) => {
    let parameter = word.toLowerCase().split(":", 1)[0] ?? "";
    return AUTO_POWERSHELL_PARAMETERS.some((prefix) => parameter.startsWith(prefix));
  });
}
function parsePowerShellCommand(source, limits) {
  let span = { start: 0, end: source.length };
  if (source.length > limits.maxInputLength)
    return freezeCommandProgram({
      kind: "program",
      dialect: "powershell",
      source,
      span,
      status: "limited",
      issues: [
        {
          code: "input-limit",
          message: `command exceeds ${limits.maxInputLength} UTF-16 code units`,
          span
        }
      ],
      nodes: []
    });
  let result = scanPowerShellSequence(source, 0, source.length, limits, 0);
  return freezeCommandProgram({
    kind: "program",
    dialect: "powershell",
    source,
    span,
    status: getPowerShellParseStatus(result.issues, result.limited),
    issues: result.issues,
    nodes: result.nodes
  });
}
function scanPowerShellSequence(source, start, end, limits, depth, closingBrace = !1) {
  let nodes = createCommandNodes(), issues = createCommandIssues(), accumulator = createCommandAccumulator(), wordCount = 0, limited = !1, flush = () => {
    if (accumulator.words.length === 0 && accumulator.redirections.length === 0)
      return;
    let commandSpan = { start: accumulator.start, end: accumulator.end }, tokens = accumulator.words.map((word) => word.text);
    appendAccumulatedCommand(nodes, accumulator, {
      kind: "command",
      dialect: "powershell",
      source: source.slice(commandSpan.start, commandSpan.end),
      span: commandSpan,
      words: accumulator.words,
      tokens,
      analysisTokens: [...tokens],
      redirections: accumulator.redirections,
      nested: accumulator.nested,
      dynamicExecutable: accumulator.words[0]?.provenance !== "literal",
      legacyNormalized: tokens.join(" ")
    });
  }, i = start;
  while (i < end) {
    let char = source[i];
    if (!char)
      break;
    if (closingBrace && char === "}")
      return flush(), { nodes, issues, next: i + 1, closed: !0, words: wordCount, limited };
    let comment = readPowerShellComment(source, i, end, limits.maxDepth);
    if (comment) {
      if (comment.issue)
        issues.push(comment.issue);
      if (comment.limited)
        return flush(), {
          nodes,
          issues,
          next: comment.next,
          closed: !1,
          words: wordCount,
          limited: !0
        };
      i = comment.next;
      continue;
    }
    if (/\s/.test(char)) {
      if (char === "\r" || char === `
`) {
        flush();
        let next = char === "\r" && source[i + 1] === `
` ? i + 2 : i + 1;
        nodes.push(connector(source, i, next)), i = next;
        continue;
      }
      i++;
      continue;
    }
    let operator = readOperator(source, i);
    if (operator) {
      flush(), nodes.push(connector(source, i, i + operator.length)), i += operator.length;
      continue;
    }
    if (char === "{") {
      if (flush(), depth >= limits.maxDepth)
        return issues.push(depthLimitIssue(i, limits.maxDepth)), { nodes, issues, next: end, closed: !1, words: wordCount, limited: !0 };
      let inner = scanPowerShellSequence(source, i + 1, end, limits, depth + 1, !0), bodyEnd = inner.closed ? inner.next - 1 : inner.next, body = freezeCommandProgram({
        kind: "program",
        dialect: "powershell",
        source: source.slice(i + 1, bodyEnd),
        span: { start: i + 1, end: bodyEnd },
        status: inner.limited ? "limited" : inner.issues.length > 0 ? "partial" : "complete",
        issues: inner.issues,
        nodes: inner.nodes
      });
      if (nodes.push(Object.freeze({
        kind: "group",
        style: "brace",
        span: Object.freeze({ start: i, end: inner.next }),
        body
      })), issues.push(...inner.issues), !inner.closed)
        issues.push({
          code: "unclosed-script-block",
          message: "PowerShell script block is not closed",
          span: { start: i, end: inner.next }
        });
      wordCount += inner.words, limited ||= inner.limited, i = inner.next;
      continue;
    }
    if (char === "}") {
      flush(), nodes.push(connector(source, i, i + 1)), i++;
      continue;
    }
    if (char === ">" || char === "<") {
      accumulator.start = accumulator.start === -1 ? i : accumulator.start;
      let operatorEnd = source[i + 1] === char ? i + 2 : i + 1, targetStart = operatorEnd;
      while (/[ \t]/.test(source[targetStart] ?? ""))
        targetStart++;
      let target = targetStart < end ? readPowerShellWord(source, targetStart, end, limits, depth) : void 0, redirectEnd = target?.next ?? operatorEnd;
      if (accumulator.redirections.push(Object.freeze({
        kind: "redirection",
        operator: source.slice(i, operatorEnd),
        span: Object.freeze({ start: i, end: redirectEnd }),
        ...target ? { target: target.word } : {}
      })), target)
        issues.push(...target.issues), accumulator.nested.push(...target.nested), wordCount += target.words, limited ||= target.limited;
      accumulator.end = redirectEnd, i = redirectEnd;
      continue;
    }
    if (char === ",") {
      accumulator.start = accumulator.start === -1 ? i : accumulator.start, accumulator.words.push(freezeCommandWord({
        text: ",",
        raw: ",",
        span: { start: i, end: i + 1 },
        provenance: "literal",
        quoted: !1
      })), accumulator.end = ++i;
      continue;
    }
    let result = readPowerShellWord(source, i, end, limits, depth);
    if (accumulator.start = accumulator.start === -1 ? i : accumulator.start, accumulator.end = result.next, accumulator.words.push(result.word), issues.push(...result.issues), accumulator.nested.push(...result.nested), wordCount += 1 + result.words, limited ||= result.limited, wordCount > limits.maxWords)
      return issues.push({
        code: "word-limit",
        message: `command exceeds ${limits.maxWords} words`,
        span: { start: i, end: result.next }
      }), flush(), { nodes, issues, next: result.next, closed: !1, words: wordCount, limited: !0 };
    i = result.next > i ? result.next : i + 1;
  }
  return flush(), { nodes, issues, next: i, closed: !closingBrace, words: wordCount, limited };
}
function readPowerShellWord(source, start, end, limits, depth) {
  let text = "", provenance = "literal", quoted = !1, issues = [], nested = [], nestedWords = 0, limited = !1, consumeSubexpression = (offset) => {
    let subexpression = readPowerShellSubexpression(source, offset, end, limits, depth);
    return text += source.slice(offset, subexpression.next), nested.push(subexpression.program), issues.push(...subexpression.program.issues), nestedWords += countProgramWords(subexpression.program), limited ||= subexpression.program.status === "limited", provenance = "command-substitution", subexpression.next;
  }, i = start;
  while (i < end) {
    let char = source[i];
    if (!char || /\s/.test(char) || readOperator(source, i) || char === ">" || char === "<" || char === "#")
      break;
    if (char === ",")
      break;
    if (char === "`") {
      let next = source[i + 1];
      if (!next) {
        issues.push({
          code: "trailing-escape",
          message: "PowerShell escape has no following character",
          span: { start: i, end: i + 1 }
        }), i++;
        break;
      }
      text += next, i += 2;
      continue;
    }
    if (source.startsWith("$(", i)) {
      i = consumeSubexpression(i);
      continue;
    }
    if (char === "'") {
      quoted = !0, i++;
      let closed = !1;
      while (i < source.length) {
        if (source[i] === "'" && source[i + 1] === "'") {
          text += "'", i += 2;
          continue;
        }
        if (source[i] === "'") {
          closed = !0, i++;
          break;
        }
        text += source[i] ?? "", i++;
      }
      if (!closed)
        issues.push({
          code: "unclosed-single-quote",
          message: "single-quoted word is not closed",
          span: { start, end: source.length }
        });
      continue;
    }
    if (char === '"') {
      quoted = !0;
      let quoteStart = i++, closed = !1;
      while (i < end) {
        let inner = source[i];
        if (inner === "`" && source[i + 1]) {
          text += source[i + 1], i += 2;
          continue;
        }
        if (inner === '"') {
          closed = !0, i++;
          break;
        }
        if (source.startsWith("$(", i)) {
          i = consumeSubexpression(i);
          continue;
        }
        if (inner === "$")
          provenance = source[i + 1] === "(" ? "command-substitution" : "variable";
        text += inner ?? "", i++;
      }
      if (!closed)
        issues.push({
          code: "unclosed-double-quote",
          message: "double-quoted word is not closed",
          span: { start: quoteStart, end: source.length }
        });
      continue;
    }
    if (char === "$")
      provenance = source[i + 1] === "(" ? "command-substitution" : "variable";
    if (char === "@" && i === start)
      provenance = "variable";
    text += char, i++;
  }
  return {
    word: freezeParsedCommandWord(source, start, i, text, provenance, quoted, provenance === "literal" ? void 0 : derivePowerShellWordParts(source, start, i)),
    next: i,
    issues,
    nested,
    words: nestedWords,
    limited
  };
}
function readPowerShellSubexpression(source, start, end, limits, depth) {
  let close = findPowerShellSubexpressionEnd(source, start + 2, end), innerEnd = close === -1 ? end : close, next = close === -1 ? end : close + 1;
  if (depth >= limits.maxDepth)
    return {
      program: freezeCommandProgram({
        kind: "program",
        dialect: "powershell",
        source: source.slice(start + 2, innerEnd),
        span: { start: start + 2, end: innerEnd },
        status: "limited",
        issues: [depthLimitIssue(start, limits.maxDepth)],
        nodes: []
      }),
      next
    };
  let inner = scanPowerShellSequence(source, start + 2, innerEnd, limits, depth + 1), unclosedIssue = close === -1 ? [
    {
      code: "unclosed-command-subexpression",
      message: "PowerShell command subexpression is not closed",
      span: { start, end: next }
    }
  ] : [];
  return {
    program: freezeCommandProgram({
      kind: "program",
      dialect: "powershell",
      source: source.slice(start + 2, innerEnd),
      span: { start: start + 2, end: innerEnd },
      status: inner.limited ? "limited" : inner.issues.length + unclosedIssue.length > 0 ? "partial" : "complete",
      issues: [...inner.issues, ...unclosedIssue],
      nodes: inner.nodes
    }),
    next
  };
}
function findPowerShellSubexpressionEnd(source, start, end) {
  let depth = 1, single = !1, double = !1;
  for (let i = start;i < end; i++) {
    let char = source[i];
    if (char === "`") {
      i++;
      continue;
    }
    if (!double && char === "'") {
      if (single && source[i + 1] === "'") {
        i++;
        continue;
      }
      single = !single;
      continue;
    }
    if (!single && char === '"') {
      double = !double;
      continue;
    }
    if (single)
      continue;
    if (source.startsWith("$(", i)) {
      depth++, i++;
      continue;
    }
    if (!double && char === "(")
      depth++;
    if (char !== ")")
      continue;
    if (depth--, depth === 0)
      return i;
  }
  return -1;
}
function countProgramWords(program) {
  let count = 0;
  for (let node of program.nodes) {
    if (node.kind === "group")
      count += countProgramWords(node.body);
    if (node.kind === "command") {
      count += node.words.length;
      for (let nested of node.nested)
        count += countProgramWords(nested);
    }
  }
  return count;
}
function derivePowerShellWordParts(source, start, end) {
  let collector = createCommandWordParts(source), literalStart = start, single = !1, i = start;
  while (i < end) {
    let char = source[i];
    if (char === "`") {
      i += 2;
      continue;
    }
    if (char === "'") {
      if (single && source[i + 1] === "'") {
        i += 2;
        continue;
      }
      single = !single, i++;
      continue;
    }
    if (single) {
      i++;
      continue;
    }
    if (source.startsWith("$(", i)) {
      let close = findPowerShellSubexpressionEnd(source, i + 2, end), next = close === -1 ? end : close + 1;
      collector.push(literalStart, i, "literal"), collector.push(i, next, "command-substitution"), i = next, literalStart = next;
      continue;
    }
    if (char === "$" || char === "@" && i === start) {
      let next = i + 1;
      if (source[next] === "{") {
        let close = source.indexOf("}", next + 1);
        next = close === -1 || close >= end ? end : close + 1;
      } else
        while (next < end && /[A-Za-z0-9_:?]/.test(source[next] ?? ""))
          next++;
      collector.push(literalStart, i, "literal"), collector.push(i, next, "variable"), i = next, literalStart = next;
      continue;
    }
    i++;
  }
  return collector.push(literalStart, end, "literal"), collector.parts;
}
function depthLimitIssue(start, limit) {
  return {
    code: "depth-limit",
    message: `command structure exceeds parser limit ${limit}`,
    span: { start, end: start }
  };
}
function scanSelectorCommands(source) {
  let commands = [], words = [], i = 0, wordCount = 0, invalidComment = !1, flush = () => {
    if (words.length > 0)
      commands.push(words);
    words = [];
  };
  while (i < source.length && i < 131072 && wordCount < 16384) {
    let char = source[i];
    if (char === "\r" || char === `
`) {
      flush(), i += char === "\r" && source[i + 1] === `
` ? 2 : 1;
      continue;
    }
    if (/\s/.test(char ?? "")) {
      i++;
      continue;
    }
    let comment = readPowerShellComment(source, i, Math.min(source.length, SELECTOR_LIMITS.maxInputLength), SELECTOR_LIMITS.maxDepth);
    if (comment) {
      invalidComment ||= !!comment.issue || comment.limited, i = comment.next;
      continue;
    }
    let operator = readOperator(source, i);
    if (operator) {
      flush(), i += operator.length;
      continue;
    }
    if (char === "{" || char === "}") {
      flush(), i++;
      continue;
    }
    let result = readPowerShellWord(source, i, Math.min(source.length, SELECTOR_LIMITS.maxInputLength), SELECTOR_LIMITS, 0);
    if (result.word.text)
      words.push(result.word.text);
    for (let nested of result.nested)
      commands.push(...selectorCommandsFromProgram(nested));
    wordCount++, i = result.next > i ? result.next : i + 1;
  }
  return flush(), { commands, invalidComment };
}
function selectorCommandsFromProgram(program) {
  return program.nodes.flatMap((node) => {
    if (node.kind === "group")
      return selectorCommandsFromProgram(node.body);
    if (node.kind !== "command")
      return [];
    return [
      node.words.map((word) => word.text),
      ...node.nested.flatMap(selectorCommandsFromProgram)
    ];
  });
}
function readOperator(source, index) {
  for (let operator of ["&&", "||", ";", "|"])
    if (source.startsWith(operator, index))
      return operator;
  return null;
}
function readPowerShellComment(source, start, end, maxDepth) {
  if (source[start] === "#" && source[start + 1] !== ">") {
    let next = start + 1;
    while (next < end && source[next] !== "\r" && source[next] !== `
`)
      next++;
    return { next, limited: !1 };
  }
  if (!source.startsWith("<#", start))
    return null;
  let depth = 1, i = start + 2;
  while (i < end) {
    if (source.startsWith("<#", i)) {
      if (depth++, depth > maxDepth)
        return {
          next: end,
          issue: {
            code: "comment-depth-limit",
            message: `PowerShell block comment exceeds nesting limit ${maxDepth}`,
            span: { start, end: i + 2 }
          },
          limited: !0
        };
      i += 2;
      continue;
    }
    if (source.startsWith("#>", i)) {
      if (depth--, i += 2, depth === 0)
        return { next: i, limited: !1 };
      continue;
    }
    i++;
  }
  return {
    next: end,
    issue: {
      code: "unclosed-block-comment",
      message: "PowerShell block comment is not closed",
      span: { start, end }
    },
    limited: !1
  };
}
function getPowerShellParseStatus(issues, limited) {
  if (limited)
    return "limited";
  if (issues.some((issue) => issue.code === "unclosed-block-comment"))
    return "invalid";
  return issues.length > 0 ? "partial" : "complete";
}
function connector(source, start, end) {
  return Object.freeze({
    kind: "connector",
    operator: source.slice(start, end),
    span: Object.freeze({ start, end })
  });
}

// src/parser/command.ts
var DEFAULT_COMMAND_PARSER_LIMITS = Object.freeze({
  maxInputLength: 131072,
  maxWords: 16384,
  maxDepth: 64
});
function parseCommand(source, dialect = "auto", limits = DEFAULT_COMMAND_PARSER_LIMITS) {
  if (dialect === "powershell" || dialect === "auto" && shouldUsePowerShellParser(source.slice(0, limits.maxInputLength)))
    return parsePowerShellCommand(source, limits);
  return parsePosixCommand(source, "posix", limits);
}

// src/core/semantic-facts.ts
var PATH_LIKE_KEYS = /* @__PURE__ */ new Set([
  "absolutepath",
  "directorypath",
  "directory_path",
  "file",
  "file_path",
  "filepath",
  "include",
  "notebook_path",
  "path",
  "searchdirectory",
  "search_directory",
  "searchpath",
  "targetfile",
  "target_file"
]), GREP_KEYS = /* @__PURE__ */ new Set([...PATH_LIKE_KEYS, "glob"]), GLOB_KEYS = /* @__PURE__ */ new Set([...GREP_KEYS, "pattern"]), REDIRECTS = /* @__PURE__ */ new Set([">", ">>", "<", "<<", "<<<", "<>", ">&", "<&", "&>", "&>>"]), LEGACY_BOUNDARIES = /* @__PURE__ */ new Set(["&&", "||", "|&", "|", "&", ";"]), EMPTY_SHELL_SYNTAX_ENTRIES = Object.freeze([]), NEUTRAL_ENV_PROXY = new Proxy({}, { get: (_, name) => ["$", "{", String(name), "}"].join("") }), DEFAULT_PARSERS = {
  parseCommand,
  parseShell: (source, environment) => $parse(source.replace(/\n/g, " ; "), environment)
};

class StructuralShellSyntaxLimitError extends Error {
  name = "StructuralShellSyntaxLimitError";
  constructor() {
    super("Structural command analysis limit exceeded.");
  }
}
function createSemanticFacts(invocation, parserDependencies = {}) {
  let store = createSemanticFactStore({ ...DEFAULT_PARSERS, ...parserDependencies }), inputCommand = getCommandFromToolInput(invocation.input), candidates = [];
  if ((invocation.route.kind === "command" || invocation.route.kind === "unknown") && inputCommand)
    candidates.push({ usage: "input-candidate", source: inputCommand });
  if (invocation.route.kind === "command" && "command" in invocation && invocation.command)
    candidates.push({ usage: "declared-command", source: invocation.command });
  let commands = candidates.reduce((facts, candidate) => {
    let existingIndex = facts.findIndex((fact) => fact.source === candidate.source);
    if (existingIndex !== -1) {
      let existing = facts[existingIndex];
      if (!existing)
        return facts;
      return facts[existingIndex] = freezeCommandFact({
        ...existing,
        usages: [...existing.usages, candidate.usage]
      }), facts;
    }
    let dialect = invocation.route.kind === "command" ? invocation.route.shell : "posix", program = store.getCommandProgram(candidate.source, dialect);
    return facts.push(freezeCommandFact({
      usages: [candidate.usage],
      source: candidate.source,
      program,
      views: projectAnalysisOrder(program),
      uncertainties: program.issues,
      shell: store.getShellSyntax(candidate.source, program)
    })), facts;
  }, []);
  return Object.freeze({
    invocation: Object.freeze({
      toolName: invocation.toolName,
      route: Object.freeze({ ...invocation.route }),
      context: Object.freeze({
        ...invocation.context,
        ...invocation.context.policyConfigCwds ? { policyConfigCwds: Object.freeze([...invocation.context.policyConfigCwds]) } : {}
      })
    }),
    commands: Object.freeze(commands),
    paths: Object.freeze(extractDirectPathFacts(invocation)),
    store
  });
}
function getCommandSyntaxFact(facts, usage) {
  return facts.commands.find((fact) => fact.usages.includes(usage));
}
function projectSensitiveShellText(source) {
  return expandSupportedPathEnvironmentVariables(source);
}
function createSemanticFactStore(parserDependencies = {}) {
  let parsers = { ...DEFAULT_PARSERS, ...parserDependencies }, shellFacts = /* @__PURE__ */ new Map, commandPrograms = /* @__PURE__ */ new Map, structuralLimitFacts = /* @__PURE__ */ new WeakMap, getCommandProgram = (source, dialect) => {
    let key = `${dialect}\x00${source}`, existing = commandPrograms.get(key);
    if (existing)
      return existing;
    let program = parsers.parseCommand(source, dialect);
    return commandPrograms.set(key, program), program;
  };
  return Object.freeze({
    getShellSyntax: (source, suppliedProgram) => {
      if (suppliedProgram && suppliedProgram.source !== source)
        throw TypeError("Shell syntax source does not match command program source.");
      let program = suppliedProgram ?? getCommandProgram(source, "posix");
      if (program.status === "limited") {
        let existing2 = structuralLimitFacts.get(program);
        if (existing2)
          return existing2;
        let syntax2 = Object.freeze({
          status: "structural-limit",
          source,
          entries: EMPTY_SHELL_SYNTAX_ENTRIES
        });
        return structuralLimitFacts.set(program, syntax2), syntax2;
      }
      let existing = shellFacts.get(source);
      if (existing)
        return existing;
      let syntax = parseShellSyntax(source, parsers.parseShell);
      return shellFacts.set(source, syntax), syntax;
    },
    getCommandProgram
  });
}
function freezeCommandFact(fact) {
  return Object.freeze({
    ...fact,
    usages: Object.freeze([...fact.usages]),
    views: Object.freeze([...fact.views]),
    uncertainties: Object.freeze([...fact.uncertainties])
  });
}
function projectAnalysisOrder(program) {
  return Object.freeze(program.nodes.flatMap((node) => {
    if (node.kind === "group")
      return [...projectAnalysisOrder(node.body)];
    if (node.kind !== "command")
      return [];
    return [...node.nested.flatMap((nested) => [...projectAnalysisOrder(nested)]), node];
  }));
}
function parseShellSyntax(source, parseShell) {
  if (hasUnclosedQuotes(source))
    return Object.freeze({
      status: "unclosed-quote",
      source,
      entries: Object.freeze([])
    });
  try {
    let parsed = parseShell(source, NEUTRAL_ENV_PROXY), entries = [];
    for (let index = 0;index < parsed.length; index++) {
      let token = parsed[index], operator = getOperator(token);
      if (operator === "<" && getOperator(parsed[index + 1]) === "<") {
        let targetIndex = index + 2, target = getCommandTokenText(parsed[targetIndex]);
        entries.push(Object.freeze({
          kind: "redirection",
          operator: "<<",
          role: "here-data",
          targetOrder: "legacy-segment",
          ...target === null ? {} : { target }
        })), index = target === null ? index + 1 : targetIndex;
        continue;
      }
      if (operator && REDIRECTS.has(operator)) {
        let pipeAdjusted = operator === ">" && getOperator(parsed[index + 1]) === "|", targetIndex = index + (pipeAdjusted ? 2 : 1), target = getCommandTokenText(parsed[targetIndex]);
        if (entries.push(Object.freeze({
          kind: "redirection",
          operator: pipeAdjusted ? ">|" : operator,
          role: getRedirectionRole(pipeAdjusted ? ">|" : operator),
          targetOrder: pipeAdjusted || operator === "<<" || operator === "<<<" ? "legacy-segment" : "immediate",
          ...target === null ? {} : { target }
        })), target !== null || operator !== "<<" && operator !== "<<<")
          index = targetIndex;
        continue;
      }
      if (operator) {
        entries.push(Object.freeze({
          kind: "operator",
          operator,
          boundary: LEGACY_BOUNDARIES.has(operator)
        }));
        continue;
      }
      let text = getCommandTokenText(token);
      if (text !== null)
        entries.push(Object.freeze({ kind: "word", text }));
    }
    return Object.freeze({ status: "complete", source, entries: Object.freeze(entries) });
  } catch {
    return Object.freeze({ status: "invalid", source, entries: Object.freeze([]) });
  }
}
function getRedirectionRole(operator) {
  if (operator === "<<" || operator === "<<<")
    return "here-data";
  if (operator === "<" || operator === "<&")
    return "file-read";
  return "file-write";
}
function extractDirectPathFacts(invocation) {
  let keys = invocation.route.kind === "grep" ? GREP_KEYS : invocation.route.kind === "glob" ? GLOB_KEYS : PATH_LIKE_KEYS, access = invocation.route.kind === "grep" || invocation.route.kind === "glob" ? "read" : invocation.route.kind === "patch" ? "write" : "unknown";
  return [
    ...extractPathLikeToolValues(invocation.input, keys).map((raw) => Object.freeze({ raw, role: "tool-path", access })),
    ...invocation.route.kind === "patch" ? extractPatchTargetsFromToolInput(invocation.input).map((raw) => Object.freeze({ raw, role: "patch-target", access: "write" })) : []
  ];
}
function getOperator(token) {
  return typeof token === "object" && token !== null && "op" in token ? token.op : null;
}

// src/config/policy-metadata.ts
var metadata = /* @__PURE__ */ new WeakMap;
function registerPolicyRuleMetadata(snapshot, rules) {
  return metadata.set(snapshot, new Map(rules)), snapshot;
}
function getPolicyRuleMetadata(snapshot, id) {
  return id ? metadata.get(snapshot)?.get(id) : void 0;
}

// src/core/policy.ts
import { chmodSync, existsSync as existsSync2, mkdirSync as mkdirSync3, readFileSync as readFileSync4 } from "node:fs";
import { dirname as dirname6, join as join7 } from "node:path";

// src/config/schema.ts
import { createRequire } from "node:module";

// src/core/analyze/text-scanner.ts
function scannedText(value, work) {
  return { value, work };
}
function scanChar(text, index) {
  if (text.work)
    text.work.units = Math.min(Number.MAX_SAFE_INTEGER, text.work.units + 1);
  return text.value[index];
}
function scanLength(text) {
  return text.value.length;
}
function chargeScan(work, text, passes = 1) {
  if (work)
    work.units = Math.min(Number.MAX_SAFE_INTEGER, work.units + text.length * passes);
}
function chargeNativeLinearPass(work, text) {
  chargeScan(work, text);
}
function isAsciiWord(char) {
  if (!char)
    return !1;
  let code = char.charCodeAt(0);
  return code >= 48 && code <= 57 || code >= 65 && code <= 90 || code === 95 || code >= 97 && code <= 122;
}
function isEcmaWhitespace(char) {
  if (!char)
    return !1;
  let code = char.charCodeAt(0);
  return code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32 || code === 160 || code === 65279 || code === 5760 || code >= 8192 && code <= 8202 || code === 8232 || code === 8233 || code === 8239 || code === 8287 || code === 12288;
}
function isJsLineTerminator(char) {
  return char === `
` || char === "\r" || char === "\u2028" || char === "\u2029";
}
function fixedAt(text, index, expected) {
  if (index + expected.length > scanLength(text))
    return !1;
  for (let offset = 0;offset < expected.length; offset++)
    if (scanChar(text, index + offset) !== expected[offset])
      return !1;
  return !0;
}
function wordAt(text, index, word) {
  return !isAsciiWord(scanChar(text, index - 1)) && fixedAt(text, index, word) && !isAsciiWord(scanChar(text, index + word.length));
}
function hasWordBoundaryAfter(text, end) {
  return isAsciiWord(scanChar(text, end - 1)) !== isAsciiWord(scanChar(text, end));
}
function isRawStop(char) {
  return char === `
` || char === ";" || char === "&" || char === "|";
}
function isPipeSemicolonStop(char) {
  return char === "|" || char === ";";
}

// src/core/destructive-command-rules.ts
var DESTRUCTIVE_COMMAND_RULE_IDS = [
  "git.ssh-env",
  "git.alias-config",
  "git.executable-config",
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
  "shell.dynamic-structure",
  "shell.dynamic-executable",
  "raw-text.dangerous-command"
], DESTRUCTIVE_COMMAND_RULE_ID_SET = new Set(DESTRUCTIVE_COMMAND_RULE_IDS), DESTRUCTIVE_COMMAND_RULE_METADATA = [
  {
    id: "git.ssh-env",
    category: "Git",
    label: "Git SSH environment override",
    description: "Blocks Git network operations with SSH environment overrides.",
    example: 'GIT_SSH_COMMAND="./ssh-wrapper" git push',
    intent: "manual_only"
  },
  {
    id: "git.alias-config",
    category: "Git",
    label: "Git command-line alias",
    description: "Blocks command-line Git aliases that cannot be safely resolved.",
    example: "git -c alias.wipe='!rm -rf /' wipe",
    intent: "manual_only"
  },
  {
    id: "git.executable-config",
    category: "Git",
    label: "Git executable config",
    description: "Blocks Git operations that may invoke an executable configured by Git.",
    example: "git -c core.editor=/tmp/editor commit",
    intent: "manual_only"
  },
  {
    id: "git.checkout-force",
    category: "Git",
    label: "Git checkout force",
    description: "Blocks forced checkout operations that discard local changes.",
    example: "git checkout --force main",
    intent: "use_alternative"
  },
  {
    id: "git.checkout-double-dash",
    category: "Git",
    label: "Git checkout path restore",
    description: "Blocks checkout path restores after --.",
    example: "git checkout -- src/app.ts",
    intent: "use_alternative"
  },
  {
    id: "git.checkout-ref-path",
    category: "Git",
    label: "Git checkout ref and path",
    description: "Blocks checkout forms that mix a ref and path restore.",
    example: "git checkout HEAD -- src/app.ts",
    intent: "use_alternative"
  },
  {
    id: "git.checkout-pathspec-from-file",
    category: "Git",
    label: "Git checkout pathspec file",
    description: "Blocks checkout pathspec loading from a file.",
    example: "git checkout --pathspec-from-file=paths.txt",
    intent: "use_alternative"
  },
  {
    id: "git.checkout-ambiguous",
    category: "Git",
    label: "Git checkout ambiguous targets",
    description: "Blocks ambiguous checkout arguments that may restore paths.",
    example: "git checkout main src/app.ts",
    intent: "use_alternative"
  },
  {
    id: "git.switch-discard-changes",
    category: "Git",
    label: "Git switch discard changes",
    description: "Blocks branch switches that explicitly discard local changes.",
    example: "git switch --discard-changes main",
    intent: "use_alternative"
  },
  {
    id: "git.switch-force",
    category: "Git",
    label: "Git switch force",
    description: "Blocks forced branch switches.",
    example: "git switch --force main",
    intent: "use_alternative"
  },
  {
    id: "git.restore-worktree",
    category: "Git",
    label: "Git restore worktree",
    description: "Blocks worktree restore operations.",
    example: "git restore --worktree src/app.ts",
    intent: "use_alternative"
  },
  {
    id: "git.restore-unstaged",
    category: "Git",
    label: "Git restore unstaged",
    description: "Blocks unstaged restore operations.",
    example: "git restore src/app.ts",
    intent: "use_alternative"
  },
  {
    id: "git.reset-hard",
    category: "Git",
    label: "Git reset hard",
    description: "Blocks hard resets.",
    example: "git reset --hard",
    intent: "use_alternative"
  },
  {
    id: "git.reset-merge",
    category: "Git",
    label: "Git reset merge",
    description: "Blocks merge resets.",
    example: "git reset --merge",
    intent: "use_alternative"
  },
  {
    id: "git.clean-force",
    category: "Git",
    label: "Git clean force",
    description: "Blocks forced clean operations.",
    example: "git clean -fd",
    intent: "use_alternative"
  },
  {
    id: "git.push-force",
    category: "Git",
    label: "Git push force",
    description: "Blocks force pushes.",
    example: "git push --force origin main",
    intent: "use_alternative"
  },
  {
    id: "git.push-delete",
    category: "Git",
    label: "Git push delete",
    description: "Blocks remote ref deletion through push.",
    example: "git push --delete origin old-branch",
    intent: "manual_only"
  },
  {
    id: "git.push-mirror",
    category: "Git",
    label: "Git push mirror",
    description: "Blocks mirror pushes that can force-update or delete remote refs.",
    example: "git push --mirror origin",
    intent: "manual_only"
  },
  {
    id: "git.branch-force-delete",
    category: "Git",
    label: "Git branch force delete",
    description: "Blocks forced branch deletion.",
    example: "git branch -D old-branch",
    intent: "use_alternative"
  },
  {
    id: "git.rebase-abort",
    category: "Git",
    label: "Git rebase abort",
    description: "Blocks rebase abort operations.",
    example: "git rebase --abort",
    intent: "use_alternative"
  },
  {
    id: "git.merge-abort",
    category: "Git",
    label: "Git merge abort",
    description: "Blocks merge abort operations.",
    example: "git merge --abort",
    intent: "use_alternative"
  },
  {
    id: "git.tag-delete",
    category: "Git",
    label: "Git tag delete",
    description: "Blocks tag deletion.",
    example: "git tag --delete v1.0.0",
    intent: "manual_only"
  },
  {
    id: "git.reflog-delete",
    category: "Git",
    label: "Git reflog delete",
    description: "Blocks reflog deletion.",
    example: "git reflog delete HEAD@{1}",
    intent: "manual_only"
  },
  {
    id: "git.stash-drop",
    category: "Git",
    label: "Git stash drop",
    description: "Blocks dropping stash entries.",
    example: "git stash drop stash@{0}",
    intent: "use_alternative"
  },
  {
    id: "git.stash-clear",
    category: "Git",
    label: "Git stash clear",
    description: "Blocks clearing all stash entries.",
    example: "git stash clear",
    intent: "manual_only"
  },
  {
    id: "git.worktree-remove-force",
    category: "Git",
    label: "Git worktree force remove",
    description: "Blocks forced worktree removal.",
    example: "git worktree remove --force ../feature",
    intent: "use_alternative"
  },
  {
    id: "rm.recursive-force-root-or-home",
    category: "Filesystem",
    label: "rm -rf root or home",
    description: "Blocks recursive forced removal of root or home paths.",
    example: "rm -rf /",
    intent: "hard_stop"
  },
  {
    id: "rm.recursive-force-dynamic-target",
    category: "Filesystem",
    label: "rm -rf dynamic target",
    description: "Blocks recursive forced removal with dynamic targets in strict mode.",
    example: 'rm -rf "$target"',
    intent: "scope_down",
    activationCapability: "fail_closed"
  },
  {
    id: "rm.recursive-force-home-cwd",
    category: "Filesystem",
    label: "rm -rf from home cwd",
    description: "Blocks recursive forced removal while working in home.",
    example: 'cd "$HOME" && rm -rf build',
    intent: "scope_down"
  },
  {
    id: "rm.recursive-force-cwd-self",
    category: "Filesystem",
    label: "rm -rf current directory",
    description: "Blocks recursive forced removal of the current directory.",
    example: "rm -rf .",
    intent: "scope_down"
  },
  {
    id: "rm.recursive-force-outside-cwd",
    category: "Filesystem",
    label: "rm -rf outside cwd",
    description: "Blocks recursive forced removal outside the original cwd.",
    example: "rm -rf ../outside",
    intent: "scope_down"
  },
  {
    id: "rm.recursive-force-paranoid",
    category: "Filesystem",
    label: "rm -rf paranoid mode",
    description: "Blocks non-temp recursive forced removal when paranoid rm is enabled.",
    example: "rm -rf ./cache",
    intent: "scope_down",
    activationCapability: "paranoid_rm"
  },
  {
    id: "powershell.remove-item-root-or-home",
    category: "PowerShell",
    label: "Remove-Item root or home",
    description: "Blocks PowerShell Remove-Item targeting root or home paths.",
    example: "Remove-Item C:\\",
    intent: "hard_stop"
  },
  {
    id: "powershell.remove-item-recursive-force-root-or-home",
    category: "PowerShell",
    label: "Remove-Item recursive force root or home",
    description: "Blocks recursive forced PowerShell removal of root or home paths.",
    example: "Remove-Item C:\\ -Recurse -Force",
    intent: "hard_stop"
  },
  {
    id: "powershell.remove-item-recursive-force-dynamic-target",
    category: "PowerShell",
    label: "Remove-Item recursive force dynamic target",
    description: "Blocks recursive forced PowerShell removal with dynamic targets in strict mode.",
    example: "Remove-Item $target -Recurse -Force",
    intent: "scope_down",
    activationCapability: "fail_closed"
  },
  {
    id: "powershell.remove-item-recursive-force-home-cwd",
    category: "PowerShell",
    label: "Remove-Item recursive force from home cwd",
    description: "Blocks recursive forced PowerShell removal while working in home.",
    example: "Set-Location $HOME; Remove-Item ./build -Recurse -Force",
    intent: "scope_down"
  },
  {
    id: "powershell.remove-item-recursive-force-cwd-self",
    category: "PowerShell",
    label: "Remove-Item recursive force current directory",
    description: "Blocks recursive forced PowerShell removal of the current directory.",
    example: "Remove-Item . -Recurse -Force",
    intent: "scope_down"
  },
  {
    id: "powershell.remove-item-recursive-force-outside-cwd",
    category: "PowerShell",
    label: "Remove-Item recursive force outside cwd",
    description: "Blocks recursive forced PowerShell removal outside the original cwd.",
    example: "Remove-Item ../outside -Recurse -Force",
    intent: "scope_down"
  },
  {
    id: "powershell.remove-item-recursive-force-paranoid",
    category: "PowerShell",
    label: "Remove-Item recursive force paranoid mode",
    description: "Blocks non-temp recursive forced PowerShell removal when paranoid rm is enabled.",
    example: "Remove-Item ./cache -Recurse -Force",
    intent: "scope_down",
    activationCapability: "paranoid_rm"
  },
  {
    id: "powershell.remove-item-pipeline-dynamic-target",
    category: "PowerShell",
    label: "Remove-Item pipeline dynamic target",
    description: "Blocks PowerShell Remove-Item with unverifiable pipeline input in strict mode.",
    example: "Get-ChildItem . -Recurse | Remove-Item -Force",
    intent: "scope_down",
    activationCapability: "fail_closed"
  },
  {
    id: "find.delete",
    category: "Filesystem",
    label: "find delete",
    description: "Blocks unsafe find -delete operations.",
    example: "find . -delete",
    intent: "scope_down"
  },
  {
    id: "find.exec-rm-recursive-force",
    category: "Filesystem",
    label: "find exec rm -rf",
    description: "Blocks find -exec rm -rf operations.",
    example: "find . -exec rm -rf {} +",
    intent: "scope_down"
  },
  {
    id: "interpreter.dangerous-command",
    category: "Execution",
    label: "Interpreter dangerous command",
    description: "Blocks interpreter one-liners containing dangerous commands.",
    example: `python -c "import os; os.system('rm -rf /')"`,
    intent: "use_alternative"
  },
  {
    id: "interpreter.one-liner-paranoid",
    category: "Execution",
    label: "Interpreter one-liner paranoid mode",
    description: "Blocks interpreter one-liners when paranoid interpreters is enabled.",
    example: 'python -c "print(1)"',
    intent: "use_alternative",
    activationCapability: "paranoid_interpreters"
  },
  {
    id: "awk.system-dynamic",
    category: "Execution",
    label: "Awk dynamic system call",
    description: "Blocks awk system calls that cannot be safely analyzed.",
    example: "awk '{ system($0) }'",
    intent: "stop_and_explain"
  },
  {
    id: "xargs.rm-recursive-force-dynamic",
    category: "Execution",
    label: "xargs dynamic rm -rf",
    description: "Blocks xargs rm -rf with dynamic input.",
    example: "printf / | xargs rm -rf",
    intent: "scope_down"
  },
  {
    id: "xargs.shell-dynamic",
    category: "Execution",
    label: "xargs dynamic shell",
    description: "Blocks xargs shell execution with dynamic input.",
    example: "xargs r$(printf m) -rf",
    intent: "scope_down"
  },
  {
    id: "parallel.rm-recursive-force-dynamic",
    category: "Execution",
    label: "parallel dynamic rm -rf",
    description: "Blocks parallel rm -rf with dynamic input.",
    example: "printf / | parallel rm -rf",
    intent: "scope_down"
  },
  {
    id: "parallel.shell-dynamic",
    category: "Execution",
    label: "parallel dynamic shell",
    description: "Blocks parallel shell execution with dynamic input.",
    example: "parallel r$(printf m) -rf ::: child",
    intent: "scope_down"
  },
  {
    id: "parallel.command-stream-dynamic",
    category: "Execution",
    label: "parallel dynamic command stream",
    description: "Blocks parallel command streams from dynamic input.",
    example: "parallel --dry-run",
    intent: "scope_down"
  },
  {
    id: "shell.dynamic-structure",
    category: "Execution",
    label: "Dynamic command structure",
    description: "Blocks guarded subcommands and options assembled from substitution output in strict mode.",
    example: "git reset $(printf --hard)",
    intent: "stop_and_explain",
    activationCapability: "fail_closed"
  },
  {
    id: "shell.dynamic-executable",
    category: "Execution",
    label: "Dynamic executable name",
    description: "Blocks executable names assembled from command substitution output in strict mode.",
    example: "$(printf r)m -rf /",
    intent: "manual_only",
    activationCapability: "fail_closed"
  },
  {
    id: "raw-text.dangerous-command",
    category: "Execution",
    label: "Raw text dangerous command",
    description: "Blocks dangerous commands detected in raw command text.",
    example: "git reset --hard 'unterminated",
    intent: "stop_and_explain"
  }
], DESTRUCTIVE_COMMAND_RULE_INTENTS = new Map(DESTRUCTIVE_COMMAND_RULE_METADATA.map((rule) => [rule.id, rule.intent]));
function destructiveCommandMatch(id, reason, intent) {
  return {
    id,
    reason,
    intent: intent ?? DESTRUCTIVE_COMMAND_RULE_INTENTS.get(id) ?? "manual_only"
  };
}
function filterDestructiveCommandMatch(match, policy) {
  if (!match)
    return null;
  if (policy?.destructiveCommandProtectionEnabled === !1)
    return null;
  let effectiveRule = policy?.effectiveDestructiveCommandRules?.[match.id];
  if (effectiveRule)
    return effectiveRule.enabled ? match : null;
  return policy?.destructiveCommandRuleOverrides[match.id] === "off" ? null : match;
}
function destructiveCommandRuleIsEnabled(policy, id, inheritedEnabled) {
  if (policy?.destructiveCommandProtectionEnabled === !1)
    return !1;
  let resolved = policy?.effectiveDestructiveCommandRules?.[id];
  if (resolved)
    return resolved.enabled;
  let override = policy?.destructiveCommandRuleOverrides[id];
  return override ? override === "on" : inheritedEnabled;
}
function resolveEffectiveDestructiveCommandRules(policy, capabilities) {
  return Object.freeze(Object.fromEntries(DESTRUCTIVE_COMMAND_RULE_METADATA.map((rule) => {
    let capability = rule.activationCapability ? capabilities[rule.activationCapability] : void 0, inheritedEnabled = capability?.enabled ?? !0, override = policy.destructiveCommandRuleOverrides[rule.id], state = policy.destructiveCommandProtectionEnabled ? override ? {
      enabled: override === "on",
      inheritedEnabled,
      changesInherited: override === "on" !== inheritedEnabled,
      source: "rule_override",
      ...rule.activationCapability ? { activationCapability: rule.activationCapability } : {},
      override
    } : {
      enabled: inheritedEnabled,
      inheritedEnabled,
      changesInherited: !1,
      source: capability?.source ?? "built_in_default",
      ...rule.activationCapability ? { activationCapability: rule.activationCapability } : {}
    } : {
      enabled: !1,
      inheritedEnabled,
      changesInherited: !1,
      source: "master_disabled",
      ...rule.activationCapability ? { activationCapability: rule.activationCapability } : {},
      ...override ? { override } : {}
    };
    return [rule.id, Object.freeze(state)];
  })));
}
function createCommandAnalysisPolicy(policy, capabilities) {
  return Object.freeze({
    ...policy,
    effectiveDestructiveCommandRules: resolveEffectiveDestructiveCommandRules(policy, capabilities)
  });
}

// src/core/analyze/awk.ts
var AWK_INTERPRETERS = /* @__PURE__ */ new Set(["awk", "gawk", "nawk", "mawk"]), AWK_SOURCE_VALUE_OPTIONS = /* @__PURE__ */ new Set(["-e", "--source"]), AWK_DATA_VALUE_OPTIONS = /* @__PURE__ */ new Set(["-F", "-v", "--assign", "--field-separator"]), AWK_FILE_VALUE_OPTIONS = /* @__PURE__ */ new Set(["-f", "--file"]), AWK_REGEX_PREFIX_KEYWORDS = /* @__PURE__ */ new Set(["print", "printf", "return"]), AWK_EXECUTABLE_SOURCE_SELECTORS = [
  { selector: "-e", kind: "inline-code", valueForm: "attached-or-separate" },
  { selector: "--source", kind: "inline-code", valueForm: "equals-or-separate" },
  { selector: "-f", kind: "program-file", valueForm: "attached-or-separate" },
  { selector: "--file", kind: "program-file", valueForm: "equals-or-separate" }
], REASON_AWK_SYSTEM_DYNAMIC = "Detected awk system(), pipe, or getline command with dynamic command that cannot be safely analyzed. Use a literal command or process the data without system(), pipes, or getline.";
function analyzeAwkSystemCallMatch(tokens, analyzeNested, scanWork) {
  let dynamic = !1;
  for (let source of extractAwkSourceArgs(tokens)) {
    let commands = extractAwkExternalCommands(source, scanWork);
    if (!commands)
      continue;
    for (let command of commands.commands) {
      let result = analyzeNested(command);
      if (result)
        return result;
      if (command.includes("{}") || /[$`]/.test(command))
        dynamic = !0;
    }
    dynamic ||= commands.dynamic;
  }
  return dynamic ? destructiveCommandMatch("awk.system-dynamic", REASON_AWK_SYSTEM_DYNAMIC) : null;
}
function parseAwkArgv(tokens) {
  let sources = [], hasExplicitSource = !1, hasFileSource = !1, options = !0, valid = !0;
  for (let i = 1;i < tokens.length; i++) {
    let token = tokens[i];
    if (token === void 0)
      break;
    if (options && token === "--") {
      options = !1;
      continue;
    }
    if (options && AWK_SOURCE_VALUE_OPTIONS.has(token)) {
      hasExplicitSource = !0;
      let source = tokens[i + 1];
      if (source !== void 0)
        sources.push({ tokenIndex: i + 1, kind: "inline-code", value: source });
      else
        valid = !1;
      i++;
      continue;
    }
    if (options && token.startsWith("--source=")) {
      hasExplicitSource = !0, sources.push({
        tokenIndex: i,
        kind: "inline-code",
        value: token.slice(9)
      });
      continue;
    }
    if (options && token.startsWith("-e") && token.length > 2) {
      hasExplicitSource = !0, sources.push({ tokenIndex: i, kind: "inline-code", value: token.slice(2) });
      continue;
    }
    if (options && (AWK_DATA_VALUE_OPTIONS.has(token) || AWK_FILE_VALUE_OPTIONS.has(token))) {
      if (AWK_FILE_VALUE_OPTIONS.has(token)) {
        hasFileSource = !0;
        let source = tokens[i + 1];
        if (source !== void 0)
          sources.push({ tokenIndex: i + 1, kind: "program-file", value: source });
        else
          valid = !1;
      } else if (tokens[i + 1] === void 0)
        valid = !1;
      i++;
      continue;
    }
    if (options && (token.startsWith("-F") || token.startsWith("-v") && token.slice(2).includes("=")))
      continue;
    if (options && token.startsWith("-f") && token.length > 2) {
      hasFileSource = !0, sources.push({ tokenIndex: i, kind: "program-file", value: token.slice(2) });
      continue;
    }
    if (options && (token.startsWith("--assign=") || token.startsWith("--field-separator=")))
      continue;
    if (options && token.startsWith("--file=")) {
      hasFileSource = !0, sources.push({
        tokenIndex: i,
        kind: "program-file",
        value: token.slice(7)
      });
      continue;
    }
    if (options && token.startsWith("-") && token !== "-")
      continue;
    if (options = !1, !hasExplicitSource && !hasFileSource)
      sources.push({ tokenIndex: i, kind: "main-program", value: token });
    return { sources, optionsOpen: !1 };
  }
  return { sources: valid ? sources : [], optionsOpen: options && valid };
}
function extractAwkExecutableSources(tokens) {
  return parseAwkArgv(tokens).sources;
}
function extractAwkSourceArgs(tokens) {
  return extractAwkExecutableSources(tokens).filter((source) => source.kind !== "program-file").map((source) => source.value);
}
function extractAwkExternalCommands(code, scanWork) {
  chargeNativeLinearPass(scanWork, code);
  let systemCommands = code.includes("system") ? extractAwkSystemCommands(code, scanWork) : null, pipeCommands = extractAwkPipeCommands(code, scanWork);
  if (!systemCommands && !pipeCommands)
    return null;
  return {
    dynamic: !!systemCommands?.dynamic || !!pipeCommands?.dynamic,
    commands: [...systemCommands?.commands ?? [], ...pipeCommands?.commands ?? []]
  };
}
function extractAwkSystemCommands(code, scanWork) {
  chargeNativeLinearPass(scanWork, code);
  let commands = [], sawSystem = !1, dynamic = !1, searchIndex = 0;
  while (searchIndex < code.length) {
    let char = code[searchIndex];
    if (char === '"' || char === "'") {
      searchIndex = readAwkStringLiteral(code, searchIndex, char)?.endIndex ?? searchIndex + 1;
      continue;
    }
    if (char === "#") {
      searchIndex = findAwkLineEnd(code, searchIndex + 1);
      continue;
    }
    if (char === "/" && isLikelyAwkRegexStart(code, searchIndex)) {
      searchIndex = findAwkRegexEnd(code, searchIndex + 1) ?? searchIndex + 1;
      continue;
    }
    if (!code.startsWith("system", searchIndex)) {
      searchIndex++;
      continue;
    }
    let systemIndex = searchIndex;
    if (searchIndex += 6, isAwkIdentifierChar(code[systemIndex - 1]) || isAwkIdentifierChar(code[searchIndex]))
      continue;
    let i = skipAwkWhitespace(code, searchIndex);
    if (code[i] !== "(")
      continue;
    i = skipAwkWhitespace(code, i + 1);
    let quote = code[i];
    if (quote !== '"' && quote !== "'") {
      sawSystem = !0, dynamic = !0;
      continue;
    }
    let parsed = readAwkStringLiteral(code, i, quote);
    if (!parsed) {
      sawSystem = !0, dynamic = !0;
      continue;
    }
    if (i = skipAwkWhitespace(code, parsed.endIndex), sawSystem = !0, code[i] !== ")") {
      dynamic = !0, searchIndex = parsed.endIndex;
      continue;
    }
    commands.push(parsed.value), searchIndex = i + 1;
  }
  if (!sawSystem)
    return null;
  return { dynamic, commands };
}
function extractAwkPipeCommands(code, scanWork) {
  chargeNativeLinearPass(scanWork, code);
  let commands = [], dynamic = !1, sawPipeCommand = !1, i = 0, statementStart = 0, printKeywordIndex = null, leadingString = null, lastSignificantEnd = 0;
  while (i < code.length) {
    let char = code[i];
    if (!char)
      break;
    if (char === '"' || char === "'") {
      let parsed = readAwkStringLiteral(code, i, char);
      if (parsed && lastSignificantEnd === statementStart)
        leadingString = { ...parsed, startIndex: i };
      lastSignificantEnd = parsed?.endIndex ?? i + 1, i = parsed?.endIndex ?? i + 1;
      continue;
    }
    if (char === "#") {
      i = findAwkLineEnd(code, i + 1), statementStart = i, printKeywordIndex = null, leadingString = null, lastSignificantEnd = i;
      continue;
    }
    if (char === "/" && isLikelyAwkRegexStart(code, i)) {
      let regexEnd = findAwkRegexEnd(code, i + 1);
      lastSignificantEnd = regexEnd ?? i + 1, i = regexEnd ?? i + 1;
      continue;
    }
    if (`;
{}`.includes(char)) {
      i++, statementStart = i, printKeywordIndex = null, leadingString = null, lastSignificantEnd = i;
      continue;
    }
    if (printKeywordIndex === null && (startsAwkKeyword(code, i, "print") || startsAwkKeyword(code, i, "printf")))
      printKeywordIndex = i;
    if (char !== "|" || code[i - 1] === "|" || code[i + 1] === "|") {
      if (!/\s/.test(char))
        lastSignificantEnd = i + 1;
      i++;
      continue;
    }
    let operatorEnd = code[i + 1] === "&" ? i + 2 : i + 1, afterPipe = skipAwkWhitespace(code, operatorEnd);
    if (startsAwkKeyword(code, afterPipe, "getline")) {
      sawPipeCommand = !0;
      let command = readAwkStringBeforePipe(statementStart, leadingString, lastSignificantEnd);
      if (command === null)
        dynamic = !0;
      else
        commands.push(command);
      lastSignificantEnd = operatorEnd, i = operatorEnd;
      continue;
    }
    if (isAwkPrintPipe(statementStart, printKeywordIndex)) {
      sawPipeCommand = !0;
      let parsed = readAwkStringAt(code, afterPipe);
      if (!parsed) {
        dynamic = !0, lastSignificantEnd = operatorEnd, i = operatorEnd;
        continue;
      }
      if (!isAwkExpressionEnd(code, parsed.endIndex)) {
        dynamic = !0, lastSignificantEnd = parsed.endIndex, i = parsed.endIndex;
        continue;
      }
      commands.push(parsed.value), lastSignificantEnd = parsed.endIndex, i = parsed.endIndex;
      continue;
    }
    lastSignificantEnd = operatorEnd, i++;
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
  while (/\s/.test(code[i] ?? ""))
    i++;
  return i;
}
function isAwkExpressionEnd(code, index) {
  let i = index;
  while (/[\t\f\v\r ]/.test(code[i] ?? ""))
    i++;
  let char = code[i];
  return !char || `;
}#`.includes(char);
}
function readAwkStringLiteral(code, startIndex, quote) {
  let value = "", escaped = !1;
  for (let i = startIndex + 1;i < code.length; i++) {
    let char = code[i];
    if (!char)
      break;
    if (escaped) {
      let decoded = decodeAwkEscape(code, i);
      if (!decoded)
        return null;
      value += decoded.value, i = decoded.endIndex, escaped = !1;
      continue;
    }
    if (char === "\\") {
      escaped = !0;
      continue;
    }
    if (char === quote)
      return { value, endIndex: i + 1 };
    value += char;
  }
  return null;
}
function readAwkStringAt(code, index) {
  let quote = code[index];
  if (quote !== '"' && quote !== "'")
    return null;
  return readAwkStringLiteral(code, index, quote);
}
function readAwkStringBeforePipe(statementStart, leadingString, lastSignificantEnd) {
  if (!leadingString)
    return null;
  return leadingString.startIndex >= statementStart && leadingString.endIndex === lastSignificantEnd ? leadingString.value : null;
}
function decodeAwkEscape(code, index) {
  let char = code[index];
  if (!char)
    return null;
  if (char === "x") {
    let hex = code.slice(index + 1, index + 3);
    if (!/^[0-9A-Fa-f]{2}$/.test(hex))
      return null;
    return { value: String.fromCharCode(Number.parseInt(hex, 16)), endIndex: index + 2 };
  }
  if (/[0-7]/.test(char)) {
    let match = /^[0-7]{1,3}/.exec(code.slice(index));
    if (!match)
      return null;
    return {
      value: String.fromCharCode(Number.parseInt(match[0], 8)),
      endIndex: index + match[0].length - 1
    };
  }
  return { value: {
    a: "\x07",
    b: "\b",
    f: "\f",
    n: `
`,
    r: "\r",
    t: "\t",
    v: "\v"
  }[char] ?? char, endIndex: index };
}
function startsAwkKeyword(code, index, keyword) {
  return code.startsWith(keyword, index) && !isAwkIdentifierChar(code[index - 1]) && !isAwkIdentifierChar(code[index + keyword.length]);
}
function isAwkPrintPipe(statementStart, printKeywordIndex) {
  return printKeywordIndex !== null && printKeywordIndex >= statementStart;
}
function findAwkLineEnd(code, index) {
  let lineEnd = code.indexOf(`
`, index);
  return lineEnd === -1 ? code.length : lineEnd + 1;
}
function isLikelyAwkRegexStart(code, index) {
  let previousIndex = findPreviousAwkNonWhitespace(code, index);
  if (previousIndex === -1)
    return !0;
  if ("{([,;!~=".includes(code[previousIndex] ?? ""))
    return !0;
  let wordStart = previousIndex;
  while (isAwkIdentifierChar(code[wordStart - 1]))
    wordStart--;
  return AWK_REGEX_PREFIX_KEYWORDS.has(code.slice(wordStart, previousIndex + 1));
}
function findPreviousAwkNonWhitespace(code, index) {
  for (let i = index - 1;i >= 0; i--)
    if (!/\s/.test(code[i] ?? ""))
      return i;
  return -1;
}
function findAwkRegexEnd(code, index) {
  let escaped = !1;
  for (let i = index;i < code.length; i++) {
    let char = code[i];
    if (!char)
      break;
    if (escaped) {
      escaped = !1;
      continue;
    }
    if (char === "\\") {
      escaped = !0;
      continue;
    }
    if (char === "/")
      return i + 1;
  }
  return null;
}

// src/core/analyze/constants.ts
var DISPLAY_COMMANDS = /* @__PURE__ */ new Set([
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

// src/core/git/worktree.ts
import { existsSync, lstatSync as lstatSync2, readFileSync as readFileSync2, realpathSync as realpathSync4, statSync as statSync2 } from "node:fs";
import { dirname as dirname4, isAbsolute as isAbsolute4, join as join4, resolve as resolve3 } from "node:path";

// src/core/git/env.ts
var GIT_CONTEXT_ENV_OVERRIDES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE"
], GIT_CONTEXT_ENV_OVERRIDE_NAMES = new Set(GIT_CONTEXT_ENV_OVERRIDES);
var GIT_CONFIG_AFFECTING_ENV_NAMES = /* @__PURE__ */ new Set([
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_CONFIG_SYSTEM",
  "HOME",
  "XDG_CONFIG_HOME"
]), GIT_SSH_ENV_NAMES = /* @__PURE__ */ new Set([
  "GIT_SSH_COMMAND",
  "GIT_SSH",
  "GIT_SSH_VARIANT"
]), GIT_CONTEXT_APPEND_ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)\+=/;
function isGitContextEnvOverrideName(name) {
  return GIT_CONTEXT_ENV_OVERRIDE_NAMES.has(name);
}
function isGitConfigEnvName(name) {
  return name === "GIT_CONFIG_COUNT" || name === "GIT_CONFIG_PARAMETERS" || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(name);
}
function isTrackedGitEnvName(name) {
  return isGitContextEnvOverrideName(name) || GIT_CONFIG_AFFECTING_ENV_NAMES.has(name) || GIT_SSH_ENV_NAMES.has(name) || isGitConfigEnvName(name);
}
function getGitEnvValue(name, envAssignments) {
  return envAssignments?.has(name) ? envAssignments.get(name) : Object.hasOwn(process.env, name) ? process.env[name] : void 0;
}
function resolveGitConfigCount(envAssignments) {
  let value = getGitEnvValue("GIT_CONFIG_COUNT", envAssignments);
  if (value === void 0)
    return { state: "absent" };
  if (value === "")
    return { state: "valid", count: 0 };
  if (!/^\d+$/.test(value))
    return { state: "invalid" };
  let count = Number(value);
  return Number.isSafeInteger(count) && count <= 1024 ? { state: "valid", count } : { state: "invalid" };
}
function parseGitContextAppendEnvAssignment(token, envAssignments) {
  let name = token.match(GIT_CONTEXT_APPEND_ASSIGNMENT_RE)?.[1];
  if (!name || !isTrackedGitEnvName(name))
    return null;
  let eqIdx = token.indexOf("=");
  return {
    name,
    value: `${getGitEnvValue(name, envAssignments) ?? ""}${token.slice(eqIdx + 1)}`
  };
}
function hasGitSshEnvAssignment(envAssignments) {
  return hasAnyEnvAssignment(envAssignments, GIT_SSH_ENV_NAMES);
}
function hasConfigAffectingEnvAssignment(envAssignments) {
  return hasAnyEnvAssignment(envAssignments, GIT_CONFIG_AFFECTING_ENV_NAMES);
}
function hasAnyEnvAssignment(envAssignments, names) {
  if (!envAssignments)
    return !1;
  for (let key of envAssignments.keys())
    if (names.has(key))
      return !0;
  return !1;
}

// src/core/git/worktree.ts
var GIT_GLOBAL_OPTS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-c",
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env"
]);
function hasGitContextEnvOverride(envAssignments) {
  for (let name of GIT_CONTEXT_ENV_OVERRIDES)
    if (envAssignments?.has(name) || Object.hasOwn(process.env, name))
      return !0;
  return !1;
}
function getGitExecutionContext(tokens, cwd) {
  if (!cwd)
    return { gitCwd: null, hasExplicitGitContext: !1 };
  let gitCwd;
  try {
    gitCwd = realpathSync4(resolve3(cwd));
  } catch {
    return { gitCwd: null, hasExplicitGitContext: !1 };
  }
  if (!isDirectory(gitCwd))
    return { gitCwd: null, hasExplicitGitContext: !1 };
  let hasExplicitGitContext = !1, i = 1;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      break;
    if (token === "--")
      break;
    if (!token.startsWith("-"))
      break;
    if (token === "-C") {
      let target = tokens[i + 1];
      if (!target)
        return { gitCwd: null, hasExplicitGitContext };
      let resolvedCwd = resolveGitCwd(gitCwd, target);
      if (!resolvedCwd)
        return { gitCwd: null, hasExplicitGitContext };
      gitCwd = resolvedCwd, i += 2;
      continue;
    }
    if (token.startsWith("-C") && token.length > 2) {
      let resolvedCwd = resolveGitCwd(gitCwd, token.slice(2));
      if (!resolvedCwd)
        return { gitCwd: null, hasExplicitGitContext };
      gitCwd = resolvedCwd, i++;
      continue;
    }
    if (token === "--git-dir" || token === "--work-tree") {
      hasExplicitGitContext = !0, i += 2;
      continue;
    }
    if (token.startsWith("--git-dir=") || token.startsWith("--work-tree=")) {
      hasExplicitGitContext = !0, i++;
      continue;
    }
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token))
      i += 2;
    else if (token.startsWith("-c") && token.length > 2)
      i++;
    else
      i++;
  }
  return { gitCwd, hasExplicitGitContext };
}
function isLinkedWorktree(cwd) {
  let dotGitPath = findDotGit(cwd);
  if (!dotGitPath)
    return !1;
  try {
    let stat = lstatSync2(dotGitPath);
    if (stat.isSymbolicLink() || !stat.isFile())
      return !1;
    let firstLine = readFileSync2(dotGitPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine.startsWith("gitdir:"))
      return !1;
    let rawGitDir = firstLine.slice(7).trim();
    if (rawGitDir === "")
      return !1;
    let gitDir = isAbsolute4(rawGitDir) ? rawGitDir : resolve3(dirname4(dotGitPath), rawGitDir);
    if (!existsSync(join4(gitDir, "commondir")))
      return !1;
    if (!worktreeGitdirBacklinkMatches(gitDir, dotGitPath))
      return !1;
    return worktreeConfigMatchesRoot(gitDir, dirname4(dotGitPath));
  } catch {
    return !1;
  }
}
function worktreeGitdirBacklinkMatches(gitDir, dotGitPath) {
  let rawBacklink = readWorktreeGitdirBacklink(gitDir);
  return rawBacklink === null ? !1 : gitDirPathReferenceMatches(gitDir, rawBacklink, dotGitPath);
}
function worktreeConfigMatchesRoot(gitDir, worktreeRoot) {
  let configuredWorktree = readWorktreeConfigWorktree(gitDir);
  return configuredWorktree === null ? !0 : gitDirPathReferenceMatches(gitDir, configuredWorktree, worktreeRoot);
}
function readWorktreeGitdirBacklink(gitDir) {
  let backlinkPath = join4(gitDir, "gitdir");
  if (!existsSync(backlinkPath))
    return null;
  let rawBacklink = readFileSync2(backlinkPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
  return rawBacklink === "" ? null : rawBacklink;
}
function readWorktreeConfigWorktree(gitDir) {
  let configWorktreePath = join4(gitDir, "config.worktree");
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
    return !1;
  }
}
function sameFilesystemPath(left, right) {
  try {
    let leftStat = statSync2(left), rightStat = statSync2(right);
    if (leftStat.ino !== 0 && rightStat.ino !== 0 && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino)
      return !0;
  } catch {}
  return getCanonicalPathForComparison(left) === getCanonicalPathForComparison(right);
}
function getCanonicalPathForComparison(path) {
  return normalizePathForComparison(realpathSync4.native(path));
}
function normalizePathForComparison(path) {
  let normalized = path.replace(/^\\\\\?\\UNC\\/i, "//").replace(/^\\\\\?\\/i, "");
  if (normalized = normalized.replace(/\\/g, "/"), normalized.length > 1 && normalized.endsWith("/"))
    normalized = normalized.slice(0, -1);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function readCoreWorktree(configPath) {
  let content = readFileSync2(configPath, "utf-8"), inCore = !1, configuredWorktree = null;
  for (let line of content.split(/\r?\n/)) {
    let trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";"))
      continue;
    if (trimmed.startsWith("[")) {
      inCore = /^\[core\]$/i.test(trimmed);
      continue;
    }
    if (!inCore)
      continue;
    let match = trimmed.match(/^worktree\s*=\s*(.*)$/i);
    if (match)
      configuredWorktree = parseGitConfigValue(match[1] ?? "");
  }
  return configuredWorktree;
}
function parseGitConfigValue(value) {
  let trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"'))
    return trimmed;
  return unescapeDoubleQuotedGitConfigValue(trimmed.slice(1, -1));
}
function unescapeDoubleQuotedGitConfigValue(value) {
  let result = "";
  for (let i = 0;i < value.length; i++) {
    let char = value[i];
    if (char !== "\\") {
      result += char;
      continue;
    }
    let next = value[i + 1];
    if (next === void 0) {
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
    let resolved = resolveChdirTarget(baseCwd, target);
    return isDirectory(resolved) ? resolved : null;
  } catch {
    return null;
  }
}
function isDirectory(path) {
  try {
    return statSync2(path).isDirectory();
  } catch {
    return !1;
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
  while (!0) {
    let dotGitPath = join4(current, ".git");
    if (existsSync(dotGitPath))
      return dotGitPath;
    let parent = dirname4(current);
    if (parent === current)
      return null;
    current = parent;
  }
}

// src/core/analyze/linear-danger-scanner.ts
function hasLinearInterpreterDanger(code, kind, work) {
  let text = scannedText(code, work);
  if (kind === "rm")
    return hasInterpreterRm(text);
  if (kind === "dd")
    return hasInterpreterDd(text);
  return hasFindDelete(text, !0);
}
function hasLinearDangerousText(text, kind, work) {
  let scanned = scannedText(text, work);
  if (kind === "rm")
    return hasRawRm(scanned);
  if (kind === "reset-hard")
    return hasResetOption(scanned, "--ha", "rd");
  if (kind === "reset-merge")
    return hasResetOption(scanned, "--me", "rge");
  if (kind === "clean")
    return hasCleanForce(scanned);
  if (kind === "checkout")
    return hasCheckoutForce(scanned);
  if (kind === "push-force")
    return hasPushForce(scanned);
  if (kind === "push-refspec")
    return hasPushForcedRefspec(scanned);
  if (kind === "push-delete")
    return hasPushDelete(scanned);
  if (kind === "branch")
    return hasBranchDeleteForce(scanned);
  if (kind === "tag")
    return hasTagDelete(scanned);
  if (kind === "restore")
    return hasRestoreWithoutExclusion(scanned);
  return hasFindDelete(scanned, !1);
}
function hasInterpreterRm(text) {
  let active = !1, recursive = !1, force = !1, tokenStart = -1;
  for (let i = 0;i <= scanLength(text); i++) {
    let char = scanChar(text, i);
    if (!active) {
      let afterRm = scanChar(text, i + 2);
      if (wordAt(text, i, "rm") && isEcmaWhitespace(afterRm) && afterRm !== `
`)
        active = !0, i++;
      continue;
    }
    let escapedLineFeedEnd = getInterpreterEscapedLineFeedEnd(text, i);
    if (char === `
` || escapedLineFeedEnd !== -1) {
      if (active = !1, recursive = !1, force = !1, tokenStart = -1, escapedLineFeedEnd !== -1)
        i = escapedLineFeedEnd - 1;
      continue;
    }
    if (char === ";" || char === "&" || char === "|" || i === scanLength(text)) {
      if (tokenStart >= 0) {
        let flags = interpreterRmFlags(text, tokenStart, i);
        recursive ||= flags.recursive, force ||= flags.force;
      }
      if (recursive && force)
        return !0;
      active = !1, recursive = !1, force = !1, tokenStart = -1;
      continue;
    }
    if (isEcmaWhitespace(char)) {
      if (tokenStart >= 0) {
        if (fixedAt(text, tokenStart, "--") && i - tokenStart === 2)
          active = !1, recursive = !1, force = !1;
        else {
          let flags = interpreterRmFlags(text, tokenStart, i);
          if (recursive ||= flags.recursive, force ||= flags.force, recursive && force)
            return !0;
        }
        tokenStart = -1;
      }
      continue;
    }
    if (tokenStart < 0)
      tokenStart = i;
  }
  return !1;
}
function getInterpreterEscapedLineFeedEnd(text, index) {
  if (scanChar(text, index) !== "\\" || scanChar(text, index - 1) === "\\")
    return -1;
  if (fixedAt(text, index, String.raw`\n`))
    return index + 2;
  if (fixedAt(text, index, String.raw`\x0a`) || fixedAt(text, index, String.raw`\x0A`))
    return index + 5;
  if (fixedAt(text, index, String.raw`\u000a`) || fixedAt(text, index, String.raw`\u000A`))
    return index + 7;
  return fixedAt(text, index, String.raw`\012`) ? index + 4 : -1;
}
function interpreterRmFlags(text, start, end) {
  if (isScannedLongOptionAbbreviation(text, start, end, "recursive"))
    return { recursive: !0, force: !1 };
  if (isScannedLongOptionAbbreviation(text, start, end, "force"))
    return { recursive: !1, force: !0 };
  if (scanChar(text, start) !== "-" || scanChar(text, start + 1) === "-")
    return { recursive: !1, force: !1 };
  let recursive = !1, force = !1;
  for (let i = start + 1;i < end; i++) {
    let char = scanChar(text, i);
    recursive ||= char === "r" || char === "R", force ||= char === "f" || char === "F";
  }
  return { recursive, force };
}
function isScannedLongOptionAbbreviation(text, start, end, option) {
  let length = end - start - 2;
  if (length < 1 || length > option.length || !fixedAt(text, start, "--"))
    return !1;
  for (let i = 0;i < length; i++)
    if (scanChar(text, start + i + 2) !== option[i])
      return !1;
  return !0;
}
function hasInterpreterDd(text) {
  let active = !1;
  for (let i = 0;i < scanLength(text); i++) {
    if (isRawStop(scanChar(text, i))) {
      active = !1;
      continue;
    }
    if (wordAt(text, i, "dd")) {
      active = !0, i++;
      continue;
    }
    if (!active || !wordAt(text, i, "of") || !fixedAt(text, i, "of=/dev/"))
      continue;
    let valueStart = i + 8;
    if (valueStart < scanLength(text) && !isEcmaWhitespace(scanChar(text, valueStart)) && scanChar(text, valueStart) !== "'" && scanChar(text, valueStart) !== '"')
      return !0;
  }
  return !1;
}
function hasRawRm(text) {
  let active = !1, recursiveLong = !1, forceLong = !1;
  for (let i = 0;i <= scanLength(text); ) {
    let char = scanChar(text, i);
    if (i === scanLength(text) || isRawStop(char)) {
      active = !1, recursiveLong = !1, forceLong = !1, i++;
      continue;
    }
    let start = rawRmAt(text, i);
    if (start >= 0) {
      if (rawRmShortMatch(text, start))
        return !0;
      let bodyStart = start, crossedLf = !1;
      while (isEcmaWhitespace(scanChar(text, bodyStart)))
        crossedLf ||= scanChar(text, bodyStart) === `
`, bodyStart++;
      if (crossedLf)
        recursiveLong = !1, forceLong = !1;
      active = !0, i = bodyStart;
      continue;
    }
    if (!active) {
      i++;
      continue;
    }
    if (fixedAt(text, i, "--") && (i === 0 || isEcmaWhitespace(scanChar(text, i - 1))) && (!scanChar(text, i + 2) || isEcmaWhitespace(scanChar(text, i + 2)) || isRawStop(scanChar(text, i + 2)))) {
      active = !1, recursiveLong = !1, forceLong = !1, i += 2;
      continue;
    }
    if (recursiveLong ||= fixedAt(text, i, "--recursive") && hasWordBoundaryAfter(text, i + 11) || hasRawLongOptionPrefix(text, i, "recursive"), forceLong ||= fixedAt(text, i, "--force") && hasWordBoundaryAfter(text, i + 7) || hasRawLongOptionPrefix(text, i, "force"), recursiveLong && forceLong)
      return !0;
    i++;
  }
  return !1;
}
function hasRawLongOptionPrefix(text, start, option) {
  if (!fixedAt(text, start, "--"))
    return !1;
  let length = 0;
  while (length <= option.length) {
    let char = scanChar(text, start + length + 2);
    if (!char || isEcmaWhitespace(char) || isRawStop(char))
      break;
    if (char !== option[length])
      return !1;
    length++;
  }
  return length > 0 && hasWordBoundaryAfter(text, start + length + 2);
}
function rawRmShortMatch(text, start) {
  let cursor = start, recursive = !1, force = !1;
  while (cursor < scanLength(text)) {
    while (isEcmaWhitespace(scanChar(text, cursor)))
      cursor++;
    let tokenStart = cursor;
    while (cursor < scanLength(text) && !isEcmaWhitespace(scanChar(text, cursor)))
      cursor++;
    if (scanChar(text, tokenStart) !== "-" || cursor - tokenStart === 2 && fixedAt(text, tokenStart, "--"))
      return !1;
    let recursiveLong = hasRawLongOptionAt(text, tokenStart, "recursive"), forceLong = hasRawLongOptionAt(text, tokenStart, "force");
    if (recursive && forceLong || force && recursiveLong)
      return !0;
    if (recursive ||= recursiveLong, force ||= forceLong, scanChar(text, tokenStart + 1) === "-")
      continue;
    let flags = summarizeRawShortToken(text, tokenStart, cursor);
    if (flags.combined || recursive && flags.forceAtBoundary || force && flags.recursiveAtBoundary)
      return !0;
    recursive ||= flags.recursive, force ||= flags.force;
  }
  return !1;
}
function hasRawLongOptionAt(text, start, option) {
  return fixedAt(text, start, `--${option}`) && hasWordBoundaryAfter(text, start + option.length + 2) || hasRawLongOptionPrefix(text, start, option);
}
function rawRmAt(text, index) {
  if (index > 0 && isAsciiWord(scanChar(text, index - 1)))
    return -1;
  let cursor = index;
  if (scanChar(text, cursor) === "\\")
    cursor++;
  if (scanChar(text, cursor) !== "r")
    return -1;
  if (cursor++, scanChar(text, cursor) === "\\")
    cursor++;
  if (scanChar(text, cursor) !== "m" || !isEcmaWhitespace(scanChar(text, cursor + 1)))
    return -1;
  return cursor + 1;
}
function summarizeRawShortToken(text, start, end) {
  let recursive = !1, force = !1, recursiveAtBoundary = !1, forceAtBoundary = !1, combined = !1;
  if (scanChar(text, start) !== "-")
    return { recursive, force, recursiveAtBoundary, forceAtBoundary, combined };
  let previous = "";
  for (let i = start + 1;i < end; i++) {
    let char = scanChar(text, i) ?? "", boundary = (char === "r" || char === "f") && hasWordBoundaryAfter(text, i + 1);
    recursive ||= char === "r", force ||= char === "f", recursiveAtBoundary ||= char === "r" && boundary, forceAtBoundary ||= char === "f" && boundary, combined ||= (previous === "r" && char === "f" || previous === "f" && char === "r") && boundary, previous = char;
  }
  return { recursive, force, recursiveAtBoundary, forceAtBoundary, combined };
}
function hasResetOption(text, prefix, optional) {
  return scanGitSuffix(text, "reset", isPipeSemicolonStop, !0, (index) => scanChar(text, index) === "-" && isPartialLongOption(text, index, prefix, optional) ? !0 : index);
}
function hasCleanForce(text) {
  return scanGitSuffix(text, "clean", isPipeSemicolonStop, !0, (index) => {
    if (scanChar(text, index) !== "-")
      return index;
    if (isPartialLongOption(text, index, "--fo", "rce"))
      return !0;
    let end = tokenEnd(text, index, isPipeSemicolonStop);
    for (let cursor = index + 1;cursor < end; cursor++)
      if (scanChar(text, cursor) === "f")
        return !0;
    return end - 1;
  });
}
function scanGitCommandAt(text, index, command) {
  if (!wordAt(text, index, "git"))
    return null;
  let cursor = index + 3;
  if (!isEcmaWhitespace(scanChar(text, cursor)))
    return { commandEnd: -1, next: cursor };
  while (isEcmaWhitespace(scanChar(text, cursor)))
    cursor++;
  while (cursor < scanLength(text)) {
    if (isRawStop(scanChar(text, cursor)))
      return { commandEnd: -1, next: cursor };
    let end = tokenEnd(text, cursor, isRawStop);
    if (wordAt(text, cursor, command))
      return { commandEnd: cursor + command.length, next: end };
    if (scanChar(text, cursor) !== "-")
      return { commandEnd: -1, next: end };
    let doubleDash = end - cursor === 2 && fixedAt(text, cursor, "--"), consumesValue = matchesGitGlobalOptionWithValue(text, cursor, end);
    cursor = end;
    while (isEcmaWhitespace(scanChar(text, cursor)))
      cursor++;
    if (doubleDash)
      return { commandEnd: wordAt(text, cursor, command) ? cursor + command.length : -1, next: tokenEnd(text, cursor, isRawStop) };
    if (!consumesValue)
      continue;
    if (cursor >= scanLength(text) || isRawStop(scanChar(text, cursor)))
      return { commandEnd: -1, next: cursor };
    cursor = tokenEnd(text, cursor, isRawStop);
    while (isEcmaWhitespace(scanChar(text, cursor)))
      cursor++;
  }
  return { commandEnd: -1, next: cursor };
}
function matchesGitGlobalOptionWithValue(text, start, end) {
  for (let option of GIT_GLOBAL_OPTS_WITH_VALUE)
    if (end - start === option.length && fixedAt(text, start, option))
      return !0;
  return !1;
}
function hasCheckoutForce(text) {
  return hasGitShortOption(text, {
    command: "checkout",
    longPrefix: "--fo",
    longOptional: "rce",
    shortFlag: "f",
    excludedShortStarts: "bBU"
  });
}
function hasPushForce(text) {
  return scanGitSuffix(text, "push", isPipeSemicolonStop, !0, (i) => {
    if (scanChar(text, i) !== "-")
      return i;
    if (scanChar(text, i + 1) === "f" && !isAsciiWord(scanChar(text, i + 2)) && !fixedAt(text, i + 2, "-with-lease"))
      return !0;
    let end = partialLongOptionEnd(text, i, "--fo", "rce");
    if (end >= 0 && !fixedAt(text, end, "-with-lease"))
      return !0;
    return i;
  });
}
function hasPushForcedRefspec(text) {
  return scanGitSuffix(text, "push", isRawStop, !1, (i) => {
    if (isEcmaWhitespace(scanChar(text, i)) && scanChar(text, i + 1) === "+" && i + 2 < scanLength(text) && !isRawStop(scanChar(text, i + 2)) && !isEcmaWhitespace(scanChar(text, i + 2)))
      return !0;
    if (scanChar(text, i) === ":" && scanChar(text, i + 1) === "+")
      return !0;
    return i;
  });
}
function hasPushDelete(text) {
  return scanGitSuffix(text, "push", isRawStop, !1, (i) => {
    if (scanChar(text, i) === "-" && isPartialLongOption(text, i, "--de", "lete"))
      return !0;
    if (isEcmaWhitespace(scanChar(text, i)) && scanChar(text, i + 1) === ":" && i + 2 < scanLength(text) && !isEcmaWhitespace(scanChar(text, i + 2)) && !isRawStop(scanChar(text, i + 2)))
      return !0;
    return i;
  });
}
function hasBranchDeleteForce(text) {
  let active = !1, deletion = !1, force = !1;
  for (let i = 0;i <= scanLength(text); i++) {
    if (i === scanLength(text) || isRawStop(scanChar(text, i))) {
      if (deletion && force)
        return !0;
      active = !1, deletion = !1, force = !1;
      continue;
    }
    if (!active) {
      let gitCommand = scanGitCommandAt(text, i, "branch");
      if (gitCommand) {
        active = gitCommand.commandEnd >= 0, i = Math.max(i, (active ? gitCommand.commandEnd : gitCommand.next) - 1);
        continue;
      }
    }
    if (!active || scanChar(text, i) !== "-")
      continue;
    let end = tokenEnd(text, i, isRawStop), flags = branchTokenFlags(text, i, end);
    if (deletion ||= flags.deletion, force ||= flags.force, deletion && force)
      return !0;
    i = end - 1;
  }
  return !1;
}
function branchTokenFlags(text, start, end) {
  let deletion = !1, force = !1;
  for (let i = start;i < end; i++) {
    if (scanChar(text, i) !== "-")
      continue;
    if (isPartialLongOption(text, i, "--de", "lete"))
      deletion = !0;
    if (isPartialLongOption(text, i, "--fo", "rce"))
      force = !0;
    if (scanChar(text, i + 1) === "-")
      continue;
    let cursor = i + 1, clusterDeletion = !1, clusterForce = !1, clusterUpperD = !1;
    while (cursor < end && isAsciiLetter(scanChar(text, cursor))) {
      let char = scanChar(text, cursor);
      clusterDeletion ||= char === "d" || char === "D", clusterForce ||= char === "f", clusterUpperD ||= char === "D", cursor++;
    }
    if (!hasWordBoundaryAfter(text, cursor))
      continue;
    deletion ||= clusterDeletion, force ||= clusterForce || clusterUpperD;
  }
  return { deletion, force };
}
function isAsciiLetter(char) {
  if (!char)
    return !1;
  let code = char.charCodeAt(0);
  return code >= 65 && code <= 90 || code >= 97 && code <= 122;
}
function hasTagDelete(text) {
  return hasGitShortOption(text, {
    command: "tag",
    longPrefix: "--de",
    longOptional: "lete",
    shortFlag: "d",
    excludedShortStarts: ""
  });
}
function hasGitShortOption(text, options) {
  let contexts = [
    {
      outerActive: !1,
      shortActive: !1,
      hasShortFlag: !1,
      depth: 0,
      quote: "",
      escaped: !1
    }
  ];
  for (let i = 0;i < scanLength(text); i++) {
    let char = scanChar(text, i), context = contexts[contexts.length - 1];
    if (!context)
      return !1;
    let escaped = context.escaped;
    if (context.escaped = !escaped && context.quote !== "'" && char === "\\", !escaped && char === "'" && context.quote !== '"')
      context.quote = context.quote === "'" ? "" : "'";
    if (!escaped && char === '"' && context.quote !== "'")
      context.quote = context.quote === '"' ? "" : '"';
    if (char === "$" && scanChar(text, i + 1) === "(" && (contexts.length === 1 || !escaped && context.quote !== "'")) {
      contexts.push({
        outerActive: !1,
        shortActive: !1,
        hasShortFlag: !1,
        depth: 1,
        quote: "",
        escaped: !1
      }), i++;
      continue;
    }
    if (!escaped && !context.quote && contexts.length > 1 && char === "(") {
      context.depth++;
      continue;
    }
    if (!escaped && !context.quote && contexts.length > 1 && char === ")") {
      if (context.depth--, context.depth === 0)
        contexts.pop();
      continue;
    }
    if (isEcmaWhitespace(char))
      context.shortActive = !1, context.hasShortFlag = !1;
    if (!context.outerActive) {
      let gitCommand = scanGitCommandAt(text, i, options.command);
      if (gitCommand) {
        context.outerActive = gitCommand.commandEnd >= 0 && isEcmaWhitespace(scanChar(text, gitCommand.commandEnd)), context.shortActive = !1, context.hasShortFlag = !1, i = Math.max(i, (context.outerActive ? gitCommand.commandEnd : gitCommand.next) - 1);
        continue;
      }
    }
    if (context.outerActive && char === "-") {
      if (isPartialLongOption(text, i, options.longPrefix, options.longOptional))
        return !0;
      context.shortActive ||= !options.excludedShortStarts.includes(scanChar(text, i + 1) ?? "");
    }
    if (context.hasShortFlag ||= context.shortActive && char === options.shortFlag, context.hasShortFlag && hasWordBoundaryAfter(text, i + 1))
      return !0;
    if (isPipeSemicolonStop(char))
      context.outerActive = !1;
  }
  return !1;
}
function scanGitSuffix(text, command, stop, requireTrailingWhitespace, inspect) {
  let active = !1;
  for (let i = 0;i < scanLength(text); i++) {
    let char = scanChar(text, i), stopped = stop(char);
    if (!active && !stopped) {
      let gitCommand = scanGitCommandAt(text, i, command);
      if (gitCommand) {
        active = gitCommand.commandEnd >= 0 && (!requireTrailingWhitespace || isEcmaWhitespace(scanChar(text, gitCommand.commandEnd))), i = Math.max(i, (active ? gitCommand.commandEnd : gitCommand.next) - 1);
        continue;
      }
    }
    if (active) {
      let result = inspect(i);
      if (result === !0)
        return !0;
      for (let cursor = i;cursor <= result; cursor++)
        if (stop(scanChar(text, cursor)))
          active = !1;
      i = result;
    }
    if (stopped)
      active = !1;
  }
  return !1;
}
function hasRestoreWithoutExclusion(text) {
  let candidate = !1;
  for (let i = 0;i < scanLength(text); i++) {
    if (isJsLineTerminator(scanChar(text, i))) {
      if (candidate)
        return !0;
      candidate = !1;
      continue;
    }
    if (!candidate) {
      let gitCommand = scanGitCommandAt(text, i, "restore");
      if (gitCommand) {
        candidate = gitCommand.commandEnd >= 0, i = Math.max(i, (candidate ? gitCommand.commandEnd : gitCommand.next) - 1);
        continue;
      }
    }
    if (candidate && scanChar(text, i) === "-" && scanChar(text, i + 1) === "-" && (fixedAt(text, i + 2, "staged") || fixedAt(text, i + 2, "help")))
      candidate = !1;
  }
  return candidate;
}
function hasFindDelete(text, interpreter) {
  let active = !1;
  for (let i = 0;i < scanLength(text); i++) {
    let char = scanChar(text, i), stopped = interpreter ? isJsLineTerminator(char) : isRawStop(char);
    if (active && isEcmaWhitespace(char) && scanChar(text, i + 1) === "-" && wordAt(text, i + 2, "delete"))
      return !0;
    if (stopped) {
      active = !1;
      continue;
    }
    if (wordAt(text, i, "find"))
      active = !0, i += 3;
  }
  return !1;
}
function tokenEnd(text, start, stop) {
  let end = start;
  while (end < scanLength(text) && !isEcmaWhitespace(scanChar(text, end)) && !stop(scanChar(text, end)))
    end++;
  return end;
}
function partialLongOptionEnd(text, start, prefix, optional) {
  if (!fixedAt(text, start, prefix))
    return -1;
  let end = start + prefix.length;
  for (let i = 0;i < optional.length && scanChar(text, end) === optional[i]; i++)
    end++;
  return hasWordBoundaryAfter(text, end) ? end : -1;
}
function isPartialLongOption(text, start, prefix, optional) {
  return partialLongOptionEnd(text, start, prefix, optional) >= 0;
}

// src/core/shell/command.ts
function normalizeCommandToken(token) {
  return getBasename(token).toLowerCase();
}
function getBasename(token) {
  return token.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? token;
}

// src/core/rules/policy/source-syntax.ts
var NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, RULEBOOK_FILE = "rulebook.json", RULES_DIR = ".cc-safety-net/rules";
var GITHUB_SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(.+)$/, GITHUB_REPOSITORY_SOURCE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/, GITHUB_REF_PATTERN = /^[A-Za-z0-9._-]+$/, RULES_DIR_RE = ".cc-safety-net/rules".replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), RULEBOOK_FILE_RE = "rulebook.json".replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), GITHUB_RULEBOOK_PATH_RE = new RegExp(`^${RULES_DIR_RE}/(${NAME_PATTERN.source.slice(1, -1)})/${RULEBOOK_FILE_RE}$`);
function getRepositoryRulebookPath(name) {
  return `.cc-safety-net/rules/${name}/rulebook.json`;
}
function getRulebookSourceSyntaxError(source) {
  if (isGitHubRulebookSource(source))
    try {
      return parseGitHubSource(source), null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  return NAME_PATTERN.test(source) ? null : `Local rulebook sources must be bare names matching ${NAME_PATTERN}: ${source}`;
}
function parseGitHubSource(spec) {
  if (spec.startsWith("github:"))
    throw Error(`Invalid rulebook source: ${spec}`);
  let match = spec.match(GITHUB_SOURCE_RE);
  if (!match?.[1] || !match[2] || !match[3])
    throw Error(`Invalid GitHub rulebook source: ${spec}`);
  let [ref, name, ...extraParts] = match[3].split("/");
  if (!ref || !GITHUB_REF_PATTERN.test(ref))
    throw Error(`GitHub rulebook refs must be a single path segment: ${spec}`);
  if (!name || extraParts.length > 0 || !NAME_PATTERN.test(name))
    throw Error(`GitHub rulebook sources must be owner/repo#ref/<rulebook-name>: ${spec}`);
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
  if (!NAME_PATTERN.test(source))
    throw Error(`Local rulebook sources must be bare names matching ${NAME_PATTERN}: ${source}`);
}

// src/domain/decision.ts
var BLOCK_INTENTS = Object.freeze([
  "hard_stop",
  "use_alternative",
  "scope_down",
  "manual_only",
  "stop_and_explain"
]);

// src/types.ts
var AUDIT_FAILURE_STAGES = Object.freeze([
  "policy-protection",
  "config-load",
  "config-state",
  "secret-protection",
  "non-command",
  "command-validation",
  "command-analysis"
]), AUDIT_ERROR_CODES = Object.freeze([
  "path-canonicalization-limit",
  "tool-input-limit",
  "structural-shell-syntax-limit",
  "unexpected-error"
]), AUDIT_LOG_DECISIONS = Object.freeze(["allow", "deny"]), MAX_RECURSION_DEPTH = 10, MAX_STRIP_ITERATIONS = 20, COMMAND_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/, MAX_REASON_LENGTH = 256, SHELL_WRAPPERS = /* @__PURE__ */ new Set(["bash", "sh", "zsh", "ksh", "dash", "fish", "csh", "tcsh"]), INTERPRETERS = /* @__PURE__ */ new Set(["python", "python3", "python2", "node", "ruby", "perl"]), PYTHON_INTERPRETER_PATTERN = /^python(?:[23](?:\.\d+)*)?$/;

// src/core/analyze/interpreters.ts
var REASON_INTERPRETER_DANGEROUS = "Interpreter code contains a dangerous command. Run the underlying command directly so it can be analyzed, or use the safer alternative for that command.", REASON_INTERPRETER_BLOCKED = "Interpreter one-liners are blocked by the active safety policy. Write the code to a script file and run it, or run the equivalent shell command directly.", CODE_FLAGS = /* @__PURE__ */ new Map([
  ["python", /* @__PURE__ */ new Set(["-c"])],
  ["node", /* @__PURE__ */ new Set(["-e", "--eval"])],
  ["ruby", /* @__PURE__ */ new Set(["-e"])],
  ["perl", /* @__PURE__ */ new Set(["-e", "-E"])]
]), NODE_PRINT_FLAGS = /* @__PURE__ */ new Set(["-p", "--print"]), CLUSTERED_CODE_FLAGS = /* @__PURE__ */ new Map([
  ["python", /* @__PURE__ */ new Set(["c"])],
  ["node", /* @__PURE__ */ new Set(["e"])],
  ["ruby", /* @__PURE__ */ new Set(["e"])],
  ["perl", /* @__PURE__ */ new Set(["e", "E"])]
]), SHORT_VALUE_FLAGS = /* @__PURE__ */ new Map([
  ["python", /* @__PURE__ */ new Set(["W", "X"])],
  ["node", /* @__PURE__ */ new Set(["C", "r"])],
  ["ruby", /* @__PURE__ */ new Set(["C", "E", "F", "I", "r"])],
  ["perl", /* @__PURE__ */ new Set(["F", "I", "M", "m"])]
]), ATTACHED_VALUE_FLAGS = /* @__PURE__ */ new Map([
  ["ruby", /* @__PURE__ */ new Set(["0", "K", "W", "x"])],
  ["perl", /* @__PURE__ */ new Set(["0", "C", "D", "V", "d", "i", "l", "x"])]
]), PROGRAM_FLAGS = /* @__PURE__ */ new Map([["python", /* @__PURE__ */ new Set(["m"])]]), LONG_VALUE_FLAGS = /* @__PURE__ */ new Map([
  [
    "node",
    /* @__PURE__ */ new Set([
      "--allow-fs-read",
      "--allow-fs-write",
      "--conditions",
      "--cpu-prof-dir",
      "--cpu-prof-interval",
      "--cpu-prof-name",
      "--debug-port",
      "--diagnostic-dir",
      "--disable-proto",
      "--disable-warning",
      "--dns-result-order",
      "--env-file",
      "--env-file-if-exists",
      "--experimental-loader",
      "--experimental-package-map",
      "--experimental-test-isolation",
      "--experimental-test-tag-filter",
      "--heap-prof-dir",
      "--heap-prof-interval",
      "--heap-prof-name",
      "--heapsnapshot-near-heap-limit",
      "--heapsnapshot-signal",
      "--icu-data-dir",
      "--import",
      "--input-type",
      "--inspect-port",
      "--inspect-publish-uid",
      "--loader",
      "--localstorage-file",
      "--max-http-header-size",
      "--max-old-space-size-percentage",
      "--network-family-autoselection-attempt-timeout",
      "--openssl-config",
      "--redirect-warnings",
      "--report-dir",
      "--report-directory",
      "--report-filename",
      "--report-signal",
      "--require",
      "--secure-heap",
      "--secure-heap-min",
      "--test-concurrency",
      "--test-coverage-branches",
      "--test-coverage-exclude",
      "--test-coverage-functions",
      "--test-coverage-include",
      "--test-coverage-lines",
      "--test-global-setup",
      "--test-isolation",
      "--test-name-pattern",
      "--test-random-seed",
      "--test-reporter",
      "--test-reporter-destination",
      "--test-rerun-failures",
      "--test-shard",
      "--test-skip-pattern",
      "--test-timeout",
      "--title",
      "--tls-cipher-list",
      "--tls-keylog",
      "--trace-event-categories",
      "--trace-event-file-pattern",
      "--trace-require-module",
      "--unhandled-rejections",
      "--use-largepages",
      "--v8-pool-size",
      "--watch-kill-signal"
    ])
  ],
  ["python", /* @__PURE__ */ new Set(["--check-hash-based-pycs"])],
  [
    "ruby",
    /* @__PURE__ */ new Set([
      "--backtrace-limit",
      "--crash-report",
      "--disable",
      "--enable",
      "--encoding",
      "--external-encoding",
      "--internal-encoding",
      "--parser"
    ])
  ]
]), PYTHON_HASH_PYC_MODES = /* @__PURE__ */ new Set(["always", "default", "never"]), RUBY_DASH_VALUE_FLAGS = /* @__PURE__ */ new Set([
  "--backtrace-limit",
  "--crash-report",
  "--disable",
  "--enable"
]), INTERPRETER_SHELL_CONTINUATION = /\\\r?\n|(?:\\\\|\\x5[cC]|\\u005[cC]|\\134)(?:\\n|\\x0[aA]|\\u000[aA]|\\012|\r?\n)/g, INTERPRETER_EXECUTABLE_SOURCE_SELECTORS = /* @__PURE__ */ new Map([
  [
    "python",
    [
      { selector: "-c", kind: "inline-code", valueForm: "attached-or-separate" },
      { selector: "-m", kind: "python-module", valueForm: "attached-or-separate" }
    ]
  ],
  [
    "node",
    [
      { selector: "-e", kind: "inline-code", valueForm: "separate-only" },
      { selector: "--eval", kind: "inline-code", valueForm: "equals-or-separate" },
      { selector: "-p", kind: "inline-code", valueForm: "separate-only" },
      { selector: "--print", kind: "inline-code", valueForm: "separate-only" },
      { selector: "-r", kind: "node-require", valueForm: "separate-only" },
      { selector: "--require", kind: "node-require", valueForm: "equals-or-separate" },
      { selector: "--import", kind: "node-import", valueForm: "equals-or-separate" },
      { selector: "--loader", kind: "node-loader", valueForm: "equals-or-separate" },
      {
        selector: "--experimental-loader",
        kind: "node-loader",
        valueForm: "equals-or-separate"
      }
    ]
  ],
  [
    "ruby",
    [
      { selector: "-e", kind: "inline-code", valueForm: "attached-or-separate" },
      { selector: "-r", kind: "ruby-require", valueForm: "attached-or-separate" }
    ]
  ],
  [
    "perl",
    [
      { selector: "-e", kind: "inline-code", valueForm: "attached-or-separate" },
      { selector: "-E", kind: "inline-code", valueForm: "attached-or-separate" },
      { selector: "-M", kind: "perl-module", valueForm: "attached-only" },
      { selector: "-m", kind: "perl-module", valueForm: "attached-only" }
    ]
  ]
]);
function extractInterpreterCodeArg(tokens) {
  return parseInterpreterArgv(tokens).code;
}
function extractInterpreterExecutableSources(tokens) {
  return parseInterpreterArgv(tokens).sources;
}
function getInterpreterExecutableSourceSelectors(command) {
  return INTERPRETER_EXECUTABLE_SOURCE_SELECTORS.get(normalizeInterpreter(command)) ?? [];
}
function parseInterpreterArgv(tokens) {
  let interpreter = normalizeInterpreter(tokens[0] ?? "");
  if (!CODE_FLAGS.has(interpreter))
    return { code: null, sources: [], optionsOpen: !1 };
  let codeArgs = [], sources = [], executableSourcesValid = !0;
  for (let i = 1;i < tokens.length; i++) {
    let token = tokens[i];
    if (token === void 0)
      break;
    if (token === "--")
      return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid, tokens[i + 1] === void 0 ? void 0 : i + 1, tokens[i + 1]);
    if (token === "" || token === "-" || !token.startsWith("-"))
      return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid, i, token);
    if (interpreter === "node" && NODE_PRINT_FLAGS.has(token)) {
      let code = tokens[i + 1];
      if (code === void 0)
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      if (code.startsWith("-"))
        continue;
      codeArgs.push({ tokenIndex: i + 1, value: code }), sources.push({ tokenIndex: i + 1, kind: "inline-code", value: code }), i++;
      continue;
    }
    if (isInterpreterCodeFlag(interpreter, token)) {
      let code = tokens[i + 1];
      if (code === void 0)
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      if (codeArgs.push({ tokenIndex: i + 1, value: code }), sources.push({ tokenIndex: i + 1, kind: "inline-code", value: code }), interpreter === "python")
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      i++;
      continue;
    }
    let inlineEval = /^--eval=(.*)$/s.exec(token);
    if (supportsInlineEval(interpreter) && inlineEval) {
      let code = inlineEval[1] ?? "";
      codeArgs.push({ tokenIndex: i, value: code }), sources.push({ tokenIndex: i, kind: "inline-code", value: code });
      continue;
    }
    if (interpreter === "node") {
      let loader = extractNodeLongLoader(token);
      if (loader) {
        if (loader.attached) {
          if (executableSourcesValid &&= loader.value !== "", loader.value !== "")
            sources.push({ tokenIndex: i, kind: loader.kind, value: loader.value });
          continue;
        }
        let value = tokens[i + 1];
        if (value === void 0 || value.startsWith("-"))
          return executableSourcesValid = !1, finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
        sources.push({ tokenIndex: i + 1, kind: loader.kind, value }), i++;
        continue;
      }
    }
    if (interpreter === "python" && token.startsWith("--check-hash-based-pycs=") || interpreter === "node" && (token === "--conditions=" || token === "--diagnostic-dir=" || token === "--title=") || interpreter === "ruby" && (token === "--disable=" || token === "--enable="))
      return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
    if (LONG_VALUE_FLAGS.get(interpreter)?.has(token)) {
      let value = tokens[i + 1];
      if (value === void 0 || value.startsWith("-") && !(interpreter === "ruby" && RUBY_DASH_VALUE_FLAGS.has(token)) || interpreter === "python" && !PYTHON_HASH_PYC_MODES.has(value))
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      i++;
      continue;
    }
    if (token.startsWith("--"))
      continue;
    let codeArg, consumesNext = !1;
    for (let optionIndex = 1;optionIndex < token.length; optionIndex++) {
      let option = token[optionIndex];
      if (option === void 0)
        break;
      if (PROGRAM_FLAGS.get(interpreter)?.has(option)) {
        let attached = token.slice(optionIndex + 1), value = attached || tokens[i + 1];
        if (value !== void 0)
          sources.push({
            tokenIndex: attached ? i : i + 1,
            kind: "python-module",
            value
          });
        return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
      }
      if (CLUSTERED_CODE_FLAGS.get(interpreter)?.has(option)) {
        codeArg = token.slice(optionIndex + 1) || tokens[i + 1], consumesNext = optionIndex + 1 === token.length;
        break;
      }
      if (interpreter === "node" && option === "r") {
        if (token === "-r") {
          let value = tokens[i + 1];
          if (executableSourcesValid &&= value !== void 0 && !value.startsWith("-"), executableSourcesValid && value !== void 0)
            sources.push({ tokenIndex: i + 1, kind: "node-require", value });
          i++;
        } else
          executableSourcesValid = !1;
        break;
      }
      if (interpreter === "ruby" && option === "r") {
        let attached = token.slice(optionIndex + 1), value = attached || tokens[i + 1];
        if (executableSourcesValid &&= value !== void 0, value !== void 0)
          sources.push({
            tokenIndex: attached ? i : i + 1,
            kind: "ruby-require",
            value
          });
        if (!attached)
          i++;
        break;
      }
      if (interpreter === "perl" && (option === "M" || option === "m")) {
        let value = token.slice(optionIndex + 1);
        if (value)
          sources.push({ tokenIndex: i, kind: "perl-module", value });
        else if (executableSourcesValid = !1, optionIndex + 1 === token.length)
          i++;
        break;
      }
      if (SHORT_VALUE_FLAGS.get(interpreter)?.has(option)) {
        if (optionIndex + 1 === token.length)
          i++;
        break;
      }
      if (ATTACHED_VALUE_FLAGS.get(interpreter)?.has(option) && optionIndex + 1 < token.length)
        break;
    }
    if (codeArg === void 0)
      continue;
    let tokenIndex = consumesNext ? i + 1 : i;
    if (codeArgs.push({ tokenIndex, value: codeArg }), sources.push({ tokenIndex, kind: "inline-code", value: codeArg }), interpreter === "python")
      return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid);
    if (consumesNext)
      i++;
  }
  return finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid, void 0, void 0, !0);
}
function finishInterpreterArgv(interpreter, codeArgs, sources, executableSourcesValid, mainScriptIndex, mainScript, optionsOpen = !1) {
  let effectiveCodeArgs = interpreter === "node" ? codeArgs.slice(-1) : codeArgs, effectiveCodeIndexes = new Set(effectiveCodeArgs.map((codeArg) => codeArg.tokenIndex)), executableSources = sources.filter((source) => source.kind !== "inline-code" || effectiveCodeIndexes.has(source.tokenIndex));
  if (executableSourcesValid && codeArgs.length === 0 && mainScriptIndex !== void 0 && mainScript !== void 0)
    executableSources.push({
      tokenIndex: mainScriptIndex,
      kind: "main-script",
      value: mainScript
    });
  return {
    code: (interpreter === "node" ? effectiveCodeArgs[0]?.value : effectiveCodeArgs.map((codeArg) => codeArg.value).join(`
`)) || null,
    sources: executableSourcesValid ? executableSources : [],
    optionsOpen: executableSourcesValid && optionsOpen
  };
}
function extractNodeLongLoader(token) {
  for (let [option, kind] of [
    ["--import", "node-import"],
    ["--loader", "node-loader"],
    ["--experimental-loader", "node-loader"],
    ["--require", "node-require"]
  ]) {
    if (token === option)
      return { attached: !1, kind, value: "" };
    if (token.startsWith(`${option}=`))
      return { attached: !0, kind, value: token.slice(option.length + 1) };
  }
  return;
}
function isInterpreterCommand(command) {
  return CODE_FLAGS.has(normalizeInterpreter(command));
}
function isInterpreterDisplayOnly(command, code) {
  return normalizeInterpreter(command) === "node" && /^\s*console\.(?:log|info|warn|error)\(\s*(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')\s*\)\s*;?\s*$/.test(code);
}
function normalizeInterpreter(command) {
  let interpreter = getBasename(command).toLowerCase();
  return PYTHON_INTERPRETER_PATTERN.test(interpreter) ? "python" : interpreter;
}
function isInterpreterCodeFlag(interpreter, token) {
  return CODE_FLAGS.get(interpreter)?.has(token) ?? !1;
}
function supportsInlineEval(interpreter) {
  return CODE_FLAGS.get(interpreter)?.has("--eval") ?? !1;
}
function containsDangerousCode(code, scanWork) {
  let executableCode = collapseInterpreterShellContinuations(code, scanWork);
  if (hasLinearInterpreterDanger(executableCode, "rm", scanWork))
    return !0;
  for (let pattern of [
    /\bgit[^\S\n]+reset[^\S\n]+--ha(?:r(?:d)?)?\b/,
    /\bgit[^\S\n]+reset[^\S\n]+--me(?:r(?:g(?:e)?)?)?\b/,
    /\bgit[^\S\n]+checkout[^\S\n]+--[^\S\n]/,
    /\bgit[^\S\n]+clean[^\S\n]+(-[^\s]*f[^\s]*|--fo(?:r(?:c(?:e)?)?)?)\b/,
    /\bgit[^\S\n]+stash[^\S\n]+(drop|clear)\b/
  ])
    if (chargeNativeLinearPass(scanWork, executableCode), pattern.test(executableCode))
      return !0;
  if (hasLinearInterpreterDanger(executableCode, "dd", scanWork))
    return !0;
  for (let pattern of [/\bmkfs(?:\.[A-Za-z0-9_-]+)?\s+\/dev\/[^\s'"]+/, /\bshred\b\s+/])
    if (chargeNativeLinearPass(scanWork, executableCode), pattern.test(executableCode))
      return !0;
  if (hasLinearInterpreterDanger(executableCode, "find", scanWork))
    return !0;
  let lines = executableCode.split(/[\n\r\u2028\u2029]/);
  return [
    "reset-hard",
    "reset-merge",
    "clean",
    "checkout",
    "push-force",
    "push-refspec",
    "push-delete",
    "branch",
    "tag",
    "restore"
  ].some((kind) => {
    return chargeNativeLinearPass(scanWork, executableCode), lines.some((line) => hasLinearDangerousText(line, kind));
  });
}
function collapseInterpreterShellContinuations(code, scanWork) {
  return chargeNativeLinearPass(scanWork, code), code.replace(INTERPRETER_SHELL_CONTINUATION, "");
}
// src/core/shell/options.ts
function extractShortOpts(tokens, options) {
  let opts = /* @__PURE__ */ new Set, pastDoubleDash = !1;
  for (let token of tokens) {
    if (token === "--") {
      pastDoubleDash = !0;
      continue;
    }
    if (pastDoubleDash)
      continue;
    if (token.startsWith("-") && !token.startsWith("--") && token.length > 1)
      for (let i = 1;i < token.length; i++) {
        let char = token[i];
        if (!char || !/[a-zA-Z]/.test(char))
          break;
        let shortOpt = `-${char}`;
        if (opts.add(shortOpt), options?.shortOptsWithValue?.has(shortOpt))
          break;
      }
  }
  return opts;
}
// src/core/shell/script-command.ts
var SHORT_VALUE_OPTIONS = /* @__PURE__ */ new Map([
  ["bash", /* @__PURE__ */ new Set(["O", "o"])],
  ["dash", /* @__PURE__ */ new Set(["o"])],
  ["ksh", /* @__PURE__ */ new Set(["o"])],
  ["sh", /* @__PURE__ */ new Set(["o"])],
  ["zsh", /* @__PURE__ */ new Set(["o"])]
]), ATTACHED_SHORT_VALUE_OPTIONS = /* @__PURE__ */ new Map([["zsh", /* @__PURE__ */ new Set(["o"])]]), LONG_VALUE_OPTIONS = /* @__PURE__ */ new Map([["bash", /* @__PURE__ */ new Set(["--init-file", "--rcfile"])]]);
function getShellCommandString(command, args) {
  for (let index = 0;index < args.length; index++) {
    let token = args[index];
    if (token === void 0 || token === "--" || token === "-" || token[0] !== "-" && token[0] !== "+")
      return null;
    if (token.startsWith("--")) {
      let longValueOptions = LONG_VALUE_OPTIONS.get(command);
      if (hasAttachedLongValue(token, longValueOptions))
        continue;
      if (!longValueOptions?.has(token))
        continue;
      if (args[index + 1] === void 0)
        return null;
      index++;
      continue;
    }
    let shortOptions = parseShortOptions(command, token);
    if (shortOptions.commandSelected)
      return args[index + shortOptions.followingValues + 1] ?? null;
    let next = args[index + 1];
    if (command === "ksh" && (token === "-o" || token === "+o") && next !== void 0 && next[0] !== "-" && next[0] !== "+")
      index++;
    index += shortOptions.followingValues;
  }
  return null;
}
function parseShortOptions(command, token) {
  let valueOptions = SHORT_VALUE_OPTIONS.get(command), attachedValueOptions = ATTACHED_SHORT_VALUE_OPTIONS.get(command), commandSelected = !1, followingValues = 0;
  for (let index = 1;index < token.length; index++) {
    let option = token[index];
    if (option === void 0)
      break;
    if (token[0] === "-" && option === "c")
      commandSelected = !0;
    if (command === "ksh" && option === "o") {
      if (index + 1 < token.length) {
        let optionName = token.slice(index + 1);
        if (!commandSelected && token[0] === "-" && optionName === "c")
          continue;
        if (!commandSelected && token[0] === "-" && optionName[0] === "-" && optionName.endsWith("c"))
          commandSelected = !0;
        break;
      }
      if (commandSelected)
        followingValues++;
      continue;
    }
    if (!valueOptions?.has(option))
      continue;
    if (attachedValueOptions?.has(option) && index + 1 < token.length)
      break;
    followingValues++;
  }
  return { commandSelected, followingValues };
}
function hasAttachedLongValue(token, options) {
  return options !== void 0 && [...options].some((option) => token.startsWith(`${option}=`));
}
// src/core/shell/wrappers.ts
import { realpathSync as realpathSync5 } from "node:fs";
import { isAbsolute as isAbsolute5, parse as parsePath2 } from "node:path";
var ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/, ENV_SPLIT_VARIABLE_RE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}/, MAX_ENV_SPLIT_EXPANDED_LENGTH = 131072, MAX_ENV_SPLIT_TOKENS = 16384;
function parseEnvAssignment(token) {
  if (!ENV_ASSIGNMENT_RE.test(token))
    return null;
  let eqIdx = token.indexOf("=");
  return { name: token.slice(0, eqIdx), value: token.slice(eqIdx + 1) };
}
function stripEnvAssignmentsWithInfo(tokens) {
  let envAssignments = /* @__PURE__ */ new Map, i = 0;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      break;
    let assignment = parseEnvAssignment(token);
    if (!assignment)
      break;
    envAssignments.set(assignment.name, assignment.value), i++;
  }
  return { tokens: tokens.slice(i), envAssignments };
}
function stripWrappers(tokens, cwd) {
  return stripWrappersWithInfo(tokens, cwd).tokens;
}
function stripWrappersWithInfo(tokens, cwd, inheritedEnvAssignments) {
  let result = [...tokens], allEnvAssignments = /* @__PURE__ */ new Map, effectiveEnvAssignments = new Map(inheritedEnvAssignments ?? []), currentCwd = cwd;
  for (let iteration = 0;iteration < MAX_STRIP_ITERATIONS; iteration++) {
    let before = result.join(" "), { tokens: strippedTokens, envAssignments } = stripEnvAssignmentsWithInfo(result);
    for (let [k, v] of envAssignments)
      allEnvAssignments.set(k, v), effectiveEnvAssignments.set(k, v);
    if (result = strippedTokens, result.length === 0)
      break;
    while (result.length > 0 && result[0]?.includes("=") && !ENV_ASSIGNMENT_RE.test(result[0] ?? "")) {
      let appendAssignment = parseTmpdirAppendEnvAssignment(result[0] ?? "", effectiveEnvAssignments) ?? parseGitContextAppendEnvAssignment(result[0] ?? "", effectiveEnvAssignments);
      if (appendAssignment)
        allEnvAssignments.set(appendAssignment.name, appendAssignment.value), effectiveEnvAssignments.set(appendAssignment.name, appendAssignment.value);
      result = result.slice(1);
    }
    if (result.length === 0)
      break;
    let head = result[0]?.toLowerCase();
    if (head !== "sudo" && head !== "env" && head !== "command" && head !== "builtin")
      break;
    if (head === "sudo") {
      let sudoResult = stripSudoWithInfo(result, currentCwd);
      if (result = sudoResult.tokens, sudoResult.cwd !== void 0)
        currentCwd = sudoResult.cwd;
    }
    if (head === "env") {
      let envResult = stripEnvWithInfo(result, currentCwd, effectiveEnvAssignments);
      if (envResult.unverifiableEnvSplit)
        return {
          tokens: result,
          envAssignments: allEnvAssignments,
          cwd: currentCwd,
          unverifiableEnvSplit: !0
        };
      if (result = envResult.tokens, envResult.cwd !== void 0)
        currentCwd = envResult.cwd;
      for (let [k, v] of envResult.envAssignments)
        allEnvAssignments.set(k, v), effectiveEnvAssignments.set(k, v);
    }
    if (head === "command")
      result = stripCommand(result);
    if (head === "builtin")
      result = result.slice(result[1] === "--" ? 2 : 1);
    if (result.join(" ") === before)
      break;
  }
  let { tokens: finalTokens, envAssignments: finalAssignments } = stripEnvAssignmentsWithInfo(result);
  for (let [k, v] of finalAssignments)
    allEnvAssignments.set(k, v), effectiveEnvAssignments.set(k, v);
  return { tokens: finalTokens, envAssignments: allEnvAssignments, cwd: currentCwd };
}
function parseTmpdirAppendEnvAssignment(token, envAssignments) {
  if (!token.startsWith("TMPDIR+="))
    return null;
  return {
    name: "TMPDIR",
    value: `${envAssignments.get("TMPDIR") ?? process.env.TMPDIR ?? ""}${token.slice(8)}`
  };
}
var SUDO_OPTS_WITH_VALUE = /* @__PURE__ */ new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-T", "-U"]);
function stripSudoWithInfo(tokens, cwd) {
  let i = 1, currentCwd = cwd;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      break;
    if (token === "--")
      return { tokens: tokens.slice(i + 1), cwd: currentCwd };
    if (!token.startsWith("-"))
      break;
    if (token === "-D" || token === "--chdir") {
      let target = tokens[i + 1];
      currentCwd = target ? resolveWrapperCwd(currentCwd, target) : null, i += 2;
      continue;
    }
    if (token.startsWith("--chdir=")) {
      currentCwd = resolveWrapperCwd(currentCwd, token.slice(8)), i++;
      continue;
    }
    if (token.startsWith("-D") && token.length > 2) {
      currentCwd = resolveWrapperCwd(currentCwd, token.slice(2)), i++;
      continue;
    }
    if (token === "-i" || token === "--login") {
      currentCwd = null, i++;
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
var ENV_OPTS_NO_VALUE = /* @__PURE__ */ new Set(["-i", "-0", "--null"]), ENV_OPTS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-u",
  "--unset",
  "-C",
  "--chdir",
  "-S",
  "--split-string",
  "-P"
]);
function stripEnvWithInfo(tokens, cwd, inheritedEnvAssignments) {
  let envAssignments = /* @__PURE__ */ new Map, currentCwd = cwd, expandedTokens = tokens, unsetEnvNames = /* @__PURE__ */ new Set, i = 1;
  while (i < expandedTokens.length) {
    let token = expandedTokens[i];
    if (!token)
      break;
    if (token === "--")
      return { tokens: expandedTokens.slice(i + 1), envAssignments, cwd: currentCwd };
    if (token === "-i" || token === "--ignore-environment" || token === "-") {
      envAssignments.clear();
      for (let name of inheritedEnvAssignments.keys())
        envAssignments.set(name, "");
      envAssignments.set("TMPDIR", ""), i++;
      continue;
    }
    if (ENV_OPTS_NO_VALUE.has(token)) {
      i++;
      continue;
    }
    if (token === "-u" || token === "--unset") {
      let name = expandedTokens[i + 1];
      if (name !== void 0)
        unsetEnvNames.add(name), envAssignments.set(name, "");
      i += 2;
      continue;
    }
    if (token.startsWith("-u") && token.length > 2 && !token.startsWith("-u=")) {
      let name = token.slice(2);
      unsetEnvNames.add(name), envAssignments.set(name, ""), i++;
      continue;
    }
    if (token.startsWith("--unset=")) {
      let name = token.slice(8);
      unsetEnvNames.add(name), envAssignments.set(name, ""), i++;
      continue;
    }
    let splitString = token === "-S" || token === "--split-string" ? { value: expandedTokens[i + 1], consumed: 2 } : token.startsWith("-S") && token.length > 2 ? { value: token.slice(2), consumed: 1 } : token.startsWith("--split-string=") ? { value: token.slice(15), consumed: 1 } : null;
    if (splitString) {
      let applied = applyEnvSplitStringOption(expandedTokens, i, splitString.value, splitString.consumed, inheritedEnvAssignments, unsetEnvNames, currentCwd);
      if (applied.done)
        return applied.result;
      expandedTokens = applied.expandedTokens, currentCwd = applied.currentCwd, i = applied.nextIndex;
      continue;
    }
    if (ENV_OPTS_WITH_VALUE.has(token)) {
      if (token === "-C" || token === "--chdir") {
        let target = expandedTokens[i + 1];
        currentCwd = target ? resolveWrapperCwd(currentCwd, target) : null;
      }
      i += 2;
      continue;
    }
    if (token.startsWith("-u=")) {
      i++;
      continue;
    }
    if (token.startsWith("-C") && token.length > 2 || token.startsWith("--chdir=")) {
      let target = token.startsWith("--chdir=") ? token.slice(8) : token.startsWith("-C=") ? token.slice(3) : token.slice(2);
      currentCwd = resolveWrapperCwd(currentCwd, target), i++;
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
    if (!parseEnvAssignment(token))
      break;
    while (i < expandedTokens.length) {
      let nextAssignment = parseEnvAssignment(expandedTokens[i] ?? "");
      if (!nextAssignment)
        break;
      envAssignments.set(nextAssignment.name, nextAssignment.value), i++;
    }
    if (expandedTokens[i] === "--")
      i++;
    return { tokens: expandedTokens.slice(i), envAssignments, cwd: currentCwd };
  }
  return { tokens: expandedTokens.slice(i), envAssignments, cwd: currentCwd };
}
function applyEnvSplitStringOption(expandedTokens, index, value, consumed, inheritedEnvAssignments, unsetEnvNames, currentCwd) {
  let splitResult = value !== void 0 ? parseEnvSplitString(value, inheritedEnvAssignments, unsetEnvNames) : { tokens: null, unverifiableEnvSplit: !1 };
  if (splitResult.unverifiableEnvSplit)
    return {
      done: !0,
      result: {
        tokens: expandedTokens,
        envAssignments: /* @__PURE__ */ new Map,
        cwd: currentCwd,
        unverifiableEnvSplit: !0
      }
    };
  if (!splitResult.tokens)
    return {
      done: !1,
      expandedTokens,
      currentCwd: null,
      nextIndex: index + consumed
    };
  return {
    done: !1,
    expandedTokens: replaceEnvSplitTokens(expandedTokens, index, consumed, splitResult.tokens),
    currentCwd,
    nextIndex: index
  };
}
function parseEnvSplitString(value, envAssignments, unsetEnvNames) {
  if (value.length > MAX_ENV_SPLIT_EXPANDED_LENGTH)
    return { tokens: null, unverifiableEnvSplit: !0 };
  let splitResult = splitEnvString(value, (name) => {
    if (unsetEnvNames.has(name))
      return "";
    if (envAssignments.has(name))
      return envAssignments.get(name) ?? "";
    return Object.hasOwn(process.env, name) ? process.env[name] ?? "" : "";
  });
  return {
    tokens: splitResult.tokens,
    unverifiableEnvSplit: splitResult.limited
  };
}
function splitEnvString(value, resolveVariable) {
  let tokens = [], parts = [], totalLength = 0, tokenStarted = !1, singleQuoted = !1, doubleQuoted = !1, limited = !1, append = (text) => {
    if (totalLength + text.length > MAX_ENV_SPLIT_EXPANDED_LENGTH)
      return limited = !0, !1;
    return parts.push(text), totalLength += text.length, tokenStarted = !0, !0;
  }, flush = () => {
    if (!tokenStarted)
      return !0;
    if (tokens.length >= MAX_ENV_SPLIT_TOKENS)
      return limited = !0, !1;
    return tokens.push(parts.join("")), parts = [], tokenStarted = !1, !0;
  };
  for (let index = 0;index < value.length; index++) {
    let char = value[index] ?? "";
    if (char === "'" && !doubleQuoted) {
      singleQuoted = !singleQuoted, tokenStarted = !0;
      continue;
    }
    if (char === '"' && !singleQuoted) {
      doubleQuoted = !doubleQuoted, tokenStarted = !0;
      continue;
    }
    if (!singleQuoted && !doubleQuoted && isEnvSplitWhitespace(char)) {
      if (!flush())
        return { tokens: null, limited };
      continue;
    }
    if (!singleQuoted && !doubleQuoted && char === "#" && !tokenStarted)
      break;
    if (char === "$" && !singleQuoted) {
      let match = value.slice(index).match(ENV_SPLIT_VARIABLE_RE);
      if (!match?.[1] || !append(resolveVariable(match[1])))
        return { tokens: null, limited };
      index += match[0].length - 1;
      continue;
    }
    if (char !== "\\") {
      if (!append(char))
        return { tokens: null, limited };
      continue;
    }
    let escaped = value[index + 1];
    if (escaped === void 0)
      return { tokens: null, limited };
    if (singleQuoted && escaped !== "'" && escaped !== "\\") {
      if (!append("\\"))
        return { tokens: null, limited };
      continue;
    }
    if (escaped === "c") {
      if (doubleQuoted)
        return { tokens: null, limited };
      break;
    }
    if (escaped === "_" && !singleQuoted && !doubleQuoted) {
      if (!flush())
        return { tokens: null, limited };
      index++;
      continue;
    }
    let replacement = getEnvSplitEscape(escaped);
    if (replacement === void 0 || !append(replacement))
      return { tokens: null, limited };
    index++;
  }
  if (singleQuoted || doubleQuoted || !flush())
    return { tokens: null, limited };
  return { tokens, limited: !1 };
}
function getEnvSplitEscape(escaped) {
  if (escaped === "f")
    return "\f";
  if (escaped === "n")
    return `
`;
  if (escaped === "r")
    return "\r";
  if (escaped === "t")
    return "\t";
  if (escaped === "v")
    return "\v";
  if (escaped === "_")
    return " ";
  if (escaped === "#" || escaped === "$" || escaped === '"' || escaped === "'")
    return escaped;
  if (escaped === "\\")
    return "\\";
  return;
}
function isEnvSplitWhitespace(char) {
  return char === " " || char === "\t" || char === `
` || char === "\r" || char === "\f" || char === "\v";
}
function replaceEnvSplitTokens(tokens, index, consumed, splitTokens) {
  return [...tokens.slice(0, index), ...splitTokens, ...tokens.slice(index + consumed)];
}
function resolveWrapperCwd(cwd, target) {
  if (target === "")
    return null;
  try {
    if (!cwd && !isAbsolute5(target))
      return null;
    let baseCwd = isAbsolute5(target) ? getPathRoot2(target) : realpathSync5(cwd ?? "/");
    return resolveChdirTarget(baseCwd, target);
  } catch {
    return null;
  }
}
function getPathRoot2(target) {
  return parsePath2(target).root;
}
function stripCommand(tokens) {
  if (tokens[1] === "-v")
    return ["type", ...tokens.slice(2)];
  let i = 1;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      break;
    if (token === "-p" || token === "-v" || token === "-V") {
      i++;
      continue;
    }
    if (token === "--")
      return tokens.slice(i + 1);
    if (token.startsWith("-") && !token.startsWith("--") && token.length > 1) {
      let chars = token.slice(1);
      if (!/^[pvV]+$/.test(chars))
        break;
      i++;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}
// src/core/analyze/transparent-wrappers.ts
var BUILTIN_ANALYZED_COMMANDS = /* @__PURE__ */ new Set(["rm", "find", "xargs", "parallel"]), STANDARD_COMMAND_WRAPPERS = /* @__PURE__ */ new Set(["sudo", "env", "command", "builtin"]), RESERVED_TRANSPARENT_WRAPPERS = /* @__PURE__ */ new Set([
  "git",
  "busybox",
  ...BUILTIN_ANALYZED_COMMANDS,
  ...SHELL_WRAPPERS,
  ...INTERPRETERS,
  ...AWK_INTERPRETERS
]);
function unwrapTransparentWrapper(tokens, policy) {
  let head = tokens[0];
  if (!head || !policy.transparentWrappers.includes(getBasename(head)))
    return null;
  let wrapper = getBasename(head), startIndex = tokens[1] === "--" ? 2 : 1, childIndices = findChildIndices(tokens, startIndex, wrapper, policy), childIndex = childIndices[0];
  if (childIndex === void 0)
    return null;
  return {
    wrapper,
    tokens: [...tokens.slice(childIndex)],
    childIndex,
    alternativeChildIndices: childIndices.slice(1)
  };
}
function findChildIndices(tokens, startIndex, wrapper, policy) {
  let explicitChild = tokens[1] === "--", childIndices = [];
  for (let index = startIndex;index < tokens.length; index++) {
    let child = tokens[index];
    if (!child)
      continue;
    if (getBasename(child) !== wrapper && isProtectableCommand(child, policy))
      childIndices.push(index);
    else if (DISPLAY_COMMANDS.has(normalizeCommandToken(child)))
      break;
    if (explicitChild)
      break;
  }
  return childIndices;
}
function isProtectableCommand(token, policy) {
  let basename3 = getBasename(token), normalized = normalizeCommandToken(token);
  return normalized === "git" || basename3 === "busybox" || isStandardCommandWrapper(token) || BUILTIN_ANALYZED_COMMANDS.has(basename3) || policy.transparentWrappers.includes(basename3) || SHELL_WRAPPERS.has(normalized) || token === "$SHELL" || isInterpreterCommand(normalized) || AWK_INTERPRETERS.has(normalized) || policy.rules.some((rule) => rule.command === basename3);
}
function isStandardCommandWrapper(token) {
  return STANDARD_COMMAND_WRAPPERS.has(token.toLowerCase());
}
function isReservedTransparentWrapper(command2) {
  let normalized = normalizeCommandToken(command2);
  return RESERVED_TRANSPARENT_WRAPPERS.has(normalized) || isInterpreterCommand(normalized);
}

// src/core/rules/policy/resource-limits.ts
var RULE_SOURCE_LIMIT = 64, RULE_SOURCE_LIMIT_ERROR = "Rule config exceeds CC Safety Net's safe source limit.";
var RULE_SYNC_RESOURCE_LIMITS = Object.freeze({
  maxSources: 64,
  concurrency: 4,
  maxRequests: 131,
  maxResponseBytes: 67108864
});
function createRuleSyncResourceBudget(limits = {}) {
  return {
    requests: 0,
    responseBytes: 0,
    maxRequests: limits.maxRequests ?? RULE_SYNC_RESOURCE_LIMITS.maxRequests,
    maxResponseBytes: limits.maxResponseBytes ?? RULE_SYNC_RESOURCE_LIMITS.maxResponseBytes
  };
}
function createRuleSyncOperation(resolveUrl) {
  return {
    controller: new AbortController,
    budget: createRuleSyncResourceBudget(),
    resolveUrl
  };
}
function reserveGitHubRequest(budget) {
  if (budget.requests >= budget.maxRequests)
    throw Error("Rule synchronization exceeds CC Safety Net's safe resource limits.");
  budget.requests++;
}
function reserveGitHubResponseBytes(budget, bytes) {
  if (bytes > budget.maxResponseBytes - budget.responseBytes)
    throw budget.responseBytes += bytes, Error("Rule synchronization exceeds CC Safety Net's safe resource limits.");
  budget.responseBytes += bytes;
}

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
], SECRET_ENV_VARIANT_RULE = {
  id: "secret.pattern.env-variant",
  category: "Pattern",
  label: ".env.*",
  description: "Blocks environment-specific .env variants."
}, SECRET_HOME_PATH_CONFIG_VARIANT_SUFFIXES = [
  ".bak",
  ".backup",
  ".copy",
  ".disabled",
  ".old",
  ".orig",
  ".save",
  ".tmp"
], SECRET_HOME_PATH_CONFIG_VARIANT_BASES = [
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
], SECRET_HOME_PATH_RULES = [
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
], SECRET_CODING_CLI_RULES = [
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
], SECRET_DIRECTORY_RULES = [
  {
    id: "secret.dir.secrets",
    category: "Directory",
    label: "secrets/",
    description: "Blocks paths inside directories named secrets.",
    basename: "secrets"
  }
], SECRET_VARIANT_PREFIXES = [
  { prefix: "id_rsa", slug: "id-rsa", label: "id_rsa" },
  { prefix: "id_dsa", slug: "id-dsa", label: "id_dsa" },
  { prefix: "id_ed25519", slug: "id-ed25519", label: "id_ed25519" },
  { prefix: "id_ecdsa", slug: "id-ecdsa", label: "id_ecdsa" },
  { prefix: "credentials", slug: "credentials", label: "credentials" }
], SECRET_DOT_VARIANT_SUFFIXES = [
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
], SECRET_VARIANT_SEPARATOR_RULES = SECRET_VARIANT_PREFIXES.map((rule) => ({
  id: `secret.variant.${rule.slug}.separator`,
  category: "Variant",
  label: `${rule.label}-* / ${rule.label}_*`,
  description: `Blocks ${rule.label} variants with dash or underscore suffixes.`,
  prefix: rule.prefix
})), SECRET_VARIANT_DOT_SUFFIX_RULES = SECRET_VARIANT_PREFIXES.flatMap((rule) => SECRET_DOT_VARIANT_SUFFIXES.map((suffix) => ({
  id: `secret.variant.${rule.slug}.${suffix.slice(1)}`,
  category: "Variant",
  label: `${rule.label}${suffix}`,
  description: `Blocks ${rule.label}${suffix} private credential variants.`,
  prefix: rule.prefix,
  suffix
}))), SECRET_BROAD_SSH_KEY_BASENAME_RULE = {
  id: "secret.pattern.ssh-key-basename",
  category: "Pattern",
  label: "*_(rsa|dsa|ed25519|ecdsa)",
  description: "Blocks extensionless SSH private key-like basenames.",
  pattern: /^.*_(rsa|dsa|ed25519|ecdsa)$/
}, SECRET_EXTENSION_RULES = [
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
})), SECRET_EXTENSION_PATTERN_RULES = [
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
], SECRET_PROTECTION_RULE_METADATA = [
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
})), SECRET_PROTECTION_RULE_IDS = SECRET_PROTECTION_RULE_METADATA.map((rule) => rule.id), SECRET_PROTECTION_RULE_ID_SET = new Set(SECRET_PROTECTION_RULE_IDS);

// src/config/schema.ts
var require2 = createRequire(import.meta.url), schemas, OVER_LIMIT_RULE_SOURCES = Array(RULE_SOURCE_LIMIT + 1).fill("over-limit");
function preflightRulesConfig(config) {
  if (!isRecord(config) || !Array.isArray(config.rules) || config.rules.length <= RULE_SOURCE_LIMIT)
    return config;
  return {
    $schema: config.$schema,
    version: config.version,
    rules: OVER_LIMIT_RULE_SOURCES,
    overrides: config.overrides,
    transparent_wrappers: config.transparent_wrappers
  };
}
function createSchemas() {
  let z = require2("zod"), BlockIntentSchema = z.enum(BLOCK_INTENTS), RuleOverrideSchema = z.union([
    z.literal("off"),
    z.looseObject({
      reason: z.string().min(1).max(MAX_REASON_LENGTH).describe("Replacement block reason"),
      intent: BlockIntentSchema.optional()
    })
  ]).describe("Disable a rule or replace its block reason and intent."), RuleSourceSchema = z.string().min(1), RuleOverrideKeySchema = z.string().regex(/^[^/]+\/[^/]+$/), TransparentWrapperSchema = z.string().regex(COMMAND_PATTERN).describe("Command name such as 'git', 'docker', or 'rtk'."), RulesConfigObjectSchema = z.looseObject({
    $schema: z.unknown().optional().describe("JSON Schema reference for IDE support"),
    version: z.literal(1).describe("Schema version (must be 1)"),
    rules: z.array(RuleSourceSchema).max(RULE_SOURCE_LIMIT, RULE_SOURCE_LIMIT_ERROR).default([]).describe("Rulebook source strings such as project-rules or owner/repo#main/team-rules"),
    overrides: z.record(RuleOverrideKeySchema, RuleOverrideSchema).default({}).describe("Rule overrides by id"),
    transparent_wrappers: z.array(TransparentWrapperSchema).default([]).describe("Commands that transparently execute a visible protected child command")
  }).superRefine((config, context) => {
    if (config.rules.length <= RULE_SOURCE_LIMIT) {
      let sources = /* @__PURE__ */ new Set;
      for (let index = 0;index < config.rules.length; index++) {
        let source = config.rules[index], sourceError = getRulebookSourceSyntaxError(source);
        if (sourceError) {
          context.addIssue({ code: "custom", message: sourceError, path: ["rules", index] });
          continue;
        }
        if (sources.has(source)) {
          context.addIssue({
            code: "custom",
            message: `duplicate rulebook source "${source}"`,
            path: ["rules", index]
          });
          continue;
        }
        sources.add(source);
      }
    }
    let wrappers2 = /* @__PURE__ */ new Set;
    for (let index = 0;index < config.transparent_wrappers.length; index++) {
      let wrapper = config.transparent_wrappers[index];
      if (wrappers2.has(wrapper)) {
        context.addIssue({
          code: "custom",
          message: `duplicate command "${wrapper}"`,
          path: ["transparent_wrappers", index]
        });
        continue;
      }
      if (isReservedTransparentWrapper(wrapper)) {
        context.addIssue({
          code: "custom",
          message: `reserved command "${wrapper}" cannot be a wrapper`,
          path: ["transparent_wrappers", index]
        });
        continue;
      }
      wrappers2.add(wrapper);
    }
  }), RulesConfigSchema = z.preprocess(preflightRulesConfig, RulesConfigObjectSchema), SafetyOverridesSchema = z.strictObject({
    fail_closed: z.boolean().optional(),
    paranoid_rm: z.boolean().optional(),
    paranoid_interpreters: z.boolean().optional()
  }), DestructiveCommandOverridesSchema = z.record(z.string(), z.enum(["on", "off"])), OffOverridesSchema = z.record(z.string(), z.literal("off")), UserPolicySchema = z.strictObject({
    version: z.literal(1),
    safety: z.strictObject({
      level: z.enum(["standard", "strict", "paranoid"]).optional(),
      overrides: SafetyOverridesSchema.optional()
    }).optional(),
    workflow: z.strictObject({ worktree_mode: z.boolean().optional() }).optional(),
    destructive_command_protection: z.strictObject({
      enabled: z.boolean().optional(),
      overrides: DestructiveCommandOverridesSchema.optional()
    }).optional(),
    secret_protection: z.strictObject({
      enabled: z.boolean().optional(),
      overrides: OffOverridesSchema.optional(),
      deny_paths: z.array(z.string().refine((path) => path.trim().length > 0)).optional()
    }).optional()
  }).superRefine((policy, context) => {
    for (let id of Object.keys(policy.destructive_command_protection?.overrides ?? {}))
      if (!DESTRUCTIVE_COMMAND_RULE_ID_SET.has(id))
        context.addIssue({
          code: "custom",
          message: `unknown destructive command rule id "${id}"`,
          path: ["destructive_command_protection", "overrides", id]
        });
    for (let id of Object.keys(policy.secret_protection?.overrides ?? {}))
      if (!SECRET_PROTECTION_RULE_ID_SET.has(id))
        context.addIssue({
          code: "custom",
          message: `unknown secret protection rule id "${id}"`,
          path: ["secret_protection", "overrides", id]
        });
  });
  return { RulesConfigSchema, RuleOverrideSchema, UserPolicySchema };
}
function getSchemas() {
  return schemas ??= createSchemas(), schemas;
}
function getRulesConfigSchema() {
  return getSchemas().RulesConfigSchema;
}
function getUserPolicySchema() {
  return getSchemas().UserPolicySchema;
}
function getRulesConfigValidation(config) {
  let errors = [], sources = /* @__PURE__ */ new Set;
  if (!isRecord(config))
    return { errors: ["Config must be an object"], sources };
  if (config.version !== 1)
    errors.push("version must be 1");
  if (config.rules !== void 0)
    if (!Array.isArray(config.rules))
      errors.push("rules must be an array of rulebook source strings");
    else if (config.rules.length > RULE_SOURCE_LIMIT)
      errors.push(RULE_SOURCE_LIMIT_ERROR);
    else
      for (let index = 0;index < config.rules.length; index++) {
        let source = config.rules[index];
        if (typeof source !== "string") {
          errors.push(`rules[${index}]: must be a rulebook source string`);
          continue;
        }
        if (source.trim() === "") {
          errors.push(`rules[${index}]: must be a non-empty rulebook source string`);
          continue;
        }
        if (sources.has(source)) {
          errors.push(`rules[${index}]: duplicate rulebook source "${source}"`);
          continue;
        }
        let sourceError = getRulebookSourceSyntaxError(source);
        if (sourceError) {
          errors.push(`rules[${index}]: ${sourceError}`);
          continue;
        }
        sources.add(source);
      }
  return validateRuleOverrides(config.overrides, errors), validateTransparentWrappers(config.transparent_wrappers, errors), { errors, sources };
}
function getUserPolicyDiagnostics(config) {
  if (getUserPolicySchema().safeParse(config).success)
    return [];
  let errors = [];
  if (!isRecord(config))
    return ["Config must be an object"];
  if (addUnknownFieldErrors(config, /* @__PURE__ */ new Set([
    "version",
    "safety",
    "workflow",
    "destructive_command_protection",
    "secret_protection"
  ]), errors), config.version !== 1)
    errors.push("version must be 1");
  return validateUserSafety(config.safety, errors), validateUserWorkflow(config.workflow, errors), validateUserDestructivePolicy(config.destructive_command_protection, errors), validateUserSecretPolicy(config.secret_protection, errors), errors;
}
function validateRuleOverrides(value, errors) {
  if (value === void 0)
    return;
  if (!isRecord(value)) {
    errors.push("overrides must be an object if provided");
    return;
  }
  for (let [key, override] of Object.entries(value)) {
    if (!/^[^/]+\/[^/]+$/.test(key))
      errors.push(`overrides.${key}: must use <rulebook-name>/<rule-name>`);
    if (override === "off")
      continue;
    if (!isRecord(override)) {
      errors.push(`overrides.${key}: must be "off" or an object`);
      continue;
    }
    if (typeof override.reason !== "string" || override.reason === "")
      errors.push(`overrides.${key}.reason: required non-empty string`);
    else if (override.reason.length > MAX_REASON_LENGTH)
      errors.push(`overrides.${key}.reason: must be at most ${MAX_REASON_LENGTH} characters`);
    if (override.intent !== void 0 && (typeof override.intent !== "string" || !BLOCK_INTENTS.includes(override.intent)))
      errors.push(`overrides.${key}.intent: must be one of ${BLOCK_INTENTS.join(", ")}`);
  }
}
function validateTransparentWrappers(value, errors) {
  if (value === void 0)
    return;
  if (!Array.isArray(value)) {
    errors.push("transparent_wrappers must be an array of command strings");
    return;
  }
  let seen = /* @__PURE__ */ new Set;
  for (let index = 0;index < value.length; index++) {
    let command2 = value[index];
    if (typeof command2 !== "string") {
      errors.push(`transparent_wrappers[${index}]: must be a command string`);
      continue;
    }
    if (!COMMAND_PATTERN.test(command2)) {
      errors.push(`transparent_wrappers[${index}]: must match command pattern`);
      continue;
    }
    if (seen.has(command2)) {
      errors.push(`transparent_wrappers[${index}]: duplicate command "${command2}"`);
      continue;
    }
    if (isReservedTransparentWrapper(command2)) {
      errors.push(`transparent_wrappers[${index}]: reserved command "${command2}" cannot be a wrapper`);
      continue;
    }
    seen.add(command2);
  }
}
function validateUserSafety(value, errors) {
  if (value === void 0)
    return;
  if (!isRecord(value)) {
    errors.push("safety must be an object if provided");
    return;
  }
  if (addUnknownFieldErrors(value, /* @__PURE__ */ new Set(["level", "overrides"]), errors, "safety"), value.level !== void 0 && !["standard", "strict", "paranoid"].includes(String(value.level)))
    errors.push('safety.level must be "standard", "strict", or "paranoid"');
  if (value.overrides === void 0)
    return;
  if (!isRecord(value.overrides)) {
    errors.push("safety.overrides must be an object if provided");
    return;
  }
  addUnknownFieldErrors(value.overrides, /* @__PURE__ */ new Set(["fail_closed", "paranoid_rm", "paranoid_interpreters"]), errors, "safety.overrides");
  for (let [key, override] of Object.entries(value.overrides))
    if (typeof override !== "boolean")
      errors.push(`safety.overrides.${key} must be a boolean`);
}
function validateUserWorkflow(value, errors) {
  if (value === void 0)
    return;
  if (!isRecord(value)) {
    errors.push("workflow must be an object if provided");
    return;
  }
  if (addUnknownFieldErrors(value, /* @__PURE__ */ new Set(["worktree_mode"]), errors, "workflow"), value.worktree_mode !== void 0 && typeof value.worktree_mode !== "boolean")
    errors.push("workflow.worktree_mode must be a boolean");
}
function validateUserDestructivePolicy(value, errors) {
  if (value === void 0)
    return;
  if (!isRecord(value)) {
    errors.push("destructive_command_protection must be an object if provided");
    return;
  }
  if (addUnknownFieldErrors(value, /* @__PURE__ */ new Set(["enabled", "overrides"]), errors, "destructive_command_protection"), value.enabled !== void 0 && typeof value.enabled !== "boolean")
    errors.push("destructive_command_protection.enabled must be a boolean");
  validateKnownOverrides(value.overrides, "destructive_command_protection", DESTRUCTIVE_COMMAND_RULE_ID_SET, "destructive command", errors, (override) => override === "on" || override === "off" ? void 0 : 'must be "on" or "off"');
}
function validateUserSecretPolicy(value, errors) {
  if (value === void 0)
    return;
  if (!isRecord(value)) {
    errors.push("secret_protection must be an object if provided");
    return;
  }
  if (addUnknownFieldErrors(value, /* @__PURE__ */ new Set(["enabled", "overrides", "deny_paths"]), errors, "secret_protection"), value.enabled !== void 0 && typeof value.enabled !== "boolean")
    errors.push("secret_protection.enabled must be a boolean");
  if (validateOffOverrides(value.overrides, "secret_protection", SECRET_PROTECTION_RULE_ID_SET, "secret protection", errors), value.deny_paths === void 0)
    return;
  if (!Array.isArray(value.deny_paths)) {
    errors.push("secret_protection.deny_paths must be an array of paths");
    return;
  }
  for (let index = 0;index < value.deny_paths.length; index++) {
    let path = value.deny_paths[index];
    if (typeof path !== "string" || path.trim() === "")
      errors.push(`secret_protection.deny_paths[${index}] must be a non-empty path string`);
  }
}
function validateOffOverrides(value, field, knownIds, label, errors) {
  validateKnownOverrides(value, field, knownIds, label, errors, (override) => override === "off" ? void 0 : 'must be "off"');
}
function validateKnownOverrides(value, field, knownIds, label, errors, validate) {
  if (value === void 0)
    return;
  if (!isRecord(value)) {
    errors.push(`${field}.overrides must be an object if provided`);
    return;
  }
  for (let [id, override] of Object.entries(value)) {
    if (!knownIds.has(id))
      errors.push(`unknown ${label} rule id "${id}"`);
    let error = validate(override);
    if (error)
      errors.push(`${field}.overrides.${id} ${error}`);
  }
}
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function addUnknownFieldErrors(record, allowed, errors, prefix) {
  for (let key of Object.keys(record))
    if (!allowed.has(key))
      errors.push(`${prefix ? `${prefix}.` : ""}unknown field "${key}"`);
}
// src/core/rules/policy/filesystem.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync as lstatSync3,
  mkdirSync as mkdirSync2,
  openSync,
  readdirSync as readdirSync2,
  readFileSync as readFileSync3,
  realpathSync as realpathSync6,
  renameSync,
  rmdirSync,
  statSync as statSync3,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { isAbsolute as isAbsolute6, join as join5, normalize, parse, relative as relative2, resolve as resolve4, sep as sep3 } from "node:path";
var POLICY_FILESYSTEM_SCOPE = Symbol("PolicyFilesystemScope"), POLICY_FILESYSTEM_TARGET = Symbol("PolicyFilesystemTarget"), NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

class PolicyFilesystemError extends Error {
  constructor(label) {
    super(`Unable to access ${label} filesystem safely.`);
    this.name = "PolicyFilesystemError";
  }
}
function bindPolicyFilesystemScope(root, label) {
  return { [POLICY_FILESYSTEM_SCOPE]: !0, root: resolve4(root), label };
}
function getPolicyFilesystemTarget(scope, relativePath) {
  let normalized = normalize(relativePath);
  if (relativePath === "" || isAbsolute6(relativePath) || normalized === ".." || normalized.startsWith(`..${sep3}`))
    throw new PolicyFilesystemError(scope.label);
  return {
    [POLICY_FILESYSTEM_TARGET]: !0,
    scope,
    relativePath: normalized,
    path: join5(scope.root, normalized)
  };
}
function getPolicyFilesystemTargetForPath(scope, path) {
  let relativePath = relative2(scope.root, resolve4(path));
  return getPolicyFilesystemTarget(scope, relativePath);
}
function bindDelegatedPolicyFilesystemTarget(path, label = "rules policy") {
  let absolutePath = resolve4(path), root = parse(absolutePath).dir;
  return getPolicyFilesystemTarget(bindPolicyFilesystemScope(root, label), relative2(root, absolutePath));
}
function readPolicyFile(target) {
  try {
    if (!validateTarget(target, !1).exists)
      return null;
    let descriptor = openSync(target.path, constants.O_RDONLY | NO_FOLLOW);
    try {
      let before = fstatSync(descriptor);
      if (!before.isFile())
        throw new PolicyFilesystemError(target.scope.label);
      let content = readFileSync3(descriptor, "utf-8"), after = lstatSync3(target.path);
      if (!after.isFile() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino)
        throw new PolicyFilesystemError(target.scope.label);
      return validateTarget(target, !1), content;
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}
function writePolicyFileAtomic(target, content, mode = 384, afterRename) {
  let tempPath = `${target.path}.${randomBytes2(8).toString("hex")}.tmp`, descriptor = null;
  try {
    ensureTargetParents(target), validateTarget(target, !0), descriptor = openSync(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NO_FOLLOW, mode);
    let tempBefore = fstatSync(descriptor);
    if (!tempBefore.isFile())
      throw new PolicyFilesystemError(target.scope.label);
    writeFileSync(descriptor, content, "utf-8"), fsyncSync(descriptor);
    let tempAfter = fstatSync(descriptor);
    if (!tempAfter.isFile() || tempAfter.dev !== tempBefore.dev || tempAfter.ino !== tempBefore.ino)
      throw new PolicyFilesystemError(target.scope.label);
    closeSync(descriptor), descriptor = null, validateTarget(target, !0), validateAdjacentTemp(target, tempPath, tempAfter.dev, tempAfter.ino), renameSync(tempPath, target.path), afterRename?.(target.path), validateTarget(target, !1);
  } catch (error) {
    if (descriptor !== null)
      closeSafely(descriptor);
    unlinkSafely(tempPath), throwPolicyFilesystemError(target.scope.label, error);
  }
}
function isSamePolicyFilesystemTarget(first, second) {
  if (first.path === second.path)
    return !0;
  try {
    if (!validateTarget(first, !1).exists || !validateTarget(second, !1).exists)
      return !1;
    return realpathSync6(first.path) === realpathSync6(second.path);
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      throw error;
    throw new PolicyFilesystemError(first.scope.label);
  }
}
function readPolicyDirectory(target) {
  try {
    if (!validateTarget(target, !1, "directory").exists)
      return null;
    let entries = readdirSync2(target.path);
    return validateTarget(target, !1, "directory"), entries;
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}
function readPolicyDirectoryEntries(target) {
  let names = readPolicyDirectory(target);
  if (!names)
    return null;
  try {
    let entries = names.map((name) => {
      let child = getPolicyFilesystemTarget(target.scope, join5(target.relativePath, name)), stat = lstatSync3(child.path);
      if (stat.isSymbolicLink() || !stat.isFile() && !stat.isDirectory())
        throw new PolicyFilesystemError(target.scope.label);
      return assertCanonicalContainment(getCanonicalRootOrThrow(target.scope), realpathSync6(child.path), target.scope.label), { name, kind: stat.isDirectory() ? "directory" : "file" };
    });
    return validateTarget(target, !1, "directory"), entries;
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}
function removePolicyFile(target) {
  try {
    if (!validateTarget(target, !0).exists)
      return;
    unlinkSync(target.path), validateTarget(target, !0);
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}
function ensurePolicyDirectory(target) {
  try {
    ensureDirectoryComponents(target, target.relativePath.split(sep3));
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}
function removePolicyDirectory(target) {
  try {
    if (!validatePolicyDirectoryRemoval(target))
      return;
    removeValidatedTree(target), validateTarget(target, !0, "directory");
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}
function validatePolicyDirectoryRemoval(target) {
  try {
    if (!validateTarget(target, !0, "directory").exists)
      return !1;
    return validateRemovalTree(target), !0;
  } catch (error) {
    throwPolicyFilesystemError(target.scope.label, error);
  }
}
function validateTarget(target, allowMissingLeaf, leafType = "file") {
  let canonicalRoot = getCanonicalRoot(target.scope);
  if (!canonicalRoot)
    return { exists: !1 };
  let parts = target.relativePath.split(sep3);
  for (let index of parts.keys()) {
    let path = join5(target.scope.root, ...parts.slice(0, index + 1)), stat = lstatOrMissing(path);
    if (!stat) {
      if (index === parts.length - 1 && allowMissingLeaf)
        return { exists: !1 };
      return { exists: !1 };
    }
    if (stat.isSymbolicLink())
      throw new PolicyFilesystemError(target.scope.label);
    if (index < parts.length - 1 && !stat.isDirectory())
      throw new PolicyFilesystemError(target.scope.label);
    if (index === parts.length - 1 && (leafType === "file" ? !stat.isFile() : !stat.isDirectory()))
      throw new PolicyFilesystemError(target.scope.label);
    assertCanonicalContainment(canonicalRoot, realpathSync6(path), target.scope.label);
  }
  return { exists: !0 };
}
function validateRemovalTree(target) {
  for (let name of readdirSync2(target.path)) {
    let child = getPolicyFilesystemTarget(target.scope, join5(target.relativePath, name)), stat = lstatSync3(child.path);
    if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile())
      throw new PolicyFilesystemError(target.scope.label);
    if (stat.isDirectory())
      validateRemovalTree(child);
  }
  validateTarget(target, !1, "directory");
}
function removeValidatedTree(target) {
  for (let name of readdirSync2(target.path)) {
    let child = getPolicyFilesystemTarget(target.scope, join5(target.relativePath, name)), stat = lstatSync3(child.path);
    if (stat.isSymbolicLink())
      throw new PolicyFilesystemError(target.scope.label);
    if (stat.isDirectory()) {
      removeValidatedTree(child);
      continue;
    }
    if (!stat.isFile())
      throw new PolicyFilesystemError(target.scope.label);
    unlinkSync(child.path);
  }
  rmdirSync(target.path);
}
function ensureTargetParents(target) {
  ensureDirectoryComponents(target, target.relativePath.split(sep3).slice(0, -1));
}
function ensureDirectoryComponents(target, parts) {
  ensureRoot(target.scope);
  let canonicalRoot = getCanonicalRootOrThrow(target.scope);
  for (let index of parts.keys()) {
    let path = join5(target.scope.root, ...parts.slice(0, index + 1));
    if (!lstatOrMissing(path))
      mkdirSync2(path, { mode: 448 });
    let after = lstatSync3(path);
    if (!after.isDirectory() || after.isSymbolicLink())
      throw new PolicyFilesystemError(target.scope.label);
    assertCanonicalContainment(canonicalRoot, realpathSync6(path), target.scope.label);
  }
}
function ensureRoot(scope) {
  if (lstatOrMissing(scope.root)) {
    if (!statSync3(scope.root).isDirectory())
      throw new PolicyFilesystemError(scope.label);
    return;
  }
  let missing = [], current = scope.root;
  while (!lstatOrMissing(current)) {
    missing.unshift(current);
    let parent = parse(current).dir;
    if (parent === current)
      throw new PolicyFilesystemError(scope.label);
    current = parent;
  }
  if (!statSync3(current).isDirectory())
    throw new PolicyFilesystemError(scope.label);
  for (let path of missing) {
    mkdirSync2(path, { mode: 448 });
    let stat = lstatSync3(path);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new PolicyFilesystemError(scope.label);
  }
}
function getCanonicalRoot(scope) {
  if (!lstatOrMissing(scope.root))
    return null;
  if (!statSync3(scope.root).isDirectory())
    throw new PolicyFilesystemError(scope.label);
  return realpathSync6(scope.root);
}
function getCanonicalRootOrThrow(scope) {
  let root = getCanonicalRoot(scope);
  if (!root)
    throw new PolicyFilesystemError(scope.label);
  return root;
}
function validateAdjacentTemp(target, tempPath, device, inode) {
  let stat = lstatSync3(tempPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== device || stat.ino !== inode)
    throw new PolicyFilesystemError(target.scope.label);
  let canonicalRoot = getCanonicalRoot(target.scope);
  if (!canonicalRoot)
    throw new PolicyFilesystemError(target.scope.label);
  assertCanonicalContainment(canonicalRoot, realpathSync6(tempPath), target.scope.label);
}
function assertCanonicalContainment(canonicalRoot, canonicalPath, label) {
  let remainder = relative2(canonicalRoot, canonicalPath);
  if (remainder === ".." || remainder.startsWith(`..${sep3}`) || isAbsolute6(remainder))
    throw new PolicyFilesystemError(label);
}
function lstatOrMissing(path) {
  try {
    return lstatSync3(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT")
      return null;
    throw error;
  }
}
function throwPolicyFilesystemError(label, error) {
  if (error instanceof PolicyFilesystemError)
    throw error;
  throw new PolicyFilesystemError(label);
}
function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
function closeSafely(descriptor) {
  try {
    closeSync(descriptor);
  } catch {}
}
function unlinkSafely(path) {
  try {
    unlinkSync(path);
  } catch {}
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
  let validation = getRulesConfigValidation(config);
  if (validation.errors.length > 0)
    return validation;
  return {
    errors: getRulesConfigSchema().safeParse(config).success ? [] : validation.errors,
    sources: validation.sources
  };
}
function readRulesConfig(path) {
  try {
    let content = readPolicyFile(toTarget(path));
    if (content === null)
      return { config: null, errors: [] };
    if (!content.trim())
      return { config: null, errors: ["Config file is empty"] };
    let parsed = JSON.parse(content), validation = validateRulesConfig(parsed);
    if (validation.errors.length > 0)
      return { config: null, errors: validation.errors };
    let cfg = getRulesConfigSchema().parse(parsed);
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
    if (error instanceof PolicyFilesystemError)
      return { config: null, errors: [error.message] };
    return {
      config: null,
      errors: ["Invalid JSON"]
    };
  }
}
function readScopeRulesConfig(path) {
  let loaded = readRulesConfig(path);
  if (loaded.errors.length > 0)
    return { ok: !1, result: { ok: !1, errors: loaded.errors, warnings: [], entries: [] } };
  return { ok: !0, config: loaded.config ?? DEFAULT_CONFIG };
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
function writeJsonAtomic(path, value, mode, afterRename) {
  writePolicyFileAtomic(toTarget(path), `${JSON.stringify(value, null, 2)}
`, mode, afterRename);
}
function toTarget(path) {
  return typeof path === "string" ? bindDelegatedPolicyFilesystemTarget(path) : path;
}

// src/core/rules/policy/paths.ts
import { homedir as homedir3 } from "node:os";
import { dirname as dirname5, isAbsolute as isAbsolute7, join as join6, relative as relative3, resolve as resolve5, sep as sep4 } from "node:path";
var RULES_CONFIG_FILE = "rule.json", RULES_LOCK_FILE = "rule.lock", LEGACY_RULES_CONFIG_FILE = "config.json", SAFETY_NET_DIR = ".cc-safety-net", RULES_SUBDIR = "rules", CACHE_SUBDIR = "cache", CC_SAFETY_NET_HOME = "CC_SAFETY_NET_HOME", RULE_SYNC_COMMAND = "`cc-safety-net rule sync`", RULE_MIGRATE_COMMAND = "`npx -y cc-safety-net rule migrate`";
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
  let home = process.env[CC_SAFETY_NET_HOME];
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
  let userConfigPath = options2.userConfigPath ?? getUserRulesConfigPath(options2), projectConfigPath = options2.projectConfigPath ?? getProjectRulesConfigPath(options2.cwd), userScope = getUserPolicyFilesystemScope(userConfigPath, options2), projectScope = getProjectPolicyFilesystemScope(projectConfigPath, options2), projectLegacyPath = getLegacyProjectRulesConfigPath(options2), projectLegacyScope = bindPolicyFilesystemScope(resolve5(options2.cwd ?? process.cwd()), "project policy");
  return {
    userConfigPath,
    projectConfigPath,
    userLockPath: getRulesLockPathForConfigPath(userConfigPath),
    projectLockPath: getRulesLockPathForConfigPath(projectConfigPath),
    projectLegacyPath,
    userScope,
    projectScope,
    projectLegacyScope,
    userConfigTarget: getPolicyFilesystemTargetForPath(userScope, userConfigPath),
    projectConfigTarget: getPolicyFilesystemTargetForPath(projectScope, projectConfigPath),
    userLockTarget: getPolicyFilesystemTargetForPath(userScope, getRulesLockPathForConfigPath(userConfigPath)),
    projectLockTarget: getPolicyFilesystemTargetForPath(projectScope, getRulesLockPathForConfigPath(projectConfigPath)),
    projectLegacyTarget: getPolicyFilesystemTargetForPath(projectLegacyScope, projectLegacyPath)
  };
}
function getScopePaths(options2) {
  let configPath = options2.global ? options2.userConfigPath ?? getUserRulesConfigPath(options2) : options2.projectConfigPath ?? getProjectRulesConfigPath(options2.cwd), filesystemScope = options2.global ? getUserPolicyFilesystemScope(configPath, options2) : getProjectPolicyFilesystemScope(configPath, options2), lockPath = getRulesLockPathForConfigPath(configPath);
  return {
    configDir: dirname5(configPath),
    configPath,
    lockPath,
    filesystemScope,
    configTarget: getPolicyFilesystemTargetForPath(filesystemScope, configPath),
    lockTarget: getPolicyFilesystemTargetForPath(filesystemScope, lockPath)
  };
}
function getUserPolicyFilesystemScope(_configPath, options2) {
  let root = options2.userConfigPath ? dirname5(dirname5(resolve5(options2.userConfigPath))) : dirname5(resolve5(options2.userConfigDir ?? getUserRulesDir(options2)));
  return bindPolicyFilesystemScope(root, "user policy");
}
function getProjectPolicyFilesystemScope(configPath, options2) {
  let cwd = resolve5(options2.cwd ?? process.cwd()), absoluteConfigPath = resolve5(configPath), fromCwd = relative3(cwd, absoluteConfigPath);
  if (fromCwd !== ".." && !fromCwd.startsWith(`..${sep4}`) && !isAbsolute7(fromCwd))
    return bindPolicyFilesystemScope(cwd, "project policy");
  return bindPolicyFilesystemScope(dirname5(dirname5(absoluteConfigPath)), "project policy");
}
function getRulebookDisplaySource(entry) {
  if (entry.kind === "github" && entry.display_ref)
    return `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}`;
  return entry.spec;
}
function getRulebookCachePath(entry, options2) {
  let digestHex = entry.digest.startsWith("sha256:") ? entry.digest.slice(7) : entry.digest;
  return join6(getRulesCacheDir(options2), "rulebooks", `${getRulebookCacheSlug(entry)}--${digestHex.slice(0, 12)}`, RULEBOOK_FILE);
}
function getRulebookCacheRoot(options2) {
  return join6(getRulesCacheDir(options2), "rulebooks");
}
function getRulebookCacheOptions(configDir, options2) {
  let syncOptions = options2;
  return {
    cacheConfigDir: configDir,
    cwd: options2.cwd,
    global: syncOptions.global
  };
}
function getRulebookCacheSlug(entry) {
  return (entry.kind === "github" && entry.display_ref ? `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}` : entry.spec).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "rulebook";
}
function getRulesCacheDir(options2) {
  let configDir = options2?.cacheConfigDir ?? getUserRulesDir(options2), syncOptions = options2;
  if (syncOptions && !syncOptions.global && syncOptions.cwd && resolve5(configDir) === resolve5(syncOptions.cwd))
    return join6(resolve5(syncOptions.cwd), SAFETY_NET_DIR, CACHE_SUBDIR);
  return join6(dirname5(configDir), CACHE_SUBDIR);
}

// src/core/policy.ts
var POLICY_FILE = "policy.json", SAFETY_LEVELS2 = /* @__PURE__ */ new Set(["standard", "strict", "paranoid"]), DEFAULT_GUI_POLICY = {
  version: 1,
  safety: {
    level: "standard",
    overrides: {}
  },
  workflow: {
    worktree_mode: !1
  },
  destructive_command_protection: {
    enabled: !0,
    overrides: {}
  },
  secret_protection: {
    enabled: !0,
    overrides: {},
    deny_paths: []
  }
};
function getUserPolicyPath(options2) {
  return join7(dirname6(getUserRulesDir(options2)), POLICY_FILE);
}
function readUserPolicyForGui(options2 = {}) {
  let path = getUserPolicyPath(options2);
  if (!existsSync2(path))
    return {
      path,
      exists: !1,
      raw: "",
      policy: createDefaultGuiPolicy(),
      errors: []
    };
  let raw = readFileSync4(path, "utf-8");
  if (!raw.trim())
    return {
      path,
      exists: !0,
      raw,
      policy: createDefaultGuiPolicy(),
      errors: ["Config file is empty"]
    };
  try {
    let parsed = JSON.parse(raw), errors = getUserPolicyDiagnostics(parsed);
    return {
      path,
      exists: !0,
      raw,
      policy: errors.length > 0 ? createDefaultGuiPolicy() : normalizeGuiPolicy(parsed),
      errors
    };
  } catch (error) {
    return {
      path,
      exists: !0,
      raw,
      policy: createDefaultGuiPolicy(),
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}
function writeUserPolicyFromGui(policy, options2 = {}) {
  let path = getUserPolicyPath(options2), errors = getUserPolicyDiagnostics(policy), normalizedPolicy = errors.length > 0 ? createDefaultGuiPolicy() : normalizeGuiPolicy(policy);
  if (errors.length > 0)
    return { path, policy: normalizedPolicy, errors };
  return mkdirSync3(dirname6(path), { recursive: !0, mode: 448 }), writeJsonAtomic(path, normalizedPolicy, 384), chmodSync(path, 384), { path, policy: normalizedPolicy, errors: [] };
}
function previewUserPolicyForGui(policy) {
  let errors = getUserPolicyDiagnostics(policy);
  if (errors.length > 0)
    return { errors };
  return { preview: createPolicyPreview(normalizeGuiPolicy(policy)), errors: [] };
}
function createPolicyPreview(policy) {
  let modes = getCCSafetyNetEnvModes({ safety: normalizeSafety(policy.safety) }), rules = resolveEffectiveDestructiveCommandRules({
    destructiveCommandProtectionEnabled: policy.destructive_command_protection.enabled,
    destructiveCommandRuleOverrides: policy.destructive_command_protection.overrides
  }, modes.capabilities), values = Object.values(rules), overrides = Object.values(policy.destructive_command_protection.overrides);
  return {
    selectedPreset: policy.safety.level,
    effectiveLevel: modes.effectiveLevel,
    capabilities: modes.capabilities,
    rules,
    counts: {
      enabled: values.filter((state) => state.enabled).length,
      disabled: values.filter((state) => !state.enabled).length,
      explicitOn: overrides.filter((value) => value === "on").length,
      explicitOff: overrides.filter((value) => value === "off").length,
      effectiveCustomizations: values.filter((state) => state.changesInherited).length,
      inheritedRequiresStrict: values.filter((state) => !state.enabled && !state.override && state.activationCapability === "fail_closed").length,
      inheritedRequiresParanoid: values.filter((state) => !state.enabled && !state.override && (state.activationCapability === "paranoid_rm" || state.activationCapability === "paranoid_interpreters")).length
    }
  };
}
function repairUserPolicyForGui(options2 = {}) {
  let path = getUserPolicyPath(options2);
  if (!existsSync2(path))
    return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options2);
  let raw = readFileSync4(path, "utf-8");
  if (!raw.trim())
    return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options2);
  try {
    return writeUserPolicyFromGui(repairPolicyConfig(JSON.parse(raw)), options2);
  } catch {
    return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options2);
  }
}
function loadPolicyConfig(options2 = {}) {
  let user = readPolicyConfig(getUserPolicyPath(options2));
  return {
    safety: user.policy.safety,
    worktreeMode: user.policy.worktreeMode,
    destructiveCommandProtectionEnabled: user.policy.destructiveCommandProtectionEnabled,
    destructiveCommandRuleOverrides: { ...user.policy.destructiveCommandRuleOverrides },
    secretProtection: user.policy.secretProtection,
    errors: user.errors
  };
}
function repairPolicyConfig(value) {
  if (!isRecord2(value))
    return createDefaultGuiPolicy();
  let safety = isRecord2(value.safety) ? value.safety : {}, safetyOverrides = isRecord2(safety.overrides) ? safety.overrides : {}, workflow = isRecord2(value.workflow) ? value.workflow : {}, destructiveCommand = isRecord2(value.destructive_command_protection) ? value.destructive_command_protection : {}, secret = isRecord2(value.secret_protection) ? value.secret_protection : {};
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
      worktree_mode: typeof workflow.worktree_mode === "boolean" ? workflow.worktree_mode : !1
    },
    destructive_command_protection: {
      enabled: typeof destructiveCommand.enabled === "boolean" ? destructiveCommand.enabled : !0,
      overrides: repairDestructiveCommandOverrides(destructiveCommand.overrides)
    },
    secret_protection: {
      enabled: typeof secret.enabled === "boolean" ? secret.enabled : !0,
      overrides: repairOffOverrides(secret.overrides, SECRET_PROTECTION_RULE_ID_SET),
      deny_paths: repairDenyPaths(secret.deny_paths)
    }
  };
}
function repairDestructiveCommandOverrides(value) {
  if (!isRecord2(value))
    return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, override]) => DESTRUCTIVE_COMMAND_RULE_ID_SET.has(id) && (override === "on" || override === "off") ? [[id, override]] : []));
}
function repairOffOverrides(value, knownRuleIds) {
  if (!isRecord2(value))
    return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, override]) => knownRuleIds.has(id) && override === "off" ? [[id, "off"]] : []));
}
function repairDenyPaths(value) {
  if (!Array.isArray(value))
    return [];
  return value.filter((path) => typeof path === "string" && path.trim() !== "");
}
function isRecord2(value) {
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
  let config = policy, safety = config.safety ?? {}, safetyOverrides = safety.overrides ?? {}, workflow = config.workflow ?? {}, destructiveCommandPolicy = config.destructive_command_protection ?? {}, destructiveCommandOverrides = destructiveCommandPolicy.overrides ?? {}, secret = config.secret_protection ?? {}, secretOverrides = secret.overrides ?? {};
  return {
    version: 1,
    safety: {
      level: safety.level ?? "standard",
      overrides: {
        ...safetyOverrides.fail_closed !== void 0 ? { fail_closed: safetyOverrides.fail_closed } : {},
        ...safetyOverrides.paranoid_rm !== void 0 ? { paranoid_rm: safetyOverrides.paranoid_rm } : {},
        ...safetyOverrides.paranoid_interpreters !== void 0 ? { paranoid_interpreters: safetyOverrides.paranoid_interpreters } : {}
      }
    },
    workflow: {
      worktree_mode: workflow.worktree_mode ?? !1
    },
    destructive_command_protection: {
      enabled: destructiveCommandPolicy.enabled ?? !0,
      overrides: Object.fromEntries(Object.entries(destructiveCommandOverrides).flatMap(([id, value]) => value === "on" || value === "off" ? [[id, value]] : []))
    },
    secret_protection: {
      enabled: secret.enabled ?? !0,
      overrides: Object.fromEntries(Object.entries(secretOverrides).flatMap(([id, value]) => value === "off" ? [[id, "off"]] : [])),
      deny_paths: [...secret.deny_paths ?? []]
    }
  };
}
function readPolicyConfig(path) {
  let empty = createEmptyPolicy();
  if (!existsSync2(path))
    return { policy: empty, errors: [] };
  try {
    let content = readFileSync4(path, "utf-8");
    if (!content.trim())
      return { policy: empty, errors: [`${path}: Config file is empty`] };
    let parsed = JSON.parse(content), errors = getUserPolicyDiagnostics(parsed);
    if (errors.length > 0)
      return { policy: empty, errors: errors.map((error) => `${path}: ${error}`) };
    return { policy: normalizePolicyConfig(getUserPolicySchema().parse(parsed)), errors: [] };
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
    worktreeMode: !1,
    destructiveCommandProtectionEnabled: !0,
    destructiveCommandRuleOverrides: {},
    secretProtection: { enabled: !0, disabledRules: /* @__PURE__ */ new Set, denyPaths: [] }
  };
}
function normalizePolicyConfig(config) {
  let safety = normalizeSafety(config.safety), workflow = config.workflow, destructiveCommand = config.destructive_command_protection, secret = config.secret_protection;
  return {
    safety,
    worktreeMode: workflow?.worktree_mode ?? !1,
    destructiveCommandProtectionEnabled: destructiveCommand?.enabled ?? !0,
    destructiveCommandRuleOverrides: Object.fromEntries(Object.entries(destructiveCommand?.overrides ?? {}).flatMap(([id, value]) => value === "on" || value === "off" ? [[id, value]] : [])),
    secretProtection: {
      enabled: secret?.enabled ?? !0,
      disabledRules: new Set(Object.entries(secret?.overrides ?? {}).flatMap(([id, value]) => value === "off" ? [id] : [])),
      denyPaths: [...secret?.deny_paths ?? []]
    }
  };
}
function normalizeSafety(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return {};
  let safety = value, overrides = safety.overrides ?? {};
  return {
    level: safety.level,
    overrides: {
      failClosed: overrides.fail_closed,
      paranoidRm: overrides.paranoid_rm,
      paranoidInterpreters: overrides.paranoid_interpreters
    }
  };
}

// src/core/rules/policy/scope-policy.ts
import { dirname as dirname8, isAbsolute as isAbsolute8, join as join9, relative as relative4, resolve as resolve6, sep as sep5 } from "node:path";

// src/core/rules/custom-rule-validation.ts
function validateCustomRule(rule, index, ruleNames, options2 = {}) {
  return [...iterateCustomRuleErrors(rule, index, ruleNames, options2)];
}
function* iterateCustomRuleErrors(rule, index, ruleNames, options2 = {}) {
  let prefix = `rules[${index}]`;
  if (!rule || typeof rule !== "object") {
    yield `${prefix}: must be an object`;
    return;
  }
  let r = rule, messageStyle = options2.messageStyle ?? "legacy";
  if (typeof r.name !== "string")
    yield `${prefix}.name: required string`;
  else {
    if (!NAME_PATTERN.test(r.name))
      yield validationMessage(messageStyle, `${prefix}.name: must match rule name pattern`, `${prefix}.name: must match pattern (letters, numbers, hyphens, underscores; max 64 chars)`);
    let lowerName = r.name.toLowerCase();
    if (ruleNames.has(lowerName))
      yield `${prefix}.name: duplicate rule name "${r.name}"`;
    else
      ruleNames.add(lowerName);
  }
  if (typeof r.command !== "string")
    yield validationMessage(messageStyle, `${prefix}.command: required string matching command pattern`, `${prefix}.command: required string`);
  else if (!COMMAND_PATTERN.test(r.command))
    yield validationMessage(messageStyle, `${prefix}.command: required string matching command pattern`, `${prefix}.command: must match pattern (letters, numbers, hyphens, underscores)`);
  if (r.subcommand !== void 0) {
    if (typeof r.subcommand !== "string")
      yield validationMessage(messageStyle, `${prefix}.subcommand: must match command pattern`, `${prefix}.subcommand: must be a string if provided`);
    else if (!COMMAND_PATTERN.test(r.subcommand))
      yield validationMessage(messageStyle, `${prefix}.subcommand: must match command pattern`, `${prefix}.subcommand: must match pattern (letters, numbers, hyphens, underscores)`);
  }
  if (!Array.isArray(r.block_args))
    yield validationMessage(messageStyle, `${prefix}.block_args: required non-empty array`, `${prefix}.block_args: required array`);
  else {
    if (r.block_args.length === 0)
      yield validationMessage(messageStyle, `${prefix}.block_args: required non-empty array`, `${prefix}.block_args: must have at least one element`);
    for (let i = 0;i < r.block_args.length; i++) {
      let arg = r.block_args[i];
      if (typeof arg !== "string")
        yield validationMessage(messageStyle, `${prefix}.block_args[${i}]: must be a non-empty string`, `${prefix}.block_args[${i}]: must be a string`);
      else if (arg === "")
        yield validationMessage(messageStyle, `${prefix}.block_args[${i}]: must be a non-empty string`, `${prefix}.block_args[${i}]: must not be empty`);
    }
  }
  if (typeof r.reason !== "string")
    yield validationMessage(messageStyle, `${prefix}.reason: required non-empty string up to ${MAX_REASON_LENGTH} characters`, `${prefix}.reason: required string`);
  else if (r.reason === "")
    yield validationMessage(messageStyle, `${prefix}.reason: required non-empty string up to ${MAX_REASON_LENGTH} characters`, `${prefix}.reason: must not be empty`);
  else if (r.reason.length > MAX_REASON_LENGTH)
    yield validationMessage(messageStyle, `${prefix}.reason: required non-empty string up to ${MAX_REASON_LENGTH} characters`, `${prefix}.reason: must be at most ${MAX_REASON_LENGTH} characters`);
  if (r.intent !== void 0 && !isBlockIntent(r.intent))
    yield `${prefix}.intent: must be one of ${BLOCK_INTENTS.join(", ")}`;
}
function validationMessage(messageStyle, rulebook, legacy) {
  return messageStyle === "rulebook" ? rulebook : legacy;
}
function isBlockIntent(value) {
  return typeof value === "string" && BLOCK_INTENTS.includes(value);
}

// src/core/rules/rulebook-limits.ts
var RULEBOOK_LIMIT_ERROR = "Rulebook exceeds CC Safety Net's safe validation limits.", RULEBOOK_VALIDATION_TRUNCATED = "Additional rulebook validation errors were omitted.", RULEBOOK_LIMITS = Object.freeze({
  maxAllowedCommands: 1024,
  maxRules: 1024,
  maxTests: 2048,
  maxBlockArgsPerRule: 1024,
  maxTotalBlockArgs: 16384,
  maxStringCodeUnits: 1048576,
  maxAggregateStringCodeUnits: 4194304,
  maxFixtureCommandCodeUnits: 131072,
  maxValidationErrors: 64,
  maxFixtureSegments: 16384,
  maxFixtureMatchWork: 1048576
});
function isRulebookWithinAcceptanceLimits(rulebook) {
  if (exceedsArrayLimit(rulebook.allowed_commands, RULEBOOK_LIMITS.maxAllowedCommands) || exceedsArrayLimit(rulebook.rules, RULEBOOK_LIMITS.maxRules) || exceedsArrayLimit(rulebook.tests, RULEBOOK_LIMITS.maxTests))
    return !1;
  let { maxAggregateStringCodeUnits: remainingStringCodeUnits, maxTotalBlockArgs: remainingBlockArgs } = RULEBOOK_LIMITS, acceptString = (value, fixtureCommand = !1) => {
    if (typeof value !== "string")
      return !0;
    if (value.length > RULEBOOK_LIMITS.maxStringCodeUnits || fixtureCommand && value.length > RULEBOOK_LIMITS.maxFixtureCommandCodeUnits || value.length > remainingStringCodeUnits)
      return !1;
    return remainingStringCodeUnits -= value.length, !0;
  };
  if (!acceptString(rulebook.name) || !acceptString(rulebook.version) || !acceptString(rulebook.description) || !acceptString(rulebook.author) || !acceptString(rulebook.migrated_from))
    return !1;
  if (Array.isArray(rulebook.allowed_commands)) {
    for (let command2 of rulebook.allowed_commands)
      if (!acceptString(command2))
        return !1;
  }
  if (Array.isArray(rulebook.rules))
    for (let rule of rulebook.rules) {
      if (!rule || typeof rule !== "object")
        continue;
      let candidate = rule;
      if (!acceptString(candidate.name) || !acceptString(candidate.command) || !acceptString(candidate.subcommand) || !acceptString(candidate.reason) || !acceptString(candidate.intent))
        return !1;
      if (!Array.isArray(candidate.block_args))
        continue;
      if (candidate.block_args.length > RULEBOOK_LIMITS.maxBlockArgsPerRule || candidate.block_args.length > remainingBlockArgs)
        return !1;
      remainingBlockArgs -= candidate.block_args.length;
      for (let blockArg of candidate.block_args)
        if (!acceptString(blockArg))
          return !1;
    }
  if (Array.isArray(rulebook.tests))
    for (let fixture of rulebook.tests) {
      if (!fixture || typeof fixture !== "object")
        continue;
      let candidate = fixture;
      if (!acceptString(candidate.command, !0) || !acceptString(candidate.expect) || !acceptString(candidate.rule))
        return !1;
    }
  return !0;
}
function exceedsArrayLimit(value, limit) {
  return Array.isArray(value) && value.length > limit;
}

// src/parser/traversal.ts
function* walkCommandViews(program) {
  for (let node of program.nodes)
    yield* walkNode(node);
}
function* walkNode(node) {
  if (node.kind === "command") {
    yield node;
    for (let nested of node.nested)
      yield* walkCommandViews(nested);
    return;
  }
  if (node.kind === "group")
    yield* walkCommandViews(node.body);
}

// src/parser/projection.ts
function projectCommandViews(program) {
  return Object.freeze([...walkCommandViews(program)]);
}
function sliceCommandView(view, start, end = view.words.length) {
  let words = view.words.slice(start, end), span = {
    start: words[0]?.span.start ?? view.span.end,
    end: words.at(-1)?.span.end ?? view.span.end
  };
  return Object.freeze({
    ...view,
    source: view.source.slice(span.start - view.span.start, span.end - view.span.start),
    span: Object.freeze(span),
    words: Object.freeze(words),
    tokens: Object.freeze(view.tokens.slice(start, end)),
    analysisTokens: Object.freeze(view.analysisTokens.slice(start, end)),
    dynamicExecutable: isDynamicExecutable(view.dialect, words),
    legacyNormalized: words.map((word) => word.text).join(" ")
  });
}
function isDynamicExecutable(dialect, words) {
  if (dialect !== "powershell")
    return words[0]?.provenance === "command-substitution";
  let executableIndex = words[0]?.text === "&" || words[0]?.text === "." ? 1 : 0, provenance = words[executableIndex]?.provenance;
  return provenance !== void 0 && provenance !== "literal";
}
function projectLegacySegments(source, dialect = "posix") {
  return Object.freeze(projectLegacyCommandEntries(source, dialect).map((entry) => entry.tokens));
}
function projectLegacyCommandEntries(source, dialect = "posix") {
  let program = parseCommand(source, dialect);
  return projectLegacyCommandEntriesFromProgram(source, program);
}
function projectLegacyCommandEntriesFromProgram(source, program) {
  if (program.issues.some((issue) => issue.code.includes("quote")))
    return Object.freeze([{ tokens: Object.freeze([source]) }]);
  return Object.freeze(projectCommandViews(program).flatMap((view) => {
    let tokens = projectLegacyViewTokens(view), arithmetic = view.words.flatMap((word) => word.provenance === "arithmetic" ? projectArithmeticText(word.raw) : []);
    return [
      Object.freeze({ tokens, view }),
      ...arithmetic.map((text) => Object.freeze({ tokens: Object.freeze([text]) }))
    ];
  }));
}
function projectLegacyViewTokens(view) {
  return Object.freeze(view.words.flatMap((word) => {
    if (word.provenance === "arithmetic")
      return [];
    if (word.text === "" && word.provenance === "command-substitution")
      return [];
    if (word.provenance === "command-substitution" && (word.raw.startsWith('"') && word.raw.endsWith('"') || word.raw.startsWith("'") && word.raw.endsWith("'")))
      return [word.raw.slice(1, -1)];
    return [word.text];
  }));
}
function projectArithmeticText(raw) {
  if (!raw.startsWith("$(("))
    return [];
  let body = raw.slice(3), literal = ((body.endsWith("))") ? [body.slice(0, -2), body.slice(0, -1), body] : body.endsWith(")") ? [body.slice(0, -1), body] : [body]).find(hasBalancedParentheses) ?? body).replace(/\$\([^)]*\)/g, "").replace(/`[^`]*`/g, "").replace(/\s+/g, "");
  return literal ? [literal] : [];
}
function hasBalancedParentheses(value) {
  let depth = 0;
  for (let char of value) {
    if (char === "(")
      depth++;
    if (char === ")")
      depth--;
    if (depth < 0)
      return !1;
  }
  return depth === 0;
}
function parseSimpleWords(source) {
  let program = parseCommand(source, "posix");
  if (program.status !== "complete" || program.nodes.length !== 1)
    return null;
  let command2 = program.nodes[0];
  if (command2?.kind !== "command")
    return null;
  if (command2.redirections.length > 0 || command2.nested.length > 0)
    return null;
  if (command2.words.some((word) => word.provenance === "command-substitution"))
    return null;
  return [...command2.tokens];
}

// src/core/rules/custom-subcommand.ts
var GIT_OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set([
  "-c",
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env"
]), DOCKER_OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set([
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
]), EMPTY_OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set;
function getCustomRuleOptionsWithValues(command2) {
  if (command2 === "git")
    return GIT_OPTIONS_WITH_VALUES;
  if (command2 === "docker")
    return DOCKER_OPTIONS_WITH_VALUES;
  return EMPTY_OPTIONS_WITH_VALUES;
}

// src/core/rules/custom.ts
function checkPolicyRuleMatch(tokens, rules) {
  return checkRuleMatch(tokens, rules);
}
function checkRuleMatch(tokens, rules) {
  if (tokens.length === 0 || rules.length === 0)
    return null;
  let command2 = normalizeCommandToken(tokens[0] ?? ""), shortOpts = extractShortOpts(tokens);
  for (let rule of rules) {
    if (!matchesCommand(command2, rule.command))
      continue;
    if (!matchesCustomRuleSubcommand(command2, tokens, rule.subcommand))
      continue;
    if (matchesCustomRuleBlockArgs(tokens, new Set(rule.block_args), shortOpts))
      return {
        id: `custom.${rule.name}`,
        reason: `[${rule.name}] ${rule.reason}`,
        intent: rule.intent ?? "manual_only"
      };
  }
  return null;
}
function matchesCommand(command2, ruleCommand) {
  return command2 === normalizeCommandToken(ruleCommand);
}
function matchesCustomRuleSubcommand(command2, tokens, ruleSubcommand, chargeString) {
  if (!ruleSubcommand)
    return !0;
  return chargeString?.(ruleSubcommand), matchesSubcommandFrom(tokens, 1, ruleSubcommand, getCustomRuleOptionsWithValues(command2), chargeString);
}
function matchesSubcommandFrom(tokens, startIndex, expectedSubcommand, optionsWithValues, chargeString) {
  let skipNext = !1;
  for (let i = startIndex;i < tokens.length; i++) {
    let token = tokens[i];
    if (chargeString?.(token ?? ""), !token)
      continue;
    if (skipNext) {
      skipNext = !1;
      continue;
    }
    if (token === "--") {
      let nextToken = tokens[i + 1];
      if (chargeString?.(nextToken ?? ""), nextToken && !nextToken.startsWith("-"))
        return nextToken === expectedSubcommand;
      return !1;
    }
    if (chargeString?.(token), optionsWithValues.has(token)) {
      skipNext = !0;
      continue;
    }
    if (token.startsWith("-")) {
      if (!token.includes("=") && shouldSkipPossibleOptionValue(tokens, i, expectedSubcommand, optionsWithValues, chargeString))
        return !0;
      continue;
    }
    return token === expectedSubcommand;
  }
  return !1;
}
function shouldSkipPossibleOptionValue(tokens, optionIndex, expectedSubcommand, optionsWithValues, chargeString) {
  let value = tokens[optionIndex + 1];
  if (chargeString?.(value ?? ""), !value || value.startsWith("-"))
    return !1;
  return matchesSubcommandFrom(tokens, optionIndex + 2, expectedSubcommand, optionsWithValues, chargeString);
}
function matchesCustomRuleBlockArgs(tokens, blockArgs, shortOpts, chargeString) {
  for (let token of tokens)
    if (chargeString?.(token), chargeString?.(token), blockArgs.has(token))
      return !0;
  for (let opt of shortOpts)
    if (chargeString?.(opt), chargeString?.(opt), blockArgs.has(opt))
      return !0;
  return !1;
}

// src/core/rules/rulebook-fixtures.ts
class FixtureWorkLimitError extends Error {
}

class FixtureWorkMeter {
  remaining = RULEBOOK_LIMITS.maxFixtureMatchWork;
  spend(units) {
    if (units > this.remaining)
      throw new FixtureWorkLimitError;
    this.remaining -= units;
  }
  spendString(value) {
    this.spend(value.length + 1);
  }
}
function evaluateRulebookFixtures(rulebook) {
  if (!isRulebookWithinAcceptanceLimits(rulebook))
    return fixtureLimitResult();
  try {
    return evaluateRulebookFixturesWithinLimits(rulebook, new FixtureWorkMeter);
  } catch (error) {
    if (error instanceof FixtureWorkLimitError)
      return fixtureLimitResult();
    throw error;
  }
}
function evaluateRulebookFixturesWithinLimits(rulebook, meter) {
  let rules = compileRules(rulebook.rules, meter), remainingSegments = RULEBOOK_LIMITS.maxFixtureSegments, failures = rulebook.tests.flatMap((fixture) => {
    meter.spendString(fixture.command);
    let projected = projectLegacySegments(fixture.command);
    if (projected.length > remainingSegments)
      throw new FixtureWorkLimitError;
    remainingSegments -= projected.length;
    let segments = projected.map((tokens) => {
      let prepared = prepareSegment(tokens, meter), result = matchPreparedSegment(prepared, rules, meter);
      return {
        prepared,
        result,
        matchedRule: result?.id.replace(/^custom\./, "") ?? null
      };
    }), firstSegment = segments[0] ?? {
      prepared: prepareSegment([], meter),
      result: null,
      matchedRule: null
    };
    if (fixture.expect === "allowed") {
      let blockedSegment = segments.find((segment) => segment.result);
      return blockedSegment ? [
        {
          command: fixture.command,
          message: `expected allowed but matched ${blockedSegment.matchedRule ?? "a rule"}`,
          trace: traceFixture(blockedSegment.prepared, rules, meter)
        }
      ] : [];
    }
    let firstBlockedSegment = segments.find((segment) => segment.result);
    if (!firstBlockedSegment)
      return [
        {
          command: fixture.command,
          message: `expected blocked by ${fixture.rule ?? "a rule"} but command was allowed`,
          trace: traceFixture(firstSegment.prepared, rules, meter)
        }
      ];
    if (!fixture.rule || firstBlockedSegment.matchedRule === fixture.rule)
      return [];
    return [
      {
        command: fixture.command,
        message: `expected blocked by ${fixture.rule} but matched ${firstBlockedSegment.matchedRule}`,
        trace: traceFixture(firstBlockedSegment.prepared, rules, meter)
      }
    ];
  });
  return { ok: failures.length === 0, failures };
}
function compileRules(rules, meter) {
  return rules.map((rule) => {
    meter.spend(1), meter.spendString(rule.command);
    let command2 = normalizeCommandToken(rule.command);
    if (meter.spendString(command2), rule.subcommand)
      meter.spendString(rule.subcommand);
    let blockArgs = /* @__PURE__ */ new Set;
    for (let blockArg of rule.block_args)
      meter.spendString(blockArg), blockArgs.add(blockArg);
    return { rule, command: command2, blockArgs };
  });
}
function prepareSegment(tokens, meter) {
  meter.spend(1);
  for (let token of tokens)
    meter.spendString(token);
  let commandToken = tokens[0] ?? "";
  meter.spendString(commandToken);
  let command2 = normalizeCommandToken(commandToken);
  meter.spendString(command2);
  let shortOpts = extractShortOpts(tokens);
  for (let shortOpt of shortOpts)
    meter.spendString(shortOpt);
  return { tokens, command: command2, shortOpts };
}
function matchPreparedSegment(segment, rules, meter) {
  if (segment.tokens.length === 0 || rules.length === 0)
    return null;
  for (let compiled of rules) {
    if (meter.spendString(segment.command), meter.spendString(compiled.command), segment.command !== compiled.command)
      continue;
    if (compiled.rule.subcommand && !matchesMeteredSubcommand(segment, compiled.rule.subcommand, meter))
      continue;
    if (!matchesMeteredBlockArgs(segment, compiled.blockArgs, meter))
      continue;
    return meter.spendString(compiled.rule.name), meter.spendString(compiled.rule.reason), {
      id: `custom.${compiled.rule.name}`,
      reason: `[${compiled.rule.name}] ${compiled.rule.reason}`,
      intent: compiled.rule.intent ?? "manual_only"
    };
  }
  return null;
}
function matchesMeteredSubcommand(segment, expectedSubcommand, meter) {
  return matchesCustomRuleSubcommand(segment.command, segment.tokens, expectedSubcommand, (value) => meter.spendString(value));
}
function matchesMeteredBlockArgs(segment, blockArgs, meter) {
  return matchesCustomRuleBlockArgs(segment.tokens, blockArgs, segment.shortOpts, (value) => meter.spendString(value));
}
function traceFixture(segment, rules, meter) {
  return rules.map((rule) => {
    let result = matchPreparedSegment(segment, [rule], meter);
    return meter.spendString(rule.rule.name), `${result ? "matched" : "skipped"} ${rule.rule.name}`;
  });
}
function fixtureLimitResult() {
  return {
    ok: !1,
    failures: [{ command: "", message: RULEBOOK_LIMIT_ERROR, trace: [] }]
  };
}

// src/core/rules/rulebook.ts
function validateRulebook(rulebook) {
  let ruleNames = /* @__PURE__ */ new Set;
  if (!rulebook || typeof rulebook !== "object")
    return { errors: ["Rulebook must be an object"], ruleNames };
  let rb = rulebook;
  if (!isRulebookWithinAcceptanceLimits(rb))
    return { errors: [RULEBOOK_LIMIT_ERROR], ruleNames };
  let diagnostics = createValidationDiagnostics();
  if (rb.rulebook_version !== 1)
    diagnostics.add("rulebook_version must be 1");
  if (!diagnostics.stopped && (typeof rb.name !== "string" || !NAME_PATTERN.test(rb.name)))
    diagnostics.add("name: required string matching rule name pattern");
  if (!diagnostics.stopped && (typeof rb.version !== "string" || rb.version === ""))
    diagnostics.add("version: required non-empty string");
  if (!diagnostics.stopped)
    if (!Array.isArray(rb.allowed_commands))
      diagnostics.add("allowed_commands: required array");
    else
      validateAllowedCommands(rb.allowed_commands, diagnostics);
  if (!diagnostics.stopped) {
    if (!Array.isArray(rb.rules))
      diagnostics.add("rules: required array");
    else
      for (let i = 0;!diagnostics.stopped && i < rb.rules.length; i++)
        for (let error of iterateCustomRuleErrors(rb.rules[i], i, ruleNames, {
          messageStyle: "rulebook"
        }))
          if (!diagnostics.add(error))
            break;
  }
  if (!diagnostics.stopped)
    if (!Array.isArray(rb.tests))
      diagnostics.add("tests: required array");
    else
      validateFixtures(rb.tests, rb.rules, diagnostics);
  if (!diagnostics.stopped && Array.isArray(rb.allowed_commands) && Array.isArray(rb.rules)) {
    let allowed = new Set(rb.allowed_commands.filter((cmd) => typeof cmd === "string"));
    for (let i = 0;!diagnostics.stopped && i < rb.rules.length; i++) {
      let rule = rb.rules[i];
      if (typeof rule.command === "string" && !allowed.has(rule.command))
        diagnostics.add(`rules[${i}].command: "${rule.command}" must be listed in allowed_commands`);
    }
  }
  return { errors: diagnostics.errors, ruleNames };
}
function createValidationDiagnostics() {
  return {
    errors: [],
    stopped: !1,
    add(error) {
      if (this.stopped)
        return !1;
      if (this.errors.length < RULEBOOK_LIMITS.maxValidationErrors)
        return this.errors.push(error), !0;
      return this.errors.push(RULEBOOK_VALIDATION_TRUNCATED), this.stopped = !0, !1;
    }
  };
}
function validateAllowedCommands(commands, diagnostics) {
  if (!Array.isArray(commands))
    return;
  let seen = /* @__PURE__ */ new Set;
  for (let i = 0;!diagnostics.stopped && i < commands.length; i++) {
    let command2 = commands[i];
    if (typeof command2 !== "string" || !COMMAND_PATTERN.test(command2)) {
      diagnostics.add(`allowed_commands[${i}]: must match command pattern`);
      continue;
    }
    if (seen.has(command2)) {
      diagnostics.add(`allowed_commands[${i}]: duplicate command "${command2}"`);
      continue;
    }
    seen.add(command2);
  }
}
function validateFixtures(tests, rules, diagnostics) {
  if (!Array.isArray(tests) || diagnostics.stopped)
    return;
  let blockedFixtures = /* @__PURE__ */ new Set, ruleNames = new Set(Array.isArray(rules) ? rules.map((rule) => rule && typeof rule === "object" ? rule.name : null).filter((name) => typeof name === "string") : []);
  for (let i = 0;!diagnostics.stopped && i < tests.length; i++) {
    let fixture = tests[i];
    if (!fixture || typeof fixture !== "object") {
      diagnostics.add(`tests[${i}]: must be an object`);
      continue;
    }
    let f = fixture;
    if (typeof f.command !== "string" || f.command.trim() === "") {
      if (!diagnostics.add(`tests[${i}].command: required non-empty string`))
        return;
    }
    if (f.expect !== "blocked" && f.expect !== "allowed") {
      if (!diagnostics.add(`tests[${i}].expect: must be "blocked" or "allowed"`))
        return;
    }
    if (f.rule !== void 0 && typeof f.rule !== "string") {
      if (!diagnostics.add(`tests[${i}].rule: must be a string if provided`))
        return;
    }
    if (f.expect === "blocked" && typeof f.rule !== "string") {
      if (!diagnostics.add(`tests[${i}].rule: required string for blocked fixtures`))
        return;
    }
    if (f.expect === "blocked" && typeof f.rule === "string")
      blockedFixtures.add(f.rule);
  }
  for (let i = 0;!diagnostics.stopped && i < (Array.isArray(rules) ? rules.length : 0); i++) {
    let rule = rules[i];
    if (typeof rule.name === "string" && !blockedFixtures.has(rule.name))
      diagnostics.add(`rules[${i}]: missing blocked fixture for rule "${rule.name}"`);
  }
  for (let rule of blockedFixtures) {
    if (diagnostics.stopped)
      break;
    if (!ruleNames.has(rule))
      diagnostics.add(`tests: blocked fixture references unknown rule "${rule}"`);
  }
}
function runRulebookFixtures(rulebook) {
  return evaluateRulebookFixtures(rulebook);
}
function assertValidRulebook(rulebook) {
  let result = validateRulebook(rulebook);
  if (result.errors.length > 0)
    throw Error(result.errors.join("; "));
  let parsed = rulebook, fixtures = runRulebookFixtures(parsed);
  if (!fixtures.ok) {
    if (fixtures.failures.length === 1 && fixtures.failures[0]?.command === "" && fixtures.failures[0].message === RULEBOOK_LIMIT_ERROR)
      throw Error(RULEBOOK_LIMIT_ERROR);
    throw Error(fixtures.failures.map((failure) => `${failure.command}: ${failure.message}`).join("; "));
  }
  return parsed;
}

// src/core/rules/policy/sources.ts
var GITHUB_REPOSITORY_REF_SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([A-Za-z0-9._-]+)$/;
function getRulebookLockEntrySourceIdentityError(entry) {
  if (isGitHubRulebookSource(entry.spec))
    return getGitHubLockEntrySourceIdentityError(entry);
  return getLocalLockEntrySourceIdentityError(entry);
}
function getLocalLockEntrySourceIdentityError(entry) {
  if (!NAME_PATTERN.test(entry.spec))
    return `Local rulebook sources must be bare names matching ${NAME_PATTERN}: ${entry.spec}`;
  if (entry.kind !== "local-directory")
    return `lock entry for ${entry.spec} must use local-directory kind`;
  if (entry.path === entry.spec && entry.name === entry.spec)
    return null;
  return `lock entry for ${entry.spec} does not match local source identity`;
}
function getGitHubLockEntrySourceIdentityError(entry) {
  let syntaxError = getRulebookSourceSyntaxError(entry.spec);
  if (syntaxError)
    return syntaxError;
  let parsed = parseGitHubSource(entry.spec);
  if (entry.kind !== "github")
    return `lock entry for ${entry.spec} must use github kind`;
  if (entry.owner === parsed.owner && entry.repo === parsed.repo && entry.ref === parsed.ref && entry.path === parsed.path && entry.name === parsed.name)
    return null;
  return `lock entry for ${entry.spec} does not match GitHub source identity`;
}
function getSelectedUpdateSpecs(config, lock, match) {
  let exactMatches = getExactSpecMatches(config.rules, match);
  if (exactMatches.length > 0)
    return { ok: !0, specs: exactMatches };
  if (!lock)
    return {
      ok: !1,
      result: {
        ok: !1,
        errors: [
          `No lockfile available to match rulebook name ${match}; use the exact source or run ${RULE_SYNC_COMMAND}`
        ],
        warnings: [],
        entries: []
      }
    };
  let configuredSpecs = new Set(config.rules), nameMatches = lock.rulebooks.filter((entry) => entry.name === match && configuredSpecs.has(entry.spec)).map((entry) => entry.spec);
  if (nameMatches.length === 1)
    return { ok: !0, specs: nameMatches };
  return noRulebookMatch(match, nameMatches);
}
function getRemoveMatches(rules, lock, match) {
  let exactMatches = getExactSpecMatches(rules, match);
  if (exactMatches.length > 0)
    return { ok: !0, specs: exactMatches };
  let githubRefMatches = getGitHubRepositoryRefMatches(rules, match);
  if (githubRefMatches.length > 0)
    return { ok: !0, specs: githubRefMatches };
  let githubRepositoryMatches = getGitHubRepositoryMatches(rules, match);
  if (!githubRepositoryMatches.ok)
    return githubRepositoryMatches;
  if (githubRepositoryMatches.specs.length > 0)
    return { ok: !0, specs: githubRepositoryMatches.specs };
  let nameMatches = lock ? rules.filter((spec) => lock.rulebooks.find((entry) => entry.spec === spec)?.name === match) : [];
  if (nameMatches.length === 1)
    return { ok: !0, specs: nameMatches };
  return noRulebookMatch(match, nameMatches);
}
function noRulebookMatch(match, nameMatches) {
  return {
    ok: !1,
    result: {
      ok: !1,
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
  let parsed = match.match(GITHUB_REPOSITORY_REF_SOURCE_RE), owner = parsed?.[1], repo = parsed?.[2], ref = parsed?.[3];
  if (!owner || !repo || !ref)
    return [];
  return getConfiguredGitHubSourceMatches(rules, (source) => {
    return source.owner === owner && source.repo === repo && source.ref === ref;
  });
}
function getGitHubRepositoryMatches(rules, match) {
  if (!isGitHubRepositorySource(match))
    return { ok: !0, specs: [] };
  let [owner, repo] = match.split("/"), specs = getConfiguredGitHubSourceMatches(rules, (source) => {
    return source.owner === owner && source.repo === repo;
  });
  if (new Set(specs.map((spec) => getConfiguredGitHubSource(spec)?.ref).filter((ref) => !!ref)).size < 2)
    return { ok: !0, specs };
  return {
    ok: !1,
    result: {
      ok: !1,
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
    let source = getConfiguredGitHubSource(spec);
    return source ? matches(source) : !1;
  });
}

// src/core/rules/policy/lockfile.ts
var SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/, RULEBOOK_SOURCE_KINDS = /* @__PURE__ */ new Set(["local-directory", "github"]);
function readLockfile(path) {
  let displayPath = typeof path === "string" ? path : path.path;
  try {
    let content = readPolicyFile(typeof path === "string" ? bindDelegatedPolicyFilesystemTarget(path) : path);
    if (content === null)
      return { lock: null, errors: [] };
    let parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object")
      return { lock: null, errors: [`malformed lockfile ${displayPath}: must be an object`] };
    let lock = parsed;
    if (lock.version !== 1 || !Array.isArray(lock.rulebooks))
      return { lock: null, errors: [`malformed lockfile ${displayPath}`] };
    let parsedEntries = lock.rulebooks.map((entry, index) => parseLockEntry(entry, `${displayPath}: rulebooks[${index}]`)), entryErrors = parsedEntries.flatMap((entry) => entry.errors);
    if (entryErrors.length > 0)
      return { lock: null, errors: [`malformed lockfile ${displayPath}`, ...entryErrors] };
    return {
      lock: {
        version: 1,
        rulebooks: parsedEntries.flatMap((entry) => entry.entry ? [entry.entry] : [])
      },
      errors: []
    };
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      return { lock: null, errors: [error.message] };
    return {
      lock: null,
      errors: ["malformed lockfile"]
    };
  }
}
function parseLockEntry(entry, prefix) {
  if (!entry || typeof entry !== "object")
    return { entry: null, errors: [`${prefix}: must be an object`] };
  let candidate = entry, errors = [
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
    let localEntry = {
      spec: requiredString(candidate, "spec"),
      kind: "local-directory",
      path: requiredString(candidate, "path"),
      name: requiredString(candidate, "name"),
      version: requiredString(candidate, "version"),
      digest: requiredString(candidate, "digest")
    }, identityError2 = getLockEntrySourceIdentityError(localEntry, prefix);
    if (identityError2)
      return { entry: null, errors: [identityError2] };
    return {
      entry: localEntry,
      errors: []
    };
  }
  let githubEntry = {
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
  }, identityError = getLockEntrySourceIdentityError(githubEntry, prefix);
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
  if (typeof candidate.kind !== "string")
    return [`${prefix}.kind: required string`];
  return RULEBOOK_SOURCE_KINDS.has(candidate.kind) ? [] : [`${prefix}.kind: unknown kind "${candidate.kind}"`];
}
function validateKindFields(candidate, prefix) {
  if (candidate.kind === "local-directory")
    return validateRequiredString(candidate, prefix, "path");
  if (candidate.kind === "github")
    return ["owner", "repo", "ref", "commit", "path"].flatMap((field) => validateRequiredString(candidate, prefix, field));
  return [];
}
function getLockEntrySourceIdentityError(entry, prefix) {
  let error = getRulebookLockEntrySourceIdentityError(entry);
  return error ? `${prefix}: ${error}` : null;
}
function requiredString(candidate, field) {
  let value = candidate[field];
  if (typeof value !== "string")
    throw Error(`Expected ${field} to be validated before reading`);
  return value;
}

// src/core/rules/policy/resolver.ts
import { createHash } from "node:crypto";
import { dirname as dirname7, join as join8 } from "node:path";
var GITHUB_FETCH_LIMITS = Object.freeze({
  timeoutMs: 15000,
  metadataBytes: 524288,
  commitBytes: 262144,
  treeBytes: 16777216,
  rawBytes: 4194304
});
async function resolveRulebookSource(spec, configDir, options2, filesystemScope = bindPolicyFilesystemScope(dirname7(dirname7(configDir)), "rules policy"), operation = createRuleSyncOperation()) {
  if (isGitHubRulebookSource(spec))
    return resolveGitHubRulebook(spec, operation);
  return resolveLocalRulebook(spec, configDir, options2, filesystemScope);
}
async function resolveRulebookSourceForSync(spec, configDir, options2, previousLock, filesystemScope, operation = createRuleSyncOperation()) {
  if (!isGitHubRulebookSource(spec) || options2.refresh)
    return resolveRulebookSource(spec, configDir, options2, filesystemScope, operation);
  let locked = previousLock?.rulebooks.find((entry) => entry.spec === spec);
  if (!locked || locked.kind !== "github")
    return resolveRulebookSource(spec, configDir, options2, filesystemScope, operation);
  return readLockedGitHubRulebook(locked, configDir, options2, filesystemScope, operation);
}
async function discoverGitHubRepositoryRulebooks(source, operation = createRuleSyncOperation()) {
  let [owner, repo] = source.split("/");
  if (!owner || !repo)
    throw Error(`Invalid GitHub repository source: ${source}`);
  let metadataResource = await fetchRuleSyncResource(`https://api.github.com/repos/${owner}/${repo}`, "metadata", operation), metadataResponse = metadataResource.response;
  if (!metadataResponse.ok)
    throw Error(`Failed to inspect ${source}: GitHub returned ${metadataResponse.status}`);
  let metadata2 = JSON.parse(metadataResource.content);
  if (!metadata2.default_branch)
    throw Error(`Failed to inspect ${source}: missing default branch`);
  let commit = await resolveGitHubCommit(owner, repo, metadata2.default_branch, source, operation), treeResource = await fetchRuleSyncResource(`https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`, "tree", operation), treeResponse = treeResource.response;
  if (!treeResponse.ok)
    throw Error(`Failed to inspect ${source}: GitHub tree returned ${treeResponse.status}`);
  let names = (JSON.parse(treeResource.content).tree ?? []).flatMap((entry) => {
    if (entry.type !== "blob" || typeof entry.path !== "string")
      return [];
    let match = entry.path.match(GITHUB_RULEBOOK_PATH_RE);
    return match?.[1] ? [match[1]] : [];
  }).sort();
  if (names.length === 0)
    throw Error(`No rulebooks found in ${source} under ${RULES_DIR}/`);
  return names.map((name) => ({
    spec: `${owner}/${repo}#${commit}/${name}`,
    display_ref: metadata2.default_branch
  }));
}
function resolveLocalRulebook(spec, configDir, _options, filesystemScope) {
  assertBareRulebookName(spec);
  let path = getLocalRulebookPath(configDir, spec), content = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, path));
  if (content === null)
    throw Error(`Rulebook source not found: ${spec}`);
  let rulebook = assertValidRulebook(parseRulebookJson(content, "Invalid local rulebook source."));
  if (rulebook.name !== spec)
    throw Error(`rulebook name "${rulebook.name}" must match local source "${spec}"`);
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
async function resolveGitHubRulebook(spec, operation) {
  let parsed = parseGitHubSource(spec), commit = await resolveGitHubCommit(parsed.owner, parsed.repo, parsed.ref, spec, operation), rawResource = await fetchRuleSyncResource(`https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${commit}/${parsed.path}`, "raw", operation), rawResponse = rawResource.response;
  if (!rawResponse.ok)
    throw Error(`Failed to fetch ${spec}: GitHub raw returned ${rawResponse.status}`);
  let content = rawResource.content, rulebook = assertValidRulebook(parseRulebookJson(content, "Invalid GitHub rulebook response."));
  if (rulebook.name !== parsed.name)
    throw Error(`rulebook name "${rulebook.name}" must match GitHub source "${parsed.name}"`);
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
async function readLockedGitHubRulebook(entry, configDir, options2, filesystemScope = bindPolicyFilesystemScope(dirname7(dirname7(configDir)), "rules policy"), operation) {
  let identityError = getRulebookLockEntrySourceIdentityError(entry);
  if (identityError)
    throw Error(`${identityError}; run ${RULE_SYNC_COMMAND}`);
  let cachePath = getRulebookCachePath(entry, getRulebookCacheOptions(configDir, options2)), content = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, cachePath));
  if (content !== null) {
    if (sha256Digest(content) === entry.digest)
      return { entry, rulebook: assertRulebookMatchesLockEntry(content, entry), content };
  }
  return fetchLockedGitHubRulebook(entry, operation);
}
async function fetchLockedGitHubRulebook(entry, operation) {
  let rawResource = await fetchRuleSyncResource(`https://raw.githubusercontent.com/${entry.owner}/${entry.repo}/${entry.commit}/${entry.path}`, "raw", operation), rawResponse = rawResource.response;
  if (!rawResponse.ok)
    throw Error(`Failed to restore ${entry.spec}: GitHub raw returned ${rawResponse.status}`);
  let content = rawResource.content;
  if (sha256Digest(content) !== entry.digest)
    throw Error(`locked GitHub digest mismatch for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
  return { entry, rulebook: assertRulebookMatchesLockEntry(content, entry), content };
}
function assertRulebookMatchesLockEntry(content, entry) {
  let rulebook = assertValidRulebook(parseRulebookJson(content, "Invalid cached rulebook."));
  if (rulebook.name !== entry.name)
    throw Error(`rulebook name "${rulebook.name}" must match lock entry "${entry.name}"`);
  return rulebook;
}
function parseRulebookJson(content, errorMessage) {
  try {
    return JSON.parse(content);
  } catch {
    throw Error(errorMessage);
  }
}
async function resolveGitHubCommit(owner, repo, ref, source, operation) {
  let commitResource = await fetchRuleSyncResource(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, "commit", operation), commitResponse = commitResource.response;
  if (!commitResponse.ok)
    throw Error(`Failed to resolve ${source}: GitHub returned ${commitResponse.status}`);
  let commitJson = JSON.parse(commitResource.content);
  if (!commitJson.sha)
    throw Error(`Failed to resolve commit for ${source}`);
  return commitJson.sha;
}
async function fetchGitHubResource(url, kind, options2 = {}) {
  if (options2.signal?.aborted)
    throw options2.signal.reason;
  let budget = options2.budget ?? createRuleSyncResourceBudget(), controller = new AbortController, forwardAbort = () => controller.abort(options2.signal?.reason);
  options2.signal?.addEventListener("abort", forwardAbort, { once: !0 });
  let timedOut = !1, timeout = setTimeout(() => {
    if (controller.signal.aborted)
      return;
    timedOut = !0, controller.abort();
  }, options2.timeoutMs ?? GITHUB_FETCH_LIMITS.timeoutMs);
  try {
    if (options2.signal?.aborted)
      throw options2.signal.reason;
    reserveGitHubRequest(budget);
    let response = await (options2.fetch ?? fetch)(url, {
      signal: controller.signal,
      redirect: "error"
    });
    if (!response.ok)
      return cancelGitHubResponseBody(response), { response, content: "" };
    return {
      response,
      content: await readGitHubResponseText(response, kind, budget, () => controller.abort())
    };
  } catch (error) {
    if (timedOut)
      throw Error("GitHub request timed out", { cause: error });
    if (options2.signal?.aborted)
      throw options2.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout), options2.signal?.removeEventListener("abort", forwardAbort);
  }
}
function fetchRuleSyncResource(url, kind, operation) {
  return fetchGitHubResource(operation.resolveUrl?.(url) ?? url, kind, {
    budget: operation.budget,
    signal: operation.controller.signal
  });
}
async function readGitHubResponseText(response, kind, budget = createRuleSyncResourceBudget(), abortRequest) {
  let limit = GITHUB_FETCH_LIMITS[`${kind}Bytes`], declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit)
    throw cancelGitHubResponseBody(response), Error(`GitHub ${kind} response exceeds ${limit} bytes`);
  if (!response.body)
    return "";
  let reader = response.body.getReader(), chunks = [], bytes = 0;
  while (!0) {
    let chunk = await reader.read();
    if (chunk.done)
      break;
    try {
      reserveGitHubResponseBytes(budget, chunk.value.byteLength);
    } catch (error) {
      throw abortRequest?.(), cancelGitHubResponseReader(reader), error;
    }
    if (bytes += chunk.value.byteLength, bytes > limit)
      throw abortRequest?.(), cancelGitHubResponseReader(reader), Error(`GitHub ${kind} response exceeds ${limit} bytes`);
    chunks.push(Buffer.from(chunk.value));
  }
  return Buffer.concat(chunks, bytes).toString("utf-8");
}
function cancelGitHubResponseBody(response) {
  if (!response.body)
    return;
  safelyCancelGitHubResponse(() => response.body?.cancel());
}
function cancelGitHubResponseReader(reader) {
  safelyCancelGitHubResponse(() => reader.cancel());
}
function safelyCancelGitHubResponse(cancel) {
  try {
    Promise.resolve(cancel()).catch(() => {});
  } catch {}
}
function getLocalRulebookPath(configDir, name) {
  return join8(configDir, name, RULEBOOK_FILE);
}
function sha256Digest(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

// src/core/rules/policy/scope-policy.ts
function loadRulesPolicy(options2 = {}) {
  let paths = getPolicyPaths(options2), sameConfigPath = !1;
  try {
    sameConfigPath = isSamePolicyFilesystemTarget(paths.userConfigTarget, paths.projectConfigTarget);
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      return invalidLoadedRulesPolicy(paths, error.message);
    throw error;
  }
  let user = readRulesConfig(paths.userConfigTarget), project = sameConfigPath ? { config: null, errors: [] } : readRulesConfig(paths.projectConfigTarget), legacyErrors;
  try {
    legacyErrors = getLegacyRulesConfigErrors(paths, options2);
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      return invalidLoadedRulesPolicy(paths, error.message);
    throw error;
  }
  let errors = [
    ...legacyErrors,
    ...formatPolicyReadErrors(paths.userConfigPath, user.errors),
    ...formatPolicyReadErrors(paths.projectConfigPath, project.errors)
  ], userPolicy = user.config ? loadScopePolicy(user.config, paths.userLockPath, dirname8(paths.userConfigPath), options2, "user", paths.userScope) : emptyScopePolicy(), projectPolicy = project.config ? loadScopePolicy(project.config, paths.projectLockPath, dirname8(paths.projectConfigPath), options2, "project", paths.projectScope) : emptyScopePolicy(), duplicateNames = getDuplicateRulebookNames([
    ...user.config ? getConfiguredLockEntries(user.config, paths.userLockTarget) : [],
    ...project.config ? getConfiguredLockEntries(project.config, paths.projectLockTarget) : []
  ]), userOverrides = user.config?.overrides ?? {}, projectOverrides = project.config?.overrides ?? {};
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
    userConfig: user.config ?? void 0,
    projectConfig: project.config ?? void 0,
    ...paths
  };
}
function getRulesConfigSourceDisplayMap(configPath, filesystemScope) {
  let scope = filesystemScope ?? bindPolicyFilesystemScope(dirname8(dirname8(configPath)), "rules policy"), config = readRulesConfig(getPolicyFilesystemTargetForPath(scope, configPath)).config, lock = readLockfile(getPolicyFilesystemTargetForPath(scope, getRulesLockPathForConfigPath(configPath))).lock;
  if (!config || !lock)
    return /* @__PURE__ */ new Map;
  let configuredSources = new Set(config.rules);
  return new Map(lock.rulebooks.filter((entry) => configuredSources.has(entry.spec)).map((entry) => [entry.spec, getRulebookDisplaySource(entry)]));
}
function getRulesConfigRuntimeErrorsForConfig(configPath, lockPath, options2, filesystemScope) {
  let loaded = loadScopePolicyForConfig(configPath, lockPath, options2, filesystemScope);
  if (!loaded)
    return [];
  return [...loaded.scope.errors, ...getUnknownOverrideErrorsForScope(loaded.config, loaded.scope)];
}
function loadScopePolicyForConfig(configPath, lockPath, options2, filesystemScope) {
  let scope = filesystemScope ?? bindPolicyFilesystemScope(dirname8(dirname8(configPath)), "rules policy"), config = readRulesConfig(getPolicyFilesystemTargetForPath(scope, configPath)).config;
  if (!config)
    return null;
  return {
    config,
    scope: loadScopePolicy(config, lockPath, dirname8(configPath), options2, "project", scope)
  };
}
function getUnknownOverrideErrorsForScope(config, scope) {
  return scope.canValidateOverrides ? getUnknownOverrideErrors(config.overrides ?? {}, scope.knownRuleIds) : [];
}
function loadScopePolicy(config, lockPath, configDir, options2, source, filesystemScope = bindPolicyFilesystemScope(dirname8(dirname8(configDir)), source === "user" ? "user policy" : "project policy")) {
  let lockTarget;
  try {
    lockTarget = getPolicyFilesystemTargetForPath(filesystemScope, lockPath);
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      return { ...emptyScopePolicy(), errors: [error.message], canValidateOverrides: !1 };
    throw error;
  }
  let lockResult = readLockfile(lockTarget);
  if (lockResult.errors.length > 0)
    return { ...emptyScopePolicy(), errors: lockResult.errors, canValidateOverrides: !1 };
  let lock = lockResult.lock;
  if (!lock && config.rules.length > 0)
    return {
      ...emptyScopePolicy(),
      errors: [`missing lockfile ${lockPath}; run ${RULE_SYNC_COMMAND}`],
      canValidateOverrides: !1
    };
  let entries = lock?.rulebooks ?? [], entriesBySpec = new Map(entries.map((entry) => [entry.spec, entry])), errors = [], loaded = config.rules.flatMap((spec) => {
    let entry = entriesBySpec.get(spec);
    if (!entry)
      return errors.push(`missing lock entry for ${spec}; run ${RULE_SYNC_COMMAND}`), [];
    let loadedRulebook = loadLockedRulebook(entry, configDir, options2, filesystemScope);
    if (loadedRulebook.errors.length > 0 || !loadedRulebook.rulebook)
      return errors.push(...loadedRulebook.errors), [];
    let rulebook = loadedRulebook.rulebook;
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
  }), rules = loaded.flatMap((item) => item.rules);
  return {
    rules,
    rulebooks: loaded.map((item) => item.rulebook),
    entries,
    knownRuleIds: new Set(rules.map((rule) => rule.name)),
    errors,
    canValidateOverrides: errors.length === 0
  };
}
function loadLockedRulebook(entry, configDir, options2, filesystemScope) {
  let errors = [], cachePath = getRulebookCachePath(entry, getRulebookCacheOptions(configDir, options2)), cacheContent;
  try {
    cacheContent = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, cachePath));
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      return { rulebook: null, errors: [error.message] };
    throw error;
  }
  if (cacheContent === null)
    return {
      rulebook: null,
      errors: [`missing cache entry for ${entry.spec}; run ${RULE_SYNC_COMMAND}`]
    };
  if (sha256Digest(cacheContent) !== entry.digest)
    return errors.push(`cache digest mismatch for ${entry.spec}; run ${RULE_SYNC_COMMAND}`), { rulebook: null, errors };
  let rulebook = null;
  try {
    let parsed;
    try {
      parsed = JSON.parse(cacheContent);
    } catch {
      return errors.push(`invalid cached rulebook for ${entry.spec}`), { rulebook: null, errors };
    }
    assertValidRulebook(parsed), rulebook = parsed;
  } catch (error) {
    errors.push(`invalid cached rulebook for ${entry.spec}: ${error instanceof Error ? error.message : "invalid rulebook"}`);
  }
  if (entry.kind === "local-directory") {
    let sourcePath = resolve6(configDir, entry.path), sourceRelative = relative4(resolve6(configDir), sourcePath);
    if (sourceRelative === ".." || sourceRelative.startsWith(`..${sep5}`) || isAbsolute8(sourceRelative))
      return errors.push(`lockfile local source path for ${entry.spec} must stay within ${configDir}; run ${RULE_SYNC_COMMAND}`), { rulebook: null, errors };
    let localPath = join9(sourcePath, RULEBOOK_FILE), localContent;
    try {
      localContent = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, localPath));
    } catch (error) {
      if (error instanceof PolicyFilesystemError)
        return { rulebook: null, errors: [error.message] };
      throw error;
    }
    if (localContent === null)
      errors.push(`missing local source for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
    else if (sha256Digest(localContent) !== entry.digest)
      errors.push(getLocalSourceDriftError(entry.spec, localContent));
  }
  return { rulebook: errors.length === 0 ? rulebook : null, errors };
}
function mergeTransparentWrappers(userConfig, projectConfig) {
  return [
    .../* @__PURE__ */ new Set([
      ...userConfig?.transparent_wrappers ?? [],
      ...projectConfig?.transparent_wrappers ?? []
    ])
  ];
}
function getLegacyRulesConfigErrors(paths, options2) {
  return Array.from(/* @__PURE__ */ new Set([
    ...getLegacyRulesConfigError(getLegacyUserRulesConfigPath(options2), paths.userConfigPath, "~/.cc-safety-net/config.json", paths.userScope, paths.userConfigTarget, paths.userScope),
    ...getLegacyRulesConfigError(paths.projectLegacyPath, paths.projectConfigPath, ".safety-net.json", paths.projectLegacyScope, paths.projectConfigTarget, paths.projectScope)
  ]));
}
function getLegacyRulesConfigError(legacyPath, configPath, migratedFrom, filesystemScope, configTarget, configFilesystemScope) {
  let legacyContent = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, legacyPath));
  if (legacyContent === null)
    return [];
  if (hasMigrationEvidence(configTarget, dirname8(configPath), migratedFrom, configFilesystemScope))
    return [];
  if (!legacyRulesConfigNeedsMigration(legacyContent))
    return [];
  return [
    `legacy rules config location is no longer used; ask the user to run ${RULE_MIGRATE_COMMAND}`
  ];
}
function legacyRulesConfigNeedsMigration(content) {
  try {
    let parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object")
      return !0;
    let config = parsed;
    if (config.version !== 1)
      return !0;
    if (config.rules === void 0)
      return !1;
    if (!Array.isArray(config.rules))
      return !0;
    return config.rules.length > 0;
  } catch {
    return !0;
  }
}
function hasMigrationEvidence(configTarget, configDir, migratedFrom, filesystemScope) {
  let config = readRulesConfig(configTarget).config;
  if (!config)
    return !1;
  return config.rules.some((source) => getRulebookMigratedFromTarget(configDir, source, filesystemScope) === migratedFrom);
}
function getRulebookMigratedFromTarget(configDir, source, filesystemScope) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(source))
    return null;
  let path = join9(configDir, source, RULEBOOK_FILE);
  try {
    let content = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, path));
    if (content === null)
      return null;
    let rulebook = JSON.parse(content);
    return typeof rulebook.migrated_from === "string" ? rulebook.migrated_from : null;
  } catch {
    return null;
  }
}
function getLocalSourceDriftError(spec, content) {
  try {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return `invalid local rulebook for ${spec}; fix the rulebook, then run ${RULE_SYNC_COMMAND}`;
    }
    assertValidRulebook(parsed);
  } catch (error) {
    return `invalid local rulebook for ${spec}: ${error instanceof Error ? error.message : String(error)}; fix the rulebook, then run ${RULE_SYNC_COMMAND}`;
  }
  return `local source digest mismatch for ${spec}; run ${RULE_SYNC_COMMAND}`;
}
function applyOverrides(rules, overrides) {
  return rules.flatMap((rule) => {
    let override = overrides[rule.name];
    if (override === "off")
      return [];
    if (override && typeof override === "object")
      return [{ ...rule, intent: override.intent ?? rule.intent, reason: override.reason }];
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
  let seen = /* @__PURE__ */ new Set, duplicates = /* @__PURE__ */ new Set;
  for (let entry of entries) {
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
function formatPolicyReadErrors(path, errors) {
  return errors.map((error) => error.startsWith("Unable to access ") ? error : `${path}: ${error}`);
}
function invalidLoadedRulesPolicy(paths, error) {
  return {
    rules: [],
    transparent_wrappers: [],
    rulebooks: [],
    errors: [error],
    userConfigPath: paths.userConfigPath,
    projectConfigPath: paths.projectConfigPath,
    userLockPath: paths.userLockPath,
    projectLockPath: paths.projectLockPath
  };
}
function emptyScopePolicy() {
  return {
    rules: [],
    rulebooks: [],
    entries: [],
    knownRuleIds: /* @__PURE__ */ new Set,
    errors: [],
    canValidateOverrides: !0
  };
}

// src/config/policy-snapshot.ts
function loadPolicySnapshot(options2 = {}) {
  let rules = loadRulesPolicy(options2), userPolicy = loadPolicyConfig(options2), diagnostics = [...rules.errors, ...userPolicy.errors], policy = {
    rules: rules.errors.length === 0 ? rules.rules : [],
    transparentWrappers: rules.errors.length === 0 ? rules.transparent_wrappers : [],
    safety: normalizeSafety2(userPolicy.safety),
    worktreeMode: userPolicy.worktreeMode,
    destructiveCommandProtectionEnabled: userPolicy.destructiveCommandProtectionEnabled,
    destructiveCommandRuleOverrides: { ...userPolicy.destructiveCommandRuleOverrides },
    secretProtection: {
      enabled: userPolicy.secretProtection.enabled ?? !0,
      disabledRules: [...userPolicy.secretProtection.disabledRules ?? []],
      denyPaths: [...userPolicy.secretProtection.denyPaths]
    }
  }, snapshot = diagnostics.length === 0 ? createPolicySnapshot(policy) : createPolicySnapshot(policy, {
    diagnostics,
    reason: combineInvalidReasons(rules.errors.length > 0 ? withTerminalPeriod(rules.errors.join("; ")) : void 0, userPolicy.errors.length > 0 ? `invalid policy config: ${userPolicy.errors.join("; ")}. Fix or remove the policy file manually` : void 0)
  }), overrides = {
    ...rules.userConfig?.overrides ?? {},
    ...rules.projectConfig?.overrides ?? {}
  };
  return registerPolicyRuleMetadata(snapshot, new Map(snapshot.policy.rules.map((rule) => {
    let rulebook = rules.rulebooks.find((item) => item.rules.includes(rule.name)), override = overrides[rule.name];
    return [
      rule.name,
      Object.freeze({
        id: rule.name,
        ...rulebook ? {
          rulebook: Object.freeze({ name: rulebook.name, version: rulebook.version }),
          ...isPublicRuleSource(rulebook.spec) ? { source: rulebook.spec } : {}
        } : {},
        ...override && typeof override === "object" ? { override: Object.freeze({ type: "reason", reason: override.reason }) } : {}
      })
    ];
  })));
}
function isPublicRuleSource(source) {
  return /^(?:[A-Za-z0-9_.-]+$|https:\/\/github\.com\/|github:|gh:|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#|$))/.test(source);
}
function createPolicySnapshot(policy, invalid) {
  let frozenPolicy = freezePolicy(policy);
  if (!invalid)
    return Object.freeze({
      state: "ready",
      policy: frozenPolicy,
      diagnostics: Object.freeze([])
    });
  return Object.freeze({
    state: "invalid",
    policy: frozenPolicy,
    diagnostics: Object.freeze([...invalid.diagnostics]),
    reason: invalid.reason
  });
}
function normalizeSafety2(safety) {
  let overrides = safety.overrides, normalizedOverrides = {
    ...overrides?.failClosed !== void 0 ? { failClosed: overrides.failClosed } : {},
    ...overrides?.paranoidRm !== void 0 ? { paranoidRm: overrides.paranoidRm } : {},
    ...overrides?.paranoidInterpreters !== void 0 ? { paranoidInterpreters: overrides.paranoidInterpreters } : {}
  };
  return {
    ...safety.level !== void 0 ? { level: safety.level } : {},
    ...Object.keys(normalizedOverrides).length > 0 ? { overrides: normalizedOverrides } : {}
  };
}
function freezePolicy(policy) {
  return Object.freeze({
    ...policy,
    rules: Object.freeze(policy.rules.map((rule) => Object.freeze({
      ...rule,
      block_args: Object.freeze([...rule.block_args])
    }))),
    transparentWrappers: Object.freeze([...policy.transparentWrappers]),
    safety: Object.freeze({
      ...policy.safety,
      ...policy.safety.overrides ? { overrides: Object.freeze({ ...policy.safety.overrides }) } : {}
    }),
    destructiveCommandRuleOverrides: Object.freeze({
      ...policy.destructiveCommandRuleOverrides
    }),
    secretProtection: Object.freeze({
      ...policy.secretProtection,
      disabledRules: Object.freeze([...policy.secretProtection.disabledRules]),
      denyPaths: Object.freeze([...policy.secretProtection.denyPaths])
    })
  });
}
function combineInvalidReasons(...reasons) {
  return withTerminalPeriod(reasons.filter((reason) => !!reason).join("; "));
}
function withTerminalPeriod(value) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

// src/core/analyze/dangerous-text.ts
function dangerousInTextMatch(text, scanWork) {
  chargeScan(scanWork, text, 2);
  let lower = text.toLowerCase(), stripped = lower.trimStart(), isEchoOrRg = stripped.startsWith("echo ") || stripped.startsWith("rg "), patterns = [
    { scan: "rm", label: "rm -rf" },
    { scan: "reset-hard", label: "git reset --hard" },
    { scan: "reset-merge", label: "git reset --merge" },
    { scan: "clean", label: "git clean -f" },
    { scan: "checkout", label: "git checkout --force" },
    { scan: "push-force", label: "git push --force" },
    { scan: "push-refspec", label: "git push --force" },
    { scan: "push-delete", label: "git push delete" },
    { scan: "branch", label: "git branch -D", caseSensitive: !0 },
    { scan: "tag", label: "git tag -d" },
    { regex: /\bgit\s+stash\s+(drop|clear)\b/, label: "git stash drop/clear" },
    { regex: /\bgit\s+checkout\s+--\s/, label: "git checkout --" },
    { scan: "restore", label: "git restore without --staged" },
    { scan: "find", label: "find -delete", skipForEchoRg: !0 }
  ];
  for (let pattern of patterns) {
    if (pattern.skipForEchoRg && isEchoOrRg)
      continue;
    let target = pattern.caseSensitive ? text : lower;
    if (pattern.regex)
      chargeNativeLinearPass(scanWork, target);
    if ((pattern.regex?.test(target) ?? !1) || pattern.scan && hasLinearDangerousText(target, pattern.scan, scanWork))
      return destructiveCommandMatch("raw-text.dangerous-command", `Unparseable command text contains a destructive pattern (${pattern.label}). Rewrite as a plain, parseable command so it can be analyzed.`);
  }
  return null;
}

// src/core/analyze/derived-command-budget.ts
var DERIVED_COMMAND_WORK_LIMITS = Object.freeze({
  maxDerivedTokens: 16384
}), REASON_DERIVED_COMMAND_WORK_LIMIT = "Command analysis exceeds CC Safety Net's derived-command work limit. Reduce nested or embedded command complexity and retry.", REASON_ENV_SPLIT_STRING_UNVERIFIABLE = "env -S split-string variables cannot be resolved safely. Use literal values or expand the command explicitly.";

class DerivedCommandWorkLimitError extends Error {
  constructor() {
    super("Command analysis exceeds CC Safety Net's derived-command work limit. Reduce nested or embedded command complexity and retry.");
    this.name = "DerivedCommandWorkLimitError";
  }
}

class EnvSplitStringExpansionError extends Error {
  constructor() {
    super("env -S split-string variables cannot be resolved safely. Use literal values or expand the command explicitly.");
    this.name = "EnvSplitStringExpansionError";
  }
}
function createDerivedCommandWorkBudget() {
  return { derivedTokens: 0 };
}
function reserveDerivedCommandTokens(budget, derivedTokens) {
  if (!Number.isSafeInteger(budget.derivedTokens) || budget.derivedTokens < 0 || budget.derivedTokens > DERIVED_COMMAND_WORK_LIMITS.maxDerivedTokens || !Number.isSafeInteger(derivedTokens) || derivedTokens < 0 || derivedTokens > DERIVED_COMMAND_WORK_LIMITS.maxDerivedTokens - budget.derivedTokens)
    throw new DerivedCommandWorkLimitError;
  budget.derivedTokens += derivedTokens;
}

// src/core/analyze/heredoc-files.ts
import { isAbsolute as isAbsolute9, resolve as resolve7 } from "node:path";
var MAX_TRACKED_HEREDOC_FILES = 64;
function resolveTrackedHeredocPath(source, effectiveCwd) {
  let path = isAbsolute9(source) ? resolve7(source) : effectiveCwd ? resolve7(effectiveCwd, source) : void 0;
  if (!path)
    return;
  try {
    return resolveExistingPath(path);
  } catch {
    return path;
  }
}
function isPersistentHeredocFilePath(path) {
  return !["/dev", "/proc", "/sys"].some((root) => path === root || path.startsWith(`${root}/`));
}

// src/core/analyze/parallel-budget.ts
var PARALLEL_ANALYSIS_LIMITS = Object.freeze({
  maxChildAnalyses: 1024,
  maxDerivedTokens: 16384,
  maxDerivedBytes: 1048576,
  maxPlaceholderReplacements: 16384
}), REASON_PARALLEL_ANALYSIS_LIMIT = "Parallel command expands beyond CC Safety Net's analysis limits. Reduce the template or explicit argument list and retry.";

class ParallelAnalysisLimitError extends Error {
  constructor() {
    super("Parallel command expands beyond CC Safety Net's analysis limits. Reduce the template or explicit argument list and retry.");
    this.name = "ParallelAnalysisLimitError";
  }
}
function createParallelAnalysisBudget() {
  return {
    childAnalyses: 0,
    derivedTokens: 0,
    derivedBytes: 0,
    placeholderReplacements: 0
  };
}
function reserveParallelAnalysis(budget, reservation) {
  let childAnalyses = reservation.childAnalyses ?? 0, derivedTokens = reservation.derivedTokens ?? 0, derivedBytes = reservation.derivedBytes ?? 0, placeholderReplacements = reservation.placeholderReplacements ?? 0;
  if (exceedsLimit(budget.childAnalyses, childAnalyses, PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses) || exceedsLimit(budget.derivedTokens, derivedTokens, PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens) || exceedsLimit(budget.derivedBytes, derivedBytes, PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes) || exceedsLimit(budget.placeholderReplacements, placeholderReplacements, PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements))
    throw new ParallelAnalysisLimitError;
  budget.childAnalyses += childAnalyses, budget.derivedTokens += derivedTokens, budget.derivedBytes += derivedBytes, budget.placeholderReplacements += placeholderReplacements;
}
function exceedsLimit(current, amount, limit) {
  return !Number.isSafeInteger(current) || current < 0 || current > limit || !Number.isSafeInteger(amount) || amount < 0 || amount > limit - current;
}

// src/core/analyze/recursive-delete-targets.ts
import { homedir as homedir4 } from "node:os";
import { normalize as normalize3, posix, resolve as resolve8, sep as sep7 } from "node:path";

// src/core/analyze/tmpdir.ts
import { lstatSync as lstatSync4, realpathSync as realpathSync7 } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute as isAbsolute10, join as join10, normalize as normalize2, parse as parsePath3, sep as sep6 } from "node:path";
var INITIAL_SYSTEM_TMPDIR = tmpdir(), TEMP_ROOTS = ["/tmp", "/var/tmp", "/private/tmp", "/private/var/tmp"], TRUSTED_TEMP_ROOTS = buildTrustedTempRoots(), DEFAULT_IFS = ` 	
`;
function isTmpdirOverriddenToNonTemp(envAssignments) {
  if (hasUnsafeTmpdirWordSplitting(envAssignments))
    return !0;
  if (!envAssignments.has("TMPDIR"))
    return !1;
  return !isAssignedTmpdirValueTrusted(envAssignments.get("TMPDIR") ?? "");
}
function isTmpdirValueTrusted(envAssignments) {
  if (envAssignments.has("TMPDIR"))
    return isAssignedTmpdirValueTrusted(envAssignments.get("TMPDIR") ?? "");
  let tmpdirValue = getEffectiveTmpdirValue(envAssignments);
  if (tmpdirValue === void 0)
    return !0;
  return isAssignedTmpdirValueTrusted(tmpdirValue);
}
function getEffectiveTmpdirValue(envAssignments) {
  return getEffectiveShellEnvValue(envAssignments, "TMPDIR");
}
function isTmpdirKnownEmpty(envAssignments) {
  if (envAssignments.has("TMPDIR"))
    return (envAssignments.get("TMPDIR") ?? "") === "";
  return !1;
}
function isAssignedTmpdirValueTrusted(tmpdirValue) {
  if (!tmpdirValue)
    return !1;
  if (hasUnsafeTmpdirShellExpansion(tmpdirValue))
    return !1;
  return isTrustedTempPath(tmpdirValue);
}
function hasUnsafeTmpdirWordSplitting(envAssignments) {
  let ifs = getEffectiveShellEnvValue(envAssignments, "IFS");
  return ifs !== void 0 && ifs !== "" && ifs !== DEFAULT_IFS;
}
function isTrustedTempPath(path) {
  let normalizedPath = tryResolveExistingPathComponents(path);
  return normalizedPath !== null && TRUSTED_TEMP_ROOTS.some((root) => isPathOrSubpath(normalizedPath, root));
}
function isTrustedTempRootPath(path) {
  let normalizedPath = tryResolveExistingPathComponents(path);
  return normalizedPath !== null && TRUSTED_TEMP_ROOTS.includes(normalizedPath);
}
function buildTrustedTempRoots() {
  let roots = TEMP_ROOTS.map((root) => tryResolveExistingPathComponents(root) ?? normalize2(root)), initialTmpdir = tryResolveExistingPathComponents(INITIAL_SYSTEM_TMPDIR);
  if (!initialTmpdir)
    return roots;
  if (process.platform === "win32")
    return [...roots, initialTmpdir];
  if (process.platform === "darwin" && isMacOSPerUserTempRoot(initialTmpdir))
    return [...roots, initialTmpdir];
  return roots;
}
function hasUnsafeTmpdirShellExpansion(path) {
  return /[\s$`*?[]/.test(path) || /\{[^{}]*(?:,|\.\.)[^{}]*\}/.test(path) || /[+@!]\([^)]*\)/.test(path);
}
function getEffectiveShellEnvValue(envAssignments, name) {
  return envAssignments.has(name) ? envAssignments.get(name) : getOwnEnvValue(name);
}
function isMacOSPerUserTempRoot(path) {
  return /^\/(?:private\/)?var\/folders\/[^/]{2}\/[^/]+\/T$/.test(path);
}
function tryResolveExistingPathComponents(path) {
  try {
    return resolveExistingPathComponents(path);
  } catch {
    return null;
  }
}
function resolveExistingPathComponents(path) {
  let normalized = normalize2(path);
  if (!isAbsolute10(normalized))
    return normalized;
  let root = parsePath3(normalized).root, components = normalized.slice(root.length).split(/[\\/]+/).filter(Boolean), current = root;
  for (let i = 0;i < components.length; i++) {
    let candidate = join10(current, components[i] ?? "");
    if (!lstatSync4(candidate, { throwIfNoEntry: !1 }))
      return join10(candidate, ...components.slice(i + 1));
    current = realpathSync7(candidate);
  }
  return current;
}
function isPathOrSubpath(path, basePath) {
  if (path === basePath)
    return !0;
  let baseWithSlash = basePath.endsWith(sep6) ? basePath : `${basePath}${sep6}`;
  return path.startsWith(baseWithSlash);
}

// src/core/analyze/recursive-delete-targets.ts
var IS_WINDOWS = process.platform === "win32";
function createRecursiveDeleteTargetContext(options2 = {}) {
  return {
    anchoredCwd: options2.originalCwd ?? options2.cwd ?? null,
    resolvedCwd: options2.cwd ?? null,
    strict: options2.strict ?? !1,
    paranoid: options2.paranoid ?? !1,
    trustTmpdirVar: options2.allowTmpdirVar ?? !0,
    posixShell: options2.posixShell ?? !1,
    tmpdirVarExpandsEmpty: options2.tmpdirVarExpandsEmpty ?? !1,
    tmpdirWordSplittingUnsafe: options2.tmpdirWordSplittingUnsafe ?? !1,
    trustedTmpdirValue: options2.trustedTmpdirValue ?? options2.allowTmpdirVar ?? !0,
    homeDir: getHomeDirForRmPolicy(),
    pathCanonicalizationBudget: createPathCanonicalizationBudget()
  };
}
function classifyRecursiveDeleteTarget(target, ctx, options2 = {}) {
  let targetIsLiteral = options2.targetIsLiteral ?? !1;
  if (!targetIsLiteral && ctx.tmpdirWordSplittingUnsafe && !options2.tmpdirWordSplittingProtected && containsTmpdirVariable(target))
    return { kind: "outside_anchored_cwd" };
  let normalizedTarget = target, dynamic = !targetIsLiteral && isDynamicTarget(normalizedTarget, ctx.posixShell);
  if (isUnsupportedWindowsNamespacePath(normalizedTarget))
    return { kind: "outside_anchored_cwd" };
  if (isDangerousRootOrHomeTarget(normalizedTarget, targetIsLiteral))
    return { kind: "root_or_home_target" };
  if (isTempTarget(normalizedTarget, ctx.trustTmpdirVar, ctx.posixShell, dynamic, targetIsLiteral, options2.tmpdirWordSplittingProtected ?? !1, ctx.trustedTmpdirValue))
    return { kind: "temp_target" };
  if (dynamic)
    return { kind: "dynamic_target" };
  let anchoredCwd = ctx.anchoredCwd;
  if (anchoredCwd) {
    if (!options2.skipHomeCwd && isCwdHomeForRmPolicy(anchoredCwd, ctx.homeDir, ctx.pathCanonicalizationBudget))
      return { kind: "home_cwd_target" };
    if (!options2.skipCwdSelf && isCwdSelfTarget(normalizedTarget, ctx.resolvedCwd ?? anchoredCwd, ctx.pathCanonicalizationBudget))
      return { kind: "cwd_self_target" };
    if (isTargetWithinCwd(normalizedTarget, anchoredCwd, ctx.resolvedCwd ?? anchoredCwd, dynamic, targetIsLiteral, ctx.pathCanonicalizationBudget))
      return { kind: "within_anchored_cwd" };
  }
  return { kind: "outside_anchored_cwd" };
}
function isTrustedTempDescendantTarget(target, ctx, options2 = {}) {
  let { containmentTarget, ...classificationOptions } = options2;
  if (classifyRecursiveDeleteTarget(target, ctx, classificationOptions).kind !== "temp_target")
    return !1;
  let normalized = target.trim();
  if (isTrustedTmpdirVariableRootTarget(normalized))
    return !1;
  if (isTrustedTempRootPath(normalized))
    return !1;
  return ![ctx.anchoredCwd, ctx.resolvedCwd].some((workspace) => isWorkspaceWithinTarget(containmentTarget ?? normalized, workspace, ctx.pathCanonicalizationBudget));
}
function isDangerousRootOrHomeTarget(path, targetIsLiteral = !1) {
  let trimmed = path.trim(), normalized = posix.normalize(trimmed), windowsNormalized = trimmed.replace(/\\/g, "/");
  if (normalized === "/" || normalized === "/*")
    return !0;
  if (/^[A-Za-z]:\/+\*?$/.test(windowsNormalized) || /^\/\/[^/]+\/+[^/]+(?:\/+\*?)?$/.test(windowsNormalized))
    return !0;
  if (!targetIsLiteral && (normalized === "~" || normalized === "~/" || normalized.startsWith("~/"))) {
    if (normalized === "~" || normalized === "~/" || normalized === "~/*")
      return !0;
  }
  if (!targetIsLiteral && (normalized === "$HOME" || normalized === "$HOME/" || normalized === "$HOME/*"))
    return !0;
  if (!targetIsLiteral && (normalized === "${HOME}" || normalized === "${HOME}/" || normalized === "${HOME}/*"))
    return !0;
  return !1;
}
function normalizePathForComparison2(p) {
  let normalized = normalize3(p);
  if (IS_WINDOWS) {
    if (normalized = normalized.replace(/\//g, "\\").toLowerCase(), normalized.length > 3 && normalized.endsWith("\\"))
      normalized = normalized.slice(0, -1);
    return normalized;
  }
  if (normalized.length > 1 && normalized.endsWith("/"))
    normalized = normalized.slice(0, -1);
  return normalized;
}
function isTempTarget(path, allowTmpdirVar, posixShell, dynamic, targetIsLiteral, tmpdirWordSplittingProtected, trustedTmpdirValue) {
  let normalized = path.trim();
  if (hasParentDirectoryComponent(normalized))
    return !1;
  if (!dynamic && isTrustedTempPath(normalized))
    return !0;
  return (allowTmpdirVar || tmpdirWordSplittingProtected && trustedTmpdirValue) && posixShell && !targetIsLiteral && isTrustedTmpdirVariableTarget(normalized, posixShell);
}
function isTrustedTmpdirVariableTarget(path, posixShell) {
  return ["$TMPDIR", "${TMPDIR}"].some((prefix) => {
    if (path === prefix)
      return !0;
    if (!path.startsWith(`${prefix}/`))
      return !1;
    return !isDynamicTarget(path.slice(prefix.length + 1), posixShell);
  });
}
function isTrustedTmpdirVariableRootTarget(path) {
  let match = /^(?:\$TMPDIR|\$\{TMPDIR\})(?:\/(.*))?$/.exec(path);
  if (!match)
    return !1;
  return posix.normalize(`/${match[1] ?? ""}`) === "/";
}
function hasParentDirectoryComponent(path) {
  return path.split(/[\\/]+/).includes("..");
}
function getHomeDirForRmPolicy() {
  return getOwnEnvValue("HOME") || homedir4();
}
function containsTmpdirVariable(target) {
  return /\$(?:TMPDIR(?![A-Za-z0-9_])|\{TMPDIR\})/.test(target);
}
function isDynamicTarget(target, posixShell = !1) {
  return target.includes("$") || target.includes("`") || hasShellGlobMetachar(target) || posixShell && hasPosixShellExpansionMetachar(target);
}
function hasShellGlobMetachar(target) {
  let escaped = !1;
  for (let char of target) {
    if (escaped) {
      escaped = !1;
      continue;
    }
    if (char === "\\") {
      escaped = !0;
      continue;
    }
    if (char === "*" || char === "?" || char === "[")
      return !0;
  }
  return !1;
}
function hasPosixShellExpansionMetachar(target) {
  let escaped = !1;
  for (let index = 0;index < target.length; index++) {
    let char = target[index];
    if (escaped) {
      escaped = !1;
      continue;
    }
    if (char === "\\") {
      escaped = !0;
      continue;
    }
    if (char === "{" && hasBraceExpansion(target, index) || (char === "+" || char === "@" || char === "!") && target[index + 1] === "(")
      return !0;
  }
  return !1;
}
function hasBraceExpansion(target, openIndex) {
  let closeIndex = target.indexOf("}", openIndex + 1);
  if (closeIndex === -1)
    return !1;
  let body = target.slice(openIndex + 1, closeIndex);
  return body.includes(",") || body.includes("..");
}
function isCwdHomeForRmPolicy(cwd, homeDir, budget) {
  try {
    return normalizePathForComparison2(resolveExistingPath(cwd, budget)) === normalizePathForComparison2(resolveExistingPath(homeDir, budget));
  } catch {
    try {
      return normalizePathForComparison2(cwd) === normalizePathForComparison2(homeDir);
    } catch {
      return !1;
    }
  }
}
function isCwdSelfTarget(target, cwd, budget) {
  if (target === "." || target === "./" || target === ".\\")
    return !0;
  try {
    return normalizePathForComparison2(resolveExistingPath(resolve8(cwd, target), budget)) === normalizePathForComparison2(resolveExistingPath(cwd, budget));
  } catch {
    try {
      return normalizePathForComparison2(resolve8(cwd, target)) === normalizePathForComparison2(cwd);
    } catch {
      return !1;
    }
  }
}
function isTargetWithinCwd(target, originalCwd, effectiveCwd, dynamic, targetIsLiteral, budget) {
  let resolveCwd = effectiveCwd ?? originalCwd;
  if (!targetIsLiteral && (target.startsWith("~") || target.startsWith("$HOME") || target.startsWith("${HOME}")))
    return !1;
  if (dynamic)
    return !1;
  if (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target))
    try {
      return isResolvedPathWithinCwd(target, originalCwd, budget);
    } catch {
      return !1;
    }
  if (target.startsWith("./") || target.startsWith(".\\") || !target.includes("/") && !target.includes("\\"))
    try {
      return isResolvedPathWithinCwd(resolve8(resolveCwd, target), originalCwd, budget);
    } catch {
      return !1;
    }
  if (target.startsWith("../"))
    return !1;
  try {
    return isResolvedPathWithinCwd(resolve8(resolveCwd, target), originalCwd, budget);
  } catch {
    return !1;
  }
}
function isResolvedPathWithinCwd(resolvedTarget, cwd, budget) {
  try {
    return isNormalizedPathWithin(resolveExistingPath(resolvedTarget, budget), resolveExistingPath(cwd, budget));
  } catch {
    return !1;
  }
}
function isWorkspaceWithinTarget(target, workspace, budget) {
  if (!workspace)
    return !1;
  try {
    return isNormalizedPathWithin(resolveExistingPath(workspace, budget), resolveExistingPath(target, budget));
  } catch {
    return !0;
  }
}
function isNormalizedPathWithin(target, cwd) {
  let normalizedTarget = normalizePathForComparison2(target), normalizedCwd = normalizePathForComparison2(cwd);
  return normalizedTarget.startsWith(`${normalizedCwd}${sep7}`) || normalizedTarget === normalizedCwd;
}

// src/core/analyze/powershell/remove-item.ts
var REMOVE_ITEM_ALIASES = /* @__PURE__ */ new Set(["remove-item", "ri", "del", "erase", "rd", "rm", "rmdir"]), REASON_REMOVE_ITEM_RF = "PowerShell Remove-Item -Recurse -Force outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.", REASON_REMOVE_ITEM_RF_POLICY = "PowerShell Remove-Item -Recurse -Force for non-temporary paths is blocked by the active safety policy. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.", REASON_REMOVE_ITEM_DYNAMIC_TARGET = "PowerShell Remove-Item target contains variables or pipeline input that cannot be verified safely. Use literal paths within cwd.", REASON_REMOVE_ITEM_ROOT_HOME = "PowerShell Remove-Item targeting root or home directory is extremely dangerous and always blocked.", REASON_REMOVE_ITEM_HOME_CWD = "PowerShell Remove-Item -Recurse -Force in home directory is dangerous. Change to a project directory first.", REASON_REMOVE_ITEM_PIPELINE = "PowerShell Remove-Item receives pipeline input that cannot be verified safely. Use explicit literal paths within cwd.";
function analyzePowerShellCommandViewMatch(command2, hasPipelineInput, options2 = {}, ctx = createRecursiveDeleteTargetContext(options2)) {
  return analyzePowerShellSegment(command2.words.map((word) => ({
    kind: "word",
    text: word.text,
    dynamic: word.provenance !== "literal"
  })), hasPipelineInput, ctx, options2.policy);
}
function analyzePowerShellSegment(segment, hasPipelineInput, ctx, policy) {
  let words = segment.filter((token) => token.kind === "word"), commandIndex = getCommandIndex(words), command2 = words[commandIndex];
  if (!command2 || !REMOVE_ITEM_ALIASES.has(normalizeCommandName(command2.text)))
    return null;
  let parsed = parseRemoveItem(words.slice(commandIndex + 1));
  if (parsed.whatIfProtected)
    return null;
  if (destructiveCommandRuleIsEnabled(policy, "powershell.remove-item-pipeline-dynamic-target", ctx.strict) && hasPipelineInput && (parsed.targets.length === 0 || parsed.recursive))
    return destructiveCommandMatch("powershell.remove-item-pipeline-dynamic-target", REASON_REMOVE_ITEM_PIPELINE);
  for (let target of parsed.targets)
    if (isDangerousRootOrHomeTarget(powerShellTargetForPolicy(target.text)))
      return destructiveCommandMatch(parsed.recursive && parsed.force ? "powershell.remove-item-recursive-force-root-or-home" : "powershell.remove-item-root-or-home", REASON_REMOVE_ITEM_ROOT_HOME);
  if (!parsed.recursive || !parsed.force)
    return null;
  if (destructiveCommandRuleIsEnabled(policy, "powershell.remove-item-recursive-force-dynamic-target", ctx.strict) && (parsed.hasDynamicTarget || parsed.targets.length === 0))
    return destructiveCommandMatch("powershell.remove-item-recursive-force-dynamic-target", REASON_REMOVE_ITEM_DYNAMIC_TARGET);
  for (let target of parsed.targets) {
    let match = matchForClassification(classifyRecursiveDeleteTarget(powerShellTargetForPolicy(target.text), ctx), ctx, policy);
    if (match)
      return match;
  }
  return null;
}
function parseRemoveItem(args) {
  let targets = [], recursive = !1, force = !1, whatIfProtected = !1, hasDynamicTarget = !1, pastEndOfParameters = !1;
  for (let i = 0;i < args.length; i++) {
    let token = args[i];
    if (!token || token.kind !== "word")
      continue;
    if (isArraySeparator(token))
      continue;
    if (pastEndOfParameters) {
      targets.push(targetFromToken(token)), hasDynamicTarget = hasDynamicTarget || token.dynamic;
      continue;
    }
    if (token.text === "--") {
      pastEndOfParameters = !0;
      continue;
    }
    let parameter = parseParameter(token.text);
    if (!parameter) {
      targets.push(targetFromToken(token)), hasDynamicTarget = hasDynamicTarget || token.dynamic;
      continue;
    }
    if (isPathParameter(parameter.name)) {
      let value = parameter.value ? parameterValueToken(parameter.value, token) : args[++i];
      if (value?.kind === "word")
        targets.push(targetFromToken(value)), hasDynamicTarget = hasDynamicTarget || value.dynamic;
      else
        hasDynamicTarget = !0;
      continue;
    }
    if (isRecurseParameter(parameter.name)) {
      recursive = !0;
      continue;
    }
    if (isForceParameter(parameter.name)) {
      force = !0;
      continue;
    }
    if (isWhatIfParameter(parameter.name))
      whatIfProtected = isProtectiveSwitchValue(parameter.value);
  }
  return { targets, recursive, force, whatIfProtected, hasDynamicTarget };
}
function getCommandIndex(words) {
  let first = words[0];
  if (first?.kind === "word" && first.text === "&" || first?.text === ".")
    return words.length > 1 ? 1 : 0;
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
  if (!text.startsWith("-") || text === "-")
    return null;
  let raw = text.slice(1), colonIndex = raw.indexOf(":");
  if (colonIndex === -1)
    return { name: raw.toLowerCase() };
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
  if (value === void 0 || value === "")
    return !0;
  let normalized = value.toLowerCase();
  return normalized === "$true" || normalized === "true";
}
function normalizeCommandName(name) {
  return name.toLowerCase();
}
function matchForClassification(classification, ctx, policy) {
  switch (classification.kind) {
    case "root_or_home_target":
      return destructiveCommandMatch("powershell.remove-item-recursive-force-root-or-home", REASON_REMOVE_ITEM_ROOT_HOME);
    case "temp_target":
      return null;
    case "dynamic_target":
      if (!destructiveCommandRuleIsEnabled(policy, "powershell.remove-item-recursive-force-dynamic-target", ctx.strict))
        return null;
      return destructiveCommandMatch("powershell.remove-item-recursive-force-dynamic-target", REASON_REMOVE_ITEM_DYNAMIC_TARGET);
    case "home_cwd_target":
      return destructiveCommandMatch("powershell.remove-item-recursive-force-home-cwd", REASON_REMOVE_ITEM_HOME_CWD);
    case "cwd_self_target":
      return destructiveCommandMatch("powershell.remove-item-recursive-force-cwd-self", REASON_REMOVE_ITEM_RF);
    case "within_anchored_cwd":
      if (!destructiveCommandRuleIsEnabled(policy, "powershell.remove-item-recursive-force-paranoid", ctx.paranoid))
        return null;
      return destructiveCommandMatch("powershell.remove-item-recursive-force-paranoid", REASON_REMOVE_ITEM_RF_POLICY);
    case "outside_anchored_cwd":
      return destructiveCommandMatch("powershell.remove-item-recursive-force-outside-cwd", REASON_REMOVE_ITEM_RF);
  }
}

// src/core/analyze/segment.ts
import { realpathSync as realpathSync8 } from "node:fs";
import { normalize as normalize4 } from "node:path";

// src/core/analyze/child-command.ts
function normalizeChildCommands(tokens, context) {
  let policy = context.policy ?? { rules: [], transparentWrappers: [] };
  return normalizeChildCommandCandidates([...tokens], context.cwd, context.cwd, /* @__PURE__ */ new Map, new Map(context.envAssignments ?? []), policy, { iterations: 0 }, !1);
}
function* normalizeChildCommandCandidates(tokens, wrapperCwd, cwd, wrapperEnvAssignments, envAssignments, policy, budget, wrappedByTransparent) {
  let wrapperInfo = stripWrappersWithInfo(tokens, wrapperCwd, envAssignments);
  if (wrapperInfo.unverifiableEnvSplit)
    throw new EnvSplitStringExpansionError;
  for (let [key, value] of wrapperInfo.envAssignments)
    envAssignments.set(key, value), wrapperEnvAssignments.set(key, value);
  let { tokens: childTokens, cwd: childWrapperCwd } = wrapperInfo;
  if (isStandardCommandWrapper(childTokens[0] ?? ""))
    throw new DerivedCommandWorkLimitError;
  let transparentWrapper = unwrapTransparentWrapper(childTokens, policy);
  if (transparentWrapper) {
    for (let childIndex of [
      transparentWrapper.childIndex,
      ...transparentWrapper.alternativeChildIndices
    ])
      reserveChildNormalization(budget), yield* normalizeChildCommandCandidates(childIndex === transparentWrapper.childIndex ? transparentWrapper.tokens : [...childTokens.slice(childIndex)], childWrapperCwd, cwd, new Map(wrapperEnvAssignments), new Map(envAssignments), policy, budget, !0);
    return;
  }
  if (isBusyboxWrapper(childTokens)) {
    reserveChildNormalization(budget), yield* normalizeChildCommandCandidates([...childTokens.slice(1)], childWrapperCwd, cwd, wrapperEnvAssignments, envAssignments, policy, budget, wrappedByTransparent);
    return;
  }
  yield normalizedChildCommand(childTokens, childWrapperCwd, cwd, wrapperEnvAssignments, envAssignments, wrappedByTransparent);
}
function normalizedChildCommand(tokens, wrapperCwd, cwd, wrapperEnvAssignments, envAssignments, wrappedByTransparent) {
  return {
    tokens,
    cwd: wrapperCwd === null ? void 0 : wrapperCwd ?? cwd,
    wrapperCwd,
    wrapperEnvAssignments,
    envAssignments,
    head: getBasename(tokens[0] ?? "").toLowerCase(),
    wrappedByTransparent
  };
}
function reserveChildNormalization(budget) {
  if (budget.iterations >= MAX_STRIP_ITERATIONS)
    throw new DerivedCommandWorkLimitError;
  budget.iterations++;
}
function isBusyboxWrapper(tokens) {
  return getBasename(tokens[0] ?? "").toLowerCase() === "busybox" && tokens.length > 1;
}
function collectCommandTemplate(tokens, start) {
  let templateTokens = [], i = start;
  while (i < tokens.length) {
    let token = tokens[i];
    if (token === void 0 || token === ":::")
      break;
    templateTokens.push(token), i++;
  }
  return {
    markerIndex: i < tokens.length && tokens[i] === ":::" ? i : -1,
    templateTokens
  };
}

// src/core/analyze/rm-flags.ts
function hasRecursiveForceFlags(tokens) {
  let hasRecursive = !1, hasForce = !1;
  for (let token of tokens) {
    if (token === "--")
      break;
    if (token === "-r" || token === "-R" || isLongOptionAbbreviation(token, "recursive"))
      hasRecursive = !0;
    else if (token === "-f" || isLongOptionAbbreviation(token, "force"))
      hasForce = !0;
    else if (token.startsWith("-") && !token.startsWith("--")) {
      if (token.includes("r") || token.includes("R"))
        hasRecursive = !0;
      if (token.includes("f"))
        hasForce = !0;
    }
  }
  return hasRecursive && hasForce;
}
function isLongOptionAbbreviation(token, option) {
  return token.length > 2 && token.startsWith("--") && option.startsWith(token.slice(2));
}

// src/core/analyze/find.ts
var REASON_FIND_DELETE = "find -delete permanently removes files. Use -print first to preview.", REASON_FIND_EXEC_RM_RF = "find -exec rm -rf is dangerous. Use explicit file list instead.", FIND_EXEC_PRIMARIES = /* @__PURE__ */ new Set(["-exec", "-execdir", "-ok", "-okdir"]), FIND_PRIMARY_ARITY = new Map([
  ...[
    "-Bmin",
    "-Bnewer",
    "-Btime",
    "-amin",
    "-anewer",
    "-atime",
    "-cmin",
    "-cnewer",
    "-context",
    "-ctime",
    "-f",
    "-flags",
    "-fprint",
    "-fprint0",
    "-fls",
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
    "-maxdepth",
    "-mindepth",
    "-mmin",
    "-mnewer",
    "-mtime",
    "-name",
    "-newer",
    "-newerXY",
    "-newermt",
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
    "-xattrname",
    "-xtype"
  ].map((primary) => [primary, 1]),
  ["-fprintf", 2]
]);
function analyzeFindMatch(tokens, context = {}) {
  if (findHasDelete(tokens, 1) && !hasOnlyTrustedTempDeleteTargets(tokens, context)) {
    let match = filterDestructiveCommandMatch(destructiveCommandMatch("find.delete", REASON_FIND_DELETE), context.policy);
    if (match)
      return match;
  }
  let derivedCommandWorkBudget = context.derivedCommandWorkBudget ?? createDerivedCommandWorkBudget(), i = 0;
  while (i < tokens.length) {
    let token = tokens[i], arity = getFindPrimaryArity(token ?? "");
    if (arity > 0) {
      i += arity + 1;
      continue;
    }
    if (!isFindExecPrimary(token)) {
      i++;
      continue;
    }
    reserveDerivedCommandTokens(derivedCommandWorkBudget, tokens.length - i - 1);
    let execCommand = getFindExecCommand(tokens, i);
    i = execCommand.nextIndex;
    let directMatch = analyzeFindExecCommand(execCommand.tokens);
    if (directMatch) {
      let match2 = filterDestructiveCommandMatch(directMatch, context.policy);
      if (match2)
        return match2;
    }
    let directoryRelative = token === "-execdir" || token === "-okdir", nestedMatch = context.analyzeTokens ? context.analyzeTokens(execCommand.tokens, directoryRelative ? null : context.cwd) : context.analyzeNested ? context.analyzeNested(execCommand.tokens.join(" "), {
      effectiveCwd: directoryRelative ? void 0 : context.cwd,
      envAssignments: context.envAssignments
    }) : null, match = nestedMatch?.id.startsWith("custom.") ? nestedMatch : filterDestructiveCommandMatch(nestedMatch, context.policy);
    if (match)
      return match;
  }
  return null;
}
function hasOnlyTrustedTempDeleteTargets(tokens, context) {
  if (tokens.includes("-L") || tokens.includes("-f") || tokens.includes("-follow"))
    return !1;
  let targets = getFindStartingPoints(tokens);
  if (!targets)
    return !1;
  let envAssignments = context.envAssignments ?? /* @__PURE__ */ new Map, effectiveTmpdirValue = getEffectiveTmpdirValue(envAssignments), trustedTmpdirValue = context.trustedTmpdirValue ?? isTmpdirValueTrusted(envAssignments), allowTmpdirVar = context.allowTmpdirVar ?? !isTmpdirOverriddenToNonTemp(envAssignments), targetContext = createRecursiveDeleteTargetContext({
    cwd: context.cwd,
    originalCwd: context.originalCwd,
    strict: context.strict,
    allowTmpdirVar: allowTmpdirVar && trustedTmpdirValue && Boolean(effectiveTmpdirValue),
    posixShell: !0,
    tmpdirVarExpandsEmpty: context.tmpdirVarExpandsEmpty ?? isTmpdirKnownEmpty(envAssignments),
    tmpdirWordSplittingUnsafe: context.tmpdirWordSplittingUnsafe ?? hasUnsafeTmpdirWordSplitting(envAssignments),
    trustedTmpdirValue
  });
  return targets.every((target) => {
    if (context.unsafeBraceExpansionTargetTokenIndexes?.has(target.index))
      return !1;
    let expandedTargets = context.expandedTargetTokens?.get(target.index);
    return (expandedTargets ?? [target.text]).every((expandedTarget) => isTrustedTempDescendantTarget(expandedTarget, targetContext, {
      containmentTarget: expandTmpdirTarget(expandedTarget, effectiveTmpdirValue),
      targetIsLiteral: expandedTargets !== void 0 || context.literalTargetTokenIndexes?.has(target.index),
      tmpdirWordSplittingProtected: context.tmpdirWordSplittingProtectedTargetTokenIndexes?.has(target.index)
    }));
  });
}
function expandTmpdirTarget(target, tmpdirValue) {
  if (!tmpdirValue)
    return target;
  return target.replace(/^(?:\$TMPDIR|\$\{TMPDIR\})/, () => tmpdirValue);
}
function getFindStartingPoints(tokens) {
  let index = 1;
  while (tokens[index] === "-H" || tokens[index] === "-P")
    index++;
  if (tokens[index] === "--")
    index++;
  let targets = [];
  while (index < tokens.length) {
    let token = tokens[index];
    if (!token || token.startsWith("-") || token === "!" || token === "(" || token === ")")
      break;
    targets.push({ text: token, index }), index++;
  }
  return targets.length > 0 ? targets : null;
}
function analyzeFindExecCommand(tokens) {
  let execCommand = stripWrappers([...tokens]);
  if (execCommand.length === 0)
    return null;
  let head = getBasename(execCommand[0] ?? "");
  if (head === "busybox" && execCommand.length > 1)
    execCommand = execCommand.slice(1), head = getBasename(execCommand[0] ?? "");
  if (head === "rm" && hasRecursiveForceFlags(execCommand))
    return destructiveCommandMatch("find.exec-rm-recursive-force", REASON_FIND_EXEC_RM_RF);
  return null;
}
function getFindExecCommand(tokens, execIndex) {
  let terminatorIndex = execIndex + 1;
  while (terminatorIndex < tokens.length && tokens[terminatorIndex] !== ";" && !(tokens[terminatorIndex] === "+" && tokens[terminatorIndex - 1] === "{}"))
    terminatorIndex++;
  return {
    tokens: tokens.slice(execIndex + 1, terminatorIndex),
    nextIndex: Math.min(terminatorIndex + 1, tokens.length)
  };
}
function findHasDelete(tokens, start) {
  let i = start;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token) {
      i++;
      continue;
    }
    if (isFindExecPrimary(token)) {
      i = getFindExecCommand(tokens, i).nextIndex;
      continue;
    }
    let arity = getFindPrimaryArity(token);
    if (arity > 0) {
      i += arity + 1;
      continue;
    }
    if (token === "-delete")
      return !0;
    i++;
  }
  return !1;
}
function getFindPrimaryArity(token) {
  return FIND_PRIMARY_ARITY.get(token) ?? (/^-newer[A-Za-z]{2}$/.test(token) ? 1 : 0);
}
function isFindExecPrimary(token) {
  return token !== void 0 && FIND_EXEC_PRIMARIES.has(token);
}

// src/core/analyze/parallel.ts
import { isAbsolute as isAbsolute12 } from "node:path";

// src/core/analyze/rm.ts
var REASON_RM_RF = "rm -rf outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.", REASON_RM_RF_POLICY = "rm -rf for non-temporary paths is blocked by the active safety policy. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.", REASON_RM_RF_DYNAMIC_TARGET = "rm -rf target contains shell variables that cannot be verified safely. Use literal paths within cwd, /tmp, /var/tmp, or $TMPDIR.", REASON_RM_RF_ROOT_HOME = "rm -rf targeting root or home directory is extremely dangerous and always blocked.", REASON_RM_HOME_CWD = "rm -rf in home directory is dangerous. Change to a project directory first.";
function analyzeRmMatch(tokens, options2 = {}) {
  let ctx = createRecursiveDeleteTargetContext({ ...options2, posixShell: !0 });
  if (!hasRecursiveForceFlags(tokens))
    return null;
  let targets = extractTargets(tokens);
  for (let target of targets) {
    if (options2.unsafeBraceExpansionTargetTokenIndexes?.has(target.index)) {
      let match = filterDestructiveCommandMatch(reasonForClassification({ kind: "outside_anchored_cwd" }, ctx, options2.policy), options2.policy);
      if (match)
        return match;
      continue;
    }
    let expandedTargets = options2.expandedTargetTokens?.get(target.index);
    for (let expandedTarget of expandedTargets ?? [target.text]) {
      let classificationOptions = {
        targetIsLiteral: expandedTargets !== void 0 || options2.literalTargetTokenIndexes?.has(target.index),
        tmpdirWordSplittingProtected: options2.tmpdirWordSplittingProtectedTargetTokenIndexes?.has(target.index)
      };
      for (let classification of orderedTargetClassifications(expandedTarget, ctx, classificationOptions)) {
        let candidate = reasonForClassification(classification, ctx, options2.policy), match = filterDestructiveCommandMatch(candidate, options2.policy);
        if (match)
          return match;
      }
    }
  }
  return null;
}
function orderedTargetClassifications(target, ctx, options2) {
  let primary = classifyRecursiveDeleteTarget(target, ctx, options2);
  if (primary.kind === "cwd_self_target")
    return [primary, classifyRecursiveDeleteTarget(target, ctx, { ...options2, skipCwdSelf: !0 })];
  if (primary.kind !== "home_cwd_target")
    return [primary];
  let targetSpecific = classifyRecursiveDeleteTarget(target, ctx, {
    ...options2,
    skipHomeCwd: !0
  });
  if (targetSpecific.kind !== "cwd_self_target")
    return [primary, targetSpecific];
  return [
    primary,
    targetSpecific,
    classifyRecursiveDeleteTarget(target, ctx, {
      ...options2,
      skipHomeCwd: !0,
      skipCwdSelf: !0
    })
  ];
}
function extractTargets(tokens) {
  let targets = [], pastDoubleDash = !1;
  for (let i = 1;i < tokens.length; i++) {
    let token = tokens[i];
    if (!token)
      continue;
    if (token === "--") {
      pastDoubleDash = !0;
      continue;
    }
    if (pastDoubleDash) {
      targets.push({ text: token, index: i });
      continue;
    }
    if (!token.startsWith("-"))
      targets.push({ text: token, index: i });
  }
  return targets;
}
function reasonForClassification(classification, ctx, policy) {
  switch (classification.kind) {
    case "root_or_home_target":
      return destructiveCommandMatch("rm.recursive-force-root-or-home", REASON_RM_RF_ROOT_HOME);
    case "temp_target":
      return null;
    case "dynamic_target":
      if (!destructiveCommandRuleIsEnabled(policy, "rm.recursive-force-dynamic-target", ctx.strict))
        return null;
      return destructiveCommandMatch("rm.recursive-force-dynamic-target", REASON_RM_RF_DYNAMIC_TARGET);
    case "home_cwd_target":
      return destructiveCommandMatch("rm.recursive-force-home-cwd", REASON_RM_HOME_CWD);
    case "cwd_self_target":
      return destructiveCommandMatch("rm.recursive-force-cwd-self", REASON_RM_RF);
    case "within_anchored_cwd":
      if (destructiveCommandRuleIsEnabled(policy, "rm.recursive-force-paranoid", ctx.paranoid))
        return destructiveCommandMatch("rm.recursive-force-paranoid", REASON_RM_RF_POLICY);
      return null;
    case "outside_anchored_cwd":
      return destructiveCommandMatch("rm.recursive-force-outside-cwd", REASON_RM_RF);
  }
}

// src/core/analyze/shell-wrappers.ts
var SHELL_SHORT_VALUE_OPTIONS = {
  bash: ["O", "o"],
  dash: ["o"],
  ksh: ["o"],
  sh: ["o"],
  zsh: ["o"]
}, BASH_LONG_VALUE_OPTIONS = /* @__PURE__ */ new Set(["--init-file", "--rcfile"]), BASH_STARTUP_OPTIONS = ["--init-file", "--rcfile"];
var SHELL_STARTUP_ENV_NAMES = /* @__PURE__ */ new Map([
  ["bash", "BASH_ENV"],
  ["dash", "ENV"],
  ["ksh", "ENV"],
  ["sh", "ENV"]
]);
function extractDashCArg(tokens) {
  for (let i = 1;i < tokens.length; i++) {
    let token = tokens[i];
    if (!token)
      continue;
    if (token === "-c")
      return getCommandStringAfterDashC(tokens, i, !0);
    if (token.startsWith("-") && token.includes("c") && !token.startsWith("--")) {
      let command2 = getCommandStringAfterDashC(tokens, i, !1);
      if (command2 !== null)
        return command2;
    }
  }
  return null;
}
function isShellSyntaxCheck(tokens) {
  let shell = getBasename(tokens[0] ?? "").toLowerCase();
  if (shell === "zsh" || shell === "ksh")
    return parseShellArgv(tokens).syntaxCheck;
  let enabled = !1;
  for (let token of tokens.slice(1)) {
    if (token === "--")
      return enabled;
    if (token.startsWith("+") && !token.startsWith("++")) {
      if (token.slice(1).includes("n"))
        enabled = !1;
      continue;
    }
    if (!token.startsWith("-") || token.startsWith("--"))
      return enabled;
    let flags = token.slice(1);
    if (flags.includes("n"))
      enabled = !0;
    if (flags.includes("c"))
      return enabled;
  }
  return enabled;
}
function getCommandStringAfterDashC(tokens, dashCIndex, allowDashCommand) {
  if (tokens[dashCIndex + 1] === "--")
    return tokens[dashCIndex + 2] || null;
  let commandString = tokens[dashCIndex + 1];
  if (!commandString || !allowDashCommand && commandString.startsWith("-"))
    return null;
  return commandString;
}
function extractShellStartupLoaderMetadata(tokens) {
  let shell = getBasename(tokens[0] ?? "").toLowerCase(), parsed = parseShellStartupArgv(tokens, shell), envName = SHELL_STARTUP_ENV_NAMES.get(shell) ?? null, valid = parsed.argvSource?.kind !== "absent";
  return {
    argvSource: shell === "bash" ? parsed.argvSource : null,
    argvSourceApplies: shell === "bash" && parsed.interactive && parsed.argvSource?.kind === "literal",
    envName,
    envSourceApplies: valid && (envName === "BASH_ENV" ? !parsed.interactive : envName === "ENV" && parsed.interactive)
  };
}
function parseShellStartupArgv(tokens, shell) {
  let parsed = parseShellArgv(tokens), boundary = parsed.commandIndex ?? parsed.scriptIndex ?? tokens.length, sources = [], interactive = !1, bashLongOptionsOpen = !0;
  for (let index = 1;index < boundary; index++) {
    let token = tokens[index];
    if (token === void 0 || token === "--" || token === "-" || token[0] !== "-" && token[0] !== "+")
      break;
    if (token.startsWith("--")) {
      let option = shell === "bash" && bashLongOptionsOpen ? BASH_STARTUP_OPTIONS.find((candidate) => token === candidate) : void 0;
      if (option) {
        let value = tokens[index + 1];
        sources.push(value === void 0 ? { kind: "absent", option, optionIndex: index, tokenIndex: null, value: null } : { kind: "literal", option, optionIndex: index, tokenIndex: index + 1, value }), index++;
        continue;
      }
      let longOption = token.split("=", 1)[0] ?? token;
      if (shell === "bash" && BASH_LONG_VALUE_OPTIONS.has(longOption) && !token.includes("="))
        index++;
      continue;
    }
    if (shell === "bash")
      bashLongOptionsOpen = !1;
    let shortScan = scanShellShortOptions(shell, token, tokens[index + 1], "startup");
    if (shortScan.interactive)
      interactive = token[0] === "-";
    index += shortScan.followingValues;
  }
  return { argvSource: sources.at(-1) ?? null, interactive };
}
function scanShellShortOptions(shell, token, nextToken, mode) {
  let interactive = !1, followingValues = 0, commandSelected = !1, stdinMode = !1, syntaxCheck = !1;
  for (let optionIndex = 1;optionIndex < token.length; optionIndex++) {
    let option = token[optionIndex];
    if (option === void 0)
      break;
    if (shell === "ksh" && option === "o" && optionIndex + 1 < token.length) {
      if (mode === "argv") {
        let optionName = token.slice(optionIndex + 1);
        if (token[0] === "-" && (optionName === "c" || optionName[0] === "-" && optionName.endsWith("c")))
          commandSelected = !0;
      }
      break;
    }
    if (shell === "ksh" && option === "o" && optionIndex + 1 === token.length && (nextToken?.startsWith("-") || nextToken?.startsWith("+")))
      break;
    if (shell === "zsh" && option === "o" && optionIndex + 1 < token.length)
      break;
    if (mode === "startup" && option === "i")
      interactive = token[0] === "-";
    if (mode === "argv" && token[0] === "-" && option === "c")
      commandSelected = !0;
    if (mode === "argv" && option === "n")
      syntaxCheck = token[0] === "-";
    if (mode === "argv" && option === "s")
      stdinMode = token[0] === "-";
    if (!SHELL_SHORT_VALUE_OPTIONS[shell]?.includes(option))
      continue;
    if (optionIndex + 1 === token.length)
      followingValues++;
    break;
  }
  return { interactive, followingValues, commandSelected, stdinMode, syntaxCheck };
}
function parseShellArgv(tokens) {
  let shell = getBasename(tokens[0] ?? "").toLowerCase(), commandSelected = !1, stdinMode = !1, syntaxCheck = !1;
  for (let index = 1;index < tokens.length; index++) {
    let token = tokens[index];
    if (token === void 0)
      break;
    if (token === "--") {
      let commandIndex = commandSelected && tokens[index + 1] !== void 0 ? index + 1 : null;
      return {
        command: commandIndex === null ? null : tokens[commandIndex] ?? null,
        commandIndex,
        scriptIndex: !commandSelected && !stdinMode && tokens[index + 1] !== void 0 ? index + 1 : null,
        readsStdinAsCommands: !commandSelected && (stdinMode || tokens[index + 1] === void 0),
        syntaxCheck
      };
    }
    if (token === "-" || token[0] !== "-" && token[0] !== "+")
      return {
        command: commandSelected ? token : null,
        commandIndex: commandSelected ? index : null,
        scriptIndex: !commandSelected && !stdinMode && token !== "-" ? index : null,
        readsStdinAsCommands: !commandSelected && (stdinMode || token === "-"),
        syntaxCheck
      };
    if (token.startsWith("--")) {
      let option = token.split("=", 1)[0] ?? token;
      if (shell === "bash" && BASH_LONG_VALUE_OPTIONS.has(option) && !token.includes("="))
        index++;
      continue;
    }
    let shortScan = scanShellShortOptions(shell, token, tokens[index + 1], "argv");
    if (shortScan.commandSelected)
      commandSelected = !0;
    if (shortScan.syntaxCheck)
      syntaxCheck = !0;
    if (shortScan.stdinMode)
      stdinMode = !0;
    index += shortScan.followingValues;
  }
  return {
    command: null,
    commandIndex: null,
    scriptIndex: null,
    readsStdinAsCommands: !commandSelected,
    syntaxCheck
  };
}

// src/core/analyze/shell-execution.ts
var NO_SOURCE = { kind: "none" }, DYNAMIC_SOURCE = { kind: "dynamic" }, INPUT_REDIRECTIONS = /* @__PURE__ */ new Set(["<", "<<", "<<-", "<<<", "<&", "<>"]), SHELL_PARAMETER_RE = /\$(?:([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)|\{!?([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*))/g, POSITIONAL_SHELL_PARAMETER_RE = /^(?:[0-9]+|[@*])$/, MAX_POSITIONAL_EXPANSION_WORDS = DEFAULT_COMMAND_PARSER_LIMITS.maxWords, MAX_POSITIONAL_EXPANSION_CHARACTERS = DEFAULT_COMMAND_PARSER_LIMITS.maxInputLength;
function extractLiteralPrintfOutput(command2) {
  if (!command2 || getBasename(normalizeCommandToken(command2.words[0]?.text ?? "")) !== "printf")
    return;
  if (command2.words.some((word) => word.provenance !== "literal"))
    return;
  let args = command2.words.slice(command2.words[1]?.text === "--" ? 2 : 1), format = args[0]?.text;
  if (format === void 0)
    return "";
  let values = args.slice(1).map((word) => word.text);
  if (format === "%s")
    return values.join("");
  if (format === "%s\\n" || format === `%s
`)
    return `${values.join(`
`)}
`;
  if (format.includes("%") || /\\(?![\\nrt])/.test(format))
    return;
  return format.replaceAll("\\n", `
`).replaceAll("\\r", "\r").replaceAll("\\t", "\t").replaceAll("\\\\", "\\");
}
function extractEvalSource(tokens, command2) {
  let start = tokens[1] === "--" ? 2 : 1;
  if (tokens.length <= start)
    return NO_SOURCE;
  if (!tokens.slice(start).every((value, index) => isLiteralWord(command2, start + index, value)))
    return DYNAMIC_SOURCE;
  return { kind: "literal", source: tokens.slice(start).join(" ") };
}
function extractTrapSource(tokens, command2) {
  let actionIndex = tokens[1] === "--" ? 2 : 1, action = tokens[actionIndex];
  if (action === void 0 || tokens.length <= actionIndex + 1 || action === "-" || action === "" || action === "-l" || action === "-p")
    return NO_SOURCE;
  if (!isLiteralWord(command2, actionIndex, action))
    return DYNAMIC_SOURCE;
  return { kind: "literal", source: action };
}
function extractPositionalShellSource(tokens, command2, script) {
  let scriptIndex = findShellScriptIndex(tokens);
  if (scriptIndex === -1)
    return NO_SOURCE;
  let carrier = parsePositionalCarrier(script);
  if (!carrier)
    return NO_SOURCE;
  let expanded = [], expandedCharacters = carrier.command?.length ?? 0;
  for (let reference of carrier.references) {
    let words = expandPositionalReference(reference, tokens, command2, scriptIndex, carrier.ifs);
    if (!words)
      return DYNAMIC_SOURCE;
    if (expandedCharacters += words.reduce((total, word) => total + word.length + 3, 0), expanded.length + words.length > MAX_POSITIONAL_EXPANSION_WORDS || expandedCharacters > MAX_POSITIONAL_EXPANSION_CHARACTERS)
      return DYNAMIC_SOURCE;
    expanded.push(...words);
  }
  if (carrier.command === "eval")
    return { kind: "literal", source: expanded.join(" ") };
  if (expanded.length === 0 || /\s/.test(expanded[0] ?? ""))
    return { kind: "literal", source: "" };
  return {
    kind: "literal",
    source: [
      carrier.command,
      carrier.command && carrier.optionTerminator ? "--" : null,
      ...expanded.map(quoteShellWord)
    ].filter((value) => value !== null).join(" ")
  };
}
function extractShellStdinSource(tokens, command2, hasPipelineInput, literalPipelineInput) {
  if (!shellReadsStdinAsCommands(tokens))
    return NO_SOURCE;
  let input = command2?.redirections.filter((redirection) => (redirection.fd === void 0 || redirection.fd === 0) && INPUT_REDIRECTIONS.has(redirection.operator)).at(-1);
  if (input) {
    if (input.operator === "<<" || input.operator === "<<-")
      return NO_SOURCE;
    if (input.operator !== "<<<" || input.target?.provenance !== "literal")
      return DYNAMIC_SOURCE;
    return { kind: "literal", source: input.target.text };
  }
  if (!hasPipelineInput)
    return NO_SOURCE;
  return literalPipelineInput === void 0 ? DYNAMIC_SOURCE : { kind: "literal", source: literalPipelineInput };
}
function extractShellScriptOperandSource(tokens, command2) {
  let scriptIndex = parseShellArgv(tokens).scriptIndex;
  if (scriptIndex === null)
    return NO_SOURCE;
  let source = tokens[scriptIndex] ?? "", word = command2?.words[scriptIndex];
  return (word ? word.provenance === "literal" : !/[$`*?[\]]/.test(source)) ? { kind: "literal", source } : DYNAMIC_SOURCE;
}
function shellReadsStdinAsCommands(tokens) {
  return parseShellArgv(tokens).readsStdinAsCommands;
}
function findShellScriptIndex(tokens) {
  return parseShellArgv(tokens).commandIndex ?? -1;
}
function parsePositionalCarrier(script) {
  let ifsAssignment = /^IFS=(?:'([^']*)'|"([^"]*)"|([^;\s]*))\s*;\s*(.+)$/.exec(script.trim()), source = ifsAssignment?.[4] ?? script.trim(), command2 = /^(\.|bash|command|dash|exec|eval|ksh|sh|source|zsh)(?:\s+(--))?\s+(.+)$/.exec(source), references = (command2?.[3] ?? source).split(/\s+/).map(parsePositionalReference);
  if (references.length === 0 || references.some((reference) => reference === null))
    return null;
  return {
    command: command2?.[1] ?? null,
    optionTerminator: command2?.[2] !== void 0,
    references: references.filter((reference) => !!reference),
    ifs: ifsAssignment ? ifsAssignment[1] ?? ifsAssignment[2] ?? ifsAssignment[3] ?? "" : ` 	
`
  };
}
function parsePositionalReference(value) {
  let quoted = /^"\$(?:([0-9]+|[@*])|\{([0-9]+|[@*])\})"$/.exec(value), unquoted = /^\$(?:([0-9]+|[@*])|\{([0-9]+|[@*])\})$/.exec(value), match = quoted ?? unquoted;
  if (!match)
    return null;
  let parameter = match[1] ?? match[2];
  return {
    parameter: parameter === "@" || parameter === "*" ? parameter : Number(parameter),
    quoted: quoted !== null
  };
}
function expandPositionalReference(reference, tokens, command2, scriptIndex, ifs) {
  let positional = tokens.slice(scriptIndex + 2);
  if (reference.parameter === "@")
    return reference.quoted ? literalPositionalValues(positional, command2, scriptIndex + 2) : splitLiteralPositionalValues(positional, command2, scriptIndex + 2, ifs);
  if (reference.parameter === "*") {
    let values = literalPositionalValues(positional, command2, scriptIndex + 2);
    if (!values)
      return;
    let joined = values.join(ifs[0] ?? "");
    return reference.quoted ? [joined] : splitLiteralShellFields(joined, ifs);
  }
  let index = scriptIndex + 1 + reference.parameter, value = tokens[index] ?? "";
  if (tokens[index] !== void 0 && !isLiteralWord(command2, index, value))
    return;
  return reference.quoted ? [value] : splitLiteralShellFields(value, ifs);
}
function literalPositionalValues(values, command2, start) {
  return values.every((value, index) => isLiteralWord(command2, start + index, value)) ? [...values] : void 0;
}
function splitLiteralPositionalValues(values, command2, start, ifs) {
  let literal = literalPositionalValues(values, command2, start);
  if (!literal)
    return;
  let fields = literal.map((value) => splitLiteralShellFields(value, ifs));
  return fields.some((value) => value === void 0) ? void 0 : fields.flatMap((value) => value ?? []);
}
function splitLiteralShellFields(value, ifs) {
  if (["*", "?", "[", "]"].some((character) => value.includes(character)))
    return;
  if (ifs === "")
    return value === "" ? [] : [value];
  if (ifs === ` 	
`)
    return value.trim().split(/\s+/).filter(Boolean);
  if (ifs.length !== 1)
    return;
  return ifs === " " || ifs === "\t" || ifs === `
` ? value.trim().split(/\s+/).filter(Boolean) : value.split(ifs).filter(Boolean);
}
function isLiteralWord(command2, index, value = "") {
  let word = command2?.words[index];
  if (word)
    return word.provenance === "literal";
  return !/[$`]/.test(value);
}
function quoteShellWord(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
function shellSourceHasDynamicExecutionCarrier(source, dynamicEnvNames) {
  return programHasDynamicExecutionCarrier(parseCommand(source, "posix"), dynamicEnvNames);
}
function shellSourceHasUnresolvedDynamicExecutionCarrier(source) {
  return shellSourceHasDynamicExecutionCarrier(source, new Set(Array.from(source.matchAll(SHELL_PARAMETER_RE)).flatMap((match) => {
    let parameter = match[1] ?? match[2];
    return parameter === void 0 ? [] : [parameter];
  })));
}
function programHasDynamicExecutionCarrier(program, inheritedDynamicNames) {
  if (program.status === "invalid" || program.status === "limited")
    return !1;
  let dynamicNames = new Set(inheritedDynamicNames);
  for (let node of program.nodes) {
    if (node.kind === "group") {
      if (programHasDynamicExecutionCarrier(node.body, dynamicNames))
        return !0;
      continue;
    }
    if (node.kind !== "command")
      continue;
    if (node.nested.some((nested) => programHasDynamicExecutionCarrier(nested, dynamicNames)) || wordsHaveDynamicExecutionCarrier(node.words, dynamicNames))
      return !0;
    updateDynamicAssignments(node, dynamicNames);
  }
  return !1;
}
function wordsHaveDynamicExecutionCarrier(words, dynamicNames) {
  let headIndex = words.findIndex((word) => parseEnvAssignment(word.text) === null);
  if (headIndex === -1)
    return !1;
  let head = words[headIndex];
  if (!head)
    return !1;
  if (wordReferencesDynamicInput(head, dynamicNames))
    return !0;
  let normalizedHead = normalizeCommandToken(head.text);
  if (normalizedHead === "source" || normalizedHead === ".") {
    let operandIndex = words[headIndex + 1]?.text === "--" ? headIndex + 2 : headIndex + 1;
    return wordSuppliesDynamicExecutionSource(words[operandIndex], dynamicNames);
  }
  if (SHELL_WRAPPERS.has(normalizedHead)) {
    let shellWords = words.slice(headIndex), parsed = parseShellArgv(shellWords.map((word) => word.text)), sourceIndex = parsed.commandIndex ?? parsed.scriptIndex;
    return !parsed.syntaxCheck && sourceIndex !== null && wordSuppliesDynamicExecutionSource(shellWords[sourceIndex], dynamicNames);
  }
  let carrierIndex = findCarrierCommandIndex(words, headIndex, dynamicNames);
  if (carrierIndex === null)
    return !1;
  if (carrierIndex === -1)
    return !0;
  return wordsHaveDynamicExecutionCarrier(words.slice(carrierIndex), dynamicNames);
}
function findCarrierCommandIndex(words, headIndex, dynamicNames) {
  let head = normalizeCommandToken(words[headIndex]?.text ?? "");
  if (head === "command")
    return findCommandBuiltinCommandIndex(words, headIndex + 1);
  if (head === "exec")
    return findExecCommandIndex(words, headIndex + 1);
  if (head === "env")
    return findEnvCommandIndex(words, headIndex + 1, dynamicNames);
  return null;
}
function findCommandBuiltinCommandIndex(words, start) {
  for (let index = start;index < words.length; index++) {
    let token = words[index]?.text ?? "";
    if (token === "--")
      return words[index + 1] ? index + 1 : null;
    if (/^-[p]*[vV][pvV]*$/.test(token))
      return null;
    if (/^-p+$/.test(token))
      continue;
    return index;
  }
  return null;
}
function findExecCommandIndex(words, start) {
  for (let index = start;index < words.length; index++) {
    let token = words[index]?.text ?? "";
    if (token === "--")
      return words[index + 1] ? index + 1 : null;
    if (token === "-a") {
      index++;
      continue;
    }
    if (/^-a.+/.test(token) || /^-[cl]+$/.test(token))
      continue;
    return index;
  }
  return null;
}
function findEnvCommandIndex(words, start, dynamicNames) {
  for (let index = start;index < words.length; index++) {
    let word = words[index], token = word?.text ?? "";
    if (token === "--")
      return words[index + 1] ? index + 1 : null;
    if (token === "-S" || token === "--split-string")
      return wordReferencesDynamicInput(words[index + 1], dynamicNames) ? -1 : index + 2;
    if (token.startsWith("-S") || token.startsWith("--split-string="))
      return wordReferencesDynamicInput(word, dynamicNames) ? -1 : index + 1;
    if (token === "-u" || token === "--unset" || token === "-C" || token === "--chdir" || token === "-P") {
      index++;
      continue;
    }
    if (token === "-i" || token === "-0" || token === "--null" || token.startsWith("-u=") || token.startsWith("--unset=") || token.startsWith("-C") || token.startsWith("--chdir=") || token.startsWith("-P"))
      continue;
    if (token.startsWith("-"))
      continue;
    if (parseEnvAssignment(token))
      continue;
    return index;
  }
  return null;
}
function updateDynamicAssignments(command2, dynamicNames) {
  if (!command2.words.every((word) => parseEnvAssignment(word.text) !== null))
    return;
  for (let word of command2.words) {
    let assignment = parseEnvAssignment(word.text);
    if (!assignment)
      continue;
    if (wordReferencesDynamicInput(word, dynamicNames))
      dynamicNames.add(assignment.name);
  }
}
function wordReferencesDynamicInput(word, dynamicNames) {
  if (!word)
    return !1;
  return word.parts.filter((part) => part.provenance === "variable").some((part) => Array.from(part.raw.matchAll(SHELL_PARAMETER_RE)).some((match) => {
    let parameter = match[1] ?? match[2];
    return parameter !== void 0 && (POSITIONAL_SHELL_PARAMETER_RE.test(parameter) || dynamicNames.has(parameter));
  }));
}
function wordSuppliesDynamicExecutionSource(word, dynamicNames) {
  return !!word && (word.parts.some((part) => part.provenance !== "literal" && part.provenance !== "variable") || wordReferencesDynamicInput(word, dynamicNames));
}

// src/core/git/parse.ts
var MAX_GIT_ALIAS_EXPANSION_DEPTH = 5, REASON_GIT_ALIAS_CONFIG = "Git aliases supplied through command-line or environment config can hide or execute commands. Run git without Git alias overrides, or ask the user to run it manually.";
function splitAtDoubleDash(tokens) {
  let index = tokens.indexOf("--");
  if (index === -1)
    return { index: -1, before: tokens, after: [] };
  return {
    index,
    before: tokens.slice(0, index),
    after: tokens.slice(index + 1)
  };
}
function resolveGitCommandLineAliases(tokens, envAssignments) {
  let configEntries = getGitConfigEntries(tokens, envAssignments), aliases = getGitConfigAliases(configEntries.entries);
  if (aliases.size === 0)
    return { blockedReason: configEntries.blockedReason, expanded: !1, tokens };
  let currentTokens = tokens, expanded = !1;
  for (let depth = 0;depth < MAX_GIT_ALIAS_EXPANSION_DEPTH; depth++) {
    let { subcommand, rest } = extractGitSubcommandAndRest(currentTokens), aliasName = subcommand?.toLowerCase();
    if (!aliasName || !aliases.has(aliasName))
      return { blockedReason: configEntries.blockedReason, expanded, tokens: currentTokens };
    let aliasValue = aliases.get(aliasName), aliasTokens = parseGitAliasValue(aliasValue);
    if (aliasTokens === null || aliasTokens.length === 0)
      return { blockedReason: REASON_GIT_ALIAS_CONFIG, expanded: !0, tokens: currentTokens };
    currentTokens = ["git", ...aliasTokens, ...rest], expanded = !0;
  }
  return { blockedReason: REASON_GIT_ALIAS_CONFIG, expanded: !0, tokens: currentTokens };
}
function hasGitCommandLineSshCommandConfig(tokens, envAssignments) {
  return getGitConfigEntries(tokens, envAssignments).entries.some((entry) => entry.key.toLowerCase() === "core.sshcommand");
}
function extractGitSubcommandAndRest(tokens) {
  if (tokens.length === 0)
    return { subcommand: null, rest: [] };
  let firstToken = tokens[0];
  if ((firstToken ? getBasename(firstToken).toLowerCase() : null) !== "git")
    return { subcommand: null, rest: [] };
  let i = 1;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      let nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith("-"))
        return { subcommand: nextToken, rest: tokens.slice(i + 2) };
      return { subcommand: null, rest: tokens.slice(i + 1) };
    }
    if (token.startsWith("-"))
      if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token))
        i += 2;
      else if (token.startsWith("-c") && token.length > 2)
        i++;
      else if (token.startsWith("-C") && token.length > 2)
        i++;
      else
        i++;
    else
      return { subcommand: token, rest: tokens.slice(i + 1) };
  }
  return { subcommand: null, rest: [] };
}
function getGitConfigAliases(entries) {
  let aliases = /* @__PURE__ */ new Map;
  for (let entry of entries) {
    let key = entry.key.toLowerCase();
    if (!key.startsWith("alias."))
      continue;
    let name = key.slice(6);
    if (name !== "")
      aliases.set(name, entry.value);
  }
  return aliases;
}
function getGitConfigEntries(tokens, envAssignments) {
  if (tokens.length === 0)
    return { blockedReason: null, entries: [] };
  let firstToken = tokens[0];
  if ((firstToken ? getBasename(firstToken).toLowerCase() : null) !== "git")
    return { blockedReason: null, entries: [] };
  let envEntries = getGitEnvConfigEntries(envAssignments);
  return {
    blockedReason: envEntries.blockedReason,
    entries: [...envEntries.entries, ...getGitCommandLineConfigEntries(tokens, envAssignments)]
  };
}
function getGitCommandLineConfigEntries(tokens, envAssignments) {
  let entries = [], i = 1;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token || token === "--" || !token.startsWith("-"))
      return entries;
    if (token === "-c") {
      let entry = parseGitConfigEntry(tokens[i + 1]);
      if (entry)
        entries.push(entry);
      i += 2;
      continue;
    }
    if (token.startsWith("-c") && token.length > 2) {
      let entry = parseGitConfigEntry(token.slice(2));
      if (entry)
        entries.push(entry);
      i++;
      continue;
    }
    if (token === "--config-env") {
      let entry = parseGitConfigEnvEntry(tokens[i + 1], envAssignments);
      if (entry)
        entries.push(entry);
      i += 2;
      continue;
    }
    if (token.startsWith("--config-env=")) {
      let entry = parseGitConfigEnvEntry(token.slice(13), envAssignments);
      if (entry)
        entries.push(entry);
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
  let parameterEntries = getGitConfigParameterEntries(envAssignments), countEntries = getGitConfigCountEntries(envAssignments);
  return {
    blockedReason: parameterEntries === null || countEntries === null ? REASON_GIT_ALIAS_CONFIG : null,
    entries: [...parameterEntries ?? [], ...countEntries ?? []]
  };
}
function getGitConfigParameterEntries(envAssignments) {
  let parameters = getGitEnvValue("GIT_CONFIG_PARAMETERS", envAssignments);
  if (parameters === void 0)
    return [];
  let entries = [], parsed = parseSimpleWords(parameters);
  if (!parsed)
    return null;
  for (let token of parsed) {
    let configEntry = parseGitConfigEntry(token);
    if (!configEntry)
      return null;
    entries.push(configEntry);
  }
  return entries;
}
function getGitConfigCountEntries(envAssignments) {
  let resolution = resolveGitConfigCount(envAssignments);
  if (resolution.state === "absent")
    return [];
  if (resolution.state === "invalid")
    return null;
  let entries = [];
  for (let i = 0;i < resolution.count; i++) {
    let key = getGitEnvValue(`GIT_CONFIG_KEY_${i}`, envAssignments)?.trim(), value = getGitEnvValue(`GIT_CONFIG_VALUE_${i}`, envAssignments);
    if (!key || value === void 0)
      return null;
    entries.push({ key, value });
  }
  return entries;
}
function parseGitConfigEntry(config) {
  if (!config)
    return null;
  let eqIdx = config.indexOf("=");
  return {
    key: (eqIdx === -1 ? config : config.slice(0, eqIdx)).trim(),
    value: eqIdx === -1 ? void 0 : config.slice(eqIdx + 1)
  };
}
function parseGitConfigEnvEntry(configEnv, envAssignments) {
  let eqIdx = configEnv?.indexOf("=") ?? -1;
  if (!configEnv || eqIdx === -1)
    return null;
  return {
    key: configEnv.slice(0, eqIdx).trim(),
    value: getGitEnvValue(configEnv.slice(eqIdx + 1), envAssignments)
  };
}
function parseGitAliasValue(value) {
  let trimmedValue = value?.trimStart();
  if (!trimmedValue || trimmedValue.startsWith("!"))
    return null;
  return parseSimpleWords(trimmedValue);
}

// src/core/git/rules.ts
var REASON_CHECKOUT_DOUBLE_DASH = "git checkout -- discards uncommitted changes permanently. Use 'git stash' first.", REASON_CHECKOUT_FORCE = "git checkout --force discards uncommitted changes. Use 'git stash' first.", REASON_CHECKOUT_REF_PATH = "git checkout <ref> -- <path> overwrites working tree with ref version. Use 'git stash' first.", REASON_CHECKOUT_PATHSPEC_FROM_FILE = "git checkout --pathspec-from-file can overwrite multiple files. Use 'git stash' first.", REASON_CHECKOUT_AMBIGUOUS = "git checkout with multiple positional args may overwrite files. Use 'git switch' for branches or 'git restore' for files.", REASON_SWITCH_DISCARD_CHANGES = "git switch --discard-changes discards uncommitted changes. Use 'git stash' first.", REASON_SWITCH_FORCE = "git switch --force discards uncommitted changes. Use 'git stash' first.", REASON_RESTORE = "git restore discards uncommitted changes. Use 'git stash' first, or use --staged to only unstage.", REASON_RESTORE_WORKTREE = "git restore --worktree explicitly discards working tree changes. Use 'git stash' first.", REASON_RESET_HARD = "git reset --hard destroys all uncommitted changes permanently. Use 'git stash' first.", REASON_RESET_MERGE = "git reset --merge can lose uncommitted changes. Use 'git stash' first.", REASON_CLEAN = "git clean -f removes untracked files permanently. Use 'git clean -n' to preview first.", REASON_PUSH_FORCE = "git push --force destroys remote history. Use --force-with-lease for safer force push.", REASON_PUSH_DELETE = "git push deletes remote refs. Ask the user to run it manually if deletion is intended.", REASON_PUSH_MIRROR = "git push --mirror can force-update and delete remote refs. Ask the user to run it manually if mirror push is intended.", REASON_BRANCH_DELETE = "git branch -D force-deletes without merge check. Use -d for safe delete.", REASON_REBASE_ABORT = "git rebase --abort discards rebase conflict resolutions. Use 'git status' first.", REASON_MERGE_ABORT = "git merge --abort discards merge conflict resolutions. Use 'git status' first.", REASON_TAG_DELETE = "git tag -d permanently deletes tags. Ask the user to run it manually if deletion is intended.", REASON_REFLOG_DELETE = "git reflog delete removes recovery history. Ask the user to run it manually if deletion is intended.", REASON_STASH_DROP = "git stash drop permanently deletes stashed changes. Consider 'git stash list' first.", REASON_STASH_CLEAR = "git stash clear deletes ALL stashed changes permanently. Use 'git stash list' to review; ask the user to run it manually if intended.", REASON_WORKTREE_REMOVE_FORCE = "git worktree remove --force can delete uncommitted changes. Remove --force flag.", CHECKOUT_OPTS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-b",
  "-B",
  "--orphan",
  "--conflict",
  "--inter-hunk-context",
  "--pathspec-from-file",
  "--unified"
]), CHECKOUT_OPTS_WITH_OPTIONAL_VALUE = /* @__PURE__ */ new Set(["--recurse-submodules", "--track", "-t"]), CHECKOUT_SHORT_OPTS_WITH_VALUE = /* @__PURE__ */ new Set(["-b", "-B", "-U"]), SWITCH_SHORT_OPTS_WITH_VALUE = /* @__PURE__ */ new Set(["-c", "-C"]), RESTORE_OPTS_WITH_VALUE = /* @__PURE__ */ new Set([
  "--source",
  "--conflict",
  "--unified",
  "--inter-hunk-context"
]), CHECKOUT_KNOWN_OPTS_NO_VALUE = /* @__PURE__ */ new Set([
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
  let optionName = token.split("=", 1)[0] ?? token;
  return optionName.length >= 4 && option.startsWith(optionName) && optionName.startsWith("--") && optionName.slice(2).length >= 2;
}
function analyzeGitRule(tokens) {
  let { subcommand, rest } = extractGitSubcommandAndRest(tokens);
  if (!subcommand)
    return null;
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
  return match ? { ...match, localDiscard: !0 } : null;
}
function sharedState(match) {
  return match ? { ...match, localDiscard: !1 } : null;
}
function analyzeGitCheckout(tokens) {
  let { index: doubleDashIdx, before: beforeDash } = splitAtDoubleDash(tokens), shortOpts = extractShortOpts(beforeDash, {
    shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE
  });
  if (beforeDash.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f"))
    return destructiveCommandMatch("git.checkout-force", REASON_CHECKOUT_FORCE);
  for (let token of tokens) {
    if (token === "-b" || token === "-B" || token === "--orphan")
      return null;
    if (matchesGitLongOption(token, "--pathspec-from-file"))
      return destructiveCommandMatch("git.checkout-pathspec-from-file", REASON_CHECKOUT_PATHSPEC_FROM_FILE);
  }
  if (doubleDashIdx !== -1) {
    if (beforeDash.some((t) => !t.startsWith("-")))
      return destructiveCommandMatch("git.checkout-ref-path", REASON_CHECKOUT_REF_PATH);
    return destructiveCommandMatch("git.checkout-double-dash", REASON_CHECKOUT_DOUBLE_DASH);
  }
  if (getCheckoutPositionalArgs(tokens).length >= 2)
    return destructiveCommandMatch("git.checkout-ambiguous", REASON_CHECKOUT_AMBIGUOUS);
  return null;
}
function analyzeGitSwitch(tokens) {
  let { before } = splitAtDoubleDash(tokens);
  if (before.some((token) => matchesGitLongOption(token, "--discard-changes")))
    return destructiveCommandMatch("git.switch-discard-changes", REASON_SWITCH_DISCARD_CHANGES);
  let shortOpts = extractShortOpts(before, {
    shortOptsWithValue: SWITCH_SHORT_OPTS_WITH_VALUE
  });
  if (before.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f"))
    return destructiveCommandMatch("git.switch-force", REASON_SWITCH_FORCE);
  return null;
}
function getCheckoutPositionalArgs(tokens) {
  let positional = [], i = 0;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      break;
    if (token === "--")
      break;
    if (token.startsWith("-"))
      if (CHECKOUT_OPTS_WITH_VALUE.has(token))
        i += 2;
      else if (token.startsWith("--") && token.includes("="))
        i++;
      else if (CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)) {
        let nextToken = tokens[i + 1];
        if (nextToken && !nextToken.startsWith("-") && (token === "--recurse-submodules" || token === "--track" || token === "-t"))
          if ((token === "--recurse-submodules" ? ["checkout", "on-demand"] : ["direct", "inherit"]).includes(nextToken))
            i += 2;
          else
            i++;
        else
          i++;
      } else if (token.startsWith("--") && !CHECKOUT_KNOWN_OPTS_NO_VALUE.has(token) && !CHECKOUT_OPTS_WITH_VALUE.has(token) && !CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token))
        i++;
      else
        i++;
    else
      positional.push(token), i++;
  }
  return positional;
}
function analyzeGitRestore(tokens) {
  let facts = parseGitRestoreFacts(tokens);
  if (facts.isTerminal || !facts.hasPathspec && !facts.hasPatch || !facts.hasWorktree)
    return null;
  return facts.hasExplicitLocation ? destructiveCommandMatch("git.restore-worktree", REASON_RESTORE_WORKTREE) : destructiveCommandMatch("git.restore-unstaged", REASON_RESTORE);
}
function parseGitRestoreFacts(tokens) {
  let hasPathspec = !1, hasPatch = !1, hasWorktree = !0, hasExplicitLocation = !1, setLocation = (worktree) => {
    if (!hasExplicitLocation)
      hasWorktree = !1, hasExplicitLocation = !0;
    if (worktree !== void 0)
      hasWorktree = worktree;
  };
  for (let i = 0;i < tokens.length; i++) {
    let token = tokens[i];
    if (token === void 0)
      break;
    if (token === "--") {
      hasPathspec ||= i + 1 < tokens.length;
      break;
    }
    if (token === "--pathspec-from-file") {
      hasPathspec = !0, i++;
      continue;
    }
    if (token.startsWith("--pathspec-from-file=")) {
      hasPathspec = !0;
      continue;
    }
    if (token === "-h" || token === "--help" || token === "--version")
      return {
        hasPathspec,
        hasPatch,
        hasWorktree,
        hasExplicitLocation,
        isTerminal: !0
      };
    if (token === "--staged") {
      setLocation();
      continue;
    }
    if (token === "--no-staged") {
      setLocation();
      continue;
    }
    if (token === "--worktree") {
      setLocation(!0);
      continue;
    }
    if (token === "--no-worktree") {
      setLocation(!1);
      continue;
    }
    if (token === "--patch") {
      hasPatch = !0;
      continue;
    }
    if (token === "--no-patch") {
      hasPatch = !1;
      continue;
    }
    if (RESTORE_OPTS_WITH_VALUE.has(token)) {
      i++;
      continue;
    }
    if (token.startsWith("--"))
      continue;
    if (token === "-") {
      hasPathspec = !0;
      continue;
    }
    if (!token.startsWith("-")) {
      hasPathspec = !0;
      continue;
    }
    for (let j = 1;j < token.length; j++) {
      let option = token.charAt(j);
      if (option === "h")
        return {
          hasPathspec,
          hasPatch,
          hasWorktree,
          hasExplicitLocation,
          isTerminal: !0
        };
      if (option === "S") {
        setLocation();
        continue;
      }
      if (option === "W") {
        setLocation(!0);
        continue;
      }
      if (option === "p") {
        hasPatch = !0;
        continue;
      }
      if (option === "s" || option === "U") {
        if (j === token.length - 1)
          i++;
        break;
      }
    }
  }
  return { hasPathspec, hasPatch, hasWorktree, hasExplicitLocation, isTerminal: !1 };
}
function analyzeGitReset(tokens) {
  let match = null;
  for (let token of tokens) {
    if (matchesGitLongOption(token, "--hard")) {
      match = destructiveCommandMatch("git.reset-hard", REASON_RESET_HARD);
      break;
    }
    if (matchesGitLongOption(token, "--merge")) {
      match = destructiveCommandMatch("git.reset-merge", REASON_RESET_MERGE);
      break;
    }
  }
  if (!match)
    return null;
  return resetHasRef(tokens) ? sharedState(match) : localDiscard(match);
}
function resetHasRef(tokens) {
  for (let token of tokens) {
    if (token === "--")
      return !1;
    if (!token.startsWith("-"))
      return !0;
  }
  return !1;
}
function analyzeGitClean(tokens) {
  for (let token of tokens)
    if (token === "-n" || matchesGitLongOption(token, "--dry-run"))
      return null;
  let shortOpts = extractShortOpts(tokens.filter((t) => t !== "--"));
  if (tokens.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f"))
    return destructiveCommandMatch("git.clean-force", REASON_CLEAN);
  return null;
}
function analyzeGitPush(tokens) {
  let { before, after } = splitAtDoubleDash(tokens), shortOpts = extractShortOpts(before);
  if (before.some((token) => matchesGitLongOption(token, "--mirror")))
    return destructiveCommandMatch("git.push-mirror", REASON_PUSH_MIRROR);
  if (before.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f") || getPushRefspecCandidates(before, after).some(isForcePushRefspec))
    return destructiveCommandMatch("git.push-force", REASON_PUSH_FORCE);
  if (before.some((token) => matchesGitLongOption(token, "--delete")) || shortOpts.has("-d") || getPushRefspecCandidates(before, after).some(isDeletePushRefspec))
    return destructiveCommandMatch("git.push-delete", REASON_PUSH_DELETE);
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
  let { before } = splitAtDoubleDash(tokens), shortOpts = extractShortOpts(before), hasDelete = shortOpts.has("-D") || shortOpts.has("-d") || before.some((token) => matchesGitLongOption(token, "--delete")), hasForce = shortOpts.has("-D") || shortOpts.has("-f") || before.some((token) => matchesGitLongOption(token, "--force"));
  if (hasDelete && hasForce)
    return destructiveCommandMatch("git.branch-force-delete", REASON_BRANCH_DELETE);
  return null;
}
function analyzeGitRebase(tokens) {
  let { before } = splitAtDoubleDash(tokens);
  return before.some((token) => matchesGitLongOption(token, "--abort")) ? destructiveCommandMatch("git.rebase-abort", REASON_REBASE_ABORT) : null;
}
function analyzeGitMerge(tokens) {
  let { before } = splitAtDoubleDash(tokens);
  return before.some((token) => matchesGitLongOption(token, "--abort")) ? destructiveCommandMatch("git.merge-abort", REASON_MERGE_ABORT) : null;
}
function analyzeGitTag(tokens) {
  let { before } = splitAtDoubleDash(tokens);
  return extractShortOpts(before).has("-d") || before.some((token) => matchesGitLongOption(token, "--delete")) ? destructiveCommandMatch("git.tag-delete", REASON_TAG_DELETE) : null;
}
function analyzeGitReflog(tokens) {
  return tokens[0] === "delete" ? destructiveCommandMatch("git.reflog-delete", REASON_REFLOG_DELETE) : null;
}
function analyzeGitStash(tokens) {
  for (let token of tokens) {
    if (token === "drop")
      return destructiveCommandMatch("git.stash-drop", REASON_STASH_DROP);
    if (token === "clear")
      return destructiveCommandMatch("git.stash-clear", REASON_STASH_CLEAR);
  }
  return null;
}
function analyzeGitWorktree(tokens) {
  let { before } = splitAtDoubleDash(tokens);
  if (!before.includes("remove"))
    return null;
  let shortOpts = extractShortOpts(before);
  if (before.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f"))
    return destructiveCommandMatch("git.worktree-remove-force", REASON_WORKTREE_REMOVE_FORCE);
  return null;
}

// src/core/git/config.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync3, readFileSync as readFileSync5 } from "node:fs";
import { dirname as dirname9, isAbsolute as isAbsolute11, join as join11, resolve as resolve9 } from "node:path";
var TRUSTED_GIT_BINARIES = [
  "/usr/bin/git",
  "/usr/local/bin/git",
  "/opt/homebrew/bin/git",
  "C:\\Program Files\\Git\\cmd\\git.exe",
  "C:\\Program Files\\Git\\bin\\git.exe"
];
function hasRecursiveSubmoduleConfig(tokens, envAssignments, gitCwd) {
  let commandLineConfig = commandLineRecursiveSubmoduleConfig(tokens, envAssignments);
  if (commandLineConfig !== null)
    return commandLineConfig;
  let envConfig = envRecursiveSubmoduleConfig(envAssignments);
  if (envConfig !== null)
    return envConfig;
  if (hasConfigAffectingEnvAssignment(envAssignments))
    return !0;
  return effectiveGitConfigEnablesRecursiveSubmodules(gitCwd);
}
function commandLineRecursiveSubmoduleConfig(tokens, envAssignments) {
  let recursiveSubmoduleConfig = null, i = 1;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token || token === "--")
      return recursiveSubmoduleConfig;
    if (!token.startsWith("-"))
      return recursiveSubmoduleConfig;
    if (token === "-c") {
      let configValue = recursiveSubmoduleConfigValue(tokens[i + 1]);
      if (configValue !== null)
        recursiveSubmoduleConfig = configValue;
      i += 2;
      continue;
    }
    if (token.startsWith("-c") && token.length > 2) {
      let configValue = recursiveSubmoduleConfigValue(token.slice(2));
      if (configValue !== null)
        recursiveSubmoduleConfig = configValue;
      i++;
      continue;
    }
    if (token === "--config-env") {
      let configValue = recursiveSubmoduleConfigEnvValue(tokens[i + 1], envAssignments);
      if (configValue !== null)
        recursiveSubmoduleConfig = configValue;
      i += 2;
      continue;
    }
    if (token.startsWith("--config-env=")) {
      let configValue = recursiveSubmoduleConfigEnvValue(token.slice(13), envAssignments);
      if (configValue !== null)
        recursiveSubmoduleConfig = configValue;
      i++;
      continue;
    }
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token))
      i += 2;
    else
      i++;
  }
  return recursiveSubmoduleConfig;
}
function envRecursiveSubmoduleConfig(envAssignments) {
  if (getGitEnvValue("GIT_CONFIG_PARAMETERS", envAssignments) !== void 0)
    return !0;
  let resolution = resolveGitConfigCount(envAssignments);
  if (resolution.state === "absent")
    return null;
  if (resolution.state === "invalid")
    return !0;
  let recursiveSubmoduleConfig = null;
  for (let i = 0;i < resolution.count; i++) {
    let rawKey = getGitEnvValue(`GIT_CONFIG_KEY_${i}`, envAssignments), value = getGitEnvValue(`GIT_CONFIG_VALUE_${i}`, envAssignments);
    if (!rawKey?.trim() || value === void 0)
      return !0;
    let key = rawKey.trim().toLowerCase();
    if (isIncludeConfigKey(key))
      return !0;
    if (key !== "submodule.recurse")
      continue;
    recursiveSubmoduleConfig = gitConfigValueEnablesRecursiveSubmodules(value);
  }
  return recursiveSubmoduleConfig;
}
function effectiveGitConfigEnablesRecursiveSubmodules(cwd, gitBinary = getTrustedGitBinary()) {
  let localConfigResult = localGitConfigEnablesRecursiveSubmodules(cwd);
  if (localConfigResult === null || localConfigResult)
    return !0;
  if (gitBinary === null)
    return !0;
  try {
    let value = execFileSync(gitBinary, ["config", "--get", "submodule.recurse"], {
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
  let configPaths = getLocalGitConfigPaths(cwd);
  if (configPaths === null)
    return null;
  for (let configPath of configPaths) {
    if (!existsSync3(configPath))
      continue;
    if (gitConfigFileEnablesRecursiveSubmodules(configPath))
      return !0;
  }
  return !1;
}
function getTrustedGitBinary() {
  for (let gitBinary of TRUSTED_GIT_BINARIES)
    if (existsSync3(gitBinary))
      return gitBinary;
  return null;
}
function withoutGitConfigEnv(env) {
  let nextEnv = { ...env };
  for (let key of Object.keys(nextEnv))
    if (isGitConfigEnvName(key))
      delete nextEnv[key];
  return nextEnv;
}
function isGitConfigUnsetError(error) {
  return typeof error === "object" && error !== null && "status" in error && error.status === 1;
}
function getLocalGitConfigPaths(cwd) {
  let dotGitPath = findDotGitInAncestors(cwd);
  if (dotGitPath === null)
    return null;
  let gitDir = resolveGitDirFromDotGit(dotGitPath);
  if (gitDir === null)
    return null;
  let commonDir = resolveCommonGitDir(gitDir);
  if (commonDir === null)
    return null;
  return [join11(commonDir, "config"), join11(gitDir, "config.worktree")];
}
function resolveGitDirFromDotGit(dotGitPath) {
  try {
    let firstLine = readFileSync5(dotGitPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine.startsWith("gitdir:"))
      return dotGitPath;
    let rawGitDir = firstLine.slice(7).trim();
    if (rawGitDir === "")
      return null;
    return isAbsolute11(rawGitDir) ? rawGitDir : resolve9(dirname9(dotGitPath), rawGitDir);
  } catch {
    return null;
  }
}
function resolveCommonGitDir(gitDir) {
  let commonDirPath = join11(gitDir, "commondir");
  if (!existsSync3(commonDirPath))
    return gitDir;
  try {
    let rawCommonDir = readFileSync5(commonDirPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (rawCommonDir === "")
      return null;
    return isAbsolute11(rawCommonDir) ? rawCommonDir : resolve9(gitDir, rawCommonDir);
  } catch {
    return null;
  }
}
function gitConfigFileEnablesRecursiveSubmodules(configPath) {
  let content;
  try {
    content = readFileSync5(configPath, "utf-8");
  } catch {
    return !0;
  }
  let section = "", recursiveSubmoduleConfig = !1;
  for (let line of content.split(/\r?\n/)) {
    let trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";"))
      continue;
    let sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1]?.trim().toLowerCase() ?? "";
      continue;
    }
    let eqIdx = trimmed.indexOf("="), key = (eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx)).trim().toLowerCase(), value = eqIdx === -1 ? "true" : trimmed.slice(eqIdx + 1).trim();
    if (isIncludeConfigSection(section) && key === "path")
      return !0;
    if (section === "submodule" && key === "recurse")
      recursiveSubmoduleConfig = gitConfigValueEnablesRecursiveSubmodules(value);
  }
  return recursiveSubmoduleConfig;
}
function isIncludeConfigSection(section) {
  return section === "include" || section.startsWith("includeif ");
}
function recursiveSubmoduleConfigValue(config) {
  if (!config)
    return null;
  let eqIdx = config.indexOf("="), key = (eqIdx === -1 ? config : config.slice(0, eqIdx)).toLowerCase();
  if (isIncludeConfigKey(key))
    return !0;
  if (key !== "submodule.recurse")
    return null;
  let value = eqIdx === -1 ? "true" : config.slice(eqIdx + 1).toLowerCase();
  return gitConfigValueEnablesRecursiveSubmodules(value);
}
function gitConfigValueEnablesRecursiveSubmodules(value) {
  let normalizedValue = value.toLowerCase();
  return normalizedValue !== "false" && normalizedValue !== "no" && normalizedValue !== "off" && normalizedValue !== "0";
}
function recursiveSubmoduleConfigEnvValue(configEnv, envAssignments) {
  let eqIdx = configEnv?.indexOf("=") ?? -1;
  if (!configEnv || eqIdx === -1)
    return null;
  let key = configEnv.slice(0, eqIdx).toLowerCase();
  if (isIncludeConfigKey(key))
    return !0;
  if (key !== "submodule.recurse")
    return null;
  let value = getGitEnvValue(configEnv.slice(eqIdx + 1), envAssignments);
  return value === void 0 || gitConfigValueEnablesRecursiveSubmodules(value);
}
function isIncludeConfigKey(key) {
  return key === "include.path" || key.startsWith("includeif.") && key.endsWith(".path");
}

// src/core/git/worktree-relaxation.ts
function getGitWorktreeRelaxationForMatch(tokens, match, options2) {
  if (!match.localDiscard || !options2.worktreeMode || hasGitContextEnvOverride(options2.envAssignments))
    return null;
  let context = getGitExecutionContext(tokens, options2.cwd);
  if (!context.gitCwd || context.hasExplicitGitContext)
    return null;
  if (!isLinkedWorktree(context.gitCwd))
    return null;
  if (isNonRelaxableLocalDiscard(tokens, options2, context.gitCwd))
    return null;
  return {
    originalReason: match.reason,
    gitCwd: context.gitCwd
  };
}
function isNonRelaxableLocalDiscard(tokens, options2, gitCwd) {
  let { subcommand, rest } = extractGitSubcommandAndRest(tokens), normalizedSubcommand = subcommand?.toLowerCase();
  if (options2.dynamicArguments || hasDynamicGitArgument(rest) || hasRecursiveSubmoduleConfig(tokens, options2.envAssignments, gitCwd) || hasRecurseSubmodulesOption(rest) || isForcedBranchReset(normalizedSubcommand, rest))
    return !0;
  return normalizedSubcommand === "clean" && countCleanForceFlags(rest) > 1;
}
function hasDynamicGitArgument(tokens) {
  return tokens.some((token) => /[$*?[]/.test(token));
}
function isForcedBranchReset(subcommand, rest) {
  if (subcommand === "checkout") {
    let { before } = splitAtDoubleDash(rest), shortOpts = extractShortOpts(before, {
      shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE
    }), hasForce = before.some((token) => matchesGitLongOption(token, "--force")) || shortOpts.has("-f"), hasBranchReset = shortOpts.has("-B") || before.some((token) => token === "-B" || token.startsWith("-B"));
    return hasForce && hasBranchReset;
  }
  if (subcommand === "switch") {
    let { before } = splitAtDoubleDash(rest), shortOpts = extractShortOpts(before, {
      shortOptsWithValue: SWITCH_SHORT_OPTS_WITH_VALUE
    }), hasForce = before.some((token) => matchesGitLongOption(token, "--force")) || before.some((token) => matchesGitLongOption(token, "--discard-changes")) || shortOpts.has("-f"), hasForceCreate = before.some((token) => token === "-C" || token.startsWith("-C") || isForceCreateOption(token)) || shortOpts.has("-C");
    return hasForce && hasForceCreate;
  }
  return !1;
}
function isForceCreateOption(token) {
  let optionName = token.split("=", 1)[0] ?? token;
  return optionName === "--force-create" || optionName.length >= 9 && "--force-create".startsWith(optionName);
}
function hasRecurseSubmodulesOption(tokens) {
  return tokens.some((token) => token.startsWith("--recurse-sub"));
}
function countCleanForceFlags(tokens) {
  let count = 0;
  for (let token of tokens) {
    if (token === "--force") {
      count++;
      continue;
    }
    if (token.startsWith("-") && !token.startsWith("--")) {
      for (let opt of token.slice(1))
        if (opt === "f")
          count++;
    }
  }
  return count;
}

// src/core/git/index.ts
var REASON_GIT_SSH_ENV = "Git SSH environment overrides can execute arbitrary commands during network operations. Run git without GIT_SSH/GIT_SSH_COMMAND overrides, or ask the user to run it manually.", GIT_NETWORK_SUBCOMMANDS = /* @__PURE__ */ new Set([
  "clone",
  "fetch",
  "pull",
  "push",
  "ls-remote",
  "submodule"
]);
function analyzeGitMatch(tokens, options2 = {}) {
  return evaluateGit(tokens, options2);
}
function evaluateGit(tokens, options2, onRelaxation) {
  let aliasResolution = resolveGitCommandLineAliases(tokens, options2.envAssignments), aliasConfigDisabled = options2.policy?.destructiveCommandRuleOverrides["git.alias-config"] === "off";
  if (aliasResolution.blockedReason && !aliasConfigDisabled)
    return destructiveCommandMatch("git.alias-config", aliasResolution.blockedReason);
  let analysisTokens = aliasResolution.tokens;
  if ((hasGitSshEnvAssignment(options2.envAssignments) || hasGitCommandLineSshCommandConfig(tokens, options2.envAssignments)) && isGitNetworkOperation(analysisTokens))
    return destructiveCommandMatch("git.ssh-env", REASON_GIT_SSH_ENV);
  let match = analyzeGitRule(analysisTokens);
  if (!match)
    return null;
  if (aliasResolution.expanded || aliasResolution.blockedReason)
    return match;
  let relaxation = getGitWorktreeRelaxationForMatch(tokens, match, options2);
  if (!relaxation)
    return match;
  return onRelaxation?.(relaxation), null;
}
function analyzeGitDetailed(tokens, options2 = {}) {
  let relaxation = null;
  return { match: evaluateGit(tokens, options2, (value) => {
    relaxation = value;
  }), relaxation };
}
function isGitNetworkOperation(tokens) {
  let { subcommand, rest } = extractGitSubcommandAndRest(tokens), subcommandName = subcommand?.toLowerCase();
  if (!subcommandName)
    return !1;
  if (GIT_NETWORK_SUBCOMMANDS.has(subcommandName))
    return !0;
  if (subcommandName === "archive")
    return splitAtDoubleDash(rest).before.some((token) => matchesGitLongOption(token, "--remote"));
  return subcommandName === "remote" && isGitRemoteUpdateOperation(rest);
}
function isGitRemoteUpdateOperation(tokens) {
  return tokens.find((token) => !isGitRemotePrefixOption(token))?.toLowerCase() === "update";
}
function isGitRemotePrefixOption(token) {
  return token === "-v" || matchesGitLongOption(token, "--verbose") || matchesGitLongOption(token, "--no-verbose");
}

// src/core/analyze/child-analyzer.ts
function analyzeChildCommandMatch(tokens, context, options2 = {}) {
  if (tokens.length === 0)
    return null;
  let head = tokens[0];
  if (!head)
    return null;
  let normalizedHead = normalizeCommandToken(head);
  if (normalizedHead === "eval") {
    let source = extractEvalSource(tokens, void 0);
    if (source.kind === "dynamic")
      return getShellDynamicReason(options2, context);
    if (source.kind === "literal" && context.analyzeNested) {
      let result = context.analyzeNested(source.source, {
        effectiveCwd: context.cwd,
        envAssignments: context.envAssignments
      });
      if (result)
        return result;
    }
    return getDynamicSourceReason(options2, context);
  }
  if (SHELL_WRAPPERS.has(normalizedHead)) {
    if (isShellSyntaxCheck(tokens))
      return null;
    let dashCArg = extractDashCArg(tokens);
    if (dashCArg) {
      if (options2.dynamicSourceInput ?? options2.dynamicInput) {
        let result2 = getShellDynamicReason(options2, context);
        if (result2)
          return result2;
      }
      if (shellSourceHasUnresolvedDynamicExecutionCarrier(dashCArg)) {
        let result2 = getShellDynamicReason(options2, context);
        if (result2)
          return result2;
      }
      if (!context.analyzeNested)
        return null;
      let result = context.analyzeNested(dashCArg, {
        effectiveCwd: context.cwd,
        envAssignments: context.envAssignments
      });
      if (result)
        return result;
      return null;
    }
    let scriptSource = extractShellScriptOperandSource(tokens, void 0);
    if (scriptSource.kind === "dynamic")
      return getShellDynamicReason(options2, context);
    if (scriptSource.kind === "literal") {
      if (options2.dynamicSourceInput)
        return getShellDynamicReason(options2, context);
      return null;
    }
    if (options2.dynamicSourceInput ?? options2.dynamicInput)
      return getShellDynamicReason(options2, context);
    return null;
  }
  if (AWK_INTERPRETERS.has(normalizedHead))
    return filterDestructiveCommandMatch(analyzeAwkSystemCallMatch(tokens, (command2) => context.analyzeNested ? context.analyzeNested(command2, {
      effectiveCwd: context.cwd,
      envAssignments: context.envAssignments
    }) : null), context.policy) ?? checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ?? getDynamicSourceReason(options2, context);
  if (isInterpreterCommand(normalizedHead)) {
    let codeArg = extractInterpreterCodeArg(tokens);
    if (!codeArg)
      return getDynamicSourceReason(options2, context);
    if (destructiveCommandRuleIsEnabled(context.policy, "interpreter.one-liner-paranoid", !!context.paranoidInterpreters)) {
      let paranoidMatch = filterDestructiveCommandMatch(destructiveCommandMatch("interpreter.one-liner-paranoid", REASON_INTERPRETER_BLOCKED), context.policy);
      if (paranoidMatch)
        return paranoidMatch;
    }
    if (isInterpreterDisplayOnly(normalizedHead, codeArg))
      return getDynamicSourceReason(options2, context);
    let nestedResult = context.analyzeNested?.(codeArg, {
      effectiveCwd: context.cwd,
      envAssignments: context.envAssignments
    });
    if (nestedResult && nestedResult.id !== "raw-text.dangerous-command" && (nestedResult.reason !== REASON_STRICT_UNPARSEABLE || hasUnclosedQuotes(codeArg)))
      return nestedResult;
    if (containsDangerousCode(codeArg, context.scanWork))
      return filterDestructiveCommandMatch(destructiveCommandMatch("interpreter.dangerous-command", REASON_INTERPRETER_DANGEROUS), context.policy) ?? getDynamicSourceReason(options2, context);
    return getDynamicSourceReason(options2, context);
  }
  if (normalizedHead === "rm" && (hasRecursiveForceFlags(tokens) || options2.dynamicRmInput))
    return (hasRecursiveForceFlags(tokens) ? filterDestructiveCommandMatch(analyzeRmMatch([...tokens], {
      cwd: context.cwd,
      originalCwd: context.originalCwd,
      strict: context.strict,
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar,
      tmpdirVarExpandsEmpty: isTmpdirKnownEmpty(context.envAssignments),
      tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(context.envAssignments),
      trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments),
      policy: context.policy
    }), context.policy) : null) ?? (options2.dynamicRmInput ? getDynamicSourceReason(options2, context) : null) ?? getDynamicRmReason(options2, context);
  if (normalizedHead === "find")
    return analyzeFindMatch(tokens, {
      ...context,
      derivedCommandWorkBudget: context.derivedCommandWorkBudget,
      analyzeTokens: (nestedTokens, cwd) => analyzeChildCommandMatch(nestedTokens, {
        ...context,
        cwd: cwd ?? void 0,
        derivedCommandWorkBudget: context.derivedCommandWorkBudget
      }, options2)
    }) ?? checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ?? getDynamicSourceReason(options2, context);
  if (normalizedHead === "git")
    return filterDestructiveCommandMatch(analyzeGitMatch(tokens, {
      cwd: context.cwd,
      envAssignments: context.envAssignments,
      policy: context.policy,
      worktreeMode: options2.dynamicInput ? !1 : context.worktreeMode
    }), context.policy) ?? checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ?? getDynamicSourceReason(options2, context);
  return checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ?? getDynamicSourceReason(options2, context);
}
function getShellDynamicReason(options2, context) {
  let match = options2.shellDynamicMatch ?? (options2.shellDynamicReason ? { id: "", reason: options2.shellDynamicReason, intent: "manual_only" } : void 0);
  return match ? filterDestructiveCommandMatch(match, context.policy) : null;
}
function getDynamicSourceReason(options2, context) {
  return options2.dynamicSourceInput && options2.dynamicSourceMatch ? filterDestructiveCommandMatch(options2.dynamicSourceMatch, context.policy) : null;
}
function getDynamicRmReason(options2, context) {
  let rmDynamicMatch = options2.rmDynamicMatch ?? (options2.rmDynamicReason ? { id: "", reason: options2.rmDynamicReason, intent: "manual_only" } : void 0);
  return options2.dynamicInput && rmDynamicMatch ? filterDestructiveCommandMatch(rmDynamicMatch, context.policy) : null;
}

// src/core/analyze/xargs.ts
var REASON_XARGS_RM = "xargs rm -rf with dynamic input is dangerous. Use explicit file list instead.", REASON_XARGS_SHELL = "xargs dynamic input can supply arbitrary executable command source. Use an explicit child command and arguments instead.", XARGS_APPENDED_INPUT = "__CC_SAFETY_NET_XARGS_INPUT__", XARGS_INTERPRETER_INPUT = "__CC_SAFETY_NET_XARGS_INTERPRETER_INPUT__", XARGS_DYNAMIC_WRAPPER_CHILD = "rm", EXECUTED_SHELL_EXPANSION_RE = /(?:^|[;&|]\s*|\b(?:eval|source)\s+|\b(?:ba|da|z|k)?sh\s+-c\s+)\s*["']?\$(?:([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)|\{!?([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)(?:[^}]*)\})/g, EVAL_SHELL_SOURCE_RE = /(?:^|[;&|]\s*)\s*eval\b((?:\\.|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\\'";&|\r\n])*)/g, SHELL_EXPANSION_RE = /\$(?:([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)|\{!?([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)(?:[^}]*)\})/g, POSITIONAL_SHELL_PARAMETER_RE2 = /^(?:[0-9]+|[@*])$/, PROTECTED_GIT_SUBCOMMANDS = /* @__PURE__ */ new Set([
  "branch",
  "checkout",
  "clean",
  "push",
  "reset",
  "restore",
  "switch",
  "tag"
]);
function analyzeXargs(tokens, context) {
  let { childTokens: rawChildTokens, replacementToken } = extractXargsChildCommandWithInfo(tokens), shellDynamicMatch = destructiveCommandMatch("xargs.shell-dynamic", REASON_XARGS_SHELL);
  if (xargsInputCanSupplyWrapperChild(rawChildTokens, replacementToken, context) && filterDestructiveCommandMatch(shellDynamicMatch, context.policy))
    return filterDestructiveCommandMatch(shellDynamicMatch, context.policy);
  for (let childCommand of normalizeChildCommands(rawChildTokens, context)) {
    let childTokens = childCommand.tokens, dynamicExecutableResult = replacementToken !== null && childTokens[0] !== rawChildTokens[0] && (childTokens[0]?.includes(replacementToken) ?? !1) ? filterDestructiveCommandMatch(shellDynamicMatch, context.policy) : null;
    if (dynamicExecutableResult)
      return dynamicExecutableResult;
    let dynamicInput = xargsInputIsDynamic(childTokens, replacementToken, childCommand.wrapperEnvAssignments), dynamicRmInput = childCommand.head === "rm" && replacementToken !== null && replacementCanChangeRmOptions(childTokens, replacementToken), childResult = analyzeChildCommandMatch(childTokens, {
      ...context,
      cwd: childCommand.cwd,
      envAssignments: childCommand.envAssignments
    }, {
      dynamicInput,
      dynamicSourceInput: dynamicRmInput || xargsInputCanChangeExecutedSource(childTokens, childCommand.head, replacementToken, childCommand.wrapperEnvAssignments, dynamicInput, context.scanWork),
      dynamicRmInput,
      shellDynamicMatch,
      dynamicSourceMatch: shellDynamicMatch,
      rmDynamicMatch: destructiveCommandMatch("xargs.rm-recursive-force-dynamic", REASON_XARGS_RM)
    });
    if (childResult)
      return childResult;
    let dynamicCustomResult = matchDynamicPolicyRule(childTokens, replacementToken, context.policy?.rules ?? []);
    if (dynamicCustomResult)
      return dynamicCustomResult;
    if (childCommand.head === "git") {
      let gitTokens = replacementToken === null ? [...childTokens, XARGS_APPENDED_INPUT] : childTokens, hasDynamicReplacement = replacementToken !== null && (childTokens.some((token) => token.includes(replacementToken)) || Array.from(childCommand.envAssignments.values()).some((value) => value.includes(replacementToken))), gitResult = analyzeChildCommandMatch(gitTokens, {
        ...context,
        cwd: childCommand.cwd,
        envAssignments: childCommand.envAssignments,
        worktreeMode: replacementToken === null || hasDynamicReplacement ? !1 : context.worktreeMode
      });
      if (gitResult)
        return gitResult;
    }
    let customResult = checkPolicyRuleMatch(childTokens, context.policy?.rules ?? []);
    if (customResult)
      return customResult;
  }
  return null;
}
function matchDynamicPolicyRule(tokens, replacementToken, rules) {
  if (rules.length === 0)
    return null;
  if (replacementToken === null) {
    for (let rule of rules) {
      let result = checkPolicyRuleMatch([...tokens, ...rule.subcommand ? [rule.subcommand] : [], ...rule.block_args], rules);
      if (result)
        return result;
    }
    return null;
  }
  let values = new Set(rules.flatMap((rule) => [rule.subcommand, ...rule.block_args].flatMap((target) => target ? tokens.flatMap((token) => replacementValuesThatProduce(token, replacementToken, target)) : [])));
  for (let value of values) {
    let result = checkPolicyRuleMatch(tokens.map((token) => token.replaceAll(replacementToken, value)), rules);
    if (result)
      return result;
  }
  return null;
}
function replacementValuesThatProduce(token, replacementToken, target) {
  let first = token.indexOf(replacementToken);
  if (first === -1 || token.indexOf(replacementToken, first + replacementToken.length) !== -1)
    return [];
  let prefix = token.slice(0, first), suffix = token.slice(first + replacementToken.length);
  return target.startsWith(prefix) && target.endsWith(suffix) ? [target.slice(prefix.length, target.length - suffix.length)] : [];
}
function xargsInputCanChangeExecutedSource(childTokens, childHead, replacementToken, wrapperEnvAssignments, dynamicInput, scanWork) {
  if (SHELL_WRAPPERS.has(childHead)) {
    if (isShellSyntaxCheck(childTokens))
      return !1;
    if (replacementToken !== null && shellArgvTokensCanSelectExecutableSource(childTokens, replacementToken))
      return !0;
    let source = extractDashCArg(childTokens);
    if (!source) {
      let scriptSource = extractShellScriptOperandSource(childTokens, void 0);
      if (scriptSource.kind === "literal")
        return replacementToken !== null && scriptSource.source.includes(replacementToken);
      return scriptSource.kind === "none" && dynamicInput;
    }
    if (replacementToken !== null && source.includes(replacementToken))
      return !0;
    if (dangerousInTextMatch(source, scanWork))
      return !0;
    return shellSourceExecutesDynamicInput(source, replacementToken, wrapperEnvAssignments);
  }
  if (isInterpreterCommand(childHead))
    return executableSourceInputCanChange(childTokens, replacementToken, parseInterpreterArgv, getInterpreterExecutableSourceSelectors(childHead));
  if (AWK_INTERPRETERS.has(childHead))
    return executableSourceInputCanChange(childTokens, replacementToken, parseAwkArgv, AWK_EXECUTABLE_SOURCE_SELECTORS);
  if (childHead === "eval") {
    let source = extractEvalSource(childTokens, void 0);
    if (source.kind === "dynamic")
      return !0;
    if (replacementToken !== null)
      return source.kind === "literal" && source.source.includes(replacementToken);
    return dynamicInput;
  }
  if (childHead === "find")
    return findInputCanChangeExecutedSource(childTokens, replacementToken, scanWork);
  if (childHead === "git") {
    let parsed = extractGitSubcommandAndRest(childTokens);
    return replacementToken === null ? parsed.subcommand === null : (parsed.subcommand?.includes(replacementToken) ?? !1) || parsed.subcommand !== null && PROTECTED_GIT_SUBCOMMANDS.has(parsed.subcommand.toLowerCase()) && tokensBeforeStableOptionTerminator(parsed.rest, replacementToken).some((token) => token.includes(replacementToken));
  }
  return !1;
}
function executableSourceInputCanChange(tokens, replacementToken, parse2, selectors) {
  let parsed = parse2(tokens);
  if (replacementToken === null)
    return parsed.optionsOpen || parse2([...tokens, XARGS_INTERPRETER_INPUT]).sources.some((source) => source.value === XARGS_INTERPRETER_INPUT);
  if (parsed.sources.some((source) => source.value.includes(replacementToken)))
    return !0;
  let existingSources = new Set(parsed.sources.map((source) => `${source.tokenIndex}\x00${source.kind}\x00${source.value}`)), targets = selectors.flatMap((source) => [
    source.selector,
    ...source.valueForm === "attached-only" || source.valueForm === "attached-or-separate" ? [`${source.selector}${XARGS_INTERPRETER_INPUT}`] : [],
    ...source.valueForm === "equals-or-separate" ? [`${source.selector}=${XARGS_INTERPRETER_INPUT}`] : []
  ]), candidates = new Set(targets.flatMap((target) => tokens.flatMap((token) => replacementValuesThatProduce(token, replacementToken, target))));
  return Array.from(candidates).some((candidate) => parse2(tokens.map((token) => token.replaceAll(replacementToken, candidate))).sources.some((source) => !existingSources.has(`${source.tokenIndex}\x00${source.kind}\x00${source.value}`)));
}
function xargsInputCanSupplyWrapperChild(tokens, replacementToken, context) {
  if (tokens.length === 0 || (tokens[0] ?? "").toLowerCase() === "command")
    return !1;
  let originalHeads = new Set(Array.from(normalizeChildCommands(tokens, context), (child) => child.head)), candidateTokens = replacementToken === null ? [...tokens, XARGS_DYNAMIC_WRAPPER_CHILD] : tokens.map((token, index) => index === 0 ? token : token.replaceAll(replacementToken, XARGS_DYNAMIC_WRAPPER_CHILD));
  return Array.from(normalizeChildCommands(candidateTokens, context)).some((child) => child.head === XARGS_DYNAMIC_WRAPPER_CHILD && !originalHeads.has(XARGS_DYNAMIC_WRAPPER_CHILD));
}
function replacementCanChangeRmOptions(tokens, replacementToken) {
  return tokensBeforeStableOptionTerminator(tokens.slice(1), replacementToken).some((token) => token.includes(replacementToken) && (token.startsWith("-") || token.startsWith(replacementToken)));
}
function tokensBeforeStableOptionTerminator(tokens, replacementToken) {
  let index = tokens.findIndex((token) => token === "--" && !token.includes(replacementToken));
  return index === -1 ? tokens : tokens.slice(0, index);
}
function xargsInputIsDynamic(childTokens, replacementToken, wrapperEnvAssignments) {
  if (replacementToken === null)
    return !0;
  return childTokens.some((token) => token.includes(replacementToken)) || Array.from(wrapperEnvAssignments.values()).some((value) => value.includes(replacementToken));
}
function shellArgvTokensCanSelectExecutableSource(tokens, replacementToken) {
  let baseline = parseShellArgv(tokens);
  if (baseline.commandIndex !== null && (tokens[baseline.commandIndex] ?? "").includes(replacementToken) || baseline.scriptIndex !== null && (tokens[baseline.scriptIndex] ?? "").includes(replacementToken))
    return !0;
  return ["-c", "-nc", "-cn", `--${replacementToken}`, replacementToken].some((target) => tokens.some((token, tokenIndex) => {
    if (tokenIndex === 0 || !token.includes(replacementToken))
      return !1;
    return replacementValuesThatProduce(token, replacementToken, target).some((candidate) => {
      let replaced = tokens.map((value, index) => index === tokenIndex ? value.replaceAll(replacementToken, candidate) : value), parsed = parseShellArgv(replaced);
      if (parsed.commandIndex === null && parsed.scriptIndex === null)
        return !1;
      if (baseline.commandIndex === null && parsed.commandIndex !== null)
        return !0;
      if (baseline.scriptIndex === null && parsed.scriptIndex !== null)
        return !0;
      if (parsed.commandIndex !== null && (replaced[parsed.commandIndex] ?? "").includes(candidate))
        return !0;
      return parsed.scriptIndex !== null && (replaced[parsed.scriptIndex] ?? "").includes(candidate);
    });
  }));
}
function shellSourceExecutesDynamicInput(source, replacementToken, wrapperEnvAssignments) {
  let dynamicEnvNames = new Set(replacementToken === null ? [] : Array.from(wrapperEnvAssignments).filter(([, value]) => value.includes(replacementToken)).map(([name]) => name));
  for (let match of source.matchAll(EXECUTED_SHELL_EXPANSION_RE))
    if (isDynamicShellParameter(match, dynamicEnvNames))
      return !0;
  for (let evalMatch of source.matchAll(EVAL_SHELL_SOURCE_RE))
    for (let match of (evalMatch[1] ?? "").matchAll(SHELL_EXPANSION_RE))
      if (isDynamicShellParameter(match, dynamicEnvNames))
        return !0;
  return shellSourceHasDynamicExecutionCarrier(source, dynamicEnvNames);
}
function isDynamicShellParameter(match, dynamicEnvNames) {
  let parameter = match[1] ?? match[2];
  return parameter !== void 0 && (POSITIONAL_SHELL_PARAMETER_RE2.test(parameter) || dynamicEnvNames.has(parameter));
}
function findInputCanChangeExecutedSource(childTokens, replacementToken, scanWork) {
  if (replacementToken === null)
    return !0;
  let inExpression = !1, expressionDataArgs = 0;
  for (let index = 1;index < childTokens.length; index++) {
    let token = childTokens[index] ?? "";
    if (!inExpression && !token.startsWith("-") && token !== "!" && token !== "(") {
      if (token.indexOf(replacementToken) === 0)
        return !0;
      continue;
    }
    if (inExpression = !0, expressionDataArgs > 0) {
      expressionDataArgs--;
      continue;
    }
    if (isFindExecPrimary(token)) {
      let execCommand = getFindExecCommand(childTokens, index);
      index = execCommand.nextIndex - 1;
      for (let childCommand of normalizeChildCommands(execCommand.tokens, {
        cwd: void 0
      })) {
        let dynamicInput = xargsInputIsDynamic(childCommand.tokens, replacementToken, childCommand.wrapperEnvAssignments);
        if (childCommand.head === "rm" && replacementCanChangeRmOptions(childCommand.tokens, replacementToken) || xargsInputCanChangeExecutedSource(childCommand.tokens, childCommand.head, replacementToken, childCommand.wrapperEnvAssignments, dynamicInput, scanWork))
          return !0;
      }
      continue;
    }
    let arity = getFindPrimaryArity(token);
    if (arity > 0) {
      if (expressionDataArgs = arity, token.includes(replacementToken))
        return !0;
      continue;
    }
    if (token.includes(replacementToken))
      return !0;
  }
  return !1;
}
function extractXargsChildCommandWithInfo(tokens) {
  let xargsOptsWithValue = /* @__PURE__ */ new Set([
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
  ]), replacementToken = null, i = 1;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      break;
    if (token === "--")
      return { childTokens: [...tokens.slice(i + 1)], replacementToken };
    if (token.startsWith("-")) {
      if (token === "-I") {
        replacementToken = tokens[i + 1] ?? "{}", i += 2;
        continue;
      }
      if (token.startsWith("-I") && token.length > 2) {
        replacementToken = token.slice(2), i++;
        continue;
      }
      if (token === "--replace") {
        replacementToken = "{}", i++;
        continue;
      }
      if (token.startsWith("--replace=")) {
        let value = token.slice(10);
        replacementToken = value === "" ? "{}" : value, i++;
        continue;
      }
      if (token === "-J") {
        replacementToken = tokens[i + 1] ?? "{}", i += 2;
        continue;
      }
      if (xargsOptsWithValue.has(token))
        i += 2;
      else if (token.startsWith("--") && token.includes("="))
        i++;
      else if (token.startsWith("-L") || token.startsWith("-n") || token.startsWith("-P") || token.startsWith("-s"))
        i++;
      else
        i++;
    } else
      return { childTokens: [...tokens.slice(i)], replacementToken };
  }
  return { childTokens: [], replacementToken };
}

// src/core/analyze/parallel.ts
var REASON_PARALLEL_RM = "parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.", REASON_PARALLEL_SHELL = "parallel with shell -c can execute arbitrary commands from dynamic input. Run the inner command directly on an explicit file list instead.", REASON_PARALLEL_COMMAND_STREAM = "parallel without a command reads executable commands from dynamic input. Use an explicit command template or ::: arguments instead.", REASON_PARALLEL_UNSUPPORTED = "parallel command construction cannot be verified safely. Use the default ::: separator, literal arguments, and built-in replacement strings.", PARALLEL_PLACEHOLDER_RE = /\{[^{}\s]*\}/, PARALLEL_RM_PLACEHOLDER_RE = /\{\}|\{-?\d+\}/g, PROTECTED_GIT_SUBCOMMANDS2 = /* @__PURE__ */ new Set([
  "branch",
  "checkout",
  "clean",
  "merge",
  "push",
  "rebase",
  "reflog",
  "reset",
  "restore",
  "stash",
  "switch",
  "tag",
  "worktree"
]), AWK_SOURCE_OPTION_INPUTS = ["e", "f", "source", "file", "-e", "-f", "--source", "--file"], INTERPRETER_SOURCE_OPTION_INPUTS = [
  "c",
  "e",
  "eval",
  "m",
  "r",
  "Mmodule",
  "import",
  "require",
  "-c",
  "-e",
  "-m",
  "-r",
  "--eval",
  "--import",
  "--require"
], PARALLEL_APPENDED_SOURCE = "__CC_SAFETY_NET_PARALLEL_SOURCE__", UTF8_ENCODER2 = /* @__PURE__ */ new TextEncoder, MAX_EXPANDED_BYTE_OVERCOUNT = PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 4 * PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements;
function analyzeParallel(tokens, context) {
  if ((context.envAssignments?.has("PARALLEL") ? context.envAssignments.get("PARALLEL") : process.env.PARALLEL)?.trim()) {
    let reason = parallelUnsupportedReason(context);
    if (reason)
      return reason;
  }
  if (tokens.length === 2 && (tokens[1] === "--version" || tokens[1] === "--help"))
    return null;
  let parseResult = parseParallelCommand(tokens);
  if (!parseResult)
    return null;
  let {
    template,
    jobs,
    runsRemotely,
    envNames,
    readsCommandsFromInput,
    unsupported,
    workdir,
    dryRun
  } = parseResult;
  if (unsupported) {
    let reason = parallelUnsupportedReason(context);
    if (reason)
      return reason;
  }
  if (readsCommandsFromInput) {
    let reason = parallelCommandStreamDynamicReason(context);
    if (reason)
      return reason;
  }
  if (workdir !== void 0 && runsRemotely) {
    let reason = parallelUnsupportedReason(context);
    if (reason)
      return reason;
  }
  let workdirCwd = resolveParallelWorkdir(workdir, context.cwd);
  if (workdirCwd === null) {
    let reason = parallelUnsupportedReason(context);
    if (reason)
      return reason;
  }
  let executionContext = runsRemotely ? { ...context, cwd: void 0, originalCwd: void 0 } : workdirCwd === null || workdirCwd === void 0 || workdirCwd === context.cwd ? context : { ...context, cwd: workdirCwd };
  if (dryRun) {
    let childCommands = [...normalizeChildCommands(template, executionContext)];
    if ((childCommands.length === 0 ? getParallelDynamicEnvValues(envNames, context.envAssignments, /* @__PURE__ */ new Map).values : childCommands.flatMap((childCommand) => getParallelDynamicEnvValues(envNames, context.envAssignments, childCommand.envAssignments).values)).some(hasExecutableParallelPlaceholder)) {
      let reason = parallelUnsupportedReason(context);
      if (reason)
        return reason;
    }
    return null;
  }
  if (template.length === 0) {
    if (envNames.length > 0 || jobs.some((job) => job.length !== 1)) {
      let reason = parallelUnsupportedReason(context);
      if (reason)
        return reason;
    }
    let commands = jobs.map((job) => job[0] ?? "");
    reserveParallelAnalysis(context.budget, commandsModeWork(commands));
    let nestedOverrides = buildCommandsModeOverrides(executionContext, runsRemotely);
    for (let command2 of commands) {
      let reason = context.analyzeNested(command2, nestedOverrides);
      if (reason)
        return reason;
    }
    return null;
  }
  for (let childCommand of normalizeChildCommands(template, executionContext)) {
    let result = analyzeParallelChildCommand(childCommand, parseResult, context, executionContext);
    if (result)
      return result;
  }
  return null;
}
function analyzeParallelChildCommand(childCommand, parseResult, context, executionContext) {
  let { jobs, templateHasPlaceholder, runsRemotely, usesStdin, envNames } = parseResult, childTokens = childCommand.tokens, dynamicEnvValues = getParallelDynamicEnvValues(envNames, context.envAssignments, childCommand.envAssignments);
  if (dynamicEnvValues.entries.some((entry) => hasUnsupportedParallelPlaceholder(entry.value))) {
    let reason = parallelUnsupportedReason(context);
    if (reason)
      return reason;
  }
  let envHasPlaceholder = dynamicEnvValues.entries.some((entry) => entry.hasPlaceholder), hasPlaceholder = templateHasPlaceholder || envHasPlaceholder, hasDynamicStdinPlaceholder = usesStdin && hasPlaceholder, nestedOverrides = buildNestedOverrides(childCommand.envAssignments, childCommand.wrapperCwd, runsRemotely || hasDynamicStdinPlaceholder);
  if (SHELL_WRAPPERS.has(childCommand.head)) {
    let analyzeExpandedShellArgv = () => {
      if (!templateHasPlaceholder || jobs.length === 0)
        return null;
      reserveParallelAnalysis(context.budget, expandedTokenJobWork(childTokens, jobs, "generic"));
      for (let job of jobs) {
        let result = analyzeChildCommandMatch(childTokens.map((token) => replaceParallelJobPlaceholder(token, job)), {
          ...executionContext,
          cwd: childCommand.cwd,
          envAssignments: childCommand.envAssignments
        });
        if (result)
          return result;
      }
      return null;
    };
    if (isShellSyntaxCheck(childTokens))
      return analyzeExpandedShellArgv();
    let dashCArg = extractDashCArg(childTokens);
    if (dashCArg) {
      if (isOnlyParallelPlaceholder(dashCArg)) {
        let reason2 = parallelShellDynamicReason(context);
        if (reason2)
          return reason2;
        if (jobs.length === 0)
          return null;
        reserveParallelAnalysis(context.budget, expandedStringJobWork(dashCArg, jobs, "generic"));
        for (let job of jobs) {
          let nestedReason = context.analyzeNested(replaceParallelJobPlaceholder(dashCArg, job), nestedOverrides);
          if (nestedReason)
            return nestedReason;
        }
        return null;
      }
      if (hasParallelPlaceholder(dashCArg)) {
        if (jobs.length > 0) {
          reserveParallelAnalysis(context.budget, expandedStringJobWork(dashCArg, jobs, "generic"));
          for (let job of jobs) {
            let expandedScript = replaceParallelJobPlaceholder(dashCArg, job), reason2 = context.analyzeNested(expandedScript, nestedOverrides);
            if (reason2)
              return reason2;
          }
          return null;
        }
        reserveParallelAnalysis(context.budget, staticStringWork(dashCArg));
        let scriptTokens = parseSimpleWords(dashCArg);
        if (scriptTokens?.[0] && normalizeCommandToken(scriptTokens[0]) === "rm" && hasRecursiveForceFlags(scriptTokens)) {
          let reason2 = parallelRmDynamicReason(context);
          if (reason2)
            return reason2;
        }
        let dynamicReason = scriptTokens ? analyzeChildCommandMatch(scriptTokens, {
          ...executionContext,
          cwd: childCommand.cwd,
          envAssignments: childCommand.envAssignments
        }, {
          dynamicInput: usesStdin,
          shellDynamicMatch: destructiveCommandMatch("parallel.shell-dynamic", REASON_PARALLEL_SHELL),
          rmDynamicMatch: destructiveCommandMatch("parallel.rm-recursive-force-dynamic", REASON_PARALLEL_RM)
        }) : null;
        if (dynamicReason)
          return dynamicReason;
        return context.analyzeNested(dashCArg, nestedOverrides);
      }
      let positionalSources = !envHasPlaceholder && (!templateHasPlaceholder || jobs.length > 0) ? (jobs.length > 0 ? jobs : [void 0]).map((job) => extractPositionalShellSource(job === void 0 ? childTokens : templateHasPlaceholder ? childTokens.map((token) => replaceParallelJobPlaceholder(token, job)) : [...childTokens, ...job], void 0, dashCArg)) : [];
      if (positionalSources.some((source) => source.kind === "dynamic")) {
        let reason2 = parallelShellDynamicReason(context);
        if (reason2)
          return reason2;
      }
      let literalPositionalSources = positionalSources.flatMap((source) => source.kind === "literal" ? [source.source] : []);
      if (literalPositionalSources.length > 0) {
        reserveParallelAnalysis(context.budget, commandsModeWork(literalPositionalSources));
        for (let source of literalPositionalSources) {
          let reason2 = context.analyzeNested(source, nestedOverrides);
          if (reason2)
            return reason2;
        }
        return null;
      }
      reserveParallelAnalysis(context.budget, combineParallelWork(staticStringWork(dashCArg), dynamicEnvJobWork(dynamicEnvValues.entries, jobs)));
      let hasUnresolvedDynamicCarrier = shellSourceHasUnresolvedDynamicExecutionCarrier(dashCArg);
      if (hasUnresolvedDynamicCarrier && dynamicEnvValues.entries.length > 0) {
        let envReason = analyzeParallelDynamicEnvValues(dynamicEnvValues, jobs, executionContext, runsRemotely);
        if (envReason)
          return envReason;
      }
      if (hasUnresolvedDynamicCarrier) {
        let dynamicReason = parallelShellDynamicReason(context);
        if (dynamicReason)
          return dynamicReason;
      }
      let reason = context.analyzeNested(dashCArg, nestedOverrides);
      if (reason)
        return reason;
      if (!hasUnresolvedDynamicCarrier) {
        let envReason = analyzeParallelDynamicEnvValues(dynamicEnvValues, jobs, executionContext, runsRemotely);
        if (envReason)
          return envReason;
      }
      if (hasPlaceholder)
        return parallelShellDynamicReason(context);
      return null;
    }
    let scriptSource = extractShellScriptOperandSource(childTokens, void 0);
    if (scriptSource.kind === "dynamic" || scriptSource.kind === "literal" && hasParallelPlaceholder(scriptSource.source))
      return parallelShellDynamicReason(context) ?? analyzeExpandedShellArgv();
    if (scriptSource.kind === "literal")
      return analyzeExpandedShellArgv();
    if (jobs.length > 0) {
      let reason = parallelShellDynamicReason(context);
      if (reason)
        return reason;
      let expandedArgvReason = analyzeExpandedShellArgv();
      if (expandedArgvReason)
        return expandedArgvReason;
      if (templateHasPlaceholder)
        return null;
      let sources = jobs.flatMap((job) => job[0] === void 0 ? [] : [job[0]]);
      reserveParallelAnalysis(context.budget, commandsModeWork(sources));
      for (let source of sources) {
        let nestedReason = context.analyzeNested(source, nestedOverrides);
        if (nestedReason)
          return nestedReason;
      }
      return null;
    }
    if (hasPlaceholder || usesStdin)
      return parallelShellDynamicReason(context) ?? analyzeExpandedShellArgv();
    return null;
  }
  if (childCommand.head === "rm" && hasRecursiveForceFlags(childTokens)) {
    if (templateHasPlaceholder && jobs.length > 0) {
      reserveParallelAnalysis(context.budget, expandedTokenJobWork(childTokens, jobs, "rm"));
      for (let job of jobs) {
        let result = analyzeParallelRmExpansion(childTokens.map((token) => replaceParallelRmJobPlaceholder(token, job)), childCommand.cwd, executionContext);
        if (result)
          return result;
      }
      return null;
    }
    if (jobs.length > 0) {
      reserveParallelAnalysis(context.budget, appendedTokenJobWork(childTokens, jobs));
      for (let job of jobs) {
        let result = analyzeParallelRmExpansion([...childTokens, ...job], childCommand.cwd, executionContext);
        if (result)
          return result;
      }
      return null;
    }
    let staticResult = analyzeParallelRmExpansion(childTokens.flatMap((token, index) => {
      if (index === 0 || !hasParallelPlaceholder(token))
        return [token];
      return token.startsWith("-") ? [replaceParallelRmJobPlaceholder(token, [""])] : [];
    }), childCommand.cwd, executionContext);
    if (staticResult)
      return staticResult;
    return parallelRmDynamicReason(context);
  }
  reserveParallelAnalysis(context.budget, templateHasPlaceholder && jobs.length > 0 ? expandedTokenJobWork(childTokens, jobs, "generic") : jobs.length > 0 ? appendedTokenJobWork(childTokens, jobs) : staticTokenWork(childTokens));
  let childJobs = jobs.length > 0 ? jobs : [void 0];
  for (let job of childJobs) {
    let tokens = job === void 0 ? childTokens : templateHasPlaceholder ? childTokens.map((token) => replaceParallelJobPlaceholder(token, job)) : [...childTokens, ...job], shellDynamicMatch = destructiveCommandMatch("parallel.shell-dynamic", REASON_PARALLEL_SHELL), findDynamicInput = usesStdin && childCommand.head === "find" ? analyzeDynamicParallelFind(tokens, executionContext) : null, dynamicCustomResult = matchDynamicParallelPolicyRule(tokens, usesStdin, context.policy?.rules ?? [], context.budget) ?? findDynamicInput?.customResult ?? null, dynamicInput = parallelDynamicInputAnalysis(tokens, childCommand.head, usesStdin, findDynamicInput), result = analyzeChildCommandMatch(tokens, {
      ...executionContext,
      cwd: childCommand.cwd,
      envAssignments: childCommand.envAssignments,
      worktreeMode: runsRemotely || usesStdin || hasPlaceholder ? !1 : context.worktreeMode
    }, {
      dynamicInput: usesStdin || hasPlaceholder,
      dynamicRmInput: dynamicInput.rmOptions,
      dynamicSourceInput: dynamicCustomResult !== null || dynamicInput.executedSource || dynamicInput.rmOptions,
      shellDynamicMatch,
      dynamicSourceMatch: shellDynamicMatch,
      rmDynamicMatch: destructiveCommandMatch("parallel.rm-recursive-force-dynamic", REASON_PARALLEL_RM)
    });
    if (dynamicInput.executedSource) {
      let parallelDynamic = filterDestructiveCommandMatch(shellDynamicMatch, context.policy);
      if (parallelDynamic)
        return parallelDynamic;
    }
    if (result)
      return result;
    if (dynamicCustomResult)
      return dynamicCustomResult;
    let customResult = checkPolicyRuleMatch(tokens, context.policy?.rules ?? []);
    if (customResult)
      return customResult;
  }
  return null;
}
function parallelDynamicInputAnalysis(tokens, childHead, usesStdin, findAnalysis) {
  if (!usesStdin)
    return { executedSource: !1, rmOptions: !1 };
  let normalizedHead = normalizeCommandToken(childHead), rmOptions = normalizedHead === "rm" && parallelInputCanChangeRmOptions(tokens) || normalizedHead === "xargs" && nestedRmInputCanChangeOptions(tokens) || findAnalysis?.rmOptions === !0;
  return {
    executedSource: rmOptions || findAnalysis?.executedSource === !0 || findAnalysis === null && parallelInputCanChangeExecutedSource(tokens, normalizedHead),
    rmOptions
  };
}
function parallelInputCanChangeExecutedSource(tokens, childHead) {
  if (hasParallelPlaceholder(tokens[0] ?? ""))
    return !0;
  if (childHead === "eval" || childHead === "source" || childHead === ".")
    return !0;
  if (childHead === "parallel" || childHead === "xargs")
    return !0;
  if (SHELL_WRAPPERS.has(childHead))
    return shellArgvHasParallelSource(tokens);
  if (childHead === "git")
    return gitInputCanChangeProtectedOperation(tokens);
  if (childHead === "find")
    return !0;
  if (AWK_INTERPRETERS.has(childHead))
    return awkInputCanChangeExecutedSource(tokens);
  if (isInterpreterCommand(childHead))
    return interpreterInputCanChangeExecutedSource(tokens);
  return !1;
}
function parallelInputCanChangeRmOptions(tokens) {
  let optionTerminator = tokens.indexOf("--"), optionTokens = tokens.slice(1, optionTerminator === -1 ? void 0 : optionTerminator);
  if (!tokens.some(hasParallelPlaceholder))
    return optionTerminator === -1;
  return optionTokens.some((token) => hasParallelPlaceholder(token) && (token.startsWith("-") || isOnlyParallelPlaceholder(token)));
}
function gitInputCanChangeProtectedOperation(tokens) {
  if (gitGlobalConfigCanChange(tokens))
    return !0;
  let parsed = extractGitSubcommandAndRest(tokens);
  if (parsed.subcommand === null || hasParallelPlaceholder(parsed.subcommand))
    return !0;
  if (!PROTECTED_GIT_SUBCOMMANDS2.has(parsed.subcommand.toLowerCase()))
    return !1;
  let optionTerminator = parsed.rest.indexOf("--"), structuralTokens = parsed.rest.slice(0, optionTerminator === -1 ? void 0 : optionTerminator);
  if (!tokens.some(hasParallelPlaceholder))
    return optionTerminator === -1;
  return structuralTokens.some(hasParallelPlaceholder);
}
function gitGlobalConfigCanChange(tokens) {
  for (let index = 1;index < tokens.length; index++) {
    let token = tokens[index];
    if (!token || token === "--" || !token.startsWith("-"))
      return !1;
    if (token === "-c" || token === "--config-env") {
      if (hasParallelPlaceholder(tokens[index + 1] ?? ""))
        return !0;
      index++;
      continue;
    }
    if (token.startsWith("-c") && token.length > 2 || token.startsWith("--config-env=")) {
      if (hasParallelPlaceholder(token))
        return !0;
      continue;
    }
    if (hasParallelPlaceholder(token))
      return !0;
  }
  return !1;
}
function shellArgvHasParallelSource(tokens) {
  if (isShellSyntaxCheck(tokens))
    return !1;
  let dashCArg = extractDashCArg(tokens);
  if (dashCArg !== null)
    return hasParallelPlaceholder(dashCArg);
  let scriptSource = extractShellScriptOperandSource(tokens, void 0);
  if (scriptSource.kind === "literal")
    return hasParallelPlaceholder(scriptSource.source);
  if (scriptSource.kind === "dynamic")
    return !0;
  return !tokens.some(hasParallelPlaceholder);
}
function awkInputCanChangeExecutedSource(tokens) {
  let sources = extractAwkExecutableSources(tokens);
  if (sources.some((source) => hasParallelPlaceholder(source.value)))
    return !0;
  if (!tokens.some(hasParallelPlaceholder))
    return extractAwkExecutableSources([...tokens, PARALLEL_APPENDED_SOURCE]).some((source) => source.value === PARALLEL_APPENDED_SOURCE);
  return inputCanCreateExecutableSource(tokens, sources, AWK_SOURCE_OPTION_INPUTS, extractAwkExecutableSources);
}
function interpreterInputCanChangeExecutedSource(tokens) {
  let sources = extractInterpreterExecutableSources(tokens);
  if (sources.some((source) => hasParallelPlaceholder(source.value)))
    return !0;
  if (!tokens.some(hasParallelPlaceholder))
    return extractInterpreterExecutableSources([...tokens, PARALLEL_APPENDED_SOURCE]).some((source) => source.value === PARALLEL_APPENDED_SOURCE);
  return inputCanCreateExecutableSource(tokens, sources, INTERPRETER_SOURCE_OPTION_INPUTS, extractInterpreterExecutableSources);
}
function inputCanCreateExecutableSource(tokens, existingSources, candidates, extractSources) {
  let existing = new Set(existingSources.map((source) => `${source.tokenIndex}\x00${source.kind}\x00${source.value}`));
  return candidates.some((candidate) => extractSources(tokens.map((token) => replaceParallelJobPlaceholder(token, [candidate]))).some((source) => !existing.has(`${source.tokenIndex}\x00${source.kind}\x00${source.value}`)));
}
function matchDynamicParallelPolicyRule(tokens, usesStdin, rules, budget) {
  if (!usesStdin || rules.length === 0)
    return null;
  let relevantRules = rules.filter((rule) => normalizeCommandToken(rule.command) === normalizeCommandToken(tokens[0] ?? ""));
  if (relevantRules.length === 0)
    return null;
  let hasPlaceholder = tokens.some(hasParallelPlaceholder);
  if (reserveParallelAnalysis(budget, dynamicCustomRuleWork(tokens, relevantRules, hasPlaceholder)), !hasPlaceholder) {
    for (let rule of relevantRules) {
      let result = checkPolicyRuleMatch([...tokens, ...rule.subcommand ? [rule.subcommand] : [], ...rule.block_args], [rule]);
      if (result)
        return result;
    }
    return null;
  }
  for (let rule of relevantRules) {
    let inputCandidates = new Set([rule.subcommand, ...rule.block_args].flatMap((target) => target ? parallelInputsThatProduce(tokens, target) : []));
    for (let input of inputCandidates) {
      let result = checkPolicyRuleMatch(tokens.map((token) => replaceParallelJobPlaceholder(token, [input])), [rule]);
      if (result)
        return result;
    }
  }
  return null;
}
function dynamicCustomRuleWork(tokens, rules, hasPlaceholder) {
  let candidateCount = hasPlaceholder ? limitedMultiply(limitedAdd(rules.map((rule) => rule.block_args.length + (rule.subcommand ? 1 : 0)), PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses), 2 * Math.max(tokens.length, 1), PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses) : rules.length;
  return {
    childAnalyses: candidateCount,
    derivedTokens: limitedMultiply(candidateCount, tokens.length, PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens)
  };
}
function parallelInputsThatProduce(tokens, target) {
  return tokens.flatMap((token) => {
    let matches = [...token.matchAll(/\{[^{}\s]*\}/g)];
    if (matches.length !== 1)
      return [];
    let match = matches[0];
    if (!match || match.index === void 0)
      return [];
    let prefix = token.slice(0, match.index), suffix = token.slice(match.index + match[0].length);
    if (!target.startsWith(prefix) || !target.endsWith(suffix))
      return [target];
    let input = target.slice(prefix.length, target.length - suffix.length);
    return input !== target ? [target, input] : [target];
  });
}
function analyzeDynamicParallelFind(tokens, context) {
  let analysis = {
    customResult: null,
    executedSource: !tokens.some(hasParallelPlaceholder),
    rmOptions: !1
  }, inExpression = !1, expressionDataArgs = 0, execTokens = null, analyzeExec = () => {
    if (!execTokens?.some(hasParallelPlaceholder))
      return;
    for (let childCommand of normalizeChildCommands(execTokens, context))
      analysis.executedSource ||= parallelInputCanChangeExecutedSource(childCommand.tokens, childCommand.head), analysis.rmOptions ||= childCommand.head === "rm" && parallelInputCanChangeRmOptions(childCommand.tokens) || childCommand.head === "xargs" && nestedRmInputCanChangeOptions(childCommand.tokens), analysis.customResult ??= matchDynamicParallelPolicyRule(childCommand.tokens, !0, context.policy?.rules ?? [], context.budget);
  };
  for (let token of tokens.slice(1)) {
    if (!inExpression && !token.startsWith("-") && token !== "!" && token !== "(") {
      analysis.executedSource ||= hasParallelPlaceholder(token);
      continue;
    }
    if (inExpression = !0, execTokens) {
      if (token === ";" || token === "+") {
        analyzeExec(), execTokens = null;
        continue;
      }
      execTokens.push(token);
      continue;
    }
    if (expressionDataArgs > 0) {
      expressionDataArgs--;
      continue;
    }
    if (isFindExecPrimary(token)) {
      execTokens = [], analysis.executedSource ||= hasParallelPlaceholder(token);
      continue;
    }
    let arity = getFindPrimaryArity(token);
    if (arity > 0) {
      expressionDataArgs = arity, analysis.executedSource ||= hasParallelPlaceholder(token);
      continue;
    }
    analysis.executedSource ||= hasParallelPlaceholder(token);
  }
  return analyzeExec(), analysis;
}
function nestedRmInputCanChangeOptions(tokens) {
  let childTokens = extractXargsChildCommandWithInfo(tokens).childTokens;
  return normalizeCommandToken(childTokens[0] ?? "") === "rm" && parallelInputCanChangeRmOptions(childTokens);
}
function parallelShellDynamicReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.shell-dynamic", REASON_PARALLEL_SHELL), context.policy);
}
function parallelCommandStreamDynamicReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.command-stream-dynamic", REASON_PARALLEL_COMMAND_STREAM), context.policy);
}
function parallelUnsupportedReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.command-stream-dynamic", REASON_PARALLEL_UNSUPPORTED), context.policy);
}
function parallelRmDynamicReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.rm-recursive-force-dynamic", REASON_PARALLEL_RM), context.policy);
}
function analyzeParallelRmExpansion(tokens, cwd, context) {
  return filterDestructiveCommandMatch(analyzeRmMatch(tokens, {
    cwd,
    originalCwd: context.originalCwd,
    strict: context.strict,
    paranoid: context.paranoidRm,
    allowTmpdirVar: context.allowTmpdirVar,
    tmpdirVarExpandsEmpty: isTmpdirKnownEmpty(context.envAssignments ?? /* @__PURE__ */ new Map),
    tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(context.envAssignments ?? /* @__PURE__ */ new Map),
    trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments ?? /* @__PURE__ */ new Map),
    policy: context.policy
  }), context.policy);
}
function commandsModeWork(args) {
  return {
    childAnalyses: args.length,
    derivedTokens: args.length,
    derivedBytes: sumUtf8Bytes(args)
  };
}
function staticStringWork(value) {
  return {
    childAnalyses: 1,
    derivedTokens: 1,
    derivedBytes: limitedValue(utf8ByteLength(value), PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes)
  };
}
function staticTokenWork(tokens) {
  return {
    childAnalyses: 1,
    derivedTokens: tokens.length,
    derivedBytes: sumUtf8Bytes(tokens)
  };
}
function appendedTokenJobWork(tokens, jobs) {
  if (jobs.length > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses)
    return { childAnalyses: jobs.length };
  return {
    childAnalyses: jobs.length,
    derivedTokens: limitedAdd(jobs.map((job) => tokens.length + job.length), PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens),
    derivedBytes: limitedAdd([
      limitedMultiply(sumUtf8Bytes(tokens), jobs.length, PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes),
      limitedAdd(jobs.map((job) => sumUtf8Bytes(job)), PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes)
    ], PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes)
  };
}
function expandedStringJobWork(value, jobs, placeholderKind) {
  if (jobs.length > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses)
    return { childAnalyses: jobs.length };
  let stats = getReplacementStats(value, placeholderKind), placeholderReplacements = limitedMultiply(stats.occurrences, jobs.length, PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements);
  if (placeholderReplacements > PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements)
    return { childAnalyses: jobs.length, placeholderReplacements };
  if (expandedJobBytesExceedLimit(stats, jobs, placeholderReplacements))
    return {
      childAnalyses: jobs.length,
      derivedTokens: jobs.length,
      derivedBytes: PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 1,
      placeholderReplacements
    };
  let derivedBytes = 0;
  for (let job of jobs)
    if (derivedBytes = limitedAdd([derivedBytes, utf8ByteLength(replaceParallelJobPlaceholder(value, job))], PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes), derivedBytes > PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes)
      break;
  return {
    childAnalyses: jobs.length,
    derivedTokens: jobs.length,
    derivedBytes,
    placeholderReplacements
  };
}
function expandedTokenJobWork(tokens, jobs, placeholderKind) {
  if (jobs.length > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses)
    return { childAnalyses: jobs.length };
  let derivedTokens = limitedMultiply(tokens.length, jobs.length, PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens);
  if (derivedTokens > PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens)
    return { childAnalyses: jobs.length, derivedTokens };
  let stats = combineReplacementStats(tokens.map((token) => getReplacementStats(token, placeholderKind))), placeholderReplacements = limitedMultiply(stats.occurrences, jobs.length, PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements);
  if (placeholderReplacements > PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements)
    return { childAnalyses: jobs.length, derivedTokens, placeholderReplacements };
  if (expandedJobBytesExceedLimit(stats, jobs, placeholderReplacements))
    return {
      childAnalyses: jobs.length,
      derivedTokens,
      derivedBytes: PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 1,
      placeholderReplacements
    };
  let derivedBytes = 0;
  outer:
    for (let job of jobs)
      for (let token of tokens)
        if (derivedBytes = limitedAdd([
          derivedBytes,
          utf8ByteLength(placeholderKind === "generic" ? replaceParallelJobPlaceholder(token, job) : replaceParallelRmJobPlaceholder(token, job))
        ], PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes), derivedBytes > PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes)
          break outer;
  return {
    childAnalyses: jobs.length,
    derivedTokens,
    derivedBytes,
    placeholderReplacements
  };
}
function expandedJobBytesExceedLimit(stats, jobs, placeholderReplacements) {
  let byteCeiling = PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 4 * placeholderReplacements;
  return limitedAdd([
    limitedMultiply(stats.fixedBytes, jobs.length, byteCeiling),
    limitedMultiply(stats.occurrences, limitedAdd(jobs.map((job) => job.reduce((largest, arg) => Math.max(largest, utf8ByteLength(arg)), 0)), byteCeiling), byteCeiling)
  ], byteCeiling) > byteCeiling;
}
function dynamicEnvJobWork(entries, jobs) {
  let dynamicEntries = entries.filter((entry) => entry.hasPlaceholder), dynamicValueCount = limitedAdd(dynamicEntries.map((entry) => entry.frequency), PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses), childAnalyses = limitedMultiply(dynamicValueCount, Math.max(jobs.length, 1), PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses), derivedTokens = limitedMultiply(dynamicValueCount, Math.max(jobs.length, 1), PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens);
  if (childAnalyses > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses || derivedTokens > PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens)
    return { childAnalyses, derivedTokens };
  if (jobs.length === 0)
    return {
      childAnalyses,
      derivedTokens,
      derivedBytes: limitedAdd(dynamicEntries.map((entry) => limitedMultiply(utf8ByteLength(entry.value), entry.frequency, PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes)), PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes)
    };
  let stats = combineReplacementStats(dynamicEntries.map((entry) => scaleReplacementStats(getReplacementStats(entry.value, "generic"), entry.frequency))), placeholderReplacements = limitedMultiply(stats.occurrences, Math.max(jobs.length, 1), PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements);
  if (placeholderReplacements > PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements)
    return { childAnalyses, placeholderReplacements };
  if (expandedJobBytesExceedLimit(stats, jobs, placeholderReplacements))
    return {
      childAnalyses,
      derivedTokens,
      derivedBytes: PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes + 1,
      placeholderReplacements
    };
  let derivedBytes = 0;
  outer:
    for (let entry of dynamicEntries)
      for (let index = 0;index < entry.frequency; index++) {
        let valueJobs = jobs.length > 0 ? jobs : [void 0];
        for (let job of valueJobs)
          if (derivedBytes = limitedAdd([
            derivedBytes,
            utf8ByteLength(job === void 0 ? entry.value : replaceParallelJobPlaceholder(entry.value, job))
          ], PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes), derivedBytes > PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes)
            break outer;
      }
  return {
    childAnalyses,
    derivedTokens,
    derivedBytes,
    placeholderReplacements
  };
}
function combineParallelWork(first, second) {
  return {
    childAnalyses: limitedAdd([first.childAnalyses ?? 0, second.childAnalyses ?? 0], PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses),
    derivedTokens: limitedAdd([first.derivedTokens ?? 0, second.derivedTokens ?? 0], PARALLEL_ANALYSIS_LIMITS.maxDerivedTokens),
    derivedBytes: limitedAdd([first.derivedBytes ?? 0, second.derivedBytes ?? 0], PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes),
    placeholderReplacements: limitedAdd([first.placeholderReplacements ?? 0, second.placeholderReplacements ?? 0], PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements)
  };
}
function getReplacementStats(value, placeholderKind) {
  let matches = placeholderKind === "generic" ? value.matchAll(/\{[^{}\s]*\}/g) : value.matchAll(PARALLEL_RM_PLACEHOLDER_RE), parts = [], lastIndex = 0;
  for (let match of matches) {
    if (parts.length >= PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements)
      return {
        occurrences: PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements + 1,
        fixedBytes: 0
      };
    parts.push(value.slice(lastIndex, match.index)), lastIndex = match.index + match[0].length;
  }
  return parts.push(value.slice(lastIndex)), {
    occurrences: parts.length - 1,
    fixedBytes: parts.length === 1 ? utf8ByteLength(value) : limitedAdd(parts.map(utf8ByteLength), MAX_EXPANDED_BYTE_OVERCOUNT)
  };
}
function scaleReplacementStats(stats, frequency) {
  return {
    occurrences: limitedMultiply(stats.occurrences, frequency, PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements),
    fixedBytes: limitedMultiply(stats.fixedBytes, frequency, MAX_EXPANDED_BYTE_OVERCOUNT)
  };
}
function combineReplacementStats(stats) {
  return {
    occurrences: limitedAdd(stats.map((value) => value.occurrences), PARALLEL_ANALYSIS_LIMITS.maxPlaceholderReplacements),
    fixedBytes: limitedAdd(stats.map((value) => value.fixedBytes), MAX_EXPANDED_BYTE_OVERCOUNT)
  };
}
function sumUtf8Bytes(values, limit = PARALLEL_ANALYSIS_LIMITS.maxDerivedBytes) {
  return limitedAdd(values.map(utf8ByteLength), limit);
}
function utf8ByteLength(value) {
  return UTF8_ENCODER2.encode(value).byteLength;
}
function limitedAdd(values, limit) {
  let total = 0;
  for (let value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || value > limit - total)
      return limit + 1;
    total += value;
  }
  return total;
}
function limitedMultiply(left, right, limit) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0 || left !== 0 && right > Math.floor(limit / left))
    return limit + 1;
  return left * right;
}
function limitedValue(value, limit) {
  return Number.isSafeInteger(value) && value >= 0 && value <= limit ? value : limit + 1;
}
function getParallelDynamicEnvValues(envNames, contextEnvAssignments, childEnvAssignments) {
  let values = [];
  for (let name of envNames) {
    let value = childEnvAssignments.get(name) ?? contextEnvAssignments?.get(name);
    if (value !== void 0)
      values.push(value);
  }
  return values.push(...childEnvAssignments.values()), prepareDynamicEnvValues(values);
}
function prepareDynamicEnvValues(values) {
  let frequencies = /* @__PURE__ */ new Map;
  for (let value of values)
    frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  let entries = [...frequencies].map(([value, frequency]) => ({
    value,
    frequency,
    hasPlaceholder: hasParallelPlaceholder(value)
  }));
  return {
    values,
    entries,
    byValue: new Map(entries.map((entry) => [entry.value, entry]))
  };
}
function analyzeParallelDynamicEnvValues(values, jobs, context, runsRemotely) {
  for (let value of values.values) {
    if (!values.byValue.get(value)?.hasPlaceholder)
      continue;
    let valueJobs = jobs.length > 0 ? jobs : [void 0];
    for (let job of valueJobs) {
      let command2 = job === void 0 ? value : replaceParallelJobPlaceholder(value, job), reason = context.analyzeNested(command2, {
        envAssignments: context.envAssignments,
        effectiveCwd: runsRemotely ? null : context.cwd
      });
      if (reason)
        return reason;
    }
  }
  return null;
}
function buildNestedOverrides(envAssignments, cwd, runsRemotely) {
  let overrides = { envAssignments };
  if (runsRemotely)
    return overrides.effectiveCwd = null, overrides.worktreeMode = !1, overrides;
  if (cwd !== void 0)
    overrides.effectiveCwd = cwd;
  return overrides;
}
function buildCommandsModeOverrides(context, runsRemotely) {
  let overrides = {};
  if (context.envAssignments)
    overrides.envAssignments = context.envAssignments;
  if (runsRemotely)
    overrides.effectiveCwd = null, overrides.worktreeMode = !1;
  if (!runsRemotely && context.cwd !== void 0)
    overrides.effectiveCwd = context.cwd;
  return Object.keys(overrides).length > 0 ? overrides : void 0;
}
function replaceParallelJobPlaceholder(token, job) {
  return token.replace(/\{[^{}\s]*\}/g, (placeholder) => getParallelPlaceholderValue(placeholder, job));
}
function replaceParallelRmJobPlaceholder(token, job) {
  return token.replace(PARALLEL_RM_PLACEHOLDER_RE, (placeholder) => getParallelPlaceholderValue(placeholder, job));
}
function getParallelPlaceholderValue(placeholder, job) {
  let position = /^\{(-?\d+)[^{}\s]*\}$/.exec(placeholder)?.[1];
  if (position === void 0)
    return job[0] ?? "";
  let parsed = Number(position), index = parsed > 0 ? parsed - 1 : job.length + parsed;
  return job[index] ?? "";
}
function hasParallelPlaceholder(token) {
  return PARALLEL_PLACEHOLDER_RE.test(token);
}
function hasUnsupportedParallelPlaceholder(token) {
  if (hasExecutableParallelPlaceholder(token))
    return !0;
  for (let match of token.matchAll(/\{[^{}\s]*\}/g))
    if (!/^(?:\{\}|\{-?\d+\})$/.test(match[0]))
      return !0;
  return !1;
}
function hasExecutableParallelPlaceholder(token) {
  let perlStart = token.indexOf("{=");
  return perlStart !== -1 && token.indexOf("=}", perlStart + 2) !== -1;
}
function isOnlyParallelPlaceholder(token) {
  return /^\{[^{}\s]*\}$/.test(token);
}
function parseParallelCommand(tokens) {
  let parallelOptsWithValue = /* @__PURE__ */ new Set([
    "-L",
    "-d",
    "-n",
    "--delay",
    "--delimiter",
    "--header",
    "--joblog",
    "--jl",
    "--max-args",
    "--max-lines",
    "--nice",
    "--results",
    "--result",
    "--res",
    "--tagstring",
    "--timeout"
  ]), i = 1, templateTokens = [], childCommandTokens = [], markerIndex = -1, runsRemotely = !1, usesPipe = !1, dryRun = !1, workdir, unsupported = tokens.some((token) => token === "::::" || token === "::::+" || token === ":::+"), envNames = [];
  while (i < tokens.length) {
    let token = tokens[i];
    if (token === void 0)
      break;
    if (token === ":::") {
      markerIndex = i;
      break;
    }
    if (token === "--") {
      let template = collectCommandTemplate(tokens, i + 1);
      templateTokens.push(...template.templateTokens), childCommandTokens = [...tokens.slice(i + 1)], markerIndex = template.markerIndex;
      break;
    }
    if (token.startsWith("-")) {
      if (token === "--dry-run") {
        dryRun = !0, i++;
        continue;
      }
      if (token === "-I") {
        unsupported ||= tokens[i + 1] !== "{}", i += 2;
        continue;
      }
      if (token.startsWith("-I") && token.length > 2) {
        unsupported ||= token.slice(2) !== "{}", i++;
        continue;
      }
      if (token === "--replace" || token === "-i") {
        unsupported = !0, i += 2;
        continue;
      }
      if (token.startsWith("--replace=") || token.startsWith("-i") && token.length > 2) {
        let replacement = token.startsWith("--replace=") ? token.slice(10) : token.slice(2);
        unsupported ||= replacement !== "" && replacement !== "{}", i++;
        continue;
      }
      if (token === "-a" || token === "--arg-file" || token === "--colsep" || token === "--rpl" || token === "--arg-sep" || token === "--arg-file-sep") {
        unsupported = !0, i += 2;
        continue;
      }
      if (token.startsWith("--arg-file=") || token.startsWith("--colsep=") || token.startsWith("--rpl=") || token.startsWith("--arg-sep=") || token.startsWith("--arg-file-sep=")) {
        unsupported = !0, i++;
        continue;
      }
      if (token === "--pipe" || token === "--pipepart") {
        usesPipe = !0, i++;
        continue;
      }
      if (token === "--env") {
        envNames.push(...splitParallelEnvNames(tokens[i + 1])), i += 2;
        continue;
      }
      if (token.startsWith("--env=")) {
        envNames.push(...splitParallelEnvNames(token.slice(6))), i++;
        continue;
      }
      if (token === "-S" || token === "--sshlogin" || token === "--slf" || token === "--sshloginfile") {
        runsRemotely = !0, i += 2;
        continue;
      }
      if (token.startsWith("-S") && token.length > 2) {
        runsRemotely = !0, i++;
        continue;
      }
      if (token === "--workdir" || token === "--wd") {
        let value = tokens[i + 1];
        if (value === void 0 || value === ":::" || value === "--") {
          unsupported = !0, i++;
          continue;
        }
        workdir = value, i += 2;
        continue;
      }
      if (token.startsWith("--workdir=") || token.startsWith("--wd=")) {
        let value = token.slice(token.indexOf("=") + 1);
        unsupported ||= value === "", workdir = value, i++;
        continue;
      }
      if (token.startsWith("--sshlogin=") || token.startsWith("--slf=") || token.startsWith("--sshloginfile=")) {
        runsRemotely = !0, i++;
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
        if (tokens[i + 1] === void 0 || tokens[i + 1] === ":::" || tokens[i + 1] === "--") {
          unsupported = !0, i++;
          continue;
        }
        i += 2;
        continue;
      }
      if (token === "-j" || token === "--jobs") {
        i += 2;
        continue;
      }
      i++;
    } else {
      let template = collectCommandTemplate(tokens, i);
      templateTokens.push(...template.templateTokens), childCommandTokens = [...tokens.slice(i)], markerIndex = template.markerIndex;
      break;
    }
  }
  unsupported ||= templateTokens.some(dryRun ? hasExecutableParallelPlaceholder : hasUnsupportedParallelPlaceholder);
  let argumentGroups = [];
  if (markerIndex !== -1) {
    let group = [];
    for (let j = markerIndex + 1;j < tokens.length; j++) {
      let token = tokens[j];
      if (token === ":::") {
        argumentGroups.push(group), group = [];
        continue;
      }
      if (token !== void 0)
        group.push(token);
    }
    argumentGroups.push(group);
  }
  let jobs = expandParallelJobs(argumentGroups), templateHasPlaceholder = templateTokens.some(hasParallelPlaceholder);
  if (templateTokens.length === 0 && markerIndex === -1)
    return {
      template: [],
      jobs: [],
      childCommandTokens: [],
      templateHasPlaceholder: !1,
      runsRemotely,
      usesStdin: !0,
      envNames,
      readsCommandsFromInput: !0,
      unsupported,
      workdir,
      dryRun
    };
  return {
    template: templateTokens,
    jobs,
    childCommandTokens,
    templateHasPlaceholder,
    runsRemotely,
    usesStdin: usesPipe || markerIndex === -1,
    envNames,
    readsCommandsFromInput: !1,
    unsupported,
    workdir,
    dryRun
  };
}
function resolveParallelWorkdir(workdir, cwd) {
  if (workdir === void 0)
    return;
  if (workdir === "..." || /[{}$`*?~[]/.test(workdir))
    return null;
  if (!cwd && !isAbsolute12(workdir))
    return null;
  try {
    return resolveChdirTarget(cwd ?? workdir, workdir);
  } catch {
    return null;
  }
}
function expandParallelJobs(argumentGroups) {
  if (argumentGroups.length === 0 || argumentGroups.some((group) => group.length === 0))
    return [];
  let jobs = [[]];
  for (let group of argumentGroups) {
    if (group.length === 1) {
      let arg = group[0];
      if (arg === void 0)
        return [];
      for (let job of jobs)
        job.push(arg);
      continue;
    }
    let expanded = [];
    for (let job of jobs)
      for (let arg of group)
        if (expanded.push([...job, arg]), expanded.length > PARALLEL_ANALYSIS_LIMITS.maxChildAnalyses)
          return expanded;
    jobs = expanded;
  }
  return jobs;
}
function splitParallelEnvNames(value) {
  return (value ?? "").split(",").map((name) => name.trim()).filter(Boolean);
}
function extractParallelChildCommand(tokens) {
  return parseParallelCommand(tokens)?.childCommandTokens ?? [];
}

// src/core/analyze/segment.ts
var REASON_DYNAMIC_EXECUTABLE = "dynamic command name contains shell substitution output and cannot be verified safely. Use a literal executable name.", REASON_DYNAMIC_STRUCTURE = "shell substitution output can change guarded command structure and cannot be verified safely. Use literal subcommands and options.", REASON_DYNAMIC_SHELL_SOURCE = "shell execution source cannot be verified safely. Use a literal command string or ask the user to run it manually.", DELETE_TARGET_BRACE_EXPANSION_LIMIT = 64, DELETE_TARGET_BRACE_EXPANDED_LENGTH_LIMIT = 16384, STRUCTURAL_GIT_SUBCOMMANDS = /* @__PURE__ */ new Set([
  "branch",
  "checkout",
  "clean",
  "merge",
  "push",
  "rebase",
  "reflog",
  "reset",
  "restore",
  "stash",
  "switch",
  "tag",
  "worktree"
]), COMMAND_ANALYZERS = /* @__PURE__ */ new Map([
  ["git", analyzeGitCommand],
  ["rm", analyzeRmCommand],
  ["find", analyzeFindCommand],
  ["xargs", analyzeXargsCommand],
  ["parallel", analyzeParallelCommand]
]);
function deriveCwdContext(options2) {
  let cwdUnknown = options2.effectiveCwd === null, cwdForRm = cwdUnknown ? void 0 : options2.effectiveCwd ?? options2.cwd, originalCwd = cwdUnknown ? void 0 : options2.cwd;
  return { cwdUnknown, cwdForRm, originalCwd };
}
function analyzeSegment(tokens, depth, options2) {
  let trace = options2.trace;
  if (options2.compatibility === "explain-legacy" && depth >= MAX_RECURSION_DEPTH)
    return trace?.recordSegment({ type: "error", message: REASON_RECURSION_LIMIT }), { reason: REASON_RECURSION_LIMIT, intent: "stop_and_explain" };
  if (tokens.length === 0)
    return null;
  let { cwdForRm: baseCwdForRm, originalCwd } = deriveCwdContext(options2), { tokens: strippedEnv, envAssignments: leadingEnvAssignments } = stripEnvAssignmentsWithInfo(tokens);
  if (leadingEnvAssignments.size > 0)
    trace?.recordSegment({
      type: "env-strip",
      input: tokens,
      envVars: Object.fromEntries([...leadingEnvAssignments.keys()].map((key) => [key, "<redacted>"])),
      output: strippedEnv
    });
  let {
    tokens: stripped,
    envAssignments: wrapperEnvAssignments,
    cwd: wrapperCwd,
    unverifiableEnvSplit
  } = stripWrappersWithInfo(strippedEnv, baseCwdForRm, new Map([...options2.envAssignments ?? [], ...leadingEnvAssignments]));
  if (unverifiableEnvSplit)
    throw new EnvSplitStringExpansionError;
  let normalizedCommandView = normalizeWrappedCommandView(options2.commandView, tokens.length - strippedEnv.length, strippedEnv.length - stripped.length), normalizedOptions = {
    ...options2,
    commandView: normalizedCommandView,
    wrapperNormalizationBudget: options2.wrapperNormalizationBudget ?? { iterations: 0 }
  };
  if (trace && strippedEnv.length > stripped.length) {
    let removed = strippedEnv.slice(0, strippedEnv.length - stripped.length);
    trace?.recordSegment({
      type: "leading-tokens-stripped",
      input: strippedEnv,
      removed,
      output: stripped
    });
  }
  let envAssignments = new Map(options2.envAssignments ?? []);
  for (let [k, v] of leadingEnvAssignments)
    envAssignments.set(k, v);
  for (let [k, v] of wrapperEnvAssignments)
    envAssignments.set(k, v);
  if (stripped.length === 0)
    return null;
  let head = stripped[0];
  if (!head)
    return null;
  if (options2.invalidReason)
    return { reason: options2.invalidReason, intent: "stop_and_explain" };
  if (isStandardCommandWrapper(head))
    throw new DerivedCommandWorkLimitError;
  let normalizedHead = normalizeCommandToken(head), basename3 = getBasename(head), cwdForRm = wrapperCwd === null ? void 0 : wrapperCwd ?? baseCwdForRm, originalCwdForRm = wrapperCwd === null ? void 0 : originalCwd, nestedEffectiveCwd = wrapperCwd === void 0 ? options2.effectiveCwd : wrapperCwd, allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments), dynamicCommandMatch = analyzeDynamicCommandStructure(normalizedCommandView, options2.strict, options2.policy);
  if (dynamicCommandMatch)
    return trace?.recordSegment({
      type: "rule-check",
      ruleModule: "analyze/segment.ts",
      ruleFunction: "analyzeDynamicCommandStructure",
      matched: !0,
      reason: dynamicCommandMatch.reason
    }), blockResultFromMatch(dynamicCommandMatch);
  let transparentWrapper = unwrapTransparentWrapper(stripped, options2.policy);
  if (transparentWrapper) {
    for (let childIndex of [
      transparentWrapper.childIndex,
      ...transparentWrapper.alternativeChildIndices
    ]) {
      reserveWrapperNormalization(normalizedOptions.wrapperNormalizationBudget);
      let candidateTokens = childIndex === transparentWrapper.childIndex ? transparentWrapper.tokens : [...stripped.slice(childIndex)];
      trace?.recordSegment({
        type: "transparent-wrapper",
        wrapper: transparentWrapper.wrapper,
        output: candidateTokens
      });
      let result = analyzeSegment(candidateTokens, depth, {
        ...normalizedOptions,
        commandView: normalizedCommandView ? sliceCommandView(normalizedCommandView, childIndex) : void 0,
        effectiveCwd: nestedEffectiveCwd,
        envAssignments
      });
      if (result)
        return result;
    }
    return null;
  }
  if (normalizedHead === "eval") {
    let source = extractEvalSource(stripped, normalizedCommandView);
    if (source.kind === "dynamic")
      return dynamicShellSourceResult(trace);
    if (source.kind === "literal") {
      trace?.recordSegment({
        type: "recurse",
        reason: "shell-eval",
        innerCommand: source.source,
        depth: depth + 1
      });
      let result = options2.analyzeNested(source.source, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments
      });
      if (result)
        return result;
    }
  }
  if (normalizedHead === "trap") {
    let source = extractTrapSource(stripped, normalizedCommandView);
    if (source.kind === "dynamic")
      return dynamicShellSourceResult(trace);
    if (source.kind === "literal") {
      trace?.recordSegment({
        type: "recurse",
        reason: "shell-trap",
        innerCommand: source.source,
        depth: depth + 1
      });
      let result = options2.analyzeNested(source.source, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments
      });
      if (result)
        return result;
    }
  }
  if (isShellWrapperCommand(head, normalizedHead)) {
    if (isShellSyntaxCheck(stripped))
      return null;
    let startupResult = analyzeShellStartupSources(stripped, envAssignments, nestedEffectiveCwd, options2, trace, depth);
    if (startupResult)
      return startupResult;
    let dashCArg = extractDashCArg(stripped);
    if (dashCArg) {
      let positionalSource = extractPositionalShellSource(stripped, normalizedCommandView, dashCArg);
      if (positionalSource.kind === "dynamic")
        return dynamicShellSourceResult(trace);
      let source = positionalSource.kind === "literal" ? positionalSource.source : dashCArg, traceInnerCommand = unwrapTraceQuotes(source);
      trace?.recordSegment({
        type: "shell-wrapper",
        wrapper: normalizedHead,
        innerCommand: traceInnerCommand
      }), trace?.recordSegment({
        type: "recurse",
        reason: "shell-wrapper",
        innerCommand: traceInnerCommand,
        depth: depth + 1
      });
      let result = options2.analyzeNested(source, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments
      });
      if (result)
        return result;
      return shellSourceHasUnresolvedDynamicExecutionCarrier(source) ? dynamicShellSourceResult(trace) : null;
    }
    let scriptSource = extractShellScriptOperandSource(stripped, normalizedCommandView);
    if (scriptSource.kind === "dynamic")
      return dynamicShellSourceResult(trace);
    if (scriptSource.kind === "literal")
      return analyzeTrackedHeredocScript(scriptSource.source, nestedEffectiveCwd, envAssignments, options2, trace, depth);
    let stdinSource = extractShellStdinSource(stripped, normalizedCommandView, options2.hasPipelineInput ?? !1, options2.literalShellInput);
    if (stdinSource.kind === "dynamic")
      return dynamicShellSourceResult(trace);
    if (stdinSource.kind === "literal")
      return trace?.recordSegment({
        type: "recurse",
        reason: "shell-stdin",
        innerCommand: stdinSource.source,
        depth: depth + 1
      }), options2.analyzeNested(stdinSource.source, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments
      });
  }
  if (normalizedHead === "source" || normalizedHead === ".") {
    let sourceSearchPathIndex = stripped[1] === "-p" ? 2 : null;
    if (sourceSearchPathIndex !== null) {
      let sourceSearchPath = normalizedCommandView?.words[sourceSearchPathIndex];
      if (!sourceSearchPath)
        return null;
      if (sourceSearchPath.provenance !== "literal")
        return dynamicShellSourceResult(trace);
    }
    let sourceCandidateIndex = sourceSearchPathIndex === null ? 1 : 3, sourceOperandIndex = stripped[sourceCandidateIndex] === "--" ? sourceCandidateIndex + 1 : sourceCandidateIndex, source = normalizedCommandView?.words[sourceOperandIndex];
    if (!source)
      return null;
    if (source.provenance !== "literal")
      return dynamicShellSourceResult(trace);
    return analyzeTrackedHeredocScript(source.text, nestedEffectiveCwd, envAssignments, options2, trace, depth);
  }
  if (AWK_INTERPRETERS.has(normalizedHead)) {
    if (options2.strict && hasDynamicExecutableSource(extractAwkExecutableSources(stripped), normalizedCommandView))
      return dynamicShellSourceResult(trace);
    let awkMatch = analyzeAwkSystemCallMatch(stripped, (command2) => matchFromBlockResult(options2.analyzeNested(command2, {
      effectiveCwd: nestedEffectiveCwd,
      envAssignments
    }))), awkReason = options2.compatibility === "explain-legacy" ? awkMatch : filterDestructiveCommandMatch(awkMatch, options2.policy);
    if (awkReason)
      return trace?.recordSegment({
        type: "rule-check",
        ruleModule: "awk",
        ruleFunction: "analyzeAwkSystemCalls",
        matched: !0,
        reason: awkReason.reason
      }), blockResultFromMatch(awkReason);
  }
  if (isInterpreterCommand(normalizedHead)) {
    if (options2.strict && hasDynamicExecutableSource(extractInterpreterExecutableSources(stripped), normalizedCommandView))
      return dynamicShellSourceResult(trace);
    let codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      let paranoidInterpreterRuleEnabled = destructiveCommandRuleIsEnabled(options2.policy, "interpreter.one-liner-paranoid", !!options2.paranoidInterpreters);
      if (trace?.recordSegment({
        type: "interpreter",
        interpreter: normalizedHead,
        codeArg,
        paranoidBlocked: paranoidInterpreterRuleEnabled
      }), paranoidInterpreterRuleEnabled) {
        let interpreterMatch = destructiveCommandMatch("interpreter.one-liner-paranoid", REASON_INTERPRETER_BLOCKED), match = options2.compatibility === "explain-legacy" ? interpreterMatch : filterDestructiveCommandMatch(interpreterMatch, options2.policy);
        if (match)
          return blockResultFromMatch(match);
      }
      if (isInterpreterDisplayOnly(normalizedHead, codeArg))
        return null;
      trace?.recordSegment({
        type: "recurse",
        reason: "interpreter",
        innerCommand: codeArg,
        depth: depth + 1
      });
      let innerReason = options2.analyzeNested(codeArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments
      });
      if (innerReason && innerReason.ruleId !== "raw-text.dangerous-command" && (innerReason.reason !== REASON_STRICT_UNPARSEABLE || hasUnclosedQuotes(codeArg)))
        return innerReason;
      if (containsDangerousCode(codeArg, options2.scanWork)) {
        let interpreterMatch = destructiveCommandMatch("interpreter.dangerous-command", REASON_INTERPRETER_DANGEROUS), match = options2.compatibility === "explain-legacy" ? interpreterMatch : filterDestructiveCommandMatch(interpreterMatch, options2.policy);
        if (match)
          return trace?.recordSegment({
            type: "dangerous-text",
            token: codeArg,
            matched: !0,
            reason: REASON_INTERPRETER_DANGEROUS
          }), blockResultFromMatch(match);
      }
      trace = void 0;
    }
  }
  if (normalizedHead === "busybox" && stripped.length > 1)
    return reserveWrapperNormalization(normalizedOptions.wrapperNormalizationBudget), trace?.recordSegment({ type: "busybox", subcommand: stripped[1] ?? "unknown" }), trace?.recordSegment({
      type: "recurse",
      reason: "busybox",
      innerCommand: stripped.slice(1).join(" "),
      depth: depth + 1
    }), analyzeSegment(stripped.slice(1), depth + (options2.compatibility === "explain-legacy" ? 1 : 0), {
      ...normalizedOptions,
      commandView: normalizedCommandView ? sliceCommandView(normalizedCommandView, 1) : void 0,
      effectiveCwd: nestedEffectiveCwd,
      envAssignments
    });
  let commandContext = {
    tokens: stripped,
    head,
    normalizedHead,
    basename: basename3,
    cwdForRm,
    originalCwd: originalCwdForRm,
    envAssignments,
    allowTmpdirVar,
    depth,
    effectiveCwd: nestedEffectiveCwd,
    options: trace === normalizedOptions.trace ? normalizedOptions : { ...normalizedOptions, trace }
  }, commandAnalyzer = getCommandAnalyzer(commandContext);
  if (normalizedHead === "rm" || normalizedHead === "xargs" || normalizedHead === "parallel")
    trace?.recordSegment({
      type: "tmpdir-check",
      tmpdirValue: envAssignments.has("TMPDIR") || process.env.TMPDIR !== void 0 ? "<redacted>" : null,
      isOverriddenToNonTemp: !allowTmpdirVar,
      allowTmpdirVar
    });
  let gitDetail = trace && normalizedHead === "git" ? analyzeGitCommandDetailed(commandContext) : void 0, unfilteredCommandResult = normalizedHead === "git" ? trace ? gitDetail?.match ?? null : analyzeGitCommand(commandContext) : commandAnalyzer?.(commandContext) ?? null, commandResult = options2.compatibility === "explain-legacy" && unfilteredCommandResult?.id !== "rm.recursive-force-dynamic-target" ? unfilteredCommandResult : filterBuiltInCommandMatch(unfilteredCommandResult, options2.policy);
  if (trace)
    recordCommandAnalyzerTrace(commandContext, commandResult, gitDetail?.relaxation ?? null);
  if (commandResult)
    return blockResultFromMatch(commandResult);
  let matchedKnown = commandAnalyzer !== void 0;
  if (!matchedKnown)
    if (!DISPLAY_COMMANDS.has(normalizedHead)) {
      let tokensScanned = trace ? [] : void 0;
      for (let i = 1;i < stripped.length; i++) {
        let token = stripped[i];
        if (!token)
          continue;
        tokensScanned?.push(token);
        let embeddedMatch = analyzeEmbeddedCommand(commandContext, i), match = options2.compatibility === "explain-legacy" ? embeddedMatch : filterBuiltInCommandMatch(embeddedMatch, options2.policy);
        if (match)
          return trace?.recordSegment({
            type: "fallback-scan",
            tokensScanned: tokensScanned ?? [],
            embeddedCommandFound: normalizeCommandToken(token)
          }), blockResultFromMatch(match);
      }
      trace?.recordSegment({ type: "fallback-scan", tokensScanned: tokensScanned ?? [] });
    } else
      trace?.recordSegment({ type: "fallback-scan", tokensScanned: [] });
  else
    trace?.recordSegment({ type: "fallback-scan", tokensScanned: [] });
  if (depth === 0 || !matchedKnown) {
    let customResult = checkPolicyRuleMatch(stripped, options2.policy.rules);
    if (trace?.recordSegment({
      type: "custom-rules-check",
      rulesChecked: options2.policy.rules.length > 0,
      matched: !!customResult,
      reason: customResult?.reason
    }), customResult)
      return blockResultFromMatch(customResult);
  } else
    trace?.recordSegment({
      type: "custom-rules-check",
      rulesChecked: !1,
      matched: !1
    });
  return null;
}
function analyzeShellStartupSources(tokens, envAssignments, effectiveCwd, options2, trace, depth) {
  let startup = extractShellStartupLoaderMetadata(tokens);
  if (startup.argvSource?.kind === "absent")
    return dynamicShellSourceResult(trace);
  if (startup.argvSourceApplies && startup.argvSource) {
    let result = analyzeStartupSourcePath(startup.argvSource.value, effectiveCwd, envAssignments, options2, trace, depth);
    if (result)
      return result;
  }
  if (!startup.envSourceApplies || !startup.envName)
    return null;
  let envSource = envAssignments.get(startup.envName);
  if (!envSource)
    return null;
  return analyzeStartupSourcePath(envSource, effectiveCwd, envAssignments, options2, trace, depth);
}
function analyzeStartupSourcePath(source, effectiveCwd, envAssignments, options2, trace, depth) {
  if (/[$`*?[\]]/.test(source))
    return dynamicShellSourceResult(trace);
  let path = resolveTrackedHeredocPath(source, effectiveCwd), body = path ? options2.literalHeredocFiles?.get(path) : void 0;
  if (body === void 0)
    return dynamicShellSourceResult(trace);
  return reserveDerivedCommandTokens(options2.derivedCommandWorkBudget, 1), trace?.recordSegment({
    type: "recurse",
    reason: "heredoc-file",
    innerCommand: body,
    depth: depth + 1
  }), options2.analyzeNested(body, { effectiveCwd, envAssignments });
}
function analyzeTrackedHeredocScript(source, effectiveCwd, envAssignments, options2, trace, depth) {
  let path = resolveTrackedHeredocPath(source, effectiveCwd), body = path ? options2.literalHeredocFiles?.get(path) : void 0;
  if (body === void 0)
    return null;
  return reserveDerivedCommandTokens(options2.derivedCommandWorkBudget, 1), trace?.recordSegment({
    type: "recurse",
    reason: "heredoc-file",
    innerCommand: body,
    depth: depth + 1
  }), options2.analyzeNested(body, { effectiveCwd, envAssignments });
}
function hasDynamicExecutableSource(sources, command2) {
  return sources.some((source) => {
    if (source.value === "-" && (source.kind === "main-script" || source.kind === "program-file"))
      return !0;
    let word = command2?.words[source.tokenIndex];
    return word ? word.provenance !== "literal" : /[$`*?[\]]/.test(source.value);
  });
}
function unwrapTraceQuotes(command2) {
  let first = command2[0];
  return command2.length >= 2 && (first === '"' || first === "'") && command2.at(-1) === first ? command2.slice(1, -1) : command2;
}
function recordCommandAnalyzerTrace(context, match, relaxation) {
  let details = {
    git: ["git", "analyzeGit"],
    rm: ["analyze/rm.ts", "analyzeRm"],
    find: ["analyze/find.ts", "analyzeFind"],
    xargs: ["analyze/xargs.ts", "analyzeXargs"],
    parallel: ["analyze/parallel.ts", "analyzeParallel"]
  }[context.normalizedHead];
  if (!details)
    return;
  if (context.options.trace?.recordSegment({
    type: "rule-check",
    ruleModule: details[0] ?? "",
    ruleFunction: details[1] ?? "",
    matched: !!match || !!relaxation,
    reason: match?.reason ?? relaxation?.originalReason
  }), relaxation)
    context.options.trace?.recordSegment({
      type: "worktree-relaxation",
      originalReason: relaxation.originalReason,
      gitCwd: relaxation.gitCwd
    });
}
function normalizeWrappedCommandView(view, leadingAssignments, wrapperPrefix) {
  if (!view)
    return;
  return sliceCommandView(view, leadingAssignments + wrapperPrefix);
}
function reserveWrapperNormalization(budget) {
  if (budget.iterations >= MAX_STRIP_ITERATIONS)
    throw new DerivedCommandWorkLimitError;
  budget.iterations++;
}
function blockResultFromMatch(match) {
  return { reason: match.reason, ruleId: match.id || void 0, intent: match.intent };
}
function dynamicShellSourceResult(trace) {
  return trace?.recordSegment({ type: "error", message: REASON_DYNAMIC_SHELL_SOURCE }), blockResultFromMatch(dynamicShellSourceMatch());
}
function dynamicShellSourceMatch() {
  return { id: "", reason: REASON_DYNAMIC_SHELL_SOURCE, intent: "stop_and_explain" };
}
function analyzeDynamicExecutable(dynamic, strict, policy) {
  return dynamic && destructiveCommandRuleIsEnabled(policy, "shell.dynamic-executable", !!strict) ? destructiveCommandMatch("shell.dynamic-executable", REASON_DYNAMIC_EXECUTABLE) : null;
}
function analyzeDynamicCommandStructure(command2, strict = !1, policy) {
  return filterDestructiveCommandMatch(analyzeDynamicExecutable(command2?.dynamicExecutable ?? !1, strict, policy), policy) ?? analyzeDynamicStructure(command2, strict, policy);
}
function analyzeDynamicStructure(command2, strict, policy) {
  if (!command2 || command2.words.length < 2)
    return null;
  let dynamicIndexes = command2.words.flatMap((word, index) => hasCommandSubstitutionPart(word) ? [index] : []);
  if (dynamicIndexes.length === 0)
    return null;
  let head = normalizeCommandToken(command2.words[0]?.text ?? "");
  if (head === "git") {
    let subcommandIndex = findGitSubcommandIndex(command2.analysisTokens);
    if (destructiveCommandRuleIsEnabled(policy, "shell.dynamic-structure", strict) && dynamicIndexes.some((index) => index <= subcommandIndex))
      return filterDestructiveCommandMatch(destructiveCommandMatch("shell.dynamic-structure", REASON_DYNAMIC_STRUCTURE), policy);
    if (filterDestructiveCommandMatch(analyzeGitMatch(command2.analysisTokens), policy))
      return null;
    let subcommand = command2.words[subcommandIndex]?.text.toLowerCase(), dataBoundary = command2.analysisTokens.indexOf("--", subcommandIndex + 1);
    if (destructiveCommandRuleIsEnabled(policy, "shell.dynamic-structure", strict) && subcommand && STRUCTURAL_GIT_SUBCOMMANDS.has(subcommand) && dynamicIndexes.some((index) => index > subcommandIndex && (dataBoundary === -1 || index < dataBoundary)))
      return filterDestructiveCommandMatch(destructiveCommandMatch("shell.dynamic-structure", REASON_DYNAMIC_STRUCTURE), policy);
    return null;
  }
  if (head === "find")
    return destructiveCommandRuleIsEnabled(policy, "shell.dynamic-structure", strict) && hasDynamicFindStructure(command2) ? filterDestructiveCommandMatch(destructiveCommandMatch("shell.dynamic-structure", REASON_DYNAMIC_STRUCTURE), policy) : null;
  if (head === "xargs")
    return analyzeDynamicChildStructure(command2, extractXargsChildCommandWithInfo(command2.analysisTokens).childTokens, "xargs", strict, policy);
  if (head === "parallel")
    return analyzeDynamicChildStructure(command2, extractParallelChildCommand(command2.analysisTokens), "parallel", strict, policy);
  return null;
}
function hasDynamicFindStructure(command2) {
  let expressionStarted = !1, valuesRemaining = 0, childStart = !1, inChild = !1;
  for (let i = 1;i < command2.words.length; i++) {
    let word = command2.words[i];
    if (!word)
      continue;
    let dynamic = hasCommandSubstitutionPart(word);
    if (valuesRemaining > 0) {
      valuesRemaining--;
      continue;
    }
    if (inChild) {
      if (word.text === ";" || word.text === "+") {
        inChild = !1, expressionStarted = !0, childStart = !1;
        continue;
      }
      if (dynamic && (childStart || hasOptionLiteralPart(word)))
        return !0;
      childStart = !1;
      continue;
    }
    if (!expressionStarted && !word.text.startsWith("-")) {
      if (dynamic && (i > 1 || hasOptionLiteralPart(word)))
        return !0;
      continue;
    }
    if (expressionStarted = !0, dynamic)
      return !0;
    let arity = getFindPrimaryArity(word.text);
    if (arity > 0) {
      valuesRemaining = arity;
      continue;
    }
    if (isFindExecPrimary(word.text))
      inChild = !0, childStart = !0;
  }
  return !1;
}
function analyzeDynamicChildStructure(command2, childTokens, kind, strict, policy) {
  if (childTokens.length === 0)
    return null;
  let childStart = command2.analysisTokens.length - childTokens.length, childView = normalizeChildCommandView(sliceCommandView(command2, childStart));
  if (childView.dynamicExecutable) {
    let match = filterDestructiveCommandMatch(destructiveCommandMatch(`${kind}.shell-dynamic`, kind === "xargs" ? REASON_XARGS_SHELL : REASON_PARALLEL_SHELL), policy);
    if (match)
      return match;
  }
  let nestedStructure = analyzeDynamicStructure(childView, strict, policy);
  if (nestedStructure)
    return nestedStructure;
  if (childView.words[0]?.text === "rm" && childView.words.slice(1).some((word) => hasCommandSubstitutionPart(word) && hasOptionLiteralPart(word)))
    return filterDestructiveCommandMatch(destructiveCommandMatch(`${kind}.rm-recursive-force-dynamic`, kind === "xargs" ? REASON_XARGS_RM : REASON_PARALLEL_RM), policy);
  return null;
}
function normalizeChildCommandView(view) {
  let leading = stripEnvAssignmentsWithInfo([...view.analysisTokens]), withoutLeading = sliceCommandView(view, view.analysisTokens.length - leading.tokens.length), wrapped = stripWrappersWithInfo([...withoutLeading.analysisTokens]), normalized = sliceCommandView(withoutLeading, withoutLeading.analysisTokens.length - wrapped.tokens.length);
  return normalized.analysisTokens[0] === "busybox" ? sliceCommandView(normalized, 1) : normalized;
}
function hasCommandSubstitutionPart(word) {
  return word?.parts.some((part) => part.provenance === "command-substitution") ?? !1;
}
function hasOptionLiteralPart(word) {
  return word?.parts.some((part) => part.provenance === "literal" && part.raw.replace(/^["']/, "").startsWith("-")) ?? !1;
}
function findGitSubcommandIndex(tokens) {
  let i = 1;
  while (i < tokens.length) {
    let token = tokens[i] ?? "";
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }
    if (token.startsWith("-")) {
      i++;
      continue;
    }
    return i;
  }
  return i;
}
function isShellWrapperCommand(head, normalizedHead) {
  return SHELL_WRAPPERS.has(normalizedHead) || head === "$SHELL" || head === "${SHELL}" || SHELL_WRAPPERS.has(getBasename(normalizedHead));
}
function getCommandAnalyzer(context) {
  return COMMAND_ANALYZERS.get(context.normalizedHead);
}
function analyzeEmbeddedCommand(context, index) {
  let childCommands = normalizeChildCommands(context.tokens.slice(index), {
    cwd: context.cwdForRm,
    envAssignments: context.envAssignments,
    policy: context.options.compatibility === "explain-legacy" ? void 0 : context.options.policy
  });
  for (let childCommand of childCommands) {
    let result = analyzeNormalizedEmbeddedCommand(context, index, childCommand);
    if (result)
      return result;
  }
  return null;
}
function analyzeNormalizedEmbeddedCommand(context, index, childCommand) {
  let token = childCommand.tokens[0];
  if (!token)
    return null;
  let cmd = normalizeCommandToken(token);
  if (isShellWrapperCommand(token, cmd)) {
    reserveDerivedCommandTokens(context.options.derivedCommandWorkBudget, context.tokens.length - index);
    let shellTokens = childCommand.tokens;
    if (isShellSyntaxCheck(shellTokens))
      return null;
    let dashCArg = extractDashCArg(shellTokens);
    if (!dashCArg) {
      if (extractShellScriptOperandSource(shellTokens, void 0).kind === "dynamic")
        return dynamicShellSourceMatch();
      return matchEmbeddedCustomRule(context, childCommand);
    }
    let result = context.options.analyzeNested(dashCArg, {
      effectiveCwd: childCommand.wrapperCwd === void 0 ? context.effectiveCwd : childCommand.wrapperCwd,
      envAssignments: childCommand.envAssignments
    });
    return result ? matchFromBlockResult(result) : matchEmbeddedCustomRule(context, childCommand);
  }
  let analyzer = COMMAND_ANALYZERS.get(cmd);
  if (!analyzer || cmd === "xargs" || cmd === "parallel") {
    if (childCommand.wrappedByTransparent && context.options.policy.rules.length > 0)
      reserveDerivedCommandTokens(context.options.derivedCommandWorkBudget, context.tokens.length - index);
    return matchEmbeddedCustomRule(context, childCommand);
  }
  reserveDerivedCommandTokens(context.options.derivedCommandWorkBudget, context.tokens.length - index);
  let embeddedContext = {
    ...context,
    tokens: [cmd, ...childCommand.tokens.slice(1)],
    head: cmd,
    normalizedHead: cmd,
    basename: cmd,
    cwdForRm: childCommand.cwd,
    originalCwd: childCommand.wrapperCwd === null ? void 0 : context.originalCwd,
    envAssignments: childCommand.envAssignments,
    allowTmpdirVar: !isTmpdirOverriddenToNonTemp(childCommand.envAssignments),
    effectiveCwd: childCommand.wrapperCwd === void 0 ? context.effectiveCwd : childCommand.wrapperCwd,
    options: cmd === "git" ? { ...context.options, worktreeMode: !1 } : context.options
  };
  return analyzer(embeddedContext) ?? matchEmbeddedCustomRule(context, childCommand);
}
function matchEmbeddedCustomRule(context, childCommand) {
  return childCommand.wrappedByTransparent ? checkPolicyRuleMatch(childCommand.tokens, context.options.policy.rules) : null;
}
function analyzeGitCommand(context) {
  return analyzeGitMatch(context.tokens, getGitAnalyzeOptions(context));
}
function analyzeGitCommandDetailed(context) {
  return analyzeGitDetailed(context.tokens, getGitAnalyzeOptions(context));
}
function getGitAnalyzeOptions(context) {
  return {
    cwd: context.cwdForRm,
    dynamicArguments: context.options.commandView?.words.some((word) => word.provenance === "command-substitution"),
    envAssignments: context.envAssignments,
    policy: context.options.compatibility === "explain-legacy" ? void 0 : context.options.policy,
    worktreeMode: context.options.worktreeMode
  };
}
function analyzeRmCommand(context) {
  let targetMetadata = getDeleteTargetTokenMetadata(context.tokens, context.options.commandView);
  return analyzeRmMatch(context.tokens, {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    strict: context.options.strict,
    paranoid: context.options.paranoidRm,
    allowTmpdirVar: context.allowTmpdirVar,
    tmpdirVarExpandsEmpty: isTmpdirKnownEmpty(context.envAssignments),
    tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(context.envAssignments),
    trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments),
    literalTargetTokenIndexes: targetMetadata?.literal,
    tmpdirWordSplittingProtectedTargetTokenIndexes: targetMetadata?.wordSplittingProtected,
    expandedTargetTokens: targetMetadata?.expanded,
    unsafeBraceExpansionTargetTokenIndexes: targetMetadata?.unsafeBraceExpansion,
    policy: context.options.compatibility === "explain-legacy" ? void 0 : context.options.policy
  });
}
function getDeleteTargetTokenMetadata(tokens, view) {
  if (!view || view.dialect !== "posix" || view.words.length !== tokens.length || view.analysisTokens.length !== tokens.length || !tokens.every((token, index) => view.analysisTokens[index] === token))
    return;
  let braceExpansions = view.words.map((word) => expandPosixLiteralBraceWord(word, DELETE_TARGET_BRACE_EXPANSION_LIMIT, DELETE_TARGET_BRACE_EXPANSION_LIMIT, DELETE_TARGET_BRACE_EXPANDED_LENGTH_LIMIT));
  return {
    literal: new Set(view.words.flatMap((word, index) => braceExpansions[index] === void 0 && word.provenance === "literal" && (word.quoted || word.raw !== word.text) ? [index] : [])),
    wordSplittingProtected: new Set(view.words.flatMap((word, index) => isTmpdirExpansionWordSplittingProtected(word) ? [index] : [])),
    expanded: new Map(braceExpansions.flatMap((expansion, index) => {
      if (!expansion || !("words" in expansion) || expansion.words === void 0)
        return [];
      return [[index, expansion.words]];
    })),
    unsafeBraceExpansion: new Set(braceExpansions.flatMap((expansion, index) => expansion && ("limited" in expansion) ? [index] : []))
  };
}
function isTmpdirExpansionWordSplittingProtected(word) {
  let tmpdirParts = word.parts.filter((part) => part.provenance === "variable" && /\$(?:TMPDIR(?![A-Za-z0-9_])|\{TMPDIR\})/.test(part.raw));
  return tmpdirParts.length > 0 && tmpdirParts.every((part) => isRawOffsetDoubleQuoted(word.raw, part.span.start - word.span.start));
}
function isRawOffsetDoubleQuoted(raw, offset) {
  let quote = null, escaped = !1;
  for (let index = 0;index < offset; index++) {
    let char = raw[index];
    if (escaped) {
      escaped = !1;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = !0;
      continue;
    }
    if (quote === char) {
      quote = null;
      continue;
    }
    if (quote === null && (char === "'" || char === '"'))
      quote = char;
  }
  return quote === '"';
}
function analyzeFindCommand(context) {
  let targetMetadata = getDeleteTargetTokenMetadata(context.tokens, context.options.commandView);
  return analyzeFindMatch(context.tokens, {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    strict: context.options.strict,
    allowTmpdirVar: context.allowTmpdirVar,
    tmpdirVarExpandsEmpty: isTmpdirKnownEmpty(context.envAssignments),
    tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(context.envAssignments),
    trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments),
    literalTargetTokenIndexes: targetMetadata?.literal,
    tmpdirWordSplittingProtectedTargetTokenIndexes: targetMetadata?.wordSplittingProtected,
    expandedTargetTokens: targetMetadata?.expanded,
    unsafeBraceExpansionTargetTokenIndexes: targetMetadata?.unsafeBraceExpansion,
    derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
    envAssignments: context.envAssignments,
    policy: context.options.compatibility === "explain-legacy" ? void 0 : context.options.policy,
    analyzeTokens: (tokens, cwd) => {
      return matchFromBlockResult(analyzeSegment([...tokens], context.depth + 1, {
        ...context.options,
        commandView: void 0,
        derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
        effectiveCwd: cwd,
        envAssignments: context.envAssignments
      })) ?? checkPolicyRuleMatch(tokens, context.options.policy.rules);
    },
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
    budget: context.options.parallelBudget,
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
function filterBuiltInCommandMatch(match, policy) {
  return match?.id.startsWith("custom.") ? match : filterDestructiveCommandMatch(match, policy);
}
function getNestedCommandAnalyzeContext(context) {
  return {
    cwd: context.cwdForRm,
    originalCwd: context.originalCwd,
    strict: context.options.strict,
    paranoidRm: context.options.paranoidRm,
    paranoidInterpreters: context.options.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    derivedCommandWorkBudget: context.options.derivedCommandWorkBudget,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode,
    policy: context.options.policy,
    scanWork: context.options.scanWork
  };
}
var CWD_CHANGE_REGEX = /^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/, POWERSHELL_LOCATION_COMMANDS = /* @__PURE__ */ new Set([
  "cd",
  "chdir",
  "pop-location",
  "popd",
  "push-location",
  "pushd",
  "set-location",
  "sl"
]), POWERSHELL_SET_LOCATION_COMMANDS = /* @__PURE__ */ new Set(["cd", "chdir", "set-location", "sl"]), POWERSHELL_MODULE_LOCATION_COMMANDS = /* @__PURE__ */ new Set([
  "pop-location",
  "push-location",
  "set-location"
]), POWERSHELL_MANAGEMENT_COMMAND_REGEX = /(?:^|[\\/])microsoft\.powershell\.management\\([^\\/]+)$/;
function posixSegmentChangesCwd(segment) {
  let unwrapped = getCwdChangeTokens(segment);
  if (unwrapped.length === 0)
    return !1;
  let head = unwrapped[0] ?? "", headIndex = 0;
  if (head === "builtin" && unwrapped.length > 1)
    head = unwrapped[1] ?? "", headIndex = 1;
  if (head === "time")
    head = getHeadAfterTimePrefix(unwrapped, headIndex + 1);
  if (head === "cd" || head === "pushd" || head === "popd")
    return !0;
  let joined = segment.join(" ");
  return CWD_CHANGE_REGEX.test(joined);
}
function resolveCwdAfterCommandView(commandView, cwd, literalPipelineInput) {
  if (commandView.dialect === "powershell") {
    let effect = getPowerShellLocationEffect(commandView.words, literalPipelineInput);
    if (effect.kind === "none")
      return;
    if (!cwd || effect.kind === "unknown")
      return null;
    if (effect.kind === "unchanged")
      return cwd;
    return resolveKnownCwdTarget(normalizePowerShellLocationTarget(effect.target), cwd);
  }
  let segment = commandView.analysisTokens;
  if (!posixSegmentChangesCwd(segment))
    return;
  if (!cwd)
    return null;
  let unwrapped = getCwdChangeTokens(segment, cwd), cdIndex = getCdCommandIndex(unwrapped);
  if (cdIndex === -1 || unwrapped[cdIndex] !== "cd")
    return null;
  return resolveKnownCwdTarget(unwrapped[cdIndex + 1], cwd);
}
function resolveKnownCwdTarget(target, cwd) {
  if (!target || target === "-" || target.includes("$") || target.includes("`"))
    return null;
  try {
    let resolved = resolveChdirTarget(cwd, target);
    if (samePath(resolved, cwd))
      return cwd;
  } catch {
    return null;
  }
  return null;
}
function getPowerShellLocationEffect(words, literalPipelineInput) {
  let commandIndex = isBarePowerShellCallOperator(words[0]) ? 1 : 0, commandWord = words[commandIndex];
  if (!isStaticPowerShellCommandWord(commandWord, commandIndex === 1))
    return { kind: "none" };
  let command2 = normalizePowerShellManagementCommand(commandWord.text);
  if (!POWERSHELL_LOCATION_COMMANDS.has(command2))
    return { kind: "none" };
  if (command2 === "pop-location" || command2 === "popd")
    return { kind: "unknown" };
  return getPowerShellLocationArgumentEffect(words.slice(commandIndex + 1), literalPipelineInput, POWERSHELL_SET_LOCATION_COMMANDS.has(command2));
}
function normalizePowerShellManagementCommand(command2) {
  let normalized = command2.toLowerCase(), moduleCommand = normalized.match(POWERSHELL_MANAGEMENT_COMMAND_REGEX)?.[1];
  return moduleCommand && POWERSHELL_MODULE_LOCATION_COMMANDS.has(moduleCommand) ? moduleCommand : normalized;
}
function isBarePowerShellCallOperator(word) {
  return word?.provenance === "literal" && !word.quoted && word.raw === word.text && (word.text === "&" || word.text === ".");
}
function isStaticPowerShellCommandWord(word, invoked) {
  return word?.provenance === "literal" && (invoked || !word.quoted && word.raw === word.text);
}
function getPowerShellLocationArgumentEffect(args, literalPipelineInput, supportsStackName) {
  let target, stackOnly = !1;
  for (let index = 0;index < args.length; index++) {
    let word = args[index];
    if (!word)
      continue;
    if (!isBarePowerShellParameter(word) || word.text === "-") {
      if (word.provenance !== "literal" || target !== void 0 || stackOnly)
        return { kind: "unknown" };
      target = word.text;
      continue;
    }
    if (word.text === "--") {
      let positional = args[index + 1];
      if (!positional || positional.provenance !== "literal" || target !== void 0 || stackOnly || index + 2 !== args.length)
        return { kind: "unknown" };
      return { kind: "target", target: positional.text };
    }
    let parameter = parsePowerShellParameter(word.text);
    if (isPowerShellPathParameter(parameter.name)) {
      let value = parameter.value === void 0 ? args[++index] : void 0, path = parameter.value ?? value?.text;
      if (path === void 0 || value && value.provenance !== "literal" || target !== void 0 || stackOnly)
        return { kind: "unknown" };
      target = path;
      continue;
    }
    if (supportsStackName && isPowerShellStackName(parameter.name)) {
      let value = parameter.value === void 0 ? args[++index] : void 0;
      if (parameter.value === void 0 && !value || target !== void 0 || stackOnly)
        return { kind: "unknown" };
      stackOnly = !0;
      continue;
    }
    if (isPowerShellSafeSwitch(parameter.name))
      continue;
    if (isPowerShellCommonValueParameter(parameter.name)) {
      if (parameter.value === void 0 && !args[++index])
        return { kind: "unknown" };
      continue;
    }
    return { kind: "unknown" };
  }
  if (target !== void 0)
    return { kind: "target", target };
  if (stackOnly)
    return { kind: "unchanged" };
  return literalPipelineInput === void 0 ? { kind: "unknown" } : { kind: "target", target: literalPipelineInput };
}
function isBarePowerShellParameter(word) {
  return word.provenance === "literal" && !word.quoted && word.raw === word.text && ["-", "–", "—", "―"].includes(word.text[0] ?? "");
}
function parsePowerShellParameter(parameter) {
  let colonIndex = parameter.indexOf(":");
  return {
    name: parameter.slice(1, colonIndex === -1 ? void 0 : colonIndex).toLowerCase(),
    value: colonIndex === -1 ? void 0 : parameter.slice(colonIndex + 1)
  };
}
function isPowerShellPathParameter(name) {
  return name === "lp" || name === "pspath" || name.length >= 1 && "literalpath".startsWith(name) || name.length >= 3 && "path".startsWith(name);
}
function isPowerShellStackName(name) {
  return name.length >= 1 && "stackname".startsWith(name);
}
function isPowerShellSafeSwitch(name) {
  return name === "passthru" || name === "verbose";
}
function isPowerShellCommonValueParameter(name) {
  return name === "erroraction" || name === "ea";
}
function normalizePowerShellLocationTarget(target) {
  let providerPrefix = /^(?:microsoft\.powershell\.core\\)?filesystem::/i.exec(target)?.[0];
  if (!providerPrefix && target.includes("::"))
    return;
  return target.slice(providerPrefix?.length ?? 0).replaceAll("\\", "/");
}
function getHeadAfterTimePrefix(tokens, startIndex) {
  let i = startIndex;
  while (tokens[i]?.startsWith("-"))
    i++;
  return tokens[i] ?? "";
}
function getCdCommandIndex(tokens) {
  let headIndex = 0;
  if (tokens[0] === "builtin" && tokens.length > 1)
    headIndex = 1;
  if (tokens[headIndex] !== "time")
    return headIndex;
  let i = headIndex + 1;
  while (tokens[i]?.startsWith("-"))
    i++;
  return i;
}
function getCwdChangeTokens(segment, cwd) {
  let stripped = stripLeadingGrouping(segment);
  return stripWrappers([...stripped], cwd);
}
function samePath(a, b) {
  try {
    return normalize4(realpathSync8(a)) === normalize4(realpathSync8(b));
  } catch {
    return normalize4(a) === normalize4(b);
  }
}
function stripLeadingGrouping(tokens) {
  let i = 0;
  while (i < tokens.length) {
    let token = tokens[i];
    if (token === "{" || token === "(" || token === "$(")
      i++;
    else
      break;
  }
  return tokens.slice(i);
}

// src/core/analyze/shell-git-env.ts
var TMPDIR_ENV_NAME = "TMPDIR", IFS_ENV_NAME = "IFS", ENV_APPEND_ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)\+=/, ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function createShellGitContextEnvState(effectiveEnvAssignments) {
  let initialEffectiveEnvAssignments = getInitialEffectiveShellEnvAssignments(effectiveEnvAssignments);
  return {
    effectiveEnvAssignments: initialEffectiveEnvAssignments,
    shellAssignments: /* @__PURE__ */ new Map,
    exportedNames: getInitiallyExportedShellEnvNames(initialEffectiveEnvAssignments),
    allexport: !1,
    keywordExport: !1
  };
}
function cloneShellGitContextEnvState(state) {
  return {
    effectiveEnvAssignments: state.effectiveEnvAssignments ? new Map(state.effectiveEnvAssignments) : void 0,
    shellAssignments: new Map(state.shellAssignments),
    exportedNames: new Set(state.exportedNames),
    allexport: state.allexport,
    keywordExport: state.keywordExport
  };
}
function applyShellGitContextEnvSegment(tokens, state) {
  let commandInfo = getShellCommandInfo(tokens, state);
  if (!commandInfo)
    return;
  let { command: command2, commandIndex, leadingAssignments, prefixAssignmentsPersist } = commandInfo;
  if (command2 === null) {
    for (let assignment of leadingAssignments.values())
      setShellGitContextAssignment(state, assignment);
    return;
  }
  if (prefixAssignmentsPersist)
    for (let assignment of leadingAssignments.values())
      state.shellAssignments.set(assignment.name, assignment.value), state.exportedNames.add(assignment.name), setEffectiveGitContextAssignment(state, assignment);
  if (command2 === "set") {
    let changes = getSetOptionChanges(tokens, commandIndex);
    if (changes.allexport !== null)
      state.allexport = changes.allexport;
    if (changes.keywordExport !== null)
      state.keywordExport = changes.keywordExport;
    return;
  }
  if (command2 === "unset") {
    let operandsStart = getUnsetOperandsStart(tokens, commandIndex);
    if (operandsStart === null)
      return;
    for (let token of tokens.slice(operandsStart))
      unsetTrackedGitContextEnvName(state, token);
    return;
  }
  if (command2 !== "export" && command2 !== "typeset" && command2 !== "declare" && command2 !== "readonly")
    return;
  for (let assignment of leadingAssignments.values())
    setShellGitContextAssignment(state, assignment);
  if (command2 === "export") {
    let operandsStart = getExportOperandsStart(tokens, commandIndex);
    if (operandsStart === null)
      return;
    for (let token of tokens.slice(operandsStart))
      addExportedGitContextEnvAssignment(state, token);
    return;
  }
  let operandsInfo = getTypesetOperandsInfo(tokens, commandIndex);
  if (operandsInfo === null)
    return;
  for (let token of tokens.slice(operandsInfo.operandsStart))
    addTypesetGitContextEnvAssignment(state, token, operandsInfo.exports, command2 === "readonly" ? leadingAssignments : void 0);
}
function getSegmentGitContextEnvAssignments(tokens, state) {
  if (!state.keywordExport)
    return state.effectiveEnvAssignments;
  let nextEnvAssignments = null, currentValues = getCurrentShellAssignmentValues(state);
  for (let token of tokens) {
    let assignment = parseShellContextEnvAssignment(token, currentValues);
    if (!assignment)
      continue;
    nextEnvAssignments ??= new Map(state.effectiveEnvAssignments ?? []), nextEnvAssignments.set(assignment.name, assignment.value), currentValues.set(assignment.name, assignment.value);
  }
  return nextEnvAssignments ?? state.effectiveEnvAssignments;
}
function getShellCommandInfo(tokens, state) {
  let leadingAssignments = /* @__PURE__ */ new Map, i = 0;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      return null;
    let assignment = parseShellAssignment(token, getCurrentShellAssignmentValues(state, leadingAssignments));
    if (!assignment)
      break;
    leadingAssignments.set(assignment.name, assignment), i++;
  }
  if (i >= tokens.length)
    return {
      command: null,
      commandIndex: i,
      leadingAssignments,
      prefixAssignmentsPersist: !1
    };
  let directCommandIndex = i, commandIndex = i, command2 = tokens[commandIndex] ?? null;
  while (command2 === "builtin" || command2 === "command" || command2 === "time") {
    if (command2 === "builtin") {
      if (commandIndex++, tokens[commandIndex] === "--")
        commandIndex++;
      command2 = tokens[commandIndex] ?? null;
      continue;
    }
    if (command2 === "command") {
      let commandBuiltinInfo = getCommandBuiltinTarget(tokens, commandIndex);
      if (!commandBuiltinInfo)
        return null;
      commandIndex = commandBuiltinInfo.commandIndex, command2 = commandBuiltinInfo.command;
      continue;
    }
    let timePrefixInfo = getTimePrefixTarget(tokens, commandIndex);
    if (!timePrefixInfo)
      return null;
    commandIndex = timePrefixInfo.commandIndex, command2 = timePrefixInfo.command;
  }
  if (command2 === null)
    return null;
  return {
    command: command2,
    commandIndex,
    leadingAssignments,
    prefixAssignmentsPersist: commandIndex === directCommandIndex && (command2 === "unset" || command2 === "set" || command2 === "export" || command2 === "readonly")
  };
}
function getCommandBuiltinTarget(tokens, commandIndex) {
  return getPrefixedCommandTarget(tokens, commandIndex, (token) => {
    if (token === "-p")
      return "skip";
    return token === "-v" || token === "-V" ? "abort" : "stop";
  });
}
function getTimePrefixTarget(tokens, commandIndex) {
  return getPrefixedCommandTarget(tokens, commandIndex, (token) => token.startsWith("-") ? "skip" : "stop");
}
function getPrefixedCommandTarget(tokens, commandIndex, optionAction) {
  let i = commandIndex + 1;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      return null;
    if (token === "--") {
      i++;
      break;
    }
    let action = optionAction(token);
    if (action === "abort")
      return null;
    if (action === "skip") {
      i++;
      continue;
    }
    break;
  }
  let command2 = tokens[i];
  return command2 ? { command: command2, commandIndex: i } : null;
}
function parseShellAssignment(token, currentValues) {
  return parseEnvAssignment(token) ?? parseAppendEnvAssignment(token, currentValues);
}
function parseShellContextEnvAssignment(token, currentValues) {
  return parseEnvAssignment(token) ?? parseAppendEnvAssignment(token, currentValues);
}
function parseAppendEnvAssignment(token, currentValues) {
  let gitAssignment = parseGitContextAppendEnvAssignment(token, currentValues);
  if (gitAssignment)
    return gitAssignment;
  let name = token.match(ENV_APPEND_ASSIGNMENT_RE)?.[1];
  if (!name)
    return null;
  let eqIdx = token.indexOf("=");
  return {
    name,
    value: `${currentValues.has(name) ? currentValues.get(name) : getOwnEnvValue(name) ?? ""}${token.slice(eqIdx + 1)}`
  };
}
function isTrackedShellEnvName(name) {
  return name === TMPDIR_ENV_NAME || name === IFS_ENV_NAME || isTrackedGitEnvName(name);
}
function getCurrentShellAssignmentValues(state, pendingAssignments) {
  return new Map([
    ...state.effectiveEnvAssignments ?? [],
    ...state.shellAssignments,
    ...[...pendingAssignments?.values() ?? []].map((assignment) => [assignment.name, assignment.value])
  ]);
}
function getInitialEffectiveShellEnvAssignments(effectiveEnvAssignments) {
  let inheritedAssignments = [...GIT_SSH_ENV_NAMES, TMPDIR_ENV_NAME, IFS_ENV_NAME].map((name) => {
    let value = getOwnEnvValue(name);
    return value === void 0 ? null : [name, value];
  }).filter((assignment) => assignment !== null);
  if (inheritedAssignments.length === 0)
    return effectiveEnvAssignments;
  return new Map([...inheritedAssignments, ...effectiveEnvAssignments ?? []]);
}
function getInitiallyExportedShellEnvNames(effectiveEnvAssignments) {
  let exportedNames = /* @__PURE__ */ new Set;
  for (let name of Object.keys(process.env))
    if (isTrackedShellEnvName(name))
      exportedNames.add(name);
  for (let name of effectiveEnvAssignments?.keys() ?? [])
    if (isTrackedShellEnvName(name))
      exportedNames.add(name);
  return exportedNames;
}
function setShellGitContextAssignment(state, assignment) {
  if (state.shellAssignments.set(assignment.name, assignment.value), assignment.name === TMPDIR_ENV_NAME || assignment.name === IFS_ENV_NAME || state.allexport || state.exportedNames.has(assignment.name))
    setEffectiveGitContextAssignment(state, assignment);
}
function setEffectiveGitContextAssignment(state, assignment) {
  let nextEnvAssignments = new Map(state.effectiveEnvAssignments ?? []);
  nextEnvAssignments.set(assignment.name, assignment.value), state.effectiveEnvAssignments = nextEnvAssignments;
}
function addExportedGitContextEnvAssignment(state, token) {
  let assignment = parseShellContextEnvAssignment(token, getCurrentShellAssignmentValues(state));
  if (assignment) {
    state.shellAssignments.set(assignment.name, assignment.value), state.exportedNames.add(assignment.name), setEffectiveGitContextAssignment(state, assignment);
    return;
  }
  if (ENV_NAME_RE.test(token))
    exportTrackedGitContextEnvName(state, token);
}
function addTypesetGitContextEnvAssignment(state, token, exports, readonlyLeadingAssignments) {
  let assignment = parseShellContextEnvAssignment(token, getCurrentShellAssignmentValues(state));
  if (assignment) {
    if (state.shellAssignments.set(assignment.name, assignment.value), exports)
      state.exportedNames.add(assignment.name), setEffectiveGitContextAssignment(state, assignment);
    else if (assignment.name === TMPDIR_ENV_NAME || assignment.name === IFS_ENV_NAME || state.allexport || state.exportedNames.has(assignment.name))
      setEffectiveGitContextAssignment(state, assignment);
    return;
  }
  let readonlyAssignment = readonlyLeadingAssignments?.get(token);
  if (readonlyAssignment) {
    state.exportedNames.add(token), setEffectiveGitContextAssignment(state, readonlyAssignment);
    return;
  }
  if (exports && ENV_NAME_RE.test(token))
    exportTrackedGitContextEnvName(state, token);
}
function exportTrackedGitContextEnvName(state, name) {
  state.exportedNames.add(name), setEffectiveGitContextAssignment(state, {
    name,
    value: state.shellAssignments.get(name) ?? state.effectiveEnvAssignments?.get(name) ?? getOwnEnvValue(name) ?? ""
  });
}
function unsetTrackedGitContextEnvName(state, name) {
  if (!isTrackedShellEnvName(name) && !ENV_NAME_RE.test(name))
    return;
  if (state.shellAssignments.set(name, ""), state.exportedNames.delete(name), !isTrackedShellEnvName(name) || name === TMPDIR_ENV_NAME || name === IFS_ENV_NAME || isGitConfigEnvName(name)) {
    setEffectiveGitContextAssignment(state, { name, value: "" });
    return;
  }
  if (!state.effectiveEnvAssignments?.has(name))
    return;
  let nextEnvAssignments = new Map(state.effectiveEnvAssignments);
  nextEnvAssignments.delete(name), state.effectiveEnvAssignments = nextEnvAssignments.size === 0 ? void 0 : nextEnvAssignments;
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
    let token = tokens[i];
    if (!token)
      return null;
    if (token === "--")
      return i + 1;
    if (skipsOption(token)) {
      i++;
      continue;
    }
    if (token.startsWith("-"))
      return null;
    return i;
  }
  return i;
}
function getTypesetOperandsInfo(tokens, commandIndex) {
  let i = commandIndex + 1, hasExportFlag = !1;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      return null;
    if (token === "--")
      return { operandsStart: i + 1, exports: hasExportFlag };
    if (token.startsWith("-")) {
      if (token.slice(1).includes("x"))
        hasExportFlag = !0;
      i++;
      continue;
    }
    if (token.startsWith("+")) {
      if (token.slice(1).includes("x"))
        hasExportFlag = !1;
      i++;
      continue;
    }
    return { operandsStart: i, exports: hasExportFlag };
  }
  return { operandsStart: i, exports: hasExportFlag };
}
function getSetOptionChanges(tokens, commandIndex) {
  let changes = { allexport: null, keywordExport: null }, i = commandIndex + 1;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      return changes;
    if (token === "--")
      return changes;
    if (token === "-o" || token === "+o") {
      if (tokens[i + 1] === "allexport")
        changes.allexport = token === "-o";
      if (tokens[i + 1] === "keyword")
        changes.keywordExport = token === "-o";
      i += 2;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      let flags = token.slice(1);
      if (flags.includes("a"))
        changes.allexport = !0;
      if (flags.includes("k"))
        changes.keywordExport = !0;
      i++;
      continue;
    }
    if (token.startsWith("+") && token.length > 1) {
      let flags = token.slice(1);
      if (flags.includes("a"))
        changes.allexport = !1;
      if (flags.includes("k"))
        changes.keywordExport = !1;
      i++;
      continue;
    }
    return changes;
  }
  return changes;
}

// src/core/analyze/analyze-command.ts
var REASON_UNQUOTED_HEREDOC = "Unquoted heredoc input is not supported safely. Quote the delimiter or ask the user to verify.", REASON_UNSUPPORTED_HEREDOC = "This heredoc form or stdin consumer is not supported safely. Use a quoted heredoc with bare cat, tee, or git apply, or ask the user to verify.", MAX_CONTROL_FLOW_STATES = 64;
function analyzeCommandInternal(command2, depth, options2, parsedProgram) {
  let ownsDerivedCommandWorkBudget = options2.derivedCommandWorkBudget === void 0, ownsParallelBudget = options2.parallelBudget === void 0;
  try {
    return analyzeCommandWithBudget(command2, depth, {
      ...options2,
      derivedCommandWorkBudget: options2.derivedCommandWorkBudget ?? createDerivedCommandWorkBudget(),
      parallelBudget: options2.parallelBudget ?? createParallelAnalysisBudget()
    }, parsedProgram);
  } catch (error) {
    let reason = error instanceof EnvSplitStringExpansionError ? REASON_ENV_SPLIT_STRING_UNVERIFIABLE : error instanceof DerivedCommandWorkLimitError && ownsDerivedCommandWorkBudget ? REASON_DERIVED_COMMAND_WORK_LIMIT : error instanceof ParallelAnalysisLimitError && ownsParallelBudget ? REASON_PARALLEL_ANALYSIS_LIMIT : void 0;
    if (!reason)
      throw error;
    if (options2.trace?.currentSegmentIndex !== void 0)
      options2.trace.recordSegment({ type: "error", message: reason });
    else
      options2.trace?.recordGlobal({ type: "error", message: reason });
    return {
      reason,
      segment: command2,
      intent: "stop_and_explain"
    };
  }
}
function analyzeCommandWithBudget(command2, depth, options2, parsedProgram) {
  if (depth >= MAX_RECURSION_DEPTH)
    return options2.trace?.recordSegment({ type: "error", message: REASON_RECURSION_LIMIT }), { reason: REASON_RECURSION_LIMIT, segment: command2, intent: "stop_and_explain" };
  let program = parsedProgram ?? options2.factStore?.getCommandProgram(command2, options2.shell ?? "auto") ?? parseCommand(command2, options2.shell);
  if (depth === 0 && options2.invalidReason && isFailClosedRepairCommand(program))
    return null;
  if (program.status === "limited")
    return options2.trace?.recordSegment({ type: "error", message: REASON_RECURSION_LIMIT }), { reason: REASON_RECURSION_LIMIT, segment: command2, intent: "stop_and_explain" };
  if (program.status === "invalid") {
    let heredocIssue = program.issues.find((issue) => issue.code.includes("heredoc"));
    if (heredocIssue) {
      if (!options2.strict)
        return analyzeUnparseableCommand(command2, options2);
      let reason = `Unsupported heredoc syntax: ${heredocIssue.message}`;
      return options2.trace?.recordGlobal({ type: "error", message: reason }), { reason, segment: command2, intent: "stop_and_explain" };
    }
    return recordStrictUnparseable(command2, options2), { reason: REASON_STRICT_UNPARSEABLE, segment: command2, intent: "stop_and_explain" };
  }
  if (options2.strict && program.status === "partial")
    return recordStrictUnparseable(command2, options2), { reason: REASON_STRICT_UNPARSEABLE, segment: command2, intent: "stop_and_explain" };
  if (program.issues.some((issue) => issue.code.includes("quote")) && !options2.analyzePartialProgram)
    return analyzeUnparseableCommand(command2, options2);
  let originalCwd = options2.cwd, effectiveCwd = options2.effectiveCwd !== void 0 ? options2.effectiveCwd : options2.cwd, shellGitContextState = createShellGitContextEnvState(options2.envAssignments);
  return analyzeProgram(program, depth, options2, originalCwd, [
    {
      effectiveCwd,
      shellGitContextState,
      literalHeredocFiles: new Map(options2.literalHeredocFiles)
    }
  ]).result;
}
function analyzeProgram(program, depth, options2, originalCwd, initialStates) {
  let states = [...initialStates], conditionalStates, previousConnector;
  for (let [nodeIndex, node] of program.nodes.entries()) {
    if (node.kind === "connector") {
      previousConnector = node.operator;
      continue;
    }
    let nextNode = program.nodes[nodeIndex + 1], nextConnector = nextNode?.kind === "connector" ? nextNode.operator : void 0, isolated = isAnalysisNodeIsolated(program, nodeIndex, node, previousConnector, nextConnector), conditional = previousConnector === "&&" || previousConnector === "||", priorConditionalStates = conditional ? conditionalStates : void 0, executionStates = previousConnector === "&&" ? priorConditionalStates?.success ?? states : previousConnector === "||" ? priorConditionalStates?.failure ?? states : states, skippedSuccessStates = previousConnector === "||" ? priorConditionalStates?.success ?? [] : [], skippedFailureStates = previousConnector === "&&" ? priorConditionalStates?.failure ?? [] : [], tracksCommandOutcome = conditional || isConditionalConnector(nextConnector);
    if (node.kind === "group") {
      let successStates2 = [], failureStates2 = [];
      for (let state of executionStates) {
        let analysis = analyzeProgram(node.body, depth, options2, originalCwd, [
          cloneAnalysisState(state)
        ]);
        if (analysis.result)
          return analysis;
        if (successStates2.push(...getSuccessfulAnalysisStates(state, analysis.states, isolated, nextConnector === "&", isConditionalConnector(nextConnector))), tracksCommandOutcome)
          failureStates2.push(state, ...isolated ? analysis.states.map((nextState) => isolateFilesystemState(state, nextState)) : analysis.states);
      }
      let next2 = finishControlFlowStep(successStates2, failureStates2, skippedSuccessStates, skippedFailureStates, previousConnector, nextConnector);
      states = next2.states, conditionalStates = next2.conditionalStates, previousConnector = void 0;
      continue;
    }
    if (node.kind !== "command")
      continue;
    let segmentIndex = options2.trace?.flattenNested ? options2.trace.currentSegmentIndex : options2.trace?.allocateSegment(), pipelineSource = program.nodes[nodeIndex - 2], literalShellInput = isPipelineConnector(previousConnector) && pipelineSource?.kind === "command" ? extractLiteralPrintfOutput(pipelineSource) ?? extractLiteralPowerShellPipelineOutput(pipelineSource) : void 0, successStates = [], failureStates = [];
    for (let state of executionStates) {
      let nestedAnalysis = analyzeCommandNestedPrograms(program, nodeIndex, node, depth, options2, originalCwd, [cloneAnalysisState(state)]);
      if (nestedAnalysis.result)
        return { result: nestedAnalysis.result, states };
      let commandStates = program.dialect === "powershell" ? nestedAnalysis.states : nestedAnalysis.states.map((nestedState) => isolateFilesystemState(state, nestedState));
      for (let commandState of commandStates) {
        let analyzedState = cloneAnalysisState(commandState), result = analyzeCommandView(node, depth, options2.trace ? { ...options2, trace: withTraceSegment(options2.trace, segmentIndex) } : options2, originalCwd, analyzedState, isPipelineConnector(previousConnector), literalShellInput);
        if (result)
          return { result, states };
        if (successStates.push(...getSuccessfulAnalysisStates(state, [analyzedState], isolated, nextConnector === "&", isConditionalConnector(nextConnector))), tracksCommandOutcome)
          failureStates.push(state), failureStates.push(isolated ? isolateFilesystemState(state, analyzedState) : analyzedState);
      }
    }
    let next = finishControlFlowStep(successStates, failureStates, skippedSuccessStates, skippedFailureStates, previousConnector, nextConnector);
    states = next.states, conditionalStates = next.conditionalStates, previousConnector = void 0;
  }
  return { result: null, states };
}
function isAnalysisNodeIsolated(program, nodeIndex, node, previousConnector, nextConnector) {
  if (node.kind === "group" && node.style === "subshell")
    return !0;
  if (program.dialect === "posix" && (isPipelineConnector(previousConnector) || isPipelineConnector(nextConnector)))
    return !0;
  if (nextConnector === "&")
    return !0;
  return program.dialect === "powershell" && node.kind === "group" && node.style === "brace" && powerShellBraceStateIsIsolated(program, nodeIndex);
}
function getSuccessfulAnalysisStates(initialState, analyzedStates, isolated, background, retainInitialFilesystemState) {
  let completedStates = isolated ? analyzedStates.map((state) => isolateFilesystemState(initialState, state)) : [...analyzedStates], filesystemStates = retainInitialFilesystemState ? completedStates.flatMap((state) => optionalMapsEqual(initialState.literalHeredocFiles, state.literalHeredocFiles) ? [state] : [
    {
      ...state,
      literalHeredocFiles: new Map(initialState.literalHeredocFiles)
    },
    state
  ]) : completedStates;
  return background ? [initialState, ...filesystemStates] : filesystemStates;
}
function isolateFilesystemState(initialState, analyzedState) {
  return {
    ...initialState,
    literalHeredocFiles: new Map(analyzedState.literalHeredocFiles)
  };
}
function powerShellBraceStateIsIsolated(program, nodeIndex) {
  let header = [...program.nodes.slice(0, nodeIndex)].reverse().find((node) => node.kind === "command" || node.kind === "connector");
  if (!header || header.kind !== "command")
    return !0;
  let head = header.words[0]?.text.toLowerCase();
  if (head === "&" || head === ".")
    return !1;
  if (head === "write-output" || head === "function" || head === "start-job")
    return !0;
  if (getPowerShellScriptBlockAssignmentName(header))
    return !0;
  return header.source.replaceAll(/\s/g, "").toLowerCase() === "if($false)";
}
function isPipelineConnector(connector2) {
  return connector2 === "|" || connector2 === "|&";
}
function extractLiteralPowerShellPipelineOutput(command2) {
  if (command2?.dialect !== "powershell")
    return;
  if (command2.words.length === 1 && command2.words[0]?.quoted && command2.words[0].provenance === "literal")
    return command2.words[0].text;
  if (command2.words[0]?.text.toLowerCase() === "write-output" && command2.words.length === 2 && command2.words[1]?.provenance === "literal")
    return command2.words[1].text;
  return;
}
function isConditionalConnector(connector2) {
  return connector2 === "&&" || connector2 === "||";
}
function finishControlFlowStep(successStates, failureStates, skippedSuccessStates, skippedFailureStates, previousConnector, nextConnector) {
  let outcomes = {
    success: deduplicateAnalysisStates([...skippedSuccessStates, ...successStates]),
    failure: deduplicateAnalysisStates([...skippedFailureStates, ...failureStates])
  }, conditionalStates = isConditionalConnector(nextConnector) ? outcomes : void 0;
  return {
    states: isConditionalConnector(previousConnector) || conditionalStates ? deduplicateAnalysisStates([...outcomes.success, ...outcomes.failure]) : outcomes.success,
    conditionalStates
  };
}
function withTraceSegment(trace, currentSegmentIndex, flattenNested = trace.flattenNested) {
  return {
    currentSegmentIndex,
    flattenNested,
    allocateSegment: trace.allocateSegment,
    getNextSegmentIndex: trace.getNextSegmentIndex,
    recordGlobal: trace.recordGlobal,
    recordSegment: (step, segmentIndex = currentSegmentIndex) => trace.recordSegment(step, segmentIndex)
  };
}
function analyzeCommandNestedPrograms(containingProgram, nodeIndex, commandView, depth, options2, originalCwd, initialStates) {
  let programs = commandView.nested.map((program) => ({
    program,
    depth
  }));
  if (commandView.dialect === "powershell") {
    let invokedScriptBlock = getInvokedPowerShellScriptBlock(containingProgram, nodeIndex, commandView);
    if (invokedScriptBlock)
      programs.push({ program: invokedScriptBlock, depth });
    let recoveredSource = getRecoveredPowerShellExpressionSource(containingProgram, nodeIndex, commandView);
    if (recoveredSource)
      programs.push({ program: parseCommand(recoveredSource, "powershell"), depth });
    let evaluatedSource = getLiteralPowerShellEvaluationSource(commandView);
    if (evaluatedSource) {
      if (depth + 1 >= MAX_RECURSION_DEPTH)
        return recursionLimitAnalysis(evaluatedSource, options2, initialStates);
      let evaluatedProgram = parseCommand(evaluatedSource, "powershell");
      if (evaluatedProgram.status === "limited")
        return recursionLimitAnalysis(evaluatedSource, options2, initialStates);
      if (evaluatedProgram.status !== "complete")
        return analyzeNestedPrograms(programs, options2, originalCwd, initialStates);
      reserveDerivedCommandTokens(options2.derivedCommandWorkBudget, countCommandProgramWords(evaluatedProgram)), programs.push({ program: evaluatedProgram, depth: depth + 1 });
    }
  }
  return analyzeNestedPrograms(programs, options2, originalCwd, initialStates);
}
function getInvokedPowerShellScriptBlock(containingProgram, nodeIndex, commandView) {
  let operator = commandView.words[0], variable = commandView.words[1];
  if (commandView.words.length !== 2 || operator?.provenance !== "literal" || operator.quoted || operator.raw !== operator.text || operator.text !== "&" && operator.text !== "." || variable?.provenance !== "variable")
    return;
  let variableName = variable.text.toLowerCase();
  for (let index = nodeIndex - 1;index >= 0; index--) {
    let candidate = containingProgram.nodes[index];
    if (candidate?.kind !== "command")
      continue;
    if (candidate.words[0]?.text.toLowerCase() !== variableName)
      continue;
    if (getPowerShellScriptBlockAssignmentName(candidate) !== variableName)
      return;
    let scriptBlock = containingProgram.nodes[index + 1];
    return scriptBlock?.kind === "group" && scriptBlock.style === "brace" ? scriptBlock.body : void 0;
  }
  return;
}
function getPowerShellScriptBlockAssignmentName(commandView) {
  let variable = commandView.words[0];
  return variable?.provenance === "variable" && commandView.words.at(-1)?.text === "=" ? variable.text.toLowerCase() : void 0;
}
function analyzeNestedPrograms(programs, options2, originalCwd, initialStates) {
  let states = [...initialStates];
  for (let target of programs) {
    let nextStates = [];
    for (let state of states) {
      let analysis = analyzeProgram(target.program, target.depth, options2, originalCwd, [
        cloneAnalysisState(state)
      ]);
      if (analysis.result)
        return analysis;
      nextStates.push(...analysis.states);
    }
    states = deduplicateAnalysisStates(nextStates);
  }
  return { result: null, states };
}
function getRecoveredPowerShellExpressionSource(containingProgram, nodeIndex, commandView) {
  let nextNode = containingProgram.nodes[nodeIndex + 1];
  if (containingProgram.status !== "partial" || commandView.nested.length > 0 || nextNode?.kind !== "unknown" || nextNode.source !== ")")
    return;
  return (/^\s*\[void\]\(\s*(.+)$/i.exec(commandView.source)?.[1] ?? /^\s*@\{[^{}=]+\s*=\s*\(\s*(.+)$/i.exec(commandView.source)?.[1])?.trim();
}
function getLiteralPowerShellEvaluationSource(commandView) {
  let invoked = commandView.words[0]?.provenance === "literal" && !commandView.words[0].quoted && commandView.words[0].raw === commandView.words[0].text && (commandView.words[0].text === "&" || commandView.words[0].text === "."), commandIndex = invoked ? 1 : 0, command2 = commandView.words[commandIndex];
  if (command2?.provenance !== "literal" || !invoked && (command2.quoted || command2.raw !== command2.text) || !["iex", "invoke-expression"].includes(command2.text.toLowerCase()))
    return;
  let args = commandView.words.slice(commandIndex + 1), sourceIndex = args[0] && !args[0].quoted && args[0].raw === args[0].text && ["-c", "-command"].includes(args[0].text.toLowerCase()) ? 1 : 0, source = args[sourceIndex];
  return args.length === sourceIndex + 1 && source?.quoted && source.provenance === "literal" ? source.text : void 0;
}
function countCommandProgramWords(program) {
  return program.nodes.reduce((count, node) => count + (node.kind === "command" ? node.words.length + node.nested.reduce((sum, nested) => sum + countCommandProgramWords(nested), 0) : node.kind === "group" ? countCommandProgramWords(node.body) : 0), 0);
}
function recursionLimitAnalysis(segment, options2, states) {
  return options2.trace?.recordSegment({ type: "error", message: REASON_RECURSION_LIMIT }), {
    result: {
      reason: REASON_RECURSION_LIMIT,
      segment,
      intent: "stop_and_explain"
    },
    states: [...states]
  };
}
function analyzeCommandView(commandView, depth, options2, originalCwd, state, hasPipelineInput, literalShellInput) {
  let heredocReason = getHeredocReason(commandView);
  if (heredocReason && options2.strict)
    return options2.trace?.recordSegment({ type: "error", message: heredocReason }), {
      reason: heredocReason,
      segment: commandView.source,
      intent: "stop_and_explain"
    };
  invalidateLiteralHeredocFiles(commandView, state, "before-consumer");
  let segment = [...commandView.analysisTokens], segmentStr = commandView.legacyNormalized, segmentEnvAssignments = getSegmentGitContextEnvAssignments(segment, state.shellGitContextState);
  if (commandView.dialect === "powershell" && !options2.invalidReason && (options2.compatibility !== "explain-legacy" || options2.policySnapshot.state === "ready")) {
    let match = filterDestructiveCommandMatch(analyzePowerShellCommandViewMatch(commandView, hasPipelineInput, getPowerShellRemoveItemOptions(options2, state.effectiveCwd)), options2.policy);
    if (options2.trace?.recordSegment({
      type: "rule-check",
      ruleModule: "analyze/powershell/remove-item.ts",
      ruleFunction: "analyzePowerShellCommandViewMatch",
      matched: !!match,
      reason: match?.reason
    }), match)
      return resultFromCommandMatch(segmentStr, match);
  }
  if (segment.length === 1 && segment[0]?.includes(" ") && !commandView.dynamicExecutable) {
    let dangerousTextMatch = dangerousInTextMatch(segment[0], options2.scanWork), textMatch = options2.compatibility === "explain-legacy" ? dangerousTextMatch : filterDestructiveCommandMatch(dangerousTextMatch, options2.policy);
    if (textMatch)
      return options2.trace?.recordSegment({
        type: "dangerous-text",
        token: segment[0],
        matched: !0,
        reason: textMatch.reason
      }), {
        reason: textMatch.reason,
        segment: options2.compatibility === "explain-legacy" ? segment.join(" ") : segmentStr,
        ruleId: textMatch.id,
        intent: textMatch.intent
      };
    options2.trace?.recordSegment({ type: "dangerous-text", token: segment[0], matched: !1 });
    let heredocResult2 = analyzeUnsupportedHeredoc(commandView, heredocReason, depth, state, segmentEnvAssignments ?? /* @__PURE__ */ new Map, options2);
    if (heredocResult2)
      return heredocResult2;
    return invalidateLiteralHeredocFiles(commandView, state, "after-consumer"), state.literalHeredocFiles.clear(), trackLiteralHeredocFiles(commandView, heredocReason, state), updateCwdAfterCommandView(commandView, state, literalShellInput, options2.trace), null;
  }
  let result = analyzeSegment(segment, depth, {
    ...options2,
    commandView,
    cwd: originalCwd,
    effectiveCwd: state.effectiveCwd,
    envAssignments: segmentEnvAssignments,
    literalHeredocFiles: state.literalHeredocFiles,
    hasPipelineInput,
    literalShellInput,
    analyzeNested: (nestedCommand, overrides) => {
      let nestedEffectiveCwd = overrides && Object.hasOwn(overrides, "effectiveCwd") ? overrides.effectiveCwd : state.effectiveCwd, nestedResult = analyzeCommandInternal(nestedCommand, depth + 1, {
        ...options2,
        derivedCommandWorkBudget: options2.derivedCommandWorkBudget,
        effectiveCwd: nestedEffectiveCwd,
        envAssignments: overrides?.envAssignments ?? segmentEnvAssignments,
        literalHeredocFiles: state.literalHeredocFiles,
        worktreeMode: overrides?.worktreeMode ?? options2.worktreeMode,
        trace: options2.trace ? withTraceSegment(options2.trace, options2.trace.currentSegmentIndex, !0) : void 0
      });
      return nestedResult ? {
        reason: nestedResult.reason,
        ruleId: nestedResult.ruleId,
        intent: nestedResult.intent,
        manualPermissionAdvice: nestedResult.manualPermissionAdvice
      } : null;
    }
  });
  if (result)
    return { ...result, segment: segmentStr };
  let heredocResult = analyzeUnsupportedHeredoc(commandView, heredocReason, depth, state, segmentEnvAssignments ?? /* @__PURE__ */ new Map, options2);
  if (heredocResult)
    return heredocResult;
  return invalidateLiteralHeredocFiles(commandView, state, "after-consumer"), state.literalHeredocFiles.clear(), trackLiteralHeredocFiles(commandView, heredocReason, state), updateCwdAfterCommandView(commandView, state, literalShellInput, options2.trace), applyShellGitContextEnvSegment(segment, state.shellGitContextState), null;
}
var FILE_NONTRUNCATING_WRITE_REDIRECTIONS = /* @__PURE__ */ new Set([">>", "<>"]);
function invalidateLiteralHeredocFiles(commandView, state, phase) {
  for (let redirection of commandView.redirections) {
    if (!(phase === "before-consumer" ? isTruncatingFileRedirection(redirection) : FILE_NONTRUNCATING_WRITE_REDIRECTIONS.has(redirection.operator)))
      continue;
    invalidateLiteralHeredocFile(redirection.target, state);
  }
  if (phase !== "before-consumer" || !isBareCommandWord(commandView.words[0], "tee"))
    return;
  let teeArguments = getTeeArguments(commandView.words.slice(1));
  if (!teeArguments)
    return;
  for (let operand of teeArguments.operands)
    invalidateLiteralHeredocFile(operand, state);
}
function isTruncatingFileRedirection(redirection) {
  if (redirection.operator === ">" || redirection.operator === ">|")
    return !0;
  return redirection.operator === ">&" && redirection.fd === void 0 && redirection.target?.provenance === "literal" && !/^(?:[0-9]+|-)$/.test(redirection.target.text);
}
function invalidateLiteralHeredocFile(target, state) {
  let path = target?.provenance === "literal" ? resolveTrackedHeredocPath(target.text, state.effectiveCwd) : void 0;
  if (!path)
    return;
  state.literalHeredocFiles.delete(path);
}
function trackLiteralHeredocFiles(commandView, heredocReason, state) {
  if (heredocReason)
    return;
  let heredoc = commandView.redirections.find((redirection) => redirection.operator === "<<" || redirection.operator === "<<-")?.heredoc;
  if (!heredoc?.quotedDelimiter)
    return;
  for (let target of getLiteralHeredocOutputTargets(commandView)) {
    let path = resolveTrackedHeredocPath(target.text, state.effectiveCwd);
    if (!path || !isPersistentHeredocFilePath(path))
      continue;
    if (!state.literalHeredocFiles.has(path) && state.literalHeredocFiles.size >= MAX_TRACKED_HEREDOC_FILES)
      throw new DerivedCommandWorkLimitError;
    state.literalHeredocFiles.set(path, heredoc.body);
  }
}
function getLiteralHeredocOutputTargets(commandView) {
  let stdoutTarget = getFinalStdoutRedirection(commandView.redirections)?.target, literalStdoutTarget = isTrackableLiteralFileWord(stdoutTarget) ? [stdoutTarget] : [];
  if (isBareCommandWord(commandView.words[0], "cat"))
    return catWritesHeredocVerbatim(commandView.words) ? literalStdoutTarget : [];
  if (!isBareCommandWord(commandView.words[0], "tee"))
    return [];
  let teeArguments = getTeeArguments(commandView.words.slice(1));
  if (!teeArguments || teeArguments.append || teeArguments.hasUnsupportedOptions || !teeArguments.operands.every(isTrackableLiteralFileWord))
    return [];
  return [...teeArguments.operands, ...literalStdoutTarget];
}
function catWritesHeredocVerbatim(words) {
  let optionTerminated = !1;
  for (let word of words.slice(1)) {
    if (optionTerminated || word.provenance !== "literal")
      return !1;
    if (word.text === "--") {
      optionTerminated = !0;
      continue;
    }
    if (!/^-u+$/.test(word.text))
      return !1;
  }
  return !0;
}
function getFinalStdoutRedirection(redirections) {
  let redirection = redirections.findLast((candidate) => (candidate.fd ?? ([">", ">|", ">>", ">&"].includes(candidate.operator) ? 1 : 0)) === 1);
  return redirection?.operator === ">" || redirection?.operator === ">|" ? redirection : void 0;
}
function getTeeArguments(words) {
  let operands = [], parsesOptions = !0, append = !1, hasUnsupportedOptions = !1;
  for (let word of words) {
    if (word.provenance !== "literal")
      return;
    if (parsesOptions && isBareCommandWord(word, "--")) {
      parsesOptions = !1;
      continue;
    }
    if (parsesOptions && !word.quoted && word.raw === word.text && /^-[^-]/.test(word.text)) {
      append ||= word.text.slice(1).includes("a"), hasUnsupportedOptions ||= [...word.text.slice(1)].some((option) => option !== "a" && option !== "i");
      continue;
    }
    if (parsesOptions && !word.quoted && word.raw === word.text && word.text.startsWith("--")) {
      append ||= word.text === "--append", hasUnsupportedOptions ||= word.text !== "--append" && word.text !== "--ignore-interrupts";
      continue;
    }
    operands.push(word);
  }
  return { operands, append, hasUnsupportedOptions };
}
function isTrackableLiteralFileWord(word) {
  if (!word || word.provenance !== "literal" || word.text.length === 0)
    return !1;
  if (word.quoted || word.raw !== word.text)
    return !0;
  return !word.raw.startsWith("~") && !/[{}]/.test(word.raw);
}
function isBareCommandWord(word, value) {
  return word?.text === value && word.raw === value && word.provenance === "literal" && !word.quoted;
}
function getHeredocReason(commandView) {
  let heredocs = commandView.redirections.filter((redirection) => redirection.operator === "<<" || redirection.operator === "<<-");
  if (heredocs.length === 0)
    return;
  if (heredocs.length !== 1)
    return REASON_UNSUPPORTED_HEREDOC;
  let heredoc = heredocs[0];
  if (!heredoc?.heredoc)
    return REASON_UNSUPPORTED_HEREDOC;
  if (!heredoc.heredoc.quotedDelimiter)
    return REASON_UNQUOTED_HEREDOC;
  if (heredoc.fd !== void 0 && heredoc.fd !== 0)
    return REASON_UNSUPPORTED_HEREDOC;
  if (commandView.redirections.some((redirection) => redirection !== heredoc && ["<", "<<", "<<-", "<<<", "<&", "<>"].includes(redirection.operator)))
    return REASON_UNSUPPORTED_HEREDOC;
  let outputProcessSubstitution = commandView.redirections.some((redirection) => redirection !== heredoc && hasOutputProcessSubstitution(redirection.target));
  if (isBareCommandWord(commandView.words[0], "cat"))
    return outputProcessSubstitution ? REASON_UNSUPPORTED_HEREDOC : void 0;
  if (isBareCommandWord(commandView.words[0], "tee"))
    return outputProcessSubstitution || commandView.words.slice(1).some(hasOutputProcessSubstitution) ? REASON_UNSUPPORTED_HEREDOC : void 0;
  if (isBareCommandWord(commandView.words[0], "git") && isBareCommandWord(commandView.words[1], "apply"))
    return;
  return REASON_UNSUPPORTED_HEREDOC;
}
function hasOutputProcessSubstitution(word) {
  return word?.parts.some((part) => part.provenance === "command-substitution" && part.raw.startsWith(">(")) ?? !1;
}
function analyzeUnsupportedHeredoc(commandView, reason, depth, state, envAssignments, options2) {
  if (!reason)
    return null;
  let heredocs = commandView.redirections.filter((redirection) => redirection.operator === "<<" || redirection.operator === "<<-"), bodies = heredocs.flatMap((redirection) => redirection.heredoc ? [redirection.heredoc.body] : []), shellHeredoc = getQuotedShellHeredoc(commandView, heredocs, state, envAssignments);
  if (shellHeredoc?.kind === "inert")
    return null;
  if (shellHeredoc?.kind === "source") {
    reserveDerivedCommandTokens(options2.derivedCommandWorkBudget, 1), options2.trace?.recordSegment({
      type: "recurse",
      reason: "shell-heredoc",
      innerCommand: shellHeredoc.body,
      depth: depth + 1
    });
    let result2 = analyzeCommandInternal(shellHeredoc.body, depth + 1, {
      ...options2,
      effectiveCwd: shellHeredoc.effectiveCwd,
      envAssignments: shellHeredoc.envAssignments,
      literalHeredocFiles: state.literalHeredocFiles,
      trace: options2.trace ? withTraceSegment(options2.trace, options2.trace.currentSegmentIndex, !0) : void 0
    });
    return result2 ? { ...result2, segment: commandView.legacyNormalized } : null;
  }
  let result = analyzeUnparseableCommand(bodies.length === heredocs.length ? bodies.join(`
`) : commandView.source, options2);
  return result ? { ...result, segment: commandView.legacyNormalized } : null;
}
function getQuotedShellHeredoc(commandView, heredocs, state, envAssignments) {
  let heredoc = heredocs.length === 1 ? heredocs[0] : void 0;
  if (!heredoc?.heredoc?.quotedDelimiter || heredoc.fd !== void 0 && heredoc.fd !== 0)
    return;
  let stripped = stripWrappersWithInfo([...commandView.analysisTokens], state.effectiveCwd, envAssignments), head = normalizeCommandToken(stripped.tokens[0] ?? "");
  if (stripped.unverifiableEnvSplit || !SHELL_WRAPPERS.has(head) && !SHELL_WRAPPERS.has(getBasename(head)))
    return;
  if (isShellSyntaxCheck(stripped.tokens))
    return { kind: "inert" };
  if (extractDashCArg(stripped.tokens) !== null || extractShellScriptOperandSource(stripped.tokens, void 0).kind !== "none")
    return;
  return;
}
function updateCwdAfterCommandView(commandView, state, literalPipelineInput, trace) {
  let nextCwd = resolveCwdAfterCommandView(commandView, state.effectiveCwd, literalPipelineInput);
  if (nextCwd === null)
    trace?.recordSegment({
      type: "cwd-change",
      segment: commandView.analysisTokens.join(" "),
      effectiveCwdNowUnknown: !0
    });
  if (nextCwd !== void 0)
    state.effectiveCwd = nextCwd;
}
function cloneAnalysisState(state) {
  return {
    effectiveCwd: state.effectiveCwd,
    shellGitContextState: cloneShellGitContextEnvState(state.shellGitContextState),
    literalHeredocFiles: new Map(state.literalHeredocFiles)
  };
}
function deduplicateAnalysisStates(states) {
  let uniqueStates = [];
  for (let state of states) {
    if (!uniqueStates.some((candidate) => analysisStatesEqual(candidate, state)))
      uniqueStates.push(state);
    if (uniqueStates.length > MAX_CONTROL_FLOW_STATES)
      throw new DerivedCommandWorkLimitError;
  }
  return uniqueStates;
}
function analysisStatesEqual(left, right) {
  return left.effectiveCwd === right.effectiveCwd && optionalMapsEqual(left.literalHeredocFiles, right.literalHeredocFiles) && optionalMapsEqual(left.shellGitContextState.effectiveEnvAssignments, right.shellGitContextState.effectiveEnvAssignments) && optionalMapsEqual(left.shellGitContextState.shellAssignments, right.shellGitContextState.shellAssignments) && setsEqual(left.shellGitContextState.exportedNames, right.shellGitContextState.exportedNames) && left.shellGitContextState.allexport === right.shellGitContextState.allexport && left.shellGitContextState.keywordExport === right.shellGitContextState.keywordExport;
}
function optionalMapsEqual(left, right) {
  if (left === right)
    return !0;
  if (!left || !right || left.size !== right.size)
    return !1;
  return [...left].every(([key, value]) => right.get(key) === value && right.has(key));
}
function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
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
function getPowerShellRemoveItemOptions(options2, effectiveCwd = options2.effectiveCwd) {
  let cwdUnknown = effectiveCwd === null;
  return {
    cwd: cwdUnknown ? void 0 : effectiveCwd ?? options2.cwd,
    originalCwd: cwdUnknown ? void 0 : options2.cwd,
    strict: options2.strict,
    paranoid: options2.paranoidRm,
    allowTmpdirVar: options2.allowTmpdirVar,
    policy: options2.policy
  };
}
function analyzeUnparseableCommand(command2, options2) {
  let dangerousTextMatch = dangerousInTextMatch(command2, options2.scanWork), textMatch = options2.compatibility === "explain-legacy" ? dangerousTextMatch : filterDestructiveCommandMatch(dangerousTextMatch, options2.policy), segmentIndex = options2.trace?.currentSegmentIndex ?? options2.trace?.allocateSegment(), step = {
    type: "dangerous-text",
    token: command2,
    matched: !!textMatch,
    reason: textMatch?.reason
  };
  if (options2.trace?.recordSegment(step, segmentIndex), !textMatch && /^(?:cd|pushd)\s/.test(command2))
    options2.trace?.recordSegment({ type: "cwd-change", segment: command2, effectiveCwdNowUnknown: !0 }, segmentIndex);
  return textMatch ? {
    reason: textMatch.reason,
    segment: command2,
    ruleId: textMatch.id,
    intent: textMatch.intent
  } : null;
}
function recordStrictUnparseable(command2, options2) {
  let step = {
    type: "strict-unparseable",
    rawCommand: command2,
    reason: REASON_STRICT_UNPARSEABLE
  };
  if (options2.trace?.currentSegmentIndex === void 0)
    options2.trace?.recordGlobal(step);
  else
    options2.trace.recordSegment(step);
}
function isFailClosedRepairCommand(program) {
  if (program.status !== "complete" || program.nodes.length !== 1)
    return !1;
  let command2 = program.nodes[0];
  if (command2?.kind !== "command")
    return !1;
  if (command2.redirections.length > 0 || command2.nested.length > 0)
    return !1;
  if (command2.words.some((word) => word.provenance !== "literal"))
    return !1;
  let tokens = command2.tokens;
  if (tokens.some((token) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)))
    return !1;
  if (tokens[0] === "cc-safety-net")
    return tokens[1] === "rule" && isRuleSyncArgs(tokens.slice(2));
  if (tokens[0] === "npx")
    return (tokens[1] === "-y" || tokens[1] === "--yes") && isPackageRuleSyncRepair(tokens, 2);
  if (tokens[0] === "bunx" || tokens[0] === "pnpx")
    return isPackageRuleSyncRepair(tokens, 1);
  if ((tokens[0] === "pnpm" || tokens[0] === "yarn") && tokens[1] === "dlx")
    return isPackageRuleSyncRepair(tokens, 2);
  return !1;
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

// src/core/analyze/policy-context.ts
function resolveCommandAnalysisContext(options2) {
  let modes = options2.effectiveCapabilities ? void 0 : getCCSafetyNetEnvModes(options2.policySnapshot.policy), capabilities = options2.effectiveCapabilities ?? modes?.capabilities;
  if (!capabilities)
    throw Error("Effective safety capabilities could not be resolved.");
  let strict = options2.strict ?? capabilities.fail_closed.enabled, paranoidRm = options2.paranoidRm ?? capabilities.paranoid_rm.enabled, paranoidInterpreters = options2.paranoidInterpreters ?? capabilities.paranoid_interpreters.enabled, effectiveCapabilities = {
    fail_closed: applyAnalysisOverride(capabilities.fail_closed, options2.strict, "strict"),
    paranoid_rm: applyAnalysisOverride(capabilities.paranoid_rm, options2.paranoidRm, "paranoidRm"),
    paranoid_interpreters: applyAnalysisOverride(capabilities.paranoid_interpreters, options2.paranoidInterpreters, "paranoidInterpreters")
  };
  return {
    policy: createCommandAnalysisPolicy(options2.policySnapshot.policy, effectiveCapabilities),
    effectiveCapabilities,
    effectiveLevel: deriveEffectiveSafetyLevel({
      failClosed: strict,
      paranoidRm,
      paranoidInterpreters
    }),
    strict,
    paranoidRm,
    paranoidInterpreters,
    worktreeMode: options2.worktreeMode ?? modes?.worktreeMode ?? !1
  };
}
function applyAnalysisOverride(capability, override, option) {
  if (override === void 0 || override === capability.enabled)
    return capability;
  return {
    enabled: override,
    source: "capability_override",
    sources: [...capability.sources, `analysis options.${option}`]
  };
}

// src/core/analyze/index.ts
function analyzeCommand(command2, options2) {
  return analyzeCommandWithProgram(command2, options2);
}
function analyzeCommandWithProgram(command2, options2, program, factStore) {
  return analyzeCommandInternal(command2, 0, {
    ...options2,
    ...resolveCommandAnalysisContext(options2),
    invalidReason: options2.policySnapshot.state === "invalid" ? options2.policySnapshot.reason : void 0,
    factStore
  }, program);
}

// src/core/policy-protection.ts
import { homedir as homedir5 } from "node:os";
import { dirname as dirname10, isAbsolute as isAbsolute13, normalize as normalize5, resolve as resolve10 } from "node:path";
var REASON_POLICY_CONFIG_PROTECTION = "Policy config is protected and you must not modify it.", READ_ONLY_TOOLS = /* @__PURE__ */ new Set([
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
]), READ_ONLY_COMMANDS = /* @__PURE__ */ new Set([
  "[",
  "cat",
  "file",
  "grep",
  "head",
  "jq",
  "less",
  "ls",
  "more",
  "rg",
  "sed",
  "stat",
  "tail",
  "test",
  "wc"
]), MV_OPTIONS_WITH_VALUES = /* @__PURE__ */ new Set(["-S", "-t", "--suffix", "--target-directory"]);
function findPolicyConfigMutationTargetInSemanticFacts(facts) {
  let budget = createPathCanonicalizationBudget(), identity = createPolicyPathIdentity(facts.invocation.context.executionCwd, budget);
  if (facts.invocation.route.kind === "patch")
    return findPolicyConfigMutationTargetInPaths(facts.paths.map((path) => path.raw), !1, facts.invocation.context.executionCwd, identity, budget);
  let command2 = getCommandSyntaxFact(facts, "input-candidate");
  if (facts.invocation.route.kind === "command")
    return command2 ? findPolicyConfigMutationTargetInCommand(command2.shell, facts.invocation.context.executionCwd, identity, budget) : null;
  if (facts.invocation.route.kind === "unknown" && command2) {
    let target = findPolicyConfigMutationTargetInCommand(command2.shell, facts.invocation.context.executionCwd, identity, budget);
    if (target)
      return target;
  }
  return findPolicyConfigMutationTargetInPaths(facts.paths.map((path) => path.raw), facts.invocation.route.kind === "grep" || facts.invocation.route.kind === "glob" || READ_ONLY_TOOLS.has(normalizeToolName(facts.invocation.toolName)), facts.invocation.context.executionCwd, identity, budget);
}
function findPolicyConfigMutationTargetInPaths(paths, readOnly, cwd, identity, budget) {
  if (readOnly)
    return null;
  let target = paths.find((path) => isPolicyFile(path, cwd, identity, budget));
  return target ? { target } : null;
}
function findPolicyConfigMutationTargetInCommand(syntax, cwd, identity, budget) {
  if (syntax.status === "structural-limit")
    throw new StructuralShellSyntaxLimitError;
  if (syntax.status !== "complete")
    return findPolicyConfigTargetInMalformedText(syntax.source, cwd, identity, budget);
  let state = { cwd, variables: /* @__PURE__ */ new Map }, segment = [];
  for (let entry of syntax.entries) {
    if (entry.kind === "operator") {
      if (!entry.boundary)
        continue;
      let target = findPolicyConfigMutationTargetInSegment(segment, state, identity, budget);
      if (target)
        return target;
      state = applyShellState(segment, state, budget), segment = [];
      continue;
    }
    if (entry.kind === "redirection") {
      if (entry.role === "file-write" && entry.target && isPolicyFile(expandShellVariables(entry.target, state.variables), state.cwd, identity, budget))
        return { target: entry.target };
      continue;
    }
    segment.push(entry.text);
  }
  return findPolicyConfigMutationTargetInSegment(segment, state, identity, budget);
}
function findPolicyConfigMutationTargetInSegment(segment, state, identity, budget) {
  if (isAssignmentOnlySegment(segment))
    return null;
  let stripped = stripWrappers([...segment]), command2 = getBasename(stripped[0] ?? "").toLowerCase(), args = stripped.slice(1);
  if (command2 === "rm" && hasRecursiveRmOption(args)) {
    let target = extractRmOperands(args).find((operand) => isPolicyDirectoryOrAncestor(expandShellVariables(operand, state.variables), state.cwd, identity, budget));
    if (target)
      return { target };
  }
  if (command2 === "mv") {
    let target = extractMvSources(args).find((source) => isPolicyFileOrDirectorySource(expandShellVariables(source, state.variables), state.cwd, identity, budget));
    if (target)
      return { target };
  }
  if (isReadOnlySegment(segment))
    return null;
  for (let token of segment)
    for (let candidate of extractDirectPathCandidates(token))
      if (isPolicyFile(expandShellVariables(candidate, state.variables), state.cwd, identity, budget))
        return { target: candidate };
  return null;
}
function hasRecursiveRmOption(args) {
  return args.some((arg) => arg === "--recursive" || arg.startsWith("-") && !arg.startsWith("--") && /[rR]/.test(arg.slice(1)));
}
function extractRmOperands(args) {
  let separator = args.indexOf("--");
  if (separator !== -1)
    return [
      ...args.slice(0, separator).filter((arg) => !arg.startsWith("-")),
      ...args.slice(separator + 1)
    ];
  return args.filter((arg) => !arg.startsWith("-"));
}
function extractMvSources(args) {
  let operands = [], targetDirectory = !1, optionsEnded = !1;
  for (let index = 0;index < args.length; index++) {
    let arg = args[index];
    if (arg === void 0)
      break;
    if (!optionsEnded && arg === "--") {
      optionsEnded = !0;
      continue;
    }
    if (!optionsEnded && MV_OPTIONS_WITH_VALUES.has(arg)) {
      targetDirectory ||= arg === "-t" || arg === "--target-directory", index++;
      continue;
    }
    if (!optionsEnded && arg.startsWith("--target-directory=")) {
      targetDirectory = !0;
      continue;
    }
    if (!optionsEnded && (arg.startsWith("--suffix=") || arg.startsWith("--backup=")))
      continue;
    if (!optionsEnded && arg.startsWith("-t") && arg.length > 2) {
      targetDirectory = !0;
      continue;
    }
    if (!optionsEnded && arg.startsWith("-"))
      continue;
    operands.push(arg);
  }
  return targetDirectory ? operands : operands.slice(0, -1);
}
function isReadOnlySegment(tokens) {
  let stripped = stripWrappers([...tokens]);
  if (stripped.length === 0)
    return !1;
  let command2 = getBasename(stripped[0] ?? "").toLowerCase();
  if (!READ_ONLY_COMMANDS.has(command2))
    return !1;
  if (command2 !== "sed")
    return !0;
  return !stripped.slice(1).some((token) => token.startsWith("-i") || token === "--in-place" || token.startsWith("--in-place="));
}
function applyShellState(segment, state, budget) {
  let variables = isAssignmentOnlySegment(segment) ? new Map([...state.variables, ...extractShellAssignments(segment, state.variables)]) : state.variables, stripped = stripWrappers([...segment]), target = getBasename(stripped[0] ?? "").toLowerCase() === "cd" ? stripped[1] : void 0;
  return {
    cwd: !target || target === "-" ? state.cwd : normalizePolicyCandidatePath(expandShellVariables(target, variables), state.cwd, budget),
    variables
  };
}
function extractShellAssignments(segment, variables) {
  return segment.flatMap((token) => {
    let assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(token);
    return assignment?.[1] !== void 0 && assignment[2] !== void 0 ? [[assignment[1], expandShellVariables(assignment[2], variables)]] : [];
  });
}
function expandShellVariables(text, variables) {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-+])([^}]*)\}/g, (match, name, operator, word) => {
    let value = variables.get(name);
    if (value === void 0)
      return match;
    let usable = operator.startsWith(":") ? value !== "" : !0;
    if (operator.endsWith("-"))
      return usable ? value : expandShellVariables(word, variables);
    return usable ? expandShellVariables(word, variables) : "";
  }).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => variables.get(name) ?? match).replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => variables.get(name) ?? match);
}
function isAssignmentOnlySegment(tokens) {
  return tokens.length > 0 && tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
}
function findPolicyConfigTargetInMalformedText(text, cwd, identity, budget) {
  for (let token of text.split(/\s+/))
    for (let candidate of extractDirectPathCandidates(token))
      if (isPolicyFile(candidate, cwd, identity, budget))
        return { target: candidate };
  return null;
}
function extractDirectPathCandidates(value) {
  let cleaned = value.trim().replace(/^['"]|['"]$/g, ""), separator = cleaned.indexOf("=");
  return separator === -1 || separator === cleaned.length - 1 ? [cleaned] : [cleaned, cleaned.slice(separator + 1)];
}
function createPolicyPathIdentity(cwd, budget) {
  let file = normalizePolicyCandidatePath(getUserPolicyPath(), cwd, budget), directory = dirname10(file), directoryAndAncestors = /* @__PURE__ */ new Set;
  for (let current = directory;; current = dirname10(current))
    if (directoryAndAncestors.add(comparePath(current)), dirname10(current) === current)
      break;
  return { file: comparePath(file), directory: comparePath(directory), directoryAndAncestors };
}
function isPolicyFile(target, cwd, identity, budget) {
  return comparePath(normalizePolicyCandidatePath(target, cwd, budget)) === identity.file;
}
function isPolicyDirectoryOrAncestor(target, cwd, identity, budget) {
  return identity.directoryAndAncestors.has(comparePath(normalizePolicyCandidatePath(target, cwd, budget)));
}
function isPolicyFileOrDirectorySource(target, cwd, identity, budget) {
  let normalized = comparePath(normalizePolicyCandidatePath(target, cwd, budget));
  return normalized === identity.file || identity.directoryAndAncestors.has(normalized);
}
function normalizePolicyCandidatePath(target, cwd, budget) {
  let unix = expandSupportedPathEnvironmentVariables(target.trim()).replace(/\\/g, "/");
  if (!unix)
    return "";
  let expanded = unix === "~" ? homedir5() : unix.startsWith("~/") ? resolve10(homedir5(), unix.slice(2)) : unix;
  return resolveExistingPath(normalize5(isAbsolute13(expanded) ? expanded : resolve10(cwd, expanded)), budget).replace(/\\/g, "/");
}
function comparePath(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

// src/core/secret-protection.ts
import { homedir as homedir6 } from "node:os";
import { isAbsolute as isAbsolute14, resolve as resolve11 } from "node:path";
import { fileURLToPath } from "node:url";
var REASON_SECRET_PROTECTION = "Access to a sensitive path is not allowed.", NON_PATH_OPERAND_COMMANDS = /* @__PURE__ */ new Set(["echo", "printf"]), PATH_ROOT_COMMANDS = /* @__PURE__ */ new Set(["find"]), FIND_EXEC_PRIMARIES2 = /* @__PURE__ */ new Set(["-exec", "-execdir"]), FIND_EXEC_TERMINATORS = /* @__PURE__ */ new Set([";", "+"]), FIND_NON_METADATA_ACTIONS = /* @__PURE__ */ new Set([
  "-delete",
  "-exec",
  "-execdir",
  "-fls",
  "-fprint",
  "-fprint0",
  "-fprintf",
  "-ok",
  "-okdir"
]), FIND_MATCH_PATH_PRIMARIES = /* @__PURE__ */ new Set([
  "-name",
  "-iname",
  "-path",
  "-ipath",
  "-wholename",
  "-iwholename",
  "-samefile"
]), CODE_INTERPRETERS = /* @__PURE__ */ new Set([
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
]), CODE_EVAL_FLAGS = /* @__PURE__ */ new Set(["-c", "-e", "-r", "-E", "--eval", "--exec"]), CC_SAFETY_NET_ENTRYPOINTS = /* @__PURE__ */ new Set([
  "src/bin/cc-safety-net.ts",
  "dist/bin/cc-safety-net.js"
]), CLUSTERED_CODE_EVAL_FLAGS = /* @__PURE__ */ new Map([
  ["bash", /* @__PURE__ */ new Set(["c"])],
  ["sh", /* @__PURE__ */ new Set(["c"])],
  ["zsh", /* @__PURE__ */ new Set(["c"])],
  ["dash", /* @__PURE__ */ new Set(["c"])],
  ["ksh", /* @__PURE__ */ new Set(["c"])],
  ["python", /* @__PURE__ */ new Set(["c"])],
  ["python2", /* @__PURE__ */ new Set(["c"])],
  ["python3", /* @__PURE__ */ new Set(["c"])],
  ["node", /* @__PURE__ */ new Set(["e"])],
  ["deno", /* @__PURE__ */ new Set(["e"])],
  ["bun", /* @__PURE__ */ new Set(["e"])],
  ["ruby", /* @__PURE__ */ new Set(["e"])],
  ["perl", /* @__PURE__ */ new Set(["e", "E"])],
  ["php", /* @__PURE__ */ new Set(["r"])],
  ["rscript", /* @__PURE__ */ new Set(["e"])],
  ["osascript", /* @__PURE__ */ new Set(["e"])]
]), PATTERN_FIRST_COMMANDS = /* @__PURE__ */ new Set(["grep", "rg"]), PATTERN_FILE_SHORT = "f", PATTERN_FILE_LONG = "file", PATTERNLESS_FILES_LONG = "files", PATTERN_SUPPLY_SHORT = /* @__PURE__ */ new Set(["e", "f"]), PATTERN_SUPPLY_LONG = /* @__PURE__ */ new Set(["regexp", "file"]), PATTERN_ARG_SHORT = /* @__PURE__ */ new Set(["e", "f", "A", "B", "C", "m"]), PATTERN_ARG_LONG = /* @__PURE__ */ new Set([
  "regexp",
  "file",
  "after-context",
  "before-context",
  "context",
  "max-count"
]), PIPE_OPERATORS = /* @__PURE__ */ new Set(["|", "|&"]), PIPE_INPUT_PATH_MARKER = "__CC_SAFETY_NET_PIPE_INPUT__", SHELL_STDIN_INTERPRETERS = /* @__PURE__ */ new Set(["bash", "sh", "zsh", "dash", "ksh"]), PROGRAM_SELECTING_INTERPRETER_FLAGS = /* @__PURE__ */ new Map([["python", /* @__PURE__ */ new Set(["-m"])]]), VALUE_CONSUMING_INTERPRETER_FLAGS = /* @__PURE__ */ new Map([
  ["bash", /* @__PURE__ */ new Set(["-O"])],
  ["sh", /* @__PURE__ */ new Set(["-O"])],
  ["zsh", /* @__PURE__ */ new Set(["-o"])],
  ["dash", /* @__PURE__ */ new Set(["-o"])],
  ["ksh", /* @__PURE__ */ new Set(["-o"])],
  ["python", /* @__PURE__ */ new Set(["-W", "-X"])],
  ["node", /* @__PURE__ */ new Set(["-r", "--require", "--loader", "--import", "--input-type"])]
]);
function findSensitivePolicyPathTarget(targets, cwd, config, configCwd) {
  let budget = createPathCanonicalizationBudget();
  for (let target of targets) {
    if (isDeniedByPolicy(target, cwd, config, configCwd, budget))
      return { target, ruleId: "secret.deny-path" };
    let ruleId = isSensitivePath(target, cwd, config, budget);
    if (ruleId)
      return { target, ruleId };
  }
  return null;
}
function findSensitiveTargetInSemanticFacts(facts, config, options2 = {}) {
  let target = findSensitivePolicyPathTarget(extractToolPathTargets(facts), facts.invocation.context.executionCwd, config, facts.invocation.context.configCwd);
  if (target?.ruleId !== "secret.deny-path" && options2.strict === !1 && isMetadataOnlyCommand(facts))
    return null;
  return target;
}
function isMetadataOnlyCommand(facts) {
  if (facts.invocation.route.kind !== "command")
    return !1;
  let syntax = getCommandSyntaxFact(facts, "input-candidate") ?? getCommandSyntaxFact(facts, "declared-command");
  if (!syntax)
    return !1;
  if (syntax.program.nodes.some((node) => node.kind === "command" && node.nested.length > 0))
    return !1;
  let tokens = [];
  for (let entry of syntax.shell.entries) {
    if (entry.kind === "operator" && entry.boundary)
      return !1;
    if (entry.kind === "redirection")
      return !1;
    if (entry.kind !== "operator")
      tokens.push(projectSensitiveShellText(entry.text));
  }
  let stripped = stripLeadingWrappersAndEnvAssignments(tokens), commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1)
    return !1;
  let command2 = basename3(stripped[commandIndex] ?? "").toLowerCase(), args = stripped.slice(commandIndex + 1);
  if (command2 === "test")
    return args.length === 2 && (args[0] === "-e" || args[0] === "-f");
  if (command2 !== "find")
    return !1;
  return !args.some((arg) => FIND_NON_METADATA_ACTIONS.has(arg));
}
function extractToolPathTargets(facts) {
  if (facts.invocation.route.kind === "command") {
    let command3 = getCommandSyntaxFact(facts, "input-candidate");
    return command3 ? extractCommandPathTargets(command3.shell, facts.store) : [];
  }
  if (facts.invocation.route.kind !== "unknown")
    return facts.paths.map((path) => path.raw);
  let command2 = getCommandSyntaxFact(facts, "input-candidate");
  return [
    ...command2 ? extractCommandPathTargets(command2.shell, facts.store) : [],
    ...facts.paths.map((path) => path.raw)
  ];
}
function extractCommandPathTargets(syntax, store) {
  if (syntax.status === "structural-limit")
    throw new StructuralShellSyntaxLimitError;
  if (syntax.status === "unclosed-quote")
    return [];
  if (syntax.status === "invalid")
    throw Error("Unable to parse command for secret protection");
  let targets = extractCommandSubstitutionPathTargets(projectSensitiveShellText(syntax.source), store), segment = [], pipeProducer = null;
  for (let entry of syntax.entries) {
    if (entry.kind === "operator") {
      if (!entry.boundary)
        continue;
      if (segment.length > 0) {
        if (targets.push(...extractSegmentPathTargets(segment, store)), pipeProducer !== null)
          targets.push(...extractPipeCarrierPathTargets(pipeProducer, segment, store));
        pipeProducer = PIPE_OPERATORS.has(entry.operator) ? segment : null, segment = [];
      } else
        pipeProducer = null;
      continue;
    }
    if (entry.kind === "redirection") {
      let target = entry.target ? projectSensitiveShellText(entry.target) : void 0;
      if (target && entry.targetOrder === "legacy-segment")
        segment.push(target);
      else if (target)
        targets.push(target);
      continue;
    }
    segment.push(projectSensitiveShellText(entry.text));
  }
  if (segment.length > 0) {
    if (targets.push(...extractSegmentPathTargets(segment, store)), pipeProducer !== null)
      targets.push(...extractPipeCarrierPathTargets(pipeProducer, segment, store));
  }
  return targets;
}
function extractSegmentPathTargets(tokens, store) {
  let assignmentValues = extractLeadingAssignmentValues(tokens), stripped = stripLeadingWrappersAndEnvAssignments(tokens), commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1)
    return assignmentValues;
  let executable = stripped[commandIndex] ?? "", command2 = basename3(executable).toLowerCase(), post = stripped.slice(commandIndex + 1), explainTargets = extractSafetyNetExplainPathTargets(executable, command2, post);
  if (explainTargets)
    return [...assignmentValues, ...explainTargets];
  if (NON_PATH_OPERAND_COMMANDS.has(command2))
    return assignmentValues;
  if (PATTERN_FIRST_COMMANDS.has(command2))
    return [...assignmentValues, ...extractPatternCommandTargets(post)];
  if (PATH_ROOT_COMMANDS.has(command2))
    return [...assignmentValues, ...extractFindCommandTargets(post, store)];
  if (AWK_INTERPRETERS.has(command2))
    return [...assignmentValues, ...extractAwkPathTargets(post, store)];
  if (isCodeInterpreter(command2))
    return assertShellInterpreterBodiesWithinStructuralLimits(command2, post, store), [...assignmentValues, ...extractInterpreterPathTargets(command2, post)];
  return [
    ...assignmentValues,
    ...post.flatMap((token) => extractOperandPathCandidates(command2, token))
  ];
}
function extractSafetyNetExplainPathTargets(executable, command2, tokens) {
  let direct = command2 === "cc-safety-net" && tokens[0] === "explain", runtime = (command2 === "bun" || command2 === "node") && isSafetyNetEntrypoint(tokens[0]) && tokens[1] === "explain";
  if (!direct && !runtime)
    return null;
  let targets = runtime ? [executable, tokens[0] ?? ""] : [executable], args = tokens.slice(runtime ? 2 : 1);
  for (let index = 0;index < args.length; index++) {
    let arg = args[index];
    if (arg === "--json" || arg === "--help" || arg === "-h")
      continue;
    if (arg === "--cwd") {
      let cwd = args[index + 1];
      if (cwd && !cwd.startsWith("--"))
        targets.push(cwd);
      index++;
      continue;
    }
    return targets;
  }
  return targets;
}
function isSafetyNetEntrypoint(value) {
  let normalized = value?.replaceAll("\\", "/");
  return [...CC_SAFETY_NET_ENTRYPOINTS].some((entrypoint) => normalized === entrypoint || normalized?.endsWith(`/${entrypoint}`));
}
function assertShellInterpreterBodiesWithinStructuralLimits(command2, tokens, store) {
  if (!SHELL_STDIN_INTERPRETERS.has(command2))
    return;
  let body = getShellCommandString(command2, tokens);
  if (body !== null && store.getShellSyntax(body).status === "structural-limit")
    throw new StructuralShellSyntaxLimitError;
}
function extractPipeCarrierPathTargets(producer, consumer, store) {
  if (xargsReadsPipeInputAsPath(consumer, store))
    return extractDisplayCommandOperands(producer);
  let stdinInterpreter = getStdinScriptInterpreter(consumer);
  if (stdinInterpreter === null)
    return [];
  return extractDisplayCommandBodies(producer).flatMap((body) => SHELL_STDIN_INTERPRETERS.has(stdinInterpreter) ? extractCommandPathTargets(store.getShellSyntax(body), store) : extractPathLiteralsFromCode(body));
}
function extractDisplayCommandOperands(tokens) {
  let stripped = stripLeadingWrappersAndEnvAssignments(tokens), commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1)
    return [];
  let command2 = basename3(stripped[commandIndex] ?? "").toLowerCase();
  if (!NON_PATH_OPERAND_COMMANDS.has(command2))
    return [];
  return stripped.slice(commandIndex + 1);
}
function extractDisplayCommandBodies(tokens) {
  let stripped = stripLeadingWrappersAndEnvAssignments(tokens), commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1)
    return [];
  let command2 = basename3(stripped[commandIndex] ?? "").toLowerCase(), args = stripped.slice(commandIndex + 1);
  if (command2 === "echo")
    return [stripEchoDisplayOptions(args).join(" ")];
  if (command2 === "printf")
    return extractPrintfDisplayBodies(args);
  return [];
}
function stripEchoDisplayOptions(tokens) {
  let optionEnd = tokens.findIndex((token) => !/^-[neE]+$/.test(token));
  return optionEnd === -1 ? [] : tokens.slice(optionEnd);
}
function extractPrintfDisplayBodies(tokens) {
  let format = tokens[0];
  if (format === void 0)
    return [];
  let valuesPerFormat = getPrintfStringConversionCount(format);
  if (valuesPerFormat === 0 || tokens.length === 1)
    return [decodePrintfEscapes(format)];
  let values = tokens.slice(1);
  return Array.from({ length: Math.ceil(values.length / valuesPerFormat) }, (_, index) => applyPrintfStringArguments(format, values.slice(index * valuesPerFormat, (index + 1) * valuesPerFormat)));
}
function getPrintfStringConversionCount(format) {
  return (format.match(/%%|%[bqs]/g) ?? []).filter((specifier) => specifier !== "%%").length;
}
function applyPrintfStringArguments(format, values) {
  let valueIndex = 0;
  return decodePrintfEscapes(format.replace(/%%|%[bqs]/g, (specifier) => {
    if (specifier === "%%")
      return "%";
    let value = values[valueIndex] ?? "";
    return valueIndex++, value;
  }));
}
function decodePrintfEscapes(value) {
  return value.replace(/\\n/g, `
`).replace(/\\t/g, "\t").replace(/\\r/g, "\r");
}
function xargsReadsPipeInputAsPath(tokens, store) {
  let stripped = stripLeadingWrappersAndEnvAssignments(tokens), commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1 || basename3(stripped[commandIndex] ?? "").toLowerCase() !== "xargs")
    return !1;
  let xargs = extractXargsChildCommandWithInfo(stripped.slice(commandIndex));
  if (xargs.childTokens.length === 0)
    return !1;
  if (xargs.replacementToken === "")
    return !1;
  let replacementToken = xargs.replacementToken, childTokens = replacementToken === null ? [...xargs.childTokens, PIPE_INPUT_PATH_MARKER] : xargs.childTokens.map((token) => token.split(replacementToken).join(PIPE_INPUT_PATH_MARKER));
  return extractSegmentPathTargets(childTokens, store).some((target) => target.includes(PIPE_INPUT_PATH_MARKER));
}
function getStdinScriptInterpreter(tokens) {
  let stripped = stripLeadingWrappersAndEnvAssignments(tokens), commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1)
    return null;
  let command2 = basename3(stripped[commandIndex] ?? "").toLowerCase();
  if (!isCodeInterpreter(command2))
    return null;
  return interpreterReadsStdinScript(command2, stripped.slice(commandIndex + 1)) ? command2 : null;
}
function interpreterReadsStdinScript(command2, tokens) {
  for (let i = 0;i < tokens.length; i++) {
    let token = tokens[i];
    if (token === void 0)
      break;
    if (CODE_EVAL_FLAGS.has(token) || isClusteredCodeEvalFlag(command2, token) || /^--(?:eval|exec)=/.test(token))
      return !1;
    if (token === "-")
      return !0;
    if (token.startsWith("-")) {
      if (interpreterFlagSelectsProgram(command2, token))
        return !1;
      if (interpreterFlagConsumesValue(command2, token))
        i++;
      continue;
    }
    return !1;
  }
  return !0;
}
function interpreterFlagSelectsProgram(command2, token) {
  return PROGRAM_SELECTING_INTERPRETER_FLAGS.get(normalizeInterpreterName(command2))?.has(token) ?? !1;
}
function interpreterFlagConsumesValue(command2, token) {
  return VALUE_CONSUMING_INTERPRETER_FLAGS.get(normalizeInterpreterName(command2))?.has(token) ?? !1;
}
function normalizeInterpreterName(command2) {
  return /^python\d/.test(command2) ? "python" : command2;
}
function extractLeadingAssignmentValues(tokens) {
  let values = [];
  for (let token of tokens) {
    if (isWrapperToken(token))
      continue;
    let assignment = /^[A-Za-z_][A-Za-z0-9_]*=(.*)$/.exec(token);
    if (assignment === null)
      break;
    if (assignment[1] !== void 0 && assignment[1] !== "")
      values.push(assignment[1]);
  }
  return values;
}
function extractOperandPathCandidates(command2, token) {
  if (token === "--")
    return [];
  let candidates = [], equals = token.indexOf("=");
  if (equals > 0 && equals < token.length - 1)
    candidates.push(token.slice(equals + 1));
  if (isFileOperand(command2, token))
    candidates.push(token);
  return candidates;
}
function extractPathRootTargets(tokens) {
  let roots = [];
  for (let token of tokens) {
    if (token.startsWith("-") || token === "(" || token === "!" || token === ";")
      break;
    roots.push(token);
  }
  return roots;
}
function extractFindCommandTargets(tokens, store) {
  let targets = extractPathRootTargets(tokens);
  for (let i = 0;i < tokens.length; i++) {
    if (!FIND_EXEC_PRIMARIES2.has(tokens[i] ?? ""))
      continue;
    let execCommand = getFindExecCommand2(tokens, i);
    if (targets.push(...extractSegmentPathTargets(execCommand, store).filter((target) => target !== "{}")), findExecConsumesPlaceholder(execCommand, store))
      targets.push(...extractFindMatchedPathTargets(tokens.slice(0, i)));
  }
  return targets;
}
function getFindExecCommand2(tokens, execIndex) {
  let execTokens = tokens.slice(execIndex + 1), terminatorIndex = execTokens.findIndex((token) => FIND_EXEC_TERMINATORS.has(token));
  return terminatorIndex === -1 ? execTokens : execTokens.slice(0, terminatorIndex);
}
function findExecConsumesPlaceholder(tokens, store) {
  return extractSegmentPathTargets(tokens, store).includes("{}");
}
function extractFindMatchedPathTargets(tokens) {
  return tokens.flatMap((token, index) => {
    if (!FIND_MATCH_PATH_PRIMARIES.has(token))
      return [];
    let value = tokens[index + 1];
    return value === void 0 ? [] : [value, normalizeFindPathPattern(value)];
  });
}
function normalizeFindPathPattern(pattern) {
  return pattern.replace(/^\*+\//, "").replace(/\/\*+$/g, "").replace(/^\*+/, "").replace(/\*+$/g, "");
}
function isCodeInterpreter(command2) {
  return CODE_INTERPRETERS.has(command2) || /^python\d/.test(command2);
}
function extractInterpreterPathTargets(command2, tokens) {
  let candidates = [];
  for (let i = 0;i < tokens.length; i++) {
    let token = tokens[i];
    if (token === void 0)
      break;
    if (CODE_EVAL_FLAGS.has(token) || isClusteredCodeEvalFlag(command2, token)) {
      let code = tokens[i + 1];
      if (code !== void 0)
        candidates.push(...extractPathLiteralsFromCode(code)), i++;
      continue;
    }
    let inlineEval = /^--(?:eval|exec)=(.*)$/.exec(token);
    if (inlineEval !== null && inlineEval[1] !== void 0) {
      candidates.push(...extractPathLiteralsFromCode(inlineEval[1]));
      continue;
    }
    if (!token.startsWith("-"))
      candidates.push(token);
  }
  return candidates;
}
function isClusteredCodeEvalFlag(command2, token) {
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2)
    return !1;
  return (/^python\d/.test(command2) ? CLUSTERED_CODE_EVAL_FLAGS.get("python") : CLUSTERED_CODE_EVAL_FLAGS.get(command2))?.has(token[token.length - 1] ?? "") ?? !1;
}
function extractAwkPathTargets(tokens, store) {
  return [
    ...tokens.flatMap((token) => extractOperandPathCandidates("awk", token)),
    ...tokens.flatMap((token) => extractAwkSystemCommandTargets(token, store)),
    ...tokens.flatMap(extractAwkGetlineRedirectTargets)
  ];
}
function extractAwkSystemCommandTargets(code, store) {
  if (!code.includes("system"))
    return [];
  return extractAwkSystemCommands(code)?.commands.flatMap((command2) => extractCommandPathTargets(store.getShellSyntax(command2), store)) ?? [];
}
function extractAwkGetlineRedirectTargets(code) {
  return Array.from(code.matchAll(/\bgetline(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*<\s*"((?:\\.|[^"\\])*)"/g)).map((match) => match[1]).filter((value) => value !== void 0 && value !== "");
}
function extractPathLiteralsFromCode(code) {
  let quoted = Array.from(code.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)).map((match) => match[2]).filter((value) => value !== void 0 && value !== ""), bare = code.match(/[\w./~@+-]*[./~][\w./~@+-]*/g) ?? [];
  return [...quoted, ...quoted.flatMap(decodeBase64PathCandidate), ...bare];
}
function extractCommandSubstitutionPathTargets(command2, store) {
  return extractCommandSubstitutionBodies(command2).flatMap((body) => {
    let syntax = store.getShellSyntax(body);
    return [
      ...extractCommandPathTargets(syntax, store),
      ...commandSubstitutionDecodesBase64(syntax) ? extractBase64DecodedPathCandidates(syntax) : []
    ];
  });
}
function commandSubstitutionDecodesBase64(syntax) {
  let entries = syntax.entries;
  for (let i = 0;i < entries.length; i++) {
    let entry = entries[i];
    if (entry?.kind !== "word" || basename3(projectSensitiveShellText(entry.text)).toLowerCase() !== "base64")
      continue;
    for (let j = i + 1;j < entries.length; j++) {
      let candidate = entries[j];
      if (candidate?.kind === "operator")
        break;
      if (candidate?.kind === "word" && isBase64DecodeFlag(projectSensitiveShellText(candidate.text)))
        return !0;
    }
  }
  return !1;
}
function extractBase64DecodedPathCandidates(syntax) {
  return syntax.entries.flatMap((entry) => entry.kind === "word" ? [projectSensitiveShellText(entry.text)] : entry.kind === "redirection" && entry.target ? [projectSensitiveShellText(entry.target)] : []).flatMap(decodeBase64PathCandidate);
}
function decodeBase64PathCandidate(token) {
  let normalized = normalizeBase64Token(token);
  if (normalized === null)
    return [];
  let decoded = Buffer.from(normalized, "base64").toString("utf8");
  if (decoded === "" || hasControlCharacter(decoded))
    return [];
  return Buffer.from(decoded, "utf8").toString("base64").replace(/=+$/g, "") === normalized.replace(/=+$/g, "") ? [decoded] : [];
}
function hasControlCharacter(value) {
  return Array.from(value).some((char) => {
    let code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
function normalizeBase64Token(token) {
  if (token.length < 8 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(token))
    return null;
  if (/=/.test(token.replace(/=+$/g, "")))
    return null;
  let unpadded = token.replace(/=+$/g, "");
  if (unpadded.length % 4 === 1)
    return null;
  return `${unpadded.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - unpadded.length % 4) % 4)}`;
}
function isBase64DecodeFlag(flag) {
  return flag === "--decode" || !flag.startsWith("--") && flag.startsWith("-") && /[dD]/.test(flag);
}
function extractCommandSubstitutionBodies(command2) {
  let bodies = [], quoteState = { inSingle: !1, inDouble: !1, escaped: !1 };
  for (let i = 0;i < command2.length; i++) {
    let char = command2[i];
    if (!char)
      break;
    if (advanceQuoteScanState(char, quoteState))
      continue;
    if (startsCommandSubstitution(command2, i, quoteState)) {
      let substitution = readCommandSubstitutionBody(command2, i + 1);
      if (substitution !== null)
        bodies.push(substitution.body), i = substitution.endIndex;
      continue;
    }
    if (!quoteState.inSingle && char === "`") {
      let substitution = readBacktickCommandSubstitutionBody(command2, i);
      if (substitution !== null)
        bodies.push(substitution.body), i = substitution.endIndex;
    }
  }
  return bodies;
}
function readCommandSubstitutionBody(command2, startIndex) {
  let quoteState = { inSingle: !1, inDouble: !1, escaped: !1 }, depth = 1;
  for (let i = startIndex + 1;i < command2.length; i++) {
    let char = command2[i];
    if (!char)
      break;
    if (advanceQuoteScanState(char, quoteState))
      continue;
    if (startsCommandSubstitution(command2, i, quoteState)) {
      depth++, i++;
      continue;
    }
    if (!quoteState.inSingle && !quoteState.inDouble && char === ")") {
      if (depth--, depth === 0)
        return { body: command2.slice(startIndex + 1, i), endIndex: i };
    }
  }
  return null;
}
function readBacktickCommandSubstitutionBody(command2, startIndex) {
  let escaped = !1;
  for (let i = startIndex + 1;i < command2.length; i++) {
    let char = command2[i];
    if (!char)
      break;
    if (escaped) {
      escaped = !1;
      continue;
    }
    if (char === "\\") {
      escaped = !0;
      continue;
    }
    if (char === "`")
      return { body: command2.slice(startIndex + 1, i), endIndex: i };
  }
  return null;
}
function startsCommandSubstitution(command2, index, state) {
  return !state.inSingle && command2[index] === "$" && command2[index + 1] === "(" && command2[index + 2] !== "(";
}
function extractPatternCommandTargets(tokens) {
  let optionFileTargets = [], positionals = [], patternFromOption = !1, patternlessMode = !1, afterDashDash = !1;
  for (let i = 0;i < tokens.length; i++) {
    let token = tokens[i];
    if (token === void 0)
      break;
    if (!afterDashDash && token === "--") {
      afterDashDash = !0;
      continue;
    }
    if (afterDashDash) {
      positionals.push(token);
      continue;
    }
    let longOption = /^--([^=]+)(?:=(.*))?$/.exec(token);
    if (longOption !== null) {
      let name = longOption[1] ?? "", inlineValue = longOption[2];
      if (name === PATTERNLESS_FILES_LONG)
        patternlessMode = !0;
      if (PATTERN_SUPPLY_LONG.has(name))
        patternFromOption = !0;
      if (inlineValue !== void 0) {
        if (name === PATTERN_FILE_LONG)
          optionFileTargets.push(inlineValue);
        continue;
      }
      if (PATTERN_ARG_LONG.has(name)) {
        let next = tokens[i + 1];
        if (name === PATTERN_FILE_LONG && next !== void 0)
          optionFileTargets.push(next);
        i++;
      }
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      let flags = token.slice(1), consumerChar = "", consumerInline = "";
      for (let j = 0;j < flags.length; j++) {
        let flag = flags[j] ?? "";
        if (PATTERN_SUPPLY_SHORT.has(flag))
          patternFromOption = !0;
        if (PATTERN_ARG_SHORT.has(flag)) {
          consumerChar = flag, consumerInline = flags.slice(j + 1);
          break;
        }
      }
      if (consumerChar !== "")
        if (consumerInline.length > 0) {
          if (consumerChar === PATTERN_FILE_SHORT)
            optionFileTargets.push(consumerInline);
        } else {
          let next = tokens[i + 1];
          if (consumerChar === PATTERN_FILE_SHORT && next !== void 0)
            optionFileTargets.push(next);
          i++;
        }
      continue;
    }
    positionals.push(token);
  }
  let positionalFiles = !patternFromOption && !patternlessMode ? positionals.slice(1) : positionals;
  return [...optionFileTargets, ...positionalFiles];
}
function stripLeadingWrappersAndEnvAssignments(tokens) {
  let firstCommandIndex = tokens.findIndex((token) => !isWrapperToken(token) && !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
  return firstCommandIndex === -1 ? [] : [...tokens.slice(firstCommandIndex)];
}
function isWrapperToken(token) {
  return token === "env" || token === "command" || token === "builtin" || token === "sudo";
}
function isFileOperand(command2, token) {
  if (token === "--")
    return !1;
  if (command2 === "tar")
    return !token.startsWith("-") && !/\.(?:tar|tgz|tar\.gz|zip)$/i.test(token);
  if (command2 === "zip")
    return !token.startsWith("-") && !/\.zip$/i.test(token);
  return !token.startsWith("-");
}
var PUBLIC_KEY_BASENAMES = /* @__PURE__ */ new Set(["id_rsa.pub", "id_ed25519.pub", "id_ecdsa.pub"]), ENV_PREFIX = ".env.", ENV_EXEMPTION_BASENAMES = /* @__PURE__ */ new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.defaults"
]), ENV_EXEMPTION_PREFIXES = [".env.example.", ".env.sample."], SKIPPABLE_PATH_SEGMENTS = /* @__PURE__ */ new Set(["node_modules", ".git", "__pycache__"]), SKIPPABLE_PATH_SEGMENT_PAIRS = [
  ["vendor", "bundle"],
  ["vendor", "cache"]
];
function isSensitivePath(target, cwd, config, budget) {
  let normalized = normalizeCandidatePath(target, cwd, budget);
  if (!normalized)
    return null;
  let comparableName = comparable(normalized.split("/").pop() ?? ""), comparablePath = comparable(normalized);
  if (isAllowedSensitiveTemplate(comparableName))
    return null;
  for (let rule of SECRET_HOME_PATH_RULES)
    if (matchesHomePathSuffix(comparablePath, rule.suffixParts.join("/")) && isSecretRuleEnabled(rule.id, config))
      return rule.id;
  let codingCliRuleId = matchesCodingCliPath(normalized, cwd, config, budget);
  if (codingCliRuleId)
    return codingCliRuleId;
  for (let rule of SECRET_DIRECTORY_RULES)
    if (isSensitiveDirSegment(comparablePath, rule.basename) && isSecretRuleEnabled(rule.id, config))
      return rule.id;
  if (PUBLIC_KEY_BASENAMES.has(comparableName))
    return null;
  for (let rule of SECRET_BASENAME_RULES)
    if (comparableName === rule.basename && isSecretRuleEnabled(rule.id, config))
      return rule.id;
  if (comparableName.startsWith(ENV_PREFIX) && isSecretRuleEnabled(SECRET_ENV_VARIANT_RULE.id, config))
    return SECRET_ENV_VARIANT_RULE.id;
  for (let rule of SECRET_VARIANT_SEPARATOR_RULES)
    if (comparableName.length > rule.prefix.length && comparableName.startsWith(rule.prefix)) {
      let next = comparableName.slice(rule.prefix.length)[0];
      if ((next === "-" || next === "_") && isSecretRuleEnabled(rule.id, config))
        return rule.id;
    }
  for (let rule of SECRET_VARIANT_DOT_SUFFIX_RULES)
    if (comparableName.length > rule.prefix.length && comparableName.startsWith(rule.prefix)) {
      if (comparableName.slice(rule.prefix.length) === rule.suffix && isSecretRuleEnabled(rule.id, config))
        return rule.id;
    }
  if (isSkippablePathForBroadSignatures(comparablePath))
    return null;
  if (hasBroadSshKeyBasename(comparableName) && isSecretRuleEnabled(SECRET_BROAD_SSH_KEY_BASENAME_RULE.id, config))
    return SECRET_BROAD_SSH_KEY_BASENAME_RULE.id;
  let extensionRuleId = hasSensitiveExtension(comparableName, config);
  if (extensionRuleId)
    return extensionRuleId;
  return null;
}
function matchesHomePathSuffix(comparablePath, suffix) {
  return comparablePath === `~/${suffix}` || comparablePath.startsWith(`~/${suffix}/`);
}
function matchesCodingCliPath(normalized, cwd, config, budget) {
  return SECRET_CODING_CLI_RULES.find((rule) => {
    if (!isSecretRuleEnabled(rule.id, config))
      return !1;
    if (rule.id === "secret.cli.claude-code")
      return matchesClaudeCodePath(normalized, cwd, budget);
    if (rule.id === "secret.cli.antigravity")
      return matchesAntigravityPath(normalized, cwd, budget);
    if (rule.id === "secret.cli.codex")
      return matchesCodexPath(normalized, cwd, budget);
    if (rule.id === "secret.cli.gemini")
      return matchesGeminiPath(normalized, cwd, budget);
    if (rule.id === "secret.cli.copilot-cli")
      return matchesCopilotCliPath(normalized, cwd, budget);
    if (rule.id === "secret.cli.kimi-code")
      return matchesKimiCodePath(normalized, cwd, budget);
    if (rule.id === "secret.cli.opencode")
      return matchesOpenCodePath(normalized, cwd, budget);
    if (rule.id === "secret.cli.pi")
      return matchesPiPath(normalized, cwd, budget);
    return !1;
  })?.id ?? null;
}
function matchesClaudeCodePath(normalized, cwd, budget) {
  return matchesFileInRoot(normalized, codingCliRoot(process.env.CLAUDE_CONFIG_DIR, "~/.claude", cwd, budget), ["settings.json", "settings.local.json", ".credentials.json"]) || matchesExactPath(normalized, "~/.claude.json", cwd, budget);
}
function matchesAntigravityPath(normalized, cwd, budget) {
  return matchesExactPath(normalized, "~/.gemini/config/hooks.json", cwd, budget);
}
function matchesCodexPath(normalized, cwd, budget) {
  return matchesFileInRoot(normalized, codingCliRoot(process.env.CODEX_HOME, "~/.codex", cwd, budget), ["config.toml", "auth.json", ".credentials.json"]);
}
function matchesGeminiPath(normalized, cwd, budget) {
  return matchesFileInRoot(normalized, appendPath(codingCliRoot(process.env.GEMINI_CLI_HOME, "~", cwd, budget), ".gemini"), [
    "oauth_creds.json",
    "mcp-oauth-tokens.json",
    "a2a-oauth-tokens.json",
    "google_accounts.json",
    "settings.json",
    "gemini-credentials.json"
  ]);
}
function matchesCopilotCliPath(normalized, cwd, budget) {
  let root = codingCliRoot(process.env.COPILOT_HOME, "~/.copilot", cwd, budget);
  return matchesFileInRoot(normalized, root, ["config.json"]) || matchesDirInRoot(normalized, root, ["mcp-oauth-config"]);
}
function matchesKimiCodePath(normalized, cwd, budget) {
  let currentRoot = codingCliRoot(process.env.KIMI_CODE_HOME, "~/.kimi-code", cwd, budget), legacyRoot = codingCliRoot(process.env.KIMI_SHARE_DIR, "~/.kimi", cwd, budget);
  return matchesFileInRoot(normalized, currentRoot, ["config.toml", "mcp.json", "server.token"]) || matchesDirInRoot(normalized, currentRoot, ["credentials"]) || matchesFileInRoot(normalized, legacyRoot, ["config.toml", "mcp.json"]) || matchesDirInRoot(normalized, legacyRoot, ["credentials", "mcp-oauth"]);
}
function matchesOpenCodePath(normalized, cwd, budget) {
  let dataRoot = appendPath(codingCliRoot(process.env.XDG_DATA_HOME, "~/.local/share", cwd, budget), "opencode"), configRoot = process.env.OPENCODE_CONFIG_DIR ? codingCliRoot(process.env.OPENCODE_CONFIG_DIR, "~/.config/opencode", cwd, budget) : appendPath(codingCliRoot(process.env.XDG_CONFIG_HOME, "~/.config", cwd, budget), "opencode"), programDataConfig = process.env.ProgramData ? [appendPath(codingCliRoot(process.env.ProgramData, "", cwd, budget), "opencode")] : [];
  return matchesFileInRoot(normalized, dataRoot, ["auth.json", "mcp-auth.json"]) || matchesFileInRoot(normalized, configRoot, ["opencode.json", "opencode.jsonc"]) || matchesOptionalExactPath(normalized, process.env.OPENCODE_CONFIG, cwd, budget) || ["/Library/Application Support/opencode", "/etc/opencode", ...programDataConfig].some((root) => matchesFileInRoot(normalized, normalizeCandidatePath(root, cwd, budget), [
    "opencode.json",
    "opencode.jsonc"
  ]));
}
function matchesPiPath(normalized, cwd, budget) {
  return matchesFileInRoot(normalized, codingCliRoot(process.env.PI_CODING_AGENT_DIR, "~/.pi/agent", cwd, budget), ["auth.json"]);
}
function codingCliRoot(envValue, fallback, cwd, budget) {
  return normalizeCandidatePath(envValue?.trim() ? envValue : fallback, cwd, budget);
}
function matchesFileInRoot(normalized, root, files) {
  return files.some((file) => sameComparablePath(normalized, appendPath(root, file)));
}
function matchesDirInRoot(normalized, root, dirs) {
  return dirs.some((dir) => isSameOrChildPath(comparable(normalized), comparable(appendPath(root, dir))));
}
function matchesExactPath(normalized, path, cwd, budget) {
  return sameComparablePath(normalized, normalizeCandidatePath(path, cwd, budget));
}
function matchesOptionalExactPath(normalized, path, cwd, budget) {
  return path?.trim() ? matchesExactPath(normalized, path, cwd, budget) : !1;
}
function sameComparablePath(a, b) {
  return comparable(a) === comparable(b);
}
function appendPath(root, ...parts) {
  return normalizePathText([root, ...parts].filter(Boolean).join("/"));
}
function isSensitiveDirSegment(comparablePath, dirName) {
  return comparablePath === dirName || comparablePath.startsWith(`${dirName}/`) || comparablePath.endsWith(`/${dirName}`) || comparablePath.includes(`/${dirName}/`);
}
function isAllowedSensitiveTemplate(comparableName) {
  return ENV_EXEMPTION_BASENAMES.has(comparableName) || ENV_EXEMPTION_PREFIXES.some((prefix) => comparableName.startsWith(prefix));
}
function isDeniedByPolicy(target, cwd, config, configCwd, budget) {
  return matchesPolicyPath(target, cwd, config?.denyPaths ?? [], configCwd, budget);
}
function matchesPolicyPath(target, cwd, paths, configCwd, budget) {
  if (paths.length === 0)
    return !1;
  let normalized = comparable(normalizeAbsoluteCandidatePath(target, cwd, budget));
  return paths.some((path) => comparable(normalizeAbsoluteCandidatePath(path, configCwd, budget)) === normalized);
}
function isSkippablePathForBroadSignatures(comparablePath) {
  let parts = comparablePath.split("/");
  return parts.some((part) => SKIPPABLE_PATH_SEGMENTS.has(part)) || SKIPPABLE_PATH_SEGMENT_PAIRS.some(([parent, child]) => parts.some((part, index) => part === parent && parts[index + 1] === child));
}
function hasBroadSshKeyBasename(comparableName) {
  return !comparableName.includes(".") && SECRET_BROAD_SSH_KEY_BASENAME_RULE.pattern.test(comparableName);
}
function hasSensitiveExtension(comparableName, config) {
  let extension = getExtension(comparableName);
  if (extension === "")
    return null;
  for (let rule of SECRET_EXTENSION_RULES)
    if (extension === rule.extension && isSecretRuleEnabled(rule.id, config))
      return rule.id;
  for (let rule of SECRET_EXTENSION_PATTERN_RULES)
    if (rule.pattern.test(extension) && isSecretRuleEnabled(rule.id, config))
      return rule.id;
  return null;
}
function getExtension(comparableName) {
  let index = comparableName.lastIndexOf(".");
  return index > 0 && index < comparableName.length - 1 ? comparableName.slice(index + 1) : "";
}
function comparable(value) {
  return value.toLowerCase();
}
function isSecretRuleEnabled(id, config) {
  if (!config?.disabledRules)
    return !0;
  if (Array.isArray(config.disabledRules))
    return !config.disabledRules.includes(id);
  return !config.disabledRules.has(id);
}
function normalizeCandidatePath(target, cwd, budget) {
  let homeValue = process.env.HOME ?? homedir6(), home = homeValue ? normalizePathText(resolveExistingPath(homeValue, budget)) : "", normalized = normalizePathText(normalizeFileUriPath(expandSupportedPathEnvironmentVariables(target)));
  if (!normalized)
    return "";
  if (!home)
    return normalized;
  let expanded = expandHomePath(normalized, home), absolute = isAbsolute14(expanded) ? expanded : normalizePathText(resolve11(cwd, expanded)), canonicalAbsolute = normalizePathText(resolveExistingPath(absolute, budget));
  if (!isSameOrChildPath(canonicalAbsolute, home)) {
    if (isAbsolute14(expanded))
      return canonicalAbsolute;
    return canonicalAbsolute === absolute ? normalized : canonicalAbsolute;
  }
  let relativeHomePath = canonicalAbsolute.slice(home.length);
  return relativeHomePath ? `~${relativeHomePath}` : "~";
}
function normalizeAbsoluteCandidatePath(target, cwd, budget) {
  let homeValue = process.env.HOME ?? homedir6(), home = homeValue ? normalizePathText(resolveExistingPath(homeValue, budget)) : "", normalized = normalizePathText(normalizeFileUriPath(expandSupportedPathEnvironmentVariables(target)));
  if (!normalized)
    return "";
  let expanded = home ? expandHomePath(normalized, home) : normalized;
  return normalizePathText(resolveExistingPath(isAbsolute14(expanded) ? expanded : resolve11(cwd, expanded), budget));
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
  let normalized = value.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "");
  if (normalized === "/")
    return normalized;
  return normalized.replace(/\/+$/g, "");
}
function isSameOrChildPath(path, parent) {
  return path === parent || path.startsWith(`${parent}/`);
}
function basename3(token) {
  return token.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? token;
}

// src/engine/decision-compatibility.ts
function mapLegacyCommandBlock(command2, result) {
  return {
    decision: {
      kind: "deny",
      reason: result.reason,
      intent: result.manualPermissionAdvice === !1 ? "hard_stop" : result.intent ?? "manual_only",
      ...result.ruleId ? { ruleId: result.ruleId } : {},
      evidence: [{ kind: "command", command: command2, segment: result.segment }]
    }
  };
}

// src/engine/guard.ts
class GuardEvaluationError extends Error {
  stage;
  evaluation;
  name = "GuardEvaluationError";
  constructor(stage, evaluation, cause) {
    super(`CC Safety Net ${stage} dependency failed`, { cause });
    this.stage = stage;
    this.evaluation = evaluation;
  }
}
var DEFAULT_DEPENDENCIES = {
  findPolicyMutation: findPolicyConfigMutationTargetInSemanticFacts,
  loadPolicySnapshot,
  findSensitiveTarget: findSensitiveTargetInSemanticFacts,
  analyzeCommand: analyzeCommandWithProgram,
  getModes: getCCSafetyNetEnvModes
};
function evaluateGuard(invocation, options2 = {}) {
  let dependencies = { ...DEFAULT_DEPENDENCIES, ...options2.dependencies }, inputCommand = getInputCommandOrFail(invocation), command2 = isCommandInvocation(invocation) ? invocation.command : inputCommand, facts = callDependency("policy-protection", command2, () => createSemanticFacts(invocation, options2.factParserDependencies)), declaredCommand = getCommandSyntaxFact(facts, "declared-command");
  if (isCommandInvocation(invocation) && invocation.command?.trim() && declaredCommand?.program.status === "limited")
    return {
      stage: "command-analysis",
      decision: {
        kind: "deny",
        reason: REASON_RECURSION_LIMIT,
        intent: "stop_and_explain",
        evidence: [{ kind: "command", command: invocation.command, segment: invocation.command }]
      }
    };
  if (getCommandSyntaxFact(facts, "input-candidate")?.program.status === "limited")
    return {
      stage: "command-validation",
      decision: {
        kind: "deny",
        reason: REASON_STRUCTURAL_COMMAND_VALIDATION_LIMIT,
        intent: "stop_and_explain",
        evidence: []
      }
    };
  let policyTarget = callDependency("policy-protection", command2, () => dependencies.findPolicyMutation(facts));
  if (policyTarget) {
    let displayCommand = command2 ?? policyTarget.target;
    return {
      stage: "policy-protection",
      decision: {
        kind: "deny",
        reason: REASON_POLICY_CONFIG_PROTECTION,
        intent: "hard_stop",
        evidence: [
          { kind: "command", command: displayCommand, segment: policyTarget.target },
          { kind: "path", target: policyTarget.target }
        ]
      }
    };
  }
  let snapshot = callDependency("config-load", command2, () => dependencies.loadPolicySnapshot({
    ...options2.policyOptions,
    cwd: invocation.context.configCwd
  })), policy = snapshot.policy, secretTarget = policy.secretProtection.enabled === !1 ? null : callDependency("secret-protection", command2, () => dependencies.findSensitiveTarget(facts, policy.secretProtection, {
    strict: isCommandInvocation(invocation) ? dependencies.getModes(policy).strict : void 0
  }));
  if (secretTarget) {
    let displayCommand = command2 ?? secretTarget.target;
    return {
      stage: "secret-protection",
      decision: {
        kind: "deny",
        reason: REASON_SECRET_PROTECTION,
        intent: "hard_stop",
        ruleId: secretTarget.ruleId,
        evidence: [
          { kind: "command", command: displayCommand, segment: secretTarget.target },
          { kind: "path", target: secretTarget.target }
        ]
      }
    };
  }
  if (!isCommandInvocation(invocation)) {
    if (snapshot.state === "invalid")
      return {
        stage: "config-state",
        decision: {
          kind: "deny",
          reason: snapshot.reason,
          intent: "stop_and_explain",
          evidence: inputCommand ? [{ kind: "command", command: inputCommand, segment: inputCommand }] : []
        }
      };
    return { stage: "non-command", decision: { kind: "allow" } };
  }
  if (!invocation.command || invocation.command.trim() === "")
    return failedClosedEvaluation("command-validation", command2);
  let result = callDependency("command-analysis", command2, () => {
    let modes = dependencies.getModes(policy);
    return dependencies.analyzeCommand(invocation.command, {
      cwd: invocation.context.executionCwd,
      shell: invocation.route.shell,
      policySnapshot: snapshot,
      effectiveCapabilities: modes.capabilities,
      strict: modes.strict,
      paranoidRm: modes.paranoidRm,
      paranoidInterpreters: modes.paranoidInterpreters,
      worktreeMode: modes.worktreeMode
    }, getDeclaredCommandProgram(facts), facts.store);
  });
  if (result)
    return blockedCommandEvaluation(invocation, result);
  return { stage: "command-analysis", decision: { kind: "allow" } };
}
function getDeclaredCommandProgram(facts) {
  return getCommandSyntaxFact(facts, "declared-command")?.program;
}
function getInputCommandOrFail(invocation) {
  try {
    return getCommandFromToolInput(invocation.input);
  } catch (cause) {
    let command2 = isCommandInvocation(invocation) ? invocation.command : void 0;
    throw new GuardEvaluationError("policy-protection", failedClosedEvaluation("policy-protection", cause instanceof ToolInputLimitError ? void 0 : command2), cause);
  }
}
function callDependency(stage, command2, call) {
  try {
    return call();
  } catch (cause) {
    throw new GuardEvaluationError(stage, failedClosedEvaluation(stage, cause instanceof ToolInputLimitError ? void 0 : command2), cause);
  }
}
function failedClosedEvaluation(stage, command2) {
  return {
    stage,
    decision: {
      kind: "deny",
      reason: REASON_SAFETY_NET_FAILED_CLOSED,
      intent: "stop_and_explain",
      evidence: command2 ? [{ kind: "command", command: command2, segment: command2 }] : []
    }
  };
}
function blockedCommandEvaluation(invocation, result) {
  let command2 = invocation.command;
  return {
    stage: "command-analysis",
    ...mapLegacyCommandBlock(command2, result)
  };
}
function isCommandInvocation(invocation) {
  return invocation.route.kind === "command";
}

// src/integrations/runtime.ts
function evaluateRuntimeGuard(invocation, options2) {
  try {
    let evaluation = evaluateGuard(invocation, options2.guard);
    return writeRuntimeAudit(invocation, evaluation, options2), evaluation;
  } catch (error) {
    if (!(error instanceof GuardEvaluationError))
      throw error;
    throw writeRuntimeAudit(invocation, error.evaluation, options2, !(error.cause instanceof ToolInputLimitError), { stage: error.stage, errorCode: classifyAuditError(error.cause) }), error;
  }
}
function writeRuntimeAudit(invocation, evaluation, options2, includeInvocationCommand = !0, failure) {
  writeGuardAudit(projectGuardAudit(invocation, evaluation, options2.guard?.auditAllowed ?? !1, includeInvocationCommand, failure), options2.audit.getSessionId, {
    agent: options2.audit.agent,
    shape: options2.audit.shape,
    homeDir: options2.audit.homeDir
  });
}
function classifyAuditError(error) {
  if (error instanceof PathCanonicalizationLimitError)
    return "path-canonicalization-limit";
  if (error instanceof ToolInputLimitError)
    return "tool-input-limit";
  if (error instanceof StructuralShellSyntaxLimitError)
    return "structural-shell-syntax-limit";
  return "unexpected-error";
}

// src/bin/hook/common.ts
var HOOK_INPUT_MAX_BYTES = 8388608;
function outputHookDeny(createDenyOutput, denial) {
  console.log(JSON.stringify(createDenyOutput(formatDenial(denial))));
}
async function readHookInput(outputDeny) {
  let inputText;
  try {
    inputText = (await readBoundedHookInput(process.stdin)).trim();
  } catch {
    outputDeny({ reason: "Failed to parse hook input JSON." });
    return;
  }
  if (!inputText) {
    outputDeny({ reason: "Missing hook input JSON." });
    return;
  }
  return parseHookJson(inputText, outputDeny, "Failed to parse hook input JSON.");
}
async function readBoundedHookInput(input) {
  let chunks = [], bytes = 0;
  for await (let chunk of input) {
    let buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf-8") : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    if (bytes += buffer.byteLength, bytes > HOOK_INPUT_MAX_BYTES)
      throw stopHookInput(input), Error("hook input byte limit exceeded");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes).toString("utf-8");
}
function stopHookInput(input) {
  let stop = input.destroy ?? input.cancel;
  if (!stop)
    return;
  try {
    Promise.resolve(stop.call(input)).catch(() => {});
  } catch {}
}
function parseHookJson(inputText, outputDeny, strictReason) {
  try {
    return JSON.parse(inputText);
  } catch {
    outputDeny({ reason: strictReason });
    return;
  }
}
function getToolRoute(toolName, commandTools) {
  let shell = commandTools.get(toolName);
  return shell ? { kind: "command", shell } : { kind: getNonCommandToolInputKind(toolName) };
}
function resolveStandardHookContext(cwdInput, toolInput, toolName, outputDeny) {
  let requestedCwd = cwdInput === void 0 ? process.cwd() : cwdInput, cwd = typeof requestedCwd === "string" && requestedCwd.trim() !== "" ? firstTrustedRoot([requestedCwd]) : void 0;
  if (cwd)
    return { configCwd: cwd, executionCwd: cwd };
  return outputFailedClosed(outputDeny, toolInput, toolName, stringField(requestedCwd)), null;
}
function outputFailedClosed(outputDeny, toolInput, toolName, segment) {
  let command2;
  try {
    command2 = getCommandFromToolInput(toolInput);
  } catch (error) {
    if (!(error instanceof ToolInputLimitError))
      throw error;
  }
  outputDeny(createFailedClosedDenial({
    command: command2,
    segment,
    toolName
  }));
}
async function runHookAdapter(adapter) {
  let input = await readHookInput(adapter.outputDeny);
  if (input === void 0)
    return;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    outputFailedClosed(adapter.outputDeny);
    return;
  }
  if (!adapter.isSupported(input))
    return;
  let agent = adapter.getAgent?.(input) ?? adapter.agent, shape = adapter.agent === agent ? void 0 : adapter.agent, auditCwd = adapter.getAuditCwd?.(input) ?? getHookAuditCwd(input), outputPreflightDeny = (denial, toolName2) => {
    writeIntegrationDenialAudit(denial, () => adapter.getSessionId(input), {
      agent,
      shape,
      toolName: toolName2,
      cwd: auditCwd
    }), adapter.outputDeny(denial);
  }, toolNameInput = adapter.getToolName(input);
  if (typeof toolNameInput !== "string" || toolNameInput.trim() === "") {
    outputFailedClosed((denial) => outputPreflightDeny(denial), getRawHookToolInput(input));
    return;
  }
  let toolName = toolNameInput, outputToolPreflightDeny = (denial) => outputPreflightDeny(denial, toolName), toolInputResult;
  try {
    toolInputResult = adapter.getToolInput(input, toolName, outputToolPreflightDeny);
  } catch (error) {
    if (!(error instanceof ToolInputLimitError))
      throw error;
    outputFailedClosed(outputToolPreflightDeny, void 0, toolName);
    return;
  }
  if (!toolInputResult.ok)
    return;
  let context = adapter.getContext(input, toolInputResult.input, toolName, outputToolPreflightDeny);
  if (!context)
    return;
  let command2;
  try {
    command2 = getCommandFromToolInput(toolInputResult.input);
  } catch (error) {
    if (!(error instanceof ToolInputLimitError))
      throw error;
    outputFailedClosed(outputToolPreflightDeny, void 0, toolName);
    return;
  }
  let invocation = createToolInvocation(toolName, toolInputResult.input, toolInputResult.route, context, command2 ?? null);
  try {
    let evaluation = evaluateRuntimeGuard(invocation, {
      guard: {
        auditAllowed: envTruthy(ENV_FLAGS.debug),
        dependencies: adapter.guardDependencies
      },
      audit: { agent, shape, getSessionId: () => adapter.getSessionId(input) }
    }), denial = projectGuardDenial(evaluation, {
      includeEvidence: !0,
      toolName: evaluation.stage === "command-analysis" ? void 0 : toolName
    });
    if (denial)
      adapter.outputDeny(denial);
  } catch (error) {
    if (!(error instanceof GuardEvaluationError))
      throw error;
    logHookGuardError(error);
    let denial = projectGuardDenial(error.evaluation, {
      includeEvidence: !0,
      toolName: error.evaluation.stage === "command-analysis" ? void 0 : toolName
    });
    if (denial)
      adapter.outputDeny(denial);
    return;
  }
}
function logHookGuardError(error) {
  if (!envTruthy(ENV_FLAGS.debug))
    return;
  console.error(`CC Safety Net debug: ${getHookGuardErrorLabel(error.stage)}: ${formatIntegrationError(error.cause)}`);
}
function getHookGuardErrorLabel(stage) {
  if (stage === "policy-protection")
    return "hook policy protection failed";
  if (stage === "config-load")
    return "hook config loading failed";
  if (stage === "secret-protection")
    return "hook secret protection failed";
  return "hook analysis failed";
}
function stringField(value) {
  return typeof value === "string" ? value : void 0;
}
function getRawHookToolInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return;
  if (Object.hasOwn(input, "tool_input"))
    return input.tool_input;
  let toolCall = input.toolCall;
  if (toolCall && typeof toolCall === "object" && !Array.isArray(toolCall))
    return toolCall.args;
  return;
}
function getHookAuditCwd(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return null;
  let cwd = input.cwd;
  if (typeof cwd === "string")
    return cwd;
  let toolCall = input.toolCall;
  if (!toolCall || typeof toolCall !== "object" || Array.isArray(toolCall))
    return null;
  let args = toolCall.args;
  if (!args || typeof args !== "object" || Array.isArray(args))
    return null;
  let commandCwd = args.Cwd;
  return typeof commandCwd === "string" ? commandCwd : null;
}
async function runConfiguredHookAdapter(adapter) {
  let outputDeny = (denial) => outputHookDeny(adapter.createDenyOutput, denial);
  await runHookAdapter({
    agent: adapter.agent,
    getAgent: adapter.getAgent,
    getAuditCwd: adapter.getAuditCwd,
    outputDeny,
    guardDependencies: adapter.guardDependencies,
    isSupported: adapter.isSupported,
    getToolName: adapter.getToolName,
    getToolInput: adapter.getToolInput,
    getContext: adapter.getContext,
    getSessionId: adapter.getSessionId
  });
}

// src/bin/hook/antigravity-cli.ts
var ANTIGRAVITY_CLI_COMMAND_TOOLS = /* @__PURE__ */ new Map([["run_command", "auto"]]), ANTIGRAVITY_PATH_KEYS = /* @__PURE__ */ new Set([
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
    isSupported: () => !0,
    getToolName: (input) => input.toolCall?.name,
    getToolInput: (input, toolName) => ({
      ok: !0,
      input: normalizeAntigravityToolArgs(input.toolCall?.args, toolName),
      route: getAntigravityCliToolRoute(toolName)
    }),
    getContext: resolveAntigravityContext,
    getSessionId: (input) => input.conversationId
  });
}
function resolveAntigravityContext(input, toolInput, toolName, outputDeny) {
  let configRoots = usableWorkspacePaths(input).flatMap((root) => {
    let canonicalRoot = firstTrustedRoot([root]);
    return canonicalRoot ? [canonicalRoot] : [];
  });
  if (!configRoots[0])
    return outputAntigravityCwdDeny(outputDeny, toolInput, toolName), null;
  if (toolName !== "run_command") {
    let targetRoot;
    try {
      targetRoot = resolveAntigravityTargetRoot(toolInput, toolName, configRoots);
    } catch (error) {
      if (error instanceof ToolInputLimitError)
        return outputAntigravityCwdDeny(outputDeny, void 0, toolName), null;
      if (!(error instanceof PathCanonicalizationLimitError))
        throw error;
      return outputAntigravityCwdDeny(outputDeny, toolInput, toolName), null;
    }
    if (!targetRoot)
      return outputAntigravityCwdDeny(outputDeny, toolInput, toolName), null;
    return {
      configCwd: targetRoot,
      executionCwd: targetRoot,
      policyConfigCwds: configRoots
    };
  }
  let args = input.toolCall?.args;
  if (!args || !Object.hasOwn(args, "Cwd"))
    return {
      configCwd: configRoots[0],
      executionCwd: configRoots[0],
      policyConfigCwds: configRoots
    };
  let cwd = args.Cwd;
  if (typeof cwd !== "string" || cwd.trim() === "")
    return outputAntigravityCwdDeny(outputDeny, toolInput, toolName), null;
  let containedCwd = resolveContainedCwd(cwd, configRoots);
  if (containedCwd) {
    let configCwd = mostSpecificContainingRoot(containedCwd, configRoots);
    if (!configCwd)
      return outputAntigravityCwdDeny(outputDeny, toolInput, toolName, cwd), null;
    return { configCwd, executionCwd: containedCwd, policyConfigCwds: configRoots };
  }
  return outputAntigravityCwdDeny(outputDeny, toolInput, toolName, cwd), null;
}
function resolveAntigravityTargetRoot(toolInput, toolName, configRoots) {
  let route = getAntigravityCliToolRoute(toolName), targets = [
    ...extractPathLikeToolValues(toolInput, ANTIGRAVITY_PATH_KEYS),
    ...route.kind === "patch" ? extractPatchTargetsFromToolInput(toolInput) : []
  ].filter(isAbsolute15), budget = createPathCanonicalizationBudget(), targetRoots = new Set(targets.flatMap((target) => {
    let root = mostSpecificContainingRoot(resolveExistingPath(target, budget), configRoots);
    return root ? [root] : [];
  }));
  if (targetRoots.size > 1)
    return null;
  return [...targetRoots][0] ?? configRoots[0] ?? null;
}
function mostSpecificContainingRoot(path, roots) {
  return roots.filter((root) => isSameOrInside(path, root)).reduce((best, root) => root.length > best.length ? root : best, "") || null;
}
function isSameOrInside(path, root) {
  let rel = relative5(root, path);
  return rel === "" || !rel.startsWith("..") && !isAbsolute15(rel);
}
function outputAntigravityCwdDeny(outputDeny, toolInput, toolName, cwd) {
  let command2 = toolInput && typeof toolInput === "object" ? toolInput.command : void 0;
  outputDeny(createFailedClosedDenial({
    command: typeof command2 === "string" ? command2 : void 0,
    segment: cwd,
    toolName
  }));
}
function usableWorkspacePaths(input) {
  if (input.workspacePaths === void 0)
    return [process.cwd()];
  let workspacePaths = Array.isArray(input.workspacePaths) ? input.workspacePaths.filter((path) => typeof path === "string" && path.trim() !== "") : [];
  return firstTrustedRoot(workspacePaths) ? workspacePaths : [];
}
function normalizeAntigravityToolArgs(args, toolName) {
  if (!args)
    return;
  if (toolName !== "run_command")
    return args;
  return {
    ...args,
    command: typeof args.CommandLine === "string" && args.CommandLine !== "" ? args.CommandLine : void 0
  };
}

// src/bin/hook/agent-detection.ts
import { homedir as homedir7 } from "node:os";
import { isAbsolute as isAbsolute16, join as join12 } from "node:path";
function detectClaudeShapeAgent(transcriptPath) {
  if (transcriptPath !== void 0 && transcriptPath !== null && !isAbsolute16(transcriptPath))
    return "unknown";
  try {
    let budget = createPathCanonicalizationBudget(), transcript = transcriptPath ? resolveExistingPath(transcriptPath, budget) : void 0, home = process.env.HOME || homedir7(), roots = [
      ["codex", process.env.CODEX_HOME || join12(home, ".codex")],
      ["copilot-cli", process.env.COPILOT_HOME || join12(home, ".copilot")],
      ["claude-code", process.env.CLAUDE_CONFIG_DIR || join12(home, ".claude")]
    ], matches = transcript ? roots.flatMap(([agent, root]) => {
      if (!isAbsolute16(root))
        return [];
      return isSameOrInsidePath(transcript, resolveExistingPath(root, budget)) ? [agent] : [];
    }) : [];
    if (matches.length === 1)
      return matches[0] ?? "unknown";
    if (matches.length > 1)
      return "unknown";
  } catch (error) {
    if (error instanceof PathCanonicalizationLimitError)
      return "unknown";
    return "unknown";
  }
  if (process.env.CLAUDECODE === "1" || Boolean(process.env.CLAUDE_CODE_ENTRYPOINT))
    return "claude-code";
  return "unknown";
}

// src/bin/hook/constants.ts
var CLAUDE_CODE_HOOK_EVENT = "PreToolUse", GEMINI_CLI_HOOK_EVENT = "BeforeTool", KIMI_CODE_HOOK_EVENT = "PreToolUse";

// src/bin/hook/claude-code.ts
var CLAUDE_CODE_COMMAND_TOOLS = /* @__PURE__ */ new Map([
  ["Bash", "posix"],
  ["PowerShell", "powershell"]
]);
function getClaudeCodeToolRoute(toolName) {
  return getToolRoute(toolName, CLAUDE_CODE_COMMAND_TOOLS);
}
async function runClaudeCodeHook() {
  await runConfiguredHookAdapter({
    agent: "claude-code",
    getAgent: (input) => detectClaudeShapeAgent(input.transcript_path),
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
      ok: !0,
      input: input.tool_input,
      route: getClaudeCodeToolRoute(toolName)
    }),
    getContext: (input, toolInput, toolName, outputDeny) => resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => input.session_id
  });
}

// src/bin/hook/copilot-cli.ts
var COPILOT_CLI_COMMAND_TOOLS = /* @__PURE__ */ new Map([
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
    isSupported: () => !0,
    getToolName: (input) => input.toolName,
    getToolInput: (input, toolName, outputDeny) => {
      if (typeof input.toolArgs !== "string")
        return outputDeny({ reason: "Failed to parse toolArgs JSON." }), { ok: !1 };
      let toolInput = parseHookJson(input.toolArgs, outputDeny, "Failed to parse toolArgs JSON.");
      if (toolInput === void 0)
        return { ok: !1 };
      return { ok: !0, input: toolInput, route: getCopilotCliToolRoute(toolName) };
    },
    getContext: (input, toolInput, toolName, outputDeny) => resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => typeof input.sessionId === "string" && input.sessionId.trim() ? input.sessionId : void 0
  });
}

// src/bin/hook/gemini-cli.ts
var GEMINI_CLI_COMMAND_TOOLS = /* @__PURE__ */ new Map([["run_shell_command", "auto"]]);
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
      ok: !0,
      input: input.tool_input,
      route: getGeminiCliToolRoute(toolName)
    }),
    getContext: (input, toolInput, toolName, outputDeny) => resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => input.session_id
  });
}

// src/bin/hook/kimi-code.ts
var KIMI_CODE_COMMAND_TOOLS = /* @__PURE__ */ new Map([["Bash", "posix"]]);
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
      ok: !0,
      input: input.tool_input,
      route: getKimiCodeToolRoute(toolName)
    }),
    getContext: (input, toolInput, toolName, outputDeny) => resolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
    getSessionId: (input) => input.session_id
  });
}

// src/integrations/catalog.ts
var catalog = [
  {
    id: "antigravity-cli",
    displayName: "Antigravity CLI",
    doctorOrder: 2,
    runtime: {
      order: 1,
      flags: ["-ac", "--agy-cli"],
      description: "Run as Antigravity CLI PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 1,
      flag: "--agy-cli",
      installLabel: "Antigravity CLI",
      probeCommand: ["agy", "--version"]
    }
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    doctorOrder: 1,
    runtime: {
      order: 2,
      displayName: "Coding CLI",
      flags: ["-cc", "--coding-cli"],
      legacyFlags: ["--claude-code"],
      description: "Run as Coding CLI PreToolUse hook",
      legacyTopLevelFlags: ["-cc", "--claude-code"]
    },
    install: {
      order: 2,
      flag: "--claude-code",
      installLabel: "Claude Code",
      probeCommand: ["claude", "--version"]
    }
  },
  {
    id: "codex",
    displayName: "Codex",
    doctorOrder: 3,
    install: {
      order: 3,
      flag: "--codex",
      installLabel: "Codex",
      probeCommand: ["codex", "--version"]
    }
  },
  {
    id: "copilot-cli",
    displayName: "Copilot CLI",
    doctorOrder: 4,
    runtime: {
      order: 3,
      flags: ["-cp", "--copilot-cli"],
      description: "Run as Copilot CLI PreToolUse hook",
      legacyTopLevelFlags: ["-cp", "--copilot-cli"]
    },
    install: {
      order: 5,
      flag: "--copilot-cli",
      installLabel: "GitHub Copilot CLI",
      probeCommand: ["copilot", "--binary-version"]
    }
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    doctorOrder: 5,
    runtime: {
      order: 4,
      flags: ["-gc", "--gemini-cli"],
      description: "Run as Gemini CLI BeforeTool hook",
      legacyTopLevelFlags: ["-gc", "--gemini-cli"]
    },
    install: {
      order: 4,
      flag: "--gemini-cli",
      installLabel: "Gemini CLI",
      probeCommand: ["gemini", "--version"]
    }
  },
  {
    id: "kimi-code",
    displayName: "Kimi Code",
    doctorOrder: 6,
    runtime: {
      order: 5,
      flags: ["-kc", "--kimi-code"],
      description: "Run as Kimi Code PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 6,
      flag: "--kimi-code",
      installLabel: "Kimi Code",
      probeCommand: ["kimi", "--version"]
    }
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    doctorOrder: 7,
    install: {
      order: 7,
      flag: "--opencode",
      installLabel: "OpenCode",
      probeCommand: ["opencode", "--version"]
    }
  },
  {
    id: "pi",
    displayName: "Pi",
    doctorOrder: 8,
    install: {
      order: 8,
      flag: "--pi",
      installLabel: "Pi",
      probeCommand: ["pi", "--version"]
    }
  }
], doctorIntegrationOrder = catalog.slice().sort((a, b) => a.doctorOrder - b.doctorOrder).map((integration) => integration.id), runtimeHookIntegrationMetadata = catalog.filter((integration) => ("runtime" in integration)).slice().sort((a, b) => a.runtime.order - b.runtime.order).map((integration) => ({
  id: integration.id,
  displayName: "displayName" in integration.runtime ? integration.runtime.displayName : integration.displayName,
  flags: integration.runtime.flags,
  legacyFlags: "legacyFlags" in integration.runtime ? integration.runtime.legacyFlags : [],
  description: integration.runtime.description,
  legacyTopLevelFlags: integration.runtime.legacyTopLevelFlags
})), installIntegrationMetadata = catalog.slice().sort((a, b) => a.install.order - b.install.order).map((integration) => ({ id: integration.id, ...integration.install })).map(({ order: _, ...integration }) => integration);
function getIntegrationDisplayName(id) {
  return catalog.find((integration) => integration.id === id)?.displayName ?? id;
}
function getIntegrationInstallLabel(id) {
  return catalog.find((integration) => integration.id === id)?.install.installLabel ?? id;
}

// src/bin/hook/integrations.ts
var hookRunners = {
  "antigravity-cli": runAntigravityCliHook,
  "claude-code": runClaudeCodeHook,
  "copilot-cli": runCopilotCliHook,
  "gemini-cli": runGeminiCLIHook,
  "kimi-code": runKimiCodeHook
}, hookIntegrations = runtimeHookIntegrationMetadata.map((integration) => ({
  ...integration,
  run: hookRunners[integration.id]
}));
function findHookIntegrationByFlag(args) {
  return hookIntegrations.find((integration) => [...integration.flags, ...integration.legacyFlags].some((flag) => args.includes(flag)));
}
function findLegacyTopLevelHookIntegration(flag) {
  return hookIntegrations.find((integration) => integration.legacyTopLevelFlags.some((integrationFlag) => integrationFlag === flag));
}

// src/bin/commands/hook.ts
var platformOptions = hookIntegrations.map((integration) => ({
  flags: integration.flags.join(", "),
  description: integration.description
})), platformExamples = hookIntegrations.flatMap((integration) => integration.flags.map((flag) => `cc-safety-net hook ${flag}`)), hookCommand = {
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
], installCommand = {
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
}, uninstallCommand = {
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
      flags: "--id",
      argument: "<id>",
      description: "Show one audit entry by its 16-character id"
    },
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
    "cc-safety-net logs --id 3fa9c2d1a70e8b42",
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
  let normalized = nameOrAlias.toLowerCase();
  return commands.find((cmd) => cmd.name.toLowerCase() === normalized || getCommandAliases(cmd).some((alias) => alias.toLowerCase() === normalized));
}
function getVisibleCommands() {
  return commands.filter(isVisibleCommand);
}

// src/bin/doctor/activity.ts
import { readFileSync as readFileSync6 } from "node:fs";
import { basename as basename4 } from "node:path";
function formatRelativeTime(date) {
  let diff = Date.now() - date.getTime(), minutes = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(hours / 24);
  if (days > 0)
    return `${days}d ago`;
  if (hours > 0)
    return `${hours}h ago`;
  if (minutes > 0)
    return `${minutes}m ago`;
  return "just now";
}
function getActivitySummary(days = 7, logsDir = getAuditLogsDir()) {
  let cutoff = Date.now() - days * 24 * 60 * 60 * 1000, recentEntries = [], recentSessions = /* @__PURE__ */ new Set, totalBlocked = 0, oldestEntry, oldestEntryTs, newestEntry, newestEntryTs, files = logsDir ? listAuditLogFiles(logsDir) : [];
  for (let file of files)
    try {
      let lines = readFileSync6(file, "utf-8").trim().split(`
`).filter(Boolean);
      for (let line of lines)
        try {
          let entry = JSON.parse(line);
          if (entry.decision === "allow")
            continue;
          let ts = new Date(entry.ts).getTime();
          if (ts >= cutoff) {
            if (totalBlocked++, recentSessions.add(entry.sessionId ?? basename4(file, ".jsonl")), oldestEntryTs === void 0 || ts <= oldestEntryTs)
              oldestEntry = entry.ts, oldestEntryTs = ts;
            if (newestEntryTs === void 0 || ts > newestEntryTs)
              newestEntry = entry.ts, newestEntryTs = ts;
            insertRecentEntry(recentEntries, entry, ts);
          }
        } catch {}
    } catch {}
  let displayEntries = recentEntries.map((e) => ({
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
  let index = entries.findIndex((existing) => ts > new Date(existing.ts).getTime());
  if (index === -1) {
    if (entries.length < 3)
      entries.push(entry);
    return;
  }
  if (entries.splice(index, 0, entry), entries.length > 3)
    entries.pop();
}

// src/bin/doctor/config.ts
import { dirname as dirname11 } from "node:path";

// src/core/config.ts
import { resolve as resolve12 } from "node:path";
function validateConfig(config) {
  let errors = [], ruleNames = /* @__PURE__ */ new Set;
  if (!config || typeof config !== "object")
    return errors.push("Config must be an object"), { errors, ruleNames };
  let cfg = config;
  if (cfg.version !== 1)
    errors.push("version must be 1");
  if (cfg.rules !== void 0)
    if (!Array.isArray(cfg.rules))
      errors.push("rules must be an array");
    else
      for (let i = 0;i < cfg.rules.length; i++)
        errors.push(...validateCustomRule(cfg.rules[i], i, ruleNames));
  return { errors, ruleNames };
}
function validateConfigFile(path) {
  return validateParsedConfigFile(path, validateConfig);
}
function readConfigFileInput(path) {
  let errors = [], ruleNames = /* @__PURE__ */ new Set;
  try {
    let target = typeof path === "string" ? bindDelegatedPolicyFilesystemTarget(path) : path, content = readPolicyFile(target);
    if (content === null)
      return errors.push(`File not found: ${target.path}`), { ok: !1, result: { errors, ruleNames } };
    if (!content.trim())
      return errors.push("Config file is empty"), { ok: !1, result: { errors, ruleNames } };
    return { ok: !0, parsed: JSON.parse(content) };
  } catch (error) {
    return errors.push(error instanceof PolicyFilesystemError ? error.message : "Invalid JSON"), { ok: !1, result: { errors, ruleNames } };
  }
}
function getLegacyProjectConfigPath(cwd) {
  return resolve12(cwd ?? process.cwd(), ".safety-net.json");
}
function validateRulesConfigFile(path) {
  let loaded = readConfigFileInput(path);
  if (!loaded.ok)
    return loaded.result;
  let result = validateRulesConfig(loaded.parsed);
  return { errors: result.errors, ruleNames: result.sources };
}
function validateParsedConfigFile(path, validate) {
  let loaded = readConfigFileInput(path);
  if (!loaded.ok)
    return loaded.result;
  return validate(loaded.parsed);
}
// src/core/rules/policy/sync.ts
import { isAbsolute as isAbsolute17, join as join13, relative as relative6, resolve as resolve13, sep as sep8 } from "node:path";
async function syncRulesConfig(options2 = {}) {
  return syncRulesConfigInternal(projectSyncOptions(options2), createRuleSyncOperation());
}
async function syncRulesConfigInternal(options2, operation, discoveredDisplayRefs, hooks = {}) {
  let lockSnapshot = null, lockPublished = !1;
  try {
    let scope = getScopePaths(options2), scopeConfig = readScopeRulesConfig(scope.configTarget);
    if (!scopeConfig.ok)
      return scopeConfig.result;
    let config = scopeConfig.config;
    if (options2.check)
      return checkRulesConfig(config, scope, options2);
    lockSnapshot = { target: scope.lockTarget, content: readPolicyFile(scope.lockTarget) };
    let existingLockResult = readLockfile(scope.lockTarget);
    if (existingLockResult.errors.some((error) => error.startsWith("Unable to access ")))
      return {
        ok: !1,
        errors: existingLockResult.errors,
        warnings: [],
        entries: []
      };
    if (options2.only && existingLockResult.errors.length > 0)
      return { ok: !1, errors: existingLockResult.errors, warnings: [], entries: [] };
    let previousLock = existingLockResult.errors.length > 0 ? null : existingLockResult.lock, selectedSpecs = options2.only ? getSelectedUpdateSpecs(config, previousLock, options2.only) : { ok: !0, specs: config.rules };
    if (!selectedSpecs.ok)
      return selectedSpecs.result;
    if (options2.only && !previousLock && selectedSpecs.specs.length < config.rules.length)
      return {
        ok: !1,
        errors: [`No lockfile available for partial update; run ${RULE_SYNC_COMMAND}`],
        warnings: [],
        entries: []
      };
    let resolved = (await mapRulebookSources(selectedSpecs.specs, (spec) => resolveRulebookSourceForSync(spec, scope.configDir, options2, previousLock, scope.filesystemScope, operation), operation)).map((item) => preserveDisplayRef(item, previousLock, discoveredDisplayRefs));
    for (let item of resolved)
      writeCache(item.content, item.entry, scope.configDir, options2, scope.filesystemScope);
    let entries = options2.only ? mergeSelectedLockEntries(config, previousLock, resolved) : resolved.map((item) => item.entry);
    lockPublished = !0, writeJsonAtomic(scope.lockTarget, { version: 1, rulebooks: entries }, void 0, hooks._testAfterPolicyRename);
    let ruleCountsBySpec = new Map(resolved.map((item) => [item.entry.spec, item.rulebook.rules.length])), warnings = pruneUnreferencedRulebookCaches(entries, scope.configDir, options2, scope.filesystemScope, hooks);
    return {
      ok: !0,
      errors: [],
      warnings,
      entries: entries.map((entry) => addRuleCount(entry, ruleCountsBySpec))
    };
  } catch (error) {
    if (lockPublished && lockSnapshot)
      try {
        restoreConfig(lockSnapshot.target, lockSnapshot.content);
      } catch (rollbackError) {
        return failWithError(rollbackError);
      }
    return failWithError(error);
  }
}
async function testRulebookSources(sources, options2 = {}) {
  if (sources.length > RULE_SOURCE_LIMIT)
    return sourceLimitResult();
  let projectedOptions = projectSyncOptions(options2), scope = getScopePaths(projectedOptions);
  try {
    let operation = createRuleSyncOperation(), resolved = await mapRulebookSources(sources, (spec) => resolveRulebookSource(spec, scope.configDir, projectedOptions, scope.filesystemScope, operation), operation), ruleCountsBySpec = new Map(resolved.map((item) => [item.entry.spec, item.rulebook.rules.length])), testCountsBySpec = new Map(resolved.map((item) => [item.entry.spec, item.rulebook.tests.length])), fixtureErrors = resolved.flatMap((item) => runRulebookFixtures(item.rulebook).failures.map((failure) => [
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
  return addRulebookSourceInternal(source, projectSyncOptions(options2), createRuleSyncOperation());
}
async function addRulebookSourceInternal(source, options2, operation, hooks = {}) {
  let configSnapshot = null, configWriteArmed = !1;
  try {
    let scope = getScopePaths(options2), before = readPolicyFile(scope.configTarget);
    configSnapshot = { target: scope.configTarget, content: before };
    let scopeConfig = readScopeRulesConfig(scope.configTarget);
    if (!scopeConfig.ok)
      return scopeConfig.result;
    let config = scopeConfig.config, discoveredSources = isGitHubRepositorySource(source) ? await discoverGitHubRepositoryRulebooks(source, operation) : [{ spec: source }], sources = discoveredSources.map((item) => item.spec), nextRules = [.../* @__PURE__ */ new Set([...config.rules, ...sources])];
    if (nextRules.length > RULE_SOURCE_LIMIT)
      return sourceLimitResult();
    if (nextRules.length !== config.rules.length)
      configWriteArmed = !0, writeJsonAtomic(scope.configTarget, {
        version: 1,
        rules: nextRules,
        overrides: config.overrides ?? {},
        transparent_wrappers: config.transparent_wrappers ?? []
      }, void 0, hooks._testAfterPolicyRename);
    let result = await syncRulesConfigInternal(options2, operation, new Map(discoveredSources.filter((item) => !!item.display_ref).map((item) => [item.spec, item.display_ref])), hooks);
    if (!result.ok)
      restoreConfig(scope.configTarget, before);
    return result;
  } catch (error) {
    if (configWriteArmed && configSnapshot)
      try {
        restoreConfig(configSnapshot.target, configSnapshot.content);
      } catch (rollbackError) {
        return failWithError(rollbackError);
      }
    return failWithError(error);
  }
}
async function mapRulebookSources(sources, mapper, operation = createRuleSyncOperation()) {
  if (sources.length > RULE_SOURCE_LIMIT)
    throw Error(RULE_SOURCE_LIMIT_ERROR);
  let results = Array(sources.length), nextIndex = 0, firstError, workers = Array.from({ length: Math.min(sources.length, RULE_SYNC_RESOURCE_LIMITS.concurrency) }, async () => {
    while (!firstError) {
      let index = nextIndex;
      if (index >= sources.length)
        return;
      nextIndex++;
      try {
        results[index] = await mapper(sources[index], index, operation.controller.signal);
      } catch (error) {
        if (!firstError)
          firstError = { value: error }, nextIndex = sources.length, operation.controller.abort(error);
        return;
      }
    }
  });
  if (await Promise.all(workers), firstError)
    throw firstError.value;
  return results;
}
function sourceLimitResult() {
  return { ok: !1, errors: [RULE_SOURCE_LIMIT_ERROR], warnings: [], entries: [] };
}
function projectSyncOptions(options2) {
  return {
    cwd: options2.cwd,
    cacheConfigDir: options2.cacheConfigDir,
    userConfigDir: options2.userConfigDir,
    userConfigPath: options2.userConfigPath,
    projectConfigPath: options2.projectConfigPath,
    global: options2.global,
    check: options2.check,
    only: options2.only,
    refresh: options2.refresh
  };
}
function projectRemoveOptions(options2) {
  let projected = projectSyncOptions(options2);
  return {
    cwd: projected.cwd,
    cacheConfigDir: projected.cacheConfigDir,
    userConfigDir: projected.userConfigDir,
    userConfigPath: projected.userConfigPath,
    projectConfigPath: projected.projectConfigPath,
    global: projected.global,
    check: projected.check,
    only: projected.only,
    refresh: projected.refresh,
    deleteSource: options2.deleteSource
  };
}
async function removeRulebookSource(match, options2 = {}) {
  try {
    return await removeRulebookSourceInternal(match, projectRemoveOptions(options2), {});
  } catch (error) {
    return failWithError(error);
  }
}
async function removeRulebookSourceInternal(match, options2, hooks) {
  let scope = getScopePaths(options2), loaded = readRulesConfig(scope.configTarget);
  if (loaded.errors.length > 0)
    return { ok: !1, errors: loaded.errors, warnings: [], entries: [] };
  if (!loaded.config)
    return {
      ok: !1,
      errors: [`No config found at ${scope.configPath}`],
      warnings: [],
      entries: []
    };
  let lockResult = readLockfile(scope.lockTarget);
  if (lockResult.errors.length > 0)
    return { ok: !1, errors: lockResult.errors, warnings: [], entries: [] };
  let matches = getRemoveMatches(loaded.config.rules, lockResult.lock, match);
  if (!matches.ok)
    return matches.result;
  let sourceDirs = options2.deleteSource ? getLocalSourceDirsForDelete(scope.configDir, matches.specs, lockResult.lock, scope.filesystemScope) : { ok: !0, dirs: [] };
  if (!sourceDirs.ok)
    return sourceDirs.result;
  let before = readPolicyFile(scope.configTarget);
  if (before === null)
    return failWithError(Error("Rules config is unavailable."));
  try {
    writeJsonAtomic(scope.configTarget, {
      version: 1,
      rules: loaded.config.rules.filter((spec) => !matches.specs.includes(spec)),
      overrides: loaded.config.overrides ?? {},
      transparent_wrappers: loaded.config.transparent_wrappers ?? []
    }, void 0, hooks._testAfterPolicyRename);
  } catch (error) {
    throw restoreConfig(scope.configTarget, before), error;
  }
  let result = await syncRulesConfigInternal(options2, createRuleSyncOperation(), void 0, hooks);
  if (!result.ok)
    return restoreConfig(scope.configTarget, before), result;
  let deleteResult = deleteLocalSourceDirs(sourceDirs.dirs, hooks, scope.filesystemScope);
  if (!deleteResult.ok) {
    restoreConfig(scope.configTarget, before);
    let rollback = await syncRulesConfigInternal(options2, createRuleSyncOperation(), void 0, hooks);
    if (!rollback.ok)
      return {
        ok: !1,
        errors: [...deleteResult.result.errors, ...rollback.errors],
        warnings: rollback.warnings,
        entries: rollback.entries
      };
    return deleteResult.result;
  }
  return result;
}
async function checkRulesConfig(config, scope, options2) {
  let result = loadScopePolicy(config, scope.lockPath, scope.configDir, options2, options2.global ? "user" : "project", scope.filesystemScope);
  return {
    ok: result.errors.length === 0,
    errors: result.errors,
    warnings: [],
    entries: result.entries
  };
}
function preserveDisplayRef(item, previousLock, discoveredDisplayRefs) {
  let previousEntry = previousLock?.rulebooks.find((entry) => entry.spec === item.entry.spec && entry.kind === "github"), displayRef = discoveredDisplayRefs?.get(item.entry.spec) ?? (previousEntry?.kind === "github" ? previousEntry.display_ref : void 0);
  if (!displayRef || item.entry.kind !== "github")
    return item;
  return { ...item, entry: { ...item.entry, display_ref: displayRef } };
}
function mergeSelectedLockEntries(config, previousLock, resolved) {
  let configuredSpecs = new Set(config.rules), previousSpecs = new Set(previousLock?.rulebooks.map((entry) => entry.spec) ?? []), resolvedBySpec = new Map(resolved.map((item) => [item.entry.spec, item.entry]));
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
function writeCache(content, entry, configDir, options2, filesystemScope) {
  let path = getRulebookCachePath(entry, getRulebookCacheOptions(configDir, options2));
  writePolicyFileAtomic(getPolicyFilesystemTargetForPath(filesystemScope, path), content);
}
function pruneUnreferencedRulebookCaches(entries, configDir, options2, filesystemScope, hooks) {
  let cacheOptions = getRulebookCacheOptions(configDir, options2), cacheRoot = getRulebookCacheRoot(cacheOptions), cacheRootTarget = getPolicyFilesystemTargetForPath(filesystemScope, cacheRoot), cacheEntries = readPolicyDirectoryEntries(cacheRootTarget);
  if (!cacheEntries)
    return [];
  let keepTargets = entries.map((entry) => getPolicyFilesystemTargetForPath(filesystemScope, getRulebookCachePath(entry, cacheOptions))), pruneTargets = cacheEntries.filter((entry) => entry.kind === "directory").map((entry) => ({
    directory: getPolicyFilesystemTargetForPath(filesystemScope, join13(cacheRoot, entry.name)),
    identity: getPolicyFilesystemTargetForPath(filesystemScope, join13(cacheRoot, entry.name, RULEBOOK_FILE))
  })).filter((candidate) => !keepTargets.some((target) => isSamePolicyFilesystemTarget(candidate.identity, target))).map((candidate) => candidate.directory);
  for (let target of pruneTargets)
    validatePolicyDirectoryRemoval(target);
  return pruneTargets.flatMap((target) => {
    try {
      return pruneRulebookCacheDir(target, hooks), [];
    } catch {
      return ["Unable to prune rules policy cache safely."];
    }
  });
}
function getLocalSourceDirsForDelete(configDir, specs, lock, filesystemScope) {
  let entriesBySpec = new Map(lock?.rulebooks.map((entry) => [entry.spec, entry]) ?? []), errors = specs.flatMap((spec) => {
    let entry = entriesBySpec.get(spec);
    if (!entry)
      return NAME_PATTERN.test(spec) ? [] : ["--delete-source can only delete local rulebook sources"];
    return entry.kind === "local-directory" ? [] : ["--delete-source can only delete local rulebook sources"];
  }), dirs = specs.map((spec) => {
    let entry = entriesBySpec.get(spec);
    return join13(configDir, entry?.kind === "local-directory" ? entry.path : spec);
  }), dirErrors = errors.length > 0 ? [] : dirs.flatMap((dir) => getLocalSourceDirDeleteError(configDir, dir, filesystemScope)), allErrors = [...errors, ...dirErrors];
  return allErrors.length > 0 ? { ok: !1, result: { ok: !1, errors: allErrors, warnings: [], entries: [] } } : { ok: !0, dirs };
}
function getLocalSourceDirDeleteError(configDir, dir, filesystemScope) {
  let resolvedConfigDir = resolve13(configDir), resolvedDir = resolve13(dir), relativeDir = relative6(resolvedConfigDir, resolvedDir);
  if (relativeDir === "" || relativeDir === ".." || relativeDir.startsWith(`..${sep8}`) || isAbsolute17(relativeDir))
    return [`Refusing to delete local rulebook source outside ${configDir}: ${dir}`];
  let target = getPolicyFilesystemTargetForPath(filesystemScope, resolvedDir), entries = readPolicyDirectoryEntries(target);
  if (!entries)
    return [`Local rulebook source directory not found: ${dir}`];
  let rulebookEntry = entries.find((entry) => entry.name === "rulebook.json");
  if (!rulebookEntry)
    return [`Local rulebook source directory is missing rulebook.json: ${dir}`];
  if (rulebookEntry.kind !== "file")
    throw new PolicyFilesystemError(filesystemScope.label);
  if (readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, join13(resolvedDir, "rulebook.json"))), entries.length > 1)
    return [
      `Local rulebook source directory contains extra files: ${dir}. delete manually if you really want to remove the directory.`
    ];
  return [];
}
function deleteLocalSourceDirs(dirs, hooks, filesystemScope) {
  let errors = dirs.flatMap((dir) => {
    try {
      return deleteLocalSourceDir(getPolicyFilesystemTargetForPath(filesystemScope, dir), hooks), [];
    } catch (error) {
      return [
        `Failed to delete local rulebook source ${dir}: ${error instanceof Error ? error.message : String(error)}`
      ];
    }
  });
  return errors.length > 0 ? { ok: !1, result: { ok: !1, errors, warnings: [], entries: [] } } : { ok: !0 };
}
function pruneRulebookCacheDir(target, hooks) {
  if (hooks._testPruneRulebookCacheDir) {
    hooks._testPruneRulebookCacheDir(target.path);
    return;
  }
  removePolicyDirectory(target);
}
function deleteLocalSourceDir(target, hooks) {
  if (hooks._testDeleteLocalSourceDir) {
    hooks._testDeleteLocalSourceDir(target.path);
    return;
  }
  removePolicyDirectory(target);
}
function restoreConfig(path, content) {
  if (content === null) {
    removePolicyFile(path);
    return;
  }
  writePolicyFileAtomic(path, content);
}
function failWithError(error) {
  return {
    ok: !1,
    errors: [error instanceof Error ? error.message : String(error)],
    warnings: [],
    entries: []
  };
}
// src/bin/doctor/config.ts
function getConfigSourceInfo(path, lockPath, userConfigDir, target, filesystemScope) {
  let validation;
  try {
    if (readPolicyFile(target) === null)
      return { path, exists: !1, valid: !1, ruleCount: 0 };
    validation = validateRulesConfigFile(target), validation.errors.push(...getRulesConfigRuntimeErrorsForConfig(path, lockPath, { userConfigDir }, filesystemScope));
  } catch (error) {
    if (!(error instanceof PolicyFilesystemError))
      throw error;
    validation = { errors: [error.message], ruleNames: /* @__PURE__ */ new Set };
  }
  return {
    path,
    exists: !0,
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
    blockArgs: [...rule.block_args],
    reason: rule.reason
  };
}
function getConfigInfo(cwd, options2) {
  let userPath = options2?.userConfigPath ?? getUserRulesConfigPath(), projectPath = options2?.projectConfigPath ?? getProjectRulesConfigPath(cwd), userConfigDir = dirname11(userPath), policy = loadRulesPolicy({
    cwd,
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    userConfigDir
  }), paths = getPolicyPaths({
    cwd,
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    userConfigDir
  }), rulebookSources = new Map(policy.rulebooks.flatMap((rulebook) => rulebook.rules.map((rule) => [rule, rulebook.source])));
  return {
    userConfig: getConfigSourceInfo(userPath, getUserRulesLockPath({ userConfigPath: userPath }), userConfigDir, paths.userConfigTarget, paths.userScope),
    projectConfig: getConfigSourceInfo(projectPath, getRulesLockPathForConfigPath(projectPath), userConfigDir, paths.projectConfigTarget, paths.projectScope),
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
      legacyValue: v.flag.legacyName ? process.env[v.flag.legacyName] : void 0,
      legacyIsSet: v.flag.legacyName ? process.env[v.flag.legacyName] !== void 0 : void 0,
      description: v.description,
      defaultBehavior: v.defaultBehavior
    })),
    {
      name: "CC_SAFETY_NET_HOME",
      value: process.env.CC_SAFETY_NET_HOME,
      isSet: process.env.CC_SAFETY_NET_HOME !== void 0,
      description: "Override user-scope config/cache directory",
      defaultBehavior: "~/.cc-safety-net"
    }
  ];
}

// src/bin/utils/colors.ts
function shouldUseColor() {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
}
var green = (s) => shouldUseColor() ? `\x1B[32m${s}\x1B[0m` : s, yellow = (s) => shouldUseColor() ? `\x1B[33m${s}\x1B[0m` : s, blue = (s) => shouldUseColor() ? `\x1B[34m${s}\x1B[0m` : s, magenta = (s) => shouldUseColor() ? `\x1B[35m${s}\x1B[0m` : s, cyan = (s) => shouldUseColor() ? `\x1B[36m${s}\x1B[0m` : s, red = (s) => shouldUseColor() ? `\x1B[31m${s}\x1B[0m` : s, dim = (s) => shouldUseColor() ? `\x1B[2m${s}\x1B[0m` : s, bold = (s) => shouldUseColor() ? `\x1B[1m${s}\x1B[0m` : s, colors = {
  green,
  yellow,
  blue,
  magenta,
  cyan,
  red,
  dim,
  bold
}, ANSI_RESET = "\x1B[0m", DISTINCT_COLORS = [
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
    return state = (state * 1664525 + 1013904223) % 4294967296, state / 4294967296;
  };
}
function getShuffledPalette(seed) {
  let palette = [...DISTINCT_COLORS], random = createRandom(seed);
  for (let i = palette.length - 1;i > 0; i--) {
    let j = Math.floor(random() * (i + 1)), temp = palette[i];
    palette[i] = palette[j], palette[j] = temp;
  }
  return palette;
}
function generateDistinctColor(index, seed = 0) {
  if (!shouldUseColor())
    return "";
  let palette = getShuffledPalette(seed);
  return `\x1B[38;5;${palette[index % palette.length]}m`;
}
function colorizeToken(token, index, seed = 0) {
  if (!shouldUseColor())
    return `"${token}"`;
  return `${generateDistinctColor(index, seed)}"${token}"${ANSI_RESET}`;
}

// src/bin/doctor/format.ts
function formatAsciiTable(options2) {
  let rawRows = options2.rawRows ?? options2.rows, colWidths = (options2.headers ?? rawRows[0] ?? []).map((h, i) => {
    let maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  }), pad = (s, w, raw) => s + " ".repeat(Math.max(0, w - raw.length)), line = (char, corners) => corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2], formatRow = (cells, rawCells) => `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? "")).join(" │ ")} │`, headerLines = options2.headers ? [`   ${formatRow(options2.headers, options2.headers)}`, `   ${line("─", ["├", "┼", "┤"])}`] : [];
  return [
    `   ${line("─", ["┌", "┬", "┐"])}`,
    ...headerLines,
    ...options2.rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line("─", ["└", "┴", "┘"])}`
  ].join(`
`);
}
function formatHooksSection(hooks) {
  let lines = [];
  lines.push("Hook Integration"), lines.push(formatHooksTable(hooks));
  let failures = [], warnings = [], errors = [];
  for (let hook of hooks) {
    let platformName = getIntegrationDisplayName(hook.platform);
    if (hook.selfTest) {
      for (let result of hook.selfTest.results)
        if (!result.passed)
          failures.push({ platform: platformName, result });
    }
    if (hook.errors && hook.errors.length > 0)
      for (let err of hook.errors)
        if (hook.status === "configured")
          warnings.push({ platform: platformName, message: err });
        else
          errors.push({ platform: platformName, message: err });
  }
  if (failures.length > 0) {
    lines.push(""), lines.push(colors.red("   Failures:"));
    for (let f of failures)
      lines.push(colors.red(`   • ${f.platform}: ${f.result.description}`)), lines.push(colors.red(`     expected ${f.result.expected}, got ${f.result.actual}`));
  }
  for (let w of warnings)
    lines.push(`   Warning (${w.platform}): ${w.message}`);
  for (let e of errors)
    lines.push(colors.red(`   Error (${e.platform}): ${e.message}`));
  return lines.join(`
`);
}
function formatHooksTable(hooks) {
  let headers = ["Platform", "Status", "Tests"], getStatusDisplay = (h) => {
    switch (h.status) {
      case "configured":
        return { text: "Configured", colored: colors.green("Configured") };
      case "disabled":
        return { text: "Disabled", colored: colors.yellow("Disabled") };
      case "n/a":
        return { text: "N/A", colored: colors.dim("N/A") };
    }
  }, rowData = hooks.map((h) => {
    let platformName = getIntegrationDisplayName(h.platform), statusDisplay = getStatusDisplay(h), testsText = "-";
    if (h.status === "configured" && h.selfTest) {
      let label = h.selfTest.failed > 0 ? "FAIL" : "OK";
      testsText = `${h.selfTest.passed}/${h.selfTest.total} ${label}`;
    }
    return {
      colored: [platformName, statusDisplay.colored, testsText],
      raw: [platformName, statusDisplay.text, testsText]
    };
  }), rows = rowData.map((r) => r.colored), rawRows = rowData.map((r) => r.raw);
  return formatAsciiTable({ headers, rows, rawRows });
}
function formatRulesTable(rules) {
  if (rules.length === 0)
    return "   (no custom rules)";
  let headers = ["Source", "Name", "Command", "Block Args"], rows = rules.map((r) => [
    r.source,
    r.name,
    r.subcommand ? `${r.command} ${r.subcommand}` : r.command,
    r.blockArgs.join(", ")
  ]);
  return formatAsciiTable({ headers, rows });
}
function formatConfigSection(report) {
  let lines = [];
  if (lines.push("Configuration"), lines.push(formatConfigTable(report.userConfig, report.projectConfig)), lines.push(""), report.effectiveRules.length > 0)
    lines.push(`   Effective rules (${report.effectiveRules.length} total):`), lines.push(formatRulesTable(report.effectiveRules));
  else
    lines.push("   Effective rules: (none - using built-in rules only)");
  for (let shadow of report.shadowedRules)
    lines.push(""), lines.push(`   Note: Project rule "${shadow.name}" shadows user rule with same name`);
  return lines.join(`
`);
}
function formatConfigTable(userConfig, projectConfig) {
  let headers = ["Scope", "Status"], getStatusDisplay = (config) => {
    if (!config.exists)
      return { text: "N/A", colored: colors.dim("N/A") };
    if (!config.valid) {
      let text = `Invalid (${config.errors?.[0] ?? "unknown error"})`;
      return { text, colored: colors.red(text) };
    }
    return { text: "Configured", colored: colors.green("Configured") };
  }, userStatus = getStatusDisplay(userConfig), projectStatus = getStatusDisplay(projectConfig), rows = [
    ["User", userStatus.colored],
    ["Project", projectStatus.colored]
  ], rawRows = [
    ["User", userStatus.text],
    ["Project", projectStatus.text]
  ];
  return formatAsciiTable({ headers, rows, rawRows });
}
function formatEnvironmentSection(envVars) {
  let lines = [];
  return lines.push("Environment"), lines.push(formatEnvironmentTable(envVars)), lines.join(`
`);
}
function formatEffectiveSafetySection(report) {
  let lines = [
    "Effective Safety",
    `   Selected preset: ${report.effectiveSafety.selectedPreset}`,
    `   Effective: ${report.effectiveSafety.level}`
  ], capabilityLabels = [
    ["fail_closed", "fail_closed"],
    ["paranoid_rm", "paranoid_rm"],
    ["paranoid_interpreters", "paranoid_interpreters"]
  ];
  for (let [key, label] of capabilityLabels) {
    let capability = report.effectiveSafety.capabilities[key], state = capability.enabled ? colors.green("ON") : colors.dim("OFF"), sources = capability.sources.length > 0 ? ` (${capability.sources.join(", ")})` : "";
    lines.push(`   ${label}: ${state} via ${capability.source}${sources}`);
  }
  lines.push(`   Stored rule customizations: ${report.effectiveSafety.ruleCounts.stored}`), lines.push(`   Effective rule customizations: ${report.effectiveSafety.ruleCounts.effective}`);
  for (let [id, override] of Object.entries(report.effectiveSafety.ruleOverrides))
    lines.push(`   ${id}: ${override}`);
  return lines.join(`
`);
}
function formatEnvironmentTable(envVars) {
  let headers = ["Variable", "Status", "Legacy"], rows = envVars.map((v) => {
    let statusIcon = v.isSet ? colors.green("✓") : colors.dim("✗"), legacyStatus = v.legacyName && v.legacyIsSet ? `${v.legacyName} ${colors.green("✓")}` : v.legacyName ?? "";
    return [v.name, statusIcon, legacyStatus];
  }), rawRows = envVars.map((v) => [
    v.name,
    v.isSet ? "✓" : "✗",
    v.legacyName && v.legacyIsSet ? `${v.legacyName} ✓` : v.legacyName ?? ""
  ]);
  return formatAsciiTable({ headers, rows, rawRows });
}
function formatActivitySection(activity) {
  let lines = [];
  if (activity.totalBlocked === 0)
    lines.push("Recent Activity"), lines.push("   No blocked commands in the last 7 days"), lines.push("   Tip: This is normal for new installations");
  else
    lines.push(`Recent Activity (${activity.totalBlocked} blocked / ${activity.sessionCount} sessions)`), lines.push(formatActivityTable(activity.recentEntries));
  return lines.join(`
`);
}
function formatActivityTable(entries) {
  let headers = ["Time", "Command"], rows = entries.map((e) => {
    let cmd = e.command.length > 40 ? `${e.command.slice(0, 37)}...` : e.command;
    return [e.relativeTime, cmd];
  });
  return formatAsciiTable({ headers, rows });
}
function formatUpdateSection(update) {
  let lines = [];
  lines.push("Update Check");
  let rowData = [];
  if (update.latestVersion === null && !update.error)
    return rowData.push({
      label: "Status",
      value: colors.dim("Skipped"),
      rawValue: "Skipped"
    }), rowData.push({
      label: "Installed",
      value: update.currentVersion,
      rawValue: update.currentVersion
    }), lines.push(formatUpdateTable(rowData)), lines.join(`
`);
  if (update.error)
    return rowData.push({
      label: "Status",
      value: `${colors.yellow("⚠")} Error`,
      rawValue: "⚠ Error"
    }), rowData.push({
      label: "Installed",
      value: update.currentVersion,
      rawValue: update.currentVersion
    }), rowData.push({
      label: "Error",
      value: colors.dim(update.error),
      rawValue: update.error
    }), lines.push(formatUpdateTable(rowData)), lines.join(`
`);
  if (update.updateAvailable)
    return rowData.push({
      label: "Status",
      value: `${colors.yellow("⚠")} Update Available`,
      rawValue: "⚠ Update Available"
    }), rowData.push({
      label: "Current",
      value: update.currentVersion,
      rawValue: update.currentVersion
    }), rowData.push({
      label: "Latest",
      value: colors.green(update.latestVersion ?? ""),
      rawValue: update.latestVersion ?? ""
    }), lines.push(formatUpdateTable(rowData)), lines.push(""), lines.push("   Run: bunx cc-safety-net@latest doctor"), lines.push("   Or:  npx cc-safety-net@latest doctor"), lines.join(`
`);
  return rowData.push({
    label: "Status",
    value: `${colors.green("✓")} Up to date`,
    rawValue: "✓ Up to date"
  }), rowData.push({
    label: "Version",
    value: update.currentVersion,
    rawValue: update.currentVersion
  }), lines.push(formatUpdateTable(rowData)), lines.join(`
`);
}
function formatUpdateTable(rowData) {
  let rows = rowData.map((r) => [r.label, r.value]), rawRows = rowData.map((r) => [r.label, r.rawValue]);
  return formatAsciiTable({ rows, rawRows });
}
function formatSystemInfoSection(system) {
  let lines = [];
  return lines.push("System Info"), lines.push(formatSystemInfoTable(system)), lines.join(`
`);
}
function formatSystemInfoTable(system) {
  let headers = ["Component", "Version"], formatValue = (value) => {
    if (value === null)
      return colors.dim("not found");
    return value;
  }, rawValue = (value) => {
    return value ?? "not found";
  }, rowData = [
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
  ], rows = rowData.map((r) => [r.label, formatValue(r.value)]), rawRows = rowData.map((r) => [r.label, rawValue(r.value)]);
  return formatAsciiTable({ headers, rows, rawRows });
}
function formatSummary(report) {
  let hooksFailed = report.hooks.every((h) => h.status !== "configured"), selfTestFailed = report.hooks.some((h) => h.selfTest && h.selfTest.failed > 0), configFailed = (report.userConfig.errors?.length ?? 0) > 0 || (report.projectConfig.errors?.length ?? 0) > 0, failures = [hooksFailed, selfTestFailed, configFailed].filter(Boolean).length, warnings = 0;
  if (report.update.updateAvailable)
    warnings++;
  if (report.activity.totalBlocked === 0)
    warnings++;
  if (warnings += report.shadowedRules.length, failures > 0)
    return colors.red(`
${failures} check(s) failed.`);
  if (warnings > 0)
    return colors.yellow(`
All checks passed with ${warnings} warning(s).`);
  return colors.green(`
All checks passed.`);
}

// src/bin/doctor/hooks.ts
import { existsSync as existsSync4, readdirSync as readdirSync3, readFileSync as readFileSync7 } from "node:fs";
import { homedir as homedir8 } from "node:os";
import { join as join16 } from "node:path";

// src/bin/config/jsonc.ts
function stripJsonComments(content) {
  let result = "", i = 0, inString = !1, isEscaped = !1, lastCommaIndex = -1;
  while (i < content.length) {
    let char = content[i], next = content[i + 1];
    if (isEscaped) {
      result += char, isEscaped = !1, i++;
      continue;
    }
    if (char === '"' && !inString) {
      inString = !0, lastCommaIndex = -1, result += char, i++;
      continue;
    }
    if (char === '"' && inString) {
      inString = !1, result += char, i++;
      continue;
    }
    if (char === "\\" && inString) {
      isEscaped = !0, result += char, i++;
      continue;
    }
    if (inString) {
      result += char, i++;
      continue;
    }
    if (char === "/" && next === "/") {
      while (i < content.length && content[i] !== `
`)
        i++;
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
      lastCommaIndex = result.length, result += char, i++;
      continue;
    }
    if (char === "}" || char === "]") {
      if (lastCommaIndex !== -1) {
        let between = result.slice(lastCommaIndex + 1);
        if (/^\s*$/.test(between))
          result = result.slice(0, lastCommaIndex) + between;
      }
      lastCommaIndex = -1, result += char, i++;
      continue;
    }
    if (!/\s/.test(char))
      lastCommaIndex = -1;
    result += char, i++;
  }
  return result;
}

// src/bin/hook/antigravity.ts
import { join as join14 } from "node:path";
function getAntigravityHooksPath(homeDir) {
  return join14(homeDir, ".gemini", "config", "hooks.json");
}

// src/integrations/self-test.ts
import { tmpdir as tmpdir2 } from "node:os";
import { join as join15 } from "node:path";
var CASES = Object.freeze([
  { command: "git reset --hard", description: "git reset --hard", expectBlocked: !0 },
  { command: "rm -rf /", description: "rm -rf /", expectBlocked: !0 },
  { command: "rm -rf ./node_modules", description: "rm in cwd (safe)", expectBlocked: !1 }
]), SNAPSHOT = Object.freeze({
  state: "ready",
  diagnostics: Object.freeze([]),
  policy: Object.freeze({
    rules: Object.freeze([]),
    transparentWrappers: Object.freeze([]),
    safety: Object.freeze({}),
    worktreeMode: !1,
    destructiveCommandProtectionEnabled: !0,
    destructiveCommandRuleOverrides: Object.freeze({}),
    secretProtection: Object.freeze({
      enabled: !0,
      disabledRules: Object.freeze([]),
      denyPaths: Object.freeze([])
    })
  })
}), STANDARD_MODES = {
  strict: !1,
  paranoidRm: !1,
  paranoidInterpreters: !1,
  worktreeMode: !1,
  effectiveLevel: "standard",
  capabilities: {
    fail_closed: { enabled: !1, source: "preset", sources: [] },
    paranoid_rm: { enabled: !1, source: "preset", sources: [] },
    paranoid_interpreters: {
      enabled: !1,
      source: "preset",
      sources: []
    }
  },
  sources: {
    failClosed: [],
    paranoidRm: [],
    paranoidInterpreters: [],
    worktreeMode: []
  }
};
function runIntegrationSelfTest() {
  let cwd = join15(tmpdir2(), "cc-safety-net-self-test"), results = CASES.map((testCase) => {
    let evaluation = evaluateRuntimeGuard(createToolInvocation("self-test", { command: testCase.command }, { kind: "command", shell: "auto" }, { configCwd: cwd, executionCwd: cwd }, testCase.command), {
      guard: {
        dependencies: {
          loadPolicySnapshot: () => SNAPSHOT,
          getModes: () => STANDARD_MODES
        }
      },
      audit: { agent: "self-test", getSessionId: () => {
        return;
      } }
    }), expected = testCase.expectBlocked ? "blocked" : "allowed", actual = evaluation.decision.kind === "deny" ? "blocked" : "allowed";
    return {
      command: testCase.command,
      description: testCase.description,
      expected,
      actual,
      passed: expected === actual,
      reason: evaluation.decision.kind === "deny" ? evaluation.decision.reason : void 0
    };
  });
  return {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    total: results.length,
    results
  };
}

// src/bin/doctor/hooks.ts
var COPILOT_PLUGIN_CONFIG_PATH = "copilot-plugin", CLAUDE_PLUGIN_LIST_CONFIG_PATH = "claude plugin list", CLAUDE_SAFETY_NET_PLUGIN_ID = "safety-net@cc-marketplace", CODEX_PLUGIN_LIST_CONFIG_PATH = "codex plugin list", CODEX_SAFETY_NET_SOURCE = "https://github.com/kenryu42/cc-safety-net.git", GEMINI_EXTENSIONS_LIST_CONFIG_PATH = "gemini extensions list", GEMINI_SAFETY_NET_SOURCE = "https://github.com/kenryu42/gemini-safety-net", ANTIGRAVITY_HOOK_COMMAND_PATTERN = /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/, KIMI_HOOK_COMMAND_PATTERN = /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;
function detectClaudeCode(pluginListOutput) {
  if (!pluginListOutput)
    return { platform: "claude-code", status: "n/a" };
  let pluginBlock = _findClaudeSafetyNetPluginBlock(pluginListOutput);
  if (!pluginBlock)
    return { platform: "claude-code", status: "n/a" };
  if (/^\s*Status:\s*.*\bdisabled\b\s*$/im.test(pluginBlock))
    return {
      platform: "claude-code",
      status: "disabled",
      method: "plugin list",
      configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH
    };
  if (/^\s*Status:\s*.*\benabled\b\s*$/im.test(pluginBlock))
    return {
      platform: "claude-code",
      status: "configured",
      method: "plugin list",
      configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
      selfTest: runIntegrationSelfTest()
    };
  return {
    platform: "claude-code",
    status: "disabled",
    method: "plugin list",
    configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
    errors: ["Status is not enabled"]
  };
}
function _findClaudeSafetyNetPluginBlock(output) {
  let pluginLinePattern = new RegExp(`^\\s*(?:[^\\w\\s@]+\\s+)?${_escapeRegExp(CLAUDE_SAFETY_NET_PLUGIN_ID)}\\s*$`), pluginStartPattern = /^\s*(?:[^\w\s@]+\s+)?\S+@\S+\s*$/, lines = output.split(`
`), startIndex = lines.findIndex((line) => pluginLinePattern.test(line));
  if (startIndex === -1)
    return;
  let endIndex = lines.findIndex((line, index) => index > startIndex && pluginStartPattern.test(line));
  return lines.slice(startIndex, endIndex === -1 ? void 0 : endIndex).join(`
`);
}
function _escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function detectOpenCode(homeDir) {
  let errors = [], configDir = join16(homeDir, ".config", "opencode"), candidates = ["opencode.json", "opencode.jsonc"];
  for (let filename of candidates) {
    let configPath = join16(configDir, filename);
    if (existsSync4(configPath))
      try {
        let content = readFileSync7(configPath, "utf-8"), json = stripJsonComments(content);
        if ((JSON.parse(json).plugin ?? []).some((p) => p.includes("cc-safety-net")))
          return {
            platform: "opencode",
            status: "configured",
            method: "plugin array",
            configPath,
            selfTest: runIntegrationSelfTest(),
            errors: errors.length > 0 ? errors : void 0
          };
      } catch (e) {
        errors.push(`Failed to parse ${filename}: ${e instanceof Error ? e.message : String(e)}`);
      }
  }
  return {
    platform: "opencode",
    status: "n/a",
    errors: errors.length > 0 ? errors : void 0
  };
}
function detectGeminiCLI(extensionsListOutput) {
  if (!extensionsListOutput)
    return { platform: "gemini-cli", status: "n/a" };
  let extension = _parseGeminiExtensionsList(extensionsListOutput).find((item) => item.source?.includes(GEMINI_SAFETY_NET_SOURCE));
  if (!extension)
    return { platform: "gemini-cli", status: "n/a" };
  let errors = extension.enabledWorkspace ?? extension.enabledUser ?? !0 ? [] : [
    extension.enabledWorkspace === !1 ? "Enabled (Workspace) is false" : "Enabled (User) is false"
  ];
  if (errors.length > 0)
    return {
      platform: "gemini-cli",
      status: "disabled",
      method: "extension list",
      configPath: GEMINI_EXTENSIONS_LIST_CONFIG_PATH,
      errors
    };
  return {
    platform: "gemini-cli",
    status: "configured",
    method: "extension list",
    configPath: GEMINI_EXTENSIONS_LIST_CONFIG_PATH,
    selfTest: runIntegrationSelfTest()
  };
}
function _getKimiConfigPath(homeDir) {
  return join16(process.env.KIMI_CODE_HOME || join16(homeDir, ".kimi-code"), "config.toml");
}
function _findAntigravitySafetyNetHooks(config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    return [];
  return Object.values(config).flatMap((definition) => {
    if (!definition || typeof definition !== "object" || Array.isArray(definition))
      return [];
    let record = definition, preToolUse = record.PreToolUse;
    if (!Array.isArray(preToolUse))
      return [];
    return preToolUse.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return [];
      let hooks = entry.hooks;
      if (!Array.isArray(hooks))
        return [];
      return hooks.flatMap((hook) => {
        if (!hook || typeof hook !== "object" || Array.isArray(hook))
          return [];
        let command2 = hook.command;
        if (typeof command2 !== "string" || !ANTIGRAVITY_HOOK_COMMAND_PATTERN.test(command2))
          return [];
        return [{ command: command2, enabled: record.enabled !== !1 }];
      });
    });
  });
}
function detectAntigravityCli(homeDir) {
  let configPath = getAntigravityHooksPath(homeDir);
  if (!existsSync4(configPath))
    return { platform: "antigravity-cli", status: "n/a", configPath };
  let matches;
  try {
    matches = _findAntigravitySafetyNetHooks(JSON.parse(readFileSync7(configPath, "utf-8")));
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
  if (matches.some((match) => match.enabled))
    return {
      platform: "antigravity-cli",
      status: "configured",
      method: "hook config",
      configPath,
      selfTest: runIntegrationSelfTest()
    };
  if (matches.length > 0)
    return {
      platform: "antigravity-cli",
      status: "disabled",
      method: "hook config",
      configPath
    };
  return { platform: "antigravity-cli", status: "n/a", configPath };
}
function detectKimiCode(homeDir) {
  let configPath = _getKimiConfigPath(homeDir);
  if (!existsSync4(configPath))
    return { platform: "kimi-code", status: "n/a", configPath };
  try {
    if (!KIMI_HOOK_COMMAND_PATTERN.test(readFileSync7(configPath, "utf-8")))
      return { platform: "kimi-code", status: "n/a", configPath };
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
    selfTest: runIntegrationSelfTest()
  };
}
function detectPi(probe) {
  if (!probe || probe.status === "unavailable")
    return { platform: "pi", status: "n/a" };
  if (probe.status === "error")
    return {
      platform: "pi",
      status: "n/a",
      method: "pi probe",
      errors: [probe.error ?? "Pi probe failed"]
    };
  if (!probe.installedAndEnabled)
    return { platform: "pi", status: "n/a", method: "pi probe" };
  let configPaths = probe.matched.map((resource) => resource.path).filter((path) => typeof path === "string");
  return {
    platform: "pi",
    status: "configured",
    method: "pi probe",
    configPath: configPaths[0],
    configPaths: configPaths.length > 0 ? configPaths : void 0,
    selfTest: runIntegrationSelfTest()
  };
}
function _parseGeminiExtensionsList(output) {
  return output.split(`
`).reduce((result, line) => {
    if (/^\S/.test(line) || result.length === 0)
      return result.push(line), result;
    let index = result.length - 1;
    return result[index] = `${result[index]}
${line}`, result;
  }, []).map((block) => ({
    source: /^\s*Source:\s*(.+)$/m.exec(block)?.[1],
    enabledUser: _parseGeminiEnabledValue(block, "User"),
    enabledWorkspace: _parseGeminiEnabledValue(block, "Workspace")
  }));
}
function _parseGeminiEnabledValue(block, scope) {
  let match = new RegExp(`^\\s*Enabled \\(${scope}\\):\\s*(true|false)\\s*$`, "im").exec(block);
  if (!match)
    return;
  return match[1] === "true";
}
function detectCodex(pluginListOutput) {
  if (!pluginListOutput)
    return { platform: "codex", status: "n/a" };
  let pluginLine = pluginListOutput.split(`
`).find((line) => line.includes(CODEX_SAFETY_NET_SOURCE));
  if (!pluginLine)
    return { platform: "codex", status: "n/a" };
  if (!pluginLine.includes("installed, enabled"))
    return {
      platform: "codex",
      status: "disabled",
      method: CODEX_PLUGIN_LIST_CONFIG_PATH,
      configPath: CODEX_PLUGIN_LIST_CONFIG_PATH,
      errors: [`Codex plugin line for ${CODEX_SAFETY_NET_SOURCE} must contain installed, enabled.`]
    };
  return {
    platform: "codex",
    status: "configured",
    method: CODEX_PLUGIN_LIST_CONFIG_PATH,
    configPath: CODEX_PLUGIN_LIST_CONFIG_PATH,
    selfTest: runIntegrationSelfTest()
  };
}
function _isSafetyNetCopilotCommand(command2) {
  if (!command2?.includes("cc-safety-net"))
    return !1;
  return /(^|\s)hook\s+(?:[^\s]+\s+)*(--copilot-cli|-cp)(\s|$)/.test(command2);
}
function _parseSemver(version) {
  if (!version)
    return null;
  let match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match)
    return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function _compareSemver(version, threshold) {
  let parsed = _parseSemver(version);
  if (!parsed)
    return null;
  for (let index = 0;index < threshold.length; index++) {
    let left = parsed[index] ?? 0, right = threshold[index] ?? 0;
    if (left > right)
      return 1;
    if (left < right)
      return -1;
  }
  return 0;
}
function _supportsCopilotUserHookFiles(version) {
  let comparison = _compareSemver(version, [0, 0, 422]);
  if (comparison === null)
    return null;
  return comparison >= 0;
}
function _supportsCopilotInlineHooks(version) {
  let comparison = _compareSemver(version, [1, 0, 8]);
  if (comparison === null)
    return null;
  return comparison >= 0;
}
function _getCopilotConfigHome(homeDir) {
  return process.env.COPILOT_HOME || join16(homeDir, ".copilot");
}
function _hasSafetyNetCopilotHook(config) {
  return (config.hooks?.preToolUse ?? []).some((hook) => {
    if (hook.type !== "command")
      return !1;
    return _isSafetyNetCopilotCommand(hook.command) || _isSafetyNetCopilotCommand(hook.bash) || _isSafetyNetCopilotCommand(hook.powershell);
  });
}
function _readCopilotConfigFile(configPath, errors) {
  try {
    return JSON.parse(stripJsonComments(readFileSync7(configPath, "utf-8")));
  } catch (e) {
    errors?.push(`Failed to parse ${configPath}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
}
function _listJsonFiles(dirPath, errors) {
  try {
    return readdirSync3(dirPath).filter((name) => name.endsWith(".json")).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    return errors?.push(`Failed to read ${dirPath}: ${e instanceof Error ? e.message : String(e)}`), [];
  }
}
function _collectSafetyNetCopilotHookFiles(dirPath, errors) {
  if (!existsSync4(dirPath))
    return [];
  let matches = [];
  for (let filename of _listJsonFiles(dirPath, errors)) {
    let configPath = join16(dirPath, filename), config = _readCopilotConfigFile(configPath, errors);
    if (config && _hasSafetyNetCopilotHook(config))
      matches.push(configPath);
  }
  return matches;
}
function _collectCopilotInlineConfig(configPath, errors) {
  if (!existsSync4(configPath))
    return;
  let config = _readCopilotConfigFile(configPath, errors);
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
  let precedence = [
    inlineSources.localSettings,
    inlineSources.repoSettings,
    inlineSources.userConfig
  ];
  for (let source of precedence) {
    if (source?.config.disableAllHooks === !0)
      return source.path;
    if (source?.config.disableAllHooks === !1)
      return;
  }
  return;
}
function _checkCopilotEnabled(homeDir, cwd, copilotCliVersion, errors) {
  let configHome = _getCopilotConfigHome(homeDir), repoHookDir = join16(cwd, ".github", "hooks"), userHookDir = join16(configHome, "hooks"), repoConfigDir = join16(cwd, ".github", "copilot"), inlineSupport = _supportsCopilotInlineHooks(copilotCliVersion), inlineErrors = inlineSupport === !0 ? errors : void 0, inlineSources = {
    userConfig: _collectCopilotInlineConfig(join16(configHome, "config.json"), inlineErrors),
    repoSettings: _collectCopilotInlineConfig(join16(repoConfigDir, "settings.json"), inlineErrors),
    localSettings: _collectCopilotInlineConfig(join16(repoConfigDir, "settings.local.json"), inlineErrors)
  };
  if (inlineSupport !== !1) {
    let disableSource = _resolveCopilotInlineDisableSource(inlineSources);
    if (disableSource) {
      if (inlineSupport === null)
        errors.push(`Copilot CLI version unavailable; treating disableAllHooks in ${disableSource} as active`);
      return { activeConfigPaths: [], disabledBy: disableSource };
    }
  }
  let repoHookPaths = _collectSafetyNetCopilotHookFiles(repoHookDir, errors), userHookSupport = _supportsCopilotUserHookFiles(copilotCliVersion), userHookErrors = userHookSupport === !0 ? errors : void 0, userHookFiles = existsSync4(userHookDir) ? _listJsonFiles(userHookDir, userHookErrors) : [], userHookPaths = [];
  for (let filename of userHookFiles) {
    let configPath = join16(userHookDir, filename), config = _readCopilotConfigFile(configPath, userHookErrors);
    if (config && _hasSafetyNetCopilotHook(config))
      userHookPaths.push(configPath);
  }
  if (userHookSupport !== !0 && userHookPaths.length > 0)
    _warnOnUnsupportedCopilotSource(errors, copilotCliVersion, `user hook files in ${userHookDir}`, "0.0.422"), userHookPaths.length = 0;
  let inlinePaths = [], inlineSourcesByPrecedence = [
    inlineSources.localSettings,
    inlineSources.repoSettings,
    inlineSources.userConfig
  ];
  for (let source of inlineSourcesByPrecedence) {
    if (!source)
      continue;
    if (!_hasSafetyNetCopilotHook(source.config))
      continue;
    if (inlineSupport === !0) {
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
  let homeDir = options2?.homeDir ?? homedir8(), detectCopilotCLI = () => {
    let errors = [], hooksCheck = _checkCopilotEnabled(homeDir, cwd, options2?.copilotCliVersion, errors);
    if (hooksCheck.disabledBy)
      return {
        platform: "copilot-cli",
        status: "disabled",
        method: "hook config",
        configPath: hooksCheck.disabledBy,
        configPaths: [hooksCheck.disabledBy],
        errors: errors.length > 0 ? errors : void 0
      };
    if (options2?.copilotPluginInstalled === !0 || hooksCheck.activeConfigPaths.length > 0) {
      let viaPlugin = options2?.copilotPluginInstalled === !0, primaryConfigPath = hooksCheck.activeConfigPaths[0];
      return {
        platform: "copilot-cli",
        status: "configured",
        method: viaPlugin ? "plugin list" : "hook config",
        configPath: primaryConfigPath ?? (viaPlugin ? COPILOT_PLUGIN_CONFIG_PATH : void 0),
        configPaths: hooksCheck.activeConfigPaths.length > 0 ? hooksCheck.activeConfigPaths : void 0,
        selfTest: runIntegrationSelfTest(),
        errors: errors.length > 0 ? errors : void 0
      };
    }
    return {
      platform: "copilot-cli",
      status: "n/a",
      errors: errors.length > 0 ? errors : void 0
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
import { existsSync as existsSync5 } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir as tmpdir3 } from "node:os";
import { delimiter, extname, join as join17 } from "node:path";
import { stripVTControlCharacters } from "node:util";
var CURRENT_VERSION = "1.0.6", VERSION_FETCH_TIMEOUT_MS = 2000, PI_PROBE_TIMEOUT_MS = 5000, PI_SENTINEL_COMMAND = "cc-safety-net", PI_PROBE_COMMAND = "__cc_safety_net_probe", TEST_SPAWN_PLATFORM_ENV = "_CC_SAFETY_NET_TEST_SPAWN_PLATFORM", PI_PROBE_UNAVAILABLE = {
  status: "unavailable",
  installedAndEnabled: !1,
  matched: []
};
function getPackageVersion() {
  return CURRENT_VERSION;
}
var COPILOT_PLUGIN_ID = "copilot-safety-net";
function getEnvValue(env, name) {
  let direct = env[name];
  if (direct)
    return direct;
  let matchingName = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase() && !!env[key]);
  return matchingName ? env[matchingName] : direct;
}
function getWindowsExecutableExtensions(env) {
  return (getEnvValue(env, "PATHEXT") || ".COM;.EXE;.BAT;.CMD").split(";").filter((extension) => extension.length > 0);
}
function resolveWindowsCommand(command2, env) {
  let candidates = extname(command2) ? [command2] : [
    ...getWindowsExecutableExtensions(env).map((extension) => `${command2}${extension}`),
    command2
  ];
  if (command2.includes("/") || command2.includes("\\"))
    return candidates.find((candidate) => existsSync5(candidate)) ?? command2;
  return (getEnvValue(env, "PATH") ?? "").split(delimiter).flatMap((dir) => candidates.map((candidate) => join17(dir, candidate))).find((candidate) => existsSync5(candidate)) ?? command2;
}
function quoteWindowsCommandArg(value) {
  if (!/[\s"&|<>^]/.test(value))
    return value;
  return `"${value.replace(/"/g, '""')}"`;
}
function getSpawnCommand(args, env) {
  let [command2, ...rest] = args, platform = env[TEST_SPAWN_PLATFORM_ENV] === "win32" ? "win32" : process.platform;
  if (!command2 || platform !== "win32")
    return { cmd: command2 ?? "", args: rest };
  let resolved = resolveWindowsCommand(command2, env);
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
var defaultVersionFetcher = async (args, timeoutMs = VERSION_FETCH_TIMEOUT_MS) => {
  let [cmd, ...rest] = args;
  if (!cmd)
    return null;
  return new Promise((resolve14) => {
    try {
      let spawnCommand = getSpawnCommand([cmd, ...rest], process.env), proc = spawn(spawnCommand.cmd, spawnCommand.args, {
        stdio: ["ignore", "pipe", "pipe"]
      }), isSettled = !1, output = "", errorOutput = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
      }), proc.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });
      let finish = (value) => {
        if (isSettled)
          return;
        isSettled = !0, clearTimeout(timeoutId), resolve14(value);
      }, timeoutId = setTimeout(() => {
        proc.kill(), finish(null);
      }, timeoutMs);
      proc.on("close", (code) => {
        finish(code === 0 ? stripVTControlCharacters(output).trim() || stripVTControlCharacters(errorOutput).trim() || null : null);
      }), proc.on("error", () => {
        finish(null);
      });
    } catch {
      resolve14(null);
    }
  });
}, PI_PROBE_EXTENSION = `
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
  let [cmd, ...rest] = args;
  if (!cmd)
    return Promise.resolve({ code: null, stdout: "", stderr: "", timedOut: !1 });
  return new Promise((resolve14) => {
    try {
      let env = { ...process.env, ...options2.env ?? {} }, spawnCommand = getSpawnCommand([cmd, ...rest], env), proc = spawn(spawnCommand.cmd, spawnCommand.args, {
        cwd: options2.cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"]
      }), isSettled = !1, stdout = "", stderr = "";
      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      }), proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      let finish = (result) => {
        if (isSettled)
          return;
        isSettled = !0, clearTimeout(timeoutId), resolve14(result);
      }, timeoutId = setTimeout(() => {
        proc.kill(), finish({ code: null, stdout, stderr, timedOut: !0 });
      }, options2.timeoutMs);
      proc.on("close", (code) => {
        finish({ code, stdout, stderr, timedOut: !1 });
      }), proc.on("error", (error) => {
        finish({ code: null, stdout, stderr, timedOut: !1, error: error.message });
      });
    } catch (error) {
      resolve14({
        code: null,
        stdout: "",
        stderr: "",
        timedOut: !1,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
var defaultPiProbeRunner = async (cwd) => {
  let tempDir = await mkdtemp(join17(tmpdir3(), "cc-safety-net-pi-probe-")), probePath = join17(tempDir, "pi-extension-probe.ts"), resultPath = join17(tempDir, "result.json"), stdoutPath = join17(tempDir, "stdout.jsonl");
  try {
    await writeFile(probePath, PI_PROBE_EXTENSION);
    let result = await runCommand(["pi", "-e", probePath, "--mode", "json", `/${PI_PROBE_COMMAND} ${PI_SENTINEL_COMMAND}`], {
      cwd,
      env: { PI_PROBE_OUT: resultPath },
      timeoutMs: PI_PROBE_TIMEOUT_MS
    });
    if (await writeFile(stdoutPath, result.stdout), result.timedOut)
      return {
        status: "error",
        installedAndEnabled: !1,
        matched: [],
        error: "Pi probe timed out"
      };
    if (result.error)
      return {
        status: "error",
        installedAndEnabled: !1,
        matched: [],
        error: `Pi probe failed: ${result.error}`
      };
    if (result.code !== 0)
      return {
        status: "error",
        installedAndEnabled: !1,
        matched: [],
        error: `Pi probe exited with code ${result.code ?? "unknown"}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`
      };
    return parsePiProbeResult(await readFile(resultPath, "utf-8"));
  } catch (error) {
    return {
      status: "error",
      installedAndEnabled: !1,
      matched: [],
      error: `Pi probe failed: ${error instanceof Error ? error.message : String(error)}`
    };
  } finally {
    await rm(tempDir, { recursive: !0, force: !0 });
  }
};
function parsePiProbeResult(content) {
  try {
    let parsed = JSON.parse(content);
    if (!isObject(parsed))
      return {
        status: "error",
        installedAndEnabled: !1,
        matched: [],
        error: "Pi probe result was not an object"
      };
    let matched = Array.isArray(parsed.matched) ? parsed.matched.map(parsePiProbeResource).filter((resource) => resource !== null) : [], installedAndEnabled = parsed.installedAndEnabled === !0;
    return {
      status: installedAndEnabled ? "configured" : "not-found",
      installedAndEnabled,
      matched
    };
  } catch (error) {
    return {
      status: "error",
      installedAndEnabled: !1,
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
  let claudeMatch = /Claude Code\s+(\d+\.\d+\.\d+)/i.exec(output);
  if (claudeMatch)
    return claudeMatch[1] ?? null;
  let versionMatch = /v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i.exec(output);
  if (versionMatch)
    return versionMatch[1] ?? null;
  return output.split(`
`)[0]?.trim() || null;
}
function hasCopilotSafetyNetPlugin(output) {
  if (!output)
    return !1;
  return new RegExp(`(^|[^a-z0-9-])${COPILOT_PLUGIN_ID}([^a-z0-9-]|$)`, "m").test(output);
}
async function getSystemInfo(fetcher = defaultVersionFetcher, options2 = {}) {
  let piRawPromise = fetcher(["pi", "--version"]), piProbeRunner = options2.piProbeRunner ?? defaultPiProbeRunner, shouldRunPiProbe = !!options2.piProbeRunner || fetcher === defaultVersionFetcher, piProbePromise = piRawPromise.then((piRaw2) => {
    if (!piRaw2)
      return PI_PROBE_UNAVAILABLE;
    if (!shouldRunPiProbe)
      return PI_PROBE_UNAVAILABLE;
    return piProbeRunner(options2.cwd ?? process.cwd());
  }), fetchCopilotVersion = async () => {
    let binaryVersionPromise = fetcher(["copilot", "--binary-version"]), fallbackVersionPromise = fetcher(["copilot", "--version"]), binaryVersion = await binaryVersionPromise;
    if (binaryVersion)
      return binaryVersion;
    return fallbackVersionPromise;
  }, [
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
    return !1;
  let latestParts = latest.split(".").map(Number), currentParts = current.split(".").map(Number), [latestMajor = 0, latestMinor = 0, latestPatch = 0] = latestParts, [currentMajor = 0, currentMinor = 0, currentPatch = 0] = currentParts;
  if (latestMajor !== currentMajor)
    return latestMajor > currentMajor;
  if (latestMinor !== currentMinor)
    return latestMinor > currentMinor;
  return latestPatch > currentPatch;
}
async function checkForUpdates() {
  let currentVersion = getPackageVersion(), controller = new AbortController, timeout = setTimeout(() => controller.abort(), 3000);
  try {
    let res = await fetch("https://registry.npmjs.org/cc-safety-net/latest", {
      signal: controller.signal
    });
    if (!res.ok)
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: !1,
        error: `npm registry returned ${res.status}`
      };
    let data = await res.json(), updateAvailable = isNewerVersion(data.version, currentVersion);
    return {
      currentVersion,
      latestVersion: data.version,
      updateAvailable
    };
  } catch (e) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: !1,
      error: e instanceof Error ? e.message : "Network error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

// src/bin/hook/install/banner.ts
import * as readline from "node:readline";

// src/bin/utils/lolcat.ts
var CURSOR_DOWN = (rows) => `\x1B[${rows}B`;
var SCRAMBLE_POOL = ["░", "▒", "▓", "╱", "╲", "┃", "━", "┏", "┓", "┗", "┛", "╋"];
function wait(milliseconds) {
  return new Promise((resolve14) => setTimeout(resolve14, milliseconds));
}
function waitForAnimationFrame(milliseconds, sleep, signal) {
  if (!signal)
    return sleep(milliseconds);
  if (signal.aborted)
    return Promise.resolve();
  return new Promise((resolve14, reject) => {
    let cleanup = () => signal.removeEventListener("abort", onAbort), onAbort = () => {
      cleanup(), resolve14();
    };
    signal.addEventListener("abort", onAbort, { once: !0 }), sleep(milliseconds).then(() => {
      cleanup(), resolve14();
    }, (error) => {
      cleanup(), reject(error);
    });
  });
}
function positiveOrDefault(value, fallback) {
  return value && value > 0 ? value : fallback;
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
function byte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
function linearToSrgb(value) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** 0.4166666666666667 - 0.055;
}
function oklchToSrgb(lightness, chroma, hueDegrees) {
  let hueRadians = hueDegrees * Math.PI / 180, a = chroma * Math.cos(hueRadians), b = chroma * Math.sin(hueRadians), l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    blue: byte(linearToSrgb(clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)) * 255),
    green: byte(linearToSrgb(clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)) * 255),
    red: byte(linearToSrgb(clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)) * 255)
  };
}
function rainbow(frequency, offset) {
  let hueDegrees = (offset * frequency * 180 / Math.PI % 360 + 360) % 360;
  return oklchToSrgb(0.72, 0.15, hueDegrees);
}
function rainbowColorEscape(offset, frequency = 0.1) {
  let color = rainbow(frequency, offset);
  return `\x1B[38;2;${color.red};${color.green};${color.blue}m`;
}
function mixTowardWhite(color, amount) {
  return {
    blue: byte(color.blue + (255 - color.blue) * amount),
    green: byte(color.green + (255 - color.green) * amount),
    red: byte(color.red + (255 - color.red) * amount)
  };
}
function hash01(a, b, c) {
  let mixed = Math.imul(a + 2654435769, 2246822507) ^ Math.imul(b + 3266489909, 668265263) ^ Math.imul(c + 374761393, 2654435761), x1 = mixed ^ mixed >>> 15, x2 = Math.imul(x1, 739982445), x3 = x2 ^ x2 >>> 12, x4 = Math.imul(x3, 695872825);
  return ((x4 ^ x4 >>> 15) >>> 0) / 4294967296;
}
function scrambleGlyph(lineIndex, columnIndex, frame) {
  let index = Math.floor(hash01(lineIndex, columnIndex, frame) * SCRAMBLE_POOL.length);
  return SCRAMBLE_POOL[index] ?? "░";
}
function smootherstep(progress) {
  let t = clamp01(progress);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function buildLine(cells) {
  if (cells.length === 0)
    return "";
  let parts = [], activeBold = !1, activeColor = "";
  for (let cell of cells) {
    let color = `${cell.red};${cell.green};${cell.blue}`;
    if (cell.bold !== activeBold)
      parts.push(cell.bold ? "\x1B[1m" : "\x1B[22m"), activeBold = cell.bold;
    if (color !== activeColor)
      parts.push(`\x1B[38;2;${color}m`), activeColor = color;
    parts.push(cell.character);
  }
  return `${parts.join("")}\x1B[22m\x1B[39m`;
}
function settledLineCells(line, lineIndex, frequency, seed, spread) {
  return line.map((character, columnIndex) => ({
    ...rainbow(frequency, seed + lineIndex + columnIndex / spread),
    bold: !1,
    character
  }));
}
function wavefrontLineCells(line, lineIndex, frame, frameCount, width, frequency, seed, spread) {
  let revealFrames = Math.max(1, frameCount * 0.75), revealProgress = Math.min(1, frame / revealFrames), front = width * smootherstep(revealProgress), settleProgress = Math.max(0, (frame - revealFrames) / Math.max(1, frameCount - revealFrames)), seedOffset = (1 - smootherstep(frame / frameCount)) * spread * 2, settleFlash = 0.35 * Math.max(0, 1 - settleProgress * 2), revealed = revealProgress >= 1, cutoff = Math.min(line.length, Math.ceil(front + 2 + 1));
  return line.slice(0, cutoff).map((character, columnIndex) => {
    let base = rainbow(frequency, seed + lineIndex + columnIndex / spread + seedOffset), position = columnIndex + hash01(lineIndex, columnIndex, 7919) * 2 - 1;
    if (position > front + 2)
      return { ...base, bold: !1, character: " " };
    let distance = front - position, glow = 0.8 * Math.exp(-(distance * distance) / 12.5), boost = Math.min(0.9, glow + settleFlash), scrambling = !revealed && position > front - 4;
    return {
      ...mixTowardWhite(base, boost),
      bold: boost > 0.3,
      character: scrambling ? scrambleGlyph(lineIndex, columnIndex, frame) : character
    };
  });
}
function buildFrame(cellsPerLine) {
  return `\x1B[?2026h${cellsPerLine.map((cells, lineIndex) => `\x1B8${lineIndex > 0 ? CURSOR_DOWN(lineIndex) : ""}${buildLine(cells)}`).join("")}\x1B[?2026l`;
}
async function writeAnimatedLolcat(text, options2 = {}) {
  if (!text)
    return;
  let output = options2.output ?? process.stdout, sleep = options2.sleep ?? wait, frequency = positiveOrDefault(options2.frequency, 0.1), seed = options2.seed ?? 0, speed = positiveOrDefault(options2.speed, 40), spread = positiveOrDefault(options2.spread, 3), frameRate = positiveOrDefault(options2.frameRate, 60), duration = Math.max(1, Math.floor(positiveOrDefault(options2.duration, 12))), lines = text.split(`
`).map((line) => Array.from(line)), width = Math.max(...lines.map((line) => line.length)), totalDuration = 1000 * duration * lines.filter((line) => line.length > 0).length / speed, frameCount = width > 0 ? Math.max(1, Math.ceil(totalDuration / (1000 / frameRate))) : 0, frameDelay = frameCount > 0 ? totalDuration / frameCount : 0;
  output.write("\x1B[?25l\x1B7");
  try {
    for (let frame = 1;frame <= frameCount; frame += 1) {
      if (options2.signal?.aborted)
        break;
      output.write(buildFrame(lines.map((line, lineIndex) => wavefrontLineCells(line, lineIndex, frame, frameCount, width, frequency, seed, spread)))), await waitForAnimationFrame(frameDelay, sleep, options2.signal);
    }
  } finally {
    if (output.write(buildFrame(lines.map((line, lineIndex) => settledLineCells(line, lineIndex, frequency, seed, spread)))), output.write("\x1B8"), lines.length > 1)
      output.write(CURSOR_DOWN(lines.length - 1));
    output.write(`
\x1B[0m\x1B[?25h`);
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
  let output = options2.output ?? process.stdout;
  if (!shouldPrintInstallBanner(output))
    return;
  let input = options2.input ?? process.stdin, animationOptions = {
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
  let controller = new AbortController, wasFlowing = input.readableFlowing === !0, wasRaw = input.isRaw === !0, interrupted = !1, onKeyPress = (_inputValue, key) => {
    if (key.ctrl && key.name === "c")
      interrupted = !0;
    if (interrupted || key.name === "return" || key.name === "enter")
      controller.abort();
  };
  readline.emitKeypressEvents(input), input.on("keypress", onKeyPress), input.setRawMode(!0), input.resume();
  try {
    await writeAnimatedLolcat(INSTALL_ASCII_ART, {
      ...animationOptions,
      signal: controller.signal
    });
  } finally {
    if (input.off("keypress", onKeyPress), input.setRawMode(wasRaw), !wasFlowing)
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
var CLEAR_LINE = "\r\x1B[2K", HIDE_CURSOR = "\x1B[?25l", RESET_FOREGROUND = "\x1B[39m", SHOW_CURSOR = "\x1B[?25h", SPINNER_DELAY = 100, SPINNER_HUE_STEP = 0.55, SPINNER_INTERVAL = 80, SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
function wait2(milliseconds) {
  return new Promise((resolve14) => setTimeout(resolve14, milliseconds));
}
async function waitForReady(ready, options2) {
  let output = options2.output ?? process.stdout;
  if (!output.isTTY) {
    await ready;
    return;
  }
  let sleep = options2.sleep ?? wait2, settled = !1, trackedReady = ready.then((value) => {
    return settled = !0, value;
  }, (error) => {
    throw settled = !0, error;
  });
  if (await Promise.race([
    trackedReady.then(() => !0),
    sleep(SPINNER_DELAY).then(() => !1)
  ]))
    return;
  output.write(HIDE_CURSOR);
  try {
    for (let frameIndex = 0;!settled; frameIndex += 1)
      output.write(`${CLEAR_LINE}${rainbowColorEscape(frameIndex * SPINNER_HUE_STEP)}${SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]}${RESET_FOREGROUND} ${options2.loadingMessage ?? "Loading…"}`), await Promise.race([trackedReady, sleep(SPINNER_INTERVAL)]);
    await trackedReady;
  } finally {
    output.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
  }
}
async function resolveAfterOptionalBanner(showBanner, startWork, printBanner, options2 = {}) {
  let work = startWork();
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
  let report = await resolveAfterOptionalBanner(!options2.json, () => {
    let reportPromise = collectDoctorReport(options2);
    return {
      ready: reportPromise,
      finish: () => reportPromise
    };
  }, () => printInstallBanner(), { loadingMessage: "Checking system status…" });
  if (options2.json)
    console.log(JSON.stringify(report, null, 2));
  else
    printReport(report);
  return doctorHasFailure(report.hooks, {
    userConfig: report.userConfig,
    projectConfig: report.projectConfig
  }) ? 1 : 0;
}
async function collectDoctorReport(options2) {
  let cwd = options2.cwd ?? process.cwd(), system = await getSystemInfo(void 0, { cwd }), hooks = detectAllHooks(cwd, {
    claudePluginListOutput: system.claudePluginListOutput,
    codexPluginListOutput: system.codexPluginListOutput,
    geminiExtensionsListOutput: system.geminiExtensionsListOutput,
    copilotCliVersion: system.copilotCliVersion,
    copilotPluginInstalled: system.copilotPluginInstalled,
    piSafetyNetProbe: system.piSafetyNetProbe
  }), configInfo = getConfigInfo(cwd), environment = getEnvironmentInfo(), policy = loadPolicySnapshot({ cwd }).policy, modes = getCCSafetyNetEnvModes(policy), ruleStates = resolveEffectiveDestructiveCommandRules(policy, modes.capabilities), activity = getActivitySummary(7), update = options2.skipUpdateCheck ? {
    currentVersion: getPackageVersion(),
    latestVersion: null,
    updateAvailable: !1
  } : await checkForUpdates();
  return {
    hooks,
    userConfig: configInfo.userConfig,
    projectConfig: configInfo.projectConfig,
    effectiveRules: configInfo.effectiveRules,
    shadowedRules: configInfo.shadowedRules,
    environment,
    effectiveSafety: {
      selectedPreset: policy.safety.level ?? "standard",
      level: modes.effectiveLevel,
      capabilities: modes.capabilities,
      ruleOverrides: policy.destructiveCommandRuleOverrides,
      ruleCounts: {
        stored: Object.keys(policy.destructiveCommandRuleOverrides).length,
        effective: Object.values(ruleStates).filter((state) => state.changesInherited).length
      }
    },
    activity,
    update,
    system
  };
}
function doctorHasFailure(hooks, configInfo) {
  return hooks.length > 0 && hooks.every((h) => h.status !== "configured") || hooks.some((h) => h.selfTest && h.selfTest.failed > 0) || configInfo.userConfig.exists && !configInfo.userConfig.valid || configInfo.projectConfig.exists && !configInfo.projectConfig.valid;
}
function printReport(report) {
  console.log(), console.log(formatHooksSection(report.hooks)), console.log(), console.log(formatConfigSection(report)), console.log(), console.log(formatEnvironmentSection(report.environment)), console.log(), console.log(formatEffectiveSafetySection(report)), console.log(), console.log(formatActivitySection(report.activity)), console.log(), console.log(formatSystemInfoSection(report.system)), console.log(), console.log(formatUpdateSection(report.update)), console.log(formatSummary(report));
}

// src/bin/explain/config.ts
import { resolve as resolve14 } from "node:path";
function getConfigSource(options2) {
  let projectPath = getProjectRulesConfigPath(options2?.cwd), userPath = options2?.userConfigPath ?? getUserRulesConfigPath(options2), paths = getPolicyPaths({
    cwd: options2?.cwd,
    userConfigDir: options2?.userConfigDir,
    userConfigPath: options2?.userConfigPath
  });
  try {
    if (readPolicyFile(paths.projectConfigTarget) !== null) {
      if (validateRulesConfigFile(paths.projectConfigTarget).errors.length === 0)
        return { configSource: projectPath, configValid: !0 };
      return { configSource: projectPath, configValid: !1 };
    }
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      return { configSource: projectPath, configValid: !1 };
    throw error;
  }
  try {
    if (readPolicyFile(paths.userConfigTarget) !== null) {
      let validation = validateRulesConfigFile(paths.userConfigTarget);
      return { configSource: userPath, configValid: validation.errors.length === 0 };
    }
    return { configSource: null, configValid: !0 };
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      return { configSource: userPath, configValid: !1 };
    throw error;
  }
}
function buildAnalyzeOptions(explainOptions) {
  let cwd = resolve14(explainOptions?.cwd ?? process.cwd()), policySnapshot = explainOptions?.policySnapshot ?? loadPolicySnapshot({ cwd, userConfigDir: explainOptions?.userConfigDir }), modes = getCCSafetyNetEnvModes(policySnapshot.policy);
  return {
    cwd,
    effectiveCwd: cwd,
    policySnapshot,
    strict: explainOptions?.strict ?? modes.strict,
    paranoidRm: modes.paranoidRm,
    paranoidInterpreters: modes.paranoidInterpreters,
    worktreeMode: modes.worktreeMode
  };
}

// src/engine/command-trace.ts
var PROVIDER_HINTS = [
  "AKIA",
  "ASIA",
  "ghp_",
  "gho_",
  "ghu_",
  "ghs_",
  "ghr_",
  "github_pat_",
  "glpat-",
  "xox",
  "npm_",
  "pypi-",
  "rk_",
  "sk-",
  "sk_",
  "gsk_",
  "xai-",
  "pplx-",
  "bastn_",
  "tgp_v1_",
  "flp_",
  "wfr_",
  "fw_",
  "fwp_",
  "tp-",
  "psk-"
];
function createCommandTraceContext(recorder) {
  let nextSegmentIndex = 0, context = {
    allocateSegment() {
      return nextSegmentIndex++;
    },
    getNextSegmentIndex() {
      return nextSegmentIndex;
    },
    recordGlobal(step) {
      recorder.record({ kind: "step", scope: "global", step });
    },
    recordSegment(step, segmentIndex = context.currentSegmentIndex) {
      if (segmentIndex === void 0)
        return;
      recorder.record({ kind: "step", scope: "segment", segmentIndex, step });
    }
  };
  return context;
}
function createCommandTraceRecorder(options2 = {}) {
  let events = [], maxEvents = options2.maxEvents ?? 512, limits = {
    maxTextLength: options2.maxTextLength ?? 2048,
    maxListLength: options2.maxListLength ?? 128,
    maxObjectProperties: options2.maxObjectProperties ?? options2.maxListLength ?? 128,
    maxDepth: options2.maxDepth ?? 16
  }, droppedEvents = 0, result, sensitiveHashes = /* @__PURE__ */ new Set;
  return {
    record(event) {
      if (result)
        return;
      try {
        if (!event || events.length >= maxEvents) {
          droppedEvents++;
          return;
        }
        events.push(deepFreeze(sanitizeEvent(event, limits, sensitiveHashes)));
      } catch {
        droppedEvents++;
      }
    },
    finish(terminal) {
      if (result)
        return result;
      try {
        result = deepFreeze({
          events: Object.freeze(events),
          droppedEvents,
          terminal: sanitizeTerminal(terminal, limits, sensitiveHashes)
        });
      } catch {
        droppedEvents++, result = Object.freeze({
          events: Object.freeze(events),
          droppedEvents,
          terminal: Object.freeze({
            result: "blocked",
            reason: "trace unavailable".slice(0, limits.maxTextLength),
            segment: "trace unavailable".slice(0, limits.maxTextLength)
          })
        });
      }
      return result;
    }
  };
}
function sanitizeEvent(event, limits, sensitiveHashes) {
  if (event.kind !== "step")
    throw TypeError("invalid trace event");
  let { scope, step } = event;
  collectSensitiveHashes(step, sensitiveHashes, limits);
  let sanitizedStep = sanitizeValue(step, limits, sensitiveHashes);
  if (scope === "global")
    return { kind: "step", scope: "global", step: sanitizedStep };
  if (scope !== "segment")
    throw TypeError("invalid trace event scope");
  return {
    kind: "step",
    scope: "segment",
    segmentIndex: event.segmentIndex,
    step: sanitizedStep
  };
}
function sanitizeTerminal(terminal, limits, sensitiveHashes) {
  let result = terminal.result;
  if (result === "allowed")
    return Object.freeze({ result: "allowed" });
  if (result !== "blocked")
    throw TypeError("invalid trace terminal");
  let ruleId = terminal.ruleId;
  return Object.freeze({
    result: "blocked",
    reason: sanitizeValue(terminal.reason, limits, sensitiveHashes),
    segment: sanitizeValue(terminal.segment, limits, sensitiveHashes),
    ...ruleId ? {
      ruleId: sanitizeValue(ruleId, limits, sensitiveHashes)
    } : {}
  });
}
function collectSensitiveHashes(value, hashes, limits, depth = 0, seen = /* @__PURE__ */ new WeakSet) {
  if (typeof value === "string") {
    let bounded = value.slice(0, limits.maxTextLength);
    if (!mightContainEnvAssignment(bounded))
      return;
    for (let assignment of getEnvAssignmentValues(bounded))
      for (let token of assignment.match(/[^\s"'()$]+/g) ?? [])
        hashes.add(hashText(token));
    return;
  }
  if (!value || typeof value !== "object" || depth >= limits.maxDepth || seen.has(value))
    return;
  if (seen.add(value), Array.isArray(value)) {
    let length = Math.min(value.length, limits.maxListLength);
    for (let index = 0;index < length; index++)
      collectSensitiveHashes(value[index], hashes, limits, depth + 1, seen);
    return;
  }
  let retained = 0, sanitizedKeys = /* @__PURE__ */ new Set;
  for (let key in value) {
    if (!Object.hasOwn(value, key))
      continue;
    if (retained >= limits.maxObjectProperties)
      break;
    retained++, collectSensitiveHashes(key, hashes, limits);
    let sanitizedKey = sanitizeText(key, limits, hashes);
    if (sanitizedKeys.has(sanitizedKey))
      continue;
    sanitizedKeys.add(sanitizedKey), collectSensitiveHashes(value[key], hashes, limits, depth + 1, seen);
  }
}
function sanitizeValue(value, limits, sensitiveHashes, depth = 0, seen = /* @__PURE__ */ new WeakSet) {
  if (typeof value === "string")
    return sanitizeText(value, limits, sensitiveHashes);
  if (!value || typeof value !== "object")
    return value;
  if (depth >= limits.maxDepth)
    return;
  if (seen.has(value))
    return;
  if (seen.add(value), Array.isArray(value)) {
    let sanitized2 = [], length = Math.min(value.length, limits.maxListLength);
    for (let index = 0;index < length; index++)
      sanitized2.push(sanitizeValue(value[index], limits, sensitiveHashes, depth + 1, seen));
    return sanitized2;
  }
  let sanitized = {}, retained = 0;
  for (let key in value) {
    if (!Object.hasOwn(value, key))
      continue;
    if (retained >= limits.maxObjectProperties)
      break;
    retained++;
    let sanitizedKey = sanitizeText(key, limits, sensitiveHashes);
    if (Object.hasOwn(sanitized, sanitizedKey))
      continue;
    Object.defineProperty(sanitized, sanitizedKey, {
      value: sanitizeValue(value[key], limits, sensitiveHashes, depth + 1, seen),
      enumerable: !0,
      configurable: !0,
      writable: !0
    });
  }
  return sanitized;
}
function sanitizeText(value, limits, sensitiveHashes) {
  let bounded = value.slice(0, limits.maxTextLength), assignmentsRedacted = mightContainEnvAssignment(bounded) ? redactEnvAssignmentValues(bounded) : bounded, derivedRedacted = sensitiveHashes.size > 0 ? redactDerivedSecrets(assignmentsRedacted, sensitiveHashes) : assignmentsRedacted;
  return (mightContainNonAssignmentSecret(derivedRedacted) ? redactNonAssignmentSecrets(derivedRedacted) : derivedRedacted).slice(0, limits.maxTextLength);
}
function mightContainNonAssignmentSecret(text) {
  return text.includes("PRIVATE KEY") || text.includes("://") || text.includes("eyJ") || text.includes(":") && /(?:authorization|cookie|x-api-key|api-key|(?:^|\s)(?:-u|--user)(?:\s|=))/i.test(text) || text.length >= 14 && PROVIDER_HINTS.some((hint) => text.includes(hint)) || text.length >= 49 && /\b[a-f0-9]{32}\.[A-Za-z0-9]{16}\b/.test(text);
}
function redactDerivedSecrets(text, hashes) {
  return text.replace(/[^\s"'()$]+/g, (token) => hashes.has(hashText(token)) ? "<redacted>" : token);
}
function hashText(text) {
  let first = 2166136261, second = 2166136261;
  for (let index = 0;index < text.length; index++)
    first = Math.imul(first ^ text.charCodeAt(index), 16777619), second = Math.imul(second ^ text.charCodeAt(text.length - index - 1), 16777619);
  return `${first >>> 0}:${second >>> 0}:${text.length}`;
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (let child of Object.values(value))
      deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// src/engine/evaluate-command.ts
function evaluateCommandWithTrace(command2, options2, suppliedProgram, suppliedFactStore) {
  let factStore = suppliedFactStore ?? createSemanticFactStore(), program = suppliedProgram ?? factStore.getCommandProgram(command2, options2.shell ?? "auto"), recorder = createCommandTraceRecorder(), trace = createCommandTraceContext(recorder), displayProgram = program.dialect === "powershell" ? factStore.getCommandProgram(command2, "posix") : program, entries = projectLegacyCommandEntriesFromProgram(command2, displayProgram);
  trace.recordGlobal({
    type: "parse",
    input: command2,
    segments: entries.map((entry) => [...entry.tokens])
  });
  let analysis = analyzeCommandInternal(command2, 0, {
    ...options2,
    ...resolveCommandAnalysisContext(options2),
    invalidReason: void 0,
    analyzePartialProgram: !0,
    compatibility: "explain-legacy",
    factStore,
    trace
  }, program), index = trace.getNextSegmentIndex();
  if (analysis && index > 0 && index < entries.length)
    trace.recordSegment({ type: "segment-skipped", index, reason: "prior-segment-blocked" }, index);
  return Object.freeze({
    analysis,
    trace: recorder.finish(analysis ? {
      result: "blocked",
      reason: analysis.reason,
      segment: analysis.segment,
      ...analysis.ruleId ? { ruleId: analysis.ruleId } : {}
    } : { result: "allowed" }),
    program
  });
}

// src/bin/explain/analyze.ts
function explainCommand2(command2, options2) {
  let analyzeOptions = buildAnalyzeOptions(options2), context = resolveCommandAnalysisContext(analyzeOptions), configuration = {
    effectiveLevel: context.effectiveLevel,
    selectedPreset: analyzeOptions.policySnapshot.policy.safety.level ?? "standard",
    effectiveCapabilities: context.effectiveCapabilities,
    destructiveCommandRuleOverrides: analyzeOptions.policySnapshot.policy.destructiveCommandRuleOverrides
  }, { configSource, configValid } = getConfigSource({
    cwd: options2?.cwd,
    userConfigDir: options2?.userConfigDir
  });
  if (!command2 || !command2.trim())
    return {
      trace: { steps: [{ type: "error", message: "No command provided" }], segments: [] },
      result: "allowed",
      configSource,
      configValid,
      ...configuration
    };
  let evaluation = evaluateCommandWithTrace(command2, analyzeOptions), activationRuleId = evaluation.analysis?.ruleId ?? identifyModeGatedCandidate(command2, analyzeOptions), activationMetadata = DESTRUCTIVE_COMMAND_RULE_METADATA.find((rule) => rule.id === activationRuleId && rule.activationCapability), activationState = activationMetadata ? context.policy.effectiveDestructiveCommandRules[activationMetadata.id] : void 0;
  return {
    trace: projectExplainTrace(evaluation.trace),
    result: evaluation.analysis ? "blocked" : "allowed",
    reason: evaluation.analysis ? sanitizeDiagnosticText(evaluation.analysis.reason) : void 0,
    segment: evaluation.analysis ? sanitizeDiagnosticText(evaluation.analysis.segment) : void 0,
    customRule: sanitizeCustomRule(getCustomRule(evaluation.analysis?.ruleId, analyzeOptions.policySnapshot)),
    configSource,
    configValid,
    ...configuration,
    ...activationMetadata && activationState ? {
      ruleActivation: {
        id: activationMetadata.id,
        ...activationState
      }
    } : {}
  };
}
function identifyModeGatedCandidate(command2, options2) {
  let policy = options2.policySnapshot.policy, candidateSnapshot = createPolicySnapshot({
    ...policy,
    destructiveCommandProtectionEnabled: !0,
    destructiveCommandRuleOverrides: {
      ...policy.destructiveCommandRuleOverrides,
      ...Object.fromEntries(DESTRUCTIVE_COMMAND_RULE_METADATA.flatMap((rule) => rule.activationCapability ? [[rule.id, "on"]] : []))
    }
  }, options2.policySnapshot.state === "invalid" ? {
    diagnostics: options2.policySnapshot.diagnostics,
    reason: options2.policySnapshot.reason
  } : void 0);
  return analyzeCommand(command2, {
    ...options2,
    policySnapshot: candidateSnapshot,
    effectiveCapabilities: void 0,
    strict: !0,
    paranoidRm: !0,
    paranoidInterpreters: !0
  })?.ruleId;
}
function sanitizeCustomRule(rule) {
  if (!rule)
    return;
  return {
    id: sanitizeDiagnosticText(rule.id),
    ...rule.rulebook ? {
      rulebook: {
        name: sanitizeDiagnosticText(rule.rulebook.name),
        version: sanitizeDiagnosticText(rule.rulebook.version)
      }
    } : {},
    ...rule.source ? { source: sanitizeDiagnosticText(rule.source) } : {},
    ...rule.override ? {
      override: {
        type: "reason",
        reason: sanitizeDiagnosticText(rule.override.reason)
      }
    } : {}
  };
}
function projectExplainTrace(trace) {
  let steps = trace.events.flatMap((event) => event.kind === "step" && event.scope === "global" ? [event.step] : []), segments = /* @__PURE__ */ new Map;
  for (let event of trace.events) {
    if (event.kind !== "step" || event.scope !== "segment")
      continue;
    let segment = segments.get(event.segmentIndex) ?? { index: event.segmentIndex, steps: [] };
    segment.steps.push(event.step), segments.set(event.segmentIndex, segment);
  }
  return { steps, segments: [...segments.values()] };
}
function getCustomRule(ruleId, snapshot) {
  let id = ruleId?.replace(/^custom\./, "");
  if (!id || !snapshot.policy.rules.some((rule) => rule.name === id))
    return;
  return getPolicyRuleMetadata(snapshot, id) ?? Object.freeze({ id });
}
// src/bin/explain/flags.ts
function parseExplainFlags(args) {
  let json = !1, cwd, remaining = [], i = 0;
  while (i < args.length) {
    let arg = args[i];
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
    if (arg === "--json")
      json = !0, i++;
    else if (arg === "--cwd") {
      if (i++, i >= args.length || args[i]?.startsWith("--"))
        return console.error("Error: --cwd requires a path"), null;
      cwd = args[i], i++;
    } else {
      remaining.push(...args.slice(i));
      break;
    }
  }
  let command2 = remaining.length === 1 ? remaining[0] : $quote(remaining);
  if (!command2)
    return console.error("Error: No command provided"), console.error("Usage: cc-safety-net explain [--json] [--cwd <path>] <command>"), null;
  return { json, cwd, command: command2 };
}
// src/bin/explain/format-helpers.ts
function getBoxChars(asciiOnly) {
  if (asciiOnly)
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
  let padding = width - 18;
  return [
    `${box.dtl}${box.dh.repeat(width)}${box.dtr}`,
    `${box.dv}  Command Analysis${" ".repeat(padding)}${box.dv}`,
    `${box.dbl}${box.dh.repeat(width)}${box.dbr}`
  ];
}
function formatTokenArray(tokens) {
  return JSON.stringify(tokens);
}
function formatColoredTokenArray(tokens, seed = 0) {
  return `[${tokens.map((token, index) => colorizeToken(token, index, seed)).join(",")}]`;
}
function wrapReason(reason, indent, maxWidth = 70) {
  let words = reason.split(" "), lines = [], current = "";
  for (let word of words)
    if (current.length + word.length + 1 > maxWidth)
      lines.push(current), current = word;
    else
      current = current ? `${current} ${word}` : word;
  if (current)
    lines.push(current);
  return lines.map((line, i) => i === 0 ? line : `${indent}${line}`);
}
function formatStepStyleD(step, stepNum, box) {
  let lines = [];
  switch (step.type) {
    case "parse":
      return null;
    case "env-strip": {
      lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Strip environment variables`);
      let envKeys = Object.keys(step.envVars);
      return lines.push(`  Removed: ${envKeys.map((k) => `${k}=<redacted>`).join(", ")}`), lines.push(`  Tokens:  ${formatTokenArray(step.output)}`), { lines, incrementStep: !0 };
    }
    case "leading-tokens-stripped":
      return lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Strip wrappers`), lines.push(`  Removed: ${step.removed.join(", ")}`), lines.push(`  Tokens:  ${formatTokenArray(step.output)}`), { lines, incrementStep: !0 };
    case "shell-wrapper":
      return lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Detect shell wrapper`), lines.push(`  Wrapper: ${step.wrapper} -c`), lines.push(`  Inner:   ${step.innerCommand}`), { lines, incrementStep: !0 };
    case "interpreter": {
      if (lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Detect interpreter`), lines.push(`  Interpreter: ${step.interpreter}`), lines.push(`  Code:        ${step.codeArg}`), step.paranoidBlocked)
        lines.push("  Result:      ✗ BLOCKED (paranoid mode)");
      return { lines, incrementStep: !0 };
    }
    case "busybox":
      return lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Busybox wrapper`), lines.push(`  Subcommand: ${step.subcommand}`), { lines, incrementStep: !0 };
    case "transparent-wrapper":
      return lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Transparent wrapper`), lines.push(`  Wrapper: ${step.wrapper}`), lines.push(`  Tokens:  ${formatTokenArray(step.output)}`), { lines, incrementStep: !0 };
    case "recurse":
      return { lines: [], incrementStep: !1 };
    case "rule-check": {
      lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Match rules`);
      let ruleRef = `${step.ruleModule}:${step.ruleFunction}()`;
      if (lines.push(`  Rule:   ${ruleRef}`), step.matched)
        lines.push("  Result: MATCHED");
      else
        lines.push("  Result: No match");
      return { lines, incrementStep: !0 };
    }
    case "worktree-relaxation":
      return lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Worktree relaxation`), lines.push(`  Mode:   ${ENV_FLAGS.worktree.name}`), lines.push(`  Git cwd: ${step.gitCwd}`), lines.push("  Result: Allowed local discard in linked worktree"), { lines, incrementStep: !0 };
    case "tmpdir-check":
      return null;
    case "fallback-scan": {
      if (step.embeddedCommandFound)
        return lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Fallback scan`), lines.push(`  Found: ${step.embeddedCommandFound}`), { lines, incrementStep: !0 };
      return null;
    }
    case "custom-rules-check": {
      if (step.rulesChecked) {
        if (lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Custom rules`), step.matched)
          lines.push("  Result: MATCHED");
        else
          lines.push("  Result: No match");
        return { lines, incrementStep: !0 };
      }
      return null;
    }
    case "cwd-change":
      return null;
    case "dangerous-text": {
      if (step.matched)
        return lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Dangerous text check`), lines.push(`  Token:  ${step.token}`), lines.push("  Result: MATCHED"), { lines, incrementStep: !0 };
      return null;
    }
    case "strict-unparseable":
      return lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Strict mode check`), lines.push(`  Command: ${step.rawCommand}`), lines.push("  Result:  ✗ UNPARSEABLE"), { lines, incrementStep: !0 };
    case "segment-skipped":
      return null;
    case "error":
      return lines.push(""), lines.push(`ERROR: ${step.message}`), { lines, incrementStep: !1 };
    default:
      return null;
  }
}

// src/bin/explain/format.ts
function formatTraceHuman(result, options2) {
  let box = getBoxChars(options2?.asciiOnly ?? !1), width = 58, lines = [], stepNum = 1;
  lines.push(...formatHeader(box, 58)), lines.push("");
  let errorStep = result.trace.steps.find((s) => s.type === "error");
  if (errorStep && errorStep.type === "error") {
    lines.push("ERROR"), lines.push(`  ${errorStep.message}`), lines.push(""), lines.push("RESULT"), lines.push(`  Status: ${result.result === "blocked" ? colors.red("BLOCKED") : colors.green("ALLOWED")}`), lines.push(""), lines.push("CONFIG");
    let configPath2 = result.configSource ?? "none";
    return lines.push(`  Path: ${configPath2}`), lines.join(`
`);
  }
  let parseStep = result.trace.steps.find((s) => s.type === "parse");
  if (parseStep && parseStep.type === "parse") {
    lines.push("INPUT"), lines.push(`  ${parseStep.input}`), lines.push(""), lines.push(`STEP ${stepNum} ${box.h} Split shell commands`), stepNum++;
    for (let i = 0;i < parseStep.segments.length; i++) {
      let seg = parseStep.segments[i];
      if (seg) {
        let seed = Math.random();
        lines.push(`  Segment ${i + 1}: ${formatColoredTokenArray(seg, seed)}`);
      }
    }
  }
  let segments = result.trace.segments, hasMultipleSegments = segments.length > 1;
  for (let seg of segments) {
    if (hasMultipleSegments) {
      lines.push("");
      let segCommand = "";
      if (parseStep && parseStep.type === "parse") {
        let tokens = parseStep.segments[seg.index];
        if (tokens)
          segCommand = tokens.join(" ");
      }
      let maxLabelLen = 54, displayCommand = segCommand, baseLabel = ` Segment ${seg.index + 1}: `, suffix = " ";
      if (segCommand) {
        if (baseLabel.length + segCommand.length + suffix.length > maxLabelLen) {
          let availableForCmd = maxLabelLen - baseLabel.length - suffix.length;
          displayCommand = `${segCommand.substring(0, availableForCmd - 1)}…`;
        }
      }
      let labelContent = segCommand ? `${baseLabel}${displayCommand}${suffix}` : ` Segment ${seg.index + 1} `, coloredContent = segCommand ? `${baseLabel}${colors.cyan(displayCommand)}${suffix}` : labelContent, segLineLen = 58 - labelContent.length, leftLen = Math.floor(segLineLen / 2), rightLen = segLineLen - leftLen;
      lines.push(`${box.sh.repeat(leftLen)}${coloredContent}${box.sh.repeat(rightLen)}`);
    }
    if (seg.steps.find((s) => s.type === "segment-skipped")) {
      lines.push(""), lines.push("  (skipped — prior segment blocked)");
      continue;
    }
    let inRecursion = !1, hasVisibleSteps = !1;
    for (let step of seg.steps) {
      let formattedStep = formatStepStyleD(step, stepNum, box);
      if (formattedStep) {
        if (hasVisibleSteps = !0, step.type === "recurse") {
          lines.push("");
          let recurseLabel = " RECURSING ", recurseLineLen = 58 - recurseLabel.length - 4;
          lines.push(`  ${box.tl}${box.h}${recurseLabel}${box.h.repeat(recurseLineLen)}`), lines.push(`  ${box.v}`), inRecursion = !0;
          continue;
        }
        for (let line of formattedStep.lines)
          if (inRecursion)
            lines.push(`  ${box.v} ${line}`);
          else
            lines.push(line);
        if (formattedStep.incrementStep)
          stepNum++;
      }
    }
    if (inRecursion)
      lines.push(`  ${box.v}`), lines.push(`  ${box.bl}${box.h.repeat(56)}`), inRecursion = !1;
    if (!hasVisibleSteps)
      lines.push(""), lines.push(`  ${colors.green("✓")} Allowed (no matching rules)`);
  }
  if (lines.push(""), lines.push("RESULT"), result.result === "blocked") {
    if (lines.push(`  Status: ${colors.red("BLOCKED")}`), result.customRule) {
      if (lines.push(`  Rule: ${result.customRule.id}`), result.customRule.rulebook)
        lines.push(`  Rulebook: ${result.customRule.rulebook.name} ${result.customRule.rulebook.version}`);
      if (result.customRule.source)
        lines.push(`  Source: ${result.customRule.source}`);
      if (result.customRule.override)
        lines.push(`  Override: reason ${result.customRule.override.reason}`);
    }
    if (result.reason) {
      let reasonLines = wrapReason(result.reason, "          ");
      lines.push(`  Reason: ${reasonLines[0]}`);
      for (let i = 1;i < reasonLines.length; i++)
        lines.push(reasonLines[i] ?? "");
    }
  } else
    lines.push(`  Status: ${colors.green("ALLOWED")}`);
  lines.push(""), lines.push("CONFIG");
  let configPath = result.configSource ?? "none", configStatus = result.configValid ? "" : " (invalid)";
  lines.push(`  Path: ${configPath}${configStatus}`), lines.push(`  Safety preset: ${result.selectedPreset ?? "standard"}`), lines.push(`  Effective capabilities: ${result.effectiveLevel}`);
  let overrides = Object.entries(result.destructiveCommandRuleOverrides ?? {});
  if (lines.push(`  Rule customizations: ${overrides.length}`), result.ruleActivation)
    lines.push(`  Rule activation: ${result.ruleActivation.id} — ${result.ruleActivation.enabled ? "on" : "off"} via ${result.ruleActivation.source}`);
  return lines.join(`
`);
}
function formatTraceJson(result) {
  return JSON.stringify(result, null, 2);
}
// src/bin/gui/index.ts
import { spawn as spawn2 } from "node:child_process";
import { randomBytes as randomBytes3 } from "node:crypto";
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

  --strict-fg: light-dark(#1e40af, #9ec3ff);
  --strict-bg: light-dark(#eef4fe, #101a2b);
  --strict-border: light-dark(#c5d6f6, #23446e);
  --paranoid-fg: light-dark(#6b21a8, #d8b4fe);
  --paranoid-bg: light-dark(#faf5ff, #21152c);
  --paranoid-border: light-dark(#e4ccf4, #513064);

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

.rule-example-popover {
  position: fixed;
  inset: auto;
  width: min(360px, calc(100vw - 24px));
  margin: 0;
  padding: 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 4px 8px rgb(0 0 0 / 18%);
}

.rule-example-popover::backdrop {
  background: transparent;
}

.rule-example-popover > * {
  display: block;
}

.rule-example-label {
  margin-bottom: 3px;
  color: var(--muted);
  font-size: 11px;
}

.rule-example-popover strong {
  margin-bottom: 10px;
  font-size: 13px;
}

.rule-example-popover code {
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
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

.foldable > .panel-head {
  position: relative;
  min-height: 44px;
}

.foldable > .panel-head .panel-toggle::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
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

.panel-toggle[aria-expanded="false"] .panel-chevron,
.tier-toggle[aria-expanded="false"] .panel-chevron {
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

:is(label.row, .rule-control) input[type="checkbox"] {
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

:is(label.row, .rule-control) input[type="checkbox"]::before {
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

:is(label.row, .rule-control) input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}

:is(label.row, .rule-control) input[type="checkbox"]:checked::before {
  transform: translateX(14px);
}

:is(label.row, .rule-control):hover input[type="checkbox"]:not(:checked) {
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

:is(label.row, .rule-control) span {
  display: block;
  min-width: 0;
}

:is(label.row, .rule-control) strong {
  font-weight: 650;
  font-size: 13px;
}

:is(label.row, .rule-control) .rule-id {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
  word-break: break-all;
}

:is(label.row, .rule-control) small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  line-height: 1.45;
}

#destructive-command > label.row {
  margin-bottom: 16px;
}

.preset-status {
  margin-bottom: 10px;
  font-weight: 700;
}

.preset-status.customized {
  color: var(--master-fg);
}

.rule-customization-actions {
  display: flex;
  justify-content: flex-end;
  margin: -8px 0 12px;
}

.rule-tier {
  overflow: clip;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
}

.rule-tier + .rule-tier {
  margin-top: 10px;
}

.rule-tier-strict {
  border-color: var(--strict-border);
}

.rule-tier-paranoid {
  border-color: var(--paranoid-border);
}

.rule-tier-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  background: var(--surface-2);
}

.rule-tier-strict .rule-tier-head {
  background: var(--strict-bg);
  color: var(--strict-fg);
}

.rule-tier-paranoid .rule-tier-head {
  background: var(--paranoid-bg);
  color: var(--paranoid-fg);
}

.tier-toggle {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.tier-toggle > span:last-child {
  display: grid;
  gap: 1px;
}

.tier-toggle small,
.tier-counts {
  color: inherit;
  font-size: 11px;
  opacity: 0.82;
}

.tier-counts {
  flex: none;
  text-align: right;
}

.tier-content {
  padding: 12px;
  border-top: 1px solid var(--border);
}

.rule-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.rule-row:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.rule-row.row-disabled {
  background: var(--surface);
}

.rule-control {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
}

.rule-row.row-disabled .rule-control {
  cursor: not-allowed;
  opacity: 0.62;
}

.rule-example-button {
  position: relative;
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
}

.rule-example-button::before {
  content: "";
  position: absolute;
  inset: -9px;
}

.rule-example-button:hover:not(:disabled) {
  color: var(--ink);
}

.inherit-button {
  grid-column: 1 / -1;
  justify-self: end;
  padding: 5px 8px;
  font-size: 11px;
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

  .rule-tier-head,
  .rule-tier-head {
    align-items: stretch;
    flex-direction: column;
  }

  .rule-row {
    align-items: start;
  }

  .tier-counts {
    padding-left: 18px;
    text-align: left;
  }

  .inherit-button {
    align-self: flex-start;
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
          <h2>Safety preset</h2>
          <p class="panel-sub muted">Choose inherited protection defaults, then customize only what this workspace needs.</p>
        </div>
      </div>
      <div id="safety-preset-status" class="preset-status"></div>
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
  <div class="rule-example-popover" id="rule-example-popover" popover="auto" role="dialog" aria-labelledby="rule-example-title" aria-describedby="rule-example-command">
    <span class="rule-example-label">Blocked command example</span>
    <strong id="rule-example-title"></strong>
    <code id="rule-example-command"></code>
  </div>
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
      standard: ['Standard', 'Blocks recognizable destructive commands and sensitive content access while allowing metadata-only sensitive-path checks. Recommended for normal coding.'],
      strict: ['Strict', 'Standard, plus blocks dynamic or unparseable commands and metadata-only sensitive-path discovery. Occasional false positives on advanced shell.'],
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
    const searchPanelIds = ['destructive-command-panel-content', 'secret-panel-content'];
    let state;
    let draftPolicy;
    let preview;
    let previewRequestId = 0;
    let dirty = false;
    let searchActive = false;
    const searchExpandedPanels = new Set();
    const tierExpanded = new Map([
      ['normal', false],
      ['strict', false],
      ['paranoid', false]
    ]);
    const searchCollapsedTiers = new Set();
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
      && (value.preview === null || (value.preview && typeof value.preview === 'object'))
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
    const setPanelExpanded = (button, expanded) => {
      button.setAttribute('aria-expanded', String(expanded));
      qs(button.getAttribute('aria-controls')).hidden = !expanded;
    };
    const togglePanel = (button) => {
      searchExpandedPanels.delete(button.getAttribute('aria-controls'));
      setPanelExpanded(button, button.getAttribute('aria-expanded') !== 'true');
    };
    const syncSearchPanels = () => {
      const active = qs('policy-search').value.trim().length > 0;
      if (active === searchActive) return;
      searchActive = active;
      if (!active) searchCollapsedTiers.clear();
      searchPanelIds.forEach((id) => {
        const button = document.querySelector(\`[aria-controls="\${id}"]\`);
        if (active) {
          if (button.getAttribute('aria-expanded') === 'true') return;
          searchExpandedPanels.add(id);
          setPanelExpanded(button, true);
          return;
        }
        if (!searchExpandedPanels.delete(id)) return;
        setPanelExpanded(button, false);
      });
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
    const renderSecretPatterns = () => {
      const query = qs('policy-search').value.trim().toLowerCase();
      const rules = state.secretPatterns.filter((rule) =>
        [rule.category, rule.label, rule.id, rule.description].join(' ').toLowerCase().includes(query)
      );
      const overrides = draftPolicy.secret_protection.overrides;
      const disabled = !draftPolicy.secret_protection.enabled;
      const disabledCount = Object.keys(overrides).length;
      qs('secret-summary').textContent = disabled
        ? 'Protection disabled. Saved rule settings and deny paths are preserved.'
        : \`\${state.secretPatterns.length - disabledCount} active, \${disabledCount} disabled\`;
      qs('secret-patterns').innerHTML = rules.length === 0
        ? '<p class="empty">No secret protections match the search.</p>'
        : groupRules(rules).map((group) => \`
          <section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules.map((rule) => {
              const active = overrides[rule.id] !== 'off';
              const ruleState = active && !disabled
                ? { label: 'Active', className: 'state-active' }
                : { label: 'Disabled', className: 'state-disabled' };
              return \`<label class="row \${disabled ? 'row-disabled' : ''}">
                <input type="checkbox" data-secret-active="\${escapeHtml(rule.id)}" \${checkbox(active)} \${disabled ? 'disabled' : ''}>
                <span>
                  <strong>\${escapeHtml(rule.label)}</strong>
                  <code class="rule-id">\${escapeHtml(rule.id)}</code>
                  <small><span class="\${ruleState.className}">\${ruleState.label}</span> \${escapeHtml(rule.description)}</small>
                </span>
              </label>\`;
            }).join('')}</div>
          </section>
        \`).join('');
    };
    const levelCapabilities = (level) => ({
      fail_closed: level === 'strict' || level === 'paranoid',
      paranoid_rm: level === 'paranoid',
      paranoid_interpreters: level === 'paranoid'
    });
    const presetName = () => safetyLevels[draftPolicy.safety.level][0];
    const renderPresetStatus = () => {
      if (!preview) return;
      const customized = preview.counts.effectiveCustomizations > 0
        || Object.entries(draftPolicy.safety.overrides).some(([key, value]) =>
          value !== levelCapabilities(draftPolicy.safety.level)[key]
        );
      qs('safety-preset-status').textContent = [
        presetName(),
        ...(customized ? ['Customized'] : [])
      ].join(' · ');
      qs('safety-preset-status').classList.toggle('customized', customized);
    };
    const renderSafety = () => {
      const environmentSources = preview
        ? [...new Set(Object.values(preview.capabilities)
          .filter((capability) => capability.source === 'environment')
          .flatMap((capability) => capability.sources.filter((source) => source.startsWith('env '))))]
        : [];
      qs('environment-overrides').hidden = environmentSources.length === 0;
      qs('environment-overrides').textContent = environmentSources.length
        ? \`Environment-raised protection: \${environmentSources.join(', ')}\`
        : '';
      qs('safety-level').innerHTML = Object.entries(safetyLevels).map(([level, meta]) =>
        \`<label class="row"><input type="radio" name="safety-level" value="\${level}" \${checkbox(draftPolicy.safety.level === level)}><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span></label>\`
      ).join('');
      const inherited = levelCapabilities(draftPolicy.safety.level);
      qs('safety-overrides').innerHTML = Object.entries(safetyOverrides).map(([key, meta]) => {
        const value = draftPolicy.safety.overrides[key];
        const inheritedText = inherited[key] ? 'on' : 'off';
        return \`<label class="row safety-override-row"><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span><select data-safety-override="\${key}">
          <option value="inherit" \${value === undefined ? 'selected' : ''}>Inherit from preset (\${inheritedText})</option>
          <option value="true" \${value === true ? 'selected' : ''}>Force on</option>
          <option value="false" \${value === false ? 'selected' : ''}>Force off</option>
        </select></label>\`;
      }).join('');
      qs('workflow').innerHTML =
        \`<label class="row"><input type="checkbox" data-workflow-worktree \${checkbox(draftPolicy.workflow.worktree_mode)}><span><strong>Allow discarding local changes in linked git worktrees</strong><small>Only relaxes linked worktree discard checks.</small></span></label>\`;
      renderPresetStatus();
    };
    const tierForRule = (rule) => {
      if (!rule.activationCapability) return 'normal';
      return rule.activationCapability === 'fail_closed' ? 'strict' : 'paranoid';
    };
    const tierMeta = {
      normal: ['Available in every preset', 'No additional capability required'],
      strict: ['Strict tier', 'Inherits from Fail closed'],
      paranoid: ['Paranoid tier', 'Inherits from Paranoid rm or Paranoid interpreters']
    };
    const ruleStateText = (rule, effective) => {
      if (effective.source === 'master_disabled') return 'Off — destructive-command protection disabled';
      if (effective.source === 'rule_override') return \`\${effective.enabled ? 'On' : 'Off'} — user rule override\`;
      if (effective.source === 'built_in_default') return 'On — available in every preset';
      if (effective.source === 'environment') {
        const capability = preview.capabilities[rule.activationCapability];
        const source = [...capability.sources].reverse().find((item) => item.startsWith('env '));
        return \`\${effective.enabled ? 'On' : 'Off'} — environment\${source ? \`; \${source.slice(4)}\` : ''}\`;
      }
      if (effective.source === 'capability_override') {
        return \`\${effective.enabled ? 'On' : 'Off'} — capability override; \${safetyOverrides[rule.activationCapability][0]} forced \${effective.enabled ? 'on' : 'off'}\`;
      }
      if (effective.enabled) return \`On — \${presetName()} preset\`;
      return \`Off — \${presetName()} preset; requires \${tierForRule(rule) === 'strict' ? 'Strict' : 'Paranoid'}\`;
    };
    const openRuleExample = (button) => {
      const rule = state.destructiveCommandRules.find((item) => item.id === button.dataset.ruleExample);
      if (!rule) return;
      const popover = qs('rule-example-popover');
      qs('rule-example-title').textContent = rule.label;
      qs('rule-example-command').textContent = rule.example;
      if (!popover.matches(':popover-open')) popover.showPopover();
      const buttonRect = button.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const gap = 8;
      const edge = 12;
      const below = buttonRect.bottom + gap;
      const top = below + popoverRect.height <= window.innerHeight - edge
        ? below
        : Math.max(edge, buttonRect.top - gap - popoverRect.height);
      const left = Math.min(
        window.innerWidth - popoverRect.width - edge,
        Math.max(edge, buttonRect.right - popoverRect.width)
      );
      popover.style.top = \`\${top}px\`;
      popover.style.left = \`\${left}px\`;
    };
    const renderDestructiveCommands = () => {
      if (!preview) return;
      const query = qs('policy-search').value.trim().toLowerCase();
      const matchingRules = state.destructiveCommandRules.filter((rule) =>
        [rule.category, rule.label, rule.id, rule.description, tierMeta[tierForRule(rule)][0]]
          .join(' ').toLowerCase().includes(query)
      );
      qs('destructive-command-summary').textContent = draftPolicy.destructive_command_protection.enabled
        ? \`\${preview.counts.enabled} active, \${preview.counts.disabled} disabled\`
        : 'Protection disabled. Saved rule settings are preserved. Custom rules and secret protection still apply.';
      qs('destructive-command-rules').innerHTML = matchingRules.length === 0
        ? '<p class="empty">No built-in protections match the search.</p>'
        : Object.keys(tierMeta).map((tier) => {
          const rules = matchingRules.filter((rule) => tierForRule(rule) === tier);
          if (rules.length === 0) return '';
          const allTierRules = state.destructiveCommandRules.filter((rule) => tierForRule(rule) === tier);
          const tierStates = allTierRules.map((rule) => preview.rules[rule.id]);
          const expanded = tierExpanded.get(tier)
            || (searchActive && !searchCollapsedTiers.has(tier));
          const contentId = \`destructive-tier-\${tier}\`;
          return \`<section class="rule-tier rule-tier-\${tier}">
            <div class="rule-tier-head">
              <button type="button" class="tier-toggle" data-tier-toggle="\${tier}" aria-expanded="\${expanded}" aria-controls="\${contentId}">
                <span class="panel-chevron" aria-hidden="true"></span>
                <span><strong>\${tierMeta[tier][0]}</strong><small>\${tierMeta[tier][1]}</small></span>
              </button>
              <span class="tier-counts">\${tierStates.filter((item) => item.enabled).length} on · \${tierStates.filter((item) => !item.enabled).length} off · \${tierStates.filter((item) => item.changesInherited).length} customized</span>
            </div>
            <div id="\${contentId}" class="tier-content" \${expanded ? '' : 'hidden'}>
              \${groupRules(rules).map((group) => \`<section class="destructive-command-group">
                <h3>\${escapeHtml(group.category)}</h3>
                <div class="grid">\${group.rules.map((rule) => {
                  const effective = preview.rules[rule.id];
                  const override = draftPolicy.destructive_command_protection.overrides[rule.id];
                  const status = ruleStateText(rule, effective);
                  const disabled = !draftPolicy.destructive_command_protection.enabled;
                  return \`<div class="row rule-row \${disabled ? 'row-disabled' : ''}">
                    <label class="rule-control">
                      <input type="checkbox" data-destructive-command-active="\${escapeHtml(rule.id)}" \${checkbox(effective.enabled)} \${disabled ? 'disabled' : ''} aria-label="\${escapeHtml(\`\${rule.label}: \${status}\`)}">
                      <span>
                        <strong>\${escapeHtml(rule.label)}</strong>
                        <code class="rule-id">\${escapeHtml(rule.id)}</code>
                        <small><span class="\${effective.enabled ? 'state-active' : 'state-disabled'}">\${escapeHtml(status)}</span> \${escapeHtml(rule.description)}</small>
                      </span>
                    </label>
                    <button type="button" class="rule-example-button" data-rule-example="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show blocked example for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
                    \${override ? \`<button type="button" class="inherit-button" data-use-inherited="\${escapeHtml(rule.id)}">Use inherited setting</button>\` : ''}
                  </div>\`;
                }).join('')}</div>
              </section>\`).join('')}
            </div>
          </section>\`;
        }).join('');
    };
    const refreshPolicyPreview = async () => {
      const requestId = ++previewRequestId;
      const result = await requestJson('/api/policy/preview', {
        method: 'POST',
        body: JSON.stringify(collectFormPolicy())
      });
      if (requestId !== previewRequestId) return false;
      if (!result.ok || !result.data?.preview) {
        setAppStatus('Preview failed', 'error');
        setDetailStatus(\`Error: \${errorText(result)}\`, 'error');
        return false;
      }
      preview = result.data.preview;
      renderSafety();
      renderDestructiveCommands();
      return true;
    };
    function render() {
      draftPolicy = clonePolicy(state.policy);
      preview = state.preview;
      dirty = false;
      qs('policy-path').textContent = state.path + (state.exists ? '' : ' (not created yet)');
      renderSafety();
      qs('destructive-command').innerHTML =
        '<label class="row master"><input type="checkbox" data-destructive-command-enabled ' + checkbox(state.policy.destructive_command_protection.enabled) + '><span><strong>Destructive command protection</strong><small>Block built-in destructive git, filesystem, and execution patterns. Custom rules remain active when disabled.</small></span><span class="master-badge" aria-hidden="true"></span></label>' +
        '<div class="rule-customization-actions"><button type="button" id="reset-rule-customizations">Reset rule customizations</button></div>' +
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
      syncSearchPanels();
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
        syncSearchPanels();
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
        void refreshPolicyPreview();
        return;
      }
      if (input.dataset?.safetyOverride) {
        if (input.value === 'inherit') delete draftPolicy.safety.overrides[input.dataset.safetyOverride];
        if (input.value === 'true') draftPolicy.safety.overrides[input.dataset.safetyOverride] = true;
        if (input.value === 'false') draftPolicy.safety.overrides[input.dataset.safetyOverride] = false;
        syncRawFromForm();
        updateDirtyStatus();
        void refreshPolicyPreview();
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
          syncRawFromForm();
          updateDirtyStatus();
          void refreshPolicyPreview();
        })();
        return;
      }
      if (input.dataset?.destructiveCommandActive) {
        const ruleId = input.dataset.destructiveCommandActive;
        const rule = state.destructiveCommandRules.find((item) => item.id === ruleId);
        if (rule?.activationCapability) {
          draftPolicy.destructive_command_protection.overrides[ruleId] = input.checked ? 'on' : 'off';
        } else if (input.checked) {
          delete draftPolicy.destructive_command_protection.overrides[input.dataset.destructiveCommandActive];
        } else {
          draftPolicy.destructive_command_protection.overrides[input.dataset.destructiveCommandActive] = 'off';
        }
        syncRawFromForm();
        updateDirtyStatus();
        void refreshPolicyPreview();
        return;
      }
      if (input.dataset?.secretActive) {
        if (input.checked) delete draftPolicy.secret_protection.overrides[input.dataset.secretActive];
        else draftPolicy.secret_protection.overrides[input.dataset.secretActive] = 'off';
        renderSecretPatterns();
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
      const ruleExampleButton = event.target.closest?.('[data-rule-example]');
      if (ruleExampleButton) {
        openRuleExample(ruleExampleButton);
        return;
      }
      const tierButton = event.target.closest?.('[data-tier-toggle]');
      if (tierButton) {
        const tier = tierButton.dataset.tierToggle;
        const expanded = tierButton.getAttribute('aria-expanded') === 'true';
        tierExpanded.set(tier, !expanded);
        if (searchActive && expanded) searchCollapsedTiers.add(tier);
        if (!expanded) searchCollapsedTiers.delete(tier);
        renderDestructiveCommands();
        return;
      }
      const button = event.target.closest?.('.panel-toggle');
      if (button) {
        togglePanel(button);
        return;
      }
      const inheritedButton = event.target.closest?.('[data-use-inherited]');
      if (inheritedButton) {
        delete draftPolicy.destructive_command_protection.overrides[inheritedButton.dataset.useInherited];
        syncRawFromForm();
        updateDirtyStatus();
        void refreshPolicyPreview();
        return;
      }
      if (event.target.closest?.('#reset-rule-customizations')) {
        if (Object.keys(draftPolicy.destructive_command_protection.overrides).length === 0) {
          setAppStatus('No rule customizations to reset', 'ok');
          return;
        }
        void (async () => {
          if (!(await confirmDialog({
            title: 'Reset rule customizations?',
            body: 'All built-in destructive-command rules will return to their inherited preset settings.',
            confirmLabel: 'Reset customizations'
          }))) return;
          draftPolicy.destructive_command_protection.overrides = {};
          syncRawFromForm();
          updateDirtyStatus();
          void refreshPolicyPreview();
        })();
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
var REPO = "kenryu42/cc-safety-net", REPO_URL = `https://github.com/${REPO}`, STAR_TIMEOUT_MS = 1e4;
async function runGuiCommand(args, options2 = {}) {
  let flags = parseGuiArgs(args), log = options2.log ?? console.log, error = options2.error ?? console.error;
  if (!flags)
    return error("Usage: cc-safety-net gui [--no-open]"), 1;
  let server = await createPolicyGuiServer(options2);
  if (log(`CC Safety Net policy GUI: ${server.url}`), !flags.noOpen)
    try {
      await (options2.openBrowser ?? openBrowser)(server.url);
    } catch (openError) {
      error(`Failed to open browser: ${openError instanceof Error ? openError.message : String(openError)}`), error(`Open this URL manually: ${server.url}`);
    }
  if (options2.keepAlive === !1)
    return await server.close(), 0;
  return await waitForShutdown(server), 0;
}
async function createPolicyGuiServer(options2 = {}) {
  let token = options2.token ?? randomBytes3(24).toString("base64url"), server = createServer((request, response) => {
    handleRequest(request, response, token, options2);
  });
  await new Promise((resolve15, reject) => {
    server.once("error", reject), server.listen(0, "127.0.0.1", () => {
      server.off("error", reject), resolve15();
    });
  });
  let origin = `http://127.0.0.1:${server.address().port}`;
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
  let url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/favicon.ico") {
    response.writeHead(204, { "cache-control": "no-store" }), response.end();
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
    let result = readUserPolicyForGui(options2);
    sendJson(response, 200, {
      ...result,
      destructiveCommandRules: DESTRUCTIVE_COMMAND_RULE_METADATA,
      secretPatterns: SECRET_PROTECTION_RULE_METADATA,
      preview: result.errors.length > 0 ? null : createPolicyPreview(result.policy)
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/policy/preview") {
    let body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, 400, { errors: [body.error] });
      return;
    }
    let result = previewUserPolicyForGui(body.value);
    sendJson(response, result.errors.length > 0 ? 400 : 200, result);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/policy") {
    let body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, 400, { errors: [body.error] });
      return;
    }
    let result = writeUserPolicyFromGui(body.value, options2);
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
    let result = await (options2.starRepo ?? starRepo)();
    sendJson(response, 200, result.ok ? { ok: !0 } : { ok: !1, fallbackUrl: REPO_URL });
    return;
  }
  sendJson(response, 404, { error: "Not found" });
}
function requestHasValidToken(request, url, token) {
  if (url.searchParams.get("token") !== token)
    return !1;
  if (request.method !== "POST")
    return !0;
  return request.headers["x-cc-safety-net-token"] === token;
}
async function readJsonBody(request) {
  let chunks = [];
  for await (let chunk of request)
    chunks.push(chunk);
  try {
    return { ok: !0, value: JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}") };
  } catch (error) {
    return {
      ok: !1,
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
function sendHtml(response, html) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  }), response.end(html);
}
function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }), response.end(JSON.stringify(body));
}
function closeServer(server) {
  return new Promise((resolve15, reject) => {
    server.close((error) => error ? reject(error) : resolve15());
  });
}
function waitForShutdown(server) {
  return new Promise((resolve15) => {
    let cleanup = () => {
      process.off("SIGINT", shutdown), process.off("SIGTERM", shutdown);
    }, shutdown = () => {
      cleanup(), server.close().then(resolve15);
    };
    process.once("SIGINT", shutdown), process.once("SIGTERM", shutdown);
  });
}
function openBrowser(url) {
  let command2 = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open", args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  return new Promise((resolve15, reject) => {
    let child = spawn2(command2, args, { detached: !0, stdio: "ignore" }), handleError = (error) => {
      child.off("spawn", handleSpawn), reject(error);
    }, handleSpawn = () => {
      child.off("error", handleError), child.unref(), resolve15();
    };
    child.once("error", handleError), child.once("spawn", handleSpawn);
  });
}
async function starRepo(command2 = "gh", timeoutMs = STAR_TIMEOUT_MS) {
  return {
    ok: await runGhCommand(command2, ["api", "-X", "PUT", `/user/starred/${REPO}`], timeoutMs) === 0
  };
}
async function fetchStarContext(options2 = {}) {
  let [starred, starCount, blockedTotal] = await Promise.all([
    userHasStarredRepo(options2.command),
    fetchStarCount(options2.fetchRepo),
    Promise.resolve(getActivitySummary(36500, options2.logsDir).totalBlocked)
  ]);
  return { starred, starCount, blockedTotal };
}
async function userHasStarredRepo(command2 = "gh", timeoutMs = STAR_TIMEOUT_MS) {
  if (await runGhCommand(command2, ["auth", "status"], timeoutMs) !== 0)
    return null;
  let starredExitCode = await runGhCommand(command2, ["api", `/user/starred/${REPO}`], timeoutMs);
  if (starredExitCode === 0)
    return !0;
  if (starredExitCode === null)
    return null;
  return !1;
}
function runGhCommand(command2, args, timeoutMs) {
  return new Promise((resolve15) => {
    let child = spawn2(command2, args, {
      stdio: "ignore",
      windowsHide: !0
    }), settled = !1, timeout, finish = (code) => {
      if (settled)
        return;
      if (settled = !0, timeout)
        clearTimeout(timeout);
      resolve15(code);
    };
    child.once("error", () => finish(null)), child.once("close", finish), timeout = setTimeout(() => {
      child.kill(), finish(null);
    }, timeoutMs);
  });
}
async function fetchStarCount(fetchRepo = fetch) {
  try {
    let response = await fetchRepo(`https://api.github.com/repos/${REPO}`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(STAR_TIMEOUT_MS)
    });
    if (!response.ok)
      return null;
    let body = await response.json();
    return typeof body.stargazers_count === "number" ? body.stargazers_count : null;
  } catch {
    return null;
  }
}

// src/bin/help.ts
var version = "1.0.6", INDENT = "  ", PROGRAM_NAME = "cc-safety-net";
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
  let usage = `${PROGRAM_NAME} ${cmd.usage}`;
  return `${INDENT}${usage.padEnd(maxUsageWidth + 2)}${cmd.description}`;
}
function formatEnvironmentVariable(name, description) {
  return `${INDENT}${name.padEnd(Math.max(40, name.length + 2))}${description}`;
}
function printCommandHelp(command2) {
  let lines = [];
  if (lines.push(`${PROGRAM_NAME} ${command2.name}`), lines.push(""), lines.push(`${INDENT}${command2.description}`), lines.push(""), lines.push("USAGE:"), lines.push(`${INDENT}${PROGRAM_NAME} ${command2.usage}`), lines.push(""), command2.subcommands && command2.subcommands.length > 0) {
    lines.push("SUBCOMMANDS:");
    let subcommandWidth = getSubcommandsColumnWidth(command2.subcommands);
    for (let subcommand of command2.subcommands)
      lines.push(`${INDENT}${subcommand.usage.padEnd(subcommandWidth + 2)}${subcommand.description}`);
    lines.push("");
  }
  if (command2.options.length > 0) {
    lines.push("OPTIONS:");
    let optWidth = getOptionsColumnWidth(command2.options);
    for (let opt of command2.options) {
      let flags = formatOptionFlags(opt);
      lines.push(`${INDENT}${flags.padEnd(optWidth + 2)}${opt.description}`);
    }
    lines.push("");
  }
  if (command2.examples && command2.examples.length > 0) {
    lines.push("EXAMPLES:");
    for (let example of command2.examples)
      lines.push(`${INDENT}${example}`);
  }
  console.log(lines.join(`
`));
}
function printHelp() {
  let visibleCommands = getVisibleCommands(), maxUsageWidth = getCommandSummaryWidth(visibleCommands), lines = [];
  lines.push(`${PROGRAM_NAME} v${version}`), lines.push(""), lines.push("Blocks destructive git and filesystem commands before execution."), lines.push(""), lines.push("COMMANDS:");
  for (let cmd of visibleCommands)
    lines.push(formatCommandSummary(cmd, maxUsageWidth));
  lines.push(""), lines.push("GLOBAL OPTIONS:"), lines.push(`${INDENT}-h, --help       Show help (use with command for command-specific help)`), lines.push(`${INDENT}-V, --version    Show version`), lines.push(""), lines.push("HELP:"), lines.push(`${INDENT}${PROGRAM_NAME} help <command>     Show help for a specific command`), lines.push(`${INDENT}${PROGRAM_NAME} <command> --help   Show help for a specific command`), lines.push(""), lines.push("ENVIRONMENT VARIABLES:"), lines.push(formatEnvironmentVariable(`${ENV_FLAGS.level.name}=standard|strict|paranoid`, "Set session safety level")), lines.push(formatEnvironmentVariable(`${ENV_FLAGS.worktree.name}=1`, "Allow local git discards in linked worktrees")), lines.push(formatEnvironmentVariable(`${ENV_FLAGS.debug.name}=1`, "Log allowed hook commands for debugging")), lines.push(formatEnvironmentVariable("CC_SAFETY_NET_HOME", "Override rule config home directory")), lines.push(""), lines.push("LEGACY ENVIRONMENT VARIABLES (STILL SUPPORTED):"), lines.push(formatEnvironmentVariable(`${ENV_FLAGS.strict.name}=1`, "Force safety.overrides.fail_closed on")), lines.push(formatEnvironmentVariable(`${ENV_FLAGS.paranoid.name}=1`, "Force paranoid_rm and paranoid_interpreters on")), lines.push(formatEnvironmentVariable(`${ENV_FLAGS.paranoidRm.name}=1`, "Force safety.overrides.paranoid_rm on")), lines.push(formatEnvironmentVariable(`${ENV_FLAGS.paranoidInterpreters.name}=1`, "Force safety.overrides.paranoid_interpreters on")), console.log(lines.join(`
`));
}
function printVersion() {
  console.log(version);
}
function showCommandHelp(commandName) {
  let command2 = findCommand(commandName);
  if (!command2)
    return !1;
  if (command2.hidden || command2.name.toLowerCase() !== commandName.toLowerCase())
    return !1;
  return printCommandHelp(command2), !0;
}

// src/bin/hook/install.ts
import { homedir as homedir9 } from "node:os";

// src/bin/hook/install/antigravity-cli.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync4, readFileSync as readFileSync8, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname12 } from "node:path";
var ANTIGRAVITY_HOOK_COMMAND = "npx -y cc-safety-net hook --agy-cli", MANAGED_HOOK_NAME = "cc-safety-net";
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
    let config = JSON.parse(readFileSync8(configPath, "utf-8"));
    if (!config || typeof config !== "object" || Array.isArray(config))
      throw Error("Antigravity hooks config must be a JSON object");
    return config;
  } catch (error) {
    if (error instanceof SyntaxError)
      throw Error(`Failed to parse Antigravity hooks config ${configPath}: ${error.message}`);
    throw error;
  }
}
function getManagedHookDefinition(config) {
  let existing = config[MANAGED_HOOK_NAME];
  if (existing === void 0)
    return config[MANAGED_HOOK_NAME] = managedHookEntry(), config[MANAGED_HOOK_NAME];
  if (!existing || typeof existing !== "object" || Array.isArray(existing))
    throw Error(`Antigravity hooks config entry "${MANAGED_HOOK_NAME}" must be an object`);
  if (!Array.isArray(existing.PreToolUse))
    existing.PreToolUse = [];
  return existing;
}
function hasManagedHookCommand(definition) {
  return definition.PreToolUse?.some((entry) => entry.hooks?.some((hook) => hook.command === ANTIGRAVITY_HOOK_COMMAND)) ?? !1;
}
function hasActiveManagedHook(config) {
  return Object.values(config).some((definition) => definition.enabled !== !1 && hasManagedHookCommand(definition));
}
function enableManagedHookDefinition(config) {
  if (config[MANAGED_HOOK_NAME] === void 0)
    return !1;
  let definition = getManagedHookDefinition(config);
  if (definition.enabled !== !1 || !hasManagedHookCommand(definition))
    return !1;
  return definition.enabled = !0, !0;
}
function appendManagedHook(config) {
  if (config[MANAGED_HOOK_NAME] === void 0) {
    config[MANAGED_HOOK_NAME] = managedHookEntry();
    return;
  }
  let definition = getManagedHookDefinition(config);
  definition.PreToolUse ??= [], definition.enabled = !0, definition.PreToolUse.push(managedHookEntry().PreToolUse?.[0] ?? { hooks: [] });
}
function removeManagedHook(config) {
  let removed = !1;
  for (let definition of Object.values(config)) {
    if (!Array.isArray(definition.PreToolUse))
      continue;
    definition.PreToolUse = definition.PreToolUse.flatMap((entry) => {
      if (!Array.isArray(entry.hooks))
        return [entry];
      let hooks = entry.hooks.filter((hook) => hook.command !== ANTIGRAVITY_HOOK_COMMAND);
      if (hooks.length !== entry.hooks.length)
        removed = !0;
      return hooks.length === 0 ? [] : [{ ...entry, hooks }];
    });
  }
  return removed;
}
function writeAntigravityHooksConfig(configPath, config) {
  writeFileSync2(configPath, `${JSON.stringify(config, null, 2)}
`);
}
function installAntigravityCli(homeDir) {
  let configPath = getAntigravityHooksPath(homeDir);
  if (mkdirSync4(dirname12(configPath), { recursive: !0 }), !existsSync6(configPath))
    return writeAntigravityHooksConfig(configPath, { [MANAGED_HOOK_NAME]: managedHookEntry() }), { path: configPath, alreadyInstalled: !1 };
  let config = parseAntigravityHooksConfig(configPath);
  if (hasActiveManagedHook(config))
    return { path: configPath, alreadyInstalled: !0 };
  if (enableManagedHookDefinition(config))
    return writeAntigravityHooksConfig(configPath, config), { path: configPath, alreadyInstalled: !1 };
  return appendManagedHook(config), writeAntigravityHooksConfig(configPath, config), { path: configPath, alreadyInstalled: !1 };
}
function uninstallAntigravityCli(homeDir) {
  let configPath = getAntigravityHooksPath(homeDir);
  if (!existsSync6(configPath))
    return { path: configPath, alreadyInstalled: !1 };
  let config = parseAntigravityHooksConfig(configPath);
  if (!removeManagedHook(config))
    return { path: configPath, alreadyInstalled: !1 };
  return writeAntigravityHooksConfig(configPath, config), { path: configPath, alreadyInstalled: !0 };
}

// src/bin/hook/install/kimi-code.ts
import { existsSync as existsSync7, mkdirSync as mkdirSync5, readFileSync as readFileSync9, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname13, join as join18 } from "node:path";

// src/bin/hook/config-edit.ts
function isWhitespace(char) {
  return char !== void 0 && /\s/.test(char);
}
function skipString(content, index, errorMessage) {
  let current = index + 1, isEscaped = !1;
  while (current < content.length) {
    let char = content[current];
    if (isEscaped) {
      isEscaped = !1, current++;
      continue;
    }
    if (char === "\\") {
      isEscaped = !0, current++;
      continue;
    }
    if (char === '"')
      return current + 1;
    current++;
  }
  throw Error(errorMessage);
}
function findMatchingBracket(content, openIndex, options2) {
  let open = content[openIndex], close = open === "[" ? "]" : "}", depth = 0, index = openIndex;
  while (index < content.length) {
    let nextIndex = options2.skipComment?.(content, index) ?? index;
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
      if (depth--, depth === 0)
        return index;
    }
    index++;
  }
  throw Error(options2.bracketError);
}
function getLineIndent(content, index) {
  let lineStart = content.lastIndexOf(`
`, index) + 1;
  return /^[ \t]*/.exec(content.slice(lineStart))?.[0] ?? "";
}
function removeArrayRangeItem(content, item) {
  let { start: removeStart, end: removeEnd, end: index } = item;
  while (isWhitespace(content[index]))
    index++;
  if (content[index] === ",") {
    if (removeEnd = index + 1, content[removeEnd] === `
`)
      removeEnd++;
    return `${content.slice(0, removeStart)}${content.slice(removeEnd)}`;
  }
  index = item.start - 1;
  while (isWhitespace(content[index]))
    index--;
  if (content[index] === ",") {
    removeStart = index;
    let lineStart = content.lastIndexOf(`
`, removeStart - 1);
    if (lineStart !== -1 && /^\s*$/.test(content.slice(lineStart + 1, removeStart)))
      removeStart = lineStart;
  }
  return `${content.slice(0, removeStart)}${content.slice(removeEnd)}`;
}

// src/bin/hook/install/kimi-code.ts
var KIMI_HOOK_COMMAND = "npx -y cc-safety-net hook --kimi-code", KIMI_HOOK_BLOCK = `[[hooks]]
event = "PreToolUse"
command = "${KIMI_HOOK_COMMAND}"`, KIMI_INLINE_HOOK = `{ event = "PreToolUse", command = "${KIMI_HOOK_COMMAND}" }`;
function getKimiConfigPath(homeDir) {
  return join18(process.env.KIMI_CODE_HOME ?? join18(homeDir, ".kimi-code"), "config.toml");
}
function removeTopLevelEmptyHooksArray(content) {
  return content.split(`
`).reduce((state, line) => {
    if (/^\s*\[/.test(line))
      return state.activeTable = !0, state.lines.push(line), state;
    if (!state.activeTable && /^\s*hooks\s*=\s*\[\s*]\s*(?:#.*)?$/.test(line))
      return state;
    return state.lines.push(line), state;
  }, { activeTable: !1, lines: [] }).lines.join(`
`);
}
function skipTomlComment(content, index) {
  if (content[index] !== "#")
    return index;
  let newlineIndex = content.indexOf(`
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
  let activeTable = !1, index = 0;
  while (index < content.length) {
    let lineEnd = content.indexOf(`
`, index), end = lineEnd === -1 ? content.length : lineEnd, line = content.slice(index, end);
    if (/^\s*\[/.test(line))
      activeTable = !0;
    if (!activeTable) {
      let match = /^(\s*)hooks\s*=\s*\[/.exec(line);
      if (match) {
        let arrayStart = index + match[0].lastIndexOf("[");
        return { start: arrayStart, end: findTomlArrayClose(content, arrayStart) };
      }
    }
    index = lineEnd === -1 ? content.length : lineEnd + 1;
  }
  return;
}
function appendKimiInlineHook(content, hooksRange) {
  let beforeClose = content.slice(0, hooksRange.end).trimEnd(), closingIndent = getLineIndent(content, hooksRange.end), itemIndent = closingIndent === "" ? "     " : `${closingIndent}  `, needsComma = !beforeClose.endsWith("[") && !beforeClose.endsWith(",");
  return `${beforeClose}${needsComma ? "," : ""}
${itemIndent}${KIMI_INLINE_HOOK}${content.slice(hooksRange.end)}`;
}
function appendKimiHook(content) {
  let inlineHooksRange = findTopLevelInlineHooksArray(content);
  if (inlineHooksRange && content.slice(inlineHooksRange.start + 1, inlineHooksRange.end).trim())
    return appendKimiInlineHook(content, inlineHooksRange);
  let trimmed = removeTopLevelEmptyHooksArray(content).trimEnd();
  if (trimmed === "")
    return `${KIMI_HOOK_BLOCK}
`;
  return `${trimmed}

${KIMI_HOOK_BLOCK}
`;
}
function removeKimiTableHookBlocks(content) {
  return content.split(/(?=^\s*\[\[hooks]]\s*$)/m).filter((block) => !/^\s*\[\[hooks]]\s*$/m.test(block) || !block.includes(KIMI_HOOK_COMMAND)).join("").trimEnd();
}
function removeKimiInlineHook(content, hooksRange) {
  let itemStart = content.indexOf(KIMI_INLINE_HOOK, hooksRange.start);
  if (itemStart === -1 || itemStart > hooksRange.end)
    return content;
  return removeArrayRangeItem(content, {
    start: itemStart,
    end: itemStart + KIMI_INLINE_HOOK.length
  });
}
function installKimiCode(homeDir) {
  let configPath = getKimiConfigPath(homeDir);
  if (mkdirSync5(dirname13(configPath), { recursive: !0 }), !existsSync7(configPath))
    return writeFileSync3(configPath, `${KIMI_HOOK_BLOCK}
`), { path: configPath, alreadyInstalled: !1 };
  let content = readFileSync9(configPath, "utf-8");
  if (content.includes(KIMI_HOOK_COMMAND))
    return { path: configPath, alreadyInstalled: !0 };
  return writeFileSync3(configPath, appendKimiHook(content)), { path: configPath, alreadyInstalled: !1 };
}
function uninstallKimiCode(homeDir) {
  let configPath = getKimiConfigPath(homeDir);
  if (!existsSync7(configPath))
    return { path: configPath, alreadyInstalled: !1 };
  let content = readFileSync9(configPath, "utf-8");
  if (!content.includes(KIMI_HOOK_COMMAND))
    return { path: configPath, alreadyInstalled: !1 };
  let inlineHooksRange = findTopLevelInlineHooksArray(content), updated = inlineHooksRange ? removeKimiInlineHook(content, inlineHooksRange) : `${removeKimiTableHookBlocks(content)}
`;
  return writeFileSync3(configPath, updated), { path: configPath, alreadyInstalled: !0 };
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
    let result = spawnSync(command2[0], command2.slice(1), {
      encoding: "utf-8",
      stdio: "pipe"
    }), output = [result.stdout, result.stderr].filter(Boolean).join(`
`);
    if (result.error)
      throw Error(formatCommandFailure(command2, null, `${result.error.message}
${output}`.trim()));
    if (result.status !== 0)
      throw Error(formatCommandFailure(command2, result.status, output));
  });
}

// src/bin/hook/install/opencode.ts
import { existsSync as existsSync8, readFileSync as readFileSync10, rmSync, writeFileSync as writeFileSync4 } from "node:fs";
import { join as join19 } from "node:path";
var OPENCODE_PACKAGE = "cc-safety-net", OPENCODE_CACHE_PACKAGE = `${OPENCODE_PACKAGE}@latest`, OPENCODE_CONFIG_FILES = ["opencode.json", "opencode.jsonc"];
function getDefaultOpenCodeConfigPath(homeDir) {
  return join19(homeDir, ".config", "opencode", OPENCODE_CONFIG_FILES[0]);
}
function getOpenCodeConfigPaths(homeDir) {
  return OPENCODE_CONFIG_FILES.map((filename) => join19(homeDir, ".config", "opencode", filename));
}
function getOpenCodeCachePath(homeDir) {
  return join19(homeDir, ".cache", "opencode", "packages", OPENCODE_CACHE_PACKAGE);
}
function clearOpenCodeCache(homeDir) {
  rmSync(getOpenCodeCachePath(homeDir), { recursive: !0, force: !0 });
}
function skipJsonComment(content, index) {
  if (content[index] === "/" && content[index + 1] === "/") {
    let newlineIndex = content.indexOf(`
`, index + 2);
    return newlineIndex === -1 ? content.length : newlineIndex + 1;
  }
  if (content[index] === "/" && content[index + 1] === "*") {
    let closeIndex = content.indexOf("*/", index + 2);
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
    let next = skipJsonComment(content, current);
    if (next === current)
      return current;
    current = next;
  }
  return current;
}
function findJsonStringEnd(content, index) {
  let current = index + 1, isEscaped = !1;
  while (current < content.length) {
    if (isEscaped) {
      isEscaped = !1, current++;
      continue;
    }
    if (content[current] === "\\") {
      isEscaped = !0, current++;
      continue;
    }
    if (content[current] === '"')
      return current + 1;
    current++;
  }
  throw Error("Unterminated string in OpenCode config");
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
  let depth = 0, index = 0;
  while (index < content.length) {
    let next = skipJsonComment(content, index);
    if (next !== index) {
      index = next;
      continue;
    }
    if (content[index] === '"') {
      let end = findJsonStringEnd(content, index);
      if (depth === 1 && readJsonString(content, index, end) === "plugin") {
        let colonIndex = skipJsonTrivia(content, end), arrayStart = skipJsonTrivia(content, colonIndex + 1);
        if (content[colonIndex] === ":" && content[arrayStart] === "[")
          return { start: arrayStart, end: findJsonArrayClose(content, arrayStart) };
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
  let ranges = [], index = pluginArray.start + 1;
  while (index < pluginArray.end) {
    let next = skipJsonComment(content, index);
    if (next !== index) {
      index = next;
      continue;
    }
    if (content[index] === '"') {
      let end = findJsonStringEnd(content, index), value = readJsonString(content, index, end);
      if (typeof value === "string" && value.includes(OPENCODE_PACKAGE))
        ranges.push({ start: index, end });
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
    if (error instanceof SyntaxError)
      throw Error(`Failed to parse OpenCode config ${configPath}: ${error.message}`);
    throw error;
  }
}
function hasManagedPlugin(config) {
  if (!config || typeof config !== "object" || Array.isArray(config))
    return !1;
  let plugins = config.plugin;
  if (!Array.isArray(plugins))
    return !1;
  return plugins.some((plugin) => typeof plugin === "string" && plugin.includes(OPENCODE_PACKAGE));
}
function removeManagedPlugins(content, configPath) {
  let pluginArray = findOpenCodePluginArray(content);
  if (!pluginArray)
    throw Error(`Failed to locate OpenCode plugin array in ${configPath}`);
  let updated = [...findManagedPluginItems(content, pluginArray)].reverse().reduce(removeArrayRangeItem, content);
  return parseOpenCodeConfig(updated, configPath), updated;
}
function uninstallOpenCode(homeDir) {
  clearOpenCodeCache(homeDir);
  let configPaths = getOpenCodeConfigPaths(homeDir), existingConfigPath = configPaths.find((configPath) => existsSync8(configPath)), errors = [];
  for (let configPath of configPaths) {
    if (!existsSync8(configPath))
      continue;
    try {
      let content = readFileSync10(configPath, "utf-8");
      if (!hasManagedPlugin(parseOpenCodeConfig(content, configPath)))
        continue;
      return writeFileSync4(configPath, removeManagedPlugins(content, configPath)), { path: configPath, alreadyInstalled: !0 };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length > 0)
    throw Error(errors.join(`
`));
  return {
    path: existingConfigPath ?? getDefaultOpenCodeConfigPath(homeDir),
    alreadyInstalled: !1
  };
}

// src/bin/hook/install/selection.ts
import { spawn as spawn3, spawnSync as spawnSync2 } from "node:child_process";
import * as readline2 from "node:readline";

// src/bin/hook/install/targets.ts
var INSTALL_TARGETS = installIntegrationMetadata.map((integration) => ({
  target: integration.id,
  flag: integration.flag,
  label: integration.installLabel,
  probeCommand: integration.probeCommand
})), TARGET_FLAGS = new Map(INSTALL_TARGETS.map((target) => [target.flag, target.target]));
function orderInstallTargets(targets) {
  let selectedTargets = new Set(targets);
  return INSTALL_TARGETS.map((target) => target.target).filter((target) => selectedTargets.has(target));
}
function runInstallTargetsInOrder(targets, runTarget) {
  targets.forEach(runTarget);
}

// src/bin/hook/install/selection.ts
var PROBE_TIMEOUT_MS = 2000, ASYNC_PROBE_TIMEOUT_MS = 1000;
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
  return choice?.available === !0;
}
function selectedInChoiceOrder(choices, selected) {
  let selectedTargets = new Set(selected);
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
  let result = spawnSync2(command2[0], command2.slice(1), {
    env: process.env,
    stdio: "ignore",
    timeout: PROBE_TIMEOUT_MS
  });
  return !result.error && result.status === 0;
}
function defaultAsyncInstallTargetProbe(command2) {
  return new Promise((resolve15) => {
    let proc = spawn3(command2[0], command2.slice(1), {
      env: process.env,
      stdio: "ignore"
    }), settled = !1, finish = (available) => {
      if (settled)
        return;
      settled = !0, clearTimeout(timeoutId), resolve15(available);
    }, timeoutId = setTimeout(() => {
      proc.kill(), finish(!1);
    }, ASYNC_PROBE_TIMEOUT_MS);
    proc.on("error", () => finish(!1)), proc.on("close", (code) => finish(code === 0));
  });
}
function buildInstallTargetChoices(probe = defaultInstallTargetProbe, options2 = {}) {
  let configuredTargets = new Set(options2.configuredTargets ?? []);
  if (options2.async)
    return Promise.all(INSTALL_TARGETS.map(async (target) => ({
      target: target.target,
      flag: target.flag,
      label: target.label,
      ...getChoiceAvailability(options2.action, await probe(target.probeCommand), configuredTargets.has(target.target))
    })));
  let syncProbe = probe;
  return INSTALL_TARGETS.map((target) => ({
    target: target.target,
    flag: target.flag,
    label: target.label,
    ...getChoiceAvailability(options2.action, syncProbe(target.probeCommand), configuredTargets.has(target.target))
  }));
}
function buildInstallTargetChoicesAsync(probe = defaultAsyncInstallTargetProbe, options2 = {}) {
  return buildInstallTargetChoices(probe, { ...options2, async: !0 });
}
function applyInstallTargetState(choices, options2) {
  let configuredTargets = new Set(options2.configuredTargets ?? []);
  return choices.map((choice) => ({
    ...choice,
    ...getChoiceAvailability(options2.action, choice.available, configuredTargets.has(choice.target))
  }));
}
function getChoiceAvailability(action, cliAvailable, configured) {
  if (!cliAvailable)
    return { available: !1, unavailableReason: "CLI not installed" };
  if (action === "install" && configured)
    return { available: !1, unavailableReason: "already installed" };
  if (action === "uninstall" && !configured)
    return { available: !1, unavailableReason: "not installed" };
  return { available: !0 };
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
  if (key === "up")
    return { state: { ...state, cursor: nextSelectableCursor(choices, state.cursor, -1) } };
  if (key === "down")
    return { state: { ...state, cursor: nextSelectableCursor(choices, state.cursor, 1) } };
  let choice = choices[state.cursor];
  if (!isAvailable(choice))
    return { state };
  let selected = state.selected.includes(choice.target) ? state.selected.filter((target) => target !== choice.target) : selectedInChoiceOrder(choices, [...state.selected, choice.target]);
  return { state: { ...state, selected } };
}
var CHECKBOX_ON = "◉", CHECKBOX_OFF = "◯", CURSOR_ON = ">", CURSOR_OFF = " ";
function renderInstallSelection(action, choices, state, options2 = {}) {
  let useColor = options2.color !== !1, formatDim = useColor ? colors.dim : (value) => value, formatCheckboxOn = useColor ? colors.green : (value) => value, formatFocus = useColor ? colors.bold : (value) => value;
  return [
    "",
    `${titleCaseAction(action)} CC Safety Net ${targetPreposition(action)}:`,
    "",
    ...choices.map((choice, index) => {
      let selected = state.selected.includes(choice.target), focused = index === state.cursor, marker = selected ? CHECKBOX_ON : CHECKBOX_OFF, cursor = focused ? CURSOR_ON : CURSOR_OFF, suffix = choice.available ? "" : ` (${choice.unavailableReason ?? "not installed"})`, rowBody = `${marker} ${choice.label}${suffix}`, formatted = !choice.available ? formatDim(rowBody) : selected ? formatCheckboxOn(rowBody) : focused ? formatFocus(rowBody) : rowBody;
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
  let input = options2.input ?? process.stdin, output = options2.output ?? process.stdout, state = createInstallSelectionState(choices);
  if (choices.every((choice) => !choice.available))
    return output.write(`${renderInstallSelection(action, choices, state)}
`), output.write(`No selectable integrations found for ${action}.
`), Promise.resolve(null);
  readline2.emitKeypressEvents(input);
  let wasRaw = input.isRaw === !0;
  input.setRawMode(!0), input.resume();
  let renderedLines = 0, clearFrame = () => {
    if (renderedLines === 0)
      return;
    readline2.moveCursor(output, 0, -renderedLines), readline2.cursorTo(output, 0), readline2.clearScreenDown(output);
  }, draw = () => {
    clearFrame();
    let frame = renderInstallSelection(action, choices, state);
    output.write(`${frame}
`), renderedLines = frame.split(`
`).length;
  };
  return new Promise((resolve15) => {
    let cleanup = () => {
      input.off("keypress", onKeyPress), input.setRawMode(wasRaw), input.pause(), clearFrame();
    }, finish = (targets) => {
      if (cleanup(), targets && targets.length > 0)
        output.write(`${activeVerb(action)} selected integrations...
`);
      resolve15(targets);
    };
    function onKeyPress(inputValue, key) {
      let mappedKey = mapKeyPress(inputValue, key);
      if (!mappedKey)
        return;
      let next = reduceInstallSelectionState(state, choices, mappedKey);
      if (state = next.state, next.done === "abort") {
        finish(null);
        return;
      }
      if (next.done === "confirm") {
        if (state.selected.length === 0) {
          output.write("\x07"), draw();
          return;
        }
        finish(state.selected);
        return;
      }
      draw();
    }
    input.on("keypress", onKeyPress), draw();
  });
}

// src/bin/hook/install.ts
var NATIVE_INSTALLS = {
  "claude-code": {
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
    installCommands: [
      ["gemini", "extensions", "install", "https://github.com/kenryu42/gemini-safety-net"]
    ],
    uninstallCommands: [["gemini", "extensions", "uninstall", "gemini-safety-net"]]
  },
  opencode: {
    beforeInstall: clearOpenCodeCache,
    installCommands: [["opencode", "plugin", "-g", "-f", "cc-safety-net@latest"]]
  },
  pi: {
    installCommands: [["pi", "install", "npm:cc-safety-net"]],
    uninstallCommands: [["pi", "uninstall", "npm:cc-safety-net"]]
  }
};
function getHomeDir() {
  return process.env.HOME ?? homedir9();
}
function parseInstallTarget(args, action) {
  let unknownOption = args.find((arg) => arg.startsWith("-") && !TARGET_FLAGS.has(arg));
  if (unknownOption)
    throw Error(`Unknown ${action} option: ${unknownOption}`);
  let unexpectedArg = args.find((arg) => !arg.startsWith("-"));
  if (unexpectedArg)
    throw Error(`Unexpected argument for ${action}: ${unexpectedArg}`);
  let targets = args.flatMap((arg) => {
    let target = TARGET_FLAGS.get(arg);
    return target ? [target] : [];
  });
  if (targets.length !== 1)
    throw Error(`Choose exactly one ${action} target: ${[...TARGET_FLAGS.keys()].join(", ")}`);
  return targets[0];
}
async function settle(promise) {
  try {
    return { ok: !0, value: await promise };
  } catch (error) {
    return { ok: !1, error };
  }
}
function unwrapSettled(result) {
  if (result.ok)
    return result.value;
  throw result.error;
}
async function detectConfiguredInstallTargets() {
  let piRawPromise = defaultVersionFetcher(["pi", "--version"]), copilotBinaryVersionPromise = defaultVersionFetcher(["copilot", "--binary-version"]), copilotFallbackVersionPromise = defaultVersionFetcher(["copilot", "--version"]), piProbePromise = piRawPromise.then((piRaw) => {
    if (!piRaw)
      return { status: "unavailable", installedAndEnabled: !1, matched: [] };
    return defaultPiProbeRunner(process.cwd());
  }), [
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
  if (!options2.selectTargets && !canPromptInstallTargets(options2.input, options2.output))
    return {
      finish: async () => [parseInstallTarget(args, action)]
    };
  let detectConfiguredTargets = options2.detectConfiguredTargets ?? detectConfiguredInstallTargets, configuredTargetsPromise = settle(detectConfiguredTargets()), choicesPromise = settle(buildInstallTargetChoicesAsync(options2.probeTargets)), ready = Promise.all([choicesPromise, configuredTargetsPromise]);
  return {
    ready,
    finish: async () => {
      let [choices, configuredTargets] = await ready, targetChoices = applyInstallTargetState(unwrapSettled(choices), {
        action,
        configuredTargets: unwrapSettled(configuredTargets)
      }), selected = options2.selectTargets ? await options2.selectTargets(action, targetChoices) : await promptInstallTargets(action, targetChoices, {
        input: options2.input,
        output: options2.output
      });
      if (!selected || selected.length === 0)
        return null;
      return orderInstallTargets(selected);
    }
  };
}
function installNativeTarget(target, homeDir) {
  let definition = NATIVE_INSTALLS[target];
  definition.beforeInstall?.(homeDir), runNativeCommands(definition.installCommands), console.log([`Installed ${getIntegrationInstallLabel(target)} integration`, definition.postInstallMessage].filter(Boolean).join(`
`));
}
function uninstallNativeTarget(target) {
  let definition = NATIVE_INSTALLS[target];
  if (!definition.uninstallCommands)
    throw Error(`${getIntegrationInstallLabel(target)} uninstall is not supported`);
  runNativeCommands(definition.uninstallCommands), console.log(`Uninstalled ${getIntegrationInstallLabel(target)} integration`);
}
function uninstallOpenCodeTarget(homeDir) {
  let result = uninstallOpenCode(homeDir);
  console.log(result.alreadyInstalled ? `Uninstalled OpenCode plugin from ${result.path}` : `OpenCode plugin not installed in ${result.path}`);
}
function runConfigInstallTarget(action, target, homeDir) {
  let result = target === "kimi-code" ? action === "install" ? installKimiCode(homeDir) : uninstallKimiCode(homeDir) : action === "install" ? installAntigravityCli(homeDir) : uninstallAntigravityCli(homeDir), name = getIntegrationInstallLabel(target), pastTense = action === "install" ? "Installed" : "Uninstalled";
  console.log(action === "install" && result.alreadyInstalled ? `${name} hook already installed in ${result.path}` : action === "uninstall" && !result.alreadyInstalled ? `${name} hook not installed in ${result.path}` : `${pastTense} ${name} hook ${action === "install" ? "in" : "from"} ${result.path}`);
}
var INSTALL_OPERATIONS = {
  "antigravity-cli": {
    install: (homeDir) => runConfigInstallTarget("install", "antigravity-cli", homeDir),
    uninstall: (homeDir) => runConfigInstallTarget("uninstall", "antigravity-cli", homeDir)
  },
  "claude-code": {
    install: (homeDir) => installNativeTarget("claude-code", homeDir),
    uninstall: () => uninstallNativeTarget("claude-code")
  },
  codex: {
    install: (homeDir) => installNativeTarget("codex", homeDir),
    uninstall: () => uninstallNativeTarget("codex")
  },
  "copilot-cli": {
    install: (homeDir) => installNativeTarget("copilot-cli", homeDir),
    uninstall: () => uninstallNativeTarget("copilot-cli")
  },
  "gemini-cli": {
    install: (homeDir) => installNativeTarget("gemini-cli", homeDir),
    uninstall: () => uninstallNativeTarget("gemini-cli")
  },
  "kimi-code": {
    install: (homeDir) => runConfigInstallTarget("install", "kimi-code", homeDir),
    uninstall: (homeDir) => runConfigInstallTarget("uninstall", "kimi-code", homeDir)
  },
  opencode: {
    install: (homeDir) => installNativeTarget("opencode", homeDir),
    uninstall: (homeDir) => uninstallOpenCodeTarget(homeDir)
  },
  pi: {
    install: (homeDir) => installNativeTarget("pi", homeDir),
    uninstall: () => uninstallNativeTarget("pi")
  }
};
function runSingleInstallTarget(action, target, homeDir) {
  INSTALL_OPERATIONS[target][action](homeDir);
}
async function runInstallCommand(action, args, options2 = {}) {
  try {
    let targets = await resolveAfterOptionalBanner(!0, () => startResolveInstallTargets(action, args, options2), () => printInstallBanner({
      input: options2.input ?? process.stdin,
      output: options2.output ?? process.stdout
    }), {
      loadingMessage: action === "install" ? "Checking available integrations…" : "Checking installed integrations…",
      output: options2.output ?? process.stdout
    });
    if (!targets)
      return 1;
    let homeDir = getHomeDir();
    return runInstallTargetsInOrder(targets, (target) => runSingleInstallTarget(action, target, homeDir)), 0;
  } catch (e) {
    return console.error(formatInstallError(e)), 1;
  }
}
function formatInstallError(error) {
  let message = error instanceof Error ? error.message : String(error), code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  if (code === "EACCES" || code === "EPERM")
    return `${message}
Check file permissions for the target config file and parent directory.`;
  if (code === "ENOENT")
    return `${message}
Check that the target config path and parent directory exist.`;
  if (code === "ENOTDIR")
    return `${message}
Check that every parent path component is a directory.`;
  return message;
}

// src/bin/rule/index.ts
import { join as join22 } from "node:path";

// src/bin/rule/doc.ts
var RULE_DOC = "# Custom Rules Reference\n\nAgent reference for generating CC Safety Net rulebook configuration.\n\n## Config Locations\n\n| Scope | Config path | Rulebook path | Cache path | Priority |\n|-------|-------------|---------------|------------|----------|\n| User | `~/.cc-safety-net/rules/rule.json` | `~/.cc-safety-net/rules/<rulebook-name>/rulebook.json` | `~/.cc-safety-net/cache/rulebooks/` | Lower |\n| Project | `.cc-safety-net/rules/rule.json` | `.cc-safety-net/rules/<rulebook-name>/rulebook.json` | `.cc-safety-net/cache/rulebooks/` | Higher |\n| GitHub source | Listed in a local `rule.json` | `.cc-safety-net/rules/<rulebook-name>/rulebook.json` in the source repository | Consumer local cache | Source order |\n\nUse `cc-safety-net rule init` to create an inert local config. Use `--global` for user scope. Use `cc-safety-net rule init --example` to also create an inactive example rulebook.\n\nLegacy inline `.safety-net.json` and `~/.cc-safety-net/config.json` files are not loaded at runtime. Convert them with `cc-safety-net rule migrate`.\n\n## rule.json Schema\n\n```json\n{\n  \"version\": 1,\n  \"rules\": [\"project-rules\", \"owner/repo#main/team-rules\"],\n  \"overrides\": {\n    \"project-rules/block-docker-system-prune\": {\n      \"reason\": \"Use targeted Docker cleanup commands.\"\n    },\n    \"team-rules/block-npm-global\": \"off\"\n  },\n  \"transparent_wrappers\": [\"rtk\"]\n}\n```\n\n- `version`: Required. Must be `1`.\n- `rules`: Optional array of rulebook source strings. Missing `rules` is treated as `[]`.\n- `overrides`: Optional object keyed by `<rulebook-name>/<rule-name>`.\n- Override values are either `\"off\"` to disable a rule or `{ \"reason\": \"...\" }` to replace the rule reason.\n- Project overrides cannot disable or rewrite user-scoped rules; such configs fail closed.\n- `transparent_wrappers`: Optional array of command names that transparently execute a visible child command.\n- Transparent wrappers have no built-in defaults. Configure only wrappers you intentionally trust, such as `\"rtk\"`.\n- Use `cc-safety-net rule wrapper add rtk` to configure RTK without manually editing `rule.json`.\n\n## Rulebook Sources\n\n- Local sources are bare rulebook names such as `project-rules`; the rulebook file is `.cc-safety-net/rules/project-rules/rulebook.json`.\n- GitHub sources use `owner/repo#ref/<rulebook-name>`.\n- GitHub refs must be one path segment, such as a tag, SHA, or branch name without `/`.\n- Rulebook source names must be unique in a config.\n\n## rulebook.json Schema\n\n```json\n{\n  \"rulebook_version\": 1,\n  \"name\": \"project-rules\",\n  \"version\": \"1.0.0\",\n  \"description\": \"Project-specific CC Safety Net rules.\",\n  \"author\": \"project\",\n  \"allowed_commands\": [\"docker\"],\n  \"rules\": [\n    {\n      \"name\": \"block-docker-system-prune\",\n      \"command\": \"docker\",\n      \"subcommand\": \"system\",\n      \"block_args\": [\"prune\"],\n      \"reason\": \"Use targeted cleanup instead.\"\n    }\n  ],\n  \"tests\": [\n    {\n      \"command\": \"docker system prune\",\n      \"expect\": \"blocked\",\n      \"rule\": \"block-docker-system-prune\"\n    },\n    {\n      \"command\": \"docker ps\",\n      \"expect\": \"allowed\"\n    }\n  ]\n}\n```\n\n### Rulebook Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `rulebook_version` | Yes | Must be `1` |\n| `name` | Yes | `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$` |\n| `version` | Yes | Non-empty string |\n| `description` | No | String |\n| `author` | No | String |\n| `allowed_commands` | Yes | Unique command names matching `^[a-zA-Z][a-zA-Z0-9_-]*$` |\n| `rules` | Yes | Array of rule objects |\n| `tests` | Yes | Array of fixtures |\n\n### Rule Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `name` | Yes | Unique within the rulebook; same pattern as rulebook `name` |\n| `command` | Yes | Must be listed in `allowed_commands`; basename only, not path |\n| `subcommand` | No | Same pattern as `command`; omit to match any subcommand |\n| `block_args` | Yes | Non-empty array of non-empty strings |\n| `reason` | Yes | Non-empty string, max 256 chars |\n\n### Test Fixture Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `command` | Yes | Non-empty shell command string |\n| `expect` | Yes | `\"blocked\"` or `\"allowed\"` |\n| `rule` | Required for blocked fixtures | Rule name expected to block the command |\n\nEvery rule must have at least one blocked fixture. Add allowed fixtures for close-but-safe commands.\n\n## Matching Behavior\n\n- **Command**: Normalized to basename (`/usr/bin/git` → `git`).\n- **Subcommand**: First non-option argument after command.\n- **Arguments**: Matched literally. Command blocked if **any** `block_args` item is present.\n- **Short options**: Expanded (`-Ap` matches `-A`).\n- **Long options**: Exact match (`--all-files` does not match `--all`).\n- **Execution order**: Built-in rules first, then custom rulebooks. Custom rules only add restrictions.\n- **Transparent wrappers**: A configured wrapper such as `rtk` lets `rtk git commit` be analyzed as `git commit` only when `git` is protected by built-in analyzers or active custom rules. `rtk -- git commit` is also supported.\n\n## Workflow\n\n1. Run `cc-safety-net rule init` or create `rule.json` manually.\n2. Optionally run `cc-safety-net rule init --example` to create an inactive example rulebook.\n3. Use `cc-safety-net rule wrapper add rtk` for trusted transparent wrappers.\n4. Run `cc-safety-net rule add <source>` after creating or choosing a rulebook source.\n5. Run `cc-safety-net rule sync` after adding or changing rulebook sources.\n6. Run `cc-safety-net rule verify` to validate config, lock/cache state, local rulebooks, and GitHub source rulebooks.\n7. Run `cc-safety-net rule test` to execute rulebook fixtures.\n8. Run `cc-safety-net rule list` to inspect active rulebooks and transparent wrappers.\n\nInvalid rule config, corrupt cache, invalid local rulebooks, or remote rulebook repair failures fail closed until repaired with `cc-safety-net rule sync`.\n";

// src/bin/rule/format.ts
function printRuleChangeResult(result, action) {
  if (!result.ok) {
    printResultErrors(result);
    return;
  }
  printResultWarnings(result), console.log(action), console.log("Rule config synced."), console.log(""), printActiveRulebookSummary(result.entries);
}
function printActiveRulebookSummary(entries) {
  if (entries.length === 0) {
    console.log("Active rulebooks: (none)");
    return;
  }
  console.log(`Active rulebooks (${entries.length}):`);
  for (let entry of entries)
    console.log(`  - ${entry.name} ${entry.version} (${formatRuleCount(entry.ruleCount ?? 0)})`), console.log(`    Source: ${formatRulebookSource(entry, /* @__PURE__ */ new Map)}`);
}
function formatRuleCount(count) {
  return `${count} ${count === 1 ? "rule" : "rules"}`;
}
function formatRulebookSource(entry, sourceDisplayMap) {
  return sourceDisplayMap.get(entry.spec) ?? getRulebookDisplaySource(entry);
}
function printRulesTestResult(result, sourceDisplayMap = /* @__PURE__ */ new Map) {
  if (!result.ok) {
    printResultErrors(result);
    return;
  }
  printResultWarnings(result), console.log("Rulebook tests passed."), console.log("");
  for (let entry of result.entries)
    console.log(`  ${entry.name} ${entry.version}`), console.log(`    Source: ${formatRulebookSource(entry, sourceDisplayMap)}`), console.log(`    Rules: ${entry.ruleCount ?? 0}`), console.log(`    Tests: ${entry.testCount ?? 0}`);
  if (result.entries.length < 2)
    return;
  console.log(""), console.log(`Tested ${result.entries.length} rulebooks, ${sumStats(result.entries, "ruleCount")} rules, ${sumStats(result.entries, "testCount")} tests.`);
}
function printRulesListReport(policy, sourceDisplayMaps) {
  printListSection("Active sources", policy.rulebooks, (rulebook) => [
    `[${rulebook.source}] ${rulebook.name} ${rulebook.version}`,
    `  Source: ${sourceDisplayMaps[rulebook.source].get(rulebook.spec) ?? rulebook.spec}`
  ]), printListSection("Active rules", policy.rules, (rule) => [
    `[${getRuleSource(policy, rule.name)}] ${rule.name}`,
    `  Command: ${rule.subcommand ? `${rule.command} ${rule.subcommand}` : rule.command}`,
    `  Block args: ${rule.block_args.join(", ")}`,
    `  Reason: ${rule.reason}`
  ]), printListSection("Disabled rules", getMergedOverrides(policy, "off"), (override) => [
    override.key
  ]), printListSection("Reason overrides", getMergedOverrides(policy, "reason"), (override) => [
    override.key,
    `  Reason: ${override.value.reason}`
  ]), printListSection("Transparent wrappers", policy.transparent_wrappers, (wrapper) => [wrapper]), printListSection("Issues", policy.errors, (error) => [error]);
}
function printListSection(title, items, format) {
  if (items.length === 0) {
    console.log(`${title}: (none)`);
    return;
  }
  console.log(`${title} (${items.length}):`);
  for (let item of items) {
    let [firstLine, ...detailLines] = format(item);
    console.log(`  - ${firstLine}`);
    for (let line of detailLines)
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
  for (let error of result.errors)
    console.error(error);
}
function printResultWarnings(result) {
  if (!result.warnings || result.warnings.length === 0)
    return;
  for (let warning of result.warnings)
    console.warn(warning);
}

// src/bin/rule/migrate.ts
import { dirname as dirname14, join as join20 } from "node:path";
var PROJECT_MIGRATED_FROM = ".safety-net.json", USER_MIGRATED_FROM = "~/.cc-safety-net/config.json";
async function runRulesMigrate(options2) {
  return [
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
      syncOptions: { cwd: options2.cwd, global: !0 }
    })
  ].every((result) => result) ? 0 : 1;
}
async function migrateRulesScope(options2) {
  let scope = getScopePaths(options2.syncOptions), legacyTarget = getPolicyFilesystemTargetForPath(scope.filesystemScope, options2.legacyPath), legacyContent = readPolicyFile(legacyTarget);
  if (legacyContent === null)
    return console.log(`No legacy config found at ${options2.legacyPath}`), !0;
  let legacy = readLegacyRulesConfig(legacyContent);
  if (!legacy.ok) {
    for (let error of legacy.errors)
      console.error(error);
    return !1;
  }
  let loaded = readRulesConfig(scope.configTarget);
  if (loaded.errors.length > 0) {
    for (let error of loaded.errors)
      console.error(error);
    return !1;
  }
  let config = loaded.config ?? {
    version: 1,
    rules: [],
    overrides: {},
    transparent_wrappers: []
  }, rulebookName = getMigratedRulebookName(dirname14(options2.configPath), config.rules, options2.defaultRulebookName, options2.migratedFrom, scope.filesystemScope), rulebookPath = join20(dirname14(options2.configPath), rulebookName, "rulebook.json"), rulebookTarget = getPolicyFilesystemTargetForPath(scope.filesystemScope, rulebookPath), snapshots = [
    snapshotFile(scope.configTarget),
    snapshotFile(rulebookTarget),
    snapshotFile(scope.lockTarget)
  ], result = await writeAndSyncMigratedRulebook(options2, scope.configTarget, rulebookTarget, rulebookName, legacy.config.rules, config.rules.includes(rulebookName) ? config.rules : [...config.rules, rulebookName], config.overrides ?? {}, config.transparent_wrappers ?? []);
  if (!result.ok) {
    restoreFiles(snapshots);
    for (let error of result.errors)
      console.error(error);
    return !1;
  }
  if (!options2.cleanup)
    return console.log(`Migrated legacy config at ${options2.legacyPath}. Legacy file is no longer used.`), !0;
  if (!isCleanupVerified(scope.configTarget, rulebookTarget, rulebookName, options2.migratedFrom, legacy.config.rules))
    return console.error(`Migration cleanup verification failed for ${options2.legacyPath}`), !1;
  return removePolicyFile(legacyTarget), console.log(`Deleted legacy config at ${options2.legacyPath}`), !0;
}
async function writeAndSyncMigratedRulebook(options2, configTarget, rulebookTarget, rulebookName, rules, configRules, overrides, transparentWrappers) {
  try {
    return writeJsonAtomic(configTarget, {
      version: 1,
      rules: configRules,
      overrides,
      transparent_wrappers: transparentWrappers
    }), writeJsonAtomic(rulebookTarget, getMigratedRulebook(rulebookName, options2.migratedFrom, rules)), await syncRulesConfig(options2.syncOptions);
  } catch (error) {
    return { ok: !1, errors: [error instanceof Error ? error.message : String(error)] };
  }
}
function readLegacyRulesConfig(content) {
  try {
    let parsed = JSON.parse(content), validation = validateConfig(parsed);
    if (validation.errors.length > 0)
      return { ok: !1, errors: validation.errors };
    return {
      ok: !0,
      config: {
        version: 1,
        rules: parsed.rules ?? []
      }
    };
  } catch {
    return {
      ok: !1,
      errors: ["Invalid JSON"]
    };
  }
}
function getMigratedRulebookName(configDir, sources, defaultRulebookName, migratedFrom, filesystemScope) {
  let existing = sources.find((source) => getMigratedFrom(getPolicyFilesystemTargetForPath(filesystemScope, join20(configDir, source, "rulebook.json"))) === migratedFrom);
  if (existing)
    return existing;
  if (readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, join20(configDir, defaultRulebookName, "rulebook.json"))) === null)
    return defaultRulebookName;
  for (let i = 2;; i++) {
    let name = `${defaultRulebookName}-${i}`;
    if (readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, join20(configDir, name, "rulebook.json"))) === null)
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
function isCleanupVerified(configTarget, rulebookTarget, rulebookName, migratedFrom, legacyRules) {
  if (!readRulesConfig(configTarget).config?.rules.includes(rulebookName))
    return !1;
  try {
    let content = readPolicyFile(rulebookTarget);
    if (content === null)
      return !1;
    let rulebook = JSON.parse(content);
    return rulebook.migrated_from === migratedFrom && JSON.stringify(rulebook.rules) === JSON.stringify(legacyRules);
  } catch {
    return !1;
  }
}
function snapshotFile(target) {
  return { target, content: readPolicyFile(target) };
}
function restoreFiles(snapshots) {
  for (let snapshot of snapshots) {
    if (snapshot.content === null) {
      removePolicyFile(snapshot.target);
      continue;
    }
    writePolicyFileAtomic(snapshot.target, snapshot.content);
  }
}
function getMigratedFrom(target) {
  let content = readPolicyFile(target);
  if (content === null)
    return null;
  try {
    let rulebook = JSON.parse(content);
    return typeof rulebook.migrated_from === "string" ? rulebook.migrated_from : null;
  } catch {
    return null;
  }
}

// src/bin/rule/verify.ts
import { dirname as dirname15, join as join21, resolve as resolve15 } from "node:path";
var VERIFY_HEADER = "CC Safety Net Config", VERIFY_SEPARATOR = "═".repeat(VERIFY_HEADER.length), RULES_SCHEMA_URL = "https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json", RULES_DIR_RESERVED_ENTRIES = /* @__PURE__ */ new Set(["rule.json", "rule.lock", "cache"]);
function runRulesVerify(options2 = {}) {
  try {
    return runRulesVerifyInternal(options2);
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      return console.error(error.message), 1;
    throw error;
  }
}
function runRulesVerifyInternal(options2) {
  let cwd = options2.cwd ?? process.cwd(), userConfig = options2.userConfigPath ?? getUserRulesConfigPath(), projectConfig = options2.projectConfigPath ?? getProjectRulesConfigPath(cwd), legacyUserConfig = options2.legacyUserConfigPath ?? getLegacyUserRulesConfigPath(), legacyProjectConfig = options2.legacyProjectConfigPath ?? getLegacyProjectConfigPath(cwd), githubSourceRulesDir = resolve15(cwd, RULES_DIR), userConfigDir = dirname15(userConfig), paths = getPolicyPaths({
    cwd,
    userConfigPath: userConfig,
    projectConfigPath: projectConfig
  }), defaultPaths = getPolicyPaths({ cwd }), userConfigTarget = getPolicyFilesystemTargetForPath(paths.userScope, userConfig), projectConfigTarget = getPolicyFilesystemTargetForPath(paths.projectScope, projectConfig), legacyUserTarget = options2.legacyUserConfigPath ? bindDelegatedPolicyFilesystemTarget(options2.legacyUserConfigPath, "user policy") : getPolicyFilesystemTargetForPath(defaultPaths.userScope, legacyUserConfig), legacyProjectTarget = options2.legacyProjectConfigPath ? bindDelegatedPolicyFilesystemTarget(options2.legacyProjectConfigPath, "project policy") : getPolicyFilesystemTargetForPath(defaultPaths.projectScope, legacyProjectConfig), hasErrors = !1, hasWarnings = !1, configsChecked = [], warnings = [], githubSourceRules = getGitHubSourceRulesValidation(getPolicyFilesystemTargetForPath(defaultPaths.projectScope, githubSourceRulesDir));
  if (printRulesVerifyHeader(), readPolicyFile(userConfigTarget) !== null) {
    let result = validateRulesConfigFile(userConfigTarget);
    if (result.errors.push(...getRulesConfigRuntimeErrorsForConfig(userConfig, getUserRulesLockPath({ userConfigDir }), { userConfigDir }, paths.userScope)), configsChecked.push({
      scope: "User",
      path: userConfig,
      result,
      schema: "rules",
      sourceDisplayMap: getRulesConfigSourceDisplayMap(userConfig, paths.userScope),
      target: userConfigTarget
    }), result.errors.length > 0)
      hasErrors = !0;
  }
  if (readPolicyFile(legacyUserTarget) !== null)
    if (hasWarnings = !0, readPolicyFile(userConfigTarget) !== null)
      warnings.push(getLegacyRulesConfigWarning("user", "cleanup"));
    else {
      let result = validateConfigFile(legacyUserTarget);
      if (configsChecked.push({
        scope: "User",
        path: legacyUserConfig,
        result,
        schema: "legacy",
        sourceDisplayMap: /* @__PURE__ */ new Map,
        inactive: !0,
        target: legacyUserTarget
      }), warnings.push(getLegacyRulesConfigWarning("user", result.errors.length > 0 ? "fix-or-delete" : "migrate")), result.errors.length > 0)
        hasErrors = !0;
    }
  if (readPolicyFile(projectConfigTarget) !== null) {
    let result = validateRulesConfigFile(projectConfigTarget);
    if (result.errors.push(...getRulesConfigRuntimeErrorsForConfig(projectConfig, getRulesLockPathForConfigPath(projectConfig), {
      userConfigDir
    }, paths.projectScope)), configsChecked.push({
      scope: "Project",
      path: resolve15(projectConfig),
      result,
      schema: "rules",
      sourceDisplayMap: getRulesConfigSourceDisplayMap(projectConfig, paths.projectScope),
      target: projectConfigTarget
    }), result.errors.length > 0)
      hasErrors = !0;
    if (readPolicyFile(legacyProjectTarget) !== null)
      hasWarnings = !0, warnings.push(getLegacyRulesConfigWarning("project", "cleanup"));
  } else if (readPolicyFile(legacyProjectTarget) !== null) {
    hasWarnings = !0, hasErrors = !0;
    let result = validateConfigFile(legacyProjectTarget);
    configsChecked.push({
      scope: "Project",
      path: resolve15(legacyProjectConfig),
      result,
      schema: "legacy",
      sourceDisplayMap: /* @__PURE__ */ new Map,
      inactive: !0,
      target: legacyProjectTarget
    }), warnings.push(getLegacyRulesConfigWarning("project", result.errors.length > 0 ? "fix-or-delete" : "migrate"));
  }
  if (githubSourceRules?.result.errors.length)
    hasErrors = !0;
  if (configsChecked.length === 0 && !githubSourceRules)
    return console.log(`
No config files found. Using built-in rules only.`), 0;
  for (let config of configsChecked)
    if (config.inactive)
      printInactiveLegacyRulesConfig(config.scope, config.path, config.result, config.sourceDisplayMap);
    else if (config.result.errors.length > 0)
      printInvalidRulesConfig(config.scope, config.path, config.result.errors);
    else {
      if (config.schema === "rules" && addRulesSchemaIfMissing(config.target))
        console.log(`
Added $schema to ${config.scope.toLowerCase()} config.`);
      printValidRulesConfig(config.scope, config.path, config.result, config.schema, config.sourceDisplayMap);
    }
  for (let warning of warnings)
    console.error(`
${colors.red(warning)}`);
  if (githubSourceRules)
    if (githubSourceRules.result.errors.length > 0)
      printInvalidGitHubSourceRules(githubSourceRules.path, githubSourceRules.result.errors);
    else
      printValidGitHubSourceRules(githubSourceRules.path, githubSourceRules.result);
  if (hasErrors)
    return console.error(`
Config validation failed.`), 1;
  return console.log(hasWarnings ? `
Configs valid with warnings.` : `
All configs valid.`), 0;
}
function getLegacyRulesConfigWarning(scope, action) {
  let label = `legacy ${scope} config`;
  if (action === "cleanup")
    return `Warning: Legacy ${scope} config is no longer needed. Run \`npx -y cc-safety-net rule migrate --cleanup\` to clean it up safely.`;
  if (action === "migrate")
    return `Warning: Legacy ${scope} config is ignored by CC Safety Net. Run \`npx -y cc-safety-net rule migrate\`.`;
  return `Warning: Legacy ${scope} config is no longer supported. Fix or delete the ${label}, then run \`npx -y cc-safety-net rule migrate\`.`;
}
function getGitHubSourceRulesValidation(target) {
  if (readPolicyDirectoryEntries(target) === null)
    return null;
  let result = validateGitHubSourceRules(target);
  if (result.ruleNames.size === 0 && result.errors.length === 0)
    return null;
  return { path: target.path, result };
}
function validateGitHubSourceRules(target) {
  let errors = [], ruleNames = /* @__PURE__ */ new Set, entries = (readPolicyDirectoryEntries(target) ?? []).filter((entry) => !RULES_DIR_RESERVED_ENTRIES.has(entry.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0)
    return { errors, ruleNames };
  for (let entry of entries) {
    if (!NAME_PATTERN.test(entry.name)) {
      errors.push(`rulebook directory names must match ${NAME_PATTERN}: ${entry.name}`);
      continue;
    }
    if (entry.kind !== "directory") {
      errors.push(`${entry.name} must be a rulebook directory`);
      continue;
    }
    let rulebookTarget = getPolicyFilesystemTargetForPath(target.scope, join21(target.path, entry.name, "rulebook.json")), content = readPolicyFile(rulebookTarget);
    if (content === null) {
      errors.push(`${entry.name}/rulebook.json is required`);
      continue;
    }
    try {
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        errors.push(`${entry.name}/rulebook.json: invalid JSON`);
        continue;
      }
      let rulebook = assertValidRulebook(parsed);
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
  console.log(VERIFY_HEADER), console.log(VERIFY_SEPARATOR);
}
function printValidRulesConfig(scope, path, result, schema, sourceDisplayMap) {
  if (console.log(`
✓ ${scope} config: ${path}`), console.log(`  Schema: ${schema === "rules" ? "rulebook sources" : "legacy inline rules"}`), result.ruleNames.size > 0) {
    console.log(`  ${schema === "rules" ? "Sources" : "Rules"}:`);
    let i = 1;
    for (let name of result.ruleNames)
      console.log(`    ${i}. ${sourceDisplayMap.get(name) ?? name}`), i++;
  } else
    console.log(`  ${schema === "rules" ? "Sources" : "Rules"}: (none)`);
}
function printInactiveLegacyRulesConfig(scope, path, result, sourceDisplayMap) {
  if (console.error(`
✗ Legacy ${scope.toLowerCase()} config: ${path}`), console.error("  Schema: legacy inline rules"), console.error("  Status: ignored by CC Safety Net"), result.errors.length > 0) {
    console.error("  Errors:");
    let errorNum = 1;
    for (let error of result.errors)
      for (let part of error.split("; "))
        console.error(`    ${errorNum}. ${part}`), errorNum++;
    return;
  }
  if (result.ruleNames.size > 0) {
    console.error("  Rules:");
    let i = 1;
    for (let name of result.ruleNames)
      console.error(`    ${i}. ${sourceDisplayMap.get(name) ?? name}`), i++;
    return;
  }
  console.error("  Rules: (none)");
}
function printInvalidRulesConfig(scope, path, errors) {
  printInvalidVerifyTarget(`${scope} config`, path, errors);
}
function printValidGitHubSourceRules(path, result) {
  console.log(`
✓ GitHub source rules: ${path}`), console.log("  Rulebooks:");
  let i = 1;
  for (let name of result.ruleNames)
    console.log(`    ${i}. ${name}`), i++;
}
function printInvalidGitHubSourceRules(path, errors) {
  printInvalidVerifyTarget("GitHub source rules", path, errors);
}
function printInvalidVerifyTarget(label, path, errors) {
  console.error(`
✗ ${label}: ${path}`), console.error("  Errors:");
  let errorNum = 1;
  for (let error of errors)
    for (let part of error.split("; "))
      console.error(`    ${errorNum}. ${part}`), errorNum++;
}
function addRulesSchemaIfMissing(target) {
  try {
    let content = readPolicyFile(target);
    if (content === null)
      return !1;
    let parsed = JSON.parse(content);
    if (parsed.$schema)
      return !1;
    return writePolicyFileAtomic(target, JSON.stringify({ $schema: RULES_SCHEMA_URL, ...parsed }, null, 2)), !0;
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      throw error;
    return !1;
  }
}

// src/bin/rule/index.ts
var RULE_SUBCOMMANDS = /* @__PURE__ */ new Set([
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
]), RULE_WRAPPER_ACTIONS = /* @__PURE__ */ new Set(["add", "remove", "list"]);
async function runRuleCommand(args) {
  try {
    return await runRuleCommandInternal(args);
  } catch (error) {
    if (error instanceof PolicyFilesystemError)
      return console.error(error.message), 1;
    throw error;
  }
}
async function runRuleCommandInternal(args) {
  let flags = parseRuleFlags(args);
  if (flags.errors.length > 0) {
    for (let error of flags.errors)
      console.error(error);
    return 1;
  }
  let subcommand = flags.positionals[0];
  if (flags.help)
    return printCommandHelp(ruleCommand), 0;
  if (!subcommand)
    return printCommandHelp(ruleCommand), 1;
  let value = flags.positionals[1], options2 = { global: flags.global, check: flags.check };
  if (subcommand === "init") {
    let scope = getScopePaths(options2), dir = scope.configDir;
    ensureRulesConfig(scope.configTarget), ensurePolicyDirectory(getPolicyFilesystemTargetForPath(scope.filesystemScope, getRulebookCacheRoot({ ...options2, cacheConfigDir: dir })));
    let rulebookPath = join22(dir, "example-rules", "rulebook.json"), rulebookTarget = getPolicyFilesystemTargetForPath(scope.filesystemScope, rulebookPath);
    if (flags.example && readPolicyFile(rulebookTarget) === null)
      writeStarterRulebook(rulebookTarget, "example-rules");
    let result = await syncRulesConfig(options2);
    return printRuleChangeResult(result, "Rule config initialized."), result.ok ? 0 : 1;
  }
  if (subcommand === "add") {
    if (!value)
      return console.error("rule add requires a source"), 1;
    let result = await addRulebookSource(value, options2);
    return printRuleChangeResult(result, `Added rulebook source: ${value}`), result.ok ? 0 : 1;
  }
  if (subcommand === "remove") {
    if (!value)
      return console.error("rule remove requires a source"), 1;
    let result = await removeRulebookSource(value, {
      ...options2,
      deleteSource: flags.deleteSource
    });
    return printRuleChangeResult(result, `Removed rulebook source: ${value}`), result.ok ? 0 : 1;
  }
  if (subcommand === "update" || subcommand === "sync") {
    let result = await syncRulesConfig({
      ...options2,
      only: subcommand === "update" ? value : void 0
    });
    return printRuleChangeResult(result, flags.check ? "Rule config checked." : "Rule config synced."), result.ok ? 0 : 1;
  }
  if (subcommand === "list") {
    let policy = loadRulesPolicy(), paths = getPolicyPaths({});
    return printRulesListReport(policy, {
      user: getRulesConfigSourceDisplayMap(policy.userConfigPath, paths.userScope),
      project: getRulesConfigSourceDisplayMap(policy.projectConfigPath, paths.projectScope)
    }), policy.errors.length > 0 ? 1 : 0;
  }
  if (subcommand === "wrapper")
    return runRuleWrapperCommand(flags);
  if (subcommand === "test") {
    let result = await testRulebookSources(value ? [value] : [], options2);
    return printRulesTestResult(result), result.ok ? 0 : 1;
  }
  if (subcommand === "migrate")
    return runRulesMigrate({ cleanup: flags.cleanup, cwd: process.cwd() });
  if (subcommand === "doc")
    return console.log(RULE_DOC), 0;
  if (subcommand === "verify")
    return runRulesVerify();
  return 1;
}
function parseRuleFlags(args) {
  let flags = {
    global: !1,
    check: !1,
    cleanup: !1,
    deleteSource: !1,
    example: !1,
    help: !1,
    positionals: [],
    errors: []
  };
  for (let arg of args)
    if (arg === "-g" || arg === "--global")
      flags.global = !0;
    else if (arg === "--check")
      flags.check = !0;
    else if (arg === "--delete-source")
      flags.deleteSource = !0;
    else if (arg === "--cleanup")
      flags.cleanup = !0;
    else if (arg === "--example")
      flags.example = !0;
    else if (arg === "-h" || arg === "--help")
      flags.help = !0;
    else if (arg.startsWith("-"))
      flags.errors.push(unknownRuleOption(flags.positionals[0], arg));
    else
      flags.positionals.push(arg);
  return validateRuleFlags(flags), flags;
}
function validateRuleFlags(flags) {
  let [subcommand] = flags.positionals;
  if (subcommand && !RULE_SUBCOMMANDS.has(subcommand))
    flags.errors.push(`Unknown rule subcommand: ${subcommand}`);
  if (flags.deleteSource && subcommand !== "remove")
    if (subcommand && RULE_SUBCOMMANDS.has(subcommand))
      flags.errors.push(`Unknown option for rule ${subcommand}: --delete-source`);
    else
      flags.errors.push("--delete-source is only valid with 'rule remove'");
  if (flags.cleanup && subcommand !== "migrate")
    flags.errors.push(unknownRuleOption(subcommand, "--cleanup"));
  if (flags.example && subcommand !== "init")
    flags.errors.push(unknownRuleOption(subcommand, "--example"));
  if (subcommand === "migrate") {
    if (flags.global)
      flags.errors.push("Unknown option for rule migrate: --global");
    if (flags.check)
      flags.errors.push("Unknown option for rule migrate: --check");
    if (flags.positionals.length > 1)
      flags.errors.push(`Unexpected rule migrate argument: ${flags.positionals[1]}`);
  } else if (subcommand === "wrapper")
    validateRuleWrapperFlags(flags);
  else if (flags.positionals.length > 2)
    flags.errors.push(`Unexpected rule argument: ${flags.positionals[2]}`);
  if (subcommand === "list" && flags.global)
    flags.errors.push("Unknown option for rule list: --global");
}
function unknownRuleOption(subcommand, option) {
  if (subcommand === "migrate")
    return `Unknown option for rule migrate: ${option}`;
  return `Unknown rule option: ${option}`;
}
function validateRuleWrapperFlags(flags) {
  let action = flags.positionals[1], command2 = flags.positionals[2];
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
  if (flags.positionals.length > 3)
    flags.errors.push(`Unexpected rule wrapper argument: ${flags.positionals[3]}`);
}
function ensureRulesConfig(configPath) {
  if (readPolicyFile(configPath) === null) {
    writeDefaultRulesConfig(configPath);
    return;
  }
  let loaded = readRulesConfig(configPath);
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
  let action = flags.positionals[1], command2 = flags.positionals[2], configPath = getScopePaths({ global: flags.global }).configTarget;
  if (action === "list") {
    let loaded2 = readRulesConfig(configPath);
    if (loaded2.errors.length > 0) {
      for (let error of loaded2.errors)
        console.error(error);
      return 1;
    }
    return printTransparentWrappers(loaded2.config?.transparent_wrappers ?? []), 0;
  }
  if (!command2 || !COMMAND_PATTERN.test(command2))
    return console.error("transparent wrapper must match command pattern"), 1;
  if (isReservedTransparentWrapper(command2))
    return console.error(`reserved command "${command2}" cannot be a wrapper`), 1;
  let loaded = readRulesConfig(configPath);
  if (loaded.errors.length > 0) {
    for (let error of loaded.errors)
      console.error(error);
    return 1;
  }
  let config = loaded.config ?? {
    version: 1,
    rules: [],
    overrides: {},
    transparent_wrappers: []
  }, wrappers2 = action === "add" ? [.../* @__PURE__ */ new Set([...config.transparent_wrappers ?? [], command2])] : (config.transparent_wrappers ?? []).filter((wrapper) => wrapper !== command2);
  return writeJsonAtomic(configPath, {
    version: 1,
    rules: config.rules,
    overrides: config.overrides ?? {},
    transparent_wrappers: wrappers2
  }), console.log(action === "add" ? `Added transparent wrapper: ${command2}` : `Removed transparent wrapper: ${command2}`), 0;
}
function printTransparentWrappers(wrappers2) {
  if (wrappers2.length === 0) {
    console.log("Transparent wrappers: (none)");
    return;
  }
  console.log(`Transparent wrappers (${wrappers2.length}):`);
  for (let wrapper of wrappers2)
    console.log(`  - ${wrapper}`);
}

// src/bin/statusline.ts
import { existsSync as existsSync9, readFileSync as readFileSync11 } from "node:fs";
import { homedir as homedir10 } from "node:os";
import { join as join23 } from "node:path";
async function readStdinAsync() {
  if (process.stdin.isTTY)
    return null;
  return new Promise((resolve16) => {
    let data = "";
    process.stdin.setEncoding("utf-8"), process.stdin.on("data", (chunk) => {
      data += chunk;
    }), process.stdin.on("end", () => {
      let trimmed = data.trim();
      resolve16(trimmed || null);
    }), process.stdin.on("error", () => {
      resolve16(null);
    });
  });
}
function getSettingsPath() {
  if (process.env.CLAUDE_SETTINGS_PATH)
    return process.env.CLAUDE_SETTINGS_PATH;
  return join23(homedir10(), ".claude", "settings.json");
}
function isPluginEnabled() {
  let settingsPath = getSettingsPath();
  if (!existsSync9(settingsPath))
    return !1;
  try {
    let content = readFileSync11(settingsPath, "utf-8"), settings = JSON.parse(content);
    if (!settings.enabledPlugins)
      return !1;
    let pluginKey = "safety-net@cc-marketplace";
    if (!(pluginKey in settings.enabledPlugins))
      return !1;
    return settings.enabledPlugins[pluginKey] === !0;
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug))
      console.error(`CC Safety Net debug: failed to read Claude settings: ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
    return !1;
  }
}
async function printStatusline() {
  let enabled = isPluginEnabled(), status;
  if (!enabled)
    status = "\uD83D\uDEE1️ CC Safety Net ❌";
  else {
    let policy = loadPolicySnapshot({ cwd: process.cwd() }).policy, modes = getCCSafetyNetEnvModes(policy), hasEffectiveRuleCustomization = Object.values(resolveEffectiveDestructiveCommandRules(policy, modes.capabilities)).some((rule) => rule.changesInherited), levelEmoji = {
      standard: "✅",
      strict: "\uD83D\uDD12",
      paranoid: "\uD83D\uDC41️",
      custom: "\uD83D\uDD27"
    }[hasEffectiveRuleCustomization ? "custom" : modes.effectiveLevel];
    if (modes.worktreeMode)
      status = `\uD83D\uDEE1️ CC Safety Net ${levelEmoji}\uD83C\uDF33`;
    else
      status = `\uD83D\uDEE1️ CC Safety Net ${levelEmoji}`;
  }
  let stdinInput = await readStdinAsync();
  if (stdinInput && !stdinInput.startsWith("{"))
    console.log(`${stdinInput} | ${status}`);
  else
    console.log(status);
}

// src/bin/cc-safety-net.ts
function hasHelpFlag(args) {
  return args.includes("--help") || args.includes("-h");
}
function handleHelpCommand(args) {
  if (args[0] !== "help")
    return !1;
  let commandName = args[1];
  if (!commandName)
    printHelp(), process.exit(0);
  if (showCommandHelp(commandName))
    process.exit(0);
  console.error(`Unknown command: ${commandName}`), console.error("Run 'cc-safety-net --help' for available commands."), process.exit(1);
}
function handleCommandHelp(args) {
  if (!hasHelpFlag(args))
    return !1;
  let commandName = args[0];
  if (!commandName || commandName.startsWith("-"))
    return !1;
  if (findCommand(commandName))
    showCommandHelp(commandName), process.exit(0);
  return !1;
}
var commandParsers = {
  explain: (args) => ({ mode: "explain", args }),
  rule: (args) => ({ mode: "rule", args }),
  statusline: (args) => {
    if (args.includes("--claude-code") || args.includes("-cc"))
      return { mode: "statusline" };
    console.error("statusline requires --claude-code (-cc)"), showCommandHelp("statusline"), process.exit(1);
  },
  hook: (args) => {
    let integration = findHookIntegrationByFlag(args);
    if (integration)
      return { mode: "hook", integration };
    console.error("hook requires an integration flag. Try: cc-safety-net hook --kimi-code"), showCommandHelp("hook"), process.exit(1);
  },
  install: (args) => ({ mode: "install", args }),
  uninstall: (args) => ({ mode: "uninstall", args }),
  doctor: (args) => ({ mode: "doctor", args }),
  logs: (args) => ({ mode: "logs", args }),
  gui: (args) => ({ mode: "gui", args })
};
function parseCliArgs(args) {
  if (handleHelpCommand(args))
    return null;
  if (handleCommandHelp(args))
    return null;
  if (args.length === 0 || hasHelpFlag(args))
    printHelp(), process.exit(0);
  if (args.includes("--version") || args.includes("-V"))
    printVersion(), process.exit(0);
  let commandName = args[0];
  if (!commandName)
    printHelp(), process.exit(0);
  let command2 = findCommand(commandName);
  if (command2)
    return commandParsers[command2.name](args.slice(1));
  let legacyIntegration = findLegacyTopLevelHookIntegration(commandName);
  if (legacyIntegration)
    return { mode: "hook", integration: legacyIntegration };
  if (commandName === "--statusline")
    return { mode: "statusline" };
  console.error(`Unknown option: ${commandName}`), console.error("Run 'cc-safety-net --help' for usage."), process.exit(1);
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
    let flags = parseDoctorFlags(command2.args), exitCode = await runDoctor({
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
    if (hasHelpFlag(command2.args) || command2.args.length === 0)
      showCommandHelp("explain"), process.exit(0);
    let flags = parseExplainFlags(command2.args);
    if (!flags)
      process.exit(1);
    let result = explainCommand2(flags.command, { cwd: flags.cwd }), asciiOnly = !!process.env.NO_COLOR || !process.stdout.isTTY;
    if (flags.json)
      console.log(formatTraceJson(result));
    else
      console.log(formatTraceHuman(result, { asciiOnly }));
    process.exit(0);
  }
};
function assertNever(command2) {
  throw Error(`Unhandled command mode: ${JSON.stringify(command2)}`);
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
  let command2 = parseCliArgs(process.argv.slice(2));
  if (command2)
    await runParsedCommand(command2);
}
main().catch((error) => {
  console.error("CC Safety Net error:", error), process.exit(1);
});
