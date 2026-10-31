import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {test} from "node:test";
import {
    ANDROID_APPLICATION_ID,
    ANDROID_KERNEL_PORT,
    OFFICIAL_APPLICATION_ID,
    OFFICIAL_KERNEL_PORT,
    patchAndroidFork,
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
        `package ${OFFICIAL_APPLICATION_ID};\nprivate static final int SIYUAN_WEBVIEW_PORT = ${OFFICIAL_KERNEL_PORT};\n`);
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

test("keeps Java sources in the official package when optional files are absent", (t) => {
    const androidDir = officialProject(t);
    rmSync(join(androidDir, "scripts", "verify-build.gradle"));
    rmSync(join(androidDir, "app", "src", "test"), {recursive: true, force: true});
    patchAndroidFork(androidDir);
    const main = readFileSync(join(androidDir, "app", "src", "main", "java", "org", "b3log", "siyuan", "MainActivity.java"), "utf8");
    assert.match(main, new RegExp(`package ${OFFICIAL_APPLICATION_ID};`));
    assert.match(main, new RegExp(`SIYUAN_WEBVIEW_PORT = ${ANDROID_KERNEL_PORT};`));
});
