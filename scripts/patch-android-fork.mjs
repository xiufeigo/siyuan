#!/usr/bin/env node
// 将官方 siyuan-android 检出改为本 fork 的 applicationId、Android 内核端口、导航栏 edge-to-edge，并解析上游稳定标签。
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const ANDROID_APPLICATION_ID = "xiufeigo.siyuan";
export const ANDROID_KERNEL_PORT = "6805";
export const OFFICIAL_APPLICATION_ID = "org.b3log.siyuan";
export const OFFICIAL_KERNEL_PORT = "6806";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forkReleaseVersion = /^(\d+\.\d+\.\d+)\.(\d+)$/;
const stableThreePartVersion = /^\d+\.\d+\.\d+$/;
const prereleasePattern = /-(?:alpha|beta|rc)(?:[.-]|\d|$)/i;
const unstableAndroidBranch = /^(?:main|dev|master|HEAD)$/i;

export function readForkVersion() {
    return JSON.parse(readFileSync(path.join(repoRoot, "app", "package.json"), "utf8")).version;
}

export function forkVersionParts(version) {
    const match = forkReleaseVersion.exec(String(version || "").trim());
    if (!match) {
        return {upstream: String(version || "").trim(), patch: 0, isFork: false};
    }
    return {upstream: match[1], patch: Number(match[2]), isFork: true};
}

export function isPrereleaseVersion(version) {
    return prereleasePattern.test(String(version || "").trim());
}

export function isUnstableAndroidRef(ref) {
    const value = String(ref || "").trim();
    if (!value || unstableAndroidBranch.test(value)) {
        return true;
    }
    return isPrereleaseVersion(value);
}

// 四段 fork 版本映射到上游三段稳定标签；预发布版本与 main/dev 不能作为检出目标。
export function stableAndroidRef(forkVersion) {
    const version = String(forkVersion || "").trim().replace(/^v/i, "");
    if (!version || isPrereleaseVersion(version) || unstableAndroidBranch.test(version)) {
        throw new Error(`refusing unstable siyuan-android ref for version ${forkVersion || "(empty)"}`);
    }
    const {upstream, isFork} = forkVersionParts(version);
    const threePart = isFork ? upstream : version;
    if (!stableThreePartVersion.test(threePart) || isPrereleaseVersion(threePart)) {
        throw new Error(`cannot derive a stable siyuan-android tag from version ${forkVersion}`);
    }
    const ref = `v${threePart}`;
    if (isUnstableAndroidRef(ref) || !/^v\d+\.\d+\.\d+$/.test(ref)) {
        throw new Error(`refusing unstable siyuan-android ref ${ref}`);
    }
    return ref;
}

export function isAndroidVersionCompatible(androidVersion, forkVersion) {
    const version = String(forkVersion || "").trim();
    const android = String(androidVersion || "").trim();
    if (!android || !version) {
        return false;
    }
    if (isPrereleaseVersion(android) || isPrereleaseVersion(version) || isUnstableAndroidRef(android)) {
        return false;
    }
    if (android === version) {
        return true;
    }
    const {upstream, isFork} = forkVersionParts(version);
    return isFork && android === upstream;
}

export function readAndroidVersionName(androidDir) {
    const filePath = path.join(androidDir, "build.gradle");
    if (!existsSync(filePath)) {
        return "";
    }
    const match = readFileSync(filePath, "utf8").match(/^\s*siyuanVersionName\s*=\s*"([^"]+)"\s*$/m);
    return match ? match[1] : "";
}

