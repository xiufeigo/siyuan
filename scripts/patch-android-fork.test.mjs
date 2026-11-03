import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {test} from "node:test";
import {execFileSync} from "node:child_process";
import {
    ANDROID_APPLICATION_ID,
    ANDROID_KERNEL_PORT,
    OFFICIAL_APPLICATION_ID,
    OFFICIAL_KERNEL_PORT,
    forkVersionParts,
    isAndroidVersionCompatible,
    patchAndroidFork,
    readAndroidVersionName,
} from "./patch-android-fork.mjs";

const fixture = (androidDir, relative, content) => {
    const filePath = join(androidDir, relative);
    mkdirSync(dirname(filePath), {recursive: true});
    writeFileSync(filePath, content, "utf8");
    return filePath;
};

const officialProject = (t) => {
    const androidDir = mkdtempSync(join(tmpdir(), "siyuan-android-fork-"));
    t.after(() => rmSync(androidDir, {recursive: true, force: true}));
    fixture(androidDir, join("app", "build.gradle"), `
android {
    namespace = '${OFFICIAL_APPLICATION_ID}'
    defaultConfig {
        applicationId = "${OFFICIAL_APPLICATION_ID}"
    }
    buildTypes {
        release {
            resValue "string", "app_package_name", "${OFFICIAL_APPLICATION_ID}"
        }
        debug {
            applicationIdSuffix = ".debug"
            resValue "string", "app_package_name", "${OFFICIAL_APPLICATION_ID}.debug"
        }
    }
}
`);
    fixture(androidDir, join("app", "src", "main", "AndroidManifest.xml"),
        `android:taskAffinity="${OFFICIAL_APPLICATION_ID}.shorthand"\n`);
    fixture(androidDir, join("app", "src", "main", "res", "xml", "shortcuts.xml"),
        `android:targetClass="${OFFICIAL_APPLICATION_ID}.ShortcutActivity"\nandroid:targetPackage="${OFFICIAL_APPLICATION_ID}" />\n`);
    fixture(androidDir, join("scripts", "verify-build.gradle"),
        `assert variant.applicationId.get() == "${OFFICIAL_APPLICATION_ID}\${debug ? '.debug' : ''}"\n`);
    fixture(androidDir, join("app", "src", "main", "java", "org", "b3log", "siyuan", "MainActivity.java"),
        `package ${OFFICIAL_APPLICATION_ID};
private static final int SIYUAN_WEBVIEW_PORT = ${OFFICIAL_KERNEL_PORT};
            public void onPageFinished(WebView view, String url) {
                if (view != webView) {
                    return;
                }
                if (null != url && url.contains("/stage/build/")) {
                    return;
                }
            }
            bootWebView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(final WebView view, final WebResourceRequest request) {
                    return false;
                }
            });
            ((ViewGroup) webView.getParent()).addView(bootWebView, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        bootWebView.loadUrl(SIYUAN_BOOT_PAGE_URL + safeParameter);
`);
    fixture(androidDir, join("app", "src", "main", "java", "org", "b3log", "siyuan", "SystemBars.java"),
        readFileSync(new URL("./fixtures/siyuan-android-SystemBars.java", import.meta.url), "utf8"));
    fixture(androidDir, join("app", "src", "main", "java", "org", "b3log", "siyuan", "Utils.java"),
        `package ${OFFICIAL_APPLICATION_ID};\nurl = "http://127.0.0.1:${OFFICIAL_KERNEL_PORT}/" + url;\n`);
    fixture(androidDir, join("app", "src", "main", "java", "org", "b3log", "siyuan", "JSAndroid.java"),
        `package ${OFFICIAL_APPLICATION_ID};\nif (url.startsWith("http://127.0.0.1:${OFFICIAL_KERNEL_PORT}/assets/")) {\n`);
    fixture(androidDir, join("app", "src", "test", "java", "org", "b3log", "siyuan", "AssetDownloadTest.java"),
        `check("assets/movie.mp4", "http://127.0.0.1:${OFFICIAL_KERNEL_PORT}/assets/movie.mp4");\n`);
    return androidDir;
};

