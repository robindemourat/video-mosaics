Video mosaics
===

VIDEO ==> screenshots + html mosaic + pdf mosaic

A nano cli tool wrapping `fluent-ffmpeg` lib to provide a quick way to generate thumbnails out of a local video and output from it some image files, an html page, and a pdf file.

# Installation

* [install node](https://nodejs.org/en/)
* `git clone https://github.com/robindemourat/video-mosaics`
* `cd video-mosaics` (to get to the script)
* `npm install` (to install dependencies)
* (put your video in the script folder, ideally in an `input` folder)
* `npm run convert` + params (see below) to start conversion process

# Usage

If you use just ``npm run convert`` the script presumes your inputting a video located at relative path `./input/vid.mp4` and outputting at `./output/`.

Accepted arguments of the script :

```
--input : relative file path of the video to process (default ./input/vid.mp4)
--output : relative folder path of the directory in which to put results (default ./output)
--timespan : the timespan to use for screenshotting, in seconds (default 10 seconds)
```

# Contribution

Feel free to contribute and add some features to this nano-tool if you find some use in it.
