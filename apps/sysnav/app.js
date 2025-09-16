// --- Application Cleanup ---
// Before starting the new application instance, this code cleans up any previous versions.
// This is a standard practice for Pip-Boy applications to prevent memory leaks and event listener conflicts.
if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

// Clears the entire screen to black before drawing anything new.
g.clear();

// --- Graphics Setup ---
// The Pip-Boy screen doesn't draw directly to the display. Instead, it draws to a 'graphics buffer' in memory first.
// This allows for smooth, flicker-free animations and screen updates.
var G = Graphics.createArrayBuffer(400, 308, 2, {
  msb: true,
  buffer: E.toArrayBuffer(E.memoryArea(0x10000000 + 16384, (400 * 308) >> 2))
});
// The 'flip' function takes the completed image from the memory buffer (G) and sends it to the Pip-Boy's screen to be displayed.
G.flip = function() { return Pip.blitImage(G, 40, 7); };

// --- Global State Management ---
// These variables track the application's current state and are accessible by most functions.
var currentPath = "/"; // The directory path the user is currently viewing.
var currentListing = []; // An array holding the list of files and directories in the currentPath.
var selected = 0; // The index of the currently highlighted item in the 'currentListing' array.
var confirmedFilePath = null; // The full path of the file the user has "confirmed" by pressing the select button.
var confirmedFileName = null; // The name of the confirmed file. This persists even when changing directories.
var currentPage = 0; // The current page number for the file/directory list.
var needsRedraw = true; // A flag to signal when the screen needs to be updated. This optimizes drawing by avoiding unnecessary updates.
var messageLines = []; // An array of strings to be displayed in a pop-up message box.
var messageTimeout = null; // A timer for automatically hiding the message box.
var torchWatchId = null; // CORRECTED: Declared in global scope.

// --- Text View State Variables ---
// These variables are specifically for the text file viewer mode.
var inTextViewMode = false; // A boolean flag that is true when the text viewer is active, and false otherwise.
var textContent = []; // An array where each element is a line of text from the file, pre-formatted for display.
var textViewPage = 0; // The current page number for the text viewer.
var textFileName = ""; // The name of the file being viewed.
var maxTextLinesPerPage = 10; // The maximum number of text lines to display on a single screen in the viewer.

// --- UI Layout Constants ---
// Using constants for layout values makes the code cleaner and easier to modify.
// If you want to change the layout, you only need to change these values, not hunt through the drawing functions.
const LEFT_MARGIN = 30;
const HEADER_HEIGHT = 35;
const UNDERLINE_Y = HEADER_HEIGHT + 20;
const LIST_START_Y = UNDERLINE_Y + 45;
const LINE_HEIGHT = 24; // The vertical space for each item in the file list.
const FILES_PER_PAGE = 8;
const COLOR_GREEN = 3; // The color code for the classic Pip-Boy green.
const COLOR_BLACK = 0; // The color code for black (the background).
const TEXT_VIEW_LEFT_MARGIN = 20;
const TEXT_VIEW_LINE_HEIGHT = 20;
const TEXT_VIEW_START_Y = LIST_START_Y;