function patchAndroidVersion(androidDir, forkVersion) {
    const {upstream, patch, isFork} = forkVersionParts(forkVersion);
    if (!isFork) {
        return false;
    }
    const filePath = path.join(androidDir, "build.gradle");
    if (!existsSync(filePath)) {
        return false;
    }
    const content = readFileSync(filePath, "utf8");
    const nameMatch = content.match(/^(\s*siyuanVersionName\s*=\s*")([^"]+)("\s*)$/m);
    const codeMatch = content.match(/^(\s*siyuanVersionCode\s*=\s*)(\d+)(\s*)$/m);
    if (!nameMatch || !codeMatch) {
        throw new Error("build.gradle does not contain siyuanVersionName/siyuanVersionCode");
    }
    if (nameMatch[2] === forkVersion) {
        return false;
    }
    if (nameMatch[2] !== upstream) {
        throw new Error(`siyuanVersionName ${nameMatch[2]} is not the upstream version ${upstream}`);
    }
    const next = content
        .replace(nameMatch[0], `${nameMatch[1]}${forkVersion}${nameMatch[3]}`)
        .replace(codeMatch[0], `${codeMatch[1]}${Number(codeMatch[2]) + patch}${codeMatch[3]}`);
    writeFileSync(filePath, next, "utf8");
    return true;
}

const exactPatches = [
    {
        file: path.join("app", "build.gradle"),
        required: true,
        replacements: [
            [`applicationId = "${OFFICIAL_APPLICATION_ID}"`, `applicationId = "${ANDROID_APPLICATION_ID}"`],
            [`resValue "string", "app_package_name", "${OFFICIAL_APPLICATION_ID}"`,
                `resValue "string", "app_package_name", "${ANDROID_APPLICATION_ID}"`],
            [`resValue "string", "app_package_name", "${OFFICIAL_APPLICATION_ID}.debug"`,
                `resValue "string", "app_package_name", "${ANDROID_APPLICATION_ID}.debug"`],
        ],
    },
    {
        file: path.join("app", "src", "main", "AndroidManifest.xml"),
        required: true,
        replacements: [
            [`android:taskAffinity="${OFFICIAL_APPLICATION_ID}.shorthand"`,
                `android:taskAffinity="${ANDROID_APPLICATION_ID}.shorthand"`],
        ],
    },
    {
        file: path.join("app", "src", "main", "res", "xml", "shortcuts.xml"),
        required: true,
        replacements: [
            [`android:targetPackage="${OFFICIAL_APPLICATION_ID}"`,
                `android:targetPackage="${ANDROID_APPLICATION_ID}"`],
        ],
    },
    {
        file: path.join("scripts", "verify-build.gradle"),
        required: false,
        replacements: [
            [`assert variant.applicationId.get() == "${OFFICIAL_APPLICATION_ID}\${debug ? '.debug' : ''}"`,
                `assert variant.applicationId.get() == "${ANDROID_APPLICATION_ID}\${debug ? '.debug' : ''}"`],
        ],
    },
];

const kernelPortFiles = [
    {file: path.join("app", "src", "main", "java", "org", "b3log", "siyuan", "MainActivity.java"), required: true},
    {file: path.join("app", "src", "main", "java", "org", "b3log", "siyuan", "Utils.java"), required: true},
    {file: path.join("app", "src", "main", "java", "org", "b3log", "siyuan", "JSAndroid.java"), required: true},
    {file: path.join("app", "src", "test", "java", "org", "b3log", "siyuan", "AssetDownloadTest.java"), required: false},
];

function replaceExact(content, from, to, file) {
    if (content.includes(to) && !content.includes(from)) {
        return {content, changed: false};
    }
    if (!content.includes(from)) {
        throw new Error(`${file} does not contain expected text: ${from}`);
    }
    return {content: content.split(from).join(to), changed: true};
}

function replaceKernelPort(content, file) {
    if (!content.includes(OFFICIAL_KERNEL_PORT) && content.includes(ANDROID_KERNEL_PORT)) {
        return {content, changed: false};
    }
    if (!content.includes(OFFICIAL_KERNEL_PORT)) {
        throw new Error(`${file} does not contain kernel port ${OFFICIAL_KERNEL_PORT}`);
    }
    return {content: content.split(OFFICIAL_KERNEL_PORT).join(ANDROID_KERNEL_PORT), changed: true};
}

const SYSTEM_BARS_RELATIVE = path.join("app", "src", "main", "java", "org", "b3log", "siyuan", "SystemBars.java");
const MAIN_ACTIVITY_RELATIVE = path.join("app", "src", "main", "java", "org", "b3log", "siyuan", "MainActivity.java");
const JS_ANDROID_RELATIVE = path.join("app", "src", "main", "java", "org", "b3log", "siyuan", "JSAndroid.java");
const BOOT_ACTIVITY_RELATIVE = path.join("app", "src", "main", "java", "org", "b3log", "siyuan", "BootActivity.java");
const EDGE_TO_EDGE_NAV_RELATIVE = path.join("app", "src", "main", "java", "org", "b3log", "siyuan", "EdgeToEdgeNavigation.java");
const EDGE_TO_EDGE_NAV_SOURCE = readFileSync(new URL("./fixtures/siyuan-android-EdgeToEdgeNavigation.java", import.meta.url), "utf8");

const OFFICIAL_APPLY_INSETS = `    static void applyInsets(View view, WindowInsetsCompat insets, Insets original, boolean includeKeyboard) {
        final int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                | (includeKeyboard ? WindowInsetsCompat.Type.ime() : 0);
        final Insets safe = insets.getInsets(types);
        view.setPadding(original.left + safe.left, original.top + safe.top,
                original.right + safe.right, original.bottom + safe.bottom);
    }
}`;

const EDGE_TO_EDGE_APPLY_INSETS = `    static void applyInsets(View view, WindowInsetsCompat insets, Insets original, boolean includeKeyboard) {
        // 状态栏与刘海仍由原生 padding 避让；导航栏交给 WebView 绘制，避免底部形成不透明隔层。
        final int types = WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.captionBar()
                | WindowInsetsCompat.Type.displayCutout()
                | (includeKeyboard ? WindowInsetsCompat.Type.ime() : 0);
        final Insets safe = insets.getInsets(types);
        view.setPadding(original.left + safe.left, original.top + safe.top,
                original.right + safe.right, original.bottom + safe.bottom);
        syncWebViewSafeArea(view, insets);
    }

    static void syncWebViewSafeArea(View root, WindowInsetsCompat insets) {
        if (root instanceof WebView) {
            applyWebViewSafeArea((WebView) root, insets);
            return;
        }
        if (!(root instanceof ViewGroup)) {
            return;
        }
        final ViewGroup group = (ViewGroup) root;
        for (int i = 0; i < group.getChildCount(); i++) {
            syncWebViewSafeArea(group.getChildAt(i), insets);
        }
    }

    private static void applyWebViewSafeArea(WebView webView, WindowInsetsCompat insets) {
        final float density = webView.getResources().getDisplayMetrics().density;
        if (density <= 0f) {
            return;
        }
        final Insets navigation = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
        final Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
        final boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
        final int bottomPx = imeVisible ? 0 : Math.max(navigation.bottom, cutout.bottom);
        final String script = "void(function(i){if(window.__siyuanAndroidSafeArea){window.__siyuanAndroidSafeArea(i)}"
                + "else{window.__siyuanAndroidSafeAreaQueue=i}})({top:0,right:"
                + cssPx(Math.max(navigation.right, cutout.right), density)
                + ",bottom:" + cssPx(bottomPx, density)
                + ",left:" + cssPx(Math.max(navigation.left, cutout.left), density)
                + "})";
        webView.evaluateJavascript(script, null);
    }

    private static String cssPx(int px, float density) {
        if (px <= 0) {
            return "0";
        }
        return Double.toString(Math.round(px / density * 10000d) / 10000d);
    }
}`;

const OFFICIAL_FIT_CONTENT_COMMENT = `            applyInsets(view, insets, original, true);
            // All children are inside the safe rectangle; WebView must not apply CSS safe areas again.
            return WindowInsetsCompat.CONSUMED;`;

const EDGE_TO_EDGE_FIT_CONTENT_COMMENT = `            applyInsets(view, insets, original, true);
            // 状态栏已消化为 padding；导航栏 inset 通过 CSS 变量交给页面，并消费以免 WebView 再套一层 env()。
            return WindowInsetsCompat.CONSUMED;`;

const OFFICIAL_SYSTEM_BARS_JAVADOC = "/** Transparent system bars with native content avoidance, including older Android versions. */";
const EDGE_TO_EDGE_SYSTEM_BARS_JAVADOC = "/** 透明系统栏。状态栏由原生 padding 避让，导航栏由 WebView 绘制以实现手势指示条沉浸。 */";
const WEBVIEW_IMPORT = "import android.webkit.WebView;\n";

const OFFICIAL_ON_PAGE_FINISHED = `            public void onPageFinished(WebView view, String url) {
                if (view != webView) {
                    return;
                }
                if (null != url && url.contains("/stage/build/")) {`;

const EDGE_TO_EDGE_ON_PAGE_FINISHED = `            public void onPageFinished(WebView view, String url) {
                if (view != webView) {
                    return;
                }
                view.requestApplyInsets();
                if (null != url && url.contains("/stage/build/")) {`;

const OFFICIAL_BOOT_WEBVIEW_CLIENT = `            bootWebView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(final WebView view, final WebResourceRequest request) {`;

const EDGE_TO_EDGE_BOOT_WEBVIEW_CLIENT = `            bootWebView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(final WebView view, final String url) {
                    view.requestApplyInsets();
                }

                @Override
                public boolean shouldOverrideUrlLoading(final WebView view, final WebResourceRequest request) {`;

const OFFICIAL_BOOT_WEBVIEW_ADD = `            ((ViewGroup) webView.getParent()).addView(bootWebView, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        bootWebView.loadUrl(SIYUAN_BOOT_PAGE_URL + safeParameter);`;

const EDGE_TO_EDGE_BOOT_WEBVIEW_ADD = `            ((ViewGroup) webView.getParent()).addView(bootWebView, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            bootWebView.requestApplyInsets();
        }
        bootWebView.loadUrl(SIYUAN_BOOT_PAGE_URL + safeParameter);`;

const STABLE_BOOT_WEBVIEW_ADD = `            ((ViewGroup) webView.getParent()).addView(bootWebView, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            EdgeToEdgeNavigation.fitWebView(bootWebView);
        }
        bootWebView.loadUrl(SIYUAN_BOOT_PAGE_URL + safeParameter);`;

const OFFICIAL_HIDE_NAV_MAIN = `        BarUtils.setNavBarVisibility(this, false);

        // Fix https://github.com/siyuan-note/siyuan/issues/9726
        AndroidBug5497Workaround.assistActivity(this);`;

const STABLE_HIDE_NAV_MAIN = `        EdgeToEdgeNavigation.configure(this);
        EdgeToEdgeNavigation.fitWebView(webView);

        // Fix https://github.com/siyuan-note/siyuan/issues/9726
        AndroidBug5497Workaround.assistActivity(this);`;

const OFFICIAL_HIDE_NAV_JS = `            UltimateBarX.statusBarOnly(activity).transparent().light(appearanceMode == 0).color(colorVal).apply();
            BarUtils.setNavBarVisibility(activity, false);`;

const STABLE_HIDE_NAV_JS = `            UltimateBarX.statusBarOnly(activity).transparent().light(appearanceMode == 0).color(colorVal).apply();
            EdgeToEdgeNavigation.configure(activity);
            EdgeToEdgeNavigation.sync(activity.webView);`;

const OFFICIAL_HIDE_NAV_BOOT = `        setContentView(R.layout.activity_boot);

        BarUtils.setNavBarVisibility(this, false);`;

const STABLE_HIDE_NAV_BOOT = `        setContentView(R.layout.activity_boot);

        EdgeToEdgeNavigation.showNavigation(this);`;

function replaceOptional(content, from, to) {
    if (content.includes(to) && !content.includes(from)) {
        return {content, changed: false};
    }
    if (!content.includes(from)) {
        return {content, changed: false, missing: true};
    }
    return {content: content.split(from).join(to), changed: true};
}

function hasOfficialSystemBars(androidDir) {
    return existsSync(path.join(androidDir, SYSTEM_BARS_RELATIVE));
}

function writeFileIfChanged(filePath, content) {
    if (existsSync(filePath) && readFileSync(filePath, "utf8") === content) {
        return false;
    }
    mkdirSync(path.dirname(filePath), {recursive: true});
    writeFileSync(filePath, content, "utf8");
    return true;
}

function patchSystemBarsEdgeToEdge(androidDir) {
    const filePath = path.join(androidDir, SYSTEM_BARS_RELATIVE);
    if (!existsSync(filePath)) {
        return false;
    }
    let content = readFileSync(filePath, "utf8");
    if (content.includes("syncWebViewSafeArea") && content.includes("Type.statusBars() | WindowInsetsCompat.Type.captionBar()")) {
        return false;
    }
    if (!content.includes(OFFICIAL_APPLY_INSETS)) {
        throw new Error(`${SYSTEM_BARS_RELATIVE} does not contain the official applyInsets implementation`);
    }
    content = content.split(OFFICIAL_APPLY_INSETS).join(EDGE_TO_EDGE_APPLY_INSETS);
    const fit = replaceOptional(content, OFFICIAL_FIT_CONTENT_COMMENT, EDGE_TO_EDGE_FIT_CONTENT_COMMENT);
    content = fit.content;
    const javadoc = replaceOptional(content, OFFICIAL_SYSTEM_BARS_JAVADOC, EDGE_TO_EDGE_SYSTEM_BARS_JAVADOC);
    content = javadoc.content;
    if (!content.includes("import android.webkit.WebView;")) {
        if (!content.includes("import android.view.WindowManager;")) {
            throw new Error(`${SYSTEM_BARS_RELATIVE} does not contain WindowManager import`);
        }
        content = content.replace("import android.view.WindowManager;\n", "import android.view.WindowManager;\n" + WEBVIEW_IMPORT);
    }
    writeFileSync(filePath, content, "utf8");
    return true;
}

function patchMainActivityEdgeToEdge(androidDir) {
    const filePath = path.join(androidDir, MAIN_ACTIVITY_RELATIVE);
    if (!existsSync(filePath)) {
        throw new Error(`required Android file is missing: ${filePath}`);
    }
    let content = readFileSync(filePath, "utf8");
    let fileChanged = false;
    const pageFinished = replaceOptional(content, OFFICIAL_ON_PAGE_FINISHED, EDGE_TO_EDGE_ON_PAGE_FINISHED);
    content = pageFinished.content;
    fileChanged = fileChanged || pageFinished.changed;
    const bootClient = replaceOptional(content, OFFICIAL_BOOT_WEBVIEW_CLIENT, EDGE_TO_EDGE_BOOT_WEBVIEW_CLIENT);
    content = bootClient.content;
    fileChanged = fileChanged || bootClient.changed;
    const bootAdd = replaceOptional(content, OFFICIAL_BOOT_WEBVIEW_ADD, EDGE_TO_EDGE_BOOT_WEBVIEW_ADD);
    content = bootAdd.content;
    fileChanged = fileChanged || bootAdd.changed;
    if (fileChanged) {
        writeFileSync(filePath, content, "utf8");
    }
    return fileChanged;
}

function patchStableShellEdgeToEdge(androidDir) {
    const changed = [];
    if (writeFileIfChanged(path.join(androidDir, EDGE_TO_EDGE_NAV_RELATIVE), EDGE_TO_EDGE_NAV_SOURCE)) {
        changed.push(EDGE_TO_EDGE_NAV_RELATIVE);
    }
    const mainPath = path.join(androidDir, MAIN_ACTIVITY_RELATIVE);
    if (!existsSync(mainPath)) {
        throw new Error(`required Android file is missing: ${mainPath}`);
    }
    let main = readFileSync(mainPath, "utf8");
    let mainChanged = false;
    const hideNav = replaceExact(main, OFFICIAL_HIDE_NAV_MAIN, STABLE_HIDE_NAV_MAIN, MAIN_ACTIVITY_RELATIVE);
    main = hideNav.content;
    mainChanged = mainChanged || hideNav.changed;
    const bootAdd = main.includes("EdgeToEdgeNavigation.fitWebView(bootWebView)")
        ? {content: main, changed: false}
        : main.includes(EDGE_TO_EDGE_BOOT_WEBVIEW_ADD)
            ? replaceExact(main, EDGE_TO_EDGE_BOOT_WEBVIEW_ADD, STABLE_BOOT_WEBVIEW_ADD, MAIN_ACTIVITY_RELATIVE)
            : replaceExact(main, OFFICIAL_BOOT_WEBVIEW_ADD, STABLE_BOOT_WEBVIEW_ADD, MAIN_ACTIVITY_RELATIVE);
    main = bootAdd.content;
    mainChanged = mainChanged || bootAdd.changed;
    if (mainChanged) {
        writeFileSync(mainPath, main, "utf8");
        changed.push(MAIN_ACTIVITY_RELATIVE);
    }
    const jsPath = path.join(androidDir, JS_ANDROID_RELATIVE);
    if (!existsSync(jsPath)) {
        throw new Error(`required Android file is missing: ${jsPath}`);
    }
    const js = replaceExact(readFileSync(jsPath, "utf8"), OFFICIAL_HIDE_NAV_JS, STABLE_HIDE_NAV_JS, JS_ANDROID_RELATIVE);
    if (js.changed) {
        writeFileSync(jsPath, js.content, "utf8");
        changed.push(JS_ANDROID_RELATIVE);
    }
    const bootPath = path.join(androidDir, BOOT_ACTIVITY_RELATIVE);
    if (existsSync(bootPath)) {
        const boot = replaceOptional(readFileSync(bootPath, "utf8"), OFFICIAL_HIDE_NAV_BOOT, STABLE_HIDE_NAV_BOOT);
        if (boot.changed) {
            writeFileSync(bootPath, boot.content, "utf8");
            changed.push(BOOT_ACTIVITY_RELATIVE);
        }
    }
    return changed;
}

export function patchAndroidFork(androidDir, options = {}) {
    if (!androidDir) {
        throw new Error("android directory is required");
    }
    const changed = [];
    const forkVersion = options.version || readForkVersion();
    if (patchAndroidVersion(androidDir, forkVersion)) {
        changed.push("build.gradle");
    }
    for (const patch of exactPatches) {
        const filePath = path.join(androidDir, patch.file);
        if (!existsSync(filePath)) {
            if (patch.required) {
                throw new Error(`required Android file is missing: ${filePath}`);
            }
            continue;
        }
        let content = readFileSync(filePath, "utf8");
        let fileChanged = false;
        for (const [from, to] of patch.replacements) {
            const result = replaceExact(content, from, to, patch.file);
            content = result.content;
            fileChanged = fileChanged || result.changed;
        }
        if (fileChanged) {
            writeFileSync(filePath, content, "utf8");
            changed.push(patch.file);
        }
    }
    for (const entry of kernelPortFiles) {
        const filePath = path.join(androidDir, entry.file);
        if (!existsSync(filePath)) {
            if (entry.required) {
                throw new Error(`required Android file is missing: ${filePath}`);
            }
            continue;
        }
        const result = replaceKernelPort(readFileSync(filePath, "utf8"), entry.file);
        if (result.changed) {
            writeFileSync(filePath, result.content, "utf8");
            changed.push(entry.file);
        }
    }
    if (hasOfficialSystemBars(androidDir)) {
        if (patchSystemBarsEdgeToEdge(androidDir)) {
            changed.push(SYSTEM_BARS_RELATIVE);
        }
        if (patchMainActivityEdgeToEdge(androidDir)) {
            if (!changed.includes(MAIN_ACTIVITY_RELATIVE)) {
                changed.push(MAIN_ACTIVITY_RELATIVE);
            }
        }
    } else {
        // v3.8.9 通过透明导航栏与 WebView CSS inset 实现手势条沉浸，不依赖 SystemBars.java。
        for (const file of patchStableShellEdgeToEdge(androidDir)) {
            if (!changed.includes(file)) {
                changed.push(file);
            }
        }
        if (patchMainActivityEdgeToEdge(androidDir)) {
            if (!changed.includes(MAIN_ACTIVITY_RELATIVE)) {
                changed.push(MAIN_ACTIVITY_RELATIVE);
            }
        }
    }
    return changed;
}

function parseAndroidDir(argv) {
    for (const arg of argv) {
        if (arg.startsWith("--android-dir=")) {
            return arg.slice("--android-dir=".length);
        }
    }
    return "";
}

function usage() {
    console.error("Usage: node scripts/patch-android-fork.mjs --android-ref");
    console.error("       node scripts/patch-android-fork.mjs --android-dir=<path> [--verify-version]");
}

const modulePath = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] || "") === modulePath) {
    const argv = process.argv.slice(2);
    if (argv.includes("--android-ref")) {
        try {
            console.log(stableAndroidRef(readForkVersion()));
            process.exit(0);
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
    }
    const androidDir = parseAndroidDir(argv);
    if (!androidDir) {
        usage();
        process.exit(1);
    }
    if (argv.includes("--verify-version")) {
        const version = readForkVersion();
        const androidVersion = readAndroidVersionName(androidDir);
        if (!isAndroidVersionCompatible(androidVersion, version)) {
            console.error(`siyuan-android version (${androidVersion}) does not match package.json version (${version})`);
            process.exit(1);
        }
        console.log(`siyuan-android version compatible with fork ${version}: ${androidVersion}`);
        process.exit(0);
    }
    const changed = patchAndroidFork(androidDir);
    if (changed.length === 0) {
        console.log(`Android fork identity already applied in ${androidDir}`);
    } else {
        console.log(`Patched Android applicationId ${ANDROID_APPLICATION_ID}, kernel port ${ANDROID_KERNEL_PORT}, and navigation edge-to-edge:`);
        for (const file of changed) {
            console.log(`  ${file}`);
        }
    }
}
