import { useEffect } from "react";

/** 可收缩右侧边栏（聊伴小记） */
export default function ChatAssistantSidebar({
  collapsed,
  onCollapsedChange,
  children,
  footer = null,
}) {
  useEffect(() => {
    if (collapsed) return undefined;
    const mq = window.matchMedia("(max-width: 899px)");
    if (!mq.matches) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [collapsed]);

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          className="chat-aside-mobile-open"
          aria-label="打开聊伴小记"
          onClick={() => onCollapsedChange(false)}
        >
          小记
        </button>
      ) : (
        <button
          type="button"
          className="chat-aside-mobile-backdrop"
          aria-label="收起聊伴小记"
          onClick={() => onCollapsedChange(true)}
        />
      )}

      <aside
        className={`chat-aside${collapsed ? " chat-aside--collapsed" : " chat-aside--expanded"}`}
        aria-label="聊伴小记"
      >
        {collapsed ? (
          <button
            type="button"
            className="chat-aside__rail"
            aria-label="展开聊伴小记"
            title="展开聊伴小记"
            onClick={() => onCollapsedChange(false)}
          >
            <span className="chat-aside__rail-label">小记</span>
          </button>
        ) : (
          <>
            <div className="chat-aside__head">
              <div className="chat-aside__head-text">
                <h2 className="chat-aside__title">聊伴小记</h2>
                <p className="chat-aside__hint">帮你看清聊到哪了，只有你能看到</p>
              </div>
              <button
                type="button"
                className="chat-aside__collapse"
                aria-label="收起侧边栏"
                onClick={() => onCollapsedChange(true)}
              >
                收起
              </button>
            </div>

            <div className="chat-aside__body">{children}</div>

            {footer ? <div className="chat-aside__footer">{footer}</div> : null}
          </>
        )}
      </aside>
    </>
  );
}
