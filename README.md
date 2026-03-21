# Codexy

Codexy 是一个面向 Codex 主机的 Web 控制台，提供线程列表、线程阅读、继续对话、图片输入、实时输出流和审批处理能力。

当前仓库中的运行时实现基于 Next.js，默认监听 `0.0.0.0:3000`，适合本机运行后再通过 Tailscale 暴露给其他设备访问。

## 环境要求

- Node.js 20+
- npm 10+

## 安装依赖

```bash
npm install
```

## 入口说明

### 1. Build 入口

构建生产包：

```bash
npm run build
```

Windows 快捷入口：

```bat
build.cmd
```

### 2. 开发环境运行入口

默认以开发模式启动在 `3000` 端口：

```bash
npm run dev
```

Windows 快捷入口：

```bat
dev.cmd
```

如果需要自定义端口，可以直接传端口号，或者用 `--port`：

```bat
dev.cmd 3100
dev.cmd --port 3100
```

### 3. 正式使用环境运行入口

先完成构建，再启动正式运行服务：

```bash
npm run build
npm run start
```

Windows 快捷入口：

```bat
start.cmd
```

同样支持指定端口：

```bat
start.cmd 3100
start.cmd --port 3100
```

## 常用验证命令

基础验证：

```bash
npm run verify
```

包含端到端验证：

```bash
npm run verify:e2e
```

## 项目说明

- Web 客户端只通过 HTTP API 和事件流与服务端交互。
- Codexy API Server 负责对接 Codex bridge，并对浏览器暴露稳定接口。
- 实时执行与审批流都必须经过 Codex 协议，不走自定义 shell 包装层。

更细的架构边界见 [agents.md](./agents.md)，产品规格见 [spec.md](./spec.md)。
