if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("無法啟用新產品開發／報價的離線頁面。", error);
  });
}
