// SiYuan - https://github.com/siyuan-note/siyuan
// Copyright (c) 2020-present, b3log.org
// SPDX-License-Identifier: AGPL-3.0-or-later

package util

import "strings"

const chatCompletionsPath = "/chat/completions"

// CanonicalizeAIProviderBaseURL 去掉用户粘贴的完整 Chat Completions 路径，保留 SDK 风格的 Base URL。
func CanonicalizeAIProviderBaseURL(baseURL string) string {
	url := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(strings.ToLower(url), chatCompletionsPath) {
		return strings.TrimRight(url[:len(url)-len(chatCompletionsPath)], "/")
	}
	return url
}
