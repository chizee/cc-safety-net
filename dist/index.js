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
        if (s.op === "glob") {
          if (typeof s.pattern !== "string")
            throw TypeError("glob token requires a string `pattern`");
          if (LINE_TERMINATORS.test(s.pattern))
            throw TypeError("glob `pattern` must not contain line terminators");
          return s.pattern.replace(GLOB_SHELL_SPECIAL, "\\$&");
        }
        if (typeof s.op === "string") {
          if (OPS.indexOf(s.op) < 0)
            throw TypeError("invalid `op` value: " + JSON.stringify(s.op));
          return s.op.replace(/[\s\S]/g, "\\$&");
        }
        if (typeof s.comment === "string") {
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
  ].join("|") + ")", controlRE = new RegExp("^" + CONTROL + "$"), META = "|&;()<> \\t", SINGLE_QUOTE = '"((\\\\"|[^"])*?)"', DOUBLE_QUOTE = "'((\\\\'|[^'])*?)'", hash = /^#$/, SQ = "'", DQ = '"', DS = "$", TOKEN = "", mult = 4294967296;
  for (i = 0;i < 4; i++)
    TOKEN += (mult * Math.random()).toString(16);
  var i, startsWithToken = new RegExp("^" + TOKEN);
  function matchAll(s, r) {
    var origIndex = r.lastIndex, matches = [], matchObj;
    while (matchObj = r.exec(s))
      if (matches.push(matchObj), r.lastIndex === matchObj.index)
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
    var BS = opts.escape || "\\", BAREWORD = "(\\" + BS + `['"` + META + `]|[^\\s'"` + META + "])+", chunker = new RegExp([
      "(" + CONTROL + ")",
      "(" + BAREWORD + "|" + SINGLE_QUOTE + "|" + DOUBLE_QUOTE + ")+"
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
      var quote = !1, esc = !1, out = "", isGlob = !1, i2;
      function parseEnvVar() {
        i2 += 1;
        var varend, varname, char = s.charAt(i2);
        if (char === "{") {
          if (i2 += 1, s.charAt(i2) === "}")
            throw Error("Bad substitution: " + s.slice(i2 - 2, i2 + 1));
          if (varend = s.indexOf("}", i2), varend < 0)
            throw Error("Bad substitution: " + s.slice(i2));
          varname = s.slice(i2, varend), i2 = varend;
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
      for (i2 = 0;i2 < s.length; i2++) {
        var c = s.charAt(i2);
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
          quote = c;
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
        else if (c === DS)
          out += parseEnvVar();
        else
          out += c;
      }
      if (isGlob)
        return { op: "glob", pattern: out };
      return out;
    }).reduce(function(prev, arg) {
      return typeof arg > "u" ? prev : prev.concat(arg);
    }, []);
  }
  module.exports = function(s, env, opts) {
    var mapped = parseInternal(s, env, opts);
    if (typeof env !== "function")
      return mapped;
    return mapped.reduce(function(acc, s2) {
      if (typeof s2 === "object")
        return acc.concat(s2);
      var xs = s2.split(RegExp("(" + TOKEN + ".*?" + TOKEN + ")", "g"));
      if (xs.length === 1)
        return acc.concat(xs[0]);
      return acc.concat(xs.filter(Boolean).map(function(x) {
        if (startsWithToken.test(x))
          return JSON.parse(x.split(TOKEN)[1]);
        return x;
      }));
    }, []);
  };
});

// src/opencode/plugin.ts
import { accessSync, constants, statSync as statSync2 } from "node:fs";
import { resolve as resolve8 } from "node:path";

// src/core/tool-input.ts
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
]), GREP_TOOL_NAMES = /* @__PURE__ */ new Set(["grep", "grepsearch", "rg"]), GLOB_TOOL_NAMES = /* @__PURE__ */ new Set(["findbyname", "glob"]), PATCH_TEXT_KEYS = /* @__PURE__ */ new Set(["command", "diff", "input", "patch", "patchtext"]), UTF8_ENCODER = /* @__PURE__ */ new TextEncoder, UTF8_DECODER = /* @__PURE__ */ new TextDecoder;
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
  let command = input.command;
  return typeof command === "string" && command !== "" ? command : void 0;
}
function extractPathLikeToolValues(input, pathLikeKeys) {
  if (!input || typeof input !== "object")
    return [];
  if (Array.isArray(input))
    return input.flatMap((value) => extractPathLikeToolValues(value, pathLikeKeys));
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
  return extractPatchTexts(input, !0).flatMap(extractPatchTargetsFromText);
}
function extractPatchTexts(input, allowString) {
  if (typeof input === "string")
    return allowString ? [input] : [];
  if (!input || typeof input !== "object")
    return [];
  if (Array.isArray(input))
    return input.flatMap((value) => extractPatchTexts(value, allowString));
  return Object.entries(input).flatMap(([key, value]) => {
    if (PATCH_TEXT_KEYS.has(normalizeToolInputKey(key)))
      return extractPatchTexts(value, !0);
    if (value && typeof value === "object")
      return extractPatchTexts(value, !1);
    return [];
  });
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
  let matchingPair = [...header.matchAll(/\s+/g)].map((separator) => [
    header.slice(0, separator.index).trim(),
    header.slice((separator.index ?? 0) + separator[0].length).trim()
  ]).find(([oldTarget, newTarget]) => oldTarget === newTarget || getCommonGitPrefixRemainder(oldTarget, newTarget) !== null);
  return matchingPair?.[0] && matchingPair[1] ? cleanGitTargetPair(matchingPair[0], matchingPair[1]) : [];
}
function parseGitDiffFields(header) {
  let fields = [], index = 0;
  while (index < header.length) {
    while (/\s/.test(header[index] ?? ""))
      index++;
    if (index >= header.length)
      break;
    let quote = header[index] === '"' || header[index] === "'" ? header[index] : void 0;
    if (!quote) {
      let end = header.slice(index).search(/\s/);
      fields.push(end === -1 ? header.slice(index) : header.slice(index, index + end)), index = end === -1 ? header.length : index + end;
      continue;
    }
    let field = parseQuotedGitDiffField(header, index, quote);
    if (!field)
      return [];
    fields.push(field.value), index = field.end;
  }
  return fields;
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

// src/config/policy-metadata.ts
var metadata = /* @__PURE__ */ new WeakMap;
function registerPolicyRuleMetadata(snapshot, rules) {
  return metadata.set(snapshot, new Map(rules)), snapshot;
}
function getPolicyRuleMetadata(snapshot, id) {
  return id ? metadata.get(snapshot)?.get(id) : void 0;
}

// src/core/policy.ts
import { chmodSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname4, join as join2 } from "node:path";

// src/config/schema.ts
import { createRequire } from "node:module";

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
  "shell.dynamic-structure",
  "shell.dynamic-executable",
  "raw-text.dangerous-command"
], DESTRUCTIVE_COMMAND_RULE_ID_SET = new Set(DESTRUCTIVE_COMMAND_RULE_IDS), DESTRUCTIVE_COMMAND_RULE_METADATA = [
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
    id: "shell.dynamic-structure",
    category: "Execution",
    label: "Dynamic command structure",
    description: "Blocks guarded subcommands and options assembled from substitution output.",
    intent: "stop_and_explain"
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
  return policy?.disabledDestructiveCommandRules.includes(match.id) ? null : match;
}

