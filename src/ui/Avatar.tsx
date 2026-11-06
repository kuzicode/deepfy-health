const GRADIENTS = [
  "linear-gradient(135deg,#5eead4,#0f766e)",
  "linear-gradient(135deg,#93c5fd,#3e63dd)",
  "linear-gradient(135deg,#a7f3d0,#12a594)",
  "linear-gradient(135deg,#fbcfe8,#d6409f)",
  "linear-gradient(135deg,#fde68a,#d97706)",
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) | 0;
  return Math.abs(h);
}

/** 英文名取首字母；中文名取最后一个字（「小K」→ K）。跳过括号、标点、空格，避免出现「）」 */
const initial = (name: string) => {
  const chars = [...name].filter((c) => /[\p{L}\p{N}]/u.test(c));
  if (!chars.length) return "?";
  return /^[A-Za-z]/.test(chars[0]) ? chars[0].toUpperCase() : chars.at(-1);
};

/** 有预设头像（src）时显示图片，否则按 id 配色显示首字母 */
export function Avatar({ id, name, size = 36, src }: { id: string; name: string; size?: number; src?: string }) {
  if (src) return <img className="avatar avatar-img" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.44, background: GRADIENTS[hash(id) % GRADIENTS.length] }}>
      {initial(name)}
    </span>
  );
}
