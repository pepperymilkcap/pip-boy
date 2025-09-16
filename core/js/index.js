
let appJSON = []; // List of apps and info from apps.json
let appSortInfo = {}; // list of data to sort by, from appdates.csv { created, modified }
let appCounts = {};
let files = []; // list of files on the Espruimo Device
const DEFAULTSETTINGS = {
  pretokenise : true,
  minify : false,  // disabled by default due to https://github.com/espruino/BangleApps/pull/355#issuecomment-620124162
  settime : false, // Always update time when we connect
  favourites : ["launch"],
  language : "",
  bleCompat: false, // 20 byte MTU BLE Compatibility mode
  sendUsageStats: false,  // send usage stats to banglejs.com
  alwaysAllowUpdate : true, //  Always show "reinstall app" buttonregardless of the version
  autoReload: false, //  Automatically reload watch after app App Loader actions (removes "Hold button" prompt)
  noPackets: false,  // Enable File Upload Compatibility mode (disables binary packet upload)
};
var SETTINGS = JSON.parse(JSON.stringify(DEFAULTSETTINGS)); // clone

let device = {
  id : undefined,     // The Espruino device ID of this device, eg. BANGLEJS
  version : undefined,// The Espruino firmware version, eg 2v08
  info : undefined,   // An entry from DEVICEINFO with information about this device
  connected : false,   // are we connected via BLE right now?
  appsInstalled : []  // list of app {id,version} of installed apps
};
// FOR TESTING ONLY
/*let LANGUAGE = {
  "//":"German language translations",
  "GLOBAL": {
    "//":"Translations that apply for all apps",
    "Alarm" : "Wecker",
    "Hours" : "Stunden",
    "Minutes" : "Minuten",
    "Enabled" : "Aktiviert",
    "Settings" : "Einstellungen"
  },
  "alarm": {
    "//":"App-specific overrides",
    "Alarm" : "Alarm"
  }
};*/
var LANGUAGE = undefined;

function appJSONLoadedHandler() {
  appJSON.forEach(app => {
    if (app.screenshots)
      app.screenshots.forEach(s => {
        if (s.url) s.url = "apps/"+app.id+"/"+s.url;
      });
  });
  var promise = Promise.resolve();
  if ("undefined" != typeof onAppJSONLoaded)
    promise = promise.then(onAppJSONLoaded);
  // finally update what we're showing
  promise.then(function() {
    refreshLibrary();
    // if ?id=...&readme is in URL, show it
    if (window.location.search) {
      let searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has("id") && searchParams.has("readme")) {
        var id = searchParams.get("id").toLowerCase();
        showReadme(null, id);
      }
    }
  });
}

httpGet(Const.APPS_JSON_FILE).then(apps=>{
  if (apps.startsWith("---")) {
    showToast(Const.APPS_JSON_FILE+" still contains Jekyll markup","warning");
    throw new Error("Not JSON");
  }
  try {
    appJSON = JSON.parse(apps);
  } catch(e) {
    console.log(e);
    showToast("App List Corrupted","error");
  }
  // fix up the JSON
  if (appJSON.length && appJSON[appJSON.length-1]===null)
    appJSON.pop(); // remove trailing null added to make auto-generation of apps.json easier
  appJSONLoadedHandler();
}).catch(error=>{
  console.warn("APPS FILE NOT FOUND "+Const.APPS_JSON_FILE);
  console.log("Attempting search - SLOW");
  let baseurl = window.location.href.replace(/\/[^/]*$/,"/");
  let appsURL = baseurl+"apps/";
  httpGet(appsURL).then(htmlText=>{
    showToast(Const.APPS_JSON_FILE+" can't be read, scanning 'apps' folder for apps","warning");
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(htmlText,"text/html");
    appJSON = [];
    var promises = [];
    htmlToArray(xmlDoc.querySelectorAll("a")).forEach(a=>{
      var href = a.getAttribute("href");
      if (!href || href.startsWith("/") || href.startsWith("_") || !href.endsWith("/")) return;
      var metadataURL = appsURL+"/"+href+"metadata.json";
      console.log(" - Loading "+metadataURL);
      promises.push(httpGet(metadataURL).then(metadataText=>{
        try {
          appJSON.push(JSON.parse(metadataText));
        } catch(e) {
          console.log(e);
          showToast("App "+href+" metadata.json Corrupted","error");
        }
      }).catch(err=>{
        console.warn("App folder "+href+" has no metadata");
      }));
    });
    Promise.all(promises).then(appJSONLoadedHandler);
  }).catch(err=>{
    showToast(Const.APPS_JSON_FILE+" doesn't exist and cannot do directory listing on this server","error");
  });
});

if (Const.APP_DATES_CSV) httpGet(Const.APP_DATES_CSV).then(csv=>{
  // Firefox Date.parse doesn't understand our appdates.csv format
  function parseDate(datestamp) {
    // example: "2022-01-13 09:21:33 +0000"
    const [date, time, tz] = datestamp.split(" "),
      [year, month, day] = date.split("-"),
      [hours, minutes, seconds] = time.split(":");
    return new Date(year, month-1, day, hours, minutes, seconds);
  }
  csv.split("\n").forEach(line=>{
    let l = line.split(",");
    if (l.length<3) return;
    let key = l[0];
    if (appSortInfo[key]==undefined)
      appSortInfo[key] = {};
    appSortInfo[key].created = parseDate(l[1]);
    appSortInfo[key].modified = parseDate(l[2]);
  });
  document.querySelector(".sort-nav").classList.remove("hidden");
  document.querySelector(".sort-nav label[sortid='created']").classList.remove("hidden");
  document.querySelector(".sort-nav label[sortid='modified']").classList.remove("hidden");
}).catch(err=>{
  console.log("No recent.csv - app sort disabled");
});

if (Const.APP_USAGE_JSON) httpGet(Const.APP_USAGE_JSON).then(jsonTxt=>{
  var json;
  try {
    json = JSON.parse(jsonTxt);
  } catch (e) {
    console.warn("App usage JSON at "+Const.APP_USAGE_JSON+" couldn't be parsed");
    return;
  }
  appCounts.favs = 0;
  Object.keys(json.fav).forEach(key =>{
    if (appSortInfo[key]==undefined)
      appSortInfo[key] = {};
    if (json.fav[key] > appCounts.favs) appCounts.favs = json.fav[key];
    appSortInfo[key].favourites = json.fav[key];
  });
  appCounts.installs = 0;
  Object.keys(json.app).forEach(key =>{
    if (appSortInfo[key]==undefined)
      appSortInfo[key] = {};
    if (json.app[key] > appCounts.installs) appCounts.installs = json.app[key];
    appSortInfo[key].installs = json.app[key];
  });
  document.querySelector(".sort-nav").classList.remove("hidden");
  document.querySelector(".sort-nav label[sortid='installs']").classList.remove("hidden");
  document.querySelector(".sort-nav label[sortid='favourites']").classList.remove("hidden");
  // actually set to sort on favourites
  if (activeSort != "favourites") {
    activeSort = "favourites";
    refreshSort();
    refreshLibrary();
  }
}).catch(err=>{
  console.log("No recent.csv - app sort disabled");
});

// ===========================================  Top Navigation
function showChangeLog(appid, installedVersion) {
  let app = appNameToApp(appid);
  function show(contents) {
    let shouldEscapeHtml = true;
    if (contents && installedVersion) {
      let lines = contents.split("\n");
      for(let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.startsWith(installedVersion)) {
          line = '<a id="' + installedVersion + '"></a>' + line;
          lines[i] = line;
        }
      }
      contents = lines.join("<br>");
      shouldEscapeHtml = false;
    }
    showPrompt(app.name+" ChangeLog",contents,{ok:true}, shouldEscapeHtml).catch(()=>{});
    if (installedVersion) {
      var elem = document.getElementById(installedVersion);
      if (elem) elem.scrollIntoView();
    }
  }
  httpGet(`apps/${appid}/ChangeLog`).
    then(show).catch(()=>show("No Change Log available"));
}
function showReadme(event, appid) {
  if (event) event.preventDefault();
  let app = appNameToApp(appid);
  let appPath = `apps/${appid}/`;
  let markedOptions = { baseUrl : appPath };
  function show(contents) {
    if (!contents) return;
    let footerText = `<a href="${window.location.origin+window.location.pathname+"?id="+appid+"&readme"}">(Link)</a>`;
    showPrompt(app.name + " Documentation", marked(contents, markedOptions), {ok: true, footer: footerText}, false).catch(() => {});
  }
  httpGet(appPath+app.readme).then(show).catch(()=>show("Failed to load README."));
}
function getAppDescription(app) {
  let appPath = `apps/${app.id}/`;
  let markedOptions = { baseUrl : appPath };
  return marked(app.description, markedOptions);
}

