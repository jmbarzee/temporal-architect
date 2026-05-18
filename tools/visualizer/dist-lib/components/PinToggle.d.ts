interface PinToggleProps {
    pinned: boolean;
    onClick: () => void;
    flashing?: boolean;
    label: string;
}
export declare function PinToggle({ pinned, onClick, flashing, label }: PinToggleProps): import("react/jsx-runtime").JSX.Element;
export {};
