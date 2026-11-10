import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import QuickLaunch from "./QuickLaunch";
import "./styles.css";

/**
 * 入口分流：`?quick=1` 渲染快速启动浮窗，否则渲染主界面。
 *
 * 两个窗口共用同一个构建产物，避免为浮窗单独配置一份打包流程。
 */
const isQuick = new URLSearchParams(window.location.search).has("quick");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isQuick ? <QuickLaunch /> : <App />}</React.StrictMode>,
);