/** Setup IFRAME callbacks for handleCustomApp and handleInterface */
function iframeSetup(options) {
  var iframe = options.iframe;
  var modal = options.modal;
  document.body.append(modal);
  htmlToArray(modal.getElementsByTagName("a")).forEach(button => {
    button.addEventListener("click",event => {
      event.preventDefault();
      modal.remove();
      if (options.onClose) options.onClose("Window closed");
    });
  });
  // when iframe is loaded, call 'onInit' with info about the device
  iframe.addEventListener("load", function() {
    console.log("IFRAME loaded");
    /* if we get a message from the iframe (eg asking to send data to Puck), handle it
    otherwise pass to messageHandler because handleCustomApp may want to handle it */
    iframe.contentWindow.addEventListener("message",function(event) {
      let msg = event.data;
      if (msg.type=="close") {
        modal.remove();
        if (options.onClose) options.onClose("Window closed");
      } else if (msg.type=="eval") {
        Comms.eval(msg.data).then(function(result) {
          iframe.contentWindow.postMessage({
            type : "evalrsp",
            data : result,
            id : msg.id
          });
        }, function(err) {
          showToast("Eval from app loader failed:\n"+err,"error");
          console.warn(err);
        });
      } else if (msg.type=="write") {
        Comms.write(msg.data).then(function(result) {
          iframe.contentWindow.postMessage({
            type : "writersp",
            data : result,
            id : msg.id
          });
        }, function(err) {
          showToast("File Write from app loader failed:\n"+err,"error");
          console.warn(err);
        });
      } else if (msg.type=="readstoragefile") {
        Comms.readStorageFile(msg.filename).then(function(result) {
          iframe.contentWindow.postMessage({
            type : "readstoragefilersp",
            data : result,
            id : msg.id
          });
        }, function(err) {
          showToast("StorageFile Read from app loader failed:\n"+err,"error");
          console.warn(err);
        });
      } else if (msg.type=="readstorage") {
        Comms.readFile(msg.filename).then(function(result) {
          iframe.contentWindow.postMessage({
            type : "readstoragersp",
            data : result,
            id : msg.id
          });
        }, function(err) {
          showToast("File Read from app loader failed:\n"+err,"error");
          console.warn(err);
        });
      } else if (msg.type=="readstoragejson") {
        Comms.readFile(msg.filename).then(function(result) {
          iframe.contentWindow.postMessage({
            type : "readstoragejsonrsp",
            data : Utils.parseRJSON(result),
            id : msg.id
          });
        }, function(err) {
          showToast("JSON File Read from app loader failed:\n"+err,"error");
          console.warn(err);
        });
      } else if (msg.type=="writestorage") {
        Progress.show({title:`Uploading ${JSON.stringify(msg.filename)}`,sticky:true});
        Comms.writeFile(msg.filename, msg.data).then(function() {
          Progress.hide({sticky:true});
          iframe.contentWindow.postMessage({
            type : "writestoragersp",
            id : msg.id
          });
        }, function(err) {
          showToast("StorageFile Write from app loader failed:\n"+err,"error");
          console.warn(err);
        });
      } else if (options.messageHandler) options.messageHandler(event);
    }, false);
    // send the 'init' message
    iframe.contentWindow.postMessage({
      type: "init",
      expectedInterface: options.jsFile,
      data: device
    },"*");
    // Push any data received back through to IFRAME
    if (Comms.isConnected())
    console.log("Adding Comms.on('data') handler for iframe");
      Comms.on("data", data => {
        if (!iframe.contentWindow) {
          // if no frame, disable
          console.log("Removing Comms.on('data') handler");
          Comms.on("data");
          return;
        }
        iframe.contentWindow.postMessage({
          type : "recvdata",
          data : data
        });
    });

  }, false);
}

/** Create window for app customiser */
function handleCustomApp(appTemplate) {
  // Pops up an IFRAME that allows an app to be customised
  if (!appTemplate.custom) throw new Error("App doesn't have custom HTML");
  // if it needs a connection, do that first
  if (appTemplate.customConnect && !device.connected)
    return getInstalledApps().then(() => handleCustomApp(appTemplate));
  // otherwise continue
  return new Promise((resolve,reject) => {
    let modal = htmlElement(`<div class="modal active">
      <a href="#close" class="modal-overlay " aria-label="Close"></a>
      <div class="modal-container" style="height:100%">
        <div class="modal-header">
          <a href="#close" class="btn btn-clear float-right" aria-label="Close"></a>
          <div class="modal-title h5">${escapeHtml(appTemplate.name)}</div>
        </div>
        <div class="modal-body" style="height:100%">
          <div class="content" style="height:100%">
            <iframe src="apps/${appTemplate.id}/${appTemplate.custom}" style="width:100%;height:100%;border:0px;">
          </div>
        </div>
      </div>
    </div>`);
    let iframe = modal.getElementsByTagName("iframe")[0];
    iframeSetup({ iframe : iframe,
                  modal : modal,
                  jsFile : "customize.js",
                  onClose: reject,
                  messageHandler : function(event) {
      let msg = event.data;
      if (msg.type=="app") {
        let appFiles = msg.data;
        let app = JSON.parse(JSON.stringify(appTemplate)); // clone template
        // copy extra keys from appFiles
        Object.keys(appFiles).forEach(k => {
          if (k!="storage") app[k] = appFiles[k]
        });
        appFiles.storage.forEach(f => {
          app.storage = app.storage.filter(s=>s.name!=f.name); // remove existing item
          app.storage.push(f); // add new
        });
        console.log("Received custom app", app);
        modal.remove();

        getInstalledApps()
          .then(()=>checkDependencies(app))
          .then(()=>Comms.uploadApp(app,{device:device, language:LANGUAGE, noFinish: msg.options && msg.options.noFinish}))
          .then(()=>{
            Progress.hide({sticky:true});
            resolve();
          }).catch(err => {
            Progress.hide({sticky:true});
            reject('Upload failed, ' + err, 'error');
          });
      }
    }});
  });
}

/* Create window for app interface page */
function handleAppInterface(app) {
  // IFRAME interface window that can be used to get data from the app
  if (!app.interface) throw new Error("App doesn't have interface HTML");
  return new Promise((resolve,reject) => {
    let modal = htmlElement(`<div class="modal active">
      <a href="#close" class="modal-overlay " aria-label="Close"></a>
      <div class="modal-container" style="height:100%">
        <div class="modal-header">
          <a href="#close" class="btn btn-clear float-right" aria-label="Close"></a>
          <div class="modal-title h5">${escapeHtml(app.name)}</div>
        </div>
        <div class="modal-body" style="height:100%">
          <div class="content" style="height:100%">
            <iframe style="width:100%;height:100%;border:0px;">
          </div>
        </div>
      </div>
    </div>`);
    let iframe = modal.getElementsByTagName("iframe")[0];
    iframeSetup({ iframe : iframe,
                  modal : modal,
                  jsFile : "interface.js",
                  // onClose: reject, // we don't need to reject when the window is closed
                  messageHandler : function(event) {
      // nothing custom needed in here
    }});
    iframe.src = `apps/${app.id}/${app.interface}`;
  });
}

function changeAppFavourite(favourite, app) {
  if (favourite) {
    SETTINGS.favourites = SETTINGS.favourites.concat([app.id]);
  } else {
    SETTINGS.favourites = SETTINGS.favourites.filter(e => e != app.id);
  }
  saveSettings();
  refreshLibrary();
  refreshMyApps();
}

// ===========================================  Top Navigation
function showTab(tabname) {
  htmlToArray(document.querySelectorAll("#tab-navigate .tab-item")).forEach(tab => {
    tab.classList.remove("active");
  });
  htmlToArray(document.querySelectorAll(".apploader-tab")).forEach(tab => {
    tab.style.display = "none";
  });
  document.getElementById("tab-"+tabname).classList.add("active");
  document.getElementById(tabname).style.display = "inherit";
}

let librarySearchInput = document.querySelector("#searchform input");
const searchInputChangedDebounced = debounce(function() {
  refreshLibrary({dontChangeSearchBox:true});
}, 300);
librarySearchInput.addEventListener('input', evt => {
  let searchValue = evt.target.value.toLowerCase();
  // Update window URL
  let c = "";
  let searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("c"))
    c = `c=${encodeURIComponent(searchParams.get("c").toLowerCase())}&`;
  window.history.replaceState(null, null, `?${c}q=${encodeURIComponent(searchValue)}`);
  searchInputChangedDebounced();
});

// =========================================== App Info

