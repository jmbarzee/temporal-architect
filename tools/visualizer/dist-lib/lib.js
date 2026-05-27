var Tt = Object.defineProperty;
var St = (e, t, s) => t in e ? Tt(e, t, { enumerable: !0, configurable: !0, writable: !0, value: s }) : e[t] = s;
var an = (e, t, s) => St(e, typeof t != "symbol" ? t + "" : t, s);
import { jsxs as i, jsx as n, Fragment as gn } from "react/jsx-runtime";
import u from "react";
const Mt = {
  summary: { nodes: 0, edges: 0, coarsenedEdges: 0, unresolved: 0, diagnostics: 0 },
  nodes: [],
  edges: [],
  coarsenedEdges: [],
  unresolved: [],
  diagnostics: []
};
function In(e, t) {
  if (e.selectedFiles.size !== t.selectedFiles.size || e.visibleTypes.size !== t.visibleTypes.size) return !1;
  for (const s of e.selectedFiles) if (!t.selectedFiles.has(s)) return !1;
  for (const s of e.visibleTypes) if (!t.visibleTypes.has(s)) return !1;
  return !0;
}
function lt(e) {
  return {
    selectedFiles: new Set(e.selectedFiles),
    visibleTypes: new Set(e.visibleTypes)
  };
}
function rt({ size: e = 16 }) {
  return /* @__PURE__ */ i(
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
        /* @__PURE__ */ n("circle", { cx: "11", cy: "11", r: "7" }),
        /* @__PURE__ */ n("line", { x1: "16.65", y1: "16.65", x2: "21", y2: "21" })
      ]
    }
  );
}
function $t({ size: e = 14 }) {
  return /* @__PURE__ */ n(
    "svg",
    {
      width: e,
      height: e,
      viewBox: "0 0 24 24",
      fill: "currentColor",
      style: { display: "block" },
      children: /* @__PURE__ */ n("path", { d: "M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z" })
    }
  );
}
function Ct({ size: e = 16 }) {
  return /* @__PURE__ */ i(
    "svg",
    {
      width: e,
      height: e,
      viewBox: "0 0 24 24",
      fill: "currentColor",
      style: { display: "block" },
      children: [
        /* @__PURE__ */ n("g", { transform: "translate(0, 0) scale(0.65)", children: /* @__PURE__ */ n("path", { d: "M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z" }) }),
        /* @__PURE__ */ n("g", { transform: "translate(9, 9) scale(0.55)", children: /* @__PURE__ */ n("path", { d: "M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z" }) })
      ]
    }
  );
}
const C = {
  workflow: { icon: "⚙⚙", label: "Workflow", cssVarPrefix: "workflow", SvgIcon: Ct },
  activity: { icon: "⚙", label: "Activity", cssVarPrefix: "activity", SvgIcon: $t },
  worker: { icon: "□", label: "Worker", cssVarPrefix: "worker" },
  namespace: { icon: "⧉", label: "Namespace", cssVarPrefix: "namespace" },
  nexusService: { icon: "★", label: "Nexus Service", cssVarPrefix: "nexus-service" },
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
}, yn = [
  { type: "namespaceDef", icon: C.namespace.icon, label: "Namespaces", defaultOn: !1 },
  // Synthetic def type — endpoints live inside namespaceDef in the AST,
  // but render as their own L1.5 nodes (parented to their namespace).
  { type: "nexusEndpointDef", icon: C.nexusEndpoint.icon, label: "Nexus Endpoints", defaultOn: !1 },
  { type: "workerDef", icon: C.worker.icon, label: "Workers", defaultOn: !0 },
  { type: "nexusServiceDef", icon: C.nexusService.icon, label: "Nexus Services", defaultOn: !1 },
  // Synthetic def type — operations live inside nexusServiceDef in the AST,
  // but render as their own L3 nodes (parented to their service).
  { type: "nexusOperationDef", icon: C.nexusOperation.icon, label: "Nexus Operations", defaultOn: !1 },
  { type: "workflowDef", icon: C.workflow.icon, label: "Workflows", defaultOn: !0 },
  { type: "activityDef", icon: C.activity.icon, label: "Activities", defaultOn: !1 }
], jn = new Map(yn.map((e, t) => [e.type, t])), Et = {
  signalDecl: { icon: C.signal.icon, keyword: "signal", cssClass: "declaration-signal" },
  queryDecl: { icon: C.query.icon, keyword: "query", cssClass: "declaration-query" },
  updateDecl: { icon: C.update.icon, keyword: "update", cssClass: "declaration-update" }
}, Dt = {
  complete: C.closeComplete,
  fail: C.closeFail,
  continue_as_new: C.closeContinueAsNew
}, Ge = {
  timer: C.timer,
  signal: C.signal,
  update: C.update,
  activity: C.activity,
  workflow: C.workflow,
  nexus: C.nexusCall,
  ident: C.conditionSet
}, Ft = {
  workflow: C.workflow,
  activity: C.activity,
  service: C.nexusService
};
function kn({ kind: e, size: t }) {
  const s = C[e];
  return s.SvgIcon ? /* @__PURE__ */ n(s.SvgIcon, { size: t }) : /* @__PURE__ */ n(gn, { children: s.icon });
}
function le(e = !1, t = !0) {
  const [s, o] = u.useState(e);
  return [s, () => {
    t && o((l) => !l);
  }];
}
function Pn({ decl: e }) {
  const t = e.body && e.body.length > 0, [s, o] = le(!1, t), { icon: a, keyword: l, cssClass: r } = Et[e.type];
  let p = `${e.name}(${e.params})`;
  return "returnType" in e && e.returnType && (p += ` → ${e.returnType}`), /* @__PURE__ */ i("div", { className: `declaration ${r} ${s ? "expanded" : ""}`, children: [
    /* @__PURE__ */ i("div", { className: "declaration-header", onClick: o, children: [
      t && /* @__PURE__ */ n("span", { className: "block-toggle", children: s ? "▼" : "▶" }),
      !t && /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "declaration-icon", children: a }),
      /* @__PURE__ */ n("span", { className: "declaration-keyword", children: l }),
      /* @__PURE__ */ n("span", { className: "declaration-name", children: p })
    ] }),
    s && t && /* @__PURE__ */ n("div", { className: "declaration-body", children: e.body.map((d) => /* @__PURE__ */ n(Re, { statement: d }, `${d.line}:${d.column}`)) })
  ] });
}
function Wn({ def: e }) {
  var N, f, P, b;
  const [t, s] = le(), [o, a] = le(), [l, r] = le(), [p, d] = le(), m = e.state && (e.state.conditions && e.state.conditions.length > 0 || e.state.rawStmts && e.state.rawStmts.length > 0), T = e.signals && e.signals.length > 0, $ = e.queries && e.queries.length > 0, y = e.updates && e.updates.length > 0, I = (((f = (N = e.state) == null ? void 0 : N.conditions) == null ? void 0 : f.length) || 0) + (((b = (P = e.state) == null ? void 0 : P.rawStmts) == null ? void 0 : b.length) || 0);
  return /* @__PURE__ */ i(gn, { children: [
    m && /* @__PURE__ */ i("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ i("div", { className: "declarations-header", onClick: s, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-condition", children: C.conditionSet.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "state" }),
        /* @__PURE__ */ i("span", { className: "declarations-count", children: [
          "(",
          I,
          ")"
        ] })
      ] }),
      t && /* @__PURE__ */ i("div", { className: "block-declarations", children: [
        (e.state.conditions || []).map((x) => /* @__PURE__ */ n("div", { className: "declaration declaration-condition", children: /* @__PURE__ */ i("div", { className: "declaration-header", children: [
          /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ n("span", { className: "declaration-icon", children: C.conditionSet.icon }),
          /* @__PURE__ */ n("span", { className: "declaration-keyword", children: "condition" }),
          /* @__PURE__ */ n("span", { className: "declaration-name", children: x.name })
        ] }) }, `${x.line}:${x.column}`)),
        (e.state.rawStmts || []).map((x) => /* @__PURE__ */ n("div", { className: "declaration declaration-raw-state", children: /* @__PURE__ */ i("div", { className: "declaration-header", children: [
          /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ n("span", { className: "declaration-icon", children: C.raw.icon }),
          /* @__PURE__ */ n("span", { className: "declaration-name", children: x.text })
        ] }) }, `${x.line}:${x.column}`))
      ] })
    ] }),
    T && /* @__PURE__ */ i("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ i("div", { className: "declarations-header", onClick: a, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: o ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-signal", children: C.signal.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "signals" }),
        /* @__PURE__ */ i("span", { className: "declarations-count", children: [
          "(",
          e.signals.length,
          ")"
        ] })
      ] }),
      o && /* @__PURE__ */ n("div", { className: "block-declarations", children: e.signals.map((x) => /* @__PURE__ */ n(Pn, { decl: x }, `${x.line}:${x.column}`)) })
    ] }),
    $ && /* @__PURE__ */ i("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ i("div", { className: "declarations-header", onClick: r, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-query", children: C.query.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "queries" }),
        /* @__PURE__ */ i("span", { className: "declarations-count", children: [
          "(",
          e.queries.length,
          ")"
        ] })
      ] }),
      l && /* @__PURE__ */ n("div", { className: "block-declarations", children: e.queries.map((x) => /* @__PURE__ */ n(Pn, { decl: x }, `${x.line}:${x.column}`)) })
    ] }),
    y && /* @__PURE__ */ i("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ i("div", { className: "declarations-header", onClick: d, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: p ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-update", children: C.update.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "updates" }),
        /* @__PURE__ */ i("span", { className: "declarations-count", children: [
          "(",
          e.updates.length,
          ")"
        ] })
      ] }),
      p && /* @__PURE__ */ n("div", { className: "block-declarations", children: e.updates.map((x) => /* @__PURE__ */ n(Pn, { decl: x }, `${x.line}:${x.column}`)) })
    ] }),
    /* @__PURE__ */ n("div", { children: (e.body || []).map((x) => /* @__PURE__ */ n(Re, { statement: x }, `${x.line}:${x.column}`)) })
  ] });
}
function qn({ def: e }) {
  const [t, s] = le(), o = `${e.name}(${e.params})${e.returnType ? ` → ${e.returnType}` : ""}`, a = u.useMemo(() => {
    const l = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), p = /* @__PURE__ */ new Map();
    for (const d of e.signals || []) l.set(d.name, d);
    for (const d of e.queries || []) r.set(d.name, d);
    for (const d of e.updates || []) p.set(d.name, d);
    return { signals: l, queries: r, updates: p };
  }, [e]);
  return /* @__PURE__ */ n(wn.Provider, { value: a, children: /* @__PURE__ */ i("div", { className: `block block-workflow-call ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(kn, { kind: "workflow" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "workflow" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: o })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: /* @__PURE__ */ n(Wn, { def: e }) })
  ] }) });
}
function Hn({ body: e }) {
  const [t, s] = le(!0);
  return /* @__PURE__ */ i("div", { className: `block block-sync-body ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "handler" })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: e.map((o) => /* @__PURE__ */ n(Re, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function Qe({ defName: e, defType: t, showDefinition: s }) {
  const o = u.useContext(bt), a = [];
  if (s && a.push({ label: "Def", targets: [s] }), e && t) {
    const r = `${t}:${e}`, p = o.callers.get(r);
    if (p && p.length > 0 && a.push({ label: "Callers", targets: p.map((d) => ({ name: d.defName, type: d.defType })) }), t === "workflowDef" || t === "activityDef" || t === "nexusServiceDef") {
      const d = o.workerOf.get(r);
      d && d.length > 0 && a.push({ label: "Worker", targets: d.map((m) => ({ name: m, type: "workerDef" })) });
    }
    if (t === "workerDef") {
      const d = o.namespaceOf.get(r);
      d && d.length > 0 && a.push({ label: "NS", targets: d.map((m) => ({ name: m, type: "namespaceDef" })) });
    }
  }
  const l = e && t && o.showInGraph ? () => o.showInGraph(e, t) : null;
  return a.length === 0 && !l ? null : /* @__PURE__ */ i("div", { className: "ctx-nav-buttons", onClick: (r) => r.stopPropagation(), children: [
    a.map((r) => /* @__PURE__ */ n(At, { action: r, onNavigate: o.navigateTo }, r.label)),
    l && /* @__PURE__ */ n("button", { className: "ctx-nav-btn", onClick: l, title: "Show in Graph view", children: "Graph" })
  ] });
}
function At({ action: e, onNavigate: t }) {
  const [s, o] = u.useState(!1), a = u.useRef(null);
  return u.useEffect(() => {
    if (!s) return;
    const r = (p) => {
      a.current && !a.current.contains(p.target) && o(!1);
    };
    return document.addEventListener("mousedown", r), () => document.removeEventListener("mousedown", r);
  }, [s]), u.useEffect(() => {
    if (!s) return;
    const r = (p) => {
      p.key === "Escape" && (p.stopPropagation(), o(!1));
    };
    return document.addEventListener("keydown", r), () => document.removeEventListener("keydown", r);
  }, [s]), /* @__PURE__ */ i("div", { className: "ctx-nav-btn-wrapper", ref: a, children: [
    /* @__PURE__ */ i(
      "button",
      {
        className: `ctx-nav-btn ${s ? "active" : ""}`,
        onClick: () => {
          e.targets.length === 1 ? t(e.targets[0].name, e.targets[0].type) : o(!s);
        },
        title: `Show ${e.label.toLowerCase()}`,
        children: [
          e.label,
          e.targets.length > 1 && /* @__PURE__ */ n("span", { className: "ctx-nav-count", children: e.targets.length })
        ]
      }
    ),
    s && /* @__PURE__ */ n("div", { className: "ctx-nav-popover", children: e.targets.map((r) => /* @__PURE__ */ n(
      "button",
      {
        className: "ctx-nav-popover-item",
        onClick: () => {
          t(r.name, r.type), o(!1);
        },
        children: r.name
      },
      `${r.type}:${r.name}`
    )) })
  ] });
}
function It({ stmt: e }) {
  const s = u.useContext(Xe).activities.get(e.name), o = !!s, [a, l] = le(!1, o), r = Rt(e);
  return /* @__PURE__ */ i("div", { className: `block block-activity ${a ? "expanded" : "collapsed"} ${o ? "" : "block-unresolved"}`, children: [
    o && /* @__PURE__ */ n(Qe, { showDefinition: { name: e.name, type: "activityDef" } }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: l, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: a ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(kn, { kind: "activity" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "activity" }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: r, children: r }),
      !o && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    a && o && /* @__PURE__ */ n("div", { className: "block-body", children: (s.body || []).length > 0 ? (s.body || []).map((p) => /* @__PURE__ */ n(Re, { statement: p }, `${p.line}:${p.column}`)) : /* @__PURE__ */ n("div", { className: "block-empty-body", children: "No implementation defined" }) })
  ] });
}
function Wt({ stmt: e }) {
  const s = u.useContext(Xe).workflows.get(e.name), o = !!s, [a, l] = le(!1, o), r = e.mode === "detach" ? "detach " : "", p = Ot(e);
  return /* @__PURE__ */ i("div", { className: `block block-workflow-call block-mode-${e.mode} ${a ? "expanded" : "collapsed"} ${o ? "" : "block-unresolved"}`, children: [
    o && /* @__PURE__ */ n(Qe, { showDefinition: { name: e.name, type: "workflowDef" } }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: l, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: a ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(kn, { kind: "workflow" }) }),
      /* @__PURE__ */ i("span", { className: "block-keyword", children: [
        r,
        "workflow"
      ] }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: p, children: p }),
      !o && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    a && o && /* @__PURE__ */ n("div", { className: "block-body", children: /* @__PURE__ */ n(Lt, { def: s, children: /* @__PURE__ */ n(Wn, { def: s }) }) })
  ] });
}
function Lt({ def: e, children: t }) {
  const s = u.useMemo(() => {
    const o = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map();
    for (const r of e.signals || []) o.set(r.name, r);
    for (const r of e.queries || []) a.set(r.name, r);
    for (const r of e.updates || []) l.set(r.name, r);
    return { signals: o, queries: a, updates: l };
  }, [e]);
  return /* @__PURE__ */ n(wn.Provider, { value: s, children: t });
}
function Pt({ stmt: e }) {
  var y;
  const t = u.useContext(Xe), s = t.nexusServices.get(e.service), o = (y = s == null ? void 0 : s.operations) == null ? void 0 : y.find((I) => I.name === e.operation), a = !!o, l = (o == null ? void 0 : o.opType) === "async" && o.workflowName ? t.workflows.get(o.workflowName) : void 0, r = (o == null ? void 0 : o.opType) === "async" ? !!l : !!(o != null && o.body && o.body.length > 0), [p, d] = le(!1, r), m = e.detach ? "detach " : "", T = `${e.endpoint} ${e.service}.${e.operation}(${e.args})`, $ = e.result ? ` → ${e.result}` : "";
  return /* @__PURE__ */ i("div", { className: `block block-nexus-call ${e.detach ? "block-mode-detach" : ""} ${p ? "expanded" : "collapsed"} ${!a && e.service ? "block-unresolved" : ""}`, children: [
    s && /* @__PURE__ */ n(Qe, { showDefinition: { name: e.service, type: "nexusServiceDef" } }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: d, children: [
      r ? /* @__PURE__ */ n("span", { className: "block-toggle", children: p ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-call", children: C.nexusCall.icon }),
      /* @__PURE__ */ i("span", { className: "block-keyword", children: [
        m,
        "nexus"
      ] }),
      /* @__PURE__ */ i("span", { className: "block-signature", title: `${T}${$}`, children: [
        T,
        $
      ] }),
      !a && e.service && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    p && r && /* @__PURE__ */ n("div", { className: "block-body", children: (o == null ? void 0 : o.opType) === "async" && l ? /* @__PURE__ */ n(qn, { def: l }) : o != null && o.body ? /* @__PURE__ */ n(Hn, { body: o.body }) : /* @__PURE__ */ n("div", { className: "block-empty-body", children: "No implementation defined" }) })
  ] });
}
function Rt(e) {
  let t = `${e.name}(${e.args})`;
  return e.result && (t += ` → ${e.result}`), t;
}
function Ot(e) {
  let t = `${e.name}(${e.args})`;
  return e.result && (t += ` → ${e.result}`), t;
}
function it(e, t, s) {
  var o;
  switch (e.kind) {
    case "timer":
      return { icon: Ge.timer.icon, keyword: "timer", signature: `(${e.timer.duration || ""})`, isUnresolved: !1 };
    case "signal": {
      const a = e.signal.name || "", l = e.signal.params ? ` → ${e.signal.params}` : "", r = s.signals.get(a);
      return { icon: Ge.signal.icon, keyword: "signal", signature: `${a}${l}`, expandableDef: r, isUnresolved: !r };
    }
    case "update": {
      const a = e.update.name || "", l = e.update.params ? ` → ${e.update.params}` : "", r = s.updates.get(a);
      return { icon: Ge.update.icon, keyword: "update", signature: `${a}${l}`, expandableDef: r, isUnresolved: !r };
    }
    case "activity": {
      const a = `${e.activity.name || ""}(${e.activity.args || ""})`, l = e.activity.result ? ` → ${e.activity.result}` : "", r = t.activities.get(e.activity.name || "");
      return { icon: Ge.activity.icon, keyword: "activity", signature: `${a}${l}`, expandableDef: r, isUnresolved: !r };
    }
    case "workflow": {
      const a = e.workflow.mode === "detach" ? "detach " : "", l = `${e.workflow.name || ""}(${e.workflow.args || ""})`, r = e.workflow.result ? ` → ${e.workflow.result}` : "", p = t.workflows.get(e.workflow.name || "");
      return { icon: Ge.workflow.icon, keyword: `${a}workflow`, signature: `${l}${r}`, expandableDef: p, isUnresolved: !p };
    }
    case "nexus": {
      const a = e.nexus.detach ? "detach " : "", l = `${e.nexus.endpoint || ""} ${e.nexus.service || ""}.${e.nexus.operation || ""}(${e.nexus.args || ""})`, r = e.nexus.result ? ` → ${e.nexus.result}` : "", p = t.nexusServices.get(e.nexus.service || ""), d = (o = p == null ? void 0 : p.operations) == null ? void 0 : o.find((T) => T.name === (e.nexus.operation || "")), m = !!(e.nexus.service && !p);
      if ((d == null ? void 0 : d.opType) === "async" && d.workflowName) {
        const T = t.workflows.get(d.workflowName);
        if (T)
          return { icon: Ge.nexus.icon, keyword: `${a}nexus`, signature: `${l}${r}`, nexusAsyncWorkflow: T, isUnresolved: m };
      } else if ((d == null ? void 0 : d.opType) === "sync" && d.body)
        return { icon: Ge.nexus.icon, keyword: `${a}nexus`, signature: `${l}${r}`, nexusSyncBody: d.body, isUnresolved: m };
      return { icon: Ge.nexus.icon, keyword: `${a}nexus`, signature: `${l}${r}`, isUnresolved: m };
    }
    case "ident": {
      const a = e.ident.name || "", l = e.ident.result ? ` → ${e.ident.result}` : "";
      return { icon: Ge.ident.icon, keyword: "", signature: `${a}${l}`, isUnresolved: !1 };
    }
    default:
      return { icon: "?", keyword: "", signature: "", isUnresolved: !1 };
  }
}
function Bt(e, t, s) {
  var l, r;
  const o = it(e.target, t, s), a = e.target.kind === "workflow" && ((l = e.target.workflow) == null ? void 0 : l.mode) === "detach" || e.target.kind === "nexus" && ((r = e.target.nexus) == null ? void 0 : r.detach);
  return {
    ...o,
    // Activity/workflow/nexus use SVG icons at block level, not text icons
    icon: e.target.kind === "activity" || e.target.kind === "workflow" || e.target.kind === "nexus" ? "" : o.icon,
    keyword: o.keyword ? `await ${o.keyword}` : "await",
    blockClass: `block-await-stmt block-await-stmt-${e.target.kind}${a ? " block-mode-detach" : ""}`
  };
}
function Yt(e, t, s) {
  var a, l;
  if (e.awaitAll != null)
    return { contentClass: "tagged-await-all", icon: C.awaitAll.icon, keyword: "await all", signature: `${((l = (a = e.awaitAll) == null ? void 0 : a.body) == null ? void 0 : l.length) || 0} branch(es)`, isUnresolved: !1 };
  const o = it(e.target, t, s);
  return {
    icon: o.icon,
    keyword: o.keyword,
    signature: o.signature,
    isUnresolved: o.isUnresolved,
    contentClass: `tagged-${e.target.kind}`
  };
}
function _t({ stmt: e }) {
  const t = u.useContext(Xe), s = u.useContext(wn), { icon: o, keyword: a, signature: l, blockClass: r, expandableDef: p, nexusAsyncWorkflow: d, nexusSyncBody: m, isUnresolved: T } = Bt(e, t, s), $ = !!(p || d || m), [y, I] = le(!1, $);
  return /* @__PURE__ */ i("div", { className: `block ${r} ${y ? "expanded" : "collapsed"} ${T ? "block-unresolved" : ""}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: I, children: [
      $ ? /* @__PURE__ */ n("span", { className: "block-toggle", children: y ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: o }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: a }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: l }),
      T && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    y && $ && /* @__PURE__ */ n("div", { className: "block-body", children: d ? /* @__PURE__ */ n(qn, { def: d }) : m ? /* @__PURE__ */ n(Hn, { body: m }) : p && (p.body || []).length > 0 ? (p.body || []).map((N) => /* @__PURE__ */ n(Re, { statement: N }, `${N.line}:${N.column}`)) : /* @__PURE__ */ n("div", { className: "block-empty-body", children: "No implementation defined" }) })
  ] });
}
function dt({ stmt: e }) {
  const [t, s] = le(!0);
  return /* @__PURE__ */ i("div", { className: `block block-await-all ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: C.awaitAll.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "await all" }),
      /* @__PURE__ */ i("span", { className: "block-signature", children: [
        (e.body || []).length,
        " branch(es)"
      ] })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: (e.body || []).map((o) => /* @__PURE__ */ n(Re, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function Kt({ stmt: e }) {
  const [t, s] = le(!0), o = e.cases.length === 1 ? "case" : "cases";
  return /* @__PURE__ */ i("div", { className: `block block-await-one ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "await one" }),
      /* @__PURE__ */ i("span", { className: "block-signature", children: [
        "first of ",
        e.cases.length,
        " ",
        o
      ] })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: e.cases.map((a) => /* @__PURE__ */ n(Vt, { awaitCase: a }, `${a.line}:${a.column}`)) })
  ] });
}
function Vt({ awaitCase: e }) {
  const t = u.useContext(Xe), s = u.useContext(wn), o = e.body && e.body.length > 0, a = o || !!e.awaitAll, [l, r] = le(!1, a), { contentClass: p, icon: d, keyword: m, signature: T, isUnresolved: $ } = Yt(e, t, s);
  return /* @__PURE__ */ i("div", { className: `tagged-composite ${l ? "expanded" : ""} ${$ ? "tagged-unresolved" : ""}`, children: [
    /* @__PURE__ */ n("div", { className: "tagged-tag", children: /* @__PURE__ */ n("span", { className: "tagged-tag-label", children: "option" }) }),
    /* @__PURE__ */ i("div", { className: `tagged-content ${p} ${a ? "expandable" : ""}`, onClick: r, children: [
      a && /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      !a && /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "tagged-icon", children: d }),
      /* @__PURE__ */ n("span", { className: "tagged-kind", children: m }),
      /* @__PURE__ */ n("span", { className: "tagged-name", children: T }),
      $ && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    l && /* @__PURE__ */ i("div", { className: "tagged-body", children: [
      e.awaitAll && /* @__PURE__ */ n(dt, { stmt: e.awaitAll }),
      o && e.body.map((y) => /* @__PURE__ */ n(Re, { statement: y }, `${y.line}:${y.column}`))
    ] })
  ] });
}
function qt({ stmt: e }) {
  const [t, s] = le(!0);
  return /* @__PURE__ */ i("div", { className: `block block-switch ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "switch" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: e.expr })
    ] }),
    t && /* @__PURE__ */ i("div", { className: "block-body", children: [
      e.cases.map((o) => /* @__PURE__ */ n(Ht, { switchCase: o }, `${o.line}:${o.column}`)),
      e.default && e.default.length > 0 && /* @__PURE__ */ i("div", { className: "block block-switch-default", children: [
        /* @__PURE__ */ i("div", { className: "block-header", children: [
          /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
          /* @__PURE__ */ n("span", { className: "block-keyword", children: "default" })
        ] }),
        /* @__PURE__ */ n("div", { className: "block-body", children: e.default.map((o) => /* @__PURE__ */ n(Re, { statement: o }, `${o.line}:${o.column}`)) })
      ] })
    ] })
  ] });
}
function Ht({ switchCase: e }) {
  const [t, s] = le(!0);
  return /* @__PURE__ */ i("div", { className: `block block-switch-case ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "case" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: e.value })
    ] }),
    t && e.body && e.body.length > 0 && /* @__PURE__ */ n("div", { className: "block-body", children: e.body.map((o) => /* @__PURE__ */ n(Re, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function zt({ stmt: e }) {
  const [t, s] = le(!0), o = e.elseBody && e.elseBody.length > 0;
  return /* @__PURE__ */ i("div", { className: `block block-if ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "if" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: e.condition })
    ] }),
    t && /* @__PURE__ */ i("div", { className: "block-body", children: [
      /* @__PURE__ */ i("div", { className: "block-branch", children: [
        /* @__PURE__ */ n("div", { className: "branch-label", children: "then:" }),
        (e.body || []).map((a) => /* @__PURE__ */ n(Re, { statement: a }, `${a.line}:${a.column}`))
      ] }),
      o && /* @__PURE__ */ i("div", { className: "block-branch", children: [
        /* @__PURE__ */ n("div", { className: "branch-label", children: "else:" }),
        (e.elseBody || []).map((a) => /* @__PURE__ */ n(Re, { statement: a }, `${a.line}:${a.column}`))
      ] })
    ] })
  ] });
}
function Gt({ stmt: e }) {
  const [t, s] = le(!0);
  let o = "";
  return e.variant === "iteration" ? o = `${e.variable} in ${e.iterable}` : e.variant === "conditional" ? o = e.condition || "" : o = "∞", /* @__PURE__ */ i("div", { className: `block block-for ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: C.forLoop.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "for" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: o })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: (e.body || []).map((a) => /* @__PURE__ */ n(Re, { statement: a }, `${a.line}:${a.column}`)) })
  ] });
}
function Ut({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-return collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: C.return.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "return" }),
    e.value && /* @__PURE__ */ n("span", { className: "block-signature", children: e.value })
  ] }) });
}
function Xt({ stmt: e }) {
  const t = (Dt[e.reason] ?? C.closeComplete).icon, s = e.reason === "continue_as_new" ? "close-continue-as-new" : e.reason === "fail" ? "close-failed" : "";
  return /* @__PURE__ */ n("div", { className: `block block-close ${s} collapsed`, children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: t }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "close" }),
    /* @__PURE__ */ i("span", { className: "block-signature", children: [
      /* @__PURE__ */ n("span", { className: "close-reason", children: e.reason }),
      e.args && /* @__PURE__ */ i("span", { children: [
        "(",
        e.args,
        ")"
      ] })
    ] })
  ] }) });
}
function jt({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-raw collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: C.raw.icon }),
    /* @__PURE__ */ n("span", { className: "block-code", children: e.text })
  ] }) });
}
function Jt({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-comment collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: C.raw.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "comment" }),
    /* @__PURE__ */ n("span", { className: "block-signature", title: e.text, children: e.text })
  ] }) });
}
function Jn({ keyword: e, className: t }) {
  return /* @__PURE__ */ n("div", { className: `block ${t} collapsed`, children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: C.breakContinue.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: e })
  ] }) });
}
function Zt({ stmt: e }) {
  let t = "";
  switch (e.target.kind) {
    case "activity":
      t = `activity ${e.target.activity.name}(${e.target.activity.args || ""})`;
      break;
    case "workflow":
      t = `workflow ${e.target.workflow.name}(${e.target.workflow.args || ""})`;
      break;
    case "nexus":
      t = `nexus ${e.target.nexus.endpoint} ${e.target.nexus.service}.${e.target.nexus.operation}(${e.target.nexus.args || ""})`;
      break;
    case "timer":
      t = `timer(${e.target.timer.duration})`;
      break;
    case "signal": {
      const s = e.target.signal.params ? `(${e.target.signal.params})` : "";
      t = `signal ${e.target.signal.name}${s}`;
      break;
    }
    case "update": {
      const s = e.target.update.params ? `(${e.target.update.params})` : "";
      t = `update ${e.target.update.name}${s}`;
      break;
    }
    case "ident":
      t = e.target.ident.name;
      break;
  }
  return /* @__PURE__ */ n("div", { className: "block block-promise collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: C.promise.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "promise" }),
    /* @__PURE__ */ i("span", { className: "block-signature", children: [
      e.name,
      " ← ",
      t
    ] })
  ] }) });
}
function Qt({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-set collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: C.conditionSet.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "set" }),
    /* @__PURE__ */ n("span", { className: "block-signature", children: e.name })
  ] }) });
}
function es({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-unset collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: C.conditionUnset.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "unset" }),
    /* @__PURE__ */ n("span", { className: "block-signature", children: e.name })
  ] }) });
}
function Re({ statement: e }) {
  switch (e.type) {
    case "activityCall":
      return /* @__PURE__ */ n(It, { stmt: e });
    case "workflowCall":
      return /* @__PURE__ */ n(Wt, { stmt: e });
    case "nexusCall":
      return /* @__PURE__ */ n(Pt, { stmt: e });
    case "await":
      return /* @__PURE__ */ n(_t, { stmt: e });
    case "awaitAll":
      return /* @__PURE__ */ n(dt, { stmt: e });
    case "awaitOne":
      return /* @__PURE__ */ n(Kt, { stmt: e });
    case "switch":
      return /* @__PURE__ */ n(qt, { stmt: e });
    case "if":
      return /* @__PURE__ */ n(zt, { stmt: e });
    case "for":
      return /* @__PURE__ */ n(Gt, { stmt: e });
    case "return":
      return /* @__PURE__ */ n(Ut, { stmt: e });
    case "close":
      return /* @__PURE__ */ n(Xt, { stmt: e });
    case "raw":
      return /* @__PURE__ */ n(jt, { stmt: e });
    case "break":
      return /* @__PURE__ */ n(Jn, { keyword: "break", className: "block-break" });
    case "continue":
      return /* @__PURE__ */ n(Jn, { keyword: "continue", className: "block-continue" });
    case "promise":
      return /* @__PURE__ */ n(Zt, { stmt: e });
    case "set":
      return /* @__PURE__ */ n(Qt, { stmt: e });
    case "unset":
      return /* @__PURE__ */ n(es, { stmt: e });
    case "comment":
      return /* @__PURE__ */ n(Jt, { stmt: e });
    default:
      return null;
  }
}
function ns({ definition: e, expanded: t, onToggle: s }) {
  switch (e.type) {
    case "workflowDef":
      return /* @__PURE__ */ n(ts, { def: e, controlledExpanded: t, onToggle: s });
    case "activityDef":
      return /* @__PURE__ */ n(ss, { def: e, controlledExpanded: t, onToggle: s });
    case "workerDef":
      return /* @__PURE__ */ n(os, { def: e, controlledExpanded: t, onToggle: s });
    case "namespaceDef":
      return /* @__PURE__ */ n(cs, { def: e, controlledExpanded: t, onToggle: s });
    case "nexusServiceDef":
      return /* @__PURE__ */ n(ds, { def: e, controlledExpanded: t, onToggle: s });
    default:
      return null;
  }
}
function ts({ def: e, controlledExpanded: t, onToggle: s }) {
  const o = is(e), [a, l] = le(), r = t ?? a, p = s ?? l, d = u.useMemo(() => {
    const m = /* @__PURE__ */ new Map(), T = /* @__PURE__ */ new Map(), $ = /* @__PURE__ */ new Map();
    for (const y of e.signals || []) m.set(y.name, y);
    for (const y of e.queries || []) T.set(y.name, y);
    for (const y of e.updates || []) $.set(y.name, y);
    return { signals: m, queries: T, updates: $ };
  }, [e]);
  return /* @__PURE__ */ n(wn.Provider, { value: d, children: /* @__PURE__ */ i("div", { className: `block block-workflow ${r ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Qe, { defName: e.name, defType: "workflowDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: p, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: r ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(kn, { kind: "workflow" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "workflow" }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: o, children: o }),
      !r && (() => {
        const m = bn(e);
        return m ? /* @__PURE__ */ n("span", { className: "block-summary", children: m }) : null;
      })()
    ] }),
    r && /* @__PURE__ */ n("div", { className: "block-body", children: /* @__PURE__ */ n(Wn, { def: e }) })
  ] }) });
}
function ss({ def: e, controlledExpanded: t, onToggle: s }) {
  const [o, a] = le(), l = t ?? o, r = s ?? a, p = us(e);
  return /* @__PURE__ */ i("div", { className: `block block-activity-def ${l ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Qe, { defName: e.name, defType: "activityDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(kn, { kind: "activity" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "activity" }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: p, children: p }),
      !l && (() => {
        const d = bn(e);
        return d ? /* @__PURE__ */ n("span", { className: "block-summary", children: d }) : null;
      })()
    ] }),
    l && /* @__PURE__ */ n("div", { className: "block-body", children: (e.body || []).map((d) => /* @__PURE__ */ n(Re, { statement: d }, `${d.line}:${d.column}`)) })
  ] });
}
function os({ def: e, controlledExpanded: t, onToggle: s }) {
  var d, m, T, $, y, I;
  const [o, a] = le(), l = t ?? o, r = s ?? a, p = (((d = e.workflows) == null ? void 0 : d.length) || 0) + (((m = e.activities) == null ? void 0 : m.length) || 0) + (((T = e.services) == null ? void 0 : T.length) || 0);
  return /* @__PURE__ */ i("div", { className: `block block-worker-def ${l ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Qe, { defName: e.name, defType: "workerDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: C.worker.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "worker" }),
      /* @__PURE__ */ i("span", { className: "block-signature", title: `${e.name} (${p} types)`, children: [
        e.name,
        " (",
        p,
        " types)"
      ] }),
      !l && (() => {
        const N = bn(e);
        return N ? /* @__PURE__ */ n("span", { className: "block-summary", children: N }) : null;
      })()
    ] }),
    l && /* @__PURE__ */ i("div", { className: "block-body", children: [
      (($ = e.workflows) == null ? void 0 : $.length) > 0 && /* @__PURE__ */ n(rn, { label: "workflows", refs: e.workflows, refType: "workflow" }),
      ((y = e.activities) == null ? void 0 : y.length) > 0 && /* @__PURE__ */ n(rn, { label: "activities", refs: e.activities, refType: "activity" }),
      ((I = e.services) == null ? void 0 : I.length) > 0 && /* @__PURE__ */ n(rn, { label: "nexus services", refs: e.services, refType: "service" })
    ] })
  ] });
}
function rn({ label: e, refs: t, refType: s }) {
  return /* @__PURE__ */ i("div", { className: "worker-ref-section", children: [
    /* @__PURE__ */ n("div", { className: "worker-ref-label", children: e }),
    t.map((o) => /* @__PURE__ */ n(as, { ref_: o, refType: s }, `${o.line}:${o.column}`))
  ] });
}
function as({ ref_: e, refType: t }) {
  const s = u.useContext(Xe), o = t === "workflow" ? s.workflows.get(e.name) : t === "activity" ? s.activities.get(e.name) : void 0, a = t === "service" ? s.nexusServices.get(e.name) : void 0, l = !!(o || a), [r, p] = le(!1, l), d = Ft[t].icon;
  return /* @__PURE__ */ i("div", { className: `worker-ref worker-ref-${t} ${r ? "expanded" : "collapsed"} ${l ? "" : "worker-ref-unresolved"}`, children: [
    /* @__PURE__ */ i("div", { className: "worker-ref-header", onClick: p, children: [
      l ? /* @__PURE__ */ n("span", { className: "block-toggle", children: r ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: `block-icon ${t === "service" ? "block-icon-nexus-service" : ""}`, children: d }),
      /* @__PURE__ */ n("span", { className: "worker-ref-name", children: e.name }),
      !l && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    r && l && /* @__PURE__ */ n("div", { className: "block-body", children: (o == null ? void 0 : o.type) === "workflowDef" ? /* @__PURE__ */ n(Wn, { def: o }) : o ? (o.body || []).map((m) => /* @__PURE__ */ n(Re, { statement: m }, `${m.line}:${m.column}`)) : a ? (a.operations || []).map((m) => /* @__PURE__ */ n(ut, { operation: m }, `${m.line}:${m.column}`)) : null })
  ] });
}
function cs({ def: e, controlledExpanded: t, onToggle: s }) {
  var d, m, T, $;
  const [o, a] = le(), l = t ?? o, r = s ?? a, p = (((d = e.workers) == null ? void 0 : d.length) || 0) + (((m = e.endpoints) == null ? void 0 : m.length) || 0);
  return /* @__PURE__ */ i("div", { className: `block block-namespace-def ${l ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Qe, { defName: e.name, defType: "namespaceDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-namespace", children: C.namespace.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "namespace" }),
      /* @__PURE__ */ i("span", { className: "block-signature", title: `${e.name} (${p} entries)`, children: [
        e.name,
        " (",
        p,
        " entries)"
      ] }),
      !l && (() => {
        const y = bn(e);
        return y ? /* @__PURE__ */ n("span", { className: "block-summary", children: y }) : null;
      })()
    ] }),
    l && /* @__PURE__ */ i("div", { className: "block-body", children: [
      ((T = e.workers) == null ? void 0 : T.length) > 0 && /* @__PURE__ */ i("div", { className: "namespace-entry-section", children: [
        /* @__PURE__ */ n("div", { className: "namespace-entry-label", children: "workers" }),
        e.workers.map((y) => /* @__PURE__ */ n(ls, { entry: y }, `${y.line}:${y.column}`))
      ] }),
      (($ = e.endpoints) == null ? void 0 : $.length) > 0 && /* @__PURE__ */ i("div", { className: "namespace-entry-section", children: [
        /* @__PURE__ */ n("div", { className: "namespace-entry-label", children: "nexus endpoints" }),
        e.endpoints.map((y) => /* @__PURE__ */ n(rs, { entry: y }, `${y.line}:${y.column}`))
      ] })
    ] })
  ] });
}
function ls({ entry: e }) {
  var r, p, d;
  const s = u.useContext(Xe).workers.get(e.workerName), o = !!s, [a, l] = le(!1, o);
  return /* @__PURE__ */ i("div", { className: `namespace-entry namespace-entry-worker ${a ? "expanded" : "collapsed"} ${o ? "" : "namespace-entry-unresolved"}`, children: [
    /* @__PURE__ */ i("div", { className: "namespace-entry-header", onClick: l, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: a ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: C.worker.icon }),
      /* @__PURE__ */ n("span", { className: "namespace-entry-name", children: e.workerName }),
      !o && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    a && o && s && /* @__PURE__ */ i("div", { className: "block-body", children: [
      ((r = s.workflows) == null ? void 0 : r.length) > 0 && /* @__PURE__ */ n(rn, { label: "workflows", refs: s.workflows, refType: "workflow" }),
      ((p = s.activities) == null ? void 0 : p.length) > 0 && /* @__PURE__ */ n(rn, { label: "activities", refs: s.activities, refType: "activity" }),
      ((d = s.services) == null ? void 0 : d.length) > 0 && /* @__PURE__ */ n(rn, { label: "nexus services", refs: s.services, refType: "service" })
    ] })
  ] });
}
function rs({ entry: e }) {
  return /* @__PURE__ */ n("div", { className: "namespace-entry namespace-entry-endpoint collapsed", children: /* @__PURE__ */ i("div", { className: "namespace-entry-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-endpoint", children: C.nexusService.icon }),
    /* @__PURE__ */ n("span", { className: "namespace-entry-name", children: e.endpointName })
  ] }) });
}
function bn(e) {
  var s, o, a, l, r, p, d, m, T, $;
  const t = [];
  if (e.type === "workflowDef") {
    const y = ((s = e.body) == null ? void 0 : s.length) || 0, I = (e.body || []).filter(
      (f) => f.type === "activityCall" || f.type === "workflowCall" || f.type === "nexusCall"
    ).length, N = (((o = e.signals) == null ? void 0 : o.length) || 0) + (((a = e.queries) == null ? void 0 : a.length) || 0) + (((l = e.updates) == null ? void 0 : l.length) || 0);
    y > 0 && t.push(`${y} step${y !== 1 ? "s" : ""}`), I > 0 && t.push(`${I} call${I !== 1 ? "s" : ""}`), N > 0 && t.push(`${N} handler${N !== 1 ? "s" : ""}`);
  } else if (e.type === "activityDef") {
    const y = ((r = e.body) == null ? void 0 : r.length) || 0;
    y > 0 && t.push(`${y} step${y !== 1 ? "s" : ""}`);
  } else if (e.type === "workerDef") {
    const y = ((p = e.workflows) == null ? void 0 : p.length) || 0, I = ((d = e.activities) == null ? void 0 : d.length) || 0, N = ((m = e.services) == null ? void 0 : m.length) || 0;
    y > 0 && t.push(`${y} workflow${y !== 1 ? "s" : ""}`), I > 0 && t.push(`${I} activit${I !== 1 ? "ies" : "y"}`), N > 0 && t.push(`${N} service${N !== 1 ? "s" : ""}`);
  } else if (e.type === "namespaceDef") {
    const y = ((T = e.workers) == null ? void 0 : T.length) || 0, I = (($ = e.endpoints) == null ? void 0 : $.length) || 0;
    y > 0 && t.push(`${y} worker${y !== 1 ? "s" : ""}`), I > 0 && t.push(`${I} endpoint${I !== 1 ? "s" : ""}`);
  } else if (e.type === "nexusServiceDef") {
    const y = (e.operations || []).filter((N) => N.opType === "async").length, I = (e.operations || []).filter((N) => N.opType === "sync").length;
    y > 0 && t.push(`${y} async`), I > 0 && t.push(`${I} sync`);
  }
  return t.join(" · ");
}
function is(e) {
  let t = `${e.name}(${e.params})`;
  return e.returnType && (t += ` → ${e.returnType}`), t;
}
function ds({ def: e, controlledExpanded: t, onToggle: s }) {
  var d;
  const [o, a] = le(), l = t ?? o, r = s ?? a, p = ((d = e.operations) == null ? void 0 : d.length) || 0;
  return /* @__PURE__ */ i("div", { className: `block block-nexus-service-def ${l ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Qe, { defName: e.name, defType: "nexusServiceDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-service", children: C.nexusService.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "service" }),
      /* @__PURE__ */ i("span", { className: "block-signature", title: `${e.name} (${p} operation${p !== 1 ? "s" : ""})`, children: [
        e.name,
        " (",
        p,
        " operation",
        p !== 1 ? "s" : "",
        ")"
      ] }),
      !l && (() => {
        const m = bn(e);
        return m ? /* @__PURE__ */ n("span", { className: "block-summary", children: m }) : null;
      })()
    ] }),
    l && /* @__PURE__ */ n("div", { className: "block-body", children: (e.operations || []).map((m) => /* @__PURE__ */ n(ut, { operation: m }, `${m.line}:${m.column}`)) })
  ] });
}
function ut({ operation: e }) {
  const t = u.useContext(Xe), s = e.opType === "async" && e.workflowName ? t.workflows.get(e.workflowName) : void 0, o = e.opType === "async" ? !!s : !!(e.body && e.body.length > 0), a = e.opType === "async" && e.workflowName && !s, [l, r] = le(!1, o);
  let p;
  if (e.opType === "async" && s)
    p = /* @__PURE__ */ i(gn, { children: [
      e.name,
      /* @__PURE__ */ i("span", { className: "nexus-operation-grayed-sig", children: [
        "(",
        s.params,
        ")",
        s.returnType ? ` → ${s.returnType}` : ""
      ] })
    ] });
  else if (e.opType === "sync") {
    const d = e.params || "", m = e.returnType ? ` → ${e.returnType}` : "";
    p = `${e.name}(${d})${m}`;
  } else
    p = e.name;
  return /* @__PURE__ */ i("div", { className: `block block-nexus-operation nexus-operation-${e.opType} ${l ? "expanded" : "collapsed"} ${a ? "block-unresolved" : ""}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-operation", children: C.nexusOperation.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: e.opType }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: p }),
      a && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    l && o && /* @__PURE__ */ n("div", { className: "block-body", children: e.opType === "async" && s ? /* @__PURE__ */ n(qn, { def: s }) : e.body ? /* @__PURE__ */ n(Hn, { body: e.body }) : null })
  ] });
}
function us(e) {
  let t = `${e.name}(${e.params})`;
  return e.returnType && (t += ` → ${e.returnType}`), t;
}
function Fn({ pinned: e, onClick: t, flashing: s, label: o }) {
  const a = e ? `${o} filter pinned — click to unpin` : `${o} filter unpinned — click to pin and stop syncing with the other view`, l = [
    "pin-toggle",
    e ? "pinned" : "",
    s ? "flashing" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ n(
    "button",
    {
      className: l,
      onClick: t,
      title: a,
      "aria-label": a,
      "aria-pressed": e,
      children: e ? /* @__PURE__ */ n(ps, {}) : /* @__PURE__ */ n(hs, {})
    }
  );
}
function ps() {
  return /* @__PURE__ */ i("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ n("rect", { x: "3", y: "7", width: "10", height: "7", rx: "1.5" }),
    /* @__PURE__ */ n("path", { d: "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" })
  ] });
}
function hs() {
  return /* @__PURE__ */ i("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ n("rect", { x: "3", y: "7", width: "10", height: "7", rx: "1.5" }),
    /* @__PURE__ */ n("path", { d: "M5.5 7V5a2.5 2.5 0 0 1 4.9-.6" })
  ] });
}
function fs({
  ast: e,
  onShowInGraph: t,
  filter: s,
  onFilterChange: o,
  pins: a,
  onPinsChange: l,
  searchQuery: r,
  searchActive: p,
  onSearchChange: d,
  pendingFocus: m,
  onFocusConsumed: T,
  overriddenPins: $,
  onOverriddenPinsConsumed: y
}) {
  const I = u.useRef(null), [N, f] = u.useState(-1), P = u.useRef([]), [b, x] = u.useState(/* @__PURE__ */ new Set()), [_, U] = u.useState(null), [be, R] = u.useState(!1), ie = u.useRef(e);
  u.useEffect(() => {
    if (ie.current !== e && ie.current !== null) {
      R(!0);
      const g = setTimeout(() => R(!1), 600);
      return () => clearTimeout(g);
    }
    ie.current = e;
  }, [e]);
  const ae = u.useRef(s), [de, ue] = u.useState(/* @__PURE__ */ new Set());
  u.useEffect(() => {
    const g = ae.current;
    if (In(g, s)) return;
    const w = /* @__PURE__ */ new Set();
    for (const D of s.selectedFiles) g.selectedFiles.has(D) || w.add(`file:${D}`);
    for (const D of s.visibleTypes) g.visibleTypes.has(D) || w.add(`type:${D}`);
    if (ae.current = s, w.size > 0) {
      ue(w);
      const D = setTimeout(() => ue(/* @__PURE__ */ new Set()), 450);
      return () => clearTimeout(D);
    }
  }, [s]), u.useEffect(() => {
    if ($.size === 0) return;
    const g = setTimeout(y, 600);
    return () => clearTimeout(g);
  }, [$, y]);
  const Oe = u.useMemo(() => {
    const g = /* @__PURE__ */ new Map(), w = /* @__PURE__ */ new Map(), D = /* @__PURE__ */ new Map();
    function O(M, v) {
      const Y = g.get(M) || [];
      Y.some((ke) => ke.defName === v.defName && ke.defType === v.defType) || (Y.push(v), g.set(M, Y));
    }
    function F(M, v, Y) {
      const ke = M.get(v) || [];
      ke.includes(Y) || (ke.push(Y), M.set(v, ke));
    }
    function z(M, v) {
      M.activity && O(`activityDef:${M.activity.name}`, { defName: v.name, defType: v.type }), M.workflow && O(`workflowDef:${M.workflow.name}`, { defName: v.name, defType: v.type }), M.nexus && O(`nexusServiceDef:${M.nexus.service}`, { defName: v.name, defType: v.type });
    }
    function Q(M, v) {
      for (const Y of M)
        switch (Y.type) {
          case "activityCall":
            O(`activityDef:${Y.name}`, { defName: v.name, defType: v.type });
            break;
          case "workflowCall":
            O(`workflowDef:${Y.name}`, { defName: v.name, defType: v.type });
            break;
          case "nexusCall":
            O(`nexusServiceDef:${Y.service}`, { defName: v.name, defType: v.type });
            break;
          case "await":
            z(Y.target, v);
            break;
          case "promise":
            z(Y.target, v);
            break;
          case "awaitAll":
            Q(Y.body || [], v);
            break;
          case "awaitOne":
            for (const ke of Y.cases || [])
              ke.target && z(ke.target, v), ke.awaitAll && Q(ke.awaitAll.body || [], v), Q(ke.body || [], v);
            break;
          case "if":
            Q(Y.body || [], v), Q(Y.elseBody || [], v);
            break;
          case "for":
            Q(Y.body || [], v);
            break;
          case "switch":
            for (const ke of Y.cases || []) Q(ke.body || [], v);
            Y.default && Q(Y.default, v);
            break;
        }
    }
    for (const M of e.definitions) {
      if (M.type === "workflowDef") {
        Q(M.body || [], M);
        for (const v of M.signals || []) Q(v.body || [], M);
        for (const v of M.queries || []) Q(v.body || [], M);
        for (const v of M.updates || []) Q(v.body || [], M);
      } else if (M.type === "activityDef")
        Q(M.body || [], M);
      else if (M.type === "nexusServiceDef")
        for (const v of M.operations || [])
          v.opType === "async" && v.workflowName && O(`workflowDef:${v.workflowName}`, { defName: M.name, defType: M.type }), v.body && Q(v.body, M);
      if (M.type === "workerDef") {
        for (const v of M.workflows || []) F(w, `workflowDef:${v.name}`, M.name);
        for (const v of M.activities || []) F(w, `activityDef:${v.name}`, M.name);
        for (const v of M.services || []) F(w, `nexusServiceDef:${v.name}`, M.name);
      }
      if (M.type === "namespaceDef")
        for (const v of M.workers || []) F(D, `workerDef:${v.workerName}`, M.name);
    }
    return { callers: g, workerOf: w, namespaceOf: D };
  }, [e]), ce = u.useMemo(() => {
    const g = /* @__PURE__ */ new Set();
    for (const w of e.definitions)
      w.sourceFile && g.add(w.sourceFile);
    return Array.from(g).sort();
  }, [e]), ge = u.useCallback((g) => {
    const w = new Set(s.selectedFiles);
    w.has(g) ? w.delete(g) : w.add(g), o({ ...s, selectedFiles: w });
  }, [s, o]), pe = u.useCallback(() => {
    p ? d("", !1) : (d(r, !0), setTimeout(() => {
      var g;
      return (g = I.current) == null ? void 0 : g.focus();
    }, 50));
  }, [p, r, d]), Fe = u.useCallback((g) => {
    const w = new Set(s.visibleTypes);
    w.has(g) ? w.delete(g) : w.add(g), o({ ...s, visibleTypes: w });
  }, [s, o]), ye = u.useCallback(() => {
    l({ ...a, files: !a.files });
  }, [a, l]), ne = u.useCallback(() => {
    l({ ...a, types: !a.types });
  }, [a, l]), J = u.useMemo(() => {
    const g = e.definitions.filter((w) => !(!s.visibleTypes.has(w.type) || s.selectedFiles.size > 0 && w.sourceFile && !s.selectedFiles.has(w.sourceFile)));
    return g.sort((w, D) => {
      const O = jn.get(w.type) ?? 999, F = jn.get(D.type) ?? 999;
      return O - F;
    }), g;
  }, [e.definitions, s]), { matchSet: Be, matchIndices: Te, hiddenMatchByType: V, hiddenMatchByFile: Z } = u.useMemo(() => {
    if (!r)
      return {
        matchSet: null,
        matchIndices: [],
        hiddenMatchByType: /* @__PURE__ */ new Map(),
        hiddenMatchByFile: /* @__PURE__ */ new Map()
      };
    const g = r.toLowerCase(), w = /* @__PURE__ */ new Set(), D = [];
    J.forEach((z, Q) => {
      z.name.toLowerCase().includes(g) && (w.add(K(z)), D.push(Q));
    });
    const O = /* @__PURE__ */ new Map(), F = /* @__PURE__ */ new Map();
    for (const z of e.definitions) {
      if (!z.name.toLowerCase().includes(g)) continue;
      const Q = s.visibleTypes.has(z.type), M = s.selectedFiles.size === 0 || (z.sourceFile ? s.selectedFiles.has(z.sourceFile) : !0);
      Q ? !M && z.sourceFile && F.set(z.sourceFile, (F.get(z.sourceFile) ?? 0) + 1) : O.set(z.type, (O.get(z.type) ?? 0) + 1);
    }
    return { matchSet: w, matchIndices: D, hiddenMatchByType: O, hiddenMatchByFile: F };
  }, [r, J, e.definitions, s]), X = e.errors || [], { shownFileErrors: we, hiddenFileErrors: E } = u.useMemo(() => {
    if (s.selectedFiles.size === 0)
      return { shownFileErrors: X, hiddenFileErrors: [] };
    const g = [], w = [];
    for (const D of X)
      s.selectedFiles.has(D.file) ? g.push(D) : w.push(D);
    return { shownFileErrors: g, hiddenFileErrors: w };
  }, [X, s.selectedFiles]), c = ce.length > 0, B = X.length > 0, j = s.selectedFiles.size === 0;
  u.useEffect(() => {
    const g = (w) => {
      var D;
      w.target instanceof HTMLInputElement || w.target instanceof HTMLTextAreaElement || (w.key === "/" || w.ctrlKey && w.key === "f") && (w.preventDefault(), p ? (D = I.current) == null || D.focus() : (d(r, !0), setTimeout(() => {
        var O;
        return (O = I.current) == null ? void 0 : O.focus();
      }, 50)));
    };
    return window.addEventListener("keydown", g), () => window.removeEventListener("keydown", g);
  }, [p, r, d]), u.useEffect(() => {
    P.current = P.current.slice(0, J.length);
  }, [J.length]);
  function K(g) {
    return `${g.type}:${g.name}:${g.sourceFile ?? ""}`;
  }
  u.useEffect(() => {
    const g = new Set(e.definitions.map(K));
    x((w) => {
      const D = new Set([...w].filter((O) => g.has(O)));
      return D.size === w.size ? w : D;
    });
  }, [e.definitions]);
  const he = u.useCallback((g) => {
    x((w) => {
      const D = new Set(w);
      return D.has(g) ? D.delete(g) : D.add(g), D;
    });
  }, []), Se = u.useCallback((g, w) => {
    const D = J.findIndex((F) => F.name === g && F.type === w);
    if (D === -1) return;
    const O = K(J[D]);
    x((F) => new Set(F).add(O)), f(D), setTimeout(() => {
      var F, z;
      (F = P.current[D]) == null || F.scrollIntoView({ behavior: "smooth", block: "nearest" }), (z = P.current[D]) == null || z.focus();
    }, 50), U(O), setTimeout(() => U(null), 1e3);
  }, [J]), L = u.useMemo(() => ({
    ...Oe,
    navigateTo: Se,
    showInGraph: t
  }), [Oe, Se, t]);
  u.useEffect(() => {
    if (!m) return;
    const { name: g, defType: w } = m, D = setTimeout(() => {
      Se(g, w), T();
    }, 50);
    return () => clearTimeout(D);
  }, [m, Se, T]);
  const Ce = u.useCallback((g) => {
    var D, O, F, z, Q, M;
    const w = J.length;
    if (w !== 0)
      switch (g.key) {
        case "ArrowDown": {
          g.preventDefault();
          const v = N < w - 1 ? N + 1 : N;
          f(v), (D = P.current[v]) == null || D.focus();
          break;
        }
        case "ArrowUp": {
          g.preventDefault();
          const v = N > 0 ? N - 1 : 0;
          f(v), (O = P.current[v]) == null || O.focus();
          break;
        }
        case "ArrowRight": {
          if (g.preventDefault(), N >= 0 && N < w) {
            const v = K(J[N]);
            b.has(v) || x((Y) => new Set(Y).add(v));
          }
          break;
        }
        case "ArrowLeft": {
          if (g.preventDefault(), N >= 0 && N < w) {
            const v = K(J[N]);
            b.has(v) && x((Y) => {
              const ke = new Set(Y);
              return ke.delete(v), ke;
            });
          }
          break;
        }
        case "Enter": {
          g.preventDefault(), N >= 0 && N < w && he(K(J[N]));
          break;
        }
        case "Home": {
          g.preventDefault(), f(0), (F = P.current[0]) == null || F.focus();
          break;
        }
        case "End": {
          g.preventDefault();
          const v = w - 1;
          f(v), (z = P.current[v]) == null || z.focus();
          break;
        }
        case "n":
        case "N": {
          if (Te.length === 0) break;
          g.preventDefault();
          const v = g.key === "n", Y = ms(Te, N, v);
          f(Y), (Q = P.current[Y]) == null || Q.scrollIntoView({ behavior: "smooth", block: "nearest" }), (M = P.current[Y]) == null || M.focus();
          break;
        }
        case "Escape": {
          g.preventDefault(), p && pe();
          break;
        }
      }
  }, [J, N, b, p, pe, he, Te]), Ae = u.useMemo(() => {
    if (!Be || Te.length === 0 || N < 0) return null;
    const g = J[N];
    if (!g || !Be.has(K(g))) return null;
    const w = Te.indexOf(N);
    return w >= 0 ? w + 1 : null;
  }, [Be, Te, N, J]);
  return /* @__PURE__ */ n(bt.Provider, { value: L, children: /* @__PURE__ */ i("div", { className: "workflow-canvas", children: [
    /* @__PURE__ */ i("div", { className: `canvas-header${be ? " refresh-flash" : ""}`, children: [
      c && /* @__PURE__ */ i(gn, { children: [
        /* @__PURE__ */ i("div", { className: `header-files-section${a.files ? " section-pinned" : ""}`, children: [
          /* @__PURE__ */ n("div", { className: "header-files-row", children: ce.map((g) => {
            const w = g.split("/").pop() || g, D = s.selectedFiles.has(g), O = de.has(`file:${g}`), F = Z.get(g) ?? 0, z = [
              "header-file-tag",
              j ? "all-included" : D ? "selected" : "",
              O ? "recently-changed" : ""
            ].filter(Boolean).join(" ");
            return /* @__PURE__ */ i(
              "button",
              {
                className: z,
                onClick: () => ge(g),
                title: g,
                children: [
                  /* @__PURE__ */ n("span", { className: "header-file-icon", children: "📄" }),
                  /* @__PURE__ */ n("span", { className: "header-file-name", children: w }),
                  F > 0 && /* @__PURE__ */ n("span", { className: "header-hidden-badge", title: `${F} match${F !== 1 ? "es" : ""} hidden in this file`, children: F })
                ]
              },
              g
            );
          }) }),
          /* @__PURE__ */ n(
            Fn,
            {
              pinned: a.files,
              onClick: ye,
              flashing: $.has("files"),
              label: "Files"
            }
          )
        ] }),
        /* @__PURE__ */ n("div", { className: "header-divider" })
      ] }),
      /* @__PURE__ */ i("div", { className: `header-types-section${a.types ? " section-pinned" : ""}`, children: [
        /* @__PURE__ */ n("div", { className: "header-types-row", children: yn.map((g) => {
          const w = s.visibleTypes.has(g.type), D = de.has(`type:${g.type}`), O = V.get(g.type) ?? 0, F = [
            "header-type-tag",
            w ? "active" : "",
            `header-type-${g.type}`,
            D ? "recently-changed" : ""
          ].filter(Boolean).join(" ");
          return /* @__PURE__ */ i(
            "button",
            {
              className: F,
              onClick: () => Fe(g.type),
              title: w ? `Hide ${g.label.toLowerCase()}` : `Show ${g.label.toLowerCase()}`,
              children: [
                /* @__PURE__ */ n("span", { className: "header-type-icon", children: g.icon }),
                /* @__PURE__ */ n("span", { className: "header-type-label", children: g.label }),
                O > 0 && /* @__PURE__ */ n("span", { className: "header-hidden-badge", title: `${O} match${O !== 1 ? "es" : ""} hidden by this filter`, children: O })
              ]
            },
            g.type
          );
        }) }),
        /* @__PURE__ */ n(
          Fn,
          {
            pinned: a.types,
            onClick: ne,
            flashing: $.has("types"),
            label: "Types"
          }
        )
      ] }),
      /* @__PURE__ */ n("div", { className: "header-divider" }),
      /* @__PURE__ */ n("div", { className: "header-controls-section", children: /* @__PURE__ */ i("div", { className: `header-search ${p ? "active" : ""}`, children: [
        /* @__PURE__ */ n(
          "button",
          {
            className: "header-search-toggle",
            onClick: pe,
            title: "Search definitions",
            children: /* @__PURE__ */ n(rt, { size: 14 })
          }
        ),
        p && /* @__PURE__ */ n(
          "input",
          {
            ref: I,
            className: "header-search-input",
            type: "text",
            placeholder: "Filter by name...",
            value: r,
            onChange: (g) => d(g.target.value, !0),
            onKeyDown: (g) => {
              g.key === "Escape" && pe();
            }
          }
        ),
        p && r && Te.length > 0 && /* @__PURE__ */ n("span", { className: "header-search-counter", title: "Press n/N to jump between matches", children: Ae !== null ? `${Ae} of ${Te.length}` : `${Te.length} match${Te.length !== 1 ? "es" : ""}` }),
        p && r && Te.length === 0 && /* @__PURE__ */ n("span", { className: "header-search-counter empty", children: "no matches" })
      ] }) })
    ] }),
    /* @__PURE__ */ i("div", { className: "workflow-canvas-content", children: [
      B && /* @__PURE__ */ n(
        gs,
        {
          shownFileErrors: we,
          hiddenFileErrors: E
        }
      ),
      J.length === 0 && !B ? /* @__PURE__ */ i("div", { className: "no-workflows", children: [
        /* @__PURE__ */ n("p", { children: "No definitions match the current filters." }),
        /* @__PURE__ */ n("p", { className: "no-workflows-hint", children: "Try adjusting the type toggles or file filter above." })
      ] }) : J.length === 0 && B ? null : /* @__PURE__ */ n("div", { role: "tree", "aria-label": "Definition list", onKeyDown: Ce, children: J.map((g, w) => {
        const D = K(g), O = b.has(D), F = Be !== null && !Be.has(D), z = [
          _ === D ? "flash-target" : "",
          F ? "search-dimmed" : ""
        ].filter(Boolean).join(" ");
        return /* @__PURE__ */ n(
          "div",
          {
            role: "treeitem",
            "aria-expanded": O,
            "aria-level": 1,
            tabIndex: w === N ? 0 : -1,
            ref: (Q) => {
              P.current[w] = Q;
            },
            onFocus: () => f(w),
            className: z || void 0,
            children: /* @__PURE__ */ n(ns, { definition: g, expanded: O, onToggle: () => he(D) })
          },
          D
        );
      }) })
    ] })
  ] }) });
}
function ms(e, t, s) {
  if (e.length === 0) return t;
  if (s) {
    for (const o of e)
      if (o > t) return o;
    return e[0];
  } else {
    for (let o = e.length - 1; o >= 0; o--)
      if (e[o] < t) return e[o];
    return e[e.length - 1];
  }
}
function gs({ shownFileErrors: e, hiddenFileErrors: t }) {
  const [s, o] = u.useState(!0), a = e.length + t.length, l = [];
  e.length > 0 && l.push(`${e.length} in shown files`), t.length > 0 && l.push(`${t.length} in hidden files`);
  const r = l.length > 1 ? ` (${l.join(", ")})` : "";
  return /* @__PURE__ */ i("div", { className: "errors-header", children: [
    /* @__PURE__ */ i("div", { className: "errors-header-bar", onClick: () => o(!s), children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: s ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "errors-header-icon", children: C.error.icon }),
      /* @__PURE__ */ i("span", { className: "errors-header-title", children: [
        a,
        " ",
        a === 1 ? "error" : "errors",
        r
      ] })
    ] }),
    s && /* @__PURE__ */ i("div", { className: "errors-header-body", children: [
      e.length > 0 && /* @__PURE__ */ n(
        Zn,
        {
          label: "Shown files",
          errors: e,
          variant: "shown"
        }
      ),
      t.length > 0 && /* @__PURE__ */ n(
        Zn,
        {
          label: "Hidden files",
          errors: t,
          variant: "hidden"
        }
      )
    ] })
  ] });
}
function Zn({ label: e, errors: t, variant: s }) {
  return /* @__PURE__ */ i("div", { className: `error-group error-group-${s}`, children: [
    /* @__PURE__ */ i("div", { className: "error-group-label", children: [
      e,
      " (",
      t.length,
      ")"
    ] }),
    t.map((o, a) => /* @__PURE__ */ i("div", { className: "error-group-item", children: [
      /* @__PURE__ */ n("div", { className: "error-group-file", children: o.file.split("/").pop() }),
      /* @__PURE__ */ n("pre", { className: "error-group-message", children: o.stderr || o.error })
    ] }, a))
  ] });
}
function ys(e) {
  switch (e) {
    case "namespace":
      return 1;
    case "nexusEndpoint":
      return 1.5;
    case "worker":
    case "nexusService":
      return 2;
    case "workflow":
    case "nexusOperation":
      return 3;
    case "activity":
      return 4;
  }
}
function ks(e) {
  const t = /* @__PURE__ */ new Map();
  for (const s of e.definitions ?? [])
    switch (s.type) {
      case "workflowDef":
        t.set(`workflow:${s.name}`, { sourceFile: s.sourceFile, def: s });
        break;
      case "activityDef":
        t.set(`activity:${s.name}`, { sourceFile: s.sourceFile, def: s });
        break;
      case "workerDef":
        t.set(`worker:${s.name}`, { sourceFile: s.sourceFile, def: s });
        break;
      case "namespaceDef": {
        t.set(`namespace:${s.name}`, { sourceFile: s.sourceFile, def: s });
        for (const o of s.endpoints ?? [])
          t.set(`nexusEndpoint:${o.endpointName}`, { sourceFile: s.sourceFile, def: s });
        break;
      }
      case "nexusServiceDef": {
        t.set(`nexusService:${s.name}`, { sourceFile: s.sourceFile, def: s });
        for (const o of s.operations ?? [])
          t.set(`nexusOperation:${s.name}.${o.name}`, { sourceFile: s.sourceFile, def: s });
        break;
      }
    }
  return t;
}
function bs(e) {
  const t = e.indexOf(":");
  return t < 0 ? { kind: e, name: "" } : { kind: e.slice(0, t), name: e.slice(t + 1) };
}
function ws(e) {
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
function vs(e, t) {
  if (e === "nexusOperation") {
    const s = t.lastIndexOf(".");
    return s >= 0 ? t.slice(s + 1) : t;
  }
  return t;
}
function Ns(e, t) {
  const s = ks(t), o = /* @__PURE__ */ new Map(), a = [];
  let l = 0;
  const r = /* @__PURE__ */ new Map();
  for (const d of e.edges)
    d.kind === "containment" && r.set(d.from, d.to);
  for (const d of e.nodes) {
    const { kind: m, name: T } = bs(d.definition), $ = ws(m), y = s.get(d.definition);
    o.set(d.id, {
      id: d.id,
      level: ys($),
      nodeType: $,
      name: vs($, T),
      sourceFile: y == null ? void 0 : y.sourceFile,
      parentId: r.get(d.id),
      orphan: d.orphan ?? !1,
      definitionKey: d.definition,
      worker: d.worker,
      namespace: d.namespace,
      queue: d.queue
    });
  }
  for (const d of e.edges) {
    const m = xs(d, o, l++);
    m && a.push(m);
  }
  for (const d of e.coarsenedEdges) {
    const m = Ts(d, o, l++);
    m && a.push(m);
  }
  const p = /* @__PURE__ */ new Map();
  for (const d of o.values()) {
    const m = p.get(d.definitionKey) ?? /* @__PURE__ */ new Set();
    m.add(d.id), p.set(d.definitionKey, m);
  }
  return { nodes: o, edges: a, duplicateGroups: p };
}
function xs(e, t, s) {
  var p;
  const o = t.get(e.from), a = t.get(e.to);
  if (!o || !a) return null;
  const l = e.kind === "containment" ? "containment" : "dependency", r = {
    id: `e${s}`,
    edgeType: l,
    sourceId: e.from,
    targetId: e.to,
    sourceLevel: o.level,
    targetLevel: a.level,
    sourceNodeType: o.nodeType,
    targetNodeType: a.nodeType
  };
  return (p = e.routing) != null && p.nexusEndpoint && (r.nexusEndpoint = e.routing.nexusEndpoint), r;
}
function Ts(e, t, s) {
  const o = t.get(e.from), a = t.get(e.to);
  if (!o || !a) return null;
  const l = e.tier === "namespace" ? 1 : 2;
  return {
    id: `e${s}`,
    edgeType: "dependency",
    sourceId: e.from,
    targetId: e.to,
    sourceLevel: l,
    targetLevel: l,
    sourceNodeType: o.nodeType,
    targetNodeType: a.nodeType
  };
}
const mn = {
  // Charges (all negative = repulsion). Tuned to a roughly 8:3:1 gradient
  // L1:L2:L3, with services and operations slightly stronger than their
  // peer types so they stay clearly anchored to their bands. Endpoints
  // (L1.5) sit between namespace and worker — they're top-level but not
  // containers, so their charge is closer to a worker's than a
  // namespace's.
  chargeNamespace: -640,
  chargeNexusEndpoint: -260,
  chargeWorker: -220,
  chargeNexusService: -105,
  chargeWorkflow: -95,
  chargeNexusOperation: -85,
  chargeActivity: -80,
  // Spring strengths. With pullMultiplier at 0.6 and distanceMultiplier at
  // 0.1 every spring is a *light tether* — these k's mostly determine the
  // ranking of which connections snap closest, not the absolute pull.
  linkNsToNs: 0.05,
  linkNsToWorker: 0.2,
  linkWorkerToWorker: 0.4,
  linkWorkerToWorkflow: 0.6,
  linkWorkerToActivity: 0.3,
  linkWorkerToNexus: 0.4,
  linkNexusToOperation: 0.65,
  linkWorkflowToWorkflow: 0.75,
  linkWorkflowToActivity: 0.45,
  // Rest distances. These are pre-multiplier values; the panel's `dist`
  // master multiplies them at simulation time (currently 0.1, so the
  // effective rest length of a Wk↔Wf edge is 18 world units, etc.). The
  // spread between rows still matters — it sets the *ordering* of which
  // edges are willing to stretch furthest, not the absolute length.
  distNsToNs: 340,
  distNsToWorker: 250,
  distWorkerToWorker: 200,
  distWorkerToWorkflow: 180,
  distWorkerToActivity: 280,
  distWorkerToNexus: 180,
  distNexusToOperation: 140,
  distWorkflowToWorkflow: 120,
  distWorkflowToActivity: 90,
  // Hierarchical gravity. Y bands carry the vertical structure of the
  // layout — strong (gravityY = 0.145) and overlapping at the edges so
  // adjacent tiers can soften their boundary instead of forming a hard
  // stripe. The X band is asymmetric (0..380) because the canvas's
  // initial fit-to-view re-centres anyway; what matters is the band
  // width, which is generous enough to let wide fan-outs spread laterally.
  gravityX: 0.05,
  gravityY: 0.145,
  bandXMin: 0,
  bandXMax: 380,
  bandYMinNamespace: -340,
  bandYMaxNamespace: -120,
  bandYMinNexusEndpoint: -180,
  bandYMaxNexusEndpoint: -60,
  bandYMinWorker: -200,
  bandYMaxWorker: 120,
  bandYMinNexusService: -200,
  bandYMaxNexusService: 110,
  bandYMinNexusOperation: 10,
  bandYMaxNexusOperation: 340,
  bandYMinWorkflow: 100,
  bandYMaxWorkflow: 460,
  bandYMinActivity: 170,
  bandYMaxActivity: 500,
  // Dynamics. alphaMin is well below the d3 default (0.001) so the
  // simulation continues into its slow-cooling tail — layouts read as
  // "settled" rather than freezing while springs are still measurably
  // active. friction and cooling are stock.
  alphaDecay: 5e-3,
  alphaMin: 1e-4,
  velocityDecay: 0.4,
  chargeSoftening: 450,
  pushMultiplier: 2.6,
  pullMultiplier: 0.6,
  distanceMultiplier: 0.1,
  chargeExponent: 1.4,
  linkExponent: 1
};
function _n(e, t) {
  switch (t) {
    case "namespace":
      return e.chargeNamespace;
    case "nexusEndpoint":
      return e.chargeNexusEndpoint;
    case "worker":
      return e.chargeWorker;
    case "workflow":
      return e.chargeWorkflow;
    case "activity":
      return e.chargeActivity;
    case "nexusService":
      return e.chargeNexusService;
    case "nexusOperation":
      return e.chargeNexusOperation;
  }
}
function En(e, t) {
  switch (t) {
    case "namespace":
      return { yMin: e.bandYMinNamespace, yMax: e.bandYMaxNamespace };
    case "nexusEndpoint":
      return { yMin: e.bandYMinNexusEndpoint, yMax: e.bandYMaxNexusEndpoint };
    case "worker":
      return { yMin: e.bandYMinWorker, yMax: e.bandYMaxWorker };
    case "workflow":
      return { yMin: e.bandYMinWorkflow, yMax: e.bandYMaxWorkflow };
    case "activity":
      return { yMin: e.bandYMinActivity, yMax: e.bandYMaxActivity };
    case "nexusService":
      return { yMin: e.bandYMinNexusService, yMax: e.bandYMaxNexusService };
    case "nexusOperation":
      return { yMin: e.bandYMinNexusOperation, yMax: e.bandYMaxNexusOperation };
  }
}
const Ss = [
  "namespace",
  "nexusEndpoint",
  "worker",
  "workflow",
  "activity",
  "nexusService",
  "nexusOperation"
];
function pt(e, t) {
  const s = t.sourceNodeType, o = t.targetNodeType;
  return t.edgeType === "containment" ? s === "nexusOperation" && o === "nexusService" || s === "nexusService" && o === "nexusOperation" ? { strength: e.linkNexusToOperation, distance: e.distNexusToOperation } : s === "nexusService" && o === "worker" || s === "worker" && o === "nexusService" ? { strength: e.linkWorkerToNexus, distance: e.distWorkerToNexus } : s === "workflow" || o === "workflow" ? { strength: e.linkWorkerToWorkflow, distance: e.distWorkerToWorkflow } : s === "activity" || o === "activity" ? { strength: e.linkWorkerToActivity, distance: e.distWorkerToActivity } : { strength: e.linkNsToWorker, distance: e.distNsToWorker } : s === "namespace" || o === "namespace" ? { strength: e.linkNsToNs, distance: e.distNsToNs } : s === "worker" || o === "worker" ? { strength: e.linkWorkerToWorker, distance: e.distWorkerToWorker } : (s === "nexusOperation" ? "workflow" : s) === "workflow" && (o === "nexusOperation" ? "workflow" : o) === "workflow" ? { strength: e.linkWorkflowToWorkflow, distance: e.distWorkflowToWorkflow } : { strength: e.linkWorkflowToActivity, distance: e.distWorkflowToActivity };
}
const Rn = 50, Ze = 1e6;
class Ms {
  constructor(t, s) {
    an(this, "nodes");
    an(this, "edges");
    an(this, "params");
    an(this, "alpha");
    an(this, "nodeMap");
    this.params = { ...mn, ...s }, this.alpha = 1, this.nodes = [], this.nodeMap = /* @__PURE__ */ new Map();
    const o = (this.params.bandXMin + this.params.bandXMax) / 2, a = Math.max(40, (this.params.bandXMax - this.params.bandXMin) * 0.7);
    for (const l of t.nodes.values()) {
      const r = En(this.params, l.nodeType), p = (r.yMin + r.yMax) / 2, d = Math.max(20, (r.yMax - r.yMin) / 2), m = {
        ...l,
        x: o + (Math.random() - 0.5) * a,
        y: p + (Math.random() - 0.5) * d,
        vx: 0,
        vy: 0,
        pinned: !1
      };
      this.nodes.push(m), this.nodeMap.set(m.id, m);
    }
    for (const l of this.nodes)
      if (l.parentId) {
        const r = this.nodeMap.get(l.parentId);
        r && (l.x = r.x + (Math.random() - 0.5) * 20);
      }
    this.edges = t.edges;
  }
  getNode(t) {
    return this.nodeMap.get(t);
  }
  tick(t) {
    if (this.alpha < this.params.alphaMin) return;
    const s = t ? this.nodes.filter((b) => t.has(b.id)) : this.nodes, o = t ? this.edges.filter((b) => t.has(b.sourceId) && t.has(b.targetId)) : this.edges, a = /* @__PURE__ */ new Map();
    for (const b of o)
      a.set(b.sourceId, (a.get(b.sourceId) ?? 0) + 1), a.set(b.targetId, (a.get(b.targetId) ?? 0) + 1);
    const l = this.params.chargeSoftening, r = this.params.pushMultiplier, p = this.params.chargeExponent;
    for (let b = 0; b < s.length; b++)
      for (let x = b + 1; x < s.length; x++) {
        const _ = s[b], U = s[x];
        let be = U.x - _.x, R = U.y - _.y, ie = be * be + R * R;
        if (ie < 0.01) {
          const ye = Math.random() * Math.PI * 2;
          be = Math.cos(ye), R = Math.sin(ye), ie = 1;
        }
        const ae = Math.sqrt(ie), de = Math.sqrt(ie + l), ue = _n(this.params, _.nodeType), Oe = _n(this.params, U.nodeType), ce = (ue + Oe) / 2, ge = -(this.alpha * r * ce / Math.pow(de, p)), pe = ge * (be / ae), Fe = ge * (R / ae);
        _.pinned || (_.vx -= pe, _.vy -= Fe), U.pinned || (U.vx += pe, U.vy += Fe);
      }
    const d = this.params.pullMultiplier, m = this.params.linkExponent, T = this.params.distanceMultiplier;
    for (const b of o) {
      const x = this.nodeMap.get(b.sourceId), _ = this.nodeMap.get(b.targetId);
      if (!x || !_) continue;
      let U = _.x - x.x, be = _.y - x.y, R = Math.sqrt(U * U + be * be);
      if (R < 0.1) {
        const J = Math.random() * Math.PI * 2;
        U = Math.cos(J), be = Math.sin(J), R = 1;
      }
      const ie = pt(this.params, b), ae = ie.distance * T, de = R - ae, ue = Math.abs(de), Oe = de >= 0 ? 1 : -1, ce = this.alpha * d * ie.strength * Oe * Math.pow(ue, m) / R, ge = ce * U, pe = ce * be, Fe = a.get(b.sourceId) ?? 1, ye = a.get(b.targetId) ?? 1, ne = Fe / (Fe + ye);
      x.pinned || (x.vx += ge * (1 - ne), x.vy += pe * (1 - ne)), _.pinned || (_.vx -= ge * ne, _.vy -= pe * ne);
    }
    const $ = this.params.gravityX, y = this.params.gravityY, I = this.params.bandXMin, N = this.params.bandXMax;
    for (const b of s) {
      if (b.pinned) continue;
      let x = null;
      b.x < I ? x = I : b.x > N && (x = N), x !== null && (b.vx -= (b.x - x) * this.alpha * $);
      const _ = En(this.params, b.nodeType);
      let U = null;
      b.y < _.yMin ? U = _.yMin : b.y > _.yMax && (U = _.yMax), U !== null && (b.vy -= (b.y - U) * this.alpha * y);
    }
    const f = this.params.velocityDecay, P = Rn * Rn;
    for (const b of s) {
      if (b.pinned) continue;
      b.vx *= f, b.vy *= f, Number.isFinite(b.vx) || (b.vx = 0), Number.isFinite(b.vy) || (b.vy = 0);
      const x = b.vx * b.vx + b.vy * b.vy;
      if (x > P) {
        const _ = Rn / Math.sqrt(x);
        b.vx *= _, b.vy *= _;
      }
      b.x += b.vx, b.y += b.vy, Number.isFinite(b.x) || (b.x = 0), Number.isFinite(b.y) || (b.y = 0), b.x < -Ze ? b.x = -Ze : b.x > Ze && (b.x = Ze), b.y < -Ze ? b.y = -Ze : b.y > Ze && (b.y = Ze);
    }
    this.alpha = Math.max(this.alpha - this.params.alphaDecay, 0);
  }
  reheat(t = 0.5) {
    this.alpha = t;
  }
  isStable() {
    return this.alpha < this.params.alphaMin;
  }
  pinNode(t, s, o) {
    const a = this.nodeMap.get(t);
    a && (a.pinned = !0, a.x = s, a.y = o, a.vx = 0, a.vy = 0);
  }
  unpinNode(t) {
    const s = this.nodeMap.get(t);
    s && (s.pinned = !1);
  }
  setParams(t) {
    Object.assign(this.params, t);
  }
  // Seed a node at a given position (used when new nodes appear during a
  // level-toggle transition). X follows the seed point; Y snaps into the
  // node's own band so the hierarchy is honoured immediately.
  seedAt(t, s, o) {
    const a = this.nodeMap.get(t);
    if (!a) return;
    const l = En(this.params, a.nodeType), r = Math.min(Math.max(o, l.yMin), l.yMax);
    a.x = s + (Math.random() - 0.5) * 10, a.y = r + (Math.random() - 0.5) * 10, a.vx = 0, a.vy = 0;
  }
}
const $s = { x: 0, y: 0, scale: 1 };
function qe(e, t, s) {
  return [t * e.scale + e.x, s * e.scale + e.y];
}
function On(e, t, s) {
  return [(t - e.x) / e.scale, (s - e.y) / e.scale];
}
function Kn(e, t, s, o) {
  const a = Math.max(0.1, Math.min(10, e.scale * o)), l = (t - e.x) / e.scale, r = (s - e.y) / e.scale;
  return {
    scale: a,
    x: t - l * a,
    y: s - r * a
  };
}
function Dn(e, t, s, o = 60) {
  if (e.length === 0) return { x: t / 2, y: s / 2, scale: 1 };
  let a = 1 / 0, l = -1 / 0, r = 1 / 0, p = -1 / 0;
  for (const f of e)
    f.x < a && (a = f.x), f.x > l && (l = f.x), f.y < r && (r = f.y), f.y > p && (p = f.y);
  const d = l - a || 1, m = p - r || 1, T = t - o * 2, $ = s - o * 2, y = Math.min(T / d, $ / m, 2), I = (a + l) / 2, N = (r + p) / 2;
  return {
    scale: y,
    x: t / 2 - I * y,
    y: s / 2 - N * y
  };
}
function Cs(e, t, s, o) {
  const a = /* @__PURE__ */ new Set([e]), l = [e];
  for (; l.length > 0; ) {
    const r = l.shift();
    for (const p of t) {
      if (p.edgeType === "containment") continue;
      let d;
      o === "downstream" && p.sourceId === r ? d = p.targetId : o === "upstream" && p.targetId === r && (d = p.sourceId), d && s.has(d) && !a.has(d) && (a.add(d), l.push(d));
    }
  }
  return a;
}
function Es(e, t) {
  const s = /* @__PURE__ */ new Set();
  for (const o of t)
    o.edgeType !== "containment" && e.has(o.sourceId) && e.has(o.targetId) && s.add(o.id);
  return s;
}
const Mn = {
  namespace: { fill: "#475569", border: "#1E293B", icon: C.namespace.icon },
  // Endpoints live just below namespaces in the band stack. They route nexus
  // calls but aren't containers, so we tint them with the nexus pink while
  // keeping the slate desaturation that signals "top-level routing infra".
  nexusEndpoint: { fill: "#9F1239", border: "#4C0519", icon: C.nexusEndpoint.icon },
  worker: { fill: "#94A3B8", border: "#475569", icon: C.worker.icon },
  workflow: { fill: "#8B7EC8", border: "#5D4F95", icon: C.workflow.icon },
  activity: { fill: "#7CB9E8", border: "#4A8BC2", icon: C.activity.icon },
  nexusService: { fill: "#DB2777", border: "#831843", icon: C.nexusService.icon },
  nexusOperation: { fill: "#F9A8D4", border: "#BE185D", icon: C.nexusOperation.icon }
}, Ue = {
  containment: { color: "#94A3B8", alpha: 0.35, dash: [3, 4], width: 1 },
  opContainment: { color: "#DB2777", alpha: 0.55, dash: [3, 4], width: 1.2 },
  // op → service
  dependencyL1: { color: "#475569", alpha: 0.85, dash: [], width: 1.8 },
  // ns → ns
  dependencyL2: { color: "#64748B", alpha: 0.75, dash: [], width: 1.6 },
  // worker → worker
  workflowDep: { color: "#8B7EC8", alpha: 0.7, dash: [], width: 1.4 },
  // workflow → workflow
  workflowToActivity: { color: "#4A8BC2", alpha: 0.7, dash: [], width: 1.4 },
  // workflow → activity (activity blue)
  dependencyL3: { color: "#94A3B8", alpha: 0.55, dash: [], width: 1.4 },
  // generic L3 fallback
  dependencyL4: { color: "#94A3B8", alpha: 0.4, dash: [], width: 1.2 },
  // ends at activity (L4 leaf)
  nexusCall: { color: "#F472B6", alpha: 0.85, dash: [], width: 1.5 }
  // workflow ↔ operation, or spliced
}, Ds = "#4A90D9", Fs = "#FFFFFF", hn = 0.2, Bn = {
  1: { w: 40, h: 40, r: 20, iconSize: 18 },
  1.5: { w: 30, h: 30, r: 15, iconSize: 14 },
  2: { w: 40, h: 40, r: 20, iconSize: 18 },
  3: { w: 22, h: 22, r: 11, iconSize: 12 },
  4: { w: 16, h: 16, r: 8, iconSize: 10 }
}, Qn = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', As = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
function et(e, t) {
  return typeof document > "u" ? t : getComputedStyle(document.documentElement).getPropertyValue(e).trim() || t;
}
function Is(e, t, s) {
  if (e.edgeType === "containment")
    return t.nodeType === "nexusOperation" && s.nodeType === "nexusService" ? Ue.opContainment : Ue.containment;
  if (t.nodeType === "nexusOperation" || s.nodeType === "nexusOperation" || e.nexusEndpoint != null)
    return Ue.nexusCall;
  if (t.nodeType === "workflow" && s.nodeType === "workflow")
    return Ue.workflowDep;
  if (t.nodeType === "workflow" && s.nodeType === "activity" || t.nodeType === "activity" && s.nodeType === "workflow")
    return Ue.workflowToActivity;
  const o = Math.min(t.level, s.level);
  return o === 1 ? Ue.dependencyL1 : o === 2 ? Ue.dependencyL2 : s.level === 4 || t.level === 4 ? Ue.dependencyL4 : Ue.dependencyL3;
}
const $n = 8, Pe = 100, Ws = 0.5, nt = 0.25, Yn = 0.1;
function Ls({
  nodes: e,
  edges: t,
  viewport: s,
  onViewportChange: o,
  onNodeDragStart: a,
  onNodeDragMove: l,
  onNodeDragEnd: r,
  onDoubleClickNode: p,
  onHoverNode: d,
  onSelectNode: m,
  onNodeContextMenu: T,
  highlightedNodes: $,
  highlightedEdges: y,
  hoveredNodeId: I,
  selectedNodeId: N,
  focusedNodeId: f,
  searchMatchIds: P,
  running: b,
  showForceFields: x,
  forceParams: _,
  activeSection: U,
  activeChargeType: be,
  activeGravityType: R,
  nodeSummaries: ie
}) {
  const ae = u.useRef(null), de = u.useRef(null), [ue, Oe] = u.useState({ w: 0, h: 0 }), ce = u.useRef(null), ge = u.useMemo(() => {
    const E = /* @__PURE__ */ new Map();
    for (const c of e) E.set(c.id, c);
    return E;
  }, [e]), pe = u.useMemo(() => {
    const E = /* @__PURE__ */ new Map();
    for (const B of e) E.set(B.definitionKey, (E.get(B.definitionKey) ?? 0) + 1);
    const c = /* @__PURE__ */ new Set();
    for (const B of e)
      (E.get(B.definitionKey) ?? 0) > 1 && c.add(B.id);
    return c;
  }, [e]), Fe = u.useMemo(() => {
    const E = I ?? N;
    if (!E) return null;
    const c = ge.get(E);
    return !c || !pe.has(E) ? null : c.definitionKey;
  }, [I, N, ge, pe]), ye = u.useRef({
    nodes: e,
    edges: t,
    nodeMap: ge,
    viewport: s,
    highlightedNodes: $,
    highlightedEdges: y,
    hoveredNodeId: I,
    selectedNodeId: N,
    focusedNodeId: f,
    searchMatchIds: P,
    showForceFields: x,
    forceParams: _,
    activeSection: U,
    activeChargeType: be,
    activeGravityType: R,
    nodeSummaries: ie,
    running: b,
    dupNodeIds: pe,
    activeDupDefKey: Fe
  });
  ye.current = {
    nodes: e,
    edges: t,
    nodeMap: ge,
    viewport: s,
    highlightedNodes: $,
    highlightedEdges: y,
    hoveredNodeId: I,
    selectedNodeId: N,
    focusedNodeId: f,
    searchMatchIds: P,
    showForceFields: x,
    forceParams: _,
    activeSection: U,
    activeChargeType: be,
    activeGravityType: R,
    nodeSummaries: ie,
    running: b,
    dupNodeIds: pe,
    activeDupDefKey: Fe
  }, u.useEffect(() => {
    const E = de.current;
    if (!E) return;
    const c = new ResizeObserver((B) => {
      const { width: j, height: K } = B[0].contentRect;
      Oe({ w: Math.floor(j), h: Math.floor(K) });
    });
    return c.observe(E), () => c.disconnect();
  }, []);
  const ne = u.useCallback((E, c) => {
    const [B, j] = On(s, E, c);
    for (let K = e.length - 1; K >= 0; K--) {
      const he = e[K], Se = Bn[he.level].r / s.scale + 4;
      if ((B - he.x) ** 2 + (j - he.y) ** 2 <= Se * Se) return he;
    }
    return null;
  }, [e, s]), J = u.useCallback((E) => {
    E.preventDefault();
    const c = ae.current.getBoundingClientRect(), B = E.clientX - c.left, j = E.clientY - c.top, K = E.deltaY < 0 ? 1.1 : 0.9;
    o(Kn(s, B, j, K));
  }, [s, o]), Be = u.useCallback((E) => {
    var he;
    const c = ae.current.getBoundingClientRect(), B = E.clientX - c.left, j = E.clientY - c.top, K = ne(B, j);
    if (K) {
      ce.current = { type: "node", sx: B, sy: j, moved: !1 };
      const [Se, L] = On(s, B, j);
      a(K.id, Se, L);
    } else
      ce.current = { type: "pan", startVp: { ...s }, sx: B, sy: j, moved: !1 };
    (he = ae.current) == null || he.setPointerCapture(E.pointerId);
  }, [s, ne, a]), Te = u.useCallback((E) => {
    const c = ae.current.getBoundingClientRect(), B = E.clientX - c.left, j = E.clientY - c.top;
    if (!ce.current) {
      const K = ne(B, j);
      d((K == null ? void 0 : K.id) ?? null);
      return;
    }
    if (ce.current.moved = !0, ce.current.type === "pan" && ce.current.startVp) {
      const K = B - ce.current.sx, he = j - ce.current.sy;
      o({
        ...ce.current.startVp,
        x: ce.current.startVp.x + K,
        y: ce.current.startVp.y + he
      });
    } else if (ce.current.type === "node") {
      const [K, he] = On(s, B, j);
      l(K, he);
    }
  }, [s, ne, o, l, d]), V = u.useCallback((E) => {
    var B;
    const c = ce.current;
    if ((c == null ? void 0 : c.type) === "node") {
      if (r(), !c.moved) {
        const j = ae.current.getBoundingClientRect(), K = E.clientX - j.left, he = E.clientY - j.top, Se = ne(K, he);
        Se && m(Se.id);
      }
    } else (c == null ? void 0 : c.type) === "pan" && !c.moved && m(null);
    ce.current = null, (B = ae.current) == null || B.releasePointerCapture(E.pointerId);
  }, [r, m, ne]), Z = u.useCallback((E) => {
    const c = ae.current.getBoundingClientRect(), B = E.clientX - c.left, j = E.clientY - c.top, K = ne(B, j);
    K ? p(K.id) : o(Dn(e, ue.w, ue.h));
  }, [ne, e, ue, o, p]), X = u.useCallback((E) => {
    if (!T) return;
    const c = ae.current.getBoundingClientRect(), B = E.clientX - c.left, j = E.clientY - c.top, K = ne(B, j);
    K && (E.preventDefault(), T(K.id, E.clientX, E.clientY));
  }, [ne, T]), we = u.useRef(!0);
  return u.useEffect(() => {
    we.current = !0;
  }), u.useEffect(() => {
    const E = ae.current;
    if (!E || ue.w === 0) return;
    const c = E.getContext("2d");
    if (!c) return;
    const B = window.devicePixelRatio || 1;
    E.width = ue.w * B, E.height = ue.h * B;
    let j = 0, K = !0;
    const he = () => {
      var Y, ke, en, nn, vn;
      const L = ye.current, { w: Ce, h: Ae } = ue, g = L.highlightedNodes !== null && L.highlightedNodes.size > 0, w = et("--color-text", "#1e293b"), D = et("--color-text-muted", "#64748b"), O = w.startsWith("#") && w.length === 7 ? w + "33" : "rgba(100,116,139,0.2)", F = L.viewport;
      c.setTransform(B, 0, 0, B, 0, 0), c.clearRect(0, 0, Ce, Ae);
      for (const H of L.edges) {
        const ee = L.nodeMap.get(H.sourceId), te = L.nodeMap.get(H.targetId);
        if (!ee || !te) continue;
        const [G, fe] = qe(F, ee.x, ee.y), [se, re] = qe(F, te.x, te.y);
        if (Math.max(G, se) < -Pe || Math.min(G, se) > Ce + Pe || Math.max(fe, re) < -Pe || Math.min(fe, re) > Ae + Pe) continue;
        const ve = ((Y = L.highlightedEdges) == null ? void 0 : Y.has(H.id)) ?? !1, Me = Is(H, ee, te), Ne = Me.alpha, Ee = L.searchMatchIds !== null && (!L.searchMatchIds.has(H.sourceId) || !L.searchMatchIds.has(H.targetId));
        if (c.globalAlpha = g ? ve ? 1 : hn : Ee ? hn : Ne, c.beginPath(), c.setLineDash([...Me.dash]), c.strokeStyle = Me.color, c.lineWidth = Me.width, c.moveTo(G, fe), c.lineTo(se, re), c.stroke(), c.setLineDash([]), H.edgeType !== "containment") {
          const De = Math.atan2(re - fe, se - G), Ye = Bn[te.level].w / 2 * F.scale + 2, xe = se - Math.cos(De) * Ye, $e = re - Math.sin(De) * Ye;
          c.beginPath(), c.moveTo(xe, $e), c.lineTo(
            xe - $n * Math.cos(De - Math.PI / 6),
            $e - $n * Math.sin(De - Math.PI / 6)
          ), c.lineTo(
            xe - $n * Math.cos(De + Math.PI / 6),
            $e - $n * Math.sin(De + Math.PI / 6)
          ), c.closePath(), c.fillStyle = Me.color, c.fill();
        }
        c.globalAlpha = 1;
      }
      const z = L.activeSection === "push", Q = L.activeSection === "pull", M = L.activeSection === "gravity", v = [0.2, 0.5, 1.5];
      if (L.showForceFields || z) {
        const H = L.forceParams.chargeSoftening, ee = L.forceParams.chargeExponent, te = L.forceParams.pushMultiplier, G = z ? L.activeChargeType : null;
        for (const fe of L.nodes) {
          const [se, re] = qe(F, fe.x, fe.y), ve = 2e3;
          if (se + ve < 0 || se - ve > Ce || re + ve < 0 || re - ve > Ae) continue;
          const Me = G === null || fe.nodeType === G, Ne = z && Me, Ee = z && !Me, De = Ne ? 0.24 : Ee ? 0.04 : 0.1, je = Ne ? 0.05 : Ee ? 0.01 : 0.025, Ye = ((ke = Mn[fe.nodeType]) == null ? void 0 : ke.fill) ?? "#999";
          c.strokeStyle = Ye;
          const xe = Math.abs(_n(L.forceParams, fe.nodeType)) * te;
          if (xe <= 0) continue;
          const $e = [];
          for (let Ie = 0; Ie < v.length; Ie++) {
            const He = v[Ie], We = xe / He, Ke = Math.pow(We, 2 / Math.max(ee, 0.01)) - H;
            if (Ke <= 0) continue;
            const Ve = Math.sqrt(Ke) * F.scale;
            Ve < 2 || Ve > 2e3 || $e.push(Ve);
          }
          if ($e.length !== 0) {
            c.fillStyle = Ye, c.globalAlpha = Ne ? 0.14 : Ee ? 0.02 : 0.05, c.beginPath(), c.arc(se, re, $e[0], 0, Math.PI * 2), c.fill(), c.strokeStyle = Ye;
            for (let Ie = 0; Ie < $e.length; Ie++) {
              const He = $e[Ie], We = $e.length - 1 - Ie;
              c.beginPath(), c.arc(se, re, He, 0, Math.PI * 2), c.globalAlpha = De + We * je, c.lineWidth = Ne ? 1.5 : 1, c.stroke();
            }
          }
        }
        c.globalAlpha = 1;
      }
      if (Q) {
        const H = L.forceParams.distanceMultiplier;
        for (const ee of L.edges) {
          const te = L.nodeMap.get(ee.sourceId), G = L.nodeMap.get(ee.targetId);
          if (!te || !G) continue;
          const [fe, se] = qe(F, te.x, te.y), [re, ve] = qe(F, G.x, G.y);
          if (Math.max(fe, re) < -Pe || Math.min(fe, re) > Ce + Pe || Math.max(se, ve) < -Pe || Math.min(se, ve) > Ae + Pe) continue;
          const Ne = pt(L.forceParams, ee).distance * H, Ee = G.x - te.x, De = G.y - te.y, Ye = Math.sqrt(Ee * Ee + De * De) / Math.max(Ne, 0.1);
          let xe;
          Ye > 1.15 ? xe = "#F59E0B" : Ye < 0.85 ? xe = "#3B82F6" : xe = "#22C55E", c.beginPath(), c.moveTo(fe, se), c.lineTo(re, ve), c.strokeStyle = xe, c.globalAlpha = 0.5, c.lineWidth = 3, c.setLineDash([]), c.stroke();
          const $e = Math.atan2(De, Ee), Ie = -Math.sin($e), He = Math.cos($e), We = 5, Ke = Ne * F.scale;
          if (Ke > 10 && Ke < Math.sqrt((re - fe) ** 2 + (ve - se) ** 2) * 2) {
            const dn = fe + Math.cos($e) * Ke, Ve = se + Math.sin($e) * Ke;
            c.beginPath(), c.moveTo(dn - Ie * We, Ve - He * We), c.lineTo(dn + Ie * We, Ve + He * We), c.strokeStyle = "#22C55E", c.globalAlpha = 0.7, c.lineWidth = 1.5, c.stroke();
            const tn = re - Math.cos($e) * Ke, Nn = ve - Math.sin($e) * Ke;
            c.beginPath(), c.moveTo(tn - Ie * We, Nn - He * We), c.lineTo(tn + Ie * We, Nn + He * We), c.stroke();
          }
        }
        c.globalAlpha = 1, c.setLineDash([]);
      }
      if (M) {
        const [H] = qe(F, L.forceParams.bandXMin, 0), [ee] = qe(F, L.forceParams.bandXMax, 0);
        for (const G of Ss) {
          const fe = En(L.forceParams, G), [, se] = qe(F, 0, fe.yMin), [, re] = qe(F, 0, fe.yMax);
          if (re < 0 || se > Ae) continue;
          const ve = L.activeGravityType === G, Me = L.activeGravityType !== null && !ve;
          c.fillStyle = ((en = Mn[G]) == null ? void 0 : en.fill) ?? "#999", c.globalAlpha = ve ? 0.2 : Me ? 0.04 : 0.1, c.fillRect(0, se, Ce, re - se), c.strokeStyle = ((nn = Mn[G]) == null ? void 0 : nn.fill) ?? "#999", c.globalAlpha = ve ? 0.55 : Me ? 0.08 : 0.22, c.lineWidth = ve ? 1.5 : 1, c.setLineDash([]), c.beginPath(), c.moveTo(0, se), c.lineTo(Ce, se), c.moveTo(0, re), c.lineTo(Ce, re), c.stroke();
        }
        H < Ce + Pe && ee > -Pe && (c.strokeStyle = "#8B7EC8", c.globalAlpha = 0.5, c.lineWidth = 1.5, c.setLineDash([6, 6]), c.beginPath(), c.moveTo(H, 0), c.lineTo(H, Ae), c.moveTo(ee, 0), c.lineTo(ee, Ae), c.stroke(), c.fillStyle = "#8B7EC8", c.globalAlpha = 0.05, c.fillRect(H, 0, ee - H, Ae), c.setLineDash([])), c.globalAlpha = 1;
      }
      c.font = Qn, c.textAlign = "center", c.textBaseline = "middle";
      for (const H of L.nodes) {
        const [ee, te] = qe(F, H.x, H.y), G = Bn[H.level], fe = G.w / 2, se = G.h / 2;
        if (ee + fe < -Pe || ee - fe > Ce + Pe || te + se < -Pe || te - se > Ae + Pe) continue;
        const re = ((vn = L.highlightedNodes) == null ? void 0 : vn.has(H.id)) ?? !1, ve = L.searchMatchIds !== null && !L.searchMatchIds.has(H.id), Me = g && !re || ve;
        c.globalAlpha = Me ? hn : 1;
        const Ne = Mn[H.nodeType] ?? { fill: "#999", border: "#444", icon: "?" };
        c.beginPath(), c.arc(ee, te, G.r, 0, Math.PI * 2), c.fillStyle = Ne.fill, c.fill(), c.lineWidth = Math.max(1, Math.min(2, F.scale * 1.25)), c.strokeStyle = Ne.border, c.stroke(), F.scale >= nt && Ne.icon && (c.save(), c.font = `${G.iconSize}px ${As}`, c.fillStyle = "#FFFFFF", c.globalAlpha = (Me ? hn : 1) * 0.92, c.fillText(Ne.icon, ee, te + 0.5), c.restore()), H.orphan && F.scale >= Yn && (c.save(), c.setLineDash([3, 3]), c.strokeStyle = Ne.fill, c.lineWidth = 1.5, c.beginPath(), c.arc(ee, te, G.r + 4, 0, Math.PI * 2), c.stroke(), c.restore());
        const Ee = L.activeDupDefKey !== null && H.definitionKey === L.activeDupDefKey && F.scale >= Yn;
        if (Ee && (c.save(), c.strokeStyle = Ne.fill, c.lineWidth = 2, c.setLineDash([]), c.globalAlpha = 0.55, c.beginPath(), c.arc(ee, te, G.r + 5, 0, Math.PI * 2), c.stroke(), c.restore()), H.id === L.selectedNodeId) {
          const xe = Ee ? G.r + 10 : G.r + 5;
          c.save(), c.strokeStyle = Fs, c.lineWidth = 2.5, c.setLineDash([]), c.beginPath(), c.arc(ee, te, xe, 0, Math.PI * 2), c.stroke(), c.restore();
        }
        H.id === L.focusedNodeId && F.scale >= Yn && (c.save(), c.strokeStyle = Ds, c.lineWidth = 2, c.setLineDash([2, 2]), c.beginPath(), c.arc(ee, te, G.r + 9, 0, Math.PI * 2), c.stroke(), c.restore()), c.globalAlpha = 1;
        const De = Math.max(G.r * 4, 48), je = te + G.r + 12, Ye = H.id === L.hoveredNodeId || H.id === L.selectedNodeId;
        if ((F.scale >= nt || Ye) && (c.fillStyle = Me ? O : w, c.fillText(Ps(c, H.name, De), ee, je), F.scale >= Ws)) {
          const xe = L.nodeSummaries.get(H.id);
          xe && (c.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', c.globalAlpha = Me ? hn * 0.55 : 0.55, c.fillStyle = D, c.fillText(xe, ee, je + 13), c.font = Qn);
        }
      }
    }, Se = () => {
      if (!K) return;
      (ye.current.running || we.current) && (we.current = !1, he()), j = requestAnimationFrame(Se);
    };
    return j = requestAnimationFrame(Se), () => {
      K = !1, cancelAnimationFrame(j);
    };
  }, [ue]), /* @__PURE__ */ n("div", { ref: de, className: "graph-canvas-container", children: /* @__PURE__ */ n(
    "canvas",
    {
      ref: ae,
      style: { width: ue.w, height: ue.h },
      onWheel: J,
      onPointerDown: Be,
      onPointerMove: Te,
      onPointerUp: V,
      onDoubleClick: Z,
      onContextMenu: X
    }
  ) });
}
function Ps(e, t, s) {
  if (e.measureText(t).width <= s) return t;
  for (let o = t.length - 1; o > 0; o--) {
    const a = t.slice(0, o) + "…";
    if (e.measureText(a).width <= s) return a;
  }
  return "…";
}
const Rs = [
  {
    key: "pushMultiplier",
    label: "push",
    min: 0,
    max: 3,
    step: 0.1,
    tooltip: "Master multiplier for all repulsion forces"
  },
  {
    key: "chargeExponent",
    label: "exp",
    min: 0.5,
    max: 3,
    step: 0.1,
    tooltip: "Power of distance in charge falloff. 2 = inverse-square"
  },
  {
    key: "chargeSoftening",
    label: "softening",
    min: 0,
    max: 2e3,
    step: 50,
    tooltip: "Added to dist² — prevents singularity at close range"
  }
], Os = [
  {
    key: "chargeNamespace",
    nodeType: "namespace",
    label: "L1 NS",
    min: -1e3,
    max: 0,
    step: 10,
    tooltip: "Namespace node repulsion charge"
  },
  {
    key: "chargeNexusEndpoint",
    nodeType: "nexusEndpoint",
    label: "L1.5 Ep",
    min: -400,
    max: 0,
    step: 10,
    tooltip: "Nexus endpoint node repulsion charge"
  },
  {
    key: "chargeWorker",
    nodeType: "worker",
    label: "L2 Wk",
    min: -400,
    max: 0,
    step: 10,
    tooltip: "Worker node repulsion charge"
  },
  {
    key: "chargeWorkflow",
    nodeType: "workflow",
    label: "L3 Wf",
    min: -200,
    max: 0,
    step: 5,
    tooltip: "Workflow node repulsion charge"
  },
  {
    key: "chargeActivity",
    nodeType: "activity",
    label: "L3 Act",
    min: -200,
    max: 0,
    step: 5,
    tooltip: "Activity node repulsion charge"
  },
  {
    key: "chargeNexusService",
    nodeType: "nexusService",
    label: "L3 Nx",
    min: -200,
    max: 0,
    step: 5,
    tooltip: "Nexus service node repulsion charge"
  },
  {
    key: "chargeNexusOperation",
    nodeType: "nexusOperation",
    label: "L3 Op",
    min: -200,
    max: 0,
    step: 5,
    tooltip: "Nexus operation node repulsion charge"
  }
], Bs = [
  {
    key: "pullMultiplier",
    label: "pull",
    min: 0,
    max: 3,
    step: 0.1,
    tooltip: "Master multiplier for all spring forces"
  },
  {
    key: "linkExponent",
    label: "exp",
    min: 0.5,
    max: 3,
    step: 0.1,
    tooltip: "Power of displacement in spring force. 1 = linear (Hooke)"
  },
  {
    key: "distanceMultiplier",
    label: "dist",
    min: 0.05,
    max: 3,
    step: 0.05,
    tooltip: "Master multiplier for all rest distances"
  }
], Ys = 0, _s = 1.5, Ks = 0.05, Vs = 10, qs = 600, Hs = 10, zs = [
  // Level 1
  {
    label: "NS↔NS",
    kKey: "linkNsToNs",
    restKey: "distNsToNs",
    sourceType: "namespace",
    targetType: "namespace",
    tooltip: "Namespace ↔ Namespace dependency"
  },
  {
    label: "NS↔Wk",
    kKey: "linkNsToWorker",
    restKey: "distNsToWorker",
    sourceType: "namespace",
    targetType: "worker",
    tooltip: "Namespace ↔ Worker containment"
  },
  // Level 2
  {
    label: "Wk↔Wk",
    kKey: "linkWorkerToWorker",
    restKey: "distWorkerToWorker",
    sourceType: "worker",
    targetType: "worker",
    tooltip: "Worker ↔ Worker dependency"
  },
  {
    label: "Wk↔Wf",
    kKey: "linkWorkerToWorkflow",
    restKey: "distWorkerToWorkflow",
    sourceType: "worker",
    targetType: "workflow",
    tooltip: "Worker ↔ Workflow containment"
  },
  {
    label: "Wk↔Act",
    kKey: "linkWorkerToActivity",
    restKey: "distWorkerToActivity",
    sourceType: "worker",
    targetType: "activity",
    tooltip: "Worker ↔ Activity containment"
  },
  {
    label: "Wk↔Nx",
    kKey: "linkWorkerToNexus",
    restKey: "distWorkerToNexus",
    sourceType: "worker",
    targetType: "nexusService",
    tooltip: "Worker ↔ Nexus service containment"
  },
  // Level 3 (intra-L3 containment + dependencies)
  {
    label: "Nx↔Op",
    kKey: "linkNexusToOperation",
    restKey: "distNexusToOperation",
    sourceType: "nexusService",
    targetType: "nexusOperation",
    tooltip: "Nexus service ↔ Nexus operation containment"
  },
  {
    label: "Wf↔Wf",
    kKey: "linkWorkflowToWorkflow",
    restKey: "distWorkflowToWorkflow",
    sourceType: "workflow",
    targetType: "workflow",
    tooltip: "Workflow ↔ Workflow dependency"
  },
  {
    label: "Wf↔Act",
    kKey: "linkWorkflowToActivity",
    restKey: "distWorkflowToActivity",
    sourceType: "workflow",
    targetType: "activity",
    tooltip: "Workflow ↔ Activity dependency"
  }
], Gs = [
  {
    key: "gravityX",
    label: "X strength",
    min: 0,
    max: 0.2,
    step: 5e-3,
    tooltip: "Pull toward the nearest edge of the global X band"
  },
  {
    key: "gravityY",
    label: "Y strength",
    min: 0,
    max: 0.2,
    step: 5e-3,
    tooltip: "Pull toward the nearest edge of each node type’s Y band"
  }
], ht = -600, ft = 600, mt = 10, Us = [
  {
    label: "L1 NS",
    nodeType: "namespace",
    minKey: "bandYMinNamespace",
    maxKey: "bandYMaxNamespace",
    tooltip: "Y band where namespace nodes feel zero gravity"
  },
  {
    label: "L1.5 Ep",
    nodeType: "nexusEndpoint",
    minKey: "bandYMinNexusEndpoint",
    maxKey: "bandYMaxNexusEndpoint",
    tooltip: "Y band where nexus endpoint nodes feel zero gravity"
  },
  {
    label: "L2 Wk",
    nodeType: "worker",
    minKey: "bandYMinWorker",
    maxKey: "bandYMaxWorker",
    tooltip: "Y band where worker nodes feel zero gravity"
  },
  {
    label: "L2 Nx",
    nodeType: "nexusService",
    minKey: "bandYMinNexusService",
    maxKey: "bandYMaxNexusService",
    tooltip: "Y band where nexus service nodes feel zero gravity"
  },
  {
    label: "L3 Wf",
    nodeType: "workflow",
    minKey: "bandYMinWorkflow",
    maxKey: "bandYMaxWorkflow",
    tooltip: "Y band where workflow nodes feel zero gravity"
  },
  {
    label: "L3 Op",
    nodeType: "nexusOperation",
    minKey: "bandYMinNexusOperation",
    maxKey: "bandYMaxNexusOperation",
    tooltip: "Y band where nexus operation nodes feel zero gravity"
  },
  {
    label: "L4 Act",
    nodeType: "activity",
    minKey: "bandYMinActivity",
    maxKey: "bandYMaxActivity",
    tooltip: "Y band where activity nodes feel zero gravity"
  }
], Xs = [
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
];
function js({
  params: e,
  onParamChange: t,
  running: s,
  onToggleRunning: o,
  onReheat: a,
  showForceFields: l,
  onToggleForceFields: r,
  onActiveSection: p,
  onActiveChargeType: d,
  onActiveGravityType: m
}) {
  const [T, $] = u.useState(!1), [y, I] = u.useState(!1), N = () => {
    for (const f of Object.keys(mn))
      e[f] !== mn[f] && t(f, mn[f]);
  };
  return /* @__PURE__ */ i("div", { className: `graph-control-panel ${T ? "open" : ""}`, children: [
    /* @__PURE__ */ i(
      "button",
      {
        className: "graph-control-panel-toggle",
        onClick: () => $(!T),
        title: "Toggle control panel",
        children: [
          T ? "▼ Forces" : "▶ Forces",
          T && /* @__PURE__ */ n(
            "span",
            {
              className: "graph-control-help-btn",
              onClick: (f) => {
                f.stopPropagation(), I(!y);
              },
              title: "How the simulation works",
              children: "?"
            }
          )
        ]
      }
    ),
    T && y && /* @__PURE__ */ n("div", { className: "graph-control-help-popover", children: /* @__PURE__ */ n("pre", { className: "graph-control-help-text", children: Qs }) }),
    T && /* @__PURE__ */ i("div", { className: "graph-control-panel-body", children: [
      /* @__PURE__ */ i(Cn, { section: "push", title: "PUSH", subtitle: "all node pairs", equation: `F = α × push × charge / eff^exp
eff = √(d² + softening)`, onHover: (f) => p(f ? "push" : null), children: [
        Rs.map((f) => /* @__PURE__ */ n(fn, { def: f, value: e[f.key], onChange: (P) => t(f.key, P) }, f.key)),
        /* @__PURE__ */ i("div", { className: "graph-control-sub-header", children: [
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Level" }),
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Charge" })
        ] }),
        Os.map((f) => /* @__PURE__ */ n(
          "div",
          {
            onMouseEnter: () => d(f.nodeType),
            onMouseLeave: () => d(null),
            children: /* @__PURE__ */ n(
              fn,
              {
                def: f,
                value: e[f.key],
                onChange: (P) => t(f.key, P),
                nodeType: f.nodeType
              }
            )
          },
          f.key
        ))
      ] }),
      /* @__PURE__ */ i(Cn, { section: "pull", title: "PULL", subtitle: "connected pairs", equation: `F = α × pull × k × sign(Δ) × |Δ|^exp / d
Δ = d − rest × dist`, onHover: (f) => p(f ? "pull" : null), children: [
        Bs.map((f) => /* @__PURE__ */ n(fn, { def: f, value: e[f.key], onChange: (P) => t(f.key, P) }, f.key)),
        /* @__PURE__ */ i("div", { className: "graph-control-sub-header", children: [
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", style: { minWidth: 52 }, children: "Edge" }),
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "k" }),
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "rest" })
        ] }),
        zs.map((f) => /* @__PURE__ */ n(Js, { def: f, params: e, onChange: t }, f.label))
      ] }),
      /* @__PURE__ */ i(
        Cn,
        {
          section: "gravity",
          title: "GRAVITY",
          subtitle: "hierarchical anchor",
          equation: `Fₓ = α × X × (0 − x)
Fᵧ = α × Y × (band − y) when y outside band`,
          onHover: (f) => {
            p(f ? "gravity" : null), f || m(null);
          },
          children: [
            Gs.map((f) => /* @__PURE__ */ n(fn, { def: f, value: e[f.key], onChange: (P) => t(f.key, P) }, f.key)),
            /* @__PURE__ */ i("div", { className: "graph-control-sub-header", children: [
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Axis" }),
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "X band (left \\u2192 right)" })
            ] }),
            /* @__PURE__ */ i("div", { className: "graph-control-band-row", children: [
              /* @__PURE__ */ n("span", { className: "graph-control-band-label", children: "X" }),
              /* @__PURE__ */ n(
                gt,
                {
                  min: ht,
                  max: ft,
                  step: mt,
                  valueMin: e.bandXMin,
                  valueMax: e.bandXMax,
                  onChangeMin: (f) => t("bandXMin", f),
                  onChangeMax: (f) => t("bandXMax", f),
                  nodeType: "namespace"
                }
              ),
              /* @__PURE__ */ n("span", { className: "graph-control-band-value", children: Math.round(e.bandXMin) }),
              /* @__PURE__ */ n("span", { className: "graph-control-band-value", children: Math.round(e.bandXMax) })
            ] }),
            /* @__PURE__ */ i("div", { className: "graph-control-sub-header", children: [
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Type" }),
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Y band (top \\u2192 bottom)" })
            ] }),
            Us.map((f) => /* @__PURE__ */ n(
              "div",
              {
                onMouseEnter: () => m(f.nodeType),
                onMouseLeave: () => m(null),
                children: /* @__PURE__ */ n(
                  Zs,
                  {
                    def: f,
                    valueMin: e[f.minKey],
                    valueMax: e[f.maxKey],
                    onChangeMin: (P) => t(f.minKey, P),
                    onChangeMax: (P) => t(f.maxKey, P)
                  }
                )
              },
              f.nodeType
            ))
          ]
        }
      ),
      /* @__PURE__ */ n(Cn, { section: "dynamics", title: "DYNAMICS", subtitle: "", equation: `v ×= friction
α −= cooling, stop at threshold`, onHover: (f) => p(f ? "dynamics" : null), children: Xs.map((f) => /* @__PURE__ */ n(fn, { def: f, value: e[f.key], onChange: (P) => t(f.key, P) }, f.key)) }),
      /* @__PURE__ */ i("div", { className: "graph-control-group", children: [
        /* @__PURE__ */ i("div", { className: "graph-control-sim-buttons", children: [
          /* @__PURE__ */ n("button", { className: "graph-header-btn", onClick: o, children: s ? "Pause" : "Play" }),
          /* @__PURE__ */ n("button", { className: "graph-header-btn", onClick: a, children: "Reheat" }),
          /* @__PURE__ */ n("button", { className: "graph-header-btn", onClick: N, title: "Reset all parameters to defaults", children: "Reset" })
        ] }),
        /* @__PURE__ */ i("label", { className: "graph-control-checkbox", title: "Show charge field rings around nodes", children: [
          /* @__PURE__ */ n("input", { type: "checkbox", checked: l, onChange: r }),
          "Show force fields"
        ] })
      ] })
    ] })
  ] });
}
function Cn({ section: e, title: t, subtitle: s, equation: o, onHover: a, children: l }) {
  return /* @__PURE__ */ i(
    "div",
    {
      className: `graph-control-equation-section graph-control-section-${e}`,
      onMouseEnter: () => a(!0),
      onMouseLeave: () => a(!1),
      children: [
        /* @__PURE__ */ i("div", { className: "graph-control-equation-header", children: [
          /* @__PURE__ */ n("span", { className: "graph-control-equation-title", children: t }),
          s && /* @__PURE__ */ i("span", { className: "graph-control-equation-subtitle", children: [
            "(",
            s,
            ")"
          ] })
        ] }),
        /* @__PURE__ */ n("pre", { className: "graph-control-equation-formula", children: o }),
        /* @__PURE__ */ n("div", { className: "graph-control-equation-body", children: l })
      ]
    }
  );
}
function Js({ def: e, params: t, onChange: s }) {
  const o = t[e.kKey], a = t[e.restKey], l = String(o), r = String(Math.round(a));
  return /* @__PURE__ */ i("div", { className: "graph-control-pull-edge", title: e.tooltip, children: [
    /* @__PURE__ */ i("span", { className: "graph-control-pull-edge-label", children: [
      /* @__PURE__ */ n("span", { className: `graph-control-edge-dot graph-control-typed-${e.sourceType}` }),
      /* @__PURE__ */ n("span", { className: `graph-control-edge-dot graph-control-typed-${e.targetType}` }),
      e.label
    ] }),
    /* @__PURE__ */ n(
      "input",
      {
        type: "range",
        min: Ys,
        max: _s,
        step: Ks,
        value: o,
        onChange: (p) => s(e.kKey, Number(p.target.value)),
        className: "graph-control-slider-input graph-control-pull-slider"
      }
    ),
    /* @__PURE__ */ n("span", { className: "graph-control-pull-value", children: l }),
    /* @__PURE__ */ n(
      "input",
      {
        type: "range",
        min: Vs,
        max: qs,
        step: Hs,
        value: a,
        onChange: (p) => s(e.restKey, Number(p.target.value)),
        className: "graph-control-slider-input graph-control-pull-slider"
      }
    ),
    /* @__PURE__ */ n("span", { className: "graph-control-pull-value", children: r })
  ] });
}
function Zs({ def: e, valueMin: t, valueMax: s, onChangeMin: o, onChangeMax: a }) {
  return /* @__PURE__ */ i(
    "div",
    {
      className: `graph-control-band-row graph-control-typed-row graph-control-typed-${e.nodeType}`,
      title: e.tooltip,
      children: [
        /* @__PURE__ */ n("span", { className: "graph-control-band-label", children: e.label }),
        /* @__PURE__ */ n(
          gt,
          {
            min: ht,
            max: ft,
            step: mt,
            valueMin: t,
            valueMax: s,
            onChangeMin: o,
            onChangeMax: a,
            nodeType: e.nodeType
          }
        ),
        /* @__PURE__ */ n("span", { className: "graph-control-band-value", children: Math.round(t) }),
        /* @__PURE__ */ n("span", { className: "graph-control-band-value", children: Math.round(s) })
      ]
    }
  );
}
function gt({
  min: e,
  max: t,
  step: s,
  valueMin: o,
  valueMax: a,
  onChangeMin: l,
  onChangeMax: r,
  nodeType: p
}) {
  const d = t - e, m = (o - e) / d * 100, T = Math.max(0, (a - o) / d * 100);
  return /* @__PURE__ */ i("div", { className: `dual-range dual-range-${p}`, children: [
    /* @__PURE__ */ n("div", { className: "dual-range-track" }),
    /* @__PURE__ */ n(
      "div",
      {
        className: "dual-range-fill",
        style: { left: `${m}%`, width: `${T}%` }
      }
    ),
    /* @__PURE__ */ n(
      "input",
      {
        type: "range",
        className: "dual-range-input dual-range-input-low",
        min: e,
        max: t,
        step: s,
        value: o,
        onChange: ($) => {
          const y = Math.min(Number($.target.value), a - s);
          l(y);
        }
      }
    ),
    /* @__PURE__ */ n(
      "input",
      {
        type: "range",
        className: "dual-range-input dual-range-input-high",
        min: e,
        max: t,
        step: s,
        value: a,
        onChange: ($) => {
          const y = Math.max(Number($.target.value), o + s);
          r(y);
        }
      }
    )
  ] });
}
function fn({ def: e, value: t, onChange: s, nodeType: o }) {
  const a = e.step < 1 ? String(t) : String(Math.round(t)), l = o ? `graph-control-slider graph-control-typed-row graph-control-typed-${o}` : "graph-control-slider";
  return /* @__PURE__ */ i("div", { className: l, title: e.tooltip, children: [
    /* @__PURE__ */ n("label", { className: "graph-control-slider-label", children: e.label }),
    /* @__PURE__ */ n(
      "input",
      {
        type: "range",
        min: e.min,
        max: e.max,
        step: e.step,
        value: t,
        onChange: (r) => s(Number(r.target.value)),
        className: "graph-control-slider-input"
      }
    ),
    /* @__PURE__ */ n("span", { className: "graph-control-slider-value", children: a })
  ] });
}
const Qs = `Force-directed graph layout:

PUSH — Nodes repel each other via charge force.
  F = α × push × charge / eff^exp
  eff = √(d² + softening)

PULL — Connected nodes attract via spring force.
  F = α × pull × k × sign(Δ) × |Δ|^exp / d
  Δ = d − rest × dist

GRAVITY — All nodes drift toward center of mass.
  F = α × gravity × (pos − COM)

DYNAMICS — Friction damps velocity, cooling reduces
  energy until the simulation stabilizes.

Hierarchy & node types:
  L1:   Namespace
  L1.5: NexusEndpoint (top-level routing alias)
  L2:   Worker, NexusService
  L3:   Workflow, NexusOperation
  L4:   Activity

Tuning guide:
  • Start with push/pull multipliers for balance
  • If nodes overlap → increase push or charge
  • If too spread → increase pull or gravity
  • If oscillating → increase friction or cooling
  • Toggle "Show force fields" to see charge reach`;
function eo({ x: e, y: t, items: s, onClose: o }) {
  const a = u.useRef(null);
  u.useEffect(() => {
    const r = (d) => {
      d.key === "Escape" && o();
    }, p = (d) => {
      a.current && (a.current.contains(d.target) || o());
    };
    return window.addEventListener("keydown", r), window.addEventListener("mousedown", p, !0), () => {
      window.removeEventListener("keydown", r), window.removeEventListener("mousedown", p, !0);
    };
  }, [o]);
  const l = u.useMemo(() => {
    const d = 40 + s.length * 28, m = Math.min(e, window.innerWidth - 180 - 8), T = Math.min(t, window.innerHeight - d - 8);
    return { left: m, top: T };
  }, [e, t, s.length]);
  return /* @__PURE__ */ n("div", { ref: a, className: "graph-context-menu", style: l, role: "menu", children: s.map((r, p) => /* @__PURE__ */ n(
    "button",
    {
      role: "menuitem",
      className: "graph-context-menu-item",
      onClick: () => {
        r.onClick(), o();
      },
      children: r.label
    },
    p
  )) });
}
function ln(e) {
  switch (e) {
    case "namespace":
      return "namespaceDef";
    case "nexusEndpoint":
      return "nexusEndpointDef";
    case "worker":
      return "workerDef";
    case "workflow":
      return "workflowDef";
    case "activity":
      return "activityDef";
    case "nexusService":
      return "nexusServiceDef";
    case "nexusOperation":
      return "nexusOperationDef";
    default:
      return "workflowDef";
  }
}
function yt(e, t, s) {
  const o = s(e);
  if (!o) return null;
  let a = o.parentId;
  for (; a; ) {
    if (t.has(a)) return a;
    const l = s(a);
    a = l == null ? void 0 : l.parentId;
  }
  return null;
}
function Vn(e, t, s, o, a, l) {
  if (t) return [e];
  const r = l(e);
  if ((r == null ? void 0 : r.nodeType) === "nexusOperation") {
    const d = [];
    for (const m of o.edges) {
      if (m.edgeType !== "dependency") continue;
      const T = s === "tgt" ? m.sourceId === e ? m.targetId : null : m.targetId === e ? m.sourceId : null;
      if (T)
        for (const $ of Vn(T, a.has(T), s, o, a, l))
          d.push($);
    }
    if (d.length > 0) return d;
  }
  const p = yt(e, a, l);
  return p ? [p] : [];
}
function no(e, t, s) {
  if (e.level === 1) {
    let o = 0, a = 0;
    for (const r of t) {
      if (r.edgeType !== "containment" || r.targetId !== e.id) continue;
      const p = s.get(r.sourceId);
      p && (p.nodeType === "worker" ? o++ : p.nodeType === "nexusEndpoint" && a++);
    }
    const l = [];
    return o > 0 && l.push(`${o} worker${o !== 1 ? "s" : ""}`), a > 0 && l.push(`${a} endpoint${a !== 1 ? "s" : ""}`), l.join(" · ");
  } else {
    if (e.level === 1.5)
      return "";
    if (e.level === 2) {
      let o = 0, a = 0, l = 0;
      for (const p of t) {
        if (p.edgeType !== "containment" || p.targetId !== e.id) continue;
        const d = s.get(p.sourceId);
        d && (d.nodeType === "workflow" ? o++ : d.nodeType === "activity" ? a++ : d.nodeType === "nexusService" && l++);
      }
      const r = [];
      return o > 0 && r.push(`${o}wf`), a > 0 && r.push(`${a}act`), l > 0 && r.push(`${l}nxs`), r.join(" · ");
    } else {
      let o = 0, a = 0;
      for (const r of t)
        r.edgeType !== "containment" && (r.sourceId === e.id && o++, r.targetId === e.id && a++);
      const l = [];
      return o > 0 && l.push(`→${o}`), a > 0 && l.push(`←${a}`), l.join(" ");
    }
  }
}
function to(e) {
  switch (e) {
    case "namespaceDef":
      return "namespace";
    case "nexusEndpointDef":
      return "nexusEndpoint";
    case "workerDef":
      return "worker";
    case "workflowDef":
      return "workflow";
    case "activityDef":
      return "activity";
    case "nexusServiceDef":
      return "nexusService";
    case "nexusOperationDef":
      return "nexusOperation";
    default:
      return "workflow";
  }
}
function so({
  ast: e,
  parserGraph: t,
  onShowInTree: s,
  filter: o,
  onFilterChange: a,
  pins: l,
  onPinsChange: r,
  searchQuery: p,
  searchActive: d,
  onSearchChange: m,
  pendingFocus: T,
  onFocusConsumed: $,
  overriddenPins: y,
  onOverriddenPinsConsumed: I
}) {
  const N = o.visibleTypes, f = o.selectedFiles, [P, b] = u.useState($s), [x, _] = u.useState(!0), [U, be] = u.useState({ ...mn }), R = u.useRef(null), ie = u.useRef(null), ae = u.useRef(!1), de = u.useRef(null), ue = u.useRef(null), [Oe, ce] = u.useState(0), ge = u.useRef({ frames: 0, lastStamp: 0 }), [pe, Fe] = u.useState(null), [ye, ne] = u.useState(null), [J, Be] = u.useState(-1), [Te, V] = u.useState(!1), [Z, X] = u.useState(!1), [we, E] = u.useState(null), [c, B] = u.useState(null), [j, K] = u.useState(null), he = u.useRef(null), [Se, L] = u.useState(!1), [Ce, Ae] = u.useState(null), g = u.useRef(o), [w, D] = u.useState(/* @__PURE__ */ new Set());
  u.useEffect(() => {
    const h = g.current;
    if (In(h, o)) return;
    const k = /* @__PURE__ */ new Set();
    for (const S of o.selectedFiles) h.selectedFiles.has(S) || k.add(`file:${S}`);
    for (const S of o.visibleTypes) h.visibleTypes.has(S) || k.add(`type:${S}`);
    if (g.current = o, k.size > 0) {
      D(k);
      const S = setTimeout(() => D(/* @__PURE__ */ new Set()), 450);
      return () => clearTimeout(S);
    }
  }, [o]), u.useEffect(() => {
    if (y.size === 0) return;
    const h = setTimeout(I, 600);
    return () => clearTimeout(h);
  }, [y, I]);
  const O = u.useMemo(
    () => Ns(t, e),
    [t, e]
  ), [F, z] = u.useState(0);
  u.useEffect(() => {
    R.current = new Ms(O, U), ae.current = !1, ge.current = { frames: 0, lastStamp: 0 }, _(!0), ne(null), Fe(null), Be(-1), z((h) => h + 1);
  }, [O]);
  const Q = u.useMemo(() => {
    const h = /* @__PURE__ */ new Set();
    for (const k of O.nodes.values())
      k.sourceFile && h.add(k.sourceFile);
    return Array.from(h).sort();
  }, [O]), { visibleNodes: M, visibleEdges: v, visibleIds: Y, nodeSummaries: ke } = u.useMemo(() => {
    const h = R.current;
    if (!h) return { visibleNodes: [], visibleEdges: [], visibleIds: /* @__PURE__ */ new Set(), nodeSummaries: /* @__PURE__ */ new Map() };
    const k = f.size > 0, S = /* @__PURE__ */ new Set(), W = [];
    for (const q of h.nodes)
      N.has(ln(q.nodeType)) && (k && q.sourceFile && !f.has(q.sourceFile) || (S.add(q.id), W.push(q)));
    const A = (q) => h.getNode(q), oe = [], me = /* @__PURE__ */ new Map();
    for (const q of h.edges) {
      const un = S.has(q.sourceId), Un = S.has(q.targetId);
      if (q.edgeType === "containment") {
        if (!un) continue;
        if (Un)
          oe.push(q);
        else {
          const pn = yt(q.targetId, S, A);
          if (pn) {
            const Je = A(pn);
            oe.push({
              ...q,
              targetId: pn,
              targetLevel: (Je == null ? void 0 : Je.level) ?? q.targetLevel,
              targetNodeType: (Je == null ? void 0 : Je.nodeType) ?? q.targetNodeType,
              id: `grad:${q.id}`
            });
          }
        }
      } else {
        const pn = Vn(q.sourceId, un, "src", h, S, A), Je = Vn(q.targetId, Un, "tgt", h, S, A);
        for (const Tn of pn)
          for (const Sn of Je) {
            if (Tn === Sn) continue;
            const Ln = `${Tn}→${Sn}`, Xn = me.get(Ln);
            if (Xn && Xn.nexusEndpoint && !q.nexusEndpoint) continue;
            const sn = A(Tn), on = A(Sn);
            me.set(Ln, {
              ...q,
              sourceId: Tn,
              targetId: Sn,
              sourceLevel: (sn == null ? void 0 : sn.level) ?? q.sourceLevel,
              targetLevel: (on == null ? void 0 : on.level) ?? q.targetLevel,
              sourceNodeType: (sn == null ? void 0 : sn.nodeType) ?? q.sourceNodeType,
              targetNodeType: (on == null ? void 0 : on.nodeType) ?? q.targetNodeType,
              id: `grad:${Ln}`
            });
          }
      }
    }
    const _e = [...oe, ...me.values()], Le = /* @__PURE__ */ new Map();
    for (const q of W) Le.set(q.id, q);
    const xn = /* @__PURE__ */ new Map();
    for (const q of W) {
      const un = no(q, _e, Le);
      un && xn.set(q.id, un);
    }
    return { visibleNodes: W, visibleEdges: _e, visibleIds: S, nodeSummaries: xn };
  }, [N, f, O, F]), { visibleMatchIds: en, hiddenMatchCount: nn } = u.useMemo(() => {
    if (!p) return { visibleMatchIds: null, hiddenMatchCount: 0 };
    const h = p.toLowerCase(), k = R.current;
    if (!k) return { visibleMatchIds: /* @__PURE__ */ new Set(), hiddenMatchCount: 0 };
    const S = /* @__PURE__ */ new Set();
    let W = 0;
    for (const A of k.nodes)
      A.name.toLowerCase().includes(h) && (Y.has(A.id) ? S.add(A.id) : W++);
    return { visibleMatchIds: S, hiddenMatchCount: W };
  }, [p, Y]), { highlightedNodes: vn, highlightedEdges: H } = u.useMemo(() => {
    const h = pe ?? ye;
    if (!h || !Y.has(h))
      return { highlightedNodes: null, highlightedEdges: null };
    const S = Cs(h, v, Y, Te ? "upstream" : "downstream"), W = Es(S, v);
    return { highlightedNodes: S, highlightedEdges: W };
  }, [pe, ye, Te, v, Y, O]);
  u.useEffect(() => {
    if (!x) return;
    let h = 0;
    const k = () => {
      const S = R.current;
      if (!S) return;
      if (S.tick(Y), !ae.current && S.alpha < 0.3) {
        const me = de.current;
        if (me) {
          const { width: _e, height: Le } = me.getBoundingClientRect();
          _e > 0 && Le > 0 && (b(Dn(M, _e, Le)), ae.current = !0);
        }
      }
      if (ae.current && ue.current) {
        const me = S.getNode(ue.current.nodeId);
        if (me) {
          const _e = de.current;
          if (_e) {
            const { width: Le, height: xn } = _e.getBoundingClientRect();
            b((q) => ({
              scale: Math.max(q.scale, 1.2),
              x: Le / 2 - me.x * Math.max(q.scale, 1.2),
              y: xn / 2 - me.y * Math.max(q.scale, 1.2)
            })), ne(me.id);
          }
        }
        ue.current = null;
      }
      const W = performance.now(), A = ge.current;
      A.frames++, A.lastStamp === 0 && (A.lastStamp = W);
      const oe = W - A.lastStamp;
      if (oe >= 500) {
        const me = Math.round(A.frames * 1e3 / oe);
        ce((_e) => _e === me ? _e : me), A.frames = 0, A.lastStamp = W;
      }
      if (S.isStable()) {
        _(!1);
        return;
      }
      h = requestAnimationFrame(k);
    };
    return h = requestAnimationFrame(k), () => {
      h && cancelAnimationFrame(h);
    };
  }, [x, Y, M, ye]);
  const [, ee] = u.useState(0);
  u.useEffect(() => {
    if (!x || !pe) return;
    const h = window.setInterval(() => ee((k) => k + 1), 100);
    return () => window.clearInterval(h);
  }, [x, pe]);
  const te = u.useRef(N);
  u.useEffect(() => {
    const h = te.current;
    if (h === N) return;
    const k = R.current;
    if (k) {
      for (const S of k.nodes) {
        const W = ln(S.nodeType);
        if (N.has(W) && !h.has(W)) {
          let A = S.parentId;
          for (; A; ) {
            const oe = k.getNode(A);
            if (!oe) break;
            if (N.has(ln(oe.nodeType))) {
              k.seedAt(S.id, oe.x, oe.y);
              break;
            }
            A = oe.parentId;
          }
        }
      }
      k.reheat(0.5), _(!0), ae.current = !1;
    }
    te.current = N;
  }, [N]);
  const G = u.useRef(f);
  u.useEffect(() => {
    if (G.current === f) return;
    const k = R.current;
    k && (k.reheat(0.3), _(!0)), G.current = f;
  }, [f]);
  const fe = u.useCallback((h, k) => {
    be((S) => {
      var A;
      const W = { ...S, [h]: k };
      return (A = R.current) == null || A.setParams(W), W;
    });
  }, []), se = u.useCallback((h, k, S) => {
    var W, A;
    ie.current = h, (W = R.current) == null || W.pinNode(h, k, S), (A = R.current) == null || A.reheat(0.3), _(!0);
  }, []), re = u.useCallback((h, k) => {
    var S;
    ie.current && ((S = R.current) == null || S.pinNode(ie.current, h, k));
  }, []), ve = u.useCallback(() => {
    var h;
    ie.current && ((h = R.current) == null || h.unpinNode(ie.current), ie.current = null);
  }, []), Me = u.useCallback((h) => {
    const k = R.current, S = de.current;
    if (!k || !S || !k.getNode(h)) return;
    const A = /* @__PURE__ */ new Set([h]);
    for (const Le of k.edges)
      Le.sourceId === h && A.add(Le.targetId), Le.targetId === h && A.add(Le.sourceId);
    const oe = k.nodes.filter((Le) => A.has(Le.id)), { width: me, height: _e } = S.getBoundingClientRect();
    b(Dn(oe, me, _e, 80));
  }, []), Ne = u.useCallback(() => {
    const h = de.current;
    if (!h) return;
    const { width: k, height: S } = h.getBoundingClientRect();
    b(Dn(M, k, S));
  }, [M]), Ee = u.useCallback(() => {
    var h;
    x ? _(!1) : ((h = R.current) == null || h.reheat(0.5), _(!0));
  }, [x]), De = u.useCallback(() => {
    var h;
    (h = R.current) == null || h.reheat(1), _(!0);
  }, []), je = (h) => {
    const k = new Set(o.visibleTypes);
    k.has(h) ? k.delete(h) : k.add(h), a({ ...o, visibleTypes: k });
  }, Ye = (h) => {
    const k = new Set(o.selectedFiles);
    k.has(h) ? k.delete(h) : k.add(h), a({ ...o, selectedFiles: k });
  }, xe = () => {
    d ? m("", !1) : (m(p, !0), setTimeout(() => {
      var h;
      return (h = he.current) == null ? void 0 : h.focus();
    }, 50));
  }, $e = () => r({ ...l, files: !l.files }), Ie = () => r({ ...l, types: !l.types }), He = u.useCallback((h, k, S) => {
    Ae({ x: k, y: S, nodeId: h });
  }, []), We = u.useCallback(() => Ae(null), []), Ke = u.useMemo(() => {
    var k;
    if (!Ce || !s) return [];
    const h = (k = R.current) == null ? void 0 : k.getNode(Ce.nodeId);
    return h ? [{
      label: "Show in Tree",
      onClick: () => s(h.name, ln(h.nodeType))
    }] : [];
  }, [Ce, s]), dn = (h) => {
    ne(h);
    const k = R.current, S = de.current;
    if (!k || !S) return;
    const W = k.getNode(h);
    if (!W) return;
    const { width: A, height: oe } = S.getBoundingClientRect();
    b({
      scale: P.scale,
      x: A / 2 - W.x * P.scale,
      y: oe / 2 - W.y * P.scale
    });
  }, Ve = J >= 0 && J < M.length ? M[J].id : null;
  u.useEffect(() => {
    var A;
    if (!T) return;
    const { name: h, defType: k } = T, S = to(k), W = R.current;
    if (W) {
      const oe = W.nodes.find((me) => me.name === h && me.nodeType === S);
      oe && (ue.current = { nodeId: oe.id }, x || ((A = R.current) == null || A.reheat(0.1), _(!0)));
    }
    $();
  }, [T]), u.useEffect(() => {
    const h = (S) => {
      S.key === "Shift" && V(!0);
    }, k = (S) => {
      S.key === "Shift" && V(!1);
    };
    return window.addEventListener("keydown", h), window.addEventListener("keyup", k), () => {
      window.removeEventListener("keydown", h), window.removeEventListener("keyup", k);
    };
  }, []), u.useEffect(() => {
    const h = (k) => {
      var S;
      if (!(k.target instanceof HTMLInputElement || k.target instanceof HTMLTextAreaElement))
        switch (k.key) {
          case "Tab": {
            k.preventDefault();
            const W = M.length;
            if (W === 0) return;
            k.shiftKey ? Be((A) => A > 0 ? A - 1 : W - 1) : Be((A) => A < W - 1 ? A + 1 : 0);
            break;
          }
          case "Enter": {
            k.preventDefault(), Ve && ne(Ve);
            break;
          }
          case "Escape": {
            if (k.preventDefault(), Se) {
              L(!1);
              break;
            }
            if (d) {
              xe();
              break;
            }
            if (ye) {
              ne(null);
              break;
            }
            break;
          }
          case "ArrowLeft":
          case "ArrowRight":
          case "ArrowUp":
          case "ArrowDown": {
            k.preventDefault();
            const W = 30, A = k.key === "ArrowLeft" ? W : k.key === "ArrowRight" ? -W : 0, oe = k.key === "ArrowUp" ? W : k.key === "ArrowDown" ? -W : 0;
            b((me) => ({ ...me, x: me.x + A, y: me.y + oe }));
            break;
          }
          case "+":
          case "=": {
            k.preventDefault(), b((W) => {
              var A, oe;
              return Kn(W, (((A = de.current) == null ? void 0 : A.clientWidth) ?? 400) / 2, (((oe = de.current) == null ? void 0 : oe.clientHeight) ?? 400) / 2, 1.15);
            });
            break;
          }
          case "-":
          case "_": {
            k.preventDefault(), b((W) => {
              var A, oe;
              return Kn(W, (((A = de.current) == null ? void 0 : A.clientWidth) ?? 400) / 2, (((oe = de.current) == null ? void 0 : oe.clientHeight) ?? 400) / 2, 0.85);
            });
            break;
          }
          case "f":
          case "F": {
            k.preventDefault(), Ne();
            break;
          }
          case "/": {
            k.preventDefault(), d ? (S = he.current) == null || S.focus() : (m(p, !0), setTimeout(() => {
              var W;
              return (W = he.current) == null ? void 0 : W.focus();
            }, 50));
            break;
          }
          case " ": {
            k.preventDefault(), Ee();
            break;
          }
          case "?": {
            k.preventDefault(), L((W) => !W);
            break;
          }
        }
    };
    return window.addEventListener("keydown", h), () => window.removeEventListener("keydown", h);
  }, [M, Ve, ye, d, p, m, Se, Ne, Ee]);
  const tn = e.errors || [], { shownFileErrors: Nn, hiddenFileErrors: wt } = u.useMemo(() => {
    if (f.size === 0) return { shownFileErrors: tn, hiddenFileErrors: [] };
    const h = [], k = [];
    for (const S of tn)
      f.has(S.file) ? h.push(S) : k.push(S);
    return { shownFileErrors: h, hiddenFileErrors: k };
  }, [tn, f]), vt = Q.length > 0, Nt = tn.length > 0, xt = f.size === 0, zn = M.length, Gn = v.length;
  return /* @__PURE__ */ i("div", { className: "graph-view", ref: de, children: [
    /* @__PURE__ */ i("div", { className: "graph-canvas-area", children: [
      /* @__PURE__ */ n(
        Ls,
        {
          nodes: M,
          edges: v,
          viewport: P,
          onViewportChange: b,
          onNodeDragStart: se,
          onNodeDragMove: re,
          onNodeDragEnd: ve,
          onDoubleClickNode: Me,
          onHoverNode: Fe,
          onSelectNode: ne,
          onNodeContextMenu: He,
          highlightedNodes: vn,
          highlightedEdges: H,
          hoveredNodeId: pe,
          selectedNodeId: ye,
          focusedNodeId: Ve,
          searchMatchIds: en,
          running: x,
          showForceFields: Z,
          forceParams: U,
          activeSection: we,
          activeChargeType: c,
          activeGravityType: j,
          nodeSummaries: ke
        }
      ),
      /* @__PURE__ */ n(
        oo,
        {
          hoveredNodeId: pe,
          simRef: R,
          visibleEdges: v,
          visibleIds: Y,
          viewport: P,
          shiftHeld: Te,
          duplicateGroups: O.duplicateGroups
        }
      )
    ] }),
    /* @__PURE__ */ i("div", { className: "graph-overlay", children: [
      /* @__PURE__ */ i("div", { className: "canvas-header", children: [
        vt && /* @__PURE__ */ i(gn, { children: [
          /* @__PURE__ */ i("div", { className: `header-files-section${l.files ? " section-pinned" : ""}`, children: [
            /* @__PURE__ */ n("div", { className: "header-files-row", children: Q.map((h) => {
              const k = h.split("/").pop() || h, S = f.has(h), W = w.has(`file:${h}`), A = [
                "header-file-tag",
                xt ? "all-included" : S ? "selected" : "",
                W ? "recently-changed" : ""
              ].filter(Boolean).join(" ");
              return /* @__PURE__ */ i("button", { className: A, onClick: () => Ye(h), title: h, children: [
                /* @__PURE__ */ n("span", { className: "header-file-icon", children: "📄" }),
                /* @__PURE__ */ n("span", { className: "header-file-name", children: k })
              ] }, h);
            }) }),
            /* @__PURE__ */ n(
              Fn,
              {
                pinned: l.files,
                onClick: $e,
                flashing: y.has("files"),
                label: "Files"
              }
            )
          ] }),
          /* @__PURE__ */ n("div", { className: "header-divider" })
        ] }),
        /* @__PURE__ */ i("div", { className: `header-types-section${l.types ? " section-pinned" : ""}`, children: [
          /* @__PURE__ */ n("div", { className: "header-types-row", children: yn.map((h) => {
            const k = N.has(h.type), S = w.has(`type:${h.type}`), W = [
              "header-type-tag",
              k ? "active" : "",
              `header-type-${h.type}`,
              S ? "recently-changed" : ""
            ].filter(Boolean).join(" ");
            return /* @__PURE__ */ i(
              "button",
              {
                className: W,
                onClick: () => je(h.type),
                title: k ? `Hide ${h.label.toLowerCase()}` : `Show ${h.label.toLowerCase()}`,
                children: [
                  /* @__PURE__ */ n("span", { className: "header-type-icon", children: h.icon }),
                  /* @__PURE__ */ n("span", { className: "header-type-label", children: h.label })
                ]
              },
              h.type
            );
          }) }),
          /* @__PURE__ */ n(
            Fn,
            {
              pinned: l.types,
              onClick: Ie,
              flashing: y.has("types"),
              label: "Types"
            }
          )
        ] }),
        /* @__PURE__ */ n("div", { className: "header-divider" }),
        /* @__PURE__ */ n("div", { className: "header-controls-section", children: /* @__PURE__ */ i("div", { className: `header-search ${d ? "active" : ""}`, children: [
          /* @__PURE__ */ n("button", { className: "header-search-toggle", onClick: xe, title: "Search nodes (/)", children: /* @__PURE__ */ n(rt, { size: 14 }) }),
          d && /* @__PURE__ */ n(
            "input",
            {
              ref: he,
              className: "header-search-input",
              type: "text",
              placeholder: "Search nodes...",
              value: p,
              onChange: (h) => m(h.target.value, !0),
              onKeyDown: (h) => {
                h.key === "Escape" && xe();
              }
            }
          ),
          nn > 0 && /* @__PURE__ */ i("span", { className: "header-search-badge", title: `${nn} match${nn !== 1 ? "es" : ""} hidden by filters`, children: [
            "+",
            nn
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ i("div", { className: "graph-toolbar", children: [
        /* @__PURE__ */ i("span", { className: "graph-toolbar-count", children: [
          zn,
          " node",
          zn !== 1 ? "s" : "",
          ", ",
          Gn,
          " edge",
          Gn !== 1 ? "s" : "",
          x && /* @__PURE__ */ i("span", { className: "graph-toolbar-fps", title: "Simulation frames per second", children: [
            "  ·  ",
            Oe,
            " fps"
          ] })
        ] }),
        ye && s && (() => {
          var k;
          const h = (k = R.current) == null ? void 0 : k.getNode(ye);
          return h ? /* @__PURE__ */ n(
            "button",
            {
              className: "graph-toolbar-btn",
              onClick: () => s(h.name, ln(h.nodeType)),
              title: "Show in Tree view",
              children: "Show in Tree"
            }
          ) : null;
        })(),
        /* @__PURE__ */ n("button", { className: "graph-toolbar-btn", onClick: Ne, title: "Fit to view (F)", children: "Fit" }),
        /* @__PURE__ */ n(
          "button",
          {
            className: `graph-toolbar-btn ${x ? "active" : ""}`,
            onClick: Ee,
            title: x ? "Pause simulation (Space)" : "Resume simulation (Space)",
            children: x ? "Pause" : "Play"
          }
        )
      ] }),
      en && en.size > 0 && d && /* @__PURE__ */ n("div", { className: "graph-search-results", children: M.filter((h) => en.has(h.id)).map((h) => /* @__PURE__ */ i(
        "button",
        {
          className: "graph-search-result",
          onClick: () => dn(h.id),
          children: [
            /* @__PURE__ */ n("span", { className: "graph-search-result-type", children: h.nodeType }),
            /* @__PURE__ */ n("span", { className: "graph-search-result-name", children: h.name })
          ]
        },
        h.id
      )) }),
      Nt && /* @__PURE__ */ n(ao, { shownFileErrors: Nn, hiddenFileErrors: wt })
    ] }),
    /* @__PURE__ */ n(
      js,
      {
        params: U,
        onParamChange: fe,
        running: x,
        onToggleRunning: Ee,
        onReheat: De,
        showForceFields: Z,
        onToggleForceFields: () => X((h) => !h),
        onActiveSection: E,
        onActiveChargeType: B,
        onActiveGravityType: K
      }
    ),
    Ce && Ke.length > 0 && /* @__PURE__ */ n(
      eo,
      {
        x: Ce.x,
        y: Ce.y,
        items: Ke,
        onClose: We
      }
    ),
    Se && /* @__PURE__ */ i("div", { className: "graph-shortcuts-panel", children: [
      /* @__PURE__ */ i("div", { className: "graph-shortcuts-title", children: [
        "Keyboard Shortcuts",
        /* @__PURE__ */ n("button", { className: "graph-shortcuts-close", onClick: () => L(!1), children: "×" })
      ] }),
      /* @__PURE__ */ i("div", { className: "graph-shortcuts-list", children: [
        /* @__PURE__ */ n(ze, { keys: "Tab / Shift+Tab", desc: "Cycle focus" }),
        /* @__PURE__ */ n(ze, { keys: "Enter", desc: "Select focused node" }),
        /* @__PURE__ */ n(ze, { keys: "Escape", desc: "Deselect / close" }),
        /* @__PURE__ */ n(ze, { keys: "Arrow keys", desc: "Pan viewport" }),
        /* @__PURE__ */ n(ze, { keys: "+ / -", desc: "Zoom in / out" }),
        /* @__PURE__ */ n(ze, { keys: "F", desc: "Fit to view" }),
        /* @__PURE__ */ n(ze, { keys: "/", desc: "Open search" }),
        /* @__PURE__ */ n(ze, { keys: "Space", desc: "Toggle simulation" }),
        /* @__PURE__ */ n(ze, { keys: "Shift + hover", desc: "Upstream deps" }),
        /* @__PURE__ */ n(ze, { keys: "?", desc: "This panel" })
      ] })
    ] })
  ] });
}
function oo({ hoveredNodeId: e, simRef: t, visibleEdges: s, visibleIds: o, viewport: a, shiftHeld: l, duplicateGroups: r }) {
  var U, be;
  if (!e) return null;
  const p = t.current;
  if (!p) return null;
  const d = p.getNode(e);
  if (!d) return null;
  const m = d.parentId ? (U = p.getNode(d.parentId)) == null ? void 0 : U.name : void 0, T = yn.find((R) => R.type === ln(d.nodeType)), $ = (be = d.sourceFile) == null ? void 0 : be.split("/").pop();
  let y = 0, I = 0;
  for (const R of s)
    R.edgeType !== "containment" && (R.sourceId === e && y++, R.targetId === e && I++);
  const N = r.get(d.definitionKey), f = N ? Array.from(N).filter((R) => o.has(R)) : [d.id], P = f.length, b = P > 1 ? f.indexOf(d.id) + 1 : 0, [x, _] = qe(a, d.x, d.y);
  return /* @__PURE__ */ i("div", { className: "graph-hover-tooltip", style: { left: x, top: _ }, children: [
    /* @__PURE__ */ i("div", { className: "tooltip-identity", children: [
      T && /* @__PURE__ */ n("span", { className: "tooltip-type-icon", children: T.icon }),
      /* @__PURE__ */ n("span", { className: "tooltip-name", children: d.name })
    ] }),
    m && /* @__PURE__ */ n("div", { className: "tooltip-parent", children: m }),
    $ && /* @__PURE__ */ n("div", { className: "tooltip-file", children: $ }),
    P > 1 && /* @__PURE__ */ i("div", { className: "tooltip-duplicates", title: "This definition is registered on multiple workers. Hovering any copy highlights all copies.", children: [
      "copy ",
      b,
      " of ",
      P
    ] }),
    (y > 0 || I > 0) && /* @__PURE__ */ i("div", { className: "tooltip-connections", children: [
      y > 0 && /* @__PURE__ */ i("span", { className: "tooltip-conn-out", children: [
        "→",
        y
      ] }),
      I > 0 && /* @__PURE__ */ i("span", { className: "tooltip-conn-in", children: [
        "←",
        I
      ] })
    ] }),
    /* @__PURE__ */ n("div", { className: "tooltip-direction", children: l ? "dependents" : "dependencies" })
  ] });
}
function ze({ keys: e, desc: t }) {
  return /* @__PURE__ */ i("div", { className: "graph-shortcut-row", children: [
    /* @__PURE__ */ n("kbd", { className: "graph-shortcut-key", children: e }),
    /* @__PURE__ */ n("span", { className: "graph-shortcut-desc", children: t })
  ] });
}
function ao({ shownFileErrors: e, hiddenFileErrors: t }) {
  const [s, o] = u.useState(!0), a = e.length + t.length;
  return /* @__PURE__ */ i("div", { className: "graph-errors-header", children: [
    /* @__PURE__ */ i("div", { className: "graph-errors-bar", onClick: () => o(!s), children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: s ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "graph-errors-icon", children: C.error.icon }),
      /* @__PURE__ */ i("span", { className: "graph-errors-title", children: [
        a,
        " ",
        a === 1 ? "error" : "errors"
      ] })
    ] }),
    s && /* @__PURE__ */ i("div", { className: "graph-errors-body", children: [
      e.map((l, r) => /* @__PURE__ */ i("div", { className: "graph-error-item", children: [
        /* @__PURE__ */ n("span", { className: "graph-error-file", children: l.file.split("/").pop() }),
        /* @__PURE__ */ n("pre", { className: "graph-error-msg", children: l.stderr || l.error })
      ] }, `s${r}`)),
      t.length > 0 && /* @__PURE__ */ i("div", { className: "graph-error-hidden-label", children: [
        t.length,
        " error",
        t.length !== 1 ? "s" : "",
        " in hidden files"
      ] })
    ] })
  ] });
}
function co(e, t, s, o) {
  switch (o.kind) {
    case "manual":
      return lo(e, t, s);
    case "focus":
      return ro(e, s, o.target);
  }
}
function lo(e, t, s) {
  const o = lt(e);
  return s.files || (o.selectedFiles = new Set(t.selectedFiles)), s.types || (o.visibleTypes = new Set(t.visibleTypes)), {
    filter: In(o, e) ? e : o,
    overriddenPins: /* @__PURE__ */ new Set()
  };
}
function ro(e, t, s) {
  const o = lt(e), a = /* @__PURE__ */ new Set();
  return o.visibleTypes.has(s.defType) || (o.visibleTypes.add(s.defType), t.types && a.add("types")), s.sourceFile && e.selectedFiles.size > 0 && !e.selectedFiles.has(s.sourceFile) && (o.selectedFiles.add(s.sourceFile), t.files && a.add("files")), {
    filter: In(o, e) ? e : o,
    overriddenPins: a
  };
}
const An = "temporal-architect-visualizer-state";
let cn = null, tt = !1;
function kt() {
  if (tt) return cn;
  tt = !0;
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
function io() {
  const e = kt();
  if (e) {
    const t = e.getState();
    if (t && typeof t == "object") {
      const o = t[An];
      if (o && typeof o == "object")
        return o;
    }
    return {};
  }
  try {
    const t = localStorage.getItem(An);
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}
function uo(e) {
  const t = kt();
  if (t) {
    const s = t.getState(), o = s && typeof s == "object" ? { ...s } : {};
    o[An] = e, t.setState(o);
    return;
  }
  try {
    localStorage.setItem(An, JSON.stringify(e));
  } catch {
  }
}
const Xe = u.createContext({
  workflows: /* @__PURE__ */ new Map(),
  activities: /* @__PURE__ */ new Map(),
  workers: /* @__PURE__ */ new Map(),
  nexusServices: /* @__PURE__ */ new Map(),
  namespaces: /* @__PURE__ */ new Map()
}), wn = u.createContext({
  signals: /* @__PURE__ */ new Map(),
  queries: /* @__PURE__ */ new Map(),
  updates: /* @__PURE__ */ new Map()
}), bt = u.createContext({
  callers: /* @__PURE__ */ new Map(),
  workerOf: /* @__PURE__ */ new Map(),
  namespaceOf: /* @__PURE__ */ new Map(),
  navigateTo: () => {
  }
}), po = yn.filter((e) => e.defaultOn).map((e) => e.type);
function st(e) {
  return {
    selectedFiles: e.focusedFile ? /* @__PURE__ */ new Set([e.focusedFile]) : /* @__PURE__ */ new Set(),
    visibleTypes: new Set(po)
  };
}
const ot = { files: !1, types: !1 };
function at(e, t) {
  return e ? {
    selectedFiles: new Set(e.selectedFiles),
    visibleTypes: new Set(e.visibleTypes)
  } : t;
}
function ct(e) {
  return {
    selectedFiles: Array.from(e.selectedFiles),
    visibleTypes: Array.from(e.visibleTypes)
  };
}
function go({ ast: e, parserGraph: t, onOpenFile: s, onRefocus: o, className: a, style: l }) {
  const r = t ?? Mt, p = u.useMemo(() => io(), []), [d, m] = u.useState("tree"), [T, $] = u.useState(
    () => at(p.treeFilter, st(e))
  ), [y, I] = u.useState(
    () => at(p.graphFilter, st(e))
  ), [N, f] = u.useState(() => p.treePins ?? ot), [P, b] = u.useState(() => p.graphPins ?? ot), [x, _] = u.useState(p.searchQuery ?? ""), [U, be] = u.useState(!1), [R, ie] = u.useState(null), [ae, de] = u.useState(/* @__PURE__ */ new Set()), [ue, Oe] = u.useState(/* @__PURE__ */ new Set());
  u.useEffect(() => {
    uo({
      treeFilter: ct(T),
      graphFilter: ct(y),
      treePins: N,
      graphPins: P,
      searchQuery: x
    });
  }, [T, y, N, P, x]), u.useEffect(() => {
    const V = /* @__PURE__ */ new Set();
    for (const X of e.definitions)
      X.sourceFile && V.add(X.sourceFile);
    const Z = (X) => {
      const we = new Set([...X.selectedFiles].filter((E) => V.has(E)));
      return we.size === X.selectedFiles.size ? X : { ...X, selectedFiles: we };
    };
    $(Z), I(Z);
  }, [e.definitions]), u.useEffect(() => {
    N.files || e.focusedFile && $((V) => {
      const Z = /* @__PURE__ */ new Set([e.focusedFile]);
      return V.selectedFiles.size === 1 && V.selectedFiles.has(e.focusedFile) ? V : { ...V, selectedFiles: Z };
    });
  }, [e.focusedFile, N.files]);
  const ce = u.useMemo(() => {
    const V = /* @__PURE__ */ new Map(), Z = /* @__PURE__ */ new Map(), X = /* @__PURE__ */ new Map(), we = /* @__PURE__ */ new Map(), E = /* @__PURE__ */ new Map();
    for (const c of e.definitions)
      c.type === "workflowDef" ? V.set(c.name, c) : c.type === "activityDef" ? Z.set(c.name, c) : c.type === "workerDef" ? X.set(c.name, c) : c.type === "nexusServiceDef" ? we.set(c.name, c) : c.type === "namespaceDef" && E.set(c.name, c);
    return { workflows: V, activities: Z, workers: X, nexusServices: we, namespaces: E };
  }, [e]), ge = u.useCallback((V, Z) => {
    if (V === d && Z.kind === "manual") return;
    const X = V === "tree" ? T : y, we = V === "tree" ? y : T, E = V === "tree" ? N : P, { filter: c, overriddenPins: B } = co(X, we, E, Z);
    V === "tree" ? (c !== X && $(c), de(B)) : (c !== X && I(c), Oe(B)), Z.kind === "focus" && ie({ name: Z.target.name, defType: Z.target.defType }), m(V);
  }, [d, T, y, N, P]), pe = u.useCallback((V, Z) => {
    const X = e.definitions.find((we) => we.name === V && we.type === Z);
    ge("graph", {
      kind: "focus",
      target: { name: V, defType: Z, sourceFile: X == null ? void 0 : X.sourceFile }
    });
  }, [e.definitions, ge]), Fe = u.useCallback((V, Z) => {
    const X = e.definitions.find((we) => we.name === V && we.type === Z);
    ge("tree", {
      kind: "focus",
      target: { name: V, defType: Z, sourceFile: X == null ? void 0 : X.sourceFile }
    });
  }, [e.definitions, ge]), ye = u.useCallback(() => ie(null), []), ne = u.useCallback((V, Z) => {
    _(V), be(Z);
  }, []), J = u.useCallback(() => {
    de((V) => V.size === 0 ? V : /* @__PURE__ */ new Set());
  }, []), Be = u.useCallback(() => {
    Oe((V) => V.size === 0 ? V : /* @__PURE__ */ new Set());
  }, []);
  u.useEffect(() => {
    T.selectedFiles.size === 1 && s && s(T.selectedFiles.values().next().value);
  }, [T.selectedFiles, s]);
  const Te = a ? `view-shell ${a}` : "view-shell";
  return /* @__PURE__ */ n(Xe.Provider, { value: ce, children: /* @__PURE__ */ i("div", { className: Te, style: l, onClick: o, children: [
    /* @__PURE__ */ i("div", { className: "tab-bar", children: [
      /* @__PURE__ */ n(
        "button",
        {
          className: `tab-bar-btn ${d === "tree" ? "active" : ""}`,
          onClick: () => ge("tree", { kind: "manual" }),
          children: "Tree"
        }
      ),
      /* @__PURE__ */ n(
        "button",
        {
          className: `tab-bar-btn ${d === "graph" ? "active" : ""}`,
          onClick: () => ge("graph", { kind: "manual" }),
          children: "Graph"
        }
      )
    ] }),
    d === "tree" ? /* @__PURE__ */ n(
      fs,
      {
        ast: e,
        onShowInGraph: pe,
        filter: T,
        onFilterChange: $,
        pins: N,
        onPinsChange: f,
        searchQuery: x,
        searchActive: U,
        onSearchChange: ne,
        pendingFocus: R,
        onFocusConsumed: ye,
        overriddenPins: ae,
        onOverriddenPinsConsumed: J
      }
    ) : /* @__PURE__ */ n(
      so,
      {
        ast: e,
        parserGraph: r,
        onShowInTree: Fe,
        filter: y,
        onFilterChange: I,
        pins: P,
        onPinsChange: b,
        searchQuery: x,
        searchActive: U,
        onSearchChange: ne,
        pendingFocus: R,
        onFocusConsumed: ye,
        overriddenPins: ue,
        onOverriddenPinsConsumed: Be
      }
    )
  ] }) });
}
export {
  Mt as EMPTY_PARSER_GRAPH,
  go as Visualizer
};
//# sourceMappingURL=lib.js.map
