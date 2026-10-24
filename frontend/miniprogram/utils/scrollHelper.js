// 页面滚动定位：把指定任务滚到可视区。
//
// 背景：切到编辑态后每张任务卡都会变高（多出输入框/stepper），目标任务的真实位置会下移，
// 固定 offsetTop 不可靠；同时键盘弹出时微信会顶起页面，把滚动位置冲掉。
//
// ⚠️ 关键坑：boundingClientRect 的 top 是**相对视口**的，滚动后它会变。
// 若每次都用「rect.top + 当前 scrollTop」重算，等于把已滚过的量又加一遍 → 越滚越远。
// 所以首次量出**绝对位置**并缓存，后续校正一律用缓存值。
//
// 用法：
//   const scroller = createTaskScroller(this);
//   scroller.reset();
//   scroller.scrollToTask(3);   // 滚动到第 3 个任务
//   scroller.scrollToTask(3);   // 键盘弹出后再调一次，用缓存值校正，不会漂移

// 任务卡顶部距屏幕上沿的留白（rpx/px 混用场景下用 px 更稳，这里取 100px 视觉舒适）
const TOP_MARGIN = 100;

function createTaskScroller(page) {
  let targetAbs = null; // 缓存目标的绝对位置

  return {
    // 每次新的定位前调用，清空缓存重新测量
    reset() {
      targetAbs = null;
    },

    // 滚到第 index 个任务（对应 wxml 里的 id="task-{{index}}"）
    scrollToTask(index) {
      const q = wx.createSelectorQuery().in(page);
      q.select(`#task-${index}`).boundingClientRect();
      // scrollOffset 的结果在 exec 回调里取；不同基础库可能是 {scrollTop} 或 [{scrollTop}]，两种都兼容
      q.selectViewport().scrollOffset();
      q.exec((res) => {
        const rect = res && res[0];
        const raw = res && res[1];
        const vp = Array.isArray(raw) ? raw[0] : raw;
        if (!rect) {
          // 量不到（元素还没渲染出来）→ 退化为按 id 滚动
          wx.pageScrollTo({ selector: `#task-${index}`, offsetTop: TOP_MARGIN, duration: 200 });
          return;
        }
        const scrollTop = (vp && vp.scrollTop) || 0;
        // 绝对位置 = 视口位置 + 已滚动距离
        const absolute = rect.top + scrollTop;
        if (targetAbs == null) targetAbs = absolute;
        const target = Math.max(0, targetAbs - TOP_MARGIN);
        wx.pageScrollTo({ scrollTop: target, duration: 200 });
      });
    },
  };
}

module.exports = { createTaskScroller, TOP_MARGIN };
