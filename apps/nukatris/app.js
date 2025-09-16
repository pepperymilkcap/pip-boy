// nukatris.js - A Tetris-like game for the Pip-Boy

// --- Application Cleanup ---
// This section ensures that any previous instance of an app is properly cleaned up
// before this one starts. It's good practice to prevent memory leaks or unexpected behavior.
if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

// Clear the main display.
g.clear();

// --- Graphics Setup ---
// The Pip-Boy screen requires a special graphics buffer for drawing.
// This creates an off-screen buffer 'G' where we can draw all our game elements.
var G = Graphics.createArrayBuffer(400, 308, 2, {
  msb: true,
  buffer: E.toArrayBuffer(E.memoryArea(0x10000000 + 16384, (400 * 308) >> 2))
});
// The 'flip' function copies our off-screen buffer 'G' to the actual screen at position (40, 7).
// This is also known as "double buffering" and prevents flickering.
G.flip = function() { return Pip.blitImage(G, 40, 7); };

// --- UI Constants ---
// Define the colors we will use, based on the Pip-Boy's 2-bit (4 color) display.
const COLOR_GREEN = 3;        // Brightest green
const COLOR_BLACK = 0;        // Black/off

// --- Game Constants ---
// Get the dimensions of our graphics buffer.
const W = G.getWidth();       // 400 pixels
const H = G.getHeight();      // 308 pixels
const CX = W / 2;             // Center X coordinate
const CY = H / 2;             // Center Y coordinate

// Define the game board's properties.
const LINES = 20;             // Number of rows in the playfield.
const COLUMNS = 11;           // Number of columns in the playfield.
const CELL_SIZE = 12;         // The size of a single block cell in pixels.

// Calculate the dimensions of the game board.
const BOARD_W = COLUMNS * CELL_SIZE;
const BOARD_H = LINES * CELL_SIZE;

// --- UI Positioning ---
// These are now 'var' to allow them to be changed during gameplay.
var BOARD_X, BOARD_Y, TEXT_X; 
var uiCentered = true; // true = centered in G, false = centered on screen

// --- Block Definitions ---
// Each block is defined by a series of shapes for its different rotations.
// The numbers are bitmasks that represent the shape of the block.
const BLOCKS = [
  [[2, 7], [2, 6, 2], [0, 7, 2], [2, 3, 2]], // T-block
  [[1, 3, 2], [6, 3]],                       // Z-block
  [[2, 3, 1], [3, 6]],                       // S-block
  [[2, 2, 6], [0, 7, 1], [3, 2, 2], [4, 7]], // L-block
  [[2, 2, 3], [1, 7], [6, 2, 2], [0, 7, 4]], // J-block
  [[2, 2, 2, 2], [0, 15]],                   // I-block
  [[3, 3]]                                   // O-block
];

// Bitmasks for game logic.
const EMPTY_LINE = 0b00000000000000; // Represents an empty row on the board.
const BOUNDARY = 0b10000000000010;   // A mask to detect collision with board walls.
const FULL_LINE = 0b01111111111100;  // A mask to check if a line is full.

// --- Game State Variables ---
// These variables track the state of the game at any moment.
var gameOver = false;
var paused = false;
var currentBlock = 0; // Index for the currently falling block.
var nextBlock = 0;    // Index for the upcoming block.
var x, y;             // The (x, y) position of the current block on the board.
var points;
var level;
var lines;
var board;            // An array representing the game board state.
var rotation = 0;     // The current rotation index of the falling block.
var ticker = null;    // The main game loop interval timer.
var needDraw = true;  // A flag to indicate when the screen needs to be redrawn.

// --- UI & Game Logic Functions ---

// Recalculates UI element positions based on the current centering mode.
function updateUICentering() {
  if (uiCentered) {
    // "Tune Up": Center the board within the G buffer (game window). This is the original, unmodified logic.
    BOARD_X = Math.floor((W - BOARD_W) / 2);
    BOARD_Y = Math.floor((H - BOARD_H) / 2);
  } else {
    // "Tune Down": Center the UI horizontally on the physical screen using a hardcoded value.
    // The vertical position is kept the same as "Tune Up" to prevent vertical movement.
    BOARD_X = 87; 
    BOARD_Y = Math.floor((H - BOARD_H) / 2);
  }
  // Position text to the right of the board.
  TEXT_X = BOARD_X + BOARD_W + 30;
  needDraw = true;
}

// Gets the correct shape array for a given block type and rotation.
function getBlock(blockIndex, rotationIndex) {
  var block = BLOCKS[blockIndex % 7];
  // The modulo operations ensure the rotation index always wraps around safely.
  return block[((rotationIndex % block.length) + block.length) % block.length];
}

