import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const workDir = path.join(rootDir, '.apk_build');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      // Do not recursively copy the .apk itself into assets
      if (childItemName.endsWith('.apk')) return;
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    fs.copyFileSync(src, dest);
  }
}

async function buildApk() {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '/usr/local/lib/android/sdk';
  if (!fs.existsSync(sdkRoot)) {
    console.log('Android SDK not found in this environment; skipping local APK build.');
    return;
  }

  // Find latest build-tools and platform android.jar
  const buildToolsRoot = path.join(sdkRoot, 'build-tools');
  const buildToolsVersions = fs.readdirSync(buildToolsRoot).sort();
  const buildToolsDir = path.join(buildToolsRoot, buildToolsVersions[buildToolsVersions.length - 1]);

  const platformsRoot = path.join(sdkRoot, 'platforms');
  const platformVersions = fs.readdirSync(platformsRoot).sort();
  const platformDir = path.join(platformsRoot, platformVersions[platformVersions.length - 1]);
  const androidJar = path.join(platformDir, 'android.jar');

  const aapt2 = path.join(buildToolsDir, 'aapt2');
  const d8 = path.join(buildToolsDir, 'd8');
  const zipalign = path.join(buildToolsDir, 'zipalign');
  const apksigner = path.join(buildToolsDir, 'apksigner');

  console.log(`Using build-tools: ${buildToolsDir}`);
  console.log(`Using android.jar: ${androidJar}`);

  fs.rmSync(workDir, { recursive: true, force: true });
  const srcJavaDir = path.join(workDir, 'src', 'com', 'jcvcreatives', 'photobooth');
  const resMipmapDir = path.join(workDir, 'res', 'mipmap-hdpi');
  const resValuesDir = path.join(workDir, 'res', 'values');
  const assetsWwwDir = path.join(workDir, 'assets', 'www');
  const classesDir = path.join(workDir, 'classes');

  fs.mkdirSync(srcJavaDir, { recursive: true });
  fs.mkdirSync(resMipmapDir, { recursive: true });
  fs.mkdirSync(resValuesDir, { recursive: true });
  fs.mkdirSync(assetsWwwDir, { recursive: true });
  fs.mkdirSync(classesDir, { recursive: true });

  // 1. Copy compiled web app (dist/) into assets/www/ inside the APK
  copyRecursiveSync(distDir, assetsWwwDir);

  // 2. Copy app icon into res/mipmap-hdpi/ic_launcher.png
  const iconSrc = path.join(rootDir, 'public', 'pwa-192x192.png');
  fs.copyFileSync(iconSrc, path.join(resMipmapDir, 'ic_launcher.png'));

  // 3. Create res/values/strings.xml
  fs.writeFileSync(
    path.join(resValuesDir, 'strings.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">JCVcreatives Photobooth</string>
</resources>
`
  );

  // 4. Create AndroidManifest.xml supporting Android 5.0, 6.0, 7.0/7.1 (Nougat), 8.0 - 14.0 (minSdkVersion 21)
  fs.writeFileSync(
    path.join(workDir, 'AndroidManifest.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.jcvcreatives.photobooth"
    android:versionCode="204"
    android:versionName="2.4.0">

    <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="31" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />

    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.front" android:required="false" />
    <uses-feature android:name="android.hardware.bluetooth" android:required="false" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true"
        android:theme="@android:style/Theme.NoTitleBar.Fullscreen">

        <activity
            android:name=".MainActivity"
            android:label="@string/app_name"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden|keyboard">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`
  );

  // 5. Create MainActivity.java tailored for Android 7+ (API 21+) WebView offline asset execution
  fs.writeFileSync(
    path.join(srcJavaDir, 'MainActivity.java'),
    `package com.jcvcreatives.photobooth;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;
    private static final int CAMERA_PERMISSION_CODE = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        // Request Camera permission at runtime for Android 6.0 / 7.0+ (API 23+)
        if (Build.VERSION.SDK_INT >= 23) {
            if (checkSelfPermission("android.permission.CAMERA") != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{"android.permission.CAMERA"}, CAMERA_PERMISSION_CODE);
            }
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#FAF8F5"));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= 16) {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
        }
        if (Build.VERSION.SDK_INT >= 17) {
            settings.setMediaPlaybackRequiresUserGesture(false);
        }
        if (Build.VERSION.SDK_INT >= 21) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.startsWith("file://") || url.startsWith("http://") || url.startsWith("https://"))) {
                    return false;
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                if (Build.VERSION.SDK_INT >= 21) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            request.grant(request.getResources());
                        }
                    });
                }
            }
        });

        setContentView(webView);
        hideSystemUI();

        // Load bundled offline photobooth app directly from APK assets
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    private void hideSystemUI() {
        if (Build.VERSION.SDK_INT >= 19) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        }
    }
}
`
  );

  // 6. Compile resources with aapt2
  const compiledResZip = path.join(workDir, 'compiled_res.zip');
  run(`"${aapt2}" compile --dir "${path.join(workDir, 'res')}" -o "${compiledResZip}"`);

  // 7. Link APK with aapt2 (including -A assets so assets/www/* is bundled inside the APK)
  const unalignedApk = path.join(workDir, 'unaligned.apk');
  run(
    `"${aapt2}" link -o "${unalignedApk}" -I "${androidJar}" --manifest "${path.join(
      workDir,
      'AndroidManifest.xml'
    )}" --java "${path.join(workDir, 'src')}" -A "${path.join(workDir, 'assets')}" --auto-add-overlay "${compiledResZip}"`
  );

  // 8. Compile Java sources targeting Java 8 bytecode for Android 7 compatibility
  const rJavaPath = path.join(srcJavaDir, 'R.java');
  const mainJavaPath = path.join(srcJavaDir, 'MainActivity.java');
  run(`javac -source 1.8 -target 1.8 -bootclasspath "${androidJar}" -classpath "${androidJar}" -d "${classesDir}" "${rJavaPath}" "${mainJavaPath}"`);

  // 9. Convert .class files to classes.dex using d8 with --min-api 21
  const classFiles = fs
    .readdirSync( path.join(classesDir, 'com', 'jcvcreatives', 'photobooth'))
    .filter((f) => f.endsWith('.class'))
    .map((f) => `"${path.join(classesDir, 'com', 'jcvcreatives', 'photobooth', f)}"`)
    .join(' ');
  run(`"${d8}" --min-api 21 --lib "${androidJar}" --output "${workDir}" ${classFiles}`);

  // 10. Add classes.dex to the root of unaligned.apk
  run(`cd "${workDir}" && zip -uj "${unalignedApk}" "${path.join(workDir, 'classes.dex')}"`);

  // 11. Align APK with zipalign
  const alignedApk = path.join(workDir, 'aligned.apk');
  run(`"${zipalign}" -f -p 4 "${unalignedApk}" "${alignedApk}"`);

  // 12. Generate signing keystore and sign with BOTH v1 (required for Android 7.0!) and v2/v3
  const keystorePath = path.join(workDir, 'release.keystore');
  run(
    `keytool -genkeypair -v -keystore "${keystorePath}" -alias jcvkey -keyalg RSA -keysize 2048 -validity 10000 -storepass jcv123456 -keypass jcv123456 -dname "CN=JCVcreatives, OU=Studio, O=JCVcreatives, L=Manila, S=MetroManila, C=PH"`
  );

  const outputApkDist = path.join(distDir, 'JCVcreatives-Photobooth.apk');
  fs.mkdirSync(path.join(distDir, 'downloads'), { recursive: true });
  const outputApkDownloads = path.join(distDir, 'downloads', 'JCVcreatives-Photobooth.apk');

  run(
    `"${apksigner}" sign --ks "${keystorePath}" --ks-key-alias jcvkey --ks-pass pass:jcv123456 --key-pass pass:jcv123456 --v1-signing-enabled true --v2-signing-enabled true --out "${outputApkDist}" "${alignedApk}"`
  );
  fs.copyFileSync(outputApkDist, outputApkDownloads);

  console.log(`Successfully built Android 7+ offline APK: ${outputApkDist}`);
  fs.rmSync(workDir, { recursive: true, force: true });
  process.exit(0);
}

buildApk().catch((err) => {
  console.error('APK build error:', err);
  process.exit(1);
});