function getAppHTML(app, appInstalled, forInterface) {
  let version = getVersionInfo(app, appInstalled);
  let versionInfo = version.text;
  let versionTitle = '';
  let appFavourites;
  if (app.id in appSortInfo) {
    var infoTxt = [];
    var info = appSortInfo[app.id];
    if ("object"==typeof info.modified)
      infoTxt.push(`Last update: ${(info.modified.toLocaleDateString())}`);
    if (info.installs)
      infoTxt.push(`${info.installs} reported installs (${(info.installs / appCounts.installs * 100).toFixed(0)}%)`);
    if (info.favourites) {
      infoTxt.push(`${info.favourites} users favourited (${(info.favourites / appCounts.favs * 100).toFixed(0)}%)`);
      appFavourites = info.favourites;
    }
    if (infoTxt.length)
      versionTitle = `title="${infoTxt.join("\n")}"`;
  }
  if (versionInfo) versionInfo = ` <small ${versionTitle}>(${versionInfo})</small>`;
  let appurl = window.location.origin + window.location.pathname + "?id=" + encodeURIComponent(app.id);
  let readme = `<a class="c-hand" href="${appurl}&readme" onclick="showReadme(event,'${app.id}')">Read more...</a>`;
  let favourite = SETTINGS.favourites.find(e => e == app.id);
  let githubLink = Const.APP_SOURCECODE_URL ?
    `<a href="${Const.APP_SOURCECODE_URL}/${app.id}" target="_blank" class="link-github"><img src="core/img/github-icon-sml.png" alt="See the code on GitHub"/></a>` : "";
  let getAppFavouritesHTML = cnt => {
    if (!cnt) return "";
    var txt = (cnt > 999) ? Math.round(cnt/1000)+"k" : cnt;
    return `<span>${txt}</span>`;
  };

  let html = `<div class="tile column col-6 col-sm-12 col-xs-12 app-tile">
  <div class="tile-icon">
    <figure class="avatar"><img src="apps/${app.icon?`${app.id}/${app.icon}`:"unknown.png"}" alt="${escapeHtml(app.name)}"></figure>
  </div>
  <div class="tile-content">
    <p class="tile-title text-bold"><a name="${appurl}"></a>${escapeHtml(app.name)} ${versionInfo}</p>
    <p class="tile-subtitle">${getAppDescription(app)}${app.readme?`<br/>${readme}`:""}</p>
    ${githubLink}
    <a href="${appurl}" class="link-copy-url" appid="${app.id}" title="Copy link to app" style="position:absolute;top: 56px;left: -24px;"><img src="core/img/copy-icon.png" alt="Copy link to app"/></a>
  </div>
  <div class="tile-action">`;
  if (forInterface=="library") html += `
    <button class="btn btn-link btn-action btn-lg btn-favourite" appid="${app.id}" title="Favourite"><i class="icon icon-favourite${favourite?" icon-favourite-active":""}">${getAppFavouritesHTML(appFavourites)}</i></button>
    <button class="btn btn-link btn-action btn-lg ${(appInstalled&&app.interface)?"":"d-hide"}" appid="${app.id}" title="Download data from app"><i class="icon icon-interface"></i></button>
    <button class="btn btn-link btn-action btn-lg ${app.allow_emulator?"":"d-hide"}" appid="${app.id}" title="Try in Emulator"><i class="icon icon-emulator"></i></button>
    <button class="btn btn-link btn-action btn-lg ${(SETTINGS.alwaysAllowUpdate && appInstalled) || version.canUpdate?"":"d-hide"}" appid="${app.id}" title="Update App"><i class="icon icon-refresh"></i></button>
    <button class="btn btn-link btn-action btn-lg ${(!appInstalled && !app.custom)?"":"d-hide"}" appid="${app.id}" title="Upload App"><i class="icon icon-upload"></i></button>
    <button class="btn btn-link btn-action btn-lg ${appInstalled?"":"d-hide"}" appid="${app.id}" title="Remove App"><i class="icon icon-delete"></i></button>
    <button class="btn btn-link btn-action btn-lg ${app.custom?"":"d-hide"}" appid="${app.id}" title="Customise and Upload App"><i class="icon icon-menu"></i></button>`;
  if (forInterface=="myapps") html += `
    <button class="btn btn-link btn-action btn-lg btn-favourite" appid="${app.id}" title="Favourite"><i class="icon icon-favourite${favourite?" icon-favourite-active":""}">${getAppFavouritesHTML(appFavourites)}</i></button>
    <button class="btn btn-link btn-action btn-lg ${(appInstalled&&app.interface)?"":"d-hide"}" appid="${app.id}" title="Download data from app"><i class="icon icon-interface"></i></button>
    <button class="btn btn-link btn-action btn-lg ${(SETTINGS.alwaysAllowUpdate && appInstalled) || version.canUpdate?'':'d-hide'}" appid="${app.id}" title="Update App"><i class="icon icon-refresh"></i></button>
    <button class="btn btn-link btn-action btn-lg" appid="${app.id}" title="Remove App"><i class="icon icon-delete"></i></button>`;
  html += "</div>";
  if (forInterface=="library") {
    var screenshots = (app.screenshots || []).filter(s=>s.url);
    if (screenshots.length)
      html += `<img class="tile-screenshot" appid="${app.id}" src="${screenshots[0].url}" alt="Screenshot"/>`;
  }
  return html+`</div>`;
}

// =========================================== Library

// Can't use chip.attributes.filterid.value here because Safari/Apple's WebView doesn't handle it
let chips = Array.from(document.querySelectorAll('.filter-nav .chip')).map(chip => chip.getAttribute("filterid"));

/*
 Filter types:
 .../BangleApps/#blue shows apps having "blue" in app.id or app.tag --> searchType:hash
 .../BangleApps/#bluetooth shows apps having "bluetooth" in app.id or app.tag (also selects bluetooth chip) --> searchType:chip
 .../BangleApps/id=antonclk shows app having app.id = antonclk --> searchType:id
 .../BangleApps/q=clock shows apps having "clock" in app.id or app.description --> searchType:full
 .../BangleApps/c=tool shows anything with keyword 'tool' (like cliking the 'Tools' chip) --> searchType:chip

  the input field does full search as well
*/


let activeSort = '';

