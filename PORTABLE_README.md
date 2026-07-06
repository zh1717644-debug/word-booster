# 背单词抽卡便携版

## 怎么运行

### macOS

双击 `start-mac.command`。

如果系统提示不能打开，在终端里进入这个文件夹运行：

```bash
chmod +x start-mac.command
./start-mac.command
```

### Windows

双击 `start-windows.bat`。

### 手动启动

```bash
node server.mjs
```

然后打开：

```text
http://127.0.0.1:4173/index.html?v=20260706-1
```

## 需要安装什么

另一台电脑需要安装 Node.js 20 或更新版本：

```text
https://nodejs.org/
```

## AI 模式

页面底部有 `本地 AI` 区域。

- `云端模型`：需要自己创建 `.env.local` 并填入 API Key。
- `本机 Ollama`：需要先在当前电脑安装并运行 Ollama；页面会自动读取那台电脑已有的本地模型，可以在 `Ollama 模型` 下拉框里选择，不需要 API Key。

本机 Ollama 只适合电脑本地运行；手机浏览器不能直接使用电脑里的 Ollama，除非你额外做局域网服务开放。

## 云端 Key 怎么配置

复制 `.env.example` 为 `.env.local`，然后填入自己的 Key。

不要把 `.env.local` 发给别人。

## 数据保存在哪里

词库和学习记录保存在当前浏览器的 IndexedDB 里。换电脑、换浏览器不会自动同步。需要迁移时，在页面里用 `导出词库` 和 `导入词库`。
