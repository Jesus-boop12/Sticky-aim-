/**
 * Structural checks on an emitted GPC script.
 *
 * Zen Studio's compiler reports a single terse error and stops, and a stray
 * brace anywhere shows up as "Expected a top-level declaration. Got '}'" with
 * no clue where it came from. This runs the cheap structural checks before a
 * script ever leaves the app, so a generated file can never be the cause.
 */

/** Everything a GPC file may legally start a top-level line with. */
const TOP_LEVEL = /^(define|const|int8|int16|int32|int|main|init|combo|function|data)\b/;

export function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * @returns {{ok: boolean, problems: string[]}}
 */
export function validateGpc(script) {
  const problems = [];
  const code = stripComments(script);
  const lines = code.split('\n');

  /* ---- braces, and what sits at the top level ---- */
  let depth = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const atTopLevel = depth === 0;

    for (const ch of raw) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth < 0) {
          problems.push(`line ${i + 1}: a closing brace with nothing open - "${line}"`);
          depth = 0;
        }
      }
    }

    // A top-level line must begin a declaration. This is the check that catches
    // the stray brace a hand edit leaves behind.
    if (atTopLevel && line && !TOP_LEVEL.test(line) && !line.startsWith('}')) {
      problems.push(`line ${i + 1}: not a declaration, but sits outside every block - "${line}"`);
    }
  });
  if (depth !== 0) problems.push(`${depth} block(s) never closed`);

  /* ---- parentheses ---- */
  const open = (code.match(/\(/g) || []).length;
  const close = (code.match(/\)/g) || []).length;
  if (open !== close) problems.push(`unbalanced parentheses: ${open} "(" against ${close} ")"`);

  /* ---- preprocessor directives: this compiler rejects them outright ---- */
  lines.forEach((raw, i) => {
    if (raw.trim().startsWith('#')) problems.push(`line ${i + 1}: "#" directives are not GPC - "${raw.trim()}"`);
  });

  /* ---- declarations the code relies on ---- */
  const declared = new Set([...code.matchAll(/\bint\s+(\w+)\s*;/g)].map((m) => m[1]));
  const tables = new Set([...code.matchAll(/const\s+int\d*\s+(\w+)\s*\[\s*\]/g)].map((m) => m[1]));
  for (const [, name] of code.matchAll(/\[(\w+)\]/g)) {
    if (!/^\d+$/.test(name) && !declared.has(name)) problems.push(`"${name}" indexes a table but is never declared`);
  }
  for (const [, name] of code.matchAll(/(\w+)\s*\[/g)) {
    if (!tables.has(name) && !declared.has(name) && !/^(if|while|for)$/.test(name)) {
      problems.push(`"${name}[]" is read but no such table is declared`);
    }
  }

  /* ---- assignment targets ---- */
  // function parameters are locals, so they count as declared inside their body
  const params = new Set(
    [...code.matchAll(/function\s+\w+\s*\(([^)]*)\)/g)]
      .flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean))
  );
  for (const [, name] of code.matchAll(/^\s*(\w+)\s*=[^=]/gm)) {
    if (!declared.has(name) && !params.has(name) && !tables.has(name)) {
      problems.push(`"${name}" is assigned but never declared`);
    }
  }

  /* ---- combos ---- */
  const defined = new Set([...code.matchAll(/combo\s+(\w+)\s*\{/g)].map((m) => m[1]));
  for (const [, name] of code.matchAll(/combo_(?:run|stop|running)\s*\(\s*(\w+)\s*\)/g)) {
    if (!defined.has(name)) problems.push(`combo ${name} is used but never defined`);
  }

  /* ---- functions ---- */
  const functions = new Set([...code.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]));
  for (const name of functions) {
    if (!new RegExp(`\\b${name}\\s*\\(`).test(code.replace(new RegExp(`function\\s+${name}\\s*\\(`), ''))) {
      problems.push(`function ${name} is defined but never called`);
    }
  }

  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}
