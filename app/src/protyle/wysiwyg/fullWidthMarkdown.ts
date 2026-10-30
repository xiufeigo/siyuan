// 与 Lute 词法标记、编辑器快捷输入共用的半角符号。Android 输入法常给出对应全角形式，
// 折成半角后沿用同一套解析。不转换中文行文常用的全角句读，例如 ，。：；？！（）。
const FULLWIDTH_MARKDOWN_PUNCTUATION: Record<string, string> = {
    "\uFF5C": "|",
    "\uFF1D": "=",
    "\uFF5E": "~",
    "\u301C": "~",
    "\uFF40": "`",
    "\uFF03": "#",
    "\uFF0A": "*",
    "\uFF0D": "-",
    "\uFF3F": "_",
    "\uFF0B": "+",
    "\uFF04": "$",
    "\uFF3E": "^",
    "\uFF3C": "\\",
    "\uFF1C": "<",
    "\uFF1E": ">",
    "\uFF3B": "[",
    "\uFF3D": "]",
    "\uFF5B": "{",
    "\uFF5D": "}",
    "\uFF06": "&",
    "\uFF0F": "/",
    "\uFF0E": ".",
};

export const toHalfWidthMarkdownPunctuation = (text: string) => {
    let changed = false;
    let result = "";
    for (const char of text) {
        const halfWidth = FULLWIDTH_MARKDOWN_PUNCTUATION[char];
        if (halfWidth) {
            changed = true;
            result += halfWidth;
        } else {
            result += char;
        }
    }
    return changed ? result : text;
};

export const replaceFullWidthMarkdownSuffix = (text: string, offset: number, inserted: string) => {
    const normalized = toHalfWidthMarkdownPunctuation(inserted);
    if (!inserted || normalized === inserted || offset < inserted.length || offset > text.length) {
        return;
    }
    if (text.slice(offset - inserted.length, offset) !== inserted) {
        return;
    }
    return {
        text: text.slice(0, offset - inserted.length) + normalized + text.slice(offset),
        offset: offset - inserted.length + normalized.length,
    };
};

// 只改写本次插入的符号，避免顺带改掉光标前已经存在的正文。代码块内保持原字符。
export const rewriteFullWidthMarkdownAtCaret = (range: Range, inserted: string) => {
    if (!inserted || !range.collapsed || range.startContainer.nodeType !== 3) {
        return false;
    }
    const parent = range.startContainer.parentElement;
    if (parent?.closest("[data-type='NodeCodeBlock']")) {
        return false;
    }
    const current = range.startContainer.textContent ?? "";
    const replaced = replaceFullWidthMarkdownSuffix(current, range.startOffset, inserted);
    if (!replaced) {
        return false;
    }
    const container = range.startContainer;
    const edit = range.cloneRange();
    edit.setStart(container, range.startOffset - inserted.length);
    edit.deleteContents();
    const textNode = container.ownerDocument.createTextNode(toHalfWidthMarkdownPunctuation(inserted));
    edit.insertNode(textNode);
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    const selection = container.ownerDocument.getSelection?.();
    if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
    }
    return true;
};
