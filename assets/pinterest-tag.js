(function () {
  var pinterestTagId = "2614165616261";
  var storageKey = "aorix_pinterest_tracking_consent";

  function hasConsent() {
    return window.localStorage.getItem(storageKey) === "accepted";
  }

  function setConsent(value) {
    window.localStorage.setItem(storageKey, value);
  }

  function loadPinterestTag() {
    if (window.aorixPinterestTagLoaded) return;
    window.aorixPinterestTagLoaded = true;

    !function(e){if(!window.pintrk){window.pintrk = function () {
    window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var
      n=window.pintrk;n.queue=[],n.version="3.0";var
      t=document.createElement("script");t.async=!0,t.src=e;var
      r=document.getElementsByTagName("script")[0];
      r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");

    window.pintrk("load", pinterestTagId);
    window.pintrk("page");
  }

  function removeBanner() {
    var banner = document.querySelector("[data-tracking-consent]");
    if (banner) banner.remove();
  }

  function showBanner() {
    if (window.localStorage.getItem(storageKey)) return;

    var banner = document.createElement("div");
    banner.className = "tracking-consent";
    banner.setAttribute("data-tracking-consent", "true");
    banner.innerHTML = [
      '<div class="tracking-consent-text">',
      "<strong>Pinterest Tracking</strong>",
      "<span>Wir nutzen Pinterest Tag nur nach deiner Einwilligung, um Seitenaufrufe und Kampagnenwirkung zu messen.</span>",
      '<a href="datenschutz.html">Datenschutz</a>',
      "</div>",
      '<div class="tracking-consent-actions">',
      '<button type="button" class="btn btn-secondary" data-consent-decline>Ablehnen</button>',
      '<button type="button" class="btn btn-primary" data-consent-accept>Akzeptieren</button>',
      "</div>"
    ].join("");

    document.body.appendChild(banner);

    banner.querySelector("[data-consent-accept]").addEventListener("click", function () {
      setConsent("accepted");
      removeBanner();
      loadPinterestTag();
      showSettingsButton();
    });

    banner.querySelector("[data-consent-decline]").addEventListener("click", function () {
      setConsent("declined");
      removeBanner();
      showSettingsButton();
    });
  }

  function showSettingsButton() {
    if (document.querySelector("[data-tracking-settings]")) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "tracking-settings";
    button.setAttribute("data-tracking-settings", "true");
    button.textContent = "Tracking";
    button.addEventListener("click", function () {
      window.localStorage.removeItem(storageKey);
      showBanner();
      button.remove();
    });
    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    if (hasConsent()) {
      loadPinterestTag();
      showSettingsButton();
      return;
    }

    showBanner();
    if (window.localStorage.getItem(storageKey) === "declined") {
      showSettingsButton();
    }
  }
})();
