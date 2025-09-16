const LEFT_MARGIN = 25;
const TOP_MARGIN = 15;
const LINE_HEIGHT = 22;

// Gather WAV files from /ALARM
let wavFiles = require("fs").readdirSync("/ALARM")
  .filter(f => f.toLowerCase().endsWith(".wav"));
let selected = 0;
let playMsg = "";

// Draw the file list and debug info
function drawMenu() {
  let G = Graphics.createArrayBuffer(400, 308, 2, {
    msb: true,
    buffer: E.toArrayBuffer(E.memoryArea(0x10000000 + 16384, (400 * 308) >> 2))
  });
  G.setFontMonofonto18();
  G.clear();
  G.drawString("WAV Player", LEFT_MARGIN, TOP_MARGIN);
  G.setFontMonofonto16();

  if (!wavFiles.length) {
    G.drawString("No WAV files found in /ALARM", LEFT_MARGIN, TOP_MARGIN + LINE_HEIGHT);
  } else {
    for (let i = 0; i < wavFiles.length; i++) {
      if (i === selected) G.setColor(1, 1, 0);
      G.drawString(wavFiles[i], LEFT_MARGIN, TOP_MARGIN + LINE_HEIGHT * (i + 1));
      G.setColor(1, 1, 1);
    }
  }

  G.setFontMonofonto12();
  G.drawString(playMsg, LEFT_MARGIN, 308 - LINE_HEIGHT * 2);
  Pip.blitImage(G, 40, 7);
}

// Try all known ways to play audio, show diagnostics
function playSelected() {
  playMsg = "";
  if (!wavFiles.length) return;
  let filename = wavFiles[selected];
  let fullPath = "/ALARM/" + filename;
  let tried = [];
  let errors = [];

  // Try audioStart (direct file path)
  try {
    Pip.audioStart(fullPath);
    playMsg += "audioStart(path) OK; ";
    tried.push("audioStart(path)");
  } catch (e) {
    errors.push("audioStart(path): " + e);
  }

  // Try audioStartVar (file path as var)
  try {
    Pip.audioStartVar(fullPath);
    playMsg += "audioStartVar(path) OK; ";
    tried.push("audioStartVar(path)");
  } catch (e) {
    errors.push("audioStartVar(path): " + e);
  }

  // Try audioStartVar (file buffer as var)
  try {
    let wavBuffer = require("fs").readFileSync(fullPath);
    Pip.audioStartVar(wavBuffer);
    playMsg += "audioStartVar(buffer) OK; ";
    tried.push("audioStartVar(buffer)");
  } catch (e) {
    errors.push("audioStartVar(buffer): " + e);
  }

  // Fallback to built-in CHIRP
  try {
    Pip.audioStartVar(Pip.audioBuiltin("CHIRP"));
    playMsg += "CHIRP fallback played; ";
    tried.push("CHIRP");
  } catch (e) {
    errors.push("CHIRP: " + e);
  }

  playMsg += "\nTried: " + tried.join(", ");
  if (errors.length) playMsg += "\nErrors: " + errors.join(" | ");
  drawMenu();
}

// Handle knob rotation to change selection
function onKnob(dir) {
  if (!wavFiles.length) return;
  selected = Math.max(0, Math.min(wavFiles.length - 1, selected - dir));
  drawMenu();
}

// Handle knob button press to play audio
function onBtn() {
  playSelected();
}

// Cleanup listeners on exit
Pip.remove = function () {
  Pip.removeListener("knob1", onKnob);
  Pip.removeListener("knob1btn", onBtn);
};

// Set up input handlers
Pip.on("knob1", onKnob);
Pip.on("knob1btn", onBtn);

// Draw initial menu
drawMenu();