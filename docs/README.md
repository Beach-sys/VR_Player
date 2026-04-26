# VR180 Local Player Web App

This is the GitHub Pages version of the local VR180 player. It runs in the browser on your iPhone, opens a local video file from Files, and renders side-by-side VR180 video in a split headset view.

## GitHub Pages setup

1. Push this repository to GitHub.
2. Open the repository on GitHub.
3. Go to **Settings** > **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose your main branch and the `/docs` folder.
6. Save, then open the GitHub Pages URL on your iPhone.

## iPhone use

1. Open the GitHub Pages URL in Safari.
2. Tap **Open Video** and choose your local side-by-side VR180 file.
3. Tap **Enable Motion** and allow motion/orientation access.
4. Keep **Headset** and **SBS 3D** enabled.
5. Turn the phone landscape, put it in the headset, then tap **Recenter**.

## Important iPhone notes

- Device motion requires HTTPS. GitHub Pages provides HTTPS.
- For a more app-like fullscreen experience, open the page in Safari, tap Share, then **Add to Home Screen**.
- iPhone browser fullscreen support is limited compared with Android. Installed-to-home-screen mode is usually the best option.
- The video stays local on your phone. The browser reads it from the file picker; it is not uploaded to GitHub.
- This expects already converted equirectangular VR180 side-by-side video, not raw dual-fisheye camera footage.
