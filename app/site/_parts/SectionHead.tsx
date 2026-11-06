/** 官网区块标题：eyebrow + 大标题 + 右侧导语 */
export function SiteSectionHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <div className="s-head reveal">
      <div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>
      <p>{lead}</p>
    </div>
  );
}
