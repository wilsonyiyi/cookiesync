# Cookie Manager 集成可行性分析

日期：2026-11-05。目标：将指定 Cookie Manager 的实际能力集成到当前 CookieSync；本次仅静态逆向与方案分析，未安装目标插件、未读取或修改浏览器 Cookie、未实现功能。

## 结论

可行。两个插件均为 Manifest V3，目标插件所需的 cookies、tabs、storage 与 HTTP/HTTPS 主机权限已被 CookieSync 覆盖。推荐按行为重新实现一个独立 Cookie 管理模块，沿用项目原生 JavaScript、现有样式与双语机制。

## 样本与证据

- 商店：https://chromewebstore.google.com/detail/cookie-manager/okckmdcaaieknndlpbpjjnfmbakdjnbe
- 2026-11-05 从 Google 扩展更新服务下载，manifest 版本 0.0.2。
- CRX SHA-256：36a64500d5bb3dd6afb206055c02b05a76efa5b62a8946ea443e4c99a1505c72。
- 原始包与解包文件暂存 `/tmp/cookie-manager-review/`，临时目录可能被系统清理。
- 格式化后的主要业务源码：`/tmp/cookie-manager-review/popup.pretty.js`。以下行号均指该分析副本，不是原始压缩文件。
- Popup 包含 Vue、Element Plus；后台脚本仅一个换行；content script 挂载空 Vue 组件和样式，未见 Cookie 管理逻辑。

## 实际功能与实现

| 功能 | 源码证据 | 集成判断 |
| --- | --- | --- |
| 当前页面 Cookie 列表 | 7823 行起，tabs.query + cookies.getAll({url}) | 可直接实现；这是 URL 适用范围，不等于域名下全部路径 |
| 搜索 | 8022 行起，名称转小写后 includes | 可实现；可扩展名称、域名、路径搜索 |
| 新增 | 7986 行起，cookies.set({url,name,value}) | 可实现；原插件新增仅提供名称和值 |
| 编辑详情 | 7910 行起，先 remove 再 set | 可实现，需重写更新语义与错误处理 |
| 单条删除 | 7889 行起，name + 当前页面 URL + storeId | 可实现，但原实现同名不同路径定位不充分 |
| 清空 | 8007 行起，getAll({}) 后循环 remove；8559 行绑定按钮 | 实际尝试删除当前存储所有可访问站点 Cookie，不能照搬成当前站点清空 |
| JSON 导出 | 8044 行起，JSON.stringify(getAll({url})) 到剪贴板 | 可实现，也可提供文件导出 |
| JSON 导入 | 7580—7680 行，字段检查后逐条 set，统一使用当前标签页 URL | 可实现，需等待每项完成、统计失败并明确目标域名 |
| 保护 / 阻止 Cookie | 商店英文介绍提及；包内未发现对应入口、规则或监听实现 | 不属于已证实可对齐功能，应另立需求定义 |

## 原实现需要避开的缺陷

1. 清空操作范围过大，且循环未等待异步删除结束就刷新。
2. 导入没有等待 set 的 Promise，就提示成功；新增、编辑、删除回调也未检查 runtime.lastError。
3. 编辑先删除后写入，失败可能丢失原 Cookie。名称修改时删除参数使用编辑后的名称，可能残留旧记录。
4. 删除使用页面 URL，无法可靠表达列表中同名不同路径的目标；必须结合实际 Cookie URL、存储与分区定位，并读回验证。
5. 编辑未保留 partitionKey；导入字段白名单也不接受它，无法完整支持分区 Cookie。
6. Cookie 管理逻辑不依赖 content script，无需仿照目标向所有页面注入空组件。

## 当前项目集成点

- `chrome/manifest.json`：已有核心权限；基础管理无需增加权限或引入框架。
- `chrome/popup.html`、`chrome/popup.js`：增加“Cookie 管理”入口，管理视图默认当前页面；复杂列表可进入独立扩展页，并显式传入来源 tabId/URL，避免新页面成为活动标签后取错目标。
- 建议新增 `cookie-manager.js`：封装查询、创建、编辑、删除、JSON 导入导出及错误归一化。
- `chrome/service_worker.js`：已有 onChanged 自动同步。管理操作写入匹配的来源 Cookie 会触发同步；来源删除当前被忽略，不会自动删除 localhost 副本。需要明确展示并验证这两种联动行为。
- 现有 `toLocalhostCookie` 会去掉 Secure、将 SameSite=None 改为 Lax、强制写 localhost，属于同步专用逻辑，不能用于原站编辑或原样导入。
- `form-cache.js` / Popup 的现有导入导出是同步配置，不是 Cookie 数据；应保留独立入口和格式。
- 当前 sameCookieIdentity 包含 name/domain/path/storeId，未覆盖 partitionKey；管理模块需要完整身份键。

## 推荐实施范围

第一期：当前页面列表、名称搜索、完整字段编辑、新增、单条与选中项删除、JSON 导入导出；清空明确限制当前范围。显示操作目标、成功和失败数，Cookie 值默认折叠。直接沿用 CookieSync UI。

第二期：全部站点视图、域名筛选、与同步规则关联（将选中 Cookie 加入同步配置）、分区与独立存储的完整交互。

保护/阻止需要先定义：防止用户误删、变化后恢复原值、禁止某站点保存 Cookie，三者不同。onChanged 后补偿不是写入前阻断，也可能和自动同步互相触发。若增加站点级策略，可另行评估 contentSettings；网络头规则也不等价于阻止所有 JavaScript Cookie 写入。

实现验收应覆盖：同名不同 path/domain、session/hostOnly、Secure/SameSite/HttpOnly、partitionKey/storeId、改名与改路径、批量部分失败、导入预览与目标域校验，以及管理修改触发自动同步、删除不传播的当前行为。尤其验证列表范围和批量删除范围一致。

粗略工程估算：基础功能与现有 UI 集成约 2—4 个开发日；补齐上述边界与浏览器验证合计约 4—7 个开发日。该估算基于静态代码，不是已经完成的验证结果。

## 官方参考

- Chrome Cookies API：https://developer.chrome.com/docs/extensions/reference/api/cookies
- Chrome declarativeNetRequest：https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest

本报告确认了实现路径和静态缺陷，没有进行原插件实际交互验证。解包样本未提供可据以直接复制业务源码的许可证说明；建议独立实现上述行为，不引入其压缩业务代码或品牌素材。
