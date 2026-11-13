export type Language = "zh-CN" | "en-US";

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "zh-CN", label: "中文" },
  { value: "en-US", label: "English" },
];

export type MessageKey =
  | "settings"
  | "minimize"
  | "closeToTray"
  | "language"
  | "theme"
  | "light"
  | "dark"
  | "system"
  | "searchPlaceholder"
  | "searchAria"
  | "diskIndexing"
  | "scannedDirectories"
  | "noMatch"
  | "indexNotReady"
  | "noRecords"
  | "disk"
  | "hits"
  | "clickToChange"
  | "indexCount"
  | "folderCount"
  | "retry"
  | "loadFailed"
  | "addFolder"
  | "searchResults"
  | "recent"
  | "favorites";

const MESSAGES: Record<Language, Record<MessageKey, string>> = {
  "zh-CN": {
    settings: "设置",
    minimize: "最小化",
    closeToTray: "关闭窗口",
    language: "语言",
    theme: "主题",
    light: "浅色",
    dark: "深色",
    system: "跟随系统",
    searchPlaceholder: "搜索文件夹，或直接搜整盘…",
    searchAria: "快速搜索文件夹",
    diskIndexing: "正在建立磁盘索引",
    scannedDirectories: "个目录",
    noMatch: "没有匹配的文件夹",
    indexNotReady: "磁盘索引尚未就绪，稍候再试",
    noRecords: "还没有记录，先在主界面添加",
    disk: "磁盘",
    hits: "个命中",
    clickToChange: "点击右侧图标切换打开方式",
    indexCount: "索引",
    folderCount: "个文件夹",
    retry: "重试",
    loadFailed: "数据加载失败",
    addFolder: "添加文件夹",
    searchResults: "搜索结果",
    recent: "最近使用",
    favorites: "收藏",
  },
  "en-US": {
    settings: "Settings",
    minimize: "Minimize",
    closeToTray: "Close window",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    searchPlaceholder: "Search folders or the whole disk…",
    searchAria: "Quick folder search",
    diskIndexing: "Building disk index",
    scannedDirectories: "directories scanned",
    noMatch: "No matching folders",
    indexNotReady: "Disk index is not ready yet",
    noRecords: "No records yet. Add one from the main window",
    disk: "Disk",
    hits: "hits",
    clickToChange: "Click an icon to change the open method",
    indexCount: "Index",
    folderCount: "folders",
    retry: "Retry",
    loadFailed: "Failed to load data",
    addFolder: "Add folder",
    searchResults: "Search results",
    recent: "Recent",
    favorites: "Favorites",
  },
};

export function t(language: Language, key: MessageKey): string {
  return MESSAGES[language][key];
}

export function normalizeLanguage(value: unknown): Language {
  return value === "en-US" ? "en-US" : "zh-CN";
}
