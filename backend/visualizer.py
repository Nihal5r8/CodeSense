"""
visualizer.py  —  React Flow JSON builder
==========================================
Replaces Mermaid entirely. Outputs JSON consumed by ReactFlowDiagram.jsx.

Priority chain:
  1. Parse LLM JSON from ===VISUALIZATION=== section  (all languages)
  2. Build from Python AST                             (Python only)
  3. Return minimal fallback graph                     (never crashes)
"""

import re
import ast
import json
import logging

logger = logging.getLogger("visualizer")

MAX_LABEL   = 40
MAX_NODES   = 14

# ─────────────────────────────────────────────
# FALLBACK
# ─────────────────────────────────────────────
def _fallback(hint: str = "") -> str:
    title = hint[:40] if hint else "Algorithm"
    return json.dumps({
        "title": title,
        "nodes": [
            {"id":"1","label":"Start","sublabel":"","type":"start","description":"Algorithm entry point"},
            {"id":"2","label":"Process","sublabel":"","type":"process","description":"Main algorithm logic"},
            {"id":"3","label":"End","sublabel":"","type":"end","description":"Algorithm completes"},
        ],
        "edges": [
            {"from":"1","to":"2","label":""},
            {"from":"2","to":"3","label":""},
        ],
    })

# ─────────────────────────────────────────────
# JSON REPAIR
# ─────────────────────────────────────────────
def _repair_json(raw: str):
    if not raw or not raw.strip():
        return None
    start = raw.find("{")
    end   = raw.rfind("}")
    if start == -1 or end == -1:
        return None
    s = raw[start:end+1]
    s = re.sub(r",(\s*[}\]])", r"\1", s)
    s = s.replace("\u201c",'"').replace("\u201d",'"').replace("\u2018","'").replace("\u2019","'")
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", s)
    try:
        return json.loads(s)
    except Exception:
        return None

