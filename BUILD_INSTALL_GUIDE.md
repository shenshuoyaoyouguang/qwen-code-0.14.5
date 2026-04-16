# Qwen Code 本地构建与全局安装指南

## 环境信息

- **项目路径**: `D:\xiaoxiao\2026.4.16\qwen-code-0.14.5`
- **Node.js**: v22.17.0
- **全局安装路径**: `C:\Users\76578\AppData\Roaming\npm\node_modules\@qwen-code`

---

## 一、安装依赖

```bash
cd D:\xiaoxiao\2026.4.16\qwen-code-0.14.5
npm install --ignore-scripts --no-audit --no-fund
```

> `--ignore-scripts` 用于跳过 postinstall 钩子，避免 vscode-ide-companion 的 generate:notices 脚本因缺少 package-lock.json 而失败。

---

## 二、修复的问题

### 1. webui d.ts 生成问题

**问题**: `vite-plugin-dts` 与 CSS side-effect 导入（`import './styles.css'`）不兼容，导致生成的 `index.d.ts` 只有 `export { }`。

**修复**:

- `packages/webui/vite.config.ts` - 移除 dts 插件
- `packages/webui/package.json` - build 脚本改为:
  ```json
  "build": "vite build && tsc --emitDeclarationOnly --declaration --declarationDir dist"
  ```

### 2. sdk-typescript 构建问题

**问题**: `tsconfig.build.json` 缺少 `rootDir` 配置导致 dts-bundle-generator 报错。

**修复**:

- `packages/sdk-typescript/tsconfig.build.json` - 添加:
  ```json
  "rootDir": "./src"
  ```

### 3. sessionService.test.ts 类型问题

**问题**: TypeScript 6 的 fs.Dirent<Buffer> 类型变化。

**修复**:

- `packages/core/src/services/sessionService.test.ts` - 将 `Array<fs.Dirent<Buffer>>` 类型断言改为 `any`

---

## 三、构建所有包

```bash
cd D:\xiaoxiao\2026.4.16\qwen-code-0.14.5
npm run build
```

构建顺序:
1. core
2. web-templates
3. channel-base
4. channel-telegram
5. channel-weixin
6. channel-dingtalk
7. channel-plugin-example
8. cli
9. webui
10. sdk-typescript
11. vscode-ide-companion

---

## 四、打包并全局安装

### 4.1 打包所有 workspace 包

```bash
cd D:\xiaoxiao\2026.4.16\qwen-code-0.14.5

# 打包所有包
npm pack --workspace=packages/core
npm pack --workspace=packages/web-templates
npm pack --workspace=packages/channels/base
npm pack --workspace=packages/channels/telegram
npm pack --workspace=packages/channels/weixin
npm pack --workspace=packages/channels/dingtalk
npm pack --workspace=packages/channels/plugin-example
npm pack --workspace=packages/cli
npm pack --workspace=packages/webui
npm pack --workspace=packages/sdk-typescript
```

### 4.2 解压并安装到全局

