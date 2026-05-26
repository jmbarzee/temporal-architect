var Ct = Object.defineProperty;
var Et = (e, t, s) => t in e ? Ct(e, t, { enumerable: !0, configurable: !0, writable: !0, value: s }) : e[t] = s;
var rn = (e, t, s) => Et(e, typeof t != "symbol" ? t + "" : t, s);
import { jsxs as i, jsx as n, Fragment as wn } from "react/jsx-runtime";
import d from "react";
function Wn(e, t) {
  if (e.selectedFiles.size !== t.selectedFiles.size || e.visibleTypes.size !== t.visibleTypes.size) return !1;
  for (const s of e.selectedFiles) if (!t.selectedFiles.has(s)) return !1;
  for (const s of e.visibleTypes) if (!t.visibleTypes.has(s)) return !1;
  return !0;
}
function dt(e) {
  return {
    selectedFiles: new Set(e.selectedFiles),
    visibleTypes: new Set(e.visibleTypes)
  };
}
function ut({ size: e = 16 }) {
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
function Dt({ size: e = 14 }) {
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
function At({ size: e = 16 }) {
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
const P = {
  workflow: { icon: "⚙⚙", label: "Workflow", cssVarPrefix: "workflow", SvgIcon: At },
  activity: { icon: "⚙", label: "Activity", cssVarPrefix: "activity", SvgIcon: Dt },
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
}, vn = [
  { type: "namespaceDef", icon: P.namespace.icon, label: "Namespaces", defaultOn: !1 },
  { type: "workerDef", icon: P.worker.icon, label: "Workers", defaultOn: !0 },
  { type: "nexusServiceDef", icon: P.nexusService.icon, label: "Nexus Services", defaultOn: !1 },
  // Synthetic def type — operations live inside nexusServiceDef in the AST,
  // but render as their own L3 nodes (parented to their service).
  { type: "nexusOperationDef", icon: P.nexusOperation.icon, label: "Nexus Operations", defaultOn: !1 },
  { type: "workflowDef", icon: P.workflow.icon, label: "Workflows", defaultOn: !0 },
  { type: "activityDef", icon: P.activity.icon, label: "Activities", defaultOn: !1 }
], Jn = new Map(vn.map((e, t) => [e.type, t])), Ft = {
  signalDecl: { icon: P.signal.icon, keyword: "signal", cssClass: "declaration-signal" },
  queryDecl: { icon: P.query.icon, keyword: "query", cssClass: "declaration-query" },
  updateDecl: { icon: P.update.icon, keyword: "update", cssClass: "declaration-update" }
}, It = {
  complete: P.closeComplete,
  fail: P.closeFail,
  continue_as_new: P.closeContinueAsNew
}, Ge = {
  timer: P.timer,
  signal: P.signal,
  update: P.update,
  activity: P.activity,
  workflow: P.workflow,
  nexus: P.nexusCall,
  ident: P.conditionSet
}, Lt = {
  workflow: P.workflow,
  activity: P.activity,
  service: P.nexusService
};
function Nn({ kind: e, size: t }) {
  const s = P[e];
  return s.SvgIcon ? /* @__PURE__ */ n(s.SvgIcon, { size: t }) : /* @__PURE__ */ n(wn, { children: s.icon });
}
function pe(e = !1, t = !0) {
  const [s, o] = d.useState(e);
  return [s, () => {
    t && o((l) => !l);
  }];
}
function On({ decl: e }) {
  const t = e.body && e.body.length > 0, [s, o] = pe(!1, t), { icon: a, keyword: l, cssClass: r } = Ft[e.type];
  let h = `${e.name}(${e.params})`;
  return "returnType" in e && e.returnType && (h += ` → ${e.returnType}`), /* @__PURE__ */ i("div", { className: `declaration ${r} ${s ? "expanded" : ""}`, children: [
    /* @__PURE__ */ i("div", { className: "declaration-header", onClick: o, children: [
      t && /* @__PURE__ */ n("span", { className: "block-toggle", children: s ? "▼" : "▶" }),
      !t && /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "declaration-icon", children: a }),
      /* @__PURE__ */ n("span", { className: "declaration-keyword", children: l }),
      /* @__PURE__ */ n("span", { className: "declaration-name", children: h })
    ] }),
    s && t && /* @__PURE__ */ n("div", { className: "declaration-body", children: e.body.map((u) => /* @__PURE__ */ n(Be, { statement: u }, `${u.line}:${u.column}`)) })
  ] });
}
function Pn({ def: e }) {
  var M, g, F, w;
  const [t, s] = pe(), [o, a] = pe(), [l, r] = pe(), [h, u] = pe(), k = e.state && (e.state.conditions && e.state.conditions.length > 0 || e.state.rawStmts && e.state.rawStmts.length > 0), C = e.signals && e.signals.length > 0, A = e.queries && e.queries.length > 0, N = e.updates && e.updates.length > 0, I = (((g = (M = e.state) == null ? void 0 : M.conditions) == null ? void 0 : g.length) || 0) + (((w = (F = e.state) == null ? void 0 : F.rawStmts) == null ? void 0 : w.length) || 0);
  return /* @__PURE__ */ i(wn, { children: [
    k && /* @__PURE__ */ i("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ i("div", { className: "declarations-header", onClick: s, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-condition", children: P.conditionSet.icon }),
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
          /* @__PURE__ */ n("span", { className: "declaration-icon", children: P.conditionSet.icon }),
          /* @__PURE__ */ n("span", { className: "declaration-keyword", children: "condition" }),
          /* @__PURE__ */ n("span", { className: "declaration-name", children: x.name })
        ] }) }, `${x.line}:${x.column}`)),
        (e.state.rawStmts || []).map((x) => /* @__PURE__ */ n("div", { className: "declaration declaration-raw-state", children: /* @__PURE__ */ i("div", { className: "declaration-header", children: [
          /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ n("span", { className: "declaration-icon", children: P.raw.icon }),
          /* @__PURE__ */ n("span", { className: "declaration-name", children: x.text })
        ] }) }, `${x.line}:${x.column}`))
      ] })
    ] }),
    C && /* @__PURE__ */ i("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ i("div", { className: "declarations-header", onClick: a, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: o ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-signal", children: P.signal.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "signals" }),
        /* @__PURE__ */ i("span", { className: "declarations-count", children: [
          "(",
          e.signals.length,
          ")"
        ] })
      ] }),
      o && /* @__PURE__ */ n("div", { className: "block-declarations", children: e.signals.map((x) => /* @__PURE__ */ n(On, { decl: x }, `${x.line}:${x.column}`)) })
    ] }),
    A && /* @__PURE__ */ i("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ i("div", { className: "declarations-header", onClick: r, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-query", children: P.query.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "queries" }),
        /* @__PURE__ */ i("span", { className: "declarations-count", children: [
          "(",
          e.queries.length,
          ")"
        ] })
      ] }),
      l && /* @__PURE__ */ n("div", { className: "block-declarations", children: e.queries.map((x) => /* @__PURE__ */ n(On, { decl: x }, `${x.line}:${x.column}`)) })
    ] }),
    N && /* @__PURE__ */ i("div", { className: "block-declarations-group", children: [
      /* @__PURE__ */ i("div", { className: "declarations-header", onClick: u, children: [
        /* @__PURE__ */ n("span", { className: "block-toggle", children: h ? "▼" : "▶" }),
        /* @__PURE__ */ n("span", { className: "declarations-icon declaration-update", children: P.update.icon }),
        /* @__PURE__ */ n("span", { className: "declarations-label", children: "updates" }),
        /* @__PURE__ */ i("span", { className: "declarations-count", children: [
          "(",
          e.updates.length,
          ")"
        ] })
      ] }),
      h && /* @__PURE__ */ n("div", { className: "block-declarations", children: e.updates.map((x) => /* @__PURE__ */ n(On, { decl: x }, `${x.line}:${x.column}`)) })
    ] }),
    /* @__PURE__ */ n("div", { children: (e.body || []).map((x) => /* @__PURE__ */ n(Be, { statement: x }, `${x.line}:${x.column}`)) })
  ] });
}
function Hn({ def: e }) {
  const [t, s] = pe(), o = `${e.name}(${e.params})${e.returnType ? ` → ${e.returnType}` : ""}`, a = d.useMemo(() => {
    const l = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), h = /* @__PURE__ */ new Map();
    for (const u of e.signals || []) l.set(u.name, u);
    for (const u of e.queries || []) r.set(u.name, u);
    for (const u of e.updates || []) h.set(u.name, u);
    return { signals: l, queries: r, updates: h };
  }, [e]);
  return /* @__PURE__ */ n(Tn.Provider, { value: a, children: /* @__PURE__ */ i("div", { className: `block block-workflow-call ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(Nn, { kind: "workflow" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "workflow" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: o })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: /* @__PURE__ */ n(Pn, { def: e }) })
  ] }) });
}
function Gn({ body: e }) {
  const [t, s] = pe(!0);
  return /* @__PURE__ */ i("div", { className: `block block-sync-body ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "handler" })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: e.map((o) => /* @__PURE__ */ n(Be, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function Ze({ defName: e, defType: t, showDefinition: s }) {
  const o = d.useContext(Nt), a = [];
  if (s && a.push({ label: "Def", targets: [s] }), e && t) {
    const r = `${t}:${e}`, h = o.callers.get(r);
    if (h && h.length > 0 && a.push({ label: "Callers", targets: h.map((u) => ({ name: u.defName, type: u.defType })) }), t === "workflowDef" || t === "activityDef" || t === "nexusServiceDef") {
      const u = o.workerOf.get(r);
      u && u.length > 0 && a.push({ label: "Worker", targets: u.map((k) => ({ name: k, type: "workerDef" })) });
    }
    if (t === "workerDef") {
      const u = o.namespaceOf.get(r);
      u && u.length > 0 && a.push({ label: "NS", targets: u.map((k) => ({ name: k, type: "namespaceDef" })) });
    }
  }
  const l = e && t && o.showInGraph ? () => o.showInGraph(e, t) : null;
  return a.length === 0 && !l ? null : /* @__PURE__ */ i("div", { className: "ctx-nav-buttons", onClick: (r) => r.stopPropagation(), children: [
    a.map((r) => /* @__PURE__ */ n(Wt, { action: r, onNavigate: o.navigateTo }, r.label)),
    l && /* @__PURE__ */ n("button", { className: "ctx-nav-btn", onClick: l, title: "Show in Graph view", children: "Graph" })
  ] });
}
function Wt({ action: e, onNavigate: t }) {
  const [s, o] = d.useState(!1), a = d.useRef(null);
  return d.useEffect(() => {
    if (!s) return;
    const r = (h) => {
      a.current && !a.current.contains(h.target) && o(!1);
    };
    return document.addEventListener("mousedown", r), () => document.removeEventListener("mousedown", r);
  }, [s]), d.useEffect(() => {
    if (!s) return;
    const r = (h) => {
      h.key === "Escape" && (h.stopPropagation(), o(!1));
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
function Pt({ stmt: e }) {
  const s = d.useContext(ze).activities.get(e.name), o = !!s, [a, l] = pe(!1, o), r = Kt(e);
  return /* @__PURE__ */ i("div", { className: `block block-activity ${a ? "expanded" : "collapsed"} ${o ? "" : "block-unresolved"}`, children: [
    o && /* @__PURE__ */ n(Ze, { showDefinition: { name: e.name, type: "activityDef" } }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: l, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: a ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(Nn, { kind: "activity" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "activity" }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: r, children: r }),
      !o && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    a && o && /* @__PURE__ */ n("div", { className: "block-body", children: (s.body || []).length > 0 ? (s.body || []).map((h) => /* @__PURE__ */ n(Be, { statement: h }, `${h.line}:${h.column}`)) : /* @__PURE__ */ n("div", { className: "block-empty-body", children: "No implementation defined" }) })
  ] });
}
function Rt({ stmt: e }) {
  const s = d.useContext(ze).workflows.get(e.name), o = !!s, [a, l] = pe(!1, o), r = e.mode === "detach" ? "detach " : "", h = _t(e);
  return /* @__PURE__ */ i("div", { className: `block block-workflow-call block-mode-${e.mode} ${a ? "expanded" : "collapsed"} ${o ? "" : "block-unresolved"}`, children: [
    o && /* @__PURE__ */ n(Ze, { showDefinition: { name: e.name, type: "workflowDef" } }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: l, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: a ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(Nn, { kind: "workflow" }) }),
      /* @__PURE__ */ i("span", { className: "block-keyword", children: [
        r,
        "workflow"
      ] }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: h, children: h }),
      !o && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    a && o && /* @__PURE__ */ n("div", { className: "block-body", children: /* @__PURE__ */ n(Ot, { def: s, children: /* @__PURE__ */ n(Pn, { def: s }) }) })
  ] });
}
function Ot({ def: e, children: t }) {
  const s = d.useMemo(() => {
    const o = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map();
    for (const r of e.signals || []) o.set(r.name, r);
    for (const r of e.queries || []) a.set(r.name, r);
    for (const r of e.updates || []) l.set(r.name, r);
    return { signals: o, queries: a, updates: l };
  }, [e]);
  return /* @__PURE__ */ n(Tn.Provider, { value: s, children: t });
}
function Bt({ stmt: e }) {
  var N;
  const t = d.useContext(ze), s = t.nexusServices.get(e.service), o = (N = s == null ? void 0 : s.operations) == null ? void 0 : N.find((I) => I.name === e.operation), a = !!o, l = (o == null ? void 0 : o.opType) === "async" && o.workflowName ? t.workflows.get(o.workflowName) : void 0, r = (o == null ? void 0 : o.opType) === "async" ? !!l : !!(o != null && o.body && o.body.length > 0), [h, u] = pe(!1, r), k = e.detach ? "detach " : "", C = `${e.endpoint} ${e.service}.${e.operation}(${e.args})`, A = e.result ? ` → ${e.result}` : "";
  return /* @__PURE__ */ i("div", { className: `block block-nexus-call ${e.detach ? "block-mode-detach" : ""} ${h ? "expanded" : "collapsed"} ${!a && e.service ? "block-unresolved" : ""}`, children: [
    s && /* @__PURE__ */ n(Ze, { showDefinition: { name: e.service, type: "nexusServiceDef" } }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: u, children: [
      r ? /* @__PURE__ */ n("span", { className: "block-toggle", children: h ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-call", children: P.nexusCall.icon }),
      /* @__PURE__ */ i("span", { className: "block-keyword", children: [
        k,
        "nexus"
      ] }),
      /* @__PURE__ */ i("span", { className: "block-signature", title: `${C}${A}`, children: [
        C,
        A
      ] }),
      !a && e.service && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    h && r && /* @__PURE__ */ n("div", { className: "block-body", children: (o == null ? void 0 : o.opType) === "async" && l ? /* @__PURE__ */ n(Hn, { def: l }) : o != null && o.body ? /* @__PURE__ */ n(Gn, { body: o.body }) : /* @__PURE__ */ n("div", { className: "block-empty-body", children: "No implementation defined" }) })
  ] });
}
function Kt(e) {
  let t = `${e.name}(${e.args})`;
  return e.result && (t += ` → ${e.result}`), t;
}
function _t(e) {
  let t = `${e.name}(${e.args})`;
  return e.result && (t += ` → ${e.result}`), t;
}
function pt(e, t, s) {
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
      const a = e.workflow.mode === "detach" ? "detach " : "", l = `${e.workflow.name || ""}(${e.workflow.args || ""})`, r = e.workflow.result ? ` → ${e.workflow.result}` : "", h = t.workflows.get(e.workflow.name || "");
      return { icon: Ge.workflow.icon, keyword: `${a}workflow`, signature: `${l}${r}`, expandableDef: h, isUnresolved: !h };
    }
    case "nexus": {
      const a = e.nexus.detach ? "detach " : "", l = `${e.nexus.endpoint || ""} ${e.nexus.service || ""}.${e.nexus.operation || ""}(${e.nexus.args || ""})`, r = e.nexus.result ? ` → ${e.nexus.result}` : "", h = t.nexusServices.get(e.nexus.service || ""), u = (o = h == null ? void 0 : h.operations) == null ? void 0 : o.find((C) => C.name === (e.nexus.operation || "")), k = !!(e.nexus.service && !h);
      if ((u == null ? void 0 : u.opType) === "async" && u.workflowName) {
        const C = t.workflows.get(u.workflowName);
        if (C)
          return { icon: Ge.nexus.icon, keyword: `${a}nexus`, signature: `${l}${r}`, nexusAsyncWorkflow: C, isUnresolved: k };
      } else if ((u == null ? void 0 : u.opType) === "sync" && u.body)
        return { icon: Ge.nexus.icon, keyword: `${a}nexus`, signature: `${l}${r}`, nexusSyncBody: u.body, isUnresolved: k };
      return { icon: Ge.nexus.icon, keyword: `${a}nexus`, signature: `${l}${r}`, isUnresolved: k };
    }
    case "ident": {
      const a = e.ident.name || "", l = e.ident.result ? ` → ${e.ident.result}` : "";
      return { icon: Ge.ident.icon, keyword: "", signature: `${a}${l}`, isUnresolved: !1 };
    }
    default:
      return { icon: "?", keyword: "", signature: "", isUnresolved: !1 };
  }
}
function Yt(e, t, s) {
  var l, r;
  const o = pt(e.target, t, s), a = e.target.kind === "workflow" && ((l = e.target.workflow) == null ? void 0 : l.mode) === "detach" || e.target.kind === "nexus" && ((r = e.target.nexus) == null ? void 0 : r.detach);
  return {
    ...o,
    // Activity/workflow/nexus use SVG icons at block level, not text icons
    icon: e.target.kind === "activity" || e.target.kind === "workflow" || e.target.kind === "nexus" ? "" : o.icon,
    keyword: o.keyword ? `await ${o.keyword}` : "await",
    blockClass: `block-await-stmt block-await-stmt-${e.target.kind}${a ? " block-mode-detach" : ""}`
  };
}
function Vt(e, t, s) {
  var a, l;
  if (e.awaitAll != null)
    return { contentClass: "tagged-await-all", icon: P.awaitAll.icon, keyword: "await all", signature: `${((l = (a = e.awaitAll) == null ? void 0 : a.body) == null ? void 0 : l.length) || 0} branch(es)`, isUnresolved: !1 };
  const o = pt(e.target, t, s);
  return {
    icon: o.icon,
    keyword: o.keyword,
    signature: o.signature,
    isUnresolved: o.isUnresolved,
    contentClass: `tagged-${e.target.kind}`
  };
}
function qt({ stmt: e }) {
  const t = d.useContext(ze), s = d.useContext(Tn), { icon: o, keyword: a, signature: l, blockClass: r, expandableDef: h, nexusAsyncWorkflow: u, nexusSyncBody: k, isUnresolved: C } = Yt(e, t, s), A = !!(h || u || k), [N, I] = pe(!1, A);
  return /* @__PURE__ */ i("div", { className: `block ${r} ${N ? "expanded" : "collapsed"} ${C ? "block-unresolved" : ""}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: I, children: [
      A ? /* @__PURE__ */ n("span", { className: "block-toggle", children: N ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: o }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: a }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: l }),
      C && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    N && A && /* @__PURE__ */ n("div", { className: "block-body", children: u ? /* @__PURE__ */ n(Hn, { def: u }) : k ? /* @__PURE__ */ n(Gn, { body: k }) : h && (h.body || []).length > 0 ? (h.body || []).map((M) => /* @__PURE__ */ n(Be, { statement: M }, `${M.line}:${M.column}`)) : /* @__PURE__ */ n("div", { className: "block-empty-body", children: "No implementation defined" }) })
  ] });
}
function ht({ stmt: e }) {
  const [t, s] = pe(!0);
  return /* @__PURE__ */ i("div", { className: `block block-await-all ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: P.awaitAll.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "await all" }),
      /* @__PURE__ */ i("span", { className: "block-signature", children: [
        (e.body || []).length,
        " branch(es)"
      ] })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: (e.body || []).map((o) => /* @__PURE__ */ n(Be, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function Ht({ stmt: e }) {
  const [t, s] = pe(!0), o = e.cases.length === 1 ? "case" : "cases";
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
    t && /* @__PURE__ */ n("div", { className: "block-body", children: e.cases.map((a) => /* @__PURE__ */ n(Gt, { awaitCase: a }, `${a.line}:${a.column}`)) })
  ] });
}
function Gt({ awaitCase: e }) {
  const t = d.useContext(ze), s = d.useContext(Tn), o = e.body && e.body.length > 0, a = o || !!e.awaitAll, [l, r] = pe(!1, a), { contentClass: h, icon: u, keyword: k, signature: C, isUnresolved: A } = Vt(e, t, s);
  return /* @__PURE__ */ i("div", { className: `tagged-composite ${l ? "expanded" : ""} ${A ? "tagged-unresolved" : ""}`, children: [
    /* @__PURE__ */ n("div", { className: "tagged-tag", children: /* @__PURE__ */ n("span", { className: "tagged-tag-label", children: "option" }) }),
    /* @__PURE__ */ i("div", { className: `tagged-content ${h} ${a ? "expandable" : ""}`, onClick: r, children: [
      a && /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      !a && /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "tagged-icon", children: u }),
      /* @__PURE__ */ n("span", { className: "tagged-kind", children: k }),
      /* @__PURE__ */ n("span", { className: "tagged-name", children: C }),
      A && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    l && /* @__PURE__ */ i("div", { className: "tagged-body", children: [
      e.awaitAll && /* @__PURE__ */ n(ht, { stmt: e.awaitAll }),
      o && e.body.map((N) => /* @__PURE__ */ n(Be, { statement: N }, `${N.line}:${N.column}`))
    ] })
  ] });
}
function zt({ stmt: e }) {
  const [t, s] = pe(!0);
  return /* @__PURE__ */ i("div", { className: `block block-switch ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "switch" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: e.expr })
    ] }),
    t && /* @__PURE__ */ i("div", { className: "block-body", children: [
      e.cases.map((o) => /* @__PURE__ */ n(Ut, { switchCase: o }, `${o.line}:${o.column}`)),
      e.default && e.default.length > 0 && /* @__PURE__ */ i("div", { className: "block block-switch-default", children: [
        /* @__PURE__ */ i("div", { className: "block-header", children: [
          /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
          /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
          /* @__PURE__ */ n("span", { className: "block-keyword", children: "default" })
        ] }),
        /* @__PURE__ */ n("div", { className: "block-body", children: e.default.map((o) => /* @__PURE__ */ n(Be, { statement: o }, `${o.line}:${o.column}`)) })
      ] })
    ] })
  ] });
}
function Ut({ switchCase: e }) {
  const [t, s] = pe(!0);
  return /* @__PURE__ */ i("div", { className: `block block-switch-case ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "case" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: e.value })
    ] }),
    t && e.body && e.body.length > 0 && /* @__PURE__ */ n("div", { className: "block-body", children: e.body.map((o) => /* @__PURE__ */ n(Be, { statement: o }, `${o.line}:${o.column}`)) })
  ] });
}
function Xt({ stmt: e }) {
  const [t, s] = pe(!0), o = e.elseBody && e.elseBody.length > 0;
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
        (e.body || []).map((a) => /* @__PURE__ */ n(Be, { statement: a }, `${a.line}:${a.column}`))
      ] }),
      o && /* @__PURE__ */ i("div", { className: "block-branch", children: [
        /* @__PURE__ */ n("div", { className: "branch-label", children: "else:" }),
        (e.elseBody || []).map((a) => /* @__PURE__ */ n(Be, { statement: a }, `${a.line}:${a.column}`))
      ] })
    ] })
  ] });
}
function jt({ stmt: e }) {
  const [t, s] = pe(!0);
  let o = "";
  return e.variant === "iteration" ? o = `${e.variable} in ${e.iterable}` : e.variant === "conditional" ? o = e.condition || "" : o = "∞", /* @__PURE__ */ i("div", { className: `block block-for ${t ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: s, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: t ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: P.forLoop.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "for" }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: o })
    ] }),
    t && /* @__PURE__ */ n("div", { className: "block-body", children: (e.body || []).map((a) => /* @__PURE__ */ n(Be, { statement: a }, `${a.line}:${a.column}`)) })
  ] });
}
function Jt({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-return collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: P.return.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "return" }),
    e.value && /* @__PURE__ */ n("span", { className: "block-signature", children: e.value })
  ] }) });
}
function Zt({ stmt: e }) {
  const t = (It[e.reason] ?? P.closeComplete).icon, s = e.reason === "continue_as_new" ? "close-continue-as-new" : e.reason === "fail" ? "close-failed" : "";
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
function Qt({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-raw collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: P.raw.icon }),
    /* @__PURE__ */ n("span", { className: "block-code", children: e.text })
  ] }) });
}
function es({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-comment collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: P.raw.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "comment" }),
    /* @__PURE__ */ n("span", { className: "block-signature", title: e.text, children: e.text })
  ] }) });
}
function Zn({ keyword: e, className: t }) {
  return /* @__PURE__ */ n("div", { className: `block ${t} collapsed`, children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: P.breakContinue.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: e })
  ] }) });
}
function ns({ stmt: e }) {
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
    /* @__PURE__ */ n("span", { className: "block-icon", children: P.promise.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "promise" }),
    /* @__PURE__ */ i("span", { className: "block-signature", children: [
      e.name,
      " ← ",
      t
    ] })
  ] }) });
}
function ts({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-set collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: P.conditionSet.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "set" }),
    /* @__PURE__ */ n("span", { className: "block-signature", children: e.name })
  ] }) });
}
function ss({ stmt: e }) {
  return /* @__PURE__ */ n("div", { className: "block block-unset collapsed", children: /* @__PURE__ */ i("div", { className: "block-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon", children: P.conditionUnset.icon }),
    /* @__PURE__ */ n("span", { className: "block-keyword", children: "unset" }),
    /* @__PURE__ */ n("span", { className: "block-signature", children: e.name })
  ] }) });
}
function Be({ statement: e }) {
  switch (e.type) {
    case "activityCall":
      return /* @__PURE__ */ n(Pt, { stmt: e });
    case "workflowCall":
      return /* @__PURE__ */ n(Rt, { stmt: e });
    case "nexusCall":
      return /* @__PURE__ */ n(Bt, { stmt: e });
    case "await":
      return /* @__PURE__ */ n(qt, { stmt: e });
    case "awaitAll":
      return /* @__PURE__ */ n(ht, { stmt: e });
    case "awaitOne":
      return /* @__PURE__ */ n(Ht, { stmt: e });
    case "switch":
      return /* @__PURE__ */ n(zt, { stmt: e });
    case "if":
      return /* @__PURE__ */ n(Xt, { stmt: e });
    case "for":
      return /* @__PURE__ */ n(jt, { stmt: e });
    case "return":
      return /* @__PURE__ */ n(Jt, { stmt: e });
    case "close":
      return /* @__PURE__ */ n(Zt, { stmt: e });
    case "raw":
      return /* @__PURE__ */ n(Qt, { stmt: e });
    case "break":
      return /* @__PURE__ */ n(Zn, { keyword: "break", className: "block-break" });
    case "continue":
      return /* @__PURE__ */ n(Zn, { keyword: "continue", className: "block-continue" });
    case "promise":
      return /* @__PURE__ */ n(ns, { stmt: e });
    case "set":
      return /* @__PURE__ */ n(ts, { stmt: e });
    case "unset":
      return /* @__PURE__ */ n(ss, { stmt: e });
    case "comment":
      return /* @__PURE__ */ n(es, { stmt: e });
    default:
      return null;
  }
}
function os({ definition: e, expanded: t, onToggle: s }) {
  switch (e.type) {
    case "workflowDef":
      return /* @__PURE__ */ n(as, { def: e, controlledExpanded: t, onToggle: s });
    case "activityDef":
      return /* @__PURE__ */ n(cs, { def: e, controlledExpanded: t, onToggle: s });
    case "workerDef":
      return /* @__PURE__ */ n(ls, { def: e, controlledExpanded: t, onToggle: s });
    case "namespaceDef":
      return /* @__PURE__ */ n(is, { def: e, controlledExpanded: t, onToggle: s });
    case "nexusServiceDef":
      return /* @__PURE__ */ n(hs, { def: e, controlledExpanded: t, onToggle: s });
    default:
      return null;
  }
}
function as({ def: e, controlledExpanded: t, onToggle: s }) {
  const o = ps(e), [a, l] = pe(), r = t ?? a, h = s ?? l, u = d.useMemo(() => {
    const k = /* @__PURE__ */ new Map(), C = /* @__PURE__ */ new Map(), A = /* @__PURE__ */ new Map();
    for (const N of e.signals || []) k.set(N.name, N);
    for (const N of e.queries || []) C.set(N.name, N);
    for (const N of e.updates || []) A.set(N.name, N);
    return { signals: k, queries: C, updates: A };
  }, [e]);
  return /* @__PURE__ */ n(Tn.Provider, { value: u, children: /* @__PURE__ */ i("div", { className: `block block-workflow ${r ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "workflowDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: h, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: r ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(Nn, { kind: "workflow" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "workflow" }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: o, children: o }),
      !r && (() => {
        const k = xn(e);
        return k ? /* @__PURE__ */ n("span", { className: "block-summary", children: k }) : null;
      })()
    ] }),
    r && /* @__PURE__ */ n("div", { className: "block-body", children: /* @__PURE__ */ n(Pn, { def: e }) })
  ] }) });
}
function cs({ def: e, controlledExpanded: t, onToggle: s }) {
  const [o, a] = pe(), l = t ?? o, r = s ?? a, h = fs(e);
  return /* @__PURE__ */ i("div", { className: `block block-activity-def ${l ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "activityDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: /* @__PURE__ */ n(Nn, { kind: "activity" }) }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "activity" }),
      /* @__PURE__ */ n("span", { className: "block-signature", title: h, children: h }),
      !l && (() => {
        const u = xn(e);
        return u ? /* @__PURE__ */ n("span", { className: "block-summary", children: u }) : null;
      })()
    ] }),
    l && /* @__PURE__ */ n("div", { className: "block-body", children: (e.body || []).map((u) => /* @__PURE__ */ n(Be, { statement: u }, `${u.line}:${u.column}`)) })
  ] });
}
function ls({ def: e, controlledExpanded: t, onToggle: s }) {
  var u, k, C, A, N, I;
  const [o, a] = pe(), l = t ?? o, r = s ?? a, h = (((u = e.workflows) == null ? void 0 : u.length) || 0) + (((k = e.activities) == null ? void 0 : k.length) || 0) + (((C = e.services) == null ? void 0 : C.length) || 0);
  return /* @__PURE__ */ i("div", { className: `block block-worker-def ${l ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "workerDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: P.worker.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "worker" }),
      /* @__PURE__ */ i("span", { className: "block-signature", title: `${e.name} (${h} types)`, children: [
        e.name,
        " (",
        h,
        " types)"
      ] }),
      !l && (() => {
        const M = xn(e);
        return M ? /* @__PURE__ */ n("span", { className: "block-summary", children: M }) : null;
      })()
    ] }),
    l && /* @__PURE__ */ i("div", { className: "block-body", children: [
      ((A = e.workflows) == null ? void 0 : A.length) > 0 && /* @__PURE__ */ n(fn, { label: "workflows", refs: e.workflows, refType: "workflow" }),
      ((N = e.activities) == null ? void 0 : N.length) > 0 && /* @__PURE__ */ n(fn, { label: "activities", refs: e.activities, refType: "activity" }),
      ((I = e.services) == null ? void 0 : I.length) > 0 && /* @__PURE__ */ n(fn, { label: "nexus services", refs: e.services, refType: "service" })
    ] })
  ] });
}
function fn({ label: e, refs: t, refType: s }) {
  return /* @__PURE__ */ i("div", { className: "worker-ref-section", children: [
    /* @__PURE__ */ n("div", { className: "worker-ref-label", children: e }),
    t.map((o) => /* @__PURE__ */ n(rs, { ref_: o, refType: s }, `${o.line}:${o.column}`))
  ] });
}
function rs({ ref_: e, refType: t }) {
  const s = d.useContext(ze), o = t === "workflow" ? s.workflows.get(e.name) : t === "activity" ? s.activities.get(e.name) : void 0, a = t === "service" ? s.nexusServices.get(e.name) : void 0, l = !!(o || a), [r, h] = pe(!1, l), u = Lt[t].icon;
  return /* @__PURE__ */ i("div", { className: `worker-ref worker-ref-${t} ${r ? "expanded" : "collapsed"} ${l ? "" : "worker-ref-unresolved"}`, children: [
    /* @__PURE__ */ i("div", { className: "worker-ref-header", onClick: h, children: [
      l ? /* @__PURE__ */ n("span", { className: "block-toggle", children: r ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: `block-icon ${t === "service" ? "block-icon-nexus-service" : ""}`, children: u }),
      /* @__PURE__ */ n("span", { className: "worker-ref-name", children: e.name }),
      !l && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    r && l && /* @__PURE__ */ n("div", { className: "block-body", children: (o == null ? void 0 : o.type) === "workflowDef" ? /* @__PURE__ */ n(Pn, { def: o }) : o ? (o.body || []).map((k) => /* @__PURE__ */ n(Be, { statement: k }, `${k.line}:${k.column}`)) : a ? (a.operations || []).map((k) => /* @__PURE__ */ n(ft, { operation: k }, `${k.line}:${k.column}`)) : null })
  ] });
}
function is({ def: e, controlledExpanded: t, onToggle: s }) {
  var u, k, C, A;
  const [o, a] = pe(), l = t ?? o, r = s ?? a, h = (((u = e.workers) == null ? void 0 : u.length) || 0) + (((k = e.endpoints) == null ? void 0 : k.length) || 0);
  return /* @__PURE__ */ i("div", { className: `block block-namespace-def ${l ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "namespaceDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-namespace", children: P.namespace.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "namespace" }),
      /* @__PURE__ */ i("span", { className: "block-signature", title: `${e.name} (${h} entries)`, children: [
        e.name,
        " (",
        h,
        " entries)"
      ] }),
      !l && (() => {
        const N = xn(e);
        return N ? /* @__PURE__ */ n("span", { className: "block-summary", children: N }) : null;
      })()
    ] }),
    l && /* @__PURE__ */ i("div", { className: "block-body", children: [
      ((C = e.workers) == null ? void 0 : C.length) > 0 && /* @__PURE__ */ i("div", { className: "namespace-entry-section", children: [
        /* @__PURE__ */ n("div", { className: "namespace-entry-label", children: "workers" }),
        e.workers.map((N) => /* @__PURE__ */ n(ds, { entry: N }, `${N.line}:${N.column}`))
      ] }),
      ((A = e.endpoints) == null ? void 0 : A.length) > 0 && /* @__PURE__ */ i("div", { className: "namespace-entry-section", children: [
        /* @__PURE__ */ n("div", { className: "namespace-entry-label", children: "nexus endpoints" }),
        e.endpoints.map((N) => /* @__PURE__ */ n(us, { entry: N }, `${N.line}:${N.column}`))
      ] })
    ] })
  ] });
}
function ds({ entry: e }) {
  var r, h, u;
  const s = d.useContext(ze).workers.get(e.workerName), o = !!s, [a, l] = pe(!1, o);
  return /* @__PURE__ */ i("div", { className: `namespace-entry namespace-entry-worker ${a ? "expanded" : "collapsed"} ${o ? "" : "namespace-entry-unresolved"}`, children: [
    /* @__PURE__ */ i("div", { className: "namespace-entry-header", onClick: l, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: a ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon", children: P.worker.icon }),
      /* @__PURE__ */ n("span", { className: "namespace-entry-name", children: e.workerName }),
      !o && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    a && o && s && /* @__PURE__ */ i("div", { className: "block-body", children: [
      ((r = s.workflows) == null ? void 0 : r.length) > 0 && /* @__PURE__ */ n(fn, { label: "workflows", refs: s.workflows, refType: "workflow" }),
      ((h = s.activities) == null ? void 0 : h.length) > 0 && /* @__PURE__ */ n(fn, { label: "activities", refs: s.activities, refType: "activity" }),
      ((u = s.services) == null ? void 0 : u.length) > 0 && /* @__PURE__ */ n(fn, { label: "nexus services", refs: s.services, refType: "service" })
    ] })
  ] });
}
function us({ entry: e }) {
  return /* @__PURE__ */ n("div", { className: "namespace-entry namespace-entry-endpoint collapsed", children: /* @__PURE__ */ i("div", { className: "namespace-entry-header", children: [
    /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
    /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-endpoint", children: P.nexusService.icon }),
    /* @__PURE__ */ n("span", { className: "namespace-entry-name", children: e.endpointName })
  ] }) });
}
function xn(e) {
  var s, o, a, l, r, h, u, k, C, A;
  const t = [];
  if (e.type === "workflowDef") {
    const N = ((s = e.body) == null ? void 0 : s.length) || 0, I = (e.body || []).filter(
      (g) => g.type === "activityCall" || g.type === "workflowCall" || g.type === "nexusCall"
    ).length, M = (((o = e.signals) == null ? void 0 : o.length) || 0) + (((a = e.queries) == null ? void 0 : a.length) || 0) + (((l = e.updates) == null ? void 0 : l.length) || 0);
    N > 0 && t.push(`${N} step${N !== 1 ? "s" : ""}`), I > 0 && t.push(`${I} call${I !== 1 ? "s" : ""}`), M > 0 && t.push(`${M} handler${M !== 1 ? "s" : ""}`);
  } else if (e.type === "activityDef") {
    const N = ((r = e.body) == null ? void 0 : r.length) || 0;
    N > 0 && t.push(`${N} step${N !== 1 ? "s" : ""}`);
  } else if (e.type === "workerDef") {
    const N = ((h = e.workflows) == null ? void 0 : h.length) || 0, I = ((u = e.activities) == null ? void 0 : u.length) || 0, M = ((k = e.services) == null ? void 0 : k.length) || 0;
    N > 0 && t.push(`${N} workflow${N !== 1 ? "s" : ""}`), I > 0 && t.push(`${I} activit${I !== 1 ? "ies" : "y"}`), M > 0 && t.push(`${M} service${M !== 1 ? "s" : ""}`);
  } else if (e.type === "namespaceDef") {
    const N = ((C = e.workers) == null ? void 0 : C.length) || 0, I = ((A = e.endpoints) == null ? void 0 : A.length) || 0;
    N > 0 && t.push(`${N} worker${N !== 1 ? "s" : ""}`), I > 0 && t.push(`${I} endpoint${I !== 1 ? "s" : ""}`);
  } else if (e.type === "nexusServiceDef") {
    const N = (e.operations || []).filter((M) => M.opType === "async").length, I = (e.operations || []).filter((M) => M.opType === "sync").length;
    N > 0 && t.push(`${N} async`), I > 0 && t.push(`${I} sync`);
  }
  return t.join(" · ");
}
function ps(e) {
  let t = `${e.name}(${e.params})`;
  return e.returnType && (t += ` → ${e.returnType}`), t;
}
function hs({ def: e, controlledExpanded: t, onToggle: s }) {
  var u;
  const [o, a] = pe(), l = t ?? o, r = s ?? a, h = ((u = e.operations) == null ? void 0 : u.length) || 0;
  return /* @__PURE__ */ i("div", { className: `block block-nexus-service-def ${l ? "expanded" : "collapsed"}`, children: [
    /* @__PURE__ */ n(Ze, { defName: e.name, defType: "nexusServiceDef" }),
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-service", children: P.nexusService.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: "service" }),
      /* @__PURE__ */ i("span", { className: "block-signature", title: `${e.name} (${h} operation${h !== 1 ? "s" : ""})`, children: [
        e.name,
        " (",
        h,
        " operation",
        h !== 1 ? "s" : "",
        ")"
      ] }),
      !l && (() => {
        const k = xn(e);
        return k ? /* @__PURE__ */ n("span", { className: "block-summary", children: k }) : null;
      })()
    ] }),
    l && /* @__PURE__ */ n("div", { className: "block-body", children: (e.operations || []).map((k) => /* @__PURE__ */ n(ft, { operation: k }, `${k.line}:${k.column}`)) })
  ] });
}
function ft({ operation: e }) {
  const t = d.useContext(ze), s = e.opType === "async" && e.workflowName ? t.workflows.get(e.workflowName) : void 0, o = e.opType === "async" ? !!s : !!(e.body && e.body.length > 0), a = e.opType === "async" && e.workflowName && !s, [l, r] = pe(!1, o);
  let h;
  if (e.opType === "async" && s)
    h = /* @__PURE__ */ i(wn, { children: [
      e.name,
      /* @__PURE__ */ i("span", { className: "nexus-operation-grayed-sig", children: [
        "(",
        s.params,
        ")",
        s.returnType ? ` → ${s.returnType}` : ""
      ] })
    ] });
  else if (e.opType === "sync") {
    const u = e.params || "", k = e.returnType ? ` → ${e.returnType}` : "";
    h = `${e.name}(${u})${k}`;
  } else
    h = e.name;
  return /* @__PURE__ */ i("div", { className: `block block-nexus-operation nexus-operation-${e.opType} ${l ? "expanded" : "collapsed"} ${a ? "block-unresolved" : ""}`, children: [
    /* @__PURE__ */ i("div", { className: "block-header", onClick: r, children: [
      o ? /* @__PURE__ */ n("span", { className: "block-toggle", children: l ? "▼" : "▶" }) : /* @__PURE__ */ n("span", { className: "block-toggle-placeholder" }),
      /* @__PURE__ */ n("span", { className: "block-icon block-icon-nexus-operation", children: P.nexusOperation.icon }),
      /* @__PURE__ */ n("span", { className: "block-keyword", children: e.opType }),
      /* @__PURE__ */ n("span", { className: "block-signature", children: h }),
      a && /* @__PURE__ */ n("span", { className: "block-unresolved-badge", children: "?" })
    ] }),
    l && o && /* @__PURE__ */ n("div", { className: "block-body", children: e.opType === "async" && s ? /* @__PURE__ */ n(Hn, { def: s }) : e.body ? /* @__PURE__ */ n(Gn, { body: e.body }) : null })
  ] });
}
function fs(e) {
  let t = `${e.name}(${e.params})`;
  return e.returnType && (t += ` → ${e.returnType}`), t;
}
function In({ pinned: e, onClick: t, flashing: s, label: o }) {
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
      children: e ? /* @__PURE__ */ n(ms, {}) : /* @__PURE__ */ n(ys, {})
    }
  );
}
function ms() {
  return /* @__PURE__ */ i("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ n("rect", { x: "3", y: "7", width: "10", height: "7", rx: "1.5" }),
    /* @__PURE__ */ n("path", { d: "M5.5 7V5a2.5 2.5 0 0 1 5 0v2" })
  ] });
}
function ys() {
  return /* @__PURE__ */ i("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ n("rect", { x: "3", y: "7", width: "10", height: "7", rx: "1.5" }),
    /* @__PURE__ */ n("path", { d: "M5.5 7V5a2.5 2.5 0 0 1 4.9-.6" })
  ] });
}
function gs({
  ast: e,
  onShowInGraph: t,
  filter: s,
  onFilterChange: o,
  pins: a,
  onPinsChange: l,
  searchQuery: r,
  searchActive: h,
  onSearchChange: u,
  pendingFocus: k,
  onFocusConsumed: C,
  overriddenPins: A,
  onOverriddenPinsConsumed: N
}) {
  const I = d.useRef(null), [M, g] = d.useState(-1), F = d.useRef([]), [w, x] = d.useState(/* @__PURE__ */ new Set()), [U, Q] = d.useState(null), [K, p] = d.useState(!1), y = d.useRef(e);
  d.useEffect(() => {
    if (y.current !== e && y.current !== null) {
      p(!0);
      const b = setTimeout(() => p(!1), 600);
      return () => clearTimeout(b);
    }
    y.current = e;
  }, [e]);
  const m = d.useRef(s), [E, q] = d.useState(/* @__PURE__ */ new Set());
  d.useEffect(() => {
    const b = m.current;
    if (Wn(b, s)) return;
    const $ = /* @__PURE__ */ new Set();
    for (const S of s.selectedFiles) b.selectedFiles.has(S) || $.add(`file:${S}`);
    for (const S of s.visibleTypes) b.visibleTypes.has(S) || $.add(`type:${S}`);
    if (m.current = s, $.size > 0) {
      q($);
      const S = setTimeout(() => q(/* @__PURE__ */ new Set()), 450);
      return () => clearTimeout(S);
    }
  }, [s]), d.useEffect(() => {
    if (A.size === 0) return;
    const b = setTimeout(N, 600);
    return () => clearTimeout(b);
  }, [A, N]);
  const Y = d.useMemo(() => {
    const b = /* @__PURE__ */ new Map(), $ = /* @__PURE__ */ new Map(), S = /* @__PURE__ */ new Map();
    function H(L, T) {
      const Z = b.get(L) || [];
      Z.some((fe) => fe.defName === T.defName && fe.defType === T.defType) || (Z.push(T), b.set(L, Z));
    }
    function J(L, T, Z) {
      const fe = L.get(T) || [];
      fe.includes(Z) || (fe.push(Z), L.set(T, fe));
    }
    function te(L, T) {
      L.activity && H(`activityDef:${L.activity.name}`, { defName: T.name, defType: T.type }), L.workflow && H(`workflowDef:${L.workflow.name}`, { defName: T.name, defType: T.type }), L.nexus && H(`nexusServiceDef:${L.nexus.service}`, { defName: T.name, defType: T.type });
    }
    function z(L, T) {
      for (const Z of L)
        switch (Z.type) {
          case "activityCall":
            H(`activityDef:${Z.name}`, { defName: T.name, defType: T.type });
            break;
          case "workflowCall":
            H(`workflowDef:${Z.name}`, { defName: T.name, defType: T.type });
            break;
          case "nexusCall":
            H(`nexusServiceDef:${Z.service}`, { defName: T.name, defType: T.type });
            break;
          case "await":
            te(Z.target, T);
            break;
          case "promise":
            te(Z.target, T);
            break;
          case "awaitAll":
            z(Z.body || [], T);
            break;
          case "awaitOne":
            for (const fe of Z.cases || [])
              fe.target && te(fe.target, T), fe.awaitAll && z(fe.awaitAll.body || [], T), z(fe.body || [], T);
            break;
          case "if":
            z(Z.body || [], T), z(Z.elseBody || [], T);
            break;
          case "for":
            z(Z.body || [], T);
            break;
          case "switch":
            for (const fe of Z.cases || []) z(fe.body || [], T);
            Z.default && z(Z.default, T);
            break;
        }
    }
    for (const L of e.definitions) {
      if (L.type === "workflowDef") {
        z(L.body || [], L);
        for (const T of L.signals || []) z(T.body || [], L);
        for (const T of L.queries || []) z(T.body || [], L);
        for (const T of L.updates || []) z(T.body || [], L);
      } else if (L.type === "activityDef")
        z(L.body || [], L);
      else if (L.type === "nexusServiceDef")
        for (const T of L.operations || [])
          T.opType === "async" && T.workflowName && H(`workflowDef:${T.workflowName}`, { defName: L.name, defType: L.type }), T.body && z(T.body, L);
      if (L.type === "workerDef") {
        for (const T of L.workflows || []) J($, `workflowDef:${T.name}`, L.name);
        for (const T of L.activities || []) J($, `activityDef:${T.name}`, L.name);
        for (const T of L.services || []) J($, `nexusServiceDef:${T.name}`, L.name);
      }
      if (L.type === "namespaceDef")
        for (const T of L.workers || []) J(S, `workerDef:${T.workerName}`, L.name);
    }
    return { callers: b, workerOf: $, namespaceOf: S };
  }, [e]), _ = d.useMemo(() => {
    const b = /* @__PURE__ */ new Set();
    for (const $ of e.definitions)
      $.sourceFile && b.add($.sourceFile);
    return Array.from(b).sort();
  }, [e]), he = d.useCallback((b) => {
    const $ = new Set(s.selectedFiles);
    $.has(b) ? $.delete(b) : $.add(b), o({ ...s, selectedFiles: $ });
  }, [s, o]), xe = d.useCallback(() => {
    h ? u("", !1) : (u(r, !0), setTimeout(() => {
      var b;
      return (b = I.current) == null ? void 0 : b.focus();
    }, 50));
  }, [h, r, u]), oe = d.useCallback((b) => {
    const $ = new Set(s.visibleTypes);
    $.has(b) ? $.delete(b) : $.add(b), o({ ...s, visibleTypes: $ });
  }, [s, o]), Ee = d.useCallback(() => {
    l({ ...a, files: !a.files });
  }, [a, l]), Le = d.useCallback(() => {
    l({ ...a, types: !a.types });
  }, [a, l]), re = d.useMemo(() => {
    const b = e.definitions.filter(($) => !(!s.visibleTypes.has($.type) || s.selectedFiles.size > 0 && $.sourceFile && !s.selectedFiles.has($.sourceFile)));
    return b.sort(($, S) => {
      const H = Jn.get($.type) ?? 999, J = Jn.get(S.type) ?? 999;
      return H - J;
    }), b;
  }, [e.definitions, s]), { matchSet: V, matchIndices: G, hiddenMatchByType: ce, hiddenMatchByFile: be } = d.useMemo(() => {
    if (!r)
      return {
        matchSet: null,
        matchIndices: [],
        hiddenMatchByType: /* @__PURE__ */ new Map(),
        hiddenMatchByFile: /* @__PURE__ */ new Map()
      };
    const b = r.toLowerCase(), $ = /* @__PURE__ */ new Set(), S = [];
    re.forEach((te, z) => {
      te.name.toLowerCase().includes(b) && ($.add(ke(te)), S.push(z));
    });
    const H = /* @__PURE__ */ new Map(), J = /* @__PURE__ */ new Map();
    for (const te of e.definitions) {
      if (!te.name.toLowerCase().includes(b)) continue;
      const z = s.visibleTypes.has(te.type), L = s.selectedFiles.size === 0 || (te.sourceFile ? s.selectedFiles.has(te.sourceFile) : !0);
      z ? !L && te.sourceFile && J.set(te.sourceFile, (J.get(te.sourceFile) ?? 0) + 1) : H.set(te.type, (H.get(te.type) ?? 0) + 1);
    }
    return { matchSet: $, matchIndices: S, hiddenMatchByType: H, hiddenMatchByFile: J };
  }, [r, re, e.definitions, s]), O = e.errors || [], { shownFileErrors: c, hiddenFileErrors: ee } = d.useMemo(() => {
    if (s.selectedFiles.size === 0)
      return { shownFileErrors: O, hiddenFileErrors: [] };
    const b = [], $ = [];
    for (const S of O)
      s.selectedFiles.has(S.file) ? b.push(S) : $.push(S);
    return { shownFileErrors: b, hiddenFileErrors: $ };
  }, [O, s.selectedFiles]), le = _.length > 0, X = O.length > 0, Se = s.selectedFiles.size === 0;
  d.useEffect(() => {
    const b = ($) => {
      var S;
      $.target instanceof HTMLInputElement || $.target instanceof HTMLTextAreaElement || ($.key === "/" || $.ctrlKey && $.key === "f") && ($.preventDefault(), h ? (S = I.current) == null || S.focus() : (u(r, !0), setTimeout(() => {
        var H;
        return (H = I.current) == null ? void 0 : H.focus();
      }, 50)));
    };
    return window.addEventListener("keydown", b), () => window.removeEventListener("keydown", b);
  }, [h, r, u]), d.useEffect(() => {
    F.current = F.current.slice(0, re.length);
  }, [re.length]);
  function ke(b) {
    return `${b.type}:${b.name}:${b.sourceFile ?? ""}`;
  }
  d.useEffect(() => {
    const b = new Set(e.definitions.map(ke));
    x(($) => {
      const S = new Set([...$].filter((H) => b.has(H)));
      return S.size === $.size ? $ : S;
    });
  }, [e.definitions]);
  const B = d.useCallback((b) => {
    x(($) => {
      const S = new Set($);
      return S.has(b) ? S.delete(b) : S.add(b), S;
    });
  }, []), $e = d.useCallback((b, $) => {
    const S = re.findIndex((J) => J.name === b && J.type === $);
    if (S === -1) return;
    const H = ke(re[S]);
    x((J) => new Set(J).add(H)), g(S), setTimeout(() => {
      var J, te;
      (J = F.current[S]) == null || J.scrollIntoView({ behavior: "smooth", block: "nearest" }), (te = F.current[S]) == null || te.focus();
    }, 50), Q(H), setTimeout(() => Q(null), 1e3);
  }, [re]), Ce = d.useMemo(() => ({
    ...Y,
    navigateTo: $e,
    showInGraph: t
  }), [Y, $e, t]);
  d.useEffect(() => {
    if (!k) return;
    const { name: b, defType: $ } = k, S = setTimeout(() => {
      $e(b, $), C();
    }, 50);
    return () => clearTimeout(S);
  }, [k, $e, C]);
  const Qe = d.useCallback((b) => {
    var S, H, J, te, z, L;
    const $ = re.length;
    if ($ !== 0)
      switch (b.key) {
        case "ArrowDown": {
          b.preventDefault();
          const T = M < $ - 1 ? M + 1 : M;
          g(T), (S = F.current[T]) == null || S.focus();
          break;
        }
        case "ArrowUp": {
          b.preventDefault();
          const T = M > 0 ? M - 1 : 0;
          g(T), (H = F.current[T]) == null || H.focus();
          break;
        }
        case "ArrowRight": {
          if (b.preventDefault(), M >= 0 && M < $) {
            const T = ke(re[M]);
            w.has(T) || x((Z) => new Set(Z).add(T));
          }
          break;
        }
        case "ArrowLeft": {
          if (b.preventDefault(), M >= 0 && M < $) {
            const T = ke(re[M]);
            w.has(T) && x((Z) => {
              const fe = new Set(Z);
              return fe.delete(T), fe;
            });
          }
          break;
        }
        case "Enter": {
          b.preventDefault(), M >= 0 && M < $ && B(ke(re[M]));
          break;
        }
        case "Home": {
          b.preventDefault(), g(0), (J = F.current[0]) == null || J.focus();
          break;
        }
        case "End": {
          b.preventDefault();
          const T = $ - 1;
          g(T), (te = F.current[T]) == null || te.focus();
          break;
        }
        case "n":
        case "N": {
          if (G.length === 0) break;
          b.preventDefault();
          const T = b.key === "n", Z = ks(G, M, T);
          g(Z), (z = F.current[Z]) == null || z.scrollIntoView({ behavior: "smooth", block: "nearest" }), (L = F.current[Z]) == null || L.focus();
          break;
        }
        case "Escape": {
          b.preventDefault(), h && xe();
          break;
        }
      }
  }, [re, M, w, h, xe, B, G]), Ve = d.useMemo(() => {
    if (!V || G.length === 0 || M < 0) return null;
    const b = re[M];
    if (!b || !V.has(ke(b))) return null;
    const $ = G.indexOf(M);
    return $ >= 0 ? $ + 1 : null;
  }, [V, G, M, re]);
  return /* @__PURE__ */ n(Nt.Provider, { value: Ce, children: /* @__PURE__ */ i("div", { className: "workflow-canvas", children: [
    /* @__PURE__ */ i("div", { className: `canvas-header${K ? " refresh-flash" : ""}`, children: [
      le && /* @__PURE__ */ i(wn, { children: [
        /* @__PURE__ */ i("div", { className: `header-files-section${a.files ? " section-pinned" : ""}`, children: [
          /* @__PURE__ */ n("div", { className: "header-files-row", children: _.map((b) => {
            const $ = b.split("/").pop() || b, S = s.selectedFiles.has(b), H = E.has(`file:${b}`), J = be.get(b) ?? 0, te = [
              "header-file-tag",
              Se ? "all-included" : S ? "selected" : "",
              H ? "recently-changed" : ""
            ].filter(Boolean).join(" ");
            return /* @__PURE__ */ i(
              "button",
              {
                className: te,
                onClick: () => he(b),
                title: b,
                children: [
                  /* @__PURE__ */ n("span", { className: "header-file-icon", children: "📄" }),
                  /* @__PURE__ */ n("span", { className: "header-file-name", children: $ }),
                  J > 0 && /* @__PURE__ */ n("span", { className: "header-hidden-badge", title: `${J} match${J !== 1 ? "es" : ""} hidden in this file`, children: J })
                ]
              },
              b
            );
          }) }),
          /* @__PURE__ */ n(
            In,
            {
              pinned: a.files,
              onClick: Ee,
              flashing: A.has("files"),
              label: "Files"
            }
          )
        ] }),
        /* @__PURE__ */ n("div", { className: "header-divider" })
      ] }),
      /* @__PURE__ */ i("div", { className: `header-types-section${a.types ? " section-pinned" : ""}`, children: [
        /* @__PURE__ */ n("div", { className: "header-types-row", children: vn.map((b) => {
          const $ = s.visibleTypes.has(b.type), S = E.has(`type:${b.type}`), H = ce.get(b.type) ?? 0, J = [
            "header-type-tag",
            $ ? "active" : "",
            `header-type-${b.type}`,
            S ? "recently-changed" : ""
          ].filter(Boolean).join(" ");
          return /* @__PURE__ */ i(
            "button",
            {
              className: J,
              onClick: () => oe(b.type),
              title: $ ? `Hide ${b.label.toLowerCase()}` : `Show ${b.label.toLowerCase()}`,
              children: [
                /* @__PURE__ */ n("span", { className: "header-type-icon", children: b.icon }),
                /* @__PURE__ */ n("span", { className: "header-type-label", children: b.label }),
                H > 0 && /* @__PURE__ */ n("span", { className: "header-hidden-badge", title: `${H} match${H !== 1 ? "es" : ""} hidden by this filter`, children: H })
              ]
            },
            b.type
          );
        }) }),
        /* @__PURE__ */ n(
          In,
          {
            pinned: a.types,
            onClick: Le,
            flashing: A.has("types"),
            label: "Types"
          }
        )
      ] }),
      /* @__PURE__ */ n("div", { className: "header-divider" }),
      /* @__PURE__ */ n("div", { className: "header-controls-section", children: /* @__PURE__ */ i("div", { className: `header-search ${h ? "active" : ""}`, children: [
        /* @__PURE__ */ n(
          "button",
          {
            className: "header-search-toggle",
            onClick: xe,
            title: "Search definitions",
            children: /* @__PURE__ */ n(ut, { size: 14 })
          }
        ),
        h && /* @__PURE__ */ n(
          "input",
          {
            ref: I,
            className: "header-search-input",
            type: "text",
            placeholder: "Filter by name...",
            value: r,
            onChange: (b) => u(b.target.value, !0),
            onKeyDown: (b) => {
              b.key === "Escape" && xe();
            }
          }
        ),
        h && r && G.length > 0 && /* @__PURE__ */ n("span", { className: "header-search-counter", title: "Press n/N to jump between matches", children: Ve !== null ? `${Ve} of ${G.length}` : `${G.length} match${G.length !== 1 ? "es" : ""}` }),
        h && r && G.length === 0 && /* @__PURE__ */ n("span", { className: "header-search-counter empty", children: "no matches" })
      ] }) })
    ] }),
    /* @__PURE__ */ i("div", { className: "workflow-canvas-content", children: [
      X && /* @__PURE__ */ n(
        bs,
        {
          shownFileErrors: c,
          hiddenFileErrors: ee
        }
      ),
      re.length === 0 && !X ? /* @__PURE__ */ i("div", { className: "no-workflows", children: [
        /* @__PURE__ */ n("p", { children: "No definitions match the current filters." }),
        /* @__PURE__ */ n("p", { className: "no-workflows-hint", children: "Try adjusting the type toggles or file filter above." })
      ] }) : re.length === 0 && X ? null : /* @__PURE__ */ n("div", { role: "tree", "aria-label": "Definition list", onKeyDown: Qe, children: re.map((b, $) => {
        const S = ke(b), H = w.has(S), J = V !== null && !V.has(S), te = [
          U === S ? "flash-target" : "",
          J ? "search-dimmed" : ""
        ].filter(Boolean).join(" ");
        return /* @__PURE__ */ n(
          "div",
          {
            role: "treeitem",
            "aria-expanded": H,
            "aria-level": 1,
            tabIndex: $ === M ? 0 : -1,
            ref: (z) => {
              F.current[$] = z;
            },
            onFocus: () => g($),
            className: te || void 0,
            children: /* @__PURE__ */ n(os, { definition: b, expanded: H, onToggle: () => B(S) })
          },
          S
        );
      }) })
    ] })
  ] }) });
}
function ks(e, t, s) {
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
function bs({ shownFileErrors: e, hiddenFileErrors: t }) {
  const [s, o] = d.useState(!0), a = e.length + t.length, l = [];
  e.length > 0 && l.push(`${e.length} in shown files`), t.length > 0 && l.push(`${t.length} in hidden files`);
  const r = l.length > 1 ? ` (${l.join(", ")})` : "";
  return /* @__PURE__ */ i("div", { className: "errors-header", children: [
    /* @__PURE__ */ i("div", { className: "errors-header-bar", onClick: () => o(!s), children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: s ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "errors-header-icon", children: P.error.icon }),
      /* @__PURE__ */ i("span", { className: "errors-header-title", children: [
        a,
        " ",
        a === 1 ? "error" : "errors",
        r
      ] })
    ] }),
    s && /* @__PURE__ */ i("div", { className: "errors-header-body", children: [
      e.length > 0 && /* @__PURE__ */ n(
        Qn,
        {
          label: "Shown files",
          errors: e,
          variant: "shown"
        }
      ),
      t.length > 0 && /* @__PURE__ */ n(
        Qn,
        {
          label: "Hidden files",
          errors: t,
          variant: "hidden"
        }
      )
    ] })
  ] });
}
function Qn({ label: e, errors: t, variant: s }) {
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
function dn(e, t) {
  return `${e}:${t}`;
}
function on(e, t, s) {
  return s ? `${e}:${t}@${s}` : `${e}:${t}`;
}
function Ne(e, t) {
  return `${e}:${t}`;
}
function un(e, t) {
  return `${e}.${t}`;
}
function et(e) {
  const t = e.indexOf(":");
  return t < 0 ? e : e.slice(0, t);
}
function ws(e) {
  const t = /* @__PURE__ */ new Map(), s = [];
  let o = 0;
  function a(p) {
    t.set(p.id, p);
  }
  function l(p) {
    s.push({
      ...p,
      id: `e${o++}`,
      sourceNodeType: et(p.sourceId),
      targetNodeType: et(p.targetId)
    });
  }
  const r = /* @__PURE__ */ new Map();
  for (const p of e.definitions)
    r.set(`${p.type}:${p.name}`, p);
  for (const p of e.definitions)
    if (p.type === "namespaceDef") {
      const y = dn("namespace", p.name);
      a({
        id: y,
        level: 1,
        nodeType: "namespace",
        name: p.name,
        sourceFile: p.sourceFile,
        orphan: !1,
        // namespaces are top-level, never orphans
        definitionKey: Ne("namespace", p.name)
      });
    }
  const h = /* @__PURE__ */ new Map();
  for (const p of e.definitions)
    if (p.type === "namespaceDef")
      for (const y of p.workers || [])
        h.set(y.workerName, p.name);
  for (const p of e.definitions)
    if (p.type === "workerDef") {
      const y = h.get(p.name), m = y ? dn("namespace", y) : void 0, E = dn("worker", p.name);
      a({
        id: E,
        level: 2,
        nodeType: "worker",
        name: p.name,
        sourceFile: p.sourceFile,
        parentId: m,
        orphan: !m,
        definitionKey: Ne("worker", p.name)
      }), m && l({
        edgeType: "containment",
        sourceId: E,
        targetId: m,
        sourceLevel: 2,
        targetLevel: 1
      });
    }
  const u = /* @__PURE__ */ new Set(), k = /* @__PURE__ */ new Map(), C = /* @__PURE__ */ new Map();
  function A(p, y) {
    const m = C.get(p) ?? [];
    m.push(y), C.set(p, m);
  }
  for (const p of e.definitions) {
    if (p.type !== "workerDef") continue;
    const y = dn("worker", p.name);
    for (const m of p.workflows || []) {
      const E = "workflow", q = Ne(E, m.name), Y = on(E, m.name, p.name);
      if (t.has(Y)) continue;
      u.add(q), k.set(Y, p.name), A(q, Y);
      const _ = r.get(`workflowDef:${m.name}`);
      a({
        id: Y,
        level: 3,
        nodeType: E,
        name: m.name,
        sourceFile: _ == null ? void 0 : _.sourceFile,
        parentId: y,
        orphan: !1,
        definitionKey: q
      }), l({ edgeType: "containment", sourceId: Y, targetId: y, sourceLevel: 3, targetLevel: 2 });
    }
    for (const m of p.activities || []) {
      const E = "activity", q = Ne(E, m.name), Y = on(E, m.name, p.name);
      if (t.has(Y)) continue;
      u.add(q), k.set(Y, p.name), A(q, Y);
      const _ = r.get(`activityDef:${m.name}`);
      a({
        id: Y,
        level: 4,
        nodeType: E,
        name: m.name,
        sourceFile: _ == null ? void 0 : _.sourceFile,
        parentId: y,
        orphan: !1,
        definitionKey: q
      }), l({ edgeType: "containment", sourceId: Y, targetId: y, sourceLevel: 4, targetLevel: 2 });
    }
    for (const m of p.services || []) {
      const E = "nexusService", q = Ne(E, m.name), Y = on(E, m.name, p.name);
      if (t.has(Y)) continue;
      u.add(q), k.set(Y, p.name), A(q, Y);
      const _ = r.get(`nexusServiceDef:${m.name}`);
      a({
        id: Y,
        level: 2,
        nodeType: E,
        name: m.name,
        sourceFile: _ == null ? void 0 : _.sourceFile,
        parentId: y,
        orphan: !1,
        definitionKey: q
      }), l({ edgeType: "containment", sourceId: Y, targetId: y, sourceLevel: 2, targetLevel: 2 });
    }
  }
  for (const p of e.definitions)
    if (p.type === "workflowDef") {
      const y = Ne("workflow", p.name);
      if (u.has(y)) continue;
      const m = on("workflow", p.name);
      A(y, m), a({
        id: m,
        level: 3,
        nodeType: "workflow",
        name: p.name,
        sourceFile: p.sourceFile,
        orphan: !0,
        definitionKey: y
      });
    } else if (p.type === "activityDef") {
      const y = Ne("activity", p.name);
      if (u.has(y)) continue;
      const m = on("activity", p.name);
      A(y, m), a({
        id: m,
        level: 4,
        nodeType: "activity",
        name: p.name,
        sourceFile: p.sourceFile,
        orphan: !0,
        definitionKey: y
      });
    } else if (p.type === "nexusServiceDef") {
      const y = Ne("nexusService", p.name);
      if (u.has(y)) continue;
      const m = on("nexusService", p.name);
      A(y, m), a({
        id: m,
        level: 2,
        nodeType: "nexusService",
        name: p.name,
        sourceFile: p.sourceFile,
        orphan: !0,
        definitionKey: y
      });
    }
  function N(p, y, m) {
    return on("nexusOperation", un(p, y), m);
  }
  for (const p of e.definitions) {
    if (p.type !== "nexusServiceDef") continue;
    const y = Ne("nexusService", p.name), m = C.get(y) ?? [];
    if (m.length !== 0)
      for (const E of p.operations || []) {
        const q = Ne("nexusOperation", un(p.name, E.name));
        for (const Y of m) {
          const _ = k.get(Y), he = N(p.name, E.name, _);
          t.has(he) || (a({
            id: he,
            level: 3,
            nodeType: "nexusOperation",
            name: E.name,
            sourceFile: p.sourceFile,
            parentId: Y,
            orphan: !_,
            definitionKey: q
          }), A(q, he), l({ edgeType: "containment", sourceId: he, targetId: Y, sourceLevel: 3, targetLevel: 2 }), _ && k.set(he, _));
        }
      }
  }
  const I = /* @__PURE__ */ new Set();
  function M(p, y, m) {
    if (!t.has(y) || p === y) return;
    const E = `${p}→${y}`;
    if (I.has(E)) return;
    I.add(E);
    const q = t.get(p), Y = t.get(y);
    l({
      edgeType: "dependency",
      sourceId: p,
      targetId: y,
      sourceLevel: (q == null ? void 0 : q.level) ?? 3,
      targetLevel: (Y == null ? void 0 : Y.level) ?? 3,
      ...m && { nexusEndpoint: m }
    });
  }
  function g(p) {
    return C.get(p) ?? [];
  }
  function F(p, y, m) {
    for (const E of g(y))
      M(p, E, m);
  }
  for (const p of e.definitions)
    if (p.type === "nexusServiceDef")
      for (const y of p.operations || []) {
        if (y.opType !== "async" || !y.workflowName) continue;
        const m = Ne("nexusOperation", un(p.name, y.name)), E = Ne("workflow", y.workflowName);
        for (const q of g(m))
          F(q, E);
      }
  function w(p, y) {
    p.activity && F(y, Ne("activity", p.activity.name)), p.workflow && F(y, Ne("workflow", p.workflow.name)), p.nexus && F(
      y,
      Ne("nexusOperation", un(p.nexus.service, p.nexus.operation)),
      p.nexus.endpoint
    );
  }
  function x(p, y) {
    for (const m of p)
      switch (m.type) {
        case "activityCall":
          F(y, Ne("activity", m.name));
          break;
        case "workflowCall":
          F(y, Ne("workflow", m.name));
          break;
        case "nexusCall":
          F(
            y,
            Ne("nexusOperation", un(m.service, m.operation)),
            m.endpoint
          );
          break;
        case "await":
          w(m.target, y);
          break;
        case "promise":
          w(m.target, y);
          break;
        case "awaitAll":
          x(m.body || [], y);
          break;
        case "awaitOne":
          for (const E of m.cases || [])
            E.target && w(E.target, y), E.awaitAll && x(E.awaitAll.body || [], y), x(E.body || [], y);
          break;
        case "if":
          x(m.body || [], y), x(m.elseBody || [], y);
          break;
        case "for":
          x(m.body || [], y);
          break;
        case "switch":
          for (const E of m.cases || []) x(E.body || [], y);
          m.default && x(m.default, y);
          break;
      }
  }
  for (const p of e.definitions)
    if (p.type === "workflowDef") {
      const y = Ne("workflow", p.name);
      for (const m of g(y)) {
        x(p.body || [], m);
        for (const E of p.signals || []) x(E.body || [], m);
        for (const E of p.queries || []) x(E.body || [], m);
        for (const E of p.updates || []) x(E.body || [], m);
      }
    } else if (p.type === "activityDef") {
      const y = Ne("activity", p.name);
      for (const m of g(y))
        x(p.body || [], m);
    } else if (p.type === "nexusServiceDef")
      for (const y of p.operations || []) {
        if (y.opType !== "sync" || !y.body) continue;
        const m = Ne("nexusOperation", un(p.name, y.name));
        for (const E of g(m))
          x(y.body, E);
      }
  const U = /* @__PURE__ */ new Set();
  for (const p of s)
    if (p.edgeType !== "containment" && p.sourceLevel >= 3 && p.targetLevel >= 3) {
      const y = k.get(p.sourceId), m = k.get(p.targetId);
      if (y && m && y !== m) {
        const E = `${y}→${m}`;
        U.has(E) || (U.add(E), l({
          edgeType: "dependency",
          sourceId: dn("worker", y),
          targetId: dn("worker", m),
          sourceLevel: 2,
          targetLevel: 2
        }));
      }
    }
  const Q = /* @__PURE__ */ new Set();
  for (const p of s)
    if (p.edgeType === "dependency" && p.sourceLevel === 2 && p.targetLevel === 2) {
      const y = t.get(p.sourceId), m = t.get(p.targetId);
      if (y != null && y.parentId && (m != null && m.parentId) && y.parentId !== m.parentId) {
        const E = `${y.parentId}→${m.parentId}`;
        Q.has(E) || (Q.add(E), l({
          edgeType: "dependency",
          sourceId: y.parentId,
          targetId: m.parentId,
          sourceLevel: 1,
          targetLevel: 1
        }));
      }
    }
  const K = /* @__PURE__ */ new Map();
  for (const [p, y] of C)
    K.set(p, new Set(y));
  return { nodes: t, edges: s, duplicateGroups: K };
}
const bn = {
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
function Yn(e, t) {
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
function An(e, t) {
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
const vs = [
  "namespace",
  "worker",
  "workflow",
  "activity",
  "nexusService",
  "nexusOperation"
];
function mt(e, t) {
  const s = t.sourceNodeType, o = t.targetNodeType;
  if (t.edgeType === "containment")
    return s === "nexusOperation" && o === "nexusService" || s === "nexusService" && o === "nexusOperation" ? { strength: e.linkNexusToOperation, distance: e.distNexusToOperation } : s === "nexusService" && o === "worker" || s === "worker" && o === "nexusService" ? { strength: e.linkWorkerToNexus, distance: e.distWorkerToNexus } : s === "workflow" || o === "workflow" ? { strength: e.linkWorkerToWorkflow, distance: e.distWorkerToWorkflow } : s === "activity" || o === "activity" ? { strength: e.linkWorkerToActivity, distance: e.distWorkerToActivity } : { strength: e.linkNsToWorker, distance: e.distNsToWorker };
  if (s === "namespace" || o === "namespace")
    return { strength: e.linkNsToNs, distance: e.distNsToNs };
  if (s === "worker" || o === "worker")
    return { strength: e.linkWorkerToWorker, distance: e.distWorkerToWorker };
  const a = s === "nexusOperation" ? "workflow" : s, l = o === "nexusOperation" ? "workflow" : o;
  return a === "workflow" && l === "workflow" ? { strength: e.linkWorkflowToWorkflow, distance: e.distWorkflowToWorkflow } : a === "activity" && l === "activity" ? { strength: e.linkActivityToActivity, distance: e.distActivityToActivity } : { strength: e.linkWorkflowToActivity, distance: e.distWorkflowToActivity };
}
const Bn = 50, je = 1e6;
class Ns {
  constructor(t, s) {
    rn(this, "nodes");
    rn(this, "edges");
    rn(this, "params");
    rn(this, "alpha");
    rn(this, "nodeMap");
    this.params = { ...bn, ...s }, this.alpha = 1, this.nodes = [], this.nodeMap = /* @__PURE__ */ new Map();
    const o = (this.params.bandXMin + this.params.bandXMax) / 2, a = Math.max(40, (this.params.bandXMax - this.params.bandXMin) * 0.7);
    for (const l of t.nodes.values()) {
      const r = An(this.params, l.nodeType), h = (r.yMin + r.yMax) / 2, u = Math.max(20, (r.yMax - r.yMin) / 2), k = {
        ...l,
        x: o + (Math.random() - 0.5) * a,
        y: h + (Math.random() - 0.5) * u,
        vx: 0,
        vy: 0,
        pinned: !1
      };
      this.nodes.push(k), this.nodeMap.set(k.id, k);
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
    const s = t ? this.nodes.filter((w) => t.has(w.id)) : this.nodes, o = t ? this.edges.filter((w) => t.has(w.sourceId) && t.has(w.targetId)) : this.edges, a = /* @__PURE__ */ new Map();
    for (const w of o)
      a.set(w.sourceId, (a.get(w.sourceId) ?? 0) + 1), a.set(w.targetId, (a.get(w.targetId) ?? 0) + 1);
    const l = this.params.chargeSoftening, r = this.params.pushMultiplier, h = this.params.chargeExponent;
    for (let w = 0; w < s.length; w++)
      for (let x = w + 1; x < s.length; x++) {
        const U = s[w], Q = s[x];
        let K = Q.x - U.x, p = Q.y - U.y, y = K * K + p * p;
        if (y < 0.01) {
          const Ee = Math.random() * Math.PI * 2;
          K = Math.cos(Ee), p = Math.sin(Ee), y = 1;
        }
        const m = Math.sqrt(y), E = Math.sqrt(y + l), q = Yn(this.params, U.nodeType), Y = Yn(this.params, Q.nodeType), _ = (q + Y) / 2, he = -(this.alpha * r * _ / Math.pow(E, h)), xe = he * (K / m), oe = he * (p / m);
        U.pinned || (U.vx -= xe, U.vy -= oe), Q.pinned || (Q.vx += xe, Q.vy += oe);
      }
    const u = this.params.pullMultiplier, k = this.params.linkExponent, C = this.params.distanceMultiplier;
    for (const w of o) {
      const x = this.nodeMap.get(w.sourceId), U = this.nodeMap.get(w.targetId);
      if (!x || !U) continue;
      let Q = U.x - x.x, K = U.y - x.y, p = Math.sqrt(Q * Q + K * K);
      if (p < 0.1) {
        const re = Math.random() * Math.PI * 2;
        Q = Math.cos(re), K = Math.sin(re), p = 1;
      }
      const y = mt(this.params, w), m = y.distance * C, E = p - m, q = Math.abs(E), Y = E >= 0 ? 1 : -1, _ = this.alpha * u * y.strength * Y * Math.pow(q, k) / p, he = _ * Q, xe = _ * K, oe = a.get(w.sourceId) ?? 1, Ee = a.get(w.targetId) ?? 1, Le = oe / (oe + Ee);
      x.pinned || (x.vx += he * (1 - Le), x.vy += xe * (1 - Le)), U.pinned || (U.vx -= he * Le, U.vy -= xe * Le);
    }
    const A = this.params.gravityX, N = this.params.gravityY, I = this.params.bandXMin, M = this.params.bandXMax;
    for (const w of s) {
      if (w.pinned) continue;
      let x = null;
      w.x < I ? x = I : w.x > M && (x = M), x !== null && (w.vx -= (w.x - x) * this.alpha * A);
      const U = An(this.params, w.nodeType);
      let Q = null;
      w.y < U.yMin ? Q = U.yMin : w.y > U.yMax && (Q = U.yMax), Q !== null && (w.vy -= (w.y - Q) * this.alpha * N);
    }
    const g = this.params.velocityDecay, F = Bn * Bn;
    for (const w of s) {
      if (w.pinned) continue;
      w.vx *= g, w.vy *= g, Number.isFinite(w.vx) || (w.vx = 0), Number.isFinite(w.vy) || (w.vy = 0);
      const x = w.vx * w.vx + w.vy * w.vy;
      if (x > F) {
        const U = Bn / Math.sqrt(x);
        w.vx *= U, w.vy *= U;
      }
      w.x += w.vx, w.y += w.vy, Number.isFinite(w.x) || (w.x = 0), Number.isFinite(w.y) || (w.y = 0), w.x < -je ? w.x = -je : w.x > je && (w.x = je), w.y < -je ? w.y = -je : w.y > je && (w.y = je);
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
    const l = An(this.params, a.nodeType), r = Math.min(Math.max(o, l.yMin), l.yMax);
    a.x = s + (Math.random() - 0.5) * 10, a.y = r + (Math.random() - 0.5) * 10, a.vx = 0, a.vy = 0;
  }
}
const xs = { x: 0, y: 0, scale: 1 };
function Ye(e, t, s) {
  return [t * e.scale + e.x, s * e.scale + e.y];
}
function Kn(e, t, s) {
  return [(t - e.x) / e.scale, (s - e.y) / e.scale];
}
function Vn(e, t, s, o) {
  const a = Math.max(0.1, Math.min(10, e.scale * o)), l = (t - e.x) / e.scale, r = (s - e.y) / e.scale;
  return {
    scale: a,
    x: t - l * a,
    y: s - r * a
  };
}
function Fn(e, t, s, o = 60) {
  if (e.length === 0) return { x: t / 2, y: s / 2, scale: 1 };
  let a = 1 / 0, l = -1 / 0, r = 1 / 0, h = -1 / 0;
  for (const g of e)
    g.x < a && (a = g.x), g.x > l && (l = g.x), g.y < r && (r = g.y), g.y > h && (h = g.y);
  const u = l - a || 1, k = h - r || 1, C = t - o * 2, A = s - o * 2, N = Math.min(C / u, A / k, 2), I = (a + l) / 2, M = (r + h) / 2;
  return {
    scale: N,
    x: t / 2 - I * N,
    y: s / 2 - M * N
  };
}
function Ts(e, t, s, o) {
  const a = /* @__PURE__ */ new Set([e]), l = [e];
  for (; l.length > 0; ) {
    const r = l.shift();
    for (const h of t) {
      if (h.edgeType === "containment") continue;
      let u;
      o === "downstream" && h.sourceId === r ? u = h.targetId : o === "upstream" && h.targetId === r && (u = h.sourceId), u && s.has(u) && !a.has(u) && (a.add(u), l.push(u));
    }
  }
  return a;
}
function Ss(e, t) {
  const s = /* @__PURE__ */ new Set();
  for (const o of t)
    o.edgeType !== "containment" && e.has(o.sourceId) && e.has(o.targetId) && s.add(o.id);
  return s;
}
const Cn = {
  namespace: { fill: "#475569", border: "#1E293B", icon: P.namespace.icon },
  worker: { fill: "#94A3B8", border: "#475569", icon: P.worker.icon },
  workflow: { fill: "#8B7EC8", border: "#5D4F95", icon: P.workflow.icon },
  activity: { fill: "#7CB9E8", border: "#4A8BC2", icon: P.activity.icon },
  nexusService: { fill: "#DB2777", border: "#831843", icon: P.nexusService.icon },
  nexusOperation: { fill: "#F9A8D4", border: "#BE185D", icon: P.nexusOperation.icon }
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
}, Ms = "#4A90D9", $s = "#8B7EC8", gn = 0.2, _n = {
  1: { w: 40, h: 40, r: 20, iconSize: 18 },
  2: { w: 40, h: 40, r: 20, iconSize: 18 },
  3: { w: 22, h: 22, r: 11, iconSize: 12 },
  4: { w: 16, h: 16, r: 8, iconSize: 10 }
}, nt = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', Cs = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
function tt(e, t) {
  return typeof document > "u" ? t : getComputedStyle(document.documentElement).getPropertyValue(e).trim() || t;
}
function Es(e, t, s) {
  if (e.edgeType === "containment")
    return t.nodeType === "nexusOperation" && s.nodeType === "nexusService" ? Je.opContainment : Je.containment;
  if (t.nodeType === "nexusOperation" || s.nodeType === "nexusOperation" || e.nexusEndpoint != null)
    return Je.nexusCall;
  if (t.nodeType === "workflow" && s.nodeType === "workflow")
    return Je.workflowDep;
  const o = Math.min(t.level, s.level);
  return o === 1 ? Je.dependencyL1 : o === 2 ? Je.dependencyL2 : s.level === 4 || t.level === 4 ? Je.dependencyL4 : Je.dependencyL3;
}
const En = 8, Oe = 100, Ds = 0.5, st = 0.25, ot = 0.1;
function As({
  nodes: e,
  edges: t,
  viewport: s,
  onViewportChange: o,
  onNodeDragStart: a,
  onNodeDragMove: l,
  onNodeDragEnd: r,
  onDoubleClickNode: h,
  onHoverNode: u,
  onSelectNode: k,
  onNodeContextMenu: C,
  highlightedNodes: A,
  highlightedEdges: N,
  hoveredNodeId: I,
  selectedNodeId: M,
  focusedNodeId: g,
  searchMatchIds: F,
  running: w,
  showForceFields: x,
  forceParams: U,
  activeSection: Q,
  activeChargeType: K,
  activeGravityType: p,
  nodeSummaries: y
}) {
  const m = d.useRef(null), E = d.useRef(null), [q, Y] = d.useState({ w: 0, h: 0 }), _ = d.useRef(null), he = d.useMemo(() => {
    const O = /* @__PURE__ */ new Map();
    for (const c of e) O.set(c.id, c);
    return O;
  }, [e]), xe = d.useRef({
    nodes: e,
    edges: t,
    nodeMap: he,
    viewport: s,
    highlightedNodes: A,
    highlightedEdges: N,
    hoveredNodeId: I,
    selectedNodeId: M,
    focusedNodeId: g,
    searchMatchIds: F,
    showForceFields: x,
    forceParams: U,
    activeSection: Q,
    activeChargeType: K,
    activeGravityType: p,
    nodeSummaries: y,
    running: w
  });
  xe.current = {
    nodes: e,
    edges: t,
    nodeMap: he,
    viewport: s,
    highlightedNodes: A,
    highlightedEdges: N,
    hoveredNodeId: I,
    selectedNodeId: M,
    focusedNodeId: g,
    searchMatchIds: F,
    showForceFields: x,
    forceParams: U,
    activeSection: Q,
    activeChargeType: K,
    activeGravityType: p,
    nodeSummaries: y,
    running: w
  }, d.useEffect(() => {
    const O = E.current;
    if (!O) return;
    const c = new ResizeObserver((ee) => {
      const { width: le, height: X } = ee[0].contentRect;
      Y({ w: Math.floor(le), h: Math.floor(X) });
    });
    return c.observe(O), () => c.disconnect();
  }, []);
  const oe = d.useCallback((O, c) => {
    const [ee, le] = Kn(s, O, c);
    for (let X = e.length - 1; X >= 0; X--) {
      const Se = e[X], ke = _n[Se.level].r / s.scale + 4;
      if ((ee - Se.x) ** 2 + (le - Se.y) ** 2 <= ke * ke) return Se;
    }
    return null;
  }, [e, s]), Ee = d.useCallback((O) => {
    O.preventDefault();
    const c = m.current.getBoundingClientRect(), ee = O.clientX - c.left, le = O.clientY - c.top, X = O.deltaY < 0 ? 1.1 : 0.9;
    o(Vn(s, ee, le, X));
  }, [s, o]), Le = d.useCallback((O) => {
    var Se;
    const c = m.current.getBoundingClientRect(), ee = O.clientX - c.left, le = O.clientY - c.top, X = oe(ee, le);
    if (X) {
      _.current = { type: "node", sx: ee, sy: le, moved: !1 };
      const [ke, B] = Kn(s, ee, le);
      a(X.id, ke, B);
    } else
      _.current = { type: "pan", startVp: { ...s }, sx: ee, sy: le, moved: !1 };
    (Se = m.current) == null || Se.setPointerCapture(O.pointerId);
  }, [s, oe, a]), re = d.useCallback((O) => {
    const c = m.current.getBoundingClientRect(), ee = O.clientX - c.left, le = O.clientY - c.top;
    if (!_.current) {
      const X = oe(ee, le);
      u((X == null ? void 0 : X.id) ?? null);
      return;
    }
    if (_.current.moved = !0, _.current.type === "pan" && _.current.startVp) {
      const X = ee - _.current.sx, Se = le - _.current.sy;
      o({
        ..._.current.startVp,
        x: _.current.startVp.x + X,
        y: _.current.startVp.y + Se
      });
    } else if (_.current.type === "node") {
      const [X, Se] = Kn(s, ee, le);
      l(X, Se);
    }
  }, [s, oe, o, l, u]), V = d.useCallback((O) => {
    var ee;
    const c = _.current;
    if ((c == null ? void 0 : c.type) === "node") {
      if (r(), !c.moved) {
        const le = m.current.getBoundingClientRect(), X = O.clientX - le.left, Se = O.clientY - le.top, ke = oe(X, Se);
        ke && k(ke.id);
      }
    } else (c == null ? void 0 : c.type) === "pan" && !c.moved && k(null);
    _.current = null, (ee = m.current) == null || ee.releasePointerCapture(O.pointerId);
  }, [r, k, oe]), G = d.useCallback((O) => {
    const c = m.current.getBoundingClientRect(), ee = O.clientX - c.left, le = O.clientY - c.top, X = oe(ee, le);
    X ? h(X.id) : o(Fn(e, q.w, q.h));
  }, [oe, e, q, o, h]), ce = d.useCallback((O) => {
    if (!C) return;
    const c = m.current.getBoundingClientRect(), ee = O.clientX - c.left, le = O.clientY - c.top, X = oe(ee, le);
    X && (O.preventDefault(), C(X.id, O.clientX, O.clientY));
  }, [oe, C]), be = d.useRef(!0);
  return d.useEffect(() => {
    be.current = !0;
  }), d.useEffect(() => {
    const O = m.current;
    if (!O || q.w === 0) return;
    const c = O.getContext("2d");
    if (!c) return;
    const ee = window.devicePixelRatio || 1;
    O.width = q.w * ee, O.height = q.h * ee;
    let le = 0, X = !0;
    const Se = () => {
      var L, T, Z, fe, en;
      const B = xe.current, { w: $e, h: Ce } = q, Qe = B.highlightedNodes !== null && B.highlightedNodes.size > 0, Ve = tt("--color-text", "#1e293b"), b = tt("--color-text-muted", "#64748b"), $ = Ve.startsWith("#") && Ve.length === 7 ? Ve + "33" : "rgba(100,116,139,0.2)", S = B.viewport;
      c.setTransform(ee, 0, 0, ee, 0, 0), c.clearRect(0, 0, $e, Ce);
      for (const ne of B.edges) {
        const ie = B.nodeMap.get(ne.sourceId), me = B.nodeMap.get(ne.targetId);
        if (!ie || !me) continue;
        const [se, ye] = Ye(S, ie.x, ie.y), [de, ge] = Ye(S, me.x, me.y);
        if (Math.max(se, de) < -Oe || Math.min(se, de) > $e + Oe || Math.max(ye, ge) < -Oe || Math.min(ye, ge) > Ce + Oe) continue;
        const we = ((L = B.highlightedEdges) == null ? void 0 : L.has(ne.id)) ?? !1, Me = Es(ne, ie, me), De = Me.alpha, Fe = B.searchMatchIds !== null && (!B.searchMatchIds.has(ne.sourceId) || !B.searchMatchIds.has(ne.targetId));
        if (c.globalAlpha = Qe ? we ? 1 : gn : Fe ? gn : De, c.beginPath(), c.setLineDash([...Me.dash]), c.strokeStyle = Me.color, c.lineWidth = Me.width, c.moveTo(se, ye), c.lineTo(de, ge), c.stroke(), c.setLineDash([]), ne.edgeType !== "containment") {
          const Te = Math.atan2(ge - ye, de - se), We = _n[me.level].w / 2 * S.scale + 2, Ke = de - Math.cos(Te) * We, ve = ge - Math.sin(Te) * We;
          c.beginPath(), c.moveTo(Ke, ve), c.lineTo(
            Ke - En * Math.cos(Te - Math.PI / 6),
            ve - En * Math.sin(Te - Math.PI / 6)
          ), c.lineTo(
            Ke - En * Math.cos(Te + Math.PI / 6),
            ve - En * Math.sin(Te + Math.PI / 6)
          ), c.closePath(), c.fillStyle = Me.color, c.fill();
        }
        c.globalAlpha = 1;
      }
      const H = B.activeSection === "push", J = B.activeSection === "pull", te = B.activeSection === "gravity", z = [0.2, 0.5, 1.5];
      if (B.showForceFields || H) {
        const ne = B.forceParams.chargeSoftening, ie = B.forceParams.chargeExponent, me = B.forceParams.pushMultiplier, se = H ? B.activeChargeType : null;
        for (const ye of B.nodes) {
          const [de, ge] = Ye(S, ye.x, ye.y), we = 2e3;
          if (de + we < 0 || de - we > $e || ge + we < 0 || ge - we > Ce) continue;
          const Me = se === null || ye.nodeType === se, De = H && Me, Fe = H && !Me, Te = De ? 0.24 : Fe ? 0.04 : 0.1, nn = De ? 0.05 : Fe ? 0.01 : 0.025, We = ((T = Cn[ye.nodeType]) == null ? void 0 : T.fill) ?? "#999";
          c.strokeStyle = We;
          const Ke = Math.abs(Yn(B.forceParams, ye.nodeType)) * me;
          if (Ke <= 0) continue;
          const ve = [];
          for (let Ie = 0; Ie < z.length; Ie++) {
            const qe = z[Ie], Pe = Ke / qe, _e = Math.pow(Pe, 2 / Math.max(ie, 0.01)) - ne;
            if (_e <= 0) continue;
            const Ue = Math.sqrt(_e) * S.scale;
            Ue < 2 || Ue > 2e3 || ve.push(Ue);
          }
          if (ve.length !== 0) {
            c.fillStyle = We, c.globalAlpha = De ? 0.14 : Fe ? 0.02 : 0.05, c.beginPath(), c.arc(de, ge, ve[0], 0, Math.PI * 2), c.fill(), c.strokeStyle = We;
            for (let Ie = 0; Ie < ve.length; Ie++) {
              const qe = ve[Ie], Pe = ve.length - 1 - Ie;
              c.beginPath(), c.arc(de, ge, qe, 0, Math.PI * 2), c.globalAlpha = Te + Pe * nn, c.lineWidth = De ? 1.5 : 1, c.stroke();
            }
          }
        }
        c.globalAlpha = 1;
      }
      if (J) {
        const ne = B.forceParams.distanceMultiplier;
        for (const ie of B.edges) {
          const me = B.nodeMap.get(ie.sourceId), se = B.nodeMap.get(ie.targetId);
          if (!me || !se) continue;
          const [ye, de] = Ye(S, me.x, me.y), [ge, we] = Ye(S, se.x, se.y);
          if (Math.max(ye, ge) < -Oe || Math.min(ye, ge) > $e + Oe || Math.max(de, we) < -Oe || Math.min(de, we) > Ce + Oe) continue;
          const De = mt(B.forceParams, ie).distance * ne, Fe = se.x - me.x, Te = se.y - me.y, We = Math.sqrt(Fe * Fe + Te * Te) / Math.max(De, 0.1);
          let Ke;
          We > 1.15 ? Ke = "#F59E0B" : We < 0.85 ? Ke = "#3B82F6" : Ke = "#22C55E", c.beginPath(), c.moveTo(ye, de), c.lineTo(ge, we), c.strokeStyle = Ke, c.globalAlpha = 0.5, c.lineWidth = 3, c.setLineDash([]), c.stroke();
          const ve = Math.atan2(Te, Fe), Ie = -Math.sin(ve), qe = Math.cos(ve), Pe = 5, _e = De * S.scale;
          if (_e > 10 && _e < Math.sqrt((ge - ye) ** 2 + (we - de) ** 2) * 2) {
            const an = ye + Math.cos(ve) * _e, Ue = de + Math.sin(ve) * _e;
            c.beginPath(), c.moveTo(an - Ie * Pe, Ue - qe * Pe), c.lineTo(an + Ie * Pe, Ue + qe * Pe), c.strokeStyle = "#22C55E", c.globalAlpha = 0.7, c.lineWidth = 1.5, c.stroke();
            const tn = ge - Math.cos(ve) * _e, sn = we - Math.sin(ve) * _e;
            c.beginPath(), c.moveTo(tn - Ie * Pe, sn - qe * Pe), c.lineTo(tn + Ie * Pe, sn + qe * Pe), c.stroke();
          }
        }
        c.globalAlpha = 1, c.setLineDash([]);
      }
      if (te) {
        const [ne] = Ye(S, B.forceParams.bandXMin, 0), [ie] = Ye(S, B.forceParams.bandXMax, 0);
        for (const se of vs) {
          const ye = An(B.forceParams, se), [, de] = Ye(S, 0, ye.yMin), [, ge] = Ye(S, 0, ye.yMax);
          if (ge < 0 || de > Ce) continue;
          const we = B.activeGravityType === se, Me = B.activeGravityType !== null && !we;
          c.fillStyle = ((Z = Cn[se]) == null ? void 0 : Z.fill) ?? "#999", c.globalAlpha = we ? 0.2 : Me ? 0.04 : 0.1, c.fillRect(0, de, $e, ge - de), c.strokeStyle = ((fe = Cn[se]) == null ? void 0 : fe.fill) ?? "#999", c.globalAlpha = we ? 0.55 : Me ? 0.08 : 0.22, c.lineWidth = we ? 1.5 : 1, c.setLineDash([]), c.beginPath(), c.moveTo(0, de), c.lineTo($e, de), c.moveTo(0, ge), c.lineTo($e, ge), c.stroke();
        }
        ne < $e + Oe && ie > -Oe && (c.strokeStyle = "#8B7EC8", c.globalAlpha = 0.5, c.lineWidth = 1.5, c.setLineDash([6, 6]), c.beginPath(), c.moveTo(ne, 0), c.lineTo(ne, Ce), c.moveTo(ie, 0), c.lineTo(ie, Ce), c.stroke(), c.fillStyle = "#8B7EC8", c.globalAlpha = 0.05, c.fillRect(ne, 0, ie - ne, Ce), c.setLineDash([])), c.globalAlpha = 1;
      }
      c.font = nt, c.textAlign = "center", c.textBaseline = "middle";
      for (const ne of B.nodes) {
        const [ie, me] = Ye(S, ne.x, ne.y), se = _n[ne.level], ye = se.w / 2, de = se.h / 2;
        if (ie + ye < -Oe || ie - ye > $e + Oe || me + de < -Oe || me - de > Ce + Oe) continue;
        const ge = ((en = B.highlightedNodes) == null ? void 0 : en.has(ne.id)) ?? !1, we = B.searchMatchIds !== null && !B.searchMatchIds.has(ne.id), Me = Qe && !ge || we;
        c.globalAlpha = Me ? gn : 1;
        const De = Cn[ne.nodeType] ?? { fill: "#999", border: "#444", icon: "?" };
        c.beginPath(), c.arc(ie, me, se.r, 0, Math.PI * 2), c.fillStyle = De.fill, c.fill(), c.lineWidth = Math.max(1, Math.min(2, S.scale * 1.25)), c.strokeStyle = De.border, c.stroke(), S.scale >= st && De.icon && (c.save(), c.font = `${se.iconSize}px ${Cs}`, c.fillStyle = "#FFFFFF", c.globalAlpha = (Me ? gn : 1) * 0.92, c.fillText(De.icon, ie, me + 0.5), c.restore()), ne.orphan && S.scale >= ot && (c.save(), c.setLineDash([3, 3]), c.strokeStyle = De.fill, c.lineWidth = 1.5, c.beginPath(), c.arc(ie, me, se.r + 4, 0, Math.PI * 2), c.stroke(), c.restore()), ne.id === B.selectedNodeId && (c.save(), c.strokeStyle = $s, c.lineWidth = 2.5, c.setLineDash([]), c.beginPath(), c.arc(ie, me, se.r + 5, 0, Math.PI * 2), c.stroke(), c.restore()), ne.id === B.focusedNodeId && S.scale >= ot && (c.save(), c.strokeStyle = Ms, c.lineWidth = 2, c.setLineDash([2, 2]), c.beginPath(), c.arc(ie, me, se.r + 7, 0, Math.PI * 2), c.stroke(), c.restore()), c.globalAlpha = 1;
        const Fe = Math.max(se.r * 4, 48), Te = me + se.r + 12, nn = ne.id === B.hoveredNodeId || ne.id === B.selectedNodeId;
        if ((S.scale >= st || nn) && (c.fillStyle = Me ? $ : Ve, c.fillText(Fs(c, ne.name, Fe), ie, Te), S.scale >= Ds)) {
          const We = B.nodeSummaries.get(ne.id);
          We && (c.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', c.globalAlpha = Me ? gn * 0.55 : 0.55, c.fillStyle = b, c.fillText(We, ie, Te + 13), c.font = nt);
        }
      }
    }, ke = () => {
      if (!X) return;
      (xe.current.running || be.current) && (be.current = !1, Se()), le = requestAnimationFrame(ke);
    };
    return le = requestAnimationFrame(ke), () => {
      X = !1, cancelAnimationFrame(le);
    };
  }, [q]), /* @__PURE__ */ n("div", { ref: E, className: "graph-canvas-container", children: /* @__PURE__ */ n(
    "canvas",
    {
      ref: m,
      style: { width: q.w, height: q.h },
      onWheel: Ee,
      onPointerDown: Le,
      onPointerMove: re,
      onPointerUp: V,
      onDoubleClick: G,
      onContextMenu: ce
    }
  ) });
}
function Fs(e, t, s) {
  if (e.measureText(t).width <= s) return t;
  for (let o = t.length - 1; o > 0; o--) {
    const a = t.slice(0, o) + "…";
    if (e.measureText(a).width <= s) return a;
  }
  return "…";
}
const Is = [
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
], Ls = [
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
], Ws = [
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
], Ps = 0, Rs = 1.5, Os = 0.05, Bs = 10, Ks = 600, _s = 10, Ys = [
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
], Vs = [
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
], yt = -600, gt = 600, kt = 10, qs = [
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
], Hs = [
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
function Gs({
  params: e,
  onParamChange: t,
  running: s,
  onToggleRunning: o,
  onReheat: a,
  showForceFields: l,
  onToggleForceFields: r,
  onActiveSection: h,
  onActiveChargeType: u,
  onActiveGravityType: k
}) {
  const [C, A] = d.useState(!1), [N, I] = d.useState(!1), M = () => {
    for (const g of Object.keys(bn))
      e[g] !== bn[g] && t(g, bn[g]);
  };
  return /* @__PURE__ */ i("div", { className: `graph-control-panel ${C ? "open" : ""}`, children: [
    /* @__PURE__ */ i(
      "button",
      {
        className: "graph-control-panel-toggle",
        onClick: () => A(!C),
        title: "Toggle control panel",
        children: [
          C ? "▼ Forces" : "▶ Forces",
          C && /* @__PURE__ */ n(
            "span",
            {
              className: "graph-control-help-btn",
              onClick: (g) => {
                g.stopPropagation(), I(!N);
              },
              title: "How the simulation works",
              children: "?"
            }
          )
        ]
      }
    ),
    C && N && /* @__PURE__ */ n("div", { className: "graph-control-help-popover", children: /* @__PURE__ */ n("pre", { className: "graph-control-help-text", children: Xs }) }),
    C && /* @__PURE__ */ i("div", { className: "graph-control-panel-body", children: [
      /* @__PURE__ */ i(Dn, { section: "push", title: "PUSH", subtitle: "all node pairs", equation: `F = α × push × charge / eff^exp
eff = √(d² + softening)`, onHover: (g) => h(g ? "push" : null), children: [
        Is.map((g) => /* @__PURE__ */ n(kn, { def: g, value: e[g.key], onChange: (F) => t(g.key, F) }, g.key)),
        /* @__PURE__ */ i("div", { className: "graph-control-sub-header", children: [
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Level" }),
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Charge" })
        ] }),
        Ls.map((g) => /* @__PURE__ */ n(
          "div",
          {
            onMouseEnter: () => u(g.nodeType),
            onMouseLeave: () => u(null),
            children: /* @__PURE__ */ n(
              kn,
              {
                def: g,
                value: e[g.key],
                onChange: (F) => t(g.key, F),
                nodeType: g.nodeType
              }
            )
          },
          g.key
        ))
      ] }),
      /* @__PURE__ */ i(Dn, { section: "pull", title: "PULL", subtitle: "connected pairs", equation: `F = α × pull × k × sign(Δ) × |Δ|^exp / d
Δ = d − rest × dist`, onHover: (g) => h(g ? "pull" : null), children: [
        Ws.map((g) => /* @__PURE__ */ n(kn, { def: g, value: e[g.key], onChange: (F) => t(g.key, F) }, g.key)),
        /* @__PURE__ */ i("div", { className: "graph-control-sub-header", children: [
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", style: { minWidth: 52 }, children: "Edge" }),
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "k" }),
          /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "rest" })
        ] }),
        Ys.map((g) => /* @__PURE__ */ n(zs, { def: g, params: e, onChange: t }, g.label))
      ] }),
      /* @__PURE__ */ i(
        Dn,
        {
          section: "gravity",
          title: "GRAVITY",
          subtitle: "hierarchical anchor",
          equation: `Fₓ = α × X × (0 − x)
Fᵧ = α × Y × (band − y) when y outside band`,
          onHover: (g) => {
            h(g ? "gravity" : null), g || k(null);
          },
          children: [
            Vs.map((g) => /* @__PURE__ */ n(kn, { def: g, value: e[g.key], onChange: (F) => t(g.key, F) }, g.key)),
            /* @__PURE__ */ i("div", { className: "graph-control-sub-header", children: [
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Axis" }),
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "X band (left \\u2192 right)" })
            ] }),
            /* @__PURE__ */ i("div", { className: "graph-control-band-row", children: [
              /* @__PURE__ */ n("span", { className: "graph-control-band-label", children: "X" }),
              /* @__PURE__ */ n(
                bt,
                {
                  min: yt,
                  max: gt,
                  step: kt,
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
            /* @__PURE__ */ i("div", { className: "graph-control-sub-header", children: [
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Type" }),
              /* @__PURE__ */ n("span", { className: "graph-control-sub-label", children: "Y band (top \\u2192 bottom)" })
            ] }),
            qs.map((g) => /* @__PURE__ */ n(
              "div",
              {
                onMouseEnter: () => k(g.nodeType),
                onMouseLeave: () => k(null),
                children: /* @__PURE__ */ n(
                  Us,
                  {
                    def: g,
                    valueMin: e[g.minKey],
                    valueMax: e[g.maxKey],
                    onChangeMin: (F) => t(g.minKey, F),
                    onChangeMax: (F) => t(g.maxKey, F)
                  }
                )
              },
              g.nodeType
            ))
          ]
        }
      ),
      /* @__PURE__ */ n(Dn, { section: "dynamics", title: "DYNAMICS", subtitle: "", equation: `v ×= friction
α −= cooling, stop at threshold`, onHover: (g) => h(g ? "dynamics" : null), children: Hs.map((g) => /* @__PURE__ */ n(kn, { def: g, value: e[g.key], onChange: (F) => t(g.key, F) }, g.key)) }),
      /* @__PURE__ */ i("div", { className: "graph-control-group", children: [
        /* @__PURE__ */ i("div", { className: "graph-control-sim-buttons", children: [
          /* @__PURE__ */ n("button", { className: "graph-header-btn", onClick: o, children: s ? "Pause" : "Play" }),
          /* @__PURE__ */ n("button", { className: "graph-header-btn", onClick: a, children: "Reheat" }),
          /* @__PURE__ */ n("button", { className: "graph-header-btn", onClick: M, title: "Reset all parameters to defaults", children: "Reset" })
        ] }),
        /* @__PURE__ */ i("label", { className: "graph-control-checkbox", title: "Show charge field rings around nodes", children: [
          /* @__PURE__ */ n("input", { type: "checkbox", checked: l, onChange: r }),
          "Show force fields"
        ] })
      ] })
    ] })
  ] });
}
function Dn({ section: e, title: t, subtitle: s, equation: o, onHover: a, children: l }) {
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
function zs({ def: e, params: t, onChange: s }) {
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
        min: Ps,
        max: Rs,
        step: Os,
        value: o,
        onChange: (h) => s(e.kKey, Number(h.target.value)),
        className: "graph-control-slider-input graph-control-pull-slider"
      }
    ),
    /* @__PURE__ */ n("span", { className: "graph-control-pull-value", children: l }),
    /* @__PURE__ */ n(
      "input",
      {
        type: "range",
        min: Bs,
        max: Ks,
        step: _s,
        value: a,
        onChange: (h) => s(e.restKey, Number(h.target.value)),
        className: "graph-control-slider-input graph-control-pull-slider"
      }
    ),
    /* @__PURE__ */ n("span", { className: "graph-control-pull-value", children: r })
  ] });
}
function Us({ def: e, valueMin: t, valueMax: s, onChangeMin: o, onChangeMax: a }) {
  return /* @__PURE__ */ i(
    "div",
    {
      className: `graph-control-band-row graph-control-typed-row graph-control-typed-${e.nodeType}`,
      title: e.tooltip,
      children: [
        /* @__PURE__ */ n("span", { className: "graph-control-band-label", children: e.label }),
        /* @__PURE__ */ n(
          bt,
          {
            min: yt,
            max: gt,
            step: kt,
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
function bt({
  min: e,
  max: t,
  step: s,
  valueMin: o,
  valueMax: a,
  onChangeMin: l,
  onChangeMax: r,
  nodeType: h
}) {
  const u = t - e, k = (o - e) / u * 100, C = Math.max(0, (a - o) / u * 100);
  return /* @__PURE__ */ i("div", { className: `dual-range dual-range-${h}`, children: [
    /* @__PURE__ */ n("div", { className: "dual-range-track" }),
    /* @__PURE__ */ n(
      "div",
      {
        className: "dual-range-fill",
        style: { left: `${k}%`, width: `${C}%` }
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
        onChange: (A) => {
          const N = Math.min(Number(A.target.value), a - s);
          l(N);
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
        onChange: (A) => {
          const N = Math.max(Number(A.target.value), o + s);
          r(N);
        }
      }
    )
  ] });
}
function kn({ def: e, value: t, onChange: s, nodeType: o }) {
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
const Xs = `Force-directed graph layout:

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
function js({ x: e, y: t, items: s, onClose: o }) {
  const a = d.useRef(null);
  d.useEffect(() => {
    const r = (u) => {
      u.key === "Escape" && o();
    }, h = (u) => {
      a.current && (a.current.contains(u.target) || o());
    };
    return window.addEventListener("keydown", r), window.addEventListener("mousedown", h, !0), () => {
      window.removeEventListener("keydown", r), window.removeEventListener("mousedown", h, !0);
    };
  }, [o]);
  const l = d.useMemo(() => {
    const u = 40 + s.length * 28, k = Math.min(e, window.innerWidth - 180 - 8), C = Math.min(t, window.innerHeight - u - 8);
    return { left: k, top: C };
  }, [e, t, s.length]);
  return /* @__PURE__ */ n("div", { ref: a, className: "graph-context-menu", style: l, role: "menu", children: s.map((r, h) => /* @__PURE__ */ n(
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
function hn(e) {
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
function wt(e, t, s) {
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
function qn(e, t, s, o, a, l) {
  if (t) return [e];
  const r = l(e);
  if ((r == null ? void 0 : r.nodeType) === "nexusOperation") {
    const u = [];
    for (const k of o.edges) {
      if (k.edgeType !== "dependency") continue;
      const C = s === "tgt" ? k.sourceId === e ? k.targetId : null : k.targetId === e ? k.sourceId : null;
      if (C)
        for (const A of qn(C, a.has(C), s, o, a, l))
          u.push(A);
    }
    if (u.length > 0) return u;
  }
  const h = wt(e, a, l);
  return h ? [h] : [];
}
function Js(e, t, s) {
  if (e.level === 1) {
    const o = t.filter((a) => a.edgeType === "containment" && a.targetId === e.id).length;
    return o > 0 ? `${o} worker${o !== 1 ? "s" : ""}` : "";
  } else if (e.level === 2) {
    let o = 0, a = 0, l = 0;
    for (const h of t) {
      if (h.edgeType !== "containment" || h.targetId !== e.id) continue;
      const u = s.get(h.sourceId);
      u && (u.nodeType === "workflow" ? o++ : u.nodeType === "activity" ? a++ : u.nodeType === "nexusService" && l++);
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
function Zs(e) {
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
function Qs({
  ast: e,
  onShowInTree: t,
  filter: s,
  onFilterChange: o,
  pins: a,
  onPinsChange: l,
  searchQuery: r,
  searchActive: h,
  onSearchChange: u,
  pendingFocus: k,
  onFocusConsumed: C,
  overriddenPins: A,
  onOverriddenPinsConsumed: N
}) {
  const I = s.visibleTypes, M = s.selectedFiles, [g, F] = d.useState(xs), [w, x] = d.useState(!0), [U, Q] = d.useState({ ...bn }), K = d.useRef(null), p = d.useRef(null), y = d.useRef(!1), m = d.useRef(null), E = d.useRef(null), [q, Y] = d.useState(0), _ = d.useRef({ frames: 0, lastStamp: 0 }), [he, xe] = d.useState(null), [oe, Ee] = d.useState(null), [Le, re] = d.useState(-1), [V, G] = d.useState(!1), [ce, be] = d.useState(!1), [O, c] = d.useState(null), [ee, le] = d.useState(null), [X, Se] = d.useState(null), ke = d.useRef(null), [B, $e] = d.useState(!1), [Ce, Qe] = d.useState(null), Ve = d.useRef(s), [b, $] = d.useState(/* @__PURE__ */ new Set());
  d.useEffect(() => {
    const f = Ve.current;
    if (Wn(f, s)) return;
    const v = /* @__PURE__ */ new Set();
    for (const D of s.selectedFiles) f.selectedFiles.has(D) || v.add(`file:${D}`);
    for (const D of s.visibleTypes) f.visibleTypes.has(D) || v.add(`type:${D}`);
    if (Ve.current = s, v.size > 0) {
      $(v);
      const D = setTimeout(() => $(/* @__PURE__ */ new Set()), 450);
      return () => clearTimeout(D);
    }
  }, [s]), d.useEffect(() => {
    if (A.size === 0) return;
    const f = setTimeout(N, 600);
    return () => clearTimeout(f);
  }, [A, N]);
  const S = d.useMemo(() => ws(e), [e]), [H, J] = d.useState(0);
  d.useEffect(() => {
    K.current = new Ns(S, U), y.current = !1, _.current = { frames: 0, lastStamp: 0 }, x(!0), Ee(null), xe(null), re(-1), J((f) => f + 1);
  }, [S]);
  const te = d.useMemo(() => {
    const f = /* @__PURE__ */ new Set();
    for (const v of S.nodes.values())
      v.sourceFile && f.add(v.sourceFile);
    return Array.from(f).sort();
  }, [S]), { visibleNodes: z, visibleEdges: L, visibleIds: T, nodeSummaries: Z } = d.useMemo(() => {
    const f = K.current;
    if (!f) return { visibleNodes: [], visibleEdges: [], visibleIds: /* @__PURE__ */ new Set(), nodeSummaries: /* @__PURE__ */ new Map() };
    const v = M.size > 0, D = /* @__PURE__ */ new Set(), R = [];
    for (const j of f.nodes)
      I.has(hn(j.nodeType)) && (v && j.sourceFile && !M.has(j.sourceFile) || (D.add(j.id), R.push(j)));
    const W = (j) => f.getNode(j), ae = [], ue = /* @__PURE__ */ new Map();
    for (const j of f.edges) {
      const mn = D.has(j.sourceId), Xn = D.has(j.targetId);
      if (j.edgeType === "containment") {
        if (!mn) continue;
        if (Xn)
          ae.push(j);
        else {
          const yn = wt(j.targetId, D, W);
          if (yn) {
            const Xe = W(yn);
            ae.push({
              ...j,
              targetId: yn,
              targetLevel: (Xe == null ? void 0 : Xe.level) ?? j.targetLevel,
              targetNodeType: (Xe == null ? void 0 : Xe.nodeType) ?? j.targetNodeType,
              id: `grad:${j.id}`
            });
          }
        }
      } else {
        const yn = qn(j.sourceId, mn, "src", f, D, W), Xe = qn(j.targetId, Xn, "tgt", f, D, W);
        for (const Mn of yn)
          for (const $n of Xe) {
            if (Mn === $n) continue;
            const Rn = `${Mn}→${$n}`, jn = ue.get(Rn);
            if (jn && jn.nexusEndpoint && !j.nexusEndpoint) continue;
            const cn = W(Mn), ln = W($n);
            ue.set(Rn, {
              ...j,
              sourceId: Mn,
              targetId: $n,
              sourceLevel: (cn == null ? void 0 : cn.level) ?? j.sourceLevel,
              targetLevel: (ln == null ? void 0 : ln.level) ?? j.targetLevel,
              sourceNodeType: (cn == null ? void 0 : cn.nodeType) ?? j.sourceNodeType,
              targetNodeType: (ln == null ? void 0 : ln.nodeType) ?? j.targetNodeType,
              id: `grad:${Rn}`
            });
          }
      }
    }
    const Ae = [...ae, ...ue.values()], Re = /* @__PURE__ */ new Map();
    for (const j of R) Re.set(j.id, j);
    const Sn = /* @__PURE__ */ new Map();
    for (const j of R) {
      const mn = Js(j, Ae, Re);
      mn && Sn.set(j.id, mn);
    }
    return { visibleNodes: R, visibleEdges: Ae, visibleIds: D, nodeSummaries: Sn };
  }, [I, M, S, H]), { visibleMatchIds: fe, hiddenMatchCount: en } = d.useMemo(() => {
    if (!r) return { visibleMatchIds: null, hiddenMatchCount: 0 };
    const f = r.toLowerCase(), v = K.current;
    if (!v) return { visibleMatchIds: /* @__PURE__ */ new Set(), hiddenMatchCount: 0 };
    const D = /* @__PURE__ */ new Set();
    let R = 0;
    for (const W of v.nodes)
      W.name.toLowerCase().includes(f) && (T.has(W.id) ? D.add(W.id) : R++);
    return { visibleMatchIds: D, hiddenMatchCount: R };
  }, [r, T]), { highlightedNodes: ne, highlightedEdges: ie } = d.useMemo(() => {
    var ae;
    const f = he ?? oe;
    if (!f || !T.has(f))
      return { highlightedNodes: null, highlightedEdges: null };
    const D = Ts(f, L, T, V ? "upstream" : "downstream"), R = (ae = K.current) == null ? void 0 : ae.getNode(f);
    if (R) {
      const ue = S.duplicateGroups.get(R.definitionKey);
      if (ue && ue.size > 1)
        for (const Ae of ue)
          T.has(Ae) && D.add(Ae);
    }
    const W = Ss(D, L);
    return { highlightedNodes: D, highlightedEdges: W };
  }, [he, oe, V, L, T, S]);
  d.useEffect(() => {
    if (!w) return;
    let f = 0;
    const v = () => {
      const D = K.current;
      if (!D) return;
      if (D.tick(T), !y.current && D.alpha < 0.3) {
        const ue = m.current;
        if (ue) {
          const { width: Ae, height: Re } = ue.getBoundingClientRect();
          Ae > 0 && Re > 0 && (F(Fn(z, Ae, Re)), y.current = !0);
        }
      }
      if (y.current && E.current) {
        const ue = D.getNode(E.current.nodeId);
        if (ue) {
          const Ae = m.current;
          if (Ae) {
            const { width: Re, height: Sn } = Ae.getBoundingClientRect();
            F((j) => ({
              scale: Math.max(j.scale, 1.2),
              x: Re / 2 - ue.x * Math.max(j.scale, 1.2),
              y: Sn / 2 - ue.y * Math.max(j.scale, 1.2)
            })), Ee(ue.id);
          }
        }
        E.current = null;
      }
      const R = performance.now(), W = _.current;
      W.frames++, W.lastStamp === 0 && (W.lastStamp = R);
      const ae = R - W.lastStamp;
      if (ae >= 500) {
        const ue = Math.round(W.frames * 1e3 / ae);
        Y((Ae) => Ae === ue ? Ae : ue), W.frames = 0, W.lastStamp = R;
      }
      if (D.isStable()) {
        x(!1);
        return;
      }
      f = requestAnimationFrame(v);
    };
    return f = requestAnimationFrame(v), () => {
      f && cancelAnimationFrame(f);
    };
  }, [w, T, z, oe]);
  const [, me] = d.useState(0);
  d.useEffect(() => {
    if (!w || !he) return;
    const f = window.setInterval(() => me((v) => v + 1), 100);
    return () => window.clearInterval(f);
  }, [w, he]);
  const se = d.useRef(I);
  d.useEffect(() => {
    const f = se.current;
    if (f === I) return;
    const v = K.current;
    if (v) {
      for (const D of v.nodes) {
        const R = hn(D.nodeType);
        if (I.has(R) && !f.has(R)) {
          let W = D.parentId;
          for (; W; ) {
            const ae = v.getNode(W);
            if (!ae) break;
            if (I.has(hn(ae.nodeType))) {
              v.seedAt(D.id, ae.x, ae.y);
              break;
            }
            W = ae.parentId;
          }
        }
      }
      v.reheat(0.5), x(!0), y.current = !1;
    }
    se.current = I;
  }, [I]);
  const ye = d.useRef(M);
  d.useEffect(() => {
    if (ye.current === M) return;
    const v = K.current;
    v && (v.reheat(0.3), x(!0)), ye.current = M;
  }, [M]);
  const de = d.useCallback((f, v) => {
    Q((D) => {
      var W;
      const R = { ...D, [f]: v };
      return (W = K.current) == null || W.setParams(R), R;
    });
  }, []), ge = d.useCallback((f, v, D) => {
    var R, W;
    p.current = f, (R = K.current) == null || R.pinNode(f, v, D), (W = K.current) == null || W.reheat(0.3), x(!0);
  }, []), we = d.useCallback((f, v) => {
    var D;
    p.current && ((D = K.current) == null || D.pinNode(p.current, f, v));
  }, []), Me = d.useCallback(() => {
    var f;
    p.current && ((f = K.current) == null || f.unpinNode(p.current), p.current = null);
  }, []), De = d.useCallback((f) => {
    const v = K.current, D = m.current;
    if (!v || !D || !v.getNode(f)) return;
    const W = /* @__PURE__ */ new Set([f]);
    for (const Re of v.edges)
      Re.sourceId === f && W.add(Re.targetId), Re.targetId === f && W.add(Re.sourceId);
    const ae = v.nodes.filter((Re) => W.has(Re.id)), { width: ue, height: Ae } = D.getBoundingClientRect();
    F(Fn(ae, ue, Ae, 80));
  }, []), Fe = d.useCallback(() => {
    const f = m.current;
    if (!f) return;
    const { width: v, height: D } = f.getBoundingClientRect();
    F(Fn(z, v, D));
  }, [z]), Te = d.useCallback(() => {
    var f;
    w ? x(!1) : ((f = K.current) == null || f.reheat(0.5), x(!0));
  }, [w]), nn = d.useCallback(() => {
    var f;
    (f = K.current) == null || f.reheat(1), x(!0);
  }, []), We = (f) => {
    const v = new Set(s.visibleTypes);
    v.has(f) ? v.delete(f) : v.add(f), o({ ...s, visibleTypes: v });
  }, Ke = (f) => {
    const v = new Set(s.selectedFiles);
    v.has(f) ? v.delete(f) : v.add(f), o({ ...s, selectedFiles: v });
  }, ve = () => {
    h ? u("", !1) : (u(r, !0), setTimeout(() => {
      var f;
      return (f = ke.current) == null ? void 0 : f.focus();
    }, 50));
  }, Ie = () => l({ ...a, files: !a.files }), qe = () => l({ ...a, types: !a.types }), Pe = d.useCallback((f, v, D) => {
    Qe({ x: v, y: D, nodeId: f });
  }, []), _e = d.useCallback(() => Qe(null), []), an = d.useMemo(() => {
    var v;
    if (!Ce || !t) return [];
    const f = (v = K.current) == null ? void 0 : v.getNode(Ce.nodeId);
    return f ? [{
      label: "Show in Tree",
      onClick: () => t(f.name, hn(f.nodeType))
    }] : [];
  }, [Ce, t]), Ue = (f) => {
    Ee(f);
    const v = K.current, D = m.current;
    if (!v || !D) return;
    const R = v.getNode(f);
    if (!R) return;
    const { width: W, height: ae } = D.getBoundingClientRect();
    F({
      scale: g.scale,
      x: W / 2 - R.x * g.scale,
      y: ae / 2 - R.y * g.scale
    });
  }, tn = Le >= 0 && Le < z.length ? z[Le].id : null;
  d.useEffect(() => {
    var W;
    if (!k) return;
    const { name: f, defType: v } = k, D = Zs(v), R = K.current;
    if (R) {
      const ae = R.nodes.find((ue) => ue.name === f && ue.nodeType === D);
      ae && (E.current = { nodeId: ae.id }, w || ((W = K.current) == null || W.reheat(0.1), x(!0)));
    }
    C();
  }, [k]), d.useEffect(() => {
    const f = (D) => {
      D.key === "Shift" && G(!0);
    }, v = (D) => {
      D.key === "Shift" && G(!1);
    };
    return window.addEventListener("keydown", f), window.addEventListener("keyup", v), () => {
      window.removeEventListener("keydown", f), window.removeEventListener("keyup", v);
    };
  }, []), d.useEffect(() => {
    const f = (v) => {
      var D;
      if (!(v.target instanceof HTMLInputElement || v.target instanceof HTMLTextAreaElement))
        switch (v.key) {
          case "Tab": {
            v.preventDefault();
            const R = z.length;
            if (R === 0) return;
            v.shiftKey ? re((W) => W > 0 ? W - 1 : R - 1) : re((W) => W < R - 1 ? W + 1 : 0);
            break;
          }
          case "Enter": {
            v.preventDefault(), tn && Ee(tn);
            break;
          }
          case "Escape": {
            if (v.preventDefault(), B) {
              $e(!1);
              break;
            }
            if (h) {
              ve();
              break;
            }
            if (oe) {
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
            const R = 30, W = v.key === "ArrowLeft" ? R : v.key === "ArrowRight" ? -R : 0, ae = v.key === "ArrowUp" ? R : v.key === "ArrowDown" ? -R : 0;
            F((ue) => ({ ...ue, x: ue.x + W, y: ue.y + ae }));
            break;
          }
          case "+":
          case "=": {
            v.preventDefault(), F((R) => {
              var W, ae;
              return Vn(R, (((W = m.current) == null ? void 0 : W.clientWidth) ?? 400) / 2, (((ae = m.current) == null ? void 0 : ae.clientHeight) ?? 400) / 2, 1.15);
            });
            break;
          }
          case "-":
          case "_": {
            v.preventDefault(), F((R) => {
              var W, ae;
              return Vn(R, (((W = m.current) == null ? void 0 : W.clientWidth) ?? 400) / 2, (((ae = m.current) == null ? void 0 : ae.clientHeight) ?? 400) / 2, 0.85);
            });
            break;
          }
          case "f":
          case "F": {
            v.preventDefault(), Fe();
            break;
          }
          case "/": {
            v.preventDefault(), h ? (D = ke.current) == null || D.focus() : (u(r, !0), setTimeout(() => {
              var R;
              return (R = ke.current) == null ? void 0 : R.focus();
            }, 50));
            break;
          }
          case " ": {
            v.preventDefault(), Te();
            break;
          }
          case "?": {
            v.preventDefault(), $e((R) => !R);
            break;
          }
        }
    };
    return window.addEventListener("keydown", f), () => window.removeEventListener("keydown", f);
  }, [z, tn, oe, h, r, u, B, Fe, Te]);
  const sn = e.errors || [], { shownFileErrors: xt, hiddenFileErrors: Tt } = d.useMemo(() => {
    if (M.size === 0) return { shownFileErrors: sn, hiddenFileErrors: [] };
    const f = [], v = [];
    for (const D of sn)
      M.has(D.file) ? f.push(D) : v.push(D);
    return { shownFileErrors: f, hiddenFileErrors: v };
  }, [sn, M]), St = te.length > 0, Mt = sn.length > 0, $t = M.size === 0, zn = z.length, Un = L.length;
  return /* @__PURE__ */ i("div", { className: "graph-view", ref: m, children: [
    /* @__PURE__ */ i("div", { className: "graph-canvas-area", children: [
      /* @__PURE__ */ n(
        As,
        {
          nodes: z,
          edges: L,
          viewport: g,
          onViewportChange: F,
          onNodeDragStart: ge,
          onNodeDragMove: we,
          onNodeDragEnd: Me,
          onDoubleClickNode: De,
          onHoverNode: xe,
          onSelectNode: Ee,
          onNodeContextMenu: Pe,
          highlightedNodes: ne,
          highlightedEdges: ie,
          hoveredNodeId: he,
          selectedNodeId: oe,
          focusedNodeId: tn,
          searchMatchIds: fe,
          running: w,
          showForceFields: ce,
          forceParams: U,
          activeSection: O,
          activeChargeType: ee,
          activeGravityType: X,
          nodeSummaries: Z
        }
      ),
      /* @__PURE__ */ n(
        eo,
        {
          hoveredNodeId: he,
          simRef: K,
          visibleEdges: L,
          visibleIds: T,
          viewport: g,
          shiftHeld: V,
          duplicateGroups: S.duplicateGroups
        }
      )
    ] }),
    /* @__PURE__ */ i("div", { className: "graph-overlay", children: [
      /* @__PURE__ */ i("div", { className: "canvas-header", children: [
        St && /* @__PURE__ */ i(wn, { children: [
          /* @__PURE__ */ i("div", { className: `header-files-section${a.files ? " section-pinned" : ""}`, children: [
            /* @__PURE__ */ n("div", { className: "header-files-row", children: te.map((f) => {
              const v = f.split("/").pop() || f, D = M.has(f), R = b.has(`file:${f}`), W = [
                "header-file-tag",
                $t ? "all-included" : D ? "selected" : "",
                R ? "recently-changed" : ""
              ].filter(Boolean).join(" ");
              return /* @__PURE__ */ i("button", { className: W, onClick: () => Ke(f), title: f, children: [
                /* @__PURE__ */ n("span", { className: "header-file-icon", children: "📄" }),
                /* @__PURE__ */ n("span", { className: "header-file-name", children: v })
              ] }, f);
            }) }),
            /* @__PURE__ */ n(
              In,
              {
                pinned: a.files,
                onClick: Ie,
                flashing: A.has("files"),
                label: "Files"
              }
            )
          ] }),
          /* @__PURE__ */ n("div", { className: "header-divider" })
        ] }),
        /* @__PURE__ */ i("div", { className: `header-types-section${a.types ? " section-pinned" : ""}`, children: [
          /* @__PURE__ */ n("div", { className: "header-types-row", children: vn.map((f) => {
            const v = I.has(f.type), D = b.has(`type:${f.type}`), R = [
              "header-type-tag",
              v ? "active" : "",
              `header-type-${f.type}`,
              D ? "recently-changed" : ""
            ].filter(Boolean).join(" ");
            return /* @__PURE__ */ i(
              "button",
              {
                className: R,
                onClick: () => We(f.type),
                title: v ? `Hide ${f.label.toLowerCase()}` : `Show ${f.label.toLowerCase()}`,
                children: [
                  /* @__PURE__ */ n("span", { className: "header-type-icon", children: f.icon }),
                  /* @__PURE__ */ n("span", { className: "header-type-label", children: f.label })
                ]
              },
              f.type
            );
          }) }),
          /* @__PURE__ */ n(
            In,
            {
              pinned: a.types,
              onClick: qe,
              flashing: A.has("types"),
              label: "Types"
            }
          )
        ] }),
        /* @__PURE__ */ n("div", { className: "header-divider" }),
        /* @__PURE__ */ n("div", { className: "header-controls-section", children: /* @__PURE__ */ i("div", { className: `header-search ${h ? "active" : ""}`, children: [
          /* @__PURE__ */ n("button", { className: "header-search-toggle", onClick: ve, title: "Search nodes (/)", children: /* @__PURE__ */ n(ut, { size: 14 }) }),
          h && /* @__PURE__ */ n(
            "input",
            {
              ref: ke,
              className: "header-search-input",
              type: "text",
              placeholder: "Search nodes...",
              value: r,
              onChange: (f) => u(f.target.value, !0),
              onKeyDown: (f) => {
                f.key === "Escape" && ve();
              }
            }
          ),
          en > 0 && /* @__PURE__ */ i("span", { className: "header-search-badge", title: `${en} match${en !== 1 ? "es" : ""} hidden by filters`, children: [
            "+",
            en
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ i("div", { className: "graph-toolbar", children: [
        /* @__PURE__ */ i("span", { className: "graph-toolbar-count", children: [
          zn,
          " node",
          zn !== 1 ? "s" : "",
          ", ",
          Un,
          " edge",
          Un !== 1 ? "s" : "",
          w && /* @__PURE__ */ i("span", { className: "graph-toolbar-fps", title: "Simulation frames per second", children: [
            "  ·  ",
            q,
            " fps"
          ] })
        ] }),
        oe && t && (() => {
          var v;
          const f = (v = K.current) == null ? void 0 : v.getNode(oe);
          return f ? /* @__PURE__ */ n(
            "button",
            {
              className: "graph-toolbar-btn",
              onClick: () => t(f.name, hn(f.nodeType)),
              title: "Show in Tree view",
              children: "Show in Tree"
            }
          ) : null;
        })(),
        /* @__PURE__ */ n("button", { className: "graph-toolbar-btn", onClick: Fe, title: "Fit to view (F)", children: "Fit" }),
        /* @__PURE__ */ n(
          "button",
          {
            className: `graph-toolbar-btn ${w ? "active" : ""}`,
            onClick: Te,
            title: w ? "Pause simulation (Space)" : "Resume simulation (Space)",
            children: w ? "Pause" : "Play"
          }
        )
      ] }),
      fe && fe.size > 0 && h && /* @__PURE__ */ n("div", { className: "graph-search-results", children: z.filter((f) => fe.has(f.id)).map((f) => /* @__PURE__ */ i(
        "button",
        {
          className: "graph-search-result",
          onClick: () => Ue(f.id),
          children: [
            /* @__PURE__ */ n("span", { className: "graph-search-result-type", children: f.nodeType }),
            /* @__PURE__ */ n("span", { className: "graph-search-result-name", children: f.name })
          ]
        },
        f.id
      )) }),
      Mt && /* @__PURE__ */ n(no, { shownFileErrors: xt, hiddenFileErrors: Tt })
    ] }),
    /* @__PURE__ */ n(
      Gs,
      {
        params: U,
        onParamChange: de,
        running: w,
        onToggleRunning: Te,
        onReheat: nn,
        showForceFields: ce,
        onToggleForceFields: () => be((f) => !f),
        onActiveSection: c,
        onActiveChargeType: le,
        onActiveGravityType: Se
      }
    ),
    Ce && an.length > 0 && /* @__PURE__ */ n(
      js,
      {
        x: Ce.x,
        y: Ce.y,
        items: an,
        onClose: _e
      }
    ),
    B && /* @__PURE__ */ i("div", { className: "graph-shortcuts-panel", children: [
      /* @__PURE__ */ i("div", { className: "graph-shortcuts-title", children: [
        "Keyboard Shortcuts",
        /* @__PURE__ */ n("button", { className: "graph-shortcuts-close", onClick: () => $e(!1), children: "×" })
      ] }),
      /* @__PURE__ */ i("div", { className: "graph-shortcuts-list", children: [
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
function eo({ hoveredNodeId: e, simRef: t, visibleEdges: s, visibleIds: o, viewport: a, shiftHeld: l, duplicateGroups: r }) {
  var Q, K;
  if (!e) return null;
  const h = t.current;
  if (!h) return null;
  const u = h.getNode(e);
  if (!u) return null;
  const k = u.parentId ? (Q = h.getNode(u.parentId)) == null ? void 0 : Q.name : void 0, C = vn.find((p) => p.type === hn(u.nodeType)), A = (K = u.sourceFile) == null ? void 0 : K.split("/").pop();
  let N = 0, I = 0;
  for (const p of s)
    p.edgeType !== "containment" && (p.sourceId === e && N++, p.targetId === e && I++);
  const M = r.get(u.definitionKey), g = M ? Array.from(M).filter((p) => o.has(p)) : [u.id], F = g.length, w = F > 1 ? g.indexOf(u.id) + 1 : 0, [x, U] = Ye(a, u.x, u.y);
  return /* @__PURE__ */ i("div", { className: "graph-hover-tooltip", style: { left: x, top: U }, children: [
    /* @__PURE__ */ i("div", { className: "tooltip-identity", children: [
      C && /* @__PURE__ */ n("span", { className: "tooltip-type-icon", children: C.icon }),
      /* @__PURE__ */ n("span", { className: "tooltip-name", children: u.name })
    ] }),
    k && /* @__PURE__ */ n("div", { className: "tooltip-parent", children: k }),
    A && /* @__PURE__ */ n("div", { className: "tooltip-file", children: A }),
    F > 1 && /* @__PURE__ */ i("div", { className: "tooltip-duplicates", title: "This definition is registered on multiple workers. Hovering any copy highlights all copies.", children: [
      "copy ",
      w,
      " of ",
      F
    ] }),
    (N > 0 || I > 0) && /* @__PURE__ */ i("div", { className: "tooltip-connections", children: [
      N > 0 && /* @__PURE__ */ i("span", { className: "tooltip-conn-out", children: [
        "→",
        N
      ] }),
      I > 0 && /* @__PURE__ */ i("span", { className: "tooltip-conn-in", children: [
        "←",
        I
      ] })
    ] }),
    /* @__PURE__ */ n("div", { className: "tooltip-direction", children: l ? "dependents" : "dependencies" })
  ] });
}
function He({ keys: e, desc: t }) {
  return /* @__PURE__ */ i("div", { className: "graph-shortcut-row", children: [
    /* @__PURE__ */ n("kbd", { className: "graph-shortcut-key", children: e }),
    /* @__PURE__ */ n("span", { className: "graph-shortcut-desc", children: t })
  ] });
}
function no({ shownFileErrors: e, hiddenFileErrors: t }) {
  const [s, o] = d.useState(!0), a = e.length + t.length;
  return /* @__PURE__ */ i("div", { className: "graph-errors-header", children: [
    /* @__PURE__ */ i("div", { className: "graph-errors-bar", onClick: () => o(!s), children: [
      /* @__PURE__ */ n("span", { className: "block-toggle", children: s ? "▼" : "▶" }),
      /* @__PURE__ */ n("span", { className: "graph-errors-icon", children: P.error.icon }),
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
function to(e, t, s, o) {
  switch (o.kind) {
    case "manual":
      return so(e, t, s);
    case "focus":
      return oo(e, s, o.target);
  }
}
function so(e, t, s) {
  const o = dt(e);
  return s.files || (o.selectedFiles = new Set(t.selectedFiles)), s.types || (o.visibleTypes = new Set(t.visibleTypes)), {
    filter: Wn(o, e) ? e : o,
    overriddenPins: /* @__PURE__ */ new Set()
  };
}
function oo(e, t, s) {
  const o = dt(e), a = /* @__PURE__ */ new Set();
  return o.visibleTypes.has(s.defType) || (o.visibleTypes.add(s.defType), t.types && a.add("types")), s.sourceFile && e.selectedFiles.size > 0 && !e.selectedFiles.has(s.sourceFile) && (o.selectedFiles.add(s.sourceFile), t.files && a.add("files")), {
    filter: Wn(o, e) ? e : o,
    overriddenPins: a
  };
}
const Ln = "temporal-architect-visualizer-state";
let pn = null, at = !1;
function vt() {
  if (at) return pn;
  at = !0;
  const e = window;
  if (e.__twfVsCodeApi)
    return pn = e.__twfVsCodeApi, pn;
  if (typeof e.acquireVsCodeApi == "function")
    try {
      return pn = e.acquireVsCodeApi(), e.__twfVsCodeApi = pn, pn;
    } catch {
      return null;
    }
  return null;
}
function ao() {
  const e = vt();
  if (e) {
    const t = e.getState();
    if (t && typeof t == "object") {
      const o = t[Ln];
      if (o && typeof o == "object")
        return o;
    }
    return {};
  }
  try {
    const t = localStorage.getItem(Ln);
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}
function co(e) {
  const t = vt();
  if (t) {
    const s = t.getState(), o = s && typeof s == "object" ? { ...s } : {};
    o[Ln] = e, t.setState(o);
    return;
  }
  try {
    localStorage.setItem(Ln, JSON.stringify(e));
  } catch {
  }
}
const ze = d.createContext({
  workflows: /* @__PURE__ */ new Map(),
  activities: /* @__PURE__ */ new Map(),
  workers: /* @__PURE__ */ new Map(),
  nexusServices: /* @__PURE__ */ new Map(),
  namespaces: /* @__PURE__ */ new Map()
}), Tn = d.createContext({
  signals: /* @__PURE__ */ new Map(),
  queries: /* @__PURE__ */ new Map(),
  updates: /* @__PURE__ */ new Map()
}), Nt = d.createContext({
  callers: /* @__PURE__ */ new Map(),
  workerOf: /* @__PURE__ */ new Map(),
  namespaceOf: /* @__PURE__ */ new Map(),
  navigateTo: () => {
  }
}), lo = vn.filter((e) => e.defaultOn).map((e) => e.type);
function ct(e) {
  return {
    selectedFiles: e.focusedFile ? /* @__PURE__ */ new Set([e.focusedFile]) : /* @__PURE__ */ new Set(),
    visibleTypes: new Set(lo)
  };
}
const lt = { files: !1, types: !1 };
function rt(e, t) {
  return e ? {
    selectedFiles: new Set(e.selectedFiles),
    visibleTypes: new Set(e.visibleTypes)
  } : t;
}
function it(e) {
  return {
    selectedFiles: Array.from(e.selectedFiles),
    visibleTypes: Array.from(e.visibleTypes)
  };
}
function po({ ast: e, onOpenFile: t, onRefocus: s, className: o, style: a }) {
  const l = d.useMemo(() => ao(), []), [r, h] = d.useState("tree"), [u, k] = d.useState(
    () => rt(l.treeFilter, ct(e))
  ), [C, A] = d.useState(
    () => rt(l.graphFilter, ct(e))
  ), [N, I] = d.useState(() => l.treePins ?? lt), [M, g] = d.useState(() => l.graphPins ?? lt), [F, w] = d.useState(l.searchQuery ?? ""), [x, U] = d.useState(!1), [Q, K] = d.useState(null), [p, y] = d.useState(/* @__PURE__ */ new Set()), [m, E] = d.useState(/* @__PURE__ */ new Set());
  d.useEffect(() => {
    co({
      treeFilter: it(u),
      graphFilter: it(C),
      treePins: N,
      graphPins: M,
      searchQuery: F
    });
  }, [u, C, N, M, F]), d.useEffect(() => {
    const V = /* @__PURE__ */ new Set();
    for (const ce of e.definitions)
      ce.sourceFile && V.add(ce.sourceFile);
    const G = (ce) => {
      const be = new Set([...ce.selectedFiles].filter((O) => V.has(O)));
      return be.size === ce.selectedFiles.size ? ce : { ...ce, selectedFiles: be };
    };
    k(G), A(G);
  }, [e.definitions]), d.useEffect(() => {
    N.files || e.focusedFile && k((V) => {
      const G = /* @__PURE__ */ new Set([e.focusedFile]);
      return V.selectedFiles.size === 1 && V.selectedFiles.has(e.focusedFile) ? V : { ...V, selectedFiles: G };
    });
  }, [e.focusedFile, N.files]);
  const q = d.useMemo(() => {
    const V = /* @__PURE__ */ new Map(), G = /* @__PURE__ */ new Map(), ce = /* @__PURE__ */ new Map(), be = /* @__PURE__ */ new Map(), O = /* @__PURE__ */ new Map();
    for (const c of e.definitions)
      c.type === "workflowDef" ? V.set(c.name, c) : c.type === "activityDef" ? G.set(c.name, c) : c.type === "workerDef" ? ce.set(c.name, c) : c.type === "nexusServiceDef" ? be.set(c.name, c) : c.type === "namespaceDef" && O.set(c.name, c);
    return { workflows: V, activities: G, workers: ce, nexusServices: be, namespaces: O };
  }, [e]), Y = d.useCallback((V, G) => {
    if (V === r && G.kind === "manual") return;
    const ce = V === "tree" ? u : C, be = V === "tree" ? C : u, O = V === "tree" ? N : M, { filter: c, overriddenPins: ee } = to(ce, be, O, G);
    V === "tree" ? (c !== ce && k(c), y(ee)) : (c !== ce && A(c), E(ee)), G.kind === "focus" && K({ name: G.target.name, defType: G.target.defType }), h(V);
  }, [r, u, C, N, M]), _ = d.useCallback((V, G) => {
    const ce = e.definitions.find((be) => be.name === V && be.type === G);
    Y("graph", {
      kind: "focus",
      target: { name: V, defType: G, sourceFile: ce == null ? void 0 : ce.sourceFile }
    });
  }, [e.definitions, Y]), he = d.useCallback((V, G) => {
    const ce = e.definitions.find((be) => be.name === V && be.type === G);
    Y("tree", {
      kind: "focus",
      target: { name: V, defType: G, sourceFile: ce == null ? void 0 : ce.sourceFile }
    });
  }, [e.definitions, Y]), xe = d.useCallback(() => K(null), []), oe = d.useCallback((V, G) => {
    w(V), U(G);
  }, []), Ee = d.useCallback(() => {
    y((V) => V.size === 0 ? V : /* @__PURE__ */ new Set());
  }, []), Le = d.useCallback(() => {
    E((V) => V.size === 0 ? V : /* @__PURE__ */ new Set());
  }, []);
  d.useEffect(() => {
    u.selectedFiles.size === 1 && t && t(u.selectedFiles.values().next().value);
  }, [u.selectedFiles, t]);
  const re = o ? `view-shell ${o}` : "view-shell";
  return /* @__PURE__ */ n(ze.Provider, { value: q, children: /* @__PURE__ */ i("div", { className: re, style: a, onClick: s, children: [
    /* @__PURE__ */ i("div", { className: "tab-bar", children: [
      /* @__PURE__ */ n(
        "button",
        {
          className: `tab-bar-btn ${r === "tree" ? "active" : ""}`,
          onClick: () => Y("tree", { kind: "manual" }),
          children: "Tree"
        }
      ),
      /* @__PURE__ */ n(
        "button",
        {
          className: `tab-bar-btn ${r === "graph" ? "active" : ""}`,
          onClick: () => Y("graph", { kind: "manual" }),
          children: "Graph"
        }
      )
    ] }),
    r === "tree" ? /* @__PURE__ */ n(
      gs,
      {
        ast: e,
        onShowInGraph: _,
        filter: u,
        onFilterChange: k,
        pins: N,
        onPinsChange: I,
        searchQuery: F,
        searchActive: x,
        onSearchChange: oe,
        pendingFocus: Q,
        onFocusConsumed: xe,
        overriddenPins: p,
        onOverriddenPinsConsumed: Ee
      }
    ) : /* @__PURE__ */ n(
      Qs,
      {
        ast: e,
        onShowInTree: he,
        filter: C,
        onFilterChange: A,
        pins: M,
        onPinsChange: g,
        searchQuery: F,
        searchActive: x,
        onSearchChange: oe,
        pendingFocus: Q,
        onFocusConsumed: xe,
        overriddenPins: m,
        onOverriddenPinsConsumed: Le
      }
    )
  ] }) });
}
export {
  po as Visualizer
};
//# sourceMappingURL=lib.js.map