# ─────────────────────────────────────────────
# TEXT CLEANING
# ─────────────────────────────────────────────
def _clean_text(s: str, maxlen: int = MAX_LABEL) -> str:
    if not s: return ""
    s = str(s)
    s = re.sub(r'[`{}]', "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:maxlen]

VALID_TYPES = {"start","end","process","decision","io","recursive"}

# ─────────────────────────────────────────────
# VALIDATE GRAPH
# ─────────────────────────────────────────────
def _validate_graph(data: dict, hint: str = ""):
    if not isinstance(data, dict):
        return None
    raw_nodes = data.get("nodes", [])
    raw_edges = data.get("edges", [])
    if not raw_nodes or not isinstance(raw_nodes, list):
        return None

    nodes = []
    seen_ids = set()
    for n in raw_nodes[:MAX_NODES]:
        if not isinstance(n, dict): continue
        nid = str(n.get("id","")).strip()
        if not nid or nid in seen_ids: continue
        seen_ids.add(nid)
        ntype = n.get("type","process")
        if ntype not in VALID_TYPES: ntype = "process"
        nodes.append({
            "id":          nid,
            "label":       _clean_text(n.get("label","Step"), MAX_LABEL),
            "sublabel":    _clean_text(n.get("sublabel",""), 60),
            "type":        ntype,
            "description": _clean_text(n.get("description",""), 120),
        })

    if not nodes: return None
    valid_ids = {n["id"] for n in nodes}

    edges = []
    seen_edges = set()
    for e in raw_edges:
        if not isinstance(e, dict): continue
        src = str(e.get("from","")).strip()
        tgt = str(e.get("to","")).strip()
        if not src or not tgt: continue
        if src not in valid_ids or tgt not in valid_ids: continue
        key = (src, tgt)
        if key in seen_edges: continue
        seen_edges.add(key)
        edges.append({
            "from":  src,
            "to":    tgt,
            "label": _clean_text(e.get("label",""), 20),
        })

    return {
        "title": _clean_text(data.get("title", hint), 60) or "Algorithm Flow",
        "nodes": nodes,
        "edges": edges,
    }

# ─────────────────────────────────────────────
# PYTHON AST BUILDER
# ─────────────────────────────────────────────
class _ASTFlowBuilder:
    def __init__(self):
        self._nodes = []
        self._edges = []
        self._counter = 0
        self._fn_name = ""

    def _uid(self):
        self._counter += 1
        return str(self._counter)

    def _node(self, label, ntype, sublabel="", description=""):
        nid = self._uid()
        self._nodes.append({
            "id":          nid,
            "label":       _clean_text(label, MAX_LABEL),
            "sublabel":    _clean_text(sublabel, 55),
            "type":        ntype,
            "description": _clean_text(description, 120),
        })
        return nid

    def _edge(self, src, tgt, label=""):
        if src and tgt:
            self._edges.append({"from": src, "to": tgt, "label": _clean_text(label, 20)})

    @staticmethod
    def _expr(node):
        try: return ast.unparse(node)[:50]
        except Exception: return ""

    def _walk_stmts(self, stmts, prev, depth=0):
        cur = prev
        for stmt in stmts:
            if len(self._nodes) >= MAX_NODES: break
            cur = self._walk_stmt(stmt, cur, depth)
        return cur

    def _walk_stmt(self, stmt, prev, depth=0):
        if isinstance(stmt, ast.Return):
            val = self._expr(stmt.value) if stmt.value else "None"
            nid = self._node(f"Return {val}", "end",
                             sublabel=f"return {val}",
                             description=f"Function returns {val}")
            self._edge(prev, nid)
            return nid

        if isinstance(stmt, ast.If):
            cond   = self._expr(stmt.test)
            dec_id = self._node(f"if {cond}", "decision",
                                sublabel=cond,
                                description=f"Branch on: {cond}")
            self._edge(prev, dec_id)
            true_end  = self._walk_stmts(stmt.body,   dec_id, depth+1)
            false_end = dec_id
            if stmt.orelse:
                false_end = self._walk_stmts(stmt.orelse, dec_id, depth+1)
            # Label true/false edges from decision
            labeled_true = False
            for e in self._edges:
                if e["from"] == dec_id:
                    if not labeled_true and not e["label"]:
                        e["label"] = "True"; labeled_true = True
                    elif labeled_true and not e["label"]:
                        e["label"] = "False"
            merge = self._node("Continue", "process", description="Execution merges after branch")
            self._edge(true_end, merge)
            if false_end != dec_id:
                self._edge(false_end, merge)
            return merge

        if isinstance(stmt, ast.For):
            tgt   = self._expr(stmt.target)
            itr   = self._expr(stmt.iter)
            label = f"For each {tgt} in {itr}"
            nid   = self._node(label, "decision",
                               sublabel=f"for {tgt} in {itr}",
                               description=f"Iterate over {itr}, bind to {tgt}")
            self._edge(prev, nid)
            body_end = self._walk_stmts(stmt.body, nid, depth+1)
            self._edge(body_end, nid, "next item")
            after = self._node("Loop complete", "process", description="All items processed")
            self._edge(nid, after, "done")
            return after

        if isinstance(stmt, ast.While):
            cond  = self._expr(stmt.test)
            nid   = self._node(f"While {cond}", "decision",
                               sublabel=cond,
                               description=f"Loop while: {cond}")
            self._edge(prev, nid)
            body_end = self._walk_stmts(stmt.body, nid, depth+1)
            self._edge(body_end, nid, "repeat")
            after = self._node("Loop complete", "process", description="Condition became false")
            self._edge(nid, after, "done")
            return after

        if isinstance(stmt, ast.Assign):
            tgts  = ", ".join(self._expr(t) for t in stmt.targets)
            val   = self._expr(stmt.value)
            label = f"{tgts} = {val}"
            ntype = "recursive" if (
                isinstance(stmt.value, ast.Call) and self._fn_name and
                isinstance(stmt.value.func, ast.Name) and
                stmt.value.func.id == self._fn_name
            ) else "process"
            nid = self._node(label[:MAX_LABEL], ntype,
                             sublabel=label,
                             description=f"Assign {val} to {tgts}")
            self._edge(prev, nid)
            return nid

        if isinstance(stmt, ast.AugAssign):
            tgt = self._expr(stmt.target)
            ops = {ast.Add:"+=",ast.Sub:"-=",ast.Mult:"*=",ast.Div:"/=",
                   ast.Mod:"%=",ast.Pow:"**="}
            op  = ops.get(type(stmt.op), "op=")
            val = self._expr(stmt.value)
            label = f"{tgt} {op} {val}"
            nid = self._node(label[:MAX_LABEL], "process",
                             sublabel=label,
                             description=f"Update {tgt}")
            self._edge(prev, nid)
            return nid

        if isinstance(stmt, ast.Expr):
            call_str = self._expr(stmt.value)
            ntype = "io"
            if isinstance(stmt.value, ast.Call):
                fname = ""
                if isinstance(stmt.value.func, ast.Name):
                    fname = stmt.value.func.id
                elif isinstance(stmt.value.func, ast.Attribute):
                    fname = stmt.value.func.attr
                if fname not in ("print","input","write","read","append","extend","add","push"):
                    ntype = "recursive" if fname == self._fn_name else "process"
            nid = self._node(call_str[:MAX_LABEL], ntype,
                             sublabel=call_str,
                             description=f"Execute: {call_str}")
            self._edge(prev, nid)
            return nid

        try:    src = ast.unparse(stmt)[:MAX_LABEL]
        except: src = type(stmt).__name__
        nid = self._node(src, "process", sublabel=src)
        self._edge(prev, nid)
        return nid

    def build(self, code: str, hint: str = ""):
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return None

        fn_node = None
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                fn_node = node; break
        if fn_node is None:
            return None

        self._fn_name = fn_node.name
        args = [a.arg for a in fn_node.args.args]
        params_desc = f"Parameters: {', '.join(args)}" if args else ""

        start_id = self._node("Start", "start",
                              sublabel=f"def {fn_node.name}({', '.join(args)})",
                              description=f"Enter {fn_node.name}. {params_desc}")
        last_id = self._walk_stmts(fn_node.body, start_id)

        if self._nodes and self._nodes[-1]["type"] != "end":
            end_id = self._node("End", "end",
                                description=f"{fn_node.name} completes")
            self._edge(last_id, end_id)

        return {
            "title": f"{fn_node.name}()",
            "nodes": self._nodes,
            "edges": self._edges,
        }


# ─────────────────────────────────────────────────────────────────────────────
# UNIVERSAL STRUCTURAL PARSER — works on ANY language via regex
# ─────────────────────────────────────────────────────────────────────────────

class _UniversalFlowBuilder:
    RE_FUNC     = re.compile(
        r'(?:(?:public|private|protected|static|async|def|fun|fn|func)\s+)*'
        r'(?:[\w<>\[\]]+\s+)?(\w+)\s*\(([^)]{0,80})\)\s*(?:->[\w\s<>]+)?\s*[:{]',
        re.MULTILINE)
    RE_IF       = re.compile(r'\bif\s*\(([^)]{1,60})\)', re.MULTILINE)
    RE_ELIF     = re.compile(r'\b(?:else\s+if|elif)\s*\(([^)]{1,60})\)', re.MULTILINE)
    RE_FOR      = re.compile(r'\bfor\s*\(([^)]{1,60})\)', re.MULTILINE)
    RE_FOREACH  = re.compile(r'\bfor\s+(\w+)\s+in\s+([\w\.\(\)]+)', re.MULTILINE)
    RE_WHILE    = re.compile(r'\bwhile\s*\(([^)]{1,60})\)', re.MULTILINE)
    RE_RETURN   = re.compile(r'\breturn\s+([^;{\n]{1,50})', re.MULTILINE)
    RE_IO       = re.compile(
        r'\b(print|println|printf|fprintf|cout|console\.log|System\.out\.print'
        r'|puts|echo|write|scanf|input|readline)\s*\(([^)]{0,60})\)',
        re.MULTILINE)
    RE_ASSIGN   = re.compile(
        r'^\s*(?:(?:int|float|double|string|bool|var|let|const|auto)\s+)?'
        r'(\w+)\s*=\s*([^;=\n]{1,50})', re.MULTILINE)

    def _re_recursive(self, fname):
        return re.compile(rf'\b{re.escape(fname)}\s*\(', re.MULTILINE)

    def __init__(self):
        self._nodes = []; self._edges = []; self._counter = 0; self._fn_name = ""

    def _uid(self):
        self._counter += 1; return str(self._counter)

    def _node(self, label, ntype, sublabel="", description=""):
        nid = self._uid()
        self._nodes.append({
            "id": nid,
            "label":       _clean_text(label, MAX_LABEL),
            "sublabel":    _clean_text(sublabel, 55),
            "type":        ntype,
            "description": _clean_text(description, 120),
        })
        return nid

    def _edge(self, src, tgt, label=""):
        if src and tgt:
            self._edges.append({"from": src, "to": tgt, "label": _clean_text(label, 20)})

    def build(self, code: str, hint: str = "", language: str = "") -> dict:
        if not code or not code.strip():
            return None
        lines = code.splitlines()
        fn_match  = self.RE_FUNC.search(code)
        fn_name   = fn_match.group(1) if fn_match else ""
        fn_params = fn_match.group(2) if fn_match else ""
        self._fn_name = fn_name
        title = f"{fn_name}()" if fn_name else (hint[:40] if hint else "Algorithm Flow")
        if fn_name:
            sublabel = f"{fn_name}({fn_params[:40]})"
            desc     = f"Enter {fn_name}. Params: {fn_params[:60]}" if fn_params else f"Enter {fn_name}"
        else:
            sublabel = ""; desc = "Algorithm begins"
        prev = self._node("Start", "start", sublabel=sublabel, description=desc)
        re_recursive = self._re_recursive(fn_name) if fn_name else None
        seen = set(); node_count = 0

        for line in lines:
            if node_count >= MAX_NODES - 2: break
            stripped = line.strip()
            if not stripped or stripped.startswith(('//', '#', '*', '/*', '*/')): continue
            added = False

            # For-each (Python/Ruby style)
            m = self.RE_FOREACH.search(line)
            if m and ('fe'+m.group(0)) not in seen:
                seen.add('fe'+m.group(0))
                nid = self._node(f"For each {m.group(1)} in {m.group(2)}", "decision",
                                 sublabel=m.group(0),
                                 description=f"Iterate {m.group(2)}, item: {m.group(1)}")
                self._edge(prev, nid); prev = nid; node_count += 1; added = True

            # For loop (C-style)
            if not added:
                m = self.RE_FOR.search(line)
                if m and ('fo'+m.group(1)[:20]) not in seen:
                    seen.add('fo'+m.group(1)[:20])
                    cond = m.group(1).strip()
                    nid  = self._node(f"For: {cond[:35]}", "decision",
                                      sublabel=f"for ({cond})",
                                      description=f"Loop: {cond}")
                    self._edge(prev, nid)
                    body = self._node("Loop body", "process", description="Execute loop body")
                    self._edge(nid,  body, "True")
                    self._edge(body, nid,  "repeat")
                    after = self._node("After loop", "process", description="Loop complete")
                    self._edge(nid, after, "False")
                    prev = after; node_count += 3; added = True

            # While
            if not added:
                m = self.RE_WHILE.search(line)
                if m and ('wh'+m.group(1)[:20]) not in seen:
                    seen.add('wh'+m.group(1)[:20])
                    cond = m.group(1).strip()
                    nid  = self._node(f"While {cond[:35]}", "decision",
                                      sublabel=f"while ({cond})",
                                      description=f"Loop while: {cond}")
                    self._edge(prev, nid)
                    body = self._node("Loop body", "process", description="Execute while body")
                    self._edge(nid,  body, "True")
                    self._edge(body, nid,  "repeat")
                    after = self._node("After loop", "process", description="Condition false")
                    self._edge(nid, after, "False")
                    prev = after; node_count += 3; added = True

            # If (skip lines that are else-if)
            if not added and not self.RE_ELIF.search(line):
                m = self.RE_IF.search(line)
                if m and ('if'+m.group(1)[:20]) not in seen:
                    seen.add('if'+m.group(1)[:20])
                    cond = m.group(1).strip()
                    nid  = self._node(f"if {cond[:35]}", "decision",
                                      sublabel=cond, description=f"Branch: {cond}")
                    self._edge(prev, nid)
                    t = self._node("True branch",  "process", description="When condition true")
                    f = self._node("False branch", "process", description="When condition false")
                    self._edge(nid, t, "True"); self._edge(nid, f, "False")
                    merge = self._node("Continue", "process", description="Branches merge")
                    self._edge(t, merge); self._edge(f, merge)
                    prev = merge; node_count += 4; added = True

            # I/O
            if not added:
                m = self.RE_IO.search(line)
                if m and ('io'+m.group(2)[:15]) not in seen:
                    seen.add('io'+m.group(2)[:15])
                    call = m.group(0).strip()
                    nid  = self._node(call[:MAX_LABEL], "io",
                                      sublabel=call, description=f"I/O: {call}")
                    self._edge(prev, nid); prev = nid; node_count += 1; added = True

            # Recursive call
            if not added and re_recursive and re_recursive.search(line):
                key = 'rec'+stripped[:15]
                if key not in seen:
                    seen.add(key)
                    nid = self._node(f"Recurse: {fn_name}()", "recursive",
                                     sublabel=stripped[:MAX_LABEL],
                                     description=f"Recursive call to {fn_name}")
                    self._edge(prev, nid); prev = nid; node_count += 1; added = True

            # Return
            if not added:
                m = self.RE_RETURN.search(line)
                if m and 'ret' not in seen:
                    seen.add('ret')
                    val = m.group(1).strip()
                    nid = self._node(f"Return {val[:30]}", "end",
                                     sublabel=f"return {val}",
                                     description=f"Returns: {val}")
                    self._edge(prev, nid); prev = nid; node_count += 1; added = True

            # Meaningful assignment (skip trivial counters)
            if not added and node_count < 6:
                m = self.RE_ASSIGN.search(line)
                if m:
                    var, val = m.group(1), m.group(2).strip()
                    if var not in ('i','j','k','n','_') and len(val) > 2:
                        key = 'as'+var
                        if key not in seen:
                            seen.add(key)
                            nid = self._node(f"{var} = {val[:30]}", "process",
                                             sublabel=f"{var} = {val}",
                                             description=f"Initialize {var} to {val}")
                            self._edge(prev, nid); prev = nid; node_count += 1

        if self._nodes and self._nodes[-1]["type"] != "end":
            end_id = self._node("End", "end",
                                description=f"{fn_name or 'Algorithm'} completes")
            self._edge(prev, end_id)

        return None if len(self._nodes) < 3 else {
            "title": title, "nodes": self._nodes, "edges": self._edges
        }


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API — 4-layer protection, never fails
# ─────────────────────────────────────────────────────────────────────────────

def build_react_flow_json(viz_section: str, code: str = "",
                          language: str = "python", hint: str = "") -> str:
    """
    Returns a JSON string for ReactFlowDiagram. Never raises. Never fails.
    Priority: LLM JSON -> Python AST -> Universal regex -> Minimal fallback
    """
    # 1. LLM JSON
    if viz_section and viz_section.strip():
        raw = viz_section.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```$",           "", raw, flags=re.MULTILINE)
        parsed = _repair_json(raw)
        if parsed:
            validated = _validate_graph(parsed, hint)
            if validated and len(validated["nodes"]) >= 2:
                logger.info(f"[VIZ] LLM JSON — {len(validated['nodes'])} nodes")
                return json.dumps(validated)
        logger.warning("[VIZ] LLM JSON failed — trying AST/structural")

    # 2. Python AST
    if code and language in ("python", "py"):
        try:
            builder = _ASTFlowBuilder()
            graph   = builder.build(code, hint)
            if graph:
                validated = _validate_graph(graph, hint)
                if validated and len(validated["nodes"]) >= 2:
                    logger.info(f"[VIZ] Python AST — {len(validated['nodes'])} nodes")
                    return json.dumps(validated)
        except Exception as e:
            logger.warning(f"[VIZ] Python AST error: {e}")

    # 3. Universal regex (all languages)
    if code and code.strip():
        try:
            builder = _UniversalFlowBuilder()
            graph   = builder.build(code, hint, language)
            if graph:
                validated = _validate_graph(graph, hint)
                if validated and len(validated["nodes"]) >= 3:
                    logger.info(f"[VIZ] Universal — {len(validated['nodes'])} nodes")
                    return json.dumps(validated)
        except Exception as e:
            logger.warning(f"[VIZ] Universal parser error: {e}")

    # 4. Absolute fallback — always works
    logger.warning("[VIZ] Using minimal fallback graph")
    return _fallback(hint)