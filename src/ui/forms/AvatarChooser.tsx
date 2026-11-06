"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { AVATARS, avatarUrl } from "@/avatars";
import { Avatar } from "../Avatar";
import { useDropdown } from "../useDropdown";

/** 预设头像网格：点一个即选中（建档和改头像共用） */
function AvatarGrid({ selected, onPick, size = 44 }: { selected?: string; onPick: (id: string) => void; size?: number }) {
  return (
    <div className="avatar-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
      {AVATARS.map((id) => (
        <button key={id} type="button" className={selected === id ? "on" : ""} aria-label={id} aria-pressed={selected === id} onClick={() => onPick(id)}>
          <img src={avatarUrl(id)} alt="" width={size} height={size} />
        </button>
      ))}
    </div>
  );
}

/** 建档表单里的头像：显示当前选中的，点开换；值通过隐藏字段 name="avatar" 提交 */
export function AvatarField({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const t = useTranslations("app.newMember");
  const dd = useDropdown();
  if (!AVATARS.length) return null;
  return (
    <div className="a-av-field" ref={dd.ref}>
      <input type="hidden" name="avatar" value={value ?? ""} />
      <button type="button" className="a-av-trigger" aria-expanded={dd.open} title={t("avatarPick")} onClick={() => dd.setOpen(!dd.open)}>
        {value ? <img src={avatarUrl(value)} alt="" width={30} height={30} /> : null}
        <span>{t("avatar")}</span>
      </button>
      {dd.open && (
        <div className="a-av-pop" role="dialog" aria-label={t("avatarPick")}>
          <AvatarGrid selected={value} onPick={(id) => { onChange(id); dd.setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

/** 概览标题旁的家人头像：点开选一个，立即保存 */
export function MemberAvatarEditor({ name, avatar, action }: { name: string; avatar?: string; action: (avatar: string) => Promise<unknown> }) {
  const t = useTranslations("app.member");
  const dd = useDropdown();
  const [pending, start] = useTransition();
  return (
    <span className="a-av-edit" ref={dd.ref}>
      <button type="button" aria-label={t("changeAvatar")} title={t("changeAvatar")} aria-expanded={dd.open} disabled={pending} onClick={() => dd.setOpen(!dd.open)}>
        <Avatar id={name} name={name} size={52} src={avatar ? avatarUrl(avatar) : undefined} />
      </button>
      {dd.open && (
        <div className="a-av-pop" role="dialog" aria-label={t("changeAvatar")}>
          <AvatarGrid selected={avatar} onPick={(id) => { dd.setOpen(false); start(async () => { await action(id); }); }} />
        </div>
      )}
    </span>
  );
}
