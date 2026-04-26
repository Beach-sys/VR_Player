# VR180 Local Player

This repository contains a browser-based VR180 local video player you can host with GitHub Pages and use on an iPhone.

The web app is in `docs/`.

## Use On iPhone

1. Host this repo with GitHub Pages from the `/docs` folder.
2. Open the GitHub Pages URL in Safari on your iPhone.
3. Tap **Open Video** and choose your local side-by-side VR180 video.
4. Tap **Enable Motion** and allow motion/orientation access.
5. Keep **Headset** and **SBS 3D** enabled.
6. Turn the phone landscape, put it in your headset, and tap **Recenter**.

For the most app-like experience, open the page in Safari, tap Share, then **Add to Home Screen**.

## GitHub Pages

After uploading this repository to GitHub:

1. Go to **Settings** > **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose your main branch.
4. Choose the `/docs` folder.
5. Save.

GitHub will give you a Pages URL after it deploys.

## Notes

- The selected video stays local on your phone. It is not uploaded to GitHub.
- iPhone motion access requires HTTPS and a tap on **Enable Motion**.
- GitHub Pages provides HTTPS.
- This expects already converted equirectangular VR180 side-by-side video.
- Raw dual-fisheye footage may look warped unless converted first.

The original native iOS Xcode version is still in `VR180LocalPlayer/`, but the GitHub Pages app does not need Xcode.
