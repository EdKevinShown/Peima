import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Image as ImageIcon, Sparkles, FileText, Heart,
  Eye, Brain, Target,
  ShieldCheck, Lock, MapPin,
} from "lucide-react";
import { PersonalizedMatchmakerShowcase } from "./PersonalizedMatchmakerPage";

/** Animated counter that counts up to a target number */
function useCountUp(target, duration = 2000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(id); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);
  return count;
}

/* ── Asset paths ────────────────────────────────── */
const POOL_IMG        = "/pool-silhouettes.png";
const CITY_BG         = "/bg-cyberpunk.png";
const PHILOSOPHY_BG   = "/bg-philosophy.webp";
const NAV_LOGO        = "/logo-pink.png";
const FAQ_ITEMS = [
  {
    q: "配吗是怎么帮我找到人的？",
    a: "我们会先读取你的照片、问卷和互动反馈，再从候选池里做多维匹配。你不会面对长列表，而是被引导去认识那个最值得先聊的人。",
  },
  {
    q: "整个流程大概是怎样的？",
    a: "先建立第一印象，再完成更深入的偏好问卷，系统随后生成候选池并逐步缩小范围，最后只给你一个最值得认真认识的人。",
  },
  {
    q: "在见面或开始聊天前，我会知道对方什么信息？",
    a: "你会先知道足够帮助你建立感觉的信息，比如氛围、外在印象和部分偏好。更深入的内容会随着匹配进展逐步解锁，不会一次性全部摊开。",
  },
  {
    q: "如果我对这次匹配没有感觉怎么办？",
    a: "可以直接反馈。系统会把你的选择视作新的偏好信号，帮助下一轮推荐更准确，而不是把一次不合适当成失败。",
  },
  {
    q: "平台上的人都是什么样的？",
    a: "当前以内测用户和通过基础资料审核的真实用户为主。我们更看重认真程度、表达意愿和长期关系可能性，而不是只看标签。",
  },
  {
    q: "通常多久能收到结果？",
    a: "取决于当前候选池活跃度和你资料的完整程度。资料越完整、反馈越明确，系统越容易更快给出高质量结果。",
  },
];