// Update the sort state to match the current sort value
function refreshSort(){
  let sortContainer = document.querySelector("#librarycontainer .sort-nav");
  sortContainer.querySelector('.active').classList.remove('active');
  if(activeSort) sortContainer.querySelector('.chip[sortid="'+activeSort+'"]').classList.add('active');
  else sortContainer.querySelector('.chip[sortid]').classList.add('active');
}
// Refill the library with apps
function refreshLibrary(options) {
  options = options||{};
  // options.dontChangeSearchBox : bool  -> don't update the value in the search box
  // options.showAll : bool  -> don't restrict the numbers of apps that are shown
  let panelbody = document.querySelector("#librarycontainer .panel-body");
  // Work out what we should be filtering, based on the URL
  let searchType = ""; // possible values: hash, chip, full, id
  let searchValue = ""; // the actual value to search for
  let searchChip = ""; // if a chip was selected, this is the one to use

  if (window.location.hash) {
    searchValue = decodeURIComponent(window.location.hash.slice(1)).toLowerCase();
    searchType = "hash";
  }
  if (window.location.search) {
    let searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has("id")) {
      searchValue = searchParams.get("id").toLowerCase();
      searchType = "id";
    }
    if (searchParams.has("q")) {
      searchValue = searchParams.get("q").toLowerCase();
      searchType = "full";
    }
    if (searchParams.has("c")) {
      searchChip = searchParams.get("c").toLowerCase();
    }
  }
  if (searchType === "hash" && chips.indexOf(searchValue)>=0) {
    searchType = "";
    searchValue = "";
    searchChip = searchValue;
  }
  // Update the 'chips' to match the current window location
  let filtersContainer = document.querySelector("#librarycontainer .filter-nav");
  filtersContainer.querySelector('.active').classList.remove('active');
  if(searchChip) {
    let hashFilter = filtersContainer.querySelector('.chip[filterid="'+searchChip+'"]');
    if (hashFilter) hashFilter.classList.add('active');
  } else filtersContainer.querySelector('.chip[filterid]').classList.add('active');
  // update the search box value
  if (!options.dontChangeSearchBox) {
    if (searchType === "full")
      librarySearchInput.value = searchValue;
    else
      librarySearchInput.value = "";
  }
  // Now filter according to what was set
  let visibleApps = appJSON.slice(); // clone so we don't mess with the original
  let sortedByRelevance = false;
  // filter visibleApps by chip
  let searchResult; // array of { app:app, relevance:number }
  if (searchChip) {
    if (searchChip == "favourites") {
      visibleApps = visibleApps.filter(app => app.id?SETTINGS.favourites.filter(e => e == app.id).length:0);
    } else {
      // Some chips represent a metadata "type" element:
      // - the "Clocks" chip must show only apps with "type": "clock"
      // - the "Widgets" chip must show only apps with "type": "widget"
      // and so on.
      // If the type is NOT in the array below then the search will be tag-based instead
      // of type-based.
      const supportedMetadataTypes = ["clock", "widget", "launch", "textinput", "ram"];
      if (supportedMetadataTypes.includes(searchChip.toLowerCase()))
        visibleApps = visibleApps.filter(app => (app.type||"app").toLowerCase() == searchChip.toLowerCase() );
      else
        visibleApps = visibleApps.filter(app => app.tags && app.tags.split(',').includes(searchChip) );
    }
  }
  // Now do our search, put the values in searchResult
  if (searchValue) {
    if (searchType === "hash") {
      sortedByRelevance = true;
      searchResult = visibleApps.map(app => ({
        app : app,
        relevance :
          searchRelevance(app.id, searchValue) +
          searchRelevance(app.name, searchValue) +
          (app.tags && app.tags.includes(searchValue))
        }));
    } else if (searchType === "id") {
      searchResult = visibleApps.map(app => ({
        app:app,
        relevance: (app.id.toLowerCase() == searchValue) ? 1 : 0
      }));
    } else if (searchType === "full" && searchValue) {
      sortedByRelevance = true;
      searchResult = visibleApps.map(app => ({
        app:app,
        relevance:
          searchRelevance(app.id, searchValue) +
          searchRelevance(app.name, searchValue)*(app.shortName?1:2) +
          (app.shortName?searchRelevance(app.shortName, searchValue):0) + // if we have shortname, match on that as well
          searchRelevance(app.description, searchValue)/5 + // match on description, but pay less attention
          ((app.tags && app.tags.includes(searchValue))?10:0)
        }));
    }
    // Now finally, filter, sort based on relevance and set the search result
    visibleApps = searchResult.filter(a => a.relevance>0).sort((a,b) => (b.relevance-(0|b.sortorder)) - (a.relevance-(0|a.sortorder))).map(a => a.app);
  }
  // if not otherwise sorted, use 'sort by' option
  if (!sortedByRelevance)
    visibleApps.sort(appSorter);

  if (activeSort) {
    if (["created","modified","installs","favourites"].includes(activeSort)) {
      visibleApps = visibleApps.sort((a,b) =>
         ((appSortInfo[b.id]||{})[activeSort]||0) -
         ((appSortInfo[a.id]||{})[activeSort]||0));
    } else throw new Error("Unknown sort type "+activeSort);
  }

  var viewMoreText = "";
  if (!options.showAll && visibleApps.length > Const.MAX_APPS_SHOWN) {
    viewMoreText = `<div class="tile column col-6 col-sm-12 col-xs-12 app-tile" onclick="javascript:refreshLibrary({dontChangeSearchBox:true,showAll:true})" style="cursor: pointer;">
    <div class="tile-icon">
      <figure class="avatar"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAACp0lEQVR4nO1Zu24TQRRd8Sig49Xw+AwQfAA/ABGg0CLSugNSk5A6CkaI8ANBoQBE6w4JaT2XGGfv7N67hU0oIA4tCc2g65CQrL141/sYW/hIR7J2R55z587jzlnHmWCCCTJjxZijdY+uKaRZpWkVkNeVph+g+ZdQfivNTXmnPHrkesFVY8wRxzY+E11SSAsKeQM0mzRUyF8A6claEFwsXbgKgnNK83OleSet8J5ANO8AUvWj550pRzyG00rTVlbhfdj5pOl2YcJd1z0OyC8KEG4Ok57VarVjOYv/ehKQ3hcvnv+sD3onfeY48uWJhwNB5JKJcqYN9ydSNaP48K418Xp/TdwaSrxsa4C8aT8A7rhan00dgOzzIyDe7K4HXkolXk7HPA6pHAPYBt+/kHz0kRZsi4ZezicSL0VWt06xL9hEsrAhRePAAKSqtC0W4uiHV5JMn1nrQnVMFnT4MEkAr20LhXi+GhyA5mbcH7jrvplbWjY37lfMzZmKmX+63H1WdDvYzwA1EgQQXypLB9en7x2iPCu6HewReTNJBmL3fxmpaIfyrOh2sJcB5O1MAUiaox1OzVQKbwfpAkg5haovC28HKafQPxexdCojN2hx5tkOUi7i1QTbmS2ujPVBBpofDAxATKcREGr6T6HwctJirm1bLPSQWondPHHM7AvmKOec/+ZCIxBHwLZw+MtFJy2azfZpQP4+AuI7Q/umdZ/v2A5AYTDlZIF4lWM1daKQe6iNS47S9DY3k1eMVvEqyxPPbz602yecPCGjUdLOtJi7vX4Q4lUWYTkqpG+ZF2yaLVbsvu4Bk1U80k8Z9UajdcopG3I6imM2XO1ELaX5cR3xvGMbUmSJ6SS+jVgfcvGQm52UI7ukLUBak3dSEktVORKfWSeYwBl//AaTJ2VUxIlIxgAAAABJRU5ErkJggg=="></figure>
    </div>
    <div class="tile-content">
    <p class="tile-title text-bold">${Const.MAX_APPS_SHOWN} of ${visibleApps.length} apps shown</p>
    <p class="tile-subtitle"> <a>Tap to show all apps</a></p>
    </div>
  </div>`
    visibleApps = visibleApps.slice(0, Const.MAX_APPS_SHOWN-1);
  }


  panelbody.innerHTML = visibleApps.map((app,idx) => {
    let appInstalled = device.appsInstalled.find(a=>a.id==app.id);
    return getAppHTML(app, appInstalled, "library");
  }).join("\n") + viewMoreText;
  // set badge up top
  let tab = document.querySelector("#tab-librarycontainer a");
  tab.classList.add("badge");
  tab.setAttribute("data-badge", appJSON.length);
  htmlToArray(panelbody.getElementsByTagName("button")).forEach(button => {
    button.addEventListener("click",event => {
      let button = event.currentTarget;
      let icon = button.firstChild;
      let appid = button.getAttribute("appid");
      let app = appNameToApp(appid);
      if (!app) throw new Error("App "+appid+" not found");
      // check icon to figure out what we should do
      if (icon.classList.contains("icon-emulator")) {
        // emulator
        let file = app.storage.find(f=>f.name.endsWith('.js'));
        if (!file) {
          console.error("No entrypoint found for "+appid);
          return;
        }
        let baseurl = window.location.href.replace(/\/[^/]*$/,"/");
        baseurl = baseurl.substr(0,baseurl.lastIndexOf("/"));
        let url = baseurl+"/apps/"+app.id+"/"+file.url;
        window.open(`https://espruino.com/ide/emulator.html?codeurl=${url}&upload`);
      } else if (icon.classList.contains("icon-upload")) {
        // upload
        icon.classList.remove("icon-upload");
        icon.classList.add("loading");
        uploadApp(app);
      } else if (icon.classList.contains("icon-menu")) {
        // custom HTML update
        icon.classList.remove("icon-menu");
        icon.classList.add("loading");
        customApp(app);
      } else if (icon.classList.contains("icon-delete")) {
        // Remove app
        icon.classList.remove("icon-delete");
        icon.classList.add("loading");
        removeApp(app);
      } else if (icon.classList.contains("icon-refresh")) {
        // Update app
        icon.classList.remove("icon-refresh");
        icon.classList.add("loading");
        updateApp(app);
      } else if (icon.classList.contains("icon-interface")) {
        handleAppInterface(app);
      } else if ( button.classList.contains("btn-favourite")) {
        let favourite = SETTINGS.favourites.find(e => e == app.id);
        changeAppFavourite(!favourite, app);
      }
    });
  });
  htmlToArray(panelbody.getElementsByClassName("tile-screenshot")).forEach(screenshot => {
    screenshot.addEventListener("click",event => {
      let icon = event.currentTarget;
      let appid = icon.getAttribute("appid");
      showScreenshots(appid);
    });
  });
  htmlToArray(panelbody.getElementsByClassName("link-copy-url")).forEach(link => {
    link.addEventListener("click",event => {
      event.preventDefault();
      let link = event.currentTarget;
      let appid = link.getAttribute("appid");
      let app = appNameToApp(appid);
      if (!app) throw new Error("App "+appid+" not found");
      const url = window.location.origin + window.location.pathname + "?id=" + appid;
      navigator.clipboard.writeText(url).then(function() {
        showToast("Link to app " + app.name + " copied to clipboard.","success");
      }, function(err) {
        console.error('Could not copy link to clipboard.', err);
      });
    });
  });
}

function showScreenshots(appId) {
  let app = appJSON.find(app=>app.id==appId);
  if (!app || !app.screenshots) return;
  var screenshots = app.screenshots.filter(s=>s.url);
  showPrompt(app.name+" Screenshots",`<div class="columns">
    ${screenshots.map(s=>`
    <div class="column col-4">
      <div class="card">
        <div class="card-image">
          <img src="${s.url}" alt="Screenshot" class="img-responsive">
        </div>
      </div>
    </div>`).join("\n")}
  </div>`,{ok:true},false);
}

// =========================================== My Apps

function uploadApp(app, options) {
  options = options||{};
  if (app.type == "defaultconfig" && !options.force) {
    return showPrompt("Default Configuration Install","<b>This will remove all apps and data from your Bangle</b> and will install a new set of apps. Please ensure you have backed up your Bangle first. Continue?",{yes:1,no:1},false)
    .then(() => showPrompt("Device Erasure","<b>Everything will be deleted from your Bangle.</b> Are you really sure?",{yes:1,no:1},false))
    .then(() => Comms.removeAllApps())
    .then(() => uploadApp(app, {force:true}))
    .catch(err => {
      showToast("Configuration install failed, "+err,"error");
      refreshMyApps();
      refreshLibrary();
    });
  }

  return getInstalledApps().then(()=>{
    if (device.appsInstalled.some(i => i.id === app.id)) {
      return updateApp(app);
    }
    return checkDependencies(app)
      .then(()=>Comms.uploadApp(app,{device:device, language:LANGUAGE}))
      .then((appJSON) => {
        Progress.hide({ sticky: true });
        if (appJSON) {
          device.appsInstalled.push(appJSON);
        }
        showToast(app.name + ' Uploaded!', 'success');
      }).catch(err => {
        Progress.hide({ sticky: true });
        showToast('Upload failed, ' + err, 'error');
      }).finally(()=>{
        refreshMyApps();
        refreshLibrary();
      });
  }).catch(err => {
    showToast("App Upload failed, "+err,"error");
    // remove loading indicator
    refreshMyApps();
    refreshLibrary();
  });
}

function removeApp(app) {
  return showPrompt("Delete","Really remove '"+app.name+"'?").then(() => {
    return getInstalledApps().then(()=>{
      // a = from appid.info, app = from apps.json
      return Comms.removeApp(device.appsInstalled.find(a => a.id === app.id));
    });
  }).then(()=>{
    device.appsInstalled = device.appsInstalled.filter(a=>a.id!=app.id);
    showToast(app.name+" removed successfully","success");
    refreshMyApps();
    refreshLibrary();
  }, err=>{
    showToast(app.name+" removal failed, "+err,"error");
  });
}

function customApp(app) {
  return handleCustomApp(app).then((appJSON) => {
    if (appJSON) device.appsInstalled.push(appJSON);
    showToast(app.name+" Uploaded!", "success");
    refreshMyApps();
    refreshLibrary();
  }).catch(err => {
    showToast("Customise failed, "+err, "error");
    refreshMyApps();
    refreshLibrary();
  });
}

