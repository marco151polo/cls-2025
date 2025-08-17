/* FILE PROCESSING */
var lv = new PruneClusterForLeaflet(160);
mymap.addLayer(lv);

// file input
$(document).on('change', ':file', function() {
    var input = $(this),
        numFiles = input.get(0).files ? input.get(0).files.length : 1,
        label = input.val().replace(/\\/g, '/').replace(/.*\//, '');
    input.trigger('fileselect', [numFiles, label]);
});

// Init oboe for streaming parse (cover all known shapes)
// Init oboe streaming parse (supports all known formats)
var totalPoints = 0;
var ob = oboe()
  .node('semanticSegments.*', function (seg) {
    try { totalPoints += handleParsedData({ semanticSegments: [seg] }, lv) || 0; }
    catch (e) { console.error("Error parsing semanticSegment:", e, seg); }
    return oboe.drop;
  })
  .node('locations.*', function (loc) {
    try { totalPoints += handleParsedData({ locations: [loc] }, lv) || 0; }
    catch (e) { console.error("Error parsing location:", e, loc); }
    return oboe.drop;
  })
  .node('timelineObjects.*', function (obj) {
    try { totalPoints += handleParsedData({ timelineObjects: [obj] }, lv) || 0; }
    catch (e) { console.error("Error parsing timelineObject:", e, obj); }
    return oboe.drop;
  })
  .done(function () {
    console.log("Oboe stream done. Points so far:", totalPoints);
    lv.ProcessView(); // force redraw
  })
  .fail(function (err) {
    console.error("Oboe parse error:", err);
  });

// initialize file parsing
$(':file').on('fileselect', function(event, numFiles, label) {
    var input = $(this).parents('.input-group').find(':text'),
        log = numFiles > 1 ? numFiles + ' files selected' : label;

    if (input.length) {
        input.val(log);
        var file = $('#uploadInput').get(0).files[0];
        count = 0;
        parseFile(file, ob);
        // initUpload(file);
    } else {
        if (log) alert(log);
    }
});


/*
 Break file into chunks and emit 'data' to oboe instance
 */

function parseFile(file, oboeInstance) {
    var fileSize = file.size;
    var chunkSize = 512 * 1024; // bytes
    var offset = 0;
    var self = this; // we need a reference to the current object
    var chunkReaderBlock = null;
    var startTime = Date.now();
    var endTime = Date.now();
	var backupBuffer = ""; // fallback if streaming misses anything
	var lastChunkBytes = 0; // size of the most recent Blob slice in BYTES
    var readEventHandler = function(evt) {
        if (evt.target.error == null) {
            // IMPORTANT: advance by BYTES, not characters
            offset = Math.min(offset + lastChunkBytes, fileSize); // use bytes not chars
            var progress = (100 * offset / fileSize).toFixed(2);
            var trimmed = (100 * offset / fileSize).toFixed(0);
            $("#done").css('width', trimmed + '%').attr('aria-valuenow', trimmed).text(progress + '%')
            var chunk = evt.target.result;
            backupBuffer += chunk;
            oboeInstance.emit('data', chunk); // stream to oboe
        } else {
            console.log("Read error: " + evt.target.error);
            return;
        }
        if (offset >= fileSize) {
			// finish the oboe stream
             ob.emit('done');
            console.log("Done reading file");
            $('#step-2').fadeIn(1000);
            endTime = Date.now();
            $("#stats").text(((endTime - startTime) / 1000).toFixed(2) + " seconds");
            // Fallback: if streaming caught nothing (e.g., unexpected structure),
            // fallback parse if stream caught nothing
            try {
              if (!totalPoints && backupBuffer && backupBuffer.trim().length) {
                console.warn("No streamed points. Falling back to full JSON parse.");
                var root = JSON.parse(backupBuffer);
                totalPoints += handleParsedData(root, lv) || 0;
                lv.ProcessView();
                console.log("Fallback points added:", totalPoints);
              }
            } catch (e) { console.error("Fallback parse failed:", e); }
            return;
        }

        // of to the next chunk
        chunkReaderBlock(offset, chunkSize, file);
    }

    chunkReaderBlock = function(_offset, length, _file) {
        var r = new FileReader();
        // Make sure we never request beyond fileSize
        var end = Math.min(_offset + length, _file.size);
        var blob = _file.slice(_offset, end);
        lastChunkBytes = blob.size;
        r.onload = readEventHandler;
        r.readAsText(blob, "utf-8");
    }

    // now let's start the read with the first block
    chunkReaderBlock(offset, chunkSize, file);
} 
parseFile(file, ob);
