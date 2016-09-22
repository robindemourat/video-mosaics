const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const path = require('path');
const async = require('async');
const ffmpeg = require('fluent-ffmpeg');
const moment = require('moment');
const pdf = require('phantom-html2pdf');

const defaultInputFile = './input/vid.mp4';
const defaultOutputDir = './output';

/**
 * Parse cli args-based inputParams, fill with default if needed,
 * check that all files and folders are there
 */
const formatParameters = function(inputParams, callback) {
  const input = inputParams.input;
  const output = inputParams.output;
  console.log(inputParams);
  async.waterfall([
    // check input file
    function(inputCb){
      if (input === undefined) {
        console.log('no input specified, using ', defaultInputFile);
        fs.exists(defaultInputFile, (defaultExists)=>{
          if (defaultExists) {
            inputCb(null, {input: defaultInputFile});
          } else {
            console.error(defaultInputFile, ' does not exist, leaving');
            inputCb({error: 'no valid input'});
          }
        });
      }else fs.exists(input, (defaultExists)=>{
          if (defaultExists) {
            inputCb(null, {input: input});
          } else {
            console.error(input, ' does not exist, leaving');
            inputCb({error: 'no valid input'});
          }
      });
    },
    // check output folder
    function(params, outputCb) {
      if (output === undefined) {
        console.log('no output folder specified, using ', defaultOutputDir);
        fs.exists(defaultOutputDir, function(folderExists){
          if (folderExists) {
            params.output = defaultOutputDir;
            outputCb(null, params);
          } else {
            console.log(defaultOutputDir, ' does not exist, creating it');
            fs.mkdir(defaultOutputDir, function(err, dir){
              if (!err) {
                params.output = defaultOutputDir;
                outputCb(null, params);
              }else outputCb(err);
            })
          }
        })
      } else {
        fs.exists(output, function(folderExists){
          if (folderExists) {
            params.output = output;
            outputCb(null, params);
          } else {
            console.log(output, ' does not exist, creating it');
            fs.mkdir(output, function(err, dir){
              if (!err) {
                params.output = output;
                outputCb(null, params);
              }else outputCb(err);
            })
          }
        })
      }
    },
    // populate screenshotting params if needed
    function(parameters, basicCb) {
      parameters.timespan = inputParams.timespan || 10;
      console.log('current timespan is ', parameters.timespan);
      parameters.filesname = 'screenshot_%s.png';
      callback(null, parameters);
    }
    ], callback);
}

/**
 * Main function
 */
var main = function (){
  async.waterfall([
    /**
     * Populate and checks conversion params from cli arguments
     */
    function(paramsCallback) {
      formatParameters(argv, paramsCallback);
    },
    /**
     * Check that input is a video and save its duration
     */
    function(parameters, durationCb) {
      ffmpeg(parameters.input)
      .ffprobe(0, function(err, data) {
        if (data.streams) {
          var duration;
          const video = data.streams.find(function(stream) {
            return stream.codec_type === 'video';
          });
          if (video) {
            duration = video.duration;
            console.log('video lasts %s seconds', video.duration);
          }
          if (duration) {
            parameters.duration = duration;
            durationCb(null, parameters);
          } else {
            console.log('could not find duration');
            durationCb({error: 'could not find duration'});
          }
        } else {
          console.log('could not find streams data for video, leaving');
          durationCb({error: 'no stream'});
        }
      });
    },
    /**
     * Take screenshots according to parameters
     */
    function(parameters, screenshotsCb) {
      const timemarks = [];
      if (parameters.duration && parameters.timespan) {
        var count = 0;
        while (count <= parameters.duration - parameters.timespan) {
          timemarks.push(count);
          count += parameters.timespan;
        }
      }
      const total = timemarks.length;
      var count = 0;

      console.log('Will output ', total, ' thumbnails');

      const packets = [];
      var packetCount = 0;
      const libLimit = 10;
      while (packetCount <= total) {
        packets.push(
            timemarks.slice(packetCount, packetCount + libLimit)
          );
        packetCount += libLimit;
      }
      console.log('splitting screenshots into %s packets of %s images', packets.length, libLimit);
      async.mapSeries(packets, function(packet, packetCb) {
        console.log('starting taking screenshots with new packet');
        var cb = false;
        var command = ffmpeg(parameters.input)
            .screenshots({
              timestamps: packet,
              folder: parameters.output,
              filename : parameters.filesname
            })
          .on('error', function(err) {
            console.log('error: ', err);
            packetCb(err);
          })
          .on('filenames', function(filenames) {
            console.log('Will generate ' + filenames.join(', '))
          })
          .on('end', function() {
            count++;
            console.log('Screenshots taken for current packet (%s/%s)', count, packets.length);

            setTimeout(function(){
              cb = true;
              return packetCb(null);
            }, 1000);
          });
      }, function(packetErrors) {
        console.log('all screenshots taken');
        screenshotsCb(packetErrors, parameters, timemarks);
      });
    },
    /**
     * Write a basic html file displaying images
     */
    function(parameters, timemarks, webpageOutput) {
      const htmlBefore = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Document</title>
  <style>
body{
}

.img-container{
  width : 20%;
  display:inline-block;
}
img{
  max-width : 100%;
}
p{
  font-style: italic;
  padding: 0;
  margin: 0;
}

  </style>
</head>
<body>
`;
    const htmlAfter= `
</body>
</html>
`;
      const imagesHtml = timemarks.map(function(timeMark) {
        var d = moment.duration(timeMark, 'seconds');
        var hours = Math.floor(d.asHours());
        var minutes = Math.floor(d.asMinutes()) - hours * 60;
        var seconds = Math.floor(d.asSeconds()) - minutes * 60 - hours * 3600;
        return `<div class="img-container">
        <img src="screenshot_${timeMark}.png" />
        <p>${hours}:${minutes}:${seconds}</p>
        </div>`
      }).join('\n');
      const html = htmlBefore + imagesHtml + htmlAfter;
      fs.writeFile(parameters.output + '/index.html', html, 'utf8', function(err) {
        console.log('html file written');
        webpageOutput(err, parameters, html);
      });
    },
    /**
     * Rewrite images path as absolute paths to please phantomjs conversion needs
     */
    function(parameters, html, tempHtmlOutput) {
      const tempHtml = html.replace(/(screenshot)/g, path.resolve(__dirname + '/' + parameters.output + '/screenshot'));
      fs.writeFile(parameters.output + '/temp.html', tempHtml, 'utf8', function(err) {
        tempHtmlOutput(err, parameters);
      })
    },
    /**
     * Convert and save a pdf files thanks to phantom js, using temp.html file (with images absolute paths)
     */
    function(parameters, pdfCallback) {
      console.log('converting to pdf');
      pdf.convert({
          "html" : parameters.output + '/temp.html',
          "paperSize" :{
            format: 'A4',
            orientation: 'portrait',
            border: '1cm',
            delay: 2000
          }
      }, function(err, results) {
        console.log('saving pdf to ', parameters.output + '/sequence.pdf');
        results.toFile(parameters.output + '/sequence.pdf', function(err){
          console.log('done with pdf conversion');
          pdfCallback(err, parameters);
        })
      })
    },
    /**
     * Delete temp html file
     */
    function(parameters, removeCallback) {
      fs.unlink(parameters.output + '/temp.html', removeCallback);
    }
  /**
   * Final callback
   */
  ], function (errors) {
    if (errors) {
      console.error('done, with errors : ', errors);
    } else console.log('done without errors');
  })
};

main();
