// pip-term.js - A Terminal and Keyboard App for the Pip-Boy

// --- Application Cleanup ---
if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

g.clear();

// --- Graphics Setup ---
var G = Graphics.createArrayBuffer(400, 308, 2, {
  msb: true,
  buffer: E.toArrayBuffer(E.memoryArea(0x10000000 + 16384, (400 * 308) >> 2))
});
G.flip = function() { return Pip.blitImage(G, 40, 7); };

// --- UI Constants ---
const COLOR_GREEN = 3;
const COLOR_BLACK = 0;
const W = G.getWidth();
const H = G.getHeight();

// --- Terminal State ---
var terminalLines = [">"];
const MAX_TERMINAL_LINES = 7;
const TERMINAL_HEIGHT = 120;
const TERMINAL_LINE_HEIGHT = 16;

// --- Keyboard State ---
var keyLayouts = {
  lower: [
    ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'BKSP'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", '\\'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
    ['SYM', 'SPACE', 'ENTER']
  ],
  upper: [
    ['~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 'BKSP'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '{', '}'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', '"', '|'],
    ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?'],
    ['SYM', 'SPACE', 'ENTER']
  ],
  symbol: [
    ['', '', '', '', '', '', '', '', '', '', '', 'BKSP'],
    ['var', 'let', 'const', '=', '=>', '+', '-', '*', '/', '%', '==', '!='],
    ['if', 'else', '(', ')', '{', '}', '[', ']', 'true', 'false', '!', '&&'],
    ['SHIFT', 'while', 'for', '()', '{}', '[]', 'null', 'undefined', '||', ''],
    ['SYM', 'SPACE', 'ENTER']
  ]
};
var currentLayout = 'lower';
var cursor = { x: 0, y: 0 };
var needsRedraw = true;

// --- Keyboard Drawing ---
const KEY_H = 32;
const KEY_W = 28; // Default key width, made slightly smaller
const KEY_Y_START = TERMINAL_HEIGHT + 10;
const KEY_X_GUTTER = 2;
const KEY_Y_GUTTER = 4;
const KEY_X_START = 4; // Keyboard's left margin

function getKeyWidth(key) {
  if (key === 'SPACE') return 180;
  if (key === 'ENTER') return 80;
  if (key === 'SHIFT' || key === 'SYM') return 60;
  if (key === 'BKSP') return 62;
  if (key.length > 2) return 45; // For keys like 'const', 'while'
  return KEY_W;
}

function getKeyGeometry(rowIndex, colIndex) {
  var layout = keyLayouts[currentLayout];
  if (!layout[rowIndex] || colIndex >= layout[rowIndex].length) return null;

  var keyX = KEY_X_START;
  for (var i = 0; i < colIndex; i++) {
    keyX += getKeyWidth(layout[rowIndex][i]) + KEY_X_GUTTER;
  }
  var keyW = getKeyWidth(layout[rowIndex][colIndex]);
  return { x: keyX, width: keyW };
}

function drawKeyboard() {
  var layout = keyLayouts[currentLayout];
  G.setFont("Monofonto16");

  for (var r = 0; r < layout.length; r++) {
    var keyX = KEY_X_START;
    for (var c = 0; c < layout[r].length; c++) {
      var key = layout[r][c];
      var keyW = getKeyWidth(key);
      var keyY = KEY_Y_START + r * (KEY_H + KEY_Y_GUTTER);

      if (r === cursor.y && c === cursor.x) {
        G.setColor(COLOR_GREEN).fillRect(keyX - 2, keyY - 2, keyX + keyW + 2, keyY + KEY_H + 2);
        G.setColor(COLOR_BLACK);
      } else {
        G.setColor(COLOR_GREEN);
      }
      
      G.drawRect(keyX, keyY, keyX + keyW, keyY + KEY_H);
      var keyText = key;
      if (G.stringWidth(keyText) > keyW - 4) {
         keyText = key.substring(0, 5) + ".."; // Truncate long keys
      }
      G.drawString(keyText, keyX + (keyW - G.stringWidth(keyText)) / 2, keyY + (KEY_H - 16) / 2);

      keyX += keyW + KEY_X_GUTTER;
    }
  }
}

// --- Terminal Drawing ---
function drawTerminal() {
  G.setColor(COLOR_GREEN);
  G.drawRect(2, 0, W - 3, TERMINAL_HEIGHT);
  G.setFont("Monofonto16");

  var startY = TERMINAL_HEIGHT - TERMINAL_LINE_HEIGHT;
  var linesToDraw = terminalLines.slice().reverse();

  for (var i = 0; i < linesToDraw.length; i++) {
    var y = startY - i * TERMINAL_LINE_HEIGHT;
    if (y < 0) break;
    G.drawString(linesToDraw[i], 5, y);
  }
}

// --- Main Draw Loop ---
function draw() {
  if (!needsRedraw) return;
  G.clear(COLOR_BLACK);
  drawTerminal();
  drawKeyboard();
  G.flip();
  needsRedraw = false;
}

// --- Action Handlers ---
function validateCursor() {
  var newLayout = keyLayouts[currentLayout];
  if (cursor.y >= newLayout.length) {
    cursor.y = newLayout.length - 1;
  }
  if (cursor.x >= newLayout[cursor.y].length) {
    cursor.x = newLayout[cursor.y].length - 1;
  }
}

