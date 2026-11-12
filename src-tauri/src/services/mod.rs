//! 服务层：封装与操作系统交互的业务逻辑。
//!
//! 命令层（`commands/`）只做参数校验与状态读写，真正的副作用
//! （启动进程、遍历磁盘、操作托盘）都收敛在这里，方便单独测试与替换。

pub mod cli_args;
pub mod cli_probe;
pub mod editor;
pub mod index;
pub mod project;
pub mod scanner;
