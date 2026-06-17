import { Statement } from '../../types/ast';
interface StatementBlockProps {
    statement: Statement;
}
export declare function StatementBody({ statements }: {
    statements: Statement[];
}): import("react/jsx-runtime").JSX.Element | null;
export declare function StatementBlock({ statement }: StatementBlockProps): import("react/jsx-runtime").JSX.Element | null;
export {};
