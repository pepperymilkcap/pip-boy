// remote_keyboard.js - A Standalone Remote Keyboard App for the Pip-Boy (ES5)

// --- Application Cleanup ---
// Remove any previous instance of the app to prevent memory leaks
if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

// Clear the screen
g.clear();

// --- Graphics Setup ---
// Create a double-buffered display with 2-bit color depth
var G = Graphics.createArrayBuffer(400, 308, 2, {
  msb: true,
  buffer: E.toArrayBuffer(E.memoryArea(0x10000000 + 16384, (400 * 308) >> 2))
});
G.flip = function() { return Pip.blitImage(G, 40, 7); };

// --- UI Constants ---
var COLOR_GREEN = 3;
var COLOR_BLACK = 0;
var W = G.getWidth();
var H = G.getHeight();

// --- USB HID Keyboard ---
var isHIDActive = false;
var KEYCODES = {
  'A':4, 'B':5, 'C':6, 'D':7, 'E':8, 'F':9, 'G':10, 'H':11, 'I':12, 'J':13, 'K':14, 'L':15, 'M':16, 'N':17, 'O':18, 'P':19, 'Q':20, 'R':21, 'S':22, 'T':23, 'U':24, 'V':25, 'W':26, 'X':27, 'Y':28, 'Z':29,
  '1':30, '2':31, '3':32, '4':33, '5':34, '6':35, '7':36, '8':37, '9':38, '0':39,
  'ENTER':40, 'ESC':41, 'BKSP':42, 'TAB':43, 'SPACE':44,
  '-':45, '=':46, '[':47, ']':48, '\\':49,
  ';':51, "'":52, '`':53, ',':54, '.':55, '/':56, 'CAPS':57,
  'F1':58, 'F2':59, 'F3':60, 'F4':61, 'F5':62, 'F6':63, 'F7':64, 'F8':65, 'F9':66, 'F10':67, 'F11':68, 'F12':69,
  'PSCR':70, 'SLCK':71, 'PAUSE':72, 'INS':73, 'HOME':74, 'PGUP':75, 'DEL':76, 'END':77, 'PGDN':78,
  'RIGHT':79, 'LEFT':80, 'DOWN':81, 'UP':82, 'NUMLK':83
};
var MODIFIERS = {
  'LCTRL': 1, 'LSHIFT': 2, 'LALT': 4, 'LWIN': 8,
  'RCTRL': 16, 'RSHIFT': 32, 'RALT': 64, 'RWIN': 128
};

function setupHID() {
  if (isHIDActive) return;
  try {
    E.setUSBHID({
      reportDescriptor: [
        5, 1, 9, 6, 161, 1, 117, 1, 149, 8, 5, 7, 25, 224, 41, 231, 21, 0, 37, 1, 129, 2, 149, 1, 117, 8, 129, 3, 149, 5, 117, 1, 5, 8, 25, 1, 41, 5, 145, 2, 149, 1, 117, 3, 145, 3, 149, 6, 117, 8, 21, 0, 37, 104, 5, 7, 25, 0, 41, 104, 129, 0, 192
      ]
    });
    isHIDActive = true;
  } catch (e) {
    console.log("Error setting up HID:", e);
    isHIDActive = false;
  }
}

function releaseHID() {
  if (!isHIDActive) return;
  try { E.setUSBHID(null); } catch (e) { console.log("Error releasing HID:", e); }
  isHIDActive = false;
}

function sendKey(keycode, modifiers) {
  if (!isHIDActive) return;
  try {
    E.sendUSBHID([modifiers, 0, keycode, 0, 0, 0, 0, 0]);
    E.sendUSBHID([0, 0, 0, 0, 0, 0, 0, 0]);
  } catch (e) { console.log("Error sending key:", e); }
}

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
    ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10','F11','F12'],
    ['TAB', 'HOME', 'PGUP', 'INS', 'SLCK', '', '', '', '', '', '', '', ''],
    ['CAPS', 'END', 'PGDN', 'DEL', 'PSCR', '', '', '', '', '', '', ''],
    ['LSHIFT','LCTRL','LALT','LWIN', 'PAUSE', '', '', '', '', '', '', 'ESC'],
    ['SYM', 'SPACE', 'ENTER', '']
  ]
};
var currentLayout = 'lower';
var cursor = { x: 0, y: 0 };
var needsRedraw = true;

// --- Drawing Functions ---
var KEY_H = 32;
var KEY_W = 28;
var KEY_Y_START = 85; // Move keyboard up to fill screen
var KEY_X_GUTTER = 2;
var KEY_Y_GUTTER = 4;
var KEY_X_START = 4;

function getKeyWidth(key) {
  if (key === 'SPACE') return 180;
  if (key === 'ENTER') return 80;
  if (key === 'SHIFT' || key === 'SYM' || key === 'LSHIFT') return 60;
  if (key === 'BKSP') return 62;
  if (key.length > 2) return 45;
  if (['UP', 'DOWN', 'LEFT', 'RIGHT'].indexOf(key) !== -1) return 45;
  return KEY_W;
}

