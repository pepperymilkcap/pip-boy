// Broken combination of Pip-Terminal and the Pip-Keyboard app.

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
var COLOR_GREEN = 3;
var COLOR_BLACK = 0;
var W = G.getWidth();
var H = G.getHeight();

// --- View Modes ---
var VIEW_MODE_KEYBOARD = 0;
var VIEW_MODE_HISTORY = 1;
var VIEW_MODE_LIST = 2;
var VIEW_MODE_PC_KEYBOARD = 3;
var currentViewMode = VIEW_MODE_KEYBOARD;

// --- Terminal State ---
var terminalLines = [">"];
var MAX_TERMINAL_LINES = 7;
var TERMINAL_HEIGHT = 120;
var TERMINAL_LINE_HEIGHT = 16;
var commandHistory = [];
var historyListSelectedIndex = 0;

// --- Command List State ---
var commandList = [
  "factoryTestMode()", "enterDemoMode()", "playBootAnimation()",
  "showMainMenu()", "showTorch()", "Pip.offOrSleep()", "showVaultAssignment()"
];
var commandListSelectedIndex = 0;

// --- Loopback Serial Setup ---
// Initialize or reset loopback serial if not available
if (typeof LoopbackA === "undefined" || LoopbackA === null) {
  // Create a simple loopback for testing
  var LoopbackA = { 
    handlers: {},
    on: function(event, cb) { this.handlers[event] = cb; },
    removeListener: function(event) { delete this.handlers[event]; },
    write: function(data) { 
      if (this.handlers.data) {
        var self = this;
        setTimeout(function() {
          self.handlers.data(data);
        }, 1);
      }
    }
  };
}

if (typeof LoopbackB === "undefined" || LoopbackB === null) {
  var LoopbackB = {
    write: function(data) {
      if (LoopbackA && LoopbackA.handlers && LoopbackA.handlers.data) {
        var d = data;
        setTimeout(function() {
          LoopbackA.handlers.data(d);
        }, 1);
      }
    }
  };
}

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
  try {
    E.setUSBHID(null);
  } catch(e) {
    console.log("Error releasing HID:", e);
  }
  isHIDActive = false;
}