/* check for dependencies the app needs and install them if required
uploadOptions is an object, see AppInfo.checkDependencies for what can be in it
*/
function checkDependencies(app, uploadOptions) {
  uploadOptions = uploadOptions||{};
  uploadOptions.apps = appJSON;
  uploadOptions.device = device;
  uploadOptions.language = LANGUAGE;
  uploadOptions.showQuery = function(msg, appToRemove) {
    return new Promise((resolve,reject) => {
      let modal = htmlElement(`<div class="modal active">
        <a href="#close" class="modal-overlay " aria-label="Close"></a>
        <div class="modal-container">
          <div class="modal-header">
            <a href="#close" class="btn btn-clear float-right" aria-label="Close"></a>
            <div class="modal-title h5">App Dependencies</div>
          </div>
          <div class="modal-body">
            <div class="content">
              ${msg}. What would you like to do?
            </div>
          </div>
          <div class="modal-footer">
            <a href="#" class="btn btn-primary btn-replace" btnType="replace">Replace</a>
            <a href="#" class="btn btn-cancel">Cancel</a>
            <a href="#" class="btn btn-keep">Keep Both</a>
          </div>
        </div>
      </div>`);
      document.body.append(modal);
      htmlToArray(modal.getElementsByTagName("a")).forEach(button => {
        button.addEventListener("click",event => {
          event.preventDefault();
          modal.remove();
          if (event.target.classList.contains("btn-replace")) {
            // replace the old one - just remove it
            Comms.removeApp(appToRemove).then(() => {
              device.appsInstalled = device.appsInstalled.filter(a=>a.id!=appToRemove.id);
              resolve()
            });
          } else if (event.target.classList.contains("btn-keep")) {
            // Keep both - we'll just continue as-is
            resolve();
          } else { // was probably close/cancel
            reject("User cancelled");
          }
        });
      });
    });
  };
  uploadOptions.needsApp = (app,uploadOptions) => Comms.uploadApp(app,uploadOptions);
  return AppInfo.checkDependencies(app, device, uploadOptions);
}

/* Update an app to latest version.
if options.noReset is true, don't reset the device before
if options.noFinish is true, showUploadFinished isn't called (displaying the reboot message) */
function updateApp(app, options) {
  options = options||{};
  if (app.custom) return customApp(app);
  return Comms.getAppInfo(app).then(remove => {
    // remove = from appid.info, app = from apps.json
    if (remove.files===undefined) remove.files="";
    // no need to remove files which will be overwritten anyway
    remove.files = remove.files.split(',')
      .filter(f => f !== app.id + '.info')
      .filter(f => !app.storage.some(s => s.name === f))
      .join(',');
    let data = AppInfo.parseDataString(remove.data)
    if ('data' in app) {
      // only remove data files which are no longer declared in new app version
      const removeData = (f) => !app.data.some(d => (d.name || d.wildcard)===f)
      data.dataFiles = data.dataFiles.filter(removeData)
      data.storageFiles = data.storageFiles.filter(removeData)
    }
    remove.data = AppInfo.makeDataString(data)
    return Comms.removeApp(remove, {containsFileList:true, noReset:options.noReset, noFinish:options.noFinish});
  }).then(()=>{
    showToast(`Updating ${app.name}...`);
    device.appsInstalled = device.appsInstalled.filter(a=>a.id!=app.id);
    return checkDependencies(app,{checkForClashes:false});
  }).then(()=>Comms.uploadApp(app,{device:device,language:LANGUAGE,noReset:options.noReset, noFinish:options.noFinish})
  ).then((appJSON) => {
    if (appJSON) device.appsInstalled.push(appJSON);
    showToast(app.name+" Updated!", "success");
    refreshMyApps();
    refreshLibrary();
  }, err=>{
    showToast(app.name+" update failed, "+err,"error");
    refreshMyApps();
    refreshLibrary();
  });
}



function appNameToApp(appName) {
  let app = appJSON.find(app=>app.id==appName);
  if (app) return app;
  /* If app not known, add just one file
  which is the JSON - so we'll remove it from
  the menu but may not get rid of all files. */
  return { id: appName,
    name: "Unknown app "+appName,
    icon: "../unknown.png",
    description: "Unknown app",
    storage: [ {name:appName+".info"}],
    unknown: true,
  };
}

function showLoadingIndicator(id) {
  let panelbody = document.querySelector(`#${id} .panel-body`);
  let tab = document.querySelector(`#tab-${id} a`);
  // set badge up top
  tab.classList.add("badge");
  tab.setAttribute("data-badge", "");
  // Loading indicator
  panelbody.innerHTML = '<div class="tile column col-12"><div class="tile-content" style="min-height:48px;"><div class="loading loading-lg"></div></div></div>';
}

function getAppsToUpdate(options) {
  options = options || {}; // excludeCustomApps
  let appsToUpdate = [];
  device.appsInstalled.forEach(appInstalled => {
    let app = appNameToApp(appInstalled.id);
    appInstalled.canUpdate = isAppUpdateable(appInstalled, app) && (!options.excludeCustomApps || app.custom === undefined);
    if (appInstalled.canUpdate) {
      appsToUpdate.push(app);
    }
  });
  return appsToUpdate;
}

function refreshMyApps() {
  // if we've got a callback, call it first
  if ("function"==typeof onRefreshMyApps)
    onRefreshMyApps();
  // Now update...
  let panelbody = document.querySelector("#myappscontainer .panel-body");
  let appsToUpdate = getAppsToUpdate(); // this writes canUpdate attributes to apps in device.appsInstalled
  panelbody.innerHTML = device.appsInstalled.sort(appSorterUpdatesFirst).map(appInstalled => {
    let app = appNameToApp(appInstalled.id);
    return getAppHTML(app, appInstalled, "myapps");
  }).join("");
  htmlToArray(panelbody.getElementsByTagName("button")).forEach(button => {
    button.addEventListener("click",event => {
      let button = event.currentTarget;
      let icon = button.firstChild;
      let appid = button.getAttribute("appid");
      let app = appNameToApp(appid);
      if (!app) throw new Error("App "+appid+" not found");
      // check icon to figure out what we should do
      if (icon.classList.contains("icon-delete")) removeApp(app);
      if (icon.classList.contains("icon-refresh")) updateApp(app);
      if (icon.classList.contains("icon-interface")) handleAppInterface(app);
      if (icon.classList.contains("icon-favourite")) {
          let favourite = SETTINGS.favourites.find(e => e == app.id);
          changeAppFavourite(!favourite, app);
      }
    });
  });
  let nonCustomAppsToUpdate = getAppsToUpdate({excludeCustomApps:true});
  let tab = document.querySelector("#tab-myappscontainer a");
  let updateApps = document.querySelector("#myappscontainer .updateapps");
  if (nonCustomAppsToUpdate.length) {
    updateApps.innerHTML = `Update ${nonCustomAppsToUpdate.length} apps`;
    updateApps.classList.remove("hidden");
    updateApps.classList.remove("disabled");
    tab.setAttribute("data-badge", `${device.appsInstalled.length} ⬆${nonCustomAppsToUpdate.length}`);
  } else if (appsToUpdate.length) {
    updateApps.classList.add("disabled");
    updateApps.classList.remove("hidden");
    updateApps.innerHTML = `${appsToUpdate.length} custom app needs manual update`;
  } else {
    updateApps.classList.add("hidden");
    updateApps.classList.remove("disabled");
    tab.setAttribute("data-badge", device.appsInstalled.length);
  }
}