// src/core/analyze/awk.ts
var AWK_INTERPRETERS = /* @__PURE__ */ new Set(["awk", "gawk", "nawk", "mawk"]), REASON_AWK_SYSTEM_DYNAMIC = "Detected awk system(), pipe, or getline command with dynamic command that cannot be safely analyzed. Use a literal command or process the data without system(), pipes, or getline.";
function analyzeAwkSystemCallMatch(tokens, analyzeNested) {
  for (let token of tokens.slice(1)) {
    let commands = extractAwkExternalCommands(token);
    if (!commands)
      continue;
    if (commands.dynamic)
      return destructiveCommandMatch("awk.system-dynamic", REASON_AWK_SYSTEM_DYNAMIC);
    for (let command of commands.commands) {
      let result = analyzeNested(command);
      if (result)
        return result;
    }
  }
  return null;
}
function extractAwkExternalCommands(code) {
  let systemCommands = code.includes("system") ? extractAwkSystemCommands(code) : null, pipeCommands = extractAwkPipeCommands(code);
  if (!systemCommands && !pipeCommands)
    return null;
  return {
    dynamic: !!systemCommands?.dynamic || !!pipeCommands?.dynamic,
    commands: [...systemCommands?.commands ?? [], ...pipeCommands?.commands ?? []]
  };
}
function extractAwkSystemCommands(code) {
  let commands = [], sawSystem = !1, searchIndex = 0;
  while (searchIndex < code.length) {
    let systemIndex = code.indexOf("system", searchIndex);
    if (systemIndex === -1)
      break;
    if (searchIndex = systemIndex + 6, isAwkIdentifierChar(code[systemIndex - 1]) || isAwkIdentifierChar(code[searchIndex]))
      continue;
    let i = skipAwkWhitespace(code, searchIndex);
    if (code[i] !== "(")
      continue;
    i = skipAwkWhitespace(code, i + 1);
    let quote = code[i];
    if (quote !== '"' && quote !== "'") {
      sawSystem = !0;
      continue;
    }
    let parsed = readAwkStringLiteral(code, i, quote);
    if (!parsed) {
      sawSystem = !0;
      continue;
    }
    if (i = skipAwkWhitespace(code, parsed.endIndex), sawSystem = !0, code[i] !== ")")
      return { dynamic: !0, commands };
    commands.push(parsed.value), searchIndex = i + 1;
  }
  if (!sawSystem)
    return null;
  return commands.length > 0 ? { dynamic: !1, commands } : { dynamic: !0, commands };
}
function extractAwkPipeCommands(code) {
  let commands = [], dynamic = !1, sawPipeCommand = !1, i = 0;
  while (i < code.length) {
    let char = code[i];
    if (!char)
      break;
    if (char === '"' || char === "'") {
      i = readAwkStringLiteral(code, i, char)?.endIndex ?? i + 1;
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
    let operatorEnd = code[i + 1] === "&" ? i + 2 : i + 1, afterPipe = skipAwkWhitespace(code, operatorEnd);
    if (startsAwkKeyword(code, afterPipe, "getline")) {
      sawPipeCommand = !0;
      let command = readAwkStringBeforePipe(code, i);
      if (command === null)
        dynamic = !0;
      else
        commands.push(command);
      i = operatorEnd;
      continue;
    }
    if (isAwkPrintPipe(code, i)) {
      sawPipeCommand = !0;
      let parsed = readAwkStringAt(code, afterPipe);
      if (!parsed) {
        dynamic = !0, i = operatorEnd;
        continue;
      }
      commands.push(parsed.value), i = parsed.endIndex;
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
  while (/\s/.test(code[i] ?? ""))
    i++;
  return i;
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
function readAwkStringBeforePipe(code, pipeIndex) {
  let endIndex = skipAwkWhitespaceBack(code, pipeIndex), quote = code[endIndex - 1];
  if (quote !== '"' && quote !== "'")
    return null;
  for (let i = endIndex - 2;i >= 0; i--) {
    if (code[i] !== quote)
      continue;
    let parsed = readAwkStringLiteral(code, i, quote);
    if (parsed?.endIndex === endIndex)
      return parsed.value;
  }
  return null;
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
function skipAwkWhitespaceBack(code, index) {
  let i = index;
  while (i > 0 && /\s/.test(code[i - 1] ?? ""))
    i--;
  return i;
}
function startsAwkKeyword(code, index, keyword) {
  return code.startsWith(keyword, index) && !isAwkIdentifierChar(code[index - 1]) && !isAwkIdentifierChar(code[index + keyword.length]);
}
function isAwkPrintPipe(code, pipeIndex) {
  return /\b(?:print|printf)\b/.test(code.slice(findAwkStatementStart(code, pipeIndex), pipeIndex));
}
function findAwkStatementStart(code, index) {
  let starts = [";", `
`, "{", "}"].map((marker) => code.lastIndexOf(marker, index - 1));
  return Math.max(...starts) + 1;
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
  return "{([,;!~".includes(code[previousIndex] ?? "");
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

// src/core/shell/command.ts
function normalizeCommandToken(token) {
  return getBasename(token).toLowerCase();
}
function getBasename(token) {
  return token.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? token;
}

// src/domain/decision.ts
var BLOCK_INTENTS = [
  "hard_stop",
  "use_alternative",
  "scope_down",
  "manual_only",
  "stop_and_explain"
];

// src/types.ts
var MAX_RECURSION_DEPTH = 10, MAX_STRIP_ITERATIONS = 20, NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, COMMAND_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/, MAX_REASON_LENGTH = 256, SHELL_WRAPPERS = /* @__PURE__ */ new Set(["bash", "sh", "zsh", "ksh", "dash", "fish", "csh", "tcsh"]), INTERPRETERS = /* @__PURE__ */ new Set(["python", "python3", "python2", "node", "ruby", "perl"]), PYTHON_INTERPRETER_PATTERN = /^python(?:[23](?:\.\d+)*)?$/, RM_RECURSIVE_FORCE_PATTERN = /\brm[^\S\n]+(?=(?:(?!--(?=[^\S\n]|[;&|]|$))[^\s;&|]+[^\S\n]+)*(?:-(?!-)[^\s;&|]*[rR][^\s;&|]*|--recursive)(?=[^\S\n]|[;&|]|$))(?=(?:(?!--(?=[^\S\n]|[;&|]|$))[^\s;&|]+[^\S\n]+)*(?:-(?!-)[^\s;&|]*[fF][^\s;&|]*|--force)(?=[^\S\n]|[;&|]|$))[^\n;&|]*/, DANGEROUS_PATTERNS = [
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

// src/core/analyze/interpreters.ts
var REASON_INTERPRETER_DANGEROUS = "Interpreter code contains a dangerous command. Run the underlying command directly so it can be analyzed, or use the safer alternative for that command.", REASON_INTERPRETER_BLOCKED = "Interpreter one-liners are blocked in paranoid mode. Write the code to a script file and run it, or run the equivalent shell command directly. (Paranoid mode enabled.)", CODE_FLAGS = /* @__PURE__ */ new Map([
  ["python", /* @__PURE__ */ new Set(["-c"])],
  ["node", /* @__PURE__ */ new Set(["-e", "--eval"])],
  ["ruby", /* @__PURE__ */ new Set(["-e"])],
  ["perl", /* @__PURE__ */ new Set(["-e", "-E"])]
]), CLUSTERED_CODE_FLAGS = /* @__PURE__ */ new Map([
  ["python", /* @__PURE__ */ new Set(["c"])],
  ["node", /* @__PURE__ */ new Set(["e"])],
  ["ruby", /* @__PURE__ */ new Set(["e"])],
  ["perl", /* @__PURE__ */ new Set(["e", "E"])]
]);
function extractInterpreterCodeArg(tokens) {
  let interpreter = normalizeInterpreter(tokens[0] ?? "");
  for (let i = 1;i < tokens.length; i++) {
    let token = tokens[i];
    if (!token)
      continue;
    if (isInterpreterCodeFlag(interpreter, token))
      return tokens[i + 1] || null;
    let inlineEval = /^--eval=(.*)$/s.exec(token);
    if (supportsInlineEval(interpreter) && inlineEval?.[1])
      return inlineEval[1];
    let shortCodeArg = extractShortCodeArg(interpreter, token, tokens[i + 1]);
    if (shortCodeArg)
      return shortCodeArg;
  }
  return null;
}
function isInterpreterCommand(command) {
  return CODE_FLAGS.has(normalizeInterpreter(command));
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
function extractShortCodeArg(interpreter, token, nextToken) {
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2)
    return null;
  let flags = CLUSTERED_CODE_FLAGS.get(interpreter), codeFlagIndex = Array.from(token.slice(1)).findIndex((flag) => flags?.has(flag) ?? !1);
  if (codeFlagIndex < 0)
    return null;
  return token.slice(codeFlagIndex + 2) || nextToken || null;
}
function containsDangerousCode(code) {
  for (let pattern of DANGEROUS_PATTERNS)
    if (pattern.test(code))
      return !0;
  return !1;
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
// src/core/shell/wrappers.ts
import { realpathSync as realpathSync2 } from "node:fs";
import { isAbsolute as isAbsolute2, parse as parsePath2 } from "node:path";

// src/core/git/env.ts
var GIT_CONTEXT_ENV_OVERRIDES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE"
], GIT_CONTEXT_ENV_OVERRIDE_NAMES = new Set(GIT_CONTEXT_ENV_OVERRIDES), GIT_CONFIG_AFFECTING_ENV_NAMES = /* @__PURE__ */ new Set([
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
function parseGitContextAppendEnvAssignment(token) {
  let name = token.match(GIT_CONTEXT_APPEND_ASSIGNMENT_RE)?.[1];
  if (!name || !isTrackedGitEnvName(name))
    return null;
  let eqIdx = token.indexOf("=");
  return { name, value: token.slice(eqIdx + 1) };
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

// src/core/path.ts
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, parse as parsePath, sep } from "node:path";
function resolveChdirTarget(baseCwd, target) {
  let root = isAbsolute(target) ? getPathRoot(target) : "", current = root || baseCwd;
  for (let component of getPathComponents(root ? target.slice(root.length) : target)) {
    if (component === "" || component === ".")
      continue;
    if (component === "..") {
      current = dirname(current);
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
    redirections: Object.freeze(command.redirections),
    nested: Object.freeze(command.nested)
  });
}
function appendAccumulatedCommand(nodes, accumulator, command) {
  nodes.push(freezeCommandView(command)), accumulator.reset();
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
    nodes: Object.freeze(program.nodes)
  });
}

// src/parser/posix.ts
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
  let result = scanSequence(source, 0, source.length, dialect, limits, 0);
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
function scanSequence(source, start, end, dialect, limits, depth, closing) {
  let nodes = createCommandNodes(), issues = createCommandIssues(), accumulator = createCommandAccumulator(), wordCount = 0, limited = !1, flushCommand = () => {
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
      return flushCommand(), { nodes, issues, next: i + 1, closed: !0, words: wordCount, limited };
    if (isShellWhitespace(char)) {
      if (char === `
` || char === "\r") {
        flushCommand();
        let connectorEnd = char === "\r" && source[i + 1] === `
` ? i + 2 : i + 1;
        nodes.push(Object.freeze({
          kind: "connector",
          operator: source.slice(i, connectorEnd),
          span: Object.freeze({ start: i, end: connectorEnd })
        })), i = connectorEnd;
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
      flushCommand(), nodes.push(Object.freeze({
        kind: "connector",
        operator: connector,
        span: Object.freeze({ start: i, end: i + connector.length })
      })), i += connector.length;
      continue;
    }
    if ((char === "(" || char === "{") && accumulator.start === -1) {
      if (depth >= limits.maxDepth)
        return limitedResult(nodes, issues, i, wordCount, "depth-limit", limits.maxDepth);
      let close = char === "(" ? ")" : "}", inner = scanSequence(source, i + 1, end, dialect, limits, depth + 1, close), groupEnd = inner.next, bodySpan = { start: i + 1, end: inner.closed ? groupEnd - 1 : groupEnd }, body = freezeCommandProgram({
        kind: "program",
        dialect,
        source: source.slice(bodySpan.start, bodySpan.end),
        span: bodySpan,
        status: getParseStatus(inner.issues, inner.limited),
        issues: inner.issues,
        nodes: inner.nodes
      });
      if (nodes.push(Object.freeze({
        kind: "group",
        style: char === "(" ? "subshell" : "brace",
        span: Object.freeze({ start: i, end: groupEnd }),
        body
      })), issues.push(...inner.issues), !inner.closed)
        issues.push({
          code: char === "(" ? "unclosed-subshell" : "unclosed-brace-group",
          message: `${char} group is not closed`,
          span: { start: i, end: groupEnd }
        });
      wordCount += inner.words, limited ||= inner.limited, i = groupEnd;
      continue;
    }
    let redirect = (char === "<" || char === ">") && source[i + 1] !== "(" ? readRedirect(source, i) : null;
    if (redirect) {
      if (accumulator.words.length > 0) {
        let prior = accumulator.words.at(-1);
        if (prior && prior.span.end === i && /^[0-9]+$/.test(prior.raw))
          accumulator.words.pop();
      }
      let redirectStart = i;
      accumulator.start = accumulator.start === -1 ? i : accumulator.start;
      let targetStart = i + redirect.length;
      while (targetStart < end && /[ \t]/.test(source[targetStart] ?? ""))
        targetStart++;
      let targetResult = targetStart < end && !readConnector(source, targetStart) ? readWord(source, targetStart, end, dialect, limits, depth) : void 0, redirectEnd = targetResult?.next ?? i + redirect.length;
      if (accumulator.redirections.push(Object.freeze({
        kind: "redirection",
        operator: redirect,
        span: Object.freeze({ start: redirectStart, end: redirectEnd }),
        ...targetResult ? { target: targetResult.word } : {}
      })), targetResult)
        accumulator.nested.push(...targetResult.nested), issues.push(...targetResult.issues), wordCount += targetResult.words, limited ||= targetResult.limited;
      accumulator.end = redirectEnd, i = redirectEnd;
      continue;
    }
    let wordResult = readWord(source, i, end, dialect, limits, depth);
    if (accumulator.start = accumulator.start === -1 ? i : accumulator.start, accumulator.end = wordResult.next, accumulator.words.push(wordResult.word), accumulator.nested.push(...wordResult.nested), issues.push(...wordResult.issues), wordCount += 1 + wordResult.words, limited ||= wordResult.limited, wordCount > limits.maxWords)
      return limitedResult(nodes, issues, wordResult.next, wordCount, "word-limit", limits.maxWords);
    i = wordResult.next > i ? wordResult.next : i + 1;
  }
  return flushCommand(), { nodes, issues, next: i, closed: closing === void 0, words: wordCount, limited };
}
function readWord(source, start, end, dialect, limits, depth) {
  let text = "", i = start, quoted = !1, provenance = "literal", nested = [], issues = [], nestedWords = 0, limited = !1;
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
      let result = readDoubleQuoted(source, i, end, dialect, limits, depth);
      text += result.text, nested.push(...result.nested), issues.push(...result.issues), nestedWords += result.words, limited ||= result.limited, provenance = mergeProvenance(provenance, result.provenance), i = result.next;
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
      text += next, i += 2;
      continue;
    }
    let substitution = char === "$" || char === "<" || char === ">" || char === "`" ? readSubstitution(source, i, end, dialect, limits, depth) : null;
    if (substitution) {
      let collected = collectSubstitution(substitution, nested, issues);
      nestedWords += collected.words, limited ||= collected.limited, provenance = collected.provenance, i = collected.next;
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
    words: nestedWords,
    limited
  };
}
function readDoubleQuoted(source, start, end, dialect, limits, depth) {
  let text = "", provenance = "literal", nested = [], issues = [], words = 0, limited = !1, i = start + 1;
  while (i < end) {
    let char = source[i];
    if (char === '"')
      return { text, provenance, nested, issues, next: i + 1, words, limited };
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
    let substitution = readSubstitution(source, i, end, dialect, limits, depth);
    if (substitution) {
      let collected = collectSubstitution(substitution, nested, issues);
      words += collected.words, i = collected.next, limited ||= collected.limited, provenance = collected.provenance;
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
  }), { text, provenance, nested, issues, next: end, words, limited };
}
function readSubstitution(source, start, end, dialect, limits, depth) {
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
    let arithmeticNodes = [], arithmeticIssues = [], cursor = start + openLength;
    while (cursor < innerEnd) {
      let nestedSubstitution = readSubstitution(source, cursor, innerEnd, dialect, limits, depth + 1);
      if (!nestedSubstitution || nestedSubstitution.provenance === "arithmetic") {
        cursor++;
        continue;
      }
      arithmeticNodes.push(...nestedSubstitution.program.nodes), arithmeticIssues.push(...nestedSubstitution.program.issues), cursor = nestedSubstitution.next;
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
        status: getParseStatus(arithmeticIssues),
        issues: arithmeticIssues,
        nodes: arithmeticNodes
      }),
      next,
      provenance: "arithmetic"
    };
  }
  let inner = scanSequence(source, start + openLength, innerEnd, dialect, limits, depth + 1), substitutionIssue = close === -1 ? [
    {
      code: arithmetic ? "unclosed-arithmetic" : "unclosed-command-substitution",
      message: `${source.slice(start, start + openLength)} substitution is not closed`,
      span: { start, end: next }
    }
  ] : [];
  return {
    program: freezeCommandProgram({
      kind: "program",
      dialect,
      source: source.slice(start + openLength, innerEnd),
      span: { start: start + openLength, end: innerEnd },
      status: getParseStatus([...inner.issues, ...substitutionIssue], inner.limited),
      issues: [...inner.issues, ...substitutionIssue],
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
    limited: substitution.program.status === "limited",
    words: substitution.program.nodes.filter((node) => node.kind === "command").length
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
  let depth = 1, single = !1, double = !1;
  for (let i = start;i < end; i++) {
    let char = source[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (!double && char === "'")
      single = !single;
    if (!single && char === '"')
      double = !double;
    if (single)
      continue;
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
  if (issues.some((issue) => issue.code === "invalid-ansi-c-code-point"))
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
function limitedResult(nodes, issues, next, words, code, limit) {
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
    words,
    limited: !0
  };
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
  if (dialect === "powershell" || dialect === "auto" && shouldUsePowerShellParser(source))
    return parsePowerShellCommand(source, limits);
  return parsePosixCommand(source, "posix", limits);
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
    dynamicExecutable: words[0]?.provenance === "command-substitution",
    legacyNormalized: words.map((word) => word.text).join(" ")
  });
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
  let command = program.nodes[0];
  if (command?.kind !== "command")
    return null;
  if (command.redirections.length > 0 || command.nested.length > 0)
    return null;
  if (command.words.some((word) => word.provenance === "command-substitution"))
    return null;
  return [...command.tokens];
}

// src/core/shell/wrappers.ts
var ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
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
function stripWrappersWithInfo(tokens, cwd) {
  let result = [...tokens], allEnvAssignments = /* @__PURE__ */ new Map, currentCwd = cwd;
  for (let iteration = 0;iteration < MAX_STRIP_ITERATIONS; iteration++) {
    let before = result.join(" "), { tokens: strippedTokens, envAssignments } = stripEnvAssignmentsWithInfo(result);
    for (let [k, v] of envAssignments)
      allEnvAssignments.set(k, v);
    if (result = strippedTokens, result.length === 0)
      break;
    while (result.length > 0 && result[0]?.includes("=") && !ENV_ASSIGNMENT_RE.test(result[0] ?? "")) {
      let appendAssignment = parseGitContextAppendEnvAssignment(result[0] ?? "");
      if (appendAssignment)
        allEnvAssignments.set(appendAssignment.name, appendAssignment.value);
      result = result.slice(1);
    }
    if (result.length === 0)
      break;
    let head = result[0]?.toLowerCase();
    if (head !== "sudo" && head !== "env" && head !== "command")
      break;
    if (head === "sudo") {
      let sudoResult = stripSudoWithInfo(result, currentCwd);
      if (result = sudoResult.tokens, sudoResult.cwd !== void 0)
        currentCwd = sudoResult.cwd;
    }
    if (head === "env") {
      let envResult = stripEnvWithInfo(result, currentCwd);
      if (result = envResult.tokens, envResult.cwd !== void 0)
        currentCwd = envResult.cwd;
      for (let [k, v] of envResult.envAssignments)
        allEnvAssignments.set(k, v);
    }
    if (head === "command")
      result = stripCommand(result);
    if (result.join(" ") === before)
      break;
  }
  let { tokens: finalTokens, envAssignments: finalAssignments } = stripEnvAssignmentsWithInfo(result);
  for (let [k, v] of finalAssignments)
    allEnvAssignments.set(k, v);
  return { tokens: finalTokens, envAssignments: allEnvAssignments, cwd: currentCwd };
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
function stripEnvWithInfo(tokens, cwd) {
  let envAssignments = /* @__PURE__ */ new Map, currentCwd = cwd, expandedTokens = tokens, i = 1;
  while (i < expandedTokens.length) {
    let token = expandedTokens[i];
    if (!token)
      break;
    if (token === "--")
      return { tokens: expandedTokens.slice(i + 1), envAssignments, cwd: currentCwd };
    if (ENV_OPTS_NO_VALUE.has(token)) {
      i++;
      continue;
    }
    if (token === "-S" || token === "--split-string") {
      let splitValue = expandedTokens[i + 1], splitTokens = splitValue !== void 0 ? parseEnvSplitString(splitValue) : null;
      if (!splitTokens) {
        currentCwd = null, i += 2;
        continue;
      }
      expandedTokens = replaceEnvSplitTokens(expandedTokens, i, 2, splitTokens);
      continue;
    }
    if (token.startsWith("-S") && token.length > 2) {
      let splitTokens = parseEnvSplitString(token.slice(2));
      if (!splitTokens) {
        currentCwd = null, i++;
        continue;
      }
      expandedTokens = replaceEnvSplitTokens(expandedTokens, i, 1, splitTokens);
      continue;
    }
    if (token.startsWith("--split-string=")) {
      let splitTokens = parseEnvSplitString(token.slice(15));
      if (!splitTokens) {
        currentCwd = null, i++;
        continue;
      }
      expandedTokens = replaceEnvSplitTokens(expandedTokens, i, 1, splitTokens);
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
    if (token.startsWith("-u=") || token.startsWith("--unset=")) {
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
    let assignment = parseEnvAssignment(token);
    if (!assignment)
      break;
    envAssignments.set(assignment.name, assignment.value), i++;
  }
  return { tokens: expandedTokens.slice(i), envAssignments, cwd: currentCwd };
}
function parseEnvSplitString(value) {
  return parseSimpleWords(value);
}
function replaceEnvSplitTokens(tokens, index, consumed, splitTokens) {
  return [...tokens.slice(0, index), ...splitTokens, ...tokens.slice(index + consumed)];
}
function resolveWrapperCwd(cwd, target) {
  if (target === "")
    return null;
  try {
    if (!cwd && !isAbsolute2(target))
      return null;
    let baseCwd = isAbsolute2(target) ? getPathRoot2(target) : realpathSync2(cwd ?? "/");
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
var BUILTIN_ANALYZED_COMMANDS = /* @__PURE__ */ new Set(["rm", "find", "xargs", "parallel"]), RESERVED_TRANSPARENT_WRAPPERS = /* @__PURE__ */ new Set([
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
  let wrapper = getBasename(head), startIndex = tokens[1] === "--" ? 2 : 1, childIndex = tokens.findIndex((child, index) => index >= startIndex && getBasename(child) !== wrapper && isProtectableCommand(child, policy));
  if (childIndex < 0)
    return null;
  return { wrapper, tokens: [...tokens.slice(childIndex)], childIndex };
}
function isProtectableCommand(token, policy) {
  let basename = getBasename(token), normalized = normalizeCommandToken(token);
  return normalized === "git" || basename === "busybox" || BUILTIN_ANALYZED_COMMANDS.has(basename) || policy.transparentWrappers.includes(basename) || SHELL_WRAPPERS.has(normalized) || token === "$SHELL" || isInterpreterCommand(normalized) || AWK_INTERPRETERS.has(normalized) || policy.rules.some((rule) => rule.command === basename);
}
function isReservedTransparentWrapper(command2) {
  let normalized = normalizeCommandToken(command2);
  return RESERVED_TRANSPARENT_WRAPPERS.has(normalized) || isInterpreterCommand(normalized);
}

// src/core/rules/policy/paths.ts
import { homedir } from "node:os";
import { dirname as dirname2, join, resolve } from "node:path";
var RULES_CONFIG_FILE = "rule.json", RULES_LOCK_FILE = "rule.lock", RULEBOOK_FILE = "rulebook.json", LEGACY_RULES_CONFIG_FILE = "config.json", SAFETY_NET_DIR = ".cc-safety-net", RULES_SUBDIR = "rules", CACHE_SUBDIR = "cache", RULES_DIR = `${SAFETY_NET_DIR}/${RULES_SUBDIR}`, CC_SAFETY_NET_HOME = "CC_SAFETY_NET_HOME", GITHUB_RULEBOOK_SOURCE_FORMAT = "owner/repo#ref/<rulebook-name>", RULE_SYNC_COMMAND = "`cc-safety-net rule sync`", RULE_MIGRATE_COMMAND = "`npx -y cc-safety-net rule migrate`";
function getProjectRulesDir(cwd) {
  return resolve(cwd ?? process.cwd(), RULES_DIR);
}
function getProjectRulesConfigPath(cwd) {
  return join(getProjectRulesDir(cwd), RULES_CONFIG_FILE);
}
function getUserRulesDir(options2) {
  return options2?.userConfigDir ?? (options2?.userConfigPath ? dirname2(options2.userConfigPath) : join(getUserSafetyNetHome(), RULES_SUBDIR));
}
function getUserSafetyNetHome() {
  let home = process.env[CC_SAFETY_NET_HOME];
  return home ? resolve(home) : join(homedir(), SAFETY_NET_DIR);
}
function getUserRulesConfigPath(options2) {
  return join(getUserRulesDir(options2), RULES_CONFIG_FILE);
}
function getUserRulesLockPath(options2) {
  return join(getUserRulesDir(options2), RULES_LOCK_FILE);
}
function getRulesLockPathForConfigPath(configPath) {
  return join(dirname2(configPath), RULES_LOCK_FILE);
}
function getLegacyUserRulesConfigPath(options2 = {}) {
  return join(dirname2(getUserRulesDir(options2)), LEGACY_RULES_CONFIG_FILE);
}
function getLegacyProjectRulesConfigPath(options2 = {}) {
  return resolve(options2.cwd ?? process.cwd(), ".safety-net.json");
}
function getPolicyPaths(options2) {
  let userConfigPath = options2.userConfigPath ?? getUserRulesConfigPath(options2), projectConfigPath = options2.projectConfigPath ?? getProjectRulesConfigPath(options2.cwd);
  return {
    userConfigPath,
    projectConfigPath,
    userLockPath: getRulesLockPathForConfigPath(userConfigPath),
    projectLockPath: getRulesLockPathForConfigPath(projectConfigPath)
  };
}
function getScopePaths(options2) {
  let configPath = options2.global ? options2.userConfigPath ?? getUserRulesConfigPath(options2) : options2.projectConfigPath ?? getProjectRulesConfigPath(options2.cwd);
  return {
    configDir: dirname2(configPath),
    configPath,
    lockPath: getRulesLockPathForConfigPath(configPath)
  };
}
function getRulebookDisplaySource(entry) {
  if (entry.kind === "github" && entry.display_ref)
    return `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}`;
  return entry.spec;
}
function getRulebookCachePath(entry, options2) {
  let digestHex = entry.digest.startsWith("sha256:") ? entry.digest.slice(7) : entry.digest;
  return join(getRulesCacheDir(options2), "rulebooks", `${getRulebookCacheSlug(entry)}--${digestHex.slice(0, 12)}`, RULEBOOK_FILE);
}
function getRulebookCacheSlug(entry) {
  return (entry.kind === "github" && entry.display_ref ? `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}` : entry.spec).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "rulebook";
}
function getRepositoryRulebookPath(name) {
  return `${RULES_DIR}/${name}/${RULEBOOK_FILE}`;
}
function getRulesCacheDir(options2) {
  return join(dirname2(options2?.cacheConfigDir ?? getUserRulesDir(options2)), CACHE_SUBDIR);
}

// src/core/rules/policy/sources.ts
var GITHUB_SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(.+)$/, GITHUB_REPOSITORY_SOURCE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/, GITHUB_REPOSITORY_REF_SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([A-Za-z0-9._-]+)$/, GITHUB_REF_PATTERN = /^[A-Za-z0-9._-]+$/, RULES_DIR_RE = RULES_DIR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), RULEBOOK_FILE_RE = RULEBOOK_FILE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), GITHUB_RULEBOOK_PATH_RE = new RegExp(`^${RULES_DIR_RE}/(${NAME_PATTERN.source.slice(1, -1)})/${RULEBOOK_FILE_RE}$`);
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
    throw Error(`GitHub rulebook sources must be ${GITHUB_RULEBOOK_SOURCE_FORMAT}: ${spec}`);
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
var require2 = createRequire(import.meta.url), schemas;
function createSchemas() {
  let z = require2("zod"), BlockIntentSchema = z.enum(BLOCK_INTENTS), RuleOverrideSchema = z.union([
    z.literal("off"),
    z.looseObject({
      reason: z.string().min(1).max(MAX_REASON_LENGTH).describe("Replacement block reason"),
      intent: BlockIntentSchema.optional()
    })
  ]).describe("Disable a rule or replace its block reason and intent."), RuleSourceSchema = z.string().min(1), RuleOverrideKeySchema = z.string().regex(/^[^/]+\/[^/]+$/), TransparentWrapperSchema = z.string().regex(COMMAND_PATTERN).describe("Command name such as 'git', 'docker', or 'rtk'."), RulesConfigSchema = z.looseObject({
    $schema: z.unknown().optional().describe("JSON Schema reference for IDE support"),
    version: z.literal(1).describe("Schema version (must be 1)"),
    rules: z.array(RuleSourceSchema).default([]).describe("Rulebook source strings such as project-rules or owner/repo#main/team-rules"),
    overrides: z.record(RuleOverrideKeySchema, RuleOverrideSchema).default({}).describe("Rule overrides by id"),
    transparent_wrappers: z.array(TransparentWrapperSchema).default([]).describe("Commands that transparently execute a visible protected child command")
  }).superRefine((config, context) => {
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
  }), SafetyOverridesSchema = z.strictObject({
    fail_closed: z.boolean().optional(),
    paranoid_rm: z.boolean().optional(),
    paranoid_interpreters: z.boolean().optional()
  }), OffOverridesSchema = z.record(z.string(), z.literal("off")), UserPolicySchema = z.strictObject({
    version: z.literal(1),
    safety: z.strictObject({
      level: z.enum(["standard", "strict", "paranoid"]).optional(),
      overrides: SafetyOverridesSchema.optional()
    }).optional(),
    workflow: z.strictObject({ worktree_mode: z.boolean().optional() }).optional(),
    destructive_command_protection: z.strictObject({ enabled: z.boolean().optional(), overrides: OffOverridesSchema.optional() }).optional(),
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
  validateOffOverrides(value.overrides, "destructive_command_protection", DESTRUCTIVE_COMMAND_RULE_ID_SET, "destructive command", errors);
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
  if (value === void 0)
    return;
  if (!isRecord(value)) {
    errors.push(`${field}.overrides must be an object if provided`);
    return;
  }
  for (let [id, override] of Object.entries(value)) {
    if (!knownIds.has(id))
      errors.push(`unknown ${label} rule id "${id}"`);
    if (override !== "off")
      errors.push(`${field}.overrides.${id} must be "off"`);
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
// src/core/rules/policy/config-file.ts
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname as dirname3 } from "node:path";

// src/core/rules/policy/types.ts
var DEFAULT_CONFIG = {
  version: 1,
  rules: [],
  overrides: {},
  transparent_wrappers: []
};

// src/core/rules/policy/config-file.ts
function validateRulesConfig(config) {
  let parsed = getRulesConfigSchema().safeParse(config), validation = getRulesConfigValidation(config);
  return {
    errors: parsed.success ? [] : validation.errors,
    sources: validation.sources
  };
}
function readRulesConfig(path) {
  if (!existsSync(path))
    return { config: null, errors: [] };
  try {
    let content = readFileSync(path, "utf-8");
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
    return {
      config: null,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`]
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
function createAtomicTempPath(path) {
  return `${path}.${randomBytes(8).toString("hex")}.tmp`;
}
function writeJsonAtomic(path, value, mode) {
  mkdirSync(dirname3(path), { recursive: !0 });
  let tempPath = createAtomicTempPath(path);
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}
`, {
      encoding: "utf-8",
      flag: "wx",
      mode
    }), renameSync(tempPath, path);
  } catch (error) {
    throw rmSync(tempPath, { force: !0 }), error;
  }
}

// src/core/policy.ts
var POLICY_FILE = "policy.json", SAFETY_LEVELS = /* @__PURE__ */ new Set(["standard", "strict", "paranoid"]), DEFAULT_GUI_POLICY = {
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
  return join2(dirname4(getUserRulesDir(options2)), POLICY_FILE);
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
  let raw = readFileSync2(path, "utf-8");
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
  return mkdirSync2(dirname4(path), { recursive: !0, mode: 448 }), writeJsonAtomic(path, normalizedPolicy, 384), chmodSync(path, 384), { path, policy: normalizedPolicy, errors: [] };
}
function repairUserPolicyForGui(options2 = {}) {
  let path = getUserPolicyPath(options2);
  if (!existsSync2(path))
    return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options2);
  let raw = readFileSync2(path, "utf-8");
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
    disabledDestructiveCommandRules: new Set(user.policy.disabledDestructiveCommandRules),
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
      level: SAFETY_LEVELS.has(safety.level) ? safety.level : "standard",
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
      overrides: repairOffOverrides(destructiveCommand.overrides, DESTRUCTIVE_COMMAND_RULE_ID_SET)
    },
    secret_protection: {
      enabled: typeof secret.enabled === "boolean" ? secret.enabled : !0,
      overrides: repairOffOverrides(secret.overrides, SECRET_PROTECTION_RULE_ID_SET),
      deny_paths: repairDenyPaths(secret.deny_paths)
    }
  };
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
      overrides: Object.fromEntries(Object.entries(destructiveCommandOverrides).flatMap(([id, value]) => value === "off" ? [[id, "off"]] : []))
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
    let content = readFileSync2(path, "utf-8");
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
    disabledDestructiveCommandRules: [],
    secretProtection: { enabled: !0, disabledRules: /* @__PURE__ */ new Set, denyPaths: [] }
  };
}
function normalizePolicyConfig(config) {
  let safety = normalizeSafety(config.safety), workflow = config.workflow, destructiveCommand = config.destructive_command_protection, secret = config.secret_protection;
  return {
    safety,
    worktreeMode: workflow?.worktree_mode ?? !1,
    destructiveCommandProtectionEnabled: destructiveCommand?.enabled ?? !0,
    disabledDestructiveCommandRules: Object.entries(destructiveCommand?.overrides ?? {}).flatMap(([id, value]) => value === "off" ? [id] : []),
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
import { existsSync as existsSync5, readFileSync as readFileSync5, realpathSync as realpathSync3 } from "node:fs";
import { dirname as dirname5, isAbsolute as isAbsolute3, join as join4, relative, resolve as resolve2, sep as sep2 } from "node:path";

// src/core/rules/custom.ts
function checkCustomRules(tokens, rules) {
  return checkCustomRuleMatch(tokens, rules)?.reason ?? null;
}
function checkCustomRuleMatch(tokens, rules) {
  return checkRuleMatch(tokens, rules);
}
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
    if (!matchesSubcommand(command2, tokens, rule.subcommand))
      continue;
    if (matchesBlockArgs(tokens, rule.block_args, shortOpts))
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
function matchesSubcommand(command2, tokens, ruleSubcommand) {
  if (!ruleSubcommand)
    return !0;
  return matchesSubcommandFrom(tokens, 1, ruleSubcommand, getOptionsWithValues(command2));
}
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
function getOptionsWithValues(command2) {
  if (command2 === "git")
    return GIT_OPTIONS_WITH_VALUES;
  if (command2 === "docker")
    return DOCKER_OPTIONS_WITH_VALUES;
  return EMPTY_OPTIONS_WITH_VALUES;
}
function matchesSubcommandFrom(tokens, startIndex, expectedSubcommand, optionsWithValues) {
  let skipNext = !1;
  for (let i = startIndex;i < tokens.length; i++) {
    let token = tokens[i];
    if (!token)
      continue;
    if (skipNext) {
      skipNext = !1;
      continue;
    }
    if (token === "--") {
      let nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith("-"))
        return nextToken === expectedSubcommand;
      return !1;
    }
    if (optionsWithValues.has(token)) {
      skipNext = !0;
      continue;
    }
    if (token.startsWith("-")) {
      if (!token.includes("=") && shouldSkipPossibleOptionValue(tokens, i, expectedSubcommand, optionsWithValues))
        return !0;
      continue;
    }
    return token === expectedSubcommand;
  }
  return !1;
}
function shouldSkipPossibleOptionValue(tokens, optionIndex, expectedSubcommand, optionsWithValues) {
  let value = tokens[optionIndex + 1];
  if (!value || value.startsWith("-"))
    return !1;
  return matchesSubcommandFrom(tokens, optionIndex + 2, expectedSubcommand, optionsWithValues);
}
function matchesBlockArgs(tokens, blockArgs, shortOpts) {
  let blockArgsSet = new Set(blockArgs);
  for (let token of tokens)
    if (blockArgsSet.has(token))
      return !0;
  for (let opt of shortOpts)
    if (blockArgsSet.has(opt))
      return !0;
  return !1;
}

// src/core/rules/custom-rule-validation.ts
function validateCustomRule(rule, index, ruleNames, options2 = {}) {
  let errors = [], prefix = `rules[${index}]`;
  if (!rule || typeof rule !== "object")
    return errors.push(`${prefix}: must be an object`), errors;
  let r = rule, messageStyle = options2.messageStyle ?? "legacy";
  if (typeof r.name !== "string")
    errors.push(`${prefix}.name: required string`);
  else {
    if (!NAME_PATTERN.test(r.name))
      errors.push(messageStyle === "rulebook" ? `${prefix}.name: must match rule name pattern` : `${prefix}.name: must match pattern (letters, numbers, hyphens, underscores; max 64 chars)`);
    let lowerName = r.name.toLowerCase();
    if (ruleNames.has(lowerName))
      errors.push(`${prefix}.name: duplicate rule name "${r.name}"`);
    else
      ruleNames.add(lowerName);
  }
  if (typeof r.command !== "string")
    errors.push(messageStyle === "rulebook" ? `${prefix}.command: required string matching command pattern` : `${prefix}.command: required string`);
  else if (!COMMAND_PATTERN.test(r.command))
    errors.push(messageStyle === "rulebook" ? `${prefix}.command: required string matching command pattern` : `${prefix}.command: must match pattern (letters, numbers, hyphens, underscores)`);
  if (r.subcommand !== void 0) {
    if (typeof r.subcommand !== "string")
      errors.push(messageStyle === "rulebook" ? `${prefix}.subcommand: must match command pattern` : `${prefix}.subcommand: must be a string if provided`);
    else if (!COMMAND_PATTERN.test(r.subcommand))
      errors.push(messageStyle === "rulebook" ? `${prefix}.subcommand: must match command pattern` : `${prefix}.subcommand: must match pattern (letters, numbers, hyphens, underscores)`);
  }
  if (!Array.isArray(r.block_args))
    errors.push(messageStyle === "rulebook" ? `${prefix}.block_args: required non-empty array` : `${prefix}.block_args: required array`);
  else {
    if (r.block_args.length === 0)
      errors.push(messageStyle === "rulebook" ? `${prefix}.block_args: required non-empty array` : `${prefix}.block_args: must have at least one element`);
    for (let i = 0;i < r.block_args.length; i++) {
      let arg = r.block_args[i];
      if (typeof arg !== "string")
        errors.push(messageStyle === "rulebook" ? `${prefix}.block_args[${i}]: must be a non-empty string` : `${prefix}.block_args[${i}]: must be a string`);
      else if (arg === "")
        errors.push(messageStyle === "rulebook" ? `${prefix}.block_args[${i}]: must be a non-empty string` : `${prefix}.block_args[${i}]: must not be empty`);
    }
  }
  if (typeof r.reason !== "string")
    errors.push(messageStyle === "rulebook" ? `${prefix}.reason: required non-empty string up to ${MAX_REASON_LENGTH} characters` : `${prefix}.reason: required string`);
  else if (r.reason === "")
    errors.push(messageStyle === "rulebook" ? `${prefix}.reason: required non-empty string up to ${MAX_REASON_LENGTH} characters` : `${prefix}.reason: must not be empty`);
  else if (r.reason.length > MAX_REASON_LENGTH)
    errors.push(messageStyle === "rulebook" ? `${prefix}.reason: required non-empty string up to ${MAX_REASON_LENGTH} characters` : `${prefix}.reason: must be at most ${MAX_REASON_LENGTH} characters`);
  if (r.intent !== void 0 && !isBlockIntent(r.intent))
    errors.push(`${prefix}.intent: must be one of ${BLOCK_INTENTS.join(", ")}`);
  return errors;
}
function isBlockIntent(value) {
  return typeof value === "string" && BLOCK_INTENTS.includes(value);
}

// src/core/rules/rulebook.ts
function validateRulebook(rulebook) {
  let errors = [], ruleNames = /* @__PURE__ */ new Set;
  if (!rulebook || typeof rulebook !== "object")
    return { errors: ["Rulebook must be an object"], ruleNames };
  let rb = rulebook;
  if (rb.rulebook_version !== 1)
    errors.push("rulebook_version must be 1");
  if (typeof rb.name !== "string" || !NAME_PATTERN.test(rb.name))
    errors.push("name: required string matching rule name pattern");
  if (typeof rb.version !== "string" || rb.version === "")
    errors.push("version: required non-empty string");
  if (!Array.isArray(rb.allowed_commands))
    errors.push("allowed_commands: required array");
  else
    validateAllowedCommands(rb.allowed_commands, errors);
  if (!Array.isArray(rb.rules))
    errors.push("rules: required array");
  else
    for (let i = 0;i < rb.rules.length; i++)
      errors.push(...validateCustomRule(rb.rules[i], i, ruleNames, { messageStyle: "rulebook" }));
  if (!Array.isArray(rb.tests))
    errors.push("tests: required array");
  else
    validateFixtures(rb.tests, rb.rules, errors);
  if (Array.isArray(rb.allowed_commands) && Array.isArray(rb.rules)) {
    let allowed = new Set(rb.allowed_commands.filter((cmd) => typeof cmd === "string"));
    for (let i = 0;i < rb.rules.length; i++) {
      let rule = rb.rules[i];
      if (typeof rule.command === "string" && !allowed.has(rule.command))
        errors.push(`rules[${i}].command: "${rule.command}" must be listed in allowed_commands`);
    }
  }
  return { errors, ruleNames };
}
function validateAllowedCommands(commands, errors) {
  let seen = /* @__PURE__ */ new Set;
  for (let i = 0;i < commands.length; i++) {
    let command2 = commands[i];
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
  let blockedFixtures = /* @__PURE__ */ new Set, ruleNames = new Set(Array.isArray(rules) ? rules.map((rule) => rule && typeof rule === "object" ? rule.name : null).filter((name) => typeof name === "string") : []);
  for (let i = 0;i < tests.length; i++) {
    let fixture = tests[i];
    if (!fixture || typeof fixture !== "object") {
      errors.push(`tests[${i}]: must be an object`);
      continue;
    }
    let f = fixture;
    if (typeof f.command !== "string" || f.command.trim() === "")
      errors.push(`tests[${i}].command: required non-empty string`);
    if (f.expect !== "blocked" && f.expect !== "allowed")
      errors.push(`tests[${i}].expect: must be "blocked" or "allowed"`);
    if (f.rule !== void 0 && typeof f.rule !== "string")
      errors.push(`tests[${i}].rule: must be a string if provided`);
    if (f.expect === "blocked" && typeof f.rule !== "string")
      errors.push(`tests[${i}].rule: required string for blocked fixtures`);
    if (f.expect === "blocked" && typeof f.rule === "string")
      blockedFixtures.add(f.rule);
  }
  for (let i = 0;i < (Array.isArray(rules) ? rules.length : 0); i++) {
    let rule = rules[i];
    if (typeof rule.name === "string" && !blockedFixtures.has(rule.name))
      errors.push(`rules[${i}]: missing blocked fixture for rule "${rule.name}"`);
  }
  for (let rule of blockedFixtures)
    if (!ruleNames.has(rule))
      errors.push(`tests: blocked fixture references unknown rule "${rule}"`);
}
function runRulebookFixtures(rulebook) {
  let failures = rulebook.tests.flatMap((fixture) => {
    let segments = projectLegacySegments(fixture.command).map((tokens) => {
      let mutableTokens = [...tokens], result = checkCustomRuleMatch(mutableTokens, rulebook.rules);
      return {
        tokens: mutableTokens,
        result,
        matchedRule: result?.id.replace(/^custom\./, "") ?? null
      };
    }), firstSegment = segments[0] ?? { tokens: [], result: null, matchedRule: null };
    if (fixture.expect === "allowed") {
      let blockedSegment = segments.find((segment) => segment.result);
      return blockedSegment ? [
        {
          command: fixture.command,
          message: `expected allowed but matched ${blockedSegment.matchedRule ?? "a rule"}`,
          trace: traceRulebookFixture(blockedSegment.tokens, rulebook.rules)
        }
      ] : [];
    }
    let firstBlockedSegment = segments.find((segment) => segment.result);
    if (!firstBlockedSegment)
      return [
        {
          command: fixture.command,
          message: `expected blocked by ${fixture.rule ?? "a rule"} but command was allowed`,
          trace: traceRulebookFixture(firstSegment.tokens, rulebook.rules)
        }
      ];
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
    return `${checkCustomRules([...tokens], [rule]) ? "matched" : "skipped"} ${rule.name}`;
  });
}
function assertValidRulebook(rulebook) {
  let result = validateRulebook(rulebook);
  if (result.errors.length > 0)
    throw Error(result.errors.join("; "));
  let parsed = rulebook, fixtures = runRulebookFixtures(parsed);
  if (!fixtures.ok)
    throw Error(fixtures.failures.map((failure) => `${failure.command}: ${failure.message}`).join("; "));
  return parsed;
}

// src/core/rules/policy/lockfile.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
var SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/, RULEBOOK_SOURCE_KINDS = /* @__PURE__ */ new Set(["local-directory", "github"]);
function readLockfile(path) {
  if (!existsSync3(path))
    return { lock: null, errors: [] };
  try {
    let parsed = JSON.parse(readFileSync3(path, "utf-8"));
    if (!parsed || typeof parsed !== "object")
      return { lock: null, errors: [`malformed lockfile ${path}: must be an object`] };
    let lock = parsed;
    if (lock.version !== 1 || !Array.isArray(lock.rulebooks))
      return { lock: null, errors: [`malformed lockfile ${path}`] };
    let parsedEntries = lock.rulebooks.map((entry, index) => parseLockEntry(entry, `${path}: rulebooks[${index}]`)), entryErrors = parsedEntries.flatMap((entry) => entry.errors);
    if (entryErrors.length > 0)
      return { lock: null, errors: [`malformed lockfile ${path}`, ...entryErrors] };
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
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "node:fs";
import { join as join3 } from "node:path";
async function resolveRulebookSource(spec, configDir, options2) {
  if (isGitHubRulebookSource(spec))
    return resolveGitHubRulebook(spec);
  return resolveLocalRulebook(spec, configDir, options2);
}
async function resolveRulebookSourceForSync(spec, configDir, options2, previousLock) {
  if (!isGitHubRulebookSource(spec) || options2.refresh)
    return resolveRulebookSource(spec, configDir, options2);
  let locked = previousLock?.rulebooks.find((entry) => entry.spec === spec);
  if (!locked || locked.kind !== "github")
    return resolveRulebookSource(spec, configDir, options2);
  return readLockedGitHubRulebook(locked, configDir, options2);
}
async function discoverGitHubRepositoryRulebooks(source) {
  let [owner, repo] = source.split("/");
  if (!owner || !repo)
    throw Error(`Invalid GitHub repository source: ${source}`);
  let metadataResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!metadataResponse.ok)
    throw Error(`Failed to inspect ${source}: GitHub returned ${metadataResponse.status}`);
  let metadata2 = await metadataResponse.json();
  if (!metadata2.default_branch)
    throw Error(`Failed to inspect ${source}: missing default branch`);
  let commit = await resolveGitHubCommit(owner, repo, metadata2.default_branch, source), treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`);
  if (!treeResponse.ok)
    throw Error(`Failed to inspect ${source}: GitHub tree returned ${treeResponse.status}`);
  let names = ((await treeResponse.json()).tree ?? []).flatMap((entry) => {
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
function resolveLocalRulebook(spec, configDir, _options) {
  assertBareRulebookName(spec);
  let path = getLocalRulebookPath(configDir, spec);
  if (!existsSync4(path))
    throw Error(`Rulebook source not found: ${spec}`);
  let content = readFileSync4(path, "utf-8"), rulebook = assertValidRulebook(JSON.parse(content));
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
async function resolveGitHubRulebook(spec) {
  let parsed = parseGitHubSource(spec), commit = await resolveGitHubCommit(parsed.owner, parsed.repo, parsed.ref, spec), rawResponse = await fetch(`https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${commit}/${parsed.path}`);
  if (!rawResponse.ok)
    throw Error(`Failed to fetch ${spec}: GitHub raw returned ${rawResponse.status}`);
  let content = await rawResponse.text(), rulebook = assertValidRulebook(JSON.parse(content));
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
async function readLockedGitHubRulebook(entry, configDir, options2) {
  let identityError = getRulebookLockEntrySourceIdentityError(entry);
  if (identityError)
    throw Error(`${identityError}; run ${RULE_SYNC_COMMAND}`);
  let cachePath = getRulebookCachePath(entry, { ...options2, cacheConfigDir: configDir });
  if (existsSync4(cachePath)) {
    let content = readFileSync4(cachePath, "utf-8");
    if (sha256Digest(content) === entry.digest)
      return { entry, rulebook: assertRulebookMatchesLockEntry(content, entry), content };
  }
  return fetchLockedGitHubRulebook(entry);
}
async function fetchLockedGitHubRulebook(entry) {
  let rawResponse = await fetch(`https://raw.githubusercontent.com/${entry.owner}/${entry.repo}/${entry.commit}/${entry.path}`);
  if (!rawResponse.ok)
    throw Error(`Failed to restore ${entry.spec}: GitHub raw returned ${rawResponse.status}`);
  let content = await rawResponse.text();
  if (sha256Digest(content) !== entry.digest)
    throw Error(`locked GitHub digest mismatch for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
  return { entry, rulebook: assertRulebookMatchesLockEntry(content, entry), content };
}
function assertRulebookMatchesLockEntry(content, entry) {
  let rulebook = assertValidRulebook(JSON.parse(content));
  if (rulebook.name !== entry.name)
    throw Error(`rulebook name "${rulebook.name}" must match lock entry "${entry.name}"`);
  return rulebook;
}
async function resolveGitHubCommit(owner, repo, ref, source) {
  let commitResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
  if (!commitResponse.ok)
    throw Error(`Failed to resolve ${source}: GitHub returned ${commitResponse.status}`);
  let commitJson = await commitResponse.json();
  if (!commitJson.sha)
    throw Error(`Failed to resolve commit for ${source}`);
  return commitJson.sha;
}
function getLocalRulebookPath(configDir, name) {
  return join3(configDir, name, RULEBOOK_FILE);
}
function sha256Digest(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

// src/core/rules/policy/scope-policy.ts
function loadRulesPolicy(options2 = {}) {
  let paths = getPolicyPaths(options2), sameConfigPath = isSameConfigPath(paths.userConfigPath, paths.projectConfigPath), user = readRulesConfig(paths.userConfigPath), project = sameConfigPath ? { config: null, errors: [] } : readRulesConfig(paths.projectConfigPath), errors = [
    ...getLegacyRulesConfigErrors(paths, options2),
    ...user.errors.map((error) => `${paths.userConfigPath}: ${error}`),
    ...project.errors.map((error) => `${paths.projectConfigPath}: ${error}`)
  ], userPolicy = user.config ? loadScopePolicy(user.config, paths.userLockPath, dirname5(paths.userConfigPath), options2, "user") : emptyScopePolicy(), projectPolicy = project.config ? loadScopePolicy(project.config, paths.projectLockPath, dirname5(paths.projectConfigPath), options2, "project") : emptyScopePolicy(), duplicateNames = getDuplicateRulebookNames([
    ...user.config ? getConfiguredLockEntries(user.config, paths.userLockPath) : [],
    ...project.config ? getConfiguredLockEntries(project.config, paths.projectLockPath) : []
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
function getRulesConfigSourceDisplayMap(configPath) {
  let config = readRulesConfig(configPath).config, lock = readLockfile(getRulesLockPathForConfigPath(configPath)).lock;
  if (!config || !lock)
    return /* @__PURE__ */ new Map;
  let configuredSources = new Set(config.rules);
  return new Map(lock.rulebooks.filter((entry) => configuredSources.has(entry.spec)).map((entry) => [entry.spec, getRulebookDisplaySource(entry)]));
}
function getRulesConfigRuntimeErrorsForConfig(configPath, lockPath, options2) {
  let loaded = loadScopePolicyForConfig(configPath, lockPath, options2);
  if (!loaded)
    return [];
  return [...loaded.scope.errors, ...getUnknownOverrideErrorsForScope(loaded.config, loaded.scope)];
}
function loadScopePolicyForConfig(configPath, lockPath, options2) {
  let config = readRulesConfig(configPath).config;
  if (!config)
    return null;
  return {
    config,
    scope: loadScopePolicy(config, lockPath, dirname5(configPath), options2, "project")
  };
}
function getUnknownOverrideErrorsForScope(config, scope) {
  return scope.canValidateOverrides ? getUnknownOverrideErrors(config.overrides ?? {}, scope.knownRuleIds) : [];
}
function loadScopePolicy(config, lockPath, configDir, options2, source) {
  let lockResult = readLockfile(lockPath);
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
    let loadedRulebook = loadLockedRulebook(entry, configDir, options2);
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
function loadLockedRulebook(entry, configDir, options2) {
  let errors = [], cachePath = getRulebookCachePath(entry, { ...options2, cacheConfigDir: configDir });
  if (!existsSync5(cachePath))
    return {
      rulebook: null,
      errors: [`missing cache entry for ${entry.spec}; run ${RULE_SYNC_COMMAND}`]
    };
  let cacheContent;
  try {
    cacheContent = readFileSync5(cachePath, "utf-8");
  } catch (error) {
    return {
      rulebook: null,
      errors: [
        `failed to read cached rulebook for ${entry.spec}: ${error instanceof Error ? error.message : String(error)}`
      ]
    };
  }
  if (sha256Digest(cacheContent) !== entry.digest)
    errors.push(`cache digest mismatch for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
  let rulebook = null;
  try {
    let parsed = JSON.parse(cacheContent);
    assertValidRulebook(parsed), rulebook = parsed;
  } catch (error) {
    errors.push(`invalid cached rulebook for ${entry.spec}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (entry.kind === "local-directory") {
    let sourcePath = resolve2(configDir, entry.path), sourceRelative = relative(resolve2(configDir), sourcePath);
    if (sourceRelative === ".." || sourceRelative.startsWith(`..${sep2}`) || isAbsolute3(sourceRelative))
      return errors.push(`lockfile local source path for ${entry.spec} must stay within ${configDir}; run ${RULE_SYNC_COMMAND}`), { rulebook: null, errors };
    let localPath = join4(sourcePath, RULEBOOK_FILE);
    if (!existsSync5(localPath))
      errors.push(`missing local source for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
    else
      try {
        let localContent = readFileSync5(localPath, "utf-8");
        if (sha256Digest(localContent) !== entry.digest)
          errors.push(getLocalSourceDriftError(entry.spec, localContent));
      } catch (error) {
        errors.push(`failed to read local source for ${entry.spec}: ${error instanceof Error ? error.message : String(error)}`);
      }
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
function isSameConfigPath(userConfigPath, projectConfigPath) {
  if (resolve2(userConfigPath) === resolve2(projectConfigPath))
    return !0;
  if (!existsSync5(userConfigPath) || !existsSync5(projectConfigPath))
    return !1;
  try {
    return realpathSync3(userConfigPath) === realpathSync3(projectConfigPath);
  } catch {
    return !1;
  }
}
function getLegacyRulesConfigErrors(paths, options2) {
  return Array.from(/* @__PURE__ */ new Set([
    ...getLegacyRulesConfigError(getLegacyUserRulesConfigPath(options2), paths.userConfigPath, "~/.cc-safety-net/config.json"),
    ...getLegacyRulesConfigError(getLegacyProjectRulesConfigPath(options2), paths.projectConfigPath, ".safety-net.json")
  ]));
}
function getLegacyRulesConfigError(legacyPath, configPath, migratedFrom) {
  if (!existsSync5(legacyPath))
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
    let parsed = JSON.parse(readFileSync5(legacyPath, "utf-8"));
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
function hasMigrationEvidence(configPath, migratedFrom) {
  let config = readRulesConfig(configPath).config;
  if (!config)
    return !1;
  return config.rules.some((source) => getRulebookMigratedFrom(dirname5(configPath), source) === migratedFrom);
}
function getRulebookMigratedFrom(configDir, source) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(source))
    return null;
  let path = join4(configDir, source, RULEBOOK_FILE);
  if (!existsSync5(path))
    return null;
  try {
    let rulebook = JSON.parse(readFileSync5(path, "utf-8"));
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
    disabledDestructiveCommandRules: [...userPolicy.disabledDestructiveCommandRules],
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
    disabledDestructiveCommandRules: Object.freeze([...policy.disabledDestructiveCommandRules]),
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
function dangerousInTextMatch(text) {
  let t = text.toLowerCase(), stripped = t.trimStart(), isEchoOrRg = stripped.startsWith("echo ") || stripped.startsWith("rg "), patterns = [
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
      caseSensitive: !0
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
      skipForEchoRg: !0
    }
  ];
  for (let { regex, label, skipForEchoRg, caseSensitive } of patterns) {
    if (skipForEchoRg && isEchoOrRg)
      continue;
    let target = caseSensitive ? text : t;
    if (regex.test(target))
      return destructiveCommandMatch("raw-text.dangerous-command", `Unparseable command text contains a destructive pattern (${label}). Rewrite as a plain, parseable command so it can be analyzed.`);
  }
  return null;
}

// src/core/analyze/recursive-delete-targets.ts
import { realpathSync as realpathSync4 } from "node:fs";
import { homedir as homedir2, tmpdir } from "node:os";
import { normalize, resolve as resolve3, sep as sep3 } from "node:path";
var IS_WINDOWS = process.platform === "win32";
function createRecursiveDeleteTargetContext(options2 = {}) {
  return {
    anchoredCwd: options2.originalCwd ?? options2.cwd ?? null,
    resolvedCwd: options2.cwd ?? null,
    paranoid: options2.paranoid ?? !1,
    trustTmpdirVar: options2.allowTmpdirVar ?? !0,
    homeDir: getHomeDirForRmPolicy()
  };
}
function classifyRecursiveDeleteTarget(target, ctx) {
  if (isDangerousRootOrHomeTarget(target))
    return { kind: "root_or_home_target" };
  if (isTempTarget(target, ctx.trustTmpdirVar))
    return { kind: "temp_target" };
  if (isDynamicTarget(target))
    return { kind: "dynamic_target" };
  let anchoredCwd = ctx.anchoredCwd;
  if (anchoredCwd) {
    if (isCwdHomeForRmPolicy(anchoredCwd, ctx.homeDir))
      return { kind: "home_cwd_target" };
    if (isCwdSelfTarget(target, anchoredCwd))
      return { kind: "cwd_self_target" };
    if (isTargetWithinCwd(target, anchoredCwd, ctx.resolvedCwd ?? anchoredCwd))
      return { kind: "within_anchored_cwd" };
  }
  return { kind: "outside_anchored_cwd" };
}
function isDangerousRootOrHomeTarget(path) {
  let normalized = path.trim();
  if (normalized === "/" || normalized === "/*")
    return !0;
  if (normalized === "~" || normalized === "~/" || normalized.startsWith("~/")) {
    if (normalized === "~" || normalized === "~/" || normalized === "~/*")
      return !0;
  }
  if (normalized === "$HOME" || normalized === "$HOME/" || normalized === "$HOME/*")
    return !0;
  if (normalized === "${HOME}" || normalized === "${HOME}/" || normalized === "${HOME}/*")
    return !0;
  return !1;
}
function normalizePathForComparison(p) {
  let normalized = normalize(p);
  if (IS_WINDOWS) {
    if (normalized = normalized.replace(/\//g, "\\").toLowerCase(), normalized.length > 3 && normalized.endsWith("\\"))
      normalized = normalized.slice(0, -1);
    return normalized;
  }
  if (normalized.length > 1 && normalized.endsWith("/"))
    normalized = normalized.slice(0, -1);
  return normalized;
}
function isTempTarget(path, allowTmpdirVar) {
  let normalized = path.trim();
  if (hasParentDirectoryComponent(normalized))
    return !1;
  if (normalized === "/tmp" || normalized.startsWith("/tmp/"))
    return !0;
  if (normalized === "/var/tmp" || normalized.startsWith("/var/tmp/"))
    return !0;
  let normalizedTmpdir = normalizePathForComparison(tmpdir()), pathToCompare = normalizePathForComparison(normalized);
  if (pathToCompare.startsWith(`${normalizedTmpdir}${sep3}`) || pathToCompare === normalizedTmpdir)
    return !0;
  if (allowTmpdirVar) {
    if (normalized === "$TMPDIR" || normalized.startsWith("$TMPDIR/"))
      return !0;
    if (normalized === "${TMPDIR}" || normalized.startsWith("${TMPDIR}/"))
      return !0;
  }
  return !1;
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
function isCwdHomeForRmPolicy(cwd, homeDir) {
  try {
    return normalizePathForComparison(realpathSync4(cwd)) === normalizePathForComparison(realpathSync4(homeDir));
  } catch {
    try {
      return normalizePathForComparison(cwd) === normalizePathForComparison(homeDir);
    } catch {
      return !1;
    }
  }
}
function isCwdSelfTarget(target, cwd) {
  if (target === "." || target === "./" || target === ".\\")
    return !0;
  try {
    return normalizePathForComparison(realpathSync4(resolve3(cwd, target))) === normalizePathForComparison(realpathSync4(cwd));
  } catch {
    try {
      return normalizePathForComparison(resolve3(cwd, target)) === normalizePathForComparison(cwd);
    } catch {
      return !1;
    }
  }
}
function isTargetWithinCwd(target, originalCwd, effectiveCwd) {
  let resolveCwd = effectiveCwd ?? originalCwd;
  if (target.startsWith("~") || target.startsWith("$HOME") || target.startsWith("${HOME}"))
    return !1;
  if (isDynamicTarget(target))
    return !1;
  if (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target))
    try {
      return isResolvedPathWithinCwd(target, originalCwd);
    } catch {
      return !1;
    }
  if (target.startsWith("./") || target.startsWith(".\\") || !target.includes("/") && !target.includes("\\"))
    try {
      return isResolvedPathWithinCwd(resolve3(resolveCwd, target), originalCwd);
    } catch {
      return !1;
    }
  if (target.startsWith("../"))
    return !1;
  try {
    return isResolvedPathWithinCwd(resolve3(resolveCwd, target), originalCwd);
  } catch {
    return !1;
  }
}
function isResolvedPathWithinCwd(resolvedTarget, cwd) {
  try {
    return isNormalizedPathWithin(realpathSync4(resolvedTarget), realpathSync4(cwd));
  } catch {
    return isNormalizedPathWithin(resolvedTarget, cwd);
  }
}
function isNormalizedPathWithin(target, cwd) {
  let normalizedTarget = normalizePathForComparison(target), normalizedCwd = normalizePathForComparison(cwd);
  return normalizedTarget.startsWith(`${normalizedCwd}${sep3}`) || normalizedTarget === normalizedCwd;
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
}, SAFETY_LEVELS2 = ["standard", "strict", "paranoid"];
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
  return SAFETY_LEVELS2.indexOf(envLevel) > SAFETY_LEVELS2.indexOf(policyLevel) ? envLevel : policyLevel;
}
function parseEnvLevel() {
  let value = getEnvFlagValue(ENV_FLAGS.level);
  if (value === void 0)
    return;
  if (SAFETY_LEVELS2.includes(value))
    return value;
  if (envTruthy(ENV_FLAGS.debug))
    console.error(`CC Safety Net debug: invalid CC_SAFETY_NET_LEVEL=${JSON.stringify(value)}`);
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
  let policyLevel = policy.safety?.level ?? "standard", envLevel = parseEnvLevel(), baseLevel = maxSafetyLevel(policyLevel, envLevel), values = expandSafetyLevel(baseLevel), sources = {
    failClosed: [`policy safety.level=${policyLevel}`],
    paranoidRm: [`policy safety.level=${policyLevel}`],
    paranoidInterpreters: [`policy safety.level=${policyLevel}`],
    worktreeMode: []
  };
  if (envLevel && envLevel !== policyLevel)
    sources.failClosed.push(`env ${ENV_FLAGS.level.name}=${envLevel}`), sources.paranoidRm.push(`env ${ENV_FLAGS.level.name}=${envLevel}`), sources.paranoidInterpreters.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
  if (policy.safety?.overrides?.failClosed !== void 0)
    values.failClosed = policy.safety.overrides.failClosed, sources.failClosed.push("policy safety.overrides.fail_closed");
  if (policy.safety?.overrides?.paranoidRm !== void 0)
    values.paranoidRm = policy.safety.overrides.paranoidRm, sources.paranoidRm.push("policy safety.overrides.paranoid_rm");
  if (policy.safety?.overrides?.paranoidInterpreters !== void 0)
    values.paranoidInterpreters = policy.safety.overrides.paranoidInterpreters, sources.paranoidInterpreters.push("policy safety.overrides.paranoid_interpreters");
  if (envTruthy(ENV_FLAGS.strict))
    values.failClosed = !0, sources.failClosed.push(`env ${ENV_FLAGS.strict.name}`);
  if (envTruthy(ENV_FLAGS.paranoid))
    values.paranoidRm = !0, values.paranoidInterpreters = !0, sources.paranoidRm.push(`env ${ENV_FLAGS.paranoid.name}`), sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoid.name}`);
  if (envTruthy(ENV_FLAGS.paranoidRm))
    values.paranoidRm = !0, sources.paranoidRm.push(`env ${ENV_FLAGS.paranoidRm.name}`);
  if (envTruthy(ENV_FLAGS.paranoidInterpreters))
    values.paranoidInterpreters = !0, sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoidInterpreters.name}`);
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
    effectiveLevel: deriveEffectiveLevel(values),
    sources
  };
}
function envTruthy(flag) {
  let value = typeof flag === "string" ? process.env[flag] : getEnvFlagValue(flag);
  return value === "1" || value?.toLowerCase() === "true";
}
function getEnvFlagValue(flag) {
  if (process.env[flag.name] !== void 0)
    return process.env[flag.name];
  if (flag.legacyName)
    return process.env[flag.legacyName];
  return;
}
function envFlagIsSet(flag) {
  return process.env[flag.name] !== void 0 || !!flag.legacyName && process.env[flag.legacyName] !== void 0;
}

// src/core/analyze/powershell/remove-item.ts
var REMOVE_ITEM_ALIASES = /* @__PURE__ */ new Set(["remove-item", "ri", "del", "erase", "rd", "rm", "rmdir"]), REASON_REMOVE_ITEM_RF = "PowerShell Remove-Item -Recurse -Force outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.", REASON_REMOVE_ITEM_DYNAMIC_TARGET = "PowerShell Remove-Item target contains variables or pipeline input that cannot be verified safely. Use literal paths within cwd.", REASON_REMOVE_ITEM_ROOT_HOME = "PowerShell Remove-Item targeting root or home directory is extremely dangerous and always blocked.", REASON_REMOVE_ITEM_HOME_CWD = "PowerShell Remove-Item -Recurse -Force in home directory is dangerous. Change to a project directory first.", REASON_REMOVE_ITEM_PIPELINE = "PowerShell Remove-Item receives pipeline input that cannot be verified safely. Use explicit literal paths within cwd.";
function analyzePowerShellCommandViewMatch(command2, hasPipelineInput, options2 = {}, ctx = createRecursiveDeleteTargetContext(options2)) {
  return analyzePowerShellSegment(command2.words.map((word) => ({
    kind: "word",
    text: word.text,
    dynamic: word.provenance !== "literal"
  })), hasPipelineInput, ctx);
}
function analyzePowerShellSegment(segment, hasPipelineInput, ctx) {
  let words = segment.filter((token) => token.kind === "word"), commandIndex = getCommandIndex(words), command2 = words[commandIndex];
  if (!command2 || !REMOVE_ITEM_ALIASES.has(normalizeCommandName(command2.text)))
    return null;
  let parsed = parseRemoveItem(words.slice(commandIndex + 1));
  if (parsed.whatIfProtected)
    return null;
  if (hasPipelineInput && (parsed.targets.length === 0 || parsed.recursive))
    return destructiveCommandMatch("powershell.remove-item-pipeline-dynamic-target", REASON_REMOVE_ITEM_PIPELINE);
  for (let target of parsed.targets)
    if (isDangerousRootOrHomeTarget(powerShellTargetForPolicy(target.text)))
      return destructiveCommandMatch(parsed.recursive && parsed.force ? "powershell.remove-item-recursive-force-root-or-home" : "powershell.remove-item-root-or-home", REASON_REMOVE_ITEM_ROOT_HOME);
  if (!parsed.recursive || !parsed.force)
    return null;
  if (parsed.hasDynamicTarget || parsed.targets.length === 0)
    return destructiveCommandMatch("powershell.remove-item-recursive-force-dynamic-target", REASON_REMOVE_ITEM_DYNAMIC_TARGET);
  for (let target of parsed.targets) {
    let match = matchForClassification(classifyRecursiveDeleteTarget(powerShellTargetForPolicy(target.text), ctx), ctx);
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
import { realpathSync as realpathSync7 } from "node:fs";
import { normalize as normalize3 } from "node:path";

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

// src/core/analyze/rm-flags.ts
function hasRecursiveForceFlags(tokens) {
  let hasRecursive = !1, hasForce = !1;
  for (let token of tokens) {
    if (token === "--")
      break;
    if (token === "-r" || token === "-R" || token === "--recursive")
      hasRecursive = !0;
    else if (token === "-f" || token === "--force")
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

// src/core/analyze/find.ts
var REASON_FIND_DELETE = "find -delete permanently removes files. Use -print first to preview.", REASON_FIND_EXEC_RM_RF = "find -exec rm -rf is dangerous. Use explicit file list instead.", FIND_EXEC_PRIMARIES = /* @__PURE__ */ new Set(["-exec", "-execdir", "-ok", "-okdir"]), FIND_PRIMARY_ARITY = new Map([
  ...[
    "-amin",
    "-anewer",
    "-atime",
    "-cmin",
    "-cnewer",
    "-context",
    "-ctime",
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
    "-xtype"
  ].map((primary) => [primary, 1]),
  ["-fprintf", 2]
]);
function analyzeFindMatch(tokens, context = {}) {
  if (findHasDelete(tokens.slice(1)))
    return destructiveCommandMatch("find.delete", REASON_FIND_DELETE);
  for (let i = 0;i < tokens.length; i++) {
    let token = tokens[i];
    if (isFindExecPrimary(token)) {
      let execCommand = getFindExecCommand(tokens, i), directoryRelative = token === "-execdir" || token === "-okdir", directReason = analyzeFindExecCommand(execCommand);
      if (directReason)
        return directReason;
      if (context.analyzeTokens) {
        let reason = context.analyzeTokens(execCommand, directoryRelative ? null : context.cwd);
        if (reason)
          return reason;
        continue;
      }
      if (context.analyzeNested) {
        let reason = context.analyzeNested(execCommand.join(" "), {
          effectiveCwd: directoryRelative ? void 0 : context.cwd,
          envAssignments: context.envAssignments
        });
        if (reason)
          return reason;
        continue;
      }
      let fallbackReason = analyzeFindExecCommand(execCommand);
      if (fallbackReason)
        return fallbackReason;
    }
  }
  return null;
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
  let execTokens = tokens.slice(execIndex + 1), semicolonIdx = execTokens.indexOf(";"), plusIdx = execTokens.indexOf("+"), endIdx = semicolonIdx !== -1 && plusIdx !== -1 ? Math.min(semicolonIdx, plusIdx) : semicolonIdx !== -1 ? semicolonIdx : plusIdx !== -1 ? plusIdx : execTokens.length;
  return execTokens.slice(0, endIdx);
}
function findHasDelete(tokens) {
  let i = 0, insideExec = !1, execDepth = 0;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token) {
      i++;
      continue;
    }
    if (isFindExecPrimary(token)) {
      insideExec = !0, execDepth++, i++;
      continue;
    }
    if (insideExec && (token === ";" || token === "+")) {
      if (execDepth--, execDepth === 0)
        insideExec = !1;
      i++;
      continue;
    }
    if (insideExec) {
      i++;
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

// src/core/analyze/rm.ts
var REASON_RM_RF = "rm -rf outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.", REASON_RM_RF_DYNAMIC_TARGET = "rm -rf target contains shell variables that cannot be verified safely. Use literal paths within cwd, /tmp, /var/tmp, or $TMPDIR.", REASON_RM_RF_ROOT_HOME = "rm -rf targeting root or home directory is extremely dangerous and always blocked.", REASON_RM_HOME_CWD = "rm -rf in home directory is dangerous. Change to a project directory first.";
function analyzeRmMatch(tokens, options2 = {}) {
  let ctx = createRecursiveDeleteTargetContext(options2);
  if (!hasRecursiveForceFlags(tokens))
    return null;
  let targets = extractTargets(tokens);
  for (let target of targets) {
    let classification = classifyRecursiveDeleteTarget(target, ctx), reason = reasonForClassification(classification, ctx);
    if (reason)
      return reason;
  }
  return null;
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
      targets.push(token);
      continue;
    }
    if (!token.startsWith("-"))
      targets.push(token);
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
      if (ctx.paranoid)
        return destructiveCommandMatch("rm.recursive-force-paranoid", `${REASON_RM_RF} (${ENV_FLAGS.paranoidRm.name} enabled)`);
      return null;
    case "outside_anchored_cwd":
      return destructiveCommandMatch("rm.recursive-force-outside-cwd", REASON_RM_RF);
  }
}

// src/core/analyze/shell-wrappers.ts
function extractDashCArg(tokens) {
  for (let i = 1;i < tokens.length; i++) {
    let token = tokens[i];
    if (!token)
      continue;
    if (token === "-c")
      return getCommandStringAfterDashC(tokens, i, !0);
    if (token.startsWith("-") && token.includes("c") && !token.startsWith("--"))
      return getCommandStringAfterDashC(tokens, i, !1);
  }
  return null;
}
function getCommandStringAfterDashC(tokens, dashCIndex, allowDashCommand) {
  if (tokens[dashCIndex + 1] === "--")
    return tokens[dashCIndex + 2] || null;
  let commandString = tokens[dashCIndex + 1];
  if (!commandString || !allowDashCommand && commandString.startsWith("-"))
    return null;
  return commandString;
}

// src/core/git/worktree.ts
import { existsSync as existsSync6, lstatSync as lstatSync2, readFileSync as readFileSync6, realpathSync as realpathSync5, statSync } from "node:fs";
import { dirname as dirname6, isAbsolute as isAbsolute4, join as join5, resolve as resolve4 } from "node:path";
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
    gitCwd = realpathSync5(resolve4(cwd));
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
    let firstLine = readFileSync6(dotGitPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine.startsWith("gitdir:"))
      return !1;
    let rawGitDir = firstLine.slice(7).trim();
    if (rawGitDir === "")
      return !1;
    let gitDir = isAbsolute4(rawGitDir) ? rawGitDir : resolve4(dirname6(dotGitPath), rawGitDir);
    if (!existsSync6(join5(gitDir, "commondir")))
      return !1;
    if (!worktreeGitdirBacklinkMatches(gitDir, dotGitPath))
      return !1;
    return worktreeConfigMatchesRoot(gitDir, dirname6(dotGitPath));
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
  let backlinkPath = join5(gitDir, "gitdir");
  if (!existsSync6(backlinkPath))
    return null;
  let rawBacklink = readFileSync6(backlinkPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
  return rawBacklink === "" ? null : rawBacklink;
}
function readWorktreeConfigWorktree(gitDir) {
  let configWorktreePath = join5(gitDir, "config.worktree");
  return existsSync6(configWorktreePath) ? readCoreWorktree(configWorktreePath) : null;
}
function gitDirPathReferenceMatches(gitDir, target, expectedPath) {
  return sameFilesystemPathOrFalse(resolveGitDirPath(gitDir, target), expectedPath);
}
function resolveGitDirPath(gitDir, target) {
  return isAbsolute4(target) ? target : resolve4(gitDir, target);
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
    let leftStat = statSync(left), rightStat = statSync(right);
    if (leftStat.ino !== 0 && rightStat.ino !== 0 && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino)
      return !0;
  } catch {}
  return getCanonicalPathForComparison(left) === getCanonicalPathForComparison(right);
}
function getCanonicalPathForComparison(path) {
  return normalizePathForComparison2(realpathSync5.native(path));
}
function normalizePathForComparison2(path) {
  let normalized = path.replace(/^\\\\\?\\UNC\\/i, "//").replace(/^\\\\\?\\/i, "");
  if (normalized = normalized.replace(/\\/g, "/"), normalized.length > 1 && normalized.endsWith("/"))
    normalized = normalized.slice(0, -1);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function readCoreWorktree(configPath) {
  let content = readFileSync6(configPath, "utf-8"), inCore = !1, configuredWorktree = null;
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
    return statSync(path).isDirectory();
  } catch {
    return !1;
  }
}
function findDotGit(cwd) {
  try {
    return findDotGitInAncestors(realpathSync5(cwd));
  } catch {
    return null;
  }
}
function findDotGitInAncestors(cwd) {
  let current = cwd;
  while (!0) {
    let dotGitPath = join5(current, ".git");
    if (existsSync6(dotGitPath))
      return dotGitPath;
    let parent = dirname6(current);
    if (parent === current)
      return null;
    current = parent;
  }
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
  let configEntries = getGitConfigEntries(tokens, envAssignments);
  if (configEntries.blockedReason)
    return { blockedReason: configEntries.blockedReason, expanded: !1, tokens };
  let aliases = getGitConfigAliases(configEntries.entries);
  if (aliases.size === 0)
    return { blockedReason: null, expanded: !1, tokens };
  let currentTokens = tokens, expanded = !1;
  for (let depth = 0;depth < MAX_GIT_ALIAS_EXPANSION_DEPTH; depth++) {
    let { subcommand, rest } = extractGitSubcommandAndRest(currentTokens), aliasName = subcommand?.toLowerCase();
    if (!aliasName || !aliases.has(aliasName))
      return { blockedReason: null, expanded, tokens: currentTokens };
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
  if (envEntries.blockedReason)
    return envEntries;
  return {
    blockedReason: null,
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
  let parameterEntries = getGitConfigParameterEntries(envAssignments);
  if (parameterEntries === null)
    return { blockedReason: REASON_GIT_ALIAS_CONFIG, entries: [] };
  return {
    blockedReason: null,
    entries: [...parameterEntries, ...getGitConfigCountEntries(envAssignments)]
  };
}
function getGitConfigParameterEntries(envAssignments) {
  let parameters = getEnvConfigValue("GIT_CONFIG_PARAMETERS", envAssignments);
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
  let countValue = getEnvConfigValue("GIT_CONFIG_COUNT", envAssignments);
  if (countValue === void 0)
    return [];
  if (!/^\d+$/.test(countValue))
    return [];
  let count = Number.parseInt(countValue, 10);
  if (!Number.isSafeInteger(count))
    return [];
  let entries = [];
  for (let i = 0;i < count; i++) {
    let key = getEnvConfigValue(`GIT_CONFIG_KEY_${i}`, envAssignments)?.trim(), value = getEnvConfigValue(`GIT_CONFIG_VALUE_${i}`, envAssignments);
    if (!key || value === void 0)
      return [];
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
    value: getEnvConfigValue(configEnv.slice(eqIdx + 1), envAssignments)
  };
}
function getEnvConfigValue(name, envAssignments) {
  return envAssignments?.get(name) ?? process.env[name];
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
]), CHECKOUT_OPTS_WITH_OPTIONAL_VALUE = /* @__PURE__ */ new Set(["--recurse-submodules", "--track", "-t"]), CHECKOUT_SHORT_OPTS_WITH_VALUE = /* @__PURE__ */ new Set(["-b", "-B", "-U"]), SWITCH_SHORT_OPTS_WITH_VALUE = /* @__PURE__ */ new Set(["-c", "-C"]), CHECKOUT_KNOWN_OPTS_NO_VALUE = /* @__PURE__ */ new Set([
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
  let hasStaged = !1;
  for (let token of tokens) {
    if (token === "--help" || token === "--version")
      return null;
    if (token === "--worktree" || token === "-W")
      return destructiveCommandMatch("git.restore-worktree", REASON_RESTORE_WORKTREE);
    if (token === "--staged" || token === "-S")
      hasStaged = !0;
  }
  return hasStaged ? null : destructiveCommandMatch("git.restore-unstaged", REASON_RESTORE);
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
import { existsSync as existsSync7, readFileSync as readFileSync7 } from "node:fs";
import { dirname as dirname7, isAbsolute as isAbsolute5, join as join6, resolve as resolve5 } from "node:path";
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
  if (getEnvConfigValue2("GIT_CONFIG_PARAMETERS", envAssignments) !== void 0)
    return !0;
  let countValue = getEnvConfigValue2("GIT_CONFIG_COUNT", envAssignments);
  if (countValue === void 0)
    return null;
  let count = Number.parseInt(countValue, 10);
  if (!Number.isInteger(count) || count < 0)
    return !0;
  let recursiveSubmoduleConfig = null;
  for (let i = 0;i < count; i++) {
    let key = getEnvConfigValue2(`GIT_CONFIG_KEY_${i}`, envAssignments)?.toLowerCase();
    if (key && isIncludeConfigKey(key))
      return !0;
    if (key !== "submodule.recurse")
      continue;
    let value = getEnvConfigValue2(`GIT_CONFIG_VALUE_${i}`, envAssignments);
    recursiveSubmoduleConfig = value === void 0 || gitConfigValueEnablesRecursiveSubmodules(value);
  }
  return recursiveSubmoduleConfig;
}
function getEnvConfigValue2(name, envAssignments) {
  return envAssignments?.get(name) ?? process.env[name];
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
    if (!existsSync7(configPath))
      continue;
    if (gitConfigFileEnablesRecursiveSubmodules(configPath))
      return !0;
  }
  return !1;
}
function getTrustedGitBinary() {
  for (let gitBinary of TRUSTED_GIT_BINARIES)
    if (existsSync7(gitBinary))
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
  return [join6(commonDir, "config"), join6(gitDir, "config.worktree")];
}
function resolveGitDirFromDotGit(dotGitPath) {
  try {
    let firstLine = readFileSync7(dotGitPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine.startsWith("gitdir:"))
      return dotGitPath;
    let rawGitDir = firstLine.slice(7).trim();
    if (rawGitDir === "")
      return null;
    return isAbsolute5(rawGitDir) ? rawGitDir : resolve5(dirname7(dotGitPath), rawGitDir);
  } catch {
    return null;
  }
}
function resolveCommonGitDir(gitDir) {
  let commonDirPath = join6(gitDir, "commondir");
  if (!existsSync7(commonDirPath))
    return gitDir;
  try {
    let rawCommonDir = readFileSync7(commonDirPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (rawCommonDir === "")
      return null;
    return isAbsolute5(rawCommonDir) ? rawCommonDir : resolve5(gitDir, rawCommonDir);
  } catch {
    return null;
  }
}
function gitConfigFileEnablesRecursiveSubmodules(configPath) {
  let content;
  try {
    content = readFileSync7(configPath, "utf-8");
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
  let value = getEnvConfigValue2(configEnv.slice(eqIdx + 1), envAssignments);
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
  let aliasResolution = resolveGitCommandLineAliases(tokens, options2.envAssignments);
  if (aliasResolution.blockedReason)
    return destructiveCommandMatch("git.alias-config", aliasResolution.blockedReason);
  let analysisTokens = aliasResolution.tokens;
  if ((hasGitSshEnvAssignment(options2.envAssignments) || hasGitCommandLineSshCommandConfig(tokens, options2.envAssignments)) && isGitNetworkOperation(analysisTokens))
    return destructiveCommandMatch("git.ssh-env", REASON_GIT_SSH_ENV);
  let match = analyzeGitRule(analysisTokens);
  if (!match)
    return null;
  if (aliasResolution.expanded)
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
  if (SHELL_WRAPPERS.has(normalizedHead)) {
    let shellDynamicMatch = options2.shellDynamicMatch ?? (options2.shellDynamicReason ? { id: "", reason: options2.shellDynamicReason, intent: "manual_only" } : void 0);
    if (options2.dynamicInput && shellDynamicMatch)
      return filterDestructiveCommandMatch(shellDynamicMatch, context.policy);
    let dashCArg = extractDashCArg(tokens);
    if (dashCArg && context.analyzeNested)
      return context.analyzeNested(dashCArg, {
        effectiveCwd: context.cwd,
        envAssignments: context.envAssignments
      });
    return null;
  }
  if (AWK_INTERPRETERS.has(normalizedHead))
    return filterDestructiveCommandMatch(analyzeAwkSystemCallMatch(tokens, (command2) => context.analyzeNested ? context.analyzeNested(command2, {
      effectiveCwd: context.cwd,
      envAssignments: context.envAssignments
    }) : null), context.policy);
  if (isInterpreterCommand(normalizedHead)) {
    let codeArg = extractInterpreterCodeArg(tokens);
    if (!codeArg)
      return null;
    if (context.paranoidInterpreters)
      return filterDestructiveCommandMatch(destructiveCommandMatch("interpreter.one-liner-paranoid", REASON_INTERPRETER_BLOCKED), context.policy);
    let nestedResult = context.analyzeNested?.(codeArg, {
      effectiveCwd: context.cwd,
      envAssignments: context.envAssignments
    });
    if (nestedResult)
      return nestedResult;
    return containsDangerousCode(codeArg) ? filterDestructiveCommandMatch(destructiveCommandMatch("interpreter.dangerous-command", REASON_INTERPRETER_DANGEROUS), context.policy) : null;
  }
  if (normalizedHead === "rm" && hasRecursiveForceFlags(tokens))
    return filterDestructiveCommandMatch(analyzeRmMatch([...tokens], {
      cwd: context.cwd,
      originalCwd: context.originalCwd,
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar
    }), context.policy) ?? getDynamicRmReason(options2, context);
  if (normalizedHead === "find")
    return filterDestructiveCommandMatch(analyzeFindMatch(tokens, {
      ...context,
      analyzeTokens: (nestedTokens, cwd) => analyzeChildCommandMatch(nestedTokens, { ...context, cwd: cwd ?? void 0 }, options2)
    }), context.policy);
  if (normalizedHead === "git")
    return filterDestructiveCommandMatch(analyzeGitMatch(tokens, {
      cwd: context.cwd,
      envAssignments: context.envAssignments,
      worktreeMode: options2.dynamicInput ? !1 : context.worktreeMode
    }), context.policy);
  return null;
}
function getDynamicRmReason(options2, context) {
  let rmDynamicMatch = options2.rmDynamicMatch ?? (options2.rmDynamicReason ? { id: "", reason: options2.rmDynamicReason, intent: "manual_only" } : void 0);
  return options2.dynamicInput && rmDynamicMatch ? filterDestructiveCommandMatch(rmDynamicMatch, context.policy) : null;
}

// src/core/analyze/child-command.ts
function normalizeChildCommand(tokens, context) {
  let wrapperInfo = stripWrappersWithInfo([...tokens], context.cwd), envAssignments = new Map(context.envAssignments ?? []);
  for (let [k, v] of wrapperInfo.envAssignments)
    envAssignments.set(k, v);
  let childTokens = unwrapTransparentWrappers(wrapperInfo.tokens, context.policy ?? { rules: [], transparentWrappers: [] });
  return {
    tokens: childTokens,
    cwd: wrapperInfo.cwd === null ? void 0 : wrapperInfo.cwd ?? context.cwd,
    wrapperCwd: wrapperInfo.cwd,
    envAssignments,
    head: getBasename(childTokens[0] ?? "").toLowerCase()
  };
}
function stripBusybox(tokens) {
  return getBasename(tokens[0] ?? "").toLowerCase() === "busybox" && tokens.length > 1 ? [...tokens.slice(1)] : [...tokens];
}
function unwrapTransparentWrappers(tokens, policy) {
  let strippedTokens = stripBusybox(tokens), transparentWrapper = unwrapTransparentWrapper(strippedTokens, policy);
  if (!transparentWrapper)
    return strippedTokens;
  return unwrapTransparentWrappers(transparentWrapper.tokens, policy);
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

// src/core/analyze/parallel.ts
var REASON_PARALLEL_RM = "parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.", REASON_PARALLEL_SHELL = "parallel with shell -c can execute arbitrary commands from dynamic input. Run the inner command directly on an explicit file list instead.", REASON_PARALLEL_COMMAND_STREAM = "parallel without a command reads executable commands from dynamic input. Use an explicit command template or ::: arguments instead.", PARALLEL_PLACEHOLDER_RE = /\{[^{}\s]*\}/;
function analyzeParallel(tokens, context) {
  let parseResult = parseParallelCommand(tokens);
  if (!parseResult)
    return null;
  let {
    template,
    args,
    templateHasPlaceholder,
    runsRemotely,
    usesStdin,
    envNames,
    readsCommandsFromInput
  } = parseResult;
  if (readsCommandsFromInput)
    return parallelCommandStreamDynamicReason(context);
  if (template.length === 0) {
    let nestedOverrides2 = buildCommandsModeOverrides(context, runsRemotely);
    for (let arg of args) {
      let reason = context.analyzeNested(arg, nestedOverrides2);
      if (reason)
        return reason;
    }
    return null;
  }
  let childCommand = normalizeChildCommand(template, context), childTokens = childCommand.tokens, dynamicEnvValues = getParallelDynamicEnvValues(envNames, context.envAssignments, childCommand.envAssignments), envHasPlaceholder = dynamicEnvValues.some(hasParallelPlaceholder), hasPlaceholder = templateHasPlaceholder || envHasPlaceholder, hasDynamicStdinPlaceholder = usesStdin && hasPlaceholder, nestedOverrides = buildNestedOverrides(childCommand.envAssignments, childCommand.wrapperCwd, runsRemotely || hasDynamicStdinPlaceholder);
  if (SHELL_WRAPPERS.has(childCommand.head)) {
    let dashCArg = extractDashCArg(childTokens);
    if (dashCArg) {
      if (isOnlyParallelPlaceholder(dashCArg))
        return parallelShellDynamicReason(context);
      if (hasParallelPlaceholder(dashCArg)) {
        if (args.length > 0) {
          for (let arg of args) {
            let expandedScript = replaceParallelPlaceholder(dashCArg, arg), reason3 = context.analyzeNested(expandedScript, nestedOverrides);
            if (reason3)
              return reason3;
          }
          return null;
        }
        let reason2 = context.analyzeNested(dashCArg, nestedOverrides);
        if (reason2)
          return reason2;
        return null;
      }
      let reason = context.analyzeNested(dashCArg, nestedOverrides);
      if (reason)
        return reason;
      let envReason = analyzeParallelDynamicEnvValues(dynamicEnvValues, args, context);
      if (envReason)
        return envReason;
      if (hasPlaceholder)
        return parallelShellDynamicReason(context);
      return null;
    }
    if (args.length > 0)
      return parallelShellDynamicReason(context);
    if (hasPlaceholder)
      return parallelShellDynamicReason(context);
    return null;
  }
  if (childCommand.head === "rm" && hasRecursiveForceFlags(childTokens)) {
    if (templateHasPlaceholder && args.length > 0)
      return analyzeParallelRmExpansions(args.map((arg) => childTokens.map((t) => t.replace(/{}/g, arg))), childCommand.cwd, context);
    if (args.length > 0)
      return analyzeParallelRmExpansions(args.map((arg) => [...childTokens, arg]), childCommand.cwd, context);
    return parallelRmDynamicReason(context);
  }
  let tokenSets = getParallelChildTokenSets(childTokens, templateHasPlaceholder, args);
  for (let tokens2 of tokenSets) {
    let result = analyzeChildCommandMatch(tokens2, {
      cwd: childCommand.cwd,
      originalCwd: context.originalCwd,
      paranoidRm: context.paranoidRm,
      paranoidInterpreters: context.paranoidInterpreters,
      allowTmpdirVar: context.allowTmpdirVar,
      envAssignments: childCommand.envAssignments,
      worktreeMode: runsRemotely || usesStdin || hasPlaceholder ? !1 : context.worktreeMode,
      analyzeNested: context.analyzeNested,
      policy: context.policy
    }, {
      dynamicInput: usesStdin || hasPlaceholder,
      shellDynamicMatch: destructiveCommandMatch("parallel.shell-dynamic", REASON_PARALLEL_SHELL),
      rmDynamicMatch: destructiveCommandMatch("parallel.rm-recursive-force-dynamic", REASON_PARALLEL_RM)
    });
    if (result)
      return result;
  }
  return null;
}
function parallelShellDynamicReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.shell-dynamic", REASON_PARALLEL_SHELL), context.policy);
}
function parallelCommandStreamDynamicReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.command-stream-dynamic", REASON_PARALLEL_COMMAND_STREAM), context.policy);
}
function parallelRmDynamicReason(context) {
  return filterDestructiveCommandMatch(destructiveCommandMatch("parallel.rm-recursive-force-dynamic", REASON_PARALLEL_RM), context.policy);
}
function analyzeParallelRmExpansions(tokenSets, cwd, context) {
  for (let tokens of tokenSets) {
    let rmResult = filterDestructiveCommandMatch(analyzeRmMatch(tokens, {
      cwd,
      originalCwd: context.originalCwd,
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar
    }), context.policy);
    if (rmResult)
      return rmResult;
  }
  return null;
}
function getParallelChildTokenSets(childTokens, hasPlaceholder, args) {
  if (hasPlaceholder && args.length > 0)
    return args.map((arg) => childTokens.map((token) => replaceParallelPlaceholder(token, arg)));
  if (!hasPlaceholder && args.length > 0)
    return args.map((arg) => [...childTokens, arg]);
  return [[...childTokens]];
}
function getParallelDynamicEnvValues(envNames, contextEnvAssignments, childEnvAssignments) {
  return [
    ...envNames.flatMap((name) => {
      let value = childEnvAssignments.get(name) ?? contextEnvAssignments?.get(name);
      return value === void 0 ? [] : [value];
    }),
    ...childEnvAssignments.values()
  ];
}
function analyzeParallelDynamicEnvValues(values, args, context) {
  for (let value of values) {
    if (!hasParallelPlaceholder(value))
      continue;
    let commands = args.length > 0 ? args.map((arg) => replaceParallelPlaceholder(value, arg)) : [value];
    for (let command2 of commands) {
      let reason = context.analyzeNested(command2, {
        envAssignments: context.envAssignments,
        effectiveCwd: context.cwd
      });
      if (reason)
        return reason;
    }
  }
  return null;
}
function buildNestedOverrides(envAssignments, cwd, runsRemotely) {
  let overrides = { envAssignments };
  if (cwd !== void 0)
    overrides.effectiveCwd = cwd;
  if (runsRemotely)
    overrides.worktreeMode = !1;
  return overrides;
}
function buildCommandsModeOverrides(context, runsRemotely) {
  let overrides = {};
  if (context.envAssignments)
    overrides.envAssignments = context.envAssignments;
  if (context.cwd !== void 0)
    overrides.effectiveCwd = context.cwd;
  if (runsRemotely)
    overrides.worktreeMode = !1;
  return Object.keys(overrides).length > 0 ? overrides : void 0;
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
  let parallelOptsWithValue = /* @__PURE__ */ new Set([
    "-a",
    "--arg-file",
    "--colsep",
    "-I",
    "--replace",
    "--results",
    "--result",
    "--res"
  ]), i = 1, templateTokens = [], childCommandTokens = [], markerIndex = -1, runsRemotely = !1, usesPipe = !1, envNames = [];
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
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
  let args = [];
  if (markerIndex !== -1)
    for (let j = markerIndex + 1;j < tokens.length; j++) {
      let token = tokens[j];
      if (token && token !== ":::")
        args.push(token);
    }
  let templateHasPlaceholder = templateTokens.some(hasParallelPlaceholder);
  if (templateTokens.length === 0 && markerIndex === -1)
    return {
      template: [],
      args: [],
      childCommandTokens: [],
      templateHasPlaceholder: !1,
      runsRemotely,
      usesStdin: !0,
      envNames,
      readsCommandsFromInput: !0
    };
  return {
    template: templateTokens,
    args,
    childCommandTokens,
    templateHasPlaceholder,
    runsRemotely,
    usesStdin: usesPipe || markerIndex === -1,
    envNames,
    readsCommandsFromInput: !1
  };
}
function splitParallelEnvNames(value) {
  return (value ?? "").split(",").map((name) => name.trim()).filter(Boolean);
}
function extractParallelChildCommand(tokens) {
  return parseParallelCommand(tokens)?.childCommandTokens ?? [];
}

// src/core/analyze/tmpdir.ts
import { existsSync as existsSync8, lstatSync as lstatSync3, realpathSync as realpathSync6 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { isAbsolute as isAbsolute6, join as join7, normalize as normalize2, parse as parsePath3, sep as sep4 } from "node:path";
var INITIAL_SYSTEM_TMPDIR = tmpdir2(), TEMP_ROOTS = ["/tmp", "/var/tmp", "/private/tmp", "/private/var/tmp"];
function isTmpdirOverriddenToNonTemp(envAssignments) {
  if (!envAssignments.has("TMPDIR"))
    return !1;
  let tmpdirValue = envAssignments.get("TMPDIR") ?? "";
  if (tmpdirValue === "")
    return !0;
  let normalizedTmpdirValue = tryResolveExistingPathComponents(tmpdirValue);
  if (normalizedTmpdirValue === null)
    return !0;
  if (getTrustedTempRoots().some((root) => isPathOrSubpath(normalizedTmpdirValue, root)))
    return !1;
  return !0;
}
function getTrustedTempRoots() {
  let roots = TEMP_ROOTS.map((root) => tryResolveExistingPathComponents(root) ?? normalize2(root)), initialTmpdir = tryResolveExistingPathComponents(INITIAL_SYSTEM_TMPDIR);
  if (!initialTmpdir)
    return roots;
  if (process.platform === "win32")
    return [...roots, initialTmpdir];
  if (process.platform === "darwin" && isMacOSPerUserTempRoot(initialTmpdir))
    return [...roots, initialTmpdir];
  return roots;
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
  if (!isAbsolute6(normalized))
    return normalized;
  let root = parsePath3(normalized).root, components = normalized.slice(root.length).split(/[\\/]+/).filter(Boolean), current = root;
  for (let i = 0;i < components.length; i++) {
    let candidate = join7(current, components[i] ?? "");
    if (!existsSync8(candidate))
      return join7(candidate, ...components.slice(i + 1));
    current = lstatSync3(candidate).isSymbolicLink() ? realpathSync6(candidate) : candidate;
  }
  return current;
}
function isPathOrSubpath(path, basePath) {
  if (path === basePath)
    return !0;
  let baseWithSlash = basePath.endsWith(sep4) ? basePath : `${basePath}${sep4}`;
  return path.startsWith(baseWithSlash);
}

// src/core/analyze/xargs.ts
var REASON_XARGS_RM = "xargs rm -rf with dynamic input is dangerous. Use explicit file list instead.", REASON_XARGS_SHELL = "xargs with shell -c can execute arbitrary commands from dynamic input. Run the inner command directly on an explicit file list instead.", XARGS_APPENDED_INPUT = "__CC_SAFETY_NET_XARGS_INPUT__";
function analyzeXargs(tokens, context) {
  let { childTokens: rawChildTokens, replacementToken } = extractXargsChildCommandWithInfo(tokens), childCommand = normalizeChildCommand(rawChildTokens, context), childTokens = childCommand.tokens, childResult = analyzeChildCommandMatch(childTokens, {
    cwd: childCommand.cwd,
    originalCwd: context.originalCwd,
    paranoidRm: context.paranoidRm,
    paranoidInterpreters: context.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    envAssignments: childCommand.envAssignments,
    worktreeMode: context.worktreeMode,
    analyzeNested: context.analyzeNested,
    policy: context.policy
  }, {
    dynamicInput: childCommand.head !== "git",
    shellDynamicMatch: destructiveCommandMatch("xargs.shell-dynamic", REASON_XARGS_SHELL),
    rmDynamicMatch: destructiveCommandMatch("xargs.rm-recursive-force-dynamic", REASON_XARGS_RM)
  });
  if (childResult)
    return childResult;
  if (childCommand.head !== "git")
    return null;
  let gitTokens = replacementToken === null ? [...childTokens, XARGS_APPENDED_INPUT] : childTokens, hasDynamicReplacement = replacementToken !== null && (childTokens.some((token) => token.includes(replacementToken)) || Array.from(childCommand.envAssignments.values()).some((value) => value.includes(replacementToken)));
  return analyzeChildCommandMatch(gitTokens, {
    cwd: childCommand.cwd,
    originalCwd: context.originalCwd,
    paranoidRm: context.paranoidRm,
    paranoidInterpreters: context.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    envAssignments: childCommand.envAssignments,
    worktreeMode: replacementToken === null || hasDynamicReplacement ? !1 : context.worktreeMode,
    analyzeNested: context.analyzeNested,
    policy: context.policy
  });
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
        i += 2;
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

// src/core/reasons.ts
var REASON_STRICT_UNPARSEABLE = "Command could not be safely analyzed (strict mode). Simplify the command and retry, or ask the user to verify.", REASON_RECURSION_LIMIT = "Command exceeds maximum recursion depth and cannot be safely analyzed. Flatten the nesting and retry.", REASON_SAFETY_NET_FAILED_CLOSED = "CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.";

// src/core/analyze/segment.ts
var REASON_DYNAMIC_EXECUTABLE = "dynamic command name contains shell substitution output and cannot be verified safely. Use a literal executable name.", REASON_DYNAMIC_STRUCTURE = "shell substitution output can change guarded command structure and cannot be verified safely. Use literal subcommands and options.", STRUCTURAL_GIT_SUBCOMMANDS = /* @__PURE__ */ new Set([
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
    cwd: wrapperCwd
  } = stripWrappersWithInfo(strippedEnv, baseCwdForRm), normalizedCommandView = normalizeWrappedCommandView(options2.commandView, tokens.length - strippedEnv.length, strippedEnv.length - stripped.length), normalizedOptions = { ...options2, commandView: normalizedCommandView };
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
  let normalizedHead = normalizeCommandToken(head), basename = getBasename(head), cwdForRm = wrapperCwd === null ? void 0 : wrapperCwd ?? baseCwdForRm, originalCwdForRm = wrapperCwd === null ? void 0 : originalCwd, nestedEffectiveCwd = wrapperCwd === void 0 ? options2.effectiveCwd : wrapperCwd, allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments), dynamicCommandMatch = filterDestructiveCommandMatch(analyzeDynamicCommandStructure(normalizedCommandView), options2.policy);
  if (dynamicCommandMatch)
    return trace?.recordSegment({
      type: "rule-check",
      ruleModule: "analyze/segment.ts",
      ruleFunction: "analyzeDynamicCommandStructure",
      matched: !0,
      reason: dynamicCommandMatch.reason
    }), blockResultFromMatch(dynamicCommandMatch);
  let transparentWrapper = unwrapTransparentWrapper(stripped, options2.policy);
  if (transparentWrapper)
    return trace?.recordSegment({
      type: "transparent-wrapper",
      wrapper: transparentWrapper.wrapper,
      output: transparentWrapper.tokens
    }), analyzeSegment(transparentWrapper.tokens, depth, {
      ...normalizedOptions,
      commandView: normalizedCommandView ? sliceCommandView(normalizedCommandView, transparentWrapper.childIndex) : void 0,
      effectiveCwd: nestedEffectiveCwd,
      envAssignments
    });
  if (isShellWrapperCommand(head, normalizedHead)) {
    let dashCArg = extractDashCArg(stripped);
    if (dashCArg) {
      let traceInnerCommand = unwrapTraceQuotes(dashCArg);
      return trace?.recordSegment({
        type: "shell-wrapper",
        wrapper: normalizedHead,
        innerCommand: traceInnerCommand
      }), trace?.recordSegment({
        type: "recurse",
        reason: "shell-wrapper",
        innerCommand: traceInnerCommand,
        depth: depth + 1
      }), options2.analyzeNested(dashCArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments
      });
    }
  }
  if (AWK_INTERPRETERS.has(normalizedHead)) {
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
    let codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      if (trace?.recordSegment({
        type: "interpreter",
        interpreter: normalizedHead,
        codeArg,
        paranoidBlocked: !!options2.paranoidInterpreters
      }), options2.paranoidInterpreters) {
        let interpreterMatch = destructiveCommandMatch("interpreter.one-liner-paranoid", REASON_INTERPRETER_BLOCKED), match = options2.compatibility === "explain-legacy" ? interpreterMatch : filterDestructiveCommandMatch(interpreterMatch, options2.policy);
        if (match)
          return blockResultFromMatch(match);
      }
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
      if (innerReason)
        return innerReason;
      if (containsDangerousCode(codeArg)) {
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
    return trace?.recordSegment({ type: "busybox", subcommand: stripped[1] ?? "unknown" }), trace?.recordSegment({
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
    basename,
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
  let gitDetail = trace && normalizedHead === "git" ? analyzeGitCommandDetailed(commandContext) : void 0, unfilteredCommandResult = normalizedHead === "git" ? trace ? gitDetail?.match ?? null : analyzeGitCommand(commandContext) : commandAnalyzer?.(commandContext) ?? null, commandResult = options2.compatibility === "explain-legacy" ? unfilteredCommandResult : filterDestructiveCommandMatch(unfilteredCommandResult, options2.policy);
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
        let embeddedMatch = analyzeEmbeddedCommand(commandContext, i), match = options2.compatibility === "explain-legacy" ? embeddedMatch : filterDestructiveCommandMatch(embeddedMatch, options2.policy);
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
function blockResultFromMatch(match) {
  return { reason: match.reason, ruleId: match.id || void 0, intent: match.intent };
}
function analyzeDynamicExecutable(dynamic) {
  return dynamic ? destructiveCommandMatch("shell.dynamic-executable", REASON_DYNAMIC_EXECUTABLE) : null;
}
function analyzeDynamicCommandStructure(command2) {
  return analyzeDynamicExecutable(command2?.dynamicExecutable ?? !1) ?? analyzeDynamicStructure(command2);
}
function analyzeDynamicStructure(command2) {
  if (!command2 || command2.words.length < 2)
    return null;
  let dynamicIndexes = command2.words.flatMap((word, index) => hasCommandSubstitutionPart(word) ? [index] : []);
  if (dynamicIndexes.length === 0)
    return null;
  let head = normalizeCommandToken(command2.words[0]?.text ?? "");
  if (head === "git") {
    let subcommandIndex = findGitSubcommandIndex(command2.analysisTokens);
    if (dynamicIndexes.some((index) => index <= subcommandIndex))
      return destructiveCommandMatch("shell.dynamic-structure", REASON_DYNAMIC_STRUCTURE);
    if (analyzeGitMatch(command2.analysisTokens))
      return null;
    let subcommand = command2.words[subcommandIndex]?.text.toLowerCase(), dataBoundary = command2.analysisTokens.indexOf("--", subcommandIndex + 1);
    if (subcommand && STRUCTURAL_GIT_SUBCOMMANDS.has(subcommand) && dynamicIndexes.some((index) => index > subcommandIndex && (dataBoundary === -1 || index < dataBoundary)))
      return destructiveCommandMatch("shell.dynamic-structure", REASON_DYNAMIC_STRUCTURE);
    return null;
  }
  if (head === "find")
    return hasDynamicFindStructure(command2) ? destructiveCommandMatch("shell.dynamic-structure", REASON_DYNAMIC_STRUCTURE) : null;
  if (head === "xargs")
    return analyzeDynamicChildStructure(command2, extractXargsChildCommandWithInfo(command2.analysisTokens).childTokens, "xargs");
  if (head === "parallel")
    return analyzeDynamicChildStructure(command2, extractParallelChildCommand(command2.analysisTokens), "parallel");
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
function analyzeDynamicChildStructure(command2, childTokens, kind) {
  if (childTokens.length === 0)
    return null;
  let childStart = command2.analysisTokens.length - childTokens.length, childView = normalizeChildCommandView(sliceCommandView(command2, childStart));
  if (childView.dynamicExecutable)
    return destructiveCommandMatch(`${kind}.shell-dynamic`, kind === "xargs" ? REASON_XARGS_SHELL : REASON_PARALLEL_SHELL);
  let nestedStructure = analyzeDynamicStructure(childView);
  if (nestedStructure)
    return nestedStructure;
  if (childView.words[0]?.text === "rm" && childView.words.slice(1).some((word) => hasCommandSubstitutionPart(word) && hasOptionLiteralPart(word)))
    return destructiveCommandMatch(`${kind}.rm-recursive-force-dynamic`, kind === "xargs" ? REASON_XARGS_RM : REASON_PARALLEL_RM);
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
  let token = context.tokens[index];
  if (!token)
    return null;
  let cmd = normalizeCommandToken(token);
  if (isShellWrapperCommand(token, cmd)) {
    let dashCArg = extractDashCArg([token, ...context.tokens.slice(index + 1)]);
    if (!dashCArg)
      return null;
    let result = context.options.analyzeNested(dashCArg, {
      effectiveCwd: context.effectiveCwd,
      envAssignments: context.envAssignments
    });
    return result ? matchFromBlockResult(result) : null;
  }
  let analyzer = COMMAND_ANALYZERS.get(cmd);
  if (!analyzer || cmd === "xargs" || cmd === "parallel")
    return null;
  let embeddedContext = {
    ...context,
    tokens: [cmd, ...context.tokens.slice(index + 1)],
    head: cmd,
    normalizedHead: cmd,
    basename: cmd,
    options: cmd === "git" ? { ...context.options, worktreeMode: !1 } : context.options
  };
  return analyzer(embeddedContext);
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
    worktreeMode: context.options.worktreeMode
  };
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
    policy: context.options.policy
  };
}
var CWD_CHANGE_REGEX = /^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/;
function segmentChangesCwd(segment) {
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
function resolveCwdAfterSegment(segment, cwd) {
  if (!segmentChangesCwd(segment))
    return;
  if (!cwd)
    return null;
  let unwrapped = getCwdChangeTokens(segment, cwd), cdIndex = getCdCommandIndex(unwrapped);
  if (cdIndex === -1 || unwrapped[cdIndex] !== "cd")
    return null;
  let target = unwrapped[cdIndex + 1];
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
    return normalize3(realpathSync7(a)) === normalize3(realpathSync7(b));
  } catch {
    return normalize3(a) === normalize3(b);
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
var TMPDIR_ENV_NAME = "TMPDIR";
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
  let commandInfo = getShellCommandInfo(tokens);
  if (!commandInfo)
    return;
  let { command: command2, commandIndex, leadingAssignments } = commandInfo;
  if (command2 === null) {
    for (let assignment of leadingAssignments.values())
      setShellGitContextAssignment(state, assignment);
    return;
  }
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
  let nextEnvAssignments = null;
  for (let token of tokens) {
    let assignment = parseGitContextEnvAssignment(token);
    if (!assignment)
      continue;
    nextEnvAssignments ??= new Map(state.effectiveEnvAssignments ?? []), nextEnvAssignments.set(assignment.name, assignment.value);
  }
  return nextEnvAssignments ?? state.effectiveEnvAssignments;
}
function getShellCommandInfo(tokens) {
  let leadingAssignments = /* @__PURE__ */ new Map, i = 0;
  while (i < tokens.length) {
    let token = tokens[i];
    if (!token)
      return null;
    let assignment = parseShellAssignment(token);
    if (!assignment)
      break;
    if (isTrackedShellEnvName(assignment.name))
      leadingAssignments.set(assignment.name, assignment);
    i++;
  }
  if (i >= tokens.length)
    return { command: null, commandIndex: i, leadingAssignments };
  let commandIndex = i, command2 = tokens[commandIndex] ?? null;
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
  return { command: command2, commandIndex, leadingAssignments };
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
function parseShellAssignment(token) {
  return parseEnvAssignment(token) ?? parseGitContextAppendEnvAssignment(token);
}
function parseGitContextEnvAssignment(token) {
  let assignment = parseEnvAssignment(token) ?? parseGitContextAppendEnvAssignment(token);
  if (!assignment || !isTrackedShellEnvName(assignment.name))
    return null;
  return assignment;
}
function isTrackedShellEnvName(name) {
  return name === TMPDIR_ENV_NAME || isTrackedGitEnvName(name);
}
function getInitialEffectiveShellEnvAssignments(effectiveEnvAssignments) {
  let inheritedAssignments = [...GIT_SSH_ENV_NAMES, TMPDIR_ENV_NAME].map((name) => {
    let value = process.env[name];
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
  if (state.shellAssignments.set(assignment.name, assignment.value), assignment.name === TMPDIR_ENV_NAME || state.allexport || state.exportedNames.has(assignment.name))
    setEffectiveGitContextAssignment(state, assignment);
}
function setEffectiveGitContextAssignment(state, assignment) {
  let nextEnvAssignments = new Map(state.effectiveEnvAssignments ?? []);
  nextEnvAssignments.set(assignment.name, assignment.value), state.effectiveEnvAssignments = nextEnvAssignments;
}
function addExportedGitContextEnvAssignment(state, token) {
  let assignment = parseGitContextEnvAssignment(token);
  if (assignment) {
    state.shellAssignments.set(assignment.name, assignment.value), state.exportedNames.add(assignment.name), setEffectiveGitContextAssignment(state, assignment);
    return;
  }
  if (isTrackedShellEnvName(token))
    exportTrackedGitContextEnvName(state, token);
}
function addTypesetGitContextEnvAssignment(state, token, exports, readonlyLeadingAssignments) {
  let assignment = parseGitContextEnvAssignment(token);
  if (assignment) {
    if (state.shellAssignments.set(assignment.name, assignment.value), exports)
      state.exportedNames.add(assignment.name), setEffectiveGitContextAssignment(state, assignment);
    else if (assignment.name === TMPDIR_ENV_NAME || state.allexport || state.exportedNames.has(assignment.name))
      setEffectiveGitContextAssignment(state, assignment);
    return;
  }
  let readonlyAssignment = readonlyLeadingAssignments?.get(token);
  if (readonlyAssignment) {
    state.exportedNames.add(token), setEffectiveGitContextAssignment(state, readonlyAssignment);
    return;
  }
  if (exports && isTrackedShellEnvName(token))
    exportTrackedGitContextEnvName(state, token);
}
function exportTrackedGitContextEnvName(state, name) {
  state.exportedNames.add(name), setEffectiveGitContextAssignment(state, {
    name,
    value: state.shellAssignments.get(name) ?? ""
  });
}
function unsetTrackedGitContextEnvName(state, name) {
  if (!isTrackedShellEnvName(name))
    return;
  if (state.shellAssignments.delete(name), state.exportedNames.delete(name), name === TMPDIR_ENV_NAME) {
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
function analyzeCommandInternal(command2, depth, options2, parsedProgram) {
  if (depth >= MAX_RECURSION_DEPTH)
    return options2.trace?.recordSegment({ type: "error", message: REASON_RECURSION_LIMIT }), { reason: REASON_RECURSION_LIMIT, segment: command2, intent: "stop_and_explain" };
  let program = parsedProgram ?? options2.factStore?.getCommandProgram(command2, options2.shell ?? "auto") ?? parseCommand(command2, options2.shell);
  if (depth === 0 && options2.invalidReason && isFailClosedRepairCommand(program))
    return null;
  if (program.status === "limited")
    return options2.trace?.recordSegment({ type: "error", message: REASON_RECURSION_LIMIT }), { reason: REASON_RECURSION_LIMIT, segment: command2, intent: "stop_and_explain" };
  if (program.status === "invalid")
    return recordStrictUnparseable(command2, options2), { reason: REASON_STRICT_UNPARSEABLE, segment: command2, intent: "stop_and_explain" };
  let hasUnclosedQuote = program.issues.some((issue) => issue.code.includes("quote"));
  if (options2.strict && hasUnclosedQuote && command2.includes(" "))
    return recordStrictUnparseable(command2, options2), { reason: REASON_STRICT_UNPARSEABLE, segment: command2, intent: "stop_and_explain" };
  if (hasUnclosedQuote && !options2.analyzePartialProgram)
    return analyzeUnparseableCommand(command2, options2);
  let originalCwd = options2.cwd, effectiveCwd = options2.effectiveCwd !== void 0 ? options2.effectiveCwd : options2.cwd, shellGitContextState = createShellGitContextEnvState(options2.envAssignments);
  return analyzeProgram(program, depth, options2, originalCwd, {
    effectiveCwd,
    shellGitContextState
  });
}
function analyzeProgram(program, depth, options2, originalCwd, state) {
  let hasPipelineInput = !1;
  for (let node of program.nodes) {
    if (node.kind === "connector") {
      hasPipelineInput = node.operator === "|";
      continue;
    }
    if (node.kind === "group") {
      let result2 = analyzeProgram(node.body, depth, options2, originalCwd, node.style === "subshell" ? cloneAnalysisState(state) : state);
      if (result2)
        return result2;
      hasPipelineInput = !1;
      continue;
    }
    if (node.kind !== "command")
      continue;
    let nestedState = cloneAnalysisState(state), nestedResult = analyzeNestedPrograms(node.nested, depth, options2, originalCwd, nestedState);
    if (nestedResult)
      return nestedResult;
    let segmentIndex = options2.trace?.flattenNested ? options2.trace.currentSegmentIndex : options2.trace?.allocateSegment(), result = analyzeCommandView(node, depth, options2.trace ? { ...options2, trace: withTraceSegment(options2.trace, segmentIndex) } : options2, originalCwd, state, hasPipelineInput);
    if (result)
      return result;
    hasPipelineInput = !1;
  }
  return null;
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
function analyzeNestedPrograms(programs, depth, options2, originalCwd, state) {
  for (let program of programs) {
    let result = analyzeProgram(program, depth, options2, originalCwd, cloneAnalysisState(state));
    if (result)
      return result;
  }
  return null;
}
function analyzeCommandView(commandView, depth, options2, originalCwd, state, hasPipelineInput) {
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
    let dangerousTextMatch = dangerousInTextMatch(segment[0]), textMatch = options2.compatibility === "explain-legacy" ? dangerousTextMatch : filterDestructiveCommandMatch(dangerousTextMatch, options2.policy);
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
    return options2.trace?.recordSegment({ type: "dangerous-text", token: segment[0], matched: !1 }), updateCwdAfterSegment(segment, state, options2.trace), null;
  }
  let result = analyzeSegment(segment, depth, {
    ...options2,
    commandView,
    cwd: originalCwd,
    effectiveCwd: state.effectiveCwd,
    envAssignments: segmentEnvAssignments,
    analyzeNested: (nestedCommand, overrides) => {
      let nestedEffectiveCwd = overrides && Object.hasOwn(overrides, "effectiveCwd") ? overrides.effectiveCwd : state.effectiveCwd, nestedResult = analyzeCommandInternal(nestedCommand, depth + 1, {
        ...options2,
        effectiveCwd: nestedEffectiveCwd,
        envAssignments: overrides?.envAssignments ?? segmentEnvAssignments,
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
  return updateCwdAfterSegment(segment, state, options2.trace), applyShellGitContextEnvSegment(segment, state.shellGitContextState), null;
}
function updateCwdAfterSegment(segment, state, trace) {
  let nextCwd = resolveCwdAfterSegment(segment, state.effectiveCwd);
  if (nextCwd === null)
    trace?.recordSegment({
      type: "cwd-change",
      segment: segment.join(" "),
      effectiveCwdNowUnknown: !0
    });
  if (nextCwd !== void 0)
    state.effectiveCwd = nextCwd;
}
function cloneAnalysisState(state) {
  return {
    effectiveCwd: state.effectiveCwd,
    shellGitContextState: cloneShellGitContextEnvState(state.shellGitContextState)
  };
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
    paranoid: options2.paranoidRm,
    allowTmpdirVar: options2.allowTmpdirVar
  };
}
function analyzeUnparseableCommand(command2, options2) {
  let dangerousTextMatch = dangerousInTextMatch(command2), textMatch = options2.compatibility === "explain-legacy" ? dangerousTextMatch : filterDestructiveCommandMatch(dangerousTextMatch, options2.policy), segmentIndex = options2.trace?.currentSegmentIndex ?? options2.trace?.allocateSegment(), step = {
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

// src/core/analyze/with-program.ts
function analyzeCommandWithProgram(command2, options2, program, factStore) {
  let modes = options2.strict !== void 0 && options2.paranoidRm !== void 0 && options2.paranoidInterpreters !== void 0 && options2.worktreeMode !== void 0 ? options2 : getCCSafetyNetEnvModes(options2.policySnapshot.policy);
  return analyzeCommandInternal(command2, 0, {
    ...options2,
    policy: options2.policySnapshot.policy,
    invalidReason: options2.policySnapshot.state === "invalid" ? options2.policySnapshot.reason : void 0,
    strict: options2.strict ?? modes.strict,
    paranoidRm: options2.paranoidRm ?? modes.paranoidRm,
    paranoidInterpreters: options2.paranoidInterpreters ?? modes.paranoidInterpreters,
    worktreeMode: options2.worktreeMode ?? modes.worktreeMode,
    factStore
  }, program);
}

// src/core/policy-protection.ts
import { homedir as homedir4 } from "node:os";
import { dirname as dirname9, isAbsolute as isAbsolute7, join as join9, normalize as normalize4, resolve as resolve6 } from "node:path";

// src/core/path-canonicalization.ts
import { realpathSync as realpathSync8 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { basename, dirname as dirname8, join as join8 } from "node:path";
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
    return realpathSync8(path);
  } catch {
    let parent = dirname8(path);
    if (parent === path)
      return path;
    return join8(resolveExistingPath(parent), basename(path));
  }
}
function getSupportedPathEnvironmentValue(name) {
  if (!SUPPORTED_PATH_ENV_NAMES.has(name))
    return null;
  if (name === "HOME")
    return process.env.HOME ?? homedir3();
  return process.env[name] ?? null;
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
function hasUnclosedQuotes(command2) {
  let state = { inSingle: !1, inDouble: !1, escaped: !1 };
  for (let char of stripShellComments(command2))
    advanceQuoteScanState(char, state);
  return state.inSingle || state.inDouble;
}
function stripShellComments(command2) {
  let result = "", state = { inSingle: !1, inDouble: !1, escaped: !1 }, inComment = !1;
  for (let i = 0;i < command2.length; i++) {
    let char = command2[i];
    if (!char)
      break;
    if (inComment) {
      if (char === `
` || char === "\r")
        result += char, inComment = !1, state.escaped = !1;
      continue;
    }
    if (char === "#" && !state.inSingle && !state.inDouble && startsShellComment(command2, i)) {
      inComment = !0;
      continue;
    }
    result += char, advanceQuoteScanState(char, state);
  }
  return result;
}
function startsShellComment(command2, index) {
  return index === 0 || /\s/.test(command2[index - 1] ?? "");
}
function getCommandTokenText(token) {
  if (typeof token === "string")
    return token;
  if (token && typeof token === "object" && "pattern" in token && typeof token.pattern === "string")
    return token.pattern;
  return null;
}

// src/engine/facts/index.ts
var PATH_LIKE_KEYS = /* @__PURE__ */ new Set([
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
]), GREP_KEYS = /* @__PURE__ */ new Set([...PATH_LIKE_KEYS, "glob"]), GLOB_KEYS = /* @__PURE__ */ new Set([...GREP_KEYS, "pattern"]), REDIRECTS = /* @__PURE__ */ new Set([">", ">>", "<", "<<", "<<<", "<>", ">&", "<&", "&>", "&>>"]), LEGACY_BOUNDARIES = /* @__PURE__ */ new Set(["&&", "||", "|&", "|", "&", ";"]), NEUTRAL_ENV_PROXY = new Proxy({}, { get: (_, name) => ["$", "{", String(name), "}"].join("") }), DEFAULT_PARSERS = {
  parseCommand,
  parseShell: (source, environment) => $parse(source.replace(/\n/g, " ; "), environment)
};
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
      shell: store.getShellSyntax(candidate.source)
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
  let parsers = { ...DEFAULT_PARSERS, ...parserDependencies }, shellFacts = /* @__PURE__ */ new Map, commandPrograms = /* @__PURE__ */ new Map;
  return Object.freeze({
    getShellSyntax: (source) => {
      let existing = shellFacts.get(source);
      if (existing)
        return existing;
      let syntax = parseShellSyntax(source, parsers.parseShell);
      return shellFacts.set(source, syntax), syntax;
    },
    getCommandProgram: (source, dialect) => {
      let key = `${dialect}\x00${source}`, existing = commandPrograms.get(key);
      if (existing)
        return existing;
      let program = parsers.parseCommand(source, dialect);
      return commandPrograms.set(key, program), program;
    }
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

// src/core/policy-protection.ts
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
]), SHELL_SCRIPT_COMMANDS = /* @__PURE__ */ new Set(["bash", "dash", "ksh", "sh", "zsh"]), SCRIPT_ARGUMENT_OPTIONS = /* @__PURE__ */ new Map([
  ["bash", /* @__PURE__ */ new Set(["-c"])],
  ["dash", /* @__PURE__ */ new Set(["-c"])],
  ["ksh", /* @__PURE__ */ new Set(["-c"])],
  ["sh", /* @__PURE__ */ new Set(["-c"])],
  ["zsh", /* @__PURE__ */ new Set(["-c"])],
  ["python", /* @__PURE__ */ new Set(["-c"])],
  ["python3", /* @__PURE__ */ new Set(["-c"])],
  ["node", /* @__PURE__ */ new Set(["-e", "--eval"])],
  ["perl", /* @__PURE__ */ new Set(["-e"])]
]), CLUSTERED_SCRIPT_ARGUMENT_OPTIONS = /* @__PURE__ */ new Map([
  ["bash", /* @__PURE__ */ new Set(["c"])],
  ["dash", /* @__PURE__ */ new Set(["c"])],
  ["ksh", /* @__PURE__ */ new Set(["c"])],
  ["sh", /* @__PURE__ */ new Set(["c"])],
  ["zsh", /* @__PURE__ */ new Set(["c"])],
  ["node", /* @__PURE__ */ new Set(["e"])],
  ["perl", /* @__PURE__ */ new Set(["e"])]
]), POLICY_ENV_PATH_NAMES = /* @__PURE__ */ new Set(["CC_SAFETY_NET_HOME"]);
function findPolicyConfigMutationTargetInSemanticFacts(facts) {
  for (let configCwd of /* @__PURE__ */ new Set([
    facts.invocation.context.configCwd,
    ...facts.invocation.context.policyConfigCwds ?? []
  ])) {
    let target = findPolicyConfigMutationTargetForContext(facts, {
      configCwd,
      executionCwd: facts.invocation.context.executionCwd
    });
    if (target)
      return target;
  }
  return null;
}
function findPolicyConfigMutationTargetForContext(facts, context) {
  if (facts.invocation.route.kind === "patch")
    return findPolicyConfigMutationTargetInPaths(facts.paths.map((path) => path.raw), !1, context);
  let command2 = getCommandSyntaxFact(facts, "input-candidate");
  if (facts.invocation.route.kind === "command")
    return command2 ? findPolicyConfigMutationTargetInCommand(command2.shell, context, /* @__PURE__ */ new Map, facts.store) : null;
  if (facts.invocation.route.kind === "unknown" && command2) {
    let commandTarget = findPolicyConfigMutationTargetInCommand(command2.shell, context, /* @__PURE__ */ new Map, facts.store);
    if (commandTarget)
      return commandTarget;
  }
  return findPolicyConfigMutationTargetInPaths(facts.paths.map((path) => path.raw), facts.invocation.route.kind === "grep" || facts.invocation.route.kind === "glob" || isReadOnlyTool(facts.invocation.toolName), context);
}
function findPolicyConfigMutationTargetInPaths(paths, readOnly, context) {
  let target = paths.find((value) => isPolicyConfigPath(value, context.configCwd, context.executionCwd));
  if (!target)
    return null;
  return readOnly ? null : { target };
}
function findPolicyConfigMutationTargetInCommand(syntax, context, variables = /* @__PURE__ */ new Map, store) {
  if (syntax.status !== "complete")
    return findPolicyConfigTargetInText(syntax.source, context);
  let state = { cwd: context.executionCwd, variables }, segment = [];
  for (let entry of syntax.entries) {
    if (entry.kind === "operator") {
      if (!entry.boundary)
        continue;
      let target = findUnsafePolicyConfigSegmentTarget(segment, state, context.configCwd, store);
      if (target)
        return target;
      state = applyShellState(segment, state), segment = [];
      continue;
    }
    if (entry.kind === "redirection") {
      if (entry.role === "here-data") {
        if (entry.target)
          segment.push(entry.target);
        continue;
      }
      let target = entry.role === "file-write" ? entry.target : void 0;
      if (target && isPolicyConfigPath(expandShellVariables(target, state.variables), context.configCwd, state.cwd))
        return { target: formatShellPolicyTarget(target) };
      continue;
    }
    segment.push(entry.text);
  }
  return findUnsafePolicyConfigSegmentTarget(segment, state, context.configCwd, store);
}
function findUnsafePolicyConfigSegmentTarget(segment, state, configCwd, store) {
  if (isAssignmentOnlySegment(segment))
    return null;
  let scriptTarget = findScriptArgumentPolicyConfigTarget(segment, state, configCwd, store);
  if (scriptTarget)
    return scriptTarget;
  let sedWriteTarget = findSedScriptWritePolicyConfigTarget(segment, state, configCwd);
  if (sedWriteTarget)
    return sedWriteTarget;
  let target = segment.flatMap((token) => extractPolicyConfigPathCandidates(token).map((candidate) => expandShellVariables(candidate, state.variables))).find((token) => isPolicyConfigPath(token, configCwd, state.cwd));
  if (!target)
    return null;
  return isReadOnlySegment(segment) ? null : { target };
}
function findScriptArgumentPolicyConfigTarget(segment, state, configCwd, store) {
  let stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (stripped.length < 3)
    return null;
  let command2 = getBasename(stripped[0] ?? "").toLowerCase();
  if (!SCRIPT_ARGUMENT_OPTIONS.has(command2))
    return null;
  let optionIndex = stripped.findIndex((token) => isScriptArgumentOption(command2, token));
  if (optionIndex === -1)
    return null;
  let script = stripped[optionIndex + 1];
  if (!script)
    return null;
  if (SHELL_SCRIPT_COMMANDS.has(command2))
    return findPolicyConfigMutationTargetInCommand(store.getShellSyntax(script), { configCwd, executionCwd: state.cwd }, state.variables, store);
  let target = extractPolicyConfigPathCandidates(script).flatMap((candidate) => [
    candidate,
    expandShellVariables(candidate, state.variables),
    ...extractConstructedPolicyPathCandidates(script)
  ]).find((candidate) => isPolicyConfigPath(candidate, configCwd, state.cwd));
  return target ? { target } : null;
}
function findSedScriptWritePolicyConfigTarget(segment, state, configCwd) {
  let stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (getBasename(stripped[0] ?? "").toLowerCase() !== "sed")
    return null;
  let target = extractSedScriptArguments(stripped.slice(1)).flatMap((script) => extractSedWritePathCandidates(script)).map((candidate) => expandShellVariables(candidate, state.variables)).find((candidate) => isPolicyConfigPath(candidate, configCwd, state.cwd));
  return target ? { target } : null;
}
function applyShellState(segment, state) {
  let variables = isAssignmentOnlySegment(segment) ? new Map([...state.variables, ...extractShellAssignments(segment, state.variables)]) : state.variables;
  return {
    cwd: getSegmentCwd(segment, { cwd: state.cwd, variables }),
    variables
  };
}
function extractShellAssignments(segment, variables) {
  return segment.flatMap((token) => {
    let assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(token);
    return assignment?.[1] !== void 0 && assignment[2] !== void 0 ? [[assignment[1], expandShellVariables(assignment[2], variables)]] : [];
  });
}
function getSegmentCwd(segment, state) {
  let stripped = stripEnvAssignments(stripWrappers([...segment]));
  if (getBasename(stripped[0] ?? "").toLowerCase() !== "cd")
    return state.cwd;
  let target = stripped[1];
  if (!target || target === "-")
    return state.cwd;
  return normalizeCandidatePath(expandShellVariables(target, state.variables), state.cwd);
}
function extractSedScriptArguments(tokens) {
  let scripts = [];
  for (let i = 0;i < tokens.length; i++) {
    let token = tokens[i];
    if (token === void 0)
      break;
    if (token === "-e" || token === "--expression") {
      let script = tokens[i + 1];
      if (script !== void 0)
        scripts.push(script);
      i++;
      continue;
    }
    let expression = /^--expression=(.*)$/.exec(token);
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
  let stripped = stripEnvAssignments(stripWrappers([...tokens]));
  if (stripped.length === 0)
    return !1;
  let command2 = getBasename(stripped[0] ?? "").toLowerCase();
  if (!READ_ONLY_COMMANDS.has(command2))
    return !1;
  if (command2 !== "sed")
    return !0;
  return !stripped.slice(1).some((token) => token.startsWith("-i") || token === "--in-place" || token.startsWith("--in-place="));
}
function stripEnvAssignments(tokens) {
  let firstCommandIndex = tokens.findIndex((token) => !/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
  return firstCommandIndex === -1 ? [] : [...tokens.slice(firstCommandIndex)];
}
function isAssignmentOnlySegment(tokens) {
  return tokens.length > 0 && tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
}
function isScriptArgumentOption(command2, token) {
  if (SCRIPT_ARGUMENT_OPTIONS.get(command2)?.has(token))
    return !0;
  if (!token.startsWith("-") || token.startsWith("--") || token.length <= 2)
    return !1;
  return CLUSTERED_SCRIPT_ARGUMENT_OPTIONS.get(command2)?.has(token[token.length - 1] ?? "") ?? !1;
}
function isReadOnlyTool(toolName) {
  return READ_ONLY_TOOLS.has(normalizeToolName(toolName));
}
function isPolicyConfigPath(target, configCwd, executionCwd) {
  let normalized = normalizeCandidatePath(target, executionCwd).toLowerCase();
  return getPolicyConfigProtectedPaths(configCwd).some((path) => normalized === normalizeCandidatePath(path, configCwd).toLowerCase());
}
function getPolicyConfigProtectedPaths(cwd) {
  let paths = getPolicyPaths({ cwd });
  return [
    getUserPolicyPath(),
    ...getScopePolicyConfigProtectedPaths(paths.userConfigPath, paths.userLockPath),
    ...getScopePolicyConfigProtectedPaths(paths.projectConfigPath, paths.projectLockPath)
  ];
}
function getScopePolicyConfigProtectedPaths(configPath, lockPath) {
  let configDir = dirname9(configPath), loaded = readRulesConfig(configPath);
  if (!loaded.config)
    return [dirname9(configDir), configDir, configPath, lockPath];
  let configuredSources = new Set(loaded.config.rules);
  return [
    dirname9(configDir),
    configDir,
    configPath,
    lockPath,
    ...loaded.config.rules.filter((source) => !isGitHubRulebookSource(source)).flatMap((source) => [join9(configDir, source), join9(configDir, source, RULEBOOK_FILE)]),
    ...(readLockfile(lockPath).lock?.rulebooks ?? []).filter((entry) => configuredSources.has(entry.spec)).flatMap((entry) => {
      let cachePath = getRulebookCachePath(entry, { cacheConfigDir: configDir });
      return [dirname9(cachePath), cachePath];
    })
  ];
}
function findPolicyConfigTargetInText(text, context) {
  let target = extractPolicyConfigPathCandidates(text).find((candidate) => isPolicyConfigPath(candidate, context.configCwd, context.executionCwd));
  return target ? { target } : null;
}
function formatShellPolicyTarget(target) {
  return target.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "$$$1");
}
function extractPolicyConfigPathCandidates(text) {
  return text.split(/[^A-Za-z0-9_./\\~:$-]+/).flatMap((part) => part.split("=")).filter((part) => part.length > 0);
}
function extractConstructedPolicyPathCandidates(text) {
  let envNames = Array.from(text.matchAll(/(?:process\.env\.|os\.environ\[['"])([A-Za-z_][A-Za-z0-9_]*)/g)).map((match) => match[1]).filter((name) => name !== void 0 && POLICY_ENV_PATH_NAMES.has(name));
  if (envNames.length === 0)
    return [];
  let suffixes = Array.from(text.matchAll(/['"](\/[^'"]+)['"]/g)).map((match) => match[1]).filter((suffix) => suffix !== void 0);
  return envNames.flatMap((name) => suffixes.map((suffix) => `$${name}${suffix}`));
}
function expandShellVariables(text, variables) {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-+])([^}]*)\}/g, (match, name, operator, word) => {
    let value = variables.get(name);
    if (value === void 0)
      return match;
    let isUsable = operator.startsWith(":") ? value !== "" : !0;
    if (operator.endsWith("-"))
      return isUsable ? value : expandShellVariables(word, variables);
    return isUsable ? expandShellVariables(word, variables) : "";
  }).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => variables.get(name) ?? match).replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => variables.get(name) ?? match);
}
function normalizeCandidatePath(target, cwd) {
  let unix = expandSupportedPathEnvironmentVariables(target.trim()).replace(/\\/g, "/");
  if (!unix)
    return "";
  let expanded = unix === "~" ? homedir4() : unix.startsWith("~/") ? resolve6(homedir4(), unix.slice(2)) : unix;
  return resolveExistingPath(normalize4(isAbsolute7(expanded) ? expanded : resolve6(cwd, expanded))).replace(/\\/g, "/");
}

// src/core/secret-protection.ts
import { homedir as homedir5 } from "node:os";
import { isAbsolute as isAbsolute8, resolve as resolve7 } from "node:path";
import { fileURLToPath } from "node:url";
var REASON_SECRET_PROTECTION = "Access to a sensitive path is not allowed.", NON_PATH_OPERAND_COMMANDS = /* @__PURE__ */ new Set(["echo", "printf"]), PATH_ROOT_COMMANDS = /* @__PURE__ */ new Set(["find"]), FIND_EXEC_PRIMARIES2 = /* @__PURE__ */ new Set(["-exec", "-execdir"]), FIND_EXEC_TERMINATORS = /* @__PURE__ */ new Set([";", "+"]), FIND_MATCH_PATH_PRIMARIES = /* @__PURE__ */ new Set([
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
]), CODE_EVAL_FLAGS = /* @__PURE__ */ new Set(["-c", "-e", "-r", "-E", "--eval", "--exec"]), CLUSTERED_CODE_EVAL_FLAGS = /* @__PURE__ */ new Map([
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
  for (let target of targets) {
    if (isDeniedByPolicy(target, cwd, config, configCwd))
      return { target, ruleId: "secret.deny-path" };
    let ruleId = isSensitivePath(target, cwd, config);
    if (ruleId)
      return { target, ruleId };
  }
  return null;
}
function findSensitiveTargetInSemanticFacts(facts, config) {
  return findSensitivePolicyPathTarget(extractToolPathTargets(facts), facts.invocation.context.executionCwd, config, facts.invocation.context.configCwd);
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
  let command2 = basename2(stripped[commandIndex] ?? "").toLowerCase(), post = stripped.slice(commandIndex + 1);
  if (NON_PATH_OPERAND_COMMANDS.has(command2))
    return assignmentValues;
  if (PATTERN_FIRST_COMMANDS.has(command2))
    return [...assignmentValues, ...extractPatternCommandTargets(post)];
  if (PATH_ROOT_COMMANDS.has(command2))
    return [...assignmentValues, ...extractFindCommandTargets(post, store)];
  if (AWK_INTERPRETERS.has(command2))
    return [...assignmentValues, ...extractAwkPathTargets(post, store)];
  if (isCodeInterpreter(command2))
    return [...assignmentValues, ...extractInterpreterPathTargets(command2, post)];
  return [
    ...assignmentValues,
    ...post.flatMap((token) => extractOperandPathCandidates(command2, token))
  ];
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
  let command2 = basename2(stripped[commandIndex] ?? "").toLowerCase();
  if (!NON_PATH_OPERAND_COMMANDS.has(command2))
    return [];
  return stripped.slice(commandIndex + 1);
}
function extractDisplayCommandBodies(tokens) {
  let stripped = stripLeadingWrappersAndEnvAssignments(tokens), commandIndex = stripped.findIndex((token) => !isWrapperToken(token));
  if (commandIndex === -1)
    return [];
  let command2 = basename2(stripped[commandIndex] ?? "").toLowerCase(), args = stripped.slice(commandIndex + 1);
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
  if (commandIndex === -1 || basename2(stripped[commandIndex] ?? "").toLowerCase() !== "xargs")
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
  let command2 = basename2(stripped[commandIndex] ?? "").toLowerCase();
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
    if (entry?.kind !== "word" || basename2(projectSensitiveShellText(entry.text)).toLowerCase() !== "base64")
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
function isSensitivePath(target, cwd, config) {
  let normalized = normalizeCandidatePath2(target, cwd);
  if (!normalized)
    return null;
  let comparableName = comparable(normalized.split("/").pop() ?? ""), comparablePath = comparable(normalized);
  if (isAllowedSensitiveTemplate(comparableName))
    return null;
  for (let rule of SECRET_HOME_PATH_RULES)
    if (matchesHomePathSuffix(comparablePath, rule.suffixParts.join("/")) && isSecretRuleEnabled(rule.id, config))
      return rule.id;
  let codingCliRuleId = matchesCodingCliPath(normalized, cwd, config);
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
function matchesCodingCliPath(normalized, cwd, config) {
  return SECRET_CODING_CLI_RULES.find((rule) => {
    if (!isSecretRuleEnabled(rule.id, config))
      return !1;
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
    return !1;
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
  let root = codingCliRoot(process.env.COPILOT_HOME, "~/.copilot", cwd);
  return matchesFileInRoot(normalized, root, ["config.json"]) || matchesDirInRoot(normalized, root, ["mcp-oauth-config"]);
}
function matchesKimiCodePath(normalized, cwd) {
  let currentRoot = codingCliRoot(process.env.KIMI_CODE_HOME, "~/.kimi-code", cwd), legacyRoot = codingCliRoot(process.env.KIMI_SHARE_DIR, "~/.kimi", cwd);
  return matchesFileInRoot(normalized, currentRoot, ["config.toml", "mcp.json", "server.token"]) || matchesDirInRoot(normalized, currentRoot, ["credentials"]) || matchesFileInRoot(normalized, legacyRoot, ["config.toml", "mcp.json"]) || matchesDirInRoot(normalized, legacyRoot, ["credentials", "mcp-oauth"]);
}
function matchesOpenCodePath(normalized, cwd) {
  let dataRoot = appendPath(codingCliRoot(process.env.XDG_DATA_HOME, "~/.local/share", cwd), "opencode"), configRoot = process.env.OPENCODE_CONFIG_DIR ? codingCliRoot(process.env.OPENCODE_CONFIG_DIR, "~/.config/opencode", cwd) : appendPath(codingCliRoot(process.env.XDG_CONFIG_HOME, "~/.config", cwd), "opencode"), programDataConfig = process.env.ProgramData ? [appendPath(codingCliRoot(process.env.ProgramData, "", cwd), "opencode")] : [];
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
  return path?.trim() ? matchesExactPath(normalized, path, cwd) : !1;
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
function isDeniedByPolicy(target, cwd, config, configCwd) {
  return matchesPolicyPath(target, cwd, config?.denyPaths ?? [], configCwd);
}
function matchesPolicyPath(target, cwd, paths, configCwd) {
  if (paths.length === 0)
    return !1;
  let normalized = comparable(normalizeAbsoluteCandidatePath(target, cwd));
  return paths.some((path) => comparable(normalizeAbsoluteCandidatePath(path, configCwd)) === normalized);
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
function normalizeCandidatePath2(target, cwd) {
  let homeValue = process.env.HOME ?? homedir5(), home = homeValue ? normalizePathText(resolveExistingPath(homeValue)) : "", normalized = normalizePathText(normalizeFileUriPath(expandSupportedPathEnvironmentVariables(target)));
  if (!normalized)
    return "";
  if (!home)
    return normalized;
  let expanded = expandHomePath(normalized, home), absolute = isAbsolute8(expanded) ? expanded : normalizePathText(resolve7(cwd, expanded)), canonicalAbsolute = normalizePathText(resolveExistingPath(absolute));
  if (!isSameOrChildPath(canonicalAbsolute, home)) {
    if (isAbsolute8(expanded))
      return canonicalAbsolute;
    return canonicalAbsolute === absolute ? normalized : canonicalAbsolute;
  }
  let relativeHomePath = canonicalAbsolute.slice(home.length);
  return relativeHomePath ? `~${relativeHomePath}` : "~";
}
function normalizeAbsoluteCandidatePath(target, cwd) {
  let homeValue = process.env.HOME ?? homedir5(), home = homeValue ? normalizePathText(resolveExistingPath(homeValue)) : "", normalized = normalizePathText(normalizeFileUriPath(expandSupportedPathEnvironmentVariables(target)));
  if (!normalized)
    return "";
  let expanded = home ? expandHomePath(normalized, home) : normalized;
  return normalizePathText(resolveExistingPath(isAbsolute8(expanded) ? expanded : resolve7(cwd, expanded)));
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
function basename2(token) {
  return token.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? token;
}

// src/engine/decision-compatibility.ts
function mapLegacyCommandBlock(command2, cwd, result) {
  return {
    decision: {
      kind: "deny",
      reason: result.reason,
      intent: result.manualPermissionAdvice === !1 ? "hard_stop" : result.intent ?? "manual_only",
      ...result.ruleId ? { ruleId: result.ruleId } : {},
      evidence: [{ kind: "command", command: command2, segment: result.segment }]
    },
    audit: {
      decision: "deny",
      command: command2,
      segment: result.segment,
      reason: result.reason,
      cwd,
      ...result.ruleId ? { ruleId: result.ruleId } : {},
      ...result.intent ? { intent: result.intent } : {}
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
  let dependencies = { ...DEFAULT_DEPENDENCIES, ...options2.dependencies }, inputCommand = getCommandFromToolInput(invocation.input), command2 = isCommandInvocation(invocation) ? invocation.command : inputCommand, facts = callDependency("policy-protection", invocation, () => createSemanticFacts(invocation)), policyTarget = callDependency("policy-protection", invocation, () => dependencies.findPolicyMutation(facts));
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
  let snapshot = callDependency("config-load", invocation, () => dependencies.loadPolicySnapshot({
    ...options2.policyOptions,
    cwd: invocation.context.configCwd
  })), policy = snapshot.policy, secretTarget = policy.secretProtection.enabled === !1 ? null : callDependency("secret-protection", invocation, () => dependencies.findSensitiveTarget(facts, policy.secretProtection));
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
      },
      audit: {
        decision: "deny",
        command: displayCommand,
        segment: secretTarget.target,
        reason: REASON_SECRET_PROTECTION,
        cwd: invocation.context.executionCwd,
        ruleId: secretTarget.ruleId,
        intent: "hard_stop"
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
    return failedClosedEvaluation("command-validation", invocation);
  let result = callDependency("command-analysis", invocation, () => {
    let modes = dependencies.getModes(policy);
    return dependencies.analyzeCommand(invocation.command, {
      cwd: invocation.context.executionCwd,
      shell: invocation.route.shell,
      policySnapshot: snapshot,
      strict: modes.strict,
      paranoidRm: modes.paranoidRm,
      paranoidInterpreters: modes.paranoidInterpreters,
      worktreeMode: modes.worktreeMode
    }, getDeclaredCommandProgram(facts), facts.store);
  });
  if (result)
    return blockedCommandEvaluation(invocation, result);
  if (!options2.auditAllowed)
    return { stage: "command-analysis", decision: { kind: "allow" } };
  return {
    stage: "command-analysis",
    decision: { kind: "allow" },
    audit: {
      decision: "allow",
      command: invocation.command,
      segment: invocation.command,
      reason: "allowed",
      cwd: invocation.context.executionCwd
    }
  };
}
function getDeclaredCommandProgram(facts) {
  return getCommandSyntaxFact(facts, "declared-command")?.program;
}
function callDependency(stage, invocation, call) {
  try {
    return call();
  } catch (cause) {
    throw new GuardEvaluationError(stage, failedClosedEvaluation(stage, invocation), cause);
  }
}
function failedClosedEvaluation(stage, invocation) {
  let command2 = isCommandInvocation(invocation) ? invocation.command : getCommandFromToolInput(invocation.input);
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
    ...mapLegacyCommandBlock(command2, invocation.context.executionCwd, result)
  };
}
function isCommandInvocation(invocation) {
  return invocation.route.kind === "command";
}

// src/core/audit.ts
import { appendFileSync, mkdirSync as mkdirSync3 } from "node:fs";
import { homedir as homedir6, userInfo } from "node:os";
import { isAbsolute as isAbsolute9, join as join10 } from "node:path";

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
  let result = text.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "<redacted>").replace(/(['"]?\s*(?:authorization|cookie|x-api-key|api-key)\s*:\s*)([^'"\r\n]+)(['"]?)/gi, "$1<redacted>$3").replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s@/]+)@/gi, "$1<redacted>:<redacted>@").replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+)@/gi, "$1<redacted>@").replace(/(^|\s)((?:-u|--user)(?:\s+|=))([^\s:]+):([^\s]+)/g, "$1$2<redacted>:<redacted>");
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
function writeAuditLog(sessionId, command2, segment, reason, cwd, options2 = {}) {
  let safeSessionId = sanitizeSessionIdForFilename(sessionId);
  if (!safeSessionId)
    return;
  let home = options2.homeDir ?? getAuditLogHomeDir();
  if (!home)
    return;
  let logsDir = getAuditLogsDir(home);
  if (!logsDir)
    return;
  try {
    let ts = (/* @__PURE__ */ new Date()).toISOString(), sessionDir = join10(logsDir, encodeCwdForLogDirname(cwd), ts.slice(0, 7));
    mkdirSync3(sessionDir, { recursive: !0, mode: 448 });
    let logFile = join10(sessionDir, `${ts.slice(0, 10)}-${safeSessionId}.jsonl`), entry = {
      ts,
      sessionId: safeSessionId,
      decision: options2.decision ?? "deny",
      agent: options2.agent,
      command: redactSecrets(command2).slice(0, 300),
      segment: redactSecrets(segment).slice(0, 300),
      reason,
      ruleId: options2.ruleId,
      intent: options2.intent,
      cwd
    };
    appendFileSync(logFile, `${JSON.stringify(entry)}
`, { encoding: "utf-8", mode: 384 });
  } catch {}
}
function getAuditLogHomeDir(homeFromEnv = process.env.CC_SAFETY_NET_AUDIT_HOME || process.env.HOME) {
  let home = homeFromEnv || homedir6() || userInfo().homedir;
  return home && isAbsolute9(home) ? home : null;
}
function getAuditLogsDir(homeDir = getAuditLogHomeDir()) {
  return homeDir ? join10(homeDir, ".cc-safety-net", "logs") : null;
}

// src/core/format.ts
function formatBlockedMessage(input) {
  let { reason, command: command2, segment, toolName } = input, maxLen = input.maxLen ?? 200, redact = input.redact ?? ((t) => t), message = `BLOCKED by CC Safety Net

Reason: ${redact(reason)}`;
  if (input.ruleId)
    message += `

Rule: ${input.ruleId}`;
  if (toolName)
    message += `

Tool: ${toolName}`;
  if (command2) {
    let safeCommand = redact(command2);
    message += `

Command: ${excerpt(safeCommand, maxLen)}`;
  }
  if (segment && segment !== command2) {
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

// src/integrations/denial.ts
function projectGuardDenial(evaluation, options2) {
  if (evaluation.decision.kind !== "deny")
    return;
  let evidence = options2.includeEvidence ? evaluation.decision.evidence.find((item) => item.kind === "command") : void 0;
  return {
    reason: evaluation.decision.reason,
    ruleId: evaluation.decision.ruleId,
    intent: evaluation.decision.intent,
    command: evidence?.command,
    segment: evidence?.segment,
    toolName: options2.toolName
  };
}
function createFailedClosedDenial(options2 = {}) {
  return {
    reason: REASON_SAFETY_NET_FAILED_CLOSED,
    intent: "stop_and_explain",
    command: options2.command,
    segment: options2.segment ?? options2.command,
    toolName: options2.toolName
  };
}
function formatDenial(denial) {
  return formatBlockedMessage({ ...denial, redact: redactSecrets });
}
function formatIntegrationError(cause) {
  return redactSecrets(cause instanceof Error ? cause.message : String(cause));
}

// src/engine/audit.ts
function writeGuardAudit(audit, getSessionId, options2) {
  if (!audit)
    return;
  let sessionId;
  try {
    sessionId = getSessionId();
  } catch {
    return;
  }
  if (!sessionId)
    return;
  writeAuditLog(sessionId, audit.command, audit.segment, audit.reason, audit.cwd, {
    homeDir: options2.homeDir,
    decision: audit.decision,
    agent: options2.agent,
    ruleId: audit.ruleId,
    intent: audit.intent
  });
}

// src/integrations/runtime.ts
function evaluateRuntimeGuard(invocation, options2) {
  let evaluation = evaluateGuard(invocation, options2.guard);
  return writeGuardAudit(evaluation.audit, options2.audit.getSessionId, {
    agent: options2.audit.agent,
    homeDir: options2.audit.homeDir
  }), evaluation;
}

// src/builtin-commands/templates/cc-safety-net.ts
var CC_SAFETY_NET_TEMPLATE = `
## Workflow

Help the user configure custom blocking rules for CC Safety Net.

Use information already provided in the user's prompt. Ask only when the scope, action, rule intent, merge behavior, or target command is unclear.

1. Run \`npx -y cc-safety-net rule doc\` and treat that output as the complete source of truth for schema, paths, GitHub sources, matching behavior, and validation.
2. Determine the requested scope from the prompt when possible:
   - User: applies to all projects.
   - Project: applies only to the current project.
   - GitHub: edits or creates a shareable rulebook structure in the current repository.
3. Determine whether to add a rule, edit a rule, disable a rule, override a reason, migrate legacy rules, or explain custom rules from the prompt when possible.
4. Inspect existing configs before modifying installed local rules:
   - Run \`npx -y cc-safety-net rule verify\`
   - Run \`npx -y cc-safety-net rule list\`
5. Inspect relevant project files only when the user asks for rule suggestions or the requested rule depends on project context. Look at manifests, scripts, task runners, CI, infrastructure, database, migration, and deployment files that explain risky commands.
6. Convert the request into valid CC Safety Net JSON using \`rule doc\`.
   - For User or Project scope, add or edit the selected local \`rule.json\` and \`<rulebook-name>/rulebook.json\`.
   - For GitHub scope, add or edit \`.cc-safety-net/rules/<rulebook-name>/rulebook.json\` in the current repository.
   - Do not offer to add a GitHub source with \`owner/repo\`; installing rules from a GitHub source is outside this workflow.
7. Preserve unrelated existing rulebook sources, overrides, and rulebooks. Preview proposed JSON before writing when creating a new rulebook, merging with existing config, or resolving ambiguity.
8. For GitHub rules, ensure the repository layout is \`.cc-safety-net/rules/<rulebook-name>/rulebook.json\`, and ensure the source name, directory name, and rulebook \`name\` match exactly.
9. Validate after edits:
   - Project rules: run \`npx -y cc-safety-net rule sync\`, \`npx -y cc-safety-net rule verify\`, \`npx -y cc-safety-net rule test\`, and \`npx -y cc-safety-net rule list\`.
   - User rules: run \`npx -y cc-safety-net rule sync --global\`, \`npx -y cc-safety-net rule verify\`, \`npx -y cc-safety-net rule test --global\`, and \`npx -y cc-safety-net rule list\`.
   - Shareable GitHub rulebook-only edits: run \`npx -y cc-safety-net rule verify\` and \`npx -y cc-safety-net rule test <rulebook-name>\`. Run \`sync\` and \`list\` only if the rulebook is also installed in local \`rule.json\`.
10. If validation or tests fail, show the exact errors and make the smallest fix.
11. Confirm the saved paths or GitHub rulebook path and summarize the added or updated rules.

## Rules

- Custom rules can only add restrictions; they cannot bypass built-in CC Safety Net protections.
- Config files list rulebook sources. Rule definitions live in \`rulebook.json\`, not directly in \`rule.json\`.
- Do not use legacy inline \`.safety-net.json\` or \`~/.cc-safety-net/config.json\` rules. Convert existing legacy files with \`npx -y cc-safety-net rule migrate\`.
- Every rule command must be listed in \`allowed_commands\`, and every rule must have at least one blocked fixture.
- Blocked fixtures must specify the expected \`rule\`; include allowed fixtures for close-but-safe commands.
- Local source names are bare names such as \`project-rules\`; do not put filesystem paths in \`rules\`.
- Invalid config, corrupt cache, invalid local rulebooks, or remote rulebook repair failures fail closed until repaired with \`npx -y cc-safety-net rule sync\`.
`;

// src/opencode/builtin-commands/commands.ts
var COMMAND_NAME = "cc-safety-net";
function loadBuiltinCommands(disabledCommands) {
  let disabled = new Set(disabledCommands ?? []), commands = {}, definition = {
    description: "Manage CC Safety Net rulebooks",
    template: CC_SAFETY_NET_TEMPLATE.slice(CC_SAFETY_NET_TEMPLATE.indexOf("## Workflow"))
  };
  if (!disabled.has(COMMAND_NAME))
    commands[COMMAND_NAME] = definition;
  return commands;
}
// src/opencode/plugin.ts
var POWERSHELL_EXECUTABLES = /* @__PURE__ */ new Set(["powershell", "pwsh"]), POSIX_EXECUTABLES = /* @__PURE__ */ new Set(["bash", "dash", "ksh", "sh", "zsh"]);
function createCCSafetyNetPlugin(guardDependencies = {}) {
  return async ({ directory, homeDir }) => {
    let configCwd = resolve8(directory), currentConfig;
    return {
      config: async (opencodeConfig) => {
        currentConfig = opencodeConfig;
        let builtinCommands = loadBuiltinCommands(), existingCommands = opencodeConfig.command ?? {};
        opencodeConfig.command = {
          ...builtinCommands,
          ...existingCommands
        };
      },
      "tool.execute.before": async (input, output) => {
        if (typeof input.tool !== "string" || input.tool.trim() === "")
          throwFailedClosed();
        let toolInput = output.args, shellRoute = resolveOpenCodeShellRoute(currentConfig?.shell), route = getOpenCodeToolRoute(input.tool, shellRoute), executionCwd = resolveOpenCodeExecutionCwd(configCwd, toolInput);
        if (!isUsableDirectory(configCwd) || !executionCwd)
          throwFailedClosed(getCommandFromToolInput(toolInput));
        let context = { configCwd, executionCwd }, invocation = createToolInvocation(input.tool, toolInput, route, context, getCommandFromToolInput(toolInput) ?? null);
        try {
          let evaluation = evaluateRuntimeGuard(invocation, {
            guard: { dependencies: guardDependencies },
            audit: {
              agent: "opencode",
              homeDir,
              getSessionId: () => input.sessionID
            }
          });
          throwGuardDenial(evaluation, evaluation.stage !== "config-state");
        } catch (error) {
          if (!(error instanceof GuardEvaluationError))
            throw error;
          if (error.stage === "policy-protection" || error.stage === "config-load" || error.stage === "secret-protection")
            throw error.cause;
          throwGuardDenial(error.evaluation, !0);
          return;
        }
      }
    };
  };
}
function resolveOpenCodeShellRoute(configuredShell) {
  if (typeof configuredShell !== "string")
    return "auto";
  let executable = configuredShell.trim().split(/[\\/]/).at(-1)?.toLowerCase().replace(/\.exe$/, "");
  if (!executable)
    return "auto";
  if (POWERSHELL_EXECUTABLES.has(executable))
    return "powershell";
  if (POSIX_EXECUTABLES.has(executable))
    return "posix";
  return "auto";
}
function getOpenCodeToolRoute(toolName, shell) {
  if (toolName === "bash")
    return { kind: "command", shell };
  return { kind: getNonCommandToolInputKind(toolName) };
}
function resolveOpenCodeExecutionCwd(configCwd, toolInput) {
  if (!toolInput || typeof toolInput !== "object" || Array.isArray(toolInput))
    return configCwd;
  if (!Object.hasOwn(toolInput, "workdir"))
    return configCwd;
  let workdir = toolInput.workdir;
  if (typeof workdir !== "string" || workdir.trim() === "")
    return null;
  let resolvedWorkdir = process.platform === "win32" ? normalizeOpenCodeWindowsWorkdir(workdir) : workdir;
  if (!resolvedWorkdir)
    return null;
  let executionCwd = resolve8(configCwd, resolvedWorkdir);
  return isUsableDirectory(executionCwd) ? executionCwd : null;
}
function normalizeOpenCodeWindowsWorkdir(workdir) {
  let normalized = workdir.replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`).replace(/^\/([a-zA-Z])(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`).replace(/^\/cygdrive\/([a-zA-Z])(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`).replace(/^\/mnt\/([a-zA-Z])(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`);
  return normalized.startsWith("/") ? null : normalized;
}
function isUsableDirectory(path) {
  try {
    if (!statSync2(path).isDirectory())
      return !1;
    return accessSync(path, constants.R_OK | constants.X_OK), !0;
  } catch {
    return !1;
  }
}
function throwFailedClosed(command2) {
  throwBlocked(createFailedClosedDenial({ command: command2 }));
}
function throwGuardDenial(evaluation, includeEvidence) {
  let denial = projectGuardDenial(evaluation, { includeEvidence });
  if (denial)
    throwBlocked(denial);
}
function throwBlocked(denial) {
  throw Error(formatDenial(denial));
}

// src/index.ts
function resolveOpenCodeShellRoute2(configuredShell) {
  return resolveOpenCodeShellRoute(configuredShell);
}
function normalizeOpenCodeWindowsWorkdir2(workdir) {
  return normalizeOpenCodeWindowsWorkdir(workdir);
}
var CCSafetyNetPlugin = createCCSafetyNetPlugin();
export {
  resolveOpenCodeShellRoute2 as resolveOpenCodeShellRoute,
  normalizeOpenCodeWindowsWorkdir2 as normalizeOpenCodeWindowsWorkdir,
  CCSafetyNetPlugin
};
