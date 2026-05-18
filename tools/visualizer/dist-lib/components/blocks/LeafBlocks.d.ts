import { ReturnStmt, CloseStmt, RawStmt, Comment, PromiseStmt, SetStmt, UnsetStmt } from '../../types/ast';
export declare function ReturnBlock({ stmt }: {
    stmt: ReturnStmt;
}): import("react/jsx-runtime").JSX.Element;
export declare function CloseBlock({ stmt }: {
    stmt: CloseStmt;
}): import("react/jsx-runtime").JSX.Element;
export declare function RawBlock({ stmt }: {
    stmt: RawStmt;
}): import("react/jsx-runtime").JSX.Element;
export declare function CommentBlock({ stmt }: {
    stmt: Comment;
}): import("react/jsx-runtime").JSX.Element;
export declare function SimpleBlock({ keyword, className }: {
    keyword: string;
    className: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function PromiseBlock({ stmt }: {
    stmt: PromiseStmt;
}): import("react/jsx-runtime").JSX.Element;
export declare function SetBlock({ stmt }: {
    stmt: SetStmt;
}): import("react/jsx-runtime").JSX.Element;
export declare function UnsetBlock({ stmt }: {
    stmt: UnsetStmt;
}): import("react/jsx-runtime").JSX.Element;