test("patches official Android identity and kernel port without renaming Java packages", (t) => {
    const androidDir = officialProject(t);
    const changed = patchAndroidFork(androidDir);
    assert.deepEqual(changed.sort(), [
        join("app", "build.gradle"),
        join("app", "src", "main", "AndroidManifest.xml"),
        join("app", "src", "main", "res", "xml", "shortcuts.xml"),
        join("app", "src", "main", "java", "org", "b3log", "siyuan", "JSAndroid.java"),
        join("app", "src", "main", "java", "org", "b3log", "siyuan", "MainActivity.java"),
        join("app", "src", "main", "java", "org", "b3log", "siyuan", "SystemBars.java"),
        join("app", "src", "main", "java", "org", "b3log", "siyuan", "Utils.java"),
        join("app", "src", "test", "java", "org", "b3log", "siyuan", "AssetDownloadTest.java"),
        join("scripts", "verify-build.gradle"),
    ].sort());

    const gradle = readFileSync(join(androidDir, "app", "build.gradle"), "utf8");
    assert.match(gradle, new RegExp(`namespace = '${OFFICIAL_APPLICATION_ID}'`));
    assert.match(gradle, new RegExp(`applicationId = "${ANDROID_APPLICATION_ID}"`));
    assert.match(gradle, new RegExp(`app_package_name", "${ANDROID_APPLICATION_ID}"`));
    assert.match(gradle, new RegExp(`app_package_name", "${ANDROID_APPLICATION_ID}.debug"`));
    assert.doesNotMatch(gradle, new RegExp(`applicationId = "${OFFICIAL_APPLICATION_ID}"`));

    const manifest = readFileSync(join(androidDir, "app", "src", "main", "AndroidManifest.xml"), "utf8");
    assert.match(manifest, new RegExp(`taskAffinity="${ANDROID_APPLICATION_ID}.shorthand"`));

    const shortcuts = readFileSync(join(androidDir, "app", "src", "main", "res", "xml", "shortcuts.xml"), "utf8");
    assert.match(shortcuts, new RegExp(`targetClass="${OFFICIAL_APPLICATION_ID}.ShortcutActivity"`));
    assert.match(shortcuts, new RegExp(`targetPackage="${ANDROID_APPLICATION_ID}"`));

    const verify = readFileSync(join(androidDir, "scripts", "verify-build.gradle"), "utf8");
    assert.match(verify, new RegExp(`applicationId.get\\(\\) == "${ANDROID_APPLICATION_ID}\\$\\{debug`));

    for (const relative of [
        join("app", "src", "main", "java", "org", "b3log", "siyuan", "MainActivity.java"),
        join("app", "src", "main", "java", "org", "b3log", "siyuan", "Utils.java"),
        join("app", "src", "main", "java", "org", "b3log", "siyuan", "JSAndroid.java"),
    ]) {
        const source = readFileSync(join(androidDir, relative), "utf8");
        assert.match(source, new RegExp(`package ${OFFICIAL_APPLICATION_ID};`));
        assert.match(source, new RegExp(ANDROID_KERNEL_PORT));
        assert.doesNotMatch(source, new RegExp(OFFICIAL_KERNEL_PORT));
    }
    const assetTest = readFileSync(join(androidDir, "app", "src", "test", "java", "org", "b3log", "siyuan", "AssetDownloadTest.java"), "utf8");
    assert.match(assetTest, new RegExp(ANDROID_KERNEL_PORT));
    assert.doesNotMatch(assetTest, new RegExp(OFFICIAL_KERNEL_PORT));

    const systemBars = readFileSync(join(androidDir, "app", "src", "main", "java", "org", "b3log", "siyuan", "SystemBars.java"), "utf8");
    assert.match(systemBars, /Type\.statusBars\(\) \| WindowInsetsCompat\.Type\.captionBar\(\)/);
    assert.doesNotMatch(systemBars, /Type\.systemBars\(\) \| WindowInsetsCompat\.Type\.displayCutout\(\)/);
    assert.match(systemBars, /syncWebViewSafeArea/);
    assert.match(systemBars, /__siyuanAndroidSafeArea/);
    assert.match(systemBars, /import android\.webkit\.WebView;/);
    const main = readFileSync(join(androidDir, "app", "src", "main", "java", "org", "b3log", "siyuan", "MainActivity.java"), "utf8");
    assert.match(main, /view\.requestApplyInsets\(\);/);
    assert.match(main, /bootWebView\.requestApplyInsets\(\);/);
});

