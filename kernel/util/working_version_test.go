// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package util

import "testing"

func TestForkReleaseVersionOrdering(t *testing.T) {
	if Ver != "3.8.9.1" {
		t.Fatalf("Ver = %q, want 3.8.9.1", Ver)
	}
	if !IsReleaseVer("3.8.9.1") || !IsReleaseVer("3.8.9") || IsReleaseVer("3.8.9-beta.1") {
		t.Fatal("unexpected release-version classification")
	}
	if got := CompareAppVer("3.8.9", "3.8.9.1"); got >= 0 {
		t.Fatalf("3.8.9 compared with 3.8.9.1 = %d, want negative", got)
	}
	if got := CompareAppVer("3.8.9.1", "3.8.10"); got >= 0 {
		t.Fatalf("3.8.9.1 compared with 3.8.10 = %d, want negative", got)
	}
	if got := CompareAppVer("3.8.9.1", "3.8.9.1"); got != 0 {
		t.Fatalf("equal fork versions compared as %d", got)
	}
}
