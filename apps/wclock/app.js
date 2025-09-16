// --- Application Cleanup ---
if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

g.clear();

// Setup graphics buffer
var G = Graphics.createArrayBuffer(400, 308, 2, {
  msb: true,
  buffer: E.toArrayBuffer(E.memoryArea(0x10000000 + 16384, (400 * 308) >> 2))
});
G.flip = function() { return Pip.blitImage(G, 40, 7); };

// --- Word clock configuration ---
const allWords = [
  "ATWENTYD",
  "QUARTERY",
  "FIVEHALF",
  "DPASTORO",
  "FIVEIGHT",
  "SIXTHREE",
  "TWELEVEN",
  "FOURNINE"
];

const hours = {
  0: ["", 0, 0],
  1: ["ONE", 17, 47, 77],
  2: ["TWO", 06, 16, 17],
  3: ["THREE", 35, 45, 55, 65, 75],
  4: ["FOUR", 07, 17, 27, 37],
  5: ["FIVE", 04, 14, 24, 34],
  6: ["SIX", 05, 15, 25],
  7: ["SEVEN", 05, 46, 56, 66, 67],
  8: ["EIGHT", 34, 44, 54, 64, 74],
  9: ["NINE", 47, 57, 67, 77],
  10: ["TEN", 74, 75, 76],
  11: ["ELEVEN", 26, 36, 46, 56, 66, 76],
  12: ["TWELVE", 06, 16, 26, 36, 56, 66]
};

const mins = {
  0: ["A", 0, 0],
  1: ["FIVE", 02, 12, 22, 32],
  2: ["TEN", 10, 30, 40],
  3: ["QUARTER", 01, 11, 21, 31, 41, 51, 61],
  4: ["TWENTY", 10, 20, 30, 40, 50, 60],
  5: ["HALF", 42, 52, 62, 72],
  6: ["PAST", 13, 23, 33, 43],
  7: ["TO", 43, 53]
};

// --- UI Constants ---
// Colors for PipBoy (using shades of green)
const COLOR_BLACK = 0;
const COLOR_DARK_GREEN = 1;  // Darkest shade for inactive letters
const COLOR_MID_GREEN = 2;   // Middle shade (unused in this app)
const COLOR_BRIGHT_GREEN = 3; // Brightest shade for active letters

// Position and spacing
const dx = 36;  // Horizontal spacing between letters
const dy = 32;  // Vertical spacing between rows

// Calculate grid size
const gridWidth = 8 * dx;
const gridHeight = 8 * dy;

// Perfectly center the grid on the screen
const centerX = G.getWidth() / 2;
const centerY = G.getHeight() / 2;

// Start positions - moved 4 pixels to the left (one more than before)
const xs = Math.floor(centerX - (gridWidth / 2) + (dx/2)) - 4;
const ys = Math.floor(centerY - (gridHeight / 2)) - 15;

// Digital time position - just below the word grid
const timeY = ys + gridHeight + 10;

// State management
var updateInterval;
var mainLoopInterval;
var startTime = Date.now(); // Record the start time of the application

// --- Draw Function ---
function drawWordClock() {
  // Clear screen
  G.clear(COLOR_BLACK);

  // Get time
  var t = new Date();
  var h = t.getHours();
  var m = t.getMinutes();
  var time = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2);

  // Set font for letters
  G.setFontMonofonto23();
  G.setFontAlign(0, -1, 0);

  // Draw all words in dark green
  G.setColor(COLOR_DARK_GREEN);
  var c;
  var y = ys;
  var x = xs;
  allWords.forEach((line) => {
    x = xs;
    for (c in line) {
      G.drawString(line[c], x, y);
      x += dx;
    }
    y += dy;
  });

  // Calculate which words to highlight based on time
  var midx = Math.round(m / 5);
  var hidx = h % 12;
  if (hidx === 0) hidx = 12;
  
  var midxA = [];
  
  // Correctly handle minute calculations
  if (midx === 0) {
    // On the hour - just highlight the hour
    G.setColor(COLOR_BRIGHT_GREEN);
    G.drawString("A", xs, ys); // "A" (IT IS A...)
  } else {
    if (midx <= 6) {
      // PAST the hour
      midxA = [midx, 6]; // e.g., "FIVE PAST"
    } else {
      // TO the next hour
      midxA = [12 - midx, 7]; // e.g., "FIVE TO"
      hidx = (hidx + 1) % 12;
      if (hidx === 0) hidx = 12;
    }
  }

  // Highlight hour word with bright green
  G.setColor(COLOR_BRIGHT_GREEN);
  if (hours[hidx][0].length > 0) { // Only if there's an hour to highlight
    hours[hidx][0].split('').forEach((c, pos) => {
      x = xs + (hours[hidx][pos + 1] / 10 | 0) * dx;
      y = ys + (hours[hidx][pos + 1] % 10) * dy;
      G.drawString(c, x, y);
    });
  }

  // Highlight minute words with bright green
  midxA.forEach(idx => {
    if (mins[idx][0].length > 0) { // Only if there's a minute term to highlight
      mins[idx][0].split('').forEach((c, pos) => {
        x = xs + (mins[idx][pos + 1] / 10 | 0) * dx;
        y = ys + (mins[idx][pos + 1] % 10) * dy;
        G.drawString(c, x, y);
      });
    }
  });

  // Display digital time at bottom
  G.setColor(COLOR_BRIGHT_GREEN);
  G.setFontMonofonto23();
  G.drawString(time, centerX - 4, timeY);

  // Update the display
  G.flip();
}

// ------------------------------------------------------------
// --- EXIT FUNCTIONALITY - Allows exiting on button press ---
// ------------------------------------------------------------

/**
 * Force exit function - cleans up and exits the application
 * Called when any button is pressed or knob is turned
 */
function forceExit() {
  clearInterval(updateInterval);
  clearInterval(mainLoopInterval);
  
  // Remove all event listeners
  Pip.removeListener("knob1", forceExit);
  Pip.removeListener("knob2", forceExit);
  
  // Clear the screen
  g.clear();
  G.clear();
  G.flip();
  
  // Force a reload of the default menu app
  load();
}

// Set up event listeners for knobs
// These will trigger exit when either knob is turned
Pip.on("knob1", forceExit);
Pip.on("knob2", forceExit);

/**
 * Main loop - checks for button presses
 * Will only allow exit after 1 second has passed since program start
 * This prevents accidental exits when the app first loads
 */
function mainLoop() {
  // Only check for exit input after 1 second has passed
  if (Date.now() - startTime < 1000) return;
  
  // Check only buttons that actually exist on the PipBoy hardware
  if (KNOB1_BTN.read() ||        // Left knob "select" button
      BTN_POWER.read() ||        // Power button
      BTN_PLAY.read() ||         // Play button
      BTN_TORCH.read() ||        // Torch/flashlight button
      BTN_TUNEUP.read() ||       // Tune up button
      BTN_TUNEDOWN.read()) {     // Tune down button
    forceExit();
  }
}

mainLoopInterval = setInterval(mainLoop, 100);

// --- Cleanup function used when app is closed externally ---
Pip.remove = forceExit;
// ------------------------------------------------------------

// Initial draw and set update interval
drawWordClock();
updateInterval = setInterval(drawWordClock, 10000); // Update every 10 seconds