test("re-running the patch is idempotent", (t) => {
    const androidDir = officialProject(t);
    patchAndroidFork(androidDir);
    assert.deepEqual(patchAndroidFork(androidDir), []);
});

test("android-dev-run patches the checkout and launches the forked debug applicationId", () => {
    const source = readFileSync(new URL("./android-dev-run.mjs", import.meta.url), "utf8");
    assert.match(source, /patchAndroidFork\(androidDir\)/);
    assert.match(source, /\$\{ANDROID_APPLICATION_ID\}\.debug\/org\.b3log\.siyuan\.BootActivity/);
});

test("treats a four-part fork version as compatible with the upstream Android versionName", () => {
    assert.deepEqual(forkVersionParts("3.8.9.1"), {upstream: "3.8.9", patch: 1, isFork: true});
    assert.equal(isAndroidVersionCompatible("3.8.9", "3.8.9.1"), true);
    assert.equal(isAndroidVersionCompatible("3.8.9.1", "3.8.9.1"), true);
    assert.equal(isAndroidVersionCompatible("3.8.9", "3.8.9"), true);
    assert.equal(isAndroidVersionCompatible("3.8.8", "3.8.9.1"), false);
    assert.equal(isAndroidVersionCompatible("3.8.9", "3.8.9-beta.1"), false);
});

test("writes the fork versionName and bumps versionCode", (t) => {
    const androidDir = officialProject(t);
    fixture(androidDir, "build.gradle", `buildscript {
    ext {
        siyuanVersionCode = 458
        siyuanVersionName = "3.8.9"
    }
}
`);
    const changed = patchAndroidFork(androidDir, {version: "3.8.9.1"});
    assert.equal(changed.includes("build.gradle"), true);
    const gradle = readFileSync(join(androidDir, "build.gradle"), "utf8");
    assert.match(gradle, /siyuanVersionName = "3\.8\.9\.1"/);
    assert.match(gradle, /siyuanVersionCode = 459/);
    assert.equal(readAndroidVersionName(androidDir), "3.8.9.1");
    assert.equal(patchAndroidFork(androidDir, {version: "3.8.9.1"}).includes("build.gradle"), false);
});

test("keeps Java sources in the official package when optional files are absent", (t) => {
    const androidDir = officialProject(t);
    rmSync(join(androidDir, "scripts", "verify-build.gradle"));
    rmSync(join(androidDir, "app", "src", "test"), {recursive: true, force: true});
    patchAndroidFork(androidDir);
    const main = readFileSync(join(androidDir, "app", "src", "main", "java", "org", "b3log", "siyuan", "MainActivity.java"), "utf8");
    assert.match(main, new RegExp(`package ${OFFICIAL_APPLICATION_ID};`));
    assert.match(main, new RegExp(`SIYUAN_WEBVIEW_PORT = ${ANDROID_KERNEL_PORT};`));
});

