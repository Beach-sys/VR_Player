# VR Player Web App

This is the GitHub Pages version of VR Player. It runs in the browser on your iPhone, opens a local video file from Files, and renders side-by-side VR180 video in a split headset view.

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
5. Turn the phone landscape, put it in the headset, then choose **Recenter**. You get a short countdown to position your head before the view resets.
6. Look back toward the video's centered view to see the world-locked timeline and **Menu** button.
7. Look at **Menu** for about one second to open the circular options menu.
8. Look at the timeline for about one second to jump to that part of the video.

## Important iPhone notes

- Device motion requires HTTPS. GitHub Pages provides HTTPS.
- For real full screen on iPhone, open the page in Safari, tap Share, then **Add to Home Screen**. iPhone Safari does not let a web page force true full screen with JavaScript.
- iPhone browser fullscreen support is limited compared with Android. Installed-to-home-screen mode is usually the best option.
- The video stays local on your phone. The browser reads it from the file picker; it is not uploaded to GitHub.
- This expects already converted equirectangular VR180 side-by-side video, not raw dual-fisheye camera footage.
- Very large files can still take time to open because Safari has to read metadata, decode the video, and feed frames into WebGL locally.
- If a video appears upside down, use **Flip On/Off** manually. The app leaves flipping off by default.