let haveInstalledApps = false;
function getInstalledApps(refresh) {
  if (haveInstalledApps && !refresh) {
    return Promise.resolve(device.appsInstalled);
  }
  showLoadingIndicator("myappscontainer");
  // Get apps and files
  return Comms.getDeviceInfo()
    .then(info => {
      device.uid = info.uid;
      device.id = info.id;
      device.version = info.version;
      device.exptr = info.exptr;
      device.modules = info.modules||[];
      device.storageStats = info.storageStats;
      device.appsInstalled = info.apps;
      haveInstalledApps = true;
      if ("function"==typeof onFoundDeviceInfo)
        onFoundDeviceInfo(device.id, device.version);
      device.info = DEVICEINFO.find(d=>d.id==device.id);
      refreshMyApps();
      refreshLibrary();
      // if the time is obviously wrong, set it up!
      console.log("Current device time is "+new Date(info.currentTime));
      if (info.currentTime < new Date("2000").getTime()) {
        console.log("Time is not set - updating it.");
        return Comms.setTime();
      }
      if (SETTINGS["settime"] && Math.abs(Date.now()-info.currentTime)>2000) {
        console.log("SETTINGS.settime=true and >2 seconds out - updating time");
        return Comms.setTime();
      }
    })
    .then(() => {
      // Show device info in more page:
      const deviceInfoElem = document.getElementById("more-deviceinfo");
      if (deviceInfoElem) {
        deviceInfoElem.style.display = "inherit";
        let storageRow = "";
        if (device.storageStats?.totalBytes) {
          const stats = device.storageStats;
          const totalKB = (stats.totalBytes / 1000).toFixed(2);
          const usedKB = (stats.fileBytes / 1000).toFixed(2);
          const trashKB = (stats.trashBytes / 1000).toFixed(2);
          const freeKB = (stats.freeBytes / 1000).toFixed(2);
          const bytePrc = 100 / stats.totalBytes;
          const usedPrc = bytePrc * stats.fileBytes;
          const trashPrc = bytePrc * stats.trashBytes;
          const freePrc = bytePrc * stats.freeBytes;
          if (isNaN(usedPrc) || isNaN(trashPrc) || isNaN(freePrc)) {
            console.error("Unexpected error: Could not calculate storage statistics");
          } else {
            storageRow = `
<tr><td><b>Storage</b></td><td>
  <p style="margin-bottom:.4rem;">${totalKB} KiB in total, ${stats.fileCount} files used, ${stats.trashCount} files trashed.</p>
  <div class="bar" style="margin-bottom:.3rem;">
    <!-- These styles prevent overflow of text if the bar item is too small to fit all the text -->
    <style>.bar-item{white-space:nowrap;padding-left:.1rem;padding-right:.1rem;}</style>
    <div class="bar-item tooltip bg-error"   data-tooltip="${usedKB} KiB, ${usedPrc.toFixed(2)}% used"    style="width:${usedPrc}%; color:hsl(218 16% 2%)">${usedPrc.toFixed(0)}% used</div>
    <div class="bar-item tooltip bg-warning" data-tooltip="${trashKB} KiB, ${trashPrc.toFixed(2)}% trash" style="width:${trashPrc}%;color:hsl(218 16% 7%)">${trashPrc.toFixed(0)}% trash</div>
    <div class="bar-item tooltip bg-success" data-tooltip="${freeKB} KiB, ${freePrc.toFixed(2)}% free"    style="width:${freePrc}%; color:hsl(218 16% 7%)">${freePrc.toFixed(0)}% free</div>
  </div>
</td></tr>`;
          }
        }
        const deviceInfoContentElem = document.getElementById("more-deviceinfo-content");
        deviceInfoContentElem.innerHTML = `
<table class="table"><tbody>
  <tr><td><b>Device Type</b></td><td>${device.id}</td></tr>
  <tr><td><b>Firmware Version</b></td><td>${device.version}</td></tr>
  ${storageRow}
  <tr><td><b>Apps Installed</b></td><td>${(device.appsInstalled || []).map(a => `${a.id} (${a.version})`).join(", ")}</td></tr>
</tbody></table>`;
      }
    })
    .then(() => handleConnectionChange(true))
    .then(() => device.appsInstalled);
}

/// Removes everything and install the given apps, eg: installMultipleApps(["boot","mclock"], "minimal")
function installMultipleApps(appIds, promptName) {
  let apps = appIds.map( appid => appJSON.find(app=>app.id==appid) );
  if (apps.some(x=>x===undefined))
    return Promise.reject("Not all apps found, missing "+appIds.filter(appid => appJSON.find(app=>app.id==appid)===undefined ).join(","));
  let appCount = apps.length;
  return showPrompt("Install Defaults",`Remove everything and install ${promptName} apps?`).then(() => {
    return Comms.removeAllApps();
  }).then(()=>{
    Progress.hide({sticky:true});
    device.appsInstalled = [];
    showToast(`Existing apps removed. Installing  ${appCount} apps...`);
    return new Promise((resolve,reject) => {
      function upload() {
        let app = apps.shift();
        if (app===undefined) return resolve();
        Progress.show({title:`${app.name} (${appCount-apps.length}/${appCount})`,sticky:true});
        checkDependencies(app,{device:device, noReset:true, noFinish:true})
          .then(()=>Comms.uploadApp(app,{device:device, language:LANGUAGE, noReset:true, noFinish:true}))
          .then((appJSON) => {
            Progress.hide({sticky:true});
            if (appJSON) device.appsInstalled.push(appJSON);
            showToast(`(${appCount-apps.length}/${appCount}) ${app.name} Uploaded`);
            upload();
          }).catch(function() {
            Progress.hide({sticky:true});
            reject();
          });
      }
      upload();
    });
  }).then(()=> Comms.setTime()
  ).then(()=> Comms.showUploadFinished()
  ).then(()=>{
    showToast("Apps successfully installed!","success");
    return getInstalledApps(true);
  });
}

function updateAllApps() {
  let appsToUpdate = getAppsToUpdate({excludeCustomApps:true});
  // get apps - don't auto-update custom apps since they need the
  // customiser page running
  let count = appsToUpdate.length;
  if (!count) {
    showToast("Update failed, no apps can be updated","error");
    return;
  }
  function updater() {
    if (!appsToUpdate.length) return Promise.resolve("Success");
    let app = appsToUpdate.pop();
    return updateApp(app, {noReset:true,noFinish:true}).then(function() {
      return updater();
    });
  }
  Comms.reset().then(_ =>
    updater()
  ).then(_ =>
    Comms.showUploadFinished()
  ).then(_ => {
    showToast(`Updated ${count} apps`,"success");
  }).catch(err => {
    showToast("Update failed, "+err,"error");
  });
}

let connectMyDeviceBtn = document.getElementById("connectmydevice");

function handleConnectionChange(connected) {
  device.connected = connected;
  connectMyDeviceBtn.textContent = connected ? 'Disconnect' : 'Connect';
  connectMyDeviceBtn.classList.toggle('is-connected', connected);
  if (!connected) {
    haveInstalledApps = false;
    device.appsInstalled = [];
    refreshMyApps();
    refreshLibrary();
  }
}

htmlToArray(document.querySelectorAll(".btn.refresh")).map(button => button.addEventListener("click", () => {
  getInstalledApps(true).catch(err => {
    showToast("Getting app list failed, "+err,"error");
  });
}));
htmlToArray(document.querySelectorAll(".btn.updateapps")).map(button => button.addEventListener("click", () => {
  updateAllApps();
}));
connectMyDeviceBtn.addEventListener("click", () => {
  if (connectMyDeviceBtn.classList.contains('is-connected')) {
    Comms.disconnectDevice();
    const deviceInfoElem = document.getElementById("more-deviceinfo");
    if (deviceInfoElem) deviceInfoElem.style.display = "none";
  } else {
    getInstalledApps(true).catch(err => {
      showToast("Device connection failed, "+err,"error");
      Comms.disconnectDevice();
    });
  }
});
Comms.watchConnectionChange(handleConnectionChange);

// Handle the 'chips'
let filtersContainer = document.querySelector("#librarycontainer .filter-nav");
filtersContainer.addEventListener('click', ({ target }) => {
  if (target.classList.contains('active')) return;

  var filterName = target.getAttribute('filterid') || '';
  // Update window URL
  window.history.replaceState(null, null, "?c=" + filterName);
  refreshLibrary();
});

let sortContainer = document.querySelector("#librarycontainer .sort-nav");
sortContainer.addEventListener('click', ({ target }) => {
  if (target.classList.contains('active')) return;
  activeSort = target.getAttribute('sortid') || '';
  refreshSort();
  refreshLibrary();
});

// =========================================== About

// Settings
let SETTINGS_HOOKS = {}; // stuff to get called when a setting is loaded
/// Load settings and update controls
function loadSettings() {
  let j = localStorage.getItem("settings");
  if (typeof j != "string") return;
  try {
    let s = JSON.parse(j);
    Object.keys(s).forEach( k => {
      SETTINGS[k]=s[k];
      if (SETTINGS_HOOKS[k]) SETTINGS_HOOKS[k]();
    } );
  } catch (e) {
    console.error("Invalid settings");
  }
}
/// Save settings
function saveSettings() {
  localStorage.setItem("settings", JSON.stringify(SETTINGS));
  console.log("Changed settings", SETTINGS);
}
// Link in settings DOM elements
function settingsCheckbox(id, name) {
  let setting = document.getElementById(id);
  if (setting===null) return; // no setting found
  function update() {
    setting.checked = SETTINGS[name];
  }
  SETTINGS_HOOKS[name] = update;
  update(); // set initial value
  setting.addEventListener('click', function() {
    SETTINGS[name] = setting.checked;
    saveSettings();
  });
}
settingsCheckbox("settings-pretokenise", "pretokenise");
settingsCheckbox("settings-minify", "minify");
settingsCheckbox("settings-settime", "settime");
settingsCheckbox("settings-alwaysAllowUpdate", "alwaysAllowUpdate");
settingsCheckbox("settings-autoReload", "autoReload");
settingsCheckbox("settings-nopacket", "noPackets");
loadSettings();

let btn;

btn = document.getElementById("defaultsettings");
if (btn) btn.addEventListener("click",event=>{
  SETTINGS = JSON.parse(JSON.stringify(DEFAULTSETTINGS)); // clone
  saveSettings();
  loadSettings(); // update all settings
  refreshLibrary(); // favourites were in settings
});

btn = document.getElementById("resetwatch");
if (btn) btn.addEventListener("click",event=>{
  Comms.resetDevice().then(()=>{
    showToast("Reset watch successfully","success");
  }, err=>{
    showToast("Error resetting watch: "+err,"error");
  });
});
btn = document.getElementById("settime");
if (btn) btn.addEventListener("click",event=>{
  Comms.setTime().then(()=>{
    showToast("Time set successfully","success");
  }, err=>{
    showToast("Error setting time, "+err,"error");
  });
});
btn = document.getElementById("removeall");
if (btn) btn.addEventListener("click",event=>{
  showPrompt("Remove All","Really remove all apps?").then(() => {
    return Comms.removeAllApps();
  }).then(()=>{
    Progress.hide({sticky:true});
    device.appsInstalled = [];
    showToast("All apps removed","success");
    return getInstalledApps(true);
  }).catch(err=>{
    Progress.hide({sticky:true});
    showToast("App removal failed, "+err,"error");
  });
});

