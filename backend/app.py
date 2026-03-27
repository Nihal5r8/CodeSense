from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import time, sys, os, json, asyncio, uuid, logging, re
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.llm import generate_response
from backend.parser import parse_response
from backend.visualizer import build_react_flow_json

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app")


# ─────────────────────────────────────────────
# DIFF UTILITY
# ─────────────────────────────────────────────
def extract_diff(original: str, fixed: str) -> list:
    if not original or not fixed:
        return []
    import difflib
    orig_lines  = original.splitlines()
    fixed_lines = fixed.splitlines()
    diff = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, orig_lines, fixed_lines).get_opcodes():
        if op == 'equal':
            for i, line in enumerate(orig_lines[i1:i2]):
                diff.append({"type": "unchanged", "line": line, "line_num": i1+i+1})
        elif op == 'replace':
            for i, line in enumerate(orig_lines[i1:i2]):
                diff.append({"type": "removed", "line": line, "line_num": i1+i+1})
            for j, line in enumerate(fixed_lines[j1:j2]):
                diff.append({"type": "added", "line": line, "line_num": j1+j+1})
        elif op == 'delete':
            for i, line in enumerate(orig_lines[i1:i2]):
                diff.append({"type": "removed", "line": line, "line_num": i1+i+1})
        elif op == 'insert':
            for j, line in enumerate(fixed_lines[j1:j2]):
                diff.append({"type": "added", "line": line, "line_num": j1+j+1})
    return diff

_thread_pool = ThreadPoolExecutor(max_workers=1)


# ─────────────────────────────────────────────
# REDIS
# ─────────────────────────────────────────────
import redis as redis_lib

REDIS_HOST  = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT  = int(os.environ.get("REDIS_PORT", 6379))
SESSION_TTL = 3600
MAX_HISTORY = 4

try:
    _redis = redis_lib.Redis(
        host=REDIS_HOST, port=REDIS_PORT, db=0,
        decode_responses=True, socket_connect_timeout=2,
    )
    _redis.ping()
    logger.info(f"Redis connected at {REDIS_HOST}:{REDIS_PORT}")
    REDIS_AVAILABLE = True
except Exception:
    logger.warning("Redis unavailable — conversation context disabled.")
    _redis = None
    REDIS_AVAILABLE = False


def _session_key(sid): return f"session:{sid}"

def _get_history(sid: str) -> list:
    if not REDIS_AVAILABLE or not sid:
        return []
    try:
        return [json.loads(r) for r in _redis.lrange(_session_key(sid), 0, -1)]
    except Exception:
        return []

def _save_exchange(sid: str, prompt: str, result: dict):
    if not REDIS_AVAILABLE or not sid:
        return
    try:
        mode     = result.get("mode", "generate")
        code     = result.get("code") or result.get("fixed_code", "")
        language = result.get("language", "code")
        code_snippet = code[:600] if code else ""
        if mode == "generate" and code:
            fn = re.search(r'\b(?:def|function|void|public\s+\w+)\s+(\w+)\s*\(', code)
            summary = f"generated {fn.group(1)}() in {language}" if fn else f"generated {language} code"
        elif mode == "debug":
            fn = re.search(r'\b(?:def|function|void|public\s+\w+)\s+(\w+)\s*\(', code)
            summary = f"debugged {fn.group(1)}() in {language}" if fn else "debugged code"
        else:
            summary = f"responded to: {prompt[:60]}"
        _redis.rpush(_session_key(sid), json.dumps({
            "prompt":   prompt,
            "summary":  summary,
            "code":     code_snippet,
            "language": language,
        }))
        _redis.ltrim(_session_key(sid), -MAX_HISTORY, -1)
        _redis.expire(_session_key(sid), SESSION_TTL)
        logger.info(
            f"[SESSION] Saved exchange for {sid[:8]}... "
            f"history now has {_redis.llen(_session_key(sid))} item(s)"
        )
    except Exception as e:
        logger.warning(f"Redis write failed: {e}")

