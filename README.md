AudioC JavaScript Library.

amrnb.js Ported opencore-amr-0.1.6.tar.gz using emscripten tool.

Build:
1. npm run build
2. cd build
3. sh build.sh

Usage:
* `AudioC()`: Pure front-end decoding and playback of audio without server support. The mainstream audio file formats supported by default include MP3, WAV, OGG, and AMR, and different browsers have different levels of support for these three formats. The MP3 format has the best support among them
  * Usage: 
    ```js
    var audio = new AudioC();
    audio.loadBlob(blob); // return Promise
    audio.loadUrl(url); // return Promise
    
    var totalTime = audio.getTotalTime();
    var currentTime = audio.getCurrentTime();

    audio.setGainValue(value); // 0 ~ 1.5
    audio.setPlaybackRate(pr); // 0.5 1 1.5 2

    audio.isPaused();

    audio.play();
    audio.pause();

    audio.skip(offset);

    audio.onEnded(callback);
    ```

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S6S6WBTNB)
