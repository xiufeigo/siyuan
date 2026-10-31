#!/usr/bin/env node
// 将官方 siyuan-android 检出改为本 fork 的 applicationId 和 Android 内核端口。
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const ANDROID_APPLICATION_ID = "xiufeigo.siyuan";
export const ANDROID_KERNEL_PORT = "6805";
export const OFFICIAL_APPLICATION_ID = "org.b3log.siyuan";
export const OFFICIAL_KERNEL_PORT = "6806";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forkReleaseVersion = /^(\d+\.\d+\.\d+)\.(\d+)$/;

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

export function isAndroidVersionCompatible(androidVersion, forkVersion) {
    const version = String(forkVersion || "").trim();
    const android = String(androidVersion || "").trim();
    if (!android || !version) {
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

const modulePath = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] || "") === modulePath) {
    const argv = process.argv.slice(2);
    const androidDir = parseAndroidDir(argv);
    if (!androidDir) {
        console.error("Usage: node scripts/patch-android-fork.mjs --android-dir=<path> [--verify-version]");
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
        console.log(`Patched Android applicationId ${ANDROID_APPLICATION_ID} and kernel port ${ANDROID_KERNEL_PORT}:`);
        for (const file of changed) {
            console.log(`  ${file}`);
        }
    }
}