function getKeyGeometry(rowIndex, colIndex) {
  var layout = keyLayouts[currentLayout];
  if (!layout || !layout[rowIndex] || colIndex >= layout[rowIndex].length) return null;
  var keyX = KEY_X_START;
  for (var i = 0; i < colIndex; i++) {
    keyX += getKeyWidth(layout[rowIndex][i] || '') + KEY_X_GUTTER;
  }
  var keyW = getKeyWidth(layout[rowIndex][colIndex] || '');
  return { x: keyX, width: keyW };
}

function drawKeyboard() {
  var r, c, key, keyW, keyY, keyX, keyText;
  var layout = keyLayouts[currentLayout];
  G.setFont("Monofonto16");
  for (r = 0; r < layout.length; r++) {
    keyX = KEY_X_START;
    if (!layout[r] || layout[r].length === 0) continue;
    for (c = 0; c < layout[r].length; c++) {
      key = layout[r][c];
      keyW = getKeyWidth(key || '');
      if (!key) {
        keyX += keyW + KEY_X_GUTTER;
        continue;
      }
      keyY = KEY_Y_START + r * (KEY_H + KEY_Y_GUTTER);
      if (r === cursor.y && c === cursor.x) {
        G.setColor(COLOR_GREEN).fillRect(keyX - 2, keyY - 2, keyX + keyW + 2, keyY + KEY_H + 2);
        G.setColor(COLOR_BLACK);
      } else {
        G.setColor(COLOR_GREEN);
      }
      G.drawRect(keyX, keyY, keyX + keyW, keyY + KEY_H);
      keyText = key;
      if (G.stringWidth(keyText) > keyW - 4) {
         keyText = key.substring(0, 5) + "..";
      }
      G.drawString(keyText, keyX + (keyW - G.stringWidth(keyText)) / 2, keyY + (KEY_H - 16) / 2);
      keyX += keyW + KEY_X_GUTTER;
    }
  }
}

function draw() {
  if (!needsRedraw) return;
  G.clear(COLOR_BLACK);
  
  // Draw App Title
  G.setColor(COLOR_GREEN);
  G.setFont("Monofonto28");
  var text = "Remote Keyboard";
  G.drawString(text, (W - G.stringWidth(text)) / 2, 30);
  
  // Draw the keyboard
  drawKeyboard();
  
  G.flip();
  needsRedraw = false;
}

// --- Action Handlers ---
function validateCursor() {
    var layout = keyLayouts[currentLayout];
    if (!layout) { cursor.x = 0; cursor.y = 0; return; }
    if (cursor.y >= layout.length) cursor.y = layout.length - 1;
    if (cursor.y < 0) cursor.y = 0;
    var row = layout[cursor.y];
    while (!row || row.length === 0) {
        cursor.y--;
        if (cursor.y < 0) cursor.y = 0;
        row = layout[cursor.y];
    }
    if (cursor.x >= row.length) cursor.x = row.length - 1;
    if (cursor.x < 0) cursor.x = 0;
    var key = row[cursor.x];
    while (!key) {
        cursor.x--;
        if (cursor.x < 0) cursor.x = 0;
        key = row[cursor.x];
    }
}

function handleShift() {
  currentLayout = (currentLayout === 'lower') ? 'upper' : 'lower';
  validateCursor();
  needsRedraw = true;
}

// --- Input Handling ---
function onKnob1(dir) { // Up/Down
  var layout = keyLayouts[currentLayout];
  var currentKeyGeo = getKeyGeometry(cursor.y, cursor.x);
  if (!currentKeyGeo) return;
  var currentKeyStart = currentKeyGeo.x;
  var currentKeyEnd = currentKeyGeo.x + currentKeyGeo.width;

  var targetRowIndex = cursor.y;
  var attempts = 0;
  do {
    targetRowIndex = (targetRowIndex - dir + layout.length) % layout.length;
    attempts++;
  } while (attempts < layout.length && (!layout[targetRowIndex] || layout[targetRowIndex].join('') === ''));

  var targetRow = layout[targetRowIndex];
  var closestKeyIndex = -1;
  var minDistance = Infinity;
  for (var i = 0; i < targetRow.length; i++) {
    if (!targetRow[i]) continue;
    var targetKeyGeo = getKeyGeometry(targetRowIndex, i);
    var targetKeyStart = targetKeyGeo.x;
    var targetKeyEnd = targetKeyGeo.x + targetKeyGeo.width;

    var overlap = Math.max(0, Math.min(currentKeyEnd, targetKeyEnd) - Math.max(currentKeyStart, targetKeyStart));
    if (overlap > 0) {
      closestKeyIndex = i;
      break;
    }
    
    var currentKeyCenterX = currentKeyStart + (currentKeyEnd - currentKeyStart) / 2;
    var targetKeyCenterX = targetKeyStart + (targetKeyEnd - targetKeyStart) / 2;
    var distance = Math.abs(targetKeyCenterX - currentKeyCenterX);
    if (distance < minDistance) {
      minDistance = distance;
      closestKeyIndex = i;
    }
  }
  if (closestKeyIndex !== -1) {
    cursor.y = targetRowIndex;
    cursor.x = closestKeyIndex;
  }
  needsRedraw = true;
}

