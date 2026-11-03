export interface IAndroidSystemBarInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

const PROPERTIES: Array<[keyof IAndroidSystemBarInsets, string]> = [
    ["top", "--sy-android-safe-area-inset-top"],
    ["right", "--sy-android-safe-area-inset-right"],
    ["bottom", "--sy-android-safe-area-inset-bottom"],
    ["left", "--sy-android-safe-area-inset-left"],
];

const isValidInset = (value: number) => typeof value === "number" && Number.isFinite(value) && value >= 0;

export const applyAndroidSystemBarInsets = (insets: IAndroidSystemBarInsets) => {
    if (!insets || ![insets.top, insets.right, insets.bottom, insets.left].every(isValidInset)) {
        return;
    }
    const root = document.documentElement;
    PROPERTIES.forEach(([key, name]) => {
        const pixels = `${insets[key]}px`;
        if (root.style.getPropertyValue(name) !== pixels) {
            root.style.setProperty(name, pixels);
        }
    });
    if (!root.hasAttribute("data-android-system-bars")) {
        root.setAttribute("data-android-system-bars", "1");
    }
};

if (typeof window !== "undefined") {
    const pending = window.__siyuanAndroidSafeAreaQueue;
    window.__siyuanAndroidSafeArea = applyAndroidSystemBarInsets;
    if (pending) {
        applyAndroidSystemBarInsets(pending);
    }
}
