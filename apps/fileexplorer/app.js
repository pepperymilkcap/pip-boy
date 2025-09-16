if (Pip.removeSubmenu) Pip.removeSubmenu();
delete Pip.removeSubmenu;
if (Pip.remove) Pip.remove();
delete Pip.remove;

{
  let G = Graphics.createArrayBuffer(400, 300, 2, {
    msb: true,
    buffer: E.toArrayBuffer(E.memoryArea(0x10000000 + 32768, (400 * 300) >> 2))
  });
  G.flip = () => Pip.blitImage(G, 0, 0);

  let cwd = "/";
  let entries = [];
  let selected = 0;

  function listDir(dir) {
    try {
      let d = require("fs").readdirSync(dir);
      entries = d.map(name => {
        let full = dir + (dir.endsWith("/") ? "" : "/") + name;
        let stat = require("fs").statSync(full);
        return {
          name: name,
          path: full,
          dir: stat.isDirectory(),
        };
      });
      if (dir !== "/") entries.unshift({ name: "..", path: dir.replace(/\/[^\/]+\/?$/, "") || "/", dir: true });
    } catch (e) {
      entries = [];
    }
  }

  function render() {
    G.clear();
    G.setFont("6x8",2);
    G.setFontAlign(-1,-1);
    G.drawString("FILE EXPLORER", 5, 5);
    G.drawString("Dir: " + cwd, 5, 25);
    let y = 45;
    for (let i = 0; i < entries.length; i++) {
      let entry = entries[i];
      let txt = (entry.dir ? "[DIR] " : "      ") + entry.name;
      if (i === selected) {
        G.fillRect(0, y-2, 399, y+18);
        G.setColor(1,1,1);
        G.drawString(txt, 10, y);
        G.setColor(0,0,0);
      } else {
        G.drawString(txt, 10, y);
      }
      y += 20;
      if (y > 290) break;
    }
    G.flip();
  }

  function enter() {
    let entry = entries[selected];
    if (!entry) return;
    if (entry.dir) {
      if (entry.name === "..") {
        cwd = entry.path;
      } else {
        cwd = entry.path;
      }
      selected = 0;
      listDir(cwd);
      render();
    } else {
      // Prompt for deletion
      G.clear();
      G.setFont("6x8",2);
      G.setFontAlign(0,0);
      G.drawString("Delete '" + entry.name + "'?", 200, 140);
      G.drawString("knob1: Confirm", 200, 170);
      G.drawString("knob2: Cancel", 200, 190);
      G.flip();

      let confirm = () => {
        try {
          require("fs").unlinkSync(entry.path);
        } catch(e){}
        listDir(cwd);
        selected = 0;
        render();
        Pip.removeListener("knob1", confirm);
        Pip.removeListener("knob2", cancel);
        Pip.on("knob1", onKnob1);
        Pip.on("knob2", onKnob2);
      };
      let cancel = () => {
        render();
        Pip.removeListener("knob1", confirm);
        Pip.removeListener("knob2", cancel);
        Pip.on("knob1", onKnob1);
        Pip.on("knob2", onKnob2);
      };
      Pip.removeListener("knob1", onKnob1);
      Pip.removeListener("knob2", onKnob2);
      Pip.on("knob1", confirm);
      Pip.on("knob2", cancel);
    }
  }

  function up() {
    selected--;
    if (selected < 0) selected = entries.length-1;
    render();
  }

  function down() {
    selected++;
    if (selected >= entries.length) selected = 0;
    render();
  }

  function onKnob1() { enter(); }
  function onKnob2() { cwd = cwd.replace(/\/[^\/]+\/?$/, "") || "/"; selected = 0; listDir(cwd); render(); }

  // Additional: Use knob events for navigation (if available)
  function onKnobTurn(dir) {
    if (dir > 0) down();
    else if (dir < 0) up();
  }
  Pip.on("knobTurn", onKnobTurn);
  Pip.on("knob1", onKnob1);
  Pip.on("knob2", onKnob2);

  Pip.remove = function() {
    Pip.removeListener("knobTurn", onKnobTurn);
    Pip.removeListener("knob1", onKnob1);
    Pip.removeListener("knob2", onKnob2);
    G.clear();
    G.flip();
    showMainMenu();
    submenuApps();
  };

  listDir(cwd);
  render();
}