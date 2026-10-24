// 云客户端（小程序专用子路径）：所有后端请求走固定网关 mp-api.app.workbuddy.host，
// 该网关由发布流程注册进微信请求白名单，且只对携带小程序凭据的签名请求放行——
// 因此不再经过网页域名的「请在浏览器中打开」拦截，从根本上解决真机 403。
// 注意：SDK 走「本地内置」而非 npm 裸模块。
// 原因：微信开发者工具只有执行过「工具 → 构建 npm」才会生成 miniprogram_npm/，
// 裸模块名（@tencent-ai/...）在未构建时会被解析成相对当前文件的路径，报
// "module 'utils/@tencent-ai/...' is not defined"。真机能跑是因为上传包已构建过，
// 但本地每次拉代码都可能漏这一步。内置成单文件后两端行为一致，无需任何构建步骤。
//
// ⚠️ 必须用官方给微信的构建产物 miniprogram_dist/miniprogram.js（已内置到 vendor/）。
// **不要**改用 esbuild 打包 lib/miniprogram.cjs：esbuild 的 --platform=neutral 会裁掉
// core-js polyfill 依赖的 Node 语义，导致 SDK 内置的 URL 实现损坏，
// 运行时抛 "endpoint must be an absolute URL, received: https://mp-api.app.workbuddy.host"
//（URL 明明是绝对地址，是 SDK 内部的 URL 构造器坏了，不是配置写错）。
// 升级 SDK 版本时的正确做法（直接复制官方微信产物，不要重新打包）：
//   cp frontend/miniprogram/node_modules/@tencent-ai/workbuddy-cloud-sdk/miniprogram_dist/miniprogram.js \
//      frontend/miniprogram/vendor/workbuddy-cloud-sdk.js
const { createMiniProgramWorkBuddyCloud } = require('../vendor/workbuddy-cloud-sdk')
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics')

// publicConfig 由 workbuddy_cloud_service 激活时下发。小程序无 location.origin，必须显式传入。
const publicConfig = {
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_05aJ7qUN2BFYi0c3ZA7Om3_8yLpjnSio7JuAWCp4Vgxp9ugUL8SBNwc',
}

const cloud = createMiniProgramWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  publishableKey: publicConfig.publishableKey,
  wx: createDiagnosticWx(wx),
})

module.exports = { cloud, publicConfig }