def _build_context_prefix(history: list) -> str:
    if not history:
        return ""
    parts = []
    for e in history:
        summary = e.get("summary", "")
        code    = e.get("code", "")
        lang    = e.get("language", "")
        if code:
            parts.append(f"[Previous: {summary}\nCode ({lang}):\n{code}]")
        else:
            parts.append(f"[Previous: {summary}]")
    return f"Use this context from earlier in this session:\n{chr(10).join(parts)}\n\nNow answer: "


# ─────────────────────────────────────────────
# WHISPER
# ─────────────────────────────────────────────
_whisper_model = None

def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        logger.info("Loading Whisper small model on CPU...")
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
        logger.info("Whisper model ready.")
    return _whisper_model

async def _preload_whisper():
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_thread_pool, _get_whisper)
    logger.info("Whisper preload complete.")


# ─────────────────────────────────────────────
# SSE STATUS QUEUES
# ─────────────────────────────────────────────
_status_queues: dict = {}

def _emit_sync(request_id: str, step: str, message: str, progress: int = 0):
    if request_id not in _status_queues:
        return
    queue = _status_queues[request_id]
    loop  = _status_queues.get(f"{request_id}__loop")
    if loop:
        loop.call_soon_threadsafe(
            queue.put_nowait, {"step": step, "message": message, "progress": progress}
        )

async def _emit(request_id: str, step: str, message: str, progress: int = 0):
    if request_id in _status_queues:
        await _status_queues[request_id].put(
            {"step": step, "message": message, "progress": progress}
        )


# ─────────────────────────────────────────────
# LANGUAGE DETECTION
# ─────────────────────────────────────────────
_LANG_PROMPT_KEYWORDS = [
    ("c++",        "cpp"),
    ("c#",         "csharp"),
    ("typescript", "typescript"),
    ("javascript", "javascript"),
    ("golang",     "go"),
    ("kotlin",     "kotlin"),
    ("swift",      "swift"),
    ("ruby",       "ruby"),
    ("rust",       "rust"),
    ("php",        "php"),
    ("java",       "java"),
    ("python",     "python"),
    ("go ",        "go"),
]

_LANG_CODE_FINGERPRINTS = [
    (r'#include\s*[<"]',                  "cpp"),
    (r'\bstd::\w+',                       "cpp"),
    (r'\bstd::vector\b',                  "cpp"),
    (r'\bSystem\.out\.print',             "java"),
    (r'\bpublic\s+static\s+void\s+main',  "java"),
    (r'\bimport\s+java\.',                "java"),
    (r'\bconsole\.log\b',                 "javascript"),
    (r'\bconst\s+\w+\s*=\s*require\b',    "javascript"),
    (r'\bimport\s+React\b',               "javascript"),
    (r':\s*(int|str|float|bool|list|dict)\s*[,)=]', "python"),
    (r'\bdef\s+\w+\s*\(.*\)\s*:',        "python"),
    (r'\bprint\s*\(',                     "python"),
    (r'\bfmt\.Print',                     "go"),
    (r'\bpackage\s+main\b',               "go"),
    (r'\bfun\s+\w+\s*\(',                "kotlin"),
    (r'\bfn\s+\w+\s*\(',                 "rust"),
    (r'\bprintln!\s*\(',                  "rust"),
    (r'\becho\s+',                        "php"),
    (r'<\?php',                           "php"),
]

def _detect_lang_from_prompt(prompt: str) -> str:
    p = prompt.lower()
    for kw, lang in _LANG_PROMPT_KEYWORDS:
        if kw in p:
            return lang
    return ""

def _detect_lang_from_code(code: str) -> str:
    if not code:
        return ""
    for pattern, lang in _LANG_CODE_FINGERPRINTS:
        if re.search(pattern, code):
            return lang
    return ""