function onKnob2(dir) { // Left/Right
  var row = keyLayouts[currentLayout][cursor.y];
  if (!row) return;
  var nextX = cursor.x;
  var attempts = 0;
  do {
    nextX = (nextX + dir + row.length) % row.length;
    attempts++;
  } while (attempts < row.length && !row[nextX]);
  cursor.x = nextX;
  needsRedraw = true;
}

function handleSelect() {
  var key = keyLayouts[currentLayout][cursor.y][cursor.x];
  var keycode, modifier, specialChars;

  switch (key) {
    case 'SHIFT':
      handleShift();
      break;
    case 'SYM':
      currentLayout = (currentLayout === 'symbol') ? 'lower' : 'symbol';
      break;
    case 'ENTER':
      sendKey(KEYCODES.ENTER, 0);
      break;
    case 'BKSP':
      sendKey(KEYCODES.BKSP, 0);
      break;
    case 'SPACE':
      sendKey(KEYCODES.SPACE, 0);
      break;
    default:
      if (!key) break;
      keycode = KEYCODES[key.toUpperCase()];
      modifier = (currentLayout === 'upper') ? MODIFIERS.LSHIFT : 0;
      if (MODIFIERS[key]) {
         sendKey(0, MODIFIERS[key]);
      } else if (keycode) {
        sendKey(keycode, modifier);
      } else {
        specialChars = {'~':'`','!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9',')':'0','_':'-','+':'=','{':'[','}':']','|':'\\',':':';','"':"'",'<':',','>':'.','?':'/'};
        if (specialChars[key]) {
          sendKey(KEYCODES[specialChars[key].toUpperCase()], MODIFIERS.LSHIFT);
        }
      }
      break;
  }
  validateCursor();
  needsRedraw = true;
}

var lastBtnState = {
    KNOB1_BTN: false, BTN_TORCH: false,
    BTN_TUNEUP: false, BTN_TUNEDOWN: false, BTN_PLAY: false
};

function mainLoop() {
  var knob1Pressed = KNOB1_BTN.read();
  if (knob1Pressed && !lastBtnState.KNOB1_BTN) {
    handleSelect();
  }
  lastBtnState.KNOB1_BTN = knob1Pressed;

  // BTN_PLAY does nothing in this version
  lastBtnState.BTN_PLAY = BTN_PLAY.read();

  // Handle physical button shortcuts
  var torchPressed = BTN_TORCH.read();
  if (torchPressed && !lastBtnState.BTN_TORCH) { 
    sendKey(KEYCODES.ENTER, 0); 
  }
  lastBtnState.BTN_TORCH = torchPressed;
  
  var tuneUpPressed = BTN_TUNEUP.read();
  if (tuneUpPressed && !lastBtnState.BTN_TUNEUP) { 
    handleShift(); 
  }
  lastBtnState.BTN_TUNEUP = tuneUpPressed;
  
  var tuneDownPressed = BTN_TUNEDOWN.read();
  if (tuneDownPressed && !lastBtnState.BTN_TUNEDOWN) { 
    sendKey(KEYCODES.BKSP, 0); 
  }
  lastBtnState.BTN_TUNEDOWN = tuneDownPressed;
  
  if (needsRedraw) {
    draw();
  }
}

// --- App Lifecycle ---
var mainInterval;
function startApp() {
  Pip.on("knob1", onKnob1);
  Pip.on("knob2", onKnob2);
  
  // Setup HID and console
  try {
    E.setConsole(null, { force: true });
    setupHID();
  } catch(e) {
    console.log("Error setting up HID/Console:", e);
  }

  mainInterval = setInterval(mainLoop, 100);
  validateCursor();
  needsRedraw = true;
  draw();
}

function forceExit() {
  if (mainInterval) clearInterval(mainInterval);
  Pip.removeListener("knob1", onKnob1);
  Pip.removeListener("knob2", onKnob2);
  
  releaseHID();
  try { E.setConsole(LoopbackA, { force: true }); } catch (e) { /* Ignore if LoopbackA doesn't exist */ }

  g.clear();
  G.clear();
  G.flip();
  load();
}

Pip.remove = forceExit;
setWatch(forceExit, BTN_POWER, {edge:"rising", debounce:50, repeat:true});

// --- Initial Load ---
startApp();