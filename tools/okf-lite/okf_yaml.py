"""Minimal YAML-subset loader for OKF-lite (pure standard library only).

The original Tools/okf package depends on PyYAML.  OKF-lite keeps the
pure-standard-library requirement, so this module replaces PyYAML with a small,
strict parser for the YAML subset used by bundle files:

* block mappings (space indentation) and block sequences ("- item")
* inline flow sequences ``[a, b]`` and flow mappings ``{a: b}`` on one line
* plain, single-quoted and double-quoted scalars
* comments and blank lines
* scalar typing: integers, floats, booleans (true/false/yes/no/on/off), null,
  and strings -- ISO 8601 timestamps stay strings, quoted scalars never lose
  their stringness

Anything outside this subset (anchors, aliases, tags, block scalars ``|``/``>``,
directives, multi-document streams, multi-line flow styles, tabs in
indentation) raises :class:`YamlParseError` instead of being silently misparsed,
so callers surface the problem through the normal validation path.

This is not a general-purpose YAML implementation; keep bundle files inside
this subset.
"""

from __future__ import annotations

import re


class YamlParseError(Exception):
    """Raised when a bundle file uses YAML outside the supported subset."""


_NULL_WORDS = ("", "~", "null", "Null", "NULL")
_BOOL_WORDS = {"true": True, "false": False, "yes": True, "no": False, "on": True, "off": False}
_INT_RE = re.compile(r"[-+]?[0-9]+$")
_FLOAT_RE = re.compile(
    r"[-+]?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$"
    r"|[-+]?[0-9]+[eE][-+]?[0-9]+$"
)
_ESCAPES = {
    "n": "\n",
    "t": "\t",
    "r": "\r",
    "0": "\0",
    '"': '"',
    "\\": "\\",
    "/": "/",
}


def _split_comment(line: str) -> str:
    """Drop a trailing ``#`` comment, ignoring hashes inside quoted strings."""
    in_single = in_double = False
    previous = " "
    for index, char in enumerate(line):
        if char == "'" and not in_double:
            in_single = not in_single
        elif char == '"' and not in_single:
            in_double = not in_double
        elif char == "#" and previous in (" ", "\t") and not (in_single or in_double):
            return line[:index].rstrip(" \t")
        previous = char
    return line.rstrip(" \t")


