import { Link } from "react-router-dom";
import { PersonStanding, Footprints, Music } from "lucide-react";

const CITY_BG       = "/bg-cyberpunk.png";
const BG_MATCHMAKER = "/bg-matchmaker.png";
const LOGO_IMG      = "/logo-pink.png";

function FloatingBackdrop({ imageSrc = CITY_BG, soft = false }) {
  const filter = soft
    ? "blur(0.8px) brightness(0.74) saturate(1.05)"
    : "blur(5px) brightness(0.50) saturate(0.88)";
  const overlay = soft
    ? "linear-gradient(180deg, rgba(6,8,20,0.18) 0%, rgba(6,8,20,0.22) 40%, rgba(4,5,14,0.48) 100%), radial-gradient(ellipse 70% 44% at 50% 50%, rgba(6,8,20,0.05) 0%, rgba(4,5,14,0.30) 100%)"
    : "linear-gradient(180deg, rgba(6,8,20,0.28) 0%, rgba(6,8,20,0.32) 34%, rgba(4,5,14,0.5) 72%, rgba(4,5,14,0.78) 100%), radial-gradient(circle at 50% 18%, rgba(130,150,240,0.18) 0%, rgba(8,12,28,0.06) 28%, rgba(5,6,16,0.22) 56%, rgba(4,5,14,0.74) 100%)";
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${imageSrc}")`,
          backgroundSize: "cover",
          backgroundPosition: soft ? "center center" : "center 26%",
          filter,
          transform: soft ? "scale(1.02)" : "scale(1.06)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: overlay }}
      />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(circle at 12% 26%, rgba(255,96,164,0.26) 0%, transparent 14%), radial-gradient(circle at 84% 24%, rgba(113,138,255,0.18) 0%, transparent 18%), radial-gradient(circle at 52% 16%, rgba(255,255,255,0.08) 0%, transparent 12%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.84\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.45\'/%3E%3C/svg%3E")',
          backgroundSize: "160px",
        }}
      />
      <div className="absolute inset-y-0 left-0 w-[22%] bg-gradient-to-r from-black/55 via-black/24 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-[14%] bg-gradient-to-l from-black/28 via-black/6 to-transparent" />
      {/* Edge bridges (only when embedded — blends with adjacent sections) */}
      {soft ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, #070914 0%, transparent 180px, transparent calc(100% - 180px), #070914 100%)",
          }}
        />
      ) : null}
    </>
  );
}

function RibbonTitle() {
  return (
    <div className="flex justify-center px-4">
      <div
        className="inline-block rotate-[-1.2deg] bg-black/86 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)" }}
      >
        <h1
          className="text-center leading-[0.92] text-white"
          style={{
            fontFamily: '"Baskerville", "Times New Roman", Georgia, serif',
            fontSize: "clamp(1.85rem, 4.2vw, 3.75rem)",
            fontWeight: 600,
            letterSpacing: "-0.05em",
          }}
        >
          你的专属
          <br />
          <span style={{ color: "#ff4fab" }}>AI 红娘</span>
        </h1>
      </div>
    </div>
  );
}

function ResearchVisual() {
  return (
    <div className="relative mx-auto h-[260px] w-[240px]">
      <div
        className="absolute left-6 top-8 h-[178px] w-[132px] rounded-[4px] border border-[#f1d8d1]/30 bg-[#f0e1d8]/92 p-3 text-[#a84b59] shadow-[0_18px_42px_rgba(0,0,0,0.34)]"
        style={{ transform: "rotate(-7deg)" }}
      >
        <p
          className="uppercase leading-[0.94]"
          style={{
            fontFamily: '"Arial Narrow", "Helvetica Neue", sans-serif',
            fontSize: "0.72rem",
            fontWeight: 900,
            letterSpacing: "0.03em",
          }}
        >
          真实撮合
          <br />
          经验
        </p>
        <div className="mt-4 rounded-[2px] bg-white/92 p-2 shadow-[0_12px_18px_rgba(0,0,0,0.16)]">
          <div className="h-[72px] w-full rounded-[2px] bg-gradient-to-br from-[#c58c78] via-[#f1d1be] to-[#8f5e5e]" />
          <p className="mt-1 text-[0.58rem] font-bold tracking-[0.12em] text-black/60">配吗实验室</p>
        </div>
      </div>
      <div
        className="absolute right-5 top-2 h-[196px] w-[140px] rounded-[4px] border border-[#8ca0ff]/35 bg-[#4053da]/90 p-3 text-white shadow-[0_18px_42px_rgba(0,0,0,0.38)]"
        style={{ transform: "rotate(8deg)" }}
      >
        <p
          className="leading-[0.92]"
          style={{
            fontFamily: '"Arial Narrow", "Helvetica Neue", sans-serif',
            fontSize: "0.78rem",
            fontWeight: 900,
            letterSpacing: "0.01em",
          }}
        >
          认知匹配
          <br />
          研究
        </p>
        <div className="mt-4 rounded-[3px] border border-white/16 bg-[#1c2554]/95 p-2">
          <div className="h-[78px] rounded-[2px] border border-white/18 bg-gradient-to-br from-[#0b1028] via-[#495886] to-[#161b31]" />
          <div className="mt-2 h-[8px] w-[62px] rounded-full bg-white/28" />
        </div>
      </div>
    </div>
  );
}