// Draws a single block shape at a given screen position.
function drawBlock(block, screenX, screenY, x, y) {
  // Loop through each row of the block's bitmask array.
  for (var row = 0; row < block.length; row++) {
    var mask = block[row];
    // Use bitwise operations to check each cell in the row.
    for (var col = 0; mask; mask >>= 1, col++) {
      if (mask % 2) { // If the bit is 1, draw a cell.
        var dx = screenX + (x + col) * CELL_SIZE;
        var dy = screenY + (y + row) * CELL_SIZE;
        // Draw a rectangle with a 2px gap to create the line effect.
        G.fillRect(dx, dy, dx + CELL_SIZE - 2, dy + CELL_SIZE - 2);
      }
    }
  }
}

// Draws the main game board, including landed pieces and the current piece.
function drawBoard() {
  G.setColor(COLOR_GREEN);
  // Draw the border around the play area.
  G.drawRect(BOARD_X - 2, BOARD_Y - 2, BOARD_X + BOARD_W + 1, BOARD_Y + BOARD_H + 1);
  // Draw all the blocks that have already landed.
  drawBlock(board, BOARD_X, BOARD_Y, -2, 0);
  // Draw the currently falling block.
  drawBlock(getBlock(currentBlock, rotation), BOARD_X, BOARD_Y, x - 2, y);
}

// Draws the "NEXT" block in the preview area.
function drawNextBlock() {
  G.setFontAlign(-1, -1, 0);
  G.setColor(COLOR_GREEN);
  G.drawString("NEXT", TEXT_X, BOARD_Y + 150);
  drawBlock(getBlock(nextBlock, 0), TEXT_X, BOARD_Y + 170, 0, 0);
}

// Helper to draw a line of text in the stats area.
function drawTextLine(text, line) {
  G.drawString(text, TEXT_X, BOARD_Y + line * 22);
}

// Draws all the game statistics (Title, Level, Lines, Points).
function drawGameState() {
  G.setFontAlign(-1, -1, 0);
  G.setColor(COLOR_GREEN);
  var ln = 0;
  drawTextLine("NUKATRIS", ln++);
  ln++; // Add a blank line for spacing.
  drawTextLine("LVL: " + level, ln++);
  drawTextLine("LNS: " + lines, ln++);
  drawTextLine("PTS: " + points, ln++);
}

// Draws a banner in the middle of the screen (e.g., for "PAUSED" or "GAME OVER").
function drawBanner(text) {
    var boxWidth = 200;
    var boxHeight = 40;
    var boxX = Math.floor((W - boxWidth) / 2);
    var boxY = Math.floor((H - boxHeight) / 2);
    G.setColor(COLOR_GREEN).fillRect(boxX - 3, boxY - 3, boxX + boxWidth + 3, boxY + boxHeight + 3);
    G.setColor(COLOR_BLACK).fillRect(boxX, boxY, boxX + boxWidth, boxY + boxHeight);
    G.setColor(COLOR_GREEN);
    G.setFontAlign(0, 0, 0); // Center the text inside the banner.
    G.drawString(text, CX, CY);
}

// The main drawing function. Called in a loop to render the game.
function draw() {
  // Only redraw if something has changed.
  if (!needDraw) return;
  
  G.clear(COLOR_BLACK); // Clear the buffer before drawing.
  G.setFont("Monofonto16");
  
  // Draw all game elements.
  drawBoard();
  drawNextBlock();
  drawGameState();
  
  if (paused) drawBanner("PAUSED");
  if (gameOver) drawBanner("GAME OVER");
  
  // Copy the buffer to the screen.
  G.flip();
  needDraw = false; // Reset the draw flag.
}

// Sets up the next block to fall.
function getNextBlock() {
  currentBlock = nextBlock;
  nextBlock = Math.floor(Math.random() * BLOCKS.length);
  x = 6; // Starting X position.
  y = 0; // Starting Y position (top of the board).
  rotation = 0;
}

// This function is called when a block lands.
function landBlock() {
  var block = getBlock(currentBlock, rotation);
  // "Stamp" the block onto the board by merging its bits with the board array.
  for (var row = 0; row < block.length; row++) {
    if (y + row >= 0 && y + row < board.length) {
       board[y + row] |= block[row] << x;
    }
  }

  // Check for and clear any completed lines.
  var clearedLines = 0;
  var keepLine = LINES;
  for (var line = LINES - 1; line >= 0; line--) {
    if (board[line] === FULL_LINE) {
      clearedLines++;
    } else {
      board[--keepLine] = board[line];
    }
  }

  // Update score and level.
  lines += clearedLines;
  if (lines > (level + 1) * 10) {
    level++;
    setSpeed(); // Increase game speed.
  }

  // Add new empty lines at the top.
  while (--keepLine >= 0) {
    board[keepLine] = EMPTY_LINE;
  }
  if (clearedLines) {
    points += 100 * (1 << (clearedLines - 1)); // Award points.
  }
  
  // Get the next piece. If it collides immediately, the game is over.
  getNextBlock();
  if (!checkMove(0, 0, 0)) {
    gameOver = true;
  }
  needDraw = true;
}

