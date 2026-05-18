import { Definition, NexusOperation } from '../../types/ast';
interface DefinitionBlockProps {
    definition: Definition;
    expanded?: boolean;
    onToggle?: () => void;
}
export declare function DefinitionBlock({ definition, expanded, onToggle }: DefinitionBlockProps): import("react/jsx-runtime").JSX.Element | null;
export declare function NexusOperationBlock({ operation }: {
    operation: NexusOperation;
}): import("react/jsx-runtime").JSX.Element;
export {};