function ScannerVisual() {
  return (
    <div className="relative mx-auto h-[260px] w-[210px]">
      <PersonStanding className="absolute left-[-6px] top-[76px] text-pink-300/80" size={20} strokeWidth={1.6} />
      <Footprints     className="absolute right-[-2px] top-[116px] text-violet-300/80" size={20} strokeWidth={1.6} />
      <Music          className="absolute left-[18px] bottom-[14px] text-pink-300/80" size={20} strokeWidth={1.6} />

      <div
        className="absolute inset-x-[28px] top-0 h-[234px] rounded-[4px] border border-[#ff4fab]/48 bg-black/28 p-3 shadow-[0_20px_40px_rgba(0,0,0,0.42)]"
        style={{
          boxShadow: "0 20px 40px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(255,79,171,0.1)",
        }}
      >
        <div
          className="relative h-full w-full overflow-hidden rounded-[2px] border border-[#ff4fab]/26"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,203,164,0.88) 0%, rgba(228,164,182,0.84) 32%, rgba(78,18,48,0.88) 100%)",
          }}
        >
          <div
            className="absolute inset-0 opacity-80"
            style={{
              background:
                "radial-gradient(circle at 50% 32%, rgba(46,28,28,0.88) 0%, rgba(46,28,28,0.88) 12%, transparent 13%), radial-gradient(circle at 50% 58%, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.78) 20%, transparent 21%), linear-gradient(180deg, transparent 0%, transparent 16%, rgba(255,255,255,0.18) 16%, rgba(255,255,255,0.18) 17%, transparent 17%, transparent 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
              backgroundSize: "8px 8px",
              mixBlendMode: "overlay",
              opacity: 0.34,
            }}
          />
          <div className="absolute left-[48%] top-0 h-full w-[2px] bg-[#ff4fab]/64" />
          <div className="absolute left-0 top-[44%] h-[2px] w-full bg-[#ff4fab]/56" />
        </div>

        {[
          "left-0 top-0 border-l-4 border-t-4",
          "right-0 top-0 border-r-4 border-t-4",
          "left-0 bottom-0 border-l-4 border-b-4",
          "right-0 bottom-0 border-r-4 border-b-4",
        ].map((cls) => (
          <div
            key={cls}
            className={`absolute h-4 w-4 ${cls} border-[#ff4fab]`}
          />
        ))}
      </div>
    </div>
  );
}