// Checks if a move (left, right, down, or rotate) is valid.
function checkMove(dx, dy, rot) {
  if (gameOver || paused) return false;
  
  var newRot = rotation + rot;
  var block = getBlock(currentBlock, newRot);
  
  // Check for collisions with other blocks or the board boundaries.
  for (var row = 0; row < block.length; row++) {
    var boardY = y + dy + row;
    if (boardY >= board.length) { // Collision with the floor.
        if (dy) landBlock();
        return false;
    }
    var movedBlockRow = block[row] << (x + dx);
    if ((movedBlockRow & board[boardY]) || (movedBlockRow & BOUNDARY)) {
      if (dy) landBlock(); // If moving down resulted in a collision, land the block.
      return false;
    }
  }
  
  // If no collision, update the block's position and rotation.
  rotation = newRot;
  x += dx;
  y += dy;
  needDraw = true;
  return true;
}

// The main game tick, which automatically moves the block down.
function gameTick() {
  if (!gameOver && !paused) {
    checkMove(0, 1, 0); // Move one step down.
  }
  needDraw = true;
}

// Adjusts the game speed based on the current level.
function setSpeed() {
  if (ticker) clearInterval(ticker);
  var interval = Math.max(200, 1000 - level * 100);
  ticker = setInterval(gameTick, interval);
}

// Instantly drops the piece to the bottom.
function dropPiece() {
    if (paused || gameOver) return;
    // Keep moving the piece down one step at a time until it can't.
    while(checkMove(0, 1, 0)) { /* empty loop */ }
}

// Toggles the pause state.
function togglePause() {
  if (!gameOver) {
    paused = !paused;
    needDraw = true;
  }
}

// Initializes or resets the game to its starting state.
function startGame() {
  board = [];
  for (var i = 0; i < LINES; i++) {
    board[i] = EMPTY_LINE;
  }
  
  updateUICentering(); // Set initial UI position.

  gameOver = false;
  paused = false;
  points = 0;
  lines = 0;
  level = 0;
  getNextBlock();
  setSpeed();
  needDraw = true;
}

// --- Input Handling ---
// A state object to track button presses and prevent multiple triggers from one press.
var lastBtnState = {
    KNOB1_BTN: false,
    BTN_TORCH: false,
    BTN_TUNEUP: false,
    BTN_TUNEDOWN: false
};

// This function checks for button presses that should only trigger once.
function handleButtonPresses() {
    var knob1Pressed = KNOB1_BTN.read();
    if (knob1Pressed && !lastBtnState.KNOB1_BTN) {
        if (gameOver) startGame(); // If game is over, restart.
        else dropPiece();          // Otherwise, drop the piece.
    }
    lastBtnState.KNOB1_BTN = knob1Pressed;

    var torchPressed = BTN_TORCH.read();
    if (torchPressed && !lastBtnState.BTN_TORCH) {
        togglePause();
    }
    lastBtnState.BTN_TORCH = torchPressed;

    var tuneUpPressed = BTN_TUNEUP.read();
    if (tuneUpPressed && !lastBtnState.BTN_TUNEUP) {
        if (!uiCentered) {
            uiCentered = true;
            updateUICentering();
        }
    }
    lastBtnState.BTN_TUNEUP = tuneUpPressed;

    var tuneDownPressed = BTN_TUNEDOWN.read();
    if (tuneDownPressed && !lastBtnState.BTN_TUNEDOWN) {
        if (uiCentered) {
            uiCentered = false;
            updateUICentering();
        }
    }
    lastBtnState.BTN_TUNEDOWN = tuneDownPressed;
}

// Knob 1: Rotate piece.
function onKnobRotate(dir) {
    if (paused || gameOver) return;
    // dir is -1 for clockwise, 1 for counter-clockwise.
    checkMove(0, 0, dir); // Invert rotation.
}
Pip.on("knob1", onKnobRotate);

// Knob 2: Move piece Left/Right.
function onKnobMove(dir) {
    if (paused || gameOver) return;
    // dir is -1 for clockwise, 1 for counter-clockwise.
    checkMove(dir, 0, 0); // Fixes inversion.
}
Pip.on("knob2", onKnobMove);


// --- Main Loop & Exit ---
// This interval handles button presses and calls the main draw function.
var mainInterval = setInterval(function() {
    handleButtonPresses();
    draw();
}, 100); // Run 10 times per second.

// This function is called to exit the app cleanly.
function forceExit() {
  // Stop all timers.
  if (mainInterval) clearInterval(mainInterval);
  if (ticker) clearInterval(ticker);
  // Remove event listeners to prevent them from running after the app closes.
  Pip.removeListener("knob1", onKnobRotate);
  Pip.removeListener("knob2", onKnobMove);
  // Clear the screen.
  g.clear();
  G.clear();
  G.flip();
  // Load the default menu/launcher.
  load();
}

// Assign our exit function to the global 'Pip.remove' for system-wide compatibility.
Pip.remove = forceExit;
// Also, set the power button to trigger the exit function.
setWatch(forceExit, BTN_POWER, {edge:"rising", debounce:50, repeat:true});

// --- Initial Load ---
// Start the game when the script is first loaded.
startGame();