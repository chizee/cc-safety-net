#!/usr/bin/env node
import{firstTrustedRoot,isSameOrInsidePath,resolveContainedCwd}from"../chunks/index-74y6tjtc.js";import{$quote,COMMAND_PATTERN,DEFAULT_GUI_POLICY,DESTRUCTIVE_COMMAND_RULE_METADATA,ENV_FLAGS,GuardEvaluationError,NAME_PATTERN,PathCanonicalizationLimitError,PolicyFilesystemError,RULEBOOK_FILE,RULES_DIR,RULE_SOURCE_LIMIT,RULE_SOURCE_LIMIT_ERROR,RULE_SYNC_COMMAND,RULE_SYNC_RESOURCE_LIMITS,SECRET_PROTECTION_RULE_METADATA,ToolInputLimitError,analyzeCommand,analyzeCommandInternal,assertValidRulebook,bindDelegatedPolicyFilesystemTarget,createFailedClosedDenial,createPathCanonicalizationBudget,createPolicyPreview,createPolicySnapshot,createRuleSyncOperation,createSemanticFactStore,createToolInvocation,discoverGitHubRepositoryRulebooks,ensurePolicyDirectory,envFlagIsSet,envTruthy,evaluateRuntimeGuard,extractPatchTargetsFromToolInput,extractPathLikeToolValues,formatDenial,formatIntegrationError,getAuditLogsDir,getCCSafetyNetEnvModes,getCommandFromToolInput,getEnvAssignmentValues,getEnvFlagValue,getLegacyProjectRulesConfigPath,getLegacyUserRulesConfigPath,getNonCommandToolInputKind,getPolicyFilesystemTargetForPath,getPolicyPaths,getPolicyRuleMetadata,getProjectRulesConfigPath,getRemoveMatches,getRulebookCacheOptions,getRulebookCachePath,getRulebookCacheRoot,getRulebookDisplaySource,getRulesConfigRuntimeErrorsForConfig,getRulesConfigSourceDisplayMap,getRulesLockPathForConfigPath,getScopePaths,getSelectedUpdateSpecs,getUserRulesConfigPath,getUserRulesLockPath,isGitHubRepositorySource,isReservedTransparentWrapper,isSamePolicyFilesystemTarget,loadPolicySnapshot,loadRulesPolicy,loadScopePolicy,mightContainEnvAssignment,previewUserPolicyForGui,projectGuardDenial,projectLegacyCommandEntriesFromProgram,readLockfile,readPolicyDirectoryEntries,readPolicyFile,readRulesConfig,readScopeRulesConfig,readUserPolicyForGui,redactEnvAssignmentValues,redactNonAssignmentSecrets,removePolicyDirectory,removePolicyFile,repairUserPolicyForGui,resolveCommandAnalysisContext,resolveEffectiveDestructiveCommandRules,resolveExistingPath,resolveRulebookSource,resolveRulebookSourceForSync,runRulebookFixtures,sanitizeDiagnosticText,validateCustomRule,validatePolicyDirectoryRemoval,validateRulesConfig,writeDefaultRulesConfig,writeIntegrationDenialAudit,writeJsonAtomic,writePolicyFileAtomic,writeStarterRulebook,writeUserPolicyFromGui}from"../chunks/index-bxbqvwfk.js";import{basename,dirname,resolve}from"node:path";function renderTerminalText(value){return Array.from(value,(character)=>{let code=character.charCodeAt(0);if(code<=31||code>=127&&code<=159)return`\\x${code.toString(16).padStart(2,"0")}`;return character}).join("")}import{readdirSync,readFileSync}from"node:fs";import{join}from"node:path";function listAuditLogFiles(logsDir){try{return readdirSync(logsDir,{withFileTypes:!0,encoding:"utf8"}).flatMap((entry)=>{let filePath=join(logsDir,entry.name);if(entry.isDirectory())return listAuditLogFiles(filePath);if(entry.name.endsWith(".jsonl"))return[filePath];return[]})}catch{return[]}}function readAuditLogEntries(filePath){try{return readFileSync(filePath,"utf-8").split(`
`).filter(Boolean).flatMap((line)=>{try{return[JSON.parse(line)]}catch{return[]}})}catch{return[]}}function parseLogsFlags(args){let flags={limit:20,limitExplicit:!1,since:30,sinceExplicit:!1,all:!1,json:!1};for(let index=0;index<args.length;index++){let arg=args[index];if(arg==="--all"){flags.all=!0;continue}if(arg==="--json"){flags.json=!0;continue}if(arg==="--id"){let value=parseStringValue(args[index+1],"--id");if(value===null)return null;if(!/^[a-f0-9]{16}$/.test(value))return console.error("--id must be 16 hexadecimal characters"),null;flags.id=value,index++;continue}if(arg==="--limit"){let limit=parsePositiveNumber(args[index+1]);if(limit===null)return console.error("--limit must be a positive number"),null;flags.limit=limit,flags.limitExplicit=!0,index++;continue}if(arg==="--since"){let since=parsePositiveNumber(args[index+1]);if(since===null)return console.error("--since must be a positive number"),null;flags.since=since,flags.sinceExplicit=!0,index++;continue}if(arg==="--agent"){let value=parseStringValue(args[index+1],"--agent");if(value===null)return null;flags.agent=value,index++;continue}if(arg==="--rule"){let value=parseStringValue(args[index+1],"--rule");if(value===null)return null;flags.rule=value,index++;continue}if(arg==="--session"){let value=parseStringValue(args[index+1],"--session");if(value===null)return null;flags.session=value,index++;continue}if(arg==="--project"){let value=parseStringValue(args[index+1],"--project");if(value===null)return null;flags.project=resolve(value),index++;continue}return console.error(`Unknown option: ${arg}`),null}if(flags.id&&(flags.agent!==void 0||flags.rule!==void 0||flags.session!==void 0||flags.project!==void 0||flags.sinceExplicit||flags.limitExplicit))return console.error("--id cannot be combined with --agent, --rule, --session, --project, --since, or --limit"),null;return flags}async function runLogsCommand(args,options={}){let flags=parseLogsFlags(args);if(!flags)return 1;let logsDir=options.logsDir??getAuditLogsDir();if(!logsDir)return console.log(flags.json?"[]":flags.id?`No audit log entry found for id ${renderTerminalText(flags.id)}.`:"No audit log entries found."),0;let allEntries=listAuditLogFiles(logsDir).flatMap((file)=>readAuditLogEntries(file).map((entry)=>({entry,file})));if(flags.id)return outputIdLookup(allEntries,flags,options.timeZone);let cutoff=Date.now()-flags.since*24*60*60*1000,entries=allEntries.filter((item)=>matchesLogsFlags(item,flags,logsDir,cutoff)).sort((left,right)=>Date.parse(right.entry.ts)-Date.parse(left.entry.ts)).slice(0,flags.limit);if(flags.json)return console.log(JSON.stringify(entries.map((item)=>item.entry))),0;if(entries.length===0)return console.log("No audit log entries found."),0;for(let item of entries)console.log(formatLogEntry(item.entry,options.timeZone));return 0}function outputIdLookup(entries,flags,timeZone){let matches=entries.filter((item)=>item.entry.id===flags.id);if(matches.length>1)return console.error(`Multiple audit log entries found for id ${renderTerminalText(flags.id??"")}.`),1;if(flags.json)return console.log(JSON.stringify(matches.map((item)=>item.entry))),0;let match=matches[0];if(!match)return console.log(`No audit log entry found for id ${renderTerminalText(flags.id??"")}.`),0;return console.log(formatLogEntryDetail(match.entry,timeZone)),0}function matchesLogsFlags(item,flags,logsDir,cutoff){if(!flags.all&&item.entry.decision==="allow")return!1;if(Date.parse(item.entry.ts)<cutoff)return!1;if(flags.agent!==void 0&&item.entry.agent!==flags.agent)return!1;if(flags.rule!==void 0&&item.entry.ruleId!==flags.rule)return!1;if(flags.session!==void 0&&!matchesSession(item,logsDir,flags.session))return!1;if(flags.project!==void 0&&!matchesProject(item.entry.cwd,flags.project))return!1;return!0}function matchesSession(item,logsDir,session){if(item.entry.sessionId===session)return!0;return dirname(item.file)===logsDir&&basename(item.file,".jsonl")===session}function matchesProject(cwd,project){if(!cwd)return!1;return cwd===project||cwd.startsWith(`${project}/`)}function formatLogEntry(entry,timeZone){let id=renderTerminalText(entry.id??"-"),decision=renderTerminalText(entry.decision??"deny"),cwd=entry.cwd?`  [${renderTerminalText(entry.cwd)}]`:"",command=entry.command.length>50?`${entry.command.slice(0,50)}…`:entry.command;return`${id.padEnd(16)}  ${renderTerminalText(formatHumanTimestamp(entry.ts,timeZone))}  ${decision.padEnd(5)}  ${renderTerminalText(entry.agent??"-").padEnd(15)}  ${renderTerminalText(entry.ruleId??"-").padEnd(20)}  ${renderTerminalText(command)}${cwd}`}function formatLogEntryDetail(entry,timeZone){let value=(input)=>renderTerminalText(input===void 0||input===null||input===""?"-":input),agent=entry.shape?`${entry.agent??"-"} (shape: ${entry.shape})`:entry.agent??"-";return[`id:        ${value(entry.id)}`,`ts:        ${value(formatHumanTimestamp(entry.ts,timeZone))}`,`decision:  ${value(entry.decision)}`,`agent:     ${value(agent)}`,`tool:      ${value(entry.toolName)}`,`rule:      ${value(entry.ruleId)}`,`intent:    ${value(entry.intent)}`,`stage:     ${value(entry.failureStage)}`,`error:     ${value(entry.errorCode)}`,`session:   ${value(entry.sessionId)}`,`cwd:       ${value(entry.cwd)}`,`version:   ${value(entry.v)}`,`truncated: ${value(entry.truncated===!0?"yes":void 0)}`,`reason:    ${value(entry.reason)}`,`command:   ${value(entry.command)}`,`segment:   ${value(entry.segment)}`].join(`
`)}function formatHumanTimestamp(timestamp,timeZone){let date=new Date(timestamp);if(Number.isNaN(date.getTime()))return timestamp;return new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone}).format(date)}function parsePositiveNumber(value){if(value===void 0)return null;let parsed=Number(value);return Number.isFinite(parsed)&&parsed>0?parsed:null}function parseStringValue(value,flag){if(value===void 0||value.startsWith("-"))return console.error(`${flag} requires a value`),null;return value}var doctorCommand={name:"doctor",aliases:["--doctor"],description:"Run diagnostic checks to verify installation and configuration",usage:"doctor [options]",options:[{flags:"--json",description:"Output diagnostics as JSON"},{flags:"--skip-update-check",description:"Skip npm registry version check"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net doctor","cc-safety-net doctor --json","cc-safety-net doctor --skip-update-check"]};var explainCommand={name:"explain",description:"Show step-by-step analysis trace of how a command would be analyzed",usage:"explain [options] <command>",argument:"<command>",options:[{flags:"--json",description:"Output analysis as JSON"},{flags:"--cwd",argument:"<path>",description:"Use custom working directory"},{flags:"-h, --help",description:"Show this help"}],examples:['cc-safety-net explain "git reset --hard"','cc-safety-net explain --json "rm -rf /"','cc-safety-net explain --cwd /tmp "git status"']};var guiCommand={name:"gui",description:"Open the local policy editor GUI",usage:"gui [options]",options:[{flags:"--no-open",description:"Print the URL without opening a browser"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net gui","cc-safety-net gui --no-open"]};import{isAbsolute,relative}from"node:path";var HOOK_INPUT_MAX_BYTES=8388608;function outputHookDeny(createDenyOutput,denial){console.log(JSON.stringify(createDenyOutput(formatDenial(denial))))}async function readHookInput(outputDeny){let inputText;try{inputText=(await readBoundedHookInput(process.stdin)).trim()}catch{outputDeny({reason:"Failed to parse hook input JSON."});return}if(!inputText){outputDeny({reason:"Missing hook input JSON."});return}return parseHookJson(inputText,outputDeny,"Failed to parse hook input JSON.")}async function readBoundedHookInput(input){let chunks=[],bytes=0;for await(let chunk of input){let buffer=typeof chunk==="string"?Buffer.from(chunk,"utf-8"):Buffer.from(chunk.buffer,chunk.byteOffset,chunk.byteLength);if(bytes+=buffer.byteLength,bytes>HOOK_INPUT_MAX_BYTES)throw stopHookInput(input),Error("hook input byte limit exceeded");chunks.push(buffer)}return Buffer.concat(chunks,bytes).toString("utf-8")}function stopHookInput(input){let stop=input.destroy??input.cancel;if(!stop)return;try{Promise.resolve(stop.call(input)).catch(()=>{})}catch{}}function parseHookJson(inputText,outputDeny,strictReason){try{return JSON.parse(inputText)}catch{outputDeny({reason:strictReason});return}}function getToolRoute(toolName,commandTools){let shell=commandTools.get(toolName);return shell?{kind:"command",shell}:{kind:getNonCommandToolInputKind(toolName)}}function resolveStandardHookContext(cwdInput,toolInput,toolName,outputDeny){let requestedCwd=cwdInput===void 0?process.cwd():cwdInput,cwd=typeof requestedCwd==="string"&&requestedCwd.trim()!==""?firstTrustedRoot([requestedCwd]):void 0;if(cwd)return{configCwd:cwd,executionCwd:cwd};return outputFailedClosed(outputDeny,toolInput,toolName,stringField(requestedCwd)),null}function outputFailedClosed(outputDeny,toolInput,toolName,segment){let command;try{command=getCommandFromToolInput(toolInput)}catch(error){if(!(error instanceof ToolInputLimitError))throw error}outputDeny(createFailedClosedDenial({command,segment,toolName}))}async function runHookAdapter(adapter){let input=await readHookInput(adapter.outputDeny);if(input===void 0)return;if(!input||typeof input!=="object"||Array.isArray(input)){outputFailedClosed(adapter.outputDeny);return}if(!adapter.isSupported(input))return;let agent=adapter.getAgent?.(input)??adapter.agent,shape=adapter.agent===agent?void 0:adapter.agent,auditCwd=getHookAuditCwd(input),outputPreflightDeny=(denial,toolName2)=>{writeIntegrationDenialAudit(denial,()=>adapter.getSessionId(input),{agent,shape,toolName:toolName2,cwd:auditCwd}),adapter.outputDeny(denial)},toolNameInput=adapter.getToolName(input);if(typeof toolNameInput!=="string"||toolNameInput.trim()===""){outputFailedClosed((denial)=>outputPreflightDeny(denial),getRawHookToolInput(input));return}let toolName=toolNameInput,outputToolPreflightDeny=(denial)=>outputPreflightDeny(denial,toolName),toolInputResult;try{toolInputResult=adapter.getToolInput(input,toolName,outputToolPreflightDeny)}catch(error){if(!(error instanceof ToolInputLimitError))throw error;outputFailedClosed(outputToolPreflightDeny,void 0,toolName);return}if(!toolInputResult.ok)return;let context=adapter.getContext(input,toolInputResult.input,toolName,outputToolPreflightDeny);if(!context)return;let command;try{command=getCommandFromToolInput(toolInputResult.input)}catch(error){if(!(error instanceof ToolInputLimitError))throw error;outputFailedClosed(outputToolPreflightDeny,void 0,toolName);return}let invocation=createToolInvocation(toolName,toolInputResult.input,toolInputResult.route,context,command??null);try{let evaluation=evaluateRuntimeGuard(invocation,{guard:{auditAllowed:envTruthy(ENV_FLAGS.debug),dependencies:adapter.guardDependencies},audit:{agent,shape,getSessionId:()=>adapter.getSessionId(input)}}),denial=projectGuardDenial(evaluation,{includeEvidence:!0,toolName:evaluation.stage==="command-analysis"?void 0:toolName});if(denial)adapter.outputDeny(denial)}catch(error){if(!(error instanceof GuardEvaluationError))throw error;logHookGuardError(error);let denial=projectGuardDenial(error.evaluation,{includeEvidence:!0,toolName:error.evaluation.stage==="command-analysis"?void 0:toolName});if(denial)adapter.outputDeny(denial);return}}function logHookGuardError(error){if(!envTruthy(ENV_FLAGS.debug))return;console.error(`CC Safety Net debug: ${getHookGuardErrorLabel(error.stage)}: ${formatIntegrationError(error.cause)}`)}function getHookGuardErrorLabel(stage){if(stage==="policy-protection")return"hook policy protection failed";if(stage==="config-load")return"hook config loading failed";if(stage==="secret-protection")return"hook secret protection failed";return"hook analysis failed"}function stringField(value){return typeof value==="string"?value:void 0}function getRawHookToolInput(input){if(!input||typeof input!=="object"||Array.isArray(input))return;if(Object.hasOwn(input,"tool_input"))return input.tool_input;let toolCall=input.toolCall;if(toolCall&&typeof toolCall==="object"&&!Array.isArray(toolCall))return toolCall.args;return}function getHookAuditCwd(input){if(!input||typeof input!=="object"||Array.isArray(input))return null;let cwd=input.cwd;if(typeof cwd==="string")return cwd;let toolCall=input.toolCall;if(!toolCall||typeof toolCall!=="object"||Array.isArray(toolCall))return null;let args=toolCall.args;if(!args||typeof args!=="object"||Array.isArray(args))return null;let commandCwd=args.Cwd;return typeof commandCwd==="string"?commandCwd:null}async function runConfiguredHookAdapter(adapter){let outputDeny=(denial)=>outputHookDeny(adapter.createDenyOutput,denial);await runHookAdapter({agent:adapter.agent,getAgent:adapter.getAgent,outputDeny,guardDependencies:adapter.guardDependencies,isSupported:adapter.isSupported,getToolName:adapter.getToolName,getToolInput:adapter.getToolInput,getContext:adapter.getContext,getSessionId:adapter.getSessionId})}var ANTIGRAVITY_CLI_COMMAND_TOOLS=new Map([["run_command","auto"]]),ANTIGRAVITY_PATH_KEYS=new Set(["absolutepath","directorypath","file_path","filepath","path","searchdirectory","searchpath","target_file","targetfile"]);function getAntigravityCliToolRoute(toolName){return getToolRoute(toolName,ANTIGRAVITY_CLI_COMMAND_TOOLS)}async function runAntigravityCliHook(){await runConfiguredHookAdapter({agent:"antigravity-cli",createDenyOutput:(message)=>({decision:"deny",reason:message}),isSupported:()=>!0,getToolName:(input)=>input.toolCall?.name,getToolInput:(input,toolName)=>({ok:!0,input:normalizeAntigravityToolArgs(input.toolCall?.args,toolName),route:getAntigravityCliToolRoute(toolName)}),getContext:resolveAntigravityContext,getSessionId:(input)=>input.conversationId})}function resolveAntigravityContext(input,toolInput,toolName,outputDeny){let configRoots=usableWorkspacePaths(input).flatMap((root)=>{let canonicalRoot=firstTrustedRoot([root]);return canonicalRoot?[canonicalRoot]:[]});if(!configRoots[0])return outputAntigravityCwdDeny(outputDeny,toolInput,toolName),null;if(toolName!=="run_command"){let targetRoot;try{targetRoot=resolveAntigravityTargetRoot(toolInput,toolName,configRoots)}catch(error){if(error instanceof ToolInputLimitError)return outputAntigravityCwdDeny(outputDeny,void 0,toolName),null;if(!(error instanceof PathCanonicalizationLimitError))throw error;return outputAntigravityCwdDeny(outputDeny,toolInput,toolName),null}if(!targetRoot)return outputAntigravityCwdDeny(outputDeny,toolInput,toolName),null;return{configCwd:targetRoot,executionCwd:targetRoot,policyConfigCwds:configRoots}}let args=input.toolCall?.args;if(!args||!Object.hasOwn(args,"Cwd"))return{configCwd:configRoots[0],executionCwd:configRoots[0],policyConfigCwds:configRoots};let cwd=args.Cwd;if(typeof cwd!=="string"||cwd.trim()==="")return outputAntigravityCwdDeny(outputDeny,toolInput,toolName),null;let containedCwd=resolveContainedCwd(cwd,configRoots);if(containedCwd){let configCwd=mostSpecificContainingRoot(containedCwd,configRoots);if(!configCwd)return outputAntigravityCwdDeny(outputDeny,toolInput,toolName,cwd),null;return{configCwd,executionCwd:containedCwd,policyConfigCwds:configRoots}}return outputAntigravityCwdDeny(outputDeny,toolInput,toolName,cwd),null}function resolveAntigravityTargetRoot(toolInput,toolName,configRoots){let route=getAntigravityCliToolRoute(toolName),targets=[...extractPathLikeToolValues(toolInput,ANTIGRAVITY_PATH_KEYS),...route.kind==="patch"?extractPatchTargetsFromToolInput(toolInput):[]].filter(isAbsolute),budget=createPathCanonicalizationBudget(),targetRoots=new Set(targets.flatMap((target)=>{let root=mostSpecificContainingRoot(resolveExistingPath(target,budget),configRoots);return root?[root]:[]}));if(targetRoots.size>1)return null;return[...targetRoots][0]??configRoots[0]??null}function mostSpecificContainingRoot(path,roots){return roots.filter((root)=>isSameOrInside(path,root)).reduce((best,root)=>root.length>best.length?root:best,"")||null}function isSameOrInside(path,root){let rel=relative(root,path);return rel===""||!rel.startsWith("..")&&!isAbsolute(rel)}function outputAntigravityCwdDeny(outputDeny,toolInput,toolName,cwd){let command=toolInput&&typeof toolInput==="object"?toolInput.command:void 0;outputDeny(createFailedClosedDenial({command:typeof command==="string"?command:void 0,segment:cwd,toolName}))}function usableWorkspacePaths(input){if(input.workspacePaths===void 0)return[process.cwd()];let workspacePaths=Array.isArray(input.workspacePaths)?input.workspacePaths.filter((path)=>typeof path==="string"&&path.trim()!==""):[];return firstTrustedRoot(workspacePaths)?workspacePaths:[]}function normalizeAntigravityToolArgs(args,toolName){if(!args)return;if(toolName!=="run_command")return args;return{...args,command:typeof args.CommandLine==="string"&&args.CommandLine!==""?args.CommandLine:void 0}}import{homedir}from"node:os";import{isAbsolute as isAbsolute2,join as join2}from"node:path";function detectClaudeShapeAgent(transcriptPath){if(transcriptPath!==void 0&&transcriptPath!==null&&!isAbsolute2(transcriptPath))return"unknown";try{let budget=createPathCanonicalizationBudget(),transcript=transcriptPath?resolveExistingPath(transcriptPath,budget):void 0,home=process.env.HOME||homedir(),roots=[["codex",process.env.CODEX_HOME||join2(home,".codex")],["copilot-cli",process.env.COPILOT_HOME||join2(home,".copilot")],["claude-code",process.env.CLAUDE_CONFIG_DIR||join2(home,".claude")]],matches=transcript?roots.flatMap(([agent,root])=>{if(!isAbsolute2(root))return[];return isSameOrInsidePath(transcript,resolveExistingPath(root,budget))?[agent]:[]}):[];if(matches.length===1)return matches[0]??"unknown";if(matches.length>1)return"unknown"}catch(error){if(error instanceof PathCanonicalizationLimitError)return"unknown";return"unknown"}if(process.env.CLAUDECODE==="1"||Boolean(process.env.CLAUDE_CODE_ENTRYPOINT))return"claude-code";return"unknown"}var CLAUDE_CODE_HOOK_EVENT="PreToolUse",GEMINI_CLI_HOOK_EVENT="BeforeTool",KIMI_CODE_HOOK_EVENT="PreToolUse";var CLAUDE_CODE_COMMAND_TOOLS=new Map([["Bash","posix"],["PowerShell","powershell"]]);function getClaudeCodeToolRoute(toolName){return getToolRoute(toolName,CLAUDE_CODE_COMMAND_TOOLS)}async function runClaudeCodeHook(){await runConfiguredHookAdapter({agent:"claude-code",getAgent:(input)=>detectClaudeShapeAgent(input.transcript_path),createDenyOutput:(message)=>({hookSpecificOutput:{hookEventName:CLAUDE_CODE_HOOK_EVENT,permissionDecision:"deny",permissionDecisionReason:message}}),isSupported:(input)=>input.hook_event_name===CLAUDE_CODE_HOOK_EVENT,getToolName:(input)=>input.tool_name,getToolInput:(input,toolName)=>({ok:!0,input:input.tool_input,route:getClaudeCodeToolRoute(toolName)}),getContext:(input,toolInput,toolName,outputDeny)=>resolveStandardHookContext(input.cwd,toolInput,toolName,outputDeny),getSessionId:(input)=>input.session_id})}var COPILOT_CLI_COMMAND_TOOLS=new Map([["bash","auto"],["Bash","auto"]]);function getCopilotCliToolRoute(toolName){return getToolRoute(toolName,COPILOT_CLI_COMMAND_TOOLS)}async function runCopilotCliHook(){await runConfiguredHookAdapter({agent:"copilot-cli",createDenyOutput:(message)=>({permissionDecision:"deny",permissionDecisionReason:message}),isSupported:()=>!0,getToolName:(input)=>input.toolName,getToolInput:(input,toolName,outputDeny)=>{if(typeof input.toolArgs!=="string")return outputDeny({reason:"Failed to parse toolArgs JSON."}),{ok:!1};let toolInput=parseHookJson(input.toolArgs,outputDeny,"Failed to parse toolArgs JSON.");if(toolInput===void 0)return{ok:!1};return{ok:!0,input:toolInput,route:getCopilotCliToolRoute(toolName)}},getContext:(input,toolInput,toolName,outputDeny)=>resolveStandardHookContext(input.cwd,toolInput,toolName,outputDeny),getSessionId:(input)=>typeof input.sessionId==="string"&&input.sessionId.trim()?input.sessionId:void 0})}var GEMINI_CLI_COMMAND_TOOLS=new Map([["run_shell_command","auto"]]);function getGeminiCliToolRoute(toolName){return getToolRoute(toolName,GEMINI_CLI_COMMAND_TOOLS)}async function runGeminiCLIHook(){await runConfiguredHookAdapter({agent:"gemini-cli",createDenyOutput:(message)=>({decision:"deny",reason:message,systemMessage:message}),isSupported:(input)=>input.hook_event_name===GEMINI_CLI_HOOK_EVENT,getToolName:(input)=>input.tool_name,getToolInput:(input,toolName)=>({ok:!0,input:input.tool_input,route:getGeminiCliToolRoute(toolName)}),getContext:(input,toolInput,toolName,outputDeny)=>resolveStandardHookContext(input.cwd,toolInput,toolName,outputDeny),getSessionId:(input)=>input.session_id})}var KIMI_CODE_COMMAND_TOOLS=new Map([["Bash","posix"]]);function getKimiCodeToolRoute(toolName){return getToolRoute(toolName,KIMI_CODE_COMMAND_TOOLS)}async function runKimiCodeHook(){await runConfiguredHookAdapter({agent:"kimi-code",createDenyOutput:(message)=>({hookSpecificOutput:{hookEventName:KIMI_CODE_HOOK_EVENT,permissionDecision:"deny",permissionDecisionReason:message}}),isSupported:(input)=>input.hook_event_name===KIMI_CODE_HOOK_EVENT,getToolName:(input)=>input.tool_name,getToolInput:(input,toolName)=>({ok:!0,input:input.tool_input,route:getKimiCodeToolRoute(toolName)}),getContext:(input,toolInput,toolName,outputDeny)=>resolveStandardHookContext(input.cwd,toolInput,toolName,outputDeny),getSessionId:(input)=>input.session_id})}var catalog=[{id:"antigravity-cli",displayName:"Antigravity CLI",doctorOrder:2,runtime:{order:1,flags:["-ac","--agy-cli"],description:"Run as Antigravity CLI PreToolUse hook",legacyTopLevelFlags:[]},install:{order:1,flag:"--agy-cli",installLabel:"Antigravity CLI",probeCommand:["agy","--version"]}},{id:"claude-code",displayName:"Claude Code",doctorOrder:1,runtime:{order:2,displayName:"Coding CLI",flags:["-cc","--coding-cli"],legacyFlags:["--claude-code"],description:"Run as Coding CLI PreToolUse hook",legacyTopLevelFlags:["-cc","--claude-code"]},install:{order:2,flag:"--claude-code",installLabel:"Claude Code",probeCommand:["claude","--version"]}},{id:"codex",displayName:"Codex",doctorOrder:3,install:{order:3,flag:"--codex",installLabel:"Codex",probeCommand:["codex","--version"]}},{id:"copilot-cli",displayName:"Copilot CLI",doctorOrder:4,runtime:{order:3,flags:["-cp","--copilot-cli"],description:"Run as Copilot CLI PreToolUse hook",legacyTopLevelFlags:["-cp","--copilot-cli"]},install:{order:5,flag:"--copilot-cli",installLabel:"GitHub Copilot CLI",probeCommand:["copilot","--binary-version"]}},{id:"gemini-cli",displayName:"Gemini CLI",doctorOrder:5,runtime:{order:4,flags:["-gc","--gemini-cli"],description:"Run as Gemini CLI BeforeTool hook",legacyTopLevelFlags:["-gc","--gemini-cli"]},install:{order:4,flag:"--gemini-cli",installLabel:"Gemini CLI",probeCommand:["gemini","--version"]}},{id:"kimi-code",displayName:"Kimi Code",doctorOrder:6,runtime:{order:5,flags:["-kc","--kimi-code"],description:"Run as Kimi Code PreToolUse hook",legacyTopLevelFlags:[]},install:{order:6,flag:"--kimi-code",installLabel:"Kimi Code",probeCommand:["kimi","--version"]}},{id:"opencode",displayName:"OpenCode",doctorOrder:7,install:{order:7,flag:"--opencode",installLabel:"OpenCode",probeCommand:["opencode","--version"]}},{id:"pi",displayName:"Pi",doctorOrder:8,install:{order:8,flag:"--pi",installLabel:"Pi",probeCommand:["pi","--version"]}}],doctorIntegrationOrder=catalog.slice().sort((a,b)=>a.doctorOrder-b.doctorOrder).map((integration)=>integration.id),runtimeHookIntegrationMetadata=catalog.filter((integration)=>("runtime"in integration)).slice().sort((a,b)=>a.runtime.order-b.runtime.order).map((integration)=>({id:integration.id,displayName:"displayName"in integration.runtime?integration.runtime.displayName:integration.displayName,flags:integration.runtime.flags,legacyFlags:"legacyFlags"in integration.runtime?integration.runtime.legacyFlags:[],description:integration.runtime.description,legacyTopLevelFlags:integration.runtime.legacyTopLevelFlags})),installIntegrationMetadata=catalog.slice().sort((a,b)=>a.install.order-b.install.order).map((integration)=>({id:integration.id,...integration.install})).map(({order:_,...integration})=>integration);function getIntegrationDisplayName(id){return catalog.find((integration)=>integration.id===id)?.displayName??id}function getIntegrationInstallLabel(id){return catalog.find((integration)=>integration.id===id)?.install.installLabel??id}var hookRunners={"antigravity-cli":runAntigravityCliHook,"claude-code":runClaudeCodeHook,"copilot-cli":runCopilotCliHook,"gemini-cli":runGeminiCLIHook,"kimi-code":runKimiCodeHook},hookIntegrations=runtimeHookIntegrationMetadata.map((integration)=>({...integration,run:hookRunners[integration.id]}));function findHookIntegrationByFlag(args){return hookIntegrations.find((integration)=>[...integration.flags,...integration.legacyFlags].some((flag)=>args.includes(flag)))}function findLegacyTopLevelHookIntegration(flag){return hookIntegrations.find((integration)=>integration.legacyTopLevelFlags.some((integrationFlag)=>integrationFlag===flag))}var platformOptions=hookIntegrations.map((integration)=>({flags:integration.flags.join(", "),description:integration.description})),platformExamples=hookIntegrations.flatMap((integration)=>integration.flags.map((flag)=>`cc-safety-net hook ${flag}`)),hookCommand={name:"hook",description:"Run as an agent CLI hook (reads JSON from stdin)",usage:"hook <coding cli>",options:[...platformOptions,{flags:"-h, --help",description:"Show this help"}],examples:platformExamples};var installTargetOptions=[{flags:"--codex",description:"Install Codex plugin"},{flags:"--claude-code",description:"Install Claude Code plugin"},{flags:"--agy-cli",description:"Install Antigravity CLI hook config"},{flags:"--gemini-cli",description:"Install Gemini CLI extension"},{flags:"--copilot-cli",description:"Install GitHub Copilot CLI plugin"},{flags:"--kimi-code",description:"Install Kimi Code hook config"},{flags:"--opencode",description:"Install OpenCode plugin"},{flags:"--pi",description:"Install Pi package"},{flags:"-h, --help",description:"Show this help"}],installCommand={name:"install",description:"Install CC Safety Net into a coding agent CLI",usage:"install [coding cli]",options:installTargetOptions,examples:["cc-safety-net install","cc-safety-net install --codex","cc-safety-net install --claude-code","cc-safety-net install --agy-cli","cc-safety-net install --gemini-cli","cc-safety-net install --copilot-cli","cc-safety-net install --kimi-code","cc-safety-net install --opencode","cc-safety-net install --pi"]},uninstallCommand={name:"uninstall",description:"Uninstall CC Safety Net from a coding agent CLI",usage:"uninstall [coding cli]",options:[{flags:"--codex",description:"Uninstall Codex plugin"},{flags:"--claude-code",description:"Uninstall Claude Code plugin"},{flags:"--agy-cli",description:"Uninstall Antigravity CLI hook config"},{flags:"--gemini-cli",description:"Uninstall Gemini CLI extension"},{flags:"--copilot-cli",description:"Uninstall GitHub Copilot CLI plugin"},{flags:"--kimi-code",description:"Uninstall Kimi Code hook config"},{flags:"--opencode",description:"Uninstall OpenCode plugin"},{flags:"--pi",description:"Uninstall Pi package"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net uninstall","cc-safety-net uninstall --codex","cc-safety-net uninstall --claude-code","cc-safety-net uninstall --agy-cli","cc-safety-net uninstall --gemini-cli","cc-safety-net uninstall --copilot-cli","cc-safety-net uninstall --kimi-code","cc-safety-net uninstall --opencode","cc-safety-net uninstall --pi"]};var logsCommand={name:"logs",description:"Browse audit log entries recorded by hooks",usage:"logs [options]",options:[{flags:"--id",argument:"<id>",description:"Show one audit entry by its 16-character id"},{flags:"--limit",argument:"<n>",description:"Maximum entries to print",default:"20"},{flags:"--since",argument:"<days>",description:"Only include entries newer than this many days",default:"30"},{flags:"--agent",argument:"<name>",description:"Filter by agent name"},{flags:"--rule",argument:"<ruleId>",description:"Filter by rule id"},{flags:"--session",argument:"<id>",description:"Filter by session id"},{flags:"--project",argument:"<path>",description:"Filter by project path"},{flags:"--all",description:"Include allow entries"},{flags:"--json",description:"Output entries as JSON"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net logs --id 3fa9c2d1a70e8b42","cc-safety-net logs --agent claude-code","cc-safety-net logs --project . --since 7","cc-safety-net logs --json"]};var ruleCommand={name:"rule",description:"Manage CC Safety Net rule config and rulebook sources",usage:"rule <subcommand>",subcommands:[{usage:"init [--example]",description:"Create inert rule config"},{usage:"add <source>",description:"Add a rulebook source and sync"},{usage:"remove <source>",description:"Remove a rulebook source and sync"},{usage:"update [source]",description:"Refresh rulebook lock/cache state"},{usage:"sync",description:"Sync configured rulebooks"},{usage:"list",description:"List active rulebooks"},{usage:"wrapper add <command>",description:"Trust a transparent command wrapper"},{usage:"wrapper remove <command>",description:"Remove a transparent command wrapper"},{usage:"wrapper list",description:"List transparent command wrappers"},{usage:"test [source]",description:"Run rulebook fixtures"},{usage:"migrate [--cleanup]",description:"Migrate legacy inline rules"},{usage:"doc",description:"Print the rulebook authoring guide"},{usage:"verify",description:"Validate rule config files"}],options:[{flags:"-g, --global",description:"Use user-scope rule config"},{flags:"--check",description:"Check without changing lock/cache state"},{flags:"--cleanup",description:"Delete legacy files after rule migrate verifies them"},{flags:"--delete-source",description:"Delete clean local source directory on remove"},{flags:"--example",description:"Create an inactive example rulebook with rule init"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net rule init","cc-safety-net rule init --example","cc-safety-net rule wrapper add rtk","cc-safety-net rule add project-rules","cc-safety-net rule sync","cc-safety-net rule migrate --cleanup","cc-safety-net rule verify"]};var statuslineCommand={name:"statusline",description:"Print status line with mode indicators for shell integration",usage:"statusline <coding cli>",options:[{flags:"-cc, --claude-code",description:"Print status line for Claude Code"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net statusline -cc","cc-safety-net statusline --claude-code"]};var commands=[doctorCommand,logsCommand,explainCommand,ruleCommand,installCommand,uninstallCommand,hookCommand,guiCommand,statuslineCommand];function getCommandAliases(command){return command.aliases??[]}function isVisibleCommand(command){return!command.hidden}function findCommand(nameOrAlias){let normalized=nameOrAlias.toLowerCase();return commands.find((cmd)=>cmd.name.toLowerCase()===normalized||getCommandAliases(cmd).some((alias)=>alias.toLowerCase()===normalized))}function getVisibleCommands(){return commands.filter(isVisibleCommand)}import{readFileSync as readFileSync2}from"node:fs";import{basename as basename2}from"node:path";function formatRelativeTime(date){let diff=Date.now()-date.getTime(),minutes=Math.floor(diff/60000),hours=Math.floor(diff/3600000),days=Math.floor(hours/24);if(days>0)return`${days}d ago`;if(hours>0)return`${hours}h ago`;if(minutes>0)return`${minutes}m ago`;return"just now"}function getActivitySummary(days=7,logsDir=getAuditLogsDir()){let cutoff=Date.now()-days*24*60*60*1000,recentEntries=[],recentSessions=new Set,totalBlocked=0,oldestEntry,oldestEntryTs,newestEntry,newestEntryTs,files=logsDir?listAuditLogFiles(logsDir):[];for(let file of files)try{let lines=readFileSync2(file,"utf-8").trim().split(`
`).filter(Boolean);for(let line of lines)try{let entry=JSON.parse(line);if(entry.decision==="allow")continue;let ts=new Date(entry.ts).getTime();if(ts>=cutoff){if(totalBlocked++,recentSessions.add(entry.sessionId??basename2(file,".jsonl")),oldestEntryTs===void 0||ts<=oldestEntryTs)oldestEntry=entry.ts,oldestEntryTs=ts;if(newestEntryTs===void 0||ts>newestEntryTs)newestEntry=entry.ts,newestEntryTs=ts;insertRecentEntry(recentEntries,entry,ts)}}catch{}}catch{}let displayEntries=recentEntries.map((e)=>({timestamp:e.ts,command:e.command,reason:e.reason,relativeTime:formatRelativeTime(new Date(e.ts))}));return{totalBlocked,sessionCount:recentSessions.size,recentEntries:displayEntries,oldestEntry,newestEntry}}function insertRecentEntry(entries,entry,ts){let index=entries.findIndex((existing)=>ts>new Date(existing.ts).getTime());if(index===-1){if(entries.length<3)entries.push(entry);return}if(entries.splice(index,0,entry),entries.length>3)entries.pop()}import{dirname as dirname2}from"node:path";import{resolve as resolve2}from"node:path";function validateConfig(config){let errors=[],ruleNames=new Set;if(!config||typeof config!=="object")return errors.push("Config must be an object"),{errors,ruleNames};let cfg=config;if(cfg.version!==1)errors.push("version must be 1");if(cfg.rules!==void 0)if(!Array.isArray(cfg.rules))errors.push("rules must be an array");else for(let i=0;i<cfg.rules.length;i++)errors.push(...validateCustomRule(cfg.rules[i],i,ruleNames));return{errors,ruleNames}}function validateConfigFile(path){return validateParsedConfigFile(path,validateConfig)}function readConfigFileInput(path){let errors=[],ruleNames=new Set;try{let target=typeof path==="string"?bindDelegatedPolicyFilesystemTarget(path):path,content=readPolicyFile(target);if(content===null)return errors.push(`File not found: ${target.path}`),{ok:!1,result:{errors,ruleNames}};if(!content.trim())return errors.push("Config file is empty"),{ok:!1,result:{errors,ruleNames}};return{ok:!0,parsed:JSON.parse(content)}}catch(error){return errors.push(error instanceof PolicyFilesystemError?error.message:"Invalid JSON"),{ok:!1,result:{errors,ruleNames}}}}function getLegacyProjectConfigPath(cwd){return resolve2(cwd??process.cwd(),".safety-net.json")}function validateRulesConfigFile(path){let loaded=readConfigFileInput(path);if(!loaded.ok)return loaded.result;let result=validateRulesConfig(loaded.parsed);return{errors:result.errors,ruleNames:result.sources}}function validateParsedConfigFile(path,validate){let loaded=readConfigFileInput(path);if(!loaded.ok)return loaded.result;return validate(loaded.parsed)}import{isAbsolute as isAbsolute3,join as join3,relative as relative2,resolve as resolve3,sep}from"node:path";async function syncRulesConfig(options={}){return syncRulesConfigInternal(projectSyncOptions(options),createRuleSyncOperation())}async function syncRulesConfigInternal(options,operation,discoveredDisplayRefs,hooks={}){let lockSnapshot=null,lockPublished=!1;try{let scope=getScopePaths(options),scopeConfig=readScopeRulesConfig(scope.configTarget);if(!scopeConfig.ok)return scopeConfig.result;let config=scopeConfig.config;if(options.check)return checkRulesConfig(config,scope,options);lockSnapshot={target:scope.lockTarget,content:readPolicyFile(scope.lockTarget)};let existingLockResult=readLockfile(scope.lockTarget);if(existingLockResult.errors.some((error)=>error.startsWith("Unable to access ")))return{ok:!1,errors:existingLockResult.errors,warnings:[],entries:[]};if(options.only&&existingLockResult.errors.length>0)return{ok:!1,errors:existingLockResult.errors,warnings:[],entries:[]};let previousLock=existingLockResult.errors.length>0?null:existingLockResult.lock,selectedSpecs=options.only?getSelectedUpdateSpecs(config,previousLock,options.only):{ok:!0,specs:config.rules};if(!selectedSpecs.ok)return selectedSpecs.result;if(options.only&&!previousLock&&selectedSpecs.specs.length<config.rules.length)return{ok:!1,errors:[`No lockfile available for partial update; run ${RULE_SYNC_COMMAND}`],warnings:[],entries:[]};let resolved=(await mapRulebookSources(selectedSpecs.specs,(spec)=>resolveRulebookSourceForSync(spec,scope.configDir,options,previousLock,scope.filesystemScope,operation),operation)).map((item)=>preserveDisplayRef(item,previousLock,discoveredDisplayRefs));for(let item of resolved)writeCache(item.content,item.entry,scope.configDir,options,scope.filesystemScope);let entries=options.only?mergeSelectedLockEntries(config,previousLock,resolved):resolved.map((item)=>item.entry);lockPublished=!0,writeJsonAtomic(scope.lockTarget,{version:1,rulebooks:entries},void 0,hooks._testAfterPolicyRename);let ruleCountsBySpec=new Map(resolved.map((item)=>[item.entry.spec,item.rulebook.rules.length])),warnings=pruneUnreferencedRulebookCaches(entries,scope.configDir,options,scope.filesystemScope,hooks);return{ok:!0,errors:[],warnings,entries:entries.map((entry)=>addRuleCount(entry,ruleCountsBySpec))}}catch(error){if(lockPublished&&lockSnapshot)try{restoreConfig(lockSnapshot.target,lockSnapshot.content)}catch(rollbackError){return failWithError(rollbackError)}return failWithError(error)}}async function testRulebookSources(sources,options={}){if(sources.length>RULE_SOURCE_LIMIT)return sourceLimitResult();let projectedOptions=projectSyncOptions(options),scope=getScopePaths(projectedOptions);try{let operation=createRuleSyncOperation(),resolved=await mapRulebookSources(sources,(spec)=>resolveRulebookSource(spec,scope.configDir,projectedOptions,scope.filesystemScope,operation),operation),ruleCountsBySpec=new Map(resolved.map((item)=>[item.entry.spec,item.rulebook.rules.length])),testCountsBySpec=new Map(resolved.map((item)=>[item.entry.spec,item.rulebook.tests.length])),fixtureErrors=resolved.flatMap((item)=>runRulebookFixtures(item.rulebook).failures.map((failure)=>[`${item.entry.spec}: ${failure.command}: ${failure.message}`,...failure.trace.map((line)=>`  ${line}`)].join(`
`)));return{ok:fixtureErrors.length===0,errors:fixtureErrors,warnings:[],entries:resolved.map((item)=>({...addRuleCount(item.entry,ruleCountsBySpec),testCount:testCountsBySpec.get(item.entry.spec)}))}}catch(error){return failWithError(error)}}async function addRulebookSource(source,options={}){return addRulebookSourceInternal(source,projectSyncOptions(options),createRuleSyncOperation())}async function addRulebookSourceInternal(source,options,operation,hooks={}){let configSnapshot=null,configWriteArmed=!1;try{let scope=getScopePaths(options),before=readPolicyFile(scope.configTarget);configSnapshot={target:scope.configTarget,content:before};let scopeConfig=readScopeRulesConfig(scope.configTarget);if(!scopeConfig.ok)return scopeConfig.result;let config=scopeConfig.config,discoveredSources=isGitHubRepositorySource(source)?await discoverGitHubRepositoryRulebooks(source,operation):[{spec:source}],sources=discoveredSources.map((item)=>item.spec),nextRules=[...new Set([...config.rules,...sources])];if(nextRules.length>RULE_SOURCE_LIMIT)return sourceLimitResult();if(nextRules.length!==config.rules.length)configWriteArmed=!0,writeJsonAtomic(scope.configTarget,{version:1,rules:nextRules,overrides:config.overrides??{},transparent_wrappers:config.transparent_wrappers??[]},void 0,hooks._testAfterPolicyRename);let result=await syncRulesConfigInternal(options,operation,new Map(discoveredSources.filter((item)=>!!item.display_ref).map((item)=>[item.spec,item.display_ref])),hooks);if(!result.ok)restoreConfig(scope.configTarget,before);return result}catch(error){if(configWriteArmed&&configSnapshot)try{restoreConfig(configSnapshot.target,configSnapshot.content)}catch(rollbackError){return failWithError(rollbackError)}return failWithError(error)}}async function mapRulebookSources(sources,mapper,operation=createRuleSyncOperation()){if(sources.length>RULE_SOURCE_LIMIT)throw Error(RULE_SOURCE_LIMIT_ERROR);let results=Array(sources.length),nextIndex=0,firstError,workers=Array.from({length:Math.min(sources.length,RULE_SYNC_RESOURCE_LIMITS.concurrency)},async()=>{while(!firstError){let index=nextIndex;if(index>=sources.length)return;nextIndex++;try{results[index]=await mapper(sources[index],index,operation.controller.signal)}catch(error){if(!firstError)firstError={value:error},nextIndex=sources.length,operation.controller.abort(error);return}}});if(await Promise.all(workers),firstError)throw firstError.value;return results}function sourceLimitResult(){return{ok:!1,errors:[RULE_SOURCE_LIMIT_ERROR],warnings:[],entries:[]}}function projectSyncOptions(options){return{cwd:options.cwd,cacheConfigDir:options.cacheConfigDir,userConfigDir:options.userConfigDir,userConfigPath:options.userConfigPath,projectConfigPath:options.projectConfigPath,global:options.global,check:options.check,only:options.only,refresh:options.refresh}}function projectRemoveOptions(options){let projected=projectSyncOptions(options);return{cwd:projected.cwd,cacheConfigDir:projected.cacheConfigDir,userConfigDir:projected.userConfigDir,userConfigPath:projected.userConfigPath,projectConfigPath:projected.projectConfigPath,global:projected.global,check:projected.check,only:projected.only,refresh:projected.refresh,deleteSource:options.deleteSource}}async function removeRulebookSource(match,options={}){try{return await removeRulebookSourceInternal(match,projectRemoveOptions(options),{})}catch(error){return failWithError(error)}}async function removeRulebookSourceInternal(match,options,hooks){let scope=getScopePaths(options),loaded=readRulesConfig(scope.configTarget);if(loaded.errors.length>0)return{ok:!1,errors:loaded.errors,warnings:[],entries:[]};if(!loaded.config)return{ok:!1,errors:[`No config found at ${scope.configPath}`],warnings:[],entries:[]};let lockResult=readLockfile(scope.lockTarget);if(lockResult.errors.length>0)return{ok:!1,errors:lockResult.errors,warnings:[],entries:[]};let matches=getRemoveMatches(loaded.config.rules,lockResult.lock,match);if(!matches.ok)return matches.result;let sourceDirs=options.deleteSource?getLocalSourceDirsForDelete(scope.configDir,matches.specs,lockResult.lock,scope.filesystemScope):{ok:!0,dirs:[]};if(!sourceDirs.ok)return sourceDirs.result;let before=readPolicyFile(scope.configTarget);if(before===null)return failWithError(Error("Rules config is unavailable."));try{writeJsonAtomic(scope.configTarget,{version:1,rules:loaded.config.rules.filter((spec)=>!matches.specs.includes(spec)),overrides:loaded.config.overrides??{},transparent_wrappers:loaded.config.transparent_wrappers??[]},void 0,hooks._testAfterPolicyRename)}catch(error){throw restoreConfig(scope.configTarget,before),error}let result=await syncRulesConfigInternal(options,createRuleSyncOperation(),void 0,hooks);if(!result.ok)return restoreConfig(scope.configTarget,before),result;let deleteResult=deleteLocalSourceDirs(sourceDirs.dirs,hooks,scope.filesystemScope);if(!deleteResult.ok){restoreConfig(scope.configTarget,before);let rollback=await syncRulesConfigInternal(options,createRuleSyncOperation(),void 0,hooks);if(!rollback.ok)return{ok:!1,errors:[...deleteResult.result.errors,...rollback.errors],warnings:rollback.warnings,entries:rollback.entries};return deleteResult.result}return result}async function checkRulesConfig(config,scope,options){let result=loadScopePolicy(config,scope.lockPath,scope.configDir,options,options.global?"user":"project",scope.filesystemScope);return{ok:result.errors.length===0,errors:result.errors,warnings:[],entries:result.entries}}function preserveDisplayRef(item,previousLock,discoveredDisplayRefs){let previousEntry=previousLock?.rulebooks.find((entry)=>entry.spec===item.entry.spec&&entry.kind==="github"),displayRef=discoveredDisplayRefs?.get(item.entry.spec)??(previousEntry?.kind==="github"?previousEntry.display_ref:void 0);if(!displayRef||item.entry.kind!=="github")return item;return{...item,entry:{...item.entry,display_ref:displayRef}}}function mergeSelectedLockEntries(config,previousLock,resolved){let configuredSpecs=new Set(config.rules),previousSpecs=new Set(previousLock?.rulebooks.map((entry)=>entry.spec)??[]),resolvedBySpec=new Map(resolved.map((item)=>[item.entry.spec,item.entry]));return[...(previousLock?.rulebooks.filter((entry)=>configuredSpecs.has(entry.spec))??[]).map((entry)=>resolvedBySpec.get(entry.spec)??entry),...resolved.filter((item)=>!previousSpecs.has(item.entry.spec)).map((item)=>item.entry)]}function addRuleCount(entry,ruleCountsBySpec){return{...entry,ruleCount:ruleCountsBySpec.get(entry.spec)}}function writeCache(content,entry,configDir,options,filesystemScope){let path=getRulebookCachePath(entry,getRulebookCacheOptions(configDir,options));writePolicyFileAtomic(getPolicyFilesystemTargetForPath(filesystemScope,path),content)}function pruneUnreferencedRulebookCaches(entries,configDir,options,filesystemScope,hooks){let cacheOptions=getRulebookCacheOptions(configDir,options),cacheRoot=getRulebookCacheRoot(cacheOptions),cacheRootTarget=getPolicyFilesystemTargetForPath(filesystemScope,cacheRoot),cacheEntries=readPolicyDirectoryEntries(cacheRootTarget);if(!cacheEntries)return[];let keepTargets=entries.map((entry)=>getPolicyFilesystemTargetForPath(filesystemScope,getRulebookCachePath(entry,cacheOptions))),pruneTargets=cacheEntries.filter((entry)=>entry.kind==="directory").map((entry)=>({directory:getPolicyFilesystemTargetForPath(filesystemScope,join3(cacheRoot,entry.name)),identity:getPolicyFilesystemTargetForPath(filesystemScope,join3(cacheRoot,entry.name,RULEBOOK_FILE))})).filter((candidate)=>!keepTargets.some((target)=>isSamePolicyFilesystemTarget(candidate.identity,target))).map((candidate)=>candidate.directory);for(let target of pruneTargets)validatePolicyDirectoryRemoval(target);return pruneTargets.flatMap((target)=>{try{return pruneRulebookCacheDir(target,hooks),[]}catch{return["Unable to prune rules policy cache safely."]}})}function getLocalSourceDirsForDelete(configDir,specs,lock,filesystemScope){let entriesBySpec=new Map(lock?.rulebooks.map((entry)=>[entry.spec,entry])??[]),errors=specs.flatMap((spec)=>{let entry=entriesBySpec.get(spec);if(!entry)return NAME_PATTERN.test(spec)?[]:["--delete-source can only delete local rulebook sources"];return entry.kind==="local-directory"?[]:["--delete-source can only delete local rulebook sources"]}),dirs=specs.map((spec)=>{let entry=entriesBySpec.get(spec);return join3(configDir,entry?.kind==="local-directory"?entry.path:spec)}),dirErrors=errors.length>0?[]:dirs.flatMap((dir)=>getLocalSourceDirDeleteError(configDir,dir,filesystemScope)),allErrors=[...errors,...dirErrors];return allErrors.length>0?{ok:!1,result:{ok:!1,errors:allErrors,warnings:[],entries:[]}}:{ok:!0,dirs}}function getLocalSourceDirDeleteError(configDir,dir,filesystemScope){let resolvedConfigDir=resolve3(configDir),resolvedDir=resolve3(dir),relativeDir=relative2(resolvedConfigDir,resolvedDir);if(relativeDir===""||relativeDir===".."||relativeDir.startsWith(`..${sep}`)||isAbsolute3(relativeDir))return[`Refusing to delete local rulebook source outside ${configDir}: ${dir}`];let target=getPolicyFilesystemTargetForPath(filesystemScope,resolvedDir),entries=readPolicyDirectoryEntries(target);if(!entries)return[`Local rulebook source directory not found: ${dir}`];let rulebookEntry=entries.find((entry)=>entry.name==="rulebook.json");if(!rulebookEntry)return[`Local rulebook source directory is missing rulebook.json: ${dir}`];if(rulebookEntry.kind!=="file")throw new PolicyFilesystemError(filesystemScope.label);if(readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope,join3(resolvedDir,"rulebook.json"))),entries.length>1)return[`Local rulebook source directory contains extra files: ${dir}. delete manually if you really want to remove the directory.`];return[]}function deleteLocalSourceDirs(dirs,hooks,filesystemScope){let errors=dirs.flatMap((dir)=>{try{return deleteLocalSourceDir(getPolicyFilesystemTargetForPath(filesystemScope,dir),hooks),[]}catch(error){return[`Failed to delete local rulebook source ${dir}: ${error instanceof Error?error.message:String(error)}`]}});return errors.length>0?{ok:!1,result:{ok:!1,errors,warnings:[],entries:[]}}:{ok:!0}}function pruneRulebookCacheDir(target,hooks){if(hooks._testPruneRulebookCacheDir){hooks._testPruneRulebookCacheDir(target.path);return}removePolicyDirectory(target)}function deleteLocalSourceDir(target,hooks){if(hooks._testDeleteLocalSourceDir){hooks._testDeleteLocalSourceDir(target.path);return}removePolicyDirectory(target)}function restoreConfig(path,content){if(content===null){removePolicyFile(path);return}writePolicyFileAtomic(path,content)}function failWithError(error){return{ok:!1,errors:[error instanceof Error?error.message:String(error)],warnings:[],entries:[]}}function getConfigSourceInfo(path,lockPath,userConfigDir,target,filesystemScope){let validation;try{if(readPolicyFile(target)===null)return{path,exists:!1,valid:!1,ruleCount:0};validation=validateRulesConfigFile(target),validation.errors.push(...getRulesConfigRuntimeErrorsForConfig(path,lockPath,{userConfigDir},filesystemScope))}catch(error){if(!(error instanceof PolicyFilesystemError))throw error;validation={errors:[error.message],ruleNames:new Set}}return{path,exists:!0,valid:validation.errors.length===0,ruleCount:validation.ruleNames.size,...validation.errors.length>0?{errors:validation.errors}:{}}}function toEffectiveRule(rule,source){return{source,name:rule.name,command:rule.command,subcommand:rule.subcommand,blockArgs:[...rule.block_args],reason:rule.reason}}function getConfigInfo(cwd,options){let userPath=options?.userConfigPath??getUserRulesConfigPath(),projectPath=options?.projectConfigPath??getProjectRulesConfigPath(cwd),userConfigDir=dirname2(userPath),policy=loadRulesPolicy({cwd,userConfigPath:userPath,projectConfigPath:projectPath,userConfigDir}),paths=getPolicyPaths({cwd,userConfigPath:userPath,projectConfigPath:projectPath,userConfigDir}),rulebookSources=new Map(policy.rulebooks.flatMap((rulebook)=>rulebook.rules.map((rule)=>[rule,rulebook.source])));return{userConfig:getConfigSourceInfo(userPath,getUserRulesLockPath({userConfigPath:userPath}),userConfigDir,paths.userConfigTarget,paths.userScope),projectConfig:getConfigSourceInfo(projectPath,getRulesLockPathForConfigPath(projectPath),userConfigDir,paths.projectConfigTarget,paths.projectScope),effectiveRules:policy.rules.map((rule)=>toEffectiveRule(rule,rulebookSources.get(rule.name)??"project")),shadowedRules:[]}}var ENV_VARS=[{flag:ENV_FLAGS.level,description:"Safety level preset: standard, strict, or paranoid",defaultBehavior:"standard"},{flag:ENV_FLAGS.strict,description:"Legacy; equivalent to safety.overrides.fail_closed",defaultBehavior:"permissive"},{flag:ENV_FLAGS.paranoid,description:"Legacy; equivalent to safety.overrides.paranoid_rm and paranoid_interpreters",defaultBehavior:"off"},{flag:ENV_FLAGS.paranoidRm,description:"Legacy; equivalent to safety.overrides.paranoid_rm",defaultBehavior:"off"},{flag:ENV_FLAGS.paranoidInterpreters,description:"Legacy; equivalent to safety.overrides.paranoid_interpreters",defaultBehavior:"off"},{flag:ENV_FLAGS.worktree,description:"Allow local git discards in linked worktrees",defaultBehavior:"off"},{flag:ENV_FLAGS.debug,description:"Log allowed hook commands for debugging",defaultBehavior:"off"}];function getEnvironmentInfo(){return[...ENV_VARS.map((v)=>({name:v.flag.name,value:getEnvFlagValue(v.flag),isSet:envFlagIsSet(v.flag),legacyName:v.flag.legacyName,legacyValue:v.flag.legacyName?process.env[v.flag.legacyName]:void 0,legacyIsSet:v.flag.legacyName?process.env[v.flag.legacyName]!==void 0:void 0,description:v.description,defaultBehavior:v.defaultBehavior})),{name:"CC_SAFETY_NET_HOME",value:process.env.CC_SAFETY_NET_HOME,isSet:process.env.CC_SAFETY_NET_HOME!==void 0,description:"Override user-scope config/cache directory",defaultBehavior:"~/.cc-safety-net"}]}var severityOrder={error:0,warning:1,info:2},directoryKinds=["policy","config","audit"];function describeDirectoryIssues(issues){return issues.map((issue)=>{if(issue==="ownership")return"is not owned by the current user";if(issue==="permissions")return"has unsafe permissions";if(issue==="symlink")return"is a symbolic link";return"is not a directory"}).join(" and ")}var findingRules=[{derive:(report)=>report.hooks.length>0&&report.hooks.every((hook)=>!hook.configured)?[{checkId:"integration.none-configured",severity:"error",title:"No integration configured",detail:"CC Safety Net is not connected to any supported coding-agent integration.",fixHint:"Run `cc-safety-net install` and configure at least one integration."}]:[]},{derive:(report)=>report.hooks.filter((hook)=>hook.inspectionStatus==="failed").map((hook)=>{let integration=getIntegrationDisplayName(hook.platform);return{checkId:"integration.inspection-failed",severity:"error",title:`${integration} inspection failed`,detail:`Doctor could not verify the ${integration} integration configuration.`,fixHint:`Correct the reported ${integration} configuration error, then run \`cc-safety-net doctor\` again.`,integration:hook.platform}})},{derive:(report)=>report.userConfig.exists&&!report.userConfig.valid?[{checkId:"config.user-invalid",severity:"error",title:"User configuration is invalid",detail:"Doctor could not load a valid user rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:report.userConfig.path}]:[]},{derive:(report)=>report.projectConfig.exists&&!report.projectConfig.valid?[{checkId:"config.project-invalid",severity:"error",title:"Project configuration is invalid",detail:"Doctor could not load a valid project rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:report.projectConfig.path}]:[]},{derive:(report)=>{let debug=report.environment.find((item)=>item.name==="CC_SAFETY_NET_DEBUG");return debug?.value?.trim().toLowerCase()==="1"||debug?.value?.trim().toLowerCase()==="true"?[{checkId:"environment.debug-allow-logging",severity:"warning",title:"Debug allow-logging is enabled",detail:"Allowed hook commands may be written to debug output.",fixHint:"Unset CC_SAFETY_NET_DEBUG, then restart the integration."}]:[]}},...directoryKinds.map((kind)=>({derive:(report)=>report.posture.directories.filter((directory)=>directory.kind===kind&&directory.status==="unsafe").map((directory)=>({checkId:`posture.${kind}-directory-unsafe`,severity:"error",title:`${kind[0]?.toUpperCase()}${kind.slice(1)} directory is unsafe`,detail:`The ${kind} directory ${describeDirectoryIssues(directory.issues)}.`,fixHint:"Ensure this is a real directory owned by the current user with no group or other write access, then rerun doctor.",...directory.path?{path:directory.path}:{}}))})),{derive:(report)=>{let ids=[...report.effectiveSafety.weakenedRuleOverrides].sort();return ids.length>0?[{checkId:"posture.rule-overrides-weaken-preset",severity:"warning",title:"Rule overrides weaken the selected preset",detail:`Explicit overrides disable rules the resolved preset would enable: ${ids.join(", ")}.`,fixHint:`Remove these \`off\` overrides or set them to \`on\`: ${ids.join(", ")}.`}]:[]}}];function deriveDoctorFindings(report){return findingRules.flatMap((rule,catalogOrder)=>rule.derive(report).map((finding,occurrence)=>({finding,catalogOrder,occurrence}))).sort((a,b)=>severityOrder[a.finding.severity]-severityOrder[b.finding.severity]||a.catalogOrder-b.catalogOrder||a.occurrence-b.occurrence).map((entry)=>entry.finding)}function shouldUseColor(){return Boolean(process.stdout.isTTY&&!process.env.NO_COLOR)}var green=(s)=>shouldUseColor()?`\x1B[32m${s}\x1B[0m`:s,yellow=(s)=>shouldUseColor()?`\x1B[33m${s}\x1B[0m`:s,blue=(s)=>shouldUseColor()?`\x1B[34m${s}\x1B[0m`:s,magenta=(s)=>shouldUseColor()?`\x1B[35m${s}\x1B[0m`:s,cyan=(s)=>shouldUseColor()?`\x1B[36m${s}\x1B[0m`:s,red=(s)=>shouldUseColor()?`\x1B[31m${s}\x1B[0m`:s,dim=(s)=>shouldUseColor()?`\x1B[2m${s}\x1B[0m`:s,bold=(s)=>shouldUseColor()?`\x1B[1m${s}\x1B[0m`:s,colors={green,yellow,blue,magenta,cyan,red,dim,bold},ANSI_RESET="\x1B[0m",DISTINCT_COLORS=[39,82,198,226,208,51,196,46,201,214,93,154,220,27,49,190,200,33,129,227,45,160,63,118,123,202];function createRandom(seed){let state=seed;return()=>{return state=(state*1664525+1013904223)%4294967296,state/4294967296}}function getShuffledPalette(seed){let palette=[...DISTINCT_COLORS],random=createRandom(seed);for(let i=palette.length-1;i>0;i--){let j=Math.floor(random()*(i+1)),temp=palette[i];palette[i]=palette[j],palette[j]=temp}return palette}function generateDistinctColor(index,seed=0){if(!shouldUseColor())return"";let palette=getShuffledPalette(seed);return`\x1B[38;5;${palette[index%palette.length]}m`}function colorizeToken(token,index,seed=0){if(!shouldUseColor())return`"${token}"`;return`${generateDistinctColor(index,seed)}"${token}"${ANSI_RESET}`}function formatAsciiTable(options){let rawRows=options.rawRows??options.rows,colWidths=(options.headers??rawRows[0]??[]).map((h,i)=>{let maxDataWidth=Math.max(...rawRows.map((r)=>r[i]?.length??0));return Math.max(h.length,maxDataWidth)}),pad=(s,w,raw)=>s+" ".repeat(Math.max(0,w-raw.length)),line=(char,corners)=>corners[0]+colWidths.map((w)=>char.repeat(w+2)).join(corners[1])+corners[2],formatRow=(cells,rawCells)=>`│ ${cells.map((c,i)=>pad(c,colWidths[i]??0,rawCells[i]??"")).join(" │ ")} │`,headerLines=options.headers?[`   ${formatRow(options.headers,options.headers)}`,`   ${line("─",["├","┼","┤"])}`]:[];return[`   ${line("─",["┌","┬","┐"])}`,...headerLines,...options.rows.map((r,i)=>`   ${formatRow(r,rawRows[i]??[])}`),`   ${line("─",["└","┴","┘"])}`].join(`
`)}function formatHooksSection(hooks){let lines=[];lines.push("Hook Integration"),lines.push(formatHooksTable(hooks));let warnings=[],errors=[];for(let hook of hooks){let platformName=getIntegrationDisplayName(hook.platform);if(hook.errors&&hook.errors.length>0)for(let err of hook.errors)if(hook.configured)warnings.push({platform:platformName,message:err});else errors.push({platform:platformName,message:err})}for(let w of warnings)lines.push(`   Warning (${w.platform}): ${w.message}`);for(let e of errors)lines.push(colors.red(`   Error (${e.platform}): ${e.message}`));return lines.join(`
`)}function formatHooksTable(hooks){let headers=["Platform","Discovery","Configuration","Inspection"],rowData=hooks.map((h)=>{let platformName=getIntegrationDisplayName(h.platform),discovery=h.detected?{text:"Detected",colored:colors.green("Detected")}:h.inspectionStatus==="failed"?{text:"Unknown",colored:colors.red("Unknown")}:{text:"Not detected",colored:colors.dim("Not detected")},configuration=h.configured?{text:"Configured",colored:colors.green("Configured")}:h.detected?{text:"Not configured",colored:colors.yellow("Not configured")}:h.inspectionStatus==="failed"?{text:"Unknown",colored:colors.red("Unknown")}:{text:"Not applicable",colored:colors.dim("Not applicable")},inspection=h.inspectionStatus==="verified"?{text:"Verified",colored:colors.green("Verified")}:h.inspectionStatus==="failed"?{text:"Failed",colored:colors.red("Failed")}:{text:"Not applicable",colored:colors.dim("Not applicable")};return{colored:[platformName,discovery.colored,configuration.colored,inspection.colored],raw:[platformName,discovery.text,configuration.text,inspection.text]}}),rows=rowData.map((r)=>r.colored),rawRows=rowData.map((r)=>r.raw);return formatAsciiTable({headers,rows,rawRows})}function formatEngineSelfTestSection(selfTest){let lines=["Guard Engine Verification",`   Synthetic self-test: ${selfTest.failed>0?colors.red(`${selfTest.passed}/${selfTest.total} FAIL`):colors.green(`${selfTest.passed}/${selfTest.total} passed`)}`],failures=selfTest.results.filter((result)=>!result.passed);if(failures.length>0){lines.push(""),lines.push(colors.red("   Failures:"));for(let failure of failures)lines.push(colors.red(`   • ${failure.description}`)),lines.push(colors.red(`     expected ${failure.expected}, got ${failure.actual}`))}return lines.join(`
`)}function formatRulesTable(rules){if(rules.length===0)return"   (no custom rules)";let headers=["Source","Name","Command","Block Args"],rows=rules.map((r)=>[r.source,r.name,r.subcommand?`${r.command} ${r.subcommand}`:r.command,r.blockArgs.join(", ")]);return formatAsciiTable({headers,rows})}function formatConfigSection(report){let lines=[];if(lines.push("Configuration"),lines.push(formatConfigTable(report.userConfig,report.projectConfig)),lines.push(""),report.effectiveRules.length>0)lines.push(`   Effective rules (${report.effectiveRules.length} total):`),lines.push(formatRulesTable(report.effectiveRules));else lines.push("   Effective rules: (none - using built-in rules only)");for(let shadow of report.shadowedRules)lines.push(""),lines.push(`   Note: Project rule "${shadow.name}" shadows user rule with same name`);return lines.join(`
`)}function formatConfigTable(userConfig,projectConfig){let headers=["Scope","Status"],getStatusDisplay=(config)=>{if(!config.exists)return{text:"N/A",colored:colors.dim("N/A")};if(!config.valid){let text=`Invalid (${config.errors?.[0]??"unknown error"})`;return{text,colored:colors.red(text)}}return{text:"Configured",colored:colors.green("Configured")}},userStatus=getStatusDisplay(userConfig),projectStatus=getStatusDisplay(projectConfig),rows=[["User",userStatus.colored],["Project",projectStatus.colored]],rawRows=[["User",userStatus.text],["Project",projectStatus.text]];return formatAsciiTable({headers,rows,rawRows})}function formatEnvironmentSection(envVars){let lines=[];return lines.push("Environment"),lines.push(formatEnvironmentTable(envVars)),lines.join(`
`)}function formatEffectiveSafetySection(report){let lines=["Effective Safety",`   Selected preset: ${report.effectiveSafety.selectedPreset}`,`   Effective: ${report.effectiveSafety.level}`],capabilityLabels=[["fail_closed","fail_closed"],["paranoid_rm","paranoid_rm"],["paranoid_interpreters","paranoid_interpreters"]];for(let[key,label]of capabilityLabels){let capability=report.effectiveSafety.capabilities[key],state=capability.enabled?colors.green("ON"):colors.dim("OFF"),sources=capability.sources.length>0?` (${capability.sources.join(", ")})`:"";lines.push(`   ${label}: ${state} via ${capability.source}${sources}`)}lines.push(`   Stored rule customizations: ${report.effectiveSafety.ruleCounts.stored}`),lines.push(`   Effective rule customizations: ${report.effectiveSafety.ruleCounts.effective}`);for(let[id,override]of Object.entries(report.effectiveSafety.ruleOverrides))lines.push(`   ${id}: ${override}`);return lines.join(`
`)}function formatFindingsSection(findings){let lines=["Findings"];if(findings.length===0)return lines.push("   No findings from inspected doctor facts."),lines.join(`
`);for(let finding of findings){let label=`[${finding.severity.toUpperCase()}] ${finding.checkId}: ${renderTerminalText(finding.title)}`,color=finding.severity==="error"?colors.red:finding.severity==="warning"?colors.yellow:colors.blue;if(lines.push(`   ${color(label)}`),lines.push(`      ${renderTerminalText(finding.detail)}`),finding.path)lines.push(`      Path: ${renderTerminalText(finding.path)}`);if(finding.fixHint)lines.push(`      Fix: ${renderTerminalText(finding.fixHint)}`)}return lines.join(`
`)}function formatEnvironmentTable(envVars){let headers=["Variable","Status","Legacy"],rows=envVars.map((v)=>{let statusIcon=v.isSet?colors.green("✓"):colors.dim("✗"),legacyStatus=v.legacyName&&v.legacyIsSet?`${v.legacyName} ${colors.green("✓")}`:v.legacyName??"";return[v.name,statusIcon,legacyStatus]}),rawRows=envVars.map((v)=>[v.name,v.isSet?"✓":"✗",v.legacyName&&v.legacyIsSet?`${v.legacyName} ✓`:v.legacyName??""]);return formatAsciiTable({headers,rows,rawRows})}function formatActivitySection(activity){let lines=[];if(activity.totalBlocked===0)lines.push("Recent Activity"),lines.push("   No blocked commands in the last 7 days"),lines.push("   Tip: This is normal for new installations");else lines.push(`Recent Activity (${activity.totalBlocked} blocked / ${activity.sessionCount} sessions)`),lines.push(formatActivityTable(activity.recentEntries));return lines.join(`
`)}function formatActivityTable(entries){let headers=["Time","Command"],rows=entries.map((e)=>{let command=renderTerminalText(e.command.replace(/\r\n|\r|\n/g," ↵ ").replace(/\t/g," ")),cmd=command.length>40?`${command.slice(0,37)}...`:command;return[e.relativeTime,cmd]});return formatAsciiTable({headers,rows})}function formatUpdateSection(update){let lines=[];lines.push("Update Check");let rowData=[];if(update.latestVersion===null&&!update.error)return rowData.push({label:"Status",value:colors.dim("Skipped"),rawValue:"Skipped"}),rowData.push({label:"Installed",value:update.currentVersion,rawValue:update.currentVersion}),lines.push(formatUpdateTable(rowData)),lines.join(`
`);if(update.error)return rowData.push({label:"Status",value:`${colors.yellow("⚠")} Error`,rawValue:"⚠ Error"}),rowData.push({label:"Installed",value:update.currentVersion,rawValue:update.currentVersion}),rowData.push({label:"Error",value:colors.dim(update.error),rawValue:update.error}),lines.push(formatUpdateTable(rowData)),lines.join(`
`);if(update.updateAvailable)return rowData.push({label:"Status",value:`${colors.yellow("⚠")} Update Available`,rawValue:"⚠ Update Available"}),rowData.push({label:"Current",value:update.currentVersion,rawValue:update.currentVersion}),rowData.push({label:"Latest",value:colors.green(update.latestVersion??""),rawValue:update.latestVersion??""}),lines.push(formatUpdateTable(rowData)),lines.push(""),lines.push("   Run: bunx cc-safety-net@latest doctor"),lines.push("   Or:  npx cc-safety-net@latest doctor"),lines.join(`
`);return rowData.push({label:"Status",value:`${colors.green("✓")} Up to date`,rawValue:"✓ Up to date"}),rowData.push({label:"Version",value:update.currentVersion,rawValue:update.currentVersion}),lines.push(formatUpdateTable(rowData)),lines.join(`
`)}function formatUpdateTable(rowData){let rows=rowData.map((r)=>[r.label,r.value]),rawRows=rowData.map((r)=>[r.label,r.rawValue]);return formatAsciiTable({rows,rawRows})}function formatSystemInfoSection(system){let lines=[];return lines.push("System Info"),lines.push(formatSystemInfoTable(system)),lines.join(`
`)}function formatSystemInfoTable(system){let headers=["Component","Version"],formatValue=(value)=>{if(value===null)return colors.dim("not found");return value},rawValue=(value)=>{return value??"not found"},rowData=[{label:"cc-safety-net",value:system.version},{label:"Claude Code",value:system.claudeCodeVersion},{label:"Antigravity CLI",value:system.antigravityCliVersion},{label:"Codex",value:system.codexCliVersion},{label:"Copilot CLI",value:system.copilotCliVersion},{label:"Gemini CLI",value:system.geminiCliVersion},{label:"Kimi Code",value:system.kimiCodeVersion},{label:"OpenCode",value:system.openCodeVersion},{label:"Pi",value:system.piCliVersion},{label:"Node.js",value:system.nodeVersion},{label:"npm",value:system.npmVersion},{label:"Bun",value:system.bunVersion},{label:"Platform",value:system.platform}],rows=rowData.map((r)=>[r.label,formatValue(r.value)]),rawRows=rowData.map((r)=>[r.label,rawValue(r.value)]);return formatAsciiTable({headers,rows,rawRows})}function formatSummary(report){if(report.findings.length===0)return colors.green(`
No findings from inspected doctor facts.`);let counts={error:report.findings.filter((finding)=>finding.severity==="error").length,warning:report.findings.filter((finding)=>finding.severity==="warning").length,info:report.findings.filter((finding)=>finding.severity==="info").length},parts=["error","warning","info"].filter((severity)=>counts[severity]>0).map((severity)=>`${counts[severity]} ${severity}`),label=report.findings.length===1?"finding":"findings",message=`
${report.findings.length} ${label}: ${parts.join(", ")}.`;if(counts.error>0)return colors.red(message);if(counts.warning>0)return colors.yellow(message);return colors.blue(message)}import{existsSync,readdirSync as readdirSync2,readFileSync as readFileSync3}from"node:fs";import{homedir as homedir2}from"node:os";import{join as join5}from"node:path";function stripJsonComments(content){let result="",i=0,inString=!1,isEscaped=!1,lastCommaIndex=-1;while(i<content.length){let char=content[i],next=content[i+1];if(isEscaped){result+=char,isEscaped=!1,i++;continue}if(char==='"'&&!inString){inString=!0,lastCommaIndex=-1,result+=char,i++;continue}if(char==='"'&&inString){inString=!1,result+=char,i++;continue}if(char==="\\"&&inString){isEscaped=!0,result+=char,i++;continue}if(inString){result+=char,i++;continue}if(char==="/"&&next==="/"){while(i<content.length&&content[i]!==`
`)i++;continue}if(char==="/"&&next==="*"){i+=2;while(i<content.length-1){if(content[i]==="*"&&content[i+1]==="/"){i+=2;break}i++}continue}if(char===","){lastCommaIndex=result.length,result+=char,i++;continue}if(char==="}"||char==="]"){if(lastCommaIndex!==-1){let between=result.slice(lastCommaIndex+1);if(/^\s*$/.test(between))result=result.slice(0,lastCommaIndex)+between}lastCommaIndex=-1,result+=char,i++;continue}if(!/\s/.test(char))lastCommaIndex=-1;result+=char,i++}return result}import{join as join4}from"node:path";function getAntigravityHooksPath(homeDir){return join4(homeDir,".gemini","config","hooks.json")}var COPILOT_PLUGIN_CONFIG_PATH="copilot-plugin",CLAUDE_PLUGIN_LIST_CONFIG_PATH="claude plugin list",CLAUDE_SAFETY_NET_PLUGIN_ID="cc-safety-net@cc-marketplace",CODEX_PLUGIN_LIST_CONFIG_PATH="codex plugin list",CODEX_SAFETY_NET_SOURCE="https://github.com/kenryu42/cc-safety-net.git",GEMINI_EXTENSIONS_LIST_CONFIG_PATH="gemini extensions list",GEMINI_SAFETY_NET_SOURCE="https://github.com/kenryu42/gemini-safety-net",ANTIGRAVITY_HOOK_COMMAND_PATTERN=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/,KIMI_HOOK_COMMAND_PATTERN=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;function detectClaudeCode(pluginListOutput){if(!pluginListOutput)return{platform:"claude-code",status:"n/a"};let pluginBlock=_findClaudeSafetyNetPluginBlock(pluginListOutput);if(!pluginBlock)return{platform:"claude-code",status:"n/a"};if(/^\s*Status:\s*.*\bdisabled\b\s*$/im.test(pluginBlock))return{platform:"claude-code",status:"disabled",method:"plugin list",configPath:CLAUDE_PLUGIN_LIST_CONFIG_PATH};if(/^\s*Status:\s*.*\benabled\b\s*$/im.test(pluginBlock))return{platform:"claude-code",status:"configured",method:"plugin list",configPath:CLAUDE_PLUGIN_LIST_CONFIG_PATH};return{platform:"claude-code",status:"disabled",method:"plugin list",configPath:CLAUDE_PLUGIN_LIST_CONFIG_PATH,errors:["Status is not enabled"]}}function _findClaudeSafetyNetPluginBlock(output){let pluginLinePattern=new RegExp(`^\\s*(?:[^\\w\\s@]+\\s+)?${_escapeRegExp(CLAUDE_SAFETY_NET_PLUGIN_ID)}\\s*$`),pluginStartPattern=/^\s*(?:[^\w\s@]+\s+)?\S+@\S+\s*$/,lines=output.split(`
`),startIndex=lines.findIndex((line)=>pluginLinePattern.test(line));if(startIndex===-1)return;let endIndex=lines.findIndex((line,index)=>index>startIndex&&pluginStartPattern.test(line));return lines.slice(startIndex,endIndex===-1?void 0:endIndex).join(`
`)}function _escapeRegExp(value){return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function detectOpenCode(homeDir){let errors=[],configDir=join5(homeDir,".config","opencode"),candidates=["opencode.json","opencode.jsonc"];for(let filename of candidates){let configPath=join5(configDir,filename);if(existsSync(configPath))try{let content=readFileSync3(configPath,"utf-8"),json=stripJsonComments(content);if((JSON.parse(json).plugin??[]).some((p)=>p.includes("cc-safety-net")))return{platform:"opencode",status:"configured",method:"plugin array",configPath,errors:errors.length>0?errors:void 0}}catch(e){errors.push(`Failed to parse ${filename}: ${e instanceof Error?e.message:String(e)}`)}}return{platform:"opencode",status:"n/a",errors:errors.length>0?errors:void 0}}function detectGeminiCLI(extensionsListOutput){if(!extensionsListOutput)return{platform:"gemini-cli",status:"n/a"};let extension=_parseGeminiExtensionsList(extensionsListOutput).find((item)=>item.source?.includes(GEMINI_SAFETY_NET_SOURCE));if(!extension)return{platform:"gemini-cli",status:"n/a"};let errors=extension.enabledWorkspace??extension.enabledUser??!0?[]:[extension.enabledWorkspace===!1?"Enabled (Workspace) is false":"Enabled (User) is false"];if(errors.length>0)return{platform:"gemini-cli",status:"disabled",method:"extension list",configPath:GEMINI_EXTENSIONS_LIST_CONFIG_PATH,errors};return{platform:"gemini-cli",status:"configured",method:"extension list",configPath:GEMINI_EXTENSIONS_LIST_CONFIG_PATH}}function _getKimiConfigPath(homeDir){return join5(process.env.KIMI_CODE_HOME||join5(homeDir,".kimi-code"),"config.toml")}function _findAntigravitySafetyNetHooks(config){if(!config||typeof config!=="object"||Array.isArray(config))return[];return Object.values(config).flatMap((definition)=>{if(!definition||typeof definition!=="object"||Array.isArray(definition))return[];let record=definition,preToolUse=record.PreToolUse;if(!Array.isArray(preToolUse))return[];return preToolUse.flatMap((entry)=>{if(!entry||typeof entry!=="object"||Array.isArray(entry))return[];let hooks=entry.hooks;if(!Array.isArray(hooks))return[];return hooks.flatMap((hook)=>{if(!hook||typeof hook!=="object"||Array.isArray(hook))return[];let command=hook.command;if(typeof command!=="string"||!ANTIGRAVITY_HOOK_COMMAND_PATTERN.test(command))return[];return[{command,enabled:record.enabled!==!1}]})})})}function detectAntigravityCli(homeDir){let configPath=getAntigravityHooksPath(homeDir);if(!existsSync(configPath))return{platform:"antigravity-cli",status:"n/a",configPath};let matches;try{matches=_findAntigravitySafetyNetHooks(JSON.parse(readFileSync3(configPath,"utf-8")))}catch(e){return{platform:"antigravity-cli",status:"n/a",configPath,errors:[`Failed to parse Antigravity hooks config ${configPath}: ${e instanceof Error?e.message:String(e)}`]}}if(matches.some((match)=>match.enabled))return{platform:"antigravity-cli",status:"configured",method:"hook config",configPath};if(matches.length>0)return{platform:"antigravity-cli",status:"disabled",method:"hook config",configPath};return{platform:"antigravity-cli",status:"n/a",configPath}}function detectKimiCode(homeDir){let configPath=_getKimiConfigPath(homeDir);if(!existsSync(configPath))return{platform:"kimi-code",status:"n/a",configPath};try{if(!KIMI_HOOK_COMMAND_PATTERN.test(readFileSync3(configPath,"utf-8")))return{platform:"kimi-code",status:"n/a",configPath}}catch(e){return{platform:"kimi-code",status:"n/a",configPath,errors:[`Failed to read ${configPath}: ${e instanceof Error?e.message:String(e)}`]}}return{platform:"kimi-code",status:"configured",method:"hook config",configPath}}function detectPi(probe){if(!probe||probe.status==="unavailable")return{platform:"pi",status:"n/a"};if(probe.status==="error")return{platform:"pi",status:"n/a",method:"pi probe",errors:[probe.error??"Pi probe failed"]};if(!probe.installedAndEnabled)return{platform:"pi",status:"n/a",method:"pi probe"};let configPaths=probe.matched.map((resource)=>resource.path).filter((path)=>typeof path==="string");return{platform:"pi",status:"configured",method:"pi probe",configPath:configPaths[0],configPaths:configPaths.length>0?configPaths:void 0}}function _parseGeminiExtensionsList(output){return output.split(`
`).reduce((result,line)=>{if(/^\S/.test(line)||result.length===0)return result.push(line),result;let index=result.length-1;return result[index]=`${result[index]}
${line}`,result},[]).map((block)=>({source:/^\s*Source:\s*(.+)$/m.exec(block)?.[1],enabledUser:_parseGeminiEnabledValue(block,"User"),enabledWorkspace:_parseGeminiEnabledValue(block,"Workspace")}))}function _parseGeminiEnabledValue(block,scope){let match=new RegExp(`^\\s*Enabled \\(${scope}\\):\\s*(true|false)\\s*$`,"im").exec(block);if(!match)return;return match[1]==="true"}function detectCodex(pluginListOutput){if(!pluginListOutput)return{platform:"codex",status:"n/a"};let pluginLine=pluginListOutput.split(`
`).find((line)=>line.includes(CODEX_SAFETY_NET_SOURCE));if(!pluginLine)return{platform:"codex",status:"n/a"};if(!pluginLine.includes("installed, enabled"))return{platform:"codex",status:"disabled",method:CODEX_PLUGIN_LIST_CONFIG_PATH,configPath:CODEX_PLUGIN_LIST_CONFIG_PATH,errors:[`Codex plugin line for ${CODEX_SAFETY_NET_SOURCE} must contain installed, enabled.`]};return{platform:"codex",status:"configured",method:CODEX_PLUGIN_LIST_CONFIG_PATH,configPath:CODEX_PLUGIN_LIST_CONFIG_PATH}}function _isSafetyNetCopilotCommand(command){if(!command?.includes("cc-safety-net"))return!1;return/(^|\s)hook\s+(?:[^\s]+\s+)*(--copilot-cli|-cp)(\s|$)/.test(command)}function _parseSemver(version){if(!version)return null;let match=version.match(/(\d+)\.(\d+)\.(\d+)/);if(!match)return null;return[Number(match[1]),Number(match[2]),Number(match[3])]}function _compareSemver(version,threshold){let parsed=_parseSemver(version);if(!parsed)return null;for(let index=0;index<threshold.length;index++){let left=parsed[index]??0,right=threshold[index]??0;if(left>right)return 1;if(left<right)return-1}return 0}function _supportsCopilotUserHookFiles(version){let comparison=_compareSemver(version,[0,0,422]);if(comparison===null)return null;return comparison>=0}function _supportsCopilotInlineHooks(version){let comparison=_compareSemver(version,[1,0,8]);if(comparison===null)return null;return comparison>=0}function _getCopilotConfigHome(homeDir){return process.env.COPILOT_HOME||join5(homeDir,".copilot")}function _hasSafetyNetCopilotHook(config){return(config.hooks?.preToolUse??[]).some((hook)=>{if(hook.type!=="command")return!1;return _isSafetyNetCopilotCommand(hook.command)||_isSafetyNetCopilotCommand(hook.bash)||_isSafetyNetCopilotCommand(hook.powershell)})}function _readCopilotConfigFile(configPath,errors){try{return JSON.parse(stripJsonComments(readFileSync3(configPath,"utf-8")))}catch(e){errors?.push(`Failed to parse ${configPath}: ${e instanceof Error?e.message:String(e)}`);return}}function _listJsonFiles(dirPath,errors){try{return readdirSync2(dirPath).filter((name)=>name.endsWith(".json")).sort((a,b)=>a.localeCompare(b))}catch(e){return errors?.push(`Failed to read ${dirPath}: ${e instanceof Error?e.message:String(e)}`),[]}}function _collectSafetyNetCopilotHookFiles(dirPath,errors){if(!existsSync(dirPath))return[];let matches=[];for(let filename of _listJsonFiles(dirPath,errors)){let configPath=join5(dirPath,filename),config=_readCopilotConfigFile(configPath,errors);if(config&&_hasSafetyNetCopilotHook(config))matches.push(configPath)}return matches}function _collectCopilotInlineConfig(configPath,errors){if(!existsSync(configPath))return;let config=_readCopilotConfigFile(configPath,errors);if(!config)return;return{path:configPath,config}}function _warnOnUnsupportedCopilotSource(errors,version,sourceDescription,requiredVersion){if(version){errors.push(`Copilot CLI ${version} does not support ${sourceDescription}; requires ${requiredVersion}+`);return}errors.push(`Copilot CLI version unavailable; skipping ${sourceDescription} because it requires ${requiredVersion}+`)}function _resolveCopilotInlineDisableSource(inlineSources){let precedence=[inlineSources.localSettings,inlineSources.repoSettings,inlineSources.userConfig];for(let source of precedence){if(source?.config.disableAllHooks===!0)return source.path;if(source?.config.disableAllHooks===!1)return}return}function _checkCopilotEnabled(homeDir,cwd,copilotCliVersion,errors){let configHome=_getCopilotConfigHome(homeDir),repoHookDir=join5(cwd,".github","hooks"),userHookDir=join5(configHome,"hooks"),repoConfigDir=join5(cwd,".github","copilot"),inlineSupport=_supportsCopilotInlineHooks(copilotCliVersion),inlineErrors=inlineSupport===!0?errors:void 0,inlineSources={userConfig:_collectCopilotInlineConfig(join5(configHome,"config.json"),inlineErrors),repoSettings:_collectCopilotInlineConfig(join5(repoConfigDir,"settings.json"),inlineErrors),localSettings:_collectCopilotInlineConfig(join5(repoConfigDir,"settings.local.json"),inlineErrors)};if(inlineSupport!==!1){let disableSource=_resolveCopilotInlineDisableSource(inlineSources);if(disableSource){if(inlineSupport===null)errors.push(`Copilot CLI version unavailable; treating disableAllHooks in ${disableSource} as active`);return{activeConfigPaths:[],disabledBy:disableSource}}}let repoHookPaths=_collectSafetyNetCopilotHookFiles(repoHookDir,errors),userHookSupport=_supportsCopilotUserHookFiles(copilotCliVersion),userHookErrors=userHookSupport===!0?errors:void 0,userHookFiles=existsSync(userHookDir)?_listJsonFiles(userHookDir,userHookErrors):[],userHookPaths=[];for(let filename of userHookFiles){let configPath=join5(userHookDir,filename),config=_readCopilotConfigFile(configPath,userHookErrors);if(config&&_hasSafetyNetCopilotHook(config))userHookPaths.push(configPath)}if(userHookSupport!==!0&&userHookPaths.length>0)_warnOnUnsupportedCopilotSource(errors,copilotCliVersion,`user hook files in ${userHookDir}`,"0.0.422"),userHookPaths.length=0;let inlinePaths=[],inlineSourcesByPrecedence=[inlineSources.localSettings,inlineSources.repoSettings,inlineSources.userConfig];for(let source of inlineSourcesByPrecedence){if(!source)continue;if(!_hasSafetyNetCopilotHook(source.config))continue;if(inlineSupport===!0){inlinePaths.push(source.path);continue}_warnOnUnsupportedCopilotSource(errors,copilotCliVersion,"inline hook definitions in Copilot config files","1.0.8");break}return{activeConfigPaths:[...inlinePaths.filter((path)=>path.endsWith("settings.local.json")),...inlinePaths.filter((path)=>path.endsWith("settings.json")),...repoHookPaths,...inlinePaths.filter((path)=>path.endsWith("config.json")),...userHookPaths]}}function detectAllHooks(cwd,options){let homeDir=options?.homeDir??homedir2(),detectCopilotCLI=()=>{let errors=[],hooksCheck=_checkCopilotEnabled(homeDir,cwd,options?.copilotCliVersion,errors);if(hooksCheck.disabledBy)return{platform:"copilot-cli",status:"disabled",method:"hook config",configPath:hooksCheck.disabledBy,configPaths:[hooksCheck.disabledBy],errors:errors.length>0?errors:void 0};if(options?.copilotPluginInstalled===!0||hooksCheck.activeConfigPaths.length>0){let viaPlugin=options?.copilotPluginInstalled===!0,primaryConfigPath=hooksCheck.activeConfigPaths[0];return{platform:"copilot-cli",status:"configured",method:viaPlugin?"plugin list":"hook config",configPath:primaryConfigPath??(viaPlugin?COPILOT_PLUGIN_CONFIG_PATH:void 0),configPaths:hooksCheck.activeConfigPaths.length>0?hooksCheck.activeConfigPaths:void 0,errors:errors.length>0?errors:void 0}}return{platform:"copilot-cli",status:"n/a",errors:errors.length>0?errors:void 0}};return doctorIntegrationOrder.map((platform)=>{let detection=(()=>{switch(platform){case"claude-code":return detectClaudeCode(options?.claudePluginListOutput);case"antigravity-cli":return detectAntigravityCli(homeDir);case"opencode":return detectOpenCode(homeDir);case"gemini-cli":return detectGeminiCLI(options?.geminiExtensionsListOutput);case"copilot-cli":return detectCopilotCLI();case"kimi-code":return detectKimiCode(homeDir);case"pi":return detectPi(options?.piSafetyNetProbe);case"codex":return detectCodex(options?.codexPluginListOutput)}return platform})();return _toHookStatus(detection)})}function _toHookStatus(detection){return{platform:detection.platform,detected:detection.status!=="n/a",configured:detection.status==="configured",inspectionStatus:detection.status!=="n/a"?"verified":detection.errors&&detection.errors.length>0?"failed":"not-applicable",method:detection.method,configPath:detection.configPath,configPaths:detection.configPaths,errors:detection.errors}}import{lstatSync}from"node:fs";import{dirname as dirname3}from"node:path";function inspectDirectory(kind,path){try{let stat=lstatSync(path);if(stat.isSymbolicLink())return{kind,path,status:"unsafe",issues:["symlink"]};if(!stat.isDirectory())return{kind,path,status:"unsafe",issues:["not-directory"]};if(process.platform==="win32"||typeof process.getuid!=="function")return{kind,path,status:"unknown",issues:[]};let issues=[...stat.uid!==process.getuid()?["ownership"]:[],...(stat.mode&18)!==0?["permissions"]:[]];return{kind,path,status:issues.length>0?"unsafe":"safe",issues}}catch(error){if(typeof error==="object"&&error!==null&&"code"in error&&error.code==="ENOENT")return{kind,path,status:"not-applicable",issues:[]};return{kind,path,status:"unknown",issues:[]}}}function getDoctorPosture(userConfigPath){let auditPath=getAuditLogsDir();return{directories:[inspectDirectory("policy",dirname3(dirname3(userConfigPath))),inspectDirectory("config",dirname3(userConfigPath)),...auditPath?[inspectDirectory("audit",auditPath)]:[{kind:"audit",status:"unknown",issues:[]}]]}}import{spawn}from"node:child_process";import{existsSync as existsSync2}from"node:fs";import{mkdtemp,readFile,rm,writeFile}from"node:fs/promises";import{tmpdir}from"node:os";import{delimiter,extname,join as join6}from"node:path";import{stripVTControlCharacters}from"node:util";var COPILOT_PLUGIN_ID="cc-safety-net@cc-marketplace";function hasIdentifier(output,identifier){let escaped=identifier.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return new RegExp(`(^|[^a-z0-9-])${escaped}([^a-z0-9-]|$)`,"m").test(output??"")}function hasCopilotSafetyNetPlugin(output){return hasIdentifier(output,"cc-safety-net@cc-marketplace")}function hasCopilotMarketplace(output){return hasIdentifier(output,"cc-marketplace")}function hasCopilotLegacyPlugin(output){return hasIdentifier(output,"copilot-safety-net")}var CURRENT_VERSION="1.0.6",VERSION_FETCH_TIMEOUT_MS=2000,PI_PROBE_TIMEOUT_MS=5000,PI_SENTINEL_COMMAND="cc-safety-net",PI_PROBE_COMMAND="__cc_safety_net_probe",TEST_SPAWN_PLATFORM_ENV="_CC_SAFETY_NET_TEST_SPAWN_PLATFORM",PI_PROBE_UNAVAILABLE={status:"unavailable",installedAndEnabled:!1,matched:[]};function getPackageVersion(){return CURRENT_VERSION}function getEnvValue(env,name){let direct=env[name];if(direct)return direct;let matchingName=Object.keys(env).find((key)=>key.toLowerCase()===name.toLowerCase()&&!!env[key]);return matchingName?env[matchingName]:direct}function getWindowsExecutableExtensions(env){return(getEnvValue(env,"PATHEXT")||".COM;.EXE;.BAT;.CMD").split(";").filter((extension)=>extension.length>0)}function resolveWindowsCommand(command,env){let candidates=extname(command)?[command]:[...getWindowsExecutableExtensions(env).map((extension)=>`${command}${extension}`),command];if(command.includes("/")||command.includes("\\"))return candidates.find((candidate)=>existsSync2(candidate))??command;return(getEnvValue(env,"PATH")??"").split(delimiter).flatMap((dir)=>candidates.map((candidate)=>join6(dir,candidate))).find((candidate)=>existsSync2(candidate))??command}function quoteWindowsCommandArg(value){if(!/[\s"&|<>^]/.test(value))return value;return`"${value.replace(/"/g,'""')}"`}function getSpawnCommand(args,env){let[command,...rest]=args,platform=env[TEST_SPAWN_PLATFORM_ENV]==="win32"?"win32":process.platform;if(!command||platform!=="win32")return{cmd:command??"",args:rest};let resolved=resolveWindowsCommand(command,env);if(!/\.(?:bat|cmd)$/i.test(resolved))return{cmd:resolved,args:rest};return{cmd:getEnvValue(env,"COMSPEC")??"cmd.exe",args:["/d","/c",["call",quoteWindowsCommandArg(resolved),...rest.map(quoteWindowsCommandArg)].join(" ")]}}var defaultVersionFetcher=async(args,timeoutMs=VERSION_FETCH_TIMEOUT_MS)=>{let[cmd,...rest]=args;if(!cmd)return null;return new Promise((resolve4)=>{try{let spawnCommand=getSpawnCommand([cmd,...rest],process.env),proc=spawn(spawnCommand.cmd,spawnCommand.args,{stdio:["ignore","pipe","pipe"]}),isSettled=!1,output="",errorOutput="";proc.stdout.on("data",(data)=>{output+=data.toString()}),proc.stderr.on("data",(data)=>{errorOutput+=data.toString()});let finish=(value)=>{if(isSettled)return;isSettled=!0,clearTimeout(timeoutId),resolve4(value)},timeoutId=setTimeout(()=>{proc.kill(),finish(null)},timeoutMs);proc.on("close",(code)=>{finish(code===0?stripVTControlCharacters(output).trim()||stripVTControlCharacters(errorOutput).trim()||null:null)}),proc.on("error",()=>{finish(null)})}catch{resolve4(null)}})},PI_PROBE_EXTENSION=`
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
`.trimStart();function runCommand(args,options){let[cmd,...rest]=args;if(!cmd)return Promise.resolve({code:null,stdout:"",stderr:"",timedOut:!1});return new Promise((resolve4)=>{try{let env={...process.env,...options.env??{}},spawnCommand=getSpawnCommand([cmd,...rest],env),proc=spawn(spawnCommand.cmd,spawnCommand.args,{cwd:options.cwd,env,stdio:["ignore","pipe","pipe"]}),isSettled=!1,stdout="",stderr="";proc.stdout.on("data",(data)=>{stdout+=data.toString()}),proc.stderr.on("data",(data)=>{stderr+=data.toString()});let finish=(result)=>{if(isSettled)return;isSettled=!0,clearTimeout(timeoutId),resolve4(result)},timeoutId=setTimeout(()=>{proc.kill(),finish({code:null,stdout,stderr,timedOut:!0})},options.timeoutMs);proc.on("close",(code)=>{finish({code,stdout,stderr,timedOut:!1})}),proc.on("error",(error)=>{finish({code:null,stdout,stderr,timedOut:!1,error:error.message})})}catch(error){resolve4({code:null,stdout:"",stderr:"",timedOut:!1,error:error instanceof Error?error.message:String(error)})}})}var defaultPiProbeRunner=async(cwd)=>{let tempDir=await mkdtemp(join6(tmpdir(),"cc-safety-net-pi-probe-")),probePath=join6(tempDir,"pi-extension-probe.ts"),resultPath=join6(tempDir,"result.json"),stdoutPath=join6(tempDir,"stdout.jsonl");try{await writeFile(probePath,PI_PROBE_EXTENSION);let result=await runCommand(["pi","-e",probePath,"--mode","json",`/${PI_PROBE_COMMAND} ${PI_SENTINEL_COMMAND}`],{cwd,env:{PI_PROBE_OUT:resultPath},timeoutMs:PI_PROBE_TIMEOUT_MS});if(await writeFile(stdoutPath,result.stdout),result.timedOut)return{status:"error",installedAndEnabled:!1,matched:[],error:"Pi probe timed out"};if(result.error)return{status:"error",installedAndEnabled:!1,matched:[],error:`Pi probe failed: ${result.error}`};if(result.code!==0)return{status:"error",installedAndEnabled:!1,matched:[],error:`Pi probe exited with code ${result.code??"unknown"}${result.stderr.trim()?`: ${result.stderr.trim()}`:""}`};return parsePiProbeResult(await readFile(resultPath,"utf-8"))}catch(error){return{status:"error",installedAndEnabled:!1,matched:[],error:`Pi probe failed: ${error instanceof Error?error.message:String(error)}`}}finally{await rm(tempDir,{recursive:!0,force:!0})}};function parsePiProbeResult(content){try{let parsed=JSON.parse(content);if(!isObject(parsed))return{status:"error",installedAndEnabled:!1,matched:[],error:"Pi probe result was not an object"};let matched=Array.isArray(parsed.matched)?parsed.matched.map(parsePiProbeResource).filter((resource)=>resource!==null):[],installedAndEnabled=parsed.installedAndEnabled===!0;return{status:installedAndEnabled?"configured":"not-found",installedAndEnabled,matched}}catch(error){return{status:"error",installedAndEnabled:!1,matched:[],error:`Failed to parse Pi probe result: ${error instanceof Error?error.message:String(error)}`}}}function parsePiProbeResource(value){if(!isObject(value))return null;if(value.kind!=="command"&&value.kind!=="tool")return null;if(typeof value.name!=="string")return null;return{kind:value.kind,name:value.name,...typeof value.path==="string"?{path:value.path}:{},...typeof value.source==="string"?{source:value.source}:{}}}function isObject(value){return!!value&&typeof value==="object"&&!Array.isArray(value)}function parseVersion(output){if(!output)return null;let claudeMatch=/Claude Code\s+(\d+\.\d+\.\d+)/i.exec(output);if(claudeMatch)return claudeMatch[1]??null;let versionMatch=/v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i.exec(output);if(versionMatch)return versionMatch[1]??null;return output.split(`
`)[0]?.trim()||null}async function getSystemInfo(fetcher=defaultVersionFetcher,options={}){let piRawPromise=fetcher(["pi","--version"]),piProbeRunner=options.piProbeRunner??defaultPiProbeRunner,shouldRunPiProbe=!!options.piProbeRunner||fetcher===defaultVersionFetcher,piProbePromise=piRawPromise.then((piRaw2)=>{if(!piRaw2)return PI_PROBE_UNAVAILABLE;if(!shouldRunPiProbe)return PI_PROBE_UNAVAILABLE;return piProbeRunner(options.cwd??process.cwd())}),fetchCopilotVersion=async()=>{let binaryVersionPromise=fetcher(["copilot","--binary-version"]),fallbackVersionPromise=fetcher(["copilot","--version"]),binaryVersion=await binaryVersionPromise;if(binaryVersion)return binaryVersion;return fallbackVersionPromise},[claudeRaw,claudePluginListOutput,antigravityRaw,openCodeRaw,codexRaw,codexPluginListOutput,geminiRaw,geminiExtensionsListOutput,copilotRaw,kimiRaw,piRaw,nodeRaw,npmRaw,bunRaw,pluginListRaw,piSafetyNetProbe]=await Promise.all([fetcher(["claude","--version"]),fetcher(["claude","plugin","list"]),fetcher(["agy","--version"]),fetcher(["opencode","--version"]),fetcher(["codex","--version"]),fetcher(["codex","plugin","list"]),fetcher(["gemini","--version"]),fetcher(["gemini","extensions","list"]),fetchCopilotVersion(),fetcher(["kimi","--version"]),piRawPromise,fetcher(["node","--version"]),fetcher(["npm","--version"]),fetcher(["bun","--version"]),fetcher(["copilot","plugin","list"]),piProbePromise]);return{version:CURRENT_VERSION,claudeCodeVersion:parseVersion(claudeRaw),claudePluginListOutput,antigravityCliVersion:parseVersion(antigravityRaw),openCodeVersion:parseVersion(openCodeRaw),codexCliVersion:parseVersion(codexRaw),codexPluginListOutput,geminiCliVersion:parseVersion(geminiRaw),geminiExtensionsListOutput,copilotCliVersion:parseVersion(copilotRaw),kimiCodeVersion:parseVersion(kimiRaw),piCliVersion:parseVersion(piRaw),nodeVersion:parseVersion(nodeRaw),npmVersion:parseVersion(npmRaw),bunVersion:parseVersion(bunRaw),copilotPluginInstalled:hasCopilotSafetyNetPlugin(pluginListRaw),piSafetyNetProbe,platform:`${process.platform} ${process.arch}`}}function isNewerVersion(latest,current){if(current==="dev")return!1;let latestParts=latest.split(".").map(Number),currentParts=current.split(".").map(Number),[latestMajor=0,latestMinor=0,latestPatch=0]=latestParts,[currentMajor=0,currentMinor=0,currentPatch=0]=currentParts;if(latestMajor!==currentMajor)return latestMajor>currentMajor;if(latestMinor!==currentMinor)return latestMinor>currentMinor;return latestPatch>currentPatch}async function checkForUpdates(){let currentVersion=getPackageVersion(),controller=new AbortController,timeout=setTimeout(()=>controller.abort(),3000);try{let res=await fetch("https://registry.npmjs.org/cc-safety-net/latest",{signal:controller.signal});if(!res.ok)return{currentVersion,latestVersion:null,updateAvailable:!1,error:`npm registry returned ${res.status}`};let data=await res.json(),updateAvailable=isNewerVersion(data.version,currentVersion);return{currentVersion,latestVersion:data.version,updateAvailable}}catch(e){return{currentVersion,latestVersion:null,updateAvailable:!1,error:e instanceof Error?e.message:"Network error"}}finally{clearTimeout(timeout)}}import*as readline from"node:readline";var CURSOR_DOWN=(rows)=>`\x1B[${rows}B`,CURSOR_UP=(rows)=>`\x1B[${rows}A`;var SCRAMBLE_POOL=["░","▒","▓","╱","╲","┃","━","┏","┓","┗","┛","╋"];function wait(milliseconds){return new Promise((resolve4)=>setTimeout(resolve4,milliseconds))}function waitForAnimationFrame(milliseconds,sleep,signal){if(!signal)return sleep(milliseconds);if(signal.aborted)return Promise.resolve();return new Promise((resolve4,reject)=>{let cleanup=()=>signal.removeEventListener("abort",onAbort),onAbort=()=>{cleanup(),resolve4()};signal.addEventListener("abort",onAbort,{once:!0}),sleep(milliseconds).then(()=>{cleanup(),resolve4()},(error)=>{cleanup(),reject(error)})})}function positiveOrDefault(value,fallback){return value&&value>0?value:fallback}function clamp01(value){return Math.max(0,Math.min(1,value))}function byte(value){return Math.max(0,Math.min(255,Math.round(value)))}function linearToSrgb(value){return value<=0.0031308?12.92*value:1.055*value**0.4166666666666667-0.055}function oklchToSrgb(lightness,chroma,hueDegrees){let hueRadians=hueDegrees*Math.PI/180,a=chroma*Math.cos(hueRadians),b=chroma*Math.sin(hueRadians),l=(lightness+0.3963377774*a+0.2158037573*b)**3,m=(lightness-0.1055613458*a-0.0638541728*b)**3,s=(lightness-0.0894841775*a-1.291485548*b)**3;return{blue:byte(linearToSrgb(clamp01(-0.0041960863*l-0.7034186147*m+1.707614701*s))*255),green:byte(linearToSrgb(clamp01(-1.2684380046*l+2.6097574011*m-0.3413193965*s))*255),red:byte(linearToSrgb(clamp01(4.0767416621*l-3.3077115913*m+0.2309699292*s))*255)}}function rainbow(frequency,offset){let hueDegrees=(offset*frequency*180/Math.PI%360+360)%360;return oklchToSrgb(0.72,0.15,hueDegrees)}function rainbowColorEscape(offset,frequency=0.1){let color=rainbow(frequency,offset);return`\x1B[38;2;${color.red};${color.green};${color.blue}m`}function mixTowardWhite(color,amount){return{blue:byte(color.blue+(255-color.blue)*amount),green:byte(color.green+(255-color.green)*amount),red:byte(color.red+(255-color.red)*amount)}}function hash01(a,b,c){let mixed=Math.imul(a+2654435769,2246822507)^Math.imul(b+3266489909,668265263)^Math.imul(c+374761393,2654435761),x1=mixed^mixed>>>15,x2=Math.imul(x1,739982445),x3=x2^x2>>>12,x4=Math.imul(x3,695872825);return((x4^x4>>>15)>>>0)/4294967296}function scrambleGlyph(lineIndex,columnIndex,frame){let index=Math.floor(hash01(lineIndex,columnIndex,frame)*SCRAMBLE_POOL.length);return SCRAMBLE_POOL[index]??"░"}function smootherstep(progress){let t=clamp01(progress);return t*t*t*(t*(t*6-15)+10)}function buildLine(cells){if(cells.length===0)return"";let parts=[],activeBold=!1,activeColor="";for(let cell of cells){let color=`${cell.red};${cell.green};${cell.blue}`;if(cell.bold!==activeBold)parts.push(cell.bold?"\x1B[1m":"\x1B[22m"),activeBold=cell.bold;if(color!==activeColor)parts.push(`\x1B[38;2;${color}m`),activeColor=color;parts.push(cell.character)}return`${parts.join("")}\x1B[22m\x1B[39m`}function settledLineCells(line,lineIndex,frequency,seed,spread){return line.map((character,columnIndex)=>({...rainbow(frequency,seed+lineIndex+columnIndex/spread),bold:!1,character}))}function wavefrontLineCells(line,lineIndex,frame,frameCount,width,frequency,seed,spread){let revealFrames=Math.max(1,frameCount*0.75),revealProgress=Math.min(1,frame/revealFrames),front=width*smootherstep(revealProgress),settleProgress=Math.max(0,(frame-revealFrames)/Math.max(1,frameCount-revealFrames)),seedOffset=(1-smootherstep(frame/frameCount))*spread*2,settleFlash=0.35*Math.max(0,1-settleProgress*2),revealed=revealProgress>=1,cutoff=Math.min(line.length,Math.ceil(front+2+1));return line.slice(0,cutoff).map((character,columnIndex)=>{let base=rainbow(frequency,seed+lineIndex+columnIndex/spread+seedOffset),position=columnIndex+hash01(lineIndex,columnIndex,7919)*2-1;if(position>front+2)return{...base,bold:!1,character:" "};let distance=front-position,glow=0.8*Math.exp(-(distance*distance)/12.5),boost=Math.min(0.9,glow+settleFlash),scrambling=!revealed&&position>front-4;return{...mixTowardWhite(base,boost),bold:boost>0.3,character:scrambling?scrambleGlyph(lineIndex,columnIndex,frame):character}})}function buildFrame(cellsPerLine){return`\x1B[?2026h${cellsPerLine.map((cells,lineIndex)=>`\x1B8${lineIndex>0?CURSOR_DOWN(lineIndex):""}${buildLine(cells)}`).join("")}\x1B[?2026l`}async function writeAnimatedLolcat(text,options={}){if(!text)return;let output=options.output??process.stdout,sleep=options.sleep??wait,frequency=positiveOrDefault(options.frequency,0.1),seed=options.seed??0,speed=positiveOrDefault(options.speed,40),spread=positiveOrDefault(options.spread,3),frameRate=positiveOrDefault(options.frameRate,60),duration=Math.max(1,Math.floor(positiveOrDefault(options.duration,12))),lines=text.split(`
`).map((line)=>Array.from(line)),width=Math.max(...lines.map((line)=>line.length)),totalDuration=1000*duration*lines.filter((line)=>line.length>0).length/speed,frameCount=width>0?Math.max(1,Math.ceil(totalDuration/(1000/frameRate))):0,frameDelay=frameCount>0?totalDuration/frameCount:0;output.write(`\x1B[?25l${lines.length>1?`${`
`.repeat(lines.length-1)}${CURSOR_UP(lines.length-1)}`:""}\x1B7`);try{for(let frame=1;frame<=frameCount;frame+=1){if(options.signal?.aborted)break;output.write(buildFrame(lines.map((line,lineIndex)=>wavefrontLineCells(line,lineIndex,frame,frameCount,width,frequency,seed,spread)))),await waitForAnimationFrame(frameDelay,sleep,options.signal)}}finally{if(output.write(buildFrame(lines.map((line,lineIndex)=>settledLineCells(line,lineIndex,frequency,seed,spread)))),output.write("\x1B8"),lines.length>1)output.write(CURSOR_DOWN(lines.length-1));output.write(`
\x1B[0m\x1B[?25h`)}}var INSTALL_ASCII_ART=["┏━┛┏━┛  ┏━┛┏━┃┏━┛┏━┛━┏┛┃ ┃  ┏━ ┏━┛━┏┛","┃  ┃    ━━┃┏━┃┏━┛┏━┛ ┃ ━┏┛  ┃ ┃┏━┛ ┃ ","━━┛━━┛  ━━┛┛ ┛┛  ━━┛ ┛  ┛   ┛ ┛━━┛ ┛ "].join(`
`);function shouldPrintInstallBanner(output){return Boolean(output.isTTY)}async function printInstallBanner(options={}){let output=options.output??process.stdout;if(!shouldPrintInstallBanner(output))return;let input=options.input??process.stdin,animationOptions={duration:options.duration,frequency:options.frequency,output,seed:options.seed??Math.random()*8192,sleep:options.sleep,speed:options.speed,spread:options.spread};if(!input.isTTY||typeof input.setRawMode!=="function"){await writeAnimatedLolcat(INSTALL_ASCII_ART,animationOptions);return}let controller=new AbortController,wasFlowing=input.readableFlowing===!0,wasRaw=input.isRaw===!0,interrupted=!1,onKeyPress=(_inputValue,key)=>{if(key.ctrl&&key.name==="c")interrupted=!0;if(interrupted||key.name==="return"||key.name==="enter")controller.abort()};readline.emitKeypressEvents(input),input.on("keypress",onKeyPress),input.setRawMode(!0),input.resume();try{await writeAnimatedLolcat(INSTALL_ASCII_ART,{...animationOptions,signal:controller.signal})}finally{if(input.off("keypress",onKeyPress),input.setRawMode(wasRaw),!wasFlowing)input.pause()}if(!interrupted)return;if(options.onInterrupt){options.onInterrupt();return}process.kill(process.pid,"SIGINT")}var CLEAR_LINE="\r\x1B[2K",HIDE_CURSOR="\x1B[?25l",RESET_FOREGROUND="\x1B[39m",SHOW_CURSOR="\x1B[?25h",SPINNER_DELAY=100,SPINNER_HUE_STEP=0.55,SPINNER_INTERVAL=80,SPINNER_FRAMES=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function wait2(milliseconds){return new Promise((resolve4)=>setTimeout(resolve4,milliseconds))}async function waitForReady(ready,options){let output=options.output??process.stdout;if(!output.isTTY){await ready;return}let sleep=options.sleep??wait2,settled=!1,trackedReady=ready.then((value)=>{return settled=!0,value},(error)=>{throw settled=!0,error});if(await Promise.race([trackedReady.then(()=>!0),sleep(SPINNER_DELAY).then(()=>!1)]))return;output.write(HIDE_CURSOR);try{for(let frameIndex=0;!settled;frameIndex+=1)output.write(`${CLEAR_LINE}${rainbowColorEscape(frameIndex*SPINNER_HUE_STEP)}${SPINNER_FRAMES[frameIndex%SPINNER_FRAMES.length]}${RESET_FOREGROUND} ${options.loadingMessage??"Loading…"}`),await Promise.race([trackedReady,sleep(SPINNER_INTERVAL)]);await trackedReady}finally{output.write(`${CLEAR_LINE}${SHOW_CURSOR}`)}}async function resolveAfterOptionalBanner(showBanner,startWork,printBanner,options={}){let work=startWork();if(showBanner)await printBanner();if(showBanner&&work.ready)await waitForReady(work.ready,options);return work.finish()}import{tmpdir as tmpdir2}from"node:os";import{join as join7}from"node:path";var CASES=Object.freeze([{command:"git reset --hard",description:"git reset --hard",expectBlocked:!0},{command:"rm -rf /",description:"rm -rf /",expectBlocked:!0},{command:"rm -rf ./node_modules",description:"rm in cwd (safe)",expectBlocked:!1}]),SNAPSHOT=Object.freeze({state:"ready",diagnostics:Object.freeze([]),policy:Object.freeze({rules:Object.freeze([]),transparentWrappers:Object.freeze([]),safety:Object.freeze({}),worktreeMode:!1,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:Object.freeze({}),destructiveCommandAllowPaths:Object.freeze([]),secretProtection:Object.freeze({enabled:!0,disabledRules:Object.freeze([]),denyPaths:Object.freeze([])})})}),STANDARD_MODES={strict:!1,paranoidRm:!1,paranoidInterpreters:!1,worktreeMode:!1,effectiveLevel:"standard",capabilities:{fail_closed:{enabled:!1,source:"preset",sources:[]},paranoid_rm:{enabled:!1,source:"preset",sources:[]},paranoid_interpreters:{enabled:!1,source:"preset",sources:[]}},sources:{failClosed:[],paranoidRm:[],paranoidInterpreters:[],worktreeMode:[]}};function runIntegrationSelfTest(){let cwd=join7(tmpdir2(),"cc-safety-net-self-test"),results=CASES.map((testCase)=>{let evaluation=evaluateRuntimeGuard(createToolInvocation("self-test",{command:testCase.command},{kind:"command",shell:"auto"},{configCwd:cwd,executionCwd:cwd},testCase.command),{guard:{dependencies:{loadPolicySnapshot:()=>SNAPSHOT,getModes:()=>STANDARD_MODES,findPolicyMutation:()=>null}},audit:{agent:"self-test",getSessionId:()=>{return}}}),expected=testCase.expectBlocked?"blocked":"allowed",actual=evaluation.decision.kind==="deny"?"blocked":"allowed";return{command:testCase.command,description:testCase.description,expected,actual,passed:expected===actual,reason:evaluation.decision.kind==="deny"?evaluation.decision.reason:void 0,ruleId:evaluation.decision.kind==="deny"?evaluation.decision.ruleId:void 0}});return{passed:results.filter((result)=>result.passed).length,failed:results.filter((result)=>!result.passed).length,total:results.length,results}}function parseDoctorFlags(args){return{json:args.includes("--json"),skipUpdateCheck:args.includes("--skip-update-check")}}async function runDoctor(options={}){let report=await resolveAfterOptionalBanner(!options.json,()=>{let reportPromise=collectDoctorReport(options);return{ready:reportPromise,finish:()=>reportPromise}},()=>printInstallBanner(),{loadingMessage:"Checking system status…"});if(options.json)console.log(JSON.stringify(report,null,2));else printReport(report);return doctorHasFailure(report.hooks,report.engineSelfTest,{userConfig:report.userConfig,projectConfig:report.projectConfig})?1:0}async function collectDoctorReport(options){let cwd=options.cwd??process.cwd(),system=await getSystemInfo(void 0,{cwd}),hooks=detectAllHooks(cwd,{claudePluginListOutput:system.claudePluginListOutput,codexPluginListOutput:system.codexPluginListOutput,geminiExtensionsListOutput:system.geminiExtensionsListOutput,copilotCliVersion:system.copilotCliVersion,copilotPluginInstalled:system.copilotPluginInstalled,piSafetyNetProbe:system.piSafetyNetProbe}),configInfo=getConfigInfo(cwd),environment=getEnvironmentInfo(),policy=loadPolicySnapshot({cwd}).policy,modes=getCCSafetyNetEnvModes(policy),ruleStates=resolveEffectiveDestructiveCommandRules(policy,modes.capabilities),activity=getActivitySummary(7),update=options.skipUpdateCheck?{currentVersion:getPackageVersion(),latestVersion:null,updateAvailable:!1}:await checkForUpdates(),report={hooks,engineSelfTest:runIntegrationSelfTest(),userConfig:configInfo.userConfig,projectConfig:configInfo.projectConfig,effectiveRules:configInfo.effectiveRules,shadowedRules:configInfo.shadowedRules,environment,effectiveSafety:{selectedPreset:policy.safety.level??"standard",level:modes.effectiveLevel,capabilities:modes.capabilities,ruleOverrides:policy.destructiveCommandRuleOverrides,weakenedRuleOverrides:Object.entries(ruleStates).filter(([,state])=>state.source==="rule_override"&&state.override==="off"&&state.inheritedEnabled&&state.changesInherited).map(([id])=>id),ruleCounts:{stored:Object.keys(policy.destructiveCommandRuleOverrides).length,effective:Object.values(ruleStates).filter((state)=>state.changesInherited).length}},posture:getDoctorPosture(configInfo.userConfig.path),activity,update,system};return{...report,findings:deriveDoctorFindings(report)}}function doctorHasFailure(hooks,engineSelfTest,configInfo){return hooks.length>0&&hooks.every((hook)=>!hook.configured)||hooks.some((hook)=>hook.inspectionStatus==="failed")||engineSelfTest.failed>0||configInfo.userConfig.exists&&!configInfo.userConfig.valid||configInfo.projectConfig.exists&&!configInfo.projectConfig.valid}function printReport(report){console.log(),console.log(formatHooksSection(report.hooks)),console.log(),console.log(formatEngineSelfTestSection(report.engineSelfTest)),console.log(),console.log(formatConfigSection(report)),console.log(),console.log(formatEnvironmentSection(report.environment)),console.log(),console.log(formatEffectiveSafetySection(report)),console.log(),console.log(formatFindingsSection(report.findings)),console.log(),console.log(formatActivitySection(report.activity)),console.log(),console.log(formatSystemInfoSection(report.system)),console.log(),console.log(formatUpdateSection(report.update)),console.log(formatSummary(report))}import{resolve as resolve4}from"node:path";function getConfigSource(options){let projectPath=getProjectRulesConfigPath(options?.cwd),userPath=options?.userConfigPath??getUserRulesConfigPath(options),paths=getPolicyPaths({cwd:options?.cwd,userConfigDir:options?.userConfigDir,userConfigPath:options?.userConfigPath});try{if(readPolicyFile(paths.projectConfigTarget)!==null){if(validateRulesConfigFile(paths.projectConfigTarget).errors.length===0)return{configSource:projectPath,configValid:!0};return{configSource:projectPath,configValid:!1}}}catch(error){if(error instanceof PolicyFilesystemError)return{configSource:projectPath,configValid:!1};throw error}try{if(readPolicyFile(paths.userConfigTarget)!==null){let validation=validateRulesConfigFile(paths.userConfigTarget);return{configSource:userPath,configValid:validation.errors.length===0}}return{configSource:null,configValid:!0}}catch(error){if(error instanceof PolicyFilesystemError)return{configSource:userPath,configValid:!1};throw error}}function buildAnalyzeOptions(explainOptions){let cwd=resolve4(explainOptions?.cwd??process.cwd()),policySnapshot=explainOptions?.policySnapshot??loadPolicySnapshot({cwd,userConfigDir:explainOptions?.userConfigDir}),modes=getCCSafetyNetEnvModes(policySnapshot.policy);return{cwd,effectiveCwd:cwd,policySnapshot,strict:explainOptions?.strict??modes.strict,paranoidRm:modes.paranoidRm,paranoidInterpreters:modes.paranoidInterpreters,worktreeMode:modes.worktreeMode}}var PROVIDER_HINTS=["AKIA","ASIA","ghp_","gho_","ghu_","ghs_","ghr_","github_pat_","glpat-","xox","npm_","pypi-","rk_","sk-","sk_","gsk_","xai-","pplx-","bastn_","tgp_v1_","flp_","wfr_","fw_","fwp_","tp-","psk-"];function createCommandTraceContext(recorder){let nextSegmentIndex=0,context={allocateSegment(){return nextSegmentIndex++},getNextSegmentIndex(){return nextSegmentIndex},recordGlobal(step){recorder.record({kind:"step",scope:"global",step})},recordSegment(step,segmentIndex=context.currentSegmentIndex){if(segmentIndex===void 0)return;recorder.record({kind:"step",scope:"segment",segmentIndex,step})}};return context}function createCommandTraceRecorder(options={}){let events=[],maxEvents=options.maxEvents??512,limits={maxTextLength:options.maxTextLength??2048,maxListLength:options.maxListLength??128,maxObjectProperties:options.maxObjectProperties??options.maxListLength??128,maxDepth:options.maxDepth??16},droppedEvents=0,result,sensitiveHashes=new Set;return{record(event){if(result)return;try{if(!event||events.length>=maxEvents){droppedEvents++;return}events.push(deepFreeze(sanitizeEvent(event,limits,sensitiveHashes)))}catch{droppedEvents++}},finish(terminal){if(result)return result;try{result=deepFreeze({events:Object.freeze(events),droppedEvents,terminal:sanitizeTerminal(terminal,limits,sensitiveHashes)})}catch{droppedEvents++,result=Object.freeze({events:Object.freeze(events),droppedEvents,terminal:Object.freeze({result:"blocked",reason:"trace unavailable".slice(0,limits.maxTextLength),segment:"trace unavailable".slice(0,limits.maxTextLength)})})}return result}}}function sanitizeEvent(event,limits,sensitiveHashes){if(event.kind!=="step")throw TypeError("invalid trace event");let{scope,step}=event;collectSensitiveHashes(step,sensitiveHashes,limits);let sanitizedStep=sanitizeValue(step,limits,sensitiveHashes);if(scope==="global")return{kind:"step",scope:"global",step:sanitizedStep};if(scope!=="segment")throw TypeError("invalid trace event scope");return{kind:"step",scope:"segment",segmentIndex:event.segmentIndex,step:sanitizedStep}}function sanitizeTerminal(terminal,limits,sensitiveHashes){let result=terminal.result;if(result==="allowed")return Object.freeze({result:"allowed"});if(result!=="blocked")throw TypeError("invalid trace terminal");let ruleId=terminal.ruleId;return Object.freeze({result:"blocked",reason:sanitizeValue(terminal.reason,limits,sensitiveHashes),segment:sanitizeValue(terminal.segment,limits,sensitiveHashes),...ruleId?{ruleId:sanitizeValue(ruleId,limits,sensitiveHashes)}:{}})}function collectSensitiveHashes(value,hashes,limits,depth=0,seen=new WeakSet){if(typeof value==="string"){let bounded=value.slice(0,limits.maxTextLength);if(!mightContainEnvAssignment(bounded))return;for(let assignment of getEnvAssignmentValues(bounded))for(let token of assignment.match(/[^\s"'()$]+/g)??[])hashes.add(hashText(token));return}if(!value||typeof value!=="object"||depth>=limits.maxDepth||seen.has(value))return;if(seen.add(value),Array.isArray(value)){let length=Math.min(value.length,limits.maxListLength);for(let index=0;index<length;index++)collectSensitiveHashes(value[index],hashes,limits,depth+1,seen);return}let retained=0,sanitizedKeys=new Set;for(let key in value){if(!Object.hasOwn(value,key))continue;if(retained>=limits.maxObjectProperties)break;retained++,collectSensitiveHashes(key,hashes,limits);let sanitizedKey=sanitizeText(key,limits,hashes);if(sanitizedKeys.has(sanitizedKey))continue;sanitizedKeys.add(sanitizedKey),collectSensitiveHashes(value[key],hashes,limits,depth+1,seen)}}function sanitizeValue(value,limits,sensitiveHashes,depth=0,seen=new WeakSet){if(typeof value==="string")return sanitizeText(value,limits,sensitiveHashes);if(!value||typeof value!=="object")return value;if(depth>=limits.maxDepth)return;if(seen.has(value))return;if(seen.add(value),Array.isArray(value)){let sanitized2=[],length=Math.min(value.length,limits.maxListLength);for(let index=0;index<length;index++)sanitized2.push(sanitizeValue(value[index],limits,sensitiveHashes,depth+1,seen));return sanitized2}let sanitized={},retained=0;for(let key in value){if(!Object.hasOwn(value,key))continue;if(retained>=limits.maxObjectProperties)break;retained++;let sanitizedKey=sanitizeText(key,limits,sensitiveHashes);if(Object.hasOwn(sanitized,sanitizedKey))continue;Object.defineProperty(sanitized,sanitizedKey,{value:sanitizeValue(value[key],limits,sensitiveHashes,depth+1,seen),enumerable:!0,configurable:!0,writable:!0})}return sanitized}function sanitizeText(value,limits,sensitiveHashes){let bounded=value.slice(0,limits.maxTextLength),assignmentsRedacted=mightContainEnvAssignment(bounded)?redactEnvAssignmentValues(bounded):bounded,derivedRedacted=sensitiveHashes.size>0?redactDerivedSecrets(assignmentsRedacted,sensitiveHashes):assignmentsRedacted;return(mightContainNonAssignmentSecret(derivedRedacted)?redactNonAssignmentSecrets(derivedRedacted):derivedRedacted).slice(0,limits.maxTextLength)}function mightContainNonAssignmentSecret(text){return text.includes("PRIVATE KEY")||text.includes("://")||text.includes("eyJ")||text.includes(":")&&/(?:authorization|cookie|x-api-key|api-key|(?:^|\s)(?:-u|--user)(?:\s|=))/i.test(text)||text.length>=14&&PROVIDER_HINTS.some((hint)=>text.includes(hint))||text.length>=49&&/\b[a-f0-9]{32}\.[A-Za-z0-9]{16}\b/.test(text)}function redactDerivedSecrets(text,hashes){return text.replace(/[^\s"'()$]+/g,(token)=>hashes.has(hashText(token))?"<redacted>":token)}function hashText(text){let first=2166136261,second=2166136261;for(let index=0;index<text.length;index++)first=Math.imul(first^text.charCodeAt(index),16777619),second=Math.imul(second^text.charCodeAt(text.length-index-1),16777619);return`${first>>>0}:${second>>>0}:${text.length}`}function deepFreeze(value){if(value&&typeof value==="object"&&!Object.isFrozen(value)){for(let child of Object.values(value))deepFreeze(child);Object.freeze(value)}return value}function evaluateCommandWithTrace(command,options,suppliedProgram,suppliedFactStore){let factStore=suppliedFactStore??createSemanticFactStore(),program=suppliedProgram??factStore.getCommandProgram(command,options.shell??"auto"),recorder=createCommandTraceRecorder(),trace=createCommandTraceContext(recorder),displayProgram=program.dialect==="powershell"?factStore.getCommandProgram(command,"posix"):program,entries=projectLegacyCommandEntriesFromProgram(command,displayProgram);trace.recordGlobal({type:"parse",input:command,segments:entries.map((entry)=>[...entry.tokens])});let analysis=analyzeCommandInternal(command,0,{...options,...resolveCommandAnalysisContext(options),invalidReason:void 0,analyzePartialProgram:!0,compatibility:"explain-legacy",factStore,trace},program),index=trace.getNextSegmentIndex();if(analysis&&index>0&&index<entries.length)trace.recordSegment({type:"segment-skipped",index,reason:"prior-segment-blocked"},index);return Object.freeze({analysis,trace:recorder.finish(analysis?{result:"blocked",reason:analysis.reason,segment:analysis.segment,...analysis.ruleId?{ruleId:analysis.ruleId}:{}}:{result:"allowed"}),program})}function explainCommand2(command,options){let analyzeOptions=buildAnalyzeOptions(options),context=resolveCommandAnalysisContext(analyzeOptions),configuration={effectiveLevel:context.effectiveLevel,selectedPreset:analyzeOptions.policySnapshot.policy.safety.level??"standard",effectiveCapabilities:context.effectiveCapabilities,destructiveCommandRuleOverrides:analyzeOptions.policySnapshot.policy.destructiveCommandRuleOverrides},{configSource,configValid}=getConfigSource({cwd:options?.cwd,userConfigDir:options?.userConfigDir});if(!command||!command.trim())return{trace:{steps:[{type:"error",message:"No command provided"}],segments:[]},result:"allowed",configSource,configValid,...configuration};let evaluation=evaluateCommandWithTrace(command,analyzeOptions),activationRuleId=evaluation.analysis?.ruleId??identifyModeGatedCandidate(command,analyzeOptions),activationMetadata=DESTRUCTIVE_COMMAND_RULE_METADATA.find((rule)=>rule.id===activationRuleId&&rule.activationCapability),activationState=activationMetadata?context.policy.effectiveDestructiveCommandRules[activationMetadata.id]:void 0;return{trace:projectExplainTrace(evaluation.trace),result:evaluation.analysis?"blocked":"allowed",reason:evaluation.analysis?sanitizeDiagnosticText(evaluation.analysis.reason):void 0,segment:evaluation.analysis?sanitizeDiagnosticText(evaluation.analysis.segment):void 0,customRule:sanitizeCustomRule(getCustomRule(evaluation.analysis?.ruleId,analyzeOptions.policySnapshot)),configSource,configValid,...configuration,...activationMetadata&&activationState?{ruleActivation:{id:activationMetadata.id,...activationState}}:{}}}function identifyModeGatedCandidate(command,options){let policy=options.policySnapshot.policy,candidateSnapshot=createPolicySnapshot({...policy,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:{...policy.destructiveCommandRuleOverrides,...Object.fromEntries(DESTRUCTIVE_COMMAND_RULE_METADATA.flatMap((rule)=>rule.activationCapability?[[rule.id,"on"]]:[]))}},options.policySnapshot.state==="invalid"?{diagnostics:options.policySnapshot.diagnostics,reason:options.policySnapshot.reason}:void 0);return analyzeCommand(command,{...options,policySnapshot:candidateSnapshot,effectiveCapabilities:void 0,strict:!0,paranoidRm:!0,paranoidInterpreters:!0})?.ruleId}function sanitizeCustomRule(rule){if(!rule)return;return{id:sanitizeDiagnosticText(rule.id),...rule.rulebook?{rulebook:{name:sanitizeDiagnosticText(rule.rulebook.name),version:sanitizeDiagnosticText(rule.rulebook.version)}}:{},...rule.source?{source:sanitizeDiagnosticText(rule.source)}:{},...rule.override?{override:{type:"reason",reason:sanitizeDiagnosticText(rule.override.reason)}}:{}}}function projectExplainTrace(trace){let steps=trace.events.flatMap((event)=>event.kind==="step"&&event.scope==="global"?[event.step]:[]),segments=new Map;for(let event of trace.events){if(event.kind!=="step"||event.scope!=="segment")continue;let segment=segments.get(event.segmentIndex)??{index:event.segmentIndex,steps:[]};segment.steps.push(event.step),segments.set(event.segmentIndex,segment)}return{steps,segments:[...segments.values()]}}function getCustomRule(ruleId,snapshot){let id=ruleId?.replace(/^custom\./,"");if(!id||!snapshot.policy.rules.some((rule)=>rule.name===id))return;return getPolicyRuleMetadata(snapshot,id)??Object.freeze({id})}function parseExplainFlags(args){let json=!1,cwd,remaining=[],i=0;while(i<args.length){let arg=args[i];if(arg==="--help"||arg==="-h"){i++;continue}if(arg==="--"){remaining.push(...args.slice(i+1));break}if(!arg?.startsWith("--")){remaining.push(...args.slice(i));break}if(arg==="--json")json=!0,i++;else if(arg==="--cwd"){if(i++,i>=args.length||args[i]?.startsWith("--"))return console.error("Error: --cwd requires a path"),null;cwd=args[i],i++}else{remaining.push(...args.slice(i));break}}let command=remaining.length===1?remaining[0]:$quote(remaining);if(!command)return console.error("Error: No command provided"),console.error("Usage: cc-safety-net explain [--json] [--cwd <path>] <command>"),null;return{json,cwd,command}}function getBoxChars(asciiOnly){if(asciiOnly)return{dh:"=",dv:"|",dtl:"+",dtr:"+",dbl:"+",dbr:"+",h:"-",v:"|",tl:"+",tr:"+",bl:"+",br:"+",sh:"="};return{dh:"═",dv:"║",dtl:"╔",dtr:"╗",dbl:"╚",dbr:"╝",h:"─",v:"│",tl:"┌",tr:"┐",bl:"└",br:"┘",sh:"━"}}function formatHeader(box,width){let padding=width-18;return[`${box.dtl}${box.dh.repeat(width)}${box.dtr}`,`${box.dv}  Command Analysis${" ".repeat(padding)}${box.dv}`,`${box.dbl}${box.dh.repeat(width)}${box.dbr}`]}function formatTokenArray(tokens){return JSON.stringify(tokens)}function formatColoredTokenArray(tokens,seed=0){return`[${tokens.map((token,index)=>colorizeToken(token,index,seed)).join(",")}]`}function wrapReason(reason,indent,maxWidth=70){let words=reason.split(" "),lines=[],current="";for(let word of words)if(current.length+word.length+1>maxWidth)lines.push(current),current=word;else current=current?`${current} ${word}`:word;if(current)lines.push(current);return lines.map((line,i)=>i===0?line:`${indent}${line}`)}function formatStepStyleD(step,stepNum,box){let lines=[];switch(step.type){case"parse":return null;case"env-strip":{lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Strip environment variables`);let envKeys=Object.keys(step.envVars);return lines.push(`  Removed: ${envKeys.map((k)=>`${k}=<redacted>`).join(", ")}`),lines.push(`  Tokens:  ${formatTokenArray(step.output)}`),{lines,incrementStep:!0}}case"leading-tokens-stripped":return lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Strip wrappers`),lines.push(`  Removed: ${step.removed.join(", ")}`),lines.push(`  Tokens:  ${formatTokenArray(step.output)}`),{lines,incrementStep:!0};case"shell-wrapper":return lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Detect shell wrapper`),lines.push(`  Wrapper: ${step.wrapper} -c`),lines.push(`  Inner:   ${step.innerCommand}`),{lines,incrementStep:!0};case"interpreter":{if(lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Detect interpreter`),lines.push(`  Interpreter: ${step.interpreter}`),lines.push(`  Code:        ${step.codeArg}`),step.paranoidBlocked)lines.push("  Result:      ✗ BLOCKED (paranoid mode)");return{lines,incrementStep:!0}}case"busybox":return lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Busybox wrapper`),lines.push(`  Subcommand: ${step.subcommand}`),{lines,incrementStep:!0};case"transparent-wrapper":return lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Transparent wrapper`),lines.push(`  Wrapper: ${step.wrapper}`),lines.push(`  Tokens:  ${formatTokenArray(step.output)}`),{lines,incrementStep:!0};case"recurse":return{lines:[],incrementStep:!1};case"rule-check":{lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Match rules`);let ruleRef=`${step.ruleModule}:${step.ruleFunction}()`;if(lines.push(`  Rule:   ${ruleRef}`),step.matched)lines.push("  Result: MATCHED");else lines.push("  Result: No match");return{lines,incrementStep:!0}}case"worktree-relaxation":return lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Worktree relaxation`),lines.push(`  Mode:   ${ENV_FLAGS.worktree.name}`),lines.push(`  Git cwd: ${step.gitCwd}`),lines.push("  Result: Allowed local discard in linked worktree"),{lines,incrementStep:!0};case"tmpdir-check":return null;case"fallback-scan":{if(step.embeddedCommandFound)return lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Fallback scan`),lines.push(`  Found: ${step.embeddedCommandFound}`),{lines,incrementStep:!0};return null}case"custom-rules-check":{if(step.rulesChecked){if(lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Custom rules`),step.matched)lines.push("  Result: MATCHED");else lines.push("  Result: No match");return{lines,incrementStep:!0}}return null}case"cwd-change":return null;case"dangerous-text":{if(step.matched)return lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Dangerous text check`),lines.push(`  Token:  ${step.token}`),lines.push("  Result: MATCHED"),{lines,incrementStep:!0};return null}case"strict-unparseable":return lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Strict mode check`),lines.push(`  Command: ${step.rawCommand}`),lines.push("  Result:  ✗ UNPARSEABLE"),{lines,incrementStep:!0};case"segment-skipped":return null;case"error":return lines.push(""),lines.push(`ERROR: ${step.message}`),{lines,incrementStep:!1};default:return null}}function formatTraceHuman(result,options){let box=getBoxChars(options?.asciiOnly??!1),width=58,lines=[],stepNum=1;lines.push(...formatHeader(box,58)),lines.push("");let errorStep=result.trace.steps.find((s)=>s.type==="error");if(errorStep&&errorStep.type==="error"){lines.push("ERROR"),lines.push(`  ${errorStep.message}`),lines.push(""),lines.push("RESULT"),lines.push(`  Status: ${result.result==="blocked"?colors.red("BLOCKED"):colors.green("ALLOWED")}`),lines.push(""),lines.push("CONFIG");let configPath2=result.configSource??"none";return lines.push(`  Path: ${configPath2}`),lines.join(`
`)}let parseStep=result.trace.steps.find((s)=>s.type==="parse");if(parseStep&&parseStep.type==="parse"){lines.push("INPUT"),lines.push(`  ${parseStep.input}`),lines.push(""),lines.push(`STEP ${stepNum} ${box.h} Split shell commands`),stepNum++;for(let i=0;i<parseStep.segments.length;i++){let seg=parseStep.segments[i];if(seg){let seed=Math.random();lines.push(`  Segment ${i+1}: ${formatColoredTokenArray(seg,seed)}`)}}}let segments=result.trace.segments,hasMultipleSegments=segments.length>1;for(let seg of segments){if(hasMultipleSegments){lines.push("");let segCommand="";if(parseStep&&parseStep.type==="parse"){let tokens=parseStep.segments[seg.index];if(tokens)segCommand=tokens.join(" ")}let maxLabelLen=54,displayCommand=segCommand,baseLabel=` Segment ${seg.index+1}: `,suffix=" ";if(segCommand){if(baseLabel.length+segCommand.length+suffix.length>maxLabelLen){let availableForCmd=maxLabelLen-baseLabel.length-suffix.length;displayCommand=`${segCommand.substring(0,availableForCmd-1)}…`}}let labelContent=segCommand?`${baseLabel}${displayCommand}${suffix}`:` Segment ${seg.index+1} `,coloredContent=segCommand?`${baseLabel}${colors.cyan(displayCommand)}${suffix}`:labelContent,segLineLen=58-labelContent.length,leftLen=Math.floor(segLineLen/2),rightLen=segLineLen-leftLen;lines.push(`${box.sh.repeat(leftLen)}${coloredContent}${box.sh.repeat(rightLen)}`)}if(seg.steps.find((s)=>s.type==="segment-skipped")){lines.push(""),lines.push("  (skipped — prior segment blocked)");continue}let inRecursion=!1,hasVisibleSteps=!1;for(let step of seg.steps){let formattedStep=formatStepStyleD(step,stepNum,box);if(formattedStep){if(hasVisibleSteps=!0,step.type==="recurse"){lines.push("");let recurseLabel=" RECURSING ",recurseLineLen=58-recurseLabel.length-4;lines.push(`  ${box.tl}${box.h}${recurseLabel}${box.h.repeat(recurseLineLen)}`),lines.push(`  ${box.v}`),inRecursion=!0;continue}for(let line of formattedStep.lines)if(inRecursion)lines.push(`  ${box.v} ${line}`);else lines.push(line);if(formattedStep.incrementStep)stepNum++}}if(inRecursion)lines.push(`  ${box.v}`),lines.push(`  ${box.bl}${box.h.repeat(56)}`),inRecursion=!1;if(!hasVisibleSteps)lines.push(""),lines.push(`  ${colors.green("✓")} Allowed (no matching rules)`)}if(lines.push(""),lines.push("RESULT"),result.result==="blocked"){if(lines.push(`  Status: ${colors.red("BLOCKED")}`),result.customRule){if(lines.push(`  Rule: ${result.customRule.id}`),result.customRule.rulebook)lines.push(`  Rulebook: ${result.customRule.rulebook.name} ${result.customRule.rulebook.version}`);if(result.customRule.source)lines.push(`  Source: ${result.customRule.source}`);if(result.customRule.override)lines.push(`  Override: reason ${result.customRule.override.reason}`)}if(result.reason){let reasonLines=wrapReason(result.reason,"          ");lines.push(`  Reason: ${reasonLines[0]}`);for(let i=1;i<reasonLines.length;i++)lines.push(reasonLines[i]??"")}}else lines.push(`  Status: ${colors.green("ALLOWED")}`);lines.push(""),lines.push("CONFIG");let configPath=result.configSource??"none",configStatus=result.configValid?"":" (invalid)";lines.push(`  Path: ${configPath}${configStatus}`),lines.push(`  Safety preset: ${result.selectedPreset??"standard"}`),lines.push(`  Effective capabilities: ${result.effectiveLevel}`);let overrides=Object.entries(result.destructiveCommandRuleOverrides??{});if(lines.push(`  Rule customizations: ${overrides.length}`),result.ruleActivation)lines.push(`  Rule activation: ${result.ruleActivation.id} — ${result.ruleActivation.enabled?"on":"off"} via ${result.ruleActivation.source}`);return lines.join(`
`)}function formatTraceJson(result){return JSON.stringify(result,null,2)}import{spawn as spawn2}from"node:child_process";import{randomBytes}from"node:crypto";import{createServer}from"node:http";var ENTRY_CAP=500;function getActivityFeed(days,logsDir=getAuditLogsDir()){let cutoff=Date.now()-days*24*60*60*1000,windowEntries=[],totalBlockedAllTime=0;for(let file of logsDir?listAuditLogFiles(logsDir):[])for(let entry of readAuditLogEntries(file)){if(!entry||typeof entry.ts!=="string"||typeof entry.command!=="string")continue;if(entry.decision!=="allow")totalBlockedAllTime++;let ts=new Date(entry.ts).getTime();if(Number.isFinite(ts)&&ts>=cutoff)windowEntries.push(entry)}windowEntries.sort((a,b)=>new Date(b.ts).getTime()-new Date(a.ts).getTime());let dayStart=(date)=>new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime(),todayStart=dayStart(new Date),blockedByDay=Array.from({length:days},()=>0),agents={},sessions=new Set,rules={},blocked=0,errors=0;for(let entry of windowEntries){let agent=entry.agent||"unknown";if(agents[agent]=(agents[agent]??0)+1,entry.sessionId)sessions.add(entry.sessionId);if(entry.decision!=="allow"){if(blocked++,entry.ruleId)rules[entry.ruleId]=(rules[entry.ruleId]??0)+1;if(entry.failureStage)errors++;let daysAgo=Math.round((todayStart-dayStart(new Date(entry.ts)))/86400000),bucket=days-1-daysAgo;if(daysAgo>=0&&daysAgo<days)blockedByDay[bucket]=(blockedByDay[bucket]??0)+1}}return{days,logsDir,totalBlockedAllTime,totalInWindow:windowEntries.length,truncated:windowEntries.length>ENTRY_CAP,counts:{blocked,allowed:windowEntries.length-blocked,sessions:sessions.size,agents,blockedByDay,rules,errors},entries:windowEntries.slice(0,ENTRY_CAP)}}var custom_default=`/* cc-safety-net-gui-custom-css */
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

  --warn-fg: light-dark(#b45309, #fbbf24);
  --warn-bg: light-dark(#fefaf0, #2a2008);
  --warn-border: light-dark(#f2ddb0, #5c4a1d);

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

  --topbar-h: 58px;

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

.app-shell {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 14px;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.brand {
  padding: 0 10px;
}

h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-logo {
  display: flex;
  color: var(--ink);
}

.brand-logo svg {
  width: auto;
  height: 30px;
}

.sidenav {
  display: grid;
  gap: 2px;
}

.sidenav a {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.sidenav a:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.sidenav a[aria-current="page"] {
  background: var(--surface-2);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--border);
}

.sidenav svg {
  width: 15px;
  height: 15px;
  flex: none;
}

.sidebar-foot {
  margin-top: auto;
  display: grid;
  gap: 10px;
  padding: 0 10px;
}

.sidebar-links {
  display: grid;
  gap: 5px;
  font-size: 12px;
}

.sidebar-links a {
  color: var(--meta);
  text-decoration: none;
}

.sidebar-links a:hover {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.sidebar-links a:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 3px;
}

.content {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-foot {
  display: none;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  min-height: var(--topbar-h);
  padding: 12px 28px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
  max-width: 1040px;
  margin: 0 auto;
}

.topbar-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.app-status {
  display: inline-flex;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}

.app-status:empty {
  display: none;
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

.dirty-chip {
  padding: 6px 12px;
  border: 1px solid var(--warn-border);
  border-radius: 999px;
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.view-search {
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
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 28px 48px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.view {
  display: grid;
  gap: 18px;
}

.view[hidden] {
  display: none;
}

.view-head .panel-sub {
  margin-top: 0;
}

.view-head.policy-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.view-head-text {
  min-width: 0;
}

.policy-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.policy-savebar {
  position: sticky;
  top: var(--topbar-h);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.savebar-actions {
  display: flex;
  gap: 8px;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.tiles:empty {
  display: none;
}

.tile {
  display: grid;
  gap: 3px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.tile strong {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.tile span {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
}

.view-all-link {
  align-self: center;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}

.view-all-link:hover {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.protection-warning {
  border-color: var(--err-border);
  background: color-mix(in srgb, var(--err-bg) 60%, var(--surface));
}

#top-rules {
  display: grid;
  gap: 6px;
}

.top-rule {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  text-align: left;
}

.guard-errors {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--warn-border);
  border-radius: var(--radius);
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
}

.activity-controls {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}

.activity-controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.activity-days {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--muted);
}

.activity-search-field {
  flex: 1 1 220px;
}

select {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 8px 10px;
  background: var(--field-bg);
  color: var(--ink);
  font: inherit;
}

.chip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.chip-row:empty {
  display: none;
}

button.chip {
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

button.chip[aria-pressed="true"] {
  background: var(--master-bg);
  border-color: var(--master-border);
  color: var(--master-fg);
}

.chip-count {
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.feed-list {
  display: grid;
  gap: 8px;
}

.feed-item {
  display: grid;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.feed-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--meta);
}

.feed-meta time {
  margin-left: auto;
  white-space: nowrap;
}

.feed-meta .rule-id {
  font-family: var(--font-mono);
  color: var(--muted);
  overflow-wrap: anywhere;
}

.decision-badge {
  padding: 1px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.decision-badge.deny {
  color: var(--err-fg);
  background: var(--err-bg);
  border-color: var(--err-border);
}

.decision-badge.allow {
  color: var(--ok-fg);
  background: var(--ok-bg);
  border-color: var(--ok-border);
}

.decision-badge.error {
  color: var(--warn-fg);
  background: var(--warn-bg);
  border-color: var(--warn-border);
}

.agent-badge {
  padding: 1px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--muted);
  font-weight: 600;
}

.feed-command {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 7.2em;
  overflow: hidden;
}

.feed-command.clamped {
  mask-image: linear-gradient(180deg, #000 calc(100% - 1.6em), transparent);
}

.feed-command.expanded {
  max-height: none;
  mask-image: none;
}

.feed-toggle {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.feed-day-sep {
  padding-top: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.tile-spark {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 28px;
  margin-top: 8px;
}

.spark-bar {
  flex: 1 1 0;
  min-width: 1px;
  background: var(--accent);
  border-radius: 1px;
}

.feed-reason {
  margin: 0;
  font-size: 12px;
}

.activity-count {
  margin: 12px 0 0;
  font-size: 12px;
}

.activity-count:empty {
  display: none;
}

.info-rows {
  display: grid;
  gap: 10px;
}

.info-row {
  display: grid;
  gap: 3px;
}

.info-row > span {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
}

.info-row code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.danger-row strong {
  font-size: 13px;
}

.danger-row p {
  margin: 4px 0 0;
  font-size: 12px;
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
.rule-tier-head[aria-expanded="false"] .panel-chevron {
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

#safety-preset-status:empty {
  display: none;
}

.preset-status.customized {
  color: var(--master-fg);
}

.panel-head-action {
  flex: none;
}

.rule-tier {
  overflow: clip;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
}

.rule-tier + .rule-tier,
#destructive-command-rules + .rule-tier {
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
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border: 0;
  border-radius: 0;
  background: var(--surface-2);
  color: var(--ink);
  text-align: left;
}

.rule-tier-head:hover:not(:disabled) {
  background: var(--surface-2);
}

.rule-tier-strict .rule-tier-head,
.rule-tier-strict .rule-tier-head:hover:not(:disabled) {
  background: var(--strict-bg);
  color: var(--strict-fg);
}

.rule-tier-paranoid .rule-tier-head,
.rule-tier-paranoid .rule-tier-head:hover:not(:disabled) {
  background: var(--paranoid-bg);
  color: var(--paranoid-fg);
}

.tier-label {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.tier-label small,
.tier-counts {
  color: inherit;
  font-size: 11px;
  opacity: 0.82;
}

.tier-counts {
  flex: none;
  font-weight: 500;
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

.rule-row-enforced .rule-control {
  cursor: default;
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

.paths-content:not([hidden]) {
  display: grid;
  gap: 10px;
}

.paths-content > p.muted {
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

.paths-add {
  display: flex;
  gap: 8px;
}

.paths-add input[type="text"] {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.paths-add button {
  flex: none;
  align-self: center;
}

.paths-hint {
  margin: -6px 0 0;
  color: var(--err-fg);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.paths-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.path-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-item code {
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

.path-item button:hover:not(:disabled) {
  color: var(--err-fg);
  border-color: var(--err-border);
  background: var(--err-bg);
}

.path-item.row-disabled {
  opacity: 0.62;
}

.path-item.row-disabled button {
  cursor: not-allowed;
}

.path-item button {
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

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none;
  }
}

@media (max-width: 900px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .app-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }

  .sidebar {
    z-index: 100;
    height: auto;
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .topbar {
    position: static;
    z-index: auto;
  }

  .brand {
    flex: none;
    padding: 0;
  }

  main {
    flex: 1;
  }

  .app-foot {
    display: flex;
    justify-content: center;
    gap: 28px;
    padding: 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }

  .app-foot a {
    color: var(--meta);
    text-decoration: none;
  }

  .app-foot a:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .sidenav {
    display: flex;
    flex: 1;
    justify-content: flex-end;
    gap: 2px;
  }

  .sidenav a {
    padding: 7px 9px;
  }

  .sr-only-collapse {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .sidebar-foot {
    display: none;
  }
}

@media (max-width: 640px) {
  .topbar {
    padding: 10px 16px;
  }

  .topbar-row {
    flex-wrap: wrap;
  }

  main {
    padding: 18px 16px 40px;
  }

  .view-search {
    flex: none;
    max-width: none;
    width: 100%;
  }

  .view-head.policy-head {
    flex-direction: column;
    align-items: stretch;
  }

  .policy-toolbar {
    width: 100%;
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

  .rule-tier-head {
    flex-wrap: wrap;
  }

  .rule-row {
    align-items: start;
  }

  .tier-counts {
    flex: 1 1 100%;
    padding-left: 20px;
    text-align: left;
  }

  .inherit-button {
    align-self: flex-start;
  }
}

[hidden] {
  display: none;
}
`;var logo_default=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 512" role="img" aria-label="CC Safety Net">
  <path d="M 1439 165 L 1411 165 L 1409 166 L 1408 168 L 1403 173 L 1403 174 L 1398 179 L 1398 180 L 1395 183 L 1394 183 L 1394 184 L 1385 194 L 1385 195 L 1381 199 L 1381 200 L 1378 202 L 1378 203 L 1374 207 L 1374 208 L 1367 215 L 1367 216 L 1358 226 L 1358 227 L 1352 233 L 1352 234 L 1347 239 L 1347 240 L 1341 246 L 1341 247 L 1336 252 L 1336 253 L 1332 257 L 1332 258 L 1325 265 L 1325 266 L 1319 272 L 1319 273 L 1314 278 L 1314 279 L 1309 284 L 1309 285 L 1303 291 L 1303 292 L 1299 296 L 1299 297 L 1294 302 L 1291 299 L 1290 300 L 1290 301 L 1293 301 L 1294 302 L 1288 309 L 1287 308 L 1288 309 L 1286 312 L 1285 311 L 1285 306 L 1286 305 L 1286 303 L 1288 299 L 1288 296 L 1289 295 L 1289 292 L 1290 291 L 1290 287 L 1291 286 L 1291 284 L 1293 280 L 1293 277 L 1294 276 L 1294 272 L 1295 271 L 1295 269 L 1297 265 L 1297 262 L 1298 261 L 1298 258 L 1299 257 L 1299 253 L 1300 252 L 1300 250 L 1301 249 L 1301 247 L 1303 243 L 1303 238 L 1304 237 L 1304 235 L 1305 234 L 1305 232 L 1307 228 L 1307 224 L 1308 223 L 1308 221 L 1309 220 L 1309 217 L 1310 216 L 1310 214 L 1312 210 L 1312 205 L 1314 202 L 1314 199 L 1316 195 L 1317 188 L 1318 187 L 1318 185 L 1319 184 L 1319 182 L 1321 178 L 1321 173 L 1323 169 L 1323 166 L 1296 166 L 1296 168 L 1294 171 L 1294 174 L 1293 175 L 1293 178 L 1292 179 L 1291 186 L 1290 187 L 1290 189 L 1289 190 L 1289 192 L 1287 196 L 1287 200 L 1285 204 L 1285 207 L 1283 211 L 1283 215 L 1282 216 L 1282 218 L 1281 219 L 1281 222 L 1279 226 L 1279 229 L 1278 230 L 1278 234 L 1277 235 L 1277 237 L 1276 238 L 1276 240 L 1274 244 L 1274 249 L 1273 250 L 1273 252 L 1271 256 L 1271 259 L 1270 260 L 1270 263 L 1269 264 L 1269 268 L 1268 269 L 1268 271 L 1266 275 L 1266 278 L 1265 279 L 1265 284 L 1264 285 L 1264 287 L 1262 291 L 1262 294 L 1261 295 L 1261 298 L 1260 299 L 1259 306 L 1258 307 L 1258 309 L 1257 310 L 1257 313 L 1256 314 L 1256 318 L 1254 322 L 1254 325 L 1273 325 L 1274 327 L 1273 328 L 1272 327 L 1273 328 L 1269 332 L 1269 333 L 1265 337 L 1265 338 L 1261 341 L 1261 342 L 1252 352 L 1252 353 L 1247 358 L 1247 359 L 1242 364 L 1242 365 L 1239 367 L 1239 368 L 1224 385 L 1224 386 L 1220 390 L 1220 391 L 1216 395 L 1216 396 L 1214 397 L 1214 399 L 1247 399 L 1249 397 L 1249 396 L 1259 385 L 1259 384 L 1263 380 L 1263 379 L 1265 377 L 1266 377 L 1266 376 L 1271 371 L 1271 370 L 1278 363 L 1278 362 L 1283 357 L 1283 356 L 1294 344 L 1294 343 L 1298 339 L 1298 338 L 1305 331 L 1305 330 L 1309 326 L 1309 325 L 1312 323 L 1313 320 L 1315 319 L 1316 317 L 1321 312 L 1322 312 L 1321 311 L 1330 301 L 1330 300 L 1335 295 L 1335 294 L 1337 292 L 1338 292 L 1339 289 L 1342 287 L 1342 286 L 1346 282 L 1346 281 L 1352 275 L 1352 274 L 1361 264 L 1361 263 L 1370 253 L 1370 252 L 1375 247 L 1375 246 L 1380 241 L 1380 240 L 1387 233 L 1387 232 L 1402 215 L 1402 214 L 1406 210 L 1406 209 L 1408 207 L 1409 207 L 1409 206 L 1413 202 L 1413 201 L 1418 196 L 1418 195 L 1422 191 L 1422 190 L 1427 185 L 1427 184 L 1431 180 L 1431 179 L 1440 169 L 1441 167 Z
M 1129 179 L 1126 178 L 1125 176 L 1124 176 L 1116 170 L 1114 170 L 1107 166 L 1105 166 L 1104 165 L 1101 165 L 1100 164 L 1096 164 L 1095 163 L 1091 163 L 1090 162 L 1081 162 L 1080 161 L 1076 161 L 1075 162 L 1066 162 L 1065 163 L 1061 163 L 1060 164 L 1057 164 L 1056 165 L 1051 165 L 1050 166 L 1045 167 L 1040 170 L 1038 170 L 1028 175 L 1023 179 L 1021 179 L 1017 183 L 1016 183 L 1012 187 L 1011 187 L 999 199 L 999 200 L 996 203 L 996 204 L 994 205 L 993 208 L 990 211 L 981 229 L 981 231 L 980 232 L 980 234 L 979 235 L 979 237 L 977 241 L 977 244 L 976 245 L 976 254 L 975 255 L 975 265 L 976 266 L 976 273 L 977 274 L 977 277 L 980 283 L 981 288 L 984 292 L 985 295 L 988 298 L 989 301 L 998 310 L 1001 311 L 1004 314 L 1007 315 L 1009 317 L 1013 319 L 1015 319 L 1018 321 L 1020 321 L 1024 323 L 1027 323 L 1028 324 L 1035 324 L 1036 325 L 1054 325 L 1055 324 L 1062 324 L 1063 323 L 1067 323 L 1068 322 L 1071 322 L 1077 319 L 1080 319 L 1087 315 L 1089 315 L 1093 313 L 1095 311 L 1098 310 L 1103 306 L 1106 305 L 1116 296 L 1117 296 L 1115 292 L 1113 290 L 1112 290 L 1111 288 L 1109 286 L 1108 286 L 1107 284 L 1100 278 L 1098 279 L 1090 286 L 1089 286 L 1086 289 L 1074 295 L 1072 295 L 1068 297 L 1065 297 L 1064 298 L 1061 298 L 1060 299 L 1041 299 L 1040 298 L 1037 298 L 1036 297 L 1031 296 L 1028 294 L 1026 294 L 1024 292 L 1020 290 L 1010 280 L 1008 275 L 1006 273 L 1005 271 L 1005 268 L 1004 267 L 1004 264 L 1003 263 L 1003 248 L 1004 247 L 1005 238 L 1008 233 L 1008 231 L 1010 227 L 1012 225 L 1013 222 L 1018 216 L 1018 215 L 1030 203 L 1031 203 L 1044 194 L 1046 194 L 1053 190 L 1056 190 L 1057 189 L 1060 189 L 1061 188 L 1064 188 L 1065 187 L 1071 187 L 1072 186 L 1076 186 L 1077 187 L 1083 187 L 1084 188 L 1087 188 L 1088 189 L 1090 189 L 1091 190 L 1096 191 L 1100 194 L 1103 195 L 1106 198 L 1107 198 L 1109 200 L 1109 201 L 1114 206 L 1114 207 L 1116 209 L 1118 213 L 1118 216 L 1120 220 L 1120 225 L 1116 227 L 1111 227 L 1110 228 L 1103 228 L 1102 229 L 1097 229 L 1096 230 L 1091 230 L 1090 231 L 1086 231 L 1085 232 L 1077 232 L 1076 233 L 1072 233 L 1071 234 L 1066 234 L 1065 235 L 1061 235 L 1060 236 L 1053 236 L 1052 237 L 1047 237 L 1047 240 L 1046 241 L 1046 243 L 1045 244 L 1045 247 L 1044 248 L 1044 250 L 1043 251 L 1043 254 L 1042 255 L 1042 260 L 1041 261 L 1041 263 L 1044 263 L 1045 262 L 1050 262 L 1051 261 L 1058 261 L 1059 260 L 1063 260 L 1064 259 L 1068 259 L 1069 258 L 1073 258 L 1074 257 L 1080 257 L 1081 256 L 1086 256 L 1087 255 L 1092 255 L 1093 254 L 1097 254 L 1098 253 L 1103 253 L 1104 252 L 1111 252 L 1112 251 L 1116 251 L 1117 250 L 1121 250 L 1122 249 L 1126 249 L 1127 248 L 1133 248 L 1134 247 L 1139 247 L 1140 246 L 1144 246 L 1146 243 L 1146 240 L 1147 239 L 1147 231 L 1148 230 L 1148 220 L 1147 219 L 1147 211 L 1146 210 L 1146 207 L 1144 204 L 1144 202 L 1143 201 L 1143 199 L 1141 195 L 1139 193 L 1138 190 L 1134 186 L 1133 183 L 1132 183 L 1129 180 Z
M 1779 171 L 1767 165 L 1765 165 L 1764 164 L 1762 164 L 1758 162 L 1755 162 L 1754 161 L 1747 161 L 1746 160 L 1729 160 L 1728 161 L 1722 161 L 1721 162 L 1718 162 L 1717 163 L 1715 163 L 1711 165 L 1707 165 L 1687 175 L 1685 177 L 1681 179 L 1672 187 L 1671 187 L 1661 197 L 1661 198 L 1657 202 L 1657 203 L 1652 209 L 1651 212 L 1649 214 L 1644 224 L 1643 229 L 1640 235 L 1640 238 L 1639 239 L 1639 244 L 1638 245 L 1638 250 L 1637 251 L 1637 267 L 1638 268 L 1638 273 L 1639 274 L 1639 278 L 1640 279 L 1640 282 L 1648 298 L 1652 302 L 1652 303 L 1655 306 L 1657 307 L 1657 308 L 1659 310 L 1660 310 L 1663 313 L 1669 316 L 1671 318 L 1673 319 L 1675 319 L 1676 320 L 1678 320 L 1684 323 L 1688 323 L 1689 324 L 1696 324 L 1697 325 L 1715 325 L 1716 324 L 1723 324 L 1724 323 L 1728 323 L 1729 322 L 1732 322 L 1738 319 L 1741 319 L 1748 315 L 1750 315 L 1754 313 L 1758 310 L 1759 311 L 1760 309 L 1761 309 L 1764 306 L 1765 306 L 1771 301 L 1772 301 L 1778 295 L 1761 278 L 1760 278 L 1756 282 L 1755 282 L 1751 286 L 1750 286 L 1745 290 L 1737 294 L 1732 295 L 1729 297 L 1726 297 L 1725 298 L 1721 298 L 1720 299 L 1703 299 L 1702 298 L 1698 298 L 1697 297 L 1692 296 L 1684 292 L 1682 290 L 1681 290 L 1673 282 L 1671 278 L 1668 275 L 1668 273 L 1667 272 L 1667 270 L 1666 269 L 1666 267 L 1664 263 L 1664 246 L 1665 245 L 1665 242 L 1666 241 L 1666 239 L 1668 235 L 1668 232 L 1670 228 L 1672 226 L 1673 224 L 1673 222 L 1680 214 L 1680 213 L 1690 203 L 1691 203 L 1694 200 L 1695 200 L 1700 196 L 1712 190 L 1715 190 L 1716 189 L 1718 189 L 1722 187 L 1725 187 L 1726 186 L 1744 186 L 1745 187 L 1747 187 L 1748 188 L 1750 188 L 1751 189 L 1756 190 L 1758 191 L 1761 194 L 1764 195 L 1773 204 L 1773 205 L 1777 210 L 1777 212 L 1778 213 L 1778 215 L 1780 219 L 1780 223 L 1781 225 L 1780 226 L 1775 226 L 1774 227 L 1768 227 L 1767 228 L 1759 228 L 1758 229 L 1753 229 L 1752 230 L 1747 230 L 1746 231 L 1742 231 L 1741 232 L 1733 232 L 1732 233 L 1727 233 L 1726 234 L 1722 234 L 1721 235 L 1717 235 L 1716 236 L 1709 236 L 1707 238 L 1707 241 L 1706 242 L 1706 246 L 1705 247 L 1705 250 L 1703 254 L 1703 258 L 1702 259 L 1702 262 L 1706 262 L 1707 261 L 1714 261 L 1715 260 L 1724 259 L 1725 258 L 1728 258 L 1729 257 L 1735 257 L 1736 256 L 1742 256 L 1743 255 L 1747 255 L 1748 254 L 1752 254 L 1753 253 L 1757 253 L 1758 252 L 1765 252 L 1766 251 L 1771 251 L 1772 250 L 1776 250 L 1777 249 L 1781 249 L 1782 248 L 1789 248 L 1790 247 L 1794 247 L 1795 246 L 1804 245 L 1805 243 L 1805 240 L 1806 239 L 1807 240 L 1807 243 L 1809 244 L 1809 241 L 1808 241 L 1806 238 L 1806 232 L 1807 231 L 1807 217 L 1806 216 L 1806 210 L 1805 209 L 1805 206 L 1802 200 L 1802 198 L 1800 194 L 1798 192 L 1797 189 L 1790 181 L 1790 180 L 1788 179 Z
M 714 187 L 712 189 L 712 190 L 708 193 L 708 194 L 704 198 L 704 199 L 700 203 L 700 204 L 695 210 L 695 212 L 693 214 L 690 220 L 690 222 L 686 229 L 686 233 L 684 237 L 684 240 L 683 241 L 683 245 L 682 246 L 682 268 L 683 269 L 683 273 L 684 274 L 684 276 L 686 280 L 686 283 L 692 295 L 699 303 L 699 304 L 701 306 L 702 306 L 704 308 L 704 309 L 707 310 L 711 314 L 716 316 L 718 318 L 720 319 L 722 319 L 725 321 L 730 322 L 731 323 L 734 323 L 735 324 L 740 324 L 741 325 L 749 325 L 750 326 L 759 326 L 760 325 L 767 325 L 768 324 L 775 324 L 776 323 L 780 323 L 788 319 L 791 319 L 792 318 L 794 318 L 798 315 L 800 315 L 810 309 L 812 310 L 812 313 L 811 314 L 811 319 L 810 320 L 809 325 L 836 325 L 839 319 L 839 316 L 840 315 L 840 310 L 841 309 L 841 307 L 842 306 L 842 303 L 844 299 L 844 295 L 845 294 L 846 287 L 847 286 L 847 284 L 849 280 L 849 275 L 850 274 L 850 271 L 851 270 L 851 268 L 853 264 L 854 255 L 855 254 L 855 252 L 856 251 L 856 248 L 857 247 L 857 244 L 858 243 L 858 217 L 857 216 L 857 212 L 854 206 L 853 201 L 851 197 L 849 195 L 849 193 L 846 190 L 844 186 L 835 177 L 834 177 L 831 174 L 830 174 L 825 170 L 823 170 L 814 165 L 811 165 L 808 163 L 805 163 L 804 162 L 800 162 L 799 161 L 793 161 L 792 160 L 773 160 L 772 161 L 765 161 L 764 162 L 757 163 L 753 165 L 750 165 L 743 169 L 741 169 L 735 172 L 733 174 L 730 175 L 728 177 L 724 179 L 715 187 Z
M 806 192 L 808 194 L 811 195 L 815 199 L 816 199 L 822 206 L 822 207 L 824 209 L 827 215 L 827 217 L 829 221 L 829 226 L 830 227 L 830 240 L 829 241 L 829 246 L 828 247 L 828 250 L 827 251 L 827 253 L 825 256 L 825 258 L 823 262 L 821 264 L 820 267 L 817 270 L 817 271 L 808 281 L 807 281 L 803 285 L 799 287 L 796 290 L 794 290 L 788 294 L 786 294 L 785 295 L 783 295 L 782 296 L 780 296 L 776 298 L 773 298 L 772 299 L 748 299 L 747 298 L 744 298 L 743 297 L 738 296 L 735 294 L 733 294 L 731 292 L 727 290 L 717 280 L 717 279 L 715 277 L 712 271 L 712 269 L 710 265 L 710 262 L 709 261 L 709 245 L 710 244 L 710 240 L 711 239 L 711 237 L 712 236 L 713 231 L 717 223 L 719 221 L 720 218 L 724 214 L 724 213 L 734 203 L 735 203 L 739 199 L 742 198 L 744 196 L 756 190 L 758 190 L 762 188 L 765 188 L 766 187 L 769 187 L 770 186 L 788 186 L 789 187 L 792 187 L 796 189 L 799 189 L 800 190 L 802 190 Z
M 1192 121 L 1190 122 L 1190 124 L 1189 125 L 1189 129 L 1188 130 L 1188 132 L 1186 136 L 1186 139 L 1185 140 L 1184 147 L 1183 148 L 1183 150 L 1181 154 L 1181 157 L 1180 158 L 1180 162 L 1179 163 L 1179 165 L 1178 166 L 1178 168 L 1176 172 L 1176 176 L 1175 177 L 1175 179 L 1173 183 L 1173 186 L 1172 187 L 1171 194 L 1170 195 L 1170 197 L 1168 201 L 1168 204 L 1167 205 L 1167 209 L 1166 210 L 1166 212 L 1164 216 L 1164 219 L 1163 220 L 1162 227 L 1160 231 L 1160 234 L 1159 235 L 1158 242 L 1157 243 L 1157 245 L 1155 249 L 1155 252 L 1154 253 L 1154 259 L 1153 260 L 1153 276 L 1154 277 L 1154 282 L 1155 283 L 1155 286 L 1158 292 L 1158 294 L 1161 298 L 1162 301 L 1173 313 L 1174 313 L 1182 319 L 1184 319 L 1189 322 L 1191 322 L 1195 324 L 1199 324 L 1200 325 L 1236 325 L 1236 323 L 1237 322 L 1237 319 L 1238 318 L 1238 315 L 1239 314 L 1239 311 L 1240 310 L 1240 307 L 1241 306 L 1241 303 L 1242 302 L 1242 300 L 1241 299 L 1209 299 L 1208 298 L 1205 298 L 1195 293 L 1187 285 L 1186 282 L 1183 278 L 1183 275 L 1182 274 L 1182 271 L 1181 270 L 1181 257 L 1182 256 L 1182 253 L 1183 252 L 1183 248 L 1184 247 L 1184 245 L 1186 241 L 1186 238 L 1187 237 L 1187 233 L 1188 232 L 1188 230 L 1189 229 L 1189 227 L 1191 223 L 1191 220 L 1192 219 L 1192 215 L 1193 214 L 1193 211 L 1195 207 L 1195 204 L 1196 203 L 1196 199 L 1197 198 L 1197 195 L 1198 194 L 1198 192 L 1200 190 L 1278 190 L 1279 189 L 1279 187 L 1281 183 L 1281 180 L 1282 179 L 1282 177 L 1283 176 L 1283 174 L 1285 170 L 1285 166 L 1286 165 L 1285 164 L 1269 164 L 1268 165 L 1239 165 L 1238 164 L 1221 164 L 1220 165 L 1210 165 L 1209 164 L 1207 164 L 1206 163 L 1207 162 L 1207 159 L 1209 155 L 1209 152 L 1210 151 L 1210 147 L 1211 146 L 1211 144 L 1213 140 L 1214 133 L 1216 129 L 1217 122 L 1216 121 Z
M 997 121 L 978 121 L 977 122 L 960 122 L 959 123 L 952 124 L 948 126 L 945 126 L 938 130 L 936 130 L 931 134 L 928 135 L 925 138 L 922 139 L 917 144 L 916 144 L 907 153 L 907 154 L 903 158 L 903 159 L 897 166 L 888 184 L 888 186 L 886 190 L 886 193 L 884 197 L 884 200 L 882 204 L 882 209 L 881 210 L 881 213 L 880 214 L 880 216 L 878 220 L 878 224 L 877 225 L 876 232 L 875 233 L 875 235 L 873 239 L 873 244 L 871 248 L 871 251 L 869 255 L 869 259 L 868 260 L 868 263 L 867 264 L 867 266 L 866 267 L 866 270 L 864 274 L 864 279 L 863 280 L 863 282 L 862 283 L 862 285 L 860 289 L 860 294 L 859 295 L 859 298 L 857 301 L 857 304 L 856 305 L 856 308 L 855 309 L 855 313 L 854 314 L 854 316 L 853 317 L 853 320 L 851 324 L 852 325 L 878 325 L 879 324 L 879 322 L 880 321 L 880 317 L 881 316 L 881 314 L 883 310 L 883 307 L 884 306 L 885 299 L 887 295 L 887 292 L 888 291 L 889 284 L 891 280 L 891 277 L 892 276 L 892 273 L 893 272 L 894 265 L 896 261 L 896 258 L 897 257 L 897 254 L 898 253 L 898 249 L 899 248 L 899 246 L 901 242 L 901 239 L 902 238 L 903 231 L 905 227 L 905 224 L 906 223 L 906 219 L 907 218 L 908 211 L 910 207 L 910 204 L 911 203 L 911 199 L 912 198 L 912 196 L 914 194 L 980 194 L 982 192 L 982 188 L 983 187 L 984 180 L 986 176 L 986 173 L 988 172 L 987 170 L 987 168 L 930 168 L 929 167 L 937 159 L 938 159 L 941 156 L 942 156 L 944 154 L 946 154 L 948 152 L 952 150 L 955 150 L 956 149 L 959 149 L 960 148 L 964 148 L 965 147 L 992 147 L 993 146 L 993 144 L 995 140 L 995 136 L 996 135 L 996 130 L 998 126 L 998 122 Z
M 1844 120 L 1842 124 L 1842 127 L 1841 128 L 1841 131 L 1840 132 L 1840 136 L 1839 137 L 1839 140 L 1838 141 L 1838 144 L 1837 145 L 1837 149 L 1835 153 L 1835 157 L 1834 158 L 1834 161 L 1832 165 L 1832 168 L 1831 169 L 1831 173 L 1830 174 L 1830 177 L 1828 181 L 1828 184 L 1827 185 L 1827 188 L 1826 189 L 1826 193 L 1824 197 L 1824 200 L 1823 201 L 1823 204 L 1822 205 L 1822 209 L 1821 210 L 1821 213 L 1820 214 L 1820 216 L 1819 217 L 1819 220 L 1818 221 L 1818 224 L 1817 225 L 1817 230 L 1815 234 L 1815 237 L 1813 241 L 1813 245 L 1812 246 L 1812 249 L 1811 250 L 1811 253 L 1810 254 L 1810 259 L 1809 260 L 1809 275 L 1810 276 L 1810 280 L 1811 281 L 1811 284 L 1812 285 L 1812 287 L 1813 288 L 1814 293 L 1817 297 L 1818 300 L 1821 303 L 1821 304 L 1831 314 L 1834 315 L 1839 319 L 1841 319 L 1849 323 L 1852 323 L 1853 324 L 1858 324 L 1859 325 L 1890 325 L 1891 324 L 1891 321 L 1892 320 L 1892 317 L 1893 316 L 1893 313 L 1894 312 L 1894 309 L 1895 308 L 1896 299 L 1865 299 L 1864 298 L 1861 298 L 1854 294 L 1852 294 L 1848 290 L 1847 290 L 1846 288 L 1842 284 L 1841 281 L 1839 279 L 1837 275 L 1837 270 L 1836 269 L 1836 258 L 1837 257 L 1837 250 L 1838 249 L 1838 246 L 1840 242 L 1840 239 L 1841 238 L 1841 235 L 1842 234 L 1842 230 L 1844 226 L 1844 223 L 1845 222 L 1845 219 L 1846 218 L 1846 214 L 1847 213 L 1847 210 L 1848 209 L 1848 207 L 1849 206 L 1849 203 L 1850 202 L 1850 199 L 1851 198 L 1851 193 L 1853 189 L 1924 189 L 1925 188 L 1925 185 L 1926 184 L 1926 180 L 1927 179 L 1927 176 L 1928 175 L 1928 172 L 1929 171 L 1930 164 L 1929 163 L 1860 163 L 1859 162 L 1860 161 L 1861 154 L 1862 153 L 1862 151 L 1863 150 L 1863 147 L 1864 146 L 1864 141 L 1865 140 L 1865 138 L 1866 137 L 1866 134 L 1868 130 L 1868 126 L 1869 125 L 1869 120 Z
M 675 120 L 575 120 L 574 121 L 567 121 L 566 122 L 563 122 L 562 123 L 559 123 L 558 124 L 556 124 L 555 125 L 550 126 L 538 132 L 536 134 L 532 136 L 528 140 L 527 140 L 526 142 L 522 145 L 522 146 L 518 150 L 516 154 L 513 157 L 513 159 L 508 168 L 508 173 L 507 174 L 507 177 L 506 178 L 506 194 L 507 195 L 508 202 L 510 205 L 510 207 L 512 209 L 514 214 L 517 217 L 517 218 L 520 221 L 521 221 L 522 223 L 523 223 L 529 228 L 533 230 L 535 230 L 538 232 L 543 233 L 544 234 L 551 234 L 552 235 L 615 235 L 616 234 L 618 234 L 619 235 L 624 235 L 625 236 L 627 236 L 635 240 L 641 247 L 643 251 L 643 253 L 644 254 L 644 267 L 643 268 L 643 271 L 642 272 L 642 274 L 641 276 L 639 278 L 637 282 L 630 289 L 629 289 L 627 291 L 626 291 L 622 294 L 620 294 L 616 296 L 613 296 L 612 297 L 487 297 L 485 299 L 485 302 L 483 306 L 483 310 L 482 311 L 482 314 L 481 315 L 481 319 L 480 320 L 480 325 L 607 325 L 608 324 L 614 324 L 615 323 L 619 323 L 627 319 L 630 319 L 634 317 L 636 315 L 638 315 L 640 313 L 641 313 L 649 306 L 650 306 L 653 303 L 654 301 L 655 301 L 655 300 L 662 292 L 662 290 L 664 288 L 667 282 L 667 280 L 668 279 L 668 277 L 670 273 L 670 270 L 671 269 L 671 248 L 670 247 L 670 244 L 669 243 L 668 238 L 665 232 L 662 229 L 661 226 L 655 220 L 654 220 L 648 215 L 640 211 L 638 211 L 637 210 L 633 210 L 632 209 L 627 209 L 626 208 L 553 208 L 552 207 L 550 207 L 544 204 L 537 197 L 535 193 L 534 188 L 533 187 L 533 180 L 534 179 L 534 176 L 537 170 L 537 168 L 539 166 L 539 165 L 549 155 L 554 153 L 558 150 L 561 150 L 562 149 L 565 149 L 566 148 L 570 148 L 571 147 L 670 147 L 671 146 L 671 141 L 672 140 L 672 137 L 674 133 L 674 129 L 675 128 L 675 124 L 676 123 L 676 121 Z
M 333 132 L 331 134 L 328 135 L 326 137 L 321 139 L 311 148 L 310 148 L 296 163 L 296 164 L 290 172 L 288 177 L 286 179 L 286 181 L 282 188 L 281 193 L 279 196 L 279 198 L 277 202 L 277 206 L 276 207 L 276 212 L 275 213 L 275 220 L 274 221 L 274 237 L 275 238 L 275 244 L 276 245 L 277 254 L 278 255 L 279 260 L 281 263 L 282 268 L 286 276 L 288 278 L 289 281 L 294 287 L 294 288 L 305 300 L 306 300 L 311 305 L 315 307 L 318 310 L 320 310 L 323 313 L 327 315 L 329 315 L 336 319 L 339 319 L 340 320 L 342 320 L 343 321 L 345 321 L 349 323 L 353 323 L 354 324 L 363 324 L 364 325 L 434 325 L 435 324 L 435 319 L 436 318 L 436 309 L 437 308 L 437 301 L 438 300 L 438 298 L 437 297 L 364 297 L 363 296 L 354 295 L 348 292 L 346 292 L 340 289 L 338 287 L 335 286 L 332 283 L 331 283 L 322 275 L 322 274 L 315 266 L 312 260 L 310 258 L 310 256 L 306 249 L 306 245 L 305 244 L 305 241 L 304 240 L 304 237 L 303 236 L 303 216 L 304 215 L 304 211 L 305 210 L 306 203 L 315 185 L 317 183 L 319 179 L 324 174 L 324 173 L 326 172 L 329 168 L 330 168 L 334 164 L 337 163 L 340 160 L 345 158 L 347 156 L 351 154 L 356 153 L 359 151 L 361 151 L 362 150 L 367 150 L 368 149 L 373 149 L 374 148 L 445 148 L 447 144 L 447 136 L 448 135 L 448 124 L 449 122 L 447 120 L 378 120 L 377 121 L 367 121 L 366 122 L 362 122 L 361 123 L 358 123 L 357 124 L 350 125 L 342 129 L 340 129 L 337 131 L 335 131 Z
M 181 132 L 179 134 L 174 136 L 172 138 L 168 140 L 165 143 L 164 143 L 159 148 L 158 148 L 156 150 L 156 151 L 154 152 L 152 154 L 152 155 L 147 160 L 147 161 L 143 165 L 143 166 L 139 171 L 138 174 L 136 176 L 130 188 L 130 190 L 129 191 L 129 193 L 128 194 L 128 196 L 126 200 L 126 203 L 125 204 L 125 208 L 124 209 L 124 213 L 123 214 L 123 222 L 122 223 L 122 232 L 123 233 L 123 241 L 124 242 L 124 246 L 125 247 L 125 252 L 126 253 L 126 256 L 129 262 L 130 267 L 135 277 L 137 279 L 138 282 L 144 289 L 144 290 L 156 302 L 157 302 L 160 305 L 164 307 L 167 310 L 167 311 L 169 310 L 174 314 L 176 315 L 178 315 L 185 319 L 188 319 L 189 320 L 191 320 L 195 322 L 198 322 L 199 323 L 204 323 L 205 324 L 214 324 L 215 325 L 286 325 L 287 324 L 287 319 L 288 318 L 288 302 L 289 301 L 289 298 L 288 297 L 214 297 L 213 296 L 208 296 L 207 295 L 200 294 L 195 291 L 193 291 L 189 289 L 187 287 L 184 286 L 178 281 L 177 281 L 168 272 L 168 271 L 164 267 L 163 264 L 159 259 L 159 257 L 155 250 L 155 248 L 154 247 L 154 243 L 152 239 L 152 233 L 151 232 L 151 221 L 152 220 L 152 214 L 153 213 L 153 210 L 154 209 L 154 205 L 157 199 L 157 197 L 159 194 L 159 192 L 163 187 L 163 185 L 167 181 L 168 178 L 170 177 L 171 175 L 184 163 L 185 163 L 190 159 L 200 154 L 202 154 L 205 152 L 207 152 L 210 150 L 215 150 L 216 149 L 222 149 L 223 148 L 295 148 L 296 147 L 296 140 L 297 139 L 297 128 L 298 127 L 298 121 L 297 120 L 227 120 L 226 121 L 215 121 L 214 122 L 209 122 L 208 123 L 205 123 L 201 125 L 198 125 L 197 126 L 192 127 L 185 131 L 183 131 Z
M 1506 121 L 1499 127 L 1497 131 L 1497 138 L 1496 139 L 1496 143 L 1495 144 L 1495 147 L 1494 148 L 1494 151 L 1493 152 L 1493 155 L 1492 156 L 1491 163 L 1489 167 L 1489 170 L 1488 171 L 1488 175 L 1487 176 L 1487 179 L 1485 183 L 1485 186 L 1484 187 L 1484 190 L 1483 191 L 1483 195 L 1482 196 L 1482 199 L 1481 200 L 1481 202 L 1480 203 L 1480 206 L 1479 207 L 1479 212 L 1478 213 L 1478 216 L 1476 220 L 1476 223 L 1475 224 L 1475 227 L 1474 228 L 1474 232 L 1473 233 L 1472 240 L 1470 244 L 1470 249 L 1469 250 L 1468 257 L 1466 261 L 1466 265 L 1465 266 L 1465 270 L 1464 271 L 1464 274 L 1463 275 L 1463 277 L 1462 278 L 1462 281 L 1461 282 L 1461 287 L 1460 288 L 1460 290 L 1459 291 L 1459 294 L 1457 298 L 1456 307 L 1455 308 L 1455 311 L 1454 312 L 1454 314 L 1453 315 L 1453 318 L 1452 319 L 1452 325 L 1478 325 L 1479 324 L 1479 321 L 1481 317 L 1481 312 L 1482 311 L 1482 308 L 1483 307 L 1483 304 L 1484 303 L 1484 300 L 1485 299 L 1485 296 L 1486 295 L 1486 290 L 1488 286 L 1488 283 L 1489 282 L 1489 279 L 1490 278 L 1490 274 L 1491 273 L 1491 270 L 1492 269 L 1492 267 L 1493 266 L 1493 263 L 1494 262 L 1495 253 L 1496 252 L 1496 249 L 1497 248 L 1497 245 L 1498 244 L 1498 241 L 1499 240 L 1499 235 L 1500 234 L 1500 232 L 1502 228 L 1502 225 L 1503 224 L 1503 220 L 1504 219 L 1504 216 L 1506 212 L 1506 209 L 1507 208 L 1507 205 L 1508 204 L 1508 199 L 1509 198 L 1509 195 L 1511 191 L 1511 188 L 1512 187 L 1512 183 L 1513 182 L 1513 179 L 1515 175 L 1516 168 L 1517 167 L 1519 169 L 1519 171 L 1520 172 L 1521 170 L 1521 167 L 1519 165 L 1518 167 L 1517 166 L 1518 159 L 1520 156 L 1522 159 L 1522 162 L 1523 163 L 1524 170 L 1525 171 L 1525 173 L 1527 177 L 1527 180 L 1528 181 L 1528 183 L 1530 187 L 1530 190 L 1532 194 L 1532 197 L 1533 198 L 1533 200 L 1534 201 L 1534 203 L 1536 207 L 1536 211 L 1537 212 L 1537 215 L 1538 216 L 1538 218 L 1539 219 L 1539 221 L 1541 225 L 1541 229 L 1542 230 L 1542 232 L 1543 233 L 1543 235 L 1545 239 L 1546 246 L 1547 247 L 1547 249 L 1548 250 L 1548 252 L 1550 256 L 1550 261 L 1551 262 L 1551 264 L 1552 265 L 1552 267 L 1554 271 L 1555 278 L 1556 279 L 1556 281 L 1558 285 L 1558 288 L 1559 289 L 1560 296 L 1561 297 L 1561 299 L 1563 303 L 1563 307 L 1564 308 L 1564 310 L 1566 314 L 1568 316 L 1568 317 L 1570 319 L 1571 319 L 1573 321 L 1577 323 L 1579 323 L 1580 324 L 1595 324 L 1596 323 L 1598 323 L 1606 318 L 1610 310 L 1610 306 L 1612 302 L 1612 299 L 1613 298 L 1613 296 L 1614 295 L 1614 292 L 1615 291 L 1615 287 L 1616 286 L 1616 284 L 1617 283 L 1617 280 L 1619 276 L 1619 272 L 1620 271 L 1620 269 L 1621 268 L 1621 265 L 1623 261 L 1623 258 L 1624 257 L 1624 253 L 1625 252 L 1625 250 L 1627 246 L 1627 243 L 1628 242 L 1628 238 L 1629 237 L 1629 235 L 1631 231 L 1631 228 L 1632 227 L 1632 223 L 1633 222 L 1633 220 L 1634 219 L 1634 216 L 1635 215 L 1635 213 L 1637 209 L 1637 205 L 1638 204 L 1638 202 L 1639 201 L 1639 198 L 1641 194 L 1641 190 L 1642 189 L 1642 186 L 1643 185 L 1643 183 L 1645 179 L 1646 172 L 1647 171 L 1647 169 L 1648 168 L 1648 165 L 1650 161 L 1650 157 L 1651 156 L 1651 154 L 1652 153 L 1652 151 L 1654 147 L 1654 144 L 1655 143 L 1655 139 L 1656 138 L 1656 136 L 1657 135 L 1657 133 L 1659 129 L 1659 125 L 1661 122 L 1661 120 L 1660 119 L 1635 119 L 1632 123 L 1632 125 L 1631 126 L 1631 129 L 1630 130 L 1630 134 L 1629 135 L 1629 137 L 1627 141 L 1627 144 L 1626 145 L 1626 149 L 1625 150 L 1625 152 L 1624 153 L 1624 155 L 1622 159 L 1622 162 L 1621 163 L 1621 167 L 1620 168 L 1620 170 L 1618 174 L 1618 177 L 1617 178 L 1617 182 L 1616 183 L 1616 185 L 1614 189 L 1614 192 L 1612 196 L 1612 200 L 1611 201 L 1611 203 L 1610 204 L 1610 207 L 1608 211 L 1608 215 L 1606 219 L 1606 222 L 1604 226 L 1604 229 L 1603 230 L 1602 237 L 1600 241 L 1600 244 L 1599 245 L 1599 249 L 1598 250 L 1598 253 L 1597 254 L 1597 256 L 1595 260 L 1595 264 L 1594 265 L 1594 268 L 1592 272 L 1592 275 L 1590 278 L 1588 274 L 1587 274 L 1587 277 L 1590 281 L 1590 284 L 1588 288 L 1586 287 L 1586 285 L 1585 284 L 1585 281 L 1583 277 L 1583 273 L 1582 272 L 1582 270 L 1581 269 L 1581 267 L 1579 263 L 1579 260 L 1578 259 L 1578 256 L 1577 255 L 1577 253 L 1575 249 L 1575 246 L 1574 245 L 1573 238 L 1572 237 L 1572 235 L 1570 231 L 1569 224 L 1568 223 L 1568 221 L 1566 217 L 1565 210 L 1564 209 L 1564 207 L 1562 203 L 1562 200 L 1561 199 L 1560 192 L 1559 191 L 1559 189 L 1557 185 L 1557 182 L 1556 181 L 1556 179 L 1555 178 L 1555 176 L 1553 172 L 1552 165 L 1550 161 L 1550 158 L 1548 154 L 1548 151 L 1547 150 L 1547 147 L 1545 143 L 1545 140 L 1544 139 L 1543 134 L 1541 130 L 1534 123 L 1530 121 L 1528 121 L 1524 119 L 1513 119 L 1512 120 L 1509 120 L 1508 121 Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
</svg>
`;var page_default=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CC Safety Net</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%233fb950' d='M12 2 20 5v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V5Z'/%3E%3C/svg%3E">
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
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <h1 class="brand-logo"><!-- __CC_SAFETY_NET_LOGO__ --></h1>
      </div>
      <nav class="sidenav" aria-label="Sections">
        <a href="#overview" data-nav="overview" title="Overview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"></rect><rect x="14" y="3" width="7" height="5" rx="1.5"></rect><rect x="14" y="12" width="7" height="9" rx="1.5"></rect><rect x="3" y="16" width="7" height="5" rx="1.5"></rect></svg><span class="sr-only-collapse">Overview</span></a>
        <a href="#activity" data-nav="activity" title="Activity"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"></path></svg><span class="sr-only-collapse">Activity</span></a>
        <a href="#policy" data-nav="policy" title="Policy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6l-7-3Z"></path></svg><span class="sr-only-collapse">Policy</span></a>
        <a href="#settings" data-nav="settings" title="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"></path><circle cx="16" cy="8" r="2.2"></circle><circle cx="8" cy="16" r="2.2"></circle></svg><span class="sr-only-collapse">Settings</span></a>
      </nav>
      <div class="sidebar-foot">
        <div class="sidebar-links">
          <a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>
          <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>
        </div>
      </div>
    </aside>
    <div class="content">
      <header class="topbar">
        <div class="topbar-row">
          <div class="topbar-title" id="topbar-title">Overview</div>
          <div class="topbar-actions">
            <div class="app-status" id="app-status" role="status" aria-live="polite">Loading...</div>
            <button type="button" class="dirty-chip" id="dirty-chip" hidden>Unsaved policy changes · Review</button>
          </div>
        </div>
      </header>
      <main>
        <div class="status" id="status" role="status" aria-live="polite"></div>

        <section class="view" data-view="overview">
          <div class="view-head">
            <p class="panel-sub muted">What CC Safety Net has been doing on this machine.</p>
          </div>
          <div class="tiles" id="overview-tiles"></div>
          <div class="star-row" id="star-row" hidden>
            <p class="star-pitch"><span id="star-pitch-text"></span> <span class="star-mechanism" id="star-mechanism" hidden>One click via your GitHub CLI. No redirect.</span></p>
            <span id="star-slot"></span>
          </div>
          <section class="panel" id="protection-card" hidden></section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Top blocked rules</h2>
              </div>
            </div>
            <div id="top-rules"></div>
          </section>
          <button type="button" class="guard-errors" id="guard-errors" hidden></button>
        </section>

        <section class="view" data-view="activity" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Audited commands from the local log, newest first. Commands are secret-redacted at write time.</p>
          </div>
          <section class="panel">
            <div class="activity-controls">
              <div class="activity-controls-row">
                <label class="activity-days"><span>Window</span>
                  <select id="activity-days">
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last year</option>
                  </select>
                </label>
                <button type="button" id="activity-refresh">Refresh</button>
                <label class="view-search activity-search-field">
                  <span class="sr-only">Filter activity</span>
                  <input type="search" id="activity-search" autocomplete="off" placeholder="Filter by rule, command, or reason">
                </label>
              </div>
              <div class="chip-row" id="activity-decision" role="group" aria-label="Filter by decision"></div>
              <div class="chip-row" id="activity-agents" role="group" aria-label="Filter by agent"></div>
            </div>
            <div id="activity-feed"></div>
            <p class="muted activity-count" id="activity-count"></p>
          </section>
        </section>

        <section class="view" data-view="policy" hidden>
          <div class="view-head policy-head">
            <div class="view-head-text">
              <p class="panel-sub muted">Choose what CC Safety Net blocks. Changes apply after you save.</p>
            </div>
            <div class="policy-toolbar">
              <label class="view-search">
                <span class="sr-only">Search all protections</span>
                <input type="search" id="policy-search" autocomplete="off" placeholder="Filter by name, category, or rule ID">
              </label>
            </div>
          </div>
          <div class="policy-savebar" id="policy-savebar" hidden><span>Unsaved changes</span><div class="savebar-actions"><button type="button" id="discard-changes">Discard</button><button class="primary" id="save">Save</button></div></div>
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
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Destructive Command Protection</h2>
                <p class="panel-sub muted" id="destructive-command-summary"></p>
              </div>
              <button type="button" id="reset-rule-customizations" class="panel-head-action">Reset rule customizations</button>
            </div>
            <div id="destructive-command"></div>
          </section>
          <section class="panel">
            <header class="panel-head">
              <div class="panel-title">
                <h2>Secret Protection</h2>
                <p class="panel-sub muted" id="secret-summary">Default sensitive paths and coding CLI credential locations can be disabled individually. Deny paths are blocked while Secret protection is on.</p>
              </div>
            </header>
            <div id="secret"></div>
          </section>
        </section>

        <section class="view" data-view="settings" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Appearance, file locations, and maintenance.</p>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Appearance</h2>
                <p class="panel-sub muted">Theme preference is stored in this browser.</p>
              </div>
            </div>
            <button type="button" id="theme-toggle"></button>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Files</h2>
                <p class="panel-sub muted">Where CC Safety Net reads and writes on this machine.</p>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><span>Policy file</span><code id="policy-path"></code></div>
              <div class="info-row"><span>Audit logs</span><code id="logs-path"></code></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head raw-json-head">
              <div class="panel-title">
                <h2>Policy JSON</h2>
                <p class="panel-sub muted" id="raw-source">Read-only mirror of the policy controls.</p>
              </div>
              <button class="icon-button" id="raw-copy" type="button" aria-label="Copy raw JSON to clipboard"></button>
            </div>
            <textarea id="raw" aria-label="Raw policy JSON" aria-describedby="raw-source" readonly></textarea>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Danger zone</h2>
                <p class="panel-sub muted">Actions that discard saved configuration.</p>
              </div>
            </div>
            <div class="danger-row">
              <div>
                <strong>Reset policy</strong>
                <p class="muted">Restore the default policy JSON at the configured path.</p>
              </div>
              <button class="danger" id="reset">Reset</button>
            </div>
          </section>
        </section>
      </main>
      <footer class="app-foot">
        <a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>
        <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>
      </footer>
    </div>
  </div>
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
/* __CC_SAFETY_NET_SCRIPT__ */
  </script>
</body>
</html>
`;var page_script_default=`const token = __CC_SAFETY_NET_TOKEN__;
const fallbackRepoUrl = 'https://github.com/kenryu42/cc-safety-net';
const safetyLevels = {
  standard: [
    'Standard',
    'Blocks recognizable destructive commands and sensitive content access while allowing metadata-only sensitive-path checks. Recommended for normal coding.',
  ],
  strict: [
    'Strict',
    'Standard, plus blocks dynamic or unparseable commands and metadata-only sensitive-path discovery. Occasional false positives on advanced shell.',
  ],
  paranoid: [
    'Paranoid',
    'Strict, plus blocks rm -rf inside your project and interpreter one-liners. Expect friction; for untrusted agents or high-stakes repos.',
  ],
};
const safetyOverrides = {
  fail_closed: ['Fail closed', 'Block commands the parser cannot fully understand.'],
  paranoid_rm: ['Paranoid rm -rf checks', 'Block non-temp rm -rf inside the project.'],
  paranoid_interpreters: ['Paranoid interpreters', 'Block interpreter one-liners.'],
};
const rawCopyIcons = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"></path></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
};
const starIcons = {
  outline:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
  filled:
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
};
const pathListIcons = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  remove:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6M14 11v6"></path></svg>',
};
let state;
let draftPolicy;
let preview;
let previewRequestId = 0;
let dirty = false;
let searchActive = false;
let activity = null;
const activityFilters = { days: 7, decision: 'all', agent: 'all', query: '' };
const tierExpanded = new Map([
  ['enforced', false],
  ['normal', false],
  ['strict', false],
  ['paranoid', false],
]);
const searchCollapsedTiers = new Set();
const secretGroupExpanded = new Map();
const searchCollapsedSecretGroups = new Set();
let rawCopyResetTimer = null;
let activeStarContext = { starred: null, starCount: null, blockedTotal: 0 };
const api = (path, init = {}) =>
  fetch(\`\${path}\${path.includes('?') ? '&' : '?'}token=\${encodeURIComponent(token)}\`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-cc-safety-net-token': token,
      ...(init.headers || {}),
    },
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
  result.error ??
  (Array.isArray(result.data?.errors) && result.data.errors.length
    ? result.data.errors.join('\\n')
    : null) ??
  result.data?.error ??
  \`Request failed (status \${result.status}).\`;
const isWriteSuccess = (result) =>
  result.ok && !(Array.isArray(result.data?.errors) && result.data.errors.length > 0);
const isPolicyState = (value) =>
  !!value &&
  typeof value === 'object' &&
  !!value.policy &&
  typeof value.policy === 'object' &&
  !!value.policy.safety &&
  !!value.policy.workflow &&
  !!value.policy.secret_protection &&
  Array.isArray(value.destructiveCommandRules) &&
  Array.isArray(value.secretPatterns) &&
  (value.preview === null || (value.preview && typeof value.preview === 'object')) &&
  Array.isArray(value.errors);
const qs = (id) => document.getElementById(id);
const setDetailStatus = (text, kind = '') => {
  qs('status').textContent = text;
  qs('status').className = \`status \${kind}\`;
};
let appStatusTimer;
const setAppStatus = (text, kind = '') => {
  qs('app-status').textContent = text;
  qs('app-status').className = \`app-status \${kind}\`;
  clearTimeout(appStatusTimer);
  if (kind === 'ok') appStatusTimer = setTimeout(() => setAppStatus(''), 4000);
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
const checkbox = (checked) => (checked ? 'checked' : '');
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  );
const clonePolicy = (policy) => JSON.parse(JSON.stringify(policy));
const pathLines = (value) =>
  value
    .split('\\n')
    .map((line) => line.trim())
    .filter(Boolean);
const formatPolicy = (policy) => \`\${JSON.stringify(policy, null, 2)}\\n\`;
const collectFormPolicy = () => ({
  version: 1,
  safety: {
    level: draftPolicy.safety.level,
    overrides: Object.fromEntries(
      Object.entries(draftPolicy.safety.overrides).filter(
        ([, value]) => typeof value === 'boolean',
      ),
    ),
  },
  workflow: draftPolicy.workflow,
  destructive_command_protection: draftPolicy.destructive_command_protection,
  secret_protection: {
    enabled: draftPolicy.secret_protection.enabled,
    overrides: draftPolicy.secret_protection.overrides,
    deny_paths: draftPolicy.secret_protection.deny_paths,
  },
});
const viewNames = ['overview', 'activity', 'policy', 'settings'];
const viewTitles = {
  overview: 'Overview',
  activity: 'Activity',
  policy: 'Policy',
  settings: 'Settings',
};
const currentView = () => {
  const hash = location.hash.replace('#', '');
  return viewNames.includes(hash) ? hash : 'overview';
};
const applyView = () => {
  const view = currentView();
  qs('topbar-title').textContent = viewTitles[view];
  document.title = \`\${viewTitles[view]} · CC Safety Net\`;
  document.querySelectorAll('[data-view]').forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  qs('dirty-chip').hidden = !dirty || view === 'policy';
  if (view === 'activity') applyFeedClamps(qs('activity-feed'));
};
const relativeTime = (ts) => {
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return \`\${days}d ago\`;
  if (hours > 0) return \`\${hours}h ago\`;
  if (minutes > 0) return \`\${minutes}m ago\`;
  return 'just now';
};
const isActivityFeed = (value) =>
  !!value &&
  typeof value === 'object' &&
  Array.isArray(value.entries) &&
  !!value.counts &&
  typeof value.counts === 'object';
const agentLabels = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  copilot: 'Copilot',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  pi: 'Pi',
  unknown: 'unrecorded',
};
const feedItemHtml = (entry) => {
  const deny = entry.decision !== 'allow';
  const badgeClass = entry.failureStage ? 'error' : deny ? 'deny' : 'allow';
  const badgeLabel = entry.failureStage ? 'Error' : deny ? 'Blocked' : 'Allowed';
  return \`<article class="feed-item">
    <div class="feed-meta">
      <span class="decision-badge \${badgeClass}">\${badgeLabel}</span>
      <span class="agent-badge">\${escapeHtml(agentLabels[entry.agent || 'unknown'] ?? entry.agent)}</span>
      \${entry.ruleId ? \`<code class="rule-id">\${escapeHtml(entry.ruleId)}</code>\` : ''}
      <time datetime="\${escapeHtml(entry.ts)}" title="\${escapeHtml(entry.ts)}">\${relativeTime(entry.ts)}</time>
    </div>
    <code class="feed-command">\${escapeHtml(entry.command || entry.segment || '(no command recorded)')}</code>
    \${entry.reason && entry.reason !== 'allowed' ? \`<p class="feed-reason muted">\${escapeHtml(entry.reason)}</p>\` : ''}
  </article>\`;
};
const applyFeedClamps = (root) => {
  root.querySelectorAll('.feed-command').forEach((command) => {
    if (command.classList.contains('clamped') || command.scrollHeight <= command.clientHeight + 1)
      return;
    command.classList.add('clamped');
    command.insertAdjacentHTML(
      'afterend',
      '<button type="button" class="feed-toggle" data-feed-toggle aria-expanded="false">Show more</button>',
    );
  });
};
const dayLabel = (ts) => {
  const date = new Date(ts);
  if (date.toDateString() === new Date().toDateString()) return 'Today';
  if (date.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const renderOverviewActivity = () => {
  const tile = (value, label, extra = '') =>
    \`<div class="tile"><strong>\${escapeHtml(value.toLocaleString('en-US'))}</strong><span>\${escapeHtml(label)}</span>\${extra}</div>\`;
  const byDay = activity.counts.blockedByDay;
  const max = Math.max(...byDay, 1);
  const sparkline = \`<div class="tile-spark" role="img" aria-label="Blocked commands per day, most recent \${byDay.length} days">\${byDay.map((count) => \`<div class="spark-bar" aria-hidden="true" style="height:\${count === 0 ? 0 : Math.max(2, Math.round((count / max) * 28))}px"></div>\`).join('')}</div>\`;
  qs('overview-tiles').innerHTML = [
    tile(activity.counts.blocked, \`Blocked · last \${activity.days} days\`, sparkline),
    tile(activity.counts.sessions, \`Sessions · last \${activity.days} days\`),
    tile(Object.keys(activity.counts.agents).length, \`Agents · last \${activity.days} days\`),
    tile(activity.totalBlockedAllTime, 'Blocked · all time'),
  ].join('');
};
const renderProtectionCard = () => {
  // Saved state only: state.policy/state.preview are server-confirmed; draftPolicy is not,
  // so unsaved toggles do not flip the posture card.
  if (!state || !state.preview) {
    qs('protection-card').hidden = true;
    return;
  }
  const policy = state.policy;
  const customized =
    state.preview.counts.effectiveCustomizations > 0 ||
    Object.entries(policy.safety.overrides).some(
      ([key, value]) => value !== levelCapabilities(policy.safety.level)[key],
    );
  const commandsOn = policy.destructive_command_protection.enabled;
  const secretsOn = policy.secret_protection.enabled;
  qs('protection-card').hidden = false;
  qs('protection-card').classList.toggle('protection-warning', !commandsOn || !secretsOn);
  qs('protection-card').innerHTML =
    \`<div class="panel-head"><div class="panel-title"><h2>Protection status</h2></div><a class="panel-head-action view-all-link" href="#policy">Configure</a></div>\` +
    \`<p>\${escapeHtml(safetyLevels[policy.safety.level][0])}\${customized ? ' · Customized' : ''}</p>\` +
    \`<p\${commandsOn ? '' : ' class="state-disabled"'}>\${commandsOn ? \`\${state.preview.counts.enabled} rules active\` : 'Destructive command protection is OFF'}</p>\` +
    \`<p\${secretsOn ? '' : ' class="state-disabled"'}>\${secretsOn ? 'Secret protection on' : 'Secret protection is OFF'}</p>\`;
};
const renderTopRules = () => {
  const top = Object.entries(activity.counts.rules)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  qs('top-rules').innerHTML =
    top.length === 0
      ? '<p class="empty">No blocked commands in this window.</p>'
      : top
          .map(
            ([ruleId, count]) =>
              \`<button type="button" class="top-rule" data-rule-id="\${escapeHtml(ruleId)}"><code class="rule-id">\${escapeHtml(ruleId)}</code><span class="chip-count">\${count.toLocaleString('en-US')}</span></button>\`,
          )
          .join('');
};
const renderGuardErrors = () => {
  qs('guard-errors').hidden = activity.counts.errors === 0;
  if (activity.counts.errors === 0) return;
  qs('guard-errors').textContent =
    \`\${activity.counts.errors.toLocaleString('en-US')} guard error\${activity.counts.errors === 1 ? '' : 's'} in the last \${activity.days} days — commands blocked because evaluation failed, not by policy. View\`;
};
const renderActivityControls = () => {
  const chipHtml = (kind, value, label, count) =>
    \`<button type="button" class="chip" data-activity-chip="\${kind}" data-chip-value="\${escapeHtml(value)}" aria-pressed="\${activityFilters[kind] === value}">\${escapeHtml(label)}\${count === undefined ? '' : \` <span class="chip-count">\${count.toLocaleString('en-US')}</span>\`}</button>\`;
  qs('activity-decision').innerHTML = [
    chipHtml('decision', 'all', 'All', activity.totalInWindow),
    chipHtml('decision', 'deny', 'Blocked', activity.counts.blocked),
    chipHtml('decision', 'allow', 'Allowed', activity.counts.allowed),
    ...(activity.counts.errors > 0
      ? [chipHtml('decision', 'error', 'Errors', activity.counts.errors)]
      : []),
  ].join('');
  const agentNames = Object.keys(activity.counts.agents).sort();
  qs('activity-agents').innerHTML =
    agentNames.length < 2
      ? ''
      : [
          chipHtml('agent', 'all', 'All agents'),
          ...agentNames.map((name) =>
            chipHtml('agent', name, agentLabels[name] ?? name, activity.counts.agents[name]),
          ),
        ].join('');
  qs('activity-days').value = String(activity.days);
};
const renderActivityFeed = () => {
  const matchesFilters = (entry) => {
    if (activityFilters.decision === 'deny' && entry.decision === 'allow') return false;
    if (activityFilters.decision === 'allow' && entry.decision !== 'allow') return false;
    if (activityFilters.decision === 'error' && !entry.failureStage) return false;
    if (activityFilters.agent !== 'all' && (entry.agent || 'unknown') !== activityFilters.agent)
      return false;
    if (!activityFilters.query) return true;
    return [entry.ruleId, entry.command, entry.segment, entry.reason, entry.toolName, entry.cwd]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(activityFilters.query);
  };
  const entries = activity.entries.filter(matchesFilters);
  qs('activity-feed').innerHTML =
    entries.length === 0
      ? '<p class="empty">No audit log entries match.</p>'
      : \`<div class="feed-list">\${entries
          .map((entry, index) => {
            const label = dayLabel(entry.ts);
            const separator =
              index > 0 && label === dayLabel(entries[index - 1].ts)
                ? ''
                : \`<div class="feed-day-sep">\${escapeHtml(label)}</div>\`;
            return separator + feedItemHtml(entry);
          })
          .join('')}</div>\`;
  applyFeedClamps(qs('activity-feed'));
  qs('activity-count').textContent =
    \`Showing \${entries.length.toLocaleString('en-US')} of \${activity.totalInWindow.toLocaleString('en-US')} entries from the last \${activity.days} days\${activity.truncated ? ' (showing the newest 500)' : ''}.\`;
};
const loadActivity = async () => {
  const result = await requestJson(\`/api/activity?days=\${activityFilters.days}\`);
  if (!result.ok || !isActivityFeed(result.data)) {
    const message = \`<p class="empty">Could not load activity: \${escapeHtml(errorText(result))}</p>\`;
    qs('overview-tiles').innerHTML = '';
    qs('top-rules').innerHTML = message;
    qs('guard-errors').hidden = true;
    qs('activity-feed').innerHTML = message;
    qs('activity-count').textContent = '';
    return;
  }
  activity = result.data;
  if (activityFilters.agent !== 'all' && !(activityFilters.agent in activity.counts.agents)) {
    activityFilters.agent = 'all';
  }
  if (activityFilters.decision === 'error' && activity.counts.errors === 0) {
    activityFilters.decision = 'all';
  }
  qs('logs-path').textContent = activity.logsDir ?? 'Not available';
  renderOverviewActivity();
  renderTopRules();
  renderGuardErrors();
  renderActivityControls();
  renderActivityFeed();
};
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
  return (options) =>
    new Promise((resolve) => {
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
const confirmProtectionDisable = (options) =>
  confirmDialog({
    title: options.title,
    body: options.body,
    detail: options.detail,
    confirmLabel: 'Disable protection',
  });
const togglePanel = (button) => {
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(expanded));
  qs(button.getAttribute('aria-controls')).hidden = !expanded;
};
const syncSearchState = () => {
  const active = qs('policy-search').value.trim().length > 0;
  if (active === searchActive) return;
  searchActive = active;
  if (active) return;
  searchCollapsedTiers.clear();
  searchCollapsedSecretGroups.clear();
};
const updateRawSource = () => {
  qs('raw-source').textContent = state?.errors.length
    ? 'Read-only original policy JSON. Repair preserves valid settings and writes canonical JSON.'
    : 'Read-only mirror of the controls.';
};
const setRawCopyCopied = (copied) => {
  qs('raw-copy').innerHTML = copied ? rawCopyIcons.check : rawCopyIcons.copy;
  qs('raw-copy').classList.toggle('copied', copied);
  qs('raw-copy').setAttribute(
    'aria-label',
    copied ? 'Copied raw JSON' : 'Copy raw JSON to clipboard',
  );
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
    setDetailStatus(
      \`Error: Could not copy Raw JSON: \${error instanceof Error ? error.message : String(error)}\`,
      'error',
    );
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
  const evidence =
    context.blockedTotal > 0
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
  qs('star-slot').innerHTML =
    \`<a class="star-cta" href="\${escapeHtml(href)}" target="_blank" rel="noopener" aria-label="Star CC Safety Net on GitHub (opens github.com)">
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
  qs('star-slot').innerHTML =
    \`<button type="button" class="star-cta" aria-label="Star CC Safety Net on GitHub. One click via your GitHub CLI.">
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
  renderStarCta(
    result.ok && result.data ? result.data : { starred: null, starCount: null, blockedTotal: 0 },
  );
};
const syncRawFromForm = () => {
  if (state?.errors.length) return;
  qs('raw').value = formatPolicy(collectFormPolicy());
  updateRawSource();
};
const updateDirtyStatus = () => {
  if (state?.errors.length) return;
  const draftJson = JSON.stringify(collectFormPolicy());
  dirty = draftJson !== JSON.stringify(state.policy);
  qs('policy-savebar').hidden = !dirty;
  qs('dirty-chip').hidden = !dirty || currentView() === 'policy';
  if (dirty) sessionStorage.setItem('cc-safety-net-draft', draftJson);
  if (!dirty) sessionStorage.removeItem('cc-safety-net-draft');
  setDetailStatus('');
  updateActions();
};
const createPathList = (prefix, config) => {
  const setHint = (text) => {
    qs(\`\${prefix}-hint\`).textContent = text;
    qs(\`\${prefix}-hint\`).hidden = !text;
  };
  const render = () => {
    const paths = config.getPaths();
    const disabled = config.isDisabled();
    qs(\`\${prefix}-count\`).textContent = \`\${paths.length} path\${paths.length === 1 ? '' : 's'}\`;
    qs(\`\${prefix}-input\`).disabled = disabled;
    qs(\`\${prefix}-add-button\`).disabled = disabled;
    qs(\`\${prefix}-list\`).innerHTML =
      paths.length === 0
        ? \`<li class="empty">No \${config.itemLabel}s configured.</li>\`
        : paths
            .map(
              (path, index) => \`<li class="path-item \${disabled ? 'row-disabled' : ''}">
          <code>\${escapeHtml(path)}</code>
          <button type="button" class="icon-button" data-path-list="\${prefix}" data-path-remove="\${index}" \${disabled ? 'disabled' : ''} aria-label="Remove \${config.itemLabel} \${escapeHtml(path)}">\${pathListIcons.remove}</button>
        </li>\`,
            )
            .join('');
  };
  let adding = false;
  const add = async (value) => {
    if (adding) return;
    const entries = [...new Set(pathLines(value))];
    if (entries.length === 0) return;
    const submitted = qs(\`\${prefix}-input\`).value;
    const additions = entries.filter((entry) => !config.getPaths().includes(entry));
    if (config.validateAdditions && additions.length) {
      adding = true;
      try {
        const error = await config.validateAdditions([...config.getPaths(), ...additions]);
        if (error) {
          setHint(\`Not added: \${additions.join(', ')} — \${error}\`);
          return;
        }
      } finally {
        adding = false;
      }
    }
    // Recommit only the initially absent additions against current state, so
    // entries removed during validation stay removed.
    const current = config.getPaths();
    const duplicates = entries.filter((entry) => current.includes(entry));
    config.setPaths([...current, ...additions.filter((entry) => !current.includes(entry))]);
    if (qs(\`\${prefix}-input\`).value === submitted) qs(\`\${prefix}-input\`).value = '';
    setHint(duplicates.length ? \`Already listed: \${duplicates.join(', ')}\` : '');
    render();
    syncRawFromForm();
    updateDirtyStatus();
    qs(\`\${prefix}-input\`).focus();
  };
  const remove = (index) => {
    config.setPaths(config.getPaths().filter((_, position) => position !== index));
    setHint('');
    render();
    syncRawFromForm();
    updateDirtyStatus();
  };
  return { render, add, remove };
};
const pathLists = {
  'deny-paths': createPathList('deny-paths', {
    getPaths: () => draftPolicy.secret_protection.deny_paths,
    setPaths: (paths) => {
      draftPolicy.secret_protection.deny_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: 'deny path',
  }),
  'allow-paths': createPathList('allow-paths', {
    getPaths: () => draftPolicy.destructive_command_protection.allow_paths,
    setPaths: (paths) => {
      draftPolicy.destructive_command_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.destructive_command_protection.enabled,
    itemLabel: 'allow path',
    validateAdditions: async (paths) => {
      const candidate = collectFormPolicy();
      candidate.destructive_command_protection = {
        ...candidate.destructive_command_protection,
        allow_paths: paths,
      };
      const result = await requestJson('/api/policy/preview', {
        method: 'POST',
        body: JSON.stringify(candidate),
      });
      if (result.ok && result.data?.preview) return null;
      return errorText(result);
    },
  }),
};
const groupRules = (rules) =>
  rules.reduce((groups, rule) => {
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
    [rule.category, rule.label, rule.id, rule.description].join(' ').toLowerCase().includes(query),
  );
  const overrides = draftPolicy.secret_protection.overrides;
  const disabled = !draftPolicy.secret_protection.enabled;
  const disabledCount = Object.keys(overrides).length;
  qs('secret-summary').textContent = disabled
    ? 'Protection disabled. Saved rule settings and deny paths are preserved.'
    : \`\${state.secretPatterns.length - disabledCount} active, \${disabledCount} disabled\`;
  qs('secret-patterns').innerHTML =
    rules.length === 0
      ? '<p class="empty">No secret protections match the search.</p>'
      : groupRules(rules)
          .map((group) => {
            const expanded =
              secretGroupExpanded.get(group.category) ||
              (searchActive && !searchCollapsedSecretGroups.has(group.category));
            const contentId = \`secret-group-\${group.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}\`;
            const allGroupRules = state.secretPatterns.filter(
              (rule) => rule.category === group.category,
            );
            const onCount = disabled
              ? 0
              : allGroupRules.filter((rule) => overrides[rule.id] !== 'off').length;
            return \`
      <section class="rule-tier">
        <button type="button" class="rule-tier-head" data-secret-group-toggle="\${escapeHtml(group.category)}" aria-expanded="\${expanded}" aria-controls="\${contentId}">
          <span class="panel-chevron" aria-hidden="true"></span>
          <span class="tier-label"><strong>\${escapeHtml(group.category)}</strong></span>
          <span class="tier-counts">\${onCount} on · \${allGroupRules.length - onCount} off</span>
        </button>
        <div id="\${contentId}" class="tier-content" \${expanded ? '' : 'hidden'}>
        <div class="grid">\${group.rules
          .map((rule) => {
            const active = overrides[rule.id] !== 'off';
            const ruleState =
              active && !disabled
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
          })
          .join('')}</div>
        </div>
      </section>
    \`;
          })
          .join('');
};
const levelCapabilities = (level) => ({
  fail_closed: level === 'strict' || level === 'paranoid',
  paranoid_rm: level === 'paranoid',
  paranoid_interpreters: level === 'paranoid',
});
const presetName = () => safetyLevels[draftPolicy.safety.level][0];
const renderPresetStatus = () => {
  if (!preview) return;
  const customized =
    preview.counts.effectiveCustomizations > 0 ||
    Object.entries(draftPolicy.safety.overrides).some(
      ([key, value]) => value !== levelCapabilities(draftPolicy.safety.level)[key],
    );
  qs('safety-preset-status').textContent = customized ? \`\${presetName()} · Customized\` : '';
  qs('safety-preset-status').classList.toggle('customized', customized);
};
const renderSafety = () => {
  const environmentSources = preview
    ? [
        ...new Set(
          Object.values(preview.capabilities)
            .filter((capability) => capability.source === 'environment')
            .flatMap((capability) =>
              capability.sources.filter((source) => source.startsWith('env ')),
            ),
        ),
      ]
    : [];
  qs('environment-overrides').hidden = environmentSources.length === 0;
  qs('environment-overrides').textContent = environmentSources.length
    ? \`Environment-raised protection: \${environmentSources.join(', ')}\`
    : '';
  qs('safety-level').innerHTML = Object.entries(safetyLevels)
    .map(
      ([level, meta]) =>
        \`<label class="row"><input type="radio" name="safety-level" value="\${level}" \${checkbox(draftPolicy.safety.level === level)}><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span></label>\`,
    )
    .join('');
  const inherited = levelCapabilities(draftPolicy.safety.level);
  qs('safety-overrides').innerHTML = Object.entries(safetyOverrides)
    .map(([key, meta]) => {
      const value = draftPolicy.safety.overrides[key];
      const inheritedText = inherited[key] ? 'on' : 'off';
      return \`<label class="row safety-override-row"><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span><select data-safety-override="\${key}">
      <option value="inherit" \${value === undefined ? 'selected' : ''}>Inherit from preset (\${inheritedText})</option>
      <option value="true" \${value === true ? 'selected' : ''}>Force on</option>
      <option value="false" \${value === false ? 'selected' : ''}>Force off</option>
    </select></label>\`;
    })
    .join('');
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
  paranoid: ['Paranoid tier', 'Inherits from Paranoid rm or Paranoid interpreters'],
};
const ruleStateText = (rule, effective) => {
  if (effective.source === 'master_disabled')
    return 'Off — destructive-command protection disabled';
  if (effective.source === 'rule_override')
    return \`\${effective.enabled ? 'On' : 'Off'} — user rule override\`;
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
  const top =
    below + popoverRect.height <= window.innerHeight - edge
      ? below
      : Math.max(edge, buttonRect.top - gap - popoverRect.height);
  const left = Math.min(
    window.innerWidth - popoverRect.width - edge,
    Math.max(edge, buttonRect.right - popoverRect.width),
  );
  popover.style.top = \`\${top}px\`;
  popover.style.left = \`\${left}px\`;
};
const renderDestructiveCommands = () => {
  if (!preview) return;
  const query = qs('policy-search').value.trim().toLowerCase();
  const matchingRules = state.destructiveCommandRules.filter((rule) =>
    [rule.category, rule.label, rule.id, rule.description, tierMeta[tierForRule(rule)][0]]
      .join(' ')
      .toLowerCase()
      .includes(query),
  );
  qs('destructive-command-summary').textContent = draftPolicy.destructive_command_protection.enabled
    ? \`\${preview.counts.enabled} active, \${preview.counts.disabled} disabled\`
    : 'Configurable protection disabled. Catastrophic protections remain active; saved rule settings and allow paths are preserved.';
  const enforcedRules = matchingRules.filter((rule) => rule.catastrophic);
  const configurableRules = matchingRules.filter((rule) => !rule.catastrophic);
  const enforcedExpanded =
    tierExpanded.get('enforced') || (searchActive && !searchCollapsedTiers.has('enforced'));
  const enforcedSection =
    enforcedRules.length === 0
      ? ''
      : \`<section class="rule-tier rule-tier-enforced">
        <button type="button" class="rule-tier-head" data-tier-toggle="enforced" aria-expanded="\${enforcedExpanded}" aria-controls="destructive-tier-enforced">
          <span class="panel-chevron" aria-hidden="true"></span>
          <span class="tier-label"><strong>Always enforced</strong><small>Cannot be disabled by any preset, rule override, or allow path</small></span>
          <span class="tier-counts">\${enforcedRules.length} protection\${enforcedRules.length === 1 ? '' : 's'}</span>
        </button>
        <div id="destructive-tier-enforced" class="tier-content" \${enforcedExpanded ? '' : 'hidden'}>
          \${groupRules(enforcedRules)
            .map(
              (group) => \`<section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules
              .map(
                (rule) => \`<div class="row rule-row rule-row-enforced">
                <span class="rule-control">
                  <span>
                    <strong>\${escapeHtml(rule.label)}</strong>
                    <code class="rule-id">\${escapeHtml(rule.id)}</code>
                    <small><span class="state-active">Always enforced</span> \${escapeHtml(rule.description)}</small>
                  </span>
                </span>
                <button type="button" class="rule-example-button" data-rule-example="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show blocked example for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
              </div>\`,
              )
              .join('')}</div>
          </section>\`,
            )
            .join('')}
        </div>
      </section>\`;
  qs('destructive-command-rules').innerHTML =
    matchingRules.length === 0
      ? '<p class="empty">No built-in protections match the search.</p>'
      : enforcedSection +
        Object.keys(tierMeta)
          .map((tier) => {
            const rules = configurableRules.filter((rule) => tierForRule(rule) === tier);
            if (rules.length === 0) return '';
            const allTierRules = state.destructiveCommandRules.filter(
              (rule) => !rule.catastrophic && tierForRule(rule) === tier,
            );
            const tierStates = allTierRules.map((rule) => preview.rules[rule.id]);
            const expanded =
              tierExpanded.get(tier) || (searchActive && !searchCollapsedTiers.has(tier));
            const contentId = \`destructive-tier-\${tier}\`;
            return \`<section class="rule-tier rule-tier-\${tier}">
        <button type="button" class="rule-tier-head" data-tier-toggle="\${tier}" aria-expanded="\${expanded}" aria-controls="\${contentId}">
          <span class="panel-chevron" aria-hidden="true"></span>
          <span class="tier-label"><strong>\${tierMeta[tier][0]}</strong><small>\${tierMeta[tier][1]}</small></span>
          <span class="tier-counts">\${tierStates.filter((item) => item.enabled).length} on · \${tierStates.filter((item) => !item.enabled).length} off · \${tierStates.filter((item) => item.changesInherited).length} customized</span>
        </button>
        <div id="\${contentId}" class="tier-content" \${expanded ? '' : 'hidden'}>
          \${groupRules(rules)
            .map(
              (group) => \`<section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules
              .map((rule) => {
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
                \${override && !effective.changesInherited ? \`<button type="button" class="inherit-button" data-use-inherited="\${escapeHtml(rule.id)}">Use inherited setting</button>\` : ''}
              </div>\`;
              })
              .join('')}</div>
          </section>\`,
            )
            .join('')}
        </div>
      </section>\`;
          })
          .join('');
};
const refreshPolicyPreview = async () => {
  const requestId = ++previewRequestId;
  const result = await requestJson('/api/policy/preview', {
    method: 'POST',
    body: JSON.stringify(collectFormPolicy()),
  });
  if (requestId !== previewRequestId) return false;
  if (!result.ok || !result.data?.preview) {
    setAppStatus('Preview failed', 'error');
    setDetailStatus(\`Error: \${errorText(result)}\`, 'error');
    return false;
  }
  preview = result.data.preview;
  renderProtectionCard();
  renderSafety();
  renderDestructiveCommands();
  return true;
};
function render() {
  draftPolicy = clonePolicy(state.policy);
  preview = state.preview;
  dirty = false;
  qs('policy-savebar').hidden = true;
  qs('dirty-chip').hidden = true;
  qs('policy-path').textContent = state.path + (state.exists ? '' : ' (not created yet)');
  renderSafety();
  qs('destructive-command').innerHTML =
    '<label class="row master"><input type="checkbox" data-destructive-command-enabled ' +
    checkbox(state.policy.destructive_command_protection.enabled) +
    '><span><strong>Destructive command protection</strong><small>Block configurable destructive git, filesystem, and execution patterns. Catastrophic and custom rules remain active when disabled.</small></span><span class="master-badge" aria-hidden="true"></span></label>' +
    '<div id="destructive-command-rules"></div>' +
    '<section class="rule-tier">' +
    '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="allow-paths-label">Allow paths</strong><small>Recursive deletes targeting these paths are not blocked, like /tmp. The home directory, or any path containing it, is rejected.</small></span><span class="tier-counts" id="allow-paths-count"></span></button>' +
    '<div class="tier-content paths-content" id="allow-paths-content" hidden>' +
    '<p class="muted">Use an absolute path or a ~/ path. Paste multiple lines to add several paths at once.</p>' +
    '<div class="paths-add"><input type="text" id="allow-paths-input" data-path-input="allow-paths" autocomplete="off" spellcheck="false" placeholder="/absolute/path or ~/path" aria-labelledby="allow-paths-label"><button type="button" class="icon-button" id="allow-paths-add-button" data-path-add="allow-paths" aria-label="Add allow path">' +
    pathListIcons.add +
    '</button></div>' +
    '<p class="paths-hint" id="allow-paths-hint" hidden></p>' +
    '<ul class="paths-list" id="allow-paths-list"></ul>' +
    '</div></section>';
  qs('secret').innerHTML =
    '<label class="row master"><input type="checkbox" id="secret-enabled" ' +
    checkbox(state.policy.secret_protection.enabled) +
    '><span><strong>Secret protection</strong><small>Block default sensitive paths, coding CLI credential locations, and configured deny paths.</small></span><span class="master-badge" aria-hidden="true"></span></label>' +
    '<div id="secret-patterns"></div>' +
    '<section class="rule-tier">' +
    '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="deny-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="deny-paths-label">Deny paths</strong><small>Configured paths and everything inside them are blocked while Secret protection is on.</small></span><span class="tier-counts" id="deny-paths-count"></span></button>' +
    '<div class="tier-content paths-content" id="deny-paths-content" hidden>' +
    '<p class="muted">Paste multiple lines to add several paths at once.</p>' +
    '<div class="paths-add"><input type="text" id="deny-paths-input" data-path-input="deny-paths" autocomplete="off" spellcheck="false" placeholder="path/to/protect" aria-labelledby="deny-paths-label"><button type="button" class="icon-button" id="deny-paths-add-button" data-path-add="deny-paths" aria-label="Add deny path">' +
    pathListIcons.add +
    '</button></div>' +
    '<p class="paths-hint" id="deny-paths-hint" hidden></p>' +
    '<ul class="paths-list" id="deny-paths-list"></ul>' +
    '</div></section>';
  qs('raw').value = state.errors.length ? state.raw : formatPolicy(draftPolicy);
  qs('policy-search').value = '';
  syncSearchState();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists['deny-paths'].render();
  pathLists['allow-paths'].render();
  updateRawSource();
  qs('recovery').hidden = state.errors.length === 0;
  updateActions();
  renderProtectionCard();
  if (state.errors.length) {
    if (currentView() !== 'policy') location.hash = 'policy';
    setAppStatus('Repair required', 'error');
    setDetailStatus(\`Error: \${state.errors.join('\\n')}\`, 'error');
    return;
  }
  setAppStatus('');
  setDetailStatus('');
}
const restoreDraft = () => {
  if (state.errors.length) return;
  const stored = sessionStorage.getItem('cc-safety-net-draft');
  if (!stored) return;
  const parsed = (() => {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  })();
  const isPolicyShape = [
    'safety',
    'workflow',
    'destructive_command_protection',
    'secret_protection',
  ].every((key) => parsed && typeof parsed[key] === 'object' && parsed[key] !== null);
  if (!isPolicyShape || stored === JSON.stringify(state.policy)) {
    sessionStorage.removeItem('cc-safety-net-draft');
    return;
  }
  draftPolicy = parsed;
  // render() builds the two master-toggle checkboxes from state.policy and the
  // sub-renders below do not rebuild them, so sync them from the restored draft.
  document.querySelector('[data-destructive-command-enabled]').checked =
    draftPolicy.destructive_command_protection.enabled;
  qs('secret-enabled').checked = draftPolicy.secret_protection.enabled;
  renderSafety();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists['deny-paths'].render();
  pathLists['allow-paths'].render();
  syncRawFromForm();
  updateDirtyStatus();
  void refreshPolicyPreview();
  setAppStatus('Restored unsaved draft', 'ok');
};
async function load() {
  const result = await requestJson('/api/policy');
  if (!isPolicyState(result.data)) {
    setAppStatus('Load failed', 'error');
    setDetailStatus(\`Error: Could not load policy: \${errorText(result)}\`, 'error');
    return false;
  }
  state = result.data;
  render();
  restoreDraft();
  return true;
}
document.addEventListener('input', (event) => {
  const input = event.target;
  if (input.id === 'policy-search') {
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    return;
  }
  if (input.id === 'activity-search' && activity) {
    activityFilters.query = input.value.trim().toLowerCase();
    renderActivityFeed();
  }
});
document.addEventListener('keydown', (event) => {
  const list = pathLists[event.target?.dataset?.pathInput];
  if (!list || event.key !== 'Enter') return;
  event.preventDefault();
  void list.add(event.target.value);
});
document.addEventListener('paste', (event) => {
  const list = pathLists[event.target?.dataset?.pathInput];
  if (!list) return;
  const text = event.clipboardData?.getData('text') ?? '';
  if (!text.includes('\\n')) return;
  event.preventDefault();
  void list.add(\`\${event.target.value}\\n\${text}\`);
});
document.addEventListener('change', (event) => {
  const input = event.target;
  if (input.id === 'activity-days') {
    activityFilters.days = Number(input.value);
    void loadActivity();
    return;
  }
  if (input.name === 'safety-level') {
    draftPolicy.safety.level = input.value;
    renderSafety();
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  if (input.dataset?.safetyOverride) {
    if (input.value === 'inherit')
      delete draftPolicy.safety.overrides[input.dataset.safetyOverride];
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
      if (
        !input.checked &&
        !(await confirmProtectionDisable({
          title: 'Disable destructive command protection?',
          body: 'Built-in destructive git, filesystem, and execution protections will stop blocking commands until you turn this back on.',
          detail: 'Custom rules remain active.',
        }))
      ) {
        input.checked = true;
        return;
      }
      draftPolicy.destructive_command_protection.enabled = input.checked;
      pathLists['allow-paths'].render();
      syncRawFromForm();
      updateDirtyStatus();
      void refreshPolicyPreview();
    })();
    return;
  }
  if (input.dataset?.destructiveCommandActive) {
    const ruleId = input.dataset.destructiveCommandActive;
    if (input.checked === preview.rules[ruleId].inheritedEnabled)
      delete draftPolicy.destructive_command_protection.overrides[ruleId];
    else
      draftPolicy.destructive_command_protection.overrides[ruleId] = input.checked ? 'on' : 'off';
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
      if (
        !input.checked &&
        !(await confirmProtectionDisable({
          title: 'Disable secret protection?',
          body: 'Default sensitive paths, coding CLI credential locations, and deny paths will stop blocking access until you turn this back on.',
        }))
      ) {
        input.checked = true;
        return;
      }
      draftPolicy.secret_protection.enabled = input.checked;
      renderSecretPatterns();
      pathLists['deny-paths'].render();
      syncRawFromForm();
      updateDirtyStatus();
    })();
  }
});
document.addEventListener('click', (event) => {
  const feedToggle = event.target.closest?.('[data-feed-toggle]');
  if (feedToggle) {
    const expanded = feedToggle.previousElementSibling.classList.toggle('expanded');
    feedToggle.setAttribute('aria-expanded', String(expanded));
    feedToggle.textContent = expanded ? 'Show less' : 'Show more';
    return;
  }
  const topRule = event.target.closest?.('.top-rule');
  if (topRule) {
    activityFilters.query = topRule.dataset.ruleId.toLowerCase();
    qs('activity-search').value = topRule.dataset.ruleId;
    if (activity) renderActivityFeed();
    location.hash = 'activity';
    return;
  }
  if (event.target.closest?.('#guard-errors')) {
    activityFilters.decision = 'error';
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = 'activity';
    return;
  }
  const chip = event.target.closest?.('[data-activity-chip]');
  if (chip && activity) {
    activityFilters[chip.dataset.activityChip] = chip.dataset.chipValue;
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (event.target.closest?.('#activity-refresh')) {
    void loadActivity();
    return;
  }
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
  const secretGroupButton = event.target.closest?.('[data-secret-group-toggle]');
  if (secretGroupButton) {
    const category = secretGroupButton.dataset.secretGroupToggle;
    const expanded = secretGroupButton.getAttribute('aria-expanded') === 'true';
    secretGroupExpanded.set(category, !expanded);
    if (searchActive && expanded) searchCollapsedSecretGroups.add(category);
    if (!expanded) searchCollapsedSecretGroups.delete(category);
    renderSecretPatterns();
    return;
  }
  const button = event.target.closest?.('.panel-toggle, .rule-tier-head');
  if (button) {
    togglePanel(button);
    return;
  }
  const inheritedButton = event.target.closest?.('[data-use-inherited]');
  if (inheritedButton) {
    delete draftPolicy.destructive_command_protection.overrides[
      inheritedButton.dataset.useInherited
    ];
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
      if (
        !(await confirmDialog({
          title: 'Reset rule customizations?',
          body: 'All built-in destructive-command rules will return to their inherited preset settings.',
          confirmLabel: 'Reset customizations',
        }))
      )
        return;
      draftPolicy.destructive_command_protection.overrides = {};
      syncRawFromForm();
      updateDirtyStatus();
      void refreshPolicyPreview();
    })();
    return;
  }
  if (event.target.closest?.('#discard-changes')) {
    void (async () => {
      if (
        !(await confirmDialog({
          title: 'Discard unsaved changes?',
          body: 'All changes since your last save will be reverted.',
          confirmLabel: 'Discard changes',
        }))
      )
        return;
      void runExclusive('Discarding...', async () => {
        sessionStorage.removeItem('cc-safety-net-draft');
        if (await load()) setAppStatus('Changes discarded.', 'ok');
      });
    })();
    return;
  }
  const addButton = event.target.closest?.('[data-path-add]');
  if (addButton) {
    void pathLists[addButton.dataset.pathAdd].add(qs(\`\${addButton.dataset.pathAdd}-input\`).value);
    return;
  }
  const removeButton = event.target.closest?.('[data-path-remove]');
  if (removeButton)
    pathLists[removeButton.dataset.pathList].remove(Number(removeButton.dataset.pathRemove));
  const starButton = event.target.closest?.('.star-cta');
  if (starButton?.tagName === 'BUTTON') {
    void starRepo(starButton);
    return;
  }
});
qs('dirty-chip').onclick = () => {
  location.hash = 'policy';
};
qs('save').onclick = () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  if (state.errors.length) {
    setAppStatus('Repair required', 'error');
    setDetailStatus('Error: Repair policy before saving changes.', 'error');
    return;
  }
  if (!dirty) {
    setAppStatus('No changes to save', 'ok');
    setDetailStatus('');
    return;
  }
  const policy = collectFormPolicy();
  void runExclusive('Saving...', async () => {
    const result = await requestJson('/api/policy', {
      method: 'POST',
      body: JSON.stringify(policy),
    });
    if (!isWriteSuccess(result)) {
      setAppStatus('Save failed', 'error');
      setDetailStatus(\`Error: \${errorText(result)}\`, 'error');
      return;
    }
    const savedPath = result.data.path;
    sessionStorage.removeItem('cc-safety-net-draft');
    if (await load()) {
      dirty = false;
      setAppStatus(\`Saved \${savedPath}.\`, 'ok');
      setDetailStatus('');
    }
  });
};
qs('repair').onclick = async () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  if (state.errors.length === 0) {
    setAppStatus('');
    setDetailStatus('');
    return;
  }
  if (
    !(await confirmDialog({
      title: 'Repair policy?',
      body: 'This will write canonical policy JSON. Valid settings are preserved; invalid fields are discarded. If the JSON cannot be parsed, defaults are restored.',
      detail: state.path,
      confirmLabel: 'Repair',
      confirmClass: 'primary',
    }))
  ) {
    return;
  }
  void runExclusive('Repairing...', async () => {
    const result = await requestJson('/api/repair', { method: 'POST', body: '{}' });
    if (!isWriteSuccess(result)) {
      setAppStatus('Repair failed', 'error');
      setDetailStatus(\`Error: \${errorText(result)}\`, 'error');
      return;
    }
    const repairedPath = result.data.path;
    sessionStorage.removeItem('cc-safety-net-draft');
    if (await load()) {
      dirty = false;
      setAppStatus(\`Repaired \${repairedPath}.\`, 'ok');
      setDetailStatus('');
    }
  });
};
qs('reset').onclick = async () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  if (
    !(await confirmDialog({
      title: 'Reset policy?',
      body: 'This will restore the default policy JSON at this path.',
      detail: state.path,
      confirmLabel: 'Reset policy',
    }))
  ) {
    return;
  }
  void runExclusive('Resetting...', async () => {
    const result = await requestJson('/api/reset', { method: 'POST', body: '{}' });
    if (!isWriteSuccess(result)) {
      setAppStatus('Reset failed', 'error');
      setDetailStatus(\`Error: \${errorText(result)}\`, 'error');
      return;
    }
    const resetPath = result.data.path;
    sessionStorage.removeItem('cc-safety-net-draft');
    if (await load()) {
      dirty = false;
      setAppStatus(\`Reset \${resetPath} to defaults.\`, 'ok');
      setDetailStatus('');
    }
  });
};
setRawCopyCopied(false);
qs('raw-copy').onclick = () => {
  void copyRawToClipboard();
};
const themeOrder = ['auto', 'light', 'dark'];
const themeIcons = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"></rect><path d="M8 20h8M12 16v4"></path></svg>',
  light:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>',
};
const themeLabels = { auto: 'Auto', light: 'Light', dark: 'Dark' };
const applyTheme = (pref) => {
  document.documentElement.style.colorScheme = pref === 'auto' ? 'light dark' : pref;
  qs('theme-toggle').innerHTML = \`\${themeIcons[pref]}<span>\${themeLabels[pref]}</span>\`;
  qs('theme-toggle').setAttribute(
    'aria-label',
    \`Color theme: \${themeLabels[pref]}. Click to change.\`,
  );
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
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});
window.addEventListener('hashchange', applyView);
applyView();
load()
  .then((loaded) => {
    if (loaded) void loadStarContext();
    void loadActivity();
  })
  .catch((error) => {
    setAppStatus('Load failed', 'error');
    setDetailStatus(String(error), 'error');
  });
`;function renderPolicyGuiHtml(token){return page_default.replace("/* __CC_SAFETY_NET_CUSTOM_CSS__ */",custom_default).replace("<!-- __CC_SAFETY_NET_LOGO__ -->",()=>logo_default).replace("/* __CC_SAFETY_NET_SCRIPT__ */",()=>page_script_default).replace("__CC_SAFETY_NET_TOKEN__",JSON.stringify(token))}var REPO="kenryu42/cc-safety-net",REPO_URL=`https://github.com/${REPO}`,STAR_TIMEOUT_MS=1e4;async function runGuiCommand(args,options={}){let flags=parseGuiArgs(args),log=options.log??console.log,error=options.error??console.error;if(!flags)return error("Usage: cc-safety-net gui [--no-open]"),1;let server=await createPolicyGuiServer(options);if(log(`CC Safety Net policy GUI: ${server.url}`),!flags.noOpen)try{await(options.openBrowser??openBrowser)(server.url)}catch(openError){error(`Failed to open browser: ${openError instanceof Error?openError.message:String(openError)}`),error(`Open this URL manually: ${server.url}`)}if(options.keepAlive===!1)return await server.close(),0;return await waitForShutdown(server),0}async function createPolicyGuiServer(options={}){let token=options.token??randomBytes(24).toString("base64url"),server=createServer((request,response)=>{handleRequest(request,response,token,options)});await new Promise((resolve5,reject)=>{server.once("error",reject),server.listen(0,"127.0.0.1",()=>{server.off("error",reject),resolve5()})});let origin=`http://127.0.0.1:${server.address().port}`;return{origin,token,url:`${origin}/?token=${encodeURIComponent(token)}`,close:()=>closeServer(server)}}function parseGuiArgs(args){if(args.some((arg)=>arg!=="--no-open"))return null;return{noOpen:args.includes("--no-open")}}async function handleRequest(request,response,token,options){let url=new URL(request.url??"/","http://127.0.0.1");if(request.method==="GET"&&url.pathname==="/favicon.ico"){response.writeHead(204,{"cache-control":"no-store"}),response.end();return}if(!requestHasValidToken(request,url,token)){sendJson(response,403,{error:"Forbidden"});return}if(request.method==="GET"&&url.pathname==="/"){sendHtml(response,renderPolicyGuiHtml(token));return}if(request.method==="GET"&&url.pathname==="/api/policy"){let result=readUserPolicyForGui(options);sendJson(response,200,{...result,destructiveCommandRules:DESTRUCTIVE_COMMAND_RULE_METADATA,secretPatterns:SECRET_PROTECTION_RULE_METADATA,preview:result.errors.length>0?null:createPolicyPreview(result.policy)});return}if(request.method==="POST"&&url.pathname==="/api/policy/preview"){let body=await readJsonBody(request);if(!body.ok){sendJson(response,400,{errors:[body.error]});return}let result=previewUserPolicyForGui(body.value);sendJson(response,result.errors.length>0?400:200,result);return}if(request.method==="POST"&&url.pathname==="/api/policy"){let body=await readJsonBody(request);if(!body.ok){sendJson(response,400,{errors:[body.error]});return}let result=writeUserPolicyFromGui(body.value,options);sendJson(response,result.errors.length>0?400:200,result);return}if(request.method==="POST"&&url.pathname==="/api/reset"){sendJson(response,200,writeUserPolicyFromGui(DEFAULT_GUI_POLICY,options));return}if(request.method==="POST"&&url.pathname==="/api/repair"){sendJson(response,200,repairUserPolicyForGui(options));return}if(request.method==="GET"&&url.pathname==="/api/activity"){let days=parseActivityDays(url.searchParams.get("days"));if(days===null){sendJson(response,400,{error:"days must be an integer between 1 and 3650"});return}sendJson(response,200,getActivityFeed(days,options.activityLogsDir));return}if(request.method==="GET"&&url.pathname==="/api/star/context"){sendJson(response,200,await(options.fetchStarContext??(()=>fetchStarContext({logsDir:options.activityLogsDir})))());return}if(request.method==="POST"&&url.pathname==="/api/star"){let result=await(options.starRepo??starRepo)();sendJson(response,200,result.ok?{ok:!0}:{ok:!1,fallbackUrl:REPO_URL});return}sendJson(response,404,{error:"Not found"})}function parseActivityDays(raw){if(raw===null)return 7;let days=Number(raw);if(!Number.isInteger(days)||days<1||days>3650)return null;return days}function requestHasValidToken(request,url,token){if(url.searchParams.get("token")!==token)return!1;if(request.method!=="POST")return!0;return request.headers["x-cc-safety-net-token"]===token}async function readJsonBody(request){let chunks=[];for await(let chunk of request)chunks.push(chunk);try{return{ok:!0,value:JSON.parse(Buffer.concat(chunks).toString("utf-8")||"{}")}}catch(error){return{ok:!1,error:`Invalid JSON: ${error instanceof Error?error.message:String(error)}`}}}function sendHtml(response,html){response.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}),response.end(html)}function sendJson(response,status,body){response.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}),response.end(JSON.stringify(body))}function closeServer(server){return new Promise((resolve5,reject)=>{server.close((error)=>error?reject(error):resolve5())})}function waitForShutdown(server){return new Promise((resolve5)=>{let cleanup=()=>{process.off("SIGINT",shutdown),process.off("SIGTERM",shutdown)},shutdown=()=>{cleanup(),server.close().then(resolve5)};process.once("SIGINT",shutdown),process.once("SIGTERM",shutdown)})}function openBrowser(url){let command=process.platform==="darwin"?"open":process.platform==="win32"?"cmd":"xdg-open",args=process.platform==="win32"?["/c","start","",url]:[url];return new Promise((resolve5,reject)=>{let child=spawn2(command,args,{detached:!0,stdio:"ignore"}),handleError=(error)=>{child.off("spawn",handleSpawn),reject(error)},handleSpawn=()=>{child.off("error",handleError),child.unref(),resolve5()};child.once("error",handleError),child.once("spawn",handleSpawn)})}async function starRepo(command="gh",timeoutMs=STAR_TIMEOUT_MS){return{ok:await runGhCommand(command,["api","-X","PUT",`/user/starred/${REPO}`],timeoutMs)===0}}async function fetchStarContext(options={}){let[starred,starCount,blockedTotal]=await Promise.all([userHasStarredRepo(options.command),fetchStarCount(options.fetchRepo),Promise.resolve(getActivitySummary(36500,options.logsDir).totalBlocked)]);return{starred,starCount,blockedTotal}}async function userHasStarredRepo(command="gh",timeoutMs=STAR_TIMEOUT_MS){if(await runGhCommand(command,["auth","status"],timeoutMs)!==0)return null;let starredExitCode=await runGhCommand(command,["api",`/user/starred/${REPO}`],timeoutMs);if(starredExitCode===0)return!0;if(starredExitCode===null)return null;return!1}function runGhCommand(command,args,timeoutMs){return new Promise((resolve5)=>{let child=spawn2(command,args,{stdio:"ignore",windowsHide:!0}),settled=!1,timeout,finish=(code)=>{if(settled)return;if(settled=!0,timeout)clearTimeout(timeout);resolve5(code)};child.once("error",()=>finish(null)),child.once("close",finish),timeout=setTimeout(()=>{child.kill(),finish(null)},timeoutMs)})}async function fetchStarCount(fetchRepo=fetch){try{let response=await fetchRepo(`https://api.github.com/repos/${REPO}`,{headers:{accept:"application/vnd.github+json"},signal:AbortSignal.timeout(STAR_TIMEOUT_MS)});if(!response.ok)return null;let body=await response.json();return typeof body.stargazers_count==="number"?body.stargazers_count:null}catch{return null}}var version="1.0.6",INDENT="  ",PROGRAM_NAME="cc-safety-net";function formatOptionFlags(option){return option.argument?`${option.flags} ${option.argument}`:option.flags}function getOptionsColumnWidth(options){return Math.max(...options.map((opt)=>formatOptionFlags(opt).length))}function getSubcommandsColumnWidth(subcommands){return Math.max(...subcommands.map((subcommand)=>subcommand.usage.length))}function getCommandSummaryWidth(commands2){return Math.max(...commands2.map((cmd)=>`${PROGRAM_NAME} ${cmd.usage}`.length))}function formatCommandSummary(cmd,maxUsageWidth){let usage=`${PROGRAM_NAME} ${cmd.usage}`;return`${INDENT}${usage.padEnd(maxUsageWidth+2)}${cmd.description}`}function formatEnvironmentVariable(name,description){return`${INDENT}${name.padEnd(Math.max(40,name.length+2))}${description}`}function printCommandHelp(command){let lines=[];if(lines.push(`${PROGRAM_NAME} ${command.name}`),lines.push(""),lines.push(`${INDENT}${command.description}`),lines.push(""),lines.push("USAGE:"),lines.push(`${INDENT}${PROGRAM_NAME} ${command.usage}`),lines.push(""),command.subcommands&&command.subcommands.length>0){lines.push("SUBCOMMANDS:");let subcommandWidth=getSubcommandsColumnWidth(command.subcommands);for(let subcommand of command.subcommands)lines.push(`${INDENT}${subcommand.usage.padEnd(subcommandWidth+2)}${subcommand.description}`);lines.push("")}if(command.options.length>0){lines.push("OPTIONS:");let optWidth=getOptionsColumnWidth(command.options);for(let opt of command.options){let flags=formatOptionFlags(opt);lines.push(`${INDENT}${flags.padEnd(optWidth+2)}${opt.description}`)}lines.push("")}if(command.examples&&command.examples.length>0){lines.push("EXAMPLES:");for(let example of command.examples)lines.push(`${INDENT}${example}`)}console.log(lines.join(`
`))}function printHelp(){let visibleCommands=getVisibleCommands(),maxUsageWidth=getCommandSummaryWidth(visibleCommands),lines=[];lines.push(`${PROGRAM_NAME} v${version}`),lines.push(""),lines.push("Blocks destructive git and filesystem commands before execution."),lines.push(""),lines.push("COMMANDS:");for(let cmd of visibleCommands)lines.push(formatCommandSummary(cmd,maxUsageWidth));lines.push(""),lines.push("GLOBAL OPTIONS:"),lines.push(`${INDENT}-h, --help       Show help (use with command for command-specific help)`),lines.push(`${INDENT}-V, --version    Show version`),lines.push(""),lines.push("HELP:"),lines.push(`${INDENT}${PROGRAM_NAME} help <command>     Show help for a specific command`),lines.push(`${INDENT}${PROGRAM_NAME} <command> --help   Show help for a specific command`),lines.push(""),lines.push("ENVIRONMENT VARIABLES:"),lines.push(formatEnvironmentVariable(`${ENV_FLAGS.level.name}=standard|strict|paranoid`,"Set session safety level")),lines.push(formatEnvironmentVariable(`${ENV_FLAGS.worktree.name}=1`,"Allow local git discards in linked worktrees")),lines.push(formatEnvironmentVariable(`${ENV_FLAGS.debug.name}=1`,"Log allowed hook commands for debugging")),lines.push(formatEnvironmentVariable("CC_SAFETY_NET_HOME","Override rule config home directory")),lines.push(""),lines.push("LEGACY ENVIRONMENT VARIABLES (STILL SUPPORTED):"),lines.push(formatEnvironmentVariable(`${ENV_FLAGS.strict.name}=1`,"Force safety.overrides.fail_closed on")),lines.push(formatEnvironmentVariable(`${ENV_FLAGS.paranoid.name}=1`,"Force paranoid_rm and paranoid_interpreters on")),lines.push(formatEnvironmentVariable(`${ENV_FLAGS.paranoidRm.name}=1`,"Force safety.overrides.paranoid_rm on")),lines.push(formatEnvironmentVariable(`${ENV_FLAGS.paranoidInterpreters.name}=1`,"Force safety.overrides.paranoid_interpreters on")),console.log(lines.join(`
`))}function printVersion(){console.log(version)}function showCommandHelp(commandName){let command=findCommand(commandName);if(!command)return!1;if(command.hidden||command.name.toLowerCase()!==commandName.toLowerCase())return!1;return printCommandHelp(command),!0}import{homedir as homedir3}from"node:os";import{existsSync as existsSync3,mkdirSync,readFileSync as readFileSync4,writeFileSync}from"node:fs";import{dirname as dirname4}from"node:path";var ANTIGRAVITY_HOOK_COMMAND="npx -y cc-safety-net hook --agy-cli",MANAGED_HOOK_NAME="cc-safety-net";function managedHookEntry(){return{PreToolUse:[{hooks:[{type:"command",command:ANTIGRAVITY_HOOK_COMMAND,timeout:30}]}]}}function parseAntigravityHooksConfig(configPath){try{let config=JSON.parse(readFileSync4(configPath,"utf-8"));if(!config||typeof config!=="object"||Array.isArray(config))throw Error("Antigravity hooks config must be a JSON object");return config}catch(error){if(error instanceof SyntaxError)throw Error(`Failed to parse Antigravity hooks config ${configPath}: ${error.message}`);throw error}}function getManagedHookDefinition(config){let existing=config[MANAGED_HOOK_NAME];if(existing===void 0)return config[MANAGED_HOOK_NAME]=managedHookEntry(),config[MANAGED_HOOK_NAME];if(!existing||typeof existing!=="object"||Array.isArray(existing))throw Error(`Antigravity hooks config entry "${MANAGED_HOOK_NAME}" must be an object`);if(!Array.isArray(existing.PreToolUse))existing.PreToolUse=[];return existing}function hasManagedHookCommand(definition){return definition.PreToolUse?.some((entry)=>entry.hooks?.some((hook)=>hook.command===ANTIGRAVITY_HOOK_COMMAND))??!1}function hasActiveManagedHook(config){return Object.values(config).some((definition)=>definition.enabled!==!1&&hasManagedHookCommand(definition))}function enableManagedHookDefinition(config){if(config[MANAGED_HOOK_NAME]===void 0)return!1;let definition=getManagedHookDefinition(config);if(definition.enabled!==!1||!hasManagedHookCommand(definition))return!1;return definition.enabled=!0,!0}function appendManagedHook(config){if(config[MANAGED_HOOK_NAME]===void 0){config[MANAGED_HOOK_NAME]=managedHookEntry();return}let definition=getManagedHookDefinition(config);definition.PreToolUse??=[],definition.enabled=!0,definition.PreToolUse.push(managedHookEntry().PreToolUse?.[0]??{hooks:[]})}function removeManagedHook(config){let removed=!1;for(let definition of Object.values(config)){if(!Array.isArray(definition.PreToolUse))continue;definition.PreToolUse=definition.PreToolUse.flatMap((entry)=>{if(!Array.isArray(entry.hooks))return[entry];let hooks=entry.hooks.filter((hook)=>hook.command!==ANTIGRAVITY_HOOK_COMMAND);if(hooks.length!==entry.hooks.length)removed=!0;return hooks.length===0?[]:[{...entry,hooks}]})}return removed}function writeAntigravityHooksConfig(configPath,config){writeFileSync(configPath,`${JSON.stringify(config,null,2)}
`)}function installAntigravityCli(homeDir){let configPath=getAntigravityHooksPath(homeDir);if(mkdirSync(dirname4(configPath),{recursive:!0}),!existsSync3(configPath))return writeAntigravityHooksConfig(configPath,{[MANAGED_HOOK_NAME]:managedHookEntry()}),{path:configPath,alreadyInstalled:!1};let config=parseAntigravityHooksConfig(configPath);if(hasActiveManagedHook(config))return{path:configPath,alreadyInstalled:!0};if(enableManagedHookDefinition(config))return writeAntigravityHooksConfig(configPath,config),{path:configPath,alreadyInstalled:!1};return appendManagedHook(config),writeAntigravityHooksConfig(configPath,config),{path:configPath,alreadyInstalled:!1}}function uninstallAntigravityCli(homeDir){let configPath=getAntigravityHooksPath(homeDir);if(!existsSync3(configPath))return{path:configPath,alreadyInstalled:!1};let config=parseAntigravityHooksConfig(configPath);if(!removeManagedHook(config))return{path:configPath,alreadyInstalled:!1};return writeAntigravityHooksConfig(configPath,config),{path:configPath,alreadyInstalled:!0}}import{existsSync as existsSync4,mkdirSync as mkdirSync2,readFileSync as readFileSync5,writeFileSync as writeFileSync2}from"node:fs";import{dirname as dirname5,join as join8}from"node:path";function isWhitespace(char){return char!==void 0&&/\s/.test(char)}function skipString(content,index,errorMessage){let current=index+1,isEscaped=!1;while(current<content.length){let char=content[current];if(isEscaped){isEscaped=!1,current++;continue}if(char==="\\"){isEscaped=!0,current++;continue}if(char==='"')return current+1;current++}throw Error(errorMessage)}function findMatchingBracket(content,openIndex,options){let open=content[openIndex],close=open==="["?"]":"}",depth=0,index=openIndex;while(index<content.length){let nextIndex=options.skipComment?.(content,index)??index;if(nextIndex!==index){index=nextIndex;continue}if(content[index]==='"'){index=skipString(content,index,options.stringError);continue}if(content[index]===open)depth++;if(content[index]===close){if(depth--,depth===0)return index}index++}throw Error(options.bracketError)}function getLineIndent(content,index){let lineStart=content.lastIndexOf(`
`,index)+1;return/^[ \t]*/.exec(content.slice(lineStart))?.[0]??""}function removeArrayRangeItem(content,item){let{start:removeStart,end:removeEnd,end:index}=item;while(isWhitespace(content[index]))index++;if(content[index]===","){if(removeEnd=index+1,content[removeEnd]===`
`)removeEnd++;return`${content.slice(0,removeStart)}${content.slice(removeEnd)}`}index=item.start-1;while(isWhitespace(content[index]))index--;if(content[index]===","){removeStart=index;let lineStart=content.lastIndexOf(`
`,removeStart-1);if(lineStart!==-1&&/^\s*$/.test(content.slice(lineStart+1,removeStart)))removeStart=lineStart}return`${content.slice(0,removeStart)}${content.slice(removeEnd)}`}var KIMI_HOOK_COMMAND="npx -y cc-safety-net hook --kimi-code",KIMI_HOOK_BLOCK=`[[hooks]]
event = "PreToolUse"
command = "${KIMI_HOOK_COMMAND}"`,KIMI_INLINE_HOOK=`{ event = "PreToolUse", command = "${KIMI_HOOK_COMMAND}" }`;function getKimiConfigPath(homeDir){return join8(process.env.KIMI_CODE_HOME??join8(homeDir,".kimi-code"),"config.toml")}function removeTopLevelEmptyHooksArray(content){return content.split(`
`).reduce((state,line)=>{if(/^\s*\[/.test(line))return state.activeTable=!0,state.lines.push(line),state;if(!state.activeTable&&/^\s*hooks\s*=\s*\[\s*]\s*(?:#.*)?$/.test(line))return state;return state.lines.push(line),state},{activeTable:!1,lines:[]}).lines.join(`
`)}function skipTomlComment(content,index){if(content[index]!=="#")return index;let newlineIndex=content.indexOf(`
`,index+1);return newlineIndex===-1?content.length:newlineIndex+1}function findTomlArrayClose(content,openIndex){return findMatchingBracket(content,openIndex,{skipComment:skipTomlComment,stringError:"Unterminated string in Kimi Code config",bracketError:"Unmatched hooks array in Kimi Code config"})}function findTopLevelInlineHooksArray(content){let activeTable=!1,index=0;while(index<content.length){let lineEnd=content.indexOf(`
`,index),end=lineEnd===-1?content.length:lineEnd,line=content.slice(index,end);if(/^\s*\[/.test(line))activeTable=!0;if(!activeTable){let match=/^(\s*)hooks\s*=\s*\[/.exec(line);if(match){let arrayStart=index+match[0].lastIndexOf("[");return{start:arrayStart,end:findTomlArrayClose(content,arrayStart)}}}index=lineEnd===-1?content.length:lineEnd+1}return}function appendKimiInlineHook(content,hooksRange){let beforeClose=content.slice(0,hooksRange.end).trimEnd(),closingIndent=getLineIndent(content,hooksRange.end),itemIndent=closingIndent===""?"     ":`${closingIndent}  `,needsComma=!beforeClose.endsWith("[")&&!beforeClose.endsWith(",");return`${beforeClose}${needsComma?",":""}
${itemIndent}${KIMI_INLINE_HOOK}${content.slice(hooksRange.end)}`}function appendKimiHook(content){let inlineHooksRange=findTopLevelInlineHooksArray(content);if(inlineHooksRange&&content.slice(inlineHooksRange.start+1,inlineHooksRange.end).trim())return appendKimiInlineHook(content,inlineHooksRange);let trimmed=removeTopLevelEmptyHooksArray(content).trimEnd();if(trimmed==="")return`${KIMI_HOOK_BLOCK}
`;return`${trimmed}

${KIMI_HOOK_BLOCK}
`}function removeKimiTableHookBlocks(content){return content.split(/(?=^\s*\[\[hooks]]\s*$)/m).filter((block)=>!/^\s*\[\[hooks]]\s*$/m.test(block)||!block.includes(KIMI_HOOK_COMMAND)).join("").trimEnd()}function removeKimiInlineHook(content,hooksRange){let itemStart=content.indexOf(KIMI_INLINE_HOOK,hooksRange.start);if(itemStart===-1||itemStart>hooksRange.end)return content;return removeArrayRangeItem(content,{start:itemStart,end:itemStart+KIMI_INLINE_HOOK.length})}function installKimiCode(homeDir){let configPath=getKimiConfigPath(homeDir);if(mkdirSync2(dirname5(configPath),{recursive:!0}),!existsSync4(configPath))return writeFileSync2(configPath,`${KIMI_HOOK_BLOCK}
`),{path:configPath,alreadyInstalled:!1};let content=readFileSync5(configPath,"utf-8");if(content.includes(KIMI_HOOK_COMMAND))return{path:configPath,alreadyInstalled:!0};return writeFileSync2(configPath,appendKimiHook(content)),{path:configPath,alreadyInstalled:!1}}function uninstallKimiCode(homeDir){let configPath=getKimiConfigPath(homeDir);if(!existsSync4(configPath))return{path:configPath,alreadyInstalled:!1};let content=readFileSync5(configPath,"utf-8");if(!content.includes(KIMI_HOOK_COMMAND))return{path:configPath,alreadyInstalled:!1};let inlineHooksRange=findTopLevelInlineHooksArray(content),updated=inlineHooksRange?removeKimiInlineHook(content,inlineHooksRange):`${removeKimiTableHookBlocks(content)}
`;return writeFileSync2(configPath,updated),{path:configPath,alreadyInstalled:!0}}import{spawnSync}from"node:child_process";function formatNativeCommand(command){return command.join(" ")}function formatCommandFailure(command,status,output){return[`Failed to run ${formatNativeCommand(command)}${status===null?"":` (exit ${status})`}.`,output.trim()].filter(Boolean).join(`
`)}function runNativeCommand(command){let result=spawnSync(command[0],command.slice(1),{encoding:"utf-8",stdio:"pipe"}),output=[result.stdout,result.stderr].filter(Boolean).join(`
`);if(result.error)throw Error(formatCommandFailure(command,null,`${result.error.message}
${output}`.trim()));if(result.status!==0)throw Error(formatCommandFailure(command,result.status,output));return output}function runNativeCommands(commands2){commands2.forEach((command)=>{runNativeCommand(command)})}import{existsSync as existsSync5,readFileSync as readFileSync6,rmSync,writeFileSync as writeFileSync3}from"node:fs";import{join as join9}from"node:path";var OPENCODE_PACKAGE="cc-safety-net",OPENCODE_CACHE_PACKAGE=`${OPENCODE_PACKAGE}@latest`,OPENCODE_CONFIG_FILES=["opencode.json","opencode.jsonc"];function getDefaultOpenCodeConfigPath(homeDir){return join9(homeDir,".config","opencode",OPENCODE_CONFIG_FILES[0])}function getOpenCodeConfigPaths(homeDir){return OPENCODE_CONFIG_FILES.map((filename)=>join9(homeDir,".config","opencode",filename))}function getOpenCodeCachePath(homeDir){return join9(homeDir,".cache","opencode","packages",OPENCODE_CACHE_PACKAGE)}function clearOpenCodeCache(homeDir){rmSync(getOpenCodeCachePath(homeDir),{recursive:!0,force:!0})}function skipJsonComment(content,index){if(content[index]==="/"&&content[index+1]==="/"){let newlineIndex=content.indexOf(`
`,index+2);return newlineIndex===-1?content.length:newlineIndex+1}if(content[index]==="/"&&content[index+1]==="*"){let closeIndex=content.indexOf("*/",index+2);return closeIndex===-1?content.length:closeIndex+2}return index}function skipJsonTrivia(content,index){let current=index;while(current<content.length){if(/\s/.test(content[current]??"")){current++;continue}let next=skipJsonComment(content,current);if(next===current)return current;current=next}return current}function findJsonStringEnd(content,index){let current=index+1,isEscaped=!1;while(current<content.length){if(isEscaped){isEscaped=!1,current++;continue}if(content[current]==="\\"){isEscaped=!0,current++;continue}if(content[current]==='"')return current+1;current++}throw Error("Unterminated string in OpenCode config")}function readJsonString(content,start,end){return JSON.parse(content.slice(start,end))}function findJsonArrayClose(content,openIndex){return findMatchingBracket(content,openIndex,{skipComment:skipJsonComment,stringError:"Unterminated string in OpenCode config",bracketError:"Unmatched plugin array in OpenCode config"})}function findOpenCodePluginArray(content){let depth=0,index=0;while(index<content.length){let next=skipJsonComment(content,index);if(next!==index){index=next;continue}if(content[index]==='"'){let end=findJsonStringEnd(content,index);if(depth===1&&readJsonString(content,index,end)==="plugin"){let colonIndex=skipJsonTrivia(content,end),arrayStart=skipJsonTrivia(content,colonIndex+1);if(content[colonIndex]===":"&&content[arrayStart]==="[")return{start:arrayStart,end:findJsonArrayClose(content,arrayStart)}}index=end;continue}if(content[index]==="{"||content[index]==="[")depth++;if(content[index]==="}"||content[index]==="]")depth--;index++}return}function findManagedPluginItems(content,pluginArray){let ranges=[],index=pluginArray.start+1;while(index<pluginArray.end){let next=skipJsonComment(content,index);if(next!==index){index=next;continue}if(content[index]==='"'){let end=findJsonStringEnd(content,index),value=readJsonString(content,index,end);if(typeof value==="string"&&value.includes(OPENCODE_PACKAGE))ranges.push({start:index,end});index=end;continue}index++}return ranges}function parseOpenCodeConfig(content,configPath){try{return JSON.parse(stripJsonComments(content))}catch(error){if(error instanceof SyntaxError)throw Error(`Failed to parse OpenCode config ${configPath}: ${error.message}`);throw error}}function hasManagedPlugin(config){if(!config||typeof config!=="object"||Array.isArray(config))return!1;let plugins=config.plugin;if(!Array.isArray(plugins))return!1;return plugins.some((plugin)=>typeof plugin==="string"&&plugin.includes(OPENCODE_PACKAGE))}function removeManagedPlugins(content,configPath){let pluginArray=findOpenCodePluginArray(content);if(!pluginArray)throw Error(`Failed to locate OpenCode plugin array in ${configPath}`);let updated=[...findManagedPluginItems(content,pluginArray)].reverse().reduce(removeArrayRangeItem,content);return parseOpenCodeConfig(updated,configPath),updated}function uninstallOpenCode(homeDir){clearOpenCodeCache(homeDir);let configPaths=getOpenCodeConfigPaths(homeDir),existingConfigPath=configPaths.find((configPath)=>existsSync5(configPath)),errors=[];for(let configPath of configPaths){if(!existsSync5(configPath))continue;try{let content=readFileSync6(configPath,"utf-8");if(!hasManagedPlugin(parseOpenCodeConfig(content,configPath)))continue;return writeFileSync3(configPath,removeManagedPlugins(content,configPath)),{path:configPath,alreadyInstalled:!0}}catch(error){errors.push(error instanceof Error?error.message:String(error))}}if(errors.length>0)throw Error(errors.join(`
`));return{path:existingConfigPath??getDefaultOpenCodeConfigPath(homeDir),alreadyInstalled:!1}}import{spawn as spawn3,spawnSync as spawnSync2}from"node:child_process";import*as readline2 from"node:readline";var INSTALL_TARGETS=installIntegrationMetadata.map((integration)=>({target:integration.id,flag:integration.flag,label:integration.installLabel,probeCommand:integration.probeCommand})),TARGET_FLAGS=new Map(INSTALL_TARGETS.map((target)=>[target.flag,target.target]));function orderInstallTargets(targets){let selectedTargets=new Set(targets);return INSTALL_TARGETS.map((target)=>target.target).filter((target)=>selectedTargets.has(target))}function runInstallTargetsInOrder(targets,runTarget){targets.forEach(runTarget)}var PROBE_TIMEOUT_MS=2000,ASYNC_PROBE_TIMEOUT_MS=1000;function titleCaseAction(action){return action==="install"?"Install":"Uninstall"}function activeVerb(action){return action==="install"?"Installing":"Uninstalling"}function targetPreposition(action){return action==="install"?"into":"from"}function isAvailable(choice){return choice?.available===!0}function selectedInChoiceOrder(choices,selected){let selectedTargets=new Set(selected);return choices.filter((choice)=>selectedTargets.has(choice.target)).map((choice)=>choice.target)}function nextSelectableCursor(choices,cursor,direction){if(choices.length===0||choices.every((choice)=>!choice.available))return cursor;return Array.from({length:choices.length},(_,index)=>index+1).map((offset)=>(cursor+offset*direction+choices.length)%choices.length).find((index)=>isAvailable(choices[index]))}function mapKeyPress(input,key){if(key.ctrl&&key.name==="c")return"abort";if(key.name==="escape"||input==="q")return"abort";if(key.name==="up"||input==="k")return"up";if(key.name==="down"||input==="j")return"down";if(key.name==="space"||input===" ")return"toggle";if(key.name==="return"||key.name==="enter")return"confirm";return null}function defaultInstallTargetProbe(command){let result=spawnSync2(command[0],command.slice(1),{env:process.env,stdio:"ignore",timeout:PROBE_TIMEOUT_MS});return!result.error&&result.status===0}function defaultAsyncInstallTargetProbe(command){return new Promise((resolve5)=>{let proc=spawn3(command[0],command.slice(1),{env:process.env,stdio:"ignore"}),settled=!1,finish=(available)=>{if(settled)return;settled=!0,clearTimeout(timeoutId),resolve5(available)},timeoutId=setTimeout(()=>{proc.kill(),finish(!1)},ASYNC_PROBE_TIMEOUT_MS);proc.on("error",()=>finish(!1)),proc.on("close",(code)=>finish(code===0))})}function buildInstallTargetChoices(probe=defaultInstallTargetProbe,options={}){let configuredTargets=new Set(options.configuredTargets??[]);if(options.async)return Promise.all(INSTALL_TARGETS.map(async(target)=>({target:target.target,flag:target.flag,label:target.label,...getChoiceAvailability(options.action,await probe(target.probeCommand),configuredTargets.has(target.target))})));let syncProbe=probe;return INSTALL_TARGETS.map((target)=>({target:target.target,flag:target.flag,label:target.label,...getChoiceAvailability(options.action,syncProbe(target.probeCommand),configuredTargets.has(target.target))}))}function buildInstallTargetChoicesAsync(probe=defaultAsyncInstallTargetProbe,options={}){return buildInstallTargetChoices(probe,{...options,async:!0})}function applyInstallTargetState(choices,options){let configuredTargets=new Set(options.configuredTargets??[]);return choices.map((choice)=>({...choice,...getChoiceAvailability(options.action,choice.available,configuredTargets.has(choice.target))}))}function getChoiceAvailability(action,cliAvailable,configured){if(!cliAvailable)return{available:!1,unavailableReason:"CLI not installed"};if(action==="install"&&configured)return{available:!1,unavailableReason:"already installed"};if(action==="uninstall"&&!configured)return{available:!1,unavailableReason:"not installed"};return{available:!0}}function createInstallSelectionState(choices){return{cursor:choices.findIndex((choice)=>choice.available),selected:[]}}function reduceInstallSelectionState(state,choices,key){if(key==="confirm"||key==="abort")return{state,done:key};if(key==="up")return{state:{...state,cursor:nextSelectableCursor(choices,state.cursor,-1)}};if(key==="down")return{state:{...state,cursor:nextSelectableCursor(choices,state.cursor,1)}};let choice=choices[state.cursor];if(!isAvailable(choice))return{state};let selected=state.selected.includes(choice.target)?state.selected.filter((target)=>target!==choice.target):selectedInChoiceOrder(choices,[...state.selected,choice.target]);return{state:{...state,selected}}}var CHECKBOX_ON="◉",CHECKBOX_OFF="◯",CURSOR_ON=">",CURSOR_OFF=" ";function renderInstallSelection(action,choices,state,options={}){let useColor=options.color!==!1,formatDim=useColor?colors.dim:(value)=>value,formatCheckboxOn=useColor?colors.green:(value)=>value,formatFocus=useColor?colors.bold:(value)=>value;return["",`${titleCaseAction(action)} CC Safety Net ${targetPreposition(action)}:`,"",...choices.map((choice,index)=>{let selected=state.selected.includes(choice.target),focused=index===state.cursor,marker=selected?CHECKBOX_ON:CHECKBOX_OFF,cursor=focused?CURSOR_ON:CURSOR_OFF,suffix=choice.available?"":` (${choice.unavailableReason??"not installed"})`,rowBody=`${marker} ${choice.label}${suffix}`,formatted=!choice.available?formatDim(rowBody):selected?formatCheckboxOn(rowBody):focused?formatFocus(rowBody):rowBody;return`${cursor} ${formatted}`}),"",choices.some((choice)=>choice.available)?"Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel":`No selectable integrations found for ${action}. q/Esc: close`].join(`
`)}function canPromptInstallTargets(input=process.stdin,output=process.stdout){return Boolean(input.isTTY&&output.isTTY&&typeof input.setRawMode==="function")}function promptInstallTargets(action,choices,options={}){let input=options.input??process.stdin,output=options.output??process.stdout,state=createInstallSelectionState(choices);readline2.emitKeypressEvents(input);let wasRaw=input.isRaw===!0;input.setRawMode(!0),input.resume();let renderedLines=0,clearFrame=()=>{if(renderedLines===0)return;readline2.moveCursor(output,0,-renderedLines),readline2.cursorTo(output,0),readline2.clearScreenDown(output)},draw=()=>{clearFrame();let frame=renderInstallSelection(action,choices,state);output.write(`${frame}
`),renderedLines=frame.split(`
`).length};return new Promise((resolve5)=>{let cleanup=()=>{input.off("keypress",onKeyPress),input.setRawMode(wasRaw),input.pause(),clearFrame()},finish=(targets)=>{if(cleanup(),targets&&targets.length>0)output.write(`${activeVerb(action)} selected integrations...
`);resolve5(targets)};function onKeyPress(inputValue,key){let mappedKey=mapKeyPress(inputValue,key);if(!mappedKey)return;let next=reduceInstallSelectionState(state,choices,mappedKey);if(state=next.state,next.done==="abort"){finish(null);return}if(next.done==="confirm"){if(state.selected.length===0){output.write("\x07"),draw();return}finish(state.selected);return}draw()}input.on("keypress",onKeyPress),draw()})}function hasClaudeLegacyPlugin(output){return/(^|[^a-z0-9-])safety-net@cc-marketplace([^a-z0-9-]|$)/m.test(output??"")}function hasCodexLegacyPlugin(output){return/^\s*safety-net@cc-marketplace[^a-z0-9-][^\n]*installed,/m.test(output??"")}function hasCodexReplacementPlugin(output){return/^\s*cc-safety-net[^a-z0-9-][^\n]*installed,/m.test(output??"")}var NATIVE_INSTALLS={"claude-code":{installCommands:()=>[["claude","plugin","marketplace","add","kenryu42/cc-marketplace"],["claude","plugin","install","cc-safety-net@cc-marketplace"],...hasClaudeLegacyPlugin(runNativeCommand(["claude","plugin","list"]))?[["claude","plugin","uninstall","safety-net@cc-marketplace"]]:[]],uninstallCommands:[["claude","plugin","uninstall","cc-safety-net@cc-marketplace"],["claude","plugin","marketplace","remove","cc-marketplace"]]},codex:{installCommands:()=>[["codex","plugin","marketplace","add","kenryu42/cc-marketplace"],["codex","plugin","add","cc-safety-net@cc-marketplace"],...hasCodexLegacyPlugin(runNativeCommand(["codex","plugin","list"]))?[["codex","plugin","remove","safety-net@cc-marketplace"]]:[]],uninstallCommands:[["codex","plugin","remove","cc-safety-net@cc-marketplace"],["codex","plugin","marketplace","remove","cc-marketplace"]],postInstallMessage:"Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it."},"copilot-cli":{installCommands:()=>{let pluginList=runNativeCommand(["copilot","plugin","list"]),legacyUninstall=hasCopilotLegacyPlugin(pluginList)?[["copilot","plugin","uninstall","copilot-safety-net"]]:[];if(hasCopilotSafetyNetPlugin(pluginList))return legacyUninstall;return[...hasCopilotMarketplace(runNativeCommand(["copilot","plugin","marketplace","list"]))?[]:[["copilot","plugin","marketplace","add","kenryu42/cc-marketplace"]],["copilot","plugin","install",COPILOT_PLUGIN_ID],...legacyUninstall]},uninstallCommands:[["copilot","plugin","uninstall","cc-safety-net@cc-marketplace"],["copilot","plugin","marketplace","remove","cc-marketplace"]]},"gemini-cli":{installCommands:[["gemini","extensions","install","https://github.com/kenryu42/gemini-safety-net","--consent"]],uninstallCommands:[["gemini","extensions","uninstall","gemini-safety-net"]]},opencode:{beforeInstall:clearOpenCodeCache,installCommands:[["opencode","plugin","-g","-f","cc-safety-net@latest"]]},pi:{installCommands:[["pi","install","npm:cc-safety-net"]],uninstallCommands:[["pi","uninstall","npm:cc-safety-net"]]}};function getHomeDir(){return process.env.HOME??homedir3()}function parseInstallTarget(args,action){let unknownOption=args.find((arg)=>arg.startsWith("-")&&!TARGET_FLAGS.has(arg));if(unknownOption)throw Error(`Unknown ${action} option: ${unknownOption}`);let unexpectedArg=args.find((arg)=>!arg.startsWith("-"));if(unexpectedArg)throw Error(`Unexpected argument for ${action}: ${unexpectedArg}`);let targets=args.flatMap((arg)=>{let target=TARGET_FLAGS.get(arg);return target?[target]:[]});if(targets.length!==1)throw Error(`Choose exactly one ${action} target: ${[...TARGET_FLAGS.keys()].join(", ")}`);return targets[0]}async function detectConfiguredInstallTargets(){let piRawPromise=defaultVersionFetcher(["pi","--version"]),copilotBinaryVersionPromise=defaultVersionFetcher(["copilot","--binary-version"]),copilotFallbackVersionPromise=defaultVersionFetcher(["copilot","--version"]),piProbePromise=piRawPromise.then((piRaw)=>{if(!piRaw)return{status:"unavailable",installedAndEnabled:!1,matched:[]};return defaultPiProbeRunner(process.cwd())}),[claudePluginListOutput,codexPluginListOutput,geminiExtensionsListOutput,copilotBinaryVersion,copilotFallbackVersion,copilotPluginListOutput,piSafetyNetProbe]=await Promise.all([defaultVersionFetcher(["claude","plugin","list"]),defaultVersionFetcher(["codex","plugin","list"]),defaultVersionFetcher(["gemini","extensions","list"]),copilotBinaryVersionPromise,copilotFallbackVersionPromise,defaultVersionFetcher(["copilot","plugin","list"]),piProbePromise]);return detectAllHooks(process.cwd(),{claudePluginListOutput,codexPluginListOutput,geminiExtensionsListOutput,copilotCliVersion:copilotBinaryVersion??copilotFallbackVersion,copilotPluginInstalled:hasCopilotSafetyNetPlugin(copilotPluginListOutput),piSafetyNetProbe}).filter((hook)=>hook.detected).filter((hook)=>hook.platform!=="codex"||!hasCodexLegacyPlugin(codexPluginListOutput)||hasCodexReplacementPlugin(codexPluginListOutput)).map((hook)=>hook.platform)}function startResolveInstallTargets(action,args,options){if(args.length>0)return{finish:async()=>[parseInstallTarget(args,action)]};if(!options.selectTargets&&!canPromptInstallTargets(options.input,options.output))return{finish:async()=>[parseInstallTarget(args,action)]};let detectConfiguredTargets=options.detectConfiguredTargets??detectConfiguredInstallTargets,ready=Promise.all([buildInstallTargetChoicesAsync(options.probeTargets),detectConfiguredTargets()]);return{ready,finish:async()=>{let[choices,configuredTargets]=await ready,targetChoices=applyInstallTargetState(choices,{action,configuredTargets}),selected=options.selectTargets?await options.selectTargets(action,targetChoices):await promptInstallTargets(action,targetChoices,{input:options.input,output:options.output});if(!selected||selected.length===0)return null;return orderInstallTargets(selected)}}}function installNativeTarget(target,homeDir){let definition=NATIVE_INSTALLS[target];definition.beforeInstall?.(homeDir);let installCommands=typeof definition.installCommands==="function"?definition.installCommands():definition.installCommands;if(installCommands.length===0){console.log(`${getIntegrationInstallLabel(target)} integration already installed`);return}runNativeCommands(installCommands),console.log([`Installed ${getIntegrationInstallLabel(target)} integration`,definition.postInstallMessage].filter(Boolean).join(`
`))}function uninstallNativeTarget(target){let definition=NATIVE_INSTALLS[target];if(!definition.uninstallCommands)throw Error(`${getIntegrationInstallLabel(target)} uninstall is not supported`);runNativeCommands(definition.uninstallCommands),console.log(`Uninstalled ${getIntegrationInstallLabel(target)} integration`)}function uninstallOpenCodeTarget(homeDir){let result=uninstallOpenCode(homeDir);console.log(result.alreadyInstalled?`Uninstalled OpenCode plugin from ${result.path}`:`OpenCode plugin not installed in ${result.path}`)}function runConfigInstallTarget(action,target,homeDir){let result=target==="kimi-code"?action==="install"?installKimiCode(homeDir):uninstallKimiCode(homeDir):action==="install"?installAntigravityCli(homeDir):uninstallAntigravityCli(homeDir),name=getIntegrationInstallLabel(target),pastTense=action==="install"?"Installed":"Uninstalled";console.log(action==="install"&&result.alreadyInstalled?`${name} hook already installed in ${result.path}`:action==="uninstall"&&!result.alreadyInstalled?`${name} hook not installed in ${result.path}`:`${pastTense} ${name} hook ${action==="install"?"in":"from"} ${result.path}`)}var INSTALL_OPERATIONS={"antigravity-cli":{install:(homeDir)=>runConfigInstallTarget("install","antigravity-cli",homeDir),uninstall:(homeDir)=>runConfigInstallTarget("uninstall","antigravity-cli",homeDir)},"claude-code":{install:(homeDir)=>installNativeTarget("claude-code",homeDir),uninstall:()=>uninstallNativeTarget("claude-code")},codex:{install:(homeDir)=>installNativeTarget("codex",homeDir),uninstall:()=>uninstallNativeTarget("codex")},"copilot-cli":{install:(homeDir)=>installNativeTarget("copilot-cli",homeDir),uninstall:()=>uninstallNativeTarget("copilot-cli")},"gemini-cli":{install:(homeDir)=>installNativeTarget("gemini-cli",homeDir),uninstall:()=>uninstallNativeTarget("gemini-cli")},"kimi-code":{install:(homeDir)=>runConfigInstallTarget("install","kimi-code",homeDir),uninstall:(homeDir)=>runConfigInstallTarget("uninstall","kimi-code",homeDir)},opencode:{install:(homeDir)=>installNativeTarget("opencode",homeDir),uninstall:(homeDir)=>uninstallOpenCodeTarget(homeDir)},pi:{install:(homeDir)=>installNativeTarget("pi",homeDir),uninstall:()=>uninstallNativeTarget("pi")}};function runSingleInstallTarget(action,target,homeDir){INSTALL_OPERATIONS[target][action](homeDir)}async function runInstallCommand(action,args,options={}){try{let targets=await resolveAfterOptionalBanner(!0,()=>startResolveInstallTargets(action,args,options),()=>printInstallBanner({input:options.input??process.stdin,output:options.output??process.stdout}),{loadingMessage:action==="install"?"Checking available integrations…":"Checking installed integrations…",output:options.output??process.stdout});if(!targets)return 0;let homeDir=getHomeDir();return runInstallTargetsInOrder(targets,(target)=>runSingleInstallTarget(action,target,homeDir)),0}catch(e){return console.error(formatInstallError(e)),1}}function formatInstallError(error){let message=error instanceof Error?error.message:String(error),code=typeof error==="object"&&error!==null&&"code"in error?error.code:null;if(code==="EACCES"||code==="EPERM")return`${message}
Check file permissions for the target config file and parent directory.`;if(code==="ENOENT")return`${message}
Check that the target config path and parent directory exist.`;if(code==="ENOTDIR")return`${message}
Check that every parent path component is a directory.`;return message}import{join as join12}from"node:path";var RULE_DOC="# Custom Rules Reference\n\nAgent reference for generating CC Safety Net rulebook configuration.\n\n## Config Locations\n\n| Scope | Config path | Rulebook path | Cache path | Priority |\n|-------|-------------|---------------|------------|----------|\n| User | `~/.cc-safety-net/rules/rule.json` | `~/.cc-safety-net/rules/<rulebook-name>/rulebook.json` | `~/.cc-safety-net/cache/rulebooks/` | Lower |\n| Project | `.cc-safety-net/rules/rule.json` | `.cc-safety-net/rules/<rulebook-name>/rulebook.json` | `.cc-safety-net/cache/rulebooks/` | Higher |\n| GitHub source | Listed in a local `rule.json` | `.cc-safety-net/rules/<rulebook-name>/rulebook.json` in the source repository | Consumer local cache | Source order |\n\nUse `cc-safety-net rule init` to create an inert local config. Use `--global` for user scope. Use `cc-safety-net rule init --example` to also create an inactive example rulebook.\n\nLegacy inline `.safety-net.json` and `~/.cc-safety-net/config.json` files are not loaded at runtime. Convert them with `cc-safety-net rule migrate`.\n\n## rule.json Schema\n\n```json\n{\n  \"version\": 1,\n  \"rules\": [\"project-rules\", \"owner/repo#main/team-rules\"],\n  \"overrides\": {\n    \"project-rules/block-docker-system-prune\": {\n      \"reason\": \"Use targeted Docker cleanup commands.\"\n    },\n    \"team-rules/block-npm-global\": \"off\"\n  },\n  \"transparent_wrappers\": [\"rtk\"]\n}\n```\n\n- `version`: Required. Must be `1`.\n- `rules`: Optional array of rulebook source strings. Missing `rules` is treated as `[]`.\n- `overrides`: Optional object keyed by `<rulebook-name>/<rule-name>`.\n- Override values are either `\"off\"` to disable a rule or `{ \"reason\": \"...\" }` to replace the rule reason.\n- Project overrides cannot disable or rewrite user-scoped rules; such configs fail closed.\n- `transparent_wrappers`: Optional array of command names that transparently execute a visible child command.\n- Transparent wrappers have no built-in defaults. Configure only wrappers you intentionally trust, such as `\"rtk\"`.\n- Use `cc-safety-net rule wrapper add rtk` to configure RTK without manually editing `rule.json`.\n\n## Rulebook Sources\n\n- Local sources are bare rulebook names such as `project-rules`; the rulebook file is `.cc-safety-net/rules/project-rules/rulebook.json`.\n- GitHub sources use `owner/repo#ref/<rulebook-name>`.\n- GitHub refs must be one path segment, such as a tag, SHA, or branch name without `/`.\n- Rulebook source names must be unique in a config.\n\n## rulebook.json Schema\n\n```json\n{\n  \"rulebook_version\": 1,\n  \"name\": \"project-rules\",\n  \"version\": \"1.0.0\",\n  \"description\": \"Project-specific CC Safety Net rules.\",\n  \"author\": \"project\",\n  \"allowed_commands\": [\"docker\"],\n  \"rules\": [\n    {\n      \"name\": \"block-docker-system-prune\",\n      \"command\": \"docker\",\n      \"subcommand\": \"system\",\n      \"block_args\": [\"prune\"],\n      \"reason\": \"Use targeted cleanup instead.\"\n    }\n  ],\n  \"tests\": [\n    {\n      \"command\": \"docker system prune\",\n      \"expect\": \"blocked\",\n      \"rule\": \"block-docker-system-prune\"\n    },\n    {\n      \"command\": \"docker ps\",\n      \"expect\": \"allowed\"\n    }\n  ]\n}\n```\n\n### Rulebook Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `rulebook_version` | Yes | Must be `1` |\n| `name` | Yes | `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$` |\n| `version` | Yes | Non-empty string |\n| `description` | No | String |\n| `author` | No | String |\n| `allowed_commands` | Yes | Unique command names matching `^[a-zA-Z][a-zA-Z0-9_-]*$` |\n| `rules` | Yes | Array of rule objects |\n| `tests` | Yes | Array of fixtures |\n\n### Rule Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `name` | Yes | Unique within the rulebook; same pattern as rulebook `name` |\n| `command` | Yes | Must be listed in `allowed_commands`; basename only, not path |\n| `subcommand` | No | Same pattern as `command`; omit to match any subcommand |\n| `block_args` | Yes | Non-empty array of non-empty strings |\n| `reason` | Yes | Non-empty string, max 256 chars |\n\n### Test Fixture Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `command` | Yes | Non-empty shell command string |\n| `expect` | Yes | `\"blocked\"` or `\"allowed\"` |\n| `rule` | Required for blocked fixtures | Rule name expected to block the command |\n\nEvery rule must have at least one blocked fixture. Add allowed fixtures for close-but-safe commands.\n\n## Matching Behavior\n\n- **Command**: Normalized to basename (`/usr/bin/git` → `git`).\n- **Subcommand**: First non-option argument after command.\n- **Arguments**: Matched literally. Command blocked if **any** `block_args` item is present.\n- **Short options**: Expanded (`-Ap` matches `-A`).\n- **Long options**: Exact match (`--all-files` does not match `--all`).\n- **Execution order**: Built-in rules first, then custom rulebooks. Custom rules only add restrictions.\n- **Transparent wrappers**: A configured wrapper such as `rtk` lets `rtk git commit` be analyzed as `git commit` only when `git` is protected by built-in analyzers or active custom rules. `rtk -- git commit` is also supported.\n\n## Workflow\n\n1. Run `cc-safety-net rule init` or create `rule.json` manually.\n2. Optionally run `cc-safety-net rule init --example` to create an inactive example rulebook.\n3. Use `cc-safety-net rule wrapper add rtk` for trusted transparent wrappers.\n4. Run `cc-safety-net rule add <source>` after creating or choosing a rulebook source.\n5. Run `cc-safety-net rule sync` after adding or changing rulebook sources.\n6. Run `cc-safety-net rule verify` to validate config, lock/cache state, local rulebooks, and GitHub source rulebooks.\n7. Run `cc-safety-net rule test` to execute rulebook fixtures.\n8. Run `cc-safety-net rule list` to inspect active rulebooks and transparent wrappers.\n\nInvalid rule config, corrupt cache, invalid local rulebooks, or remote rulebook repair failures fail closed until repaired with `cc-safety-net rule sync`.\n";function printRuleChangeResult(result,action){if(!result.ok){printResultErrors(result);return}printResultWarnings(result),console.log(action),console.log("Rule config synced."),console.log(""),printActiveRulebookSummary(result.entries)}function printActiveRulebookSummary(entries){if(entries.length===0){console.log("Active rulebooks: (none)");return}console.log(`Active rulebooks (${entries.length}):`);for(let entry of entries)console.log(`  - ${entry.name} ${entry.version} (${formatRuleCount(entry.ruleCount??0)})`),console.log(`    Source: ${formatRulebookSource(entry,new Map)}`)}function formatRuleCount(count){return`${count} ${count===1?"rule":"rules"}`}function formatRulebookSource(entry,sourceDisplayMap){return sourceDisplayMap.get(entry.spec)??getRulebookDisplaySource(entry)}function printRulesTestResult(result,sourceDisplayMap=new Map){if(!result.ok){printResultErrors(result);return}printResultWarnings(result),console.log("Rulebook tests passed."),console.log("");for(let entry of result.entries)console.log(`  ${entry.name} ${entry.version}`),console.log(`    Source: ${formatRulebookSource(entry,sourceDisplayMap)}`),console.log(`    Rules: ${entry.ruleCount??0}`),console.log(`    Tests: ${entry.testCount??0}`);if(result.entries.length<2)return;console.log(""),console.log(`Tested ${result.entries.length} rulebooks, ${sumStats(result.entries,"ruleCount")} rules, ${sumStats(result.entries,"testCount")} tests.`)}function printRulesListReport(policy,sourceDisplayMaps){printListSection("Active sources",policy.rulebooks,(rulebook)=>[`[${rulebook.source}] ${rulebook.name} ${rulebook.version}`,`  Source: ${sourceDisplayMaps[rulebook.source].get(rulebook.spec)??rulebook.spec}`]),printListSection("Active rules",policy.rules,(rule)=>[`[${getRuleSource(policy,rule.name)}] ${rule.name}`,`  Command: ${rule.subcommand?`${rule.command} ${rule.subcommand}`:rule.command}`,`  Block args: ${rule.block_args.join(", ")}`,`  Reason: ${rule.reason}`]),printListSection("Disabled rules",getMergedOverrides(policy,"off"),(override)=>[override.key]),printListSection("Reason overrides",getMergedOverrides(policy,"reason"),(override)=>[override.key,`  Reason: ${override.value.reason}`]),printListSection("Transparent wrappers",policy.transparent_wrappers,(wrapper)=>[wrapper]),printListSection("Issues",policy.errors,(error)=>[error])}function printListSection(title,items,format){if(items.length===0){console.log(`${title}: (none)`);return}console.log(`${title} (${items.length}):`);for(let item of items){let[firstLine,...detailLines]=format(item);console.log(`  - ${firstLine}`);for(let line of detailLines)console.log(`    ${line}`)}}function getRuleSource(policy,ruleName){return policy.rulebooks.find((rulebook)=>rulebook.rules.includes(ruleName))?.source??"project"}function getMergedOverrides(policy,kind){return Object.entries({...policy.userConfig?.overrides??{},...policy.projectConfig?.overrides??{}}).filter((entry)=>{if(kind==="off")return entry[1]==="off";return!!entry[1]&&typeof entry[1]==="object"}).map(([key,value])=>({key,value}))}function sumStats(entries,key){return entries.reduce((total,entry)=>total+(entry[key]??0),0)}function printResultErrors(result){for(let error of result.errors)console.error(error)}function printResultWarnings(result){if(!result.warnings||result.warnings.length===0)return;for(let warning of result.warnings)console.warn(warning)}import{dirname as dirname6,join as join10}from"node:path";var PROJECT_MIGRATED_FROM=".safety-net.json",USER_MIGRATED_FROM="~/.cc-safety-net/config.json";async function runRulesMigrate(options){return[await migrateRulesScope({legacyPath:getLegacyProjectRulesConfigPath({cwd:options.cwd}),configPath:getProjectRulesConfigPath(options.cwd),defaultRulebookName:"project-rules",migratedFrom:PROJECT_MIGRATED_FROM,cleanup:options.cleanup,syncOptions:{cwd:options.cwd}}),await migrateRulesScope({legacyPath:getLegacyUserRulesConfigPath(),configPath:getUserRulesConfigPath(),defaultRulebookName:"user-rules",migratedFrom:USER_MIGRATED_FROM,cleanup:options.cleanup,syncOptions:{cwd:options.cwd,global:!0}})].every((result)=>result)?0:1}async function migrateRulesScope(options){let scope=getScopePaths(options.syncOptions),legacyTarget=getPolicyFilesystemTargetForPath(scope.filesystemScope,options.legacyPath),legacyContent=readPolicyFile(legacyTarget);if(legacyContent===null)return console.log(`No legacy config found at ${options.legacyPath}`),!0;let legacy=readLegacyRulesConfig(legacyContent);if(!legacy.ok){for(let error of legacy.errors)console.error(error);return!1}let loaded=readRulesConfig(scope.configTarget);if(loaded.errors.length>0){for(let error of loaded.errors)console.error(error);return!1}let config=loaded.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},rulebookName=getMigratedRulebookName(dirname6(options.configPath),config.rules,options.defaultRulebookName,options.migratedFrom,scope.filesystemScope),rulebookPath=join10(dirname6(options.configPath),rulebookName,"rulebook.json"),rulebookTarget=getPolicyFilesystemTargetForPath(scope.filesystemScope,rulebookPath),snapshots=[snapshotFile(scope.configTarget),snapshotFile(rulebookTarget),snapshotFile(scope.lockTarget)],result=await writeAndSyncMigratedRulebook(options,scope.configTarget,rulebookTarget,rulebookName,legacy.config.rules,config.rules.includes(rulebookName)?config.rules:[...config.rules,rulebookName],config.overrides??{},config.transparent_wrappers??[]);if(!result.ok){restoreFiles(snapshots);for(let error of result.errors)console.error(error);return!1}if(!options.cleanup)return console.log(`Migrated legacy config at ${options.legacyPath}. Legacy file is no longer used.`),!0;if(!isCleanupVerified(scope.configTarget,rulebookTarget,rulebookName,options.migratedFrom,legacy.config.rules))return console.error(`Migration cleanup verification failed for ${options.legacyPath}`),!1;return removePolicyFile(legacyTarget),console.log(`Deleted legacy config at ${options.legacyPath}`),!0}async function writeAndSyncMigratedRulebook(options,configTarget,rulebookTarget,rulebookName,rules,configRules,overrides,transparentWrappers){try{return writeJsonAtomic(configTarget,{version:1,rules:configRules,overrides,transparent_wrappers:transparentWrappers}),writeJsonAtomic(rulebookTarget,getMigratedRulebook(rulebookName,options.migratedFrom,rules)),await syncRulesConfig(options.syncOptions)}catch(error){return{ok:!1,errors:[error instanceof Error?error.message:String(error)]}}}function readLegacyRulesConfig(content){try{let parsed=JSON.parse(content),validation=validateConfig(parsed);if(validation.errors.length>0)return{ok:!1,errors:validation.errors};return{ok:!0,config:{version:1,rules:parsed.rules??[]}}}catch{return{ok:!1,errors:["Invalid JSON"]}}}function getMigratedRulebookName(configDir,sources,defaultRulebookName,migratedFrom,filesystemScope){let existing=sources.find((source)=>getMigratedFrom(getPolicyFilesystemTargetForPath(filesystemScope,join10(configDir,source,"rulebook.json")))===migratedFrom);if(existing)return existing;if(readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope,join10(configDir,defaultRulebookName,"rulebook.json")))===null)return defaultRulebookName;for(let i=2;;i++){let name=`${defaultRulebookName}-${i}`;if(readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope,join10(configDir,name,"rulebook.json")))===null)return name}}function getMigratedRulebook(name,migratedFrom,rules){return{rulebook_version:1,name,version:"1.0.0",description:"Migrated CC Safety Net rules.",author:"project",migrated_from:migratedFrom,allowed_commands:[...new Set(rules.map((rule)=>rule.command))],rules,tests:rules.map((rule)=>({command:[rule.command,rule.subcommand,rule.block_args[0]].filter(Boolean).join(" "),expect:"blocked",rule:rule.name}))}}function isCleanupVerified(configTarget,rulebookTarget,rulebookName,migratedFrom,legacyRules){if(!readRulesConfig(configTarget).config?.rules.includes(rulebookName))return!1;try{let content=readPolicyFile(rulebookTarget);if(content===null)return!1;let rulebook=JSON.parse(content);return rulebook.migrated_from===migratedFrom&&JSON.stringify(rulebook.rules)===JSON.stringify(legacyRules)}catch{return!1}}function snapshotFile(target){return{target,content:readPolicyFile(target)}}function restoreFiles(snapshots){for(let snapshot of snapshots){if(snapshot.content===null){removePolicyFile(snapshot.target);continue}writePolicyFileAtomic(snapshot.target,snapshot.content)}}function getMigratedFrom(target){let content=readPolicyFile(target);if(content===null)return null;try{let rulebook=JSON.parse(content);return typeof rulebook.migrated_from==="string"?rulebook.migrated_from:null}catch{return null}}import{dirname as dirname7,join as join11,resolve as resolve5}from"node:path";var VERIFY_HEADER="CC Safety Net Config",VERIFY_SEPARATOR="═".repeat(VERIFY_HEADER.length),RULES_SCHEMA_URL="https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json",RULES_DIR_RESERVED_ENTRIES=new Set(["rule.json","rule.lock","cache"]);function runRulesVerify(options={}){try{return runRulesVerifyInternal(options)}catch(error){if(error instanceof PolicyFilesystemError)return console.error(error.message),1;throw error}}function runRulesVerifyInternal(options){let cwd=options.cwd??process.cwd(),userConfig=options.userConfigPath??getUserRulesConfigPath(),projectConfig=options.projectConfigPath??getProjectRulesConfigPath(cwd),legacyUserConfig=options.legacyUserConfigPath??getLegacyUserRulesConfigPath(),legacyProjectConfig=options.legacyProjectConfigPath??getLegacyProjectConfigPath(cwd),githubSourceRulesDir=resolve5(cwd,RULES_DIR),userConfigDir=dirname7(userConfig),paths=getPolicyPaths({cwd,userConfigPath:userConfig,projectConfigPath:projectConfig}),defaultPaths=getPolicyPaths({cwd}),userConfigTarget=getPolicyFilesystemTargetForPath(paths.userScope,userConfig),projectConfigTarget=getPolicyFilesystemTargetForPath(paths.projectScope,projectConfig),legacyUserTarget=options.legacyUserConfigPath?bindDelegatedPolicyFilesystemTarget(options.legacyUserConfigPath,"user policy"):getPolicyFilesystemTargetForPath(defaultPaths.userScope,legacyUserConfig),legacyProjectTarget=options.legacyProjectConfigPath?bindDelegatedPolicyFilesystemTarget(options.legacyProjectConfigPath,"project policy"):getPolicyFilesystemTargetForPath(defaultPaths.projectScope,legacyProjectConfig),hasErrors=!1,hasWarnings=!1,configsChecked=[],warnings=[],githubSourceRules=getGitHubSourceRulesValidation(getPolicyFilesystemTargetForPath(defaultPaths.projectScope,githubSourceRulesDir));if(printRulesVerifyHeader(),readPolicyFile(userConfigTarget)!==null){let result=validateRulesConfigFile(userConfigTarget);if(result.errors.push(...getRulesConfigRuntimeErrorsForConfig(userConfig,getUserRulesLockPath({userConfigDir}),{userConfigDir},paths.userScope)),configsChecked.push({scope:"User",path:userConfig,result,schema:"rules",sourceDisplayMap:getRulesConfigSourceDisplayMap(userConfig,paths.userScope),target:userConfigTarget}),result.errors.length>0)hasErrors=!0}if(readPolicyFile(legacyUserTarget)!==null)if(hasWarnings=!0,readPolicyFile(userConfigTarget)!==null)warnings.push(getLegacyRulesConfigWarning("user","cleanup"));else{let result=validateConfigFile(legacyUserTarget);if(configsChecked.push({scope:"User",path:legacyUserConfig,result,schema:"legacy",sourceDisplayMap:new Map,inactive:!0,target:legacyUserTarget}),warnings.push(getLegacyRulesConfigWarning("user",result.errors.length>0?"fix-or-delete":"migrate")),result.errors.length>0)hasErrors=!0}if(readPolicyFile(projectConfigTarget)!==null){let result=validateRulesConfigFile(projectConfigTarget);if(result.errors.push(...getRulesConfigRuntimeErrorsForConfig(projectConfig,getRulesLockPathForConfigPath(projectConfig),{userConfigDir},paths.projectScope)),configsChecked.push({scope:"Project",path:resolve5(projectConfig),result,schema:"rules",sourceDisplayMap:getRulesConfigSourceDisplayMap(projectConfig,paths.projectScope),target:projectConfigTarget}),result.errors.length>0)hasErrors=!0;if(readPolicyFile(legacyProjectTarget)!==null)hasWarnings=!0,warnings.push(getLegacyRulesConfigWarning("project","cleanup"))}else if(readPolicyFile(legacyProjectTarget)!==null){hasWarnings=!0,hasErrors=!0;let result=validateConfigFile(legacyProjectTarget);configsChecked.push({scope:"Project",path:resolve5(legacyProjectConfig),result,schema:"legacy",sourceDisplayMap:new Map,inactive:!0,target:legacyProjectTarget}),warnings.push(getLegacyRulesConfigWarning("project",result.errors.length>0?"fix-or-delete":"migrate"))}if(githubSourceRules?.result.errors.length)hasErrors=!0;if(configsChecked.length===0&&!githubSourceRules)return console.log(`
No config files found. Using built-in rules only.`),0;for(let config of configsChecked)if(config.inactive)printInactiveLegacyRulesConfig(config.scope,config.path,config.result,config.sourceDisplayMap);else if(config.result.errors.length>0)printInvalidRulesConfig(config.scope,config.path,config.result.errors);else{if(config.schema==="rules"&&addRulesSchemaIfMissing(config.target))console.log(`
Added $schema to ${config.scope.toLowerCase()} config.`);printValidRulesConfig(config.scope,config.path,config.result,config.schema,config.sourceDisplayMap)}for(let warning of warnings)console.error(`
${colors.red(warning)}`);if(githubSourceRules)if(githubSourceRules.result.errors.length>0)printInvalidGitHubSourceRules(githubSourceRules.path,githubSourceRules.result.errors);else printValidGitHubSourceRules(githubSourceRules.path,githubSourceRules.result);if(hasErrors)return console.error(`
Config validation failed.`),1;return console.log(hasWarnings?`
Configs valid with warnings.`:`
All configs valid.`),0}function getLegacyRulesConfigWarning(scope,action){let label=`legacy ${scope} config`;if(action==="cleanup")return`Warning: Legacy ${scope} config is no longer needed. Run \`npx -y cc-safety-net rule migrate --cleanup\` to clean it up safely.`;if(action==="migrate")return`Warning: Legacy ${scope} config is ignored by CC Safety Net. Run \`npx -y cc-safety-net rule migrate\`.`;return`Warning: Legacy ${scope} config is no longer supported. Fix or delete the ${label}, then run \`npx -y cc-safety-net rule migrate\`.`}function getGitHubSourceRulesValidation(target){if(readPolicyDirectoryEntries(target)===null)return null;let result=validateGitHubSourceRules(target);if(result.ruleNames.size===0&&result.errors.length===0)return null;return{path:target.path,result}}function validateGitHubSourceRules(target){let errors=[],ruleNames=new Set,entries=(readPolicyDirectoryEntries(target)??[]).filter((entry)=>!RULES_DIR_RESERVED_ENTRIES.has(entry.name)).sort((a,b)=>a.name.localeCompare(b.name));if(entries.length===0)return{errors,ruleNames};for(let entry of entries){if(!NAME_PATTERN.test(entry.name)){errors.push(`rulebook directory names must match ${NAME_PATTERN}: ${entry.name}`);continue}if(entry.kind!=="directory"){errors.push(`${entry.name} must be a rulebook directory`);continue}let rulebookTarget=getPolicyFilesystemTargetForPath(target.scope,join11(target.path,entry.name,"rulebook.json")),content=readPolicyFile(rulebookTarget);if(content===null){errors.push(`${entry.name}/rulebook.json is required`);continue}try{let parsed;try{parsed=JSON.parse(content)}catch{errors.push(`${entry.name}/rulebook.json: invalid JSON`);continue}let rulebook=assertValidRulebook(parsed);if(rulebook.name!==entry.name){errors.push(`rulebook name "${rulebook.name}" must match folder "${entry.name}"`);continue}ruleNames.add(entry.name)}catch(error){errors.push(error instanceof Error?`${entry.name}/rulebook.json: ${error.message}`:`${entry.name}/rulebook.json: ${String(error)}`)}}return{errors,ruleNames}}function printRulesVerifyHeader(){console.log(VERIFY_HEADER),console.log(VERIFY_SEPARATOR)}function printValidRulesConfig(scope,path,result,schema,sourceDisplayMap){if(console.log(`
✓ ${scope} config: ${path}`),console.log(`  Schema: ${schema==="rules"?"rulebook sources":"legacy inline rules"}`),result.ruleNames.size>0){console.log(`  ${schema==="rules"?"Sources":"Rules"}:`);let i=1;for(let name of result.ruleNames)console.log(`    ${i}. ${sourceDisplayMap.get(name)??name}`),i++}else console.log(`  ${schema==="rules"?"Sources":"Rules"}: (none)`)}function printInactiveLegacyRulesConfig(scope,path,result,sourceDisplayMap){if(console.error(`
✗ Legacy ${scope.toLowerCase()} config: ${path}`),console.error("  Schema: legacy inline rules"),console.error("  Status: ignored by CC Safety Net"),result.errors.length>0){console.error("  Errors:");let errorNum=1;for(let error of result.errors)for(let part of error.split("; "))console.error(`    ${errorNum}. ${part}`),errorNum++;return}if(result.ruleNames.size>0){console.error("  Rules:");let i=1;for(let name of result.ruleNames)console.error(`    ${i}. ${sourceDisplayMap.get(name)??name}`),i++;return}console.error("  Rules: (none)")}function printInvalidRulesConfig(scope,path,errors){printInvalidVerifyTarget(`${scope} config`,path,errors)}function printValidGitHubSourceRules(path,result){console.log(`
✓ GitHub source rules: ${path}`),console.log("  Rulebooks:");let i=1;for(let name of result.ruleNames)console.log(`    ${i}. ${name}`),i++}function printInvalidGitHubSourceRules(path,errors){printInvalidVerifyTarget("GitHub source rules",path,errors)}function printInvalidVerifyTarget(label,path,errors){console.error(`
✗ ${label}: ${path}`),console.error("  Errors:");let errorNum=1;for(let error of errors)for(let part of error.split("; "))console.error(`    ${errorNum}. ${part}`),errorNum++}function addRulesSchemaIfMissing(target){try{let content=readPolicyFile(target);if(content===null)return!1;let parsed=JSON.parse(content);if(parsed.$schema)return!1;return writePolicyFileAtomic(target,JSON.stringify({$schema:RULES_SCHEMA_URL,...parsed},null,2)),!0}catch(error){if(error instanceof PolicyFilesystemError)throw error;return!1}}var RULE_SUBCOMMANDS=new Set(["init","add","remove","update","sync","list","wrapper","test","migrate","doc","verify"]),RULE_WRAPPER_ACTIONS=new Set(["add","remove","list"]);async function runRuleCommand(args){try{return await runRuleCommandInternal(args)}catch(error){if(error instanceof PolicyFilesystemError)return console.error(error.message),1;throw error}}async function runRuleCommandInternal(args){let flags=parseRuleFlags(args);if(flags.errors.length>0){for(let error of flags.errors)console.error(error);return 1}let subcommand=flags.positionals[0];if(flags.help)return printCommandHelp(ruleCommand),0;if(!subcommand)return printCommandHelp(ruleCommand),1;let value=flags.positionals[1],options={global:flags.global,check:flags.check};if(subcommand==="init"){let scope=getScopePaths(options),dir=scope.configDir;ensureRulesConfig(scope.configTarget),ensurePolicyDirectory(getPolicyFilesystemTargetForPath(scope.filesystemScope,getRulebookCacheRoot({...options,cacheConfigDir:dir})));let rulebookPath=join12(dir,"example-rules","rulebook.json"),rulebookTarget=getPolicyFilesystemTargetForPath(scope.filesystemScope,rulebookPath);if(flags.example&&readPolicyFile(rulebookTarget)===null)writeStarterRulebook(rulebookTarget,"example-rules");let result=await syncRulesConfig(options);return printRuleChangeResult(result,"Rule config initialized."),result.ok?0:1}if(subcommand==="add"){if(!value)return console.error("rule add requires a source"),1;let result=await addRulebookSource(value,options);return printRuleChangeResult(result,`Added rulebook source: ${value}`),result.ok?0:1}if(subcommand==="remove"){if(!value)return console.error("rule remove requires a source"),1;let result=await removeRulebookSource(value,{...options,deleteSource:flags.deleteSource});return printRuleChangeResult(result,`Removed rulebook source: ${value}`),result.ok?0:1}if(subcommand==="update"||subcommand==="sync"){let result=await syncRulesConfig({...options,only:subcommand==="update"?value:void 0});return printRuleChangeResult(result,flags.check?"Rule config checked.":"Rule config synced."),result.ok?0:1}if(subcommand==="list"){let policy=loadRulesPolicy(),paths=getPolicyPaths({});return printRulesListReport(policy,{user:getRulesConfigSourceDisplayMap(policy.userConfigPath,paths.userScope),project:getRulesConfigSourceDisplayMap(policy.projectConfigPath,paths.projectScope)}),policy.errors.length>0?1:0}if(subcommand==="wrapper")return runRuleWrapperCommand(flags);if(subcommand==="test"){let result=await testRulebookSources(value?[value]:[],options);return printRulesTestResult(result),result.ok?0:1}if(subcommand==="migrate")return runRulesMigrate({cleanup:flags.cleanup,cwd:process.cwd()});if(subcommand==="doc")return console.log(RULE_DOC),0;if(subcommand==="verify")return runRulesVerify();return 1}function parseRuleFlags(args){let flags={global:!1,check:!1,cleanup:!1,deleteSource:!1,example:!1,help:!1,positionals:[],errors:[]};for(let arg of args)if(arg==="-g"||arg==="--global")flags.global=!0;else if(arg==="--check")flags.check=!0;else if(arg==="--delete-source")flags.deleteSource=!0;else if(arg==="--cleanup")flags.cleanup=!0;else if(arg==="--example")flags.example=!0;else if(arg==="-h"||arg==="--help")flags.help=!0;else if(arg.startsWith("-"))flags.errors.push(unknownRuleOption(flags.positionals[0],arg));else flags.positionals.push(arg);return validateRuleFlags(flags),flags}function validateRuleFlags(flags){let[subcommand]=flags.positionals;if(subcommand&&!RULE_SUBCOMMANDS.has(subcommand))flags.errors.push(`Unknown rule subcommand: ${subcommand}`);if(flags.deleteSource&&subcommand!=="remove")if(subcommand&&RULE_SUBCOMMANDS.has(subcommand))flags.errors.push(`Unknown option for rule ${subcommand}: --delete-source`);else flags.errors.push("--delete-source is only valid with 'rule remove'");if(flags.cleanup&&subcommand!=="migrate")flags.errors.push(unknownRuleOption(subcommand,"--cleanup"));if(flags.example&&subcommand!=="init")flags.errors.push(unknownRuleOption(subcommand,"--example"));if(subcommand==="migrate"){if(flags.global)flags.errors.push("Unknown option for rule migrate: --global");if(flags.check)flags.errors.push("Unknown option for rule migrate: --check");if(flags.positionals.length>1)flags.errors.push(`Unexpected rule migrate argument: ${flags.positionals[1]}`)}else if(subcommand==="wrapper")validateRuleWrapperFlags(flags);else if(flags.positionals.length>2)flags.errors.push(`Unexpected rule argument: ${flags.positionals[2]}`);if(subcommand==="list"&&flags.global)flags.errors.push("Unknown option for rule list: --global")}function unknownRuleOption(subcommand,option){if(subcommand==="migrate")return`Unknown option for rule migrate: ${option}`;return`Unknown rule option: ${option}`}function validateRuleWrapperFlags(flags){let action=flags.positionals[1],command=flags.positionals[2];if(!action){flags.errors.push("rule wrapper requires add, remove, or list");return}if(!RULE_WRAPPER_ACTIONS.has(action)){flags.errors.push(`Unknown rule wrapper action: ${action}`);return}if(action==="list"){if(command)flags.errors.push(`Unexpected rule wrapper argument: ${command}`);return}if(!command){flags.errors.push(`rule wrapper ${action} requires a command`);return}if(flags.positionals.length>3)flags.errors.push(`Unexpected rule wrapper argument: ${flags.positionals[3]}`)}function ensureRulesConfig(configPath){if(readPolicyFile(configPath)===null){writeDefaultRulesConfig(configPath);return}let loaded=readRulesConfig(configPath);if(!loaded.config)return;writeJsonAtomic(configPath,{version:1,rules:loaded.config.rules,overrides:loaded.config.overrides??{},transparent_wrappers:loaded.config.transparent_wrappers??[]})}async function runRuleWrapperCommand(flags){let action=flags.positionals[1],command=flags.positionals[2],configPath=getScopePaths({global:flags.global}).configTarget;if(action==="list"){let loaded2=readRulesConfig(configPath);if(loaded2.errors.length>0){for(let error of loaded2.errors)console.error(error);return 1}return printTransparentWrappers(loaded2.config?.transparent_wrappers??[]),0}if(!command||!COMMAND_PATTERN.test(command))return console.error("transparent wrapper must match command pattern"),1;if(isReservedTransparentWrapper(command))return console.error(`reserved command "${command}" cannot be a wrapper`),1;let loaded=readRulesConfig(configPath);if(loaded.errors.length>0){for(let error of loaded.errors)console.error(error);return 1}let config=loaded.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},wrappers=action==="add"?[...new Set([...config.transparent_wrappers??[],command])]:(config.transparent_wrappers??[]).filter((wrapper)=>wrapper!==command);return writeJsonAtomic(configPath,{version:1,rules:config.rules,overrides:config.overrides??{},transparent_wrappers:wrappers}),console.log(action==="add"?`Added transparent wrapper: ${command}`:`Removed transparent wrapper: ${command}`),0}function printTransparentWrappers(wrappers){if(wrappers.length===0){console.log("Transparent wrappers: (none)");return}console.log(`Transparent wrappers (${wrappers.length}):`);for(let wrapper of wrappers)console.log(`  - ${wrapper}`)}import{existsSync as existsSync6,readFileSync as readFileSync7}from"node:fs";import{homedir as homedir4}from"node:os";import{join as join13}from"node:path";async function readStdinAsync(){if(process.stdin.isTTY)return null;return new Promise((resolve6)=>{let data="";process.stdin.setEncoding("utf-8"),process.stdin.on("data",(chunk)=>{data+=chunk}),process.stdin.on("end",()=>{let trimmed=data.trim();resolve6(trimmed||null)}),process.stdin.on("error",()=>{resolve6(null)})})}function getSettingsPath(){if(process.env.CLAUDE_SETTINGS_PATH)return process.env.CLAUDE_SETTINGS_PATH;return join13(homedir4(),".claude","settings.json")}function isPluginEnabled(){let settingsPath=getSettingsPath();if(!existsSync6(settingsPath))return!1;try{let content=readFileSync7(settingsPath,"utf-8"),settings=JSON.parse(content);if(!settings.enabledPlugins)return!1;let pluginKey="cc-safety-net@cc-marketplace";if(!(pluginKey in settings.enabledPlugins))return!1;return settings.enabledPlugins[pluginKey]===!0}catch(error){if(envTruthy(ENV_FLAGS.debug))console.error(`CC Safety Net debug: failed to read Claude settings: ${settingsPath}: ${error instanceof Error?error.message:String(error)}`);return!1}}async function printStatusline(){let enabled=isPluginEnabled(),status;if(!enabled)status="\uD83D\uDEE1️ CC Safety Net ❌";else{let policy=loadPolicySnapshot({cwd:process.cwd()}).policy,modes=getCCSafetyNetEnvModes(policy),hasEffectiveRuleCustomization=Object.values(resolveEffectiveDestructiveCommandRules(policy,modes.capabilities)).some((rule)=>rule.changesInherited),levelEmoji={standard:"✅",strict:"\uD83D\uDD12",paranoid:"\uD83D\uDC41️",custom:"\uD83D\uDD27"}[hasEffectiveRuleCustomization?"custom":modes.effectiveLevel];if(modes.worktreeMode)status=`\uD83D\uDEE1️ CC Safety Net ${levelEmoji}\uD83C\uDF33`;else status=`\uD83D\uDEE1️ CC Safety Net ${levelEmoji}`}let stdinInput=await readStdinAsync();if(stdinInput&&!stdinInput.startsWith("{"))console.log(`${stdinInput} | ${status}`);else console.log(status)}function hasHelpFlag(args){return args.includes("--help")||args.includes("-h")}function handleHelpCommand(args){if(args[0]!=="help")return!1;let commandName=args[1];if(!commandName)printHelp(),process.exit(0);if(showCommandHelp(commandName))process.exit(0);console.error(`Unknown command: ${commandName}`),console.error("Run 'cc-safety-net --help' for available commands."),process.exit(1)}function handleCommandHelp(args){if(!hasHelpFlag(args))return!1;let commandName=args[0];if(!commandName||commandName.startsWith("-"))return!1;if(findCommand(commandName))showCommandHelp(commandName),process.exit(0);return!1}var commandParsers={explain:(args)=>({mode:"explain",args}),rule:(args)=>({mode:"rule",args}),statusline:(args)=>{if(args.includes("--claude-code")||args.includes("-cc"))return{mode:"statusline"};console.error("statusline requires --claude-code (-cc)"),showCommandHelp("statusline"),process.exit(1)},hook:(args)=>{let integration=findHookIntegrationByFlag(args);if(integration)return{mode:"hook",integration};console.error("hook requires an integration flag. Try: cc-safety-net hook --kimi-code"),showCommandHelp("hook"),process.exit(1)},install:(args)=>({mode:"install",args}),uninstall:(args)=>({mode:"uninstall",args}),doctor:(args)=>({mode:"doctor",args}),logs:(args)=>({mode:"logs",args}),gui:(args)=>({mode:"gui",args})};function parseCliArgs(args){if(handleHelpCommand(args))return null;if(handleCommandHelp(args))return null;if(args.length===0||hasHelpFlag(args))printHelp(),process.exit(0);if(args.includes("--version")||args.includes("-V"))printVersion(),process.exit(0);let commandName=args[0];if(!commandName)printHelp(),process.exit(0);let command=findCommand(commandName);if(command)return commandParsers[command.name](args.slice(1));let legacyIntegration=findLegacyTopLevelHookIntegration(commandName);if(legacyIntegration)return{mode:"hook",integration:legacyIntegration};if(commandName==="--statusline")return{mode:"statusline"};console.error(`Unknown option: ${commandName}`),console.error("Run 'cc-safety-net --help' for usage."),process.exit(1)}var commandHandlers={hook:async(command)=>{await command.integration.run()},install:async(command)=>{process.exit(await runInstallCommand("install",command.args))},uninstall:async(command)=>{process.exit(await runInstallCommand("uninstall",command.args))},rule:async(command)=>{process.exit(await runRuleCommand(command.args))},statusline:async(_command)=>{await printStatusline()},doctor:async(command)=>{let flags=parseDoctorFlags(command.args),exitCode=await runDoctor({json:flags.json,skipUpdateCheck:flags.skipUpdateCheck});process.exit(exitCode)},logs:async(command)=>{process.exit(await runLogsCommand(command.args))},gui:async(command)=>{process.exit(await runGuiCommand(command.args))},explain:async(command)=>{if(hasHelpFlag(command.args)||command.args.length===0)showCommandHelp("explain"),process.exit(0);let flags=parseExplainFlags(command.args);if(!flags)process.exit(1);let result=explainCommand2(flags.command,{cwd:flags.cwd}),asciiOnly=!!process.env.NO_COLOR||!process.stdout.isTTY;if(flags.json)console.log(formatTraceJson(result));else console.log(formatTraceHuman(result,{asciiOnly}));process.exit(0)}};function assertNever(command){throw Error(`Unhandled command mode: ${JSON.stringify(command)}`)}async function runParsedCommand(command){switch(command.mode){case"hook":await commandHandlers.hook(command);return;case"install":await commandHandlers.install(command);return;case"uninstall":await commandHandlers.uninstall(command);return;case"rule":await commandHandlers.rule(command);return;case"statusline":await commandHandlers.statusline(command);return;case"doctor":await commandHandlers.doctor(command);return;case"logs":await commandHandlers.logs(command);return;case"gui":await commandHandlers.gui(command);return;case"explain":await commandHandlers.explain(command);return;default:assertNever(command)}}async function main(){let command=parseCliArgs(process.argv.slice(2));if(command)await runParsedCommand(command)}main().catch((error)=>{console.error("CC Safety Net error:",error),process.exit(1)});