const systemBarDoubles = {
    "android/R.java": `package android; public class R { public static class id { public static final int content=1; } }`,
    "android/os/Build.java": `package android.os; public class Build {
        public static class VERSION { public static int SDK_INT=26; }
        public static class VERSION_CODES { public static final int P=28, Q=29; }
    }`,
    "android/graphics/Color.java": `package android.graphics; public class Color { public static final int TRANSPARENT=0; }`,
    "android/view/View.java": `package android.view;
        import androidx.core.view.*;
        public class View {
            public OnApplyWindowInsetsListener listener;
            public WindowInsetsCompat insets;
            private int l,t,r,b;
            public void setPadding(int l,int t,int r,int b) { this.l=l; this.t=t; this.r=r; this.b=b; }
            public int getPaddingLeft(){return l;} public int getPaddingTop(){return t;}
            public int getPaddingRight(){return r;} public int getPaddingBottom(){return b;}
            public android.content.res.Resources getResources(){return android.content.res.Resources.INSTANCE;}
        }`,
    "android/view/ViewGroup.java": `package android.view; public class ViewGroup extends View {
        public View child=new View(); public View getChildAt(int index){return child;}
        public int getChildCount(){return 1;}
    }`,
    "android/view/WindowManager.java": `package android.view; public class WindowManager {
        public static class LayoutParams {
            public static final int FLAG_TRANSLUCENT_STATUS=1, FLAG_TRANSLUCENT_NAVIGATION=2,
                FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS=4, LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES=1;
            public int layoutInDisplayCutoutMode;
        }
    }`,
    "android/view/Window.java": `package android.view;
        import androidx.core.view.WindowInsetsControllerCompat;
        public class Window {
            public final View decor=new View();
            public final WindowInsetsControllerCompat controller=new WindowInsetsControllerCompat();
            public boolean fitsSystemWindows=true, navigationContrast=true, statusContrast=true;
            public int navigationColor=-1, statusColor=-1;
            private WindowManager.LayoutParams attributes=new WindowManager.LayoutParams();
            public View getDecorView(){return decor;}
            public void clearFlags(int flags){} public void addFlags(int flags){}
            public void setStatusBarColor(int color){statusColor=color;}
            public void setNavigationBarColor(int color){navigationColor=color;}
            public void setNavigationBarDividerColor(int color){}
            public WindowManager.LayoutParams getAttributes(){return attributes;}
            public void setAttributes(WindowManager.LayoutParams attributes){this.attributes=attributes;}
            public void setStatusBarContrastEnforced(boolean value){statusContrast=value;}
            public void setNavigationBarContrastEnforced(boolean value){navigationContrast=value;}
        }`,
    "android/app/Activity.java": `package android.app; import android.view.*;
        public class Activity {
            public final Window window=new Window(); public final ViewGroup content=new ViewGroup();
            public Window getWindow(){return window;}
            public <T extends View> T findViewById(int id){return (T)content;}
        }`,
    "android/webkit/WebView.java": `package android.webkit; public class WebView extends android.view.View {
        public String script;
        public void evaluateJavascript(String value, Object callback){script=value;}
    }`,
    "android/content/res/Resources.java": `package android.content.res; public class Resources {
        public static final Resources INSTANCE=new Resources();
        public android.util.DisplayMetrics getDisplayMetrics(){return new android.util.DisplayMetrics();}
    }`,
    "android/util/DisplayMetrics.java": `package android.util; public class DisplayMetrics { public float density=1f; }`,
    "androidx/core/graphics/Insets.java": `package androidx.core.graphics;
        public class Insets {
            public final int left,top,right,bottom;
            public static final Insets NONE=of(0,0,0,0);
            private Insets(int l,int t,int r,int b){left=l;top=t;right=r;bottom=b;}
            public static Insets of(int l,int t,int r,int b){return new Insets(l,t,r,b);}
        }`,
    "androidx/core/view/OnApplyWindowInsetsListener.java": `package androidx.core.view;
        public interface OnApplyWindowInsetsListener {
            WindowInsetsCompat onApplyWindowInsets(android.view.View view, WindowInsetsCompat insets);
        }`,
    "androidx/core/view/ViewCompat.java": `package androidx.core.view; import android.view.View;
        public class ViewCompat {
            public static int requests;
            public static void setOnApplyWindowInsetsListener(View view, OnApplyWindowInsetsListener listener){view.listener=listener;}
            public static void requestApplyInsets(View view){requests++;}
            public static WindowInsetsCompat getRootWindowInsets(View view){return view.insets;}
        }`,
    "androidx/core/view/WindowCompat.java": `package androidx.core.view; import android.view.*;
        public class WindowCompat {
            public static void setDecorFitsSystemWindows(Window window, boolean fits){window.fitsSystemWindows=fits;}
            public static WindowInsetsControllerCompat getInsetsController(Window window, View view){return window.controller;}
        }`,
    "androidx/core/view/WindowInsetsControllerCompat.java": `package androidx.core.view;
        public class WindowInsetsControllerCompat {
            public static final int BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE=2;
            public boolean lightStatus,lightNavigation; public int visible=3,behavior;
            public void show(int types){visible|=types;} public void hide(int types){visible&=~types;}
            public void setAppearanceLightStatusBars(boolean light){lightStatus=light;}
            public void setAppearanceLightNavigationBars(boolean light){lightNavigation=light;}
            public int getSystemBarsBehavior(){return behavior;}
            public void setSystemBarsBehavior(int behavior){this.behavior=behavior;}
        }`,
    "androidx/core/view/WindowInsetsCompat.java": `package androidx.core.view;
        import androidx.core.graphics.Insets; import java.util.*;
        public class WindowInsetsCompat {
            public static final WindowInsetsCompat CONSUMED=new WindowInsetsCompat();
            public int visible=3;
            private final Map<Integer,Insets> values=new HashMap<>();
            public WindowInsetsCompat with(int type,Insets insets){values.put(type,insets);return this;}
            public Insets getInsets(int types){
                int l=0,t=0,r=0,b=0;
                for(var item:values.entrySet()) if((item.getKey()&types)!=0){
                    Insets i=item.getValue(); l=Math.max(l,i.left);t=Math.max(t,i.top);r=Math.max(r,i.right);b=Math.max(b,i.bottom);
                }
                return Insets.of(l,t,r,b);
            }
            public boolean isVisible(int types){return (visible&types)==types;}
            public static class Type {
                public static int statusBars(){return 1;} public static int navigationBars(){return 2;}
                public static int systemBars(){return 19;} public static int displayCutout(){return 4;}
                public static int captionBar(){return 16;}
                public static int ime(){return 8;}
            }
        }`,
};

