# Agent Folder 贡献者约定

本文件给协作者（包括未来的你和 AI 助手）一份快速上手清单。
架构细节见 [STRUCTURE.md](./STRUCTURE.md)。

## 提交前自检

```bash
pnpm build                                   # 前端类型检查 + 构建
pnpm test                                    # 前端单元测试（vitest）
cd src-tauri && cargo fmt --check            # Rust 格式
cd src-tauri && cargo test                   # 后端单元测试
```

五项全绿再提交；涉及托盘/窗口的改动还需手测，见文末。

## 代码约定

### Rust

- 每个模块顶部写一段文档注释，说明**这个模块负责什么、不负责什么**。
- 依赖方向：`commands → system/services → storage → model`，不可反向。
- 新增可持久化字段时，`serde(rename_all = "camelCase", default)` 必须保留，
  否则旧 `data.json` 会解析失败。
- 错误统一用 `String` 返回给前端，文案面向用户、可读，不带调试信息。
- 打印诊断信息用 `eprintln!`，不要 `println!`（release 下无控制台）。

### 数据写入必须遵守的三条规则

这三条对应三个曾经真实出现过的缺陷，改动存储与命令层时务必核对。

**1. 快照与修改必须在同一次持锁内完成**

```rust
// 正确
let mut data = store.data();      // 一次加锁
let snapshot = data.clone();
mutate(&mut data)?;
store.save_locked(&data)?;        // 复用同一把锁

// 错误：两次加锁之间留下窗口期，
// 并发写入会被随后失败的回滚覆盖
let snapshot = store.data().clone();
let mut data = store.data();
```

写入统一走 `commands::folders::mutate_and_save`，不要自己拼装这套流程。
`Store::save_locked` 供持有锁时使用；`Store::save` 会自行加锁，**不可**在持锁时调用，否则死锁。

**2. 存盘失败必须回滚内存**

否则界面显示已修改、磁盘仍是旧值，重启后改动凭空消失。
`mutate_and_save` 已内置该行为；新增写命令请复用它，而不是直接改 `data` 后调 `save`。

**3. 不要用 `lock().unwrap()`**

任一处在持锁期间 panic 会让 `Mutex` 永久中毒，此后所有访问都会 panic，
应用彻底失效。统一使用 `Store::data()`，它在中毒后仍可继续工作。

> 关于并发测试：Tauri 命令串行调度，`Mutex` 又会对访问排队，
> 因此多线程测试**无法**可靠复现上述窗口期（实测注入 bug 后测试仍通过）。
> 这些约束靠代码审查保证，不要误以为"测试过了就没问题"。

### TypeScript / React

- 界面组件不直接 `invoke`，一律经 `src/lib/commands.ts`。
- 有副作用的逻辑写进 `src/hooks/`，组件保持"读状态 → 渲染"。
- 跨页面复用的视觉元素先抽到 `src/components/ui/`。
- 类型与 Rust 端一一对应，改一侧必须同步另一侧。

### 界面交互

- 所有图标按钮必须有 `aria-label` 或 `title`，便于无障碍与自动化测试。
- 破坏性操作（移除记录）使用红色悬停反馈，并保持可撤销的提示文案。

## 关于 `src-tauri/vendor/tray-icon/`

这是官方 `tray-icon` 的本地补丁副本，修复了两个上游问题：

1. 托盘注册失败时静默忽略，无法定位原因；
2. 取不到图标矩形时直接丢弃点击事件，导致托盘点击无响应。

**不要删除该目录。** 升级 `tray-icon` 时，先确认上游是否已修复这两点；
若已修复，可移除 `Cargo.toml` 里的 `[patch.crates-io]` 段与整个目录。

## 图标

图标由 `scripts/gen_icons.py` 生成，不要手动编辑 PNG/ICO：

```bash
python scripts/gen_icons.py
```

脚本输出的四份文件（`32x32.png`、`128x128.png`、`icon.png`、`icon.ico`）
是唯一来源，直接覆盖写入 `src-tauri/icons/`。

## 手动验证清单

改动涉及系统集成时必须实测，不能只看编译通过：

- [ ] 点标题栏「最小化到托盘」→ 窗口隐藏、进程存活
- [ ] 托盘图标左键 → 窗口恢复并前置
- [ ] 托盘右键 → 菜单含「打开主界面 / 最近文件夹 / 退出」
- [ ] 托盘「退出」→ 进程真正结束
- [ ] 点标题栏「关闭」→ 隐藏而非退出（`close_to_tray` 开启时）
- [ ] `Ctrl+Alt+V` → 呼出/隐藏切换
- [ ] 设置里录制新快捷键 → 保存后新组合键立即生效
- [ ] 任务栏按钮 → 点击可恢复窗口

> 注意：从带「低完整性」标签的目录（例如某些工作区目录）直接运行 exe，
> 托盘图标会因权限不足注册失败（Windows 返回错误 5）。这不是程序缺陷，
> 请安装到常规目录后验证。

## 数据文件

`%APPDATA%\agent-folder\data.json`

调试时如需构造测试数据，**先备份该文件**，验证完毕后还原，
避免覆盖用户真实的历史记录。
