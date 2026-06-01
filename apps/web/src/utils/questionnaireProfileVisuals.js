import {
  Activity,
  Baby,
  Briefcase,
  CircleHelp,
  Compass,
  Eye,
  Gauge,
  HandHeart,
  Heart,
  HeartHandshake,
  Home,
  MessageCircle,
  MessagesSquare,
  Shield,
  SlidersHorizontal,
  Sparkles,
  User,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

/** @type {Record<string, import("lucide-react").LucideIcon>} */
export const AXIS_ICONS = {
  attachmentStyle: Heart,
  emotionalExpression: Sparkles,
  communicationStyle: MessageCircle,
  conflictHandling: Zap,
  loveLanguage: HandHeart,
  securityNeed: Shield,
  controlNeed: SlidersHorizontal,
  independence: User,
  loyaltyView: Shield,
  jealousyTendency: Eye,
  moneyAttitude: Wallet,
  careerPriority: Briefcase,
  lifePace: Gauge,
  socialNeed: Users,
  emotionalStability: Activity,
  sexualValues: Heart,
  familyView: Home,
  marriageExpectation: HeartHandshake,
  childrenIntent: Baby,
  riskPreference: Compass,
};

/** @type {Record<string, import("lucide-react").LucideIcon>} */
export const GROUP_ICONS = {
  bond: Heart,
  daily: MessagesSquare,
  self: User,
  life: Wallet,
  future: Home,
};

export function getAxisIcon(axisKey) {
  return AXIS_ICONS[axisKey] ?? CircleHelp;
}

export function getGroupIcon(groupId) {
  return GROUP_ICONS[groupId] ?? CircleHelp;
}

/** 1–5 格，用于圆点强度条 */
export function strengthToLevel(strength, sortScore = 0) {
  if (strength === "较明显") return 5;
  if (strength === "略有倾向") return 3;
  if (strength === "尚在权衡") return 2;
  if (strength === "较均衡") return 2;
  if (sortScore >= 0.65) return 4;
  if (sortScore >= 0.5) return 3;
  return 2;
}

export function strengthAriaLabel(strength) {
  if (!strength) return "倾向强度未知";
  return `倾向强度：${strength}`;
}
