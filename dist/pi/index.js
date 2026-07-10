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

// src/pi/builtin-commands/commands.ts
var COMMAND_NAME = "cc-safety-net";
var COMMAND_DESCRIPTION = "Manage CC Safety Net rulebooks";
var DEFAULT_USER_REQUEST = "Help me configure CC Safety Net.";
function registerBuiltinCommands(pi) {
  pi.registerCommand(COMMAND_NAME, {
    description: COMMAND_DESCRIPTION,
    handler: async (args, ctx) => {
      pi.sendUserMessage(buildSafetyNetCommandPrompt(args), ctx.isIdle() ? undefined : { deliverAs: "followUp" });
    }
  });
}
function buildSafetyNetCommandPrompt(args) {
  return `${CC_SAFETY_NET_TEMPLATE.slice(CC_SAFETY_NET_TEMPLATE.indexOf("## Workflow")).trimEnd()}

## User request

${args.trim() || DEFAULT_USER_REQUEST}`;
}
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
import { homedir, tmpdir } from "node:os";
import { normalize, resolve, sep } from "node:path";
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
  return process.env.HOME ?? homedir();
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
    return normalizePathForComparison(realpathSync(resolve(cwd, target))) === normalizePathForComparison(realpathSync(cwd));
  } catch {
    try {
      return normalizePathForComparison(resolve(cwd, target)) === normalizePathForComparison(cwd);
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
      return isResolvedPathWithinCwd(resolve(resolveCwd, target), originalCwd);
    } catch {
      return false;
    }
  }
  if (target.startsWith("../")) {
    return false;
  }
  try {
    return isResolvedPathWithinCwd(resolve(resolveCwd, target), originalCwd);
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
    const commands2 = extractAwkExternalCommands(token);
    if (!commands2)
      continue;
    if (commands2.dynamic)
      return destructiveCommandMatch("awk.system-dynamic", REASON_AWK_SYSTEM_DYNAMIC);
    for (const command of commands2.commands) {
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
  const commands2 = [];
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
      return { dynamic: true, commands: commands2 };
    }
    commands2.push(parsed.value);
    searchIndex = i + 1;
  }
  if (!sawSystem)
    return null;
  return commands2.length > 0 ? { dynamic: false, commands: commands2 } : { dynamic: true, commands: commands2 };
}
function extractAwkPipeCommands(code) {
  const commands2 = [];
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
        commands2.push(command);
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
      commands2.push(parsed.value);
      i = parsed.endIndex;
      continue;
    }
    i++;
  }
  if (!sawPipeCommand)
    return null;
  return { dynamic, commands: commands2 };
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
import { isAbsolute as isAbsolute2, parse as parsePath2 } from "node:path";

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
import { dirname, isAbsolute, parse as parsePath, sep as sep2 } from "node:path";
function resolveChdirTarget(baseCwd, target) {
  const root = isAbsolute(target) ? getPathRoot(target) : "";
  let current = root || baseCwd;
  for (const component of getPathComponents(root ? target.slice(root.length) : target)) {
    if (component === "" || component === ".") {
      continue;
    }
    if (component === "..") {
      current = dirname(current);
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
    if (!cwd && !isAbsolute2(target)) {
      return null;
    }
    const baseCwd = isAbsolute2(target) ? getPathRoot2(target) : realpathSync3(cwd ?? "/");
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
import { existsSync, lstatSync as lstatSync2, readFileSync, realpathSync as realpathSync4, statSync } from "node:fs";
import { dirname as dirname2, isAbsolute as isAbsolute3, join, resolve as resolve2 } from "node:path";
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
    gitCwd = realpathSync4(resolve2(cwd));
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
    const content = readFileSync(dotGitPath, "utf-8");
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine.startsWith("gitdir:")) {
      return false;
    }
    const rawGitDir = firstLine.slice("gitdir:".length).trim();
    if (rawGitDir === "") {
      return false;
    }
    const gitDir = isAbsolute3(rawGitDir) ? rawGitDir : resolve2(dirname2(dotGitPath), rawGitDir);
    if (!existsSync(join(gitDir, "commondir"))) {
      return false;
    }
    if (!worktreeGitdirBacklinkMatches(gitDir, dotGitPath)) {
      return false;
    }
    return worktreeConfigMatchesRoot(gitDir, dirname2(dotGitPath));
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
  const backlinkPath = join(gitDir, "gitdir");
  if (!existsSync(backlinkPath))
    return null;
  const rawBacklink = readFileSync(backlinkPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
  return rawBacklink === "" ? null : rawBacklink;
}
function readWorktreeConfigWorktree(gitDir) {
  const configWorktreePath = join(gitDir, "config.worktree");
  return existsSync(configWorktreePath) ? readCoreWorktree(configWorktreePath) : null;
}
function gitDirPathReferenceMatches(gitDir, target, expectedPath) {
  return sameFilesystemPathOrFalse(resolveGitDirPath(gitDir, target), expectedPath);
}
function resolveGitDirPath(gitDir, target) {
  return isAbsolute3(target) ? target : resolve2(gitDir, target);
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
  const content = readFileSync(configPath, "utf-8");
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
    const dotGitPath = join(current, ".git");
    if (existsSync(dotGitPath)) {
      return dotGitPath;
    }
    const parent = dirname2(current);
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
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname3, isAbsolute as isAbsolute4, join as join2, resolve as resolve3 } from "node:path";
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
  return [join2(commonDir, "config"), join2(gitDir, "config.worktree")];
}
function resolveGitDirFromDotGit(dotGitPath) {
  try {
    const content = readFileSync2(dotGitPath, "utf-8");
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine.startsWith("gitdir:")) {
      return dotGitPath;
    }
    const rawGitDir = firstLine.slice("gitdir:".length).trim();
    if (rawGitDir === "") {
      return null;
    }
    return isAbsolute4(rawGitDir) ? rawGitDir : resolve3(dirname3(dotGitPath), rawGitDir);
  } catch {
    return null;
  }
}
function resolveCommonGitDir(gitDir) {
  const commonDirPath = join2(gitDir, "commondir");
  if (!existsSync2(commonDirPath)) {
    return gitDir;
  }
  try {
    const rawCommonDir = readFileSync2(commonDirPath, "utf-8").split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (rawCommonDir === "") {
      return null;
    }
    return isAbsolute4(rawCommonDir) ? rawCommonDir : resolve3(gitDir, rawCommonDir);
  } catch {
    return null;
  }
}
function gitConfigFileEnablesRecursiveSubmodules(configPath) {
  let content;
  try {
    content = readFileSync2(configPath, "utf-8");
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
  const basename = getBasename(token);
  const normalized = normalizeCommandToken(token);
  return normalized === "git" || basename === "busybox" || BUILTIN_ANALYZED_COMMANDS.has(basename) || config.transparent_wrappers?.includes(basename) || SHELL_WRAPPERS.has(normalized) || token === "$SHELL" || isInterpreterCommand(normalized) || AWK_INTERPRETERS.has(normalized) || config.rules.some((rule) => rule.command === basename);
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
    const commands2 = args.length > 0 ? args.map((arg) => replaceParallelPlaceholder(value, arg)) : [value];
    for (const command2 of commands2) {
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
import { isAbsolute as isAbsolute5, join as join3, normalize as normalize2, parse as parsePath3, sep as sep3 } from "node:path";
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
  if (!isAbsolute5(normalized)) {
    return normalized;
  }
  const root = parsePath3(normalized).root;
  const components = normalized.slice(root.length).split(/[\\/]+/).filter(Boolean);
  let current = root;
  for (let i = 0;i < components.length; i++) {
    const candidate = join3(current, components[i] ?? "");
    if (!existsSync3(candidate)) {
      return join3(candidate, ...components.slice(i + 1));
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
  const basename = getBasename(head);
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
    basename,
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
import { existsSync as existsSync10, readFileSync as readFileSync9 } from "node:fs";
import { resolve as resolve7 } from "node:path";

// src/core/policy.ts
import { chmodSync, existsSync as existsSync5, mkdirSync as mkdirSync2, readFileSync as readFileSync4 } from "node:fs";
import { dirname as dirname6, join as join5 } from "node:path";

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
import { existsSync as existsSync4, mkdirSync, readFileSync as readFileSync3, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname as dirname5 } from "node:path";

// src/core/rules/policy/paths.ts
import { homedir as homedir2 } from "node:os";
import { dirname as dirname4, join as join4, resolve as resolve4 } from "node:path";
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
  return resolve4(cwd ?? process.cwd(), RULES_DIR);
}
function getProjectRulesConfigPath(cwd) {
  return join4(getProjectRulesDir(cwd), RULES_CONFIG_FILE);
}
function getUserRulesDir(options2) {
  return options2?.userConfigDir ?? (options2?.userConfigPath ? dirname4(options2.userConfigPath) : join4(getUserSafetyNetHome(), RULES_SUBDIR));
}
function getUserSafetyNetHome() {
  const home = process.env[CC_SAFETY_NET_HOME];
  return home ? resolve4(home) : join4(homedir2(), SAFETY_NET_DIR);
}
function getUserRulesConfigPath(options2) {
  return join4(getUserRulesDir(options2), RULES_CONFIG_FILE);
}
function getUserRulesLockPath(options2) {
  return join4(getUserRulesDir(options2), RULES_LOCK_FILE);
}
function getRulesLockPathForConfigPath(configPath) {
  return join4(dirname4(configPath), RULES_LOCK_FILE);
}
function getLegacyUserRulesConfigPath(options2 = {}) {
  return join4(dirname4(getUserRulesDir(options2)), LEGACY_RULES_CONFIG_FILE);
}
function getLegacyProjectRulesConfigPath(options2 = {}) {
  return resolve4(options2.cwd ?? process.cwd(), ".safety-net.json");
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
    configDir: dirname4(configPath),
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
  return join4(getRulesCacheDir(options2), "rulebooks", `${getRulebookCacheSlug(entry)}--${digestHex.slice(0, 12)}`, RULEBOOK_FILE);
}
function getRulebookCacheSlug(entry) {
  const source = entry.kind === "github" && entry.display_ref ? `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}` : entry.spec;
  return source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "rulebook";
}
function getRepositoryRulebookPath(name) {
  return `${RULES_DIR}/${name}/${RULEBOOK_FILE}`;
}
function getRulesCacheDir(options2) {
  return join4(dirname4(options2?.cacheConfigDir ?? getUserRulesDir(options2)), CACHE_SUBDIR);
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
    const content = readFileSync3(path, "utf-8");
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
  mkdirSync(dirname5(path), { recursive: true });
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
  return join5(dirname6(getUserRulesDir(options2)), POLICY_FILE);
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
  const raw = readFileSync4(path, "utf-8");
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
  mkdirSync2(dirname6(path), { recursive: true, mode: 448 });
  writeJsonAtomic(path, normalizedPolicy, 384);
  chmodSync(path, 384);
  return { path, policy: normalizedPolicy, errors: [] };
}
function repairUserPolicyForGui(options2 = {}) {
  const path = getUserPolicyPath(options2);
  if (!existsSync5(path))
    return writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options2);
  const raw = readFileSync4(path, "utf-8");
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
    const content = readFileSync4(path, "utf-8");
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
import { existsSync as existsSync8, readFileSync as readFileSync7, realpathSync as realpathSync7 } from "node:fs";
import { dirname as dirname7, isAbsolute as isAbsolute6, join as join7, relative, resolve as resolve5, sep as sep4 } from "node:path";

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
function validateAllowedCommands(commands2, errors) {
  const seen = new Set;
  for (let i = 0;i < commands2.length; i++) {
    const command2 = commands2[i];
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
import { existsSync as existsSync6, readFileSync as readFileSync5 } from "node:fs";
var SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
var RULEBOOK_SOURCE_KINDS = new Set(["local-directory", "github"]);
function readLockfile(path) {
  if (!existsSync6(path)) {
    return { lock: null, errors: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync5(path, "utf-8"));
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
import { existsSync as existsSync7, readFileSync as readFileSync6 } from "node:fs";
import { join as join6 } from "node:path";
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
  const content = readFileSync6(path, "utf-8");
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
    const content = readFileSync6(cachePath, "utf-8");
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
  return join6(configDir, name, RULEBOOK_FILE);
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
  const userPolicy = user.config ? loadScopePolicy(user.config, paths.userLockPath, dirname7(paths.userConfigPath), options2, "user") : emptyScopePolicy();
  const projectPolicy = project.config ? loadScopePolicy(project.config, paths.projectLockPath, dirname7(paths.projectConfigPath), options2, "project") : emptyScopePolicy();
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
    scope: loadScopePolicy(config, lockPath, dirname7(configPath), options2, "project")
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
    cacheContent = readFileSync7(cachePath, "utf-8");
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
    const sourcePath = resolve5(configDir, entry.path);
    const sourceRelative = relative(resolve5(configDir), sourcePath);
    if (sourceRelative === ".." || sourceRelative.startsWith(`..${sep4}`) || isAbsolute6(sourceRelative)) {
      errors.push(`lockfile local source path for ${entry.spec} must stay within ${configDir}; run ${RULE_SYNC_COMMAND}`);
      return { rulebook: null, errors };
    }
    const localPath = join7(sourcePath, RULEBOOK_FILE);
    if (!existsSync8(localPath)) {
      errors.push(`missing local source for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
    } else {
      try {
        const localContent = readFileSync7(localPath, "utf-8");
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
  if (resolve5(userConfigPath) === resolve5(projectConfigPath)) {
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
    const parsed = JSON.parse(readFileSync7(legacyPath, "utf-8"));
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
  return config.rules.some((source) => getRulebookMigratedFrom(dirname7(configPath), source) === migratedFrom);
}
function getRulebookMigratedFrom(configDir, source) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(source))
    return null;
  const path = join7(configDir, source, RULEBOOK_FILE);
  if (!existsSync8(path))
    return null;
  try {
    const rulebook = JSON.parse(readFileSync7(path, "utf-8"));
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
  mkdirSync as mkdirSync3,
  readdirSync,
  readFileSync as readFileSync8,
  rmdirSync,
  rmSync as rmSync2,
  unlinkSync,
  writeFileSync as writeFileSync2
} from "node:fs";
import { dirname as dirname8, isAbsolute as isAbsolute7, join as join8, relative as relative2, resolve as resolve6, sep as sep5 } from "node:path";
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
  mkdirSync3(scope.configDir, { recursive: true });
  const before = existsSync9(scope.configPath) ? readFileSync8(scope.configPath, "utf-8") : null;
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
  const before = readFileSync8(scope.configPath, "utf-8");
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
  mkdirSync3(dirname8(path), { recursive: true });
  writeFileSync2(path, content, "utf-8");
}
function pruneUnreferencedRulebookCaches(entries, configDir, options2) {
  const internalOptions = options2;
  const cacheRoot = join8(dirname8(configDir), "cache", "rulebooks");
  if (!existsSync9(cacheRoot))
    return [];
  const keep = new Set(entries.map((entry) => dirname8(getRulebookCachePath(entry, { ...options2, cacheConfigDir: configDir }))));
  return readdirSync(cacheRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const path = join8(cacheRoot, entry.name);
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
    return join8(configDir, entry?.kind === "local-directory" ? entry.path : spec);
  });
  const dirErrors = errors.length > 0 ? [] : dirs.flatMap((dir) => getLocalSourceDirDeleteError(configDir, dir));
  const allErrors = [...errors, ...dirErrors];
  return allErrors.length > 0 ? { ok: false, result: { ok: false, errors: allErrors, warnings: [], entries: [] } } : { ok: true, dirs };
}
function getLocalSourceDirDeleteError(configDir, dir) {
  const resolvedConfigDir = resolve6(configDir);
  const resolvedDir = resolve6(dir);
  const relativeDir = relative2(resolvedConfigDir, resolvedDir);
  if (relativeDir === "" || relativeDir === ".." || relativeDir.startsWith(`..${sep5}`) || isAbsolute7(relativeDir)) {
    return [`Refusing to delete local rulebook source outside ${configDir}: ${dir}`];
  }
  if (!existsSync9(resolvedDir))
    return [`Local rulebook source directory not found: ${dir}`];
  if (!lstatSync4(resolvedDir).isDirectory()) {
    return [`Local rulebook source is not a directory: ${dir}`];
  }
  const entries = readdirSync(resolvedDir);
  if (!entries.includes("rulebook.json")) {
    return [`Local rulebook source directory is missing rulebook.json: ${dir}`];
  }
  if (!lstatSync4(join8(resolvedDir, "rulebook.json")).isFile()) {
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
  unlinkSync(join8(dir, "rulebook.json"));
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
    const content = readFileSync9(path, "utf-8");
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
  return resolve7(cwd ?? process.cwd(), ".safety-net.json");
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

// src/core/audit.ts
import { appendFileSync, mkdirSync as mkdirSync4 } from "node:fs";
import { homedir as homedir3, userInfo } from "node:os";
import { isAbsolute as isAbsolute8, join as join9 } from "node:path";
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
function writeAuditLog(sessionId, command2, segment, reason, cwd, options2 = {}) {
  const safeSessionId = sanitizeSessionIdForFilename(sessionId);
  if (!safeSessionId) {
    return;
  }
  const home = options2.homeDir ?? getAuditLogHomeDir();
  if (!home) {
    return;
  }
  const logsDir = getAuditLogsDir(home);
  if (!logsDir) {
    return;
  }
  try {
    const ts = new Date().toISOString();
    const sessionDir = join9(logsDir, encodeCwdForLogDirname(cwd), ts.slice(0, 7));
    mkdirSync4(sessionDir, { recursive: true, mode: 448 });
    const logFile = join9(sessionDir, `${ts.slice(0, 10)}-${safeSessionId}.jsonl`);
    const entry = {
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
  const home = homeFromEnv || homedir3() || userInfo().homedir;
  return home && isAbsolute8(home) ? home : null;
}
function getAuditLogsDir(homeDir = getAuditLogHomeDir()) {
  return homeDir ? join9(homeDir, ".cc-safety-net", "logs") : null;
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

// src/core/cwd-containment.ts
import { realpathSync as realpathSync8, statSync as statSync2 } from "node:fs";
import { isAbsolute as isAbsolute9, relative as relative3, resolve as resolve8 } from "node:path";
function resolveContainedCwd(requestedCwd, trustedRoots) {
  const roots = trustedRoots.flatMap((root) => canonicalDirectory(root));
  if (!roots[0])
    return;
  const requested = canonicalDirectory(isAbsolute9(requestedCwd) ? requestedCwd : resolve8(roots[0], requestedCwd))[0];
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
import { dirname as dirname10, isAbsolute as isAbsolute10, join as join11, normalize as normalize4, resolve as resolve9 } from "node:path";

// src/core/path-canonicalization.ts
import { realpathSync as realpathSync9 } from "node:fs";
import { homedir as homedir4 } from "node:os";
import { basename, dirname as dirname9, join as join10 } from "node:path";
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
    const parent = dirname9(path);
    if (parent === path)
      return path;
    return join10(resolveExistingPath(parent), basename(path));
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
  const configDir = dirname10(configPath);
  const loaded = readRulesConfig(configPath);
  if (!loaded.config)
    return [dirname10(configDir), configDir, configPath, lockPath];
  const configuredSources = new Set(loaded.config.rules);
  return [
    dirname10(configDir),
    configDir,
    configPath,
    lockPath,
    ...loaded.config.rules.filter((source) => !isGitHubRulebookSource(source)).flatMap((source) => [join11(configDir, source), join11(configDir, source, RULEBOOK_FILE)]),
    ...(readLockfile(lockPath).lock?.rulebooks ?? []).filter((entry) => configuredSources.has(entry.spec)).flatMap((entry) => {
      const cachePath = getRulebookCachePath(entry, { cacheConfigDir: configDir });
      return [dirname10(cachePath), cachePath];
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
  const expanded = unix === "~" ? homedir5() : unix.startsWith("~/") ? resolve9(homedir5(), unix.slice(2)) : unix;
  return resolveExistingPath(normalize4(isAbsolute10(expanded) ? expanded : resolve9(cwd, expanded))).replace(/\\/g, "/");
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
import { isAbsolute as isAbsolute11, resolve as resolve10 } from "node:path";
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
  const command2 = basename2(stripped[commandIndex] ?? "").toLowerCase();
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
  const command2 = basename2(stripped[commandIndex] ?? "").toLowerCase();
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
  const command2 = basename2(stripped[commandIndex] ?? "").toLowerCase();
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
  if (commandIndex === -1 || basename2(stripped[commandIndex] ?? "").toLowerCase() !== "xargs") {
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
  const command2 = basename2(stripped[commandIndex] ?? "").toLowerCase();
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
    if (token === null || basename2(token).toLowerCase() !== "base64") {
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
  const absolute = isAbsolute11(expanded) ? expanded : normalizePathText(resolve10(cwd, expanded));
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
  return normalizePathText(resolveExistingPath(isAbsolute11(expanded) ? expanded : resolve10(cwd, expanded)));
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
function basename2(token) {
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

// src/pi/tool-call.ts
var PI_COMMAND_TOOL_ADAPTERS = new Map([
  ["bash", { commandField: "command", shell: "posix" }],
  [
    "Shell",
    {
      commandField: "command",
      cwdField: "working_directory",
      shell: "auto"
    }
  ]
]);
function registerToolCallEvent(pi) {
  pi.on("tool_call", handlePiToolCall);
}
function handlePiToolCall(event, ctx) {
  const toolCall = getPiToolCall(event, ctx);
  if (!toolCall)
    return;
  if ("malformed" in toolCall) {
    return blockPiToolCall(REASON_SAFETY_NET_FAILED_CLOSED, undefined, undefined, undefined, undefined, "stop_and_explain");
  }
  try {
    const policyTarget = findPolicyConfigMutationTargetInToolInput(toolCall.toolName, toolCall.input, toolCall.route, toolCall.context);
    if (policyTarget) {
      return blockPiToolCall(REASON_POLICY_CONFIG_PROTECTION, toolCall.command ?? getCommandFromToolInput(toolCall.input) ?? policyTarget.target, policyTarget.target, false);
    }
    const config = loadConfig(toolCall.context.configCwd, {
      repairLocalRulebooks: true,
      ...ctx.safetyNetConfigOptions
    });
    const secretTarget = config.secretProtection?.enabled === false ? null : findSensitiveTargetInToolInput(toolCall.input, toolCall.route, toolCall.context.executionCwd, config.secretProtection, toolCall.context.configCwd);
    if (secretTarget) {
      const secretCommand = toolCall.command ?? getCommandFromToolInput(toolCall.input) ?? secretTarget.target;
      const sessionId2 = ctx.sessionManager.getSessionFile();
      if (sessionId2) {
        writeAuditLog(sessionId2, secretCommand, secretTarget.target, REASON_SECRET_PROTECTION, toolCall.context.executionCwd, {
          agent: "pi",
          ruleId: secretTarget.ruleId,
          intent: "hard_stop"
        });
      }
      return blockPiToolCall(REASON_SECRET_PROTECTION, secretCommand, secretTarget.target, false, secretTarget.ruleId, "hard_stop");
    }
    if (toolCall.route.kind !== "command" || !toolCall.command) {
      return config.failClosedReason ? blockPiToolCall(config.failClosedReason, undefined, undefined, undefined, undefined, "stop_and_explain") : undefined;
    }
    const modes = getCCSafetyNetEnvModes(config);
    const result = (ctx.safetyNetAnalyzeCommand ?? analyzeCommand)(toolCall.command, {
      cwd: toolCall.context.executionCwd,
      shell: toolCall.route.shell,
      config,
      strict: modes.strict,
      paranoidRm: modes.paranoidRm,
      paranoidInterpreters: modes.paranoidInterpreters,
      worktreeMode: modes.worktreeMode
    });
    if (!result) {
      const sessionId2 = ctx.sessionManager.getSessionFile();
      if (sessionId2 && envTruthy(ENV_FLAGS.debug)) {
        writeAuditLog(sessionId2, toolCall.command, toolCall.command, "allowed", toolCall.context.executionCwd, {
          decision: "allow",
          agent: "pi"
        });
      }
      return;
    }
    const sessionId = ctx.sessionManager.getSessionFile();
    if (sessionId) {
      writeAuditLog(sessionId, toolCall.command, result.segment, result.reason, toolCall.context.executionCwd, {
        agent: "pi",
        ruleId: result.ruleId,
        intent: result.intent
      });
    }
    return blockPiToolCall(result.reason, toolCall.command, result.segment, result.manualPermissionAdvice, result.ruleId, result.intent);
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug)) {
      console.error(`CC Safety Net debug: pi tool_call analysis failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`);
    }
    const command2 = toolCall.command;
    return blockPiToolCall(REASON_SAFETY_NET_FAILED_CLOSED, command2, command2, undefined, undefined, "stop_and_explain");
  }
}
function getPiToolCall(event, ctx) {
  if (!event || typeof event !== "object")
    return;
  const toolCall = event;
  if (toolCall.type !== undefined && toolCall.type !== "tool_call")
    return;
  if (typeof toolCall.toolName !== "string" || toolCall.toolName.trim() === "") {
    return { malformed: true };
  }
  const validContextCwd = typeof ctx.cwd === "string" && ctx.cwd.trim() !== "" ? resolveContainedCwd(".", [ctx.cwd]) : undefined;
  if (!validContextCwd)
    return { malformed: true };
  const adapter = PI_COMMAND_TOOL_ADAPTERS.get(toolCall.toolName);
  if (!toolCall.input || typeof toolCall.input !== "object") {
    return adapter ? { malformed: true } : undefined;
  }
  if (!adapter) {
    return {
      toolName: toolCall.toolName,
      input: toolCall.input,
      context: { configCwd: ctx.cwd, executionCwd: ctx.cwd },
      route: { kind: getNonCommandToolInputKind(toolCall.toolName) }
    };
  }
  const command2 = toolCall.input[adapter.commandField];
  if (typeof command2 !== "string" || command2.trim() === "")
    return { malformed: true };
  const hasCwdInput = adapter.cwdField && Object.hasOwn(toolCall.input, adapter.cwdField);
  const cwdInput = adapter.cwdField && hasCwdInput ? toolCall.input[adapter.cwdField] : undefined;
  if (hasCwdInput && (typeof cwdInput !== "string" || cwdInput.trim() === "")) {
    return { malformed: true };
  }
  const executionCwd = typeof cwdInput === "string" ? resolveContainedCwd(cwdInput, [ctx.cwd]) : ctx.cwd;
  if (!executionCwd)
    return { malformed: true };
  return {
    toolName: toolCall.toolName,
    input: toolCall.input,
    context: { configCwd: ctx.cwd, executionCwd },
    route: { kind: "command", shell: adapter.shell },
    command: command2
  };
}
function blockPiToolCall(reason, command2, segment, manualPermissionAdvice, ruleId, intent) {
  return {
    block: true,
    reason: formatBlockedMessage({
      reason,
      ruleId,
      intent,
      command: command2,
      segment,
      redact: redactSecrets,
      manualPermissionAdvice
    })
  };
}

// src/pi/index.ts
function ccSafetyNetPiExtension(pi) {
  registerToolCallEvent(pi);
  registerBuiltinCommands(pi);
}
export {
  ccSafetyNetPiExtension as default
};
