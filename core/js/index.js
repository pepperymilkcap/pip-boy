  const apps = (device.appsInstalled || []).map(a => `${a.id} (${a.version})`).join("\n");
  const version = device.connected ? device.version : "";

  const url = urlTemplate.replace("{version}", encodeURIComponent(version)).replace("{apps}", encodeURIComponent(apps));

  window.open(url, '_blank');
});

// Screenshot button
btn = document.getElementById("screenshot");
if (btn) btn.addEventListener("click",event=>{
  getInstalledApps(false).then(()=>{
    if (device.id=="BANGLEJS"){
      showPrompt("Screenshot","Screenshots are not supported on Bangle.js 1",{ok:1});
    } else {
      let url;
      Progress.show({title:"Creating screenshot",interval:10,percent:"animate",sticky:true});
      // g.dump() is slow, so we need to increase the timeout
      let commsLib = (typeof UART !== "undefined") ? UART : Puck;
      let oldTimeout = commsLib.SERIAL_TIMEOUT;
      commsLib.SERIAL_TIMEOUT = 10000; // 10 seconds
      Comms.write("\x10E.dumpStr(g.dump(0,0,480,320),0);\n").then((s)=>{
        commsLib.SERIAL_TIMEOUT = oldTimeout; // restore old timeout
        Progress.show({title:"Converting screenshot",percent:90,sticky:true});
        // wait a moment - the data seems to take a while to come back
        setTimeout(function() {
          let imageData = s.substr(s.indexOf("\n")+1);
          url = imageconverter.stringToImageURL(imageData);
          if (!url) {
            showToast("Error: Unable to convert screenshot data", "error");
            Progress.hide({sticky:true});
            return;
          }

          let screenshotHtml = `
            <div style="text-align: center;">
              <img align="center" src="${url}"></img>
            </div>
          `

          showPrompt("Save Screenshot?",screenshotHtml, undefined, false).then((r)=>{
            Progress.show({title:"Saving screenshot",percent:99,sticky:true});
            let link = document.createElement("a");
            link.download = "screenshot.png";
            link.target = "_blank";
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }).catch(()=>{
          }).finally(()=>{
            Progress.hide({sticky:true});
          });
        }, 500);
        Progress.show({title:"Screenshot done",percent:85,sticky:true});

      }, err=>{
        commsLib.SERIAL_TIMEOUT = oldTimeout; // restore old timeout
        showToast("Error creating screenshot: "+err,"error");
      });
    }
  });
});

// Upload files button
btn = document.getElementById("uploadfiles");