// Install all favourite apps in one go
btn = document.getElementById("installfavourite");
if (btn) btn.addEventListener("click",event=>{
    let nonCustomFavourites = SETTINGS.favourites.filter(appId => appJSON.find(app => app.id === appId && !app.custom));
    const mustHave = [ "boot","setting" ]; // apps that we absolutely need installed
    mustHave.forEach(id => {
      if (!nonCustomFavourites.includes(id))
        nonCustomFavourites.unshift(id);
    });
    installMultipleApps(nonCustomFavourites, "favourite").catch(err=>{
    Progress.hide({sticky:true});
    showToast("App Install failed, "+err,"error");
  });
});

// Create a new issue on github
btn = document.getElementById("newGithubIssue");
if (btn) btn.addEventListener("click", event => {
  const urlTemplate = "https://github.com/espruino/BangleApps/issues/new?template=bangle-bug-report-custom-form.yaml&fwversion={version}&apps={apps}";
  const apps = (device.appsInstalled || []).map(a => `${a.id} (${a.version})`).join("\n");
  const version = device.connected ? device.version : "";

  const url = urlTemplate.replace("{version}", encodeURIComponent(version)).replace("{apps}", encodeURIComponent(apps));

  window.open(url, '_blank');
});

// Streaming screenshot image decoder
function createStreamingImageDecoder() {
  // Constants from imageconverter.js
  const PALETTE = {
    MAC16: [
      0x000000, 0x444444, 0x888888, 0xBBBBBB,
      0x996633, 0x663300, 0x006600, 0x00aa00,
      0x0099ff, 0x0000cc, 0x330099, 0xff0099,
      0xdd0000, 0xff6600, 0xffff00, 0xffffff
    ],
    WEB: [0x000000,0x000033,0x000066,0x000099,0x0000cc,0x0000ff,0x003300,0x003333,0x003366,0x003399,0x0033cc,0x0033ff,0x006600,0x006633,0x006666,0x006699,0x0066cc,0x0066ff,0x009900,0x009933,0x009966,0x009999,0x0099cc,0x0099ff,0x00cc00,0x00cc33,0x00cc66,0x00cc99,0x00cccc,0x00ccff,0x00ff00,0x00ff33,0x00ff66,0x00ff99,0x00ffcc,0x00ffff,0x330000,0x330033,0x330066,0x330099,0x3300cc,0x3300ff,0x333300,0x333333,0x333366,0x333399,0x3333cc,0x3333ff,0x336600,0x336633,0x336666,0x336699,0x3366cc,0x3366ff,0x339900,0x339933,0x339966,0x339999,0x3399cc,0x3399ff,0x33cc00,0x33cc33,0x33cc66,0x33cc99,0x33cccc,0x33ccff,0x33ff00,0x33ff33,0x33ff66,0x33ff99,0x33ffcc,0x33ffff,0x660000,0x660033,0x660066,0x660099,0x6600cc,0x6600ff,0x663300,0x663333,0x663366,0x663399,0x6633cc,0x6633ff,0x666600,0x666633,0x666666,0x666699,0x6666cc,0x6666ff,0x669900,0x669933,0x669966,0x669999,0x6699cc,0x6699ff,0x66cc00,0x66cc33,0x66cc66,0x66cc99,0x66cccc,0x66ccff,0x66ff00,0x66ff33,0x66ff66,0x66ff99,0x66ffcc,0x66ffff,0x990000,0x990033,0x990066,0x990099,0x9900cc,0x9900ff,0x993300,0x993333,0x993366,0x993399,0x9933cc,0x9933ff,0x996600,0x996633,0x996666,0x996699,0x9966cc,0x9966ff,0x999900,0x999933,0x999966,0x999999,0x9999cc,0x9999ff,0x99cc00,0x99cc33,0x99cc66,0x99cc99,0x99cccc,0x99ccff,0x99ff00,0x99ff33,0x99ff66,0x99ff99,0x99ffcc,0x99ffff,0xcc0000,0xcc0033,0xcc0066,0xcc0099,0xcc00cc,0xcc00ff,0xcc3300,0xcc3333,0xcc3366,0xcc3399,0xcc33cc,0xcc33ff,0xcc6600,0xcc6633,0xcc6666,0xcc6699,0xcc66cc,0xcc66ff,0xcc9900,0xcc9933,0xcc9966,0xcc9999,0xcc99cc,0xcc99ff,0xcccc00,0xcccc33,0xcccc66,0xcccc99,0xcccccc,0xccccff,0xccff00,0xccff33,0xccff66,0xccff99,0xccffcc,0xccffff,0xff0000,0xff0033,0xff0066,0xff0099,0xff00cc,0xff00ff,0xff3300,0xff3333,0xff3366,0xff3399,0xff33cc,0xff33ff,0xff6600,0xff6633,0xff6666,0xff6699,0xff66cc,0xff66ff,0xff9900,0xff9933,0xff9966,0xff9999,0xff99cc,0xff99ff,0xffcc00,0xffcc33,0xffcc66,0xffcc99,0xffcccc,0xffccff,0xffff00,0xffff33,0xffff66,0xffff99,0xffffcc,0xffffff]
  };

  const FORMATS = {
    "1bit": {
      bpp: 1,
      toRGBA: function(c) {
        return c ? 0xFFFFFFFF : 0xFF000000;
      }
    },
    "2bitbw": {
      bpp: 2,
      toRGBA: function(c) {
        c = c & 3;
        c = c | (c << 2) | (c << 4) | (c << 6);
        return 0xFF000000 | (c << 16) | (c << 8) | c;
      }
    },
    "3bit": {
      bpp: 3,
      toRGBA: function(c) {
        return ((c & 1 ? 0x0000FF : 0x000000) |
                (c & 2 ? 0x00FF00 : 0x000000) |
                (c & 4 ? 0xFF0000 : 0x000000) |
                0xFF000000);
      }
    },
    "4bitmac": {
      bpp: 4,
      toRGBA: function(c) {
        return 0xFF000000 | PALETTE.MAC16[c];
      }
    },
    "web": {
      bpp: 8,
      toRGBA: function(c) {
        return 0xFF000000 | PALETTE.WEB[c];
      }
    },
    "rgb565": {
      bpp: 16,
      toRGBA: function(c) {
        var r = (c >> 11) & 0x1F;
        var g = (c >> 5) & 0x3F;
        var b = c & 0x1F;
        r = (r << 3) | (r >> 2);
        g = (g << 2) | (g >> 4);
        b = (b << 3) | (b >> 2);
        return 0xFF000000 | (r << 16) | (g << 8) | b;
      }
    }
  };

  const BPP_TO_COLOR_FORMAT = {
    1: "1bit",
    2: "2bitbw",
    3: "3bit",
    4: "4bitmac",
    8: "web",
    16: "rgb565"
  };

  return {
    buffer: "",
    canvas: null,
    ctx: null,
    imageData: null,
    rgba: null,
    width: 0,
    height: 0,
    bpp: 0,
    transparentCol: -1,
    fmt: null,
    bitmapSize: 0,
    headerParsed: false,
    pixelIndex: 0,
    nibits: 0,
    nidata: 0,
    dataStartIndex: 0,
    bytesRead: 0, // Track bytes consumed from data section

    // Process incoming data chunk
    processChunk: function(data) {
      this.buffer += data;
      
      if (!this.headerParsed) {
        if (!this.parseHeader()) {
          return false; // Need more data for header
        }
      }

      // Render available pixels
      this.renderPixels();
      return true;
    },

    // Parse image header from buffer
    parseHeader: function() {
      if (this.buffer.length < 3) return false;

      let p = 0;
      this.width = this.buffer.charCodeAt(p++) & 0xFF;
      this.height = this.buffer.charCodeAt(p++) & 0xFF;
      this.bpp = this.buffer.charCodeAt(p++) & 0xFF;
      
      if (this.bpp & 128) {
        if (this.buffer.length < 4) return false;
        this.bpp &= 127;
        this.transparentCol = this.buffer.charCodeAt(p++) & 0xFF;
      }

      const mode = BPP_TO_COLOR_FORMAT[this.bpp];
      if (!mode) {
        console.error("Unknown image format with bpp:", this.bpp);
        return false;
      }

      this.fmt = FORMATS[mode];
      this.bitmapSize = ((this.width * this.height * this.bpp) + 7) >> 3;
      this.dataStartIndex = p;
      this.headerParsed = true;

      // Create canvas and context
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext("2d");
      this.imageData = this.ctx.getImageData(0, 0, this.width, this.height);
      this.rgba = this.imageData.data;

      console.log(`Image header parsed: ${this.width}x${this.height}, ${this.bpp}bpp, expected size: ${this.bitmapSize}`);
      return true;
    },

    // Render pixels from available data
    renderPixels: function() {
      if (!this.headerParsed) return;

      const totalPixels = this.width * this.height;
      let p = this.dataStartIndex + this.bytesRead;

      // Continue from where we left off
      while (this.pixelIndex < totalPixels) {
        // Accumulate bits for this pixel
        while (this.nibits < this.bpp && p < this.buffer.length) {
          this.nidata = (this.nidata << 8) | (this.buffer.charCodeAt(p++) & 0xFF);
          this.nibits += 8;
          this.bytesRead = p - this.dataStartIndex;
        }

        if (this.nibits >= this.bpp) {
          // Extract pixel value
          const c = (this.nidata >> (this.nibits - this.bpp)) & ((1 << this.bpp) - 1);
          this.nibits -= this.bpp;

          // Convert to RGBA
          let cr = this.fmt.toRGBA(c);
          if (c === this.transparentCol) {
            cr = cr & 0xFFFFFF; // Remove alpha
          }

          // Set pixel in image data
          const rgbaIndex = this.pixelIndex * 4;
          this.rgba[rgbaIndex] = (cr >> 16) & 255; // r
          this.rgba[rgbaIndex + 1] = (cr >> 8) & 255; // g
          this.rgba[rgbaIndex + 2] = cr & 255; // b
          this.rgba[rgbaIndex + 3] = cr >>> 24; // a

          this.pixelIndex++;
        } else {
          // Need more data
          break;
        }
      }

      // Update canvas with rendered pixels
      if (this.pixelIndex > 0) {
        this.ctx.putImageData(this.imageData, 0, 0);
      }
    },

    // Check if image is complete
    isComplete: function() {
      return this.headerParsed && 
             this.buffer.length >= this.dataStartIndex + this.bitmapSize &&
             this.pixelIndex >= this.width * this.height;
    },

    // Get current progress percentage
    getProgress: function() {
      if (!this.headerParsed) return 0;
      const totalPixels = this.width * this.height;
      return Math.floor((this.pixelIndex / totalPixels) * 100);
    },

    // Get final canvas as data URL
    getDataURL: function() {
      return this.canvas ? this.canvas.toDataURL() : null;
    }
  };
}

