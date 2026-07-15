# 静数独

无广告的单机闯关式数独网页游戏。包含四档难度、每档 40 个固定关卡、逐关解锁、最好用时、候选笔记、撤回、提示和本地续玩。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

使用与 GitHub Pages 相同的纯静态模式：

```bash
npm run dev:pages
```

## 验证

```bash
npm run lint
npm test
```

重新生成并校验固定题库：

```bash
npm run generate:puzzles
```