function sendKey(keycode, modifiers) {
  if (!isHIDActive) return;
  try {
    E.sendUSBHID([modifiers, 0, keycode, 0, 0, 0, 0, 0]);
    E.sendUSBHID([0, 0, 0, 0, 0, 0, 0, 0]);
  } catch(e) {
    console.log("Error sending key:", e);
  }
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
    ['var', 'let', 'const', '=', '=>', '+', '-', '*', '/', '%', '==', '!='],
    ['if', 'else', '(', ')', '{', '}', '[', ']', 'true', 'false', '!', '&&'],
    ['SHIFT', 'while', 'for', '()', '{}', '[]', 'null', 'undefined', '||'],
    [],
    ['SYM', 'SPACE', 'ENTER', '']
  ],
  pc_symbol: [
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
var KEY_Y_START = 135;
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

function drawList(list, selectedIndex, title) {
    var LIST_Y_START = 135;
    var LIST_X = KEY_X_START;
    var LIST_W = W - LIST_X * 2;
    var LIST_ITEM_H = 22;
    var MAX_VISIBLE_ITEMS = Math.floor((H - LIST_Y_START) / LIST_ITEM_H);
    var scrollOffset = 0;
    var i, index, itemY, command;
    G.setFont("Monofonto16");
    G.setColor(COLOR_GREEN);
    G.drawRect(LIST_X, LIST_Y_START, LIST_X + LIST_W, H - 4);
    G.drawString(title, LIST_X + (LIST_W - G.stringWidth(title)) / 2, LIST_Y_START + 2);
    G.drawLine(LIST_X + 1, LIST_Y_START + 20, LIST_X + LIST_W - 1, LIST_Y_START + 20);
    if (!list.length) {
        G.drawString("No items.", LIST_X + 5, LIST_Y_START + 25);
        return;
    }
    if (selectedIndex >= MAX_VISIBLE_ITEMS -1) {
        scrollOffset = selectedIndex - (MAX_VISIBLE_ITEMS - 2);
    }
    for (i = 0; i < MAX_VISIBLE_ITEMS - 1; i++) {
        index = i + scrollOffset;
        if (index >= list.length) break;
        itemY = LIST_Y_START + 25 + i * LIST_ITEM_H;
        command = list[index];
        if (index === selectedIndex) {
            G.setColor(COLOR_GREEN).fillRect(LIST_X + 2, itemY - 2, LIST_X + LIST_W - 2, itemY + LIST_ITEM_H - 4);
            G.setColor(COLOR_BLACK);
        } else {
            G.setColor(COLOR_GREEN);
        }
        G.drawString(command, LIST_X + 5, itemY);
    }
}

function drawTerminal() {
  var i, y;
  var startY = TERMINAL_HEIGHT - TERMINAL_LINE_HEIGHT;
  var linesToDraw = terminalLines.slice().reverse();
  G.setColor(COLOR_GREEN);
  G.drawRect(2, 0, W - 3, TERMINAL_HEIGHT);
  G.setFont("Monofonto16");
  for (i = 0; i < linesToDraw.length; i++) {
    y = startY - i * TERMINAL_LINE_HEIGHT;
    if (y < 0) break;
    G.drawString(linesToDraw[i], 5, y);
  }
}

function draw() {
  if (!needsRedraw) return;
  var text;
  G.clear(COLOR_BLACK);
  switch(currentViewMode) {
    case VIEW_MODE_PC_KEYBOARD:
      G.setColor(COLOR_GREEN);
      G.setFont("Monofonto28");
      text = "Keyboard Mode";
      G.drawString(text, (W - G.stringWidth(text)) / 2, 50);
      drawKeyboard();
      break;
    case VIEW_MODE_KEYBOARD:
      drawTerminal();
      drawKeyboard();
      break;
    case VIEW_MODE_HISTORY:
      drawTerminal();
      drawList(commandHistory, historyListSelectedIndex, "History");
      break;
    case VIEW_MODE_LIST:
      drawTerminal();
      drawList(commandList, commandListSelectedIndex, "Pip-Boy Functions");
      break;
  }
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
  if (currentViewMode === VIEW_MODE_PC_KEYBOARD) {
    // In PC mode, SHIFT is a modifier key
    sendKey(0, MODIFIERS.LSHIFT);
  } else {
    // In regular mode, SHIFT toggles the keyboard layout
    currentLayout = (currentLayout === 'lower') ? 'upper' : 'lower';
  }
  validateCursor();
  needsRedraw = true;
}

function handleEnter(command) {
  if (currentViewMode === VIEW_MODE_PC_KEYBOARD) {
    sendKey(KEYCODES.ENTER, 0);
    return;
  }
  command = command || terminalLines[terminalLines.length - 1].substring(1);
  if (command && command.trim().length > 0 && commandHistory.indexOf(command) === -1) {
    commandHistory.unshift(command);
  }
  LoopbackB.write(command + "\n");
  terminalLines[terminalLines.length - 1] = ">" + command;
  terminalLines.push(">");
  if (terminalLines.length > MAX_TERMINAL_LINES) terminalLines.shift();
  needsRedraw = true;
}

function handleBackspace() {
  if (currentViewMode === VIEW_MODE_PC_KEYBOARD) {
    sendKey(KEYCODES.BKSP, 0);
    return;
  }
  var lastLine = terminalLines[terminalLines.length - 1];
  if (lastLine.length > 1) {
    terminalLines[terminalLines.length - 1] = lastLine.slice(0, -1);
  }
  needsRedraw = true;
}

// --- Input Handling ---
function onKnob1(dir) { // Up/Down
  // FIXED: Initialize attempts variable at the function level
  var attempts = 0;
  
  switch (currentViewMode) {
    case VIEW_MODE_HISTORY:
      if (!commandHistory.length) return;
      historyListSelectedIndex = (historyListSelectedIndex - dir + commandHistory.length) % commandHistory.length;
      break;
      
    case VIEW_MODE_LIST:
      commandListSelectedIndex = (commandListSelectedIndex - dir + commandList.length) % commandList.length;
      break;
      
    case VIEW_MODE_KEYBOARD:
    case VIEW_MODE_PC_KEYBOARD:
      var layout = keyLayouts[currentLayout];
      var currentKeyGeo = getKeyGeometry(cursor.y, cursor.x);
      if (!currentKeyGeo) return;
      var currentKeyStart = currentKeyGeo.x;
      var currentKeyEnd = currentKeyGeo.x + currentKeyGeo.width;

      // Find next valid row
      var targetRowIndex = cursor.y;
      // Using attempts variable defined at function level
      do {
        targetRowIndex = (targetRowIndex - dir + layout.length) % layout.length;
        attempts++;
      } while (attempts < layout.length && (!layout[targetRowIndex] || layout[targetRowIndex].join('') === ''));

      // Find best matching key in target row
      var targetRow = layout[targetRowIndex];
      var closestKeyIndex = -1;
      var minDistance = Infinity;
      for (var i = 0; i < targetRow.length; i++) {
        if (!targetRow[i]) continue;
        var targetKeyGeo = getKeyGeometry(targetRowIndex, i);
        var targetKeyStart = targetKeyGeo.x;
        var targetKeyEnd = targetKeyGeo.x + targetKeyGeo.width;

        // --- NAVIGATION FIX ---
        // Check for overlap first
        var overlap = Math.max(0, Math.min(currentKeyEnd, targetKeyEnd) - Math.max(currentKeyStart, targetKeyStart));
        if (overlap > 0) {
          closestKeyIndex = i;
          break; // Found an overlapping key, select it immediately
        }
        
        // If no overlap, fall back to closest center
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
      break;
  }
  needsRedraw = true;
}

function onKnob2(dir) { // Left/Right
  if (currentViewMode !== VIEW_MODE_KEYBOARD && currentViewMode !== VIEW_MODE_PC_KEYBOARD) return;
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
  var command, key, keycode, modifier, specialChars;
  switch (currentViewMode) {
    case VIEW_MODE_HISTORY:
      if (!commandHistory.length) return;
      command = commandHistory[historyListSelectedIndex];
      handleEnter(command);
      currentViewMode = VIEW_MODE_KEYBOARD;
      break;
    case VIEW_MODE_LIST:
      command = commandList[commandListSelectedIndex];
      handleEnter(command);
      currentViewMode = VIEW_MODE_KEYBOARD;
      break;
    case VIEW_MODE_PC_KEYBOARD:
    case VIEW_MODE_KEYBOARD:
      key = keyLayouts[currentLayout][cursor.y][cursor.x];
      if (currentViewMode === VIEW_MODE_PC_KEYBOARD) {
        if (key === 'SYM') {
          currentLayout = (currentLayout === 'pc_symbol') ? 'lower' : 'pc_symbol';
        } else if (key === 'SHIFT') {
           // In PC mode, SHIFT is a modifier, not a layout toggle
           sendKey(0, MODIFIERS.LSHIFT);
        } else {
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
        }
      } else { // VIEW_MODE_KEYBOARD
        switch (key) {
          case 'SHIFT': handleShift(); break;
          case 'SYM':
            currentLayout = (currentLayout === 'symbol') ? 'lower' : 'symbol';
            break;
          case 'ENTER': handleEnter(); break;
          case 'BKSP': handleBackspace(); break;
          case 'SPACE': terminalLines[terminalLines.length - 1] += ' '; break;
          case 'UP': LoopbackB.write("\x1b[A"); break;
          case 'DOWN': LoopbackB.write("\x1b[B"); break;
          case 'RIGHT': LoopbackB.write("\x1b[C"); break;
          case 'LEFT': LoopbackB.write("\x1b[D"); break;
          default:
            if (key) { terminalLines[terminalLines.length - 1] += key; }
            break;
        }
      }
      validateCursor();
      break;
  }
  needsRedraw = true;
}

var lastBtnState = {
    KNOB1_BTN: false, BTN_PLAY: false, BTN_TORCH: false,
    BTN_TUNEUP: false, BTN_TUNEDOWN: false
};

function mainLoop() {
  var knob1Pressed = KNOB1_BTN.read();
  if (knob1Pressed && !lastBtnState.KNOB1_BTN) {
    handleSelect();
  }
  lastBtnState.KNOB1_BTN = knob1Pressed;

  var playPressed = BTN_PLAY.read();
  if (playPressed && !lastBtnState.BTN_PLAY) {
    // Save the current mode before changing
    var previousMode = currentViewMode;
    currentViewMode = (currentViewMode + 1) % 4;
    
    try {
      // Handle entering PC keyboard mode
      if (currentViewMode === VIEW_MODE_PC_KEYBOARD) {
        if (isHIDActive) releaseHID();
        // Safely set console to null with error handling
        try {
          E.setConsole(null, { force: true });
        } catch(e) {
          console.log("Error setting console to null:", e);
        }
        setupHID();
        currentLayout = 'lower';
      } 
      // Handle exiting PC keyboard mode or changing to any other mode
      else {
        if (isHIDActive) {
          releaseHID();
          // Only try to set console if we're transitioning out of PC keyboard mode
          if (previousMode === VIEW_MODE_PC_KEYBOARD) {
            try {
              E.setConsole(LoopbackA, { force: true });
            } catch(e) {
              console.log("Error setting console to LoopbackA:", e);
              // If setting console fails, create a fallback plan
              terminalLines.push(">ERROR: Console reset failed");
            }
          }
        }
        
        if (currentLayout === 'pc_symbol' || currentLayout === 'symbol') {
          currentLayout = 'lower';
        }
      }
    } catch(e) {
      // If any error occurs during mode transition, fallback to KEYBOARD mode
      console.log("Error during mode transition:", e);
      currentViewMode = VIEW_MODE_KEYBOARD;
      currentLayout = 'lower';
      releaseHID();
      try {
        E.setConsole(LoopbackA, { force: true });
      } catch(e2) {
        // Last resort error handling
        console.log("Critical error in console setup:", e2);
      }
    }
    
    validateCursor();
    needsRedraw = true;
  }
  lastBtnState.BTN_PLAY = playPressed;

  // Handle physical buttons in all modes
  var torchPressed = BTN_TORCH.read();
  if (torchPressed && !lastBtnState.BTN_TORCH) { 
    handleEnter(); 
  }
  lastBtnState.BTN_TORCH = torchPressed;
  
  var tuneUpPressed = BTN_TUNEUP.read();
  if (tuneUpPressed && !lastBtnState.BTN_TUNEUP) { 
    handleShift(); 
  }
  lastBtnState.BTN_TUNEUP = tuneUpPressed;
  
  var tuneDownPressed = BTN_TUNEDOWN.read();
  if (tuneDownPressed && !lastBtnState.BTN_TUNEDOWN) { 
    handleBackspace(); 
  }
  lastBtnState.BTN_TUNEDOWN = tuneDownPressed;
  
  draw();
}

// --- Terminal Integration ---
function onTerminalData(data) {
  if (isHIDActive) return;
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
var mainInterval;
function startApp() {
  Pip.on("knob1", onKnob1);
  Pip.on("knob2", onKnob2);
  try {
    LoopbackA.on('data', onTerminalData);
    E.setConsole(LoopbackA, { force: true });
  } catch(e) {
    console.log("Error setting up console:", e);
    terminalLines.push(">ERROR: Console setup failed");
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
  try {
    E.setConsole(null, { force: true });
    LoopbackA.removeListener('data', onTerminalData);
  } catch(e) {
    console.log("Error during cleanup:", e);
  }
  g.clear();
  G.clear();
  G.flip();
  load();
}

Pip.remove = forceExit;
setWatch(forceExit, BTN_POWER, {edge:"rising", debounce:50, repeat:true});

// --- Initial Load ---
startApp();