def _resolve_language(prompt: str, code: str, llm_lang: str) -> str:
    """Priority: code fingerprint > prompt keywords > LLM metadata > python"""
    from_code   = _detect_lang_from_code(code)
    from_prompt = _detect_lang_from_prompt(prompt)
    if from_code:
        return from_code
    if from_prompt:
        return from_prompt
    if llm_lang and llm_lang.lower() not in ("none", "unknown", ""):
        return llm_lang.lower()
    return "python"


# ─────────────────────────────────────────────
# MODE DETECTION — 3 modes: generate | debug | chat
# ─────────────────────────────────────────────
def detect_mode(prompt: str) -> str:
    p = prompt.lower().strip()

    has_code_block = "```" in prompt or any(
        kw in p for kw in ["def ", "class ", "function ", "public ", "int main", "void "]
    )

    # ── DEBUG ────────────────────────────────────────────────────────────────
    debug_strong = [
        "fix", "bug", "error", "incorrect", "debug", "wrong", "broken",
        "not working", "doesn't work", "does not work", "failing", "fails",
        "crash", "exception", "traceback", "syntax error", "runtime error",
        "logical error", "off by one", "infinite loop", "segfault",
        "null pointer", "type error", "value error",
        "correct this", "correct the", "repair", "patch",
    ]
    debug_moderate = [
        "optimize", "optimise", "refactor", "improve this", "improve the",
        "make it faster", "make this faster", "clean up", "rewrite this",
    ]
    debug_score = sum(1 for w in debug_strong + debug_moderate if w in p)

    if debug_score >= 2:
        return "debug"
    if debug_score >= 1 and has_code_block:
        return "debug"
    if debug_score >= 1 and len(p) > 80:
        return "debug"
    if debug_score >= 1 and any(w in p for w in ["code", "function", "script", "program", "output", "result"]):
        return "debug"

    # ── GENERATE ─────────────────────────────────────────────────────────────
    generate_strong = [
        "write a", "write me", "create a", "create me", "build a", "build me",
        "implement", "generate code", "generate a", "make a", "make me",
        "code for", "program for", "function for", "function to", "class for",
        "script for", "algorithm for", "give me a code", "give me code",
        "give me a function", "give me a program", "give me a script",
        "show me code", "can you code", "can you write", "can you create",
        "can you implement", "a code for", "generate a code", "generate the code",
        "visualize", "visualise", "visualization", "diagram", "flowchart",
        "flow chart", "flow diagram", "draw", "illustrate", "sketch",
        "explain", "how does", "walk me through", "break down",
    ]
    generate_lang = [
        "in python", "in java", "in c++", "in javascript", "in typescript",
        "in c#", "in go", "in golang", "in rust", "in kotlin", "in swift",
        "in ruby", "in php", "in scala", "in r ", "in matlab",
        "using python", "using java", "using c++", "using javascript",
    ]
    algo_terms = [
        "sort", "search", "tree", "graph", "stack", "queue", "linked list",
        "hash", "heap", "binary", "dynamic programming", "recursion", "factorial",
        "fibonacci", "palindrome", "anagram", "prime", "array", "string",
        "matrix", "dp", "bfs", "dfs", "dijkstra", "kruskal", "prim",
        "n queens", "queens", "knapsack", "travelling salesman", "tsp",
        "tower of hanoi", "hanoi", "longest", "shortest", "minimum", "maximum",
        "subset", "permutation", "combination", "parenthesis", "bracket",
        "sudoku", "maze", "coin change", "edit distance", "lcs", "lis",
        "memoization", "backtracking", "greedy", "sliding window",
        "bubble sort", "merge sort", "quick sort", "insertion sort", "selection sort",
    ]
    if any(w in p for w in generate_strong):
        return "generate"
    if any(w in p for w in generate_lang):
        return "generate"
    if any(w in p for w in algo_terms) and any(w in p for w in
            ["code", "solution", "program", "function", "implement", "write",
             "visualize", "diagram", "explain", "show"]):
        return "generate"

    return "chat"


