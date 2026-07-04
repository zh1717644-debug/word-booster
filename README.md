# Word Booster 背单词抽卡

一个用于拍照提词、抽卡复习、生成例句和语法讲解的网页应用。

- 拍照或上传图片，OCR 识别英文/日语词条
- 手动补充单词
- 单词抽卡、翻卡、随机练习
- 标注英文音标或日语假名
- 为当前单词生成例句、中文释义、语法讲解
- 支持按“全部 / 待复习 / 已掌握”筛选
- 支持搜索、导入、导出词库
- 使用浏览器本地数据库 `IndexedDB` 保存词库和学习记录
- 支持本机 Ollama 模型适配，也支持云端百炼模型

## 本地预览

```bash
npm run preview
```

然后访问 `http://localhost:4173`

## AI 模式

### 本机 Ollama

1. 安装并启动 Ollama
2. 下载任意可用文本模型
3. 打开页面底部“本地 AI”
4. 选择 `本机 Ollama`
5. 在 `Ollama 模型` 下拉框里选择当前电脑已有模型

### 阿里云百炼

1. 打开阿里云百炼，创建 API Key
2. 复制 `.env.example` 为 `.env.local`
3. 填入 `BAILIAN_API_KEY`
4. 启动 `npm run preview`

默认：
- 句子模型：`qwen-turbo`
- 读音接口：百炼兼容 Chat Completions

## 部署

这个项目带本地 Node API 代理，适合本地运行。部署到 Netlify 时，云端模型需要在 Netlify 环境变量中配置 `BAILIAN_API_KEY`。

本机 Ollama 模式只适用于运行网页的那台电脑，公开部署后的网页不能直接访问访问者电脑里的 Ollama，除非访问者自己在本地运行本项目。

### 匿名部署到 Netlify

```bash
npm run deploy:anon
```

这会生成一个临时的线上 URL。

## 数据说明

- 词库、复习记录、设置默认保存在当前浏览器的 `IndexedDB`
- 导出词库后可跨设备导入
- 词典信息默认调用 `dictionaryapi.dev`