function TvVisual() {
  return (
    <div className="relative mx-auto h-[260px] w-[250px]">
      <div className="absolute left-[50%] top-0 h-7 w-[2px] -translate-x-[50%] bg-black/60" />
      <div className="absolute left-[56%] top-[8px] h-6 w-[2px] -translate-x-[50%] rotate-[18deg] bg-black/50" />
      <div className="absolute left-[44%] top-[8px] h-6 w-[2px] -translate-x-[50%] rotate-[-18deg] bg-black/50" />
      <div className="absolute inset-x-0 top-7 h-[192px] rounded-[18px] border border-white/12 bg-[#1a1a1f]/95 p-4 shadow-[0_26px_54px_rgba(0,0,0,0.5)]">
        <div className="h-full rounded-[10px] border border-white/10 bg-[#151519] p-3 shadow-[inset_0_2px_16px_rgba(255,255,255,0.04)]">
          <div
            className="relative h-full overflow-hidden rounded-[6px] border border-white/10"
            style={{
              background:
                "linear-gradient(180deg, rgba(213,213,213,0.94) 0%, rgba(102,102,102,0.92) 100%)",
            }}
          >
            <div
              className="absolute inset-0 opacity-65"
              style={{
                background:
                  "radial-gradient(circle at 20% 18%, rgba(0,0,0,0.68) 0%, transparent 14%), radial-gradient(circle at 78% 26%, rgba(0,0,0,0.74) 0%, transparent 14%), radial-gradient(circle at 44% 72%, rgba(0,0,0,0.8) 0%, transparent 16%), radial-gradient(circle at 70% 64%, rgba(0,0,0,0.74) 0%, transparent 16%), radial-gradient(circle at 50% 48%, rgba(0,0,0,0.9) 0%, transparent 18%)",
              }}
            />
            <div className="absolute left-[50%] top-[22%] h-[86px] w-[24px] -translate-x-[50%] rounded-[4px] bg-[#ff7abf]/88 shadow-[0_0_20px_rgba(255,122,191,0.45)]" />
            <div
              className="absolute inset-0 opacity-24"
              style={{
                backgroundImage: "linear-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)",
                backgroundSize: "100% 6px",
              }}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between px-1 text-[0.55rem] tracking-[0.18em] text-white/36">
          <span>候选雷达</span>
          <span>AI-01</span>
        </div>
      </div>
    </div>
  );
}

function FeatureColumn({ title, children }) {
  return (
    <div className="flex flex-col items-center justify-start text-center">
      <h2
        className="mb-10 max-w-[12ch] text-white"
        style={{
          fontFamily: '"Baskerville", "Times New Roman", Georgia, serif',
          fontSize: "clamp(1.6rem, 2.8vw, 2.9rem)",
          lineHeight: 0.95,
          letterSpacing: "-0.06em",
          fontWeight: 500,
          textShadow: "0 8px 32px rgba(0,0,0,0.36)",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

export function PersonalizedMatchmakerShowcase({ embedded = false }) {
  return (
    <section className="relative min-h-dvh overflow-hidden bg-[#04050f] text-white">
      <div className={`pointer-events-none inset-0 z-0 ${embedded ? "absolute" : "fixed"}`}>
        <FloatingBackdrop imageSrc={embedded ? BG_MATCHMAKER : CITY_BG} soft={embedded} />
      </div>

      <div className={`relative z-10 min-h-dvh px-6 pb-16 md:px-10 lg:px-16 ${embedded ? "pt-20" : "pt-6"}`}>
        {!embedded ? (
          <nav className="flex items-center justify-between">
            <Link to="/" className="inline-flex items-center">
              <img src={LOGO_IMG} alt="配吗" className="h-10 w-auto object-contain md:h-12" />
            </Link>
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="rounded-full border border-white/18 px-5 py-3 text-base font-medium text-white/86 transition-all hover:border-white/40 hover:bg-white/10"
                style={{ background: "rgba(141,160,198,0.18)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)" }}
              >
                登录
              </Link>
              <Link
                to="/login?mode=register"
                className="rounded-full bg-white px-6 py-3 text-base font-bold text-[#ff3fa1] transition-all hover:translate-y-[-1px] hover:shadow-[0_10px_30px_rgba(255,255,255,0.16)]"
              >
                立即加入
              </Link>
            </div>
          </nav>
        ) : null}

        <div className={`mx-auto max-w-[1440px] ${embedded ? "" : "mt-20 md:mt-24"}`}>
          <RibbonTitle />

          <div className="mt-20 grid gap-16 lg:grid-cols-3 lg:gap-10 xl:gap-16">
            <FeatureColumn title={<>基于真实研究<br />与撮合经验</>}>
              <ResearchVisual />
            </FeatureColumn>

            <FeatureColumn title={<>先读懂你的<br />偏好与心动</>}>
              <ScannerVisual />
            </FeatureColumn>

            <FeatureColumn title={<>在整个人群里<br />找到那个对的人</>}>
              <TvVisual />
            </FeatureColumn>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PersonalizedMatchmakerPage() {
  return <PersonalizedMatchmakerShowcase />;
}
