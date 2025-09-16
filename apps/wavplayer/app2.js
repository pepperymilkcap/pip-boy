if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

let G = Graphics.createArrayBuffer(400,308,2,{
  msb : true,
  buffer : E.toArrayBuffer(E.memoryArea(0x10000000 + 16384, (400*308)>>2))
});
G.flip = () => Pip.blitImage(G,40,7);

let wavFiles = [];
let allFiles = [];
let errorMsg = "";
let playMsg = "";
try {
  allFiles = require("fs").readdirSync("/ALARM");
  wavFiles = allFiles.filter(f => f.toLowerCase().endsWith(".wav"));
} catch(e) {
  errorMsg = "ERROR: " + e;
  wavFiles = [];
}

let selected = 0;
const LEFT_MARGIN = 25; // UI further left
const TOP_MARGIN = 32;
const LINE_HEIGHT = 36;
const DEBUG_LINES = 4;

function drawMenu() {
  G.clear(1).setFontMonofonto18();
  let y = 8;
  G.setColor(1);
  G.drawString("DEBUG: /ALARM files", LEFT_MARGIN, y);
  y += 18;
  if (errorMsg) {
    G.drawString(errorMsg, LEFT_MARGIN, y);
    y += 18;
  } else {
    allFiles.slice(0,DEBUG_LINES).forEach((file, idx) => {
      G.drawString((idx+1)+": "+file, LEFT_MARGIN, y);
      y += 18;
    });
  }
  G.setColor(0);

  G.setFontMonofonto28();
  y = TOP_MARGIN + DEBUG_LINES * 18;
  if (!wavFiles.length) {
    G.setColor(1);
    G.drawString("No WAV files found", LEFT_MARGIN, y);
    G.setColor(0);
    G.flip();
    return;
  }

  wavFiles.forEach((name, i) => {
    let rowY = y + i * LINE_HEIGHT;
    if (i === selected) {
      G.setColor(2).fillRect(LEFT_MARGIN - 4, rowY - 2, G.getWidth() - 10, rowY + 30);
      G.setColor(0);
    } else {
      G.setColor(1);
    }
    G.drawString(name, LEFT_MARGIN, rowY);
  });

  G.setFontMonofonto18();
  G.setColor(1);

  // Show multiline errors and statuses
  let lines = Array.isArray(playMsg) ? playMsg : [playMsg];
  lines.forEach((line, idx) => {
    G.drawString(line, LEFT_MARGIN, y + wavFiles.length * LINE_HEIGHT + 20 + idx * 20);
  });

  G.setColor(0);
  G.flip();
}

function onKnob(dir) {
  if (!wavFiles.length) return;
  selected = Math.max(0, Math.min(wavFiles.length-1, selected - dir));
  playMsg = "";
  drawMenu();
}
Pip.on("knob1", onKnob);

function playSelected() {
  if (!wavFiles.length) return;
  let filename = wavFiles[selected];
  let fullPath = "/ALARM/" + filename;
  let results = [];
  results.push("Trying: " + fullPath);

  // Try Pip.audioStart(fullPath)
  try {
    Pip.audioStart(fullPath);
    results.push("audioStart(path): OK");
  } catch(e) {
    results.push("audioStart(path) ERR: " + (e && e.toString ? e.toString() : e));
  }

  // Try Pip.audioStartVar(fullPath)
  try {
    Pip.audioStartVar(fullPath);
    results.push("audioStartVar(path): OK");
  } catch(e) {
    results.push("audioStartVar(path) ERR: " + (e && e.toString ? e.toString() : e));
  }

  // Try Pip.audioStartVar(buffer)
  try {
    let wavBuffer = require("fs").readFileSync(fullPath);
    Pip.audioStartVar(wavBuffer);
    results.push("audioStartVar(buffer): OK");
  } catch(e) {
    results.push("audioStartVar(buffer) ERR: " + (e && e.toString ? e.toString() : e));
  }

  // Fallback: Pip.audioStartVar(Pip.audioBuiltin("CHIRP"))
  try {
    Pip.audioStartVar(Pip.audioBuiltin("CHIRP"));
    results.push("CHIRP fallback: OK");
  } catch(e) {
    results.push("CHIRP fallback ERR: " + (e && e.toString ? e.toString() : e));
  }

  playMsg = results;
  drawMenu();
}

function onButton() {
  playSelected();
}
Pip.on("knob1btn", onButton);

Pip.remove = function() {
  Pip.removeListener("knob1", onKnob);
  Pip.removeListener("knob1btn", onButton);
};

drawMenu();