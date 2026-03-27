import re
import logging
from typing import Dict

logger = logging.getLogger("parser")

METADATA_BASE   = "METADATA"
CODE_BASE       = "CODE"
VIZ_BASE        = "VISUALIZATION"
ANNOTATED_BASE  = "ANNOTATED CODE"
COMPLEXITY_BASE = "COMPLEXITY"
TEST_BASE       = "TEST CASES"

MAX_SECTION_CHARS = 8000


def extract_section_robust(response: str, base_name: str) -> str:
    if not response:
        return ""
    strict_pattern = re.compile(
        r"===\s*" + re.escape(base_name) + r"\s*===\s*(.*?)\s*===\s*END\s+"
        + re.escape(base_name) + r"\s*===",
        re.DOTALL | re.IGNORECASE,
    )
    match = strict_pattern.search(response)
    if match:
        return match.group(1).strip()[:MAX_SECTION_CHARS]

    forgiving_pattern = re.compile(
        r"===\s*" + re.escape(base_name) + r"\s*===\s*(.*?)(?=\s*===|\Z)",
        re.DOTALL | re.IGNORECASE,
    )
    match = forgiving_pattern.search(response)
    if match:
        return match.group(1).strip()[:MAX_SECTION_CHARS]
    return ""


def strip_backticks(text: str) -> str:
    """Strip triple backticks, language markers, and inline markdown artifacts."""
    if not text:
        return ""
    text = re.sub(r"^```[a-zA-Z]*\n?", "", text, flags=re.MULTILINE)
    text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"```", "", text)
    return text.strip()


def strip_markdown_headings(text: str) -> str:
    """
    Remove markdown heading tokens (###, ##, #) that the LLM sometimes
    outputs at section boundaries or inside content blocks.
    Handles:
      - Lines that are ONLY heading tokens (### or ## or #)
      - Inline trailing ### at end of a sentence
      - Leading ### at start of a line before real content
    """
    if not text:
        return ""
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        # Remove lines that are purely heading markers (optional whitespace)
        if re.match(r'^\s*#{1,6}\s*$', line):
            continue
        # Strip trailing ### artifacts (e.g. "O(n) ###" → "O(n)")
        line = re.sub(r'\s*#{1,6}\s*$', '', line)
        # Strip leading ### before content (e.g. "### Step 1" → "Step 1")
        line = re.sub(r'^\s*#{1,6}\s+', '', line)
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def clean_explanation(text: str) -> str:
    """
    Clean the annotated explanation section:
    - Strip backtick fences
    - Strip markdown heading tokens (###, ##, #)
    - Remove lone '#' lines
    - Remove backtick-only lines
    - Keep Step N: Label format intact
    """
    if not text:
        return ""
    text = strip_backticks(text)
    text = strip_markdown_headings(text)
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if stripped == '#':
            continue
        if re.match(r'^`+$', stripped):
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def clean_complexity(text: str) -> str:
    """
    Clean complexity section — remove markdown headings and trailing artifacts.
    E.g. "O(n log n) ###" → "O(n log n)"
    """
    if not text:
        return ""
    text = strip_markdown_headings(text)
    return text.strip()


def clean_test_cases(text: str) -> str:
    """
    Clean test cases section — remove markdown headings and trailing artifacts.
    """
    if not text:
        return ""
    text = strip_markdown_headings(text)
    return text.strip()


def parse_response(response: str) -> Dict:
    sections: Dict = {
        "code": "",
        "explanation": "",
        "time_complexity": "",
        "space_complexity": "",
        "complexity": "",
        "metadata": None,
        "language": "python",
        "visualization": "",
        "test_cases": "",
    }

    if not response or not isinstance(response, str):
        return sections

    response = response.strip()

    metadata_raw   = extract_section_robust(response, METADATA_BASE)
    code_raw       = extract_section_robust(response, CODE_BASE)
    viz_raw        = extract_section_robust(response, VIZ_BASE)
    annotated_raw  = extract_section_robust(response, ANNOTATED_BASE)
    complexity_raw = extract_section_robust(response, COMPLEXITY_BASE)
    test_raw       = extract_section_robust(response, TEST_BASE)

    if code_raw:
        sections["code"] = strip_backticks(code_raw)

    if annotated_raw:
        sections["explanation"] = clean_explanation(annotated_raw)

    if viz_raw:
        sections["visualization"] = strip_backticks(viz_raw)

    if complexity_raw:
        # Clean markdown artifacts from complexity before parsing
        complexity_clean = clean_complexity(complexity_raw)
        sections["complexity"] = complexity_clean
        time_match = re.search(
            r"Time(?:[\s_]*Complexity)?(?:[\s_]*:)?\s*(.*?)(?=Space(?:[\s_]*Complexity)?|$)",
            complexity_clean, re.IGNORECASE | re.DOTALL,
        )
        space_match = re.search(
            r"Space(?:[\s_]*Complexity)?(?:[\s_]*:)?\s*(.*)",
            complexity_clean, re.IGNORECASE | re.DOTALL,
        )
        if time_match:
            # Strip any remaining heading artifacts from individual complexity lines
            sections["time_complexity"] = strip_markdown_headings(time_match.group(1).strip())
        if space_match:
            sections["space_complexity"] = strip_markdown_headings(space_match.group(1).strip())

    if test_raw:
        sections["test_cases"] = clean_test_cases(test_raw)

    if metadata_raw:
        metadata_dict = {}
        for line in metadata_raw.splitlines():
            if ":" in line:
                key, _, value = line.partition(":")
                metadata_dict[key.strip().upper()] = value.strip()
        sections["metadata"] = metadata_dict
        sections["language"] = metadata_dict.get("LANGUAGE", "python").lower()

    missing = [k for k, v in sections.items() if v == "" or v is None]
    if missing:
        logger.debug(f"Sections empty after parsing: {missing}")

    return sections