```bash
cd D:\xiaoxiao\2026.4.16\qwen-code-0.14.5

# 创建临时目录
mkdir -p _install/cli _install/core _install/web-templates
mkdir -p _install/channels/base _install/channels/telegram
mkdir -p _install/channels/weixin _install/channels/dingtalk
mkdir -p _install/channels/plugin-example _install/webui _install/sdk

# 解压 cli（需要修改依赖路径）
tar -xzf packages/cli/qwen-code-qwen-code-0.14.5.tgz -C _install/cli --strip-components=1

# 修改 cli package.json 中的 file: 依赖为相对路径
cd _install/cli
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const replacements = {
  '@qwen-code/channel-base': '../channels/base',
  '@qwen-code/channel-telegram': '../channels/telegram',
  '@qwen-code/channel-weixin': '../channels/weixin',
  '@qwen-code/channel-dingtalk': '../channels/dingtalk',
  '@qwen-code/qwen-code-core': '../core',
  '@qwen-code/web-templates': '../web-templates',
};
for (const [name, path] of Object.entries(replacements)) {
  if (pkg.dependencies[name] && pkg.dependencies[name].startsWith('file:')) {
    pkg.dependencies[name] = 'file:' + path;
  }
}
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# 创建 workspace package.json
cd _install
echo '{"name":"@qwen-code/monorepo","private":true,"workspaces":["./cli","./core","./web-templates","./channels/base","./channels/telegram","./channels/weixin","./channels/dingtalk","./channels/plugin-example"]}' > package.json

# 解压其他包
tar -xzf ../packages/core/qwen-code-qwen-code-core-0.14.5.tgz -C core --strip-components=1
tar -xzf ../packages/web-templates/qwen-code-web-templates-0.14.5.tgz -C web-templates --strip-components=1
tar -xzf ../packages/channels/base/qwen-code-channel-base-0.14.5.tgz -C channels/base --strip-components=1
tar -xzf ../packages/channels/telegram/qwen-code-channel-telegram-0.14.5.tgz -C channels/telegram --strip-components=1
tar -xzf ../packages/channels/weixin/qwen-code-channel-weixin-0.14.5.tgz -C channels/weixin --strip-components=1
tar -xzf ../packages/channels/dingtalk/qwen-code-channel-dingtalk-0.14.5.tgz -C channels/dingtalk --strip-components=1
tar -xzf ../packages/channels/plugin-example/qwen-code-channel-plugin-example-0.14.5.tgz -C channels/plugin-example --strip-components=1

# 安装 npm 依赖
npm install --ignore-scripts --no-audit --no-fund
```

### 4.3 复制到全局 node_modules

```bash
cd _install

# 清理旧的全局安装
rm -rf "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code"
mkdir -p "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code"

# 复制所有包
cp -r cli "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/qwen-code"
cp -r core "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/qwen-code-core"
cp -r web-templates "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/web-templates"
cp -r channels/base "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/channel-base"
cp -r channels/telegram "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/channel-telegram"
cp -r channels/weixin "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/channel-weixin"
cp -r channels/dingtalk "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/channel-dingtalk"
cp -r channels/plugin-example "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/channel-plugin-example"

# 复制 npm 依赖到 qwen-code 包
cp -r node_modules/* "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/qwen-code/node_modules/"
```

### 4.4 安装 webui 和 sdk

```bash
cd D:\xiaoxiao\2026.4.16\qwen-code-0.14.5

# 解压并安装 webui
mkdir -p _install/webui
tar -xzf qwen-code-webui-0.14.5.tgz -C _install/webui --strip-components=1
cp -r _install/webui "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/webui"

# 解压并安装 sdk
mkdir -p _install/sdk
tar -xzf qwen-code-sdk-0.1.6.tgz -C _install/sdk --strip-components=1
cp -r _install/sdk "C:/Users/76578/AppData/Roaming/npm/node_modules/@qwen-code/sdk"
```

---

## 五、验证安装

```bash
qwen --version
# 应输出: 0.14.5

# 从其他目录测试
cd C:\Users
qwen --version
# 应输出: 0.14.5
```

---

## 六、清理临时文件

```bash
cd D:\xiaoxiao\2026.4.16\qwen-code-0.14.5
rm -rf _install
find packages -name "*.tgz" -delete
```

---

## 七、注意事项

1. **不需要 npm link**: 直接复制到全局 node_modules 即可
2. **依赖路径**: cli 的 package.json 中需要将 `file:` 依赖改为相对路径
3. **API 密钥**: 使用前需要设置环境变量
   ```bash
   export ANTHROPIC_API_KEY=sk-xxx      # Claude
   export GOOGLE_API_KEY=xxx            # Gemini
   export OPENAI_API_KEY=sk-xxx        # GPT
   ```
4. **非 git 仓库**: 构建时会提示 `fatal: not a git repository`，这是正常的，不影响构建
