var os = Object.defineProperty;
var as = (e, n, s) => n in e ? os(e, n, { enumerable: !0, configurable: !0, writable: !0, value: s }) : e[n] = s;
var on = (e, n, s) => as(e, typeof n != "symbol" ? n + "" : n, s);
import { jsxs as f, jsx as t, Fragment as Ge } from "react/jsx-runtime";
import m from "react";
const is = {
  summary: { nodes: 0, edges: 0, coarsenedEdges: 0, unresolved: 0, diagnostics: 0 },
  nodes: [],
  edges: [],
  coarsenedEdges: [],
  unresolved: [],
  diagnostics: []
};
function Rn(e, n) {
  if (e.selectedFiles.size !== n.selectedFiles.size || e.visibleTypes.size !== n.visibleTypes.size) return !1;
  for (const s of e.selectedFiles) if (!n.selectedFiles.has(s)) return !1;
  for (const s of e.visibleTypes) if (!n.visibleTypes.has(s)) return !1;
  return !0;
}
function Rt(e) {
  return {
    selectedFiles: new Set(e.selectedFiles),
    visibleTypes: new Set(e.visibleTypes)
  };
}
function cs({ size: e = 16 }) {
  return /* @__PURE__ */ f(
    "svg",
    {
      width: e,
      height: e,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "block" },
      children: [
        /* @__PURE__ */ t("circle", { cx: "11", cy: "11", r: "7" }),
        /* @__PURE__ */ t("line", { x1: "16.65", y1: "16.65", x2: "21", y2: "21" })
      ]
    }
  );
}
function rs({ size: e = 14 }) {
  return /* @__PURE__ */ t(
    "svg",
    {
      width: e,
      height: e,
      viewBox: "0 0 24 24",
      fill: "currentColor",
      style: { display: "block" },
      children: /* @__PURE__ */ t("path", { d: "M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z" })
    }
  );
}
function ls({ size: e = 16 }) {
  return /* @__PURE__ */ f(
    "svg",
    {
      width: e,
      height: e,
      viewBox: "0 0 24 24",
      fill: "currentColor",
      style: { display: "block" },
      children: [
        /* @__PURE__ */ t("g", { transform: "translate(0, 0) scale(0.65)", children: /* @__PURE__ */ t("path", { d: "M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z" }) }),
        /* @__PURE__ */ t("g", { transform: "translate(9, 9) scale(0.55)", children: /* @__PURE__ */ t("path", { d: "M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z" }) })
      ]
    }
  );
}
const ke = {
  namespace: {
    label: "Namespace",
    icon: "⧉",
    defType: "namespaceDef",
    ladder: "main",
    tier: "container",
    defaultVisible: !1,
    color: {
      fill: "#475569",
      // slate-600
      border: "#1E293B",
      fillDark: "#94A3B8",
      // slate-400
      borderDark: "#475569",
      cssVarSuffix: "namespace"
    },
    size: { r: 20, iconSize: 18 },
    physics: {
      charge: -850,
      coreRadius: 85,
      yBand: { min: -340, max: -120 }
      // container band (shared with nexusEndpoint)
    },
    summaryKind: "containerCount"
  },
  nexusEndpoint: {
    label: "Nexus Endpoint",
    icon: "⌖",
    defType: "nexusEndpointDef",
    ladder: "nexus",
    tier: "container",
    defaultVisible: !1,
    color: {
      fill: "#9F1239",
      // rose-900 — deep, sits just under namespace
      border: "#4C0519",
      fillDark: "#BE123C",
      // rose-700 — lighter on dark
      borderDark: "#881337",
      cssVarSuffix: "nexus-endpoint"
    },
    size: { r: 15, iconSize: 14 },
    physics: {
      charge: -900,
      coreRadius: 64,
      yBand: { min: -340, max: -120 }
      // container band aligned with namespace
    },
    summaryKind: "none"
  },
  worker: {
    label: "Worker",
    icon: "□",
    defType: "workerDef",
    ladder: "main",
    tier: "host",
    defaultVisible: !0,
    color: {
      fill: "#94A3B8",
      // slate-400
      border: "#475569",
      fillDark: "#CBD5E1",
      // slate-300
      borderDark: "#64748B",
      cssVarSuffix: "worker"
    },
    size: { r: 20, iconSize: 18 },
    physics: {
      charge: -770,
      coreRadius: 72,
      yBand: { min: -200, max: 120 }
      // host band (shared with nexusService)
    },
    summaryKind: "hostRegistrations"
  },
  nexusService: {
    label: "Nexus Service",
    icon: "★",
    defType: "nexusServiceDef",
    ladder: "nexus",
    tier: "host",
    defaultVisible: !1,
    color: {
      fill: "#DB2777",
      // pink-600
      border: "#831843",
      fillDark: "#EC4899",
      // pink-500
      borderDark: "#9D174D",
      cssVarSuffix: "nexus-service"
    },
    size: { r: 20, iconSize: 18 },
    physics: {
      charge: -760,
      coreRadius: 54,
      yBand: { min: -200, max: 120 }
      // host band aligned with worker
    },
    summaryKind: "hostRegistrations"
  },
  workflow: {
    label: "Workflow",
    icon: "⚙⚙",
    defType: "workflowDef",
    ladder: "main",
    tier: "orchestrator",
    defaultVisible: !0,
    color: {
      fill: "#8B7EC8",
      border: "#5D4F95",
      fillDark: "#A89BD8",
      borderDark: "#6B5BB0",
      cssVarSuffix: "workflow"
    },
    size: { r: 11, iconSize: 12 },
    physics: {
      charge: -360,
      coreRadius: 38,
      yBand: { min: 100, max: 460 }
      // orchestrator band (shared with nexusOperation)
    },
    summaryKind: "degree"
  },
  nexusOperation: {
    label: "Nexus Operation",
    icon: "☆",
    defType: "nexusOperationDef",
    ladder: "nexus",
    tier: "orchestrator",
    defaultVisible: !1,
    color: {
      fill: "#F9A8D4",
      border: "#BE185D",
      borderDark: "#DB2777",
      cssVarSuffix: "nexus-operation"
    },
    size: { r: 11, iconSize: 12 },
    physics: {
      charge: -560,
      coreRadius: 58,
      yBand: { min: 100, max: 460 }
      // orchestrator band aligned with workflow
    },
    summaryKind: "degree"
  },
  activity: {
    label: "Activity",
    icon: "⚙",
    defType: "activityDef",
    ladder: "main",
    tier: "leaf",
    defaultVisible: !1,
    color: {
      fill: "#7CB9E8",
      border: "#4A8BC2",
      borderDark: "#5DA8DD",
      cssVarSuffix: "activity"
    },
    size: { r: 8, iconSize: 10 },
    physics: {
      charge: -190,
      coreRadius: 20,
      yBand: { min: 170, max: 500 }
    },
    summaryKind: "degree"
  }
}, ds = {
  namespace: "NS",
  nexusEndpoint: "Ep",
  worker: "Wk",
  nexusService: "Nx",
  workflow: "Wf",
  nexusOperation: "Op",
  activity: "Act"
};
function Ot(e) {
  return ds[e];
}
const Oe = [
  "namespace",
  "nexusEndpoint",
  "worker",
  "nexusService",
  "workflow",
  "nexusOperation",
  "activity"
], ut = {
  container: 0,
  host: 1,
  orchestrator: 2,
  leaf: 3
}, Lt = (e, n) => ut[ke[e].tier] - ut[ke[n].tier], Bt = Oe.filter((e) => ke[e].ladder === "main").sort(Lt), us = Oe.filter((e) => ke[e].ladder === "nexus").sort(Lt);
function Ye(e) {
  return ke[e];
}
const ps = {
  baseMul: 0.6,
  minZoomMul: 0.4,
  maxZoomMul: 1.65
};
function _n(e, n) {
  return n.baseMul * Math.max(n.minZoomMul, Math.min(n.maxZoomMul, e));
}
const Me = {
  workflow: { icon: "⚙⚙", label: "Workflow", cssVarPrefix: "workflow", SvgIcon: ls },
  activity: { icon: "⚙", label: "Activity", cssVarPrefix: "activity", SvgIcon: rs },
  worker: { icon: "□", label: "Worker", cssVarPrefix: "worker" },
  namespace: { icon: "⧉", label: "Namespace", cssVarPrefix: "namespace", iconSize: 16 },
  nexusService: { icon: "★", label: "Nexus Service", cssVarPrefix: "nexus-service", iconSize: 16 },
  nexusOperation: { icon: "☆", label: "Nexus Operation", cssVarPrefix: "nexus-operation" },
  nexusEndpoint: { icon: "⌖", label: "Nexus Endpoint", cssVarPrefix: "nexus-endpoint" },
  nexusCall: { icon: "☆", label: "Nexus Call", cssVarPrefix: "nexus" },
  signal: { icon: "↪", label: "Signal", cssVarPrefix: "signal" },
  query: { icon: "↩", label: "Query", cssVarPrefix: "query" },
  update: { icon: "⇄", label: "Update", cssVarPrefix: "update" },
  timer: { icon: "⏱", label: "Timer", cssVarPrefix: "timer" },
  conditionSet: { icon: "◉", label: "Set Condition", cssVarPrefix: "subtle" },
  conditionUnset: { icon: "○", label: "Unset Condition", cssVarPrefix: "subtle" },
  promise: { icon: "◇", label: "Promise", cssVarPrefix: "promise" },
  return: { icon: "↩", label: "Return", cssVarPrefix: "return" },
  closeComplete: { icon: "✓", label: "Close (Complete)", cssVarPrefix: "return" },
  closeFail: { icon: "✕", label: "Close (Fail)", cssVarPrefix: "signal" },
  closeContinueAsNew: { icon: "⟳", label: "Close (Continue As New)", cssVarPrefix: "continue-new" },
  forLoop: { icon: "↻", label: "For Loop", cssVarPrefix: "control" },
  awaitAll: { icon: "⫴", label: "Await All", cssVarPrefix: "control" },
  raw: { icon: "≡", label: "Raw Code", cssVarPrefix: "raw" },
  breakContinue: { icon: "•", label: "Break/Continue", cssVarPrefix: "subtle" },
  error: { icon: "⚠", label: "Error", cssVarPrefix: "signal" }
};
function hs(e) {
  return (e.split(" ").pop() ?? e).endsWith("y") ? e.slice(0, -1) + "ies" : e + "s";
}
const st = Oe.map((e) => ({
  type: ke[e].defType,
  icon: ke[e].icon,
  label: hs(ke[e].label),
  defaultOn: ke[e].defaultVisible
})), pt = new Map(st.map((e, n) => [e.type, n])), fs = [
  "nexusEndpointDef",
  "nexusServiceDef",
  "nexusOperationDef"
], ms = [
  { id: "namespaceDef", icon: ke.namespace.icon, label: "Namespaces", types: ["namespaceDef"] },
  { id: "workerDef", icon: ke.worker.icon, label: "Workers", types: ["workerDef"] },
  { id: "nexus", icon: ke.nexusEndpoint.icon, label: "Nexus", types: fs },
  { id: "workflowDef", icon: ke.workflow.icon, label: "Workflows", types: ["workflowDef"] },
  { id: "activityDef", icon: ke.activity.icon, label: "Activities", types: ["activityDef"] }
], gs = {
  signalDecl: { icon: Me.signal.icon, keyword: "signal", cssClass: "declaration-signal" },
  queryDecl: { icon: Me.query.icon, keyword: "query", cssClass: "declaration-query" },
  updateDecl: { icon: Me.update.icon, keyword: "update", cssClass: "declaration-update" }
}, Xe = {
  timer: Me.timer,
  signal: Me.signal,
  update: Me.update,
  activity: Me.activity,
  workflow: Me.workflow,
  nexus: Me.nexusCall,
  ident: Me.conditionSet
};
function He({ kind: e }) {
  const n = Me[e];
  return /* @__PURE__ */ t(
    "span",
    {
      className: "block-icon",
      style: n.iconSize ? { fontSize: `${n.iconSize}px` } : void 0,
      children: n.SvgIcon ? /* @__PURE__ */ t(n.SvgIcon, { size: 14 }) : n.icon
    }
  );
}
function ue(e = !1, n = !0) {
  const [s, o] = m.useState(e);
  return [s, () => {
    n && o((r) => !r);
  }];
}
function pn({ options: e }) {
  const [n, s] = ue(!1);
  if (!e || !e.entries || e.entries.length === 0) return null;
  const o = e.entries.map((a) => a.key).join(", ");
  return /* @__PURE__ */ f("div", { className: `options-block ${n ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ f("div", { className: "options-block-header", onClick: s, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }),
      /* @__PURE__ */ t("span", { className: "options-block-label", children: "options" }),
      !n && /* @__PURE__ */ t("span", { className: "options-block-summary", title: o, children: o })
    ] }),
    n && /* @__PURE__ */ t("div", { className: "options-block-body", children: /* @__PURE__ */ t(_t, { entries: e.entries }) })
  ] });
}
function _t({ entries: e }) {
  return /* @__PURE__ */ t("div", { className: "option-entry-list", children: e.map((n, s) => /* @__PURE__ */ t(ys, { entry: n }, `${n.key}:${s}`)) });
}
function ys({ entry: e }) {
  return !!e.nested && e.nested.length > 0 ? /* @__PURE__ */ f("div", { className: "option-entry", children: [
    /* @__PURE__ */ f("span", { className: "option-key", children: [
      e.key,
      ":"
    ] }),
    /* @__PURE__ */ t("div", { className: "option-nested", children: /* @__PURE__ */ t(_t, { entries: e.nested }) })
  ] }) : /* @__PURE__ */ f("div", { className: "option-entry", children: [
    /* @__PURE__ */ f("span", { className: "option-key", children: [
      e.key,
      ":"
    ] }),
    /* @__PURE__ */ t("span", { className: "option-value", children: e.value })
  ] });
}
function Wn({ decl: e }) {
  var h, g;
  const n = !!(e.body && e.body.length > 0), s = !!((g = (h = e.options) == null ? void 0 : h.entries) != null && g.length), o = n || s, [a, r] = ue(!1, o), { icon: c, keyword: l, cssClass: i } = gs[e.type];
  let d = `${e.name}(${e.params})`;
  return "returnType" in e && e.returnType && (d += ` → ${e.returnType}`), /* @__PURE__ */ f("div", { className: `declaration ${i} ${a ? "expanded" : ""}`, children: [
    /* @__PURE__ */ f("div", { className: "declaration-header", onClick: r, children: [
      o && /* @__PURE__ */ t("span", { className: "block-toggle", children: a ? "▼" : "▶" }),
      !o && /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ t("span", { className: "declaration-icon", children: c }),
      /* @__PURE__ */ t("span", { className: "declaration-keyword", children: l }),
      /* @__PURE__ */ t("span", { className: "declaration-name", children: d })
    ] }),
    a && o && /* @__PURE__ */ f("div", { className: "declaration-body", children: [
      /* @__PURE__ */ t(pn, { options: e.options }),
      n && e.body.map((p) => /* @__PURE__ */ t(Be, { statement: p }, `${p.line}:${p.column}`))
    ] })
  ] });
}
function On({ def: e }) {
  var v, k, A, P;
  const [n, s] = ue(), [o, a] = ue(), [r, c] = ue(), [l, i] = ue(), d = e.state && (e.state.conditions && e.state.conditions.length > 0 || e.state.rawStmts && e.state.rawStmts.length > 0), h = e.signals && e.signals.length > 0, g = e.queries && e.queries.length > 0, p = e.updates && e.updates.length > 0, y = (((k = (v = e.state) == null ? void 0 : v.conditions) == null ? void 0 : k.length) || 0) + (((P = (A = e.state) == null ? void 0 : A.rawStmts) == null ? void 0 : P.length) || 0);
  return /* @__PURE__ */ f(Ge, { children: [
    d && /* @__PURE__ */ f("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ f("div", { className: "declarations-header", onClick: s, children: [
        /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }),
        /* @__PURE__ */ t("span", { className: "declarations-icon declaration-condition", children: Me.conditionSet.icon }),
        /* @__PURE__ */ t("span", { className: "declarations-label", children: "state" }),
        /* @__PURE__ */ f("span", { className: "declarations-count", children: [
          "(",
          y,
          ")"
        ] })
      ] }),
      n && /* @__PURE__ */ f("div", { className: "block-declarations", children: [
        (e.state.conditions || []).map(($) => /* @__PURE__ */ t("div", { className: "declaration declaration-condition", children: /* @__PURE__ */ f("div", { className: "declaration-header", children: [
          /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ t("span", { className: "declaration-icon", children: Me.conditionSet.icon }),
          /* @__PURE__ */ t("span", { className: "declaration-keyword", children: "condition" }),
          /* @__PURE__ */ t("span", { className: "declaration-name", children: $.name })
        ] }) }, `${$.line}:${$.column}`)),
        (e.state.rawStmts || []).map(($) => /* @__PURE__ */ t("div", { className: "declaration declaration-raw-state", children: /* @__PURE__ */ f("div", { className: "declaration-header", children: [
          /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ t("span", { className: "declaration-icon", children: Me.raw.icon }),
          /* @__PURE__ */ t("span", { className: "declaration-name", children: $.text })
        ] }) }, `${$.line}:${$.column}`))
      ] })
    ] }),
    h && /* @__PURE__ */ f("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ f("div", { className: "declarations-header", onClick: a, children: [
        /* @__PURE__ */ t("span", { className: "block-toggle", children: o ? "▼" : "▶" }),
        /* @__PURE__ */ t("span", { className: "declarations-icon declaration-signal", children: Me.signal.icon }),
        /* @__PURE__ */ t("span", { className: "declarations-label", children: "signals" }),
        /* @__PURE__ */ f("span", { className: "declarations-count", children: [
          "(",
          e.signals.length,
          ")"
        ] })
      ] }),
      o && /* @__PURE__ */ t("div", { className: "block-declarations", children: e.signals.map(($) => /* @__PURE__ */ t(Wn, { decl: $ }, `${$.line}:${$.column}`)) })
    ] }),
    g && /* @__PURE__ */ f("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ f("div", { className: "declarations-header", onClick: c, children: [
        /* @__PURE__ */ t("span", { className: "block-toggle", children: r ? "▼" : "▶" }),
        /* @__PURE__ */ t("span", { className: "declarations-icon declaration-query", children: Me.query.icon }),
        /* @__PURE__ */ t("span", { className: "declarations-label", children: "queries" }),
        /* @__PURE__ */ f("span", { className: "declarations-count", children: [
          "(",
          e.queries.length,
          ")"
        ] })
      ] }),
      r && /* @__PURE__ */ t("div", { className: "block-declarations", children: e.queries.map(($) => /* @__PURE__ */ t(Wn, { decl: $ }, `${$.line}:${$.column}`)) })
    ] }),
    p && /* @__PURE__ */ f("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ f("div", { className: "declarations-header", onClick: i, children: [
        /* @__PURE__ */ t("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
        /* @__PURE__ */ t("span", { className: "declarations-icon declaration-update", children: Me.update.icon }),
        /* @__PURE__ */ t("span", { className: "declarations-label", children: "updates" }),
        /* @__PURE__ */ f("span", { className: "declarations-count", children: [
          "(",
          e.updates.length,
          ")"
        ] })
      ] }),
      l && /* @__PURE__ */ t("div", { className: "block-declarations", children: e.updates.map(($) => /* @__PURE__ */ t(Wn, { decl: $ }, `${$.line}:${$.column}`)) })
    ] }),
    /* @__PURE__ */ t(it, { statements: e.body || [] })
  ] });
}
function ot({ def: e }) {
  const [n, s] = ue(), o = `${e.name}(${e.params})${e.returnType ? ` → ${e.returnType}` : ""}`, a = m.useMemo(() => {
    const r = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map();
    for (const i of e.signals || []) r.set(i.name, i);
    for (const i of e.queries || []) c.set(i.name, i);
    for (const i of e.updates || []) l.set(i.name, i);
    return { signals: r, queries: c, updates: l };
  }, [e]);
  return /* @__PURE__ */ t(kn.Provider, { value: a, children: /* @__PURE__ */ f("div", { className: `block block-workflow-call ${n ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }),
      /* @__PURE__ */ t(He, { kind: "workflow" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "workflow" }),
      /* @__PURE__ */ t("span", { className: "block-signature", children: o })
    ] }),
    n && /* @__PURE__ */ t("div", { className: "block-body", children: /* @__PURE__ */ t(On, { def: e }) })
  ] }) });
}
function at({ body: e }) {
  const [n, s] = ue(!0);
  return /* @__PURE__ */ f("div", { className: `block block-sync-body ${n ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "handler" })
    ] }),
    n && /* @__PURE__ */ t("div", { className: "block-body", children: e.map((o) => /* @__PURE__ */ t(Be, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function tn({ defName: e, defType: n, showDefinition: s }) {
  const o = m.useContext(ss), a = [];
  if (s && a.push({ label: "Def", targets: [s] }), e && n) {
    const c = `${n}:${e}`, l = o.callers.get(c);
    if (l && l.length > 0 && a.push({ label: "Callers", targets: l.map((i) => ({ name: i.defName, type: i.defType })) }), n === "workflowDef" || n === "activityDef" || n === "nexusServiceDef") {
      const i = o.workerOf.get(c);
      i && i.length > 0 && a.push({ label: "Worker", targets: i.map((d) => ({ name: d, type: "workerDef" })) });
    }
    if (n === "workerDef") {
      const i = o.namespaceOf.get(c);
      i && i.length > 0 && a.push({ label: "NS", targets: i.map((d) => ({ name: d, type: "namespaceDef" })) });
    }
  }
  const r = e && n && o.showInGraph ? () => o.showInGraph(e, n) : null;
  return a.length === 0 && !r ? null : /* @__PURE__ */ f("div", { className: "ctx-nav-buttons", onClick: (c) => c.stopPropagation(), children: [
    a.map((c) => /* @__PURE__ */ t(ks, { action: c, onNavigate: o.navigateTo }, c.label)),
    r && /* @__PURE__ */ t("button", { className: "ctx-nav-btn", onClick: r, title: "Show in Graph view", children: "Graph" })
  ] });
}
function ks({ action: e, onNavigate: n }) {
  const [s, o] = m.useState(!1), a = m.useRef(null);
  return m.useEffect(() => {
    if (!s) return;
    const c = (l) => {
      a.current && !a.current.contains(l.target) && o(!1);
    };
    return document.addEventListener("mousedown", c), () => document.removeEventListener("mousedown", c);
  }, [s]), m.useEffect(() => {
    if (!s) return;
    const c = (l) => {
      l.key === "Escape" && (l.stopPropagation(), o(!1));
    };
    return document.addEventListener("keydown", c), () => document.removeEventListener("keydown", c);
  }, [s]), /* @__PURE__ */ f("div", { className: "ctx-nav-btn-wrapper", ref: a, children: [
    /* @__PURE__ */ f(
      "button",
      {
        className: `ctx-nav-btn ${s ? "active" : ""}`,
        onClick: () => {
          e.targets.length === 1 ? n(e.targets[0].name, e.targets[0].type) : o(!s);
        },
        title: `Show ${e.label.toLowerCase()}`,
        children: [
          e.label,
          e.targets.length > 1 && /* @__PURE__ */ t("span", { className: "ctx-nav-count", children: e.targets.length })
        ]
      }
    ),
    s && /* @__PURE__ */ t("div", { className: "ctx-nav-popover", children: e.targets.map((c) => /* @__PURE__ */ t(
      "button",
      {
        className: "ctx-nav-popover-item",
        onClick: () => {
          n(c.name, c.type), o(!1);
        },
        children: c.name
      },
      `${c.type}:${c.name}`
    )) })
  ] });
}
function vs({ stmt: e }) {
  var d, h;
  const s = m.useContext(Ke).activities.get(e.name), o = !!s, a = !!((h = (d = e.options) == null ? void 0 : d.entries) != null && h.length), r = o || a, [c, l] = ue(!1, r), i = Ns(e);
  return /* @__PURE__ */ f("div", { className: `block block-activity ${c ? "expanded" : "collapsed"} ${o ? "" : "block-unresolved"}`, children: [
    o && /* @__PURE__ */ t(tn, { showDefinition: { name: e.name, type: "activityDef" } }),
    /* @__PURE__ */ f("div", { className: "block-header", onClick: l, children: [
      r ? /* @__PURE__ */ t("span", { className: "block-toggle", children: c ? "▼" : "▶" }) : /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "activity" }),
      /* @__PURE__ */ t("span", { className: "block-signature", title: i, children: i }),
      !o && /* @__PURE__ */ t("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    c && r && /* @__PURE__ */ f("div", { className: "block-body", children: [
      /* @__PURE__ */ t(pn, { options: e.options }),
      o && ((s.body || []).length > 0 ? (s.body || []).map((g) => /* @__PURE__ */ t(Be, { statement: g }, `${g.line}:${g.column}`)) : /* @__PURE__ */ t("div", { className: "block-empty-body", children: "No implementation defined" }))
    ] })
  ] });
}
function bs({ stmt: e }) {
  var h, g;
  const s = m.useContext(Ke).workflows.get(e.name), o = !!s, a = !!((g = (h = e.options) == null ? void 0 : h.entries) != null && g.length), r = o || a, [c, l] = ue(!1, r), i = e.mode === "detach" ? "detach " : "", d = Ts(e);
  return /* @__PURE__ */ f("div", { className: `block block-workflow-call block-mode-${e.mode} ${c ? "expanded" : "collapsed"} ${o ? "" : "block-unresolved"}`, children: [
    o && /* @__PURE__ */ t(tn, { showDefinition: { name: e.name, type: "workflowDef" } }),
    /* @__PURE__ */ f("div", { className: "block-header", onClick: l, children: [
      r ? /* @__PURE__ */ t("span", { className: "block-toggle", children: c ? "▼" : "▶" }) : /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ f("span", { className: "block-keyword", children: [
        i,
        "workflow"
      ] }),
      /* @__PURE__ */ t("span", { className: "block-signature", title: d, children: d }),
      !o && /* @__PURE__ */ t("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    c && r && /* @__PURE__ */ f("div", { className: "block-body", children: [
      /* @__PURE__ */ t(pn, { options: e.options }),
      o && /* @__PURE__ */ t(ws, { def: s, children: /* @__PURE__ */ t(On, { def: s }) })
    ] })
  ] });
}
function ws({ def: e, children: n }) {
  const s = m.useMemo(() => {
    const o = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map();
    for (const c of e.signals || []) o.set(c.name, c);
    for (const c of e.queries || []) a.set(c.name, c);
    for (const c of e.updates || []) r.set(c.name, c);
    return { signals: o, queries: a, updates: r };
  }, [e]);
  return /* @__PURE__ */ t(kn.Provider, { value: s, children: n });
}
function xs({ stmt: e }) {
  var v, k, A;
  const n = m.useContext(Ke), s = n.nexusServices.get(e.service), o = (v = s == null ? void 0 : s.operations) == null ? void 0 : v.find((P) => P.name === e.operation), a = !!o, r = (o == null ? void 0 : o.opType) === "async" && o.workflowName ? n.workflows.get(o.workflowName) : void 0, c = (o == null ? void 0 : o.opType) === "async" ? !!r : !!(o != null && o.body && o.body.length > 0), l = !!((A = (k = e.options) == null ? void 0 : k.entries) != null && A.length), i = c || l, [d, h] = ue(!1, i), g = e.detach ? "detach " : "", p = `${e.endpoint} ${e.service}.${e.operation}(${e.args})`, y = e.result ? ` → ${e.result}` : "";
  return /* @__PURE__ */ f("div", { className: `block block-nexus-call ${e.detach ? "block-mode-detach" : ""} ${d ? "expanded" : "collapsed"} ${!a && e.service ? "block-unresolved" : ""}`, children: [
    s && /* @__PURE__ */ t(tn, { showDefinition: { name: e.service, type: "nexusServiceDef" } }),
    /* @__PURE__ */ f("div", { className: "block-header", onClick: h, children: [
      i ? /* @__PURE__ */ t("span", { className: "block-toggle", children: d ? "▼" : "▶" }) : /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ f("span", { className: "block-keyword", children: [
        g,
        "nexus"
      ] }),
      /* @__PURE__ */ f("span", { className: "block-signature", title: `${p}${y}`, children: [
        p,
        y
      ] }),
      !a && e.service && /* @__PURE__ */ t("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    d && i && /* @__PURE__ */ f("div", { className: "block-body", children: [
      /* @__PURE__ */ t(pn, { options: e.options }),
      c && ((o == null ? void 0 : o.opType) === "async" && r ? /* @__PURE__ */ t(ot, { def: r }) : o != null && o.body ? /* @__PURE__ */ t(at, { body: o.body }) : null)
    ] })
  ] });
}
function Ns(e) {
  let n = `${e.name}(${e.args})`;
  return e.result && (n += ` → ${e.result}`), n;
}
function Ts(e) {
  let n = `${e.name}(${e.args})`;
  return e.result && (n += ` → ${e.result}`), n;
}
function Wt(e, n, s) {
  var o;
  switch (e.kind) {
    case "timer":
      return { icon: Xe.timer.icon, keyword: "timer", signature: `(${e.timer.duration || ""})`, isUnresolved: !1 };
    case "signal": {
      const a = e.signal.name || "", r = e.signal.params ? ` → ${e.signal.params}` : "", c = s.signals.get(a);
      return { icon: Xe.signal.icon, keyword: "signal", signature: `${a}${r}`, expandableDef: c, isUnresolved: !c };
    }
    case "update": {
      const a = e.update.name || "", r = e.update.params ? ` → ${e.update.params}` : "", c = s.updates.get(a);
      return { icon: Xe.update.icon, keyword: "update", signature: `${a}${r}`, expandableDef: c, isUnresolved: !c };
    }
    case "activity": {
      const a = `${e.activity.name || ""}(${e.activity.args || ""})`, r = e.activity.result ? ` → ${e.activity.result}` : "", c = n.activities.get(e.activity.name || "");
      return { icon: Xe.activity.icon, keyword: "activity", signature: `${a}${r}`, expandableDef: c, isUnresolved: !c };
    }
    case "workflow": {
      const a = e.workflow.mode === "detach" ? "detach " : "", r = `${e.workflow.name || ""}(${e.workflow.args || ""})`, c = e.workflow.result ? ` → ${e.workflow.result}` : "", l = n.workflows.get(e.workflow.name || "");
      return { icon: Xe.workflow.icon, keyword: `${a}workflow`, signature: `${r}${c}`, expandableDef: l, isUnresolved: !l };
    }
    case "nexus": {
      const a = e.nexus.detach ? "detach " : "", r = `${e.nexus.endpoint || ""} ${e.nexus.service || ""}.${e.nexus.operation || ""}(${e.nexus.args || ""})`, c = e.nexus.result ? ` → ${e.nexus.result}` : "", l = n.nexusServices.get(e.nexus.service || ""), i = (o = l == null ? void 0 : l.operations) == null ? void 0 : o.find((h) => h.name === (e.nexus.operation || "")), d = !!(e.nexus.service && !l);
      if ((i == null ? void 0 : i.opType) === "async" && i.workflowName) {
        const h = n.workflows.get(i.workflowName);
        if (h)
          return { icon: Xe.nexus.icon, keyword: `${a}nexus`, signature: `${r}${c}`, nexusAsyncWorkflow: h, isUnresolved: d };
      } else if ((i == null ? void 0 : i.opType) === "sync" && i.body)
        return { icon: Xe.nexus.icon, keyword: `${a}nexus`, signature: `${r}${c}`, nexusSyncBody: i.body, isUnresolved: d };
      return { icon: Xe.nexus.icon, keyword: `${a}nexus`, signature: `${r}${c}`, isUnresolved: d };
    }
    case "ident": {
      const a = e.ident.name || "", r = e.ident.result ? ` → ${e.ident.result}` : "";
      return { icon: Xe.ident.icon, keyword: "", signature: `${a}${r}`, isUnresolved: !1 };
    }
    default:
      return { icon: "?", keyword: "", signature: "", isUnresolved: !1 };
  }
}
function Ms(e, n, s) {
  var r, c;
  const o = Wt(e.target, n, s), a = e.target.kind === "workflow" && ((r = e.target.workflow) == null ? void 0 : r.mode) === "detach" || e.target.kind === "nexus" && ((c = e.target.nexus) == null ? void 0 : c.detach);
  return {
    ...o,
    // Activity/workflow/nexus use SVG icons at block level, not text icons
    icon: e.target.kind === "activity" || e.target.kind === "workflow" || e.target.kind === "nexus" ? "" : o.icon,
    keyword: o.keyword ? `await ${o.keyword}` : "await",
    blockClass: `block-await-stmt block-await-stmt-${e.target.kind}${a ? " block-mode-detach" : ""}`
  };
}
function Ss(e, n, s) {
  var a, r;
  if (e.awaitAll != null)
    return { contentClass: "tagged-await-all", icon: Me.awaitAll.icon, keyword: "await all", signature: `${((r = (a = e.awaitAll) == null ? void 0 : a.body) == null ? void 0 : r.length) || 0} branch(es)`, isUnresolved: !1 };
  const o = Wt(e.target, n, s);
  return {
    icon: o.icon,
    keyword: o.keyword,
    signature: o.signature,
    isUnresolved: o.isUnresolved,
    contentClass: `tagged-${e.target.kind}`
  };
}
function Es({ stmt: e }) {
  const n = m.useContext(Ke), s = m.useContext(kn), { keyword: o, signature: a, blockClass: r, expandableDef: c, nexusAsyncWorkflow: l, nexusSyncBody: i, isUnresolved: d } = Ms(e, n, s), h = !!(c || l || i), [g, p] = ue(!1, h);
  return /* @__PURE__ */ f("div", { className: `block ${r} ${g ? "expanded" : "collapsed"} ${d ? "block-unresolved" : ""}`, children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: p, children: [
      h ? /* @__PURE__ */ t("span", { className: "block-toggle", children: g ? "▼" : "▶" }) : /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: o }),
      /* @__PURE__ */ t("span", { className: "block-signature", children: a }),
      d && /* @__PURE__ */ t("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    g && h && /* @__PURE__ */ t("div", { className: "block-body", children: l ? /* @__PURE__ */ t(ot, { def: l }) : i ? /* @__PURE__ */ t(at, { body: i }) : c && (c.body || []).length > 0 ? (c.body || []).map((y) => /* @__PURE__ */ t(Be, { statement: y }, `${y.line}:${y.column}`)) : /* @__PURE__ */ t("div", { className: "block-empty-body", children: "No implementation defined" }) })
  ] });
}
function Vt({ stmt: e }) {
  const [n, s] = ue(!0);
  return /* @__PURE__ */ f("div", { className: `block block-await-all ${n ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "await all" }),
      /* @__PURE__ */ f("span", { className: "block-signature", children: [
        (e.body || []).length,
        " branch(es)"
      ] })
    ] }),
    n && /* @__PURE__ */ t("div", { className: "block-body", children: (e.body || []).map((o) => /* @__PURE__ */ t(Be, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function $s({ stmt: e }) {
  const [n, s] = ue(!0), o = e.cases.length === 1 ? "case" : "cases";
  return /* @__PURE__ */ f("div", { className: `block block-await-one ${n ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "await one" }),
      /* @__PURE__ */ f("span", { className: "block-signature", children: [
        "first of ",
        e.cases.length,
        " ",
        o
      ] })
    ] }),
    n && /* @__PURE__ */ t("div", { className: "block-body", children: e.cases.map((a) => /* @__PURE__ */ t(Cs, { awaitCase: a }, `${a.line}:${a.column}`)) })
  ] });
}
function Cs({ awaitCase: e }) {
  const n = m.useContext(Ke), s = m.useContext(kn), o = e.body && e.body.length > 0, a = o || !!e.awaitAll, [r, c] = ue(!1, a), { contentClass: l, keyword: i, signature: d, isUnresolved: h } = Ss(e, n, s);
  return /* @__PURE__ */ f("div", { className: `tagged-composite ${r ? "expanded" : ""} ${h ? "tagged-unresolved" : ""}`, children: [
    /* @__PURE__ */ t("div", { className: "tagged-tag", children: /* @__PURE__ */ t("span", { className: "tagged-tag-label", children: "option" }) }),
    /* @__PURE__ */ f("div", { className: `tagged-content ${l} ${a ? "expandable" : ""}`, onClick: c, children: [
      a && /* @__PURE__ */ t("span", { className: "block-toggle", children: r ? "▼" : "▶" }),
      !a && /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ t("span", { className: "tagged-kind", children: i }),
      /* @__PURE__ */ t("span", { className: "tagged-name", children: d }),
      h && /* @__PURE__ */ t("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    r && /* @__PURE__ */ f("div", { className: "tagged-body", children: [
      e.awaitAll && /* @__PURE__ */ t(Vt, { stmt: e.awaitAll }),
      o && e.body.map((g) => /* @__PURE__ */ t(Be, { statement: g }, `${g.line}:${g.column}`))
    ] })
  ] });
}
function Ds({ stmt: e }) {
  const [n, s] = ue(!0);
  return /* @__PURE__ */ f("div", { className: `block block-switch ${n ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "switch" }),
      /* @__PURE__ */ t("span", { className: "block-signature", children: e.expr })
    ] }),
    n && /* @__PURE__ */ f("div", { className: "block-body", children: [
      e.cases.map((o) => /* @__PURE__ */ t(Fs, { switchCase: o }, `${o.line}:${o.column}`)),
      e.default && e.default.length > 0 && /* @__PURE__ */ f("div", { className: "block block-switch-default", children: [
        /* @__PURE__ */ f("div", { className: "block-header", children: [
          /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ t("span", { className: "block-keyword", children: "default" })
        ] }),
        /* @__PURE__ */ t("div", { className: "block-body", children: e.default.map((o) => /* @__PURE__ */ t(Be, { statement: o }, `${o.line}:${o.column}`)) })
      ] })
    ] })
  ] });
}
function Fs({ switchCase: e }) {
  const [n, s] = ue(!0);
  return /* @__PURE__ */ f("div", { className: `block block-switch-case ${n ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "case" }),
      /* @__PURE__ */ t("span", { className: "block-signature", children: e.value })
    ] }),
    n && e.body && e.body.length > 0 && /* @__PURE__ */ t("div", { className: "block-body", children: e.body.map((o) => /* @__PURE__ */ t(Be, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function As(e) {
  const n = [{ kind: "if", condition: e.condition, body: e.body || [] }];
  let s = e;
  for (; s.elseBody && s.elseBody.length === 1 && s.elseBody[0].type === "if"; ) {
    const o = s.elseBody[0];
    n.push({ kind: "elseif", condition: o.condition, body: o.body || [] }), s = o;
  }
  return s.elseBody && s.elseBody.length > 0 && n.push({ kind: "else", body: s.elseBody }), n;
}
const Ps = {
  if: "if",
  elseif: "else if",
  else: "else"
};
function Is({ stmt: e }) {
  const [n, s] = ue(!0), o = As(e), a = n ? o : o.slice(0, 1);
  return /* @__PURE__ */ t("div", { className: `block block-if ${n ? "expanded" : "collapsed"}`, children: a.map((r, c) => /* @__PURE__ */ f("div", { className: "if-branch", children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: s, children: [
      c === 0 ? /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }) : /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: Ps[r.kind] }),
      r.condition && /* @__PURE__ */ t("span", { className: "block-signature", children: r.condition })
    ] }),
    n && r.body.length > 0 && /* @__PURE__ */ t("div", { className: "block-body", children: r.body.map((l) => /* @__PURE__ */ t(Be, { statement: l }, `${l.line}:${l.column}`)) })
  ] }, `${r.kind}:${c}`)) });
}
function Rs({ stmt: e }) {
  const [n, s] = ue(!0);
  let o = "";
  return e.variant === "iteration" ? o = `${e.variable} in ${e.iterable}` : e.variant === "conditional" ? o = e.condition || "" : o = "∞", /* @__PURE__ */ f("div", { className: `block block-for ${n ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: n ? "▼" : "▶" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "for" }),
      /* @__PURE__ */ t("span", { className: "block-signature", children: o })
    ] }),
    n && /* @__PURE__ */ t("div", { className: "block-body", children: (e.body || []).map((a) => /* @__PURE__ */ t(Be, { statement: a }, `${a.line}:${a.column}`)) })
  ] });
}
function Os({ stmt: e }) {
  return /* @__PURE__ */ t("div", { className: "block block-return collapsed", children: /* @__PURE__ */ f("div", { className: "block-header", children: [
    /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ t("span", { className: "block-keyword", children: "return" }),
    e.value && /* @__PURE__ */ t("span", { className: "block-signature", children: e.value })
  ] }) });
}
function Ls({ stmt: e }) {
  const n = e.reason === "continue_as_new" ? "close-continue-as-new" : e.reason === "fail" ? "close-failed" : "";
  return /* @__PURE__ */ t("div", { className: `block block-close ${n} collapsed`, children: /* @__PURE__ */ f("div", { className: "block-header", children: [
    /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ t("span", { className: "block-keyword", children: "close" }),
    /* @__PURE__ */ f("span", { className: "block-signature", children: [
      /* @__PURE__ */ t("span", { className: "close-reason", children: e.reason }),
      e.args && /* @__PURE__ */ f("span", { children: [
        "(",
        e.args,
        ")"
      ] })
    ] })
  ] }) });
}
function Bs({ stmt: e }) {
  return /* @__PURE__ */ t("div", { className: "block block-raw collapsed", children: /* @__PURE__ */ f("div", { className: "block-header", children: [
    /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ t("span", { className: "block-code", children: e.text })
  ] }) });
}
function _s({ stmt: e }) {
  return /* @__PURE__ */ t("div", { className: "block block-comment collapsed", children: /* @__PURE__ */ f("div", { className: "block-header", children: [
    /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ f("span", { className: "block-comment-text", title: e.text, children: [
      "# ",
      e.text
    ] })
  ] }) });
}
function ht({ keyword: e, className: n }) {
  return /* @__PURE__ */ t("div", { className: `block ${n} collapsed`, children: /* @__PURE__ */ f("div", { className: "block-header", children: [
    /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ t("span", { className: "block-keyword", children: e })
  ] }) });
}
function Ws({ stmt: e }) {
  let n = "";
  switch (e.target.kind) {
    case "activity":
      n = `activity ${e.target.activity.name}(${e.target.activity.args || ""})`;
      break;
    case "workflow":
      n = `workflow ${e.target.workflow.name}(${e.target.workflow.args || ""})`;
      break;
    case "nexus":
      n = `nexus ${e.target.nexus.endpoint} ${e.target.nexus.service}.${e.target.nexus.operation}(${e.target.nexus.args || ""})`;
      break;
    case "timer":
      n = `timer(${e.target.timer.duration})`;
      break;
    case "signal": {
      const s = e.target.signal.params ? `(${e.target.signal.params})` : "";
      n = `signal ${e.target.signal.name}${s}`;
      break;
    }
    case "update": {
      const s = e.target.update.params ? `(${e.target.update.params})` : "";
      n = `update ${e.target.update.name}${s}`;
      break;
    }
    case "ident":
      n = e.target.ident.name;
      break;
  }
  return /* @__PURE__ */ t("div", { className: "block block-promise collapsed", children: /* @__PURE__ */ f("div", { className: "block-header", children: [
    /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ t("span", { className: "block-keyword", children: "promise" }),
    /* @__PURE__ */ f("span", { className: "block-signature", children: [
      e.name,
      " ← ",
      n
    ] })
  ] }) });
}
function Vs({ stmt: e }) {
  return /* @__PURE__ */ t("div", { className: "block block-set collapsed", children: /* @__PURE__ */ f("div", { className: "block-header", children: [
    /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ t("span", { className: "block-keyword", children: "set" }),
    /* @__PURE__ */ t("span", { className: "block-signature", children: e.name })
  ] }) });
}
function Gs({ stmt: e }) {
  return /* @__PURE__ */ t("div", { className: "block block-unset collapsed", children: /* @__PURE__ */ f("div", { className: "block-header", children: [
    /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ t("span", { className: "block-keyword", children: "unset" }),
    /* @__PURE__ */ t("span", { className: "block-signature", children: e.name })
  ] }) });
}
function it({ statements: e }) {
  return !e || e.length === 0 ? null : /* @__PURE__ */ t("div", { className: "block-statement-body", children: e.map((n) => /* @__PURE__ */ t(Be, { statement: n }, `${n.line}:${n.column}`)) });
}
function Be({ statement: e }) {
  switch (e.type) {
    case "activityCall":
      return /* @__PURE__ */ t(vs, { stmt: e });
    case "workflowCall":
      return /* @__PURE__ */ t(bs, { stmt: e });
    case "nexusCall":
      return /* @__PURE__ */ t(xs, { stmt: e });
    case "await":
      return /* @__PURE__ */ t(Es, { stmt: e });
    case "awaitAll":
      return /* @__PURE__ */ t(Vt, { stmt: e });
    case "awaitOne":
      return /* @__PURE__ */ t($s, { stmt: e });
    case "switch":
      return /* @__PURE__ */ t(Ds, { stmt: e });
    case "if":
      return /* @__PURE__ */ t(Is, { stmt: e });
    case "for":
      return /* @__PURE__ */ t(Rs, { stmt: e });
    case "return":
      return /* @__PURE__ */ t(Os, { stmt: e });
    case "close":
      return /* @__PURE__ */ t(Ls, { stmt: e });
    case "raw":
      return /* @__PURE__ */ t(Bs, { stmt: e });
    case "break":
      return /* @__PURE__ */ t(ht, { keyword: "break", className: "block-break" });
    case "continue":
      return /* @__PURE__ */ t(ht, { keyword: "continue", className: "block-continue" });
    case "promise":
      return /* @__PURE__ */ t(Ws, { stmt: e });
    case "set":
      return /* @__PURE__ */ t(Vs, { stmt: e });
    case "unset":
      return /* @__PURE__ */ t(Gs, { stmt: e });
    case "comment":
      return /* @__PURE__ */ t(_s, { stmt: e });
    default:
      return null;
  }
}
function Hs({ definition: e, expanded: n, onToggle: s }) {
  switch (e.type) {
    case "workflowDef":
      return /* @__PURE__ */ t(qs, { def: e, controlledExpanded: n, onToggle: s });
    case "activityDef":
      return /* @__PURE__ */ t(zs, { def: e, controlledExpanded: n, onToggle: s });
    case "workerDef":
      return /* @__PURE__ */ t(Xs, { def: e, controlledExpanded: n, onToggle: s });
    case "namespaceDef":
      return /* @__PURE__ */ t(Ys, { def: e, controlledExpanded: n, onToggle: s });
    case "nexusServiceDef":
      return /* @__PURE__ */ t(Js, { def: e, controlledExpanded: n, onToggle: s });
    default:
      return null;
  }
}
function qs({ def: e, controlledExpanded: n, onToggle: s }) {
  const o = Zs(e), [a, r] = ue(), c = n ?? a, l = s ?? r, i = m.useMemo(() => {
    const d = /* @__PURE__ */ new Map(), h = /* @__PURE__ */ new Map(), g = /* @__PURE__ */ new Map();
    for (const p of e.signals || []) d.set(p.name, p);
    for (const p of e.queries || []) h.set(p.name, p);
    for (const p of e.updates || []) g.set(p.name, p);
    return { signals: d, queries: h, updates: g };
  }, [e]);
  return /* @__PURE__ */ t(kn.Provider, { value: i, children: /* @__PURE__ */ f("div", { className: `block block-workflow ${c ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ t(tn, { defName: e.name, defType: "workflowDef" }),
    /* @__PURE__ */ f("div", { className: "block-header", onClick: l, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: c ? "▼" : "▶" }),
      /* @__PURE__ */ t(He, { kind: "workflow" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "workflow" }),
      /* @__PURE__ */ t("span", { className: "block-signature", title: o, children: o }),
      !c && (() => {
        const d = yn(e);
        return d ? /* @__PURE__ */ t("span", { className: "block-summary", children: d }) : null;
      })()
    ] }),
    c && /* @__PURE__ */ t("div", { className: "block-body", children: /* @__PURE__ */ t(On, { def: e }) })
  ] }) });
}
function zs({ def: e, controlledExpanded: n, onToggle: s }) {
  const [o, a] = ue(), r = n ?? o, c = s ?? a, l = Qs(e);
  return /* @__PURE__ */ f("div", { className: `block block-activity-def ${r ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ t(tn, { defName: e.name, defType: "activityDef" }),
    /* @__PURE__ */ f("div", { className: "block-header", onClick: c, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: r ? "▼" : "▶" }),
      /* @__PURE__ */ t(He, { kind: "activity" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "activity" }),
      /* @__PURE__ */ t("span", { className: "block-signature", title: l, children: l }),
      !r && (() => {
        const i = yn(e);
        return i ? /* @__PURE__ */ t("span", { className: "block-summary", children: i }) : null;
      })()
    ] }),
    r && /* @__PURE__ */ t("div", { className: "block-body", children: /* @__PURE__ */ t(it, { statements: e.body || [] }) })
  ] });
}
function Xs({ def: e, controlledExpanded: n, onToggle: s }) {
  var i, d, h, g, p, y;
  const [o, a] = ue(), r = n ?? o, c = s ?? a, l = (((i = e.workflows) == null ? void 0 : i.length) || 0) + (((d = e.activities) == null ? void 0 : d.length) || 0) + (((h = e.services) == null ? void 0 : h.length) || 0);
  return /* @__PURE__ */ f("div", { className: `block block-worker-def ${r ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ t(tn, { defName: e.name, defType: "workerDef" }),
    /* @__PURE__ */ f("div", { className: "block-header", onClick: c, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: r ? "▼" : "▶" }),
      /* @__PURE__ */ t(He, { kind: "worker" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "worker" }),
      /* @__PURE__ */ f("span", { className: "block-signature", title: `${e.name} (${l} types)`, children: [
        e.name,
        " (",
        l,
        " types)"
      ] }),
      !r && (() => {
        const v = yn(e);
        return v ? /* @__PURE__ */ t("span", { className: "block-summary", children: v }) : null;
      })()
    ] }),
    r && /* @__PURE__ */ f("div", { className: "block-body", children: [
      ((g = e.workflows) == null ? void 0 : g.length) > 0 && /* @__PURE__ */ t(dn, { label: "workflows", refs: e.workflows, refType: "workflow" }),
      ((p = e.activities) == null ? void 0 : p.length) > 0 && /* @__PURE__ */ t(dn, { label: "activities", refs: e.activities, refType: "activity" }),
      ((y = e.services) == null ? void 0 : y.length) > 0 && /* @__PURE__ */ t(dn, { label: "nexus services", refs: e.services, refType: "service" })
    ] })
  ] });
}
function dn({ label: e, refs: n, refType: s }) {
  return /* @__PURE__ */ f("div", { className: "worker-ref-section", children: [
    /* @__PURE__ */ t("div", { className: "worker-ref-label", children: e }),
    n.map((o) => /* @__PURE__ */ t(Us, { ref_: o, refType: s }, `${o.line}:${o.column}`))
  ] });
}
function Us({ ref_: e, refType: n }) {
  const s = m.useContext(Ke), o = n === "workflow" ? s.workflows.get(e.name) : n === "activity" ? s.activities.get(e.name) : void 0, a = n === "service" ? s.nexusServices.get(e.name) : void 0, r = !!(o || a), [c, l] = ue(!1, r), i = n === "service" ? "nexusService" : n;
  return /* @__PURE__ */ f("div", { className: `worker-ref worker-ref-${n} ${c ? "expanded" : "collapsed"} ${r ? "" : "worker-ref-unresolved"}`, children: [
    /* @__PURE__ */ f("div", { className: "worker-ref-header", onClick: l, children: [
      r ? /* @__PURE__ */ t("span", { className: "block-toggle", children: c ? "▼" : "▶" }) : /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ t(He, { kind: i }),
      /* @__PURE__ */ t("span", { className: "worker-ref-name", children: e.name }),
      !r && /* @__PURE__ */ t("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    c && r && /* @__PURE__ */ t("div", { className: "block-body", children: (o == null ? void 0 : o.type) === "workflowDef" ? /* @__PURE__ */ t(On, { def: o }) : o ? /* @__PURE__ */ t(it, { statements: o.body || [] }) : a ? (a.operations || []).map((d) => /* @__PURE__ */ t(Gt, { operation: d }, `${d.line}:${d.column}`)) : null })
  ] });
}
function Ys({ def: e, controlledExpanded: n, onToggle: s }) {
  var i, d, h, g;
  const [o, a] = ue(), r = n ?? o, c = s ?? a, l = (((i = e.workers) == null ? void 0 : i.length) || 0) + (((d = e.endpoints) == null ? void 0 : d.length) || 0);
  return /* @__PURE__ */ f("div", { className: `block block-namespace-def ${r ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ t(tn, { defName: e.name, defType: "namespaceDef" }),
    /* @__PURE__ */ f("div", { className: "block-header", onClick: c, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: r ? "▼" : "▶" }),
      /* @__PURE__ */ t(He, { kind: "namespace" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "namespace" }),
      /* @__PURE__ */ f("span", { className: "block-signature", title: `${e.name} (${l} entries)`, children: [
        e.name,
        " (",
        l,
        " entries)"
      ] }),
      !r && (() => {
        const p = yn(e);
        return p ? /* @__PURE__ */ t("span", { className: "block-summary", children: p }) : null;
      })()
    ] }),
    r && /* @__PURE__ */ f("div", { className: "block-body", children: [
      ((h = e.workers) == null ? void 0 : h.length) > 0 && /* @__PURE__ */ f("div", { className: "namespace-entry-section", children: [
        /* @__PURE__ */ t("div", { className: "namespace-entry-label", children: "workers" }),
        e.workers.map((p) => /* @__PURE__ */ t(Ks, { entry: p }, `${p.line}:${p.column}`))
      ] }),
      ((g = e.endpoints) == null ? void 0 : g.length) > 0 && /* @__PURE__ */ f("div", { className: "namespace-entry-section", children: [
        /* @__PURE__ */ t("div", { className: "namespace-entry-label", children: "nexus endpoints" }),
        e.endpoints.map((p) => /* @__PURE__ */ t(js, { entry: p }, `${p.line}:${p.column}`))
      ] })
    ] })
  ] });
}
function Ks({ entry: e }) {
  var i, d, h, g, p;
  const s = m.useContext(Ke).workers.get(e.workerName), o = !!s, a = !!((d = (i = e.options) == null ? void 0 : i.entries) != null && d.length), r = o || a, [c, l] = ue(!1, r);
  return /* @__PURE__ */ f("div", { className: `namespace-entry namespace-entry-worker ${c ? "expanded" : "collapsed"} ${o ? "" : "namespace-entry-unresolved"}`, children: [
    /* @__PURE__ */ f("div", { className: "namespace-entry-header", onClick: l, children: [
      r ? /* @__PURE__ */ t("span", { className: "block-toggle", children: c ? "▼" : "▶" }) : /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ t(He, { kind: "worker" }),
      /* @__PURE__ */ t("span", { className: "namespace-entry-name", children: e.workerName }),
      !o && /* @__PURE__ */ t("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    c && r && /* @__PURE__ */ f("div", { className: "block-body", children: [
      /* @__PURE__ */ t(pn, { options: e.options }),
      o && s && /* @__PURE__ */ f(Ge, { children: [
        ((h = s.workflows) == null ? void 0 : h.length) > 0 && /* @__PURE__ */ t(dn, { label: "workflows", refs: s.workflows, refType: "workflow" }),
        ((g = s.activities) == null ? void 0 : g.length) > 0 && /* @__PURE__ */ t(dn, { label: "activities", refs: s.activities, refType: "activity" }),
        ((p = s.services) == null ? void 0 : p.length) > 0 && /* @__PURE__ */ t(dn, { label: "nexus services", refs: s.services, refType: "service" })
      ] })
    ] })
  ] });
}
function js({ entry: e }) {
  var a, r;
  const n = !!((r = (a = e.options) == null ? void 0 : a.entries) != null && r.length), [s, o] = ue(!1, n);
  return /* @__PURE__ */ f("div", { className: `namespace-entry namespace-entry-endpoint ${s ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ f("div", { className: "namespace-entry-header", onClick: n ? o : void 0, children: [
      n ? /* @__PURE__ */ t("span", { className: "block-toggle", children: s ? "▼" : "▶" }) : /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ t(He, { kind: "nexusEndpoint" }),
      /* @__PURE__ */ t("span", { className: "namespace-entry-name", children: e.endpointName })
    ] }),
    s && n && /* @__PURE__ */ t("div", { className: "block-body", children: /* @__PURE__ */ t(pn, { options: e.options }) })
  ] });
}
function yn(e) {
  var s, o, a, r, c, l, i, d, h, g;
  const n = [];
  if (e.type === "workflowDef") {
    const p = ((s = e.body) == null ? void 0 : s.length) || 0, y = (e.body || []).filter(
      (k) => k.type === "activityCall" || k.type === "workflowCall" || k.type === "nexusCall"
    ).length, v = (((o = e.signals) == null ? void 0 : o.length) || 0) + (((a = e.queries) == null ? void 0 : a.length) || 0) + (((r = e.updates) == null ? void 0 : r.length) || 0);
    p > 0 && n.push(`${p} step${p !== 1 ? "s" : ""}`), y > 0 && n.push(`${y} call${y !== 1 ? "s" : ""}`), v > 0 && n.push(`${v} handler${v !== 1 ? "s" : ""}`);
  } else if (e.type === "activityDef") {
    const p = ((c = e.body) == null ? void 0 : c.length) || 0;
    p > 0 && n.push(`${p} step${p !== 1 ? "s" : ""}`);
  } else if (e.type === "workerDef") {
    const p = ((l = e.workflows) == null ? void 0 : l.length) || 0, y = ((i = e.activities) == null ? void 0 : i.length) || 0, v = ((d = e.services) == null ? void 0 : d.length) || 0;
    p > 0 && n.push(`${p} workflow${p !== 1 ? "s" : ""}`), y > 0 && n.push(`${y} activit${y !== 1 ? "ies" : "y"}`), v > 0 && n.push(`${v} service${v !== 1 ? "s" : ""}`);
  } else if (e.type === "namespaceDef") {
    const p = ((h = e.workers) == null ? void 0 : h.length) || 0, y = ((g = e.endpoints) == null ? void 0 : g.length) || 0;
    p > 0 && n.push(`${p} worker${p !== 1 ? "s" : ""}`), y > 0 && n.push(`${y} endpoint${y !== 1 ? "s" : ""}`);
  } else if (e.type === "nexusServiceDef") {
    const p = (e.operations || []).filter((v) => v.opType === "async").length, y = (e.operations || []).filter((v) => v.opType === "sync").length;
    p > 0 && n.push(`${p} async`), y > 0 && n.push(`${y} sync`);
  }
  return n.join(" · ");
}
function Zs(e) {
  let n = `${e.name}(${e.params})`;
  return e.returnType && (n += ` → ${e.returnType}`), n;
}
function Js({ def: e, controlledExpanded: n, onToggle: s }) {
  var i;
  const [o, a] = ue(), r = n ?? o, c = s ?? a, l = ((i = e.operations) == null ? void 0 : i.length) || 0;
  return /* @__PURE__ */ f("div", { className: `block block-nexus-service-def ${r ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ t(tn, { defName: e.name, defType: "nexusServiceDef" }),
    /* @__PURE__ */ f("div", { className: "block-header", onClick: c, children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: r ? "▼" : "▶" }),
      /* @__PURE__ */ t(He, { kind: "nexusService" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: "service" }),
      /* @__PURE__ */ f("span", { className: "block-signature", title: `${e.name} (${l} operation${l !== 1 ? "s" : ""})`, children: [
        e.name,
        " (",
        l,
        " operation",
        l !== 1 ? "s" : "",
        ")"
      ] }),
      !r && (() => {
        const d = yn(e);
        return d ? /* @__PURE__ */ t("span", { className: "block-summary", children: d }) : null;
      })()
    ] }),
    r && /* @__PURE__ */ t("div", { className: "block-body", children: (e.operations || []).map((d) => /* @__PURE__ */ t(Gt, { operation: d }, `${d.line}:${d.column}`)) })
  ] });
}
function Gt({ operation: e }) {
  const n = m.useContext(Ke), s = e.opType === "async" && e.workflowName ? n.workflows.get(e.workflowName) : void 0, o = e.opType === "async" ? !!s : !!(e.body && e.body.length > 0), a = e.opType === "async" && e.workflowName && !s, [r, c] = ue(!1, o);
  let l;
  if (e.opType === "async" && s)
    l = /* @__PURE__ */ f(Ge, { children: [
      e.name,
      /* @__PURE__ */ f("span", { className: "nexus-operation-grayed-sig", children: [
        "(",
        s.params,
        ")",
        s.returnType ? ` → ${s.returnType}` : ""
      ] })
    ] });
  else if (e.opType === "sync") {
    const i = e.params || "", d = e.returnType ? ` → ${e.returnType}` : "";
    l = `${e.name}(${i})${d}`;
  } else
    l = e.name;
  return /* @__PURE__ */ f("div", { className: `block block-nexus-operation nexus-operation-${e.opType} ${r ? "expanded" : "collapsed"} ${a ? "block-unresolved" : ""}`, children: [
    /* @__PURE__ */ f("div", { className: "block-header", onClick: c, children: [
      o ? /* @__PURE__ */ t("span", { className: "block-toggle", children: r ? "▼" : "▶" }) : /* @__PURE__ */ t("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ t(He, { kind: "nexusOperation" }),
      /* @__PURE__ */ t("span", { className: "block-keyword", children: e.opType }),
      /* @__PURE__ */ t("span", { className: "block-signature", children: l }),
      a && /* @__PURE__ */ t("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    r && o && /* @__PURE__ */ t("div", { className: "block-body", children: e.opType === "async" && s ? /* @__PURE__ */ t(ot, { def: s }) : e.body ? /* @__PURE__ */ t(at, { body: e.body }) : null })
  ] });
}
function Qs(e) {
  let n = `${e.name}(${e.params})`;
  return e.returnType && (n += ` → ${e.returnType}`), n;
}
function ft({ pinned: e, onClick: n, flashing: s, label: o }) {
  const a = e ? `${o} filter pinned — click to unpin` : `${o} filter unpinned — click to pin and stop syncing with the other view`, r = [
    "pin-toggle",
    e ? "pinned" : "",
    s ? "flashing" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ t(
    "button",
    {
      className: r,
      onClick: n,
      title: a,
      "aria-label": a,
      "aria-pressed": e,
      children: e ? /* @__PURE__ */ t(eo, {}) : /* @__PURE__ */ t(no, {})
    }
  );
}
function eo() {
  return /* @__PURE__ */ f("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ t("rect", { x: "3", y: "7", width: "10", height: "7", rx: "1.5" }),
    /* @__PURE__ */ t("path", { d: "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" })
  ] });
}
function no() {
  return /* @__PURE__ */ f("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ t("rect", { x: "3", y: "7", width: "10", height: "7", rx: "1.5" }),
    /* @__PURE__ */ t("path", { d: "M5.5 7V5a2.5 2.5 0 0 1 4.9-.6" })
  ] });
}
function Ht({
  ast: e,
  allFiles: n,
  filter: s,
  onFilterChange: o,
  pins: a,
  onPinsChange: r,
  overriddenPins: c,
  recentlyChanged: l,
  searchQuery: i,
  searchActive: d,
  onSearchChange: h,
  searchInputRef: g,
  searchTitle: p,
  searchPlaceholder: y,
  searchExtra: v,
  hiddenMatchByType: k,
  hiddenMatchByFile: A,
  errors: P,
  diagnostics: $,
  refreshFlash: D
}) {
  const M = s.selectedFiles, b = s.visibleTypes, C = M.size === 0, F = n.length > 0, { typeCounts: w, fileCounts: R } = m.useMemo(() => {
    const T = /* @__PURE__ */ new Map(), z = /* @__PURE__ */ new Map();
    for (const X of e.definitions)
      X.sourceFile && z.set(X.sourceFile, (z.get(X.sourceFile) ?? 0) + 1), (M.size === 0 || !X.sourceFile || M.has(X.sourceFile)) && T.set(X.type, (T.get(X.type) ?? 0) + 1);
    return { typeCounts: T, fileCounts: z };
  }, [e.definitions, M]), V = (T) => {
    const z = new Set(M);
    z.has(T) ? z.delete(T) : z.add(T), o({ ...s, selectedFiles: z });
  }, re = (T) => {
    const z = T.some((pe) => b.has(pe)), X = new Set(b);
    if (z) for (const pe of T) X.delete(pe);
    else for (const pe of T) X.add(pe);
    o({ ...s, visibleTypes: X });
  }, j = () => r({ ...a, files: !a.files }), ne = () => r({ ...a, types: !a.types }), ie = () => {
    d ? h("", !1) : (h(i, !0), setTimeout(() => {
      var T;
      return (T = g.current) == null ? void 0 : T.focus();
    }, 50));
  };
  return /* @__PURE__ */ f("div", { className: `canvas-header${D ? " refresh-flash" : ""}`, children: [
    F && /* @__PURE__ */ f(Ge, { children: [
      /* @__PURE__ */ f("div", { className: `header-files-section${a.files ? " section-pinned" : ""}`, children: [
        /* @__PURE__ */ t("div", { className: "header-files-row", children: n.map((T) => {
          const z = T.split("/").pop() || T, X = M.has(T), pe = l.has(`file:${T}`), Ee = (A == null ? void 0 : A.get(T)) ?? 0, Ce = R.get(T) ?? 0, Ne = [
            "header-file-tag",
            C ? "all-included" : X ? "selected" : "",
            pe ? "recently-changed" : ""
          ].filter(Boolean).join(" ");
          return /* @__PURE__ */ f("button", { className: Ne, onClick: () => V(T), title: T, children: [
            /* @__PURE__ */ t("span", { className: "header-file-icon", children: "📄" }),
            /* @__PURE__ */ t("span", { className: "header-file-name", children: z }),
            /* @__PURE__ */ t("span", { className: "header-chip-count", children: Ce }),
            Ee > 0 && /* @__PURE__ */ t("span", { className: "header-hidden-badge", title: `${Ee} match${Ee !== 1 ? "es" : ""} hidden in this file`, children: Ee })
          ] }, T);
        }) }),
        /* @__PURE__ */ t(
          ft,
          {
            pinned: a.files,
            onClick: j,
            flashing: c.has("files"),
            label: "Files"
          }
        )
      ] }),
      /* @__PURE__ */ t("div", { className: "header-divider" })
    ] }),
    /* @__PURE__ */ f("div", { className: `header-types-section${a.types ? " section-pinned" : ""}`, children: [
      /* @__PURE__ */ t("div", { className: "header-types-row", children: ms.map((T) => {
        const z = T.types.some((Ne) => b.has(Ne)), X = T.types.some((Ne) => l.has(`type:${Ne}`)), pe = T.types.reduce((Ne, Ie) => Ne + ((k == null ? void 0 : k.get(Ie)) ?? 0), 0), Ee = T.types.reduce((Ne, Ie) => Ne + (w.get(Ie) ?? 0), 0), Ce = [
          "header-type-tag",
          z ? "active" : "",
          `header-type-${T.id}`,
          X ? "recently-changed" : ""
        ].filter(Boolean).join(" ");
        return /* @__PURE__ */ f(
          "button",
          {
            className: Ce,
            onClick: () => re(T.types),
            title: z ? `Hide ${T.label.toLowerCase()}` : `Show ${T.label.toLowerCase()}`,
            children: [
              /* @__PURE__ */ t("span", { className: "header-type-icon", children: T.icon }),
              /* @__PURE__ */ t("span", { className: "header-type-label", children: T.label }),
              /* @__PURE__ */ t("span", { className: "header-chip-count", children: Ee }),
              pe > 0 && /* @__PURE__ */ t("span", { className: "header-hidden-badge", title: `${pe} match${pe !== 1 ? "es" : ""} hidden by this filter`, children: pe })
            ]
          },
          T.id
        );
      }) }),
      /* @__PURE__ */ t(
        ft,
        {
          pinned: a.types,
          onClick: ne,
          flashing: c.has("types"),
          label: "Types"
        }
      )
    ] }),
    /* @__PURE__ */ t("div", { className: "header-divider" }),
    /* @__PURE__ */ t("div", { className: "header-controls-section", children: /* @__PURE__ */ f("div", { className: `header-search ${d ? "active" : ""}`, children: [
      /* @__PURE__ */ t("button", { className: "header-search-toggle", onClick: ie, title: p, children: /* @__PURE__ */ t(cs, { size: 14 }) }),
      d && /* @__PURE__ */ t(
        "input",
        {
          ref: g,
          className: "header-search-input",
          type: "text",
          placeholder: y,
          value: i,
          onChange: (T) => h(T.target.value, !0),
          onKeyDown: (T) => {
            T.key === "Escape" && ie();
          }
        }
      ),
      v
    ] }) }),
    /* @__PURE__ */ t(so, { errors: P, diagnostics: $, selectedFiles: M })
  ] });
}
function to(e, n, s) {
  if (s.size === 0)
    return { shownFileErrors: e, hiddenFileErrors: [], shownDiagnostics: n, hiddenDiagnostics: [] };
  const o = [], a = [];
  for (const l of e)
    s.has(l.file) ? o.push(l) : a.push(l);
  const r = [], c = [];
  for (const l of n)
    !l.file || s.has(l.file) ? r.push(l) : c.push(l);
  return { shownFileErrors: o, hiddenFileErrors: a, shownDiagnostics: r, hiddenDiagnostics: c };
}
function so({ errors: e, diagnostics: n, selectedFiles: s }) {
  const { shownFileErrors: o, hiddenFileErrors: a, shownDiagnostics: r, hiddenDiagnostics: c } = to(e, n, s), l = r.filter((y) => y.severity === "error"), i = c.filter((y) => y.severity === "error"), d = r.filter((y) => y.severity === "warning"), h = c.filter((y) => y.severity === "warning"), g = o.length + a.length + l.length + i.length, p = d.length + h.length;
  return g === 0 && p === 0 ? null : /* @__PURE__ */ f("div", { className: "filter-error-bars", children: [
    g > 0 && /* @__PURE__ */ t(
      mt,
      {
        severity: "error",
        count: g,
        shownFileErrors: o,
        hiddenFileErrors: a,
        shownDiagnostics: l,
        hiddenDiagnostics: i
      }
    ),
    p > 0 && /* @__PURE__ */ t(
      mt,
      {
        severity: "warning",
        count: p,
        shownFileErrors: [],
        hiddenFileErrors: [],
        shownDiagnostics: d,
        hiddenDiagnostics: h
      }
    )
  ] });
}
function mt({ severity: e, count: n, shownFileErrors: s, hiddenFileErrors: o, shownDiagnostics: a, hiddenDiagnostics: r }) {
  const [c, l] = m.useState(!1), i = e === "error" ? "✗" : "⚠", d = e === "error" ? "error" : "warning", h = `${n} ${n === 1 ? d : `${d}s`}`, g = s.length + a.length, p = o.length + r.length, y = g > 0 && p > 0;
  return /* @__PURE__ */ f("div", { className: `severity-bar severity-bar-${e}`, children: [
    /* @__PURE__ */ f("div", { className: "severity-bar-head", onClick: () => l((v) => !v), children: [
      /* @__PURE__ */ t("span", { className: "block-toggle", children: c ? "▼" : "▶" }),
      /* @__PURE__ */ t("span", { className: "severity-bar-icon", children: i }),
      /* @__PURE__ */ t("span", { className: "severity-bar-title", children: h })
    ] }),
    c && /* @__PURE__ */ f("div", { className: "severity-bar-body", children: [
      y && /* @__PURE__ */ f("div", { className: "error-group-label", children: [
        "Shown files (",
        g,
        ")"
      ] }),
      s.map((v, k) => /* @__PURE__ */ t(gt, { err: v }, `sfe${k}`)),
      a.map((v, k) => /* @__PURE__ */ t(yt, { diagnostic: v }, `sd${k}`)),
      p > 0 && /* @__PURE__ */ f(Ge, { children: [
        /* @__PURE__ */ f("div", { className: "error-group-label", children: [
          "Hidden files (",
          p,
          ")"
        ] }),
        o.map((v, k) => /* @__PURE__ */ t(gt, { err: v }, `hfe${k}`)),
        r.map((v, k) => /* @__PURE__ */ t(yt, { diagnostic: v }, `hd${k}`))
      ] })
    ] })
  ] });
}
function gt({ err: e }) {
  return /* @__PURE__ */ f("div", { className: "severity-error-item", children: [
    /* @__PURE__ */ t("span", { className: "severity-error-file", children: e.file.split("/").pop() }),
    /* @__PURE__ */ t("pre", { className: "severity-error-msg", children: e.stderr || e.error })
  ] });
}
function yt({ diagnostic: e }) {
  const n = e.severity === "error" ? "✗" : "⚠", s = e.file ? e.file.split("/").pop() : void 0, o = s ? `${s}:${e.start.line}:${e.start.column}` : void 0;
  return /* @__PURE__ */ f("div", { className: `diagnostic-item severity-${e.severity}`, children: [
    /* @__PURE__ */ t("span", { className: "diagnostic-glyph", "aria-hidden": "true", children: n }),
    /* @__PURE__ */ t("span", { className: "diagnostic-code", children: e.code }),
    /* @__PURE__ */ t("span", { className: "diagnostic-message", children: e.message }),
    o && /* @__PURE__ */ t("span", { className: "diagnostic-location", children: o })
  ] });
}
function oo({
  active: e,
  ast: n,
  onShowInGraph: s,
  filter: o,
  onFilterChange: a,
  pins: r,
  onPinsChange: c,
  searchQuery: l,
  searchActive: i,
  onSearchChange: d,
  pendingFocus: h,
  onFocusConsumed: g,
  overriddenPins: p,
  onOverriddenPinsConsumed: y
}) {
  const v = m.useRef(null), [k, A] = m.useState(-1), P = m.useRef([]), [$, D] = m.useState(/* @__PURE__ */ new Set()), [M, b] = m.useState(null), [C, F] = m.useState(!1), w = m.useRef(n);
  m.useEffect(() => {
    if (w.current !== n && w.current !== null) {
      F(!0);
      const S = setTimeout(() => F(!1), 600);
      return () => clearTimeout(S);
    }
    w.current = n;
  }, [n]);
  const R = m.useRef(o), [V, re] = m.useState(/* @__PURE__ */ new Set());
  m.useEffect(() => {
    const S = R.current;
    if (Rn(S, o)) return;
    const I = /* @__PURE__ */ new Set();
    for (const x of o.selectedFiles) S.selectedFiles.has(x) || I.add(`file:${x}`);
    for (const x of o.visibleTypes) S.visibleTypes.has(x) || I.add(`type:${x}`);
    if (R.current = o, I.size > 0) {
      re(I);
      const x = setTimeout(() => re(/* @__PURE__ */ new Set()), 450);
      return () => clearTimeout(x);
    }
  }, [o]), m.useEffect(() => {
    if (p.size === 0) return;
    const S = setTimeout(y, 600);
    return () => clearTimeout(S);
  }, [p, y]);
  const j = m.useMemo(() => {
    const S = /* @__PURE__ */ new Map(), I = /* @__PURE__ */ new Map(), x = /* @__PURE__ */ new Map();
    function q(_, N) {
      const Z = S.get(_) || [];
      Z.some((ge) => ge.defName === N.defName && ge.defType === N.defType) || (Z.push(N), S.set(_, Z));
    }
    function Y(_, N, Z) {
      const ge = _.get(N) || [];
      ge.includes(Z) || (ge.push(Z), _.set(N, ge));
    }
    function le(_, N) {
      _.activity && q(`activityDef:${_.activity.name}`, { defName: N.name, defType: N.type }), _.workflow && q(`workflowDef:${_.workflow.name}`, { defName: N.name, defType: N.type }), _.nexus && q(`nexusServiceDef:${_.nexus.service}`, { defName: N.name, defType: N.type });
    }
    function ce(_, N) {
      for (const Z of _)
        switch (Z.type) {
          case "activityCall":
            q(`activityDef:${Z.name}`, { defName: N.name, defType: N.type });
            break;
          case "workflowCall":
            q(`workflowDef:${Z.name}`, { defName: N.name, defType: N.type });
            break;
          case "nexusCall":
            q(`nexusServiceDef:${Z.service}`, { defName: N.name, defType: N.type });
            break;
          case "await":
            le(Z.target, N);
            break;
          case "promise":
            le(Z.target, N);
            break;
          case "awaitAll":
            ce(Z.body || [], N);
            break;
          case "awaitOne":
            for (const ge of Z.cases || [])
              ge.target && le(ge.target, N), ge.awaitAll && ce(ge.awaitAll.body || [], N), ce(ge.body || [], N);
            break;
          case "if":
            ce(Z.body || [], N), ce(Z.elseBody || [], N);
            break;
          case "for":
            ce(Z.body || [], N);
            break;
          case "switch":
            for (const ge of Z.cases || []) ce(ge.body || [], N);
            Z.default && ce(Z.default, N);
            break;
        }
    }
    for (const _ of n.definitions) {
      if (_.type === "workflowDef") {
        ce(_.body || [], _);
        for (const N of _.signals || []) ce(N.body || [], _);
        for (const N of _.queries || []) ce(N.body || [], _);
        for (const N of _.updates || []) ce(N.body || [], _);
      } else if (_.type === "activityDef")
        ce(_.body || [], _);
      else if (_.type === "nexusServiceDef")
        for (const N of _.operations || [])
          N.opType === "async" && N.workflowName && q(`workflowDef:${N.workflowName}`, { defName: _.name, defType: _.type }), N.body && ce(N.body, _);
      if (_.type === "workerDef") {
        for (const N of _.workflows || []) Y(I, `workflowDef:${N.name}`, _.name);
        for (const N of _.activities || []) Y(I, `activityDef:${N.name}`, _.name);
        for (const N of _.services || []) Y(I, `nexusServiceDef:${N.name}`, _.name);
      }
      if (_.type === "namespaceDef")
        for (const N of _.workers || []) Y(x, `workerDef:${N.workerName}`, _.name);
    }
    return { callers: S, workerOf: I, namespaceOf: x };
  }, [n]), ne = m.useMemo(() => {
    const S = /* @__PURE__ */ new Set();
    for (const I of n.definitions)
      I.sourceFile && S.add(I.sourceFile);
    return Array.from(S).sort();
  }, [n]), ie = m.useCallback(() => {
    i ? d("", !1) : (d(l, !0), setTimeout(() => {
      var S;
      return (S = v.current) == null ? void 0 : S.focus();
    }, 50));
  }, [i, l, d]), T = m.useMemo(() => {
    const S = n.definitions.filter((I) => !(!o.visibleTypes.has(I.type) || o.selectedFiles.size > 0 && I.sourceFile && !o.selectedFiles.has(I.sourceFile)));
    return S.sort((I, x) => {
      const q = pt.get(I.type) ?? 999, Y = pt.get(x.type) ?? 999;
      return q - Y;
    }), S;
  }, [n.definitions, o]), { matchSet: z, matchIndices: X, hiddenMatchByType: pe, hiddenMatchByFile: Ee } = m.useMemo(() => {
    if (!l)
      return {
        matchSet: null,
        matchIndices: [],
        hiddenMatchByType: /* @__PURE__ */ new Map(),
        hiddenMatchByFile: /* @__PURE__ */ new Map()
      };
    const S = l.toLowerCase(), I = /* @__PURE__ */ new Set(), x = [];
    T.forEach((le, ce) => {
      le.name.toLowerCase().includes(S) && (I.add(De(le)), x.push(ce));
    });
    const q = /* @__PURE__ */ new Map(), Y = /* @__PURE__ */ new Map();
    for (const le of n.definitions) {
      if (!le.name.toLowerCase().includes(S)) continue;
      const ce = o.visibleTypes.has(le.type), _ = o.selectedFiles.size === 0 || (le.sourceFile ? o.selectedFiles.has(le.sourceFile) : !0);
      ce ? !_ && le.sourceFile && Y.set(le.sourceFile, (Y.get(le.sourceFile) ?? 0) + 1) : q.set(le.type, (q.get(le.type) ?? 0) + 1);
    }
    return { matchSet: I, matchIndices: x, hiddenMatchByType: q, hiddenMatchByFile: Y };
  }, [l, T, n.definitions, o]), Ce = n.errors || [], Ne = n.diagnostics || [], Ie = Ce.length > 0 || Ne.length > 0;
  m.useEffect(() => {
    if (!e) return;
    const S = (I) => {
      var x;
      I.target instanceof HTMLInputElement || I.target instanceof HTMLTextAreaElement || (I.key === "/" || I.ctrlKey && I.key === "f") && (I.preventDefault(), i ? (x = v.current) == null || x.focus() : (d(l, !0), setTimeout(() => {
        var q;
        return (q = v.current) == null ? void 0 : q.focus();
      }, 50)));
    };
    return window.addEventListener("keydown", S), () => window.removeEventListener("keydown", S);
  }, [e, i, l, d]), m.useEffect(() => {
    P.current = P.current.slice(0, T.length);
  }, [T.length]);
  function De(S) {
    return `${S.type}:${S.name}:${S.sourceFile ?? ""}`;
  }
  m.useEffect(() => {
    const S = new Set(n.definitions.map(De));
    D((I) => {
      const x = new Set([...I].filter((q) => S.has(q)));
      return x.size === I.size ? I : x;
    });
  }, [n.definitions]);
  const H = m.useCallback((S) => {
    D((I) => {
      const x = new Set(I);
      return x.has(S) ? x.delete(S) : x.add(S), x;
    });
  }, []), E = m.useCallback((S, I) => {
    const x = T.findIndex((Y) => Y.name === S && Y.type === I);
    if (x === -1) return;
    const q = De(T[x]);
    D((Y) => new Set(Y).add(q)), A(x), setTimeout(() => {
      var Y, le;
      (Y = P.current[x]) == null || Y.scrollIntoView({ behavior: "smooth", block: "nearest" }), (le = P.current[x]) == null || le.focus();
    }, 50), b(q), setTimeout(() => b(null), 1e3);
  }, [T]), u = m.useMemo(() => ({
    ...j,
    navigateTo: E,
    showInGraph: s
  }), [j, E, s]);
  m.useEffect(() => {
    if (!h) return;
    const { name: S, defType: I } = h, x = setTimeout(() => {
      E(S, I), g();
    }, 50);
    return () => clearTimeout(x);
  }, [h, E, g]);
  const W = m.useCallback((S) => {
    var x, q, Y, le, ce, _;
    const I = T.length;
    if (I !== 0)
      switch (S.key) {
        case "ArrowDown": {
          S.preventDefault();
          const N = k < I - 1 ? k + 1 : k;
          A(N), (x = P.current[N]) == null || x.focus();
          break;
        }
        case "ArrowUp": {
          S.preventDefault();
          const N = k > 0 ? k - 1 : 0;
          A(N), (q = P.current[N]) == null || q.focus();
          break;
        }
        case "ArrowRight": {
          if (S.preventDefault(), k >= 0 && k < I) {
            const N = De(T[k]);
            $.has(N) || D((Z) => new Set(Z).add(N));
          }
          break;
        }
        case "ArrowLeft": {
          if (S.preventDefault(), k >= 0 && k < I) {
            const N = De(T[k]);
            $.has(N) && D((Z) => {
              const ge = new Set(Z);
              return ge.delete(N), ge;
            });
          }
          break;
        }
        case "Enter": {
          S.preventDefault(), k >= 0 && k < I && H(De(T[k]));
          break;
        }
        case "Home": {
          S.preventDefault(), A(0), (Y = P.current[0]) == null || Y.focus();
          break;
        }
        case "End": {
          S.preventDefault();
          const N = I - 1;
          A(N), (le = P.current[N]) == null || le.focus();
          break;
        }
        case "n":
        case "N": {
          if (X.length === 0) break;
          S.preventDefault();
          const N = S.key === "n", Z = ao(X, k, N);
          A(Z), (ce = P.current[Z]) == null || ce.scrollIntoView({ behavior: "smooth", block: "nearest" }), (_ = P.current[Z]) == null || _.focus();
          break;
        }
        case "Escape": {
          S.preventDefault(), i && ie();
          break;
        }
      }
  }, [T, k, $, i, ie, H, X]), U = m.useMemo(() => {
    if (!z || X.length === 0 || k < 0) return null;
    const S = T[k];
    if (!S || !z.has(De(S))) return null;
    const I = X.indexOf(k);
    return I >= 0 ? I + 1 : null;
  }, [z, X, k, T]), B = i && l ? X.length > 0 ? /* @__PURE__ */ t("span", { className: "header-search-counter", title: "Press n/N to jump between matches", children: U !== null ? `${U} of ${X.length}` : `${X.length} match${X.length !== 1 ? "es" : ""}` }) : /* @__PURE__ */ t("span", { className: "header-search-counter empty", children: "no matches" }) : null;
  return /* @__PURE__ */ t(ss.Provider, { value: u, children: /* @__PURE__ */ f("div", { className: "workflow-canvas", children: [
    /* @__PURE__ */ t(
      Ht,
      {
        ast: n,
        allFiles: ne,
        filter: o,
        onFilterChange: a,
        pins: r,
        onPinsChange: c,
        overriddenPins: p,
        recentlyChanged: V,
        searchQuery: l,
        searchActive: i,
        onSearchChange: d,
        searchInputRef: v,
        searchTitle: "Search definitions",
        searchPlaceholder: "Filter by name...",
        searchExtra: B,
        hiddenMatchByType: pe,
        hiddenMatchByFile: Ee,
        errors: Ce,
        diagnostics: Ne,
        refreshFlash: C
      }
    ),
    /* @__PURE__ */ t("div", { className: "workflow-canvas-content", children: T.length === 0 && !Ie ? /* @__PURE__ */ f("div", { className: "no-workflows", children: [
      /* @__PURE__ */ t("p", { children: "No definitions match the current filters." }),
      /* @__PURE__ */ t("p", { className: "no-workflows-hint", children: "Try adjusting the type toggles or file filter above." })
    ] }) : T.length === 0 && Ie ? null : /* @__PURE__ */ t("div", { role: "tree", "aria-label": "Definition list", onKeyDown: W, children: T.map((S, I) => {
      const x = De(S), q = $.has(x), Y = z !== null && !z.has(x), le = [
        M === x ? "flash-target" : "",
        Y ? "search-dimmed" : ""
      ].filter(Boolean).join(" ");
      return /* @__PURE__ */ t(
        "div",
        {
          role: "treeitem",
          "aria-expanded": q,
          "aria-level": 1,
          tabIndex: I === k ? 0 : -1,
          ref: (ce) => {
            P.current[I] = ce;
          },
          onFocus: () => A(I),
          className: le || void 0,
          children: /* @__PURE__ */ t(Hs, { definition: S, expanded: q, onToggle: () => H(x) })
        },
        x
      );
    }) }) })
  ] }) });
}
function ao(e, n, s) {
  if (e.length === 0) return n;
  if (s) {
    for (const o of e)
      if (o > n) return o;
    return e[0];
  } else {
    for (let o = e.length - 1; o >= 0; o--)
      if (e[o] < n) return e[o];
    return e[e.length - 1];
  }
}
const io = Object.fromEntries(
  Oe.map((e) => [e, ke[e].defType])
), co = Object.fromEntries(
  Oe.map((e) => [ke[e].defType, e])
);
function mn(e) {
  return io[e] ?? "workflowDef";
}
function ro(e) {
  return co[e] ?? "workflow";
}
const lo = { x: 0, y: 0, scale: 1 }, uo = 0.1, po = 40;
function Pe(e, n, s) {
  return [n * e.scale + e.x, s * e.scale + e.y];
}
function Vn(e, n, s) {
  return [(n - e.x) / e.scale, (s - e.y) / e.scale];
}
function Yn(e, n, s, o) {
  const a = Math.max(uo, Math.min(po, e.scale * o)), r = (n - e.x) / e.scale, c = (s - e.y) / e.scale;
  return {
    scale: a,
    x: n - r * a,
    y: s - c * a
  };
}
function ct(e, n, s, o = 60) {
  if (e.length === 0) return { x: n / 2, y: s / 2, scale: 1 };
  let a = 1 / 0, r = -1 / 0, c = 1 / 0, l = -1 / 0;
  for (const k of e)
    k.x < a && (a = k.x), k.x > r && (r = k.x), k.y < c && (c = k.y), k.y > l && (l = k.y);
  const i = r - a || 1, d = l - c || 1, h = n - o * 2, g = s - o * 2, p = Math.min(h / i, g / d, 2), y = (a + r) / 2, v = (c + l) / 2;
  return {
    scale: p,
    x: n / 2 - y * p,
    y: s / 2 - v * p
  };
}
const Dn = [
  {
    id: "linkNsToNs",
    label: "NS↔NS",
    sourceType: "namespace",
    targetType: "namespace",
    category: "dependency",
    directional: !1,
    physics: { strength: 0.25, distance: 870 },
    tooltip: "Namespace ↔ Namespace dependency"
  },
  {
    id: "linkNsToWorker",
    label: "NS↔Wk",
    sourceType: "namespace",
    targetType: "worker",
    category: "containment",
    directional: !1,
    physics: { strength: 0.3, distance: 800 },
    tooltip: "Namespace ↔ Worker containment"
  },
  {
    id: "linkWorkerToWorker",
    label: "Wk↔Wk",
    sourceType: "worker",
    targetType: "worker",
    category: "dependency",
    directional: !1,
    physics: { strength: 0.3, distance: 720 },
    tooltip: "Worker ↔ Worker dependency"
  },
  {
    id: "linkWorkerToWorkflow",
    label: "Wk↔Wf",
    sourceType: "worker",
    targetType: "workflow",
    category: "containment",
    directional: !1,
    physics: { strength: 0.55, distance: 190 },
    tooltip: "Worker ↔ Workflow containment"
  },
  {
    id: "linkWorkerToActivity",
    label: "Wk↔Act",
    sourceType: "worker",
    targetType: "activity",
    category: "containment",
    directional: !1,
    physics: { strength: 0.35, distance: 210 },
    tooltip: "Worker ↔ Activity containment"
  },
  {
    id: "linkWorkerToNexus",
    label: "Wk↔Nx",
    sourceType: "worker",
    targetType: "nexusService",
    category: "containment",
    directional: !1,
    physics: { strength: 1.25, distance: 430 },
    tooltip: "Worker ↔ Nexus service containment"
  },
  {
    id: "linkNexusToOperation",
    label: "Nx↔Op",
    sourceType: "nexusService",
    targetType: "nexusOperation",
    category: "containment",
    directional: !1,
    physics: { strength: 1.4, distance: 600 },
    tooltip: "Nexus service ↔ Nexus operation containment"
  },
  {
    id: "linkEndpointToNamespace",
    label: "Ep↔NS",
    sourceType: "nexusEndpoint",
    targetType: "namespace",
    category: "containment",
    directional: !1,
    physics: { strength: 1, distance: 690 },
    tooltip: "Nexus endpoint ↔ Namespace containment"
  },
  {
    id: "linkWorkflowToWorkflow",
    label: "Wf↔Wf",
    sourceType: "workflow",
    targetType: "workflow",
    category: "dependency",
    directional: !1,
    physics: { strength: 0.5, distance: 420 },
    tooltip: "Workflow ↔ Workflow dependency"
  },
  {
    id: "linkWorkflowToActivity",
    label: "Wf↔Act",
    sourceType: "workflow",
    targetType: "activity",
    category: "dependency",
    directional: !1,
    physics: { strength: 1.9, distance: 40 },
    tooltip: "Workflow ↔ Activity dependency"
  },
  {
    id: "linkWorkflowToOperation",
    label: "Wf→Op",
    sourceType: "workflow",
    targetType: "nexusOperation",
    category: "dependency",
    directional: !0,
    physics: { strength: 1.5, distance: 330 },
    tooltip: "Workflow → Nexus operation (the nexus call)"
  },
  {
    id: "linkOperationToWorkflow",
    label: "Op→Wf",
    sourceType: "nexusOperation",
    targetType: "workflow",
    category: "dependency",
    directional: !0,
    physics: { strength: 1.55, distance: 360 },
    tooltip: "Nexus operation → Workflow (backing workflow / sync-op call)"
  },
  {
    id: "linkOperationToActivity",
    label: "Op↔Act",
    sourceType: "nexusOperation",
    targetType: "activity",
    category: "dependency",
    directional: !1,
    physics: { strength: 1.4, distance: 300 },
    tooltip: "Nexus operation ↔ Activity dependency (sync-op body call)"
  },
  {
    id: "linkEndpointToOperation",
    label: "Ep↔Op",
    sourceType: "nexusEndpoint",
    targetType: "nexusOperation",
    category: "containment",
    directional: !1,
    physics: { strength: 1.5, distance: 470 },
    tooltip: "Nexus endpoint ↔ Nexus operation (the endpoint fronts the operation)"
  }
], ho = Object.fromEntries(
  Dn.map((e) => [e.id, e])
);
function fo(e) {
  const n = e.sourceNodeType, s = e.targetNodeType, o = (r, c) => n === r && s === c || n === c && s === r;
  let a;
  return e.edgeType === "containment" ? o("nexusOperation", "nexusEndpoint") ? a = "linkEndpointToOperation" : o("nexusOperation", "nexusService") ? a = "linkNexusToOperation" : o("worker", "nexusService") ? a = "linkWorkerToNexus" : o("nexusEndpoint", "namespace") ? a = "linkEndpointToNamespace" : n === "workflow" || s === "workflow" ? a = "linkWorkerToWorkflow" : n === "activity" || s === "activity" ? a = "linkWorkerToActivity" : a = "linkNsToWorker" : n === "namespace" || s === "namespace" ? a = "linkNsToNs" : n === "worker" || s === "worker" ? a = "linkWorkerToWorker" : n === "workflow" && s === "nexusOperation" ? a = "linkWorkflowToOperation" : n === "nexusOperation" && s === "workflow" ? a = "linkOperationToWorkflow" : o("nexusOperation", "nexusOperation") ? a = "linkWorkflowToOperation" : o("nexusOperation", "activity") ? a = "linkOperationToActivity" : o("workflow", "workflow") ? a = "linkWorkflowToWorkflow" : a = "linkWorkflowToActivity", ho[a];
}
function Kn(e, n) {
  return e.charge[n];
}
const mo = 2;
function jn(e, n) {
  return Math.max(e.coreRadius[n], mo);
}
function an(e, n) {
  const s = e.band[n];
  return { yMin: s.min, yMax: s.max };
}
function qt(e, n) {
  const s = fo(n);
  return {
    strength: e.link[s.id],
    distance: e.dist[s.id],
    key: s.id
  };
}
function go(e, n, s) {
  const o = n.coreRadiusMultiplier, a = n.pushMultiplier, r = n.chargeExponent;
  for (let c = 0; c < e.length; c++)
    for (let l = c + 1; l < e.length; l++) {
      const i = e[c], d = e[l];
      let h = d.x - i.x, g = d.y - i.y, p = h * h + g * g;
      if (p < 0.01) {
        const w = Math.random() * Math.PI * 2;
        h = Math.cos(w), g = Math.sin(w), p = 1;
      }
      const y = Math.sqrt(p), v = o * jn(n, i.nodeType), k = o * jn(n, d.nodeType), A = (v + k) / 2, P = A * A, $ = Kn(n, i.nodeType), D = Kn(n, d.nodeType), M = ($ + D) / 2, b = -(s * a * M / Math.pow(p + P, r)), C = b * (h / y), F = b * (g / y);
      i.pinned || (i.vx -= C, i.vy -= F), d.pinned || (d.vx += C, d.vy += F);
    }
}
function yo(e, n, s, o) {
  const a = /* @__PURE__ */ new Map();
  for (const i of e)
    a.set(i.sourceId, (a.get(i.sourceId) ?? 0) + 1), a.set(i.targetId, (a.get(i.targetId) ?? 0) + 1);
  const r = s.pullMultiplier, c = s.linkExponent, l = s.distanceMultiplier;
  for (const i of e) {
    const d = n.get(i.sourceId), h = n.get(i.targetId);
    if (!d || !h) continue;
    let g = h.x - d.x, p = h.y - d.y, y = Math.sqrt(g * g + p * p);
    if (y < 0.1) {
      const R = Math.random() * Math.PI * 2;
      g = Math.cos(R), p = Math.sin(R), y = 1;
    }
    const v = qt(s, i), k = v.distance * l, A = y - k, P = Math.abs(A), $ = A >= 0 ? 1 : -1, D = o * r * v.strength * $ * Math.pow(P, c) / y, M = D * g, b = D * p, C = a.get(i.sourceId) ?? 1, F = a.get(i.targetId) ?? 1, w = C / (C + F);
    d.pinned || (d.vx += M * (1 - w), d.vy += b * (1 - w)), h.pinned || (h.vx -= M * w, h.vy -= b * w);
  }
}
const Fn = 60, zt = 540;
function ko(e, n) {
  const s = /* @__PURE__ */ new Set(), o = [];
  for (const r of e) {
    if (s.has(r.nodeType)) continue;
    s.add(r.nodeType);
    const c = an(n, r.nodeType);
    o.push((c.yMin + c.yMax) / 2);
  }
  if (o.length === 0) return 0;
  o.sort((r, c) => r - c);
  const a = o.length;
  return a % 2 ? o[(a - 1) / 2] : (o[a / 2 - 1] + o[a / 2]) / 2;
}
function vo(e, n, s) {
  if (n.gravityMode === "radial") {
    bo(e, n, s);
    return;
  }
  const o = n.gravityX, a = n.gravityY, r = n.gravityBandExp, c = n.bandXMin, l = n.bandXMax, i = ko(e, n);
  for (const d of e) {
    if (d.pinned) continue;
    let h = null;
    d.x < c ? h = c : d.x > l && (h = l), h !== null && (d.vx -= Zn(d.x - h, r) * s * o);
    const g = an(n, d.nodeType), p = g.yMin - i, y = g.yMax - i;
    let v = null;
    d.y < p ? v = p : d.y > y && (v = y), v !== null && (d.vy -= Zn(d.y - v, r) * s * a);
  }
}
function Zn(e, n) {
  return Math.sign(e) * Math.pow(Math.abs(e), n);
}
function bo(e, n, s) {
  const o = n.gravityY, a = /* @__PURE__ */ new Map();
  for (const i of e) {
    if (a.has(i.nodeType)) continue;
    const d = an(n, i.nodeType);
    a.set(i.nodeType, (d.yMin + d.yMax) / 2);
  }
  if (a.size === 0) return;
  const r = [...a.values()], c = Math.min(...r), l = Math.max(...r) - c || 1;
  for (const i of e) {
    if (i.pinned) continue;
    const d = a.get(i.nodeType);
    if (d === void 0) continue;
    const h = Fn + (d - c) / l * (zt - Fn), g = Math.hypot(i.x, i.y);
    if (g < 1e-6) {
      i.vx += Math.random() - 0.5, i.vy += Math.random() - 0.5;
      continue;
    }
    const p = Zn(g - h, n.gravityBandExp);
    i.vx -= i.x / g * p * s * o, i.vy -= i.y / g * p * s * o;
  }
}
const wo = -350;
function xo(e, n, s, o) {
  const a = n.gravityDownstream;
  if (a <= 0 || !o) return;
  const r = n.gravityTopologicalExp, c = n.gravityMode === "radial";
  for (const l of e) {
    if (l.pinned) continue;
    const i = o.get(l.id) ?? 0;
    if (i <= 0) continue;
    const d = Math.pow(i, r);
    c ? (l.vx -= l.x * s * a * d, l.vy -= l.y * s * a * d) : l.vy -= (l.y - wo) * s * a * d;
  }
}
function No(e, n, s) {
  const o = n.gravityCenter;
  if (!(o <= 0))
    for (const a of e)
      a.pinned || (a.vx -= a.x * s * o, a.vy -= a.y * s * o);
}
const Xt = {
  // Charges (all negative = repulsion). Per-type defaults captured from an
  // interactive tuning session on the PUSH charge map: the container/host
  // tiers (endpoint, namespace, worker, service) carry the heaviest repulsion
  // so top-level nodes fan well apart, dropping off through the orchestrator
  // tier (operation, workflow) down to activities. Sourced from the registry
  // alongside each type's core radius.
  charge: Object.fromEntries(
    Oe.map((e) => [e, ke[e].physics.charge])
  ),
  // Core radii (charge softening as a length), sourced from the registry.
  coreRadius: Object.fromEntries(
    Oe.map((e) => [e, ke[e].physics.coreRadius])
  ),
  // Spring stiffness + rest length per edge category, sourced from the registry.
  link: Object.fromEntries(
    Dn.map((e) => [e.id, e.physics.strength])
  ),
  dist: Object.fromEntries(
    Dn.map((e) => [e.id, e.physics.distance])
  ),
  // Hierarchical gravity. Y bands carry the vertical structure of the
  // layout — strong (gravityY = 0.145) and overlapping at the edges so
  // adjacent tiers can soften their boundary instead of forming a hard
  // stripe. The X band is asymmetric (0..380) because the canvas's
  // initial fit-to-view re-centres anyway; what matters is the band
  // width, which is generous enough to let wide fan-outs spread laterally.
  gravityX: 0.05,
  gravityY: 0.145,
  gravityBandExp: 1,
  // Off by default — the experiment lives behind a slider. When non-zero,
  // every node with a positive downstream score gets an additional vy pull
  // toward `bandMin - score * bandHeight`, layered additively on top of the
  // per-type Y-band gravity above.
  gravityDownstream: 0,
  gravityTopologicalExp: 3,
  gravityCenter: 0.05,
  gravityMode: "cartesian",
  bandEnabled: !0,
  topologicalEnabled: !1,
  bandXMin: 0,
  bandXMax: 380,
  // Per-type Y rest bands, sourced from the registry.
  band: Object.fromEntries(
    Oe.map((e) => [e, { ...ke[e].physics.yBand }])
  ),
  // Dynamics. alphaMin is well below the d3 default (0.001) so the
  // simulation continues into its slow-cooling tail — layouts read as
  // "settled" rather than freezing while springs are still measurably
  // active. friction and cooling are stock.
  alphaDecay: 5e-3,
  alphaMin: 1e-4,
  velocityDecay: 0.4,
  pushMultiplier: 0.4,
  pullMultiplier: 0.6,
  distanceMultiplier: 0.1,
  coreRadiusMultiplier: 1,
  chargeExponent: 0.7,
  // acts on (dist² + softening); = old 1.4 with the /2 folded in
  linkExponent: 1
}, Gn = 50, je = 1e6, To = 200;
class Mo {
  constructor(n, s) {
    on(this, "nodes");
    on(this, "edges");
    on(this, "params");
    on(this, "alpha");
    // Per-burst cooling rate set by `reheat()` so the settle window stays fixed
    // (~REHEAT_TICKS) no matter the kick size. Null means "cool at the normal
    // alphaDecay" — used during steady-state and live tuning via `nudge()`.
    on(this, "reheatDecay", null);
    on(this, "nodeMap");
    this.params = { ...Xt, ...s }, this.alpha = 1, this.nodes = [], this.nodeMap = /* @__PURE__ */ new Map();
    const o = (this.params.bandXMin + this.params.bandXMax) / 2, a = Math.max(40, (this.params.bandXMax - this.params.bandXMin) * 0.7);
    for (const r of n.nodes.values()) {
      const c = an(this.params, r.nodeType), l = (c.yMin + c.yMax) / 2, i = Math.max(20, (c.yMax - c.yMin) / 2), d = {
        ...r,
        x: o + (Math.random() - 0.5) * a,
        y: l + (Math.random() - 0.5) * i,
        vx: 0,
        vy: 0,
        pinned: !1
      };
      this.nodes.push(d), this.nodeMap.set(d.id, d);
    }
    for (const r of this.nodes)
      if (r.parentId) {
        const c = this.nodeMap.get(r.parentId);
        c && (r.x = c.x + (Math.random() - 0.5) * 20);
      }
    this.edges = n.edges;
  }
  getNode(n) {
    return this.nodeMap.get(n);
  }
  tick(n, s) {
    if (this.alpha < this.params.alphaMin) return;
    const o = n ? this.nodes.filter((i) => n.has(i.id)) : this.nodes, a = n ? this.edges.filter((i) => n.has(i.sourceId) && n.has(i.targetId)) : this.edges;
    go(o, this.params, this.alpha), yo(a, this.nodeMap, this.params, this.alpha), this.params.bandEnabled && vo(o, this.params, this.alpha), this.params.topologicalEnabled && xo(o, this.params, this.alpha, s), !this.params.bandEnabled && !this.params.topologicalEnabled && No(o, this.params, this.alpha);
    const r = this.params.velocityDecay, c = Gn * Gn;
    for (const i of o) {
      if (i.pinned) continue;
      i.vx *= r, i.vy *= r, Number.isFinite(i.vx) || (i.vx = 0), Number.isFinite(i.vy) || (i.vy = 0);
      const d = i.vx * i.vx + i.vy * i.vy;
      if (d > c) {
        const h = Gn / Math.sqrt(d);
        i.vx *= h, i.vy *= h;
      }
      i.x += i.vx, i.y += i.vy, Number.isFinite(i.x) || (i.x = 0), Number.isFinite(i.y) || (i.y = 0), i.x < -je ? i.x = -je : i.x > je && (i.x = je), i.y < -je ? i.y = -je : i.y > je && (i.y = je);
    }
    const l = this.reheatDecay ?? this.params.alphaDecay;
    this.alpha = Math.max(this.alpha - l, 0), this.alpha <= this.params.alphaMin && (this.reheatDecay = null);
  }
  // Strong, bounded-duration kick. A bigger `alpha` rearranges the layout
  // further but settles in the same ~REHEAT_TICKS window (decay scales with the
  // kick) rather than lingering proportionally longer.
  reheat(n = 0.5) {
    this.alpha = n, this.reheatDecay = n / To;
  }
  // Raise alpha to at least `target` without ever cooling a hotter sim.
  // This is the physics primitive behind the control panel's "keep the
  // layout warm while tuning" hook: a parameter edit re-energises the
  // simulation just enough to show its effect, but a still-hot sim is
  // left alone so dragging a slider during settling doesn't dampen it.
  nudge(n = 0.3) {
    this.alpha < n && (this.alpha = n), this.reheatDecay = null;
  }
  isStable() {
    return this.alpha < this.params.alphaMin;
  }
  pinNode(n, s, o) {
    const a = this.nodeMap.get(n);
    a && (a.pinned = !0, a.x = s, a.y = o, a.vx = 0, a.vy = 0);
  }
  unpinNode(n) {
    const s = this.nodeMap.get(n);
    s && (s.pinned = !1);
  }
  setParams(n) {
    Object.assign(this.params, n);
  }
  // Seed a node at a given position (used when new nodes appear during a
  // level-toggle transition). X follows the seed point; Y snaps into the
  // node's own band so the hierarchy is honoured immediately.
  seedAt(n, s, o) {
    const a = this.nodeMap.get(n);
    if (!a) return;
    const r = an(this.params, a.nodeType), c = Math.min(Math.max(o, r.yMin), r.yMax);
    a.x = s + (Math.random() - 0.5) * 10, a.y = c + (Math.random() - 0.5) * 10, a.vx = 0, a.vy = 0;
  }
}
const Ue = {
  containment: { color: "#94A3B8", alpha: 0.35, dash: [3, 4], width: 1 },
  opContainment: { color: "#DB2777", alpha: 0.55, dash: [3, 4], width: 1.2 },
  // op → service
  epComposition: { color: "#9F1239", alpha: 0.55, dash: [3, 4], width: 1.2 },
  // op → endpoint
  dependencyNsToNs: { color: "#475569", alpha: 0.85, dash: [], width: 1.8 },
  // ns → ns
  dependencyWkToWk: { color: "#64748B", alpha: 0.75, dash: [], width: 1.6 },
  // worker → worker
  workflowDep: { color: "#8B7EC8", alpha: 0.7, dash: [], width: 1.4 },
  // workflow → workflow
  workflowToActivity: { color: "#4A8BC2", alpha: 0.7, dash: [], width: 1.4 },
  // workflow → activity
  dependencyDefault: { color: "#94A3B8", alpha: 0.5, dash: [], width: 1.3 },
  // all other deps
  nexusCall: { color: "#F472B6", alpha: 0.85, dash: [], width: 1.5 }
  // workflow ↔ operation, or spliced
}, So = "#4A90D9", Eo = "#FFFFFF", Tn = 0.2, Ut = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', $o = 11, Co = 0.78, Do = 15, Fo = 12;
function Ao(e) {
  return e.length > Do ? e.slice(0, Fo) + "…" : e;
}
function Po(e) {
  return `600 ${e.toFixed(1)}px ${Ut}`;
}
function Mn(e, n, s) {
  const o = e ?? (typeof document < "u" ? document.documentElement : null);
  return o && getComputedStyle(o).getPropertyValue(n).trim() || s;
}
function kt(e, n, s) {
  return e.edgeType === "containment" ? n.nodeType === "nexusOperation" && s.nodeType === "nexusService" ? Ue.opContainment : n.nodeType === "nexusOperation" && s.nodeType === "nexusEndpoint" || n.nodeType === "nexusEndpoint" && s.nodeType === "nexusOperation" ? Ue.epComposition : Ue.containment : n.nodeType === "nexusOperation" || s.nodeType === "nexusOperation" || e.nexusEndpoint != null ? Ue.nexusCall : n.nodeType === "workflow" && s.nodeType === "workflow" ? Ue.workflowDep : n.nodeType === "workflow" && s.nodeType === "activity" || n.nodeType === "activity" && s.nodeType === "workflow" ? Ue.workflowToActivity : n.nodeType === "namespace" || s.nodeType === "namespace" ? Ue.dependencyNsToNs : n.nodeType === "worker" || s.nodeType === "worker" ? Ue.dependencyWkToWk : Ue.dependencyDefault;
}
const Sn = 8, Ae = 100, vt = 0.25, Hn = 0.1;
function Io({
  nodes: e,
  edges: n,
  viewport: s,
  onViewportChange: o,
  onNodeDragStart: a,
  onNodeDragMove: r,
  onNodeDragEnd: c,
  onDoubleClickNode: l,
  onHoverNode: i,
  onSelectNode: d,
  onNodeContextMenu: h,
  highlightedNodes: g,
  highlightedEdges: p,
  hoveredNodeId: y,
  selectedNodeId: v,
  focusedNodeId: k,
  searchMatchIds: A,
  running: P,
  forceParams: $,
  activeSection: D,
  activeChargeType: M,
  activeGravityType: b,
  activePullEdge: C,
  nodeScale: F
}) {
  const w = m.useRef(null), R = m.useRef(null), [V, re] = m.useState({ w: 0, h: 0 }), j = m.useRef(null), ne = m.useMemo(() => {
    const E = /* @__PURE__ */ new Map();
    for (const u of e) E.set(u.id, u);
    return E;
  }, [e]), ie = m.useMemo(() => {
    const E = /* @__PURE__ */ new Map();
    for (const W of e) E.set(W.definitionKey, (E.get(W.definitionKey) ?? 0) + 1);
    const u = /* @__PURE__ */ new Set();
    for (const W of e)
      (E.get(W.definitionKey) ?? 0) > 1 && u.add(W.id);
    return u;
  }, [e]), T = m.useMemo(() => {
    const E = y ?? v;
    if (!E) return null;
    const u = ne.get(E);
    return !u || !ie.has(E) ? null : u.definitionKey;
  }, [y, v, ne, ie]), z = m.useRef({
    nodes: e,
    edges: n,
    nodeMap: ne,
    viewport: s,
    highlightedNodes: g,
    highlightedEdges: p,
    hoveredNodeId: y,
    selectedNodeId: v,
    focusedNodeId: k,
    searchMatchIds: A,
    forceParams: $,
    activeSection: D,
    activeChargeType: M,
    activeGravityType: b,
    activePullEdge: C,
    nodeScale: F,
    running: P,
    dupNodeIds: ie,
    activeDupDefKey: T
  });
  z.current = {
    nodes: e,
    edges: n,
    nodeMap: ne,
    viewport: s,
    highlightedNodes: g,
    highlightedEdges: p,
    hoveredNodeId: y,
    selectedNodeId: v,
    focusedNodeId: k,
    searchMatchIds: A,
    forceParams: $,
    activeSection: D,
    activeChargeType: M,
    activeGravityType: b,
    activePullEdge: C,
    nodeScale: F,
    running: P,
    dupNodeIds: ie,
    activeDupDefKey: T
  }, m.useEffect(() => {
    const E = R.current;
    if (!E) return;
    const u = new ResizeObserver((W) => {
      const { width: U, height: B } = W[0].contentRect;
      re({ w: Math.floor(U), h: Math.floor(B) });
    });
    return u.observe(E), () => u.disconnect();
  }, []);
  const X = m.useCallback((E, u) => {
    const [W, U] = Vn(s, E, u);
    for (let B = e.length - 1; B >= 0; B--) {
      const S = e[B], I = Ye(S.nodeType).size.r * _n(s.scale, F) / s.scale + 4;
      if ((W - S.x) ** 2 + (U - S.y) ** 2 <= I * I) return S;
    }
    return null;
  }, [e, s, F]), pe = m.useCallback((E) => {
    E.preventDefault();
    const u = w.current.getBoundingClientRect(), W = E.clientX - u.left, U = E.clientY - u.top, B = E.deltaY < 0 ? 1.15 : 0.85;
    o(Yn(s, W, U, B));
  }, [s, o]), Ee = m.useCallback((E) => {
    var S;
    const u = w.current.getBoundingClientRect(), W = E.clientX - u.left, U = E.clientY - u.top, B = X(W, U);
    if (B) {
      j.current = { type: "node", sx: W, sy: U, moved: !1 };
      const [I, x] = Vn(s, W, U);
      a(B.id, I, x);
    } else
      j.current = { type: "pan", startVp: { ...s }, sx: W, sy: U, moved: !1 };
    (S = w.current) == null || S.setPointerCapture(E.pointerId);
  }, [s, X, a]), Ce = m.useCallback((E) => {
    const u = w.current.getBoundingClientRect(), W = E.clientX - u.left, U = E.clientY - u.top;
    if (!j.current) {
      const B = X(W, U);
      i((B == null ? void 0 : B.id) ?? null);
      return;
    }
    if (j.current.moved = !0, j.current.type === "pan" && j.current.startVp) {
      const B = W - j.current.sx, S = U - j.current.sy;
      o({
        ...j.current.startVp,
        x: j.current.startVp.x + B,
        y: j.current.startVp.y + S
      });
    } else if (j.current.type === "node") {
      const [B, S] = Vn(s, W, U);
      r(B, S);
    }
  }, [s, X, o, r, i]), Ne = m.useCallback((E) => {
    var W;
    const u = j.current;
    if ((u == null ? void 0 : u.type) === "node") {
      if (c(), !u.moved) {
        const U = w.current.getBoundingClientRect(), B = E.clientX - U.left, S = E.clientY - U.top, I = X(B, S);
        I && d(I.id);
      }
    } else (u == null ? void 0 : u.type) === "pan" && !u.moved && d(null);
    j.current = null, (W = w.current) == null || W.releasePointerCapture(E.pointerId);
  }, [c, d, X]), Ie = m.useCallback((E) => {
    const u = w.current.getBoundingClientRect(), W = E.clientX - u.left, U = E.clientY - u.top, B = X(W, U);
    B ? l(B.id) : o(ct(e, V.w, V.h));
  }, [X, e, V, o, l]), De = m.useCallback((E) => {
    if (!h) return;
    const u = w.current.getBoundingClientRect(), W = E.clientX - u.left, U = E.clientY - u.top, B = X(W, U);
    B && (E.preventDefault(), h(B.id, E.clientX, E.clientY));
  }, [X, h]), H = m.useRef(!0);
  return m.useEffect(() => {
    H.current = !0;
  }), m.useEffect(() => {
    const E = w.current;
    if (!E || V.w === 0) return;
    const u = E.getContext("2d");
    if (!u) return;
    const W = window.devicePixelRatio || 1;
    E.width = V.w * W, E.height = V.h * W;
    let U = 0, B = !0;
    const S = () => {
      var xn, Nn;
      const x = z.current, { w: q, h: Y } = V, le = x.highlightedNodes !== null && x.highlightedNodes.size > 0, ce = Mn(E, "--color-graph-label", "#0f172a"), _ = ce.startsWith("#") && ce.length === 7 ? ce + "33" : "rgba(100,116,139,0.2)", N = x.viewport;
      u.setTransform(W, 0, 0, W, 0, 0), u.clearRect(0, 0, q, Y);
      for (const J of x.edges) {
        const fe = x.nodeMap.get(J.sourceId), he = x.nodeMap.get(J.targetId);
        if (!fe || !he) continue;
        const [Q, K] = Pe(N, fe.x, fe.y), [oe, ae] = Pe(N, he.x, he.y);
        if (Math.max(Q, oe) < -Ae || Math.min(Q, oe) > q + Ae || Math.max(K, ae) < -Ae || Math.min(K, ae) > Y + Ae) continue;
        const be = ((xn = x.highlightedEdges) == null ? void 0 : xn.has(J.id)) ?? !1, ee = kt(J, fe, he), me = ee.alpha, ye = x.searchMatchIds !== null && (!x.searchMatchIds.has(J.sourceId) || !x.searchMatchIds.has(J.targetId));
        if (u.globalAlpha = le ? be ? 1 : Tn : ye ? Tn : me, u.beginPath(), u.setLineDash([...ee.dash]), u.strokeStyle = ee.color, u.lineWidth = ee.width, u.moveTo(Q, K), u.lineTo(oe, ae), u.stroke(), u.setLineDash([]), J.edgeType !== "containment") {
          const te = Math.atan2(ae - K, oe - Q), we = Ye(he.nodeType).size.r * _n(N.scale, x.nodeScale) + 2, ve = oe - Math.cos(te) * we, $e = ae - Math.sin(te) * we;
          u.beginPath(), u.moveTo(ve, $e), u.lineTo(
            ve - Sn * Math.cos(te - Math.PI / 6),
            $e - Sn * Math.sin(te - Math.PI / 6)
          ), u.lineTo(
            ve - Sn * Math.cos(te + Math.PI / 6),
            $e - Sn * Math.sin(te + Math.PI / 6)
          ), u.closePath(), u.fillStyle = ee.color, u.fill();
        }
        u.globalAlpha = 1;
      }
      const Z = x.activeSection === "push", ge = x.activeSection === "pull", vn = x.activeSection === "gravity", bn = [0.2, 0.5, 1.5];
      if (Z) {
        const J = x.forceParams.chargeExponent, fe = x.forceParams.pushMultiplier, he = x.forceParams.coreRadiusMultiplier, Q = x.activeChargeType;
        for (const K of x.nodes) {
          const [oe, ae] = Pe(N, K.x, K.y), be = 2e3;
          if (oe + be < 0 || oe - be > q || ae + be < 0 || ae - be > Y) continue;
          const ee = Q === null || K.nodeType === Q, me = ee ? 0.28 : 0.05, ye = ee ? 0.06 : 0.015, te = Ye(K.nodeType).color.fill;
          u.strokeStyle = te;
          const Te = Math.abs(Kn(x.forceParams, K.nodeType)) * fe;
          if (Te <= 0) continue;
          const we = he * jn(x.forceParams, K.nodeType), ve = we * we, $e = [];
          for (let Se = 0; Se < bn.length; Se++) {
            const Fe = bn[Se], L = Te / Fe, G = Math.pow(L, 1 / Math.max(J, 0.01)) - ve;
            if (G <= 0) continue;
            const O = Math.sqrt(G) * N.scale;
            O < 2 || O > 2e3 || $e.push(O);
          }
          if ($e.length !== 0) {
            u.strokeStyle = te;
            for (let Se = 0; Se < $e.length; Se++) {
              const Fe = $e[Se], L = $e.length - 1 - Se;
              u.beginPath(), u.arc(oe, ae, Fe, 0, Math.PI * 2), u.globalAlpha = me + L * ye, u.lineWidth = ee ? 1.5 : 1, u.stroke();
            }
          }
        }
        u.globalAlpha = 1;
      }
      const qe = x.activePullEdge;
      if (ge || qe) {
        const J = x.forceParams.distanceMultiplier, fe = Mn(E, "--color-warning", "#d97706"), he = Mn(E, "--color-activity", "#7CB9E8"), Q = Mn(E, "--color-timer", "#7EC8B8");
        for (const K of x.edges) {
          const oe = x.nodeMap.get(K.sourceId), ae = x.nodeMap.get(K.targetId);
          if (!oe || !ae) continue;
          const be = qt(x.forceParams, K);
          if (qe && be.key !== qe) continue;
          const [ee, me] = Pe(N, oe.x, oe.y), [ye, te] = Pe(N, ae.x, ae.y);
          if (Math.max(ee, ye) < -Ae || Math.min(ee, ye) > q + Ae || Math.max(me, te) < -Ae || Math.min(me, te) > Y + Ae) continue;
          const Te = be.distance * J, we = ae.x - oe.x, ve = ae.y - oe.y, Se = Math.sqrt(we * we + ve * ve) / Math.max(Te, 0.1);
          let Fe;
          if (Se > 1.15 ? Fe = fe : Se < 0.85 ? Fe = he : Fe = Q, qe) {
            const de = kt(K, oe, ae);
            u.beginPath(), u.moveTo(ee, me), u.lineTo(ye, te), u.strokeStyle = Fe, u.globalAlpha = 0.9, u.lineWidth = de.width + 5, u.setLineDash([]), u.stroke(), u.beginPath(), u.moveTo(ee, me), u.lineTo(ye, te), u.strokeStyle = de.color, u.globalAlpha = 1, u.lineWidth = de.width, u.setLineDash([...de.dash]), u.stroke(), u.setLineDash([]);
            continue;
          }
          u.beginPath(), u.moveTo(ee, me), u.lineTo(ye, te), u.strokeStyle = Fe, u.globalAlpha = 0.5, u.lineWidth = 3, u.setLineDash([]), u.stroke();
          const L = Math.atan2(ve, we), G = -Math.sin(L), xe = Math.cos(L), O = 5, se = Te * N.scale;
          if (se > 10 && se < Math.sqrt((ye - ee) ** 2 + (te - me) ** 2) * 2) {
            const de = ee + Math.cos(L) * se, ze = me + Math.sin(L) * se;
            u.beginPath(), u.moveTo(de - G * O, ze - xe * O), u.lineTo(de + G * O, ze + xe * O), u.strokeStyle = Q, u.globalAlpha = 0.7, u.lineWidth = 1.5, u.stroke();
            const lt = ye - Math.cos(L) * se, dt = te - Math.sin(L) * se;
            u.beginPath(), u.moveTo(lt - G * O, dt - xe * O), u.lineTo(lt + G * O, dt + xe * O), u.stroke();
          }
        }
        u.globalAlpha = 1, u.setLineDash([]);
      }
      if (vn && x.forceParams.bandEnabled) {
        const J = [], fe = /* @__PURE__ */ new Set();
        for (const Q of x.nodes)
          fe.has(Q.nodeType) || (fe.add(Q.nodeType), J.push(Q.nodeType));
        const he = (Q) => {
          const K = an(x.forceParams, Q);
          return (K.yMin + K.yMax) / 2;
        };
        if (x.forceParams.gravityMode === "radial") {
          const Q = J.map(he), K = Q.length ? Math.min(...Q) : 0, oe = (Q.length ? Math.max(...Q) : 0) - K || 1, [ae, be] = Pe(N, 0, 0);
          for (const ee of J) {
            const me = Fn + (he(ee) - K) / oe * (zt - Fn), ye = x.activeGravityType === ee, te = x.activeGravityType !== null && !ye;
            u.strokeStyle = Ye(ee).color.fill, u.globalAlpha = ye ? 0.6 : te ? 0.1 : 0.28, u.lineWidth = ye ? 1.5 : 1, u.setLineDash([]), u.beginPath(), u.arc(ae, be, me * N.scale, 0, Math.PI * 2), u.stroke();
          }
        } else {
          const Q = J.map(he).sort((ee, me) => ee - me), K = Q.length, oe = K ? K % 2 ? Q[(K - 1) / 2] : (Q[K / 2 - 1] + Q[K / 2]) / 2 : 0;
          for (const ee of Oe) {
            const me = an(x.forceParams, ee), [, ye] = Pe(N, 0, me.yMin - oe), [, te] = Pe(N, 0, me.yMax - oe);
            if (te < 0 || ye > Y) continue;
            const Te = x.activeGravityType === ee, we = x.activeGravityType !== null && !Te, ve = Ye(ee).color.fill;
            u.fillStyle = ve, u.globalAlpha = Te ? 0.2 : we ? 0.04 : 0.1, u.fillRect(0, ye, q, te - ye), u.strokeStyle = ve, u.globalAlpha = Te ? 0.55 : we ? 0.08 : 0.22, u.lineWidth = Te ? 1.5 : 1, u.setLineDash([]), u.beginPath(), u.moveTo(0, ye), u.lineTo(q, ye), u.moveTo(0, te), u.lineTo(q, te), u.stroke();
          }
          const [ae] = Pe(N, x.forceParams.bandXMin, 0), [be] = Pe(N, x.forceParams.bandXMax, 0);
          ae < q + Ae && be > -Ae && (u.strokeStyle = "#8B7EC8", u.globalAlpha = 0.5, u.lineWidth = 1.5, u.setLineDash([6, 6]), u.beginPath(), u.moveTo(ae, 0), u.lineTo(ae, Y), u.moveTo(be, 0), u.lineTo(be, Y), u.stroke(), u.fillStyle = "#8B7EC8", u.globalAlpha = 0.05, u.fillRect(ae, 0, be - ae, Y), u.setLineDash([]));
        }
        u.globalAlpha = 1;
      }
      u.textAlign = "center", u.textBaseline = "middle";
      const sn = _n(N.scale, x.nodeScale), wn = [], Bn = x.nodes.map((J) => {
        const [fe, he] = Pe(N, J.x, J.y);
        return { x: fe, y: he, r: Ye(J.nodeType).size.r * sn };
      });
      for (const J of x.nodes) {
        const [fe, he] = Pe(N, J.x, J.y), Q = Ye(J.nodeType), K = Q.size.r * sn, oe = K;
        if (fe + oe < -Ae || fe - oe > q + Ae || he + oe < -Ae || he - oe > Y + Ae) continue;
        const ae = ((Nn = x.highlightedNodes) == null ? void 0 : Nn.has(J.id)) ?? !1, be = x.searchMatchIds !== null && !x.searchMatchIds.has(J.id), ee = le && !ae || be;
        u.globalAlpha = ee ? Tn : 1;
        const me = Q.color.fill, ye = Q.color.border, te = Q.icon;
        u.beginPath(), u.arc(fe, he, K, 0, Math.PI * 2), u.fillStyle = me, u.fill(), u.lineWidth = Math.max(1, Math.min(2, N.scale * 1.25)), u.strokeStyle = ye, u.stroke(), N.scale >= vt && te && (u.save(), u.font = `${Q.size.iconSize * sn}px ${Ut}`, u.fillStyle = "#FFFFFF", u.globalAlpha = (ee ? Tn : 1) * 0.92, u.fillText(te, fe, he + 0.5), u.restore()), J.orphan && N.scale >= Hn && (u.save(), u.setLineDash([3, 3]), u.strokeStyle = me, u.lineWidth = 1.5, u.beginPath(), u.arc(fe, he, K + 4, 0, Math.PI * 2), u.stroke(), u.restore());
        const Te = x.activeDupDefKey !== null && J.definitionKey === x.activeDupDefKey && N.scale >= Hn;
        if (Te && (u.save(), u.strokeStyle = me, u.lineWidth = 2, u.setLineDash([]), u.globalAlpha = 0.55, u.beginPath(), u.arc(fe, he, K + 5, 0, Math.PI * 2), u.stroke(), u.restore()), J.id === x.selectedNodeId) {
          const ve = Te ? K + 10 : K + 5;
          u.save(), u.strokeStyle = Eo, u.lineWidth = 2.5, u.setLineDash([]), u.beginPath(), u.arc(fe, he, ve, 0, Math.PI * 2), u.stroke(), u.restore();
        }
        J.id === x.focusedNodeId && N.scale >= Hn && (u.save(), u.strokeStyle = So, u.lineWidth = 2, u.setLineDash([2, 2]), u.beginPath(), u.arc(fe, he, K + 9, 0, Math.PI * 2), u.stroke(), u.restore()), u.globalAlpha = 1;
        const we = J.id === x.hoveredNodeId || J.id === x.selectedNodeId;
        if (N.scale >= vt || we) {
          const ve = $o * (we ? Math.max(sn, 1) : sn), $e = he + K + 4 + ve * 0.7;
          u.font = Po(ve);
          const Se = Ao(J.name), Fe = u.measureText(Se).width, L = { x: fe - Fe / 2 - 2, y: $e - ve / 2 - 1, w: Fe + 4, h: ve + 2 }, G = wn.some((O) => L.x < O.x + O.w && L.x + L.w > O.x && L.y < O.y + O.h && L.y + L.h > O.y), xe = !G && Bn.some((O) => {
            const se = Math.max(L.x, Math.min(O.x, L.x + L.w)), de = Math.max(L.y, Math.min(O.y, L.y + L.h));
            return (O.x - se) ** 2 + (O.y - de) ** 2 < O.r * O.r;
          });
          (we || !G && !xe) && (wn.push(L), u.globalAlpha = ee ? 1 : Co, u.fillStyle = ee ? _ : ce, u.fillText(Se, fe, $e), u.globalAlpha = 1);
        }
      }
    }, I = () => {
      if (!B) return;
      (z.current.running || H.current) && (H.current = !1, S()), U = requestAnimationFrame(I);
    };
    return U = requestAnimationFrame(I), () => {
      B = !1, cancelAnimationFrame(U);
    };
  }, [V]), /* @__PURE__ */ t("div", { ref: R, className: "graph-canvas-container", children: /* @__PURE__ */ t(
    "canvas",
    {
      ref: w,
      style: { width: V.w, height: V.h },
      onWheel: pe,
      onPointerDown: Ee,
      onPointerMove: Ce,
      onPointerUp: Ne,
      onDoubleClick: Ie,
      onContextMenu: De
    }
  ) });
}
function Yt({
  yLabel: e,
  ySlider: n,
  bottom: s,
  children: o
}) {
  return /* @__PURE__ */ f("div", { className: "ctl-plot", children: [
    e !== void 0 && /* @__PURE__ */ t("div", { className: "ctl-plot-ylabel", children: e }),
    n !== void 0 && /* @__PURE__ */ t("div", { className: "ctl-plot-yslider", children: n }),
    /* @__PURE__ */ t("div", { className: "ctl-plot-main", children: o }),
    s !== void 0 && /* @__PURE__ */ t("div", { className: "ctl-plot-bottom", children: s })
  ] });
}
const Kt = m.createContext({ popped: null, setPopped: () => {
} });
function Ro({ children: e }) {
  const [n, s] = m.useState(null), o = m.useMemo(() => ({ popped: n, setPopped: s }), [n]);
  return /* @__PURE__ */ t(Kt.Provider, { value: o, children: e });
}
function jt() {
  return m.useContext(Kt);
}
function We({ id: e, children: n }) {
  const { popped: s, setPopped: o } = jt();
  return /* @__PURE__ */ t(
    "span",
    {
      className: `ctl-formula-value${s === e ? " active" : ""}`,
      onMouseEnter: () => o(e),
      onMouseLeave: () => o(null),
      children: n
    }
  );
}
function en({
  value: e,
  min: n,
  max: s,
  step: o,
  onChange: a,
  orientation: r = "horizontal",
  title: c,
  ariaLabel: l,
  className: i,
  popId: d
}) {
  const { popped: h } = jt(), p = `ctl-slider ctl-slider-${r === "vertical" ? "v" : "h"}` + (d !== void 0 && h === d ? " ctl-slider-popped" : "") + (i ? " " + i : "");
  return /* @__PURE__ */ t(
    "input",
    {
      type: "range",
      className: p,
      min: n,
      max: s,
      step: o,
      value: e,
      onChange: (y) => a(Number(y.target.value)),
      title: c,
      "aria-label": l,
      "data-pop-id": d
    }
  );
}
const Jn = (e, n, s) => Math.max(n, Math.min(s, e)), bt = (e, n) => Math.round(e / n) * n, rn = 300, Ze = 200, ln = 12, wt = rn - 2 * ln, xt = Ze - 2 * ln, Le = 7;
function Zt({
  tokens: e,
  xAxis: n,
  yAxis: s,
  onDrag: o,
  hoveredId: a,
  onHover: r,
  xSlider: c,
  ySlider: l,
  ariaLabel: i
}) {
  const d = m.useRef(null), h = m.useRef(null), g = (b) => ln + (b - n.min) / (n.max - n.min) * wt, p = (b) => Ze - ln - (b - s.min) / (s.max - s.min) * xt, y = (b) => n.min + (b - ln) / wt * (n.max - n.min), v = (b) => s.min + (Ze - ln - b) / xt * (s.max - s.min), k = (b) => {
    const C = d.current;
    if (!C) return { x: 0, y: 0 };
    const F = C.createSVGPoint();
    F.x = b.clientX, F.y = b.clientY;
    const w = C.getScreenCTM();
    if (!w) return { x: 0, y: 0 };
    const R = F.matrixTransform(w.inverse());
    return { x: R.x, y: R.y };
  }, A = (b, C) => {
    b.preventDefault(), b.currentTarget.setPointerCapture(b.pointerId), h.current = C;
  }, P = (b) => {
    const C = h.current;
    if (!C) return;
    const { x: F, y: w } = k(b), R = Jn(bt(y(F), n.step), n.min, n.max), V = Jn(bt(v(w), s.step), s.min, s.max);
    o(C, R, V);
  }, $ = (b) => {
    var C, F;
    h.current = null, (F = (C = b.currentTarget).releasePointerCapture) == null || F.call(C, b.pointerId);
  }, D = [0, rn / 2, rn], M = [0, Ze / 2, Ze];
  return /* @__PURE__ */ t(
    Yt,
    {
      yLabel: s.label,
      ySlider: /* @__PURE__ */ t(
        en,
        {
          orientation: "vertical",
          min: l.min,
          max: l.max,
          step: l.step,
          value: l.value,
          onChange: l.onChange,
          title: l.title,
          ariaLabel: l.ariaLabel,
          popId: l.popId
        }
      ),
      bottom: /* @__PURE__ */ f(Ge, { children: [
        /* @__PURE__ */ t(
          en,
          {
            min: c.min,
            max: c.max,
            step: c.step,
            value: c.value,
            onChange: c.onChange,
            title: c.title,
            ariaLabel: c.ariaLabel,
            popId: c.popId
          }
        ),
        /* @__PURE__ */ t("div", { className: "ctl-plot-xlabel", children: n.label })
      ] }),
      children: /* @__PURE__ */ f(
        "svg",
        {
          ref: d,
          className: "spring-map-svg",
          viewBox: `0 0 ${rn} ${Ze}`,
          role: "group",
          "aria-label": i,
          children: [
            /* @__PURE__ */ t("rect", { x: 0, y: 0, width: rn, height: Ze, className: "spring-plot-bg" }),
            D.map((b) => /* @__PURE__ */ t("line", { x1: b, y1: 0, x2: b, y2: Ze, className: "spring-grid" }, `gx${b}`)),
            M.map((b) => /* @__PURE__ */ t("line", { x1: 0, y1: b, x2: rn, y2: b, className: "spring-grid" }, `gy${b}`)),
            e.map((b) => {
              const C = g(b.x), F = p(b.y), w = a !== null && a !== b.id, R = a === b.id;
              return /* @__PURE__ */ f(
                "g",
                {
                  transform: `translate(${C} ${F})`,
                  className: `spring-token${w ? " dim" : ""}${R ? " active" : ""}`,
                  onPointerDown: (V) => A(V, b.id),
                  onPointerMove: P,
                  onPointerUp: $,
                  onPointerEnter: () => r(b.id),
                  onPointerLeave: () => {
                    h.current || r(null);
                  },
                  children: [
                    b.tooltip && /* @__PURE__ */ t("title", { children: b.tooltip }),
                    b.colorB === void 0 ? /* @__PURE__ */ t("circle", { r: Le, fill: b.colorA }) : /* @__PURE__ */ f(Ge, { children: [
                      /* @__PURE__ */ t("path", { d: `M0,${-Le} A${Le},${Le} 0 0 0 0,${Le} Z`, fill: b.colorA }),
                      /* @__PURE__ */ t("path", { d: `M0,${-Le} A${Le},${Le} 0 0 1 0,${Le} Z`, fill: b.colorB })
                    ] }),
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        r: Le,
                        fill: "none",
                        className: "spring-token-outline",
                        strokeDasharray: b.outline === "dashed" ? "2 2" : void 0
                      }
                    ),
                    /* @__PURE__ */ t("text", { y: Le + 11, textAnchor: "middle", className: "spring-token-label", children: b.label })
                  ]
                },
                b.id
              );
            })
          ]
        }
      )
    }
  );
}
const Je = 300, Re = 130, un = 56;
function Oo(e) {
  var o;
  const n = e.trim().split(/\s+/), s = (o = n[n.length - 1]) == null ? void 0 : o.split(",");
  return !s || s.length < 2 ? null : { x: Number(s[0]), y: Number(s[1]) };
}
function Lo(e, n) {
  if (!(e > 0)) return 1;
  const s = e / n, o = Math.pow(10, Math.floor(Math.log10(s))), a = s / o;
  return (a < 1.5 ? 1 : a < 3 ? 2 : a < 7 ? 5 : 10) * o;
}
function rt({
  curves: e,
  baselineY: n,
  hoveredId: s,
  onHover: o,
  xLabel: a,
  yLabel: r,
  exp: c,
  ariaLabel: l,
  xMax: i
}) {
  const d = [];
  if (i !== void 0 && i > 0) {
    const h = Lo(i, 6);
    for (let g = h; g < i * 0.999; g += h) d.push(g / i * Je);
  }
  return /* @__PURE__ */ f("div", { className: "spring-curves", children: [
    /* @__PURE__ */ t("div", { className: "spring-axis-label spring-curves-axis-y", children: r }),
    /* @__PURE__ */ f(
      "svg",
      {
        className: "spring-curves-svg",
        viewBox: `0 0 ${Je} ${Re}`,
        role: "img",
        "aria-label": l,
        children: [
          /* @__PURE__ */ t("rect", { x: 0, y: 0, width: Je, height: Re, className: "spring-curve-frame" }),
          d.map((h, g) => /* @__PURE__ */ t("line", { x1: h.toFixed(1), y1: 0, x2: h.toFixed(1), y2: Re, className: "ctl-grid-line" }, `g${g}`)),
          n !== void 0 && /* @__PURE__ */ t("line", { x1: 0, y1: n, x2: Je, y2: n, className: "spring-curve-baseline" }),
          e.filter((h) => h.id === s && h.markerX !== void 0).map((h) => /* @__PURE__ */ t("line", { x1: h.markerX, y1: 0, x2: h.markerX, y2: Re, className: "spring-curve-restmark" }, `m${h.id}`)),
          e.map((h) => {
            const g = s !== null && s !== h.id, p = s === h.id;
            return /* @__PURE__ */ f("g", { className: `spring-curve${g ? " dim" : ""}${p ? " active" : ""}`, children: [
              /* @__PURE__ */ t(
                "polyline",
                {
                  points: h.points,
                  className: "spring-curve-hit",
                  onPointerEnter: () => o(h.id),
                  onPointerLeave: () => o(null)
                }
              ),
              /* @__PURE__ */ t(
                "polyline",
                {
                  points: h.points,
                  className: "spring-curve-line",
                  style: { stroke: h.color }
                }
              ),
              h.label && (() => {
                const y = Oo(h.points);
                return y ? /* @__PURE__ */ t(
                  "text",
                  {
                    x: Math.min(y.x + 4, Je - 2),
                    y: Jn(y.y, 9, Re - 2),
                    className: "spring-curve-label",
                    style: { fill: h.color },
                    textAnchor: "end",
                    children: h.label
                  }
                ) : null;
              })()
            ] }, h.id);
          })
        ]
      }
    ),
    /* @__PURE__ */ t("div", { className: "spring-axis-label spring-curves-axis-x", children: a }),
    /* @__PURE__ */ f("div", { className: "spring-curves-exp", title: c.title, children: [
      /* @__PURE__ */ t("span", { className: "spring-exp-label", children: c.label ?? "exp" }),
      /* @__PURE__ */ t(
        en,
        {
          min: c.min,
          max: c.max,
          step: c.step,
          value: c.value,
          onChange: c.onChange,
          popId: c.popId
        }
      )
    ] })
  ] });
}
const Bo = 0, _o = 2, Wo = 0.05, Vo = 0, Go = 1e3, Ho = 10, An = Dn.map((e) => ({
  label: e.label,
  id: e.id,
  sourceType: e.sourceType,
  targetType: e.targetType,
  edgeType: e.category,
  tooltip: e.tooltip
}));
function Qn(e) {
  return `var(--color-${ke[e].color.cssVarSuffix})`;
}
const qo = (e, n, s) => Math.max(n, Math.min(s, e));
function zo({ params: e, onParamChange: n, hoveredEdge: s, onHoverEdge: o }) {
  const a = An.map((c) => ({
    id: c.id,
    x: e.dist[c.id],
    y: e.link[c.id],
    colorA: Qn(c.sourceType),
    colorB: Qn(c.targetType),
    outline: c.edgeType === "containment" ? "dashed" : "solid",
    label: c.label,
    tooltip: c.tooltip
  }));
  return /* @__PURE__ */ t(
    Zt,
    {
      tokens: a,
      xAxis: { min: Vo, max: Go, step: Ho, label: "length" },
      yAxis: { min: Bo, max: _o, step: Wo, label: "stiffness" },
      onDrag: (c, l, i) => {
        const d = An.find((h) => h.id === c);
        d && n({
          dist: { ...e.dist, [d.id]: l },
          link: { ...e.link, [d.id]: i }
        });
      },
      hoveredId: s,
      onHover: o,
      ariaLabel: "Spring map: rest length versus stiffness",
      xSlider: {
        value: e.distanceMultiplier,
        min: 0.05,
        max: 3,
        step: 0.05,
        onChange: (c) => n({ distanceMultiplier: c }),
        title: "Scale every spring’s rest length",
        ariaLabel: "Scale all length",
        popId: "distanceMultiplier"
      },
      ySlider: {
        value: e.pullMultiplier,
        min: 0,
        max: 3,
        step: 0.1,
        onChange: (c) => n({ pullMultiplier: c }),
        title: "Scale every spring’s stiffness",
        ariaLabel: "Scale all stiffness",
        popId: "pullMultiplier"
      }
    }
  );
}
const qn = Re * 0.78;
function Xo(e, n, s, o) {
  const a = e - s;
  return n * Math.sign(a) * Math.pow(Math.abs(a), o);
}
function Uo({ params: e, onParamChange: n, hoveredEdge: s, onHoverEdge: o }) {
  const a = e.pullMultiplier, r = e.distanceMultiplier, c = e.linkExponent, { curves: l, dMax: i } = m.useMemo(() => {
    const d = An.map(($) => e.dist[$.id] * r), h = Math.max(60, Math.max(...d) * 2.2);
    let g = 0;
    const p = An.map(($) => {
      const D = e.link[$.id] * a, M = e.dist[$.id] * r, b = [];
      for (let C = 0; C <= un; C++) {
        const F = C / un * h, w = Xo(F, D, M, c);
        Math.abs(w) > g && (g = Math.abs(w)), b.push({ d: F, v: w });
      }
      return { edge: $, restEff: M, pts: b };
    }), y = g > 0 ? g : 1, v = qn, k = ($) => $ / h * Je, A = ($) => qo(qn - $ / y * v, 0, Re);
    return { curves: p.map(({ edge: $, restEff: D, pts: M }) => ({
      id: $.id,
      color: Qn($.sourceType),
      markerX: k(D),
      points: M.map((b) => `${k(b.d).toFixed(1)},${A(b.v).toFixed(1)}`).join(" ")
    })), dMax: h };
  }, [e, a, r, c]);
  return /* @__PURE__ */ t(
    rt,
    {
      curves: l,
      xMax: i,
      baselineY: qn,
      hoveredId: s,
      onHover: o,
      xLabel: "distance",
      yLabel: "force",
      ariaLabel: "Spring force response curves",
      exp: {
        value: c,
        min: 0.5,
        max: 3,
        step: 0.1,
        onChange: (d) => n({ linkExponent: d }),
        title: "Power of displacement in the spring force. 1 = linear (Hooke); higher = softer near rest, stiffer far out.",
        popId: "linkExponent"
      }
    }
  );
}
const Yo = 0, Ko = 1e3, jo = 10, Zo = 0, Jo = 100, Qo = 1;
function Jt(e) {
  return `var(--color-${ke[e].color.cssVarSuffix})`;
}
const ea = (e, n, s) => Math.max(n, Math.min(s, e));
function na({ params: e, onParamChange: n, hoveredType: s, onHoverType: o }) {
  const a = Oe.map((c) => ({
    id: c,
    x: e.coreRadius[c],
    y: Math.abs(e.charge[c]),
    colorA: Jt(c),
    outline: "solid",
    label: Ot(c),
    tooltip: `${ke[c].label} repulsion charge & core radius`
  }));
  return /* @__PURE__ */ t(
    Zt,
    {
      tokens: a,
      xAxis: { min: Zo, max: Jo, step: Qo, label: "core radius" },
      yAxis: { min: Yo, max: Ko, step: jo, label: "charge" },
      onDrag: (c, l, i) => {
        const d = c;
        n({
          charge: { ...e.charge, [d]: -i },
          // store negative (repulsion)
          coreRadius: { ...e.coreRadius, [d]: l }
        });
      },
      hoveredId: s,
      onHover: (c) => o(c),
      ariaLabel: "Charge map: core radius versus charge magnitude",
      xSlider: {
        value: e.coreRadiusMultiplier,
        min: 0.1,
        max: 3,
        step: 0.05,
        onChange: (c) => n({ coreRadiusMultiplier: c }),
        title: "Scale every type’s core radius",
        ariaLabel: "Scale all core radius",
        popId: "coreRadiusMultiplier"
      },
      ySlider: {
        value: e.pushMultiplier,
        min: 0,
        max: 3,
        step: 0.1,
        onChange: (c) => n({ pushMultiplier: c }),
        title: "Scale every type’s charge",
        ariaLabel: "Scale all charge",
        popId: "pushMultiplier"
      }
    }
  );
}
function ta({ params: e, onParamChange: n, hoveredType: s, onHoverType: o }) {
  const a = e.pushMultiplier, r = e.coreRadiusMultiplier, c = e.chargeExponent, { curves: l, dMax: i } = m.useMemo(() => {
    const d = Oe.map((D) => r * e.coreRadius[D]), h = Math.max(0, ...d), g = Math.max(150, h * 4);
    let p = 0;
    const y = Oe.map((D) => {
      const M = Math.abs(e.charge[D]) * a, b = r * e.coreRadius[D], C = b * b, F = [];
      for (let w = 0; w <= un; w++) {
        const R = w / un * g, V = M / Math.pow(R * R + C, Math.max(c, 0.01));
        V > p && (p = V), F.push({ d: R, v: V });
      }
      return { type: D, rEff: b, pts: F };
    }), v = p > 0 ? p : 1, k = Re * 0.95, A = (D) => D / g * Je, P = (D) => ea(Re - D / v * k, 0, Re);
    return { curves: y.map(({ type: D, rEff: M, pts: b }) => ({
      id: D,
      color: Jt(D),
      markerX: A(M),
      points: b.map((C) => `${A(C.d).toFixed(1)},${P(C.v).toFixed(1)}`).join(" ")
    })), dMax: g };
  }, [e, a, r, c]);
  return /* @__PURE__ */ t(
    rt,
    {
      curves: l,
      xMax: i,
      hoveredId: s,
      onHover: (d) => o(d),
      xLabel: "distance",
      yLabel: "force",
      ariaLabel: "Charge falloff curves",
      exp: {
        value: c,
        min: 0.5,
        max: 1,
        step: 0.05,
        onChange: (d) => n({ chargeExponent: d }),
        title: "Power of (d² + r²) in the charge falloff. 1 = inverse-square; higher = sharper drop-off.",
        popId: "chargeExponent"
      }
    }
  );
}
function et({ children: e }) {
  return e === "" || e === null || e === void 0 ? null : typeof e == "string" ? /* @__PURE__ */ t("pre", { className: "graph-control-equation-formula", children: e }) : /* @__PURE__ */ t("div", { className: "graph-control-equation-formula", children: e });
}
const nt = [...Bt, ...us], sa = Bt.length;
function Nt(e) {
  return `var(--color-${ke[e].color.cssVarSuffix})`;
}
const oa = (e, n, s) => Math.max(n, Math.min(s, e)), aa = (e, n) => Math.round(e / n) * n, Qt = 300, es = 210, Ln = { top: 16, right: 8, bottom: 2, left: 8 }, Qe = Ln.left, Pn = Qt - Ln.right, Ve = Ln.top, fn = es - Ln.bottom, nn = -600, gn = 600, En = 10, Tt = 5, ia = nt.length + 1, $n = (e) => Ve + (e - nn) / (gn - nn) * (fn - Ve), ca = (e) => nn + (e - Ve) / (fn - Ve) * (gn - nn), zn = (e) => Qe + (e - nn) / (gn - nn) * (Pn - Qe), ra = (e) => e < sa ? e : e + 1, la = (e) => Qe + (ra(e) + 0.5) / ia * (Pn - Qe);
function da({ params: e, onParamChange: n, hoveredType: s, onHoverType: o }) {
  const a = m.useRef(null), r = m.useRef(null), [c, l] = m.useState(!1), i = (p) => {
    const y = a.current;
    if (!y) return 0;
    const v = y.createSVGPoint();
    v.x = p.clientX, v.y = p.clientY;
    const k = y.getScreenCTM();
    return k ? v.matrixTransform(k.inverse()).y : 0;
  }, d = (p, y, v) => {
    p.preventDefault(), p.currentTarget.setPointerCapture(p.pointerId), r.current = { type: y, edge: v };
  }, h = (p) => {
    const y = r.current;
    if (!y) return;
    const v = e.band[y.type], k = oa(aa(ca(i(p)), En), nn, gn), A = y.edge === "min" ? { min: Math.min(k, v.max - En), max: v.max } : { min: v.min, max: Math.max(k, v.min + En) };
    n({ band: { ...e.band, [y.type]: A } });
  }, g = (p) => {
    var y, v;
    r.current = null, (v = (y = p.currentTarget).releasePointerCapture) == null || v.call(y, p.pointerId);
  };
  return /* @__PURE__ */ t(
    Yt,
    {
      yLabel: "Y strength",
      ySlider: /* @__PURE__ */ t(
        en,
        {
          orientation: "vertical",
          min: 0,
          max: 0.25,
          step: 5e-3,
          value: e.gravityY,
          onChange: (p) => n({ gravityY: p }),
          title: "Vertical band-pull strength (scale all)",
          ariaLabel: "Vertical band strength",
          popId: "bandStrength"
        }
      ),
      bottom: /* @__PURE__ */ f(Ge, { children: [
        /* @__PURE__ */ t(
          "div",
          {
            className: "gravity-xband",
            onMouseEnter: () => l(!0),
            onMouseLeave: () => l(!1),
            children: /* @__PURE__ */ t(
              ma,
              {
                min: nn,
                max: gn,
                step: En,
                valueMin: e.bandXMin,
                valueMax: e.bandXMax,
                onChangeMin: (p) => n({ bandXMin: p }),
                onChangeMax: (p) => n({ bandXMax: p })
              }
            )
          }
        ),
        /* @__PURE__ */ t(
          en,
          {
            min: 0,
            max: 0.25,
            step: 5e-3,
            value: e.gravityX,
            onChange: (p) => n({ gravityX: p }),
            title: "Horizontal band-pull strength (scale all)",
            ariaLabel: "Horizontal band strength",
            popId: "bandStrength"
          }
        ),
        /* @__PURE__ */ t("div", { className: "ctl-plot-xlabel", children: "X strength" })
      ] }),
      children: /* @__PURE__ */ f(
        "svg",
        {
          ref: a,
          className: "gravity-band-svg",
          viewBox: `0 0 ${Qt} ${es}`,
          role: "group",
          "aria-label": "Band gravity: a mini world view of the per-type rest bands",
          children: [
            /* @__PURE__ */ t("rect", { x: Qe, y: Ve, width: Pn - Qe, height: fn - Ve, className: "gravity-band-bg" }),
            /* @__PURE__ */ f("g", { className: "gravity-band-stripes", children: [
              nt.map((p) => {
                const y = $n(e.band[p].min), v = $n(e.band[p].max), k = s !== null && s !== p, A = s === p;
                return /* @__PURE__ */ t(
                  "rect",
                  {
                    x: Qe,
                    y,
                    width: Pn - Qe,
                    height: Math.max(0, v - y),
                    fill: Nt(p),
                    className: `gravity-band-stripe${k ? " dim" : ""}${A ? " active" : ""}`
                  },
                  p
                );
              }),
              /* @__PURE__ */ t(
                "rect",
                {
                  x: zn(e.bandXMin),
                  y: Ve,
                  width: Math.max(0, zn(e.bandXMax) - zn(e.bandXMin)),
                  height: fn - Ve,
                  className: `gravity-xband-stripe${c ? " active" : ""}`
                }
              )
            ] }),
            nt.map((p, y) => {
              const v = la(y), k = $n(e.band[p].min), A = $n(e.band[p].max), P = s !== null && s !== p, $ = s === p, D = Nt(p);
              return /* @__PURE__ */ f(
                "g",
                {
                  className: `gravity-band-col${P ? " dim" : ""}${$ ? " active" : ""}`,
                  onPointerEnter: () => o(p),
                  onPointerLeave: () => {
                    r.current || o(null);
                  },
                  children: [
                    /* @__PURE__ */ t("text", { x: v, y: Ve - 6, textAnchor: "middle", className: "gravity-band-label", style: { fill: D }, children: Ot(p) }),
                    /* @__PURE__ */ t("line", { x1: v, y1: Ve, x2: v, y2: fn, className: "gravity-band-track" }),
                    /* @__PURE__ */ t("line", { x1: v, y1: k, x2: v, y2: A, stroke: D, className: "gravity-band-stem" }),
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        cx: v,
                        cy: k,
                        r: Tt,
                        fill: D,
                        className: "gravity-band-dot",
                        onPointerDown: (M) => d(M, p, "min"),
                        onPointerMove: h,
                        onPointerUp: g
                      }
                    ),
                    /* @__PURE__ */ t(
                      "circle",
                      {
                        cx: v,
                        cy: A,
                        r: Tt,
                        fill: D,
                        className: "gravity-band-dot",
                        onPointerDown: (M) => d(M, p, "max"),
                        onPointerMove: h,
                        onPointerUp: g
                      }
                    )
                  ]
                },
                p
              );
            })
          ]
        }
      )
    }
  );
}
function ua({ params: e, onParamChange: n, onGravitySet: s, hoveredType: o, onHoverType: a }) {
  const r = e.gravityMode, [c, l] = m.useState("band");
  return /* @__PURE__ */ f("div", { className: "gravity-controls", children: [
    /* @__PURE__ */ t("div", { className: "gravity-modes-row", children: /* @__PURE__ */ t("div", { className: "gravity-modes", role: "tablist", "aria-label": "Gravity layout mode", children: ["cartesian", "radial"].map((i) => /* @__PURE__ */ t(
      "button",
      {
        role: "tab",
        "aria-selected": r === i,
        className: `gravity-mode-btn${r === i ? " active" : ""}`,
        onClick: () => s({ gravityMode: i }),
        children: i === "cartesian" ? "Cartesian" : "Radial"
      },
      i
    )) }) }),
    /* @__PURE__ */ f("div", { className: "gravity-subtabs", role: "tablist", "aria-label": "Gravity force", children: [
      /* @__PURE__ */ t(
        Mt,
        {
          label: "Band",
          active: c === "band",
          enabled: e.bandEnabled,
          onSelect: () => l("band"),
          onToggle: (i) => s({ bandEnabled: i })
        }
      ),
      /* @__PURE__ */ t(
        Mt,
        {
          label: "Topological",
          active: c === "topological",
          enabled: e.topologicalEnabled,
          onSelect: () => l("topological"),
          onToggle: (i) => s({ topologicalEnabled: i })
        }
      )
    ] }),
    /* @__PURE__ */ f("div", { className: "gravity-bodies", children: [
      /* @__PURE__ */ t("div", { className: `gravity-body${c === "band" ? " active" : ""}`, "aria-hidden": c !== "band", children: /* @__PURE__ */ f("div", { className: `gravity-section-tools${e.bandEnabled ? "" : " inactive"}`, children: [
        /* @__PURE__ */ t(et, { children: /* @__PURE__ */ f(Ge, { children: [
          "F = ",
          /* @__PURE__ */ t(We, { id: "bandStrength", children: "strength" }),
          " × d",
          /* @__PURE__ */ t("sup", { children: /* @__PURE__ */ t(We, { id: "bandExp", children: "exp" }) })
        ] }) }),
        /* @__PURE__ */ t(da, { params: e, onParamChange: n, onGravitySet: s, hoveredType: o, onHoverType: a }),
        /* @__PURE__ */ t(pa, { params: e, onParamChange: n })
      ] }) }),
      /* @__PURE__ */ t("div", { className: `gravity-body${c === "topological" ? " active" : ""}`, "aria-hidden": c !== "topological", children: /* @__PURE__ */ f("div", { className: `gravity-section-tools gravity-topo${e.topologicalEnabled ? "" : " inactive"}`, children: [
        /* @__PURE__ */ t(et, { children: /* @__PURE__ */ f(Ge, { children: [
          "F = ",
          /* @__PURE__ */ t(We, { id: "topoStrength", children: "strength" }),
          " × depth",
          /* @__PURE__ */ t("sup", { children: /* @__PURE__ */ t(We, { id: "topoExp", children: "exp" }) }),
          " × d"
        ] }) }),
        /* @__PURE__ */ t(fa, { exp: e.gravityTopologicalExp }),
        /* @__PURE__ */ f("div", { className: "gravity-slider-row", children: [
          /* @__PURE__ */ t("label", { className: "graph-control-slider-label", children: "strength" }),
          /* @__PURE__ */ t(
            en,
            {
              min: 0,
              max: 2,
              step: 0.02,
              value: e.gravityDownstream,
              onChange: (i) => n({ gravityDownstream: i }),
              popId: "topoStrength"
            }
          )
        ] }),
        /* @__PURE__ */ f("div", { className: "gravity-slider-row", children: [
          /* @__PURE__ */ t("label", { className: "graph-control-slider-label", children: "exp" }),
          /* @__PURE__ */ t(
            en,
            {
              min: 1,
              max: 6,
              step: 0.1,
              value: e.gravityTopologicalExp,
              onChange: (i) => n({ gravityTopologicalExp: i }),
              popId: "topoExp"
            }
          )
        ] })
      ] }) })
    ] })
  ] });
}
function Mt({ label: e, active: n, enabled: s, onSelect: o, onToggle: a }) {
  return /* @__PURE__ */ f("div", { role: "tab", "aria-selected": n, className: `gravity-subtab${n ? " active" : ""}`, onClick: o, children: [
    /* @__PURE__ */ f("label", { className: `switch${s ? " on" : ""}`, onClick: (r) => r.stopPropagation(), children: [
      /* @__PURE__ */ t("input", { type: "checkbox", checked: s, onChange: (r) => a(r.target.checked), "aria-label": `${e} gravity enabled` }),
      /* @__PURE__ */ t("span", { className: "switch-track", children: /* @__PURE__ */ t("span", { className: "switch-knob" }) })
    ] }),
    /* @__PURE__ */ t("span", { className: "gravity-subtab-label", children: e })
  ] });
}
const St = 4;
function pa({
  params: e,
  onParamChange: n
}) {
  const [s, o] = m.useState(null), a = e.gravityBandExp, r = Math.max(e.gravityX, e.gravityY, 1e-6), c = (i) => Array.from({ length: un + 1 }, (d, h) => {
    const g = h / un, p = i / r * Math.pow(g, a), y = g * Je, v = Re - St - p * (Re - 2 * St);
    return `${y.toFixed(1)},${v.toFixed(1)}`;
  }).join(" "), l = [
    { id: "y", points: c(e.gravityY), color: "var(--color-workflow)", label: "Y" },
    { id: "x", points: c(e.gravityX), color: "var(--color-activity)", label: "X" }
  ];
  return /* @__PURE__ */ t(
    rt,
    {
      curves: l,
      xMax: 1,
      hoveredId: s,
      onHover: o,
      xLabel: "distance",
      yLabel: "force",
      ariaLabel: "Band force-response curves (X and Y)",
      exp: {
        value: a,
        min: 0.5,
        max: 3,
        step: 0.1,
        onChange: (i) => n({ gravityBandExp: i }),
        title: "Band falloff exponent. 1 = linear (Hooke); higher = softer just outside the band, stiffer far out.",
        popId: "bandExp"
      }
    }
  );
}
const Et = 220, Xn = 96, Un = 8, ha = 16;
function fa({ exp: e }) {
  const n = ha, s = Et - Un, o = Un, a = Xn - Un - 12, r = (o + a) / 2, c = 48, l = Array.from({ length: c + 1 }, (i, d) => {
    const h = d / c, g = Math.pow(h, e);
    return `${(n + h * (s - n)).toFixed(1)},${(a - g * (a - o)).toFixed(1)}`;
  }).join(" ");
  return /* @__PURE__ */ f("svg", { className: "gravity-topo-curve", viewBox: `0 0 ${Et} ${Xn}`, role: "img", "aria-label": "Depth-to-pull contrast curve", children: [
    /* @__PURE__ */ t("rect", { x: n, y: o, width: s - n, height: a - o, className: "spring-curve-frame" }),
    /* @__PURE__ */ t("polyline", { points: l, className: "gravity-topo-curve-line" }),
    /* @__PURE__ */ t("text", { x: (n + s) / 2, y: Xn - 1, textAnchor: "middle", className: "gravity-topo-curve-axis", children: "depth" }),
    /* @__PURE__ */ t("text", { x: 5, y: r, textAnchor: "middle", className: "gravity-topo-curve-axis", transform: `rotate(-90 5 ${r})`, children: "pull" })
  ] });
}
function ma({
  min: e,
  max: n,
  step: s,
  valueMin: o,
  valueMax: a,
  onChangeMin: r,
  onChangeMax: c
}) {
  const l = n - e, i = (o - e) / l * 100, d = Math.max(0, (a - o) / l * 100);
  return /* @__PURE__ */ f("div", { className: "dual-range dual-range-namespace", children: [
    /* @__PURE__ */ t("div", { className: "dual-range-track" }),
    /* @__PURE__ */ t("div", { className: "dual-range-fill", style: { left: `${i}%`, width: `${d}%` } }),
    /* @__PURE__ */ t(
      "input",
      {
        type: "range",
        className: "dual-range-input dual-range-input-low",
        min: e,
        max: n,
        step: s,
        value: o,
        onChange: (h) => r(Math.min(Number(h.target.value), a - s))
      }
    ),
    /* @__PURE__ */ t(
      "input",
      {
        type: "range",
        className: "dual-range-input dual-range-input-high",
        min: e,
        max: n,
        step: s,
        value: a,
        onChange: (h) => c(Math.max(Number(h.target.value), o + s))
      }
    )
  ] });
}
const ga = [
  { id: "push", label: "Push" },
  { id: "pull", label: "Pull" },
  { id: "gravity", label: "Gravity" },
  { id: "misc", label: "Misc" }
], ya = [
  {
    key: "velocityDecay",
    label: "friction",
    min: 0.05,
    max: 0.95,
    step: 0.05,
    tooltip: "Damping factor per tick. Higher = more friction"
  },
  {
    key: "alphaDecay",
    label: "cooling",
    min: 5e-4,
    max: 0.02,
    step: 5e-4,
    tooltip: "Energy lost per tick. Higher = settles faster"
  },
  {
    key: "alphaMin",
    label: "threshold",
    min: 0,
    max: 5e-3,
    step: 1e-4,
    tooltip: "Energy level below which simulation pauses"
  }
], ka = [
  {
    key: "baseMul",
    label: "size",
    min: 0.3,
    max: 2,
    step: 0.05,
    tooltip: "Overall node + label size. 1 = default."
  },
  {
    key: "maxZoomMul",
    label: "grow cap",
    min: 0.5,
    max: 3,
    step: 0.05,
    tooltip: "Zoom past which nodes stop growing. Lower = nodes start shrinking sooner as you zoom out."
  },
  {
    key: "minZoomMul",
    label: "shrink floor",
    min: 0.1,
    max: 1,
    step: 0.05,
    tooltip: "Smallest nodes may get when zoomed all the way out."
  }
];
function va({
  params: e,
  onParamChange: n,
  onAdjust: s,
  onGravityChange: o,
  onActiveSection: a,
  onActiveChargeType: r,
  onActiveGravityType: c,
  onActivePullEdge: l,
  nodeScale: i,
  onNodeScaleChange: d
}) {
  const [h, g] = m.useState(!1), [p, y] = m.useState("push"), [v, k] = m.useState(null), A = m.useCallback((w) => {
    k(w), l(w);
  }, [l]), [P, $] = m.useState(null), D = m.useCallback((w) => {
    $(w), r(w);
  }, [r]), [M, b] = m.useState(null), C = m.useCallback((w) => {
    b(w), c(w);
  }, [c]), F = m.useCallback((w) => {
    n(w), s();
  }, [n, s]);
  return /* @__PURE__ */ f("div", { className: `graph-control-panel ${h ? "open" : ""}`, children: [
    /* @__PURE__ */ t(
      "button",
      {
        className: "graph-control-panel-toggle",
        onClick: () => g(!h),
        title: "Toggle control panel",
        children: h ? "▼ Controls" : "▶ Controls"
      }
    ),
    h && /* @__PURE__ */ t(Ro, { children: /* @__PURE__ */ f("div", { className: "graph-control-panel-body", children: [
      /* @__PURE__ */ t("div", { className: "graph-control-tabs", role: "tablist", children: ga.map((w) => /* @__PURE__ */ t(
        "button",
        {
          role: "tab",
          "aria-selected": p === w.id,
          className: `graph-control-tab${p === w.id ? " active" : ""}`,
          onClick: () => y(w.id),
          children: w.label
        },
        w.id
      )) }),
      /* @__PURE__ */ f("div", { className: "graph-control-sections", children: [
        /* @__PURE__ */ t(Cn, { active: p === "push", children: /* @__PURE__ */ f(
          hn,
          {
            subtitle: "",
            equation: /* @__PURE__ */ f("span", { className: "eq-line", children: [
              "F =",
              /* @__PURE__ */ f("span", { className: "eq-frac", children: [
                /* @__PURE__ */ t("span", { className: "eq-num", children: /* @__PURE__ */ t(We, { id: "pushMultiplier", children: "charge" }) }),
                /* @__PURE__ */ f("span", { className: "eq-den", children: [
                  "(d² + ",
                  /* @__PURE__ */ t(We, { id: "coreRadiusMultiplier", children: "r" }),
                  "²)",
                  /* @__PURE__ */ t("sup", { children: /* @__PURE__ */ t(We, { id: "chargeExponent", children: "exp" }) })
                ] })
              ] })
            ] }),
            onHover: (w) => a(w ? "push" : null),
            children: [
              /* @__PURE__ */ t(
                na,
                {
                  params: e,
                  onParamChange: F,
                  hoveredType: P,
                  onHoverType: D
                }
              ),
              /* @__PURE__ */ t(
                ta,
                {
                  params: e,
                  onParamChange: F,
                  hoveredType: P,
                  onHoverType: D
                }
              )
            ]
          }
        ) }),
        /* @__PURE__ */ t(Cn, { active: p === "pull", children: /* @__PURE__ */ f(
          hn,
          {
            subtitle: "",
            equation: /* @__PURE__ */ f("span", { className: "eq-line", children: [
              "F = ",
              /* @__PURE__ */ t(We, { id: "pullMultiplier", children: "stiffness" }),
              " ×",
              /* @__PURE__ */ f("span", { className: "eq-frac", children: [
                /* @__PURE__ */ f("span", { className: "eq-num", children: [
                  "(d − ",
                  /* @__PURE__ */ t(We, { id: "distanceMultiplier", children: "length" }),
                  ")",
                  /* @__PURE__ */ t("sup", { children: /* @__PURE__ */ t(We, { id: "linkExponent", children: "exp" }) })
                ] }),
                /* @__PURE__ */ t("span", { className: "eq-den", children: "d" })
              ] })
            ] }),
            onHover: (w) => a(w ? "pull" : null),
            children: [
              /* @__PURE__ */ t(
                zo,
                {
                  params: e,
                  onParamChange: F,
                  hoveredEdge: v,
                  onHoverEdge: A
                }
              ),
              /* @__PURE__ */ t(
                Uo,
                {
                  params: e,
                  onParamChange: F,
                  hoveredEdge: v,
                  onHoverEdge: A
                }
              )
            ]
          }
        ) }),
        /* @__PURE__ */ t(Cn, { active: p === "gravity", children: /* @__PURE__ */ t(
          hn,
          {
            subtitle: "",
            equation: "",
            onHover: (w) => {
              a(w ? "gravity" : null), w || c(null);
            },
            children: /* @__PURE__ */ t(
              ua,
              {
                params: e,
                onParamChange: F,
                onGravitySet: o,
                hoveredType: M,
                onHoverType: C
              }
            )
          }
        ) }),
        /* @__PURE__ */ f(Cn, { active: p === "misc", children: [
          /* @__PURE__ */ f("div", { className: "graph-control-subsection", children: [
            /* @__PURE__ */ t("div", { className: "graph-control-subsection-title", children: "Dynamics" }),
            /* @__PURE__ */ t(hn, { subtitle: "", equation: `v ×= friction
α −= cooling, stop at threshold`, onHover: (w) => a(w ? "dynamics" : null), children: ya.map((w) => /* @__PURE__ */ t($t, { def: w, value: e[w.key], onChange: (R) => F({ [w.key]: R }) }, w.key)) })
          ] }),
          /* @__PURE__ */ f("div", { className: "graph-control-subsection", children: [
            /* @__PURE__ */ t("div", { className: "graph-control-subsection-title", children: "Node scaling" }),
            /* @__PURE__ */ t(hn, { subtitle: "", equation: "size = base × clamp(zoom, floor, cap)", onHover: () => {
            }, children: ka.map((w) => /* @__PURE__ */ t($t, { def: w, value: i[w.key], onChange: (R) => d({ [w.key]: R }) }, w.key)) })
          ] })
        ] })
      ] })
    ] }) })
  ] });
}
function Cn({ active: e, children: n }) {
  return /* @__PURE__ */ t("div", { className: `graph-control-section-slot${e ? " active" : ""}`, "aria-hidden": !e, children: n });
}
function hn({ subtitle: e, equation: n, onHover: s, children: o }) {
  return /* @__PURE__ */ f(
    "div",
    {
      className: "graph-control-equation-section",
      onMouseEnter: () => s(!0),
      onMouseLeave: () => s(!1),
      children: [
        e && /* @__PURE__ */ t("div", { className: "graph-control-equation-header", children: /* @__PURE__ */ f("span", { className: "graph-control-equation-subtitle", children: [
          "(",
          e,
          ")"
        ] }) }),
        /* @__PURE__ */ t(et, { children: n }),
        /* @__PURE__ */ t("div", { className: "graph-control-equation-body", children: o })
      ]
    }
  );
}
function $t({ def: e, value: n, onChange: s, nodeType: o }) {
  const a = e.step < 1 ? String(n) : String(Math.round(n)), r = o ? `graph-control-slider graph-control-typed-row graph-control-typed-${o}` : "graph-control-slider";
  return /* @__PURE__ */ f("div", { className: r, title: e.tooltip, children: [
    /* @__PURE__ */ t("label", { className: "graph-control-slider-label", children: e.label }),
    /* @__PURE__ */ t(en, { min: e.min, max: e.max, step: e.step, value: n, onChange: s }),
    /* @__PURE__ */ t("span", { className: "graph-control-slider-value", children: a })
  ] });
}
function ba(e) {
  const n = /* @__PURE__ */ new Map();
  for (const s of e.definitions ?? [])
    switch (s.type) {
      case "workflowDef":
        n.set(`workflow:${s.name}`, { sourceFile: s.sourceFile, def: s });
        break;
      case "activityDef":
        n.set(`activity:${s.name}`, { sourceFile: s.sourceFile, def: s });
        break;
      case "workerDef":
        n.set(`worker:${s.name}`, { sourceFile: s.sourceFile, def: s });
        break;
      case "namespaceDef": {
        n.set(`namespace:${s.name}`, { sourceFile: s.sourceFile, def: s });
        for (const o of s.endpoints ?? [])
          n.set(`nexusEndpoint:${o.endpointName}`, { sourceFile: s.sourceFile, def: s });
        break;
      }
      case "nexusServiceDef": {
        n.set(`nexusService:${s.name}`, { sourceFile: s.sourceFile, def: s });
        for (const o of s.operations ?? [])
          n.set(`nexusOperation:${s.name}.${o.name}`, { sourceFile: s.sourceFile, def: s });
        break;
      }
    }
  return n;
}
function wa(e) {
  const n = e.indexOf(":");
  return n < 0 ? { kind: e, name: "" } : { kind: e.slice(0, n), name: e.slice(n + 1) };
}
function xa(e) {
  switch (e) {
    case "namespace":
      return "namespace";
    case "nexusEndpoint":
      return "nexusEndpoint";
    case "worker":
      return "worker";
    case "nexusService":
      return "nexusService";
    case "workflow":
      return "workflow";
    case "nexusOperation":
      return "nexusOperation";
    case "activity":
      return "activity";
    default:
      return "workflow";
  }
}
function Na(e, n) {
  if (e === "nexusOperation") {
    const s = n.lastIndexOf(".");
    return s >= 0 ? n.slice(s + 1) : n;
  }
  return n;
}
function Ta(e, n) {
  const s = ba(n), o = /* @__PURE__ */ new Map(), a = [];
  let r = 0;
  const c = /* @__PURE__ */ new Map();
  for (const i of e.edges)
    i.kind === "containment" && c.set(i.from, i.to);
  for (const i of e.nodes) {
    const { kind: d, name: h } = wa(i.definition), g = xa(d), p = s.get(i.definition);
    o.set(i.id, {
      id: i.id,
      nodeType: g,
      name: Na(g, h),
      sourceFile: p == null ? void 0 : p.sourceFile,
      parentId: c.get(i.id),
      orphan: i.orphan ?? !1,
      definitionKey: i.definition,
      worker: i.worker,
      namespace: i.namespace,
      queue: i.queue
    });
  }
  for (const i of e.edges) {
    const d = Ma(i, o, r++);
    d && a.push(d);
  }
  for (const i of e.coarsenedEdges) {
    const d = Sa(i, o, r++);
    d && a.push(d);
  }
  const l = /* @__PURE__ */ new Map();
  for (const i of o.values()) {
    const d = l.get(i.definitionKey) ?? /* @__PURE__ */ new Set();
    d.add(i.id), l.set(i.definitionKey, d);
  }
  return { nodes: o, edges: a, duplicateGroups: l };
}
function Ma(e, n, s) {
  var l;
  const o = n.get(e.from), a = n.get(e.to);
  if (!o || !a) return null;
  const r = e.kind === "containment" || e.kind === "nexusRoute" ? "containment" : "dependency", c = {
    id: `e${s}`,
    edgeType: r,
    sourceId: e.from,
    targetId: e.to,
    sourceNodeType: o.nodeType,
    targetNodeType: a.nodeType
  };
  return (l = e.routing) != null && l.nexusEndpoint && (c.nexusEndpoint = e.routing.nexusEndpoint), c;
}
function Sa(e, n, s) {
  const o = n.get(e.from), a = n.get(e.to);
  return !o || !a ? null : {
    id: `e${s}`,
    edgeType: "dependency",
    sourceId: e.from,
    targetId: e.to,
    sourceNodeType: o.nodeType,
    targetNodeType: a.nodeType
  };
}
function Ea(e) {
  const n = [];
  for (const s of e.diagnostics)
    n.push({
      severity: s.severity,
      kind: "graph",
      code: s.code,
      message: s.message,
      name: s.from,
      start: { line: s.line, column: 0 },
      end: { line: s.line, column: 0 }
    });
  for (const s of e.unresolved) {
    const o = s.kind === "signalSend" ? "SIGNAL_TARGET_NOT_SAMPLED" : "UNRESOLVED_REFERENCE";
    n.push({
      severity: "warning",
      kind: "graph",
      code: o,
      message: `unresolved ${s.kind} target ${JSON.stringify(s.name)} (not present in the sampled input)`,
      name: s.from,
      start: { line: s.line, column: 0 },
      end: { line: s.line, column: 0 }
    });
  }
  return n;
}
function $a(e, n, s) {
  const o = m.useMemo(
    () => Ta(n, e),
    [n, e]
  ), a = m.useMemo(() => {
    const h = /* @__PURE__ */ new Set();
    for (const g of o.nodes.values())
      g.sourceFile && h.add(g.sourceFile);
    return Array.from(h).sort();
  }, [o]), r = m.useRef(s), [c, l] = m.useState(/* @__PURE__ */ new Set());
  m.useEffect(() => {
    const h = r.current;
    if (Rn(h, s)) return;
    const g = /* @__PURE__ */ new Set();
    for (const p of s.selectedFiles) h.selectedFiles.has(p) || g.add(`file:${p}`);
    for (const p of s.visibleTypes) h.visibleTypes.has(p) || g.add(`type:${p}`);
    if (r.current = s, g.size > 0) {
      l(g);
      const p = setTimeout(() => l(/* @__PURE__ */ new Set()), 450);
      return () => clearTimeout(p);
    }
  }, [s]);
  const i = e.errors || [], d = m.useMemo(
    () => [...e.diagnostics || [], ...Ea(n)],
    [e.diagnostics, n]
  );
  return {
    graph: o,
    allFiles: a,
    recentlyChanged: c,
    errors: i,
    diagnostics: d
  };
}
function Ca() {
  const [e, n] = m.useState(lo), s = m.useRef(null), o = m.useRef(!1), a = m.useRef(null), r = m.useCallback((c, l) => {
    const i = s.current;
    if (!i) return;
    const { width: d, height: h } = i.getBoundingClientRect();
    n(ct(c, d, h, l));
  }, []);
  return { viewport: e, setViewport: n, containerRef: s, initialFitDone: o, pendingCenterRef: a, fit: r };
}
function Da(e, n, s, o) {
  const a = /* @__PURE__ */ new Set([e]), r = [e];
  for (; r.length > 0; ) {
    const c = r.shift();
    for (const l of n) {
      if (l.edgeType === "containment") continue;
      let i;
      o === "downstream" && l.sourceId === c ? i = l.targetId : o === "upstream" && l.targetId === c && (i = l.sourceId), i && s.has(i) && !a.has(i) && (a.add(i), r.push(i));
    }
  }
  return a;
}
function Fa(e, n) {
  const s = /* @__PURE__ */ new Set();
  for (const o of n)
    o.edgeType !== "containment" && e.has(o.sourceId) && e.has(o.targetId) && s.add(o.id);
  return s;
}
function Aa(e, n, s, o, a) {
  const [r, c] = m.useState(null), [l, i] = m.useState(null), [d, h] = m.useState(-1), [g, p] = m.useState(!1), [y, v] = m.useState(null), [k, A] = m.useState(null), [P, $] = m.useState(null), [D, M] = m.useState(null);
  m.useEffect(() => {
    i(null), c(null), h(-1);
  }, [a]), m.useEffect(() => {
    const w = (V) => {
      V.key === "Shift" && p(!0);
    }, R = (V) => {
      V.key === "Shift" && p(!1);
    };
    return window.addEventListener("keydown", w), window.addEventListener("keyup", R), () => {
      window.removeEventListener("keydown", w), window.removeEventListener("keyup", R);
    };
  }, []);
  const b = d >= 0 && d < e.length ? e[d].id : null, { highlightedNodes: C, highlightedEdges: F } = m.useMemo(() => {
    const w = r ?? l;
    if (!w || !s.has(w))
      return { highlightedNodes: null, highlightedEdges: null };
    const R = o(w);
    if ((R == null ? void 0 : R.nodeType) === "nexusEndpoint") {
      const ne = /* @__PURE__ */ new Set([w]), ie = /* @__PURE__ */ new Set();
      R.parentId && s.has(R.parentId) && ne.add(R.parentId);
      for (const T of n)
        T.nexusEndpoint === R.name && (ie.add(T.id), s.has(T.sourceId) && ne.add(T.sourceId), s.has(T.targetId) && ne.add(T.targetId));
      return { highlightedNodes: ne, highlightedEdges: ie };
    }
    const re = Da(w, n, s, g ? "upstream" : "downstream");
    if ((R == null ? void 0 : R.nodeType) === "nexusService") {
      const ne = /* @__PURE__ */ new Set();
      for (const ie of e)
        ie.nodeType === "nexusOperation" && ie.parentId === w && ne.add(ie.id);
      for (const ie of n)
        if (ie.targetNodeType === "nexusEndpoint" && ne.has(ie.sourceId) && s.has(ie.targetId)) {
          re.add(ie.targetId);
          const T = o(ie.targetId);
          T != null && T.parentId && s.has(T.parentId) && re.add(T.parentId);
        }
    }
    const j = Fa(re, n);
    return { highlightedNodes: re, highlightedEdges: j };
  }, [r, l, g, n, s, e, o]);
  return {
    hoveredNodeId: r,
    setHoveredNodeId: c,
    selectedNodeId: l,
    setSelectedNodeId: i,
    focusedIndex: d,
    setFocusedIndex: h,
    shiftHeld: g,
    focusedNodeId: b,
    highlightedNodes: C,
    highlightedEdges: F,
    activeSection: y,
    setActiveSection: v,
    activeChargeType: k,
    setActiveChargeType: A,
    activeGravityType: P,
    setActiveGravityType: $,
    activePullEdge: D,
    setActivePullEdge: M
  };
}
function Pa(e, n) {
  const s = m.useRef(null), o = m.useRef(null), [a, r] = m.useState(!0), [c, l] = m.useState({ ...Xt }), [i, d] = m.useState(0), h = m.useRef(n);
  h.current = n, m.useEffect(() => {
    var M;
    s.current = new Mo(e, c), (M = h.current) == null || M.call(h), r(!0), d((b) => b + 1);
  }, [e]);
  const g = m.useCallback((M) => {
    var b;
    return (b = s.current) == null ? void 0 : b.getNode(M);
  }, []), p = m.useCallback((M) => {
    l((b) => {
      var F;
      const C = { ...b, ...M };
      return (F = s.current) == null || F.setParams(C), C;
    });
  }, []), y = m.useCallback(() => {
    var M;
    (M = s.current) == null || M.nudge(0.3), r(!0);
  }, []), v = m.useCallback((M) => {
    var b;
    l((C) => {
      var w;
      const F = { ...C, ...M };
      return (w = s.current) == null || w.setParams(F), F;
    }), (b = s.current) == null || b.reheat(0.6), r(!0);
  }, []), k = m.useCallback((M, b, C) => {
    var F, w;
    o.current = M, (F = s.current) == null || F.pinNode(M, b, C), (w = s.current) == null || w.reheat(0.3), r(!0);
  }, []), A = m.useCallback((M, b) => {
    var C;
    o.current && ((C = s.current) == null || C.pinNode(o.current, M, b));
  }, []), P = m.useCallback(() => {
    var M;
    o.current && ((M = s.current) == null || M.unpinNode(o.current), o.current = null);
  }, []), $ = m.useCallback(() => {
    var M;
    a ? r(!1) : ((M = s.current) == null || M.reheat(0.5), r(!0));
  }, [a]), D = m.useCallback(() => {
    var M;
    (M = s.current) == null || M.reheat(2), r(!0);
  }, []);
  return {
    simRef: s,
    simVersion: i,
    running: a,
    setRunning: r,
    forceParams: c,
    getNode: g,
    onParamChange: p,
    onForceAdjust: y,
    onGravityChange: v,
    onNodeDragStart: k,
    onNodeDragMove: A,
    onNodeDragEnd: P,
    onToggleRunning: $,
    onReheat: D
  };
}
function ns(e, n, s) {
  const o = s(e);
  if (!o) return null;
  let a = o.parentId;
  for (; a; ) {
    if (n.has(a)) return a;
    const r = s(a);
    a = r == null ? void 0 : r.parentId;
  }
  return null;
}
function tt(e, n, s, o, a, r) {
  if (n) return [e];
  const c = r(e);
  if ((c == null ? void 0 : c.nodeType) === "nexusOperation") {
    const i = [];
    for (const d of o.edges) {
      if (d.edgeType !== "dependency") continue;
      const h = s === "tgt" ? d.sourceId === e ? d.targetId : null : d.targetId === e ? d.sourceId : null;
      if (h)
        for (const g of tt(h, a.has(h), s, o, a, r))
          i.push(g);
    }
    if (i.length > 0) return i;
  }
  const l = ns(e, a, r);
  return l ? [l] : [];
}
function Ia(e, n) {
  var d;
  const s = /* @__PURE__ */ new Map();
  for (const h of n) {
    if (h.edgeType !== "dependency") continue;
    const g = s.get(h.sourceId);
    g ? g.push(h.targetId) : s.set(h.sourceId, [h.targetId]);
  }
  const o = /* @__PURE__ */ new Map();
  let a = 0;
  for (const h of e) {
    const g = /* @__PURE__ */ new Set([h.id]);
    let p = 0, y = [h.id];
    for (; y.length > 0; ) {
      const v = [];
      for (const k of y) {
        const A = s.get(k);
        if (A)
          for (const P of A)
            g.has(P) || (g.add(P), v.push(P));
      }
      v.length > 0 && p++, y = v;
    }
    o.set(h.id, p), p > a && (a = p);
  }
  const r = /* @__PURE__ */ new Map();
  if (a === 0) return r;
  const c = new Map(e.map((h) => [h.id, h])), l = /* @__PURE__ */ new Map();
  for (const h of e) l.set(h.id, o.get(h.id) ?? 0);
  for (const h of e) {
    const g = o.get(h.id) ?? 0;
    if (g <= 0) continue;
    let p = h.parentId, y = g;
    const v = /* @__PURE__ */ new Set();
    for (; p && !v.has(p) && (v.add(p), y += 1, !((l.get(p) ?? 0) >= y)); )
      l.set(p, y), p = (d = c.get(p)) == null ? void 0 : d.parentId;
  }
  let i = 0;
  for (const h of l.values()) h > i && (i = h);
  if (i === 0) return r;
  for (const [h, g] of l)
    r.set(h, g / i);
  return r;
}
function Ra(e, n, s) {
  const { summaryKind: o } = Ye(e.nodeType);
  if (o === "containerCount") {
    let l = 0, i = 0;
    for (const h of n) {
      if (h.edgeType !== "containment" || h.targetId !== e.id) continue;
      const g = s.get(h.sourceId);
      g && (g.nodeType === "worker" ? l++ : g.nodeType === "nexusEndpoint" && i++);
    }
    const d = [];
    return l > 0 && d.push(`${l} worker${l !== 1 ? "s" : ""}`), i > 0 && d.push(`${i} endpoint${i !== 1 ? "s" : ""}`), d.join(" · ");
  }
  if (o === "none") return "";
  if (o === "hostRegistrations") {
    let l = 0, i = 0, d = 0, h = 0;
    for (const p of n) {
      if (p.edgeType !== "containment" || p.targetId !== e.id) continue;
      const y = s.get(p.sourceId);
      y && (y.nodeType === "workflow" ? l++ : y.nodeType === "activity" ? i++ : y.nodeType === "nexusService" ? d++ : y.nodeType === "nexusOperation" && h++);
    }
    if (e.nodeType === "nexusService")
      return h > 0 ? `${h} op${h !== 1 ? "s" : ""}` : "";
    const g = [];
    return l > 0 && g.push(`${l}wf`), i > 0 && g.push(`${i}act`), d > 0 && g.push(`${d}nxs`), g.join(" · ");
  }
  let a = 0, r = 0;
  for (const l of n)
    l.edgeType !== "containment" && (l.sourceId === e.id && a++, l.targetId === e.id && r++);
  const c = [];
  return a > 0 && c.push(`→${a}`), r > 0 && c.push(`←${r}`), c.join(" ");
}
const Oa = {
  visibleNodes: [],
  visibleEdges: [],
  visibleIds: /* @__PURE__ */ new Set(),
  nodeSummaries: /* @__PURE__ */ new Map(),
  downstreamScores: /* @__PURE__ */ new Map()
};
function La(e, n, s, o) {
  return m.useMemo(() => {
    const a = e.current;
    if (!a) return Oa;
    const r = o.size > 0, c = /* @__PURE__ */ new Set(), l = [];
    for (const k of a.nodes)
      s.has(mn(k.nodeType)) && (r && k.sourceFile && !o.has(k.sourceFile) || (c.add(k.id), l.push(k)));
    const i = (k) => a.getNode(k), d = [], h = /* @__PURE__ */ new Map();
    for (const k of a.edges) {
      const A = c.has(k.sourceId), P = c.has(k.targetId);
      if (k.edgeType === "containment") {
        if (!A) continue;
        if (P)
          d.push(k);
        else {
          const $ = ns(k.targetId, c, i);
          if ($) {
            const D = i($);
            d.push({
              ...k,
              targetId: $,
              targetNodeType: (D == null ? void 0 : D.nodeType) ?? k.targetNodeType,
              id: `grad:${k.id}`
            });
          }
        }
      } else {
        const $ = tt(k.sourceId, A, "src", a, c, i), D = tt(k.targetId, P, "tgt", a, c, i);
        for (const M of $)
          for (const b of D) {
            if (M === b) continue;
            const C = `${M}→${b}`, F = h.get(C);
            if (F && F.nexusEndpoint && !k.nexusEndpoint) continue;
            const w = i(M), R = i(b);
            h.set(C, {
              ...k,
              sourceId: M,
              targetId: b,
              sourceNodeType: (w == null ? void 0 : w.nodeType) ?? k.sourceNodeType,
              targetNodeType: (R == null ? void 0 : R.nodeType) ?? k.targetNodeType,
              id: `grad:${C}`
            });
          }
      }
    }
    const g = [...d, ...h.values()], p = /* @__PURE__ */ new Map();
    for (const k of l) p.set(k.id, k);
    const y = /* @__PURE__ */ new Map();
    for (const k of l) {
      const A = Ra(k, g, p);
      A && y.set(k.id, A);
    }
    const v = Ia(l, g);
    return { visibleNodes: l, visibleEdges: g, visibleIds: c, nodeSummaries: y, downstreamScores: v };
  }, [s, o, n]);
}
function Ba({
  simRef: e,
  running: n,
  setRunning: s,
  visibleIds: o,
  visibleNodes: a,
  downstreamScores: r,
  visibleTypes: c,
  selectedFiles: l,
  hoveredNodeId: i,
  selectedNodeId: d,
  containerRef: h,
  initialFitDone: g,
  pendingCenterRef: p,
  setViewport: y,
  setSelectedNodeId: v
}) {
  const [k, A] = m.useState(0), P = m.useRef({ frames: 0, lastStamp: 0 });
  m.useEffect(() => {
    if (!n) return;
    let b = 0;
    P.current = { frames: 0, lastStamp: 0 };
    const C = () => {
      const F = e.current;
      if (!F) return;
      if (F.tick(o, r), !g.current && F.alpha < 0.3) {
        const re = h.current;
        if (re) {
          const { width: j, height: ne } = re.getBoundingClientRect();
          j > 0 && ne > 0 && (y(ct(a, j, ne)), g.current = !0);
        }
      }
      if (g.current && p.current) {
        const re = F.getNode(p.current.nodeId);
        if (re) {
          const j = h.current;
          if (j) {
            const { width: ne, height: ie } = j.getBoundingClientRect();
            y((T) => ({
              scale: Math.max(T.scale, 1.2),
              x: ne / 2 - re.x * Math.max(T.scale, 1.2),
              y: ie / 2 - re.y * Math.max(T.scale, 1.2)
            })), v(re.id);
          }
        }
        p.current = null;
      }
      const w = performance.now(), R = P.current;
      R.frames++, R.lastStamp === 0 && (R.lastStamp = w);
      const V = w - R.lastStamp;
      if (V >= 500) {
        const re = Math.round(R.frames * 1e3 / V);
        A((j) => j === re ? j : re), R.frames = 0, R.lastStamp = w;
      }
      if (F.isStable()) {
        s(!1);
        return;
      }
      b = requestAnimationFrame(C);
    };
    return b = requestAnimationFrame(C), () => {
      b && cancelAnimationFrame(b);
    };
  }, [n, o, a, d]);
  const [, $] = m.useState(0);
  m.useEffect(() => {
    if (!n || !i) return;
    const b = window.setInterval(() => $((C) => C + 1), 100);
    return () => window.clearInterval(b);
  }, [n, i]);
  const D = m.useRef(c);
  m.useEffect(() => {
    const b = D.current;
    if (b === c) return;
    const C = e.current;
    if (C) {
      for (const F of C.nodes) {
        const w = mn(F.nodeType);
        if (c.has(w) && !b.has(w)) {
          let R = F.parentId;
          for (; R; ) {
            const V = C.getNode(R);
            if (!V) break;
            if (c.has(mn(V.nodeType))) {
              C.seedAt(F.id, V.x, V.y);
              break;
            }
            R = V.parentId;
          }
        }
      }
      C.reheat(0.5), s(!0), g.current = !1;
    }
    D.current = c;
  }, [c]);
  const M = m.useRef(l);
  return m.useEffect(() => {
    if (M.current === l) return;
    const C = e.current;
    C && (C.reheat(0.3), s(!0)), M.current = l;
  }, [l]), { fps: k };
}
function _a({
  active: e,
  ast: n,
  parserGraph: s,
  onShowInTree: o,
  filter: a,
  onFilterChange: r,
  pins: c,
  onPinsChange: l,
  searchQuery: i,
  searchActive: d,
  onSearchChange: h,
  pendingFocus: g,
  onFocusConsumed: p,
  overriddenPins: y,
  onOverriddenPinsConsumed: v
}) {
  const k = a.visibleTypes, A = a.selectedFiles, { viewport: P, setViewport: $, containerRef: D, initialFitDone: M, pendingCenterRef: b, fit: C } = Ca(), F = m.useRef(null), [w, R] = m.useState(!1), {
    graph: V,
    allFiles: re,
    recentlyChanged: j,
    errors: ne,
    diagnostics: ie
  } = $a(n, s, a), T = m.useCallback(() => {
    M.current = !1;
  }, [M]), {
    simRef: z,
    simVersion: X,
    running: pe,
    setRunning: Ee,
    forceParams: Ce,
    getNode: Ne,
    onParamChange: Ie,
    onForceAdjust: De,
    onGravityChange: H,
    onNodeDragStart: E,
    onNodeDragMove: u,
    onNodeDragEnd: W,
    onToggleRunning: U
  } = Pa(V, T), [B, S] = m.useState(ps), I = m.useCallback((L) => {
    S((G) => ({ ...G, ...L }));
  }, []);
  m.useEffect(() => {
    if (y.size === 0) return;
    const L = setTimeout(v, 600);
    return () => clearTimeout(L);
  }, [y, v]);
  const { visibleNodes: x, visibleEdges: q, visibleIds: Y, nodeSummaries: le, downstreamScores: ce } = La(z, X, k, A), {
    hoveredNodeId: _,
    setHoveredNodeId: N,
    selectedNodeId: Z,
    setSelectedNodeId: ge,
    setFocusedIndex: vn,
    shiftHeld: bn,
    focusedNodeId: qe,
    highlightedNodes: sn,
    highlightedEdges: wn,
    activeSection: Bn,
    setActiveSection: xn,
    activeChargeType: Nn,
    setActiveChargeType: J,
    activeGravityType: fe,
    setActiveGravityType: he,
    activePullEdge: Q,
    setActivePullEdge: K
  } = Aa(x, q, Y, Ne, V), { visibleMatchIds: oe, hiddenMatchCount: ae } = m.useMemo(() => {
    if (!i) return { visibleMatchIds: null, hiddenMatchCount: 0 };
    const L = i.toLowerCase(), G = z.current;
    if (!G) return { visibleMatchIds: /* @__PURE__ */ new Set(), hiddenMatchCount: 0 };
    const xe = /* @__PURE__ */ new Set();
    let O = 0;
    for (const se of G.nodes)
      se.name.toLowerCase().includes(L) && (Y.has(se.id) ? xe.add(se.id) : O++);
    return { visibleMatchIds: xe, hiddenMatchCount: O };
  }, [i, Y]), { fps: be } = Ba({
    simRef: z,
    running: pe,
    setRunning: Ee,
    visibleIds: Y,
    visibleNodes: x,
    downstreamScores: ce,
    visibleTypes: k,
    selectedFiles: A,
    hoveredNodeId: _,
    selectedNodeId: Z,
    containerRef: D,
    initialFitDone: M,
    pendingCenterRef: b,
    setViewport: $,
    setSelectedNodeId: ge
  }), ee = m.useCallback((L) => {
    const G = z.current;
    if (!G || !G.getNode(L)) return;
    const O = /* @__PURE__ */ new Set([L]);
    for (const de of G.edges)
      de.sourceId === L && O.add(de.targetId), de.targetId === L && O.add(de.sourceId);
    const se = G.nodes.filter((de) => O.has(de.id));
    C(se, 80);
  }, [C]), me = m.useCallback(() => {
    C(x);
  }, [C, x]), ye = () => {
    d ? h("", !1) : (h(i, !0), setTimeout(() => {
      var L;
      return (L = F.current) == null ? void 0 : L.focus();
    }, 50));
  }, te = m.useRef(null), Te = m.useCallback(() => {
    te.current !== null && (clearTimeout(te.current), te.current = null);
  }, []), we = m.useCallback((L) => {
    Te(), L !== null ? N(L) : te.current = window.setTimeout(() => {
      N(null), te.current = null;
    }, 150);
  }, [Te, N]), ve = (L) => {
    ge(L);
    const G = z.current, xe = D.current;
    if (!G || !xe) return;
    const O = G.getNode(L);
    if (!O) return;
    const { width: se, height: de } = xe.getBoundingClientRect();
    $({
      scale: P.scale,
      x: se / 2 - O.x * P.scale,
      y: de / 2 - O.y * P.scale
    });
  };
  m.useEffect(() => {
    var se;
    if (!g) return;
    const { name: L, defType: G } = g, xe = ro(G), O = z.current;
    if (O) {
      const de = O.nodes.find((ze) => ze.name === L && ze.nodeType === xe);
      de && (b.current = { nodeId: de.id }, pe || ((se = z.current) == null || se.reheat(0.1), Ee(!0)));
    }
    p();
  }, [g]), m.useEffect(() => {
    if (!e) return;
    const L = (G) => {
      var xe;
      if (!(G.target instanceof HTMLInputElement || G.target instanceof HTMLTextAreaElement))
        switch (G.key) {
          case "Tab": {
            G.preventDefault();
            const O = x.length;
            if (O === 0) return;
            G.shiftKey ? vn((se) => se > 0 ? se - 1 : O - 1) : vn((se) => se < O - 1 ? se + 1 : 0);
            break;
          }
          case "Enter": {
            G.preventDefault(), qe && ge(qe);
            break;
          }
          case "Escape": {
            if (G.preventDefault(), w) {
              R(!1);
              break;
            }
            if (d) {
              ye();
              break;
            }
            if (Z) {
              ge(null);
              break;
            }
            break;
          }
          case "ArrowLeft":
          case "ArrowRight":
          case "ArrowUp":
          case "ArrowDown": {
            G.preventDefault();
            const O = 30, se = G.key === "ArrowLeft" ? O : G.key === "ArrowRight" ? -O : 0, de = G.key === "ArrowUp" ? O : G.key === "ArrowDown" ? -O : 0;
            $((ze) => ({ ...ze, x: ze.x + se, y: ze.y + de }));
            break;
          }
          case "+":
          case "=": {
            G.preventDefault(), $((O) => {
              var se, de;
              return Yn(O, (((se = D.current) == null ? void 0 : se.clientWidth) ?? 400) / 2, (((de = D.current) == null ? void 0 : de.clientHeight) ?? 400) / 2, 1.15);
            });
            break;
          }
          case "-":
          case "_": {
            G.preventDefault(), $((O) => {
              var se, de;
              return Yn(O, (((se = D.current) == null ? void 0 : se.clientWidth) ?? 400) / 2, (((de = D.current) == null ? void 0 : de.clientHeight) ?? 400) / 2, 0.85);
            });
            break;
          }
          case "f":
          case "F": {
            G.preventDefault(), me();
            break;
          }
          case "/": {
            G.preventDefault(), d ? (xe = F.current) == null || xe.focus() : (h(i, !0), setTimeout(() => {
              var O;
              return (O = F.current) == null ? void 0 : O.focus();
            }, 50));
            break;
          }
          case " ": {
            G.preventDefault(), U();
            break;
          }
          case "?": {
            G.preventDefault(), R((O) => !O);
            break;
          }
        }
    };
    return window.addEventListener("keydown", L), () => window.removeEventListener("keydown", L);
  }, [e, x, qe, Z, d, i, h, w, me, U]);
  const $e = x.length, Se = q.length, Fe = ae > 0 ? /* @__PURE__ */ f("span", { className: "header-search-badge", title: `${ae} match${ae !== 1 ? "es" : ""} hidden by filters`, children: [
    "+",
    ae
  ] }) : null;
  return /* @__PURE__ */ f("div", { className: "graph-view", ref: D, children: [
    /* @__PURE__ */ f("div", { className: "graph-canvas-area", children: [
      /* @__PURE__ */ t(
        Io,
        {
          nodes: x,
          edges: q,
          viewport: P,
          onViewportChange: $,
          onNodeDragStart: E,
          onNodeDragMove: u,
          onNodeDragEnd: W,
          onDoubleClickNode: ee,
          onHoverNode: we,
          onSelectNode: ge,
          highlightedNodes: sn,
          highlightedEdges: wn,
          hoveredNodeId: _,
          selectedNodeId: Z,
          focusedNodeId: qe,
          searchMatchIds: oe,
          running: pe,
          forceParams: Ce,
          activeSection: Bn,
          activeChargeType: Nn,
          activeGravityType: fe,
          activePullEdge: Q,
          nodeScale: B
        }
      ),
      /* @__PURE__ */ t(
        Wa,
        {
          hoveredNodeId: _,
          simRef: z,
          visibleEdges: q,
          visibleIds: Y,
          viewport: P,
          shiftHeld: bn,
          duplicateGroups: V.duplicateGroups,
          nodeSummaries: le,
          onShowInTree: o,
          onMouseEnter: Te,
          onMouseLeave: () => we(null)
        }
      )
    ] }),
    /* @__PURE__ */ f("div", { className: "graph-overlay", children: [
      /* @__PURE__ */ t(
        Ht,
        {
          ast: n,
          allFiles: re,
          filter: a,
          onFilterChange: r,
          pins: c,
          onPinsChange: l,
          overriddenPins: y,
          recentlyChanged: j,
          searchQuery: i,
          searchActive: d,
          onSearchChange: h,
          searchInputRef: F,
          searchTitle: "Search nodes (/)",
          searchPlaceholder: "Search nodes...",
          searchExtra: Fe,
          errors: ne,
          diagnostics: ie
        }
      ),
      oe && oe.size > 0 && d && /* @__PURE__ */ t("div", { className: "graph-search-results", children: x.filter((L) => oe.has(L.id)).map((L) => /* @__PURE__ */ f(
        "button",
        {
          className: "graph-search-result",
          onClick: () => ve(L.id),
          children: [
            /* @__PURE__ */ t("span", { className: "graph-search-result-type", children: L.nodeType }),
            /* @__PURE__ */ t("span", { className: "graph-search-result-name", children: L.name })
          ]
        },
        L.id
      )) })
    ] }),
    /* @__PURE__ */ t("div", { className: `graph-bottom-left${w ? " shifted" : ""}`, children: /* @__PURE__ */ f("span", { className: "graph-count", children: [
      $e,
      " node",
      $e !== 1 ? "s" : "",
      ", ",
      Se,
      " edge",
      Se !== 1 ? "s" : ""
    ] }) }),
    /* @__PURE__ */ f("div", { className: "graph-bottom-center", children: [
      /* @__PURE__ */ t("button", { className: "graph-toolbar-btn", onClick: me, title: "Fit to view (F)", children: "Fit" }),
      /* @__PURE__ */ t(
        "button",
        {
          className: `graph-toolbar-btn ${pe ? "active" : ""}`,
          onClick: U,
          title: pe ? "Pause simulation (Space)" : "Resume simulation (Space)",
          children: pe ? "Pause" : "Play"
        }
      ),
      /* @__PURE__ */ f("span", { className: `graph-count-fps${pe ? "" : " hidden"}`, title: "Simulation frames per second", children: [
        be,
        " fps"
      ] })
    ] }),
    /* @__PURE__ */ t(
      va,
      {
        params: Ce,
        onParamChange: Ie,
        onAdjust: De,
        onGravityChange: H,
        onActiveSection: xn,
        onActiveChargeType: J,
        onActiveGravityType: he,
        onActivePullEdge: K,
        nodeScale: B,
        onNodeScaleChange: I
      }
    ),
    w && /* @__PURE__ */ f("div", { className: "graph-shortcuts-panel", children: [
      /* @__PURE__ */ f("div", { className: "graph-shortcuts-title", children: [
        "Keyboard Shortcuts",
        /* @__PURE__ */ t("button", { className: "graph-shortcuts-close", onClick: () => R(!1), children: "×" })
      ] }),
      /* @__PURE__ */ f("div", { className: "graph-shortcuts-list", children: [
        /* @__PURE__ */ t(_e, { keys: "Tab / Shift+Tab", desc: "Cycle focus" }),
        /* @__PURE__ */ t(_e, { keys: "Enter", desc: "Select focused node" }),
        /* @__PURE__ */ t(_e, { keys: "Escape", desc: "Deselect / close" }),
        /* @__PURE__ */ t(_e, { keys: "Arrow keys", desc: "Pan viewport" }),
        /* @__PURE__ */ t(_e, { keys: "+ / -", desc: "Zoom in / out" }),
        /* @__PURE__ */ t(_e, { keys: "F", desc: "Fit to view" }),
        /* @__PURE__ */ t(_e, { keys: "/", desc: "Open search" }),
        /* @__PURE__ */ t(_e, { keys: "Space", desc: "Toggle simulation" }),
        /* @__PURE__ */ t(_e, { keys: "Shift + hover", desc: "Upstream deps" }),
        /* @__PURE__ */ t(_e, { keys: "?", desc: "This panel" })
      ] })
    ] })
  ] });
}
function Ct(e) {
  if (!e) return;
  const n = e.indexOf(":");
  return n >= 0 ? e.slice(n + 1) : e;
}
function Wa({ hoveredNodeId: e, simRef: n, visibleEdges: s, visibleIds: o, viewport: a, shiftHeld: r, duplicateGroups: c, nodeSummaries: l, onShowInTree: i, onMouseEnter: d, onMouseLeave: h }) {
  var re, j;
  if (!e) return null;
  const g = n.current;
  if (!g) return null;
  const p = g.getNode(e);
  if (!p) return null;
  const y = p.parentId ? (re = g.getNode(p.parentId)) == null ? void 0 : re.name : void 0;
  let v;
  switch (p.nodeType) {
    case "nexusEndpoint":
      v = [y, p.queue].filter(Boolean).join(" · ") || void 0;
      break;
    case "nexusService":
      v = [Ct(p.worker), p.queue].filter(Boolean).join(" · ") || void 0;
      break;
    case "nexusOperation":
      v = [y, Ct(p.worker), p.queue].filter(Boolean).join(" · ") || void 0;
      break;
    default:
      v = y;
  }
  const k = st.find((ne) => ne.type === mn(p.nodeType)), A = (j = p.sourceFile) == null ? void 0 : j.split("/").pop(), P = Ye(p.nodeType).summaryKind, $ = (P === "containerCount" || P === "hostRegistrations") && l.get(e) || void 0;
  let D = 0, M = 0;
  for (const ne of s)
    ne.edgeType !== "containment" && (ne.sourceId === e && D++, ne.targetId === e && M++);
  const b = c.get(p.definitionKey), C = b ? Array.from(b).filter((ne) => o.has(ne)) : [p.id], F = C.length, w = F > 1 ? C.indexOf(p.id) + 1 : 0, [R, V] = Pe(a, p.x, p.y);
  return /* @__PURE__ */ f(
    "div",
    {
      className: "graph-hover-tooltip",
      style: { left: R, top: V },
      onMouseEnter: d,
      onMouseLeave: h,
      children: [
        /* @__PURE__ */ f("div", { className: "tooltip-identity", children: [
          k && /* @__PURE__ */ t("span", { className: "tooltip-type-icon", children: k.icon }),
          /* @__PURE__ */ t("span", { className: "tooltip-name", children: p.name })
        ] }),
        v && /* @__PURE__ */ t("div", { className: "tooltip-parent", children: v }),
        $ && /* @__PURE__ */ t("div", { className: "tooltip-summary", children: $ }),
        A && /* @__PURE__ */ t("div", { className: "tooltip-file", children: A }),
        F > 1 && /* @__PURE__ */ f("div", { className: "tooltip-duplicates", title: "This definition is registered on multiple workers. Hovering any copy highlights all copies.", children: [
          "copy ",
          w,
          " of ",
          F
        ] }),
        (D > 0 || M > 0) && /* @__PURE__ */ f("div", { className: "tooltip-connections", children: [
          D > 0 && /* @__PURE__ */ f("span", { className: "tooltip-conn-out", children: [
            "→",
            D
          ] }),
          M > 0 && /* @__PURE__ */ f("span", { className: "tooltip-conn-in", children: [
            "←",
            M
          ] })
        ] }),
        /* @__PURE__ */ t("div", { className: "tooltip-direction", children: r ? "dependents" : "dependencies" }),
        i && /* @__PURE__ */ t(
          "button",
          {
            className: "tooltip-show-in-tree",
            onClick: () => i(p.name, mn(p.nodeType)),
            title: "Show in Tree view",
            children: "Show in Tree"
          }
        )
      ]
    }
  );
}
function _e({ keys: e, desc: n }) {
  return /* @__PURE__ */ f("div", { className: "graph-shortcut-row", children: [
    /* @__PURE__ */ t("kbd", { className: "graph-shortcut-key", children: e }),
    /* @__PURE__ */ t("span", { className: "graph-shortcut-desc", children: n })
  ] });
}
function Va(e, n, s, o) {
  switch (o.kind) {
    case "manual":
      return Ga(e, n, s);
    case "focus":
      return Ha(e, s, o.target);
  }
}
function Ga(e, n, s) {
  const o = Rt(e);
  return s.files || (o.selectedFiles = new Set(n.selectedFiles)), s.types || (o.visibleTypes = new Set(n.visibleTypes)), {
    filter: Rn(o, e) ? e : o,
    overriddenPins: /* @__PURE__ */ new Set()
  };
}
function Ha(e, n, s) {
  const o = Rt(e), a = /* @__PURE__ */ new Set();
  return o.visibleTypes.has(s.defType) || (o.visibleTypes.add(s.defType), n.types && a.add("types")), s.sourceFile && e.selectedFiles.size > 0 && !e.selectedFiles.has(s.sourceFile) && (o.selectedFiles.add(s.sourceFile), n.files && a.add("files")), {
    filter: Rn(o, e) ? e : o,
    overriddenPins: a
  };
}
const In = "temporal-architect-visualizer-state";
let cn = null, Dt = !1;
function ts() {
  if (Dt) return cn;
  Dt = !0;
  const e = window;
  if (e.__twfVsCodeApi)
    return cn = e.__twfVsCodeApi, cn;
  if (typeof e.acquireVsCodeApi == "function")
    try {
      return cn = e.acquireVsCodeApi(), e.__twfVsCodeApi = cn, cn;
    } catch {
      return null;
    }
  return null;
}
function qa() {
  const e = ts();
  if (e) {
    const n = e.getState();
    if (n && typeof n == "object") {
      const o = n[In];
      if (o && typeof o == "object")
        return o;
    }
    return {};
  }
  try {
    const n = localStorage.getItem(In);
    return n ? JSON.parse(n) : {};
  } catch {
    return {};
  }
}
function za(e) {
  const n = ts();
  if (n) {
    const s = n.getState(), o = s && typeof s == "object" ? { ...s } : {};
    o[In] = e, n.setState(o);
    return;
  }
  try {
    localStorage.setItem(In, JSON.stringify(e));
  } catch {
  }
}
const Ke = m.createContext({
  workflows: /* @__PURE__ */ new Map(),
  activities: /* @__PURE__ */ new Map(),
  workers: /* @__PURE__ */ new Map(),
  nexusServices: /* @__PURE__ */ new Map(),
  namespaces: /* @__PURE__ */ new Map()
}), kn = m.createContext({
  signals: /* @__PURE__ */ new Map(),
  queries: /* @__PURE__ */ new Map(),
  updates: /* @__PURE__ */ new Map()
}), ss = m.createContext({
  callers: /* @__PURE__ */ new Map(),
  workerOf: /* @__PURE__ */ new Map(),
  namespaceOf: /* @__PURE__ */ new Map(),
  navigateTo: () => {
  }
}), Xa = st.filter((e) => e.defaultOn).map((e) => e.type);
function Ft(e) {
  return {
    selectedFiles: e.focusedFile ? /* @__PURE__ */ new Set([e.focusedFile]) : /* @__PURE__ */ new Set(),
    visibleTypes: new Set(Xa)
  };
}
const At = { files: !1, types: !1 };
function Pt(e, n) {
  return e ? {
    selectedFiles: new Set(e.selectedFiles),
    visibleTypes: new Set(e.visibleTypes)
  } : n;
}
function It(e) {
  return {
    selectedFiles: Array.from(e.selectedFiles),
    visibleTypes: Array.from(e.visibleTypes)
  };
}
function ja({ ast: e, parserGraph: n, onOpenFile: s, onRefocus: o, className: a, style: r }) {
  const c = n ?? is, l = e.definitions.length === 0, i = m.useMemo(() => qa(), []), [d, h] = m.useState(l ? "graph" : "tree"), [g, p] = m.useState(l), [y, v] = m.useState(
    () => Pt(i.treeFilter, Ft(e))
  ), [k, A] = m.useState(
    () => Pt(i.graphFilter, Ft(e))
  ), [P, $] = m.useState(() => i.treePins ?? At), [D, M] = m.useState(() => i.graphPins ?? At), [b, C] = m.useState(i.searchQuery ?? ""), [F, w] = m.useState(!1), [R, V] = m.useState(null), [re, j] = m.useState(/* @__PURE__ */ new Set()), [ne, ie] = m.useState(/* @__PURE__ */ new Set());
  m.useEffect(() => {
    za({
      treeFilter: It(y),
      graphFilter: It(k),
      treePins: P,
      graphPins: D,
      searchQuery: b
    });
  }, [y, k, P, D, b]), m.useEffect(() => {
    const H = /* @__PURE__ */ new Set();
    for (const u of e.definitions)
      u.sourceFile && H.add(u.sourceFile);
    const E = (u) => {
      const W = new Set([...u.selectedFiles].filter((U) => H.has(U)));
      return W.size === u.selectedFiles.size ? u : { ...u, selectedFiles: W };
    };
    v(E), A(E);
  }, [e.definitions]), m.useEffect(() => {
    P.files || e.focusedFile && v((H) => {
      const E = /* @__PURE__ */ new Set([e.focusedFile]);
      return H.selectedFiles.size === 1 && H.selectedFiles.has(e.focusedFile) ? H : { ...H, selectedFiles: E };
    });
  }, [e.focusedFile, P.files]);
  const T = m.useMemo(() => {
    const H = /* @__PURE__ */ new Map(), E = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Map(), W = /* @__PURE__ */ new Map(), U = /* @__PURE__ */ new Map();
    for (const B of e.definitions)
      B.type === "workflowDef" ? H.set(B.name, B) : B.type === "activityDef" ? E.set(B.name, B) : B.type === "workerDef" ? u.set(B.name, B) : B.type === "nexusServiceDef" ? W.set(B.name, B) : B.type === "namespaceDef" && U.set(B.name, B);
    return { workflows: H, activities: E, workers: u, nexusServices: W, namespaces: U };
  }, [e]), z = m.useCallback((H, E) => {
    if (H === "tree" && l || H === d && E.kind === "manual") return;
    const u = H === "tree" ? y : k, W = H === "tree" ? k : y, U = H === "tree" ? P : D, { filter: B, overriddenPins: S } = Va(u, W, U, E);
    H === "tree" ? (B !== u && v(B), j(S)) : (B !== u && A(B), ie(S)), E.kind === "focus" && V({ name: E.target.name, defType: E.target.defType }), H === "graph" && p(!0), h(H);
  }, [d, y, k, P, D, l]), X = m.useCallback((H, E) => {
    const u = e.definitions.find((W) => W.name === H && W.type === E);
    z("graph", {
      kind: "focus",
      target: { name: H, defType: E, sourceFile: u == null ? void 0 : u.sourceFile }
    });
  }, [e.definitions, z]), pe = m.useCallback((H, E) => {
    const u = e.definitions.find((W) => W.name === H && W.type === E);
    z("tree", {
      kind: "focus",
      target: { name: H, defType: E, sourceFile: u == null ? void 0 : u.sourceFile }
    });
  }, [e.definitions, z]), Ee = m.useCallback(() => V(null), []), Ce = m.useCallback((H, E) => {
    C(H), w(E);
  }, []), Ne = m.useCallback(() => {
    j((H) => H.size === 0 ? H : /* @__PURE__ */ new Set());
  }, []), Ie = m.useCallback(() => {
    ie((H) => H.size === 0 ? H : /* @__PURE__ */ new Set());
  }, []);
  m.useEffect(() => {
    y.selectedFiles.size === 1 && s && s(y.selectedFiles.values().next().value);
  }, [y.selectedFiles, s]);
  const De = a ? `view-shell ${a}` : "view-shell";
  return /* @__PURE__ */ t(Ke.Provider, { value: T, children: /* @__PURE__ */ f("div", { className: De, style: r, onClick: o, children: [
    /* @__PURE__ */ f("div", { className: "tab-bar", children: [
      !l && /* @__PURE__ */ t(
        "button",
        {
          className: `tab-bar-btn ${d === "tree" ? "active" : ""}`,
          onClick: () => z("tree", { kind: "manual" }),
          children: "Tree"
        }
      ),
      /* @__PURE__ */ t(
        "button",
        {
          className: `tab-bar-btn ${d === "graph" ? "active" : ""}`,
          onClick: () => z("graph", { kind: "manual" }),
          children: "Graph"
        }
      )
    ] }),
    !l && /* @__PURE__ */ t("div", { className: `view-pane${d === "tree" ? "" : " hidden"}`, children: /* @__PURE__ */ t(
      oo,
      {
        active: d === "tree",
        ast: e,
        onShowInGraph: X,
        filter: y,
        onFilterChange: v,
        pins: P,
        onPinsChange: $,
        searchQuery: b,
        searchActive: F,
        onSearchChange: Ce,
        pendingFocus: R,
        onFocusConsumed: Ee,
        overriddenPins: re,
        onOverriddenPinsConsumed: Ne
      }
    ) }),
    g && /* @__PURE__ */ t("div", { className: `view-pane${d === "graph" ? "" : " hidden"}`, children: /* @__PURE__ */ t(
      _a,
      {
        active: d === "graph",
        ast: e,
        parserGraph: c,
        onShowInTree: l ? void 0 : pe,
        filter: k,
        onFilterChange: A,
        pins: D,
        onPinsChange: M,
        searchQuery: b,
        searchActive: F,
        onSearchChange: Ce,
        pendingFocus: R,
        onFocusConsumed: Ee,
        overriddenPins: ne,
        onOverriddenPinsConsumed: Ie
      }
    ) })
  ] }) });
}
export {
  is as EMPTY_PARSER_GRAPH,
  ja as Visualizer
};
//# sourceMappingURL=lib.js.map