test("patched SystemBars stops padding the navigation bar and keeps status bar avoidance", (t) => {
    const androidDir = officialProject(t);
    patchAndroidFork(androidDir);
    const temporary = mkdtempSync(join(tmpdir(), "siyuan-android-edge-to-edge-"));
    t.after(() => rmSync(temporary, {recursive: true, force: true}));
    const files = Object.entries(systemBarDoubles).map(([name, source]) => {
        const file = join(temporary, name);
        mkdirSync(dirname(file), {recursive: true});
        writeFileSync(file, source, "utf8");
        return file;
    });
    const systemBars = join(androidDir, "app", "src", "main", "java", "org", "b3log", "siyuan", "SystemBars.java");
    const testSource = join(temporary, "org/b3log/siyuan/SystemBarsEdgeToEdgeTest.java");
    mkdirSync(dirname(testSource), {recursive: true});
    writeFileSync(testSource, `package org.b3log.siyuan;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.WindowInsetsCompat;
public final class SystemBarsEdgeToEdgeTest {
    public static void main(String[] args) {
        final int status = WindowInsetsCompat.Type.statusBars();
        final int navigation = WindowInsetsCompat.Type.navigationBars();
        final int ime = WindowInsetsCompat.Type.ime();
        final View root = new View();
        root.setPadding(16, 16, 16, 16);
        SystemBars.applyInsets(root, new WindowInsetsCompat()
            .with(status, Insets.of(0, 50, 0, 0))
            .with(navigation, Insets.of(0, 0, 0, 24)), Insets.of(16, 16, 16, 16), false);
        check(root.getPaddingLeft() == 16 && root.getPaddingTop() == 66
            && root.getPaddingRight() == 16 && root.getPaddingBottom() == 16);
        SystemBars.applyInsets(root, new WindowInsetsCompat()
            .with(status, Insets.of(0, 50, 0, 0))
            .with(navigation, Insets.of(0, 0, 0, 144))
            .with(ime, Insets.of(0, 0, 0, 1000)), Insets.of(16, 16, 16, 16), true);
        check(root.getPaddingBottom() == 1016);
        final WebView webView = new WebView();
        SystemBars.applyInsets(webView, new WindowInsetsCompat()
            .with(navigation, Insets.of(0, 0, 12, 48)), Insets.NONE, false);
        check(webView.script.contains("bottom:48") && webView.script.contains("right:12"));
        final WindowInsetsCompat keyboard = new WindowInsetsCompat()
            .with(navigation, Insets.of(0, 0, 0, 48)).with(ime, Insets.of(0, 0, 0, 400));
        keyboard.visible = ime;
        SystemBars.applyInsets(webView, keyboard, Insets.NONE, false);
        check(webView.script.contains("bottom:0"));
        System.out.println("edge-to-edge inset cases passed");
    }
    private static void check(boolean condition) {
        if (!condition) throw new AssertionError("edge-to-edge inset regression");
    }
}
`, "utf8");
    execFileSync("javac", ["-encoding", "UTF-8", "-d", temporary, ...files, systemBars, testSource], {windowsHide: true});
    const output = execFileSync("java", ["-cp", temporary, "org.b3log.siyuan.SystemBarsEdgeToEdgeTest"], {
        windowsHide: true,
        encoding: "utf8",
    });
    assert.match(output, /edge-to-edge inset cases passed/);
});
