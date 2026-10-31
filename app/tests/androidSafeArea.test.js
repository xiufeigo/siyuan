const assert = require("node:assert/strict");
const path = require("node:path");
const {test} = require("node:test");
const sass = require("sass");

const compile = (name) => sass.compile(path.join(__dirname, `../src/assets/scss/${name}.scss`), {
    logger: sass.Logger.silent,
}).css;

test("desktop Android layout pads the window chrome with the injected navigation inset", () => {
    const css = compile("base");
    assert.match(css, /--sy-safe-area-inset-bottom:\s*var\(--sy-android-safe-area-inset-bottom/);
    assert.match(css, /html\[data-frontend=desktop\] body\.body--android/);
    assert.match(css, /padding-bottom:\s*var\(--sy-safe-area-inset-bottom\)/);
    assert.match(css, /html\[data-android-system-bars\]/);
});

test("mobile Android bottom bar uses the injected navigation inset", () => {
    const css = compile("mobile");
    assert.match(css, /--mobile-bottom-bar-safe-area:\s*var\(--sy-safe-area-inset-bottom\)/);
    assert.doesNotMatch(css, /--mobile-bottom-bar-safe-area:\s*env\(safe-area-inset-bottom\)/);
});
