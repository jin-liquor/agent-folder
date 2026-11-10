# Agent Folder Changelog / 更新记录

All notable user-facing changes are recorded here. / 记录面向用户的重要变更。

## [0.1.0] - 2026-11-10

### Added / 新增

- Bilingual Chinese and English installation, usage, privacy, and build documentation. / 增加中英双语的安装、使用、隐私与构建文档。
- A release overview and installation guidance for the Windows NSIS package. / 增加 Windows NSIS 安装包的版本说明与安装指引。

### Improved / 改进

- Clarified local-only data storage and the absence of automatic update behavior. / 明确本地数据存储方式与当前不含自动更新功能。
- Updated keyboard shortcut, project structure, and development instructions to match the current implementation. / 更新快捷键、项目结构和开发说明，使其与当前实现一致。
- Rebuilt the Windows installer from the cleaned 0.1.0 source tree for the GitHub release. / 基于整理后的 0.1.0 源码重新构建 Windows 安装包。

### Privacy / 隐私

- The release installer does not include user folder records, settings, credentials, access tokens, or personal workspace files. / 发布安装包不包含用户文件夹记录、设置、凭证、访问令牌或个人工作区文件。
- Application data remains on the user's computer; no usage analytics or automatic upload is included. / 应用数据保存在用户本机；不包含使用统计或自动上传功能。
