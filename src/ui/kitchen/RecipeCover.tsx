import { Camera, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Recipe } from "@/core/recipe";

type Cover = Pick<Recipe, "cover" | "cover_style" | "category">;
const coverUrl = (cover: string) => "/kitchen/files/" + cover.split("/").map(encodeURIComponent).join("/");

const paper = "var(--kitchen-paper)";
const clay = "var(--kitchen-clay)";
const sage = "var(--kitchen-sage)";

const dishes = {
  pot: (
    <>
      <path fill={clay} d="M87 81h86l-5 38q-4 12-38 12t-37-12z" />
      <path d="M87 89H77q-8 6 2 12h11m82-12h10q8 6-2 12h-10" />
      <ellipse fill={paper} cx="130" cy="80" rx="45" ry="11" />
      <path fill={sage} d="M94 78q33-31 71 0-31 12-71 0z" />
      <ellipse fill={clay} cx="129" cy="63" rx="7" ry="4" />
      <path d="M102 102q0 15 8 17" />
    </>
  ),
  wok: (
    <>
      <path fill={clay} d="M72 85q49 75 104 4l-5-6z" />
      <path fill={sage} d="m169 83 33-18q7 1 4 7l-32 19z" />
      <ellipse fill={paper} cx="121" cy="84" rx="48" ry="12" />
      <path fill={sage} d="m86 84 12-11 14 9-9 6zm30-4 10-14 15 11-9 10z" />
      <path fill={clay} d="m140 84 7-11 12 5-4 9z" />
    </>
  ),
  steamer: (
    <>
      <path fill={clay} d="M80 80h100v33q-50 25-100 0z" />
      <path d="M81 94q49 20 98 0m-97 10q49 21 97 0" />
      <ellipse fill={paper} cx="130" cy="80" rx="51" ry="17" />
      <g fill={sage}>
        <path d="M89 82q-1-11 16-18 18 10 14 19-13 6-30-1z" />
        <path d="M130 79q0-12 18-19 17 10 14 20-14 7-32-1z" />
      </g>
      <path d="m105 65-5 11m7-10 4 9m37-13-6 10m8-8 3 6" />
    </>
  ),
  bowl: (
    <>
      <path fill={sage} d="M75 84q11 46 54 46t55-46z" />
      <ellipse fill={paper} cx="130" cy="84" rx="55" ry="16" />
      <path fill={clay} d="M84 86q39-20 91 0-48 21-91 0z" />
      <path d="m110 82 9-4m23 7 7-5m-50 25q4 9 12 12" />
      <path fill={paper} d="m154 78 29-33q5-3 7 2l-30 34z" />
    </>
  ),
  plate: (
    <>
      <ellipse fill={sage} cx="130" cy="101" rx="61" ry="23" />
      <ellipse fill={paper} cx="130" cy="96" rx="61" ry="23" />
      <ellipse cx="130" cy="96" rx="47" ry="15" />
      <path fill={clay} d="M102 94q5-29 29-24 19-1 27 25-25 14-56-1z" />
      <path fill={sage} d="M128 75q-17-17-19-10 0 11 19 10zm1-1q7-19 20-17-1 12-20 17z" />
      <path d="m116 86 5-4m12 10 7-5" />
    </>
  ),
  cup: (
    <>
      <ellipse fill={sage} cx="125" cy="123" rx="46" ry="9" />
      <path fill={clay} d="M91 76h66l-5 39q-24 20-56 0z" />
      <path d="M158 83q29-5 19 15-6 10-21 8" />
      <ellipse fill={paper} cx="124" cy="76" rx="33" ry="9" />
      <path d="M102 77q21-8 44 0" />
    </>
  ),
};

const artByCategory = {
  炒菜: "wok", 炖菜: "pot", 蒸菜: "steamer", 汤羹: "bowl", 凉拌: "plate", 主食: "bowl", 早餐: "plate", 饮品: "cup",
} as const;

function DishArt({ category }: Pick<Cover, "category">) {
  return (
    <svg className="a-dish-art" viewBox="0 0 260 160" aria-hidden="true">
      <ellipse cx="131" cy="130" rx="63" ry="6" fill="var(--kitchen-ink-line)" />
      <g fill="none" stroke="var(--kitchen-pencil)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path stroke="var(--kitchen-steam)" d="M114 51c-10-10 7-15 0-26m18 25c-7-9 9-15 3-25m16 26c-6-7 7-11 4-18" />
        {dishes[category ? artByCategory[category] : "plate"]}
      </g>
    </svg>
  );
}

export function RecipeCover({ recipe, preview }: { recipe: Cover; preview?: string }) {
  const t = useTranslations("app.kitchen");
  const src = preview || (recipe.cover && coverUrl(recipe.cover));
  const photo = recipe.cover_style === "photo" && !!src;
  return (
    <div className={`a-recipe-cover ${photo ? "a-recipe-photo" : "a-recipe-comic"}`}>
      <div className="a-recipe-frame">
        {src ? <img src={src} alt="" loading="lazy" /> : <DishArt category={recipe.category} />}
      </div>
      {src && <span className="a-recipe-badge">{photo ? <Camera size={12} /> : <Pencil size={12} />}{t(photo ? "photo" : "comic")}</span>}
    </div>
  );
}