function handleShift() {
  currentLayout = (currentLayout === 'lower') ? 'upper' : 'lower';
  validateCursor();
  needsRedraw = true;
}

function handleEnter() {
  var lastLine = terminalLines[terminalLines.length - 1];
  LoopbackB.write(lastLine.substring(1) + "\n");
  terminalLines.push(">");
  if (terminalLines.length > MAX_TERMINAL_LINES) terminalLines.shift();
  needsRedraw = true;
}

function handleBackspace() {
  var lastLine = terminalLines[terminalLines.length - 1];
  if (lastLine.length > 1) {
    terminalLines[terminalLines.length - 1] = lastLine.slice(0, -1);
  }
  needsRedraw = true;
}

// --- Input Handling ---
function onKnob1(dir) { // Up/Down with "closest key" logic
  var layout = keyLayouts[currentLayout];
  
  var currentKeyGeo = getKeyGeometry(cursor.y, cursor.x);
  if (!currentKeyGeo) return; 
  var currentKeyCenterX = currentKeyGeo.x + currentKeyGeo.width / 2;

  var targetRowIndex = (cursor.y - dir + layout.length) % layout.length;
  var targetRow = layout[targetRowIndex];

  var closestKeyIndex = -1;
  var minDistance = Infinity;

  for (var i = 0; i < targetRow.length; i++) {
    var targetKeyGeo = getKeyGeometry(targetRowIndex, i);
    var targetKeyCenterX = targetKeyGeo.x + targetKeyGeo.width / 2;
    var distance = Math.abs(targetKeyCenterX - currentKeyCenterX);

    if (distance < minDistance) {
      minDistance = distance;
      closestKeyIndex = i;
    }
  }
  
  if(closestKeyIndex !== -1) {
    cursor.y = targetRowIndex;
    cursor.x = closestKeyIndex;
  }
  needsRedraw = true;
}

function onKnob2(dir) { // Left/Right (Inverted)
  var row = keyLayouts[currentLayout][cursor.y];
  cursor.x = (cursor.x + dir + row.length) % row.length;
  needsRedraw = true;
}

function handleSelect() {
  var key = keyLayouts[currentLayout][cursor.y][cursor.x];

  switch (key) {
    case 'SHIFT':
      handleShift();
      break;
    case 'SYM':
      currentLayout = (currentLayout === 'symbol') ? 'lower' : 'symbol';
      validateCursor();
      break;
    case 'ENTER':
      handleEnter();
      break;
    case 'BKSP':
      handleBackspace();
      break;
    case 'SPACE':
      terminalLines[terminalLines.length - 1] += ' ';
      break;
    default:
      if (key) {
        terminalLines[terminalLines.length - 1] += key;
      }
      break;
  }
  needsRedraw = true;
}

var lastBtnState = {
    KNOB1_BTN: false,
    BTN_TORCH: false,
    BTN_TUNEUP: false,
    BTN_TUNEDOWN: false
};

function mainLoop() {
  // Knob 1 press for virtual key selection
  var knob1Pressed = KNOB1_BTN.read();
  if (knob1Pressed && !lastBtnState.KNOB1_BTN) {
    handleSelect();
  }
  lastBtnState.KNOB1_BTN = knob1Pressed;

  // --- Handle hardware buttons ---
  var torchPressed = BTN_TORCH.read();
  if (torchPressed && !lastBtnState.BTN_TORCH) {
      handleEnter();
  }
  lastBtnState.BTN_TORCH = torchPressed;

  var tuneUpPressed = BTN_TUNEUP.read();
  if (tuneUpPressed && !lastBtnState.BTN_TUNEUP) {
      handleShift(); // Was Backspace
  }
  lastBtnState.BTN_TUNEUP = tuneUpPressed;

  var tuneDownPressed = BTN_TUNEDOWN.read();
  if (tuneDownPressed && !lastBtnState.BTN_TUNEDOWN) {
      handleBackspace(); // Was Shift
  }
  lastBtnState.BTN_TUNEDOWN = tuneDownPressed;
  
  draw();
}

// --- Terminal Integration ---
function onTerminalData(data) {
  var lastLine = terminalLines[terminalLines.length - 1];
  var lines = (lastLine + data).split('\n');
  
  var newCurrentLine = lines.pop();
  terminalLines[terminalLines.length - 1] = lines.shift() || "";
  terminalLines = terminalLines.concat(lines);
  terminalLines.push(newCurrentLine);

  while (terminalLines.length > MAX_TERMINAL_LINES) {
    terminalLines.shift();
  }
  needsRedraw = true;
}

// --- App Lifecycle ---
function startApp() {
  Pip.on("knob1", onKnob1);
  Pip.on("knob2", onKnob2);
  
  LoopbackA.on('data', onTerminalData);
  E.setConsole(LoopbackA, { force: true });

  mainInterval = setInterval(mainLoop, 100);
  needsRedraw = true;
}

var mainInterval;
function forceExit() {
  if (mainInterval) clearInterval(mainInterval);
  
  Pip.removeListener("knob1", onKnob1);
  Pip.removeListener("knob2", onKnob2);
  
  E.setConsole(null, { force: true });
  LoopbackA.removeListener('data', onTerminalData);

  g.clear();
  G.clear();
  G.flip();
  load();
}

Pip.remove = forceExit;
setWatch(forceExit, BTN_POWER, {edge:"rising", debounce:50, repeat:true});

// --- Initial Load ---
startApp();