def _prepare_lines(text: str) -> list[tuple[int, str, int]]:
    """Return (indent, content, line_number) entries with comments and blanks removed."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    entries: list[tuple[int, str, int]] = []
    for number, raw in enumerate(normalized.split("\n"), start=1):
        if number == 1 and raw.startswith("\ufeff"):
            raw = raw[1:]
        content = _split_comment(raw)
        if not content.strip():
            continue
        match = re.match(r"^[ \t]*", content)
        prefix = match.group(0)
        if "\t" in prefix:
            raise YamlParseError(f"line {number}: tabs are not allowed in indentation")
        entries.append((len(prefix), content[len(prefix):], number))
    return entries


def _plain_scalar(value: str, line: int) -> object:
    if value in _NULL_WORDS:
        return None
    lowered = value.lower()
    if lowered in _BOOL_WORDS:
        return _BOOL_WORDS[lowered]
    if _INT_RE.fullmatch(value):
        return int(value)
    if _FLOAT_RE.fullmatch(value):
        return float(value)
    return value


def _parse_quoted(text: str, line: int) -> tuple[str, str]:
    """Parse a single- or double-quoted scalar; return (value, remainder)."""
    quote = text[0]
    chars: list[str] = []
    index = 1
    if quote == "'":
        while index < len(text):
            char = text[index]
            if char == "'":
                if index + 1 < len(text) and text[index + 1] == "'":
                    chars.append("'")
                    index += 2
                    continue
                return "".join(chars), text[index + 1:]
            chars.append(char)
            index += 1
    else:
        while index < len(text):
            char = text[index]
            if char == "\\" and index + 1 < len(text):
                escaped = text[index + 1]
                if escaped == "u" and index + 5 < len(text):
                    digits = text[index + 2:index + 6]
                    try:
                        chars.append(chr(int(digits, 16)))
                    except ValueError:
                        raise YamlParseError(f"line {line}: invalid \\u escape {digits!r}")
                    index += 6
                    continue
                chars.append(_ESCAPES.get(escaped, escaped))
                index += 2
                continue
            if char == '"':
                return "".join(chars), text[index + 1:]
            chars.append(char)
            index += 1
    raise YamlParseError(f"line {line}: unterminated quoted string")


def _match_flow(text: str, opener: str, closer: str, line: int) -> tuple[str, str]:
    """Return (inner content, remainder) for a flow container starting at text[0]."""
    in_single = in_double = False
    depth = 1
    for index, char in enumerate(text[1:], start=1):
        if char == "'" and not in_double:
            in_single = not in_single
        elif char == '"' and not in_single:
            in_double = not in_double
        elif not in_single and not in_double:
            if char in "[{":
                depth += 1
            elif char in "]}":
                depth -= 1
                if depth == 0:
                    if char != closer:
                        raise YamlParseError(f"line {line}: mismatched flow container")
                    return text[1:index], text[index + 1:]
    raise YamlParseError(f"line {line}: unterminated flow container")


def _split_flow_tokens(inner: str, line: int) -> list[str]:
    tokens: list[str] = []
    start = 0
    in_single = in_double = False
    depth = 0
    for index, char in enumerate(inner):
        if char == "'" and not in_double:
            in_single = not in_single
        elif char == '"' and not in_single:
            in_double = not in_double
        elif not in_single and not in_double:
            if char in "[{":
                depth += 1
            elif char in "]}":
                depth -= 1
            elif char == "," and depth == 0:
                tokens.append(inner[start:index].strip())
                start = index + 1
    tokens.append(inner[start:].strip())
    return tokens


def _parse_inline(text: str, line: int) -> object:
    text = text.strip()
    if not text:
        return None
    if text[0] in ("&", "*", "!"):
        raise YamlParseError(f"line {line}: anchors, aliases and tags are not supported")
    if text[0] == "[":
        inner, remainder = _match_flow(text, "[", "]", line)
        if remainder.strip():
            raise YamlParseError(f"line {line}: unexpected content after flow sequence")
        return [_parse_inline(token, line) for token in _split_flow_tokens(inner, line)]
    if text[0] == "{":
        inner, remainder = _match_flow(text, "{", "}", line)
        if remainder.strip():
            raise YamlParseError(f"line {line}: unexpected content after flow mapping")
        result: dict[object, object] = {}
        for token in _split_flow_tokens(inner, line):
            if not token:
                continue
            split = _find_key_separator(token, line, require_space=False)
            if split is None:
                raise YamlParseError(f"line {line}: flow mapping entry must be 'key: value': {token!r}")
            key_text, value_text = token[:split].strip(), token[split + 1:].strip()
            key = _parse_inline(key_text, line)
            result[key] = _parse_inline(value_text, line) if value_text else None
        return result
    if text[0] in ("'", '"'):
        value, remainder = _parse_quoted(text, line)
        if remainder.strip():
            raise YamlParseError(f"line {line}: unexpected content after quoted scalar")
        return value
    if text[0] in ("|", ">"):
        raise YamlParseError(f"line {line}: block scalars are not supported")
    return _plain_scalar(text, line)


def _find_key_separator(content: str, line: int, require_space: bool) -> int | None:
    """Find the ``key: value`` separator outside quotes and flow brackets."""
    in_single = in_double = False
    depth = 0
    for index, char in enumerate(content):
        if char == "'" and not in_double:
            in_single = not in_single
        elif char == '"' and not in_single:
            in_double = not in_double
        elif not in_single and not in_double:
            if char in "[{":
                depth += 1
            elif char in "]}":
                depth -= 1
            elif char == ":" and depth == 0:
                after = content[index + 1:index + 2]
                if after in ("", " ", "\t") or not require_space:
                    return index
    return None


def _split_mapping_entry(content: str, line: int) -> tuple[str | int | float | bool | None, str, int]:
    separator = _find_key_separator(content, line, require_space=True)
    if separator is None:
        raise YamlParseError(f"line {line}: expected 'key: value': {content!r}")
    key_text = content[:separator].strip()
    value_text = content[separator + 1:].strip()
    key = _parse_inline(key_text, line)
    if key is None or isinstance(key, (list, dict)):
        raise YamlParseError(f"line {line}: mapping key must be a scalar: {key_text!r}")
    return key, value_text, separator


def _parse_mapping_block(
    entries: list[tuple[int, str, int]],
    index: int,
    indent: int,
    initial: dict[object, object] | None = None,
) -> tuple[dict[object, object], int]:
    result: dict[object, object] = dict(initial or {})
    while index < len(entries):
        entry_indent, content, line = entries[index]
        if entry_indent < indent:
            break
        if entry_indent > indent:
            raise YamlParseError(
                f"line {line}: unexpected indentation {entry_indent} (expected {indent})"
            )
        if content == "-" or content.startswith("- "):
            break  # the caller reports the mixed mapping/sequence at this level
        key, value_text, _ = _split_mapping_entry(content, line)
        if key in result:
            raise YamlParseError(f"line {line}: duplicate mapping key {key!r}")
        if index + 1 < len(entries) and entries[index + 1][0] > indent:
            if value_text:
                raise YamlParseError(
                    f"line {line}: mapping value followed by a nested block on the next line"
                )
            child_indent = entries[index + 1][0]
            value, index = _parse_block(entries, index + 1, child_indent)
        else:
            index += 1
            value = _parse_inline(value_text, line) if value_text else None
        result[key] = value
    return result, index


def _parse_block(
    entries: list[tuple[int, str, int]],
    index: int,
    indent: int,
) -> tuple[object, int]:
    _, content, line = entries[index]
    if content == "-" or content.startswith("- "):
        return _parse_sequence_block(entries, index, indent)
    return _parse_mapping_block(entries, index, indent, None)


def _parse_sequence_block(
    entries: list[tuple[int, str, int]],
    index: int,
    indent: int,
) -> tuple[list[object], int]:
    result: list[object] = []
    while index < len(entries):
        entry_indent, content, line = entries[index]
        if entry_indent < indent:
            break
        if entry_indent > indent:
            raise YamlParseError(
                f"line {line}: unexpected indentation {entry_indent} (expected {indent})"
            )
        if not (content == "-" or content.startswith("- ")):
            break  # the caller reports the mixed sequence/mapping at this level
        rest = content[1:].strip()
        if rest.startswith("&") or rest.startswith("*") or rest.startswith("!"):
            raise YamlParseError(f"line {line}: anchors, aliases and tags are not supported")
        if not rest:
            if index + 1 < len(entries) and entries[index + 1][0] > indent:
                child_indent = entries[index + 1][0]
                value, index = _parse_block(entries, index + 1, child_indent)
                result.append(value)
            else:
                result.append(None)
                index += 1
            continue
        separator = _find_key_separator(rest, line, require_space=True)
        if separator is None:
            result.append(_parse_inline(rest, line))
            index += 1
            continue
        # "- key: value" introduces a sequence item that is a mapping; deeper
        # lines at dash_indent + 2 continue that mapping.
        key = _parse_inline(rest[:separator].strip(), line)
        if key is None or isinstance(key, (list, dict)):
            raise YamlParseError(f"line {line}: mapping key must be a scalar")
        value_text = rest[separator + 1:].strip()
        if index + 1 < len(entries) and entries[index + 1][0] > indent:
            if value_text:
                raise YamlParseError(
                    f"line {line}: mapping value followed by a nested block on the next line"
                )
            child_indent = entries[index + 1][0]
            value, continuation = _parse_block(entries, index + 1, child_indent)
        else:
            value = _parse_inline(value_text, line) if value_text else None
            continuation = index + 1
        item: dict[object, object] = {key: value}
        if continuation < len(entries) and entries[continuation][0] == indent + 2:
            extra, continuation = _parse_mapping_block(entries, continuation, indent + 2)
            if extra:
                item.update(extra)
        result.append(item)
        index = continuation
    return result, index


def safe_load(text: str) -> object:
    """Parse a YAML-subset document; returns None for empty input."""
    entries = _prepare_lines(text)
    if not entries:
        return None
    if entries[0][1].startswith("---") or entries[0][1].startswith("..."):
        raise YamlParseError("multi-document streams are not supported")
    if entries[0][1].startswith("%"):
        raise YamlParseError("directives are not supported")
    value, index = _parse_block(entries, 0, entries[0][0])
    if index != len(entries):
        raise YamlParseError(
            f"line {entries[index][2]}: unexpected content at indentation {entries[index][0]}"
        )
    return value