if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

g.clear();

var G = Graphics.createArrayBuffer(400, 308, 2, {
  msb: true,
  buffer: E.toArrayBuffer(E.memoryArea(0x10000000 + 16384, (400 * 308) >> 2))
});
G.flip = function() { return Pip.blitImage(G, 40, 7); };

var wavFiles = [];
try {
  var allFiles = require("fs").readdirSync("/ALARM");
  wavFiles = allFiles.filter(f => f.toLowerCase().endsWith(".wav") && !f.toLowerCase().endsWith("_silence.wav"));
} catch (e) {
  // Error handling
}

var selected = 0;
var currentPage = 0;
var playbackState = "stopped"; // "stopped", "playing", "paused"
var needsRedraw = true;
var playMsgLines = [];
var statusTimeout = null;

const LEFT_MARGIN = 30;
const HEADER_HEIGHT = 35;
const UNDERLINE_Y = HEADER_HEIGHT + 20;
const LIST_START_Y = UNDERLINE_Y + 20;
const LINE_HEIGHT = 24;
const FILES_PER_PAGE = 6;
const COLOR_GREEN = 3;
const COLOR_BLACK = 0;

function drawMenu() {
  G.clear(COLOR_BLACK);
  
  G.setColor(COLOR_GREEN).setFontMonofonto28();
  var headerText = "AUDIO PLAYER";
  var headerWidth = G.stringWidth(headerText);
  var headerX = Math.floor((G.getWidth() - headerWidth) / 2);
  G.drawString(headerText, headerX, 15);
  
  G.setColor(COLOR_GREEN).fillRect(0, UNDERLINE_Y, G.getWidth(), UNDERLINE_Y + 3);

  if (!wavFiles.length) {
    G.setFontMonofonto23().setColor(COLOR_GREEN);
    var noFilesText = "NO WAV FILES FOUND";
    var noFilesWidth = G.stringWidth(noFilesText);
    var noFilesX = Math.floor((G.getWidth() - noFilesWidth) / 2);
    G.drawString(noFilesText, noFilesX, G.getHeight() / 2);
    G.flip();
    return;
  }

  var totalPages = Math.ceil(wavFiles.length / FILES_PER_PAGE);
  var startIndex = currentPage * FILES_PER_PAGE;
  var endIndex = Math.min(startIndex + FILES_PER_PAGE, wavFiles.length);
  var filesOnPage = wavFiles.slice(startIndex, endIndex);

  var listDrawY = LIST_START_Y;
  if (totalPages > 1) {
    G.setFontMonofonto16().setColor(COLOR_GREEN);
    var pageInfo = `PAGE ${currentPage + 1}/${totalPages}`;
    var pageInfoWidth = G.stringWidth(pageInfo);
    G.drawString(pageInfo, G.getWidth() - pageInfoWidth - LEFT_MARGIN, LIST_START_Y);
    listDrawY += 25;
  }
  
  G.setFontMonofonto16();
  filesOnPage.forEach((name, i) => {
    var actualIndex = startIndex + i;
    var rowY = listDrawY + i * LINE_HEIGHT;
    
    if (actualIndex === selected) {
      G.setColor(COLOR_GREEN).fillRect(LEFT_MARGIN - 5, rowY - 4, G.getWidth() - LEFT_MARGIN + 5, rowY + LINE_HEIGHT - 4);
      G.setColor(COLOR_BLACK);
    } else {
      G.setColor(COLOR_GREEN);
    }
    var displayName = name;
    if (G.stringWidth(displayName) > G.getWidth() - LEFT_MARGIN - 40) {
      while (G.stringWidth(displayName + "...") > G.getWidth() - LEFT_MARGIN - 40 && displayName.length > 0) {
        displayName = displayName.slice(0, -1);
      }
      displayName += "...";
    }
    G.drawString(displayName, LEFT_MARGIN, rowY);
  });
  
  if (playbackState === "paused") {
    G.setColor(COLOR_GREEN).setFontMonofonto23();
    G.drawString("[PAUSED]", LEFT_MARGIN, G.getHeight() - 30);
  }

  if (playMsgLines.length) {
    var boxWidth = 360;
    var boxHeight = 20 * Math.min(6, playMsgLines.length) + 30;
    var boxX = Math.floor((G.getWidth() - boxWidth) / 2);
    var boxY = Math.floor((G.getHeight() - boxHeight) / 2);

    G.setColor(COLOR_GREEN).fillRect(boxX - 3, boxY - 3, boxX + boxWidth + 3, boxY + boxHeight + 3);
    G.setColor(COLOR_BLACK).fillRect(boxX, boxY, boxX + boxWidth, boxY + boxHeight);
    G.setColor(COLOR_GREEN).drawRect(boxX + 2, boxY + 2, boxX + boxWidth - 2, boxY + boxHeight - 2);

    G.setFontMonofonto16();
    G.setColor(COLOR_GREEN);
    for (var j = 0; j < Math.min(6, playMsgLines.length); j++) {
      var line = playMsgLines[j];
      var textWidth = G.stringWidth(line);
      var lineX = boxX + Math.floor((boxWidth - textWidth) / 2);
      var lineY = boxY + 20 + j * 20;
      G.drawString(line, lineX, lineY);
    }
  }
  
  G.flip();
  needsRedraw = false;
}

