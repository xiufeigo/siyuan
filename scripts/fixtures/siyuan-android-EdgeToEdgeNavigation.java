package org.b3log.siyuan;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.blankj.utilcode.util.BarUtils;

/** 透明导航栏。状态栏仍由 UltimateBarX 与顶部 padding 处理，导航栏 inset 通过 CSS 变量交给 WebView。 */
final class EdgeToEdgeNavigation {
    private EdgeToEdgeNavigation() {
    }

    static void showNavigation(final Activity activity) {
        if (activity == null) {
            return;
        }
        BarUtils.setNavBarVisibility(activity, true);
        final Window window = activity.getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
    }

    static void configure(final Activity activity) {
        if (activity == null) {
            return;
        }
        showNavigation(activity);
        WindowCompat.setDecorFitsSystemWindows(activity.getWindow(), false);
    }

    static void fitWebView(final WebView webView) {
        if (webView == null) {
            return;
        }
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            applyWebViewSafeArea((WebView) view, insets);
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    static void sync(final WebView webView) {
        if (webView == null) {
            return;
        }
        final WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(webView);
        if (insets != null) {
            applyWebViewSafeArea(webView, insets);
            return;
        }
        ViewCompat.requestApplyInsets(webView);
    }

    static void applyWebViewSafeArea(final WebView webView, final WindowInsetsCompat insets) {
        if (webView == null || insets == null) {
            return;
        }
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

    private static String cssPx(final int px, final float density) {
        if (px <= 0) {
            return "0";
        }
        return Double.toString(Math.round(px / density * 10000d) / 10000d);
    }
}
