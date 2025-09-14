if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

{
  // First, read the image header to determine the bit depth
  let f = E.openFile("USER/customimg.img","r");
  if (!f) {
    console.log("Custom image file not found");
    return;
  }
  
  let header = f.read(3); // Read width, height, bpp
  if (!header || header.length < 3) {
    f.close();
    console.log("Invalid image file");
    return;
  }
  
  let width = header[0];
  let height = header[1];
  let bppByte = header[2];
  let bpp = bppByte & 63; // Remove transparency and palette flags
  let hasTransparency = !!(bppByte & 128);
  let hasPalette = !!(bppByte & 64);
  
  // Calculate memory requirement
  let pixelCount = width * height;
  let bytesNeeded;
  if (bpp === 1) bytesNeeded = Math.ceil(pixelCount / 8);
  else if (bpp === 2) bytesNeeded = Math.ceil(pixelCount / 4);
  else if (bpp === 4) bytesNeeded = Math.ceil(pixelCount / 2);
  else bytesNeeded = pixelCount; // 8 bpp
  
  // Ensure we don't exceed memory limits (64KB CCM, with 32KB for audio)
  // Be conservative and limit to 28KB to leave room for headers and other data
  let maxMemory = 28672; // 28KB conservative limit
  if (bytesNeeded > maxMemory) {
    f.close();
    console.log("Image too large for memory:", bytesNeeded, "bytes needed,", maxMemory, "bytes available");
    return;
  }
  
  // Close and reopen file to start from beginning
  f.close();
  f = E.openFile("USER/customimg.img","r");
  
  // Create Graphics instance with appropriate bit depth
  let G = Graphics.createArrayBuffer(width, height, bpp, {
    msb : true,
    buffer : E.toArrayBuffer(E.memoryArea(0x10000000 + 32768, bytesNeeded))
  });
  G.clear();
  G.flip = () => Pip.blitImage(G,40,11);

  // Load the complete image file
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