function stopPlayback() {
  if (playbackState !== "stopped") {
    try { Pip.audioStop(); } catch(e) {}
    playbackState = "stopped";
  }
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = null;
  if (playMsgLines.length > 0) {
    playMsgLines = [];
  }
  needsRedraw = true;
}

function onKnob(dir) {
  stopPlayback();
  if (!wavFiles.length) return;
  selected = Math.max(0, Math.min(wavFiles.length - 1, selected - dir));
  currentPage = Math.floor(selected / FILES_PER_PAGE);
  needsRedraw = true;
}
Pip.on("knob1", onKnob);

function onPageKnob(dir) {
  stopPlayback();
  if (!wavFiles.length) return;
  var totalPages = Math.ceil(wavFiles.length / FILES_PER_PAGE);
  currentPage = Math.max(0, Math.min(totalPages - 1, currentPage - dir));
  selected = currentPage * FILES_PER_PAGE;
  needsRedraw = true;
}
Pip.on("knob2", onPageKnob);

// --- Event-driven seek handlers ---
function onSeek(dir) {
  if (playbackState !== "playing") return;
  var seekTime = dir * 10000; // 10s
  try {
    Pip.audioSeek(seekTime);
    playMsgLines = [(dir > 0 ? ">> " : "<< ") + "10 SECONDS"];
    needsRedraw = true;
    if (statusTimeout) clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      playMsgLines = [];
      statusTimeout = null;
      needsRedraw = true;
    }, 1000);
  } catch(e) {
    playMsgLines = ["SEEK NOT SUPPORTED"];
    needsRedraw = true;
    setTimeout(() => { playMsgLines = []; needsRedraw = true; }, 1000);
  }
}

const seekForward = () => onSeek(1);
const seekBackward = () => onSeek(-1);

Pip.on("tuneUp", seekForward);
Pip.on("tuneDown", seekBackward);


var lastBtnState = false;
function frameLoop() {
  var btnState = KNOB1_BTN.read();
  if (btnState && !lastBtnState) {
    handlePlayButton();
  }
  lastBtnState = btnState;
  
  if (needsRedraw) {
    drawMenu();
  }
}
var frameInterval = setInterval(frameLoop, 100);

function handlePlayButton() {
  if (playbackState === "playing") {
    try { Pip.audioPause(); playbackState = "paused"; } catch(e) {}
    needsRedraw = true;
  } else if (playbackState === "paused") {
    try { Pip.audioResume(); playbackState = "playing"; } catch(e) {}
    needsRedraw = true;
  } else if (playbackState === "stopped") {
    if (!wavFiles.length) return;
    stopPlayback();
    
    var filename = wavFiles[selected];
    var fullPath = "/ALARM/" + filename;
    var results = ["PLAYING: " + filename.toUpperCase()];

    try {
      Pip.audioStart(fullPath);
      results.push("SUCCESS: PLAYBACK STARTED");
      playbackState = "playing";
    } catch (e) {
      results.push("ERROR: PLAYBACK FAILED");
    }

    playMsgLines = results;
    needsRedraw = true;
    
    statusTimeout = setTimeout(() => {
      playMsgLines = [];
      statusTimeout = null;
      needsRedraw = true;
    }, 4000);
  }
}

Pip.remove = function () {
  clearInterval(frameInterval);
  stopPlayback();
  Pip.removeListener("knob1", onKnob);
  Pip.removeListener("knob2", onPageKnob);
  Pip.removeListener("tuneUp", seekForward);
  Pip.removeListener("tuneDown", seekBackward);
};

drawMenu();