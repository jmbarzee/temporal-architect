var St = Object.defineProperty;
var Mt = (e, t, s) => t in e ? St(e, t, { enumerable: !0, configurable: !0, writable: !0, value: s }) : e[t] = s;
var ln = (e, t, s) => Mt(e, typeof t != "symbol" ? t + "" : t, s);
import { jsxs as d, jsx as n, Fragment as yn } from "react/jsx-runtime";
import u from "react";
function An(e, t) {
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
  return /* @__PURE__ */ d(
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
  return /* @__PURE__ */ d(
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
const L = {
  workflow: { icon: "⚙⚙", label: "Workflow", cssVarPrefix: "workflow", SvgIcon: Ct },
  activity: { icon: "⚙", label: "Activity", cssVarPrefix: "activity", SvgIcon: $t },
  worker: { icon: "□", label: "Worker", cssVarPrefix: "worker" },
  namespace: { icon: "⧉", label: "Namespace", cssVarPrefix: "namespace" },
  nexusService: { icon: "★", label: "Nexus Service", cssVarPrefix: "nexus-service" },
  nexusOperation: { icon: "☆", label: "Nexus Operation", cssVarPrefix: "nexus-operation" },
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
}, kn = [
  { type: "namespaceDef", icon: L.namespace.icon, label: "Namespaces", defaultOn: !1 },
  { type: "workerDef", icon: L.worker.icon, label: "Workers", defaultOn: !0 },
  { type: "nexusServiceDef", icon: L.nexusService.icon, label: "Nexus Services", defaultOn: !1 },
  // Synthetic def type — operations live inside nexusServiceDef in the AST,
  // but render as their own L3 nodes (parented to their service).
  { type: "nexusOperationDef", icon: L.nexusOperation.icon, label: "Nexus Operations", defaultOn: !1 },
  { type: "workflowDef", icon: L.workflow.icon, label: "Workflows", defaultOn: !0 },
  { type: "activityDef", icon: L.activity.icon, label: "Activities", defaultOn: !1 }
], Un = new Map(kn.map((e, t) => [e.type, t])), Et = {
  signalDecl: { icon: L.signal.icon, keyword: "signal", cssClass: "declaration-signal" },
  queryDecl: { icon: L.query.icon, keyword: "query", cssClass: "declaration-query" },
  updateDecl: { icon: L.update.icon, keyword: "update", cssClass: "declaration-update" }
}, Dt = {
  complete: L.closeComplete,
  fail: L.closeFail,
  continue_as_new: L.closeContinueAsNew
}, ze = {
  timer: L.timer,
  signal: L.signal,
  update: L.update,
  activity: L.activity,
  workflow: L.workflow,
  nexus: L.nexusCall,
  ident: L.conditionSet
}, Ft = {
  workflow: L.workflow,
  activity: L.activity,
  service: L.nexusService
};
function bn({ kind: e, size: t }) {
  const s = L[e];
  return s.SvgIcon ? /* @__PURE__ */ n(s.SvgIcon, { size: t }) : /* @__PURE__ */ n(yn, { children: s.icon });
}
function le(e = !1, t = !0) {
  const [s, o] = u.useState(e);
  return [s, () => {
    t && o((i) => !i);
  }];
}
function Wn({ decl: e }) {
  const t = e.body && e.body.length > 0, [s, o] = le(!1, t), { icon: a, keyword: i, cssClass: r } = Et[e.type];
  let h = `${e.name}(${e.params})`;
  return "returnType" in e && e.returnType && (h += ` → ${e.returnType}`), /* @__PURE__ */ d("div", { className: `declaration ${r} ${s ? "expanded" : ""}`, children: [
    /* @__PURE__ */ d("div", { className: "declaration-header", onClick: o, children: [
      t && /* @__PURE__ */ n("span", { className: "block-toggle", children: s ? "▼" : "▶" }),
      !t && /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "declaration-icon", children: a }),
      /* @__PURE__ */ n("span", { className: "declaration-keyword", children: i }),
      /* @__PURE__ */ n("span", { className: "declaration-name", children: h })
    ] }),
    s && t && /* @__PURE__ */ n("div", { className: "declaration-body", children: e.body.map((p) => /* @__PURE__ */ n(Oe, { statement: p }, `${p.line}:${p.column}`)) })
  ] });
}
function In({ def: e }) {
  var N, g, D, c;
  const [t, s] = le(), [o, a] = le(), [i, r] = le(), [h, p] = le(), y = e.state && (e.state.conditions && e.state.conditions.length > 0 || e.state.rawStmts && e.state.rawStmts.length > 0), M = e.signals && e.signals.length > 0, C = e.queries && e.queries.length > 0, w = e.updates && e.updates.length > 0, A = (((g = (N = e.state) == null ? void 0 : N.conditions) == null ? void 0 : g.length) || 0) + (((c = (D = e.state) == null ? void 0 : D.rawStmts) == null ? void 0 : c.length) || 0);
  return /* @__PURE__ */ d(yn, { children: [
    y && /* @__PURE__ */ d("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ d("div", { className: "declarations-header", onClick: s, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-condition", children: L.conditionSet.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "state" }),
        /* @__PURE__ */ d("span", { className: "declarations-count", children: [
          "(",
          A,
          ")"
        ] })
      ] }),
      t && /* @__PURE__ */ d("div", { className: "block-declarations", children: [
        (e.state.conditions || []).map((f) => /* @__PURE__ */ n("div", { className: "declaration declaration-condition", children: /* @__PURE__ */ d("div", { className: "declaration-header", children: [
          /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ n("span", { className: "declaration-icon", children: L.conditionSet.icon }),
          /* @__PURE__ */ n("span", { className: "declaration-keyword", children: "condition" }),
          /* @__PURE__ */ n("span", { className: "declaration-name", children: f.name })
        ] }) }, `${f.line}:${f.column}`)),
        (e.state.rawStmts || []).map((f) => /* @__PURE__ */ n("div", { className: "declaration declaration-raw-state", children: /* @__PURE__ */ d("div", { className: "declaration-header", children: [
          /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ n("span", { className: "declaration-icon", children: L.raw.icon }),
          /* @__PURE__ */ n("span", { className: "declaration-name", children: f.text })
        ] }) }, `${f.line}:${f.column}`))
      ] })
    ] }),
    M && /* @__PURE__ */ d("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ d("div", { className: "declarations-header", onClick: a, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: o ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-signal", children: L.signal.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "signals" }),
        /* @__PURE__ */ d("span", { className: "declarations-count", children: [
          "(",
          e.signals.length,
          ")"
        ] })
      ] }),
      o && /* @__PURE__ */ n("div", { className: "block-declarations", children: e.signals.map((f) => /* @__PURE__ */ n(Wn, { decl: f }, `${f.line}:${f.column}`)) })
    ] }),
    C && /* @__PURE__ */ d("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ d("div", { className: "declarations-header", onClick: r, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: i ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-query", children: L.query.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "queries" }),
        /* @__PURE__ */ d("span", { className: "declarations-count", children: [
          "(",
          e.queries.length,
          ")"
        ] })
      ] }),
      i && /* @__PURE__ */ n("div", { className: "block-declarations", children: e.queries.map((f) => /* @__PURE__ */ n(Wn, { decl: f }, `${f.line}:${f.column}`)) })
    ] }),
    w && /* @__PURE__ */ d("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ d("div", { className: "declarations-header", onClick: p, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: h ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-update", children: L.update.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "updates" }),
        /* @__PURE__ */ d("span", { className: "declarations-count", children: [
          "(",
          e.updates.length,
          ")"
        ] })
      ] }),
      h && /* @__PURE__ */ n("div", { className: "block-declarations", children: e.updates.map((f) => /* @__PURE__ */ n(Wn, { decl: f }, `${f.line}:${f.column}`)) })
    ] }),
    /* @__PURE__ */ n("div", { children: (e.body || []).map((f) => /* @__PURE__ */ n(Oe, { statement: f }, `${f.line}:${f.column}`)) })
  ] });
}
function Vn({ def: e }) {
  const [t, s] = le(), o = `${e.name}(${e.params})${e.returnType ? ` → ${e.returnType}` : ""}`, a = u.useMemo(() => {
    const i = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), h = /* @__PURE__ */ new Map();
    for (const p of e.signals || []) i.set(p.name, p);
    for (const p of e.queries || []) r.set(p.name, p);
    for (const p of e.updates || []) h.set(p.name, p);
    return { signals: i, queries: r, updates: h };
  }, [e]);
  return /* @__PURE__ */ n(vn.Provider, { value: a, children: /* @__PURE__ */ d("div", { className: `block block-workflow-call ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(bn, { kind: "workflow" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "workflow" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: o })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: /* @__PURE__ */ n(In, { def: e }) })
  ] }) });
}
function Kn({ body: e }) {
  const [t, s] = le(!0);
  return /* @__PURE__ */ d("div", { className: `block block-sync-body ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "handler" })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: e.map((o) => /* @__PURE__ */ n(Oe, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function Ze({ defName: e, defType: t, showDefinition: s }) {
  const o = u.useContext(bt), a = [];
  if (s && a.push({ label: "Def", targets: [s] }), e && t) {
    const r = `${t}:${e}`, h = o.callers.get(r);
    if (h && h.length > 0 && a.push({ label: "Callers", targets: h.map((p) => ({ name: p.defName, type: p.defType })) }), t === "workflowDef" || t === "activityDef" || t === "nexusServiceDef") {
      const p = o.workerOf.get(r);
      p && p.length > 0 && a.push({ label: "Worker", targets: p.map((y) => ({ name: y, type: "workerDef" })) });
    }
    if (t === "workerDef") {
      const p = o.namespaceOf.get(r);
      p && p.length > 0 && a.push({ label: "NS", targets: p.map((y) => ({ name: y, type: "namespaceDef" })) });
    }
  }
  const i = e && t && o.showInGraph ? () => o.showInGraph(e, t) : null;
  return a.length === 0 && !i ? null : /* @__PURE__ */ d("div", { className: "ctx-nav-buttons", onClick: (r) => r.stopPropagation(), children: [
    a.map((r) => /* @__PURE__ */ n(At, { action: r, onNavigate: o.navigateTo }, r.label)),
    i && /* @__PURE__ */ n("button", { className: "ctx-nav-btn", onClick: i, title: "Show in Graph view", children: "Graph" })
  ] });
}
function At({ action: e, onNavigate: t }) {
  const [s, o] = u.useState(!1), a = u.useRef(null);
  return u.useEffect(() => {
    if (!s) return;
    const r = (h) => {
      a.current && !a.current.contains(h.target) && o(!1);
    };
    return document.addEventListener("mousedown", r), () => document.removeEventListener("mousedown", r);
  }, [s]), u.useEffect(() => {
    if (!s) return;
    const r = (h) => {
      h.key === "Escape" && (h.stopPropagation(), o(!1));
    };
    return document.addEventListener("keydown", r), () => document.removeEventListener("keydown", r);
  }, [s]), /* @__PURE__ */ d("div", { className: "ctx-nav-btn-wrapper", ref: a, children: [
    /* @__PURE__ */ d(
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
  const s = u.useContext(Ge).activities.get(e.name), o = !!s, [a, i] = le(!1, o), r = Rt(e);
  return /* @__PURE__ */ d("div", { className: `block block-activity ${a ? "expanded" : "collapsed"} ${o ? "" : "block-unresolved"}`, children: [
    o && /* @__PURE__ */ n(Ze, { showDefinition: { name: e.name, type: "activityDef" } }),
    /* @__PURE__ */ d("div", { className: "block-header", onClick: i, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: a ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(bn, { kind: "activity" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "activity" }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: r, children: r }),
      !o && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    a && o && /* @__PURE__ */ n("div", { className: "block-body", children: (s.body || []).length > 0 ? (s.body || []).map((h) => /* @__PURE__ */ n(Oe, { statement: h }, `${h.line}:${h.column}`)) : /* @__PURE__ */ n("div", { className: "block-empty-body", children: "No implementation defined" }) })
  ] });
}
function Lt({ stmt: e }) {
  const s = u.useContext(Ge).workflows.get(e.name), o = !!s, [a, i] = le(!1, o), r = e.mode === "detach" ? "detach " : "", h = Ot(e);
  return /* @__PURE__ */ d("div", { className: `block block-workflow-call block-mode-${e.mode} ${a ? "expanded" : "collapsed"} ${o ? "" : "block-unresolved"}`, children: [
    o && /* @__PURE__ */ n(Ze, { showDefinition: { name: e.name, type: "workflowDef" } }),
    /* @__PURE__ */ d("div", { className: "block-header", onClick: i, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: a ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(bn, { kind: "workflow" }) }),
      /* @__PURE__ */ d("span", { className: "block-keyword", children: [
        r,
        "workflow"
      ] }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: h, children: h }),
      !o && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    a && o && /* @__PURE__ */ n("div", { className: "block-body", children: /* @__PURE__ */ n(Wt, { def: s, children: /* @__PURE__ */ n(In, { def: s }) }) })
  ] });
}
function Wt({ def: e, children: t }) {
  const s = u.useMemo(() => {
    const o = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map();
    for (const r of e.signals || []) o.set(r.name, r);
    for (const r of e.queries || []) a.set(r.name, r);
    for (const r of e.updates || []) i.set(r.name, r);
    return { signals: o, queries: a, updates: i };
  }, [e]);
  return /* @__PURE__ */ n(vn.Provider, { value: s, children: t });
}
function Pt({ stmt: e }) {
  var w;
  const t = u.useContext(Ge), s = t.nexusServices.get(e.service), o = (w = s == null ? void 0 : s.operations) == null ? void 0 : w.find((A) => A.name === e.operation), a = !!o, i = (o == null ? void 0 : o.opType) === "async" && o.workflowName ? t.workflows.get(o.workflowName) : void 0, r = (o == null ? void 0 : o.opType) === "async" ? !!i : !!(o != null && o.body && o.body.length > 0), [h, p] = le(!1, r), y = e.detach ? "detach " : "", M = `${e.endpoint} ${e.service}.${e.operation}(${e.args})`, C = e.result ? ` → ${e.result}` : "";
  return /* @__PURE__ */ d("div", { className: `block block-nexus-call ${e.detach ? "block-mode-detach" : ""} ${h ? "expanded" : "collapsed"} ${!a && e.service ? "block-unresolved" : ""}`, children: [
    s && /* @__PURE__ */ n(Ze, { showDefinition: { name: e.service, type: "nexusServiceDef" } }),
    /* @__PURE__ */ d("div", { className: "block-header", onClick: p, children: [
      r ? /* @__PURE__ */ n("span", { className: "block-toggle", children: h ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-call", children: L.nexusCall.icon }),
      /* @__PURE__ */ d("span", { className: "block-keyword", children: [
        y,
        "nexus"
      ] }),
      /* @__PURE__ */ d("span", { className: "block-signature", title: `${M}${C}`, children: [
        M,
        C
      ] }),
      !a && e.service && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    h && r && /* @__PURE__ */ n("div", { className: "block-body", children: (o == null ? void 0 : o.opType) === "async" && i ? /* @__PURE__ */ n(Vn, { def: i }) : o != null && o.body ? /* @__PURE__ */ n(Kn, { body: o.body }) : /* @__PURE__ */ n("div", { className: "block-empty-body", children: "No implementation defined" }) })
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
      return { icon: ze.timer.icon, keyword: "timer", signature: `(${e.timer.duration || ""})`, isUnresolved: !1 };
    case "signal": {
      const a = e.signal.name || "", i = e.signal.params ? ` → ${e.signal.params}` : "", r = s.signals.get(a);
      return { icon: ze.signal.icon, keyword: "signal", signature: `${a}${i}`, expandableDef: r, isUnresolved: !r };
    }
    case "update": {
      const a = e.update.name || "", i = e.update.params ? ` → ${e.update.params}` : "", r = s.updates.get(a);
      return { icon: ze.update.icon, keyword: "update", signature: `${a}${i}`, expandableDef: r, isUnresolved: !r };
    }
    case "activity": {
      const a = `${e.activity.name || ""}(${e.activity.args || ""})`, i = e.activity.result ? ` → ${e.activity.result}` : "", r = t.activities.get(e.activity.name || "");
      return { icon: ze.activity.icon, keyword: "activity", signature: `${a}${i}`, expandableDef: r, isUnresolved: !r };
    }
    case "workflow": {
      const a = e.workflow.mode === "detach" ? "detach " : "", i = `${e.workflow.name || ""}(${e.workflow.args || ""})`, r = e.workflow.result ? ` → ${e.workflow.result}` : "", h = t.workflows.get(e.workflow.name || "");
      return { icon: ze.workflow.icon, keyword: `${a}workflow`, signature: `${i}${r}`, expandableDef: h, isUnresolved: !h };
    }
    case "nexus": {
      const a = e.nexus.detach ? "detach " : "", i = `${e.nexus.endpoint || ""} ${e.nexus.service || ""}.${e.nexus.operation || ""}(${e.nexus.args || ""})`, r = e.nexus.result ? ` → ${e.nexus.result}` : "", h = t.nexusServices.get(e.nexus.service || ""), p = (o = h == null ? void 0 : h.operations) == null ? void 0 : o.find((M) => M.name === (e.nexus.operation || "")), y = !!(e.nexus.service && !h);
      if ((p == null ? void 0 : p.opType) === "async" && p.workflowName) {
        const M = t.workflows.get(p.workflowName);
        if (M)
          return { icon: ze.nexus.icon, keyword: `${a}nexus`, signature: `${i}${r}`, nexusAsyncWorkflow: M, isUnresolved: y };
      } else if ((p == null ? void 0 : p.opType) === "sync" && p.body)
        return { icon: ze.nexus.icon, keyword: `${a}nexus`, signature: `${i}${r}`, nexusSyncBody: p.body, isUnresolved: y };
      return { icon: ze.nexus.icon, keyword: `${a}nexus`, signature: `${i}${r}`, isUnresolved: y };
    }
    case "ident": {
      const a = e.ident.name || "", i = e.ident.result ? ` → ${e.ident.result}` : "";
      return { icon: ze.ident.icon, keyword: "", signature: `${a}${i}`, isUnresolved: !1 };
    }
    default:
      return { icon: "?", keyword: "", signature: "", isUnresolved: !1 };
  }
}
function Bt(e, t, s) {
  var i, r;
  const o = it(e.target, t, s), a = e.target.kind === "workflow" && ((i = e.target.workflow) == null ? void 0 : i.mode) === "detach" || e.target.kind === "nexus" && ((r = e.target.nexus) == null ? void 0 : r.detach);
  return {
    ...o,
    // Activity/workflow/nexus use SVG icons at block level, not text icons
    icon: e.target.kind === "activity" || e.target.kind === "workflow" || e.target.kind === "nexus" ? "" : o.icon,
    keyword: o.keyword ? `await ${o.keyword}` : "await",
    blockClass: `block-await-stmt block-await-stmt-${e.target.kind}${a ? " block-mode-detach" : ""}`
  };
}
function _t(e, t, s) {
  var a, i;
  if (e.awaitAll != null)
    return { contentClass: "tagged-await-all", icon: L.awaitAll.icon, keyword: "await all", signature: `${((i = (a = e.awaitAll) == null ? void 0 : a.body) == null ? void 0 : i.length) || 0} branch(es)`, isUnresolved: !1 };
  const o = it(e.target, t, s);
  return {
    icon: o.icon,
    keyword: o.keyword,
    signature: o.signature,
    isUnresolved: o.isUnresolved,
    contentClass: `tagged-${e.target.kind}`
  };
}
function Yt({ stmt: e }) {
  const t = u.useContext(Ge), s = u.useContext(vn), { icon: o, keyword: a, signature: i, blockClass: r, expandableDef: h, nexusAsyncWorkflow: p, nexusSyncBody: y, isUnresolved: M } = Bt(e, t, s), C = !!(h || p || y), [w, A] = le(!1, C);
  return /* @__PURE__ */ d("div", { className: `block ${r} ${w ? "expanded" : "collapsed"} ${M ? "block-unresolved" : ""}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: A, children: [
      C ? /* @__PURE__ */ n("span", { className: "block-toggle", children: w ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: o }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: a }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: i }),
      M && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    w && C && /* @__PURE__ */ n("div", { className: "block-body", children: p ? /* @__PURE__ */ n(Vn, { def: p }) : y ? /* @__PURE__ */ n(Kn, { body: y }) : h && (h.body || []).length > 0 ? (h.body || []).map((N) => /* @__PURE__ */ n(Oe, { statement: N }, `${N.line}:${N.column}`)) : /* @__PURE__ */ n("div", { className: "block-empty-body", children: "No implementation defined" }) })
  ] });
}
function dt({ stmt: e }) {
  const [t, s] = le(!0);
  return /* @__PURE__ */ d("div", { className: `block block-await-all ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: L.awaitAll.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "await all" }),
      /* @__PURE__ */ d("span", { className: "block-signature", children: [
        (e.body || []).length,
        " branch(es)"
      ] })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: (e.body || []).map((o) => /* @__PURE__ */ n(Oe, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function Vt({ stmt: e }) {
  const [t, s] = le(!0), o = e.cases.length === 1 ? "case" : "cases";
  return /* @__PURE__ */ d("div", { className: `block block-await-one ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "await one" }),
      /* @__PURE__ */ d("span", { className: "block-signature", children: [
        "first of ",
        e.cases.length,
        " ",
        o
      ] })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: e.cases.map((a) => /* @__PURE__ */ n(Kt, { awaitCase: a }, `${a.line}:${a.column}`)) })
  ] });
}
function Kt({ awaitCase: e }) {
  const t = u.useContext(Ge), s = u.useContext(vn), o = e.body && e.body.length > 0, a = o || !!e.awaitAll, [i, r] = le(!1, a), { contentClass: h, icon: p, keyword: y, signature: M, isUnresolved: C } = _t(e, t, s);
  return /* @__PURE__ */ d("div", { className: `tagged-composite ${i ? "expanded" : ""} ${C ? "tagged-unresolved" : ""}`, children: [
    /* @__PURE__ */ n("div", { className: "tagged-tag", children: /* @__PURE__ */ n("span", { className: "tagged-tag-label", children: "option" }) }),
    /* @__PURE__ */ d("div", { className: `tagged-content ${h} ${a ? "expandable" : ""}`, onClick: r, children: [
      a && /* @__PURE__ */ n("span", { className: "block-toggle", children: i ? "▼" : "▶" }),
      !a && /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "tagged-icon", children: p }),
      /* @__PURE__ */ n("span", { className: "tagged-kind", children: y }),
      /* @__PURE__ */ n("span", { className: "tagged-name", children: M }),
      C && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    i && /* @__PURE__ */ d("div", { className: "tagged-body", children: [
      e.awaitAll && /* @__PURE__ */ n(dt, { stmt: e.awaitAll }),
      o && e.body.map((w) => /* @__PURE__ */ n(Oe, { statement: w }, `${w.line}:${w.column}`))
    ] })
  ] });
}
function qt({ stmt: e }) {
  const [t, s] = le(!0);
  return /* @__PURE__ */ d("div", { className: `block block-switch ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "switch" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: e.expr })
    ] }),
    t && /* @__PURE__ */ d("div", { className: "block-body", children: [
      e.cases.map((o) => /* @__PURE__ */ n(Ht, { switchCase: o }, `${o.line}:${o.column}`)),
      e.default && e.default.length > 0 && /* @__PURE__ */ d("div", { className: "block block-switch-default", children: [
        /* @__PURE__ */ d("div", { className: "block-header", children: [
          /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
          /* @__PURE__ */ n("span", { className: "block-keyword", children: "default" })
        ] }),
        /* @__PURE__ */ n("div", { className: "block-body", children: e.default.map((o) => /* @__PURE__ */ n(Oe, { statement: o }, `${o.line}:${o.column}`)) })
      ] })
    ] })
  ] });
}
function Ht({ switchCase: e }) {
  const [t, s] = le(!0);
  return /* @__PURE__ */ d("div", { className: `block block-switch-case ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "case" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: e.value })
    ] }),
    t && e.body && e.body.length > 0 && /* @__PURE__ */ n("div", { className: "block-body", children: e.body.map((o) => /* @__PURE__ */ n(Oe, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function zt({ stmt: e }) {
  const [t, s] = le(!0), o = e.elseBody && e.elseBody.length > 0;
  return /* @__PURE__ */ d("div", { className: `block block-if ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "if" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: e.condition })
    ] }),
    t && /* @__PURE__ */ d("div", { className: "block-body", children: [
      /* @__PURE__ */ d("div", { className: "block-branch", children: [
        /* @__PURE__ */ n("div", { className: "branch-label", children: "then:" }),
        (e.body || []).map((a) => /* @__PURE__ */ n(Oe, { statement: a }, `${a.line}:${a.column}`))
      ] }),
      o && /* @__PURE__ */ d("div", { className: "block-branch", children: [
        /* @__PURE__ */ n("div", { className: "branch-label", children: "else:" }),
        (e.elseBody || []).map((a) => /* @__PURE__ */ n(Oe, { statement: a }, `${a.line}:${a.column}`))
      ] })
    ] })
  ] });
}
function Gt({ stmt: e }) {
  const [t, s] = le(!0);
  let o = "";
  return e.variant === "iteration" ? o = `${e.variable} in ${e.iterable}` : e.variant === "conditional" ? o = e.condition || "" : o = "∞", /* @__PURE__ */ d("div", { className: `block block-for ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: L.forLoop.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "for" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: o })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: (e.body || []).map((a) => /* @__PURE__ */ n(Oe, { statement: a }, `${a.line}:${a.column}`)) })
  ] });
}
function Ut({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-return collapsed", children: /* @__PURE__ */ d("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: L.return.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "return" }),
    e.value && /* @__PURE__ */ n("span", { className: "block-signature", children: e.value })
  ] }) });
}
function Xt({ stmt: e }) {
  const t = (Dt[e.reason] ?? L.closeComplete).icon, s = e.reason === "continue_as_new" ? "close-continue-as-new" : e.reason === "fail" ? "close-failed" : "";
  return /* @__PURE__ */ n("div", { className: `block block-close ${s} collapsed`, children: /* @__PURE__ */ d("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: t }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "close" }),
    /* @__PURE__ */ d("span", { className: "block-signature", children: [
      /* @__PURE__ */ n("span", { className: "close-reason", children: e.reason }),
      e.args && /* @__PURE__ */ d("span", { children: [
        "(",
        e.args,
        ")"
      ] })
    ] })
  ] }) });
}
function jt({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-raw collapsed", children: /* @__PURE__ */ d("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: L.raw.icon }),
    /* @__PURE__ */ n("span", { className: "block-code", children: e.text })
  ] }) });
}
function Jt({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-comment collapsed", children: /* @__PURE__ */ d("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: L.raw.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "comment" }),
    /* @__PURE__ */ n("span", { className: "block-signature", title: e.text, children: e.text })
  ] }) });
}
function Xn({ keyword: e, className: t }) {
  return /* @__PURE__ */ n("div", { className: `block ${t} collapsed`, children: /* @__PURE__ */ d("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: L.breakContinue.icon }),
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
  return /* @__PURE__ */ n("div", { className: "block block-promise collapsed", children: /* @__PURE__ */ d("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: L.promise.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "promise" }),
    /* @__PURE__ */ d("span", { className: "block-signature", children: [
      e.name,
      " ← ",
      t
    ] })
  ] }) });
}
function Qt({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-set collapsed", children: /* @__PURE__ */ d("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: L.conditionSet.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "set" }),
    /* @__PURE__ */ n("span", { className: "block-signature", children: e.name })
  ] }) });
}
function es({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-unset collapsed", children: /* @__PURE__ */ d("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: L.conditionUnset.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "unset" }),
    /* @__PURE__ */ n("span", { className: "block-signature", children: e.name })
  ] }) });
}
function Oe({ statement: e }) {
  switch (e.type) {
    case "activityCall":
      return /* @__PURE__ */ n(It, { stmt: e });
    case "workflowCall":
      return /* @__PURE__ */ n(Lt, { stmt: e });
    case "nexusCall":
      return /* @__PURE__ */ n(Pt, { stmt: e });
    case "await":
      return /* @__PURE__ */ n(Yt, { stmt: e });
    case "awaitAll":
      return /* @__PURE__ */ n(dt, { stmt: e });
    case "awaitOne":
      return /* @__PURE__ */ n(Vt, { stmt: e });
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
      return /* @__PURE__ */ n(Xn, { keyword: "break", className: "block-break" });
    case "continue":
      return /* @__PURE__ */ n(Xn, { keyword: "continue", className: "block-continue" });
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
  const o = is(e), [a, i] = le(), r = t ?? a, h = s ?? i, p = u.useMemo(() => {
    const y = /* @__PURE__ */ new Map(), M = /* @__PURE__ */ new Map(), C = /* @__PURE__ */ new Map();
    for (const w of e.signals || []) y.set(w.name, w);
    for (const w of e.queries || []) M.set(w.name, w);
    for (const w of e.updates || []) C.set(w.name, w);
    return { signals: y, queries: M, updates: C };
  }, [e]);
  return /* @__PURE__ */ n(vn.Provider, { value: p, children: /* @__PURE__ */ d("div", { className: `block block-workflow ${r ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "workflowDef" }),
    /* @__PURE__ */ d("div", { className: "block-header", onClick: h, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: r ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(bn, { kind: "workflow" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "workflow" }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: o, children: o }),
      !r && (() => {
        const y = wn(e);
        return y ? /* @__PURE__ */ n("span", { className: "block-summary", children: y }) : null;
      })()
    ] }),
    r && /* @__PURE__ */ n("div", { className: "block-body", children: /* @__PURE__ */ n(In, { def: e }) })
  ] }) });
}
function ss({ def: e, controlledExpanded: t, onToggle: s }) {
  const [o, a] = le(), i = t ?? o, r = s ?? a, h = us(e);
  return /* @__PURE__ */ d("div", { className: `block block-activity-def ${i ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "activityDef" }),
    /* @__PURE__ */ d("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: i ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(bn, { kind: "activity" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "activity" }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: h, children: h }),
      !i && (() => {
        const p = wn(e);
        return p ? /* @__PURE__ */ n("span", { className: "block-summary", children: p }) : null;
      })()
    ] }),
    i && /* @__PURE__ */ n("div", { className: "block-body", children: (e.body || []).map((p) => /* @__PURE__ */ n(Oe, { statement: p }, `${p.line}:${p.column}`)) })
  ] });
}
function os({ def: e, controlledExpanded: t, onToggle: s }) {
  var p, y, M, C, w, A;
  const [o, a] = le(), i = t ?? o, r = s ?? a, h = (((p = e.workflows) == null ? void 0 : p.length) || 0) + (((y = e.activities) == null ? void 0 : y.length) || 0) + (((M = e.services) == null ? void 0 : M.length) || 0);
  return /* @__PURE__ */ d("div", { className: `block block-worker-def ${i ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "workerDef" }),
    /* @__PURE__ */ d("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: i ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: L.worker.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "worker" }),
      /* @__PURE__ */ d("span", { className: "block-signature", title: `${e.name} (${h} types)`, children: [
        e.name,
        " (",
        h,
        " types)"
      ] }),
      !i && (() => {
        const N = wn(e);
        return N ? /* @__PURE__ */ n("span", { className: "block-summary", children: N }) : null;
      })()
    ] }),
    i && /* @__PURE__ */ d("div", { className: "block-body", children: [
      ((C = e.workflows) == null ? void 0 : C.length) > 0 && /* @__PURE__ */ n(un, { label: "workflows", refs: e.workflows, refType: "workflow" }),
      ((w = e.activities) == null ? void 0 : w.length) > 0 && /* @__PURE__ */ n(un, { label: "activities", refs: e.activities, refType: "activity" }),
      ((A = e.services) == null ? void 0 : A.length) > 0 && /* @__PURE__ */ n(un, { label: "nexus services", refs: e.services, refType: "service" })
    ] })
  ] });
}
function un({ label: e, refs: t, refType: s }) {
  return /* @__PURE__ */ d("div", { className: "worker-ref-section", children: [
    /* @__PURE__ */ n("div", { className: "worker-ref-label", children: e }),
    t.map((o) => /* @__PURE__ */ n(as, { ref_: o, refType: s }, `${o.line}:${o.column}`))
  ] });
}
function as({ ref_: e, refType: t }) {
  const s = u.useContext(Ge), o = t === "workflow" ? s.workflows.get(e.name) : t === "activity" ? s.activities.get(e.name) : void 0, a = t === "service" ? s.nexusServices.get(e.name) : void 0, i = !!(o || a), [r, h] = le(!1, i), p = Ft[t].icon;
  return /* @__PURE__ */ d("div", { className: `worker-ref worker-ref-${t} ${r ? "expanded" : "collapsed"} ${i ? "" : "worker-ref-unresolved"}`, children: [
    /* @__PURE__ */ d("div", { className: "worker-ref-header", onClick: h, children: [
      i ? /* @__PURE__ */ n("span", { className: "block-toggle", children: r ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: `block-icon ${t === "service" ? "block-icon-nexus-service" : ""}`, children: p }),
      /* @__PURE__ */ n("span", { className: "worker-ref-name", children: e.name }),
      !i && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    r && i && /* @__PURE__ */ n("div", { className: "block-body", children: (o == null ? void 0 : o.type) === "workflowDef" ? /* @__PURE__ */ n(In, { def: o }) : o ? (o.body || []).map((y) => /* @__PURE__ */ n(Oe, { statement: y }, `${y.line}:${y.column}`)) : a ? (a.operations || []).map((y) => /* @__PURE__ */ n(ut, { operation: y }, `${y.line}:${y.column}`)) : null })
  ] });
}
function cs({ def: e, controlledExpanded: t, onToggle: s }) {
  var p, y, M, C;
  const [o, a] = le(), i = t ?? o, r = s ?? a, h = (((p = e.workers) == null ? void 0 : p.length) || 0) + (((y = e.endpoints) == null ? void 0 : y.length) || 0);
  return /* @__PURE__ */ d("div", { className: `block block-namespace-def ${i ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "namespaceDef" }),
    /* @__PURE__ */ d("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: i ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-namespace", children: L.namespace.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "namespace" }),
      /* @__PURE__ */ d("span", { className: "block-signature", title: `${e.name} (${h} entries)`, children: [
        e.name,
        " (",
        h,
        " entries)"
      ] }),
      !i && (() => {
        const w = wn(e);
        return w ? /* @__PURE__ */ n("span", { className: "block-summary", children: w }) : null;
      })()
    ] }),
    i && /* @__PURE__ */ d("div", { className: "block-body", children: [
      ((M = e.workers) == null ? void 0 : M.length) > 0 && /* @__PURE__ */ d("div", { className: "namespace-entry-section", children: [
        /* @__PURE__ */ n("div", { className: "namespace-entry-label", children: "workers" }),
        e.workers.map((w) => /* @__PURE__ */ n(ls, { entry: w }, `${w.line}:${w.column}`))
      ] }),
      ((C = e.endpoints) == null ? void 0 : C.length) > 0 && /* @__PURE__ */ d("div", { className: "namespace-entry-section", children: [
        /* @__PURE__ */ n("div", { className: "namespace-entry-label", children: "nexus endpoints" }),
        e.endpoints.map((w) => /* @__PURE__ */ n(rs, { entry: w }, `${w.line}:${w.column}`))
      ] })
    ] })
  ] });
}
function ls({ entry: e }) {
  var r, h, p;
  const s = u.useContext(Ge).workers.get(e.workerName), o = !!s, [a, i] = le(!1, o);
  return /* @__PURE__ */ d("div", { className: `namespace-entry namespace-entry-worker ${a ? "expanded" : "collapsed"} ${o ? "" : "namespace-entry-unresolved"}`, children: [
    /* @__PURE__ */ d("div", { className: "namespace-entry-header", onClick: i, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: a ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: L.worker.icon }),
      /* @__PURE__ */ n("span", { className: "namespace-entry-name", children: e.workerName }),
      !o && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    a && o && s && /* @__PURE__ */ d("div", { className: "block-body", children: [
      ((r = s.workflows) == null ? void 0 : r.length) > 0 && /* @__PURE__ */ n(un, { label: "workflows", refs: s.workflows, refType: "workflow" }),
      ((h = s.activities) == null ? void 0 : h.length) > 0 && /* @__PURE__ */ n(un, { label: "activities", refs: s.activities, refType: "activity" }),
      ((p = s.services) == null ? void 0 : p.length) > 0 && /* @__PURE__ */ n(un, { label: "nexus services", refs: s.services, refType: "service" })
    ] })
  ] });
}
function rs({ entry: e }) {
  return /* @__PURE__ */ n("div", { className: "namespace-entry namespace-entry-endpoint collapsed", children: /* @__PURE__ */ d("div", { className: "namespace-entry-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-endpoint", children: L.nexusService.icon }),
    /* @__PURE__ */ n("span", { className: "namespace-entry-name", children: e.endpointName })
  ] }) });
}
function wn(e) {
  var s, o, a, i, r, h, p, y, M, C;
  const t = [];
  if (e.type === "workflowDef") {
    const w = ((s = e.body) == null ? void 0 : s.length) || 0, A = (e.body || []).filter(
      (g) => g.type === "activityCall" || g.type === "workflowCall" || g.type === "nexusCall"
    ).length, N = (((o = e.signals) == null ? void 0 : o.length) || 0) + (((a = e.queries) == null ? void 0 : a.length) || 0) + (((i = e.updates) == null ? void 0 : i.length) || 0);
    w > 0 && t.push(`${w} step${w !== 1 ? "s" : ""}`), A > 0 && t.push(`${A} call${A !== 1 ? "s" : ""}`), N > 0 && t.push(`${N} handler${N !== 1 ? "s" : ""}`);
  } else if (e.type === "activityDef") {
    const w = ((r = e.body) == null ? void 0 : r.length) || 0;
    w > 0 && t.push(`${w} step${w !== 1 ? "s" : ""}`);
  } else if (e.type === "workerDef") {
    const w = ((h = e.workflows) == null ? void 0 : h.length) || 0, A = ((p = e.activities) == null ? void 0 : p.length) || 0, N = ((y = e.services) == null ? void 0 : y.length) || 0;
    w > 0 && t.push(`${w} workflow${w !== 1 ? "s" : ""}`), A > 0 && t.push(`${A} activit${A !== 1 ? "ies" : "y"}`), N > 0 && t.push(`${N} service${N !== 1 ? "s" : ""}`);
  } else if (e.type === "namespaceDef") {
    const w = ((M = e.workers) == null ? void 0 : M.length) || 0, A = ((C = e.endpoints) == null ? void 0 : C.length) || 0;
    w > 0 && t.push(`${w} worker${w !== 1 ? "s" : ""}`), A > 0 && t.push(`${A} endpoint${A !== 1 ? "s" : ""}`);
  } else if (e.type === "nexusServiceDef") {
    const w = (e.operations || []).filter((N) => N.opType === "async").length, A = (e.operations || []).filter((N) => N.opType === "sync").length;
    w > 0 && t.push(`${w} async`), A > 0 && t.push(`${A} sync`);
  }
  return t.join(" · ");
}
function is(e) {
  let t = `${e.name}(${e.params})`;
  return e.returnType && (t += ` → ${e.returnType}`), t;
}
function ds({ def: e, controlledExpanded: t, onToggle: s }) {
  var p;
  const [o, a] = le(), i = t ?? o, r = s ?? a, h = ((p = e.operations) == null ? void 0 : p.length) || 0;
  return /* @__PURE__ */ d("div", { className: `block block-nexus-service-def ${i ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "nexusServiceDef" }),
    /* @__PURE__ */ d("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: i ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-service", children: L.nexusService.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "service" }),
      /* @__PURE__ */ d("span", { className: "block-signature", title: `${e.name} (${h} operation${h !== 1 ? "s" : ""})`, children: [
        e.name,
        " (",
        h,
        " operation",
        h !== 1 ? "s" : "",
        ")"
      ] }),
      !i && (() => {
        const y = wn(e);
        return y ? /* @__PURE__ */ n("span", { className: "block-summary", children: y }) : null;
      })()
    ] }),
    i && /* @__PURE__ */ n("div", { className: "block-body", children: (e.operations || []).map((y) => /* @__PURE__ */ n(ut, { operation: y }, `${y.line}:${y.column}`)) })
  ] });
}
function ut({ operation: e }) {
  const t = u.useContext(Ge), s = e.opType === "async" && e.workflowName ? t.workflows.get(e.workflowName) : void 0, o = e.opType === "async" ? !!s : !!(e.body && e.body.length > 0), a = e.opType === "async" && e.workflowName && !s, [i, r] = le(!1, o);
  let h;
  if (e.opType === "async" && s)
    h = /* @__PURE__ */ d(yn, { children: [
      e.name,
      /* @__PURE__ */ d("span", { className: "nexus-operation-grayed-sig", children: [
        "(",
        s.params,
        ")",
        s.returnType ? ` → ${s.returnType}` : ""
      ] })
    ] });
  else if (e.opType === "sync") {
    const p = e.params || "", y = e.returnType ? ` → ${e.returnType}` : "";
    h = `${e.name}(${p})${y}`;
  } else
    h = e.name;
  return /* @__PURE__ */ d("div", { className: `block block-nexus-operation nexus-operation-${e.opType} ${i ? "expanded" : "collapsed"} ${a ? "block-unresolved" : ""}`, children: [
    /* @__PURE__ */ d("div", { className: "block-header", onClick: r, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: i ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-operation", children: L.nexusOperation.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: e.opType }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: h }),
      a && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    i && o && /* @__PURE__ */ n("div", { className: "block-body", children: e.opType === "async" && s ? /* @__PURE__ */ n(Vn, { def: s }) : e.body ? /* @__PURE__ */ n(Kn, { body: e.body }) : null })
  ] });
}
function us(e) {
  let t = `${e.name}(${e.params})`;
  return e.returnType && (t += ` → ${e.returnType}`), t;
}
function Dn({ pinned: e, onClick: t, flashing: s, label: o }) {
  const a = e ? `${o} filter pinned — click to unpin` : `${o} filter unpinned — click to pin and stop syncing with the other view`, i = [
    "pin-toggle",
    e ? "pinned" : "",
    s ? "flashing" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ n(
    "button",
    {
      className: i,
      onClick: t,
      title: a,
      "aria-label": a,
      "aria-pressed": e,
      children: e ? /* @__PURE__ */ n(ps, {}) : /* @__PURE__ */ n(hs, {})
    }
  );
}
function ps() {
  return /* @__PURE__ */ d("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ n("rect", { x: "3", y: "7", width: "10", height: "7", rx: "1.5" }),
    /* @__PURE__ */ n("path", { d: "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" })
  ] });
}
function hs() {
  return /* @__PURE__ */ d("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
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
  onPinsChange: i,
  searchQuery: r,
  searchActive: h,
  onSearchChange: p,
  pendingFocus: y,
  onFocusConsumed: M,
  overriddenPins: C,
  onOverriddenPinsConsumed: w
}) {
  const A = u.useRef(null), [N, g] = u.useState(-1), D = u.useRef([]), [c, f] = u.useState(/* @__PURE__ */ new Set()), [b, I] = u.useState(null), [E, Y] = u.useState(!1), he = u.useRef(e);
  u.useEffect(() => {
    if (he.current !== e && he.current !== null) {
      Y(!0);
      const k = setTimeout(() => Y(!1), 600);
      return () => clearTimeout(k);
    }
    he.current = e;
  }, [e]);
  const j = u.useRef(s), [Se, ge] = u.useState(/* @__PURE__ */ new Set());
  u.useEffect(() => {
    const k = j.current;
    if (An(k, s)) return;
    const S = /* @__PURE__ */ new Set();
    for (const T of s.selectedFiles) k.selectedFiles.has(T) || S.add(`file:${T}`);
    for (const T of s.visibleTypes) k.visibleTypes.has(T) || S.add(`type:${T}`);
    if (j.current = s, S.size > 0) {
      ge(S);
      const T = setTimeout(() => ge(/* @__PURE__ */ new Set()), 450);
      return () => clearTimeout(T);
    }
  }, [s]), u.useEffect(() => {
    if (C.size === 0) return;
    const k = setTimeout(w, 600);
    return () => clearTimeout(k);
  }, [C, w]);
  const Ce = u.useMemo(() => {
    const k = /* @__PURE__ */ new Map(), S = /* @__PURE__ */ new Map(), T = /* @__PURE__ */ new Map();
    function _(F, x) {
      const G = k.get(F) || [];
      G.some((re) => re.defName === x.defName && re.defType === x.defType) || (G.push(x), k.set(F, G));
    }
    function z(F, x, G) {
      const re = F.get(x) || [];
      re.includes(G) || (re.push(G), F.set(x, re));
    }
    function J(F, x) {
      F.activity && _(`activityDef:${F.activity.name}`, { defName: x.name, defType: x.type }), F.workflow && _(`workflowDef:${F.workflow.name}`, { defName: x.name, defType: x.type }), F.nexus && _(`nexusServiceDef:${F.nexus.service}`, { defName: x.name, defType: x.type });
    }
    function K(F, x) {
      for (const G of F)
        switch (G.type) {
          case "activityCall":
            _(`activityDef:${G.name}`, { defName: x.name, defType: x.type });
            break;
          case "workflowCall":
            _(`workflowDef:${G.name}`, { defName: x.name, defType: x.type });
            break;
          case "nexusCall":
            _(`nexusServiceDef:${G.service}`, { defName: x.name, defType: x.type });
            break;
          case "await":
            J(G.target, x);
            break;
          case "promise":
            J(G.target, x);
            break;
          case "awaitAll":
            K(G.body || [], x);
            break;
          case "awaitOne":
            for (const re of G.cases || [])
              re.target && J(re.target, x), re.awaitAll && K(re.awaitAll.body || [], x), K(re.body || [], x);
            break;
          case "if":
            K(G.body || [], x), K(G.elseBody || [], x);
            break;
          case "for":
            K(G.body || [], x);
            break;
          case "switch":
            for (const re of G.cases || []) K(re.body || [], x);
            G.default && K(G.default, x);
            break;
        }
    }
    for (const F of e.definitions) {
      if (F.type === "workflowDef") {
        K(F.body || [], F);
        for (const x of F.signals || []) K(x.body || [], F);
        for (const x of F.queries || []) K(x.body || [], F);
        for (const x of F.updates || []) K(x.body || [], F);
      } else if (F.type === "activityDef")
        K(F.body || [], F);
      else if (F.type === "nexusServiceDef")
        for (const x of F.operations || [])
          x.opType === "async" && x.workflowName && _(`workflowDef:${x.workflowName}`, { defName: F.name, defType: F.type }), x.body && K(x.body, F);
      if (F.type === "workerDef") {
        for (const x of F.workflows || []) z(S, `workflowDef:${x.name}`, F.name);
        for (const x of F.activities || []) z(S, `activityDef:${x.name}`, F.name);
        for (const x of F.services || []) z(S, `nexusServiceDef:${x.name}`, F.name);
      }
      if (F.type === "namespaceDef")
        for (const x of F.workers || []) z(T, `workerDef:${x.workerName}`, F.name);
    }
    return { callers: k, workerOf: S, namespaceOf: T };
  }, [e]), se = u.useMemo(() => {
    const k = /* @__PURE__ */ new Set();
    for (const S of e.definitions)
      S.sourceFile && k.add(S.sourceFile);
    return Array.from(k).sort();
  }, [e]), Ne = u.useCallback((k) => {
    const S = new Set(s.selectedFiles);
    S.has(k) ? S.delete(k) : S.add(k), o({ ...s, selectedFiles: S });
  }, [s, o]), we = u.useCallback(() => {
    h ? p("", !1) : (p(r, !0), setTimeout(() => {
      var k;
      return (k = A.current) == null ? void 0 : k.focus();
    }, 50));
  }, [h, r, p]), Q = u.useCallback((k) => {
    const S = new Set(s.visibleTypes);
    S.has(k) ? S.delete(k) : S.add(k), o({ ...s, visibleTypes: S });
  }, [s, o]), Ee = u.useCallback(() => {
    i({ ...a, files: !a.files });
  }, [a, i]), Ie = u.useCallback(() => {
    i({ ...a, types: !a.types });
  }, [a, i]), te = u.useMemo(() => {
    const k = e.definitions.filter((S) => !(!s.visibleTypes.has(S.type) || s.selectedFiles.size > 0 && S.sourceFile && !s.selectedFiles.has(S.sourceFile)));
    return k.sort((S, T) => {
      const _ = Un.get(S.type) ?? 999, z = Un.get(T.type) ?? 999;
      return _ - z;
    }), k;
  }, [e.definitions, s]), { matchSet: B, matchIndices: V, hiddenMatchByType: ee, hiddenMatchByFile: ye } = u.useMemo(() => {
    if (!r)
      return {
        matchSet: null,
        matchIndices: [],
        hiddenMatchByType: /* @__PURE__ */ new Map(),
        hiddenMatchByFile: /* @__PURE__ */ new Map()
      };
    const k = r.toLowerCase(), S = /* @__PURE__ */ new Set(), T = [];
    te.forEach((J, K) => {
      J.name.toLowerCase().includes(k) && (S.add(pe(J)), T.push(K));
    });
    const _ = /* @__PURE__ */ new Map(), z = /* @__PURE__ */ new Map();
    for (const J of e.definitions) {
      if (!J.name.toLowerCase().includes(k)) continue;
      const K = s.visibleTypes.has(J.type), F = s.selectedFiles.size === 0 || (J.sourceFile ? s.selectedFiles.has(J.sourceFile) : !0);
      K ? !F && J.sourceFile && z.set(J.sourceFile, (z.get(J.sourceFile) ?? 0) + 1) : _.set(J.type, (_.get(J.type) ?? 0) + 1);
    }
    return { matchSet: S, matchIndices: T, hiddenMatchByType: _, hiddenMatchByFile: z };
  }, [r, te, e.definitions, s]), R = e.errors || [], { shownFileErrors: l, hiddenFileErrors: U } = u.useMemo(() => {
    if (s.selectedFiles.size === 0)
      return { shownFileErrors: R, hiddenFileErrors: [] };
    const k = [], S = [];
    for (const T of R)
      s.selectedFiles.has(T.file) ? k.push(T) : S.push(T);
    return { shownFileErrors: k, hiddenFileErrors: S };
  }, [R, s.selectedFiles]), ne = se.length > 0, q = R.length > 0, xe = s.selectedFiles.size === 0;
  u.useEffect(() => {
    const k = (S) => {
      var T;
      S.target instanceof HTMLInputElement || S.target instanceof HTMLTextAreaElement || (S.key === "/" || S.ctrlKey && S.key === "f") && (S.preventDefault(), h ? (T = A.current) == null || T.focus() : (p(r, !0), setTimeout(() => {
        var _;
        return (_ = A.current) == null ? void 0 : _.focus();
      }, 50)));
    };
    return window.addEventListener("keydown", k), () => window.removeEventListener("keydown", k);
  }, [h, r, p]), u.useEffect(() => {
    D.current = D.current.slice(0, te.length);
  }, [te.length]);
  function pe(k) {
    return `${k.type}:${k.name}:${k.sourceFile ?? ""}`;
  }
  u.useEffect(() => {
    const k = new Set(e.definitions.map(pe));
    f((S) => {
      const T = new Set([...S].filter((_) => k.has(_)));
      return T.size === S.size ? S : T;
    });
  }, [e.definitions]);
  const O = u.useCallback((k) => {
    f((S) => {
      const T = new Set(S);
      return T.has(k) ? T.delete(k) : T.add(k), T;
    });
  }, []), Me = u.useCallback((k, S) => {
    const T = te.findIndex((z) => z.name === k && z.type === S);
    if (T === -1) return;
    const _ = pe(te[T]);
    f((z) => new Set(z).add(_)), g(T), setTimeout(() => {
      var z, J;
      (z = D.current[T]) == null || z.scrollIntoView({ behavior: "smooth", block: "nearest" }), (J = D.current[T]) == null || J.focus();
    }, 50), I(_), setTimeout(() => I(null), 1e3);
  }, [te]), $e = u.useMemo(() => ({
    ...Ce,
    navigateTo: Me,
    showInGraph: t
  }), [Ce, Me, t]);
  u.useEffect(() => {
    if (!y) return;
    const { name: k, defType: S } = y, T = setTimeout(() => {
      Me(k, S), M();
    }, 50);
    return () => clearTimeout(T);
  }, [y, Me, M]);
  const Qe = u.useCallback((k) => {
    var T, _, z, J, K, F;
    const S = te.length;
    if (S !== 0)
      switch (k.key) {
        case "ArrowDown": {
          k.preventDefault();
          const x = N < S - 1 ? N + 1 : N;
          g(x), (T = D.current[x]) == null || T.focus();
          break;
        }
        case "ArrowUp": {
          k.preventDefault();
          const x = N > 0 ? N - 1 : 0;
          g(x), (_ = D.current[x]) == null || _.focus();
          break;
        }
        case "ArrowRight": {
          if (k.preventDefault(), N >= 0 && N < S) {
            const x = pe(te[N]);
            c.has(x) || f((G) => new Set(G).add(x));
          }
          break;
        }
        case "ArrowLeft": {
          if (k.preventDefault(), N >= 0 && N < S) {
            const x = pe(te[N]);
            c.has(x) && f((G) => {
              const re = new Set(G);
              return re.delete(x), re;
            });
          }
          break;
        }
        case "Enter": {
          k.preventDefault(), N >= 0 && N < S && O(pe(te[N]));
          break;
        }
        case "Home": {
          k.preventDefault(), g(0), (z = D.current[0]) == null || z.focus();
          break;
        }
        case "End": {
          k.preventDefault();
          const x = S - 1;
          g(x), (J = D.current[x]) == null || J.focus();
          break;
        }
        case "n":
        case "N": {
          if (V.length === 0) break;
          k.preventDefault();
          const x = k.key === "n", G = ms(V, N, x);
          g(G), (K = D.current[G]) == null || K.scrollIntoView({ behavior: "smooth", block: "nearest" }), (F = D.current[G]) == null || F.focus();
          break;
        }
        case "Escape": {
          k.preventDefault(), h && we();
          break;
        }
      }
  }, [te, N, c, h, we, O, V]), Ke = u.useMemo(() => {
    if (!B || V.length === 0 || N < 0) return null;
    const k = te[N];
    if (!k || !B.has(pe(k))) return null;
    const S = V.indexOf(N);
    return S >= 0 ? S + 1 : null;
  }, [B, V, N, te]);
  return /* @__PURE__ */ n(bt.Provider, { value: $e, children: /* @__PURE__ */ d("div", { className: "workflow-canvas", children: [
    /* @__PURE__ */ d("div", { className: `canvas-header${E ? " refresh-flash" : ""}`, children: [
      ne && /* @__PURE__ */ d(yn, { children: [
        /* @__PURE__ */ d("div", { className: `header-files-section${a.files ? " section-pinned" : ""}`, children: [
          /* @__PURE__ */ n("div", { className: "header-files-row", children: se.map((k) => {
            const S = k.split("/").pop() || k, T = s.selectedFiles.has(k), _ = Se.has(`file:${k}`), z = ye.get(k) ?? 0, J = [
              "header-file-tag",
              xe ? "all-included" : T ? "selected" : "",
              _ ? "recently-changed" : ""
            ].filter(Boolean).join(" ");
            return /* @__PURE__ */ d(
              "button",
              {
                className: J,
                onClick: () => Ne(k),
                title: k,
                children: [
                  /* @__PURE__ */ n("span", { className: "header-file-icon", children: "📄" }),
                  /* @__PURE__ */ n("span", { className: "header-file-name", children: S }),
                  z > 0 && /* @__PURE__ */ n("span", { className: "header-hidden-badge", title: `${z} match${z !== 1 ? "es" : ""} hidden in this file`, children: z })
                ]
              },
              k
            );
          }) }),
          /* @__PURE__ */ n(
            Dn,
            {
              pinned: a.files,
              onClick: Ee,
              flashing: C.has("files"),
              label: "Files"
            }
          )
        ] }),
        /* @__PURE__ */ n("div", { className: "header-divider" })
      ] }),
      /* @__PURE__ */ d("div", { className: `header-types-section${a.types ? " section-pinned" : ""}`, children: [
        /* @__PURE__ */ n("div", { className: "header-types-row", children: kn.map((k) => {
          const S = s.visibleTypes.has(k.type), T = Se.has(`type:${k.type}`), _ = ee.get(k.type) ?? 0, z = [
            "header-type-tag",
            S ? "active" : "",
            `header-type-${k.type}`,
            T ? "recently-changed" : ""
          ].filter(Boolean).join(" ");
          return /* @__PURE__ */ d(
            "button",
            {
              className: z,
              onClick: () => Q(k.type),
              title: S ? `Hide ${k.label.toLowerCase()}` : `Show ${k.label.toLowerCase()}`,
              children: [
                /* @__PURE__ */ n("span", { className: "header-type-icon", children: k.icon }),
                /* @__PURE__ */ n("span", { className: "header-type-label", children: k.label }),
                _ > 0 && /* @__PURE__ */ n("span", { className: "header-hidden-badge", title: `${_} match${_ !== 1 ? "es" : ""} hidden by this filter`, children: _ })
              ]
            },
            k.type
          );
        }) }),
        /* @__PURE__ */ n(
          Dn,
          {
            pinned: a.types,
            onClick: Ie,
            flashing: C.has("types"),
            label: "Types"
          }
        )
      ] }),
      /* @__PURE__ */ n("div", { className: "header-divider" }),
      /* @__PURE__ */ n("div", { className: "header-controls-section", children: /* @__PURE__ */ d("div", { className: `header-search ${h ? "active" : ""}`, children: [
        /* @__PURE__ */ n(
          "button",
          {
            className: "header-search-toggle",
            onClick: we,
            title: "Search definitions",
            children: /* @__PURE__ */ n(rt, { size: 14 })
          }
        ),
        h && /* @__PURE__ */ n(
          "input",
          {
            ref: A,
            className: "header-search-input",
            type: "text",
            placeholder: "Filter by name...",
            value: r,
            onChange: (k) => p(k.target.value, !0),
            onKeyDown: (k) => {
              k.key === "Escape" && we();
            }
          }
        ),
        h && r && V.length > 0 && /* @__PURE__ */ n("span", { className: "header-search-counter", title: "Press n/N to jump between matches", children: Ke !== null ? `${Ke} of ${V.length}` : `${V.length} match${V.length !== 1 ? "es" : ""}` }),
        h && r && V.length === 0 && /* @__PURE__ */ n("span", { className: "header-search-counter empty", children: "no matches" })
      ] }) })
    ] }),
    /* @__PURE__ */ d("div", { className: "workflow-canvas-content", children: [
      q && /* @__PURE__ */ n(
        gs,
        {
          shownFileErrors: l,
          hiddenFileErrors: U
        }
      ),
      te.length === 0 && !q ? /* @__PURE__ */ d("div", { className: "no-workflows", children: [
        /* @__PURE__ */ n("p", { children: "No definitions match the current filters." }),
        /* @__PURE__ */ n("p", { className: "no-workflows-hint", children: "Try adjusting the type toggles or file filter above." })
      ] }) : te.length === 0 && q ? null : /* @__PURE__ */ n("div", { role: "tree", "aria-label": "Definition list", onKeyDown: Qe, children: te.map((k, S) => {
        const T = pe(k), _ = c.has(T), z = B !== null && !B.has(T), J = [
          b === T ? "flash-target" : "",
          z ? "search-dimmed" : ""
        ].filter(Boolean).join(" ");
        return /* @__PURE__ */ n(
          "div",
          {
            role: "treeitem",
            "aria-expanded": _,
            "aria-level": 1,
            tabIndex: S === N ? 0 : -1,
            ref: (K) => {
              D.current[S] = K;
            },
            onFocus: () => g(S),
            className: J || void 0,
            children: /* @__PURE__ */ n(ns, { definition: k, expanded: _, onToggle: () => O(T) })
          },
          T
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
  const [s, o] = u.useState(!0), a = e.length + t.length, i = [];
  e.length > 0 && i.push(`${e.length} in shown files`), t.length > 0 && i.push(`${t.length} in hidden files`);
  const r = i.length > 1 ? ` (${i.join(", ")})` : "";
  return /* @__PURE__ */ d("div", { className: "errors-header", children: [
    /* @__PURE__ */ d("div", { className: "errors-header-bar", onClick: () => o(!s), children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: s ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "errors-header-icon", children: L.error.icon }),
      /* @__PURE__ */ d("span", { className: "errors-header-title", children: [
        a,
        " ",
        a === 1 ? "error" : "errors",
        r
      ] })
    ] }),
    s && /* @__PURE__ */ d("div", { className: "errors-header-body", children: [
      e.length > 0 && /* @__PURE__ */ n(
        jn,
        {
          label: "Shown files",
          errors: e,
          variant: "shown"
        }
      ),
      t.length > 0 && /* @__PURE__ */ n(
        jn,
        {
          label: "Hidden files",
          errors: t,
          variant: "hidden"
        }
      )
    ] })
  ] });
}
function jn({ label: e, errors: t, variant: s }) {
  return /* @__PURE__ */ d("div", { className: `error-group error-group-${s}`, children: [
    /* @__PURE__ */ d("div", { className: "error-group-label", children: [
      e,
      " (",
      t.length,
      ")"
    ] }),
    t.map((o, a) => /* @__PURE__ */ d("div", { className: "error-group-item", children: [
      /* @__PURE__ */ n("div", { className: "error-group-file", children: o.file.split("/").pop() }),
      /* @__PURE__ */ n("pre", { className: "error-group-message", children: o.stderr || o.error })
    ] }, a))
  ] });
}
function me(e, t) {
  return `${e}:${t}`;
}
function Jn(e) {
  const t = e.indexOf(":");
  return t < 0 ? e : e.slice(0, t);
}
function ys(e) {
  const t = /* @__PURE__ */ new Map(), s = [];
  let o = 0;
  function a(c) {
    t.set(c.id, c);
  }
  function i(c) {
    s.push({
      ...c,
      id: `e${o++}`,
      sourceNodeType: Jn(c.sourceId),
      targetNodeType: Jn(c.targetId)
    });
  }
  const r = /* @__PURE__ */ new Map();
  for (const c of e.definitions)
    r.set(`${c.type}:${c.name}`, c);
  for (const c of e.definitions)
    c.type === "namespaceDef" && a({
      id: me("namespace", c.name),
      level: 1,
      nodeType: "namespace",
      name: c.name,
      sourceFile: c.sourceFile,
      orphan: !1
      // namespaces are top-level, never orphans
    });
  const h = /* @__PURE__ */ new Map();
  for (const c of e.definitions)
    if (c.type === "namespaceDef")
      for (const f of c.workers || [])
        h.set(f.workerName, c.name);
  for (const c of e.definitions)
    if (c.type === "workerDef") {
      const f = h.get(c.name), b = f ? me("namespace", f) : void 0;
      a({
        id: me("worker", c.name),
        level: 2,
        nodeType: "worker",
        name: c.name,
        sourceFile: c.sourceFile,
        parentId: b,
        orphan: !b
      }), b && i({
        edgeType: "containment",
        sourceId: me("worker", c.name),
        targetId: b,
        sourceLevel: 2,
        targetLevel: 1
      });
    }
  const p = /* @__PURE__ */ new Set(), y = /* @__PURE__ */ new Map();
  for (const c of e.definitions) {
    if (c.type !== "workerDef") continue;
    const f = me("worker", c.name);
    for (const b of c.workflows || []) {
      const I = "workflow", E = me(I, b.name);
      p.add(`workflowDef:${b.name}`), y.set(E, c.name);
      const Y = r.get(`workflowDef:${b.name}`);
      a({
        id: E,
        level: 3,
        nodeType: I,
        name: b.name,
        sourceFile: Y == null ? void 0 : Y.sourceFile,
        parentId: f,
        orphan: !1
      }), i({ edgeType: "containment", sourceId: E, targetId: f, sourceLevel: 3, targetLevel: 2 });
    }
    for (const b of c.activities || []) {
      const I = "activity", E = me(I, b.name);
      p.add(`activityDef:${b.name}`), y.set(E, c.name);
      const Y = r.get(`activityDef:${b.name}`);
      a({
        id: E,
        level: 4,
        nodeType: I,
        name: b.name,
        sourceFile: Y == null ? void 0 : Y.sourceFile,
        parentId: f,
        orphan: !1
      }), i({ edgeType: "containment", sourceId: E, targetId: f, sourceLevel: 4, targetLevel: 2 });
    }
    for (const b of c.services || []) {
      const I = "nexusService", E = me(I, b.name);
      p.add(`nexusServiceDef:${b.name}`), y.set(E, c.name);
      const Y = r.get(`nexusServiceDef:${b.name}`);
      a({
        id: E,
        level: 2,
        nodeType: I,
        name: b.name,
        sourceFile: Y == null ? void 0 : Y.sourceFile,
        parentId: f,
        orphan: !1
      }), i({ edgeType: "containment", sourceId: E, targetId: f, sourceLevel: 2, targetLevel: 2 });
    }
  }
  for (const c of e.definitions)
    c.type === "workflowDef" && !p.has(`workflowDef:${c.name}`) ? a({
      id: me("workflow", c.name),
      level: 3,
      nodeType: "workflow",
      name: c.name,
      sourceFile: c.sourceFile,
      orphan: !0
    }) : c.type === "activityDef" && !p.has(`activityDef:${c.name}`) ? a({
      id: me("activity", c.name),
      level: 4,
      nodeType: "activity",
      name: c.name,
      sourceFile: c.sourceFile,
      orphan: !0
    }) : c.type === "nexusServiceDef" && !p.has(`nexusServiceDef:${c.name}`) && a({
      id: me("nexusService", c.name),
      level: 2,
      nodeType: "nexusService",
      name: c.name,
      sourceFile: c.sourceFile,
      orphan: !0
    });
  function M(c, f) {
    return me("nexusOperation", `${c}.${f}`);
  }
  for (const c of e.definitions) {
    if (c.type !== "nexusServiceDef") continue;
    const f = me("nexusService", c.name), b = y.get(f);
    for (const I of c.operations || []) {
      const E = M(c.name, I.name);
      a({
        id: E,
        level: 3,
        nodeType: "nexusOperation",
        name: I.name,
        sourceFile: c.sourceFile,
        parentId: f,
        orphan: !b
      }), i({ edgeType: "containment", sourceId: E, targetId: f, sourceLevel: 3, targetLevel: 2 }), b && y.set(E, b);
    }
  }
  const C = /* @__PURE__ */ new Set();
  function w(c, f, b) {
    if (!t.has(f) || c === f) return;
    const I = `${c}→${f}`;
    if (C.has(I)) return;
    C.add(I);
    const E = t.get(c), Y = t.get(f);
    i({
      edgeType: "dependency",
      sourceId: c,
      targetId: f,
      sourceLevel: (E == null ? void 0 : E.level) ?? 3,
      targetLevel: (Y == null ? void 0 : Y.level) ?? 3,
      ...b && { nexusEndpoint: b }
    });
  }
  for (const c of e.definitions)
    if (c.type === "nexusServiceDef")
      for (const f of c.operations || [])
        f.opType === "async" && f.workflowName && w(
          M(c.name, f.name),
          me("workflow", f.workflowName)
        );
  function A(c, f) {
    c.activity && w(f, me("activity", c.activity.name)), c.workflow && w(f, me("workflow", c.workflow.name)), c.nexus && w(
      f,
      M(c.nexus.service, c.nexus.operation),
      c.nexus.endpoint
    );
  }
  function N(c, f) {
    for (const b of c)
      switch (b.type) {
        case "activityCall":
          w(f, me("activity", b.name));
          break;
        case "workflowCall":
          w(f, me("workflow", b.name));
          break;
        case "nexusCall":
          w(
            f,
            M(b.service, b.operation),
            b.endpoint
          );
          break;
        case "await":
          A(b.target, f);
          break;
        case "promise":
          A(b.target, f);
          break;
        case "awaitAll":
          N(b.body || [], f);
          break;
        case "awaitOne":
          for (const I of b.cases || [])
            I.target && A(I.target, f), I.awaitAll && N(I.awaitAll.body || [], f), N(I.body || [], f);
          break;
        case "if":
          N(b.body || [], f), N(b.elseBody || [], f);
          break;
        case "for":
          N(b.body || [], f);
          break;
        case "switch":
          for (const I of b.cases || []) N(I.body || [], f);
          b.default && N(b.default, f);
          break;
      }
  }
  for (const c of e.definitions)
    if (c.type === "workflowDef") {
      const f = me("workflow", c.name);
      if (!t.has(f)) continue;
      N(c.body || [], f);
      for (const b of c.signals || []) N(b.body || [], f);
      for (const b of c.queries || []) N(b.body || [], f);
      for (const b of c.updates || []) N(b.body || [], f);
    } else if (c.type === "activityDef") {
      const f = me("activity", c.name);
      if (!t.has(f)) continue;
      N(c.body || [], f);
    } else if (c.type === "nexusServiceDef")
      for (const f of c.operations || []) {
        if (f.opType !== "sync" || !f.body) continue;
        const b = M(c.name, f.name);
        t.has(b) && N(f.body, b);
      }
  const g = /* @__PURE__ */ new Set();
  for (const c of s)
    if (c.edgeType !== "containment" && c.sourceLevel >= 3 && c.targetLevel >= 3) {
      const f = y.get(c.sourceId), b = y.get(c.targetId);
      if (f && b && f !== b) {
        const I = `${f}→${b}`;
        g.has(I) || (g.add(I), i({
          edgeType: "dependency",
          sourceId: me("worker", f),
          targetId: me("worker", b),
          sourceLevel: 2,
          targetLevel: 2
        }));
      }
    }
  const D = /* @__PURE__ */ new Set();
  for (const c of s)
    if (c.edgeType === "dependency" && c.sourceLevel === 2 && c.targetLevel === 2) {
      const f = t.get(c.sourceId), b = t.get(c.targetId);
      if (f != null && f.parentId && (b != null && b.parentId) && f.parentId !== b.parentId) {
        const I = `${f.parentId}→${b.parentId}`;
        D.has(I) || (D.add(I), i({
          edgeType: "dependency",
          sourceId: f.parentId,
          targetId: b.parentId,
          sourceLevel: 1,
          targetLevel: 1
        }));
      }
    }
  return { nodes: t, edges: s };
}
const gn = {
  // Charges (all negative = repulsion). Tuned to a roughly 8:3:1 gradient
  // L1:L2:L3, with services and operations slightly stronger than their
  // peer types so they stay clearly anchored to their bands.
  chargeNamespace: -640,
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
  linkActivityToActivity: 0.55,
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
  distActivityToActivity: 60,
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
function Bn(e, t) {
  switch (t) {
    case "namespace":
      return e.chargeNamespace;
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
function Cn(e, t) {
  switch (t) {
    case "namespace":
      return { yMin: e.bandYMinNamespace, yMax: e.bandYMaxNamespace };
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
const ks = [
  "namespace",
  "worker",
  "workflow",
  "activity",
  "nexusService",
  "nexusOperation"
];
function pt(e, t) {
  const s = t.sourceNodeType, o = t.targetNodeType;
  if (t.edgeType === "containment")
    return s === "nexusOperation" && o === "nexusService" || s === "nexusService" && o === "nexusOperation" ? { strength: e.linkNexusToOperation, distance: e.distNexusToOperation } : s === "nexusService" && o === "worker" || s === "worker" && o === "nexusService" ? { strength: e.linkWorkerToNexus, distance: e.distWorkerToNexus } : s === "workflow" || o === "workflow" ? { strength: e.linkWorkerToWorkflow, distance: e.distWorkerToWorkflow } : s === "activity" || o === "activity" ? { strength: e.linkWorkerToActivity, distance: e.distWorkerToActivity } : { strength: e.linkNsToWorker, distance: e.distNsToWorker };
  if (s === "namespace" || o === "namespace")
    return { strength: e.linkNsToNs, distance: e.distNsToNs };
  if (s === "worker" || o === "worker")
    return { strength: e.linkWorkerToWorker, distance: e.distWorkerToWorker };
  const a = s === "nexusOperation" ? "workflow" : s, i = o === "nexusOperation" ? "workflow" : o;
  return a === "workflow" && i === "workflow" ? { strength: e.linkWorkflowToWorkflow, distance: e.distWorkflowToWorkflow } : a === "activity" && i === "activity" ? { strength: e.linkActivityToActivity, distance: e.distActivityToActivity } : { strength: e.linkWorkflowToActivity, distance: e.distWorkflowToActivity };
}
const Pn = 50, je = 1e6;
class bs {
  constructor(t, s) {
    ln(this, "nodes");
    ln(this, "edges");
    ln(this, "params");
    ln(this, "alpha");
    ln(this, "nodeMap");
    this.params = { ...gn, ...s }, this.alpha = 1, this.nodes = [], this.nodeMap = /* @__PURE__ */ new Map();
    const o = (this.params.bandXMin + this.params.bandXMax) / 2, a = Math.max(40, (this.params.bandXMax - this.params.bandXMin) * 0.7);
    for (const i of t.nodes.values()) {
      const r = Cn(this.params, i.nodeType), h = (r.yMin + r.yMax) / 2, p = Math.max(20, (r.yMax - r.yMin) / 2), y = {
        ...i,
        x: o + (Math.random() - 0.5) * a,
        y: h + (Math.random() - 0.5) * p,
        vx: 0,
        vy: 0,
        pinned: !1
      };
      this.nodes.push(y), this.nodeMap.set(y.id, y);
    }
    for (const i of this.nodes)
      if (i.parentId) {
        const r = this.nodeMap.get(i.parentId);
        r && (i.x = r.x + (Math.random() - 0.5) * 20);
      }
    this.edges = t.edges;
  }
  getNode(t) {
    return this.nodeMap.get(t);
  }
  tick(t) {
    if (this.alpha < this.params.alphaMin) return;
    const s = t ? this.nodes.filter((c) => t.has(c.id)) : this.nodes, o = t ? this.edges.filter((c) => t.has(c.sourceId) && t.has(c.targetId)) : this.edges, a = /* @__PURE__ */ new Map();
    for (const c of o)
      a.set(c.sourceId, (a.get(c.sourceId) ?? 0) + 1), a.set(c.targetId, (a.get(c.targetId) ?? 0) + 1);
    const i = this.params.chargeSoftening, r = this.params.pushMultiplier, h = this.params.chargeExponent;
    for (let c = 0; c < s.length; c++)
      for (let f = c + 1; f < s.length; f++) {
        const b = s[c], I = s[f];
        let E = I.x - b.x, Y = I.y - b.y, he = E * E + Y * Y;
        if (he < 0.01) {
          const Ee = Math.random() * Math.PI * 2;
          E = Math.cos(Ee), Y = Math.sin(Ee), he = 1;
        }
        const j = Math.sqrt(he), Se = Math.sqrt(he + i), ge = Bn(this.params, b.nodeType), Ce = Bn(this.params, I.nodeType), se = (ge + Ce) / 2, Ne = -(this.alpha * r * se / Math.pow(Se, h)), we = Ne * (E / j), Q = Ne * (Y / j);
        b.pinned || (b.vx -= we, b.vy -= Q), I.pinned || (I.vx += we, I.vy += Q);
      }
    const p = this.params.pullMultiplier, y = this.params.linkExponent, M = this.params.distanceMultiplier;
    for (const c of o) {
      const f = this.nodeMap.get(c.sourceId), b = this.nodeMap.get(c.targetId);
      if (!f || !b) continue;
      let I = b.x - f.x, E = b.y - f.y, Y = Math.sqrt(I * I + E * E);
      if (Y < 0.1) {
        const te = Math.random() * Math.PI * 2;
        I = Math.cos(te), E = Math.sin(te), Y = 1;
      }
      const he = pt(this.params, c), j = he.distance * M, Se = Y - j, ge = Math.abs(Se), Ce = Se >= 0 ? 1 : -1, se = this.alpha * p * he.strength * Ce * Math.pow(ge, y) / Y, Ne = se * I, we = se * E, Q = a.get(c.sourceId) ?? 1, Ee = a.get(c.targetId) ?? 1, Ie = Q / (Q + Ee);
      f.pinned || (f.vx += Ne * (1 - Ie), f.vy += we * (1 - Ie)), b.pinned || (b.vx -= Ne * Ie, b.vy -= we * Ie);
    }
    const C = this.params.gravityX, w = this.params.gravityY, A = this.params.bandXMin, N = this.params.bandXMax;
    for (const c of s) {
      if (c.pinned) continue;
      let f = null;
      c.x < A ? f = A : c.x > N && (f = N), f !== null && (c.vx -= (c.x - f) * this.alpha * C);
      const b = Cn(this.params, c.nodeType);
      let I = null;
      c.y < b.yMin ? I = b.yMin : c.y > b.yMax && (I = b.yMax), I !== null && (c.vy -= (c.y - I) * this.alpha * w);
    }
    const g = this.params.velocityDecay, D = Pn * Pn;
    for (const c of s) {
      if (c.pinned) continue;
      c.vx *= g, c.vy *= g, Number.isFinite(c.vx) || (c.vx = 0), Number.isFinite(c.vy) || (c.vy = 0);
      const f = c.vx * c.vx + c.vy * c.vy;
      if (f > D) {
        const b = Pn / Math.sqrt(f);
        c.vx *= b, c.vy *= b;
      }
      c.x += c.vx, c.y += c.vy, Number.isFinite(c.x) || (c.x = 0), Number.isFinite(c.y) || (c.y = 0), c.x < -je ? c.x = -je : c.x > je && (c.x = je), c.y < -je ? c.y = -je : c.y > je && (c.y = je);
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
    const i = Cn(this.params, a.nodeType), r = Math.min(Math.max(o, i.yMin), i.yMax);
    a.x = s + (Math.random() - 0.5) * 10, a.y = r + (Math.random() - 0.5) * 10, a.vx = 0, a.vy = 0;
  }
}
const ws = { x: 0, y: 0, scale: 1 };
function Ve(e, t, s) {
  return [t * e.scale + e.x, s * e.scale + e.y];
}
function Rn(e, t, s) {
  return [(t - e.x) / e.scale, (s - e.y) / e.scale];
}
function _n(e, t, s, o) {
  const a = Math.max(0.1, Math.min(10, e.scale * o)), i = (t - e.x) / e.scale, r = (s - e.y) / e.scale;
  return {
    scale: a,
    x: t - i * a,
    y: s - r * a
  };
}
function En(e, t, s, o = 60) {
  if (e.length === 0) return { x: t / 2, y: s / 2, scale: 1 };
  let a = 1 / 0, i = -1 / 0, r = 1 / 0, h = -1 / 0;
  for (const g of e)
    g.x < a && (a = g.x), g.x > i && (i = g.x), g.y < r && (r = g.y), g.y > h && (h = g.y);
  const p = i - a || 1, y = h - r || 1, M = t - o * 2, C = s - o * 2, w = Math.min(M / p, C / y, 2), A = (a + i) / 2, N = (r + h) / 2;
  return {
    scale: w,
    x: t / 2 - A * w,
    y: s / 2 - N * w
  };
}
function vs(e, t, s, o) {
  const a = /* @__PURE__ */ new Set([e]), i = [e];
  for (; i.length > 0; ) {
    const r = i.shift();
    for (const h of t) {
      if (h.edgeType === "containment") continue;
      let p;
      o === "downstream" && h.sourceId === r ? p = h.targetId : o === "upstream" && h.targetId === r && (p = h.sourceId), p && s.has(p) && !a.has(p) && (a.add(p), i.push(p));
    }
  }
  return a;
}
function Ns(e, t) {
  const s = /* @__PURE__ */ new Set();
  for (const o of t)
    o.edgeType !== "containment" && e.has(o.sourceId) && e.has(o.targetId) && s.add(o.id);
  return s;
}
const Sn = {
  namespace: { fill: "#475569", border: "#1E293B", icon: L.namespace.icon },
  worker: { fill: "#94A3B8", border: "#475569", icon: L.worker.icon },
  workflow: { fill: "#8B7EC8", border: "#5D4F95", icon: L.workflow.icon },
  activity: { fill: "#7CB9E8", border: "#4A8BC2", icon: L.activity.icon },
  nexusService: { fill: "#DB2777", border: "#831843", icon: L.nexusService.icon },
  nexusOperation: { fill: "#F9A8D4", border: "#BE185D", icon: L.nexusOperation.icon }
}, Je = {
  containment: { color: "#94A3B8", alpha: 0.35, dash: [3, 4], width: 1 },
  opContainment: { color: "#DB2777", alpha: 0.55, dash: [3, 4], width: 1.2 },
  // op → service
  dependencyL1: { color: "#475569", alpha: 0.85, dash: [], width: 1.8 },
  // ns → ns
  dependencyL2: { color: "#64748B", alpha: 0.75, dash: [], width: 1.6 },
  // worker → worker
  workflowDep: { color: "#8B7EC8", alpha: 0.7, dash: [], width: 1.4 },
  // workflow → workflow
  dependencyL3: { color: "#94A3B8", alpha: 0.55, dash: [], width: 1.4 },
  // generic L3 (e.g. activity → workflow)
  dependencyL4: { color: "#94A3B8", alpha: 0.4, dash: [], width: 1.2 },
  // ends at activity (L4 leaf)
  nexusCall: { color: "#F472B6", alpha: 0.85, dash: [], width: 1.5 }
  // workflow ↔ operation, or spliced
}, xs = "#4A90D9", Ts = "#8B7EC8", fn = 0.2, On = {
  1: { w: 40, h: 40, r: 20, iconSize: 18 },
  2: { w: 40, h: 40, r: 20, iconSize: 18 },
  3: { w: 22, h: 22, r: 11, iconSize: 12 },
  4: { w: 16, h: 16, r: 8, iconSize: 10 }
}, Zn = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', Ss = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
function Qn(e, t) {
  return typeof document > "u" ? t : getComputedStyle(document.documentElement).getPropertyValue(e).trim() || t;
}
function Ms(e, t, s) {
  if (e.edgeType === "containment")
    return t.nodeType === "nexusOperation" && s.nodeType === "nexusService" ? Je.opContainment : Je.containment;
  if (t.nodeType === "nexusOperation" || s.nodeType === "nexusOperation" || e.nexusEndpoint != null)
    return Je.nexusCall;
  if (t.nodeType === "workflow" && s.nodeType === "workflow")
    return Je.workflowDep;
  const o = Math.min(t.level, s.level);
  return o === 1 ? Je.dependencyL1 : o === 2 ? Je.dependencyL2 : s.level === 4 || t.level === 4 ? Je.dependencyL4 : Je.dependencyL3;
}
const Mn = 8, Re = 100, $s = 0.5, et = 0.25, nt = 0.1;
function Cs({
  nodes: e,
  edges: t,
  viewport: s,
  onViewportChange: o,
  onNodeDragStart: a,
  onNodeDragMove: i,
  onNodeDragEnd: r,
  onDoubleClickNode: h,
  onHoverNode: p,
  onSelectNode: y,
  onNodeContextMenu: M,
  highlightedNodes: C,
  highlightedEdges: w,
  hoveredNodeId: A,
  selectedNodeId: N,
  focusedNodeId: g,
  searchMatchIds: D,
  running: c,
  showForceFields: f,
  forceParams: b,
  activeSection: I,
  activeChargeType: E,
  activeGravityType: Y,
  nodeSummaries: he
}) {
  const j = u.useRef(null), Se = u.useRef(null), [ge, Ce] = u.useState({ w: 0, h: 0 }), se = u.useRef(null), Ne = u.useMemo(() => {
    const R = /* @__PURE__ */ new Map();
    for (const l of e) R.set(l.id, l);
    return R;
  }, [e]), we = u.useRef({
    nodes: e,
    edges: t,
    nodeMap: Ne,
    viewport: s,
    highlightedNodes: C,
    highlightedEdges: w,
    hoveredNodeId: A,
    selectedNodeId: N,
    focusedNodeId: g,
    searchMatchIds: D,
    showForceFields: f,
    forceParams: b,
    activeSection: I,
    activeChargeType: E,
    activeGravityType: Y,
    nodeSummaries: he,
    running: c
  });
  we.current = {
    nodes: e,
    edges: t,
    nodeMap: Ne,
    viewport: s,
    highlightedNodes: C,
    highlightedEdges: w,
    hoveredNodeId: A,
    selectedNodeId: N,
    focusedNodeId: g,
    searchMatchIds: D,
    showForceFields: f,
    forceParams: b,
    activeSection: I,
    activeChargeType: E,
    activeGravityType: Y,
    nodeSummaries: he,
    running: c
  }, u.useEffect(() => {
    const R = Se.current;
    if (!R) return;
    const l = new ResizeObserver((U) => {
      const { width: ne, height: q } = U[0].contentRect;
      Ce({ w: Math.floor(ne), h: Math.floor(q) });
    });
    return l.observe(R), () => l.disconnect();
  }, []);
  const Q = u.useCallback((R, l) => {
    const [U, ne] = Rn(s, R, l);
    for (let q = e.length - 1; q >= 0; q--) {
      const xe = e[q], pe = On[xe.level].r / s.scale + 4;
      if ((U - xe.x) ** 2 + (ne - xe.y) ** 2 <= pe * pe) return xe;
    }
    return null;
  }, [e, s]), Ee = u.useCallback((R) => {
    R.preventDefault();
    const l = j.current.getBoundingClientRect(), U = R.clientX - l.left, ne = R.clientY - l.top, q = R.deltaY < 0 ? 1.1 : 0.9;
    o(_n(s, U, ne, q));
  }, [s, o]), Ie = u.useCallback((R) => {
    var xe;
    const l = j.current.getBoundingClientRect(), U = R.clientX - l.left, ne = R.clientY - l.top, q = Q(U, ne);
    if (q) {
      se.current = { type: "node", sx: U, sy: ne, moved: !1 };
      const [pe, O] = Rn(s, U, ne);
      a(q.id, pe, O);
    } else
      se.current = { type: "pan", startVp: { ...s }, sx: U, sy: ne, moved: !1 };
    (xe = j.current) == null || xe.setPointerCapture(R.pointerId);
  }, [s, Q, a]), te = u.useCallback((R) => {
    const l = j.current.getBoundingClientRect(), U = R.clientX - l.left, ne = R.clientY - l.top;
    if (!se.current) {
      const q = Q(U, ne);
      p((q == null ? void 0 : q.id) ?? null);
      return;
    }
    if (se.current.moved = !0, se.current.type === "pan" && se.current.startVp) {
      const q = U - se.current.sx, xe = ne - se.current.sy;
      o({
        ...se.current.startVp,
        x: se.current.startVp.x + q,
        y: se.current.startVp.y + xe
      });
    } else if (se.current.type === "node") {
      const [q, xe] = Rn(s, U, ne);
      i(q, xe);
    }
  }, [s, Q, o, i, p]), B = u.useCallback((R) => {
    var U;
    const l = se.current;
    if ((l == null ? void 0 : l.type) === "node") {
      if (r(), !l.moved) {
        const ne = j.current.getBoundingClientRect(), q = R.clientX - ne.left, xe = R.clientY - ne.top, pe = Q(q, xe);
        pe && y(pe.id);
      }
    } else (l == null ? void 0 : l.type) === "pan" && !l.moved && y(null);
    se.current = null, (U = j.current) == null || U.releasePointerCapture(R.pointerId);
  }, [r, y, Q]), V = u.useCallback((R) => {
    const l = j.current.getBoundingClientRect(), U = R.clientX - l.left, ne = R.clientY - l.top, q = Q(U, ne);
    q ? h(q.id) : o(En(e, ge.w, ge.h));
  }, [Q, e, ge, o, h]), ee = u.useCallback((R) => {
    if (!M) return;
    const l = j.current.getBoundingClientRect(), U = R.clientX - l.left, ne = R.clientY - l.top, q = Q(U, ne);
    q && (R.preventDefault(), M(q.id, R.clientX, R.clientY));
  }, [Q, M]), ye = u.useRef(!0);
  return u.useEffect(() => {
    ye.current = !0;
  }), u.useEffect(() => {
    const R = j.current;
    if (!R || ge.w === 0) return;
    const l = R.getContext("2d");
    if (!l) return;
    const U = window.devicePixelRatio || 1;
    R.width = ge.w * U, R.height = ge.h * U;
    let ne = 0, q = !0;
    const xe = () => {
      var F, x, G, re, en;
      const O = we.current, { w: Me, h: $e } = ge, Qe = O.highlightedNodes !== null && O.highlightedNodes.size > 0, Ke = Qn("--color-text", "#1e293b"), k = Qn("--color-text-muted", "#64748b"), S = Ke.startsWith("#") && Ke.length === 7 ? Ke + "33" : "rgba(100,116,139,0.2)", T = O.viewport;
      l.setTransform(U, 0, 0, U, 0, 0), l.clearRect(0, 0, Me, $e);
      for (const X of O.edges) {
        const oe = O.nodeMap.get(X.sourceId), ie = O.nodeMap.get(X.targetId);
        if (!oe || !ie) continue;
        const [Z, de] = Ve(T, oe.x, oe.y), [ae, ue] = Ve(T, ie.x, ie.y);
        if (Math.max(Z, ae) < -Re || Math.min(Z, ae) > Me + Re || Math.max(de, ue) < -Re || Math.min(de, ue) > $e + Re) continue;
        const ke = ((F = O.highlightedEdges) == null ? void 0 : F.has(X.id)) ?? !1, Te = Ms(X, oe, ie), De = Te.alpha, Fe = O.searchMatchIds !== null && (!O.searchMatchIds.has(X.sourceId) || !O.searchMatchIds.has(X.targetId));
        if (l.globalAlpha = Qe ? ke ? 1 : fn : Fe ? fn : De, l.beginPath(), l.setLineDash([...Te.dash]), l.strokeStyle = Te.color, l.lineWidth = Te.width, l.moveTo(Z, de), l.lineTo(ae, ue), l.stroke(), l.setLineDash([]), X.edgeType !== "containment") {
          const ve = Math.atan2(ue - de, ae - Z), Le = On[ie.level].w / 2 * T.scale + 2, Be = ae - Math.cos(ve) * Le, be = ue - Math.sin(ve) * Le;
          l.beginPath(), l.moveTo(Be, be), l.lineTo(
            Be - Mn * Math.cos(ve - Math.PI / 6),
            be - Mn * Math.sin(ve - Math.PI / 6)
          ), l.lineTo(
            Be - Mn * Math.cos(ve + Math.PI / 6),
            be - Mn * Math.sin(ve + Math.PI / 6)
          ), l.closePath(), l.fillStyle = Te.color, l.fill();
        }
        l.globalAlpha = 1;
      }
      const _ = O.activeSection === "push", z = O.activeSection === "pull", J = O.activeSection === "gravity", K = [0.2, 0.5, 1.5];
      if (O.showForceFields || _) {
        const X = O.forceParams.chargeSoftening, oe = O.forceParams.chargeExponent, ie = O.forceParams.pushMultiplier, Z = _ ? O.activeChargeType : null;
        for (const de of O.nodes) {
          const [ae, ue] = Ve(T, de.x, de.y), ke = 2e3;
          if (ae + ke < 0 || ae - ke > Me || ue + ke < 0 || ue - ke > $e) continue;
          const Te = Z === null || de.nodeType === Z, De = _ && Te, Fe = _ && !Te, ve = De ? 0.24 : Fe ? 0.04 : 0.1, nn = De ? 0.05 : Fe ? 0.01 : 0.025, Le = ((x = Sn[de.nodeType]) == null ? void 0 : x.fill) ?? "#999";
          l.strokeStyle = Le;
          const Be = Math.abs(Bn(O.forceParams, de.nodeType)) * ie;
          if (Be <= 0) continue;
          const be = [];
          for (let Ae = 0; Ae < K.length; Ae++) {
            const qe = K[Ae], We = Be / qe, Ye = Math.pow(We, 2 / Math.max(oe, 0.01)) - X;
            if (Ye <= 0) continue;
            const Ue = Math.sqrt(Ye) * T.scale;
            Ue < 2 || Ue > 2e3 || be.push(Ue);
          }
          if (be.length !== 0) {
            l.fillStyle = Le, l.globalAlpha = De ? 0.14 : Fe ? 0.02 : 0.05, l.beginPath(), l.arc(ae, ue, be[0], 0, Math.PI * 2), l.fill(), l.strokeStyle = Le;
            for (let Ae = 0; Ae < be.length; Ae++) {
              const qe = be[Ae], We = be.length - 1 - Ae;
              l.beginPath(), l.arc(ae, ue, qe, 0, Math.PI * 2), l.globalAlpha = ve + We * nn, l.lineWidth = De ? 1.5 : 1, l.stroke();
            }
          }
        }
        l.globalAlpha = 1;
      }
      if (z) {
        const X = O.forceParams.distanceMultiplier;
        for (const oe of O.edges) {
          const ie = O.nodeMap.get(oe.sourceId), Z = O.nodeMap.get(oe.targetId);
          if (!ie || !Z) continue;
          const [de, ae] = Ve(T, ie.x, ie.y), [ue, ke] = Ve(T, Z.x, Z.y);
          if (Math.max(de, ue) < -Re || Math.min(de, ue) > Me + Re || Math.max(ae, ke) < -Re || Math.min(ae, ke) > $e + Re) continue;
          const De = pt(O.forceParams, oe).distance * X, Fe = Z.x - ie.x, ve = Z.y - ie.y, Le = Math.sqrt(Fe * Fe + ve * ve) / Math.max(De, 0.1);
          let Be;
          Le > 1.15 ? Be = "#F59E0B" : Le < 0.85 ? Be = "#3B82F6" : Be = "#22C55E", l.beginPath(), l.moveTo(de, ae), l.lineTo(ue, ke), l.strokeStyle = Be, l.globalAlpha = 0.5, l.lineWidth = 3, l.setLineDash([]), l.stroke();
          const be = Math.atan2(ve, Fe), Ae = -Math.sin(be), qe = Math.cos(be), We = 5, Ye = De * T.scale;
          if (Ye > 10 && Ye < Math.sqrt((ue - de) ** 2 + (ke - ae) ** 2) * 2) {
            const on = de + Math.cos(be) * Ye, Ue = ae + Math.sin(be) * Ye;
            l.beginPath(), l.moveTo(on - Ae * We, Ue - qe * We), l.lineTo(on + Ae * We, Ue + qe * We), l.strokeStyle = "#22C55E", l.globalAlpha = 0.7, l.lineWidth = 1.5, l.stroke();
            const tn = ue - Math.cos(be) * Ye, sn = ke - Math.sin(be) * Ye;
            l.beginPath(), l.moveTo(tn - Ae * We, sn - qe * We), l.lineTo(tn + Ae * We, sn + qe * We), l.stroke();
          }
        }
        l.globalAlpha = 1, l.setLineDash([]);
      }
      if (J) {
        const [X] = Ve(T, O.forceParams.bandXMin, 0), [oe] = Ve(T, O.forceParams.bandXMax, 0);
        for (const Z of ks) {
          const de = Cn(O.forceParams, Z), [, ae] = Ve(T, 0, de.yMin), [, ue] = Ve(T, 0, de.yMax);
          if (ue < 0 || ae > $e) continue;
          const ke = O.activeGravityType === Z, Te = O.activeGravityType !== null && !ke;
          l.fillStyle = ((G = Sn[Z]) == null ? void 0 : G.fill) ?? "#999", l.globalAlpha = ke ? 0.2 : Te ? 0.04 : 0.1, l.fillRect(0, ae, Me, ue - ae), l.strokeStyle = ((re = Sn[Z]) == null ? void 0 : re.fill) ?? "#999", l.globalAlpha = ke ? 0.55 : Te ? 0.08 : 0.22, l.lineWidth = ke ? 1.5 : 1, l.setLineDash([]), l.beginPath(), l.moveTo(0, ae), l.lineTo(Me, ae), l.moveTo(0, ue), l.lineTo(Me, ue), l.stroke();
        }
        X < Me + Re && oe > -Re && (l.strokeStyle = "#8B7EC8", l.globalAlpha = 0.5, l.lineWidth = 1.5, l.setLineDash([6, 6]), l.beginPath(), l.moveTo(X, 0), l.lineTo(X, $e), l.moveTo(oe, 0), l.lineTo(oe, $e), l.stroke(), l.fillStyle = "#8B7EC8", l.globalAlpha = 0.05, l.fillRect(X, 0, oe - X, $e), l.setLineDash([])), l.globalAlpha = 1;
      }
      l.font = Zn, l.textAlign = "center", l.textBaseline = "middle";
      for (const X of O.nodes) {
        const [oe, ie] = Ve(T, X.x, X.y), Z = On[X.level], de = Z.w / 2, ae = Z.h / 2;
        if (oe + de < -Re || oe - de > Me + Re || ie + ae < -Re || ie - ae > $e + Re) continue;
        const ue = ((en = O.highlightedNodes) == null ? void 0 : en.has(X.id)) ?? !1, ke = O.searchMatchIds !== null && !O.searchMatchIds.has(X.id), Te = Qe && !ue || ke;
        l.globalAlpha = Te ? fn : 1;
        const De = Sn[X.nodeType] ?? { fill: "#999", border: "#444", icon: "?" };
        l.beginPath(), l.arc(oe, ie, Z.r, 0, Math.PI * 2), l.fillStyle = De.fill, l.fill(), l.lineWidth = Math.max(1, Math.min(2, T.scale * 1.25)), l.strokeStyle = De.border, l.stroke(), T.scale >= et && De.icon && (l.save(), l.font = `${Z.iconSize}px ${Ss}`, l.fillStyle = "#FFFFFF", l.globalAlpha = (Te ? fn : 1) * 0.92, l.fillText(De.icon, oe, ie + 0.5), l.restore()), X.orphan && T.scale >= nt && (l.save(), l.setLineDash([3, 3]), l.strokeStyle = De.fill, l.lineWidth = 1.5, l.beginPath(), l.arc(oe, ie, Z.r + 4, 0, Math.PI * 2), l.stroke(), l.restore()), X.id === O.selectedNodeId && (l.save(), l.strokeStyle = Ts, l.lineWidth = 2.5, l.setLineDash([]), l.beginPath(), l.arc(oe, ie, Z.r + 5, 0, Math.PI * 2), l.stroke(), l.restore()), X.id === O.focusedNodeId && T.scale >= nt && (l.save(), l.strokeStyle = xs, l.lineWidth = 2, l.setLineDash([2, 2]), l.beginPath(), l.arc(oe, ie, Z.r + 7, 0, Math.PI * 2), l.stroke(), l.restore()), l.globalAlpha = 1;
        const Fe = Math.max(Z.r * 4, 48), ve = ie + Z.r + 12, nn = X.id === O.hoveredNodeId || X.id === O.selectedNodeId;
        if ((T.scale >= et || nn) && (l.fillStyle = Te ? S : Ke, l.fillText(Es(l, X.name, Fe), oe, ve), T.scale >= $s)) {
          const Le = O.nodeSummaries.get(X.id);
          Le && (l.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', l.globalAlpha = Te ? fn * 0.55 : 0.55, l.fillStyle = k, l.fillText(Le, oe, ve + 13), l.font = Zn);
        }
      }
    }, pe = () => {
      if (!q) return;
      (we.current.running || ye.current) && (ye.current = !1, xe()), ne = requestAnimationFrame(pe);
    };
    return ne = requestAnimationFrame(pe), () => {
      q = !1, cancelAnimationFrame(ne);
    };
  }, [ge]), /* @__PURE__ */ n("div", { ref: Se, className: "graph-canvas-container", children: /* @__PURE__ */ n(
    "canvas",
    {
      ref: j,
      style: { width: ge.w, height: ge.h },
      onWheel: Ee,
      onPointerDown: Ie,
      onPointerMove: te,
      onPointerUp: B,
      onDoubleClick: V,
      onContextMenu: ee
    }
  ) });
}
function Es(e, t, s) {
  if (e.measureText(t).width <= s) return t;
  for (let o = t.length - 1; o > 0; o--) {
    const a = t.slice(0, o) + "…";
    if (e.measureText(a).width <= s) return a;
  }
  return "…";
}
const Ds = [
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
], Fs = [
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
], As = [
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
], Is = 0, Ls = 1.5, Ws = 0.05, Ps = 10, Rs = 600, Os = 10, Bs = [
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
  },
  {
    label: "Act↔Act",
    kKey: "linkActivityToActivity",
    restKey: "distActivityToActivity",
    sourceType: "activity",
    targetType: "activity",
    tooltip: "Activity ↔ Activity dependency"
  }
], _s = [
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
], ht = -600, ft = 600, mt = 10, Ys = [
  {
    label: "L1 NS",
    nodeType: "namespace",
    minKey: "bandYMinNamespace",
    maxKey: "bandYMaxNamespace",
    tooltip: "Y band where namespace nodes feel zero gravity"
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
], Vs = [
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
function Ks({
  params: e,
  onParamChange: t,
  running: s,
  onToggleRunning: o,
  onReheat: a,
  showForceFields: i,
  onToggleForceFields: r,
  onActiveSection: h,
  onActiveChargeType: p,
  onActiveGravityType: y
}) {
  const [M, C] = u.useState(!1), [w, A] = u.useState(!1), N = () => {
    for (const g of Object.keys(gn))
      e[g] !== gn[g] && t(g, gn[g]);
  };
  return /* @__PURE__ */ d("div", { className: `graph-control-panel ${M ? "open" : ""}`, children: [
    /* @__PURE__ */ d(
      "button",
      {
        className: "graph-control-panel-toggle",
        onClick: () => C(!M),
        title: "Toggle control panel",
        children: [
          M ? "▼ Forces" : "▶ Forces",
          M && /* @__PURE__ */ n(
            "span",
            {
              className: "graph-control-help-btn",
              onClick: (g) => {
                g.stopPropagation(), A(!w);
              },
              title: "How the simulation works",
              children: "?"
            }
          )
        ]
      }
    ),
    M && w && /* @__PURE__ */ n("div", { className: "graph-control-help-popover", children: /* @__PURE__ */ n("pre", { className: "graph-control-help-text", children: zs }) }),
    M && /* @__PURE__ */ d("div", { className: "graph-control-panel-body", children: [
      /* @__PURE__ */ d($n, { section: "push", title: "PUSH", subtitle: "all node pairs", equation: `F = α × push × charge / eff^exp
eff = √(d² + softening)`, onHover: (g) => h(g ? "push" : null), children: [
        Ds.map((g) => /* @__PURE__ */ n(mn, { def: g, value: e[g.key], onChange: (D) => t(g.key, D) }, g.key)),
        /* @__PURE__ */ d("div", { className: "graph-control-sub-header", children: [
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Level" }),
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Charge" })
        ] }),
        Fs.map((g) => /* @__PURE__ */ n(
          "div",
          {
            onMouseEnter: () => p(g.nodeType),
            onMouseLeave: () => p(null),
            children: /* @__PURE__ */ n(
              mn,
              {
                def: g,
                value: e[g.key],
                onChange: (D) => t(g.key, D),
                nodeType: g.nodeType
              }
            )
          },
          g.key
        ))
      ] }),
      /* @__PURE__ */ d($n, { section: "pull", title: "PULL", subtitle: "connected pairs", equation: `F = α × pull × k × sign(Δ) × |Δ|^exp / d
Δ = d − rest × dist`, onHover: (g) => h(g ? "pull" : null), children: [
        As.map((g) => /* @__PURE__ */ n(mn, { def: g, value: e[g.key], onChange: (D) => t(g.key, D) }, g.key)),
        /* @__PURE__ */ d("div", { className: "graph-control-sub-header", children: [
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", style: { minWidth: 52 }, children: "Edge" }),
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "k" }),
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "rest" })
        ] }),
        Bs.map((g) => /* @__PURE__ */ n(qs, { def: g, params: e, onChange: t }, g.label))
      ] }),
      /* @__PURE__ */ d(
        $n,
        {
          section: "gravity",
          title: "GRAVITY",
          subtitle: "hierarchical anchor",
          equation: `Fₓ = α × X × (0 − x)
Fᵧ = α × Y × (band − y) when y outside band`,
          onHover: (g) => {
            h(g ? "gravity" : null), g || y(null);
          },
          children: [
            _s.map((g) => /* @__PURE__ */ n(mn, { def: g, value: e[g.key], onChange: (D) => t(g.key, D) }, g.key)),
            /* @__PURE__ */ d("div", { className: "graph-control-sub-header", children: [
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Axis" }),
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "X band (left \\u2192 right)" })
            ] }),
            /* @__PURE__ */ d("div", { className: "graph-control-band-row", children: [
              /* @__PURE__ */ n("span", { className: "graph-control-band-label", children: "X" }),
              /* @__PURE__ */ n(
                gt,
                {
                  min: ht,
                  max: ft,
                  step: mt,
                  valueMin: e.bandXMin,
                  valueMax: e.bandXMax,
                  onChangeMin: (g) => t("bandXMin", g),
                  onChangeMax: (g) => t("bandXMax", g),
                  nodeType: "namespace"
                }
              ),
              /* @__PURE__ */ n("span", { className: "graph-control-band-value", children: Math.round(e.bandXMin) }),
              /* @__PURE__ */ n("span", { className: "graph-control-band-value", children: Math.round(e.bandXMax) })
            ] }),
            /* @__PURE__ */ d("div", { className: "graph-control-sub-header", children: [
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Type" }),
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Y band (top \\u2192 bottom)" })
            ] }),
            Ys.map((g) => /* @__PURE__ */ n(
              "div",
              {
                onMouseEnter: () => y(g.nodeType),
                onMouseLeave: () => y(null),
                children: /* @__PURE__ */ n(
                  Hs,
                  {
                    def: g,
                    valueMin: e[g.minKey],
                    valueMax: e[g.maxKey],
                    onChangeMin: (D) => t(g.minKey, D),
                    onChangeMax: (D) => t(g.maxKey, D)
                  }
                )
              },
              g.nodeType
            ))
          ]
        }
      ),
      /* @__PURE__ */ n($n, { section: "dynamics", title: "DYNAMICS", subtitle: "", equation: `v ×= friction
α −= cooling, stop at threshold`, onHover: (g) => h(g ? "dynamics" : null), children: Vs.map((g) => /* @__PURE__ */ n(mn, { def: g, value: e[g.key], onChange: (D) => t(g.key, D) }, g.key)) }),
      /* @__PURE__ */ d("div", { className: "graph-control-group", children: [
        /* @__PURE__ */ d("div", { className: "graph-control-sim-buttons", children: [
          /* @__PURE__ */ n("button", { className: "graph-header-btn", onClick: o, children: s ? "Pause" : "Play" }),
          /* @__PURE__ */ n("button", { className: "graph-header-btn", onClick: a, children: "Reheat" }),
          /* @__PURE__ */ n("button", { className: "graph-header-btn", onClick: N, title: "Reset all parameters to defaults", children: "Reset" })
        ] }),
        /* @__PURE__ */ d("label", { className: "graph-control-checkbox", title: "Show charge field rings around nodes", children: [
          /* @__PURE__ */ n("input", { type: "checkbox", checked: i, onChange: r }),
          "Show force fields"
        ] })
      ] })
    ] })
  ] });
}
function $n({ section: e, title: t, subtitle: s, equation: o, onHover: a, children: i }) {
  return /* @__PURE__ */ d(
    "div",
    {
      className: `graph-control-equation-section graph-control-section-${e}`,
      onMouseEnter: () => a(!0),
      onMouseLeave: () => a(!1),
      children: [
        /* @__PURE__ */ d("div", { className: "graph-control-equation-header", children: [
          /* @__PURE__ */ n("span", { className: "graph-control-equation-title", children: t }),
          s && /* @__PURE__ */ d("span", { className: "graph-control-equation-subtitle", children: [
            "(",
            s,
            ")"
          ] })
        ] }),
        /* @__PURE__ */ n("pre", { className: "graph-control-equation-formula", children: o }),
        /* @__PURE__ */ n("div", { className: "graph-control-equation-body", children: i })
      ]
    }
  );
}
function qs({ def: e, params: t, onChange: s }) {
  const o = t[e.kKey], a = t[e.restKey], i = String(o), r = String(Math.round(a));
  return /* @__PURE__ */ d("div", { className: "graph-control-pull-edge", title: e.tooltip, children: [
    /* @__PURE__ */ d("span", { className: "graph-control-pull-edge-label", children: [
      /* @__PURE__ */ n("span", { className: `graph-control-edge-dot graph-control-typed-${e.sourceType}` }),
      /* @__PURE__ */ n("span", { className: `graph-control-edge-dot graph-control-typed-${e.targetType}` }),
      e.label
    ] }),
    /* @__PURE__ */ n(
      "input",
      {
        type: "range",
        min: Is,
        max: Ls,
        step: Ws,
        value: o,
        onChange: (h) => s(e.kKey, Number(h.target.value)),
        className: "graph-control-slider-input graph-control-pull-slider"
      }
    ),
    /* @__PURE__ */ n("span", { className: "graph-control-pull-value", children: i }),
    /* @__PURE__ */ n(
      "input",
      {
        type: "range",
        min: Ps,
        max: Rs,
        step: Os,
        value: a,
        onChange: (h) => s(e.restKey, Number(h.target.value)),
        className: "graph-control-slider-input graph-control-pull-slider"
      }
    ),
    /* @__PURE__ */ n("span", { className: "graph-control-pull-value", children: r })
  ] });
}
function Hs({ def: e, valueMin: t, valueMax: s, onChangeMin: o, onChangeMax: a }) {
  return /* @__PURE__ */ d(
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
  onChangeMin: i,
  onChangeMax: r,
  nodeType: h
}) {
  const p = t - e, y = (o - e) / p * 100, M = Math.max(0, (a - o) / p * 100);
  return /* @__PURE__ */ d("div", { className: `dual-range dual-range-${h}`, children: [
    /* @__PURE__ */ n("div", { className: "dual-range-track" }),
    /* @__PURE__ */ n(
      "div",
      {
        className: "dual-range-fill",
        style: { left: `${y}%`, width: `${M}%` }
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
        onChange: (C) => {
          const w = Math.min(Number(C.target.value), a - s);
          i(w);
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
        onChange: (C) => {
          const w = Math.max(Number(C.target.value), o + s);
          r(w);
        }
      }
    )
  ] });
}
function mn({ def: e, value: t, onChange: s, nodeType: o }) {
  const a = e.step < 1 ? String(t) : String(Math.round(t)), i = o ? `graph-control-slider graph-control-typed-row graph-control-typed-${o}` : "graph-control-slider";
  return /* @__PURE__ */ d("div", { className: i, title: e.tooltip, children: [
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
const zs = `Force-directed graph layout:

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
  L1: Namespace
  L2: Worker
  L3: Workflow, Activity, NexusService

Tuning guide:
  • Start with push/pull multipliers for balance
  • If nodes overlap → increase push or charge
  • If too spread → increase pull or gravity
  • If oscillating → increase friction or cooling
  • Toggle "Show force fields" to see charge reach`;
function Gs({ x: e, y: t, items: s, onClose: o }) {
  const a = u.useRef(null);
  u.useEffect(() => {
    const r = (p) => {
      p.key === "Escape" && o();
    }, h = (p) => {
      a.current && (a.current.contains(p.target) || o());
    };
    return window.addEventListener("keydown", r), window.addEventListener("mousedown", h, !0), () => {
      window.removeEventListener("keydown", r), window.removeEventListener("mousedown", h, !0);
    };
  }, [o]);
  const i = u.useMemo(() => {
    const p = 40 + s.length * 28, y = Math.min(e, window.innerWidth - 180 - 8), M = Math.min(t, window.innerHeight - p - 8);
    return { left: y, top: M };
  }, [e, t, s.length]);
  return /* @__PURE__ */ n("div", { ref: a, className: "graph-context-menu", style: i, role: "menu", children: s.map((r, h) => /* @__PURE__ */ n(
    "button",
    {
      role: "menuitem",
      className: "graph-context-menu-item",
      onClick: () => {
        r.onClick(), o();
      },
      children: r.label
    },
    h
  )) });
}
function dn(e) {
  switch (e) {
    case "namespace":
      return "namespaceDef";
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
    const i = s(a);
    a = i == null ? void 0 : i.parentId;
  }
  return null;
}
function Yn(e, t, s, o, a, i) {
  if (t) return [e];
  const r = i(e);
  if ((r == null ? void 0 : r.nodeType) === "nexusOperation") {
    const p = [];
    for (const y of o.edges) {
      if (y.edgeType !== "dependency") continue;
      const M = s === "tgt" ? y.sourceId === e ? y.targetId : null : y.targetId === e ? y.sourceId : null;
      if (M)
        for (const C of Yn(M, a.has(M), s, o, a, i))
          p.push(C);
    }
    if (p.length > 0) return p;
  }
  const h = yt(e, a, i);
  return h ? [h] : [];
}
function Us(e, t, s) {
  if (e.level === 1) {
    const o = t.filter((a) => a.edgeType === "containment" && a.targetId === e.id).length;
    return o > 0 ? `${o} worker${o !== 1 ? "s" : ""}` : "";
  } else if (e.level === 2) {
    let o = 0, a = 0, i = 0;
    for (const h of t) {
      if (h.edgeType !== "containment" || h.targetId !== e.id) continue;
      const p = s.get(h.sourceId);
      p && (p.nodeType === "workflow" ? o++ : p.nodeType === "activity" ? a++ : p.nodeType === "nexusService" && i++);
    }
    const r = [];
    return o > 0 && r.push(`${o}wf`), a > 0 && r.push(`${a}act`), i > 0 && r.push(`${i}nxs`), r.join(" · ");
  } else {
    let o = 0, a = 0;
    for (const r of t)
      r.edgeType !== "containment" && (r.sourceId === e.id && o++, r.targetId === e.id && a++);
    const i = [];
    return o > 0 && i.push(`→${o}`), a > 0 && i.push(`←${a}`), i.join(" ");
  }
}
function Xs(e) {
  switch (e) {
    case "namespaceDef":
      return "namespace";
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
function js({
  ast: e,
  onShowInTree: t,
  filter: s,
  onFilterChange: o,
  pins: a,
  onPinsChange: i,
  searchQuery: r,
  searchActive: h,
  onSearchChange: p,
  pendingFocus: y,
  onFocusConsumed: M,
  overriddenPins: C,
  onOverriddenPinsConsumed: w
}) {
  const A = s.visibleTypes, N = s.selectedFiles, [g, D] = u.useState(ws), [c, f] = u.useState(!0), [b, I] = u.useState({ ...gn }), E = u.useRef(null), Y = u.useRef(null), he = u.useRef(!1), j = u.useRef(null), Se = u.useRef(null), [ge, Ce] = u.useState(0), se = u.useRef({ frames: 0, lastStamp: 0 }), [Ne, we] = u.useState(null), [Q, Ee] = u.useState(null), [Ie, te] = u.useState(-1), [B, V] = u.useState(!1), [ee, ye] = u.useState(!1), [R, l] = u.useState(null), [U, ne] = u.useState(null), [q, xe] = u.useState(null), pe = u.useRef(null), [O, Me] = u.useState(!1), [$e, Qe] = u.useState(null), Ke = u.useRef(s), [k, S] = u.useState(/* @__PURE__ */ new Set());
  u.useEffect(() => {
    const m = Ke.current;
    if (An(m, s)) return;
    const v = /* @__PURE__ */ new Set();
    for (const $ of s.selectedFiles) m.selectedFiles.has($) || v.add(`file:${$}`);
    for (const $ of s.visibleTypes) m.visibleTypes.has($) || v.add(`type:${$}`);
    if (Ke.current = s, v.size > 0) {
      S(v);
      const $ = setTimeout(() => S(/* @__PURE__ */ new Set()), 450);
      return () => clearTimeout($);
    }
  }, [s]), u.useEffect(() => {
    if (C.size === 0) return;
    const m = setTimeout(w, 600);
    return () => clearTimeout(m);
  }, [C, w]);
  const T = u.useMemo(() => ys(e), [e]), [_, z] = u.useState(0);
  u.useEffect(() => {
    E.current = new bs(T, b), he.current = !1, se.current = { frames: 0, lastStamp: 0 }, f(!0), Ee(null), we(null), te(-1), z((m) => m + 1);
  }, [T]);
  const J = u.useMemo(() => {
    const m = /* @__PURE__ */ new Set();
    for (const v of T.nodes.values())
      v.sourceFile && m.add(v.sourceFile);
    return Array.from(m).sort();
  }, [T]), { visibleNodes: K, visibleEdges: F, visibleIds: x, nodeSummaries: G } = u.useMemo(() => {
    const m = E.current;
    if (!m) return { visibleNodes: [], visibleEdges: [], visibleIds: /* @__PURE__ */ new Set(), nodeSummaries: /* @__PURE__ */ new Map() };
    const v = N.size > 0, $ = /* @__PURE__ */ new Set(), P = [];
    for (const H of m.nodes)
      A.has(dn(H.nodeType)) && (v && H.sourceFile && !N.has(H.sourceFile) || ($.add(H.id), P.push(H)));
    const W = (H) => m.getNode(H), ce = [], fe = /* @__PURE__ */ new Map();
    for (const H of m.edges) {
      const pn = $.has(H.sourceId), zn = $.has(H.targetId);
      if (H.edgeType === "containment") {
        if (!pn) continue;
        if (zn)
          ce.push(H);
        else {
          const hn = yt(H.targetId, $, W);
          if (hn) {
            const Xe = W(hn);
            ce.push({
              ...H,
              targetId: hn,
              targetLevel: (Xe == null ? void 0 : Xe.level) ?? H.targetLevel,
              targetNodeType: (Xe == null ? void 0 : Xe.nodeType) ?? H.targetNodeType,
              id: `grad:${H.id}`
            });
          }
        }
      } else {
        const hn = Yn(H.sourceId, pn, "src", m, $, W), Xe = Yn(H.targetId, zn, "tgt", m, $, W);
        for (const xn of hn)
          for (const Tn of Xe) {
            if (xn === Tn) continue;
            const Ln = `${xn}→${Tn}`, Gn = fe.get(Ln);
            if (Gn && Gn.nexusEndpoint && !H.nexusEndpoint) continue;
            const an = W(xn), cn = W(Tn);
            fe.set(Ln, {
              ...H,
              sourceId: xn,
              targetId: Tn,
              sourceLevel: (an == null ? void 0 : an.level) ?? H.sourceLevel,
              targetLevel: (cn == null ? void 0 : cn.level) ?? H.targetLevel,
              sourceNodeType: (an == null ? void 0 : an.nodeType) ?? H.sourceNodeType,
              targetNodeType: (cn == null ? void 0 : cn.nodeType) ?? H.targetNodeType,
              id: `grad:${Ln}`
            });
          }
      }
    }
    const _e = [...ce, ...fe.values()], Pe = /* @__PURE__ */ new Map();
    for (const H of P) Pe.set(H.id, H);
    const Nn = /* @__PURE__ */ new Map();
    for (const H of P) {
      const pn = Us(H, _e, Pe);
      pn && Nn.set(H.id, pn);
    }
    return { visibleNodes: P, visibleEdges: _e, visibleIds: $, nodeSummaries: Nn };
  }, [A, N, T, _]), { visibleMatchIds: re, hiddenMatchCount: en } = u.useMemo(() => {
    if (!r) return { visibleMatchIds: null, hiddenMatchCount: 0 };
    const m = r.toLowerCase(), v = E.current;
    if (!v) return { visibleMatchIds: /* @__PURE__ */ new Set(), hiddenMatchCount: 0 };
    const $ = /* @__PURE__ */ new Set();
    let P = 0;
    for (const W of v.nodes)
      W.name.toLowerCase().includes(m) && (x.has(W.id) ? $.add(W.id) : P++);
    return { visibleMatchIds: $, hiddenMatchCount: P };
  }, [r, x]), { highlightedNodes: X, highlightedEdges: oe } = u.useMemo(() => {
    const m = Ne ?? Q;
    if (!m || !x.has(m))
      return { highlightedNodes: null, highlightedEdges: null };
    const $ = vs(m, F, x, B ? "upstream" : "downstream"), P = Ns($, F);
    return { highlightedNodes: $, highlightedEdges: P };
  }, [Ne, Q, B, F, x]);
  u.useEffect(() => {
    if (!c) return;
    let m = 0;
    const v = () => {
      const $ = E.current;
      if (!$) return;
      if ($.tick(x), !he.current && $.alpha < 0.3) {
        const fe = j.current;
        if (fe) {
          const { width: _e, height: Pe } = fe.getBoundingClientRect();
          _e > 0 && Pe > 0 && (D(En(K, _e, Pe)), he.current = !0);
        }
      }
      if (he.current && Se.current) {
        const fe = $.getNode(Se.current.nodeId);
        if (fe) {
          const _e = j.current;
          if (_e) {
            const { width: Pe, height: Nn } = _e.getBoundingClientRect();
            D((H) => ({
              scale: Math.max(H.scale, 1.2),
              x: Pe / 2 - fe.x * Math.max(H.scale, 1.2),
              y: Nn / 2 - fe.y * Math.max(H.scale, 1.2)
            })), Ee(fe.id);
          }
        }
        Se.current = null;
      }
      const P = performance.now(), W = se.current;
      W.frames++, W.lastStamp === 0 && (W.lastStamp = P);
      const ce = P - W.lastStamp;
      if (ce >= 500) {
        const fe = Math.round(W.frames * 1e3 / ce);
        Ce((_e) => _e === fe ? _e : fe), W.frames = 0, W.lastStamp = P;
      }
      if ($.isStable()) {
        f(!1);
        return;
      }
      m = requestAnimationFrame(v);
    };
    return m = requestAnimationFrame(v), () => {
      m && cancelAnimationFrame(m);
    };
  }, [c, x, K, Q]);
  const [, ie] = u.useState(0);
  u.useEffect(() => {
    if (!c || !Ne) return;
    const m = window.setInterval(() => ie((v) => v + 1), 100);
    return () => window.clearInterval(m);
  }, [c, Ne]);
  const Z = u.useRef(A);
  u.useEffect(() => {
    const m = Z.current;
    if (m === A) return;
    const v = E.current;
    if (v) {
      for (const $ of v.nodes) {
        const P = dn($.nodeType);
        if (A.has(P) && !m.has(P)) {
          let W = $.parentId;
          for (; W; ) {
            const ce = v.getNode(W);
            if (!ce) break;
            if (A.has(dn(ce.nodeType))) {
              v.seedAt($.id, ce.x, ce.y);
              break;
            }
            W = ce.parentId;
          }
        }
      }
      v.reheat(0.5), f(!0), he.current = !1;
    }
    Z.current = A;
  }, [A]);
  const de = u.useRef(N);
  u.useEffect(() => {
    if (de.current === N) return;
    const v = E.current;
    v && (v.reheat(0.3), f(!0)), de.current = N;
  }, [N]);
  const ae = u.useCallback((m, v) => {
    I(($) => {
      var W;
      const P = { ...$, [m]: v };
      return (W = E.current) == null || W.setParams(P), P;
    });
  }, []), ue = u.useCallback((m, v, $) => {
    var P, W;
    Y.current = m, (P = E.current) == null || P.pinNode(m, v, $), (W = E.current) == null || W.reheat(0.3), f(!0);
  }, []), ke = u.useCallback((m, v) => {
    var $;
    Y.current && (($ = E.current) == null || $.pinNode(Y.current, m, v));
  }, []), Te = u.useCallback(() => {
    var m;
    Y.current && ((m = E.current) == null || m.unpinNode(Y.current), Y.current = null);
  }, []), De = u.useCallback((m) => {
    const v = E.current, $ = j.current;
    if (!v || !$ || !v.getNode(m)) return;
    const W = /* @__PURE__ */ new Set([m]);
    for (const Pe of v.edges)
      Pe.sourceId === m && W.add(Pe.targetId), Pe.targetId === m && W.add(Pe.sourceId);
    const ce = v.nodes.filter((Pe) => W.has(Pe.id)), { width: fe, height: _e } = $.getBoundingClientRect();
    D(En(ce, fe, _e, 80));
  }, []), Fe = u.useCallback(() => {
    const m = j.current;
    if (!m) return;
    const { width: v, height: $ } = m.getBoundingClientRect();
    D(En(K, v, $));
  }, [K]), ve = u.useCallback(() => {
    var m;
    c ? f(!1) : ((m = E.current) == null || m.reheat(0.5), f(!0));
  }, [c]), nn = u.useCallback(() => {
    var m;
    (m = E.current) == null || m.reheat(1), f(!0);
  }, []), Le = (m) => {
    const v = new Set(s.visibleTypes);
    v.has(m) ? v.delete(m) : v.add(m), o({ ...s, visibleTypes: v });
  }, Be = (m) => {
    const v = new Set(s.selectedFiles);
    v.has(m) ? v.delete(m) : v.add(m), o({ ...s, selectedFiles: v });
  }, be = () => {
    h ? p("", !1) : (p(r, !0), setTimeout(() => {
      var m;
      return (m = pe.current) == null ? void 0 : m.focus();
    }, 50));
  }, Ae = () => i({ ...a, files: !a.files }), qe = () => i({ ...a, types: !a.types }), We = u.useCallback((m, v, $) => {
    Qe({ x: v, y: $, nodeId: m });
  }, []), Ye = u.useCallback(() => Qe(null), []), on = u.useMemo(() => {
    var v;
    if (!$e || !t) return [];
    const m = (v = E.current) == null ? void 0 : v.getNode($e.nodeId);
    return m ? [{
      label: "Show in Tree",
      onClick: () => t(m.name, dn(m.nodeType))
    }] : [];
  }, [$e, t]), Ue = (m) => {
    Ee(m);
    const v = E.current, $ = j.current;
    if (!v || !$) return;
    const P = v.getNode(m);
    if (!P) return;
    const { width: W, height: ce } = $.getBoundingClientRect();
    D({
      scale: g.scale,
      x: W / 2 - P.x * g.scale,
      y: ce / 2 - P.y * g.scale
    });
  }, tn = Ie >= 0 && Ie < K.length ? K[Ie].id : null;
  u.useEffect(() => {
    var W;
    if (!y) return;
    const { name: m, defType: v } = y, $ = Xs(v), P = E.current;
    if (P) {
      const ce = P.nodes.find((fe) => fe.name === m && fe.nodeType === $);
      ce && (Se.current = { nodeId: ce.id }, c || ((W = E.current) == null || W.reheat(0.1), f(!0)));
    }
    M();
  }, [y]), u.useEffect(() => {
    const m = ($) => {
      $.key === "Shift" && V(!0);
    }, v = ($) => {
      $.key === "Shift" && V(!1);
    };
    return window.addEventListener("keydown", m), window.addEventListener("keyup", v), () => {
      window.removeEventListener("keydown", m), window.removeEventListener("keyup", v);
    };
  }, []), u.useEffect(() => {
    const m = (v) => {
      var $;
      if (!(v.target instanceof HTMLInputElement || v.target instanceof HTMLTextAreaElement))
        switch (v.key) {
          case "Tab": {
            v.preventDefault();
            const P = K.length;
            if (P === 0) return;
            v.shiftKey ? te((W) => W > 0 ? W - 1 : P - 1) : te((W) => W < P - 1 ? W + 1 : 0);
            break;
          }
          case "Enter": {
            v.preventDefault(), tn && Ee(tn);
            break;
          }
          case "Escape": {
            if (v.preventDefault(), O) {
              Me(!1);
              break;
            }
            if (h) {
              be();
              break;
            }
            if (Q) {
              Ee(null);
              break;
            }
            break;
          }
          case "ArrowLeft":
          case "ArrowRight":
          case "ArrowUp":
          case "ArrowDown": {
            v.preventDefault();
            const P = 30, W = v.key === "ArrowLeft" ? P : v.key === "ArrowRight" ? -P : 0, ce = v.key === "ArrowUp" ? P : v.key === "ArrowDown" ? -P : 0;
            D((fe) => ({ ...fe, x: fe.x + W, y: fe.y + ce }));
            break;
          }
          case "+":
          case "=": {
            v.preventDefault(), D((P) => {
              var W, ce;
              return _n(P, (((W = j.current) == null ? void 0 : W.clientWidth) ?? 400) / 2, (((ce = j.current) == null ? void 0 : ce.clientHeight) ?? 400) / 2, 1.15);
            });
            break;
          }
          case "-":
          case "_": {
            v.preventDefault(), D((P) => {
              var W, ce;
              return _n(P, (((W = j.current) == null ? void 0 : W.clientWidth) ?? 400) / 2, (((ce = j.current) == null ? void 0 : ce.clientHeight) ?? 400) / 2, 0.85);
            });
            break;
          }
          case "f":
          case "F": {
            v.preventDefault(), Fe();
            break;
          }
          case "/": {
            v.preventDefault(), h ? ($ = pe.current) == null || $.focus() : (p(r, !0), setTimeout(() => {
              var P;
              return (P = pe.current) == null ? void 0 : P.focus();
            }, 50));
            break;
          }
          case " ": {
            v.preventDefault(), ve();
            break;
          }
          case "?": {
            v.preventDefault(), Me((P) => !P);
            break;
          }
        }
    };
    return window.addEventListener("keydown", m), () => window.removeEventListener("keydown", m);
  }, [K, tn, Q, h, r, p, O, Fe, ve]);
  const sn = e.errors || [], { shownFileErrors: wt, hiddenFileErrors: vt } = u.useMemo(() => {
    if (N.size === 0) return { shownFileErrors: sn, hiddenFileErrors: [] };
    const m = [], v = [];
    for (const $ of sn)
      N.has($.file) ? m.push($) : v.push($);
    return { shownFileErrors: m, hiddenFileErrors: v };
  }, [sn, N]), Nt = J.length > 0, xt = sn.length > 0, Tt = N.size === 0, qn = K.length, Hn = F.length;
  return /* @__PURE__ */ d("div", { className: "graph-view", ref: j, children: [
    /* @__PURE__ */ d("div", { className: "graph-canvas-area", children: [
      /* @__PURE__ */ n(
        Cs,
        {
          nodes: K,
          edges: F,
          viewport: g,
          onViewportChange: D,
          onNodeDragStart: ue,
          onNodeDragMove: ke,
          onNodeDragEnd: Te,
          onDoubleClickNode: De,
          onHoverNode: we,
          onSelectNode: Ee,
          onNodeContextMenu: We,
          highlightedNodes: X,
          highlightedEdges: oe,
          hoveredNodeId: Ne,
          selectedNodeId: Q,
          focusedNodeId: tn,
          searchMatchIds: re,
          running: c,
          showForceFields: ee,
          forceParams: b,
          activeSection: R,
          activeChargeType: U,
          activeGravityType: q,
          nodeSummaries: G
        }
      ),
      /* @__PURE__ */ n(
        Js,
        {
          hoveredNodeId: Ne,
          simRef: E,
          visibleEdges: F,
          viewport: g,
          shiftHeld: B
        }
      )
    ] }),
    /* @__PURE__ */ d("div", { className: "graph-overlay", children: [
      /* @__PURE__ */ d("div", { className: "canvas-header", children: [
        Nt && /* @__PURE__ */ d(yn, { children: [
          /* @__PURE__ */ d("div", { className: `header-files-section${a.files ? " section-pinned" : ""}`, children: [
            /* @__PURE__ */ n("div", { className: "header-files-row", children: J.map((m) => {
              const v = m.split("/").pop() || m, $ = N.has(m), P = k.has(`file:${m}`), W = [
                "header-file-tag",
                Tt ? "all-included" : $ ? "selected" : "",
                P ? "recently-changed" : ""
              ].filter(Boolean).join(" ");
              return /* @__PURE__ */ d("button", { className: W, onClick: () => Be(m), title: m, children: [
                /* @__PURE__ */ n("span", { className: "header-file-icon", children: "📄" }),
                /* @__PURE__ */ n("span", { className: "header-file-name", children: v })
              ] }, m);
            }) }),
            /* @__PURE__ */ n(
              Dn,
              {
                pinned: a.files,
                onClick: Ae,
                flashing: C.has("files"),
                label: "Files"
              }
            )
          ] }),
          /* @__PURE__ */ n("div", { className: "header-divider" })
        ] }),
        /* @__PURE__ */ d("div", { className: `header-types-section${a.types ? " section-pinned" : ""}`, children: [
          /* @__PURE__ */ n("div", { className: "header-types-row", children: kn.map((m) => {
            const v = A.has(m.type), $ = k.has(`type:${m.type}`), P = [
              "header-type-tag",
              v ? "active" : "",
              `header-type-${m.type}`,
              $ ? "recently-changed" : ""
            ].filter(Boolean).join(" ");
            return /* @__PURE__ */ d(
              "button",
              {
                className: P,
                onClick: () => Le(m.type),
                title: v ? `Hide ${m.label.toLowerCase()}` : `Show ${m.label.toLowerCase()}`,
                children: [
                  /* @__PURE__ */ n("span", { className: "header-type-icon", children: m.icon }),
                  /* @__PURE__ */ n("span", { className: "header-type-label", children: m.label })
                ]
              },
              m.type
            );
          }) }),
          /* @__PURE__ */ n(
            Dn,
            {
              pinned: a.types,
              onClick: qe,
              flashing: C.has("types"),
              label: "Types"
            }
          )
        ] }),
        /* @__PURE__ */ n("div", { className: "header-divider" }),
        /* @__PURE__ */ n("div", { className: "header-controls-section", children: /* @__PURE__ */ d("div", { className: `header-search ${h ? "active" : ""}`, children: [
          /* @__PURE__ */ n("button", { className: "header-search-toggle", onClick: be, title: "Search nodes (/)", children: /* @__PURE__ */ n(rt, { size: 14 }) }),
          h && /* @__PURE__ */ n(
            "input",
            {
              ref: pe,
              className: "header-search-input",
              type: "text",
              placeholder: "Search nodes...",
              value: r,
              onChange: (m) => p(m.target.value, !0),
              onKeyDown: (m) => {
                m.key === "Escape" && be();
              }
            }
          ),
          en > 0 && /* @__PURE__ */ d("span", { className: "header-search-badge", title: `${en} match${en !== 1 ? "es" : ""} hidden by filters`, children: [
            "+",
            en
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ d("div", { className: "graph-toolbar", children: [
        /* @__PURE__ */ d("span", { className: "graph-toolbar-count", children: [
          qn,
          " node",
          qn !== 1 ? "s" : "",
          ", ",
          Hn,
          " edge",
          Hn !== 1 ? "s" : "",
          c && /* @__PURE__ */ d("span", { className: "graph-toolbar-fps", title: "Simulation frames per second", children: [
            "  ·  ",
            ge,
            " fps"
          ] })
        ] }),
        Q && t && (() => {
          var v;
          const m = (v = E.current) == null ? void 0 : v.getNode(Q);
          return m ? /* @__PURE__ */ n(
            "button",
            {
              className: "graph-toolbar-btn",
              onClick: () => t(m.name, dn(m.nodeType)),
              title: "Show in Tree view",
              children: "Show in Tree"
            }
          ) : null;
        })(),
        /* @__PURE__ */ n("button", { className: "graph-toolbar-btn", onClick: Fe, title: "Fit to view (F)", children: "Fit" }),
        /* @__PURE__ */ n(
          "button",
          {
            className: `graph-toolbar-btn ${c ? "active" : ""}`,
            onClick: ve,
            title: c ? "Pause simulation (Space)" : "Resume simulation (Space)",
            children: c ? "Pause" : "Play"
          }
        )
      ] }),
      re && re.size > 0 && h && /* @__PURE__ */ n("div", { className: "graph-search-results", children: K.filter((m) => re.has(m.id)).map((m) => /* @__PURE__ */ d(
        "button",
        {
          className: "graph-search-result",
          onClick: () => Ue(m.id),
          children: [
            /* @__PURE__ */ n("span", { className: "graph-search-result-type", children: m.nodeType }),
            /* @__PURE__ */ n("span", { className: "graph-search-result-name", children: m.name })
          ]
        },
        m.id
      )) }),
      xt && /* @__PURE__ */ n(Zs, { shownFileErrors: wt, hiddenFileErrors: vt })
    ] }),
    /* @__PURE__ */ n(
      Ks,
      {
        params: b,
        onParamChange: ae,
        running: c,
        onToggleRunning: ve,
        onReheat: nn,
        showForceFields: ee,
        onToggleForceFields: () => ye((m) => !m),
        onActiveSection: l,
        onActiveChargeType: ne,
        onActiveGravityType: xe
      }
    ),
    $e && on.length > 0 && /* @__PURE__ */ n(
      Gs,
      {
        x: $e.x,
        y: $e.y,
        items: on,
        onClose: Ye
      }
    ),
    O && /* @__PURE__ */ d("div", { className: "graph-shortcuts-panel", children: [
      /* @__PURE__ */ d("div", { className: "graph-shortcuts-title", children: [
        "Keyboard Shortcuts",
        /* @__PURE__ */ n("button", { className: "graph-shortcuts-close", onClick: () => Me(!1), children: "×" })
      ] }),
      /* @__PURE__ */ d("div", { className: "graph-shortcuts-list", children: [
        /* @__PURE__ */ n(He, { keys: "Tab / Shift+Tab", desc: "Cycle focus" }),
        /* @__PURE__ */ n(He, { keys: "Enter", desc: "Select focused node" }),
        /* @__PURE__ */ n(He, { keys: "Escape", desc: "Deselect / close" }),
        /* @__PURE__ */ n(He, { keys: "Arrow keys", desc: "Pan viewport" }),
        /* @__PURE__ */ n(He, { keys: "+ / -", desc: "Zoom in / out" }),
        /* @__PURE__ */ n(He, { keys: "F", desc: "Fit to view" }),
        /* @__PURE__ */ n(He, { keys: "/", desc: "Open search" }),
        /* @__PURE__ */ n(He, { keys: "Space", desc: "Toggle simulation" }),
        /* @__PURE__ */ n(He, { keys: "Shift + hover", desc: "Upstream deps" }),
        /* @__PURE__ */ n(He, { keys: "?", desc: "This panel" })
      ] })
    ] })
  ] });
}
function Js({ hoveredNodeId: e, simRef: t, visibleEdges: s, viewport: o, shiftHeld: a }) {
  var N, g;
  if (!e) return null;
  const i = t.current;
  if (!i) return null;
  const r = i.getNode(e);
  if (!r) return null;
  const h = r.parentId ? (N = i.getNode(r.parentId)) == null ? void 0 : N.name : void 0, p = kn.find((D) => D.type === dn(r.nodeType)), y = (g = r.sourceFile) == null ? void 0 : g.split("/").pop();
  let M = 0, C = 0;
  for (const D of s)
    D.edgeType !== "containment" && (D.sourceId === e && M++, D.targetId === e && C++);
  const [w, A] = Ve(o, r.x, r.y);
  return /* @__PURE__ */ d("div", { className: "graph-hover-tooltip", style: { left: w, top: A }, children: [
    /* @__PURE__ */ d("div", { className: "tooltip-identity", children: [
      p && /* @__PURE__ */ n("span", { className: "tooltip-type-icon", children: p.icon }),
      /* @__PURE__ */ n("span", { className: "tooltip-name", children: r.name })
    ] }),
    h && /* @__PURE__ */ n("div", { className: "tooltip-parent", children: h }),
    y && /* @__PURE__ */ n("div", { className: "tooltip-file", children: y }),
    (M > 0 || C > 0) && /* @__PURE__ */ d("div", { className: "tooltip-connections", children: [
      M > 0 && /* @__PURE__ */ d("span", { className: "tooltip-conn-out", children: [
        "→",
        M
      ] }),
      C > 0 && /* @__PURE__ */ d("span", { className: "tooltip-conn-in", children: [
        "←",
        C
      ] })
    ] }),
    /* @__PURE__ */ n("div", { className: "tooltip-direction", children: a ? "dependents" : "dependencies" })
  ] });
}
function He({ keys: e, desc: t }) {
  return /* @__PURE__ */ d("div", { className: "graph-shortcut-row", children: [
    /* @__PURE__ */ n("kbd", { className: "graph-shortcut-key", children: e }),
    /* @__PURE__ */ n("span", { className: "graph-shortcut-desc", children: t })
  ] });
}
function Zs({ shownFileErrors: e, hiddenFileErrors: t }) {
  const [s, o] = u.useState(!0), a = e.length + t.length;
  return /* @__PURE__ */ d("div", { className: "graph-errors-header", children: [
    /* @__PURE__ */ d("div", { className: "graph-errors-bar", onClick: () => o(!s), children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: s ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "graph-errors-icon", children: L.error.icon }),
      /* @__PURE__ */ d("span", { className: "graph-errors-title", children: [
        a,
        " ",
        a === 1 ? "error" : "errors"
      ] })
    ] }),
    s && /* @__PURE__ */ d("div", { className: "graph-errors-body", children: [
      e.map((i, r) => /* @__PURE__ */ d("div", { className: "graph-error-item", children: [
        /* @__PURE__ */ n("span", { className: "graph-error-file", children: i.file.split("/").pop() }),
        /* @__PURE__ */ n("pre", { className: "graph-error-msg", children: i.stderr || i.error })
      ] }, `s${r}`)),
      t.length > 0 && /* @__PURE__ */ d("div", { className: "graph-error-hidden-label", children: [
        t.length,
        " error",
        t.length !== 1 ? "s" : "",
        " in hidden files"
      ] })
    ] })
  ] });
}
function Qs(e, t, s, o) {
  switch (o.kind) {
    case "manual":
      return eo(e, t, s);
    case "focus":
      return no(e, s, o.target);
  }
}
function eo(e, t, s) {
  const o = lt(e);
  return s.files || (o.selectedFiles = new Set(t.selectedFiles)), s.types || (o.visibleTypes = new Set(t.visibleTypes)), {
    filter: An(o, e) ? e : o,
    overriddenPins: /* @__PURE__ */ new Set()
  };
}
function no(e, t, s) {
  const o = lt(e), a = /* @__PURE__ */ new Set();
  return o.visibleTypes.has(s.defType) || (o.visibleTypes.add(s.defType), t.types && a.add("types")), s.sourceFile && e.selectedFiles.size > 0 && !e.selectedFiles.has(s.sourceFile) && (o.selectedFiles.add(s.sourceFile), t.files && a.add("files")), {
    filter: An(o, e) ? e : o,
    overriddenPins: a
  };
}
const Fn = "temporal-skills-visualizer-state";
let rn = null, tt = !1;
function kt() {
  if (tt) return rn;
  tt = !0;
  const e = window;
  if (e.__twfVsCodeApi)
    return rn = e.__twfVsCodeApi, rn;
  if (typeof e.acquireVsCodeApi == "function")
    try {
      return rn = e.acquireVsCodeApi(), e.__twfVsCodeApi = rn, rn;
    } catch {
      return null;
    }
  return null;
}
function to() {
  const e = kt();
  if (e) {
    const t = e.getState();
    if (t && typeof t == "object") {
      const o = t[Fn];
      if (o && typeof o == "object")
        return o;
    }
    return {};
  }
  try {
    const t = localStorage.getItem(Fn);
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}
function so(e) {
  const t = kt();
  if (t) {
    const s = t.getState(), o = s && typeof s == "object" ? { ...s } : {};
    o[Fn] = e, t.setState(o);
    return;
  }
  try {
    localStorage.setItem(Fn, JSON.stringify(e));
  } catch {
  }
}
const Ge = u.createContext({
  workflows: /* @__PURE__ */ new Map(),
  activities: /* @__PURE__ */ new Map(),
  workers: /* @__PURE__ */ new Map(),
  nexusServices: /* @__PURE__ */ new Map(),
  namespaces: /* @__PURE__ */ new Map()
}), vn = u.createContext({
  signals: /* @__PURE__ */ new Map(),
  queries: /* @__PURE__ */ new Map(),
  updates: /* @__PURE__ */ new Map()
}), bt = u.createContext({
  callers: /* @__PURE__ */ new Map(),
  workerOf: /* @__PURE__ */ new Map(),
  namespaceOf: /* @__PURE__ */ new Map(),
  navigateTo: () => {
  }
}), oo = kn.filter((e) => e.defaultOn).map((e) => e.type);
function st(e) {
  return {
    selectedFiles: e.focusedFile ? /* @__PURE__ */ new Set([e.focusedFile]) : /* @__PURE__ */ new Set(),
    visibleTypes: new Set(oo)
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
function ro({ ast: e, onOpenFile: t, onRefocus: s, className: o, style: a }) {
  const i = u.useMemo(() => to(), []), [r, h] = u.useState("tree"), [p, y] = u.useState(
    () => at(i.treeFilter, st(e))
  ), [M, C] = u.useState(
    () => at(i.graphFilter, st(e))
  ), [w, A] = u.useState(() => i.treePins ?? ot), [N, g] = u.useState(() => i.graphPins ?? ot), [D, c] = u.useState(i.searchQuery ?? ""), [f, b] = u.useState(!1), [I, E] = u.useState(null), [Y, he] = u.useState(/* @__PURE__ */ new Set()), [j, Se] = u.useState(/* @__PURE__ */ new Set());
  u.useEffect(() => {
    so({
      treeFilter: ct(p),
      graphFilter: ct(M),
      treePins: w,
      graphPins: N,
      searchQuery: D
    });
  }, [p, M, w, N, D]), u.useEffect(() => {
    const B = /* @__PURE__ */ new Set();
    for (const ee of e.definitions)
      ee.sourceFile && B.add(ee.sourceFile);
    const V = (ee) => {
      const ye = new Set([...ee.selectedFiles].filter((R) => B.has(R)));
      return ye.size === ee.selectedFiles.size ? ee : { ...ee, selectedFiles: ye };
    };
    y(V), C(V);
  }, [e.definitions]), u.useEffect(() => {
    w.files || e.focusedFile && y((B) => {
      const V = /* @__PURE__ */ new Set([e.focusedFile]);
      return B.selectedFiles.size === 1 && B.selectedFiles.has(e.focusedFile) ? B : { ...B, selectedFiles: V };
    });
  }, [e.focusedFile, w.files]);
  const ge = u.useMemo(() => {
    const B = /* @__PURE__ */ new Map(), V = /* @__PURE__ */ new Map(), ee = /* @__PURE__ */ new Map(), ye = /* @__PURE__ */ new Map(), R = /* @__PURE__ */ new Map();
    for (const l of e.definitions)
      l.type === "workflowDef" ? B.set(l.name, l) : l.type === "activityDef" ? V.set(l.name, l) : l.type === "workerDef" ? ee.set(l.name, l) : l.type === "nexusServiceDef" ? ye.set(l.name, l) : l.type === "namespaceDef" && R.set(l.name, l);
    return { workflows: B, activities: V, workers: ee, nexusServices: ye, namespaces: R };
  }, [e]), Ce = u.useCallback((B, V) => {
    if (B === r && V.kind === "manual") return;
    const ee = B === "tree" ? p : M, ye = B === "tree" ? M : p, R = B === "tree" ? w : N, { filter: l, overriddenPins: U } = Qs(ee, ye, R, V);
    B === "tree" ? (l !== ee && y(l), he(U)) : (l !== ee && C(l), Se(U)), V.kind === "focus" && E({ name: V.target.name, defType: V.target.defType }), h(B);
  }, [r, p, M, w, N]), se = u.useCallback((B, V) => {
    const ee = e.definitions.find((ye) => ye.name === B && ye.type === V);
    Ce("graph", {
      kind: "focus",
      target: { name: B, defType: V, sourceFile: ee == null ? void 0 : ee.sourceFile }
    });
  }, [e.definitions, Ce]), Ne = u.useCallback((B, V) => {
    const ee = e.definitions.find((ye) => ye.name === B && ye.type === V);
    Ce("tree", {
      kind: "focus",
      target: { name: B, defType: V, sourceFile: ee == null ? void 0 : ee.sourceFile }
    });
  }, [e.definitions, Ce]), we = u.useCallback(() => E(null), []), Q = u.useCallback((B, V) => {
    c(B), b(V);
  }, []), Ee = u.useCallback(() => {
    he((B) => B.size === 0 ? B : /* @__PURE__ */ new Set());
  }, []), Ie = u.useCallback(() => {
    Se((B) => B.size === 0 ? B : /* @__PURE__ */ new Set());
  }, []);
  u.useEffect(() => {
    p.selectedFiles.size === 1 && t && t(p.selectedFiles.values().next().value);
  }, [p.selectedFiles, t]);
  const te = o ? `view-shell ${o}` : "view-shell";
  return /* @__PURE__ */ n(Ge.Provider, { value: ge, children: /* @__PURE__ */ d("div", { className: te, style: a, onClick: s, children: [
    /* @__PURE__ */ d("div", { className: "tab-bar", children: [
      /* @__PURE__ */ n(
        "button",
        {
          className: `tab-bar-btn ${r === "tree" ? "active" : ""}`,
          onClick: () => Ce("tree", { kind: "manual" }),
          children: "Tree"
        }
      ),
      /* @__PURE__ */ n(
        "button",
        {
          className: `tab-bar-btn ${r === "graph" ? "active" : ""}`,
          onClick: () => Ce("graph", { kind: "manual" }),
          children: "Graph"
        }
      )
    ] }),
    r === "tree" ? /* @__PURE__ */ n(
      fs,
      {
        ast: e,
        onShowInGraph: se,
        filter: p,
        onFilterChange: y,
        pins: w,
        onPinsChange: A,
        searchQuery: D,
        searchActive: f,
        onSearchChange: Q,
        pendingFocus: I,
        onFocusConsumed: we,
        overriddenPins: Y,
        onOverriddenPinsConsumed: Ee
      }
    ) : /* @__PURE__ */ n(
      js,
      {
        ast: e,
        onShowInTree: Ne,
        filter: M,
        onFilterChange: C,
        pins: N,
        onPinsChange: g,
        searchQuery: D,
        searchActive: f,
        onSearchChange: Q,
        pendingFocus: I,
        onFocusConsumed: we,
        overriddenPins: j,
        onOverriddenPinsConsumed: Ie
      }
    )
  ] }) });
}
export {
  ro as Visualizer
};
//# sourceMappingURL=lib.js.map
