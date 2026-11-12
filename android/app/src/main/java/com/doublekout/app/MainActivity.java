package com.doublekout.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.view.View;
import android.view.Window;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.graphics.Color;
import android.widget.FrameLayout.LayoutParams;

public class MainActivity extends Activity {
    private WebView webView;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(5, 20, 16));
        webView = new WebView(this);
        webView.setAlpha(0f);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        root.addView(webView, new FrameLayout.LayoutParams(
            LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        ImageView splash = new ImageView(this);
        splash.setImageResource(R.mipmap.ic_launcher);
        splash.setScaleType(ImageView.ScaleType.FIT_CENTER);
        splash.setPadding(42, 42, 42, 42);
        splash.setBackgroundColor(Color.rgb(5, 20, 16));
        root.addView(splash, new FrameLayout.LayoutParams(
            LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        setContentView(root);

        webView.loadUrl("file:///android_asset/index.html");
        splash.setAlpha(0f);
        splash.animate().alpha(1f).setDuration(500).withEndAction(() ->
            splash.postDelayed(() -> {
                splash.animate().alpha(0f).setDuration(550).withEndAction(() -> {
                    root.removeView(splash);
                    webView.animate().alpha(1f).setDuration(250).start();
                }).start();
            }, 950)
        ).start();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
