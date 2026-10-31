"""Android 发布工作流的门禁和桌面构建脚本回归测试。"""

import hashlib
import itertools
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
CD = (ROOT / ".github/workflows/cd.yml").read_text(encoding="utf-8")
DESKTOP = (ROOT / ".github/workflows/desktop-build.yml").read_text(encoding="utf-8")


def job(name):
    return re.search(rf"^  {name}:\n(.*?)(?=^  [\w-]+:\n|\Z)", CD, re.M | re.S).group(1)


def snapshot_command():
    step = DESKTOP.split("      - name: Snapshot raw ARM editor runtime\n", 1)[1]
    command = step.split("        run: |\n", 1)[1].split("        working-directory:", 1)[0]
    return "\n".join(line[10:] for line in command.splitlines())


class CDWorkflowTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "posix" and all(shutil.which(tool) for tool in ["bash", "tar", "sha256sum"]),
                         "musl download verification requires Bash, tar and sha256sum")
    def test_musl_download_is_pinned_and_verified_before_extraction(self):
        step = DESKTOP.split("      - name: Set up Linux musl compiler\n", 1)[1].split("      - ", 1)[0]
        self.assertIn("shell: bash", step)
        self.assertNotIn("continue-on-error", step)
        command = step.split("        run: |\n", 1)[1]
        command = "\n".join(line[10:] for line in command.splitlines())
        hashes = {
            "amd64": ("x86_64-linux-musl", "c5d410d9f82a4f24c549fe5d24f988f85b2679b452413a9f7e5f7b956f2fe7ea"),
            "arm64": ("aarch64-linux-musl", "c909817856d6ceda86aa510894fa3527eac7989f0ef6e87b5721c58737a06c38"),
        }
        for arch, (prefix, digest) in hashes.items():
            with self.subTest(arch=arch), tempfile.TemporaryDirectory(prefix="musl test ") as temporary:
                root = Path(temporary)
                tools = root / "bin"
                tools.mkdir()
                curl = tools / "curl"
                curl.write_text(
                    '#!/bin/bash\nset -eu\nprintf "%s\\n" "$@" > "$CURL_LOG"\n'
                    'if [[ "$DOWNLOAD_FAIL" == 1 ]]; then exit 22; fi\n'
                    'cp "$FIXTURE" "${@: -1}"\n', encoding="utf-8")
                curl.chmod(0o755)
                marker = root / "marker"
                marker.write_text("synthetic toolchain archive", encoding="utf-8")
                fixture = root / "fixture.tgz"
                with tarfile.open(fixture, "w:gz") as archive:
                    archive.add(marker, arcname=f"{prefix}-cross/marker")
                fixture_hash = hashlib.sha256(fixture.read_bytes()).hexdigest()
                self.assertIn(digest, command)
                for scenario in ["success", "checksum-mismatch", "download-failure", "unknown-arch"]:
                    with self.subTest(scenario=scenario):
                        runner = root / scenario
                        runner.mkdir()
                        output = runner / "output"
                        curl_log = runner / "curl.log"
                        # 只替换当前架构的已核验哈希，使用合成包验证流程，不执行工具链。
                        script = command if scenario == "checksum-mismatch" else command.replace(digest, fixture_hash)
                        result = subprocess.run(
                            ["bash", "--noprofile", "--norc", "-eo", "pipefail", "-c", script],
                            env={**os.environ, "PATH": f"{tools}{os.pathsep}{os.environ['PATH']}",
                                 "GOARCH": "unsupported" if scenario == "unknown-arch" else arch,
                                 "RUNNER_TEMP": str(runner), "GITHUB_OUTPUT": str(output),
                                 "FIXTURE": str(fixture), "CURL_LOG": str(curl_log),
                                 "DOWNLOAD_FAIL": "1" if scenario == "download-failure" else "0"},
                            capture_output=True, text=True)
                        if scenario == "success":
                            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                            self.assertEqual((runner / f"{prefix}-cross/marker").read_text(), marker.read_text())
                            self.assertEqual(output.read_text(), f"cc={runner}/{prefix}-cross/bin/{prefix}-gcc\n")
                        else:
                            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                            self.assertFalse((runner / f"{prefix}-cross").exists())
                            self.assertFalse(output.exists())
                        if scenario == "unknown-arch":
                            self.assertFalse(curl_log.exists())
                            self.assertIn("Unsupported Linux architecture", result.stdout)
                        else:
                            self.assertEqual(curl_log.read_text().splitlines(), [
                                "--fail", "--location", "--retry", "3",
                                f"https://github.com/musl-cc/musl.cc/releases/download/v0.0.1/{prefix}-cross.tgz",
                                "-o", str(runner / "musl-cross.tgz"),
                            ])

    @unittest.skipUnless(sys.platform == "linux" and all(shutil.which(tool) for tool in ["bash", "gcc", "readelf"]),
                         "Linux ELF verification requires native compiler and binutils")
    def test_linux_kernel_verification_rejects_dynamic_and_unusable_binaries(self):
        step = DESKTOP.split("      - name: Verify static Linux Kernel\n", 1)[1].split("      - ", 1)[0]
        command = step.split("        run: |\n", 1)[1]
        command = "\n".join(line[10:] for line in command.splitlines())
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "fixture.c"
            source.write_text(
                '#include <stdio.h>\n#include <string.h>\n'
                '#ifndef EXIT_CODE\n#define EXIT_CODE 0\n#endif\n'
                'int main(int argc, char **argv) {\n'
                '    if (argc != 2 || strcmp(argv[1], "--version")) return 3;\n'
                '    puts("Linux kernel fixture");\n'
                '    return EXIT_CODE;\n}\n', encoding="utf-8")
            for name, flags, expected in [
                ("static-pie", ["-static-pie"], 0),
                ("dynamic", [], 1),
                ("shared", ["-shared", "-fPIC"], 1),
                ("broken-startup", ["-static-pie", "-DEXIT_CODE=7"], 7),
            ]:
                with self.subTest(name=name):
                    binary = root / name
                    subprocess.run(["gcc", *flags, str(source), "-o", str(binary)], check=True, capture_output=True)
                    result = subprocess.run(["bash", "-euo", "pipefail", "-c", command],
                                            env={**os.environ, "KERNEL_PATH": str(binary), "LC_ALL": "C"},
                                            capture_output=True, text=True)
                    self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
                    if expected == 1:
                        self.assertIn("Linux kernel must be statically linked", result.stdout)
                    else:
                        self.assertIn("Linux kernel fixture", result.stdout)
            invalid = root / "invalid"
            invalid.write_text("not an ELF binary", encoding="utf-8")
            result = subprocess.run(["bash", "-euo", "pipefail", "-c", command],
                                    env={**os.environ, "KERNEL_PATH": str(invalid), "LC_ALL": "C"},
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)

    def test_cd_does_not_run_desktop_build_or_upload_jobs(self):
        self.assertNotIn("desktop-build.yml", CD)
        self.assertIsNone(re.search(r"^  build:\n", CD, re.M))
        for name in ["build_macos_arm64", "editor_e2e", "kernel-tests-windows", "frontend-tests"]:
            self.assertIsNone(re.search(rf"^  {name}:\n", CD, re.M), name)
        self.assertIn("assembleOfficialRelease", job("build_android"))
        self.assertIn("siyuan-${VERSION}.apk", job("create_release"))
        self.assertNotIn("linux.AppImage", job("create_release"))
        self.assertNotIn("mac.dmg", job("create_release"))
        self.assertNotIn("win.exe", job("create_release"))

    def test_release_downloads_android_apk_into_named_directory(self):
        release = job("create_release")
        download = release.split("- name: Download release artifacts\n", 1)[1].split("      - ", 1)[0]
        self.assertIn("uses: actions/download-artifact@v8", download)
        self.assertIn("name: siyuan-android", download)
        self.assertIn("path: siyuan-android", download)
        self.assertNotIn("pattern:", download)
        prepare = release.split("- name: Prepare Release Assets\n", 1)[1].split("      - ", 1)[0]
        self.assertIn('cp "siyuan-android/siyuan-${VERSION}.apk" release-assets/', prepare)
        upload = job("build_android").split("- name: Upload Build Artifacts\n", 1)[1].split("      - ", 1)[0]
        self.assertIn("name: siyuan-android", upload)
        self.assertIn("siyuan-${{ needs.prepare.outputs.version }}.apk", upload)

    def test_nonblocking_steps_have_ids_and_always_report_outcomes(self):
        for workflow in [CD, DESKTOP]:
            sections = re.split(r"^  [\w-]+:\n", workflow, flags=re.M)
            for section in sections:
                if "continue-on-error: true" not in section:
                    continue
                for step in re.split(r"^      - ", section, flags=re.M)[1:]:
                    if "continue-on-error: true" in step:
                        self.assertRegex(step, r"(?m)^        id: [\w-]+$")
                report = section.split("- name: Report non-blocking step outcomes\n", 1)[1]
                self.assertIn("if: always()", report)
                self.assertIn("WORKFLOW_STEPS: ${{ toJSON(steps) }}", report)
                self.assertIn("scripts/report-workflow-outcomes.mjs", report)

    def test_android_build_runs_in_parallel_with_checks(self):
        dependencies = re.search(r"needs: \[(.*?)\]", job("build_android")).group(1).split(", ")
        self.assertEqual(dependencies, ["prepare", "languages", "contracts"])

    def test_release_waits_for_all_checks_with_existing_failure_rules(self):
        release = job("create_release")
        self.assertIn("needs: [prepare, languages, contracts, kernel-tests-linux, build_android]", release)
        self.assertIn("contents: write", release)
        self.assertIn("actions: read", release)
        expression = re.search(r"if: >-\s*\$\{\{(.*?)\}\}", release, re.S).group(1)
        expression = expression.replace("always()", "True").replace("!cancelled()", "not cancelled")
        expression = expression.replace("&&", " and ")
        expression = re.sub(r"needs\.([\w-]+)\.result", r'results["\1"]', expression)
        expression = " ".join(expression.split())
        expression = compile(expression, "release condition", "eval")
        names = ["prepare", "languages", "contracts", "kernel-tests-linux", "build_android"]
        states = ["success", "failure", "skipped", "cancelled"]
        for values in itertools.product(states, repeat=len(names)):
            results = dict(zip(names, values))
            for cancelled in [False, True]:
                expected = not cancelled and all(value == "success" for value in values)
                actual = eval(expression, {"__builtins__": {}}, {"results": results, "cancelled": cancelled})
                self.assertEqual(actual, expected, (results, cancelled))

    def test_kernel_checks_are_independent_and_keep_native_prerequisites(self):
        contracts = job("contracts")
        self.assertNotIn("Test all kernel packages", contracts)
        linux = job("kernel-tests-linux")
        self.assertRegex(linux, r"(?m)^    needs: prepare$")
        self.assertIn("contents: read", linux)
        self.assertIn("uses: actions/checkout@v7", linux)
        self.assertIn("uses: actions/setup-node@v7", linux)
        self.assertNotRegex(linux, r"(?m)^    continue-on-error:")
        self.assertIn("uses: actions/setup-go@v7", linux)
        self.assertIn("go-version-file: kernel/go.mod", linux)
        self.assertIn("cache: false", linux)
        self.assertIn("uses: actions/cache/restore@v6", linux)
        self.assertIn("run: node scripts/go-cache.mjs", linux)
        self.assertIn("runs-on: ubuntu-24.04", linux)
        self.assertIn("sudo apt-get install -y strace", linux)
        self.assertIn("python3 scripts/prepare-ocr.py --runtime linux-amd64 --build-worker", linux)
        full = linux.split("- name: Test all kernel packages\n", 1)[1].split("      - ", 1)[0]
        self.assertIn('run: node ../scripts/test-kernel.mjs --shards 4 --output "${{ runner.temp }}/kernel-test-results"', full)
        self.assertIn("continue-on-error: true", full)
        self.assertIn("SIYUAN_OCR_TEST_ASSETS: ${{ github.workspace }}/app/stage/ocr/models", full)
        self.assertIn("SIYUAN_OCR_TEST_LIBRARY: ${{ github.workspace }}/app/stage/ocr/runtime/linux-amd64/libonnxruntime.so", full)
        paths = linux.split("- name: Test path fixtures with custom temporary directories\n", 1)[1].split("      - ", 1)[0]
        self.assertIn("continue-on-error: true", paths)
        self.assertIn(
            'run: go test -tags "fts5 sqlcipher" ./internal/testutil ./util ./model ./server '
            "-run 'Test(PublicDataDir|IsSensitivePath|.*Obsidian|RegisterStaticFileHandlers|StaticFile|WidgetResponseCacheControl|"
            "TemplatesAndExportRequireAdministrator|SnippetPublishAccess|PluginPublish|PublishFile)' -count=1", paths)
        self.assertIn("TMPDIR: /tmp", paths)
        self.assertIn("GOTMPDIR: ${{ runner.temp }}", paths)
        for hard_step in ["Install filesystem fault injection dependency", "Prepare native OCR verification resources"]:
            step = linux.split(f"- name: {hard_step}\n", 1)[1].split("      - ", 1)[0]
            self.assertNotIn("continue-on-error:", step)

    def test_kernel_shard_runner_and_logs_are_checked_on_linux(self):
        kernel = job("kernel-tests-linux")
        self.assertIn("run: node --test scripts/test-kernel.test.mjs", kernel)
        upload = kernel.split("- name: Upload kernel test logs\n", 1)[1].split("      - ", 1)[0]
        self.assertIn("if: always()", upload)
        self.assertIn("name: kernel-tests-linux", upload)
        self.assertIn("path: ${{ runner.temp }}/kernel-test-results", upload)

    def test_go_cache_and_builds_share_job_level_module_directory(self):
        for build in [DESKTOP.split("jobs:\n  build:\n", 1)[1], job("build_android")]:
            header, steps = build.split("    steps:\n", 1)
            self.assertIn("      GOPATH: ${{ github.workspace }}/go", header)
            self.assertNotIn("GOPATH:", steps)
            setup = steps.split("uses: actions/setup-go@v7", 1)[1].split("      - ", 1)[0]
            self.assertIn("cache: false", setup)
            self.assertNotIn("cache-dependency-path:", setup)
            self.assertIn("run: node scripts/go-cache.mjs", steps)
            self.assertIn("${{ steps.go-cache.outputs.modules }}", steps)
            self.assertIn("${{ steps.go-cache.outputs.build }}", steps)
        self.assertIn("  GOMODCACHE: ${{ github.workspace }}/go/pkg/mod", CD.split("jobs:", 1)[0])
        self.assertIn("      GOMODCACHE: ${{ github.workspace }}/go/pkg/mod", DESKTOP)
        self.assertIn('"$GOPATH/bin/gomobile" init', job("build_android"))
        self.assertIn("${{ github.workspace }}\\go\\${{ fromJSON(inputs.config).gobin }}\\goversioninfo", DESKTOP)

    def test_parallel_jobs_have_one_writer_per_shared_cache(self):
        def saves(workflow, name, hit):
            matches = re.findall(rf"- name: {name}\n(.*?)(?=      - |\Z)", workflow, re.S)
            if not matches:
                return False
            self.assertEqual(len(matches), 1)
            step = matches[0]
            self.assertIn("uses: actions/cache/save@v6", step)
            expression = re.search(r"if: \$\{\{ (.*?) \}\}", step)[1]
            expression = re.sub(r"steps\.[\w-]+\.outputs\.cache-hit", repr(str(hit).lower()), expression)
            expression = expression.replace("&&", " and ").replace("||", " or ")
            expression = re.sub(r"!(?!=)", "not ", expression)
            return eval(expression, {"__builtins__": {}}, {})

        readers = [job("contracts"), job("kernel-tests-linux"), job("build_android")]
        for cache in ["Go cache", "pnpm store"]:
            with self.subTest(cache=cache):
                self.assertEqual(sum(saves(workflow, "Save " + cache, False) for workflow in readers), 1)
                self.assertFalse(any(saves(workflow, "Save " + cache, True) for workflow in readers))
        for workflow in readers:
            self.assertNotIn("uses: actions/cache@", workflow)
            if "uses: actions/cache/save@v6" in workflow:
                self.assertIn("uses: actions/cache/restore@v6", workflow)

    def test_global_pnpm_installations_allow_only_the_pnpm_script(self):
        for workflow in [CD, DESKTOP]:
            installs = re.findall(r"\bnpm install[^\n]+", workflow)
            self.assertTrue(installs)
            for command in installs:
                self.assertIn("--global --allow-scripts=pnpm", command)
                self.assertNotIn("dangerously-allow-all-scripts", command)
                self.assertIn("packageManager", command)
        self.assertIn("scripts/go-cache.test.mjs", CD)
        self.assertIn("scripts/patch-android-fork.test.mjs", CD)

    def test_android_fork_version_verify_accepts_upstream_siyuan_android(self):
        prepare = job("prepare")
        self.assertIn("--verify-version", prepare)
        self.assertIn("scripts/patch-android-fork.mjs", prepare)
        self.assertIn("siyuan-android", prepare)

    def test_android_build_verification_preserves_pinned_legacy_checkouts(self):
        build = job("build_android")
        self.assertIn("node scripts/patch-android-fork.mjs", build)
        self.assertLess(build.index("Patch Android identity and kernel port"), build.index("Building Android App"))
        step = build.split("- name: Building Android App\n", 1)[1].split("      - ", 1)[0]
        self.assertIn("if [ -f scripts/verify-build.gradle ]; then", step)
        self.assertIn("./gradlew --init-script scripts/verify-build.gradle :app:verifyBuildConfiguration", step)
        self.assertLess(step.index(":app:verifyBuildConfiguration"), step.index("./gradlew assembleOfficialRelease"))
        self.assertIn("mv siyuan-*-official-release.apk siyuan-${{ needs.prepare.outputs.version }}.apk", step)

    @unittest.skipUnless(os.name == "posix" and all(shutil.which(tool) for tool in ["bash", "node", "tar", "shasum"]),
                         "Snapshot command requires Unix tools")
    def test_snapshot_round_trip_and_checksum(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            app = root / "app"
            kernel = app / "kernel-darwin-arm64/SiYuan-Kernel"
            kernel.parent.mkdir(parents=True)
            kernel.write_bytes(b"kernel fixture")
            kernel.chmod(0o755)
            desktop = app / "stage/build/desktop/index.html"
            desktop.parent.mkdir(parents=True)
            desktop.write_text("fixture", encoding="utf-8")
            dependency = app / "node_modules/.pnpm/example/index.js"
            dependency.parent.mkdir(parents=True)
            dependency.write_text("fixture", encoding="utf-8")
            (app / "node_modules/example").symlink_to(".pnpm/example", target_is_directory=True)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            sha = "a" * 40
            for name, value in [("uname", "arm64"), ("git", sha)]:
                executable = bin_dir / name
                executable.write_text(f"#!/bin/sh\nprintf '%s\\n' '{value}'\n", encoding="utf-8")
                executable.chmod(0o755)
            env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "RUNNER_TEMP": str(root / "temp"),
                   "GITHUB_SHA": sha, "TESTING_REF": "b" * 40}
            result = subprocess.run(["bash", "-euo", "pipefail", "-c", snapshot_command()], cwd=root,
                                    env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            runtime = root / "temp/editor-runtime"
            with tarfile.open(runtime / "runtime.tar.gz") as archive:
                self.assertTrue(archive.getmember("app/kernel-darwin-arm64/SiYuan-Kernel").mode & 0o111)
                self.assertEqual(archive.getmember("app/node_modules/example").linkname, ".pnpm/example")
                self.assertEqual(archive.extractfile("app/node_modules/.pnpm/example/index.js").read(), b"fixture")
            check = ["shasum", "-a", "256", "--check", "SHA256SUMS"]
            self.assertEqual(subprocess.run(check, cwd=runtime, capture_output=True).returncode, 0)
            with (runtime / "runtime.tar.gz").open("ab") as archive:
                archive.write(b"tampered")
            self.assertNotEqual(subprocess.run(check, cwd=runtime, capture_output=True).returncode, 0)
            env["TESTING_REF"] = ""
            self.assertNotEqual(subprocess.run(["bash", "-euo", "pipefail", "-c", snapshot_command()],
                                              cwd=root, env=env, capture_output=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()
