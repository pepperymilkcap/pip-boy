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

// --- UI Constants ---
const COLOR_GREEN = 3;        // Brightest green
const COLOR_MID_GREEN = 2;    // Medium green
const COLOR_DARK_GREEN = 1;   // Dark green
const COLOR_BLACK = 0;        // Black

// --- State Management ---
var drawTimeout;
var mainLoopInterval;
var startTime = Date.now(); // Record when the app starts

// --- Clock Configuration ---
const screen = {
  width: G.getWidth(),
  height: G.getHeight(),
};
const center = {
  x: screen.width / 2,
  y: screen.height / 2,
};
const scale = screen.width / 176; // Calculate scale factor based on original code

// --- Helper Functions ---
function d02(value) {
  return ('0' + value).substr(-2);
}

// Simplified locale functions for the Pip-Boy
const locale = {
  month: function(date, length) {
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return months[date.getMonth()].substring(0, length);
  },
  dow: function(date, length) {
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    return days[date.getDay()].substring(0, length);
  }
};

// --- Rendering Functions ---
function renderEllipse(g, color) {
  g.setColor(color);
  g.fillEllipse(
    center.x - 5 * scale, 
    center.y - 70 * scale, 
    center.x + 160 * scale, 
    center.y + 90 * scale
  );
}

function renderText(g, color) {
  g.setColor(color);
  
  const now = new Date();
  const hour = d02(now.getHours());
  const minutes = d02(now.getMinutes());
  const day = d02(now.getDate());
  const month = d02(now.getMonth() + 1);
  const year = now.getFullYear();
  const month2 = locale.month(now, 3);
  const day2 = locale.dow(now, 3);
  
  g.setFontAlign(1, 0);
  
  // Draw hour and minute with large font
  g.setFont("Vector", 70 * scale);
  g.drawString(hour, center.x + 32 * scale, center.y - 31 * scale);
  g.drawString(minutes, center.x + 32 * scale, center.y + 46 * scale);
  
  // Draw date info with smaller font
  g.setFont("Vector", 16 * scale);
  g.drawString(year, center.x + 80 * scale, center.y - 42 * scale);
  g.drawString(month, center.x + 80 * scale, center.y - 26 * scale);
  g.drawString(day, center.x + 80 * scale, center.y - 10 * scale);
  g.drawString(month2, center.x + 80 * scale, center.y + 44 * scale);
  g.drawString(day2, center.x + 80 * scale, center.y + 60 * scale);
}

// --- Main Drawing Function ---
function draw() {
  G.clear(COLOR_BLACK);
  
  // Create a temporary buffer for the masking effect
  let buf = Graphics.createArrayBuffer(screen.width, screen.height, 1, {
    msb: true
  });
  
  let img = {
    width: screen.width,
    height: screen.height,
    transparent: 0,
    bpp: 1,
    buffer: buf.buffer
  };
  
  // First render: text outside ellipse
  buf.clear();
  renderText(buf.setColor(1), 1);
  renderEllipse(buf.setColor(0), 0);
  G.setColor(COLOR_GREEN);
  G.drawImage(img, 0, 0);
  
  // Second render: text inside ellipse
  buf.clear();
  renderEllipse(buf.setColor(1), 1);
  renderText(buf.setColor(0), 0);
  G.setColor(COLOR_GREEN);
  G.drawImage(img, 0, 0);
  
  // Clean up to free memory
  buf = undefined;
  img = undefined;
  
  // Update the display
  G.flip();
  
  // Schedule next update at the start of the next minute
  if (drawTimeout) clearTimeout(drawTimeout);
  drawTimeout = setTimeout(function() {
    drawTimeout = undefined;
    draw();
  }, 60000 - (Date.now() % 60000));
}

// ------------------------------------------------------------
// --- EXIT FUNCTIONALITY - Allows exiting on button press ---
// ------------------------------------------------------------

/**
 * Force exit function - cleans up and exits the application
 * Called when any button is pressed or knob is turned
 */
function forceExit() {
  // Clean up timers
  if (drawTimeout) clearTimeout(drawTimeout);
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

// --- Initial Load ---
draw();