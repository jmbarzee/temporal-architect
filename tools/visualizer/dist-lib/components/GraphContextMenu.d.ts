export interface ContextMenuItem {
    label: string;
    onClick: () => void;
}
interface GraphContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}
export declare function GraphContextMenu({ x, y, items, onClose }: GraphContextMenuProps): import("react/jsx-runtime").JSX.Element;
export {};