# ─────────────────────────────────────────────
# ORIGINAL CODE EXTRACTION FOR DIFF
# ─────────────────────────────────────────────
def _extract_original_code(prompt: str) -> str:
    m = re.search(r'```[\w]*\n?(.*?)```', prompt, re.DOTALL)
    if m:
        return m.group(1).strip()

    lines = prompt.splitlines()
    indented, in_block = [], False
    for line in lines:
        if line.startswith('    ') or line.startswith('\t'):
            in_block = True
            indented.append(line)
        elif in_block and line.strip() == '':
            indented.append(line)
        elif in_block:
            break
    if len(indented) >= 3:
        return "\n".join(indented).strip()

    code_starters = re.compile(
        r'^(def |class |import |from |async def |'
        r'public |private |protected |static |void |int |float |double |'
        r'function |const |let |var |async function |export |'
        r'func |fn |pub fn |impl |struct |use |'
        r'#include|#define|SELECT |INSERT |UPDATE |DELETE )',
        re.IGNORECASE
    )
    code_lines, in_code = [], False
    for line in lines:
        if not in_code and code_starters.match(line.strip()):
            in_code = True
        if in_code:
            code_lines.append(line)
    extracted = "\n".join(code_lines).strip()
    return extracted if extracted else ""


# ─────────────────────────────────────────────
# PROMPTS
# KEY DESIGN DECISION: text sections come BEFORE visualization in pass 2.
# The model always completes earlier sections fully before running out of
# tokens. Putting annotated + complexity + tests first guarantees they are
# complete. Visualization comes last — if tokens run out, the visualizer
# falls back to AST/regex/minimal which still produces a valid diagram.
# ─────────────────────────────────────────────
PASS1_TOKENS = {"generate": 700,  "debug": 650}
CHAT_TOKENS  = 700
PASS2_TOKENS = {"generate": 1200, "debug": 1200}


def _pass1_prompt(user_prompt: str, mode: str, context_prefix: str = "") -> str:
    task = f"{context_prefix}{user_prompt}" if context_prefix else user_prompt

    if mode == "generate":
        return f"""[INST] You are CodeSense — an expert AI code assistant.
Write complete, working code for the following task.

TASK: {task}

Output ONLY this exact format, nothing else:

===METADATA===
LANGUAGE: <language>
ALGORITHM: <algorithm or function name>
===END METADATA===

===CODE===
<complete working code — no explanation, no backticks, no markdown>
===END CODE===
[/INST]"""

    else:  # debug — also output metadata so frontend can show language/algorithm
        task_capped = task[:2000] if len(task) > 2000 else task
        return f"""[INST] You are CodeSense — an expert AI code assistant.
Find and fix all bugs in the following code. Output metadata and the complete corrected code.

TASK: {task_capped}

Output ONLY this exact format:

===METADATA===
LANGUAGE: <language of the code>
ALGORITHM: <function or algorithm name being fixed>
===END METADATA===

===CODE===
<complete corrected code — no explanation, no backticks, no markdown>
===END CODE===
[/INST]"""