// --- Filesystem Logic ---
// This function reads the contents of a given directory path and updates the application's state.
function updateListing(path) {
  var contents = [];
  var readSuccess = false;
  // A 'try...catch' block is used for operations that might fail, like reading from the filesystem.
  try {
    contents = require("fs").readdirSync(path);
    readSuccess = true;
  } catch (e) {
    // If reading the directory fails, this 'catch' block will execute.
    readSuccess = false;
  }

  // If reading the filesystem was unsuccessful, provide a default, hardcoded directory listing.
  // This ensures the app doesn't crash and remains usable even if the filesystem is inaccessible.
  if (!readSuccess) {
    if (path === "/") {
      contents = ["ALARM", "USER"];
    } else {
      // If a specific subdirectory fails, show an error.
      messageLines = ["ERROR:", "CANNOT READ PATH"];
      messageTimeout = setTimeout(() => { messageLines = []; needsRedraw = true; messageTimeout = null; }, 2000);
      needsRedraw = true;
      return;
    }
  }
  
  // Also provide a default if the root directory is empty.
  if (path === "/" && contents.length === 0) {
      contents = ["ALARM", "USER"];
  }

  // Update the application state with the new path and an empty list to start.
  currentPath = path;
  currentListing = [];
  
  // If we are not in the root directory, add a ".." entry to allow navigation up to the parent directory.
  if (path !== "/") {
    currentListing.push({ name: "..", type: "dir" });
  }
  
  // Separate the contents into two arrays: one for directories and one for files.
  var dirs = [];
  var files = [];
  contents.forEach(item => {
    try {
      var itemPath = (path === "/") ? "/" + item : path + "/" + item;
      var isDir = false;
      // A common trick to check if a path is a directory is to try to read it. If it succeeds, it's a directory. If it fails, it's a file.
      try {
        require("fs").readdirSync(itemPath);
        isDir = true;
      } catch(e) { /* It's a file */ }
      
      if (isDir) {
        dirs.push({ name: item, type: "dir" });
      } else {
        files.push({ name: item, type: "file" });
      }
    } catch (e) { /* Ignore unreadable items */ }
  });

  // Sort the directories and files alphabetically. This provides a predictable and user-friendly order.
  dirs.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  files.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  
  // Combine the sorted lists, with directories appearing first, then files.
  currentListing = currentListing.concat(dirs).concat(files);
  
  // Reset the view to the top of the new list.
  selected = 0;
  currentPage = 0;
  needsRedraw = true; // Signal that the screen needs to be updated with the new listing.
}

// --- Text View Functions ---
// This is the most robust "single pass" implementation. It iterates over the raw
// text character by character, handling wrapping and all line-ending types implicitly.
function wrapText(text) {
    G.setFontMonofonto16();
    const maxWidth = G.getWidth() - TEXT_VIEW_LEFT_MARGIN * 2;
    const wrappedLines = [];
    let currentLine = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '\n') {
            // Newline character: finalize the current line and start a new one.
            wrappedLines.push(currentLine);
            currentLine = '';
            continue;
        }

        if (char === '\r') {
            // Carriage return: simply ignore it.
            continue;
        }

        const testLine = currentLine + char;
        if (G.stringWidth(testLine) > maxWidth) {
            // Line is too wide: finalize the line *before* this character...
            wrappedLines.push(currentLine);
            // ...and start a new line with the current character.
            currentLine = char;
        } else {
            // Character fits: add it to the current line.
            currentLine = testLine;
        }
    }

    // Add the final line after the loop finishes.
    wrappedLines.push(currentLine);

    return wrappedLines;
}

// A simple heuristic to detect if content is binary by checking for null bytes.
function isBinary(content) {
  return content.includes('\0');
}

// Reads a file from the filesystem and prepares it for the text viewer.
function loadTextFile(filePath) {
  try {
    var content = require("fs").readFileSync(filePath, "utf8");
    
    // Check if the file is binary before trying to process it.
    if (isBinary(content)) {
      messageLines = ["ERROR:", "CANNOT VIEW BINARY FILE"];
      if (messageTimeout) clearTimeout(messageTimeout);
      messageTimeout = setTimeout(() => { messageLines = []; needsRedraw = true; messageTimeout = null; }, 2000);
      needsRedraw = true;
      return false; // Indicate failure
    }

    if (!content || content.trim().length === 0) {
        textContent = ["FILE IS EMPTY"];
    } else {
        // If the file has content, run it through the wrapping function.
        textContent = wrapText(content);
    }
    textViewPage = 0; // Reset to the first page.
    return true; // Indicate success.
  } catch (e) {
    // This catch block will handle general file read errors.
    messageLines = ["ERROR:", "CANNOT READ FILE"];
    if (messageTimeout) clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => { messageLines = []; needsRedraw = true; messageTimeout = null; }, 2000);
    needsRedraw = true;
    return false; // Indicate failure.
  }
}

