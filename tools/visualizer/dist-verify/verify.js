const failures = [];
let checks = 0;
function check(name, fn) {
  checks++;
  try {
    fn();
  } catch (err) {
    failures.push({ check: name, message: err instanceof Error ? err.message : String(err) });
  }
}
function equal(actual, expected, what = "value") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: got ${a}, want ${e}`);
}
function report() {
  return { checks, failures };
}
function normalize(file) {
  let s = file.replace(/\\/g, "/");
  for (; ; ) {
    if (s.startsWith("./")) s = s.slice(2);
    else if (s.startsWith("../")) s = s.slice(3);
    else return s;
  }
}
function sharedTail(a, b) {
  const x = a.split("/");
  const y = b.split("/");
  let n = 0;
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
  return n;
}
function suffixMatch(a, b) {
  return a === b || a.endsWith("/" + b) || b.endsWith("/" + a);
}
function hostFileMatches(hostFile, sourceFiles) {
  const files = [...sourceFiles];
  if (files.includes(hostFile)) return [hostFile];
  const host = normalize(hostFile);
  if (host === "") return [];
  const matches = files.filter((f) => suffixMatch(normalize(f), host));
  const best = Math.max(0, ...matches.map((f) => sharedTail(normalize(f), host)));
  return matches.filter((f) => sharedTail(normalize(f), host) === best);
}
function focusedFiles(focusedFile, sourceFiles) {
  return new Set(focusedFile ? hostFileMatches(focusedFile, sourceFiles) : []);
}
function partitionByFile(errors, diagnostics, selectedFiles, sourceFiles) {
  if (selectedFiles.size === 0) {
    return { shownFileErrors: errors, hiddenFileErrors: [], shownDiagnostics: diagnostics, hiddenDiagnostics: [] };
  }
  const sources = [...sourceFiles];
  const shown = (file) => {
    const matches = hostFileMatches(file, sources);
    return matches.length === 0 || matches.some((f) => selectedFiles.has(f));
  };
  const shownFileErrors = [];
  const hiddenFileErrors = [];
  for (const e of errors) {
    if (shown(e.file)) shownFileErrors.push(e);
    else hiddenFileErrors.push(e);
  }
  const shownDiagnostics = [];
  const hiddenDiagnostics = [];
  for (const d of diagnostics) {
    if (!d.file || shown(d.file)) shownDiagnostics.push(d);
    else hiddenDiagnostics.push(d);
  }
  return { shownFileErrors, hiddenFileErrors, shownDiagnostics, hiddenDiagnostics };
}
const SOURCES = ["designs/agent/v1/agent.twf", "designs/deploy.twf", "lib/kube/v1/kube.twf", "other/agent.twf"];
function filesChecks() {
  check("exact match wins", () => {
    equal(hostFileMatches("designs/deploy.twf", SOURCES), ["designs/deploy.twf"]);
  });
  check("base name selects every suffix match", () => {
    equal(hostFileMatches("agent.twf", SOURCES), ["designs/agent/v1/agent.twf", "other/agent.twf"]);
  });
  check("an absolute host path matches a relative source file", () => {
    equal(hostFileMatches("/home/u/repo/designs/deploy.twf", SOURCES), ["designs/deploy.twf"]);
  });
  check("a relative host path matches an absolute source file", () => {
    equal(hostFileMatches("deploy.twf", ["/home/u/repo/designs/deploy.twf"]), ["/home/u/repo/designs/deploy.twf"]);
  });
  check("backslashes and leading ./ and ../ are normalized", () => {
    equal(hostFileMatches("..\\kube\\v1\\kube.twf", SOURCES), ["lib/kube/v1/kube.twf"]);
    equal(hostFileMatches("./designs/deploy.twf", SOURCES), ["designs/deploy.twf"]);
  });
  check("matches only on / boundaries", () => {
    equal(hostFileMatches("ploy.twf", SOURCES), []);
  });
  check("no focused file selects nothing", () => {
    equal([...focusedFiles(void 0, SOURCES)], []);
    equal([...focusedFiles("kube.twf", SOURCES)], ["lib/kube/v1/kube.twf"]);
  });
  check("a longer host path picks the closest source, not every shorter one", () => {
    equal(hostFileMatches("/ws/sub/a.twf", ["a.twf", "sub/a.twf"]), ["sub/a.twf"]);
    equal(hostFileMatches("/ws/x/a.twf", ["a.twf", "sub/a.twf"]), ["a.twf"]);
  });
  check("a source file never matches another source by suffix", () => {
    const diag = {
      severity: "error",
      kind: "resolve",
      code: "X",
      message: "",
      file: "sub/a.twf",
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 }
    };
    const p = partitionByFile([], [diag], /* @__PURE__ */ new Set(["a.twf"]), ["a.twf", "sub/a.twf"]);
    equal(p.hiddenDiagnostics.length, 1);
  });
  check("findings partition by suffix match against the selection", () => {
    const diag = (file) => ({
      severity: "error",
      kind: "resolve",
      code: "X",
      message: file ?? "",
      file,
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 }
    });
    const p = partitionByFile(
      [{ file: "kube.twf", error: "m" }],
      [diag("deploy.twf"), diag("kube.twf"), diag()],
      /* @__PURE__ */ new Set(["designs/deploy.twf"]),
      SOURCES
    );
    equal(p.shownDiagnostics.map((d) => d.file ?? ""), ["deploy.twf", ""]);
    equal(p.hiddenDiagnostics.map((d) => d.file), ["kube.twf"]);
    equal(p.hiddenFileErrors.length, 1);
    equal(partitionByFile([{ file: "gone.twf", error: "m" }], [], /* @__PURE__ */ new Set(["designs/deploy.twf"]), SOURCES).shownFileErrors.length, 1);
  });
}
const DEF_TYPE_DIMENSION = "defType";
const SOURCE_FILE_DIMENSION = "sourceFile";
function resolveDescriptor(d, style) {
  const allow = d.emptyMeans === "none";
  const onStyle = d.id === style.axis;
  const labelFor = d.labelFor ?? (onStyle ? style.labelFor : (v) => v);
  const abbreviationFor = d.abbreviationFor ?? (onStyle ? style.abbreviationFor : (v) => labelFor(v).slice(0, 2));
  const keepCamera = d.keepCamera ?? !allow;
  const iconFor = d.iconFor ?? (onStyle ? style.iconFor : () => "");
  return {
    id: d.id,
    label: d.label ?? d.id,
    emptyMeans: d.emptyMeans,
    absentMeans: d.absentMeans ?? (allow ? "hidden" : "visible"),
    widens: d.widens ?? (allow ? "always" : "whenActive"),
    keepCamera,
    labelFor,
    abbreviationFor,
    tooltipFor: d.tooltipFor,
    iconFor,
    chipsFor: d.chipsFor ?? ((values) => values.map((v) => ({
      id: v,
      label: labelFor(v),
      icon: iconFor(v) || void 0,
      tint: onStyle ? v : void 0,
      tooltip: d.tooltipFor?.(v),
      values: [v]
    }))),
    initialSelection: d.initialSelection ?? ((values) => allow ? values : []),
    presentation: d.presentation ?? "chip"
  };
}
function hasOwn(table, key) {
  return Object.prototype.hasOwnProperty.call(table, key);
}
function cssSuffix(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i;
const HSL = /^hsla?\(\s*(-?[\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i;
function hslToRgb(h, s, l) {
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const light = Math.min(100, Math.max(0, l)) / 100;
  const hue = (h % 360 + 360) % 360;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(hue / 60 % 2 - 1));
  const m = light - chroma / 2;
  const [r, g, b] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbOf(color) {
  const c = color.trim();
  let m = HEX6.exec(c);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  m = HEX3.exec(c);
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
  m = RGB.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = HSL.exec(c);
  if (m) return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
  return void 0;
}
const isSchemeColor = (color) => rgbOf(color) !== void 0;
function payloadString(node2, key) {
  const value = node2.payload?.[key];
  return typeof value === "string" ? value : void 0;
}
function isContainment(edge) {
  return edge.relation === "containment";
}
function resolveScalarAxis(scalar) {
  const label = scalar.label ?? scalar.id;
  return { id: scalar.id, label, tooltip: scalar.tooltip ?? label, normalize: scalar.normalize, compute: (graph) => scalar.compute(graph) };
}
function computeDownstreamReach(graph) {
  const adj = /* @__PURE__ */ new Map();
  for (const e of graph.edges) {
    if (isContainment(e)) continue;
    const list = adj.get(e.sourceId);
    if (list) list.push(e.targetId);
    else adj.set(e.sourceId, [e.targetId]);
  }
  const depths = /* @__PURE__ */ new Map();
  for (const node2 of graph.nodes) {
    const seen = /* @__PURE__ */ new Set([node2.id]);
    let depth = 0;
    let frontier = [node2.id];
    while (frontier.length > 0) {
      const next = [];
      for (const cur of frontier) {
        const out = adj.get(cur);
        if (!out) continue;
        for (const t of out) {
          if (seen.has(t)) continue;
          seen.add(t);
          next.push(t);
        }
      }
      if (next.length > 0) depth++;
      frontier = next;
    }
    depths.set(node2.id, depth);
  }
  const effective = new Map(depths);
  for (const node2 of graph.nodes) {
    const d = depths.get(node2.id) ?? 0;
    if (d <= 0) continue;
    let parent = node2.parentId === void 0 ? void 0 : graph.getNode(node2.parentId);
    let bump = d;
    const guard = /* @__PURE__ */ new Set();
    while (parent && !guard.has(parent.id)) {
      guard.add(parent.id);
      bump += 1;
      if ((effective.get(parent.id) ?? 0) >= bump) break;
      effective.set(parent.id, bump);
      parent = parent.parentId === void 0 ? void 0 : graph.getNode(parent.parentId);
    }
  }
  return normalized(effective);
}
function computeDegree(graph) {
  const count = /* @__PURE__ */ new Map();
  for (const n of graph.nodes) count.set(n.id, 0);
  for (const e of graph.edges) {
    if (isContainment(e)) continue;
    if (graph.getNode(e.sourceId)) count.set(e.sourceId, (count.get(e.sourceId) ?? 0) + 1);
    if (graph.getNode(e.targetId)) count.set(e.targetId, (count.get(e.targetId) ?? 0) + 1);
  }
  return normalized(count);
}
function computeContainmentDepth(graph) {
  const depth = /* @__PURE__ */ new Map();
  for (const n of graph.nodes) {
    let d = 0;
    let parent = n.parentId === void 0 ? void 0 : graph.getNode(n.parentId);
    const guard = /* @__PURE__ */ new Set();
    while (parent && !guard.has(parent.id)) {
      guard.add(parent.id);
      d++;
      parent = parent.parentId === void 0 ? void 0 : graph.getNode(parent.parentId);
    }
    depth.set(n.id, d);
  }
  return normalized(depth);
}
function normalized(values) {
  let max = 0;
  for (const v of values.values()) if (v > max) max = v;
  const scores = /* @__PURE__ */ new Map();
  for (const [id, v] of values) scores.set(id, max === 0 ? 0 : v / max);
  return scores;
}
const downstreamReach = {
  id: "reach",
  label: "Reach",
  tooltip: "Downstream reach: how many dependency levels deep a node’s subtree runs, propagated up containment; leaves at 0",
  compute: computeDownstreamReach,
  normalize: "none"
};
const degree = {
  id: "degree",
  label: "Degree",
  tooltip: "Dependency edges in and out, as a fraction of the busiest node’s",
  compute: computeDegree,
  normalize: "none"
};
const containmentDepth = {
  id: "depth",
  label: "Depth",
  tooltip: "Containment depth: 0 at the top of the hierarchy, 1 at the deepest node",
  compute: computeContainmentDepth,
  normalize: "none"
};
const BUILT_IN_SCALARS = [downstreamReach, degree, containmentDepth];
const NEUTRAL_STROKE = { color: { light: "#94A3B8", dark: "#64748B" }, alpha: 0.7, dash: [], width: 1.2 };
const CONTAINMENT_STROKE = { color: { light: "#94A3B8", dark: "#64748B" }, alpha: 0.35, dash: [3, 4], width: 1 };
function endpointValues(declared) {
  return typeof declared === "string" ? [declared] : declared;
}
function edgePairs(type) {
  const targets = endpointValues(type.targetValue);
  return endpointValues(type.sourceValue).flatMap((s) => targets.map((t) => [s, t]));
}
const BAND_FRAME = { top: -300, bottom: 400, x: { min: 0, max: 380 } };
const DEFAULT_RADIUS = 12;
const MIDDLING_SPRING = { strength: 0.5, distance: 120 };
function stackBand(i, n) {
  if (n <= 1) return { min: BAND_FRAME.top, max: BAND_FRAME.bottom };
  const gap = (BAND_FRAME.bottom - BAND_FRAME.top) / (n - 1);
  const centre = BAND_FRAME.top + gap * i;
  const half = gap * 0.6;
  return { min: Math.round(centre - half), max: Math.round(centre + half) };
}
function resolveNodeStyle(style, i, n) {
  const r = style.size?.r ?? DEFAULT_RADIUS;
  return {
    ...style,
    abbreviation: style.abbreviation ?? style.label.slice(0, 2),
    icon: style.icon ?? "",
    size: { r, iconSize: style.size?.iconSize ?? Math.max(9, Math.round(r * 0.9)) },
    physics: {
      charge: style.physics?.charge ?? -40 * r,
      coreRadius: style.physics?.coreRadius ?? 4 * r,
      band: {
        x: style.physics?.band?.x ?? { ...BAND_FRAME.x },
        y: style.physics?.band?.y ?? stackBand(i, n)
      }
    },
    whenHidden: style.whenHidden ?? "ascend",
    summaryKind: style.summaryKind ?? "degree"
  };
}
function resolveEdgeType(type) {
  const start = type.relation === "containment" ? CONTAINMENT_STROKE : NEUTRAL_STROKE;
  const label = type.label ?? type.id;
  return {
    ...type,
    label,
    sourceValue: endpointValues(type.sourceValue)[0],
    targetValue: endpointValues(type.targetValue)[0],
    pairs: edgePairs(type),
    physics: type.physics ?? { ...MIDDLING_SPRING },
    style: { ...start, ...type.style, color: { ...start.color, ...type.style?.color } },
    tooltip: type.tooltip ?? label
  };
}
const DEFAULT_FALLBACK = {
  label: "Unknown",
  icon: "?",
  color: { light: { fill: "#CBD5E1", border: "#94A3B8" }, dark: { fill: "#64748B", border: "#94A3B8" } },
  size: { r: 10 },
  summaryKind: "none"
};
function createTaxonomy(spec) {
  const problems = [];
  const values = spec.styles.map((v) => v.id);
  const valueSet = /* @__PURE__ */ new Set();
  for (const v of values) {
    if (valueSet.has(v)) problems.push(`style value ${JSON.stringify(v)} is declared twice`);
    valueSet.add(v);
  }
  const suffixCount = /* @__PURE__ */ new Map();
  for (const v of values) suffixCount.set(cssSuffix(v), (suffixCount.get(cssSuffix(v)) ?? 0) + 1);
  const suffixOf = /* @__PURE__ */ new Map();
  values.forEach((v, i) => {
    const kebab = cssSuffix(v);
    suffixOf.set(v, kebab !== "" && suffixCount.get(kebab) === 1 ? kebab : `v${i + 1}`);
  });
  const colour = (where, c) => {
    if (!isSchemeColor(c)) problems.push(`${where} is ${JSON.stringify(c)}, not a hex, rgb() or hsl() colour`);
  };
  const band = (where, b) => {
    if (b && !(b.min <= b.max)) problems.push(`${where} runs from ${b.min} to ${b.max}; a band's min must not exceed its max`);
  };
  const checkStyle = (where, style) => {
    for (const theme of ["light", "dark"]) {
      colour(`${where}.color.${theme}.fill`, style.color[theme].fill);
      colour(`${where}.color.${theme}.border`, style.color[theme].border);
    }
    if (style.whenHidden !== void 0 && style.whenHidden !== "ascend" && style.whenHidden !== "splice") {
      problems.push(`${where}.whenHidden is ${JSON.stringify(style.whenHidden)}, not 'ascend' or 'splice'`);
    }
    if (style.summaryKind !== void 0 && style.summaryKind !== "children" && style.summaryKind !== "degree" && style.summaryKind !== "none") {
      problems.push(`${where}.summaryKind is ${JSON.stringify(style.summaryKind)}, not 'children', 'degree' or 'none'`);
    }
    band(`${where}.physics.band.x`, style.physics?.band?.x);
    band(`${where}.physics.band.y`, style.physics?.band?.y);
  };
  for (const v of spec.styles) checkStyle(`styles.${v.id}`, v);
  const fallbackSpec = spec.fallbackStyle ?? DEFAULT_FALLBACK;
  checkStyle("fallbackStyle", fallbackSpec);
  const edgeIds = /* @__PURE__ */ new Set();
  const pairKey = (relation, a, b) => JSON.stringify(a <= b ? [relation, a, b] : [relation, b, a]);
  const byPair = /* @__PURE__ */ new Map();
  const declaredEdgeTypes = spec.edgeTypes ?? [];
  for (const e of declaredEdgeTypes) {
    if (edgeIds.has(e.id)) problems.push(`edge type ${JSON.stringify(e.id)} is declared twice`);
    edgeIds.add(e.id);
    if (e.style?.color?.light !== void 0) colour(`edgeTypes.${e.id}.style.color.light`, e.style.color.light);
    if (e.style?.color?.dark !== void 0) colour(`edgeTypes.${e.id}.style.color.dark`, e.style.color.dark);
    for (const end of ["sourceValue", "targetValue"]) {
      const declared = endpointValues(e[end]);
      if (declared.length === 0) problems.push(`edgeTypes.${e.id}.${end} names no value; name at least one`);
      declared.forEach((v, i) => {
        if (!valueSet.has(v)) problems.push(`edgeTypes.${e.id}.${end}${declared.length > 1 ? `[${i}]` : ""} is ${JSON.stringify(v)}, which styles does not declare`);
      });
    }
    if (e.relation !== "containment" && e.relation !== "dependency") {
      problems.push(`edgeTypes.${e.id}.relation is ${JSON.stringify(e.relation)}, not 'containment' or 'dependency'`);
    }
    if (e.match !== void 0) {
      if (Object.keys(e.match).length === 0) problems.push(`edgeTypes.${e.id}.match is empty; leave it out`);
      for (const [axis, value] of Object.entries(e.match)) {
        if (typeof value !== "string") problems.push(`edgeTypes.${e.id}.match.${axis} is ${JSON.stringify(value)}, not a value`);
      }
    }
    for (const [s, t] of edgePairs(e)) {
      const key = pairKey(e.relation, s, t);
      const sharing = byPair.get(key) ?? [];
      if (!sharing.includes(e)) sharing.push(e);
      byPair.set(key, sharing);
    }
  }
  const sameMatch = (a, b) => {
    if (a.match === void 0 || b.match === void 0) return a.match === b.match;
    const keys = Object.keys(a.match);
    return keys.length === Object.keys(b.match).length && keys.every((k) => a.match[k] === b.match[k]);
  };
  if (!spec.classifyEdge) {
    const sameOrientedPair = (a, b) => edgePairs(a).some(([s, t]) => edgePairs(b).some(([s2, t2]) => s === s2 && t === t2));
    const said = /* @__PURE__ */ new Set();
    for (const [key, types] of byPair) {
      for (let i = 0; i < types.length; i++) {
        for (let j = i + 1; j < types.length; j++) {
          const a = types[i], b = types[j];
          const once = `${a.id}\0${b.id}`;
          if (said.has(once) || !sameOrientedPair(a, b) || !sameMatch(a, b)) continue;
          said.add(once);
          problems.push(`edge types ${JSON.stringify(a.id)} and ${JSON.stringify(b.id)} run between the same values with the same relation (${JSON.parse(key)[0]}) and nothing tells them apart; give one a match on an edge axis, declare them in opposite orientations, or give classifyEdge`);
        }
      }
    }
  }
  const filterAxes = spec.filterAxes ?? [{ id: spec.styleAxis, label: spec.styleLabel ?? spec.styleAxis, emptyMeans: "none" }];
  const axisIds = /* @__PURE__ */ new Set();
  for (const d of filterAxes) {
    if (axisIds.has(d.id)) problems.push(`filter axis ${JSON.stringify(d.id)} is declared twice`);
    axisIds.add(d.id);
    if (d.emptyMeans !== "all" && d.emptyMeans !== "none") {
      problems.push(`filterAxes.${d.id}.emptyMeans is ${JSON.stringify(d.emptyMeans)}, not 'all' or 'none'`);
    }
  }
  const scalars = [...BUILT_IN_SCALARS, ...spec.scalars ?? []].map(resolveScalarAxis);
  const scalarIds = /* @__PURE__ */ new Set();
  for (const sc of scalars) {
    if (scalarIds.has(sc.id)) problems.push(`scalar ${JSON.stringify(sc.id)} is declared twice (the built-ins are reach, degree and depth)`);
    scalarIds.add(sc.id);
  }
  if (problems.length > 0) throw new Error(`taxonomy is incoherent: ${problems.join("; ")}`);
  const n = spec.styles.length;
  const styles = /* @__PURE__ */ Object.create(null);
  spec.styles.forEach((v, i) => {
    styles[v.id] = resolveNodeStyle(v, i, n);
  });
  const fallback = resolveNodeStyle({ id: "", ...fallbackSpec }, 0, 1);
  if (n > 0 && fallbackSpec.physics?.band?.y === void 0) {
    fallback.physics.band.y = { min: styles[values[0]].physics.band.y.min, max: styles[values[n - 1]].physics.band.y.max };
  }
  const edgeTypes = declaredEdgeTypes.map(resolveEdgeType);
  const strokeById = new Map(edgeTypes.map((e) => [e.id, e.style]));
  const unstroked = /* @__PURE__ */ new Set();
  const edgeStrokeFor = (id) => {
    const stroke = strokeById.get(id);
    if (stroke) return stroke;
    if (!unstroked.has(id)) {
      unstroked.add(id);
      console.warn(`[graph] edge type ${JSON.stringify(id)} has no stroke: the taxonomy does not declare it; drawing it neutral`);
    }
    return NEUTRAL_STROKE;
  };
  const satisfies = (edge, match) => {
    for (const axis of Object.keys(match)) if (edge.values?.[axis] !== match[axis]) return false;
    return true;
  };
  const declaredTypeOf = (edge, src, tgt) => {
    if (src === void 0 || tgt === void 0) return void 0;
    const candidates = byPair.get(pairKey(edge.relation === "containment" ? "containment" : "dependency", src, tgt));
    if (candidates === void 0) return void 0;
    const fits = candidates.filter((t) => t.match === void 0 || satisfies(edge, t.match));
    const specific = fits.filter((t) => t.match !== void 0);
    const pool = specific.length > 0 ? specific : fits;
    const oriented = pool.filter((t) => edgePairs(t).some(([s, g]) => s === src && g === tgt));
    return (oriented[0] ?? pool[0])?.id;
  };
  const edgeTypeOf = (edge, src, tgt) => {
    const declared = declaredTypeOf(edge, src, tgt);
    return spec.classifyEdge?.(edge, src, tgt, declared) ?? declared;
  };
  const warned = /* @__PURE__ */ new Set();
  const styleOf = (value) => {
    const style = value !== void 0 && hasOwn(styles, value) ? styles[value] : void 0;
    if (style !== void 0) return style;
    const label = value ?? "<absent>";
    if (!warned.has(label)) {
      warned.add(label);
      console.warn(
        `[graph] no style declared for value ${JSON.stringify(label)}; using the fallback. The graph will render, but this node is drawn with placeholder styling.`
      );
    }
    return fallback;
  };
  const { styleAxis } = spec;
  const styleValueOf = (subject) => subject.values[styleAxis];
  const abbreviationFor = (value) => hasOwn(styles, value) ? styles[value].abbreviation : value.slice(0, 2);
  const namer = {
    axis: styleAxis,
    labelFor: (value) => hasOwn(styles, value) ? styles[value].label : value,
    abbreviationFor,
    iconFor: (value) => hasOwn(styles, value) ? styles[value].icon : ""
  };
  const resolvedAxes = filterAxes.map((d) => resolveDescriptor(d, namer));
  const byAxis = new Map(resolvedAxes.map((d) => [d.id, d]));
  return {
    styleAxis: () => styleAxis,
    styleLabel: () => spec.styleLabel ?? styleAxis,
    filterAxes: resolvedAxes,
    axisFor: (id) => byAxis.get(id),
    valueOn: (subject, axis) => subject.values[axis],
    abbreviationFor,
    styleValues: values,
    edgeTypes,
    scalars,
    edgeStrokeFor,
    colorVar: (value) => `--gv-node-${suffixOf.get(value) ?? (cssSuffix(value) || "undeclared")}`,
    styleOf,
    styleValueOf,
    // Hot path: one property read, one record lookup, one branch. No allocation
    // — this runs per node per frame in the draw loop.
    nodeStyleOf: (subject) => styleOf(styleValueOf(subject)),
    edgeTypeOf,
    collapse: spec.collapse ?? ((kept) => kept),
    contextLine: spec.contextLine ?? ((_node, parent) => parent?.name),
    searchText: spec.searchText ?? ((node2) => node2.name),
    highlight: spec.highlight ?? ((_active, base) => base)
  };
}
const DISPATCH_DIMENSION = "dispatch";
function dispatchOf(edge) {
  return edge.values?.[DISPATCH_DIMENSION];
}
const OP_CONTAINMENT = { color: { light: "#DB2777", dark: "#F472B6" }, alpha: 0.55, dash: [3, 4], width: 1.2 };
const EP_COMPOSITION = { color: { light: "#9F1239", dark: "#BE123C" }, alpha: 0.55, dash: [3, 4], width: 1.2 };
const NS_DEPENDENCY = { color: { light: "#475569", dark: "#94A3B8" }, alpha: 0.85, dash: [], width: 1.8 };
const WORKER_DEPENDENCY = { color: { light: "#64748B", dark: "#CBD5E1" }, alpha: 0.75, dash: [], width: 1.6 };
const WORKFLOW_DEPENDENCY = { color: { light: "#8B7EC8", dark: "#A89BD8" }, alpha: 0.7, dash: [], width: 1.4 };
const WORKFLOW_TO_ACTIVITY = { color: { light: "#4A8BC2", dark: "#7CB9E8" }, alpha: 0.7, dash: [], width: 1.4 };
const NEXUS_CALL = { color: { light: "#F472B6", dark: "#F9A8D4" }, alpha: 0.85, dash: [], width: 1.5 };
const SIGNAL_SEND = { color: { light: "#DC2626", dark: "#FCA5A5" }, alpha: 0.75, dash: [8, 5], width: 1.4 };
const ALL_EDGE_TYPES = [
  {
    id: "linkNsToNs",
    label: "NS↔NS",
    sourceValue: "namespace",
    targetValue: "namespace",
    relation: "dependency",
    physics: { strength: 0.25, distance: 870 },
    style: NS_DEPENDENCY,
    tooltip: "Namespace ↔ Namespace dependency"
  },
  {
    id: "linkNsToWorker",
    label: "NS↔Wk",
    sourceValue: "namespace",
    targetValue: "worker",
    relation: "containment",
    physics: { strength: 0.3, distance: 800 },
    tooltip: "Namespace ↔ Worker containment"
  },
  {
    id: "linkWorkerToWorker",
    label: "Wk↔Wk",
    sourceValue: "worker",
    targetValue: "worker",
    relation: "dependency",
    physics: { strength: 0.3, distance: 720 },
    style: WORKER_DEPENDENCY,
    tooltip: "Worker ↔ Worker dependency"
  },
  {
    id: "linkWorkerToWorkflow",
    label: "Wk↔Wf",
    sourceValue: "worker",
    targetValue: "workflow",
    relation: "containment",
    physics: { strength: 0.55, distance: 190 },
    tooltip: "Worker ↔ Workflow containment"
  },
  {
    id: "linkWorkerToActivity",
    label: "Wk↔Act",
    sourceValue: "worker",
    targetValue: "activity",
    relation: "containment",
    physics: { strength: 0.35, distance: 210 },
    tooltip: "Worker ↔ Activity containment"
  },
  {
    id: "linkWorkerToNexus",
    label: "Wk↔Nx",
    sourceValue: "worker",
    targetValue: "nexusService",
    relation: "containment",
    physics: { strength: 1.25, distance: 430 },
    tooltip: "Worker ↔ Nexus service containment"
  },
  {
    id: "linkNexusToOperation",
    label: "Nx↔Op",
    sourceValue: "nexusService",
    targetValue: "nexusOperation",
    relation: "containment",
    physics: { strength: 1.4, distance: 600 },
    style: OP_CONTAINMENT,
    tooltip: "Nexus service ↔ Nexus operation containment"
  },
  {
    id: "linkEndpointToNamespace",
    label: "Ep↔NS",
    sourceValue: "nexusEndpoint",
    targetValue: "namespace",
    relation: "containment",
    physics: { strength: 1, distance: 690 },
    tooltip: "Nexus endpoint ↔ Namespace containment"
  },
  {
    id: "linkWorkflowToWorkflow",
    label: "Wf↔Wf",
    sourceValue: "workflow",
    targetValue: "workflow",
    relation: "dependency",
    physics: { strength: 0.5, distance: 420 },
    style: WORKFLOW_DEPENDENCY,
    tooltip: "Workflow ↔ Workflow dependency"
  },
  // Weaker and longer than the Wf↔Wf call spring on purpose: a signal send is a
  // *soft* edge. It couples two workflows without binding them — the sender
  // never waits on the receiver's handler — so the layout should let them drift
  // apart rather than clamp them together the way a child-workflow call does.
  {
    id: "linkSignalSend",
    label: "Wf→Sig",
    sourceValue: "workflow",
    targetValue: "workflow",
    relation: "dependency",
    match: { [DISPATCH_DIMENSION]: "signalSend" },
    physics: { strength: 0.3, distance: 520 },
    style: SIGNAL_SEND,
    tooltip: "Workflow → Workflow signal send (fire-and-forget)"
  },
  {
    id: "linkWorkflowToActivity",
    label: "Wf↔Act",
    sourceValue: "workflow",
    targetValue: "activity",
    relation: "dependency",
    physics: { strength: 1.9, distance: 40 },
    style: WORKFLOW_TO_ACTIVITY,
    tooltip: "Workflow ↔ Activity dependency"
  },
  {
    id: "linkWorkflowToOperation",
    label: "Wf→Op",
    sourceValue: "workflow",
    targetValue: "nexusOperation",
    relation: "dependency",
    physics: { strength: 1.5, distance: 330 },
    style: NEXUS_CALL,
    tooltip: "Workflow → Nexus operation (the nexus call)"
  },
  {
    id: "linkOperationToWorkflow",
    label: "Op→Wf",
    sourceValue: "nexusOperation",
    targetValue: "workflow",
    relation: "dependency",
    physics: { strength: 1.55, distance: 360 },
    style: NEXUS_CALL,
    tooltip: "Nexus operation → Workflow (backing workflow / sync-op call)"
  },
  {
    id: "linkOperationToActivity",
    label: "Op↔Act",
    sourceValue: "nexusOperation",
    targetValue: "activity",
    relation: "dependency",
    physics: { strength: 1.4, distance: 300 },
    style: NEXUS_CALL,
    tooltip: "Nexus operation ↔ Activity dependency (sync-op body call)"
  },
  {
    id: "linkEndpointToOperation",
    label: "Ep↔Op",
    sourceValue: "nexusEndpoint",
    targetValue: "nexusOperation",
    relation: "containment",
    physics: { strength: 1.5, distance: 470 },
    style: EP_COMPOSITION,
    tooltip: "Nexus endpoint ↔ Nexus operation (the endpoint fronts the operation)"
  }
];
function edgeTypeFor(edge, src, tgt, declared) {
  if (!isContainment(edge) && dispatchOf(edge) === "signalSend") return "linkSignalSend";
  if (declared !== void 0) return declared;
  const touches = (v) => src === v || tgt === v;
  if (isContainment(edge)) {
    if (touches("workflow")) return "linkWorkerToWorkflow";
    if (touches("activity")) return "linkWorkerToActivity";
    return "linkNsToWorker";
  }
  if (touches("namespace")) return "linkNsToNs";
  if (touches("worker")) return "linkWorkerToWorker";
  if (src === "nexusOperation" && tgt === "nexusOperation") return "linkWorkflowToOperation";
  return "linkWorkflowToActivity";
}
const TEMPORAL_TYPE_DIMENSION = "temporalType";
const NODE_TYPE_REGISTRY = {
  namespace: {
    label: "Namespace",
    abbreviation: "NS",
    icon: "⧉",
    defType: "namespaceDef",
    ladder: "main",
    tier: "container",
    defaultVisible: false,
    color: {
      light: { fill: "#475569", border: "#1E293B" },
      // slate-600
      dark: { fill: "#94A3B8", border: "#475569" }
      // slate-400
    },
    size: { r: 20 },
    physics: {
      charge: -850,
      coreRadius: 85,
      band: { y: { min: -340, max: -120 } }
      // container band (shared with nexusEndpoint)
    },
    summaryKind: "children"
  },
  nexusEndpoint: {
    label: "Nexus Endpoint",
    abbreviation: "Ep",
    icon: "⌖",
    defType: "nexusEndpointDef",
    ladder: "nexus",
    tier: "container",
    defaultVisible: false,
    color: {
      light: { fill: "#9F1239", border: "#4C0519" },
      // rose-900 — deep, sits just under namespace
      dark: { fill: "#BE123C", border: "#881337" }
      // rose-700 — lighter on dark
    },
    size: { r: 15 },
    physics: {
      charge: -900,
      coreRadius: 64,
      band: { y: { min: -340, max: -120 } }
      // container band aligned with namespace
    },
    summaryKind: "none"
  },
  worker: {
    label: "Worker",
    abbreviation: "Wk",
    icon: "□",
    defType: "workerDef",
    ladder: "main",
    tier: "host",
    defaultVisible: true,
    color: {
      light: { fill: "#94A3B8", border: "#475569" },
      // slate-400
      dark: { fill: "#CBD5E1", border: "#64748B" }
      // slate-300
    },
    size: { r: 20 },
    physics: {
      charge: -770,
      coreRadius: 72,
      band: { y: { min: -200, max: 120 } }
      // host band (shared with nexusService)
    },
    summaryKind: "children"
  },
  nexusService: {
    label: "Nexus Service",
    abbreviation: "Nx",
    icon: "★",
    defType: "nexusServiceDef",
    ladder: "nexus",
    tier: "host",
    defaultVisible: false,
    color: {
      light: { fill: "#DB2777", border: "#831843" },
      // pink-600
      dark: { fill: "#EC4899", border: "#9D174D" }
      // pink-500
    },
    size: { r: 20 },
    physics: {
      charge: -760,
      coreRadius: 54,
      band: { y: { min: -200, max: 120 } }
      // host band aligned with worker
    },
    summaryKind: "children"
  },
  workflow: {
    label: "Workflow",
    abbreviation: "Wf",
    icon: "⚙⚙",
    defType: "workflowDef",
    ladder: "main",
    tier: "orchestrator",
    defaultVisible: true,
    color: {
      light: { fill: "#8B7EC8", border: "#5D4F95" },
      dark: { fill: "#A89BD8", border: "#6B5BB0" }
    },
    size: { r: 11, iconSize: 12 },
    physics: {
      charge: -360,
      coreRadius: 38,
      band: { y: { min: 100, max: 460 } }
      // orchestrator band (shared with nexusOperation)
    }
  },
  nexusOperation: {
    label: "Nexus Operation",
    abbreviation: "Op",
    icon: "☆",
    defType: "nexusOperationDef",
    ladder: "nexus",
    tier: "orchestrator",
    whenHidden: "splice",
    defaultVisible: false,
    color: {
      light: { fill: "#F9A8D4", border: "#BE185D" },
      dark: { fill: "#F9A8D4", border: "#DB2777" }
    },
    size: { r: 11, iconSize: 12 },
    physics: {
      charge: -560,
      coreRadius: 58,
      band: { y: { min: 100, max: 460 } }
      // orchestrator band aligned with workflow
    }
  },
  activity: {
    label: "Activity",
    abbreviation: "Act",
    icon: "⚙",
    defType: "activityDef",
    ladder: "main",
    tier: "leaf",
    defaultVisible: false,
    color: {
      light: { fill: "#7CB9E8", border: "#4A8BC2" },
      dark: { fill: "#7CB9E8", border: "#5DA8DD" }
    },
    size: { r: 8, iconSize: 10 },
    physics: {
      charge: -190,
      coreRadius: 20,
      band: { y: { min: 170, max: 500 } }
    }
  }
};
const ALL_NODE_TYPES = [
  "namespace",
  "nexusEndpoint",
  "worker",
  "nexusService",
  "workflow",
  "nexusOperation",
  "activity"
];
const DEFAULT_KINDS = ALL_NODE_TYPES.filter((t) => NODE_TYPE_REGISTRY[t].defaultVisible).map((t) => NODE_TYPE_REGISTRY[t].defType);
const FALLBACK_NODE_STYLE = {
  label: "Unknown",
  icon: "?",
  defType: "unknownDef",
  ladder: "main",
  tier: "leaf",
  defaultVisible: false,
  color: {
    light: { fill: "#CBD5E1", border: "#94A3B8" },
    dark: { fill: "#CBD5E1", border: "#94A3B8" }
  },
  size: { r: 10, iconSize: 11 },
  physics: {
    charge: -300,
    coreRadius: 30,
    band: { y: { min: 100, max: 460 } }
  },
  summaryKind: "none"
};
const VIEW_FILTER_CHIPS = [
  { id: "namespaceDef", label: "Namespaces", icon: NODE_TYPE_REGISTRY.namespace.icon, tint: "namespace", values: ["namespaceDef"] },
  { id: "workerDef", label: "Workers", icon: NODE_TYPE_REGISTRY.worker.icon, tint: "worker", values: ["workerDef"] },
  // The group wears the operation's light pink: the three deepest palette
  // extremes stay reserved for per-node accents, and the group chip sits softer.
  {
    id: "nexus",
    label: "Nexus",
    icon: NODE_TYPE_REGISTRY.nexusEndpoint.icon,
    tint: "nexusOperation",
    values: ["nexusEndpointDef", "nexusServiceDef", "nexusOperationDef"]
  },
  { id: "workflowDef", label: "Workflows", icon: NODE_TYPE_REGISTRY.workflow.icon, tint: "workflow", values: ["workflowDef"] },
  { id: "activityDef", label: "Activities", icon: NODE_TYPE_REGISTRY.activity.icon, tint: "activity", values: ["activityDef"] }
];
const KIND_ABBREV = Object.fromEntries(
  ALL_NODE_TYPES.map((t) => [NODE_TYPE_REGISTRY[t].defType, NODE_TYPE_REGISTRY[t].abbreviation])
);
const FILTER_DIMENSIONS = [
  {
    id: SOURCE_FILE_DIMENSION,
    label: "File",
    // Quiet neutral tags, as an origin reads; the kind axis below wears the
    // tinted chips.
    presentation: "tag",
    // Empty shows everything: adding the first file chip while the filter is
    // off would otherwise activate the filter and hide every other file.
    // A narrowing axis's defaults — a node with no file stays visible, a focus
    // expands only an active selection, a change reheats in place and keeps the
    // user's pan and zoom — are exactly the policies this axis wants.
    emptyMeans: "all",
    // One chip per file, in whatever order the graph yielded them, labelled by
    // the basename and abbreviated from it.
    labelFor: (v) => v.split("/").pop() ?? v,
    // The full path: the label is only the basename, and two files with the
    // same basename in different directories are otherwise identical chips.
    tooltipFor: (v) => v,
    iconFor: () => "📄"
  },
  {
    id: DEF_TYPE_DIMENSION,
    label: "Kind",
    // Empty hides everything: the chips are an allow-list. An allow-list's
    // defaults — an absent kind hidden, a focus always expanding, a structural
    // reheat that seeds, refits and resumes, a label that is the kind itself —
    // are exactly the policies this axis wants.
    emptyMeans: "none",
    // Five chips over seven filter keys: the three nexus kinds share one. That
    // folding is the domain choice this hook exists for.
    chipsFor: () => VIEW_FILTER_CHIPS,
    // A kind is a type's projection, so it abbreviates as the type does. Two
    // characters of the kind's own name collided ("wo" for two kinds, "ne" for
    // three), which left push/pull tokens on this axis indistinguishable. A
    // kind this registry does not know keeps the two-character fallback.
    abbreviationFor: (v) => KIND_ABBREV[v] ?? v.slice(0, 2),
    // Not every kind: the default view shows workers and workflows.
    initialSelection: () => DEFAULT_KINDS
  }
];
function stripKindPrefix(s) {
  if (!s) return void 0;
  const i = s.indexOf(":");
  return i >= 0 ? s.slice(i + 1) : s;
}
function contextLineFor(node2, parent) {
  const parentName = parent?.name;
  const queue = payloadString(node2, "queue");
  const hostWorker = payloadString(node2, "worker");
  switch (node2.values[TEMPORAL_TYPE_DIMENSION]) {
    case "worker":
    case "nexusEndpoint":
      return [parentName, queue].filter(Boolean).join(" · ") || void 0;
    case "nexusService":
      return [stripKindPrefix(hostWorker), queue].filter(Boolean).join(" · ") || void 0;
    case "nexusOperation":
      return [parentName, stripKindPrefix(hostWorker), queue].filter(Boolean).join(" · ") || void 0;
    default:
      return parentName;
  }
}
function highlightFor(active, base, graph) {
  const value = active.values[TEMPORAL_TYPE_DIMENSION];
  if (value === "nexusEndpoint") {
    const nodes = /* @__PURE__ */ new Set([active.id]);
    const edges = /* @__PURE__ */ new Set();
    if (active.parentId && graph.visibleIds.has(active.parentId)) nodes.add(active.parentId);
    for (const edge of graph.visibleEdges) {
      if (payloadString(edge, "nexusEndpoint") === active.id) {
        edges.add(edge.id);
        if (graph.visibleIds.has(edge.sourceId)) nodes.add(edge.sourceId);
        if (graph.visibleIds.has(edge.targetId)) nodes.add(edge.targetId);
      }
    }
    return { nodes, edges };
  }
  if (value === "nexusService") {
    const nodes = new Set(base.nodes);
    const operationIds = /* @__PURE__ */ new Set();
    for (const n of graph.visibleNodes) {
      if (n.values[TEMPORAL_TYPE_DIMENSION] === "nexusOperation" && n.parentId === active.id) operationIds.add(n.id);
    }
    for (const edge of graph.visibleEdges) {
      if (graph.getNode(edge.targetId)?.values[TEMPORAL_TYPE_DIMENSION] !== "nexusEndpoint") continue;
      if (!operationIds.has(edge.sourceId)) continue;
      if (graph.visibleIds.has(edge.targetId)) {
        nodes.add(edge.targetId);
        const ep = graph.getNode(edge.targetId);
        if (ep?.parentId && graph.visibleIds.has(ep.parentId)) nodes.add(ep.parentId);
      }
    }
    return { nodes };
  }
  return base;
}
const DEFAULT_TAXONOMY_SPEC = {
  styleAxis: TEMPORAL_TYPE_DIMENSION,
  styleLabel: "Type",
  // Declaration order is top of the hierarchy first.
  styles: ALL_NODE_TYPES.map((t) => ({ id: t, ...NODE_TYPE_REGISTRY[t] })),
  filterAxes: FILTER_DIMENSIONS,
  edgeTypes: ALL_EDGE_TYPES,
  classifyEdge: edgeTypeFor,
  contextLine: contextLineFor,
  highlight: highlightFor,
  // Two graduated edges on one pair: the one carrying routing metadata
  // survives, in either edge order, so an endpoint's highlight still finds
  // the edge it routed. Every payload this host writes on a dependency edge
  // is that metadata, so "carries a payload" is the whole test.
  collapse: (kept, candidate) => {
    const carries = (e) => e.payload !== void 0 && Object.keys(e.payload).length > 0;
    return carries(candidate) && !carries(kept) ? candidate : kept;
  },
  fallbackStyle: FALLBACK_NODE_STYLE
};
createTaxonomy(DEFAULT_TAXONOMY_SPEC);
function nodeTypeForDefType(defType) {
  return Object.keys(NODE_TYPE_REGISTRY).find((t) => NODE_TYPE_REGISTRY[t].defType === defType);
}
function splitDefinitionKey(definitionKey) {
  const i = definitionKey.indexOf(":");
  if (i < 0) return { kind: definitionKey, name: "" };
  return { kind: definitionKey.slice(0, i), name: definitionKey.slice(i + 1) };
}
const KIND_TO_NODE_TYPE = {
  namespace: "namespace",
  nexusEndpoint: "nexusEndpoint",
  worker: "worker",
  nexusService: "nexusService",
  workflow: "workflow",
  nexusOperation: "nexusOperation",
  activity: "activity"
};
function nodeTypeFromKind(kind) {
  const nodeType = KIND_TO_NODE_TYPE[kind];
  if (nodeType === void 0) {
    throw new Error(`unknown parser node kind: ${kind}`);
  }
  return nodeType;
}
function displayNameFor(nodeType, pn, packages) {
  if (pn.name === void 0) {
    const { name } = splitDefinitionKey(pn.definition);
    return nodeType === "nexusOperation" ? lastSegment(name) : name;
  }
  if (nodeType === "nexusOperation") return lastSegment(pn.name);
  if (!pn.packageId) return pn.name;
  const pkgName = packages?.[pn.packageId]?.name ?? pn.packageId;
  const shared = Object.entries(packages ?? {}).some(([id, ref]) => id !== pn.packageId && ref.name === pkgName);
  return `${pkgName}.${pn.name}${shared ? ` (${pn.packageId})` : ""}`;
}
function nodeLabel(pg, id) {
  const pn = pg.nodes.find((n) => n.id === id);
  if (!pn) return id;
  return displayNameFor(nodeTypeFromKind(splitDefinitionKey(pn.definition).kind), pn, pg.packages);
}
function lastSegment(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : name;
}
const node = (over) => ({ id: "x", definition: "workflow:x", ...over });
function labelChecks() {
  const packages = {
    "example.com/demo/fabric/v1": { name: "fabric" },
    "example.com/demo/cluster/fabric/v1": { name: "fabric" },
    "example.com/demo/top": { name: "top" }
  };
  check("a packaged node shows its package name, with its path when the name is shared", () => {
    const pn = node({ definition: "workflow:example.com/demo/fabric/v1.Setup", name: "Setup", packageId: "example.com/demo/fabric/v1" });
    equal(displayNameFor("workflow", pn, packages), "fabric.Setup (example.com/demo/fabric/v1)");
    const top = node({ definition: "workflow:example.com/demo/top.Main", name: "Main", packageId: "example.com/demo/top" });
    equal(displayNameFor("workflow", top, packages), "top.Main");
  });
  check("an operation shows the op alone", () => {
    const pn = node({ definition: "nexusOperation:example.com/demo/top.Svc.Op", name: "Svc.Op", packageId: "example.com/demo/top" });
    equal(displayNameFor("nexusOperation", pn, packages), "Op");
  });
  check("a default-package node shows its bare name", () => {
    equal(displayNameFor("workflow", node({ definition: "workflow:Setup", name: "Setup" }), void 0), "Setup");
  });
  check("a node from an older twf, with no name, falls back to its definition key", () => {
    equal(displayNameFor("workflow", node({ definition: "workflow:billing.Charge" }), void 0), "billing.Charge");
    equal(displayNameFor("nexusOperation", node({ definition: "nexusOperation:billing.Svc.Op" }), void 0), "Op");
  });
  check("a finding names its node by label", () => {
    const pg = { nodes: [node({ id: "workflow:top.Main/worker:w/namespace:ns", definition: "workflow:top.Main", name: "Main", packageId: "top" })], packages: { top: { name: "top" } } };
    equal(nodeLabel(pg, "workflow:top.Main/worker:w/namespace:ns"), "top.Main");
    equal(nodeLabel(pg, "missing"), "missing");
  });
  check("a Tree focus maps a definition type to the graph kind of its key", () => {
    equal(nodeTypeForDefType("workflowDef"), "workflow");
    equal(nodeTypeForDefType("nexusServiceDef"), "nexusService");
    equal(nodeTypeForDefType("nope"), void 0);
  });
}
filesChecks();
labelChecks();
console.log(JSON.stringify(report()));
