import { default as React } from 'react';
import { TWFFile, WorkflowDef, ActivityDef, WorkerDef, NamespaceDef, NexusServiceDef, SignalDecl, QueryDecl, UpdateDecl } from '../types/ast';
import { ParserGraph } from '../types/parser-graph';
interface WorkflowCanvasProps {
    /** Parsed TWF AST to visualize. Produced by `twf parse` (the `definitions`
     * payload of the envelope) or constructed by a host application. The
     * tree view consumes this directly; the graph view consults it as
     * secondary input (sourceFile / hover details). */
    ast: TWFFile;
    /** Resolved deployment graph from `twf graph`. Primary input for the
     * graph view; the tree view doesn't consume it. Optional — when absent
     * the graph view renders an empty graph (no errors, just nothing to
     * draw), which is the right behaviour for hosts that don't yet ship
     * `twf graph` output (older extension builds, AST-only fixtures). */
    parserGraph?: ParserGraph;
    /** Invoked when the user narrows the file filter to exactly one file —
     * a hint to host applications (e.g. VS Code) to focus that file in their
     * editor. Optional; ignored when not provided. */
    onOpenFile?: (file: string) => void;
    /** Invoked when the user interacts with the canvas in a way that implies
     * "give focus back to the editor" (currently any click inside the canvas).
     * Host applications wire this to whatever "refocus editor" means in their
     * environment. Optional; no-op when not provided. */
    onRefocus?: () => void;
    /** Optional className applied to the outer container; appended after the
     * built-in `view-shell` class so consumers can layer overrides. */
    className?: string;
    /** Optional inline style applied to the outer container. */
    style?: React.CSSProperties;
}
export interface DefinitionContext {
    workflows: Map<string, WorkflowDef>;
    activities: Map<string, ActivityDef>;
    workers: Map<string, WorkerDef>;
    nexusServices: Map<string, NexusServiceDef>;
    namespaces: Map<string, NamespaceDef>;
}
export interface HandlerContext {
    signals: Map<string, SignalDecl>;
    queries: Map<string, QueryDecl>;
    updates: Map<string, UpdateDecl>;
}
export declare const DefinitionContext: React.Context<DefinitionContext>;
export declare const HandlerContext: React.Context<HandlerContext>;
export interface CallerRef {
    defName: string;
    defType: string;
}
export interface NavigationContextType {
    callers: Map<string, CallerRef[]>;
    workerOf: Map<string, string[]>;
    namespaceOf: Map<string, string[]>;
    navigateTo: (name: string, defType: string) => void;
    showInGraph?: (name: string, defType: string) => void;
}
export declare const NavigationContext: React.Context<NavigationContextType>;
export interface CrossViewTarget {
    name: string;
    defType: string;
}
export declare function WorkflowCanvas({ ast, parserGraph, onOpenFile, onRefocus, className, style }: WorkflowCanvasProps): import("react/jsx-runtime").JSX.Element;
export {};