// --- UI Drawing ---
// This function is responsible for drawing the entire text viewer interface.
function drawTextView() {
  G.clear(COLOR_BLACK);
  
  // Draw the header ("TEXT VIEWER") and the underline.
  G.setColor(COLOR_GREEN).setFontMonofonto28();
  var headerText = "TEXT VIEWER";
  var headerWidth = G.stringWidth(headerText);
  var headerX = Math.floor((G.getWidth() - headerWidth) / 2);
  G.drawString(headerText, headerX, 15);
  G.fillRect(0, UNDERLINE_Y, G.getWidth(), UNDERLINE_Y + 3);

  // Draw the sub-header, which includes the filename and page count.
  G.setFontMonofonto16();
  var pathText = "FILE: " + textFileName;
  if (G.stringWidth(pathText) > G.getWidth() - LEFT_MARGIN) {
      pathText = "..." + pathText.substring(pathText.length - Math.floor((G.getWidth() - LEFT_MARGIN * 2) / G.stringWidth("A")));
  }
  G.drawString(pathText, LEFT_MARGIN, UNDERLINE_Y + 15);
  
  var totalPages = Math.ceil(textContent.length / maxTextLinesPerPage);
  if (totalPages > 1) {
    var pageInfo = `PAGE ${textViewPage + 1}/${totalPages}`;
    var pageInfoWidth = G.stringWidth(pageInfo);
    G.drawString(pageInfo, G.getWidth() - pageInfoWidth - LEFT_MARGIN, UNDERLINE_Y + 15);
  }
  
  // Draw the actual text content for the current page.
  G.setFontMonofonto16();
  var startLine = textViewPage * maxTextLinesPerPage;
  var endLine = Math.min(startLine + maxTextLinesPerPage, textContent.length);
  
  for (var i = startLine; i < endLine; i++) {
    var y = TEXT_VIEW_START_Y + (i - startLine) * TEXT_VIEW_LINE_HEIGHT;
    G.drawString(textContent[i], TEXT_VIEW_LEFT_MARGIN, y);
  }
  
  G.flip(); // Send the completed drawing to the screen.
  needsRedraw = false; // Mark the screen as up-to-date.
}

