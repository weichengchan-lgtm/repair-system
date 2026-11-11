if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("無法啟用報修登記的離線頁面。", error);
  });
}
