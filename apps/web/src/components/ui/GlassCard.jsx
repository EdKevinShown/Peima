export default function GlassCard({ children, className = "", as: Tag = "section" }) {
  return (
    <Tag className={`glass rounded-2xl p-4 sm:p-5 ${className}`}>{children}</Tag>
  );
}