// This is the main drawing function for the file explorer interface.
function drawExplorer() {
  // If we are in text view mode, call its dedicated drawing function instead and stop here.
  if (inTextViewMode) {
    drawTextView();
    return;
  }
  
  G.clear(COLOR_BLACK);
  
  // Draw the main header and underline.
  G.setColor(COLOR_GREEN).setFontMonofonto28();
  var headerText = "SYSTEM NAVIGATOR X";
  var headerWidth = G.stringWidth(headerText);
  var headerX = Math.floor((G.getWidth() - headerWidth) / 2);
  G.drawString(headerText, headerX, 15);
  G.fillRect(0, UNDERLINE_Y, G.getWidth(), UNDERLINE_Y + 3);

  // Draw the sub-header with the current path and page number.
  G.setFontMonofonto16();
  var pathText = "PATH: " + currentPath;
  if (G.stringWidth(pathText) > G.getWidth() - LEFT_MARGIN) {
      pathText = "..." + pathText.substring(pathText.length - Math.floor((G.getWidth() - LEFT_MARGIN * 2) / G.stringWidth("A")));
  }
  G.drawString(pathText, LEFT_MARGIN, UNDERLINE_Y + 15);

  if (!currentListing.length) {
    G.setFontMonofonto23().setColor(COLOR_GREEN);
    G.drawString("DIRECTORY IS EMPTY", Math.floor((G.getWidth() - G.stringWidth("DIRECTORY IS EMPTY")) / 2), G.getHeight() / 2);
    G.flip();
    needsRedraw = false;
    return;
  }

  // Calculate which items in the list should be visible on the current page.
  var totalPages = Math.ceil(currentListing.length / FILES_PER_PAGE);
  if (totalPages > 1) {
    var pageInfo = `PAGE ${currentPage + 1}/${totalPages}`;
    var pageInfoWidth = G.stringWidth(pageInfo);
    G.drawString(pageInfo, G.getWidth() - pageInfoWidth - LEFT_MARGIN, UNDERLINE_Y + 15);
  }
  
  // Get just the subset of items for the current page.
  var startIndex = currentPage * FILES_PER_PAGE;
  var endIndex = Math.min(startIndex + FILES_PER_PAGE, currentListing.length);
  var itemsOnPage = currentListing.slice(startIndex, endIndex);
  
  // Loop through the items for the current page and draw each one.
  G.setFontMonofonto16();
  var listDrawY = LIST_START_Y;
  itemsOnPage.forEach((item, i) => {
    var actualIndex = startIndex + i;
    var rowY = listDrawY + i * LINE_HEIGHT;
    
    // If the current item is the selected one, draw a highlighted background behind it.
    if (actualIndex === selected) {
      G.setColor(COLOR_GREEN).fillRect(LEFT_MARGIN - 5, rowY - 4, G.getWidth() - LEFT_MARGIN + 5, rowY + LINE_HEIGHT - 4);
      G.setColor(COLOR_BLACK); // Set the text color to black to contrast with the green highlight.
    } else { G.setColor(COLOR_GREEN); }
    
    // Add a prefix to distinguish between files and directories.
    var prefix = item.type === "dir" ? "[DIR] " : "[FILE] ";
    var displayName = prefix + item.name;
    
    // Truncate long names with "..." so they don't run off the screen.
    if (G.stringWidth(displayName) > G.getWidth() - LEFT_MARGIN - 40) {
      while (G.stringWidth(displayName + "...") > G.getWidth() - LEFT_MARGIN - 40 && displayName.length > prefix.length) {
        displayName = displayName.slice(0, -1);
      }
      displayName += "...";
    }
    G.drawString(displayName, LEFT_MARGIN, rowY);
  });
  
  // If there are any messages to display, draw the pop-up message box over everything else.
  if (messageLines.length) {
    var boxWidth = 360;
    var boxHeight = 20 * messageLines.length + 30;
    var boxX = Math.floor((G.getWidth() - boxWidth) / 2);
    var boxY = Math.floor((G.getHeight() - boxHeight) / 2);
    G.setColor(COLOR_GREEN).fillRect(boxX - 3, boxY - 3, boxX + boxWidth + 3, boxY + boxHeight + 3);
    G.setColor(COLOR_BLACK).fillRect(boxX, boxY, boxX + boxWidth, boxY + boxHeight);
    G.setColor(COLOR_GREEN).drawRect(boxX + 2, boxY + 2, boxX + boxWidth - 2, boxY + boxHeight - 2);
    G.setFontMonofonto16().setColor(COLOR_GREEN);
    messageLines.forEach((line, j) => {
      var lineX = boxX + Math.floor((boxWidth - G.stringWidth(line)) / 2);
      G.drawString(line, lineX, boxY + 20 + j * 20);
    });
  }
  
  G.flip();
  needsRedraw = false;
}

// --- Input Handling ---
// This function is called when the main knob (knob1) is turned.
function onKnob(dir) {
  // The behavior changes depending on whether we are in text view mode or not.
  if (inTextViewMode) {
    // In text view, the knob scrolls through pages of text.
    var totalPages = Math.ceil(textContent.length / maxTextLinesPerPage);
    textViewPage = Math.max(0, Math.min(totalPages - 1, textViewPage + dir));
  } else {
    // In the file explorer, the knob moves the selection highlight up and down the list.
    if (!currentListing.length) return;
    selected = Math.max(0, Math.min(currentListing.length - 1, selected - dir));
    // Automatically switch pages if the selection scrolls off the current screen.
    var newPage = Math.floor(selected / FILES_PER_PAGE);
    if (newPage !== currentPage) { currentPage = newPage; }
  }
  needsRedraw = true; // Signal that the screen needs to be updated.
}
Pip.on("knob1", onKnob); // Register the function to listen for knob1 events.

// This function is called when the secondary knob (knob2) is turned.
function onPageKnob(dir) {
  if (inTextViewMode) {
    // In text view, this knob also scrolls pages.
    var totalPages = Math.ceil(textContent.length / maxTextLinesPerPage);
    textViewPage = Math.max(0, Math.min(totalPages - 1, textViewPage + dir));
  } else {
    // In the file explorer, this knob jumps between pages of files.
    if (!currentListing.length) return;
    var totalPages = Math.ceil(currentListing.length / FILES_PER_PAGE);
    currentPage = Math.max(0, Math.min(totalPages - 1, currentPage + dir));
    selected = currentPage * FILES_PER_PAGE; // Move the selection to the top of the new page.
  }
  needsRedraw = true;
}
Pip.on("knob2", onPageKnob); // Register the function to listen for knob2 events.