def _pass2_prompt(user_prompt: str, mode: str, code: str, language: str = "python") -> str:
    # Cap code at 600 chars to leave room for analysis sections
    code_block = code[:600] if code else "(no code provided)"

    if mode == "generate":
        # SECTION ORDER: annotated → complexity → test cases → visualization
        # Text sections first so they always complete even if tokens run out.
        # Visualization is last — fallback system handles incomplete JSON.
        return f"""[INST] You are CodeSense — an expert AI code assistant.
Analyze the following {language} code. The user is seeing this code for the first time — be thorough and educational.
Do NOT use markdown headings (no ###, ##, #). Do NOT use backticks.

CODE:
{code_block}

Output ONLY these exact sections in this exact order:

===ANNOTATED CODE===
Step 1: Initialization - Describe every variable declared at the start, what it stores, and why it is needed.
Step 2: Input Handling - Explain what inputs the function accepts, their types, and assumptions about them.
Step 3: Core Algorithm - Walk through the main logic step by step, explaining each operation and why it is done.
Step 4: Decision Points - For every condition or loop, explain what is checked and what happens in each branch.
Step 5: Output - Describe exactly what is returned or printed, what it represents, and how it was produced.
===END ANNOTATED CODE===

===COMPLEXITY===
Time: O(?) - explain why based on the actual loops and operations in the code
Space: O(?) - explain why based on what data structures are allocated
===END COMPLEXITY===

===TEST CASES===
Input: <real concrete input matching the function, e.g. arr=[5,3,1]> -> Output: <expected output, e.g. [1,3,5]>
Input: <second different real input> -> Output: <real expected output>
Input: <edge case, e.g. empty or single element> -> Output: <expected output>
===END TEST CASES===

===VISUALIZATION===
{{
  "title": "<algorithm name>",
  "nodes": [
    {{"id":"1","label":"Start","sublabel":"<function signature>","type":"start","description":"<entry point description>"}},
    {{"id":"2","label":"<first step>","sublabel":"<key variable>","type":"process","description":"<what this step does>"}},
    {{"id":"3","label":"<main loop or condition>","sublabel":"<condition>","type":"decision","description":"<what is checked>"}},
    {{"id":"4","label":"<loop body or true branch>","sublabel":"<key operation>","type":"process","description":"<what happens here>"}},
    {{"id":"5","label":"<key operation>","sublabel":"<key line>","type":"process","description":"<what happens here>"}},
    {{"id":"6","label":"End","sublabel":"<return value>","type":"end","description":"<what is returned>"}}
  ],
  "edges": [
    {{"from":"1","to":"2","label":""}},
    {{"from":"2","to":"3","label":""}},
    {{"from":"3","to":"4","label":"True"}},
    {{"from":"4","to":"3","label":"repeat"}},
    {{"from":"3","to":"5","label":"False"}},
    {{"from":"5","to":"6","label":""}}
  ]
}}
===END VISUALIZATION===
[/INST]"""

    else:  # debug
        # SECTION ORDER: annotated (bug analysis) → complexity → test cases → visualization
        # User already knows the code — keep explanations concise, bug-focused.
        return f"""[INST] You are CodeSense — an expert AI code assistant.
Analyze the following fixed {language} code. The user wrote it themselves — be concise and focus on the bug.
Do NOT use markdown headings (no ###, ##, #). Do NOT use backticks.

FIXED CODE:
{code_block}

Output ONLY these exact sections in this exact order:

===ANNOTATED CODE===
Step 1: Bug Location - State the exact line or expression that was wrong.
Step 2: Root Cause - Explain briefly why this caused incorrect behavior.
Step 3: Incorrect Behavior - Describe what the buggy code actually did wrong.
Step 4: Fix Applied - State exactly what was changed to fix it.
Step 5: Why Fix Works - Explain in one or two sentences why the fix is correct.
Brief Summary: 2-3 sentences describing what the corrected code does now that it works.
===END ANNOTATED CODE===

===COMPLEXITY===
Time: O(?) - one line explanation
Space: O(?) - one line explanation
===END COMPLEXITY===

===TEST CASES===
Input: <real input that tests the specific fix> -> Output: <expected correct output>
Input: <edge case, e.g. empty or boundary value> -> Output: <expected output>
Input: <another meaningful test> -> Output: <expected output>
===END TEST CASES===

===VISUALIZATION===
{{
  "title": "<algorithm name> - Fixed",
  "nodes": [
    {{"id":"1","label":"Start","sublabel":"<function signature>","type":"start","description":"Entry point of fixed function"}},
    {{"id":"2","label":"<first step>","sublabel":"<key line>","type":"process","description":"<what this does in fixed code>"}},
    {{"id":"3","label":"<main condition>","sublabel":"<condition>","type":"decision","description":"<what is checked>"}},
    {{"id":"4","label":"<true action>","sublabel":"<key line>","type":"process","description":"<what happens>"}},
    {{"id":"5","label":"<false action>","sublabel":"<key line>","type":"process","description":"<what happens>"}},
    {{"id":"6","label":"End","sublabel":"<return value>","type":"end","description":"<what the fixed function returns>"}}
  ],
  "edges": [
    {{"from":"1","to":"2","label":""}},
    {{"from":"2","to":"3","label":""}},
    {{"from":"3","to":"4","label":"True"}},
    {{"from":"4","to":"3","label":"repeat"}},
    {{"from":"3","to":"5","label":"False"}},
    {{"from":"5","to":"6","label":""}}
  ]
}}
===END VISUALIZATION===
[/INST]"""


