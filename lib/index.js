/**
 * dsh-sketchpad 的宿主半侧。
 *
 * 这个插件是纯客户端插件：画板、附件与发送行为全部由 lib/client.js 在浏览器里完成，
 * 宿主侧不需要远程调用、路由或后台任务。留一个空的 Cordis 插件体，只是为了让
 * profile 的 Loader 条目有一个合法的宿主模块可加载。
 */
export const name = 'dsh-sketchpad'

export function apply() {
  // 无宿主行为。
}
