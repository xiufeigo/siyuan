const SUPPRESS_BACK_MS = 300;
let suppressBackUntil = 0;
let bound = false;

export const isPlainEscapeKey = (event: Pick<KeyboardEvent, "key" | "code" | "keyCode" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing">) => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return false;
    }
    return event.key === "Escape" || event.key === "Esc" || event.code === "Escape" || event.keyCode === 27;
};

export const markAndroidEscapeBack = (now = Date.now()) => {
    suppressBackUntil = now + SUPPRESS_BACK_MS;
};

export const consumeAndroidEscapeBack = (now = Date.now()) => {
    return now <= suppressBackUntil;
};

const closestElement = (target: EventTarget | null) => {
    if (target instanceof Element) {
        return target;
    }
    if (target instanceof Node) {
        return target.parentElement;
    }
    return null;
};

const blockingPageOpen = () => {
    if (document.querySelector(".b3-dialog:not(.fn__none)")) {
        return true;
    }
    for (const id of ["model", "sidebar", "sidebarRight", "menu"]) {
        const element = document.getElementById(id);
        if (element?.style.transform === "translateX(0px)") {
            return true;
        }
    }
    return false;
};

const editableWysiwyg = (wysiwyg: Element | null) => {
    if (!(wysiwyg instanceof HTMLElement) || wysiwyg.getAttribute("contenteditable") === "false" ||
        wysiwyg.closest(".fn__none")) {
        return null;
    }
    return wysiwyg;
};

const foregroundWysiwyg = () => {
    const mobileEditor = document.getElementById("editor");
    if (mobileEditor) {
        if (mobileEditor.classList.contains("fn__none")) {
            return null;
        }
        return editableWysiwyg(mobileEditor.querySelector(".protyle-wysiwyg"));
    }
    for (const candidate of document.querySelectorAll(".layout__wnd--active .protyle-content .protyle-wysiwyg")) {
        const editable = editableWysiwyg(candidate);
        if (editable) {
            return editable;
        }
    }
    return null;
};

// 笔记编辑区返回可插入反引号的元素。对话框、滑出面板、菜单和文档树等其他界面返回空。
export const resolveAndroidNoteEditable = (target: EventTarget | null) => {
    if (blockingPageOpen()) {
        return null;
    }
    const element = closestElement(target);
    const menu = element?.closest(".b3-menu");
    if ((menu && !menu.classList.contains("fn__none")) ||
        element?.closest(".av__panel, .layout__dock, .sy__file, #sidebar, #menu, #model, .config")) {
        return null;
    }
    const title = element?.closest(".protyle-title [contenteditable='true']");
    if (title instanceof HTMLElement && !title.closest(".layout__dock, .fn__none")) {
        return title;
    }
    const surface = element?.closest(".protyle-wysiwyg");
    if (surface instanceof HTMLElement && !surface.closest(".layout__dock")) {
        const wysiwyg = editableWysiwyg(surface);
        if (!wysiwyg) {
            return null;
        }
        const inline = element.closest("[contenteditable='true']");
        return inline instanceof HTMLElement ? inline : wysiwyg;
    }
    if (element?.closest("input, textarea, select, [contenteditable='true']")) {
        return null;
    }
    const neutral = !element || element === document.body || element === document.documentElement;
    return neutral ? foregroundWysiwyg() : null;
};

const insertBacktick = (editable: HTMLElement) => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0 || !editable.contains(selection.anchorNode)) {
        const nested = editable.classList.contains("protyle-wysiwyg") ?
            editable.querySelectorAll<HTMLElement>("[contenteditable='true']") : undefined;
        const target = nested && nested.length > 0 ? nested.item(nested.length - 1) :
            editable.matches("[contenteditable='true']") ? editable :
                editable.querySelector<HTMLElement>("[contenteditable='true']") || editable;
        target.focus();
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
    }
    if (document.execCommand("insertText", false, "`")) {
        return;
    }
    const currentSelection = document.getSelection();
    if (!currentSelection || currentSelection.rangeCount === 0) {
        return;
    }
    const range = currentSelection.getRangeAt(0);
    range.deleteContents();
    const text = document.createTextNode("`");
    range.insertNode(text);
    range.setStartAfter(text);
    range.collapse(true);
    currentSelection.removeAllRanges();
    currentSelection.addRange(range);
    editable.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "`",
    }));
};

const onAndroidEscapeKey = (event: KeyboardEvent) => {
    if (!isPlainEscapeKey(event)) {
        return;
    }
    markAndroidEscapeBack();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.type !== "keydown") {
        return;
    }
    const editable = resolveAndroidNoteEditable(event.target);
    if (editable) {
        insertBacktick(editable);
    }
};

const runningInAndroidApp = () => {
    return window.siyuan?.config?.system?.container === "android" && !!window.JSAndroid;
};

export const bindAndroidEscapeKey = () => {
    if (bound || !runningInAndroidApp()) {
        return;
    }
    bound = true;
    window.addEventListener("keydown", onAndroidEscapeKey, true);
    window.addEventListener("keyup", onAndroidEscapeKey, true);
};
