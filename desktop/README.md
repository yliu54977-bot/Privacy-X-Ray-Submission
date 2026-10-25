# Privacy X-Ray Desktop — offline test edition

## 使用方式

这是现有 Privacy X-Ray 的桌面迁移版。程序、OCR 中英文模型、人脸模型、二维码识别和条形码区域检测模块和 PDF 资源全部随应用提供。运行时不依赖 Vercel、不启动 HTTP 服务器，不需要安装 Node.js。

- Windows x64：完整解压下载包，双击 `Privacy X-Ray.exe`。不要只移动 EXE，旁边的资源必须保留。
- Mac Apple Silicon：使用 **在 macOS 上构建并签名** 的 `.app`。将其移到 Applications 后打开。
- 旧的 `unsigned-unverified` Mac 包已停止作为可用安装包交付：用户实测出现“已损坏”启动拦截。构建脚本现在拒绝在非 macOS 环境生成 Mac 包。
- `adhoc-test` 表示本地开发临时签名；它不等于 Developer ID 签名/Apple 公证，下载到另一台 Mac 后仍可能被 Gatekeeper 拦截。`developer-id-unnotarized` 也还不是完成公证的发行版。不要关闭 Gatekeeper 或全局安全保护来运行这些包。
- 所有测试包都不是已通过独立安全审计的正式发行版。Windows 包目前也没有发行者代码签名。

打开后：选择图片或 PDF → 自动识别 → 勾选要遮挡的内容 → 预览 → Download PNG → 选择保存位置。可用 Clear file 清空当前文件。点击左上角 Logo 回到首页。

PDF 每次处理所选的一页；输出是该页的 PNG，不是整份已脱敏 PDF。检测仍可能漏项，分享前检查全部画面。

## 离线边界

- 应用页面和模型从 `privacy-xray://app/` 读取安装包内的文件，该地址不是公网域名。
- 会话拦截 HTTP、HTTPS、WebSocket、FTP 和 `file://` 请求；不自动更新、不上传、不包含统计服务。
- 没有 preload/IPC 桥；页面无法调用 Node.js。沙箱、上下文隔离、CSP 和设备权限限制开启。
- 用户选择文件后由浏览器文件 API 读取，导出仅允许本地 PNG Blob，通过原生保存窗口保存。
- 处理会话使用非持久化分区，不建立最近文件列表。应用不承诺操作系统的交换文件、崩溃诊断或其他软件绝不会留下痕迹。
- Clear file 释放应用对文件、结果和临时链接的引用，不是磁盘或物理内存安全擦除，也不会删除原文件和已保存 PNG。
- 资源 SHA-256 校验用于发现缺失或意外损坏，不替代发行者签名，无法抵御同时修改程序和校验清单的攻击者。

## 从源码构建

维护者需要 Node.js 22.13+、npm，以及构建时的互联网连接。**最终用户运行应用不需要这些工具，也不需要联网。**

在仓库根目录运行：

```sh
npm ci
npm ci --prefix desktop
npm test
npm run desktop:test
npm run desktop:build
npm run desktop:start
```

Electron 45 将二进制下载移到显式安装命令；如果本地启动提示运行时未安装，执行 `npm exec --prefix desktop -- install-electron`。打包器会自行下载指定平台的 Electron。

打包命令（应优先在目标系统构建和验收）：

```sh
npm run desktop:package -- darwin arm64
npm run desktop:package -- win32 x64
npm run desktop:package -- linux x64
```

输出位于 `desktop/releases/`。macOS 上默认进行 ad-hoc 签名以便本机测试，并在压缩前执行 `codesign --verify --deep --strict`。正式分发需要 Developer ID 签名和 Apple 公证。设置 `PRIVACY_XRAY_MAC_SIGN_IDENTITY` 可指定钥匙串里的签名身份；当前脚本不自动公证。Linux/Windows 交叉打包 Mac 会直接失败，不再生成无法验收的包。

[公开桌面构建工作流](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/actions/workflows/desktop.yml) 在 PR、main 推送和手动触发时运行 macOS ARM64 / Windows x64 原生构建。它先检查公开内容边界，再执行应用测试、桌面安全测试、构建和原生自动化验收，最后上传 ZIP、校验和与提交来源。不会自动发布 Release 或部署网站。测试截图、输入文件和日志目录不打包上传。

`npm run prepare:test-fixtures && npm run desktop:smoke` 会使用独立下载并校验的公开人像以及虚构材料进行原生自动化验收。网络在浏览器会话层禁用；自动保存使用固定临时路径，不能替代人工点击系统保存对话框。安装包内的 `build-info.json` 标识公开源码提交，`LICENSE` 与第三方声明随包提供。发布必须使用 main 上通过验证的构建；历史 `test.1` 包不会被替换。

此迁移保留 Submission 的识别实现：QR 可解析，条形码仅检测区域，不宣称与历史开发版的解码器功能完全相同。

## 发行前验收（必须在目标系统实测）

1. 使用新系统用户/干净应用配置，不依赖旧浏览器缓存；断开 Wi-Fi 和有线网络。
2. 启动应用，识别含人脸、学号、邮箱、电话、中文的测试图片；确认模型不需下载。
3. 识别二维码和条形码，全部遮挡后导出，独立扫码确认导出图中的码无法读取。
4. 打开 PDF，切页、识别、遮挡并保存 PNG；确认文件内容和尺寸正确。
5. 识别中点击 Clear file，确认旧结果不会重新出现；重新选文件，点击 Logo 回到首页。
6. 退出重开，确认不恢复原图或识别结果。
7. 在联网状态用操作系统防火墙/网络监控验证应用没有外网请求。源码拦截测试不等于已完成此项抓包验收。
8. 验证签名、公证、系统首次启动提示和保存窗口。测试包不能当成完成全部步骤的发行版。