# ─────────────────────────────────────────────
# CODE CLEANING
# ─────────────────────────────────────────────
def _clean_extracted_code(code: str) -> str:
    if not code or not code.strip():
        return code
    code = re.sub(r'^```[\w]*\n?', '', code, flags=re.MULTILINE)
    code = re.sub(r'```\s*$', '', code, flags=re.MULTILINE)
    code = re.sub(r'```', '', code)
    code = code.strip()
    lines = code.splitlines()
    has_indent = any(line and line[0] == ' ' for line in lines)
    if not has_indent and lines:
        result = []
        indent = 0
        STEP = 4
        for line in lines:
            s = line.strip()
            if not s:
                result.append("")
                continue
            if re.match(r'^(else|elif|except|finally)\s*[:(]', s):
                indent = max(0, indent - STEP)
            result.append(" " * indent + s)
            if re.match(r'^(return|break|continue|pass)\b', s):
                indent = max(0, indent - STEP)
            elif s.endswith(':') and not s.startswith('#'):
                indent += STEP
        code = "\n".join(result)
    return code.strip()


# ─────────────────────────────────────────────
# BLOCKING PIPELINE
# ─────────────────────────────────────────────
def _run_two_pass(user_prompt: str, mode: str, context_prefix: str, request_id: str) -> tuple:
    from backend.llm import _MODEL

    if _MODEL is None:
        _emit_sync(request_id, "model_loading", "Loading Qwen2.5-Coder into GPU... (first request only)", 20)
    else:
        _emit_sync(request_id, "model_ready", "Model ready", 20)

    # ── Chat — single pass ────────────────────────────────────────────────────
    if mode == "chat":
        _emit_sync(request_id, "generating", "Thinking...", 35)
        task = f"{context_prefix}{user_prompt}" if context_prefix else user_prompt
        chat_prompt = f"""[INST] You are CodeSense — an expert AI code assistant.
Answer the following coding question clearly and concisely.
Do NOT use markdown headings (no ###, ##, #).

{task}

Use ONLY the sections that are relevant:

If test cases help:
===TEST CASES===
Input: <real input> -> Output: <real output>
===END TEST CASES===

If complexity is relevant:
===COMPLEXITY===
Time: O(?) - explanation
Space: O(?) - explanation
===END COMPLEXITY===

If a step-by-step explanation helps:
===ANNOTATED CODE===
Step 1: Label - explanation
Step 2: Label - explanation
===END ANNOTATED CODE===

Otherwise write a plain text answer with no section markers.
[/INST]"""
        answer = generate_response(chat_prompt, max_new_tokens=CHAT_TOKENS)
        _emit_sync(request_id, "parsing", "Formatting response...", 75)
        return "", answer

    # ── Pass 1: code + metadata ───────────────────────────────────────────────
    _emit_sync(request_id, "generating", "Pass 1 of 2 — generating code...", 30)
    p1 = _pass1_prompt(user_prompt, mode, context_prefix)
    pass1_raw = generate_response(p1, max_new_tokens=PASS1_TOKENS[mode])

    code_match = re.search(
        r'===\s*CODE\s*===\s*(.*?)\s*===\s*END\s*CODE\s*===',
        pass1_raw, re.DOTALL | re.IGNORECASE
    )
    code = _clean_extracted_code(code_match.group(1).strip() if code_match else "")

    lang_match = re.search(r'LANGUAGE:\s*(\w+)', pass1_raw, re.IGNORECASE)
    llm_lang   = lang_match.group(1).lower() if lang_match else "python"
    resolved_lang = _resolve_language(user_prompt, code, llm_lang)

    # ── Pass 2: analysis sections ─────────────────────────────────────────────
    _emit_sync(request_id, "generating", "Pass 2 of 2 — generating analysis & diagram...", 55)
    p2 = _pass2_prompt(user_prompt, mode, code, resolved_lang)
    pass2_raw = generate_response(p2, max_new_tokens=PASS2_TOKENS[mode])

    _emit_sync(request_id, "parsing", "Parsing all sections...", 75)
    return pass1_raw, pass2_raw


