import { WorkflowDef, Statement } from '../../types/ast';
export declare function WorkflowContent({ def }: {
    def: WorkflowDef;
}): import("react/jsx-runtime").JSX.Element;
export declare function InlineWorkflowBlock({ def }: {
    def: WorkflowDef;
}): import("react/jsx-runtime").JSX.Element;
export declare function SyncBodyBlock({ body }: {
    body: Statement[];
}): import("react/jsx-runtime").JSX.Element;
