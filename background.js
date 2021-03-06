var loading  = [];
var timeouts = [];
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    if (request.action === "start_tracking") {
      console.log('start tracking ' + request.url);
      loadFeed(request.url);

      chrome.storage.local.get('urls', function (items) {
        if (items['urls'] !== undefined)
          items = items['urls'];
        items[request.url]                = {};
        items[request.url]['status']      = 'started';
        items[request.url]['branch_name'] = request.branch_name;
        chrome.storage.local.set({ 'urls': items }, function () {
          // Notify that we saved.
          console.log('url saved');
        });
      });
      sendResponse({ status: "started" });
    } else if (request.action === "check_status") {
      console.log(request);
      console.log('checking up on ', request.url);
      loadFeed(request.url);
    } else if (request.action === "close_url") {
      console.log('closing the url ', request.url);
      chrome.storage.local.get('urls', function (items) {
        if (items['urls'] !== undefined)
          items = items['urls'];
        items[request.url] = undefined;
        chrome.storage.local.set({ 'urls': items }, function () {
          console.log('link removed');
        });
      });
    }

  });

var notifyCompleted = function (status, item) {
  if (Notification.permission !== "granted")
    Notification.requestPermission();
  else if (item) {
    var icon = chrome.extension.getURL('assets/states/cancelled.png');
    switch (status) {
      case "failed":
        icon = chrome.extension.getURL('assets/states/failed.jpg');
        break;
      case "success":
        icon = chrome.extension.getURL('assets/states/success.png');
        break;
      case "cancelled":
        icon = chrome.extension.getURL('assets/states/cancelled.png');
        break;
      case "timeout":
        icon = chrome.extension.getURL('assets/states/cancelled.png');
        break;
    }
    var notification = new Notification('Deployment completed', {
      icon: icon,
      body: "deployment [" + item['branch_name'] + "] " + status + "!"
    });

    notification.onclick = function () {
      chrome.tabs.create({ url: chrome.extension.getURL('index.html') });
    };

    setTimeout(function () {
      notification.close();
    }, 60000);
  }
};
var isComplete      = function (response) {
  return response.search("Failed build") > 0 || response.search("Deployment FAILED") > 0 || response.search("Deployment successful!") > 0 || response.search("Received kill signal") > 0 || response.search("another deployment just started") > 0 || response.search("was not found on this server.") > 0;
};
var getStatus       = function (response) {
  if (response.search("Failed build") > 0 || response.search("Deployment FAILED") > 0) {
    return "failed";
  }
  else if (response.search("This server is now online") > 0 || response.search("Deployment successful!")) {
    return "success";
  }
  else if (response.search("Received kill signal") > 0 || response.search("another deployment just started") > 0 || response.search("was not found on this server.") > 0) {
    return "cancelled";
  }
};
var loadFeed        = function (url) {
  var loadUrl = function (url) {
    console.log('load url', url);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '/');
    xhr.onreadystatechange = function (e) {
      console.log('done loading', url, xhr.readyState, xhr.status);
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          var response = e.target.response.slice(-2000);
          chrome.storage.local.get('urls', function (items) {
            if (items['urls'] !== undefined)
              items = items['urls'];
            if (items[url] !== undefined) {
              items[url]['response'] = response;
              chrome.storage.local.set({ 'urls': items }, function () {
                // Notify that we saved.
                console.log('response saved');
              });
            }
            //
            if (isComplete(response)) {
              console.log('link complete');
              notifyCompleted(getStatus(response), items[url]);
              items[url] = undefined;
              chrome.storage.local.set({ 'urls': items }, function () {
                console.log('link removed');
              });
            } else {
              setTimeout(function () {loadUrl(url)}, 2000);
            }
          });
        } else {
          console.log("timeout:" + url);
          loading[url] = false;
          if (timeouts[url] === undefined) {
            timeouts[url] = 0;
          }
          else {
            timeouts[url]++;
          }
          if (timeouts[url] > 10) {
            //mark failed
            chrome.storage.local.get('urls', function (items) {
              if (items['urls'] !== undefined)
                items = items['urls'];
              console.log('link complete');
              notifyCompleted("timeout", items[url]);
              items[url] = undefined;
              chrome.storage.local.set({ 'urls': items }, function () {
                console.log('link removed');
              });
            });
          } else {
            setTimeout(function () {loadUrl(url)}, 2000);
          }
        }
      } else {
        console.log('xhr.readyState', xhr.readyState);
      }
    };
    xhr.onerror= function(e) {
      console.log("Error fetching " + url);
    };
    xhr.send(null);
  };

  if (loading[url] === undefined) {
    loading[url] = true;
    loadUrl(url);
  } else {
    console.log(url, "still loading");
  }
  return false;
};
// request permission on page load
document.addEventListener('DOMContentLoaded', function () {
  if (!Notification) {
    alert('Desktop notifications not available in your browser. Try Chromium.');
    return;
  }

  if (Notification.permission !== "granted")
    Notification.requestPermission();
});
chrome.browserAction.onClicked.addListener(function (tab) {
  chrome.tabs.create({ url: chrome.extension.getURL('index.html') });
});