// Screenshot button
btn = document.getElementById("screenshot");
if (btn) btn.addEventListener("click",event=>{
  getInstalledApps(false).then(()=>{
    if (device.id=="BANGLEJS"){
      showPrompt("Screenshot","Screenshots are not supported on Bangle.js 1",{ok:1});
    } else {
      let decoder = createStreamingImageDecoder();
      let dataListener = null;
      let screenshotTimeout = null;
      
      Progress.show({title:"Starting screenshot",percent:0,sticky:true});
      
      // Set up data listener for streaming
      dataListener = function(data) {
        try {
          if (decoder.processChunk(data)) {
            const progress = decoder.getProgress();
            Progress.show({title:`Receiving screenshot... ${progress}%`,percent:progress,sticky:true});
            
            if (decoder.isComplete()) {
              // Screenshot complete
              clearTimeout(screenshotTimeout);
              Comms.on("data", undefined); // Remove data listener
              
              const url = decoder.getDataURL();
              Progress.show({title:"Screenshot complete",percent:100,sticky:true});
              
              let screenshotHtml = `
                <div style="text-align: center;">
                  <img align="center" src="${url}"></img>
                </div>
              `;

              showPrompt("Save Screenshot?",screenshotHtml, undefined, false).then((r)=>{
                Progress.show({title:"Saving screenshot",percent:99,sticky:true});
                let link = document.createElement("a");
                link.download = "screenshot.png";
                link.target = "_blank";
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                Progress.hide({sticky:true});
              }).catch(() => {
                Progress.hide({sticky:true}); // cancelled
              });
            }
          }
        } catch (err) {
          console.error("Error processing screenshot data:", err);
          clearTimeout(screenshotTimeout);
          Comms.on("data", undefined); // Remove data listener
          Progress.hide({sticky:true});
          showToast("Error processing screenshot: " + err, "error");
        }
      };
      
      // Set up timeout as fallback (60 seconds)
      screenshotTimeout = setTimeout(() => {
        Comms.on("data", undefined); // Remove data listener
        Progress.hide({sticky:true});
        showToast("Screenshot timeout - please try again", "error");
      }, 60000);
      
      // Start listening for data
      Comms.on("data", dataListener);
      
      // Send the dump command
      Comms.write("\x10g.dump();\n").catch(err => {
        clearTimeout(screenshotTimeout);
        Comms.on("data", undefined); // Remove data listener
        Progress.hide({sticky:true});
        showToast("Error sending screenshot command: " + err, "error");
      });
    }
  });
});

// Upload files button
btn = document.getElementById("uploadfiles");
if (btn) btn.addEventListener("click",event=>{
  showFileUploadPrompt();
});

function showFileUploadPrompt() {
  let modal = htmlElement(`<div class="modal active">
    <a href="#close" class="modal-overlay" aria-label="Close"></a>
    <div class="modal-container">
      <div class="modal-header">
        <a href="#close" class="btn btn-clear float-right" aria-label="Close"></a>
        <div class="modal-title h5">Upload Files</div>
      </div>
      <div class="modal-body">
        <div class="content">
          <p>Select files to upload directly to the device storage:</p>
          <input type="file" id="fileUploadInput" multiple accept="*/*">
          <div id="fileList" style="margin-top: 10px;"></div>
          <div class="form-group" style="margin-top: 10px;">
            <label class="form-label">Upload directory (optional):</label>
            <input type="text" id="uploadDirectory" class="form-input" placeholder="e.g., USER/ or ALARM/" />
            <p class="form-input-hint">Leave empty to upload to root storage. Include trailing slash for directories.</p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="startUpload" disabled>Upload Files</button>
        <button class="btn" onclick="this.closest('.modal').remove()">Cancel</button>
      </div>
    </div>
  </div>`);
  
  document.body.append(modal);
  
  let fileInput = modal.querySelector('#fileUploadInput');
  let fileList = modal.querySelector('#fileList');
  let uploadBtn = modal.querySelector('#startUpload');
  let directoryInput = modal.querySelector('#uploadDirectory');
  let selectedFiles = [];
  
  // Handle file selection
  fileInput.addEventListener('change', function(event) {
    selectedFiles = Array.from(event.target.files);
    updateFileList();
  });
  
  function updateFileList() {
    if (selectedFiles.length === 0) {
      fileList.innerHTML = '<p class="text-gray">No files selected</p>';
      uploadBtn.disabled = true;
      return;
    }
    
    let html = '<div class="panel"><div class="panel-header"><div class="panel-title">Selected Files:</div></div><div class="panel-body">';
    selectedFiles.forEach((file, index) => {
      html += `<div class="tile tile-centered">
        <div class="tile-content">
          <div class="tile-title">${escapeHtml(file.name)}</div>
          <div class="tile-subtitle text-gray">${(file.size / 1024).toFixed(1)} KB</div>
        </div>
        <div class="tile-action">
          <button class="btn btn-sm" onclick="removeFile(${index})">Remove</button>
        </div>
      </div>`;
    });
    html += '</div></div>';
    fileList.innerHTML = html;
    uploadBtn.disabled = false;
  }
  
  // Global function to remove files (needed for onclick)
  window.removeFile = function(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
  };
  
  // Handle upload
  uploadBtn.addEventListener('click', function() {
    if (selectedFiles.length === 0) return;
    
    let directory = directoryInput.value.trim();
    if (directory && !directory.endsWith('/')) {
      directory += '/';
    }
    
    modal.remove();
    uploadSelectedFiles(selectedFiles, directory);
  });
  
  // Handle close button
  modal.querySelector('a[href="#close"]').addEventListener('click', function(event) {
    event.preventDefault();
    modal.remove();
  });
}

function uploadSelectedFiles(files, directory) {
  if (files.length === 0) return;
  
  // Check if device is connected
  if (!Comms.isConnected()) {
    showToast("Please connect to a device before uploading files", "error");
    return;
  }
  
  let totalFiles = files.length;
  let uploadedFiles = 0;
  let failedFiles = [];
  
  Progress.show({title: `Uploading files (0/${totalFiles})`, sticky: true});
  
  function uploadNextFile() {
    if (files.length === 0) {
      Progress.hide({sticky: true});
      
      if (failedFiles.length === 0) {
        showToast(`Successfully uploaded ${uploadedFiles} file${uploadedFiles !== 1 ? 's' : ''}`, "success");
      } else {
        showToast(`Uploaded ${uploadedFiles} files, ${failedFiles.length} failed: ${failedFiles.join(', ')}`, "warning");
      }
      return;
    }
    
    let file = files.shift();
    let fileName = directory + file.name;
    
    Progress.show({title: `Uploading ${file.name} (${uploadedFiles + 1}/${totalFiles})`, sticky: true});
    
    // Read file as ArrayBuffer and convert to string
    let reader = new FileReader();
    reader.onload = function(event) {
      let arrayBuffer = event.target.result;
      let data = new Uint8Array(arrayBuffer);
      let binaryString = '';
      
      // Convert binary data to string
      for (let i = 0; i < data.length; i++) {
        binaryString += String.fromCharCode(data[i]);
      }
      
      Comms.writeFile(fileName, binaryString).then(() => {
        uploadedFiles++;
        uploadNextFile();
      }).catch(err => {
        console.error(`Failed to upload ${file.name}:`, err);
        failedFiles.push(file.name);
        uploadNextFile();
      });
    };
    
    reader.onerror = function() {
      console.error(`Failed to read ${file.name}`);
      failedFiles.push(file.name);
      uploadNextFile();
    };
    
    reader.readAsArrayBuffer(file);
  }
  
  uploadNextFile();
}

// Open terminal button
if (Espruino.Core.Terminal)
  Espruino.Core.Terminal.OVERRIDE_CONTENTS = "Click here and type to communicate with Bangle.js";
btn = document.getElementById("terminalEnable");
if (btn) btn.addEventListener("click",event=>{
    document.getElementById("terminalEnable").remove();
    document.querySelector(".editor__canvas").style.display = "inherit";
    Comms.on("data",x=>Espruino.Core.Terminal.outputDataHandler(x))
    Espruino.Core.Terminal.setInputDataHandler(function(d) { Comms.write(d); })
  });