# ─────────────────────────────────────────────
# FASTAPI APP
# ─────────────────────────────────────────────
app = FastAPI(title="CodeSense Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(_preload_whisper())


class OptionsModel(BaseModel):
    show_metadata:      bool = True
    show_code:          bool = True
    show_visualization: bool = True
    show_annotated:     bool = True
    show_complexity:    bool = True
    show_tests:         bool = True

class GenerateRequest(BaseModel):
    user_prompt: str
    options:     OptionsModel = OptionsModel()
    request_id:  str = ""
    session_id:  str = ""

class ClearSessionRequest(BaseModel):
    session_id: str


@app.get("/api/status/{request_id}")
async def status_stream(request_id: str):
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()
    _status_queues[request_id]            = queue
    _status_queues[f"{request_id}__loop"] = loop

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=300.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("step") in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    yield 'data: {"step":"timeout"}\n\n'
                    break
        finally:
            _status_queues.pop(request_id, None)
            _status_queues.pop(f"{request_id}__loop", None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/health")
async def health_check():
    from backend.llm import _MODEL
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={"status": "ok", "model_loaded": _MODEL is not None, "redis": REDIS_AVAILABLE},
        headers={"Cache-Control": "max-age=30"},
    )


@app.post("/api/session/clear")
async def clear_session(request: ClearSessionRequest):
    if REDIS_AVAILABLE and request.session_id:
        try: _redis.delete(_session_key(request.session_id))
        except Exception: pass
    return {"cleared": True}


@app.post("/api/transcribe")
async def transcribe(request: dict):
    try:
        import base64, tempfile
        audio_b64 = request.get("audio", "")
        mime_type = request.get("mime_type", "audio/webm")
        if not audio_b64:
            raise HTTPException(status_code=400, detail="No audio provided")
        audio_bytes = base64.b64decode(audio_b64)
        suffix = ".webm" if "webm" in mime_type else ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        def _transcribe():
            w = _get_whisper()
            segs, _ = w.transcribe(tmp_path, beam_size=1)
            return " ".join(s.text for s in segs).strip()
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(_thread_pool, _transcribe)
        os.unlink(tmp_path)
        logger.info(f"[TRANSCRIBE] {text[:100]}")
        return {"text": text}
    except Exception as e:
        logger.exception("[TRANSCRIBE ERROR]")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate")
async def generate_api(request: GenerateRequest):
    request_id = request.request_id or str(uuid.uuid4())
    session_id = request.session_id or ""

    try:
        mode = detect_mode(request.user_prompt)
        logger.info(f"[REQUEST] mode={mode} session={session_id or 'none'} id={request_id}")

        await _emit(request_id, "detecting", f"Detected mode: {mode}", 10)

        history        = _get_history(session_id)
        context_prefix = _build_context_prefix(history)
        if history:
            logger.info(f"[SESSION] Injecting {len(history)} previous exchange(s) as context")
        else:
            logger.info("[SESSION] No history — fresh context")

        start = time.time()
        loop  = asyncio.get_event_loop()
        pass1_raw, pass2_raw = await loop.run_in_executor(
            _thread_pool, _run_two_pass,
            request.user_prompt, mode, context_prefix, request_id,
        )

        await _emit(request_id, "rendering", "Building final output...", 90)

        # ── Chat ──────────────────────────────────────────────────────────────
        if mode == "chat":
            process_time  = round(time.time() - start, 2)
            raw           = pass2_raw.strip()
            if raw.startswith("__CHAT_TYPE__:"):
                _, _, raw = raw.partition("\n")
            chat_sections    = parse_response(raw)
            test_cases       = chat_sections.get("test_cases", "")
            complexity       = chat_sections.get("complexity", "")
            time_complexity  = chat_sections.get("time_complexity", "")
            space_complexity = chat_sections.get("space_complexity", "")
            explanation      = chat_sections.get("explanation", "")
            has_sections     = any([test_cases, complexity, explanation])
            chat_response    = "" if has_sections else raw

            await _emit(request_id, "done", f"Complete in {process_time}s", 100)
            _save_exchange(session_id, request.user_prompt, {"mode": "chat"})
            return {
                "mode": "chat", "request_id": request_id, "session_id": session_id,
                "language": "", "process_time_sec": process_time,
                "chat_response": chat_response,
                "test_cases": test_cases, "complexity": complexity,
                "time_complexity": time_complexity, "space_complexity": space_complexity,
                "explanation": explanation, "annotated": explanation,
                "code": "", "fixed_code": "", "original_code": "", "diff": [],
                "visualization": "", "metadata": None,
                "context_used": len(history) > 0,
            }

        # ── Generate / Debug ──────────────────────────────────────────────────
        sections1 = parse_response(pass1_raw) if pass1_raw else {}
        sections2 = parse_response(pass2_raw) if pass2_raw else {}

        raw_code = _clean_extracted_code(
            sections1.get("code", "") or sections2.get("code", "")
        )

        llm_lang = sections1.get("language") or sections2.get("language") or "python"
        language = _resolve_language(request.user_prompt, raw_code, llm_lang)

        # Metadata — both generate and debug now output ===METADATA=== in pass 1
        metadata = sections1.get("metadata") or {}
        # Inject resolved language into metadata so frontend shows correct language
        if isinstance(metadata, dict):
            metadata["LANGUAGE"] = language.upper()

        viz_raw       = sections2.get("visualization", "")
        visualization = build_react_flow_json(
            viz_raw, code=raw_code, language=language, hint=request.user_prompt
        )

        annotated_steps = sections2.get("explanation", "")

        # Diff — debug mode only
        diff, original_code = [], ""
        if mode == "debug" and raw_code:
            original_code = _extract_original_code(request.user_prompt)
            if original_code:
                diff = extract_diff(original_code, raw_code)

        process_time = round(time.time() - start, 2)
        logger.info(f"[DONE] mode={mode} lang={language} process_time={process_time}s")
        await _emit(request_id, "done", f"Complete in {process_time}s", 100)

        opts = request.options

        result = {
            "mode":             mode,
            "request_id":       request_id,
            "session_id":       session_id,
            "language":         language,
            "process_time_sec": process_time,
            "context_used":     len(history) > 0,

            # code
            "code":          raw_code      if (mode == "generate" and opts.show_code) else "",
            "fixed_code":    raw_code      if (mode == "debug"    and opts.show_code) else "",
            "original_code": original_code if  mode == "debug"                        else "",
            "diff":          diff          if (mode == "debug"    and opts.show_code) else [],

            # metadata — both modes, toggleable, never in chat
            "metadata": metadata if opts.show_metadata else None,

            # visualization
            "visualization": visualization if opts.show_visualization else "",

            # annotated step-by-step
            "explanation": annotated_steps if opts.show_annotated else "",
            "annotated":   annotated_steps if opts.show_annotated else "",

            # complexity
            "complexity":       sections2.get("complexity", "")       if opts.show_complexity else "",
            "time_complexity":  sections2.get("time_complexity", "")   if opts.show_complexity else "",
            "space_complexity": sections2.get("space_complexity", "")  if opts.show_complexity else "",

            # test cases
            "test_cases": sections2.get("test_cases", "") if opts.show_tests else "",
        }

        _save_exchange(session_id, request.user_prompt, result)
        return result

    except Exception as e:
        await _emit(request_id, "error", str(e), 0)
        logger.exception("[ERROR] Unhandled exception in /api/generate")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)