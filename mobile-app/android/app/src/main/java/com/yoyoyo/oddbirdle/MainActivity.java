package com.yoyoyo.oddbirdle;

import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Odd Birdle shell activity.
 *
 * - Keeps the screen on while the activity is in the foreground (the flag only acts
 *   while this window is visible, so it ends when the app goes to the background).
 * - Immersive full screen: status and navigation bars hidden; a swipe from the edge
 *   shows them transiently. Re-applied on resume and whenever the window regains focus
 *   (dialogs, notification shade, returning from recents).
 * - Edge-to-edge on every API level (Android 15+ enforces it for targetSdk 35+ anyway),
 *   with content allowed under the display cutout. Insets reach the page through
 *   Capacitor's SystemBars plugin (insetsHandling "css", see capacitor.config.json):
 *   with WebView 140+ and viewport-fit=cover the page gets env(safe-area-inset-*) and
 *   --safe-area-inset-* CSS variables; on older WebViews Capacitor pads the view natively.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(window, false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        enterImmersive();
    }

    @Override
    public void onResume() {
        super.onResume();
        enterImmersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersive();
        }
    }

    private void enterImmersive() {
        Window window = getWindow();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
