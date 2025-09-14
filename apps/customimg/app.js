if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

{
  // Read color mode from saved preference
  let isColorImage = false;
  try {
    let modeFile = E.openFile("USER/customimg.mode","r");
    let modeData = modeFile.read();
    modeFile.close();
    isColorImage = (modeData && modeData.toString().trim() === "color");
  } catch(e) {
    // Mode file doesn't exist, default to monochrome for compatibility
    isColorImage = false;
  }

  // create new Graphics instance with appropriate palette
  let G = Graphics.createArrayBuffer(400,300,2,{
    msb : true,
    buffer : E.toArrayBuffer(E.memoryArea(0x10000000 + 32768, (400*300)>>2)) // Uses 30,000 bytes of the 64KB CCM memory, starting above the 32KB audio ring buffer
  });
  
  // Set up color palette if this is a color image
  if (isColorImage) {
    // Set up 2-bit color palette: 0=black, 1=red, 2=green, 3=yellow/white
    G.setColorPalette([
      0x0000, // 0: Black
      0xF800, // 1: Red (RGB565: 11111 000000 00000)
      0x07E0, // 2: Green (RGB565: 00000 111111 00000) 
      0xFFE0  // 3: Yellow (RGB565: 11111 111111 00000)
    ]);
  } else {
    // Keep default green monochrome palette for compatibility
    G.setColorPalette([
      0x0000, // 0: Black
      0x0208, // 1: Dark green
      0x0610, // 2: Medium green  
      0x07E0  // 3: Bright green
    ]);
  }
  
  G.clear();
  G.flip = () => Pip.blitImage(G,40,11);

  // load image
  let f = E.openFile("USER/customimg.img","r");
  let o = 0, a = new Uint8Array(G.buffer), b = f.read(2048);
  while (b) {
    a.set(b, o);
    o += b.length;
    b = f.read(2048);
  }
  f.close();
  g.clear();
  G.flip();

  let closeImage = function() {
    Pip.remove();
    delete Pip.remove;
    showMainMenu();
    submenuApps();
  }

  let onKnob = function(d) {
    closeImage();
  }

  let interval = setInterval(() => G.flip(), 25);
  Pip.on("knob1", onKnob);
  Pip.on("knob2", onKnob);
  Pip.remove = function() {
    Pip.removeListener("knob1", onKnob);
    Pip.removeListener("knob2", onKnob);
    if (interval) clearInterval(interval);
    interval = undefined;
    g.clear();
  };
}