/** Lock icon SVG */
function LockIcon() {
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
      <rect x="2" y="10" width="16" height="13" rx="3" fill="rgba(255,255,255,0.28)"/>
      <path d="M6 10V7a4 4 0 018 0v3" stroke="rgba(255,255,255,0.28)" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

/**
 * Pool visualisation — the actual silhouette image split into three zones:
 *   left 35%  → 2 clear figures (unlocked)
 *   middle 33% → 2 blurred figures
 *   right 32%  → 2 dark-locked figures
 */
function PoolVisual() {
  return (
    <div className="relative rounded-2xl overflow-hidden animate-slide-up"
         style={{
           width: '100%', maxWidth: '340px',
           animationDelay: '0.1s',
           boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
         }}>
      {/* ── The image ── */}
      <img src={POOL_IMG} alt="候选池" style={{ width: '100%', display: 'block' }} />

      {/* ── Zone 2: lightly veiled middle (slightly left-shifted) ── */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: '36%', width: '30%',
        backdropFilter: 'blur(2px)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(160,120,255,0.08) 100%)',
      }}/>

      {/* ── Zone 3: locked right (blue + purple) — overlaps the blur edge a bit ── */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: '66%', right: '-1px',
        background: 'linear-gradient(180deg, rgba(12,6,28,0.72) 0%, rgba(8,4,20,0.86) 100%)',
      }}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '44%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '18px',
        }}>
          <LockIcon />
          <LockIcon />
        </div>
      </div>

      {/* ── Bottom fade to merge into dark page ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '22%', pointerEvents: 'none',
        background: 'linear-gradient(0deg, rgba(13,13,26,0.45) 0%, transparent 100%)',
      }}/>

      {/* ── Side edge fades ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(90deg, rgba(13,13,26,0.24) 0%, transparent 14%, transparent 86%, rgba(13,13,26,0.24) 100%)',
      }}/>

      {/* ── Zone labels ── */}
      {[
        { label: '已解锁', left: '0%',   width: '36%' },
        { label: '朦胧中', left: '36%',  width: '30%' },
        { label: '待解锁', left: '66%',  width: '34%' },
      ].map(({ label, left, width }) => (
        <div key={label} style={{
          position: 'absolute', bottom: '10px', left, width,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: '9px', letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.72)',
            background: 'rgba(0,0,0,0.24)',
            padding: '2px 8px', borderRadius: '99px',
          }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function SectionBackdrop({
  imageSrc = CITY_BG,
  imagePosition = "center center",
  blur = "3px",
  brightness = 0.6,
  scale = 1.03,
  overlay,
  noiseOpacity = 0.08,
  accent,
  /** Fade-to-dark band at section's top + bottom for seamless transitions */
  bridgeColor = "#070914",
  bridgeTop = "180px",
  bridgeBottom = "180px",
}) {
  return (
    <>
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url("${imageSrc}")`,
          backgroundSize: "cover",
          backgroundPosition: imagePosition,
          filter: `blur(${blur}) brightness(${brightness}) saturate(0.96)`,
          transform: `scale(${scale})`,
        }}
      />
      <div
        className="absolute inset-0 z-0"
        style={{
          background: overlay,
        }}
      />
      <div
        className="absolute inset-0 z-0"
        style={{
          opacity: noiseOpacity,
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.4\'/%3E%3C/svg%3E")',
          backgroundSize: "128px",
        }}
      />
      {accent ? (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={accent}
        />
      ) : null}
      {/* Edge bridges: fade to a shared dark color so adjacent sections blend */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: `linear-gradient(180deg, ${bridgeColor} 0%, transparent ${bridgeTop}, transparent calc(100% - ${bridgeBottom}), ${bridgeColor} 100%)`,
        }}
      />
    </>
  );
}

function FooterLink({ children }) {
  return (
    <Link to="/" className="text-white/78 transition-colors hover:text-white">
      {children}
    </Link>
  );
}

function SocialButton({ label, children }) {
  return (
    <Link
      to="/"
      aria-label={label}
      className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/68 transition-all hover:border-white/24 hover:bg-white/[0.08] hover:text-white"
    >
      {children}
    </Link>
  );
}

function InstagramIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.2" cy="6.9" r="1.2" fill="currentColor" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14.4 4.2c.55 1.62 1.74 2.97 3.34 3.8 1 .52 2.08.8 3.16.82v3.1a9.4 9.4 0 01-4.1-.95v4.85c0 3.9-3.02 6.68-6.78 6.68-3.23 0-5.92-2.47-5.92-5.63 0-3.5 2.98-5.95 6.36-5.95.36 0 .72.03 1.07.1v3.18a3.38 3.38 0 00-1.07-.18c-1.64 0-3.1 1.07-3.1 2.85 0 1.61 1.24 2.69 2.73 2.69 1.82 0 2.97-1.2 2.97-3.42V4.2h1.34z"
        fill="currentColor"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 4.5h3.4l4.1 5.6 4.78-5.6H20l-6.05 7.08L20 19.5h-3.4l-4.37-5.88L7.18 19.5H4.4l6.38-7.48L5 4.5z" fill="currentColor" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M5.2 7.4L10 12.2l4.8-4.8"
        stroke="#ff4fab"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LandingPage() {
  const joined = useCountUp(12847);
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="relative min-h-dvh overflow-x-hidden flex flex-col" style={{ background: "#070914" }}>
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        aria-hidden="true"
      >
        <SectionBackdrop
          imagePosition="center 42%"
          blur="0.8px"
          brightness={0.80}
          scale={1.03}
          overlay="linear-gradient(180deg, rgba(6,10,24,0.38) 0%, rgba(8,8,26,0.14) 26%, rgba(8,5,20,0.20) 74%, rgba(5,4,14,0.46) 100%), radial-gradient(ellipse 78% 58% at 50% 18%, rgba(110,128,216,0.10) 0%, rgba(20,16,44,0.04) 42%, rgba(8,5,20,0.22) 100%)"
          noiseOpacity={0.05}
          bridgeTop="0px"
          bridgeBottom="0px"
          accent={{
            background:
              "radial-gradient(circle at 22% 14%, rgba(255,107,157,0.12) 0%, transparent 22%), radial-gradient(circle at 78% 16%, rgba(196,77,255,0.12) 0%, transparent 22%)",
          }}
        />
      </div>

      <div className="relative z-10">
        <section className="h-dvh flex flex-col">
            {/* ── Nav ─────────────────────────────────────────────── */}
            <nav className="relative z-10 flex items-center justify-between px-6 py-5">
              <img
                src={NAV_LOGO}
                alt="配吗"
                className="h-12 w-auto object-contain"
                style={{ filter: "drop-shadow(0 6px 18px rgba(255,108,168,0.22))" }}
              />
              <div className="flex items-center gap-3">
                <Link to="/login"
                      className="px-5 py-2 rounded-full text-sm font-medium text-white/80 border border-white/20 hover:border-white/50 transition-all"
                      style={{ background: 'rgba(255,255,255,0.06)' }}>
                  登录
                </Link>
                <Link to="/login?mode=register"
                      className="px-5 py-2 rounded-full text-sm font-bold text-white transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #ff6b9d, #c44dff)', boxShadow: '0 4px 20px rgba(255,107,157,0.4)' }}>
                  立即加入
                </Link>
              </div>
            </nav>

            {/* ── Hero ─────────────────────────────────────────────── */}
            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
              {/* Main headline */}
              <h1 className="font-serif text-white leading-tight mb-6 animate-slide-up"
                  style={{ fontSize: 'clamp(2.8rem, 8vw, 5.5rem)', fontWeight: 800, letterSpacing: '-0.02em' }}>
                你的另一半，<br />
                <span style={{ color: '#ff6b9d', fontStyle: 'italic' }}>AI 已经认识了</span>
              </h1>

              <p className="text-white/50 text-base mb-10 max-w-xs animate-slide-up" style={{ animationDelay: '0.05s' }}>
                系统为你生成专属候选，<br />你只需要用心感受
              </p>

              {/* Preview pool visual */}
              <div className="flex flex-col items-center w-full px-4 mb-10">
                <p className="text-xs text-white/30 uppercase tracking-widest mb-4">你的专属候选池</p>
                <PoolVisual />
                <p className="text-white/20 text-xs mt-3">6 人候选 · AI 筛选 · 每次只给你最值得的一个</p>
              </div>

              {/* Social proof */}
              <div className="flex flex-col items-center gap-1 mb-10 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                <p className="text-white/35 text-sm">
                  已有 <span className="text-white/80 font-semibold tabular-nums">{joined.toLocaleString()}</span> 人加入
                </p>
              </div>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-3 items-center animate-slide-up" style={{ animationDelay: '0.3s' }}>
                <Link to="/login?mode=register"
                      className="px-8 py-4 rounded-full text-base font-bold text-white transition-all hover:scale-105 hover:opacity-95"
                      style={{ background: 'linear-gradient(135deg, #ff6b9d, #c44dff)', boxShadow: '0 8px 32px rgba(255,107,157,0.45)' }}>
                  免费加入 →
                </Link>
                <Link to="/login"
                      className="px-8 py-4 rounded-full text-base font-medium text-white/70 border border-white/20 hover:border-white/40 hover:text-white transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)' }}>
                  已有账号，登录
                </Link>
              </div>
            </main>
        </section>

        {/* ── How It Works ─────────────────────────────────────── */}
        <section className="min-h-dvh flex items-center px-6 py-20">
          <div className="relative z-10 w-full max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs text-white/30 uppercase tracking-[0.22em] mb-4">How it works</p>
              <h2 className="font-serif text-white"
                  style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', fontWeight: 800, letterSpacing: '-0.02em' }}>
                从陌生到<span style={{ color: '#ff6b9d', fontStyle: 'italic' }}> 刚好合适</span>
              </h2>
              <p className="text-white/45 text-base mt-3 max-w-md mx-auto">
                四步，带你抵达那个"刚刚好"的人
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[
                { n: "01", Icon: ImageIcon, title: "建立第一印象",
                  desc: "上传你的照片，让系统真实感知外在气质与风格" },
                { n: "02", Icon: Sparkles, title: "生成专属候选池",
                  desc: "AI 从全库为你精选 6 人：两个清晰、两个朦胧、两个待解锁" },
                { n: "03", Icon: FileText, title: "深度问卷 · 层层解锁",
                  desc: "根据问卷交叉打分，候选从外在到价值观逐步被揭示" },
                { n: "04", Icon: Heart, title: "只给你那一个",
                  desc: "所有维度综合后，系统只呈现一个最值得认真认识的人" },
              ].map(({ n, Icon, title, desc }) => (
                <div key={n} className="glass rounded-3xl p-6 flex gap-4 items-start"
                     style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  <div className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                       style={{ background: 'linear-gradient(135deg, rgba(255,107,157,0.22) 0%, rgba(196,77,255,0.18) 100%)',
                                border: '1px solid rgba(255,255,255,0.10)' }}>
                    <Icon size={20} strokeWidth={1.7} className="text-white/90" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-white/35 tracking-widest mb-1">Step {n}</p>
                    <p className="text-white font-semibold text-base mb-1.5">{title}</p>
                    <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── Tired of Swiping? — 告别无尽左滑 ───────────────── */}
      <section className="relative overflow-hidden min-h-dvh flex items-center px-6 py-20">
        <SectionBackdrop
          imageSrc="/bg-tired.png"
          imagePosition="center center"
          blur="1.2px"
          brightness={0.68}
          scale={1.05}
          overlay="linear-gradient(180deg, rgba(8,10,22,0.48) 0%, rgba(6,8,20,0.62) 60%, rgba(4,5,14,0.82) 100%)"
          noiseOpacity={0.04}
        />
        <div className="relative z-10 mx-auto w-full max-w-5xl text-center">
          <p className="text-xs text-white/30 uppercase tracking-[0.22em] mb-4">Why 配吗</p>
          <h2 className="font-serif text-white mb-4"
              style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            受够了<span style={{ color: '#ff6b9d', fontStyle: 'italic' }}> 无尽左滑</span>？
          </h2>
          <p className="text-white/45 text-base max-w-md mx-auto mb-14">
            别再当人海里的筛选工。我们替你做繁重的判断，你只管感受。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
            {/* 配吗 card */}
            <div className="glass rounded-3xl p-7 border border-pink-300/20"
                 style={{ background: 'linear-gradient(160deg, rgba(255,107,157,0.10) 0%, rgba(196,77,255,0.05) 100%)' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-glow flex-shrink-0"
                     style={{ background: 'linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)' }}>
                  <span className="text-lg">✦</span>
                </div>
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-widest">配吗</p>
                  <h3 className="text-white font-semibold text-lg">一份精心准备的邀约</h3>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm text-white/75">
                {[
                  "AI 已读懂你，不用自己翻人海",
                  "不用开场白，信息先于聊天到位",
                  "一次只有一个，每一个都值得认真",
                  "反馈一次 Ta 就懂你多一点",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span style={{ color: '#ff8ec4' }} className="flex-shrink-0 mt-0.5">✓</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 传统软件 card */}
            <div className="glass rounded-3xl p-7 border border-white/8"
                 style={{ background: 'rgba(255,255,255,0.025)' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                     style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  <span className="text-lg text-white/40">×</span>
                </div>
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-widest">传统交友软件</p>
                  <h3 className="text-white/70 font-semibold text-lg">无尽左滑与客套闲聊</h3>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm text-white/45">
                {[
                  "两小时刷下来，一个都没记住",
                  "想要的信息藏在 10 段对话之后",
                  "选择太多，就干脆什么都不选",
                  "照片越好看越可疑，越难信任",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="flex-shrink-0 mt-0.5 text-white/30">×</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Philosophy section ───────────────────────────────── */}
      <section className="relative overflow-hidden min-h-dvh flex items-center px-6 py-20 text-center">
        <SectionBackdrop
          imageSrc={PHILOSOPHY_BG}
          imagePosition="center 78%"
          blur="1.2px"
          brightness={0.56}
          scale={1.02}
          overlay="linear-gradient(180deg, rgba(8,6,18,0.62) 0%, rgba(8,6,18,0.5) 42%, rgba(5,4,14,0.72) 100%), radial-gradient(ellipse 70% 52% at 50% 18%, rgba(164,84,255,0.12) 0%, rgba(12,10,28,0.06) 38%, rgba(5,4,14,0.48) 100%)"
          noiseOpacity={0.05}
        />
        <div className="relative z-10 w-full">
        <h2 className="font-serif text-white mb-4"
            style={{ fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', fontWeight: 800 }}>
          先有没有<span style={{ color: '#ff6b9d', fontStyle: 'italic' }}>感觉</span>
        </h2>
        <p className="text-white/40 text-base mb-12 max-w-md mx-auto leading-relaxed">
          再合不合适，最后能不能走下去
        </p>
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { Icon: Eye,    title: "第一感觉优先", desc: "外在吸引力是真实的起点，我们不绕开它" },
            { Icon: Brain,  title: "AI 深度分析",  desc: "性格、价值观、生活方式全维度交叉匹配" },
            { Icon: Target, title: "只推一个人",   desc: "不是列表，不是筛选 — 就是那一个人" },
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg, rgba(255,107,157,0.22) 0%, rgba(196,77,255,0.18) 100%)',
                            border: '1px solid rgba(255,255,255,0.12)' }}>
                <Icon size={26} strokeWidth={1.6} className="text-white/90" />
              </div>
              <p className="text-white font-semibold">{title}</p>
              <p className="text-white/45 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <Link to="/login?mode=register"
              className="inline-block mt-12 px-10 py-4 rounded-full text-base font-bold text-white transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #ff6b9d, #c44dff)', boxShadow: '0 8px 32px rgba(255,107,157,0.4)' }}>
          现在加入 →
        </Link>
        </div>
      </section>

      <PersonalizedMatchmakerShowcase embedded />

      {/* ── Verified · Private · Safe ───────────────────────── */}
      <section className="relative overflow-hidden min-h-dvh flex items-center px-6 py-20">
        <SectionBackdrop
          imageSrc="/bg-trust.png"
          imagePosition="center center"
          blur="1.2px"
          brightness={0.64}
          scale={1.03}
          overlay="linear-gradient(180deg, rgba(8,6,20,0.30) 0%, rgba(6,6,18,0.18) 32%, rgba(5,4,14,0.52) 100%)"
          noiseOpacity={0.04}
        />
        <div className="relative z-10 mx-auto w-full max-w-5xl text-center">
          <p className="text-xs text-white/30 uppercase tracking-[0.22em] mb-4">Trust</p>
          <h2 className="font-serif text-white mb-4"
              style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            真实 · <span style={{ color: '#ff6b9d', fontStyle: 'italic' }}>私密</span> · 安全
          </h2>
          <p className="text-white/45 text-base max-w-md mx-auto mb-14">
            我们在意的不是数量，是你每一次相遇的质量。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                Icon: ShieldCheck,
                title: "实名认证",
                desc: "手机号注册 + 人工审核机制。虚假资料无处遁形，每个出现在你面前的都是真人。",
              },
              {
                Icon: Lock,
                title: "隐私保护",
                desc: "你的照片、位置、兴趣只在匹配后逐步解锁。除了那个真正合适的人，没人能完整看到你。",
              },
              {
                Icon: MapPin,
                title: "线下可达",
                desc: "城市精选，匹配时优先你身边的人。认识不是为了在屏幕上多聊几句，而是真的见一面。",
              },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="glass rounded-3xl p-7 text-left"
                   style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                     style={{ background: 'linear-gradient(135deg, rgba(255,107,157,0.22) 0%, rgba(196,77,255,0.18) 100%)',
                              border: '1px solid rgba(255,255,255,0.12)' }}>
                  <Icon size={22} strokeWidth={1.6} className="text-white/90" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-white/55 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative min-h-dvh overflow-hidden px-6 py-20 text-white md:px-10 lg:px-16">
        <SectionBackdrop
          imageSrc="/bg-faq.png"
          imagePosition="center 65%"
          blur="0.8px"
          brightness={0.66}
          scale={1.03}
          overlay="linear-gradient(180deg, rgba(6,8,22,0.28) 0%, rgba(6,8,22,0.18) 28%, rgba(5,4,14,0.44) 100%), radial-gradient(ellipse 70% 48% at 50% 46%, rgba(8,6,22,0.12) 0%, rgba(5,4,14,0.32) 100%)"
          noiseOpacity={0.04}
        />

        <div className="relative z-10 mx-auto max-w-[1440px]">
          <div className="flex justify-center">
            <div
              className="inline-block rotate-[-1deg] bg-black/88 px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.42)]"
              style={{ boxShadow: "0 12px 30px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.05)" }}
            >
              <h2
                className="text-white"
                style={{
                  fontFamily: '"Baskerville", "Times New Roman", Georgia, serif',
                  fontSize: "clamp(1.4rem, 2.8vw, 2.3rem)",
                  lineHeight: 0.92,
                  letterSpacing: "-0.05em",
                  fontWeight: 600,
                }}
              >
                FAQ
              </h2>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-[1120px] rounded-[34px] border border-white/14 bg-[linear-gradient(90deg,rgba(10,45,76,0.88)_0%,rgba(7,36,60,0.84)_44%,rgba(5,26,42,0.92)_100%)] px-8 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur-sm md:px-10">
            {FAQ_ITEMS.map((item, index) => {
              const open = openFaq === index;
              return (
                <button
                  key={item.q}
                  type="button"
                  onClick={() => setOpenFaq(open ? -1 : index)}
                  className="block w-full border-b border-white/10 py-6 text-left last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-[clamp(0.95rem,1.45vw,1.35rem)] leading-[1.15] tracking-[-0.02em] text-white">
                      {item.q}
                    </span>
                    <span className="flex-shrink-0">
                      <ChevronIcon open={open} />
                    </span>
                  </div>
                  <div
                    className={`grid overflow-hidden transition-all duration-300 ${open ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                  >
                    <div className="min-h-0">
                      <p className="max-w-[760px] text-xs leading-6 text-white/64 md:text-sm">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="relative z-10 overflow-hidden px-6 py-12 text-white md:px-10 lg:px-16 lg:py-16">
        <div className="absolute inset-0 bg-[#050811]" aria-hidden="true" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,107,157,0.08),transparent_18%),radial-gradient(circle_at_82%_20%,rgba(98,122,255,0.07),transparent_20%)]" aria-hidden="true" />
        <div className="relative z-10 mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[1.2fr_0.9fr] lg:items-start">
          <div className="space-y-8">
            <div
              className="inline-block max-w-[360px] rounded-[28px] bg-white px-6 py-4 text-[#11131b] shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
              style={{ borderBottomLeftRadius: "10px" }}
            >
              <p className="text-[clamp(1.45rem,2.3vw,2.4rem)] font-medium leading-[1.08] tracking-[-0.04em]">
                一个会替你先看见心动的人。
              </p>
            </div>

            <div className="space-y-5">
              <h3
                className="text-white"
                style={{
                  fontFamily: '"Baskerville", "Times New Roman", Georgia, serif',
                  fontSize: "clamp(2.7rem, 5vw, 5rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.06em",
                }}
              >
                配吗
              </h3>

              <div className="flex items-center gap-4">
                <SocialButton label="Instagram">
                  <InstagramIcon />
                </SocialButton>
                <SocialButton label="TikTok">
                  <TikTokIcon />
                </SocialButton>
                <SocialButton label="X">
                  <XIcon />
                </SocialButton>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-10 lg:items-end">
            <div className="space-y-5 text-left lg:min-w-[220px]">
              <p className="text-sm uppercase tracking-[0.18em] text-white/34">Resources</p>
              <div className="flex flex-col gap-4 text-[1.05rem]">
                <FooterLink>关于我们 ↗</FooterLink>
                <FooterLink>使用说明 ↗</FooterLink>
                <FooterLink>加入内测 ↗</FooterLink>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-base text-white/78 lg:justify-end">
              <span className="text-white/42">© 配吗 2026</span>
              <FooterLink>条款</FooterLink>
              <FooterLink>隐私</FooterLink>
              <FooterLink>Cookies</FooterLink>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
