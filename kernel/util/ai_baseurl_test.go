// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package util

import "testing"

func TestCanonicalizeAIProviderBaseURL(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"https://opencode.ai/zen/go/v1/chat/completions", "https://opencode.ai/zen/go/v1"},
		{"https://opencode.ai/zen/go/v1/chat/completions/", "https://opencode.ai/zen/go/v1"},
		{"https://api.commandcode.ai/provider/v1/chat/completions", "https://api.commandcode.ai/provider/v1"},
		{"https://api.kimi.com/coding/v1", "https://api.kimi.com/coding/v1"},
		{" https://token-plan-cn.xiaomimimo.com/v1/ ", "https://token-plan-cn.xiaomimimo.com/v1"},
		{"https://amr-link.open-design.ai", "https://amr-link.open-design.ai"},
	}
	for _, test := range tests {
		if got := CanonicalizeAIProviderBaseURL(test.in); got != test.want {
			t.Fatalf("CanonicalizeAIProviderBaseURL(%q) = %q, want %q", test.in, got, test.want)
		}
	}
}
