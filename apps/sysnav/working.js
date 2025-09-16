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

// --- State Management ---
var currentPath = "/";
var currentListing = [];
var selected = 0;
var currentPage = 0;
var needsRedraw = true;
var messageLines = [];
var messageTimeout = null;

// --- UI Constants ---
const LEFT_MARGIN = 30;
const HEADER_HEIGHT = 35;
const UNDERLINE_Y = HEADER_HEIGHT + 20;
const LIST_START_Y = UNDERLINE_Y + 45;
const LINE_HEIGHT = 24;
const FILES_PER_PAGE = 8;
const COLOR_GREEN = 3;
const COLOR_BLACK = 0;

// --- Filesystem Logic ---
function updateListing(path) {
  var contents = [];
  var readSuccess = false;
  try {
    if (path === "/") {
      contents = require("fs").readdirSync();
    } else {
      contents = require("fs").readdirSync(path);
    }
    readSuccess = true;
  } catch (e) {
    readSuccess = false;
  }

  if (!readSuccess) {
    if (path === "/") {
      contents = ["ALARM", "USER"];
    } else {
      messageLines = ["ERROR:", "CANNOT READ PATH"];
      messageTimeout = setTimeout(() => { messageLines = []; needsRedraw = true; messageTimeout = null; }, 2000);
      needsRedraw = true;
      return;
    }
  }
  
  if (path === "/" && contents.length === 0) {
      contents = ["ALARM", "USER"];
  }

  currentPath = path;
  currentListing = [];
  
  if (path !== "/") {
    currentListing.push({ name: "..", type: "dir" });
  }
  
  var dirs = [];
  var files = [];
  contents.forEach(item => {
    try {
      var itemPath = (path === "/") ? "/" + item : path + "/" + item;
      var isDir = false;
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
  
  currentListing = currentListing.concat(dirs).concat(files);
  
  selected = 0;
  currentPage = 0;
  needsRedraw = true;
}

// --- UI Drawing ---
function drawExplorer() {
  G.clear(COLOR_BLACK);
  
  G.setColor(COLOR_GREEN).setFontMonofonto28();
  var headerText = "SYSTEM NAVIGATOR";
  var headerWidth = G.stringWidth(headerText);
  var headerX = Math.floor((G.getWidth() - headerWidth) / 2);
  G.drawString(headerText, headerX, 15);
  G.fillRect(0, UNDERLINE_Y, G.getWidth(), UNDERLINE_Y + 3);

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

  var totalPages = Math.ceil(currentListing.length / FILES_PER_PAGE);
  var startIndex = currentPage * FILES_PER_PAGE;
  var endIndex = Math.min(startIndex + FILES_PER_PAGE, currentListing.length);
  var itemsOnPage = currentListing.slice(startIndex, endIndex);

  var listDrawY = LIST_START_Y;
  if (totalPages > 1) {
    G.setFontMonofonto16().setColor(COLOR_GREEN);
    var pageInfo = `PAGE ${currentPage + 1}/${totalPages}`;
    var pageInfoWidth = G.stringWidth(pageInfo);
    G.drawString(pageInfo, G.getWidth() - pageInfoWidth - LEFT_MARGIN, LIST_START_Y - 20);
  }
  
  G.setFontMonofonto16();
  itemsOnPage.forEach((item, i) => {
    var actualIndex = startIndex + i;
    var rowY = listDrawY + i * LINE_HEIGHT;
    
    if (actualIndex === selected) {
      G.setColor(COLOR_GREEN).fillRect(LEFT_MARGIN - 5, rowY - 4, G.getWidth() - LEFT_MARGIN + 5, rowY + LINE_HEIGHT - 4);
      G.setColor(COLOR_BLACK);
    } else { G.setColor(COLOR_GREEN); }
    
    var prefix = item.type === "dir" ? "[DIR] " : "[FILE] ";
    var displayName = prefix + item.name;
    
    if (G.stringWidth(displayName) > G.getWidth() - LEFT_MARGIN - 40) {
      while (G.stringWidth(displayName + "...") > G.getWidth() - LEFT_MARGIN - 40 && displayName.length > prefix.length) {
        displayName = displayName.slice(0, -1);
      }
      displayName += "...";
    }
    G.drawString(displayName, LEFT_MARGIN, rowY);
  });
  
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
function onKnob(dir) {
  if (!currentListing.length) return;
  selected = Math.max(0, Math.min(currentListing.length - 1, selected - dir));
  var newPage = Math.floor(selected / FILES_PER_PAGE);
  if (newPage !== currentPage) { currentPage = newPage; }
  needsRedraw = true;
}
Pip.on("knob1", onKnob);

function onPageKnob(dir) {
  if (!currentListing.length) return;
  var totalPages = Math.ceil(currentListing.length / FILES_PER_PAGE);
  // --- FIX: Inverted page scroll direction ---
  currentPage = Math.max(0, Math.min(totalPages - 1, currentPage + dir));
  selected = currentPage * FILES_PER_PAGE;
  needsRedraw = true;
}
Pip.on("knob2", onPageKnob);

function handleSelectButton() {
  if (!currentListing.length) return;
  
  var item = currentListing[selected];
  if (item.type === "dir") {
    var newPath;
    if (item.name === "..") {
      newPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
    } else {
      newPath = (currentPath === "/") ? "/" + item.name : currentPath + "/" + item.name;
    }
    updateListing(newPath);
  } else {
    messageLines = ["FILE SELECTED:", item.name.toUpperCase()];
    if (messageTimeout) clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => { messageLines = []; needsRedraw = true; messageTimeout = null; }, 2000);
    needsRedraw = true;
  }
}

// --- Main Loop ---
var lastBtnState = false;
function frameLoop() {
  var btnState = KNOB1_BTN.read();
  if (btnState && !lastBtnState) { handleSelectButton(); }
  lastBtnState = btnState;
  
  if (needsRedraw) { drawExplorer(); }
}
var frameInterval = setInterval(frameLoop, 100);

// --- Cleanup ---
Pip.remove = function () {
  clearInterval(frameInterval);
  if (messageTimeout) clearTimeout(messageTimeout);
  Pip.removeListener("knob1", onKnob);
  Pip.removeListener("knob2", onPageKnob);
};

// --- Initial Load ---
updateListing(currentPath);