// This function handles a press of the main knob's button (the "select" action).
function handleSelectButton() {
  if (inTextViewMode) return; // The button does nothing in text view mode.
  if (!currentListing.length) return;
  
  var item = currentListing[selected];
  
  if (messageTimeout) clearTimeout(messageTimeout); // Clear any previous message timer.

  // If the selected item is a directory, navigate into it.
  if (item.type === "dir") {
    var newPath;
    if (item.name === "..") {
      newPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    } else {
      newPath = (currentPath === "/") ? "/" + item.name : currentPath + "/" + item.name;
    }
    updateListing(newPath); // Reload the file list for the new path.
  } else { // It's a file
    // Check for the special case of the app's own source file.
    if (item.name === "sysnav.js") {
      messageLines = ["ERROR:", "CANNOT PERFORM TASKS ON ITSELF"];
      confirmedFilePath = null; // Clear any previously queued file.
      confirmedFileName = null;
    } else {
      // For any other file, queue it for viewing.
      confirmedFilePath = (currentPath === "/") ? "/" + item.name : currentPath + "/" + item.name;
      confirmedFileName = item.name;
      messageLines = ["FILE QUEUED FOR VIEWING", item.name.toUpperCase()];
    }
    
    // Set the message to display and then disappear after 2 seconds.
    messageTimeout = setTimeout(() => { messageLines = []; needsRedraw = true; messageTimeout = null; }, 2000);
    needsRedraw = true;
  }
}

// This function handles a press of the separate BTN_TORCH button.
function handleTorchButton() {
  if (inTextViewMode) {
    // If we are already in text view, this button exits back to the file explorer.
    inTextViewMode = false;
    textContent = [];
    needsRedraw = true;
  } else {
    // If we are in the file explorer, this button opens the text viewer for the "confirmed" file.
    if (!confirmedFilePath) return; // Do nothing if no file has been confirmed yet.
    
    textFileName = confirmedFileName;
    if (loadTextFile(confirmedFilePath)) {
      // If the file loads successfully, switch to text view mode.
      inTextViewMode = true;
      needsRedraw = true;
    }
  }
}

// Configures the system to call 'handleTorchButton' whenever BTN_TORCH is pressed.
function enableTorchWatch() {
    if (torchWatchId) clearWatch(torchWatchId);
    torchWatchId = setWatch(handleTorchButton, BTN_TORCH, { repeat: true, edge: "rising", debounce: 50 });
}

// --- Main Application Loop ---
// This loop runs continuously to handle real-time input and screen updates.
var lastBtnState = false;
function frameLoop() {
  // Manually check the state of the knob button. This is an alternative to using setWatch.
  var btnState = KNOB1_BTN.read();
  if (btnState && !lastBtnState) { // Check for a press (state changed from false to true).
    handleSelectButton(); 
  }
  lastBtnState = btnState;
  
  // If any part of the application has signaled a screen update is needed, redraw the screen.
  if (needsRedraw) { 
    drawExplorer(); 
  }
}
var frameInterval = setInterval(frameLoop, 100); // Run the frameLoop function 10 times per second.

// --- Final Cleanup Function ---
// This function is assigned to Pip.remove and is called by the OS when the app is about to close.
// It's crucial for stopping intervals and removing event listeners to prevent errors.
Pip.remove = function () {
  clearInterval(frameInterval);
  if (messageTimeout) clearTimeout(messageTimeout);
  Pip.removeListener("knob1", onKnob);
  Pip.removeListener("knob2", onPageKnob);
  if (torchWatchId) clearWatch(torchWatchId);
};

// --- Initial Application Load ---
// This code runs once when the application starts.
updateListing(currentPath); // Load the file list for the root directory.
enableTorchWatch(); // Start listening for torch button presses.